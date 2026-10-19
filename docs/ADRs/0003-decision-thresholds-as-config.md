# ADR-0003: Decision thresholds, timeouts, and flags ship as typed config, not code

**Status:** Proposed (Phase 0, Gate G1) · Owner ARCH · Relates to: ADR-0004

## Context

The decision policy (play/ask/repair/not_found, blueprint §6.2), the stage
budgets (§6.1), circuit-breaker parameters (§8.4, §6.6), cache TTLs (§8.2), and
source kill switches (§8.4) are all values we *expect to change*: the eval
harness sweeps thresholds and publishes the wrong-play vs ask-rate curve
(§6.2), the demo operating point is "a product decision shown on the chart",
and blueprint §8.8 mandates "Configuration, not code… the eval harness reads the
same config, so the demo operating point is reproducible". Charter Part 10 adds:
"Config is typed, with safe defaults and environment overrides." Hardcoding
these values — or letting the eval and the server read different values — would
break AC-05/AC-20 and the claims discipline (§9.2: every number regenerable).

## Options considered

1. **Constants in code.** + simplest to read. − any sweep requires a rebuild;
   eval/server drift is invisible; fails §8.8 and Part 10 explicitly.
2. **Loose JSON/YAML config file, untyped.** + flexible. − typo fails silently
   at runtime (a `tPlay` misspelled → default threshold games the eval); no
   compile-time help to B-INFRA; rejected for safety of the measurement story.
3. **Typed config object in `@omnibeat/schemas` with defaults + env overrides
   (chosen)** (`src/config.ts`). − one shared package dep; + one source both
   processes and the eval import; values validated on load; env overrides for
   deployment (§8.8) with a declared key list.
4. **Per-service config duplication** (server owns thresholds, eval owns its
   own). + independent release. − guarantees drift; violates the reproducibility
   requirement; rejected outright.

## Decision

- **`omnibeatConfigSchema` (Zod, strict) in `packages/schemas` is the single
  typed config**: decision thresholds per surface/profile (+ kids override),
  `askMaxCandidates`, stage budgets incl. the 1,500 ms total deadline, server and
  client circuit-breaker parameters, cache TTLs, alias retention, feature flags
  (`autocompleteEnabled`, `rerankEnabled` — both default **false**), per-source
  kill switches, provider order (ADR-0004), rate limits, supported locales,
  security flags.
- **Defaults are blueprint-sourced** (§6.1/§6.2/§6.6/§6.7/§8.1–8.5) and printed
  in `defaultConfig()`; `omnibeatConfigSchema.parse({})` must equal the demo
  operating point (asserted by the smoke test).
- **Environment overrides** are a declared key list (`envOverrideKeys`);
  parsing/coercion is owned by B-INFRA, never by ad-hoc `process.env` reads.
- **Draft values are labelled in-code as CONTRACT DRAFT** — notably
  `tCover = 0.70` (the blueprint defines `T_cover` but ships no value; §6.2) and
  `hookEphemeralTtlMs = 10 min` (§6.4 says "minutes" only). Both are listed in
  docs/ARCHITECTURE §9 for ORCH and must be re-picked from the eval sweep before
  the demo; changing a threshold outside a pre-registered reason is an automatic
  FAIL under charter Part 5.1.

## Consequences

### Positive
- Eval sweeps, server decisions, and demo numbers provably read one object
  (AC-05, AC-20); sweeps are data, not rebuilds.
- Typed load fails fast on bad values — a threshold can't silently game itself.
- Kill switches and provider order (ADR-0004) become runtime ops levers (§8.4).

### Negative
- Config schema changes are contract changes → additive-only discipline and G1
  review apply to tuning PRs too.
- Two draft values (T_cover, hook TTL) carry honest uncertainty until eval/demos
  close them; docs must not quote them as final.

### Neutral
- Location constants (ports 3000/4000/8080) live with deployment config
  (B-INFRA), not in this schema; nothing here reads the environment directly.

## Reversal cost

- **To hardcoded constants: high in practice** — the eval reproducibility story
  and every judge-facing number depend on this path; reverting means re-proving
  AC-05/AC-20. Code-wise it is trivial, which is exactly why the typed config
  keeps it honest.
- **Restructuring fields: medium** — additive changes are cheap; renames break
  consumers (services + eval) and need a coordinated G1-flagged bump.

## Dissent placeholder

> _No dissent recorded yet. Anyone arguing thresholds should be code-owned by
> B-PHON or swept only by the eval records it here with the drift risk they
> accept, before Gate G1._
