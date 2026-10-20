/**
 * S5/S6 scoring + decision (blueprint 6.1 S5, 6.2).
 *
 * Score = logistic model over: normalized-token similarity, source agreement
 * count, version match, artist-hint match, ASR confidence.
 *
 * !! CONTRACT DRAFT, UNCALIBRATED !!
 * There is no eval set in Phase 1, so these weights are hand-set starting
 * values, NOT Platt-scaled or isotonic-calibrated. The blueprint requires
 * "0.9 means ~90%" only after calibration on the eval harness (6.1 S5); we do
 * not claim that here. Confidence values are therefore indicative, and the
 * decision thresholds (from @omnibeat/schemas config defaults) do the safety
 * work. Evidence card: no calibration claim is made anywhere in output.
 *
 * Thresholds and margins are config-driven (blueprint 8.8 "configuration, not
 * code"): screen/tv T_play 0.85 / M 0.25, screenless 0.88 / 0.30, kids
 * 0.93 / 0.35, T_cover 0.70 (contract draft value, schemas default).
 */
import type { OmnibeatConfig } from "@omnibeat/schemas";
import type { Surface } from "@omnibeat/schemas";

// ---------------------------------------------------------------------------
// Normalised-token similarity
// ---------------------------------------------------------------------------

/**
 * Lowercase, strip Latin combining marks (NFKD output), drop punctuation,
 * collapse whitespace.
 *
 * \p{M} must stay in the keep-set: Devanagari matras (ा, ि, ...) and Arabic
 * harakat are category Mn, not L - without them "काला" would be shredded into
 * "क ला" and both the replay key and the similarity score would break for
 * non-Latin scripts (blueprint 7.1 locales).
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Latin diacritics only; \u0900-range untouched
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] as number) + 1,
        (curr[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length] as number;
}

/** 0..1 similarity of two tokens: 1 - normalised edit distance. */
export function tokenRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const MATCH_THRESHOLD = 0.5;

/**
 * Normalized-token similarity between a query and a candidate title:
 *  - coverage  = fraction of query tokens that match some title token (>= 0.5)
 *  - meanBest   = mean of the best ratio per query token
 *  - combined   = 0.5 * coverage + 0.5 * meanBest
 * Order-insensitive on purpose (ASR word order is unreliable), which is also
 * why this is NOT a phonetic score: B-PHON's articulatory distance replaces
 * this function at the swap point noted in peeler.ts.
 */
export function tokenSimilarity(query: string, candidate: string): number {
  const q = tokenize(query);
  const c = tokenize(candidate);
  if (q.length === 0 || c.length === 0) return 0;
  let matched = 0;
  let bestSum = 0;
  for (const qt of q) {
    let best = 0;
    for (const ct of c) {
      const r = tokenRatio(qt, ct);
      if (r > best) best = r;
    }
    bestSum += best;
    if (best >= MATCH_THRESHOLD) matched += 1;
  }
  const coverage = matched / q.length;
  const meanBest = bestSum / q.length;
  return Math.max(0, Math.min(1, 0.5 * coverage + 0.5 * meanBest));
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = {
  bias: -3.6,
  similarity: 4.4,
  agreement: 1.3,
  version: 0.4,
  asr: 0.4,
  artistHint: 0.5,
} as const;

export function logistic(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

export interface ScoreFeatures {
  /** 0..1 normalized-token similarity of query vs title. */
  similarity: number;
  /** Number of DISTINCT upstream origins that returned this candidate. */
  agreement: number;
  /** 1 = user asked for a version we matched, 0 = mismatch, 0.5 = no intent said. */
  versionMatch: number;
  /** ASR confidence (0.7 neutral when the host supplied none). */
  asrConfidence: number;
  /** 1 = "by <artist>" matched, 0 = mismatch, 0.5 = no artist hint said. */
  artistHintMatch: number;
}

/** Uncalibrated v0 weights - see the CONTRACT DRAFT banner at the top. */
export function scoreCandidate(f: ScoreFeatures): number {
  const agreementTerm = Math.min(f.agreement, 2) / 2; // 0, 0.5 or 1
  const z =
    SCORE_WEIGHTS.bias +
    SCORE_WEIGHTS.similarity * f.similarity +
    SCORE_WEIGHTS.agreement * agreementTerm +
    SCORE_WEIGHTS.version * f.versionMatch +
    SCORE_WEIGHTS.asr * f.asrConfidence +
    SCORE_WEIGHTS.artistHint * f.artistHintMatch;
  return Math.max(0, Math.min(1, logistic(z)));
}

// ---------------------------------------------------------------------------
// Decision (blueprint 6.2)
// ---------------------------------------------------------------------------

export type Decision = "play" | "ask" | "repair" | "not_found";

export interface DecisionThresholds {
  tPlay: number;
  m: number;
}

export function thresholdsFor(
  thresholds: OmnibeatConfig["decision"]["thresholds"],
  surface: Surface,
  profile: "standard" | "kids",
): DecisionThresholds {
  if (profile === "kids") return thresholds.kids;
  if (surface === "screenless") return thresholds.screenless;
  if (surface === "tv") return thresholds.tv;
  return thresholds.screen;
}

export interface DecisionOutcome {
  decision: Decision;
  /** Best candidate's score (0 when nothing was found). */
  confidence: number;
  /** p1 - p2 (p2 = 0 with a single candidate). */
  margin: number;
  /** cumulative p(top-3). */
  top3Sum: number;
  thresholds: DecisionThresholds;
}

/**
 * decision = PLAY    if p1 >= T_play AND p1 - p2 >= M
 *            ASK     if cumulative p(top-3) >= T_cover AND candidates <= 3
 *            REPAIR  otherwise
 *            NOT_FOUND when there are no candidates at all
 */
export function decide(
  scores: number[],
  opts: {
    thresholds: DecisionThresholds;
    tCover: number;
    askMaxCandidates: number;
  },
): DecisionOutcome {
  const { thresholds, tCover, askMaxCandidates } = opts;
  if (scores.length === 0) {
    return {
      decision: "not_found",
      confidence: 0,
      margin: 0,
      top3Sum: 0,
      thresholds,
    };
  }
  const p1 = scores[0] as number;
  const p2 = scores[1] ?? 0;
  const margin = p1 - p2;
  const top3 = scores.slice(0, 3).reduce((acc, s) => acc + s, 0);

  let decision: Decision;
  if (p1 >= thresholds.tPlay && margin >= thresholds.m) {
    decision = "play";
  } else if (top3 >= tCover && scores.length <= askMaxCandidates) {
    decision = "ask";
  } else {
    decision = "repair";
  }
  return { decision, confidence: p1, margin, top3Sum: top3, thresholds };
}
