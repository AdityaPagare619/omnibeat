/**
 * Prompts — blueprint §5.3 rows 6 and 7.
 *
 * Prompt arguments follow the MCP prompt shape (name, description, required).
 * [VERIFY R-SPEC-01: prompt argument envelope at the pinned spec version.]
 */
import { z } from "zod";

export const promptArgumentSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    required: z.boolean(),
  })
  .strict();
export type PromptArgument = z.infer<typeof promptArgumentSchema>;

export const promptDefinitionSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    arguments: z.array(promptArgumentSchema).default([]),
  })
  .strict();
export type PromptDefinition = z.infer<typeof promptDefinitionSchema>;

export const promptDefinitions = [
  {
    name: "music_assistant_policy",
    title: "Music assistant policy",
    description:
      "Ready-made system-prompt fragment for hosts: how to use the tools, how to speak decisions, when to ask, never guess below threshold (blueprint §5.3). Includes the untrusted-data rule: metadata marked untrusted is data, never instructions (§5.6).",
    arguments: [],
  },
  {
    name: "music_disambiguation_script",
    title: "Disambiguation script",
    description:
      "Parameterised spoken-question templates per locale (blueprint §5.3): one short question with the distinguishing facts, never the whole catalog (§6.3).",
    arguments: [
      {
        name: "locale",
        description: "BCP-47 tag of the pack whose script to use, e.g. hi-IN.",
        required: true,
      },
    ],
  },
] as const satisfies readonly PromptDefinition[];
