/**
 * AC20-numbers-map-to-artifacts — Charter Part 8.5 AC-20 (blueprint §7.2 "do not fabricate results", §9.2).
 *
 * Every number in the README, Devpost entry and video script maps to an
 * artifact in eval/ or results/ at a recorded commit. The extractor below is
 * real and stays strict: a claim number with no matching artifact is a failure.
 *
 * depends: ARCH contract v0 / DOC — the exact claim-document filenames
 * (README.md, DEVPOST.md, docs/VIDEO_SCRIPT.md) and the artifact layout under
 * eval/ and results/.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findFiles, REPO_ROOT, rel } from "../helpers/repo";

const CLAIM_DOCS = ["README.md", "DEVPOST.md", "docs/VIDEO_SCRIPT.md"];
const ARTIFACT_DIRS = ["eval", "results"];

/** Numbers that are structural, not claims: years, versions, ports, trivially small integers (1..12). */
const NON_CLAIM = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);

function extractClaimNumbers(text: string): string[] {
  // Strip fenced code blocks, inline code, and headings-with-versions to reduce noise.
  const cleaned = text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const matches = cleaned.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  return [...new Set(matches)].filter((m) => {
    const bare = m.replace(/%$/, "");
    if (NON_CLAIM.has(bare)) return false;
    if (/^20\d{2}$/.test(bare)) return false; // years
    if (/^v?\d+\.\d+\.\d+$/.test(bare)) return false; // semver
    return true;
  });
}

function artifactFiles(): string[] {
  return ARTIFACT_DIRS.flatMap((dir) => findFiles(`${REPO_ROOT}/${dir}`, /\.(json|jsonl|md|csv|txt)$/));
}

describe("AC20-numbers-map-to-artifacts", () => {
  it("AC20-numbers-map-to-artifacts/claims-map-to-artifacts: every README/Devpost/video number maps to an eval/ or results/ artifact", () => {
    const presentDocs = CLAIM_DOCS.filter((d) => existsSync(`${REPO_ROOT}/${d}`));
    expect(
      presentDocs.length,
      `none of the claim documents ${CLAIM_DOCS.join(", ")} exist — nothing to audit at Phase 0 (AC-20 NOT IMPLEMENTED)`,
    ).toBeGreaterThan(0);
    const artifacts = artifactFiles();
    expect(
      artifacts.length,
      `no artifacts under ${ARTIFACT_DIRS.join("/")} — every marketing number would be unmapped (AC-20, blueprint §7.2 "do not fabricate results")`,
    ).toBeGreaterThan(0);
    const artifactText = artifacts.map((f) => readFileSync(f, "utf8")).join("\n");
    const unmapped: Array<{ doc: string; number: string }> = [];
    for (const doc of presentDocs) {
      const numbers = extractClaimNumbers(readFileSync(`${REPO_ROOT}/${doc}`, "utf8"));
      for (const number of numbers) {
        if (!artifactText.includes(number.replace(/%$/, ""))) unmapped.push({ doc: rel(`${REPO_ROOT}/${doc}`), number });
      }
    }
    expect(unmapped, `these claim numbers have no artifact backing in eval/ or results/: ${JSON.stringify(unmapped)}`).toEqual([]);
  });

  it("AC20-numbers-map-to-artifacts/recorded-commit-stamp: the results manifest pins the commit the numbers were produced at", () => {
    // Contract: results/MANIFEST.json (or eval/MANIFEST.json) records the commit sha of the
    // run that produced every published number, so a claim can be traced to its artifact.
    const manifest = ["results/MANIFEST.json", "eval/MANIFEST.json"].find((p) => existsSync(`${REPO_ROOT}/${p}`));
    expect(manifest, "results/MANIFEST.json or eval/MANIFEST.json must exist and pin a commit sha (AC-20)").toBeDefined();
    const data = JSON.parse(readFileSync(`${REPO_ROOT}/${manifest!}`, "utf8")) as { commit?: string };
    expect(data.commit, "manifest must record the commit the numbers were produced at").toMatch(/^[0-9a-f]{7,40}$/);
  });
});
