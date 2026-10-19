# AGENT_PERMISSIONS.md — least privilege by role (Charter Part 1.3)
Effective: 2026-10-19 (cycle 0). Enforced by role cards + worktree isolation. This harness has
no hook-based permission enforcement YET (hooks UNVERIFIED — see CAPABILITIES.md); permissions
are contractual and audited by PROC-AUDIT via the ledger.

| Role | May read | May write | Shell | Git | Network | Cloud writes |
|---|---|---|---|---|---|---|
| ORCH | everything | .omni/, research/ indexes, merges to main | yes | merge to main only | yes | no |
| PROC-AUDIT | everything incl. ledgers + diffs | .omni/audit/, .omni/ledger/proc-audit/ | yes (read/verify cmds) | no push | no | no |
| VERIFIER | everything | .omni/ledger/verifier/, scratch clone only | yes (run in scratch) | no push | no | no |
| RED-TEAM | everything | tests/adversarial/, own worktree, .omni/ledger/red-team/ | yes (scratch) | own branch only | no | no |
| DOC-JUDGE | research/seed/, docs/, repo | research/AUDIT_OF_PRIOR_RESEARCH.md, research/KEEP_ADAPT_CUT.md, own worktree | yes (run code listings) | own branch only | yes (verification fetches) | no |
| R-SPEC..R-DEVICE (scouts) | repo (read), web | claim cards + QUESTIONS entries via ORCH (read-only otherwise) | no writes | no | yes (websearch/webfetch) | no |
| ARCH | repo, research | packages/schemas/, docs/ARCHITECTURE.md, docs/ADRs/, own worktree | build/test | own branch only | no | no |
| T-TEST | repo, contracts | tests/ (skeletons), own worktree | test runs | own branch only | no | no |
| B-MCP | repo | services/omnibeat-mcp/, own worktree | build/test | own branch only | outbound HTTP to allow-listed APIs | no |
| B-HOST | repo | services/alexa-lab/, own worktree | build/test | own branch only | AWS APIs when creds exist | no |
| B-PHON | repo | packages/phonetic-core/, own worktree | build/test | own branch only | no | no |
| B-EVAL | repo | packages/eval/, eval/, own worktree | build/test | own branch only | AWS Polly/Transcribe when creds exist | no |
| B-CONSOLE | repo | apps/lab-console/, own worktree | build/test | own branch only | no | no |
| B-INFRA | repo | docker-compose.yml, .github/workflows/, Makefile, own worktree | build | own branch only | no | no (escalate first) |
| Judges (J-*) | everything | judge report files only (.omni/gates/) | run, never modify | no | no | no |

Global forbidden for everyone: printing tokens/secrets; writing secrets anywhere; force-pushing
shared branches; deleting another agent's work; weakening tests; publishing externally
(public repo, video, Devpost) without human approval (Charter Part 13).
