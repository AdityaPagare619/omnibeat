# PROOF.md — omnibeat-mcp Phase P1 (B-MCP)

All commands run on this machine (Windows, Node v24.15.0, npm 11.12.1), worktree
`C:\Users\Lenovo\Downloads\omni-wt\b-mcp-p1`, branch `agent/b-mcp/p1-server`.

## 0. Re-verification on agent takeover (independent rerun)

Re-run by the B-MCP takeover agent after handoff — not copied from the
original author's session:

```
> npm run build                         (services/omnibeat-mcp)
tsc -p tsconfig.json                    exit 0

> npm run build                         (packages/schemas)
wrote 24 json-schema/*.json             exit 0
git status --short -> clean             (regenerated files byte-identical to committed ones)

> npm test                              (vitest run)
 ✓ test/smoke.test.ts (7 tests) 1122ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
exit 0

> node dist/index.js & ; node scripts/probe.mjs ; Stop-Process (pid 21532)
[probe] target http://127.0.0.1:8080
[probe] initialize -> HTTP 200 OK | Mcp-Session-Id=769dd47b-6892-447d-b1b9-2a11dcc3f58d
[probe] negotiated="2025-11-25"
[probe] notifications/initialized -> HTTP 202 OK
[probe] tools/list -> HTTP 200 OK | count=8
[probe] tools/call music_resolve_request -> HTTP 200 OK | decision=ask confidence=0.898
[probe] exit codes: initialize=0 | notifications/initialized=0 | tools/list=0 | tools/call=0
probe exit 0
```

Server log (this rerun):

```
server_listening {"host":"127.0.0.1","port":8080,"protocol_version":"2025-11-25","replay_only":false}
resolve_completed {"decision":"ask","confidence":0.898,"surface":"screenless",
  "trace_id":"tr_279f46ba-4f9d-40ba-9c8b-231731ae06c9","session_id":"769dd47b-..."}
tool_call {"tool":"music_resolve_request","latency_ms":650,"is_error":false}
```

**Path: REAL (LIVE)** — `itunes` evidence `LIVE 3 hit(s) in 320 ms`;
`musicbrainz` `LIVE timeout: ... 615 ms` (degradation L1). No replay cache
used in this rerun; `replay_only:false` in `/healthz`. Full `RESULT_JSON` for
this run is in `probe-out.txt`. Server process killed after capture.

## 1. npm install && npm run build && npm test

```
> @omnibeat/mcp@0.1.0 install
added 147 packages in 16s            (deps pinned exact: @modelcontextprotocol/sdk@1.32.1,
                                      express@4.21.2, zod@3.23.8, @omnibeat/schemas file:../../packages/schemas;
                                      dev: vitest@2.1.8, typescript@5.6.3, @types/node@22.10.2)

> @omnibeat/mcp@0.1.0 build
> tsc -p tsconfig.json
exit 0

> @omnibeat/mcp@0.1.0 test
> vitest run
 RUN  v2.1.8 C:/Users/Lenovo/Downloads/omni-wt/b-mcp-p1/services/omnibeat-mcp
  test/smoke.test.ts (7 tests) 1935ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  2.86s
exit 0
```

The 7 tests (real HTTP against a spawned `node dist/index.js` on :8099,
`OMNIBEAT_REPLAY_ONLY=1`):

| # | test | assertion |
|---|------|-----------|
| 1 | initialize | 200 + `Mcp-Session-Id` UUID + `protocolVersion "2025-11-25"` |
| 2 | wrong `MCP-Protocol-Version` | 400 "Unsupported protocol version" |
| 3 | unknown session id | 404, JSON-RPC error code -32001 |
| 4 | Origin `https://evil.example` | 403 (our own guard; SDK option is deprecated/off) |
| 5 | tools/list | exactly 8 tools, each with title/description/annotations + `inputSchema.type=object` + `outputSchema.type=object` from the generated JSON Schema |
| 6 | music_resolve_request `"play raja ji"` screenless on replay fixture | decision ∈ {play,ask,repair,not_found}, confidence 0..1, `trace_id` `tr_*`, evidence present and REPLAY-badged |
| 7 | naive admin mode | decision `play`, confidence `1`, evidence `source:"naive-baseline"` containing "confidence forced to 1.0"; reset afterwards |

## 2. Live server start + probe (LIVE network, no replay-only)

```
C:\...\services\omnibeat-mcp> node dist/index.js          # background, port 8080
[{"ts":"2026-10-19T15:42:22.231Z","level":"info","msg":"server_listening",
  "host":"127.0.0.1","port":8080,"protocol_version":"2025-11-25","endpoint":"/mcp",
  "replay_only":false,"require_bearer_auth":false,"db":"data/sessions.db",
  "node":"v24.15.0"}]

C:\...\services\omnibeat-mcp> curl http://127.0.0.1:8080/healthz
{"status":"ok","service":"omnibeat-mcp","version":"0.1.0","protocol_version":"2025-11-25",
 "started_at":"2026-10-19T15:42:22.232Z","uptime_s":12,"sessions_in_memory":1,
 "sessions_in_store":1,"naive_baseline":false,"replay_only":false,
 "providers":{"providerOrder":["deezer","itunes","musicbrainz","autocomplete","fixtures"],
 "sourceEnabled":{"deezer":true,"itunes":true,"musicbrainz":true,"autocomplete":false,"fixtures":true}}}

C:\...\services\omnibeat-mcp> node scripts/probe.mjs ; echo exit=%ERRORLEVEL%
[probe] target http://127.0.0.1:8080
[probe] initialize -> HTTP 200 OK | Mcp-Session-Id=a793d4ec-44bd-4345-8c3b-f7c9f3d5e47d
[probe] negotiated="2025-11-25"
[probe] notifications/initialized -> HTTP 202 OK
[probe] tools/list -> HTTP 200 OK | count=8
[probe] tools/call music_resolve_request -> HTTP 200 OK | decision=ask confidence=0.898
[probe] exit codes: initialize=0 | notifications/initialized=0 | tools/list=0 | tools/call music_resolve_request=0
exit=0
```

### tools/call result JSON (verbatim, ids from this run)

```json
{
  "decision": "ask",
  "confidence": 0.898,
  "resolution_id": "res_e3e3fdeb-3853-4593-8ddc-fbe214795658",
  "candidates": [
    {"candidate_id": "it_6762846296", "title": "Raja Ji (Insta Mix)",
     "artist": "Anurag Saikia, Arya Nand Singh, Manoj Tiwari & Shashwat Dwivedi",
     "year": 2024, "version": "remix",
     "artwork_url": "https://is1-ssl.mzstatic.com/image/thumb/Music221/.../100x100bb.jpg",
     "untrusted": true},
    {"candidate_id": "it_1561347433", "title": "Raja Ji (feat. Gurlez Akhtar)",
     "artist": "Deep Chahal", "year": 2021, "version": "unknown", "untrusted": true},
    {"candidate_id": "it_1717474423", "title": "Raja Ji (feat. Shivani Yadav)",
     "artist": "Sanket Upadhyay, Sumit Ghanghas & Ashu Twinkle", "year": 2023,
     "version": "unknown", "untrusted": true}
  ],
  "spoken_prompt": {
    "speak_short": "Did you mean Raja Ji (Insta Mix) or Raja Ji (feat. Gurlez Akhtar)?",
    "speak_normal": "I found a couple: Raja Ji (Insta Mix) by Anurag Saikia, ... or Raja Ji (feat. Gurlez Akhtar) by Deep Chahal. Which one?",
    "speak_long": "I found three: ... Which one, or say none of these."
  },
  "display_hint": "none",
  "degradation_level": "L1",
  "trace_id": "tr_93712a15-348e-4ba7-9548-30f5d34e04a4"
}
```

### evidence[] (verbatim — LIVE vs REPLAY badges, failures included)

```json
[
 {"source":"heard","signal":"raw \"play raja ji\" -> peeled \"raja ji\"","weight":0.1},
 {"source":"peel","signal":"removed [play, [peel-time:10.92ms]]; stage 14.134 ms / budget 2 ms (inline locale table, SWAP POINT for B-PHON)","weight":0.05},
 {"source":"deezer","signal":"FIXTURE skipped: adapter not shipped in P1: demoted/off by default (DEC-0010, CLM-MUS-010..013) (0 ms)","weight":0},
 {"source":"autocomplete","signal":"FIXTURE skipped: kill-switch off by default (blueprint 8.4, CLM-MUS-003 family) (0 ms)","weight":0},
 {"source":"itunes","signal":"LIVE 3 hit(s) in 553 ms - attribution: provided courtesy of iTunes (CLM-MUS-003)","weight":0.2},
 {"source":"musicbrainz","signal":"LIVE timeout: hard source budget 600 ms exceeded (config.latency.candidateGeneration) (617 ms)","weight":0},
 {"source":"runner","signal":"hedged soft cutoff at 554 ms (pending sources kept to their 600 ms cap; no duplicate requests - upstream rate budgets respected)","weight":0.05},
 {"source":"local:scoring","signal":"uncalibrated v0 logistic weights: it_6762846296 sim=1.00 agree=1 p=0.898; it_1561347433 sim=1.00 agree=1 p=0.898; it_1717474423 sim=1.00 agree=1 p=0.898 (asr=0.7)","weight":0.3},
 {"source":"local:decision","signal":"play if p1>=0.88 AND margin>=0.3; ask if top3>=0.7 (surface=screenless, profile=standard); got p1=0.898 margin=0.000 top3=2.695","weight":0.1}
]
```

Why `ask`, honestly: three iTunes candidates all scored 0.898, so the margin
(p1-p2) is 0.000 < 0.30 required for screenless play. MusicBrainz exceeded its
600 ms budget (recorded as a timeout, degradation L1) — no second origin, no
margin. The system asks instead of guessing: that is the decision policy working.

## 3. Fixture capture (REAL upstream, this machine)

```
C:\...\services\omnibeat-mcp> node scripts/capture-fixtures.mjs
itunes  "raja ji": 8/8 mapped
musicbz "raja ji": 8/8 mapped
itunes  "kala chashma": 8/8 mapped
musicbz "kala chashma": FAILED status=503        <- honest, kept out of the catalog
itunes  "tera ban jaunga": 8/8 mapped
musicbz "tera ban jaunga": 8/8 mapped
itunes  "brown munde": 8/8 mapped
musicbz "brown munde": FAILED status=503
itunes  "chaap tilak sab teri": 8/8 mapped
musicbz "chaap tilak sab teri": 8/8 mapped
itunes  "काला चश्मा": 8/8 mapped
musicbz "काला चश्मा": FAILED status=503
wrote fixtures/catalog-replay/catalog.json entries=6 fetches=12 failures=3
exit 0
```

`catalog.json` stores every row with its upstream URL + HTTP status in
`capture_log` (12 fetches, 3 failures recorded verbatim). Served badged
**REPLAY**; live calls are badged **LIVE** (evidence above). Previews are never
written to disk (CLM-MUS-003).

Observed live on this machine while building (bound into adapter comments):
plain MusicBrainz Devanagari query → HTTP 503; `alias:` Devanagari query → 200
in 371 ms (CLM-MUS-006); MusicBrainz cold latency 4,548 ms > 600 ms budget.




