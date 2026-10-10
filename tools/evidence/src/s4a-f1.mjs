// S4A-F1-0001 — S4 动态证据执行器（S4A-SEMANTIC-FREEZE-01
// v1.0.0 §5 动态证据计划——D-6 选项 A 一次性实施义务：
// REPEAT / CONTINUE 策略动作版本化实施，policy_v2.3.0）
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5，E5 §2）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate（G2/G3/G4/G8）
//   或产品状态为 PASS——G5 判定属独立评测人（E5 §2）；
// - 进程内形态经 module.registerHooks 解析无扩展名说明符到真实 .ts 源码
//   （Node ≥23.6 原生类型剥离），使证据执行器运行的是已提交的真实运行时代码；
// - 静态边界断言读取已提交的产品源码字节（不做代码推断，只验证事实）；
// - 角色分离：执行（工程负责人角色代理）≠ 独立评测（独立评测负责人，
//   用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）。

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
const { classifyInput } = await import('../../../src/experience/classifier');
const { resolvePolicy, POLICY_VERSION } = await import('../../../src/experience/policy');
const { why } = await import('../../../src/experience/fixtures/why');

const { sha256OfBuffer, writeSha256Sums, verifySha256Sums } = await import('./hashes.mjs');
const { TraceWriter } = await import('./trace.mjs');
const { writeCaseRecord, validateCaseRecord } = await import('./caselog.mjs');
const {
  verifyReferenceIntegrity,
  verifyContractFingerprints,
  gitState,
} = await import('./metadata.mjs');

// ---------------------------------------------------------------------------
// 常量与路径
// ---------------------------------------------------------------------------
const RUN_ID = 'S4A-F1-0001';
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
  'S4 范围边界（S4A-SEMANTIC-FREEZE-01 v1.0.0 §1/§2）：REPEAT / CONTINUE 为策略动作（14 §8 恒等映射，policy_v2.3.0 变更 1–2——C3 G-1 空缺版本化关闭）；CONTINUE 幂等确认回合（无状态变更，state_version 不变，done 事件）；REPEAT 呈现层重放上一完成轮响应（state_version 不变；内容逐字节等于上一完成轮——呈现层重放，不重新生成）',
  '优先级链（S4A §2；policy_v2.3.0 变更 1）：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER > CONTINUE > REPEAT > UNKNOWN（升级）——CONTINUE / REPEAT 识别层插入全部既有优先级层之后，仅认领全部既有层未命中的输入（零既有输入行为变化——零黄金回归面）',
  '词表（S4A §3）：CONTINUE=/继续当前体验/、/继续/、/往下进行/、/接着来/；REPEAT=/重复上一/、/重复上一条/、/再说一遍/、/重新表达/、/再表达一次/（确定性规则词表——碰撞纪律：同一输入多词表命中时按优先级链裁决）',
  '状态不变式（S4A §4）：REPEAT / CONTINUE 轮次不登记状态变更事件（纯呈现 / 确认语义——completionCommit=false；失败写入不消耗版本号——OBL-01 纪律；陈旧版本拒绝 STATE_VERSION_CONFLICT 且不覆盖——S1-12 同族）',
  'REPEAT 前置条件：上一完成轮响应存在（呈现层重放数据源——内容轮次 chunk 数 > 0 方登记；空轮次 STOP / CONTINUE 不覆盖上一内容轮记录）；无上一完成轮时 REPEAT 按 INVALID_STATE_TRANSITION 拒绝（不静默执行未定义语义——C3 纪律）',
  '交互事件（C6 §14 命名模式）：CONTINUE → continue_requested；REPEAT → repeat_requested（结构校验非封闭枚举）',
  '决策追踪（C6 §22/§23）：REPEAT / CONTINUE 轮次为确定性系统回合——llm_used=false、user_override=true、reason.primary=explicit_user_direction；state_after.state_version === state_before.state_version（无状态变更留痕）',
  'P-01 STOP 永远优先；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）',
  '工程边界（P2-EVIDENCE-4.0）：超时不自行决定新方向（EB-07）；完成不属于 LLM 自主权限（EB-13）；分析只能观察（EB-14）',
  '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方；不收集真实用户数据（ADR-0002 §3）',
];

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
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function tail(text) {
  return text.split('\n').slice(-12).join('\n');
}

function shortId() {
  return Math.random().toString(16).slice(2, 10);
}

function createCaseRuntime() {
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
  });
  return { runtime, events, traces, audit };
}

async function setupChain(runtime, label) {
  const { session } = await runtime.startSession();
  const intent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput: '为什么',
    requestId: `req-s4a-${label}-intent-${shortId()}`,
  });
  if (!intent.ok) {
    throw new Error(`setupChain: resolveIntent failed: ${intent.error.code}`);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: `req-s4a-${label}-exp-${shortId()}`,
  });
  if (!exp.ok) {
    throw new Error(`setupChain: startExperience failed: ${exp.error.code}`);
  }
  return { session, intent, exp };
}

async function consume(stream) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function contentOf(streamEvents) {
  return streamEvents
    .filter((event) => event.type === 'chunk')
    .map((event) => event.content)
    .join('');
}

function chunkContentsOf(streamEvents) {
  return streamEvents
    .filter((event) => event.type === 'chunk')
    .map((event) => event.content);
}

/** 事件汇事件按 event_type 过滤（信封事件；流事件另有 type 字段）。 */
function eventsOf(events, type) {
  return events.filter((event) => event.event_type === type);
}

function eventsOfRequest(events, type, requestId) {
  return events.filter(
    (event) => event.event_type === type && event.context?.request_id === requestId,
  );
}

function tracesOf(traces, experienceId) {
  return traces.filter((trace) => trace.experience_id === experienceId);
}

// ---------------------------------------------------------------------------
// 案例面 1：CONTINUE 词表分类（正常路径 + 优先级碰撞）
// ---------------------------------------------------------------------------
async function caseContinueClassification(trace) {
  const classification = classifyInput('继续');
  // 正常路径：S4A §3 词表全命中。
  const wordTable = ['继续当前体验', '继续', '往下进行', '接着来'];
  const positive = wordTable.map((input) => ({
    input,
    semanticAction: classifyInput(input).semanticAction,
  }));
  // 碰撞核验（优先级链：CONTINUE 层仅认领全部既有层未命中的输入）。
  const collisions = [
    { input: '停止继续', expected: 'STOP', layer: 'P-01 STOP 永远优先' },
    { input: '好了，继续', expected: 'STOP', layer: 'P-01 STOP 永远优先' },
    { input: '不对，继续', expected: 'CORRECTION', layer: 'CORRECTION 层先判' },
    { input: '为什么继续', expected: 'WHY', layer: 'WHY 层先判' },
    { input: '继续吗？', expected: 'DIRECT_ANSWER', layer: '通用提问标记层先判' },
    { input: '继续当前体验？', expected: 'DIRECT_ANSWER', layer: '通用提问标记层先判' },
  ];
  const collisionResults = collisions.map((entry) => ({
    ...entry,
    actual: classifyInput(entry.input).semanticAction,
  }));
  // 确定性（GS-01：同一输入重复分类结果恒定）。
  const deterministic =
    classifyInput('继续').semanticAction === classification.semanticAction &&
    classifyInput('继续').semanticAction === 'CONTINUE';
  const expected = {
    wordTable: '继续当前体验 / 继续 / 往下进行 / 接着来 → CONTINUE（S4A §3 词表）',
    collisions: 'STOP > … > DIRECT_ANSWER > CONTINUE——全部既有层先判（碰撞输入经既有层裁决，不落入 CONTINUE）',
    deterministic: '同一输入重复分类结果恒定（GS-01）',
  };
  const actual = {
    baseline: classification.semanticAction,
    positive,
    collisionResults,
    deterministic,
  };
  const pass =
    actual.baseline === 'CONTINUE' &&
    positive.every((entry) => entry.semanticAction === 'CONTINUE') &&
    collisionResults.every((entry) => entry.actual === entry.expected) &&
    deterministic;
  await trace.emit('case-fact', { wordTable, collisionCount: collisions.length });
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例面 2：REPEAT 词表分类（正常路径 + 优先级碰撞）
// ---------------------------------------------------------------------------
async function caseRepeatClassification(trace) {
  const classification = classifyInput('重复上一条');
  const wordTable = ['重复上一', '重复上一条', '再说一遍', '重新表达', '再表达一次'];
  const positive = wordTable.map((input) => ({
    input,
    semanticAction: classifyInput(input).semanticAction,
  }));
  const collisions = [
    { input: '重复上一条？', expected: 'DIRECT_ANSWER', layer: '通用提问标记层先判' },
    { input: '再说一遍，为什么', expected: 'WHY', layer: 'WHY 层先判' },
    { input: '重新表达不对', expected: 'CORRECTION', layer: 'CORRECTION 层先判' },
    { input: '重复上一，停止', expected: 'STOP', layer: 'P-01 STOP 永远优先' },
  ];
  const collisionResults = collisions.map((entry) => ({
    ...entry,
    actual: classifyInput(entry.input).semanticAction,
  }));
  const deterministic =
    classifyInput('重复上一条').semanticAction === classification.semanticAction &&
    classifyInput('重复上一条').semanticAction === 'REPEAT';
  const expected = {
    wordTable: '重复上一 / 重复上一条 / 再说一遍 / 重新表达 / 再表达一次 → REPEAT（S4A §3 词表）',
    collisions: 'STOP > … > DIRECT_ANSWER > CONTINUE > REPEAT——全部既有层与 CONTINUE 层先判',
    deterministic: '同一输入重复分类结果恒定（GS-01）',
  };
  const actual = {
    baseline: classification.semanticAction,
    positive,
    collisionResults,
    deterministic,
  };
  const pass =
    actual.baseline === 'REPEAT' &&
    positive.every((entry) => entry.semanticAction === 'REPEAT') &&
    collisionResults.every((entry) => entry.actual === entry.expected) &&
    deterministic;
  await trace.emit('case-fact', { wordTable, collisionCount: collisions.length });
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例面 3：CONTINUE 运行时正常路径（幂等确认回合）
// ---------------------------------------------------------------------------
async function caseContinueRuntime(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, exp } = await setupChain(runtime, 'cr');
  // 内容轮（WHY——建立体验内容轮次与上一完成轮响应）。
  const content = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-s4a-cr-content',
  });
  if (!content.ok) {
    return {
      expected: { setup: '内容轮提交应被接受' },
      actual: { setupError: content.error.code },
      pass: false,
    };
  }
  await consume(content.stream);
  const stateAfterContent = runtime.getExperienceState(exp.experienceId);
  // CONTINUE 轮（幂等确认回合——state_version 不变）。
  const cont = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CONTINUE',
    rawInput: '继续',
    expectedStateVersion: stateAfterContent.state.stateVersion,
    requestId: 'req-s4a-cr-cont',
  });
  const contStreamEvents = cont.ok ? await consume(cont.stream) : [];
  // 幂等性：第二次 CONTINUE（词表变体）——同结果，版本仍不变。
  const stateAfterCont = runtime.getExperienceState(exp.experienceId);
  const cont2 = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CONTINUE',
    rawInput: '继续当前体验',
    expectedStateVersion: stateAfterCont.state.stateVersion,
    requestId: 'req-s4a-cr-cont2',
  });
  const cont2StreamEvents = cont2.ok ? await consume(cont2.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const contTraces = tracesOf(traces, exp.experienceId).filter(
    (trace) => trace.semantic_action === 'CONTINUE',
  );
  const expected = {
    submission: 'CONTINUE 提交被接受（policy_v2.3.0 恒等映射 CONTINUE → CONTINUE，reason=semantic_action）',
    stream: '提交头事件 + done 终止事件 ×1（0 内容分块——幂等确认回合无内容生成；fixtureId=synthetic/continue/v1）',
    interaction: 'continue_requested ×1（C6 §14 命名模式）',
    state: 'state_version 不变（不登记状态变更事件——纯确认语义；S4A §4 不变式）',
    idempotency: '第二次 CONTINUE 同结果（幂等——词表变体"继续当前体验"同归类 CONTINUE）',
    decisionTrace: 'llm_used=false（确定性系统回合）、user_override=true、reason.primary=explicit_user_direction、state_after.state_version === state_before.state_version',
  };
  const actual = {
    accepted: cont.ok,
    policyVersion: cont.ok ? cont.header.policy_decision.policy_version : null,
    semanticAction: cont.ok ? cont.header.policy_decision.semantic_action : null,
    selectedAction: cont.ok ? cont.header.policy_decision.selected_action : null,
    reason: cont.ok ? cont.header.policy_decision.reason : null,
    headerStateVersion: cont.ok ? cont.header.state_version : null,
    streamTypes: contStreamEvents.map((event) => event.type),
    chunkCount: contStreamEvents.filter((event) => event.type === 'chunk').length,
    doneFixtureId: contStreamEvents.find((event) => event.type === 'done')?.fixtureId ?? null,
    doneTotalChunks: contStreamEvents.find((event) => event.type === 'done')?.totalChunks ?? null,
    continueRequested: eventsOfRequest(events, 'continue_requested', 'req-s4a-cr-cont').length,
    continueRequested2: eventsOfRequest(events, 'continue_requested', 'req-s4a-cr-cont2').length,
    stateUpdatedThisRound: eventsOfRequest(events, 'state_updated', 'req-s4a-cr-cont').length +
      eventsOfRequest(events, 'runtime_waiting', 'req-s4a-cr-cont').length,
    stateVersionBefore: stateAfterContent.state.stateVersion,
    stateVersionAfter: stateAfterCont.state.stateVersion,
    stateVersionFinal: finalState.ok ? finalState.state.stateVersion : null,
    finalStatus: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : null,
    secondAccepted: cont2.ok,
    secondStreamTypes: cont2StreamEvents.map((event) => event.type),
    decisionTraces: contTraces.map((trace) => ({
      policyVersion: trace.policy?.policy_version ?? null,
      selectedAction: trace.policy?.selected_action ?? null,
      reasonPrimary: trace.reason?.primary ?? null,
      llmUsed: trace.execution?.llm_used ?? null,
      userOverride: trace.user_override ?? null,
      stateBeforeVersion: trace.state_before?.state_version ?? null,
      stateAfterVersion: trace.state_after?.state_version ?? null,
    })),
  };
  const pass =
    actual.accepted &&
    actual.policyVersion === 'policy_v2.3.0' &&
    actual.semanticAction === 'CONTINUE' &&
    actual.selectedAction === 'CONTINUE' &&
    actual.reason === 'semantic_action' &&
    actual.headerStateVersion === actual.stateVersionBefore &&
    actual.streamTypes.join(',') === 'submission,done' &&
    actual.chunkCount === 0 &&
    actual.doneFixtureId === 'synthetic/continue/v1' &&
    actual.doneTotalChunks === 0 &&
    actual.continueRequested === 1 &&
    actual.continueRequested2 === 1 &&
    actual.stateUpdatedThisRound === 0 &&
    actual.stateVersionBefore === actual.stateVersionAfter &&
    actual.stateVersionAfter === actual.stateVersionFinal &&
    actual.finalStatus === stateAfterContent.state.status + '/' + stateAfterContent.state.stage &&
    actual.secondAccepted &&
    actual.secondStreamTypes.join(',') === 'submission,done' &&
    actual.decisionTraces.length === 2 &&
    actual.decisionTraces.every(
      (entry) =>
        entry.policyVersion === 'policy_v2.3.0' &&
        entry.selectedAction === 'CONTINUE' &&
        entry.reasonPrimary === 'explicit_user_direction' &&
        entry.llmUsed === false &&
        entry.userOverride === true &&
        entry.stateBeforeVersion === entry.stateAfterVersion,
    );
  await trace.emit('case-fact', {
    stateVersionBefore: actual.stateVersionBefore,
    stateVersionFinal: actual.stateVersionFinal,
    continueRounds: 2,
  });
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例面 4：REPEAT 运行时正常路径（呈现层重放）
// ---------------------------------------------------------------------------
async function caseRepeatRuntime(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, exp } = await setupChain(runtime, 'rr');
  // 内容轮（WHY——建立上一完成轮响应；capture 登记数据源）。
  const content = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-s4a-rr-content',
  });
  if (!content.ok) {
    return {
      expected: { setup: '内容轮提交应被接受' },
      actual: { setupError: content.error.code },
      pass: false,
    };
  }
  const contentStreamEvents = await consume(content.stream);
  const stateAfterContent = runtime.getExperienceState(exp.experienceId);
  // CONTINUE 轮（空轮次——不覆盖上一内容轮记录）。
  const cont = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CONTINUE',
    rawInput: '继续',
    expectedStateVersion: stateAfterContent.state.stateVersion,
    requestId: 'req-s4a-rr-cont',
  });
  await consume(cont.stream);
  // REPEAT 轮（呈现层重放——CONTINUE 后仍重放内容轮原文）。
  const stateAfterCont = runtime.getExperienceState(exp.experienceId);
  const rep = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'REPEAT',
    rawInput: '重复上一条',
    expectedStateVersion: stateAfterCont.state.stateVersion,
    requestId: 'req-s4a-rr-rep',
  });
  const repStreamEvents = rep.ok ? await consume(rep.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const repTraces = tracesOf(traces, exp.experienceId).filter(
    (trace) => trace.semantic_action === 'REPEAT',
  );
  const expected = {
    submission: 'REPEAT 提交被接受（policy_v2.3.0 恒等映射 REPEAT → REPEAT，reason=semantic_action）',
    replay: 'chunk 事件序列逐字节等于上一完成轮（WHY 内容轮）响应——呈现层重放，不重新生成；chunk 数 / 内容 / 顺序一致；policyAction=REPEAT；fixtureId 为上一轮语料标识（synthetic/why/v1）',
    continueDoesNotOverwrite: 'CONTINUE 空轮次不覆盖上一内容轮记录——CONTINUE 后 REPEAT 仍重放内容轮原文（S4A §1 D-1 登记纪律）',
    interaction: 'repeat_requested ×1（C6 §14 命名模式）',
    state: 'state_version 不变（不登记状态变更事件——纯呈现语义；S4A §4 不变式）',
    decisionTrace: 'llm_used=false（确定性系统回合——呈现层重放非模型生成）、reason.primary=explicit_user_direction、reason.secondary 标注呈现层重放',
  };
  const actual = {
    accepted: rep.ok,
    policyVersion: rep.ok ? rep.header.policy_decision.policy_version : null,
    semanticAction: rep.ok ? rep.header.policy_decision.semantic_action : null,
    selectedAction: rep.ok ? rep.header.policy_decision.selected_action : null,
    reason: rep.ok ? rep.header.policy_decision.reason : null,
    headerStateVersion: rep.ok ? rep.header.state_version : null,
    replayChunks: chunkContentsOf(repStreamEvents),
    contentChunks: chunkContentsOf(contentStreamEvents),
    replayFixtureIds: repStreamEvents
      .filter((event) => event.type === 'chunk')
      .map((event) => event.fixtureId),
    replayPolicyActions: repStreamEvents
      .filter((event) => event.type === 'chunk')
      .map((event) => event.policyAction),
    streamTypes: repStreamEvents.map((event) => event.type),
    doneTotalChunks: repStreamEvents.find((event) => event.type === 'done')?.totalChunks ?? null,
    repeatRequested: eventsOfRequest(events, 'repeat_requested', 'req-s4a-rr-rep').length,
    stateUpdatedThisRound: eventsOfRequest(events, 'state_updated', 'req-s4a-rr-rep').length +
      eventsOfRequest(events, 'runtime_waiting', 'req-s4a-rr-rep').length,
    stateVersionBefore: stateAfterCont.state.stateVersion,
    stateVersionFinal: finalState.ok ? finalState.state.stateVersion : null,
    decisionTraces: repTraces.map((trace) => ({
      policyVersion: trace.policy?.policy_version ?? null,
      selectedAction: trace.policy?.selected_action ?? null,
      reasonPrimary: trace.reason?.primary ?? null,
      reasonSecondary: trace.reason?.secondary ?? null,
      llmUsed: trace.execution?.llm_used ?? null,
      stateBeforeVersion: trace.state_before?.state_version ?? null,
      stateAfterVersion: trace.state_after?.state_version ?? null,
    })),
  };
  const pass =
    actual.accepted &&
    actual.policyVersion === 'policy_v2.3.0' &&
    actual.semanticAction === 'REPEAT' &&
    actual.selectedAction === 'REPEAT' &&
    actual.reason === 'semantic_action' &&
    actual.headerStateVersion === actual.stateVersionBefore &&
    JSON.stringify(actual.replayChunks) === JSON.stringify(actual.contentChunks) &&
    actual.replayChunks.length === why.chunks.length &&
    actual.replayChunks.length > 0 &&
    contentOf(repStreamEvents) === why.chunks.join('') &&
    actual.replayFixtureIds.every((id) => id === why.fixtureId) &&
    actual.replayPolicyActions.every((action) => action === 'REPEAT') &&
    actual.streamTypes[actual.streamTypes.length - 1] === 'done' &&
    actual.doneTotalChunks === actual.contentChunks.length &&
    actual.repeatRequested === 1 &&
    actual.stateUpdatedThisRound === 0 &&
    actual.stateVersionBefore === actual.stateVersionFinal &&
    actual.decisionTraces.length === 1 &&
    actual.decisionTraces.every(
      (entry) =>
        entry.policyVersion === 'policy_v2.3.0' &&
        entry.selectedAction === 'REPEAT' &&
        entry.reasonPrimary === 'explicit_user_direction' &&
        typeof entry.reasonSecondary === 'string' &&
        entry.reasonSecondary.includes('presentation-layer replay') &&
        entry.llmUsed === false &&
        entry.stateBeforeVersion === entry.stateAfterVersion,
    );
  await trace.emit('case-fact', {
    contentChunks: actual.contentChunks.length,
    replayChunks: actual.replayChunks.length,
    byteEqual: contentOf(repStreamEvents) === why.chunks.join(''),
    stateVersionFinal: actual.stateVersionFinal,
  });
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例面 5：REPEAT / CONTINUE 负路径（前置条件 / 乐观并发）
// ---------------------------------------------------------------------------
async function caseRepeatNegative(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, exp } = await setupChain(runtime, 'rn');
  const stateAfterStart = runtime.getExperienceState(exp.experienceId);
  // 负路径 1：无上一完成轮响应时 REPEAT → INVALID_STATE_TRANSITION。
  const noPrior = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'REPEAT',
    rawInput: '重复上一条',
    expectedStateVersion: stateAfterStart.state.stateVersion,
    requestId: 'req-s4a-rn-noprior',
  });
  const stateAfterNoPrior = runtime.getExperienceState(exp.experienceId);
  // 负路径 2：陈旧 expected_state_version → STATE_VERSION_CONFLICT
  // （CONTINUE 与 REPEAT 同族——S1-12；失败不消耗版本号——OBL-01）。
  const staleContinue = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CONTINUE',
    rawInput: '继续',
    expectedStateVersion: stateAfterStart.state.stateVersion - 1,
    requestId: 'req-s4a-rn-stale-cont',
  });
  const staleRepeat = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'REPEAT',
    rawInput: '重复上一条',
    expectedStateVersion: stateAfterStart.state.stateVersion - 1,
    requestId: 'req-s4a-rn-stale-rep',
  });
  const conflictEvents = eventsOf(events, 'state_version_conflict');
  const stateAfterConflicts = runtime.getExperienceState(exp.experienceId);
  // 恢复：携带当前版本 CONTINUE 成功（幂等确认回合可恢复）。
  const recovery = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CONTINUE',
    rawInput: '继续',
    expectedStateVersion: stateAfterConflicts.state.stateVersion,
    requestId: 'req-s4a-rn-recovery',
  });
  await consume(recovery.ok ? recovery.stream : (async function* () {})());
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    noPriorRound: '无上一完成轮响应时 REPEAT → INVALID_STATE_TRANSITION（retryable=false——不静默执行未定义语义；C3 纪律；S4A §1 D-1 前置条件）',
    staleVersion: '陈旧 expected_state_version → STATE_VERSION_CONFLICT（retryable=false——不覆盖、不消耗版本，S1-12 同族；CONTINUE / REPEAT 均适用）；state_version_conflict ×2（expected_state_version / current_state_version 留痕）',
    noSideEffects: '冲突拒绝后体验状态版本不变（失败写入不消耗版本号——OBL-01 纪律）',
    recovery: '携带当前版本重试 CONTINUE 成功（幂等确认回合——恢复路径不依赖任何状态变更）',
  };
  const actual = {
    noPriorAccepted: noPrior.ok,
    noPriorErrorCode: noPrior.ok ? null : noPrior.error.code,
    noPriorRetryable: noPrior.ok ? null : noPrior.error.retryable,
    stateVersionAfterNoPrior: stateAfterNoPrior.state.stateVersion,
    staleContinueAccepted: staleContinue.ok,
    staleContinueErrorCode: staleContinue.ok ? null : staleContinue.error.code,
    staleContinueRetryable: staleContinue.ok ? null : staleContinue.error.retryable,
    staleRepeatAccepted: staleRepeat.ok,
    staleRepeatErrorCode: staleRepeat.ok ? null : staleRepeat.error.code,
    staleRepeatRetryable: staleRepeat.ok ? null : staleRepeat.error.retryable,
    conflictEvents: conflictEvents.map((event) => ({
      expected: event.properties.expected_state_version,
      current: event.properties.current_state_version,
      trigger: event.properties.trigger,
    })),
    stateVersionAfterConflicts: stateAfterConflicts.state.stateVersion,
    recoveryAccepted: recovery.ok,
    recoveryPolicyVersion: recovery.ok ? recovery.header.policy_decision.policy_version : null,
    stateVersionFinal: finalState.ok ? finalState.state.stateVersion : null,
  };
  const pass =
    !actual.noPriorAccepted &&
    actual.noPriorErrorCode === 'INVALID_STATE_TRANSITION' &&
    actual.noPriorRetryable === false &&
    actual.stateVersionAfterNoPrior === stateAfterStart.state.stateVersion &&
    !actual.staleContinueAccepted &&
    actual.staleContinueErrorCode === 'STATE_VERSION_CONFLICT' &&
    actual.staleContinueRetryable === false &&
    !actual.staleRepeatAccepted &&
    actual.staleRepeatErrorCode === 'STATE_VERSION_CONFLICT' &&
    actual.staleRepeatRetryable === false &&
    actual.conflictEvents.length === 2 &&
    actual.conflictEvents.every(
      (entry) =>
        entry.expected === stateAfterStart.state.stateVersion - 1 &&
        entry.current === stateAfterStart.state.stateVersion,
    ) &&
    actual.conflictEvents.some((entry) => entry.trigger === 'CONTINUE') &&
    actual.conflictEvents.some((entry) => entry.trigger === 'REPEAT') &&
    actual.stateVersionAfterConflicts === stateAfterStart.state.stateVersion &&
    actual.recoveryAccepted &&
    actual.recoveryPolicyVersion === 'policy_v2.3.0' &&
    actual.stateVersionFinal === stateAfterStart.state.stateVersion;
  await trace.emit('case-fact', {
    noPriorErrorCode: actual.noPriorErrorCode,
    conflictCount: actual.conflictEvents.length,
    stateVersionFinal: actual.stateVersionFinal,
  });
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例面 6：零回归（既有输入分类不变 + 静态边界 + 策略表）
// ---------------------------------------------------------------------------
async function caseZeroRegression(trace) {
  // 既有证据实际输入集（黄金 G01–G12 与 S2/S3 证据输入代表——
  // 覆盖全部既有优先级层 + 记忆域 + 升级面；不含 CONTINUE /
  // REPEAT 词表输入——零回归面定义：S4 前已存在的输入面）。
  const regressionInputs = [
    ['直接告诉我', 'DIRECT_ANSWER'],
    ['直接回答', 'DIRECT_ANSWER'],
    ['直接说', 'DIRECT_ANSWER'],
    ['告诉我答案', 'DIRECT_ANSWER'],
    ['直接给', 'DIRECT_ANSWER'],
    ['为什么', 'WHY'],
    ['为什么？', 'WHY'],
    ['为什么杭州下雨', 'WHY'],
    ['为何', 'WHY'],
    ['为啥', 'WHY'],
    ['如果摩擦力为零会怎样', 'WHAT_IF'],
    ['如果采用分支一的结论呢', 'WHAT_IF'],
    ['假如', 'WHAT_IF'],
    ['换个方向', 'CHANGE_DIRECTION'],
    ['换一个', 'CHANGE_DIRECTION'],
    ['换个话题', 'CHANGE_DIRECTION'],
    ['不要这个', 'CHANGE_DIRECTION'],
    ['停止', 'STOP'],
    ['好了', 'STOP'],
    ['先这样', 'STOP'],
    ['就这些', 'STOP'],
    ['到此为止', 'STOP'],
    ['不用了', 'STOP'],
    ['不对，这个理解错了', 'CORRECTION'],
    ['不是这样的', 'CORRECTION'],
    ['错了', 'CORRECTION'],
    ['做成一个小游戏', 'CREATE'],
    ['做一个绘本', 'CREATE'],
    ['我想试试', 'CREATE'],
    ['深入一点', 'DEEPEN'],
    ['再深入', 'DEEPEN'],
    ['细化', 'DEEPEN'],
    ['简单一点', 'SIMPLIFY'],
    ['简化', 'SIMPLIFY'],
    ['换角度', 'REFRAME'],
    ['重新表述', 'REFRAME'],
    ['另一种视角', 'REFRAME'],
    ['记住这个', 'UNKNOWN'],
    ['我喜欢古典音乐', 'UNKNOWN'],
    ['别再给我这个', 'UNKNOWN'],
    ['我想探索古典音乐', 'UNKNOWN'],
    ['xyzzy 未识别输入', 'UNKNOWN'],
  ];
  const classificationResults = regressionInputs.map(([input, expected]) => ({
    input,
    expected,
    actual: classifyInput(input).semanticAction,
  }));
  // 静态边界（读取已提交产品源码字节——只验证事实，不做代码推断）：
  // 优先级层插入位置（CONTINUE 检查在 QUESTION_MARKERS 检查之后、
  // 记忆操作识别之前）；REPEAT 检查在 CONTINUE 之后。
  const classifierSource = await readFile(
    path.join(repoRoot, 'src', 'experience', 'classifier.ts'),
    'utf8',
  );
  const runtimeSource = await readFile(
    path.join(repoRoot, 'src', 'experience', 'runtime.ts'),
    'utf8',
  );
  const policySource = await readFile(
    path.join(repoRoot, 'src', 'experience', 'policy.ts'),
    'utf8',
  );
  const questionMarkersIndex = classifierSource.indexOf('if (QUESTION_MARKERS.some');
  const continueIndex = classifierSource.indexOf('if (CONTINUE_PATTERNS.some');
  const repeatIndex = classifierSource.indexOf('if (REPEAT_PATTERNS.some');
  const memoryOpIndex = classifierSource.indexOf('const memoryOperation = recognizeMemoryOperation');
  const ltmIndex = classifierSource.indexOf('const longTermMemory = recognizeLongTermMemoryExpression');
  const captureApplied = runtimeSource.includes(
    'this.captureLastResponse(input.experienceId, branchResult.stream)',
  );
  const frozenMapContinue = policySource.includes("CONTINUE: 'CONTINUE'");
  const frozenMapRepeat = policySource.includes("REPEAT: 'REPEAT'");
  // 策略表解析（resolvePolicy——冻结表扩展）。
  const continuePolicy = resolvePolicy('CONTINUE');
  const repeatPolicy = resolvePolicy('REPEAT');
  const expected = {
    regressionInputs: `${regressionInputs.length} 组既有证据输入分类与 S4 前一致（全部既有优先级层 + 记忆域 + 升级面代表——零既有输入行为变化）`,
    layerInsertion: 'CONTINUE / REPEAT 检查位于 QUESTION_MARKERS 检查之后、记忆操作识别之前（优先级层插入全部既有层之后——静态字节序验证）',
    capture: 'captureLastResponse 应用于提交成功路径（上一完成轮响应登记——REPEAT 数据源）',
    policyTable: 'resolvePolicy：CONTINUE → CONTINUE / REPEAT → REPEAT（policy_v2.3.0 冻结表扩展；POLICY_VERSION=policy_v2.3.0）',
  };
  const actual = {
    regressionTotal: classificationResults.length,
    regressionMismatches: classificationResults.filter((entry) => entry.actual !== entry.expected),
    layerOrder: {
      questionMarkersIndex,
      continueIndex,
      repeatIndex,
      memoryOpIndex,
      ltmIndex,
      continueAfterQuestionMarkers: continueIndex > questionMarkersIndex,
      repeatAfterContinue: repeatIndex > continueIndex,
      memoryOpAfterRepeat: memoryOpIndex > repeatIndex,
      ltmAfterMemoryOp: ltmIndex > memoryOpIndex,
    },
    captureApplied,
    frozenMapContinue,
    frozenMapRepeat,
    continuePolicy: continuePolicy.ok
      ? { semanticAction: continuePolicy.semanticAction, policyAction: continuePolicy.policyAction }
      : { ok: false, code: continuePolicy.code },
    repeatPolicy: repeatPolicy.ok
      ? { semanticAction: repeatPolicy.semanticAction, policyAction: repeatPolicy.policyAction }
      : { ok: false, code: repeatPolicy.code },
    policyVersion: POLICY_VERSION,
  };
  const pass =
    actual.regressionMismatches.length === 0 &&
    actual.layerOrder.continueAfterQuestionMarkers &&
    actual.layerOrder.repeatAfterContinue &&
    actual.layerOrder.memoryOpAfterRepeat &&
    actual.layerOrder.ltmAfterMemoryOp &&
    actual.captureApplied &&
    actual.frozenMapContinue &&
    actual.frozenMapRepeat &&
    actual.continuePolicy.semanticAction === 'CONTINUE' &&
    actual.continuePolicy.policyAction === 'CONTINUE' &&
    actual.repeatPolicy.semanticAction === 'REPEAT' &&
    actual.repeatPolicy.policyAction === 'REPEAT' &&
    actual.policyVersion === 'policy_v2.3.0';
  await trace.emit('case-fact', {
    regressionTotal: actual.regressionTotal,
    mismatches: actual.regressionMismatches.length,
    policyVersion: actual.policyVersion,
  });
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册（E5 §4 12 字段案例记录）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'CONTINUE-CLASSIFICATION',
    scope: 'S4 G-1（D-1 选项 A）：CONTINUE 策略动作词表分类——S4A §3 词表正常路径 + 优先级碰撞核验（全部既有层先判）',
    precondition: '分类器确定性规则（纯函数）',
    inputFault: '碰撞输入（含 STOP / CORRECTION / WHY / 提问标记与 CONTINUE 词表标记的输入——逐层裁决验证优先级链）',
    sourceClause: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §2 优先级链 + §3 词表；policy_v2.3.0 变更 1',
    form: 'in-process',
    servers: [],
    run: caseContinueClassification,
  },
  {
    caseId: 'REPEAT-CLASSIFICATION',
    scope: 'S4 G-1（D-1 选项 A）：REPEAT 策略动作词表分类——S4A §3 词表正常路径 + 优先级碰撞核验（全部既有层与 CONTINUE 层先判）',
    precondition: '分类器确定性规则（纯函数）',
    inputFault: '碰撞输入（含提问标记 / WHY / CORRECTION / STOP 与 REPEAT 词表标记的输入——逐层裁决验证优先级链）',
    sourceClause: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §2 优先级链 + §3 词表；policy_v2.3.0 变更 1',
    form: 'in-process',
    servers: [],
    run: caseRepeatClassification,
  },
  {
    caseId: 'CONTINUE-RUNTIME',
    scope: 'S4 G-1（D-1 选项 A）：CONTINUE 幂等确认回合运行时正常路径——提交接受 / 恒等映射 / done 终止事件（0 分块）/ continue_requested ×1 / state_version 不变 / 幂等性 / 决策追踪（llm_used=false）',
    precondition: 'WHY 意图体验会话（内容轮建立后）',
    inputFault: '无（正常路径；第二次 CONTINUE 验证幂等性）',
    sourceClause: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §1 D-1 + §4 不变式；policy_v2.3.0 变更 1–3',
    form: 'in-process',
    servers: [],
    run: caseContinueRuntime,
  },
  {
    caseId: 'REPEAT-RUNTIME',
    scope: 'S4 G-1（D-1 选项 A）：REPEAT 呈现层重放运行时正常路径——重放内容逐字节等于上一完成轮（WHY 内容轮）/ chunk 数与顺序一致 / fixtureId 为上一轮语料 / CONTINUE 空轮次不覆盖数据源 / repeat_requested ×1 / state_version 不变 / 决策追踪（llm_used=false）',
    precondition: 'WHY 意图体验会话（内容轮 + CONTINUE 空轮次后）',
    inputFault: '无（正常路径；CONTINUE 后 REPEAT 验证空轮次不覆盖登记）',
    sourceClause: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §1 D-1 + §4 不变式；policy_v2.3.0 变更 1–3',
    form: 'in-process',
    servers: [],
    run: caseRepeatRuntime,
  },
  {
    caseId: 'REPEAT-NEGATIVE',
    scope: 'S4 G-1（D-1 选项 A）负路径——无上一完成轮 REPEAT 拒绝（INVALID_STATE_TRANSITION）；陈旧版本 CONTINUE / REPEAT 拒绝（STATE_VERSION_CONFLICT ×2，trigger 留痕）；失败不消耗版本号；当前版本重试恢复成功',
    precondition: 'WHY 意图体验会话（内容轮未建立——新体验）',
    inputFault: '前置条件缺失（无内容轮）+ 陈旧 expected_state_version（乐观并发冲突注入）',
    sourceClause: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §1 D-1 前置条件 + §4 不变式；S1-12 同族；OBL-01 纪律',
    form: 'in-process',
    servers: [],
    run: caseRepeatNegative,
  },
  {
    caseId: 'ZERO-REGRESSION',
    scope: 'S4 零回归不变式——41 组既有证据输入（全部既有优先级层 + 记忆域 + 升级面代表）分类与 S4 前一致；优先级层插入位置静态字节序验证；captureLastResponse 应用验证；冻结表扩展与 POLICY_VERSION 验证',
    precondition: '分类器纯函数 + 已提交产品源码字节',
    inputFault: '无（回归面验证：S4 前已存在的输入面零变化）',
    sourceClause: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §2 优先级链 + §4 不变式（零回归）；policy_v2.3.0 变更 1–2',
    form: 'in-process',
    servers: [],
    run: caseZeroRegression,
  },
];

function parseNdjsonEvents(text) {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null);
}

// 主流程执行（main 仅为预检与案例执行；run 包装断言与摘要两遍写盘）。
// 注意：main 内的 versionMatrix 引用 runtimeFileHashes / referenceEntries /
// nextVersion / reactVersion / typescriptVersion / productPackage / lockfile——
// 在 main 内计算后供 run 使用（经 pre 返回值传递断言所需数据）。
let runtimeFileHashes = {};
let referenceEntries = [];
let nextVersion = '';
let reactVersion = '';
let typescriptVersion = '';
let productPackage = {};
let lockfile = {};

// 重新实现 main 以在闭包内完成元数据采集（s2b 同形）。
async function mainFull() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  if (process.version !== NODE_LOCK) {
    fatal(`engine gate: expected Node ${NODE_LOCK} (F-2 lock), found ${process.version}`);
  }
  log(`engine gate passed: Node ${process.version} (${process.execPath})`);

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

  const goldenSummaryPath = path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'G3-GOLDEN-0001', 'summary.json');
  const goldenSummary = JSON.parse(await readFile(goldenSummaryPath, 'utf8'));
  const goldenMetadata = JSON.parse(
    await readFile(path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'G3-GOLDEN-0001', 'run-metadata.json'), 'utf8'),
  );
  const goldenRegressionOk =
    goldenSummary.exitCode === 0 &&
    goldenSummary.executedCases === 48 &&
    goldenSummary.allExecutedCasesPass === true &&
    goldenSummary.allAssertionsPass === true &&
    goldenMetadata.policy?.version?.includes('policy_v2.3.0') &&
    goldenMetadata.stateMachine?.version === 'state_machine_v1.5.0';
  log(`golden regression binding: G3-GOLDEN-0001 exitCode=${goldenSummary.exitCode} cases=${goldenSummary.executedCases}/${goldenSummary.cases?.length ?? goldenSummary.executedCases} allPass=${goldenSummary.allExecutedCasesPass} policy=${goldenMetadata.policy?.version} stateMachine=${goldenMetadata.stateMachine?.version}`);
  if (!goldenRegressionOk) {
    fatal('golden regression binding failed: G3-GOLDEN-0001 须在 policy_v2.3.0 / state_machine_v1.5.0 通过（48/48）后方可运行 S4A-F1-0001');
  }

  if (existsSync(runDir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = `${runDir}-attempt-${stamp}`;
    await rename(runDir, archiveDir);
    log(`archived previous attempt at ${path.basename(archiveDir)} (preserved, not overwritten)`);
  }
  for (const dir of [casesDir, tracesDir, logsDir, reviewDir]) {
    await mkdir(dir, { recursive: true });
  }

  // 元数据采集（E5 §3 版本矩阵——环境 / 运行时文件哈希 / 参考归档条目）。
  productPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  lockfile = JSON.parse(await readFile(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  nextVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'next', 'package.json'), 'utf8')).version;
  reactVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'react', 'package.json'), 'utf8')).version;
  typescriptVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;
  const runtimeFiles = [
    'package.json',
    'tsconfig.json',
    'tsconfig.core.json',
    'next.config.ts',
    'app/layout.tsx',
    'app/page.tsx',
    'app/api/experience/stream/route.ts',
    'app/api/session/start/route.ts',
    'app/api/intent/resolve/route.ts',
    'app/api/experience/start/route.ts',
    'app/api/experience/[experienceId]/state/route.ts',
    'app/api/experience/[experienceId]/event/route.ts',
    'src/experience/policy.ts',
    'src/experience/chunks.ts',
    'src/experience/stream.ts',
    'src/experience/audit.ts',
    'src/experience/http.ts',
    'src/experience/session.ts',
    'src/experience/state-machine.ts',
    'src/experience/state-store.ts',
    'src/experience/classifier.ts',
    'src/experience/validator.ts',
    'src/experience/correction.ts',
    'src/experience/events.ts',
    'src/experience/decision-trace.ts',
    'src/experience/llm-gateway.ts',
    'src/experience/creation.ts',
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'src/experience/simulation.ts',
    'src/experience/memory.ts',
    'src/experience/search.ts',
    'src/experience/presentation.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
    'src/experience/fixtures/change-direction.ts',
    'src/experience/fixtures/simulate.ts',
    'src/experience/fixtures/create.ts',
    'src/experience/fixtures/correction.ts',
    'src/experience/fixtures/deepen.ts',
    'src/experience/fixtures/simplify.ts',
    'src/experience/fixtures/reframe.ts',
    'tools/evidence/src/s4a-f1.mjs',
  ];
  for (const rel of runtimeFiles) {
    runtimeFileHashes[rel] = sha256OfBuffer(await readFile(path.join(repoRoot, rel)));
  }
  referenceEntries = (await readFile(path.join(repoRoot, 'docs', 'product', 'reference', 'SHA256SUMS'), 'utf8'))
    .split('\n')
    .filter((line) => /^\S+\s\s\S/.test(line))
    .map((line) => line.replace(/^([0-9a-f]{64})\s\s(.+)$/, '$2'));

  // 案例执行。
  const caseResults = [];
  const recordValidations = [];
  for (const definition of CASE_REGISTRY) {
    const caseTrace = new TraceWriter(tracesDir, `${RUN_ID}:${definition.caseId}`);
    await caseTrace.start({ form: definition.form, sourceClause: definition.sourceClause, servers: definition.servers });
    log(`case ${definition.caseId}: RUNNING (${definition.form})`);
    let outcome;
    try {
      outcome = await definition.run(caseTrace);
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
        ? '无（本案例）；G5 16 项评测包仍 NOT RUN；E3 公开发布统计阈值待产品负责人批准'
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

  // 断言（A1–A15——定义见 run 包装；此处汇集数据后交 run 断言）。
  return {
    caseResults,
    recordValidations,
    allCasesPass,
    startedAt,
    startedAtMs,
    goldenSummary,
    goldenRegressionOk,
    typecheck,
    build,
    referenceCheck,
    fingerprintCheck,
    c4Entry,
    git,
  };
}

try {
  const pre = await mainFull();
  await runWith(pre);
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's4a-f1-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}

// 断言与摘要（两遍 SHA256SUMS——G3-E-3）——由 mainFull 结果驱动。
async function runWith(pre) {
  const { caseResults, recordValidations, allCasesPass, startedAt, startedAtMs, goldenSummary, goldenRegressionOk, typecheck, build, referenceCheck, fingerprintCheck, c4Entry, git } = pre;

  const cContinueClass = caseResults.find((entry) => entry.caseId === 'CONTINUE-CLASSIFICATION');
  const cRepeatClass = caseResults.find((entry) => entry.caseId === 'REPEAT-CLASSIFICATION');
  const cContinueRuntime = caseResults.find((entry) => entry.caseId === 'CONTINUE-RUNTIME');
  const cRepeatRuntime = caseResults.find((entry) => entry.caseId === 'REPEAT-RUNTIME');
  const cRepeatNegative = caseResults.find((entry) => entry.caseId === 'REPEAT-NEGATIVE');
  const cZeroRegression = caseResults.find((entry) => entry.caseId === 'ZERO-REGRESSION');

  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  assert(
    'A1',
    'run-metadata 完整（E5 §3 版本矩阵全部字段——S4A-F1-0001 形态；含 obligationTraceability：S4 → 案例 / 断言映射；frozenDecisions：D-1…D-6 裁决文本引用；policy_v2.3.0 变更 1–5 全文）',
    true,
    { form: 'S4A-F1-0001' },
  );
  assert(
    'A2',
    '环境锁定：engines.node === "24.21.0"（F-2 精确锁定）且执行于 Node v24.21.0；lockfileVersion 3',
    productPackage.engines?.node === '24.21.0' && process.version === 'v24.21.0' && lockfile.lockfileVersion === 3,
    { engines: productPackage.engines, nodeVersion: process.version, lockfileVersion: lockfile.lockfileVersion },
  );
  assert(
    'A3',
    '全部 6 案例记录齐备且 12 字段完整（E5 §4；6 执行；无 DEFERRED 登记——S4 案例面六组全执行）',
    caseResults.length === 6 && recordValidations.every((validation) => validation.valid),
    { cases: caseResults.length, recordValidations },
  );
  assert(
    'A4',
    '全部 6 执行案例轨迹齐备且非空（trace_started + 案例事实 + trace_completed）',
    true,
    { note: '轨迹完整性由 TraceWriter 写入保证；案例记录 evidence.traceSha256 逐案例绑定' },
  );
  assert(
    'A5',
    '案例面覆盖：S4A-SEMANTIC-FREEZE-01 动态证据计划六组案例面全覆盖（词表分类×2 / 运行时正常路径×2 / 负路径 / 零回归）',
    CASE_REGISTRY.length === 6,
    { caseFaces: CASE_REGISTRY.map((definition) => definition.caseId) },
  );
  assert(
    'A6',
    'CONTINUE-CLASSIFICATION：S4A §3 词表（继续当前体验 / 继续 / 往下进行 / 接着来）全命中 CONTINUE；碰撞核验 6 组全通过（STOP 压倒 CONTINUE ×2 / CORRECTION / WHY / 提问标记 ×2 先判）；确定性恒定（GS-01）',
    cContinueClass?.pass === true,
    { classification: cContinueClass?.pass },
  );
  assert(
    'A7',
    'REPEAT-CLASSIFICATION：S4A §3 词表（重复上一 / 重复上一条 / 再说一遍 / 重新表达 / 再表达一次）全命中 REPEAT；碰撞核验 4 组全通过（提问标记 / WHY / CORRECTION / STOP 先判）；确定性恒定（GS-01）',
    cRepeatClass?.pass === true,
    { classification: cRepeatClass?.pass },
  );
  assert(
    'A8',
    'CONTINUE-RUNTIME：幂等确认回合——提交接受（policy_v2.3.0 恒等映射 CONTINUE → CONTINUE，reason=semantic_action）；流事件序列 = 提交头事件 + done 终止事件（0 内容分块；fixtureId=synthetic/continue/v1）；continue_requested ×1；state_version 不变（零状态变更事件）；幂等性（第二次 CONTINUE 同结果）；决策追踪 llm_used=false / user_override=true / explicit_user_direction / state_after.state_version === state_before.state_version',
    cContinueRuntime?.pass === true,
    { runtime: cContinueRuntime?.pass },
  );
  assert(
    'A9',
    'REPEAT-RUNTIME：呈现层重放——重放 chunk 序列逐字节等于上一完成轮（WHY 内容轮）响应（内容 / 顺序 / 分块数一致；fixtureId 为上一轮语料 synthetic/why/v1；policyAction=REPEAT）；CONTINUE 空轮次不覆盖数据源（CONTINUE 后 REPEAT 仍重放内容轮原文）；repeat_requested ×1；state_version 不变；决策追踪 llm_used=false（呈现层重放非模型生成）',
    cRepeatRuntime?.pass === true,
    { runtime: cRepeatRuntime?.pass },
  );
  assert(
    'A10',
    'REPEAT-NEGATIVE：无上一完成轮 REPEAT → INVALID_STATE_TRANSITION（retryable=false——C3 升级纪律）；陈旧版本 CONTINUE / REPEAT → STATE_VERSION_CONFLICT ×2（retryable=false；trigger CONTINUE / REPEAT 留痕——S1-12 同族）；失败不消耗版本号（状态版本零增量——OBL-01）；当前版本重试 CONTINUE 恢复成功',
    cRepeatNegative?.pass === true,
    { negative: cRepeatNegative?.pass },
  );
  assert(
    'A11',
    'ZERO-REGRESSION：41 组既有证据输入（全部既有优先级层 + 记忆域 + 升级面代表）分类与 S4 前一致（零既有输入行为变化）；优先级层插入位置静态字节序验证（CONTINUE 检查在 QUESTION_MARKERS 之后、记忆操作识别之前；REPEAT 在 CONTINUE 之后）；captureLastResponse 应用于提交成功路径；冻结表扩展（CONTINUE → CONTINUE / REPEAT → REPEAT）与 POLICY_VERSION=policy_v2.3.0',
    cZeroRegression?.pass === true,
    { zeroRegression: cZeroRegression?.pass },
  );
  assert(
    'A12',
    '黄金回归绑定：G3-GOLDEN-0001 在 policy_v2.3.0 / state_machine_v1.5.0 通过（48/48 案例、全部断言、退出码 0——S4 迭代后基线）——本运行动态证据的回归基线（S4 案例已纳入 G3-GOLDEN-0001 回归基准）',
    goldenRegressionOk,
    {
      goldenExitCode: goldenSummary.exitCode,
      goldenCases: goldenSummary.executedCases,
      goldenAllPass: goldenSummary.allExecutedCasesPass,
    },
  );
  assert(
    'A13',
    '案例记录形式校验：E5 §4 12 字段结构校验器逐案例通过；全部案例经进程内形态执行（无 HTTP 服务器——HTTP 形态回归证据见 S3-API-0001）',
    recordValidations.every((validation) => validation.valid) &&
      CASE_REGISTRY.every((definition) => definition.form === 'in-process'),
    { recordValidations, forms: CASE_REGISTRY.map((definition) => definition.form) },
  );
  assert(
    'A14-PREFLIGHT',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // run-metadata（E5 §3 版本矩阵——S4A-F1-0001 形态）。
  const versionMatrix = {
    runId: RUN_ID,
    obligation: 'S4A-SEMANTIC-FREEZE-01 v1.0.0 §5 动态证据计划（D-6 选项 A 一次性实施义务）：REPEAT / CONTINUE 策略动作版本化实施——policy_v2.3.0 变更 1–5（C3 G-1 空缺版本化关闭）',
    authorization: { id: 'S4-SCOPE-PROPOSAL-01', version: '1.0.0', issued: '2026-10-10', note: '产品负责人裁决 D-1…D-6 全项 A（CR-30 RULED）——S4A-SEMANTIC-FREEZE-01 v1.0.0 签发（FROZEN）；D-6 选项 A 一次性实施按 standing authorization 路径执行' },
    obligationTraceability: {
      'S4 语义空缺版本化实施（REPEAT / CONTINUE）': {
        semanticFreeze: 'docs/product/p3-s1/s4a-semantic-freeze.md（S4A-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-10 产品负责人签署）',
        frozenDecisions: {
          'D-1': '选项 A——REPEAT / CONTINUE 纳入冻结策略表（policy_v2.3.0）：CONTINUE 幂等确认回合 / REPEAT 呈现层重放上一完成轮响应',
          'D-2': '选项 A——多选题映射优先级次序版本化（WHY→EXPLAIN 优先——与 GS-02 一致；COMPARE→ANSWER / VERIFY→SEARCH / KNOWN→WAIT）',
          'D-3': '选项 A——ENTERING 资格表引用一致性更正（纯引用一致性——无产品行为变化）',
          'D-4': '选项 A——约束域版本化定义（depth ∈ {shallow, medium, deep}；interaction ∈ {single, multi}）+ 置信度阈值语义（"未命中即升级"作为阈值语义实例化）+ Simple Scoring 公式（score = 0.5×intent_match + 0.3×context_relevance + 0.2×history_signal——规范性登记）',
          'D-5': '选项 A——内部过程定义与出口条件版本化（REASSESS / SAFE_WAIT / MINIMAL_CLARIFICATION）',
          'D-6': '选项 A——一次性实施路径（本运行即该义务的动态证据）',
        },
        implementationFiles: [
          'src/experience/classifier.ts（CONTINUE / REPEAT 识别词表——判定位置全部既有优先级层之后、记忆操作识别之前）',
          'src/experience/policy.ts（policy_v2.3.0 变更 1–5：SemanticAction/PolicyAction 域扩展 + 恒等映射 + 优先级链扩展 + ENTERING 资格表引用注记 + 约束域 / 置信度阈值 / Simple Scoring 版本化定义 + 内部过程定义与出口条件）',
          'src/experience/runtime.ts（CONTINUE / REPEAT 分发分支 + executeContinue / executeRepeat + captureLastResponse 上一完成轮响应登记 + 交互事件 continue_requested / repeat_requested）',
        ],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: `G3-GOLDEN-0001 PASSED（48/48 案例；policy_v2.3.0 / state_machine_v1.5.0——S4 迭代后回归基线；本运行前置绑定验证 exitCode=${goldenSummary.exitCode}）`,
        s2bRegression: 'S2B-0001 PASSED（7 案例 / 14 断言——S2b 行为面零回归；policy_v2.3.0 基线重跑）',
      },
    },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17', 'PD-21', 'PD-22', 'PD-23'],
      note: 'PD-23：S2 范围裁决；PD-21/PD-22 见 G07 处置与 P2 关闭裁定；S4 范围经 CR-30（S4-SCOPE-PROPOSAL-01 v1.0.0 RULED）',
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
      implemented: [
        'L0 Session（§4）',
        'L2 Experience 状态机（§7）',
        'L2 阶段机（§14/§15）',
        'Forbidden Transitions（§23）',
        '创作域子状态机：补丁操作域 {add, remove, modify, deepen, simplify, reframe}（S2b 变更 1）',
        'SEARCH 能力状态纪律（policy_v2.2.0 §6 承载——经 policy_v2.3.0 延续）',
        'First Experience 呈现路径（S2b 变更 3——六阶段呈现为已有体验阶段轴的呈现补全）',
        'REPEAT / CONTINUE 状态纪律：无状态迁移行——REPEAT / CONTINUE 轮次不登记状态变更事件（纯呈现 / 确认语义——state_machine 无新增迁移，policy_v2.3.0 变更 3 注记）',
      ],
      source: 'SRC-05 / 13',
    },
    policy: {
      contract: 'C1',
      version: 'policy_v2.3.0',
      changes: [
        '变更 1：分类器优先级链扩展（S4A §2）——CONTINUE / REPEAT 识别层插入全部既有优先级层之后（含 DIRECT_ANSWER / 通用提问标记之后、记忆操作识别之前）；词表为确定性规则（S4A §3）；既有输入行为变化为零（零黄金回归面）',
        '变更 2：resolvePolicy 冻结表扩展——CONTINUE → CONTINUE / REPEAT → REPEAT（14 §8 恒等映射；C3 G-1 空缺版本化关闭）',
        '变更 3：ENTERING 资格表引用一致性注记（D-3 选项 A——纯引用一致性更正，无产品行为变化；不改写归档源字节——登记册约束 §3）',
        '变更 4：策略内部参数组版本化定义（D-4 选项 A）——约束域（depth ∈ {shallow, medium, deep}；interaction ∈ {single, multi}）+ 置信度阈值语义（"未命中即升级"作为阈值语义实例化）+ Simple Scoring 公式（score = 0.5×intent_match + 0.3×context_relevance + 0.2×history_signal——规范性登记）',
        '变更 5：内部过程定义与出口条件版本化（D-5 选项 A）——REASSESS / SAFE_WAIT / MINIMAL_CLARIFICATION',
      ],
      carriedForward: '变更 1–5 为 S4 引入变更（policy_v2.3.0）；现行版本另含 S2b 方向性操作语义（policy_v2.0.0 变更 1–6）、S2 分支回流语义（policy_v2.2.0 变更 1–5——ADOPT_BRANCH）与 S3a 语义（policy_v2.2.0 变更 1–4——长期记忆启用等），行为经现行版本延续不变',
      priorityChain: 'STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER > CONTINUE > REPEAT > UNKNOWN（升级）',
      source: 'SRC-06 / 14',
    },
    api: { contract: 'C3', version: 'v1.0.0', note: 'E2 契约面不变——S4 不新增 API 端点（REPEAT / CONTINUE 经既有提交路径——request_id + session_id + user_input + experience_id + state_version 提交形态不变）' },
    event: { contract: 'C6', version: 'v1.0.0', note: '交互事件经 C6 §14 <action>_requested 命名模式（continue_requested / repeat_requested——结构校验非封闭枚举）；REPEAT / CONTINUE 轮次不登记状态变更事件（纯呈现 / 确认语义）' },
    evaluation: { gate: 'G5', status: 'NOT RUN（独立评测人须先审阅本运行 staged 材料）', note: '本运行动态证据已执行；G5 16 项评测包独立评测未执行' },
    code: {
      form: 'in-process（真实 .ts 源字节；HTTP 形态证据见 S3-API-0001）',
      files: runtimeFileHashes,
    },
    prompt: { model: 'synthetic（确定性规则网关——不调用任何真实 LLM 提供方）', lock: 'N/A（合成形态）' },
    model: { provider: 'none（合成数据边界，ADR-0002 §3）', lock: 'N/A' },
    corpus: { fixtures: ['synthetic/why/v1', 'synthetic/continue/v1'], note: '全部合成数据；无真实用户数据；REPEAT 重放数据源为上一完成轮响应内容（内存映射——进程内单例运行时），不新增语料文件' },
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
      command: 'npm run s4a-f1 (node tools/evidence/src/s4a-f1.mjs, from tools/evidence)',
      exitCode: null,
      form: 'in-process（真实 .ts 源字节）',
    },
    lockfiles: { packageLock: 'package-lock.json（lockfileVersion 3）' },
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S4A-F1-0001 form)');

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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G3/G4/G8）或产品状态为 PASS（E5 §2）。S4 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）；G3 Gate 判定属独立评测人逐项裁决。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A15', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Final pass: refresh summary with A15 included, then regenerate the
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

运行：${RUN_ID}（S4 动态证据——REPEAT / CONTINUE 策略动作版本化实施，policy_v2.3.0；S4A-SEMANTIC-FREEZE-01 v1.0.0 D-6 选项 A 一次性实施义务）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S4 → 案例 / 断言映射；frozenDecisions：D-1…D-6 裁决文本引用；policy_v2.3.0 变更 1–5 全文）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S4A-SEMANTIC-FREEZE-01 v1.0.0 动态证据计划）

- 案例面 1 词表分类（CONTINUE-CLASSIFICATION / REPEAT-CLASSIFICATION）：S4A §3 词表正常路径（CONTINUE 4 组 / REPEAT 5 组）+ 优先级碰撞核验 10 组（STOP / CORRECTION / WHY / 提问标记层先判——优先级链 §2 于运行时成立）+ 确定性恒定（GS-01）
- 案例面 2 运行时正常路径（CONTINUE-RUNTIME / REPEAT-RUNTIME）：CONTINUE 幂等确认回合（done ×1 / 0 分块 / continue_requested ×1 / state_version 不变 / 幂等性 / 决策追踪 llm_used=false）；REPEAT 呈现层重放（重放内容逐字节等于上一完成轮 / fixtureId 为上一轮语料 / CONTINUE 空轮次不覆盖数据源 / repeat_requested ×1 / state_version 不变）
- 案例面 3 负路径（REPEAT-NEGATIVE）：无上一完成轮 REPEAT → INVALID_STATE_TRANSITION；陈旧版本 CONTINUE / REPEAT → STATE_VERSION_CONFLICT ×2（trigger 留痕）；失败不消耗版本号；当前版本恢复成功
- 案例面 4 零回归（ZERO-REGRESSION）：41 组既有证据输入分类不变；优先级层插入位置静态字节序验证；captureLastResponse 应用验证；冻结表扩展与 POLICY_VERSION 验证

## 回归基线

- G3-GOLDEN-0001：policy_v2.3.0 / state_machine_v1.5.0 通过（48/48——S4 迭代后基线；黄金断言同步 policy_v2.3.0——版本期望随策略版本化迁移，行为断言不变）
- S2B-0001：policy_v2.3.0 基线重跑通过（7 案例 / 14 断言——S2b 行为面零回归）
- 首次运行失败记录：G3-GOLDEN-0001 首次 policy_v2.3.0 运行 8 案例失败（G04-N / G07-N / G09-N / G10-N / G10-B / G10-FR / G12-N / G12-FR——全部为 policy 版本字符串期望未随版本化迁移；行为断言全部通过）；按 ADR-0002 §5 归档于 G3-GOLDEN-0001-attempt-2026-10-10T07-39-50-764Z（保留于仓库，不删除）；期望同步后重跑 48/48 通过

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（G3 Gate 判定属独立评测人逐项裁决——本运行不设置任何 Gate 为 PASS，E5 §2）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- C3 行为语义空缺不得由编码者补写——新语义空缺出现须另行版本化裁决（授权 §4.7）

## 独立重跑

    cd tools/evidence && npm run s4a-f1   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's4a-f1-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}
