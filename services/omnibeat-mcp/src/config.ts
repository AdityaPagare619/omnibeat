/**
 * Server configuration - blueprint 8.8 "Configuration, not code".
 *
 * The typed config object itself comes from @omnibeat/schemas
 * (`defaultConfig()` = blueprint defaults, strict Zod). This module only adds
 * the *runtime* wiring the schemas package deliberately does not own:
 * environment parsing (B-INFRA owns this in production; this is the lab
 * implementation, kept tiny and explicit) and lab-only switches.
 *
 * Env vars parsed here:
 *  - OMNIBEAT_CONFIG_JSON           full JSON override of the typed config
 *                                   (reserved key, schemas envOverrideKeys)
 *  - OMNIBEAT_ALLOWED_ORIGINS       comma list (envOverrideKeys)
 *  - OMNIBEAT_MUSICBRAINZ_RPS       number  (envOverrideKeys)
 *  - OMNIBEAT_REQUIRE_BEARER_AUTH   "1"/"true" (envOverrideKeys)
 *  - OMNIBEAT_BEARER_TOKEN          token checked when auth is required
 *                                   (secret comes from env, never the repo)
 *  - OMNIBEAT_HOST / OMNIBEAT_PORT  bind address (default 127.0.0.1:8080)
 *  - OMNIBEAT_DB_PATH               SQLite file (default data/sessions.db)
 *  - OMNIBEAT_REPLAY_ONLY           lab-only: never hit the network, serve
 *                                   fixtures/catalog-replay exclusively.
 *                                   NOT part of the typed config contract -
 *                                   it exists for offline demo/eval runs and
 *                                   every result served from it is badged
 *                                   REPLAY.
 */
import { defaultConfig, omnibeatConfigSchema, type OmnibeatConfig } from "@omnibeat/schemas";

export interface LabConfig {
  base: OmnibeatConfig;
  host: string;
  port: number;
  dbPath: string;
  replayOnly: boolean;
  requireBearerAuth: boolean;
  bearerToken: string | undefined;
  allowedOrigins: string[];
}

function bool(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function csv(value: string | undefined): string[] | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LabConfig {
  let base: OmnibeatConfig = defaultConfig();

  // Full config override first; individual keys win over it (last write wins).
  const rawOverride = env.OMNIBEAT_CONFIG_JSON;
  if (rawOverride && rawOverride.trim() !== "") {
    try {
      const parsed = omnibeatConfigSchema.safeParse(JSON.parse(rawOverride));
      if (parsed.success) {
        base = parsed.data;
      } else {
        throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
    } catch (err) {
      throw new Error(`OMNIBEAT_CONFIG_JSON is invalid: ${(err as Error).message}`);
    }
  }

  const origins = csv(env.OMNIBEAT_ALLOWED_ORIGINS);
  if (origins) base.security.allowedOrigins = origins;

  const rps = env.OMNIBEAT_MUSICBRAINZ_RPS;
  if (rps !== undefined && rps.trim() !== "") {
    const n = num(rps, base.rateLimits.musicBrainzRequestsPerSecond);
    if (n > 0) base.rateLimits.musicBrainzRequestsPerSecond = n;
  }

  const requireAuth = env.OMNIBEAT_REQUIRE_BEARER_AUTH;
  const auth = requireAuth !== undefined ? bool(requireAuth) : base.security.requireBearerAuth;

  return {
    base,
    host: env.OMNIBEAT_HOST?.trim() || "127.0.0.1",
    port: num(env.OMNIBEAT_PORT, 8080),
    dbPath: env.OMNIBEAT_DB_PATH?.trim() || "data/sessions.db",
    replayOnly: bool(env.OMNIBEAT_REPLAY_ONLY),
    requireBearerAuth: auth,
    bearerToken: env.OMNIBEAT_BEARER_TOKEN,
    allowedOrigins: base.security.allowedOrigins,
  };
}
