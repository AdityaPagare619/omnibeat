/**
 * Smoke test: every one of the eight tools parses a valid example and rejects
 * invalid ones (Charter Part 16 action 7 acceptance).
 *
 * Cases are hand-written from the blueprint (§5.2 rows + Appendix A), not from
 * the schema under test, so a schema regression that widens validation fails here.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  assertRegistryConsistent,
  toolDefinitions,
  toolNames,
  trackSchema,
} from "../src/index.js";

const LONG = (n: number): string => "x".repeat(n);

interface ToolCase {
  validInput: Record<string, unknown>;
  invalidInputs: unknown[];
  validOutput: Record<string, unknown>;
  invalidOutputs: unknown[];
}

const SPOKEN = {
  speak_short: "Playing Raja Ji.",
  speak_normal: "Playing Raja Ji by Pawan Singh.",
  speak_long: "Playing Raja Ji by Pawan Singh, the Bhojpuri version you asked for.",
};

const TRACK: Record<string, unknown> = {
  candidate_id: "cand-1",
  title: "Raja Ji",
  artist: "Pawan Singh",
  language: "bho",
  year: 2016,
  version: "studio",
  canonical_ids: { musicbrainz: "mbid-1", isrc: "INS123456789" },
  artwork_url: "https://example.org/art.jpg",
  untrusted: true,
};

const cases: Record<(typeof toolNames)[number], ToolCase> = {
  music_resolve_request: {
    validInput: { transcript: "play raja ji", surface: "screenless" },
    invalidInputs: [
      {}, // missing required transcript + surface
      { transcript: "play raja ji" }, // missing surface
      { transcript: LONG(301), surface: "tv" }, // Appendix A maxLength 300
      { transcript: "x", surface: "smartphone" }, // enum violation
      { transcript: "x", surface: "tv", asr_alternatives: [{ text: "y" }, { text: "y" }, { text: "y" }, { text: "y" }, { text: "y" }, { text: "y" }] }, // maxItems 5
      { transcript: "x", surface: "tv", bogus: true }, // .strict()
    ],
    validOutput: {
      decision: "play",
      confidence: 0.92,
      resolution_id: "res-1",
      track: TRACK,
      candidates: [TRACK],
      spoken_prompt: SPOKEN,
      display_hint: "cards",
      evidence: [{ source: "musicbrainz", signal: "alias_match", weight: 0.4 }],
      degradation_level: "L0",
      trace_id: "trace-1",
    },
    invalidOutputs: [
      { decision: "guess", confidence: 0.9, spoken_prompt: SPOKEN, trace_id: "t" }, // enum violation
      { decision: "play", confidence: 1.5, spoken_prompt: SPOKEN, trace_id: "t" }, // confidence > 1
      { decision: "play", confidence: 0.9, spoken_prompt: { speak_short: "hi" }, trace_id: "t" }, // tiers not all required members
      { decision: "play", confidence: 0.9, spoken_prompt: SPOKEN }, // missing trace_id
      { decision: "play", confidence: 0.9, spoken_prompt: SPOKEN, trace_id: "t", candidates: [TRACK, TRACK, TRACK, TRACK] }, // maxItems 3
      { decision: "play", confidence: 0.9, spoken_prompt: SPOKEN, trace_id: "t", degradation_level: "L4" }, // frozen L0..L2
      { decision: "play", confidence: 0.9, spoken_prompt: SPOKEN, trace_id: "t", extra: 1 }, // .strict()
    ],
  },
  music_preview_hooks: {
    validInput: { candidate_ids: ["cand-1"] },
    invalidInputs: [
      { candidate_ids: [] }, // min 1
      { candidate_ids: ["cand-1"], max_seconds: 5 }, // §5.2 cap ≤4
      { max_seconds: 3 }, // missing candidate_ids
      { candidate_ids: ["cand-1"], extra: true }, // .strict()
    ],
    validOutput: {
      clips: [
        {
          candidate_id: "cand-1",
          uri: "omnibeat://hooks/cand-1.m4a",
          mimeType: "audio/mp4",
          window: { start_seconds: 4.5, end_seconds: 7.5 },
        },
      ],
      method: "energy-flux-v1",
      confidence: 0.7,
      trace_id: "trace-1",
    },
    invalidOutputs: [
      {
        clips: [{ candidate_id: "c", uri: "u", mimeType: "audio/mp4", window: { start_seconds: 1 } }],
        method: "m",
        confidence: 0.5,
        trace_id: "t",
      }, // window missing end_seconds
      { clips: [], method: "m", confidence: 1.2, trace_id: "t" }, // confidence > 1
      { clips: [], method: "m", confidence: 0.5 }, // missing trace_id
    ],
  },
  music_confirm_selection: {
    validInput: {
      resolution_id: "res-1",
      chosen_candidate_id: "cand-1",
      idempotency_key: "idem-1",
    },
    invalidInputs: [
      { resolution_id: "res-1", chosen_candidate_id: "c" }, // missing idempotency_key (§8.6)
      { resolution_id: "r", chosen_candidate_id: "c", idempotency_key: "k", remember_alias: "yes" }, // not boolean
      { resolution_id: "r", chosen_candidate_id: "c", idempotency_key: "k", rogue: 1 }, // .strict()
    ],
    validOutput: { receipt_id: "rec-1", alias_saved: false, trace_id: "trace-1" },
    invalidOutputs: [
      { receipt_id: "rec-1", alias_saved: "no", trace_id: "t" }, // not boolean
      { receipt_id: "rec-1", alias_saved: false }, // missing trace_id
    ],
  },
  music_explain_last_action: {
    validInput: { household_id: "hh-1", session_id: "sess-1" },
    invalidInputs: [{ household_id: "" }, { session_id: "s", bogus: 1 }],
    validOutput: {
      explanation: "You asked for Raja Ji; two versions matched, you chose the Bhojpuri one.",
      receipt: {
        heard: "play raja ji",
        alternatives: [{ text: "play raja g", confidence: 0.61 }],
        confidence: 0.91,
        trigger: "voice",
        at: "2026-10-19T10:00:00Z",
      },
      trace_id: "trace-1",
    },
    invalidOutputs: [
      {
        explanation: "e",
        receipt: {
          heard: "h",
          alternatives: [],
          confidence: 0.5,
          trigger: "psychic", // enum: voice | routine | external
          at: "2026-10-19T10:00:00Z",
        },
        trace_id: "t",
      },
      {
        explanation: "e",
        receipt: { heard: "h", alternatives: [], confidence: 0.5, trigger: "voice", at: "yesterday" },
        trace_id: "t",
      }, // not ISO-8601
    ],
  },
  session_set_response_style: {
    validInput: { style: "brief", reason: "barge_in" },
    invalidInputs: [
      { style: "chatty", reason: "r" }, // enum violation
      { style: "brief" }, // missing reason (§5.2)
      { style: "brief", reason: "" }, // min 1
    ],
    validOutput: { style: "brief", applies_until: "2026-10-19T11:00:00Z", trace_id: "trace-1" },
    invalidOutputs: [
      { style: "brief", applies_until: "soon", trace_id: "t" }, // not datetime
      { style: "brief", applies_until: "2026-10-19T11:00:00Z" }, // missing trace_id
    ],
  },
  music_plan_offline_cache: {
    validInput: { byte_budget: 52_428_800, household_id: "hh-1" },
    invalidInputs: [
      { household_id: "hh-1" }, // byte_budget required (§5.2 key input, no blueprint default)
      { byte_budget: 0 }, // min 1
      { byte_budget: 1024, slots: { emergency: 0 } }, // min 1
      { byte_budget: 1024, mystery: true }, // .strict()
    ],
    validOutput: {
      plan: {
        items: [{ track: TRACK, url: "https://cdn.example.org/t1.mp3", bytes: 3_000_000, ttl_seconds: 86_400 }],
        expires_at: "2026-10-20T10:00:00Z",
      },
      task: { task_id: "task-1", status: "running" }, // [VERIFY R-SPEC-05] — status vocabulary is a placeholder until spec-checked
      trace_id: "trace-1",
    },
    invalidOutputs: [
      {
        plan: { items: [], expires_at: "later" }, // not datetime
        trace_id: "t",
      },
      { plan: { items: [], expires_at: "2026-10-20T10:00:00Z" } }, // missing trace_id
      {
        plan: { items: [], expires_at: "2026-10-20T10:00:00Z" },
        task: { task_id: "t" }, // status required inside task
        trace_id: "t",
      },
    ],
  },
  account_link_music_service: {
    validInput: { provider: "deezer" },
    invalidInputs: [{}, { provider: "" }, { provider: "deezer", url: "http://evil" }], // last: .strict()
    validOutput: { status: "pending", provider: "deezer", trace_id: "trace-1" },
    invalidOutputs: [
      { status: "maybe", provider: "deezer", trace_id: "t" }, // enum violation
      { status: "linked", provider: "deezer" }, // missing trace_id
    ],
  },
  privacy_forget_my_data: {
    validInput: { household_id: "hh-1" },
    invalidInputs: [{}, { household_id: "" }, { household_id: "hh-1", sure: true }], // last: .strict()
    validOutput: { aliases_deleted: 3, receipts_deleted: 11, trace_id: "trace-1" },
    invalidOutputs: [
      { aliases_deleted: -1, receipts_deleted: 0, trace_id: "t" }, // min 0
      { aliases_deleted: 1.5, receipts_deleted: 0, trace_id: "t" }, // not integer
      { aliases_deleted: 1, receipts_deleted: 0 }, // missing trace_id
    ],
  },
};

describe("eight tool schemas: valid parses / invalid rejects", () => {
  it("registry is consistent and holds exactly eight tools", () => {
    expect(() => assertRegistryConsistent()).not.toThrow();
    expect(toolNames).toHaveLength(8);
    expect(Object.keys(toolDefinitions)).toHaveLength(8);
  });

  for (const name of toolNames) {
    const toolCase = cases[name];
    const def = toolDefinitions[name];

    describe(name, () => {
      it("has title, description, annotations, inputSchema, outputSchema (AC-03)", () => {
        expect(def.name).toBe(name);
        expect(def.title.length).toBeGreaterThan(0);
        expect(def.description.length).toBeGreaterThan(40); // LLM-oriented description exists
        const ann: Record<string, unknown> = def.annotations;
        expect(typeof ann.readOnlyHint).toBe("boolean");
        expect(typeof ann.destructiveHint).toBe("boolean");
        // idempotentHint is declared by every tool except account_link_music_service,
        // where blueprint §5.2 row 7 is silent (MCP default applies [VERIFY R-SPEC-01]).
        if (name !== "account_link_music_service") {
          expect(typeof ann.idempotentHint).toBe("boolean");
        } else {
          expect("idempotentHint" in ann).toBe(false);
        }
      });

      it("parses a valid input example", () => {
        const parsed = def.inputSchema.safeParse(toolCase.validInput);
        expect(parsed.success, JSON.stringify(parsed, null, 2)).toBe(true);
      });

      it.each(toolCase.invalidInputs.map((v, i) => [i, v] as const))(
        "rejects invalid input #%i",
        (_i, value) => {
          expect(def.inputSchema.safeParse(value).success).toBe(false);
        },
      );

      it("parses a valid output example", () => {
        const parsed = def.outputSchema.safeParse(toolCase.validOutput);
        expect(parsed.success, JSON.stringify(parsed, null, 2)).toBe(true);
      });

      it.each(toolCase.invalidOutputs.map((v, i) => [i, v] as const))(
        "rejects invalid output #%i",
        (_i, value) => {
          expect(def.outputSchema.safeParse(value).success).toBe(false);
        },
      );
    });
  }
});

describe("JSON Schema generation contract", () => {
  it("resolve output references Track via #/$defs/Track (Appendix A style)", () => {
    const doc = zodToJsonSchema(toolDefinitions.music_resolve_request.outputSchema, {
      target: "jsonSchema2019-09",
      definitionPath: "$defs",
      definitions: { Track: trackSchema },
    });
    const json = JSON.stringify(doc);
    expect(json).toContain('"$ref":"#/$defs/Track"');
    expect(doc).toHaveProperty(["$defs", "Track"]);
  });

  it("every tool input is an object schema with additionalProperties:false (strict)", () => {
    for (const name of toolNames) {
      const doc = zodToJsonSchema(toolDefinitions[name].inputSchema) as {
        type?: string;
        additionalProperties?: boolean;
      };
      expect(doc.type).toBe("object");
      expect(doc.additionalProperties).toBe(false);
    }
  });

  it("zod strict mode: unknown keys are rejected, not stripped (parse throws)", () => {
    expect(() =>
      toolDefinitions.music_resolve_request.inputSchema.parse({
        transcript: "x",
        surface: "tv",
        smuggled: "value",
      }),
    ).toThrow(z.ZodError);
  });
});
