/**
 * Capture REAL upstream responses into fixtures/catalog-replay/ (the labelled
 * REPLAY cache - the only cached source OmniBeat serves).
 *
 * Uses the same mapping functions the live adapters use (dist/adapters/*.js),
 * so a captured row and a live row are byte-identical in shape - no drift.
 *
 *   npm run build && node scripts/capture-fixtures.mjs
 *
 * Every fetch (success OR failure) is recorded in `capture_log` with URL,
 * status and latency, so PROOF.md can show exactly what this machine got.
 * Preview URLs are deliberately NOT persisted: Apple previews are stream-only
 * promotional media (EVIDENCE_SUMMARY 4 / CLM-MUS-003).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapItunesTrack } from "../dist/adapters/itunes.js";
import { mapMusicBrainzTrack, musicBrainzQueryFor } from "../dist/adapters/musicbrainz.js";
import { replayKey } from "../dist/adapters/replay.js";

const UA = "OmniBeat/0.1 (hackathon; contact@example.com)";
const OUT_DIR = fileURLToPath(new URL("../fixtures/catalog-replay/", import.meta.url));

const QUERIES = [
  "raja ji",
  "kala chashma",
  "tera ban jaunga",
  "brown munde",
  "chaap tilak sab teri",
  "kala chashma devanagari", // placeholder, replaced below
];
// Real non-Latin query (exercises the verified alias path, CLM-MUS-006).
QUERIES[5] = "काला चश्मा";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capture_log = [];

async function timedFetch(url, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    capture_log.push({ url, http_status: res.status, latency_ms: latencyMs, bytes: text.length });
    if (!res.ok) return { ok: false, status: res.status, body: undefined };
    return { ok: true, status: res.status, body: JSON.parse(text) };
  } catch (err) {
    capture_log.push({ url, error: String(err?.message ?? err), latency_ms: Date.now() - started });
    return { ok: false, status: 0, body: undefined };
  }
}

function itunesUrl(q) {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&media=music&limit=8`;
}

function musicbrainzUrl(q) {
  const mb = musicBrainzQueryFor(q);
  return `https://musicbrainz.org/ws/2/recording?fmt=json&limit=8&query=${encodeURIComponent(mb.query)}`;
}

const entries = [];

for (const query of QUERIES) {
  const groups = [];
  const capturedAt = new Date().toISOString();

  // --- iTunes (keyless, ~20 req/min documented) ----------------------------
  const itunesUrlString = itunesUrl(query);
  const itunesRes = await timedFetch(itunesUrlString, { "User-Agent": UA, Accept: "application/json" });
  if (itunesRes.ok) {
    const results = Array.isArray(itunesRes.body?.results) ? itunesRes.body.results : [];
    const tracks = [];
    for (const raw of results) {
      const hit = mapItunesTrack(raw, query);
      if (hit) tracks.push({ track: hit.track }); // no preview_url on disk - CLM-MUS-003
    }
    if (tracks.length > 0) {
      groups.push({
        origin: "itunes",
        captured_at: capturedAt,
        upstream: {
          source: "itunes-search",
          url: itunesUrlString,
          http_status: itunesRes.status,
        },
        tracks,
      });
    }
    process.stdout.write(`itunes  "${query}": ${tracks.length}/${results.length} mapped\n`);
  } else {
    process.stdout.write(`itunes  "${query}": FAILED status=${itunesRes.status}\n`);
  }

  await sleep(1500);

  // --- MusicBrainz (1 rps, contactable UA) ---------------------------------
  const mbUrlString = musicbrainzUrl(query);
  const mbRes = await timedFetch(mbUrlString, { "User-Agent": UA, Accept: "application/json" });
  if (mbRes.ok) {
    const recordings = Array.isArray(mbRes.body?.recordings) ? mbRes.body.recordings : [];
    const tracks = [];
    for (const raw of recordings) {
      const hit = mapMusicBrainzTrack(raw, query);
      if (hit) tracks.push({ track: hit.track });
    }
    if (tracks.length > 0) {
      groups.push({
        origin: "musicbrainz",
        captured_at: capturedAt,
        upstream: {
          source: "musicbrainz-ws2-recording",
          url: mbUrlString,
          http_status: mbRes.status,
        },
        tracks,
      });
    }
    process.stdout.write(`musicbz "${query}": ${tracks.length}/${recordings.length} mapped\n`);
  } else {
    process.stdout.write(`musicbz "${query}": FAILED status=${mbRes.status}\n`);
  }

  if (groups.length > 0) {
    entries.push({ key: replayKey(query), groups });
  }
  await sleep(1100);
}

const catalog = {
  schema: "omnibeat.replay-catalog.v0",
  captured_at: new Date().toISOString(),
  notes:
    "REAL upstream responses (iTunes Search + MusicBrainz WS/2) captured from this machine by scripts/capture-fixtures.mjs. Served badged REPLAY. Previews are never persisted (CLM-MUS-003).",
  entries,
  capture_log,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}catalog.json`, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
process.stdout.write(
  `wrote ${OUT_DIR}catalog.json entries=${entries.length} fetches=${capture_log.length} failures=${capture_log.filter((c) => c.error || (c.http_status && c.http_status >= 400)).length}\n`,
);
