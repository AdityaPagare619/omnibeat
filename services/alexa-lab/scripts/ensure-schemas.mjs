#!/usr/bin/env node
/**
 * Ensure @omnibeat/schemas is built before compiling alexa-lab.
 * The `file:../../packages/schemas` dependency resolves to source that ships
 * `main: ./dist/src/index.js`; if dist is missing, build it here so
 * `npm install && npm run build && npm test` is self-contained.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(here, "..", "..", "..", "packages", "schemas");
const distEntry = path.join(schemasDir, "dist", "src", "index.js");

if (existsSync(distEntry)) {
  console.log("[ensure-schemas] @omnibeat/schemas dist present");
  process.exit(0);
}

console.log(`[ensure-schemas] building ${schemasDir}`);
if (!existsSync(path.join(schemasDir, "node_modules"))) {
  const inst = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: schemasDir,
    stdio: "inherit",
    shell: true,
  });
  if (inst.status !== 0) {
    console.error("[ensure-schemas] npm install in packages/schemas failed");
    process.exit(inst.status ?? 1);
  }
}
const build = spawnSync("npm", ["run", "build"], {
  cwd: schemasDir,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) {
  console.error("[ensure-schemas] build of packages/schemas failed");
  process.exit(build.status ?? 1);
}
console.log("[ensure-schemas] built");
