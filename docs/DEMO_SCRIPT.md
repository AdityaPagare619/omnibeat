# Demo script (3 minutes, console-driven)

Everything below runs against the local stack (`services/omnibeat-mcp` :8080,
`services/alexa-lab` :4000, `apps/lab-console` :3000). Badges shown on screen are
the true mode of that turn.

| # | Time | On screen | Say |
|---|------|-----------|-----|
| 1 | 0:00–0:15 | MCP **OFF**, click "play raja ji". Wrong song plays, no question. | "This is the daily cost of not being heard — the gap belongs to the system, not the speaker." |
| 2 | 0:15–0:35 | Flip to MCP **ON**. Point at the bottom strip: real JSON-RPC frames, session id, latency. | "That's a separate host calling a real MCP server over Streamable HTTP. Every frame in this strip is live traffic." |
| 3 | 0:35–1:10 | Same request, MCP ON. One honest question, three candidate cards, confidence meter at 0.95 with the ask threshold drawn. | "Three real songs share this title. It refuses to guess — one short question." |
| 4 | 1:10–1:50 | Tap a candidate. Receipt opens: what was heard, which sources agreed, why. | "And it can always explain itself — from a receipt, not from model memory." |
| 5 | 1:50–2:20 | Start a long turn, hit barge-in mid-sentence. Transcript cut at the word (struck through), style flips to brief. | "Interrupting always works — cut mid-word, next answer is six words." |
| 6 | 2:20–2:45 | System drawer → inject 1.5 s latency. Breaker opens, edge-mode badge appears. | "When the network degrades it names the rung it's on — no silence, no lies." |
| 7 | 2:45–3:00 | Repo + this script on screen. | "Any MCP client can connect today. The number, the failures, and the process ledger are all in the repo." |

## Live-judge variant
If a judge speaks a request: a correct repair question or an honest low-confidence
answer is part of the demo. Say so out loud — honesty under pressure is the product.

## Rules we hold ourselves to
- Every badge on screen equals the mode recorded in the trace for that turn (AC-14).
- No number appears in the video that is not regenerable from a PROOF.md or eval run.
- The A/B baseline is the same server in naive mode — not a strawman.
