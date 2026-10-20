import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  articulatoryDistance,
  canonicalize,
  generateVariants,
  metaphone,
  peel,
  resolveSkeletons,
  skeleton,
  symbolDistance,
  translit,
} from "../src/index.js";
import { listPacks, loadFixtures, loadPack } from "./helpers.js";

const packs = listPacks().map((id) => loadPack(id));
const en = loadPack("en-US");
const hi = loadPack("hi-IN");

/**
 * Mixed Unicode: Latin, digits, whitespace, punctuation, combining marks,
 * Devanagari, Arabic, Hebrew, emoji. maxLength keeps the O(n·m) DP cheap.
 */
const mixedArb = fc
  .array(
    fc.constantFrom(
      "a", "B", "e", "o", " ", "\t", "\n", "1", "'", "-", ".", ",",
      "é", "́", "नम", "दु", "ب", "א", "😀", "🎵", "א", "אָ", "ß", "K",
      "中", ".ng", "̈", "_", "/", "?", "!" ,
    ),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(""));

const plainArb = fc.string({ maxLength: 32 });

/** ASCII alphabet where case mapping is length-preserving and bijective. */
const caseArb = fc
  .array(
    fc.constantFrom(
      ..."abcxyzABCXYZ0123 \t'-.".split(""),
    ),
    { maxLength: 32 },
  )
  .map((parts) => parts.join(""));

describe("property: no crash on arbitrary Unicode", () => {
  it("all public transforms survive emoji/RTL/mixed input for every pack", () => {
    fc.assert(
      fc.property(mixedArb, (text) => {
        for (const pack of packs) {
          skeleton(text, pack.rules);
          translit(text, pack.translit);
          canonicalize(text, pack.translit);
          const peeled = peel(text, pack);
          generateVariants(peeled.tokens, pack.rules);
          metaphone(text);
          articulatoryDistance(text, "probe", pack.rules);
          resolveSkeletons(text, ["Probe Title", ""], pack);
        }
      }),
      { numRuns: 120 },
    );
  });

  it("survives plain fuzzed strings too", () => {
    fc.assert(
      fc.property(plainArb, (text) => {
        expect(articulatoryDistance(text, text, en.rules)).toBe(0);
        resolveSkeletons(text, [text], hi);
      }),
      { numRuns: 120 },
    );
  });
});

describe("property: distance identities", () => {
  it("identity distance(x, x) === 0", () => {
    fc.assert(
      fc.property(mixedArb, (x) => {
        for (const pack of packs) {
          expect(articulatoryDistance(x, x, pack.rules)).toBe(0);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("case/whitespace stability: distance(s,t) === distance(UPPER(s), lower(t))", () => {
    // Scoped to an ASCII alphabet: full-Unicode case folding is not
    // length-preserving (ß → SS, İ → i̇), so the guarantee is stated exactly
    // where case maps are bijective.
    fc.assert(
      fc.property(caseArb, caseArb, (s, t) => {
        const base = articulatoryDistance(s, t, en.rules);
        expect(articulatoryDistance(s.toUpperCase(), t.toLowerCase(), en.rules)).toBe(base);
      }),
      { numRuns: 200 },
    );
  });

  it("whitespace scattering does not change distance", () => {
    const scatter = (x: string): string => ` \t${x.replace(/ /gu, "   ")}\n `;
    fc.assert(
      fc.property(caseArb, caseArb, (s, t) => {
        expect(articulatoryDistance(scatter(s), scatter(t), en.rules)).toBe(
          articulatoryDistance(s, t, en.rules),
        );
      }),
      { numRuns: 200 },
    );
  });

  it("distance is symmetric", () => {
    fc.assert(
      fc.property(mixedArb, mixedArb, (a, b) => {
        expect(articulatoryDistance(a, b, en.rules)).toBeCloseTo(
          articulatoryDistance(b, a, en.rules),
          10,
        );
      }),
      { numRuns: 150 },
    );
  });
});

describe("property: triangle inequality (class metric + Levenshtein)", () => {
  it("d(a,c) <= d(a,b) + d(b,c)", () => {
    fc.assert(
      fc.property(mixedArb, mixedArb, mixedArb, (a, b, c) => {
        const ac = articulatoryDistance(a, c, en.rules);
        const ab = articulatoryDistance(a, b, en.rules);
        const bc = articulatoryDistance(b, c, en.rules);
        expect(ac).toBeLessThanOrEqual(ab + bc + 1e-9);
      }),
      { numRuns: 200 },
    );
  });

  it("holds for the hi-IN pack too", () => {
    fc.assert(
      fc.property(mixedArb, mixedArb, mixedArb, (a, b, c) => {
        const ac = articulatoryDistance(a, c, hi.rules);
        const ab = articulatoryDistance(a, b, hi.rules);
        const bc = articulatoryDistance(b, c, hi.rules);
        expect(ac).toBeLessThanOrEqual(ab + bc + 1e-9);
      }),
      { numRuns: 120 },
    );
  });
});

describe("property: monotonicity of substitution by class distance", () => {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const clusterKeys = new Set([
    ...Object.keys(en.rules.digraphs),
    ...Object.keys(en.rules.vowels),
  ]);
  const formsKey = (left: string, right: string): boolean =>
    left.length > 0 && right.length > 0 && clusterKeys.has(left + right);

  it("substituting one symbol with a strictly more distant class never decreases distance", () => {
    // Construction: base string and both candidates are identical outside
    // position i, and the swap at i forms no pack cluster with its
    // neighbours (pack tables only contain keys of length ≥ 2, so single
    // symbols pass the skeleton 1:1). Under those preconditions the aligned
    // path is optimal (any shift costs ≥ 2·indel > max substitution cost),
    // so distance equals the class cost pointwise and must be monotone.
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...[...letters, " "]), {
          minLength: 1,
          maxLength: 24,
        }),
        fc.nat(60),
        fc.constantFrom(...letters),
        fc.constantFrom(...letters),
        (chars, rawIndex, z, y) => {
          const s = chars.join("");
          const i = rawIndex % s.length;
          const original = s[i]!;
          if (original === z || original === y) return;

          const prev = i > 0 ? s[i - 1]! : "";
          const next = i + 1 < s.length ? s[i + 1]! : "";
          fc.pre(!formsKey(prev, original) && !formsKey(original, next));
          fc.pre(!formsKey(prev, z) && !formsKey(z, next));
          fc.pre(!formsKey(prev, y) && !formsKey(y, next));

          const dZ = symbolDistance(original, z, en.rules);
          const dY = symbolDistance(original, y, en.rules);
          fc.pre(dY > dZ);

          const withZ = s.slice(0, i) + z + s.slice(i + 1);
          const withY = s.slice(0, i) + y + s.slice(i + 1);
          const base = articulatoryDistance(s, withZ, en.rules);
          const farther = articulatoryDistance(s, withY, en.rules);
          expect(farther).toBeGreaterThanOrEqual(base - 1e-9);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("pointwise class cost is monotone by construction on single symbols", () => {
    const symbols = [...letters, "a", "e", "i", "o", "u"];
    fc.assert(
      fc.property(
        fc.constantFrom(...symbols),
        fc.constantFrom(...symbols),
        fc.constantFrom(...symbols),
        (base, z, y) => {
          const dZ = symbolDistance(base, z, en.rules);
          const dY = symbolDistance(base, y, en.rules);
          if (dY <= dZ) return;
          expect(articulatoryDistance(base, y, en.rules)).toBeGreaterThanOrEqual(
            articulatoryDistance(base, z, en.rules) - 1e-9,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("property: pipeline sanity on fuzzed input", () => {
  it("resolveSkeletons keeps identity ranking when query === candidate", () => {
    fc.assert(
      fc.property(mixedArb, (q) => {
        const pack = en;
        const ranked = resolveSkeletons(q, [q], pack);
        expect(ranked).toHaveLength(1);
        // distance is never negative and the winner is the only candidate
        expect(ranked[0]!.distance).toBeGreaterThanOrEqual(0);
        expect(ranked[0]!.candidate).toBe(q);
      }),
      { numRuns: 100 },
    );
  });

  it("variant generation stays bounded under fuzz", () => {
    fc.assert(
      fc.property(fc.array(plainArb, { maxLength: 12 }), (tokens) => {
        const variants = generateVariants(tokens, hi.rules);
        expect(variants.length).toBeLessThanOrEqual(8);
        expect(loadFixtures("hi-IN").length).toBeGreaterThanOrEqual(12);
      }),
      { numRuns: 60 },
    );
  });
});
