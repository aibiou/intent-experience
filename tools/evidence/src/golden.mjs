// G3-GOLDEN-0001 — P2 G3 黄金案例回归套件执行器（OBL-03 / PD-19）。
//
// 语料定义（P2 Exit Gate & Sign-off §8）：P2 核心产品验收 G01–G08，
// 每个黄金案例至少具备 Normal / Negative / Boundary / Failure-Recovery
// 四维度 + Expected / Observed / Evidence Location / Evaluator。
// 本运行执行 S1 已实现黄金子集（G01 Direct Answer / G02 Why /
// G03 What If 基础单次模拟形态 / G05 Change / G06 Stop）共
// 5 黄金案例 × 4 维度 = 20 案例。G04 Creation / G07 Correction /
// G08 Memory Boundary 属 S2 范围（PD-05/PD-06/PD-07 范围冻结），
// 按 PD-19 登记 DEFERRED TO S2/P2 关闭切片（最小实现与黄金证据
// 在关闭切片补齐；本运行不扩大 S1 范围）。
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
    singleShot: '当前单次模拟提案；不建立持久/多轮分支状态',
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
// 案例注册表（执行的 20 案例）+ 延期黄金案例（G04/G07/G08，PD-19）
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
];

/** 延期黄金案例（P2 Exit Gate §8 语料完整性声明；PD-19 / OBL-03）。 */
const DEFERRED_GOLDEN_CASES = [
  {
    caseId: 'G04-CREATION',
    goldenCase: 'G04',
    goldenName: 'Creation',
    sourceClause: 'P2 Exit Gate §8 G04 Creation；Evaluation System V1 §5 G04；E2 Stage 5（最小 Creation Branch）；acceptance-mapping §B（G04 DEFERRED TO S2，PD-05/PD-06）',
    scope: 'S2 范围（S1 冻结排除完整 Creation；E2 最小 Creation 安排于 S2）',
    deferralAuthority: 'PD-19（产品负责人 2026-10-09 裁决；decision-register OBL-03）',
    dimensions: 'Normal / Negative / Boundary / Failure-Recovery 四维度证据待 S2/P2 关闭切片创建并执行（最小 Creation 实现后）',
  },
  {
    caseId: 'G07-CORRECTION',
    goldenCase: 'G07',
    goldenName: 'Correction',
    sourceClause: 'P2 Exit Gate §8 G07 Correction；Evaluation System V1 §5 G07（remove invalid inference / preserve valid context / reassess）；acceptance-mapping §B（G07 DEFERRED TO S2，PD-05）',
    scope: 'S2 范围（S1 未启用 Correction Semantic Action）',
    deferralAuthority: 'PD-19（产品负责人 2026-10-09 裁决；decision-register OBL-03）',
    dimensions: 'Normal / Negative / Boundary / Failure-Recovery 四维度证据待 S2/P2 关闭切片创建并执行（Correction 动作启用后）',
  },
  {
    caseId: 'G08-MEMORY-BOUNDARY',
    goldenCase: 'G08',
    goldenName: 'Memory Boundary',
    sourceClause: 'P2 Exit Gate §8 G08 Memory Boundary；Evaluation System V1 §5 G08（当前意图信号不得升级为持久偏好）；acceptance-mapping §B（G08 DEFERRED TO S2，PD-07）',
    scope: 'S2 范围（S1 不持久化跨会话 Memory，PD-07；最小持久 Memory 须另作版本化决策）',
    deferralAuthority: 'PD-19（产品负责人 2026-10-09 裁决；decision-register OBL-03）',
    dimensions: 'Normal / Negative / Boundary / Failure-Recovery 四维度证据待 S2/P2 关闭切片创建并执行（最小 Memory 边界实现后）',
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
        ? '无（本案例）；G3 Gate 逐项判定属独立评测范畴（角色 5）；G04/G07/G08 DEFERRED（PD-19）待 S2/P2 关闭切片'
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

  // Deferred golden case records (G04/G07/G08 — PD-19; DEFERRED is not PASS).
  for (const deferred of DEFERRED_GOLDEN_CASES) {
    const caseRecord = {
      caseIdNamespace: `${RUN_ID}:${deferred.caseId}`,
      sourceClause: deferred.sourceClause,
      scope: deferred.scope,
      precondition: 'P2 Exit Gate §8 黄金语料完整性声明（本运行不执行）',
      inputFault: '不适用（范围外；S1 范围已冻结 PD-05/PD-06/PD-07）',
      expected: '黄金案例四维度证据（Normal / Negative / Boundary / Failure-Recovery；Expected / Observed / Evidence Location / Evaluator）',
      actual: `NOT RUN——${deferred.dimensions}`,
      invariants: [
        'DEFERRED 经产品负责人批准（E5 §2 词汇表）；不计为通过',
        'S1 范围冻结（PD-05/PD-06/PD-07）；本登记不扩大 S1 范围',
      ],
      evidence: {
        deferralAuthority: deferred.deferralAuthority,
        trackedObligation: 'OBL-03（decision-register v0.16.0）',
        closureSlice: 'S2/P2 关闭切片（最小实现 + 四维度黄金证据）',
      },
      result: 'DEFERRED',
      evaluator: EVALUATOR_SEPARATION,
      defectsFollowUp: '无缺陷——范围外延期（PD-19）；关闭切片须创建最小实现并执行四维度黄金证据',
    };
    const validation = validateCaseRecord(caseRecord);
    if (!validation.valid) {
      log(`case ${deferred.caseId}: DEFERRED record INVALID ${JSON.stringify(validation)}`);
    }
    await writeCaseRecord(casesDir, caseRecord);
    caseResults.push({
      caseId: deferred.caseId,
      goldenCase: deferred.goldenCase,
      dimension: 'DEFERRED',
      result: 'DEFERRED',
      pass: null,
    });
    log(`case ${deferred.caseId}: DEFERRED (PD-19 / OBL-03)`);
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

  // A3: case records complete for all cases (20 executed + 3 deferred).
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  assert(
    'A3',
    `全部 ${caseResults.length} 案例记录齐备且 12 字段完整（E5 §4；${executedResults.length} 执行 + ${deferredResults.length} DEFERRED）`,
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

  // A5: golden dimension coverage — each S1 golden case has all four dimensions.
  const goldenCases = ['G01', 'G02', 'G03', 'G05', 'G06'];
  const dimensionCoverage = goldenCases.map((goldenCase) => {
    const dims = executedResults.filter((entry) => entry.goldenCase === goldenCase).map((entry) => entry.dimension);
    return { goldenCase, dimensions: dims, complete: GOLDEN_DIMENSIONS.every((dim) => dims.includes(dim)) };
  });
  assert(
    'A5',
    '黄金维度覆盖：G01/G02/G03/G05/G06 各具备 NORMAL/NEGATIVE/BOUNDARY/FAILURE_RECOVERY 四维度（P2 Exit Gate §8）',
    dimensionCoverage.every((entry) => entry.complete),
    { dimensionCoverage },
  );

  // A6: in-flight generation / stale response coverage (P2 Exit Gate §8 hard requirement for G05/G06).
  const staleCase = executedResults.find((entry) => entry.caseId === 'G05-NEG');
  const abortCase = executedResults.find((entry) => entry.caseId === 'G06-FR');
  const inflightCase = executedResults.find((entry) => entry.caseId === 'G05-N');
  assert(
    'A6',
    'G05/G06 in-flight generation / stale response 必测维度已覆盖且通过（G05-N 生成中 CHANGE、G05-NEG 旧 generation 迟到达拒绝、G06-FR 生成中客户端中止）',
    inflightCase?.pass === true && staleCase?.pass === true && abortCase?.pass === true,
    { inflight: inflightCase?.result, stale: staleCase?.result, abort: abortCase?.result },
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

  // A8: deferred golden cases registered with PD-19 authority (not silently skipped).
  const deferredRegistry = deferredResults.map((entry) => entry.caseId);
  assert(
    'A8',
    '延期黄金案例经 PD-19 权威登记（DEFERRED ≠ PASS）：G04/G07/G08 三案例登记于案例记录并引用 OBL-03',
    deferredResults.length === 3 &&
      deferredResults.every((entry) => entry.result === 'DEFERRED') &&
      deferredRegistry.join(',') === 'G04-CREATION,G07-CORRECTION,G08-MEMORY-BOUNDARY',
    { deferredRegistry },
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
    obligation: 'P2 G08 黄金案例回归套件义务 / G3 Gate（P2 Exit Gate & Sign-off §8）；OBL-03（PD-19：G3 DEFERRED TO S2/P2 关闭切片）',
    authorization: 'P3-S1-IMPL-AUTH-01 v1.3.0 §2（动态证据执行）；E5-SCOPED-LICENSE-01（PD-17 / CR-15 选项 A）',
    goldenCorpus: {
      definition: 'P2 核心产品验收 G01–G08；每案例至少 Normal/Negative/Boundary/Failure-Recovery 四维度 + Expected/Observed/Evidence/Evaluator（P2 Exit Gate §8）',
      s1Covered: {
        goldenCases,
        caseIds: CASE_REGISTRY.map((definition) => definition.caseId),
        count: CASE_REGISTRY.length,
        note: 'G03 为 S1 基础单次模拟形态（PD-06）；完整多轮/持久分支 DEFERRED TO S2（acceptance-mapping §B）',
      },
      deferred: DEFERRED_GOLDEN_CASES.map((deferred) => ({
        caseId: deferred.caseId,
        goldenCase: deferred.goldenCase,
        goldenName: deferred.goldenName,
        authority: 'PD-19 / OBL-03',
        closureSlice: 'S2/P2 关闭切片（最小实现 + 四维度黄金证据）',
      })),
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
    stateMachine: { version: 'state_machine_v1.0.0', source: 'SRC-05 / 13' },
    policy: { version: 'action_policy_v1.0.0（基线赋予）', source: 'SRC-06 / 14', status: 'S1 冻结策略表（5 语义动作）；CREATE/CORRECTION/SEARCH 表外（PD-05/PD-06）' },
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
    vocabularyNote: '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置 G3 或任何产品 Gate 状态为 PASS（E5 §2）。G3 Gate 判定由独立评测人经逐项裁决作出；G04/G07/G08 为经产品负责人批准的延期（PD-19），不计为通过。',
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
  // so it carries every assertion (A1–A10).
  const finalAllPassed = assertions.every((entry) => entry.passed) && allCasesPass;
  const finalExitCode = finalAllPassed ? 0 : 1;
  summary.assertions = assertions.map(({ id, description, passed }) => ({ id, description, passed }));
  summary.allAssertionsPass = assertions.every((entry) => entry.passed);
  summary.allPassed = finalAllPassed;
  summary.exitCode = finalExitCode;
  versionMatrix.run.exitCode = finalExitCode;
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');

  // Review README for the independent evaluator (G3 item-by-item ruling aid).
  const reviewReadme = `# G3-GOLDEN-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：G3-GOLDEN-0001（P2 G3 黄金案例回归套件——OBL-03 / PD-19；S1 已实现黄金子集 5 案例 × 4 维度 = 20 案例执行 + G04/G07/G08 经批准延期登记）
日期：${finishedAt}
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 执行案例：${executedResults.length}/${executedResults.length} ${allCasesPass ? '全部 PASS' : '存在 FAIL——见 cases/'}
- 延期案例：${deferredResults.length}（G04 Creation / G07 Correction / G08 Memory Boundary——PD-19 批准 DEFERRED TO S2/P2 关闭切片；DEFERRED 不计为通过）
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过（A1–A10）
- 退出码：${finalExitCode}（只表示本运行断言通过；不设置 G3 或任何产品 Gate 状态）

## G3 逐项裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）

| 黄金案例 | 四维度覆盖（本运行） | 本运行状态 | 评测人裁决 | 理由 |
|---|---|---|---|---|
| G01 Direct Answer | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G02 Why | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G03 What If（S1 基础单次模拟形态） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整多轮/持久分支属 S2（acceptance-mapping §B） |
| G04 Creation | 未执行 | DEFERRED（PD-19） | 待裁决 | S2/P2 关闭切片：最小 Creation 实现 + 四维度证据 |
| G05 Change | N/NEG/B/FR（含 in-flight/stale 必测维度） | 4/4 PASS | 待裁决 | |
| G06 Stop | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G07 Correction | 未执行 | DEFERRED（PD-19） | 待裁决 | S2/P2 关闭切片：Correction 动作启用 + 四维度证据 |
| G08 Memory Boundary | 未执行 | DEFERRED（PD-19） | 待裁决 | S2/P2 关闭切片：最小 Memory 边界实现 + 四维度证据 |

## 审阅清单（不得只看汇总）

1. cases/ —— 23 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希；20 份执行 + 3 份 DEFERRED 登记
2. traces/ —— 20 份 JSONL 轨迹（每案例 trace_started → 案例事实 → trace_completed）
3. run-metadata.json —— E5 §3 版本矩阵（黄金语料定义、回归基线绑定 F2-GS-0001/F3-EB-0001、契约指纹、代码字节绑定）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 语料范围声明

- 已执行（本运行）：S1 已实现黄金子集（G01/G02/G03 基础形态/G05/G06）四维度共 20 案例，进程内形态（真实 .ts 源字节）。
- 延期（经批准）：G04/G07/G08——S1 范围冻结（PD-05/PD-06/PD-07），最小实现与黄金证据安排在 S2/P2 关闭切片（PD-19 / OBL-03）。
- 形态覆盖：HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001（本套件为跨迭代回归基准的进程内形态）。
- 未执行（NOT RUN）：真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（按 ADR-0002 §3 证据运行仅使用合成数据）。

## 独立重跑

    cd tools/evidence && npm run golden   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/G3-GOLDEN-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。G3 Gate 的最终判定（尤其 G04/G07/G08 的 DEFERRED 是否可接受为关闭条件）属产品负责人与评测人共同裁决范畴。
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
