import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TraceTransport, type TransportStatus } from "./transport";
import { HOST_BASE, TRACE_WS_URL, postChaos, postTurn, turnPayload } from "./host";
import {
  MAX_FRAMES,
  badgesSeen,
  deriveContinuity,
  deriveResolution,
  deriveSpeaking,
  deriveTranscripts,
  deriveTts,
  findExplanation,
  type ResolutionView,
} from "./derive";
import type { ConsoleBadge, Surface, TraceEnvelope } from "./types";
import { TopBar } from "./components/TopBar";
import { VoiceStage } from "./components/VoiceStage";
import { ResolutionPane } from "./components/ResolutionPane";
import { ContinuityPanel } from "./components/ContinuityPanel";
import { WireInspector } from "./components/WireInspector";

interface FrameRow {
  seq: number;
  envelope: TraceEnvelope;
}

export function App(): JSX.Element {
  const [frames, setFrames] = useState<FrameRow[]>([]);
  const [dropped, setDropped] = useState(0);
  const [status, setStatus] = useState<TransportStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("starting…");
  const [mcpOn, setMcpOn] = useState(true);
  const [surface, setSurface] = useState<Surface>("screenless");
  const [typedTurns, setTypedTurns] = useState(0);
  const [lastTurnPayload, setLastTurnPayload] = useState<unknown>(null);
  const [explainResult, setExplainResult] = useState<{ text: string } | null>(null);
  const [chaosLog, setChaosLog] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const seqRef = useRef(0);
  const genRef = useRef(0);

  /* One transport for the app's lifetime; the WS layer is the mock seam in tests. */
  useEffect(() => {
    const t = new TraceTransport(TRACE_WS_URL, {
      onStatus(s, detail) {
        setStatus(s);
        setStatusDetail(detail);
      },
      onEnvelope(envelope) {
        seqRef.current += 1;
        const row: FrameRow = { seq: seqRef.current, envelope };
        setFrames((prev) => {
          // Frames accumulate in wire order; the window is capped so a long
          // session cannot grow the DOM without bound.
          const next = [...prev, row];
          return next.length > MAX_FRAMES ? next.slice(next.length - MAX_FRAMES) : next;
        });
      },
      onDropped() {
        setDropped((d) => d + 1);
      },
    });
    genRef.current = 1;
    t.connect();
    return () => t.close();
  }, []);

  const envelopes = useMemo(() => frames.map((r) => r.envelope), [frames]);
  const badges = useMemo<ConsoleBadge[]>(() => {
    const seen: ConsoleBadge[] = [...badgesSeen(envelopes)];
    // TYPED is console-side provenance: shown only once frames have actually
    // arrived for turns this console typed. Never hardcoded alongside wire badges.
    if (typedTurns > 0 && envelopes.length > 0) seen.push("TYPED");
    return seen;
  }, [envelopes, typedTurns]);
  const resolution = useMemo<ResolutionView | null>(() => deriveResolution(envelopes), [envelopes]);
  const continuity = useMemo(() => deriveContinuity(envelopes), [envelopes]);
  const speaking = useMemo(() => deriveSpeaking(envelopes), [envelopes]);
  const transcripts = useMemo(() => deriveTranscripts(envelopes), [envelopes]);
  const tts = useMemo(() => deriveTts(envelopes), [envelopes]);

  const sendTurn = useCallback(
    async (text: string | undefined, isTyped: boolean, mcpFlag: boolean) => {
      const body = turnPayload(text, surface, mcpFlag);
      try {
        const res = await postTurn(body);
        if (!res.ok) {
          setBanner(`alexa-lab /turn failed — HTTP ${res.status}. Is the host running on :4000?`);
          return;
        }
        setBanner(null);
        setLastTurnPayload(await res.json().catch(() => null));
        if (isTyped) setTypedTurns((n) => n + 1);
      } catch {
        setBanner("alexa-lab offline — start it on :4000");
      }
    },
    [surface],
  );

  const handleMcpToggle = useCallback(
    (next: boolean) => {
      setMcpOn(next);
      // The flag is applied on the next turn; send a config-only turn now carrying
      // the NEW value (state updates are async, so pass it explicitly — do not rely
      // on the sendTurn closure, which still holds the previous mcpOn).
      void sendTurn(undefined, false, next);
    },
    [sendTurn],
  );

  const handleExplain = useCallback(async () => {
    // Prefer the receipt already in the last turn payload; fall back to asking the host.
    const local = findExplanation(lastTurnPayload) ?? (resolution ? findExplanation(resolution.receipt) : undefined);
    if (local !== undefined) {
      setExplainResult({ text: local });
      return;
    }
    try {
      const res = await postTurn(turnPayload(undefined, surface, mcpOn) );
      const payload = await res.json().catch(() => null);
      const remote = findExplanation(payload);
      setExplainResult(
        remote !== undefined
          ? { text: remote }
          : { text: "no receipt available for the last action — the host returned no explanation" },
      );
    } catch {
      setExplainResult({ text: "alexa-lab offline — cannot fetch an explanation (start it on :4000)" });
    }
  }, [lastTurnPayload, resolution, surface, mcpOn]);

  const injectChaos = useCallback(async (payload: { latencyMs?: number; failNext?: number }, label: string) => {
    try {
      const res = await postChaos(payload);
      const line = res.ok
        ? `ok — ${label} injected (HTTP ${res.status})`
        : `failed — ${label}: host responded HTTP ${res.status}`;
      setChaosLog((prev) => [line, ...prev].slice(0, 5));
      if (!res.ok) setBanner(`chaos inject failed — alexa-lab /chaos responded ${res.status}`);
    } catch {
      setChaosLog((prev) => [`failed — ${label}: alexa-lab offline`, ...prev].slice(0, 5));
      setBanner("alexa-lab offline — start it on :4000");
    }
  }, []);

  return (
    <div className={`console ${surface === "tv" ? "tv-mode" : ""}`}>
      <TopBar
        badges={badges}
        mcpOn={mcpOn}
        onMcpToggle={handleMcpToggle}
        surface={surface}
        onSurfaceChange={setSurface}
        status={status}
        statusDetail={statusDetail}
      />

      {/* Honest host-down banner: raised either by a failed action POST or by the
          trace transport itself dropping offline. Never accompanied by synthetic frames. */}
      {(() => {
        const shown = banner ?? (status === "offline" ? statusDetail : null);
        return shown !== null ? (
          <div className="banner" role="alert" data-testid="offline-banner">
            {shown}
          </div>
        ) : null;
      })()}

      <main className="grid">
        <VoiceStage
          speaking={speaking === true}
          transcripts={transcripts}
          tts={tts}
          onSubmit={(text) => void sendTurn(text, true, mcpOn)}
          disabled={status !== "open"}
        />
        <ResolutionPane
          resolution={resolution}
          onExplain={() => void handleExplain()}
          explainResult={explainResult}
          mcpOn={mcpOn}
          status={status}
        />
        <ContinuityPanel
          continuity={continuity}
          onChaos={injectChaos}
          chaosLog={chaosLog}
        />
      </main>

      <WireInspector rows={frames} dropped={dropped} host={HOST_BASE} />
    </div>
  );
}
