/** Smoke suite: real HTTP against spawned `node dist/index.js` on :8099,
 * OMNIBEAT_REPLAY_ONLY=1 for determinism. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVICE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const PORT = 8099;
const BASE = "http://127.0.0.1:" + PORT;
const PROTOCOL_VERSION = "2025-11-25";

let child: ChildProcess | undefined;
let dbDir = "";
let serverLog = "";
let sessionId: string | undefined;

interface RpcOptions {
  sessionId?: string;
  protocolVersion?: string;
  origin?: string;
  id?: number;
}

type Json = Record<string, unknown>;

/** Parse SSE data frames or a plain JSON body into the JSON-RPC message. */
async function parseBody(res: Response): Promise<Json | null> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (text.length === 0) return null;
  if (contentType.includes("text/event-stream")) {
    const frames = text
      .split(String.fromCharCode(10))
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"));
    if (frames.length === 0) return null;
    return JSON.parse((frames[frames.length - 1] as string).slice(5).trim()) as Json;
  }
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { raw: text } as Json;
  }
}

async function rpc(method: string, params: unknown, opts: RpcOptions = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (opts.sessionId !== undefined) headers["mcp-session-id"] = opts.sessionId;
  if (opts.protocolVersion !== undefined) headers["mcp-protocol-version"] = opts.protocolVersion;
  if (opts.origin !== undefined) headers.origin = opts.origin;
  const body = JSON.stringify({ jsonrpc: "2.0", id: opts.id ?? 1, method, params });
  const res = await fetch(BASE + "/mcp", { method: "POST", headers, body });
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    data: await parseBody(res),
  };
}

async function init(): Promise<string> {
  const r = await rpc("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "vitest", version: "0.1.0" },
  });
  expect(r.status).toBe(200);
  expect(r.sessionId).toBeTruthy();
  const data = r.data as { result?: { protocolVersion?: string } };
  expect(data.result?.protocolVersion).toBe(PROTOCOL_VERSION);
  await fetch(BASE + "/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": r.sessionId as string,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return r.sessionId as string;
}

async function waitHealthy(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + "/healthz");
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

beforeAll(async () => {
  dbDir = mkdtempSync(join(tmpdir(), "omnibeat-mcp-test-"));
  child = spawn(process.execPath, ["dist/index.js"], {
    cwd: SERVICE_ROOT,
    env: {
      ...process.env,
      OMNIBEAT_HOST: "127.0.0.1",
      OMNIBEAT_PORT: String(PORT),
      OMNIBEAT_REPLAY_ONLY: "1",
      OMNIBEAT_DB_PATH: join(dbDir, "sessions.db"),
      LOG_LEVEL: "info",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  const healthy = await waitHealthy(15000);
  if (!healthy) throw new Error("server did not become healthy on :" + PORT + "\n" + serverLog);
});

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => child?.once("exit", () => resolve()));
    child.kill();
    // Windows holds sessions.db open until the process really dies.
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  if (dbDir) {
    try {
      rmSync(dbDir, { recursive: true, force: true });
    } catch {
      // temp dir left behind is harmless
    }
  }
});

describe("omnibeat-mcp smoke (spawned server, replay-only)", () => {
  it("initialize: 200 + Mcp-Session-Id + protocolVersion 2025-11-25", async () => {
    sessionId = await init();
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("wrong MCP-Protocol-Version -> 400", async () => {
    expect(sessionId).toBeTruthy();
    const r = await rpc("tools/list", {}, {
      sessionId,
      protocolVersion: "2025-06-18",
      id: 2,
    });
    expect(r.status).toBe(400);
    const data = r.data as { error?: { message?: string } };
    expect(String(data.error?.message)).toContain("Unsupported protocol version");
  });

  it("unknown session id -> 404", async () => {
    const r = await rpc("tools/list", {}, {
      sessionId: "no-such-session",
      protocolVersion: PROTOCOL_VERSION,
      id: 3,
    });
    expect(r.status).toBe(404);
    const data = r.data as { error?: { code?: number } };
    expect(data.error?.code).toBe(-32001);
  });

  it("Origin mismatch -> 403 (own guard; SDK option is off)", async () => {
    expect(sessionId).toBeTruthy();
    const r = await rpc("tools/list", {}, {
      sessionId,
      protocolVersion: PROTOCOL_VERSION,
      origin: "https://evil.example",
      id: 4,
    });
    expect(r.status).toBe(403);
  });

  it("tools/list: exactly 8 tools with input+output JSON Schema", async () => {
    expect(sessionId).toBeTruthy();
    const r = await rpc("tools/list", {}, { sessionId, protocolVersion: PROTOCOL_VERSION, id: 5 });
    expect(r.status).toBe(200);
    const data = r.data as { result?: { tools?: Record<string, unknown>[] } };
    const tools = data.result?.tools ?? [];
    expect(tools.length).toBe(8);
    const names = tools.map((t) => String(t.name)).sort();
    expect(names).toEqual([
      "account_link_music_service",
      "music_confirm_selection",
      "music_explain_last_action",
      "music_plan_offline_cache",
      "music_preview_hooks",
      "music_resolve_request",
      "privacy_forget_my_data",
      "session_set_response_style",
    ]);
    for (const tool of tools) {
      const input = tool.inputSchema as { type?: string };
      const output = tool.outputSchema as { type?: string };
      expect(input.type).toBe("object");
      expect(output.type).toBe("object");
      expect(typeof tool.title).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.annotations).toBeTruthy();
    }
  });

  it("music_resolve_request on replay fixture returns an enumerated decision", async () => {
    expect(sessionId).toBeTruthy();
    const r = await rpc(
      "tools/call",
      {
        name: "music_resolve_request",
        arguments: { transcript: "play raja ji", surface: "screenless" },
      },
      { sessionId, protocolVersion: PROTOCOL_VERSION, id: 6 },
    );
    expect(r.status).toBe(200);
    const data = r.data as {
      result?: {
        isError?: boolean;
        structuredContent?: {
          decision?: string;
          confidence?: number;
          trace_id?: string;
          evidence?: { source?: string; signal?: string }[];
        };
      };
    };
    expect(data.result?.isError).toBeFalsy();
    const out = data.result?.structuredContent;
    expect(out).toBeTruthy();
    expect(["play", "ask", "repair", "not_found"]).toContain(out?.decision);
    expect(out?.confidence).toBeGreaterThanOrEqual(0);
    expect(out?.confidence).toBeLessThanOrEqual(1);
    expect(String(out?.trace_id)).toMatch(/^tr_/);
    const evidence = out?.evidence ?? [];
    expect(evidence.length).toBeGreaterThan(0);
    // Replay-only server: at least one REPLAY-badged source must appear.
    expect(evidence.some((e) => String(e.signal ?? "").includes("REPLAY"))).toBe(true);
  });

  it("naive mode: first hit, confidence 1.0, evidence source naive-baseline", async () => {
    expect(sessionId).toBeTruthy();
    const on = await fetch(BASE + "/admin/mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ naive: true }),
    });
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual(
      expect.objectContaining({ naive: true }),
    );

    const r = await rpc(
      "tools/call",
      {
        name: "music_resolve_request",
        arguments: { transcript: "play raja ji", surface: "screenless" },
      },
      { sessionId, protocolVersion: PROTOCOL_VERSION, id: 7 },
    );
    const data = r.data as {
      result?: {
        structuredContent?: {
          decision?: string;
          confidence?: number;
          evidence?: { source?: string; signal?: string }[];
        };
      };
    };
    const out = data.result?.structuredContent;
    expect(out?.decision).toBe("play");
    expect(out?.confidence).toBe(1);
    const naiveEvidence = (out?.evidence ?? []).filter((e) => e.source === "naive-baseline");
    expect(naiveEvidence.length).toBeGreaterThan(0);
    expect(String(naiveEvidence[0]?.signal)).toContain("confidence forced to 1.0");

    const off = await fetch(BASE + "/admin/mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ naive: false }),
    });
    expect(off.status).toBe(200);
  });
});
