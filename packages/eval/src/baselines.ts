/**
 * Baseline B: raw normalized-token match top-1.
 *
 * The deliberately dumb competitor: no peeling, no ASR n-best, no scoring
 * model. It normalizes the RAW transcript and every track title in the replay
 * catalog to token sets, scores each title by the fraction of its tokens found
 * verbatim in the transcript, and auto-plays the argmax (first catalog order
 * wins ties). Score 0 -> abstain (not_found). This is computed OFFLINE from
 * the same catalog.json the server replays, so it never touches the network
 * and is fully regenerable.
 */
import { readFileSync } from "node:fs";
import { normalizeTitle, type EvalRow } from "./metrics.js";
import { REPLAY_CATALOG } from "./paths.js";

interface CatalogTrack {
  track: { title: string };
}

export interface CatalogEntry {
  key: string;
  groups: { tracks: CatalogTrack[] }[];
}

export interface ReplayCatalogFile {
  schema: string;
  captured_at: string;
  entries: CatalogEntry[];
}

export function loadCatalogTracks(path: string = REPLAY_CATALOG): { title: string }[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ReplayCatalogFile;
  const seen = new Set<string>();
  const titles: { title: string }[] = [];
  for (const entry of parsed.entries) {
    for (const group of entry.groups) {
      for (const item of group.tracks) {
        const key = normalizeTitle(item.track.title);
        if (key.length === 0 || seen.has(key)) continue;
        seen.add(key);
        titles.push({ title: item.track.title });
      }
    }
  }
  return titles;
}

export function normalizeTokens(value: string): string[] {
  const normalized = normalizeTitle(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Title-token coverage by raw transcript tokens (order-insensitive, exact token match). */
export function tokenMatchScore(transcript: string, title: string): number {
  const inputTokens = new Set(normalizeTokens(transcript));
  const titleTokens = normalizeTokens(title);
  if (titleTokens.length === 0) return 0;
  const shared = titleTokens.filter((t) => inputTokens.has(t)).length;
  return shared / titleTokens.length;
}

export interface BaselineBResult {
  decision: "play" | "not_found";
  chosenTitle: string | null;
  score: number;
}

export function baselineBResolve(transcript: string, catalog: { title: string }[]): BaselineBResult {
  let best: { title: string; score: number } | undefined;
  for (const candidate of catalog) {
    const score = tokenMatchScore(transcript, candidate.title);
    if (score > 0 && (best === undefined || score > best.score)) best = { title: candidate.title, score };
  }
  if (!best) return { decision: "not_found", chosenTitle: null, score: 0 };
  return { decision: "play", chosenTitle: best.title, score: best.score };
}

/** Map a baseline-B verdict onto the shared EvalRow shape. */
export function baselineBRow(
  corpusRow: { id: string; input: string; expect: string; locale: string },
  catalog: { title: string }[],
): EvalRow {
  const verdict = baselineBResolve(corpusRow.input, catalog);
  return {
    id: corpusRow.id,
    input: corpusRow.input,
    expect: corpusRow.expect,
    locale: corpusRow.locale,
    decision: verdict.decision,
    confidence: verdict.score,
    chosenTitle: verdict.chosenTitle,
    top1Title: verdict.chosenTitle,
    candidateCount: verdict.chosenTitle === null ? 0 : 1,
    latencyMs: 0,
  };
}
