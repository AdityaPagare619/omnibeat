import { describe, expect, it } from "vitest";
import { canonicalize, translit } from "../src/index.js";
import { loadPack } from "./helpers.js";

const en = loadPack("en-US").translit;
const hi = loadPack("hi-IN").translit;
const es = loadPack("es-US").translit;

describe("translit (display pass)", () => {
  it("maps Devanagari to Latin including matras and signs", () => {
    // literal per-character transliteration: आ→aa and ा→aa, so आना →
    // "aanaa"; the conventional "aana" spelling is reachable only through
    // matching (skeleton collapses aa→a), not display peel — documented gap.
    expect(translit("मुझे तुम याद आना", hi)).toBe("mujhe tum yaad aanaa");
    expect(translit("रात भर", hi)).toBe("raat bhr"); // no schwa insertion (gap)
    expect(translit("चाँद सितारे", hi)).toBe("chaand sitaare");
    expect(translit("नमस्ते", hi)).toBe("nmste"); // no schwa insertion (gap)
    expect(translit("पर चलाओ", hi)).toBe("pr chlaao"); // inherent-a gap (documented)
  });

  it("maps nukta sequences", () => {
    expect(translit("फ़न", hi)).toBe("phn"); // फ़ = फ + ़ → ph; display keeps ph
    expect(canonicalize("फ़न", hi)).toBe("fn"); // matching aliases fold ph → f
  });

  it("strips Spanish accents and folds ñ", () => {
    expect(translit("canción", es)).toBe("cancion");
    expect(translit("señor", es)).toBe("senor");
    expect(translit("¿qué?", es)).toBe("que?"); // ASCII ? is a boundary downstream
  });

  it("keeps display spelling of ll and ñ-only Latin words when no char map entry", () => {
    expect(translit("Llamas", es)).toBe("Llamas"); // ll→y is matching-only
    expect(translit("Beyoncé", en)).toBe("Beyonce");
  });
});

describe("canonicalize (matching pass)", () => {
  it("unifies Hinglish romanization both ways for hi-IN", () => {
    // Latin Hinglish and Devanagari reach the same canonical string
    expect(canonicalize("phir", hi)).toBe("fir");
    expect(canonicalize("फिर", hi)).toBe("fir");
    expect(canonicalize("bholaa", hi)).toBe("bolaa"); // bh → b only at alias stage
    expect(canonicalize("भोला", hi)).toBe("bolaa"); // भ→bh→b, ओ→o, ा→aa
  });

  it("applies yeísmo ll→y for es-US so both spellings match", () => {
    expect(canonicalize("llamas", es)).toBe("yamas");
    expect(canonicalize("yamas", es)).toBe("yamas");
    expect(canonicalize("Ya No Me Llamas", es)).toBe("ya no me yamas");
  });

  it("is idempotent", () => {
    for (const [text, map] of [
      ["phir se", hi],
      ["फ़न", hi],
      ["llamas como yo", es],
      ["canción", es],
      ["don't stop", en],
    ] as const) {
      const once = canonicalize(text, map);
      expect(canonicalize(once, map)).toBe(once);
    }
  });

  it("never throws on arbitrary input", () => {
    expect(() => canonicalize("😀 दुनिया 〜", hi)).not.toThrow();
    expect(canonicalize("😀 दुनिया 〜", hi)).toBeTypeOf("string");
  });
});
