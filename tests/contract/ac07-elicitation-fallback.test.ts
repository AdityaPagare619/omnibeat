/**
 * AC07-elicitation-fallback — Charter Part 8.5 AC-07 (blueprint §5.4).
 *
 * When the client advertises form elicitation, ask-decisions use
 * elicitation/create. When it does not, the SAME decision is returned with a
 * spoken_prompt. Both paths are tested — and the decisions must be identical.
 *
 * depends: ARCH contract v0 — exact elicitation/create message shape and the
 * initialize-time capability advertisement key.
 */
import { describe, expect, it } from "vitest";
import { initialize, postRpc, rpc, PROTOCOL_VERSION } from "../helpers/mcp";

async function resolveWithCapabilities(clientCapabilities: Record<string, unknown>): Promise<{
  decision: unknown;
  spokenPrompt: unknown;
  sawElicitation: boolean;
  elicitation?: unknown;
}> {
  const sessionId = await initialize(clientCapabilities);
  await postRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, {
    "mcp-session-id": sessionId,
    "mcp-protocol-version": PROTOCOL_VERSION,
  });
  const res = await postRpc(
    rpc("tools/call", { name: "music_resolve_request", arguments: { transcript: "raja ji", surface: "screenless", locale: "hi-IN" } }, 8),
    { "mcp-session-id": sessionId, "mcp-protocol-version": PROTOCOL_VERSION },
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    result?: { structuredContent?: { decision?: unknown; spoken_prompt?: unknown } };
  };
  // TODO(Phase 2): also observe elicitation/create on the SSE stream while tools/call is in flight.
  return {
    decision: body.result?.structuredContent?.decision,
    spokenPrompt: body.result?.structuredContent?.spoken_prompt,
    sawElicitation: false,
  };
}

describe("AC07-elicitation-fallback", () => {
  it("AC07-elicitation-fallback/form-elicitation: ask-decision uses form elicitation when the client advertises it", async () => {
    // depends: ARCH contract v0 — capability key ("elicitation": {"form": {}, "url": {}}) and
    // elicitation/create schema: flat, one required enum `choice`, options via `title`,
    // plus `none_of_these` (blueprint §5.4).
    const outcome = await resolveWithCapabilities({ elicitation: { form: {}, url: {} } });
    expect(outcome.decision, "ambiguous request must still resolve to a decision").toBe("ask");
    expect(outcome.sawElicitation, "server must send elicitation/create when the client advertises form elicitation (AC-07)").toBe(true);
  });

  it("AC07-elicitation-fallback/spoken-prompt-fallback: without elicitation the identical decision returns with spoken_prompt", async () => {
    const withCap = await resolveWithCapabilities({ elicitation: { form: {}, url: {} } });
    const withoutCap = await resolveWithCapabilities({});
    expect(withCap.decision, "decision must be identical across both paths (AC-07 'same decision')").toBe(withoutCap.decision);
    expect(
      (withoutCap.spokenPrompt as { speak_short?: string } | undefined)?.speak_short ?? withoutCap.spokenPrompt,
      "fallback path must return a spoken_prompt so the host LLM can ask the question itself (§5.4)",
    ).toBeTruthy();
  });
});
