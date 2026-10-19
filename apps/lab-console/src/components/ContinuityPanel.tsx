import type { ContinuityView } from "../derive";

interface Props {
  continuity: ContinuityView;
  onChaos: (payload: { latencyMs?: number; failNext?: number }, label: string) => void;
  chaosLog: string[];
}

/** Breaker state: colour AND text label together (a11y §11.2). */
function breakerClass(state: ContinuityView["breaker"]): string {
  switch (state) {
    case "closed":
      return "breaker-closed";
    case "open":
      return "breaker-open";
    case "half-open":
      return "breaker-half";
    default:
      return "breaker-unknown";
  }
}

export function ContinuityPanel(props: Props): JSX.Element {
  const { continuity, onChaos, chaosLog } = props;

  return (
    <section className="panel continuity" aria-label="continuity panel">
      <h2 className="panel-title">Continuity</h2>

      <div className="breaker-block">
        <span className="sub-title">circuit breaker</span>
        <span className={`breaker-state ${breakerClass(continuity.breaker)}`} data-testid="breaker-state">
          {continuity.breaker.toUpperCase()}
        </span>
        <span className="breaker-sub">
          {continuity.breakerRaw !== undefined
            ? `from trace frame ${continuity.breakerEventId ?? "?"} ("${continuity.breakerRaw}")`
            : "no health frame in trace yet"}
        </span>
      </div>

      <div className="edge-block">
        <span className="sub-title">edge mode</span>
        <span
          className={`chip ${continuity.edgeMode === true ? "chip-edge" : "chip-muted"}`}
          data-testid="edge-badge"
        >
          {continuity.edgeMode === true ? "EDGE MODE — cached music only" : "edge mode: off"}
        </span>
      </div>

      <div className="chaos-block">
        <span className="sub-title">chaos inject</span>
        <div className="chaos-btns">
          <button
            type="button"
            className="btn"
            onClick={() => onChaos({ latencyMs: 1500 }, "latencyMs=1500")}
            data-testid="chaos-latency"
          >
            +1500 ms latency
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onChaos({ failNext: 2 }, "failNext=2")}
            data-testid="chaos-fail"
          >
            fail next 2
          </button>
        </div>
        <ul className="chaos-log" aria-live="polite">
          {chaosLog.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
          {chaosLog.length === 0 && <li className="empty-note">no faults injected this session</li>}
        </ul>
      </div>
    </section>
  );
}
