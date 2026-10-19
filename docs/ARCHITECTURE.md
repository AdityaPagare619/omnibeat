# OmniBeat Architecture — Contract v0

**Status:** Phase 0 draft, owner ARCH, branch `agent/arch/p0-contract`. Reviewed at
Gate G1 (J-PROTO, J-PLATFORM, PROC-AUDIT, T-TEST). The decision document is
`docs/00_OMNIBEAT_V3_BLUEPRINT.md`; this file is the engineered restatement of its
§4–§8 for the three processes we build, plus the contract-consumer map and the
full **[VERIFY] register** (final section). No spec section numbers, SEP numbers,
or error codes beyond the blueprint's are asserted anywhere in this document.

---

## 1. Executive summary

OmniBeat is three deployables on one laptop: a **standard MCP server**
(`omnibeat-mcp`, :8080) that turns transcribed music requests into a calibrated
**play / ask / repair / not_found** decision; a **simulated Alexa+ host**
(`alexa-lab`, :4000) that behaves like a real agent — real mic or fixtures, real
ASR, a real LLM tool-calling loop, a real MCP client — and emits the trace feed;
and a **thin React console** (`lab-console`, :3000) that renders voice state,
resolution evidence, continuity state, and the wire inspector. All shared shapes
live in `packages/schemas` (Zod → JSON Schema), so the server, host, and console
cannot drift apart. Every process is stateless per request; durable state sits
behind a store interface (ADR-0002), thresholds behind typed config (ADR-0003),
and upstream access behind ordered adapters with kill switches (ADR-0004).

## 2. The three deployables

| Process | Port | Role | Reads | Writes |
| --- | --- | --- | --- | --- |
| `lab-console` (apps/) | **3000** | Browser console: mic capture + AEC, Silero VAD **on-device**, Web Audio player + local cache, client circuit breaker, cards, wire inspector | Trace bus over WebSocket (PCM + events), resource updates | Local: IndexedDB/Cache Storage; queued idempotent commands |
| `alexa-lab` (services/) | **4000** | Simulated Alexa+ **host**: session manager, ASR adapter (Amazon Transcribe streaming → Web Speech / fixture transcripts), agent loop (Amazon Bedrock Converse + tool use), TTS adapter (Amazon Polly neural + speech marks), **MCP client** (Streamable HTTP), trace bus (OpenTelemetry spans → console) | `/mcp` on :8080 | Session state of its own; receipts via tools |
| `omnibeat-mcp` (services/) | **8080** | The MCP server: 8 tools, 5 resources/templates, 2 prompts, resolver pipeline (peel → candidates → verify → decide → evidence), provider adapters (Deezer · iTunes · MusicBrainz · autocomplete (optional) · demo fixtures), store (SQLite default → DynamoDB adapter) | `/mcp` (POST/GET/DELETE), upstream catalog APIs | Store only (external to the process) |

Rules that follow from the blueprint and are enforced by the contract:

- The MCP server receives **text only** — transcript, locale, ASR alternatives —
  never raw audio (blueprint §2 row 11). Audio exists inside `alexa-lab` (and the
  eval harness) only.
- The host is a *separate deployable* acting as an MCP client; any generic MCP
  client pointed at `https://…/mcp` must work (blueprint §4.1).
- The console renders logic-free views from the trace envelope and structured
  content; cards are never assembled from model prose (blueprint §6.3).

## 3. Data flow of one voice turn

```
user speech ──mic──▶ [lab-console] VAD (on-device) ──PCM + events over WebSocket──▶
   [alexa-lab] ASR adapter ──▶ transcript + n-best + locale
             agent loop (Bedrock Converse + tools)
               └─ tools/call music_resolve_request ──POST /mcp──▶ [omnibeat-mcp]
                     resolver: S0 peel → S1 candidates (hedged, 600 ms)
                               → S2 fusion → S3 phonetic → S4 version/safety
                               → S5 calibrated score → S6 decision → S7 evidence
                     ◀── structuredContent {decision, confidence, candidates,
                         spoken_prompt tiers, evidence, trace_id} (+ SSE frames)
             decision = ask && client has elicitation?
               └─ elicitation/create (flat enum) ◀──▶ user answers by voice  [VERIFY R-SPEC-03]
             TTS (Polly + speech marks) ──▶ console plays; trace envelope
                                                (kind/request|response|elicitation|…)
                                                ──WebSocket──▶ wire inspector
interrupt ──▶ VAD sustains ≥250 ms ──▶ notifications/cancelled ──▶ server aborts upstream
                                 └─▶ session_set_response_style(brief, barge_in)
```

Long call path: `music_plan_offline_cache` may return a **task handle**
[VERIFY R-SPEC-05] with progress notifications; account linking returns the
**-32042 URL-elicitation error** [VERIFY R-SPEC-04] and later signals completion
via `notifications/elicitation/complete` — no token ever passes through the model.

## 4. Protocol surface (blueprint §5.1; contract in `packages/schemas`)

- Single endpoint `/mcp`: `POST` client→server JSON-RPC, `GET` server→client SSE,
  `DELETE` ends the session.
- `initialize` negotiates `protocolVersion: "2025-11-25"`; responses carry
  `Mcp-Session-Id`; later requests carry `MCP-Protocol-Version` + session id.
  Unknown/missing session → 404, wrong version → 400, Origin mismatch → 403.
- Resumability: SSE events carry ids; reconnect replays from `Last-Event-ID`
  [VERIFY R-SPEC-01].
- Cancellation (`notifications/cancelled`) aborts upstream fetches via
  `AbortController` within the AC-08 budget; progress via `notifications/progress`.
- Server capabilities declared: `tools` (listChanged), `resources`
  (subscribe, listChanged), `prompts`, `logging`, and task support
  [VERIFY R-SPEC-05]. Client capability used: `elicitation` (form + URL);
  without it the server degrades (§5.4, ladder §6 below).
- Security: strict Zod validation on every input, request size limits, rate
  limiting per session/IP, Origin validation, bearer auth when deployed
  (`security.requireBearerAuth` in config), SSRF-safe fetcher allow-list (§8.9).
- Versioning: additive-only tool schemas within a major; breaking change ⇒ new
  tool name (§5.1).

## 5. Decision policy summary (blueprint §6.2, ADR-0003)

```
decision = PLAY    if p1 >= T_play(surface, profile)  AND  p1 - p2 >= M
           ASK     if cumulative p(top-3) >= T_cover  AND  candidates <= 3
           REPAIR  otherwise        (not_found when no candidate survives)
```

| Surface / profile | T_play | M | Source |
| --- | --- | --- | --- |
| Screen (Echo Show) | 0.85 | 0.25 | blueprint §6.2 table |
| Screenless | 0.88 | 0.30 | blueprint §6.2 table |
| TV (Fire TV) | 0.85 | 0.25 | blueprint §6.2 table |
| Kids profile | 0.93 | 0.35 | blueprint §6.2 table |
| T_cover | 0.70 (**contract draft**) | — | §6.2 defines `T_cover` but ships no value — see §9 |

All values are **starting values** read from `omnibeatConfigSchema`
(`packages/schemas/src/config.ts`); the eval harness sweeps them and publishes the
wrong-play vs ask-rate curve (§6.2). Playing the wrong song is worse than one
short question: that asymmetry is the whole point of the cost-sensitive policy.

## 6. Degradation ladder L0–L4 (blueprint §8.3)

| Rung | Meaning | Reported by | Contract surface |
| --- | --- | --- | --- |
| **L0** | Full pipeline (all sources, optional rerank/autocomplete) | MCP server | `degradation_level: "L0"` |
| **L1** | Skip optional sources (autocomplete, rerank) | MCP server | `degradation_level: "L1"` |
| **L2** | Cached catalog + household aliases only | MCP server | `degradation_level: "L2"` |
| **L3** | Client edge mode: local cache, local grammar, crossfade badge | lab-console | Client state (breaker panel); **not** in tool results — Appendix A freezes `degradation_level` to L0–L2 (see §9) |
| **L4** | Honest failure with a speakable message | any process | `isError` result with a §5.5 code + `spoken_prompt` tiers |

"Always say which rung you are on" (§8.3): server rungs ride inside tool results,
L3 is visible as the console's edge-mode badge, L4 is an explicit error result —
never silence.

## 7. Simulated vs real (blueprint §4.2 — printed in the README, kept honest here)

| Layer | Status | Notes |
| --- | --- | --- |
| Alexa+ device, wake word, Alexa's own ASR/LLM | **Simulated** | Stand-in built from Transcribe + Bedrock Converse + Polly; labelled as such everywhere |
| Microphone, VAD, speech-to-text, TTS | **Real** | Live mic; fixture-audio mode is labelled "FIXTURE" |
| Agent tool-calling loop | **Real** | Bedrock Converse tool use |
| MCP transport and protocol | **Real** | Streamable HTTP, session, version header, SSE, elicitation, cancellation, tasks **[VERIFY SDK support → R-SPEC-02]** |
| OmniBeat resolver, scoring, policy | **Real** | Open-source core, reproducible eval |
| Music catalog lookups | **Real, cached** | Public APIs; "REPLAY" badge when serving from the recorded cache |
| Full-length audio for the continuity act | **Royalty-free demo tracks** | Previews are 30 s; continuity needs full tracks we are licensed to cache |
| Provider deep links, real Alexa device integration | **Not claimed** | Roadmap (blueprint §10) |

Badge rule: every card shows **LIVE / REPLAY / FIXTURE** (blueprint §4.2); the
trace envelope carries `badge` per event so AC-14 can assert badge == ledger mode.

## 8. Contract artifacts (`packages/schemas` — @omnibeat/schemas)

| Path | Contents |
| --- | --- |
| `src/primitives.ts` | surface/profile/style enums, locale, confidence, spoken tiers, evidence, annotations, badges |
| `src/track.ts` | `Track` ($defs/Track, frozen Appendix A, `untrusted` marker) |
| `src/tools/*` | all **8** tools: name, title, LLM-oriented description, annotations, inputSchema, outputSchema |
| `src/errors.ts` | JSON-RPC protocol errors vs `isError` tool results; exactly six codes (§5.5) |
| `src/elicitation.ts` | form mode (flat enum-with-titles) + URL mode (-32042, completion) |
| `src/resources.ts`, `src/prompts.ts` | §5.3 URI templates, resources, prompt definitions |
| `src/trace.ts` | trace-bus envelope (alexa-lab → console wire inspector) |
| `src/config.ts` | typed config: thresholds, stage budgets, breakers, TTLs, flags, provider order, env-override keys |
| `scripts/generate-json-schema.ts` | Zod → JSON Schema (pinned `zod-to-json-schema@3.23.5`, dialect jsonSchema2019-09 for native `$defs`, Appendix-A pointer style `#/$defs/Track`) [VERIFY R-SPEC-01] |
| `json-schema/` | 23 committed artifacts: per-tool input/output, combined contract doc, errors, elicitation, trace, config, resources, prompts |
| `test/` | 98 smoke tests: every tool parses a valid example and rejects invalid ones; error code set is exactly the blueprint's six; elicitation/trace/config/resources/prompts |

Acceptance: `npm install && npm run build && npm test` inside `packages/schemas`.
Consumers: `omnibeat-mcp` validates inputs with the same Zod schemas it serves as
JSON Schema; `alexa-lab` types its tool loop against them; `lab-console` consumes
the trace envelope; T-TEST imports them for AC-01..20 contract tests.

## 9. Contract ambiguities for ORCH (no RQ behind these — decisions needed)

1. **`degradation_level` vs ladder**: Appendix A freezes the output enum to
   L0–L2 while §8.3 defines L0–L4. Contract keeps the frozen L0–L2 (L3/L4 are
   client/explicit-error rungs). Confirm at G1.
2. **`spoken_prompt` tiers required**: Appendix A marks `speak_short/normal/long`
   optional; §6.5 says every spoken string returns in tiers. Contract v0
   **requires all three** (deviation from the frozen JSON, justified by §6.5).
3. **`applies_until` semantics** (`session_set_response_style`): blueprint gives
   no type/expiry rule. Contract uses ISO-8601 UTC assumed = session-store TTL.
4. **T_cover default 0.70**: placeholder until the eval sweep publishes the curve
   (§6.2); must be re-picked pre-demo and recorded in ADR-0003.
5. **Error-result flattening**: whether `isError` results carry the §5.5 payload
   as `structuredContent` (and whether the declared `outputSchema` exempts them)
   also depends on [VERIFY R-SPEC-01]; B-MCP picks the flattening at G1.
6. **Resources vs resource templates**: blueprint §5.3 lists `session/{id}/context`
   and `packs/{locale}` as "Resource" rows though they are templated; contract
   models them as resource *templates*. G1 confirm.
7. **`account_link_music_service` status vocabulary** (`linked | already_linked |
   pending`) is a contract draft; final handshake wording waits for
   [VERIFY R-SPEC-04].
8. **Blueprint §5.2 heading says "7 tools"** but counts eight with privacy; the
   contract ships eight (charter Part 8.3 agrees). Doc typo for DOC-JUDGE.
9. **`hookEphemeralTtlMs` default 10 min**: blueprint says only "minutes" (§6.4);
   contract-draft value.
10. **`resource mimeType` choices** (`application/json`, `audio/mp4` for `.m4a`)
    are contract choices; §5.3 fixes URIs, not MIME types.

## 10. [VERIFY] register — all open P0 items and where the contract flags them

**Id assignment is ARCH-proposed**: `research/QUESTIONS.md` is ORCH-owned
(Charter Part 6.1) and does not exist yet; if ORCH assigns different ids, flags
are remapped mechanically (grep `VERIFY R-` in `packages/schemas`). **34 inline
flags** in source (44 including generated JSON echoes), across **18 RQ ids**.
Status: all **OPEN** at time of writing.

### R-SPEC — MCP specification and SDK (owner: R-SPEC)

| RQ id | Question | Flagged in contract / docs |
| --- | --- | --- |
| **R-SPEC-01** | Wire conformance at 2025-11-25 of: session/version header semantics, SSE event ids + `Last-Event-ID` replay, `resource_link` content block, prompt argument envelope, annotation defaults (`openWorldHint`/`idempotentHint`), JSON Schema dialect for tool schemas, `isError` vs declared `outputSchema` exemption | `primitives.ts`, `errors.ts`, `elicitation.ts`, `prompts.ts`, `trace.ts`, 5 tool files, generator header, test; ARCHITECTURE §4/§9 |
| **R-SPEC-02** | Official TypeScript MCP SDK at our pinned version: supports elicitation (form **and** URL mode), tasks, SSE resumability? Fallback = hand-written JSON-RPC for unsupported features | ADR-0001 (headline), ARCHITECTURE §7 row "MCP transport" (blueprint-inherited `[VERIFY SDK support]`) |
| **R-SPEC-03** | Form-mode elicitation shapes: flat primitives only; exact field names (`requestedSchema`?), enum-with-`title` encoding, action vocabulary (`accept/decline/cancel`?) | `elicitation.ts` (4 flags), test expectations |
| **R-SPEC-04** | URL-mode elicitation: is **-32042** the correct assigned code, what belongs in `data`, and exact params of `notifications/elicitation/complete` | `errors.ts` (2), `elicitation.ts` (4), `account_link_music_service.ts` |
| **R-SPEC-05** | MCP Tasks: capability declaration ("task support for `music_plan_offline_cache` [VERIFY]" — blueprint §5.1), task handle/status vocabulary, progress/cancellation of task-augmented calls | `music_plan_offline_cache.ts` (3), test; ARCHITECTURE §3 |

### R-PLATFORM — Alexa/Alexa+ platform and hackathon rules (owner: R-PLATFORM)

| RQ id | Question | Flagged in contract / docs |
| --- | --- | --- |
| **R-PLATFORM-01** | Official rules: dates/deadline, judging weights, video limit, what counts as a permitted simulation | Charter §12.7(1); no contract field — gates G0/G6 |
| **R-PLATFORM-02** | Open-source mini-challenge rule (created inside the event window?) — blueprint §12.5 `[VERIFY rule]` | No contract field — submission checklist |
| **R-PLATFORM-03** | Required AWS usage, credits, prize eligibility — blueprint §12.5/§12.6 `[VERIFY]` | No contract field — submission checklist |
| **R-PLATFORM-04** | Mechanism to register our HTTPS `/mcp` as an Alexa+ tool server (blueprint §10.3 `[VERIFY mechanism]`); authoritative surface list behind the frozen `surface` enum | No contract field today; Appendix A `surface` enum frozen pending this |

### R-AWS — AWS services (owner: R-AWS)

| RQ id | Question | Flagged in contract / docs |
| --- | --- | --- |
| **R-AWS-01** | Bedrock model access + region; Converse tool use availability | No contract field — alexa-lab adapter config (blueprint §12.7(4)) |
| **R-AWS-02** | Transcribe streaming language availability → which locales are actually recognisable; drives `UNSUPPORTED_LOCALE` and `supportedLocales` | `primitives.ts`, `errors.ts`, `config.ts` (3 flags) |
| **R-AWS-03** | Polly neural voices + speech marks availability — blueprint §7.2 `[VERIFY voice availability]` | No contract field — eval corpus build + TTS adapter |
| **R-AWS-04** | App Runner / Fargate quotas and pricing for the deploy target | No contract field — B-INFRA (blueprint §4.3) |
| **R-AWS-05** | AgentCore Runtime relevance/availability (optional hosting path) | No contract field — B-INFRA (blueprint §4.3) |

### R-MUSIC — catalog providers and audio licensing (owner: R-MUSIC)

| RQ id | Question | Flagged in contract / docs |
| --- | --- | --- |
| **R-MUSIC-01** | Deezer + iTunes terms, rate limits, preview licensing; defines the `provider` identifier vocabulary for `account_link_music_service` | `account_link_music_service.ts` (1 flag) |
| **R-MUSIC-02** | MusicBrainz rate-limit/User-Agent policy — blueprint §8.5 `[VERIFY all provider terms]` | `config.ts` `musicBrainzRequestsPerSecond` (1 flag) |
| **R-MUSIC-03** | Optional autocomplete adapter (unofficial source): terms/legality — ships **off by default** | `config.ts` `sourceEnabled.autocomplete` (1 flag) |
| **R-MUSIC-04** | Audio fixture licences: royalty-free full tracks for continuity; consent for real human recordings (blueprint §4.2, §7.2) | No contract field — fixtures/ + eval corpus (co-review with R-ETHICS-LEGAL) |

Rule for everyone: a field carrying `[VERIFY RQ-…]` must not be treated as
settled until that claim card exists in `research/claims/` with a primary source;
the flag stays inline until then (charter Part 6, Part 12).
