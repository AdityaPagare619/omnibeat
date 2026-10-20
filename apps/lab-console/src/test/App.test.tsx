/**
 * Rendering tests for lab-console.
 *
 * The ONLY mock is the WS transport layer (src/transport.ts) — the components
 * and the derivation layer run for real, so these tests exercise the same
 * message path a live alexa-lab connection would (blueprint §2 row 3: the
 * inspector must be fed by the real trace bus, never fabricated client-side).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TraceEnvelope } from "../types";
import type { TransportHandlers, TransportStatus } from "../transport";

/* ------------------------------------------------------------------ mock WS */

interface CapturedHandler {
  handlers: TransportHandlers;
}

const capture: CapturedHandler[] = [];

vi.mock("../transport", () => ({
  TraceTransport: class {
    constructor(_url: string, handlers: TransportHandlers) {
      capture.push({ handlers });
    }
    connect(): void {
      /* the test drives status/messages explicitly */
    }
    close(): void {
      /* no-op */
    }
  },
}));

function lastHandler(): TransportHandlers {
  const h = capture[capture.length - 1];
  if (!h) throw new Error("no transport handler captured — did <App /> mount?");
  return h.handlers;
}

function setStatus(status: TransportStatus, detail = "test"): void {
  act(() => {
    lastHandler().onStatus(status, detail);
  });
}

function emit(envelope: Partial<TraceEnvelope> & { event_id: string }): void {
  act(() => {
    lastHandler().onEnvelope(envelope as TraceEnvelope, 1);
  });
}

/* --------------------------------------------------------------- factories */

let seq = 0;
function frame(p: Partial<TraceEnvelope> & { event_id: string }): TraceEnvelope {
  seq += 1;
  return {
    trace_id: `trace-${seq}`,
    ts: new Date().toISOString(),
    source: "alexa-lab",
    badge: "LIVE",
    kind: "request",
    direction: "client_to_server",
    ...p,
  } as TraceEnvelope;
}

/* ------------------------------------------------------------------ stubs */

const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }),
);

beforeEach(() => {
  capture.length = 0;
  seq = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

/* ------------------------------------------------------------------ tests */

describe("top bar", () => {
  it("renders the MCP spec chip and derived mode badges", async () => {
    render(<AppLazy />);
    // Spec chip is always present.
    expect(screen.getByTestId("spec-chip").textContent).toBe("MCP 2025-11-25");
    // No frames yet -> honest empty state, no fabricated badges.
    expect(screen.getByText("no frames yet")).toBeTruthy();

    // A REAL frame arrives on the wire -> its badge appears, derived not hardcoded.
    setStatus("open");
    emit(frame({ event_id: "e1", badge: "LIVE" }));
    emit(frame({ event_id: "e2", badge: "FIXTURE", kind: "response", direction: "server_to_client" }));
    expect(screen.getByTestId("badge-LIVE")).toBeTruthy();
    expect(screen.getByTestId("badge-FIXTURE")).toBeTruthy();
    // REPLAY was never seen on the wire -> must NOT be rendered.
    expect(screen.queryByTestId("badge-REPLAY")).toBeNull();
  });
});

describe("wire inspector", () => {
  it("renders real frames delivered via the mocked WS message path", () => {
    render(<AppLazy />);
    setStatus("open");

    emit(
      frame({
        event_id: "e10",
        kind: "request",
        direction: "client_to_server",
        mcp: {
          method: "tools/call",
          tool: "music_resolve_request",
          latency_ms: 142,
          sse_event_id: "sse-7",
          frame: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { tool: "music_resolve_request" } },
        },
      }),
    );

    const row = screen.getByTestId("wire-row-1");
    expect(within(row).getByText("tools/call")).toBeTruthy();
    expect(within(row).getByText("music_resolve_request")).toBeTruthy();
    expect(within(row).getByText("142")).toBeTruthy();
    expect(within(row).getByText("sse-7")).toBeTruthy();
    expect(within(row).getByText("LIVE")).toBeTruthy();

    // Click the row -> raw JSON payload expands.
    fireEvent.click(row);
    expect(screen.getByText(/"jsonrpc": "2.0"/)).toBeTruthy();
  });

  it("filters to elicitation frames via the filter chips", () => {
    render(<AppLazy />);
    setStatus("open");
    emit(frame({ event_id: "e1", kind: "request", mcp: { method: "tools/call", tool: "music_resolve_request" } }));
    emit(frame({ event_id: "e2", kind: "elicitation", direction: "server_to_client", mcp: { method: "elicitation/create" } }));

    expect(screen.getByTestId("wire-row-1")).toBeTruthy();
    expect(screen.getByTestId("wire-row-2")).toBeTruthy();

    fireEvent.click(screen.getByTestId("filter-elicitation"));
    expect(screen.queryByTestId("wire-row-1")).toBeNull();
    expect(screen.getByTestId("wire-row-2")).toBeTruthy();
  });
});

describe("MCP on/off switch", () => {
  it("flips state and sends the mcpOn flag to the host on the next turn", async () => {
    render(<AppLazy />);
    const sw = screen.getByTestId("mcp-switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.textContent).toBe("MCP ON");

    fireEvent.click(sw);
    await screen.findByText("MCP OFF");
    expect(screen.getByTestId("mcp-switch").getAttribute("aria-checked")).toBe("false");

    // The toggle POSTs a config turn carrying the flag.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/turn");
    expect(JSON.parse(String(init.body))).toMatchObject({ mcpOn: false });
  });
});

describe("host down", () => {
  it("shows the honest offline banner and never fabricates frames", () => {
    render(<AppLazy />);
    setStatus("offline", "alexa-lab offline — start it on :4000");
    expect(screen.getByRole("alert").textContent).toContain("alexa-lab offline — start it on :4000");
    // Wire inspector stays empty — no synthetic frames.
    expect(screen.getByText(/no frames on the wire yet/)).toBeTruthy();
  });
});

/* Import after vi.mock so the mocked transport is in effect (vi.mock hoists). */
import { App as AppLazy } from "../App";
