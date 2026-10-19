/**
 * music_explain_last_action — blueprint §5.2 (row 4) and §6.7.
 * "Why did you play that?" answered from the stored action receipt, never from
 * model memory, so it cannot be invented (§6.7).
 */
import { z } from "zod";
import {
  asrAlternativeSchema,
  confidenceSchema,
  traceIdSchema,
} from "../primitives.js";

export const musicExplainLastActionInputSchema = z
  .object({
    household_id: z
      .string()
      .min(1)
      .optional()
      .describe("Opaque household id; pass at least one identifier (household or session)."),
    session_id: z
      .string()
      .min(1)
      .optional()
      .describe("MCP session id; pass at least one identifier (household or session)."),
  })
  .strict();
export type MusicExplainLastActionInput = z.infer<
  typeof musicExplainLastActionInputSchema
>;

export const musicExplainLastActionOutputSchema = z
  .object({
    explanation: z.string().min(1),
    receipt: z
      .object({
        heard: z.string().min(1).describe("What was heard, as text (§6.7)."),
        alternatives: z.array(asrAlternativeSchema),
        confidence: confidenceSchema,
        trigger: z
          .enum(["voice", "routine", "external"])
          .describe("What triggered the action: voice vs routine vs external (§6.7)."),
        at: z
          .string()
          .datetime()
          .describe("When the action happened, ISO-8601 UTC (§6.7 stores the time)."),
      })
      .strict(),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type MusicExplainLastActionOutput = z.infer<
  typeof musicExplainLastActionOutputSchema
>;

export const musicExplainLastActionTool = {
  name: "music_explain_last_action",
  title: "Explain last action",
  description:
    "Answer 'why did you play that?' from the stored action receipt: what was heard (text), the alternatives, the confidence, and what triggered the action (voice, routine, or external). Use whenever the user asks why something played or doubts a choice. The explanation is generated from the receipt only — never invent a reason. If no receipt exists for the given identifiers, say so.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    // openWorldHint omitted: blueprint §5.2 row 4 is silent → MCP default applies
    // [VERIFY R-SPEC-01].
  },
  inputSchema: musicExplainLastActionInputSchema,
  outputSchema: musicExplainLastActionOutputSchema,
} as const;
