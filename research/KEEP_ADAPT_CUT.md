# KEEP / ADAPT / CUT — every idea from research/seed/ (DOC-JUDGE, P0, 2026-10-19)

Rule: KEEP = adopt as-is into v3 work; ADAPT = keep the idea with the stated change; CUT = drop, with reason. "Blueprint ref" points to where v3 already handles it. Respectful-language rule applied: any wording that disparages speakers or languages is flagged (⚑) and must not survive into docs/demo; the ideas underneath can still be kept.

## SPIRIT.txt

| Idea | Verdict | Change / reason |
|---|---|---|
| Demo-first: write the 3-minute video before code (L6) | KEEP | Blueprint 11/12 already anchor on the demo script. |
| "Solve visceral daily micro-frustrations" (L5) | KEEP | Blueprint H1-H3 are exactly this. |
| ⚑ Persona text calls ASR output "dumb"/"mangled" in sibling docs | ADAPT | Keep the frustrated-user empathy; ban the words (blueprint §1). |
| "Simulated UI that feels magical yet dead-simple to build in 3-4 days" (L7) | ADAPT | Simulation must be labelled LIVE/REPLAY/FIXTURE (blueprint 4.2) — no magic mocks. |
| Hackathon identity: Alexa+ track, MCP 2025-11-25+ Streamable HTTP (L9-10) | KEEP | VERIFIED vs rules. |

## PILLAR-1.txt

| Idea | Verdict | Change / reason |
|---|---|---|
| "Judo Engineering": reuse platform capabilities instead of rebuilding ASR (L2) | KEEP | Reframe as partner capability (blueprint §1 tone rule). |
| Sub-1A phonetic rescue pipeline (L2) | ADAPT | Drop hard-coded song tables (F-02); locale-pack data + held-out eval (blueprint 6.1/7.1). ⚑"mangled/gibberish" wording out. |
| Sub-1B same-name chorus disambiguation (L2) | ADAPT | Keep the collision problem (H2); drop audio-inside-form elicitation (form schema is flat primitives — verified); hooks as resource links, server-side extraction (blueprint 5.4/6.4). "InputRequiredResult" naming out (F-07). |
| Sub-1C banter shield + barge-in via vad-web (L2) | ADAPT | Barge-in kept (H3) as host concern + MCP cancellation; "room banter lock" demoted to experimental P2 (blueprint 6.5). vad-web VERIFIED real/ISC. |
| Sub-1D offline continuity via IndexedDB (L2) | ADAPT | Keep R1; replace navigator.onLine with real-probe breaker + hysteresis (blueprint 6.6); "1,500ms ping" is a config number, not a fact. |
| Ping threshold 1,500 ms (L2) vs 1,200 ms (MB L61) | ADAPT | One config value, measured; blueprint 6.6 uses 1,200 ms/3-of-5 — fine, just don't cite seeds as source. |

## RESEARCH-THESIS-1.txt

| Idea | Verdict | Change / reason |
|---|---|---|
| "Zero ML training" 20-line phonetic pipeline pitch (L2) | ADAPT | Direction survives as phonetic-core, but v3 adds calibration + eval; the "4 hours" hubris out. ⚑"dumb English words"/"mangled" out. |
| DesiTune recipe: phonetic rescue + multi-source search (L11-23) | ADAPT | Keep rescue + collision hooks (H1/H2); sources become documented APIs (iTunes/MusicBrainz/Deezer), not "YouTube Data API + Spotify" in parallel (quota + ToS: GT L121, RQ-DJ-04). |
| CutTheYap recipe: full-duplex barge-in (L25-38) | ADAPT | Keep H3; drop "classify laughter/two voices" claim (blueprint 6.5: overlap heuristic only, labelled). ⚑"yapping" → "verbosity". |
| Charter's description "five recipes + Kitchen Panic" | CUT | File contains 2 recipes, no Kitchen Panic — do not plan around non-existent content (RT-01). |

## WORKING-STYLE-METHODOLOGY.txt

| Idea | Verdict | Change / reason |
|---|---|---|
| 6 adaptive phases with "exit proof" gates | KEEP | Blueprint 12.1 is the matured version. |
| Friction log from hour 0, official 6 columns (L15) | KEEP | VERIFIED 10% bonus (rules L412); blueprint Appendix B; only real entries (F-18). |
| Open-source mini-package spun out in-window (L17) | KEEP | VERIFIED mini-challenge terms (rules L327/L548). |
| Storyboard/video-script-first, Devpost draft shell early | KEEP | Blueprint phase 0. |
| "100x better at fuzzy typos" class of unmeasured multipliers | CUT | No measurement; blueprint §9.2 claims discipline forbids it. |
| ⚑"mangled English text morph" demo copy (L31) | ADAPT | Demo copy: "heard as X, resolved to Y". |
| Named Alexa+ contenders as pattern sources | ADAPT | Competitive recon only, mechanics not copying (GT L26; R-PRIORART confirms). |

## MASTER-BLUEPRINT.txt (its Documents 1-7)

| Idea | Verdict | Change / reason |
|---|---|---|
| 4-service topology (simulator / orchestrator / MCP / chaos-mock) | ADAPT | v3 uses 3 deployables (blueprint 4.1); chaos-mock collapses into fixture/replay adapters with source badges. |
| Studio purity scoring vs live/karaoke/cover (Doc 1 F-06) | ADAPT | Keep S4 version classification; structured metadata first, regex second (blueprint 6.1); re-derive weights from data, not the +40/−55/−65 table. |
| "Anti-upsell firewall" / blocking Amazon Music (F-01) | CUT | Frames Amazon as adversary; judged by Amazon staff; blueprint §1 drops it. |
| "Truth ledger" anti-gaslight marketing + SNR>12 dB ghost gate (F-04) | CUT (as marketing) / ADAPT (as receipts) | Blueprint 6.7 keeps plain action receipts; hash chain optional, described only as tamper evidence. |
| Multi-room PID sync (F-09) | CUT | Decorative loop (F-09/IW-06); unverifiable on one machine; charter cut-line. |
| `InputRequiredResult`/`inputResponses` flow (Doc 3 §5) | CUT | Wrong spec era (F-07); use 2025-11-25 elicitation. |
| "-32042 URL elicitation" for OAuth repair (F-10) | KEEP | VERIFIED spec mechanism; blueprint 5.4 account-link flow. ⚑ cite as "URL-mode elicitation (-32042)", not "SEP-1036 skill re-link" branding. |
| "SEP-1330 chorus hooks" label | CUT | Misattribution (F-05). |
| `verify_mcp_wire.sh` curl harness idea | ADAPT | Keep the idea as `MCP_PROTOCOL_PROOF.md` + contract tests; the shipped script is truncated (3 of 4 steps) and must be rewritten. |
| Doc 7 pre-submission checklist | ADAPT | Good skeleton; file truncated at rule 4 (F-14); rebuild from the live rules page (RQ-DJ-10..13). |
| Friction-log template (Doc 6) | ADAPT | Keep the table shape; entries must be real friction, not imagined platform features (F-18). |
| "25/25 <15ms", "<45s boot", "0.0ms sync" exit tests | CUT | Unmeasured/false (F-01, F-09, F-19); blueprint §9.2 replaces with measured numbers. |

## Principal systems bible 1-5 ("I WOULD REQUEST..." file)

| Idea | Verdict | Change / reason |
|---|---|---|
| Doc 1 "bounded uncertainty" 3-gate funnel (physical → confidence → provenance) | KEEP | Blueprint 6.2/9.1 embodies gates 2-3; gate 1 becomes Room Guard P2. |
| Gap analysis vs naive hackathon approaches (Doc 1 §1.1) | KEEP | Correct instincts (no paid APIs, no hardcoded timestamps); its attack on "hardcoded dictionaries" applies to its own sibling package (F-02) — keep the critique, not the hypocrisy. |
| Zero-cost triad: suggest + MusicBrainz + iTunes (Doc 1) | ADAPT | iTunes + MusicBrainz KEPT (live-verified today); suggest = optional adapter, off in production, kill-switched (F-06, blueprint 8.4). "Legal/zero-cost forever" language out. |
| Dynamic 3 s chorus-window DSP (Doc 2 §B) | ADAPT | Keep energy+flux window search server-side (blueprint 6.4); honest label "loud/dense section", validate on hand-labelled set; delete the hard-coded vocalPresenceRatio 0.88 (D6-01). |
| Articulatory-weighted edit distance concept | KEEP | Keep as a phonetic feature; validate against a real labelled set, present as design choice not phonetic law (PG-11). |
| ONNX embedding router tier (Doc 3 §A) | CUT | 30-90 MB download vs zero-settings demo; v2 and blueprint defer it. |
| Hash-chained SQLite ledger (Doc 2 §A) | ADAPT | Receipts + optional tamper-evidence; chain must be verified in tests if kept (F-22). |
| WebAudio PID multi-room (Doc 2 §B) | CUT | See MB row. |
| Frame A/B/C "compliance payloads" | CUT | Non-spec shapes (IW-07); contract tests must come from spec text. |
| Single-file server.py reference impl | CUT | Do not copy; blueprint modular layout. Its Python compiles (good hygiene lesson) but has catch-all ok:true (F-21). |

## DOCUMENT 6 dump (Docs 6/7/8/9)

| Idea | Verdict | Change / reason |
|---|---|---|
| AcousticBanterAndBargeInGate DSP (SNR, ZCR-variance, pitch-variance, 5-frame sustain) | ADAPT | Keep as Room Guard P2 candidate (blueprint 6.5); thresholds need real audio validation; label experimental. |
| DynamicChorusHookExtractor window search | ADAPT | Same as bible row — server-side, honest label. |
| OfflineVibeBunker (IndexedDB + Last-Event-ID replay) | ADAPT | R1 continuity; drop "CRDT" name (F-10); idempotent command log (blueprint 6.6). |
| Doc 7 tactile UI zones (persona switchboard, wire inspector, bento deck) | ADAPT | Aesthetic KEPT (v2 says adopt aesthetic, never mocks); every frame must come from the real trace bus (F-03). |
| Doc 8 "run one script that prints green table" harness | CUT | Hard-coded True + unconditional verdict (F-04). Replace with T-TEST-written acceptance tests that can fail. |
| Doc 9 Makefile one-command run | ADAPT | Keep `make demo` goal (blueprint 12.4); the shipped targets are unrunnable (F-12) — rewrite. |
| Doc 9 rubric evidence matrix (4×25%) | KEEP | VERIFIED vs rules; blueprint 12.6 already maps evidence per criterion. |
| ⚑"Raw Mangled ASR Input" UI labels | ADAPT | "Heard text" labels (blueprint 4.2). |

## Polyglot package ("Yes, generate..." file)

| Idea | Verdict | Change / reason |
|---|---|---|
| Package split (peeler/skeleton/distance/scorer as OSS) | KEEP | Blueprint phonetic-core; mini-challenge candidate. |
| Frame peeler regexes (multilingual wake words/verbs/providers) | ADAPT | Keep as locale-pack grammar data; the code regexes are a starting draft only. |
| Hard-coded ASR_HOMOPHONE_CLUSTERS + circular tests | CUT | F-01/F-02; replace with pack rules evaluated on held-out recogniser output. |
| VPPS encoder as shipped | CUT | Broken by stray token (F-03/F-16); rewrite from scratch with property tests. |
| YouTube-suggest browser function | CUT | CORS-dead in browsers (F-06); if kept at all, server-side adapter only, off by default. |
| "under 2 ms", "25/25", "30% worldwide" README claims | CUT | False/unsourced (F-01, F-19, F-20). |

## GROUND-TRUTH-AND-IDEA-BANK.md

| Idea | Verdict | Change / reason |
|---|---|---|
| Whole-document method (every claim URL'd or marked UNVERIFIED; re-fetch list; known-landmines list) | KEEP | This is the house standard for all scout output; F-23 trust ranking. |
| §2 MCP spec truth table | KEEP | 14/14 spot-checks passed; still re-verify volatile rows on Day 0 and pre-submission (RQ-DJ-15). |
| §3 Alexa+ platform truth table | KEEP (with recheck) | Rows not opened here (toolkit versions, personality styles, <500 ms RTT) stay with R-PLATFORM. |
| §4 idea bank (engines A-E mechanics with sources) | KEEP | Best prior-art map available; each mechanic still gets its claim card before use. |
| §6 landmines (GPL mechanics-only, CC BY-NC-SA models, patent-litigated multiroom) | KEEP | Binding constraints for builders; R-ETHICS-LEGAL confirms licences at build time. |

## omnibeat-v2-final-architecture.md

| Idea | Verdict | Change / reason |
|---|---|---|
| Honest self-audit of v1 docs (§8: mocked web app, uncalibrated latencies, brittle JSONP) | KEEP | Cite as the baseline critique; v3 agrees (F-25). |
| Zero-settings law (§4: no keys, no config, make demo) | KEEP | Blueprint 12.4 alignment; strong judge-facing property. |
| Graceful Yield over "guillotine" framing | KEEP | Consistent with blueprint brevity policy + tone rules. |
| "Any song on Earth resolves via iTunes hydration" | ADAPT | Direction good; artist mismatch observed live ("Lollipop Lagelu" → Deepak Dabangi, V2-02) — fixtures must come from live data, per-turn resolve, signed-URL caution (V2-04). |
| Dynamic hooks "adopted verbatim — it's correct DSP" | ADAPT | Verbatim adoption also imported vocalPresenceRatio=0.88 fake metric (D6-01) — re-implement honestly (blueprint 6.4 already does). |

Closing rule for all KEEP/ADAPT rows: any number carried forward must be regenerable from an artifact at a recorded commit (blueprint §9.2 / AC-20). Seed documents remain HYPOTHESIS; the claim register in AUDIT_OF_PRIOR_RESEARCH.md §4 is the gate between them and the codebase.

