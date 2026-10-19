/**
 * music_confirm_selection — blueprint §5.2 (row 3) and §6.3 learning step.
 * NOT readOnly; idempotent via idempotency_key (§8.6: "idempotency_key on
 * confirm and offline replay"); not destructive. Alias saving defaults to false
 * and requires user consent (§6.3, §9.1.2).
 */
import { z } from "zod";
import { traceIdSchema } from "../primitives.js";

export const musicConfirmSelectionInputSchema = z
  .object({
    resolution_id: z
      .string()
      .min(1)
      .describe("resolution_id from the music_resolve_request that was answered."),
    chosen_candidate_id: z
      .string()
      .min(1)
      .describe("The candidate the user chose (or that was finally played)."),
    remember_alias: z
      .boolean()
      .default(false)
      .describe(
        "Save 'when I say X I mean Y' for this household. Default false; only set true when the user explicitly consented (§6.3).",
      ),
    idempotency_key: z
      .string()
      .min(1)
      .describe(
        "Client-generated key; retrying with the same key returns the same receipt (§8.6).",
      ),
  })
  .strict();
export type MusicConfirmSelectionInput = z.infer<
  typeof musicConfirmSelectionInputSchema
>;

export const musicConfirmSelectionOutputSchema = z
  .object({
    receipt_id: z
      .string()
      .min(1)
      .describe("Action receipt id; answerable via music_explain_last_action (§6.7)."),
    alias_saved: z.boolean(),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type MusicConfirmSelectionOutput = z.infer<
  typeof musicConfirmSelectionOutputSchema
>;

export const musicConfirmSelectionTool = {
  name: "music_confirm_selection",
  title: "Confirm selection",
  description:
    "Record which candidate the user chose after an ask, or which track was finally played. Use when the user answered a disambiguation question or corrected a playback. Optionally remember an alias ('when I say X I mean Y') for this household — set remember_alias true ONLY when the user explicitly consented; default is false. Idempotent via idempotency_key: retrying the same key returns the same receipt.",
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: false,
    // openWorldHint omitted: blueprint §5.2 row 3 is silent → MCP default applies
    // [VERIFY R-SPEC-01].
  },
  inputSchema: musicConfirmSelectionInputSchema,
  outputSchema: musicConfirmSelectionOutputSchema,
} as const;
