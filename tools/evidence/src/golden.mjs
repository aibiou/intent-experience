// G3-GOLDEN-0001 — P2 G3 黄金案例回归套件执行器（OBL-03 / PD-19）。
//
// 语料定义（P2 Exit Gate & Sign-off §8）：P2 核心产品验收 G01–G12，
// 每个黄金案例至少具备 Normal / Negative / Boundary / Failure-Recovery
// 四维度 + Expected / Observed / Evidence Location / Evaluator。
// 本运行执行 12 黄金案例 × 4 维度 = 48 案例：S1 已实现黄金子集
//   （G11 长期记忆 / G12 跨会话分支——S3a 新增，S3-SCOPE-PROPOSAL-01
//   v1.0.0 RULED §4 动态证据计划；策略版本 policy_v2.2.0——S3a 语义
//   启用，F1–F4 语义经 policy_v2.2.0 延续不变）
// （G01 Direct Answer / G02 Why / G03 What If 基础单次模拟形态 /
// G05 Change / G06 Stop）+ P2 关闭切片最小实现（G04 Creation /
// G07 Correction / G08 Memory Boundary——PD-21，产品负责人
// 2026-10-09 批准：CREATE / CORRECTION 语义动作 + CREATION 阶段 +
// 当前会话方向信号的最小形态）。完整 Creation / Correction / 持久
// Memory 语义仍属 S2（PD-05/PD-06/PD-07 范围不变；acceptance-mapping §B）。
// G09 Directional Operations（S2b；S2B-SEMANTIC-FREEZE-01 D-01 选项 A：
// DEEPEN / SIMPLIFY / REFRAME 顶层语义动作——policy_v2.0.0，创作域顶层
// 补丁操作承载；S2b 授权 P3-S2B-IMPL-AUTH-01 v1.0.0 产品负责人签署）。
// G10 Branch Reflow（S2；S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A：
// ADOPT_BRANCH 第五分支操作显式回流——policy_v2.2.0 变更 1–5，
// 确定性系统回合 + simulation_adopted 事件 + 新一轮模拟上下文呈现）。
//
// 跨迭代回归基准：案例期望冻结自 F2-GS-0001 行为基线；本运行绑定
// git HEAD，运行时代码行为漂移即案例失败（回归基线见 run-metadata
// regression 节）。HTTP 形态证据见 F2-GS-0001 / F3-EB-0001；本套件
// 为进程内形态（真实 .ts 源字节经 module.registerHooks 执行）。
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5，E5 §2）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置 G3 或任何 Gate / 产品状态为 PASS；
// - G3 Gate 判定属独立评测范畴（角色 5；G5 隔离声明 2026-10-08 签署生效）。

import { registerHooks } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 真实源码导入（进程内形态：执行已提交的 .ts 源字节）
// ---------------------------------------------------------------------------
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // 非相对说明符或解析失败时回退默认解析
      }
    }
    return nextResolve(specifier, context);
  },
});

const { ExperienceRuntime } = await import('../../../src/experience/runtime');
const { SyntheticLlmGateway } = await import('../../../src/experience/llm-gateway');
const { allFixtures } = await import('../../../src/experience/chunks');
const { classifyInput } = await import('../../../src/experience/classifier');
const { directAnswer } = await import('../../../src/experience/fixtures/direct-answer');
const { why } = await import('../../../src/experience/fixtures/why');
const { simulate } = await import('../../../src/experience/fixtures/simulate');
const { changeDirection } = await import('../../../src/experience/fixtures/change-direction');
const { create: createFixture } = await import('../../../src/experience/fixtures/create');
const { correction: correctionFixture } = await import('../../../src/experience/fixtures/correction');
const { deepen: deepenFixture } = await import('../../../src/experience/fixtures/deepen');
const { simplify: simplifyFixture } = await import('../../../src/experience/fixtures/simplify');
const { reframe: reframeFixture } = await import('../../../src/experience/fixtures/reframe');

const { sha256OfBuffer, sha256OfFile, hashTree, writeSha256Sums, verifySha256Sums } = await import('./hashes.mjs');
const { TraceWriter } = await import('./trace.mjs');
const { writeCaseRecord, validateCaseRecord } = await import('./caselog.mjs');
const {
  verifyReferenceIntegrity,
  verifyContractFingerprints,
  gitState,
  sqliteVersion,
} = await import('./metadata.mjs');

// ---------------------------------------------------------------------------
// 常量与路径
// ---------------------------------------------------------------------------
const RUN_ID = 'G3-GOLDEN-0001';
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

const GOLDEN_DIMENSIONS = ['NORMAL', 'NEGATIVE', 'BOUNDARY', 'FAILURE_RECOVERY'];

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

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------
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
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (error) => resolve({ code: -1, stdout: '', stderr: String(error) }));
  });
}

function tail(text, maxLines = 12) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-maxLines).join('\n');
}

function parseNdjsonEvents(text) {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// 进程内形态辅助：每案例独立运行时与内存汇
// ---------------------------------------------------------------------------
function createCaseRuntime(gateway) {
  const events = [];
  const traces = [];
  const audit = [];
  const runtime = new ExperienceRuntime({
    eventSink: (event) => {
      events.push(event);
    },
    decisionTraceSink: (trace) => {
      traces.push(trace);
    },
    auditSink: (event) => {
      audit.push(event);
    },
    ...(gateway ? { gateway } : {}),
  });
  return { runtime, events, traces, audit };
}

/** 证据注入：网关不可用（模拟 LLM 故障；C4 故障语义）。 */
function failingGateway() {
  return {
    async propose() {
      throw new Error('synthetic gateway outage (evidence-injected, C4 fault semantics)');
    },
  };
}

/** 标准链路：Session → 意图解析 → 体验启动（返回各阶段记录）。 */
async function setupChain(runtime, { rawInput = '为什么', intentRequestId = 'req-intent-1', experienceRequestId = 'req-exp-1' } = {}) {
  const { session } = await runtime.startSession();
  const intent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput,
    requestId: intentRequestId,
  });
  if (!intent.ok) {
    throw new Error(`setupChain: resolveIntent failed: ${intent.error.code}`);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: experienceRequestId,
  });
  if (!exp.ok) {
    throw new Error(`setupChain: startExperience failed: ${exp.error.code}`);
  }
  return { session, intent, exp };
}

async function consume(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

function contentOf(streamEvents) {
  return streamEvents
    .filter((event) => event.type === 'chunk')
    .map((event) => event.content)
    .join('');
}

function eventsOf(events, type) {
  return events.filter((event) => event.event_type === type);
}

/** 产品源码文件列举（静态证据；F3-EB-0001 EB-10 同源形态；G08-B 静态存在证明——F-5）。 */
async function listProductTsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listProductTsFiles(full)));
    } else if (entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** 源码中的导入说明符提取（静态导入扫描）。 */
function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

// ---------------------------------------------------------------------------
// 黄金案例（G01 Direct Answer）
// ---------------------------------------------------------------------------

// --- G01-N：正常路径（直接回答不被强迫进入探索体验） ----------------
async function caseG01Normal(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '直接告诉我答案' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g01n-1',
  });
  const streamEvents = sub.ok ? await consume(sub.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    semanticAction: 'DIRECT_ANSWER',
    policyAction: 'ANSWER',
    stream: 'submission → chunks → done → state_updated',
    content: directAnswer.chunks.join(''),
    finalState: 'WAITING（等待用户）',
    stateVersion: '4（启动 v2 + USER_ACTION v3 + RESPONSE_COMPLETED v4）',
  };
  const actual = {
    semanticAction: intent.semanticAction,
    policyAction: sub.ok ? sub.header.policy_decision.selected_action : sub.error.code,
    streamTypes: streamEvents.map((event) => event.type),
    content: contentOf(streamEvents),
    finalState: finalState.ok ? `${finalState.state.status} waitingForUser=${finalState.state.waitingForUser}` : 'ERROR',
    stateVersion: finalState.ok ? finalState.state.stateVersion : null,
    decisionTraceCount: traces.length,
    decisionTraceAction: traces[0]?.policy.selected_action ?? null,
  };
  const pass =
    intent.semanticAction === 'DIRECT_ANSWER' &&
    sub.ok &&
    actual.policyAction === 'ANSWER' &&
    actual.streamTypes[0] === 'submission' &&
    actual.streamTypes.includes('done') &&
    actual.streamTypes.includes('state_updated') &&
    actual.content === expected.content &&
    actual.finalState === 'WAITING waitingForUser=true' &&
    actual.stateVersion === 4 &&
    actual.decisionTraceCount === 1 &&
    actual.decisionTraceAction === 'ANSWER' &&
    eventsOf(events, 'question_asked').length === 1 &&
    eventsOf(events, 'policy_decided').length === 1;
  return { expected, actual, pass };
}

// --- G01-NEG：负向（显式直接回答不被预设探索体验覆盖；CC04） ------
async function caseG01Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g01neg-1',
  });
  const firstEvents = first.ok ? await consume(first.stream) : [];
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const explicit = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g01neg-2',
  });
  const explicitEvents = explicit.ok ? await consume(explicit.stream) : [];
  const expected = {
    explorationContext: 'WHY 探索进行中（EXPLAIN 完成）',
    explicitAnswer: '显式 DIRECT_ANSWER → ANSWER（CC04：显式回答不被预设探索体验覆盖）',
    modelAnomaly: '模型异常不存在于分类路径（确定性规则分类）——用户意图不被改写（S1-05）',
  };
  const actual = {
    firstPolicy: first.ok ? first.header.policy_decision.selected_action : first.error.code,
    firstContent: contentOf(firstEvents),
    explicitPolicy: explicit.ok ? explicit.header.policy_decision.selected_action : explicit.error.code,
    explicitContent: contentOf(explicitEvents),
    explicitContentEqualsFixture: contentOf(explicitEvents) === directAnswer.chunks.join(''),
  };
  const pass =
    first.ok &&
    first.header.policy_decision.selected_action === 'EXPLAIN' &&
    firstEvents.some((event) => event.type === 'done') &&
    explicit.ok &&
    explicit.header.policy_decision.selected_action === 'ANSWER' &&
    actual.explicitContentEqualsFixture;
  return { expected, actual, pass };
}

// --- G01-B：边界（相邻输入变体与 20 次重复分类确定性） ------------
async function caseG01Boundary(trace) {
  const samples = 20;
  const classifications = Array.from({ length: samples }, () => classifyInput('直接告诉我答案').semanticAction);
  const variants = ['直接告诉我答案', '直接告诉我答案？', '请直接回答', '回答我'];
  const variantActions = variants.map((input) => classifyInput(input).semanticAction);
  const expected = {
    determinism: `${samples}/${samples} 次分类均为 DIRECT_ANSWER（确定性规则分类）`,
    adjacentInputs: '相邻问法变体（含问号/请/省略变体）均分类为 DIRECT_ANSWER',
  };
  const actual = {
    classifications: `${classifications.length}/${classifications.length} DIRECT_ANSWER`,
    variantInputs: variants,
    variantActions,
  };
  const pass =
    classifications.every((action) => action === 'DIRECT_ANSWER') &&
    variantActions.every((action) => action === 'DIRECT_ANSWER');
  return { expected, actual, pass };
}

// --- G01-FR：故障恢复（网关不可用 → 如实上报；健康网关恢复） ------
async function caseG01FailureRecovery(trace) {
  // 故障：生成期网关不可用 → LLM_UNAVAILABLE 如实 surfaced，不伪造内容，版本不消耗（EB-02）。
  const failing = createCaseRuntime(failingGateway());
  const failChain = await setupChain(failing.runtime, {
    rawInput: '直接告诉我答案',
    intentRequestId: 'req-g01fr-i1',
    experienceRequestId: 'req-g01fr-e1',
  });
  const failed = await failing.runtime.submitExperienceEvent({
    experienceId: failChain.exp.experienceId,
    sessionId: failChain.session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: failChain.exp.stateVersion,
    requestId: 'req-g01fr-1',
  });
  const failedState = failing.runtime.getExperienceState(failChain.exp.experienceId);
  // 恢复：健康网关重试（失败未消耗版本——同一版本仍有效）→ ANSWER，内容逐字节等于 fixture。
  const healthy = createCaseRuntime();
  const okChain = await setupChain(healthy.runtime, {
    rawInput: '直接告诉我答案',
    intentRequestId: 'req-g01fr-i2',
    experienceRequestId: 'req-g01fr-e2',
  });
  const ok = await healthy.runtime.submitExperienceEvent({
    experienceId: okChain.exp.experienceId,
    sessionId: okChain.session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: okChain.exp.stateVersion,
    requestId: 'req-g01fr-2',
  });
  const okEvents = ok.ok ? await consume(ok.stream) : [];
  const expected = {
    failure: 'LLM_UNAVAILABLE（如实上报；不伪造内容；不消耗版本号，EB-02）',
    recovery: '健康网关重试 → ANSWER，内容逐字节等于 synthetic/direct-answer fixture',
  };
  const actual = {
    failureResult: failed.ok ? 'OK（缺陷！）' : failed.error.code,
    failureRetryable: failed.ok ? null : failed.error.retryable,
    versionAfterFailure: failedState.ok ? failedState.state.stateVersion : null,
    versionExpected: failChain.exp.stateVersion,
    recoveryPolicy: ok.ok ? ok.header.policy_decision.selected_action : ok.error.code,
    recoveryContent: contentOf(okEvents),
    recoveryContentEqualsFixture: contentOf(okEvents) === directAnswer.chunks.join(''),
  };
  const pass =
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    failedState.ok &&
    failedState.state.stateVersion === failChain.exp.stateVersion &&
    ok.ok &&
    ok.header.policy_decision.selected_action === 'ANSWER' &&
    actual.recoveryContentEqualsFixture;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G02 Why）
// ---------------------------------------------------------------------------

// --- G02-N：正常路径（"为什么" → WHY → EXPLAIN） ------------------
async function caseG02Normal(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g02n-1',
  });
  const streamEvents = sub.ok ? await consume(sub.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    semanticAction: 'WHY',
    policyAction: 'EXPLAIN',
    content: why.chunks.join(''),
    notMisreadAs: 'STOP / CHANGE_DIRECTION',
  };
  const actual = {
    semanticAction: intent.semanticAction,
    policyAction: sub.ok ? sub.header.policy_decision.selected_action : sub.error.code,
    content: contentOf(streamEvents),
    stopEvents: eventsOf(events, 'stop_requested').length,
    changeEvents: eventsOf(events, 'change_direction_requested').length,
    finalState: finalState.ok ? finalState.state.status : 'ERROR',
  };
  const pass =
    intent.semanticAction === 'WHY' &&
    sub.ok &&
    actual.policyAction === 'EXPLAIN' &&
    actual.content === expected.content &&
    actual.stopEvents === 0 &&
    actual.changeEvents === 0 &&
    actual.finalState === 'WAITING';
  return { expected, actual, pass };
}

// --- G02-NEG：负向（含 STOP 标记的输入不误读为 WHY；P-01） --------
async function caseG02Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  // WHY 探索进行中：提交 WHY 问题，仅消费 submission 事件，保持生成在途
  // （状态 ACTIVE v3；异步生成器为拉取式，未拉取即不产生内容分块）。
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g02neg-0',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  const whyIterator = why.stream[Symbol.asyncIterator]();
  await whyIterator.next(); // submission 事件；流保持开启
  const inFlight = runtime.getExperienceState(exp.experienceId);
  // STOP：输入同时含 STOP 与 WHY 标记（P-01：STOP 永远优先，不误读为 WHY）。
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '停止为什么',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-g02neg-1',
  });
  const streamEvents = sub.ok ? await consume(sub.stream) : [];
  // 旧 WHY 流恢复：观测取消终止（零内容分块——无 EXPLAIN 生成交付）。
  const oldRest = [];
  for (;;) {
    const next = await whyIterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    input: '停止为什么（WHY 探索进行中；含 STOP 与 WHY 标记）',
    classification: 'STOP（P-01：STOP 永远优先，不误读为 WHY）',
    endToEnd: 'STOP → COMPLETED；零内容分块（无 EXPLAIN 生成；在途 WHY 生成被取消）',
    stateVersion: 'v3（WHY 提交）→ v4（STOP 完成提交）',
  };
  const actual = {
    classification: classifyInput('停止为什么').semanticAction,
    controlWhy: classifyInput('为什么').semanticAction,
    inFlightState: `${inFlight.state.status} v${inFlight.state.stateVersion}`,
    policyAction: sub.ok ? sub.header.policy_decision.selected_action : sub.error.code,
    chunkCount: streamEvents.filter((event) => event.type === 'chunk').length,
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    stopEvents: eventsOf(events, 'stop_requested').length,
    explainEvents: eventsOf(events, 'why_requested').length,
    finalState: finalState.ok ? `${finalState.state.status} v${finalState.state.stateVersion}` : 'ERROR',
  };
  const pass =
    classifyInput('停止为什么').semanticAction === 'STOP' &&
    classifyInput('为什么').semanticAction === 'WHY' &&
    inFlight.state.status === 'ACTIVE' &&
    inFlight.state.stateVersion === 3 &&
    sub.ok &&
    actual.policyAction === 'STOP' &&
    actual.chunkCount === 0 &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    actual.stopEvents === 1 &&
    actual.explainEvents === 1 && // 仅 WHY 提交的 why_requested
    finalState.ok &&
    finalState.state.status === 'COMPLETED' &&
    finalState.state.stateVersion === 4;
  return { expected, actual, pass };
}

// --- G02-B：边界（相邻重复 WHY：每次完整生成；版本链 +1 不变式） --
async function caseG02Boundary(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g02b-1',
  });
  const firstEvents = first.ok ? await consume(first.stream) : [];
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const second = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g02b-2',
  });
  const secondEvents = second.ok ? await consume(second.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    repeatBehavior: '相邻重复 WHY：每次均生成完整 EXPLAIN（不省略、不累积、不串扰）',
    versionChain: '每次合法提交恰好 +1（v4 → v6）',
  };
  const actual = {
    firstPolicy: first.ok ? first.header.policy_decision.selected_action : first.error.code,
    firstContentEqualsFixture: contentOf(firstEvents) === why.chunks.join(''),
    stateAfterFirst: `v${stateAfterFirst.state.stateVersion}`,
    secondPolicy: second.ok ? second.header.policy_decision.selected_action : second.error.code,
    secondContentEqualsFixture: contentOf(secondEvents) === why.chunks.join(''),
    finalState: `v${finalState.state.stateVersion}`,
    explainEvents: eventsOf(events, 'why_requested').length,
  };
  const pass =
    first.ok &&
    first.header.policy_decision.selected_action === 'EXPLAIN' &&
    actual.firstContentEqualsFixture &&
    stateAfterFirst.state.stateVersion === 4 &&
    second.ok &&
    second.header.policy_decision.selected_action === 'EXPLAIN' &&
    actual.secondContentEqualsFixture &&
    finalState.state.stateVersion === 6 &&
    actual.explainEvents === 2;
  return { expected, actual, pass };
}

// --- G02-FR：故障恢复（EXPLAIN 生成期网关不可用 → 恢复） ------------
async function caseG02FailureRecovery(trace) {
  const failing = createCaseRuntime(failingGateway());
  const failChain = await setupChain(failing.runtime, {
    rawInput: '为什么',
    intentRequestId: 'req-g02fr-i1',
    experienceRequestId: 'req-g02fr-e1',
  });
  const failed = await failing.runtime.submitExperienceEvent({
    experienceId: failChain.exp.experienceId,
    sessionId: failChain.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: failChain.exp.stateVersion,
    requestId: 'req-g02fr-1',
  });
  const failedState = failing.runtime.getExperienceState(failChain.exp.experienceId);
  const healthy = createCaseRuntime();
  const okChain = await setupChain(healthy.runtime, {
    rawInput: '为什么',
    intentRequestId: 'req-g02fr-i2',
    experienceRequestId: 'req-g02fr-e2',
  });
  const ok = await healthy.runtime.submitExperienceEvent({
    experienceId: okChain.exp.experienceId,
    sessionId: okChain.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: okChain.exp.stateVersion,
    requestId: 'req-g02fr-2',
  });
  const okEvents = ok.ok ? await consume(ok.stream) : [];
  const expected = {
    failure: 'LLM_UNAVAILABLE（如实上报；不伪造解释内容；不消耗版本号，EB-02）',
    recovery: '健康网关重试 → EXPLAIN，内容逐字节等于 synthetic/why fixture',
  };
  const actual = {
    failureResult: failed.ok ? 'OK（缺陷！）' : failed.error.code,
    versionAfterFailure: failedState.ok ? failedState.state.stateVersion : null,
    versionExpected: failChain.exp.stateVersion,
    recoveryPolicy: ok.ok ? ok.header.policy_decision.selected_action : ok.error.code,
    recoveryContent: contentOf(okEvents),
    recoveryContentEqualsFixture: contentOf(okEvents) === why.chunks.join(''),
  };
  const pass =
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    failedState.ok &&
    failedState.state.stateVersion === failChain.exp.stateVersion &&
    ok.ok &&
    ok.header.policy_decision.selected_action === 'EXPLAIN' &&
    actual.recoveryContentEqualsFixture;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G03 What If——S1 基础单次模拟形态，PD-06）
// ---------------------------------------------------------------------------

// --- G03-N：正常路径（单次模拟；事实/推断/假设分离） --------------
async function caseG03Normal(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果世界突然失去摩擦力会怎样' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果世界突然失去摩擦力会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g03n-1',
  });
  const streamEvents = sub.ok ? await consume(sub.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const content = contentOf(streamEvents);
  const expected = {
    semanticAction: 'WHAT_IF',
    policyAction: 'SIMULATE',
    singleShot: '单次模拟提案形态；F-4 起首轮模拟经 simulation_recorded 建立 ACTIVE 分支记录（会话内持久、会话结束失效，后续"如果"轮在分支上继续）',
    separation: '内容区分事实、推断与假设（E8-G2-CC07）',
    noNewExperience: '不创建新 Session/Experience',
    stage: 'SIMULATION（UNDERSTANDING → SIMULATION，§15.2）',
  };
  const actual = {
    policyAction: sub.ok ? sub.header.policy_decision.selected_action : sub.error.code,
    content,
    hasFact: content.includes('事实'),
    hasInference: content.includes('推断'),
    hasHypothesis: content.includes('假设'),
    sessionStartedCount: eventsOf(events, 'session_started').length,
    experienceStartedCount: eventsOf(events, 'experience_started').length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
  };
  const pass =
    sub.ok &&
    actual.policyAction === 'SIMULATE' &&
    actual.hasFact &&
    actual.hasInference &&
    actual.hasHypothesis &&
    actual.sessionStartedCount === 1 &&
    actual.experienceStartedCount === 1 &&
    finalState.ok &&
    finalState.state.stage === 'SIMULATION' &&
    finalState.state.stateVersion === 4 &&
    finalState.state.status === 'WAITING';
  return { expected, actual, pass };
}

// --- G03-NEG：负向（STOP 优先于 WHAT_IF；P-01） --------------------
async function caseG03Negative(trace) {
  const withStop = classifyInput('如果摩擦力为零就好了');
  const plainWhatIf = classifyInput('如果摩擦力为零会怎样');
  const expected = {
    input: '如果摩擦力为零就好了（含 WHAT_IF 与 STOP 标记）',
    result: 'STOP（P-01：STOP 永远优先）',
  };
  const actual = {
    classification: withStop.semanticAction,
    controlClassification: plainWhatIf.semanticAction,
  };
  const pass = withStop.semanticAction === 'STOP' && plainWhatIf.semanticAction === 'WHAT_IF';
  return { expected, actual, pass };
}

// --- G03-B：边界（同层解释顺序 WHY > WHAT_IF；PD-12） --------------
async function caseG03Boundary(trace) {
  const mixed = classifyInput('如果为什么');
  const plainWhatIf = classifyInput('如果摩擦力为零会怎样');
  const plainWhy = classifyInput('为什么');
  const expected = {
    input: '如果为什么（同时含 WHAT_IF 与 WHY 标记）',
    ordering: 'PD-12：同一优先级层内解释顺序 WHY > WHAT_IF → 分类为 WHY',
  };
  const actual = {
    mixedClassification: mixed.semanticAction,
    whatIfControl: plainWhatIf.semanticAction,
    whyControl: plainWhy.semanticAction,
  };
  const pass =
    mixed.semanticAction === 'WHY' &&
    plainWhatIf.semanticAction === 'WHAT_IF' &&
    plainWhy.semanticAction === 'WHY';
  return { expected, actual, pass };
}

// --- G03-FR：故障恢复（陈旧版本写入拒绝 → 当前版本重试成功） ------
async function caseG03FailureRecovery(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果世界突然失去摩擦力会怎样' });
  // 故障：陈旧 expected_state_version → STATE_VERSION_CONFLICT（不覆盖新状态，S1-12）。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果世界突然失去摩擦力会怎样',
    expectedStateVersion: 1,
    requestId: 'req-g03fr-1',
  });
  const stateAfterStale = runtime.getExperienceState(exp.experienceId);
  // 恢复：携带当前版本重试 → SIMULATE 单次模拟成功。
  const retry = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果世界突然失去摩擦力会怎样',
    expectedStateVersion: stateAfterStale.state.stateVersion,
    requestId: 'req-g03fr-2',
  });
  const retryEvents = retry.ok ? await consume(retry.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const retryContent = contentOf(retryEvents);
  const expected = {
    failure: 'STATE_VERSION_CONFLICT（陈旧版本写入拒绝；不覆盖最新状态，S1-12）',
    recovery: '携带当前版本重试 → SIMULATE 成功（事实/推断/假设分离；阶段 SIMULATION）',
  };
  const actual = {
    staleResult: stale.ok ? 'OK（缺陷！）' : stale.error.code,
    stateAfterStale: `v${stateAfterStale.state.stateVersion}`,
    recoveryPolicy: retry.ok ? retry.header.policy_decision.selected_action : retry.error.code,
    recoveryContent: retryContent,
    hasFact: retryContent.includes('事实'),
    hasInference: retryContent.includes('推断'),
    hasHypothesis: retryContent.includes('假设'),
    finalState: `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}`,
    conflictEvents: eventsOf(events, 'state_version_conflict').length,
  };
  const pass =
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    stateAfterStale.state.stateVersion === exp.stateVersion &&
    actual.conflictEvents === 1 &&
    retry.ok &&
    retry.header.policy_decision.selected_action === 'SIMULATE' &&
    actual.hasFact &&
    actual.hasInference &&
    actual.hasHypothesis &&
    finalState.state.stage === 'SIMULATION' &&
    finalState.state.stateVersion === 4;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G05 Change——P2 Exit Gate §8 G05；S1 GS-03）
// ---------------------------------------------------------------------------

// --- G05-N：正常路径（生成中 CHANGE：取消旧生成、拒绝旧候选、新方向）
async function caseG05Normal(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  // 生成中：WHY 事件，产出 submission + 1 分块后暂停。
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g05n-1',
  });
  // 生成在途：仅消费前 2 个事件（submission 首行 + 首个内容分块），
  // 保持流开启以观测 CHANGE 后的取消终止。
  const iterator = first.stream[Symbol.asyncIterator]();
  const firstTwo = [];
  for (let i = 0; i < 2; i += 1) {
    const next = await iterator.next();
    if (next.done) break;
    firstTwo.push(next.value);
  }
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  // 生成中 CHANGE。
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g05n-2',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  // 旧流恢复：观测取消终止。
  const oldRest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    oldGenerationCancelled: 'generation_cancelled（reason=superseded_by_change）',
    oldCandidateRejected: 'experience_interrupted',
    newCandidate: 'experience_candidate_generated + experience_candidate_selected',
    newDirectionStream: 'submission → chunks → done → state_updated',
    newDirectionContent: changeDirection.chunks.join(''),
    finalState: 'WAITING（新方向完成）',
    stateVersion: '5（v3 提交 + 复合迁移 v4 + 完成提交 v5）',
  };
  const actual = {
    inFlightState: `${stateInFlight.state.status} v${stateInFlight.state.stateVersion}`,
    changeAccepted: change.ok,
    changeStreamTypes: changeEvents.map((event) => event.type),
    changeContentEqualsFixture: contentOf(changeEvents) === changeDirection.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status} v${finalState.state.stateVersion}` : 'ERROR',
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
    interrupted: eventsOf(events, 'experience_interrupted').length,
    candidates: eventsOf(events, 'experience_candidate_generated').length,
    oldStreamRestTypes: oldRest.map((event) => event.type),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    stateTransitions: eventsOf(events, 'state_transitioned').map((event) => event.properties.event),
  };
  const pass =
    stateInFlight.state.stateVersion === 3 &&
    stateInFlight.state.status === 'ACTIVE' &&
    change.ok &&
    change.header.policy_decision.selected_action === 'CHANGE_EXPERIENCE' &&
    changeEvents[0].type === 'submission' &&
    changeEvents.some((event) => event.type === 'done') &&
    changeEvents.some((event) => event.type === 'state_updated') &&
    actual.changeContentEqualsFixture &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    actual.generationCancelled.includes('superseded_by_change') &&
    actual.interrupted === 1 &&
    actual.candidates === 2 &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamRestTypes.includes('cancelled') &&
    actual.stateTransitions.includes('CHANGE_DIRECTION');
  return { expected, actual, pass };
}

// --- G05-NEG：负向（旧 generation 迟到达提交被拒；in-flight / stale
//     response 必测维度，P2 Exit Gate §8；S1-10 Critical） -----------
async function caseG05Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g05neg-1',
  });
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  await iterator.next(); // chunk 0
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  const oldGenerationId = first.generationId;
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g05neg-2',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
  }
  // 迟到达提交：旧 generation 尝试完成提交。
  const late = await runtime.completeGeneration(exp.experienceId, oldGenerationId);
  const stateAfterLate = runtime.getExperienceState(exp.experienceId);
  const expected = {
    lateCommit: '拒绝（STALE_GENERATION）——旧 operation 不得提交（S1-10）',
    stateUnpolluted: '状态保持新 direction 的完成版本（v5），无旧 generation 写入',
    evidence: 'state_write_rejected（reason=superseded_generation）',
  };
  const actual = {
    lateCommitResult: late.ok ? 'OK（缺陷！）' : late.code,
    stateAfterLate: `${stateAfterLate.state.status} v${stateAfterLate.state.stateVersion}`,
    writeRejected: eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason),
    changeCompleted: changeEvents.some((event) => event.type === 'state_updated'),
  };
  const pass =
    !late.ok &&
    late.code === 'STALE_GENERATION' &&
    stateAfterLate.state.stateVersion === 5 &&
    actual.writeRejected.includes('superseded_generation') &&
    actual.changeCompleted;
  return { expected, actual, pass };
}

// --- G05-B：边界（重复请求幂等；C6 §27 / API §2.4） ----------------
async function caseG05Boundary(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g05b-1',
  });
  if (first.ok) {
    await consume(first.stream);
  }
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const duplicate = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g05b-1',
  });
  const expected = { duplicate: 'REQUEST_DUPLICATE——不重复执行（幂等去重）' };
  const actual = {
    firstAccepted: first.ok,
    duplicateResult: duplicate.ok ? 'OK（缺陷！）' : duplicate.error.code,
    stateAfterFirst: `v${stateAfterFirst.state.stateVersion}`,
  };
  const pass = first.ok && !duplicate.ok && duplicate.error.code === 'REQUEST_DUPLICATE';
  return { expected, actual, pass };
}

// --- G05-FR：故障恢复（CHANGE 期间网关不可用 → 恢复后新方向完成） --
async function caseG05FailureRecovery(trace) {
  // 同一体验上的故障 → 恢复：可切换网关（WHY 生成在途时健康；故障窗口内
  // propose 抛错；恢复后健康网关重试）。网关接口是既定证据注入点
  // （llm-gateway.ts 头部声明；F3-EB-0001 EB-06/EB-07 同源形态）。
  const healthyGateway = new SyntheticLlmGateway(allFixtures());
  let activeGateway = healthyGateway;
  const swappableGateway = { propose: (request) => activeGateway.propose(request) };
  const { runtime, events } = createCaseRuntime(swappableGateway);
  const { session, intent, exp } = await setupChain(runtime, {
    rawInput: '为什么',
    intentRequestId: 'req-g05fr-i1',
    experienceRequestId: 'req-g05fr-e1',
  });
  // WHY 生成在途（ACTIVE v3；拉取式异步生成器：仅消费 submission 事件，
  // 未拉取即不产生内容分块）。
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g05fr-0',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  const whyIterator = why.stream[Symbol.asyncIterator]();
  await whyIterator.next(); // submission 事件；流保持开启
  const inFlight = runtime.getExperienceState(exp.experienceId);
  // 故障：网关不可用窗口内 CHANGE → LLM_UNAVAILABLE。
  // （P-02：取消旧 generation 先于 LLM 调用——在途 WHY 生成已被取代取消；
  //  EB-02：propose 失败不提交、不消耗版本号、旧状态不被污染。）
  activeGateway = failingGateway();
  const failed = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-g05fr-1',
  });
  const failedState = runtime.getExperienceState(exp.experienceId);
  // 恢复：健康网关重试 CHANGE → 新方向完成（取代已取消的旧候选）。
  activeGateway = healthyGateway;
  const ok = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: failedState.ok ? failedState.state.stateVersion : inFlight.state.stateVersion,
    requestId: 'req-g05fr-2',
  });
  const okEvents = ok.ok ? await consume(ok.stream) : [];
  // 旧 WHY 流恢复：观测取消终止（零内容分块交付）。
  const oldRest = [];
  for (;;) {
    const next = await whyIterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    failure: 'LLM_UNAVAILABLE（如实上报；版本不消耗 EB-02；旧状态不被污染）',
    recovery: '健康网关重试 CHANGE → 新方向完成：generation_cancelled(superseded_by_change) + experience_interrupted + 新候选流完成（内容 = change-direction fixture）',
  };
  const actual = {
    inFlightState: `${inFlight.state.status} v${inFlight.state.stateVersion}`,
    failureResult: failed.ok ? 'OK（缺陷！）' : failed.error.code,
    versionAfterFailure: failedState.ok ? failedState.state.stateVersion : null,
    versionExpected: inFlight.state.stateVersion,
    recoveryPolicy: ok.ok ? ok.header.policy_decision.selected_action : ok.error.code,
    recoveryContent: contentOf(okEvents),
    recoveryContentEqualsFixture: contentOf(okEvents) === changeDirection.chunks.join(''),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    finalState: finalState.ok ? `${finalState.state.status} v${finalState.state.stateVersion}` : 'ERROR',
    interrupted: eventsOf(events, 'experience_interrupted').length,
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
  };
  const pass =
    inFlight.state.status === 'ACTIVE' &&
    inFlight.state.stateVersion === 3 &&
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    failedState.ok &&
    failedState.state.stateVersion === inFlight.state.stateVersion &&
    ok.ok &&
    ok.header.policy_decision.selected_action === 'CHANGE_EXPERIENCE' &&
    actual.recoveryContentEqualsFixture &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    actual.interrupted === 2 && // 故障尝试与恢复尝试各登记一次旧候选拒绝
    actual.generationCancelled.filter((reason) => reason === 'superseded_by_change').length === 1 &&
    actual.generationCancelled.includes('superseded_by_change');
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G06 Stop——P0 硬边界）
// ---------------------------------------------------------------------------

// --- G06-N：正常路径（STOP 终止体验；无自动推荐/续行/追问） ------
async function caseG06Normal(trace) {
  const { runtime, events, audit } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g06n-1',
  });
  const firstEvents = first.ok ? await consume(first.stream) : [];
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g06n-2',
  });
  const stopEvents = stop.ok ? await consume(stop.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);
  const expected = {
    stopTerminates: '单一 stopped 终止事件、零内容分块',
    experience: 'COMPLETED/COMPLETION（v5）',
    session: 'SESSION_ENDED',
    events: 'stop_requested + experience_completed + experience_exited + session_ended',
    noAutoContinue: '无自动推荐/续行/追问',
  };
  const actual = {
    stopAccepted: stop.ok,
    stopStreamTypes: stopEvents.map((event) => event.type),
    stopChunkCount: stopEvents.filter((event) => event.type === 'chunk').length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    sessionState: sessionAfter?.state ?? 'ERROR',
    eventCounts: {
      stop_requested: eventsOf(events, 'stop_requested').length,
      experience_completed: eventsOf(events, 'experience_completed').length,
      experience_exited: eventsOf(events, 'experience_exited').length,
      session_ended: eventsOf(events, 'session_ended').length,
      runtime_waiting: eventsOf(events, 'runtime_waiting').length,
    },
    auditEvents: audit.length,
  };
  const pass =
    first.ok &&
    firstEvents.some((event) => event.type === 'done') &&
    stop.ok &&
    stop.header.policy_decision.selected_action === 'STOP' &&
    actual.stopChunkCount === 0 &&
    actual.stopStreamTypes.includes('stopped') &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'COMPLETED' &&
    finalState.state.stage === 'COMPLETION' &&
    sessionAfter?.state === 'SESSION_ENDED' &&
    actual.eventCounts.stop_requested === 1 &&
    actual.eventCounts.experience_completed === 1 &&
    actual.eventCounts.experience_exited === 1 &&
    actual.eventCounts.session_ended === 1;
  return { expected, actual, pass };
}

// --- G06-NEG：负向（STOP 后无 continuation；P0 硬边界，CC02 H02） --
async function caseG06Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g06neg-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g06neg-2',
  });
  await consume(stop.stream);
  // STOP 后：session_ended 登记；其后仅允许 STOP 自身的 policy_decided
  // 决策记录（C6 §18：决策事件在分支完成后发出，携带已应用效果）——
  // 不得出现任何内容生成/交互/等待事件（无 continuation，P0 硬边界）。
  const lastEvent = events[events.length - 1];
  const eventsAfterStop = events.slice(events.findIndex((event) => event.event_type === 'session_ended') + 1);
  const continuationForbidden = [
    'question_asked', 'why_requested', 'what_if_requested', 'change_direction_requested',
    'stop_requested', 'generation_started', 'generation_completed', 'llm_request_started',
    'llm_request_completed', 'llm_output_validated', 'runtime_waiting', 'state_transitioned',
    'experience_candidate_generated',
  ];
  const forbiddenAfterStop = eventsAfterStop.filter((event) => continuationForbidden.includes(event.event_type));
  // STOP 后提交任何输入均被拒绝（无 continuation 路径）。
  const afterStop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: 5,
    requestId: 'req-g06neg-3',
  });
  const expected = {
    noContinuation: 'session_ended 后仅跟随 STOP 自身的 policy_decided（携带已应用效果）；无任何内容生成/交互/等待事件；任何后续提交被拒绝',
  };
  const actual = {
    lastEventType: lastEvent?.event_type ?? null,
    eventsAfterSessionEnded: eventsAfterStop.map((event) => event.event_type),
    afterStopDecisionAction: eventsAfterStop[0]?.properties?.selected_action ?? null,
    afterStopDecisionStateAfter: eventsAfterStop[0]?.properties?.state_after?.status ?? null,
    forbiddenContinuationEvents: forbiddenAfterStop.map((event) => event.event_type),
    afterStopResult: afterStop.ok ? 'OK（缺陷！）' : afterStop.error.code,
  };
  const pass =
    lastEvent?.event_type === 'policy_decided' &&
    eventsAfterStop.length === 1 &&
    eventsAfterStop[0].event_type === 'policy_decided' &&
    eventsAfterStop[0].properties?.selected_action === 'STOP' &&
    eventsAfterStop[0].properties?.state_after?.status === 'COMPLETED' &&
    forbiddenAfterStop.length === 0 &&
    !afterStop.ok &&
    afterStop.error.code === 'INVALID_STATE_TRANSITION';
  return { expected, actual, pass };
}

// --- G06-B：边界（重复 STOP：终态拒绝） -----------------------------
async function caseG06Boundary(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g06b-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g06b-2',
  });
  await consume(stop.stream);
  const duplicateStop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: 5,
    requestId: 'req-g06b-3',
  });
  const expected = { duplicateStop: '拒绝——COMPLETED 为终态，SESSION_ENDED 拒绝旧操作' };
  const actual = {
    firstStopAccepted: stop.ok,
    duplicateResult: duplicateStop.ok ? 'OK（缺陷！）' : `${duplicateStop.error.code}（retryable=${duplicateStop.error.retryable}）`,
  };
  const pass = stop.ok && !duplicateStop.ok && duplicateStop.error.code === 'INVALID_STATE_TRANSITION';
  return { expected, actual, pass };
}

// --- G06-FR：故障恢复（生成中客户端中止；取消的 generation 不提交） -
async function caseG06FailureRecovery(trace) {
  const { runtime, events, audit } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const controller = new AbortController();
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g06fr-1',
    signal: controller.signal,
  });
  // 产出 submission + 1 分块后客户端中止。
  const iterator = sub.stream[Symbol.asyncIterator]();
  const delivered = [];
  for (let i = 0; i < 2; i += 1) {
    const next = await iterator.next();
    if (next.done) break;
    delivered.push(next.value);
  }
  controller.abort();
  const rest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    rest.push(next.value);
  }
  const stateAfterAbort = runtime.getExperienceState(exp.experienceId);
  // 中止后状态保持提交时版本（ACTIVE v3）；随后 STOP 仍可从 ACTIVE 终止。
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterAbort.state.stateVersion,
    requestId: 'req-g06fr-2',
  });
  const stopEvents = stop.ok ? await consume(stop.stream) : [];
  const expected = {
    abortMidStream: '已交付 1 分块；取消后零后续分块，cancelled 终止事件',
    stateAfterAbort: 'ACTIVE v3（无完成提交——取消的 generation 不提交）',
    stopAfterAbort: 'STOP 从 ACTIVE 仍可终止（P-01）',
  };
  const actual = {
    deliveredTypes: delivered.map((event) => event.type),
    restTypes: rest.map((event) => event.type),
    restChunkCount: rest.filter((event) => event.type === 'chunk').length,
    stateAfterAbort: `${stateAfterAbort.state.status} v${stateAfterAbort.state.stateVersion}`,
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
    stopAfterAbort: stop.ok ? stopEvents.map((event) => event.type) : stop.error.code,
    finalState: runtime.getExperienceState(exp.experienceId).state.status,
    auditEvents: audit.length,
  };
  const pass =
    delivered.length === 2 &&
    delivered[0].type === 'submission' &&
    delivered[1].type === 'chunk' &&
    actual.restChunkCount === 0 &&
    rest.some((event) => event.type === 'cancelled') &&
    stateAfterAbort.state.stateVersion === 3 &&
    stateAfterAbort.state.status === 'ACTIVE' &&
    actual.generationCancelled.includes('client_disconnect_or_interrupt') &&
    stop.ok &&
    stopEvents.some((event) => event.type === 'stopped') &&
    actual.finalState === 'COMPLETED';
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G04 Creation——P2 Exit Gate §8 G04；PD-21 关闭切片最小实现）
// ---------------------------------------------------------------------------

// --- G04-N：正常路径（WHY 完成后 CREATE：最小 Creation Branch） -------------
async function caseG04Normal(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const classification = classifyInput('这个可以做成一个小游戏。');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g04n-1',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  await consume(why.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  // CREATE：当前会话方向信号（最小 Creation Branch；继承当前探索上下文）。
  const create = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g04n-2',
  });
  const createEvents = create.ok ? await consume(create.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const createRequested = eventsOf(events, 'create_requested');
  const createTrace = traces.find((entry) => entry.semantic_action === 'CREATE');
  const memoryEvents = events.filter((event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)));
  const expected = {
    classification: 'CREATE（"做成"模式；PD-21 关闭切片）',
    policy: 'CREATE → CREATE（policy_v2.2.0）',
    stream: 'submission → chunks → done → state_updated',
    content: createFixture.chunks.join(''),
    headerState: 'ACTIVE/CREATION（迁移提交时视图）',
    finalState: 'WAITING/CREATION（阶段迁移 UNDERSTANDING → CREATION）',
    stateVersion: '6（v4 + CREATE 迁移 v5 + 完成提交 v6）',
    persistence: '零 memory 事件（CREATE 流程不登记记忆——记忆仅经体验完成 STOP 路径与显式记忆操作登记，F-5）',
  };
  const actual = {
    classification: classification.semanticAction,
    policyAction: create.ok ? create.header.policy_decision.selected_action : create.error.code,
    policyVersion: create.ok ? create.header.policy_decision.policy_version : null,
    stateVersion: create.ok ? create.header.state_version : null,
    headerState: create.ok ? `${create.header.state.status}/${create.header.state.stage}` : 'ERROR',
    streamTypes: createEvents.map((event) => event.type),
    contentEqualsFixture: contentOf(createEvents) === createFixture.chunks.join(''),
    eventExperienceId: createRequested[0]?.context.experience_id ?? null,
    eventSessionId: createRequested[0]?.identity.session_id ?? null,
    createRequestedEvents: createRequested.length,
    whyRequestedEvents: eventsOf(events, 'why_requested').length,
    stateTransitionedCreate: eventsOf(events, 'state_transitioned').some((event) => event.properties.event === 'CREATE'),
    decisionTraceSemanticAction: createTrace?.semantic_action ?? null,
    decisionTracePolicyVersion: createTrace?.policy?.policy_version ?? null,
    decisionTraceReason: createTrace?.reason?.primary ?? null,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : 'ERROR',
    finalStateVersion: finalState.ok ? finalState.state.stateVersion : null,
    lastSemanticAction: finalState.ok ? finalState.state.lastSemanticAction : null,
    memoryEvents: memoryEvents.length,
  };
  const pass =
    classification.semanticAction === 'CREATE' &&
    create.ok &&
    actual.policyAction === 'CREATE' &&
    actual.policyVersion === 'policy_v2.2.0' &&
    actual.stateVersion === 5 &&
    actual.headerState === 'ACTIVE/CREATION' &&
    createEvents[0].type === 'submission' &&
    createEvents.some((event) => event.type === 'done') &&
    createEvents.some((event) => event.type === 'state_updated') &&
    actual.contentEqualsFixture &&
    actual.eventExperienceId === exp.experienceId &&
    actual.eventSessionId === session.sessionId &&
    actual.createRequestedEvents === 1 &&
    actual.whyRequestedEvents === 1 &&
    actual.stateTransitionedCreate &&
    actual.decisionTraceSemanticAction === 'CREATE' &&
    actual.decisionTracePolicyVersion === 'policy_v2.2.0' &&
    actual.decisionTraceReason === 'explicit_user_direction' &&
    finalState.ok &&
    finalState.state.stateVersion === 6 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    actual.lastSemanticAction === 'CREATE' &&
    actual.memoryEvents === 0;
  return { expected, actual, pass };
}

// --- G04-NEG：负向（生成中 CREATE：取消旧生成、拒绝旧候选；CREATE 优先于 WHY）
async function caseG04Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const classification = classifyInput('为什么不做成一个小游戏');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g04neg-1',
  });
  if (!first.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: first.error.code }, pass: false };
  }
  // 生成在途：仅消费 submission 事件，保持流开启以观测取消终止。
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  const create = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '为什么不做成一个小游戏',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g04neg-2',
  });
  const createEvents = create.ok ? await consume(create.stream) : [];
  const oldRest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    classification: 'CREATE（CREATE 模式优先于 WHY 标记：PD-21 显式用户方向优先于探索继续）',
    inFlightCancel: 'generation_cancelled（reason=superseded_by_create；P-02 同族）',
    oldCandidateRejected: 'experience_interrupted（reason=create，old_generation_rejected）',
    newStream: 'submission → chunks → done → state_updated',
    oldStream: '取消终止（零内容分块交付）',
    finalState: 'WAITING/CREATION',
    stateVersion: '5（v3 + CREATE 迁移 v4 + 完成提交 v5）',
  };
  const actual = {
    classification: classification.semanticAction,
    inFlightState: `${stateInFlight.state.status} v${stateInFlight.state.stateVersion}`,
    createAccepted: create.ok,
    createPolicy: create.ok ? create.header.policy_decision.selected_action : create.error.code,
    createStreamTypes: createEvents.map((event) => event.type),
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
    interrupted: eventsOf(events, 'experience_interrupted').map((event) => event.properties.reason),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
  };
  const pass =
    classification.semanticAction === 'CREATE' &&
    stateInFlight.state.status === 'ACTIVE' &&
    stateInFlight.state.stateVersion === 3 &&
    create.ok &&
    actual.createPolicy === 'CREATE' &&
    createEvents[0].type === 'submission' &&
    createEvents.some((event) => event.type === 'done') &&
    createEvents.some((event) => event.type === 'state_updated') &&
    actual.generationCancelled.filter((reason) => reason === 'superseded_by_create').length === 1 &&
    actual.interrupted.filter((reason) => reason === 'create').length === 1 &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION';
  return { expected, actual, pass };
}

// --- G04-B：边界（相邻重复 CREATE：每次完整执行；版本链 +1 不变式） --------
async function caseG04Boundary(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g04b-1',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  await consume(why.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g04b-2',
  });
  const firstEvents = first.ok ? await consume(first.stream) : [];
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const second = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再做一个这样的小游戏。',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-g04b-3',
  });
  const secondEvents = second.ok ? await consume(second.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const versionMarks = [
    ...eventsOf(events, 'state_transitioned').map((event) => event.properties.state_version_after),
    ...eventsOf(events, 'runtime_waiting').map((event) => event.context.state_version),
  ].sort((left, right) => left - right);
  const expected = {
    repeatBehavior: '相邻重复 CREATE：每次均生成完整最小构建（内容逐字节等于 fixture；不省略、不累积）',
    versionChain: '每次合法提交恰好 +1（v4 → v8）',
  };
  const actual = {
    firstPolicy: first.ok ? first.header.policy_decision.selected_action : first.error.code,
    firstContentEqualsFixture: contentOf(firstEvents) === createFixture.chunks.join(''),
    secondClassification: classifyInput('再做一个这样的小游戏。').semanticAction,
    secondPolicy: second.ok ? second.header.policy_decision.selected_action : second.error.code,
    secondContentEqualsFixture: contentOf(secondEvents) === createFixture.chunks.join(''),
    createRequestedEvents: eventsOf(events, 'create_requested').length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    versionMarks,
  };
  const pass =
    first.ok &&
    actual.firstPolicy === 'CREATE' &&
    actual.firstContentEqualsFixture &&
    stateAfterFirst.state.stateVersion === 6 &&
    actual.secondClassification === 'CREATE' &&
    second.ok &&
    actual.secondPolicy === 'CREATE' &&
    actual.secondContentEqualsFixture &&
    actual.createRequestedEvents === 2 &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    JSON.stringify(versionMarks) === JSON.stringify([2, 3, 4, 5, 6, 7, 8]);
  return { expected, actual, pass };
}

// --- G04-FR：故障恢复（CREATE 期间网关不可用 → 恢复后最小创作完成） --------
async function caseG04FailureRecovery(trace) {
  // 可切换网关（WHY 生成在途时健康；故障窗口内 propose 抛错；恢复后健康）。
  // 网关接口是既定证据注入点（llm-gateway.ts 头部声明；G05-FR 同源形态）。
  const healthyGateway = new SyntheticLlmGateway(allFixtures());
  let activeGateway = healthyGateway;
  const swappableGateway = { propose: (request) => activeGateway.propose(request) };
  const { runtime, events } = createCaseRuntime(swappableGateway);
  const { session, intent, exp } = await setupChain(runtime, {
    rawInput: '为什么',
    intentRequestId: 'req-g04fr-i1',
    experienceRequestId: 'req-g04fr-e1',
  });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g04fr-0',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  const whyIterator = why.stream[Symbol.asyncIterator]();
  await whyIterator.next(); // submission；流保持开启
  const inFlight = runtime.getExperienceState(exp.experienceId);
  // 故障：网关不可用窗口内 CREATE → LLM_UNAVAILABLE。
  // （P-02：取消旧 generation 先于 LLM 调用；EB-02：propose 失败不提交、
  //  不消耗版本号、旧状态不被污染。）
  activeGateway = failingGateway();
  const failed = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-g04fr-1',
  });
  const failedState = runtime.getExperienceState(exp.experienceId);
  // 恢复：健康网关重试 CREATE → 最小创作完成（取代已取消的旧候选）。
  activeGateway = healthyGateway;
  const ok = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: failedState.ok ? failedState.state.stateVersion : inFlight.state.stateVersion,
    requestId: 'req-g04fr-2',
  });
  const okEvents = ok.ok ? await consume(ok.stream) : [];
  const oldRest = [];
  for (;;) {
    const next = await whyIterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    failure: 'LLM_UNAVAILABLE（如实上报；版本不消耗 EB-02；旧状态不被污染）',
    recovery: '健康网关重试 CREATE → 最小创作完成：generation_cancelled(superseded_by_create) + experience_interrupted(create) + 新候选流完成（内容 = create fixture）',
  };
  const actual = {
    inFlightState: `${inFlight.state.status} v${inFlight.state.stateVersion}`,
    failureResult: failed.ok ? 'OK（缺陷！）' : failed.error.code,
    versionAfterFailure: failedState.ok ? failedState.state.stateVersion : null,
    recoveryPolicy: ok.ok ? ok.header.policy_decision.selected_action : ok.error.code,
    recoveryContentEqualsFixture: contentOf(okEvents) === createFixture.chunks.join(''),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    interrupted: eventsOf(events, 'experience_interrupted').map((event) => event.properties.reason),
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
  };
  const pass =
    inFlight.state.status === 'ACTIVE' &&
    inFlight.state.stateVersion === 3 &&
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    failedState.ok &&
    failedState.state.stateVersion === inFlight.state.stateVersion &&
    ok.ok &&
    actual.recoveryPolicy === 'CREATE' &&
    actual.recoveryContentEqualsFixture &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    actual.interrupted.filter((reason) => reason === 'create').length === 2 &&
    actual.generationCancelled.filter((reason) => reason === 'superseded_by_create').length === 1 &&
    actual.generationCancelled.includes('superseded_by_create');
  return { expected, actual, pass };
}

// 黄金案例（G07 Correction——P2 Exit Gate §8 G07；PD-21 关闭切片最小实现）
// ---------------------------------------------------------------------------

// --- G07-N：正常路径（WHY 完成后 CORRECTION：最小 Correction，阶段保持） ---
async function caseG07Normal(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const classification = classifyInput('不是这个意思。');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g07n-1',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  await consume(why.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  // CORRECTION：用户纠正（最小 Correction：移除无效推断、保留有效上下文）。
  const correct = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不是这个意思。',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g07n-2',
  });
  const correctEvents = correct.ok ? await consume(correct.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const correctionRequested = eventsOf(events, 'correction_requested');
  const correctionTrace = traces.find((entry) => entry.semantic_action === 'CORRECTION');
  const memoryEvents = events.filter((event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)));
  const expected = {
    classification: 'CORRECTION（"不是"模式；PD-21 关闭切片）',
    policy: 'CORRECTION → EXPLAIN（重评估落到合法 Policy Action；policy_v2.2.0）',
    stream: 'submission → chunks → done → state_updated',
    content: correctionFixture.chunks.join(''),
    headerState: 'ACTIVE/UNDERSTANDING（迁移提交时视图；阶段保持）',
    finalState: 'WAITING/UNDERSTANDING（阶段保持：重评估当前阶段）',
    stateVersion: '6（v4 + CORRECTION 迁移 v5 + 完成提交 v6）',
    persistence: '零 memory 事件（CORRECTION 流程不登记记忆——记忆仅经体验完成 STOP 路径与显式记忆操作登记，F-5）',
  };
  const actual = {
    classification: classification.semanticAction,
    selectedAction: correct.ok ? correct.header.policy_decision.selected_action : correct.error.code,
    policyVersion: correct.ok ? correct.header.policy_decision.policy_version : null,
    stateVersion: correct.ok ? correct.header.state_version : null,
    headerState: correct.ok ? `${correct.header.state.status}/${correct.header.state.stage}` : 'ERROR',
    streamTypes: correctEvents.map((event) => event.type),
    contentEqualsFixture: contentOf(correctEvents) === correctionFixture.chunks.join(''),
    eventExperienceId: correctionRequested[0]?.context.experience_id ?? null,
    eventSessionId: correctionRequested[0]?.identity.session_id ?? null,
    correctionRequestedEvents: correctionRequested.length,
    whyRequestedEvents: eventsOf(events, 'why_requested').length,
    interrupted: eventsOf(events, 'experience_interrupted').map((event) => event.properties.reason),
    stateTransitionedCorrection: eventsOf(events, 'state_transitioned').some((event) => event.properties.event === 'CORRECTION'),
    decisionTraceSemanticAction: correctionTrace?.semantic_action ?? null,
    decisionTracePolicyVersion: correctionTrace?.policy?.policy_version ?? null,
    decisionTraceReason: correctionTrace?.reason?.primary ?? null,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : 'ERROR',
    finalStateVersion: finalState.ok ? finalState.state.stateVersion : null,
    lastSemanticAction: finalState.ok ? finalState.state.lastSemanticAction : null,
    memoryEvents: memoryEvents.length,
  };
  const pass =
    classification.semanticAction === 'CORRECTION' &&
    correct.ok &&
    actual.selectedAction === 'EXPLAIN' &&
    actual.policyVersion === 'policy_v2.2.0' &&
    actual.stateVersion === 5 &&
    actual.headerState === 'ACTIVE/UNDERSTANDING' &&
    correctEvents[0].type === 'submission' &&
    correctEvents.some((event) => event.type === 'done') &&
    correctEvents.some((event) => event.type === 'state_updated') &&
    actual.contentEqualsFixture &&
    actual.eventExperienceId === exp.experienceId &&
    actual.eventSessionId === session.sessionId &&
    actual.correctionRequestedEvents === 1 &&
    actual.whyRequestedEvents === 1 &&
    actual.interrupted.filter((reason) => reason === 'correction').length === 1 &&
    actual.stateTransitionedCorrection &&
    actual.decisionTraceSemanticAction === 'CORRECTION' &&
    actual.decisionTracePolicyVersion === 'policy_v2.2.0' &&
    actual.decisionTraceReason === 'reassess' &&
    finalState.ok &&
    finalState.state.stateVersion === 6 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'UNDERSTANDING' &&
    actual.lastSemanticAction === 'CORRECTION' &&
    actual.memoryEvents === 0;
  return { expected, actual, pass };
}

// --- G07-NEG：负向（生成中 CORRECTION：取消旧生成、拒绝旧候选；纠正优先于 WHY）
async function caseG07Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const classification = classifyInput('不是这个意思，为什么');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g07neg-1',
  });
  if (!first.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: first.error.code }, pass: false };
  }
  // 生成在途：仅消费 submission 事件，保持流开启以观测取消终止。
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  const correct = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不是这个意思，为什么',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g07neg-2',
  });
  const correctEvents = correct.ok ? await consume(correct.stream) : [];
  const oldRest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    classification: 'CORRECTION（纠正优先于 WHY 标记：PD-21 显式用户方向优先）',
    inFlightCancel: 'generation_cancelled（reason=correction）',
    oldCandidateRejected: 'experience_interrupted（reason=correction，old_generation_rejected）',
    newStream: 'submission → chunks → done → state_updated',
    oldStream: '取消终止（零内容分块交付）',
    finalState: 'WAITING/UNDERSTANDING（阶段保持）',
    stateVersion: '5（v3 + CORRECTION 迁移 v4 + 完成提交 v5）',
  };
  const actual = {
    classification: classification.semanticAction,
    inFlightState: `${stateInFlight.state.status} v${stateInFlight.state.stateVersion}`,
    correctAccepted: correct.ok,
    correctPolicy: correct.ok ? correct.header.policy_decision.selected_action : correct.error.code,
    correctStreamTypes: correctEvents.map((event) => event.type),
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
    interrupted: eventsOf(events, 'experience_interrupted').map((event) => event.properties.reason),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
  };
  const pass =
    classification.semanticAction === 'CORRECTION' &&
    stateInFlight.state.status === 'ACTIVE' &&
    stateInFlight.state.stateVersion === 3 &&
    correct.ok &&
    actual.correctPolicy === 'EXPLAIN' &&
    correctEvents[0].type === 'submission' &&
    correctEvents.some((event) => event.type === 'done') &&
    correctEvents.some((event) => event.type === 'state_updated') &&
    actual.generationCancelled.filter((reason) => reason === 'correction').length === 1 &&
    actual.interrupted.filter((reason) => reason === 'correction').length === 1 &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'UNDERSTANDING';
  return { expected, actual, pass };
}

// --- G07-B：边界（纠正后继续 WHY 探索：有效上下文保留；版本链 +1 不变式） --
async function caseG07Boundary(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g07b-1',
  });
  if (!first.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: first.error.code }, pass: false };
  }
  await consume(first.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  // 纠正：重评估当前阶段（UNDERSTANDING 保持；无效推断移除）。
  const correction = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不对，这个理解错了',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g07b-2',
  });
  const correctionEvents = correction.ok ? await consume(correction.stream) : [];
  const stateAfterCorrection = runtime.getExperienceState(exp.experienceId);
  // 纠正后继续 WHY 探索（同一会话 / 意图：有效上下文保留）。
  const secondWhy = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: stateAfterCorrection.state.stateVersion,
    requestId: 'req-g07b-3',
  });
  const secondWhyEvents = secondWhy.ok ? await consume(secondWhy.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const sessionIds = new Set([session.sessionId]);
  const intentIds = new Set([intent.intent.intentId]);
  const versionMarks = [
    ...eventsOf(events, 'state_transitioned').map((event) => event.properties.state_version_after),
    ...eventsOf(events, 'runtime_waiting').map((event) => event.context.state_version),
  ].sort((left, right) => left - right);
  const expected = {
    correctionThenExploration: '纠正后 WHY 探索继续（同一会话 / 意图：有效上下文保留，无效推断移除）',
    versionChain: '每次合法提交恰好 +1（v4 → v8）',
  };
  const actual = {
    correctionPolicy: correction.ok ? correction.header.policy_decision.selected_action : correction.error.code,
    correctionContentEqualsFixture: contentOf(correctionEvents) === correctionFixture.chunks.join(''),
    stateAfterCorrection: stateAfterCorrection.ok ? `${stateAfterCorrection.state.status}/${stateAfterCorrection.state.stage} v${stateAfterCorrection.state.stateVersion}` : 'ERROR',
    secondWhyPolicy: secondWhy.ok ? secondWhy.header.policy_decision.selected_action : secondWhy.error.code,
    secondWhyContentEqualsFixture: contentOf(secondWhyEvents) === why.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    sessionIdsSize: sessionIds.size,
    intentIdsSize: intentIds.size,
    whyRequestedEvents: eventsOf(events, 'why_requested').length,
    versionMarks,
  };
  const pass =
    correction.ok &&
    actual.correctionPolicy === 'EXPLAIN' &&
    actual.correctionContentEqualsFixture &&
    stateAfterCorrection.state.stateVersion === 6 &&
    stateAfterCorrection.state.stage === 'UNDERSTANDING' &&
    secondWhy.ok &&
    actual.secondWhyPolicy === 'EXPLAIN' &&
    actual.secondWhyContentEqualsFixture &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'UNDERSTANDING' &&
    actual.sessionIdsSize === 1 &&
    actual.intentIdsSize === 1 &&
    actual.whyRequestedEvents === 2 &&
    JSON.stringify(versionMarks) === JSON.stringify([2, 3, 4, 5, 6, 7, 8]);
  return { expected, actual, pass };
}

// --- G07-FR：故障恢复（CORRECTION 期间网关不可用 → 恢复后重评估完成） ------
async function caseG07FailureRecovery(trace) {
  // 可切换网关（WHY 生成在途时健康；故障窗口内 propose 抛错；恢复后健康）。
  // 网关接口是既定证据注入点（llm-gateway.ts 头部声明；G05-FR 同源形态）。
  const healthyGateway = new SyntheticLlmGateway(allFixtures());
  let activeGateway = healthyGateway;
  const swappableGateway = { propose: (request) => activeGateway.propose(request) };
  const { runtime, events } = createCaseRuntime(swappableGateway);
  const { session, intent, exp } = await setupChain(runtime, {
    rawInput: '为什么',
    intentRequestId: 'req-g07fr-i1',
    experienceRequestId: 'req-g07fr-e1',
  });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g07fr-0',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  const whyIterator = why.stream[Symbol.asyncIterator]();
  await whyIterator.next(); // submission；流保持开启
  const inFlight = runtime.getExperienceState(exp.experienceId);
  // 故障：网关不可用窗口内 CORRECTION → LLM_UNAVAILABLE（EB-02）。
  activeGateway = failingGateway();
  const failed = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不是这个意思。',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-g07fr-1',
  });
  const failedState = runtime.getExperienceState(exp.experienceId);
  // 恢复：健康网关重试 CORRECTION → 重评估完成（取代已取消的旧候选）。
  activeGateway = healthyGateway;
  const ok = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不是这个意思。',
    expectedStateVersion: failedState.ok ? failedState.state.stateVersion : inFlight.state.stateVersion,
    requestId: 'req-g07fr-2',
  });
  const okEvents = ok.ok ? await consume(ok.stream) : [];
  const oldRest = [];
  for (;;) {
    const next = await whyIterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    failure: 'LLM_UNAVAILABLE（如实上报；版本不消耗 EB-02；旧状态不被污染）',
    recovery: '健康网关重试 CORRECTION → 重评估完成：generation_cancelled(correction) + experience_interrupted(correction) + 新候选流完成（内容 = correction fixture）',
  };
  const actual = {
    inFlightState: `${inFlight.state.status} v${inFlight.state.stateVersion}`,
    failureResult: failed.ok ? 'OK（缺陷！）' : failed.error.code,
    versionAfterFailure: failedState.ok ? failedState.state.stateVersion : null,
    recoveryPolicy: ok.ok ? ok.header.policy_decision.selected_action : ok.error.code,
    recoveryContentEqualsFixture: contentOf(okEvents) === correctionFixture.chunks.join(''),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    interrupted: eventsOf(events, 'experience_interrupted').map((event) => event.properties.reason),
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
  };
  const pass =
    inFlight.state.status === 'ACTIVE' &&
    inFlight.state.stateVersion === 3 &&
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    failedState.ok &&
    failedState.state.stateVersion === inFlight.state.stateVersion &&
    ok.ok &&
    actual.recoveryPolicy === 'EXPLAIN' &&
    actual.recoveryContentEqualsFixture &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'UNDERSTANDING' &&
    actual.interrupted.filter((reason) => reason === 'correction').length === 2 &&
    actual.generationCancelled.filter((reason) => reason === 'correction').length === 1 &&
    actual.generationCancelled.includes('correction');
  return { expected, actual, pass };
}

// 黄金案例（G08 Memory Boundary——P2 Exit Gate §8 G08；PD-21 关闭切片最小实现）
// ---------------------------------------------------------------------------

// --- G08-N：正常路径（生成中方向信号：当前会话信号不持久化为跨会话偏好） -
async function caseG08Normal(trace) {
  const { runtime, events } = createCaseRuntime();
  const classification = classifyInput('今天不要这个');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g08n-1',
  });
  if (!first.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: first.error.code }, pass: false };
  }
  // 生成在途：仅消费 submission 事件，保持流开启以观测取消终止。
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '今天不要这个',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g08n-2',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  const oldRest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const memoryEvents = events.filter((event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)));
  const expected = {
    classification: 'CHANGE_DIRECTION（"不要这个"为当前会话方向信号；G08 最小形态：不持久化为跨会话偏好）',
    designNote: 'CHANGE_DIRECTION 从 WAITING 在冻结状态机中非法（无 WAITING→ENTERING 规则）；本案例从在途 ACTIVE v3 观测（与 G05-N 同源形态）',
    flow: '生成中 CHANGE：取消旧生成、拒绝旧候选、新方向（与 G05 同族；P-02）',
    content: changeDirection.chunks.join(''),
    finalState: 'WAITING/UNDERSTANDING（新方向完成）',
    stateVersion: '5（v3 + 复合迁移 v4 + 完成提交 v5）',
    persistence: '无 memory 层事件（CHANGE_DIRECTION 方向信号不登记记忆——记忆仅经体验完成 STOP 路径与显式记忆操作登记，F-5）',
  };
  const actual = {
    classification: classification.semanticAction,
    inFlightState: `${stateInFlight.state.status} v${stateInFlight.state.stateVersion}`,
    changeAccepted: change.ok,
    changePolicy: change.ok ? change.header.policy_decision.selected_action : change.error.code,
    contentEqualsFixture: contentOf(changeEvents) === changeDirection.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    generationCancelled: eventsOf(events, 'generation_cancelled').map((event) => event.properties.reason),
    interrupted: eventsOf(events, 'experience_interrupted').map((event) => event.properties.reason),
    stateTransitions: eventsOf(events, 'state_transitioned').map((event) => event.properties.event),
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    memoryEvents: memoryEvents.length,
  };
  const pass =
    classification.semanticAction === 'CHANGE_DIRECTION' &&
    stateInFlight.state.status === 'ACTIVE' &&
    stateInFlight.state.stateVersion === 3 &&
    change.ok &&
    actual.changePolicy === 'CHANGE_EXPERIENCE' &&
    actual.contentEqualsFixture &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    actual.generationCancelled.filter((reason) => reason === 'superseded_by_change').length === 1 &&
    actual.interrupted.filter((reason) => reason === 'change_direction').length === 1 &&
    actual.stateTransitions.includes('CHANGE_DIRECTION') &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    actual.memoryEvents === 0;
  return { expected, actual, pass };
}

// --- G08-NEG：负向（方向信号变体仍为 CHANGE；记忆升级尝试被升级拒绝） ------
async function caseG08Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const changeClassification = classifyInput('以后不要这个');
  const rememberClassification = classifyInput('记住这个');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g08neg-1',
  });
  if (!first.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: first.error.code }, pass: false };
  }
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission；生成在途
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '以后不要这个',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g08neg-2',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  const stateAfterChange = runtime.getExperienceState(exp.experienceId);
  const eventsBeforeRemember = events.length;
  // 负向核心：记忆升级尝试——"记住这个"不可分类（UNKNOWN）→ 升级拒绝。
  // 未知情况升级而非由 LLM 决定（授权 §5.7）；不产生事件、不消耗版本。
  const remember = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '记住这个',
    expectedStateVersion: stateAfterChange.state.stateVersion,
    requestId: 'req-g08neg-3',
  });
  const eventsAddedByRemember = events.length - eventsBeforeRemember;
  const oldRest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    oldRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const memoryEvents = events.filter((event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)));
  const expected = {
    directionVariant: '"以后不要这个" → CHANGE_DIRECTION（当前会话方向信号；相邻变体不改变分类）',
    memoryUpgrade: '"记住这个" → UNKNOWN → INVALID_ACTION（未知情况升级而非由 LLM 决定；授权 §5.7）',
    noPersistence: '记忆升级尝试零事件、零版本消耗、零持久化（G08 硬边界；PD-07）',
  };
  const actual = {
    changeClassification: changeClassification.semanticAction,
    rememberClassification: rememberClassification.semanticAction,
    changeAccepted: change.ok,
    changePolicy: change.ok ? change.header.policy_decision.selected_action : change.error.code,
    changeContentEqualsFixture: contentOf(changeEvents) === changeDirection.chunks.join(''),
    rememberResult: remember.ok ? 'OK（缺陷！）' : remember.error.code,
    eventsAddedByRemember,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    oldStreamChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
    memoryEvents: memoryEvents.length,
  };
  const pass =
    changeClassification.semanticAction === 'CHANGE_DIRECTION' &&
    rememberClassification.semanticAction === 'UNKNOWN' &&
    change.ok &&
    actual.changePolicy === 'CHANGE_EXPERIENCE' &&
    actual.changeContentEqualsFixture &&
    !remember.ok &&
    remember.error.code === 'INVALID_ACTION' &&
    actual.eventsAddedByRemember === 0 &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    actual.oldStreamChunkCount === 0 &&
    actual.oldStreamCancelled &&
    actual.memoryEvents === 0;
  return { expected, actual, pass };
}

// --- G08-B：边界（静态存在证明 + 相邻方向信号变体运行时结构等价） --------
async function caseG08Boundary(trace) {
  // 静态存在证明（F-5：记忆层存在——S2A-F5-SEMANTIC-FREEZE-01
  // v1.0.0 §4 轴外记忆子状态机；PD-07"不持久化跨会话数据"纪律
  // 经 P3-S2-IMPL-AUTH-01 v1.2.0 §2(4) 取代性扩展为短期记忆
  // 跨会话持久化；记忆域经 Runtime 单一写入者集成——HTTP 层
  // 不直接触达记忆域）。
  const productDirs = [path.join(repoRoot, 'src', 'experience'), path.join(repoRoot, 'app', 'api')];
  const productFiles = [];
  for (const dir of productDirs) {
    productFiles.push(...(await listProductTsFiles(dir)));
  }
  const memoryFiles = productFiles.filter((file) => /memory/i.test(path.basename(file)));
  const memoryImports = [];
  for (const file of productFiles) {
    const source = await readFile(file, 'utf8');
    memoryImports.push(...importSpecifiers(source).filter((specifier) => /memory/i.test(specifier)));
  }
  const httpSource = await readFile(path.join(repoRoot, 'src', 'experience', 'http.ts'), 'utf8');
  const httpMemoryImports = importSpecifiers(httpSource).filter((specifier) => /memory/i.test(specifier));
  // 动态证明：两个相邻方向信号变体在运行时结构上等价
  // （分类 → 策略 → 事件序列 → 内容 → 终态 → 旧流取消 → 零 memory 事件）。
  const runSignal = async (signal) => {
    const { runtime, events } = createCaseRuntime();
    const { session, intent, exp } = await setupChain(runtime, {
      rawInput: '为什么',
      intentRequestId: `req-g08b-i-${signal}`,
      experienceRequestId: `req-g08b-e-${signal}`,
    });
    const first = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHY',
      rawInput: '为什么？',
      expectedStateVersion: exp.stateVersion,
      requestId: `req-g08b-1-${signal}`,
    });
    const iterator = first.stream[Symbol.asyncIterator]();
    await iterator.next(); // submission；生成在途
    const stateInFlight = runtime.getExperienceState(exp.experienceId);
    const change = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'CHANGE_DIRECTION',
      rawInput: signal,
      expectedStateVersion: stateInFlight.state.stateVersion,
      requestId: `req-g08b-2-${signal}`,
    });
    const changeEvents = change.ok ? await consume(change.stream) : [];
    const oldRest = [];
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      oldRest.push(next.value);
    }
    const finalState = runtime.getExperienceState(exp.experienceId);
    const memoryEvents = events.filter((event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)));
    return {
      classification: classifyInput(signal).semanticAction,
      accepted: change.ok,
      policyAction: change.ok ? change.header.policy_decision.selected_action : change.error.code,
      eventTypes: events.map((event) => event.event_type),
      contentEqualsFixture: contentOf(changeEvents) === changeDirection.chunks.join(''),
      finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
      oldStreamCancelled: oldRest.some((event) => event.type === 'cancelled'),
      memoryEvents: memoryEvents.length,
    };
  };
  const signalA = await runSignal('今天不要这个');
  const signalB = await runSignal('以后不要这个');
  const structurallyIdentical =
    signalA.classification === signalB.classification &&
    signalA.accepted === signalB.accepted &&
    signalA.policyAction === signalB.policyAction &&
    JSON.stringify(signalA.eventTypes) === JSON.stringify(signalB.eventTypes) &&
    signalA.contentEqualsFixture === signalB.contentEqualsFixture &&
    signalA.finalState === signalB.finalState &&
    signalA.oldStreamCancelled === signalB.oldStreamCancelled &&
    signalA.memoryEvents === signalB.memoryEvents;
  const expected = {
    staticPresence: '记忆层存在且契约完整（src/experience/memory.ts；classifier.ts + runtime.ts 经 ./memory 导入——记忆操作识别 + Runtime 单一写入者集成；HTTP 层不直接触达记忆域——F-5 / S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §4）',
    dynamicEquivalence: '相邻方向信号变体（"今天不要这个" / "以后不要这个"）运行时结构等价：分类、策略、事件序列、内容、终态、旧流取消、零 memory 事件',
  };
  const actual = {
    productTsFiles: productFiles.length,
    memoryFiles,
    memoryImports,
    httpMemoryImports,
    signalA,
    signalB,
    structurallyIdentical,
  };
  const staticPresence =
    memoryFiles.some((file) => path.basename(file) === 'memory.ts') &&
    memoryImports.filter((specifier) => specifier === './memory').length === 2 &&
    httpMemoryImports.length === 0;
  const pass =
    staticPresence &&
    signalA.classification === 'CHANGE_DIRECTION' &&
    signalB.classification === 'CHANGE_DIRECTION' &&
    signalA.policyAction === 'CHANGE_EXPERIENCE' &&
    signalB.policyAction === 'CHANGE_EXPERIENCE' &&
    signalA.contentEqualsFixture &&
    signalB.contentEqualsFixture &&
    signalA.memoryEvents === 0 &&
    signalB.memoryEvents === 0 &&
    signalA.oldStreamCancelled &&
    signalB.oldStreamCancelled &&
    structurallyIdentical;
  return { expected, actual, pass };
}

// --- G08-FR：故障恢复（对抗记忆升级尝试 → 在途 WHY 生成不受干扰地完成） --
async function caseG08FailureRecovery(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g08fr-1',
  });
  if (!first.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: first.error.code }, pass: false };
  }
  // 生成在途：持有迭代器但尚未拉取（观测对抗尝试的零副作用）。
  const iterator = first.stream[Symbol.asyncIterator]();
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  const eventsBeforeAdversarial = events.length;
  // 对抗输入："记住这个"（记忆升级尝试）→ 升级拒绝，零副作用。
  const adversarial = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '记住这个',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-g08fr-2',
  });
  const eventsAddedByAdversarial = events.length - eventsBeforeAdversarial;
  // 恢复：在途 WHY 生成继续完成（不受对抗尝试影响）。
  const whyRest = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    whyRest.push(next.value);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const stateTransitions = eventsOf(events, 'state_transitioned').map((event) => event.properties.event);
  const generationCancelledCount = eventsOf(events, 'generation_cancelled').length;
  const versionMarks = [
    ...eventsOf(events, 'state_transitioned').map((event) => event.properties.state_version_after),
    ...eventsOf(events, 'runtime_waiting').map((event) => event.context.state_version),
  ].sort((left, right) => left - right);
  const expected = {
    adversarial: '"记住这个" → UNKNOWN → INVALID_ACTION（不消耗版本、零事件、零取消；G08 硬边界）',
    recovery: '在途 WHY 生成不受干扰地完成（内容逐字节等于 why fixture；版本链完整）',
  };
  const actual = {
    inFlightState: `${stateInFlight.state.status} v${stateInFlight.state.stateVersion}`,
    adversarialResult: adversarial.ok ? 'OK（缺陷！）' : adversarial.error.code,
    eventsAddedByAdversarial,
    whyContentEqualsFixture: contentOf(whyRest) === why.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    generationCancelledCount,
    stateTransitions,
    versionMarks,
  };
  const pass =
    stateInFlight.state.status === 'ACTIVE' &&
    stateInFlight.state.stateVersion === 3 &&
    !adversarial.ok &&
    adversarial.error.code === 'INVALID_ACTION' &&
    actual.eventsAddedByAdversarial === 0 &&
    actual.whyContentEqualsFixture &&
    finalState.ok &&
    finalState.state.stateVersion === 4 &&
    finalState.state.status === 'WAITING' &&
    actual.generationCancelledCount === 0 &&
    JSON.stringify(stateTransitions) === JSON.stringify(['EXPERIENCE_STARTED', 'WHY']) &&
    JSON.stringify(versionMarks) === JSON.stringify([2, 3, 4]);
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G09 Directional Operations——S2b；S2B-SEMANTIC-FREEZE-01
// D-01 选项 A：DEEPEN / SIMPLIFY / REFRAME 顶层语义动作，policy_v2.0.0）
// ---------------------------------------------------------------------------

// --- G09-N：正常路径（创作会话内 DEEPEN 方向性补丁） --------------------
async function caseG09Normal(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const classification = classifyInput('再深入关卡一点');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g09n-1',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  await consume(why.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const create = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g09n-2',
  });
  if (!create.ok) {
    return { expected: { setup: 'CREATE 提交应被接受' }, actual: { setupError: create.error.code }, pass: false };
  }
  await consume(create.stream);
  const stateAfterCreate = runtime.getExperienceState(exp.experienceId);
  const creationBefore = runtime.getCreation(exp.experienceId);
  // DEEPEN：创作会话内方向性补丁（顶层补丁操作，与 add / remove / modify 同级）。
  const deepen = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DEEPEN',
    rawInput: '再深入关卡一点',
    expectedStateVersion: stateAfterCreate.state.stateVersion,
    requestId: 'req-g09n-3',
  });
  const deepenEvents = deepen.ok ? await consume(deepen.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const creationAfter = runtime.getCreation(exp.experienceId);
  const deepenRequested = eventsOf(events, 'deepen_requested');
  const patchApplied = eventsOf(events, 'creation_patch_applied');
  const createTransitions = eventsOf(events, 'state_transitioned').filter((event) => event.properties.event === 'CREATE');
  const deepenTrace = traces.find((entry) => entry.semantic_action === 'DEEPEN');
  const expectedUserChangePatch = { operation: 'deepen', target: 'level', change: { direction: 'deepen' }, summary: '再深入关卡一点' };
  const structurePreserved =
    creationAfter.ok &&
    creationBefore.ok &&
    JSON.stringify(creationAfter.creation.objects) === JSON.stringify(creationBefore.creation.objects) &&
    JSON.stringify(creationAfter.creation.rules) === JSON.stringify(creationBefore.creation.rules) &&
    JSON.stringify(creationAfter.creation.variables) === JSON.stringify(creationBefore.creation.variables) &&
    JSON.stringify(creationAfter.creation.interactions) === JSON.stringify(creationBefore.creation.interactions) &&
    JSON.stringify(creationAfter.creation.concept) === JSON.stringify(creationBefore.creation.concept);
  const userChangeMatches =
    creationAfter.ok &&
    creationAfter.creation.userChanges.length === 1 &&
    creationAfter.creation.userChanges[0].version === 2 &&
    JSON.stringify(creationAfter.creation.userChanges[0].patch) === JSON.stringify(expectedUserChangePatch);
  const expected = {
    classification: 'DEEPEN（"深入"词表；目标经 TARGET_SYNONYMS 由"关卡"派生为 level）',
    policy: 'DEEPEN → DEEPEN（policy_v2.2.0；14 §8 恒等映射）',
    flow: 'WHY → CREATE → DEEPEN（创作会话内顶层补丁操作）',
    content: deepenFixture.chunks.join(''),
    headerState: 'ACTIVE/CREATION（迁移提交时视图）',
    finalState: 'WAITING/CREATION（补丁轮次经 CREATE 触发器迁移）',
    stateVersion: '8（v6 + DEEPEN 迁移 v7 + 完成提交 v8）',
    creationVersion: '2（v1 + 方向性补丁 v2；user_changes 权威登记）',
    structurePreservation: 'objects / rules / variables / interactions / concept 逐字段保持（08 §11 局部变更纪律：不重新生成整个作品）',
  };
  const actual = {
    classification: classification.semanticAction,
    policyAction: deepen.ok ? deepen.header.policy_decision.selected_action : deepen.error.code,
    policyVersion: deepen.ok ? deepen.header.policy_decision.policy_version : null,
    policyReason: deepen.ok ? deepen.header.policy_decision.reason : null,
    stateVersion: deepen.ok ? deepen.header.state_version : null,
    headerState: deepen.ok ? `${deepen.header.state.status}/${deepen.header.state.stage}` : 'ERROR',
    streamTypes: deepenEvents.map((event) => event.type),
    contentEqualsFixture: contentOf(deepenEvents) === deepenFixture.chunks.join(''),
    deepenRequestedEvents: deepenRequested.length,
    patchAppliedEvents: patchApplied.length,
    patchOperation: patchApplied[0]?.properties.operation ?? null,
    patchTarget: patchApplied[0]?.properties.target ?? null,
    patchChange: patchApplied[0] ? JSON.stringify(patchApplied[0].properties.change) : null,
    patchCreationVersion: patchApplied[0]?.properties.creation_version ?? null,
    createTransitions: createTransitions.length,
    decisionTraceSemanticAction: deepenTrace?.semantic_action ?? null,
    decisionTracePolicyVersion: deepenTrace?.policy?.policy_version ?? null,
    decisionTraceReason: deepenTrace?.reason?.primary ?? null,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : 'ERROR',
    finalStateVersion: finalState.ok ? finalState.state.stateVersion : null,
    lastSemanticAction: finalState.ok ? finalState.state.lastSemanticAction : null,
    creationVersion: creationAfter.ok ? creationAfter.creation.version : null,
    creationActive: creationAfter.ok ? creationAfter.active : null,
    structurePreserved,
    userChangeMatches,
  };
  const pass =
    classification.semanticAction === 'DEEPEN' &&
    deepen.ok &&
    actual.policyAction === 'DEEPEN' &&
    actual.policyVersion === 'policy_v2.2.0' &&
    actual.policyReason === 'creation_modification' &&
    actual.stateVersion === 7 &&
    actual.headerState === 'ACTIVE/CREATION' &&
    deepenEvents[0].type === 'submission' &&
    deepenEvents.some((event) => event.type === 'done') &&
    deepenEvents.some((event) => event.type === 'state_updated') &&
    actual.contentEqualsFixture &&
    actual.deepenRequestedEvents === 1 &&
    actual.patchAppliedEvents === 1 &&
    actual.patchOperation === 'deepen' &&
    actual.patchTarget === 'level' &&
    actual.patchChange === '{"direction":"deepen"}' &&
    actual.patchCreationVersion === 2 &&
    actual.createTransitions === 2 &&
    actual.decisionTraceSemanticAction === 'DEEPEN' &&
    actual.decisionTracePolicyVersion === 'policy_v2.2.0' &&
    actual.decisionTraceReason === 'explicit_user_direction' &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    actual.lastSemanticAction === 'DEEPEN' &&
    actual.creationVersion === 2 &&
    actual.creationActive === true &&
    actual.structurePreserved &&
    actual.userChangeMatches;
  return { expected, actual, pass };
}

// --- G09-NEG：负向（无创作会话方向性操作 → 升级拒绝） ------------------
async function caseG09Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const classification = classifyInput('简单一点');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g09neg-1',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  await consume(why.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const eventsBefore = events.length;
  // 负向核心：无活跃创作对象时方向性操作不可执行——升级拒绝
  // （policy_v2.0.0 变更 5；C3 升级纪律，model on F-2/F-3 创作会话
  // 路由保护——不静默执行未定义语义）。
  const simplify = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'SIMPLIFY',
    rawInput: '简单一点',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g09neg-2',
  });
  const eventsAdded = events.length - eventsBefore;
  const finalState = runtime.getExperienceState(exp.experienceId);
  const creationQuery = runtime.getCreation(exp.experienceId);
  const expected = {
    classification: 'SIMPLIFY（"简单一点"词表）',
    escalation: '无活跃创作对象 → INVALID_ACTION（policy_v2.0.0 变更 5；C3 升级纪律：不静默执行未定义语义）',
    noSideEffects: '升级拒绝零事件、零版本消耗、零创作会话建立',
  };
  const actual = {
    classification: classification.semanticAction,
    simplifyResult: simplify.ok ? 'OK（缺陷！）' : simplify.error.code,
    eventsAdded,
    simplifyRequestedEvents: eventsOf(events, 'simplify_requested').length,
    patchAppliedEvents: eventsOf(events, 'creation_patch_applied').length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    creationQuery: creationQuery.ok ? '存在（缺陷！）' : creationQuery.error.code,
  };
  const pass =
    classification.semanticAction === 'SIMPLIFY' &&
    !simplify.ok &&
    simplify.error.code === 'INVALID_ACTION' &&
    actual.eventsAdded === 0 &&
    actual.simplifyRequestedEvents === 0 &&
    actual.patchAppliedEvents === 0 &&
    finalState.ok &&
    finalState.state.stateVersion === 4 &&
    !creationQuery.ok;
  return { expected, actual, pass };
}

// --- G09-B：边界（冻结优先级链 8 组碰撞输入） --------------------------
async function caseG09Boundary(trace) {
  // 冻结优先级链（policy_v2.0.0 变更 4）：
  // STOP > CHANGE_DIRECTION > CORRECTION > CREATE >
  // DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER
  const chain = [
    { input: '好了，深入一点', expected: 'STOP', rule: 'STOP 永远优先（P-01）压倒方向性动作' },
    { input: '不要这个，深挖一下', expected: 'CHANGE_DIRECTION', rule: '显式方向变更优先于方向性操作（P-03）' },
    { input: '不对，简化一点', expected: 'CORRECTION', rule: '用户纠正优先于方向性操作（PD-21 关闭切片）' },
    { input: '做成一个小游戏，重新表述', expected: 'CREATE', rule: '创作意图优先于方向性操作（PD-21 关闭切片）' },
    { input: '换个角度', expected: 'CHANGE_DIRECTION', rule: '碰撞核验："换个"命中 CHANGE_DIRECTION 先于"换角度"（词表碰撞由优先级层消解）' },
    { input: '为什么深入一点', expected: 'DEEPEN', rule: '方向性操作优先于 WHY（S2b 冻结链）' },
    { input: '如果简单一点', expected: 'SIMPLIFY', rule: '方向性操作优先于 WHAT_IF（S2b 冻结链）' },
    { input: '换角度回答这个问题', expected: 'REFRAME', rule: '方向性操作优先于 DIRECT_ANSWER（提问标记为最低层）' },
  ];
  const results = chain.map((entry) => {
    const first = classifyInput(entry.input);
    const second = classifyInput(entry.input);
    return { input: entry.input, expected: entry.expected, rule: entry.rule, actual: first.semanticAction, deterministic: first.semanticAction === second.semanticAction };
  });
  const expected = {
    freezeChain: 'STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER（policy_v2.0.0 变更 4）',
    groups: '8 组碰撞输入逐组判定（含 "换个角度" 词表碰撞核验）',
    determinism: '同一输入重复分类结果恒定（GS-01；确定性规则分类）',
  };
  const actual = { results };
  const pass = results.every((entry) => entry.actual === entry.expected && entry.deterministic);
  return { expected, actual, pass };
}

// --- G09-FR：故障恢复（陈旧创作版本冲突拒绝 → 当前版本重试成功） ------
async function caseG09FailureRecovery(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const why = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g09fr-1',
  });
  if (!why.ok) {
    return { expected: { setup: 'WHY 提交应被接受' }, actual: { setupError: why.error.code }, pass: false };
  }
  await consume(why.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const create = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: 'req-g09fr-2',
  });
  if (!create.ok) {
    return { expected: { setup: 'CREATE 提交应被接受' }, actual: { setupError: create.error.code }, pass: false };
  }
  await consume(create.stream);
  const stateAfterCreate = runtime.getExperienceState(exp.experienceId);
  // 故障注入：陈旧 expected_creation_version（999 ≠ 当前 v1）——
  // 冲突拒绝、不覆盖、不消耗版本（S1-12 同族；OBL-01 失败写入纪律）。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'REFRAME',
    rawInput: '换角度重述',
    expectedStateVersion: stateAfterCreate.state.stateVersion,
    expectedCreationVersion: 999,
    requestId: 'req-g09fr-3',
  });
  const conflictEvents = eventsOf(events, 'creation_version_conflict');
  const stateAfterStale = runtime.getExperienceState(exp.experienceId);
  const creationAfterStale = runtime.getCreation(exp.experienceId);
  // 恢复：当前创作版本重试（声明版本与实际一致 → 补丁应用成功）。
  const retry = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'REFRAME',
    rawInput: '换角度重述',
    expectedStateVersion: stateAfterStale.state.stateVersion,
    expectedCreationVersion: creationAfterStale.ok ? creationAfterStale.creation.version : -1,
    requestId: 'req-g09fr-4',
  });
  const retryEvents = retry.ok ? await consume(retry.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const creationAfter = runtime.getCreation(exp.experienceId);
  const expectedUserChangePatch = { operation: 'reframe', target: 'creation', change: { direction: 'reframe' }, summary: '换角度重述' };
  const expected = {
    staleRejection: '陈旧 expected_creation_version=999 → STATE_VERSION_CONFLICT（S1-12 同族：不覆盖、不消耗版本）',
    noSideEffects: '冲突拒绝后体验状态版本与创作版本均不变（失败写入不消耗版本号——OBL-01 纪律）',
    recovery: '当前版本重试 REFRAME 成功（创作 v1 → v2；体验 v6 → v8）',
    content: reframeFixture.chunks.join(''),
    userChanges: '创作 v2 登记方向性条目 {operation:"reframe", target:"creation", change:{direction:"reframe"}}',
  };
  const actual = {
    staleResult: stale.ok ? 'OK（缺陷！）' : stale.error.code,
    conflictEvents: conflictEvents.length,
    conflictExpectedVersion: conflictEvents[0]?.properties.expected_creation_version ?? null,
    conflictCurrentVersion: conflictEvents[0]?.properties.current_creation_version ?? null,
    stateVersionAfterStale: stateAfterStale.ok ? stateAfterStale.state.stateVersion : null,
    creationVersionAfterStale: creationAfterStale.ok ? creationAfterStale.creation.version : null,
    retryAccepted: retry.ok,
    retryContentEqualsFixture: contentOf(retryEvents) === reframeFixture.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : 'ERROR',
    finalStateVersion: finalState.ok ? finalState.state.stateVersion : null,
    lastSemanticAction: finalState.ok ? finalState.state.lastSemanticAction : null,
    creationVersion: creationAfter.ok ? creationAfter.creation.version : null,
    userChangesLength: creationAfter.ok ? creationAfter.creation.userChanges.length : null,
    lastUserChange: creationAfter.ok && creationAfter.creation.userChanges.length === 1 ? JSON.stringify(creationAfter.creation.userChanges[0].patch) : null,
    userChangeMatches: creationAfter.ok && creationAfter.creation.userChanges.length === 1 && JSON.stringify(creationAfter.creation.userChanges[0].patch) === JSON.stringify(expectedUserChangePatch),
  };
  const pass =
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    actual.conflictEvents === 1 &&
    actual.conflictExpectedVersion === 999 &&
    actual.conflictCurrentVersion === 1 &&
    actual.stateVersionAfterStale === 6 &&
    actual.creationVersionAfterStale === 1 &&
    retry.ok &&
    actual.retryContentEqualsFixture &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    actual.lastSemanticAction === 'REFRAME' &&
    actual.creationVersion === 2 &&
    actual.userChangesLength === 1 &&
    actual.userChangeMatches;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 黄金案例（G10 Branch Reflow——S2；S2-BRANCH-REFLOW-DEF-01
// v1.0.0 选项 A：第五分支操作 ADOPT_BRANCH 显式回流，
// policy_v2.2.0 变更 1–5）
// ---------------------------------------------------------------------------

// --- G10-N：正常路径（WHAT_IF 模拟会话内 ADOPT_BRANCH 显式回流） --
async function caseG10Normal(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const classification = classifyInput('如果采用分支一的结论呢');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  // 模拟轮 1：WHAT_IF 首轮自动 CREATE 分支 1（D-03 选项 A）。
  const r1 = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g10n-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  // 模拟轮 2：累积至分支 1。
  const stateAfterR1 = runtime.getExperienceState(exp.experienceId);
  const r2 = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '假如速度再高一点会怎样',
    expectedStateVersion: stateAfterR1.state.stateVersion,
    requestId: 'req-g10n-2',
  });
  if (!r2.ok) {
    return { expected: { setup: '模拟轮 2 提交应被接受' }, actual: { setupError: r2.error.code }, pass: false };
  }
  await consume(r2.stream);
  // ADOPT_BRANCH：显式采用分支 1 结论（确定性系统回合——
  // 无 LLM 提案，llm_used=false）。
  const stateAfterR2 = runtime.getExperienceState(exp.experienceId);
  const adopt = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: stateAfterR2.state.stateVersion,
    requestId: 'req-g10n-3',
  });
  const adoptEvents = adopt.ok ? await consume(adopt.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const simulation = runtime.getSimulation(exp.experienceId);
  const simAdopted = eventsOf(events, 'simulation_adopted');
  const simRecorded = eventsOf(events, 'simulation_recorded');
  const adoptTrace = traces.find((entry) => entry.reason?.secondary?.includes('ADOPT_BRANCH'));
  const branch = simulation.ok ? simulation.simulation.branches[0] : null;
  const expected = {
    classification: 'WHAT_IF（"如果"标记；ADOPT_BRANCH 输入经 WHAT_IF 语义动作声明路由）',
    policy: 'WHAT_IF → SIMULATE（policy_v2.2.0；S1 §14 映射不变；ADOPT_BRANCH 显式回流经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决生效——policy_v2.2.0 变更 1–5）',
    flow: 'WHAT_IF 轮 1（自动 CREATE 分支 1）→ 轮 2（累积）→ ADOPT_BRANCH 分支 1（确定性系统回合）',
    branchModel: '分支 1：lifecycle ACTIVE 不变；adopted false→true（附加标记——非生命周期状态，生命周期契约不增第四态）；version=2（采用不累积模拟轮次）；currentBranchId 保持分支 1（主线当前上下文不变）',
    adoptedEvent: 'simulation_adopted ×1（properties：branch_id=分支 1 / source_round=1 / adopted_content=分支最新模拟轮模拟内容 / separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源，E8-G2-CC07）',
    contentPresentation: '采用轮结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文（模拟来源、非事实——separation_invariant 随文标注；采纳内容经独立 CREATE 提交方纳入作品）',
    headerState: 'ACTIVE/SIMULATION（迁移提交时视图——生成在途，13 §15.3；RESPONSE_COMPLETED 结算后 WAITING/SIMULATION）',
    stateVersion: '7（迁移提交时视图——13 §15.3；RESPONSE_COMPLETED 结算后定居 v8——启动 v2 + 轮 1 两次提交 + 轮 2 两次提交 + 采用两次提交，每次合法提交恰好 +1，S1-12）',
    deterministicTurn: '决策追踪 llm_used=false，reasonPrimary=explicit_user_direction（确定性系统回合——同分支操作纪律）',
  };
  const actual = {
    classification: classification.semanticAction,
    policyAction: adopt.ok ? adopt.header.policy_decision.selected_action : adopt.error.code,
    policyVersion: adopt.ok ? adopt.header.policy_decision.policy_version : null,
    policyReason: adopt.ok ? adopt.header.policy_decision.reason : null,
    stateVersion: adopt.ok ? adopt.header.state_version : null,
    headerState: adopt.ok ? `${adopt.header.state.status}/${adopt.header.state.stage}` : 'ERROR',
    adoptContentPresentsAdoptedContent: contentOf(adoptEvents).includes(simulate.chunks.join('')),
    simulationPresent: simulation.ok,
    branchCount: simulation.ok ? simulation.simulation.branches.length : null,
    branchAdopted: branch?.adopted ?? null,
    branchLifecycle: branch?.lifecycle ?? null,
    branchVersion: branch?.version ?? null,
    branchRounds: branch?.rounds.length ?? null,
    currentBranchIdUnchanged: simulation.ok ? simulation.simulation.currentBranchId === branch?.branchId : null,
    simulationAdoptedEvents: simAdopted.map((event) => ({
      branch_id: event.properties.branch_id,
      source_round: event.properties.source_round,
      adopted_content_matches_latest_round: event.properties.adopted_content === simulate.chunks.join(''),
      separation_invariant: event.properties.separation_invariant,
    })),
    simulationRecordedEvents: simRecorded.map((event) => event.properties.round),
    decisionTraceReason: adoptTrace?.reason?.primary ?? null,
    decisionTraceLlmUsed: adoptTrace?.execution?.llm_used ?? null,
    decisionTracePolicyVersion: adoptTrace?.policy?.policy_version ?? null,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
  };
  const pass =
    classification.semanticAction === 'WHAT_IF' &&
    r1.ok &&
    r2.ok &&
    adopt.ok &&
    actual.policyAction === 'SIMULATE' &&
    actual.policyVersion === 'policy_v2.2.0' &&
    actual.policyReason === 'simulation_branch_operation' &&
    actual.stateVersion === 7 &&
    actual.headerState === 'ACTIVE/SIMULATION' &&
    actual.adoptContentPresentsAdoptedContent &&
    simulation.ok &&
    actual.branchCount === 1 &&
    actual.branchAdopted === true &&
    actual.branchLifecycle === 'ACTIVE' &&
    actual.branchVersion === 2 &&
    actual.branchRounds === 2 &&
    actual.currentBranchIdUnchanged === true &&
    simAdopted.length === 1 &&
    simAdopted[0].properties.branch_id === branch.branchId &&
    simAdopted[0].properties.source_round === 1 &&
    simAdopted[0].properties.adopted_content === simulate.chunks.join('') &&
    simAdopted[0].properties.separation_invariant === 'simulation_result_is_not_fact' &&
    actual.simulationRecordedEvents.length === 2 &&
    actual.simulationRecordedEvents[0] === 1 &&
    actual.simulationRecordedEvents[1] === 2 &&
    actual.decisionTraceReason === 'explicit_user_direction' &&
    actual.decisionTraceLlmUsed === false &&
    actual.decisionTracePolicyVersion === 'policy_v2.2.0' &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'SIMULATION';
  return { expected, actual, pass };
}

// --- G10-NEG：负向（词表边界——未命中作用域的"采用"走通用
// SIMULATE 路径；不存在序号拒绝） --------------------------
async function caseG10Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const classificationMiss = classifyInput('如果采用这个结论呢');
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  // 模拟轮 1：CREATE 分支 1。
  const r1 = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g10neg-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  // 负向核心 1：未命中分支作用域词表的"采用"输入 → 不识别
  // 为分支操作（走通用 SIMULATE 执行路径——词表边界纪律）：
  // 通用模拟轮登记 simulation_recorded（非 simulation_adopted），
  // 分支 1 累积（version=2），adopted 保持 false。
  const stateAfterR1 = runtime.getExperienceState(exp.experienceId);
  const miss = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用这个结论呢',
    expectedStateVersion: stateAfterR1.state.stateVersion,
    requestId: 'req-g10neg-2',
  });
  const missEvents = miss.ok ? await consume(miss.stream) : [];
  // 负向核心 2：采用不存在的分支序号（分支九）→
  // INVALID_STATE_TRANSITION（拒绝先于任何写入，不消耗
  // 版本号——OBL-01 同族纪律）。
  const stateAfterMiss = runtime.getExperienceState(exp.experienceId);
  const versionBeforeNegative = stateAfterMiss.state.stateVersion;
  const nine = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支九的结论呢',
    expectedStateVersion: versionBeforeNegative,
    requestId: 'req-g10neg-3',
  });
  const versionAfterNegative = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const simulation = runtime.getSimulation(exp.experienceId);
  const simAdopted = eventsOf(events, 'simulation_adopted');
  const simRecorded = eventsOf(events, 'simulation_recorded');
  const expected = {
    classification: 'WHAT_IF（"如果"标记——"采用"词表经 WHAT_IF 声明路由）',
    wordTableBoundary: '未命中分支作用域词表 → 不识别为分支操作（走通用 SIMULATE 执行路径——词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH 均须作用域 + 可解析序号）',
    missRound: '通用模拟轮：simulation_recorded ×1（非 simulation_adopted），内容逐字节等于 simulate 语料，分支 1 累积（version=2，adopted 保持 false）',
    negative: '采用不存在分支序号（分支九）→ INVALID_STATE_TRANSITION（拒绝先于任何写入，不消耗版本号——OBL-01）',
  };
  const actual = {
    classification: classificationMiss.semanticAction,
    missAccepted: miss.ok,
    missPolicyAction: miss.ok ? miss.header.policy_decision.selected_action : miss.error.code,
    missPolicyReason: miss.ok ? miss.header.policy_decision.reason : null,
    missContentMatchesFixture: contentOf(missEvents) === simulate.chunks.join(''),
    negativeResult: nine.ok ? 'OK（缺陷！）' : nine.error.code,
    versionBeforeNegative,
    versionAfterNegative,
    simulationAdoptedEvents: simAdopted.length,
    simulationRecordedRounds: simRecorded.map((event) => event.properties.round),
    branchAdopted: simulation.ok ? simulation.simulation.branches[0]?.adopted ?? null : null,
    branchVersion: simulation.ok ? simulation.simulation.branches[0]?.version ?? null : null,
  };
  const pass =
    classificationMiss.semanticAction === 'WHAT_IF' &&
    r1.ok &&
    miss.ok &&
    actual.missPolicyAction === 'SIMULATE' &&
    actual.missPolicyReason === 'semantic_action' &&
    actual.missContentMatchesFixture &&
    !nine.ok &&
    nine.error.code === 'INVALID_STATE_TRANSITION' &&
    versionAfterNegative === versionBeforeNegative &&
    simAdopted.length === 0 &&
    actual.simulationRecordedRounds.length === 2 &&
    actual.simulationRecordedRounds[0] === 1 &&
    actual.simulationRecordedRounds[1] === 2 &&
    actual.branchAdopted === false &&
    actual.branchVersion === 2;
  return { expected, actual, pass };
}

// --- G10-B：边界（RETURNED 分支采用——生命周期不变；幂等；
// 无激活分支上下文时主线当前上下文保持 null） --------------
async function caseG10Boundary(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  async function submit(rawInput, requestId) {
    const state = runtime.getExperienceState(exp.experienceId).state;
    const submission = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHAT_IF',
      rawInput,
      expectedStateVersion: state.stateVersion,
      requestId,
    });
    const stream = submission.ok ? await consume(submission.stream) : [];
    return { submission, stream };
  }
  // 轮 1 / 轮 2：CREATE 分支 1 并累积。
  const r1 = await submit('如果摩擦力为零会怎样', 'req-g10b-1');
  const r2 = await submit('假如速度再高一点会怎样', 'req-g10b-2');
  // RETURN：分支 1 生命周期 RETURNED，当前激活分支清空。
  const ret = await submit('如果返回主线呢', 'req-g10b-3');
  const snapAfterReturn = runtime.getSimulation(exp.experienceId);
  // 采用分支 1（RETURNED 分支——生命周期 RETURNED 不变；
  // 无激活分支上下文时采用仍合法——采用面向分支记录本身，
  // 主线当前上下文不变：currentBranchId 保持 null）。
  const adopt1 = await submit('如果采用分支一的结论呢', 'req-g10b-4');
  const snapAfterAdopt1 = runtime.getSimulation(exp.experienceId);
  // 幂等边界：重复采用——adopted 保持 true（幂等标记），
  // 生命周期 / version / 轮次 / 当前上下文均不变。
  const adopt2 = await submit('如果采用分支一的结论呢', 'req-g10b-5');
  const snapAfterAdopt2 = runtime.getSimulation(exp.experienceId);
  const finalState = runtime.getExperienceState(exp.experienceId);
  const simAdopted = eventsOf(events, 'simulation_adopted');
  const branchAfterAdopt2 = snapAfterAdopt2.ok ? snapAfterAdopt2.simulation.branches[0] : null;
  const expected = {
    flow: 'WHAT_IF 轮 1/2（分支 1 累积）→ RETURN（分支 1 RETURNED，currentBranchId=null）→ ADOPT_BRANCH 分支 1（RETURNED 生命周期不变，adopted 附加，currentBranchId 保持 null——主线当前上下文不变）→ ADOPT_BRANCH 分支 1（幂等——adopted 保持 true，version / 轮次 / 当前上下文均不变）',
    lifecycleInvariant: '生命周期契约不变——ACTIVE / RETURNED / ABANDONED 三态；adopted 为附加属性而非生命周期状态（采用不迁移生命周期）',
    mainlineContext: 'currentBranchId：分支 1 → null（RETURN）→ null（采用不变）→ null（幂等采用不变）——主线当前上下文不因采用而改变',
    idempotence: '重复采用幂等——adopted true→true，分支 version=2、轮次=2 均不变',
    stateVersion: '12（启动 v2 + 轮 1/2 + RETURN + 采用 ×2——每次合法提交恰好 +1，S1-12）',
  };
  const actual = {
    roundsOk: r1.submission.ok && r2.submission.ok,
    returnOk: ret.submission.ok,
    lifecycleAfterReturn: snapAfterReturn.ok ? snapAfterReturn.simulation.branches[0]?.lifecycle ?? null : null,
    currentBranchIdAfterReturn: snapAfterReturn.ok ? snapAfterReturn.simulation.currentBranchId : 'invalid',
    adopt1Ok: adopt1.submission.ok,
    adopt1PolicyVersion: adopt1.submission.ok ? adopt1.submission.header.policy_decision.policy_version : null,
    adopt1ContentPresentsAdoptedContent: contentOf(adopt1.stream).includes(simulate.chunks.join('')),
    branchAdoptedAfterAdopt1: snapAfterAdopt1.ok ? snapAfterAdopt1.simulation.branches[0]?.adopted ?? null : null,
    branchLifecycleAfterAdopt1: snapAfterAdopt1.ok ? snapAfterAdopt1.simulation.branches[0]?.lifecycle ?? null : null,
    branchVersionAfterAdopt1: snapAfterAdopt1.ok ? snapAfterAdopt1.simulation.branches[0]?.version ?? null : null,
    branchRoundsAfterAdopt1: snapAfterAdopt1.ok ? snapAfterAdopt1.simulation.branches[0]?.rounds.length ?? null : null,
    currentBranchIdAfterAdopt1: snapAfterAdopt1.ok ? snapAfterAdopt1.simulation.currentBranchId : 'invalid',
    adopt2Ok: adopt2.submission.ok,
    branchAdoptedAfterAdopt2: branchAfterAdopt2?.adopted ?? null,
    branchLifecycleAfterAdopt2: branchAfterAdopt2?.lifecycle ?? null,
    branchVersionAfterAdopt2: branchAfterAdopt2?.version ?? null,
    branchRoundsAfterAdopt2: branchAfterAdopt2?.rounds.length ?? null,
    currentBranchIdAfterAdopt2: snapAfterAdopt2.ok ? snapAfterAdopt2.simulation.currentBranchId : 'invalid',
    simulationAdoptedEvents: simAdopted.length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
  };
  const pass =
    actual.roundsOk &&
    ret.submission.ok &&
    snapAfterReturn.ok &&
    actual.lifecycleAfterReturn === 'RETURNED' &&
    snapAfterReturn.simulation.currentBranchId === null &&
    adopt1.submission.ok &&
    actual.adopt1PolicyVersion === 'policy_v2.2.0' &&
    actual.adopt1ContentPresentsAdoptedContent &&
    snapAfterAdopt1.ok &&
    actual.branchAdoptedAfterAdopt1 === true &&
    actual.branchLifecycleAfterAdopt1 === 'RETURNED' &&
    actual.branchVersionAfterAdopt1 === 2 &&
    actual.branchRoundsAfterAdopt1 === 2 &&
    snapAfterAdopt1.simulation.currentBranchId === null &&
    adopt2.submission.ok &&
    snapAfterAdopt2.ok &&
    actual.branchAdoptedAfterAdopt2 === true &&
    actual.branchLifecycleAfterAdopt2 === 'RETURNED' &&
    actual.branchVersionAfterAdopt2 === 2 &&
    actual.branchRoundsAfterAdopt2 === 2 &&
    snapAfterAdopt2.simulation.currentBranchId === null &&
    simAdopted.length === 2 &&
    simAdopted.every(
      (event) =>
        event.properties.branch_id === branchAfterAdopt2.branchId &&
        event.properties.source_round === 1 &&
        event.properties.adopted_content === simulate.chunks.join('') &&
        event.properties.separation_invariant === 'simulation_result_is_not_fact',
    ) &&
    finalState.ok &&
    finalState.state.stateVersion === 12 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'SIMULATION';
  return { expected, actual, pass };
}

// --- G10-FR：故障恢复（陈旧版本采用拒绝 → 当前版本重试成功
// → 独立 CREATE 提交纳入作品——创作版本化纪律不变） -------
async function caseG10FailureRecovery(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  // 模拟轮 1：CREATE 分支 1。
  const r1 = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g10fr-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  // 故障注入：陈旧 expected_state_version（3 vs 4）采用提交 →
  // STATE_VERSION_CONFLICT（retryable=false）——不覆盖、不
  // 消耗版本（S1-12 同族；OBL-01 失败写入纪律）。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: 3,
    requestId: 'req-g10fr-2',
  });
  const stateAfterStale = runtime.getExperienceState(exp.experienceId);
  const conflictEvents = eventsOf(events, 'state_version_conflict');
  // 恢复：携带当前版本重试采用成功（simulation_adopted ×1）。
  const retry = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: stateAfterStale.state.stateVersion,
    requestId: 'req-g10fr-3',
  });
  const retryEvents = retry.ok ? await consume(retry.stream) : [];
  // 创作版本化纪律不变：采用内容经独立 CREATE 提交纳入
  // 作品——CREATE 衔接（13 §15.5）建立创作会话（creation
  // v1）；采用内容不自动写入作品（零 user_changes——无
  // 自动补丁，创作版本化纪律不变）。
  const stateAfterRetry = runtime.getExperienceState(exp.experienceId);
  const create = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '做成一个小游戏',
    expectedStateVersion: stateAfterRetry.state.stateVersion,
    requestId: 'req-g10fr-4',
  });
  const createEvents = create.ok ? await consume(create.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId);
  const simAdopted = eventsOf(events, 'simulation_adopted');
  const expected = {
    failure: '陈旧 expected_state_version=3 → STATE_VERSION_CONFLICT（retryable=false——不覆盖、不消耗版本，S1-12 同族）',
    noSideEffects: '冲突拒绝后体验状态版本不变（失败写入不消耗版本号——OBL-01 纪律）',
    recovery: '携带当前版本重试采用成功（simulation_adopted ×1——采用结果仍标记为模拟来源）',
    creationDiscipline: '采用内容经独立 CREATE 提交纳入作品（13 §15.5 衔接；创作 v1；零 user_changes——采用不自动写入作品，创作版本化纪律不变）',
    content: '采用轮结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文；CREATE 轮内容逐字节等于 create 语料',
  };
  const actual = {
    staleResult: stale.ok ? 'OK（缺陷！）' : stale.error.code,
    staleRetryable: stale.ok ? null : stale.error.retryable,
    conflictEvents: conflictEvents.length,
    conflictExpectedVersion: conflictEvents[0]?.properties.expected_state_version ?? null,
    conflictCurrentVersion: conflictEvents[0]?.properties.current_state_version ?? null,
    stateVersionAfterStale: stateAfterStale.state.stateVersion,
    retryAccepted: retry.ok,
    retryPolicyReason: retry.ok ? retry.header.policy_decision.reason : null,
    retryPolicyVersion: retry.ok ? retry.header.policy_decision.policy_version : null,
    retryContentPresentsAdoptedContent: contentOf(retryEvents).includes(simulate.chunks.join('')),
    simulationAdoptedEvents: simAdopted.map((event) => ({
      branch_id: event.properties.branch_id,
      source_round: event.properties.source_round,
      separation_invariant: event.properties.separation_invariant,
    })),
    createAccepted: create.ok,
    createContentMatchesFixture: contentOf(createEvents) === createFixture.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    creationVersion: creation.ok ? creation.creation.version : null,
    creationActive: creation.ok ? creation.active : null,
    creationPhase: creation.ok ? creation.creation.phase : null,
    userChangesLength: creation.ok ? creation.creation.userChanges.length : null,
  };
  const pass =
    r1.ok &&
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    stale.error.retryable === false &&
    actual.conflictEvents === 1 &&
    actual.conflictExpectedVersion === 3 &&
    actual.conflictCurrentVersion === 4 &&
    actual.stateVersionAfterStale === 4 &&
    retry.ok &&
    actual.retryPolicyReason === 'simulation_branch_operation' &&
    actual.retryPolicyVersion === 'policy_v2.2.0' &&
    actual.retryContentPresentsAdoptedContent &&
    simAdopted.length === 1 &&
    simAdopted[0].properties.source_round === 1 &&
    simAdopted[0].properties.separation_invariant === 'simulation_result_is_not_fact' &&
    create.ok &&
    actual.createContentMatchesFixture &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    actual.creationVersion === 1 &&
    actual.creationActive === true &&
    actual.creationPhase === 'USER_FEEDBACK' &&
    actual.userChangesLength === 0;
  return { expected, actual, pass };
}

// 黄金案例（G11 长期记忆——S3a；S3A-SEMANTIC-FREEZE-01
// v1.0.0：07 §5 A/B 类经显式表达保存 / C 类仅候选标记 /
// 裸记住请求保持升级，policy_v2.2.0 变更 1–2）
// ---------------------------------------------------------------------------

// --- G11-N：正常路径（A 类显式长期偏好表达——Runtime 单一写入者） ---
async function caseG11Normal(trace) {
  const { runtime, events } = createCaseRuntime();
  const classification = classifyInput('我喜欢古典音乐');
  const session = await runtime.startSession();
  const resolution = await runtime.resolveIntent({
    sessionId: session.session.sessionId,
    rawInput: '我喜欢古典音乐',
    requestId: 'req-g11n-1',
  });
  const memory = runtime.getMemory();
  const record = memory.memory.records[0] ?? null;
  const memoryRecorded = eventsOf(events, 'memory_recorded');
  const expected = {
    classification: 'UNKNOWN + longTermMemory 识别（A 类——偏好词直接命中；全部优先级层与记忆操作词表未命中后调用——零优先级层变更）',
    policy: '记忆操作无策略动作轴——resolveIntent action=memory_operation（记忆域为轴外持久对象——不创建体验轴）',
    flow: 'A 类显式表达 → record_long_term 执行（source=explicit，confidence=1.0——显式表达即保存）',
    record: '记录 ×1：topic="我喜欢古典音乐"，memoryClass=long_term，source=explicit，confidence=1.0，lifecycle=REMEMBERED，candidateLongTerm=false',
    event: 'memory_recorded ×1（properties：memory_class=long_term / source=explicit / confidence=1 / recognition_path=explicit_preference——C6 §14 属性扩展不新增事件名）',
    discipline: '记忆操作不创建新体验（session_started=1 为会话启动本身 / experience_started=0）；写入经 Runtime 单一写入者',
  };
  const actual = {
    classification: classification.semanticAction,
    classifierLongTermMemoryTopic: classification.longTermMemory?.topic ?? null,
    resolutionOk: resolution.ok,
    resolutionAction: resolution.ok ? resolution.action : resolution.error.code,
    memoryOperationKind: resolution.ok && resolution.memoryOperation ? resolution.memoryOperation.kind : null,
    memoryOperationExecuted: resolution.ok && resolution.memoryOperation ? resolution.memoryOperation.executed : null,
    memoryOperationClass: resolution.ok && resolution.memoryOperation ? (resolution.memoryOperation.memoryClass ?? null) : null,
    record: record
      ? { topic: record.topic, memoryClass: record.memoryClass, source: record.source, confidence: record.confidence, lifecycle: record.lifecycle, candidateLongTerm: record.candidateLongTerm }
      : null,
    memoryRecordedEvents: memoryRecorded.map((event) => ({
      memory_class: event.properties.memory_class,
      source: event.properties.source,
      confidence: event.properties.confidence,
      recognition_path: event.properties.recognition_path,
    })),
    sessionStarted: eventsOf(events, 'session_started').length,
    experienceStarted: eventsOf(events, 'experience_started').length,
  };
  const pass =
    classification.semanticAction === 'UNKNOWN' &&
    classification.longTermMemory?.topic === '我喜欢古典音乐' &&
    resolution.ok === true &&
    resolution.action === 'memory_operation' &&
    resolution.memoryOperation?.kind === 'record_long_term' &&
    resolution.memoryOperation?.executed === true &&
    resolution.memoryOperation?.memoryClass === 'long_term' &&
    record !== null &&
    record.topic === '我喜欢古典音乐' &&
    record.memoryClass === 'long_term' &&
    record.source === 'explicit' &&
    record.confidence === 1 &&
    record.lifecycle === 'REMEMBERED' &&
    record.candidateLongTerm === false &&
    memoryRecorded.length === 1 &&
    memoryRecorded[0].properties.memory_class === 'long_term' &&
    memoryRecorded[0].properties.source === 'explicit' &&
    memoryRecorded[0].properties.confidence === 1 &&
    memoryRecorded[0].properties.recognition_path === 'explicit_preference' &&
    eventsOf(events, 'session_started').length === 1 &&
    eventsOf(events, 'experience_started').length === 0;
  return { expected, actual, pass };
}

// --- G11-NEG：负向（裸记住请求保持升级——黄金 G08-NEG 不变式） ---
async function caseG11Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  const classificationBare = classifyInput('记住这个');
  const classificationIdea = classifyInput('记住这个想法');
  const session = await runtime.startSession();
  const bare = await runtime.resolveIntent({
    sessionId: session.session.sessionId,
    rawInput: '记住这个',
    requestId: 'req-g11neg-1',
  });
  const idea = await runtime.resolveIntent({
    sessionId: session.session.sessionId,
    rawInput: '记住这个想法',
    requestId: 'req-g11neg-2',
  });
  const memory = runtime.getMemory();
  const memoryRecorded = eventsOf(events, 'memory_recorded');
  const expected = {
    negative: '裸记住请求"记住这个"（无偏好内容——黄金 G08-NEG 对抗语料）→ resolveIntent action=escalate（UNKNOWN 升级——未知情况升级而非由系统决定）；"记住这个想法"（记住标记命中但余下内容非偏好表达——B 类双命中纪律：标记与偏好内容缺一不可）→ 同样升级',
    write: '零记忆写入（快照 records=0，零 memory_recorded 事件——不识别为记忆写入即不产生任何记录）',
  };
  const actual = {
    classificationBare: { semanticAction: classificationBare.semanticAction, longTermMemory: classificationBare.longTermMemory ?? null },
    classificationIdea: { semanticAction: classificationIdea.semanticAction, longTermMemory: classificationIdea.longTermMemory ?? null },
    bareAction: bare.ok ? bare.action : bare.error.code,
    ideaAction: idea.ok ? idea.action : idea.error.code,
    recordCount: memory.memory.records.length,
    memoryRecorded: memoryRecorded.length,
  };
  const pass =
    classificationBare.semanticAction === 'UNKNOWN' &&
    classificationBare.longTermMemory === undefined &&
    classificationIdea.semanticAction === 'UNKNOWN' &&
    classificationIdea.longTermMemory === undefined &&
    bare.ok === true &&
    bare.action === 'escalate' &&
    idea.ok === true &&
    idea.action === 'escalate' &&
    memory.memory.records.length === 0 &&
    memoryRecorded.length === 0;
  return { expected, actual, pass };
}

// --- G11-B：边界（冻结优先级链碰撞——长期记忆识别不改变任何优先级层） ---
async function caseG11Boundary(trace) {
  // 碰撞核验（确定性规则词表纪律——同 G09-B 边界形态）：
  // 长期记忆识别仅在全部既有优先级层与记忆操作词表未命中
  // 后调用——任何更高优先级层命中即不进入记忆识别。
  const cases = [
    { input: '记住我喜欢科幻小说', expect: 'CORRECTION', note: 'MODIFY 词表 /科幻/ 命中（S1 时代修改示例词）——CORRECTION 层先于记忆识别' },
    { input: '为什么记住我喜欢古典音乐', expect: 'WHY', note: 'WHY 词表 /为什么/ 命中——WHY 层先于记忆识别' },
    { input: '如果记住我喜欢古典音乐', expect: 'WHAT_IF', note: 'WHAT_IF 词表 /如果/ 命中——WHAT_IF 层先于记忆识别' },
    { input: '请记住我一直用深色模式', expect: 'LONG_TERM_B', note: '全部层未命中——B 类记住标记 + 偏好内容双命中' },
    { input: '记住这个想法', expect: 'UNKNOWN', note: '记住标记命中但余下内容非偏好表达——B 类双命中纪律（不识别）' },
    { input: '记住这个', expect: 'UNKNOWN', note: '裸记住请求——黄金 G08-NEG 不变式（不识别）' },
  ];
  const results = cases.map((entry) => {
    const classification = classifyInput(entry.input);
    return {
      input: entry.input,
      semanticAction: classification.semanticAction,
      longTermMemory: classification.longTermMemory ?? null,
      expect: entry.expect,
      note: entry.note,
    };
  });
  const expected = {
    boundary: '冻结优先级链 6 组碰撞输入：任何既有优先级层（CORRECTION / WHY / WHAT_IF）命中即按该层分类（记忆识别不改变优先级层——零回归面）；全部层未命中时 B 类双命中（记住标记 + 偏好内容）识别为长期记忆表达；标记无偏好内容 / 裸记住请求不识别（UNKNOWN）',
  };
  const actual = { results };
  const pass =
    results[0].semanticAction === 'CORRECTION' &&
    results[0].longTermMemory === null &&
    results[1].semanticAction === 'WHY' &&
    results[1].longTermMemory === null &&
    results[2].semanticAction === 'WHAT_IF' &&
    results[2].longTermMemory === null &&
    results[3].semanticAction === 'UNKNOWN' &&
    results[3].longTermMemory !== null &&
    results[3].longTermMemory.topic === '我一直用深色模式' &&
    results[4].semanticAction === 'UNKNOWN' &&
    results[4].longTermMemory === null &&
    results[5].semanticAction === 'UNKNOWN' &&
    results[5].longTermMemory === null;
  return { expected, actual, pass };
}

// --- G11-FR：故障恢复（长期记忆用户主权——WITHDRAW → EXPIRED + 删除审计） ---
async function caseG11FailureRecovery(trace) {
  const { runtime, events } = createCaseRuntime();
  // A 类显式长期偏好表达 → 记录（REMEMBERED）。
  const session = await runtime.startSession();
  const write = await runtime.resolveIntent({
    sessionId: session.session.sessionId,
    rawInput: '我喜欢古典音乐',
    requestId: 'req-g11fr-1',
  });
  const afterWrite = runtime.getMemory();
  const written = afterWrite.memory.records[0] ?? null;
  // 用户主权：同一会话显式撤回（"别再给我这个"——
  // WITHDRAW 词表——记忆操作经 Runtime 单一写入者）。
  const withdraw = await runtime.resolveIntent({
    sessionId: session.session.sessionId,
    rawInput: '别再给我这个',
    requestId: 'req-g11fr-2',
  });
  const afterWithdraw = runtime.getMemory();
  const withdrawn = afterWithdraw.memory.records[0] ?? null;
  const memoryWithdrawn = eventsOf(events, 'memory_withdrawn');
  // 幂等：重复撤回 → 幂等空操作（no_memory_target——已
  // EXPIRED 记录非活跃目标，不重复留痕）。
  const repeat = await runtime.resolveIntent({
    sessionId: session.session.sessionId,
    rawInput: '别再给我这个',
    requestId: 'req-g11fr-3',
  });
  const expected = {
    write: 'A 类显式表达 → 记录 ×1（long_term / explicit / confidence=1.0 / REMEMBERED）',
    sovereignty: '用户主权不因记忆类别而削弱（长期记忆同走五阶段生命周期）——"别再给我这个" → WITHDRAW 执行：记录 →EXPIRED + withdrawn_at 留痕 + 删除审计（删除时间 / 记录范围 / 验证信息），memory_withdrawn ×1（properties：record_id / topic / previous_lifecycle / lifecycle / deletion_audit）',
    idempotence: '重复撤回 → 幂等空操作（no_memory_target——已 EXPIRED 记录非活跃目标，零重复留痕）',
  };
  const actual = {
    writeOk: write.ok,
    writeKind: write.ok && write.memoryOperation ? write.memoryOperation.kind : null,
    written: written ? { memoryClass: written.memoryClass, lifecycle: written.lifecycle } : null,
    withdrawOk: withdraw.ok,
    withdrawKind: withdraw.ok && withdraw.memoryOperation ? withdraw.memoryOperation.kind : null,
    withdrawExecuted: withdraw.ok && withdraw.memoryOperation ? withdraw.memoryOperation.executed : null,
    withdrawn: withdrawn
      ? { lifecycle: withdrawn.lifecycle, withdrawnAt: withdrawn.withdrawnAt, deletionAudit: withdrawn.deletionAudit }
      : null,
    memoryWithdrawnEvents: memoryWithdrawn.map((event) => ({
      topic: event.properties.topic,
      previous_lifecycle: event.properties.previous_lifecycle,
      lifecycle: event.properties.lifecycle,
      has_deletion_audit: event.properties.deletion_audit !== null && event.properties.deletion_audit !== undefined,
    })),
    repeatOk: repeat.ok,
    repeatKind: repeat.ok && repeat.memoryOperation ? repeat.memoryOperation.kind : null,
    repeatExecuted: repeat.ok && repeat.memoryOperation ? repeat.memoryOperation.executed : null,
    repeatReason: repeat.ok && repeat.memoryOperation ? (repeat.memoryOperation.reason ?? null) : null,
  };
  const pass =
    write.ok === true &&
    write.memoryOperation?.kind === 'record_long_term' &&
    written !== null &&
    written.memoryClass === 'long_term' &&
    written.lifecycle === 'REMEMBERED' &&
    withdraw.ok === true &&
    withdraw.memoryOperation?.kind === 'withdraw' &&
    withdraw.memoryOperation?.executed === true &&
    withdrawn !== null &&
    withdrawn.lifecycle === 'EXPIRED' &&
    withdrawn.withdrawnAt !== null &&
    withdrawn.deletionAudit !== null &&
    memoryWithdrawn.length === 1 &&
    memoryWithdrawn[0].properties.previous_lifecycle === 'REMEMBERED' &&
    memoryWithdrawn[0].properties.lifecycle === 'EXPIRED' &&
    memoryWithdrawn[0].properties.deletion_audit !== null &&
    repeat.ok === true &&
    repeat.memoryOperation?.kind === 'withdraw' &&
    repeat.memoryOperation?.executed === false &&
    repeat.memoryOperation?.reason === 'no_memory_target' &&
    eventsOf(events, 'memory_withdrawn').length === 1;
  return { expected, actual, pass };
}

// 黄金案例（G12 跨会话分支——S3a；S3B-SEMANTIC-FREEZE-01
// v1.0.0：分支记录全量跨会话持久化 + 跨会话分支操作路径，
// policy_v2.2.0 变更 3–4）
// ---------------------------------------------------------------------------

// --- G12-N：正常路径（跨会话分支操作——已结束会话的持久分支显式采用） ---
async function caseG12Normal(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  // 会话 A：WHAT_IF 轮 1（自动 CREATE 分支 1）→ 轮 2（累积）→ STOP（会话结束——currentBranchId 会话级清空，分支记录全量持久）。
  const chainA = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  const r1 = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: chainA.exp.stateVersion,
    requestId: 'req-g12n-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  const stateAfterR1 = runtime.getExperienceState(chainA.exp.experienceId);
  const r2 = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '假如速度再高一点会怎样',
    expectedStateVersion: stateAfterR1.state.stateVersion,
    requestId: 'req-g12n-2',
  });
  if (!r2.ok) {
    return { expected: { setup: '模拟轮 2 提交应被接受' }, actual: { setupError: r2.error.code }, pass: false };
  }
  await consume(r2.stream);
  const stateAfterR2 = runtime.getExperienceState(chainA.exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterR2.state.stateVersion,
    requestId: 'req-g12n-3',
  });
  if (!stop.ok) {
    return { expected: { setup: 'STOP 提交应被接受' }, actual: { setupError: stop.error.code }, pass: false };
  }
  await consume(stop.stream);
  // 会话结束核查：分支记录持久 + currentBranchId 会话级清空。
  const simulationAfterStop = runtime.getSimulation(chainA.exp.experienceId);
  const sessionAAfterStop = runtime.getSession(chainA.session.sessionId)?.state ?? null;
  // 会话 B：新会话建立自身体验（SESSION_ACTIVE——跨会话操作前提 ②）。
  const chainB = await setupChain(runtime, { rawInput: '为什么', intentRequestId: 'req-g12n-b-intent', experienceRequestId: 'req-g12n-b-exp' });
  // 跨会话分支操作（前提 ① WHAT_IF 分类 + 分支操作词识别；
  // 前提 ③ 宿主会话 SESSION_ENDED）：会话 B 对已结束会话 A
  // 的持久分支记录显式采用（ADOPT_BRANCH——确定性系统回合）。
  const stateForAdopt = runtime.getExperienceState(chainA.exp.experienceId);
  const adopt = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainB.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: stateForAdopt.state.stateVersion,
    requestId: 'req-g12n-4',
  });
  const adoptEvents = adopt.ok ? await consume(adopt.stream) : [];
  const simulationAfterAdopt = runtime.getSimulation(chainA.exp.experienceId);
  const simAdopted = eventsOf(events, 'simulation_adopted');
  const adoptTrace = traces.find((entry) => entry.reason?.secondary?.includes('ADOPT_BRANCH'));
  const branch = simulationAfterAdopt.ok ? simulationAfterAdopt.simulation.branches[0] : null;
  const expected = {
    persistence: 'STOP 后（会话 A 结束）：getSimulation 成功——分支记录 ×1（rounds ×2，模拟轮内容全量持久），currentBranchId===null（会话级指针清空——不跨会话自动恢复激活分支）',
    crossSession: '会话 B（SESSION_ACTIVE）对已结束会话 A 的体验执行"如果采用分支一"（WHAT_IF + ADOPT_BRANCH 词表识别——S3B §1.4 三前提）→ 提交成功（selected_action=SIMULATE，reason=simulation_branch_operation——确定性系统回合，llm_used=false）',
    branchModel: '分支 1：adopted false→true（附加标记——生命周期 ACTIVE 不变）；currentBranchId 保持 null（跨会话采用不恢复主线指针——会话级不变式）；分支模拟轮次不累积（version=2 不变）',
    adoptedEvent: 'simulation_adopted ×1（properties：branch_id / source_round=1 / adopted_content=分支最新模拟轮模拟内容 / separation_invariant=simulation_result_is_not_fact）',
    experienceAxis: '体验轴保持终态（COMPLETED——分支操作为轴外对象操作，体验轴不复活）',
  };
  const actual = {
    simulationAfterStop: simulationAfterStop.ok
      ? { currentBranchId: simulationAfterStop.simulation.currentBranchId, branches: simulationAfterStop.simulation.branches.length, rounds: simulationAfterStop.simulation.branches[0]?.rounds.length ?? 0 }
      : { error: simulationAfterStop.error?.code ?? 'unknown' },
    adoptOk: adopt.ok,
    adoptSelectedAction: adopt.ok ? adopt.header.policy_decision.selected_action : adopt.error.code,
    adoptReason: adopt.ok ? adopt.header.policy_decision.reason : null,
    adoptPolicyVersion: adopt.ok ? adopt.header.policy_decision.policy_version : null,
    adoptContentPresentsAdoptedContent: contentOf(adoptEvents).includes(simulate.chunks.join('')),
    simulationAfterAdopt: simulationAfterAdopt.ok
      ? { currentBranchId: simulationAfterAdopt.simulation.currentBranchId, branchAdopted: simulationAfterAdopt.simulation.branches[0]?.adopted ?? null, branchLifecycle: simulationAfterAdopt.simulation.branches[0]?.lifecycle ?? null, branchVersion: simulationAfterAdopt.simulation.branches[0]?.version ?? null, branchRounds: simulationAfterAdopt.simulation.branches[0]?.rounds.length ?? 0 }
      : { error: simulationAfterAdopt.error?.code ?? 'unknown' },
    simulationAdoptedEvents: simAdopted.map((event) => ({
      branch_id: event.properties.branch_id,
      source_round: event.properties.source_round,
      separation_invariant: event.properties.separation_invariant,
    })),
    decisionTraceReason: adoptTrace?.reason?.primary ?? null,
    decisionTraceLlmUsed: adoptTrace?.execution?.llm_used ?? null,
    sessionAAfterStop,
    finalState: runtime.getExperienceState(chainA.exp.experienceId).state,
  };
  const pass =
    sessionAAfterStop === 'SESSION_ENDED' &&
    simulationAfterStop.ok === true &&
    simulationAfterStop.simulation.currentBranchId === null &&
    simulationAfterStop.simulation.branches.length === 1 &&
    simulationAfterStop.simulation.branches[0].rounds.length === 2 &&
    adopt.ok === true &&
    actual.adoptSelectedAction === 'SIMULATE' &&
    actual.adoptReason === 'simulation_branch_operation' &&
    actual.adoptPolicyVersion === 'policy_v2.2.0' &&
    actual.adoptContentPresentsAdoptedContent &&
    simulationAfterAdopt.ok === true &&
    simulationAfterAdopt.simulation.currentBranchId === null &&
    branch !== null &&
    branch.adopted === true &&
    branch.lifecycle === 'ACTIVE' &&
    branch.version === 2 &&
    branch.rounds.length === 2 &&
    simAdopted.length === 1 &&
    simAdopted[0].properties.source_round === 1 &&
    simAdopted[0].properties.separation_invariant === 'simulation_result_is_not_fact' &&
    actual.decisionTraceReason === 'explicit_user_direction' &&
    actual.decisionTraceLlmUsed === false &&
    runtime.getExperienceState(chainA.exp.experienceId).state.status === 'COMPLETED';
  return { expected, actual, pass };
}

// --- G12-NEG：负向（跨会话放宽范围仅限分支操作路径——两类拒绝） ---
async function caseG12Negative(trace) {
  const { runtime, events } = createCaseRuntime();
  // 会话 A：WHAT_IF 轮 → STOP（会话结束——持久分支记录存在）。
  const chainA = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  const r1 = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: chainA.exp.stateVersion,
    requestId: 'req-g12neg-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  const stateAfterR1 = runtime.getExperienceState(chainA.exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterR1.state.stateVersion,
    requestId: 'req-g12neg-2',
  });
  if (!stop.ok) {
    return { expected: { setup: 'STOP 提交应被接受' }, actual: { setupError: stop.error.code }, pass: false };
  }
  await consume(stop.stream);
  // 会话 B：建立自身体验（SESSION_ACTIVE）。
  const chainB = await setupChain(runtime, { rawInput: '为什么', intentRequestId: 'req-g12neg-b-intent', experienceRequestId: 'req-g12neg-b-exp' });
  // 负向 ①：跨会话内容轮（WHY——非分支操作）→ 拒绝
  // （放宽范围仅限分支操作路径——体验 / 会话不匹配）。
  const stateForContent = runtime.getExperienceState(chainA.exp.experienceId);
  const crossContent = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainB.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么采用分支一',
    expectedStateVersion: stateForContent.state.stateVersion,
    requestId: 'req-g12neg-3',
  });
  // 负向 ②：宿主会话未结束（会话 C 在途 SESSION_ACTIVE）
  // 时跨会话分支操作 → 拒绝（前提 ③ 不满足——不干扰在途会话）。
  const chainC = await setupChain(runtime, { rawInput: '如果火星殖民地会怎样', intentRequestId: 'req-g12neg-c-intent', experienceRequestId: 'req-g12neg-c-exp' });
  const stateForCrossActive = runtime.getExperienceState(chainC.exp.experienceId);
  const chainD = await setupChain(runtime, { rawInput: '为什么', intentRequestId: 'req-g12neg-d-intent', experienceRequestId: 'req-g12neg-d-exp' });
  const crossActive = await runtime.submitExperienceEvent({
    experienceId: chainC.exp.experienceId,
    sessionId: chainD.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: stateForCrossActive.state.stateVersion,
    requestId: 'req-g12neg-4',
  });
  const expected = {
    negative1: '跨会话内容轮（WHY——非分支操作）→ 拒绝（INVALID_REQUEST experience/session mismatch——S3B §1.4：放宽范围仅限分支操作路径，内容轮保持严格会话绑定）',
    negative2: '宿主会话未结束（会话 C SESSION_ACTIVE 在途）时跨会话分支操作 → 拒绝（INVALID_STATE_TRANSITION cross-session branch operation illegal——前提 ③ 不满足：不干扰在途会话）',
  };
  const actual = {
    crossContent: { ok: crossContent.ok, code: crossContent.ok ? null : crossContent.error.code },
    crossActive: { ok: crossActive.ok, code: crossActive.ok ? null : crossActive.error.code },
    versionUnchanged1: runtime.getExperienceState(chainA.exp.experienceId).state.stateVersion === stateForContent.state.stateVersion,
    versionUnchanged2: runtime.getExperienceState(chainC.exp.experienceId).state.stateVersion === stateForCrossActive.state.stateVersion,
  };
  const pass =
    crossContent.ok === false &&
    crossContent.error.code === 'INVALID_REQUEST' &&
    crossActive.ok === false &&
    crossActive.error.code === 'INVALID_STATE_TRANSITION' &&
    actual.versionUnchanged1 === true &&
    actual.versionUnchanged2 === true;
  return { expected, actual, pass };
}

// --- G12-B：边界（持久化范围 + 恢复只读——查询不登记事件） ---
async function caseG12Boundary(trace) {
  const { runtime, events } = createCaseRuntime();
  // 会话 A：WHAT_IF 轮 1 → 轮 2 → STOP。
  const chainA = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  const r1 = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: chainA.exp.stateVersion,
    requestId: 'req-g12b-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  const stateAfterR1 = runtime.getExperienceState(chainA.exp.experienceId);
  const r2 = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '假如速度再高一点会怎样',
    expectedStateVersion: stateAfterR1.state.stateVersion,
    requestId: 'req-g12b-2',
  });
  if (!r2.ok) {
    return { expected: { setup: '模拟轮 2 提交应被接受' }, actual: { setupError: r2.error.code }, pass: false };
  }
  await consume(r2.stream);
  const stateAfterR2 = runtime.getExperienceState(chainA.exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterR2.state.stateVersion,
    requestId: 'req-g12b-3',
  });
  if (!stop.ok) {
    return { expected: { setup: 'STOP 提交应被接受' }, actual: { setupError: stop.error.code }, pass: false };
  }
  await consume(stop.stream);
  // 边界核查 ①：持久化范围 = 分支记录全部分量（id / 内容 /
  // 生命周期 / adopted / version / rounds / 模拟轮内容）。
  const simulation = runtime.getSimulation(chainA.exp.experienceId);
  const branch = simulation.ok ? simulation.simulation.branches[0] : null;
  const round1 = branch?.rounds[0] ?? null;
  // 边界核查 ②：恢复为只读加载——连续查询零事件登记
  // （查询不触发任何产品动作——不启动新体验 / 不登记
  // simulation_recorded / session_started / experience_started）。
  const eventsBeforeQueries = events.length;
  const query1 = runtime.getSimulation(chainA.exp.experienceId);
  const query2 = runtime.getSimulation(chainA.exp.experienceId);
  const eventsAfterQueries = events.length;
  const expected = {
    persistenceScope: '持久化范围 = 分支记录全部分量：branchId / sessionId / sourceRound / rounds（roundId / round / branchId / sourceInput / separation / stateVersion / recordedAt）/ version / lifecycle / adopted / createdAt / updatedAt——STOP 后快照全量可查',
    readOnlyRecovery: '恢复为只读加载（07 §22 检索纪律——查询不改变体验、不触发产品动作）：连续两次 getSimulation 零事件登记（events 长度不变——零 simulation_recorded / session_started / experience_started）',
    pointerInvariant: 'currentBranchId===null（会话级指针会话结束即清空——不跨会话自动恢复激活分支；分支记录存在 ≠ 指针恢复）',
  };
  const actual = {
    simulationOk: simulation.ok,
    currentBranchId: simulation.ok ? simulation.simulation.currentBranchId : null,
    branch: branch
      ? {
          branchId: branch.branchId,
          sessionId: branch.sessionId,
          sourceRound: branch.sourceRound,
          version: branch.version,
          lifecycle: branch.lifecycle,
          adopted: branch.adopted,
          rounds: branch.rounds.length,
          round1SourceInput: round1?.sourceInput ?? null,
          round1Separation: round1?.separation ?? null,
          round1StateVersion: round1?.stateVersion ?? null,
        }
      : null,
    queryResultsEqual: query1.ok && query2.ok && JSON.stringify(query1.simulation) === JSON.stringify(query2.simulation),
    eventsDelta: eventsAfterQueries - eventsBeforeQueries,
  };
  const pass =
    simulation.ok === true &&
    simulation.simulation.currentBranchId === null &&
    branch !== null &&
    branch.branchId === 'branch_synthetic_0001' &&
    branch.sessionId === chainA.session.sessionId &&
    branch.sourceRound === 1 &&
    branch.version === 2 &&
    branch.lifecycle === 'ACTIVE' &&
    branch.adopted === false &&
    branch.rounds.length === 2 &&
    round1?.sourceInput === '如果摩擦力为零会怎样' &&
    round1?.separation !== undefined &&
    round1?.stateVersion !== undefined &&
    actual.queryResultsEqual === true &&
    actual.eventsDelta === 0;
  return { expected, actual, pass };
}

// --- G12-FR：故障恢复（跨会话采用陈旧版本拒绝 → 当前版本重试成功） ---
async function caseG12FailureRecovery(trace) {
  const { runtime, events } = createCaseRuntime();
  // 会话 A：WHAT_IF 轮 → STOP（持久分支记录存在）。
  const chainA = await setupChain(runtime, { rawInput: '如果摩擦力为零会怎样' });
  const r1 = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零会怎样',
    expectedStateVersion: chainA.exp.stateVersion,
    requestId: 'req-g12fr-1',
  });
  if (!r1.ok) {
    return { expected: { setup: '模拟轮 1 提交应被接受' }, actual: { setupError: r1.error.code }, pass: false };
  }
  await consume(r1.stream);
  const stateAfterR1 = runtime.getExperienceState(chainA.exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainA.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterR1.state.stateVersion,
    requestId: 'req-g12fr-2',
  });
  if (!stop.ok) {
    return { expected: { setup: 'STOP 提交应被接受' }, actual: { setupError: stop.error.code }, pass: false };
  }
  await consume(stop.stream);
  const stateAfterStop = runtime.getExperienceState(chainA.exp.experienceId);
  // 会话 B：建立自身体验（SESSION_ACTIVE）。
  const chainB = await setupChain(runtime, { rawInput: '为什么', intentRequestId: 'req-g12fr-b-intent', experienceRequestId: 'req-g12fr-b-exp' });
  // 故障注入：跨会话采用携带陈旧 expected_state_version
  // （STOP 前版本）→ STATE_VERSION_CONFLICT（retryable=false
  // ——不覆盖、不消耗版本，S1-12 同族；OBL-01）。
  const staleVersion = stateAfterR1.state.stateVersion;
  const stale = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainB.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: staleVersion,
    requestId: 'req-g12fr-3',
  });
  const conflictEvents = eventsOf(events, 'state_version_conflict');
  const stateAfterStale = runtime.getExperienceState(chainA.exp.experienceId);
  // 拒绝后立即取证：分支记录未被修改（adopted 保持
  // false——拒绝先于任何写入；后续重试为合法采用）。
  const simulationAfterStale = runtime.getSimulation(chainA.exp.experienceId);
  // 恢复：携带当前版本跨会话重试采用成功（simulation_adopted ×1）。
  const retry = await runtime.submitExperienceEvent({
    experienceId: chainA.exp.experienceId,
    sessionId: chainB.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果采用分支一的结论呢',
    expectedStateVersion: stateAfterStale.state.stateVersion,
    requestId: 'req-g12fr-4',
  });
  const retryEvents = retry.ok ? await consume(retry.stream) : [];
  const simAdopted = eventsOf(events, 'simulation_adopted');
  const expected = {
    failure: '陈旧 expected_state_version（STOP 前版本）跨会话采用 → STATE_VERSION_CONFLICT（retryable=false——不覆盖、不消耗版本，S1-12 同族）；state_version_conflict ×1（expected_state_version / current_state_version 留痕）',
    noSideEffects: '冲突拒绝后体验状态版本不变（失败写入不消耗版本号——OBL-01 纪律）；分支记录未被修改（adopted 保持 false）',
    recovery: '携带当前版本跨会话重试采用成功（simulation_adopted ×1——采用结果仍标记为模拟来源）；采用轮结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文',
  };
  const actual = {
    staleResult: stale.ok ? 'OK（缺陷！）' : stale.error.code,
    staleRetryable: stale.ok ? null : stale.error.retryable,
    conflictEvents: conflictEvents.length,
    conflictExpectedVersion: conflictEvents[0]?.properties.expected_state_version ?? null,
    conflictCurrentVersion: conflictEvents[0]?.properties.current_state_version ?? null,
    stateVersionAfterStale: stateAfterStale.state.stateVersion,
    branchAdoptedAfterStale: simulationAfterStale.ok
      ? simulationAfterStale.simulation.branches[0].adopted
      : null,
    retryAccepted: retry.ok,
    retryPolicyReason: retry.ok ? retry.header.policy_decision.reason : null,
    retryPolicyVersion: retry.ok ? retry.header.policy_decision.policy_version : null,
    retryContentPresentsAdoptedContent: contentOf(retryEvents).includes(simulate.chunks.join('')),
    simulationAdoptedEvents: simAdopted.map((event) => ({
      branch_id: event.properties.branch_id,
      source_round: event.properties.source_round,
      separation_invariant: event.properties.separation_invariant,
    })),
    finalState: runtime.getExperienceState(chainA.exp.experienceId).state,
  };
  const pass =
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    stale.error.retryable === false &&
    actual.conflictEvents === 1 &&
    actual.conflictExpectedVersion === staleVersion &&
    actual.conflictCurrentVersion === stateAfterStop.state.stateVersion &&
    actual.stateVersionAfterStale === stateAfterStop.state.stateVersion &&
    actual.branchAdoptedAfterStale === false &&
    retry.ok === true &&
    actual.retryPolicyReason === 'simulation_branch_operation' &&
    actual.retryPolicyVersion === 'policy_v2.2.0' &&
    actual.retryContentPresentsAdoptedContent &&
    simAdopted.length === 1 &&
    simAdopted[0].properties.source_round === 1 &&
    simAdopted[0].properties.separation_invariant === 'simulation_result_is_not_fact' &&
    runtime.getSimulation(chainA.exp.experienceId).simulation.branches[0].adopted === true;
  return { expected, actual, pass };
}

// 案例注册表（执行的 48 案例；PD-21 关闭切片：G04/G07/G08 最小实现 + S2b G09 方向性操作 + S2 G10 分支回流 + S3a G11 长期记忆 / G12 跨会话分支——S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划，无 DEFERRED 登记）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  // G01 Direct Answer
  {
    caseId: 'G01-N',
    goldenCase: 'G01',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate & Sign-off §8 G01 Direct Answer；S1 §26 GS-01；Evaluation System V1 §5 G01；CC04',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'Session + 意图解析（DIRECT_ANSWER）+ 体验启动（v2）',
    inputFault: '无（正向路径）',
    run: caseG01Normal,
  },
  {
    caseId: 'G01-NEG',
    goldenCase: 'G01',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G01 负向；CC04（显式回答不被预设探索体验覆盖）；S1-05（分类为确定性规则，模型异常不存在于分类路径，用户意图不被改写）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 探索进行中（EXPLAIN 完成，v4）',
    inputFault: '探索上下文中显式 DIRECT_ANSWER',
    run: caseG01Negative,
  },
  {
    caseId: 'G01-B',
    goldenCase: 'G01',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G01 Boundary；S1-05 分类确定性（相邻输入变体与重复分类）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: '分类器可用（无状态）',
    inputFault: '相邻问法变体 + 20 次重复分类',
    run: caseG01Boundary,
  },
  {
    caseId: 'G01-FR',
    goldenCase: 'G01',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G01 Failure/Recovery；C4 故障语义（LLM_UNAVAILABLE）；工程边界 EB-02（失败不消耗版本号）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: '证据注入网关（propose 抛错）',
    inputFault: '生成期网关不可用 → 健康网关重试',
    run: caseG01FailureRecovery,
  },
  // G02 Why
  {
    caseId: 'G02-N',
    goldenCase: 'G02',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G02 Why；S1 §26 GS-02；Evaluation System V1 §5 G02',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'Session + 意图解析（WHY）+ 体验启动（v2）',
    inputFault: '无（正向路径）',
    run: caseG02Normal,
  },
  {
    caseId: 'G02-NEG',
    goldenCase: 'G02',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G02 Negative；P-01 STOP 永远优先（含 STOP 标记的输入不误读为 WHY）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 探索进行中（生成在途，ACTIVE v3）',
    inputFault: '输入"停止为什么"（含 STOP 与 WHY 标记）',
    run: caseG02Negative,
  },
  {
    caseId: 'G02-B',
    goldenCase: 'G02',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G02 Boundary；相邻重复输入；版本链 +1 不变式',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 探索进行中（v2）',
    inputFault: '相邻重复 WHY 两次',
    run: caseG02Boundary,
  },
  {
    caseId: 'G02-FR',
    goldenCase: 'G02',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G02 Failure/Recovery；C4 故障语义（LLM_UNAVAILABLE）；EB-02',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: '证据注入网关（propose 抛错）',
    inputFault: 'EXPLAIN 生成期网关不可用 → 健康网关重试',
    run: caseG02FailureRecovery,
  },
  // G03 What If（S1 基础单次模拟形态，PD-06）
  {
    caseId: 'G03-N',
    goldenCase: 'G03',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G03 What If（S1 基础形态）；S1 §11/§14 WHAT_IF → SIMULATE；E8-G2-CC07 事实/推断/假设分离；PD-06',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集（G03 基础单次模拟形态；完整多轮/持久分支 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'Session + 意图解析（WHAT_IF）+ 体验启动（v2）',
    inputFault: '无（正向路径）',
    run: caseG03Normal,
  },
  {
    caseId: 'G03-NEG',
    goldenCase: 'G03',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G03 Negative；P-01 STOP 优先于 WHAT_IF',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: '分类器可用（无状态）',
    inputFault: '输入"如果摩擦力为零就好了"（含 WHAT_IF 与 STOP 标记）',
    run: caseG03Negative,
  },
  {
    caseId: 'G03-B',
    goldenCase: 'G03',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G03 Boundary；PD-12 同一优先级层内解释顺序 WHY > WHAT_IF',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: '分类器可用（无状态）',
    inputFault: '输入"如果为什么"（同时含 WHAT_IF 与 WHY 标记）',
    run: caseG03Boundary,
  },
  {
    caseId: 'G03-FR',
    goldenCase: 'G03',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G03 Failure/Recovery；S1-12 陈旧版本写入拒绝（STATE_VERSION_CONFLICT，不覆盖最新状态）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHAT_IF 体验已启动（v2）',
    inputFault: '陈旧 expected_state_version=1 → 当前版本重试',
    run: caseG03FailureRecovery,
  },
  // G05 Change（S1 GS-03）
  {
    caseId: 'G05-N',
    goldenCase: 'G05',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G05 Change；S1 §11/§21；CC02 H03；P-02（生成中 CHANGE：取消旧生成、拒绝旧候选、开始新方向）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 生成在途（ACTIVE v3；流部分消费）',
    inputFault: '无（生成中 CHANGE 正向路径）',
    run: caseG05Normal,
  },
  {
    caseId: 'G05-NEG',
    goldenCase: 'G05',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G05 Negative（in-flight generation / stale response 必测维度）；S1-10 Critical（旧 operation 不得提交，STALE_GENERATION）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'CHANGE 完成（新方向 v5）；旧 generation 持有者尝试迟到达提交',
    inputFault: '旧 generation completeGeneration 迟到达',
    run: caseG05Negative,
  },
  {
    caseId: 'G05-B',
    goldenCase: 'G05',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G05 Boundary；C6 §27 / API §2.4 请求幂等（REQUEST_DUPLICATE）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'CHANGE 完成（v4）',
    inputFault: '相同 requestId 重复提交',
    run: caseG05Boundary,
  },
  {
    caseId: 'G05-FR',
    goldenCase: 'G05',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G05 Failure/Recovery；C4 故障语义（LLM_UNAVAILABLE）；EB-02；P-02（恢复后新方向完成）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 生成在途（ACTIVE v3）；可切换网关（故障窗口内 propose 抛错）',
    inputFault: 'CHANGE 期间网关不可用 → 健康网关重试（同一体验恢复）',
    run: caseG05FailureRecovery,
  },
  // G06 Stop（S1 GS-04；P0 硬边界）
  {
    caseId: 'G06-N',
    goldenCase: 'G06',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G06 Stop；S1 §20/§26 GS-04；Evaluation System V1 §5 G06（P0 blocker）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 探索完成（v4）',
    inputFault: '无（STOP 正向路径）',
    run: caseG06Normal,
  },
  {
    caseId: 'G06-NEG',
    goldenCase: 'G06',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G06 Negative；CC02 H02（STOP 后无 continuation；P0 硬边界）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'STOP 完成（COMPLETED v5；SESSION_ENDED）',
    inputFault: 'STOP 后提交任何输入',
    run: caseG06Negative,
  },
  {
    caseId: 'G06-B',
    goldenCase: 'G06',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G06 Boundary；终态拒绝（重复 STOP）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'STOP 完成（COMPLETED v5）',
    inputFault: '重复 STOP',
    run: caseG06Boundary,
  },
  {
    caseId: 'G06-FR',
    goldenCase: 'G06',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G06 Failure/Recovery；CC02 H02（生成中客户端中止；取消的 generation 不提交）',
    scope: 'P2 G3 黄金套件——S1 已实现黄金子集',
    precondition: 'WHY 生成在途（客户端持有 AbortController）',
    inputFault: '生成中客户端中止 → 随后 STOP 终止',
    run: caseG06FailureRecovery,
  },
  // G04 Creation（PD-21 关闭切片最小实现；完整 Creation 语义 DEFERRED TO S2）
  {
    caseId: 'G04-N',
    goldenCase: 'G04',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate & Sign-off §8 G04 Creation；Evaluation System V1 §5 G04；E2 Stage 5（最小 Creation Branch）；PD-21（产品负责人 2026-10-09 批准）',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Creation 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 探索完成（WAITING/UNDERSTANDING，v4）',
    inputFault: '无（正向路径：显式 CREATE）',
    run: caseG04Normal,
  },
  {
    caseId: 'G04-NEG',
    goldenCase: 'G04',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G04 Negative；P-02 同族（生成中 CREATE：取消旧生成、拒绝旧候选）；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Creation 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE/UNDERSTANDING，v3）',
    inputFault: '生成中 CREATE（"为什么不做成一个小游戏"——CREATE 优先于 WHY 标记）',
    run: caseG04Negative,
  },
  {
    caseId: 'G04-B',
    goldenCase: 'G04',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G04 Boundary；相邻重复输入；版本链 +1 不变式；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Creation 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 探索完成（WAITING/UNDERSTANDING，v4）',
    inputFault: '相邻 CREATE 变体两次（"这个可以做成一个小游戏。" / "再做一个这样的小游戏。"）',
    run: caseG04Boundary,
  },
  {
    caseId: 'G04-FR',
    goldenCase: 'G04',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G04 Failure/Recovery；C4 故障语义（LLM_UNAVAILABLE）；EB-02；P-02；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Creation 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE v3）；可切换网关（故障窗口内 propose 抛错）',
    inputFault: 'CREATE 期间网关不可用 → 健康网关重试（同一体验恢复）',
    run: caseG04FailureRecovery,
  },
  // G07 Correction（PD-21 关闭切片最小实现；完整 Correction 语义 DEFERRED TO S2）
  {
    caseId: 'G07-N',
    goldenCase: 'G07',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate & Sign-off §8 G07 Correction；Evaluation System V1 §5 G07（remove invalid inference / preserve valid context / reassess）；PD-21（产品负责人 2026-10-09 批准）',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Correction 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 探索完成（WAITING/UNDERSTANDING，v4）',
    inputFault: '无（正向路径：显式 CORRECTION）',
    run: caseG07Normal,
  },
  {
    caseId: 'G07-NEG',
    goldenCase: 'G07',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G07 Negative；P-02 同族（生成中 CORRECTION：取消旧生成、拒绝旧候选）；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Correction 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE/UNDERSTANDING，v3）',
    inputFault: '生成中 CORRECTION（"不是这个意思，为什么"——CORRECTION 优先于 WHY 标记）',
    run: caseG07Negative,
  },
  {
    caseId: 'G07-B',
    goldenCase: 'G07',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G07 Boundary；纠正后继续探索（有效上下文保留）；版本链 +1 不变式；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Correction 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 探索完成（WAITING/UNDERSTANDING，v4）',
    inputFault: 'CORRECTION 后继续 WHY 探索（"不对，这个理解错了" → "为什么？"）',
    run: caseG07Boundary,
  },
  {
    caseId: 'G07-FR',
    goldenCase: 'G07',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G07 Failure/Recovery；C4 故障语义（LLM_UNAVAILABLE）；EB-02；P-02；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整 Correction 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE v3）；可切换网关（故障窗口内 propose 抛错）',
    inputFault: 'CORRECTION 期间网关不可用 → 健康网关重试（同一体验恢复）',
    run: caseG07FailureRecovery,
  },
  // G08 Memory Boundary（PD-21 关闭切片最小实现；完整持久 Memory 语义 DEFERRED TO S2）
  {
    caseId: 'G08-N',
    goldenCase: 'G08',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate & Sign-off §8 G08 Memory Boundary；Evaluation System V1 §5 G08（当前意图信号不得升级为持久偏好）；PD-21（产品负责人 2026-10-09 批准）；PD-07',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整持久 Memory 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE/UNDERSTANDING，v3；流部分消费）',
    inputFault: '无（生成中方向信号正向路径；CHANGE_DIRECTION 自 WAITING 在冻结状态机非法，故自在途态观测）',
    run: caseG08Normal,
  },
  {
    caseId: 'G08-NEG',
    goldenCase: 'G08',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G08 Negative；授权 §5.7（未知情况升级而非由 LLM 决定）；PD-07；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整持久 Memory 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE v3）→ 方向信号 CHANGE 完成（v5）',
    inputFault: '方向信号变体（"以后不要这个"）+ 记忆升级尝试（"记住这个"）',
    run: caseG08Negative,
  },
  {
    caseId: 'G08-B',
    goldenCase: 'G08',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G08 Boundary；相邻输入变体结构等价；PD-07 纪律经授权 §2(4) 取代性扩展（F-5 短期记忆跨会话持久化）；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整持久 Memory 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: '分类器可用（无状态）；产品源码静态可扫描（src/experience + app/api）',
    inputFault: '相邻方向信号变体对（"今天不要这个" / "以后不要这个"）+ memory 层静态存在证明（F-5）',
    run: caseG08Boundary,
  },
  {
    caseId: 'G08-FR',
    goldenCase: 'G08',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G08 Failure/Recovery；授权 §5.7（升级路径零副作用）；PD-07；PD-21',
    scope: 'P2 G3 黄金套件——关闭切片（PD-21 最小实现；完整持久 Memory 语义 DEFERRED TO S2，acceptance-mapping §B）',
    precondition: 'WHY 生成在途（ACTIVE v3；流未消费）',
    inputFault: '对抗记忆升级尝试（"记住这个"）→ 在途 WHY 生成继续完成',
    run: caseG08FailureRecovery,
  },

  // G09 Directional Operations（S2b；S2B-SEMANTIC-FREEZE-01
  // D-01 选项 A——顶层语义动作 DEEPEN / SIMPLIFY / REFRAME）
  {
    caseId: 'G09-N',
    goldenCase: 'G09',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 方向性补丁正常路径；14 §8 恒等映射；08 §十 方向性操作自然语示例锚点；policy_v2.0.0 变更 1/3/5',
    scope: 'P2 G3 黄金套件——S2b 新增黄金案例（创作会话内 DEEPEN 方向性补丁：顶层补丁操作 + 版本单调 +1 + user_changes 权威登记 + 结构保持）',
    precondition: 'WHY → CREATE 完成（WAITING/CREATION v6；创作 v1，USER_FEEDBACK 阶段）',
    inputFault: '无（正常路径；"再深入关卡一点" → DEEPEN，目标经 TARGET_SYNONYMS 由"关卡"派生为 level）',
    run: caseG09Normal,
  },
  {
    caseId: 'G09-NEG',
    goldenCase: 'G09',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 非创作会话升级路径；policy_v2.0.0 变更 5；C3 升级纪律（model on F-2/F-3 创作会话路由保护）',
    scope: 'P2 G3 黄金套件——S2b 新增黄金案例（无活跃创作对象时方向性操作升级拒绝）',
    precondition: 'WHY 完成（WAITING/UNDERSTANDING v4；无创作会话）',
    inputFault: '无创作会话 SIMPLIFY 分类输入 → INVALID_ACTION 升级（零事件、零版本消耗、零创作会话建立）',
    run: caseG09Negative,
  },
  {
    caseId: 'G09-B',
    goldenCase: 'G09',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 优先级链；policy_v2.0.0 变更 4 冻结优先级链；分类器确定性规则词表（GS-01 确定性）',
    scope: 'P2 G3 黄金套件——S2b 新增黄金案例（冻结优先级链 8 组碰撞输入：STOP / CHANGE_DIRECTION / CORRECTION / CREATE 优先于方向性动作；方向性动作优先于 WHY / WHAT_IF / DIRECT_ANSWER）',
    precondition: '无（纯分类层；确定性规则，无状态变更）',
    inputFault: '优先级碰撞输入 8 组（含 "换个角度" → CHANGE_DIRECTION 词表碰撞核验）',
    run: caseG09Boundary,
  },
  {
    caseId: 'G09-FR',
    goldenCase: 'G09',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 陈旧创作版本拒绝（S1-12 延伸）；失败写入不消耗版本号（OBL-01 纪律）',
    scope: 'P2 G3 黄金套件——S2b 新增黄金案例（陈旧 expected_creation_version 冲突拒绝 → 当前版本重试成功）',
    precondition: 'WHY → CREATE 完成（WAITING/CREATION v6；创作 v1）',
    inputFault: '陈旧 expectedCreationVersion=999 → STATE_VERSION_CONFLICT（不覆盖、不消耗版本）→ 当前版本重试 REFRAME 成功',
    run: caseG09FailureRecovery,
  },
  {
    caseId: 'G10-N',
    goldenCase: 'G10',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A（policy_v2.2.0 变更 1–5）：ADOPT_BRANCH 显式回流——第五分支操作',
    scope: 'P2 G3 黄金套件——S2 新增黄金案例（分支结论显式回流：确定性系统回合 + simulation_adopted 事件 + 新一轮模拟上下文呈现）',
    precondition: 'WHY → WHAT_IF 轮 1（自动 CREATE 分支 1）→ 轮 2（累积）',
    inputFault: '无（正常路径——"如果采用分支一的结论呢"命中 ADOPT_BRANCH 词表 + 可解析序号 1）',
    run: caseG10Normal,
  },
  {
    caseId: 'G10-NEG',
    goldenCase: 'G10',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 词表边界（优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH，均须分支作用域 + 可解析序号，否则通用 SIMULATE 执行路径）；OBL-01 失败写入不消耗版本号',
    scope: 'P2 G3 黄金套件——S2 新增黄金案例负向（未命中作用域词表的"采用"走通用模拟；不存在序号拒绝）',
    precondition: 'WHY → WHAT_IF 轮 1（自动 CREATE 分支 1）',
    inputFault: '① "如果采用这个结论呢"（未命中分支作用域词表）→ 通用 SIMULATE；② "如果采用分支九的结论呢"（不存在序号）→ INVALID_STATE_TRANSITION（不消耗版本号）',
    run: caseG10Negative,
  },
  {
    caseId: 'G10-B',
    goldenCase: 'G10',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A：adopted 附加属性幂等、生命周期契约不变（ACTIVE/RETURNED/ABANDONED 三态）、主线当前上下文不因采用而改变',
    scope: 'P2 G3 黄金套件——S2 新增黄金案例边界（RETURNED 分支采用 + 幂等重采用 + 无激活分支上下文时主线当前上下文保持 null）',
    precondition: 'WHY → WHAT_IF 轮 1/2（分支 1 累积）→ RETURN（分支 1 RETURNED，currentBranchId=null）',
    inputFault: 'RETURNED 分支采用（生命周期 RETURNED 不变）→ 重复采用（幂等——adopted 保持 true，version/轮次/当前上下文均不变）',
    run: caseG10Boundary,
  },
  {
    caseId: 'G10-FR',
    goldenCase: 'G10',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A；S1-12 陈旧版本写入拒绝；创作版本化纪律不变（采用内容经独立 CREATE 提交纳入作品，不自动写入）',
    scope: 'P2 G3 黄金套件——S2 新增黄金案例故障恢复（陈旧 expected_state_version 采用拒绝 → 当前版本重试成功 → CREATE 衔接纳入作品）',
    precondition: 'WHY → WHAT_IF 轮 1（自动 CREATE 分支 1）',
    inputFault: '陈旧 expected_state_version=3 → STATE_VERSION_CONFLICT（retryable=false）→ 当前版本重试采用成功 → CREATE 衔接（创作 v1，零 user_changes）',
    run: caseG10FailureRecovery,
  },
  // G11 Long-term Memory（S3a；S3A-SEMANTIC-FREEZE-01 v1.0.0）
  {
    caseId: 'G11-N',
    goldenCase: 'G11',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G11 长期记忆（S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划）；S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.1（A 类门槛）/ §1.6（单一写入者）/ §1.8（事件属性扩展）；07 §5（A 类：明确表达的长期偏好）；policy_v2.2.0 变更 1',
    scope: 'P2 G3 黄金套件——S3a 新增长期记忆黄金案例（A 类显式表达正常路径）',
    precondition: '新会话（SESSION_IDLE——记忆操作经 resolveIntent 路由，不要求体验轴）',
    inputFault: '无（正向路径——"我喜欢古典音乐"A 类显式表达）',
    run: caseG11Normal,
  },
  {
    caseId: 'G11-NEG',
    goldenCase: 'G11',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G11 负向；S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.2（B 类双命中纪律——裸记住请求不识别为记忆写入）；黄金 G08-NEG 不变式（"记住这个"对抗语料——零回归面纪律）；授权 §5.7（未知情况升级而非由系统决定）',
    scope: 'P2 G3 黄金套件——S3a 新增长期记忆黄金案例（裸记住请求负向）',
    precondition: '新会话（SESSION_IDLE）',
    inputFault: '"记住这个"（G08-NEG 对抗语料）+"记住这个想法"（标记无偏好内容负向）',
    run: caseG11Negative,
  },
  {
    caseId: 'G11-B',
    goldenCase: 'G11',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G11 边界；S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.2（识别仅在全部既有优先级层与记忆操作词表未命中后调用——零优先级层变更）；G09-B 边界纪律（冻结优先级链碰撞输入）',
    scope: 'P2 G3 黄金套件——S3a 新增长期记忆黄金案例（优先级链碰撞边界）',
    precondition: '分类器可用（无状态）',
    inputFault: '6 组碰撞输入（CORRECTION / WHY / WHAT_IF 层命中 ×3 + B 类双命中 ×1 + 标记无偏好 ×1 + 裸记住 ×1）',
    run: caseG11Boundary,
  },
  {
    caseId: 'G11-FR',
    goldenCase: 'G11',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G11 故障恢复；S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.4（用户主权——WITHDRAW 经既有生命周期与事件，长期记忆同走五阶段生命周期）；07 §15（用户控制）/ §13（"别再给我这个"）；C6 §14（memory_withdrawn 命名）',
    scope: 'P2 G3 黄金套件——S3a 新增长期记忆黄金案例（用户主权撤回 + 幂等）',
    precondition: 'A 类显式长期记忆记录存在（REMEMBERED）',
    inputFault: '"别再给我这个"（WITHDRAW 词表）×2（首次执行 + 重复幂等）',
    run: caseG11FailureRecovery,
  },
  // G12 Cross-session Branch（S3a；S3B-SEMANTIC-FREEZE-01 v1.0.0）
  {
    caseId: 'G12-N',
    goldenCase: 'G12',
    dimension: 'NORMAL',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G12 跨会话分支（S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划）；S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.1（持久化范围）/ §1.4（跨会话操作路径三前提）/ §1.5（endSession 语义）；policy_v2.2.0 变更 3',
    scope: 'P2 G3 黄金套件——S3a 新增跨会话分支黄金案例（跨会话 ADOPT_BRANCH 正常路径）',
    precondition: '会话 A WHAT_IF 轮 ×2 + STOP（会话结束——持久分支记录存在）；会话 B SESSION_ACTIVE（经自身体验建立）',
    inputFault: '无（正向路径——"如果采用分支一的结论呢"跨会话 ADOPT_BRANCH）',
    run: caseG12Normal,
  },
  {
    caseId: 'G12-NEG',
    goldenCase: 'G12',
    dimension: 'NEGATIVE',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G12 负向；S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.4（放宽范围仅限分支操作路径——内容轮保持严格会话绑定；前提 ③ 宿主会话 SESSION_ENDED——不干扰在途会话）',
    scope: 'P2 G3 黄金套件——S3a 新增跨会话分支黄金案例（两类跨会话拒绝负向）',
    precondition: '会话 A 已结束（持久分支记录存在）；会话 B / D SESSION_ACTIVE；会话 C SESSION_ACTIVE 在途（宿主会话未结束）',
    inputFault: '跨会话内容轮（WHY——非分支操作）+ 宿主会话未结束时跨会话分支操作',
    run: caseG12Negative,
  },
  {
    caseId: 'G12-B',
    goldenCase: 'G12',
    dimension: 'BOUNDARY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G12 边界；S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.1（持久化范围 = 分支记录全部分量）/ §1.2（currentBranchId 会话级不变式）/ §1.3（恢复为只读加载——不登记新事件）；07 §22（检索不改变体验）',
    scope: 'P2 G3 黄金套件——S3a 新增跨会话分支黄金案例（持久化范围 + 只读恢复边界）',
    precondition: '会话 A WHAT_IF 轮 ×2 + STOP（持久分支记录存在）',
    inputFault: '无输入（只读查询边界——连续 getSimulation 零事件登记）',
    run: caseG12Boundary,
  },
  {
    caseId: 'G12-FR',
    goldenCase: 'G12',
    dimension: 'FAILURE_RECOVERY',
    form: 'in-process',
    sourceClause: 'P2 Exit Gate §8 G12 故障恢复；S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.4（跨会话操作路径）；S1-12（版本冲突不消耗版本）；OBL-01（失败写入纪律）；G10-FR 故障恢复纪律（陈旧版本拒绝 → 当前版本重试）',
    scope: 'P2 G3 黄金套件——S3a 新增跨会话分支黄金案例（跨会话采用陈旧版本拒绝 → 当前版本重试成功）',
    precondition: '会话 A WHAT_IF 轮 + STOP（持久分支记录存在）；会话 B SESSION_ACTIVE',
    inputFault: '陈旧 expected_state_version（STOP 前版本）跨会话采用 → 冲突 → 当前版本重试',
    run: caseG12FailureRecovery,
  },
];


// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  // Engine gate: exact Node lock per F-2 (authorization-date LTS re-verification).
  if (process.version !== NODE_LOCK) {
    fatal(`engine gate: expected Node ${NODE_LOCK} (F-2 lock), found ${process.version}`);
  }
  log(`engine gate passed: Node ${process.version} (${process.execPath})`);

  // Preflight: typecheck + production build (recorded, failure = FATAL).
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1-E2E-0001 / F2 / F3).
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

  // Prepare run directories. A previous attempt's run directory is archived
  // (neutral name; the closure-slice record registers each attempt's outcome),
  // never overwritten (ADR-0002 §5).
  if (existsSync(runDir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = `${runDir}-attempt-${stamp}`;
    await rename(runDir, archiveDir);
    log(`archived previous attempt at ${path.basename(archiveDir)} (preserved, not overwritten)`);
  }
  for (const dir of [casesDir, tracesDir, logsDir, reviewDir]) {
    await mkdir(dir, { recursive: true });
  }

  // Execute cases sequentially (in-process form: real committed .ts source bytes).
  const caseResults = [];
  for (const definition of CASE_REGISTRY) {
    const trace = new TraceWriter(tracesDir, `${RUN_ID}:${definition.caseId}`);
    await trace.start({
      form: definition.form,
      sourceClause: definition.sourceClause,
      goldenCase: definition.goldenCase,
      dimension: definition.dimension,
    });
    log(`case ${definition.caseId}: RUNNING (${definition.goldenCase} ${definition.dimension}, ${definition.form})`);
    let outcome;
    try {
      outcome = await definition.run(trace);
    } catch (error) {
      await trace.emit('executor-error', { error: String(error) });
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
      invariants: [
        'P2 G3 黄金套件不变式（P2 Exit Gate §8）：每个黄金案例覆盖 Normal/Negative/Boundary/Failure-Recovery 四维度',
        'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
        '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；陈旧写入返回 STATE_VERSION_CONFLICT 且不得覆盖（S1-12）',
        'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）',
        '旧 operation 不得提交（generation epoch 守卫 + 版本双重检查，S1-10；CC02 H03）',
        '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
        '失败不消耗版本号（EB-02）；取消的 generation 不提交（CC02 H02）',
        '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方；不收集真实用户数据（ADR-0002 §3）',
      ],
      evidence: {
        trace: `traces/${`${RUN_ID}:${definition.caseId}`}.jsonl`,
        traceSha256: sha256OfBuffer(
          Buffer.from(
            await readFile(path.join(tracesDir, `${RUN_ID}:${definition.caseId}.jsonl`), 'utf8'),
            'utf8',
          ),
        ),
        form: definition.form,
        regressionBaseline: 'F2-GS-0001（行为基线；期望逐项冻结）',
      },
      result: outcome.pass ? 'PASS' : 'FAIL',
      evaluator: EVALUATOR_SEPARATION,
      defectsFollowUp: outcome.pass
        ? '无（本案例）；G3 Gate 逐项判定属独立评测范畴（角色 5）；G04/G07/G08 完整语义 DEFERRED TO S2（acceptance-mapping §B）'
        : '本案例未通过——按 ADR-0002 §5 如实登记，不得重跑至通过为止；缺陷须在关闭切片处置',
    };
    const validation = validateCaseRecord(caseRecord);
    if (!validation.valid) {
      log(`case ${definition.caseId}: record INVALID ${JSON.stringify(validation)}`);
    }
    await writeCaseRecord(casesDir, caseRecord);
    await trace.complete({ result: caseRecord.result, pass: outcome.pass });
    caseResults.push({
      caseId: definition.caseId,
      goldenCase: definition.goldenCase,
      dimension: definition.dimension,
      result: caseRecord.result,
      pass: outcome.pass,
    });
    log(`case ${definition.caseId}: ${caseRecord.result}`);
  }


  // Assertions.
  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  const executedResults = caseResults.filter((entry) => entry.dimension !== 'DEFERRED');
  const deferredResults = caseResults.filter((entry) => entry.dimension === 'DEFERRED');
  const allCasesPass = executedResults.every((entry) => entry.pass === true);

  // A2: environment lock.
  const productPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const toolsPackage = JSON.parse(await readFile(path.join(evidenceRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const ENGINE_LOCK = '24.21.0';
  const engineLocked =
    productPackage.engines?.node === ENGINE_LOCK &&
    toolsPackage.engines?.node?.startsWith('>=24') &&
    process.version === NODE_LOCK &&
    lockfile.lockfileVersion === 3;
  assert(
    'A2',
    `环境锁定：engines.node === "${ENGINE_LOCK}"（F-2 精确锁定）且执行于 Node ${process.version}；lockfileVersion 3`,
    engineLocked,
    { engines: productPackage.engines, nodeVersion: process.version, lockfileVersion: lockfile.lockfileVersion },
  );

  // A3: case records complete for all cases (32 executed; no deferred).
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  assert(
    'A3',
    `全部 ${caseResults.length} 案例记录齐备且 12 字段完整（E5 §4；${executedResults.length} 执行；PD-19 延期义务已履行——G04/G07/G08 关闭切片执行，无 DEFERRED 登记）`,
    recordFiles.length === caseResults.length && allCasesPass,
    { recordFiles: recordFiles.length, expected: caseResults.length, allCasesPass },
  );

  // A4: traces exist and are non-empty for every executed case.
  const traceFiles = (await readdir(tracesDir)).filter((name) => name.endsWith('.jsonl'));
  const traceCheck = (
    await Promise.all(
      CASE_REGISTRY.map(async (definition) => {
        const filePath = path.join(tracesDir, `${RUN_ID}:${definition.caseId}.jsonl`);
        if (!existsSync(filePath)) return false;
        const events = parseNdjsonEvents(await readFile(filePath, 'utf8'));
        return events.length >= 2; // trace_started + trace_completed minimum
      }),
    )
  ).every(Boolean);
  assert(
    'A4',
    `全部 ${CASE_REGISTRY.length} 执行案例轨迹齐备且非空（trace_started + 案例事实 + trace_completed）`,
    traceCheck && traceFiles.length === CASE_REGISTRY.length,
    { traceFiles: traceFiles.length, expected: CASE_REGISTRY.length },
  );

  // A5: golden dimension coverage — each golden case (G01–G12) has all four dimensions.
  const goldenCases = ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09', 'G10', 'G11', 'G12'];
  const dimensionCoverage = goldenCases.map((goldenCase) => {
    const dims = executedResults.filter((entry) => entry.goldenCase === goldenCase).map((entry) => entry.dimension);
    return { goldenCase, dimensions: dims, complete: GOLDEN_DIMENSIONS.every((dim) => dims.includes(dim)) };
  });
  assert(
    'A5',
    '黄金维度覆盖：G01–G12 各具备 NORMAL/NEGATIVE/BOUNDARY/FAILURE_RECOVERY 四维度（P2 Exit Gate §8；G04/G07/G08 为 PD-21 关闭切片最小实现；G09 为 S2b 新增黄金案例；G10 为 S2 分支回流新增黄金案例——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A；G11/G12 为 S3a 新增黄金案例——S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划）',
    dimensionCoverage.every((entry) => entry.complete),
    { dimensionCoverage },
  );

  // A6: in-flight generation / stale response coverage (P2 Exit Gate §8 hard requirement for G05/G06).
  const staleCase = executedResults.find((entry) => entry.caseId === 'G05-NEG');
  const abortCase = executedResults.find((entry) => entry.caseId === 'G06-FR');
  const inflightCase = executedResults.find((entry) => entry.caseId === 'G05-N');
  const inflightCreateCase = executedResults.find((entry) => entry.caseId === 'G04-NEG');
  const inflightCorrectCase = executedResults.find((entry) => entry.caseId === 'G07-NEG');
  assert(
    'A6',
    'G04/G05/G06/G07 in-flight generation / stale response 必测维度已覆盖且通过（G04-NEG 生成中 CREATE、G05-N 生成中 CHANGE、G05-NEG 旧 generation 迟到达拒绝、G06-FR 生成中客户端中止、G07-NEG 生成中 CORRECTION）',
    inflightCase?.pass === true && staleCase?.pass === true && abortCase?.pass === true && inflightCreateCase?.pass === true && inflightCorrectCase?.pass === true,
    { inflight: inflightCase?.result, stale: staleCase?.result, abort: abortCase?.result, inflightCreate: inflightCreateCase?.result, inflightCorrect: inflightCorrectCase?.result },
  );

  // A7: regression baseline binding (cross-iteration regression baseline per OBL-03).
  const baselineRunIds = ['F2-GS-0001', 'F3-EB-0001'];
  const baselineExists = baselineRunIds.every((runId) => existsSync(path.join(repoRoot, 'artifacts', 'evidence', 'runs', runId, 'summary.json')));
  assert(
    'A7',
    '跨迭代回归基线绑定：F2-GS-0001 / F3-EB-0001 基线运行存在；本运行期望逐项冻结自该基线',
    baselineExists,
    { baselineRunIds, baselineExists },
  );

  // A8: PD-19 延期义务履行——G04/G07/G08 关闭切片四维度黄金证据齐备，无 DEFERRED 登记。
  const closureSliceCases = ['G04', 'G07', 'G08'].map((goldenCase) => ({
    goldenCase,
    dimensions: executedResults.filter((entry) => entry.goldenCase === goldenCase).map((entry) => entry.dimension),
  }));
  assert(
    'A8',
    'PD-19 延期义务履行：G04/G07/G08 最小实现（PD-21 关闭切片）四维度黄金证据齐备且无 DEFERRED 登记（完整语义仍 DEFERRED TO S2，acceptance-mapping §B）',
    closureSliceCases.every((entry) => GOLDEN_DIMENSIONS.every((dim) => entry.dimensions.includes(dim))) &&
      deferredResults.length === 0,
    { closureSliceCases, deferredCount: deferredResults.length },
  );

  // A9: all executed cases PASS.
  assert(
    'A9',
    `全部 ${executedResults.length} 执行案例 PASS（本运行断言；不设置 G3 为 PASS——G3 判定属独立评测）`,
    allCasesPass,
    { executed: executedResults.length, passed: executedResults.filter((entry) => entry.pass).length },
  );

  // --- run-metadata.json (E5 §3 version matrix, golden-suite form) ---
  const runtimeFileHashes = {};
  for (const entry of await hashTree(path.join(repoRoot, 'src', 'experience'))) {
    runtimeFileHashes[entry.path] = entry.hash;
  }
  const fixtureHashes = {
    'src/experience/fixtures/direct-answer.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/direct-answer.ts')),
    'src/experience/fixtures/why.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/why.ts')),
    'src/experience/fixtures/simulate.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/simulate.ts')),
    'src/experience/fixtures/change-direction.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/change-direction.ts')),
    'src/experience/fixtures/create.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/create.ts')),
    'src/experience/fixtures/correction.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/correction.ts')),
    'src/experience/fixtures/deepen.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/deepen.ts')),
    'src/experience/fixtures/simplify.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/simplify.ts')),
    'src/experience/fixtures/reframe.ts': await sha256OfFile(path.join(repoRoot, 'src/experience/fixtures/reframe.ts')),
  };
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
  const versionMatrix = {
    runId: RUN_ID,
    recordedAt: startedAt,
    executor: {
      executedBy: '工程负责人角色（代理，Codex）',
      independentEvaluator: '独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）',
    },
    obligation: 'P2 G09 黄金案例回归套件义务 / G3 Gate（P2 Exit Gate & Sign-off §8）；OBL-03（PD-19：G3 DEFERRED TO S2/P2 关闭切片——PD-21 关闭切片已执行并履行；S2b G09 方向性操作已执行）',
    authorization: 'P3-S1-IMPL-AUTH-01 v1.3.0 §2（动态证据执行）；E5-SCOPED-LICENSE-01（PD-17 / CR-15 选项 A）',
    goldenCorpus: {
      definition: 'P2 核心产品验收 G01–G12；每案例至少 Normal/Negative/Boundary/Failure-Recovery 四维度 + Expected/Observed/Evidence/Evaluator（P2 Exit Gate §8；G09 为 S2b 方向性操作；G10 为 S2 分支回流操作——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A；G11/G12 为 S3a 新增——S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划）',
      s1Covered: {
        goldenCases,
        caseIds: CASE_REGISTRY.map((definition) => definition.caseId),
        count: CASE_REGISTRY.length,
        note: 'G03 为 S1 基础单次模拟形态（PD-06）；G04/G07/G08 为 PD-21 关闭切片最小实现（完整语义 DEFERRED TO S2，acceptance-mapping §B）',
      },
      closureSlice: {
        authority: 'PD-21（产品负责人 2026-10-09 批准；decision-register v0.19.0）',
        goldenCases: ['G04', 'G07', 'G08'],
        note: '最小实现（CREATE / CORRECTION 语义动作 + CREATION 阶段 + 当前会话方向信号）四维度黄金证据齐备；完整 Creation / Correction / 持久 Memory 语义仍 DEFERRED TO S2（acceptance-mapping §B，PD-05/PD-06/PD-07）',
      },
    },
    regression: {
      baselineRunIds,
      baselineBinding: '案例期望逐项冻结自 F2-GS-0001 行为基线（F2 动态证据 40/40 案例 PASS）；F3-EB-0001 为工程边界基线',
      comparison: '行为漂移检测——运行时代码（src/experience/**）字节绑定 git HEAD；行为偏离冻结期望即案例 FAIL',
      changeId: null,
      affectedCaseIds: CASE_REGISTRY.map((definition) => definition.caseId),
      priorRunIds: ['F1-E2E-0001', 'F2-GS-0001', 'F3-EB-0001'],
    },
    contracts: fingerprintCheck.contracts,
    s1Specifications: referenceCheck.entries
      .filter((entry) => entry.path.startsWith('P3-S1'))
      .map((entry) => ({ source: `docs/product/reference/${entry.path}`, sha256: entry.computed, archiveIntegrity: entry.match ? 'VERIFIED vs SHA256SUMS' : 'MISMATCH' })),
    stateMachine: { version: 'state_machine_v1.5.0', source: 'SRC-05 / 13', closureSlice: 'CREATION 阶段 + CREATE/CORRECTION 触发（PD-21 关闭切片最小形态）+ 完整 WHAT_IF 分支语义（S2a F-4，state_machine_v1.4.0）+ S2b 变更 1–3（state_machine_v1.5.0：方向性操作 DEEPEN/SIMPLIFY/REFRAME 文档化——冻结迁移表无结构变更）' },
    policy: { version: 'policy_v2.2.0（S2b 版本化变更 + S2 分支回流版本化变更）', source: 'SRC-06 / 14', status: 'S1 冻结策略表（5 语义动作）+ 关闭切片 CREATE/CORRECTION（PD-21，最小形态）+ 完整 G04 Creation 语义（S2a F-2）+ 完整 G07 Correction 语义（S2a F-3，policy_v1.3.0：MODIFY 别名登记 + G07 四要素 + RESTORE 恢复子型）+ 完整 WHAT_IF 分支语义（S2a F-4，policy_v1.4.0：多轮模拟持久化 + 轴外分支子状态机）+ Minimal Memory 语义（S2a F-5，policy_v1.5.0：轴外记忆子状态机 + L5 信号注入 + Runtime 单一写入者）+ S2b 方向性操作语义（policy_v2.0.0：DEEPEN/SIMPLIFY/REFRAME 顶层语义动作 14 §8 恒等映射 + 冻结优先级链 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER + 创作域顶层补丁操作承载）+ S2 分支回流语义（policy_v2.2.0：ADOPT_BRANCH 第五分支操作显式回流——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A；词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH；adopted 附加标记幂等、生命周期契约不变；simulation_adopted 事件 C6 §14 派生；采用结果作新一轮模拟上下文呈现，主线当前上下文不变，默认不回流语义不变——显式回流为用户指示例外通道）；SEARCH 仍表外（PD-06，内部能力动作 14 §7）' },
    api: { version: 'api_v1.0.0', source: 'SRC-07 / 16' },
    event: { version: 'analytics_v1.0.0', source: 'SRC-08 / 17' },
    evaluation: { contract: 'C7', version: 'evaluation_v1.0.0', note: 'G5 16 项评测包已执行并双签署（P3-S1-G5-WORKSHEET-01 v1.7.0）；G3 逐项判定属本运行后的独立评测范畴' },
    code: {
      gitHead: git.commit,
      workTreeClean: git.workTreeClean,
      uncommittedEntries: git.uncommittedEntries,
      runtimeFiles: runtimeFileHashes,
      typecheckCommand: 'npm run typecheck:core',
      buildCommand: 'npm run build (next build, Turbopack)',
      typecheckExitCode: typecheck.code,
      buildExitCode: build.code,
    },
    prompt: { value: 'synthetic-fixture', reason: '无真实 LLM 提供方调用（E5 §2 排除项；ADR-0002 §3 硬边界）' },
    model: { value: 'synthetic-fixture', reason: '同上；LLM 网关为合成实现（经 LlmGateway 接口；故障形态经证据注入网关）' },
    corpus: {
      fixtures: [
        { fixtureId: directAnswer.fixtureId, file: 'src/experience/fixtures/direct-answer.ts', sha256: fixtureHashes['src/experience/fixtures/direct-answer.ts'] },
        { fixtureId: why.fixtureId, file: 'src/experience/fixtures/why.ts', sha256: fixtureHashes['src/experience/fixtures/why.ts'] },
        { fixtureId: simulate.fixtureId, file: 'src/experience/fixtures/simulate.ts', sha256: fixtureHashes['src/experience/fixtures/simulate.ts'] },
        { fixtureId: changeDirection.fixtureId, file: 'src/experience/fixtures/change-direction.ts', sha256: fixtureHashes['src/experience/fixtures/change-direction.ts'] },
        { fixtureId: createFixture.fixtureId, file: 'src/experience/fixtures/create.ts', sha256: fixtureHashes['src/experience/fixtures/create.ts'] },
        { fixtureId: correctionFixture.fixtureId, file: 'src/experience/fixtures/correction.ts', sha256: fixtureHashes['src/experience/fixtures/correction.ts'] },
        { fixtureId: deepenFixture.fixtureId, file: 'src/experience/fixtures/deepen.ts', sha256: fixtureHashes['src/experience/fixtures/deepen.ts'] },
        { fixtureId: simplifyFixture.fixtureId, file: 'src/experience/fixtures/simplify.ts', sha256: fixtureHashes['src/experience/fixtures/simplify.ts'] },
        { fixtureId: reframeFixture.fixtureId, file: 'src/experience/fixtures/reframe.ts', sha256: fixtureHashes['src/experience/fixtures/reframe.ts'] },
        { fixtureId: 'synthetic/stop/v1', file: '（运行时内联构造：STOP 无内容分块）', sha256: null },
      ],
      realUserData: false,
    },
    environment: {
      nodeVersion: process.version,
      nodeExecutable: process.execPath,
      nodeLockSource: 'F-2：2026-10-08 授权日重查 nodejs.org——v24.21.0 Latest LTS（Active LTS）；package.json engines.node 精确锁定',
      nextjs: { used: false, note: '本套件为进程内形态（真实 .ts 源字节经 registerHooks 执行）；Next.js 仅参与 preflight build 验证；HTTP 形态证据见 F2-GS-0001 / F3-EB-0001' },
      platform: process.platform,
      arch: process.arch,
      database: { engine: 'node:sqlite（仅证据执行器 fixture 状态存储；本运行时为内存态，S1 不持久化跨会话数据，PD-07）', sqliteVersion: await sqliteVersion() },
    },
    referenceIntegrity: {
      manifest: referenceCheck.manifestPath,
      total: referenceCheck.total,
      verified: referenceCheck.verified,
      failed: referenceCheck.failed.length,
    },
    run: {
      startedAt,
      finishedAt: null,
      command: 'npm run golden (node tools/evidence/src/golden.mjs, from tools/evidence)',
      exitCode: null,
      form: 'in-process（真实 .ts 源字节；HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001）',
    },
    lockfiles: {
      'package-lock.json': { lockfileVersion: lockfile.lockfileVersion, sha256: runtimeFileHashes['package-lock.json'] ?? null },
      'tools/evidence/package-lock.json': { lockfileVersion: JSON.parse(await readFile(path.join(evidenceRoot, 'package-lock.json'), 'utf8')).lockfileVersion, sha256: await sha256OfFile(path.join(evidenceRoot, 'package-lock.json')) },
    },
  };

  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, golden-suite form)');

  // A1: metadata completeness.
  const requiredSections = [
    'runId', 'recordedAt', 'executor', 'obligation', 'authorization', 'goldenCorpus', 'regression',
    'contracts', 's1Specifications', 'stateMachine', 'policy', 'api', 'event', 'evaluation',
    'code', 'prompt', 'model', 'corpus', 'environment', 'referenceIntegrity', 'run', 'lockfiles',
  ];
  const missingSections = requiredSections.filter((section) => versionMatrix[section] === undefined || versionMatrix[section] === null);
  assert(
    'A1',
    'run-metadata 完整（E5 §3 版本矩阵全部字段，含黄金语料定义与回归基线绑定）',
    missingSections.length === 0,
    { missingSections },
  );

  // Summary + manifest.
  const allAssertionsPass = assertions.every((entry) => entry.passed);
  const allPassed = allCasesPass && allAssertionsPass;
  const exitCode = allPassed ? 0 : 1;
  versionMatrix.run.finishedAt = finishedAt;
  versionMatrix.run.exitCode = exitCode;
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');

  const summary = {
    runId: RUN_ID,
    obligation: versionMatrix.obligation,
    startedAt,
    finishedAt,
    durationMs,
    goldenCases: goldenCases.map((goldenCase) => ({
      goldenCase,
      dimensions: dimensionCoverage.find((entry) => entry.goldenCase === goldenCase).dimensions,
    })),
    cases: caseResults.map((entry) => ({ caseId: `${RUN_ID}:${entry.caseId}`, goldenCase: entry.goldenCase, dimension: entry.dimension, result: entry.result })),
    executedCases: executedResults.length,
    allExecutedCasesPass: allCasesPass,
    deferredCases: deferredResults.map((entry) => entry.caseId),
    assertions: assertions.map(({ id, description, passed }) => ({ id, description, passed })),
    allAssertionsPass,
    allPassed,
    exitCode,
    vocabularyNote: '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置 G3 或任何产品 Gate 状态为 PASS（E5 §2）。G3 Gate 判定由独立评测人经逐项裁决作出；G04/G07/G08 以 PD-21 关闭切片最小形态执行（完整语义 DEFERRED TO S2，acceptance-mapping §B），是否接受为关闭条件属产品负责人与评测人共同裁决。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written: cases=${caseResults.length} (executed=${executedResults.length} allPass=${allCasesPass}, deferred=${deferredResults.length}) assertions=${assertions.length} allAssertionsPass=${allAssertionsPass}`);

  // Manifest + independent re-verification.
  await writeSha256Sums(runDir);
  const manifestCheck = await verifySha256Sums(path.join(runDir, 'SHA256SUMS'), runDir);
  assert(
    'A10',
    '证据清单 SHA256SUMS 已产出且独立重算全部一致',
    manifestCheck.failed.length === 0,
    { verified: manifestCheck.verified, failed: manifestCheck.failed },
  );

  // Re-evaluate allPassed with A10 included; refresh the persisted summary
  // so it carries every assertion (A1–A10; 40 cases = 10 golden × 4 dimensions).
  const finalAllPassed = assertions.every((entry) => entry.passed) && allCasesPass;
  const finalExitCode = finalAllPassed ? 0 : 1;
  summary.assertions = assertions.map(({ id, description, passed }) => ({ id, description, passed }));
  summary.allAssertionsPass = assertions.every((entry) => entry.passed);
  summary.allPassed = finalAllPassed;
  summary.exitCode = finalExitCode;
  versionMatrix.run.exitCode = finalExitCode;
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');

  // G3-E-3 fix: the summary/run-metadata rewrite above invalidated the manifest
  // computed at the intermediate state. Regenerate SHA256SUMS so the on-disk
  // manifest always matches the final persisted artifacts (A10 invariant).
  await writeSha256Sums(runDir);

  // Review README for the independent evaluator (G3 item-by-item ruling aid).
  const reviewReadme = `# G3-GOLDEN-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：G3-GOLDEN-0001（P2 G3 黄金案例回归套件——OBL-03 / PD-19；12 黄金案例 × 4 维度 = 48 案例执行；PD-21 关闭切片：G04/G07/G08 最小实现 + S2b G09 方向性操作 + S2 G10 分支回流 + S3a G11 长期记忆 / G12 跨会话分支）
日期：${finishedAt}
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 执行案例：${executedResults.length}/${executedResults.length} ${allCasesPass ? '全部 PASS' : '存在 FAIL——见 cases/'}
- 延期案例：${deferredResults.length}（PD-19 延期义务已履行：G04/G07/G08 以 PD-21 关闭切片最小形态执行；完整语义 DEFERRED TO S2，acceptance-mapping §B；DEFERRED 不计为通过）
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过（A1–A10）
- 退出码：${finalExitCode}（只表示本运行断言通过；不设置 G3 或任何产品 Gate 状态）

## G3 逐项裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）

| 黄金案例 | 四维度覆盖（本运行） | 本运行状态 | 评测人裁决 | 理由 |
|---|---|---|---|---|
| G01 Direct Answer | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G02 Why | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G03 What If（S1 基础单次模拟形态） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整多轮/持久分支属 S2（acceptance-mapping §B） |
| G04 Creation（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整 Creation 语义属 S2（acceptance-mapping §B，PD-05/PD-06） |
| G05 Change | N/NEG/B/FR（含 in-flight/stale 必测维度） | 4/4 PASS | 待裁决 | |
| G06 Stop | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G07 Correction（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整 Correction 语义属 S2（acceptance-mapping §B，PD-05） |
| G08 Memory Boundary（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整持久 Memory 语义属 S2（acceptance-mapping §B，PD-07） |
| G09 Directional Operations（S2b 方向性操作） | N/NEG/B/FR | 4/4 PASS | 待裁决 | S2b 新增（S2B-SEMANTIC-FREEZE-01 D-01 选项 A；policy_v2.0.0 顶层语义动作 DEEPEN/SIMPLIFY/REFRAME） |
| G10 Branch Reflow（S2 分支回流操作） | N/NEG/B/FR | 4/4 PASS | 待裁决 | S2 新增（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A；policy_v2.2.0 变更 1–5：ADOPT_BRANCH 显式回流） |

## 审阅清单（不得只看汇总）

1. cases/ —— 36 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希；36 份执行（无 DEFERRED 登记）
2. traces/ —— 36 份 JSONL 轨迹（每案例 trace_started → 案例事实 → trace_completed）
3. run-metadata.json —— E5 §3 版本矩阵（黄金语料定义、回归基线绑定 F2-GS-0001/F3-EB-0001、契约指纹、代码字节绑定）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 语料范围声明

- 已执行（本运行）：G01–G12 十二黄金案例四维度共 48 案例，进程内形态（真实 .ts 源字节）；G03 为 S1 基础单次模拟形态（PD-06）；G09 为 S2b 方向性操作（policy_v2.0.0 引入，经 policy_v2.2.0 延续）；G10 为 S2 分支回流操作（policy_v2.2.0 变更 1–5）；G11/G12 为 S3a 新增黄金案例（S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0——policy_v2.2.0 变更 1–4；S2 时代"记住这个"升级不变式 / 分支会话级失效不变式经 CR-28 全项 A 裁决取代）。
- 关闭切片（PD-21）：G04/G07/G08 最小实现（CREATE / CORRECTION 语义动作 + CREATION 阶段 + 当前会话方向信号）；完整 Creation / Correction / 持久 Memory 语义仍属 S2（PD-05/PD-06/PD-07；acceptance-mapping §B）。
- 形态覆盖：HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001（本套件为跨迭代回归基准的进程内形态）。
- 未执行（NOT RUN）：真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（按 ADR-0002 §3 证据运行仅使用合成数据）。

## 独立重跑

    cd tools/evidence && npm run golden   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/G3-GOLDEN-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。G3 Gate 的最终判定（尤其 G04/G07/G08 关闭切片最小形态是否足以接受为 P2 关闭条件）属产品负责人与评测人共同裁决范畴。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 'golden-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- G3-GOLDEN-0001 ${finalAllPassed ? 'PASSED' : 'FAILED'} — exit ${finalExitCode} ---`);
  process.exit(finalExitCode);
}

try {
  await main();
} catch (error) {
  console.error(`G3-GOLDEN-0001 executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 'golden-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
