# B-CONSOLE P2 brief - judge-first Alexa+ web app
Work in apps/lab-console (branch agent/b-console/p1-ui). Stack RUNNING: host :4000, MCP :8080. Test live. Console dev :3000.

## Why (judge-first)
Judges watch a <3min video and may open the web app. Track = "simulate an Alexa+ experience via a web app acting as a REAL MCP client". Judges are NOT engineers debugging a dashboard. App must LOOK like a premium consumer Alexa+ product while PROVING real MCP in 2 seconds.

## THE FACE (dark, premium, high-contrast, large type)
- Alexa+ orb (CSS radial pulse) + conversation view: "You said" line, then resolved outcome.
- Music result card: album-art placeholder, title/artist, language+year tag, untrusted badge, CALM confidence meter with play/ask threshold markers, decision chip PLAY/ASK/REPAIR/NOT_FOUND (colour + text).
- decision=ask: shortlist as tappable cards + one spoken question in a bubble ("I found two... which one?").
- Spoken-response bubble; after barge-in show cut word struck-through.
- A/B: MCP ON/OFF switch. OFF + same utterance = stock "plays first hit" (wrong song). Make contrast VISUALLY obvious - money moment. 2-3 preset utterance chips ("play raja ji") for one-click demo.

## THE PROOF STRIP (bottom translucent pill/bar = original wire-inspector)
- Live JSON-RPC frames from ws://localhost:4000/trace: method, tool, latency ms, badge. Flash green per real call. Click row -> raw JSON. Proves real MCP in 2s.
- Top: "MCP 2025-11-25" chip + badges LIVE/REPLAY/FIXTURE (small, honest, from frames).

## Move OFF main face
Breaker state, chaos inject, degradation level -> behind a small "system" toggle (top-right), not main screen.

## Design bar (ui-skills: emilkowalski/animate, kemiljk/ai-output-judgement)
- Motion: transform+opacity ONLY. ease-out cubic-bezier(0.23,1,0.32,1) for entrances ~200ms; ease-in-out cubic-bezier(0.77,0,0.175,1) for on-screen movement. Springs {type:"spring",duration:0.5,bounce:0.2} for orb/alive + interruptible. NO ease-in, NO transition:all, NO keyframes for rapid-fire (toasts/frames use transitions). Never scale(0) - start scale(0.97)+opacity:0. prefers-reduced-motion ships NOW (keep opacity, drop transform). @media (hover:hover) gating.
- Tokens: semantic CSS vars for colour/space/type/elevation. NO hardcoded hex. Native elements (button/input), not div-controls. All edge states: hover/focus/disabled/loading/empty/error. Focus rings visible. Every colour state has a text label (a11y). React keys stable (no remount reset).

## REAL host contract (verified live - match exactly)
- WS ws://localhost:4000/trace -> frame {seq,ts,direction,method,tool?,latencyMs?,sseEventId?,badge,payload}; replay last 200 on connect.
- POST http://localhost:4000/turn {text?,fixtureId?,surface?("screenless"|"screen"|"tv"),mcpOn?} -> {heard,decision,spoken{...},candidates[],confidence,traceId,badge,latencyMs,mcp{state,sessionId},breaker{state,...},edgeMode,resolutionId,evidence[],degradationLevel,serverTraceId}
- POST /barge-in {atMs} -> {cancelled,cutAtWord,wordsCompleted,cutWord,traceId,cancel,style,...}
- POST /chaos {latencyMs?,failNext?}; GET /state; GET /frames {frames[]}; GET /healthz

## Acceptance (run + paste real outputs into PROOF.md)
1. npm run build clean (tsc+vite); npm test green (update: render face from a REAL /turn response shape; proof strip renders frames from mocked WS envelope; MCP toggle flips; ask-cards render).
2. Live: with stack up, npm run dev :3000; node script opens ws://localhost:4000/trace, asserts >=1 frame arrives; POST /turn "play raja ji" mcpOn:true then false, assert both responses render decision+confidence. Capture the two decision lines (ask vs naive play) into PROOF.md.
3. Commit incrementally on agent/b-console/p1-ui. Ledger ~6 events to .omni/ledger/b-console/p2-demo.jsonl. Report <=12 lines.
