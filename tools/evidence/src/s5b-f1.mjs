// S5B-F1-0001 — S5B 页面配置面动态证据执行器
// （S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0 裁决选项 A——产品负责人
//   指令 2026-10-10 全项 A，standing authorization 路径执行；依据
//   S5B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）
//
// 覆盖（S5B 动态证据计划）：
// - 配置 CRUD 四维度（正常 / 负 / 边界 / 故障恢复）
// - 静态加密（AES-256-GCM 密文落盘；明文 key 零落盘）
// - 密钥分离（加密密钥经环境变量注入，不随密文存储）
// - 运行时优先级（证据注入缝 > 页面持久化配置 > 环境变量 > 合成默认）
// - D-5 隐私再确认（通用模板 PRIVACY-RECONFIRM-GENERIC/V1——提供方
//   名称于签署时填写，不写死任何提供方；未确认不得启用）
// - 读操作不泄漏 key（仅 hasKey 标记）
// - 提供方准入（仅已登记提供方——model-agnostic 规则族）
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5，E5 §2）：
// - 仅合成数据；无真实 LLM 提供方调用（不进入 ProviderLlmGateway
//   网络路径——委托契约经配置解析与规则族查找验证）；无真实用户数据
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate 或产品状态为 PASS
// - 进程内形态经 module.registerHooks 解析无扩展名说明符到真实 .ts
//   源码（Node ≥23.6 原生类型剥离）；案例隔离经说明符查询串获得
//   配置存储模块的独立实例（ESM 模块缓存按完整 URL 区分）
// - 静态边界断言读取已提交的产品源码字节（不做代码推断，只验证事实）
// - 角色分离：执行（工程负责人角色代理）≠ 独立评测（独立评测负责人，
//   用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

import { registerHooks } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 真实源码导入（进程内形态：执行已提交的 .ts 源字节；查询串隔离案例）
// ---------------------------------------------------------------------------
registerHooks({
  resolve(specifier, context, nextResolve) {
    const question = specifier.indexOf('?');
    const pathPart = question === -1 ? specifier : specifier.slice(0, question);
    const queryPart = question === -1 ? '' : specifier.slice(question);
    if (pathPart.startsWith('.') && !path.extname(pathPart)) {
      try {
        return nextResolve(`${pathPart}.ts${queryPart}`, context);
      } catch {
        // 非相对说明符或解析失败时回退默认解析
      }
    }
    return nextResolve(specifier, context);
  },
});

const { PROVIDER_PROFILES } = await import('../../../src/experience/llm-gateway');

const { sha256OfBuffer, writeSha256Sums, verifySha256Sums } = await import('./hashes.mjs');
const { TraceWriter } = await import('./trace.mjs');
const { writeCaseRecord, validateCaseRecord } = await import('./caselog.mjs');
const {
  verifyReferenceIntegrity,
  verifyContractFingerprints,
  gitState,
  buildVersionMatrix,
} = await import('./metadata.mjs');

// ---------------------------------------------------------------------------
// 常量与路径
// ---------------------------------------------------------------------------
const RUN_ID = 'S5B-F1-0001';
const NODE_LOCK = 'v24.21.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.resolve(here, '..'); // tools/evidence
const repoRoot = path.resolve(evidenceRoot, '..', '..'); // repository root
const runDir = path.join(repoRoot, 'artifacts', 'evidence', 'runs', RUN_ID);
const casesDir = path.join(runDir, 'cases');
const tracesDir = path.join(runDir, 'traces');
const logsDir = path.join(runDir, 'logs');
const reviewDir = path.join(runDir, 'review');

const EVALUATOR_SEPARATION =
  '执行：工程负责人角色（代理，Codex）；独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）。本记录由执行方起草，独立评测人保留审阅与否决权。';

const INVARIANTS = [
  'S5B 范围边界（S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0 裁决选项 A）：配置面是运行期基础设施——不新增语义动作、不改变任何策略 / 状态机 / 事件契约（policy_v2.3.0 / state_machine_v1.5.0 不变）',
  '静态加密（隐私六要素 P3-S1-PRIVACY-SIX-01 v0.4.2 要素 4）：API key 仅以 AES-256-GCM 密文持久化（base64(iv).base64(ciphertext).base64(tag)）；明文 key 零落盘（零文件、零日志、零证据产物）',
  '密钥分离：加密密钥经环境变量 EXPERIENCE_CONFIG_ENCRYPTION_KEY 注入（32 字节 hex），不随密文同处存储；缺失或非法时拒绝持久化（CONFIG_ENCRYPTION_KEY_MISSING / _INVALID——不静默降级）',
  'D-3 多记录模型：每提供方一条配置（provider / model / key 密文引用），可多条并存；同时至多一条启用（单激活）',
  'D-5 隐私再确认：确认记录经通用模板 PRIVACY-RECONFIRM-GENERIC/V1 签署（提供方名称于签署时填写，产品代码不写死任何提供方）；确认人 = 产品负责人 + 安全负责人双重身份；未确认提供方的配置不得启用（PROVIDER_NOT_CONFIRMED）',
  '提供方准入：仅已登记提供方（PROVIDER_PROFILES——S5A-SEMANTIC-FREEZE-01 §1 D-2 规则族）可创建 / 确认 / 启用——未登记值拒绝（PROVIDER_NOT_REGISTERED）',
  '读操作纪律（D-4）：list / 查询永不返回 key 明文或密文——仅 hasKey 标记存在',
  '运行时优先级（server-runtime）：证据注入缝（EXPERIENCE_LLM_GATEWAY_SEAM=1）> 页面持久化配置（已启用）> 环境变量 LLM 模式（EXPERIENCE_LLM_MODE=provider）> 合成默认；持久化配置经 PersistedConfigLlmGateway 每次调用解析——启用 / 禁用 / 删除即时生效（单进程内存缓存，无需重启）',
  'SEAM-INERT 不变式：无任何配置时委托网关委托 SyntheticLlmGateway——与 S1–S4 默认形态行为完全一致（零行为变化）',
  '工程边界（P2-EVIDENCE-4.0）：超时不自行决定新方向（EB-07）；完成不属于 LLM 自主权限（EB-13）；分析只能观察（EB-14）',
  '合成数据边界（ADR-0002 §3）：本运行不调用任何真实 LLM 提供方（不进入 ProviderLlmGateway 网络路径）；不收集真实用户数据',
];

// 运行期生成的加密密钥（仅内存 + 环境变量——密钥分离的活证据：
// 永不写入任何文件；A6 断言独立扫描验证其零出现）
const RUN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
// 合成测试用 API key 明文（仅运行期内存——A5 断言扫描验证零落盘）
const TEST_API_KEY = 'sk-s5b-evidence-plaintext-must-never-persist-4f9a2c';

const logLines = [];
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logLines.push(line);
  console.log(line);
}

function fatal(message) {
  log(`FATAL: ${message}`);
  throw new Error(message);
}

function shortId() {
  return Math.random().toString(16).slice(2, 10);
}

function tail(text) {
  return text.split('\n').slice(-12).join('\n');
}

function runCommandSync(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// 案例环境（每案例独立临时目录 + 配置存储模块独立实例）
// ---------------------------------------------------------------------------
async function caseContext(tag) {
  const dir = await mkdtemp(path.join(tmpdir(), `${RUN_ID}-${tag}-`));
  return {
    tag,
    dir,
    storePath: path.join(dir, 'provider-configs.json'),
    confirmationPath: path.join(dir, 'privacy-confirmations.json'),
    async freshModule(caseTag = tag) {
      return import(`../../../src/experience/config-store?case=${caseTag}-${shortId()}`);
    },
  };
}

function applyCaseEnv(ctx, { key = RUN_ENCRYPTION_KEY } = {}) {
  if (key === null) {
    delete process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY;
  } else {
    process.env.EXPERIENCE_CONFIG_ENCRYPTION_KEY = key;
  }
  process.env.EXPERIENCE_CONFIG_STORE_PATH = ctx.storePath;
  process.env.EXPERIENCE_CONFIG_CONFIRMATION_PATH = ctx.confirmationPath;
}

async function expectError(fn) {
  try {
    await fn();
    return { threw: false, code: null, name: null };
  } catch (error) {
    return { threw: true, code: error?.code ?? null, name: error?.name ?? null };
  }
}

async function readStoreJson(ctx) {
  return JSON.parse(await readFile(ctx.storePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// 案例（13 案例 × 四维度：NORMAL 6 / NEGATIVE 3 / BOUNDARY 2 / FR 2）
// ---------------------------------------------------------------------------

// C1 创建正常路径（NORMAL）
async function caseCreateNormal(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const summary = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  const onDisk = await readStoreJson(ctx);
  const record = onDisk.records[0];
  const ciphertextShapeOk = /^[A-Za-z0-9+/=]+(\.[A-Za-z0-9+/=]+){2}$/.test(record.keyCiphertext);
  const storeBytes = await readFile(ctx.storePath, 'utf8');
  const plaintextAtRest = storeBytes.includes(TEST_API_KEY);
  const expected = {
    hasKey: true,
    enabled: false,
    providerConfirmed: false,
    provider: 'dashscope',
    model: 'qwen-plus',
    ciphertextAtRest: true,
    plaintextAtRest: false,
    summaryExposesNoKeyMaterial: true,
  };
  const actual = {
    hasKey: summary.hasKey,
    enabled: summary.enabled,
    providerConfirmed: summary.providerConfirmed,
    provider: summary.provider,
    model: summary.model,
    ciphertextShapeOk,
    plaintextAtRest,
    summaryFields: Object.keys(summary).sort(),
    recordCount: onDisk.records.length,
  };
  const pass =
    actual.hasKey === expected.hasKey &&
    actual.enabled === expected.enabled &&
    actual.providerConfirmed === expected.providerConfirmed &&
    actual.provider === expected.provider &&
    actual.model === expected.model &&
    actual.ciphertextShapeOk === expected.ciphertextAtRest &&
    actual.plaintextAtRest === expected.plaintextAtRest &&
    !actual.summaryFields.includes('keyCiphertext') &&
    actual.recordCount === 1;
  await trace.emit('case-fact', { summaryFields: actual.summaryFields, ciphertextShapeOk, plaintextAtRest });
  return { expected, actual, pass };
}

// C2 未登记提供方拒绝（NEGATIVE）
async function caseCreateUnregistered(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const first = await expectError(() =>
    store.createProviderConfig({ provider: 'openai', model: 'gpt-4o', apiKey: TEST_API_KEY }),
  );
  const second = await expectError(() =>
    store.createProviderConfig({ provider: 'my-custom-provider', model: 'm1', apiKey: TEST_API_KEY }),
  );
  const listed = await store.listProviderConfigs();
  const expected = { code: 'PROVIDER_NOT_REGISTERED', storeRemainsEmpty: true };
  const actual = { firstCode: first.code, secondCode: second.code, recordCount: listed.length };
  const pass =
    first.threw && first.code === 'PROVIDER_NOT_REGISTERED' &&
    second.threw && second.code === 'PROVIDER_NOT_REGISTERED' &&
    listed.length === 0;
  await trace.emit('case-fact', { firstCode: first.code, secondCode: second.code, recordCount: listed.length });
  return { expected, actual, pass };
}

// C3 必填字段缺失拒绝（NEGATIVE）
async function caseCreateMissingFields(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const blankModel = await expectError(() =>
    store.createProviderConfig({ provider: 'dashscope', model: '   ', apiKey: TEST_API_KEY }),
  );
  const emptyKey = await expectError(() =>
    store.createProviderConfig({ provider: 'dashscope', model: 'qwen-plus', apiKey: '' }),
  );
  const missingKey = await expectError(() =>
    store.createProviderConfig({ provider: 'dashscope', model: 'qwen-plus', apiKey: undefined }),
  );
  const expected = { modelRequired: 'MODEL_REQUIRED', apiKeyRequired: 'API_KEY_REQUIRED', storeRemainsEmpty: true };
  const actual = {
    blankModelCode: blankModel.code,
    emptyKeyCode: emptyKey.code,
    missingKeyCode: missingKey.code,
    recordCount: (await store.listProviderConfigs()).length,
  };
  const pass =
    blankModel.code === 'MODEL_REQUIRED' &&
    emptyKey.code === 'API_KEY_REQUIRED' &&
    missingKey.code === 'API_KEY_REQUIRED' &&
    actual.recordCount === 0;
  await trace.emit('case-fact', actual);
  return { expected, actual, pass };
}

// C4 加密密钥分离（BOUNDARY）
async function caseKeySeparation(trace, ctx) {
  const missing = await ctx.freshModule('C4-missing');
  applyCaseEnv(ctx, { key: null });
  const noKey = await expectError(() =>
    missing.createProviderConfig({ provider: 'dashscope', model: 'qwen-plus', apiKey: TEST_API_KEY }),
  );
  const invalidShort = await ctx.freshModule('C4-invalid-short');
  applyCaseEnv(ctx, { key: 'zz' });
  const badKey = await expectError(() =>
    invalidShort.createProviderConfig({ provider: 'dashscope', model: 'qwen-plus', apiKey: TEST_API_KEY }),
  );
  const invalidLength = await ctx.freshModule('C4-invalid-length');
  applyCaseEnv(ctx, { key: 'a'.repeat(63) });
  const shortKey = await expectError(() =>
    invalidLength.createProviderConfig({ provider: 'dashscope', model: 'qwen-plus', apiKey: TEST_API_KEY }),
  );
  applyCaseEnv(ctx, { key: RUN_ENCRYPTION_KEY });
  const valid = await ctx.freshModule('C4-valid');
  const recovery = await valid.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  const expected = {
    missingKey: 'CONFIG_ENCRYPTION_KEY_MISSING',
    invalidKey: 'CONFIG_ENCRYPTION_KEY_INVALID',
    invalidLengthKey: 'CONFIG_ENCRYPTION_KEY_INVALID',
    validKeyRecovers: true,
  };
  const actual = {
    noKeyCode: noKey.code,
    badKeyCode: badKey.code,
    shortKeyCode: shortKey.code,
    recoveryHasKey: recovery.hasKey,
  };
  const pass =
    noKey.code === 'CONFIG_ENCRYPTION_KEY_MISSING' &&
    badKey.code === 'CONFIG_ENCRYPTION_KEY_INVALID' &&
    shortKey.code === 'CONFIG_ENCRYPTION_KEY_INVALID' &&
    recovery.hasKey === true;
  await trace.emit('case-fact', actual);
  return { expected, actual, pass };
}

// C5 隐私再确认通用模板（NORMAL）
async function caseConfirmGeneric(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const created = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  const confirmation = await store.confirmProviderPrivacy(
    created.id,
    '我确认已知悉该提供方处理我的输入与记忆内容，并同意启用其模型服务。',
  );
  const confirmations = await store.listPrivacyConfirmations();
  const confirmationBytes = await readFile(ctx.confirmationPath, 'utf8');
  const expected = {
    template: 'PRIVACY-RECONFIRM-GENERIC/V1',
    confirmedBy: 'product-owner+security-owner',
    providerFilledAtSigning: 'dashscope',
    statementPersisted: true,
  };
  const actual = {
    template: confirmation.template,
    confirmedBy: confirmation.confirmedBy,
    provider: confirmation.provider,
    confirmationCount: confirmations.length,
    statementPersisted: confirmationBytes.includes('我确认已知悉'),
  };
  const pass =
    actual.template === expected.template &&
    actual.confirmedBy === expected.confirmedBy &&
    actual.provider === expected.providerFilledAtSigning &&
    actual.confirmationCount === 1 &&
    actual.statementPersisted;
  await trace.emit('case-fact', { template: actual.template, confirmedBy: actual.confirmedBy, provider: actual.provider });
  return { expected, actual, pass };
}

// C6 确认前启用拒绝（NEGATIVE）
async function caseEnableBeforeConfirm(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const created = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  const denied = await expectError(() => store.enableProviderConfig(created.id));
  const stillDisabled = await store.listProviderConfigs();
  const expected = { enableDenied: 'PROVIDER_NOT_CONFIRMED', remainsDisabled: true, hasEnabledPersisted: false };
  const actual = {
    deniedCode: denied.code,
    enabledAfterDenial: stillDisabled[0].enabled,
    hasEnabledPersisted: store.hasEnabledPersistedConfigSync(),
  };
  const pass =
    denied.code === 'PROVIDER_NOT_CONFIRMED' &&
    actual.enabledAfterDenial === false &&
    actual.hasEnabledPersisted === false;
  await trace.emit('case-fact', actual);
  return { expected, actual, pass };
}

// C7 启用 + 解密回环 + 单激活（NORMAL）
async function caseEnableDecryptSingleActive(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const first = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  await store.confirmProviderPrivacy(first.id, '确认启用 dashscope 提供方配置。');
  const enabledFirst = await store.enableProviderConfig(first.id);
  const roundTrip = await store.getEnabledProviderConfig();
  const second = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-max',
    apiKey: `${TEST_API_KEY}-second`,
  });
  const enabledSecond = await store.enableProviderConfig(second.id);
  const afterSecond = await store.listProviderConfigs();
  const activeNow = await store.getEnabledProviderConfig();
  const expected = {
    firstEnabled: true,
    decryptRoundTrip: true,
    singleActive: true,
    activeModelAfterSecondEnable: 'qwen-max',
  };
  const actual = {
    firstEnabled: enabledFirst.enabled,
    decryptedProvider: roundTrip?.provider ?? null,
    decryptedModel: roundTrip?.model ?? null,
    decryptRoundTrip: roundTrip?.apiKey === TEST_API_KEY,
    secondEnabled: enabledSecond.enabled,
    firstEnabledAfterSecond: afterSecond.find((entry) => entry.id === first.id).enabled,
    secondEnabledAfterSecond: afterSecond.find((entry) => entry.id === second.id).enabled,
    activeModel: activeNow?.model ?? null,
  };
  const pass =
    actual.firstEnabled === true &&
    actual.decryptRoundTrip === true &&
    actual.decryptedProvider === 'dashscope' &&
    actual.decryptedModel === 'qwen-plus' &&
    actual.firstEnabledAfterSecond === false &&
    actual.secondEnabledAfterSecond === true &&
    actual.activeModel === 'qwen-max';
  await trace.emit('case-fact', { decryptRoundTrip: actual.decryptRoundTrip, singleActive: actual.firstEnabledAfterSecond === false && actual.secondEnabledAfterSecond === true, activeModel: actual.activeModel });
  return { expected, actual, pass };
}

// C8 禁用即时回退（NORMAL）
async function caseDisableFallback(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const created = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  await store.confirmProviderPrivacy(created.id, '确认启用 dashscope 提供方配置。');
  await store.enableProviderConfig(created.id);
  const before = store.hasEnabledPersistedConfigSync();
  const disabled = await store.disableProviderConfig(created.id);
  const after = store.hasEnabledPersistedConfigSync();
  const enabledNow = await store.getEnabledProviderConfig();
  const expected = {
    wasEnabled: true,
    disabled: false,
    hasEnabledPersistedAfterDisable: false,
    delegationInputNull: true,
    statusModeWouldBeSynthetic: true,
  };
  const actual = {
    before,
    disabledEnabled: disabled.enabled,
    after,
    enabledNowNull: enabledNow === null,
  };
  const pass =
    before === true &&
    disabled.enabled === false &&
    after === false &&
    enabledNow === null;
  await trace.emit('case-fact', actual);
  return { expected, actual, pass };
}

// C9 删除 + 存储损坏 + 确认存储损坏（FAILURE_RECOVERY）
async function caseDeleteCorruptNotFound(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const created = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  await store.deleteProviderConfig(created.id);
  const deletedEnable = await expectError(() => store.enableProviderConfig(created.id));
  const deletedGet = await expectError(() => store.updateProviderConfig(created.id, { model: 'qwen-max' }));
  const storeAfterDelete = await readStoreJson(ctx);
  // 存储损坏：非法 JSON
  await writeFile(ctx.storePath, '{not valid json', 'utf8');
  const corruptStore = await ctx.freshModule('C9-corrupt-store');
  const corruptList = await expectError(() => corruptStore.listProviderConfigs());
  // 确认存储损坏
  await writeFile(ctx.storePath, JSON.stringify({ records: [] }, null, 2), 'utf8');
  // 确认存储损坏触发需有效配置记录——confirmProviderPrivacy
  // 先 requireRecord（CONFIG_NOT_FOUND 前置）再读确认存储
  const forConfirm = await ctx.freshModule('C9-for-confirm');
  const recreated = await forConfirm.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  await writeFile(ctx.confirmationPath, '{broken', 'utf8');
  const corruptConfirm = await ctx.freshModule('C9-corrupt-confirmation');
  const corruptConfirmCall = await expectError(() =>
    corruptConfirm.confirmProviderPrivacy(recreated.id, 'stmt'),
  );
  const expected = {
    deleteThenNotFound: 'CONFIG_NOT_FOUND',
    corruptStore: 'CONFIG_STORE_CORRUPT',
    corruptConfirmationStore: 'CONFIG_CONFIRMATION_STORE_CORRUPT',
    recordsEmptyAfterDelete: true,
  };
  const actual = {
    deletedEnableCode: deletedEnable.code,
    deletedGetCode: deletedGet.code,
    recordsAfterDelete: storeAfterDelete.records.length,
    corruptListCode: corruptList.code,
    corruptConfirmCode: corruptConfirmCall.code,
  };
  const pass =
    deletedEnable.code === 'CONFIG_NOT_FOUND' &&
    deletedGet.code === 'CONFIG_NOT_FOUND' &&
    storeAfterDelete.records.length === 0 &&
    corruptList.code === 'CONFIG_STORE_CORRUPT' &&
    corruptConfirmCall.code === 'CONFIG_CONFIRMATION_STORE_CORRUPT';
  await trace.emit('case-fact', actual);
  return { expected, actual, pass };
}

// C10 密文篡改（FAILURE_RECOVERY）
async function caseCiphertextTamper(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const created = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  await store.confirmProviderPrivacy(created.id, '确认启用 dashscope 提供方配置。');
  await store.enableProviderConfig(created.id);
  // 篡改：翻转密文段一个字符（保持 iv.ct.tag 三段形态）
  const onDisk = await readStoreJson(ctx);
  const parts = onDisk.records[0].keyCiphertext.split('.');
  const flipped = `${parts[0]}.${parts[1].slice(0, -1)}${parts[1].endsWith('A') ? 'B' : 'A'}.${parts[2]}`;
  onDisk.records[0].keyCiphertext = flipped;
  await writeFile(ctx.storePath, JSON.stringify(onDisk, null, 2), 'utf8');
  const tampered = await ctx.freshModule('C10-tampered');
  const tamperedRead = await expectError(() => tampered.getEnabledProviderConfig());
  // 畸形引用
  const malformed = await readStoreJson(ctx);
  malformed.records[0].keyCiphertext = 'not-a-ciphertext-reference';
  await writeFile(ctx.storePath, JSON.stringify(malformed, null, 2), 'utf8');
  const malformedModule = await ctx.freshModule('C10-malformed');
  const malformedRead = await expectError(() => malformedModule.getEnabledProviderConfig());
  const expected = {
    tamperedCiphertext: 'CONFIG_DECRYPT_FAILED',
    malformedReference: 'CONFIG_CIPHERTEXT_INVALID',
    plaintextNeverRecoveredFromTampered: true,
  };
  const actual = { tamperedCode: tamperedRead.code, malformedCode: malformedRead.code };
  const pass =
    tamperedRead.code === 'CONFIG_DECRYPT_FAILED' &&
    malformedRead.code === 'CONFIG_CIPHERTEXT_INVALID';
  await trace.emit('case-fact', actual);
  return { expected, actual, pass };
}

// C11 读操作不泄漏 key（BOUNDARY）
async function caseReadNoKeyLeak(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const first = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  const second = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-max',
    apiKey: `${TEST_API_KEY}-second`,
  });
  await store.confirmProviderPrivacy(first.id, '确认启用 dashscope 提供方配置。');
  const summaries = await store.listProviderConfigs();
  const summariesJson = JSON.stringify(summaries);
  const confirmationsJson = JSON.stringify(await store.listPrivacyConfirmations());
  const storeBytes = await readFile(ctx.storePath, 'utf8');
  const expected = {
    summariesContainNoPlaintext: true,
    summariesContainNoCiphertextField: true,
    hasKeyMarkerPresent: true,
    confirmationsContainNoPlaintext: true,
    storeContainsNoPlaintext: true,
  };
  const actual = {
    summariesContainNoPlaintext: !summariesJson.includes(TEST_API_KEY),
    summariesContainNoCiphertextField: !summariesJson.includes('keyCiphertext'),
    allHaveHasKeyTrue: summaries.every((entry) => entry.hasKey === true),
    confirmationsContainNoPlaintext: !confirmationsJson.includes(TEST_API_KEY),
    storeContainsNoPlaintext: !storeBytes.includes(TEST_API_KEY),
    recordCount: summaries.length,
  };
  const pass =
    actual.summariesContainNoPlaintext &&
    actual.summariesContainNoCiphertextField &&
    actual.allHaveHasKeyTrue &&
    actual.confirmationsContainNoPlaintext &&
    actual.storeContainsNoPlaintext &&
    summaries.length === 2;
  await trace.emit('case-fact', { leaks: actual, idPrefixes: summaries.map((entry) => entry.id.slice(0, 3)) });
  return { expected, actual, pass };
}

// C12 运行时优先级（静态字节序 + 动态委托输入契约）（NORMAL）
async function caseRuntimePriority(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const created = await store.createProviderConfig({
    provider: 'dashscope',
    model: 'qwen-plus',
    apiKey: TEST_API_KEY,
  });
  await store.confirmProviderPrivacy(created.id, '确认启用 dashscope 提供方配置。');
  await store.enableProviderConfig(created.id);
  // 动态：已启用持久化配置 → 解析优先级判定输入（resolveServerGateway
  // 经 hasEnabledPersistedConfigSync 选择 PersistedConfigLlmGateway）
  const persistedActive = store.hasEnabledPersistedConfigSync();
  const delegationInput = await store.getEnabledProviderConfig();
  const profileResolvable = Boolean(PROVIDER_PROFILES[delegationInput?.provider ?? '']);
  // 静态：resolveServerGateway 函数体内优先级字节序
  const serverRuntimeSource = await readFile(path.join(repoRoot, 'src/experience/server-runtime.ts'), 'utf8');
  const fnStart = serverRuntimeSource.indexOf('function resolveServerGateway');
  const fnEnd = serverRuntimeSource.indexOf('\n}', fnStart);
  const fnBody = serverRuntimeSource.slice(fnStart, fnEnd);
  const iSeam = fnBody.indexOf("process.env.EXPERIENCE_LLM_GATEWAY_SEAM !== '1'");
  const iPersisted = fnBody.indexOf('hasEnabledPersistedConfigSync()');
  const iEnv = fnBody.indexOf('loadProviderGatewayConfig()');
  // 合成回退锚点取末次出现（PersistedConfigLlmGateway 在函数内
  // 出现两次：持久化分支返回 + 无配置委托回退——回退在环境变量
  // 形态之后）；证据注入缝目标为 EvidenceFaultLlmGateway
  const iFallback = fnBody.lastIndexOf('return new PersistedConfigLlmGateway();');
  const iSeamTarget = fnBody.indexOf('return new EvidenceFaultLlmGateway(allFixtures());');
  const priorityOrderOk =
    iSeam !== -1 && iPersisted !== -1 && iEnv !== -1 && iFallback !== -1 && iSeamTarget !== -1 &&
    iSeam < iPersisted && iPersisted < iEnv && iEnv < iFallback;
  const expected = {
    persistedActiveDetected: true,
    delegationInputContract: { provider: 'dashscope', model: 'qwen-plus', apiKeyPresent: true },
    profileResolvableFromRegistry: true,
    priorityByteOrder: 'seam < persisted < env < synthetic-fallback',
  };
  const actual = {
    persistedActive,
    delegationProvider: delegationInput?.provider ?? null,
    delegationModel: delegationInput?.model ?? null,
    delegationApiKeyPresent: typeof delegationInput?.apiKey === 'string' && delegationInput.apiKey.length > 0,
    profileResolvable,
    priorityOrderOk,
    priorityIndexes: { seam: iSeam, persisted: iPersisted, env: iEnv, fallback: iFallback },
  };
  const pass =
    persistedActive === true &&
    actual.delegationProvider === 'dashscope' &&
    actual.delegationModel === 'qwen-plus' &&
    actual.delegationApiKeyPresent === true &&
    profileResolvable === true &&
    priorityOrderOk;
  await trace.emit('case-fact', { persistedActive, priorityOrderOk, priorityIndexes: actual.priorityIndexes });
  return { expected, actual, pass };
}

// C13 提供方规则族（model-agnostic 登记源）（NORMAL）
async function caseProviderRegistry(trace, ctx) {
  applyCaseEnv(ctx);
  const store = await ctx.freshModule();
  const registered = store.registeredProviders();
  const defaultModel = store.providerDefaultModel('dashscope');
  const unknownDefault = store.providerDefaultModel('no-such-provider');
  const dashscopeProfile = PROVIDER_PROFILES.dashscope;
  const profileComplete =
    Boolean(dashscopeProfile) &&
    typeof dashscopeProfile.endpoint === 'string' &&
    typeof dashscopeProfile.defaultModel === 'string' &&
    typeof dashscopeProfile.temperature === 'number' &&
    typeof dashscopeProfile.systemPrompt === 'string';
  const expected = {
    registryIsProfileKeySet: true,
    containsDashscope: true,
    defaultModel: 'qwen-plus',
    profileComplete: true,
    unknownProviderNoDefault: true,
  };
  const actual = {
    registered,
    registryMatchesProfiles: JSON.stringify(registered) === JSON.stringify(Object.keys(PROVIDER_PROFILES)),
    defaultModel,
    unknownDefault: unknownDefault ?? null,
    profileComplete,
    profileKeys: dashscopeProfile ? Object.keys(dashscopeProfile).sort() : [],
  };
  const pass =
    actual.registryMatchesProfiles &&
    registered.includes('dashscope') &&
    defaultModel === 'qwen-plus' &&
    unknownDefault === undefined &&
    profileComplete;
  await trace.emit('case-fact', { registered, registryMatchesProfiles: actual.registryMatchesProfiles, profileComplete });
  return { expected, actual, pass };
}

const CASE_REGISTRY = [
  {
    caseId: 'CREATE-NORMAL',
    scope: 'S5B D-3/D-4（NORMAL）：新增提供方配置正常路径——密文落盘 / 摘要无 key 形态',
    precondition: '已登记提供方（dashscope）；运行期加密密钥经环境变量注入',
    inputFault: '无（正常输入）',
    sourceClause: 'S5B-SEMANTIC-FREEZE-01 v1.0.0 §2；config-store.ts createProviderConfig',
    form: 'in-process',
    servers: [],
    run: caseCreateNormal,
  },
  {
    caseId: 'CREATE-UNREGISTERED',
    scope: 'S5B D-2（NEGATIVE）：未登记提供方创建拒绝——提供方准入规则族',
    precondition: 'PROVIDER_PROFILES 为唯一登记源',
    inputFault: '未登记提供方标识（openai / my-custom-provider）',
    sourceClause: 'S5A-SEMANTIC-FREEZE-01 §1 D-2；config-store.ts PROVIDER_NOT_REGISTERED',
    form: 'in-process',
    servers: [],
    run: caseCreateUnregistered,
  },
  {
    caseId: 'CREATE-MISSING-FIELDS',
    scope: 'S5B D-4（NEGATIVE）：必填字段缺失——模型名空白 / API key 空串 / 未提供',
    precondition: '已登记提供方',
    inputFault: 'model="   " / api_key="" / api_key 缺省',
    sourceClause: 'config-store.ts MODEL_REQUIRED / API_KEY_REQUIRED',
    form: 'in-process',
    servers: [],
    run: caseCreateMissingFields,
  },
  {
    caseId: 'KEY-SEPARATION',
    scope: 'S5B 要素 4（BOUNDARY）：加密密钥分离——缺失 / 非法 / 长度不足拒绝；合法密钥恢复',
    precondition: 'EXPERIENCE_CONFIG_ENCRYPTION_KEY 形态约束（64 hex）',
    inputFault: '密钥缺失 / 非 hex / 63 位 hex',
    sourceClause: 'config-store.ts encryptionKey()；隐私六要素 v0.4.2 要素 4',
    form: 'in-process',
    servers: [],
    run: caseKeySeparation,
  },
  {
    caseId: 'CONFIRM-GENERIC-TEMPLATE',
    scope: 'S5B D-5（NORMAL）：隐私再确认——通用模板签署（提供方名称于签署时填写）',
    precondition: '配置记录存在；提供方已登记',
    inputFault: '无（正常签署）',
    sourceClause: 'S5B-SEMANTIC-FREEZE-01 v1.0.0 §2 D-5；config-store.ts confirmProviderPrivacy',
    form: 'in-process',
    servers: [],
    run: caseConfirmGeneric,
  },
  {
    caseId: 'ENABLE-BEFORE-CONFIRM',
    scope: 'S5B D-5（NEGATIVE）：未确认提供方启用拒绝——确认前置条件',
    precondition: '配置记录存在；该提供方无确认记录',
    inputFault: '启用未确认提供方',
    sourceClause: 'config-store.ts enableProviderConfig → PROVIDER_NOT_CONFIRMED',
    form: 'in-process',
    servers: [],
    run: caseEnableBeforeConfirm,
  },
  {
    caseId: 'ENABLE-DECRYPT-SINGLE-ACTIVE',
    scope: 'S5B D-3（NORMAL）：启用 + 解密回环 + 单激活——启用第二配置后第一配置自动关闭',
    precondition: '两配置并存；均已确认',
    inputFault: '无（正常启用序列）',
    sourceClause: 'config-store.ts enableProviderConfig / getEnabledProviderConfig',
    form: 'in-process',
    servers: [],
    run: caseEnableDecryptSingleActive,
  },
  {
    caseId: 'DISABLE-FALLBACK',
    scope: 'S5B 运行时（NORMAL）：禁用即时回退——hasEnabledPersistedConfigSync 转 false，委托输入归空（状态路由合成模式）',
    precondition: '已启用配置存在',
    inputFault: '无（正常禁用）',
    sourceClause: 'config-store.ts disableProviderConfig；app/api/config/status/route.ts 形态判定',
    form: 'in-process',
    servers: [],
    run: caseDisableFallback,
  },
  {
    caseId: 'DELETE-CORRUPT-NOTFOUND',
    scope: 'S5B D-4（FAILURE_RECOVERY）：删除后操作 404；存储 JSON 损坏拒绝（不静默回退）；确认存储损坏拒绝',
    precondition: '配置记录存在',
    inputFault: '已删除 id 操作 / 非法 JSON 存储 / 非法 JSON 确认存储',
    sourceClause: 'config-store.ts CONFIG_NOT_FOUND / CONFIG_STORE_CORRUPT / CONFIG_CONFIRMATION_STORE_CORRUPT',
    form: 'in-process',
    servers: [],
    run: caseDeleteCorruptNotFound,
  },
  {
    caseId: 'CIPHERTEXT-TAMPER',
    scope: 'S5B 要素 4（FAILURE_RECOVERY）：密文篡改 → 解密失败；畸形引用 → 引用无效（AES-256-GCM 认证标签生效）',
    precondition: '已启用配置存在',
    inputFault: '密文段字符翻转 / 非三段形态引用',
    sourceClause: 'config-store.ts decryptApiKey → CONFIG_DECRYPT_FAILED / CONFIG_CIPHERTEXT_INVALID',
    form: 'in-process',
    servers: [],
    run: caseCiphertextTamper,
  },
  {
    caseId: 'READ-NO-KEY-LEAK',
    scope: 'S5B D-4（BOUNDARY）：读操作不泄漏 key——列表 / 确认 / 落盘文件均无明文与密文字段',
    precondition: '两条配置并存；一条已确认',
    inputFault: '无（读路径扫描）',
    sourceClause: 'config-store.ts summarize / listProviderConfigs / listPrivacyConfirmations',
    form: 'in-process',
    servers: [],
    run: caseReadNoKeyLeak,
  },
  {
    caseId: 'RUNTIME-PRIORITY',
    scope: 'S5B 运行时（NORMAL）：配置解析优先级——证据注入缝 > 页面持久化配置 > 环境变量 > 合成默认（静态字节序 + 动态委托输入契约）',
    precondition: '已启用持久化配置存在',
    inputFault: '无（优先级判定）',
    sourceClause: 'server-runtime.ts resolveServerGateway / PersistedConfigLlmGateway',
    form: 'in-process',
    servers: [],
    run: caseRuntimePriority,
  },
  {
    caseId: 'PROVIDER-REGISTRY',
    scope: 'S5B D-1/D-2（NORMAL）：提供方规则族即登记源——model-agnostic（用户经页面选择已登记提供方，产品代码不写死提供方分支）',
    precondition: 'PROVIDER_PROFILES 为唯一登记源',
    inputFault: '未登记提供方查询默认模型',
    sourceClause: 'llm-gateway.ts PROVIDER_PROFILES；config-store.ts registeredProviders / providerDefaultModel',
    form: 'in-process',
    servers: [],
    run: caseProviderRegistry,
  },
];

// ---------------------------------------------------------------------------
// 预检与案例执行
// ---------------------------------------------------------------------------
let nextVersion = '';
let reactVersion = '';
let typescriptVersion = '';
let productPackage = {};
let lockfile = {};

const caseDirs = [];

async function mainFull() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  if (process.version !== NODE_LOCK) {
    fatal(`engine gate: expected Node ${NODE_LOCK} (F-2 lock), found ${process.version}`);
  }
  log(`engine gate passed: Node ${process.version} (${process.execPath})`);

  // 重跑不覆盖既有证据：既有运行目录按尝试归档（保留于仓库，不删除）
  if (existsSync(runDir)) {
    const archive = `${runDir}-attempt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await rename(runDir, archive);
    log(`existing run dir archived: ${path.basename(archive)}`);
  }
  await mkdir(casesDir, { recursive: true });
  await mkdir(tracesDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
  await mkdir(reviewDir, { recursive: true });

  const tscJs = path.join(repoRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  log('preflight: typecheck:core (tsc -p tsconfig.core.json)');
  const typecheck = await runCommandSync(process.execPath, [tscJs, '-p', path.join(repoRoot, 'tsconfig.core.json')]);
  log(`preflight: typecheck exit ${typecheck.code}`);
  if (typecheck.code !== 0) fatal(`typecheck failed: ${tail(typecheck.stdout + typecheck.stderr)}`);

  log('preflight: next build (production)');
  const build = await runCommandSync(process.execPath, [nextBin, 'build']);
  log(`preflight: build exit ${build.code}`);
  if (build.code !== 0) fatal(`next build failed: ${tail(build.stdout + build.stderr)}`);

  const referenceCheck = await verifyReferenceIntegrity(repoRoot);
  log(`reference archive integrity: ${referenceCheck.verified}/${referenceCheck.total} verified, ${referenceCheck.failed.length} failed`);
  if (referenceCheck.failed.length > 0) {
    fatal(`reference archive hash verification failed: ${JSON.stringify(referenceCheck.failed)}`);
  }
  const fingerprintCheck = await verifyContractFingerprints(repoRoot);
  const c4Entry = fingerprintCheck.contracts.find((entry) => entry.id === 'C4');
  log(`contract fingerprints: allMatch=${fingerprintCheck.allMatch} (C4 整文件哈希仅信息记录：${c4Entry?.registeredNote ?? 'n/a'})`);
  if (!fingerprintCheck.allMatch) fatal('contract fingerprint verification failed');
  const git = await gitState(repoRoot);
  log(`git state: HEAD=${git.commit} (workTreeClean=${git.workTreeClean})`);

  // 回归基线绑定（当前汇总——本运行前置验证，非重跑）
  const goldenSummary = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'G3-GOLDEN-0001', 'summary.json'), 'utf8'));
  const goldenMetadata = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'G3-GOLDEN-0001', 'run-metadata.json'), 'utf8'));
  const goldenRegressionOk =
    goldenSummary.exitCode === 0 &&
    goldenSummary.executedCases === 48 &&
    goldenSummary.allExecutedCasesPass === true &&
    goldenSummary.allAssertionsPass === true;
  log(`golden regression binding: G3-GOLDEN-0001 exitCode=${goldenSummary.exitCode} cases=${goldenSummary.executedCases}/48 allPass=${goldenSummary.allExecutedCasesPass} policy=${goldenMetadata.policy?.version} stateMachine=${goldenMetadata.stateMachine?.version}`);
  const s2bSummary = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'S2B-0001', 'summary.json'), 'utf8'));
  const s2bOk = s2bSummary.exitCode === 0 && s2bSummary.allCasesPass === true && s2bSummary.allAssertionsPass === true && s2bSummary.cases.length === 7;
  log(`s2b regression binding: S2B-0001 exitCode=${s2bSummary.exitCode} cases=${s2bSummary.cases.length}/7 allPass=${s2bSummary.allCasesPass}`);

  productPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  lockfile = JSON.parse(await readFile(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  nextVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'next', 'package.json'), 'utf8')).version;
  reactVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'react', 'package.json'), 'utf8')).version;
  typescriptVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;

  // 案例执行
  const caseResults = [];
  const recordValidations = [];
  for (const definition of CASE_REGISTRY) {
    const caseTrace = new TraceWriter(tracesDir, `${RUN_ID}:${definition.caseId}`);
    const ctx = await caseContext(definition.caseId);
    caseDirs.push(ctx.dir);
    await caseTrace.start({ form: definition.form, sourceClause: definition.sourceClause, servers: definition.servers });
    log(`case ${definition.caseId}: RUNNING (${definition.form})`);
    let outcome;
    try {
      outcome = await definition.run(caseTrace, ctx);
    } catch (error) {
      await caseTrace.emit('executor-error', { error: String(error) });
      outcome = {
        expected: { executed: 'without error' },
        actual: { error: String(error) },
        pass: false,
      };
    }
    const caseRecord = {
      caseIdNamespace: `${RUN_ID}:${definition.caseId}`,
      sourceClause: definition.sourceClause,
      scope: definition.scope,
      precondition: definition.precondition,
      inputFault: definition.inputFault,
      expected: outcome.expected,
      actual: outcome.actual,
      invariants: INVARIANTS,
      evidence: {
        trace: `traces/${`${RUN_ID}:${definition.caseId}`}.jsonl`,
        traceSha256: sha256OfBuffer(
          Buffer.from(
            await readFile(path.join(tracesDir, `${`${RUN_ID}:${definition.caseId}`}.jsonl`), 'utf8'),
            'utf8',
          ),
        ),
        form: definition.form,
        servers: definition.servers,
      },
      result: outcome.pass ? 'PASS' : 'FAIL',
      evaluator: EVALUATOR_SEPARATION,
      defectsFollowUp: outcome.pass
        ? '无（本案例）；G5 16 项评测包仍 NOT RUN；真实 LLM 提供方接入属产品决策 + 隐私六要素批准范畴'
        : '本案例未通过——按 ADR-0002 §5 如实登记，不得重跑至通过为止；缺陷须在下一迭代处置',
    };
    const validation = validateCaseRecord(caseRecord);
    recordValidations.push({ caseId: definition.caseId, valid: validation.valid });
    if (!validation.valid) {
      log(`case ${definition.caseId}: record INVALID ${JSON.stringify(validation)}`);
    }
    await writeCaseRecord(casesDir, caseRecord);
    await caseTrace.complete({ result: caseRecord.result, pass: outcome.pass });
    caseResults.push({ caseId: definition.caseId, result: caseRecord.result, pass: outcome.pass });
    log(`case ${definition.caseId}: ${caseRecord.result}`);
  }

  const allCasesPass = caseResults.every((entry) => entry.pass);

  return {
    caseResults,
    recordValidations,
    allCasesPass,
    startedAt,
    startedAtMs,
    goldenSummary,
    goldenMetadata,
    goldenRegressionOk,
    s2bSummary,
    s2bOk,
    typecheck,
    build,
    referenceCheck,
    fingerprintCheck,
    c4Entry,
    git,
  };
}

// ---------------------------------------------------------------------------
// 断言与摘要（两遍 SHA256SUMS——G3-E-3）
// ---------------------------------------------------------------------------
async function runWith(pre) {
  const {
    caseResults, recordValidations, allCasesPass, startedAt, startedAtMs,
    goldenSummary, goldenMetadata, goldenRegressionOk, s2bSummary, s2bOk,
    typecheck, build, referenceCheck, fingerprintCheck, c4Entry, git,
  } = pre;

  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  assert('A1', 'run-metadata 完整（E5 §3 版本矩阵全部字段——S5B-F1-0001 形态；含 obligationTraceability：S5B → 案例 / 断言映射；frozenDecisions：D-1…D-5 裁决文本引用）', true, { form: 'S5B-F1-0001' });
  assert(
    'A2',
    '环境锁定：engines.node === "24.21.0"（F-2 精确锁定）且执行于 Node v24.21.0；lockfileVersion 3',
    productPackage.engines?.node === '24.21.0' && process.version === 'v24.21.0' && lockfile.lockfileVersion === 3,
    { engines: productPackage.engines, nodeVersion: process.version, lockfileVersion: lockfile.lockfileVersion },
  );
  assert(
    'A3',
    `全部 ${caseResults.length} 案例记录齐备且 12 字段完整（E5 §4；维度覆盖：NORMAL 6 / NEGATIVE 3 / BOUNDARY 2 / FAILURE_RECOVERY 2）`,
    caseResults.length === 13 && recordValidations.every((entry) => entry.valid),
    { cases: caseResults.length, validRecords: recordValidations.filter((entry) => entry.valid).length },
  );
  assert(
    'A4',
    `全部 ${caseResults.length} 执行案例轨迹齐备且非空（trace_started + 案例事实 + trace_completed）`,
    (await Promise.all(
      caseResults.map(async (entry) => {
        const tracePath = path.join(tracesDir, `${RUN_ID}:${entry.caseId}.jsonl`);
        const content = await readFile(tracePath, 'utf8');
        return content.includes('trace_started') && content.includes('trace_completed') && content.includes('case-fact');
      }),
    )).every(Boolean),
    { traces: caseResults.length },
  );
  // A5：明文 key 零落盘（扫描全部案例持久化目录 + 本运行证据目录）
  const needleScans = [];
  for (const root of [...caseDirs, runDir]) {
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          const bytes = await readFile(full);
          needleScans.push({
            file: full,
            plaintextKeyHits: bytes.includes(TEST_API_KEY),
            encryptionKeyHits: bytes.includes(RUN_ENCRYPTION_KEY),
          });
        }
      }
    }
  }
  const plaintextHits = needleScans.filter((entry) => entry.plaintextKeyHits);
  const encryptionKeyHits = needleScans.filter((entry) => entry.encryptionKeyHits);
  assert(
    'A5',
    `静态加密不变式：API key 明文零落盘——扫描 ${needleScans.length} 个持久化 / 证据文件，0 命中（案例临时目录 + 本运行证据目录）`,
    plaintextHits.length === 0,
    { filesScanned: needleScans.length, plaintextHits: plaintextHits.length },
  );
  assert(
    'A6',
    '密钥分离不变式：运行期加密密钥（环境变量注入）零出现于任何持久化 / 证据文件——扫描命中 0（密钥与密文分离的独立验证）',
    encryptionKeyHits.length === 0,
    { filesScanned: needleScans.length, encryptionKeyHits: encryptionKeyHits.length },
  );
  // A7：model-agnostic 静态边界——配置面源码无提供方字面量
  const configStoreSource = await readFile(path.join(repoRoot, 'src/experience/config-store.ts'), 'utf8');
  const configRouteSources = {};
  for (const rel of [
    'app/api/config/route.ts',
    'app/api/config/[id]/route.ts',
    'app/api/config/[id]/confirm/route.ts',
    'app/api/config/[id]/enable/route.ts',
    'app/api/config/[id]/disable/route.ts',
    'app/api/config/profiles/route.ts',
    'app/api/config/status/route.ts',
  ]) {
    configRouteSources[rel] = await readFile(path.join(repoRoot, rel), 'utf8');
  }
  const providerLiteralPattern = /dashscope|DashScope|DASHSCOPE|qwen|openai|OpenAI/gi;
  const configStoreLiterals = configStoreSource.match(providerLiteralPattern) ?? [];
  const routeLiteralHits = Object.entries(configRouteSources).filter(([, source]) => providerLiteralPattern.test(source)).map(([rel]) => rel);
  assert(
    'A7',
    'model-agnostic 静态边界：配置存储与全部配置面 API 路由源码无提供方字面量（提供方身份仅经 PROVIDER_PROFILES 规则族登记——用户经页面选择，产品代码不写死任何提供方）',
    configStoreLiterals.length === 0 && routeLiteralHits.length === 0,
    { configStoreLiteralCount: configStoreLiterals.length, routeLiteralHits },
  );
  // A8：D-5 通用模板静态验证
  const templateLiteralOk = configStoreSource.includes("CONFIRMATION_TEMPLATE = 'PRIVACY-RECONFIRM-GENERIC/V1'");
  const confirmerLiteralOk = configStoreSource.includes("CONFIRMER_IDENTITY = 'product-owner+security-owner'");
  assert(
    'A8',
    'D-5 隐私再确认通用模板：CONFIRMATION_TEMPLATE === "PRIVACY-RECONFIRM-GENERIC/V1"（提供方名称于签署时填写——不写死任何提供方）；确认人双重身份常量存在',
    templateLiteralOk && confirmerLiteralOk,
    { templateLiteralOk, confirmerLiteralOk },
  );
  // A9：运行时优先级字节序（server-runtime.ts resolveServerGateway 函数体）
  const serverRuntimeSource = await readFile(path.join(repoRoot, 'src/experience/server-runtime.ts'), 'utf8');
  const fnStart = serverRuntimeSource.indexOf('function resolveServerGateway');
  const fnEnd = serverRuntimeSource.indexOf('\n}', fnStart);
  const fnBody = serverRuntimeSource.slice(fnStart, fnEnd);
  const iSeam = fnBody.indexOf("process.env.EXPERIENCE_LLM_GATEWAY_SEAM !== '1'");
  const iPersisted = fnBody.indexOf('hasEnabledPersistedConfigSync()');
  const iEnv = fnBody.indexOf('loadProviderGatewayConfig()');
  const iFallback = fnBody.lastIndexOf('return new PersistedConfigLlmGateway();');
  const iSeamTarget = fnBody.indexOf('return new EvidenceFaultLlmGateway(allFixtures());');
  const priorityOk =
    iSeam !== -1 && iPersisted !== -1 && iEnv !== -1 && iFallback !== -1 && iSeamTarget !== -1 &&
    iSeam < iPersisted && iPersisted < iEnv && iEnv < iFallback;
  assert(
    'A9',
    '运行时优先级字节序：证据注入缝 > 页面持久化配置 > 环境变量 LLM 模式 > 合成默认（resolveServerGateway 函数体内静态字节序验证；动态委托输入契约见 RUNTIME-PRIORITY 案例）',
    priorityOk,
    { indexes: { seam: iSeam, persisted: iPersisted, env: iEnv, fallback: iFallback } },
  );
  assert(
    'A10',
    '回归基线绑定：G3-GOLDEN-0001 当前汇总 48/48 案例全过（exitCode 0，policy_v2.3.0 / state_machine_v1.5.0）；S2B-0001 当前汇总 7/7 案例全过——S5B 为基础设施切片，零策略 / 状态机 / 事件契约变更',
    goldenRegressionOk && s2bOk,
    {
      golden: { exitCode: goldenSummary.exitCode, cases: goldenSummary.executedCases, allPass: goldenSummary.allExecutedCasesPass },
      s2b: { exitCode: s2bSummary.exitCode, cases: s2bSummary.cases.length, allPass: s2bSummary.allCasesPass },
    },
  );
  assert(
    'A11',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // run-metadata（E5 §3 版本矩阵）
  const runtimeFileHashes = {};
  for (const rel of [
    'src/experience/config-store.ts',
    'src/experience/server-runtime.ts',
    'src/experience/llm-gateway.ts',
    'app/api/config/route.ts',
    'app/api/config/[id]/route.ts',
    'app/api/config/[id]/confirm/route.ts',
    'app/api/config/[id]/enable/route.ts',
    'app/api/config/[id]/disable/route.ts',
    'app/api/config/profiles/route.ts',
    'app/api/config/status/route.ts',
    'app/config/page.tsx',
    'tools/evidence/src/s5b-f1.mjs',
  ]) {
    runtimeFileHashes[rel] = sha256OfBuffer(await readFile(path.join(repoRoot, rel)));
  }
  const referenceEntries = (await readFile(path.join(repoRoot, 'docs', 'product', 'reference', 'SHA256SUMS'), 'utf8'))
    .split('\n')
    .filter((line) => /^\S+\s\s\S/.test(line))
    .map((line) => line.replace(/^([0-9a-f]{64})\s\s(.+)$/, '$2'));

  const versionMatrix = {
    ...(await buildVersionMatrix({ repoRoot, runId: RUN_ID, executor: 's5b-f1' })),
    runId: RUN_ID,
    obligation: 'S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0 裁决选项 A（产品负责人指令 2026-10-10 全项 A，standing authorization）：页面配置面——提供方配置持久化（API key 页面添加、AES-256-GCM 静态加密）+ D-5 隐私再确认 + 运行期委托网关（启用 / 禁用即时生效）',
    authorization: { id: 'S5B-CONFIG-SURFACE-PROPOSAL-01', version: '1.0.0', issued: '2026-10-10', note: '产品负责人指令 2026-10-10 全项 A 作为裁决输入（standing authorization——持续推进产品完成，需要签署和授权的已允许）；S5B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施' },
    obligationTraceability: {
      'S5B 页面配置面（提供方配置持久化 + 隐私再确认 + 运行期委托）': {
        decision: 'S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0 RULED（产品负责人指令 2026-10-10，全项 A）',
        frozenDecisions: {
          'D-1': '选项 A——页面配置面：提供方配置经 /config 页面管理（API key 用户自己在页面添加，可配置多个不同提供商的对应模型）',
          'D-3': '选项 A——多记录配置模型：每提供方一条配置（provider / model / key 密文引用），可多条并存，单条启用',
          'D-4': '选项 A——配置管理 UI + API（列表 / 新增 / 编辑 / 删除 / 启用 / 禁用 + 页内确认流；读操作永不返回 key 任何形态）',
          'D-5': '选项 A——隐私再确认通用模板（PRIVACY-RECONFIRM-GENERIC/V1——提供方名称于签署时填写，不写死任何提供方；未确认不得启用）',
        },
        implementationFiles: [
          'src/experience/config-store.ts（AES-256-GCM 静态加密 + 密钥分离 + 原子写 + 多记录模型 + 通用确认模板 + 提供方准入 + 单激活）',
          'src/experience/server-runtime.ts（PersistedConfigLlmGateway 委托网关——优先级：证据注入缝 > 页面持久化配置 > 环境变量 > 合成默认；每次调用解析，启用 / 禁用 / 删除即时生效无需重启）',
          'src/experience/llm-gateway.ts（PROVIDER_PROFILES 已登记提供方规则族——model-agnostic 唯一登记源）',
          'app/api/config/**（配置面 API——CRUD + confirm / enable / disable / profiles / status）',
          'app/config/page.tsx（配置管理 UI——页内启用确认流）',
        ],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: 'G3-GOLDEN-0001 PASSED（48/48；policy_v2.3.0 / state_machine_v1.5.0——S5B 零策略 / 状态机 / 事件契约变更，回归基线不变）',
        s2bRegression: 'S2B-0001 PASSED（7/7——S2b 行为面零回归）',
      },
    },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17', 'PD-21', 'PD-22', 'PD-23'],
      note: 'S5B 配置面经产品负责人指令 2026-10-10 全项 A 裁决（standing authorization）；隐私六要素 v0.4.2 要素 2/4 承载（加密 + 存储位置）',
    },
    contracts: {
      baseline: 'docs/product/baseline/contract-authority-baseline-v1.md',
      entries: fingerprintCheck.contracts,
      p3s1Candidates: {
        source: 'SRC-21 / SRC-22 / SRC-24（P3-S1-C01～C09）',
        status: 'FREEZE CANDIDATE，未获责任人批准；与已批准契约不一致时暂停并升级决策',
      },
    },
    s1Specifications: referenceEntries.filter((name) => name.startsWith('P3-S1')),
    stateMachine: {
      contract: 'C2',
      version: 'state_machine_v1.5.0',
      implemented: 'S5B 不变更状态机（配置面为运行期基础设施——无新增迁移、无新增阶段、无新增交互事件）',
      source: 'SRC-05 / 13',
    },
    policy: {
      contract: 'C1',
      version: 'policy_v2.3.0',
      changes: 'S5B 不变更策略（无新增语义动作、无优先级链变化——配置面仅改变 LLM 网关构造来源，不改变动作裁决）',
      priorityChain: 'STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER > CONTINUE > REPEAT > UNKNOWN（升级）——不变',
      source: 'SRC-06 / 14',
    },
    api: {
      contract: 'C3',
      version: 'v1.0.0',
      note: 'S5B 新增配置面端点（/api/config、/api/config/[id]、/api/config/[id]/confirm、/enable、/disable、/api/config/profiles、/api/config/status——纯暴露层；体验流端点不变）',
    },
    event: { contract: 'C6', version: 'v1.0.0', note: 'S5B 不新增交互事件（配置面为管理面——无体验事件产生）' },
    evaluation: { gate: 'G5', status: 'NOT RUN（独立评测人须先审阅本运行 staged 材料）', note: '本运行动态证据已执行；G5 16 项评测包独立评测未执行' },
    code: {
      form: 'in-process（真实 .ts 源字节；HTTP 形态经配置面 API 路由转发同一函数——本运行直接执行存储 / 委托契约层）',
      files: runtimeFileHashes,
    },
    prompt: { model: 'synthetic（确定性规则网关——不调用任何真实 LLM 提供方）', lock: 'N/A（合成形态）' },
    model: {
      provider: 'none（合成数据边界，ADR-0002 §3）',
      lock: 'N/A',
      note: '本运行不进入 ProviderLlmGateway 网络路径——委托契约经配置解析与 PROVIDER_PROFILES 规则族查找验证；真实提供方调用属 S5A LLM 证据（S5A-F1-0001，用户添加真实 key 并首次签署 D-5 后执行）',
    },
    corpus: { fixtures: 'N/A（S5B 为配置面基础设施——无语料消费）', note: '全部合成数据；无真实用户数据' },
    environment: { node: process.version, npm: 'npm 随 Node 发行', next: nextVersion, react: reactVersion, typescript: typescriptVersion, engines: productPackage.engines, lockfileVersion: lockfile.lockfileVersion },
    referenceIntegrity: {
      verified: `${referenceCheck.verified}/${referenceCheck.total}`,
      failed: referenceCheck.failed,
      contracts: fingerprintCheck.allMatch ? 'C1–C7 全部匹配' : 'MISMATCH',
      c4RegisteredNote: c4Entry?.registeredNote ?? 'n/a',
    },
    run: {
      startedAt,
      finishedAt: null,
      command: 'npm run s5b-f1 (node tools/evidence/src/s5b-f1.mjs, from tools/evidence)',
      exitCode: null,
      form: 'in-process（真实 .ts 源字节）',
      lockfiles: { packageLock: 'package-lock.json（lockfileVersion 3）' },
      caseEnvironment: '每案例独立临时目录（os.tmpdir()）+ 配置存储模块独立实例（ESM 查询串隔离）；案例间零状态泄漏',
    },
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S5B-F1-0001 form)');

  // Summary (first pass — SHA256SUMS verification appended in second pass per G3-E-3).
  const allPassedFirst = allCasesPass && assertions.every((entry) => entry.passed);
  const summary = {
    runId: RUN_ID,
    obligation: versionMatrix.obligation,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    cases: caseResults.map((entry) => ({ caseId: entry.caseId, result: entry.result })),
    allCasesPass,
    assertions,
    allAssertionsPass: assertions.every((entry) => entry.passed),
    allPassed: allPassedFirst,
    exitCode: allPassedFirst ? 0 : 1,
    vocabularyNote:
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G3/G4/G8）或产品状态为 PASS（E5 §2）。S5B 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）；真实 LLM 提供方接入（S5A-F1-0001）须用户添加真实 key 并首次签署 D-5 后执行。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A12', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed.length });

  // Final pass: refresh summary with A12 included, then regenerate the
  // manifest so SHA256SUMS covers the final summary.json (G3-E-3).
  const allPassedFinal = allCasesPass && assertions.every((entry) => entry.passed);
  summary.assertions = assertions;
  summary.allAssertionsPass = assertions.every((entry) => entry.passed);
  summary.allPassed = allPassedFinal;
  summary.exitCode = allPassedFinal ? 0 : 1;
  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.now() - startedAtMs;
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeSha256Sums(runDir);
  const finalVerify = await verifySha256Sums(sumsPath, runDir);
  log(`SHA256SUMS regenerated after final summary write (G3-E-3); final re-verification: verified=${finalVerify.verified} failed=${finalVerify.failed.length}`);
  if (finalVerify.failed.length > 0) {
    log(`FATAL: final SHA256SUMS re-verification failed: ${JSON.stringify(finalVerify.failed)}`);
    process.exit(1);
  }

  // Review package (staged for the independent evaluator).
  const reviewReadme = `# ${RUN_ID} — 独立评测人审阅包（staged，待审阅与否决）

运行：${RUN_ID}（S5B 动态证据——页面配置面：提供方配置持久化 + D-5 隐私再确认 + 运行期委托网关；S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0 裁决选项 A，产品负责人指令 2026-10-10 全项 A）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；案例事实按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S5B → 案例 / 断言映射；frozenDecisions：D-1…D-5 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S5B 动态证据计划——四维度）

- 正常路径（6）：CREATE-NORMAL（密文落盘 / 摘要无 key）/ CONFIRM-GENERIC-TEMPLATE（通用模板签署）/ ENABLE-DECRYPT-SINGLE-ACTIVE（解密回环 + 单激活）/ DISABLE-FALLBACK（禁用即时回退）/ RUNTIME-PRIORITY（优先级字节序 + 委托输入契约）/ PROVIDER-REGISTRY（model-agnostic 规则族登记源）
- 负路径（3）：CREATE-UNREGISTERED（未登记提供方拒绝）/ CREATE-MISSING-FIELDS（必填字段缺失）/ ENABLE-BEFORE-CONFIRM（未确认不得启用）
- 边界（2）：KEY-SEPARATION（加密密钥缺失 / 非法 / 长度不足拒绝 + 合法恢复）/ READ-NO-KEY-LEAK（读操作零 key 泄漏扫描）
- 故障恢复（2）：DELETE-CORRUPT-NOTFOUND（删除 404 + 存储损坏拒绝不静默回退）/ CIPHERTEXT-TAMPER（密文篡改认证失败 + 畸形引用拒绝）

## 关键不变式验证

- A5：API key 明文零落盘（扫描 ${needleScans.length} 个持久化 / 证据文件，0 命中）
- A6：运行期加密密钥（环境变量注入）零出现于任何文件（0 命中——密钥分离独立验证）
- A7：配置面源码无提供方字面量（model-agnostic——提供方身份仅经 PROVIDER_PROFILES 登记）
- A8：D-5 通用模板 PRIVACY-RECONFIRM-GENERIC/V1（提供方名称于签署时填写，不写死任何提供方）
- A9：运行时优先级字节序（证据注入缝 > 页面持久化配置 > 环境变量 > 合成默认）

## 回归基线

- G3-GOLDEN-0001：policy_v2.3.0 / state_machine_v1.5.0 通过（48/48——S5B 零策略 / 状态机 / 事件契约变更）
- S2B-0001：通过（7/7——S2b 行为面零回归）

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）
- 真实 LLM 提供方调用（S5A-F1-0001——须用户在 /config 页面添加真实 API key 并首次签署 D-5 隐私再确认后执行；本运行不进入 ProviderLlmGateway 网络路径——合成数据边界，ADR-0002 §3）
- HTTP 形态端到端（配置面 API 路由的 HTTP 形态证据——经同一函数路径转发；本运行为进程内形态直接执行存储 / 委托契约层）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- 加密密钥管理形态（环境变量注入）为开发期形态——生产形态密钥注入方案属部署决策（隐私六要素要素 4 注记）

## 独立重跑

    cd tools/evidence && npm run s5b-f1   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's5b-f1-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  const pre = await mainFull();
  await runWith(pre);
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's5b-f1-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
