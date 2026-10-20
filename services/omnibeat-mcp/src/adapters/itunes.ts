/**
 * iTunes Search adapter - PRIMARY provider (EVIDENCE_SUMMARY 4 / CLM-MUS-001:
 * keyless `GET https://itunes.apple.com/search?term=...&entity=song`;
 * CLM-MUS-002 documents ~20 req/min; CLM-MUS-004 verified CORS on search +
 * preview CDN; CLM-MUS-003: previews are promotional, stream-only, NEVER
 * cached - we keep previewUrl in-process only, never on disk).
 *
 * Attribution: results from this adapter are "provided courtesy of iTunes"
 * (CLM-MUS-003) - surfaced in the evidence trail.
 *
 * Hedging: OFF for this source. Duplicating a request to hedge would burn the
 * documented ~20 req/min budget (CLM-MUS-001); the runner instead applies its
 * soft hedge cutoff and lets the single request finish within the 600 ms cap.
 */
import { trackSchema, type Track } from "@omnibeat/schemas";
import { sanitizeTrack } from "../resolver/hygiene.js";
import { detectVersionFromText, OMNIBEAT_UA, type Adapter, type AdapterOutcome, type Hit } from "./types.js";

const SEARCH_URL = "https://itunes.apple.com/search";

/** Soft client-side guard: shed (do not block) beyond 18 calls/min so we stay
 *  under the documented ~20 req/min without ever queueing past the deadline. */
const WINDOW_MS = 60_000;
const SOFT_MAX_PER_WINDOW = 18;
const callTimestamps: number[] = [];

function softRateGate(): string | undefined {
  const now = Date.now();
  while (callTimestamps.length > 0 && (callTimestamps[0] as number) <= now - WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= SOFT_MAX_PER_WINDOW) {
    return `client-side soft limit ${SOFT_MAX_PER_WINDOW}/min (iTunes documents ~20 req/min, CLM-MUS-001)`;
  }
  callTimestamps.push(now);
  return undefined;
}

interface ITunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
}

export function mapItunesTrack(r: ITunesResult, queryUsed: string): Hit | undefined {
  if (typeof r.trackId !== "number" || typeof r.trackName !== "string" || !r.trackName) {
    return undefined;
  }
  const raw: Track = {
    candidate_id: `it_${r.trackId}`,
    title: r.trackName,
    artist: typeof r.artistName === "string" && r.artistName ? r.artistName : "unknown",
  };
  const version = detectVersionFromText(r.trackName, r.collectionName);
  if (version !== undefined) raw.version = version;
  if (typeof r.releaseDate === "string" && /^\d{4}/.test(r.releaseDate)) {
    raw.year = Number(r.releaseDate.slice(0, 4));
  }
  if (typeof r.artworkUrl100 === "string" && /^https?:\/\//i.test(r.artworkUrl100)) {
    raw.artwork_url = r.artworkUrl100;
  }

  const parsed = trackSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  const hit: Hit = {
    track: sanitizeTrack(parsed.data),
    origin: "itunes",
    badge: "LIVE",
    source: "itunes",
    queryUsed,
  };
  if (typeof r.previewUrl === "string" && /^https?:\/\//i.test(r.previewUrl)) {
    hit.previewUrl = r.previewUrl;
  }
  return hit;
}

export function createItunesAdapter(): Adapter {
  return {
    name: "itunes",
    hedgeable: false,
    async search({ query, limit, signal }): Promise<AdapterOutcome> {
      const started = Date.now();
      const gate = softRateGate();
      if (gate !== undefined) {
        return {
          provider: "itunes",
          badge: "LIVE",
          ok: false,
          hits: [],
          latencyMs: 0,
          errorKind: "rate_limited",
          detail: gate,
        };
      }

      const url = `${SEARCH_URL}?term=${encodeURIComponent(query)}&entity=song&media=music&limit=${limit}`;
      try {
        const res = await fetch(url, {
          signal,
          headers: { "User-Agent": OMNIBEAT_UA, Accept: "application/json" },
        });
        if (!res.ok) {
          const rateLimited = res.status === 403 || res.status === 429;
          return {
            provider: "itunes",
            badge: "LIVE",
            ok: false,
            hits: [],
            latencyMs: Date.now() - started,
            errorKind: rateLimited ? "rate_limited" : "http",
            detail: `HTTP ${res.status} from ${SEARCH_URL}`,
          };
        }
        const body = (await res.json()) as { results?: ITunesResult[] };
        const results = Array.isArray(body.results) ? body.results : [];
        const hits: Hit[] = [];
        for (const r of results) {
          const hit = mapItunesTrack(r, query);
          if (hit) hits.push(hit);
          if (hits.length >= limit) break;
        }
        return {
          provider: "itunes",
          badge: "LIVE",
          ok: true,
          hits,
          latencyMs: Date.now() - started,
          detail: "attribution: provided courtesy of iTunes (CLM-MUS-003)",
        };
      } catch (err) {
        const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
        return {
          provider: "itunes",
          badge: "LIVE",
          ok: false,
          hits: [],
          latencyMs: Date.now() - started,
          errorKind: aborted ? "timeout" : "network",
          detail: aborted ? "aborted at budget/deadline" : String((err as Error)?.message ?? err),
        };
      }
    },
  };
}
