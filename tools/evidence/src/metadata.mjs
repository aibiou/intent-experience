// metadata.mjs — run-metadata builder (E5 §3 version matrix) with real-time
// integrity verification of the contract archive.
// Zero dependencies: node:crypto, node:fs, node:child_process, node:sqlite.

import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { sha256OfFile } from './hashes.mjs';

// C1–C7 registered authority (contract-authority-baseline v1.2.1 §1).
// C4 is the independent formal contract; its §1–§17 section fingerprints are
// registered in the contract itself (§18) — referenced, not re-derived here.
export const CONTRACT_AUTHORITY = [
  {
    id: 'C1', name: 'Core Schema（核心结构）', version: 'core_schema_v1.0.0',
    relPath: 'docs/product/reference/12｜Core Schema Specification V1（核心数据结构规范 V1）.md',
    registeredHash: 'e6350ae427f6ccb75ea317345398932b2bc6fddd3b3b57af52296ba58ca2e20c',
  },
  {
    id: 'C2', name: 'State Machine（状态机）', version: 'state_machine_v1.0.0',
    relPath: 'docs/product/reference/13｜State Machine Specification V1（状态机规范 V1）.md',
    registeredHash: 'feb1130cacc0d628b983a5f46815c46fdb99e35245c797cdad476f29ba3499a1',
  },
  {
    id: 'C3', name: 'Action & Policy（动作与策略）', version: 'action_policy_v1.0.0（基线赋予）',
    relPath: 'docs/product/reference/14｜Action & Policy Contract V1（动作与策略契约 V1）.md',
    registeredHash: '15139925ae66c023b93e9c2adff3699a4812a1baedb228ebf2dc555db8c46c3f',
  },
  {
    id: 'C4', name: 'LLM Contract（大模型契约，正式文件）', version: 'C4-LLM-Contract-v1.0.0',
    relPath: 'docs/product/contracts/C4-LLM-Contract-v1.0.0.md',
    registeredHash: null, // §1–§17 分节指纹登记于契约 §18；整文件哈希仅作信息记录
    registeredNote: '§1–§17 全节 SHA-256 范围指纹已登记于 C4-LLM-Contract-v1.0.0.md §18（K-4/K-5，CR-10/CR-11 关闭）',
  },
  {
    id: 'C5', name: 'API（接口）', version: 'api_v1.0.0',
    relPath: 'docs/product/reference/16｜API Contract V1（接口契约 V1）.md',
    registeredHash: '2470f0a33d38c0561fcf7b10e4d006b69f75eb4327e33ba48c365a71f21f82eb',
  },
  {
    id: 'C6', name: 'Event & Analytics（事件与分析）', version: 'analytics_v1.0.0',
    relPath: 'docs/product/reference/17｜Event & Analytics Contract V1（事件与数据分析契约 V1）.md',
    registeredHash: '474d73c488744cf22fba2ce2013bfc63b2d7ac6129bf758c4fc46f30a5372671',
  },
  {
    id: 'C7', name: 'Evaluation（评测与验收）', version: 'evaluation_v1.0.0',
    relPath: 'docs/product/reference/18｜Evaluation System V1（评测与验收体系 V1）.md',
    registeredHash: 'ec07d4e68a9f5afaa6eea0c6a3a160619b2950083d0a2ca5c30d4b6f7cf563b0',
  },
];

// Parse the reference archive integrity manifest (36 items) and recompute every
// hash. Returns per-entry comparison — a real byte-integrity verification.
export async function verifyReferenceIntegrity(repoRoot) {
  const manifestPath = path.join(repoRoot, 'docs/product/reference/SHA256SUMS');
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(manifestPath, 'utf8');
  const entries = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([0-9a-f]{64})\s\s(.+)$/);
    if (!m) {
      entries.push({ path: trimmed, registered: '<malformed>', computed: '<malformed line>', match: false });
      continue;
    }
    const [, registered, relPath] = m;
    let computed = '<file missing>';
    try {
      computed = await sha256OfFile(path.join(repoRoot, 'docs/product/reference', relPath));
    } catch { /* missing file recorded honestly */ }
    entries.push({ path: relPath, registered, computed, match: computed === registered });
  }
  return {
    manifestPath: 'docs/product/reference/SHA256SUMS',
    total: entries.length,
    verified: entries.filter((e) => e.match).length,
    failed: entries.filter((e) => !e.match),
    entries,
  };
}

// Compute C1–C7 hashes at runtime and compare against the registered authority.
export async function verifyContractFingerprints(repoRoot) {
  const results = [];
  for (const contract of CONTRACT_AUTHORITY) {
    let computed = '<file missing>';
    try {
      computed = await sha256OfFile(path.join(repoRoot, contract.relPath));
    } catch { /* missing file recorded honestly */ }
    const match = contract.registeredHash === null
      ? null // C4: full-file hash is informational; section fingerprints live in contract §18
      : computed === contract.registeredHash;
    results.push({
      id: contract.id,
      name: contract.name,
      version: contract.version,
      source: contract.relPath,
      registeredHash: contract.registeredHash,
      registeredNote: contract.registeredNote ?? null,
      computedHash: computed,
      match,
    });
  }
  return {
    contracts: results,
    allMatch: results.every((r) => r.match === null || r.match === true),
  };
}

export async function gitState(repoRoot) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  return {
    commit,
    workTreeClean: dirty === '',
    uncommittedEntries: dirty === '' ? [] : dirty.split('\n'),
  };
}

export async function sqliteVersion() {
  const db = new DatabaseSync(':memory:');
  const row = db.prepare('SELECT sqlite_version() AS v').get();
  db.close();
  return row.v;
}

// Full E5 §3 version matrix for one run.
export async function buildVersionMatrix({ repoRoot, runId, executor }) {
  const git = await gitState(repoRoot);
  const refIntegrity = await verifyReferenceIntegrity(repoRoot);
  const contractCheck = await verifyContractFingerprints(repoRoot);
  const s1Docs = refIntegrity.entries
    .filter((e) => e.path.startsWith('P3-S1'))
    .map((e) => ({ source: `docs/product/reference/${e.path}`, sha256: e.computed, archiveIntegrity: e.match ? 'VERIFIED vs SHA256SUMS' : 'MISMATCH' }));

  return {
    runId,
    recordedAt: new Date().toISOString(),
    executor,
    trialScope: 'E5 证据管线试运行（合成 fixtures）：验证版本绑定、案例记录、trace 与哈希清单的完整性与可审计性；不是产品运行时行为验证（G2–G4 动态执行属实施授权后）',
    license: { id: 'E5-SCOPED-LICENSE-01', decision: 'PD-17（CR-15 选项 A）', issued: '2026-10-08' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md（PODR-001 v1.0.4）',
      keyDecisions: [
        'PD-01 P2 状态以 E8 为准（CLOSURE CANDIDATE / BLOCKED）',
        'PD-02 两段式门禁（P2-EVIDENCE-8.1）',
        'PD-03 SRC-24 为 S1 操作规范候选',
        'PD-05 首体验 = 探索型问题体验',
        'PD-06 WHAT_IF 仅基础单次模拟',
        'PD-07 S1 不持久化跨会话 Memory',
        'PD-08 P0 硬门槛零容忍；不编造统计阈值',
        'PD-11 案例 ID 六类命名空间',
        'PD-12 WHY > WHAT_IF 仅同层解释顺序',
        'PD-13 严重度按来源范围适用',
        'PD-16 规范字段名 expected_state_version',
        'PD-17 E5 环境搭建授权方式：选项 A（scoped 预授权许可）',
      ],
      note: '各 PD 日期以 product-owner-decisions-v1.md 原文为准；PD-14/PD-15/PD-16/PD-17 为 2026-10-08 会话裁决',
    },
    contracts: contractCheck.contracts,
    s1Specifications: s1Docs,
    stateMachine: { version: 'state_machine_v1.0.0', source: 'SRC-05 / 13' },
    policy: { version: 'action_policy_v1.0.0（基线赋予）', source: 'SRC-06 / 14', status: 'Draft for Product Freeze；语义空缺 G-1…G-7 已登记（C3-SEMANTIC-GAP-REGISTER-01）' },
    api: { version: 'api_v1.0.0', source: 'SRC-07 / 16' },
    event: { version: 'analytics_v1.0.0', source: 'SRC-08 / 17' },
    evaluation: { version: 'evaluation_v1.0.0', source: 'SRC-09 / 18' },
    code: git,
    prompt: { version: 'unavailable', reason: '产品 Prompt 模板尚不存在（实施授权前）；按 E5 §3 标记 unavailable' },
    model: {
      provider: 'unavailable', modelId: 'unavailable', parameters: null, region: 'unavailable', sdkVersion: 'unavailable',
      reason: '本试运行不调用 LLM；模型输出由合成 fixture 提供并显式标记为 simulated',
    },
    corpusAndFixtures: { note: '合成 fixtures（见 fixtures/），版本 1.0.0，哈希由试运行记录于案例证据字段' },
    regression: {
      baselineRunId: 'BASELINE_NOT_AVAILABLE',
      comparisonResult: 'not performed',
      note: '无适用历史运行；按 E5 §3 不得伪造比较结果',
    },
    environment: {
      nodeVersion: process.version,
      nodeExecutable: process.execPath,
      nextjs: { used: false, note: '证据执行器为纯 Node ESM（零依赖）；Next.js 不参与证据管线' },
      platform: process.platform,
      arch: process.arch,
      database: { engine: 'node:sqlite（in-memory，fixture 状态存储）', sqliteVersion: await sqliteVersion() },
    },
    referenceIntegrity: {
      manifest: refIntegrity.manifestPath,
      total: refIntegrity.total,
      verified: refIntegrity.verified,
      failed: refIntegrity.failed.length,
    },
  };
}
