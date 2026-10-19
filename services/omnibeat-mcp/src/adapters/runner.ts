/**
 * S1 candidate generation + S2 fusion (blueprint 6.1).
 *
 *  - Providers are called IN PARALLEL, each with its own AbortController
 *    (child of the 1,500 ms deadline signal) and a hard per-source cap of
 *    config.latency.candidateGeneration (600 ms): a slow source never blocks
 *    the others and never outlives its budget.
 *  - HEDGED TIMEOUT (soft cutoff): at config.latency.hedge (250 ms) the runner
 *    records `hedgedAtMs` once at least one source has settled - from then on
 *    scoring may proceed with what has arrived, while pending sources keep
 *    running to their cap. We deliberately do NOT fire duplicate requests:
 *    iTunes documents ~20 req/min (CLM-MUS-001) and MusicBrainz enforces
 *    1 req/s (CLM-MUS-005), so hedged duplicates would spend the upstream
 *    budget we are required to respect. Both adapters declare hedgeable:false
 *    for that reason; the local replay adapter is the only hedgeable source.
 *  - REPLAY-ON-MISS: if (and only if) no live source returned a hit, the replay
 *    cache is consulted (blueprint 4.2 badges, AC-14). With
 *    OMNIBEAT_REPLAY_ONLY=1 the live sources are not called at all.
 */
import type { LabConfig } from "../config.js";
import { log } from "../logging.js";
import { tokenize } from "../resolver/scoring.js";
import { createItunesAdapter } from "./itunes.js";
import { createMusicBrainzAdapter } from "./musicbrainz.js";
import { createReplayAdapter } from "./replay.js";
import type { Adapter, AdapterOutcome, Hit, ProviderName } from "./types.js";

export interface FusedCandidate {
  /** Best row for this track (LIVE preferred over REPLAY). */
  hit: Hit;
  /** Number of DISTINCT upstream origins that returned it (0..3). */
  agreement: number;
  /** Mean provider-order rank across the origins that returned it (tie-break). */
  avgRank: number;
  origins: string[];
}

export interface GenerationResult {
  outcomes: AdapterOutcome[];
  fused: FusedCandidate[];
  /** ms at which the soft hedge cutoff fired (undefined = never). */
  hedgedAtMs?: number;
  replayOnly: boolean;
  usedReplayFallback: boolean;
  elapsedMs: number;
}

function skipped(provider: ProviderName, detail: string): AdapterOutcome {
  return { provider, badge: "FIXTURE", ok: false, hits: [], latencyMs: 0, errorKind: "skipped", detail };
}

/** Per-source hard timeout: abort the fetch and report a timeout honestly. */
async function withSourceBudget(
  adapter: Adapter,
  query: string,
  limit: number,
  parentSignal: AbortSignal,
  budgetMs: number,
): Promise<AdapterOutcome> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (parentSignal.aborted) controller.abort();
  else parentSignal.addEventListener("abort", onParentAbort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, budgetMs);

  try {
    const outcome = await adapter.search({ query, limit, signal: controller.signal });
    if (timedOut && outcome.errorKind === "timeout") {
      return {
        ...outcome,
        detail: `hard source budget ${budgetMs} ms exceeded (config.latency.candidateGeneration)`,
      };
    }
    return outcome;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}

/**
 * S2 fusion: group hits by normalized title+artist, count DISTINCT origins as
 * source agreement, average provider-order rank for tie-breaking. LIVE rows win
 * over REPLAY rows inside a group so the emitted candidate is never a cached
 * duplicate when the live row exists.
 */
export function fuseHits(outcomes: AdapterOutcome[], providerOrder: ProviderName[]): FusedCandidate[] {
  const orderIndex = (p: ProviderName): number => {
    const i = providerOrder.indexOf(p);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  const groups = new Map<string, { hits: { hit: Hit; rank: number }[] }>();
  for (const outcome of outcomes) {
    outcome.hits.forEach((hit, index) => {
      // Group key: normalized title + FIRST artist token. Blueprint 6.1 S2 wants
    // dedupe by MB id / ISRC / normalised title+artist; we have no shared id
    // across iTunes and MusicBrainz, and full-artist-string equality fails
    // whenever the two sources order a credit differently (verified on the
    // captured fixtures: "Raja Ji (Insta Mix)" lists four artists in two
    // different orders). Title + lead artist merges those without collapsing
    // genuinely different songs that share a title.
    const titleKey = tokenize(hit.track.title).join(" ");
    const leadArtist = tokenize(hit.track.artist)[0] ?? "";
    const key = `${titleKey}|${leadArtist}`;
      if (titleKey.length === 0) return;
      let group = groups.get(key);
      if (!group) {
        group = { hits: [] };
        groups.set(key, group);
      }
      // Same row delivered twice by the same provider counts once.
      const duplicate = group.hits.some(
        (h) => h.hit.track.candidate_id === hit.track.candidate_id && h.hit.origin === hit.origin,
      );
      if (!duplicate) group.hits.push({ hit, rank: orderIndex(hit.source) + index });
    });
  }

  const fused: FusedCandidate[] = [];
  for (const group of groups.values()) {
    const sorted = [...group.hits].sort((a, b) => {
      const badgeRank = (h: Hit): number => (h.badge === "LIVE" ? 0 : 1);
      if (badgeRank(a.hit) !== badgeRank(b.hit)) return badgeRank(a.hit) - badgeRank(b.hit);
      return a.rank - b.rank;
    });
    const best = sorted[0];
    if (!best) continue;
    const origins = [...new Set(group.hits.map((h) => h.hit.origin))];
    fused.push({
      hit: best.hit,
      agreement: origins.length,
      avgRank: group.hits.reduce((acc, h) => acc + h.rank, 0) / group.hits.length,
      origins,
    });
  }
  fused.sort((a, b) => a.avgRank - b.avgRank);
  return fused;
}

export async function generateCandidates(opts: {
  query: string;
  limit: number;
  cfg: LabConfig;
  signal: AbortSignal;
}): Promise<GenerationResult> {
  const started = Date.now();
  const { query, limit, cfg, signal } = opts;
  const base = cfg.base;
  const providerOrder = [...base.sources.providerOrder];
  const enabled = base.sources.sourceEnabled;
  const outcomes: AdapterOutcome[] = [];

  const liveAdapters: { provider: ProviderName; adapter: Adapter }[] = [];
  for (const provider of providerOrder) {
    if (provider === "deezer") {
      outcomes.push(
        skipped(provider, "adapter not shipped in P1: demoted/off by default (DEC-0010, CLM-MUS-010..013)"),
      );
      continue;
    }
    if (provider === "autocomplete") {
      outcomes.push(skipped(provider, "kill-switch off by default (blueprint 8.4, CLM-MUS-003 family)"));
      continue;
    }
    if (provider === "itunes") {
      if (!enabled.itunes) {
        outcomes.push(skipped(provider, "sourceEnabled.itunes=false"));
        continue;
      }
      liveAdapters.push({ provider, adapter: createItunesAdapter() });
      continue;
    }
    if (provider === "musicbrainz") {
      if (!enabled.musicbrainz) {
        outcomes.push(skipped(provider, "sourceEnabled.musicbrainz=false"));
        continue;
      }
      liveAdapters.push({
        provider,
        adapter: createMusicBrainzAdapter(() => base.rateLimits.musicBrainzRequestsPerSecond),
      });
      continue;
    }
    if (provider === "fixtures") {
      if (!enabled.fixtures) outcomes.push(skipped(provider, "sourceEnabled.fixtures=false"));
      // Consulted either exclusively (replayOnly) or as fallback on miss.
    }
  }

  const replayAdapter = enabled.fixtures ? createReplayAdapter() : undefined;

  // --- replay-only mode: never touch the network ---------------------------
  if (cfg.replayOnly) {
    for (const { provider } of liveAdapters) {
      outcomes.push(skipped(provider, "OMNIBEAT_REPLAY_ONLY=1 (lab flag): network not called"));
    }
    if (replayAdapter) {
      outcomes.push(await replayAdapter.search({ query, limit, signal }));
    }
    return {
      outcomes,
      fused: fuseHits(outcomes, providerOrder),
      replayOnly: true,
      usedReplayFallback: replayAdapter !== undefined,
      elapsedMs: Date.now() - started,
    };
  }

  // --- live parallel generation with hedged soft cutoff --------------------
  const budget = base.latency.candidateGeneration;
  let hedgedAtMs: number | undefined;
  let settleCount = 0;
  let total = liveAdapters.length;

  const hedgeTimer = setTimeout(() => {
    if (hedgedAtMs === undefined && settleCount > 0 && settleCount < total) {
      hedgedAtMs = Date.now() - started;
    }
  }, base.latency.hedge);

  const pending = liveAdapters.map(async ({ provider, adapter }) => {
    const outcome = await withSourceBudget(adapter, query, limit, signal, budget);
    settleCount += 1;
    if (hedgedAtMs === undefined && settleCount >= 1 && settleCount < total) {
      hedgedAtMs = Date.now() - started;
    }
    log.debug("source_outcome", {
      provider,
      ok: outcome.ok,
      hits: outcome.hits.length,
      latency_ms: outcome.latencyMs,
      error_kind: outcome.errorKind,
      detail: outcome.detail,
    });
    return outcome;
  });

  const settled = await Promise.all(pending);
  clearTimeout(hedgeTimer);
  outcomes.push(...settled);

  const liveHitCount = settled.reduce((acc, o) => acc + o.hits.length, 0);

  // --- replay on network miss ---------------------------------------------
  let usedReplayFallback = false;
  if (replayAdapter && liveHitCount === 0) {
    usedReplayFallback = true;
    const outcome = await replayAdapter.search({ query, limit, signal });
    log.info("replay_fallback_used", {
      reason:
        settled.length === 0
          ? "no live source available"
          : settled
              .map((o) => `${o.provider}:${o.errorKind ?? (o.ok ? "empty" : "failed")}`)
              .join(","),
    });
    outcomes.push(outcome);
  }

  const result: GenerationResult = {
    outcomes,
    fused: fuseHits(outcomes, providerOrder),
    replayOnly: false,
    usedReplayFallback,
    elapsedMs: Date.now() - started,
  };
  if (hedgedAtMs !== undefined) result.hedgedAtMs = hedgedAtMs;
  return result;
}
