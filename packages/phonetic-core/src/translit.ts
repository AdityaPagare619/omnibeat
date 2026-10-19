import type { TranslitJson } from "./types.js";

/**
 * Script/accent → Latin phonetic transliteration.
 *
 * Two entry points, both pure and no-throw:
 *  - `translit()`     display-safe pass: character map only (Devanagari →
 *                     Latin, accent stripping). Used by peeler output so the
 *                     title-cased text a user sees keeps its spelling.
 *  - `canonicalize()` display + alias pass: also applies the pack's
 *                     romanization aliases (Hinglish "ph"→"f", Spanish
 *                     "ll"→"y", …) so both spellings of the same sound reach
 *                     one canonical form before matching.
 *
 * Maps are idempotent: applying either function twice yields the same result
 * (the char map only rewrites non-Latin/accented keys; alias keys are absent
 * from their own outputs by construction in pack data).
 */

function applyChars(text: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of text) {
    const repl = map[ch];
    out += repl !== undefined ? repl : ch;
  }
  return out;
}

/** Longest-key-first, left-to-right, non-overlapping alias rewrite. */
function applyAliases(text: string, aliases: Record<string, string>): string {
  const keys = Object.keys(aliases).filter((k) => k.length > 0);
  if (keys.length === 0) return text;
  const maxLen = keys.reduce((m, k) => Math.max(m, k.length), 1);
  let out = "";
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const slice = text.slice(i, i + len);
      const repl = aliases[slice];
      if (repl !== undefined) {
        out += repl;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

/** Display-safe transliteration (char map only). */
export function translit(text: string, map: TranslitJson): string {
  const normalized = text.normalize("NFKC");
  return applyChars(normalized, map.chars);
}

/** Transliteration + romanization aliases — the pre-matching canonical form.
 *  Canonical forms are lowercase (comparison space, not display space). */
export function canonicalize(text: string, map: TranslitJson): string {
  const base = translit(text.toLowerCase(), map);
  return map.aliases ? applyAliases(base, map.aliases) : base;
}
