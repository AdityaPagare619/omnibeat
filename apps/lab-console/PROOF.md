# lab-console — PROOF

Real command outputs pasted verbatim. Machine: Windows (Node v24.15.0, npm 11.12.1).
No output here was hand-edited; where a line is elided it is marked.

## 1. `npm install && npm run build` — tsc clean + vite build succeeds

```
> lab-console@0.1.0 build
> npm run typecheck && vite build

> lab-console@0.1.0 typecheck
> tsc --noEmit

vite v5.4.21 building for production...
transforming...
✓ 40 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                 0.45 kB │ gzip:  0.29 kB
dist/assets/index-BzYpqrSZ.css 10.18 kB │ gzip:  2.82 kB
dist/assets/index-DuLWci93.js   168.07 kB │ gzip: 53.94 kB
✓ built in 4.08s
```

`npm run build` exit code: **0** (`tsc --noEmit` reported no errors; `vite build` emitted `dist/`).

## 2. `npm run dev` boots on :3000 (fetch returns HTML, then killed)

Dev server start (background):

```
> lab-console@0.1.0 dev
> vite

  VITE v5.4.21  ready in 1306 ms

  ➜  Local:   http://localhost:3000/
```

`Invoke-WebRequest http://localhost:3000/` after boot:

```
STATUS: 200
HAS-ROOT-DIV: True
TITLE-OK: True
--- first 400 chars ---
<!doctype html>
<html lang="en">
  <head>
    <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
</script>

    <script type="module" src="/@vite/client"></script>

    <meta name="viewport" content="width=device-width, initial-scale=1.0"
```

Port freed after kill:

```
PORT-3000-FREE
```

## 3. Rendering tests — vitest + jsdom, 5 tests, mock the WS transport layer only

`npx vitest run --reporter=verbose`:

```
 RUN  v2.1.9 C:/Users/Lenovo/Downloads/omni-wt/b-console-p1/apps/lab-console

 ✓ src/test/App.test.tsx > top bar > renders the MCP spec chip and derived mode badges 460ms
 ✓ src/test/App.test.tsx > wire inspector > renders real frames delivered via the mocked WS message path
 ✓ src/test/App.test.tsx > wire inspector > filters to elicitation frames via the filter chips
 ✓ src/test/App.test.tsx > MCP on/off switch > flips state and sends the mcpOn flag to the host on the next turn
 ✓ src/test/App.test.tsx > host down > shows the honest offline banner and never fabricates frames 553ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  11.80s
```

`vitest run` exit code: **0**.

### What is mocked, precisely

Only `src/transport.ts` (the `TraceTransport` class) is replaced via `vi.mock`. The
components (`App`, `TopBar`, `WireInspector`, …) and the whole derivation layer
(`src/derive.ts`) run **for real**. Frames are injected through the same
`onEnvelope(envelope, generation)` handler a live `ws://localhost:4000/trace`
message would reach, so the tests exercise the real message path end to end —
never a fabricated client-side frame (blueprint §2 row 3, §4.2 AC-14).

The envelope factory builds shapes that pass `isTraceEnvelope` (the runtime
mirror of `packages/schemas/src/trace.ts`); anything that fails the gate is
dropped and counted, never rendered.

## Notes / caveats (honest)

- The trace envelope in `src/types.ts` is a **structural mirror** of
  `packages/schemas/src/trace.ts`; the console does not import `@omnibeat/schemas`
  at runtime (dependency budget: react + react-dom only, no zod in the browser).
  `isTraceEnvelope` is the runtime gate.
- The host HTTP contract (`POST /turn`, `POST /chaos`) is a **draft**; bodies are
  `{ text?, surface, mcpOn, explain? }` and `{ latencyMs? , failNext? }`
  respectively. If alexa-lab's shape differs, only `src/host.ts` + the two call
  sites need updating.
- Derivation of resolution/breaker/speaking/transcripts from frames is
  deliberately **tolerant** (walks `frame.result.structuredContent`,
  `frame.result.content[0].text`, `frame.params`, …). When a field is absent the
  view says "not in trace" rather than inventing a value.
- No audio path is claimed: the mic button is present but disabled with the
  tooltip "mic in Phase 4".
