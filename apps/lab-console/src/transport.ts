/**
 * Trace transport — the ONLY seam between the console and the wire.
 *
 * Live envelope (trace-bus.ts `send`): `{type:"replay", frames[], replayLimit}`
 * on connect (last 200 frames), then `{type:"frame", frame}` per emission.
 * Everything the proof strip renders arrives through this class's handlers —
 * tests mock exactly this module (never the components), so rendering tests
 * exercise the real message path end to end.
 *
 * Non-conforming messages are dropped and counted (`onDropped`), never
 * rendered as if they were frames.
 */
import { isTraceMessage, type Frame, type TraceMessage } from "./types";

export type TransportStatus = "connecting" | "open" | "offline";

export interface TransportHandlers {
  /** Status transitions; `attempt` is the reconnect attempt counter (0 = first connect). */
  onStatus(status: TransportStatus, detail: string): void;
  /** Frames that pass the runtime gate, in wire order (replay frames first). */
  onFrames(frames: Frame[], kind: "replay" | "frame"): void;
  /** Messages that failed the gate — dropped, counted, surfaced honestly. */
  onDropped(raw: string): void;
}

const RECONNECT_MS = 3000;

export class TraceTransport {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUs = false;
  private attempt = 0;

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
      this.attempt = 0;
      // A reconnect without a page reload must resync: ask for the head again.
      try {
        ws.send(JSON.stringify({ type: "hello" }));
      } catch {
        /* the replay on connect already covers this */
      }
      this.handlers.onStatus("open", `trace stream connected — ${this.url}`);
    };
    ws.onmessage = (ev: MessageEvent) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.handlers.onDropped(raw.slice(0, 500));
        return;
      }
      if (!isTraceMessage(parsed)) {
        this.handlers.onDropped(raw.slice(0, 500));
        return;
      }
      const msg: TraceMessage = parsed;
      if (msg.type === "replay") this.handlers.onFrames(msg.frames, "replay");
      else this.handlers.onFrames([msg.frame], "frame");
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
      this.ws.onerror = null;
      this.ws.onmessage = null;
      // Closing a still-CONNECTING socket triggers a spurious browser console
      // warning ("WebSocket closed before established") under React StrictMode
      // double-mount. Detach handlers and let the in-flight handshake settle.
      if (this.ws.readyState !== WebSocket.CONNECTING) {
        this.ws.close();
      }
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
