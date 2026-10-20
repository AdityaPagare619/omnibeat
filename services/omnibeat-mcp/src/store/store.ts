/**
 * Session / receipt / alias store on node:sqlite (blueprint 8.1 "durable
 * state behind an interface"; 8.7 receipts; 6.7 alias memory).
 *
 * Everything the server remembers about a household lives here in one file
 * (default data/sessions.db) so `privacy_forget_my_data` can actually delete
 * it. Deliberately no ORM: prepared statements only.
 *
 * Tables
 *  - sessions    : MCP sessions (Mcp-Session-Id), response style + TTL
 *  - resolutions : one row per music_resolve_request (what was heard)
 *  - receipts    : one row per music_confirm_selection (idempotency_key unique)
 *  - aliases     : opt-in "when I say X I mean Y", retention TTL 90 d
 */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface SessionRow {
  session_id: string;
  created_at: string;
  last_seen_at: string;
  closed_at: string | null;
  protocol_version: string | null;
  client_name: string | null;
  style: string;
  style_reason: string | null;
  applies_until: string | null;
}

export interface ResolutionRow {
  resolution_id: string;
  session_id: string | null;
  household_id: string | null;
  heard_text: string;
  alternatives_json: string;
  locale: string | null;
  surface: string;
  decision: string;
  confidence: number;
  candidates_json: string;
  trace_id: string;
  ts: string;
}

export interface ReceiptRow {
  receipt_id: string;
  idempotency_key: string;
  resolution_id: string;
  session_id: string | null;
  household_id: string | null;
  chosen_candidate_id: string;
  chosen_title: string;
  chosen_artist: string;
  heard_text: string;
  alternatives_json: string;
  confidence: number;
  trigger: string;
  alias_saved: number;
  trace_id: string;
  ts: string;
}

export interface AliasRow {
  id: number;
  household_id: string;
  alias_text: string;
  target_candidate_id: string;
  resolution_id: string | null;
  created_at: string;
  expires_at: string;
}

export interface InsertReceipt {
  idempotency_key: string;
  resolution_id: string;
  session_id: string | null;
  household_id: string | null;
  chosen_candidate_id: string;
  chosen_title: string;
  chosen_artist: string;
  heard_text: string;
  alternatives_json: string;
  confidence: number;
  trigger: string;
  trace_id: string;
  ts: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id      TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  closed_at       TEXT,
  protocol_version TEXT,
  client_name     TEXT,
  style           TEXT NOT NULL DEFAULT 'normal',
  style_reason    TEXT,
  applies_until   TEXT
);
CREATE TABLE IF NOT EXISTS resolutions (
  resolution_id      TEXT PRIMARY KEY,
  session_id         TEXT,
  household_id       TEXT,
  heard_text         TEXT NOT NULL,
  alternatives_json  TEXT NOT NULL,
  locale             TEXT,
  surface            TEXT NOT NULL,
  decision           TEXT NOT NULL,
  confidence         REAL NOT NULL,
  candidates_json    TEXT NOT NULL,
  trace_id           TEXT NOT NULL,
  ts                 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resolutions_session ON resolutions(session_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_resolutions_household ON resolutions(household_id, ts DESC);
CREATE TABLE IF NOT EXISTS receipts (
  receipt_id          TEXT PRIMARY KEY,
  idempotency_key     TEXT NOT NULL UNIQUE,
  resolution_id       TEXT NOT NULL,
  session_id          TEXT,
  household_id        TEXT,
  chosen_candidate_id TEXT NOT NULL,
  chosen_title        TEXT NOT NULL DEFAULT 'unknown',
  chosen_artist       TEXT NOT NULL DEFAULT 'unknown',
  heard_text          TEXT NOT NULL,
  alternatives_json   TEXT NOT NULL,
  confidence          REAL NOT NULL,
  trigger             TEXT NOT NULL,
  alias_saved         INTEGER NOT NULL DEFAULT 0,
  trace_id            TEXT NOT NULL,
  ts                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_receipts_household ON receipts(household_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_session ON receipts(session_id, ts DESC);
CREATE TABLE IF NOT EXISTS aliases (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id         TEXT NOT NULL,
  alias_text           TEXT NOT NULL,
  target_candidate_id  TEXT NOT NULL,
  resolution_id        TEXT,
  created_at           TEXT NOT NULL,
  expires_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aliases_household ON aliases(household_id);
`;

export class OmniBeatStore {
  readonly db: DatabaseSync;
  readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA);
    this.ensureColumn("receipts", "chosen_title", "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("receipts", "chosen_artist", "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("receipts", "alias_saved", "INTEGER NOT NULL DEFAULT 0");
  }

  /** Forward-only column migration (P1 databases created before these landed). */
  private ensureColumn(table: string, column: string, ddl: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------- sessions

  upsertSession(sessionId: string, protocolVersion: string | null, clientName: string | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sessions (session_id, created_at, last_seen_at, closed_at, protocol_version, client_name, style, style_reason, applies_until)
         VALUES (?, ?, ?, NULL, ?, ?, 'normal', NULL, NULL)
         ON CONFLICT(session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, closed_at = NULL`,
      )
      .run(sessionId, now, now, protocolVersion, clientName);
  }

  touchSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET last_seen_at = ? WHERE session_id = ?`)
      .run(new Date().toISOString(), sessionId);
  }

  closeSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET closed_at = ? WHERE session_id = ?`)
      .run(new Date().toISOString(), sessionId);
  }

  getSession(sessionId: string): SessionRow | undefined {
    return this.db
      .prepare(`SELECT * FROM sessions WHERE session_id = ?`)
      .get(sessionId) as SessionRow | undefined;
  }

  setStyle(sessionId: string, style: string, reason: string, appliesUntil: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sessions (session_id, created_at, last_seen_at, closed_at, protocol_version, client_name, style, style_reason, applies_until)
         VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           style = excluded.style,
           style_reason = excluded.style_reason,
           applies_until = excluded.applies_until,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(sessionId, now, now, style, reason, appliesUntil);
  }

  countActiveSessions(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE closed_at IS NULL`)
      .get() as { n: number };
    return Number(row.n);
  }

  // ------------------------------------------------------------- resolutions

  insertResolution(row: ResolutionRow): void {
    this.db
      .prepare(
        `INSERT INTO resolutions
           (resolution_id, session_id, household_id, heard_text, alternatives_json, locale, surface, decision, confidence, candidates_json, trace_id, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.resolution_id,
        row.session_id,
        row.household_id,
        row.heard_text,
        row.alternatives_json,
        row.locale,
        row.surface,
        row.decision,
        row.confidence,
        row.candidates_json,
        row.trace_id,
        row.ts,
      );
  }

  getResolution(resolutionId: string): ResolutionRow | undefined {
    return this.db
      .prepare(`SELECT * FROM resolutions WHERE resolution_id = ?`)
      .get(resolutionId) as ResolutionRow | undefined;
  }

  latestResolutionForSession(sessionId: string): ResolutionRow | undefined {
    return this.db
      .prepare(`SELECT * FROM resolutions WHERE session_id = ? ORDER BY ts DESC LIMIT 1`)
      .get(sessionId) as ResolutionRow | undefined;
  }

  // ---------------------------------------------------------------- receipts

  getReceiptByIdempotencyKey(key: string): ReceiptRow | undefined {
    return this.db
      .prepare(`SELECT * FROM receipts WHERE idempotency_key = ?`)
      .get(key) as ReceiptRow | undefined;
  }

  insertReceipt(row: InsertReceipt): ReceiptRow {
    const receiptId = `rcp_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO receipts
           (receipt_id, idempotency_key, resolution_id, session_id, household_id, chosen_candidate_id, chosen_title, chosen_artist, heard_text, alternatives_json, confidence, trigger, alias_saved, trace_id, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        receiptId,
        row.idempotency_key,
        row.resolution_id,
        row.session_id,
        row.household_id,
        row.chosen_candidate_id,
        row.chosen_title,
        row.chosen_artist,
        row.heard_text,
        row.alternatives_json,
        row.confidence,
        row.trigger,
        row.trace_id,
        row.ts,
      );
    return this.getReceiptByIdempotencyKey(row.idempotency_key) as ReceiptRow;
  }

  /** Set after a receipt is written when the alias insert actually succeeded. */
  markAliasSaved(receiptId: string): void {
    this.db.prepare(`UPDATE receipts SET alias_saved = 1 WHERE receipt_id = ?`).run(receiptId);
  }

  latestReceipt(filter: { household_id?: string; session_id?: string }): ReceiptRow | undefined {
    if (filter.household_id) {
      return this.db
        .prepare(`SELECT * FROM receipts WHERE household_id = ? ORDER BY ts DESC LIMIT 1`)
        .get(filter.household_id) as ReceiptRow | undefined;
    }
    if (filter.session_id) {
      return this.db
        .prepare(`SELECT * FROM receipts WHERE session_id = ? ORDER BY ts DESC LIMIT 1`)
        .get(filter.session_id) as ReceiptRow | undefined;
    }
    return undefined;
  }

  // ----------------------------------------------------------------- aliases

  insertAlias(row: {
    household_id: string;
    alias_text: string;
    target_candidate_id: string;
    resolution_id: string | null;
    created_at: string;
    expires_at: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO aliases (household_id, alias_text, target_candidate_id, resolution_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.household_id,
        row.alias_text,
        row.target_candidate_id,
        row.resolution_id,
        row.created_at,
        row.expires_at,
      );
  }

  aliasesForHousehold(householdId: string): AliasRow[] {
    return this.db
      .prepare(`SELECT * FROM aliases WHERE household_id = ? ORDER BY created_at DESC`)
      .all(householdId) as unknown as AliasRow[];
  }

  /** blueprint 9.1.2/9.1.3: delete aliases + receipts for a household, count both. */
  forgetHousehold(householdId: string): { aliases_deleted: number; receipts_deleted: number } {
    const a = this.db.prepare(`DELETE FROM aliases WHERE household_id = ?`).run(householdId);
    const r = this.db.prepare(`DELETE FROM receipts WHERE household_id = ?`).run(householdId);
    return { aliases_deleted: Number(a.changes), receipts_deleted: Number(r.changes) };
  }
}
