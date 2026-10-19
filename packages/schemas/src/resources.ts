/**
 * Resources — blueprint §5.3.
 *
 * Static resources are listed by the client (resources/list); templates are
 * registered via resources/templates/list. The blueprint's table lists
 * session context, packs, and hook clips with URI placeholders — contract v0
 * models those as resource TEMPLATES (URI templating is what templates are for)
 * and eval/latest + health as static resources. Mapping noted in
 * docs/ARCHITECTURE.md; flagged for Gate G1 as a contract-draft choice.
 */
import { z } from "zod";

export const resourceDefinitionSchema = z
  .object({
    uri: z.string().min(1),
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    mimeType: z.string().min(1),
    subscribable: z.boolean().default(false),
  })
  .strict();
export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;

export const resourceTemplateDefinitionSchema = z
  .object({
    uriTemplate: z.string().min(1),
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    mimeType: z.string().min(1),
    subscribable: z.boolean().default(false),
  })
  .strict();
export type ResourceTemplateDefinition = z.infer<
  typeof resourceTemplateDefinitionSchema
>;

/**
 * Static resources (blueprint §5.3 rows 2 and 4).
 */
export const resourceDefinitions = [
  {
    uri: "omnibeat://eval/latest",
    name: "eval-latest",
    title: "Latest evaluation report",
    description:
      "The most recent evaluation report (JSON + Markdown), readable by any MCP client (blueprint §5.3).",
    mimeType: "application/json",
    subscribable: false,
  },
  {
    uri: "omnibeat://health",
    name: "health",
    title: "Upstream health",
    description:
      "Upstream status and circuit breaker states (blueprint §5.3); also the circuit-breaker probe target for clients (§6.6).",
    mimeType: "application/json",
    subscribable: false,
  },
] as const satisfies readonly ResourceDefinition[];

/**
 * Resource templates (blueprint §5.3 rows 1, 3, 5).
 */
export const resourceTemplateDefinitions = [
  {
    uriTemplate: "omnibeat://session/{id}/context",
    name: "session-context",
    title: "Session resolution context",
    description:
      "Current resolution state; notifications/resources/updated drives the UI (blueprint §5.3).",
    mimeType: "application/json",
    subscribable: true,
  },
  {
    uriTemplate: "omnibeat://packs/{locale}",
    name: "locale-pack",
    title: "Locale pack manifest",
    description:
      "Locale pack manifest: rules, test counts, measured accuracy (blueprint §5.3).",
    mimeType: "application/json",
    subscribable: false,
  },
  {
    uriTemplate: "omnibeat://hooks/{candidate_id}.m4a",
    name: "hook-clip",
    title: "Ephemeral hook clip",
    description:
      "Ephemeral 3 s hook clip for a candidate; preview-only, short-lived cache, no redistribution (blueprint §5.3, §6.4, §9.1.5).",
    mimeType: "audio/mp4",
    subscribable: false,
  },
] as const satisfies readonly ResourceTemplateDefinition[];
