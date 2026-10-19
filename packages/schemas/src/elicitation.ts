/**
 * Elicitation designs — blueprint §5.4.
 *
 * TWO distinct modes:
 *
 *  FORM MODE — disambiguation ("Ask Once, Right"). Flat schema only: one
 *  required enum `choice` whose options carry human labels via `title`
 *  (blueprint §5.4). Audio hook links and cover art travel OUTSIDE the form,
 *  as resource_link content and structured content (blueprint §5.4, §2 row 9:
 *  form-mode elicitation schemas are restricted to flat primitives).
 *
 *  URL MODE — account linking. `account_link_music_service` returns the
 *  URL-elicitation-required protocol error (-32042) carrying `elicitationId`
 *  and `url`; OAuth happens in the browser, never through the client or LLM;
 *  completion arrives via notifications/elicitation/complete (blueprint §5.4).
 *
 * Every wire-level name in this file is a best-effort reading of the blueprint
 * and is pending the spec-text check by R-SPEC — flags inline.
 */
import { z } from "zod";
import { trackSchema } from "./track.js";

// ---------------------------------------------------------------------------
// Form mode (disambiguation)
// ---------------------------------------------------------------------------

/**
 * The `requestedSchema` carried by an elicitation/create request: a flat object
 * with exactly one required string enum property `choice`.
 *
 * [VERIFY R-SPEC-03: exact wire field names — is the schema member called
 * `requestedSchema`? — and the exact JSON Schema mechanism for per-option
 * labels (a `titles` array alongside `enum`, vs oneOf entries of
 * {const, title}), plus the full restriction set for form-mode schemas
 * (flat primitives only? nested objects forbidden?). Blueprint §5.4 states
 * "one required enum choice whose options use title" but not the encoding.]
 */
export const elicitationFormRequestedSchemaSchema = z
  .object({
    type: z.literal("object"),
    properties: z
      .object({
        choice: z
          .object({
            type: z.literal("string"),
            enum: z.array(z.string().min(1)).min(1),
            /** Human labels, one per enum entry, e.g. "Raja Ji, Pawan Singh, Bhojpuri". */
            titles: z.array(z.string().min(1)).optional(), // [VERIFY R-SPEC-03]
            description: z.string().optional(),
          })
          .strict(),
      })
      .strict(),
    required: z.array(z.literal("choice")).min(1).max(1),
  })
  .strict();

/**
 * elicitation/create request (form mode).
 * [VERIFY R-SPEC-03: method name, params envelope (message?), and whether a
 * meta/trace-id slot exists — blueprint §5.4 describes the flow, not the envelope.]
 */
export const elicitationFormRequestSchema = z
  .object({
    method: z.literal("elicitation/create"),
    params: z
      .object({
        /** One short spoken question carrying the distinguishing facts (§5.4, §6.3). */
        message: z.string().min(1),
        requestedSchema: elicitationFormRequestedSchemaSchema,
      })
      .strict(),
  })
  .strict();
export type ElicitationFormRequest = z.infer<
  typeof elicitationFormRequestSchema
>;

/**
 * Client response to form-mode elicitation.
 * [VERIFY R-SPEC-03: the action vocabulary (accept | decline | cancel) and the
 * content/reason member names are pending spec text; blueprint §5.4 only says
 * the host maps the user's voice answer onto the enum.]
 */
export const elicitationFormResponseSchema = z
  .object({
    action: z.enum(["accept", "decline", "cancel"]),
    content: z
      .object({
        choice: z.string().min(1),
      })
      .strict()
      .optional(),
    reason: z.string().optional(),
  })
  .strict();
export type ElicitationFormResponse = z.infer<
  typeof elicitationFormResponseSchema
>;

/**
 * Companion content that travels ALONGSIDE the form (never inside it):
 * audio hook links + cover art for screen/TV cards (blueprint §5.4,
 * "resource_link content and structured content for the UI").
 *
 * [VERIFY R-SPEC-01: the `resource_link` content-block type and its members
 * (uri, name, mimeType) at the pinned spec version.]
 */
export const disambiguationCompanionSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            /** Must match one enum entry of the form's `choice`. */
            choice: z.string().min(1),
            /** Human label, e.g. "Raja Ji, Pawan Singh, Bhojpuri" (§5.4). */
            label: z.string().min(1),
            /** Ephemeral hook clip (blueprint §5.3 resource template). */
            resource_links: z
              .array(
                z
                  .object({
                    uri: z.string().min(1),
                    name: z.string().min(1),
                    mimeType: z.string().min(1),
                  })
                  .strict(),
              )
              .optional(),
            artwork_url: z.string().url().optional(),
            track: trackSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3), // matches Appendix A candidates maxItems 3
  })
  .strict();
export type DisambiguationCompanion = z.infer<
  typeof disambiguationCompanionSchema
>;

// ---------------------------------------------------------------------------
// URL mode (account linking)
// ---------------------------------------------------------------------------

/**
 * The -32042 "URL elicitation required" protocol error returned by
 * `account_link_music_service` (blueprint §5.2: "protocol error -32042 (URL
 * elicitation required) with `elicitationId` and `url`"; §5.4 flow).
 *
 * [VERIFY R-SPEC-04: confirm -32042 is the correct/assigned code for URL-mode
 * elicitation at spec 2025-11-25 (not a leftover from older docs), and pin the
 * `data` members — blueprint names elicitationId + url only; `expires_at` is a
 * contract-v0 addition flagged here.]
 */
export const urlElicitationRequiredErrorSchema = z
  .object({
    code: z.literal(-32042),
    message: z.string().min(1),
    data: z
      .object({
        elicitationId: z.string().min(1),
        url: z.string().url(),
        expires_at: z.string().datetime().optional(),
      })
      .strict(),
  })
  .strict();
export type UrlElicitationRequiredError = z.infer<
  typeof urlElicitationRequiredErrorSchema
>;

/**
 * Server → client notification that a URL-mode elicitation finished, after the
 * OAuth dance on the provider's page (blueprint §5.4: "the server sends
 * notifications/elicitation/complete when finished. No tokens pass through the model.").
 *
 * [VERIFY R-SPEC-04: notification method name and params members (elicitationId
 * is named by the blueprint; `action`/`content` are contract-v0 placeholders
 * pending spec text — token material must NOT appear here).]
 */
export const elicitationCompleteNotificationSchema = z
  .object({
    method: z.literal("notifications/elicitation/complete"),
    params: z
      .object({
        elicitationId: z.string().min(1),
        action: z.enum(["accept", "decline", "cancel"]).optional(), // [VERIFY R-SPEC-04]
        content: z.unknown().optional(), // [VERIFY R-SPEC-04]
      })
      .strict(),
  })
  .strict();
export type ElicitationCompleteNotification = z.infer<
  typeof elicitationCompleteNotificationSchema
>;
