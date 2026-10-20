/**
 * Structured JSON logging — one object per line on stdout.
 *
 * Rule (blueprint §9 privacy): transcripts never appear at `info` or above.
 * `heard`, `transcript`, `spoken`, alternatives and raw payloads are redacted
 * unless LOG_LEVEL=debug. Tests assert the redaction via `buildLogRecord`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
export const LOG_LEVELS = Object.keys(LEVELS) as LogLevel[];

/** Fields that can carry user speech; redacted above debug. */
const SPEECH_KEYS = new Set([
  "heard",
  "transcript",
  "text",
  "spoken",
  "spoken_prompt",
  "alternatives",
  "asr_alternatives",
  "payload",
  "candidates",
  "input",
  "args",
]);

export type LogFields = Record<string, unknown>;

export function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (LOG_LEVELS as string[]).includes(raw) ? (raw as LogLevel) : "info";
}

/**
 * Pure record builder (unit-tested): redacts speech fields at levels above
 * debug, drops undefined values, and stamps ts/level/msg.
 */
export function buildLogRecord(
  level: LogLevel,
  msg: string,
  fields: LogFields,
  threshold: LogLevel = currentLevel(),
): Record<string, unknown> | null {
  if (LEVELS[level] < LEVELS[threshold]) return null;
  const out: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = level !== "debug" && SPEECH_KEYS.has(k) ? "[redacted]" : v;
  }
  return out;
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const rec = buildLogRecord(level, msg, fields);
  if (!rec) return;
  process.stdout.write(`${JSON.stringify(rec)}\n`);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => log("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => log("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => log("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => log("error", msg, fields),
};
