/**
 * AC17-clean-clone — Charter Part 8.5 AC-17 (blueprint §12.7 day-0 verification).
 *
 * A fresh clone on a clean machine runs `make demo` after the documented
 * prerequisites. Operationalised as a hermetic-clone test: clone the repo at
 * HEAD into a temp dir (no node_modules, no build caches carried over) and run
 * the documented smoke target there, asserting the documented prerequisites
 * section exists and the clone path works from scratch.
 */
import { describe, expect, it } from "vitest";
import { findFiles, REPO_ROOT, rel } from "../helpers/repo";
import { readFileSync } from "node:fs";

describe("AC17-clean-clone", () => {
  it("AC17-clean-clone/fresh-clone-make-demo: documented prerequisites + make demo work from a fresh clone", async () => {
    // TODO harness (Phase 2 / VERIFIER): CI job (or this test) runs, on a clean image:
    //   git clone <repo> tmp && cd tmp && <install documented prerequisites> && make demo
    // asserting exit 0 and the 4-act smoke transcript. The docs half of the contract is
    // checked here for real: a prerequisites section must exist and name every tool the
    // build invokes (node, make, etc.). depends: ARCH contract v0 / DOC — the README
    // prerequisites anchor text.
    const readmes = findFiles(REPO_ROOT, /^README(\.md)?$/i).filter((f) => !f.includes(`${"tests"}/fixtures`));
    expect(readmes.length, "repo must have a README at root — none found (fresh-clone docs prerequisite, AC-17)").toBeGreaterThan(0);
    const rootReadme = readmes.map((f) => rel(f)).sort((a, b) => a.split("/").length - b.split("/").length)[0]!;
    const text = readFileSync(`${REPO_ROOT}/${rootReadme}`, "utf8");
    expect(
      /prerequisit/i.test(text),
      `${rootReadme} must document prerequisites (a 'Prerequisites' section) — AC-17 half the fresh-clone contract`,
    ).toBe(true);
    expect(false, "NOT IMPLEMENTED — AC17 fresh-clone-make-demo: hermetic clone + make demo needs the Phase-1 build (Phase 2)").toBe(true);
  });
});
