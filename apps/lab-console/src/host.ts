/**
 * Host HTTP API — alexa-lab control plane (:4000).
 *
 * VITE_HOST overrides the default (dev: http://localhost:4000); the trace WS
 * URL is derived from it (http→ws, path /trace).
 */
import type { ChaosPayload, Surface, TurnPayload } from "./types";

export const HOST_BASE = (
  import.meta.env["VITE_HOST"] ?? "http://localhost:4000"
).replace(/\/+$/, "");

export const TRACE_WS_URL = HOST_BASE.replace(/^http/, "ws") + "/trace";

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(HOST_BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A turn with no `text` is a config-only turn (e.g. mcpOn flip applied on the next turn). */
export function postTurn(payload: TurnPayload): Promise<Response> {
  return postJson("/turn", payload);
}

export function postChaos(payload: ChaosPayload): Promise<Response> {
  return postJson("/chaos", payload);
}

export function turnPayload(text: string | undefined, surface: Surface, mcpOn: boolean): TurnPayload {
  const p: TurnPayload = { surface, mcpOn };
  if (text !== undefined && text.length > 0) p.text = text;
  return p;
}
