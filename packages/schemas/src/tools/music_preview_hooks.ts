/**
 * music_preview_hooks — blueprint §5.2 (row 2) and §6.4.
 * Short audio hook samples for candidates: resource links to hook clips,
 * window per clip, method + confidence of the hook heuristic.
 */
import { z } from "zod";
import { confidenceSchema, traceIdSchema } from "../primitives.js";

export const musicPreviewHooksInputSchema = z
  .object({
    candidate_ids: z
      .array(z.string().min(1))
      .min(1)
      .describe("Candidate ids from music_resolve_request to build hooks for."),
    max_seconds: z
      .number()
      .min(1)
      .max(4)
      .default(3) // §6.4: "the 3 s window"; §5.2 caps at ≤4 s
      .describe("Maximum clip length in seconds (≤ 4). Default 3."),
  })
  .strict();
export type MusicPreviewHooksInput = z.infer<
  typeof musicPreviewHooksInputSchema
>;

export const musicPreviewHooksOutputSchema = z
  .object({
    clips: z.array(
      z
        .object({
          candidate_id: z.string().min(1),
          uri: z
            .string()
            .min(1)
            .describe("Resource URI, e.g. omnibeat://hooks/{candidate_id}.m4a"),
          mimeType: z.string().min(1),
          window: z
            .object({
              start_seconds: z.number().min(0),
              end_seconds: z.number().min(0),
            })
            .strict()
            .describe("Window inside the 30 s preview that was extracted (§6.4)."),
        })
        .strict(),
    ),
    method: z
      .string()
      .min(1)
      .describe(
        "Hook heuristic id, e.g. energy-flux-v1 (§6.4). Honest heuristic: a loud, dense section, not guaranteed to be the chorus.",
      ),
    confidence: confidenceSchema.describe(
      "Heuristic confidence; published hit rate lives in the eval report (§6.4).",
    ),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type MusicPreviewHooksOutput = z.infer<
  typeof musicPreviewHooksOutputSchema
>;

export const musicPreviewHooksTool = {
  name: "music_preview_hooks",
  title: "Preview hooks",
  description:
    "Return short audio hook samples (≤ 4 s, default 3 s) for the candidates of a resolution, for screen/TV cards or a sampled spoken question. Use after music_resolve_request returns ask, or to let the user hear versions apart before choosing. Returns resource links to ephemeral clips with the window used and the heuristic method and confidence. Preview-only: never offer downloads or redistribution. On screenless surfaces without a renderer for resource links, do not call this tool; the spoken prompt alone is enough.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
    // openWorldHint stated by blueprint §5.2 row 2.
  },
  inputSchema: musicPreviewHooksInputSchema,
  outputSchema: musicPreviewHooksOutputSchema,
} as const;
