import { describe, expect, it } from "vitest";
import { skeleton, skeletonString, skeletonToken } from "../src/index.js";
import { loadPack } from "./helpers.js";

const en = loadPack("en-US").rules;
const hi = loadPack("hi-IN").rules;

describe("skeletonToken", () => {
  it("collapses consonant digraphs to canonical symbols", () => {
    expect(skeletonToken("phone", en)).toBe("fone");
    expect(skeletonToken("ship", en)).toBe("xip");
    expect(skeletonToken("church", en)).toBe("curc");
    expect(skeletonToken("knife", en)).toBe("nife");
    expect(skeletonToken("wrestle", en)).toBe("restle"); // wr → r
    expect(skeletonToken("rock", en)).toBe("rok"); // ck → k
    expect(skeletonToken("sing", en)).toBe("sin"); // ng → n
  });

  it("drops silent gh wholesale (gh → ∅, igh → i)", () => {
    // blunt-by-design: "ghost" loses both g and h (README gap "gh→∅ is
    // blunt"); both sides of a comparison normalize identically, so
    // spelling variants still converge (ghost ↔ gost cost = one indel).
    expect(skeletonToken("ghost", en)).toBe("ost");
    expect(skeletonToken("gost", en)).toBe("gost");
    expect(skeletonToken("night", en)).toBe("nit");
    expect(skeletonToken("light", en)).toBe("lit");
  });

  it("applies Hinglish aspirate digraphs for hi-IN", () => {
    expect(skeletonToken("bhai", hi)).toBe("be"); // bh → b, ai → e
    expect(skeletonToken("mujhe", hi)).toBe("muje"); // jh → j
    expect(skeletonToken("chaai", hi)).toBe("cai"); // ch → c, aa → a
  });

  it("is length-insensitive on vowels", () => {
    expect(skeletonToken("boot", en)).toBe(skeletonToken("bot", en));
    expect(skeletonToken("feel", en)).toBe(skeletonToken("fel", en));
    expect(skeletonToken("moon", hi)).toBe(skeletonToken("mun", hi)); // oo → u
    expect(skeletonToken("yaad", hi)).toBe(skeletonToken("yad", hi));
    expect(skeletonToken("aana", hi)).toBe(skeletonToken("ana", hi));
  });

  it("applies digraph keys over vowel keys at equal length", () => {
    // "th" must resolve as a digraph, not t+h leftovers
    expect(skeletonToken("think", en)).toBe("tink");
  });
});

describe("skeleton (whole text)", () => {
  it("removes apostrophes and hyphens by joining tokens", () => {
    expect(skeleton("don't stop", en)).toEqual(["dont", "stop"]);
    expect(skeleton("lolly-pop", en)).toEqual(["lollypop"]);
    expect(skeleton("rock ’n’ roll", en)).toEqual(["rok", "n", "roll"]);
  });

  it("splits on other punctuation and collapses whitespace", () => {
    expect(skeleton('  find "bohemian rhapsody"!! ', en)).toEqual([
      "find",
      "bohemian",
      "rhapsody",
    ]);
    expect(skeletonString("a \t\n b", en)).toBe("a b");
  });

  it("lowercases and is case-stable", () => {
    expect(skeleton("Blinding LIGHTS", en)).toEqual(skeleton("blinding lights", en));
  });

  it("passes unknown scripts through without throwing", () => {
    expect(skeleton("नमस्ते दुनिया", en)).toEqual(["नमस्ते", "दुनिया"]);
    // emoji are boundaries for \p{L}\p{N} tokenization — token list is empty,
    // but raw tokens handed to skeletonToken pass through untouched:
    expect(skeleton("😀🎵", en)).toEqual([]);
    expect(skeletonToken("😀", en)).toBe("😀");
  });

  it("handles empty and separator-only input", () => {
    expect(skeleton("", en)).toEqual([]);
    expect(skeleton("  ...  ", en)).toEqual([]);
    expect(skeletonToken("", en)).toBe("");
  });
});
