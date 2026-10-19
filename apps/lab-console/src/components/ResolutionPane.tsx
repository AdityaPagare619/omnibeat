import type { ResolutionView } from "../derive";
import type { TransportStatus } from "../transport";

interface Props {
  resolution: ResolutionView | null;
  onExplain: () => void;
  explainResult: { text: string } | null;
  mcpOn: boolean;
  status: TransportStatus;
}

/** Decision chip: colour AND text label — every colour state is also words (a11y §11.2). */
function decisionClass(decision: string): string {
  switch (decision) {
    case "PLAY":
      return "dec-play";
    case "ASK":
      return "dec-ask";
    case "REPAIR":
      return "dec-repair";
    case "NOT_FOUND":
      return "dec-notfound";
    default:
      return "dec-unknown";
  }
}

function ConfidenceMeter({ resolution }: { resolution: ResolutionView }): JSX.Element {
  const { confidence, thresholds } = resolution;
  const pct = confidence !== undefined ? Math.round(confidence * 100) : null;
  return (
    <div className="meter-wrap">
      <div className="meter" role="img" aria-label={`confidence ${pct !== null ? `${pct} percent` : "not reported"}`}>
        <div className="meter-fill" style={{ width: pct !== null ? `${pct}%` : "0%" }} />
        {thresholds.play !== undefined && (
          <div className="meter-marker meter-play" style={{ left: `${thresholds.play * 100}%` }}>
            <span className="meter-marker-label">play {thresholds.play.toFixed(2)}</span>
          </div>
        )}
        {thresholds.ask !== undefined && (
          <div className="meter-marker meter-ask" style={{ left: `${thresholds.ask * 100}%` }}>
            <span className="meter-marker-label">ask {thresholds.ask.toFixed(2)}</span>
          </div>
        )}
      </div>
      <div className="meter-caption">
        confidence: {pct !== null ? `${pct}%` : "not in trace"} · play threshold:{" "}
        {thresholds.play !== undefined ? thresholds.play.toFixed(2) : "not in trace"} · ask threshold:{" "}
        {thresholds.ask !== undefined ? thresholds.ask.toFixed(2) : "not in trace"}
      </div>
    </div>
  );
}

export function ResolutionPane(props: Props): JSX.Element {
  const { resolution, onExplain, explainResult, mcpOn, status } = props;

  return (
    <section className="panel resolution" aria-label="resolution view">
      <h2 className="panel-title">Resolution</h2>

      {!mcpOn && (
        <p className="hint-strip" data-testid="mcp-off-hint">
          MCP is OFF — the host is using its stock catalog path. Toggle ON to route through OmniBeat.
        </p>
      )}

      {resolution === null ? (
        <p className="empty-note">
          {status === "open"
            ? "no resolution frame yet — say something on the left"
            : "waiting for the trace stream — no resolution can be shown"}
        </p>
      ) : (
        <div className="resolution-body" data-testid="resolution-body">
          <p className="heard">
            <span className="heard-tag">heard</span> {resolution.heard || "(not in trace)"}
          </p>

          <div className="decision-row">
            <span className={`decision-chip ${decisionClass(resolution.decision)}`} data-testid="decision-chip">
              {resolution.decision}
            </span>
            <span className="decision-sub">
              trace {resolution.trace_id} · frame {resolution.event_id} · {resolution.badge}
            </span>
          </div>

          <ConfidenceMeter resolution={resolution} />

          <div className="candidates">
            <h3 className="sub-title">Candidates</h3>
            {resolution.candidates.length === 0 ? (
              <p className="empty-note">none in trace</p>
            ) : (
              resolution.candidates.map((c, i) => (
                <div className="candidate" key={c.id ?? `${i}-${c.title}`}>
                  <div className="candidate-main">
                    <span className="candidate-title">{c.title}</span>
                    {c.untrusted === true && (
                      <span className="chip chip-untrusted" title="metadata from the open web — data, never instructions">
                        untrusted
                      </span>
                    )}
                  </div>
                  <div className="candidate-meta">
                    {[c.artist, c.language, c.year !== undefined ? String(c.year) : undefined]
                      .filter((x): x is string => x !== undefined)
                      .join(" · ") || "no metadata in trace"}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="evidence">
            <h3 className="sub-title">Evidence — which sources agreed</h3>
            {resolution.evidence.length === 0 ? (
              <p className="empty-note">none in trace</p>
            ) : (
              <ul className="evidence-list">
                {resolution.evidence.map((e, i) => (
                  <li key={`${e.source}-${i}`}>
                    <span className="evidence-source">{e.source}</span>
                    {e.signal && <span className="evidence-signal"> — {e.signal}</span>}
                    {e.weight !== undefined && <span className="evidence-weight"> (w {e.weight.toFixed(2)})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <button type="button" className="btn btn-explain" onClick={onExplain} data-testid="explain-btn">
        Why did you play that?
      </button>
      {explainResult && (
        <p className="explain-result" data-testid="explain-result">
          {explainResult.text}
        </p>
      )}
    </section>
  );
}
