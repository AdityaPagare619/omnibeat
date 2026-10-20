/**
 * Host contract mirror — the shapes alexa-lab (:4000) really serves, verified
 * live on 2026-10-20 (see PROOF.md §live).
 *
 * Two sources of truth, mirrored structurally (the console keeps its
 * dependency budget at react + react-dom — no zod in the browser):
 *
 *   1. Wire frame  → services/alexa-lab/src/trace-bus.ts `frameSchema` (.strict())
 *   2. HTTP bodies → services/alexa-lab/src/{agent-loop,server,barge-in}.ts
 *
 * `isFrame` is the runtime gate for every WebSocket message: anything that
 * does not match is DROPPED and counted, never rendered (a wire inspector
 * that is not connected to the wire is the fastest way to lose the Tech
 * score). Test fixtures in src/test/fixtures/ are captured verbatim from the
 * live host, not hand-written.
 */

/** Mirror of sourceBadgeSchema (packages/schemas/src/primitives.ts). */
export type SourceBadge = "LIVE" | "REPLAY" | "FIXTURE";

/** Mirror of frameDirectionSchema (trace-bus.ts). */
export type FrameDirection = "host→mcp" | "mcp→host" | "internal";

/** One trace frame — mirror of frameSchema (.strict()). */
export interface Frame {
  seq: number;
  ts: string;
  direction: FrameDirection;
  method: string;
  tool?: string;
  sessionId?: string;
  requestId?: string;
  latencyMs?: number;
  sseEventId?: string;
  badge: SourceBadge;
  traceId?: string;
  payload?: unknown;
}

/** Server → console messages on ws://…/trace (trace-bus.ts broadcast/send). */
export type TraceMessage =
  | { type: "replay"; frames: Frame[]; replayLimit: number }
  | { type: "frame"; frame: Frame };

const BADGES: readonly SourceBadge[] = ["LIVE", "REPLAY", "FIXTURE"];
const DIRECTIONS: readonly FrameDirection[] = ["host→mcp", "mcp→host", "internal"];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

function isOptionalString(r: Record<string, unknown>, key: string): boolean {
  const v = r[key];
  return v === undefined || typeof v === "string";
}

function isOptionalLatency(r: Record<string, unknown>, key: string): boolean {
  const v = r[key];
  return v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
}

/** Runtime gate for one frame — field-for-field with frameSchema (.strict()). */
export function isFrame(x: unknown): x is Frame {
  if (!isRecord(x)) return false;
  if (typeof x["seq"] !== "number" || !Number.isInteger(x["seq"]) || x["seq"] < 0) return false;
  if (!isNonEmptyString(x["ts"]) || Number.isNaN(Date.parse(x["ts"]))) return false;
  if (!DIRECTIONS.includes(x["direction"] as FrameDirection)) return false;
  if (!isNonEmptyString(x["method"])) return false;
  if (!BADGES.includes(x["badge"] as SourceBadge)) return false;
  if (!isOptionalString(x, "tool")) return false;
  if (!isOptionalString(x, "sessionId")) return false;
  if (!isOptionalString(x, "requestId")) return false;
  if (!isOptionalLatency(x, "latencyMs")) return false;
  if (!isOptionalString(x, "sseEventId")) return false;
  if (!isOptionalString(x, "traceId")) return false;
  // `.strict()` in the host schema: unknown top-level keys are rejected.
  const known = new Set([
    "seq",
    "ts",
    "direction",
    "method",
    "tool",
    "sessionId",
    "requestId",
    "latencyMs",
    "sseEventId",
    "badge",
    "traceId",
    "payload",
  ]);
  for (const k of Object.keys(x)) if (!known.has(k)) return false;
  return true;
}

/** Runtime gate for a whole WS message ({type:"replay"|"frame"}). */
export function isTraceMessage(x: unknown): x is TraceMessage {
  if (!isRecord(x)) return false;
  if (x["type"] === "frame") return isFrame(x["frame"]);
  if (x["type"] === "replay") {
    const frames = x["frames"];
    return (
      Array.isArray(frames) && frames.every((f) => isFrame(f)) &&
      (x["replayLimit"] === undefined || typeof x["replayLimit"] === "number")
    );
  }
  return false;
}

/* ------------------------------------------------------------------ turns */

/** Mirror of surfaceSchema; the selector doubles as the threshold profile. */
export type Surface = "screenless" | "screen" | "tv";

/** POST /turn body — mirror of turnRequestSchema (.strict(), all optional). */
export interface TurnPayload {
  text?: string;
  fixtureId?: string;
  surface?: Surface;
  mcpOn?: boolean;
  locale?: string;
}

/** POST /chaos body — mirror of chaosSchema (.strict()). */
export interface ChaosPayload {
  latencyMs?: number;
  failNext?: number;
  clear?: boolean;
}

/** POST /barge-in body — mirror of bargeInSchema (.strict()). */
export interface BargeInPayload {
  atMs: number;
  traceId?: string;
}

export type TurnDecision = "play" | "ask" | "repair" | "not_found" | "error";
export type AsrLabel = "FIXTURE" | "TYPED" | "LIVE";

export interface SpeechMark {
  index: number;
  word: string;
  startMs: number;
  endMs: number;
}

/** Candidates come back as raw track records; only read fields the host sends. */
export interface MusicCandidate {
  candidate_id?: string;
  title?: string;
  artist?: string;
  year?: number;
  version?: string;
  language?: string;
  artwork_url?: string;
  untrusted?: boolean;
}

export interface EvidenceItem {
  source?: string;
  signal?: string;
  weight?: number;
}

export interface BreakerSnapshot {
  state: string;
  consecutiveFails?: number;
  recentRttMs?: number[];
  slowInWindow?: number;
  openedAt?: number | null;
  transitions?: number;
  lastTransitionReason?: string | null;
  edgeMode?: boolean;
}

export interface McpSnapshot {
  state: string;
  sessionId?: string;
  serverInfo?: { name?: string; version?: string };
  reconnectAttempt?: number;
  url?: string;
}

export interface SpokenPrompt {
  speak_short?: string;
  speak_normal?: string;
  speak_long?: string;
}

/**
 * POST /turn response — mirror of agent-loop.ts `TurnResponse`.
 * `spoken` is a plain string on the live host; `spokenPrompt` carries the
 * three lengths. Both are tolerated (the brief documents `spoken{...}`).
 */
export interface TurnResponse {
  traceId: string;
  badge: SourceBadge;
  asrLabel: AsrLabel;
  mode: "mcp" | "naive";
  heard: string;
  alternatives: { text: string; confidence?: number }[];
  decision: TurnDecision;
  spoken: string | SpokenPrompt;
  spokenPrompt?: SpokenPrompt;
  candidates: MusicCandidate[];
  confidence: number;
  responseStyle: "brief" | "normal";
  tts: { playing: boolean; durationMs: number; marks: SpeechMark[]; words: number };
  latencyMs: number;
  mcp: McpSnapshot;
  breaker: BreakerSnapshot;
  edgeMode: boolean;
  error?: { code: string; message: string; detail?: unknown };
  track?: unknown;
  resolutionId?: string;
  evidence?: EvidenceItem[];
  degradationLevel?: string;
  serverTraceId?: string;
}

/** POST /barge-in response — mirror of BargeInController.cut() + server.ts. */
export interface BargeInResponse {
  cancelled: boolean;
  cutAtWord: number | null;
  atMs: number;
  reason?: string;
  wordsCompleted: number;
  cutWord: string | null;
  traceId: string;
  cancel: unknown;
  /** Live host sends `{style:"brief", appliesUntil}` after a successful cut (null when idle). */
  style: { style: string; appliesUntil?: string } | string | null;
  styleError?: string | null;
  breaker: BreakerSnapshot;
  edgeMode: boolean;
}

/** GET /state — mirror of server.ts /state. */
export interface StateResponse {
  breaker: BreakerSnapshot;
  mcp: McpSnapshot;
  chaos: { latencyMs: number; failNext: number; injections: number };
  tts: { playing: boolean; traceId?: string; text?: string; marks?: SpeechMark[] };
  responseStyle?: "brief" | "normal";
  trace?: { frames: number; clients: number };
}

/** GET /healthz — mirror of server.ts /healthz. */
export interface HealthResponse {
  ok: boolean;
  service?: string;
  version?: string;
  uptimeMs?: number;
  mcp: McpSnapshot;
  breaker: BreakerSnapshot;
  edgeMode?: boolean;
  chaos: { latencyMs: number; failNext: number; injections: number };
  trace?: { frames: number; clients: number };
  tts?: { playing: boolean };
}
