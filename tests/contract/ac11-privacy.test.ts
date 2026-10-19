/**
 * AC11-privacy — Charter Part 8.5 AC-11 (blueprint §5.2 privacy tool, §9.1 principles).
 *
 * 1. No audio fields in any tool schema (audio travels as resource links, never bytes).
 * 2. No transcripts at info log level.
 * 3. Alias memory is listable and deletable.
 * 4. privacy_forget_my_data removes everything for the household, verified by test.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findFiles, rel, REPO_ROOT } from "../helpers/repo";
import { initialize, postRpc, PROTOCOL_VERSION } from "../helpers/mcp";

// Field-name denylist: schemas must never carry raw audio bytes/PCM or an audio blob.
// NOTE (provisional, depends: ARCH contract v0): hook *links* (resource links to clips,
// blueprint §5.2/§5.3) are allowed; what is forbidden is audio *content* in schema'd output.
const AUDIO_FIELD_DENYLIST = /^(audio|audio_bytes|audio_data|audio_blob|wav|pcm|media_bytes|sound_bytes|tts_audio)$/i;

function schemaFiles(): string[] {
  return [
    ...findFiles(REPO_ROOT, /\.schema\.json$/),
    ...findFiles(`${REPO_ROOT}/contract`, /\.json$/),
  ];
}

describe("AC11-privacy", () => {
  it("AC11-privacy/no-audio-fields-in-any-schema: no tool schema exposes audio-content fields", () => {
    const files = schemaFiles();
    expect(files.length, "no schema files found under contract/ or *.schema.json — schemas NOT IMPLEMENTED at Phase 0").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
      const visit = (node: unknown): void => {
        if (Array.isArray(node)) for (const item of node) visit(item);
        else if (node !== null && typeof node === "object") {
          for (const [key, value] of Object.entries(node)) {
            if (AUDIO_FIELD_DENYLIST.test(key)) offenders.push(`${rel(file)}: ${key}`);
            visit(value);
          }
        }
      };
      visit(raw);
    }
    expect(offenders, `audio-content fields must not appear in any schema (AC-11): ${offenders.join(", ")}`).toEqual([]);
  });

  it("AC11-privacy/no-transcripts-at-info-level: transcripts never appear at info log level", async () => {
    // TODO harness (Phase 2): run one scripted session with log level set to info and a canary
    // transcript ("T-TEST-CANARY-7f3a"); capture stdout + structured log sink for the whole
    // session lifecycle (create, call, cancel, delete) and assert the canary string appears
    // nowhere in info-level records. depends: ARCH contract v0 — logging capability surface (§5.1).
    expect(false, "NOT IMPLEMENTED — AC11 no-transcripts-at-info-level: needs log-capture harness (Phase 2)").toBe(true);
  });

  it("AC11-privacy/alias-memory-listable-and-deletable: saved household aliases can be listed and deleted", async () => {
    // TODO harness (Phase 2): scripted client saves an alias via music_confirm_selection
    // (remember_alias=true, household_id), lists aliases (resources/read omnibeat://session/{id}/context
    // or the documented alias-listing surface — depends: ARCH contract v0), asserts it appears,
    // deletes it, and asserts the list is empty again.
    const sessionId = await initialize();
    await postRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, {
      "mcp-session-id": sessionId,
      "mcp-protocol-version": PROTOCOL_VERSION,
    });
    expect(false, "NOT IMPLEMENTED — AC11 alias-memory-listable-and-deletable: scripted alias save/list/delete (Phase 2)").toBe(true);
  });

  it("AC11-privacy/privacy-forget-my-data: forget-my-data removes all household data (aliases + receipts)", async () => {
    // TODO harness (Phase 2): seed a household with two aliases + one receipt, call
    // privacy_forget_my_data with idempotency, then verify via listing surfaces and the
    // receipts/explanations path (music_explain_last_action returns nothing for the household)
    // that no residue remains. Second identical call must be idempotent (§5.2 destructive + idempotent).
    const sessionId = await initialize();
    await postRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, {
      "mcp-session-id": sessionId,
      "mcp-protocol-version": PROTOCOL_VERSION,
    });
    expect(false, "NOT IMPLEMENTED — AC11 privacy-forget-my-data: seed-and-verify harness (Phase 2)").toBe(true);
  });
});
