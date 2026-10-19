import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TraceBus, type Frame } from "../src/trace-bus.js";
import { CircuitBreaker } from "../src/breaker.js";
import { McpHostClient, McpError } from "../src/mcp-client.js";
import { deadPortUrl, originOf } from "./helpers.js";

const HOST = "host→mcp";
const MCP = "mcp→host";

describe("MCP client — offline is reported honestly, never faked", () => {
  let bus: TraceBus;
  let breaker: CircuitBreaker;
  let mcp: McpHostClient;
  let mcpUrl: string;

  beforeAll(async () => {
    mcpUrl = await deadPortUrl("/mcp");
    bus = new TraceBus();
    breaker = new CircuitBreaker();
    mcp = new McpHostClient({
      mcpUrl,
      mcpOrigin: originOf(mcpUrl),
      bus,
      breaker,
      connectTimeoutMs: 400,
      toolTimeoutMs: 400,
      reconnectBackoffMs: [50, 50, 50],
    });
    await mcp.start();
  });

  afterAll(async () => {
    await mcp.close();
  });

  it("boots to offline without throwing when the server is down", () => {
    expect(mcp.state).toBe("offline");
    expect(mcp.isOnline).toBe(false);
  });

  it("emits a connect-failure frame carrying MCP_OFFLINE", () => {
    const failed = bus.recent().find((f) => f.method === "session.connect_failed");
    expect(failed).toBeDefined();
    expect(failed?.direction).toBe("internal");
    expect((failed?.payload as { code?: string }).code).toBe("MCP_OFFLINE");
    expect((failed?.payload as { error?: string }).error).toBeTruthy();
  });

  it("rejects a tool call with McpError MCP_OFFLINE and never invents a result", async () => {
    const before = bus.size();
    const err = await mcp
      .callTool("music_resolve_request", {
        transcript: "play raja ji",
        surface: "screenless",
      })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe("MCP_OFFLINE");
    expect((err as McpError).message).toContain(mcpUrl);

    const frames = bus.since(before);
    const attempt = frames.find(
      (f) => f.direction === HOST && f.method === "tools/call" && f.tool === "music_resolve_request",
    );
    expect(attempt, "the attempted tools/call must appear on the trace").toBeDefined();
    expect((attempt?.payload as { delivered?: boolean }).delivered).toBe(false);
    expect((attempt?.payload as { code?: string }).code).toBe("MCP_OFFLINE");

    const failed = frames.find((f) => f.method === "tools/call.failed");
    expect(failed?.direction).toBe("internal");
    expect((failed?.payload as { code?: string }).code).toBe("MCP_OFFLINE");

    // No response frame, no decision: nothing was returned by the server.
    const fakeResults = frames.filter(
      (f) => f.direction === MCP && f.method === "tools/call" && f.tool === "music_resolve_request",
    );
    expect(fakeResults).toHaveLength(0);
  });

  it("observes the failure on the breaker (two strikes open it)", async () => {
    expect(breaker.state).toBe("closed");
    await mcp
      .callTool("music_resolve_request", { transcript: "x", surface: "screenless" })
      .catch(() => undefined);
    expect(breaker.snapshot().consecutiveFails).toBeGreaterThanOrEqual(1);
    await mcp
      .callTool("music_resolve_request", { transcript: "x", surface: "screenless" })
      .catch(() => undefined);
    expect(breaker.state).toBe("open");
    expect(breaker.snapshot().edgeMode).toBe(true);
  });

  it("blocks the next call with MCP_CIRCUIT_OPEN (edge mode), still with no fake result", async () => {
    const before = bus.size();
    const err = await mcp
      .callTool("music_resolve_request", { transcript: "x", surface: "screenless" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect((err as McpError).code).toBe("MCP_CIRCUIT_OPEN");
    expect((err as { detail?: { breaker?: { edgeMode?: boolean } } }).detail?.breaker?.edgeMode).toBe(
      true,
    );

    const frames = bus.since(before);
    expect(frames.some((f) => f.method === "breaker.blocked")).toBe(true);
    expect(frames.some((f) => f.direction === MCP && f.tool === "music_resolve_request")).toBe(
      false,
    );
  });

  it("reports a failed health probe without pretending it succeeded", async () => {
    breaker.reset();
    const probe = await mcp.probe();
    expect(probe.ok).toBe(false);
    expect(probe.code).toBe("MCP_OFFLINE");
    expect(probe.rttMs).toBeGreaterThanOrEqual(0);
    const frame = bus
      .recent()
      .reverse()
      .find((f) => f.method === "GET /healthz" && f.direction === HOST);
    expect(frame).toBeDefined();
    expect((frame?.payload as { ok?: boolean }).ok).toBe(false);
  });

  it("surfaces an unreachable /admin/mode toggle as ADMIN_MODE_UNREACHABLE", async () => {
    await expect(mcp.setNaiveMode(true)).rejects.toMatchObject({
      code: "ADMIN_MODE_UNREACHABLE",
    });
    const frames: Frame[] = bus.recent();
    expect(
      frames.some(
        (f) =>
          f.direction === HOST &&
          f.method === "POST /admin/mode" &&
          (f.payload as { status?: number }).status === undefined,
      ) ||
          frames.some((f) => f.method === "POST /admin/mode.failed"),
    ).toBe(true);
  });
});
