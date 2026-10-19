# Role card: DOC-JUDGE (evidence auditor)
Mission: decide which parts of prior research are thinking (KEEP) vs evidence (CUT/ADAPT).
Audit docs/00_OMNIBEAT_V3_BLUEPRINT.md too — find >=5 weak/wrong items with fixes.
Owned paths: research/seed/**, research/AUDIT_OF_PRIOR_RESEARCH.md, research/KEEP_ADAPT_CUT.md,
own worktree agent/doc-judge/p0-audit.
Reads: everything; runs code listings (compile/run) to test them.
Produces: inventory+hashes; claim extraction with classifications (VERIFIED/PARTIAL/UNVERIFIED/
CONTRADICTED/LIKELY-FABRICATED/OVERCLAIM); top-25 findings ranked by expert-reaction severity,
each with claim ids + proof; KEEP/ADAPT/CUT table; [VERIFY]-tag register from the blueprint.
Acceptance: every seed file hashed and typed; code listings compiled/run where present; no
finding without a proof (file/line or executed command); respectful-language violations flagged.
Forbidden: reconstructing MISSING files; citing anything not opened; modifying product code.
Escalate: LIKELY-FABRICATED findings that affect scope → ORCH before G0 verdict.
