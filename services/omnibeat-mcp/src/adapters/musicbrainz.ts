/**
 * MusicBrainz adapter - SECONDARY provider (EVIDENCE_SUMMARY 4 / CLM-MUS-005:
 * hard 1 request/second, contactable User-Agent mandatory; CLM-MUS-006:
 * non-Latin alias search live-verified; CLM-MUS-007/008: studio/live via
 * release-group types).
 *
 * Verified on this machine 2026-10-19 (see PROOF.md):
 *  - `query=<plain text>`            -> 200, 4.5 s cold / ~0.4 s warm
 *  - `query=<devanagari text>`       -> 503 (service/rate response)
 *  - `query=alias:<devanagari text>` -> 200 in 0.37 s  => non-Latin queries are
 *    issued as alias queries directly (one request only: two round-trips cannot
 *    fit the 600 ms candidate budget behind a 1 rps bucket).
 *
 * Version classification: release-group `secondary-types` containing "Live"
 * wins (structure first); regex on titles is the fallback via
 * detectVersionFromText.
 */
import { trackSchema, type Track } from "@omnibeat/schemas";
import { sanitizeTrack } from "../resolver/hygiene.js";
import { detectVersionFromText, OMNIBEAT_UA, type Adapter, type AdapterOutcome, type Hit } from "./types.js";

const BASE_URL = "https://musicbrainz.org/ws/2/recording";

/** Token bucket: `rps` tokens/second, refilled continuously. */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private rps: number) {
    this.tokens = rps;
    this.lastRefill = Date.now();
  }

  /** Re-read the configured rate (blueprint 8.8: config, not code). */
  setRps(rps: number): void {
    if (rps === this.rps) return;
    this.refill();
    this.rps = rps;
    this.tokens = Math.min(this.tokens, rps);
  }

  private refill(): void {
    const now = Date.now();
    const gained = ((now - this.lastRefill) / 1000) * this.rps;
    if (gained > 0) {
      this.tokens = Math.min(this.rps, this.tokens + gained);
      this.lastRefill = now;
    }
  }

  /** Take a token, waiting up to maxWaitMs (abortable). Returns false if the
   *  wait budget ran out - the caller then sheds honestly as rate_limited. */
  async take(maxWaitMs: number, signal: AbortSignal): Promise<boolean> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (signal.aborted) return false;
      const needed = 1 - this.tokens;
      const waitMs = Math.min(Math.ceil((needed / this.rps) * 1000), deadline - Date.now(), 250);
      if (waitMs <= 0) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, waitMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return true;
      }
    }
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

interface MBArtistCredit {
  name?: string;
  joinphrase?: string;
}

interface MBReleaseGroup {
  "primary-type"?: string;
  "secondary-types"?: string[];
}

interface MBRelease {
  title?: string;
  date?: string;
  "release-group"?: MBReleaseGroup;
}

interface MBRecording {
  id?: string;
  title?: string;
  length?: number;
  score?: number;
  "artist-credit"?: MBArtistCredit[];
  releases?: MBRelease[];
  "first-release-date"?: string;
  "isrc-list"?: string[];
}

function joinCredit(credit: MBArtistCredit[] | undefined): string {
  if (!Array.isArray(credit) || credit.length === 0) return "";
  let out = "";
  for (let i = 0; i < credit.length; i += 1) {
    const part = credit[i];
    out += part?.name ?? "";
    if (i < credit.length - 1) out += part?.joinphrase ?? "";
  }
  return out.trim();
}

function versionFromReleaseGroups(releases: MBRelease[] | undefined): Track["version"] {
  if (!Array.isArray(releases)) return undefined;
  for (const r of releases) {
    const rg = r["release-group"];
    if (!rg) continue;
    const secondary = rg["secondary-types"];
    if (Array.isArray(secondary)) {
      if (secondary.includes("Live")) return "live";
      if (secondary.includes("Compilation")) continue;
      if (secondary.includes("Remix")) return "remix";
      if (secondary.includes("Cover")) return "cover";
      if (secondary.includes("Karaoke")) return "karaoke";
    }
  }
  return undefined;
}

export function mapMusicBrainzTrack(rec: MBRecording, queryUsed: string): Hit | undefined {
  if (typeof rec.id !== "string" || typeof rec.title !== "string" || !rec.title) return undefined;
  const artist = joinCredit(rec["artist-credit"]) || "unknown";

  const raw: Track = {
    candidate_id: `mb_${rec.id}`,
    title: rec.title,
    artist,
    version: "unknown",
    canonical_ids: { musicbrainz: rec.id },
  };

  const fromStructure = versionFromReleaseGroups(rec.releases);
  if (fromStructure !== undefined) {
    raw.version = fromStructure;
  } else {
    raw.version = detectVersionFromText(rec.title, rec.releases?.[0]?.title) ?? "unknown";
  }

  const firstDate = rec["first-release-date"] ?? rec.releases?.[0]?.date;
  if (typeof firstDate === "string" && /^\d{4}/.test(firstDate)) {
    raw.year = Number(firstDate.slice(0, 4));
  }
  const isrc = Array.isArray(rec["isrc-list"]) ? rec["isrc-list"][0] : undefined;
  if (typeof isrc === "string" && isrc.length > 0) {
    raw.canonical_ids = { musicbrainz: rec.id, isrc };
  }

  const parsed = trackSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return {
    track: sanitizeTrack(parsed.data),
    origin: "musicbrainz",
    badge: "LIVE",
    source: "musicbrainz",
    queryUsed,
  };
}

/** Non-Latin (anything outside ASCII) goes through the verified alias field. */
export function musicBrainzQueryFor(query: string): { query: string; alias: boolean } {
  const isAscii = /^[\x20-\x7E]+$/.test(query);
  if (isAscii) return { query, alias: false };
  return { query: `alias:"${query}"`, alias: true };
}

export function createMusicBrainzAdapter(rps: () => number): Adapter {
  const bucket = new TokenBucket(rps());

  return {
    name: "musicbrainz",
    hedgeable: false, // 1 req/s hard limit (CLM-MUS-005): a duplicate request
    // would both violate the limit and wait behind its own bucket.
    async search({ query, limit, signal }): Promise<AdapterOutcome> {
      const started = Date.now();
      const configuredRps = rps();
      bucket.setRps(configuredRps);

      const mbQuery = musicBrainzQueryFor(query);
      const budgetMs = Math.max(0, 600 - (Date.now() - started));
      const hasToken = await bucket.take(budgetMs, signal);
      if (!hasToken) {
        return {
          provider: "musicbrainz",
          badge: "LIVE",
          ok: false,
          hits: [],
          latencyMs: Date.now() - started,
          errorKind: "rate_limited",
          detail: `MusicBrainz 1 req/s token bucket empty (rps=${configuredRps}, CLM-MUS-005)`,
        };
      }

      const url = `${BASE_URL}?fmt=json&limit=${limit}&query=${encodeURIComponent(mbQuery.query)}`;
      try {
        const res = await fetch(url, {
          signal,
          headers: { "User-Agent": OMNIBEAT_UA, Accept: "application/json" },
        });
        if (res.status === 429 || res.status === 503) {
          return {
            provider: "musicbrainz",
            badge: "LIVE",
            ok: false,
            hits: [],
            latencyMs: Date.now() - started,
            errorKind: "rate_limited",
            detail: `HTTP ${res.status} from musicbrainz.org (observed live on this machine; 503 also seen on non-alias Devanagari queries)`,
          };
        }
        if (!res.ok) {
          return {
            provider: "musicbrainz",
            badge: "LIVE",
            ok: false,
            hits: [],
            latencyMs: Date.now() - started,
            errorKind: "http",
            detail: `HTTP ${res.status} from musicbrainz.org`,
          };
        }
        const body = (await res.json()) as { recordings?: MBRecording[] };
        const recordings = Array.isArray(body.recordings) ? body.recordings : [];
        const hits: Hit[] = [];
        for (const rec of recordings) {
          const hit = mapMusicBrainzTrack(rec, query);
          if (hit) hits.push(hit);
          if (hits.length >= limit) break;
        }
        return {
          provider: "musicbrainz",
          badge: "LIVE",
          ok: true,
          hits,
          latencyMs: Date.now() - started,
          detail: mbQuery.alias ? "alias-field query (non-Latin, CLM-MUS-006)" : undefined,
        };
      } catch (err) {
        const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
        return {
          provider: "musicbrainz",
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
