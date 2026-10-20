# alexa-lab — simulated Alexa+ host (:4000)

MCP **client** + **trace bus** + deterministic agent loop for the OmniBeat judge demo.
Sibling deployables: `omnibeat-mcp` (:8080, B-MCP), `lab-console` (:3000, B-CONSOLE).

## Run

```bash
npm install && npm run build && npm test   # 48 tests
npm start                                  # http://localhost:4000
npm run probe                              # end-to-end demo over WS /trace
```

`MCP_URL` (default `http://localhost:8080/mcp`) sets the MCP endpoint; the server may be
down — the lab boots anyway and reports `MCP_OFFLINE` / `MCP_CIRCUIT_OPEN` honestly.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /turn` | `{text?, fixtureId?, surface?, mcpOn?}` → `{heard, decision, spoken, candidates, confidence, traceId, badge, breaker, edgeMode, error?}` |
| `POST /barge-in` | `{atMs}` → cuts the playing utterance at the word index, emits `notifications/cancelled`, sets `session_set_response_style(brief)` |
| `POST /chaos` · `POST /probe` | `{latencyMs?, failNext?}` fault injection; manual health probe |
| `GET /healthz` · `GET /state` · `GET /frames` | liveness, circuit-breaker state (also in every turn), raw frames |
| `GET /tts.wav` · `WS /trace` | speech-marks waveform; trace bus (replays last 200 frames) |

`mcpOn:true` → `tools/call music_resolve_request`. `mcpOn:false` → `POST /admin/mode {naive:true}`
then the **same** tool (one server-side code path for the A/B), restored afterwards.

Badges: fixture/typed input is `FIXTURE` (typed is sub-labelled `TYPED`); only a real mic
would be `LIVE` — `src/awstranscribe.ts` is a stub, no AWS creds (ESC-001).
See `PROOF.md` for build/test/probe evidence.
