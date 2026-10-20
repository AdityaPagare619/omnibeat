// one-off: inspect the raw MCP HTTP responses (bodies + content-types)
const url = "http://localhost:8080/mcp";
const initBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "raw-probe", version: "0.0.1" },
  },
};
const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  body: JSON.stringify(initBody),
});
console.log("STATUS", res.status);
console.log("CONTENT-TYPE", JSON.stringify(res.headers.get("content-type")));
console.log("SESSION", res.headers.get("mcp-session-id"));
const text = await res.text();
console.log("BODY LENGTH", text.length);
console.log("BODY HEAD", JSON.stringify(text.slice(0, 200)));
console.log("BODY TAIL", JSON.stringify(text.slice(-160)));
console.log("RAW ESCAPED:", JSON.stringify(text.slice(0, 400)));
