# OmniBeat

**A standards-based MCP music-intent layer for Alexa+ — it turns a mis-heard, accented, or
ambiguous song request into the right track, or into one good question. Never a confident
wrong song.**

[![MCP](https://img.shields.io/badge/MCP-2025--11--25-blue)](https://modelcontextprotocol.io/specification/2025-11-25)
[![Transport](https://img.shields.io/badge/transport-Streamable%20HTTP-success)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> Built for the Amazon *Build, Ship, Shape* Developer Hackathon — Alexa+ track.
> A separate simulated Alexa+ host calls OmniBeat, a **real MCP server**, over Streamable HTTP.
> Any MCP client can point at the same endpoint and get the same behaviour.

## The problem

Speech recognisers are trained mostly on dominant accents and music catalogues demand exact
spellings. You ask for a Bhojpuri, Hinglish, or regionally-accented track and the assistant
plays a confidently wrong song — or talks past you while you try to interrupt. OmniBeat is an
**MCP tool layer that sits after ASR** and fixes the *decision*, not the audio.

## The proof (captured live — see apps/lab-console/PROOF.md)

Same utterance, same server, one toggle:

| Path | Decision | Confidence | Candidates | What you hear |
|---|---|---|---|---|
| **Stock baseline** (MCP off) | `play` | 1.0 | 1 | Plays the wrong "Raja Ji" — asked nothing |
| **OmniBeat** (MCP on) | `ask` | 0.95 | 3 | "Did you mean Raja Ji (Insta Mix) or Raja Ji (feat. Gurlez Akhtar)?" |

Three real songs share that title. OmniBeat refuses to guess: it asks **one** short question.

## What it does

- **H1 — Name Rescue.** Mis-heard, accented, or code-switched titles resolve through
  phonetic skeletons, articulatory-weighted distance, transliteration (Devanagari, Hangul,
  kana), and multi-source verification (iTunes + MusicBrainz, with a labelled REPLAY cache).
- **H2 — Ask Once, Right.** When real songs collide on a title, OmniBeat returns at most
  three candidates and **one** spoken question (MCP form-mode elicitation, with a graceful
  spoken fallback when the client cannot elicit).
- **H3 — Interruptible by Design.** The host cuts speech at the word (Polly speech-mark
  timings), sends `notifications/cancelled`, and the server switches to a brevity policy.
- **R1 — Continuity.** A circuit breaker on real health probes + an offline cache plan keep
  music working when the network degrades — and it names the degradation rung it is on.

Every result carries an **action receipt**: what was heard, which sources agreed, the
confidence, and why the decision was made. "Why did you play that?" is answered from the
receipt, never from model memory.

## Simulated vs real (nothing hidden)

| Layer | Status |
|---|---|
| Alexa+ device / wake word | **Simulated** (clearly labelled everywhere) |
| MCP transport + protocol (2025-11-25, Streamable HTTP) | **Real** — session, version header, SSE, Origin checks |
| Resolver, decision policy, receipts | **Real** — open source, reproducible |
| Catalogue lookups | **Real, cached** — REPLAY badge when serving recorded responses |
| Speech (ASR/TTS) | **Fixture** mode today (no AWS credentials); adapter-ready for Transcribe/Polly |

Source badges **LIVE / REPLAY / FIXTURE** appear on every turn. No unlabelled mock, ever.

## Quick start (Node 24+)

```bash
# 1. MCP server (:8080)
cd services/omnibeat-mcp && npm install && npm run build && npm start

# 2. Simulated Alexa+ host (:4000) — acts as the MCP client
cd services/alexa-lab && npm install && npm run build && npm start

# 3. Console (:3000) — the judge-facing Alexa+ web app
cd apps/lab-console && npm install && npm run dev
```

Open http://localhost:3000, click the **"play raja ji"** chip with **MCP ON** (one honest
question), then flip to **MCP OFF** (wrong song, no question). The strip at the bottom shows
the **real JSON-RPC frames** travelling between the host and the MCP server.

Prefer the terminal? `cd services/omnibeat-mcp && node scripts/probe.mjs` runs the same
handshake (initialize → tools/list → tools/call) against the live server.

## Architecture

```
Browser: lab-console (:3000)         alexa-lab host (:4000)          omnibeat-mcp (:8080)
┌──────────────────────────┐  WS   ┌─────────────────────────┐  Streamable HTTP  ┌────────────────────────┐
│ Alexa+ face + proof strip│◄─────►│ MCP client + trace bus  │◄────────────────►│ 8 tools · receipts ·   │
│ (real frames only)       │ frames│ ASR/TTS adapters (fixture│  POST/GET/DELETE  │ resolver · adapters    │
└──────────────────────────┘       │  today; AWS-ready)      │  /mcp 2025-11-25 │ (iTunes, MusicBrainz,  │
                                   └─────────────────────────┘                  │  labelled REPLAY cache)│
                                                                                └────────────────────────┘
```

The MCP server **never receives raw audio** — only text, locale hints, and ASR alternatives.
That is a privacy property and a spec-clean contract for any host.

## The eight MCP tools

| Tool | What it does |
|---|---|
| `music_resolve_request` | Heard text → `play` / `ask` / `repair` / `not_found`, with evidence and a 1.5 s deadline |
| `music_preview_hooks` | Short hook clips to tell same-title versions apart (screens) |
| `music_confirm_selection` | Records the choice (idempotent); opt-in alias memory |
| `music_explain_last_action` | "Why did you play that?" — answered from the action receipt |
| `session_set_response_style` | Brevity policy (`brief`/`normal`/`detailed`) after a barge-in |
| `music_plan_offline_cache` | Offline cache plan with byte budget and expiry |
| `account_link_music_service` | URL-mode elicitation (`-32042`) — OAuth never touches the model |
| `privacy_forget_my_data` | Deletes a household's aliases and receipts |

## Repository layout

```
services/omnibeat-mcp   the MCP server (transport, resolver, adapters, store)
services/alexa-lab      simulated Alexa+ host (MCP client, trace bus, barge-in, breaker)
apps/lab-console        the judge-facing web app (Alexa+ face + live wire proof strip)
packages/schemas        Zod contracts — single source of truth for every tool schema
packages/phonetic-core  OSS phonetic engine + locale packs (en-US, hi-IN, es-US)
tests/                  contract / e2e / property / adversarial suites (AC-01..AC-22)
research/               evidence-first research: claims, audits, question register
docs/                   architecture, blueprint, demo script
.omni/                  engineering-process ledger (auditable build history)
```

## Verification

- `services/omnibeat-mcp` — protocol smoke suite (initialize, 400/403/404 guards, 8 tools)
- `services/alexa-lab` — 48 tests (trace bus, breaker, barge-in, SSE capture, redaction)
- `packages/phonetic-core` — 120 tests incl. fast-check properties (no crash on any Unicode)
- `apps/lab-console` — rendering tests on verbatim live-host fixtures + `scripts/live-check.mjs`

Every number and demo line in this README maps to a captured run in a `PROOF.md`.

## Licence

MIT. Audio previews are streamed (never cached) from public provider endpoints under their
terms; offline-cache demo tracks are royalty-free (Pixabay / CC-BY Incompetech) — see
`fixtures/licences/`. Built with TypeScript, the official MCP TypeScript SDK, and the MCP
2025-11-25 specification.
