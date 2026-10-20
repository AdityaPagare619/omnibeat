/**
 * Live probe against a running omnibeat-mcp (default :8080):
 * initialize -> capture Mcp-Session-Id -> notifications/initialized ->
 * tools/list -> tools/call music_resolve_request -> print the result JSON.
 * Prints each step's HTTP status; exits non-zero on any failure.
 * Usage: node scripts/probe.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:8080";
const HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};
const exits = [];

function frame(text, contentType) {
  if (text.length === 0) return null;
  if (contentType.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data:"));
    return data.length ? JSON.parse(data[data.length - 1].slice(5).trim()) : null;
  }
  return JSON.parse(text);
}

async function post(body, extraHeaders = {}) {
  const res = await fetch(BASE + "/mcp", {
    method: "POST",
    headers: { ...HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = frame(text, res.headers.get("content-type") ?? "");
  } catch (err) {
    data = { parse_error: String(err), raw: text.slice(0, 400) };
  }
  return { status: res.status, session: res.headers.get("mcp-session-id"), data, text };
}

function step(name, status, ok, detail) {
  exits.push({ name, status, ok });
  const line = "[probe] " + name + " -> HTTP " + status + (ok ? " OK" : " FAIL");
  console.log(detail ? line + " | " + detail : line);
}

async function main() {
  console.log("[probe] target " + BASE);
  const init = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "omnibeat-probe", version: "0.1.0" },
    },
  });
  const sid = init.session;
  step("initialize", init.status, init.status === 200 && Boolean(sid), "Mcp-Session-Id=" + sid);
  if (!sid) process.exit(1);
  console.log("[probe] negotiated=" + JSON.stringify(init.data?.result?.protocolVersion));
  const H = { "mcp-session-id": sid, "mcp-protocol-version": "2025-11-25" };
  const ack = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, H);
  step("notifications/initialized", ack.status, ack.status === 202 || ack.status === 200);
  const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, H);
  const tools = list.data?.result?.tools ?? [];
  step("tools/list", list.status, list.status === 200 && tools.length === 8, "count=" + tools.length);

  const call = await post(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "music_resolve_request",
        arguments: { transcript: "play raja ji", surface: "screenless" },
      },
    },
    H,
  );
  const out = call.data?.result?.structuredContent;
  step(
    "tools/call music_resolve_request",
    call.status,
    call.status === 200 && Boolean(out) && ["play", "ask", "repair", "not_found"].includes(out.decision),
    out ? "decision=" + out.decision + " confidence=" + out.confidence : JSON.stringify(call.data).slice(0, 300),
  );
  console.log("[probe] RESULT_JSON " + JSON.stringify(out, null, 2));
  const failed = exits.filter((e) => !e.ok);
  console.log(
    "[probe] exit codes: " + exits.map((e) => e.name + "=" + (e.ok ? 0 : 1)).join(" | "),
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[probe] FATAL " + String(err));
  process.exit(2);
});
