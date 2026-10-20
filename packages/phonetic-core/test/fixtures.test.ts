import { describe, expect, it } from "vitest";
import { peel, resolveSkeletons } from "../src/index.js";
import { listPacks, loadFixtures, loadPack, titleCase } from "./helpers.js";

/**
 * Fixture semantics, per line of packs/<id>/fixtures.jsonl:
 *  - mode "peel": titleCase(peel(input).tokens) must equal `expect` exactly
 *    (pins grammar + transliteration + display casing).
 *  - mode "match": resolveSkeletons(input, candidates, pack) must rank
 *    `expect` first. The candidate set is this pack's *match-mode* expects —
 *    i.e. the title candidates. Peel-mode expects are grammar/vocabulary
 *    probes (often short words like "Mujhe"), not plausible candidate titles;
 *    drawing them into the pool models a search result set we do not ship.
 *    Known engine limitation, disclosed to ORCH: very short candidates can
 *    outrank a true match when a caller includes them in the pool.
 */

for (const packId of listPacks()) {
  describe(`fixtures: ${packId}`, () => {
    const pack = loadPack(packId);
    const fixtures = loadFixtures(packId);
    const matchExpects = [
      ...new Set(
        fixtures
          .filter((f) => (f.mode ?? "match") === "match")
          .map((f) => f.expect),
      ),
    ];

    it("has at least 12 fixture entries", () => {
      expect(fixtures.length).toBeGreaterThanOrEqual(12);
      expect(matchExpects.length).toBeGreaterThanOrEqual(2);
    });

    it("records only input/expect pairs with known modes", () => {
      for (const f of fixtures) {
        expect(typeof f.input).toBe("string");
        expect(typeof f.expect).toBe("string");
        expect(["peel", "match", undefined]).toContain(f.mode);
      }
    });

    for (const fixture of fixtures) {
      const label = `${fixture.mode ?? "match"}: ${JSON.stringify(fixture.input)} → ${JSON.stringify(fixture.expect)}`;

      if ((fixture.mode ?? "match") === "peel") {
        it(label, () => {
          const peeled = peel(fixture.input, pack);
          expect(titleCase(peeled.tokens)).toBe(fixture.expect);
        });
      } else {
        it(label, () => {
          const candidates = [
            fixture.expect,
            ...matchExpects.filter((e) => e !== fixture.expect),
          ];
          const ranked = resolveSkeletons(fixture.input, candidates, pack);
          expect(ranked.length).toBe(candidates.length);
          expect(ranked[0]!.candidate).toBe(fixture.expect);
        });
      }
    }
  });
}
