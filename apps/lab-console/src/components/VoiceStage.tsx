/**
 * VoiceStage — the Alexa+ orb and the one-click demo surface.
 *
 * Orb states are derived from the host's own signals (pending request, or
 * `tts.playing` in the last /turn response) — never a decorative loop that
 * claims activity that isn't happening.
 */
interface Preset {
  label: string;
  text: string;
}

interface VoiceStageProps {
  orb: "idle" | "thinking" | "speaking";
  orbSub: string;
  presets: Preset[];
  onSubmit: (text: string) => void;
  busy: boolean;
}

const STATE_LABEL: Record<VoiceStageProps["orb"], string> = {
  idle: "Ready",
  thinking: "Thinking…",
  speaking: "Speaking",
};

export function VoiceStage({ orb, orbSub, presets, onSubmit, busy }: VoiceStageProps): JSX.Element {
  return (
    <section className="stage" aria-label="Voice">
      <div className="orb-block">
        <div
          className={`orb orb-${orb}`}
          data-testid="orb"
          role="img"
          aria-label={`Alexa+ assistant: ${STATE_LABEL[orb]}`}
        >
          <span className="orb-halo" aria-hidden="true" />
          <span className="orb-core" aria-hidden="true" />
        </div>
        <div className="orb-meta">
          <p className="orb-state" data-testid="orb-state">
            {STATE_LABEL[orb]}
          </p>
          <p className="orb-sub">{orbSub}</p>
        </div>
      </div>

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          const el = e.currentTarget.elements.namedItem("utterance") as HTMLInputElement | null;
          const value = el?.value.trim() ?? "";
          if (value.length > 0) onSubmit(value);
        }}
      >
        <label className="sr-only" htmlFor="utterance">
          Say something to Alexa+
        </label>
        <input
          id="utterance"
          name="utterance"
          className="ask-input"
          type="text"
          autoComplete="off"
          placeholder={'try "play raja ji"'}
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" data-testid="ask-btn" disabled={busy}>
          {busy ? "thinking…" : "Ask"}
        </button>
      </form>

      <div className="presets" aria-label="Preset utterances">
        {presets.map((p) => (
          <button
            key={p.text}
            type="button"
            className="chip chip-preset"
            data-testid={`preset-${slug(p.text)}`}
            disabled={busy}
            onClick={() => onSubmit(p.text)}
          >
            “{p.label}”
          </button>
        ))}
      </div>
    </section>
  );
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
