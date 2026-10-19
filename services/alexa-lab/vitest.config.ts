import { defineConfig } from "vitest/config";

export default defineConfig({
  // An ancestor directory ships a postcss.config.mjs for another project;
  // opt out so Vite does not try to load its Tailwind plugin here.
  css: { postcss: {} },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default"],
  },
});
