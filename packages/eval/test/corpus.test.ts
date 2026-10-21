import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleCorpus,
  corpusContentSha256,
  entryId,
  parseFixtures,
  readLockFile,
  splitFor,
  TuneCorpus,
  writeLocks,
  assertNoHeldoutLeakage,
  SPLIT_SEED,
} from "../src/corpus.js";

const PACKS = join(import.meta.dirname, "..", "..", "phonetic-core", "packs");

describe("corpus builder", () => {
  it("assembles >=40 utterances covering all three locales with sha256 locks", () => {
    const entries = assembleCorpus(PACKS);
    expect(entries.length).toBeGreaterThanOrEqual(40);
    expect(new Set(entries.map((e) => e.locale))).toEqual(new Set(["en-US", "hi-IN", "es-US"]));
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length); // unique ids
    const heldout = entries.filter((e) => e.split === "heldout");
    expect(heldout.length / entries.length).toBeGreaterThan(0.3);
    expect(heldout.length / entries.length).toBeLessThan(0.5);

    const dir = mkdtempSync(join(tmpdir(), "eval-lock-"));
    try {
      const written = writeLocks(entries, dir);
      const reloaded = readLockFile(join(dir, "corpus.lock.json"));
      expect(reloaded.corpus_sha256).toBe(written.tune.corpus_sha256);
      expect(reloaded.entries.every((e) => e.split === "tune")).toBe(true);
      const held = readLockFile(join(dir, "heldout.lock.json"));
      expect(held.corpus_sha256).toBe(written.heldout.corpus_sha256);
      expect(held.entries.every((e) => e.split === "heldout")).toBe(true);
      // disjoint
      const tuneIds = new Set(reloaded.entries.map((e) => e.id));
      expect(held.entries.some((e) => tuneIds.has(e.id))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is byte-deterministic: same fixtures -> same ids, same split, same content sha256", () => {
    const a = assembleCorpus(PACKS);
    const b = assembleCorpus(PACKS);
    expect(corpusContentSha256(a)).toBe(corpusContentSha256(b));
    expect(a.map((e) => `${e.id}:${e.split}`)).toEqual(b.map((e) => `${e.id}:${e.split}`));
    // split is a pure function of the seed + id
    for (const e of a) expect(splitFor(e.id)).toBe(e.split);
    expect(SPLIT_SEED).toBe("omnibeat-eval-split-v1");
  });

  it("parses fixtures strictly", () => {
    expect(() => parseFixtures('{"input":""}', "en-US")).toThrow(/missing input/);
    expect(() => parseFixtures('{"input":"x"}', "en-US")).toThrow(/missing expect/);
  });
});

describe("heldout-leakage guard", () => {
  it("assertNoHeldoutLeakage throws when a heldout id reaches tune-side rows", () => {
    const entries = assembleCorpus(PACKS);
    const heldoutIds = new Set(entries.filter((e) => e.split === "heldout").map((e) => e.id));
    const tuneRows = entries.filter((e) => e.split === "tune").map((e) => ({ id: e.id }));
    expect(() => assertNoHeldoutLeakage(tuneRows, heldoutIds)).not.toThrow();
    const leaked = [...tuneRows, { id: [...heldoutIds][0] as string }];
    expect(() => assertNoHeldoutLeakage(leaked, heldoutIds)).toThrow(/heldout leakage/);
  });

  it("TuneCorpus refuses a heldout lock file and per-entry heldout rows", () => {
    const entries = assembleCorpus(PACKS);
    const heldoutEntries = entries.filter((e) => e.split === "heldout");
    const heldoutLikeLock = {
      schema: "omnibeat.eval-corpus.v1",
      split: "heldout" as const,
      seed: SPLIT_SEED,
      created_at: new Date().toISOString(),
      entry_count: heldoutEntries.length,
      corpus_sha256: corpusContentSha256(heldoutEntries),
      entries: heldoutEntries,
    };
    expect(() => new TuneCorpus(heldoutLikeLock)).toThrow(/heldout must never enter tuning/);

    const tuneEntries = entries.filter((e) => e.split === "tune");
    const tampered = {
      ...heldoutLikeLock,
      split: "tune" as const,
      entries: [...tuneEntries, heldoutEntries[0] as (typeof heldoutEntries)[number]],
      entry_count: tuneEntries.length + 1,
      corpus_sha256: "not-checked-by-constructor",
    };
    expect(() => new TuneCorpus(tampered)).toThrow(/split != tune/);
  });

  it("entryId is content-addressed (a changed fixture changes the id)", () => {
    expect(entryId("play x", "X", "en-US")).toBe(entryId("play x", "X", "en-US"));
    expect(entryId("play x", "X", "en-US")).not.toBe(entryId("play x", "Y", "en-US"));
  });
});
