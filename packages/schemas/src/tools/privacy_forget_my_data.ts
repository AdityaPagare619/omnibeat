/**
 * privacy_forget_my_data — blueprint §5.2 (privacy tool paragraph) and §6.7.
 * The eighth tool: destructive, idempotent. Deletes aliases and action
 * receipts for a household. Alias memory is opt-in, listable, deletable, with
 * a retention TTL (§6.7, §9.1.2).
 */
import { z } from "zod";
import { traceIdSchema } from "../primitives.js";

export const privacyForgetMyDataInputSchema = z
  .object({
    household_id: z
      .string()
      .min(1)
      .describe("Opaque household id whose aliases and receipts are deleted."),
  })
  .strict();
export type PrivacyForgetMyDataInput = z.infer<
  typeof privacyForgetMyDataInputSchema
>;

export const privacyForgetMyDataOutputSchema = z
  .object({
    aliases_deleted: z.number().int().min(0),
    receipts_deleted: z.number().int().min(0),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type PrivacyForgetMyDataOutput = z.infer<
  typeof privacyForgetMyDataOutputSchema
>;

export const privacyForgetMyDataTool = {
  name: "privacy_forget_my_data",
  title: "Forget my data",
  description:
    "Delete this household's stored aliases and action receipts. Destructive but idempotent: repeating the call is harmless and reports the same counts. Use ONLY on an explicit user request such as 'forget my data' or 'delete what you remember about us' — never preemptively, never on a low-confidence guess (blueprint §9.1.3/§9.1.4). Returns how many aliases and receipts were removed.",
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
    destructiveHint: true,
    // openWorldHint omitted: blueprint §5.2 privacy paragraph is silent →
    // MCP default applies [VERIFY R-SPEC-01].
  },
  inputSchema: privacyForgetMyDataInputSchema,
  outputSchema: privacyForgetMyDataOutputSchema,
} as const;
