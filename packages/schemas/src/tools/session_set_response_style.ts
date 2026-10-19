/**
 * session_set_response_style — blueprint §5.2 (row 5) and §6.5.
 * Set brevity for subsequent results; the host calls it with
 * style="brief", reason="barge_in" after an interruption (§6.5 step 4).
 * NOT readOnly, idempotent.
 */
import { z } from "zod";
import { responseStyleSchema, traceIdSchema } from "../primitives.js";

export const sessionSetResponseStyleInputSchema = z
  .object({
    style: responseStyleSchema,
    reason: z
      .string()
      .min(1)
      .describe(
        "Why the style changed, e.g. barge_in (user interrupted), short_answer, routine.",
      ),
  })
  .strict();
export type SessionSetResponseStyleInput = z.infer<
  typeof sessionSetResponseStyleInputSchema
>;

export const sessionSetResponseStyleOutputSchema = z
  .object({
    style: responseStyleSchema,
    applies_until: z
      .string()
      .datetime()
      .describe(
        "ISO-8601 UTC instant until which the style applies. CONTRACT DRAFT: blueprint §5.2 gives no type or expiry semantics — assumes the session-store TTL; AMBIGUITY flagged to ORCH (see docs/ARCHITECTURE.md).",
      ),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type SessionSetResponseStyleOutput = z.infer<
  typeof sessionSetResponseStyleOutputSchema
>;

export const sessionSetResponseStyleTool = {
  name: "session_set_response_style",
  title: "Set response style",
  description:
    "Set brevity for subsequent results: brief, normal, or detailed. Call with style='brief' and reason='barge_in' right after the user interrupts, so the next answer is short. Affects spoken tiers only (speak_short is answered first); it never changes decisions or confidence.",
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false,
    // openWorldHint omitted: blueprint §5.2 row 5 is silent → MCP default applies
    // [VERIFY R-SPEC-01].
  },
  inputSchema: sessionSetResponseStyleInputSchema,
  outputSchema: sessionSetResponseStyleOutputSchema,
} as const;
