# research/claims/ — claim register (Charter Part 6.3)
Format note (ORCH decision DEC-0007): full claim cards (YAML blocks with sources, locators,
retrieved_at, corroboration, volatility, expires_at) are preserved verbatim per scout in
research/claims/raw/<SCOUT>-claim-cards-2026-10-19.txt (sha256 recorded in ledger). INDEX.md
below is the addressable register; per-claim CLM-####.yaml files will be split out lazily
when a claim is disputed or re-verified. Deviation logged for PROC-AUDIT.

## INDEX — all claims retrieved 2026-10-19 (raw file: SPEC / PLAT / AWS / MUS)

### MCP spec + SDK (R-SPEC) — raw: R-SPEC-claim-cards-2026-10-19.txt
| id | statement (short) | status | vol |
|---|---|---|---|
| CLM-SPEC-001 | MCP-Protocol-Version header required post-init; missing→assume 2025-03-26; invalid→400 | VERIFIED | STABLE |
| CLM-SPEC-002 | initialize version negotiation: echo or substitute; client disconnect on mismatch | VERIFIED | STABLE |
| CLM-SPEC-003 | Mcp-Session-Id lifecycle: 400 missing, 404 unknown/terminated, DELETE shutdown | VERIFIED | STABLE |
| CLM-SPEC-004 | Origin validation MUST; invalid+present→403 (changelog PR #1439) | VERIFIED | STABLE |
| CLM-SPEC-005 | Pin @modelcontextprotocol/sdk@1.32.1; v1.x=maintenance line for spec≤2025-11-25; v2=2026-07-28 | VERIFIED | VOLATILE exp 2026-11-18 |
| CLM-SPEC-006 | SDK client: protocol-version header, Last-Event-ID resume, DELETE termination | VERIFIED | VOLATILE |
| CLM-SPEC-007 | SDK server: 404/400 semantics + version check; Origin validation OFF by default + @deprecated (use own middleware); EventStore opt-in for resumability | VERIFIED | VOLATILE |
| CLM-SPEC-008 | FORM elicitation in SDK: flat PrimitiveSchemaDefinition only, no nesting; results flat primitives; applyDefaults is SDK extension | VERIFIED | VOLATILE |
| CLM-SPEC-009 | URL elicitation IN SDK 1.32.1 (elicitInput mode:url, completion notifier, examples); spec-flagged may-change | VERIFIED | VOLATILE |
| CLM-SPEC-010 | Tasks: SDK export experimental/tasks; spec labels tasks experimental; in-memory store session-bound | VERIFIED | VOLATILE |
| CLM-SPEC-011 | SSE resumability client+server; server replay requires supplying EventStore (disabled otherwise) | VERIFIED | VOLATILE |
| CLM-SPEC-012 | notifications/cancelled wired both directions in SDK; spec: disconnect≠cancel | VERIFIED | VOLATILE |
| CLM-SPEC-013 | Form requestedSchema: flat primitives + enum/oneOf titled enums + arrays-of-enum only; SEP-1330=titled enums (major item 5), SEP-1034=defaults | VERIFIED | STABLE |
| CLM-SPEC-014 | Resource links NOT allowed in form elicitation (schema or result); resource_link is tool-result-only | VERIFIED | STABLE |
| CLM-SPEC-015 | -32042 IS spec-defined: URL_ELICITATION_REQUIRED; error.data MUST carry elicitations[] URL-mode with elicitationId | VERIFIED | STABLE |
| CLM-SPEC-016 | Elicitation flows: proactive elicitation/create nested; -32042 error path (URL only); completion notification optional; MRTR is client MAY w/ manual fallback | VERIFIED | STABLE |
| CLM-SPEC-017 | SDK gives typed UrlElicitationRequiredError, NO auto-retry machinery | PARTIAL | VOLATILE |
| CLM-SPEC-018 | Spec HAS untrusted-data guidance: tool annotations untrusted (MUST), sanitize outputs, security_best_practices session-hijack injection | VERIFIED | STABLE |
| CLM-SPEC-019 | NEGATIVE: no dedicated prompt-injection section for tool RESULT content in 2025-11-25 | VERIFIED | STABLE |
| CLM-SPEC-020 | Newer spec 2026-07-28 exists; SDK v2 targets it; 1.x will not | VERIFIED | VOLATILE |

### Hackathon rules + platform (R-PLATFORM) — raw: R-PLATFORM-claim-cards-2026-10-19.txt
| id | statement (short) | status | vol |
|---|---|---|---|
| CLM-PLAT-001 | DEADLINE Fri 2026-10-23 12:00pm PDT; judging Nov 9-20; winners ~Dec 3 | VERIFIED | VOLATILE exp deadline |
| CLM-PLAT-002 | Judging: Stage1 pass/fail viability; Stage2 four EQUALLY weighted criteria; friction-log bonus up to 10% | VERIFIED | VOLATILE |
| CLM-PLAT-003 | Video <3min, public YouTube/Vimeo, English, must show working, no third-party copyrighted music/footage w/o permission | VERIFIED | VOLATILE |
| CLM-PLAT-004 | SIMULATED Alexa+ experience explicitly permitted (alternate path, exempt from runtime-hook; repo must include sim source; video must show it); web page as real MCP client satisfies FAQ | VERIFIED | VOLATILE |
| CLM-PLAT-005 | Open-source mini-challenge: NEW additional OSS project or contribution to existing public repo, GitHub-hosted, by main deadline; fields required | VERIFIED | VOLATILE |
| CLM-PLAT-006 | AWS NOT required for primary track; AWS Builder mini-challenge separate; $150 credits OUT OF STOCK since Oct 7 | VERIFIED | VOLATILE |
| CLM-PLAT-007 | No max team size; representative model | VERIFIED | VOLATILE |
| CLM-PLAT-008 | Eligibility country exclusions (Brazil, Quebec, Russia, Crimea, Cuba, Iran, NK, OFAC) | VERIFIED | VOLATILE |
| CLM-PLAT-009 | Official Alexa+ MCP Toolkit/CLI/web-simulator exist in docs but are Private Preview, select-partners-only, NO application path for participants | VERIFIED | VOLATILE |
| CLM-PLAT-010 | Host→tool payload = standard MCP {name, arguments} only; no transcript/n-best/per-call locale documented; MCP Apps hostContext carries surface info | PARTIAL | STABLE |
| CLM-PLAT-011 | Official surfaces: headless vs screens (Echo Show/Fire TV/app/browser); Alexa+ en-US only; older gens excluded | VERIFIED | VOLATILE |
| CLM-PLAT-012 | No sandbox/simulator/tooling provided to participants; MCP docs are the sanctioned starting point | VERIFIED | VOLATILE |

### AWS services (R-AWS) — raw: R-AWS-claim-cards-2026-10-19.txt
| id | statement (short) | status | vol |
|---|---|---|---|
| CLM-AWS-001..003 | Converse/ConverseStream toolConfig contract (toolUse/toolResult/stopReason loop) documented | VERIFIED | STABLE |
| CLM-AWS-004 | Tool-use models: nova-pro, us.amazon.nova-lite (AWS sample), Claude haiku-4.5 via geo profile (bare IDs rejected) | PARTIAL | VOLATILE |
| CLM-AWS-005 | Llama/Mistral/etc reject toolConfig on ConverseStream (streaming tool-use gap) | VERIFIED | VOLATILE |
| CLM-AWS-006 | AWS sample itself references EOL cohere.command-r (EOL 2026-08-19) — sample is dead | CONTRADICTED | STABLE |
| CLM-AWS-007 | Transcribe streaming supports en-US, en-IN, hi-IN, es-US, ko-KR, ja-JP, pt-BR, en-ZA; NO en-NG (only ha-NG batch) | VERIFIED | VOLATILE |
| CLM-AWS-008 | Transcribe streaming: single alternative, word-level confidence, NO n-best/alternative-level confidence | PARTIAL | STABLE |
| CLM-AWS-009 | Partial-result stabilization (low/med/high) trades latency vs accuracy; Stable flags | VERIFIED | STABLE |
| CLM-AWS-010 | Custom vocabularies work with streaming (headers), same-Region, 50KB/256char limits | VERIFIED | VOLATILE |
| CLM-AWS-011 | Transcribe streaming quota: 25 concurrent streams/Region default | VERIFIED | VOLATILE |
| CLM-AWS-012 | Polly neural voices: en-IN+hi-IN=Kajal; es-US=Lupe/Pedro; ko-KR=Seoyeon; ja-JP=Takumi/Kazuha/Tomoko; pt-BR=Camila/Vitória/Thiago; en-ZA=Ayanda; NO en-NG voice | VERIFIED | VOLATILE |
| CLM-AWS-013 | Polly speech marks (sentence/ssml/viseme/word) work with neural; separate request returning JSON not audio; time+byte offsets | VERIFIED | STABLE |
| CLM-AWS-014 | Polly pricing: Neural $16/M chars; marks billed per char; free tier 1M neural chars/mo 12mo | VERIFIED | VOLATILE |
| CLM-AWS-015 | Transcribe pricing: streaming ~$0.01/min (us-east-1 example); 60 min/mo free tier 12mo | VERIFIED | VOLATILE |
| CLM-AWS-016 | App Runner: $0.064/vCPU-h + $0.007/GB-h active; provisioned idle ~$10/mo min; no free tier | VERIFIED | VOLATILE |
| CLM-AWS-017 | Fargate: ~$0.0405/vCPU-h + $0.00445/GB-h x86; ARM cheaper; 1-min min | PARTIAL | VOLATILE |
| CLM-AWS-018 | AgentCore Runtime officially hosts MCP servers (streamable-http :8000/mcp, ARM64, Cognito/CUSTOM_JWT) | VERIFIED | VOLATILE |
| CLM-AWS-019 | Hackathon $150 credits CLOSED (out of stock Oct 7); T&C one code/one account | VERIFIED | VOLATILE exp deadline |
| CLM-AWS-020 | Prizes: Alexa+ 1st $25k+$15k credits, 2nd $15k+$5k, 3rd $4k+$1k; AWS Builder mini $5k+$5k | PARTIAL | VOLATILE |
| CLM-AWS-021 | Bedrock per-token prices UNVERIFIABLE from AWS page (JS placeholders); Nova Lite ~$0.06/$0.24 per 1M via AWS community cheat-sheet | PARTIAL | VOLATILE |

### Music APIs + licensing (R-MUSIC) — raw: R-MUSIC-claim-cards-2026-10-19.txt
| id | statement (short) | status | vol |
|---|---|---|---|
| CLM-MUS-001 | iTunes Search: ~20 calls/min documented ("subject to change"); cache recommended | VERIFIED | VOLATILE |
| CLM-MUS-002 | previewUrl = 30s preview, track media only; live probe confirmed | VERIFIED | STABLE |
| CLM-MUS-003 | Apple terms: previews = promotional, stream-only, NEVER downloaded/saved/cached; attribution "provided courtesy of iTunes"; badge proximity | VERIFIED | VOLATILE |
| CLM-MUS-004 | iTunes preview CDN CORS: live probe ACAO:* + Range/206 (observed, undocumented) | VERIFIED | VOLATILE |
| CLM-MUS-005 | MusicBrainz: ~1 req/s per IP else 103; meaningful User-Agent mandatory | VERIFIED | VOLATILE |
| CLM-MUS-006 | MusicBrainz: no key, non-commercial free, UA contact info required | VERIFIED | VOLATILE |
| CLM-MUS-007 | RecordingSearch alias field searches non-Latin aliases (live-verified Japanese + Cyrillic probes); studio/live via primary/secondarytype | VERIFIED | STABLE |
| CLM-MUS-008 | Release-group secondary types incl. Live → studio/live classification data source | VERIFIED | STABLE |
| CLM-MUS-009 | Observed x-ratelimit 400 headers on ws/2; window undocumented — do not treat as policy | PARTIAL | VOLATILE |
| CLM-MUS-010 | Deezer keyless search returns 200 but EMPTY data arrays from our probe (bot/geo gating suspected); no ACAO | PARTIAL | VOLATILE |
| CLM-MUS-011 | Deezer ToU: non-commercial only, 30s ceiling, revocable anytime, login-walled docs | VERIFIED | VOLATILE |
| CLM-MUS-012 | Deezer guidelines: local/offline storage of audio STRICTLY FORBIDDEN; no deep links; blocking possible | VERIFIED | VOLATILE |
| CLM-MUS-013 | Deezer quota exists but number login-walled; ~50/5s community-only | PARTIAL | VOLATILE |
| CLM-MUS-014 | Pixabay licence permits download+cache+commercial use, no attribution required | VERIFIED | VOLATILE |
| CLM-MUS-015 | FMA: per-file CC/PublicDomain/FMA licence; NO automated mining/deep links — manual curated downloads | VERIFIED | VOLATILE |
| CLM-MUS-016 | Incompetech CC BY 4.0 with attribution code; free | VERIFIED | STABLE |
| CLM-MUS-017 | YouTube suggest endpoints UNDOCUMENTED (only Data API v3 search.list official) | PARTIAL | VOLATILE |
| CLM-MUS-018 | Google policies forbid scraping YouTube outright (developer policies §III; consumer ToS) — unofficial suggest = policy violation | VERIFIED | VOLATILE |
| CLM-MUS-019 | YouTube Data API default quota: 100 search.list/day | VERIFIED | VOLATILE |

Scout ledgers: .omni/ledger/r-{spec,platform,aws,music}/p0-research.jsonl (web_fetch events
with urls + retrieval timestamps). Self-checks: each claim has >=1 primary source opened same-day.
