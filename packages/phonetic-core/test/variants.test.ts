import { describe, expect, it } from "vitest";
import { MAX_VARIANTS, generateVariants, skeletonToken } from "../src/index.js";
import type { RulesJson } from "../src/index.js";
import { loadPack } from "./helpers.js";

const hi = loadPack("hi-IN").rules;
const en = loadPack("en-US").rules;

/** Rules with an empty vowel table: respelling templates survive dedupe. */
const bareVowelRules: RulesJson = {
  ...en,
  id: "test-bare",
  vowels: {},
};

describe("generateVariants", () => {
  it("always starts with the identity variant", () => {
    const variants = generateVariants(["lollipop", "lagelu"], hi);
    expect(variants[0]).toBe("lollipop lagelu");
  });

  it("never exceeds the hard cap of 8 (even with large token lists)", () => {
    const many = Array.from({ length: 30 }, (_, i) => `tok${i}en`);
    const variants = generateVariants(many, en);
    expect(variants.length).toBeLessThanOrEqual(MAX_VARIANTS);
    expect(variants.length).toBeGreaterThan(0);
    expect(generateVariants(["a"], en, 999).length).toBeLessThanOrEqual(MAX_VARIANTS);
    expect(generateVariants(["a"], en, 0).length).toBe(1);
  });

  it("merges over-split ASR tokens (pairing patterns)", () => {
    const variants = generateVariants(["lolly", "pop", "la", "gelu"], hi);
    // literal concat of the ASR tokens; "lollypop" vs title "Lollipop"
    // differs by y/o and is reconciled by distance (≤1), not by spelling.
    expect(variants).toContain("lollypop lagelu");
  });

  it("merges a single adjacent pair", () => {
    const variants = generateVariants(["ice", "cream"], en);
    expect(variants).toContain("icecream");
  });

  it("splits long tokens at vowel boundaries", () => {
    const variants = generateVariants(["lollipop"], en);
    const hasSplit = variants.some((v) => v.split(" ").length === 2);
    expect(hasSplit).toBe(true);
  });

  it("emits respelling alternations when they change the skeleton", () => {
    // vowels {} means aa is NOT normalized back → template output survives
    const variants = generateVariants(["kata"], bareVowelRules);
    // vowel-length template a → aa produces a distinct skeleton
    const hasAa = variants.some((v) => v.includes("aa"));
    expect(hasAa).toBe(true);
    // aspirate template p → ph / t → th …
    expect(variants.length).toBeLessThanOrEqual(MAX_VARIANTS);
  });

  it("deduplicates by skeleton (no two variants normalize identically)", () => {
    const variants = generateVariants(["kata", "bala"], en);
    const keys = variants.map((v) =>
      v
        .split(" ")
        .map((t) => skeletonToken(t, en))
        .join(" "),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("handles empty and single-token input", () => {
    expect(generateVariants([], en)).toEqual([]);
    expect(generateVariants(["solo"], en)).toEqual(["solo"]);
  });

  it("never throws on arbitrary token content", () => {
    expect(() => generateVariants(["😀", "नम", "a-b"], hi)).not.toThrow();
  });
});
