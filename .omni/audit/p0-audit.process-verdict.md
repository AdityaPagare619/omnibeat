# Process verdict — p0-audit (agent/doc-judge/p0-audit)

**Auditor:** PROC-AUDIT (blind audit — ledgers + diffs judged before any builder summary)
**Date:** 2026-10-19
**Verdict:** **PASS-WITH-FINDINGS**
**Findings:** 0 BLOCKER · 0 MAJOR · 3 MINOR
**Merge blockers:** none.

## Scope audited
- Ledger: `.omni/ledger/doc-judge/p0-audit.jsonl` (main repo)
- Diff: `git diff main...HEAD` on worktree `C:\Users\Lenovo\Downloads\omni-wt\doc-judge-p0-audit` (branch off 563b9ec; commits 189bdea, be81a0f, e30b3f6; 3 files: research/AUDIT_OF_PRIOR_RESEARCH.md +research/KEEP_ADAPT_CUT.md +research/seed/MANIFEST.md append)

## a) Ledger completeness
- File exists; 47/47 lines parse; timestamps monotonic (12:44:01 → 13:39:14). VERIFIED by scripted parse.
- ~30 shell events, all with `cmd` + `exit_code`. 10 `web_fetch` events with url/retrieved_at/http_status but no `content_sha256`/`claim_ids`. Five events (lines 42–46) are summary pseudo-commands ("(ledger) assemble …") rather than literal re-runnable commands. No `.omni/logs/` files. Manual-logged ledger.
- Spot-checks re-run by auditor (read-only), targeting the ledger's central factual claims:
  1. **GROUND-TRUTH-AND-IDEA-BANK.md** — recomputed raw-byte sha256 = `6cd0cee7990b…77859`, 21,101 B: **exactly matches** the raw hash stated in the MANIFEST audit appendix. Recomputed LF-normalised sha256 = `9c07ca32…7a25`: **exactly reproduces the original MANIFEST row**. The builder's CRLF-differential finding is independently TRUE.
  2. **omnibeat-v2-final-architecture.md** — raw sha256 = `a6f62d6f…e411`, 16,501 B and LF-normalised = `efb3c6d8…a46d`: both **match** the appendix and the original MANIFEST row respectively. Two-for-two.
  3. Polyglot-suite execution: ledger events 19/20 record `npx vitest run` exit_code=1 — consistent with the audit's "6 passed / 19 failed" receipt (F-01). Not re-executed by PROC-AUDIT (extraction-heavy; the ledger trail + quoted output diffs in the audit doc are consistent).

## b) Gaming checklist (Charter 5.1) on the DIFF
- **Audit doc exists with receipts.** `research/AUDIT_OF_PRIOR_RESEARCH.md`: every finding carries `file:line` (e.g. F-16 → MANIFEST lines; claim register rows MB-01..MB-23 with L-locators), an executed command + quoted output (MB-15: "vitest run: 6 passed / 19 failed"), or URL + retrieval date (MB-09: 2025-11-25 elicitation page; MB-05: changelog PR 1439; §9 live probes dated 2026-10-19). §1 states coverage honestly, including what was NOT covered.
- **MANIFEST hashes were not altered.** Diff of `research/seed/MANIFEST.md` is **append-only**: original rows (lines 1–21) untouched; only a `DOC-JUDGE AUDIT APPENDIX` section added below. Verified line-by-line in the diff.
- **No seed content file modified.** `git diff --name-status main...HEAD -- research/seed/` → only `M research/seed/MANIFEST.md`. Zero changes to any seed content file. ✓
- **Hash claims verified (twice)** — see spot-checks 1–2. The builder found a defect in the original manifest (hashes taken over LF-normalised content while the delivered files are CRLF), documented it with correct raw hashes, and did **not** silently rewrite the original rows. That is the opposite of hash-gaming.
- Missing files are recorded MISSING, never reconstructed (MANIFEST rows + audit §3; scratch extraction is labelled "audit evidence, not reconstruction", DEC-J-001).
- No numbers in the audit without a regenerable receipt (pass counts tied to executed commands; URLs carry dates).
- Secrets scan: clean.

## c) Path ownership
`research/AUDIT_OF_PRIOR_RESEARCH.md`, `research/KEEP_ADAPT_CUT.md`, `research/seed/MANIFEST.md` — all DOC-JUDGE-owned per OWNERS.yaml (`research/seed/**`, the audit + keep-adapt-cut files). The worktree contains an **untracked** `scratch/` directory (extraction workspace per DEC-J-001) — not part of the diff, never committed; must stay uncommitted at merge. Ledger appended in main repo — allowed. ✓

## e) Hash spot-check
Two files × two hash modes (raw + LF-normalised) recomputed; all four values matched the builder's stated figures (appendix raw hashes; original MANIFEST LF hashes). Ledger events themselves carry no output hashes to compare (see trust note).

## Findings
- **MINOR (p0-audit/F1)** — 10 `web_fetch` events omit the Charter-4.1 fields `content_sha256` and `claim_ids`; source content is not tamper-pinned. The URLs and retrieval dates are present and the cited facts were fetched same-day per the ledger, so the receipts are usable, but content hashing should be wired with the Phase-1 hooks.
- **MINOR (p0-audit/F2)** — Ledger lines 42–46 record summary pseudo-commands ("(ledger) language-grep across research/seed for …", "(ledger) assemble … from 20 verified part-files; delete part files") instead of the literal commands. These are not independently re-runnable as written; the resulting documents were verified by PROC-AUDIT directly, so no substantive claim rests on them, but future events must log the literal command.
- **MINOR (p0-audit/F3)** — Untracked `scratch/` in the worktree (extracted listings, node_modules for the polyglot run). Benign as untracked evidence; flag to ORCH: verify it is not committed at merge time.

## Trust note (Charter 4.1)
Manual-logged ledger = lower trust per Charter 4.1 (no hooks, no output hashes on shell or web events). Trust is materially restored for this task by PROC-AUDIT's independent recomputation of the two central hash claims — both reproduced exactly — and by direct inspection of the append-only MANIFEST diff.

## Self-check (PROC-AUDIT)
Three ways this verdict could be wrong, checked: (1) the LF-normalisation story could be cover for altering files — recomputed both hash modes myself: original rows reproduce exactly, seed content files are untouched in the diff; (2) citations could be URLs never opened — the ledger's web events (spec changelog, elicitation page, Devpost FAQ, PNAS, npm registry, MusicBrainz) correlate 1:1 with the receipt URLs in the claim register, all same-day; (3) the audit could be a summary of the seeds rather than an audit — the claim register contradicts this: every row carries an execution, a line locator, or a primary-source date, and §1 states non-coverage explicitly.
