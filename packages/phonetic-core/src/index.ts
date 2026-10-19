import type {
  DistanceConfig,
  PhoneticPack,
  RankedMatch,
  ResolveOptions,
} from "./types.js";
import { resolveConfig, distanceOnSkeletons } from "./distance.js";
import { skeleton, skeletonString, skeletonToken } from "./skeleton.js";
import { metaphone } from "./metaphone.js";
import { peel } from "./peeler.js";
import { canonicalize } from "./translit.js";
import { generateVariants, MAX_VARIANTS } from "./variants.js";

/**
 * @omnibeat/phonetic-core — public API.
 *
 * Primary entry point:
 *
 *   resolveSkeletons(query, alts, pack) → RankedMatch[]
 *
 * Pipeline: transliteration aliases → grammar peeling → bounded respelling
 * variants (≤8) → sound-class skeletons → articulatory-weighted distance,
 * with Double-Metaphone-style token agreement as a tiebreak. Pack data
 * (grammar, rules, translit maps) drives every step; there is no per-track,
 * per-artist, or per-query special casing anywhere in this package.
 */

/** Assemble a pack from the three JSON files of packs/<id>/. Pure. */
export function createPack(
  pack: { id: string; scripts: string[]; grammar: import("./types.js").PackGrammar },
  rules: import("./types.js").RulesJson,
  translit: import("./types.js").TranslitJson,
): PhoneticPack {
  return {
    id: pack.id,
    scripts: pack.scripts,
    grammar: pack.grammar,
    rules,
    translit,
  };
}

export interface ResolveContext {
  /** peeled query tokens (query mode). */
  queryTokens: string[];
  /** bounded generated variants (first entry is the peeled identity). */
  variants: string[];
  /** intent hints detected on the query. */
  intent: import("./types.js").IntentHints;
}

/**
 * Rank candidate titles against a (possibly mangled, code-switched,
 * script-mixed) query. Returns one RankedMatch per alt, sorted by
 * ascending distance (ties broken by metaphone agreement, then input order).
 * Every match carries the per-candidate distance and the query variant that
 * produced it.
 */
export function resolveSkeletons(
  query: string,
  alts: readonly string[],
  pack: PhoneticPack,
  options: ResolveOptions = {},
): RankedMatch[] {
  const cfg: DistanceConfig = resolveConfig(options.weights);
  const maxVariants = Math.min(options.maxVariants ?? MAX_VARIANTS, MAX_VARIANTS);

  // query side: canonical aliases → peel (grammar) → variants → skeletons
  const canonicalQuery = canonicalize(query, pack.translit);
  const peeled = peel(canonicalQuery, pack, "query");
  const variants =
    peeled.tokens.length === 0
      ? [""]
      : generateVariants(peeled.tokens, pack.rules, maxVariants);
  const variantSkeletons = variants.map((v) => skeleton(v, pack.rules));
  const queryCodes = peeled.tokens.map((t) => metaphone(t));

  // candidate side: canonical aliases → title-mode peel → skeleton
  const perAlt = alts.map((alt, index) => {
    const canonicalAlt = canonicalize(alt, pack.translit);
    const altTokens = peel(canonicalAlt, pack, "title").tokens;
    const altSkeleton = altTokens.map((t) => skeletonToken(t, pack.rules));
    const altCodes = altTokens.map((t) => metaphone(t));

    let best = Number.POSITIVE_INFINITY;
    let bestVariant = variants[0] ?? "";
    let bestSkeleton = variantSkeletons[0] ?? [];
    for (let k = 0; k < variants.length; k++) {
      const d = distanceOnSkeletons(
        variantSkeletons[k] ?? [],
        altSkeleton,
        pack.rules,
        cfg,
      );
      if (d < best) {
        best = d;
        bestVariant = variants[k] ?? "";
        bestSkeleton = variantSkeletons[k] ?? [];
      }
    }

    const altCodeSet = new Set(altCodes);
    let agreement = 0;
    for (const code of queryCodes) {
      if (code.length > 0 && altCodeSet.has(code)) agreement += 1;
    }

    const match: RankedMatch = {
      candidate: alt,
      index,
      distance: best,
      variant: bestVariant,
      querySkeleton: bestSkeleton.join(" "),
      candidateSkeleton: altSkeleton.join(" "),
      metaphone: { query: queryCodes, candidate: altCodes, agreement },
    };
    return match;
  });

  perAlt.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.metaphone.agreement !== b.metaphone.agreement) {
      return b.metaphone.agreement - a.metaphone.agreement;
    }
    return a.index - b.index;
  });
  return perAlt;
}

/** Peel only — exposed so callers can show the normalized tokens/intent. */
export function explainQuery(
  query: string,
  pack: PhoneticPack,
): ResolveContext {
  const peeled = peel(canonicalize(query, pack.translit), pack, "query");
  const variants =
    peeled.tokens.length === 0
      ? [""]
      : generateVariants(peeled.tokens, pack.rules, MAX_VARIANTS);
  return {
    queryTokens: peeled.tokens,
    variants,
    intent: peeled.intent,
  };
}

// --- module re-exports -----------------------------------------------------

export { skeleton, skeletonString, skeletonToken } from "./skeleton.js";
export {
  articulatoryDistance,
  symbolDistance,
  distanceOnSkeletons,
  resolveConfig,
  DEFAULT_DISTANCE_CONFIG,
} from "./distance.js";
export { metaphone, metaphonePair } from "./metaphone.js";
export { translit, canonicalize } from "./translit.js";
export { peel } from "./peeler.js";
export type { PeelMode, PeelResult, StripReason } from "./peeler.js";
export { generateVariants, MAX_VARIANTS } from "./variants.js";
export type {
  ArticulatoryClasses,
  DistanceConfig,
  IntentHints,
  IntentName,
  PackGrammar,
  PackJson,
  PhoneticPack,
  RankedMatch,
  RespellingKind,
  RespellingTemplate,
  ResolveOptions,
  RulesJson,
  TranslitJson,
} from "./types.js";
