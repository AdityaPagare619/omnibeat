/**
 * music_resolve_request pipeline v0 (blueprint 6.1 stages S0..S7) with the
 * 1,500 ms hard deadline (6.1) and the 6.2 decision policy.
 *
 * Contract rules enforced here:
 *  - NEVER throws to the client: every failure becomes an isError tool result
 *    carrying one of the six contract codes + a spoken_prompt (blueprint 5.5).
 *  - At the deadline we return the best result so far with confidence honestly
 *    lowered (multiplied by DEADLINE_CONFIDENCE_FACTOR), recomputing the
 *    decision afterwards - usually demoting play to ask/repair.
 *  - Output is validated against the frozen output schema before it leaves.
 */
import { randomUUID } from "node:crypto";
import {
  type EvidenceEntry,
  type SpokenPrompt,
  type ToolErrorResult,
  type Track,
} from "@omnibeat/schemas";
import {
  musicResolveRequestOutputSchema,
  type MusicResolveRequestInput,
  type MusicResolveRequestOutput,
} from "../contract.js";
import { generateCandidates, type FusedCandidate } from "../adapters/runner.js";
import type { AdapterOutcome } from "../adapters/types.js";
import type { LabConfig } from "../config.js";
import { log, transcriptField } from "../logging.js";
import type { OmniBeatStore } from "../store/store.js";
import { peel } from "./peeler.js";
import { pickPackId, scoreTitlePhonetics, type TitlePhonetics } from "./phonetic.js";
import { decide, scoreCandidate, thresholdsFor, tokenSimilarity, type Decision } from "./scoring.js";

export const DEADLINE_CONFIDENCE_FACTOR = 0.75;

export interface ResolveContext {
  cfg: LabConfig;
  store: OmniBeatStore;
  sessionId: string | undefined;
  /** Lab-only A/B baseline switch (POST /admin/mode). */
  naive: boolean;
  /** Client cancellation (notifications/cancelled) - wired to the deadline
   *  controller so an in-flight resolve releases upstream work immediately
   *  (blueprint 5.1, AC-08). */
  cancelSignal?: AbortSignal;
}

export type ResolveOutcome =
  | { ok: true; output: MusicResolveRequestOutput }
  | { ok: false; error: ToolErrorResult };

const NEUTRAL_ASR_CONFIDENCE = 0.7;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function traceId(): string {
  return `tr_${randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Spoken prompts in three tiers (blueprint 6.5)
// ---------------------------------------------------------------------------

function spokenPlay(track: Track): SpokenPrompt {
  return {
    speak_short: `Playing ${track.title} by ${track.artist}.`,
    speak_normal: `Playing ${track.title} by ${track.artist}. Say stop or next any time.`,
    speak_long: `I'll play ${track.title} by ${track.artist}. You can say stop, next, or the name of another song whenever you like.`,
  };
}

function spokenAsk(candidates: Track[]): SpokenPrompt {
  const first = candidates[0];
  const second = candidates[1];
  const third = candidates[2];
  if (!first) {
    return {
      speak_short: "I didn't find a match.",
      speak_normal: "I didn't find a match. Try another title.",
      speak_long: "I didn't find a match for that. Try saying the title again, or tell me the artist.",
    };
  }
  if (!second) {
    return {
      speak_short: `Did you mean ${first.title} by ${first.artist}?`,
      speak_normal: `I found one match: ${first.title} by ${first.artist}. Is that the one?`,
      speak_long: `I found one match: ${first.title} by ${first.artist}. Say yes to play it, or say the title again if that is not it.`,
    };
  }
  const two = `${first.title} by ${first.artist}, or ${second.title} by ${second.artist}`;
  return {
    speak_short: `Did you mean ${first.title} or ${second.title}?`,
    speak_normal: `I found a couple: ${two}. Which one?`,
    speak_long: third
      ? `I found three: ${two}, or ${third.title} by ${third.artist}. Which one, or say none of these.`
      : `I found a couple: ${two}. Which one, or say none of these.`,
  };
}

function spokenRepair(): SpokenPrompt {
  return {
    speak_short: "I didn't catch that.",
    speak_normal: "I didn't catch the title. Who sings it?",
    speak_long: "I couldn't match that to a song with enough confidence. Say the title again, or tell me the artist, and I'll try once more.",
  };
}

function spokenNotFound(): SpokenPrompt {
  return {
    speak_short: "I couldn't find that.",
    speak_normal: "I couldn't find that song. Try another title, or say the artist's name.",
    speak_long: "I couldn't find that song in the catalog. You can say a different title, or say the artist and I'll look again.",
  };
}

function spokenFor(decision: Decision, track?: Track, candidates?: Track[]): SpokenPrompt {
  if (decision === "play" && track) return spokenPlay(track);
  if (decision === "ask" && candidates && candidates.length > 0) return spokenAsk(candidates);
  if (decision === "repair") return spokenRepair();
  return spokenNotFound();
}

function displayHint(surface: MusicResolveRequestInput["surface"]): "none" | "cards" | "tv_cards" {
  if (surface === "screen") return "cards";
  if (surface === "tv") return "tv_cards";
  return "none";
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  fused: FusedCandidate;
  score: number;
  similarity: number;
  versionMatch: number;
  artistHintMatch: number;
}

export async function resolveRequest(
  input: MusicResolveRequestInput,
  ctx: ResolveContext,
): Promise<ResolveOutcome> {
  const started = Date.now();
  const trace = traceId();
  const resolutionId = `res_${randomUUID()}`;
  const base = ctx.cfg.base;

  // 1,500 ms hard deadline (blueprint 6.1): one AbortController owns all
  // upstream work for this call.
  const deadline = new AbortController();
  let deadlineHit = false;
  let cancelledByClient = false;
  const deadlineTimer = setTimeout(() => {
    deadlineHit = true;
    deadline.abort();
  }, base.latency.totalDeadline);
  const onCancel = () => {
    cancelledByClient = true;
    deadline.abort();
  };
  if (ctx.cancelSignal) {
    if (ctx.cancelSignal.aborted) onCancel();
    else ctx.cancelSignal.addEventListener("abort", onCancel, { once: true });
  }

  try {
    // ---- S0 peel (2 ms budget) --------------------------------------------
    const peelStart = process.hrtime.bigint();
    const peeled = peel(input.transcript, input.locale);
    const peelMs = Number(process.hrtime.bigint() - peelStart) / 1e6;

    const primaryQuery = peeled.peeled;

    // B-PHON swap: locale pack chosen up-front so the peel evidence card can
    // name it; actual title scoring happens after S1 (needs candidates).
    const phoneticPackId = pickPackId(input.transcript, input.locale);

    const evidence: EvidenceEntry[] = [
      {
        source: "heard",
        signal: `raw "${input.transcript}" -> peeled "${primaryQuery}"`,
        weight: 0.1,
      },
      {
        source: "peel",
        signal: `removed [${peeled.removed.join(", ") || "none"}]; stage ${peelMs.toFixed(3)} ms / budget ${base.latency.peel} ms (S0 frame grammar tables; phonetics via @omnibeat/phonetic-core pack ${phoneticPackId})`,
        weight: 0.05,
      },
    ];

    // ---- S1 candidate generation (parallel, hedged, 600 ms per source) -----
    let generation = await generateCandidates({
      query: primaryQuery,
      limit: base.decision.thresholds.askMaxCandidates,
      cfg: ctx.cfg,
      signal: deadline.signal,
    });

    // Blueprint 6.1 S1(b): retry once with the best ASR alternative when the
    // primary query found nothing (bounded: ONE extra sweep, so we stay inside
    // the upstream rate budgets CLM-MUS-001/005).
    const alternatives = input.asr_alternatives ?? [];
    if (
      generation.fused.length === 0 &&
      alternatives.length > 0 &&
      !deadline.signal.aborted &&
      !ctx.cfg.replayOnly
    ) {
      const bestAlt = [...alternatives].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      if (bestAlt) {
        evidence.push({
          source: "asr",
          signal: `primary query empty; retrying generation with best n-best alternative (confidence ${bestAlt.confidence ?? "n/a"})`,
          weight: 0.05,
        });
        const retry = await generateCandidates({
          query: bestAlt.text,
          limit: base.decision.thresholds.askMaxCandidates,
          cfg: ctx.cfg,
          signal: deadline.signal,
        });
        generation = {
          ...retry,
          fused: [...generation.fused, ...retry.fused],
          outcomes: [...generation.outcomes, ...retry.outcomes],
        };
        generation.fused = dedupeFused(generation.fused);
      }
    }

    // ---- source evidence ---------------------------------------------------
    for (const outcome of generation.outcomes) {
      const badge = outcome.badge;
      const signal = outcome.errorKind
        ? `${badge} ${outcome.errorKind}: ${outcome.detail ?? "no detail"} (${outcome.latencyMs} ms)`
        : `${badge} ${outcome.hits.length} hit(s) in ${outcome.latencyMs} ms${outcome.detail ? ` - ${outcome.detail}` : ""}`;
      evidence.push({ source: outcome.provider, signal, weight: outcome.hits.length > 0 ? 0.2 : 0 });
    }
    if (generation.hedgedAtMs !== undefined) {
      evidence.push({
        source: "runner",
        signal: `hedged soft cutoff at ${generation.hedgedAtMs} ms (pending sources kept to their ${base.latency.candidateGeneration} ms cap; no duplicate requests - upstream rate budgets respected)`,
        weight: 0.05,
      });
    }

    // ---- naive baseline branch (lab-only A/B, POST /admin/mode) ------------
    if (ctx.naive) {
      const firstHit = firstProviderHit(generation.outcomes);
      if (!firstHit) {
        const notFoundOutput: MusicResolveRequestOutput = {
          decision: "not_found",
          confidence: 0,
          resolution_id: resolutionId,
          spoken_prompt: spokenFor("not_found"),
          display_hint: displayHint(input.surface),
          evidence: [
            ...evidence,
            { source: "naive-baseline", signal: "admin naive mode: no provider hit at all", weight: 1 },
          ],
          degradation_level: generation.usedReplayFallback || ctx.cfg.replayOnly ? "L2" : "L1",
          trace_id: trace,
        };
        return finish(
          { ok: true, output: notFoundOutput },
          input,
          ctx,
          trace,
          resolutionId,
          [],
          0,
        );
      }
      const naiveOutput: MusicResolveRequestOutput = {
        decision: "play",
        confidence: 1,
        resolution_id: resolutionId,
        track: firstHit.track,
        spoken_prompt: spokenPlay(firstHit.track),
        display_hint: displayHint(input.surface),
        evidence: [
          ...evidence,
          {
            source: "naive-baseline",
            signal: `admin naive mode: FIRST provider hit used verbatim (${firstHit.source}/${firstHit.badge}), confidence forced to 1.0 - stock catalog search A/B baseline`,
            weight: 1,
          },
        ],
        degradation_level: "L0",
        trace_id: trace,
      };
      return finish(
        { ok: true, output: naiveOutput },
        input,
        ctx,
        trace,
        resolutionId,
        [firstHit.track],
        1,
      );
    }

    // ---- S3/S4/S5 score -----------------------------------------------------
    const asrConfidence =
      alternatives.length > 0
        ? alternatives.reduce((acc, a) => acc + (a.confidence ?? NEUTRAL_ASR_CONFIDENCE), 0) /
          alternatives.length
        : NEUTRAL_ASR_CONFIDENCE;

    const similarityQueries = [primaryQuery, ...alternatives.map((a) => a.text)];

    // B-PHON: articulatory phonetic distance of every candidate title against
    // the peeled query + ASR n-best alternatives (pack loaded once at startup).
    const phonetics = scoreTitlePhonetics(
      primaryQuery,
      alternatives.map((a) => a.text),
      generation.fused.map((f) => f.hit.track.title),
      input.locale,
    );
    const phoneticByTitle = new Map<string, TitlePhonetics>(
      phonetics.perTitle.map((p) => [p.title, p]),
    );

    const scored: ScoredCandidate[] = generation.fused.map((fused) => {
      let similarity = 0;
      for (const q of similarityQueries) {
        const s = tokenSimilarity(q, fused.hit.track.title);
        if (s > similarity) similarity = s;
      }

      let versionMatch = 0.5;
      if (peeled.intent.version !== undefined) {
        const v = fused.hit.track.version;
        if (v === peeled.intent.version) versionMatch = 1;
        else if (v === undefined || v === "unknown") versionMatch = 0.5;
        else versionMatch = 0;
      }

      let artistHintMatch = 0.5;
      if (peeled.intent.artistHint !== undefined) {
        const s = tokenSimilarity(peeled.intent.artistHint, fused.hit.track.artist);
        artistHintMatch = s >= 0.6 ? 1 : s >= 0.35 ? 0.5 : 0;
      }

      const phoneticSimilarity = phoneticByTitle.get(fused.hit.track.title)?.similarity;

      const score = scoreCandidate({
        similarity,
        agreement: fused.agreement,
        versionMatch,
        asrConfidence,
        artistHintMatch,
        phoneticSimilarity,
      });
      return { fused, score, similarity, versionMatch, artistHintMatch };
    });

    scored.sort((a, b) => b.score - a.score);
    const ranked = scored.slice(0, 3);

    // ---- deadline / cancellation: honestly lower confidence (6.1) ----------
    let scores = ranked.map((r) => r.score);
    if (deadlineHit || cancelledByClient) {
      scores = scores.map((s) => round3(Math.max(0, s * DEADLINE_CONFIDENCE_FACTOR)));
      evidence.push({
        source: cancelledByClient ? "cancellation" : "deadline",
        signal: cancelledByClient
          ? `notifications/cancelled received mid-pipeline; returning best-so-far with confidence lowered x${DEADLINE_CONFIDENCE_FACTOR} (${ranked.length} candidate(s))`
          : `${base.latency.totalDeadline} ms hard deadline reached; confidence lowered x${DEADLINE_CONFIDENCE_FACTOR} on best-so-far (${ranked.length} candidate(s))`,
        weight: 0.3,
      });
      ranked.forEach((r, i) => {
        r.score = scores[i] as number;
      });
    }

    // ---- S6 decision (6.2 policy, config thresholds) -----------------------
    const thresholds = thresholdsFor(base.decision.thresholds, input.surface, input.profile);
    const outcome = decide(scores, {
      thresholds,
      tCover: base.decision.thresholds.tCover,
      askMaxCandidates: base.decision.thresholds.askMaxCandidates,
    });

    // B-PHON evidence card: pack, per-title distance + winning variant + time.
    if (phonetics.packId !== undefined) {
      const top = scored.slice(0, 3);
      evidence.push({
        source: "local:phonetic",
        signal: `@omnibeat/phonetic-core pack ${phonetics.packId}: ${top
          .map((r) => {
            const p = phoneticByTitle.get(r.fused.hit.track.title);
            return p
              ? `${r.fused.hit.track.candidate_id} d=${p.distance.toFixed(2)} sim=${p.similarity.toFixed(2)} variant "${p.variant}"`
              : `${r.fused.hit.track.candidate_id} n/a`;
          })
          .join("; ") || "no candidates"} (stage ${phonetics.elapsedMs.toFixed(3)} ms / budget 10 ms)`,
        weight: 0.3,
      });
    }

    evidence.push({
      source: "local:scoring",
      signal: `uncalibrated v0 logistic weights: ${ranked
        .map(
          (r) =>
            `${r.fused.hit.track.candidate_id} sim=${r.similarity.toFixed(2)} agree=${r.fused.agreement} p=${r.score.toFixed(3)}`,
        )
        .join("; ") || "no candidates"} (asr=${asrConfidence})`,
      weight: 0.3,
    });
    evidence.push({
      source: "local:decision",
      signal: `play if p1>=${thresholds.tPlay} AND margin>=${thresholds.m}; ask if top3>=${base.decision.thresholds.tCover} (surface=${input.surface}, profile=${input.profile}); got p1=${outcome.confidence.toFixed(3)} margin=${outcome.margin.toFixed(3)} top3=${outcome.top3Sum.toFixed(3)}`,
      weight: 0.1,
    });

    // ---- degradation level --------------------------------------------------
    const anyLiveHit = ranked.some((r) => r.fused.hit.badge === "LIVE");
    let degradation: "L0" | "L1" | "L2" = "L0";
    if (!anyLiveHit) degradation = "L2";
    else if (
      deadlineHit ||
      cancelledByClient ||
      generation.outcomes.some((o) => !o.ok && o.errorKind !== "skipped")
    ) {
      degradation = "L1";
    }

    const tracks = ranked.map((r) => r.fused.hit.track);
    const output: MusicResolveRequestOutput = {
      decision: outcome.decision,
      confidence: round3(outcome.confidence),
      resolution_id: resolutionId,
      spoken_prompt: spokenFor(outcome.decision, tracks[0], tracks),
      display_hint: displayHint(input.surface),
      evidence,
      degradation_level: degradation,
      trace_id: trace,
    };
    if (outcome.decision === "play" && tracks[0]) output.track = tracks[0];
    if (outcome.decision === "ask" || outcome.decision === "repair") {
      if (tracks.length > 0) output.candidates = tracks;
    }

    return finish(
      { ok: true, output },
      input,
      ctx,
      trace,
      resolutionId,
      tracks,
      outcome.confidence,
    );
  } catch (err) {
    // Contract rule: never throw to the client (blueprint 5.5). Map onto the
    // six allowed tool error codes; detail keeps the true cause visible.
    const message = err instanceof Error ? err.message : String(err);
    const aborted = err instanceof Error && (err.name === "AbortError" || deadlineHit);
    const code = "UPSTREAM_TIMEOUT";
    log.error("resolve_internal_error", { trace_id: trace, code, error: message, ...transcriptField(input.transcript) });
    return {
      ok: false,
      error: {
        isError: true,
        code,
        trace_id: trace,
        detail: aborted
          ? `hard deadline reached during pipeline: ${message}`
          : `internal error mapped to nearest contract code UPSTREAM_TIMEOUT: ${message}`,
        spoken_prompt: {
          speak_short: "Something went wrong there.",
          speak_normal: "I couldn't complete that request; want me to try again?",
          speak_long:
            "Something went wrong while I was looking that up. Say try again and I'll run it once more.",
        },
      },
    };
  } finally {
    clearTimeout(deadlineTimer);
    ctx.cancelSignal?.removeEventListener("abort", onCancel);
  }
}

function dedupeFused(fused: FusedCandidate[]): FusedCandidate[] {
  const byKey = new Map<string, FusedCandidate>();
  for (const f of fused) {
    const key = `${f.hit.track.candidate_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, f);
    } else {
      const origins = [...new Set([...existing.origins, ...f.origins])];
      byKey.set(key, {
        ...existing,
        agreement: origins.length,
        origins,
        hit: existing.hit.badge === "LIVE" ? existing.hit : f.hit,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.avgRank - b.avgRank);
}

/** First provider (in providerOrder outcome order) that returned any hit. */
function firstProviderHit(
  outcomes: AdapterOutcome[],
): { track: Track; source: string; badge: string } | undefined {
  for (const outcome of outcomes) {
    const hit = outcome.hits[0];
    if (hit) return { track: hit.track, source: outcome.provider, badge: outcome.badge };
  }
  return undefined;
}

/** Validate against the frozen output schema, persist the resolution row,
 *  log (no transcript at info level) and return. */
function finish(
  result: { ok: true; output: MusicResolveRequestOutput } | { ok: false; error: ToolErrorResult },
  input: MusicResolveRequestInput,
  ctx: ResolveContext,
  trace: string,
  resolutionId: string,
  tracks: Track[],
  confidence: number,
): ResolveOutcome {
  if (result.ok) {
    const parsed = musicResolveRequestOutputSchema.safeParse(result.output);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      log.error("resolve_output_invalid", { trace_id: trace, detail });
      return {
        ok: false,
        error: {
          isError: true,
          code: "UPSTREAM_TIMEOUT",
          trace_id: trace,
          detail: `output failed contract validation: ${detail}`,
          spoken_prompt: {
            speak_short: "Something went wrong there.",
            speak_normal: "I couldn't finish that lookup; try again?",
            speak_long: "I couldn't finish that lookup in a valid form. Say try again and I'll retry.",
          },
        },
      };
    }
  }

  try {
    ctx.store.insertResolution({
      resolution_id: resolutionId,
      session_id: ctx.sessionId ?? null,
      household_id: input.household_id ?? null,
      heard_text: input.transcript,
      alternatives_json: JSON.stringify(input.asr_alternatives ?? []),
      locale: input.locale ?? null,
      surface: input.surface,
      decision: result.ok ? result.output.decision : "error",
      confidence,
      candidates_json: JSON.stringify(tracks.slice(0, 3)),
      trace_id: trace,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    // A store failure must not lose the user's answer: log it, keep serving.
    log.error("resolution_persist_failed", { trace_id: trace, error: String((err as Error)?.message ?? err) });
  }

  log.info("resolve_completed", {
    trace_id: trace,
    resolution_id: resolutionId,
    decision: result.ok ? result.output.decision : "error",
    confidence: result.ok ? result.output.confidence : 0,
    surface: input.surface,
    session_id: ctx.sessionId,
    ...transcriptField(input.transcript),
  });
  return result;
}
