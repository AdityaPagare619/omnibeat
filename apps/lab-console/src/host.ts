/**
 * Host HTTP API — alexa-lab control plane (:4000).
 *
 * CORS reality (checked live 2026-10-20): the host serves **no**
 * `Access-Control-Allow-Origin` header, and `OPTIONS /turn` 404s — so a page
 * on :3000 cannot read :4000 responses directly. The console therefore talks
 * to the **same origin** and lets the Vite dev/preview proxy forward
 * `/turn|/barge-in|/chaos|/state|/frames|/healthz|/probe` to VITE_HOST
 * (vite.config.ts). The WebSocket is exempt from CORS, so `/trace` connects
 * straight to the host — the frames the judge sees are the host's own.
 *
 *   VITE_HOST   proxy target / WS origin   (default http://localhost:4000)
 *   VITE_API_BASE  set when the console is served somewhere that already
 *                  proxies or serves the API (default "" = same origin)
 *   VITE_WS     explicit ws:// URL for the trace bus (default derived)
 */
import type { BargeInPayload, BargeInResponse, ChaosPayload, HealthResponse, StateResponse, Surface, TurnPayload, TurnResponse } from "./types";

export const HOST_BASE = (import.meta.env["VITE_HOST"] ?? "http://localhost:4000").replace(/\/+$/, "");

export const API_BASE = (import.meta.env["VITE_API_BASE"] ?? "").replace(/\/+$/, "");

export const TRACE_WS_URL =
  import.meta.env["VITE_WS"] ?? HOST_BASE.replace(/^http/, "ws") + "/trace";

async function requestJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await fetch(API_BASE + path, init);
    const body = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

function postJson<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; body: T | null }> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function postTurn(payload: TurnPayload): Promise<{ ok: boolean; status: number; body: TurnResponse | null }> {
  return postJson<TurnResponse>("/turn", payload);
}

export function postBargeIn(payload: BargeInPayload): Promise<{ ok: boolean; status: number; body: BargeInResponse | null }> {
  return postJson<BargeInResponse>("/barge-in", payload);
}

export function postChaos(payload: ChaosPayload): Promise<{ ok: boolean; status: number; body: unknown }> {
  return postJson<unknown>("/chaos", payload);
}

export function getState(): Promise<{ ok: boolean; status: number; body: StateResponse | null }> {
  return requestJson<StateResponse>("/state");
}

export function getHealth(): Promise<{ ok: boolean; status: number; body: HealthResponse | null }> {
  return requestJson<HealthResponse>("/healthz");
}

/** One turn body: `text` wins unless a fixture id is given (host rule). */
export function turnPayload(opts: {
  text?: string;
  fixtureId?: string;
  surface: Surface;
  mcpOn: boolean;
}): TurnPayload {
  const p: TurnPayload = { surface: opts.surface, mcpOn: opts.mcpOn };
  if (opts.fixtureId !== undefined && opts.fixtureId.length > 0) p.fixtureId = opts.fixtureId;
  else if (opts.text !== undefined && opts.text.length > 0) p.text = opts.text;
  return p;
}
