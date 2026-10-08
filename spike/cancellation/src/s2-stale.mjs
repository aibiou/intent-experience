import { VersionedStore } from './store.mjs';

// ADR-0002 S-2：stale 响应拒绝。
// 迟到响应携带旧 expected_state_version，必须被条件写原子拒绝（STATE_VERSION_CONFLICT 语义），
// 100% 拒绝，拒绝路径可审计，无覆盖 / 自动合并 / 静默丢弃。

export async function runStaleRejection({ dbPath }) {
  const store = new VersionedStore(dbPath);
  const events = [];
  const id = 1;
  const sqliteVersion = store.sqliteVersion();
  store.initRow(id, 'payload-v1', 1);
  events.push({ event: 'init', id, payload: 'payload-v1', version: 1, at: new Date().toISOString() });

  // 正常写入：gen-A 携带 expected_state_version=1 → 接受（1→2）
  const ok = store.conditionalWrite({
    id,
    expectedStateVersion: 1,
    payload: 'payload-v2',
    generationId: 'gen-A-current'
  });
  events.push({ event: 'write_result', generation_id: 'gen-A-current', ...ok, at: new Date().toISOString() });

  // 迟到响应：gen-B 系列（旧 generation）携带旧版本 1 → 必须全部拒绝
  const attempts = 50;
  let rejected = 0;
  for (let i = 0; i < attempts; i++) {
    const r = store.conditionalWrite({
      id,
      expectedStateVersion: 1,
      payload: `stale-payload-${i}`,
      generationId: `gen-B-late-${i}`
    });
    if (!r.accepted && r.staleConflict) rejected += 1;
    events.push({ event: 'write_result', generation_id: `gen-B-late-${i}`, ...r, at: new Date().toISOString() });
  }

  const finalRow = store.getRow(id);
  const audit = store.auditRows();
  const auditComplete =
    audit.length === attempts &&
    audit.every(
      (a) =>
        a.stale_reason === 'STATE_VERSION_CONFLICT' &&
        a.decision === 'REJECTED' &&
        a.original_state_version === 1 &&
        a.current_state_version === 2 &&
        !!a.rejected_at &&
        a.generation_id.startsWith('gen-B-late-')
    );

  const criteria = [
    { name: '正常写入被接受（gen-A：1→2）', pass: ok.accepted === true && ok.newVersion === 2 },
    { name: '旧版本迟到写入 100% 拒绝（50/50）', pass: rejected === attempts },
    { name: '拒绝语义为 STATE_VERSION_CONFLICT', pass: audit.every((a) => a.stale_reason === 'STATE_VERSION_CONFLICT') },
    { name: '未覆盖新状态（最终 version=2 且 payload 不变）', pass: finalRow.version === 2 && finalRow.payload === 'payload-v2' },
    { name: '拒绝路径全部可审计（audit 行数与字段完整，含 generation_id / 原版本 / 当前版本 / rejected_at）', pass: auditComplete },
    { name: '无自动合并 / 静默丢弃（拒绝均显式记录，无其他副作用行）', pass: audit.length === attempts }
  ];
  store.close();
  return {
    name: 'S-2 stale 响应拒绝',
    pass: criteria.every((c) => c.pass),
    criteria,
    sqliteVersion,
    accepted: ok,
    staleAttempts: attempts,
    staleRejected: rejected,
    finalRow,
    auditSample: audit.slice(0, 3),
    events
  };
}
