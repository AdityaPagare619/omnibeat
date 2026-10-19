/**
 * Trace bus — in-memory frame log + WebSocket fan-out on `/trace`.
 *
 * This is the honesty surface of the lab (blueprint §4.1/§11.2): every MCP
 * POST/GET/DELETE and every internal host decision emits exactly one frame
 * here, in emission order. Nothing is fabricated downstream — lab-console only
 * renders what this bus saw.
 *
 * Frame shape follows the contract envelope in @omnibeat/schemas
 * (`traceEnvelopeSchema`) flattened for the wire inspector:
 *
 *   {seq, ts, direction, method, tool?, sessionId?, requestId?, latencyMs?,
 *    sseEventId?, badge, traceId?, payload?}
 *
 * `toEnvelope()` converts a frame back to the strict contract envelope so the
 * console can validate against packages/schemas.
 */
import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { z } from "zod";
import { sourceBadgeSchema, type SourceBadge, type TraceEnvelope } from "@omnibeat/schemas";
import { logger } from "./logger.js";

export const frameDirectionSchema = z.enum(["host→mcp", "mcp→host", "internal"]);
export type FrameDirection = z.infer<typeof frameDirectionSchema>;

/**
 * One trace frame. `requestId` is the JSON-RPC id stringified (ids are
 * number | string on the wire); `payload` carries the raw frame for the
 * inspector drill-down — the emitter redacts secrets, never the transcript
 * (the inspector is the product's transparency surface, contract trace.ts).
 */
export const frameSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    ts: z.string().datetime(),
    direction: frameDirectionSchema,
    method: z.string().min(1),
    tool: z.string().optional(),
    sessionId: z.string().optional(),
    requestId: z.string().optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    sseEventId: z.string().optional(),
    badge: sourceBadgeSchema,
    traceId: z.string().optional(),
    payload: z.unknown().optional(),
  })
  .strict();
export type Frame = z.infer<typeof frameSchema>;

export type FrameInput = Omit<Frame, "seq" | "ts" | "badge"> & {
  badge?: SourceBadge;
  ts?: string;
};

export type FrameListener = (frame: Frame) => void;

const REPLAY_LIMIT = 200;

export class TraceBus {
  private frames: Frame[] = [];
  private nextSeq = 0;
  private wss: WebSocketServer | null = null;
  private upgradeHandler: ((req: IncomingMessage, socket: Socket, head: Buffer) => void) | null = null;
  private server: HttpServer | null = null;
  private listeners = new Set<FrameListener>();
  private ambient: { badge: SourceBadge; traceId?: string } = { badge: "LIVE" };
  readonly replayLimit: number;

  constructor(opts: { replayLimit?: number } = {}) {
    this.replayLimit = opts.replayLimit ?? REPLAY_LIMIT;
  }

  /** Bind subsequent frames to a user turn (trace id + truthful source badge). */
  setTurnContext(traceId: string, badge: SourceBadge): void {
    this.ambient = { traceId, badge };
  }

  /** Frames with no turn context are live network/host events, never fixture data. */
  clearTurnContext(): void {
    this.ambient = { badge: "LIVE" };
  }

  emit(input: FrameInput): Frame {
    const traceId = input.traceId ?? this.ambient.traceId;
    const frame: Frame = {
      seq: this.nextSeq++,
      ts: input.ts ?? new Date().toISOString(),
      direction: input.direction,
      method: input.method,
      badge: input.badge ?? this.ambient.badge,
      ...(traceId !== undefined ? { traceId } : {}),
      ...(input.tool !== undefined ? { tool: input.tool } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
      ...(input.sseEventId !== undefined ? { sseEventId: input.sseEventId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    };
    this.frames.push(frame);
    this.broadcast(frame);
    for (const l of this.listeners) {
      try {
        l(frame);
      } catch (err) {
        logger.warn("trace listener threw", { error: String(err) });
      }
    }
    return frame;
  }

  /** Last N frames (default 200) — what a late joiner replays. */
  recent(limit = this.replayLimit): Frame[] {
    return this.frames.slice(Math.max(0, this.frames.length - limit));
  }

  /** Frames emitted at or after `seq` — used by tests and live inspectors. */
  since(seq: number): Frame[] {
    return this.frames.filter((f) => f.seq >= seq);
  }

  size(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
    this.nextSeq = 0;
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Attach a `/trace` WebSocket endpoint to an existing HTTP server. */
  attach(server: HttpServer): void {
    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;
    const handler = (
      req: IncomingMessage,
      socket: import("node:net").Socket,
      head: Buffer,
    ): void => {
      let pathname = "";
      try {
        pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      } catch {
        pathname = req.url ?? "";
      }
      if (pathname !== "/trace") return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    };
    server.on("upgrade", handler);
    this.upgradeHandler = handler;
    this.server = server;

    wss.on("connection", (ws: WebSocket) => {
      // Late joiners get the last 200 frames first, then live frames.
      this.send(ws, { type: "replay", frames: this.recent(), replayLimit: this.replayLimit });
      ws.on("message", (raw: RawData) => this.onClientMessage(ws, raw));
      ws.on("error", (err: Error) => logger.warn("trace ws client error", { error: String(err) }));
      logger.info("trace client connected", { clients: this.clientCount() });
    });
    wss.on("error", (err: Error) => logger.warn("trace ws server error", { error: String(err) }));
  }

  private onClientMessage(ws: WebSocket, raw: RawData): void {
    // Clients may send {"type":"hello"}; we answer with the current head so a
    // console reconnect without a page reload can resync.
    try {
      const msg = JSON.parse(String(raw)) as { type?: string };
      if (msg.type === "hello") {
        this.send(ws, { type: "replay", frames: this.recent(), replayLimit: this.replayLimit });
      }
    } catch {
      /* ignore non-JSON client chatter */
    }
  }

  private broadcast(frame: Frame): void {
    if (!this.wss) return;
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) this.send(client, { type: "frame", frame });
    }
  }

  private send(ws: WebSocket, message: unknown): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      logger.warn("trace send failed", { error: String(err) });
    }
  }

  clientCount(): number {
    return this.wss ? this.wss.clients.size : 0;
  }

  close(): void {
    if (this.server && this.upgradeHandler) {
      this.server.off("upgrade", this.upgradeHandler);
    }
    this.server = null;
    this.upgradeHandler = null;
    if (!this.wss) return;
    for (const client of this.wss.clients) client.close();
    this.wss.close();
    this.wss = null;
  }
}

/**
 * Contract mapping: frame → strict `traceEnvelopeSchema` object
 * (packages/schemas/src/trace.ts) for consumers that validate the envelope.
 */
export function toEnvelope(frame: Frame): TraceEnvelope {
  return {
    event_id: String(frame.seq),
    trace_id: frame.traceId ?? `trace-less-${frame.seq}`,
    ts: frame.ts,
    source: "alexa-lab",
    badge: frame.badge,
    kind: envelopeKind(frame),
    direction: frame.direction === "mcp→host" ? "server_to_client" : "client_to_server",
    mcp: {
      ...(frame.method ? { method: frame.method } : {}),
      ...(frame.tool !== undefined ? { tool: frame.tool } : {}),
      ...(frame.sessionId !== undefined ? { session_id: frame.sessionId } : {}),
      ...(frame.sseEventId !== undefined ? { sse_event_id: frame.sseEventId } : {}),
      ...(frame.latencyMs !== undefined ? { latency_ms: frame.latencyMs } : {}),
      ...(frame.payload !== undefined ? { frame: frame.payload } : {}),
    },
  };
}

function envelopeKind(frame: Frame): TraceEnvelope["kind"] {
  const payload = frame.payload as { error?: unknown } | undefined;
  const m = frame.method.toLowerCase();
  if (payload && "error" in payload) return "error";
  if (m.includes("cancelled")) return "cancellation";
  if (m.includes("elicitation")) return "elicitation";
  if (m.startsWith("notifications/")) return m.includes("progress") ? "progress" : "notification";
  if (m === "initialize" || m.includes("connect") || m.includes("session")) return "session";
  if (frame.direction === "host→mcp") return "request";
  return "response";
}
