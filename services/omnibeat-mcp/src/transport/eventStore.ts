/**
 * In-memory SSE EventStore for resumability (blueprint 5.1 "SSE events carry
 * ids; on reconnect the client sends Last-Event-ID and the server replays from
 * its event store"; evidence CLM-SPEC-011: resumability is disabled unless an
 * EventStore is supplied to the SDK transport).
 *
 * This is OUR implementation of the SDK's `EventStore` interface (the SDK's own
 * example store is example-only; this one is written for OmniBeat):
 *  - event id = `<streamId>#<seq>` (opaque to clients, parsed by us)
 *  - bounded ring buffer per stream (default 512 events) - memory cannot grow
 *    without bound on a long-lived SSE connection
 *  - `getStreamIdForEventId` implemented so a malformed/unknown-format id is
 *    rejected with 400 by the transport instead of silently resuming
 *
 * Persistence across process restarts is deliberately NOT claimed: replay
 * after a restart returns only what the live buffer still holds; clients fall
 * back to a fresh request. (Honest scope: P1 is a single-process lab server.)
 */
import type { EventStore, StreamId, EventId } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

interface StoredEvent {
  seq: number;
  message: JSONRPCMessage;
}

const DEFAULT_MAX_EVENTS_PER_STREAM = 512;

export class MemorySseEventStore implements EventStore {
  private readonly streams = new Map<StreamId, StoredEvent[]>();
  private readonly maxEventsPerStream: number;
  private readonly separator: string;

  constructor(maxEventsPerStream = DEFAULT_MAX_EVENTS_PER_STREAM) {
    this.maxEventsPerStream = maxEventsPerStream;
    this.separator = "#";
  }

  private encode(streamId: StreamId, seq: number): EventId {
    return `${streamId}${this.separator}${seq}`;
  }

  /**
   * Parse an event id we issued. Returns undefined when the id is not in our
   * format (the transport turns that into 400 Invalid event ID format).
   * streamId may itself contain '#', so split on the LAST separator.
   */
  private decode(eventId: EventId): { streamId: StreamId; seq: number } | undefined {
    const idx = eventId.lastIndexOf(this.separator);
    if (idx <= 0) return undefined;
    const seq = Number(eventId.slice(idx + 1));
    if (!Number.isInteger(seq) || seq < 0) return undefined;
    return { streamId: eventId.slice(0, idx), seq };
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    let buffer = this.streams.get(streamId);
    if (!buffer) {
      buffer = [];
      this.streams.set(streamId, buffer);
    }
    const last = buffer.length > 0 ? buffer[buffer.length - 1] : undefined;
    const seq = (last?.seq ?? 0) + 1;
    buffer.push({ seq, message });
    if (buffer.length > this.maxEventsPerStream) {
      buffer.splice(0, buffer.length - this.maxEventsPerStream);
    }
    return this.encode(streamId, seq);
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.decode(eventId)?.streamId;
  }

  /**
   * Replay every event recorded AFTER `lastEventId` on its stream, in order.
   * If the id predates the retained window we replay the whole retained buffer
   * (best effort - the client dedupes on the event id); the client keeps its
   * cursor, which is what a bounded in-memory store can honestly promise.
   */
  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const parsed = this.decode(lastEventId);
    if (!parsed) {
      throw new Error("Invalid event ID format");
    }
    const { streamId, seq } = parsed;
    const buffer = this.streams.get(streamId);
    if (!buffer) {
      // Stream unknown (e.g. after restart): nothing to replay, resume fresh.
      return streamId;
    }
    const oldest = buffer[0]?.seq ?? 0;
    const from = seq < oldest ? oldest : seq;
    for (const event of buffer) {
      if (event.seq > from) {
        await send(this.encode(streamId, event.seq), event.message);
      }
    }
    return streamId;
  }

  /** Drop a stream's buffer (session end). */
  dropStream(streamId: StreamId): void {
    this.streams.delete(streamId);
  }

  streamCount(): number {
    return this.streams.size;
  }
}
