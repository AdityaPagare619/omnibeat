/**
 * omnibeat-mcp client: spawn the built server in REPLAY-ONLY mode on a random
 * free port with a temp SQLite path, speak MCP Streamable HTTP JSON-RPC over
 * fetch (initialize -> notifications/initialized -> tools/call), and expose the
 * lab-only /admin/mode A/B switch.
 *
 * Everything the resolver sees in this mode is served badged REPLAY from
 * services/omnibeat-mcp/fixtures/catalog-replay/catalog.json - no network is
 * touched, so the run is regenerable and offline. If the server cannot be
 * spawned, the real stderr/stdout is surfaced in the thrown error; nothing is
 * swallowed.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { assertServiceBuilt, MCP_SERVICE_DIR } from "./paths.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

export interface ResolveResult {
  decision: "play" | "ask" | "repair" | "not_found";
  confidence: number;
  track?: { title: string; artist: string; candidate_id?: string };
  candidates?: { title: string; artist: string }[];
  spoken_prompt: { speak_short: string };
  trace_id: string;
  degradation_level?: string;
}

export interface ToolCallOutcome {
  ok: boolean;
  output?: ResolveResult;
  /** MCP-level error payload (isError tool result or JSON-RPC error). */
  error?: string;
  latencyMs: number;
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        srv.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const port = address.port;
      srv.close(() => resolvePort(port));
    });
  });
}

export interface SpawnedServer {
  baseUrl: string;
  port: number;
  pid: number;
  /** Full process output captured since spawn (for honest failure reports). */
  outputLog: () => string;
  stop: () => Promise<void>;
}

export interface SpawnOptions {
  /** How long to wait for /healthz before failing with the captured log. */
  readyTimeoutMs?: number;
}

export async function spawnReplayServer(opts: SpawnOptions = {}): Promise<SpawnedServer> {
  const entry = assertServiceBuilt();
  const port = await freePort();
  const dbPath = join(tmpdir(), `omnibeat-eval-${process.pid}-${randomUUID()}.db`);
  const child = spawn(process.execPath, [entry], {
    cwd: MCP_SERVICE_DIR,
    env: {
      ...process.env,
      OMNIBEAT_HOST: "127.0.0.1",
      OMNIBEAT_PORT: String(port),
      OMNIBEAT_DB_PATH: dbPath,
      OMNIBEAT_REPLAY_ONLY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  child.stdout.on("data", (chunk: Buffer) => (log += chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => (log += chunk.toString("utf8")));

  let exited: { code: number | null; signal: string | null } | undefined;
  child.on("exit", (code, signal) => (exited = { code, signal }));

  const stop = async (): Promise<void> => {
    if (exited !== undefined) return;
    await new Promise<void>((done) => {
      child.once("exit", () => done());
      child.kill();
      setTimeout(() => {
        if (exited === undefined) child.kill("SIGKILL");
        done();
      }, 2000).unref();
    });
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + (opts.readyTimeoutMs ?? 15_000);
  for (;;) {
    if (exited !== undefined) {
      throw new Error(
        `omnibeat-mcp exited before becoming ready (code=${exited.code} signal=${exited.signal}).` +
          ` spawn cmd: node ${entry} cwd=${MCP_SERVICE_DIR}.\n--- server output ---\n${log}`,
      );
    }
    try {
      const res = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(
        `omnibeat-mcp did not answer /healthz within 15s on ${baseUrl}.\n--- server output ---\n${log}`,
      );
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return {
    baseUrl,
    port,
    pid: child.pid ?? -1,
    outputLog: () => log,
    stop,
  };
}

function frame(text: string, contentType: string): unknown {
  if (text.length === 0) return null;
  if (contentType.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data:"));
    return data.length > 0 ? JSON.parse(data[data.length - 1]!.slice(5).trim()) : null;
  }
  return JSON.parse(text);
}

export class McpClient {
  private sessionId: string | undefined;
  private nextId = 1;

  constructor(private readonly baseUrl: string) {}

  private async post(
    body: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; data: any; sessionId: string | null }> {
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    return {
      status: res.status,
      data: frame(text, res.headers.get("content-type") ?? ""),
      sessionId: res.headers.get("mcp-session-id"),
    };
  }

  async initialize(): Promise<void> {
    const init = await this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "omnibeat-eval", version: "0.1.0" },
      },
    });
    if (init.status !== 200 || typeof init.sessionId !== "string" || init.sessionId.length === 0) {
      throw new Error(`MCP initialize failed: HTTP ${init.status} ${JSON.stringify(init.data).slice(0, 300)}`);
    }
    this.sessionId = init.sessionId;
    const ack = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, this.headers());
    if (ack.status !== 202 && ack.status !== 200) {
      throw new Error(`MCP notifications/initialized failed: HTTP ${ack.status}`);
    }
  }

  private headers(): Record<string, string> {
    return this.sessionId !== undefined
      ? { "mcp-session-id": this.sessionId, "mcp-protocol-version": MCP_PROTOCOL_VERSION }
      : {};
  }

  async callResolve(transcript: string, surface: "screenless" = "screenless"): Promise<ToolCallOutcome> {
    const started = Date.now();
    const res = await this.post(
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name: "music_resolve_request", arguments: { transcript, surface } },
      },
      this.headers(),
    );
    const latencyMs = Date.now() - started;
    const data = res.data as any;
    if (res.status !== 200) {
      return { ok: false, error: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`, latencyMs };
    }
    if (data?.error) {
      return { ok: false, error: `jsonrpc ${data.error.code}: ${data.error.message}`, latencyMs };
    }
    const result = data?.result;
    if (result?.isError === true) {
      const detail = Array.isArray(result.content)
        ? result.content.map((c: any) => c?.text ?? "").join(" | ")
        : "";
      return { ok: false, error: `tool isError: ${detail.slice(0, 400)}`, latencyMs };
    }
    const output = (result?.structuredContent ?? undefined) as ResolveResult | undefined;
    if (!output || typeof output.decision !== "string") {
      return { ok: false, error: `no structuredContent in result: ${JSON.stringify(data).slice(0, 300)}`, latencyMs };
    }
    return { ok: true, output, latencyMs };
  }

  /** Lab-only A/B switch: POST /admin/mode {naive:boolean}. */
  async setNaive(naive: boolean): Promise<void> {
    const res = await fetch(`${this.baseUrl}/admin/mode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ naive }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      throw new Error(`/admin/mode {naive:${naive}} failed: HTTP ${res.status} ${await res.text()}`);
    }
  }
}
