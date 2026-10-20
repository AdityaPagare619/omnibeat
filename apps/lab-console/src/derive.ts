/**
 * Derivation layer — pure functions from REAL trace envelopes to view state.
 *
 * Everything the console shows outside the wire table is derived here, from
 * frames that arrived on the wire. No component invents state; when a field
 * is not present in the trace the views say so ("not in trace") rather than
 * filling in a plausible default (blueprint §2 row 3, §4.2 truth-in-labelling).
 *
 * Payload discovery is deliberately tolerant: the raw JSON-RPC frame nests the
 * tool result differently across MCP SDK versions (result.structuredContent,
 * result.content[0].text as JSON, result itself, notification params). We walk
 * every plausible location and take the newest frame that yields data.
 */
import type { SourceBadge, TraceEnvelope } from "./types";

/* ------------------------------------------------------------------ helpers */

function asRecord(x: unknown): Record<string, unknown> | undefined {
  return typeof x === "object" && x !== null && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : undefined;
}

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.length > 0 ? x : undefined;
}

function asNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function asBool(x: unknown): boolean | undefined {
  return typeof x === "boolean" ? x : undefined;
}

function firstString(r: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = asString(r[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Try to parse a value as JSON; pass through non-strings. */
function parseJsonMaybe(x: unknown): unknown {
  if (typeof x !== "string") return x;
  const t = x.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/**
 * Every plausible payload location inside one raw JSON-RPC frame, outermost
 * first. The tool result for music_resolve_request may live in any of these
 * depending on the SDK's content encoding.
 */
export function payloadLocations(frame: unknown): Record<string, unknown>[] {
  const root = asRecord(frame);
  if (!root) return [];
  const out: Record<string, unknown>[] = [];
  const consider = (v: unknown): void => {
    const r = asRecord(parseJsonMaybe(v));
    if (r) out.push(r);
  };
  consider(root);
  consider(root["params"]);
  const result = asRecord(root["result"]);
  if (result) {
    consider(result);
    consider(result["structuredContent"]);
    const content = result["content"];
    if (Array.isArray(content)) {
      for (const item of content) {
        const c = asRecord(item);
        if (c) {
          consider(c["structuredContent"]);
          consider(c["text"]);
        }
      }
    }
  }
  consider(root["structuredContent"]);
  return out;
}

/* ------------------------------------------------- badges (top bar, §4.2) */

/** Distinct source badges actually seen on the wire, in first-seen order. */
export function badgesSeen(frames: readonly TraceEnvelope[]): SourceBadge[] {
  const seen: SourceBadge[] = [];
  for (const f of frames) {
    if (!seen.includes(f.badge)) seen.push(f.badge);
  }
  return seen;
}

/* ------------------------------------------------------ resolution (centre) */

export interface CandidateView {
  id?: string;
  title: string;
  artist?: string;
  language?: string;
  year?: number;
  /** Blueprint §5.6: metadata from the open web is data, never instructions. */
  untrusted: boolean | undefined;
}

export interface EvidenceView {
  source: string;
  signal: string;
  weight?: number;
}

export interface ResolutionView {
  heard: string;
  decision: string;
  confidence?: number;
  candidates: CandidateView[];
  evidence: EvidenceView[];
  thresholds: { play?: number; ask?: number };
  explanation?: string;
  receipt?: Record<string, unknown>;
  trace_id: string;
  /** Provenance: the event_id of the frame this view was derived from. */
  event_id: string;
  badge: SourceBadge;
}

const DECISION_KEYS = ["decision", "decision_policy"] as const;

function normaliseDecision(raw: string): string {
  const d = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (d === "NOT_FOUND" || d === "NOTFOUND" || d === "NO_MATCH" || d === "NO_MATCH_FOUND") return "NOT_FOUND";
  return d;
}

function looksLikeResolution(r: Record<string, unknown>): boolean {
  const hasDecision = firstString(r, DECISION_KEYS) !== undefined;
  const hasConfidence = asNumber(r["confidence"]) !== undefined || asNumber(r["p1"]) !== undefined;
  const hasCandidates = Array.isArray(r["candidates"]);
  return hasDecision || (hasConfidence && hasCandidates);
}

function readThresholds(r: Record<string, unknown>): { play?: number; ask?: number } {
  const containers: Record<string, unknown>[] = [r];
  for (const key of ["thresholds", "config", "policy", "decision_config"]) {
    const c = asRecord(r[key]);
    if (c) containers.push(c);
  }
  const out: { play?: number; ask?: number } = {};
  for (const c of containers) {
    if (out.play === undefined) {
      out.play =
        asNumber(c["t_play"]) ??
        asNumber(c["T_play"]) ??
        asNumber(c["play_threshold"]) ??
        asNumber(c["playThreshold"]);
    }
    if (out.ask === undefined) {
      out.ask =
        asNumber(c["t_ask"]) ??
        asNumber(c["T_ask"]) ??
        asNumber(c["ask_threshold"]) ??
        asNumber(c["askThreshold"]);
    }
  }
  return out;
}

function readCandidates(r: Record<string, unknown>): CandidateView[] {
  const arr = Array.isArray(r["candidates"]) ? r["candidates"] : [];
  const out: CandidateView[] = [];
  for (const item of arr) {
    const c = asRecord(item);
    if (!c) continue;
    const track = asRecord(c["track"]) ?? c; // tolerate candidates wrapping a track object
    const title = firstString(track, ["title", "name"]);
    if (title === undefined) continue;
    const v: CandidateView = { title, untrusted: asBool(track["untrusted"]) ?? asBool(c["untrusted"]) };
    const id = firstString(track, ["id", "candidate_id", "musicbrainz_id", "isrc"]);
    if (id !== undefined) v.id = id;
    const artist = firstString(track, ["artist", "artist_name"]);
    if (artist !== undefined) v.artist = artist;
    const language = firstString(track, ["language", "lang", "locale"]);
    if (language !== undefined) v.language = language;
    const year = asNumber(track["year"]) ?? asNumber(track["release_year"]);
    if (year !== undefined) v.year = year;
    out.push(v);
  }
  return out;
}

function readEvidence(r: Record<string, unknown>): EvidenceView[] {
  const arr = Array.isArray(r["evidence"]) ? r["evidence"] : [];
  const out: EvidenceView[] = [];
  for (const item of arr) {
    const e = asRecord(item);
    if (!e) continue;
    const source = firstString(e, ["source", "name"]) ?? "unknown source";
    const signal = firstString(e, ["signal", "detail", "reason"]) ?? "";
    const v: EvidenceView = { source, signal };
    const weight = asNumber(e["weight"]);
    if (weight !== undefined) v.weight = weight;
    out.push(v);
  }
  return out;
}

/** Newest frame carrying a resolution payload wins (turn-over-turn state). */
export function deriveResolution(frames: readonly TraceEnvelope[]): ResolutionView | null {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (!f) continue;
    for (const r of payloadLocations(f.mcp?.frame)) {
      if (!looksLikeResolution(r)) continue;
      const decisionRaw = firstString(r, DECISION_KEYS) ?? "UNKNOWN";
      const spoken = asRecord(r["spoken_prompt"]);
      const heard =
        firstString(r, ["heard", "heard_text", "transcript", "query"]) ??
        "";
      const thresholds = readThresholds(r);
      const v: ResolutionView = {
        heard,
        decision: normaliseDecision(decisionRaw),
        candidates: readCandidates(r),
        evidence: readEvidence(r),
        thresholds,
        trace_id: f.trace_id,
        event_id: f.event_id,
        badge: f.badge,
      };
      const confidence = asNumber(r["confidence"]) ?? asNumber(r["p1"]);
      if (confidence !== undefined) v.confidence = confidence;
      const explanation = firstString(r, ["explanation", "why"]) ?? (spoken ? undefined : undefined);
      if (explanation !== undefined) v.explanation = explanation;
      const receipt = asRecord(r["receipt"]);
      if (receipt) v.receipt = receipt;
      return v;
    }
  }
  return null;
}

/* ------------------------------------------------- breaker / edge (right) */

export type BreakerState = "closed" | "open" | "half-open" | "unknown";

export interface ContinuityView {
  breaker: BreakerState;
  /** Raw value as it appeared in the trace, for the drill-down caption. */
  breakerRaw?: string;
  edgeMode: boolean | undefined;
  breakerEventId?: string;
}

function normaliseBreaker(raw: string): BreakerState | undefined {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "closed") return "closed";
  if (v === "open") return "open";
  if (v === "half_open" || v === "halfopen") return "half-open";
  return undefined;
}

const BREAKER_KEYS = ["breaker", "breaker_state", "circuit_breaker", "circuit"] as const;
const CONTAINER_KEYS = ["health", "continuity", "breaker", "breakers", "network"] as const;

/** Newest health/breaker signal in the trace wins; otherwise state is honestly "unknown". */
export function deriveContinuity(frames: readonly TraceEnvelope[]): ContinuityView {
  const view: ContinuityView = { breaker: "unknown", edgeMode: undefined };
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (!f) continue;
    for (const r of payloadLocations(f.mcp?.frame)) {
      const containers: Record<string, unknown>[] = [r];
      for (const k of CONTAINER_KEYS) {
        const c = asRecord(r[k]);
        if (c) containers.push(c);
      }
      for (const c of containers) {
        for (const bk of BREAKER_KEYS) {
          const raw = asString(c[bk]);
          if (raw === undefined) continue;
          const state = normaliseBreaker(raw);
          if (state !== undefined && view.breaker === "unknown") {
            view.breaker = state;
            view.breakerRaw = raw;
            view.breakerEventId = f.event_id;
          }
        }
        if (view.edgeMode === undefined) {
          const em = asBool(c["edge_mode"]) ?? asBool(c["offline"]) ?? asBool(c["edge_mode_active"]);
          if (em !== undefined) view.edgeMode = em;
        }
      }
      if (view.breaker !== "unknown" && view.edgeMode !== undefined) return view;
    }
  }
  return view;
}

/* ------------------------------------------ speaking / ASR / TTS (left) */

export interface TranscriptLine {
  text: string;
  final: boolean;
  event_id: string;
}

/** Host speaking state, when a frame reports it; undefined = not reported. */
export function deriveSpeaking(frames: readonly TraceEnvelope[]): boolean | undefined {
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (!f) continue;
    for (const r of payloadLocations(f.mcp?.frame)) {
      const speaking = asBool(r["speaking"]);
      if (speaking !== undefined) return speaking;
      const state = firstString(r, ["state", "status", "host_state"]);
      if (state !== undefined) {
        const s = state.toLowerCase();
        if (s === "speaking" || s === "tts" || s === "saying") return true;
        if (s === "listening" || s === "idle" || s === "thinking") return false;
      }
    }
    const method = f.mcp?.method?.toLowerCase();
    if (method !== undefined) {
      if (/(tts|speech|speak)/.test(method) && /(start|begin|speaking)/.test(method)) return true;
      if (/(tts|speech|speak)/.test(method) && /(stop|end|done|complete|idle|silence)/.test(method)) return false;
    }
  }
  return undefined;
}

/** Partial and final ASR lines, oldest → newest, most recent 8 kept. */
export function deriveTranscripts(frames: readonly TraceEnvelope[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const f of frames) {
    if (f.kind !== "notification" && f.kind !== "request" && f.kind !== "response") continue;
    for (const r of payloadLocations(f.mcp?.frame)) {
      const text = firstString(r, ["partial", "transcript", "text", "heard_text"]);
      if (text === undefined) continue;
      const final = asBool(r["final"]) ?? asBool(r["is_final"]) ?? asBool(r["isFinal"]) ?? f.kind === "response";
      const last = out[out.length - 1];
      if (last && last.text === text && last.final === final) {
        last.event_id = f.event_id;
      } else {
        out.push({ text, final, event_id: f.event_id });
      }
      break; // one transcript payload per frame
    }
  }
  return out.slice(-8);
}

export interface TtsView {
  text: string;
  /** Word index of the barge-in cut, when the host reports speech marks. */
  cutIndex?: number;
  cutReported: boolean;
  event_id: string;
}

/** Newest spoken-text payload; cut state overlaid by the newest cancellation frame. */
export function deriveTts(frames: readonly TraceEnvelope[]): TtsView | null {
  let tts: TtsView | null = null;
  let cut: { index?: number; reported: boolean; event_id: string } | null = null;

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i];
    if (!f) continue;
    if (tts === null) {
      for (const r of payloadLocations(f.mcp?.frame)) {
        const spoken = asRecord(r["spoken_prompt"]);
        const text =
          firstString(r, ["tts", "spoken", "say", "spoken_text"]) ??
          (spoken ? (firstString(spoken, ["speak_normal", "speak_short", "speak_long"]) ?? undefined) : undefined);
        if (text === undefined) continue;
        const v: TtsView = { text, cutReported: false, event_id: f.event_id };
        tts = v;
        break;
      }
    }
    if (cut === null && (f.kind === "cancellation" || f.mcp?.method === "notifications/cancelled")) {
      let index: number | undefined;
      for (const r of payloadLocations(f.mcp?.frame)) {
        index =
          asNumber(r["word_index"]) ??
          asNumber(r["last_word_index"]) ??
          asNumber(r["cut_index"]) ??
          asNumber(r["speech_mark"]);
        if (index !== undefined) break;
      }
      cut = index !== undefined ? { index, reported: true, event_id: f.event_id } : { reported: true, event_id: f.event_id };
    }
    if (tts !== null && cut !== null) break;
  }

  if (cut !== null) {
    if (tts === null) {
      tts = { text: "(spoken text not reported in trace)", cutReported: cut.reported, event_id: cut.event_id };
    } else {
      tts.cutReported = cut.reported;
      if (cut.index !== undefined) tts.cutIndex = cut.index;
    }
  }
  return tts;
}

/* ------------------------------------------------- "why did you play that" */

function stringifyField(x: unknown): string | undefined {
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  return undefined;
}

/** Pull a human explanation out of a turn payload or receipt, if one is present. */
export function findExplanation(obj: unknown): string | undefined {
  const r = asRecord(obj);
  if (!r) return undefined;
  const direct = stringifyField(r["explanation"]) ?? stringifyField(r["why"]);
  if (direct !== undefined) return direct;
  const receipt = asRecord(r["receipt"]) ?? asRecord(r["action_receipt"]);
  if (receipt) {
    const rx = stringifyField(receipt["explanation"]);
    if (rx !== undefined) return rx;
    const parts: string[] = [];
    const heard = stringifyField(receipt["heard"]) ?? stringifyField(receipt["heard_text"]);
    if (heard !== undefined) parts.push(`heard: ${heard}`);
    const matched =
      stringifyField(receipt["matched"]) ?? stringifyField(receipt["chosen"]) ?? stringifyField(receipt["track"]);
    if (matched !== undefined) parts.push(`matched: ${matched}`);
    const confidence = stringifyField(r["confidence"]) ?? stringifyField(receipt["confidence"]);
    if (confidence !== undefined) parts.push(`confidence: ${confidence}`);
    const trigger = stringifyField(receipt["trigger"]);
    if (trigger !== undefined) parts.push(`trigger: ${trigger}`);
    if (parts.length > 0) return parts.join(" · ");
  }
  return undefined;
}

/* -------------------------------------------------------------- misc view */

/** HH:MM:SS.mmm from an ISO timestamp; falls back to the raw string. */
export function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export const MAX_FRAMES = 500;
