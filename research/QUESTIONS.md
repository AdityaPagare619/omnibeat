# research/QUESTIONS.md — question register (Charter Part 6.1)
Updated 2026-10-19 cycle 0 (ORCH). Status legend: ANSWERED (claim ids) / OPEN / DEFERRED.

## P0 — blocks architecture (all ANSWERED or dispositioned in cycle 0)
| RQ | Owner | Question | Status |
|---|---|---|---|
| RQ-SPEC-01 | R-SPEC | 2025-11-25 negotiation, headers, session, Origin semantics | ANSWERED — CLM-SPEC-001..004 |
| RQ-SPEC-02 | R-SPEC | TS SDK support at pinned version (Streamable HTTP, elicitation f+url, tasks, resume, cancel) | ANSWERED — CLM-SPEC-005..012,017,020. Pin 1.32.1. Origin middleware OURS. EventStore required for resume. |
| RQ-SPEC-03 | R-SPEC | Form elicitation schema restrictions | ANSWERED — CLM-SPEC-013,014. Flat primitives + titled enums; NO resource links in forms (blueprint design already correct). |
| RQ-SPEC-04 | R-SPEC | -32042 definition + URL elicitation-required signalling | ANSWERED — CLM-SPEC-015,016. Spec-defined; MUST carry data.elicitations[]. |
| RQ-SPEC-05 | R-SPEC | Untrusted-data guidance in spec | ANSWERED — CLM-SPEC-018,019. Annotations guidance exists; result-content guidance absent → our AC-09 is differentiating. |
| RQ-PLAT-01 | R-PLATFORM | Hackathon rules: deadline, judging, video, simulation, OSS challenge, AWS | ANSWERED — CLM-PLAT-001..008. DEADLINE 2026-10-23 12:00 PT. |
| RQ-PLAT-02 | R-PLATFORM | Official Alexa+ integration path; host→tool context | ANSWERED — CLM-PLAT-009,010. Toolkit preview-only; no transcript/n-best → friction log. |
| RQ-AWS-01 | R-AWS | Bedrock Converse tool use shape + models | ANSWERED — CLM-AWS-001..006 |
| RQ-AWS-02 | R-AWS | Transcribe streaming languages + alternatives | ANSWERED — CLM-AWS-007..011. NO en-NG. No n-best. |
| RQ-AWS-03 | R-AWS | Polly neural voices + speech marks | ANSWERED — CLM-AWS-012,013. NO en-NG voice. |
| RQ-AWS-04 | R-AWS | App Runner/Fargate pricing; AgentCore MCP hosting | ANSWERED — CLM-AWS-016..018 |
| RQ-MUS-01 | R-MUSIC | iTunes terms, limits, CORS | ANSWERED — CLM-MUS-001..004. Previews: stream-only, never cache. |
| RQ-MUS-02 | R-MUSIC | MusicBrainz limits + endpoints | ANSWERED — CLM-MUS-005..009 |

## P1 — blocks build
| RQ | Owner | Question | Status |
|---|---|---|---|
| RQ-AWS-05 | R-AWS | Hackathon AWS credits | ANSWERED — CLM-AWS-019. CLOSED/out of stock. ESC-001 to human: any LIVE AWS spend is out-of-pocket. |
| RQ-MUS-03 | R-MUSIC | Deezer terms/limits | ANSWERED — CLM-MUS-010..013. High terms risk + empty probes → DEMOTE adapter to optional; ORCH leaning CUT (DEC-0010). |
| RQ-PLAT-03 | R-PLATFORM | Surfaces for voice music UX | ANSWERED — CLM-PLAT-011 |
| RQ-PLAT-04 | R-PLATFORM | Hackathon-provided sandbox/tooling | ANSWERED — CLM-PLAT-012. None. |
| RQ-MUS-04 | R-MUSIC | Licensed full-length demo tracks for continuity cache | ANSWERED — CLM-MUS-014..016. Pixabay / FMA-manual / Incompetech CC-BY. |
| RQ-SP-01..05 | R-SPEECH | ASR disparity evidence, code-switching, transliteration, phonetics, datasets | OPEN — dispatch wave 2 (P1; feeds eval narrative + Devpost, not contracts) |
| RQ-EL-01..05 | R-ETHICS-LEGAL | DPDP/COPPA/GDPR/WCAG/licences | OPEN — wave 2 (G5 input) |
| RQ-PA-01..03 | R-PRIORART | Prior MCP music servers, barge-in prior art, track submissions | OPEN — wave 2 |

## P2 — improves quality
| RQ | Owner | Question | Status |
|---|---|---|---|
| RQ-DV-01..04 | R-DEVICE | TV/Show UX, latency expectations, captions | OPEN — wave 2 |
| RQ-MUS-05 | R-MUSIC | YouTube suggest status | ANSWERED — CLM-MUS-017..019. Unofficial + scraping-forbidden → CUT adapter entirely (DEC-0009). |

## Deferred (explicit, with reason)
- RQ-DJ-15 (DOC-JUDGE): Day-0 + pre-submission re-verification sweep of ALL VOLATILE claims — deferred to Phase 5 per Charter 6.4.
