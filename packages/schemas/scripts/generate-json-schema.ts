/**
 * Generate JSON Schema artifacts from the Zod contract (single source of truth).
 *
 * Runs as part of `npm run build` (tsc → node dist/scripts/generate-json-schema.js)
 * and writes to packages/schemas/json-schema/:
 *
 *   omnibeat-contract-v0.schema.json   — combined document: $defs.Track + all
 *                                        tool input/output + errors + elicitation
 *                                        + trace envelope + config (Appendix-A-style
 *                                        "#/$defs/Track" references)
 *   tools/<name>.input.schema.json     — one file per tool, tools/list-ready
 *   tools/<name>.output.schema.json
 *   errors.schema.json                 — protocol + tool-execution error model (§5.5)
 *   elicitation.schema.json            — form + URL mode shapes (§5.4)
 *   trace.schema.json                  — trace-bus envelope (§4.1, §11.2)
 *   config.schema.json                 — typed config (§8.8)
 *   resources.json / prompts.json      — §5.3 definitions (data, not schemas)
 *
 * Dialect: jsonSchema2019-09 — the first dialect with native `$defs`, matching
 * the Appendix A pointer style (`#/$defs/Track`). All keywords used are broadly
 * compatible; whether MCP tool schemas may carry `$schema`/`$defs` at
 * 2025-11-25 is [VERIFY R-SPEC-01].
 *
 * Pinned generator: zod-to-json-schema@3.23.5 (see package.json).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonRpcErrorSchema, toolErrorResultSchema } from "../src/errors.js";
import {
  disambiguationCompanionSchema,
  elicitationCompleteNotificationSchema,
  elicitationFormRequestSchema,
  elicitationFormResponseSchema,
  urlElicitationRequiredErrorSchema,
} from "../src/elicitation.js";
import { omnibeatConfigSchema } from "../src/config.js";
import { promptDefinitions } from "../src/prompts.js";
import { resourceDefinitions, resourceTemplateDefinitions } from "../src/resources.js";
import { trackSchema } from "../src/track.js";
import { traceEnvelopeSchema } from "../src/trace.js";
import { toolDefinitions, toolNames } from "../src/tools/index.js";

const TARGET = "jsonSchema2019-09" as const;
const DEFINITION_PATH = "$defs";
const GENERATED_BY =
  "Generated from Zod by packages/schemas/scripts/generate-json-schema.ts — DO NOT EDIT.";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const outDir = join(packageRoot, "json-schema");

/**
 * Convert a Zod schema, pre-registering `Track` as a shared definition so any
 * occurrence becomes `#/$defs/Track` (mirrors Appendix A). Detection uses
 * Track's unique member (`"candidate_id"`) as marker; the definitions are only
 * kept when they actually produce a Track reference, so files whose shapes
 * merely contain a `candidate_id` field (e.g. hook clips) stay ref-free.
 */
function toJsonSchema(schema: z.ZodTypeAny, name?: string): Record<string, unknown> {
  const base = {
    target: TARGET,
    definitionPath: DEFINITION_PATH,
    ...(name === undefined ? {} : { name }),
  };
  let result = zodToJsonSchema(schema, base) as Record<string, unknown>;
  if (JSON.stringify(result).includes('"candidate_id"')) {
    const withDefs = zodToJsonSchema(schema, {
      ...base,
      definitions: { Track: trackSchema },
    }) as Record<string, unknown>;
    if (JSON.stringify(withDefs).includes(`#/${DEFINITION_PATH}/Track`)) {
      result = withDefs;
    }
  }
  result.$comment = GENERATED_BY;
  return result;
}

function write(relativePath: string, doc: unknown): void {
  const target = join(outDir, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  process.stdout.write(`wrote json-schema/${relativePath.replace(/\\/g, "/")}\n`);
}

// 1. Per-tool schemas (tools/list-ready).
const toolShape: Record<string, z.ZodTypeAny> = {};
for (const name of toolNames) {
  const def = toolDefinitions[name];
  toolShape[name] = z.object({ input: def.inputSchema, output: def.outputSchema });
  write(join("tools", `${name}.input.schema.json`), toJsonSchema(def.inputSchema));
  write(join("tools", `${name}.output.schema.json`), toJsonSchema(def.outputSchema));
}

// 2. Combined contract document (Appendix-A-style $defs.Track + everything).
const contractRoot = z.object({
  tools: z.object(toolShape),
  errors: z.object({
    jsonRpcError: jsonRpcErrorSchema,
    toolErrorResult: toolErrorResultSchema,
  }),
  elicitation: z.object({
    formRequest: elicitationFormRequestSchema,
    formResponse: elicitationFormResponseSchema,
    companion: disambiguationCompanionSchema,
    urlElicitationRequired: urlElicitationRequiredErrorSchema,
    elicitationComplete: elicitationCompleteNotificationSchema,
  }),
  traceEnvelope: traceEnvelopeSchema,
  config: omnibeatConfigSchema,
});
write("omnibeat-contract-v0.schema.json", toJsonSchema(contractRoot, "omnibeat-contract-v0"));

// 3. Standalone model schemas.
write("errors.schema.json", toJsonSchema(z.object({
  jsonRpcError: jsonRpcErrorSchema,
  toolErrorResult: toolErrorResultSchema,
})));
write("elicitation.schema.json", toJsonSchema(z.object({
  formRequest: elicitationFormRequestSchema,
  formResponse: elicitationFormResponseSchema,
  companion: disambiguationCompanionSchema,
  urlElicitationRequired: urlElicitationRequiredErrorSchema,
  elicitationComplete: elicitationCompleteNotificationSchema,
})));
write("trace.schema.json", toJsonSchema(traceEnvelopeSchema));
write("config.schema.json", toJsonSchema(omnibeatConfigSchema));

// 4. §5.3 definition data (not JSON Schema — plain contract JSON).
write("resources.json", {
  resources: resourceDefinitions,
  resourceTemplates: resourceTemplateDefinitions,
});
write("prompts.json", { prompts: promptDefinitions });

process.stdout.write("JSON Schema generation complete.\n");
