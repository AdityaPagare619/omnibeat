/**
 * Shared MCP client helpers for the acceptance-test skeletons.
 *
 * These helpers speak ONLY the wire contract frozen in
 * docs/00_OMNIBEAT_V3_BLUEPRINT.md §5 (Streamable HTTP: POST /mcp, GET SSE,
 * DELETE session; negotiation with protocolVersion 2025-11-25; MCP-Protocol-Version
 * and Mcp-Session-Id headers). They deliberately assert nothing about internals.
 */

/** Streamable-HTTP endpoint under test. Override with OMNIBEAT_MCP_URL. */
export const MCP_URL = process.env["OMNIBEAT_MCP_URL"] ?? "http://127.0.0.1:8787/mcp";

/** Frozen protocol version (blueprint §5.1, Charter AC-01). */
export const PROTOCOL_VERSION = "2025-11-25";

/** Per-request timeout so dead-server skeletons fail fast instead of hanging. */
const REQUEST_TIMEOUT_MS = 3_000;

export const ALL_TOOL_NAMES = [
  "music_resolve_request",
  "music_preview_hooks",
  "music_confirm_selection",
  "music_explain_last_action",
  "session_set_response_style",
  "music_plan_offline_cache",
  "account_link_music_service",
  "privacy_forget_my_data",
] as const;

/** JSON-RPC 2.0 envelope we send (shape fixed by blueprint §5.1). */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export function rpc(method: string, params?: Record<string, unknown>, id: number | string = 1): JsonRpcRequest {
  return { jsonrpc: "2.0", id, ...(params === undefined ? {} : { params }), method };
}

export function notification(method: string, params?: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) };
}

/**
 * POST a JSON-RPC message to /mcp. If the server is not reachable we fail with a
 * loud, stable message so the red-run receipt is unambiguous: it means
 * "not implemented yet", not "flaky network".
 */
export async function postRpc(
  body: JsonRpcRequest | JsonRpcRequest[],
  headers: Record<string, string> = {},
): Promise<Response> {
  try {
    return await fetch(MCP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `NOT IMPLEMENTED: OmniBeat MCP server unreachable at ${MCP_URL} ` +
        `(AC skeletons require the Phase-1 server). Original: ${(err as Error).message}`,
    );
  }
}

/** Perform `initialize` and return the Mcp-Session-Id header value. */
export async function initialize(extraParams?: Record<string, unknown>): Promise<string> {
  const res = await postRpc(
    rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "omnibeat-acceptance-skeleton", version: "0.0.0" },
      ...extraParams,
    }),
  );
  if (res.status !== 200) {
    throw new Error(`NOT IMPLEMENTED: initialize returned HTTP ${res.status}; expected 200 (blueprint §5.1).`);
  }
  const sessionId = res.headers.get("mcp-session-id");
  if (sessionId === null) {
    throw new Error("NOT IMPLEMENTED: initialize response is missing the Mcp-Session-Id header (blueprint §5.1).");
  }
  return sessionId;
}

/** Send initialized notification + tools/list for a live session; return the tool array. */
export async function listTools(sessionId: string): Promise<unknown[]> {
  await postRpc(notification("notifications/initialized"), { "mcp-session-id": sessionId, "mcp-protocol-version": PROTOCOL_VERSION });
  const res = await postRpc(rpc("tools/list", {}, 2), {
    "mcp-session-id": sessionId,
    "mcp-protocol-version": PROTOCOL_VERSION,
  });
  if (res.status !== 200) {
    throw new Error(`NOT IMPLEMENTED: tools/list returned HTTP ${res.status}; expected 200 (AC-03).`);
  }
  const body = (await res.json()) as { result?: { tools?: unknown[] } };
  const tools = body.result?.tools;
  if (!Array.isArray(tools)) {
    throw new Error("NOT IMPLEMENTED: tools/list response has no result.tools array (AC-03).");
  }
  return tools;
}

/** Open the server→client SSE stream (GET /mcp) for a session. Caller must abort. */
export async function openSse(sessionId: string): Promise<{ stream: ReadableStream<Uint8Array>; abort: () => void }> {
  const controller = new AbortController();
  try {
    const res = await fetch(MCP_URL, {
      method: "GET",
      headers: { accept: "text/event-stream", "mcp-session-id": sessionId, "mcp-protocol-version": PROTOCOL_VERSION },
      signal: controller.signal,
    });
    if (res.status !== 200 || res.body === null) {
      throw new Error(`NOT IMPLEMENTED: GET /mcp returned HTTP ${res.status} with no stream (AC-02).`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      throw new Error(`NOT IMPLEMENTED: GET /mcp content-type was "${contentType}", expected text/event-stream (AC-02).`);
    }
    return { stream: res.body, abort: () => controller.abort() };
  } catch (err) {
    controller.abort();
    if (err instanceof Error && err.message.startsWith("NOT IMPLEMENTED")) throw err;
    throw new Error(
      `NOT IMPLEMENTED: SSE stream unavailable at ${MCP_URL} (AC-02). Original: ${(err as Error).message}`,
    );
  }
}
