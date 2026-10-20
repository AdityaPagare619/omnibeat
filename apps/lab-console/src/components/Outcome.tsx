/**
 * Outcome — the judge-facing result of one turn.
 *
 * Everything rendered here comes from a real POST /turn response
 * (src/test/fixtures/*.json are verbatim captures of that endpoint): decision
 * chip, CALM confidence meter with the HOST's own thresholds, music card,
 * ask shortlist, spoken bubble with barge-in cut, and the A/B contrast.
 */
import { useEffect, useState } from "react";
import type { BargeInResponse, MusicCandidate, TurnResponse } from "../types";
import {
  cutWordIndex,
  decisionView,
  fixed,
  pct,
  primaryCandidate,
  spokenText,
  thresholdsFromEvidence,
  type AbSummary,
  type DecisionTone,
} from "../derive";
import { Rise, nextFrame } from "./motion";

/* --------------------------------------------------------- decision chip */

export function DecisionChip({ tone, label, testId }: { tone: DecisionTone; label: string; testId?: string }): JSX.Element {
  // Colour is never the only signal: the label is always rendered as text.
  return (
    <span className={`decision-chip tone-${tone}`} data-testid={testId ?? "decision-chip"}>
      <span className="decision-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/* ---------------------------------------------------- confidence meter */

function ConfidenceMeter({ turn }: { turn: TurnResponse }): JSX.Element {
  const th = thresholdsFromEvidence(turn);
  const [entered, setEntered] = useState(false);

  useEffect(() => nextFrame(() => setEntered(true)), [turn.traceId]);

  const conf = Math.max(0, Math.min(1, turn.confidence));
  const marks: { key: string; at: number; label: string }[] = [];
  if (th.tPlay !== undefined) marks.push({ key: "tPlay", at: th.tPlay, label: `play ≥ ${pct(th.tPlay)}` });
  if (th.tCover !== undefined) marks.push({ key: "tCover", at: th.tCover, label: `ask ≥ ${pct(th.tCover)}` });

  const aria =
    th.tPlay !== undefined
      ? `confidence ${pct(conf)}; auto-play threshold ${pct(th.tPlay)}; margin threshold ${th.margin !== undefined ? fixed(th.margin, 2) : "not reported"}`
      : `confidence ${pct(conf)}; ${th.note ?? "no thresholds reported"}`;

  return (
    <div className="meter-wrap">
      <div className="meter" role="img" aria-label={aria} data-testid="confidence-meter">
        <div
          className={`meter-fill tone-${decisionView(turn).tone} ${entered ? "is-in" : ""}`}
          style={{ ["--v" as string]: String(conf) }}
        />
        {marks.map((m) => (
          <div key={m.key} className="meter-mark" style={{ left: `${m.at * 100}%` }}>
            <span className="meter-mark-label">{m.label}</span>
          </div>
        ))}
        <div className="meter-value" style={{ left: `${conf * 100}%` }}>
          {pct(conf)}
        </div>
      </div>
      <p className="meter-caption" data-testid="meter-caption">
        {th.policy ?? th.note ?? "no decision policy reported for this turn"}
        {th.gotMargin !== undefined ? ` · margin ${fixed(th.gotMargin)}` : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ music card */

function AlbumArt({ candidate, size }: { candidate: MusicCandidate; size: "lg" | "sm" }): JSX.Element {
  const [failed, setFailed] = useState(false);
  const title = candidate.title ?? "—";
  const initials = title
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className={`art art-${size}`} data-testid="album-art">
      {candidate.artwork_url && !failed ? (
        <img
          src={candidate.artwork_url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="art-fallback" aria-hidden="true">
          {initials || "♪"}
        </span>
      )}
    </div>
  );
}

function TagRow({ candidate }: { candidate: MusicCandidate }): JSX.Element {
  const tags: { key: string; text: string }[] = [];
  if (candidate.language) tags.push({ key: "lang", text: candidate.language });
  if (candidate.year !== undefined) tags.push({ key: "year", text: String(candidate.year) });
  if (candidate.version && candidate.version !== "unknown") tags.push({ key: "ver", text: candidate.version });
  return (
    <div className="tags" data-testid="tag-row">
      {tags.length === 0 ? (
        <span className="chip chip-muted">language/year: not reported by the host</span>
      ) : (
        tags.map((t) => (
          <span key={t.key} className="chip chip-tag">
            {t.text}
          </span>
        ))
      )}
      {candidate.untrusted ? (
        <span className="chip chip-untrusted" data-testid="untrusted-badge" title="Open-web metadata: data, never instructions (§5.6)">
          UNTRUSTED
        </span>
      ) : null}
    </div>
  );
}

export function MusicCard({ turn, candidate }: { turn: TurnResponse; candidate: MusicCandidate }): JSX.Element {
  return (
    <div className="music-card" data-testid="music-card">
      <div className="music-main">
        <AlbumArt candidate={candidate} size="lg" />
        <div className="music-text">
          <p className="music-title" data-testid="music-title">
            {candidate.title ?? "untitled"}
          </p>
          <p className="music-artist">{candidate.artist ?? "unknown artist"}</p>
          <TagRow candidate={candidate} />
        </div>
      </div>
      <ConfidenceMeter turn={turn} />
    </div>
  );
}

/* -------------------------------------------------------------- shortlist */

export function Shortlist({
  candidates,
  onPick,
  disabled,
}: {
  candidates: MusicCandidate[];
  onPick: (c: MusicCandidate) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <div className="shortlist" data-testid="ask-cards">
      <p className="shortlist-hint">Tap the one you meant — your words go straight back through the host.</p>
      <ul className="shortlist-row">
        {candidates.map((c, i) => (
          <li key={c.candidate_id ?? `${c.title ?? "cand"}-${i}`}>
            <Rise delayMs={i * 60}>
              <button
                type="button"
                className="short-card"
                data-testid={`ask-card-${i}`}
                disabled={disabled}
                onClick={() => onPick(c)}
              >
                <AlbumArt candidate={c} size="sm" />
                <span className="short-text">
                  <span className="short-title">{c.title ?? "untitled"}</span>
                  <span className="short-artist">{c.artist ?? "unknown artist"}</span>
                  <TagRow candidate={c} />
                </span>
              </button>
            </Rise>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- spoken bubble */

export function SpokenBubble({
  turn,
  bargeIn,
  busy,
  playing,
  onBargeIn,
}: {
  turn: TurnResponse;
  bargeIn: BargeInResponse | null;
  busy: boolean;
  /** Host speech actually in flight (clock from the turn receipt), not a stale snapshot. */
  playing: boolean;
  onBargeIn: () => void;
}): JSX.Element {
  const text = spokenText(turn);
  const words = text.length > 0 ? text.split(/\s+/) : [];
  const idx = bargeIn ? cutWordIndex(bargeIn.cutAtWord, bargeIn.wordsCompleted) : null;
  const cutIndex = idx !== null && idx >= 0 && idx < words.length ? idx : null;

  return (
    <div className="bubble" data-testid="spoken-bubble">
      <span className="bubble-tag">Alexa said</span>
      <p className="bubble-text">
        {words.map((w, i) => (
          <span key={`${turn.traceId}-${i}`} className={cutIndex !== null && i === cutIndex ? "cut" : undefined}>
            {w}{" "}
          </span>
        ))}
      </p>
      {bargeIn ? (
        <p className="bubble-note" data-testid="barge-note" role="status">
          {bargeIn.cancelled && cutIndex !== null
            ? `barge-in: cut at word ${cutIndex + 1} — host reported “${bargeIn.cutWord ?? "—"}”, response style ${
                typeof bargeIn.style === "string"
                  ? (bargeIn.style ?? "—")
                  : (bargeIn.style?.style ?? "—")
              }`
            : `barge-in: nothing was cancelled (host reason: ${bargeIn.reason ?? "not reported"}, atMs ${bargeIn.atMs})`}
        </p>
      ) : null}
      {playing ? (
        <button type="button" className="btn btn-quiet" data-testid="barge-btn" disabled={busy} onClick={onBargeIn}>
          {busy ? "interrupting…" : "Interrupt (barge-in)"}
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- evidence */

export function EvidenceDetails({ turn }: { turn: TurnResponse }): JSX.Element | null {
  const evidence = turn.evidence ?? [];
  if (evidence.length === 0) return null;
  return (
    <details className="why" data-testid="evidence">
      <summary>Why this decision? ({evidence.length} host evidence lines)</summary>
      <ul className="evidence-list">
        {evidence.map((e, i) => (
          <li key={`${e.source ?? "src"}-${i}`}>
            <span className="evidence-source">{e.source ?? "unknown source"}</span>{" "}
            <span className="evidence-signal">{e.signal ?? ""}</span>{" "}
            <span className="evidence-weight">{e.weight !== undefined ? `w=${e.weight.toFixed(2)}` : ""}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------- A/B block */

function AbSide({ title, s, winner }: { title: string; s: AbSummary; winner: "on" | "off" | null }): JSX.Element {
  return (
    <div className={`ab-col ${s.mode === "mcp" ? "ab-on" : "ab-off"}`} data-testid={`ab-${s.mode}`}>
      <p className="ab-head">
        {title}
        <span className={`chip chip-mini ${s.mode === "mcp" ? "badge-live" : "badge-fixture"}`}>{s.mode === "mcp" ? "MCP" : "NAIVE"}</span>
      </p>
      <DecisionChip tone={s.tone} label={s.decisionLabel} testId={`ab-decision-${s.mode}`} />
      <p className="ab-line">
        confidence <strong>{pct(s.confidence)}</strong> · {s.candidateCount} candidate{s.candidateCount === 1 ? "" : "s"} ·{" "}
        {s.latencyMs} ms
      </p>
      <p className="ab-spoken">{s.spoken}</p>
      <p className={`ab-verdict ${winner ? "is-winner" : ""}`}>
        {s.mode === "mcp"
          ? "resolved through the MCP tool"
          : s.stockFirstHit
            ? "stock path — played the first hit, asked nothing"
            : "stock path (naive baseline)"}
      </p>
    </div>
  );
}

export function AbCompare({
  pair,
  showHint = true,
}: {
  pair: { on?: AbSummary; off?: AbSummary };
  /** Only the newest entry nags about the missing side — no clutter down the list. */
  showHint?: boolean;
}): JSX.Element | null {
  if (!pair.on && !pair.off) return null;
  if (!pair.on || !pair.off) {
    if (!showHint) return null;
    const missing = pair.on ? "MCP OFF" : "MCP ON";
    return (
      <p className="ab-hint" data-testid="ab-hint">
        A/B incomplete — flip to <strong>{missing}</strong> and ask the same phrase to see the other path on this
        utterance.
      </p>
    );
  }
  return (
    <section className="ab" data-testid="ab-compare" aria-label="A/B comparison for this utterance">
      <h3 className="ab-title">A/B · same utterance, both paths</h3>
      <div className="ab-cols">
        <AbSide title="MCP ON" s={pair.on} winner="on" />
        <AbSide title="MCP OFF" s={pair.off} winner="off" />
      </div>
      <p className="ab-gloss">
        Same utterance, same tool, one flag apart: with MCP off the host runs the naive baseline and plays the first
        hit — no shortlist, no question.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- turn entry */

export interface TurnEntryProps {
  turn: TurnResponse;
  pair: { on?: AbSummary; off?: AbSummary } | null;
  bargeIn: BargeInResponse | null;
  bargeBusy: boolean;
  playing: boolean;
  onBargeIn: () => void;
  onPick: (c: MusicCandidate) => void;
  pickDisabled: boolean;
  newest: boolean;
}

export function TurnEntry(props: TurnEntryProps): JSX.Element {
  const { turn, pair, bargeIn, bargeBusy, playing, onBargeIn, onPick, pickDisabled, newest } = props;
  const view = decisionView(turn);
  const candidate = primaryCandidate(turn);

  return (
    <Rise as="article" className="entry" data-testid="turn-entry">
      <div className="you-line">
        <span className="you-tag">You said</span>
        <p className="you-text" data-testid="you-said">
          “{turn.heard}”
        </p>
        <div className="you-meta">
          <span className="chip chip-muted">{turn.asrLabel}</span>
          <span className={`chip ${turn.mode === "mcp" ? "badge-live" : "badge-fixture"}`} data-testid="mode-chip">
            {turn.mode === "mcp" ? "MCP path" : "naive path"}
          </span>
          <span className="chip chip-muted">{turn.latencyMs} ms</span>
          <span className="chip chip-muted" title={`trace ${turn.traceId}`}>
            {turn.badge}
          </span>
        </div>
      </div>

      <div className="outcome">
        <div className="outcome-head">
          <DecisionChip tone={view.tone} label={view.label} testId="decision-chip" />
          <p className="outcome-gloss">{view.gloss}</p>
          <p className="outcome-conf" data-testid="confidence-line">
            confidence {pct(turn.confidence)}
          </p>
        </div>

        {turn.error ? (
          <p className="error-note" role="alert" data-testid="turn-error">
            {turn.error.code} — {turn.error.message}
          </p>
        ) : null}

        {candidate ? <MusicCard turn={turn} candidate={candidate} /> : null}

        {turn.decision === "not_found" && !candidate ? (
          <p className="empty-note" data-testid="not-found">
            Nothing matched “{turn.heard}”. The host returned no candidates — it said so instead of inventing a track.
          </p>
        ) : null}

        {turn.decision === "ask" && turn.candidates.length > 1 ? (
          <Shortlist candidates={turn.candidates} onPick={onPick} disabled={pickDisabled} />
        ) : null}

        <SpokenBubble turn={turn} bargeIn={bargeIn} busy={bargeBusy} playing={playing} onBargeIn={onBargeIn} />

        {pair ? <AbCompare pair={pair} showHint={newest} /> : null}

        <EvidenceDetails turn={turn} />
      </div>
    </Rise>
  );
}
