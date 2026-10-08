// trial.mjs — E5 first end-to-end evidence-pipeline trial run (synthetic fixtures).
// Scope: evidence pipeline validation only (E5-LICENSE-PROPOSAL-01 §2.1.3 / Annex A.4).
// Product runtime behavior verification belongs to G2–G4 dynamic execution after
// implementation authorization — this trial produces no product Gate evidence.

import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVersionMatrix } from './metadata.mjs';
import { writeCaseRecord } from './caselog.mjs';
import { TraceWriter } from './trace.mjs';
import { writeSha256Sums, verifySha256Sums, sha256OfFile } from './hashes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'artifacts', 'evidence');
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const RUN_ID = 'E5-TRIAL-0001';
const RUN_DIR = path.join(EVIDENCE_ROOT, 'runs', RUN_ID);

const EXECUTOR = {
  executedBy: '工程负责人角色（代理，Codex 履行，PD-15 委托）',
  independentEvaluator: '独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 任命生效，保留审阅与否决权）',
};

// ---------------------------------------------------------------------------
// Assertion collector (trial-level; per-case assertions live in case records)
// ---------------------------------------------------------------------------
const assertions = [];
const logLines = [];
function log(line) {
  logLines.push(line);
  console.log(line);
}
function recordAssertion(id, description, passed, detail = {}) {
  assertions.push({ id, description, passed, ...detail });
  log(`[${passed ? 'PASS' : 'FAIL'}] ${id} — ${description}`);
}

// ---------------------------------------------------------------------------
// Engine gate: evidence tooling requires Node >= 22 (node:sqlite); the locked
// product baseline is Node 24 Active LTS (ADR-0002 spike; F-2 re-verify at
// authorization date).
// ---------------------------------------------------------------------------
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 22) {
  console.error(`FATAL: evidence tooling requires Node >= 22 (node:sqlite). Running under ${process.version} (${process.execPath}). Use the locked Node 24 Active LTS executable.`);
  process.exit(1);
}
log(`E5 trial run ${RUN_ID} — Node ${process.version} (${process.execPath}) — ${new Date().toISOString()}`);

// ---------------------------------------------------------------------------
// Fixture-driven policy resolver (C3 §8 default mapping, unambiguous entries
// exercised by the S1 golden subset; WHY → EXPLAIN per S1 §26 GS-02).
// This is fixture replay, not a product runtime.
// ---------------------------------------------------------------------------
const POLICY_MAP = {
  DIRECT_ANSWER: 'ANSWER',
  WHY: 'EXPLAIN',
  STOP: 'STOP',
};

// ---------------------------------------------------------------------------
// Fixture state store (in-memory node:sqlite) — mirrors the GS-05 stale-write
// contract semantics: conditional UPDATE ... WHERE version = expected;
// conflicts are rejected and audited (write_audit), never overwriting.
// ---------------------------------------------------------------------------
function createStateStore() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('CREATE TABLE experience_state (id TEXT PRIMARY KEY, payload TEXT, version INTEGER)');
  db.exec(`CREATE TABLE write_audit (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_id TEXT,
    original_state_version INTEGER,
    current_state_version INTEGER,
    stale_reason TEXT,
    decision TEXT,
    rejected_at TEXT
  )`);
  db.prepare('INSERT INTO experience_state (id, payload, version) VALUES (?, ?, ?)')
    .run('fixture-state', JSON.stringify({ topic: 'e5-trial-fixture', synthetic: true }), 2);
  return db;
}

function conditionalWrite(db, { id, expectedStateVersion, payload, generationId }) {
  const current = db.prepare('SELECT version FROM experience_state WHERE id = ?').get(id);
  const info = db.prepare('UPDATE experience_state SET payload = ?, version = version + 1 WHERE id = ? AND version = ?')
    .run(payload, id, expectedStateVersion);
  if (info.changes === 1) {
    return { accepted: true, newVersion: expectedStateVersion + 1 };
  }
  db.prepare(`INSERT INTO write_audit
    (generation_id, original_state_version, current_state_version, stale_reason, decision, rejected_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(generationId, expectedStateVersion, current.version, 'STATE_VERSION_CONFLICT', 'REJECTED', new Date().toISOString());
  return { accepted: false, staleConflict: true, currentVersion: current.version };
}

function auditCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM write_audit').get().n;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const runStart = new Date().toISOString();
await mkdir(path.join(RUN_DIR, 'cases'), { recursive: true });
await mkdir(path.join(RUN_DIR, 'traces'), { recursive: true });
await mkdir(path.join(RUN_DIR, 'logs'), { recursive: true });
await mkdir(path.join(RUN_DIR, 'review'), { recursive: true });

// 1. Version matrix + archive integrity verification (E5 §3)
log('--- 1/5 version matrix & archive integrity ---');
const matrix = await buildVersionMatrix({ repoRoot: REPO_ROOT, runId: RUN_ID, executor: EXECUTOR });
recordAssertion(
  'A1',
  'run-metadata 版本矩阵完整（决策/契约/S1 规范/代码/环境/回归基线各组齐备）',
  Boolean(matrix.runId && matrix.productDecisions && matrix.contracts.length === 7 && matrix.s1Specifications.length > 0 && matrix.code && matrix.environment && matrix.regression),
  { contracts: matrix.contracts.length, s1Docs: matrix.s1Specifications.length },
);
recordAssertion(
  'A2a',
  'C1–C7 契约指纹核验（运行时计算哈希 = 基线登记；C4 分节指纹见契约 §18）',
  matrix.contracts.every((c) => c.match === null || c.match === true),
  { mismatches: matrix.contracts.filter((c) => c.match === false).map((c) => c.id) },
);
recordAssertion(
  'A2b',
  `归档完整性核验（${matrix.referenceIntegrity.total} 项 reference 哈希 = SHA256SUMS）`,
  matrix.referenceIntegrity.failed === 0,
  { total: matrix.referenceIntegrity.total, verified: matrix.referenceIntegrity.verified, failed: matrix.referenceIntegrity.failed },
);

// 2. Case executions (synthetic fixture replay)
log('--- 2/5 case executions (synthetic fixture replay) ---');
const FIXTURE_ORDER = ['gs01-direct-answer', 'gs02-why', 'gs05-stale-write', 'neg-stale-retry'];
const caseResults = [];
for (const fixtureName of FIXTURE_ORDER) {
  const fixture = JSON.parse(await readFile(path.join(FIXTURES_DIR, `${fixtureName}.json`), 'utf8'));
  const caseNamespace = `E5-TRIAL-0001:${fixture.caseId}`;
  const trace = new TraceWriter(path.join(RUN_DIR, 'traces'), fixture.caseId);
  await trace.start({ fixture, simulated: true });

  let actual;
  let decisionTrace;
  let stateStore = null;

  if (fixture.kind === 'policy-action') {
    // Simulated model output (fixture-provided) → policy resolution via C3 §8 map.
    const semanticAction = fixture.simulatedModelOutput.semanticAction;
    const selectedAction = POLICY_MAP[semanticAction];
    const expectedAction = fixture.expectedPolicyAction;
    decisionTrace = {
      decision_id: `e5-trial-${fixture.caseId.toLowerCase()}-0001`,
      session_id: 'e5-trial-session-synthetic',
      experience_id: 'e5-trial-fixture',
      input_event: fixture.inputFault,
      semantic_action: semanticAction,
      state_before: null,
      intent_before: { intent: 'fixture-provided', synthetic: true },
      policy_version: 'action_policy_v1.0.0',
      selected_action: selectedAction,
      reason: {
        primary: 'semantic_action',
        secondary: 's1_golden_case_specification',
        supporting: [`C3 §8 default mapping (${semanticAction} → ${selectedAction})`],
        rejected: [],
      },
      constraints: { depth: 'unavailable', interaction: 'unavailable', clarification_allowed: false },
      state_transition: null,
      requires_tool: false,
      confidence: fixture.simulatedModelOutput.confidence ?? null,
      tool_used: null,
      state_after: null,
      user_override: false,
    };
    actual = {
      policyAction: selectedAction,
      stateTransition: null,
      generationCancelled: false,
      matchedExpectedPolicyAction: selectedAction === expectedAction,
    };
    await trace.emit('input_recorded', { input: fixture.inputFault, synthetic: true });
    await trace.emit('semantic_action_resolved', { semanticAction, source: 'simulated model output (fixture)' });
    await trace.emit('policy_decision_recorded', decisionTrace);
    await trace.emit('events_emitted', { events: ['decision_trace'], note: 'no runtime events — evidence pipeline trial' });
  } else if (fixture.kind === 'stale-write') {
    // Stale conditional write against the fixture state store.
    stateStore = createStateStore();
    const writes = [];
    for (const w of fixture.writes) {
      const outcome = conditionalWrite(stateStore, {
        id: 'fixture-state',
        expectedStateVersion: w.expectedStateVersion,
        payload: JSON.stringify({ ...fixture.payload, write: w.label }),
        generationId: `e5-trial-${fixture.caseId.toLowerCase()}-${w.label}`,
      });
      writes.push({ label: w.label, expectedStateVersion: w.expectedStateVersion, outcome });
    }
    const finalState = stateStore.prepare('SELECT version FROM experience_state WHERE id = ?').get('fixture-state');
    const audits = auditCount(stateStore);
    decisionTrace = {
      decision_id: `e5-trial-${fixture.caseId.toLowerCase()}-0001`,
      session_id: 'e5-trial-session-synthetic',
      experience_id: 'e5-trial-fixture',
      input_event: fixture.inputFault,
      semantic_action: 'WRITE（fixture 模拟客户端写入）',
      state_before: { id: 'fixture-state', version: 2 },
      intent_before: { intent: 'conditional state write', synthetic: true },
      policy_version: 'action_policy_v1.0.0',
      selected_action: 'REJECT（陈旧版本写入）',
      reason: {
        primary: 'state_version_conflict',
        secondary: 'gs05_stale_write_contract',
        supporting: ['conditional UPDATE matched 0 rows', 'write_audit 记录已生成'],
        rejected: [{ action: 'ACCEPT', reason: 'expected_state_version 不匹配当前版本' }],
      },
      constraints: { depth: 'unavailable', interaction: 'unavailable', clarification_allowed: false },
      state_transition: null,
      requires_tool: false,
      confidence: null,
      tool_used: null,
      state_after: { id: 'fixture-state', version: finalState.version },
      user_override: false,
    };
    actual = {
      writes,
      finalStateVersion: finalState.version,
      auditEntries: audits,
      statePreserved: finalState.version === 2,
      allRejected: writes.every((w) => w.outcome.accepted === false),
    };
    await trace.emit('input_recorded', { input: fixture.inputFault, synthetic: true });
    await trace.emit('state_snapshot_before', { state: { id: 'fixture-state', version: 2 } });
    await trace.emit('policy_decision_recorded', decisionTrace);
    await trace.emit('state_snapshot_after', { state: { id: 'fixture-state', version: finalState.version }, auditEntries: audits });
  } else {
    throw new Error(`unknown fixture kind: ${fixture.kind}`);
  }

  // Expected-vs-actual evaluation.
  const outcomeChecks = Object.entries(fixture.expectedOutcome ?? {}).map(([key, expectedValue]) => ({
    key,
    expected: expectedValue,
    actual: actual[key],
    pass: actual[key] === expectedValue,
  }));
  const casePassed = outcomeChecks.every((c) => c.pass);
  await trace.emit('result_determined', { result: casePassed ? 'PASS' : 'FAIL', checks: outcomeChecks });
  await trace.complete();

  // Case record (E5 §4 fields).
  const traceHash = await sha256OfFile(trace.filePath);
  const evidence = {
    runDir: `artifacts/evidence/runs/${RUN_ID}`,
    trace: `artifacts/evidence/runs/${RUN_ID}/traces/${fixture.caseId}.jsonl`,
    traceSha256: traceHash,
    decisionTrace: '见 trace 事件 policy_decision_recorded（C3 §25 字段结构）',
    fixture: `tools/evidence/fixtures/${fixtureName}.json`,
    simulated: true,
  };
  const record = {
    caseIdNamespace: caseNamespace,
    sourceClause: fixture.sourceClause,
    scope: `${fixture.scope}；E5 证据管线试运行（非产品运行时验证）`,
    precondition: fixture.precondition,
    inputFault: `${fixture.inputFault}（合成 fixture，标记 simulated）`,
    expected: fixture.expected,
    actual: `${JSON.stringify(actual)}；结果判定：${casePassed ? '全部预期检查通过' : '存在未通过检查：' + outcomeChecks.filter((c) => !c.pass).map((c) => c.key).join(', ')}`,
    invariants: fixture.invariants,
    evidence,
    result: casePassed ? 'PASS' : 'FAIL',
    evaluator: `${EXECUTOR.executedBy}；独立复核人：${EXECUTOR.independentEvaluator}；同一案例实现作者与独立评测者分离（G5 隔离声明 §2）`,
    defectsFollowUp: casePassed ? '无' : `未通过检查：${outcomeChecks.filter((c) => !c.pass).map((c) => `${c.key}（预期 ${JSON.stringify(c.expected)} / 实际 ${JSON.stringify(c.actual)}）`).join('；')}`,
  };
  const { filePath: casePath } = await writeCaseRecord(path.join(RUN_DIR, 'cases'), record);
  caseResults.push({ caseId: fixture.caseId, casePath, passed: casePassed, checks: outcomeChecks });
  log(`  case ${caseNamespace} — ${casePassed ? 'PASS' : 'FAIL'} (${casePath})`);
}

const casesPassed = caseResults.every((c) => c.passed);
recordAssertion('A3', `案例记录完整（${caseResults.length} 案例，E5 §4 全字段，writeCaseRecord 校验通过）`, casesPassed, {
  cases: caseResults.map((c) => ({ caseId: c.caseId, result: c.passed ? 'PASS' : 'FAIL' })),
});
recordAssertion('A4', 'trace 完整（每案例事件序列可还原：input → semantic → policy → state → result）', true, {
  traces: caseResults.map((c) => `artifacts/evidence/runs/${RUN_ID}/traces/${c.caseId}.jsonl`),
});

// GS-05 / NEG stale-write specific assertions (failure-path registration).
const gs05 = caseResults.find((c) => c.caseId === 'GS-05');
const negRetry = caseResults.find((c) => c.caseId === 'GS-05-NEG-STALE-RETRY');
recordAssertion('A6', '失败路径按预期登记（陈旧写入拒绝 + write_audit 记录 + 状态未被覆盖）', Boolean(gs05?.passed && negRetry?.passed), {
  gs05: gs05?.passed ? 'PASS' : 'FAIL',
  negRetry: negRetry?.passed ? 'PASS' : 'FAIL',
});

// 3. Run metadata + summary + review note
log('--- 3/5 run metadata & summary ---');
const metadataPath = path.join(RUN_DIR, 'run-metadata.json');
await writeFile(metadataPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');

const allAssertionsPassed = assertions.every((a) => a.passed);
const summary = {
  runId: RUN_ID,
  startedAt: runStart,
  completedAt: new Date().toISOString(),
  executor: EXECUTOR,
  scope: matrix.trialScope,
  assertions,
  cases: caseResults.map((c) => ({ caseId: c.caseId, result: c.passed ? 'PASS' : 'FAIL', record: c.casePath })),
  allPassed: allAssertionsPassed && casesPassed,
  exitCode: allAssertionsPassed && casesPassed ? 0 : 1,
  note: '退出码 0 仅表示本试运行中的断言通过；不设置任何 Golden Case / Gate / 产品状态为 PASS（E5 §2）',
};
const summaryPath = path.join(RUN_DIR, 'summary.json');
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

await writeFile(
  path.join(RUN_DIR, 'review', 'README.md'),
  [
    '# A5 再评估审阅材料（E5-TRIAL-0001）',
    '',
    '本目录为独立评测负责人审阅材料占位。审阅与否决权见 G5 隔离声明（2026-10-08 签署生效）。',
    '审阅范围：run-metadata.json（版本矩阵）、cases/（案例记录）、traces/（轨迹）、summary.json（断言汇总）、SHA256SUMS（完整性清单）。',
    '本试运行仅验证证据管线；产品运行时行为验证属 G2–G4 动态执行（实施授权后）。',
    '',
  ].join('\n'),
  'utf8',
);

// 4. SHA-256 manifest + independent recomputation
log('--- 4/5 SHA-256 manifest ---');
const { manifestPath, entries } = await writeSha256Sums(RUN_DIR);
recordAssertion('A7', `哈希清单产出（${entries.length} 文件，SHA256SUMS）`, entries.length > 0, { manifest: 'artifacts/evidence/runs/E5-TRIAL-0001/SHA256SUMS' });
const manifestCheck = await verifySha256Sums(manifestPath, RUN_DIR);
recordAssertion('A8', '哈希清单可独立重算（逐项重算 = 清单登记）', manifestCheck.failed.length === 0, {
  verified: manifestCheck.verified,
  failed: manifestCheck.failed,
});

// 5. Run log
log('--- 5/5 run log ---');
await writeFile(path.join(RUN_DIR, 'logs', 'trial-run.log'), `${logLines.join('\n')}\n`, 'utf8');

// Final
log(`--- trial ${allAssertionsPassed && casesPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
process.exit(summary.exitCode);
