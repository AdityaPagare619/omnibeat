/**
 * Tests for the coverage-gap exclusion + auto-diagnostics logic.
 * These guard the HONESTY CONTRACT of the report:
 *  - a capture gap only shrinks the coverage denominator (never the metrics),
 *  - the verdict text and diagnostics are computed from rows, not hand-written.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { COVERAGE_GAPS_SCHEMA, loadCoverageGaps } from "../src/gaps.js";
import {
  coverageFraction,
  diagnosticSummary,
  type ReportInput,
} from "../src/report.js";
import type { EvalRow } from "../src/metrics.js";

const tmp = mkdtempSync(join(tmpdir(), "omnibeat-eval-gaps-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function row(id: string, over: Partial<EvalRow>): EvalRow {
  return {
    id,
    input: `input-${id}`,
    expect: "Blinding Lights",
    locale: "en-US",
    decision: "not_found",
    confidence: 0,
    chosenTitle: null,
    top1Title: null,
    candidateCount: 0,
    latencyMs: 1,
    ...over,
  };
}

describe("loadCoverageGaps", () => {
  it("returns no gaps when the file is absent (conservative denominator)", () => {
    const loaded = loadCoverageGaps(join(tmp, "does-not-exist.json"));
    expect(loaded.present).toBe(false);
    expect(loaded.gapTitleNorms.size).toBe(0);
  });

  it("parses gap titles into normalized set", () => {
    const path = join(tmp, "gaps-ok.json");
    writeFileSync(
      path,
      JSON.stringify({
        schema: COVERAGE_GAPS_SCHEMA,
        generated_at: "2026-01-01T00:00:00.000Z",
        gaps: [
          { expected_title: "Mujhe Tum Yaad Aana", heldout_rows: 1 },
          { expected_title: "Don't Stop Me Now", heldout_rows: 0 },
        ],
      }),
      "utf8",
    );
    const loaded = loadCoverageGaps(path);
    expect(loaded.present).toBe(true);
    expect(loaded.gapTitleNorms.has("mujhe tum yaad aana")).toBe(true);
    expect(loaded.gapTitleNorms.has("dont stop me now")).toBe(true); // apostrophe-insensitive
  });

  it("throws on a foreign schema instead of silently trusting it", () => {
    const path = join(tmp, "gaps-bad-schema.json");
    writeFileSync(path, JSON.stringify({ schema: "something.else.v9", gaps: [] }), "utf8");
    expect(() => loadCoverageGaps(path)).toThrow(/unexpected schema/);
  });
});

function inputWith(rows: Record<string, EvalRow[]>): ReportInput {
  const systems = [
    { name: "OmniBeat", withCi: undefined as never },
    { name: "Baseline A (naive first-hit)", withCi: undefined as never },
    { name: "Baseline B (token top-1)", withCi: undefined as never },
  ];
  return {
    runAt: "2026-01-01T00:00:00.000Z",
    runCount: 1,
    splitName: "heldout",
    totalCorpus: 2,
    tuneSize: 1,
    heldoutSize: 2,
    corpusSha256: "x",
    heldoutSha256: "y",
    fixtureCounts: [],
    replayCatalogEntries: 1,
    replayCatalogTitles: 1,
    answerable: {
      total: 1,
      withCatalogTitle: 1,
      excluded: 1,
      fullTotal: 2,
      excludedTitles: ["Mujhe Tum Yaad Aana"],
    },
    coverageGaps: { generatedAt: null, method: null, titles: ["Mujhe Tum Yaad Aana"] },
    serverPid: 1,
    results: systems,
    rowsBySystem: rows,
    toolErrors: {},
  };
}

describe("coverageFraction", () => {
  it("computes numerator/denominator and survives an empty denominator", () => {
    expect(coverageFraction({ total: 24, withCatalogTitle: 24, excluded: 1, fullTotal: 25, excludedTitles: [] })).toBe(1);
    expect(coverageFraction({ total: 0, withCatalogTitle: 0, excluded: 25, fullTotal: 25, excludedTitles: [] })).toBe(0);
  });
});

describe("diagnosticSummary", () => {
  it("flags replay-lookup misses on the SERVER systems and ignores baseline B's offline candidates", () => {
    // Utterance 1: both server systems saw nothing; baseline B always has a
    // candidate (offline token match) - this must still count as a lookup miss.
    // Utterance 2: OmniBeat saw a candidate -> not a miss.
    const rows = {
      OmniBeat: [row("u1", { decision: "not_found" }), row("u2", { decision: "ask", top1Title: "Blinding Lights" })],
      "Baseline A (naive first-hit)": [row("u1", { decision: "not_found" }), row("u2", { decision: "play", chosenTitle: "Blinding Lights", top1Title: "Blinding Lights" })],
      "Baseline B (token top-1)": [row("u1", { decision: "play", chosenTitle: "Blinding Lights", top1Title: "Blinding Lights" }), row("u2", { decision: "play", chosenTitle: "Blinding Lights", top1Title: "Blinding Lights" })],
    };
    const d = diagnosticSummary(inputWith(rows));
    expect(d.replay_lookup_miss.count).toBe(1);
    expect(d.replay_lookup_miss.ids).toEqual(["u1"]);
  });

  it("counts wrong auto-plays per system from rows", () => {
    const rows = {
      OmniBeat: [row("u1", { decision: "ask", top1Title: "Blinding Lights" })],
      "Baseline A (naive first-hit)": [row("u1", { decision: "play", chosenTitle: "Some Wrong Song", top1Title: "Some Wrong Song" })],
      "Baseline B (token top-1)": [row("u1", { decision: "play", chosenTitle: "Blinding Lights", top1Title: "Blinding Lights" })],
    };
    const d = diagnosticSummary(inputWith(rows));
    expect(Object.fromEntries(d.wrong_plays.map((w) => [w.system, w.count]))).toEqual({
      OmniBeat: 0,
      "Baseline A (naive first-hit)": 1,
      "Baseline B (token top-1)": 0,
    });
    expect(d.divergences).toHaveLength(1);
    expect(d.divergences[0]?.outcomes["Baseline A (naive first-hit)"]).toContain("played WRONG");
  });
});
