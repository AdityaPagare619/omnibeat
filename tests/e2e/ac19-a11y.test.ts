/**
 * AC19-a11y — Charter Part 8.5 AC-19 (blueprint §7.3 accessibility row).
 *
 * Console automated accessibility checks show zero critical violations; all
 * controls are keyboard reachable; all speech has captions.
 *
 * Harness (blueprint §7.3 + Phase 2): Playwright + @axe-core/playwright against
 * the running console; keyboard traversal via page.keyboard; captions asserted
 * against the TTS caption stream of the console. depends: ARCH contract v0 /
 * designer — console URL and caption DOM contract.
 */
import { describe, expect, it } from "vitest";

describe("AC19-a11y", () => {
  it("AC19-a11y/axe-zero-critical: axe-core reports zero critical violations on the console", async () => {
    // TODO harness (Phase 2): start the console (vite dev or built preview), run
    //   const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    // across every console route (home, turn detail, ledger, offline-cache view) and assert
    // zero violations with impact critical (also fail serious — record the count).
    expect(false, "NOT IMPLEMENTED — AC19 axe-zero-critical: Playwright + @axe-core/playwright harness (Phase 2)").toBe(true);
  });

  it("AC19-a11y/keyboard-reachable: every interactive control is reachable and operable via keyboard", async () => {
    // TODO harness (Phase 2): Playwright tab-traversal sweep — enumerate all interactive
    // elements (button, a[href], input, select, [tabindex]): for each, assert document.activeElement
    // reaches it within N tabs, a visible focus ring matches :focus-visible styles, and
    // Enter/Space activates it. No positive tabindex; no keyboard traps in dialogs.
    expect(false, "NOT IMPLEMENTED — AC19 keyboard-reachable: Playwright tab sweep (Phase 2)").toBe(true);
  });

  it("AC19-a11y/captions-for-all-speech: every TTS utterance rendered by the console shows captions", async () => {
    // TODO harness (Phase 2): for each of the 4 demo acts, Playwright observes every TTS
    // playback start (polly/caption event or audio element play) and asserts a caption
    // element is present and non-empty for the duration of that utterance; screenshot the
    // captioned frame as an artifact. depends: ARCH contract v0 — caption event contract.
    expect(false, "NOT IMPLEMENTED — AC19 captions-for-all-speech: Playwright caption observer (Phase 2)").toBe(true);
  });
});
