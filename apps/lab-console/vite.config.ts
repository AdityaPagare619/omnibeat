import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev/preview proxy — the console's answer to a host that serves no CORS
 * headers (verified live: `OPTIONS /turn` 404s and /turn has no
 * `Access-Control-Allow-Origin`). The browser talks to its OWN origin, this
 * proxy forwards to the lab host, so every request the judge sees is still a
 * real POST /turn against alexa-lab — nothing is stubbed client-side.
 * The trace WebSocket is not subject to CORS and connects straight to :4000.
 */
declare const process: { env: Record<string, string | undefined> };

const HOST_TARGET = process.env["VITE_HOST"] ?? "http://localhost:4000";

const API_PATHS = ["/turn", "/barge-in", "/chaos", "/state", "/frames", "/healthz", "/probe", "/tts.wav"];

const proxy: Record<string, ProxyOptions> = {};
for (const p of API_PATHS) proxy[p] = { target: HOST_TARGET, changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  // Empty postcss config: skip the upward postcss.config.* file search (an
  // unrelated config in a parent directory would otherwise be picked up).
  css: { postcss: {} },
  server: { port: 3000, strictPort: true, proxy },
  preview: { port: 3000, strictPort: true, proxy },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
