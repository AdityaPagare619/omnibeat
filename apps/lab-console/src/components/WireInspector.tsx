import { Fragment, useState } from "react";
import { formatTs } from "../derive";
import type { TraceEnvelope, TraceEventKind } from "../types";

export interface FrameRow {
  seq: number;
  envelope: TraceEnvelope;
}

interface Props {
  rows: FrameRow[];
  dropped: number;
  host: string;
}

type FilterId = "all" | "requests" | "notifications" | "elicitation" | "cancellation";

const FILTERS: ReadonlyArray<{ id: FilterId; label: string }> = [
  { id: "all", label: "all" },
  { id: "requests", label: "requests" },
  { id: "notifications", label: "notifications" },
  { id: "elicitation", label: "elicitation" },
  { id: "cancellation", label: "cancellation" },
];

const REQUEST_KINDS: readonly TraceEventKind[] = ["request", "response"];
const NOTIFICATION_KINDS: readonly TraceEventKind[] = ["notification", "progress", "session", "error"];

function matchesFilter(kind: TraceEventKind, filter: FilterId): boolean {
  switch (filter) {
    case "all":
      return true;
    case "requests":
      return REQUEST_KINDS.includes(kind);
    case "notifications":
      return NOTIFICATION_KINDS.includes(kind);
    case "elicitation":
      return kind === "elicitation";
    case "cancellation":
      return kind === "cancellation";
  }
}

function directionLabel(d: TraceEnvelope["direction"]): string {
  return d === "client_to_server" ? "C→S" : "S→C";
}

export function WireInspector(props: Props): JSX.Element {
  const { rows, dropped, host } = props;
  const [filter, setFilter] = useState<FilterId>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const visible = rows.filter((r) => matchesFilter(r.envelope.kind, filter));

  return (
    <section className="wire" aria-label="wire inspector">
      <div className="wire-head">
        <h2 className="panel-title">Wire inspector — real MCP frames from {host}</h2>
        <div className="wire-filters" role="group" aria-label="frame filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip filter-chip ${filter === f.id ? "filter-active" : ""}`}
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setExpanded(null);
              }}
              data-testid={`filter-${f.id}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="wire-count" data-testid="wire-count">
          {visible.length}/{rows.length} frames{dropped > 0 ? ` · ${dropped} malformed dropped` : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="empty-note wire-empty">no frames on the wire yet — the inspector only shows real traffic</p>
      ) : (
        <div className="wire-scroll">
          <table className="wire-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">time</th>
                <th scope="col">dir</th>
                <th scope="col">method</th>
                <th scope="col">tool</th>
                <th scope="col">lat ms</th>
                <th scope="col">sse id</th>
                <th scope="col">badge</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const e = r.envelope;
                const isOpen = expanded === r.seq;
                return (
                  <Fragment key={r.seq}>
                    <tr
                      className={`wire-row ${isOpen ? "wire-row-open" : ""}`}
                      onClick={() => setExpanded(isOpen ? null : r.seq)}
                      data-testid={`wire-row-${r.seq}`}
                    >
                      <td>
                        <button
                          type="button"
                          className="row-expand"
                          aria-expanded={isOpen}
                          aria-label={`raw payload for frame ${r.seq} ${e.mcp?.method ?? e.kind}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setExpanded(isOpen ? null : r.seq);
                          }}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>{" "}
                        {r.seq}
                      </td>
                      <td className="mono">{formatTs(e.ts)}</td>
                      <td title={e.direction}>{directionLabel(e.direction)}</td>
                      <td className="mono">{e.mcp?.method ?? `(${e.kind})`}</td>
                      <td className="mono">{e.mcp?.tool ?? "—"}</td>
                      <td className="mono num">{e.mcp?.latency_ms !== undefined ? e.mcp.latency_ms : "—"}</td>
                      <td className="mono">{e.mcp?.sse_event_id ?? "—"}</td>
                      <td>
                        <span className={`chip chip-badge badge-${e.badge.toLowerCase()}`}>{e.badge}</span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="wire-detail">
                        <td colSpan={8}>
                          <div className="wire-detail-meta mono">
                            event_id={e.event_id} · trace_id={e.trace_id}
                            {e.span_id !== undefined ? ` · span_id=${e.span_id}` : ""}
                            {e.mcp?.session_id !== undefined ? ` · session=${e.mcp.session_id}` : ""}
                            {e.mcp?.protocol_version !== undefined ? ` · protocol=${e.mcp.protocol_version}` : ""}
                            {e.mcp?.elicitation_id !== undefined ? ` · elicitation=${e.mcp.elicitation_id}` : ""}
                          </div>
                          <pre className="wire-json mono">
                            {JSON.stringify(e.mcp?.frame ?? e, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
