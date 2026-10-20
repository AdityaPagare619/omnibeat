/**
 * Trace envelope mirror — kept structurally identical to
 * packages/schemas/src/trace.ts (Zod source of truth).
 *
 * The console deliberately does NOT import @omnibeat/schemas at runtime: its
 * dependency budget is react + react-dom only (no zod in the browser). The
 * shapes below mirror the Zod schema field-for-field; `isTraceEnvelope` is the
 * runtime gate — anything that does not match is DROPPED, never rendered
 * (blueprint §2 row 3: a wire inspector that is not connected to the wire is
 * the fastest way to lose the Tech score).
 */

/** Mirror of sourceBadgeSchema (primitives.ts) + TYPED: console-side provenance. */
export type SourceBadge = "LIVE" | "REPLAY" | "FIXTURE";
export type ConsoleBadge = SourceBadge | "TYPED";

/** Mirror of traceEventKindSchema. */
export type TraceEventKind =
  | "session"
  | "request"
  | "response"
  | "notification"
  | "elicitation"
  | "cancellation"
  | "progress"
  | "error";

export type TraceDirection = "client_to_server" | "server_to_client";

/** Mirror of the mcp sub-object in traceEnvelopeSchema (.strict()). */
export interface McpFrameInfo {
  method?: string;
  tool?: string;
  session_id?: string;
  protocol_version?: string;
  sse_event_id?: string;
  latency_ms?: number;
  elicitation_id?: string;
  frame?: unknown;
}

/** Mirror of traceEnvelopeSchema (.strict()). */
export interface TraceEnvelope {
  event_id: string;
  trace_id: string;
  span_id?: string;
  ts: string;
  source: "alexa-lab" | "omnibeat-mcp";
  badge: SourceBadge;
  kind: TraceEventKind;
  direction: TraceDirection;
  mcp?: McpFrameInfo;
}

const EVENT_KINDS: readonly TraceEventKind[] = [
  "session",
  "request",
  "response",
  "notification",
  "elicitation",
  "cancellation",
  "progress",
  "error",
];
const BADGES: readonly SourceBadge[] = ["LIVE", "REPLAY", "FIXTURE"];
const DIRECTIONS: readonly TraceDirection[] = ["client_to_server", "server_to_client"];
const SOURCES: readonly TraceEnvelope["source"][] = ["alexa-lab", "omnibeat-mcp"];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

/**
 * Runtime gate for every inbound WS message. Field-for-field with
 * traceEnvelopeSchema; unknown shapes are rejected (dropped + counted), never
 * synthesised into plausible-looking frames.
 */
export function isTraceEnvelope(x: unknown): x is TraceEnvelope {
  if (!isRecord(x)) return false;
  if (!isNonEmptyString(x["event_id"])) return false;
  if (!isNonEmptyString(x["trace_id"])) return false;
  if (!isNonEmptyString(x["ts"]) || Number.isNaN(Date.parse(x["ts"]))) return false;
  if (!SOURCES.includes(x["source"] as TraceEnvelope["source"])) return false;
  if (!BADGES.includes(x["badge"] as SourceBadge)) return false;
  if (!EVENT_KINDS.includes(x["kind"] as TraceEventKind)) return false;
  if (!DIRECTIONS.includes(x["direction"] as TraceDirection)) return false;
  if (x["mcp"] !== undefined) {
    if (!isRecord(x["mcp"])) return false;
    const m = x["mcp"];
    if (m["method"] !== undefined && typeof m["method"] !== "string") return false;
    if (m["tool"] !== undefined && typeof m["tool"] !== "string") return false;
    if (m["session_id"] !== undefined && typeof m["session_id"] !== "string") return false;
    if (m["protocol_version"] !== undefined && typeof m["protocol_version"] !== "string") return false;
    if (m["sse_event_id"] !== undefined && typeof m["sse_event_id"] !== "string") return false;
    if (m["latency_ms"] !== undefined && (typeof m["latency_ms"] !== "number" || m["latency_ms"] < 0)) return false;
    if (m["elicitation_id"] !== undefined && typeof m["elicitation_id"] !== "string") return false;
  }
  return true;
}

/** Surface enum (primitives.ts surfaceSchema). The selector doubles as the console's TV-layout toggle. */
export type Surface = "screenless" | "screen" | "tv";

/** POST /turn body (host contract draft; mcpOn applied on every turn). */
export interface TurnPayload {
  text?: string;
  surface: Surface;
  mcpOn: boolean;
  explain?: boolean;
}

/** POST /chaos body (demo fault injection). */
export interface ChaosPayload {
  latencyMs?: number;
  failNext?: number;
}
