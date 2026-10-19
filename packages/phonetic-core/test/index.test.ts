import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISTANCE_CONFIG,
  explainQuery,
  resolveSkeletons,
} from "../src/index.js";
import { loadPack } from "./helpers.js";

const en = loadPack("en-US");
const hi = loadPack("hi-IN");

describe("resolveSkeletons", () => {
  it("ranks an exact match first with distance 0 and a full trace", () => {
    const ranked = resolveSkeletons(
      "play blinding lights",
      ["Despacito", "Blinding Lights", "Wonderwall"],
      en,
    );
    expect(ranked).toHaveLength(3);
    const top = ranked[0]!;
    expect(top.candidate).toBe("Blinding Lights");
    expect(top.distance).toBe(0);
    expect(top.variant).toBe("blinding lights");
    expect(top.querySkeleton).toBe(top.candidateSkeleton);
    expect(top.querySkeleton).toBe("blindin lits"); // ng→n, igh→i
    expect(top.index).toBe(1);
    expect(top.metaphone.query.length).toBeGreaterThan(0);
  });

  it("returns candidates sorted by ascending distance", () => {
    const ranked = resolveSkeletons("blinding lites", ["Night Fever", "Blinding Lights", "Despacito"], en);
    const distances = ranked.map((m) => m.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(ranked[0]!.candidate).toBe("Blinding Lights");
  });

  it("uses the best of ≤8 respelling variants and reports which one won", () => {
    const ranked = resolveSkeletons("lolly pop la gelu", ["Lollipop Lagelu", "Raja Ji"], hi);
    expect(ranked[0]!.candidate).toBe("Lollipop Lagelu");
    expect(ranked[0]!.distance).toBeLessThanOrEqual(1);
    expect(ranked[0]!.variant).toBe("lollypop lagelu"); // pair-merge variant
    // y/o spelling difference survives in the skeletons (distance 1) —
    // recorded honestly in the trace rather than papered over:
    expect(ranked[0]!.querySkeleton).toBe("lollypop lagelu");
    expect(ranked[0]!.candidateSkeleton).toBe("lollipop lagelu");
  });

  it("matches Devanagari and Hinglish spellings of the same title", () => {
    const alts = ["Mujhe Tum Yaad Aana", "Lollipop Lagelu"];
    const devanagari = resolveSkeletons("मुझे तुम याद आना", alts, hi);
    const hinglish = resolveSkeletons("mujhe tum yaad aana", alts, hi);
    expect(devanagari[0]!.candidate).toBe("Mujhe Tum Yaad Aana");
    expect(hinglish[0]!.candidate).toBe("Mujhe Tum Yaad Aana");
    expect(devanagari[0]!.distance).toBe(hinglish[0]!.distance);
  });

  it("handles empty/stripped queries without crashing", () => {
    const ranked = resolveSkeletons("hey alexa please", ["Wonderwall"], en);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.candidate).toBe("Wonderwall");
    expect(ranked[0]!.distance).toBeGreaterThan(0);
    expect(ranked[0]!.querySkeleton).toBe("");
  });

  it("handles empty candidate list", () => {
    expect(resolveSkeletons("anything", [], en)).toEqual([]);
  });

  it("honours weight overrides", () => {
    const alts = ["Blinding Lights"];
    const base = resolveSkeletons("play blinding lights", alts, en)[0]!.distance;
    const strict = resolveSkeletons("play blinding lights", alts, en, {
      weights: { indel: 4, vowelConsonant: 4, knownUnknown: 4, spaceMismatch: 4, unknownDiff: 4 },
    })[0]!.distance;
    expect(base).toBe(0); // skeletons identical → still 0 under any weights
    expect(strict).toBe(0);
    // a real substitution changes under weights
    // "mad" has no letters that spawn a non-deduped respelling variant
    // (a→aa normalizes back to the same skeleton), so the distance is
    // exactly one m→b substitution: same place, different manner.
    const b2 = resolveSkeletons("mad", ["bad"], en)[0]!.distance;
    const s2 = resolveSkeletons("mad", ["bad"], en, {
      weights: { consonantManner: 0.9 },
    })[0]!.distance;
    expect(b2).toBeCloseTo(DEFAULT_DISTANCE_CONFIG.consonantManner, 10);
    expect(s2).toBeCloseTo(0.9, 10);
  });

  it("clamps maxVariants to ≤8", () => {
    const ctx = explainQuery("one two three four five six seven eight nine", en);
    expect(ctx.variants.length).toBeLessThanOrEqual(8);
    expect(ctx.variants[0]).toBe(
      "one two three four five six seven eight nine",
    );
  });

  it("exposes intent detection through explainQuery", () => {
    const ctx = explainQuery("play wonderwall by oasis live", en);
    expect(ctx.intent.live).toBe(true);
    expect(ctx.intent.artist).toBe("oasis");
    expect(ctx.queryTokens).toEqual(["wonderwall"]);
  });

  it("never throws on arbitrary query strings", () => {
    for (const q of ["😀", "नमस्ते", "", "   ", "!!!", "a".repeat(300)]) {
      expect(() => resolveSkeletons(q, ["Wonderwall", ""], en)).not.toThrow();
    }
  });
});
