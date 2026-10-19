/**
 * AC14-badge-truth — Charter Part 8.5 AC-14 (blueprint §4.2 simulated-vs-real framing).
 *
 * Source badges on the console are truthful: every badge equals the mode
 * (LIVE / FIXTURE / REPLAY) recorded in the ledger for that turn. A badge that
 * would overstate realism is a claims-discipline violation (§9.2), not a UI bug.
 *
 * depends: ARCH contract v0 — ledger artifact path/format and the badge DOM
 * contract (selector + data attributes) of the console.
 */
import { describe, expect, it } from "vitest";
import { readRepoJson, repoPathExists } from "../helpers/repo";

const LEDGER = "results/demo-ledger.jsonl";

interface LedgerEntry {
  turn: string;
  mode: "LIVE" | "FIXTURE" | "REPLAY";
}

describe("AC14-badge-truth", () => {
  it("AC14-badge-truth/badge-equals-ledger-mode: every console badge equals the ledger mode for that turn", async () => {
    // TODO harness (Phase 2): run the 4-act demo in each mode; after each turn capture
    // (a) the console's badge text/data-mode attribute via Playwright and (b) the turn's
    // ledger entry from the demo ledger artifact; assert badge.mode === ledger.mode for
    // every turn, with the ledger file itself validated below.
    expect(repoPathExists(LEDGER), `demo ledger ${LEDGER} must exist — nothing recorded at Phase 0`).toBe(true);
    const ledger = readRepoJson<LedgerEntry[] | { entries: LedgerEntry[] }>(LEDGER);
    const entries = Array.isArray(ledger) ? ledger : ledger.entries;
    expect(entries.length, "ledger must contain one entry per turn").toBeGreaterThan(0);
    expect(false, "NOT IMPLEMENTED — AC14 badge-equals-ledger-mode: Playwright badge capture + ledger join (Phase 2)").toBe(true);
  });

  it("AC14-badge-truth/no-badge-without-ledger-entry: a badge never appears for a turn with no ledger record", async () => {
    // TODO harness (Phase 2): Playwright sweeps all visible badges on the console after the
    // demo; every badged turn must have a matching ledger entry; orphan badges fail the test.
    // A silent (unbadged) turn with a ledger entry is acceptable; the reverse is not.
    expect(false, "NOT IMPLEMENTED — AC14 no-badge-without-ledger-entry: Playwright + ledger join (Phase 2)").toBe(true);
  });
});
