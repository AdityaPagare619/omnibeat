/**
 * Derivation layer — pure functions from REAL host payloads to view state.
 *
 * Two inputs, no invention:
 *   • a POST /turn response (TurnResponse) drives the face;
 *   • trace frames drive the proof strip.
 * When a field is absent the view says so ("not reported by the host")
 * rather than filling in a plausible default (§4.2 truth-in-labelling).
 */
import type { Frame, MusicCandidate, SourceBadge, TurnResponse } from "./types";

/* ------------------------------------------------------------------ frames */

/** Window the proof strip keeps: the host replays at most 200 frames anyway. */
export const MAX_FRAMES = 200;

export interface FrameRow {
  /** Stable React key: the host's `seq` is unique per emission. */
  key: number;
  frame: Frame;
}

/**
 * Merge incoming frames into the window by `seq` (later reconnect replays are
 * deduplicated, not double-rendered). Wire order = emission order = seq order.
 */
export function mergeFrames(prev: readonly FrameRow[], incoming: readonly Frame[]): FrameRow[] {
  if (incoming.length === 0) return [...prev];
  const seen = new Map<number, FrameRow>();
  for (const r of prev) seen.set(r.key, r);
  for (const f of incoming) if (!seen.has(f.seq)) seen.set(f.seq, { key: f.seq, frame: f });
  const next = [...seen.values()].sort((a, b) => a.key - b.key);
  return next.length > MAX_FRAMES ? next.slice(next.length - MAX_FRAMES) : next;
}

/** Distinct source badges actually seen on the wire, in first-seen order. */
export function badgesSeen(frames: readonly Frame[]): SourceBadge[] {
  const seen: SourceBadge[] = [];
  for (const f of frames) if (!seen.includes(f.badge)) seen.push(f.badge);
  return seen;
}

/** Frames the proof strip highlights as real JSON-RPC traffic (not host internals). */
export function isWireCall(f: Frame): boolean {
  return f.direction !== "internal";
}

export function frameLatency(f: Frame): string {
  return f.latencyMs === undefined ? "—" : `${f.latencyMs} ms`;
}

/** HH:MM:SS.mmm from an ISO timestamp; falls back to the raw string. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/* ------------------------------------------------------------------- turns */

export type DecisionTone = "good" | "warn" | "info" | "bad" | "neutral";

export interface DecisionView {
  /** Uppercase label shown in the chip — always paired with its colour. */
  label: string;
  tone: DecisionTone;
  /** One-line meaning for a non-engineer judge. */
  gloss: string;
}

const DECISIONS: Record<string, DecisionView> = {
  play: { label: "PLAY", tone: "good", gloss: "confident enough to act without asking" },
  ask: { label: "ASK", tone: "warn", gloss: "ambiguous — asked you instead of guessing" },
  repair: { label: "REPAIR", tone: "info", gloss: "understood the intent, needs a different phrasing" },
  not_found: { label: "NOT_FOUND", tone: "bad", gloss: "no match — said so rather than inventing one" },
  error: { label: "ERROR", tone: "bad", gloss: "the host refused to answer rather than guess" },
};

export function decisionView(turn: TurnResponse): DecisionView {
  return DECISIONS[turn.decision] ?? { label: String(turn.decision).toUpperCase(), tone: "neutral", gloss: "" };
}

/**
 * The words the host actually spoke: `spoken` is the string the speech marks
 * were built from (verified: words(spoken) === tts.words on both A/B fixtures).
 */
export function spokenText(turn: TurnResponse): string {
  if (typeof turn.spoken === "string" && turn.spoken.length > 0) return turn.spoken;
  const inline = typeof turn.spoken === "object" ? turn.spoken : undefined;
  const p = turn.spokenPrompt ?? inline;
  return p?.speak_normal ?? p?.speak_short ?? p?.speak_long ?? "";
}

/** The primary track to feature: `track` when the host resolved one, else top candidate. */
export function primaryCandidate(turn: TurnResponse): MusicCandidate | null {
  const t = turn.track as MusicCandidate | undefined;
  if (t && typeof t === "object" && t.title) return t;
  return turn.candidates[0] ?? null;
}

/* ------------------------------------------- thresholds (CALM confidence) */

export interface Thresholds {
  /** Minimum calibrated confidence to auto-play. */
  tPlay?: number;
  /** Required margin between top-1 and top-2. */
  margin?: number;
  /** Cumulative p(top-3) needed for an ask. */
  tCover?: number;
  /** Values actually observed this turn. */
  p1?: number;
  gotMargin?: number;
  top3?: number;
  /** Verbatim host policy sentence (evidence `local:decision`), when present. */
  policy?: string;
  /** `naive` mode applies no policy — say that instead of showing markers. */
  note?: string;
}

const NUM = (re: RegExp, s: string): number | undefined => {
  const m = re.exec(s);
  if (!m || m[1] === undefined) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Thresholds are the HOST's, parsed from its own evidence line — never
 * hardcoded here (§8.8 configuration, not code). Example (live):
 *   "play if p1>=0.85 AND margin>=0.25; ask if top3>=0.7 …; got p1=0.909 …"
 */
export function thresholdsFromEvidence(turn: TurnResponse): Thresholds {
  const ev = (turn.evidence ?? []).find((e) => e.source === "local:decision");
  const out: Thresholds = {};
  if (turn.mode === "naive") {
    out.note = "naive path — no decision policy applied (host sent `naive-baseline` evidence only)";
    return out;
  }
  if (!ev?.signal) {
    out.note = "host reported no decision-policy evidence for this turn";
    return out;
  }
  const s = ev.signal;
  out.policy = s;
  out.tPlay = NUM(/p1\s*>=\s*([0-9.]+)/, s);
  out.margin = NUM(/margin\s*>=\s*([0-9.]+)/, s);
  out.tCover = NUM(/top3\s*>=\s*([0-9.]+)/, s);
  out.p1 = NUM(/got\s+p1\s*=\s*([0-9.]+)/, s);
  out.gotMargin = NUM(/margin\s*=\s*([0-9.]+)/, s);
  out.top3 = NUM(/top3\s*=\s*([0-9.]+)/, s);
  return out;
}

/* ---------------------------------------------------------------- A/B view */

export interface AbSummary {
  heard: string;
  mode: "mcp" | "naive";
  decision: string;
  decisionLabel: string;
  tone: DecisionTone;
  confidence: number;
  candidateCount: number;
  spoken: string;
  latencyMs: number;
  traceId: string;
  badge: SourceBadge;
  /** Naive path played the first hit without asking — the contrast. */
  stockFirstHit: boolean;
}

export function abSummary(turn: TurnResponse): AbSummary {
  const dv = decisionView(turn);
  return {
    heard: turn.heard,
    mode: turn.mode,
    decision: turn.decision,
    decisionLabel: dv.label,
    tone: dv.tone,
    confidence: turn.confidence,
    candidateCount: turn.candidates.length,
    spoken: spokenText(turn),
    latencyMs: turn.latencyMs,
    traceId: turn.traceId,
    badge: turn.badge,
    stockFirstHit: turn.mode === "naive" && turn.decision === "play" && turn.candidates.length <= 1,
  };
}

/** Key that groups the two sides of the A/B: the same utterance, both modes. */
export function abKey(turn: TurnResponse): string {
  return turn.heard.trim().toLowerCase();
}

/* ---------------------------------------------------------- small helpers */

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function fixed(n: number, digits = 3): string {
  return n.toFixed(digits);
}

/** Strike-through target for a barge-in cut: word index from the host. */
export function cutWordIndex(cutAtWord: number | null, wordsCompleted: number): number | null {
  if (cutAtWord !== null && Number.isFinite(cutAtWord)) return cutAtWord;
  if (Number.isFinite(wordsCompleted) && wordsCompleted > 0) return wordsCompleted;
  return null;
}
