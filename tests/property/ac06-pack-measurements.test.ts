/**
 * AC06-pack-measurements — Charter Part 8.5 AC-06 (blueprint §7.1).
 *
 * Every shipped locale pack has a measured wrong-play rate with confidence
 * intervals alongside the baselines; a pack without measurements ships tagged
 * "experimental".
 *
 * Pack layout (blueprint §7.1): packages/phonetic-core/packs/<locale>/pack.json.
 * depends: ARCH contract v0 — exact pack.json measurement block keys; the
 * assertions below pin the semantics (measured wrong-play rate + CI or
 * experimental tag), not the exact key names' casing.
 */
import { describe, expect, it } from "vitest";
import { findFiles, rel, repoPathExists } from "../helpers/repo";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { REPO_ROOT } from "../helpers/repo";

const PACKS_DIR = "packages/phonetic-core/packs";

interface PackManifest {
  id?: string;
  status?: string;
  reviewer?: unknown;
  measured?: {
    wrong_play_rate?: { point?: number; ci_low?: number; ci_high?: number };
    baselines?: unknown;
  };
}

function loadPacks(): Array<{ file: string; manifest: PackManifest }> {
  const files = findFiles(join(REPO_ROOT, PACKS_DIR), /^pack\.json$/);
  return files.map((file) => ({ file: rel(file), manifest: JSON.parse(readFileSync(file, "utf8")) as PackManifest }));
}

describe("AC06-pack-measurements", () => {
  it("AC06-pack-measurements/measured-wrong-play-rate: every non-experimental shipped pack reports wrong-play rate with CIs", () => {
    const packs = loadPacks();
    expect(packs.length, `no locale packs found under ${PACKS_DIR} — packs are NOT IMPLEMENTED at Phase 0`).toBeGreaterThan(0);
    for (const { file, manifest } of packs) {
      if (manifest.status === "experimental") continue;
      const wpr = manifest.measured?.wrong_play_rate;
      expect(wpr?.point !== undefined, `${file}: non-experimental pack must report a measured wrong_play_rate point`).toBe(true);
      expect(wpr?.ci_low !== undefined, `${file}: wrong_play_rate must carry a CI low bound (AC-06)`).toBe(true);
      expect(wpr?.ci_high !== undefined, `${file}: wrong_play_rate must carry a CI high bound (AC-06)`).toBe(true);
      expect(wpr?.ci_low!).toBeLessThanOrEqual(wpr?.point!);
      expect(wpr?.ci_high!).toBeGreaterThanOrEqual(wpr?.point!);
      expect(manifest.measured?.baselines !== undefined, `${file}: measurements must sit alongside baselines (blueprint §7.2)`).toBe(true);
    }
  });

  it("AC06-pack-measurements/unmeasured-ships-experimental: packs without measurements are tagged experimental", () => {
    const packs = loadPacks();
    expect(packs.length, `no locale packs found under ${PACKS_DIR} — packs are NOT IMPLEMENTED at Phase 0`).toBeGreaterThan(0);
    for (const { file, manifest } of packs) {
      const measured = manifest.measured?.wrong_play_rate?.point !== undefined;
      if (!measured) {
        expect(manifest.status, `${file}: pack without measurements must ship as "experimental" (AC-06)`).toBe("experimental");
      }
    }
  });

  it("AC06-pack-measurements/pack-resource-exposed: pack measurements are readable via omnibeat://packs/{locale}", () => {
    // depends: ARCH contract v0 — resources/read transport for omnibeat://packs/{locale} (§5.3).
    expect(repoPathExists(PACKS_DIR), `packs directory ${PACKS_DIR} must exist`).toBe(true);
    expect(false, "NOT IMPLEMENTED — AC06 pack-resource-exposed: needs resources/read against omnibeat://packs/{locale} (Phase 2)").toBe(true);
  });
});
