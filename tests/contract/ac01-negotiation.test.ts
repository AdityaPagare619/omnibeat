/**
 * AC01-negotiation — Charter Part 8.5 AC-01 (blueprint §5.1).
 *
 * Negotiation with protocolVersion 2025-11-25; missing/wrong
 * MCP-Protocol-Version → 400; unknown session → 404; Origin mismatch → 403.
 *
 * Expected red at Phase 0: no server is implemented, so every fetch fails via
 * the loud "NOT IMPLEMENTED" path in helpers/mcp.ts.
 */
import { describe, expect, it } from "vitest";
import { initialize, postRpc, rpc, PROTOCOL_VERSION } from "../helpers/mcp";

describe("AC01-negotiation", () => {
  it("AC01-negotiation/version-2025-11-25: initialize negotiates 2025-11-25 and returns Mcp-Session-Id", async () => {
    const res = await postRpc(
      rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "ac01-probe", version: "0.0.0" },
      }),
    );
    expect(res.status, "initialize with 2025-11-25 must return HTTP 200").toBe(200);
    const sessionId = res.headers.get("mcp-session-id");
    expect(sessionId, "server must return Mcp-Session-Id on initialize (blueprint §5.1)").toBeTruthy();
    const body = (await res.json()) as { result?: { protocolVersion?: string; capabilities?: unknown } };
    expect(body.result?.protocolVersion, "server must echo protocolVersion 2025-11-25").toBe(PROTOCOL_VERSION);
    // depends: ARCH contract v0 — exact capabilities object (tools/resources/prompts/logging/task)
    expect(body.result?.capabilities, "server must declare capabilities").toBeDefined();
  });

  it("AC01-negotiation/missing-version-400: a later request without MCP-Protocol-Version returns 400", async () => {
    const sessionId = await initialize();
    // Deliberately omit the MCP-Protocol-Version header.
    const res = await postRpc(rpc("tools/list", {}, 2), { "mcp-session-id": sessionId });
    expect(res.status, "missing MCP-Protocol-Version must yield HTTP 400 (AC-01)").toBe(400);
  });

  it("AC01-negotiation/wrong-version-400: a wrong MCP-Protocol-Version returns 400", async () => {
    const sessionId = await initialize();
    const res = await postRpc(rpc("tools/list", {}, 2), {
      "mcp-session-id": sessionId,
      "mcp-protocol-version": "2024-11-05",
    });
    expect(res.status, "wrong MCP-Protocol-Version must yield HTTP 400 (AC-01)").toBe(400);
  });

  it("AC01-negotiation/unknown-session-404: an unknown session id returns 404", async () => {
    const res = await postRpc(rpc("tools/list", {}, 3), {
      "mcp-session-id": "does-not-exist-0000-0000",
      "mcp-protocol-version": PROTOCOL_VERSION,
    });
    expect(res.status, "unknown Mcp-Session-Id must yield HTTP 404 (AC-01)").toBe(404);
  });

  it("AC01-negotiation/origin-403: an Origin mismatch returns 403", async () => {
    // depends: ARCH contract v0 — the exact allowlist of permitted Origins in dev
    const res = await postRpc(
      rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "ac01-origin", version: "0" } }),
      { origin: "http://evil.example" },
    );
    expect(res.status, "cross-origin initialize must yield HTTP 403 (AC-01)").toBe(403);
  });
});
