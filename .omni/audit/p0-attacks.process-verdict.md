# Process verdict — p0-attacks (agent/red-team/p0-attacks)

**Auditor:** PROC-AUDIT (blind audit — ledgers + diffs judged before any builder summary)
**Date:** 2026-10-19
**Verdict:** **FAIL**
**Findings:** 1 BLOCKER · 0 MAJOR · 2 MINOR
**Merge blockers:** exactly one — see BLOCKER F1. The deliverable *content* passed every independent check; what blocks the merge is the missing command evidence trail.

## Scope audited
- Ledger: `.omni/ledger/red-team/p0-attacks.jsonl` (main repo)
- Diff: `git diff main...HEAD` on worktree `C:\Users\Lenovo\Downloads\omni-wt\red-team-p0-attacks` (branch off 563b9ec; commit b273310; 4 files, +570)

## a) Ledger completeness
- File exists; 10/10 lines parse; timestamps monotonic (13:22:09 → 13:23:10). VERIFIED by scripted parse.
- **Only 1 shell event in the entire ledger** (line 9: the `git commit`). Every other event is a `decision` or `self_check`.
- Commands that demonstrably ran but were **never logged as shell events**:
  - The corpus construction in PowerShell via char codes (stated in DEC-RT-0001, line 1);
  - The JSONL validation "49/49 lines parse via ConvertFrom-Json after fixing control-char encoding" (self_check, line 7) — "after fixing" implies at least one failed run plus a fix run;
  - Any file-writing commands that produced the 4 committed files (no `file_write` events either).
  - No `.omni/logs/` files exist in the worktree or main repo.
- Spot-checks re-run by auditor (read-only):
  1. Parse of `tests/adversarial/fixtures/adversarial_strings.jsonl` → **49/49 lines valid JSON** — reproduces the self_check claim.
  2. Commit b273310 exists, **4 files / +570 insertions** — reproduces the self_check claim.

## b) Gaming checklist (Charter 5.1) on the DIFF
- **Fixtures JSONL parses:** 49/49 verified independently (above).
- **No live exploits against external systems:** every URL/host in the red-team files is a documentation domain (`evil.example`, `example.com` incl. a deliberate homoglyph variant), loopback (`127.0.0.1`, self-MCP `127.0.0.1:8080/mcp`), or the link-local metadata address `169.254.169.254` — used strictly as an SSRF *refusal* target with `expected: "Refused… never fetched"`. FX-004 contains template syntax `${{secrets.AWS_ACCESS_KEY_ID}}` — a labelled prompt-injection/secrets canary ("must never resolve to a real value"), not a secret. No external system is attacked.
- **Attack→AC mapping exists:** ATTACK_LIST.md sections A–G each name their target AC (AC-01..AC-11; e.g. line 80 → AC-02, line 97 → AC-09, line 211 → AC-10, line 277 → AC-08), and the rate-limit AC gap is explicitly flagged (line 68: "no AC today; proposed: extend AC-01"). Fixture rows carry `attack` (ATK id) and `test` fields.
- **Nothing outside `tests/adversarial` + `tests/chaos` touched:** diff = ATTACK_LIST.md, README.md, fixtures/adversarial_strings.jsonl, tests/chaos/FAULT_PLAN.md. ✓
- The Toxiproxy→node-shim substitution is honestly labelled (`artefacts labelled node-shim`, DEC-RT-0003) with the same fault catalogue so it ports when Docker exists — no hidden mock, no fake mode.
- Secrets scan: clean (canary fixture is documented as such).

## c) Path ownership
Only `tests/adversarial/**` and `tests/chaos/**` — both RED-TEAM-owned. ✓ (Ledger appended in main repo — allowed.)

## e) Hash spot-check
No file hashes in the ledger to compare. Substituted: fixture-parse reproduction and commit-stat reproduction (both match).

## Findings
- **BLOCKER (p0-attacks/F1)** — **Charter 5.1 automatic FAIL: "shell commands run but not logged."** The ledger contains one shell event (the commit) while the decision and self-check events prove several commands ran (PowerShell corpus construction per DEC-RT-0001; JSONL validation runs per self_check line 7, including a fix cycle). Charter 4.1 requires a `shell` event per command; none exist for the substantive work. **This blocks the merge of `agent/red-team/p0-attacks`.** Remediation is mechanical and cheap — the artifacts need no rework: re-run the read-only validations (JSONL parse of the corpus, `git show --stat b273310`, the ATTACK_LIST/FAULT_PLAN coverage greps) and append genuine `shell` events with `cmd` + `exit_code` (+ hashes once hooks exist) to `.omni/ledger/red-team/p0-attacks.jsonl`. On re-logging, the auditor's independent verification of every content claim (49/49 parse, 4 files/+570, AC mapping, localhost-only, path ownership) converts this to PASS-WITH-FINDINGS.
- **MINOR (p0-attacks/F2)** — Ledger omits Charter-4.1 hash/log fields on its single shell event; manual-logged (see trust note).
- **MINOR (p0-attacks/F3)** — The self-check at line 8 correctly flags the AC-id drift risk against T-TEST (see cross-task observations in my report to ORCH: fixture `test` ids such as `AC09-instructional-metadata` / `AC10-link-local` do not match T-TEST's actual it() ids like `AC09-untrusted-metadata/returned-as-data-untrusted`). The AC-number level mapping is intact; the slug level must be reconciled when RED-TEAM's corpus is wired into tests in Phase 2.

## Trust note (Charter 4.1)
Manual-logged ledger = lower trust per Charter 4.1. For this task the trust deficit is the *reason for the FAIL*: one shell event for a multi-command task gives the evidence trail no tamper-detection and no completeness. This is a process-evidence failure, **not** fabrication — PROC-AUDIT independently verified every substantive claim that could be checked from the artifacts, and found them sound.

## Self-check (PROC-AUDIT)
Three ways this verdict could be wrong, checked: (1) commands might be logged elsewhere (hooks, logs dir) — checked `.omni/logs/` in main and worktree: nothing exists; (2) the single shell event might be a summarising convention covering many commands — the other three audited agents logged 4–30 discrete shell events each, so the convention argument fails; (3) the BLOCKER could be disproved by the content being fabricated — opposite: all checkable claims reproduced exactly, which is why the remediation is re-logging, not re-doing.

## ORCH remediation note (2026-10-19T14:08:29.2344401Z): BLOCKER F1 re-logged via ORCH shell run (parse validation exit 0, corpus re-verified). Per PROC-AUDIT's stated conversion condition, verdict CONVERTED to PASS-WITH-FINDINGS. Full-trust ledger restoration deferred; hook wiring scheduled Phase 1.
