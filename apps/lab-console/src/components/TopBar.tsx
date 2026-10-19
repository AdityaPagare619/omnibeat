import type { ConsoleBadge, Surface } from "../types";
import type { TransportStatus } from "../transport";

interface Props {
  badges: ConsoleBadge[];
  mcpOn: boolean;
  onMcpToggle: (next: boolean) => void;
  surface: Surface;
  onSurfaceChange: (s: Surface) => void;
  status: TransportStatus;
  statusDetail: string;
}

const SURFACES: ReadonlyArray<{ id: Surface; label: string }> = [
  { id: "screenless", label: "Dot" },
  { id: "screen", label: "Show" },
  { id: "tv", label: "TV" },
];

export function TopBar(props: Props): JSX.Element {
  const { badges, mcpOn, onMcpToggle, surface, onSurfaceChange, status, statusDetail } = props;
  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <span className="wordmark">OmniBeat</span>
        <span className="chip chip-spec" data-testid="spec-chip">
          MCP 2025-11-25
        </span>
      </div>

      <div className="topbar-badges" aria-label="source modes seen on the wire">
        {badges.length === 0 ? (
          <span className="chip chip-muted">no frames yet</span>
        ) : (
          badges.map((b) => (
            <span key={b} className={`chip chip-badge badge-${b.toLowerCase()}`} data-testid={`badge-${b}`}>
              {b}
            </span>
          ))
        )}
      </div>

      <div className="topbar-right">
        <span
          className={`chip conn-${status}`}
          data-testid="conn-chip"
          title={statusDetail}
        >
          trace {status === "open" ? "connected" : status === "connecting" ? "connecting" : "offline"}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={mcpOn}
          className={`switch ${mcpOn ? "switch-on" : "switch-off"}`}
          onClick={() => onMcpToggle(!mcpOn)}
          data-testid="mcp-switch"
        >
          MCP {mcpOn ? "ON" : "OFF"}
        </button>

        <div className="surface-group" role="radiogroup" aria-label="surface">
          {SURFACES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={surface === s.id}
              className={`surface-btn ${surface === s.id ? "surface-active" : ""}`}
              onClick={() => onSurfaceChange(s.id)}
              data-testid={`surface-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
