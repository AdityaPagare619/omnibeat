/**
 * B-PHON swap: @omnibeat/phonetic-core wired into the resolver.
 *
 * This module replaces the phonetic layer that peeler.ts flagged as the
 * "SWAP POINT for B-PHON": candidate titles are now scored by articulatory-
 * weighted distance over sound-class skeletons from DATA-driven locale packs
 * (packages/phonetic-core/packs/<id>/{pack,rules,translit}.json), not by the
 * inline locale table.
 *
 * Design rules:
 *  - Packs are loaded ONCE at process startup (readFileSync at module init),
 *    never per request.
 *  - Deterministic: fixed pack order, strict-improvement tie-breaking, input
 *    order as the final tiebreak (mirrors resolveSkeletons).
 *  - Fast: bounded variant generation (MAX_VARIANTS=8) over <= ~30 short
 *    titles; measured well under the 10 ms per-resolve budget (asserted in
 *    test/phonetic.test.ts).
 *  - Degradation: if a pack is missing/unreadable the resolver keeps serving
 *    with the feature neutral (see scoring.ts) - phonetics never throws into
 *    the pipeline.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPack,
  resolveSkeletons,
  type PackJson,
  type PhoneticPack,
  type RulesJson,
  type TranslitJson,
} from "@omnibeat/phonetic-core";
import { log } from "../logging.js";

const require = createRequire(import.meta.url);

/** Pack ids in fixed load order (determinism of any iteration). */
const PACK_IDS = ["en-US", "hi-IN", "es-US"] as const;
export type PackId = (typeof PACK_IDS)[number];

export const DEFAULT_PACK_ID: PackId = "en-US";

/**
 * Candidate roots for packs/<id>/. First: the installed package (resolves
 * through the npm file: junction to the real package dir, which ships packs/).
 * Fallbacks: the source-tree layout relative to this file (src/resolver/ and
 * dist/resolver/ are both one level under the service root).
 */
function packRoots(): string[] {
  const roots: string[] = [];
  try {
    const entry = require.resolve("@omnibeat/phonetic-core");
    // <pkg>/dist/src/index.js -> <pkg>
    roots.push(join(dirname(entry), "..", "..", ".."));
  } catch {
    // not installed as a package - fall through to source-tree candidates
  }
  roots.push(fileURLToPath(new URL("../../../../packages/phonetic-core/", import.meta.url)));
  roots.push(fileURLToPath(new URL("../../../packages/phonetic-core/", import.meta.url)));
  return roots;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadPack(id: PackId): PhoneticPack | undefined {
  for (const root of packRoots()) {
    try {
      const dir = join(root, "packs", id);
      const pack = readJson<PackJson>(join(dir, "pack.json"));
      const rules = readJson<RulesJson>(join(dir, "rules.json"));
      const translit = readJson<TranslitJson>(join(dir, "translit.json"));
      return createPack(pack, rules, translit);
    } catch {
      // try the next candidate root
    }
  }
  log.error("phonetic_pack_load_failed", { pack_id: id });
  return undefined;
}

/** Loaded once at startup. Missing packs are absent, never retried per request. */
const PACKS: Partial<Record<PackId, PhoneticPack>> = (() => {
  const loaded: Partial<Record<PackId, PhoneticPack>> = {};
  for (const id of PACK_IDS) {
    const pack = loadPack(id);
    if (pack) loaded[id] = pack;
  }
  return loaded;
})();

/** Pack ids that loaded successfully, in fixed order (for evidence text). */
export function loadedPackIds(): PackId[] {
  return PACK_IDS.filter((id) => PACKS[id] !== undefined);
}

const DEVANAGARI = /[\u0900-\u097f]/;

/**
 * Locale/text -> pack selection (blueprint 7.1): hi/Devanagari input uses the
 * hi-IN pack, es uses es-US, everything else (and the default) en-US.
 * Script detection runs even without a locale because ASR hosts often omit it.
 */
export function pickPackId(text?: string, locale?: string): PackId {
  const loc = (locale ?? "").toLowerCase();
  if (loc.startsWith("hi")) return "hi-IN";
  if (loc.startsWith("es")) return "es-US";
  if (text !== undefined && DEVANAGARI.test(text)) return "hi-IN";
  return DEFAULT_PACK_ID;
}

/**
 * Monotone decreasing 0..1 similarity from a raw articulatory distance:
 * sim(0)=1, strictly decreasing, always in (0,1] for finite d >= 0.
 */
export function distanceToSimilarity(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  return 1 / (1 + distance);
}

export interface TitlePhonetics {
  title: string;
  /** best articulatory distance across query variants and ASR alternatives. */
  distance: number;
  /** distanceToSimilarity(distance) - the scoring feature. */
  similarity: number;
  /** the winning query variant (respelling trace for the evidence card). */
  variant: string;
  /** metaphone token agreement of the winning comparison (tiebreak signal). */
  metaphoneAgreement: number;
  packId: PackId;
}

export interface PhoneticScoring {
  packId: PackId | undefined;
  perTitle: TitlePhonetics[];
  elapsedMs: number;
}

/**
 * Score each candidate title against the peeled query AND the ASR n-best
 * alternatives, keeping the best (lowest) distance per title. Returns one
 * TitlePhonetics per DISTINCT title, in first-appearance order.
 *
 * When no pack loaded (broken install) returns empty perTitle with
 * packId undefined - callers treat the feature as neutral.
 */
export function scoreTitlePhonetics(
  query: string,
  asrAlternatives: readonly string[],
  titles: readonly string[],
  locale?: string,
): PhoneticScoring {
  const started = process.hrtime.bigint();
  const packId = pickPackId(query, locale);
  const pack = PACKS[packId] ?? PACKS[DEFAULT_PACK_ID];
  if (pack === undefined) {
    return {
      packId: undefined,
      perTitle: [],
      elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    };
  }

  const queries = [query, ...asrAlternatives].filter((q) => q.trim().length > 0);
  const distinctTitles = [...new Set(titles)];
  const best = new Map<string, TitlePhonetics>();

  for (const q of queries) {
    // one ranking call per query text: all distinct titles as alts (RankedMatch
    // carries per-candidate distance + the winning variant).
    const matches = resolveSkeletons(q, distinctTitles, pack);
    for (const match of matches) {
      const title = distinctTitles[match.index];
      if (title === undefined) continue;
      const current = best.get(title);
      if (current === undefined || match.distance < current.distance) {
        best.set(title, {
          title,
          distance: match.distance,
          similarity: distanceToSimilarity(match.distance),
          variant: match.variant,
          metaphoneAgreement: match.metaphone.agreement,
          packId: pack.id as PackId,
        });
      }
    }
  }

  // RankedMatch contract: ascending distance, ties broken by metaphone
  // agreement then first-appearance order.
  const order = new Map(distinctTitles.map((t, i) => [t, i]));
  const perTitle = [...best.values()].sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.metaphoneAgreement !== b.metaphoneAgreement) {
      return b.metaphoneAgreement - a.metaphoneAgreement;
    }
    return (order.get(a.title) ?? 0) - (order.get(b.title) ?? 0);
  });

  return {
    packId: pack.id as PackId,
    perTitle,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
  };
}
