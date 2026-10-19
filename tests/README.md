# OmniBeat acceptance tests (T-TEST) — AC-01..AC-20 skeletons

Phase 0 skeletons for every acceptance criterion in Charter Part 8.5.
**Every test in this package FAILS at creation** — that is the point: the red
run is the receipt that the criteria were pinned before implementation began
(Charter Part 16, action 8). No test here may be skipped, softened, or deleted
to go green; implementation must meet them.

## Run

```sh
cd tests
npm install
npx vitest run        # all red — see "Expected failure inventory"
npm run typecheck     # tsc --noEmit, strict
```

The MCP contract tests target `http://127.0.0.1:8787/mcp` by default
(override with `OMNIBEAT_MCP_URL`).

## AC → test id → file map

| AC | Test id(s) (stable) | File | Level |
|----|--------------------|------|-------|
| AC-01 | `AC01-negotiation/version-2025-11-25`, `/missing-version-400`, `/wrong-version-400`, `/unknown-session-404`, `/origin-403` | `contract/ac01-negotiation.test.ts` | contract |
| AC-02 | `AC02-sse-post-delete/post-tools-list`, `/get-sse-stream`, `/sse-event-ids`, `/last-event-id-resume`, `/delete-session` | `contract/ac02-sse-post-delete.test.ts` | contract |
| AC-03 | `AC03-tools-list/eight-tools`, `/valid-input-schema`, `/output-schemas`, `/annotations` | `contract/ac03-tools-list.test.ts` | contract |
| AC-04 | `AC04-resolve-deadline/enumerated-decision`, `/never-throws`, `/deadline-1500ms` | `contract/ac04-resolve-deadline.test.ts` | contract |
| AC-05 | `AC05-calibration/ece-within-tolerance`, `/diagram-bins-have-ci` | `property/ac05-calibration.test.ts` | property |
| AC-06 | `AC06-pack-measurements/measured-wrong-play-rate`, `/unmeasured-ships-experimental`, `/pack-resource-exposed` | `property/ac06-pack-measurements.test.ts` | property |
| AC-07 | `AC07-elicitation-fallback/form-elicitation`, `/spoken-prompt-fallback` | `contract/ac07-elicitation-fallback.test.ts` | contract |
| AC-08 | `AC08-cancellation-200ms/stops-upstream-within-200ms`, `/releases-work-no-late-result` | `contract/ac08-cancellation-200ms.test.ts` | contract |
| AC-09 | `AC09-untrusted-metadata/returned-as-data-untrusted`, `/never-executed-or-echoed-as-policy` | `property/ac09-untrusted-metadata.test.ts` | property |
| AC-10 | `AC10-ssrf-fetcher/refuses-private-ranges`, `/refuses-off-allowlist-redirect` | `contract/ac10-ssrf-fetcher.test.ts` | contract |
| AC-11 | `AC11-privacy/no-audio-fields-in-any-schema`, `/no-transcripts-at-info-level`, `/alias-memory-listable-and-deletable`, `/privacy-forget-my-data` | `contract/ac11-privacy.test.ts` | contract |
| AC-12 | `AC12-barge-in/ducks-cancels-cuts`, `/within-one-word-of-speech-mark` | `e2e/ac12-barge-in.test.ts` | e2e (Playwright fake-audio, blueprint §7.3) |
| AC-13 | `AC13-continuity/breaker-opens-under-injected-loss`, `/edge-mode-plays-cached-track`, `/replay-exactly-once` | `e2e/ac13-continuity.test.ts` | e2e (Toxiproxy chaos) |
| AC-14 | `AC14-badge-truth/badge-equals-ledger-mode`, `/no-badge-without-ledger-entry` | `e2e/ac14-badge-truth.test.ts` | e2e (Playwright + ledger join) |
| AC-15 | `AC15-demo-check/live`, `/fixture`, `/replay` | `e2e/ac15-demo-check.test.ts` | e2e (`make demo-check`, 3 modes) |
| AC-16 | `AC16-pack-data-only/dummy-pack-loads-data-only` | `contract/ac16-pack-data-only.test.ts` | contract (+ fixture `fixtures/packs/xx-TEST/`) |
| AC-17 | `AC17-clean-clone/fresh-clone-make-demo` | `e2e/ac17-clean-clone.test.ts` | e2e (hermetic clone; docs half asserted for real) |
| AC-18 | `AC18-secrets-audit/secret-scan-clean`, `/no-unwaived-high-findings`, `/containers-non-root` | `e2e/ac18-secrets-audit.test.ts` | e2e (gitleaks / audit / Dockerfile scan) |
| AC-19 | `AC19-a11y/axe-zero-critical`, `/keyboard-reachable`, `/captions-for-all-speech` | `e2e/ac19-a11y.test.ts` | e2e (Playwright + axe-core) |
| AC-20 | `AC20-numbers-map-to-artifacts/claims-map-to-artifacts`, `/recorded-commit-stamp` | `e2e/ac20-numbers-map-to-artifacts.test.ts` | e2e (repo-artifact audit) |

54 `it()` blocks across 20 files.

## Expected failure inventory

**ALL tests fail at creation (Phase 0) because nothing is implemented.**
The red-run output for this commit is recorded in `RUN-2026-10-19.txt`.

| Failure mode | Tests | What turning green requires |
|--------------|-------|------------------------------|
| `NOT IMPLEMENTED: OmniBeat MCP server unreachable at http://127.0.0.1:8787/mcp` | AC-01 (all), AC-02 (post/sse ids/delete), AC-03 (all), AC-04 (enumerated-decision, never-throws), AC-07 (both), AC-11 (alias, forget) | The Phase-1 MCP server speaking blueprint §5.1 wire contract |
| `NOT IMPLEMENTED — <AC> …: needs <harness>` (explicit false assertion with TODO harness comment) | AC-02 last-event-id-resume; AC-04 deadline-1500ms; AC-07 elicitation shapes; AC-08 both; AC-09 both; AC-10 both; AC-11 transcripts; AC-12/13/14/15/17/19 (all e2e harness ACs); AC-16 loader half | The Phase-2 harness named in each file's TODO comment (msw fixture upstream, Toxiproxy, Playwright fake-audio, gitleaks, axe-core, …) |
| Missing artifact file (`expected artifact … does not exist`) | AC-05 (both), AC-06 measured/pack-resource, AC-14 ledger half, AC-20 manifest | `make eval` outputs, demo ledger, results/MANIFEST.json |
| Zero files found (`no … found — NOT IMPLEMENTED`) | AC-06 packs, AC-11 schemas, AC-17 README-prereqs, AC-18 gitleaks config + Dockerfiles + waivers, AC-20 claim docs + artifacts | Phase-1 repo structure landing (README, Dockerfiles, packs, security/) |
| `make` exits non-zero | AC-15 (live, fixture, replay) | J-DEMO's `demo-check` target |

Green in this package means **the criterion is met and evidenced** — never that
a test was weakened. Schema-dependent assertions are marked
`// depends: ARCH contract v0` in the source; when contract v0 lands, only the
marked assumptions (not the AC semantics) may be aligned.

## Layout

```
tests/
  package.json          vitest + ajv + fast-check; `npm test` = vitest run
  vitest.config.ts      strict, deterministic order, node env
  tsconfig.json         TypeScript strict
  helpers/mcp.ts        wire-level MCP client (blueprint §5.1 only)
  helpers/repo.ts       repo-artifact scanning helpers
  contract/             AC-01..04, 07, 08, 10, 11, 16
  property/             AC-05, 06, 09
  e2e/                  AC-12..15, 17..20
  fixtures/packs/xx-TEST/  data-only dummy locale pack for AC-16
  RUN-2026-10-19.txt    the red-run receipt
```
