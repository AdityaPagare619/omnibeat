/**
 * AC05-calibration — Charter Part 8.5 AC-05 (blueprint §7.2 evaluation harness).
 *
 * The reliability diagram computed on the held-out split stays within the
 * tolerance we declared. Tolerance and the held-out results are artifacts of
 * `make eval` (@omnibeat/eval); the assertions below are artifact-level so they
 * pin the *claim*, not the implementation.
 *
 * Expected artifact (Phase 2+): eval/calibration/held-out-reliability.json with
 *   { committed_at_commit: <sha>, declared_tolerance: <ece max>, bins: [{lo, hi, count, mean_confidence, empirical_accuracy, ci_low, ci_high}] }
 * depends: ARCH contract v0 / eval harness — exact artifact path + shape.
 */
import { describe, expect, it } from "vitest";
import { readRepoJson, repoPathExists } from "../helpers/repo";

const ARTIFACT = "eval/calibration/held-out-reliability.json";

interface ReliabilityArtifact {
  committed_at_commit?: string;
  declared_tolerance: number;
  bins: Array<{
    lo: number;
    hi: number;
    count: number;
    mean_confidence: number;
    empirical_accuracy: number;
    ci_low?: number;
    ci_high?: number;
  }>;
}

describe("AC05-calibration", () => {
  it("AC05-calibration/ece-within-tolerance: reliability diagram ECE on the held-out set is within the declared tolerance", () => {
    expect(repoPathExists(ARTIFACT), `eval artifact ${ARTIFACT} must exist — run make eval (NOT IMPLEMENTED at Phase 0)`).toBe(true);
    const artifact = readRepoJson<ReliabilityArtifact>(ARTIFACT);
    expect(artifact.declared_tolerance, "artifact must record the tolerance declared before the run").toBeGreaterThan(0);
    const total = artifact.bins.reduce((sum, b) => sum + b.count, 0);
    expect(total, "reliability diagram must cover the whole held-out set").toBeGreaterThan(0);
    const ece = artifact.bins.reduce((sum, b) => sum + (b.count / total) * Math.abs(b.mean_confidence - b.empirical_accuracy), 0);
    expect(ece, `ECE ${ece.toFixed(4)} must be within declared tolerance ${artifact.declared_tolerance}`).toBeLessThanOrEqual(
      artifact.declared_tolerance,
    );
  });

  it("AC05-calibration/diagram-bins-have-ci: every reliability bin reports count and an empirical-accuracy CI", () => {
    expect(repoPathExists(ARTIFACT), `eval artifact ${ARTIFACT} must exist — run make eval (NOT IMPLEMENTED at Phase 0)`).toBe(true);
    const artifact = readRepoJson<ReliabilityArtifact>(ARTIFACT);
    expect(artifact.bins.length, "reliability diagram must have bins").toBeGreaterThan(0);
    for (const bin of artifact.bins) {
      expect(bin.count, `bin [${bin.lo},${bin.hi}) must have observations`).toBeGreaterThan(0);
      expect(bin.ci_low, `bin [${bin.lo},${bin.hi}) must carry a bootstrap CI low bound (blueprint §7.2)`).toBeDefined();
      expect(bin.ci_high, `bin [${bin.lo},${bin.hi}) must carry a bootstrap CI high bound (blueprint §7.2)`).toBeDefined();
      expect(bin.ci_low!).toBeLessThanOrEqual(bin.empirical_accuracy);
      expect(bin.ci_high!).toBeGreaterThanOrEqual(bin.empirical_accuracy);
    }
  });
});
