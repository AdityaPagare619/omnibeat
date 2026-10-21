/**
 * Corpus builder + lock files.
 *
 * Seed corpus: packages/phonetic-core/packs/{en-US,hi-IN,es-US}/fixtures.jsonl
 * (input -> expected title pairs). 37 raw fixtures are below the required 40
 * utterances, so every fixture deterministically contributes ONE derived
 * variant (wake-word prefix / case / punctuation), giving >= 70 utterances
 * without inventing any expected titles: every utterance still maps to a title
 * that came from a pack fixture.
 *
 * Split: hash-based, 60% tune / 40% heldout, seeded on a constant string so the
 * split is byte-identical on every machine and every run. The tune code path
 * loads ONLY corpus.lock.json; heldout is a separate file loaded only by the
 * final evaluation step, and TuneCorpus asserts at construction time that it
 * never contains a heldout-split entry.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EVAL_DIR, CORPUS_LOCK, HELDOUT_LOCK, PACKS_DIR } from "./paths.js";

export const SPLIT_SEED = "omnibeat-eval-split-v1";
export const CORPUS_SCHEMA = "omnibeat.eval-corpus.v1";
export const LANG_PACKS = ["en-US", "hi-IN", "es-US"] as const;
export type LangPack = (typeof LANG_PACKS)[number];

export type Split = "tune" | "heldout";
export type Variant = "base" | "wake-prefix" | "upper";

export interface CorpusEntry {
  id: string;
  input: string;
  expect: string;
  locale: LangPack;
  fixtureLine: number;
  variant: Variant;
  split: Split;
}

export interface CorpusLockFile {
  schema: string;
  split: Split;
  seed: string;
  created_at: string;
  entry_count: number;
  corpus_sha256: string;
  entries: CorpusEntry[];
}

export interface RawFixture {
  input: string;
  expect: string;
  mode?: string;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Stable 64-bit-ish integer from a string (first 8 sha256 bytes, unsigned). */
function hashInt(value: string): number {
  return Number.parseInt(sha256Hex(value).slice(0, 16), 16);
}

export function entryId(input: string, expect: string, locale: string): string {
  return sha256Hex(`${locale}|${input}|${expect}`).slice(0, 16);
}

/**
 * Deterministic split: an entry is heldout iff hash(SPLIT_SEED + id) mod 100 < 40.
 * Pure function of (id, SPLIT_SEED) - re-running the builder reproduces the
 * identical partition, and adding a new fixture can only move that fixture.
 */
export function splitFor(id: string): Split {
  return hashInt(SPLIT_SEED + id) % 100 < 40 ? "heldout" : "tune";
}

function deriveVariant(input: string, variant: Variant): string {
  if (variant === "wake-prefix") return `hey alexa ${input}`;
  if (variant === "upper") return input.toUpperCase();
  return input;
}

export function parseFixtures(raw: string, locale: LangPack): { fixture: RawFixture; line: number }[] {
  const out: { fixture: RawFixture; line: number }[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const text = line.trim();
    if (text.length === 0) return;
    const parsed = JSON.parse(text) as RawFixture;
    if (typeof parsed.input !== "string" || parsed.input.length === 0) {
      throw new Error(`${locale} fixtures line ${index + 1}: missing input`);
    }
    if (typeof parsed.expect !== "string" || parsed.expect.length === 0) {
      throw new Error(`${locale} fixtures line ${index + 1}: missing expect`);
    }
    out.push({ fixture: parsed, line: index + 1 });
  });
  return out;
}

/**
 * Assemble the full corpus (both splits) from the packs. Base + exactly one
 * deterministic variant per fixture; duplicate (input, expect) pairs collapse.
 */
export function assembleCorpus(packsDir: string = PACKS_DIR): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const seen = new Set<string>();
  for (const locale of LANG_PACKS) {
    const file = join(packsDir, locale, "fixtures.jsonl");
    const parsed = parseFixtures(readFileSync(file, "utf8"), locale);
    for (const { fixture, line } of parsed) {
      const variants: Variant[] = ["base", "wake-prefix", "upper"];
      // Only one derived variant per fixture: pick it from the fixture hash.
      const derived = variants[1 + (hashInt(fixture.input) % 2)] as Variant;
      for (const variant of ["base", derived] as Variant[]) {
        const input = deriveVariant(fixture.input, variant);
        const id = entryId(input, fixture.expect, locale);
        if (seen.has(id)) continue; // e.g. "SHUFFLE ..." uppercased to the same string
        seen.add(id);
        entries.push({
          id,
          input,
          expect: fixture.expect,
          locale,
          fixtureLine: line,
          variant,
          split: splitFor(id),
        });
      }
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}

/** Canonical content hash over the entries (order + content sensitive). */
export function corpusContentSha256(entries: CorpusEntry[]): string {
  const canonical = entries
    .map((e) => `${e.id}\u0000${e.input}\u0000${e.expect}\u0000${e.locale}\u0000${e.split}`)
    .join("\n");
  return sha256Hex(canonical);
}

function lockFile(split: Split, entries: CorpusEntry[]): CorpusLockFile {
  return {
    schema: CORPUS_SCHEMA,
    split,
    seed: SPLIT_SEED,
    created_at: new Date().toISOString(),
    entry_count: entries.length,
    corpus_sha256: corpusContentSha256(entries),
    entries,
  };
}

export interface WrittenCorpus {
  tune: CorpusLockFile;
  heldout: CorpusLockFile;
}

export function writeLocks(entries: CorpusEntry[], evalDir: string = EVAL_DIR): WrittenCorpus {
  const tuneEntries = entries.filter((e) => e.split === "tune");
  const heldoutEntries = entries.filter((e) => e.split === "heldout");
  if (tuneEntries.length === 0 || heldoutEntries.length === 0) {
    throw new Error(
      `degenerate split: tune=${tuneEntries.length} heldout=${heldoutEntries.length} (corpus too small?)`,
    );
  }
  mkdirSync(evalDir, { recursive: true });
  const tune = lockFile("tune", tuneEntries);
  const heldout = lockFile("heldout", heldoutEntries);
  writeFileSync(join(evalDir, "corpus.lock.json"), `${JSON.stringify(tune, null, 2)}\n`, "utf8");
  writeFileSync(join(evalDir, "heldout.lock.json"), `${JSON.stringify(heldout, null, 2)}\n`, "utf8");
  return { tune, heldout };
}

export function readLockFile(path: string): CorpusLockFile {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CorpusLockFile;
  if (parsed.schema !== CORPUS_SCHEMA) {
    throw new Error(`${path}: unexpected schema ${parsed.schema}`);
  }
  const expectedSplit: Split = path.includes("heldout") ? "heldout" : "tune";
  if (parsed.split !== expectedSplit) {
    throw new Error(`${path}: declared split ${parsed.split} does not match filename (${expectedSplit})`);
  }
  const content = corpusContentSha256(parsed.entries);
  if (content !== parsed.corpus_sha256) {
    throw new Error(`${path}: corpus_sha256 mismatch (file was edited after locking)`);
  }
  if (parsed.entry_count !== parsed.entries.length) {
    throw new Error(`${path}: entry_count ${parsed.entry_count} != ${parsed.entries.length}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Leakage guard
// ---------------------------------------------------------------------------

/**
 * Asserts that no tune-side row carries a heldout id. Called by the tuning
 * code path (tune command, metrics calibration) so a heldout utterance can
 * never silently leak into tuning, even if a future caller passes the wrong
 * rows in. This is the "assert in code" the harness spec requires.
 */
export function assertNoHeldoutLeakage(rows: { id: string }[], heldoutIds: ReadonlySet<string>): void {
  const leaked = rows.filter((r) => heldoutIds.has(r.id));
  if (leaked.length > 0) {
    throw new Error(
      `heldout leakage: ${leaked.length} row(s) from the heldout split reached tune-side code (ids: ${leaked
        .map((r) => r.id)
        .slice(0, 5)
        .join(", ")})`,
    );
  }
}

/**
 * Tune-only corpus view. Constructed from the tune lock file exclusively; the
 * constructor re-asserts the declared split per entry, so a heldout lock file
 * fed into this constructor throws before any tuning code runs.
 */
export class TuneCorpus {
  readonly entries: readonly CorpusEntry[];

  constructor(lock: CorpusLockFile) {
    if (lock.split !== "tune") {
      throw new Error(`TuneCorpus constructed from a ${lock.split} lock file - heldout must never enter tuning`);
    }
    const bad = lock.entries.filter((e) => e.split !== "tune");
    if (bad.length > 0) {
      throw new Error(`TuneCorpus: ${bad.length} entr(ies) carry split != tune`);
    }
    this.entries = lock.entries;
  }
}

export function packSummary(packsDir: string = PACKS_DIR): { locale: LangPack; fixtures: number }[] {
  return LANG_PACKS.map((locale) => ({
    locale,
    fixtures: parseFixtures(readFileSync(join(packsDir, locale, "fixtures.jsonl"), "utf8"), locale).length,
  }));
}

export function knownPacks(packsDir: string = PACKS_DIR): string[] {
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
