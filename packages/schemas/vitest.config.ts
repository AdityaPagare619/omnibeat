import { defineConfig } from "vitest/config";

export default defineConfig({
  // Isolate from any PostCSS config in ancestor directories (the parent folder
  // of this repo carries one for an unrelated app); this package has no CSS.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
