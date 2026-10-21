/**
 * Expand fixtures/catalog-replay/catalog.json to COVER THE EVAL CORPUS.
 *
 * The eval harness (packages/eval) measures three systems against the replay
 * catalog only (OMNIBEAT_REPLAY_ONLY=1). A heldout utterance whose EXPECTED
 * title is not present as a catalog track title is unanswerable by
 * construction for EVERY system, so the honest denominator of "answerable"
 * coverage depends on this catalog covering the corpus expected titles.
 *
 * This script:
 *   1. reads eval/corpus.lock.json (tune split) + eval/heldout.lock.json,
 *   2. collects every distinct `expect` title,
 *   3. captures REAL upstream responses (iTunes Search + MusicBrainz WS/2)
 *      for each title that the merged catalog does not already cover -
 *      via the SAME mapping functions the live adapters use (dist/adapters),
 *      so a captured row is byte-identical in shape to a live row,
 *   4. merges the new rows into catalog.json (existing entries preserved,
 *      tracks deduped), respecting MusicBrainz's 1 req/s policy and iTunes'
 *      documented rate budget, and
 *   5. writes eval/coverage-gaps.json: for every expected title that is
 *      STILL missing after capture, the exact upstream error / status and
 *      what we got instead. The eval harness excludes those utterances from
 *      the answerable denominator - honestly, with the exclusion count in
 *      the report. Nothing is faked: no title is ever invented into the
 *      catalog, and a failed capture stays a recorded gap.
 *
 * Run (from services/omnibeat-mcp): npm run build && node scripts/expand-catalog.mjs
 * Idempotent: already-covered titles are skipped; re-running only fills gaps.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapItunesTrack } from "../dist/adapters/itunes.js";
import { mapMusicBrainzTrack, musicBrainzQueryFor } from "../dist/adapters/musicbrainz.js";
import { replayKey } from "../dist/adapters/replay.js";

const UA = "OmniBeat/0.1 (hackathon; contact@example.com)";
const HERE = fileURLToPath(new URL("./", import.meta.url));
const REPO_ROOT = new URL("../../../", import.meta.url); // scripts/ -> omnibeat-mcp -> services/ -> repo root
const SERVICE_ROOT = new URL("../", import.meta.url); // scripts/ -> omnibeat-mcp
const CATALOG_PATH = fileURLToPath(new URL("fixtures/catalog-replay/catalog.json", SERVICE_ROOT));
const EVAL_DIR = fileURLToPath(new URL("eval/", REPO_ROOT));
const GAPS_PATH = `${EVAL_DIR}coverage-gaps.json`;

const CORPUS_LOCK = `${EVAL_DIR}corpus.lock.json`;
const HELDOUT_LOCK = `${EVAL_DIR}heldout.lock.json`;

/**
 * MUST stay byte-identical to normalizeTitle() in packages/eval/src/metrics.ts
 * (the harness uses it to decide "expected title is in the catalog").
 */
function normalizeTitle(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019\u02bc]/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLock(path, expectSplit) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed.schema !== "omnibeat.eval-corpus.v1") {
    throw new Error(`${path}: unexpected schema ${parsed.schema}`);
  }
  if (parsed.split !== expectSplit) throw new Error(`${path}: split ${parsed.split} != ${expectSplit}`);
  if (parsed.entry_count !== parsed.entries.length) throw new Error(`${path}: entry_count mismatch`);
  return parsed;
}

async function timedFetch(url, headers, { retries = 0, backoffMs = [] } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const res = await fetch(url, { headers });
      const latencyMs = Date.now() - started;
      const text = await res.text();
      last = { url, http_status: res.status, latency_ms: latencyMs, bytes: text.length, attempts: attempt + 1 };
      if (res.ok) return { ok: true, ...last, body: JSON.parse(text) };
      // MusicBrainz answers 503 when busy: retry with backoff, never hammer.
      last.upstream_message = text.slice(0, 200);
      if (res.status >= 500 && attempt < retries) {
        await sleep(backoffMs[attempt] ?? 15000);
        continue;
      }
      return { ok: false, ...last, body: undefined };
    } catch (err) {
      last = { url, error: String(err?.message ?? err), latency_ms: Date.now() - started, attempts: attempt + 1 };
      if (attempt < retries) {
        await sleep(backoffMs[attempt] ?? 10000);
        continue;
      }
      return { ok: false, ...last, status: 0, body: undefined };
    }
  }
  return { ok: false, ...last, body: undefined };
}

function itunesUrl(q) {
  return `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&media=music&limit=8`;
}
function musicbrainzUrl(q) {
  const mb = musicBrainzQueryFor(q);
  return `https://musicbrainz.org/ws/2/recording?fmt=json&limit=8&query=${encodeURIComponent(mb.query)}`;
}

/** Capture both providers for one query; returns {groups, report}. */
async function captureQuery(query) {
  const groups = [];
  const report = {};
  const capturedAt = new Date().toISOString();

  // --- iTunes (keyless, ~20 req/min documented budget) ----------------------
  const iUrl = itunesUrl(query);
  const itunesRes = await timedFetch(iUrl, { "User-Agent": UA, Accept: "application/json" }, { retries: 2, backoffMs: [5000, 10000] });
  if (itunesRes.ok) {
    const results = Array.isArray(itunesRes.body?.results) ? itunesRes.body.results : [];
    const tracks = [];
    for (const raw of results) {
      const hit = mapItunesTrack(raw, query);
      if (hit) tracks.push({ track: hit.track }); // no preview_url on disk - CLM-MUS-003
    }
    report.itunes = {
      url: iUrl,
      http_status: itunesRes.http_status,
      latency_ms: itunesRes.latency_ms,
      attempts: itunesRes.attempts,
      mapped: tracks.length,
      of_results: results.length,
      exact_title_hits: tracks.filter((t) => normalizeTitle(t.track.title) === normalizeTitle(query)).length,
    };
    if (tracks.length > 0) {
      groups.push({
        origin: "itunes",
        captured_at: capturedAt,
        upstream: { source: "itunes-search", url: iUrl, http_status: itunesRes.http_status },
        tracks,
      });
    }
  } else {
    report.itunes = {
      url: iUrl,
      http_status: itunesRes.http_status ?? 0,
      latency_ms: itunesRes.latency_ms,
      attempts: itunesRes.attempts,
      error: itunesRes.error ?? `HTTP ${itunesRes.http_status}: ${itunesRes.upstream_message ?? "no body"}`,
    };
  }

  await sleep(2000);

  // --- MusicBrainz (strict 1 rps policy: 1.5 s gap + 503 backoff) -----------
  const mUrl = musicbrainzUrl(query);
  const mbRes = await timedFetch(mUrl, { "User-Agent": UA, Accept: "application/json" }, { retries: 3, backoffMs: [8000, 20000, 40000] });
  if (mbRes.ok) {
    const recordings = Array.isArray(mbRes.body?.recordings) ? mbRes.body.recordings : [];
    const tracks = [];
    for (const raw of recordings) {
      const hit = mapMusicBrainzTrack(raw, query);
      if (hit) tracks.push({ track: hit.track });
    }
    report.musicbrainz = {
      url: mUrl,
      http_status: mbRes.http_status,
      latency_ms: mbRes.latency_ms,
      attempts: mbRes.attempts,
      mapped: tracks.length,
      of_recordings: recordings.length,
      exact_title_hits: tracks.filter((t) => normalizeTitle(t.track.title) === normalizeTitle(query)).length,
    };
    if (tracks.length > 0) {
      groups.push({
        origin: "musicbrainz",
        captured_at: capturedAt,
        upstream: { source: "musicbrainz-ws2-recording", url: mUrl, http_status: mbRes.http_status },
        tracks,
      });
    }
  } else {
    report.musicbrainz = {
      url: mUrl,
      http_status: mbRes.http_status ?? 0,
      latency_ms: mbRes.latencyMs ?? mbRes.latency_ms,
      attempts: mbRes.attempts,
      error: mbRes.error ?? `HTTP ${mbRes.http_status}: ${mbRes.upstream_message ?? "no body"}`,
    };
  }

  await sleep(1500); // MusicBrainz 1 req/s policy between iterations
  return { groups, report };
}

function trackId(track) {
  return `${normalizeTitle(track.title)}|${normalizeTitle(track.artist ?? "")}`;
}

/** Merge captured groups into catalog entries, deduping tracks per key. */
function mergeEntry(catalog, query, groups) {
  const key = replayKey(query);
  let entry = catalog.entries.find((e) => e.key === key);
  if (!entry) {
    entry = { key, groups: [] };
    catalog.entries.push(entry);
  }
  const seen = new Set();
  for (const g of entry.groups) for (const t of g.tracks) seen.add(trackId(t.track));
  for (const group of groups) {
    const fresh = { ...group, tracks: group.tracks.filter((t) => !seen.has(trackId(t.track))) };
    for (const t of fresh.tracks) seen.add(trackId(t.track));
    if (fresh.tracks.length > 0) entry.groups.push(fresh);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Runner (plain node ESM, top-level await).
// ---------------------------------------------------------------------------

const corpus = readLock(CORPUS_LOCK, "tune");
const heldout = readLock(HELDOUT_LOCK, "heldout");

const titleRows = new Map();
for (const [entries, split] of [[corpus.entries, "tune"], [heldout.entries, "heldout"]]) {
  for (const e of entries) {
    const rec = titleRows.get(e.expect) ?? { tune: 0, heldout: 0 };
    rec[split] += 1;
    titleRows.set(e.expect, rec);
  }
}
const titles = [...titleRows.keys()].sort((a, b) => a.localeCompare(b));
process.stdout.write(
  `expand-catalog: ${titles.length} distinct expected titles across tune(${corpus.entry_count})+heldout(${heldout.entry_count})\n`,
);

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
if (catalog.schema !== "omnibeat.replay-catalog.v0") throw new Error(`unexpected catalog schema ${catalog.schema}`);

const coveredNow = () =>
  new Set(catalog.entries.flatMap((e) => e.groups.flatMap((g) => g.tracks.map((t) => normalizeTitle(t.track.title)))));
const pending = titles.filter((t) => !coveredNow().has(normalizeTitle(t)));
process.stdout.write(`  already covered by existing catalog: ${titles.length - pending.length}; pending capture: ${pending.length}\n`);

const perTitleReport = new Map(); // title -> {itunes?, musicbrainz?}

for (const title of pending) {
  process.stdout.write(`capture "${title}": `);
  const { groups, report } = await captureQuery(title);
  perTitleReport.set(title, report);
  const merged = mergeEntry(catalog, title, groups);
  const iT = report.itunes?.mapped ?? 0;
  const mB = report.musicbrainz?.mapped ?? 0;
  process.stdout.write(`itunes ${iT} mapped (status ${report.itunes?.http_status ?? report.itunes?.error}), musicbrainz ${mB} mapped (status ${report.musicbrainz?.http_status ?? report.musicbrainz?.error}) -> key "${replayKey(title)}" (${merged.groups.length} groups)\n`);
}

// Coverage verdict against the MERGED catalog, using the harness's own
// normalization. Anything still missing becomes an honest gap record.
const finalCovered = coveredNow();
const gaps = [];
for (const title of titles) {
  if (finalCovered.has(normalizeTitle(title))) continue;
  const report = perTitleReport.get(title) ?? {}; // not captured this run (already covered earlier -> cannot be a gap)
  gaps.push({
    expected_title: title,
    normalized: normalizeTitle(title),
    heldout_rows: titleRows.get(title).heldout,
    tune_rows: titleRows.get(title).tune,
    upstream: report,
    note:
      Object.keys(report).length === 0
        ? "not present in catalog and not captured in this run (no per-title upstream record)"
        : "captured upstream responses, but no returned track title normalizes to the expected title; excluded from the answerable denominator",
  });
}

mkdirSync(EVAL_DIR, { recursive: true });
const gapsFile = {
  schema: "omnibeat.eval-coverage-gaps.v1",
  generated_at: new Date().toISOString(),
  method: "services/omnibeat-mcp/scripts/expand-catalog.mjs - live iTunes Search + MusicBrainz WS/2 capture per corpus expected title",
  expected_titles_total: titles.length,
  expected_titles_covered: titles.length - gaps.length,
  gap_titles: gaps.length,
  gaps,
};
writeFileSync(GAPS_PATH, `${JSON.stringify(gapsFile, null, 2)}\n`, "utf8");

catalog.captured_at = new Date().toISOString();
catalog.notes =
  "REAL upstream responses (iTunes Search + MusicBrainz WS/2) captured from this machine by scripts/capture-fixtures.mjs + scripts/expand-catalog.mjs (corpus-coverage expansion). Served badged REPLAY. Previews are never persisted (CLM-MUS-003).";
writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

process.stdout.write(
  `wrote ${CATALOG_PATH} entries=${catalog.entries.length}; coverage ${titles.length - gaps.length}/${titles.length} expected titles; gaps file ${GAPS_PATH} (${gaps.length} gap(s))\n`,
);
if (gaps.length > 0) {
  for (const g of gaps) process.stdout.write(`  GAP "${g.expected_title}" (${g.heldout_rows} heldout row(s)): ${g.note}\n`);
}
