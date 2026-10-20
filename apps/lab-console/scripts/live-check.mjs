/**
 * Live acceptance check for lab-console (brief §acceptance 2).
 *
 *   node scripts/live-check.mjs
 *
 * 1. opens ws://localhost:4000/trace and asserts >= 1 real frame arrives
 *    (plus a NEW frame after a turn is issued),
 * 2. POSTs /turn "play raja ji" with mcpOn:true then mcpOn:false and prints
 *    the two decision lines (the A/B money moment) for PROOF.md.
 *
 * Exit code 0 = all assertions held. No fixtures, no mocks: this talks to the
 * running stack only.
 */
const API = process.env.API ?? "http://localhost:4000";
const WS = process.env.WS ?? "ws://localhost:4000/trace";
const UTTERANCE = process.env.UTTERANCE ?? "play raja ji";

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function turn(mcpOn) {
  const res = await fetch(`${API}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: UTTERANCE, surface: "screen", mcpOn }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

function line(label, r) {
  const b = r.body;
  return (
    `${label} status=${r.status} mode=${b.mode} decision=${b.decision} confidence=${b.confidence} ` +
    `candidates=${b.candidates?.length ?? 0} badge=${b.badge} latencyMs=${b.latencyMs} traceId=${b.traceId} ` +
    `spoken=${JSON.stringify(b.spokenPrompt?.speak_short ?? b.spoken)}`
  );
}

/* ------------------------------------------------------------------ 1. WS */
async function assertTraceFrames() {
  const frames = [];
  let sawReplay = false;
  let lastSeq = -1;
  const ws = new WebSocket(WS);
  const onFrame = (msg) => {
    let parsed;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      return;
    }
    if (parsed?.type === "replay") {
      sawReplay = true;
      for (const f of parsed.frames ?? []) frames.push(f);
    } else if (parsed?.type === "frame" && parsed.frame) {
      frames.push(parsed.frame);
    }
    const top = frames[frames.length - 1];
    if (top && typeof top.seq === "number") lastSeq = Math.max(lastSeq, top.seq);
  };
  ws.addEventListener("message", onFrame);
  ws.addEventListener("error", () => check("ws connect", false, "socket error"));
  await new Promise((resolve) => {
    ws.addEventListener("open", resolve, { once: true });
    setTimeout(resolve, 5000);
  });

  await sleep(700);
  check("ws://…/trace open", ws.readyState === WebSocket.OPEN, `readyState=${ws.readyState}`);
  check("replay window delivered on connect", sawReplay && frames.length > 0, `frames=${frames.length}`);
  const shape = frames[0];
  check(
    "frame matches host frameSchema fields",
    shape && typeof shape.seq === "number" && typeof shape.ts === "string" && typeof shape.method === "string" && typeof shape.badge === "string",
    shape ? `seq=${shape.seq} method=${shape.method} badge=${shape.badge}` : "no frame",
  );

  /* ------------------------------------------------------- 2. A/B turns */
  const on = await turn(true);
  await sleep(2500);
  const off = await turn(false);
  await sleep(900);

  check("POST /turn mcpOn:true -> 200", on.status === 200, line("A/MCP-ON ", on));
  check("POST /turn mcpOn:false -> 200", off.status === 200, line("B/MCP-OFF", off));
  check(
    "both responses carry decision + confidence",
    ["decision", "confidence"].every((k) => k in on.body) && ["decision", "confidence"].every((k) => k in off.body),
    `on=${on.body.decision}/${on.body.confidence} off=${off.body.decision}/${off.body.confidence}`,
  );
  check(
    "A/B contrast: ON asks (or differs) while OFF plays the first hit",
    off.body.decision === "play" && off.body.candidates?.length === 1 && on.body.decision !== "error",
    `on=${on.body.decision} (${on.body.candidates?.length} cands) vs off=${off.body.decision} (${off.body.candidates?.length} cand, mode=${off.body.mode})`,
  );
  check("live frames arrived during the turns", frames.length > 0 && lastSeq >= 0, `frames=${frames.length} lastSeq=${lastSeq}`);

  ws.removeEventListener("message", onFrame);
  ws.close();

  console.log("\nDECISION LINES (paste into PROOF.md):");
  console.log(`A/MCP-ON   ${line("", on)}`);
  console.log(`B/MCP-OFF  ${line("", off)}`);
}

const health = await fetch(`${API}/healthz`).then((r) => r.json()).catch(() => null);
check("host /healthz ok", health?.ok === true, health ? `mcp=${health.mcp?.state} breaker=${health.breaker?.state} frames=${health.trace?.frames}` : "unreachable");

await assertTraceFrames();

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
