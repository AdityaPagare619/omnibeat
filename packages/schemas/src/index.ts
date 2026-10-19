/**
 * @omnibeat/schemas — OmniBeat contract v0.
 *
 * Single source of truth for the three deployables:
 *   omnibeat-mcp (:8080) · alexa-lab (:4000) · lab-console (:3000)
 * MCP spec target 2025-11-25 over Streamable HTTP (blueprint §5).
 *
 * Zod schemas here generate the JSON Schema served by tools/list and the
 * validation used by every process; docs/ARCHITECTURE.md holds the [VERIFY]
 * register for fields that depend on open P0 research questions.
 */
export * from "./primitives.js";
export * from "./track.js";
export * from "./errors.js";
export * from "./elicitation.js";
export * from "./resources.js";
export * from "./prompts.js";
export * from "./trace.js";
export * from "./config.js";
export * from "./tools/index.js";
