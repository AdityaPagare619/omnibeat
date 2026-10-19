import { defineConfig } from "vitest/config";

// OmniBeat acceptance tests (T-TEST). Contract-, property- and e2e-level only.
// No product logic lives here; every test targets the frozen blueprint contract
// (docs/00_OMNIBEAT_V3_BLUEPRINT.md §5, §7.3, Appendix A) or the Charter ACs.
export default defineConfig({
  test: {
    include: ["contract/**/*.test.ts", "e2e/**/*.test.ts", "property/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Deterministic order so the red-run receipt in RUN-*.txt is diffable.
    sequence: { shuffle: false },
    reporters: ["default"],
  },
});
