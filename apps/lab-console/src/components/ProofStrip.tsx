/**
 * ProofStrip — the bottom translucent bar that proves real MCP in ~2s.
 *
 * Raw JSON-RPC frames from ws://…/trace: method, tool, latency, source badge.
 * Rows that arrive live flash green once (transition, no keyframes), a click
 * opens the frame exactly as the wire carried it, and the header chips are
 * derived from the frames themselves — never hardcoded.
 */
import { useEffect, useState } from "react";
import { formatClock, frameLatency, isWireCall } from "../derive";
import type { FrameRow } from "../derive";
import type { SourceBadge } from "../types";
import type { TransportStatus } from "../transport";
import { Rise } from "./motion";

interface ProofStripProps {
  rows: FrameRow[];
  /** Seq numbers that arrived live (not from the 200-frame replay window). */
  liveSeqs: ReadonlySet<number>;
  dropped: number;
  status: TransportStatus;
  statusDetail: string;
}

const COMPACT = 6;

export function ProofStrip(props: ProofStripProps): JSX.Element {
  const { rows, liveSeqs, dropped, status, statusDetail } = props;
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const badges = badgesOf(rows);
  const shown = expanded ? [...rows].reverse() : [...rows].slice(-COMPACT).reverse();
  const selectedRow = selected === null ? null : (rows.find((r) => r.key === selected) ?? null);

  return (
    <footer className="proof" data-testid="proof-strip">
      <div className="proof-top">
        <span className="chip chip-spec" data-testid="spec-chip">
          MCP 2025-11-25
        </span>
        <div className="badge-row" aria-label="source badges seen on the wire">
          {badges.length === 0 ? (
            <span className="chip chip-muted" data-testid="badge-empty">
              no frames yet
            </span>
          ) : (
            badges.map((b) => (
              <span key={b} className={`chip chip-badge badge-${b.toLowerCase()}`} data-testid={`badge-${b}`}>
                {b}
              </span>
            ))
          )}
        </div>
        <span className="proof-count" data-testid="frame-count">
          {rows.length} frame{rows.length === 1 ? "" : "s"}
          {dropped > 0 ? ` · ${dropped} dropped (gate)` : ""}
        </span>
        <span className={`chip chip-conn conn-${status}`} title={statusDetail} data-testid="proof-conn">
          <span className="dot" aria-hidden="true" />
          {status === "open" ? "trace WS live" : status === "connecting" ? "connecting" : "offline"}
        </span>
        {rows.length > COMPACT ? (
          <button
            type="button"
            className="btn btn-quiet proof-toggle"
            aria-expanded={expanded}
            data-testid="proof-toggle"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "collapse" : "show all"}
          </button>
        ) : null}
      </div>

      <div className="proof-rows" role="log" aria-label="live trace frames">
        {rows.length === 0 ? (
          <p className="proof-empty" data-testid="proof-empty">
            no frames on the wire yet — the host replays its last 200 the moment the socket connects
          </p>
        ) : (
          shown.map((row) => (
            <ProofRow
              key={row.key}
              row={row}
              live={liveSeqs.has(row.key)}
              open={selected === row.key}
              onToggle={() => setSelected((cur) => (cur === row.key ? null : row.key))}
            />
          ))
        )}
      </div>

      {selectedRow ? (
        <Rise className="proof-json-wrap" data-testid="proof-json">
          <div className="proof-json-head">
            <span>
              frame seq {selectedRow.key} · {formatClock(selectedRow.frame.ts)}
            </span>
            <button
              type="button"
              className="btn btn-quiet"
              data-testid="proof-json-close"
              onClick={() => setSelected(null)}
            >
              close
            </button>
          </div>
          <pre className="proof-json">{JSON.stringify(selectedRow.frame, null, 2)}</pre>
        </Rise>
      ) : null}
    </footer>
  );
}

function ProofRow({
  row,
  live,
  open,
  onToggle,
}: {
  row: FrameRow;
  live: boolean;
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  // One-shot green flash for frames that arrived after we connected.
  const [flash, setFlash] = useState(live);
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [live]);

  const f = row.frame;
  return (
    <Rise className={`proof-row-wrap ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className={`proof-row ${flash ? "is-new" : ""}`}
        data-testid={`wire-row-${row.key}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="proof-flash" aria-hidden="true" />
        <span className="proof-seq mono">#{f.seq}</span>
        <span className="proof-time mono">{formatClock(f.ts)}</span>
        <span className={`proof-dir dir-${f.direction.replace(/[^a-z]/g, "")}`}>{f.direction}</span>
        <span className="proof-method mono">{f.method}</span>
        <span className="proof-tool mono">{f.tool ?? "—"}</span>
        <span className="proof-lat mono">{frameLatency(f)}</span>
        <span className={`chip chip-mini badge-${f.badge.toLowerCase()}`}>{f.badge}</span>
        {!isWireCall(f) ? <span className="chip chip-muted chip-mini">internal</span> : null}
      </button>
    </Rise>
  );
}

function badgesOf(rows: readonly FrameRow[]): SourceBadge[] {
  const seen: SourceBadge[] = [];
  for (const r of rows) if (!seen.includes(r.frame.badge)) seen.push(r.frame.badge);
  return seen;
}
