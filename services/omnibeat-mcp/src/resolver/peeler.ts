/**
 * S0 frame peel (blueprint 6.1): strip wake word, verbs, provider suffix and
 * filler, and detect explicit intent words (live, remix, ...) plus "by <artist>"
 * hints - using a SMALL INLINE LOCALE TABLE, not a learned model.
 *
 * ###########################################################################
 * # SWAP POINT for @omnibeat/phonetic-core (B-PHON)                        #
 * # This inline table is the deliberate Phase-1 placeholder for the locale  #
 * # packs (blueprint 7.1: grammar is DATA, not code). B-PHON replaces this  #
 * # file's tables with data-driven packs (rules + respelling variants +     #
 * # transliteration keys) without touching the pipeline around it.          #
 * # Budget: peel must stay under config.latency.peel (2 ms, blueprint 6.1). #
 * ###########################################################################
 *
 * Budget honesty: the caller measures and records the elapsed time; we do not
 * fake the stage budget.
 */

export type VersionIntent = "studio" | "live" | "remix" | "cover" | "karaoke";

export interface PeelResult {
  /** Query text handed to provider adapters. */
  peeled: string;
  /** Tokens removed, in order (for the evidence trail). */
  removed: string[];
  intent: {
    /** Version intent the user said out loud (live / remix / cover / ...). */
    version?: VersionIntent;
    /** Artist extracted from a trailing "by <artist>" phrase. */
    artistHint?: string;
  };
  /** True when peeling removed everything and we fell through to the raw text. */
  usedFallback: boolean;
}

const WAKE_PHRASES = [
  "hey omnibeat",
  "ok omnibeat",
  "omni beat",
  "hey omni",
  "ok omni",
  "omnibeat",
  "omni",
  "alexa",
  "computer",
];

const VERB_PHRASES = [
  "i would like to hear",
  "i want to hear",
  "i want you to play",
  "could you please play",
  "could you play",
  "can you please play",
  "can you play",
  "please play",
  "please put on",
  "please start",
  "put on",
  "play me",
  "play some",
  "play the",
  "play",
  "listen to",
  "search for",
  "look up",
  "find me",
  "find",
  "start",
  "turn on",
  "queue up",
  "give me",
  "laga do",
  "chala do",
  "chala",
  "baja do",
  "bajao",
  "chalao",
  "suna do",
  "sunao",
  "reproducir",
  "poner",
  "pon",
];

const FILLER_WORDS = new Set([
  "please",
  "kindly",
  "um",
  "uh",
  "umm",
  "hmm",
  "yaar",
  "ya",
  "hey",
  "ok",
  "okay",
  "now",
  "quickly",
  "again",
  "thanks",
  "thank",
]);

/** Trailing nouns that carry no query signal ("raja ji song"). */
const TRAILING_NOUNS = new Set([
  "song",
  "songs",
  "track",
  "tracks",
  "music",
  "tune",
  "tunes",
  "gana",
  "gaana",
  "geet",
]);

/** Trailing "on <provider>" phrases (blueprint 6.1 S0: provider suffix). */
const PROVIDER_PHRASES = [
  "apple music",
  "youtube music",
  "amazon music",
  "amazon prime music",
  "jiosaavn",
  "spotify",
  "deezer",
  "pandora",
  "soundcloud",
  "tidal",
  "wynk",
  "gaana",
  "gaana app",
];

/**
 * Explicit intent words (kept in the query; flagged for S4 version safety).
 * Words mapped to `undefined` are intent signals with no Track.version enum
 * member (e.g. acoustic): they stay in the query but set no version intent.
 */
const INTENT_WORDS: Record<string, VersionIntent | undefined> = {
  live: "live",
  acoustic: undefined,
  unplugged: "live",
  remix: "remix",
  remixes: "remix",
  cover: "cover",
  covers: "cover",
  karaoke: "karaoke",
  tribute: "karaoke",
  original: "studio",
};

function lower(tokens: string[]): string[] {
  return tokens.map((t) => t.toLowerCase().replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""));
}

function matchesPhrase(tokens: string[], lowers: string[], index: number, phrase: string): number {
  const parts = phrase.split(" ");
  for (let i = 0; i < parts.length; i += 1) {
    if (lowers[index + i] !== parts[i]) return 0;
  }
  return parts.length;
}

export function peel(rawTranscript: string, _locale?: string): PeelResult {
  const started = process.hrtime.bigint();
  const removed: string[] = [];
  const raw = rawTranscript.trim();

  let tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  let lowers = lower(tokens);

  const stripFromFront = (phrases: string[]): boolean => {
    let stripped = false;
    let again = true;
    while (again) {
      again = false;
      for (const phrase of phrases) {
        const n = matchesPhrase(tokens, lowers, 0, phrase);
        if (n > 0) {
          removed.push(...tokens.slice(0, n));
          tokens = tokens.slice(n);
          lowers = lower(tokens);
          again = true;
          stripped = true;
          break;
        }
      }
    }
    return stripped;
  };

  // 1. wake words, 2. verbs (repeated: "hey omni please play ...")
  stripFromFront(WAKE_PHRASES);
  stripFromFront(VERB_PHRASES);
  stripFromFront(WAKE_PHRASES);

  // 3. trailing provider suffix: "on <provider>" (possibly over filler words)
  const stripTrailingProvider = (): void => {
    for (;;) {
      // allow one filler before the provider: "play x please on spotify"
      for (const phrase of PROVIDER_PHRASES) {
        const parts = phrase.split(" ");
        if (tokens.length >= parts.length) {
          const slice = tokens.slice(tokens.length - parts.length);
          const sliceLower = slice.map((t) => t.toLowerCase());
          const precededByOn =
            tokens.length > parts.length &&
            (tokens[tokens.length - parts.length - 1] ?? "").toLowerCase() === "on";
          if (sliceLower.join(" ") === parts.join(" ") && precededByOn) {
            removed.push(...tokens.slice(tokens.length - parts.length - 1));
            tokens = tokens.slice(0, tokens.length - parts.length - 1);
            lowers = lower(tokens);
            return;
          }
        }
      }
      break;
    }
  };
  stripTrailingProvider();

  // 4. trailing fillers / nouns, then leading fillers
  const stripTrailingWords = (wordSets: Set<string>[]): void => {
    for (;;) {
      const last = lowers[lowers.length - 1];
      if (last === undefined || !wordSets.some((s) => s.has(last))) break;
      removed.push(tokens[tokens.length - 1] as string);
      tokens = tokens.slice(0, -1);
      lowers = lower(tokens);
    }
  };
  stripTrailingWords([FILLER_WORDS, TRAILING_NOUNS]);
  while (tokens.length > 0 && FILLER_WORDS.has(lowers[0] as string)) {
    removed.push(tokens[0] as string);
    tokens = tokens.slice(1);
    lowers = lower(tokens);
  }

  // 5. artist hint: trailing "by <artist>"
  let artistHint: string | undefined;
  const byIndex = lowers.lastIndexOf("by");
  if (byIndex > 0 && byIndex < tokens.length - 1) {
    artistHint = tokens
      .slice(byIndex + 1)
      .join(" ")
      .replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
    removed.push(...tokens.slice(byIndex));
    tokens = tokens.slice(0, byIndex);
    lowers = lower(tokens);
    stripTrailingWords([FILLER_WORDS, TRAILING_NOUNS]);
    if (artistHint === "") artistHint = undefined;
  }

  // 6. detect version intent (words stay in the query for provider search)
  let version: VersionIntent | undefined;
  for (const word of lowers) {
    const mapped = INTENT_WORDS[word];
    if (mapped !== undefined && mapped !== null) {
      version = mapped;
      break;
    }
  }

  const peeled = tokens.join(" ").trim();
  const usedFallback = peeled.length === 0;
  const result: PeelResult = {
    peeled: usedFallback ? raw : peeled,
    removed,
    intent: {},
    usedFallback,
  };
  if (version !== undefined) result.intent.version = version;
  if (artistHint !== undefined) result.intent.artistHint = artistHint;

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (elapsedMs > 10) {
    // Not an error - a signal for B-PHON that the inline table is too slow.
    result.removed.push(`[peel-time:${elapsedMs.toFixed(2)}ms]`);
  }
  return result;
}
