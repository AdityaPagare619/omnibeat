# alexa-lab — PROOF

Real command output, verbatim (only `...` marks elisions).
Env: Node v24.15.0, npm 11.12.1, Windows, 2026-10-19.
Worktree: C:/Users/Lenovo/Downloads/omni-wt/b-host-p1 (branch agent/b-host/p1-lab).

## 1. Build + tests

```
> alexa-lab@0.1.0 prebuild
> node scripts/ensure-schemas.mjs
[ensure-schemas] @omnibeat/schemas dist present
> alexa-lab@0.1.0 build
> tsc -p tsconfig.json
BUILD_EXIT=0
```

```
 RUN  v2.1.8 .../services/alexa-lab

 ✓ test/breaker.test.ts (5 tests) 24ms
 ✓ test/logger.test.ts (4 tests) 24ms
 ✓ test/asr.test.ts (6 tests) 54ms
 ✓ test/trace-bus.test.ts (5 tests) 174ms
 ✓ test/barge-in.test.ts (8 tests) 256ms
 ✓ test/mcp-offline.test.ts (7 tests) 277ms
 ✓ test/server.test.ts (13 tests) 791ms

 Test Files  7 passed (7)
      Tests  48 passed (48)
   Duration  7.63s
TEST_EXIT=0
```

Required five covered: trace frame emission order + WS replay (trace-bus),
breaker transitions with injected faults (breaker + chaos), barge-in
word-index cuts (barge-in + server), fixture ASR reads (asr), MCP-offline
honest error (mcp-offline + server).

## 2. Probe — LIVE MCP path (node scripts/probe.mjs)

Lab started with the MCP DOWN; the probe spawned the built server itself:

```
[probe] MCP offline — starting built server: .../b-mcp-p1/services/omnibeat-mcp/dist/index.js
[probe] MCP /healthz reachable: yes
[probe] MCP pid=23116 (leave it running for the judge)
[probe] lab MCP client state: online
[probe] breaker recovered to closed: yes
[probe] /trace replay: 38 historic frames (limit 200)
[probe] WS connected to ws://localhost:4000/trace
```

### POST /turn {fixtureId:"rajaji", text:"play raja ji", surface:"screenless", mcpOn:true} -> HTTP 200

Body: decision "ask", confidence 0.934, badge "FIXTURE", mode "mcp",
traceId "trn-70908b1b", 3 candidates (untrusted:true), tts.playing true.

```
=== frames for the turn (seq, method, tool, latencyMs, badge) (6 frames) ===
seq   dir         method                         tool                       lat     badge    reqId  sse    session
38    internal    asr.recognized                 -                          -       FIXTURE  -      -      -
39    internal    agent.mode                     -                          -       FIXTURE  -      -      -
40    host->mcp   tools/call                     music_resolve_request      -       FIXTURE  1      -      121c2e34-8fe4-48
41    mcp->host   tools/call                     music_resolve_request      686ms   FIXTURE  1      0ce5ec 121c2e34-8fe4-48
42    internal    agent.decision                 -                          -       FIXTURE  -      -      -
43    internal    tts.started                    -                          -       FIXTURE  -      -      -
```

## 3. Probe — POST /barge-in {atMs:800} -> HTTP 200 (same run)

```
{
  "cancelled": true,
  "cutAtWord": 3,
  "wordsCompleted": 3,
  "cutWord": "couple:",
  "traceId": "trn-70908b1b",
  "cancel": { "delivered": true },
  "style": { "style": "brief", "appliesUntil": "2026-10-19T16:18:40.001Z" },
  "styleError": null
}
```

```
=== frames for the barge-in (5 frames) ===
seq   dir         method                         tool                       lat     badge    reqId  sse    session
44    internal    barge_in.cut                   -                          -       FIXTURE  -      -      -
45    host->mcp   notifications/cancelled        -                          -       FIXTURE  -      -      121c2e34-8fe4-48
46    host->mcp   tools/call                     session_set_response_style -       FIXTURE  2      -      121c2e34-8fe4-48
47    mcp->host   tools/call                     session_set_response_style 23ms    FIXTURE  2      72034c 121c2e34-8fe4-48
48    internal    session.style.brief            -                          -       FIXTURE  -      -      -
```

Cancellation frame payload (real wire notification, delivered=true):

```
"payload": { "method": "notifications/cancelled",
  "params": { "requestId": "1", "reason": "barge_in at 800ms -> cut at word 3 of 30" },
  "inFlight": false, "cutAtWord": 3, "wordsCompleted": 3, "delivered": true }
```

Probe verdict: `turnHttpStatus 200, decision ask, error null, mode mcp,
badge FIXTURE, mcpStateAtEnd online, breakerStateAtEnd closed,
edgeModeAtEnd false, framesCollected 49, bargeInCancelled true,
cutAtWord 3, styleFrame session.style.brief,
cancellationFrame notifications/cancelled, mcpProcess spawned pid 23116`.

## 4. MCP-OFFLINE path — fresh lab, MCP down (separate run)

`POST /turn` inside the first seconds of boot (breaker still closed at call
time; the failed dispatch is what opens it):

```
HTTP 503 | decision=error | error=MCP_OFFLINE | badge=FIXTURE
          | tts.playing=true | breaker=open | edgeMode=true
spoken: The music service is being taken offline after repeated failures. I'll retry once it recovers.
 12 host->mcp   tools/call     music_resolve_request  delivered=false code=MCP_OFFLINE
 13 internal    tools/call.failed music_resolve_request             code=MCP_OFFLINE
 14 internal    agent.error    -                                    code=MCP_OFFLINE
 15 internal    tts.started    -
```

Same lab after 2 failed health probes (circuit open, edge mode on):

```
HTTP 503 | decision=error | error=MCP_CIRCUIT_OPEN | breaker=open | edgeMode=true
 32 host->mcp   tools/call     music_resolve_request  delivered=false code=MCP_CIRCUIT_OPEN
 33 internal    breaker.blocked music_resolve_request                code=MCP_CIRCUIT_OPEN
 34 internal    agent.error    -                                    code=MCP_CIRCUIT_OPEN
```

`delivered:false` is the honesty marker: the frame records the attempt that
never left the process. No `mcp->host tools/call` frame and no decision frame
exists in either case — the lab never invents a result. Identity of the naive
arm is covered by tests instead (server.test: `mcpOn:false` ->
`ADMIN_MODE_UNREACHABLE` with `agent.mode` frame, no `mode_restored` claim).

## 5. Gaps / honest limits

- **ESC-001 — no AWS credentials in this environment.** `src/awstranscribe.ts`
  is a commented adapter interface; every card is badged `FIXTURE` (typed input
  sub-labelled `TYPED`). Nothing claims `LIVE` audio.
- **TTS is synthetic** (250 ms/word marks + sine WAV), not Amazon Polly.
- **Naive arm not exercised live:** `/admin/mode` needs B-MCP's endpoint; with
  the MCP down the naive turn returns `ADMIN_MODE_UNREACHABLE` (tested).
  When B-MCP exposes it, one line in the probe covers the A/B.
- **`tap.diagnose` frames** are retained deliberately: any future response-capture
  gap shows up on the trace instead of silently losing `mcp->host` frames.
- `notifications/cancelled` for a barge-in lands while the call is already
  answered (`inFlight:false`, `requestId:"1"`); it is still sent on the real
  transport so the server sees the interruption.
