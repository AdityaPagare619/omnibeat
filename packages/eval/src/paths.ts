/**
 * Repo-relative paths for the eval harness.
 *
 * The harness lives in packages/eval but its inputs (phonetic packs, the
 * omnibeat-mcp service) and its outputs (eval/*.lock.json, eval/report.md) are
 * repo-root relative. We resolve the repo root from this module's own location
 * (packages/eval/dist/paths.js -> up three levels) instead of trusting cwd, so
 * `node dist/cli.js run` works from any directory.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/eval/dist
export const REPO_ROOT = resolve(HERE, "..", "..", "..");

export const PACKS_DIR = join(REPO_ROOT, "packages", "phonetic-core", "packs");
export const MCP_SERVICE_DIR = join(REPO_ROOT, "services", "omnibeat-mcp");
export const MCP_DIST_ENTRY = join(MCP_SERVICE_DIR, "dist", "index.js");
export const REPLAY_CATALOG = join(
  MCP_SERVICE_DIR,
  "fixtures",
  "catalog-replay",
  "catalog.json",
);
export const EVAL_DIR = join(REPO_ROOT, "eval");
export const CORPUS_LOCK = join(EVAL_DIR, "corpus.lock.json");
export const HELDOUT_LOCK = join(EVAL_DIR, "heldout.lock.json");
/** Written by services/omnibeat-mcp/scripts/expand-catalog.mjs (capture gaps). */
export const COVERAGE_GAPS = join(EVAL_DIR, "coverage-gaps.json");
export const REPORT_MD = join(EVAL_DIR, "report.md");
export const RESULTS_JSON = join(EVAL_DIR, "results.json");
export const DOCS_EVAL_REPORT = join(REPO_ROOT, "docs", "EVAL_REPORT.md");

/** Guard: the replay-only spawn depends on a built service dist. */
export function assertServiceBuilt(): string {
  if (!existsSync(MCP_DIST_ENTRY)) {
    throw new Error(
      `omnibeat-mcp is not built: ${MCP_DIST_ENTRY} missing. Run: npm --prefix services/omnibeat-mcp install && npm --prefix services/omnibeat-mcp run build`,
    );
  }
  return MCP_DIST_ENTRY;
}
