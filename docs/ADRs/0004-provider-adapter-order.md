# ADR-0004: Provider adapter order — parallel hedged fetches with fixed precedence

**Status:** Proposed (Phase 0, Gate G1) · Owner ARCH · Relates to: ADR-0002,
ADR-0003 (`sources.providerOrder`, `sourceEnabled`)

## Context

Candidate generation (blueprint §6.1 S1) queries several sources under a
600 ms hard timeout with a 250 ms hedge, fuses by reciprocal-rank fusion (S2),
and must degrade source-by-source (§8.3 ladder L1, §8.4 kill switches). The
sources are listed in blueprint §4.1 as "Deezer · iTunes · MusicBrainz ·
autocomplete (optional) · demo fixtures", and their terms/rate limits are open
questions owned by R-MUSIC (`[VERIFY]` in §4.3 and §8.5 → R-MUSIC-01/02/03).
The contract must fix *how* order matters — for timeouts, tie-breaking, cost,
and kill switches — without hardcoding source logic into the resolver.

## Options considered

1. **Sequential fallback (try Deezer, then iTunes, then …).** + trivially
   ordered. − serialises latency: worst case blows the 600 ms budget long
   before the 1,500 ms deadline; a slow first source blocks everyone; rejected
   against §6.1's explicit "parallel, hedged".
2. **Parallel fan-out to all sources every time (no order).** + fastest.
   − ignores rate limits (~1 req/s MusicBrainz, §8.5) and cost; hedges fire
   blindly; kill switches (§8.4) need a precedence to *fall back to*; rejected.
3. **Parallel + hedge + fixed precedence (chosen).** All *enabled* sources are
   queried concurrently; the slowest are hedged after 250 ms (S1); a fixed
   **precedence order** decides (a) hedge priority, (b) reciprocal-rank-fusion
   tie-breaks, (c) which sources survive progressive degradation, (d) default
   cost ranking when signals are equal.
4. **Adaptive/order-by-success-rate at runtime.** + theoretically optimal.
   − new moving part with state we cannot measure honestly in the window
   (would need its own eval); rejected as over-engineering for v1; roadmap at
   most.

## Decision

- **`sources.providerOrder` in typed config** fixes precedence as
  **`deezer → itunes → musicbrainz → autocomplete → fixtures`** — blueprint
  §4.1 listing order, asserted by the config smoke test (ADR-0003).
- **Fetch model stays blueprint §6.1**: parallel with 600 ms hard timeout and a
  250 ms hedge; precedence orders *priority and tie-breaks*, not serialisation.
- **Autocomplete ships disabled by default** (`sourceEnabled.autocomplete =
  false`, `flags.autocompleteEnabled = false`) in production, on in the lab
  (§8.4); its unofficial-source terms risk is `[VERIFY R-MUSIC-03]`. Fixtures
  are a first-class adapter (REPLAY/FIXTURE badge honesty, §4.2), not a silent
  fallback: any answer built from fixtures must badget as such.
- **Kill switches are per source** (§8.4): disabling a source removes it from
  fan-out and from precedence; the resolver never special-cases names — order
  and enablement are data (config), matching the "configuration, not code" rule.

## Consequences

### Positive
- One knob (`providerOrder`) explains hedge order, fusion tie-breaks, and
  degradation order to judges and tests; documented in docs/ARCHITECTURE §8.
- Terms risk is contained: unclean sources (autocomplete) sit *last* and *off*;
  if R-MUSIC-01/02/03 fail, removal is a config edit, not a resolver change.
- Deterministic behaviour under partial failure → reproducible eval runs.

### Negative
- Precedence embedded in fusion tie-breaks means changing order can shift
  results → it is a sweep-sensitive parameter; changes need a pre-registered
  reason (charter Part 5.1) and a config-shape review.
- "Parallel but ordered" is subtler to explain than plain serial fallback —
  needs one paragraph in MCP_PROTOCOL_PROOF/README (we have it: §6.1 budgets).

### Neutral
- MusicBrainz serves aliases/canonical IDs rather than ranked candidates; its
  precedence slot governs rate-limit budgeting and fallback, documented as such.

## Reversal cost

- **Reordering / re-enabling sources: free** — pure config (ADR-0003).
- **Switching to sequential or adaptive strategies: medium-high** — resolver
  stage S1, budget tests, and eval would need rework and re-baselining; do not
  attempt inside the hackathon window.

## Dissent placeholder

> _No dissent recorded yet. R-MUSIC or B-PHON may argue for a different
> precedence (e.g. fixtures earlier for demo determinism, or iTunes before
> Deezer on terms grounds) — record it here with the trade-off before Gate G1._
