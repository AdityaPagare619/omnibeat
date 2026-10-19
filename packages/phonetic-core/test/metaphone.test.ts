import { describe, expect, it } from "vitest";
import { metaphone, metaphonePair } from "../src/index.js";

describe("metaphone", () => {
  it("emits only A–Z symbols (or empty)", () => {
    for (const word of ["lollipop", "Raja Ji", "blinding lights", "चाँदनी", "😀"]) {
      expect(metaphone(word)).toMatch(/^[A-Z]*$/u);
    }
  });

  it("is empty for empty and non-Latin input", () => {
    expect(metaphone("")).toBe("");
    expect(metaphone("...")).toBe("");
    expect(metaphone("नमस्ते")).toBe("");
  });

  it("is case, punctuation and boundary insensitive", () => {
    expect(metaphone("Lolli-Pop")).toBe(metaphone("lolli pop"));
    expect(metaphone("  WONDERWALL!! ")).toBe(metaphone("wonderwall"));
  });

  it("applies initial cluster fixes", () => {
    expect(metaphone("knife")).toBe("NIF");
    expect(metaphone("write")).toBe("RIT");
    expect(metaphone("xenon")).toBe("SEN"); // X→S, first vowel kept, post-drop NN collapses
    expect(metaphone("what")).toBe("WAT"); // WH→W; first vowel retained by design
    expect(metaphone("cherry")).toBe("XER");
    expect(metaphone("cell")).toBe("SEL");
    expect(metaphone("gem")).toBe("JEM");
    expect(metaphone("phone")).toBe("FON"); // initial PH → F
  });

  it("collapses doubled letters and drops non-initial vowels", () => {
    expect(metaphone("yellow")).toBe(metaphone("yelow"));
    expect(metaphone("banana")).toBe("BAN"); // first vowel retained, rest dropped
    expect(metaphone("taxi")).toBe("TAKS"); // X → KS
  });

  it("encodes PH as F (non-initial too)", () => {
    expect(metaphone("graph")).toBe("GRAF");
  });

  it("produces a secondary code that flips front-CH and soft-G choices", () => {
    const [primary, secondary] = metaphonePair("cherry");
    expect(primary).toBe("XER");
    expect(secondary).toBe("JER");
    const [gp, gs] = metaphonePair("gem");
    expect(gp).toBe("JEM");
    expect(gs).toBe("GEM");
    expect(primary).not.toBe(secondary);
  });

  it("shares codes for words that differ only in dropped vowels", () => {
    // ranking tiebreak: consonant skeletons agree
    expect(metaphone("night")).toBe(metaphone("nit"));
  });
});
