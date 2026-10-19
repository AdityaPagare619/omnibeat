import type { RulesJson } from "./types.js";

/**
 * grapheme → sound-class skeleton.
 *
 * Steps, in order:
 *  1. NFKC normalize + lowercase (case/whitespace stability for distance()).
 *  2. Remove apostrophes and hyphens entirely (they join: "don't" → "dont",
 *     "lolly-pop" → "lollipop"); every other non-letter/digit is a boundary.
 *  3. Tokenize on boundaries.
 *  4. Per token, left-to-right longest-match rewrite using the pack's
 *     digraph map (bh/ph/sh/ch …) and vowel-cluster map (length-insensitive
 *     vowels: ee → e, aa → a …). Digraphs win ties at equal key length.
 *  5. Emit canonical Latin sound symbols; unknown characters pass through
 *     (distance() classifies them as "unknown" later).
 *
 * Schwa/stress reduction is intentionally out of scope (documented gap in
 * each pack README): this is a length- and digraph-insensitive normalizer,
 * not a grapheme-to-phoneme engine.
 */

interface NormTable {
  /** longest key length present, for the scan window. */
  maxLen: number;
  map: Map<string, string>;
}

const tableCache = new WeakMap<RulesJson, NormTable>();

function getTable(rules: RulesJson): NormTable {
  const hit = tableCache.get(rules);
  if (hit) return hit;
  const map = new Map<string, string>();
  let maxLen = 1;
  // Vowel clusters first, then digraphs: a key present in both maps resolves
  // to the digraph value (consonant clusters take precedence on collisions).
  for (const [from, to] of Object.entries(rules.vowels)) {
    if (from.length > 0) {
      map.set(from, to);
      maxLen = Math.max(maxLen, from.length);
    }
  }
  for (const [from, to] of Object.entries(rules.digraphs)) {
    if (from.length > 0) {
      map.set(from, to);
      maxLen = Math.max(maxLen, from.length);
    }
  }
  const table: NormTable = { maxLen, map };
  tableCache.set(rules, table);
  return table;
}

/** Normalize one token (no boundaries inside) into canonical sound symbols. */
export function skeletonToken(token: string, rules: RulesJson): string {
  const { maxLen, map } = getTable(rules);
  let out = "";
  let i = 0;
  while (i < token.length) {
    let matched = false;
    for (let len = Math.min(maxLen, token.length - i); len >= 1; len--) {
      const slice = token.slice(i, i + len);
      const repl = map.get(slice);
      if (repl !== undefined) {
        out += repl;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += token[i];
      i += 1;
    }
  }
  return out;
}

const APOSTROPHES = /[\u0027\u02BC\u2018\u2019\u201B]/gu;
const HYPHENS = /[\u002D\u2010\u2011\u2012\u2013\u2014\u2015]/gu;

/**
 * Full-text skeleton: returns one normalized string per token.
 * Pure, deterministic, no-throw on arbitrary Unicode.
 */
export function skeleton(text: string, rules: RulesJson): string[] {
  const cleaned = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(HYPHENS, "");
  const raw = cleaned.split(/[^\p{L}\p{N}]+/u);
  const out: string[] = [];
  for (const token of raw) {
    if (token.length === 0) continue;
    out.push(skeletonToken(token, rules));
  }
  return out;
}

/** Skeleton of a whole string, tokens joined by a single ASCII space. */
export function skeletonString(text: string, rules: RulesJson): string {
  return skeleton(text, rules).join(" ");
}
