/**
 * Coverage gaps (eval/coverage-gaps.json).
 *
 * Written by services/omnibeat-mcp/scripts/expand-catalog.mjs whenever a
 * corpus expected title could NOT be captured from the live upstreams (iTunes
 * Search / MusicBrainz WS/2) - with the exact upstream error or status.
 *
 * Honesty contract: an utterance whose expected title is a recorded gap is
 * unanswerable by construction for EVERY system in replay-only mode (no
 * system can return a track that is not in the catalog). The report excludes
 * exactly those utterances from the answerable-coverage DENOMINATOR and says
 * how many it excluded; no metric is computed on a faked denominator, and a
 * failed capture is never papered over by inventing a catalog row.
 *
 * A missing file means "no capture has recorded gaps": every utterance stays
 * in the denominator (the old, fully-conservative behaviour).
 */
import { existsSync, readFileSync } from "node:fs";
import { normalizeTitle } from "./metrics.js";
import { COVERAGE_GAPS } from "./paths.js";

export const COVERAGE_GAPS_SCHEMA = "omnibeat.eval-coverage-gaps.v1";

export interface CoverageGap {
  expected_title: string;
  normalized?: string;
  heldout_rows?: number;
  tune_rows?: number;
  note?: string;
  /** Exact upstream errors/statuses captured per provider (free-form, kept verbatim). */
  upstream?: unknown;
}

export interface CoverageGapsFile {
  schema: string;
  generated_at?: string;
  method?: string;
  expected_titles_total?: number;
  expected_titles_covered?: number;
  gaps: CoverageGap[];
}

export interface LoadedCoverageGaps {
  path: string;
  present: boolean;
  generatedAt: string | null;
  method: string | null;
  /** Normalized expected titles that could NOT be captured (excluded from the denominator). */
  gapTitleNorms: ReadonlySet<string>;
  /** Display titles of the gaps (sorted). */
  gapTitles: string[];
}

export function loadCoverageGaps(path: string = COVERAGE_GAPS): LoadedCoverageGaps {
  if (!existsSync(path)) {
    return { path, present: false, generatedAt: null, method: null, gapTitleNorms: new Set(), gapTitles: [] };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CoverageGapsFile;
  if (parsed.schema !== COVERAGE_GAPS_SCHEMA) {
    throw new Error(`${path}: unexpected schema ${parsed.schema} (expected ${COVERAGE_GAPS_SCHEMA})`);
  }
  const gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
  return {
    path,
    present: true,
    generatedAt: parsed.generated_at ?? null,
    method: parsed.method ?? null,
    gapTitleNorms: new Set(gaps.map((g) => normalizeTitle(g.expected_title))),
    gapTitles: gaps.map((g) => g.expected_title).sort((a, b) => a.localeCompare(b)),
  };
}
