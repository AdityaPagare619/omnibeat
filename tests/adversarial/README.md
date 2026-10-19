# RED-TEAM — adversarial & chaos tests

Owner: RED-TEAM (`.omni/roles/red-team.md`). These directories are RED-TEAM-owned; no other agent edits them without ORCH approval (`.omni/OWNERS.yaml`).

## Contents

- `ATTACK_LIST.md` — 39 planned attacks (`ATK-01`..`ATK-39`) mapped to blueprint surfaces (§5.1 protocol, §5.6 untrusted data, §6 pipelines, §8.9 security baseline, §11.4 demo modes) and to acceptance-test ids (`ACnn-<slug>`, T-TEST's convention). Each entry: preconditions, exact repro, expected correct behaviour, catching test, severity.
- `fixtures/adversarial_strings.jsonl` — 49-entry **data** corpus consumed by contract tests. One JSON object per line: `id`, `category`, `field`, `payload` (or `payload_repeat: {value, count}` for oversized strings — consumers materialise `value.repeat(count)`), `rationale`, `expected`, `attack`, `test`. Entries are data, never code; nothing here executes.
- `../chaos/FAULT_PLAN.md` — fault injection per demo mode (LIVE / FIXTURE / REPLAY): network faults, upstream faults, clock/randomness seams, degradation rung (L0–L4) and proving AC per fault. Honest label: Docker and Toxiproxy are BLOCKED on this machine, so faults are injected at node level (undici fault interceptor + local proxy shim), and every artefact from that path is labelled `node-shim`.

## Scope rules (non-negotiable)

- Every fixture and fault is **local**: stub servers on 127.0.0.1, recorded responses, shim proxies. No attack in this tree targets any external system, and none ever will.
- No real secrets, credentials, or tokens — FX-004 is a *canary* that must never resolve to a real value.
- Respectful framing: Unicode/script fixtures test *our* sanitisers and matchers. The attack is control characters, confusables and unbounded input — never a language or the people who speak it (blueprint §1, Charter Part 0.2.9).

## How break-it checks run (Phase 2+)

Per Charter Part 5.2.2: a test that cannot fail is decoration. Procedure, executed in a **scratch worktree only** (`git worktree add ../omni-wt/red-team-breakit-<nn> -b agent/red-team/breakit-<nn>`), never on main, never in a builder's tree:

1. **Pick a bug.** Choose an `ATK-nn` whose mapped `ACnn-*` test exists and passes. Canonical known-bug recipes (each is a 1–5 line change in a scratch worktree):
   - drop the `untrusted: true` flag (kills `AC09-*`),
   - remove the `Origin` check (kills `AC01-origin-mismatch`),
   - remove the cancellation handler (kills `AC08-abort-upstream`),
   - skip the private-IP range check in the fetcher (kills `AC10-*`),
   - hardcode `mode: "LIVE"` in the badge (kills `AC14-badge-mode-mismatch`),
   - replace the injected clock with `Date.now()` (kills determinism / `AC04-deadline-clock-sim`),
   - widen the resolver margin so a near-collision auto-plays (kills `AC04-*` ask-path tests using FX corpus entries).
2. **Introduce the bug** in the scratch worktree; commit it locally with a `test:`-prefixed conventional commit marked `[BREAK-IT]`.
3. **Run the mapped suite** (e.g. `npx vitest run tests/contract/AC09-*`) and capture the output.
4. **Verdict:**
   - Target test **FAILS** → break-it passes. Log to the ledger: `{event:"shell", cmd, exit_code, ts}` plus a `self_check` event naming the ATK, the bug, and the failing test id. Reset/delete the scratch worktree.
   - Target test **still PASSES** → the tests are decorative. This is a **BLOCKER**: escalate to the attack's owner and ORCH (role card escalation rule) with the repro; the feature PR that claimed that AC must not merge until a catching test exists.
5. **Never** weaken, skip, or delete a test to make a break-it go green — that is an automatic FAIL under Part 5.1 and ends RED-TEAM's credibility on the spot.

Cadence: one break-it per merged feature PR touching the attacked surface, at gates G2 (logic) and G3 (integration) at minimum. Every break-it run is append-only ledger traffic in `.omni/ledger/red-team/`.

## Consuming the corpus (for T-TEST / builders)

```ts
// shape only — RED-TEAM does not ship product or test code
type Entry =
  | { id: string; category: string; field: string; payload: string; rationale: string; expected: string; attack: string; test: string }
  | { id: string; category: string; field: string; payload_repeat: { value: string; count: number }; rationale: string; expected: string; attack: string; test: string };

const materialise = (e: Entry) => "payload" in e ? e.payload : e.payload_repeat.value.repeat(e.payload_repeat.count);
```

Contract tests should iterate the file, route each entry into its `field` against the FIXTURE adapter, and assert the `expected` behaviour; the `test` field names the ACnn test id the assertion belongs to.
