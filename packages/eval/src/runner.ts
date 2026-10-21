/**
 * Runner: speaks MCP Streamable HTTP to a replay-only omnibeat-mcp instance.
 *
 * Two server-side passes over the SAME utterance list:
 *   - OmniBeat (normal mode): the real S0..S7 resolver pipeline.
 *   - Baseline A (POST /admin/mode {naive:true}): the server's honest
 *     first-provider-hit verbatim baseline - same catalog, zero intelligence.
 * Baseline B is computed offline in baselines.ts against the same catalog.
 *
 * Every row records decision + chosen title + expected title + confidence +
 * latency, or the REAL error when the tool call fails (never swallowed).
 */
import { McpClient, type SpawnedServer } from "./mcp.js";
import type { CorpusEntry } from "./corpus.js";
import type { EvalRow } from "./metrics.js";

function rowFromOutcome(
  entry: CorpusEntry,
  outcome: { ok: boolean; output?: any; error?: string; latencyMs: number },
): EvalRow {
  const base = {
    id: entry.id,
    input: entry.input,
    expect: entry.expect,
    locale: entry.locale,
  };
  if (!outcome.ok || !outcome.output) {
    return {
      ...base,
      decision: "repair",
      confidence: 0,
      chosenTitle: null,
      top1Title: null,
      candidateCount: 0,
      error: outcome.error ?? "unknown tool failure",
      latencyMs: outcome.latencyMs,
    };
  }
  const out = outcome.output;
  const decision = out.decision as EvalRow["decision"];
  const trackTitle = typeof out.track?.title === "string" ? out.track.title : null;
  const candidates = Array.isArray(out.candidates) ? out.candidates : [];
  const top1 =
    decision === "play" ? trackTitle : candidates.length > 0 ? String(candidates[0].title) : null;
  return {
    ...base,
    decision,
    confidence: typeof out.confidence === "number" ? out.confidence : 0,
    chosenTitle: decision === "play" ? trackTitle : null,
    top1Title: top1,
    candidateCount: decision === "play" && trackTitle !== null ? 1 : candidates.length,
    latencyMs: outcome.latencyMs,
  };
}

export interface RunPassResult {
  rows: EvalRow[];
  toolErrors: number;
}

/** Pass 1: OmniBeat proper (screenless surface), sequential calls. */
export async function runOmniBeatPass(
  server: SpawnedServer,
  corpus: readonly CorpusEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<RunPassResult> {
  const client = new McpClient(server.baseUrl);
  await client.initialize();
  await client.setNaive(false);
  const rows: EvalRow[] = [];
  let toolErrors = 0;
  let done = 0;
  for (const entry of corpus) {
    const outcome = await client.callResolve(entry.input, "screenless");
    const row = rowFromOutcome(entry, outcome);
    if (row.error !== undefined) toolErrors += 1;
    rows.push(row);
    done += 1;
    onProgress?.(done, corpus.length);
  }
  return { rows, toolErrors };
}

/** Pass 2: Baseline A - same server, /admin/mode {naive:true}. */
export async function runBaselineAPass(
  server: SpawnedServer,
  corpus: readonly CorpusEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<RunPassResult> {
  const client = new McpClient(server.baseUrl);
  await client.initialize();
  await client.setNaive(true);
  const rows: EvalRow[] = [];
  let toolErrors = 0;
  let done = 0;
  for (const entry of corpus) {
    const outcome = await client.callResolve(entry.input, "screenless");
    const row = rowFromOutcome(entry, outcome);
    if (row.error !== undefined) toolErrors += 1;
    rows.push(row);
    done += 1;
    onProgress?.(done, corpus.length);
  }
  // Leave the server in its default mode for any later pass.
  await client.setNaive(false);
  return { rows, toolErrors };
}
