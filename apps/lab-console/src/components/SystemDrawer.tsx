/**
 * SystemDrawer — everything a judge does NOT need on first look:
 * breaker state, chaos injection, degradation level, surface profile,
 * MCP session identity. Collapsed behind the top-right "System" toggle
 * (brief §move OFF main face).
 */
import { useEffect, useRef } from "react";
import type { StateResponse, Surface, TurnResponse } from "../types";
import { Rise } from "./motion";

interface SystemDrawerProps {
  open: boolean;
  onClose: () => void;
  state: StateResponse | null;
  lastTurn: TurnResponse | null;
  surface: Surface;
  onSurfaceChange: (s: Surface) => void;
  onRefresh: () => void;
  onChaos: (payload: { latencyMs?: number; failNext?: number; clear?: boolean }, label: string) => void;
  chaosLog: string[];
  frameCount: number;
}

const SURFACES: Surface[] = ["screenless", "screen", "tv"];
const DEGRADATION: Record<string, string> = {
  L0: "L0 — full pipeline, no source cut",
  L1: "L1 — a source was skipped or hedged",
  L2: "L2 — degraded answer path",
};

export function SystemDrawer(props: SystemDrawerProps): JSX.Element | null {
  const { open, onClose, state, lastTurn, surface, onSurfaceChange, onRefresh, onChaos, chaosLog, frameCount } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const btn = panelRef.current?.querySelector<HTMLElement>("button");
    btn?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const breaker = state?.breaker;
  const mcp = state?.mcp;
  const chaos = state?.chaos;
  const degradation = lastTurn?.degradationLevel;

  return (
    <div className="drawer-layer">
      <button
        type="button"
        className="drawer-scrim"
        aria-label="Close system panel"
        data-testid="drawer-scrim"
        onClick={onClose}
      />
      <Rise as="div" className="drawer" role="dialog" aria-modal="true" aria-label="System">
        <div className="drawer-head">
          <h2 className="drawer-title">System</h2>
          <button type="button" className="btn btn-quiet" data-testid="drawer-close" onClick={onClose}>
            close
          </button>
        </div>

        <section className="drawer-block">
          <h3 className="sub-title">MCP session</h3>
          <p className="drawer-line">
            state <strong>{mcp?.state ?? "not reported"}</strong>
            {mcp?.serverInfo?.name ? ` · ${mcp.serverInfo.name} ${mcp.serverInfo.version ?? ""}` : ""}
          </p>
          <p className="drawer-line mono small">{mcp?.sessionId ?? "no session id reported"}</p>
          <p className="drawer-line mono small">{mcp?.url ?? "no url reported"}</p>
        </section>

        <section className="drawer-block">
          <h3 className="sub-title">Circuit breaker</h3>
          <p className="drawer-line">
            <span className={`state-pill breaker-${breakerClass(breaker?.state)}`} data-testid="drawer-breaker">
              {breaker?.state ?? "unknown"}
            </span>
            {breaker?.consecutiveFails !== undefined ? ` · ${breaker.consecutiveFails} consecutive fails` : ""}
            {breaker?.slowInWindow !== undefined ? ` · ${breaker.slowInWindow} slow in window` : ""}
          </p>
          {breaker?.lastTransitionReason ? (
            <p className="drawer-line small">last transition: {breaker.lastTransitionReason}</p>
          ) : null}
          <p className="drawer-line small">
            edge mode (client L3 rung): <strong>{lastTurn?.edgeMode ?? breaker?.edgeMode ? "on" : "off"}</strong>
          </p>
          <p className="drawer-line small">
            recent RTT ms:{" "}
            <span className="mono">{breaker?.recentRttMs && breaker.recentRttMs.length > 0 ? breaker.recentRttMs.join(", ") : "—"}</span>
          </p>
        </section>

        <section className="drawer-block">
          <h3 className="sub-title">Degradation</h3>
          <p className="drawer-line" data-testid="degradation">
            {degradation ? (DEGRADATION[degradation] ?? degradation) : "not reported on the last turn"}
          </p>
        </section>

        <section className="drawer-block">
          <h3 className="sub-title">Surface profile</h3>
          <div className="seg" role="radiogroup" aria-label="Decision profile surface">
            {SURFACES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={surface === s}
                className={`seg-btn ${surface === s ? "is-active" : ""}`}
                data-testid={`surface-${s}`}
                onClick={() => onSurfaceChange(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="drawer-line small">thresholds come from the host config for this profile (see the meter caption)</p>
        </section>

        <section className="drawer-block">
          <h3 className="sub-title">Chaos inject</h3>
          <p className="drawer-line small" data-testid="chaos-state">
            latency {chaos?.latencyMs ?? "?"} ms · failNext {chaos?.failNext ?? "?"} · injections {chaos?.injections ?? "?"}
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-quiet" data-testid="chaos-latency" onClick={() => onChaos({ latencyMs: 900 }, "+900 ms latency")}>
              +900 ms latency
            </button>
            <button type="button" className="btn btn-quiet" data-testid="chaos-fail" onClick={() => onChaos({ failNext: 1 }, "fail next call")}>
              fail next call
            </button>
            <button type="button" className="btn btn-quiet" data-testid="chaos-clear" onClick={() => onChaos({ clear: true }, "clear chaos")}>
              clear
            </button>
            <button type="button" className="btn btn-quiet" data-testid="state-refresh" onClick={onRefresh}>
              refresh state
            </button>
          </div>
          {chaosLog.length > 0 ? (
            <ul className="chaos-log" data-testid="chaos-log">
              {chaosLog.map((line, i) => (
                <li key={`${i}-${line.slice(0, 12)}`}>{line}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <p className="drawer-foot small">
          trace bus: {frameCount} frames · GET /state, GET /healthz, POST /chaos are real calls
        </p>
      </Rise>
    </div>
  );
}

function breakerClass(state: string | undefined): string {
  const s = (state ?? "").toLowerCase();
  if (s === "closed") return "closed";
  if (s === "open") return "open";
  if (s.startsWith("half")) return "half";
  return "unknown";
}
