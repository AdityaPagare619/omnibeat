/**
 * Replay adapter - the ONLY cached source (blueprint 4.2 / AC-14: every row is
 * badged LIVE, REPLAY or FIXTURE; no unlabeled mock).
 *
 * Reads `fixtures/catalog-replay/catalog.json`, which is a real-response cache:
 * `scripts/capture-fixtures.mjs` queried the actual iTunes Search and
 * MusicBrainz endpoints from this machine and stored the mapped rows together
 * with the upstream URL + HTTP status it got (see PROOF.md capture output).
 * On a network MISS (no live source returned anything) or when
 * OMNIBEAT_REPLAY_ONLY=1, the runner serves these rows badged REPLAY.
 *
 * Offline continuity pool (`offline-pool.json`) is separate and licensed:
 * EVIDENCE_SUMMARY 4 - only Pixabay / FMA / Incompetech audio may be cached
 * offline; provider previews (iTunes, Deezer) are NEVER cached. An empty pool
 * is served as an empty plan - we do not invent prefetch URLs.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { trackSchema, type Track } from "@omnibeat/schemas";
import { sanitizeTrack } from "../resolver/hygiene.js";
import { tokenize } from "../resolver/scoring.js";
import { log } from "../logging.js";
import type { Adapter, AdapterOutcome, Hit, HitOrigin } from "./types.js";

export interface ReplayTrackEntry {
  track: Track;
  preview_url?: string;
}

export interface ReplayGroup {
  origin: HitOrigin;
  captured_at: string;
  upstream?: { source: string; url: string; http_status: number };
  tracks: ReplayTrackEntry[];
}

export interface ReplayEntry {
  key: string;
  groups: ReplayGroup[];
}

export interface ReplayCatalog {
  schema: string;
  captured_at: string;
  notes?: string;
  entries: ReplayEntry[];
}

export interface PoolItem {
  track: Track;
  url: string;
  bytes: number;
  ttl_seconds: number;
  cacheable: boolean;
  license: string;
  tags: string[];
  provenance?: { source_page: string; checked_at: string };
}

export interface OfflinePool {
  schema: string;
  captured_at: string;
  license_policy: string;
  items: PoolItem[];
}

const DEFAULT_REPLAY_DIR = fileURLToPath(new URL("../../fixtures/catalog-replay/", import.meta.url));

function replayDir(): string {
  const override = process.env.OMNIBEAT_REPLAY_PATH;
  return override !== undefined && override.trim() !== "" ? override : DEFAULT_REPLAY_DIR;
}

const EMPTY_CATALOG: ReplayCatalog = { schema: "omnibeat.replay-catalog.v0", captured_at: "", entries: [] };
const EMPTY_POOL: OfflinePool = {
  schema: "omnibeat.offline-pool.v0",
  captured_at: "",
  license_policy: "",
  items: [],
};

let catalogCache: { dir: string; value: ReplayCatalog } | undefined;
let poolCache: { dir: string; value: OfflinePool } | undefined;

function readJson<T>(path: string): T | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    log.warn("replay_read_failed", { path, error: String((err as Error)?.message ?? err) });
    return undefined;
  }
}

export function loadReplayCatalog(): ReplayCatalog {
  const dir = replayDir();
  if (catalogCache && catalogCache.dir === dir) return catalogCache.value;
  const raw = readJson<ReplayCatalog>(`${dir}catalog.json`);
  const value = raw && Array.isArray(raw.entries) ? raw : EMPTY_CATALOG;
  if (value.entries.length === 0) {
    log.warn("replay_catalog_empty", { dir });
  } else {
    log.info("replay_catalog_loaded", { dir, entries: value.entries.length, captured_at: value.captured_at });
  }
  catalogCache = { dir, value };
  return value;
}

export function loadOfflinePool(): OfflinePool {
  const dir = replayDir();
  if (poolCache && poolCache.dir === dir) return poolCache.value;
  const raw = readJson<OfflinePool>(`${dir}offline-pool.json`);
  const value = raw && Array.isArray(raw.items) ? raw : EMPTY_POOL;
  log.info("offline_pool_loaded", { dir, items: value.items.length, captured_at: value.captured_at });
  poolCache = { dir, value };
  return value;
}

/** Test/lifetime helper - forget cached fixtures (used after env changes). */
export function resetReplayCache(): void {
  catalogCache = undefined;
  poolCache = undefined;
}

/** Normalized lookup key: lowercase, punctuation off, single spaces. */
export function replayKey(query: string): string {
  return tokenize(query).join(" ");
}

/**
 * Find the catalog entry for a query: exact key first, then token-overlap
 * (either direction >= 0.6) so "play raja ji" style residue still hits
 * "raja ji". Returns undefined on a genuine miss - a miss is not an error.
 */
export function findReplayEntry(catalog: ReplayCatalog, query: string): ReplayEntry | undefined {
  const key = replayKey(query);
  if (key.length === 0) return undefined;
  const direct = catalog.entries.find((e) => e.key === key);
  if (direct) return direct;

  const queryTokens = tokenize(key);
  let best: { entry: ReplayEntry; score: number } | undefined;
  for (const entry of catalog.entries) {
    const entryTokens = tokenize(entry.key);
    if (entryTokens.length === 0 || queryTokens.length === 0) continue;
    const shared = queryTokens.filter((t) => entryTokens.includes(t)).length;
    const score = shared / Math.max(queryTokens.length, entryTokens.length);
    if (score >= 0.6 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry;
}

export function replayHits(entry: ReplayEntry, query: string): Hit[] {
  const hits: Hit[] = [];
  for (const group of entry.groups) {
    for (const item of group.tracks) {
      const parsed = trackSchema.safeParse(item.track);
      if (!parsed.success) continue;
      const hit: Hit = {
        track: sanitizeTrack(parsed.data),
        origin: group.origin,
        badge: "REPLAY",
        source: "fixtures",
        queryUsed: query,
      };
      if (typeof item.preview_url === "string" && item.preview_url.startsWith("http")) {
        hit.previewUrl = item.preview_url;
      }
      hits.push(hit);
    }
  }
  return hits;
}

export function createReplayAdapter(): Adapter {
  return {
    name: "fixtures",
    hedgeable: true, // local disk read: hedging is free
    async search({ query }): Promise<AdapterOutcome> {
      const started = Date.now();
      const catalog = loadReplayCatalog();
      const entry = findReplayEntry(catalog, query);
      if (!entry) {
        return {
          provider: "fixtures",
          badge: "REPLAY",
          ok: true,
          hits: [],
          latencyMs: Date.now() - started,
          detail: "no replay entry for query (miss, not an error)",
        };
      }
      return {
        provider: "fixtures",
        badge: "REPLAY",
        ok: true,
        hits: replayHits(entry, query),
        latencyMs: Date.now() - started,
        detail: `REPLAY from ${catalog.captured_at || "unknown capture time"} (entries: ${entry.groups
          .map((g) => g.origin)
          .join("+")})`,
      };
    },
  };
}
