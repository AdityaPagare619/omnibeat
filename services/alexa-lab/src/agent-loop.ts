/**
 * Agent loop — deterministic turn handler for POST /turn.
 *
 *   {text?, fixtureId?, surface?, mcpOn?}
 *     → ASR (fixture/typed, labelled)                       internal frame
 *     → mcpOn:true  → tools/call music_resolve_request via the MCP client
 *     → mcpOn:false → POST /admin/mode {naive:true} then the SAME tool
 *                      (one server-side code path for a real A/B),
 *                      naive mode restored afterwards (best effort)
 *     → parse + validate against the contract output schema
 *     → TTS marks, response
 *
 * Every branch emits frames; a failure returns an honest error body with the
 * breaker state — never a fabricated decision.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  localeSchema,
  musicResolveRequestTool,
  surfaceSchema,
  toolErrorResultSchema,
  type SourceBadge,
  type SpokenPrompt,
} from "@omnibeat/schemas";
import { recognize, type AsrLabel, type AsrResult } from "./asr.js";
import type { McpHostClient, McpError } from "./mcp-client.js";
import type { CircuitBreaker, BreakerSnapshot } from "./breaker.js";
import type { TraceBus } from "./trace-bus.js";
import type { TtsPlayer, SpeechMark } from "./tts.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";

export const turnRequestSchema = z
  .object({
    text: z.string().min(1).max(300).optional(),
    fixtureId: z.string().min(1).max(64).optional(),
    surface: surfaceSchema.default("screenless"),
    mcpOn: z.boolean().default(true),
    locale: localeSchema.optional(),
  })
  .strict();
export type TurnRequest = z.infer<typeof turnRequestSchema>;

export type TurnDecision = "play" | "ask" | "repair" | "not_found" | "error";

export interface TurnError {
  code: string;
  message: string;
  detail?: unknown;
}

export interface TurnResponse {
  traceId: string;
  badge: SourceBadge;
  asrLabel: AsrLabel;
  mode: "mcp" | "naive";
  heard: string;
  alternatives: { text: string; confidence?: number }[];
  decision: TurnDecision;
  spoken: string;
  spokenPrompt?: SpokenPrompt;
  candidates: unknown[];
  confidence: number;
  responseStyle: "brief" | "normal";
  tts: { playing: boolean; durationMs: number; marks: SpeechMark[]; words: number };
  latencyMs: number;
  mcp: ReturnType<McpHostClient["snapshot"]>;
  breaker: BreakerSnapshot;
  /** Client-side L3 rung: true only while the breaker is open. */
  edgeMode: boolean;
  error?: TurnError;
  track?: unknown;
  resolutionId?: string;
  evidence?: unknown[];
  degradationLevel?: string;
  serverTraceId?: string;
}

export interface AgentLoopDeps {
  bus: TraceBus;
  mcp: McpHostClient;
  breaker: CircuitBreaker;
  tts: TtsPlayer;
  fixturesDir: string;
}

interface Failure {
  status: number;
  error: TurnError;
  spoken: string;
}

const HONEST_SPEECH = {
  MCP_OFFLINE: "I can't reach the music service right now, so I won't guess. Please try again shortly.",
  MCP_CIRCUIT_OPEN: "The music service is being taken offline after repeated failures. I'll retry once it recovers.",
  MCP_TIMEOUT: "The music service took too long to answer, so I stopped rather than guess.",
  MCP_PROTOCOL_ERROR: "The music service answered in a way I couldn't understand, so I won't guess.",
  CHAOS_INJECTED: "A fault was injected on purpose for this demo, so no answer was produced.",
  ADMIN_MODE_UNREACHABLE: "I couldn't set up the baseline mode for this run, so I'm not answering.",
  ASR_FIXTURE_NOT_FOUND: "I don't have that transcript fixture, so I have nothing to act on.",
  ASR_FIXTURE_INVALID: "That transcript fixture is malformed, so I'm not acting on it.",
  ASR_NO_INPUT: "I didn't receive anything to listen to.",
  INVALID_TOOL_OUTPUT: "The music service returned a payload that breaks the contract, so I won't use it.",
  BAD_REQUEST: "That request wasn't shaped the way this host expects, so nothing was run.",
} as const satisfies Record<string, string>;

type HonestSpeechCode = keyof typeof HONEST_SPEECH;

/** Speakable honest string for an error code — never a fake success line. */
function honestSpeech(code: string, fallback: HonestSpeechCode = "MCP_PROTOCOL_ERROR"): string {
  return HONEST_SPEECH[code as HonestSpeechCode] ?? HONEST_SPEECH[fallback];
}

export class AgentLoop {
  private style: "brief" | "normal" = "normal";
  private turn = 0;

  constructor(private readonly deps: AgentLoopDeps) {}

  /** Barge-in flips this; the next turn sends style:"brief", then resets (§6.5). */
  setResponseStyle(style: "brief" | "normal"): void {
    this.style = style;
  }

  getResponseStyle(): "brief" | "normal" {
    return this.style;
  }

  async handleTurn(raw: unknown): Promise<{ status: number; body: TurnResponse }> {
    const { bus, mcp, breaker, tts, fixturesDir } = this.deps;
    const startedAt = Date.now();
    const traceId = `trn-${randomUUID().slice(0, 8)}`;
    const parsedReq = turnRequestSchema.safeParse(raw);
    if (!parsedReq.success) {
      return {
        status: 400,
        body: this.errorBody({
          traceId,
          badge: "FIXTURE",
          asrLabel: "TYPED",
          mode: "mcp",
          heard: "",
          alternatives: [],
          startedAt,
          error: {
            code: "BAD_REQUEST",
            message: "turn request failed schema validation",
            detail: parsedReq.error.issues,
          },
          spoken: honestSpeech("ASR_NO_INPUT"),
        }),
      };
    }
    const req = parsedReq.data;

    // ── ASR ────────────────────────────────────────────────────────────────
    let asr: AsrResult;
    try {
      asr = await recognize({
        fixtureId: req.fixtureId,
        text: req.text,
        ...(req.locale !== undefined ? { locale: req.locale } : {}),
        fixturesDir,
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "ASR_NO_INPUT";
      bus.setTurnContext(traceId, "FIXTURE");
      bus.emit({
        direction: "internal",
        method: "asr.failed",
        payload: {
          code,
          error: err instanceof Error ? err.message : String(err),
          fixtureId: req.fixtureId,
          hadText: Boolean(req.text),
        },
      });
      return {
        status: 400,
        body: this.errorBody({
          traceId,
          badge: "FIXTURE",
          asrLabel: "TYPED",
          mode: req.mcpOn ? "mcp" : "naive",
          heard: "",
          alternatives: [],
          startedAt,
          error: { code, message: err instanceof Error ? err.message : String(err) },
          spoken: honestSpeech(code, "ASR_NO_INPUT"),
        }),
      };
    }

    bus.setTurnContext(traceId, asr.badge);
    bus.emit({
      direction: "internal",
      method: "asr.recognized",
      payload: {
        heard: asr.heard,
        label: asr.label,
        fixtureId: asr.fixtureId,
        locale: asr.locale,
        alternatives: asr.alternatives,
        note: "transcript appears in trace payloads deliberately — the inspector is the transparency surface",
      },
    });

    // ── mode: MCP arm vs naive baseline arm ────────────────────────────────
    const mode: "mcp" | "naive" = req.mcpOn ? "mcp" : "naive";
    bus.emit({
      direction: "internal",
      method: "agent.mode",
      payload: {
        mode,
        mcpOn: req.mcpOn,
        note: req.mcpOn
          ? "MCP arm: tools/call music_resolve_request over the real transport"
          : "naive arm: POST /admin/mode {naive:true} then the SAME tool — one server-side code path",
        responseStyle: this.style,
      },
    });

    if (!req.mcpOn) {
      try {
        await mcp.setNaiveMode(true);
      } catch (err) {
        const failure = this.classifyFailure(err);
        bus.emit({
          direction: "internal",
          method: "agent.error",
          payload: { code: failure.error.code, message: failure.error.message, stage: "admin_mode" },
        });
        return {
          status: failure.status,
          body: this.errorBody({
            traceId,
            badge: asr.badge,
            asrLabel: asr.label,
            mode,
            heard: asr.heard,
            alternatives: asr.alternatives,
            startedAt,
            error: failure.error,
            spoken: failure.spoken,
          }),
        };
      }
    }

    // ── tools/call music_resolve_request ──────────────────────────────────
    const input = musicResolveRequestTool.inputSchema.safeParse({
      transcript: asr.heard,
      surface: req.surface,
      ...(asr.locale !== undefined ? { locale: asr.locale } : {}),
      ...(asr.alternatives.length > 0 ? { asr_alternatives: asr.alternatives } : {}),
      style: this.style,
    });
    if (!input.success) {
      const failure: Failure = {
        status: 400,
        error: {
          code: "BAD_REQUEST",
          message: "resolved tool input failed contract validation",
          detail: input.error.issues,
        },
        spoken: honestSpeech("ASR_NO_INPUT"),
      };
      bus.emit({
        direction: "internal",
        method: "agent.error",
        payload: { code: failure.error.code, message: failure.error.message, stage: "input" },
      });
      return {
        status: failure.status,
        body: this.errorBody({
          traceId,
          badge: asr.badge,
          asrLabel: asr.label,
          mode,
          heard: asr.heard,
          alternatives: asr.alternatives,
          startedAt,
          error: failure.error,
          spoken: failure.spoken,
        }),
      };
    }

    let result: CallToolResult;
    try {
      result = await mcp.callTool("music_resolve_request", input.data as Record<string, unknown>);
    } catch (err) {
      const failure = this.classifyFailure(err);
      bus.emit({
        direction: "internal",
        method: "agent.error",
        payload: {
          code: failure.error.code,
          message: failure.error.message,
          stage: "tools/call",
          mode,
        },
      });
      if (!req.mcpOn) await this.restoreNaiveMode(bus, mcp);
      return {
        status: failure.status,
        body: this.errorBody({
          traceId,
          badge: asr.badge,
          asrLabel: asr.label,
          mode,
          heard: asr.heard,
          alternatives: asr.alternatives,
          startedAt,
          error: failure.error,
          spoken: failure.spoken,
        }),
      };
    }

    if (!req.mcpOn) await this.restoreNaiveMode(bus, mcp);

    // ── tool error result (isError) — six contract codes only ─────────────
    if (result.isError) {
      const payload = extractPayload(result);
      const toolErr = toolErrorResultSchema.safeParse(payload);
      const code = toolErr.success
        ? toolErr.data.code
        : "UPSTREAM_TIMEOUT";
      const spoken = toolErr.success
        ? toolErr.data.spoken_prompt.speak_normal
        : "The music service reported an error I couldn't recover from.";
      bus.emit({
        direction: "internal",
        method: "agent.error",
        payload: {
          code,
          stage: "tool_result.isError",
          detail: toolErr.success ? toolErr.data.detail : payload,
        },
      });
      return {
        status: 200,
        body: this.errorBody({
          traceId,
          badge: asr.badge,
          asrLabel: asr.label,
          mode,
          heard: asr.heard,
          alternatives: asr.alternatives,
          startedAt,
          error: { code, message: "tool returned isError" },
          spoken,
          confidence: 0,
        }),
      };
    }

    // ── contract validation of the output ─────────────────────────────────
    const payload = extractPayload(result);
    const out = musicResolveRequestTool.outputSchema.safeParse(payload);
    if (!out.success) {
      const failure: Failure = {
        status: 502,
        error: {
          code: "INVALID_TOOL_OUTPUT",
          message: "music_resolve_request result failed contract validation",
          detail: out.error.issues.slice(0, 5),
        },
        spoken: honestSpeech("INVALID_TOOL_OUTPUT"),
      };
      bus.emit({
        direction: "internal",
        method: "agent.error",
        payload: { code: failure.error.code, message: failure.error.message, stage: "output" },
      });
      return {
        status: failure.status,
        body: this.errorBody({
          traceId,
          badge: asr.badge,
          asrLabel: asr.label,
          mode,
          heard: asr.heard,
          alternatives: asr.alternatives,
          startedAt,
          error: failure.error,
          spoken: failure.spoken,
        }),
      };
    }

    const spoken = out.data.spoken_prompt.speak_normal;
    const candidates = out.data.candidates ?? (out.data.track ? [out.data.track] : []);
    const marks = tts.start(spoken, traceId);

    bus.emit({
      direction: "internal",
      method: "agent.decision",
      payload: {
        decision: out.data.decision,
        confidence: out.data.confidence,
        candidateCount: candidates.length,
        tool: "music_resolve_request",
        mode,
        spoken,
        responseStyle: this.style,
        serverTraceId: out.data.trace_id,
      },
    });
    bus.emit({
      direction: "internal",
      method: "tts.started",
      payload: {
        words: marks.marks.length,
        durationMs: marks.durationMs,
        marksPerWord: marks.marks[0] ? marks.marks[0].endMs - marks.marks[0].startMs : null,
        engine: "synthetic (no Polly — ESC-001)",
      },
    });

    // One-shot: brief applies to the interrupted turn's successor only (§6.5).
    const appliedStyle = this.style;
    this.style = "normal";

    const breakerSnapshot = breaker.snapshot();
    const body: TurnResponse = {
      traceId,
      badge: asr.badge,
      asrLabel: asr.label,
      mode,
      heard: asr.heard,
      alternatives: asr.alternatives,
      decision: out.data.decision,
      spoken,
      spokenPrompt: out.data.spoken_prompt,
      candidates,
      confidence: out.data.confidence,
      responseStyle: appliedStyle,
      tts: {
        playing: marks.playing,
        durationMs: marks.durationMs,
        marks: marks.marks,
        words: marks.marks.length,
      },
      latencyMs: Date.now() - startedAt,
      mcp: mcp.snapshot(),
      breaker: breakerSnapshot,
      edgeMode: breakerSnapshot.edgeMode,
      ...(out.data.track !== undefined ? { track: out.data.track } : {}),
      ...(out.data.resolution_id !== undefined ? { resolutionId: out.data.resolution_id } : {}),
      ...(out.data.evidence !== undefined ? { evidence: out.data.evidence } : {}),
      ...(out.data.degradation_level !== undefined
        ? { degradationLevel: out.data.degradation_level }
        : {}),
      serverTraceId: out.data.trace_id,
    };

    logger.info("turn resolved", {
      traceId,
      mode,
      decision: out.data.decision,
      confidence: out.data.confidence,
      badge: asr.badge,
      asrLabel: asr.label,
      latencyMs: body.latencyMs,
      breaker: breakerSnapshot.state,
    });
    this.turn += 1;

    return { status: 200, body };
  }

  private async restoreNaiveMode(bus: TraceBus, mcp: McpHostClient): Promise<void> {
    try {
      await mcp.setNaiveMode(false);
      bus.emit({
        direction: "internal",
        method: "agent.mode_restored",
        payload: { naive: false, note: "baseline toggle restored for the next turn" },
      });
    } catch (err) {
      // Honest: the toggle may be stuck; the next turn's A/B must know.
      bus.emit({
        direction: "internal",
        method: "agent.mode_restore_failed",
        payload: {
          code: (err as { code?: string }).code ?? "ADMIN_MODE_UNREACHABLE",
          error: err instanceof Error ? err.message : String(err),
          note: "server-side naive mode may still be ON — next naive turn re-applies it",
        },
      });
    }
  }

  private classifyFailure(err: unknown): Failure {
    const code = (err as McpError)?.code ?? "MCP_PROTOCOL_ERROR";
    const message = err instanceof Error ? err.message : String(err);
    const status =
      code === "MCP_OFFLINE" ||
      code === "MCP_TIMEOUT" ||
      code === "MCP_CIRCUIT_OPEN" ||
      code === "CHAOS_INJECTED" ||
      code === "ADMIN_MODE_UNREACHABLE"
        ? 503
        : 502;
    return {
      status,
      error: { code, message },
      spoken: honestSpeech(code),
    };
  }

  private errorBody(args: {
    traceId: string;
    badge: SourceBadge;
    asrLabel: AsrLabel;
    mode: "mcp" | "naive";
    heard: string;
    alternatives: { text: string; confidence?: number }[];
    startedAt: number;
    error: TurnError;
    spoken: string;
    confidence?: number;
  }): TurnResponse {
    const breakerSnapshot = this.deps.breaker.snapshot();
    return {
      traceId: args.traceId,
      badge: args.badge,
      asrLabel: args.asrLabel,
      mode: args.mode,
      heard: args.heard,
      alternatives: args.alternatives,
      decision: "error",
      spoken: args.spoken,
      candidates: [],
      confidence: args.confidence ?? 0,
      responseStyle: this.style,
      tts: { playing: false, durationMs: 0, marks: [], words: 0 },
      latencyMs: Date.now() - args.startedAt,
      mcp: this.deps.mcp.snapshot(),
      breaker: breakerSnapshot,
      edgeMode: breakerSnapshot.edgeMode,
      error: args.error,
    };
  }
}

/** structuredContent wins; falls back to the first text content block. */
export function extractPayload(
  result: CallToolResult | { structuredContent?: Record<string, unknown>; content?: unknown },
): unknown {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const content = Array.isArray(result.content)
    ? (result.content as { type?: string; text?: string }[])
    : [];
  const text = content.find((c) => c?.type === "text")?.text;
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
