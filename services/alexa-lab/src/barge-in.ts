/**
 * Barge-in — POST /barge-in {atMs}.
 *
 * State machine: TTS is "playing" only while an utterance timer is armed
 * (src/tts.ts). An interrupt while playing cuts playback at the last word
 * index whose start has passed, emits a `notifications/cancelled` frame in
 * JSON-RPC shape, and asks the server for brevity via
 * `session_set_response_style {style:"brief", reason:"barge_in"}` (§6.5 step 4).
 *
 * If nothing is playing the answer is honestly `cancelled:false` — no style
 * call, no invented cut.
 */
import { TtsPlayer, wordIndexAt, wordsCompletedAt, type SpeechMark } from "./tts.js";
import type { TraceBus } from "./trace-bus.js";
import type { McpHostClient } from "./mcp-client.js";
import type { AgentLoop } from "./agent-loop.js";
import { logger } from "./logger.js";

export interface BargeInResult {
  cancelled: boolean;
  cutAtWord: number | null;
  atMs: number;
  reason: string;
  wordsCompleted: number;
  cutWord: string | null;
  traceId: string | null;
  style: { style: string; appliesUntil?: string } | null;
  styleError: { code: string; message: string } | null;
}

export interface BargeInDeps {
  bus: TraceBus;
  tts: TtsPlayer;
  mcp: McpHostClient;
  loop: AgentLoop;
}

export class BargeInController {
  constructor(private readonly deps: BargeInDeps) {}

  async cut(atMs: number, traceIdHint?: string): Promise<BargeInResult> {
    const { bus, tts, mcp, loop } = this.deps;
    const traceId = traceIdHint ?? tts.currentTraceId() ?? null;

    if (!Number.isFinite(atMs) || atMs < 0) {
      bus.emit({
        direction: "internal",
        method: "barge_in.rejected",
        payload: { code: "BAD_AT_MS", atMs, reason: "atMs must be a non-negative number" },
      });
      return {
        cancelled: false,
        cutAtWord: null,
        atMs,
        reason: "bad_at_ms",
        wordsCompleted: 0,
        cutWord: null,
        traceId,
        style: null,
        styleError: null,
      };
    }

    if (!tts.isPlaying()) {
      // Nothing playing: honest refusal, no style change.
      bus.emit({
        direction: "internal",
        method: "barge_in.rejected",
        payload: { atMs, reason: "tts_idle", note: "no utterance in flight — nothing was cut" },
      });
      return {
        cancelled: false,
        cutAtWord: null,
        atMs,
        reason: "tts_idle",
        wordsCompleted: 0,
        cutWord: null,
        traceId,
        style: null,
        styleError: null,
      };
    }

    const cut = tts.cut(atMs);
    const marks: SpeechMark[] = cut.marks;
    const cutAtWord = cut.cutAtWord >= 0 ? cut.cutAtWord : 0;
    const wordsCompleted = wordsCompletedAt(marks, atMs);
    const cutWord = marks[cutAtWord]?.word ?? null;

    // notifications/cancelled — JSON-RPC notification shape (spec §3.10).
    const requestId = mcp.lastToolsCallRequestId();
    const inFlight = mcp.pendingRequestCount("tools/call") > 0;
    bus.emit({
      direction: "host→mcp",
      method: "notifications/cancelled",
      ...(traceId ? { traceId } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      payload: {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: {
          requestId: requestId ?? null,
          reason: `barge_in at ${atMs}ms → cut at word ${cutAtWord} of ${marks.length}`,
        },
        inFlight,
        cutAtWord,
        wordsCompleted,
        marks: marks.map((m) => ({ index: m.index, startMs: m.startMs, endMs: m.endMs })),
      },
    });

    // Ask the server for brevity on the next answer (§6.5 step 4).
    let style: BargeInResult["style"] = null;
    let styleError: BargeInResult["styleError"] = null;
    try {
      const out = await mcp.callTool("session_set_response_style", {
        style: "brief",
        reason: "barge_in",
      });
      const payload = extractPayload(out);
      style = {
        style: typeof payload?.style === "string" ? payload.style : "brief",
        ...(typeof payload?.applies_until === "string" ? { appliesUntil: payload.applies_until } : {}),
      };
      loop.setResponseStyle("brief");
      bus.emit({
        direction: "internal",
        method: "session.style.brief",
        ...(traceId ? { traceId } : {}),
        payload: { reason: "barge_in", appliesUntil: style.appliesUntil ?? null, applied: true },
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "MCP_PROTOCOL_ERROR";
      const message = err instanceof Error ? err.message : String(err);
      styleError = { code, message };
      loop.setResponseStyle("brief"); // local policy still applies
      bus.emit({
        direction: "internal",
        method: "session.style.failed",
        ...(traceId ? { traceId } : {}),
        payload: {
          code,
          error: message,
          note: "server-side style change NOT applied; host keeps brief locally",
        },
      });
      logger.warn("barge-in style call failed", { code, error: message });
    }

    return {
      cancelled: true,
      cutAtWord,
      atMs,
      reason: "interrupted",
      wordsCompleted,
      cutWord,
      traceId,
      style,
      styleError,
    };
  }
}

function extractPayload(result: { structuredContent?: Record<string, unknown>; content?: unknown }): Record<string, unknown> | null {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const content = Array.isArray(result.content)
    ? (result.content as { type?: string; text?: string }[])
    : [];
  const text = content.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export { wordIndexAt };
