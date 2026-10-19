/**
 * Trace-bus event envelope — alexa-lab → lab-console wire inspector.
 *
 * Blueprint §4.1 (Trace bus → OpenTelemetry spans → console), §11.2 (bottom
 * wire inspector: "Real JSON-RPC frames from the simulator's MCP client:
 * method, tool, trace id, latency, SSE event id, Mcp-Session-Id. Click a row
 * for the raw payload. Filter chips: requests, notifications, elicitation,
 * cancellation"), §4.2 (truthful source badges — AC-14), §8.7 (one trace id
 * per user turn).
 *
 * This is the ONLY shape lab-console may render as wire data: the inspector is
 * fed by the real MCP client's trace bus, never fabricated client-side
 * (blueprint §2 row 3).
 */
import { z } from "zod";
import { sourceBadgeSchema } from "./primitives.js";

/**
 * Event classes matching the inspector's filter chips (§11.2) plus session,
 * progress, and error plumbing (§5.1).
 */
export const traceEventKindSchema = z.enum([
  "session", // initialize / connected / ended (§5.1)
  "request", // client → server JSON-RPC request (filter chip: requests)
  "response", // server → client JSON-RPC response
  "notification", // JSON-RPC notification (filter chip: notifications)
  "elicitation", // elicitation/create or elicitation complete (filter chip: elicitation)
  "cancellation", // notifications/cancelled (filter chip: cancellation)
  "progress", // notifications/progress (§5.1)
  "error", // JSON-RPC error or tool result with isError (§5.5)
]);
export type TraceEventKind = z.infer<typeof traceEventKindSchema>;

export const traceEnvelopeSchema = z
  .object({
    event_id: z
      .string()
      .min(1)
      .describe(
        "Monotonic id per trace connection; the console dedupes and orders on it (the lab's own id, distinct from the MCP SSE event id).",
      ),
    trace_id: z
      .string()
      .min(1)
      .describe("One trace id per user turn, propagated host → MCP → upstream (§8.7)."),
    span_id: z.string().min(1).optional().describe("OpenTelemetry span id when emitted from a span (§4.1)."),
    ts: z.string().datetime().describe("ISO-8601 UTC emission time."),
    source: z
      .enum(["alexa-lab", "omnibeat-mcp"])
      .describe(
        "Emitting process; alexa-lab relays server-side spans it receives (§4.1, §8.7 propagation).",
      ),
    badge: sourceBadgeSchema.describe(
      "Truthful mode label for the turn: LIVE | REPLAY | FIXTURE (§4.2, AC-14).",
    ),
    kind: traceEventKindSchema,
    direction: z.enum(["client_to_server", "server_to_client"]),
    mcp: z
      .object({
        method: z.string().optional().describe("JSON-RPC method, e.g. tools/call."),
        tool: z.string().optional().describe("Tool name for tools/call."),
        session_id: z.string().optional().describe("Mcp-Session-Id header value (§5.1)."),
        protocol_version: z
          .string()
          .optional()
          .describe("MCP-Protocol-Version header value (§5.1)."),
        sse_event_id: z
          .string()
          .optional()
          .describe(
            "SSE event id from the server stream; reconnects resume with Last-Event-ID [VERIFY R-SPEC-01].",
          ),
        latency_ms: z.number().int().min(0).optional(),
        elicitation_id: z.string().optional().describe("Elicitation id for elicitation events (§5.4)."),
        frame: z
          .unknown()
          .optional()
          .describe(
            "Raw JSON-RPC frame for the inspector drill-down (§11.2). The emitter is responsible for redacting secrets; heard text appears deliberately — the inspector is the product's transparency surface.",
          ),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TraceEnvelope = z.infer<typeof traceEnvelopeSchema>;
