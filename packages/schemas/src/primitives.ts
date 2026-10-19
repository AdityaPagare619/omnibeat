/**
 * Shared primitives — OmniBeat contract v0 (@omnibeat/schemas).
 *
 * Single source of truth for the three deployables (omnibeat-mcp :8080,
 * alexa-lab :4000, lab-console :3000). Every value is traceable to
 * docs/00_OMNIBEAT_V3_BLUEPRINT.md — section references appear inline.
 *
 * Contract rules (blueprint §5.1, §8.8, charter Part 10):
 *  - strict Zod validation on every input (`.strict()` everywhere);
 *  - tool schemas are additive-only within a major (§5.1 Versioning);
 *  - no field exists that is not justified by the blueprint or explicitly
 *    marked as a contract-draft choice in a comment.
 */
import { z } from "zod";

/** Blueprint Appendix A (frozen Day 0): `surface` enum. */
export const surfaceSchema = z.enum(["screenless", "screen", "tv"]);
export type Surface = z.infer<typeof surfaceSchema>;

/** Blueprint Appendix A (frozen Day 0): `profile` enum, default "standard". */
export const profileSchema = z.enum(["standard", "kids"]);
export type Profile = z.infer<typeof profileSchema>;

/** Blueprint §5.2 / Appendix A: response style enum (brief | normal | detailed). */
export const responseStyleSchema = z.enum(["brief", "normal", "detailed"]);
export type ResponseStyle = z.infer<typeof responseStyleSchema>;

/**
 * BCP-47 locale tag (blueprint Appendix A: "BCP-47 tag of the recogniser locale,
 * e.g. en-IN"). The 64-char cap is a request-size limit chosen by contract v0,
 * not a claim about BCP-47 grammar. Which locales the recogniser supports depends
 * on Transcribe availability: [VERIFY R-AWS-02].
 */
export const localeSchema = z.string().min(2).max(64);

/** 0..1 calibrated confidence (blueprint §6.1 S5: "0.9 means ≈ 90 %"). */
export const confidenceSchema = z.number().min(0).max(1);

/** One trace id per user turn, propagated host → MCP → upstream (blueprint §8.7). */
export const traceIdSchema = z.string().min(1);

/**
 * Spoken-prompt tiers. Blueprint §6.5: "Returns every spoken string in tiers:
 * speak_short, speak_normal, speak_long, so brevity is a policy, not a prompt hope."
 *
 * NOTE (contract-draft deviation, flagged for Gate G1): Appendix A leaves the three
 * tier fields optional inside `spoken_prompt`; §6.5 prose requires them, so contract
 * v0 requires all three. ORCH decision recorded in the p0-contract ledger.
 */
export const spokenPromptSchema = z
  .object({
    speak_short: z.string().min(1),
    speak_normal: z.string().min(1),
    speak_long: z.string().min(1),
  })
  .strict();
export type SpokenPrompt = z.infer<typeof spokenPromptSchema>;

/** ASR n-best alternative — blueprint Appendix A (required ["text"], confidence optional). */
export const asrAlternativeSchema = z
  .object({
    text: z.string().min(1),
    confidence: confidenceSchema.optional(),
  })
  .strict();
export type AsrAlternative = z.infer<typeof asrAlternativeSchema>;

/**
 * Evidence entry — blueprint Appendix A output (`source`, `signal`, `weight`, no
 * required members: mirrored exactly) and §6.1 S7 (which sources agreed, what was
 * heard, what changed).
 */
export const evidenceEntrySchema = z
  .object({
    source: z.string(),
    signal: z.string(),
    weight: z.number(),
  })
  .strict();
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;

/**
 * Tool annotations — blueprint §5.2 ("Every tool has title, inputSchema,
 * outputSchema, and annotations") and Appendix A.
 *
 * `openWorldHint` is optional: where blueprint §5.2 is silent the field is omitted
 * so the MCP default applies rather than an invented value
 * [VERIFY R-SPEC-01: annotation defaults at the pinned spec version].
 */
export const toolAnnotationsSchema = z
  .object({
    readOnlyHint: z.boolean(),
    idempotentHint: z.boolean(),
    openWorldHint: z.boolean().optional(),
    destructiveHint: z.boolean(),
  })
  .strict();
export type ToolAnnotations = z.infer<typeof toolAnnotationsSchema>;

/**
 * Source badges — blueprint §4.2 ("Every card in the console shows a source badge:
 * LIVE, REPLAY or FIXTURE. No unlabeled mock.") and AC-14.
 */
export const sourceBadgeSchema = z.enum(["LIVE", "REPLAY", "FIXTURE"]);
export type SourceBadge = z.infer<typeof sourceBadgeSchema>;

/**
 * Degradation level as reported inside tool results. Appendix A freezes the enum
 * to L0..L2 (server-side rungs); the full ladder L0..L4 in blueprint §8.3 also has
 * client-side rungs (L3 edge mode, L4 honest failure) that a tool result cannot
 * report. AMBIGUITY flagged to ORCH — see docs/ARCHITECTURE.md.
 */
export const serverDegradationLevelSchema = z.enum(["L0", "L1", "L2"]);
export type ServerDegradationLevel = z.infer<typeof serverDegradationLevelSchema>;
