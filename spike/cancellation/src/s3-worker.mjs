import { DatabaseSync } from 'node:sqlite';

// ADR-0002 S-3 独立进程工作器：打开独立连接，执行一次条件写，报告结果。
// 用法：node [--experimental-sqlite] s3-worker.mjs <dbPath> <expectedVersion> <workerId>

const [dbPath, expectedVersion, workerId] = process.argv.slice(2);
const expected = Number(expectedVersion);
const db = new DatabaseSync(dbPath);
// 并发写竞争时等待锁而非立即报 SQLITE_BUSY（首轮运行未设此 pragma，
// 20 进程中每轮 1–4 个报 database is locked；条件写语义不受影响，
// 首轮失败记录见 evidence-run-1-initial/ 与 Spike 报告 run-1）
db.exec('PRAGMA busy_timeout = 5000');
const info = db
  .prepare(
    'UPDATE experience_state SET payload = ?, version = version + 1 WHERE id = 1 AND version = ?'
  )
  .run(`worker-${workerId}-payload`, expected);
let result;
if (info.changes === 1) {
  result = { worker: Number(workerId), accepted: true, newVersion: expected + 1 };
} else {
  const row = db.prepare('SELECT version FROM experience_state WHERE id = 1').get();
  result = {
    worker: Number(workerId),
    accepted: false,
    staleConflict: true,
    currentVersion: row ? row.version : null
  };
}
db.close();
console.log(JSON.stringify(result));
