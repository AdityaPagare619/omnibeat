/**
 * AC18-secrets-audit — Charter Part 8.5 AC-18 (blueprint §9 ethics / §12.5 submission checklist).
 *
 * 1. Secret scan is clean (gitleaks over the full history + working tree).
 * 2. Dependency audit has no unwaived high-severity findings (waivers expire).
 * 3. Containers run as non-root.
 *
 * Secrets + audit halves run their real tooling in Phase 2 (CI); the skeleton
 * asserts the waiver-policy artifact contract and the Dockerfile scan here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findFiles, readRepoJson, rel, REPO_ROOT, repoPathExists } from "../helpers/repo";

const WAIVERS = "security/waivers.json";

interface Waiver {
  finding: string;
  severity: "high" | "critical";
  justification: string;
  expires: string; // ISO date
}

describe("AC18-secrets-audit", () => {
  it("AC18-secrets-audit/secret-scan-clean: gitleaks reports zero secrets across history and working tree", async () => {
    // TODO harness (Phase 2): CI job runs `gitleaks detect --source . --redact --exit-code 1`
    // (and `gitleaks detect --log-opts="--all"` for history); test asserts exit 0 with zero
    // findings. Skeleton asserts the config file that pins the scan contract exists.
    expect(repoPathExists(".gitleaks.toml"), "repo must pin a gitleaks config (.gitleaks.toml) — AC-18 contract artifact (NOT IMPLEMENTED at Phase 0)").toBe(true);
    expect(false, "NOT IMPLEMENTED — AC18 secret-scan-clean: gitleaks CI wiring required (Phase 2)").toBe(true);
  });

  it("AC18-secrets-audit/no-unwaived-high-findings: dependency audit high/critical findings are zero or explicitly waived and unexpired", () => {
    // TODO harness (Phase 2): CI runs `npm audit --audit-level=high` (+ pip/poetry audit for
    // Python deps); findings cross-checked against security/waivers.json; any unwaived high
    // or critical finding, or any waiver past its expires date, fails the test.
    // The skeleton validates the waiver artifact contract itself (shape + no expired waivers).
    expect(repoPathExists(WAIVERS), `waiver file ${WAIVERS} must exist (may be an empty list) — AC-18 contract artifact`).toBe(true);
    const waivers = readRepoJson<Waiver[]>(WAIVERS);
    const today = new Date().toISOString().slice(0, 10);
    for (const waiver of waivers) {
      expect(waiver.justification, "every waiver needs a justification").toBeTruthy();
      expect(waiver.expires, "every waiver needs an expiry date").toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(waiver.expires >= today, `waiver for ${waiver.finding} expired on ${waiver.expires}`).toBe(true);
    }
  });

  it("AC18-secrets-audit/containers-non-root: every container stage runs as a non-root USER", () => {
    const dockerfiles = findFiles(REPO_ROOT, /^Dockerfile(\..*)?$/i);
    expect(dockerfiles.length, "no Dockerfiles found — containers NOT IMPLEMENTED at Phase 0 (AC-18)").toBeGreaterThan(0);
    for (const file of dockerfiles) {
      const content = readFileSync(file, "utf8");
      // Strip comments so commented-out USER lines don't count.
      const effective = content
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n");
      const userLines = effective.match(/^USER\s+\S+.*$/gim) ?? [];
      const lastUser = userLines.at(-1);
      expect(lastUser, `${rel(file)} must end with a USER directive (AC-18 containers-non-root)`).toBeDefined();
      expect(
        lastUser ?? "",
        `${rel(file)}: last USER must be non-root (not 'root' or '0')`,
      ).not.toMatch(/^(USER\s+)?(root|0)\s*$/i);
    }
  });
});
