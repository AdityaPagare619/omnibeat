/**
 * omnibeat-mcp entry point: Streamable HTTP MCP server on :8080
 * (blueprint 4.1 deployable 1, spec 2025-11-25).
 *
 *   npm start        -> node dist/index.js
 *   GET  /healthz    liveness
 *   POST /admin/mode {naive:boolean}  lab-only A/B baseline
 *
 * Lifecycle (blueprint 8.10): SIGTERM/SIGINT drain - stop accepting sessions,
 * close live SSE streams via transport close, then close the store.
 */
import { pathToFileURL } from "node:url";
import { createApp } from "./server.js";
import { loadConfig } from "./config.js";
import { OmniBeatStore } from "./store/store.js";
import { log } from "./logging.js";
import { SUPPORTED_PROTOCOL_VERSION } from "./transport/guards.js";

export { createApp } from "./server.js";
export { loadConfig } from "./config.js";
export { OmniBeatStore } from "./store/store.js";

function main(): void {
  const cfg = loadConfig();
  const store = new OmniBeatStore(cfg.dbPath);
  const admin = { naive: false };
  const created = createApp({ cfg, store, admin });

  const server = created.app.listen(cfg.port, cfg.host, () => {
    log.info("server_listening", {
      host: cfg.host,
      port: cfg.port,
      protocol_version: SUPPORTED_PROTOCOL_VERSION,
      endpoint: "/mcp",
      replay_only: cfg.replayOnly,
      require_bearer_auth: cfg.requireBearerAuth,
      db: cfg.dbPath,
      node: process.version,
    });
  });

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    log.info("server_shutdown_start", { signal, sessions: created.sessions.size });
    server.close(() => {
      log.info("http_closed", {});
    });
    void created
      .shutdown()
      .catch((err: unknown) => {
        log.error("shutdown_error", { error: String((err as Error)?.message ?? err) });
      })
      .finally(() => {
        try {
          store.close();
        } catch {
          // store already closed
        }
        log.info("server_shutdown_done", { signal });
        process.exit(0);
      });
    // Hard stop if streams refuse to end (blueprint 8.10 drain, bounded).
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
