/**
 * Rendering tests for lab-console.
 *
 * Two seams are mocked, nothing else:
 *   • src/transport.ts — the WebSocket class, so tests inject frames through
 *     the same onFrames() handler a live ws://localhost:4000/trace message
 *     reaches (never a fabricated client-side frame);
 *   • global fetch — routed to VERBATIM captures of the live host
 *     (src/test/fixtures/*.json: POST /turn, POST /barge-in, GET /state).
 * The components, the derivation layer and the A/B logic all run for real.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Frame } from "../types";
import type { TransportHandlers, TransportStatus } from "../transport";
import askFixture from "./fixtures/turn-ask.json";
import offFixture from "./fixtures/turn-play-off.json";
import bargeFixture from "./fixtures/barge-in.json";
import stateFixture from "./fixtures/state.json";

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

function emit(frames: Frame[]): void {
  act(() => {
    lastHandler().onFrames(frames, "frame");
  });
}

/* --------------------------------------------------------------- fixtures */

function frame(p: Partial<Frame> & { seq: number }): Frame {
  return {
    ts: "2026-10-20T08:00:00.000Z",
    direction: "host→mcp",
    method: "GET /healthz",
    badge: "LIVE",
    ...p,
  } as Frame;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface TurnBody {
  text?: string;
  mcpOn?: boolean;
}

const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/turn")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as TurnBody;
    // OFF + same utterance → the host's naive baseline (1st hit, no question).
    return json(body.mcpOn === false ? offFixture : askFixture);
  }
  if (url.endsWith("/barge-in")) return json(bargeFixture);
  if (url.endsWith("/state")) return json(stateFixture);
  if (url.endsWith("/chaos")) return json({ chaos: { latencyMs: 0, failNext: 0, injections: 1 }, breaker: stateFixture.breaker });
  return json({ ok: true });
});

function turnCalls(): TurnBody[] {
  return fetchMock.mock.calls
    .filter((c) => String((c as unknown as [unknown, RequestInit | undefined])[0]).endsWith("/turn"))
    .map((c) => JSON.parse(String((c as unknown as [unknown, RequestInit])[1]?.body ?? "{}")) as TurnBody);
}

beforeEach(() => {
  capture.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

/* -------------------------------------------------------------- the face */

describe("face from a REAL /turn response", () => {
  it("renders the ASK outcome, meter thresholds and untrusted badge from the captured host body", async () => {
    render(<AppLazy />);

    fireEvent.click(screen.getByTestId("preset-play-raja-ji"));

    const entry = await screen.findByTestId("turn-entry");
    expect(entry).toBeTruthy();
    // "You said" line carries the utterance the host echoed back.
    expect(screen.getByTestId("you-said").textContent).toContain("play raja ji");
    // Decision chip: colour AND text.
    const chip = screen.getByTestId("decision-chip");
    expect(chip.textContent).toContain("ASK");
    expect(chip.className).toContain("tone-warn");
    expect(screen.getByTestId("mode-chip").textContent).toContain("MCP path");
    // Confidence comes from the host body (0.909 → 91%).
    expect(screen.getByTestId("confidence-line").textContent).toContain("91%");
    // Thresholds are parsed from the host's OWN evidence line, not hardcoded.
    const caption = screen.getByTestId("meter-caption").textContent ?? "";
    expect(caption).toContain("p1>=0.85");
    expect(caption).toContain("margin>=0.25");
    // Music card + provenance badge (scoped: shortlist cards carry it too).
    expect(screen.getByTestId("music-title").textContent).toBe("Raja Ji (Insta Mix)");
    const card = screen.getByTestId("music-card");
    expect(within(card).getByTestId("untrusted-badge").textContent).toContain("UNTRUSTED");
    // Spoken bubble renders the string the host actually spoke (30 words = tts.words).
    expect(screen.getByTestId("spoken-bubble").textContent).toContain("Which one?");
  });

  it("renders the ask shortlist as tappable cards", async () => {
    render(<AppLazy />);
    fireEvent.click(screen.getByTestId("preset-play-raja-ji"));

    const list = await screen.findByTestId("ask-cards");
    expect(list).toBeTruthy();
    const cards = screen.getAllByTestId(/^ask-card-/);
    expect(screen.getByTestId("ask-card-0")).toBeTruthy();
    expect(screen.getByTestId("ask-card-2")).toBeTruthy();
    expect(cards.length).toBe(askFixture.candidates.length);
    expect(screen.getByTestId("ask-card-1").textContent).toContain("Deep Chahal");
    expect(screen.getByTestId("ask-card-0").textContent).toContain("Raja Ji (Insta Mix)");
    // Every card is a real <button>, not a div-control.
    expect(screen.getByTestId("ask-card-0").tagName).toBe("BUTTON");
  });

  it("barge-in strikes the cut word the host reported", async () => {
    render(<AppLazy />);
    fireEvent.click(screen.getByTestId("preset-play-raja-ji"));
    const btn = await screen.findByTestId("barge-btn");
    fireEvent.click(btn);

    const note = await screen.findByTestId("barge-note");
    expect(note.textContent).toContain("cut at word 6");
    expect(note.textContent).toContain('host reported “Ji”');
    const cut = screen.getByTestId("spoken-bubble").querySelector("span.cut");
    expect(cut?.textContent?.trim()).toBe("Ji");
  });
});

/* ------------------------------------------------------------ proof strip */

describe("proof strip", () => {
  it("renders frames delivered through the mocked WS message path", async () => {
    render(<AppLazy />);
    expect(screen.getByTestId("proof-strip")).toBeTruthy();
    // Spec chip is always present; badges are derived (empty until frames arrive).
    expect(screen.getByTestId("spec-chip").textContent).toBe("MCP 2025-11-25");
    expect(screen.getByTestId("badge-empty")).toBeTruthy();

    setStatus("open");
    emit([
      frame({
        seq: 10,
        method: "initialize",
        direction: "mcp→host",
        badge: "REPLAY",
        payload: { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-11-25" } },
      }),
      frame({
        seq: 11,
        method: "tools/call",
        tool: "music_resolve_request",
        latencyMs: 142,
        sseEventId: "sse-7",
        badge: "LIVE",
        traceId: "trn-live-1",
        payload: { jsonrpc: "2.0", id: 2, method: "tools/call" },
      }),
    ]);

    const row = screen.getByTestId("wire-row-11");
    expect(row.textContent).toContain("tools/call");
    expect(row.textContent).toContain("music_resolve_request");
    expect(row.textContent).toContain("142 ms");
    expect(row.textContent).toContain("LIVE");
    expect(screen.getByTestId("wire-row-10").textContent).toContain("REPLAY");
    // Badges are derived from what the wire carried — FIXTURE was never seen.
    expect(screen.getByTestId("badge-LIVE")).toBeTruthy();
    expect(screen.getByTestId("badge-REPLAY")).toBeTruthy();
    expect(screen.queryByTestId("badge-FIXTURE")).toBeNull();
    expect(screen.getByTestId("frame-count").textContent).toContain("2 frames");

    // Click a row → the frame exactly as the wire carried it.
    fireEvent.click(row);
    expect(screen.getByTestId("proof-json").textContent).toContain('"jsonrpc": "2.0"');
    expect(screen.getByTestId("proof-json").textContent).toContain("music_resolve_request");
  });
});

/* ------------------------------------------------------------- A/B switch */

describe("MCP ON/OFF switch", () => {
  it("flips state, sends mcpOn:false on the next turn and shows the naive contrast", async () => {
    render(<AppLazy />);
    const sw = screen.getByTestId("mcp-switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(sw.textContent).toContain("MCP ON");

    // Side ON: the host asks.
    fireEvent.click(screen.getByTestId("preset-play-raja-ji"));
    await screen.findByTestId("turn-entry");
    expect(screen.getByTestId("decision-chip").textContent).toContain("ASK");

    // Flip the switch — no synthetic request, the flag rides on the next turn.
    fireEvent.click(screen.getByTestId("mcp-switch"));
    expect(screen.getByTestId("mcp-switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("mcp-switch").textContent).toContain("MCP OFF");

    fireEvent.click(screen.getByTestId("preset-play-raja-ji"));
    await waitFor(() => expect(screen.getByTestId("ab-compare")).toBeTruthy());

    // Both POST /turn bodies carry the flag for their own side.
    const bodies = turnCalls();
    expect(bodies.length).toBe(2);
    expect(bodies[0]?.mcpOn).toBe(true);
    expect(bodies[1]?.mcpOn).toBe(false);

    // The money moment: same utterance, two paths, one screen.
    expect(screen.getByTestId("ab-decision-mcp").textContent).toContain("ASK");
    expect(screen.getByTestId("ab-decision-naive").textContent).toContain("PLAY");
    expect(screen.getByTestId("ab-naive").textContent).toContain("stock path");
    expect(screen.getByTestId("ab-mcp").textContent).toContain("resolved through the MCP tool");
    expect(screen.getByTestId("ab-compare").textContent).toContain("asked nothing");
  });
});

/* ----------------------------------------------------------- system drawer */

describe("system drawer", () => {
  it("opens off the main face with real GET /state values", async () => {
    render(<AppLazy />);
    expect(screen.queryByTestId("drawer-close")).toBeNull();

    fireEvent.click(screen.getByTestId("system-toggle"));
    const close = await screen.findByTestId("drawer-close");
    expect(close).toBeTruthy();
    expect(screen.getByTestId("drawer-breaker").textContent).toBe(stateFixture.breaker.state);
    expect(screen.getByTestId("chaos-state").textContent).toContain("injections");
    // Surface profile lives here, not on the main face.
    expect(screen.getByTestId("surface-screen").getAttribute("aria-checked")).toBe("true");
  });
});

/* -------------------------------------------------------------- host down */

describe("host down", () => {
  it("shows the honest offline banner and never fabricates frames", () => {
    render(<AppLazy />);
    setStatus("offline", "alexa-lab offline — start it on :4000");
    expect(screen.getByRole("alert").textContent).toContain("alexa-lab offline — start it on :4000");
    // Proof strip stays empty — no synthetic frames.
    expect(screen.getByTestId("proof-empty").textContent).toContain("no frames on the wire yet");
  });
});

/* Import after vi.mock so the mocked transport is in effect (vi.mock hoists). */
import { App as AppLazy } from "../App";
