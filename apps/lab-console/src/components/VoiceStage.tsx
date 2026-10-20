import { useState } from "react";
import type { TranscriptLine, TtsView } from "../derive";

interface Props {
  speaking: boolean;
  transcripts: TranscriptLine[];
  tts: TtsView | null;
  onSubmit: (text: string) => void;
  disabled: boolean;
}

/** Split TTS text at the barge-in cut: the cut point is shown struck through (§6.5). */
function cutSegments(tts: TtsView): { spoken: string; cut: string | null } {
  if (tts.cutIndex === undefined) {
    // A cancellation arrived but no word index — strike the whole bubble honestly.
    return { spoken: "", cut: tts.text };
  }
  const words = tts.text.split(/(\s+)/);
  let wordCount = 0;
  let cutAt = words.length;
  for (let i = 0; i < words.length; i += 1) {
    const seg = words[i];
    if (seg === undefined) continue;
    if (!/^\s+$/.test(seg)) {
      wordCount += 1;
      if (wordCount > tts.cutIndex) {
        cutAt = i;
        break;
      }
    }
  }
  return { spoken: words.slice(0, cutAt).join(""), cut: words.slice(cutAt).join("") || null };
}

export function VoiceStage(props: Props): JSX.Element {
  const { speaking, transcripts, tts, onSubmit, disabled } = props;
  const [text, setText] = useState("");

  const submit = (): void => {
    const t = text.trim();
    if (t.length === 0) return;
    onSubmit(t);
    setText("");
  };

  const lastFinal = [...transcripts].reverse().find((t) => t.final);
  const lastPartial = [...transcripts].reverse().find((t) => !t.final);

  return (
    <section className="panel voice" aria-label="voice stage">
      <h2 className="panel-title">Voice</h2>

      <div className="orb-row">
        <div className={`orb ${speaking ? "orb-speaking" : ""}`} aria-hidden="true" />
        <div className="orb-state">
          <span className="state-label">{speaking ? "speaking" : "idle"}</span>
          <span className="state-sub">VAD: on-device (Phase 4)</span>
        </div>
      </div>

      <form
        className="say-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="say-input">
          say something
        </label>
        <input
          id="say-input"
          className="say-input"
          placeholder="say something…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" className="btn btn-say" disabled={disabled || text.trim().length === 0}>
          Say
        </button>
        <button
          type="button"
          className="btn btn-mic"
          disabled
          aria-disabled="true"
          title="mic in Phase 4"
        >
          Mic
        </button>
        <span className="mic-hint">mic in Phase 4</span>
      </form>

      <div className="transcripts" aria-live="polite">
        {lastFinal && (
          <p className="transcript transcript-final" data-testid="transcript-final">
            <span className="transcript-tag">heard</span> {lastFinal.text}
          </p>
        )}
        {lastPartial && (
          <p className="transcript transcript-partial" data-testid="transcript-partial">
            <span className="transcript-tag">partial</span> {lastPartial.text}
          </p>
        )}
        {!lastFinal && !lastPartial && (
          <p className="transcript transcript-empty">no transcript in trace yet</p>
        )}
      </div>

      {tts && (
        <div className="tts-bubble" data-testid="tts-bubble">
          <span className="tts-tag">TTS</span>{" "}
          {(() => {
            const { spoken, cut } = cutSegments(tts);
            return (
              <>
                {spoken}
                {cut && <s className="tts-cut">{cut}</s>}
                {cut && tts.cutIndex === undefined && (
                  <span className="tts-cut-note"> (cut point not reported)</span>
                )}
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
