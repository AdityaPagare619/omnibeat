/**
 * Report writer: eval/report.md + eval/results.json + docs/EVAL_REPORT.md.
 *
 * Honesty rules baked in:
 *  - The intro paragraph states PLAINLY whether OmniBeat beat baseline A on
 *    wrong-play rate. If it did not, the report says so in the first sentence.
 *  - Machine spec, run count, corpus lock hashes and the regenerate command are
 *    always recorded so a reader can reproduce every number.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem, hostname, type } from "node:os";
import { ciText, pct, titlesMatch, type EvalRow, type MetricsWithCi, worstFailures } from "./metrics.js";
import { DOCS_EVAL_REPORT, EVAL_DIR } from "./paths.js";

export interface SystemResult {
  name: string;
  withCi: MetricsWithCi;
}

export interface AnswerableCoverage {
  /** Denominator: heldout utterances minus those excluded by capture gaps. */
  total: number;
  /** Numerator: heldout utterances whose expected title is inside the replay catalog. */
  withCatalogTitle: number;
  /** Heldout rows excluded from `total` because their expected title could not be captured. */
  excluded: number;
  /** Heldout rows before any exclusion (the raw split size). */
  fullTotal: number;
  /** Display titles of the excluded expected titles (sorted, deduped). */
  excludedTitles: string[];
}

export interface ReportInput {
  runAt: string;
  runCount: number;
  splitName: string;
  totalCorpus: number;
  tuneSize: number;
  heldoutSize: number;
  corpusSha256: string;
  heldoutSha256: string;
  fixtureCounts: { locale: string; fixtures: number }[];
  /** Captured catalog KEYS served by the replay adapter. */
  replayCatalogEntries: number;
  /** Unique deduped track titles across those keys (baseline B's candidate universe). */
  replayCatalogTitles: number;
  /** Heldout/tune rows whose EXPECTED title exists in the replay catalog (denominator of "answerable"). */
  answerable: AnswerableCoverage;
  /** eval/coverage-gaps.json as written by expand-catalog.mjs (null when the file is absent). */
  coverageGaps: {
    generatedAt: string | null;
    method: string | null;
    titles: string[];
  } | null;
  serverPid: number;
  results: SystemResult[];
  rowsBySystem: Record<string, EvalRow[]>;
  toolErrors: Record<string, number>;
}

export interface MachineSpec {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemGb: number;
  hostname: string;
  nodeVersion: string;
}

export function machineSpec(): MachineSpec {
  const cpuList = cpus();
  return {
    platform: `${type()} ${process.arch}`,
    arch: process.arch,
    cpuModel: cpuList[0]?.model ?? "unknown",
    cpuCount: cpuList.length,
    totalMemGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    hostname: hostname(),
    nodeVersion: process.version,
  };
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

export function buildTable(results: SystemResult[]): string {
  const head = `| ${pad("system", 30)} | ${padStart("wrong-play (95% CI)", 21)} | ${padStart("ask rate (95% CI)", 19)} | ${padStart("top-1 acc (95% CI)", 20)} | ${padStart("errors", 7)} |`;
  const divider = `|${"-".repeat(32)}|${"-".repeat(23)}|${"-".repeat(21)}|${"-".repeat(22)}|${"-".repeat(9)}|`;
  const lines = results.map((r) => {
    const m = r.withCi.metrics;
    return `| ${pad(r.name, 30)} | ${padStart(`${pct(m.wrong_play_rate)} ${ciText(r.withCi.ci.wrong_play)}`, 21)} | ${padStart(`${pct(m.ask_rate)} ${ciText(r.withCi.ci.ask)}`, 19)} | ${padStart(`${pct(m.top1_accuracy)} ${ciText(r.withCi.ci.top1)}`, 20)} | ${padStart(String(m.error_count), 7)} |`;
  });
  return [head, divider, ...lines].join("\n");
}

export function coverageFraction(cov: AnswerableCoverage): number {
  return cov.total > 0 ? cov.withCatalogTitle / cov.total : 0;
}

/** Wrong auto-plays for one system, in corpus (id) order - used by verdict + diagnostics. */
function wrongPlays(rowsBySystem: Record<string, EvalRow[]>, name: string): EvalRow[] {
  return (rowsBySystem[name] ?? [])
    .filter((r) => r.decision === "play" && (r.chosenTitle === null || !titlesMatch(r.chosenTitle, r.expect)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every utterance where the three systems did not land in the same outcome bucket. */
function divergences(input: ReportInput): { id: string; rows: (EvalRow | undefined)[] }[] {
  const systems = input.results.map((r) => r.name);
  const byId = new Map<string, (EvalRow | undefined)[]>();
  systems.forEach((name, i) => {
    for (const row of input.rowsBySystem[name] ?? []) {
      const arr = byId.get(row.id) ?? new Array<EvalRow | undefined>(systems.length);
      arr[i] = row;
      byId.set(row.id, arr);
    }
  });
  const bucket = (row: EvalRow | undefined): string => {
    if (row === undefined) return "missing";
    if (row.error !== undefined) return "error";
    if (row.decision === "play") {
      return row.chosenTitle !== null && titlesMatch(row.chosenTitle, row.expect) ? "play-correct" : "play-wrong";
    }
    return row.top1Title === null ? "no-candidate" : "candidate";
  };
  return [...byId.entries()]
    .filter(([, rows]) => new Set(rows.map(bucket)).size > 1)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, rows]) => ({ id, rows }));
}

/** Human-readable outcome of one row (shared by the markdown "Why" section and results.json). */
export function describeOutcome(row: EvalRow | undefined): string {
  if (row === undefined) return "no row";
  if (row.error !== undefined) return `ERROR (${row.error})`;
  if (row.decision === "play") {
    return row.chosenTitle !== null && titlesMatch(row.chosenTitle, row.expect)
      ? `played "${row.chosenTitle}"`
      : `played WRONG "${row.chosenTitle}"`;
  }
  if (row.decision === "ask") {
    return row.top1Title === null ? "ask (no candidates)" : `ask (top-1 "${row.top1Title}")`;
  }
  return row.top1Title === null ? `refused (${row.decision})` : `${row.decision} (top-1 "${row.top1Title}")`;
}

export interface DiagnosticSummary {
  answerable_coverage: {
    with_catalog_title: number;
    total: number;
    fraction: number;
    excluded_capture_gaps: number;
    excluded_titles: string[];
  };
  wrong_plays: { system: string; count: number }[];
  divergent_utterances: number;
  /** Rows where BOTH server-driven systems (OmniBeat + Baseline A) saw zero replay candidates. */
  replay_lookup_miss: { count: number; ids: string[] };
  divergences: { id: string; input: string; locale: string; expect: string; outcomes: Record<string, string> }[];
}

/** Structured diagnostics - same computation as buildDiagnostics(), for eval/results.json. */
export function diagnosticSummary(input: ReportInput): DiagnosticSummary {
  const systems = input.results.map((r) => r.name);
  const div = divergences(input);
  // Reachability is a property of the SERVER-side replay lookup, so it is
  // measured on the two server-driven systems only. Baseline B is an offline
  // token matcher over the same catalog - it always scores SOMETHING, so
  // including it would make "no candidate" vacuously rare and the number
  // meaningless.
  const serverSystems = systems.filter((s) => !s.startsWith("Baseline B"));
  const idSet = new Set<string>();
  for (const name of serverSystems) for (const row of input.rowsBySystem[name] ?? []) idSet.add(row.id);
  const lookupMiss: string[] = [];
  for (const id of idSet) {
    const rows = serverSystems.map((name) => (input.rowsBySystem[name] ?? []).find((r) => r.id === id));
    if (rows.every((r) => r !== undefined && r.error === undefined && r.top1Title === null && r.decision !== "play")) {
      lookupMiss.push(id);
    }
  }
  lookupMiss.sort();
  return {
    answerable_coverage: {
      with_catalog_title: input.answerable.withCatalogTitle,
      total: input.answerable.total,
      fraction: coverageFraction(input.answerable),
      excluded_capture_gaps: input.answerable.excluded,
      excluded_titles: input.answerable.excludedTitles,
    },
    wrong_plays: systems.map((name) => ({ system: name, count: wrongPlays(input.rowsBySystem, name).length })),
    divergent_utterances: div.length,
    replay_lookup_miss: { count: lookupMiss.length, ids: lookupMiss },
    divergences: div.map(({ id, rows }) => {
      const first = rows.find((r) => r !== undefined);
      const outcomes: Record<string, string> = {};
      systems.forEach((name, i) => {
        outcomes[name] = describeOutcome(rows[i]);
      });
      return { id, input: first?.input ?? "?", locale: first?.locale ?? "?", expect: first?.expect ?? "?", outcomes };
    }),
  };
}

/**
 * Auto-generated "why" section: every line here is derived from this run's
 * rows (system outcomes per utterance) - nothing is hand-written per run.
 */
export function buildDiagnostics(input: ReportInput): string {
  const systems = input.results.map((r) => r.name);
  const omniName = systems.find((s) => s.startsWith("OmniBeat"));
  const lines: string[] = [];

  lines.push("### Wrong auto-plays, per system (measured)");
  for (const name of systems) {
    const wrong = wrongPlays(input.rowsBySystem, name);
    if (wrong.length === 0) {
      lines.push(`- ${name}: 0 wrong auto-plays.`);
    } else {
      const detail = wrong
        .map((r) => `"${r.input}" [${r.locale}] -> played "${r.chosenTitle}" (expected "${r.expect}")`)
        .join("; ");
      lines.push(`- ${name}: ${wrong.length} wrong auto-play(s) - ${detail}`);
    }
  }

  const div = divergences(input);
  lines.push("");
  lines.push(`### Outcome divergences (${div.length}/${input.answerable.fullTotal} utterances where the systems did not all land in the same bucket)`);
  if (div.length === 0) {
    lines.push("- none: every utterance got the same outcome bucket from all three systems.");
  } else {
    for (const { id, rows } of div.slice(0, 12)) {
      const first = rows.find((r) => r !== undefined);
      const parts = systems.map((name, i) => `${name}: ${describeOutcome(rows[i])}`);
      lines.push(
        `- \`${id}\` [${first?.locale ?? "?"}] "${first?.input ?? "?"}" (expected "${first?.expect ?? "?"}") - ${parts.join(" | ")}`,
      );
    }
    if (div.length > 12) lines.push(`- ...and ${div.length - 12} more divergence(s) (see eval/results.json worst_failures + rerun for the full table).`);
  }

  // Head-to-head: the rows that actually decide the OmniBeat-vs-A claim.
  const h2h = div.filter(({ rows }) => {
    const o = rows[systems.findIndex((s) => s.startsWith("OmniBeat"))];
    const a = rows[systems.findIndex((s) => s.startsWith("Baseline A"))];
    const bucket = (row: EvalRow | undefined): string => {
      if (row === undefined) return "missing";
      if (row.error !== undefined) return "error";
      if (row.decision === "play") {
        return row.chosenTitle !== null && titlesMatch(row.chosenTitle, row.expect) ? "play-correct" : "play-wrong";
      }
      return row.top1Title === null ? "no-candidate" : "candidate";
    };
    return bucket(o) !== bucket(a);
  });
  lines.push("");
  lines.push(`### OmniBeat vs Baseline A head-to-head (${h2h.length}/${input.answerable.fullTotal} utterances where the two server-driven systems landed in different buckets)`);
  if (h2h.length === 0) {
    lines.push("- none: OmniBeat and baseline A agreed on every utterance's outcome bucket.");
  } else {
    const omniRows = input.rowsBySystem[omniName ?? ""] ?? [];
    for (const { id } of h2h.slice(0, 12)) {
      const parts = systems.map((name) => {
        const row = (input.rowsBySystem[name] ?? []).find((r) => r.id === id);
        return `${name}: ${describeOutcome(row)}`;
      });
      const first = omniRows.find((r) => r.id === id);
      lines.push(
        `- \`${id}\` [${first?.locale ?? "?"}] "${first?.input ?? "?"}" (expected "${first?.expect ?? "?"}") - ${parts.join(" | ")}`,
      );
    }
    if (h2h.length > 12) lines.push(`- ...and ${h2h.length - 12} more head-to-head divergence(s) (eval/results.json diagnostics.divergences has all of them).`);
  }

  // Reachability: rows where NEITHER server-driven system saw a replay
  // candidate. Measured on the server systems only - baseline B is an
  // offline token matcher that always scores something, so including it
  // would make this number vacuous. This is the honest "the catalog HAS the
  // title but the peeled query never reached its key" count.
  const serverSystems = systems.filter((s) => !s.startsWith("Baseline B"));
  const idSet = new Set<string>();
  for (const name of serverSystems) for (const row of input.rowsBySystem[name] ?? []) idSet.add(row.id);
  const unreachableIds: string[] = [];
  for (const id of idSet) {
    const rows = serverSystems.map((name) => (input.rowsBySystem[name] ?? []).find((r) => r.id === id));
    if (rows.every((r) => r !== undefined && r.error === undefined && r.top1Title === null && r.decision !== "play")) {
      unreachableIds.push(id);
    }
  }
  unreachableIds.sort();
  lines.push("");
  lines.push(
    `### Replay-lookup reachability: ${unreachableIds.length}/${input.answerable.fullTotal} utterances where BOTH server-driven systems got zero replay candidates`,
  );
  if (unreachableIds.length > 0) {
    const omniRows = input.rowsBySystem[omniName ?? ""] ?? [];
    const sample = unreachableIds.slice(0, 8).map((id) => {
      const row = omniRows.find((r) => r.id === id);
      return row ? `"${row.input}"` : id;
    });
    lines.push(
      `- These transcripts are answerable by catalog coverage (their expected title IS in the catalog) but were never REACHABLE: the replay adapter answers only on an exact normalized key hit or >=0.6 token overlap between the PEELED query and a catalog key. Wake-word/verb residue and misspellings push the peeled query below that bar - e.g. ${sample.join(", ")}${unreachableIds.length > 8 ? ", ..." : ""}. This is a measured resolver-replay-lookup limitation (a peel/normalization gap), NOT a catalog gap; it is reported as-is and is not tuned on heldout.`,
    );
  } else {
    lines.push("- every utterance reached at least one replay candidate for both server-driven systems.");
  }
  return lines.join("\n");
}

export function buildReport(input: ReportInput): string {
  const spec = machineSpec();
  const omni = input.results.find((r) => r.name.startsWith("OmniBeat"));
  const baselineA = input.results.find((r) => r.name.startsWith("Baseline A"));
  const beatsA = omni !== undefined && baselineA !== undefined &&
    omni.withCi.metrics.wrong_play_rate < baselineA.withCi.metrics.wrong_play_rate;
  const tiesA = omni !== undefined && baselineA !== undefined &&
    omni.withCi.metrics.wrong_play_rate === baselineA.withCi.metrics.wrong_play_rate;

  const cov = input.answerable;
  const coverageFrac = coverageFraction(cov);
  const coverageLimited = coverageFrac < 0.8;
  const covText = `${cov.withCatalogTitle}/${cov.total} (${pct(coverageFrac)})`;
  const exclusionText =
    cov.excluded > 0
      ? ` ${cov.excluded} heldout utterance(s) whose expected title could not be captured live are excluded from the denominator (honestly listed: ${cov.excludedTitles.map((t) => `"${t}"`).join(", ")}; see eval/coverage-gaps.json).`
      : "";
  const aWrong = baselineA !== undefined ? wrongPlays(input.rowsBySystem, baselineA.name).length : 0;
  const oWrong = omni !== undefined ? wrongPlays(input.rowsBySystem, omni.name).length : 0;
  const divCount = divergences(input).length;
  // Overlapping bootstrap CIs mean the DIRECTION is measured-this-run, not a
  // significance claim. Stated in the verdict whenever it applies.
  const ciOverlapNote =
    omni !== undefined && baselineA !== undefined
      ? (() => {
          const o = omni.withCi.ci.wrong_play;
          const a = baselineA.withCi.ci.wrong_play;
          const overlaps = o.high >= a.low && a.high >= o.low;
          return overlaps
            ? ` CI note: the 95% bootstrap CIs overlap (OmniBeat ${ciText(o)} vs baseline A ${ciText(a)}), so this is a measured direction on N=${omni.withCi.metrics.n}, not a statistical significance claim.`
            : "";
        })()
      : "";

  const intro = !omni || !baselineA
    ? "SYSTEMS MISSING - table incomplete; no comparison can be claimed."
    : tiesA
      ? coverageLimited
        ? `VERDICT: OmniBeat TIES baseline A (first-hit naive) on wrong-play rate - both ${pct(omni.withCi.metrics.wrong_play_rate)}. OmniBeat does NOT beat baseline A on this metric in this run. The honest reading: only ${covText} of heldout utterances are answerable from the replay catalog, so both server-driven systems mostly refuse (not_found/repair) and neither auto-plays a wrong song.${exclusionText} This tie is an artifact of catalog coverage, not proof of equivalence.`
        : `VERDICT: OmniBeat TIES baseline A (first-hit naive) on wrong-play rate - both ${pct(omni.withCi.metrics.wrong_play_rate)}. Answerable coverage is ${covText}, so this is a MEASURED tie, not a coverage artifact: baseline A auto-played ${aWrong} wrong title(s), OmniBeat ${oWrong}; the systems landed in different outcome buckets on ${divCount}/${cov.fullTotal} utterances (per-utterance breakdown in the "Why" section below).${exclusionText}`
      : beatsA
        ? `VERDICT: OmniBeat BEATS baseline A (first-hit naive) on wrong-play rate (${pct(omni.withCi.metrics.wrong_play_rate)} vs ${pct(baselineA.withCi.metrics.wrong_play_rate)}), at the cost of a ${pct(omni.withCi.metrics.ask_rate)} ask rate. Baseline A auto-plays its first catalog hit regardless of correctness, so on a replay-only catalog every hit that is not the expected title is a wrong play. Answerable coverage: ${covText}.${exclusionText}${ciOverlapNote}`
        : `VERDICT: OmniBeat does NOT beat baseline A on wrong-play rate (${pct(omni.withCi.metrics.wrong_play_rate)} vs ${pct(baselineA.withCi.metrics.wrong_play_rate)}). This is reported as measured - no number here is adjusted, smoothed, or omitted to flatter the system. Answerable coverage: ${covText}.${exclusionText}${ciOverlapNote}`;

  const fixtureLines = input.fixtureCounts
    .map((f) => `${f.locale}: ${f.fixtures} fixtures`)
    .join(", ");

  const worstSections = input.results.map((r) => {
    const rows = input.rowsBySystem[r.name] ?? [];
    const worst = worstFailures(rows, 10);
    const body =
      worst.length === 0
        ? "_No failures recorded for this system._"
        : worst
            .map((row) => {
              const why =
                row.error !== undefined
                  ? `ERROR: ${row.error}`
                  : row.decision === "play"
                    ? `auto-played "${row.chosenTitle}"`
                    : row.top1Title === null
                      ? `refused (${row.decision})`
                      : `asked, top-1 "${row.top1Title}"`;
              return `- \`${row.id}\` [${row.locale}] "${row.input}" -> expected "${row.expect}"; ${why}`;
            })
            .join("\n");
    return `### ${r.name} - worst ${worst.length}\n\n${body}`;
  });

  const toolErrorLines = Object.entries(input.toolErrors)
    .map(([name, count]) => `${name}: ${count} tool-level error row(s) (recorded as failures, not retried away)`)
    .join("\n");

  return `# OmniBeat evaluation report

${intro}

## Run facts (every number here is regenerable)

- Regenerate with: \`node packages/eval/dist/cli.js run\` (builds the service if needed, spawns a replay-only server on a random port, runs all three systems on the ${input.splitName} split, rewrites this file). Catalog coverage is regenerable separately with \`node services/omnibeat-mcp/scripts/expand-catalog.mjs\` (live capture; network required - the eval itself is offline).
- Run at: ${input.runAt} (run count for this corpus state: ${input.runCount})
- Split: hash-based ${input.splitName} split, seed "omnibeat-eval-split-v1"; tune=${input.tuneSize}, heldout=${input.heldoutSize} (total corpus ${input.totalCorpus})
- Corpus sha256: \`${input.corpusSha256}\`
- Heldout lock sha256: \`${input.heldoutSha256}\`
- Fixture seeds: ${fixtureLines}
- Replay catalog served by the server: ${input.replayCatalogEntries} captured keys, ${input.replayCatalogTitles} unique deduped track titles (REPLAY-only mode: no network calls; every catalog row is a captured real upstream response; baseline B ranks over the same ${input.replayCatalogTitles} titles)
- **Answerable coverage: ${cov.withCatalogTitle}/${cov.total} (${pct(coverageFrac)}) heldout utterances have their expected title inside the replay catalog. Denominator: ${cov.fullTotal} heldout utterances${cov.excluded > 0 ? ` minus ${cov.excluded} excluded because their expected title could not be captured live (titles: ${cov.excludedTitles.map((t) => `"${t}"`).join(", ")}; exact upstream errors in eval/coverage-gaps.json, written by services/omnibeat-mcp/scripts/expand-catalog.mjs)` : " with no capture-gap exclusions (eval/coverage-gaps.json has an empty gap list)"}. The remaining ${cov.total - cov.withCatalogTitle} are unanswerable by construction in replay-only mode - no system can return a track that is not in the catalog, so they all land as not_found/repair. Note coverage != reachability: a title can be in the catalog while a misspelled transcript still never reaches its key (see the "Why" section).**
- Server: pid ${input.serverPid}, OMNIBEAT_REPLAY_ONLY=1, random free port, killed after the run
- Bootstrap: 1000 resamples, seeded RNG (mulberry32, seed 20261021); percentile 95% CI

## Machine

- ${spec.platform}, ${spec.cpuCount}x "${spec.cpuModel}", ${spec.totalMemGb} GB RAM, node ${spec.nodeVersion}, host ${spec.hostname}

## Results (${input.splitName} split, N=${input.heldoutSize})

${buildTable(input.results)}

Definitions: wrong-play = decision \`play\` AND normalized chosen title != expected title (a refusal is not a wrong play); ask rate = decision \`ask\`; top-1 accuracy = best ranked title (played track, or candidates[0] on ask) matches expected - misses count against it.

## Why - diagnostic (auto-generated from this run's rows, no hand edits)

${buildDiagnostics(input)}

## Failures (worst 10 per system)

${worstSections.join("\n\n")}

## Tool-level errors

${toolErrorLines || "none"}

## Known gaps

- Replay-only mode serves ${input.replayCatalogEntries} captured catalog keys; the resolver's LIVE provider fusion and hedging paths are NOT exercised here - only the REPLAY adapter answers. Every catalog row is a real captured upstream response, but the run itself makes no network calls.
- Answerable coverage is ${cov.withCatalogTitle}/${cov.total} (${pct(coverageFrac)}) of the ${cov.fullTotal} heldout utterances${cov.excluded > 0 ? ` after excluding ${cov.excluded} utterance(s) whose expected title could not be captured live (listed in eval/coverage-gaps.json with the exact upstream status/errors; nothing was faked into the catalog to hide them)` : " with zero capture-gap exclusions"}. Coverage is not reachability: an utterance whose expected title IS in the catalog can still miss every catalog key if the peeled transcript token-overlaps a key by <0.6 - see the "Why" section's reachability count for how many utterances that actually hit in this run.
- The corpus seeds come from the phonetic packs (37 fixtures, each +1 deterministic variant); heldout N=${input.heldoutSize} is small, so CIs are wide - do not read small deltas as significant without overlapping-CI analysis.
- Thresholds were NOT tuned on heldout. Any threshold change must go through \`node packages/eval/dist/cli.js tune\` (TUNE split only) and be logged as a decision.
`;
}

export interface ResultsJson {
  schema: "omnibeat.eval-results.v1";
  run_at: string;
  run_count: number;
  split: string;
  regenerate_command: "node packages/eval/dist/cli.js run";
  corpus: {
    total: number;
    tune: number;
    heldout: number;
    corpus_sha256: string;
    heldout_sha256: string;
    fixtures: { locale: string; fixtures: number }[];
    replay_catalog_entries: number;
    replay_catalog_titles: number;
    answerable: {
      total: number;
      with_catalog_title: number;
      excluded_capture_gaps: number;
      excluded_titles: string[];
      heldout_total_before_exclusions: number;
    };
    coverage_gaps: { present: boolean; generated_at: string | null; gap_titles: string[] };
  };
  machine: MachineSpec;
  server: { pid: number; replay_only: true; killed_after_run: true };
  bootstrap: { resamples: 1000; seed: 20261021; method: "percentile" };
  systems: {
    name: string;
    n: number;
    wrong_play_rate: number;
    wrong_play_ci95: [number, number];
    ask_rate: number;
    ask_ci95: [number, number];
    top1_accuracy: number;
    top1_ci95: [number, number];
    error_count: number;
  }[];
  verdict: {
    beats_baseline_a_on_wrong_play: boolean;
    ties_baseline_a_on_wrong_play: boolean;
    statement: string;
  };
  /** Same computation as the report's "Why" section (auto-generated from rows). */
  diagnostics: DiagnosticSummary;
  worst_failures: Record<string, EvalRow[]>;
}

export function buildResultsJson(input: ReportInput): ResultsJson {
  const omni = input.results.find((r) => r.name.startsWith("OmniBeat"));
  const baselineA = input.results.find((r) => r.name.startsWith("Baseline A"));
  const beats =
    omni !== undefined && baselineA !== undefined &&
    omni.withCi.metrics.wrong_play_rate < baselineA.withCi.metrics.wrong_play_rate;
  const ties =
    omni !== undefined && baselineA !== undefined &&
    omni.withCi.metrics.wrong_play_rate === baselineA.withCi.metrics.wrong_play_rate;
  const cov = input.answerable;
  const covFrac = coverageFraction(cov);
  const covLimited = covFrac < 0.8;
  const covText = `${cov.withCatalogTitle}/${cov.total} (${pct(covFrac)})`;
  const statement = ties
    ? covLimited
      ? `OmniBeat TIES baseline A on wrong-play rate in this run (both ${((omni?.withCi.metrics.wrong_play_rate ?? 0) * 100).toFixed(1)}%); reported as measured. Caveat: only ${covText} of heldout utterances are answerable from the replay catalog, so this tie is coverage-limited, not evidence of equivalence.`
      : `OmniBeat TIES baseline A on wrong-play rate in this run (both ${((omni?.withCi.metrics.wrong_play_rate ?? 0) * 100).toFixed(1)}%); reported as measured. Answerable coverage is ${covText}, so this is a measured tie at real catalog coverage - see diagnostics for the per-utterance divergence breakdown.`
    : beats
      ? `OmniBeat beats baseline A on wrong-play rate in this run (answerable coverage ${covText}).`
      : `OmniBeat does NOT beat baseline A on wrong-play rate in this run (reported as measured; answerable coverage ${covText}).`;
  return {
    schema: "omnibeat.eval-results.v1",
    run_at: input.runAt,
    run_count: input.runCount,
    split: input.splitName,
    regenerate_command: "node packages/eval/dist/cli.js run",
    corpus: {
      total: input.totalCorpus,
      tune: input.tuneSize,
      heldout: input.heldoutSize,
      corpus_sha256: input.corpusSha256,
      heldout_sha256: input.heldoutSha256,
      fixtures: input.fixtureCounts,
      replay_catalog_entries: input.replayCatalogEntries,
      replay_catalog_titles: input.replayCatalogTitles,
      answerable: {
        total: cov.total,
        with_catalog_title: cov.withCatalogTitle,
        excluded_capture_gaps: cov.excluded,
        excluded_titles: cov.excludedTitles,
        heldout_total_before_exclusions: cov.fullTotal,
      },
      coverage_gaps: {
        present: input.coverageGaps !== null,
        generated_at: input.coverageGaps?.generatedAt ?? null,
        gap_titles: input.coverageGaps?.titles ?? [],
      },
    },
    machine: machineSpec(),
    server: { pid: input.serverPid, replay_only: true, killed_after_run: true },
    bootstrap: { resamples: 1000, seed: 20261021, method: "percentile" },
    systems: input.results.map((r) => ({
      name: r.name,
      n: r.withCi.metrics.n,
      wrong_play_rate: r.withCi.metrics.wrong_play_rate,
      wrong_play_ci95: [r.withCi.ci.wrong_play.low, r.withCi.ci.wrong_play.high],
      ask_rate: r.withCi.metrics.ask_rate,
      ask_ci95: [r.withCi.ci.ask.low, r.withCi.ci.ask.high],
      top1_accuracy: r.withCi.metrics.top1_accuracy,
      top1_ci95: [r.withCi.ci.top1.low, r.withCi.ci.top1.high],
      error_count: r.withCi.metrics.error_count,
    })),
    verdict: {
      beats_baseline_a_on_wrong_play: beats,
      ties_baseline_a_on_wrong_play: ties,
      statement,
    },
    diagnostics: diagnosticSummary(input),
    worst_failures: Object.fromEntries(
      input.results.map((r) => [r.name, worstFailures(input.rowsBySystem[r.name] ?? [], 10)]),
    ),
  };
}

const DOCS_POINTER = `# OmniBeat evaluation

The evaluation report lives next to the corpus locks it was generated from:

- \`eval/report.md\` - human-readable report (verdict first, numbers table, auto "why" diagnostics, worst failures, gaps)
- \`eval/results.json\` - machine-readable results (same run, same numbers, incl. diagnostics)
- \`eval/coverage-gaps.json\` - expected titles that could NOT be captured live (exact upstream errors); those utterances are excluded from the answerable-coverage denominator, never from the metrics
- \`eval/corpus.lock.json\` / \`eval/heldout.lock.json\` - deterministic hash-split corpus locks (sha256 inside)

Regenerate everything with one command from the repo root:

\`\`\`
npm --prefix packages/schemas install && npm --prefix packages/schemas run build
npm --prefix services/omnibeat-mcp install && npm --prefix services/omnibeat-mcp run build
npm --prefix packages/eval install && npm --prefix packages/eval run build
node services/omnibeat-mcp/scripts/expand-catalog.mjs   # live capture: fills catalog gaps (network; idempotent)
node packages/eval/dist/cli.js run
\`\`\`

The harness runs fully offline against the server's REPLAY-only catalog, spawns the server on a random free port, and kills it after the run. If OmniBeat does not beat the naive baseline, \`eval/report.md\` says so in its first paragraph - the harness is not allowed to flatter the system.
`;

export function writeReports(markdown: string, results: ResultsJson): void {
  mkdirSync(EVAL_DIR, { recursive: true });
  writeFileSync(`${EVAL_DIR}/report.md`, markdown, "utf8");
  writeFileSync(`${EVAL_DIR}/results.json`, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  writeFileSync(DOCS_EVAL_REPORT, DOCS_POINTER, "utf8");
}
