import { describe, expect, it } from "vitest";
import { peel } from "../src/index.js";
import { loadPack } from "./helpers.js";

const en = loadPack("en-US");
const hi = loadPack("hi-IN");
const es = loadPack("es-US");

describe("peel (query mode)", () => {
  it("strips wake words, verbs, providers and fillers", () => {
    const result = peel(
      "hey alexa play blinding lights by the weeknd on spotify",
      en,
    );
    expect(result.tokens).toEqual(["blinding", "lights"]);
    expect(result.removed.map((r) => r.reason)).toEqual([
      "wake",
      "wake",
      "verb",
      "artist",
      "artist",
      "artist",
      "artist",
      "artist",
    ]);
    expect(result.intent.artist).toBe("the weeknd on spotify");
  });

  it("removes apostrophes and hyphens by joining", () => {
    expect(peel("don't stop me now", en).tokens).toEqual([
      "dont",
      "stop",
      "me",
      "now",
    ]);
    expect(peel("lolly-pop", en).tokens).toEqual(["lollypop"]);
  });

  it("detects intent hints and still reads intents after artist markers", () => {
    const result = peel("play wonderwall by oasis live", en);
    expect(result.tokens).toEqual(["wonderwall"]);
    expect(result.intent.live).toBe(true);
    expect(result.intent.artist).toBe("oasis");
    expect(peel("play bailando remix", es).intent.remix).toBe(true);
    expect(peel("reproduce en vivo bailando", es).intent.live).toBe(true);
  });

  it("uses hi-IN grammar for verbs/fillers", () => {
    const result = peel("chahiye sunao mujhe", hi);
    expect(result.tokens).toEqual(["mujhe"]);
    expect(result.removed.every((r) => r.reason === "verb")).toBe(true);
    expect(peel("spotify par lollipop", hi).tokens).toEqual(["lollipop"]);
    // Devanagari पर → "pr" (no schwa) — documented gap: Latin "par" is the
    // form the filler list matches; the Devanagari form survives peeling.
    expect(peel("spotify पर lollipop", hi).tokens).toEqual(["pr", "lollipop"]);
  });

  it("strips Spanish grammar including article/filler words", () => {
    expect(
      peel("reproduce la canción despacito en spotify", es).tokens,
    ).toEqual(["despacito"]);
    expect(peel("oye reproduce macarena por favor", es).tokens).toEqual([
      "macarena",
    ]);
  });
});

describe("peel (title mode)", () => {
  it("keeps fillers, verbs and intent words on the candidate side", () => {
    const result = peel("The Intro Live", en, "title");
    expect(result.tokens).toEqual(["the", "intro", "live"]);
  });

  it("still strips wake words and providers", () => {
    expect(peel("alexa Intro spotify", en, "title").tokens).toEqual(["intro"]);
    expect(peel("spotify Tracks", en, "title").tokens).toEqual(["tracks"]);
  });
});

describe("peel robustness", () => {
  it("never throws and returns arrays for any input", () => {
    for (const text of ["", "   ", "😀😀", "नमस्ते", "¡¿?!", "!!!!"]) {
      const result = peel(text, hi);
      expect(Array.isArray(result.tokens)).toBe(true);
      expect(Array.isArray(result.removed)).toBe(true);
      expect(typeof result.intent.artist === "string" || result.intent.artist === null).toBe(
        true,
      );
    }
  });
});
