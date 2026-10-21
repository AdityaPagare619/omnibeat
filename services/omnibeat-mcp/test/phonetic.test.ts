/**
 * B-PHON swap tests: @omnibeat/phonetic-core wired into the resolver.
 *
 * Pure unit tests (no spawned server): pack loading at startup, locale pack
 * selection, Hinglish/mangled/Devanagari title ranking via articulatory
 * distance, distance finiteness + monotonicity, and the scoring feature
 * (neutral when absent, monotone when present).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PACK_ID,
  distanceToSimilarity,
  loadedPackIds,
  pickPackId,
  scoreTitlePhonetics,
} from "../src/resolver/phonetic.js";
import { PHONETIC_NEUTRAL, scoreCandidate } from "../src/resolver/scoring.js";

const DISTRACTORS = ["Ji ji ji", "Tera Ban Jaunga", "Janewale Babu Kiya Hai Tune Jadu"];

describe("phonetic packs (loaded once at startup, no per-request IO)", () => {
  it("all three locale packs load: en-US, hi-IN, es-US", () => {
    expect(loadedPackIds()).toEqual(["en-US", "hi-IN", "es-US"]);
  });

  it("pack selection follows locale, then script, then default", () => {
    expect(pickPackId(undefined, undefined)).toBe(DEFAULT_PACK_ID);
    expect(pickPackId("anything", "hi-IN")).toBe("hi-IN");
    expect(pickPackId("anything", "es-MX")).toBe("es-US");
    // Devanagari input with NO locale (ASR hosts often omit it) -> hi-IN
    expect(pickPackId("काला चश्मा", undefined)).toBe("hi-IN");
    expect(pickPackId("play kala chashma", "en-US")).toBe("en-US");
  });
});

describe("Hinglish / mangled / Devanagari ranking via phonetic distance", () => {
  it("mangled Hinglish query ranks the right title highest", () => {
    const titles = ["Raja Ji (Insta Mix)", ...DISTRACTORS, "Kala Chashma"];
    const r = scoreTitlePhonetics("kala chasma", [], titles, "en-US");
    expect(r.packId).toBe("en-US");
    const top = r.perTitle[0];
    expect(top?.title).toBe("Kala Chashma");
    // strong separation from the nearest distractor
    const next = r.perTitle[1];
    expect(next?.distance).toBeGreaterThan(top?.distance as number);
    expect(top?.similarity).toBeGreaterThan(0.5);
    expect(next?.similarity).toBeLessThan(0.25);
  });

  it("Devanagari query (no locale) uses hi-IN pack, transliterates, and carries the variant trace", () => {
    const r = scoreTitlePhonetics("काला चश्मा", [], ["Ji ji ji", "Kala Chashma", ...DISTRACTORS]);
    expect(r.packId).toBe("hi-IN");
    const top = r.perTitle[0];
    expect(top?.title).toBe("Kala Chashma");
    expect(top?.packId).toBe("hi-IN");
    // variant trace: the winning respelling is Latin (translit evidence)
    expect(top?.variant).toMatch(/^[a-z\s]+$/);
    expect(top?.variant.length).toBeGreaterThan(0);
    // distance of the transliterated match is small vs a true mismatch
    expect(top?.distance).toBeLessThan(2);
  });

  it("ASR n-best alternatives can only improve (never worsen) the best distance", () => {
    const titles = ["Kala Chashma", ...DISTRACTORS];
    const primaryOnly = scoreTitlePhonetics("kala chashm", [], titles, "en-US");
    const withAlt = scoreTitlePhonetics("kala chashm", ["kala chasma"], titles, "en-US");
    const a = primaryOnly.perTitle.find((p) => p.title === "Kala Chashma");
    const b = withAlt.perTitle.find((p) => p.title === "Kala Chashma");
    expect(a && b).toBeTruthy();
    expect(b?.distance).toBeLessThanOrEqual(a?.distance as number);
  });
});

describe("distance: finite, bounded-similar, monotone", () => {
  it("distance is finite; similarity is 1 for identical, strictly decreasing as distance grows", () => {
    const r = scoreTitlePhonetics("kala chashma", [], ["Kala Chashma", ...DISTRACTORS], "en-US");
    for (const p of r.perTitle) {
      expect(Number.isFinite(p.distance)).toBe(true);
      expect(p.distance).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.similarity)).toBe(true);
      expect(p.similarity).toBeGreaterThan(0);
      expect(p.similarity).toBeLessThanOrEqual(1);
    }
    const exact = r.perTitle.find((p) => p.title === "Kala Chashma");
    expect(exact?.distance).toBe(0);
    expect(exact?.similarity).toBe(1);
    // monotone ranking: perTitle is sorted by ascending distance
    const distances = r.perTitle.map((p) => p.distance);
    expect(distances).toEqual([...distances].sort((x, y) => x - y));
    // distanceToSimilarity itself is strictly decreasing on d >= 0
    const sims = [0, 0.5, 1, 3, 8].map(distanceToSimilarity);
    for (let i = 1; i < sims.length; i += 1) {
      expect(sims[i] as number).toBeLessThan(sims[i - 1] as number);
    }
  });

  it("deterministic: identical inputs give identical output, and the stage stays fast", () => {
    const titles = ["Kala Chashma", ...DISTRACTORS, "Raja Ji"];
    const a = scoreTitlePhonetics("kala chasma", ["kala chasma"], titles, "en-US");
    const b = scoreTitlePhonetics("kala chasma", ["kala chasma"], titles, "en-US");
    expect(a.perTitle).toEqual(b.perTitle);
    // budget: <10ms in practice; assertion padded to 25ms to stay CI-safe
    expect(a.elapsedMs).toBeLessThan(25);
  });
});

describe("scoring feature integration", () => {
  const base = {
    similarity: 0.6,
    agreement: 1,
    versionMatch: 0.5,
    asrConfidence: 0.7,
    artistHintMatch: 0.5,
  };

  it("absent phonetic feature is exactly neutral (Phase-1 score unchanged)", () => {
    const withoutField = scoreCandidate(base);
    const explicitNeutral = scoreCandidate({ ...base, phoneticSimilarity: PHONETIC_NEUTRAL });
    expect(explicitNeutral).toBeCloseTo(withoutField, 12);
  });

  it("higher phonetic similarity strictly raises the score (monotone feature)", () => {
    const low = scoreCandidate({ ...base, phoneticSimilarity: 0.2 });
    const mid = scoreCandidate({ ...base, phoneticSimilarity: 0.6 });
    const high = scoreCandidate({ ...base, phoneticSimilarity: 1 });
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});
