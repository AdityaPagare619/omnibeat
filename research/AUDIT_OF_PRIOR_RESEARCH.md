# Audit of Prior Research (DOC-JUDGE, P0)

**Auditor:** DOC-JUDGE (branch `agent/doc-judge/p0-audit`) · **Date:** 2026-10-19 (all executions/retrievals this date).
**Scope:** every file in `research/seed/`, `research/seed/MANIFEST.md`, and `docs/00_OMNIBEAT_V3_BLUEPRINT.md` (Charter Part 7).
**Evidence rule:** every claim carries a receipt — `file:line`, executed command + quoted output, or URL + retrieval date. Nothing cited that was not opened. Seed content treated as lead, never as source.

## 1. Method and coverage (honest statement)

- All 11 seed files hashed (SHA-256, raw bytes) and re-hashed after LF normalisation (§2).
- Every code listing in the seeds was extracted **verbatim** by verified line range into `scratch/doc-judge/` (untracked) and compiled/executed:
  - Python: `server.py` (bible Doc 5), `run_10_global_tests.py` (Doc 8) → `py -m py_compile`: **2/2 compile** (syntax valid; defects are semantic).
  - TypeScript: `src/index.ts`, `test/phonetic.spec.ts` (polyglot pkg), `edge_dsp_and_bunker.ts`, `page.tsx` (Doc 7), `multiroom_clock.ts` (bible Doc 5) → `tsc --noEmit --strict` (5.9.3): **4/5 clean; page.tsx fails** (F-08).
  - The polyglot package's advertised suite was **actually executed** (vitest 2.1.9, Node 24.15): **6 passed / 19 failed of 25** (F-01).
  - The two garbled regexes were **executed** against live-shaped inputs (F-03).
- Primary-source web verification: MCP spec versioning; 2025-11-25 changelog; 2025-11-25 elicitation page; 2026-07-28 changelog; hackathon rules + FAQ; PNAS 2020 paper page; npm registry (`@ricky0123/vad-web`); MusicBrainz rate-limit policy; **live probes** of the YouTube suggest endpoint, iTunes search API, and Apple preview-audio CDN (§9).
- Not covered (stated, not hidden): no MCP server implementation exists in this repo yet, so protocol behaviour could not be tested end-to-end; Deezer terms/CORS, Apple preview *terms*, Alexa+ developer-doc specifics, AWS quotas/prices, YouTube Data API quotas, and provider licence fine print are deferred to the R-scouts (see §6 register).


## 2. Inventory and hashes

| # | File | bytes | SHA-256 (raw, first 12) | MANIFEST match | Contains |
|---|------|-------|--------------------------|----------------|----------|
| 1 | `DOCUMENT 6_ EDGE DSP ENGINE...txt` | 46,403 | `58ce377eb50f` | YES | Doc 6 (DSP/TS) + **Doc 7 (page.tsx) + Doc 8 (Python harness) + Doc 9 (Makefile/rubric)** — section headers at lines 260, 970, 1113 |
| 2 | `GROUND-TRUTH-AND-IDEA-BANK.md` | 21,101 | `6cd0cee7990b` | **NO (CRLF)** | Sourced fact-check file (sections 1-6) |
| 3 | `I WOULD REQUEST YOU NOW SEE...txt` | 53,798 | `ff99ff0dc2bf` | YES | **Principal systems bible documents 1-5** (manifest misattributes these to MASTER-BLUEPRINT.txt) |
| 4 | `MANIFEST.md` | 5,163 | `73c423a07be3` | n/a | Seed manifest (corrections appended by this audit) |
| 5 | `MASTER-BLUEPRINT.txt` | 32,640 | `7aa6541468ef` | YES | Its own Documents 1-7 (SRAD); truncated at Doc 7 rule 4 of claimed 5 |
| 6 | `omnibeat-v2-final-architecture.md` | 16,501 | `a6f62d6f5ea5` | **NO (CRLF)** | v2 redesign with honest self-audit of v1 docs |
| 7 | `PILLAR-1.txt` | 4,252 | `747bdbd7c214` | YES | Music-pillar judo ideas (one long line) |
| 8 | `RESEARCH-THESIS-1.txt` | 4,252 | `f39c5cd2678a` | YES | Only **2 of 5** promised recipes; no "Kitchen Panic" framing |
| 9 | `SPIRIT.txt` | 1,504 | `13c3b974dfb1` | YES | Persona/constraints |
| 10 | `WORKING-STYLE-METHODOLOGY.txt` | 12,588 | `1b101da2e441` | YES | Phase plan + "scoring multipliers" |
| 11 | `Yes, generate the complete...txt` | 30,767 | `60220ab857c8` | YES | **Full polyglot-phonetic-judo package** (package.json, tsconfig, src/index.ts, 25-test spec, README) |

**Manifest discrepancy (F-16):** files 2 and 6 hash-mismatch vs MANIFEST on raw bytes; proved to be **CRLF conversion only** — LF-normalised SHA-256 exactly reproduces the manifest values (executed: re-hash after CRLF→LF; GROUND-TRUTH 146 lines → +146 bytes; v2-arch 184 lines → +184 bytes). Content identical; but a strict verifier recomputing raw-file hashes would FAIL the manifest check — process fix needed (normalise at manifest time or hash LF-normalised content and say so).

## 3. Missing-file register (never reconstructed)

Per Charter 1.4/7.1 and the mission brief. "MISSING" = no standalone file exists in the repo. Where the *content* survives inside a chat-dump seed file, that is recorded — extracting it for compile-checks is audit evidence, not reconstruction of a missing file.

| Expected artifact (Charter 7.1) | Standalone file | Content status | Receipt |
|---|---|---|---|
| DOCUMENT 7 (tactile studio web app) | MISSING | **PRESENT** inside `DOCUMENT 6...txt` lines 260-967 | section header line 260; extracted + typechecked (F-08) |
| DOCUMENT 8 (red-team harness) | MISSING | **PRESENT** inside `DOCUMENT 6...txt` lines 970-1110 | header line 970; py_compiles; TC-07/08/09 hard-coded True (F-04) |
| DOCUMENT 9 (Makefile runbook/rubric) | MISSING | **PRESENT** inside `DOCUMENT 6...txt` lines 1113-1156 | header line 1113; uvicorn target un-importable (F-12) |
| Principal systems bible documents 1-5 | MISSING as named files | **PRESENT** in `I WOULD REQUEST YOU NOW SEE...txt` (Docs 1-5 at lines 4, 35, 171, 298, 351) | full read |
| polyglot-phonetic-judo package (dir, 25 tests) | MISSING as a package directory | **Source + tsconfig + 25-test spec + README PRESENT** in `Yes, generate the complete...txt` lines 11-774; extracted, built, executed | §8 receipts |
| MASTER-BLUEPRINT.docx | MISSING | never supplied; **not reconstructed** | manifest L17 |
| THESE_DOC_WAS_CREATED_BEFORE_MASTER_BLUEPRINT.docx | MISSING | never supplied; **not reconstructed** | manifest L18 |

**Answer to the mission question — what MASTER-BLUEPRINT.txt actually contains:** it is a 444-line consolidation titled "Master Engineering Blueprint & Phase-Wise Execution Bible" with its own Documents 1-7: Doc 1 Executive Vision + 10-frustration/5-sub-engine matrix (L3-74); Doc 2 4-service architecture + file tree (L75-153); Doc 3 "MCP 2025-11-25 Wire Specification" + formulas (L154-194); Doc 4 72-hour phase plan (L195-261); Doc 5 DevOps compose + `verify_mcp_wire.sh` (L262-401); Doc 6 friction-log template (L402-438); Doc 7 pre-submission checklist (L439-444, **truncated**: claims "5 mandatory rules", ends mid-list at rule 4). It is **not** the principal-systems-bible documents 1-5 (those are in file #3); it overlaps them in themes but differs in structure, tool names, and topology details.

## 4. Claim register

Key: VERIFIED = checked vs primary source/execution, holds · PARTIAL = directionally right, imprecise · UNVERIFIED = no source opened · CONTRADICTED = source/execution disproves · LIKELY-FABRICATED = cannot exist as claimed · OVERCLAIM = roughly true, stated beyond evidence.

### 4a. MASTER-BLUEPRINT.txt (MB)

| ID | Claim (line) | Class | Receipt |
|---|---|---|---|
| MB-01 | Alexa+ 1st place $25,000 (L1) | VERIFIED | rules L530 |
| MB-02 | Deadline Oct 23 2026 12:00 PT (L440) | VERIFIED | rules page header |
| MB-03 | MCP 2025-11-25 Streamable HTTP judged target (L155) | VERIFIED | rules L311/L368 |
| MB-04 | "deprecated 2024-11-05 two-endpoint HTTP+SSE" (L155) | PARTIAL | HTTP+SSE deprecated since 2025-03-26 (2026-07-28 changelog dep #2); era imprecise |
| MB-05 | Origin invalid -> 403 per spec (L159) | VERIFIED | 2025-11-25 changelog minor #3 (PR 1439) |
| MB-06 | Mcp-Session-Id minted at initialize; MCP-Protocol-Version header (L160-162) | VERIFIED for 2025-11-25 | removal in 2026-07-28 (SEP-2567) confirms prior existence |
| MB-07 | `InputRequiredResult` usable in 2025-11-25 server (L167-168) | CONTRADICTED | MRTR/InputRequiredResult is 2026-07-28 (SEP-2322), changelog item 7 |
| MB-08 | Follow-up POST "carrying inputResponses" (L168) | CONTRADICTED for 2025-11-25 | same: MRTR retry pattern |
| MB-09 | JSON-RPC -32042 URL elicitation (L74, L430) | VERIFIED | 2025-11-25 elicitation page: "URLElicitationRequiredError (code -32042)" |
| MB-10 | "SEP-1036" = URL elicitation (L130, L247, L430) | VERIFIED | 2025-11-25 changelog item 6 (SEP-1036) |
| MB-11 | "SEP-1330 chorus hook elicitation" (L1146; D6 L777/805) | LIKELY-FABRICATED | changelog item 5: SEP-1330 = ElicitResult/EnumSchema titled-enum update |
| MB-12 | Header `Mcp-Param-Locale-Hint` (L32) | UNVERIFIED | no such header in spec; `x-mcp-header` exists only in 2026-07-28 (SEP-2243) |

| MB-13 | "intercepts 80% of deterministic intents in <80ms" (L43); "<60ms" JSON fast path (L165) | UNVERIFIED | no implementation or measurement exists; contradicted nowhere but unsupported |
| MB-14 | "30% higher WER on regional/non-native accents like Bhojpuri, Scottish, Nigerian" (L28) | UNVERIFIED / OVERCLAIM | no source; the famous PNAS 2020 study (opened) reports WER 0.35 vs 0.19 (~2x) for Black vs white US speakers — different population, different magnitude |
| MB-15 | "must pass 25/25 mangled accent queries in under 15ms" (L211) | CONTRADICTED by execution | vitest run: 6 passed / 19 failed (F-01) |
| MB-16 | compose boots all 4 services <45s (L261) | UNVERIFIED | no buildable repo; compose healthcheck hits `/health` which server.py never defines (F-13) |
| MB-17 | GitHub collaborator invites expire after 7 days (L443) | PARTIAL | usernames themselves VERIFIED in rules L358; expiry claim not opened (defer R-PLATFORM) |
| MB-18 | Six named judge GitHub usernames (L260, L443) | VERIFIED | rules L356-358 list exactly these six |
| MB-19 | Rules quote: no third-party trademarks/copyrighted music without permission (L441) | PARTIAL | rules video section opened (L376-382: <3 min, YT/Vimeo, functioning-as-depicted); exact trademark sentence not captured in my extract — GROUND-TRUTH L21 quotes it; defer final wording to R-PLATFORM |
| MB-20 | "5 mandatory rules" in Doc 7 (L440) but file ends at rule 4 (L444) | CONTRADICTED | `ReadAllLines` = 444 lines; last line = rule 4 (F-14) |
| MB-21 | Breaker "when ping exceeds 1,200ms" (L61) vs PILLAR-1 "1,500ms" | UNVERIFIED + internal inconsistency | PILLAR-1 L2 ("ping exceeds 1,500ms") |
| MB-22 | Multi-room "snaps waveforms to 0.0ms offset" (L67) | OVERCLAIM | no real audio path; UI animates state only (D6 L367-386) |
| MB-23 | docker healthcheck `curl -f http://localhost:8080/health` (L288) | CONTRADICTED by sibling listing | server.py (bible Doc 5) defines only `/mcp`; no `/health` route exists |

### 4b. Principal systems bible 1-5, in "I WOULD REQUEST..." (IW)

| ID | Claim (line) | Class | Receipt |
|---|---|---|---|
| IW-01 | "YouTube Suggest… under 35ms" (L14, L53) | PARTIAL | endpoint live-verified working (§9); latency figure unmeasured here |
| IW-02 | iTunes = "legal 30-second .m4a AAC streams" (L17) | OVERCLAIM | endpoints public + CORS-open (§9); "legal" needs terms review (R-MUSIC) |
| IW-03 | "mathematically proves" ghost triggers (L34) | OVERCLAIM | code writes a hash chain but nothing ever verifies it; rhetoric exceeds artifact |
| IW-04 | server.py implements POST/GET/DELETE `/mcp` (L154-158 tree; Doc 3 claims) | CONTRADICTED by own code | listing has `@app.post` only (L607); no GET/DELETE handlers exist |
| IW-05 | server.py compiles (L363-778) | VERIFIED | `py -m py_compile` exit 0 |
| IW-06 | PID controller with Kp/Ki/Kd "glides to 0.0ms, zero audible clicking" (L155-165, L789-842) | CONTRADICTED by own code | computed rate never affects position; `correctedJitter = jitter*0.72` hard-coded (L830), `localCursorMs = masterClockMs` snap (L835) — decorative loop |
| IW-07 | Frame A/B/C "copy-paste ready compliance payloads" (L212) | PARTIAL/CONTRADICTED | Frame B result shape (`status:"input_required"` inside tool result, L273) is not a spec result type in any revision; Frame C -32042 shape approximates spec `elicitations` but diverges |
| IW-08 | TC-01..TC-10 quantitative SLAs "verified deterministically" (L844-900) | CONTRADICTED as method | the actual harness hard-codes TC-07/08/09 to True and prints "10/10 … RESOLVED" unconditionally (D6 L1092-1105) |
| IW-09 | Friction-log entries FL-01..FL-04 described as real friction (L402-438) | LIKELY-FABRICATED (as friction) | they describe a platform feature set that does not exist ("Alexa+ MCP context header", "x-mcp-playback-cursor"); presenting these to Amazon as encountered friction would be inventing platform feedback |
| IW-10 | `vpps_similarity` substring shortcut returns constant 0.94 (L488-489) | VERIFIED as code fact | read at L488-489; magic constant, no calibration |
| IW-11 | "In-Memory Quantized Embedding Cosine Router… 12ms" (L23) | UNVERIFIED | no such component in any listing |

### 4c. DOCUMENT 6 dump, incl. Docs 7/8/9 (D6) and polyglot package (PG)

| ID | Claim (line) | Class | Receipt |
|---|---|---|---|
| D6-01 | "vocalPresenceRatio" returned as a measurement; hard-coded 0.88 (L197) | CONTRADICTED by code | value never computed; constant returned |
| D6-02 | "Conflict-Free Replicated Data Type (CRDT) Command Queue" (L8, L208-256) | OVERCLAIM | plain array push/drain; no replication, merge, or conflict resolution |
| D6-03 | "LIVE MCP Wire Inspector" shows real traffic (L264, L938-964) | CONTRADICTED by code | no `fetch`/socket anywhere in page.tsx; session id = `Math.random()` (L354); every frame built by `pushWireFrame` with canned strings (L356-362, 418-556) |
| D6-04 | TC-07/TC-08/TC-09 assertions (L1092-1094) | CONTRADICTED | literally `("TC-07", …, True)`, same for 08/09 |
| D6-05 | "VERDICT: 10/10 GLOBAL FRICTIONS DETERMINISTICALLY RESOLVED ($0.00 API COST)" (L1105) | CONTRADICTED | printed unconditionally after the loop; true even if every TC fails |
| D6-06 | Makefile `run-mcp` uvicorn target (L1126) | CONTRADICTED by execution | `find_spec('services.omnibeat-mcp-server.src.server')` -> ModuleNotFoundError; hyphens are not importable module segments |
| D6-07 | Makefile references `scripts/verify_mcp_wire.sh`, `demo/run_10_global_tests.py` (L1134-1138) | UNVERIFIED / WIP | no such files exist in any repo yet; MASTER-BLUEPRINT's own copy of the shell script is truncated at 3 of 4 steps (L329-401) |
| D6-08 | page.tsx is "production implementation" (L263) | CONTRADICTED | `tsc --strict` fails: pushWireFrame call missing required `latencyMs`, `summary` (extracted page.tsx L281 = source L546-555) |
| D6-09 | Rubric "Official Amazon Judging Criterion (25% each)" (L1141-1146) | VERIFIED | rules L466-474: four equally weighted criteria |
| D6-10 | "$0.00 Keyless Arbitrator" / "$0.00 API COST" badges (L752, L1105) | OVERCLAIM | iTunes free + official-free; core phonetic path depends on an unofficial endpoint with no CORS and no terms (F-06); "forever" unprovable |
| D6-11 | edge_dsp_and_bunker.ts + multiroom_clock.ts compile | VERIFIED | tsc strict exit 0 |
| D6-12 | "Decodes any 30-second AAC preview from the zero-key iTunes API" in-browser (L7) | PARTIAL | live probe: Apple preview CDN sends ACAO `*` (§9) so CORS works today — but the code never fetches anything (D6-03) and CDN behaviour is volatile |

| PG-01 | "25/25 unit tests" pass (L509-510; MASTER-BLUEPRINT L211) | CONTRADICTED | executed: 6 passed / 19 failed (F-01) |
| PG-02 | Tests verify the engine "not hardcoded demo smoke" (L2) | CONTRADICTED (circular) | `ASR_HOMOPHONE_CLUSTERS` (L201-235) hard-codes ~30 specific songs; tests 02-20 assert similarity=1.0 on those same pairs — the test data IS the rule table (F-02) |
| PG-03 | `toVppsSkeleton` strips parenthetical metadata (L264-265) | CONTRADICTED by execution | `s.replace(/\|\[[^\]]*\]/g," ")` has an empty left alternation: executed probe shows spaces inserted at every position; all cluster/digraph regexes then fail to match (F-03) — root cause of the 19 failures |
| PG-04 | Suggest-parser regex (L494) | CONTRADICTED (garbled) | `[,\vert{}\]]` is a character class containing letters v,e,r,t + `{`,}`,`]`; executes and accidentally matches the canonical JSONP shape but accepts wrong delimiters |
| PG-05 | README "under 2 milliseconds" (L738); test "<5.0ms" (L717); MB "<15ms" (L211) | OVERCLAIM + inconsistent | three different budgets for the same engine; no benchmark artifact; suite does not even pass |
| PG-06 | README "eliminate the 30% higher speech-to-text error rate… worldwide" (L733) | UNVERIFIED | no source (see MB-14) |
| PG-07 | "zero-dependency" (L1, L73) | VERIFIED | package.json has devDependencies only |
| PG-08 | `arbitrateWithZeroCostYoutubeSuggest` usable in browser (L477-507) | CONTRADICTED by live probe | suggestqueries.google.com returns no `Access-Control-Allow-Origin` (§9); browser fetch fails; function silently returns `rawPayload` |
| PG-09 | license MIT (L40) | VERIFIED (declared) | package.json; no LICENSE file in listing (minor) |
| PG-10 | "Soundex… delete all vowels after the first letter" (L736) | PARTIAL | broadly true for Soundex; Metaphone retains initial vowels — slight overgeneralisation |
| PG-11 | Articulatory costs "labials b/v/w/p/f cost 0.18" (L741) | VERIFIED as code fact | matches `phonemeSubstitutionCost` (L303-311); not validated against phonetics literature (design opinion, not evidence) |

### 4d. GROUND-TRUTH-AND-IDEA-BANK.md (GT), v2 architecture (V2), short files (P1/RT/WS/SP)

| ID | Claim (line) | Class | Receipt |
|---|---|---|---|
| GT-01..12 | Hackathon facts: deadline, prizes, track requirement, runtime-hook, FAQ MCP-client path, partner-gating, friction 10%, judging criteria + tie-break, repo rule, reviewer usernames, video <3 min, mini-challenge terms (L10-26) | VERIFIED | rules page + FAQ (L311, L327, L352, L358, L376-382, L412, L466-506, L530, L548; FAQ L215-217, L313-315), opened 2026-10-19 |
| GT-13 | MCP table: 2026-07-28 current; session id + Last-Event-ID + ping removed; subscriptions/listen; MRTR = SEP-2322; tasks SEP-1686; URL mode + -32042 real; SEP-1036 correct (L34-47) | VERIFIED | versioning page + both changelogs + elicitation page, opened |
| GT-14 | "Alexa+ for Builders supports the 2025-11-25 version" (L58) | UNVERIFIED by this audit | not opened; R-PLATFORM |
| GT-15 | OAuth 2.1 + PKCE S256, <500 ms RTT expectation, RFC 9728 PRM (L59) | UNVERIFIED by this audit | R-PLATFORM/AWS |
| GT-16 | Personality styles Brief/Chill/Sweet/Sassy (L61) | UNVERIFIED by this audit | R-PLATFORM |
| GT-17 | YouTube Data API 10,000 units/day; 100 units/search (L121) | UNVERIFIED by this audit | R-MUSIC/AWS |
| GT-18 | MusicBrainz ~1 req/s + meaningful User-Agent (L383 blueprint too) | VERIFIED | musicbrainz.org rate-limit page opened (§9) |
| GT-19 | @ricky0123/vad-web ISC, real package (L90) | VERIFIED | npm registry latest 0.0.31, license ISC (§9) |
| GT-20 | Hash-chain ~35% storage overhead (L98) | UNVERIFIED by this audit | SECONDARY source per GT; R design review |

| GT-21/22 | "iTunes ~20 calls/min"; Spotify preview_url deprecated (L144) | UNVERIFIED (GT self-marks "verify") | good practice; R-MUSIC |
| GT-23 | openWakeWord models CC BY-NC-SA; Porcupine commercial (L95) | UNVERIFIED by this audit | R-ETHICS-LEGAL |
| V2-01 | "YouTube Suggest… tested live: 'lolly pop la gelu song' -> 'lollipop lagelu song'" (L77) | VERIFIED (reproduced) | my live probe returned the same top hit (§9) |
| V2-02 | "iTunes verified live: real trackName/trackId/previewUrl for 'Lollipop Lagelu'" (L79) | VERIFIED (reproduced) | my probe: resultCount=2, trackName "Lollipop Lagelu", previewUrl present (§9); artist shown as "Deepak Dabangi", not "Pawan Singh" as seed demos assume — fixture titles must be re-checked against live data |
| V2-03 | "Their web app is mocked… biggest doc weakness" (L168) | VERIFIED | independently confirmed (D6-03) |
| V2-04 | "iTunes previews are signed/expiring — resolve per session, never cache" (L171) | PARTIAL | preview URL today is a long-lived CDN object (Cache-Control ~28,297,987 s observed, §9) — expiry behaviour unproven either way; treat as volatile, keep v2's defensive advice |
| V2-05 | "ONNX tier… 30-90MB model download" (L99) | UNVERIFIED by this audit | plausible class of number; measure before use (blueprint already defers this tier) |
| P1-01 | "InputRequiredResult elicitations" in 2025-11-25 (L2) | CONTRADICTED | era error, same as MB-07 |
| P1-02 | "Search engines are 100x better at fuzzy phonetic typos than Spotify's API" (L2) | UNVERIFIED / fabricated multiplier | no measurement; rhetorical |
| P1-03 | "Music APIs (Spotify/Amazon Music) require exact title spelling" (L2) | OVERCLAIM | no provider test; catalogs do partial matching; needs R-MUSIC test |
| P1-04 | "phonetic English gibberish" framing (L2) | LANGUAGE FINDING | F-11 |
| RT-01 | "five recipes and Kitchen Panic framing" (Charter 7.1 description) | CONTRADICTED | file contains 2 recipes, no Kitchen Panic; Charter's own seed description is wrong |
| RT-02 | "spelled it in dumb English words" (L2) | LANGUAGE FINDING | F-11 |
| WS-01 | "official Devpost rules… up to a 10% judging bonus" for friction logs (L15) | VERIFIED | rules L412, L498 |
| WS-02 | Contenders "Recall Guardian", "Once Upon a Voice", "AcousticShield" (L9-11) | PARTIAL | existence of these Alexa+-track projects corroborated only by GT L26 ("verified live project pages") — this audit did not open their pages; R-PRIORART |
| WS-03 | "judges spend less than 90 seconds scanning README" (L71) | UNVERIFIED | folklore statistic, no source |
| WS-04 | 2026 MCP & AI Agents Hackathon reference (L2) | UNVERIFIED by this audit | R-PLATFORM |
| SP-01 | Hackathon identity + MCP 2025-11-25+ Streamable HTTP requirement (L9-10) | VERIFIED | rules L311/L368 |

## 5. Top 25 findings, ranked by how badly a sharp expert would react

| # | Finding | Claims | Proof |
|---|---|---|---|
| F-01 | The polyglot package's headline "25/25 tests pass" is false: extracted suite runs **6 passed / 19 failed**. Root cause traced to a stray empty-alternation token in the VPPS encoder. | PG-01, PG-03, MB-15 | `npx vitest run` (vitest 2.1.9, Node 24.15): "Tests 19 failed / 6 passed (25)"; failing ids 02-10, 12-17, 19, 20, 23 |
| F-02 | Phonetic "rescue" is a lookup table of ~30 hard-coded songs; tests 02-20 assert similarity=1.0 on the very pairs the table encodes — circular evidence (Charter 5.1 "outputs keyed on test inputs"). | PG-02 | seed L201-235 (table) vs L537-636 (tests); e.g. cluster `[roger g -> rajaji]` + test 02 "Roger G" vs "Raja Ji" |
| F-03 | Doc 7's "LIVE wire inspector" fabricates every frame client-side: zero network calls in page.tsx; session id = Math.random(); latencies canned. | D6-03 | page.tsx L352-363 (fake handshake on mount), L418-556 (all frames via pushWireFrame) |
| F-04 | Red-team harness hard-codes TC-07/08/09 to `True` and prints "VERDICT: 10/10 … RESOLVED ($0.00 API COST)" **unconditionally** — green on total failure. | D6-04, D6-05, IW-08 | run_10_global_tests.py L1092-1094, L1105; py_compiles (semantic defect) |
| F-05 | "SEP-1330 chorus hook elicitation" misattributes a real SEP to a product feature (SEP-1330 = ElicitResult/EnumSchema titled-enum update). | MB-11 | 2025-11-25 changelog item 5, opened 2026-10-19 |

| F-06 | The "planetary typo arbitrator" is an unofficial endpoint with no CORS header and unclear terms — and the shipped browser function silently returns raw input when (not if) it fails. Live probe: works server-side, unusable cross-origin in a browser. | PG-08, D6-10, IW-01 | `Invoke-WebRequest https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=lolly+pop+la+gelu+song` -> 200, top hit "lollipop lagelu song", `Access-Control-Allow-Origin` EMPTY; code path: index.ts L488-506 catch -> `return rawPayload` |
| F-07 | The v1 "wire spec" teaches a flow that does not exist in the target revision: `InputRequiredResult` + `inputResponses` follow-up are 2026-07-28 MRTR constructs applied to a 2025-11-25 server. | MB-07, MB-08, P1-01 | 2026-07-28 changelog item 7 (SEP-2322), opened |
| F-08 | page.tsx ("production implementation") fails `tsc --strict`: the final wire-frame call omits required `latencyMs` and `summary` fields. | D6-08 | `tsc --noEmit --strict … page.tsx` -> error TS2345 at extracted L281 (= source L546-555) |
| F-09 | The bible's PID "phase-lock controller" is decorative: computed PID output never affects position; jitter decays by a hard-coded 0.72 factor and the cursor snaps to the master clock. | IW-06, MB-22 | multiroom_clock.ts L827-835 (rate computed L828, unused; `correctedJitter = jitter*0.72` L830; `localCursorMs: masterClockMs` L835); compiles clean — the bug is design, not syntax |

| F-10 | "CRDT Command Queue" is a plain JavaScript array (push/drain); no replication, merge, or conflict resolution anywhere. | D6-02 | DOCUMENT 6 L205-257 |
| F-11 | Respectful-language violations: "mangled", "gibberish", "dumb" applied to ASR output of accented speech in at least 8 seed files (see §7 list). Banned by Charter 0.2#9 and blueprint §1/§9. | P1-04, RT-02 | grep hits: PILLAR-1 L2; RESEARCH-THESIS-1 L2/L15; WORKING-STYLE L31/L105; MASTER-BLUEPRINT L31/L211; bible L14; package.json description L14; DOCUMENT 6 L757 |
| F-12 | The seed Makefile `run-mcp` target is unrunnable: uvicorn module path contains hyphens. | D6-06 | executed: `importlib.util.find_spec('services.omnibeat-mcp-server.src.server')` -> ModuleNotFoundError |
| F-13 | Doc 2 compose healthcheck curls `/health`; Doc 5 server.py defines no such route — the reference architecture cannot pass its own healthcheck. | MB-16, MB-23 | MASTER-BLUEPRINT L288 vs server.py listing (no `/health` handler) |
| F-14 | MASTER-BLUEPRINT.txt is truncated: "verify these 5 mandatory rules" but the file ends at rule 4 of 444 lines. | MB-20 | `ReadAllLines` count 444; last line = rule 4 |
| F-15 | Two seed files hash-mismatch the MANIFEST on raw bytes (CRLF conversion); a strict hash-recompute gate would fail today. Content identical after LF normalisation. | — | re-hash after CRLF→LF reproduces manifest values exactly (G-T 146 lines/+146 B; v2 184/+184) |
| F-16 | The VPPS stray-token bug means the engine silently degrades to "strip non-alnum + collapse dupes" for ALL inputs — every digraph rule and homophone cluster is dead code in the shipped listing. | PG-03 | executed: `toVppsSkeleton("lolly pop la gelu")` -> `" l o l l y   p o p   l a   g e l u "`; `/\blolly\s*pop\b/i.test(t)` -> false |
| F-17 | Suggest-parser regex is garbled (`[,\vert{}\]]` character class with literal letters; `\v` = vertical tab). Compiles, accidentally matches the canonical JSONP shape, accepts wrong delimiters. | PG-04 | executed probe in §8 |

| F-18 | Friction-log entries FL-01..FL-04 describe features that do not exist on the platform ("Alexa+ MCP context header", "x-mcp-playback-cursor") as if encountered — submitting them would be inventing platform feedback and risks the friction-log bonus instead of earning it. | IW-09 | bible L402-438 vs rules L412 (bonus for real entries) and blueprint 12.5 ("only real, reproducible entries") |
| F-19 | Latency claims are mutually inconsistent and unmeasured: engine "<2 ms" (README), "<5 ms" (its own test), "<15 per query" (MB exit test); fast-path "<80 ms" vs "<60 ms" vs "<50 ms" in three documents. | PG-05, MB-13 | seed line refs in §4 |
| F-20 | "30% higher WER on regional/non-native accents" appears in 3 seed files with no dataset; the closest real study (PNAS 2020, opened) measures ~2x WER for Black vs white US speakers — different claim entirely. | MB-14, PG-06 | pnas.org/doi/10.1073/pnas.1915768117, opened 2026-10-19 |
| F-21 | Doc 5 server.py claims POST/GET/DELETE `/mcp` but implements only POST; unknown methods return `{"ok": true}` — a catch-all that converts failure into success (Charter 5.1 automatic FAIL pattern). | IW-04 | server.py listing: single `@app.post` (L607); final `return JSONResponse(content={… "ok": True})` (L778) |
| F-22 | Hash chain is write-only: nothing ever verifies `prev_hash`/`entry_hash`; two concurrent appends can read the same last hash (no BEGIN IMMEDIATE around read+insert), so the "cryptographic proof" can fork silently. | IW-03, IW-10 | server.py L416-458 (read L432, insert L439; `isolation_level` set per-connection, no explicit transaction) |
| F-23 | GROUND-TRUTH-AND-IDEA-BANK.md — the only seed file that behaves like evidence — verified correct on every claim this audit checked (14/14 opened), including counter-intuitive ones (2026-07-28 revision, MRTR era, -32042). Trust ranking: GT > V2 > all others. | GT-01..19 | §4d receipts |
| F-24 | MANIFEST mislabels content presence: DOCUMENT 7/8/9 marked MISSING though present inside the DOCUMENT-6 dump; bible 1-5 misattributed to MASTER-BLUEPRINT.txt; polyglot package content present in "Yes, generate..." — the missing-file picture drives research scope, so wrong labels waste scout time. | — | §3 table |
| F-25 | V2 architecture (omnibeat-v2-final-architecture.md) independently identified the mock-wire and uncalibrated-latency problems (L168-172) — the seed set contains its own correct audit; v3 blueprint should cite it as the baseline rather than re-deriving. | V2-03 | v2 L167-176 |

## 6. [VERIFY]-tag register (from docs/00_OMNIBEAT_V3_BLUEPRINT.md)

15 genuine tags (L117 "verify" is prose, excluded). Each becomes a research question.

| RQ | Blueprint tag (line) | Research question | Owner | Priority |
|---|---|---|---|---|
| RQ-DJ-01 | L75 "unless verified [VERIFY]" | What exactly does SEP-1330 specify, and what is the correct 2025-11-25 mechanism name for server-initiated disambiguation? (Audit answer: SEP-1330 = ElicitResult/EnumSchema titled enums — VERIFIED; cite "elicitation/create, form mode, oneOf enums" instead.) | R-SPEC | P0 (answered) |
| RQ-DJ-02 | L133 "[VERIFY SDK support]" | Does the pinned TypeScript MCP SDK release support 2025-11-25 Streamable HTTP: session, version header, SSE, elicitation (form + URL), cancellation, tasks? Record exact SDK version + evidence. | R-SPEC | P0 |
| RQ-DJ-03 | L146 "[VERIFY]" (same SDK question, tech-decision row) | As RQ-DJ-02; if gaps, list which messages must be hand-written. | R-SPEC | P0 |
| RQ-DJ-04 | L153 "[VERIFY terms and rate limits]" | Deezer API terms for previews + rate limits; iTunes Search API terms + published/observed rate limits; MusicBrainz terms (1 req/s VERIFIED by this audit). | R-MUSIC | P0 |
| RQ-DJ-05 | L170 task support "[VERIFY]" | Is experimental `tasks` (SEP-1686) supported in the pinned SDK, and is `music_plan_offline_cache` worth task-augmentation vs progress notifications (charter cut-line says cut tasks)? | R-SPEC | P1 |
| RQ-DJ-06 | L340 "[VERIFY voice availability]" | Which Polly voices exist for hi-IN, es-US/MX, ko-KR, ja-JP, pt-BR, en-ZA/en-NG today, and which support neural + speech marks? | R-AWS | P0 |

| RQ-DJ-07 | L383 "[VERIFY all provider terms]" | Full provider-terms pass incl. caching rights for replay cache and preview clipping for hooks. | R-MUSIC + R-ETHICS-LEGAL | P0 |
| RQ-DJ-08 | L402 "[VERIFY provider terms for previews]" | Are 3 s hook clips cut from previews permitted under provider terms? Preview-only + ephemeral is the blueprint's stance; get the written basis or drop hooks. | R-ETHICS-LEGAL | P0 |
| RQ-DJ-09 | L445 "[VERIFY mechanism with the hackathon docs]" | How does one register an MCP server with real Alexa+ — does any official path exist for hackathon participants? (FAQ opened by this audit: tooling is partner-gated, no application path — answer leans "no official path; simulated-host + generic-client is the sanctioned route".) | R-PLATFORM | P0 (partly answered) |
| RQ-DJ-10 | L531 "[VERIFY dates]" | Deadline Oct 23 2026 12:00 PM PT — VERIFIED by this audit (rules header). Remaining: internal phase dates vs 4-day plan. | R-PLATFORM / ORCH | P1 (mostly answered) |
| RQ-DJ-11 | L586 "[VERIFY exact columns]" | Exact friction-log columns required by the rules (my read: task attempted, steps taken, expected vs actual, severity, workaround, actionable suggestion — rules L412; confirm formatting + where to submit). | R-PLATFORM | P1 |
| RQ-DJ-12 | L587 "[VERIFY rule]" | Open Source mini-challenge window rule: new repo OR contribution "during the hackathon window"; PRs need not be merged (rules L327 VERIFIED); confirm what counts as "created in-window" for a spun-out package. | R-PLATFORM | P1 |
| RQ-DJ-13 | L588 "[VERIFY requirement]" | Is AWS usage required or optional for Alexa+ track? (Rules text I opened does not mandate AWS for the track; AWS Builder mini-challenge is separate, $5k+$5k, credits form closed Oct 21 per GT L24 — verify current status.) | R-AWS + R-PLATFORM | P1 |
| RQ-DJ-14 | L592 "[VERIFY]" (weights) | Judging criteria weights: VERIFIED by this audit as four equally weighted (rules L466-474); tie-break = first listed criterion (L506). | R-PLATFORM | P0 (answered) |
| RQ-DJ-15 | L5 "check them on Day 0" (global) | Day-0 recheck pass: re-open rules + spec pages within 48 h of submission (volatile facts rule, Charter 6.4). | ORCH | P0 (process) |

## 7. Weak/wrong things in the v3 blueprint itself (with fixes)

| # | Weakness (blueprint line) | Why wrong/weak | Proposed fix |
|---|---|---|---|
| W-01 | Eval corpus is synthetic-first: Polly synthesises speech that Transcribe then recognises (L340-342). | Same-vendor circularity: Amazon voices through Amazon ASR will under-represent real accent difficulty and can flatter the resolver; the 20 clips of "teammates and friends" cannot repair a biased primary corpus. | Invert the emphasis: make real human recordings (≥30 clips/locale, consented) the primary corpus; keep synthetic as a controlled secondary set; report synthetic and real numbers separately in `eval/report.md`. |
| W-02 | Per-locale "measured accuracy" promises with n≈8 titles/locale (L339, L328). | ~8 titles × 3 conditions ≈ 24 observations/locale, split held-out → wrong-play-rate CIs per locale will be tens of points wide; labelling packs with a "measured accuracy" from that is noise dressed as signal. | Pool claims per language family until n≥30 per locale; publish Wilson intervals; keep the `experimental` tag until the interval is decision-useful (blueprint already has the tag — apply it to all packs on day one). |
| W-03 | S5 "calibrated… 0.9 means ≈90%" (L235) with a logistic model over ≥6 features trained on the corpus above. | Statistically underpowered: Platt/isotonic calibration on ~50-60 utterances with 6+ features will overfit; the calibrated-confidence story then rests on a number the data cannot support. | Shrink to 2-3 features or temperature scaling; bootstrap the calibration curve with CIs; if CI is too wide, ship uncalibrated margins + thresholds (the decision policy at L248 works on raw margins anyway). |
| W-04 | `account_link_music_service` error shape "…-32042 (URL elicitation required) with `elicitationId` and `url`" (L186, L208). | The spec (2025-11-25 elicitation page, opened) requires the error to carry **URL-mode elicitations with `elicitationId`**, as elicitation requests (mode/message/…), and mandates client consent UX; a bare `{elicitationId, url}` pair is a plausible-looking shape that contract tests against a real client could reject. | Write the exact spec example shape into Appendix A; add a contract test replaying the spec's own sample frame; remember `elicitationId`/`notifications/elicitation/complete` are removed in 2026-07-28 — pin the version everywhere. |

| W-05 | S1 candidate-generation budget "600 ms hard timeout" includes MusicBrainz (L231), while §8.5 enforces "~1 request/second" token bucket (L383). | Under any concurrency (k6 load test with 50 sessions, L370), the 1 rps token bucket queues MusicBrainz calls past the 600 ms budget; the budget and the rate limit cannot both hold. | Mark MusicBrainz as a hedged, cache-first, best-effort source: fire it after catalog results, outside the 600 ms critical path; state in the eval which runs included it. |
| W-06 | R1 continuity depends on `music_plan_offline_cache` being "Task-augmented" (L185, L296), while the Charter cut-line says cut task augmentation and tasks are experimental in 2025-11-25 and moved out of core in 2026-07-28. | Spec-pinned risk with SDK support unconfirmed ([VERIFY] L170): if the SDK lacks tasks, the flagship resilience story loses its demo centrepiece late. | Design R1 to demo with progress notifications first; treat task handles as an enhancement that lands only after RQ-DJ-02/05 confirm SDK support. |
| W-07 | Blueprint §5.2 header says "Tool catalog (7 tools)" then adds privacy tool as "the eighth" (L174-188); the demo script, ACs and `tools/list` count must all agree. | Small on paper; on stage a mismatched tool count in the wire inspector is exactly the kind of visible inconsistency J-META punishes. | Freeze the list of eight names in Appendix A with an explicit ordered list and add a contract test asserting `tools/list` returns exactly those eight, in order. |

### 7b. Respectful-language findings (Charter 0.2 #9)

Flagged wording (never to appear in docs/demo/README about speakers or languages): "mangled" — PILLAR-1 L2; RESEARCH-THESIS-1 L2/L15; WORKING-STYLE L31; MASTER-BLUEPRINT L31/L211; bible L14; package description ("mangled voice-assistant ASR") L14; DOCUMENT 6 L757 ("Raw Mangled ASR Input"). "phonetic English gibberish" — PILLAR-1 L2. "spelled it in dumb English words" — RESEARCH-THESIS-1 L2. "getting nonsense" (about the wrong song) — WORKING-STYLE L105. "yapping" about the assistant is borderline product-voice; keep only if consistently aimed at the assistant's verbosity, never at users. The v3 blueprint's own §1/§9 bans already cover all of these — enforcement belongs in the docs lint/review checklist.

## 8. Executed-command receipts (representative; every command in the ledger)

| Command (abridged) | Result |
|---|---|
| `Get-FileHash -Algorithm SHA256` (all 11 seeds) | hashes in §2; 2 mismatch manifest |
| LF-normalised re-hash of the 2 mismatches | matches manifest exactly (CRLF-only drift) |
| `ReadAllLines MASTER-BLUEPRINT.txt` | 444 lines; ends at rule 4 of claimed 5 |
| `py -m py_compile server.py run_10_global_tests.py` | exit 0 — both compile |
| `npm install` + `npx tsc -p tsconfig.json --noEmit` (polyglot) | exit 0 |
| `npx vitest run` (polyglot; local vitest.config bypasses an unrelated parent-dir postcss config) | **19 failed / 6 passed (25)** |
| `npx tsc --noEmit --strict … edge_dsp_and_bunker.ts multiroom_clock.ts` | exit 0 |
| `npx tsc --noEmit --strict … page.tsx` | exit 2 — TS2345 missing latencyMs/summary |
| `node demo-bugs.mjs` (built dist) | stray-token + suggest-regex probes quoted in F-16/F-17 |
| `py -c "importlib.util.find_spec('services.omnibeat-mcp-server.src.server')"` | ModuleNotFoundError (F-12) |

Coverage: 2/2 Python listings, 5/5 TypeScript artifacts, 1/1 runnable test suites, Makefile by static analysis — 100% of code listings present in the seeds. No live MCP server exists in the repo, so no end-to-end protocol run was possible (recorded as untested, not passing).

## 9. Web verification log (all retrieved 2026-10-19; ledger `web_fetch` events mirror this)

| URL | What it settled |
|---|---|
| modelcontextprotocol.io/specification/versioning | current revision = 2026-07-28; 2025-11-25 is a real handshake-era revision |
| modelcontextprotocol.io/specification/2025-11-25/changelog | SEP-1330 = ElicitResult/EnumSchema update; SEP-1036 = URL mode elicitation; SEP-1686 = tasks; Origin → 403 (PR 1439) |
| modelcontextprotocol.io/specification/2025-11-25/client/elicitation | form mode restricted to flat primitive schemas (audio-in-form impossible); URL mode real; `-32042` URLElicitationRequiredError real |
| modelcontextprotocol.io/specification/2026-07-28/changelog | session id, Last-Event-ID, ping removed; MRTR/InputRequiredResult = SEP-2322; `x-mcp-header` = 2026-07-28 |
| amazonappdev2026.devpost.com/rules | deadline, prizes, 2025-11-25 minimum + simulation path, friction 10% bonus, 4 equal criteria, six reviewer usernames, video rules, mini-challenge terms |
| amazonappdev2026.devpost.com/details/faqs | Alexa+ tooling partner-gated, no participant access; a web page acting as real MCP client satisfies the requirement |
| www.pnas.org/doi/10.1073/pnas.1915768117 (+ PubMed 32205437) | PNAS 2020 measured WER 0.35 vs 0.19 (Black vs white US speakers) — not a "30% accent barrier" |
| registry.npmjs.org/@ricky0123/vad-web/latest | real package, v0.0.31, ISC license |
| musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting | ~1 req/s per IP; meaningful User-Agent required |
| suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=… | endpoint works (top hit "lollipop lagelu song"); **no CORS header** |
| itunes.apple.com/search?term=lollipop+lagelu | works, ACAO `*`, real previewUrl |
| HEAD audio-ssl.itunes.apple.com/…m4a | preview audio serves with ACAO `*`, byte ranges — CORS-on-previews hypothesis REFUTED for iTunes today (volatile; keep server-side plan) |

## 10. Escalation to ORCH (Charter 7.2 / role card)

LIKELY-FABRICATED items that affect scope: (1) "SEP-1330 chorus-hook elicitation" must not appear in any contract, UI, or docs — replace with plain spec-section names (F-05); (2) the friction-log seeds FL-01..FL-04 must never be submitted as encountered friction (F-18); (3) any downstream design that copied "InputRequiredResult/inputResponses" into a 2025-11-25 contract needs correction before ARCH freezes schemas (F-07). The v1 mock-wire and hard-coded-True patterns are already excluded by the v3 blueprint's critique — builders must never re-import them (F-03, F-04). No escalation blocks G0 itself; these are inputs to contract freeze.

