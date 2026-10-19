/**
 * Structured JSON logging to stdout (blueprint 8.8 principle 7:
 * "Structured logs with no transcripts at info level (privacy)").
 *
 * One JSON object per line, no nesting surprises: {ts, level, msg, ...fields}.
 * The ONLY way a transcript/heard-text reaches stdout is via
 * `transcriptField()`, which returns the text exclusively when LOG_LEVEL=debug.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error"
    ? raw
    : "info";
}

let currentLevel: LogLevel = envLevel();

/** Re-read LOG_LEVEL (tests / startup). */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function logLevel(): LogLevel {
  return currentLevel;
}

export function isDebugEnabled(): boolean {
  return LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.debug;
}

type Fields = Record<string, unknown>;

function emit(level: Exclude<LogLevel, "debug"> | LogLevel, msg: string, fields: Fields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  try {
    process.stdout.write(`${JSON.stringify(line)}\n`);
  } catch {
    // Logging must never take the server down (circular structures etc.).
    process.stdout.write(
      `${JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "log_serialize_failed" })}\n`,
    );
  }
}

export const log = {
  debug: (msg: string, fields: Fields = {}) => emit("debug", msg, fields),
  info: (msg: string, fields: Fields = {}) => emit("info", msg, fields),
  warn: (msg: string, fields: Fields = {}) => emit("warn", msg, fields),
  error: (msg: string, fields: Fields = {}) => emit("error", msg, fields),
};

/**
 * Transcript/heard-text field for logs. Returns {} unless LOG_LEVEL=debug, so
 * that call sites cannot accidentally leak what the user said at info level.
 * Returns a marker key so callers keep a stable shape.
 */
export function transcriptField(text: string): { transcript?: string } {
  return isDebugEnabled() ? { transcript: text } : {};
}
