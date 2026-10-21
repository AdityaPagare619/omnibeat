/**
 * OmniBeat eval harness CLI.
 *
 *   node dist/cli.js corpus   - rebuild eval/corpus.lock.json + eval/heldout.lock.json
 *   node dist/cli.js tune     - run OmniBeat on the TUNE split only (tuning never reads heldout)
 *   node dist/cli.js run      - FULL pipeline: corpus locks -> spawn replay-only server ->
 *                               OmniBeat + baseline A (server naive mode) on HELDOUT ->
 *                               baseline B (offline token match) -> report.md + results.json +
 *                               docs/EVAL_REPORT.md -> table to stdout.
 *
 * One command regenerates every number in the report. Failures (including
 * server spawn failures) are printed with their real error text.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assembleCorpus,
  corpusContentSha256,
  packSummary,
  readLockFile,
  TuneCorpus,
  writeLocks,
  type CorpusEntry,
} from "./corpus.js";
import { baselineBRow, loadCatalogTracks } from "./baselines.js";
import { loadCoverageGaps } from "./gaps.js";
import { spawnReplayServer } from "./mcp.js";
import { ciText, metricsWithCi, normalizeTitle, pct, type EvalRow } from "./metrics.js";
import {
  CORPUS_LOCK,
  HELDOUT_LOCK,
  REPLAY_CATALOG,
  EVAL_DIR,
} from "./paths.js";
import { runBaselineAPass, runOmniBeatPass } from "./runner.js";
import { buildReport, buildResultsJson, buildTable, writeReports, type ReportInput, type SystemResult } from "./report.js";

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function cmdCorpus(): void {
  const entries = assembleCorpus();
  const written = writeLocks(entries);
  log(
    `corpus: ${entries.length} utterances from ${packSummary().map((p) => `${p.locale}:${p.fixtures}`).join("+")} fixtures`,
  );
  log(`  tune    -> ${CORPUS_LOCK} (${written.tune.entry_count} entries, sha256 ${written.tune.corpus_sha256.slice(0, 12)}...)`);
  log(`  heldout -> ${HELDOUT_LOCK} (${written.heldout.entry_count} entries, sha256 ${written.heldout.corpus_sha256.slice(0, 12)}...)`);
}

/** Tune split only: TuneCorpus asserts no heldout entry can enter this path. */
async function cmdTune(): Promise<void> {
  if (!existsSync(CORPUS_LOCK)) cmdCorpus();
  const tuneLock = readLockFile(CORPUS_LOCK);
  const corpus = new TuneCorpus(tuneLock).entries;
  const server = await spawnReplayServer();
  try {
    const pass = await runOmniBeatPass(server, corpus, (done, total) => {
      if (done % 10 === 0 || done === total) log(`  tune pass: ${done}/${total}`);
    });
    const withCi = metricsWithCi(pass.rows);
    log(
      `tune split (N=${withCi.metrics.n}): wrong-play ${pct(withCi.metrics.wrong_play_rate)} ${ciText(withCi.ci.wrong_play)} | ask ${pct(withCi.metrics.ask_rate)} | top-1 ${pct(withCi.metrics.top1_accuracy)} | errors ${withCi.metrics.error_count}`,
    );
  } finally {
    await server.stop();
    log(`server pid ${server.pid} stopped`);
  }
}

function runCountFor(): number {
  const path = join(EVAL_DIR, "results.json");
  if (!existsSync(path)) return 0;
  try {
    const prev = JSON.parse(readFileSync(path, "utf8")) as { run_count?: number };
    return typeof prev.run_count === "number" ? prev.run_count : 0;
  } catch {
    return 0;
  }
}

async function cmdRun(): Promise<void> {
  // 1. Corpus locks (deterministic).
  cmdCorpus();
  const entries: CorpusEntry[] = assembleCorpus();
  const heldout = readLockFile(HELDOUT_LOCK);
  const tune = readLockFile(CORPUS_LOCK);
  const corpus = heldout.entries; // FULL evaluation runs on heldout ONLY.

  // 2. Baseline B (offline, same catalog).
  const catalog = loadCatalogTracks(REPLAY_CATALOG);
  const catalogEntryCount = (
    JSON.parse(readFileSync(REPLAY_CATALOG, "utf8")) as { entries?: unknown[] }
  ).entries?.length ?? 0;
  log(`baseline B: offline token-match over ${catalog.length} replay catalog titles (${catalogEntryCount} captured keys)`);

  // 3. Spawn the replay-only server on a random free port.
  const server = await spawnReplayServer();
  log(`server up: ${server.baseUrl} (pid ${server.pid}, replay-only)`);
  const runAt = new Date().toISOString();
  const runCount = runCountFor() + 1;
  let omniRows: EvalRow[];
  let baselineARows: EvalRow[];
  try {
    const omni = await runOmniBeatPass(server, corpus, (done, total) => {
      if (done % 10 === 0 || done === total) log(`  omnibeat pass: ${done}/${total}`);
    });
    omniRows = omni.rows;
    log(`omnibeat pass done (tool errors: ${omni.toolErrors})`);

    const naive = await runBaselineAPass(server, corpus, (done, total) => {
      if (done % 10 === 0 || done === total) log(`  baseline A pass: ${done}/${total}`);
    });
    baselineARows = naive.rows;
    log(`baseline A (naive first-hit) pass done (tool errors: ${naive.toolErrors})`);
  } finally {
    await server.stop();
    log(`server pid ${server.pid} stopped; last 20 lines of server output follow`);
    log(server.outputLog().split("\n").slice(-20).join("\n"));
  }

  const baselineBRows = corpus.map((entry) => baselineBRow(entry, catalog));

  // 4. Metrics + seeded bootstrap CIs.
  // Coverage denominator honesty: an utterance whose expected title could NOT
  // be captured live (eval/coverage-gaps.json, written by expand-catalog.mjs)
  // is unanswerable for every system in replay-only mode. It is excluded from
  // the answerable-coverage DENOMINATOR only (metrics keep the full heldout
  // N), and the exclusion + count is reported verbatim.
  const gaps = loadCoverageGaps();
  const catalogTitles = new Set(catalog.map((t) => normalizeTitle(t.title)));
  const isGapRow = (e: CorpusEntry): boolean =>
    gaps.gapTitleNorms.has(normalizeTitle(e.expect)) && !catalogTitles.has(normalizeTitle(e.expect));
  const excludedRows = corpus.filter(isGapRow);
  const denominatorRows = corpus.filter((e) => !isGapRow(e));
  if (denominatorRows.length === 0) {
    throw new Error("answerable denominator is empty after capture-gap exclusions - cannot report coverage honestly");
  }
  const answerableCount = denominatorRows.filter((e) => catalogTitles.has(normalizeTitle(e.expect))).length;
  const excludedTitles = [...new Set(excludedRows.map((e) => e.expect))].sort((a, b) => a.localeCompare(b));
  const results: SystemResult[] = [
    { name: "OmniBeat", withCi: metricsWithCi(omniRows) },
    { name: "Baseline A (naive first-hit)", withCi: metricsWithCi(baselineARows) },
    { name: "Baseline B (token top-1)", withCi: metricsWithCi(baselineBRows) },
  ];

  // 5. Report artifacts.
  const fixtureCounts = packSummary();
  const input: ReportInput = {
    runAt,
    runCount,
    splitName: "heldout",
    totalCorpus: entries.length,
    tuneSize: tune.entry_count,
    heldoutSize: heldout.entry_count,
    corpusSha256: corpusContentSha256(entries),
    heldoutSha256: heldout.corpus_sha256,
    fixtureCounts,
    replayCatalogEntries: catalogEntryCount,
    replayCatalogTitles: catalog.length,
    answerable: {
      total: denominatorRows.length,
      withCatalogTitle: answerableCount,
      excluded: excludedRows.length,
      fullTotal: corpus.length,
      excludedTitles,
    },
    coverageGaps: gaps.present
      ? { generatedAt: gaps.generatedAt, method: gaps.method, titles: gaps.gapTitles }
      : null,
    serverPid: server.pid,
    results,
    rowsBySystem: {
      "OmniBeat": omniRows,
      "Baseline A (naive first-hit)": baselineARows,
      "Baseline B (token top-1)": baselineBRows,
    },
    toolErrors: {
      "OmniBeat": omniRows.filter((r) => r.error !== undefined).length,
      "Baseline A (naive first-hit)": baselineARows.filter((r) => r.error !== undefined).length,
      "Baseline B (token top-1)": baselineBRows.filter((r) => r.error !== undefined).length,
    },
  };
  writeReports(buildReport(input), buildResultsJson(input));

  log("");
  log(`heldout split N=${heldout.entry_count} (tune split ${tune.entry_count} unused by this run)`);
  log(
    `answerable coverage: ${answerableCount}/${denominatorRows.length} (${pct(answerableCount / denominatorRows.length)}) of heldout utterances have their expected title in the replay catalog`,
  );
  if (excludedRows.length > 0) {
    log(
      `  ${excludedRows.length} heldout utterance(s) excluded from the coverage denominator: their expected title could not be captured live (titles: ${excludedTitles.map((t) => `"${t}"`).join(", ")}); exact upstream errors in eval/coverage-gaps.json`,
    );
  }
  log(buildTable(results));
  log("");
  const omniWp = results[0]!.withCi.metrics.wrong_play_rate;
  const aWp = results[1]!.withCi.metrics.wrong_play_rate;
  if (omniWp === aWp) log(`VERDICT: OmniBeat TIES baseline A on wrong-play rate (${pct(omniWp)}). Reported as measured.`);
  else if (omniWp < aWp) log(`VERDICT: OmniBeat beats baseline A on wrong-play rate (${pct(omniWp)} vs ${pct(aWp)}).`);
  else log(`VERDICT: OmniBeat does NOT beat baseline A on wrong-play rate (${pct(omniWp)} vs ${pct(aWp)}). Reported as measured.`);
  log(`report: ${join(EVAL_DIR, "report.md")}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "run";
  if (command === "corpus") {
    cmdCorpus();
  } else if (command === "tune") {
    await cmdTune();
  } else if (command === "run") {
    await cmdRun();
  } else {
    log(`unknown command: ${command} (expected corpus | tune | run)`);
    process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`eval harness FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
