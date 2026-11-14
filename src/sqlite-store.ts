import Database from 'better-sqlite3';
import type { ActionRecord, Status, Store } from './types.js';

interface Row {
  key: string; fingerprint: string; status: Status; result: string | null;
  error: string | null; attempts: number; created_at: number; updated_at: number;
}

const toRecord = (r: Row): ActionRecord => ({
  key: r.key, fingerprint: r.fingerprint, status: r.status,
  result: r.result ?? undefined, error: r.error ?? undefined,
  attempts: r.attempts, createdAt: r.created_at, updatedAt: r.updated_at,
});

export class SqliteStore implements Store {
  private db: Database.Database;

  constructor(path = ':memory:') {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS actions (
      key TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  }

  claim(key: string, fingerprint: string) {
    const now = Date.now();
    const info = this.db
      .prepare(`INSERT INTO actions (key, fingerprint, status, attempts, created_at, updated_at)
                VALUES (?, ?, 'requested', 1, ?, ?) ON CONFLICT(key) DO NOTHING`)
      .run(key, fingerprint, now, now);
    return { won: info.changes === 1, record: this.get(key)! };
  }

  get(key: string) {
    const row = this.db.prepare('SELECT * FROM actions WHERE key = ?').get(key) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  update(key: string, patch: { status: Status; result?: string; error?: string }) {
    // verified is final: never move backward
    this.db
      .prepare(`UPDATE actions SET status = ?, result = COALESCE(?, result), error = ?, updated_at = ?
                WHERE key = ? AND status != 'verified'`)
      .run(patch.status, patch.result ?? null, patch.error ?? null, Date.now(), key);
    return this.get(key)!;
  }

  takeOver(key: string, expectedAttempts: number, staleBefore: number) {
    const info = this.db
      .prepare(`UPDATE actions SET attempts = attempts + 1, status = 'requested', updated_at = ?
                WHERE key = ? AND attempts = ? AND status IN ('requested','unknown') AND updated_at <= ?`)
      .run(Date.now(), key, expectedAttempts, staleBefore);
    return info.changes === 1;
  }
}
