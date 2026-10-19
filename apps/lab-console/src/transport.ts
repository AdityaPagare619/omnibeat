/**
 * Trace transport — the ONLY seam between the console and the wire.
 *
 * Everything the wire inspector renders arrives through this class's handlers.
 * Tests mock exactly this module (never the components), so rendering tests
 * prove the real message path end to end (blueprint §2 row 3, §11.2).
 */
import { isTraceEnvelope, type TraceEnvelope } from "./types";

export type TransportStatus = "connecting" | "open" | "offline";

export interface TransportHandlers {
  /** Status transitions; `attempt` is the reconnect attempt counter (0 = first connect). */
  onStatus(status: TransportStatus, detail: string): void;
  /** Only envelopes that pass the runtime gate reach this handler. */
  onEnvelope(envelope: TraceEnvelope, generation: number): void;
  /** Messages that failed the envelope gate — dropped, counted, surfaced honestly. */
  onDropped(raw: string, generation: number): void;
}

const RECONNECT_MS = 3000;

export class TraceTransport {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;
  private attempt = 0;
  /** Bumped on every successful open; dedupe keys are `${generation}:${event_id}` across reconnects. */
  private generation = 0;

  constructor(
    private readonly url: string,
    private readonly handlers: TransportHandlers,
  ) {}

  connect(): void {
    this.closedByUs = false;
    this.handlers.onStatus(
      "connecting",
      this.attempt === 0 ? `connecting to ${this.url}` : `reconnecting to ${this.url} (attempt ${this.attempt})`,
    );
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect("websocket constructor failed");
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.generation += 1;
      this.attempt = 0;
      this.handlers.onStatus("open", `trace stream connected — ${this.url}`);
    };
    ws.onmessage = (ev: MessageEvent) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.handlers.onDropped(raw.slice(0, 500), this.generation);
        return;
      }
      if (isTraceEnvelope(parsed)) {
        this.handlers.onEnvelope(parsed, this.generation);
      } else {
        this.handlers.onDropped(raw.slice(0, 500), this.generation);
      }
    };
    ws.onerror = () => {
      /* onclose always follows; handled there */
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUs) return;
      this.scheduleReconnect("connection closed");
    };
  }

  private scheduleReconnect(detail: string): void {
    this.attempt += 1;
    this.handlers.onStatus(
      "offline",
      `alexa-lab offline — start it on :${portOf(this.url)} (${detail}; retrying)`,
    );
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), RECONNECT_MS);
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ws !== null) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

function portOf(url: string): string {
  try {
    const u = new URL(url);
    return u.port || (u.protocol === "wss:" || u.protocol === "https:" ? "443" : "80");
  } catch {
    return "4000";
  }
}
