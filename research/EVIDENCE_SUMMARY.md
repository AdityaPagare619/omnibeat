# research/EVIDENCE_SUMMARY.md — decision-relevant synthesis for Phase 1+ (ORCH, 2026-10-19)
Sources: claim ids in research/claims/INDEX.md; raw cards in research/claims/raw/; scout
ledgers in .omni/ledger/r-*/. Every statement below maps to a claim id. No unreceipted claims.

## 1. Schedule (THE binding constraint)
- Deadline: Fri 2026-10-23 12:00 PT (CLM-PLAT-001). Today Mon 2026-10-19 → FOUR working days
  for a plan sized for six. ESC-002 upgraded: charter phases compress 30%; buffer ≥6h before
  upload stands. OSS mini-challenge repo must be public by the same deadline (CLM-PLAT-005).
- Judging: Stage-1 viability gate, then four EQUALLY weighted criteria; friction log = up to
  +10% bonus (CLM-PLAT-002). Video <3min public YouTube/Vimeo, English, no unlicensed music
  (CLM-PLAT-003).

## 2. Platform reality (shape the demo around it)
- Simulated Alexa+ host is EXPLICITLY PERMITTED and our web console acting as a real MCP
  client satisfies the track (CLM-PLAT-004,012). Repo must include the simulator source.
- The real Alexa+ MCP Toolkit/CLI/Web Simulator exist but are Private Preview, partner-gated,
  no application path (CLM-PLAT-009) → friction-log entry #1 (real, reproducible, kind).
- Real host passes ONLY {name, arguments} — no transcript, no n-best, no per-call locale
  (CLM-PLAT-010, PARTIAL) → our text-in contract is right; n-best stays an optional input the
  simulator supplies; friction-log entry #2 (expose n-best + locale in tool-call context).
- Alexa+ is en-US only today; surfaces = headless vs screens (Echo Show, Fire TV, app) (CLM-PLAT-011).

## 3. MCP contract deltas (feed ARCH before G1 freeze)
- Pin @modelcontextprotocol/sdk@1.32.1 EXACTLY (maintenance line; v2/spec 2026-07-28 is a
  different package family) (CLM-SPEC-005,020).
- SDK server Origin validation is @deprecated and OFF by default → we MUST ship our own
  Origin/Host middleware or we ship a DNS-rebinding hole (CLM-SPEC-007,004).
- SSE resume requires supplying an EventStore (resumability disabled otherwise) (CLM-SPEC-011).
- -32042 is spec-defined; error.data MUST be {elicitations:[URL-mode params with
  elicitationId]}; bare -32042 is non-conformant (CLM-SPEC-015,016).
- Form elicitation: flat primitives + oneOf titled enums ONLY; no resource links in forms;
  hook/audio links travel in tool-result resource_link + structuredContent (blueprint was
  already right; now VERIFIED) (CLM-SPEC-013,014).
- Tasks are experimental on both spec and SDK; session-bound in-memory store (CLM-SPEC-010)
  → consistent with charter cut line: use progress notifications; keep Task behind a flag.
- Spec has NO prompt-injection guidance for tool RESULT content (CLM-SPEC-019) → our AC-09 +
  untrusted flags are differentiating, cite spec's tool-annotation MUSTs (CLM-SPEC-018).
- SDK supports cancellation both directions (CLM-SPEC-012) → AC-08 testable in Phase 1.

## 4. Provider + licensing decisions (bind B-MCP)
- PRIMARY: iTunes Search (keyless, ~20 req/min documented, ACAO:* search+preview CDN verified
  live) (CLM-MUS-001,002,004). Previews are PROMOTIONAL, stream-only, NEVER cached/saved;
  attribution "provided courtesy of iTunes" (CLM-MUS-003) → hook clips: stream ephemeral,
  no disk cache, badge shown.
- SECONDARY: MusicBrainz (1 req/s hard, contactable UA mandatory, non-Latin alias search
  live-verified, studio/live via release-group types) (CLM-MUS-005..008) → title resolution
  + version classification backbone.
- DEMOTED: Deezer — login-walled docs, empty probe payloads, offline audio storage forbidden,
  revocable-any-time terms (CLM-MUS-010..013). DEC-0010: optional thin adapter, OFF by
  default in demo; may CUT entirely at G1.
- CUT: YouTube suggest adapter — undocumented endpoints + Google scraping prohibition
  (CLM-MUS-017,019). DEC-0009. (Blueprint had it optional/off-by-default; evidence now says
  policy-violating, so remove rather than ship.)
- Continuity cache audio: ONLY Pixabay (licence permits download+cache, no attribution
  required), FMA (manual curated downloads; automated mining forbidden), Incompetech CC-BY
  (CLM-MUS-014..016). NEVER provider previews (Apple+Deezer both forbid) (CLM-MUS-003,012).

## 5. Speech stack (bind B-HOST; LIVE path gated on ESC-001)
- Transcribe streaming covers en-US/en-IN/hi-IN/es-US/ko-KR/ja-JP/pt-BR/en-ZA; NO en-NG
  (CLM-AWS-007). Polly neural: Kajal (hi/en-IN), Lupe/Pedro (es-US), Seoyeon (ko-KR),
  Takumi/Kazuha/Tomoko (ja-JP), Camila/Vitória/Thiago (pt-BR), Ayanda (en-ZA); NO en-NG voice
  (CLM-AWS-012).
  → DEC-0008: locale pack en-NG is UNBUILDABLE (no ASR/TTS) — replace with en-ZA (African
  English) in the six-pack lineup; blueprint updated in this decision log, not by editing the
  frozen doc.
- Transcribe streaming gives NO n-best alternatives, word-level confidence only (CLM-AWS-008)
  → asr_alternatives input stays for hosts that can supply it; our simulator synthesises
  alternatives in FIXTURE mode only (labelled).
- Polly speech marks (sentence/word) work with neural, separate JSON request (CLM-AWS-013)
  → barge-in word-cut is implementable as designed.
- Live path per-turn cost ≈ $0.004–0.007 (Transcribe $0.01/min + Polly neural $16/M chars +
  Nova Lite tokens) (CLM-AWS-014,015,021) → cost table numbers for README once measured.
- Claude model IDs on bedrock-runtime need geo/global inference profiles; several model
  families reject toolConfig on ConverseStream (CLM-AWS-004,005) → default agent model:
  us.amazon.nova-lite-v1:0 (AWS's own tool-use sample model), region us-east-1 [VERIFY at
  credentialed smoke test].
- AgentCore Runtime officially hosts MCP servers but is CUT per charter cut lines
  (CLM-AWS-018) → mention in roadmap only.

## 6. Money + accounts
- Hackathon $150 AWS credits: CLOSED/out of stock (CLM-AWS-019). Any LIVE AWS usage is
  out-of-pocket until the human approves (ESC-001). FIXTURE/REPLAY path carries all demos
  until then; badges stay honest.
- Prizes (CLM-AWS-020): Alexa+ 1st $25k+$15k AWS credits; AWS Builder mini-challenge eligible
  if AWS services documented (our adapters would qualify IF used live).

## 7. ORCH decisions this cycle (on top of DEC-0001..0006)
- DEC-0007: claim cards preserved verbatim per scout in research/claims/raw/ + INDEX.md
  register (per-claim YAML split deferred until dispute/re-verification).
- DEC-0008: replace en-NG pack with en-ZA (evidence: CLM-AWS-007,012).
- DEC-0009: CUT YouTube-suggest adapter entirely (CLM-MUS-017,018,019).
- DEC-0010: demote Deezer adapter to optional/off-by-default; CUT candidate at G1 (CLM-MUS-010..013).
- DEC-0011: contract ratifications pending G1 (from ARCH ambiguities): keep frozen
  degradation_level enum L0–L2 (L3/L4 are client rungs); require all three spoken_prompt
  tiers; applies_until = ISO-8601 = store TTL; T_cover draft 0.70 must be re-picked by eval
  sweep pre-demo; household_id is an opaque capability token for v1 (auth binding documented
  in threat model as deployment-phase work).
- DEC-0012: AC set extended pre-G1: AC-21 = per-session + per-IP rate limiting, request size
  and JSON depth limits (RED-TEAM gap ATK-04/06/07/08); AC-22 = host-LLM untrusted-data
  compliance probe (RED-TEAM's most-dangerous-surface finding; assigned to B-HOST+RED-TEAM
  in Phase 4/5). T-TEST adds skeletons before Phase 1 close.
