import { useCallback, useEffect, useMemo, useState } from "react";
import { TraceTransport, type TransportStatus } from "./transport";
import {
  HOST_BASE,
  TRACE_WS_URL,
  getState,
  postBargeIn,
  postChaos,
  postTurn,
  turnPayload,
} from "./host";
import { mergeFrames, abKey, abSummary, type FrameRow } from "./derive";
import type { BargeInResponse, Frame, MusicCandidate, StateResponse, Surface, TurnResponse } from "./types";
import { TopBar } from "./components/TopBar";
import { VoiceStage } from "./components/VoiceStage";
import { TurnEntry } from "./components/Outcome";
import { ProofStrip } from "./components/ProofStrip";
import { SystemDrawer } from "./components/SystemDrawer";
import { Rise } from "./components/motion";

/** One conversation entry: the host's /turn response + when we received it. */
interface Entry {
  id: string;
  turn: TurnResponse;
  startedAt: number;
}

/** One-click demo phrases — all three verified against the live host. */
const PRESETS = [
  { label: "play raja ji", text: "play raja ji" },
  { label: "play taylor", text: "play taylor" },
  { label: "play quantum foam symphony", text: "play quantum foam symphony" },
];

const MAX_ENTRIES = 6;

export function App(): JSX.Element {
  const [rows, setRows] = useState<FrameRow[]>([]);
  const [liveSeqs, setLiveSeqs] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [dropped, setDropped] = useState(0);
  const [status, setStatus] = useState<TransportStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState("starting…");

  const [mcpOn, setMcpOn] = useState(true);
  const [surface, setSurface] = useState<Surface>("screen");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [bargeIns, setBargeIns] = useState<Record<string, BargeInResponse>>({});
  const [bargeBusy, setBargeBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [systemOpen, setSystemOpen] = useState(false);
  const [systemState, setSystemState] = useState<StateResponse | null>(null);
  const [chaosLog, setChaosLog] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  /* One transport for the app's lifetime; the WS layer is the test seam. */
  useEffect(() => {
    const t = new TraceTransport(TRACE_WS_URL, {
      onStatus(s, detail) {
        setStatus(s);
        setStatusDetail(detail);
      },
      onFrames(incoming: Frame[], kind) {
        setRows((prev) => mergeFrames(prev, incoming));
        if (kind === "frame") {
          setLiveSeqs((prev) => {
            const next = new Set(prev);
            for (const f of incoming) next.add(f.seq);
            return next;
          });
        }
      },
      onDropped() {
        setDropped((d) => d + 1);
      },
    });
    t.connect();
    return () => t.close();
  }, []);

  const refreshState = useCallback(async () => {
    const res = await getState();
    if (res.ok && res.body) setSystemState(res.body);
    return res.body;
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  /* Keep a coarse clock only while something is actually speaking. */
  const latest = entries[0];
  const speaking =
    latest !== undefined && latest.turn.tts.playing && now < latest.startedAt + latest.turn.tts.durationMs;
  useEffect(() => {
    if (!speaking) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [speaking]);

  const sendTurn = useCallback(
    async (text: string | undefined, mcpFlag?: boolean) => {
      if (text === undefined || text.trim().length === 0) return;
      setBusy(true);
      setBargeBusy(false);
      const payload = turnPayload({ text: text.trim(), surface, mcpOn: mcpFlag ?? mcpOn });
      const res = await postTurn(payload);
      setBusy(false);
      if (!res.ok || res.body === null) {
        setBanner(
          res.status === 0
            ? "alexa-lab offline — start it on :4000 (or check the dev proxy target VITE_HOST)"
            : `alexa-lab /turn failed — HTTP ${res.status}${res.body && "error" in res.body ? `: ${(res.body as { error?: { message?: string } }).error?.message ?? ""}` : ""}`,
        );
        return;
      }
      setBanner(null);
      const turn = res.body;
      setEntries((prev) => [{ id: turn.traceId, turn, startedAt: Date.now() }, ...prev].slice(0, MAX_ENTRIES));
      void refreshState();
    },
    [surface, mcpOn, refreshState],
  );

  const handleMcpToggle = useCallback((next: boolean) => {
    // The flag is applied by the host on every turn — no synthetic request here;
    // the next utterance carries it (verified in the rendering tests).
    setMcpOn(next);
  }, []);

  const sendBargeIn = useCallback(async () => {
    const entry = entries[0];
    if (!entry) return;
    setBargeBusy(true);
    const elapsed = Date.now() - entry.startedAt;
    const atMs = Math.max(0, Math.min(entry.turn.tts.durationMs - 50, elapsed));
    const res = await postBargeIn({ atMs, traceId: entry.turn.traceId });
    setBargeBusy(false);
    if (res.ok && res.body) {
      setBargeIns((prev) => ({ ...prev, [entry.id]: res.body as BargeInResponse }));
      setNow(Date.now());
    } else {
      setBanner(`POST /barge-in failed — ${res.status === 0 ? "host unreachable" : `HTTP ${res.status}`}`);
    }
  }, [entries]);

  const pickCandidate = useCallback(
    (c: MusicCandidate) => {
      const title = (c.title ?? "").trim();
      if (title.length === 0) return;
      // Honest follow-up: the user disambiguates in words, straight through the host.
      void sendTurn(`play ${title}`);
    },
    [sendTurn],
  );

  const injectChaos = useCallback(
    async (payload: { latencyMs?: number; failNext?: number; clear?: boolean }, label: string) => {
      const res = await postChaos(payload);
      const line = res.ok
        ? `ok — ${label} (HTTP ${res.status})`
        : `failed — ${label}: ${res.status === 0 ? "host unreachable" : `HTTP ${res.status}`}`;
      setChaosLog((prev) => [line, ...prev].slice(0, 5));
      if (!res.ok) setBanner(`chaos inject failed — ${line}`);
      else setBanner(null);
      await refreshState();
    },
    [refreshState],
  );

  /* A/B map: same utterance (heard text), newest entry per mode wins. */
  const abMap = useMemo(() => {
    const m = new Map<string, { on?: ReturnType<typeof abSummary>; off?: ReturnType<typeof abSummary> }>();
    for (const e of entries) {
      const k = abKey(e.turn);
      const cur = m.get(k) ?? {};
      const s = abSummary(e.turn);
      if (e.turn.mode === "mcp") {
        if (!cur.on) cur.on = s;
      } else if (!cur.off) {
        cur.off = s;
      }
      m.set(k, cur);
    }
    return m;
  }, [entries]);

  const breakerState = systemState?.breaker?.state ?? latest?.turn.breaker.state ?? "unknown";
  const mcpState = systemState?.mcp?.state ?? latest?.turn.mcp.state ?? "unknown";
  const framesTotal = systemState?.trace?.frames ?? rows.length;

  const orbState: "idle" | "thinking" | "speaking" = busy ? "thinking" : speaking ? "speaking" : "idle";
  const orbSub = busy
    ? mcpOn
      ? "resolving through the MCP tool"
      : "naive path — MCP off"
    : speaking
      ? "tap Interrupt to barge in"
      : latest
        ? `last turn ${latest.turn.latencyMs} ms · ${mcpOn ? "MCP on" : "MCP off"}`
        : "tap a phrase below, or type one";

  const shownBanner = banner ?? (status === "offline" ? statusDetail : null);

  return (
    <div className="console">
      <TopBar
        mcpOn={mcpOn}
        onMcpToggle={handleMcpToggle}
        status={status}
        statusDetail={statusDetail}
        systemOpen={systemOpen}
        onToggleSystem={() => setSystemOpen((v) => !v)}
        breakerState={breakerState}
        mcpState={mcpState}
      />

      {shownBanner !== null ? (
        <div className="banner" role="alert" data-testid="offline-banner">
          {shownBanner}
        </div>
      ) : null}

      <main className="main">
        <VoiceStage
          orb={orbState}
          orbSub={orbSub}
          presets={PRESETS}
          busy={busy}
          onSubmit={(text) => void sendTurn(text)}
        />

        <section className="conversation" aria-label="Conversation">
          {entries.length === 0 ? (
            <Rise className="empty-state" data-testid="empty-state">
              <p className="empty-title">Nothing said yet</p>
              <p className="empty-note">
                Tap <strong>“play raja ji”</strong> with MCP ON to watch it ask instead of guess — then flip the switch
                and ask again.
              </p>
            </Rise>
          ) : (
            entries.map((e, i) => (
              <TurnEntry
                key={e.id}
                turn={e.turn}
                /* The A/B block belongs to the newest exchange — older entries stay clean. */
                pair={i === 0 ? (abMap.get(abKey(e.turn)) ?? null) : null}
                bargeIn={bargeIns[e.id] ?? null}
                bargeBusy={bargeBusy}
                playing={i === 0 && speaking}
                onBargeIn={() => void sendBargeIn()}
                onPick={pickCandidate}
                pickDisabled={busy}
                newest={i === 0}
              />
            ))
          )}
        </section>
      </main>

      <SystemDrawer
        open={systemOpen}
        onClose={() => setSystemOpen(false)}
        state={systemState}
        lastTurn={latest?.turn ?? null}
        surface={surface}
        onSurfaceChange={setSurface}
        onRefresh={() => void refreshState()}
        onChaos={(payload, label) => void injectChaos(payload, label)}
        chaosLog={chaosLog}
        frameCount={framesTotal}
      />

      <ProofStrip rows={rows} liveSeqs={liveSeqs} dropped={dropped} status={status} statusDetail={statusDetail} />

      <p className="host-note small" data-testid="host-note">
        host {HOST_BASE} · trace {TRACE_WS_URL}
      </p>
    </div>
  );
}
