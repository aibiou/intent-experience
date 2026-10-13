import { DatabaseSync } from 'node:sqlite';

// ADR-0002 S-2/S-3：版本化状态存储。
// 条件写为单条条件 UPDATE，原子性由 SQLite 存储引擎保证，不依赖任何进程内锁。
// 字段名按 PD-16：规范名 expected_state_version（SRC-26 §4 CC-H04）。

export class VersionedStore {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    // 并发写竞争时等待锁而非立即报 SQLITE_BUSY（S-3 多进程场景需要）
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS experience_state (
      id INTEGER PRIMARY KEY,
      payload TEXT NOT NULL,
      version INTEGER NOT NULL
    )`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS write_audit (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_id TEXT NOT NULL,
      original_state_version INTEGER NOT NULL,
      current_state_version INTEGER,
      stale_reason TEXT NOT NULL,
      decision TEXT NOT NULL,
      rejected_at TEXT NOT NULL
    )`);
  }

  sqliteVersion() {
    return this.db.prepare('SELECT sqlite_version() AS v').get().v;
  }

  initRow(id, payload, version) {
    this.db
      .prepare('INSERT INTO experience_state (id, payload, version) VALUES (?, ?, ?)')
      .run(id, payload, version);
  }

  getRow(id) {
    return this.db
      .prepare('SELECT id, payload, version FROM experience_state WHERE id = ?')
      .get(id);
  }

  // 条件写：携带 expected_state_version；版本不匹配即拒绝并记审计。
  // 返回 { accepted: true, newVersion } 或 { accepted: false, staleConflict: true, currentVersion }。
  conditionalWrite({ id, expectedStateVersion, payload, generationId }) {
    const info = this.db
      .prepare(
        'UPDATE experience_state SET payload = ?, version = version + 1 WHERE id = ? AND version = ?'
      )
      .run(payload, id, expectedStateVersion);
    if (info.changes === 1) {
      return { accepted: true, newVersion: expectedStateVersion + 1 };
    }
    const row = this.getRow(id);
    const currentVersion = row ? row.version : null;
    this.db
      .prepare(
        `INSERT INTO write_audit
         (generation_id, original_state_version, current_state_version, stale_reason, decision, rejected_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        generationId,
        expectedStateVersion,
        currentVersion,
        'STATE_VERSION_CONFLICT',
        'REJECTED',
        new Date().toISOString()
      );
    return { accepted: false, staleConflict: true, currentVersion };
  }

  auditRows() {
    return this.db.prepare('SELECT * FROM write_audit ORDER BY seq').all();
  }

  close() {
    this.db.close();
  }
}
