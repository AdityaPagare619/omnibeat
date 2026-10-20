/**
 * Fixture ASR — the lab's speech recognition for P1.
 *
 * Source labelling is honest and explicit (blueprint §4.2, AC-14):
 *   fixtureId → fixtures/transcripts/<id>.json   badge FIXTURE, label FIXTURE
 *   text      → typed by a human at the console  badge FIXTURE, label TYPED
 *   mic       → src/awstranscribe.ts (stub)      badge LIVE  — not wired (ESC-001)
 *
 * There is no microphone in this environment and no AWS credentials
 * (ESC-001), so no path may claim LIVE audio.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { asrAlternativeSchema, type AsrAlternative, type SourceBadge } from "@omnibeat/schemas";

export const fixtureTranscriptSchema = z
  .object({
    id: z.string().min(1).optional(),
    heard: z.string().min(1).max(300),
    alternatives: z.array(asrAlternativeSchema).max(5).default([]),
    locale: z.string().min(2).max(64).optional(),
    note: z.string().optional(),
  })
  .strict();
export type FixtureTranscript = z.infer<typeof fixtureTranscriptSchema>;

export type AsrLabel = "FIXTURE" | "TYPED" | "LIVE";

export interface AsrResult {
  heard: string;
  alternatives: AsrAlternative[];
  locale?: string;
  /** Truthful badge for the card (LIVE | FIXTURE | REPLAY). */
  badge: SourceBadge;
  /** Sub-label: FIXTURE file vs typed text vs live audio. */
  label: AsrLabel;
  fixtureId?: string;
}

export class AsrError extends Error {
  readonly code: "ASR_FIXTURE_NOT_FOUND" | "ASR_NO_INPUT" | "ASR_FIXTURE_INVALID";
  readonly detail: unknown;
  constructor(
    code: AsrError["code"],
    message: string,
    detail?: unknown,
  ) {
    super(message);
    this.name = "AsrError";
    this.code = code;
    this.detail = detail;
  }
}

const FIXTURE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface RecognizeInput {
  fixtureId?: string | undefined;
  text?: string | undefined;
  locale?: string | undefined;
  fixturesDir: string;
}

/**
 * Deterministic: fixtureId wins over text; text alone is labelled TYPED;
 * neither is an honest ASR_NO_INPUT error (never a silent empty turn).
 */
export async function recognize(input: RecognizeInput): Promise<AsrResult> {
  const text = input.text?.trim();

  if (input.fixtureId) {
    if (!FIXTURE_ID_RE.test(input.fixtureId)) {
      throw new AsrError(
        "ASR_FIXTURE_INVALID",
        `fixture id ${JSON.stringify(input.fixtureId)} is not a plain identifier`,
        { fixtureId: input.fixtureId },
      );
    }
    const file = path.join(input.fixturesDir, `${input.fixtureId}.json`);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (err) {
      throw new AsrError(
        "ASR_FIXTURE_NOT_FOUND",
        `fixture transcript not found: ${input.fixtureId}`,
        { file, cause: String(err) },
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new AsrError("ASR_FIXTURE_INVALID", `fixture ${input.fixtureId} is not valid JSON`, {
        file,
        cause: String(err),
      });
    }
    const parsed = fixtureTranscriptSchema.safeParse(json);
    if (!parsed.success) {
      throw new AsrError(
        "ASR_FIXTURE_INVALID",
        `fixture ${input.fixtureId} failed schema validation`,
        parsed.error.issues,
      );
    }
    return {
      heard: parsed.data.heard,
      alternatives: parsed.data.alternatives,
      ...(parsed.data.locale !== undefined
        ? { locale: input.locale ?? parsed.data.locale }
        : input.locale !== undefined
          ? { locale: input.locale }
          : {}),
      badge: "FIXTURE",
      label: "FIXTURE",
      fixtureId: input.fixtureId,
    };
  }

  if (text) {
    return {
      heard: text,
      alternatives: [{ text, confidence: 1 }],
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      // Typed input is not live audio: FIXTURE badge, TYPED sub-label.
      badge: "FIXTURE",
      label: "TYPED",
    };
  }

  throw new AsrError(
    "ASR_NO_INPUT",
    "no input: provide fixtureId (fixture transcript) or text (typed)",
    { fixtureId: input.fixtureId, text: input.text },
  );
}
