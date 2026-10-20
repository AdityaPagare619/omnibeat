import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../src/index.js";
import { createApp, listen, type LabRuntime } from "../src/server.js";
import type { Frame } from "../src/trace-bus.js";
import { deadPortUrl } from "./helpers.js";

const HOST = "host→mcp";
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

let runtime: LabRuntime;
let server: Server;
let base: string;

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

beforeAll(async () => {
  const mcpUrl = await deadPortUrl("/mcp");
  runtime = createRuntime({ mcpUrl });
  const app = createApp(runtime, publicDir);
  server = await listen(app, 0, runtime.bus);
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
  await runtime.mcp.start();
});

afterAll(async () => {
  await runtime.mcp.close();
  runtime.bus.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("alexa-lab HTTP surface — MCP OFFLINE is honest", () => {
  it("serves /healthz with the real MCP and breaker state", async () => {
    const { status, body } = await get("/healthz");
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("alexa-lab");
    expect(body.mcp.state).toBe("offline");
    expect(body.mcp.url).toContain("/mcp");
    expect(body.breaker.state).toBe("closed");
    expect(body.trace.frames).toBeGreaterThan(0);
  });

  it("POST /turn with mcpOn:true fails honestly when the MCP is down", async () => {
    const { status, body } = await post("/turn", {
      fixtureId: "rajaji",
      text: "play raja ji",
      surface: "screenless",
      mcpOn: true,
    });

    expect(status).toBe(503);
    expect(body.heard).toBe("play raja ji");
    expect(body.badge).toBe("FIXTURE");
    expect(body.asrLabel).toBe("FIXTURE");
    expect(body.mode).toBe("mcp");
    expect(body.decision).toBe("error");
    expect(body.error.code).toBe("MCP_OFFLINE");
    expect(body.spoken.length).toBeGreaterThan(10);
    expect(body.candidates).toEqual([]);
    expect(body.confidence).toBe(0);
    expect(body.traceId).toMatch(/^trn-/);
    expect(body.breaker.state).toBe("closed");
    expect(body.edgeMode).toBe(false);

    // The host speaks its honest failure line — TTS is armed from the turn
    // body itself (no wall-clock dependence) so barge-in has something to cut.
    expect(body.tts.playing).toBe(true);
    expect(body.tts.words).toBeGreaterThan(5);
    expect(body.tts.marks[1]?.startMs).toBe(250);

    // The trace shows the attempt, the refusal, and NO invented decision.
    const frames = runtime.bus.recent();
    const attempt = frames.find(
      (f) => f.direction === HOST && f.method === "tools/call" && f.tool === "music_resolve_request",
    );
    expect(attempt).toBeDefined();
    expect((attempt?.payload as { delivered?: boolean }).delivered).toBe(false);
    expect(frames.some((f) => f.method === "session.connect_failed")).toBe(true);
    expect(frames.some((f) => f.method === "tools/call.failed")).toBe(true);
    expect(
      frames.filter((f) => f.direction === "internal" && f.method === "agent.decision"),
    ).toHaveLength(0);
  });

  it("keeps every frame satisfying the published frame schema", async () => {
    // Frames deliberately carry the transcript (transparency surface);
    // every frame must still satisfy the published schema.
    const { body } = await get("/frames?limit=500");
    expect(body.invalid).toBe(0);
    expect(body.count).toBeGreaterThan(0);
    expect(body.frames.every((f: Frame) => typeof f.seq === "number")).toBe(true);
  });

  it("POST /turn with mcpOn:false hits the naive arm and fails honestly on /admin/mode", async () => {
    const { status, body } = await post("/turn", {
      fixtureId: "taylor-ambiguous",
      surface: "screenless",
      mcpOn: false,
    });
    expect(status).toBe(503);
    expect(body.mode).toBe("naive");
    expect(body.decision).toBe("error");
    expect(body.error.code).toBe("ADMIN_MODE_UNREACHABLE");
    expect(body.heard).toBe("play taylor");

    const frames = runtime.bus.recent();
    const modeFrames = frames.filter((f) => f.method === "agent.mode");
    const mode = modeFrames[modeFrames.length - 1];
    expect((mode?.payload as { mode?: string }).mode).toBe("naive");
    expect((mode?.payload as { note?: string }).note).toContain("SAME tool");
    expect((mode?.payload as { note?: string }).note).toContain("one server-side code path");
    expect(
      frames.some(
        (f) => f.direction === HOST && f.method === "POST /admin/mode" && (f.payload as { ok?: boolean }).ok === false,
      ) ||
        frames.some((f) => f.method === "POST /admin/mode.failed"),
    ).toBe(true);
    // The baseline toggle was never applied, so no restore is claimed.
    expect(frames.some((f) => f.method === "agent.mode_restored")).toBe(false);
  });

  it("POST /turn rejects an empty body as ASR_NO_INPUT", async () => {
    const { status, body } = await post("/turn", {});
    expect(status).toBe(400);
    expect(body.error.code).toBe("ASR_NO_INPUT");
    expect(body.decision).toBe("error");
    // A real host still speaks its failure line — asserted on THIS response, so
    // no wall-clock time can elapse before the check. That is what makes the
    // barge-in below testable while the MCP is down.
    expect(body.tts.playing).toBe(true);
    expect(body.tts.words).toBeGreaterThan(5);
    expect(body.tts.marks[0]?.startMs).toBe(0);
    expect(body.tts.marks[1]?.startMs).toBe(250);
    expect(body.tts.durationMs).toBe(body.tts.words * 250);
  });

  it("POST /barge-in {atMs:800} cuts the spoken line and reports delivered:false", async () => {
    // Deterministic utterance: 6 words @250ms → at 800ms the cut is word 3.
    runtime.tts.start("one two three four five six", "trn-http-barge");
    const { status, body } = await post("/barge-in", { atMs: 800 });
    expect(status).toBe(200);
    expect(body.cancelled).toBe(true);
    expect(body.cutAtWord).toBe(3);
    expect(body.cutWord).toBe("four");
    expect(body.wordsCompleted).toBe(3);
    expect(body.cancel.delivered).toBe(false);
    expect(["MCP_OFFLINE", "MCP_CIRCUIT_OPEN"]).toContain(body.cancel.code);
    expect(body.style).toBeNull();
    expect(body.styleError).not.toBeNull();
    expect(runtime.tts.isPlaying()).toBe(false);

    const frames = runtime.bus.recent();
    const cut = frames.find((f) => f.method === "barge_in.cut");
    expect((cut?.payload as { cutAtWord?: number }).cutAtWord).toBe(3);
    const cancelled = frames.find((f) => f.method === "notifications/cancelled");
    expect(cancelled?.direction).toBe("host→mcp");
    expect((cancelled?.payload as { delivered?: boolean }).delivered).toBe(false);
    expect(
      (cancelled?.payload as { params?: { reason?: string } }).params?.reason,
    ).toContain("cut at word 3");
    expect(
      frames.some(
        (f) => f.method === "session.style.failed" || f.method === "session.style.brief",
      ),
    ).toBe(true);
  });

  it("POST /barge-in with nothing playing returns cancelled:false", async () => {
    runtime.tts.stop();
    const { status, body } = await post("/barge-in", { atMs: 800 });
    expect(status).toBe(200);
    expect(body.cancelled).toBe(false);
    expect(body.reason).toBe("tts_idle");
    expect(body.cutAtWord).toBeNull();
    expect(body.style).toBeNull();
    expect(body.cancel).toBeNull();
  });

  it("POST /barge-in validates its body", async () => {
    const { status, body } = await post("/barge-in", { atMs: -1 });
    expect(status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("POST /chaos injects a labelled fault that the breaker observes", async () => {
    // Deterministic starting point: earlier tests may already have tripped the
    // breaker, and a tripped breaker SUPPRESSES probes (by design).
    runtime.breaker.reset();
    const armed = await post("/chaos", { failNext: 2 });
    expect(armed.status).toBe(200);
    expect(armed.body.chaos.failNext).toBe(2);

    const first = await post("/probe", {});
    expect(first.body.probe.ok).toBe(false);
    expect(first.body.probe.code).toBe("CHAOS_INJECTED");
    expect(runtime.breaker.state).toBe("closed"); // strike 1 of 2

    const second = await post("/probe", {});
    expect(second.body.probe.ok).toBe(false);
    expect(second.body.probe.code).toBe("CHAOS_INJECTED");

    const frames = runtime.bus.recent();
    const chaosFrame = frames.find((f) => f.method === "chaos.updated");
    expect((chaosFrame?.payload as { failNext?: number }).failNext).toBe(2);
    expect(
      frames.filter(
        (f) =>
          f.method === "GET /healthz" &&
          (f.payload as { code?: string }).code === "CHAOS_INJECTED",
      ).length,
    ).toBe(2);

    // Two strikes (both chaos-injected, both labelled) open the breaker.
    expect(runtime.breaker.state).toBe("open");
    expect(runtime.breaker.snapshot().edgeMode).toBe(true);
    expect(
      frames.some((f) => f.method === "breaker.open" && (f.payload as { edgeMode?: boolean }).edgeMode),
    ).toBe(true);
  });

  it("GET /state reports breaker open and edge mode", async () => {
    const { body } = await get("/state");
    expect(body.breaker.state).toBe("open");
    expect(body.breaker.edgeMode).toBe(true);
    expect(body.mcp.state).toBe("offline");
    expect(body.chaos.failNext).toBe(0);
  });

  it("POST /turn while the breaker is open returns MCP_CIRCUIT_OPEN + edgeMode", async () => {
    const { status, body } = await post("/turn", {
      text: "play raja ji",
      surface: "screenless",
      mcpOn: true,
    });
    expect(status).toBe(503);
    expect(body.error.code).toBe("MCP_CIRCUIT_OPEN");
    expect(body.edgeMode).toBe(true);
    expect(body.breaker.state).toBe("open");
    expect(body.decision).toBe("error");
    expect(body.spoken).toContain("music service");

    const frames = runtime.bus.recent();
    expect(frames.some((f) => f.method === "breaker.blocked")).toBe(true);
    expect(frames.some((f) => f.direction === "internal" && f.method === "agent.decision")).toBe(
      false,
    );
  });

  it("GET /tts.wav returns a waveform with speech marks", async () => {
    const res = await fetch(`${base}/tts.wav?text=${encodeURIComponent("play raja ji")}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    const marks = JSON.parse(res.headers.get("x-speech-marks") ?? "[]") as unknown[];
    expect(marks).toHaveLength(3);
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(44);
    expect(String.fromCharCode(...buf.slice(0, 4))).toBe("RIFF");
  });

  it("404s unknown routes with a route list", async () => {
    const { status, body } = await get("/nope");
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.routes).toContain("POST /turn");
  });
});
