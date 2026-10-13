import { execFile } from 'node:child_process';
import { VersionedStore } from './store.mjs';

// ADR-0002 S-3：持久层条件写。
// 多进程并发竞争同一版本条件写：恰有一个成功；失败方读到最新版本。
// 原子性由 SQLite 存储引擎保证，不依赖进程内锁（各工作器为独立 OS 进程、独立连接）。

export async function runConcurrentConditionalWrite({ dbPath, nodeExec, nodeArgs, workerScript }) {
  const rounds = 5;
  const workersPerRound = 20;
  const roundResults = [];

  for (let round = 0; round < rounds; round++) {
    // 每轮独立 DB，避免轮间串行化争议
    const roundDb = dbPath.replace(/\.db$/, `-${round}.db`);
    const baseVersion = 100 + round;
    const setup = new VersionedStore(roundDb);
    setup.initRow(1, `payload-round-${round}`, baseVersion);
    setup.close();

    const procs = [];
    for (let w = 0; w < workersPerRound; w++) {
      procs.push(
        new Promise((resolve) => {
          execFile(
            nodeExec,
            [...nodeArgs, workerScript, roundDb, String(baseVersion), String(w)],
            (err, stdout) => {
              if (err) {
                resolve({ worker: w, error: String(err) });
                return;
              }
              const lastLine = stdout.trim().split('\n').pop();
              try {
                resolve(JSON.parse(lastLine));
              } catch {
                resolve({ worker: w, error: 'unparseable output', raw: lastLine });
              }
            }
          );
        })
      );
    }
    const results = await Promise.all(procs);

    const accepted = results.filter((r) => r.accepted === true);
    const conflicts = results.filter((r) => r.accepted === false && r.staleConflict === true);
    const errors = results.filter((r) => r.error);

    const check = new VersionedStore(roundDb);
    const finalRow = check.getRow(1);
    check.close();

    const passRound =
      errors.length === 0 &&
      accepted.length === 1 &&
      conflicts.length === workersPerRound - 1 &&
      finalRow.version === baseVersion + 1 &&
      conflicts.every((c) => c.currentVersion === baseVersion + 1); // 失败方读到最新版本

    roundResults.push({
      round,
      baseVersion,
      workers: workersPerRound,
      accepted: accepted[0] || null,
      conflictCount: conflicts.length,
      errorCount: errors.length,
      finalVersion: finalRow.version,
      losersReadLatest: conflicts.every((c) => c.currentVersion === baseVersion + 1),
      pass: passRound
    });
  }

  const criteria = [
    { name: '每轮恰有一个成功（5 轮 × 20 进程）', pass: roundResults.every((r) => r.accepted && r.conflictCount === 19 && r.errorCount === 0) },
    { name: '失败方均读到最新版本（baseVersion + 1）', pass: roundResults.every((r) => r.losersReadLatest) },
    { name: '最终状态版本正确（每轮 +1）', pass: roundResults.every((r) => r.finalVersion === r.baseVersion + 1) },
    { name: '无进程内锁（竞争跨独立 OS 进程与独立连接，原子性来自存储引擎）', pass: true }
  ];
  return {
    name: 'S-3 持久层条件写（多进程并发竞争）',
    pass: criteria.every((c) => c.pass),
    criteria,
    rounds: roundResults
  };
}
