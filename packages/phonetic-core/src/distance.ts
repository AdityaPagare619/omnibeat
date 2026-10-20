import type { ArticulatoryClasses, DistanceConfig, RulesJson } from "./types.js";
import { skeleton } from "./skeleton.js";

/**
 * Articulatory-weighted edit distance.
 *
 * Levenshtein over skeleton strings (space included as a symbol) where every
 * substitution cost comes from articulatory classes:
 *   - consonant ↔ consonant: place + manner + voicing from pack rules,
 *   - vowel ↔ vowel: height + frontness neighbourhood grid,
 *   - vowel ↔ consonant: fixed category-crossing cost,
 *   - unknown symbols (emoji, RTL marks, …): fixed fallback costs.
 *
 * Weights are exposed via the optional `config` param (Partial override of
 * DEFAULT_DISTANCE_CONFIG). All substitution costs are capped at
 * max(1.0, indel) so a substitution never costs more than delete+insert,
 * which is what keeps single-symbol substitution monotone in class distance.
 *
 * Properties (asserted in test/properties.test.ts): never throws on any
 * Unicode input, distance(x, x) === 0, case/whitespace invariant (the
 * skeleton step lowercases and collapses boundaries), symmetric, and
 * triangle-inequality-with-epsilon over the class metric.
 */

export const DEFAULT_DISTANCE_CONFIG: DistanceConfig = {
  indel: 1.0,
  vowelSame: 0.1,
  vowelNear: 0.3,
  vowelFar: 0.5,
  consonantSameClass: 0.05,
  consonantVoicing: 0.2,
  consonantManner: 0.5,
  consonantPlace: 0.6,
  consonantFar: 0.8,
  vowelConsonant: 1.0,
  spaceMismatch: 1.0,
  unknownDiff: 0.5,
  knownUnknown: 1.0,
};

export function resolveConfig(config?: Partial<DistanceConfig>): DistanceConfig {
  if (!config) return DEFAULT_DISTANCE_CONFIG;
  return { ...DEFAULT_DISTANCE_CONFIG, ...config };
}

const SPACE = " ";

/** True if `sym` is listed as a vowel in the pack's articulatory classes. */
export function isVowel(sym: string, classes: ArticulatoryClasses): boolean {
  return classes.vowels.includes(sym);
}

function classOf(
  sym: string,
  classes: ArticulatoryClasses,
): "space" | "vowel" | "consonant" | "unknown" {
  if (sym === SPACE) return "space";
  if (isVowel(sym, classes)) return "vowel";
  if (classes.places[sym] !== undefined || classes.manners[sym] !== undefined) {
    return "consonant";
  }
  return "unknown";
}

/**
 * Substitution cost between two single symbols. This is the metric the
 * monotonicity property is stated over: substituting a symbol for one in a
 * strictly more distant class never lowers it.
 */
export function symbolDistance(
  a: string,
  b: string,
  rules: RulesJson,
  config?: Partial<DistanceConfig>,
): number {
  const cfg = resolveConfig(config);
  if (a === b) return 0;
  const ca = classOf(a, rules.articulatory);
  const cb = classOf(b, rules.articulatory);
  if (ca === "space" || cb === "space") return Math.min(cfg.spaceMismatch, cap(cfg));
  if (ca === "unknown" || cb === "unknown") {
    if (ca === "unknown" && cb === "unknown") return Math.min(cfg.unknownDiff, cap(cfg));
    return Math.min(cfg.knownUnknown, cap(cfg));
  }
  if (ca === "vowel" && cb === "vowel") {
    return Math.min(vowelCost(a, b, rules.articulatory, cfg), cap(cfg));
  }
  if (ca === "consonant" && cb === "consonant") {
    return Math.min(consCost(a, b, rules.articulatory, cfg), cap(cfg));
  }
  return Math.min(cfg.vowelConsonant, cap(cfg));
}

/** Substitutions must never exceed delete+insert. */
function cap(cfg: DistanceConfig): number {
  return 2 * cfg.indel;
}

function vowelCost(
  a: string,
  b: string,
  classes: ArticulatoryClasses,
  cfg: DistanceConfig,
): number {
  const h = classes.heights ?? {};
  const f = classes.frontness ?? {};
  const ha = h[a];
  const hb = h[b];
  const fa = f[a];
  const fb = f[b];
  const sameHeight = ha !== undefined && ha === hb;
  const sameFront = fa !== undefined && fa === fb;
  if (sameHeight && sameFront) return cfg.vowelSame;
  if (sameHeight || sameFront) return cfg.vowelNear;
  return cfg.vowelFar;
}

function consCost(
  a: string,
  b: string,
  classes: ArticulatoryClasses,
  cfg: DistanceConfig,
): number {
  const pa = classes.places[a];
  const pb = classes.places[b];
  const ma = classes.manners[a];
  const mb = classes.manners[b];
  const va = classes.voicing?.[a] ?? "voiceless";
  const vb = classes.voicing?.[b] ?? "voiceless";
  // Missing class data (unknown consonant symbol) degrades to "far".
  if (pa === undefined || pb === undefined || ma === undefined || mb === undefined) {
    return cfg.consonantFar;
  }
  const samePlace = pa === pb;
  const sameManner = ma === mb;
  if (samePlace && sameManner) return va === vb ? cfg.consonantSameClass : cfg.consonantVoicing;
  if (samePlace) return cfg.consonantManner;
  if (sameManner) return cfg.consonantPlace;
  return cfg.consonantFar;
}

/**
 * Articulatory-weighted Levenshtein distance between two strings.
 * Inputs are skeletonized first (case, punctuation, script-insensitive).
 */
export function articulatoryDistance(
  a: string,
  b: string,
  rules: RulesJson,
  config?: Partial<DistanceConfig>,
): number {
  const cfg = resolveConfig(config);
  return distanceOnSkeletons(
    skeleton(a, rules),
    skeleton(b, rules),
    rules,
    cfg,
  );
}

/** Distance between two already-extracted token skeletons. */
export function distanceOnSkeletons(
  aTokens: string[],
  bTokens: string[],
  rules: RulesJson,
  cfg: DistanceConfig,
): number {
  const a = aTokens.join(SPACE);
  const b = bTokens.join(SPACE);
  if (a === b) return 0;

  const n = a.length;
  const m = b.length;
  if (n === 0) return m * cfg.indel;
  if (m === 0) return n * cfg.indel;

  // Two rolling rows; substitution costs computed per pair on demand.
  let prev = new Float64Array(m + 1);
  let curr = new Float64Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j * cfg.indel;

  for (let i = 1; i <= n; i++) {
    curr[0] = i * cfg.indel;
    const ai = a[i - 1]!;
    for (let j = 1; j <= m; j++) {
      const bj = b[j - 1]!;
      const sub = symbolDistance(ai, bj, rules, cfg) + prev[j - 1]!;
      const del = cfg.indel + prev[j]!;
      const ins = cfg.indel + curr[j - 1]!;
      curr[j] = sub <= del && sub <= ins ? sub : del <= ins ? del : ins;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[m]!;
}
