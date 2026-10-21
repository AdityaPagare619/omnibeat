/**
 * Metrics + seeded bootstrap confidence intervals.
 *
 * Definitions (all rates are fractions in [0,1], denominators stated honestly):
 *
 *  - wrong_play_rate = |decision == "play" AND chosen title != expected| / N
 *    ("auto-chosen AND wrong" - an ask/repair/not_found is NOT a wrong play,
 *    it is a refusal; refusals cost convenience, not the wrong song.)
 *  - ask_rate = |decision == "ask"| / N
 *  - top1_accuracy = |top-1 candidate title == expected| / N, where top-1 is
 *    the played track for "play", candidates[0] for "ask", and ABSENT for
 *    repair/not_found (a miss counts against top-1, as it must).
 *
 * Title equality is normalized: lowercase, punctuation -> space, collapsed
 * whitespace (Unicode letter/mark/number keep-set, so hi-IN titles compare
 * correctly). "Dont Stop Me Now" == "don't stop me now".
 *
 * Bootstrap: 1,000 resamples of N rows with replacement, percentile 95% CI,
 * seeded mulberry32 PRNG - same seed, same CI, on any machine.
 */

export interface EvalRow {
  id: string;
  input: string;
  expect: string;
  locale: string;
  decision: "play" | "ask" | "repair" | "not_found";
  confidence: number;
  /** Title the system would AUTO-PLAY right now (only set on decision=play). */
  chosenTitle: string | null;
  /** Best ranked title regardless of decision (play -> track, ask -> candidates[0]). */
  top1Title: string | null;
  candidateCount: number;
  error?: string;
  latencyMs: number;
}

export interface SystemMetrics {
  n: number;
  wrong_play_rate: number;
  wrong_play_count: number;
  ask_rate: number;
  ask_count: number;
  top1_accuracy: number;
  top1_correct_count: number;
  refusal_count: number;
  error_count: number;
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019\u02bc]/gu, "") // apostrophes are LETTER joins, not separators: "don't" == "dont"
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesMatch(a: string, b: string): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}

export function computeMetrics(rows: readonly EvalRow[]): SystemMetrics {
  if (rows.length === 0) throw new Error("computeMetrics: empty row set");
  let wrongPlay = 0;
  let asks = 0;
  let top1Correct = 0;
  let refusals = 0;
  let errors = 0;
  for (const row of rows) {
    if (row.error !== undefined) errors += 1;
    if (row.decision === "play") {
      if (row.chosenTitle === null || !titlesMatch(row.chosenTitle, row.expect)) wrongPlay += 1;
    } else if (row.decision === "ask") {
      asks += 1;
    } else {
      refusals += 1;
    }
    if (row.top1Title !== null && titlesMatch(row.top1Title, row.expect)) top1Correct += 1;
  }
  const n = rows.length;
  return {
    n,
    wrong_play_rate: wrongPlay / n,
    wrong_play_count: wrongPlay,
    ask_rate: asks / n,
    ask_count: asks,
    top1_accuracy: top1Correct / n,
    top1_correct_count: top1Correct,
    refusal_count: refusals,
    error_count: errors,
  };
}

// ---------------------------------------------------------------------------
// Seeded bootstrap
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32). Same seed -> same stream, everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ci {
  low: number;
  high: number;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("quantile: empty array");
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loVal = sorted[lo] as number;
  if (lo === hi) return loVal;
  const hiVal = sorted[hi] as number;
  return loVal + (hiVal - loVal) * (pos - lo);
}

/**
 * Percentile bootstrap CI for the MEAN of a 0/1 indicator vector.
 * resamples=1000, two-sided 95%. Seeded: identical output for identical
 * (values, resamples, seed) regardless of platform.
 */
export function bootstrapMeanCi(
  values: readonly number[],
  resamples = 1000,
  seed = 20261021,
): Ci {
  const n = values.length;
  if (n === 0) throw new Error("bootstrapMeanCi: empty value set");
  const rng = mulberry32(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += values[Math.floor(rng() * n)] as number;
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return { low: quantile(means, 0.025), high: quantile(means, 0.975) };
}

export function indicatorVector(
  rows: readonly EvalRow[],
  metric: "wrong_play" | "ask" | "top1",
): number[] {
  return rows.map((row) => {
    if (metric === "wrong_play") {
      return row.decision === "play" && (row.chosenTitle === null || !titlesMatch(row.chosenTitle, row.expect))
        ? 1
        : 0;
    }
    if (metric === "ask") return row.decision === "ask" ? 1 : 0;
    return row.top1Title !== null && titlesMatch(row.top1Title, row.expect) ? 1 : 0;
  });
}

export interface MetricsWithCi {
  metrics: SystemMetrics;
  ci: { wrong_play: Ci; ask: Ci; top1: Ci };
}

export function metricsWithCi(
  rows: readonly EvalRow[],
  resamples = 1000,
  seed = 20261021,
): MetricsWithCi {
  return {
    metrics: computeMetrics(rows),
    ci: {
      wrong_play: bootstrapMeanCi(indicatorVector(rows, "wrong_play"), resamples, seed),
      ask: bootstrapMeanCi(indicatorVector(rows, "ask"), resamples, seed),
      top1: bootstrapMeanCi(indicatorVector(rows, "top1"), resamples, seed),
    },
  };
}

/** Worst rows first: wrong plays, then misses (no top-1), then refusals. */
export function worstFailures(rows: readonly EvalRow[], limit = 10): EvalRow[] {
  const rank = (row: EvalRow): number => {
    if (row.error !== undefined) return 0;
    if (row.decision === "play" && (row.chosenTitle === null || !titlesMatch(row.chosenTitle, row.expect))) return 1;
    if (row.top1Title === null) return 2;
    return 3; // ask with wrong top-1
  };
  return [...rows]
    .filter((row) => {
      if (row.error !== undefined) return true;
      if (row.decision === "play") return row.chosenTitle === null || !titlesMatch(row.chosenTitle, row.expect);
      return row.top1Title === null || !titlesMatch(row.top1Title, row.expect);
    })
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ciText(ci: Ci): string {
  return `${pct(ci.low)}-${pct(ci.high)}`;
}
