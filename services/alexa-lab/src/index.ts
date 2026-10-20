/**
 * alexa-lab bootstrap — process entry point (port 4000).
 *
 * Order: build the trace bus → breaker → MCP client (connect attempt never
 * blocks boot) → agent loop → HTTP + WS. The MCP server may be down: the lab
 * still starts and reports MCP OFFLINE honestly on every turn.
 */
import { loadConfig } from "./config.js";
import { TraceBus } from "./trace-bus.js";
import { CircuitBreaker, DEFAULT_BREAKER_CONFIG } from "./breaker.js";
import { ChaosController } from "./chaos.js";
import { McpHostClient } from "./mcp-client.js";
import { TtsPlayer } from "./tts.js";
import { AgentLoop } from "./agent-loop.js";
import { BargeInController } from "./barge-in.js";
import { createApp, listen, type LabRuntime } from "./server.js";
import { logger } from "./logger.js";

export interface StartedLab {
  runtime: LabRuntime;
  server: import("node:http").Server;
  stop: () => Promise<void>;
}

export interface RuntimeOptions {
  mcpUrl?: string;
  fixturesDir?: string;
  /** Disable/replace health probing (tests drive the breaker by hand). */
  probeIntervalMs?: number;
}

/**
 * Build the full runtime (bus → breaker → MCP client → loop → app) without
 * listening. `startLab` and the test suite both use this, so tests exercise
 * exactly the wiring the judge runs.
 */
export function createRuntime(options: RuntimeOptions = {}): LabRuntime {
  const config = loadConfig();
  const mcpUrl = options.mcpUrl ?? config.mcpUrl;
  let mcpOrigin = config.mcpOrigin;
  try {
    mcpOrigin = new URL(mcpUrl).origin;
  } catch {
    mcpOrigin = config.mcpOrigin;
  }

  const bus = new TraceBus();
  const breaker = new CircuitBreaker(DEFAULT_BREAKER_CONFIG);
  const chaos = new ChaosController();

  breaker.onTransition((from, to, reason) => {
    bus.emit({
      direction: "internal",
      method: `breaker.${to}`,
      payload: { from, to, reason, edgeMode: to === "open" },
    });
    logger.warn("breaker transition", { from, to, reason });
  });

  const mcp = new McpHostClient({
    mcpUrl,
    mcpOrigin,
    bus,
    breaker,
    chaos,
    toolTimeoutMs: config.toolTimeoutMs,
    connectTimeoutMs: config.connectTimeoutMs,
    reconnectBackoffMs: config.reconnectBackoffMs,
  });

  const tts = new TtsPlayer();
  const loop = new AgentLoop({
    bus,
    mcp,
    breaker,
    tts,
    fixturesDir: options.fixturesDir ?? config.fixturesDir,
  });
  const bargeIn = new BargeInController({ bus, tts, mcp, loop });

  return {
    bus,
    breaker,
    chaos,
    mcp,
    tts,
    loop,
    bargeIn,
    startedAt: Date.now(),
  };
}

export async function startLab(
  overrides: { port?: number; mcpUrl?: string } = {},
): Promise<StartedLab> {
  const config = loadConfig();
  const runtime = createRuntime({
    ...(overrides.mcpUrl !== undefined ? { mcpUrl: overrides.mcpUrl } : {}),
  });
  const { bus, mcp, chaos, breaker } = runtime;

  const app = createApp(runtime, config.publicDir);
  const port = overrides.port ?? config.port;
  const server = await listen(app, port, bus);

  // Boot connection attempt — never fatal, the lab must start with MCP down.
  void mcp.start().then(() => {
    logger.info("mcp client boot attempt finished", { state: mcp.state, url: runtime.mcp.snapshot().url });
    // First health probe immediately, then on the interval: feeds the breaker.
    void mcp.probe();
  });

  const probeTimer = setInterval(() => {
    void mcp.probe();
  }, config.probeIntervalMs);
  probeTimer.unref?.();

  logger.info("alexa-lab listening", {
    port,
    mcpUrl: runtime.mcp.snapshot().url,
    fixturesDir: config.fixturesDir,
    trace: "ws /trace",
    chaos: chaos.snapshot(),
    breaker: breaker.snapshot().state,
  });

  const stop = async (): Promise<void> => {
    clearInterval(probeTimer);
    await mcp.close();
    bus.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { runtime, server, stop };
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href;

if (isDirectRun) {
  startLab()
    .then(({ stop }) => {
      const shutdown = (signal: string): void => {
        logger.info("shutting down", { signal });
        void stop().then(() => process.exit(0));
      };
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
    })
    .catch((err: unknown) => {
      logger.error("alexa-lab failed to start", { error: String(err) });
      process.exit(1);
    });
}
