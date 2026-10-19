# GROUND TRUTH & IDEA BANK — OmniBeat-MCP Redesign
**Compiled:** Oct 19, 2026 · **Method:** 3 independent recon agents (official pages, primary sources) + spot-check duty delegated to the orchestrator · **Rule:** any claim below without a URL is either formula-arithmetic or marked UNVERIFIED. Fresh official pages beat this file.

---

## §1. COMPETITION FACTS (verified against official Devpost pages + Amazon community, Oct 19, 2026)

| Fact | Verified value | Source |
|---|---|---|
| Hackathon | "Build, Ship, Shape: Amazon Developer Hackathon" — organizer Amazon Developer (admin Devpost), **active** | https://amazonappdev2026.devpost.com/ |
| Tracks | Fire TV · **Alexa+** · Bee (Wearable AI) · Ring | /rules |
| **Deadline** | **Oct 23, 2026, 12:00 PM PT = 7:00 PM UTC = 00:30 IST (Oct 24)** | /rules ("Submission Period… Friday, October 23, 2026 (12:00 pm Pacific Time)") |
| Alexa+ prizes | 1st: **$25,000 cash + $15,000 AWS credits** + Amazon meeting + featured. (2nd: $15k+$5k credits; 3rd: $4k+$1k) Total pool ≈ $138k cash / ~$190k value | /rules prizes table |
| Track requirement | "Build a working **Agent Skill or a self-hosted MCP server**, implementing MCP spec version (**minimum acceptable version is 2025-11-25**)… over **Streamable HTTP**. **Alternatively, entrants may submit a simulated Alexa+ experience** — no specific framework, SDK, or MCP-shaped surface required (exempt from the runtime-tech-hook requirement)." | /rules |
| Runtime tech hook | "The repository must demonstrate use of your track's required technology **at runtime in your code** — imported and actually called… not just named in the README." | /rules |
| FAQ on simulation | "A web page that acts as an **actual MCP client** (sending initialize, tools-list, and tools-call requests over Streamable HTTP) satisfies the requirement." Real Alexa+ tooling is **partner-gated — participants cannot get access.** | /details/faqs |
| Friction log bonus | "Participants who submit friction logs score higher in judging (**up to 10% bonus**)" — Stage-1 Amazon review team passes recommended bonus to Stage-2 panel. Product Feedback is separate & mandatory. | /rules + community.amazondeveloper.com/t/29097 |
| Judging | **4 equally weighted criteria**: Tech Implementation · Design · Potential Impact · Quality of the Idea. Stage 1 = pass/fail viability (includes automated AI analysis). Tie-break → first criterion (Tech Implementation). Judging Nov 9–20; winners ~Dec 3. Judges "not required to test the Project… may judge solely on text, images, video." | /rules |
| Repo rule | **EITHER public + open-source license file OR private** + shared with testing@devpost.com and the Amazon team. GitHub only (FAQ). | /rules + /details/faqs |
| Reviewer usernames | chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar — **invites expire after 7 days → send at submission time.** | /rules + FAQ |
| Video | < 3:00, public on YouTube/Vimeo; "no third party trademarks, or copyrighted music or other material unless… permission." Judges not required to watch past 3:00. | /rules |
| Mini-challenges | **AWS Builder** (uses AWS services: Bedrock, AgentCore, Strands, Kiro Crew, SageMaker… documented) and **Open Source** (new OSS project or contribution created in-window; PRs need not be merged) — $5k + $5k credits each. Max 1 track prize + 1 mini-challenge prize. | /rules |
| Other | Multiple submissions allowed but must be "unique and substantially different". Excluded countries incl. Brazil, Quebec, Russia, Crimea, Cuba, Iran, N.Korea. Projects stay free/accessible to judges until judging ends. | /rules, /details/faqs |
| ⏰ Time-critical | **AWS promo-credits request form closes Oct 21, 12:00 PM PT** ($150/individual) — only relevant if AWS is adopted (see ADR-0004). | /rules |

**Known competitors (Alexa+ track, verified live project pages):** "Once Upon a Voice" (self-declared *self-hosted MCP server for the Alexa+ track*) · "Recall Guardian" · "AcousticShield" (tags: alexa, model-context-protocol, aws-bedrock, fastmcp). Treat the track as competitive and inspect their public pages in W2 as competitive recon (mechanics, not copying).

---

## §2. MCP SPEC TRUTH (verified against modelcontextprotocol.io + GitHub, Oct 19, 2026)

| Fact | Truth |
|---|---|
| 2025-11-25 revision | **Real, stable.** Also: the revision **Amazon's Alexa+ docs explicitly support**. |
| Latest revision | **2026-07-28** (current). Do NOT call 2025-11-25 "latest". Hackathon accepts "2025-11-25 **or later** — once confirmed". |
| Streamable HTTP | Introduced in 2025-03-26 (replacing HTTP+SSE); target transport. |
| `MCP-Session-Id` | Real in 2025-11-25 (server MAY mint at initialize; client MUST echo). **Removed in 2026-07-28.** Casing: `MCP-Session-Id` — verify exact casing from the fetched spec page before hardcoding. |
| `MCP-Protocol-Version` | Real since 2025-06-18; required on subsequent HTTP requests; e.g. `2025-11-25`. Still present in 2026-07-28. |
| Origin validation | **MUST** (not "recommended"): validate Origin; invalid → HTTP 403. |
| `Last-Event-ID` resumability | Real on 2025-11-25 (GET + header → replay). **Removed in 2026-07-28.** |
| `notifications/progress` | Real; long-running ops. |
| Elicitation | Added 2025-06-18 (form mode). **URL mode added 2025-11-25 (SEP-1036 — correct in v1 docs!)**. Server→client within the request stream: `elicitation/create`. |
| `-32042` | **Correct**: `URLElicitationRequiredError` — server MAY return it when URL elicitation is required. |
| `InputRequiredResult` | **REAL NAME, WRONG ERA**: belongs to 2026-07-28 "Multi Round-Trip Requests" (SEP-2322). NOT in 2025-11-25. v1 docs used it wrongly. |
| `subscriptions/listen` | 2026-07-28 only. On 2025-11-25 use **`resources/subscribe` / `resources/unsubscribe`** + `notifications/resources/updated`. v1 docs used it wrongly. |
| `ping` | Real on 2025-11-25; removed in 2026-07-28. |
| Tasks | Experimental `tasks` in 2025-11-25 (SEP-1686); becomes extension `io.modelcontextprotocol/tasks` in 2026-07-28. Optional — earned complexity decides. |

**Key pages:** modelcontextprotocol.io/specification/versioning · /specification/2025-11-25/basic/transports · /specification/2025-11-25/client/elicitation · github.com/modelcontextprotocol/modelcontextprotocol/releases · /specification/2026-07-28/changelog (what changed after our target — read once, never mixed in).

---

## §3. ALEXA+ PLATFORM TRUTH (verified against developer.amazon.com + aboutamazon.com)

| Fact | Truth |
|---|---|
| Alexa+ for Builders | Program exists: **Alexa+ MCP Toolkit**, Category SDK, Alexa AI CLI — **all partner-gated preview**; hackathon participants cannot apply. |
| Spec support statement | "**Alexa+ for Builders supports the 2025-11-25 version of the MCP specification.**" + "Your MCP server must support Streamable HTTP… migrated before connecting." |
| Server requirements | Remote URL accessible; **OAuth 2.1 + PKCE (S256)**, `resource` param, Bearer header; **<500ms round-trip latency** expectation; PRM at RFC 9728 well-known URI; no DCR/OIDC support yet. |
| Client behavior | Registers tools/resources; uses elicitation when info missing; supports **MCP Apps extension** (`resourceUri` — interactive UI in conversation view, webview provided by Alexa+). MCP Apps repo ships Agent Skills (agentskills.io format: `create-mcp-app`, `migrate-oai-app`, `add-app-to-server`, `convert-web-app`). |
| Personality styles | Official: **Brief, Chill, Sweet, Sassy** (Sassy requires extra checks; unavailable with Amazon Kids). |
| Agentic capabilities | Official phrasing: "agentic capabilities… navigate the internet in a self-directed way". No product literally named "Agentic web navigation". Amazon browser-automation product = **Nova Act**. |
| "Experts" | Official concept quote: "groups of systems, capabilities, APIs, and instructions" — no customer-facing "Alexa+ Experts" branding verified. |
| Doc inconsistency (flag) | Amazon's own client-lifecycle sample payloads still show `protocolVersion: "2025-03-26"` — stale sample vs normative 2025-11-25 statement. Build to 2025-11-25; note the inconsistency in the friction log (it's a legitimate, valuable FL entry). |

**Key pages:** developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html · .../mcp-toolkit-quickstart.html · .../mcp-toolkit-client-lifecycle.html · apps.extensions.modelcontextprotocol.io/api/ · aboutamazon.com/news/devices/alexa-plus-personality-styles

---

## §4. IDEA BANK — prior-art mechanics to adapt (steal mechanics, never artifacts)

Format: *mechanic — why it matters → source (class).* Full adaptation sketches get rebuilt in W2 as IDEA-CARDS.

### Engine A — Resolve (accent / phonetic / canonicalization) → F-02, F-03, F-06
- **Indic Soundex varga skeleton**: map Indic consonants to phonetic classes (varga), collapse vowels length, merge aspirates/retroflex — the core recall mechanic for "Lolly Pop La Gelu" → "Lollipop Lagelu". → thottingal.in/blog/2009/07/26/indicsoundex (PRIMARY-ish algorithm writeup)
- **Script↔romanization lattice**: normalize both ASR text and catalog titles into one target (ITRANS/Devanagari) before comparing — lets Devanagari metadata meet Latin ASR output. → github.com/sanskrit-coders/indic_transliteration (repo; check LICENSE — sanscript MIT-reported)
- **Learned transliteration (optional refinement)**: IndicXlit, transformer trained on Aksharantar (26M pairs) — steal the *corpus idea* for tests even if not the model. → github.com/AI4Bharat/IndicXlit (PRIMARY project; verify weights license)
- **Scoring layer**: RapidFuzz (token_set/WRatio) + Jaro-Winkler + jellyfish soundex/metaphone — two-stage: skeleton recall → fuzzy score → margin checks. → rapidfuzz.com, jellyfish repo (MIT)
- **Benchmark-first discipline**: peer-reviewed comparison shows generic name-matching benchmarks don't transfer; build OUR labeled set (mangled ASR → real titles) and measure recall@1 per matcher. → scitepress.org/papers/2016/59263 (PRIMARY paper)
- **MusicBrainz graph**: MBID = permanent ID; ISRC identifies a *recording* (remixes each get their own; can be misapplied) → use recording MBID as canonical key, ISRC as secondary index. **Release-group secondary types** (Live/Remix/Compilation/DJ-mix…) are the official disambiguator for studio-vs-live. → musicbrainz.org/doc/ISRC · /doc/Release_Group/Type (PRIMARY docs)
- **Album-level (cluster) matching over per-track matching** — per-track matching produces "Frankenstein" results; cluster → match cluster. → Jaikoz docs pattern (SECONDARY, described algorithm)
- **Fingerprinting (optional)**: Chromaprint → AcoustID → MBID to identify audio with zero metadata; gate auto-rewrites on confidence (e.g., ≥50% tracks agreeing). Chromaprint LGPL — verify linkage; AcoustID API free w/ key + rate limits. (PRIMARY-adjacent)
- **Negative result**: no credible study found showing English metaphone variants working well on romanized Hindi — the Indic-specific skeleton is load-bearing; English Soundex/Metaphone are fallbacks only.

### Engine B — Reflex (fast-path / barge-in / brevity) → F-05, F-07
- **Embedding decision router**: route fixed commands by cosine similarity to example utterances; MIT lib (Semantic Router) claims 4ms decisions; a 2025 paper reports 47% latency cut / 48% token cut when routing before LLM. → aurelio.ai/semantic-router · arxiv.org/html/2510.08731v1 (repo MIT; paper PRIMARY)
- **Grammar-constrained ASR** (on-device): decoder restricted to a command grammar — near-zero latency, works offline; run *in parallel* with cloud ASR, act on early match if it holds ~200ms. → alphacephei.com/vosk/adaptation (PRIMARY docs; Vosk Apache-2.0)
- **Partial-hypothesis early intent**: fire UI ack/earcon on partial transcript skeleton match; commit on final. → livekit docs (PRIMARY vendor docs)
- **Two-stage barge-in: VAD gate → interruption classifier + cooldown**: published design (86% precision/100% recall @500ms overlap; rejects 51% of VAD false barge-ins; ~<30ms inference; cooldown after turn edges) — reimplement the *design itself*, it's cloud-only as a product. → livekit.com/blog/adaptive-interruption-handling (PRIMARY vendor research)
- **Silero VAD via onnxruntime-web (vad-web)**: per-30ms speech probability in-browser, cross-browser, no WebRTC session. → github.com/ricky0123/vad (ISC; Silero model MIT)
- **Full-duplex hygiene**: AEC (`echoCancellation: true`) + single owner of the cancel path (VAD + TTS queue + state); raise barge threshold while TTS active; cancel = abort LLM gen + flush TTS within frames. → practitioner runbooks (SECONDARY, consistent)
- **Energy/duration pre-filter**: RMS + duration gate before neural VAD (Nuance patent US7437286B2 — expired 2003+20yr → generic technique). → patents.google.com (PRIMARY patent)
- **Brevity as a first-class setting**: official Alexa* personality styles prove the UX contract; default ≤4-word confirmations + earcon; "tell me more" expands. → aboutamazon.com personality-styles page (PRIMARY)
- **Earcons to mask latency**: Brewster guidelines — multi-harmonic timbres avoid masking; rhythmic/melodic structure; parallel earcons shorten messages. 80–150ms Web Audio ack at recognition time. → dcs.gla.ac.uk/~stephen/earcon_guidelines.shtml (PRIMARY guidelines + paper)
- **On-device wake/command spotting (optional)**: openWakeWord (code Apache-2.0, **models CC BY-NC-SA — noncommercial landmine; train your own**); Porcupine commercial (avoid as dependency). (repos/docs)

### Engine C — Trust (ledger / silence-line / auth repair) → F-04, F-10
- **Hash-chained audit trail**: entry_n.hash = H(entry_n ‖ prev.hash), append-only — cheap tamper-evidence (~35% storage overhead class). → activepieces.com/blog/what-a-hash-chained-audit-trail-actually-means (SECONDARY w/ numbers)
- **History/Merkle tree** (Crosby–Wallach, USENIX 2009; basis of Certificate Transparency RFC 9162): O(log n) inclusion proofs for an untrusted logger — the principled version if needed. → usenix.org/conference/usenixsecurity09 (PRIMARY paper + RFC)
- **CloudTrail digest-file pattern** (production-proven, ship-fast): periodic digest file listing per-log SHA-256s; signed; digest contains previous digest's signature (chained); stored separately. → docs.aws.amazon.com CloudTrail log-file-validation (PRIMARY docs)
- **SQLite WAL**: durable append-only foundation — but WAL alone is NOT tamper-evidence; layer a hash chain over rows. → sqlite.org/wal.html (PRIMARY)
- **RFC 8628 Device Authorization Grant** (+ QR/non-textual verification URI): re-link when the surface is a speaker — voice gives a short code, phone approves, device polls. → rfc-editor.org/info/rfc8628 (PRIMARY RFC)
- **PKCE (RFC 7636) / OAuth 2.1 direction** + silent re-link via refresh-token rotation; detect `invalid_grant` → trigger repair flow **proactively, not mid-command**. (PRIMARY RFCs + MCP auth docs)
- **MCP URL-mode elicitation** on 2025-11-25 (SEP-1036; `-32042`): server asks client to hand the user to a URL out-of-band; secrets never traverse the model. ← our auth-repair handshake. → modelcontextprotocol.io/specification/2025-11-25/client/elicitation (PRIMARY spec)

### Engine D — Continuity (offline cache / resumption / sync) → F-08, F-09
- **Per-stream event ids + Last-Event-ID reconnect (WHATWG SSE)** + **MCP resumability state machine**: ids unique per session; resume = GET + Last-Event-ID; server must NOT replay other streams' events; disconnect ≠ cancel; explicit cancel message; unknown session → 404 → re-initialize. → html.spec.whatwg.org SSE · MCP 2025-11-25 transports page (PRIMARY)
- **Event-store ring buffer**: bounded per-session replay buffer; if requested cursor evicted → send "gap" sentinel → client refetches state snapshot. → imti.co/mcp-transport-streamable-http (SECONDARY reference impl)
- **Service Worker + Range requests**: store audio as blobs in IndexedDB (content-hash keys); synthesize 206 responses by slicing blobs; fall through to network for uncached. → web.dev/articles/sw-range-requests (PRIMARY Chrome eng)
- **MSE gapless splicing**: `appendWindowStart/End` + `timestampOffset` strip encoder silence → seamless queue. → web.dev/articles/mse-seamless-playback (PRIMARY)
- **Snapcast pattern**: chunk-timestamp + NTP-style clock sync (~1ms class) + sample-level drift correction (insert/remove single samples = 0.02ms @48kHz). GPL-3.0 → **mechanics only**. → github.com/snapcast/snapcast (repo README; license GPL)
- **shairport-sync pattern**: source-clock↔local-clock mapping with rate interpolation (fraction-of-ms target; AirPlay-2 uses PTP via NQPTP). GPL family → mechanics only. → github.com/mikebrady/shairport-sync
- **Web Audio output-time base**: `AudioContext.getOutputTimestamp()` {contextTime, performanceTime} = schedule accurately; measure per-device render delay once. → MDN (PRIMARY standard)
- **Trap identified**: cross-ecosystem sync (Cast↔AirPlay) is a doomed design — sync only across OUR clients (single timing domain); treat external targets best-effort. → music-assistant discussion #385 (SECONDARY maintainer)
- **TTS latency decomposition**: first-byte independent of text length; target 1 RTT + first chunk; measure per-utterance first-chunk + total. → learn.microsoft.com (PRIMARY)
- **Dual streaming TTS with clause-boundary chunking**: start synthesis on first clause while LLM still generating; ~1 clause lookahead keeps prosody acceptable. → elevenlabs docs + arxiv 2505.19206 (PRIMARY paper measuring first-token→first-phoneme)

### Engine E — Guard (version purity / upsell firewall / adapters) → F-01, F-06 (+ protects everything)
- **Score-based version preference** (v1 blueprint's Studio Purity idea — keep concept, re-derive numbers empirically): metadata signals from §4A MusicBrainz secondary types + artist-MBID mismatch detection (karaoke/tribute) + earliest-release tiebreak.
- **Canonical provider adapter interface** with circuit breaker + provider failover (right track found → playable on user's provider → no upsell detour); 3-second chorus-hook fallback only when genuinely ambiguous. Quota-aware search ladder: cache → MusicBrainz/iTunes/Deezer → web search (bounded).
- **Quota math (verify in W0):** YouTube Data API default 10,000 units/day ÷ 100 units per `search.list` = ~100 searches/day ceiling → treat web-search canonicalization as *bounded luxury*, cache aggressively, prefer free metadata APIs first.
- **Amazon doc-inconsistency entry**: the stale `"2025-03-26"` sample vs normative 2025-11-25 = a ready-made, legitimate friction-log entry.

### Standing multipliers
- **Friction log from hour 0** — the redesign itself will generate genuine friction entries (MCP client quirks, CORS/session header exposure, elicitation edge cases); capture verbatim with the official 6 columns.
- **OSS extraction** — the phonetic/friction library (`packages/`) → separate public repo created in-window for the Open Source mini-challenge (README + tests + contribution URL).
- **AWS** — only if adopted per ADR-0004 (deterministic-first). If adopted: form closes Oct 21 12PM PT; document the integration for the AWS Builder mini-challenge.

---

## §5. RE-FETCH LIST (orchestrator: verify these first, report deltas)
1. https://amazonappdev2026.devpost.com/rules (+ /details/faqs, /resources)
2. https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html (+ quickstart, client-lifecycle)
3. https://modelcontextprotocol.io/specification/versioning + /specification/2025-11-25/basic/transports + /specification/2025-11-25/client/elicitation
4. https://github.com/modelcontextprotocol/modelcontextprotocol/releases
5. https://community.amazondeveloper.com/t/build-ship-shape-amazon-developer-hackathon/29097
6. https://modelcontextprotocol.io/specification/2025-11-25/changelog (verify SEP-1036 = URL-mode elicitation, SEP-1686 = tasks; SEP-2322 = MRTR in the 2026-07-28 changelog)
*(If any page contradicts §1–§3: official page wins, update this file, flag it at the top of the wave report.)*

## §6. KNOWN LANDMINES (verified)
- GPL: Snapcast, shairport-sync, Indic NLP Library → mechanics only, never embed.
- openWakeWord models CC BY-NC-SA (noncommercial); Porcupine commercial → avoid as dependency.
- LiveKit adaptive-interruption = Cloud-only product → reimplement the design.
- Spotify `preview_url` reportedly deprecated for new apps (verify); Deezer 30s previews region-variable; iTunes Search free (~20 calls/min class, verify).
- Multiroom sync is patent-litigated space historically (Sonos et al.) → generic clock-sync math only, no protocol cloning.
- Video: no copyrighted audio/trademarks without permission — demo audio must be original/royalty-free.
