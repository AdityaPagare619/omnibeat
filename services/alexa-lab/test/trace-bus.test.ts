import { describe, expect, it } from "vitest";
import http from "node:http";
import { WebSocket } from "ws";
import {
  TraceBus,
  frameSchema,
  toEnvelope,
  type Frame,
} from "../src/trace-bus.js";
import { traceEnvelopeSchema } from "@omnibeat/schemas";

const HOST = "host→mcp";
const MCP = "mcp→host";

describe("trace bus — frame emission order", () => {
  it("emits frames in call order with monotonic seq", () => {
    const bus = new TraceBus();
    const seen: Frame[] = [];
    bus.onFrame((f) => seen.push(f));

    const request = bus.emit({
      direction: HOST,
      method: "tools/call",
      tool: "music_resolve_request",
      requestId: "1",
      payload: { jsonrpc: "2.0", id: 1, method: "tools/call" },
    });
    const response = bus.emit({
      direction: MCP,
      method: "tools/call",
      tool: "music_resolve_request",
      requestId: "1",
      latencyMs: 12,
      payload: { jsonrpc: "2.0", id: 1, result: {} },
    });
    const decision = bus.emit({
      direction: "internal",
      method: "agent.decision",
      payload: { decision: "ask" },
    });

    expect([request.seq, response.seq, decision.seq]).toEqual([0, 1, 2]);
    expect(seen.map((f) => f.method)).toEqual(["tools/call", "tools/call", "agent.decision"]);
    expect(seen.map((f) => f.direction)).toEqual([HOST, MCP, "internal"]);
    expect(seen.map((f) => f.badge)).toEqual(["LIVE", "LIVE", "LIVE"]);

    // Every emitted frame must satisfy the published frame schema.
    for (const frame of seen) expect(frameSchema.parse(frame)).toEqual(frame);
  });

  it("adopts the turn context badge and trace id", () => {
    const bus = new TraceBus();
    bus.setTurnContext("trn-abc12345", "FIXTURE");
    const frame = bus.emit({ direction: "internal", method: "asr.recognized" });
    expect(frame.badge).toBe("FIXTURE");
    expect(frame.traceId).toBe("trn-abc12345");

    bus.clearTurnContext();
    const after = bus.emit({ direction: "internal", method: "session.connect_failed" });
    expect(after.badge).toBe("LIVE");
    expect(after.traceId).toBeUndefined();
  });

  it("replays only the last 200 frames", () => {
    const bus = new TraceBus();
    for (let i = 0; i < 250; i++) {
      bus.emit({ direction: "internal", method: `tick.${i}` });
    }
    const recent = bus.recent();
    expect(recent).toHaveLength(200);
    expect(recent[0]?.seq).toBe(50);
    expect(recent[199]?.seq).toBe(249);
    expect(bus.size()).toBe(250);
  });

  it("maps a frame onto the strict contract envelope from @omnibeat/schemas", () => {
    const bus = new TraceBus();
    bus.setTurnContext("trn-xyz", "FIXTURE");
    const frame = bus.emit({
      direction: MCP,
      method: "tools/call",
      tool: "music_resolve_request",
      requestId: "7",
      sessionId: "sess-1",
      latencyMs: 42,
      sseEventId: "evt-9",
      payload: { jsonrpc: "2.0", id: 7, result: {} },
    });
    const envelope = toEnvelope(frame);
    expect(() => traceEnvelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope.kind).toBe("response");
    expect(envelope.mcp?.latency_ms).toBe(42);
    expect(envelope.mcp?.sse_event_id).toBe("evt-9");
    expect(envelope.mcp?.session_id).toBe("sess-1");
    expect(envelope.badge).toBe("FIXTURE");
  });
});

describe("trace bus — websocket /trace", () => {
  it("replays the last 200 frames to late joiners, then streams live frames", async () => {
    const bus = new TraceBus();
    for (let i = 0; i < 250; i++) {
      bus.emit({ direction: "internal", method: `historic.${i}` });
    }
    const server = http.createServer((_req, res) => res.end("ok"));
    bus.attach(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const messages: { type: string; frames?: Frame[]; frame?: Frame }[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/trace`);
    const replay = await new Promise<{ type: string; frames: Frame[] }>((resolve, reject) => {
      ws.once("message", (raw) => resolve(JSON.parse(String(raw))));
      ws.once("error", reject);
    });

    expect(replay.type).toBe("replay");
    expect(replay.frames).toHaveLength(200);
    expect(replay.frames[0]?.method).toBe("historic.50");

    const live = new Promise<Frame>((resolve) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw)) as { type: string; frame?: Frame };
        messages.push(msg);
        if (msg.type === "frame" && msg.frame) resolve(msg.frame);
      });
    });
    bus.emit({ direction: "internal", method: "live.after.join" });
    const liveFrame = await live;
    expect(liveFrame.method).toBe("live.after.join");
    expect(liveFrame.seq).toBe(250);

    ws.close();
    bus.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
