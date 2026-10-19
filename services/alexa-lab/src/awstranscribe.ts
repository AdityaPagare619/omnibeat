/**
 * Amazon Transcribe adapter — PLACEHOLDER, no AWS calls.
 *
 * ESC-001: this environment has no AWS credentials and no network path to
 * Transcribe, so wiring it would either crash or (worse) pretend. The lab's
 * ASR therefore runs on fixtures/typed input (src/asr.ts) and every card is
 * badged FIXTURE — never LIVE — until this adapter is real.
 *
 * The interface below is the contract the live path must satisfy when
 * credentials exist (blueprint §12.7(4) provider order: Transcribe →
 * Web Speech → fixture).
 */

import type { AsrResult } from "./asr.js";

export const AWS_TRANSCRIBE_ENABLED = false;
export const ESC_001 = "ESC-001: no AWS credentials in this environment — adapter stubbed";

/**
 * COMMENTED ADAPTER INTERFACE — activate with credentials + network:
 *
 * ```ts
 * export interface TranscribeAdapter {
 *   /** Start a streaming session for one utterance. * /
 *   start(opts: { locale: string; sampleRateHz?: number; sessionId: string }): Promise<void>;
 *   /** Push one PCM16 chunk from the mic/VAD. * /
 *   push(chunk: Uint8Array): Promise<void>;
 *   /** Resolve with the final transcript + n-best alternatives. * /
 *   finish(): Promise<AsrResult>;          // badge: "LIVE", label: "LIVE"
 *   stop(): Promise<void>;
 * }
 *
 * export const createTranscribeAdapter = (): TranscribeAdapter => {
 *   throw new Error(ESC_001);              // never a silent fake result
 * };
 * ```
 */
export async function recognizeWithTranscribe(): Promise<AsrResult> {
  throw new Error(`AWS Transcribe unavailable: ${ESC_001}`);
}
