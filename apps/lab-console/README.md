# lab-console

Dark, high-contrast, large-type React console for OmniBeat (blueprint §11.2). Renders **real MCP trace frames** from `alexa-lab` over `ws://localhost:4000/trace` — never synthesised data. Host down ⇒ honest banner, not fake frames.

## Run (3 steps)
```bash
cd apps/lab-console
npm install
npm run dev      # open http://localhost:3000
```
Then start `alexa-lab` on :4000 (or set `VITE_HOST=http://host:port`); the chip flips to `trace connected`. Mic stays disabled until Phase 4.

## Layout
- **Top bar** — `MCP 2025-11-25` chip · LIVE/REPLAY/FIXTURE/TYPED badges (derived from frames) · MCP ON/OFF switch (POSTs `mcpOn` on next turn) · surface Dot/Show/TV (**TV enlarges type/contrast**).
- **Left Voice** — say-something box · disabled mic ("mic in Phase 4") · CSS-pulse orb while speaking · partial/final transcripts · TTS bubble with barge-in cut struck through.
- **Centre Resolution** — heard → candidate cards (untrusted badge) · confidence meter with play/ask thresholds (from frame) · decision chip PLAY/ASK/REPAIR/NOT_FOUND (colour + text) · evidence list · "Why did you play that?".
- **Right Continuity** — breaker state (colour + label) · chaos inject (`/chaos {latencyMs:1500}` / `{failNext:2}`) · edge-mode badge.
- **Bottom Wire inspector** — scrolling table of real frames (seq/time/dir/method/tool/latency/SSE id/badge) · click a row for raw JSON · filter chips (all/requests/notifications/elicitation/cancellation).

Keyboard-reachable, focus rings, every colour state also has a text label.

## Tests
`npm test` — vitest + jsdom; only the WS transport layer is mocked, so rendering exercises the real message path. See `PROOF.md`.
