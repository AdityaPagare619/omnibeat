/**
 * music_plan_offline_cache — blueprint §5.2 (row 6), §6.6 (R1 server side).
 * Task-augmented: returns a task handle, reports progress, cancellable
 * (blueprint §5.1 "task support for music_plan_offline_cache [VERIFY]",
 * §6.6, §8.3).
 *
 * NOT readOnly, idempotent, openWorld (§5.2 row 6).
 */
import { z } from "zod";
import { traceIdSchema } from "../primitives.js";
import { trackSchema } from "../track.js";

export const musicPlanOfflineCacheInputSchema = z
  .object({
    household_id: z
      .string()
      .min(1)
      .optional()
      .describe("Opaque household id; enables history-aware selection (§6.6)."),
    slots: z
      .object({
        emergency: z
          .number()
          .int()
          .min(1)
          .default(5) // §5.2/§6.6: default 5 "emergency vibe" tracks
          .describe("Number of 'emergency vibe' tracks to cache. Default 5."),
        next_up: z
          .number()
          .int()
          .min(0)
          .default(3) // §5.2/§6.6: + next 3 queued
          .describe("How many queued tracks to cache next. Default 3."),
      })
      .default({ emergency: 5, next_up: 3 })
      .describe("Slot counts; defaults 5 + next 3 (§5.2, §6.6)."),
    mood_hint: z
      .string()
      .min(1)
      .optional()
      .describe("Optional free-text mood hint for selection."),
    byte_budget: z
      .number()
      .int()
      .min(1)
      .describe(
        "Hard byte budget for the cache plan. Required: blueprint §5.2 names it as key input but ships no default, so the caller must state it.",
      ),
  })
  .strict();
export type MusicPlanOfflineCacheInput = z.infer<
  typeof musicPlanOfflineCacheInputSchema
>;

export const musicPlanOfflineCacheOutputSchema = z
  .object({
    plan: z
      .object({
        items: z.array(
          z
            .object({
              track: trackSchema,
              url: z.string().url().describe("Prefetch URL (only cacheable tracks, §6.6)."),
              bytes: z.number().int().min(1),
              ttl_seconds: z.number().int().min(1),
            })
            .strict(),
        ),
        expires_at: z.string().datetime().describe("Plan expiry (§5.2: plan with expiry)."),
      })
      .strict(),
    task: z
      .object({
        task_id: z
          .string()
          .min(1)
          // [VERIFY R-SPEC-05: task handle name and lifecycle are spec-defined;
          //  R-SPEC-02 determines whether the pinned SDK supports tasks at all —
          //  ADR-0001 fallback: omit this member and rely on progress
          //  notifications (blueprint §12.2 cut line: "Task-augmentation (use
          //  progress notifications)").]
          .describe("Task handle for the cache-preparation task [VERIFY R-SPEC-05]."),
        status: z
          .string()
          .min(1)
          .describe(
            "Task status token [VERIFY R-SPEC-05: exact vocabulary comes from the spec task states — deliberately not enumerated here to avoid inventing codes.]",
          ),
      })
      .strict()
      .optional(),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type MusicPlanOfflineCacheOutput = z.infer<
  typeof musicPlanOfflineCacheOutputSchema
>;

export const musicPlanOfflineCacheTool = {
  name: "music_plan_offline_cache",
  title: "Plan offline cache",
  description:
    "Build a prefetch plan for offline continuity and warm it: 5 emergency-vibe tracks plus the next 3 queued by default, constrained by byte_budget and licensing (only tracks flagged cacheable). Returns the plan (tracks, URLs, sizes, TTLs, expiry); warming runs as a cancellable task with progress when the host supports tasks, otherwise progress notifications only. Use when the network is healthy and the household is about to go offline (driving, travel), not on every turn.",
  annotations: {
    readOnlyHint: false,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputSchema: musicPlanOfflineCacheInputSchema,
  outputSchema: musicPlanOfflineCacheOutputSchema,
} as const;
