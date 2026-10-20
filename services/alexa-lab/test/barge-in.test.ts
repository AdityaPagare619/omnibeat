import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TraceBus, type Frame } from "../src/trace-bus.js";
import { CircuitBreaker } from "../src/breaker.js";
import { McpHostClient } from "../src/mcp-client.js";
import { AgentLoop } from "../src/agent-loop.js";
import { BargeInController } from "../src/barge-in.js";
import { TtsPlayer, buildMarks, wordIndexAt, wordsCompletedAt } from "../src/tts.js";
import { deadPortUrl, originOf } from "./helpers.js";

const TEXT = "one two three four five six"; // 6 words × 250ms = 1500ms

describe("speech marks", () => {
  it("splits words with cumulative timings at 250 ms/word", () => {
    const marks = buildMarks(TEXT);
    expect(marks).toHaveLength(6);
    expect(marks.map((m) => [m.index, m.word, m.startMs, m.endMs])).toEqual([
      [0, "one", 0, 250],
      [1, "two", 250, 500],
      [2, "three", 500, 750],
      [3, "four", 750, 1000],
      [4, "five", 1000, 1250],
      [5, "six", 1250, 1500],
    ]);
  });

  it("resolves an interrupt time to a word index", () => {
    const marks = buildMarks(TEXT);
    expect(wordIndexAt(marks, 0)).toBe(0);
    expect(wordIndexAt(marks, 749)).toBe(2);
    expect(wordIndexAt(marks, 800)).toBe(3);
    expect(wordIndexAt(marks, 1499)).toBe(5);
    expect(wordIndexAt(marks, 99_999)).toBe(5);
    expect(wordsCompletedAt(marks, 800)).toBe(3);
  });
});

describe("barge-in state machine", () => {
  let bus: TraceBus;
  let tts: TtsPlayer;
  let loop: AgentLoop;
  let bargeIn: BargeInController;

  beforeAll(async () => {
    const mcpUrl = await deadPortUrl("/mcp");
    bus = new TraceBus();
    const breaker = new CircuitBreaker();
    const mcp = new McpHostClient({
      mcpUrl,
      mcpOrigin: originOf(mcpUrl),
      bus,
      breaker,
      connectTimeoutMs: 400,
      toolTimeoutMs: 400,
    });
    await mcp.start();
    tts = new TtsPlayer();
    loop = new AgentLoop({ bus, mcp, breaker, tts, fixturesDir: "/tmp/none" });
    bargeIn = new BargeInController({ bus, tts, mcp, loop });
  });

  afterAll(() => {
    tts.stop();
    bus.close();
  });

  it("cuts a playing utterance at the word index for atMs=800", async () => {
    const started = tts.start(TEXT, "trn-barge-1");
    expect(started.playing).toBe(true);
    expect(started.durationMs).toBe(1500);
    bus.setTurnContext("trn-barge-1", "FIXTURE");

    const before = bus.size();
    const result = await bargeIn.cut(800);
    expect(result.cancelled).toBe(true);
    expect(result.cutAtWord).toBe(3); // "four" starts at 750ms
    expect(result.cutWord).toBe("four");
    expect(result.wordsCompleted).toBe(3);
    expect(result.reason).toBe("interrupted");
    expect(tts.isPlaying()).toBe(false);

    const frames = bus.since(before);
    const cut = frames.find((f) => f.method === "barge_in.cut");
    expect(cut, "a barge_in.cut detail frame must be emitted").toBeDefined();
    expect((cut?.payload as { cutAtWord?: number }).cutAtWord).toBe(3);
    expect((cut?.payload as { words?: number }).words).toBe(6);

    const cancelled = frames.find((f) => f.method === "notifications/cancelled");
    expect(cancelled, "a cancellation frame must be emitted").toBeDefined();
    expect(cancelled?.direction).toBe("host→mcp");
    expect(cancelled?.traceId).toBe("trn-barge-1");
    const payload = cancelled?.payload as {
      jsonrpc: string;
      method: string;
      params: { requestId: string | null; reason: string };
      inFlight: boolean;
      cutAtWord: number;
      delivered: boolean;
      code?: string;
    };
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.method).toBe("notifications/cancelled");
    expect(payload.params.reason).toContain("cut at word 3");
    expect(payload.params.reason).toContain("of 6");
    expect(payload.cutAtWord).toBe(3);
    expect(payload.inFlight).toBe(false);
    // The session was never up in this fixture: the frame must say so.
    expect(payload.delivered).toBe(false);
    expect(payload.code).toBe("MCP_OFFLINE");
    expect(result.cancel).toEqual({ delivered: false, code: "MCP_OFFLINE" });
  });

  it("requests brief style and admits when the server is unreachable", async () => {
    const styleFrame = bus
      .recent()
      .reverse()
      .find((f) => f.method === "session.style.failed");
    expect(styleFrame, "an honest style-failure frame is required").toBeDefined();
    const payload = styleFrame?.payload as { code: string; applied?: boolean; note: string };
    expect(payload.code).toBe("MCP_OFFLINE");
    expect(payload.note).toContain("NOT applied");
    // Host policy still applies locally, and says so.
    expect(loop.getResponseStyle()).toBe("brief");
  });

  it("refuses honestly when nothing is playing", async () => {
    const before = bus.size();
    const result = await bargeIn.cut(800);
    expect(result.cancelled).toBe(false);
    expect(result.cutAtWord).toBeNull();
    expect(result.reason).toBe("tts_idle");
    expect(result.style).toBeNull();
    expect(result.styleError).toBeNull();

    const frames = bus.since(before);
    expect(frames.some((f) => f.method === "barge_in.rejected")).toBe(true);
    expect(frames.some((f) => f.method === "notifications/cancelled")).toBe(false);
  });

  it("rejects a negative atMs without touching playback", async () => {
    tts.start(TEXT, "trn-barge-2");
    const result = await bargeIn.cut(-5);
    expect(result.cancelled).toBe(false);
    expect(result.reason).toBe("bad_at_ms");
    expect(tts.isPlaying()).toBe(true);
    tts.stop();
  });

  it("cuts at word 0 when the interrupt lands at t=0", async () => {
    tts.start(TEXT, "trn-barge-3");
    const result = await bargeIn.cut(0);
    expect(result.cancelled).toBe(true);
    expect(result.cutAtWord).toBe(0);
    expect(result.wordsCompleted).toBe(0);
  });

  it("emits frames in cancellation-then-style order", () => {
    const frames: Frame[] = bus.recent();
    const cancelledIdx = frames.findIndex((f) => f.method === "notifications/cancelled");
    const styleIdx = frames.findIndex((f) => f.method === "session.style.failed");
    expect(cancelledIdx).toBeGreaterThanOrEqual(0);
    expect(styleIdx).toBeGreaterThan(cancelledIdx);
  });
});
