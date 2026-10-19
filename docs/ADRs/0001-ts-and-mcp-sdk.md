# ADR-0001: TypeScript everywhere + official MCP TypeScript SDK (version pending)

**Status:** Proposed (Phase 0, Gate G1) · Owner ARCH · Supersedes nothing ·
Relates to: ADR-0002, ADR-0003, ADR-0004

## Context

Three processes (omnibeat-mcp :8080, alexa-lab :4000, lab-console :3000) must
share one contract; the target protocol is MCP **2025-11-25 over Streamable
HTTP** (blueprint §5). Blueprint §4.3 decides "TypeScript everywhere" and the
**official TypeScript MCP SDK**, but marks SDK feature support `[VERIFY]`
(blueprint §4.3, §12.7 item 3): whether a pinned SDK version supports
2025-11-25 **elicitation URL mode, tasks, and SSE resumability** is an open P0
research question owned by R-SPEC.

**[VERIFY R-SPEC-02] — the exact SDK package version must be stated here once
R-SPEC reports the support matrix against primary sources (SDK source at a
pinned tag + release notes). Until then this ADR deliberately names no version
number; naming an unverified version would be an invented citation (charter
Part 12).**

## Options considered

1. **Official TypeScript MCP SDK (chosen), pinned version from R-SPEC-02.** +
   spec-tracking, maintained transport (sessions, SSE, Origin checks), least
   protocol code we own. − feature gaps possible at the pinned tag.
2. **Hand-rolled JSON-RPC + Streamable HTTP layer.** + full control over every
   2025-11-25 message. − we own session/replay/cancellation correctness; highest
   chance a sharp judge finds a protocol bug; ongoing maintenance cost.
3. **Python FastMCP** (blueprint's reserve alternative, §4.3). + fast if the
   team were Python-first. − our team and shared schemas are TS; rejected with
   the language decision.
4. **Hybrid (chosen fallback): official SDK for the base protocol, hand-written
   messages only for features the pinned SDK lacks** (blueprint §4.3:
   "otherwise implement those few messages directly"). − two code paths for one
   session; must be proven by contract tests (`MCP_PROTOCOL_PROOF.md`).

## Decision

- **TypeScript everywhere**, strict mode, one pinned Node LTS, Zod as the single
  source of truth (`@omnibeat/schemas`, ADR companions in docs/ADRs).
- **Use the official TypeScript MCP SDK at a version pinned by R-SPEC-02's
  answer — `[VERIFY R-SPEC-02]`.**
- **Fallback, decided now:** for any 2025-11-25 feature the pinned SDK does not
  support (candidates: URL-mode elicitation, tasks, SSE resumability — exactly
  the three questions in R-SPEC-02), B-MCP implements that message directly over
  the SDK's transport (hand-written JSON-RPC request/notification handling per
  blueprint §4.3 and §12.8 "SDK lacks a spec feature → hand-written messages for
  that feature; add to friction log"). The SDK remains the session owner; we do
  not fork it. Every hand-written message gets a contract test before merge, and
  each one becomes a friction-log entry if the gap is real.

## Consequences

### Positive
- Shared types/schemas across server, host, console; one toolchain (§4.3).
- Spec-tracking maintained by the SDK; our hand-written surface stays small and
  explicitly listed.
- The fallback decision removes a schedule risk: R-SPEC-02's answer changes
  *where* a feature is implemented, not *whether* the contract supports it.

### Negative
- Two protocol code paths (SDK + hand-written) need contract tests each.
- Pin choice deferred: nothing may claim SDK feature support in docs/demo until
  R-SPEC-02 closes; ADR must be amended with the version then.
- If the SDK's abstractions fight the hand-written messages, we may carry
  shims (blueprint §12.8 risk, medium/medium).

### Neutral
- Elicitation/tasks shapes in `packages/schemas` are written against the
  blueprint and flagged `[VERIFY R-SPEC-03/04/05]`; SDK-agnostic by construction.

## Reversal cost

- **Before Phase 1: cheap** — nothing consumes the SDK yet beyond the stub.
- **After omnibeat-mcp is built on it: high** — transport, session, and test
  surface would be rewritten; that is why option 2 is rejected now rather than
  discovered at Phase 5. Switching *versions* within the SDK is medium (regenerate
  contract tests, re-run `MCP_PROTOCOL_PROOF.md` evidence).

## Dissent placeholder

> _No dissent recorded yet. Any agent disagreeing (e.g. preferring the fully
> hand-rolled option 2 for protocol purity) records it here with name, date, and
> argument before Gate G1 — charter Part 10 ADR format._
