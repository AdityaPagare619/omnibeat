import { describe, expect, it } from "vitest";
import {
  bootstrapMeanCi,
  computeMetrics,
  mulberry32,
  titlesMatch,
  worstFailures,
  type EvalRow,
} from "../src/metrics.js";

function row(partial: Partial<EvalRow> & Pick<EvalRow, "id">): EvalRow {
  return {
    input: "play something",
    expect: "Some Song",
    locale: "en-US",
    decision: "play",
    confidence: 0.9,
    chosenTitle: "Some Song",
    top1Title: "Some Song",
    candidateCount: 1,
    latencyMs: 5,
    ...partial,
  };
}

describe("metric math on synthetic rows", () => {
  it("computes wrong-play, ask and top-1 exactly", () => {
    const rows: EvalRow[] = [
      // 1. auto-played correct
      row({ id: "a", chosenTitle: "Blinding Lights", top1Title: "Blinding Lights", expect: "Blinding Lights" }),
      // 2. auto-played WRONG -> wrong play
      row({ id: "b", chosenTitle: "Raja Ji (Insta Mix)", top1Title: "Raja Ji (Insta Mix)", expect: "Raja Ji" }),
      // 3. asked, top-1 correct (not a wrong play, counts for top-1)
      row({ id: "c", decision: "ask", chosenTitle: null, top1Title: "Wonderwall", expect: "Wonderwall", candidateCount: 2 }),
      // 4. asked, top-1 wrong (not a wrong play, not top-1 correct)
      row({ id: "d", decision: "ask", chosenTitle: null, top1Title: "Yellow", expect: "Wonderwall", candidateCount: 2 }),
      // 5. repair - refusal, no top-1
      row({ id: "e", decision: "repair", chosenTitle: null, top1Title: null, confidence: 0.3 }),
      // 6. not_found - refusal, no top-1
      row({ id: "f", decision: "not_found", chosenTitle: null, top1Title: null, confidence: 0 }),
    ];
    const m = computeMetrics(rows);
    expect(m.n).toBe(6);
    expect(m.wrong_play_count).toBe(1);
    expect(m.wrong_play_rate).toBeCloseTo(1 / 6, 10);
    expect(m.ask_count).toBe(2);
    expect(m.ask_rate).toBeCloseTo(2 / 6, 10);
    expect(m.top1_correct_count).toBe(2);
    expect(m.top1_accuracy).toBeCloseTo(2 / 6, 10);
    expect(m.refusal_count).toBe(2);
  });

  it("treats normalized-equal titles as correct and never counts a refusal as a wrong play", () => {
    expect(titlesMatch("Dont Stop Me Now", "don't stop me now")).toBe(true);
    expect(titlesMatch("Blinding Lites", "Blinding Lights")).toBe(false);
    const rows: EvalRow[] = [
      row({ id: "a", chosenTitle: "Dont Stop Me Now", top1Title: "Dont Stop Me Now", expect: "don't stop me now" }),
      row({ id: "b", decision: "repair", chosenTitle: null, top1Title: null }),
      row({ id: "c", decision: "not_found", chosenTitle: null, top1Title: null }),
    ];
    const m = computeMetrics(rows);
    expect(m.wrong_play_count).toBe(0);
    expect(m.top1_correct_count).toBe(1);
  });

  it("rejects an empty row set instead of reporting a fake 0%", () => {
    expect(() => computeMetrics([])).toThrow(/empty/);
  });
});

describe("bootstrap CI seeded determinism", () => {
  const values = [1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0];

  it("mulberry32 is a deterministic stream", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("same seed -> identical CI; different seeds draw different resample streams", () => {
    const c1 = bootstrapMeanCi(values, 1000, 7);
    const c2 = bootstrapMeanCi(values, 1000, 7);
    const c3 = bootstrapMeanCi(values, 1000, 8);
    expect(c1).toEqual(c2);
    expect(c1.low).toBeLessThanOrEqual(1 / 3);
    expect(c1.high).toBeGreaterThanOrEqual(1 / 3);
    // CI values are quantiles of a small discrete distribution, so two seeds
    // MAY legitimately land on the same CI. Seed sensitivity lives in the
    // stream itself: different seeds must draw different resample means.
    const drawMeans = (seed: number): number[] => {
      const rng = mulberry32(seed);
      return Array.from({ length: 10 }, () =>
        Math.round(
          Array.from({ length: values.length }, () => values[Math.floor(rng() * values.length)] as number).reduce((a, b) => a + b, 0),
        ),
      );
    };
    expect(drawMeans(7)).not.toEqual(drawMeans(8));
    expect(c3.low).toBeLessThanOrEqual(1 / 3);
    expect(c3.high).toBeGreaterThanOrEqual(1 / 3);
  });
});

describe("worst failures ordering", () => {
  it("ranks tool errors first, then wrong plays, then refusals", () => {
    const rows: EvalRow[] = [
      row({ id: "ok", chosenTitle: "X", expect: "X" }),
      row({ id: "refusal", decision: "repair", chosenTitle: null, top1Title: null }),
      row({ id: "wrong", chosenTitle: "Wrong", top1Title: "Wrong", expect: "Right" }),
      row({ id: "crash", decision: "repair", chosenTitle: null, top1Title: null, error: "boom" }),
    ];
    const worst = worstFailures(rows, 3);
    expect(worst.map((r) => r.id)).toEqual(["crash", "wrong", "refusal"]);
  });
});
