/**
 * account_link_music_service — blueprint §5.2 (row 7) and §5.4 URL mode.
 * Start linking a user's music account using URL-mode elicitation; OAuth
 * happens in the provider's browser page, never through the client or LLM
 * (§5.4). The result is either a link status or the -32042 protocol error
 * carrying elicitationId + url.
 *
 * NOT readOnly, openWorld (§5.2 row 7). idempotentHint omitted (blueprint
 * silent → MCP default applies) [VERIFY R-SPEC-01].
 */
import { z } from "zod";
import { traceIdSchema } from "../primitives.js";

export const accountLinkMusicServiceInputSchema = z
  .object({
    provider: z
      .string()
      .min(1)
      .describe(
        "Music provider identifier to link [VERIFY R-MUSIC-01: blueprint §5.2 names only 'provider' — the identifier vocabulary depends on which providers R-MUSIC clears (terms, previews, OAuth); do not enumerate until then.]",
      ),
  })
  .strict();
export type AccountLinkMusicServiceInput = z.infer<
  typeof accountLinkMusicServiceInputSchema
>;

export const accountLinkMusicServiceOutputSchema = z
  .object({
    status: z
      .enum(["linked", "already_linked", "pending"])
      .describe(
        "Link status. CONTRACT DRAFT vocabulary (blueprint §5.2 says 'link status' only): linked/already_linked on success; pending while URL-mode elicitation is outstanding. Final handshake lands with notifications/elicitation/complete [VERIFY R-SPEC-04].",
      ),
    provider: z.string().min(1),
    trace_id: traceIdSchema, // one trace id per call (§8.7)
  })
  .strict();
export type AccountLinkMusicServiceOutput = z.infer<
  typeof accountLinkMusicServiceOutputSchema
>;

export const accountLinkMusicServiceTool = {
  name: "account_link_music_service",
  title: "Link music account",
  description:
    "Start linking the user's music account. The OAuth dance happens in the browser on the provider's page — never send tokens, codes, or credentials through the model. On first call the server returns the URL-elicitation-required protocol error (-32042) with a link the host displays as a card; completion is signalled by notifications/elicitation/complete. Use only when the user asks to connect or an operation reports CONSENT_REQUIRED for a linked account.",
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    // idempotentHint omitted: blueprint §5.2 row 7 is silent → MCP default
    // applies [VERIFY R-SPEC-01].
  },
  inputSchema: accountLinkMusicServiceInputSchema,
  outputSchema: accountLinkMusicServiceOutputSchema,
} as const;
