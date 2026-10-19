/**
 * AC16-pack-data-only — Charter Part 8.5 AC-16 (blueprint §7.1 scalability story).
 *
 * Adding a sample locale pack requires ONLY data files + a manifest — verified
 * by a test that adds a dummy pack (xx-TEST) from tests/fixtures/packs/ and
 * asserts no code file changes and the pack is accepted + hot-loaded.
 *
 * The dummy pack fixture lives at tests/fixtures/packs/xx-TEST/ (data only:
 * pack.json, rules.json, translit.json, fixtures.jsonl, README.md per §7.1).
 * depends: ARCH contract v0 — the pack loader entry point and the listChanged
 * notification that must fire on hot-load.
 */
import { describe, expect, it } from "vitest";
import { repoPathExists } from "../helpers/repo";

const DUMMY_PACK = "tests/fixtures/packs/xx-TEST";

describe("AC16-pack-data-only", () => {
  it("AC16-pack-data-only/dummy-pack-loads-data-only: a dummy pack loads from data files alone with zero code changes", () => {
    expect(repoPathExists(`${DUMMY_PACK}/pack.json`), `dummy pack fixture must exist at ${DUMMY_PACK}`).toBe(true);
    expect(repoPathExists(`${DUMMY_PACK}/rules.json`), "dummy pack needs rules.json (blueprint §7.1)").toBe(true);
    expect(repoPathExists(`${DUMMY_PACK}/translit.json`), "dummy pack needs translit.json (blueprint §7.1)").toBe(true);
    expect(repoPathExists(`${DUMMY_PACK}/fixtures.jsonl`), "dummy pack needs fixtures.jsonl (blueprint §7.1)").toBe(true);
    expect(repoPathExists(`${DUMMY_PACK}/README.md`), "dummy pack needs README.md with reviewer info (blueprint §7.1)").toBe(true);
    // TODO harness (Phase 2): copy ${DUMMY_PACK} into packages/phonetic-core/packs/xx-TEST/,
    // hot-load the server, and assert: (a) listChanged notification fires on tools/resources,
    // (b) music_resolve_request routes xx-TEST utterances through the new pack,
    // (c) `git status --porcelain` shows changes ONLY under packs/ (no code file touched),
    // (d) unmeasured dummy pack reports status "experimental" (ties to AC-06).
    expect(false, "NOT IMPLEMENTED — AC16 dummy-pack-loads-data-only: pack-loader + listChanged harness (Phase 2)").toBe(true);
  });
});
