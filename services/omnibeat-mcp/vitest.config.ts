import { defineConfig } from "vitest/config";

export default defineConfig({
  // Inline PostCSS so Vite does not walk up the tree and pick unrelated
  // configs (C:/Users/Lenovo/Downloads/postcss.config.mjs broke the run).
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // One spawned server on port 8099 for the whole file: sequential by design.
    fileParallelism: false,
  },
});
