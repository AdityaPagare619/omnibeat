# ADR-0002: Stateless processes with an externalised session/receipt store

**Status:** Proposed (Phase 0, Gate G1) · Owner ARCH · Relates to: ADR-0001

## Context

omnibeat-mcp must serve sessions (MCP `Mcp-Session-Id`), action receipts,
household alias memory, idempotency keys, and SSE replay events — while running
where we deploy it: App Runner / Fargate (blueprint §4.3), possibly multiple
instances, possibly behind a load balancer, and ideally on a managed stateless
MCP host (blueprint §8.1, §12.8 friction seed "Stateless hosting vs session id").
The blueprint's operational principle §8.1 is explicit: "Stateless processes,
durable state. All session and receipt state lives in the store behind an
interface. Any instance can serve any request."

## Options considered

1. **In-memory state + sticky sessions.** + zero new deps, fastest hackathon
   path. − breaks on instance recycle, blocks App Runner/Fargate scale-out and
   any managed MCP host; session loss mid-demo; rejected by §8.1.
2. **Externalised store behind an interface (chosen)** — SQLite default,
   DynamoDB adapter (blueprint §4.1, §4.3). + stateless processes, real
   deployability, testable with a local file, same code path to AWS; replay
   events and idempotency keys survive restarts.
3. **Embed a server DB into the process (Postgres sidecar / LiteFS-style).**
   + strong consistency. − operational weight beyond a hackathon; DynamoDB path
   already covers growth; over-engineering (skill: anti-pattern "over-engineering").
4. **Client-owned state only** (console keeps everything). − contradicts
   receipts/alias/eval resources the server must serve to *any* MCP client.

## Decision

- All durable state (sessions, receipts, aliases, idempotency records, SSE
  replay events) lives **outside the process**, behind a `Store` interface with
  two implementations: **SQLite (default/dev) and DynamoDB (deploy)**.
- The process keeps only ephemeral per-request data (in-flight fetches, LRU
  caches with TTLs — §8.2); **no** requirement for session affinity.
- Contract inputs that key the store are opaque ids already in the schema:
  `household_id`, `session_id`, `resolution_id`, `receipt_id`,
  `idempotency_key` (`packages/schemas`).
- Server-side SSE resumption reads from the store's event log
  [VERIFY R-SPEC-01: `Last-Event-ID` replay semantics at the pinned spec].

## Consequences

### Positive
- Any instance serves any request (§8.1); scale-out and redeploy without
  session loss; matches App Runner/Fargate/AgentCore targets (§4.3).
- Idempotency (§8.6) and replay are natural store primitives — duplicate
  delivery is harmless by construction.
- Store can be exercised directly in tests (fixtures, contract tests).

### Negative
- Every mutating path pays store latency; needs TTL/index design (receipts
  90-day alias TTL, §6.7).
- SQLite ⇄ DynamoDB adapter divergence risk: semantics (conditional writes,
  TTLs) must be pinned by a shared store test-suite — new artifact to own.
- More moving parts in `make demo` than a single process (mitigated: SQLite
  is a local file).

### Neutral
- Console-side local cache and command log (§6.6) are *additional* to this
  store, not a replacement; the log replays **into** it.

## Reversal cost

- **To in-memory later: low code, high risk** — the interface stays, but the
  deployment claims (stateless, AC-13 replay, receipts) would be withdrawn;
  docs/ARCHITECTURE §2 and the friction-log entry would need rewrites.
- **SQLite → DynamoDB later: medium** — isolated behind the adapter; the shared
  store test-suite is the cost driver. Doing it at Phase 5 instead of Phase 2
  would risk rework, so the adapter interface lands early.

## Dissent placeholder

> _No dissent recorded yet. Anyone preferring sticky in-memory for demo speed
> records name, date, and the specific risk they accept here before Gate G1._
