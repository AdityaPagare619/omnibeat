# PLAN_0 — Foundation Plan (ORCH, cycle 0)

Written by the Principal Orchestrator in their own words, per Charter Part 16 Action 1.
Date: 2026-10-19. Repo: this directory, git initialised on `main` this cycle.

## 1. The mission, restated

Ship OmniBeat v3 for the Amazon "Build, Ship, Shape" Alexa+ track: an open, spec-compliant
MCP server (spec 2025-11-25, Streamable HTTP) plus a clearly-labelled simulated Alexa+ host,
that turns mis-recognised, accented, code-switched or ambiguous music requests into the right
track — or one good question — and keeps music working when the network degrades.

Three heroes (H1 Name Rescue, H2 Ask Once Right, H3 Interruptible by Design) and one
resilience layer (R1 Continuity). Supporting spec-depth: URL-mode account linking, an MCP
Task for cache planning, action receipts, opt-in alias memory, published eval resource.

Winning criteria are truth and reproducibility, not feature count: a measured wrong-play-rate
reduction on held-out data, real MCP traffic on screen, honest LIVE/REPLAY/FIXTURE labels,
and `make demo` on a clean machine.

## 2. How the human's main ideas map onto the frozen scope

The human supplied: the 72-hour "Chloi Principle" demo-first playbook; DesiTune-MCP
(phonetic accent rescue + same-name hook previewer); CutTheYap-MCP (full-duplex barge-in +
group banter filter); and a 10-point global pain list. Mapping (no scope drift):

| Human idea | Where it lands | Note |
|---|---|---|
| DesiTune phonetic rescue | H1 Name Rescue | Zero-ML-training pipeline matches the blueprint: phonetic skeleton + multi-source search + calibrated decision. No hardcoded phrase tables (those were rejected as circular evidence, blueprint §2.2). |
| DesiTune "same-name" hook previewer | H2 Ask Once + `music_preview_hooks` | Hook extraction is server-side (browser CORS risk, blueprint §2.7); honest heuristic, published hit rate. |
| CutTheYap barge-in | H3 Interruptible by Design | Host VAD + Polly speech marks cut at the word; server honours cancellation and brevity policy. |
| CutTheYap "Group Banter Shield" | Room Guard — experimental P2 | Blueprint §6.5: ship only if the eval shows it works; never described as laughter/speaker detection. Cut line per §12.2 if time slips. |
| Wire-inspector pill proving real MCP | Wire inspector on the real trace bus | Critical honesty fix vs the seed docs: frames come from the simulator's real MCP client, never fabricated client-side (blueprint §2.3). |
| "Wrapper, not fine-tuning" thesis | Positioning | The wow moment is architectural: no model fine-tuning, no hardcoded songs — a standards-based decision layer with calibration, receipts and an eval. This IS the pitch. |
| Pain points 1 (upsell), 9 (multi-room), 10 (skill hell) | Cut or roadmap | Upsell blocker deliberately dropped (partner framing, blueprint §1); multi-room PID sync cut (§2.10); skill-hell answered by MCP standard portability, not a feature. |
| Pain points 2,3,6 (accent/Hinglish/same-name) | H1 + H2 | The core. |
| Pain point 4 (hallucination/gaslighting) | Action receipts (`music_explain_last_action`) | Explanation from a receipt, never model memory. |
| Pain point 5 (latency) | Stage budgets, p50/p95 published | 1,500 ms hard deadline; measured, not claimed. |
| Pain point 8 (offline) | R1 Continuity | Server-planned cache + client breaker; honest crossfade number. |

## 3. Pre-mortem: it is the last day and we failed. Top five causes

1. **No AWS credentials / no Docker on this machine.** Cloud LIVE path (Transcribe/Bedrock/Polly)
   and containerised demo blocked on Day 0. Mitigation: adapter pattern with FIXTURE/REPLAY
   providers carrying the work from hour one; escalate to human for credentials (Part 13);
   `make demo` falls back to native node processes since Docker is absent.
2. **Evaluation fabricated or circular.** Mitigation: held-out lock before tuning, baselines
   mandatory, PROC-AUDIT gaming checklist on every PR, RED-TEAM break-it check.
3. **Wire inspector becomes theatre.** Mitigation: AC-14 badge-vs-ledger test; inspector fed
   only by the real MCP client trace bus; J-DEMO checks first fifteen seconds.
4. **Over-scoping (10 pains → 10 features).** Mitigation: cut lines from blueprint §12.2 are
   binding; one task per PR, <400 changed lines.
5. **Spec facts wrong (SDK support, elicitation shapes, SEP numbers).** Mitigation: R-SPEC
   reads the actual spec text; no citation without retrieval receipt; UNVERIFIED items stay
   behind flags.

## 4. What I do not yet understand (open questions, all logged)

- Hackathon official rules: dates/deadline, judging weights, video limit, permitted simulation,
  open-source mini-challenge timing, required AWS usage. Owner: R-PLATFORM. P0.
- Does the official MCP TypeScript SDK at our pinned version support 2025-11-25 elicitation
  (form + URL), tasks, resumability? Owner: R-SPEC. P0.
- AWS account readiness (Bedrock model access, region, Transcribe/Polly availability, budget
  approval). BLOCKED on credentials; escalate to human. Owner: R-AWS + human.
- Provider terms: iTunes Search rate limits, MusicBrainz policy, Deezer preview terms, preview
  CORS behaviour. Owner: R-MUSIC. P0 (affects adapters).
- Are documents 1–5 of the "principal systems bible" inside MASTER-BLUEPRINT.txt? DOC-JUDGE.
- Missing seed files (DOCUMENT_7/8/9, .docx sources, polyglot-phonetic-judo package) — recorded
  MISSING in research/seed/MANIFEST.md; never reconstructed.

## 5. Census plan (Charter Part 1) — executed this cycle

Method: run the version/status command, record output hash, classify READY / BLOCKED /
UNVERIFIED, and name the fallback for every BLOCKED item. Full table: .omni/CAPABILITIES.md.

Headline findings from the first sweep (each verified by a logged command this cycle):
- READY: git 2.49 (worktrees OK), gh 2.102 authenticated (gist/read:org/repo), Node v24.15,
  npm 11.12, python 3.13 via `py`, uv 0.9.14, ffmpeg 8.1.1.
- BLOCKED: docker (fallback: native node processes via Makefile), aws CLI (fallback: FIXTURE/
  REPLAY providers + labelled simulation; escalation to human for credentials), sqlite3 CLI
  (fallback: node:sqlite / better-sqlite3), k6, gitleaks (fallback: npm audit + truffleHog or
  manual secret pass), espeak-ng (not needed unless phonetic tool requires it), sox (ffmpeg
  covers DSP).
- UNVERIFIED: hook instrumentation in this harness (ledger will be manual-first, marked lower
  trust, hooks wired in Phase 1 if supported); mcp_monitor tool errored — MCP inventory taken
  from the harness catalog instead.
- 18 registered agents confirmed; subagent dispatch available. Model tiers to be recorded per
  agent as they are dispatched.

## 6. Cycle-0 work breakdown (this cycle, in order)

1. ~~Read charter + blueprint~~ (done).
2. ~~Census + repo layout + seed manifest~~ (done this cycle).
3. CHARTER.md archived; AGENT_PERMISSIONS.md; OWNERS.yaml; ledger directories; first STATUS.md.
4. Role cards for governance + Phase-0 agents into .omni/roles/.
5. Dispatch in parallel: DOC-JUDGE (seed audit), ARCH (contract v0), T-TEST (AC-01..20
   skeletons that must fail), RED-TEAM (attack list), scouts R-SPEC / R-PLATFORM / R-AWS /
   R-MUSIC. Read-only agents run in the main tree; writing agents get git worktrees on
   branches agent/<id>/p0-<task>.
6. Collect process verdicts (PROC-AUDIT) and convene Gate G0 (PROC-AUDIT, J-PRODUCT, J-DEMO,
   DOC-JUDGE). No product code before G0 PASS or CONDITIONAL-with-conditions.

## 7. Decisions logged this cycle (see .omni/ledger/orch/*.jsonl)

- DEC-0001: repo root = this working directory; seed .txt/.md files copied (not moved) into
  research/seed/ and hashed; originals untouched. Reversible.
- DEC-0002: no git remote configured. PR-body templates recorded in .omni/gates/ and merges
  done locally by ORCH; pushing anything external requires human approval (Part 13).
- DEC-0003: cloud path BLOCKED → FIXTURE/REPLAY providers carry Phase 0–2 work; LIVE AWS path
  activates only when the human supplies credentials. Human escalation opened.
- DEC-0004: research scouts run read-only and return claim cards in their report; ORCH persists
  them to research/claims/ with provenance. Avoids 8 concurrent worktrees for web research.

## 8. Success criteria for cycle 0

- CAPABILITIES.md complete with verification receipts; AGENT_PERMISSIONS.md and OWNERS.yaml
  written; every Phase-0 agent has a role card; seed manifest hashed; all dispatched agents
  have returned; G0 convened with real command-running judges; STATUS.md current.
