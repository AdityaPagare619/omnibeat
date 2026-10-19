/**
 * Error model — blueprint §5.5.
 *
 * Two channels, deliberately kept apart:
 *
 *  1. PROTOCOL errors (bad params, unknown tool, auth) → JSON-RPC error objects.
 *     Code vocabulary is the five standard JSON-RPC 2.0 codes plus the
 *     blueprint-cited -32042 (URL elicitation required, blueprint §5.2/§5.4).
 *     No other code exists in this contract — inventing codes is forbidden
 *     (charter Part 12 anti-hallucination rules).
 *
 *  2. TOOL EXECUTION errors (upstream down, nothing found) → result with
 *     `isError: true` plus a machine-readable `code` (the six codes below, and
 *     only those) and a user-speakable `spoken_prompt` so the host LLM can
 *     recover (blueprint §5.5).
 */
import { z } from "zod";
import { spokenPromptSchema, traceIdSchema } from "./primitives.js";

/**
 * JSON-RPC 2.0 protocol error codes used by omnibeat-mcp.
 * The five standard codes are JSON-RPC 2.0 core (not MCP inventions);
 * -32042 is cited by the blueprint for URL-mode elicitation.
 * [VERIFY R-SPEC-04: -32042 semantics — is this the spec-defined code for
 * elicitation/URL mode, and what exactly belongs in `data`?]
 */
export const jsonRpcProtocolErrorCodeSchema = z.union([
  z.literal(-32700), // Parse error (JSON-RPC 2.0)
  z.literal(-32600), // Invalid Request (JSON-RPC 2.0)
  z.literal(-32601), // Method not found — e.g. unknown tool name (blueprint §5.5)
  z.literal(-32602), // Invalid params — strict Zod validation failure (blueprint §5.1)
  z.literal(-32603), // Internal error
  z.literal(-32042), // URL elicitation required (blueprint §5.2, §5.4) [VERIFY R-SPEC-04]
]);
export type JsonRpcProtocolErrorCode = z.infer<
  typeof jsonRpcProtocolErrorCodeSchema
>;

export const jsonRpcErrorSchema = z
  .object({
    code: jsonRpcProtocolErrorCodeSchema,
    message: z.string().min(1),
    data: z.unknown().optional(),
  })
  .strict();
export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>;

/**
 * The six machine-readable tool execution error codes (blueprint §5.5).
 * Exhaustive: no other `code` may ever appear in a tool result.
 *
 * - UPSTREAM_TIMEOUT     — provider/upstream call exceeded its budget (§6.1, §8.2)
 * - UPSTREAM_RATE_LIMITED— upstream 429 / our token bucket shed the request (§8.5)
 * - NO_CONFIDENT_MATCH   — resolver finished below thresholds (§6.1, §6.2)
 * - UNSUPPORTED_LOCALE   — no locale pack / recogniser locale not supported (§7.1);
 *                          which locales are supported depends on the recogniser
 *                          [VERIFY R-AWS-02]
 * - CONSENT_REQUIRED     — consent-gated operation (alias memory, privacy tool; §9.1.2)
 * - SESSION_EXPIRED      — session/store entry gone (§5.1 session semantics; §8.1)
 */
export const toolErrorCodeSchema = z.enum([
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_RATE_LIMITED",
  "NO_CONFIDENT_MATCH",
  "UNSUPPORTED_LOCALE",
  "CONSENT_REQUIRED",
  "SESSION_EXPIRED",
]);
export type ToolErrorCode = z.infer<typeof toolErrorCodeSchema>;

/**
 * Tool execution error result (blueprint §5.5): `isError: true` + machine-readable
 * `code` + speakable `spoken_prompt`.
 *
 * Contract-draft notes (flagged for Gate G1):
 *  - `spoken_prompt` uses the same three tiers as every other spoken string
 *    (blueprint §6.5 "every spoken string in tiers"); Appendix A does not
 *    pin the error-result shape, so this is a v0 contract choice.
 *  - Whether a CallToolResult with `isError: true` is exempt from the tool's
 *    declared `outputSchema` is an SDK/spec detail
 *    [VERIFY R-SPEC-01]; B-MCP picks the flattening (envelope flag vs
 *    structuredContent payload) at G1. This schema is the payload either way.
 */
export const toolErrorResultSchema = z
  .object({
    isError: z.literal(true),
    code: toolErrorCodeSchema,
    spoken_prompt: spokenPromptSchema,
    trace_id: traceIdSchema,
    detail: z.string().optional(),
  })
  .strict();
export type ToolErrorResult = z.infer<typeof toolErrorResultSchema>;
