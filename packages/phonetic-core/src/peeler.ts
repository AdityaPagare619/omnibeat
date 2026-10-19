import type { IntentHints, IntentName, PhoneticPack } from "./types.js";
import { translit } from "./translit.js";

/**
 * Wake word / verb / provider word / filler stripping driven entirely by
 * pack grammar (pack.json). Also detects intent hints (live / remix /
 * acoustic / original / artist) using the pack's `grammar.intents` vocab.
 *
 * Two modes:
 *  - "query" (default): strips everything listed above; intent-marked and
 *    artist tokens are consumed but recorded in `intent`.
 *  - "title": candidate-side; strips only wake words and provider words so
 *    real title words ("the", "please"-like words, "live") survive.
 *
 * No per-song knowledge lives here — vocabulary comes from pack data only.
 */

export type PeelMode = "query" | "title";

export interface PeelResult {
  /** surviving tokens after transliteration (lowercase). */
  tokens: string[];
  /** what was removed and why — a matched-variant trace for callers/tests. */
  removed: Array<{ token: string; reason: StripReason }>;
  intent: IntentHints;
}

export type StripReason =
  | "wake"
  | "verb"
  | "provider"
  | "filler"
  | "intent"
  | "artist";

function emptyIntent(): IntentHints {
  return { live: false, remix: false, acoustic: false, original: false, artist: null };
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

function matchList(token: string, list: readonly string[] | undefined): boolean {
  if (!list) return false;
  for (const w of list) {
    if (w.length > 0 && token === w.toLowerCase()) return true;
  }
  return false;
}

const INTENT_NAMES: IntentName[] = ["live", "remix", "acoustic", "original"];

/**
 * Strip grammar words from `text` and detect intent hints.
 * Pure: same input → same output; never throws.
 */
export function peel(
  text: string,
  pack: PhoneticPack,
  mode: PeelMode = "query",
): PeelResult {
  const latin = translit(text, pack.translit);
  const raw = tokenize(latin);
  const { grammar } = pack;
  const intents = grammar.intents ?? {};
  const intent = emptyIntent();
  const removed: PeelResult["removed"] = [];
  const kept: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const token = raw[i]!;

    // 1. intent hints (query mode only — a title word "Live" must survive
    //    on the candidate side).
    if (mode === "query") {
      let intentHit: IntentName | null = null;
      for (const name of INTENT_NAMES) {
        if (matchList(token, intents[name])) {
          intent[name] = true;
          intentHit = name;
          break;
        }
      }
      if (intentHit !== null) {
        removed.push({ token, reason: "intent" });
        continue;
      }

      // 2. artist marker: everything after it belongs to the artist.
      if (matchList(token, intents.artistMarkers)) {
        removed.push({ token, reason: "artist" });
        for (let j = i + 1; j < raw.length; j++) {
          const rest = raw[j]!;
          removed.push({ token: rest, reason: "artist" });
        }
        const artistTokens = raw.slice(i + 1);
        if (artistTokens.length > 0) intent.artist = artistTokens.join(" ");
        break;
      }
    }

    // 3. grammar stripping (both modes see wake + provider; query mode sees
    //    verbs and fillers too).
    if (matchList(token, grammar.wakeWords)) {
      removed.push({ token, reason: "wake" });
      continue;
    }
    if (matchList(token, grammar.providerWords)) {
      removed.push({ token, reason: "provider" });
      continue;
    }
    if (mode === "query" && matchList(token, grammar.verbs)) {
      removed.push({ token, reason: "verb" });
      continue;
    }
    if (mode === "query" && matchList(token, grammar.fillers)) {
      removed.push({ token, reason: "filler" });
      continue;
    }

    kept.push(token);
  }

  return { tokens: kept, removed, intent };
}
