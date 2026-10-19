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
  });

  it("POST /barge-in with nothing playing returns cancelled:false", async () => {
    const { status, body } = await post("/barge-in", { atMs: 800 });
    expect(status).toBe(200);
    expect(body.cancelled).toBe(false);
    expect(body.reason).toBe("tts_idle");
    expect(body.cutAtWord).toBeNull();
    expect(body.style).toBeNull();
  });

  it("POST /barge-in validates its body", async () => {
    const { status, body } = await post("/barge-in", { atMs: -1 });
    expect(status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("POST /chaos injects a labelled fault that the breaker observes", async () => {
    const armed = await post("/chaos", { failNext: 1 });
    expect(armed.status).toBe(200);
    expect(armed.body.chaos.failNext).toBe(1);

    const probe = await post("/probe", {});
    expect(probe.body.probe.ok).toBe(false);
    expect(probe.body.probe.code).toBe("CHAOS_INJECTED");

    const frames = runtime.bus.recent();
    const chaosFrame = frames.find((f) => f.method === "chaos.updated");
    expect((chaosFrame?.payload as { failNext?: number }).failNext).toBe(1);
    expect(
      frames.some(
        (f) =>
          f.method === "GET /healthz" &&
          (f.payload as { code?: string }).code === "CHAOS_INJECTED",
      ),
    ).toBe(true);

    // Two strikes (the MCP_OFFLINE turn + this probe) open the breaker.
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
