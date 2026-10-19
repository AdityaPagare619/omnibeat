import { describe, expect, it } from "vitest";
import { buildLogRecord } from "../src/logger.js";

describe("structured logging", () => {
  it("redacts transcripts at info and above", () => {
    const rec = buildLogRecord("info", "turn resolved", {
      traceId: "trn-1",
      heard: "play raja ji",
      transcript: "play raja ji",
      spoken: "which one?",
      payload: { transcript: "play raja ji" },
      decision: "ask",
    });
    expect(rec).not.toBeNull();
    expect(rec?.heard).toBe("[redacted]");
    expect(rec?.transcript).toBe("[redacted]");
    expect(rec?.spoken).toBe("[redacted]");
    expect(rec?.payload).toBe("[redacted]");
    expect(rec?.decision).toBe("ask");
    expect(rec?.traceId).toBe("trn-1");
    expect(typeof rec?.ts).toBe("string");
    expect(JSON.stringify(rec)).not.toContain("raja ji");
  });

  it("keeps transcripts at debug when explicitly enabled", () => {
    const rec = buildLogRecord("debug", "wire", { heard: "play raja ji" }, "debug");
    expect(rec?.heard).toBe("play raja ji");
  });

  it("drops records below the level threshold", () => {
    expect(buildLogRecord("debug", "quiet", {}, "info")).toBeNull();
    expect(buildLogRecord("warn", "loud", {}, "info")).not.toBeNull();
  });

  it("omits undefined fields", () => {
    const rec = buildLogRecord("info", "x", { a: undefined, b: 1 });
    expect(rec).toHaveProperty("b", 1);
    expect(rec).not.toHaveProperty("a");
  });
});
