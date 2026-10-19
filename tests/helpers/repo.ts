/**
 * Repo-scanning helpers for acceptance tests that audit repository artifacts
 * (schemas, packs, Dockerfiles, eval/ and results/ claim artifacts).
 * Paths are resolved from the worktree root (tests/..), never from process.cwd(),
 * so the tests behave identically under `vitest run` from any directory.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Worktree (repo) root. */
export const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".vitest"]);

/** Recursively collect files under `dir` whose basename matches `pattern`, skipping ignored dirs. */
export function findFiles(dir: string, pattern: RegExp): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      out.push(...findFiles(full, pattern));
    } else if (pattern.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Path of `file` relative to the repo root, with forward slashes (for stable messages). */
export function rel(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join("/");
}

/** Read a repo-root-relative JSON file; throws a loud NOT IMPLEMENTED error when absent. */
export function readRepoJson<T>(repoRelativePath: string): T {
  const full = join(REPO_ROOT, repoRelativePath);
  let raw: string;
  try {
    raw = readFileSync(full, "utf8");
  } catch {
    throw new Error(
      `NOT IMPLEMENTED: expected artifact "${repoRelativePath}" does not exist yet ` +
        `(nothing is implemented at Phase 0 — this is the expected red state).`,
    );
  }
  return JSON.parse(raw) as T;
}

/** True when a repo-root-relative path exists. */
export function repoPathExists(repoRelativePath: string): boolean {
  try {
    statSync(join(REPO_ROOT, repoRelativePath));
    return true;
  } catch {
    return false;
  }
}
