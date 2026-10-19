/**
 * AC03-tools-list — Charter Part 8.5 AC-03 (blueprint §5.2 catalog + Appendix A).
 *
 * tools/list returns all eight tools (7 in the catalog + privacy_forget_my_data),
 * each with a valid JSON Schema inputSchema, an outputSchema, and annotations.
 */
import Ajv, { type AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import { initialize, listTools, ALL_TOOL_NAMES } from "../helpers/mcp";

interface ToolDef {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

describe("AC03-tools-list", () => {
  async function fetchTools(): Promise<ToolDef[]> {
    const sessionId = await initialize();
    return (await listTools(sessionId)) as ToolDef[];
  }

  it("AC03-tools-list/eight-tools: tools/list returns exactly the eight catalogued tools", async () => {
    const tools = await fetchTools();
    const names = tools.map((t) => t.name).sort();
    expect(names, "all eight blueprint §5.2 tools must be present (7 catalog + privacy_forget_my_data)").toEqual(
      [...ALL_TOOL_NAMES].sort(),
    );
  });

  it("AC03-tools-list/valid-input-schema: every tool inputSchema is a valid JSON Schema", async () => {
    const tools = await fetchTools();
    const ajv = new Ajv({ strict: false, allErrors: true });
    for (const tool of tools) {
      expect(tool.inputSchema, `tool ${tool.name} must declare an inputSchema`).toBeDefined();
      // validateSchema meta-validates the schema itself against the JSON Schema spec.
      const valid = ajv.validateSchema(tool.inputSchema as AnySchema);
      expect(valid, `tool ${tool.name} inputSchema must be a valid JSON Schema: ${ajv.errorsText()}`).toBe(true);
    }
  });

  it("AC03-tools-list/output-schemas: every tool declares an outputSchema", async () => {
    const tools = await fetchTools();
    const ajv = new Ajv({ strict: false, allErrors: true });
    for (const tool of tools) {
      // depends: ARCH contract v0 — final outputSchema for each non-resolve tool.
      // Appendix A freezes music_resolve_request's output schema; §5.2 requires output
      // schemas for every tool, so the contract-level assertion applies to all eight.
      expect(tool.outputSchema, `tool ${tool.name} must declare an outputSchema (blueprint §5.2)`).toBeDefined();
      const valid = ajv.validateSchema(tool.outputSchema as AnySchema);
      expect(valid, `tool ${tool.name} outputSchema must be a valid JSON Schema: ${ajv.errorsText()}`).toBe(true);
    }
  });

  it("AC03-tools-list/annotations: every tool carries annotations (readOnly/idempotent/openWorld/destructive)", async () => {
    const tools = await fetchTools();
    for (const tool of tools) {
      const ann = tool.annotations;
      expect(ann, `tool ${tool.name} must carry annotations (blueprint §5.2)`).toBeDefined();
      for (const key of ["readOnlyHint", "idempotentHint", "openWorldHint", "destructiveHint"] as const) {
        expect(typeof ann?.[key], `tool ${tool.name} annotations.${key} must be a boolean`).toBe("boolean");
      }
      expect(
        typeof tool.title,
        `tool ${tool.name} must have a human title (blueprint §5.2: every tool has title, schemas, annotations)`,
      ).toBe("string");
    }
  });
});
