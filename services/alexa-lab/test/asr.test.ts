import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsrError, recognize } from "../src/asr.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "transcripts",
);

describe("fixture ASR", () => {
  it("reads a fixture transcript with n-best alternatives", async () => {
    const result = await recognize({ fixtureId: "rajaji", fixturesDir });
    expect(result.heard).toBe("play raja ji");
    expect(result.label).toBe("FIXTURE");
    expect(result.badge).toBe("FIXTURE");
    expect(result.fixtureId).toBe("rajaji");
    expect(result.locale).toBe("en-IN");
    expect(result.alternatives).toHaveLength(4);
    expect(result.alternatives[0]).toEqual({ text: "play raja ji", confidence: 0.54 });
    // The whole point of the fixture: "Rajaji" arrives mis-segmented.
    expect(result.alternatives.map((a) => a.text)).toContain("play rajaji");
  });

  it("labels typed text TYPED under the FIXTURE badge (mic would be LIVE)", async () => {
    const result = await recognize({ text: "  play raja ji  ", locale: "en-IN", fixturesDir });
    expect(result.heard).toBe("play raja ji");
    expect(result.label).toBe("TYPED");
    expect(result.badge).toBe("FIXTURE");
    expect(result.label).not.toBe("LIVE");
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0]?.confidence).toBe(1);
  });

  it("prefers fixtureId over text when both are supplied", async () => {
    const result = await recognize({
      fixtureId: "taylor-ambiguous",
      text: "play something else",
      fixturesDir,
    });
    expect(result.heard).toBe("play taylor");
    expect(result.fixtureId).toBe("taylor-ambiguous");
  });

  it("fails honestly when the fixture does not exist", async () => {
    await expect(recognize({ fixtureId: "does-not-exist", fixturesDir })).rejects.toMatchObject({
      name: "AsrError",
      code: "ASR_FIXTURE_NOT_FOUND",
    });
    await expect(recognize({ fixtureId: "does-not-exist", fixturesDir })).rejects.toBeInstanceOf(
      AsrError,
    );
  });

  it("rejects traversal-looking fixture ids", async () => {
    await expect(recognize({ fixtureId: "../secrets", fixturesDir })).rejects.toMatchObject({
      code: "ASR_FIXTURE_INVALID",
    });
  });

  it("reports ASR_NO_INPUT when neither text nor fixtureId is given", async () => {
    await expect(recognize({ fixturesDir })).rejects.toMatchObject({ code: "ASR_NO_INPUT" });
  });
});
