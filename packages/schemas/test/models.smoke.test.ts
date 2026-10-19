/**
 * Smoke test: cross-cutting contract models — error model (§5.5), elicitation
 * (§5.4), trace-bus envelope (§4.1/§11.2), typed config (§6.1/§6.2/§8), and the
 * §5.3 resource/prompt definitions.
 */
import { describe, expect, it } from "vitest";
import {
  defaultConfig,
  elicitationCompleteNotificationSchema,
  elicitationFormRequestSchema,
  elicitationFormResponseSchema,
  disambiguationCompanionSchema,
  envOverrideKeys,
  jsonRpcErrorSchema,
  omnibeatConfigSchema,
  promptDefinitionSchema,
  promptDefinitions,
  resourceDefinitionSchema,
  resourceDefinitions,
  resourceTemplateDefinitionSchema,
  resourceTemplateDefinitions,
  toolErrorCodeSchema,
  toolErrorResultSchema,
  traceEnvelopeSchema,
  urlElicitationRequiredErrorSchema,
} from "../src/index.js";

describe("error model (§5.5)", () => {
  it("exposes exactly the six blueprint tool error codes — no more, no fewer", () => {
    expect([...toolErrorCodeSchema.options].sort()).toEqual(
      [
        "CONSENT_REQUIRED",
        "NO_CONFIDENT_MATCH",
        "SESSION_EXPIRED",
        "UNSUPPORTED_LOCALE",
        "UPSTREAM_RATE_LIMITED",
        "UPSTREAM_TIMEOUT",
      ].sort(),
    );
  });

  it("parses a valid tool error result", () => {
    expect(
      toolErrorResultSchema.safeParse({
        isError: true,
        code: "UPSTREAM_TIMEOUT",
        spoken_prompt: {
          speak_short: "Music service timed out.",
          speak_normal: "I couldn't reach the music service; want your favourites instead?",
          speak_long:
            "I couldn't reach the music service within the time budget; would you like me to play something from your saved favourites instead?",
        },
        trace_id: "trace-1",
        detail: "deezer search exceeded 600ms",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-blueprint tool error code", () => {
    expect(
      toolErrorResultSchema.safeParse({
        isError: true,
        code: "PROVIDER_AUTH_FAILED", // not in blueprint §5.5 — must never appear
        spoken_prompt: { speak_short: "a", speak_normal: "b", speak_long: "c" },
        trace_id: "t",
      }).success,
    ).toBe(false);
  });

  it("parses standard protocol errors and rejects unassigned codes", () => {
    expect(jsonRpcErrorSchema.safeParse({ code: -32602, message: "Invalid params" }).success).toBe(true);
    expect(jsonRpcErrorSchema.safeParse({ code: -32000, message: "made up" }).success).toBe(false);
  });

  it("parses the -32042 URL-elicitation error with elicitationId + url", () => {
    const parsed = urlElicitationRequiredErrorSchema.safeParse({
      code: -32042,
      message: "URL elicitation required",
      data: { elicitationId: "eli-1", url: "https://accounts.example.org/link?state=abc" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("elicitation (§5.4)", () => {
  it("form mode: flat enum-with-titles schema parses", () => {
    const request = {
      method: "elicitation/create",
      params: {
        message: "I found two. Which one?",
        requestedSchema: {
          type: "object",
          properties: {
            choice: {
              type: "string",
              enum: ["bhojpuri", "punjabi", "none_of_these"],
              titles: [
                "Raja Ji, Pawan Singh, Bhojpuri",
                "Raja Ji, Punjabi bass mix",
                "None of these",
              ],
            },
          },
          required: ["choice"],
        },
      },
    };
    expect(elicitationFormRequestSchema.safeParse(request).success).toBe(true);
  });

  it("form mode: non-flat or extra members are rejected", () => {
    const nested = {
      method: "elicitation/create",
      params: {
        message: "Which one?",
        requestedSchema: {
          type: "object",
          properties: {
            choice: { type: "string", enum: ["a"], items: { type: "string" } }, // items = non-flat smuggle
          },
          required: ["choice"],
        },
      },
    };
    expect(elicitationFormRequestSchema.safeParse(nested).success).toBe(false);

    const audio = {
      method: "elicitation/create",
      params: {
        message: "Which one?",
        audio_preview: "https://cdn.example.org/hook.m4a", // audio must NOT travel inside the form (§2 row 9)
        requestedSchema: {
          type: "object",
          properties: { choice: { type: "string", enum: ["a"] } },
          required: ["choice"],
        },
      },
    };
    expect(elicitationFormRequestSchema.safeParse(audio).success).toBe(false);
  });

  it("form response parses; companion carries hooks/artwork OUTSIDE the form", () => {
    expect(
      elicitationFormResponseSchema.safeParse({
        action: "accept",
        content: { choice: "bhojpuri" },
      }).success,
    ).toBe(true);
    expect(
      disambiguationCompanionSchema.safeParse({
        options: [
          {
            choice: "bhojpuri",
            label: "Raja Ji, Pawan Singh, Bhojpuri",
            resource_links: [
              { uri: "omnibeat://hooks/cand-1.m4a", name: "hook-1", mimeType: "audio/mp4" },
            ],
            artwork_url: "https://cdn.example.org/art.jpg",
          },
        ],
      }).success,
    ).toBe(true);
    expect(disambiguationCompanionSchema.safeParse({ options: [] }).success).toBe(false);
  });

  it("URL mode: completion notification parses", () => {
    expect(
      elicitationCompleteNotificationSchema.safeParse({
        method: "notifications/elicitation/complete",
        params: { elicitationId: "eli-1", action: "accept" },
      }).success,
    ).toBe(true);
  });
});

describe("trace-bus envelope", () => {
  const valid = {
    event_id: "42",
    trace_id: "trace-1",
    ts: "2026-10-19T10:00:00Z",
    source: "alexa-lab",
    badge: "LIVE",
    kind: "request",
    direction: "client_to_server",
    mcp: {
      method: "tools/call",
      tool: "music_resolve_request",
      session_id: "sess-1",
      protocol_version: "2025-11-25",
      sse_event_id: "7",
      latency_ms: 320,
      frame: { jsonrpc: "2.0", method: "tools/call", id: 1 },
    },
  };

  it("parses a full inspector event", () => {
    expect(traceEnvelopeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a lying badge or unknown kind (AC-14 surface)", () => {
    expect(traceEnvelopeSchema.safeParse({ ...valid, badge: "MOCK" }).success).toBe(false);
    expect(traceEnvelopeSchema.safeParse({ ...valid, kind: "fabricated" }).success).toBe(false);
  });

  it("rejects unknown members (strict envelope)", () => {
    expect(traceEnvelopeSchema.safeParse({ ...valid, invention: true }).success).toBe(false);
  });
});

describe("typed config (§6.1, §6.2, §8.8)", () => {
  it("parses {} into blueprint default operating point", () => {
    const cfg = defaultConfig();
    expect(cfg.decision.thresholds.screen).toEqual({ tPlay: 0.85, m: 0.25 });
    expect(cfg.decision.thresholds.screenless).toEqual({ tPlay: 0.88, m: 0.3 });
    expect(cfg.decision.thresholds.tv).toEqual({ tPlay: 0.85, m: 0.25 });
    expect(cfg.decision.thresholds.kids).toEqual({ tPlay: 0.93, m: 0.35 });
    expect(cfg.decision.thresholds.askMaxCandidates).toBe(3);
    expect(cfg.latency.totalDeadline).toBe(1500);
    expect(cfg.latency.candidateGeneration).toBe(600);
    expect(cfg.latency.hedge).toBe(250);
    expect(cfg.serverCircuitBreaker).toEqual({
      failureThreshold: 5,
      windowMs: 30_000,
      halfOpenProbeMs: 15_000,
    });
    expect(cfg.clientCircuitBreaker.rttLimitMs).toBe(1200);
    expect(cfg.caches.catalogTtlMs).toBe(86_400_000);
    expect(cfg.caches.negativeTtlMs).toBe(600_000);
    expect(cfg.memory.aliasRetentionDays).toBe(90);
    expect(cfg.flags.autocompleteEnabled).toBe(false);
    expect(cfg.flags.rerankEnabled).toBe(false);
    expect(cfg.sources.sourceEnabled.autocomplete).toBe(false);
    expect(cfg.sources.providerOrder).toEqual([
      "deezer",
      "itunes",
      "musicbrainz",
      "autocomplete",
      "fixtures",
    ]);
    expect(cfg.supportedLocales).toContain("en-US");
    expect(cfg.security.requireBearerAuth).toBe(false);
  });

  it("rejects out-of-range thresholds and unknown keys", () => {
    expect(
      omnibeatConfigSchema.safeParse({ decision: { thresholds: { screen: { tPlay: 1.4, m: 0.2 } } } })
        .success,
    ).toBe(false);
    expect(omnibeatConfigSchema.safeParse({ invented: true }).success).toBe(false);
  });

  it("declares env override keys (§8.8)", () => {
    expect(envOverrideKeys).toContain("OMNIBEAT_CONFIG_JSON");
    expect(envOverrideKeys.every((k) => k.startsWith("OMNIBEAT_"))).toBe(true);
  });
});

describe("resources and prompts (§5.3)", () => {
  it("static resources parse", () => {
    expect(resourceDefinitions).toHaveLength(2);
    for (const r of resourceDefinitions) {
      expect(resourceDefinitionSchema.safeParse(r).success).toBe(true);
    }
  });

  it("resource templates parse; session context is subscribable; hooks are audio", () => {
    expect(resourceTemplateDefinitions).toHaveLength(3);
    for (const t of resourceTemplateDefinitions) {
      expect(resourceTemplateDefinitionSchema.safeParse(t).success).toBe(true);
    }
    const session = resourceTemplateDefinitions.find((t) => t.name === "session-context");
    expect(session?.subscribable).toBe(true);
    const hooks = resourceTemplateDefinitions.find((t) => t.name === "hook-clip");
    expect(hooks?.uriTemplate).toBe("omnibeat://hooks/{candidate_id}.m4a");
    expect(hooks?.mimeType).toBe("audio/mp4");
  });

  it("prompts parse; disambiguation script takes a required locale", () => {
    expect(promptDefinitions).toHaveLength(2);
    for (const p of promptDefinitions) {
      expect(promptDefinitionSchema.safeParse(p).success).toBe(true);
    }
    const script = promptDefinitions.find((p) => p.name === "music_disambiguation_script");
    expect(script?.arguments).toHaveLength(1);
    expect(script?.arguments[0]?.name).toBe("locale");
    expect(script?.arguments[0]?.required).toBe(true);
  });
});
