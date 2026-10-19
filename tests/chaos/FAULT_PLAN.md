# OmniBeat — RED-TEAM Fault-Injection Plan (Phase 0)

Owner: RED-TEAM. Branch: `agent/red-team/p0-attacks`. Companion to `tests/adversarial/ATTACK_LIST.md`.

**Scope.** Fault injection per demo mode (LIVE / FIXTURE / REPLAY, blueprint §11.4) for the network and upstream layers, plus the clock and randomness seams named by Charter Part 10. Every fault is injected **inside this repo against local stubs** — nothing here touches an external system.

**Environment honesty label.** Docker and Toxiproxy are **BLOCKED on this machine** (verified in the cycle-0 census, `.omni/CAPABILITIES.md`). The blueprint's §7.3 chaos row ("Toxiproxy on the MCP link") therefore cannot run as written. This plan substitutes a **node-level fault shim** and says so in every artefact it produces. When Docker becomes available (human escalation is open for credentials), the same fault catalogue ports to Toxiproxy unchanged; the shim is an implementation detail, not a different test.

## 1. Injection mechanism (node-level, honestly labelled)

| Seam | Mechanism | Notes |
| --- | --- | --- |
| Outbound HTTP to catalog adapters (Deezer/iTunes/ MusicBrainz / autocomplete) | `undici` `setGlobalDispatcher(new Agent(...))` with a **fault interceptor** wrapper (`tests/chaos/shim/fault-agent.ts` to be written by RED-TEAM or B-INFRA; RED-TEAM owns the fault semantics, the seam belongs to B-INFRA's adapter wiring) | Can inject: latency, error responses (429/500), socket destroy (hard cut), DNS-style failure (`ENOTFOUND` via a connect error), malformed JSON bodies, slow-drip bodies. |
| MCP link between alexa-lab (client) and omnibeat-mcp (server) | A **local proxy shim**: node HTTP proxy on `127.0.0.1:<fault-port>` that forwards to `127.0.0.1:8080`, with per-test fault scripts (latency, loss, mid-stream cut). The MCP client is pointed at the proxy port. | This is the honest stand-in for Toxiproxy. Label: `FIXTURE-PROXY (not Toxiproxy)`. Same wire traffic, same faults, no container. |
| SSE stream faults | The proxy shim can cut the response body mid-stream, delay `Last-Event-ID` replay, or reorder/duplicate event ids | Covers AC-02 resumability under injected disconnect. |
| Client-side breaker (continuity) | Network switch in the console already exists (§11.2); the shim drives the same states deterministically instead of a human pulling a switch | AC-13's "injected loss" input. |
| Clocks | Injected clock port (Part 10) — see §3 | No `Date.now()` in decision logic. |
| Randomness | Seeded RNG port | Hedging jitter, bootstrap CIs; tests pass fixed seeds. |

**Honesty rule for artefacts:** any latency/throughput number produced through the shim is labelled `node-shim measured`, never compared directly with a Toxiproxy number, and never quoted in the README/demo without the label (claims discipline, §9.2).

## 2. Network faults × demo mode

Each row: fault → expected rung on the degradation ladder (§8.3: L0 full → L1 skip optional sources → L2 cached catalog + aliases → L3 client edge mode → L4 honest failure) → the AC that proves it.

| # | Fault (shim script) | LIVE mode expectation | FIXTURE mode expectation | REPLAY mode expectation | Rung must engage | Proof AC |
| --- | --- | --- | --- | --- | --- | --- |
| NF-1 | **Latency > 1,200 ms** on every adapter response (600 ms stage budget exceeded, §6.1) | Resolver deadline (1,500 ms) still honoured: best-so-far result with honestly lowered confidence, usually `ask`; optional sources hedged/dropped at 250 ms (§6.1 S1) | Same code path; fixture adapter delayed by shim | Same, though replay cache should *mask* latency — assert the badge says REPLAY and cache-hit path is unaffected | L1 (skip optional) then honest L0-with-lowered-confidence | `AC04-deadline-injected-latency` (AC-04); hedging evidence in `evidence[]` |
| NF-2 | **30 % packet loss** on the MCP link (shim drops requests/ responses randomly, seeded) | Client breaker probes (§6.6: RTT > 1,200 ms in 3 of 5, or 2 consecutive failures) open the breaker; edge mode plays cached track; no dead air | FIXTURE audio keeps playing from local cache; MCP calls degrade to L2 | Replay should largely survive (local); breaker must NOT open on a healthy local replay — asserts hysteresis correctness in the other direction | L3 (client edge mode) after breaker opens | `AC13-breaker-open-loss` (AC-13) |
| NF-3 | **Hard cut mid-SSE** (shim destroys socket after N bytes of the event stream) | Client reconnects with `Last-Event-ID`; server replays from event store; missed turns appear; SIGTERM-drain style closure carries a retry hint (§8.10) | Same path | Same path; REPLAY badge stays truthful across the reconnect (AC-14 couples here) | L0 on resume (no rung change) but stream continuity proven | `AC02-sse-injected-disconnect` (AC-02), `AC13-sse-reconnect-replay` (AC-13) |
| NF-4 | **DNS failure** (`ENOTFOUND` from the shim's connect layer for adapter hosts) | Adapter marked down; breaker per upstream (§8.4) counts it; resolver continues with remaining sources; if all catalog sources are down → L2 (aliases only) → honest L4 message if nothing cached | FIXTURE providers are local → DNS fault must be *scoped to LIVE adapters only*; assert scoping | REPLAY is local → unaffected; badge REPLAY with reason "upstream unreachable" is the honest label | L2 then L4 with speakable message | `AC13-breaker-dns-fail` (AC-13), `AC04-upstream-down-tool-error` (AC-04: `isError` + code + `spoken_prompt`, never a throw) |
| NF-5 | **Total upstream outage** (all adapter fetches refused by shim for 60 s) | Breakers open per §8.4 window (5 failures / 30 s, half-open probe 15 s); health resource `omnibeat://health` reports states (§5.3); recovery closes breakers after 3 successes (hysteresis, §6.6) | Same for any LIVE-labelled piece | Same | L2 → L4; breaker states visible in health resource and console | `AC13-breaker-hysteresis` (AC-13), `AC04-never-throws` (AC-04) |

## 3. Upstream faults (catalog adapters, FIXTURE-stubbed)

Injected via the undici fault interceptor against the local adapter stubs. All are recorded-replay-shaped (§7.3 "inject 429, timeouts, malformed JSON").

| # | Fault | Expected behaviour | Rung | Proof AC |
| --- | --- | --- | --- | --- |
| UF-1 | HTTP **429** with `Retry-After` from one adapter | Adapter maps to `UPSTREAM_RATE_LIMITED` (§5.5); token bucket (§8.5) respects backoff; fusion continues with other sources; breaker counts the failure | L1 (source skipped) | `AC04-rate-limited-tool-error` (AC-04) |
| UF-2 | HTTP **500** with an HTML body (not JSON) | Adapter parses defensively → typed upstream error; **no** crash, no HTML echoed to the client or logs at info; fusion continues | L1 | `AC04-malformed-upstream-500` (AC-04) |
| UF-3 | **Timeout** (adapter never responds; shim hangs 30 s) | 600 ms stage budget (§6.1) aborts the fetch via AbortController; overall 1,500 ms deadline holds; the dangling fetch is aborted, not leaked | L1 | `AC04-deadline-injected-latency` (AC-04), `AC08-abort-upstream` reuse (AC-08) |
| UF-4 | **Malformed JSON** (truncated body / invalid UTF-8 / valid JSON with wrong shape) | Zod-validated at the adapter boundary; shape violations are adapter bugs caught as typed errors, never propagated into fusion with undefined scores | L1 | `AC04-malformed-upstream-json` (AC-04) |
| UF-5 | **Slow-drip body** (200 bytes/s for 10 s) | Stage budget aborts mid-body; no unbounded buffering; memory bounded | L1 | `AC04-deadline-injected-latency` |
| UF-6 | Upstream returns **poison metadata** (adversarial strings from the fixture corpus, §5) | Cross-links to ATTACK_LIST B-section: sanitiser + `untrusted` flag hold under degraded conditions too (a common bug: sanitisation skipped on the error/cached path) | L1, but AC-09 still enforced | `AC09-instructional-metadata` (AC-09) |

**Mode note.** In FIXTURE and REPLAY, upstream faults are injected into the *stub/replay layer*, not the network, and the resulting artefacts are labelled FIXTURE/REPLAY per §11.4. The LIVE column exists to prove the code path is the same (§11.4 "three modes, same code path").

## 4. Clock and randomness injection points (Charter Part 10: "clocks and randomness are injected")

Named seams — every one must be a constructor-injected `Clock`/`Rng` port; a test greps for direct `Date.now()`/`Math.random()` in decision paths and fails on any hit.

| Seam | Who reads it | Why injection matters | Fault test |
| --- | --- | --- | --- |
| `clock.now()` — resolver deadline | §6.1 stage budgets, 1,500 ms total deadline | Deterministic "deadline passed with best-so-far" test without sleeping 1.5 s | `AC04-deadline-clock-sim` — advance fake clock past deadline mid-pipeline; result must be honest lowered-confidence, never a hang |
| `clock.now()` — breaker windows | §8.4 (5 failures/30 s, half-open 15 s), §6.6 (close after 3 successes) | Hysteresis is time-defined; wall-clock tests are flaky | `AC13-breaker-clock-sim` — drive the full closed→open→half-open→closed cycle on a fake clock in microseconds |
| `clock.now()` — rate-limit token bucket | §5.1, §8.5 | Prove refill behaviour and that per-session and per-IP buckets don't share time state | `AC01-rate-limit-clock-sim` (needs the AC extension — see ATTACK_LIST gaps) |
| `clock.now()` — cache TTLs | §8.2 (catalog LRU 24 h, negative cache 10 min), §6.4 (hook cache "minutes"), §6.7 (alias retention 90 days) | TTL expiry is otherwise untestable; **privacy-relevant** (aliases must actually expire) | `AC11-alias-ttl-expiry` — advance 90 days; alias rows gone |
| `clock.now()` — elicitation timeout | §5.4 (ATK-35) | Hang test without hanging | `AC07-elicitation-clock-sim` |
| `clock.now()` — SSE heartbeat / event ids | §5.1, §6.6 breaker probe input | Ordering of event ids must be monotonic under replay | `AC02-sse-injected-disconnect` |
| `rng.next()` — hedging jitter | §6.1 S1 hedged requests | Determinism (Part 5.2.4: three runs, logged seeds, identical) | Seeded-hedge determinism check; identical `evidence[]` across 3 runs |
| `rng.next()` — bootstrap CIs | §7.2 eval confidence intervals | Reproducible eval numbers; seeded CI regeneration | Part of B-EVAL's suite; RED-TEAM verifies seeds are logged |
| `rng.next()` — session id generation | transport | Property test: ids unique under fixed seed **and** unguessable under production seed (assert length/entropy floor, not the exact value) | `AC01-session-id-entropy` (proposed) |

**Anti-pattern to hunt (gaming surface):** a fake clock that is only advanced in tests but never *read* in production code (clock wired around the logic). Break-it check: replace the production clock read with an unseeded system read in a scratch worktree — the determinism test (three identical runs) must fail, proving the seam is real.

## 5. Mode-specific integrity faults (tie-in with AC-14)

| # | Fault | Expectation | Proof |
| --- | --- | --- | --- |
| MF-1 | Shim serves REPLAY data while the console is switched to LIVE | Badge must read REPLAY (ledger-driven), `demo-check` refuses the mismatch | `AC14-badge-mode-mismatch` (ATK-38) |
| MF-2 | FIXTURE mode with upstream faults active (the normal eval setup) | Artefacts labelled FIXTURE even when a fault produced the interesting path; no fault result ever presented as LIVE | `AC14-badge-coverage` (ATK-39) |
| MF-3 | REPLAY mode under NF-2 loss | Replay over a lossy *local* link: replay must not falsely open the breaker (hysteresis sanity in the healthy direction) | `AC13-breaker-open-loss` inverted case |

## 6. What this plan deliberately does not do

- No real DNS rebinding server, no real cloud metadata endpoint, no external provider fault injection — all targets are local stubs (see ATTACK_LIST D-section for the labelled "shape" approximation).
- No Toxiproxy/Docker claims. Artefacts produced through the shim say `node-shim`.
- No host-audio (VAD/barge-in) fault scripting yet — AC-12 depends on the browser mic path existing (Phase 4); RED-TEAM schedules that chaos work when `alexa-lab` exists, using the Playwright fake-device path (§7.3) with injected audio gaps. Tracked as an open surface in the Phase-0 report.
- No load testing (k6 is BLOCKED per census; owned by B-INFRA/VERIFIER, not RED-TEAM).
