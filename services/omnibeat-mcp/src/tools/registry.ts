/**
 * tools/list registry - blueprint 5.2 / AC-03: every tool served with its
 * title, description, annotations, inputSchema AND outputSchema taken from the
 * GENERATED JSON Schema in @omnibeat/schemas (`json-schema/tools/*.schema.json`,
 * produced by packages/schemas/scripts/generate-json-schema.ts from the same
 * Zod source of truth).
 *
 * Only generator metadata keys ($schema, $comment) are stripped when serving;
 * `$defs` stays inside the document so `#/$defs/Track` resolves client-side
 * [VERIFY R-SPEC-01: whether tool schemas may carry $schema/$defs at 2025-11-25].
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { assertRegistryConsistent, toolNames, type ToolAnnotations } from "@omnibeat/schemas";
import { tools } from "../contract.js";

const require = createRequire(import.meta.url);

export interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

function loadGeneratedSchema(kind: "input" | "output", name: string): Record<string, unknown> {
  const specifier = `@omnibeat/schemas/json-schema/tools/${name}.${kind}.schema.json`;
  const path = require.resolve(specifier);
  const doc = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  delete doc.$schema;
  delete doc.$comment;
  return doc;
}

let cached: ToolDescriptor[] | undefined;

export function buildToolDescriptors(): ToolDescriptor[] {
  if (cached) return cached;
  assertRegistryConsistent(); // contract self-check at startup
  cached = toolNames.map((name) => {
    const def = tools[name];
    return {
      name,
      title: def.title,
      description: def.description,
      annotations: def.annotations as ToolAnnotations,
      inputSchema: loadGeneratedSchema("input", name),
      outputSchema: loadGeneratedSchema("output", name),
    };
  });
  return cached;
}
