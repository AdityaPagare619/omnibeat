import { describe, expect, it } from "vitest";
import {
  articulatoryDistance,
  DEFAULT_DISTANCE_CONFIG,
  symbolDistance,
} from "../src/index.js";
import { loadPack } from "./helpers.js";

const en = loadPack("en-US").rules;

const d = (a: string, b: string): number => articulatoryDistance(a, b, en);

describe("symbolDistance (class costs)", () => {
  it("same symbol is free", () => {
    expect(symbolDistance("b", "b", en)).toBe(0);
    expect(symbolDistance(" ", " ", en)).toBe(0);
  });

  it("voicing neighbours of the same place and manner are cheap", () => {
    expect(symbolDistance("p", "b", en)).toBe(DEFAULT_DISTANCE_CONFIG.consonantVoicing);
    expect(symbolDistance("t", "d", en)).toBe(DEFAULT_DISTANCE_CONFIG.consonantVoicing);
  });

  it("manner and place neighbours cost more than voicing, far less than category crossing", () => {
    expect(symbolDistance("s", "t", en)).toBe(DEFAULT_DISTANCE_CONFIG.consonantManner);
    expect(symbolDistance("p", "k", en)).toBe(DEFAULT_DISTANCE_CONFIG.consonantPlace);
    expect(symbolDistance("p", "z", en)).toBe(DEFAULT_DISTANCE_CONFIG.consonantFar);
    expect(symbolDistance("a", "b", en)).toBe(DEFAULT_DISTANCE_CONFIG.vowelConsonant);
  });

  it("vowel neighbourhood follows the height/frontness grid", () => {
    expect(symbolDistance("i", "e", en)).toBe(DEFAULT_DISTANCE_CONFIG.vowelNear); // same frontness
    expect(symbolDistance("i", "u", en)).toBe(DEFAULT_DISTANCE_CONFIG.vowelNear); // same height
    expect(symbolDistance("i", "a", en)).toBe(DEFAULT_DISTANCE_CONFIG.vowelFar);
  });

  it("unknown symbols use fallback costs", () => {
    expect(symbolDistance("😀", "b", en)).toBe(DEFAULT_DISTANCE_CONFIG.knownUnknown);
    expect(symbolDistance("😀", "🎵", en)).toBe(DEFAULT_DISTANCE_CONFIG.unknownDiff);
  });

  it("is symmetric for every class pair", () => {
    const symbols = ["a", "e", "b", "p", "t", "s", "x", "h", " ", "😀"];
    for (const x of symbols) {
      for (const y of symbols) {
        expect(symbolDistance(x, y, en)).toBeCloseTo(symbolDistance(y, x, en), 10);
      }
    }
  });
});

describe("articulatoryDistance", () => {
  it("identity distance is 0", () => {
    expect(d("blinding lights", "blinding lights")).toBe(0);
    expect(d("", "")).toBe(0);
  });

  it("is case and whitespace stable", () => {
    expect(d("Blinding Lights", "BLINDING lights")).toBe(0);
    expect(d("  blinding \t lights ", "blinding lights")).toBe(0);
    expect(d("a b", "a b")).toBe(d("A B", "a b"));
  });

  it("is symmetric", () => {
    expect(d("nite fever", "night fever")).toBe(d("night fever", "nite fever"));
    expect(d("roger", "raja")).toBe(d("raja", "roger"));
  });

  it("charges indel per missing symbol", () => {
    expect(d("", "abc")).toBeCloseTo(3 * DEFAULT_DISTANCE_CONFIG.indel, 10);
    expect(d("ab", "a b")).toBeCloseTo(DEFAULT_DISTANCE_CONFIG.indel, 10);
  });

  it("ranks a voicing-neighbour substitution below a category crossing", () => {
    expect(d("pat", "bat")).toBeLessThan(d("pat", "bat" + "z"));
    expect(d("bit", "pit")).toBeLessThan(d("bit", "pet"));
  });

  it("exposes weights through the config parameter", () => {
    const defaultCost = d("pat", "bat");
    const custom = articulatoryDistance("pat", "bat", en, {
      consonantVoicing: 0.75,
    });
    expect(defaultCost).toBeCloseTo(DEFAULT_DISTANCE_CONFIG.consonantVoicing, 10);
    expect(custom).toBeCloseTo(0.75, 10);
    // unrelated pair must be untouched by the override
    expect(articulatoryDistance("pat", "pat", en, { consonantVoicing: 0.75 })).toBe(0);
  });
});
