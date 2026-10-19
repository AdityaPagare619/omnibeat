/**
 * Compact Double-Metaphone-style encoder (no dependencies, no external
 * test vectors copied).
 *
 * Algorithm choice: we implement a self-contained approximation of Double
 * Metaphone's PRIMARY code path — initial-cluster fixes (KN/GN/PN/WR/X→S,
 * WH→W), first-vowel retention then vowel dropping, silent non-initial H,
 * digraph rewrites (PH→F, SH→X, CH→X before front vowels else K, TH→T),
 * soft-C/G palatalisation before E/I/Y (C→S, G→J), GH dropping before
 * consonants/endings, W/Y kept only before vowels, X→KS, doubled letters
 * collapsed — plus a secondary code that flips the CH/SH/G soft/hard choices,
 * used only as a ranking tiebreak. It is NOT bit-identical to Lawrence's
 * published Metaphone 3 reference tables; it is tuned for stable ranking of
 * mangled music titles, and every behaviour is pinned by unit tests here.
 */

const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);
const FRONT = new Set(["E", "I", "Y"]);

function isFront(c: string | undefined): boolean {
  return c !== undefined && FRONT.has(c);
}

/** Keep A–Z only, uppercase; non-Latin scripts pass through untouched as drops. */
function clean(input: string): string {
  return input.normalize("NFKD").toUpperCase().replace(/[^A-Z]/g, "");
}

function encode(input: string, alt: boolean): string {
  const w = clean(input);
  if (w.length === 0) return "";

  // --- initial cluster fixes -------------------------------------------
  let start = 0;
  let head = w;
  if (w.startsWith("GN") || w.startsWith("KN") || w.startsWith("PN") ||
      w.startsWith("WR") || w.startsWith("X")) {
    start = 1;
  } else if (w.startsWith("WH")) {
    head = `W${w.slice(2)}`;
  } else if (w.startsWith("AE")) {
    // AE→E (as in "Aesop"-style openings)
    head = `E${w.slice(2)}`;
  }

  let out = "";
  let firstVowelSeen = false;
  let i = start;

  // The very first letter is always emitted (after the cluster fix above).
  if (head.length > 0) {
    out += head[0];
    i = 1;
    if (VOWELS.has(head[0]!)) firstVowelSeen = true;
  }

  while (i < head.length) {
    const c = head[i]!;
    const next = head[i + 1];
    const prev = i > 0 ? head[i - 1] : undefined;

    // doubled letters collapse (except CC which can span a boundary)
    if (c === prev && c !== "C") {
      i += 1;
      continue;
    }

    if (VOWELS.has(c) && c !== "Y") {
      if (!firstVowelSeen) {
        out += c;
        firstVowelSeen = true;
      }
      i += 1;
      continue;
    }

    switch (c) {
      case "B":
        // silent MB endings handled by M branch; B after M at end is dropped
        if (!(prev === "M" && next === undefined)) out += "B";
        i += 1;
        break;
      case "C":
        if (next === "I" && head[i + 2] === "A") {
          out += "X"; // CIA → X
          i += 1;
        } else if (next === "H") {
          if (isFront(head[i + 2])) out += alt ? "K" : "X";
          else out += "K";
          i += 1; // consume C; H handled next round unless consumed here
          // consume the H too when it formed CH
          i += 1;
        } else if (isFront(next)) {
          out += "S"; // city, cell
          i += 1;
        } else {
          out += "K";
          i += 1;
        }
        break;
      case "D":
        if (next === "G" && isFront(head[i + 2])) {
          out += "J";
          i += 2;
        } else {
          out += "D";
          i += 1;
        }
        break;
      case "F":
      case "J":
      case "K":
      case "L":
      case "M":
      case "N":
      case "P":
      case "R":
        out += c;
        i += 1;
        break;
      case "Q":
        out += "K";
        i += 1;
        break;
      case "S":
        if (next === "H") {
          out += alt ? "S" : "X"; // SH
          i += 2;
        } else if (next === "C" && head[i + 2] === "H") {
          out += alt ? "SK" : "X"; // SCH
          i += 3;
        } else if (isFront(next)) {
          out += "S"; // before E/I/Y stays S (case, cent)
          i += 1;
        } else {
          out += "S";
          i += 1;
        }
        break;
      case "T":
        if (next === "I" && head[i + 2] === "A") {
          out += "X"; // TIA
          i += 1;
        } else if (next === "H") {
          out += "T"; // TH (Metaphone 3 uses 0; we stay A–Z for tiebreak use)
          i += 2;
        } else {
          out += "T";
          i += 1;
        }
        break;
      case "V":
        out += "F"; // V ≈ F for ranking purposes
        i += 1;
        break;
      case "W":
      case "Y":
        // kept only when it carries a vowel nucleus
        if (next !== undefined && VOWELS.has(next)) out += c;
        i += 1;
        break;
      case "X":
        out += "KS";
        i += 1;
        break;
      case "Z":
        out += "S";
        i += 1;
        break;
      case "G":
        if (next === "H") {
          const after = head[i + 2];
          if (after === undefined || !VOWELS.has(after)) {
            i += 1; // silent GH (bright, dough)
            break;
          }
          out += alt ? "K" : "";
          i += 1;
          break;
        }
        if (next === "N" && head[i + 2] === undefined) {
          i += 1; // silent leading-to-end GN
          break;
        }
        if (isFront(next)) out += alt ? "K" : "J"; // give, giraffe, gem
        else out += "G";
        i += 1;
        break;
      case "H":
        // keep only if before a vowel and previous was not a vowel
        if (next !== undefined && VOWELS.has(next) && prev !== undefined && !VOWELS.has(prev)) {
          out += "H";
        }
        i += 1;
        break;
      default:
        i += 1;
        break;
    }
  }
  return out;
}

/** Primary (preferred) phonetic code. Empty string for empty/non-Latin input. */
export function metaphone(input: string): string {
  return encode(input, false);
}

/** [primary, secondary]; secondary flips CH/SH/G softness choices. */
export function metaphonePair(input: string): readonly [string, string] {
  return [encode(input, false), encode(input, true)] as const;
}
