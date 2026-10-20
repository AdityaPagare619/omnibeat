/**
 * Shared types for @omnibeat/phonetic-core.
 *
 * Packs are DATA (JSON files under packs/<id>/). Nothing in this package
 * special-cases a specific song, artist, or query — pack data drives every
 * vocabulary and normalization table.
 */

/** pack.json — identity, scripts, grammar (token vocabularies). */
export interface PackJson {
  id: string;
  scripts: string[];
  grammar: PackGrammar;
}

export interface PackGrammar {
  /** commands that must never be treated as title content ("hey", "alexa"). */
  wakeWords: string[];
  /** action verbs stripped from queries ("play", "queue"). */
  verbs: string[];
  /** music-service words stripped from queries ("spotify"). */
  providerWords: string[];
  /** politeness/filler words stripped from queries ("please", "via"). */
  fillers: string[];
  /** intent hint vocabularies; absent keys mean "no hint for that intent". */
  intents?: Partial<IntentVocabulary>;
}

export interface IntentVocabulary {
  live: string[];
  remix: string[];
  acoustic: string[];
  original: string[];
  /** marker tokens ("by") that turn the rest of the query into an artist. */
  artistMarkers: string[];
}

export type IntentName = "live" | "remix" | "acoustic" | "original";

export interface IntentHints {
  live: boolean;
  remix: boolean;
  acoustic: boolean;
  original: boolean;
  /** artist tokens detected after an artist marker (lowercased), else null. */
  artist: string | null;
}

/** rules.json — normalizations + articulatory classes + respelling templates. */
export interface RulesJson {
  id: string;
  /** multi-char consonant digraphs → canonical sound symbol ("bh" → "b"). */
  digraphs: Record<string, string>;
  /** multi-char vowel clusters → length-insensitive short vowel ("ee" → "e"). */
  vowels: Record<string, string>;
  articulatory: ArticulatoryClasses;
  respelling: RespellingTemplate[];
}

export interface ArticulatoryClasses {
  /** vowel membership list (single symbols). */
  vowels: string[];
  /** consonant symbol → place of articulation. Unknown symbols fall back. */
  places: Record<string, string>;
  /** consonant symbol → manner of articulation. */
  manners: Record<string, string>;
  /** consonant symbol → "voiced" | "voiceless". Optional; default voiceless. */
  voicing?: Record<string, string>;
  /** vowel symbol → height (for vowel neighbourhood costs). */
  heights?: Record<string, string>;
  /** vowel symbol → frontness (for vowel neighbourhood costs). */
  frontness?: Record<string, string>;
}

export type RespellingKind = "vowel-length" | "aspirate" | "other";

export interface RespellingTemplate {
  id: string;
  kind: RespellingKind;
  /** literal substring to replace in one token (first occurrence). */
  from: string;
  to: string;
}

/** translit.json — script/accent → Latin phonetic normalization. */
export interface TranslitJson {
  id: string;
  /** single-character script map (e.g. Devanagari → Latin). */
  chars: Record<string, string>;
  /** ordered longest-first multi-char aliases applied after chars. */
  aliases?: Record<string, string>;
}

/** Fully-assembled pack handed to resolveSkeletons(). */
export interface PhoneticPack {
  id: string;
  scripts: string[];
  grammar: PackGrammar;
  rules: RulesJson;
  translit: TranslitJson;
}

/** Per-candidate result from resolveSkeletons(). */
export interface RankedMatch {
  candidate: string;
  /** original index in the alts array. */
  index: number;
  /** best articulatory distance across generated query variants. */
  distance: number;
  /** the query variant (joined token string) that produced `distance`. */
  variant: string;
  /** skeleton of the winning variant. */
  querySkeleton: string;
  /** skeleton of the candidate. */
  candidateSkeleton: string;
  /** Double-Metaphone-style codes + token agreement used as a tiebreak. */
  metaphone: {
    query: string[];
    candidate: string[];
    agreement: number;
  };
}

export interface ResolveOptions {
  /** override any subset of articulatory distance weights. */
  weights?: Partial<DistanceConfig>;
  /** cap on generated query variants (hard max 8, default 8). */
  maxVariants?: number;
}

/**
 * Articulatory edit-distance weights. All substitution costs are ≤ 1.0 by
 * construction relative to indel = 1.0; this keeps single-symbol substitution
 * monotone in class distance (no delete+insert path can beat substitution).
 */
export interface DistanceConfig {
  indel: number;
  /** vowel ↔ vowel: same height + frontness. */
  vowelSame: number;
  /** vowel ↔ vowel: same height or frontness (adjacent on the grid). */
  vowelNear: number;
  /** vowel ↔ vowel: otherwise (far apart on the grid). */
  vowelFar: number;
  /** consonant ↔ consonant: same place + manner + voicing. */
  consonantSameClass: number;
  /** consonant ↔ consonant: same place + manner, differing voicing. */
  consonantVoicing: number;
  /** consonant ↔ consonant: same place, differing manner. */
  consonantManner: number;
  /** consonant ↔ consonant: differing place, same manner. */
  consonantPlace: number;
  /** consonant ↔ consonant: differing place and manner. */
  consonantFar: number;
  /** vowel ↔ consonant (category crossing). */
  vowelConsonant: number;
  /** space ↔ non-space. */
  spaceMismatch: number;
  /** two distinct unknown (non-classed) symbols. */
  unknownDiff: number;
  /** known symbol ↔ unknown symbol. */
  knownUnknown: number;
}
