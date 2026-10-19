/**
 * AC12-barge-in — Charter Part 8.5 AC-12 (blueprint §6.5 H3, §7.3 audio-in e2e).
 *
 * Sustained speech of >= 250 ms during TTS ducks, cancels and cuts playback
 * within one word of the speech-mark index on fixtures.
 *
 * Harness (blueprint §7.3): Playwright launches Chrome with
 *   --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<fixture.wav>
 * so the real mic path, VAD and agent loop run from a WAV file. Fixtures:
 * tests/fixtures/audio/barge-in-<n>.wav with accompanying speech-mark index
 * (word timestamps) recorded in tests/fixtures/audio/speech-marks-<n>.json.
 * depends: ARCH contract v0 — console URL and speech-mark event contract.
 */
import { describe, expect, it } from "vitest";

describe("AC12-barge-in", () => {
  it("AC12-barge-in/ducks-cancels-cuts: >=250ms sustained speech ducks then cancels TTS", async () => {
    // TODO harness (Phase 2): Playwright + fake audio device (blueprint §7.3). Start the 4-act
    // demo in LIVE mode, wait until TTS is playing (captions/polly events), then Playwright's
    // fake device begins playing barge-in-250ms.wav. Assert within one turn: TTS volume ducks
    // (audio element volume drops), then playback cancels (audio element paused + no further
    // polly requests), and the console shows the barge-in state.
    expect(false, "NOT IMPLEMENTED — AC12 ducks-cancels-cuts: Playwright fake-audio harness + TTS events required (Phase 2)").toBe(true);
  });

  it("AC12-barge-in/within-one-word-of-speech-mark: cut happens within one word of the speech-mark index", async () => {
    // TODO harness (Phase 2): same Playwright fixture path. Server streams speech marks
    // (word-level timestamps); on barge-in the test reads the last *audible* word index from
    // the audio player position and asserts playback stopped within one speech-mark word of
    // that index (<= 1 word boundary past the current mark). Fixture wav duration and
    // speech-mark json are paired so the assertion is deterministic.
    expect(false, "NOT IMPLEMENTED — AC12 within-one-word-of-speech-mark: speech-mark fixture + Playwright harness (Phase 2)").toBe(true);
  });
});
