/**
 * S0 frame peel wake-word tests (blueprint 6.1: wake words must never reach
 * the provider query). Generic wake-word handling only - no corpus or
 * heldout-specific cases, no thresholds.
 */
import { describe, expect, it } from "vitest";
import { peel } from "../src/resolver/peeler.js";

describe("S0 frame peel: wake-word stripping", () => {
  it('"hey alexa play kala chasma" peels to "kala chasma"', () => {
    const r = peel("hey alexa play kala chasma");
    expect(r.peeled).toBe("kala chasma");
    expect(r.usedFallback).toBe(false);
    // wake word + filler + verb all removed, in order
    expect(r.removed.slice(0, 3)).toEqual(["hey", "alexa", "play"]);
  });

  it("strips Alexa-family wake words in every position, repeatedly until stable", () => {
    expect(peel("alexa play brown munde").peeled).toBe("brown munde");
    expect(peel("ok alexa play brown munde").peeled).toBe("brown munde");
    expect(peel("echo play brown munde").peeled).toBe("brown munde");
    // multi wake-word + verb interleaving: loop must fully drain the frame
    expect(peel("alexa echo play brown munde").peeled).toBe("brown munde");
    expect(peel("hey alexa please play tera ban jaunga by akhil").peeled).toBe(
      "tera ban jaunga",
    );
  });

  it("peel is idempotent: peeling the peeled text is a fixed point", () => {
    for (const input of [
      "hey alexa play kala chasma",
      "ok echo please put on raja ji by danny",
      "alexa echo play brown munde",
      "play chaap tilak sab teri on spotify",
    ]) {
      const once = peel(input);
      const twice = peel(once.peeled);
      expect(twice.peeled, `not idempotent for "${input}"`).toBe(once.peeled);
    }
  });

  it("wake-word-only input yields the raw fallback (never an empty query)", () => {
    for (const input of ["alexa", "hey alexa", "ok alexa echo"]) {
      const r = peel(input);
      expect(r.usedFallback).toBe(true);
      expect(r.peeled).toBe(input);
    }
  });
});
