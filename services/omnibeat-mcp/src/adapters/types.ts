/**
 * Adapter contracts for candidate generation (blueprint 6.1 S1).
 *
 * Every adapter returns an `AdapterOutcome`: hits plus an honest status. There
 * is no adapter that fabricates data - a failure is a failure, and the replay
 * adapter (replay.ts) is the ONLY cached source, badged REPLAY.
 */
import type { Track } from "@omnibeat/schemas";

/** Sources named by the typed config's providerOrder. */
export type ProviderName = "deezer" | "itunes" | "musicbrainz" | "autocomplete" | "fixtures";

/** Real adapter implementations we ship in Phase 1. */
export type AdapterName = "itunes" | "musicbrainz" | "fixtures";

export type SourceBadge = "LIVE" | "REPLAY" | "FIXTURE";

/** Which upstream actually produced this row (drives source agreement). */
export type HitOrigin = "itunes" | "musicbrainz" | "fixture";

export interface Hit {
  track: Track;
  origin: HitOrigin;
  badge: SourceBadge;
  /** Which configured provider slot delivered it (may be "fixtures" for replay). */
  source: ProviderName;
  /** The exact query this row came back for. */
  queryUsed: string;
  /** Promotional preview URL (iTunes). NEVER cached or written to disk
   *  (EVIDENCE_SUMMARY 4 / CLM-MUS-003: stream-only, never cached). Kept off
   *  `Track` because the frozen Track schema is strict and has no preview
   *  field; used in-process for preview streaming only. */
  previewUrl?: string;
}

export type OutcomeErrorKind = "timeout" | "rate_limited" | "http" | "network" | "skipped";

export interface AdapterOutcome {
  provider: ProviderName;
  /** LIVE for real network calls, REPLAY for the replay cache, FIXTURE for
   *  hand-seeded fixture rows. */
  badge: SourceBadge;
  ok: boolean;
  hits: Hit[];
  latencyMs: number;
  errorKind?: OutcomeErrorKind;
  detail?: string;
}

export interface AdapterRequest {
  query: string;
  limit: number;
  /** Aborted at the 1,500 ms hard deadline (blueprint 6.1). */
  signal: AbortSignal;
}

export interface Adapter {
  name: AdapterName;
  /** Hedged duplicate requests are only safe where the upstream allows them
   *  (see each adapter's comment). */
  hedgeable: boolean;
  search(req: AdapterRequest): Promise<AdapterOutcome>;
}

/** Shared User-Agent: MusicBrainz requires a contactable one (CLM-MUS-005). */
export const OMNIBEAT_UA = "OmniBeat/0.1 (hackathon; contact@example.com)";

/** studio / live / remix / karaoke / cover classification from free text
 *  (blueprint 6.1 S4: structured metadata first, regex second - MusicBrainz
 *  supplies structure, iTunes only text). */
export function detectVersionFromText(...values: (string | undefined)[]): Track["version"] {
  const text = values.filter((v): v is string => typeof v === "string").join(" ").toLowerCase();
  if (/\blive\b|unplugged|in concert/.test(text)) return "live";
  if (/\bremix\b|mix\b|rework/.test(text)) return "remix";
  if (/\bkaraoke\b|tribute/.test(text)) return "karaoke";
  if (/\bcover\b|covered\b/.test(text)) return "cover";
  if (/\bacoustic\b|\boriginal\b|\bstudio\b/.test(text)) return "studio";
  return "unknown";
}
