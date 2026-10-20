/**
 * The eight tool handlers (blueprint 5.2 catalog, contract: @omnibeat/schemas).
 *
 * Rules applied by every handler:
 *  - INPUT: strict Zod validation; failure = protocol error -32602 Invalid
 *    params (blueprint 5.5), never a silent coercion.
 *  - OUTPUT: validated against the tool's outputSchema before it leaves; a
 *    failure becomes an isError tool result (never a crash).
 *  - EXECUTION failures: isError:true + one of the six contract codes + a
 *    spoken_prompt (blueprint 5.5). `account_link_music_service` is the one
 *    deliberate exception: it returns protocol error -32042 with
 *    data.elicitations (spec-conformant URL-mode elicitation, CLM-SPEC-015/016).
 *  - Never log transcripts at info level (blueprint 8.8 principle 7).
 */
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  ErrorCode,
  McpError,
  UrlElicitationRequiredError,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { SpokenPrompt, ToolErrorCode, ToolErrorResult, Track } from "@omnibeat/schemas";
import { log, transcriptField } from "../logging.js";
import { resolveRequest } from "../resolver/resolve.js";
import { sanitizeWebText } from "../resolver/hygiene.js";
import { tokenize } from "../resolver/scoring.js";
import { loadOfflinePool } from "../adapters/replay.js";
import type { LabConfig } from "../config.js";
import type { OmniBeatStore } from "../store/store.js";
import {
  accountLinkMusicServiceInputSchema,
  musicConfirmSelectionInputSchema,
  musicConfirmSelectionOutputSchema,
  musicExplainLastActionInputSchema,
  musicExplainLastActionOutputSchema,
  musicPlanOfflineCacheInputSchema,
  musicPlanOfflineCacheOutputSchema,
  musicPreviewHooksInputSchema,
  musicPreviewHooksOutputSchema,
  musicResolveRequestInputSchema,
  musicResolveRequestOutputSchema,
  privacyForgetMyDataInputSchema,
  privacyForgetMyDataOutputSchema,
  sessionSetResponseStyleInputSchema,
  sessionSetResponseStyleOutputSchema,
  type AccountLinkMusicServiceInput,
  type MusicConfirmSelectionInput,
  type MusicExplainLastActionInput,
  type MusicPlanOfflineCacheInput,
  type MusicPreviewHooksInput,
  type MusicResolveRequestInput,
  type PrivacyForgetMyDataInput,
  type SessionSetResponseStyleInput,
} from "../contract.js";

export interface AdminState {
  naive: boolean;
}

export interface ToolHandlerContext {
  cfg: LabConfig;
  store: OmniBeatStore;
  admin: AdminState;
}

export interface ToolExtra {
  signal: AbortSignal;
  sessionId?: string;
}

export type ToolHandler = (args: unknown, extra: ToolExtra) => Promise<CallToolResult>;

/** Speakable recovery strings for the six contract error codes (blueprint 5.5). */
const SPOKEN: Record<ToolErrorCode, SpokenPrompt> = {
  UPSTREAM_TIMEOUT: {
    speak_short: "The music service didn't answer in time.",
    speak_normal: "I couldn't reach the music service in time; want me to try again?",
    speak_long:
      "The music service didn't answer within my time budget, so I stopped waiting rather than hang. Say try again and I'll run it once more.",
  },
  UPSTREAM_RATE_LIMITED: {
    speak_short: "The music service is busy right now.",
    speak_normal: "The music service is rate-limited right now; try again in a moment.",
    speak_long:
      "I'm being rate-limited by the music catalog, so I held the request back instead of hammering it. Try again in a few seconds.",
  },
  NO_CONFIDENT_MATCH: {
    speak_short: "I didn't find a confident match.",
    speak_normal: "I couldn't match that confidently. Try a different title, or the artist.",
    speak_long:
      "Nothing in the catalog matched closely enough to trust, so I'd rather ask than play the wrong song. Try another title, or say the artist.",
  },
  UNSUPPORTED_LOCALE: {
    speak_short: "That language isn't supported yet.",
    speak_normal: "I don't have a language pack for that locale yet; try English for now.",
    speak_long:
      "I don't have a language pack for that recogniser locale yet, so I can't resolve it safely. Try the request in English and I'll look it up.",
  },
  CONSENT_REQUIRED: {
    speak_short: "I need your OK first.",
    speak_normal: "I need your explicit consent before I remember or change that.",
    speak_long:
      "I need your explicit consent before I store or delete that. Say yes if you want me to go ahead.",
  },
  SESSION_EXPIRED: {
    speak_short: "I lost that session's context.",
    speak_normal: "I don't have that stored context any more; ask me again from the start.",
    speak_long:
      "I don't have that stored context any more - it may have been deleted or the session may have ended. Ask me again and I'll start fresh.",
  },
};

function traceId(): string {
  return `tr_${randomUUID()}`;
}

function issuesOf(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
}

/** Strict input validation -> -32602 Invalid params (blueprint 5.5). */
function parseInput<T>(args: unknown, schema: z.ZodTypeAny): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid params: ${issuesOf(parsed.error)}`);
  }
  return parsed.data as T;
}

function errorResult(code: ToolErrorCode, trace: string, detail?: string): CallToolResult {
  const payload: ToolErrorResult = {
    isError: true,
    code,
    spoken_prompt: SPOKEN[code],
    trace_id: trace,
  };
  if (detail !== undefined) payload.detail = detail;
  // Error payloads travel as text content only: `structuredContent` is reserved
  // for results that conform to the declared outputSchema.
  return { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true };
}

/**
 * Last-resort conversion of an unexpected handler exception into a contract
 * tool error (blueprint 5.5: tool execution failures never surface as raw
 * exceptions; the six codes are exhaustive, so this maps to UPSTREAM_TIMEOUT
 * and keeps the true cause in `detail`).
 */
export function unexpectedToolError(error: unknown, trace: string): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return errorResult(
    "UPSTREAM_TIMEOUT",
    trace,
    `unexpected handler failure mapped to nearest contract code: ${message}`,
  );
}

function okResult(output: unknown, schema: z.ZodTypeAny, trace: string): CallToolResult {
  const parsed = schema.safeParse(output);
  if (!parsed.success) {
    const detail = issuesOf(parsed.error);
    log.error("tool_output_invalid", { trace_id: trace, detail });
    return errorResult("UPSTREAM_TIMEOUT", trace, `output failed contract validation: ${detail}`);
  }
  return {
    content: [{ type: "text", text: JSON.stringify(parsed.data) }],
    structuredContent: parsed.data as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------

export function createToolHandlers(ctx: ToolHandlerContext): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  // 1. music_resolve_request ------------------------------------------------
  handlers.set("music_resolve_request", async (args, extra) => {
    const input = parseInput<MusicResolveRequestInput>(
      args,
      musicResolveRequestInputSchema,
    );
    const outcome = await resolveRequest(input, {
      cfg: ctx.cfg,
      store: ctx.store,
      sessionId: extra.sessionId,
      naive: ctx.admin.naive,
      cancelSignal: extra.signal,
    });
    if (!outcome.ok) {
      return {
        content: [{ type: "text", text: JSON.stringify(outcome.error) }],
        isError: true,
      };
    }
    return okResult(outcome.output, musicResolveRequestOutputSchema, outcome.output.trace_id);
  });

  // 2. music_preview_hooks ---------------------------------------------------
  handlers.set("music_preview_hooks", async (args, extra) => {
    const input = parseInput<MusicPreviewHooksInput>(
      args,
      musicPreviewHooksInputSchema,
    );
    const trace = traceId();
    // Honest scope: no server-side audio analysis exists in P1. We return the
    // fixed default window inside a preview (2.5 s .. 2.5 s + max_seconds) and
    // label the method "fixture-window". We do NOT claim chorus detection and
    // do not claim the energy-flux heuristic ran (blueprint 6.4 step 3).
    const clips = input.candidate_ids.map((candidateId) => ({
      candidate_id: candidateId,
      uri: `omnibeat://hooks/${candidateId}.m4a`,
      mimeType: "audio/mp4",
      window: { start_seconds: 2.5, end_seconds: 2.5 + input.max_seconds },
    }));
    log.info("preview_hooks", {
      trace_id: trace,
      clips: clips.length,
      max_seconds: input.max_seconds,
      method: "fixture-window",
      session_id: extra.sessionId,
    });
    return okResult(
      { clips, method: "fixture-window", confidence: 0.35, trace_id: trace },
      musicPreviewHooksOutputSchema,
      trace,
    );
  });

  // 3. music_confirm_selection ----------------------------------------------
  handlers.set("music_confirm_selection", async (args, extra) => {
    const input = parseInput<MusicConfirmSelectionInput>(
      args,
      musicConfirmSelectionInputSchema,
    );
    const trace = traceId();

    // Idempotency (blueprint 8.6): same key -> same receipt.
    const existing = ctx.store.getReceiptByIdempotencyKey(input.idempotency_key);
    if (existing) {
      log.info("confirm_idempotent_replay", {
        trace_id: trace,
        receipt_id: existing.receipt_id,
        session_id: extra.sessionId,
      });
      return okResult(
        {
          receipt_id: existing.receipt_id,
          alias_saved: existing.alias_saved === 1,
          trace_id: trace,
        },
        musicConfirmSelectionOutputSchema,
        trace,
      );
    }

    const resolution = ctx.store.getResolution(input.resolution_id);
    if (!resolution) {
      return errorResult(
        "SESSION_EXPIRED",
        trace,
        `unknown resolution_id "${input.resolution_id}" - no stored resolution to confirm`,
      );
    }

    let candidates: Track[] = [];
    try {
      candidates = JSON.parse(resolution.candidates_json) as Track[];
    } catch {
      candidates = [];
    }
    const chosen = candidates.find((c) => c.candidate_id === input.chosen_candidate_id);

    const receipt = ctx.store.insertReceipt({
      idempotency_key: input.idempotency_key,
      resolution_id: input.resolution_id,
      session_id: extra.sessionId ?? null,
      household_id: resolution.household_id,
      chosen_candidate_id: input.chosen_candidate_id,
      chosen_title: chosen ? sanitizeWebText(chosen.title) : input.chosen_candidate_id,
      chosen_artist: chosen ? sanitizeWebText(chosen.artist) : "unknown",
      heard_text: resolution.heard_text,
      alternatives_json: resolution.alternatives_json,
      confidence: resolution.confidence,
      // CONTRACT DRAFT: a resolve call reached us through voice; routine and
      // external triggers arrive with host metadata we do not have in P1.
      trigger: "voice",
      trace_id: trace,
      ts: new Date().toISOString(),
    });

    let aliasSaved = false;
    if (input.remember_alias) {
      if (!resolution.household_id) {
        log.warn("alias_not_saved", {
          trace_id: trace,
          receipt_id: receipt.receipt_id,
          reason: "no household_id on the resolution - alias memory is household-scoped",
        });
      } else {
        try {
          const now = Date.now();
          ctx.store.insertAlias({
            household_id: resolution.household_id,
            alias_text: sanitizeWebText(resolution.heard_text),
            target_candidate_id: input.chosen_candidate_id,
            resolution_id: input.resolution_id,
            created_at: new Date(now).toISOString(),
            expires_at: new Date(now + ctx.cfg.base.memory.aliasRetentionDays * 86_400_000).toISOString(),
          });
          ctx.store.markAliasSaved(receipt.receipt_id);
          aliasSaved = true;
        } catch (err) {
          log.error("alias_insert_failed", {
            trace_id: trace,
            error: String((err as Error)?.message ?? err),
          });
        }
      }
    }

    log.info("confirm_selection", {
      trace_id: trace,
      receipt_id: receipt.receipt_id,
      resolution_id: input.resolution_id,
      alias_saved: aliasSaved,
      household_id: resolution.household_id,
      session_id: extra.sessionId,
      ...transcriptField(resolution.heard_text),
    });

    return okResult(
      { receipt_id: receipt.receipt_id, alias_saved: aliasSaved, trace_id: trace },
      musicConfirmSelectionOutputSchema,
      trace,
    );
  });

  // 4. music_explain_last_action --------------------------------------------
  handlers.set("music_explain_last_action", async (args, extra) => {
    const input = parseInput<MusicExplainLastActionInput>(
      args,
      musicExplainLastActionInputSchema,
    );
    const trace = traceId();
    if (!input.household_id && !input.session_id) {
      return errorResult(
        "SESSION_EXPIRED",
        trace,
        "pass household_id or session_id so the stored receipt can be located",
      );
    }
    const receipt = ctx.store.latestReceipt({
      ...(input.household_id ? { household_id: input.household_id } : {}),
      ...(input.session_id ? { session_id: input.session_id } : {}),
    });
    if (!receipt) {
      return errorResult(
        "SESSION_EXPIRED",
        trace,
        `no receipt stored for ${
          input.household_id ? `household ${input.household_id}` : `session ${input.session_id}`
        }`,
      );
    }

    let alternatives: { text: string; confidence?: number }[] = [];
    try {
      const parsed = JSON.parse(receipt.alternatives_json) as unknown;
      if (Array.isArray(parsed)) {
        alternatives = parsed
          .filter(
            (a): a is { text: string; confidence?: number } =>
              typeof a === "object" && a !== null && typeof (a as { text?: unknown }).text === "string",
          )
          .map((a) => ({
            text: a.text,
            ...(typeof a.confidence === "number" ? { confidence: a.confidence } : {}),
          }));
      }
    } catch {
      alternatives = [];
    }

    // Explanation from receipt fields ONLY (blueprint 6.7: never invented).
    const explanation = `At ${receipt.ts} (${receipt.trigger}) I played "${receipt.chosen_title}" by ${receipt.chosen_artist} because you said "${receipt.heard_text}" and that matched with confidence ${receipt.confidence}. This is read from the stored receipt, not from model memory.`;

    log.info("explain_last_action", {
      trace_id: trace,
      receipt_id: receipt.receipt_id,
      session_id: extra.sessionId,
    });

    return okResult(
      {
        explanation,
        receipt: {
          heard: receipt.heard_text,
          alternatives,
          confidence: receipt.confidence,
          trigger: receipt.trigger,
          at: receipt.ts,
        },
        trace_id: trace,
      },
      musicExplainLastActionOutputSchema,
      trace,
    );
  });

  // 5. session_set_response_style -------------------------------------------
  handlers.set("session_set_response_style", async (args, extra) => {
    const input = parseInput<SessionSetResponseStyleInput>(
      args,
      sessionSetResponseStyleInputSchema,
    );
    const trace = traceId();
    const sessionId = extra.sessionId;
    if (sessionId === undefined) {
      return errorResult("SESSION_EXPIRED", trace, "no MCP session attached to this call");
    }
    // CONTRACT DRAFT (DEC-0011): applies_until = now + 30 min, session-scoped.
    const appliesUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    ctx.store.setStyle(sessionId, input.style, input.reason, appliesUntil);
    log.info("set_response_style", {
      trace_id: trace,
      style: input.style,
      reason: input.reason,
      applies_until: appliesUntil,
      session_id: sessionId,
    });
    return okResult(
      { style: input.style, applies_until: appliesUntil, trace_id: trace },
      sessionSetResponseStyleOutputSchema,
      trace,
    );
  });

  // 6. music_plan_offline_cache ---------------------------------------------
  handlers.set("music_plan_offline_cache", async (args, extra) => {
    const input = parseInput<MusicPlanOfflineCacheInput>(
      args,
      musicPlanOfflineCacheInputSchema,
    );
    const trace = traceId();
    const pool = loadOfflinePool();
    const wanted = input.slots.emergency + input.slots.next_up;
    const moodTokens = input.mood_hint ? tokenize(input.mood_hint) : [];
    const moodScore = (tags: string[]): number =>
      moodTokens.length === 0
        ? 0
        : tags.filter((t) => moodTokens.includes(tokenize(t).join(" "))).length;

    // Emergency slots fill first, then next-up; only `cacheable` rows are even
    // considered (licensing: EVIDENCE_SUMMARY 4 - provider previews never).
    const ranked = pool.items
      .filter((item) => item.cacheable)
      .map((item, index) => ({ item, index, score: moodScore(item.tags) }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));

    const items: { track: Track; url: string; bytes: number; ttl_seconds: number }[] = [];
    let bytesUsed = 0;
    let cancelled = false;
    for (const { item } of ranked) {
      if (extra.signal.aborted) {
        cancelled = true;
        break;
      }
      if (items.length >= wanted) break;
      if (bytesUsed + item.bytes > input.byte_budget) continue;
      items.push({
        track: item.track,
        url: item.url,
        bytes: item.bytes,
        ttl_seconds: item.ttl_seconds,
      });
      bytesUsed += item.bytes;
    }

    const expiresAt = new Date(Date.now() + ctx.cfg.base.caches.catalogTtlMs).toISOString();
    log.info("offline_plan_built", {
      trace_id: trace,
      items: items.length,
      bytes_used: bytesUsed,
      byte_budget: input.byte_budget,
      pool_size: pool.items.length,
      cancelled,
      session_id: extra.sessionId,
    });
    // `task` is deliberately omitted: tasks are experimental at the pinned
    // spec/SDK (CLM-SPEC-010) and ADR-0001's fallback is to return the plan
    // itself; progress notifications are cut for P1. No fake task handle.
    return okResult(
      { plan: { items, expires_at: expiresAt }, trace_id: trace },
      musicPlanOfflineCacheOutputSchema,
      trace,
    );
  });

  // 7. account_link_music_service -------------------------------------------
  handlers.set("account_link_music_service", async (args) => {
    const input = parseInput<AccountLinkMusicServiceInput>(
      args,
      accountLinkMusicServiceInputSchema,
    );
    const trace = traceId();
    const elicitationId = `eli_${randomUUID()}`;
    log.info("account_link_elicitation", {
      trace_id: trace,
      provider: input.provider,
      elicitation_id: elicitationId,
    });
    // Spec-conformant -32042: error.data MUST carry `elicitations` (URL-mode
    // params with elicitationId) - bare -32042 is non-conformant
    // (CLM-SPEC-015/016). OAuth stays in the browser: no tokens here.
    throw new UrlElicitationRequiredError(
      [
        {
          mode: "url",
          elicitationId,
          url: `https://example.com/link/${elicitationId}`,
          message: `Open this link to sign in to ${input.provider} in your browser. No tokens or codes pass through the model.`,
        },
      ],
      `URL elicitation required to link ${input.provider}`,
    );
  });

  // 8. privacy_forget_my_data ------------------------------------------------
  handlers.set("privacy_forget_my_data", async (args, extra) => {
    const input = parseInput<PrivacyForgetMyDataInput>(
      args,
      privacyForgetMyDataInputSchema,
    );
    const trace = traceId();
    const counts = ctx.store.forgetHousehold(input.household_id);
    // Idempotent: a repeat call deletes nothing more and honestly reports 0/0.
    log.info("privacy_forget", {
      trace_id: trace,
      household_id: input.household_id,
      aliases_deleted: counts.aliases_deleted,
      receipts_deleted: counts.receipts_deleted,
      session_id: extra.sessionId,
    });
    return okResult({ ...counts, trace_id: trace }, privacyForgetMyDataOutputSchema, trace);
  });

  return handlers;
}
