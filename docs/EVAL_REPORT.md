# OmniBeat evaluation

The evaluation report lives next to the corpus locks it was generated from:

- `eval/report.md` - human-readable report (verdict first, numbers table, auto "why" diagnostics, worst failures, gaps)
- `eval/results.json` - machine-readable results (same run, same numbers, incl. diagnostics)
- `eval/coverage-gaps.json` - expected titles that could NOT be captured live (exact upstream errors); those utterances are excluded from the answerable-coverage denominator, never from the metrics
- `eval/corpus.lock.json` / `eval/heldout.lock.json` - deterministic hash-split corpus locks (sha256 inside)

Regenerate everything with one command from the repo root:

```
npm --prefix packages/schemas install && npm --prefix packages/schemas run build
npm --prefix services/omnibeat-mcp install && npm --prefix services/omnibeat-mcp run build
npm --prefix packages/eval install && npm --prefix packages/eval run build
node services/omnibeat-mcp/scripts/expand-catalog.mjs   # live capture: fills catalog gaps (network; idempotent)
node packages/eval/dist/cli.js run
```

The harness runs fully offline against the server's REPLAY-only catalog, spawns the server on a random free port, and kills it after the run. If OmniBeat does not beat the naive baseline, `eval/report.md` says so in its first paragraph - the harness is not allowed to flatter the system.
