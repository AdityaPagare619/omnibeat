# CAPABILITIES.md — capability census (Charter Part 1)
Machine: Windows 11 (win32), pwsh, user Lenovo. Census date: 2026-10-19. Census is itself an
audited process — verification commands listed per row; raw output in ledger
.omni/ledger/orch/c0-foundation.jsonl (hashes only) and .omni/logs/.

## a) Agent runtime
| capability | type | how invoked | version | verification | limits | status |
|---|---|---|---|---|---|---|
| Primary agent (ORCH) | harness | this session | opencode harness | runs now | context window large; keep agents lean per AGENTS.md | READY |
| Subagents | harness | subagent/enterprise_dispatch tool; agent types: orchestrator, architect, builder, explorer, explorer, general, planner, researcher, docwriter, devops, qa, security, designer, debugger, reviewer, watchtower, skillEngineer, pluginEngineer, mcpEngineer, toolEngineer, budget | 18 registered (agents_info list, this cycle) | spawn verified at dispatch | parallelism per charter caps (4 builders/6 scouts/2 judges) | READY |
| Session resume | harness | opencode session ids (ses_*) | - | UNTESTED this cycle | - | UNVERIFIED |

## b) Built-in tools
| capability | status | note |
|---|---|---|
| file read/write/edit, glob, grep | READY | used this cycle |
| shell (pwsh) | READY | used this cycle |
| websearch, webfetch | READY | needed by scouts; one known query test at dispatch |
| diagram_create (Python diagrams) | READY | architecture diagrams |
| markitdown, context7, github-mcp-server, notebooklm, rea, playwright, kaggle, adrs, memory | READY (catalog-listed) | available to agents via execute; used as needed |

## c) Git
| capability | version | verification | status |
|---|---|---|---|
| git | 2.49.0.windows.1 | `git --version` exit 0 this cycle | READY |
| worktrees | same | `git worktree list` exit 0 this cycle | READY |
| gh CLI | 2.102.0 | `gh --version` exit 0 | READY |
| gh auth | logged in as AdityaPagare619, scopes gist/read:org/repo | `gh auth status` exit 0 (token masked by gh) | READY |
| PR creation | n/a | repo has NO remote; local merge gate substitutes (DEC-0002); external publish = Part 13 escalation | BLOCKED-by-policy |

## d) MCP servers (harness-configured)
| server | transport | provides | status |
|---|---|---|---|
| adrs, context7, github-mcp-server, notebooklm-mcp, rea, playwright, kaggle, markitdown, filesystem, memory, mcp-context-manager, mcp_monitor, opencode, parallel_* | HTTP/stdio (harness-managed) | ADRs, docs lookup, GitHub, notebook, reverse-engineering, browser automation, conversion, fs, memory | READY per catalog |
| mcp_monitor tool | - | inventory listing | BLOCKED (tool errored: `(servers||[]).map is not a function`); inventory taken from harness catalog instead |

Product-relevant MCP tooling for OUR server: MCP Inspector + reference client — to be installed
and pinned in Phase 1 (npm devDependency @modelcontextprotocol/inspector); not yet present →
UNVERIFIED until install.

## e) Plugins and hooks
| capability | status | note |
|---|---|---|
| superpowers skills plugin | READY | skills load verified this cycle (using-superpowers, epistemic-claim-tracing loaded) |
| automatic tool-call/shell hooks → ledger | UNVERIFIED | no hook config found in this workspace; ledger is manual-first (lower trust per Charter 4.1) until B-INFRA wires hooks in Phase 1 if the harness supports them |

## f) Skills (superpowers + project)
Present and inventoried from the harness registry (36 skills): using-superpowers (process
entry), epistemic-claim-tracing (mandatory before technical claims), brainstorming,
writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents,
using-git-worktrees, test-driven-development, systematic-debugging, debugging-loop-escape,
verification-before-completion, requesting/receiving-code-review, finishing-a-development-branch,
production-grade-coding, architecture-governance, writing-skills, skill-activation-protocol,
deep-research-protocol, hypothesis-tree-research, arbor-style-ideation, plus domain skills
(impeccable, ui-ux-pro-max, design-taste-frontend for B-CONSOLE; infrastructure-as-code for
B-INFRA; reverse-engineer-anything for DOC-JUDGE code audits; markitdown-converter for .docx
if supplied later; ethical-reasoning for J-ETHICS).
Role→skill map: PLAN→brainstorming; decomposition→writing-plans; TDD→test-driven-development;
debug→systematic-debugging; done-check→verification-before-completion; isolation→using-git-
worktrees; fan-out→dispatching-parallel-agents; PR gate→requesting-code-review; merge→
finishing-a-development-branch.

## g) Custom commands
Enterprise slash commands available: /plan /build /review /security /research /think /test
/deploy /doc /design /ui /ux /polish /redesign /graphify. None destructive. Not used this cycle
(ORCH dispatches named agents directly per charter role cards).

## h) Runtimes
| tool | version | verification | status |
|---|---|---|---|
| Node | v24.15.0 | exit 0 | READY (active LTS line; pin in .nvmrc Phase 1) |
| npm | 11.12.1 | exit 0 | READY (one package manager; lockfile committed Phase 1) |
| Python (`py`) | 3.13.14 | `py -V` exit 0 | READY (>=3.12 satisfied) |
| Python (default `python`) | 3.8.1 | exit 0 | DO NOT USE (stale shim; use `py` or uv) |
| uv | 0.9.14 | exit 0 | READY |
| ffmpeg | 8.1.1-full_build | exit 0 | READY (covers DSP/audio needs) |
| Docker / compose | - | exit 1, not installed | BLOCKED → fallback DEC-0005: native node processes via Makefile; compose file still authored for Docker-equipped judges |
| sqlite3 CLI | - | exit 1 | BLOCKED → fallback: node:sqlite (Node 24 built-in) or better-sqlite3 |
| sox | - | exit 1 | BLOCKED → ffmpeg covers |
| espeak-ng | - | exit 1 | BLOCKED → not required unless phonetic tool needs it (not in current design) |
| Playwright browsers | - | not yet installed | UNVERIFIED → install + verify Phase 1 (needed for audio-in e2e) |
| tsc (global) | - | exit 1 | not needed globally; TypeScript as pinned devDependency per package |

## i) Cloud (AWS)
| item | status |
|---|---|
| aws CLI | BLOCKED (not installed) |
| named profile / region / Bedrock model access / Transcribe / Polly smoke / budget alarm | ALL BLOCKED (no CLI, no creds on machine) |
| consequence | cloud-dependent path BLOCKED per Charter 1.1i; FIXTURE/REPLAY providers carry the work (DEC-0003); ESC-001 opened to human for credentials + spend approval; R-AWS still researches availability/pricing from docs |

## j) Quality tooling
| tool | status | plan |
|---|---|---|
| tsc, eslint, prettier, vitest, fast-check | install Phase 1 (npm devDeps) | pinned |
| Stryker (mutation) | install Phase 2 (needed for 70% mutation target) | pinned |
| Playwright | install Phase 1 | audio-in e2e + a11y |
| msw/nock | install Phase 2 | provider replay fixtures |
| Toxiproxy | BLOCKED (needs docker) | fallback: node-level fault-injection proxy for chaos tests; label honestly |
| k6 | BLOCKED (not installed) | fallback: Node load harness (autocannon) or install k6 in Phase 5 if permitted |
| gitleaks | BLOCKED (not installed) | fallback: npm-based secret scan (detect-secrets/trufflehog npm) in Phase 1; retry gitleaks install |
| npm audit | READY (npm built-in) | runs in CI + every PR |
| axe | install Phase 4 (console a11y) | |
| MCP Inspector | install Phase 1 | contract proof |

## k) Research tools
| tool | status | verification |
|---|---|---|
| websearch | READY | exercised this cycle during scout dispatch |
| webfetch | READY | exercised this cycle during scout dispatch |
| context7 (docs MCP) | READY | catalog-listed |

## Capacity note
Windows laptop, no docker daemon. Concurrency set: 4 writing builders, 6 scouts, 2 judges
(OWNERS.yaml). Model tiers per agent recorded in role dispatch; strongest-reasoning default
for ORCH/ARCH/PROC-AUDIT/J-META/DOC-JUDGE/RED-TEAM per Charter Part 2.
