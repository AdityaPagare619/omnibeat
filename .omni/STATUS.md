# STATUS.md — ORCH operating cadence log
## Cycle 0 — 2026-10-19 (Phase 0: Foundation and research)

### Decisions made
- DEC-0001: repo root = working directory; git initialised on `main`; seed files copied (not
  moved) into research/seed/ and sha256-hashed in MANIFEST.md.
- DEC-0002: no git remote. Local branch+merge gate stands in for GitHub PRs until the human
  approves external publishing (Part 13). PR-body template enforced in .omni/gates/.
- DEC-0003: cloud path BLOCKED (no aws CLI, no credentials). FIXTURE/REPLAY providers carry
  Phases 0-2. LIVE AWS path activates only on human-supplied credentials. ESCALATION OPEN (ESC-001).
- DEC-0004: research scouts are read-only + web-enabled; they return claim cards in their
  report and ORCH persists them to research/claims/ (avoids 8 concurrent worktrees).
- DEC-0005: Docker BLOCKED → `make demo` target runs three native node processes via one
  Makefile; docker-compose.yml still authored by B-INFRA for judges who have Docker.
- DEC-0006: role cards written now for governance + Phase-0 agents; cards for builders and
  remaining judges are written immediately before their phase dispatch (staged, logged).

### Escalations open
- ESC-001 (to human, P0): AWS credentials/profile needed for LIVE Transcribe/Bedrock/Polly
  path, or we ship labelled FIXTURE/REPLAY simulation for speech/cloud layers. Also: is any
  paid AWS spend approved (budget cap)? While waiting: fixture path proceeds.
- ESC-002 (to human, P1): official hackathon deadline date + rules confirmation pending
  R-PLATFORM; affects Phase 1-6 date anchors. While waiting: plan in relative working days.
- ESC-003 (to human, P2): confirm licence/copyright clearance for any teammate voice
  recordings added to fixtures (consent form needed). While waiting: synthetic speech only.

### Gate status
- G0: OPEN (pending dispatch results, PROC-AUDIT verdict, judge reports).
- G1-G6: NOT STARTED.

### Research coverage
- P0 questions opened: RQ-SPEC-01..05 (R-SPEC), RQ-PLAT-01..04 (R-PLATFORM), RQ-AWS-01..04
  (R-AWS), RQ-MUS-01..03 (R-MUSIC). Answers pending dispatch.
- DOC-JUDGE audit of seed research: in progress.
- Seed manifest: 10 files PRESENT (hashed), 5 MISSING, 1 UNVERIFIED (see research/seed/MANIFEST.md).

### Capability status (headline)
- READY: git 2.49 (worktrees), gh 2.102 authed, Node v24.15, npm 11.12, py 3.13 (`py`), uv 0.9,
  ffmpeg 8.1.1, websearch/webfetch, 18-agent registry, subagent dispatch, skills library.
- BLOCKED: docker, aws CLI/creds, sqlite3 CLI (use node:sqlite), k6, gitleaks, espeak-ng, sox.
- UNVERIFIED: hook instrumentation; mcp_monitor tool (errored — inventory taken from catalog).

### Top three risks (pre-mortem inputs) with next action
1. No AWS creds → simulated-only speech path hurts "real" score. Next: human answer on ESC-001;
   B-HOST designs Bedrock/Transcribe/Polly adapters with fixture fallbacks from hour one.
2. Eval circularity/fabrication → trust loss. Next: B-EVAL held-out lock design at G1; PROC-AUDIT
   checklist applies from first logic PR; negative-control baseline mandatory.
3. Spec/SDK mismatch on 2025-11-25 features (elicitation URL mode, tasks, resumability).
   Next: R-SPEC answers RQ-SPEC-02 with spec text + SDK source at pinned tag; ARCH marks
   dependent schema fields [VERIFY].

### Next actions (this cycle)
- Dispatch DOC-JUDGE, ARCH, T-TEST, RED-TEAM, R-SPEC, R-PLATFORM, R-AWS, R-MUSIC (parallel).
- Collect reports; persist claim cards; PROC-AUDIT reviews Phase-0 ledgers.
- Convene G0 (PROC-AUDIT, J-PRODUCT, J-DEMO, DOC-JUDGE). Open Phase 1 only on PASS/CONDITIONAL.
