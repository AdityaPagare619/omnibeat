/**
 * MCP client — StreamableHTTPClientTransport → ${MCP_URL} (default
 * http://localhost:8080/mcp).
 *
 * Responsibilities
 *  - initialize on boot and keep the session; reconnect with capped backoff
 *    when the server refuses or drops the connection;
 *  - tool-call helper with a timeout, gated by the circuit breaker and the
 *    chaos injector;
 *  - emit exactly one trace frame per MCP HTTP verb:
 *      POST  → one `host→mcp` frame per JSON-RPC message in the body,
 *              one `mcp→host` frame per message the server returns
 *              (application/json or a single SSE event);
 *      GET   → one `host→mcp` frame (SSE stream open, with latency + status);
 *      DELETE→ one `host→mcp` frame (session terminate);
 *    plus `internal` frames for every connection decision (connect, refuse,
 *    backoff, session, breaker, chaos).
 *
 * Nothing here invents a result: if the server cannot be reached the client
 * throws `McpError("MCP_OFFLINE")` and the trace shows the refused attempt.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult, Implementation, JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { TraceBus } from "./trace-bus.js";
import type { CircuitBreaker } from "./breaker.js";
import type { ChaosController } from "./chaos.js";
import { ChaosError } from "./chaos.js";
import { logger } from "./logger.js";

export type McpErrorCode =
  | "MCP_OFFLINE"
  | "MCP_TIMEOUT"
  | "MCP_CIRCUIT_OPEN"
  | "MCP_PROTOCOL_ERROR"
  | "CHAOS_INJECTED"
  | "ADMIN_MODE_UNREACHABLE";

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly detail: unknown;
  constructor(code: McpErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.detail = detail;
  }
}

export type McpState = "idle" | "connecting" | "online" | "offline";

export interface McpHealthProbe {
  ok: boolean;
  rttMs: number;
  status?: number;
  error?: string;
  code?: McpErrorCode;
  /** True when the breaker suppressed the probe (no dial attempted). */
  skipped?: boolean;
}

export interface McpHostClientOptions {
  mcpUrl: string;
  mcpOrigin: string;
  bus: TraceBus;
  breaker?: CircuitBreaker;
  chaos?: ChaosController;
  toolTimeoutMs?: number;
  connectTimeoutMs?: number;
  reconnectBackoffMs?: number[];
  /** Injectable for tests. */
  baseFetch?: FetchLike;
  clientInfo?: Implementation;
}

interface HttpRecord {
  verb: string;
  path: string;
  startedAt: number;
  requestIds: string[];
}

const MAX_PENDING = 256;

export class McpHostClient {
  state: McpState = "idle";
  sessionId: string | undefined;
  protocolVersion: string | undefined;
  serverInfo: Implementation | undefined;
  lastError: string | undefined;

  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private connecting: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private closed = false;
  private readonly sendTimes = new Map<string, number>();
  private readonly requestMethods = new Map<string, string>();
  private readonly requestTools = new Map<string, string>();
  private lastToolsCallId: string | undefined;

  private readonly bus: TraceBus;
  private readonly breaker?: CircuitBreaker;
  private readonly chaos?: ChaosController;
  private readonly toolTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly backoff: number[];
  private readonly baseFetch: FetchLike;
  private readonly clientInfo: Implementation;

  constructor(opts: McpHostClientOptions) {
    this.bus = opts.bus;
    this.breaker = opts.breaker;
    this.chaos = opts.chaos;
    this.toolTimeoutMs = opts.toolTimeoutMs ?? 4000;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 2500;
    this.backoff = opts.reconnectBackoffMs ?? [250, 500, 1000, 2000, 4000, 8000];
    this.baseFetch = opts.baseFetch ?? ((url, init) => fetch(url, init));
    this.clientInfo = opts.clientInfo ?? { name: "alexa-lab", version: "0.1.0" };
    this.mcpUrl = opts.mcpUrl;
    this.mcpOrigin = opts.mcpOrigin;
  }

  readonly mcpUrl: string;
  readonly mcpOrigin: string;

  /** Boot: try once, never throws — the lab must start with the MCP down. */
  async start(): Promise<void> {
    await this.tryConnect("boot");
  }

  get isOnline(): boolean {
    return this.state === "online" && this.client !== null;
  }

  snapshot(): {
    state: McpState;
    sessionId: string | undefined;
    serverInfo: Implementation | undefined;
    reconnectAttempt: number;
    lastError: string | undefined;
    url: string;
  } {
    return {
      state: this.state,
      sessionId: this.sessionId,
      serverInfo: this.serverInfo,
      reconnectAttempt: this.attempt,
      lastError: this.lastError,
      url: this.mcpUrl,
    };
  }

  /** Connect now if not already connected. Throws McpError("MCP_OFFLINE"). */
  async ensureOnline(): Promise<void> {
    if (this.isOnline) return;
    await this.tryConnect("inline");
    if (!this.isOnline) {
      throw new McpError(
        "MCP_OFFLINE",
        `MCP server unreachable at ${this.mcpUrl} (${this.lastError ?? "no response"})`,
        { state: this.state, attempt: this.attempt, url: this.mcpUrl },
      );
    }
  }

  private async tryConnect(reason: string): Promise<void> {
    if (this.closed) return;
    if (this.connecting) {
      await this.connecting.catch(() => undefined);
      return;
    }
    if (this.isOnline) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.connecting = this.doConnect(reason).finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }

  private async doConnect(reason: string): Promise<void> {
    this.state = "connecting";
    const startedAt = Date.now();
    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      fetch: this.fetchImpl,
    });
    const client = new Client(this.clientInfo, { capabilities: {} });

    // SDK chains (does not replace) handlers assigned before connect().
    transport.onclose = () => this.handleTransportEvent("close");
    transport.onerror = (err: Error) => this.handleTransportEvent("error", err);

    try {
      await withTimeout(client.connect(transport), this.connectTimeoutMs, () => {
        void transport.close().catch(() => undefined);
        return new McpError(
          "MCP_TIMEOUT",
          `initialize timed out after ${this.connectTimeoutMs}ms`,
          { url: this.mcpUrl },
        );
      });
      this.client = client;
      this.transport = transport;
      this.state = "online";
      this.attempt = 0;
      this.lastError = undefined;
      this.sessionId = transport.sessionId ?? this.sessionId;
      this.protocolVersion = transport.protocolVersion ?? this.protocolVersion;
      this.serverInfo = client.getServerVersion() ?? this.serverInfo;
      this.bus.emit({
        direction: "internal",
        method: "session.connected",
        sessionId: this.sessionId,
        latencyMs: Date.now() - startedAt,
        payload: {
          reason,
          url: this.mcpUrl,
          serverInfo: this.serverInfo,
          protocolVersion: this.protocolVersion,
        },
      });
      logger.info("mcp connected", {
        url: this.mcpUrl,
        sessionId: this.sessionId,
        reason,
        server: this.serverInfo,
      });
    } catch (err) {
      this.client = null;
      this.transport = null;
      this.state = "offline";
      const mapped = toMcpError(err, this.connectTimeoutMs);
      this.lastError = describeError(err);
      this.bus.emit({
        direction: "internal",
        method: "session.connect_failed",
        latencyMs: Date.now() - startedAt,
        payload: {
          reason,
          url: this.mcpUrl,
          code: mapped.code,
          error: this.lastError,
          attempt: this.attempt + 1,
        },
      });
      logger.warn("mcp connect failed", { url: this.mcpUrl, reason, error: this.lastError });
      this.scheduleReconnect();
    }
  }

  private handleTransportEvent(kind: "close" | "error", err?: Error): void {
    if (this.closed || this.connecting) return;
    if (this.state === "offline" || this.state === "idle") return;
    this.lastError = err ? describeError(err) : "transport closed by server";
    this.bus.emit({
      direction: "internal",
      method: kind === "close" ? "session.disconnected" : "transport.error",
      sessionId: this.sessionId,
      payload: { error: this.lastError, url: this.mcpUrl },
    });
    this.state = "offline";
    this.client = null;
    this.transport = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.retryTimer) return;
    const delay = this.backoff[Math.min(this.attempt, this.backoff.length - 1)] ?? 8000;
    this.attempt += 1;
    this.bus.emit({
      direction: "internal",
      method: "session.reconnect_scheduled",
      payload: { attempt: this.attempt, delayMs: delay, url: this.mcpUrl },
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.tryConnect("retry");
    }, delay);
    this.retryTimer.unref?.();
  }

  // ────────────────────────────────────────────────────────── tool calls ────

  /**
   * Call a tool with timeout + breaker + chaos gates.
   * Wire frames (POST body / response) are emitted by `fetchImpl`; this layer
   * emits only the internal decision frames around the call.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: { timeoutMs?: number } = {},
  ): Promise<CallToolResult> {
    const timeoutMs = opts.timeoutMs ?? this.toolTimeoutMs;

    if (this.breaker && !this.breaker.allow()) {
      const snap = this.breaker.snapshot();
      this.emitUndeliveredAttempt(
        name,
        args,
        `circuit breaker ${snap.state}: ${snap.lastTransitionReason ?? "open"}`,
        "MCP_CIRCUIT_OPEN",
      );
      this.bus.emit({
        direction: "internal",
        method: "breaker.blocked",
        tool: name,
        payload: {
          code: "MCP_CIRCUIT_OPEN",
          state: snap.state,
          reason: snap.lastTransitionReason,
          edgeMode: snap.edgeMode,
        },
      });
      throw new McpError(
        "MCP_CIRCUIT_OPEN",
        `circuit breaker ${snap.state}: ${snap.lastTransitionReason ?? "open"}`,
        { breaker: snap },
      );
    }

    const dispatchStartedAt = Date.now();
    try {
      await this.ensureOnline();
    } catch (err) {
      const rttMs = Date.now() - dispatchStartedAt;
      const mapped = toMcpError(err);
      // A call that could not be dispatched is a real failure signal for the
      // breaker (probes see the same outage over HTTP /healthz).
      this.breaker?.observe(false, rttMs, mapped.code);
      this.emitUndeliveredAttempt(
        name,
        args,
        `session offline — request never sent (${describeError(err)})`,
        mapped.code,
      );
      this.emitCallError(name, mapped, rttMs);
      throw mapped;
    }

    try {
      await this.chaos?.gate();
    } catch (err) {
      this.breaker?.observe(false, 0, "chaos injected before dialing");
      this.emitUndeliveredAttempt(name, args, "chaos gate rejected before dialing", "CHAOS_INJECTED");
      this.emitCallError(name, err);
      throw toMcpError(err);
    }

    const client = this.client;
    if (!client) {
      const err = new McpError("MCP_OFFLINE", "client dropped between ensureOnline and call", {});
      this.emitCallError(name, err);
      throw err;
    }

    const startedAt = Date.now();
    try {
      const result = await withTimeout(
        client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs }),
        timeoutMs + 750,
        () => new McpError("MCP_TIMEOUT", `tools/call ${name} exceeded ${timeoutMs}ms`, { tool: name }),
      );
      const rttMs = Date.now() - startedAt;
      this.breaker?.observe(true, rttMs);
      return result as CallToolResult;
    } catch (err) {
      const rttMs = Date.now() - startedAt;
      const mapped = toMcpError(err, timeoutMs);
      if (mapped.code === "MCP_OFFLINE" || mapped.code === "MCP_TIMEOUT" || mapped.code === "MCP_PROTOCOL_ERROR") {
        this.breaker?.observe(false, rttMs, mapped.code);
      }
      this.emitCallError(name, mapped, rttMs);
      throw mapped;
    }
  }

  private emitCallError(tool: string, err: unknown, latencyMs?: number): void {
    const mcpErr = err instanceof McpError ? err : null;
    this.bus.emit({
      direction: "internal",
      method: "tools/call.failed",
      tool,
      ...(latencyMs !== undefined ? { latencyMs } : {}),
      payload: {
        code: mcpErr?.code ?? "MCP_PROTOCOL_ERROR",
        error: describeError(err),
        detail: mcpErr?.detail,
      },
    });
  }

  /**
   * Send `notifications/cancelled` for a barge-in.
   *
   * Online → the real notification goes over the transport (the fetch tap
   * emits the wire frame). Offline / no request id → a local `host→mcp` frame
   * with `delivered:false` so the inspector still shows the intent without
   * pretending it left the process.
   */
  async sendCancelled(opts: {
    reason: string;
    cutAtWord: number;
    wordsCompleted: number;
    atMs: number;
  }): Promise<{ delivered: boolean; code?: McpErrorCode }> {
    const requestId = this.lastToolsCallId;
    const inFlight = this.pendingRequestCount("tools/call") > 0;

    if (!this.isOnline || requestId === undefined) {
      const code: McpErrorCode = this.isOnline ? "MCP_PROTOCOL_ERROR" : "MCP_OFFLINE";
      this.bus.emit({
        direction: "host→mcp",
        method: "notifications/cancelled",
        ...(requestId !== undefined ? { requestId } : {}),
        ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
        payload: {
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: { requestId: requestId ?? null, reason: opts.reason },
          delivered: false,
          inFlight,
          cutAtWord: opts.cutAtWord,
          wordsCompleted: opts.wordsCompleted,
          atMs: opts.atMs,
          code,
          note:
            requestId === undefined
              ? "no tools/call has been dispatched in this process yet"
              : "MCP session offline — cancellation was not sent",
        },
      });
      return { delivered: false, code };
    }

    try {
      await this.client?.notification({
        method: "notifications/cancelled",
        params: { requestId, reason: opts.reason },
      });
      return { delivered: true };
    } catch (err) {
      const mapped = toMcpError(err);
      this.bus.emit({
        direction: "internal",
        method: "notifications/cancelled.failed",
        ...(requestId !== undefined ? { requestId } : {}),
        payload: { code: mapped.code, error: describeError(err) },
      });
      return { delivered: false, code: mapped.code };
    }
  }

  // ─────────────────────────────────────────────────── health probing ────

  /** GET <origin>/healthz — feeds the circuit breaker. */
  async probe(): Promise<McpHealthProbe> {
    if (this.breaker && !this.breaker.allow()) {
      const snap = this.breaker.snapshot();
      return {
        ok: false,
        rttMs: 0,
        skipped: true,
        code: "MCP_CIRCUIT_OPEN",
        error: `breaker ${snap.state} (${snap.lastTransitionReason ?? "open"}) — probe suppressed`,
      };
    }
    const url = `${this.mcpOrigin}/healthz`;
    const startedAt = Date.now();
    try {
      await this.chaos?.gate();
      const res = await this.baseFetch(url, { method: "GET" });
      const rttMs = Date.now() - startedAt;
      const ok = res.ok;
      this.bus.emit({
        direction: "host→mcp",
        method: "GET /healthz",
        latencyMs: rttMs,
        payload: { url, status: res.status, ok, via: "circuit-breaker probe" },
      });
      this.breaker?.observe(ok, rttMs, `healthz status ${res.status}`);
      return { ok, rttMs, status: res.status, ...(ok ? {} : { error: `HTTP ${res.status}` }) };
    } catch (err) {
      const rttMs = Date.now() - startedAt;
      const mapped = toMcpError(err);
      this.bus.emit({
        direction: "host→mcp",
        method: "GET /healthz",
        latencyMs: rttMs,
        payload: {
          url,
          ok: false,
          code: mapped.code,
          error: describeError(err),
          via: "circuit-breaker probe",
        },
      });
      this.breaker?.observe(false, rttMs, mapped.code);
      return { ok: false, rttMs, code: mapped.code, error: describeError(err) };
    }
  }

  /**
   * POST <origin>/admin/mode {naive} — the A/B toggle B-MCP exposes so both
   * arms of the experiment run through ONE server-side code path.
   */
  async setNaiveMode(naive: boolean): Promise<void> {
    const url = `${this.mcpOrigin}/admin/mode`;
    const startedAt = Date.now();
    try {
      await this.chaos?.gate();
      const res = await this.baseFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ naive }),
      });
      const latencyMs = Date.now() - startedAt;
      this.bus.emit({
        direction: "host→mcp",
        method: "POST /admin/mode",
        latencyMs,
        payload: { url, naive, status: res.status, ok: res.ok },
      });
      if (!res.ok) {
        throw new McpError(
          "ADMIN_MODE_UNREACHABLE",
          `POST /admin/mode returned HTTP ${res.status}`,
          { status: res.status, naive },
        );
      }
    } catch (err) {
      if (err instanceof McpError) throw err;
      this.bus.emit({
        direction: "internal",
        method: "POST /admin/mode.failed",
        latencyMs: Date.now() - startedAt,
        payload: { url, naive, code: "ADMIN_MODE_UNREACHABLE", error: describeError(err) },
      });
      throw new McpError(
        "ADMIN_MODE_UNREACHABLE",
        `POST /admin/mode unreachable (${describeError(err)})`,
        { naive },
      );
    }
  }

  // ────────────────────────────────────────────────── frame-emitting fetch ────

  /**
   * The transport's fetch. Emits one frame per HTTP verb and per JSON-RPC
   * message, tee-ing response bodies so SSE event ids are captured without
   * interfering with the SDK's own reads.
   */
  private fetchImpl: FetchLike = async (url, init) => {
    const verb = (init?.method ?? "GET").toUpperCase();
    const path = pathOf(url);
    const messages = parseBodyMessages(init?.body);
    const startedAt = Date.now();

    // 1. Outbound frames (POST): emitted BEFORE dialing so a refused
    //    connection still shows the attempt that failed.
    const ids: string[] = [];
    for (const msg of messages) {
      const id = "id" in msg ? String(msg.id) : undefined;
      const method = "method" in msg && typeof msg.method === "string" ? msg.method : undefined;
      if (id !== undefined) {
        this.remember(id, msg, startedAt);
        ids.push(id);
      }
      this.bus.emit({
        direction: "host→mcp",
        method: method ?? `request ${id ?? "?"}`,
        ...(method === "tools/call" && toolOf(msg) ? { tool: toolOf(msg) as string } : {}),
        ...(id !== undefined ? { requestId: id } : {}),
        ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
        payload: msg,
      });
    }

    const record: HttpRecord = { verb, path, startedAt, requestIds: ids };

    try {
      const res = await this.baseFetch(url, init);
      const latencyMs = Date.now() - startedAt;

      const sid = res.headers.get("mcp-session-id");
      if (sid) this.sessionId = sid;
      const pv = res.headers.get("mcp-protocol-version");
      if (pv) this.protocolVersion = pv;

      if (messages.length === 0) {
        // GET (SSE stream) and DELETE (session terminate): one frame each.
        this.bus.emit({
          direction: "host→mcp",
          method: `${verb} ${path}`,
          ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
          latencyMs,
          payload: { url: String(url), status: res.status, contentType: res.headers.get("content-type") },
        });
      } else if (!res.ok) {
        // POST rejected before any JSON-RPC body came back (4xx/5xx).
        const method =
          (ids[0] !== undefined ? this.requestMethods.get(ids[0]) : undefined) ?? `${verb} ${path}`;
        this.bus.emit({
          direction: "mcp→host",
          method,
          ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
          latencyMs,
          payload: { httpStatus: res.status, error: `HTTP ${res.status}` },
        });
        for (const id of ids) this.forget(id);
      }

      return await this.tapBody(res, record);
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const mapped = toMcpError(err);
      if (messages.length === 0) {
        this.bus.emit({
          direction: "host→mcp",
          method: `${verb} ${path}`,
          latencyMs,
          payload: { url: String(url), code: mapped.code, error: describeError(err) },
        });
      }
      this.bus.emit({
        direction: "internal",
        method: "http.error",
        latencyMs,
        payload: { verb, path, code: mapped.code, error: describeError(err), url: String(url) },
      });
      throw err;
    }
  };

  /** Tee the response body: parse it for frames, hand the SDK its own branch. */
  private async tapBody(res: Response, record: HttpRecord): Promise<Response> {
    const body = res.body;
    if (!body) return res;
    const contentType = res.headers.get("content-type") ?? "";
    const headers = new Headers(res.headers);
    headers.delete("content-length");

    if (contentType.includes("text/event-stream")) {
      const [forSdk, forUs] = body.tee();
      void this.readSse(forUs, record).catch((err: unknown) =>
        logger.warn("sse tap failed", { error: describeError(err) }),
      );
      return new Response(forSdk, { status: res.status, statusText: res.statusText, headers });
    }

    if (record.verb === "POST" && contentType.includes("json")) {
      const text = await res.text();
      const messages = parseJsonMessages(text);
      if (messages.length === 0) {
        // Capture gap must be visible: the SDK still gets this body, but the
        // inspector would see no response frame.
        this.bus.emit({
          direction: "internal",
          method: "tap.diagnose",
          payload: {
            stage: "post_json_empty",
            verb: record.verb,
            contentType,
            status: res.status,
            bodyLength: text.length,
            head: text.slice(0, 160),
          },
        });
      }
      this.emitInbound(messages, record);
      return new Response(text, { status: res.status, statusText: res.statusText, headers });
    }

    // 202/204 are the normal ack for a JSON-RPC *notification* — nothing to tap.
    if (record.verb === "POST" && res.status === 200) {
      this.bus.emit({
        direction: "internal",
        method: "tap.diagnose",
        payload: {
          stage: "post_unhandled_content_type",
          verb: record.verb,
          contentType,
          status: res.status,
          hasBody: body !== null,
        },
      });
    }

    return new Response(body, { status: res.status, statusText: res.statusText, headers });
  }

  private async readSse(stream: ReadableStream<Uint8Array>, record: HttpRecord): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const boundary = /\r?\n\r?\n/; // SSE events end with a blank line (LF or CRLF)
    let buffer = "";
    let bytes = 0;
    let emitted = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        buffer += decoder.decode(value, { stream: true });
        let match: RegExpExecArray | null;
        while ((match = boundary.exec(buffer)) !== null) {
          const end = match.index + match[0].length;
          const chunk = buffer.slice(0, end);
          buffer = buffer.slice(end);
          emitted += this.handleSseEvent(chunk, record);
        }
      }
      if (buffer.trim()) emitted += this.handleSseEvent(buffer, record);
    } finally {
      reader.releaseLock?.();
    }
    if (bytes > 0 && emitted === 0) {
      this.bus.emit({
        direction: "internal",
        method: "tap.diagnose",
        payload: {
          stage: "sse_stream_read_but_no_messages",
          verb: record.verb,
          bytes,
        },
      });
    }
  }

  /** Parse one SSE event block; returns how many JSON-RPC frames it yielded. */
  private handleSseEvent(chunk: string, record: HttpRecord): number {
    let eventId: string | undefined;
    const dataLines: string[] = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith("id:")) eventId = line.slice(3).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return 0;
    if (dataLines.every((line) => line.trim().length === 0)) {
      // SSE keep-alive (`data:` with no payload) — nothing to frame.
      return 0;
    }
    // Per spec a multi-line `data:` field is joined with "\n"; if our block
    // boundary was off we may hold several events, so fall back to per-line.
    let messages = parseJsonRpcText(dataLines.join("\n"));
    if (messages.length === 0) {
      messages = dataLines.flatMap((line) => parseJsonRpcText(line));
    }
    if (messages.length === 0) {
      this.bus.emit({
        direction: "internal",
        method: "tap.diagnose",
        payload: { stage: "sse_event_unparsable", head: chunk.slice(0, 160) },
      });
      return 0;
    }
    for (const msg of messages) {
      this.emitInbound([msg], record, eventId, Date.now() - record.startedAt);
    }
    return messages.length;
  }

  private emitInbound(
    messages: JSONRPCMessage[],
    record: HttpRecord,
    sseEventId?: string,
    streamLatencyMs?: number,
  ): void {
    for (const msg of messages) {
      const hasMethod = "method" in msg && typeof msg.method === "string";
      const id = "id" in msg ? String(msg.id) : undefined;
      const method = hasMethod
        ? (msg as { method: string }).method
        : (id !== undefined ? this.requestMethods.get(id) : undefined) ?? `response ${id ?? "?"}`;
      const tool = id !== undefined ? this.requestTools.get(id) : undefined;
      const sentAt = id !== undefined ? this.sendTimes.get(id) : undefined;
      const latencyMs = sentAt !== undefined ? Date.now() - sentAt : streamLatencyMs;
      this.bus.emit({
        direction: "mcp→host",
        method,
        ...(tool !== undefined ? { tool } : {}),
        ...(id !== undefined ? { requestId: id } : {}),
        ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
        ...(sseEventId !== undefined ? { sseEventId } : {}),
        ...(latencyMs !== undefined && latencyMs >= 0 ? { latencyMs } : {}),
        payload: msg,
      });
      if (id !== undefined) this.forget(id);
    }
  }

  private remember(id: string, msg: JSONRPCMessage, startedAt: number): void {
    if (this.sendTimes.size > MAX_PENDING) {
      this.sendTimes.clear();
      this.requestMethods.clear();
      this.requestTools.clear();
    }
    this.sendTimes.set(id, startedAt);
    if ("method" in msg && typeof msg.method === "string") {
      this.requestMethods.set(id, msg.method);
      const tool = toolOf(msg);
      if (tool) this.requestTools.set(id, tool);
      if (msg.method === "tools/call") this.lastToolsCallId = id;
    }
  }

  /** JSON-RPC id of the most recent tools/call — cited by notifications/cancelled. */
  lastToolsCallRequestId(): string | undefined {
    return this.lastToolsCallId;
  }

  /** How many requests of `method` are still awaiting a response. */
  pendingRequestCount(method: string): number {
    let n = 0;
    for (const m of this.requestMethods.values()) if (m === method) n += 1;
    return n;
  }

  /**
   * Frame for a call that was NEVER put on the wire (breaker open, session
   * offline, chaos gate). `delivered:false` makes that unmistakable — the lab
   * must never look like it got a result it did not get.
   */
  private emitUndeliveredAttempt(
    tool: string,
    args: Record<string, unknown>,
    reason: string,
    code: McpErrorCode,
  ): void {
    this.bus.emit({
      direction: "host→mcp",
      method: "tools/call",
      tool,
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
      payload: { name: tool, arguments: args, delivered: false, reason, code },
    });
  }

  private forget(id: string): void {
    this.sendTimes.delete(id);
    this.requestMethods.delete(id);
    this.requestTools.delete(id);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const transport = this.transport;
    this.transport = null;
    this.client = null;
    if (transport) {
      try {
        await transport.terminateSession();
      } catch {
        /* best effort */
      }
      try {
        await transport.close();
      } catch {
        /* best effort */
      }
    }
    this.state = "idle";
  }
}

// ─────────────────────────────────────────────────────────── helpers ────────

function toolOf(msg: JSONRPCMessage): string | undefined {
  if (!("method" in msg) || msg.method !== "tools/call") return undefined;
  const params = (msg as { params?: { name?: unknown } }).params;
  return typeof params?.name === "string" ? params.name : undefined;
}

function pathOf(url: string | URL): string {
  try {
    return new URL(String(url)).pathname;
  } catch {
    return String(url);
  }
}

function parseBodyMessages(body: unknown): JSONRPCMessage[] {
  if (body === undefined || body === null) return [];
  try {
    const parsed = JSON.parse(typeof body === "string" ? body : String(body)) as unknown;
    return parseJsonMessages(parsed);
  } catch {
    return [];
  }
}

function parseJsonMessages(input: unknown): JSONRPCMessage[] {
  if (Array.isArray(input)) return input as JSONRPCMessage[];
  if (input && typeof input === "object") return [input as JSONRPCMessage];
  return [];
}

/** Parse SSE `data:` payload TEXT into JSON-RPC messages ([] when invalid). */
function parseJsonRpcText(text: string): JSONRPCMessage[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  try {
    return parseJsonMessages(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const parts: string[] = [];
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      // undici/fetch wraps ECONNREFUSED; on dual-stack hosts the cause is an
      // AggregateError whose own message is empty — surface the inner errors.
      const inner = (cause as unknown as { errors?: unknown[] }).errors;
      if (Array.isArray(inner) && inner.length > 0) {
        const innerText = inner
          .map((e) => {
            if (e instanceof Error) return e.message || codeOf(e) || e.name;
            return String(e);
          })
          .filter(Boolean)
          .join("; ");
        if (innerText) parts.push(innerText);
      } else if (cause.message) {
        parts.push(cause.message);
      }
      if (cause.message === "" && parts.length === 0) {
        const fallback = codeOf(cause);
        if (fallback) parts.push(fallback);
      }
    }
    if (parts.length === 0) {
      const own = codeOf(err);
      if (own && own !== err.message) parts.push(own);
    }
    return parts.length > 0 ? `${err.name}: ${err.message} (${parts.join(" | ")})` : `${err.name}: ${err.message}`;
  }
  return String(err);
}

function codeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

/** Map any thrown value onto the lab's honest error vocabulary. */
export function toMcpError(err: unknown, timeoutMs?: number): McpError {
  if (err instanceof McpError) return err;
  if (err instanceof ChaosError) {
    return new McpError("CHAOS_INJECTED", err.message, { injected: true });
  }
  const text = describeError(err);
  if (/Request timed out|RequestTimeout|timed out|ETIMEDOUT|Timeout/i.test(text)) {
    return new McpError(
      "MCP_TIMEOUT",
      `MCP request timed out${timeoutMs ? ` after ${timeoutMs}ms` : ""}`,
      { cause: text },
    );
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|network|socket hang up|Unable to connect|AbortError/i.test(text)) {
    return new McpError("MCP_OFFLINE", `MCP server unreachable: ${text}`, { cause: text });
  }
  return new McpError("MCP_PROTOCOL_ERROR", text, { cause: text });
}

async function withTimeout<T>(work: Promise<T>, ms: number, makeError: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(makeError()), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
