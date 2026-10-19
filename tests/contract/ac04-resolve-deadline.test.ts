/**
 * AC04-resolve-deadline — Charter Part 8.5 AC-04 (blueprint §6.1, Appendix A).
 *
 * music_resolve_request always returns a decision from the enumerated set
 * (play | ask | repair | not_found), never throws to the client, and honours
 * a 1,500 ms deadline under injected upstream latency.
 */
import { describe, expect, it } from "vitest";
import { initialize, postRpc, rpc, PROTOCOL_VERSION } from "../helpers/mcp";

const DECISIONS = ["play", "ask", "repair", "not_found"] as const;

interface ResolveResult {
  result?: {
    isError?: boolean;
    structuredContent?: { decision?: string; confidence?: number; trace_id?: string };
  };
  error?: unknown;
}

async function callResolve(args: Record<string, unknown>): Promise<ResolveResult> {
  const sessionId = await initialize();
  await postRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, {
    "mcp-session-id": sessionId,
    "mcp-protocol-version": PROTOCOL_VERSION,
  });
  const res = await postRpc(
    rpc("tools/call", { name: "music_resolve_request", arguments: args }, 7),
    { "mcp-session-id": sessionId, "mcp-protocol-version": PROTOCOL_VERSION },
  );
  expect(res.status, "tools/call must not fail at HTTP level (protocol errors are JSON-RPC, AC-04)").toBe(200);
  return (await res.json()) as ResolveResult;
}

describe("AC04-resolve-deadline", () => {
  it("AC04-resolve-deadline/enumerated-decision: a valid request returns a decision from the frozen enum", async () => {
    const body = await callResolve({ transcript: "play kesariya by arijit singh", surface: "screenless", locale: "en-IN" });
    expect(body.error, "music_resolve_request must not return a JSON-RPC error for valid input (AC-04 never-throws)").toBeUndefined();
    const decision = body.result?.structuredContent?.decision;
    expect(DECISIONS, "decision must be one of play|ask|repair|not_found (Appendix A)").toContain(decision);
    expect(typeof body.result?.structuredContent?.trace_id, "every decision must carry a trace_id (Appendix A)").toBe("string");
  });

  it("AC04-resolve-deadline/never-throws: degenerate inputs still yield an enumerated decision or isError tool result", async () => {
    const degenerate = [
      { transcript: "", surface: "screenless" },
      { transcript: "zzzz qqqq xxxx", surface: "screenless", locale: "en-US" },
      { transcript: "🎵🎶 play something", surface: "screen" },
      { transcript: "a".repeat(300), surface: "tv", locale: "ja-JP" },
    ];
    for (const args of degenerate) {
      const body = await callResolve(args);
      const sc = body.result?.structuredContent;
      if (body.result?.isError === true) {
        // Tool execution errors are allowed but must be machine-readable per §5.5.
        expect(sc, "isError results must still carry structured content with a code").toBeDefined();
      } else {
        expect(DECISIONS, `degenerate input ${JSON.stringify(args)} must still yield an enumerated decision`).toContain(
          sc?.decision,
        );
      }
    }
  });

  it("AC04-resolve-deadline/deadline-1500ms: honours the 1500ms deadline under injected 1000ms upstream latency", async () => {
    // TODO harness (Phase 2): start the server with a fixture upstream (msw/nock per blueprint
    // §7.3 "Upstream fixture tests") that injects a 1000 ms delay plus a 429 into the catalog
    // lookup; then call music_resolve_request and assert (a) wall-clock <= 1500 ms,
    // (b) a decision from the enum is still returned (degraded L1/L2), (c) the response
    // carries degradation_level and no JSON-RPC error. depends: ARCH contract v0 — which
    // upstream dependency the fixture must delay.
    expect(false, "NOT IMPLEMENTED — AC04 deadline-1500ms: needs fixture upstream injecting 1000ms latency").toBe(true);
  });
});
