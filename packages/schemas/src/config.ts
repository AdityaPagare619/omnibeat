/**
 * Typed configuration — blueprint §6.1 (stage budgets), §6.2 (decision policy),
 * §6.6 (client breaker), §6.7 (alias TTL), §7.1 (shipped locales), §8.1–§8.5
 * (TTLs, breakers, flags, rate limits), §8.8 ("Configuration, not code":
 * thresholds, timeouts, flags and provider order come from a typed config with
 * environment overrides; the eval harness reads the same config).
 *
 * Every default below is blueprint-sourced; values the blueprint does NOT
 * ship are labelled "CONTRACT DRAFT" and listed in docs/ARCHITECTURE.md.
 * Nothing here is read from the environment by this package — B-INFRA owns
 * the env parsing against `envOverrideKeys`.
 */
import { z } from "zod";

const threshold = z
  .object({
    /** Minimum calibrated confidence to auto-play (§6.2). */
    tPlay: z.number().min(0).max(1),
    /** Required margin between top-1 and top-2 (§6.2). */
    m: z.number().min(0).max(1),
  })
  .strict();

const stageBudgets = z
  .object({
    peel: z.number().int().min(0), // §6.1 S0: 2 ms
    candidateGeneration: z.number().int().min(0), // §6.1 S1: 600 ms hard timeout
    hedge: z.number().int().min(0), // §6.1 S1: hedge the slowest source after 250 ms
    fusion: z.number().int().min(0), // §6.1 S2: 5 ms
    phonetic: z.number().int().min(0), // §6.1 S3: 10 ms
    versionSafety: z.number().int().min(0), // §6.1 S4: 3 ms
    score: z.number().int().min(0), // §6.1 S5: 1 ms
    decision: z.number().int().min(0), // §6.1 S6: 1 ms
    evidence: z.number().int().min(0), // §6.1 S7: 1 ms
    totalDeadline: z.number().int().min(1), // §6.1: 1,500 ms hard deadline
  })
  .strict();

export const omnibeatConfigSchema = z
  .object({
    decision: z
      .object({
        thresholds: z
          .object({
            screen: threshold.default({ tPlay: 0.85, m: 0.25 }), // §6.2 table
            screenless: threshold.default({ tPlay: 0.88, m: 0.30 }), // §6.2 table
            tv: threshold.default({ tPlay: 0.85, m: 0.25 }), // §6.2 table
            kids: threshold.default({ tPlay: 0.93, m: 0.35 }), // §6.2 table (kids profile override)
            tCover: z
              .number()
              .min(0)
              .max(1)
              .default(0.7), // CONTRACT DRAFT: §6.2 defines T_cover ("cumulative p(top-3) >= T_cover") but ships no value; 0.70 is a placeholder until the eval sweep publishes the curve (§6.2). AMBIGUITY flagged to ORCH.
            askMaxCandidates: z.literal(3).default(3), // Appendix A candidates maxItems 3
          })
          .default({}),
      })
      .default({}),
    latency: stageBudgets.default({
      peel: 2,
      candidateGeneration: 600,
      hedge: 250,
      fusion: 5,
      phonetic: 10,
      versionSafety: 3,
      score: 1,
      decision: 1,
      evidence: 1,
      totalDeadline: 1500,
    }),
    serverCircuitBreaker: z
      .object({
        failureThreshold: z.number().int().min(1).default(5), // §8.4: open after 5 failures in 30 s
        windowMs: z.number().int().min(1).default(30_000),
        halfOpenProbeMs: z.number().int().min(1).default(15_000), // §8.4: half-open probe every 15 s
      })
      .default({}),
    clientCircuitBreaker: z
      .object({
        rttLimitMs: z.number().int().min(1).default(1200), // §6.6: RTT > 1,200 ms
        probeCount: z.number().int().min(1).default(5), // §6.6: 3 of 5 probes
        failThresholdInWindow: z.number().int().min(1).default(3),
        consecutiveFailuresToOpen: z.number().int().min(1).default(2), // §6.6: 2 consecutive failures
        successesToClose: z.number().int().min(1).default(3), // §6.6: close after 3 consecutive successes (hysteresis)
      })
      .default({}),
    caches: z
      .object({
        catalogTtlMs: z.number().int().min(1).default(86_400_000), // §8.2: in-memory LRU for catalog responses, TTL 24 h
        negativeTtlMs: z.number().int().min(1).default(600_000), // §8.2: negative caching for not-found, TTL 10 min
        hookEphemeralTtlMs: z
          .number()
          .int()
          .min(1)
          .default(600_000), // CONTRACT DRAFT: §6.4 says "minutes, not stored long-term" without a number
      })
      .default({}),
    memory: z
      .object({
        aliasRetentionDays: z.number().int().min(1).default(90), // §6.7: retention TTL default 90 days
      })
      .default({}),
    flags: z
      .object({
        autocompleteEnabled: z.boolean().default(false), // §8.4: off by default in production, on in the lab
        rerankEnabled: z.boolean().default(false), // §6.1: optional rerank off by default
      })
      .default({}),
    sources: z
      .object({
        sourceEnabled: z
          .object({
            deezer: z.boolean().default(true),
            itunes: z.boolean().default(true),
            musicbrainz: z.boolean().default(true),
            autocomplete: z.boolean().default(false), // unofficial source, kill-switch ships off by default (§0 row 5, §8.4) [VERIFY R-MUSIC-03]
            fixtures: z.boolean().default(true),
          })
          .default({}),
        /** Tie-break / fallback precedence, blueprint §4.1 listing order (ADR-0004). */
        providerOrder: z
          .array(z.enum(["deezer", "itunes", "musicbrainz", "autocomplete", "fixtures"]))
          .default(["deezer", "itunes", "musicbrainz", "autocomplete", "fixtures"]),
      })
      .default({}),
    rateLimits: z
      .object({
        musicBrainzRequestsPerSecond: z
          .number()
          .min(0.01)
          .default(1), // §8.5: MusicBrainz asks for ~1 request/second [VERIFY R-MUSIC-02]
      })
      .default({}),
    /**
     * Shipped locale packs (§7.1: six packs + en-US control). UNSUPPORTED_LOCALE
     * behaviour keys off this list [VERIFY R-AWS-02: recogniser locale support];
     * §7.1 "es-US/MX" read as es-US + es-MX (contract-draft reading).
     */
    supportedLocales: z
      .array(z.string().min(2).max(64))
      .default([
        "hi-IN",
        "en-IN",
        "es-US",
        "es-MX",
        "ko-KR",
        "ja-JP",
        "pt-BR",
        "en-NG",
        "en-ZA",
        "en-US",
      ]),
    security: z
      .object({
        allowedOrigins: z
          .array(z.string())
          .default(["http://localhost:3000", "http://localhost:4000"]), // §5.1: Origin validation (403 on mismatch); localhost in dev
        requireBearerAuth: z.boolean().default(false), // §5.1: bearer-token auth in deployment; off in dev
      })
      .default({}),
  })
  .strict();

export type OmnibeatConfig = z.infer<typeof omnibeatConfigSchema>;

/** Fully-defaulted config (§8.8: the eval harness reads this same object). */
export function defaultConfig(): OmnibeatConfig {
  return omnibeatConfigSchema.parse({});
}

/**
 * Environment override keys this contract reserves (blueprint §8.8).
 * Declaration only — parsing/coercion is owned by B-INFRA.
 */
export const envOverrideKeys = [
  "OMNIBEAT_CONFIG_JSON",
  "OMNIBEAT_AUTOCOMPLETE_ENABLED",
  "OMNIBEAT_RERANK_ENABLED",
  "OMNIBEAT_REQUIRE_BEARER_AUTH",
  "OMNIBEAT_MUSICBRAINZ_RPS",
  "OMNIBEAT_ALLOWED_ORIGINS",
] as const;
export type EnvOverrideKey = (typeof envOverrideKeys)[number];
