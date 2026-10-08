import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInProcessAbort, runHttpAbort } from './src/s1-abort.mjs';
import { runStaleRejection } from './src/s2-stale.mjs';
import { runConcurrentConditionalWrite } from './src/s3-concurrent.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const evidenceDir = join(here, 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const environment = {
  nodeVersion: process.version,
  nodeExec: process.execPath,
  nodeExecArgv: process.execArgv,
  platform: process.platform,
  arch: process.arch,
  recordedAt: new Date().toISOString(),
  note: 'Node 版本由 run.sh 按 ADR-0001 生命周期规则锁定；node:sqlite 在 Node 22 需 --experimental-sqlite（Node 24 起内置可用）'
};

function writeEvidence(name, result) {
  const { events, ...rest } = result;
  if (events) {
    writeFileSync(
      join(evidenceDir, `${name}.jsonl`),
      events.map((e) => JSON.stringify(e)).join('\n') + '\n'
    );
  }
  writeFileSync(join(evidenceDir, `${name}.json`), JSON.stringify(rest, null, 2));
}

const results = [];

console.log('=== ADR-0002 Spike：S-1 客户端中止传播 ===');
const s1a = await runInProcessAbort();
const s1b = await runHttpAbort();
results.push(s1a, s1b);
writeEvidence('s1a-inprocess-abort', s1a);
writeEvidence('s1b-http-abort', s1b);
console.log(`S-1a ${s1a.pass ? 'PASS' : 'FAIL'}；S-1b ${s1b.pass ? 'PASS' : 'FAIL'}`);

console.log('=== ADR-0002 Spike：S-2 stale 响应拒绝 ===');
const s2 = await runStaleRejection({ dbPath: join(evidenceDir, 's2-state.db') });
results.push(s2);
writeEvidence('s2-stale-rejection', s2);
console.log(`S-2 ${s2.pass ? 'PASS' : 'FAIL'}（stale 拒绝 ${s2.staleRejected}/${s2.staleAttempts}）`);

console.log('=== ADR-0002 Spike：S-3 持久层条件写（多进程并发） ===');
const s3 = await runConcurrentConditionalWrite({
  dbPath: join(evidenceDir, 's3-round.db'),
  nodeExec: process.execPath,
  nodeArgs: process.execArgv,
  workerScript: join(here, 'src', 's3-worker.mjs')
});
results.push(s3);
writeEvidence('s3-concurrent-write', s3);
console.log(`S-3 ${s3.pass ? 'PASS' : 'FAIL'}（${s3.rounds.length} 轮 × 20 进程）`);

// 证据哈希登记
const { readdirSync, statSync } = await import('node:fs');
const sums = [];
for (const f of readdirSync(evidenceDir)) {
  const p = join(evidenceDir, f);
  if (!statSync(p).isFile() || f === 'SHA256SUMS') continue;
  const { readFileSync } = await import('node:fs');
  const hash = createHash('sha256').update(readFileSync(p)).digest('hex');
  sums.push(`${hash}  ${f}`);
}
writeFileSync(join(evidenceDir, 'SHA256SUMS'), sums.join('\n') + '\n');

const summary = {
  environment,
  overallPass: results.every((r) => r.pass),
  results: results.map((r) => ({
    name: r.name,
    pass: r.pass,
    criteria: r.criteria
  })),
  generatedAt: new Date().toISOString()
};
writeFileSync(join(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('\n=== 汇总 ===');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  for (const c of r.criteria) {
    console.log(`  ${c.pass ? '[PASS]' : '[FAIL]'} ${c.name}`);
  }
}
console.log(`\noverall: ${summary.overallPass ? 'PASS' : 'FAIL'}`);
console.log(`evidence: ${evidenceDir}`);
process.exit(summary.overallPass ? 0 : 1);
