import { defineConfig } from "vitest/config";

export default defineConfig({
  // Pin empty postcss config: vite walks UP the directory tree and would
  // otherwise pick up an unrelated postcss.config.mjs outside this repo.
  css: { postcss: {} },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
