# Process verdict — p0-contract (agent/arch/p0-contract)

**Auditor:** PROC-AUDIT (blind audit — ledgers + diffs judged before any builder summary)
**Date:** 2026-10-19
**Verdict:** **PASS-WITH-FINDINGS**
**Findings:** 0 BLOCKER · 0 MAJOR · 2 MINOR
**Merge blockers:** none.

## Scope audited
- Ledger: `.omni/ledger/arch/p0-contract.jsonl` (main repo)
- Diff: `git diff main...HEAD` on worktree `C:\Users\Lenovo\Downloads\omni-wt\arch-p0-contract` (branch off 563b9ec; 2 commits e829430, 717273a; 55 files, +7942)

## a) Ledger completeness
- File exists; 15/15 lines parse as JSON; timestamps monotonic non-decreasing (12:55:09 → 13:23:57). VERIFIED by scripted parse.
- All 5 shell events carry `cmd` + `exit_code`. None carry the Charter-4.1 fields `stdout_sha256`, `stderr_sha256`, `duration_ms`, `log_path`; no `file_write` events; no `.omni/logs/` files exist. Manual-logged ledger.
- Spot-checks re-run by auditor (read-only):
  1. `cd packages/schemas && npm test` → **98/98 passed, exit 0** — matches ledger events 4/6/12.
  2. Commits e829430 (`feat(schemas)`) and 717273a (`docs(arch)`) exist on the branch — matches event 15.
  3. `npm install` claim consistent with committed `package-lock.json` and the successful test run.

## b) Gaming checklist (Charter 5.1) on the DIFF
- **98/98 tests are real.** `test/tools.smoke.test.ts` uses hand-written valid/invalid JSON pairs derived from the blueprint (comment at lines 5–6; cases at lines 45–221), asserted via `safeParse(...).success`, not snapshots of the schema under test. `test/models.smoke.test.ts` includes negative cases (e.g. line 72: `-32000 "made up"` must be rejected) and an exactly-6-tool-error-codes check.
- **No invented spec citations.** Grep for `SEP-`, `-320x`, "spec section" over the deliverables (`packages/schemas/**`, `docs/ARCHITECTURE.md`, `docs/ADRs/**`): the only spec-numeric citation is **-32042**, which is blueprint-cited (docs/00_OMNIBEAT_V3_BLUEPRINT.md L186, L208) and carries `[VERIFY R-SPEC-04]` at every use (`src/errors.ts:24,33`, `src/elicitation.ts:153`). No SEP numbers appear in any ARCH deliverable. (SEP hits in the worktree root/seed files are pre-existing main-repo files, unchanged.)
- **Schemas match Appendix A frozen fields.** `src/track.ts` reproduces `$defs/Track` field-for-field (required: candidate_id/title/artist; `untrusted` is `literal(true)`, optional — exactly as Appendix A); `src/tools/music_resolve_request.ts` matches input required `[transcript, surface]` with maxLength 300 / maxItems 5 / enums, and output required `[decision, confidence, spoken_prompt, trace_id]` with candidates maxItems 3 and `#/$defs/Track` pointer (JSON-generation test at tools.smoke.test.ts:279–288). Tightenings vs Appendix A (`.strict()`, `.min(1)`, `.url()` on artwork_url, required spoken_prompt tiers) are documented in code comments, in DEC-ARCH-0003, and listed as deviations for ORCH in ARCHITECTURE §9 — documented decisions, not silent widenings.
- **[VERIFY] flags → RQ ids.** 32 flags in `packages/schemas/src/**`, all carrying `R-SPEC/R-AWS/R-MUSIC-*` ids; ARCHITECTURE §10 is an 18-entry register (R-SPEC-01..05, R-PLATFORM-01..04, R-AWS-01..05, R-MUSIC-01..04) as claimed in the ledger. The only bare `[VERIFY]` occurrences are prose references (index.ts:9, a quotation in music_plan_offline_cache.ts:4).
- No test disabling, no weakened assertions, no catch-all success paths, no thresholds changed, no numbers in docs without sources. Secrets scan: clean (all grep hits are prose about tokens/secrets, none are secrets).

## c) Path ownership
`packages/schemas/**`, `docs/ARCHITECTURE.md`, `docs/ADRs/**` — all ARCH-owned per OWNERS.yaml. Nothing else touched; worktree clean. ✓

## e) Hash spot-check
Ledger records no file hashes (see trust note), so hash comparison was not possible; substituted by re-running the acceptance command (above), which is the ledger's own primary claim.

## Findings
- **MINOR (p0-contract/F1)** — Ledger shell events omit the Charter-4.1 fields `stdout_sha256`, `stderr_sha256`, `duration_ms`, `log_path`; no `.omni/logs/` output files exist. The commands are logged and were independently re-run by PROC-AUDIT with matching results, so the claims are substantiated, but the tamper-detection layer is absent. Fix: wire shell-logging hooks (Charter 1.1e) in Phase 1; backfill hashes for future events.

## Trust note (Charter 4.1)
The ledger is **manual-logged** (no hooks, no output hashes). Per Charter 4.1 this is lower trust than hook-produced ledgers. Trust is partially restored by PROC-AUDIT's independent re-run of the primary acceptance claim (98/98, exit 0), which reproduced the builder's result exactly.

## Self-check (PROC-AUDIT)
Three ways this verdict could be wrong, checked: (1) tests could be snapshot self-tests — read both test files fully; they are hand-written pairs. (2) Appendix A comparison could miss a field — compared input and output schemas member-by-member against blueprint L626–685. (3) citation grep could hit pre-existing files only — confirmed SEP hits live in main-repo seed/blueprint files, not in the branch diff.
