/**
 * alexa-lab configuration (env-overridable, defaults match the charter ports).
 *
 *   MCP_URL   MCP endpoint of omnibeat-mcp   (default http://localhost:8080/mcp)
 *   PORT      alexa-lab listen port          (default 4000)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of services/alexa-lab — works from src/ (ts) and dist/ (js). */
export const LAB_ROOT = path.resolve(here, "..");

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface LabConfig {
  port: number;
  mcpUrl: string;
  /** Base URL (origin) of the MCP server — /healthz and /admin/mode live here. */
  mcpOrigin: string;
  toolTimeoutMs: number;
  connectTimeoutMs: number;
  /** Backoff schedule (ms) between reconnect attempts; last entry repeats. */
  reconnectBackoffMs: number[];
  probeIntervalMs: number;
  fixturesDir: string;
  publicDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LabConfig {
  const mcpUrl = env.MCP_URL ?? "http://localhost:8080/mcp";
  let origin: string;
  try {
    origin = new URL(mcpUrl).origin;
  } catch {
    origin = "http://localhost:8080";
  }
  return {
    port: intEnv("PORT", 4000),
    mcpUrl,
    mcpOrigin: origin,
    toolTimeoutMs: intEnv("TOOL_TIMEOUT_MS", 4000),
    connectTimeoutMs: intEnv("CONNECT_TIMEOUT_MS", 2500),
    reconnectBackoffMs: [250, 500, 1000, 2000, 4000, 8000],
    probeIntervalMs: intEnv("PROBE_INTERVAL_MS", 5000),
    fixturesDir: env.FIXTURES_DIR ?? path.join(LAB_ROOT, "fixtures", "transcripts"),
    publicDir: env.PUBLIC_DIR ?? path.join(LAB_ROOT, "public"),
  };
}
