import type { RulesJson } from "./types.js";
import { skeletonToken } from "./skeleton.js";

/**
 * Respelling variant generator: bounded to ≤ MAX_VARIANTS (8) strings.
 *
 * Candidates are produced in priority order and deduplicated by *skeleton*
 * (two variants that normalize to the same sound skeleton are redundant):
 *   1. identity (always first, when present),
 *   2. token merges — even/odd pairing patterns first (fixes ASR token
 *      over-splitting like "lolly pop la gelu" → "lollipop lagelu"), then
 *      each single adjacent merge,
 *   3. token splits — at vowel boundaries inside tokens ≥ 6 chars,
 *   4. respelling templates from pack rules: vowel-length alternations
 *      (aa↔a, ee↔e …) and aspirate alternations (ph↔f, th↔t …).
 *
 * Everything is driven by pack rules — no per-song special casing.
 */

export const MAX_VARIANTS = 8;

function skeletonKey(tokens: string[], rules: RulesJson): string {
  return tokens.map((t) => skeletonToken(t, rules)).join(" ");
}

/** Merge token pairs at the given parity: offset 0 → (0,1),(2,3)… */
function pairMerge(tokens: string[], offset: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (i + 1 < tokens.length && i % 2 === offset % 2) {
      out.push((tokens[i] ?? "") + (tokens[i + 1] ?? ""));
      i += 2;
    } else {
      out.push(tokens[i] ?? "");
      i += 1;
    }
  }
  return out;
}

function mergeAt(tokens: string[], index: number): string[] {
  const out = tokens.slice();
  const left = out[index] ?? "";
  const right = out[index + 1] ?? "";
  out.splice(index, 2, left + right);
  return out;
}

function splitBoundaries(token: string, vowels: readonly string[]): number[] {
  if (token.length < 6) return [];
  const bounds: number[] = [];
  for (let pos = 3; pos <= token.length - 3; pos++) {
    const before = token[pos - 1];
    if (before !== undefined && vowels.includes(before)) bounds.push(pos);
  }
  return bounds;
}

/**
 * Generate ≤ max (hard cap MAX_VARIANTS) variant token strings for a peeled
 * query. `max` is clamped to [1, 8].
 */
export function generateVariants(
  tokens: string[],
  rules: RulesJson,
  max: number = MAX_VARIANTS,
): string[] {
  const cap = Math.min(Math.max(1, Math.floor(max)), MAX_VARIANTS);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: string[]): void => {
    if (out.length >= cap || candidate.length === 0) return;
    const key = skeletonKey(candidate, rules);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate.join(" "));
  };

  push(tokens); // identity first — matches when the query is already clean

  // 2. structural: merges (pairing patterns, then single merges), then splits
  if (tokens.length >= 2) {
    push(pairMerge(tokens, 0));
    push(pairMerge(tokens, 1));
    for (let i = 0; i < tokens.length - 1; i++) {
      if (out.length >= cap) break;
      push(mergeAt(tokens, i));
    }
  }

  const vowels = rules.articulatory.vowels;
  for (const token of tokens) {
    if (out.length >= cap) break;
    for (const pos of splitBoundaries(token, vowels)) {
      if (out.length >= cap) break;
      push([token.slice(0, pos), token.slice(pos)]);
    }
  }

  // 4. respelling templates (vowel-length / aspirate / other), pack order
  for (const tpl of rules.respelling) {
    if (out.length >= cap) break;
    if (tpl.from.length === 0) continue;
    for (let ti = 0; ti < tokens.length; ti++) {
      if (out.length >= cap) break;
      const token = tokens[ti]!;
      const at = token.indexOf(tpl.from);
      if (at < 0) continue;
      const next = tokens.slice();
      next[ti] = token.slice(0, at) + tpl.to + token.slice(at + tpl.from.length);
      push(next);
    }
  }

  return out;
}
