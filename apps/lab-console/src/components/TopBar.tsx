import type { TransportStatus } from "../transport";
import { Rise } from "./motion";

interface TopBarProps {
  mcpOn: boolean;
  onMcpToggle: (next: boolean) => void;
  status: TransportStatus;
  statusDetail: string;
  systemOpen: boolean;
  onToggleSystem: () => void;
  breakerState: string;
  mcpState: string;
}

/**
 * Header — brand, wire status, the A/B switch, and the (collapsed) system
 * drawer trigger. Nothing here competes with the conversation: the protocol
 * chips live on the proof strip where the wire is (brief §proof strip).
 */
export function TopBar(props: TopBarProps): JSX.Element {
  const { mcpOn, onMcpToggle, status, statusDetail, systemOpen, onToggleSystem, breakerState, mcpState } = props;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">OmniBeat</span>
        <span className="brand-sub">Alexa+ lab</span>
      </div>

      <div className="topbar-right">
        <span className={`chip chip-conn conn-${status}`} title={statusDetail} data-testid="conn-chip">
          <span className="dot" aria-hidden="true" />
          {status === "open" ? "LIVE WS" : status === "connecting" ? "CONNECTING" : "OFFLINE"}
        </span>

        <span className="chip chip-muted" data-testid="mcp-state-chip" title={`MCP session: ${mcpState}`}>
          MCP {mcpState}
        </span>

        {/* The money switch: one control, two hosts' worth of behaviour. */}
        <button
          type="button"
          role="switch"
          aria-checked={mcpOn}
          className={`switch ${mcpOn ? "switch-on" : "switch-off"}`}
          data-testid="mcp-switch"
          onClick={() => onMcpToggle(!mcpOn)}
        >
          <span className="switch-knob" aria-hidden="true" />
          <span className="switch-text">{mcpOn ? "MCP ON" : "MCP OFF"}</span>
        </button>

        <Rise delayMs={80}>
          <button
            type="button"
            className={`btn btn-quiet system-btn ${systemOpen ? "is-open" : ""}`}
            data-testid="system-toggle"
            aria-expanded={systemOpen}
            onClick={onToggleSystem}
          >
            System
            <span className={`chip chip-mini breaker-${breakerClass(breakerState)}`} data-testid="breaker-chip">
              {breakerState}
            </span>
          </button>
        </Rise>
      </div>
    </header>
  );
}

function breakerClass(state: string): string {
  const s = state.toLowerCase();
  if (s === "closed") return "closed";
  if (s === "open") return "open";
  if (s.startsWith("half")) return "half";
  return "unknown";
}
