// F2-GS-0001 — F-2 迭代动态证据执行器
// （P3-S1-IMPL-AUTH-01 §2 授权范围内：GS-01…GS-06 完整动态执行 +
//  C6 事件契约证据 + S1 启用动作契约测试 + F-1 回归）
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate（G2–G4）或产品状态为 PASS；
// - 进程内形态经 module.registerHooks 解析无扩展名说明符到真实 .ts 源码
//   （Node ≥23.6 原生类型剥离），使证据执行器运行的是已提交的真实运行时代码；
// - HTTP 形态经真实 Next.js 生产服务器（next start）。
//
// 命名调和（S1 §23 最低事件集 → C6 权威事件名，见迭代记录 P3-S1-IMPL-ITER-002 §4）：
//   intent_created → intent_received（C6 §12）；semantic_action_detected →
//   intent_parsed 携带 semantic_action 属性；user_action → C6 §14 具体交互事件；
//   version_conflict → state_version_conflict（C6 §21）。

import { registerHooks } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
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
const { EventRecorder, validateEventEnvelope } = await import('../../../src/experience/events');
const { classifyInput } = await import('../../../src/experience/classifier');
const { handleExperienceStreamRequest } = await import('../../../src/experience/http');
const { directAnswer } = await import('../../../src/experience/fixtures/direct-answer');
const { why } = await import('../../../src/experience/fixtures/why');
const { simulate } = await import('../../../src/experience/fixtures/simulate');

const { sha256OfBuffer, writeSha256Sums, verifySha256Sums } = await import('./hashes.mjs');
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
const RUN_ID = 'F2-GS-0001';
const PORT = 4322;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const NODE_LOCK = 'v24.21.0';

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.resolve(here, '..'); // tools/evidence
const repoRoot = path.resolve(evidenceRoot, '..', '..'); // repository root
const runDir = path.join(repoRoot, 'artifacts', 'evidence', 'runs', RUN_ID);
const casesDir = path.join(runDir, 'cases');
const tracesDir = path.join(runDir, 'traces');
const logsDir = path.join(runDir, 'logs');
const reviewDir = path.join(runDir, 'review');
const httpEventLogPath = path.join(tracesDir, 'http-events.jsonl');
const httpDecisionTracePath = path.join(tracesDir, 'http-decision-traces.jsonl');
const httpAuditPath = path.join(tracesDir, 'http-audit.jsonl');

const EVALUATOR_SEPARATION =
  '执行：工程负责人角色（代理，Codex）；独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）。本记录由执行方起草，独立评测人保留审阅与否决权。';

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
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
  });
}

function tail(text, maxLines = 12) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-maxLines).join('\n');
}

async function waitForServer(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function parseNdjsonEvents(text) {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

async function readStreamEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length > 0) events.push(JSON.parse(line));
    }
  }
  if (buffer.trim().length > 0) events.push(JSON.parse(buffer));
  return events;
}

/** 读取流的前 count 个事件并保持读取器开启（生成中中断案例用）。 */
async function readStreamEventsPartial(body, count) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  while (events.length < count) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length > 0) events.push(JSON.parse(line));
    }
  }
  return { events, reader, decoder, buffer };
}

/** 从已开启的读取器继续读取至流结束。 */
async function readStreamEventsRest(reader, decoder, buffer) {
  const events = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim().length > 0) events.push(JSON.parse(line));
    }
  }
  if (buffer.trim().length > 0) events.push(JSON.parse(buffer));
  return events;
}

/** HTTP 服务端日志切片（偏移按 content.length——UTF-16 码元；F-1 H2 教训）。 */
async function httpLogSlice(logPath, offset) {
  if (!existsSync(logPath)) {
    return { events: [], newOffset: offset };
  }
  const content = await readFile(logPath, 'utf8');
  if (content.length <= offset) {
    return { events: [], newOffset: content.length };
  }
  const slice = content.slice(offset);
  return { events: parseNdjsonEvents(slice), newOffset: content.length };
}

/** 日志当前字节长度（UTF-16 码元；与切片偏移同一度量）。 */
async function httpLogSize(logPath) {
  if (!existsSync(logPath)) {
    return 0;
  }
  const content = await readFile(logPath, 'utf8');
  return content.length;
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

function scriptedGateway(overrides) {
  return {
    async propose() {
      return {
        proposal_id: 'proposal_scripted_0001',
        content: 'scripted proposal content',
        state_update_proposal: {},
        confidence: 0.9,
        ...overrides,
      };
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
// 案例运行器（进程内形态）
// ---------------------------------------------------------------------------

// --- GS-01 Direct Answer 正向（S1 §26 GS-01；CC04 显式回答不被覆盖） ------
async function caseGs01Positive(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '直接告诉我答案' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs01-1',
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
    sub.header.policy_decision.selected_action === 'ANSWER' &&
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

// --- GS-01 确定性负向（模型异常不存在于分类路径；CC04） ----------------
async function caseGs01Determinism(trace) {
  // 确定性：同一输入重复分类结果恒定（20 次）。
  const classifications = Array.from({ length: 20 }, () => classifyInput('直接告诉我答案').semanticAction);
  const deterministic = classifications.every((action) => action === 'DIRECT_ANSWER');
  // CC04：探索体验进行中，显式直接回答不被预设体验覆盖。
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs01d-1',
  });
  const firstEvents = first.ok ? await consume(first.stream) : [];
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const explicit = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-gs01d-2',
  });
  const explicitEvents = explicit.ok ? await consume(explicit.stream) : [];
  const expected = {
    determinism: '20/20 次分类均为 DIRECT_ANSWER',
    explicitAnswerDuringExploration: 'WHY 探索进行中显式 DIRECT_ANSWER → ANSWER（不被探索上下文覆盖）',
  };
  const actual = {
    classifications: `${classifications.length}/${classifications.length} DIRECT_ANSWER`,
    firstPolicy: first.ok ? first.header.policy_decision.selected_action : first.error.code,
    explicitPolicy: explicit.ok ? explicit.header.policy_decision.selected_action : explicit.error.code,
    explicitContent: contentOf(explicitEvents),
    explicitContentEqualsFixture: contentOf(explicitEvents) === directAnswer.chunks.join(''),
  };
  const pass =
    deterministic &&
    first.ok &&
    first.header.policy_decision.selected_action === 'EXPLAIN' &&
    firstEvents.some((event) => event.type === 'done') &&
    explicit.ok &&
    explicit.header.policy_decision.selected_action === 'ANSWER' &&
    actual.explicitContentEqualsFixture;
  return { expected, actual, pass };
}

// --- GS-02 Why 正向（S1 §26 GS-02） ----------------------------------------
async function caseGs02Positive(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs02-1',
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

// --- GS-03 Change 正向（生成中 CHANGE；S1 §11/§21；CC02 H03） --------------
async function caseGs03Positive(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  // 生成中：WHY 事件，产出 submission + 1 分块后暂停。
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs03-1',
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
    requestId: 'req-gs03-2',
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
    finalState: 'WAITING（新方向完成）',
    stateVersion: '5（v3 提交 + 复合迁移 v4 + 完成提交 v5）',
  };
  const actual = {
    inFlightState: `${stateInFlight.state.status} v${stateInFlight.state.stateVersion}`,
    changeAccepted: change.ok,
    changeStreamTypes: changeEvents.map((event) => event.type),
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

// --- GS-03 负向：旧 generation 迟到达提交（CC02 H03；S1-10 Critical） -------
async function caseGs03StaleGeneration(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs03h-1',
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
    requestId: 'req-gs03h-2',
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

// --- GS-03 负向：重复请求（请求幂等；C6 §27 / API §2.4） -----------------
async function caseGs03Duplicate(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs03dup-1',
  });
  if (first.ok) {
    await consume(first.stream);
  }
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const duplicate = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-gs03dup-1',
  });
  const expected = { duplicate: 'REQUEST_DUPLICATE——不重复执行（幂等去重）' };
  const actual = {
    firstAccepted: first.ok,
    duplicateResult: duplicate.ok ? 'OK（缺陷！）' : duplicate.error.code,
  };
  const pass = first.ok && !duplicate.ok && duplicate.error.code === 'REQUEST_DUPLICATE';
  return { expected, actual, pass };
}

// --- GS-04 Stop 正向（S1 §20/§26 GS-04；P0 硬边界） ----------------------
async function caseGs04Positive(trace) {
  const { runtime, events, audit } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs04-1',
  });
  const firstEvents = first.ok ? await consume(first.stream) : [];
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-gs04-2',
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

// --- GS-04 负向：重复 STOP（终态拒绝） ------------------------------------
async function caseGs04DuplicateStop(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs04d-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-gs04d-2',
  });
  await consume(stop.stream);
  const duplicateStop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: 5,
    requestId: 'req-gs04d-3',
  });
  const expected = { duplicateStop: '拒绝——COMPLETED 为终态，SESSION_ENDED 拒绝旧操作' };
  const actual = {
    firstStopAccepted: stop.ok,
    duplicateResult: duplicateStop.ok ? 'OK（缺陷！）' : `${duplicateStop.error.code}（retryable=${duplicateStop.error.retryable}）`,
  };
  const pass = stop.ok && !duplicateStop.ok && duplicateStop.error.code === 'INVALID_STATE_TRANSITION';
  return { expected, actual, pass };
}

// --- GS-04 负向：STOP 后无后续 continuation（P0；CC02 H02） ---------------
async function caseGs04NoContinuation(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs04n-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-gs04n-2',
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
    requestId: 'req-gs04n-3',
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

// --- GS-04/GXC02 负向：生成中客户端中止（CC02 H02） ----------------------
async function caseGs04MidGenerationAbort(trace) {
  const { runtime, events, audit } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const controller = new AbortController();
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs04m-1',
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
    requestId: 'req-gs04m-2',
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

// --- GS-05 正向：陈旧写入（S1 §12/§26 GS-05；CC02 H04） ------------------
async function caseGs05StaleWrite(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs05-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  // 陈旧写入：携带旧版本（v2，当前 v4）。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs05-2',
  });
  const stateAfterStale = runtime.getExperienceState(exp.experienceId);
  const expected = {
    staleWrite: 'STATE_VERSION_CONFLICT——不得覆盖新状态（S1-12）',
    stateUnchanged: `v${stateAfterFirst.state.stateVersion}（最新状态保留）`,
    evidence: 'state_version_conflict 事件（expected=2, current=4）',
  };
  const actual = {
    staleResult: stale.ok ? 'OK（缺陷！）' : `${stale.error.code}（status=${stale.error.status}）`,
    stateAfterStale: `v${stateAfterStale.state.stateVersion}`,
    conflictEvents: eventsOf(events, 'state_version_conflict').map((event) => ({
      expected: event.properties.expected_state_version,
      current: event.properties.current_state_version,
    })),
  };
  const pass =
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    stale.error.status === 409 &&
    stateAfterStale.state.stateVersion === stateAfterFirst.state.stateVersion &&
    actual.conflictEvents.some((entry) => entry.expected === 2 && entry.current === 4);
  return { expected, actual, pass };
}

// --- GS-05 正向：并发写入（同版本双写；S1-12 示例语义） -------------------
async function caseGs05Concurrent(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  // 两个并发写入均携带 expected_state_version=2：先提交者胜，后者冲突。
  const [resultA, resultB] = await Promise.all([
    runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHY',
      rawInput: '为什么？',
      expectedStateVersion: exp.stateVersion,
      requestId: 'req-gs05c-a',
    }),
    runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHY',
      rawInput: '为什么？',
      expectedStateVersion: exp.stateVersion,
      requestId: 'req-gs05c-b',
    }),
  ]);
  const outcomes = [resultA, resultB];
  const accepted = outcomes.filter((outcome) => outcome.ok);
  const conflicts = outcomes.filter((outcome) => !outcome.ok && outcome.error.code === 'STATE_VERSION_CONFLICT');
  // 胜者的流完成（v4）。
  if (accepted.length === 1) {
    await consume(accepted[0].stream);
  }
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    concurrentWrites: '恰好一个提交成功（v3），另一个 STATE_VERSION_CONFLICT',
    latestStatePreserved: '胜者完成提交后 v4（WAITING）',
  };
  const actual = {
    acceptedCount: accepted.length,
    conflictCount: conflicts.length,
    conflictCurrentVersion: conflicts[0]?.error.details?.current_state_version ?? null,
    finalState: `${finalState.state.status} v${finalState.state.stateVersion}`,
  };
  const pass =
    accepted.length === 1 &&
    conflicts.length === 1 &&
    conflicts[0].error.details?.current_state_version === 3 &&
    finalState.state.stateVersion === 4 &&
    finalState.state.status === 'WAITING';
  return { expected, actual, pass };
}

// --- GS-05 正向：冲突恢复（不丢失最新状态） -------------------------------
async function caseGs05Recovery(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs05r-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs05r-2',
  });
  // 恢复：以刷新后的版本重新提交。
  const recovered = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-gs05r-3',
  });
  const recoveredEvents = recovered.ok ? await consume(recovered.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    conflictThenRecovery: '陈旧写入冲突后，以当前版本重新提交成功',
    latestStateNotLost: `最终 v${stateAfterFirst.state.stateVersion + 2}（WAITING）`,
  };
  const actual = {
    staleRejected: !stale.ok && stale.error.code === 'STATE_VERSION_CONFLICT',
    recoveredAccepted: recovered.ok,
    recoveredStreamComplete: recoveredEvents.some((event) => event.type === 'state_updated'),
    finalState: `${finalState.state.status} v${finalState.state.stateVersion}`,
  };
  const pass =
    !stale.ok &&
    recovered.ok &&
    actual.recoveredStreamComplete &&
    finalState.state.stateVersion === stateAfterFirst.state.stateVersion + 2 &&
    finalState.state.status === 'WAITING';
  return { expected, actual, pass };
}

// --- GS-06 正向：越权状态写入被拒绝（S1 §17/§26 GS-06；CC02 H01/H05） ----
async function caseGs06StateMutation(trace) {
  const { runtime, events, traces } = createCaseRuntime(
    scriptedGateway({ state_update_proposal: { stage: 'SIMULATION', state_version: 99 } }),
  );
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果世界突然失去摩擦力会怎样' });
  const stateBefore = runtime.getExperienceState(exp.experienceId);
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果世界突然失去摩擦力会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs06-1',
  });
  const stateAfter = runtime.getExperienceState(exp.experienceId);
  const expected = {
    proposal: 'LLM 提案携带非空 state_update_proposal（越权状态写入尝试）',
    result: 'POLICY_REJECTED——Validator/Runtime 拒绝，模型不直接写状态',
    stateUnchanged: '状态版本与内容不变（无写入发生）',
    evidence: 'llm_output_rejected + state_write_rejected 事件；决策追踪 state_after=null',
  };
  const actual = {
    result: sub.ok ? 'OK（缺陷！）' : `${sub.error.code}（status=${sub.error.status}）`,
    stateVersionBefore: stateBefore.state.stateVersion,
    stateVersionAfter: stateAfter.state.stateVersion,
    llmOutputRejected: eventsOf(events, 'llm_output_rejected').length,
    stateWriteRejected: eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason),
    decisionTraces: traces.length,
    traceStateAfter: traces[0] ? traces[0].state_after : 'MISSING',
  };
  const pass =
    !sub.ok &&
    sub.error.code === 'POLICY_REJECTED' &&
    stateAfter.state.stateVersion === stateBefore.state.stateVersion &&
    actual.llmOutputRejected === 1 &&
    actual.stateWriteRejected.includes('llm_state_mutation_forbidden') &&
    actual.decisionTraces === 1 &&
    actual.traceStateAfter === null;
  return { expected, actual, pass };
}

// --- GS-06 负向：伪造合法字段 ----------------------------------------------
async function caseGs06ForgedFields(trace) {
  const { runtime, events } = createCaseRuntime(
    scriptedGateway({
      state_update_proposal: { status: 'SIMULATION', stage: 'SIMULATION', state_version: 99, waiting_for_user: false },
    }),
  );
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果失去摩擦力会怎样' });
  const stateBefore = runtime.getExperienceState(exp.experienceId);
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果失去摩擦力会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs06f-1',
  });
  const stateAfter = runtime.getExperienceState(exp.experienceId);
  const expected = {
    forged: 'state_update_proposal 携带合法外观的状态字段',
    result: '拒绝——任何键（无论外观合法与否）均视为越权写入',
    stateUnchanged: true,
  };
  const actual = {
    result: sub.ok ? 'OK（缺陷！）' : sub.error.code,
    stateVersionUnchanged: stateAfter.state.stateVersion === stateBefore.state.stateVersion,
    writeRejected: eventsOf(events, 'state_write_rejected').length,
  };
  const pass = !sub.ok && sub.error.code === 'POLICY_REJECTED' && actual.stateVersionUnchanged && actual.writeRejected === 1;
  return { expected, actual, pass };
}

// --- GS-06 负向：额外字段（结构外字段） ------------------------------------
async function caseGs06ExtraFields(trace) {
  const { runtime, events } = createCaseRuntime(scriptedGateway({ policy_override: 'ANSWER' }));
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs06e-1',
  });
  const expected = { extraField: '提案携带结构外字段 policy_override', result: 'LLM_SCHEMA_INVALID' };
  const actual = {
    result: sub.ok ? 'OK（缺陷！）' : sub.error.code,
    llmOutputRejected: eventsOf(events, 'llm_output_rejected').length,
  };
  const pass = !sub.ok && sub.error.code === 'LLM_SCHEMA_INVALID' && actual.llmOutputRejected === 1;
  return { expected, actual, pass };
}

// --- GS-06 负向：嵌套状态变更 ----------------------------------------------
async function caseGs06NestedMutation(trace) {
  const { runtime, events } = createCaseRuntime(
    scriptedGateway({ state_update_proposal: { nested: { stage: 'SIMULATION', deep: { state_version: 99 } } } }),
  );
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果失去摩擦力会怎样' });
  const stateBefore = runtime.getExperienceState(exp.experienceId);
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果失去摩擦力会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs06n-1',
  });
  const stateAfter = runtime.getExperienceState(exp.experienceId);
  const expected = {
    nested: 'state_update_proposal 携带嵌套状态变更对象',
    result: '拒绝——不解析嵌套内容，任何键即拒绝',
    stateUnchanged: true,
  };
  const actual = {
    result: sub.ok ? 'OK（缺陷！）' : sub.error.code,
    stateVersionUnchanged: stateAfter.state.stateVersion === stateBefore.state.stateVersion,
  };
  const pass = !sub.ok && sub.error.code === 'POLICY_REJECTED' && actual.stateVersionUnchanged;
  return { expected, actual, pass };
}

// --- GS-06 负向：策略绕过（forced_action） ---------------------------------
async function caseGs06PolicyBypass(trace) {
  const { runtime, events } = createCaseRuntime(scriptedGateway({ forced_action: 'STOP' }));
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-gs06b-1',
  });
  const expected = {
    bypass: '提案携带 forced_action 字段（策略绕过尝试）',
    result: '拒绝——LLM 不允许决定最终 Action（P-05）',
  };
  const actual = {
    result: sub.ok ? 'OK（缺陷！）' : sub.error.code,
    llmOutputRejected: eventsOf(events, 'llm_output_rejected').length,
  };
  const pass = !sub.ok && sub.error.code === 'LLM_SCHEMA_INVALID' && actual.llmOutputRejected === 1;
  return { expected, actual, pass };
}

// --- S1-ACT-WHAT_IF 正向（单次模拟；事实/推断/假设分离；PD-06） ----------
async function caseWhatIfPositive(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '如果世界突然失去摩擦力会怎样' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果世界突然失去摩擦力会怎样',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-wi-1',
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

// --- WHAT_IF 负向：STOP 优先（P-01） ---------------------------------------
async function caseWhatIfStopPriority(trace) {
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

// --- S1-04 负向：非法迁移（生成中常规输入；终态操作） ---------------------
async function caseIllegalTransition(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-ilt-1',
    signal: AbortSignal.abort(),
  });
  // 生成在途（立即取消形态：状态保持 ACTIVE v3）。
  const stateInFlight = runtime.getExperienceState(exp.experienceId);
  // 生成中提交常规输入：ACTIVE 中仅接受 STOP/CHANGE（§7）。
  const midGeneration = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-ilt-2',
  });
  // 终态操作：完成该体验后提交。
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateInFlight.state.stateVersion,
    requestId: 'req-ilt-3',
  });
  await consume(stop.stream);
  const terminalOp = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: 4,
    requestId: 'req-ilt-4',
  });
  const expected = {
    midGenerationInput: '拒绝——ACTIVE（生成中）仅接受 STOP/CHANGE（状态机 §7）；retryable=true',
    terminalOperation: '拒绝——COMPLETED 为终态',
  };
  const actual = {
    midGenerationResult: midGeneration.ok ? 'OK（缺陷！）' : `${midGeneration.error.code}（retryable=${midGeneration.error.retryable}）`,
    terminalResult: terminalOp.ok ? 'OK（缺陷！）' : terminalOp.error.code,
  };
  const pass =
    stateInFlight.state.stateVersion === 3 &&
    stateInFlight.state.status === 'ACTIVE' &&
    !midGeneration.ok &&
    midGeneration.error.code === 'INVALID_STATE_TRANSITION' &&
    midGeneration.error.retryable === true &&
    !terminalOp.ok &&
    terminalOp.error.code === 'INVALID_STATE_TRANSITION';
  return { expected, actual, pass };
}

// --- S1-01 负向：ended 会话拒绝一切旧操作 ---------------------------------
async function caseSessionEnded(trace) {
  const { runtime } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-se-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-se-2',
  });
  await consume(stop.stream);
  const afterIntent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput: '为什么',
    requestId: 'req-se-3',
  });
  const afterExperience = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: 'req-se-4',
  });
  const afterEvent = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: 5,
    requestId: 'req-se-5',
  });
  const expected = {
    endedSession: 'SESSION_ENDED 拒绝：意图解析、体验启动、体验事件全部拒绝',
  };
  const actual = {
    sessionState: runtime.getSession(session.sessionId).state,
    intentResult: afterIntent.ok ? 'OK（缺陷！）' : afterIntent.error.code,
    experienceResult: afterExperience.ok ? 'OK（缺陷！）' : afterExperience.error.code,
    eventResult: afterEvent.ok ? 'OK（缺陷！）' : afterEvent.error.code,
  };
  const pass =
    actual.sessionState === 'SESSION_ENDED' &&
    !afterIntent.ok &&
    afterIntent.error.code === 'INVALID_STATE_TRANSITION' &&
    !afterExperience.ok &&
    afterExperience.error.code === 'INVALID_STATE_TRANSITION' &&
    !afterEvent.ok &&
    afterEvent.error.code === 'INVALID_STATE_TRANSITION';
  return { expected, actual, pass };
}

// --- C6 §7 信封契约：全流程事件信封校验 ------------------------------------
async function caseC6Envelope(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-c6e-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-c6e-2',
  });
  await consume(stop.stream);
  const violations = [];
  for (const event of events) {
    const result = validateEventEnvelope(event);
    if (!result.ok) {
      violations.push({ event_id: event.event_id, violations: result.violations });
    }
  }
  const expected = {
    envelope: '全部事件通过 C6 §7 信封校验（event_id/event_type/event_version/timestamp/identity/context/source/properties/sequence_number）',
  };
  const actual = {
    eventCount: events.length,
    violationCount: violations.length,
    violations: violations.slice(0, 5),
    sampleEventId: events[0]?.event_id ?? null,
    eventVersions: [...new Set(events.map((event) => event.event_version))],
  };
  const pass = events.length > 0 && violations.length === 0;
  return { expected, actual, pass };
}

// --- C6 §25 顺序：每体验 sequence_number 严格单调 --------------------------
async function caseC6Ordering(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-c6o-1',
  });
  await consume(first.stream);
  const stateAfterFirst = runtime.getExperienceState(exp.experienceId);
  const second = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: stateAfterFirst.state.stateVersion,
    requestId: 'req-c6o-2',
  });
  await consume(second.stream);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: 6,
    requestId: 'req-c6o-3',
  });
  await consume(stop.stream);
  // 每键（体验或会话）分组校验严格单调 + 时间戳非递减。
  const byKey = new Map();
  for (const event of events) {
    const key = event.context.experience_id ?? `session:${event.identity.session_id}`;
    const list = byKey.get(key) ?? [];
    list.push(event);
    byKey.set(key, list);
  }
  const orderViolations = [];
  for (const [key, list] of byKey) {
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].sequence_number <= list[i - 1].sequence_number) {
        orderViolations.push({ key, at: i, previous: list[i - 1].sequence_number, current: list[i].sequence_number });
      }
      if (new Date(list[i].timestamp).getTime() < new Date(list[i - 1].timestamp).getTime()) {
        orderViolations.push({ key, at: i, kind: 'timestamp_regression' });
      }
    }
  }
  const expected = {
    ordering: '同一 Experience Runtime 内状态相关事件 sequence_number 严格单调递增、时间戳非递减（C6 §25）',
  };
  const actual = {
    keys: [...byKey.keys()],
    sequences: [...byKey.entries()].map(([key, list]) => ({ key, sequences: list.map((event) => event.sequence_number) })),
    orderViolations: orderViolations.length,
  };
  const pass = events.length > 0 && orderViolations.length === 0;
  return { expected, actual, pass };
}

// --- S1 §23 最低事件集覆盖（含名称调和） -----------------------------------
async function caseC6MinimumSet(trace) {
  // 全流程联合：WHY 完成流 + CHANGE 流 + STOP 流 + 陈旧写入 + 越权提案。
  const events = [];
  const traces = [];
  const collect = (event) => {
    events.push(event);
  };
  const collectTrace = (traceRecord) => {
    traces.push(traceRecord);
  };
  // 流 1：WHY 完成。
  const rt1 = new ExperienceRuntime({ eventSink: collect, decisionTraceSink: collectTrace });
  const chain1 = await setupChain(rt1, { rawInput: '为什么' });
  const sub1 = await rt1.submitExperienceEvent({
    experienceId: chain1.exp.experienceId,
    sessionId: chain1.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: chain1.exp.stateVersion,
    requestId: 'req-min-1a',
  });
  await consume(sub1.stream);
  // 流 2：CHANGE。
  const rt2 = new ExperienceRuntime({ eventSink: collect, decisionTraceSink: collectTrace });
  const chain2 = await setupChain(rt2, { rawInput: '为什么' });
  const sub2a = await rt2.submitExperienceEvent({
    experienceId: chain2.exp.experienceId,
    sessionId: chain2.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: chain2.exp.stateVersion,
    requestId: 'req-min-2a',
  });
  const iterator2 = sub2a.stream[Symbol.asyncIterator]();
  await iterator2.next();
  await iterator2.next();
  const state2 = rt2.getExperienceState(chain2.exp.experienceId);
  const sub2b = await rt2.submitExperienceEvent({
    experienceId: chain2.exp.experienceId,
    sessionId: chain2.session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: state2.state.stateVersion,
    requestId: 'req-min-2b',
  });
  await consume(sub2b.stream);
  for (;;) {
    const next = await iterator2.next();
    if (next.done) break;
  }
  // 流 3：STOP。
  const rt3 = new ExperienceRuntime({ eventSink: collect, decisionTraceSink: collectTrace });
  const chain3 = await setupChain(rt3, { rawInput: '为什么' });
  const sub3a = await rt3.submitExperienceEvent({
    experienceId: chain3.exp.experienceId,
    sessionId: chain3.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: chain3.exp.stateVersion,
    requestId: 'req-min-3a',
  });
  await consume(sub3a.stream);
  const state3 = rt3.getExperienceState(chain3.exp.experienceId);
  const sub3b = await rt3.submitExperienceEvent({
    experienceId: chain3.exp.experienceId,
    sessionId: chain3.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: state3.state.stateVersion,
    requestId: 'req-min-3b',
  });
  await consume(sub3b.stream);
  // 流 4：陈旧写入。
  const rt4 = new ExperienceRuntime({ eventSink: collect, decisionTraceSink: collectTrace });
  const chain4 = await setupChain(rt4, { rawInput: '为什么' });
  const sub4 = await rt4.submitExperienceEvent({
    experienceId: chain4.exp.experienceId,
    sessionId: chain4.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: chain4.exp.stateVersion,
    requestId: 'req-min-4a',
  });
  await consume(sub4.stream);
  await rt4.submitExperienceEvent({
    experienceId: chain4.exp.experienceId,
    sessionId: chain4.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: chain4.exp.stateVersion,
    requestId: 'req-min-4b',
  });
  // 流 5：越权提案。
  const rt5 = new ExperienceRuntime({
    eventSink: collect,
    decisionTraceSink: collectTrace,
    gateway: scriptedGateway({ state_update_proposal: { stage: 'SIMULATION' } }),
  });
  const chain5 = await setupChain(rt5, { rawInput: '如果失去摩擦力会怎样' });
  await rt5.submitExperienceEvent({
    experienceId: chain5.exp.experienceId,
    sessionId: chain5.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果失去摩擦力会怎样',
    expectedStateVersion: chain5.exp.stateVersion,
    requestId: 'req-min-5a',
  });

  // S1 §23 最低事件集 → C6 权威名（调和表见迭代记录 §4）。
  const required = {
    session_started: 'session_started',
    intent_created: 'intent_received（C6 §12 权威名）',
    experience_started: 'experience_started',
    user_action: 'why_requested / change_direction_requested / stop_requested（C6 §14）',
    semantic_action_detected: 'intent_parsed（携带 semantic_action 属性）',
    policy_decided: 'policy_decided',
    generation_started: 'generation_started',
    generation_completed: 'generation_completed',
    generation_cancelled: 'generation_cancelled',
    state_transitioned: 'state_transitioned',
    change_direction_requested: 'change_direction_requested',
    stop_requested: 'stop_requested',
    experience_completed: 'experience_completed',
    state_write_rejected: 'state_write_rejected',
    version_conflict: 'state_version_conflict（C6 §21 权威名）',
  };
  const observedTypes = new Set(events.map((event) => event.event_type));
  const missing = [];
  if (!observedTypes.has('session_started')) missing.push('session_started');
  if (!observedTypes.has('intent_received')) missing.push('intent_created→intent_received');
  if (!observedTypes.has('experience_started')) missing.push('experience_started');
  if (!observedTypes.has('why_requested') && !observedTypes.has('question_asked')) missing.push('user_action→交互事件');
  if (!observedTypes.has('intent_parsed')) missing.push('semantic_action_detected→intent_parsed');
  if (!observedTypes.has('policy_decided')) missing.push('policy_decided');
  if (!observedTypes.has('generation_started')) missing.push('generation_started');
  if (!observedTypes.has('generation_completed')) missing.push('generation_completed');
  if (!observedTypes.has('generation_cancelled')) missing.push('generation_cancelled');
  if (!observedTypes.has('state_transitioned')) missing.push('state_transitioned');
  if (!observedTypes.has('change_direction_requested')) missing.push('change_direction_requested');
  if (!observedTypes.has('stop_requested')) missing.push('stop_requested');
  if (!observedTypes.has('experience_completed')) missing.push('experience_completed');
  if (!observedTypes.has('state_write_rejected')) missing.push('state_write_rejected');
  if (!observedTypes.has('state_version_conflict')) missing.push('version_conflict→state_version_conflict');
  // intent_parsed 必须携带 semantic_action 属性（semantic_action_detected 的实现）。
  const parsedEvents = events.filter((event) => event.event_type === 'intent_parsed');
  const parsedCarriesAction = parsedEvents.every((event) => typeof event.properties.semantic_action === 'string');
  const expected = {
    minimumSet: 'S1 §23 全部 15 项最低事件在联合全流程中发出（C6 权威名，调和表登记于迭代记录）',
  };
  const actual = {
    observedTypes: [...observedTypes].sort(),
    missing,
    intentParsedCount: parsedEvents.length,
    parsedCarriesSemanticAction: parsedCarriesAction,
    decisionTraceCount: traces.length,
  };
  const pass = missing.length === 0 && parsedCarriesAction;
  return { expected, actual, pass };
}

// --- C6 §27 幂等：event_id 去重 --------------------------------------------
async function caseC6Idempotency(trace) {
  const recorded = [];
  const recorder = new EventRecorder((event) => {
    recorded.push(event);
  });
  const identity = { user_id: 'user_synthetic_001', session_id: 'session_idempotency_test' };
  const context = { experience_id: null, intent_id: null, state_version: null, request_id: null };
  const source = { layer: 'runtime', component: 'idempotency-test' };
  const first = recorder.build('session_started', { identity, context, source, eventId: 'evtidempotency0001' });
  const second = recorder.build('session_started', { identity, context, source, eventId: 'evtidempotency0001' });
  const resultFirst = await recorder.record(first);
  const resultSecond = await recorder.record(second);
  const expected = {
    idempotency: '相同 event_id 的第二次记录被拒绝——不产生两条逻辑事实（C6 §27）',
  };
  const actual = {
    firstRecord: resultFirst.ok ? 'recorded' : resultFirst.reason,
    secondRecord: resultSecond.ok ? 'recorded（缺陷！）' : resultSecond.reason,
    sinkEntryCount: recorded.length,
    hasRecorded: recorder.hasRecorded('evtidempotency0001'),
  };
  const pass = resultFirst.ok && !resultSecond.ok && recorded.length === 1 && actual.hasRecorded;
  return { expected, actual, pass };
}

// --- C6 §22/§23 决策追踪分离 ------------------------------------------------
async function caseC6DecisionTraceSeparation(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-c6t-1',
  });
  await consume(sub.stream);
  const decisionTrace = traces[0];
  const llmEvents = eventsOf(events, 'llm_request_started').concat(eventsOf(events, 'llm_request_completed'));
  const policyEvents = eventsOf(events, 'policy_decided');
  const stateEvents = eventsOf(events, 'state_transitioned');
  const expected = {
    separation: 'LLM Trace（llm_request_*）与 Policy Trace（policy_decided + 决策追踪）与 State Transition（state_transitioned）分离记录——不得合并为一条 ai_response（C6 §23）',
    decisionTrace: 'C6 §22 结构完整（decision_id/session_id/experience_id/input_event/semantic_action/state_before/policy/reason/execution/state_after/user_override）',
  };
  const actual = {
    decisionTraceKeys: decisionTrace ? Object.keys(decisionTrace).sort() : null,
    llmEventCount: llmEvents.length,
    policyEventCount: policyEvents.length,
    stateEventCount: stateEvents.length,
    traceSemanticAction: decisionTrace?.semantic_action ?? null,
    traceSelectedAction: decisionTrace?.policy?.selected_action ?? null,
    tracePolicyVersion: decisionTrace?.policy?.policy_version ?? null,
    traceLlmUsed: decisionTrace?.execution?.llm_used ?? null,
    traceStateAfter: decisionTrace?.state_after ?? null,
  };
  const requiredTraceKeys = [
    'decision_id', 'session_id', 'experience_id', 'input_event', 'semantic_action',
    'intent_before', 'state_before', 'policy', 'reason', 'execution', 'state_after',
    'user_override', 'at',
  ];
  const traceComplete = decisionTrace !== undefined && requiredTraceKeys.every((key) => key in decisionTrace);
  const pass =
    traceComplete &&
    llmEvents.length === 2 &&
    policyEvents.length === 1 &&
    stateEvents.length === 2 &&
    actual.traceSemanticAction === 'WHY' &&
    actual.traceSelectedAction === 'EXPLAIN' &&
    actual.tracePolicyVersion === 'policy_v1.0.0' &&
    actual.traceLlmUsed === true &&
    actual.traceStateAfter !== null;
  return { expected, actual, pass };
}

// --- F-1 回归（进程内形态）：流式端点行为不变 ------------------------------
async function caseF1RegressionInProc(trace) {
  // F1-STREAM：WHY 完整流。
  const auditStream = [];
  const streamResult = await handleExperienceStreamRequest({
    method: 'POST',
    body: JSON.stringify({ semanticAction: 'WHY' }),
    audit: (event) => {
      auditStream.push(event);
    },
  });
  const streamEvents = await readStreamEvents(streamResult.body);
  // F1-ABORT：流中取消。
  const auditAbort = [];
  const abortController = new AbortController();
  const abortResult = await handleExperienceStreamRequest({
    method: 'POST',
    body: JSON.stringify({ semanticAction: 'WHY' }),
    signal: abortController.signal,
    audit: (event) => {
      auditAbort.push(event);
    },
  });
  const partial = await readStreamEventsPartial(abortResult.body, 2);
  abortController.abort();
  const abortRest = await readStreamEventsRest(partial.reader, partial.decoder, partial.buffer);
  // F1-STOP：策略 STOP。
  const auditStop = [];
  const stopResult = await handleExperienceStreamRequest({
    method: 'POST',
    body: JSON.stringify({ semanticAction: 'STOP' }),
    audit: (event) => {
      auditStop.push(event);
    },
  });
  const stopEvents = await readStreamEvents(stopResult.body);
  // F1-NEG：表外动作。
  const negResult = await handleExperienceStreamRequest({
    method: 'POST',
    body: JSON.stringify({ semanticAction: 'CREATE' }),
    audit: () => undefined,
  });
  const expected = {
    regression: 'F-1 端点（POST /api/experience/stream）行为不变：完整流/流中取消/策略 STOP/表外动作拒绝',
  };
  const actual = {
    streamStatus: streamResult.status,
    streamChunkCount: streamEvents.filter((event) => event.type === 'chunk').length,
    streamContent: contentOf(streamEvents),
    streamContentEqualsFixture: contentOf(streamEvents) === why.chunks.join(''),
    abortRestTypes: abortRest.map((event) => event.type),
    abortCancelledIndex: abortRest.find((event) => event.type === 'cancelled')?.index ?? null,
    stopStatus: stopResult.status,
    stopTypes: stopEvents.map((event) => event.type),
    negStatus: negResult.status,
  };
  const negBody = negResult.body ? await readStreamEvents(negResult.body) : [];
  const pass =
    streamResult.status === 200 &&
    actual.streamChunkCount === why.chunks.length &&
    actual.streamContentEqualsFixture &&
    abortRest.length === 1 &&
    abortRest[0].type === 'cancelled' &&
    abortRest[0].index === 2 &&
    stopResult.status === 200 &&
    stopEvents.length === 1 &&
    stopEvents[0].type === 'stopped' &&
    negResult.status === 400 &&
    negBody[0]?.error === 'ACTION_OUT_OF_S1_SCOPE';
  return { expected, actual: { ...actual, negBody: negBody[0] ?? null }, pass };
}

// ---------------------------------------------------------------------------
// 案例运行器（HTTP 形态：真实 Next.js 生产服务器）
// ---------------------------------------------------------------------------
async function httpJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, payload, text };
}

async function httpCaseSessionStart(trace, requestId) {
  const result = await httpJson('/api/session/start', { method: 'POST', body: '{}' });
  return result;
}

// --- HTTP-01：Session 启动 --------------------------------------------------
async function caseHttp01SessionStart(trace, auditOffset) {
  const result = await httpJson('/api/session/start', { method: 'POST', body: '{}' });
  const { events: newEvents, newOffset } = await httpLogSlice(httpEventLogPath, auditOffset);
  const expected = {
    status: 200,
    response: '{ session_id, state: "SESSION_IDLE", created_at }',
    serverEvent: 'session_started 登记于服务端事件日志',
  };
  const actual = {
    status: result.status,
    payload: result.payload,
    newEventTypes: newEvents.map((event) => event.event_type),
  };
  const pass =
    result.status === 200 &&
    typeof result.payload?.session_id === 'string' &&
    result.payload?.state === 'SESSION_IDLE' &&
    newEvents.some((event) => event.event_type === 'session_started');
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- HTTP-02：意图解析 ------------------------------------------------------
async function caseHttp02IntentResolve(trace, auditOffset) {
  const sessionResult = await httpJson('/api/session/start', { method: 'POST', body: '{}' });
  const sessionId = sessionResult.payload?.session_id;
  const result = await httpJson('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-http-f2-02',
      session_id: sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const expected = {
    status: 200,
    response: '{ semantic_action: "WHY", action: "start_experience", confidence: 1 }',
    constraint: '不修改 ExperienceState（API §10.1）',
  };
  const actual = { status: result.status, payload: result.payload };
  const pass =
    result.status === 200 &&
    result.payload?.semantic_action === 'WHY' &&
    result.payload?.action === 'start_experience';
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- HTTP-03：体验启动 ------------------------------------------------------
async function caseHttp03ExperienceStart(trace, auditOffset) {
  const sessionResult = await httpJson('/api/session/start', { method: 'POST', body: '{}' });
  const sessionId = sessionResult.payload?.session_id;
  const intentResult = await httpJson('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-http-f2-03a',
      session_id: sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const intentId = intentResult.payload?.intent?.intent_id;
  const result = await httpJson('/api/experience/start', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-http-f2-03b',
      session_id: sessionId,
      intent_id: intentId,
    }),
  });
  const expected = {
    status: 200,
    response: '{ experience_id, experience_version: "1.0.0", state_version: 2, state.status: "READY" }',
  };
  const actual = { status: result.status, payload: result.payload };
  const pass =
    result.status === 200 &&
    result.payload?.state_version === 2 &&
    result.payload?.state?.status === 'READY';
  return { expected, actual, pass, newAuditOffset: auditOffset, context: { sessionId, intentId, experienceId: result.payload?.experience_id } };
}

// --- HTTP-04：状态查询（Query 不改变状态） -----------------------------------
async function caseHttp04StateQuery(trace, auditOffset) {
  const setup = await httpCase03Setup();
  // Query/Command 分离（API §2.3）：两次 GET 之间事件日志字节数不得
  // 推进——setup（Command）产生的事件属于前置，不属于查询本身。
  const preGet = await httpLogSize(httpEventLogPath);
  const first = await httpJson(`/api/experience/${setup.experienceId}/state`, { method: 'GET' });
  const second = await httpJson(`/api/experience/${setup.experienceId}/state`, { method: 'GET' });
  const postGet = await httpLogSize(httpEventLogPath);
  const expected = {
    status: 200,
    response: '{ experience_id, state_version: 2, state }',
    queryOnly: '两次查询状态版本不变；查询不产生任何事件（日志字节数在两次 GET 间不变）',
  };
  const actual = {
    first: { status: first.status, stateVersion: first.payload?.state_version },
    second: { status: second.status, stateVersion: second.payload?.state_version },
    logSizeBeforeGet: preGet,
    logSizeAfterGet: postGet,
  };
  const pass =
    first.status === 200 &&
    first.payload?.state_version === 2 &&
    second.payload?.state_version === 2 &&
    preGet === postGet;
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

/** HTTP 案例公共前置：session → intent → experience。 */
async function httpCase03Setup() {
  const sessionResult = await httpJson('/api/session/start', { method: 'POST', body: '{}' });
  const sessionId = sessionResult.payload?.session_id;
  const intentResult = await httpJson('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-http-setup-${Math.random().toString(16).slice(2, 8)}`,
      session_id: sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const intentId = intentResult.payload?.intent?.intent_id;
  const expResult = await httpJson('/api/experience/start', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-http-setup-${Math.random().toString(16).slice(2, 8)}`,
      session_id: sessionId,
      intent_id: intentId,
    }),
  });
  return {
    sessionId,
    intentId,
    experienceId: expResult.payload?.experience_id,
    stateVersion: expResult.payload?.state_version,
  };
}

// --- HTTP-05：体验事件端到端（NDJSON 流） ------------------------------------
async function caseHttp05ExperienceEvent(trace, auditOffset) {
  const setup = await httpCase03Setup();
  const response = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: 'req-http-f2-05',
      session_id: setup.sessionId,
      state_version: setup.stateVersion,
      event: { type: 'user_action', semantic_action: 'WHY', raw_input: '为什么？', source: 'text' },
    }),
  });
  const streamEvents = await readStreamEvents(response.body);
  const { events: newEvents, newOffset } = await httpLogSlice(httpEventLogPath, auditOffset);
  const experienceEvents = newEvents.filter((event) => event.context.experience_id === setup.experienceId);
  const expected = {
    status: 200,
    stream: '首行 submission（API §11.3 响应结构）→ chunks → done → state_updated（v4）',
    serverChain: 'why_requested → policy_decided → generation_started → llm_request_* → llm_output_validated → state_transitioned → generation_completed → runtime_waiting',
  };
  const actual = {
    status: response.status,
    contentType: response.headers.get('content-type'),
    streamTypes: streamEvents.map((event) => event.type),
    headerPolicy: streamEvents[0]?.policy_decision?.selected_action ?? null,
    finalStateVersion: streamEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    serverEventTypes: experienceEvents.map((event) => event.event_type),
  };
  const required = [
    'why_requested',
    'policy_decided',
    'generation_started',
    'llm_request_started',
    'llm_request_completed',
    'llm_output_validated',
    'state_transitioned',
    'generation_completed',
    'runtime_waiting',
  ];
  const pass =
    response.status === 200 &&
    streamEvents[0]?.type === 'submission' &&
    actual.headerPolicy === 'EXPLAIN' &&
    streamEvents.some((event) => event.type === 'done') &&
    actual.finalStateVersion === 4 &&
    required.every((type) => actual.serverEventTypes.includes(type));
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- HTTP-06：陈旧版本写入 → 409 ---------------------------------------------
async function caseHttp06StaleVersion(trace, auditOffset) {
  const setup = await httpCase03Setup();
  const eventInput = (requestId, stateVersion) => ({
    method: 'POST',
    body: JSON.stringify({
      request_id: requestId,
      session_id: setup.sessionId,
      state_version: stateVersion,
      event: { type: 'user_action', semantic_action: 'WHY', raw_input: '为什么？', source: 'text' },
    }),
  });
  const first = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, eventInput('req-http-f2-06a', setup.stateVersion));
  await readStreamEvents(first.body);
  const stale = await httpJson(`/api/experience/${setup.experienceId}/event`, eventInput('req-http-f2-06b', setup.stateVersion));
  const { events: newEvents, newOffset } = await httpLogSlice(httpEventLogPath, auditOffset);
  const expected = {
    staleWrite: '409 { code: "STATE_VERSION_CONFLICT", retryable: false }——不覆盖新状态',
    serverEvent: 'state_version_conflict 登记于服务端事件日志',
  };
  const actual = {
    staleStatus: stale.status,
    stalePayload: stale.payload,
    conflictEvents: newEvents.filter((event) => event.event_type === 'state_version_conflict').length,
  };
  const pass =
    stale.status === 409 &&
    stale.payload?.code === 'STATE_VERSION_CONFLICT' &&
    stale.payload?.retryable === false &&
    actual.conflictEvents === 1;
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- HTTP-07：语义动作不匹配 → 400 -------------------------------------------
async function caseHttp07SemanticMismatch(trace, auditOffset) {
  const setup = await httpCase03Setup();
  const result = await httpJson(`/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-http-f2-07',
      session_id: setup.sessionId,
      state_version: setup.stateVersion,
      event: { type: 'user_action', semantic_action: 'STOP', raw_input: '为什么？', source: 'text' },
    }),
  });
  const expected = {
    mismatch: '声明 semantic_action=STOP 但输入分类为 WHY → 400 INVALID_REQUEST（客户端不得注入策略动作）',
  };
  const actual = { status: result.status, payload: result.payload };
  const pass = result.status === 400 && result.payload?.code === 'INVALID_REQUEST';
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- HTTP-08：不可分类输入 → 400 INVALID_ACTION（升级） ----------------------
async function caseHttp08Unclassifiable(trace, auditOffset) {
  const setup = await httpCase03Setup();
  const result = await httpJson(`/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-http-f2-08',
      session_id: setup.sessionId,
      state_version: setup.stateVersion,
      event: { type: 'user_action', semantic_action: 'UNKNOWN', raw_input: '嗯', source: 'text' },
    }),
  });
  const expected = {
    unclassifiable: '无法分类输入 → 400 INVALID_ACTION（未知情况升级而非由 LLM 决定，授权 §5.7）',
  };
  const actual = { status: result.status, payload: result.payload };
  const pass = result.status === 400 && result.payload?.code === 'INVALID_ACTION';
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- HTTP-09：事件端点方法约束 → 405 ------------------------------------------
async function caseHttp09MethodConstraint(trace, auditOffset) {
  const setup = await httpCase03Setup();
  const result = await httpJson(`/api/experience/${setup.experienceId}/event`, { method: 'GET' });
  const expected = { methodConstraint: 'GET /experience/{id}/event → 405 METHOD_NOT_ALLOWED（Command 端点）' };
  const actual = { status: result.status, payload: result.payload };
  const pass = result.status === 405 && result.payload?.error === 'METHOD_NOT_ALLOWED';
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- HTTP-10：STOP 端到端 + ended 会话拒绝 ------------------------------------
async function caseHttp10StopEndToEnd(trace, auditOffset) {
  const setup = await httpCase03Setup();
  const first = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: 'req-http-f2-10a',
      session_id: setup.sessionId,
      state_version: setup.stateVersion,
      event: { type: 'user_action', semantic_action: 'WHY', raw_input: '为什么？', source: 'text' },
    }),
  });
  await readStreamEvents(first.body);
  const stateAfterFirst = await httpJson(`/api/experience/${setup.experienceId}/state`, { method: 'GET' });
  const stop = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: 'req-http-f2-10b',
      session_id: setup.sessionId,
      state_version: stateAfterFirst.payload?.state_version,
      event: { type: 'user_action', semantic_action: 'STOP', raw_input: '好了', source: 'text' },
    }),
  });
  const stopEvents = await readStreamEvents(stop.body);
  const afterStop = await httpJson(`/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-http-f2-10c',
      session_id: setup.sessionId,
      state_version: 5,
      event: { type: 'user_action', semantic_action: 'WHY', raw_input: '为什么？', source: 'text' },
    }),
  });
  const { events: newEvents, newOffset } = await httpLogSlice(httpEventLogPath, auditOffset);
  const expected = {
    stop: 'NDJSON：submission → stopped；体验 COMPLETED；会话 ENDED',
    endedSession: 'STOP 后任何事件提交 → 4xx INVALID_STATE_TRANSITION',
  };
  const actual = {
    stopStreamTypes: stopEvents.map((event) => event.type),
    afterStopStatus: afterStop.status,
    afterStopCode: afterStop.payload?.code,
    sessionEndedEvents: newEvents.filter((event) => event.event_type === 'session_ended').length,
  };
  const pass =
    stopEvents[0]?.type === 'submission' &&
    stopEvents.some((event) => event.type === 'stopped') &&
    afterStop.status === 400 &&
    afterStop.payload?.code === 'INVALID_STATE_TRANSITION' &&
    actual.sessionEndedEvents === 1;
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- HTTP-11：生成中 CHANGE（中断控制器经真实 HTTP） -------------------------
async function caseHttp11ChangeMidGeneration(trace, auditOffset) {
  const setup = await httpCase03Setup();
  // 生成中：WHY 事件，读取前 2 行后保持连接。
  const response = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: 'req-http-f2-11a',
      session_id: setup.sessionId,
      state_version: setup.stateVersion,
      event: { type: 'user_action', semantic_action: 'WHY', raw_input: '为什么？', source: 'text' },
    }),
  });
  const partial = await readStreamEventsPartial(response.body, 2);
  // 生成中 CHANGE。
  const stateInFlight = await httpJson(`/api/experience/${setup.experienceId}/state`, { method: 'GET' });
  const change = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: 'req-http-f2-11b',
      session_id: setup.sessionId,
      state_version: stateInFlight.payload?.state_version,
      event: { type: 'user_action', semantic_action: 'CHANGE_DIRECTION', raw_input: '换一个', source: 'text' },
    }),
  });
  const changeEvents = await readStreamEvents(change.body);
  // 旧流恢复：取消终止。
  const oldRest = await readStreamEventsRest(partial.reader, partial.decoder, partial.buffer);
  const { events: newEvents, newOffset } = await httpLogSlice(httpEventLogPath, auditOffset);
  const experienceEvents = newEvents.filter((event) => event.context.experience_id === setup.experienceId);
  const expected = {
    changeMidGeneration: '旧 generation 取消（generation_cancelled）+ 旧候选拒绝（experience_interrupted）+ 新方向流完成',
    oldStream: '旧 HTTP 响应以 cancelled 终止，其后零内容分块',
  };
  const actual = {
    inFlightStateVersion: stateInFlight.payload?.state_version,
    changeStreamTypes: changeEvents.map((event) => event.type),
    oldRestTypes: oldRest.map((event) => event.type),
    oldRestChunkCount: oldRest.filter((event) => event.type === 'chunk').length,
    serverEvents: experienceEvents.map((event) => event.event_type),
  };
  const pass =
    stateInFlight.payload?.state_version === 3 &&
    changeEvents[0]?.type === 'submission' &&
    changeEvents.some((event) => event.type === 'state_updated') &&
    actual.oldRestChunkCount === 0 &&
    oldRest.some((event) => event.type === 'cancelled') &&
    actual.serverEvents.includes('generation_cancelled') &&
    actual.serverEvents.includes('experience_interrupted') &&
    actual.serverEvents.includes('change_direction_requested');
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- HTTP-12：F-1 流式端点回归（HTTP 形态） -----------------------------------
async function caseHttp12F1StreamRegression(trace, auditOffset, auditLogOffset) {
  const response = await fetch(`${BASE_URL}/api/experience/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semanticAction: 'WHY' }),
  });
  const streamEvents = await readStreamEvents(response.body);
  // 审计汇与事件日志是两个独立文件——使用独立的审计日志偏移。
  const { events: newEvents, newOffset } = await httpLogSlice(httpAuditPath, auditLogOffset);
  const expected = {
    regression: 'F-1 端点（POST /api/experience/stream）HTTP 形态不变：NDJSON 分块流，内容逐字节等于合成语料，服务端审计汇登记',
  };
  const actual = {
    status: response.status,
    contentType: response.headers.get('content-type'),
    chunkCount: streamEvents.filter((event) => event.type === 'chunk').length,
    contentEqualsFixture: contentOf(streamEvents) === why.chunks.join(''),
    auditEvents: newEvents.map((event) => event.type),
  };
  const pass =
    response.status === 200 &&
    actual.chunkCount === why.chunks.length &&
    actual.contentEqualsFixture &&
    newEvents.some((event) => event.type === 'done');
  return { expected, actual, pass, newAuditOffset: auditOffset, newAuditLogOffset: newOffset };
}

// ---------------------------------------------------------------------------
// 案例注册表
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'GS-01-POS',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-01；Evaluation System V1 Golden Cases / Direct Answer；API V1 Case 01；CC04 显式回答不被预设体验覆盖',
    scope: 'S1 核心（Golden Subset）',
    precondition: '运行时已实施 S1-01/02/03/04/05/06/07/08/09/11/12 组件；合成语料 fixture 已登记',
    inputFault: '无（正向）',
    run: caseGs01Positive,
  },
  {
    caseId: 'GS-01-DET',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-01 负向：模型异常时不得改写用户意图；acceptance-mapping §A GS-01 负向案例',
    scope: 'S1 核心（负向）',
    precondition: '分类器为确定性规则（无模型路径）',
    inputFault: '重复输入 20 次；探索进行中显式直接回答',
    run: caseGs01Determinism,
  },
  {
    caseId: 'GS-02-POS',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-02；Evaluation System V1 G02 Why；API V1 Case 02',
    scope: 'S1 核心（Golden Subset）',
    precondition: '同 GS-01-POS',
    inputFault: '无（正向）；负向校验：不得误作 STOP/CHANGE',
    run: caseGs02Positive,
  },
  {
    caseId: 'GS-03-POS',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-03；S1-CC20 / S1-CC02-H03；API V1 Case 03；状态机 §7；S1 §11/§21',
    scope: 'S1 核心（Golden Subset）',
    precondition: '生成在途（ACTIVE v3）',
    inputFault: '无（正向）：生成中 CHANGE_DIRECTION',
    run: caseGs03Positive,
  },
  {
    caseId: 'GS-03-H03',
    form: 'in-process',
    sourceClause: 'S1-10 Critical（旧 operation 不得提交）；CC02 H03；S1 §11 Critical',
    scope: 'S1 核心（负向）',
    precondition: 'CHANGE 已完成，新 generation 生效',
    inputFault: '旧 generation 迟到达完成提交',
    run: caseGs03StaleGeneration,
  },
  {
    caseId: 'GS-03-DUP',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-03 负向：重复请求；C6 §27；API §2.4 幂等',
    scope: 'S1 核心（负向）',
    precondition: '同 request_id 的首次提交已接受',
    inputFault: '重复 request_id 提交',
    run: caseGs03Duplicate,
  },
  {
    caseId: 'GS-04-POS',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-04；S1-CC19 / S1-CC02-H02；Evaluation System P0 STOP blocker；API V1 Case 04；S1 §20',
    scope: 'S1 核心（Golden Subset）；任何违规为 P0 阻断',
    precondition: '体验 WAITING（响应完成）',
    inputFault: '无（正向）：STOP 终止',
    run: caseGs04Positive,
  },
  {
    caseId: 'GS-04-DUP',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-04 负向：重复 STOP',
    scope: 'S1 核心（负向）',
    precondition: '体验已 COMPLETED、会话已 ENDED',
    inputFault: '重复 STOP 提交',
    run: caseGs04DuplicateStop,
  },
  {
    caseId: 'GS-04-NOCONT',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-04 负向：后台 retry / continuation；CC02 H02（STOP 后未授权 continuation 为 P0）',
    scope: 'S1 核心（负向）；P0 硬边界',
    precondition: 'STOP 已完成',
    inputFault: 'STOP 后事件日志完整性 + 后续提交',
    run: caseGs04NoContinuation,
  },
  {
    caseId: 'GS-04-MIDGEN',
    form: 'in-process',
    sourceClause: 'S1-CC02-GXC02（生成中 STOP）；acceptance-mapping §A GS-04 负向：生成中 STOP 后旧结果返回',
    scope: 'S1 核心（负向）；P0 硬边界',
    precondition: '生成在途（客户端 AbortSignal）',
    inputFault: '客户端中止后旧结果不得返回；随后 STOP 从 ACTIVE 终止',
    run: caseGs04MidGenerationAbort,
  },
  {
    caseId: 'GS-05-STALE',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-05；S1 state-version / stale-write contract；CC02 stale-write cases；API V1 Case 05；S1 §12',
    scope: 'S1 核心（Golden Subset）',
    precondition: '体验已推进至 v4',
    inputFault: '陈旧 expected_state_version（v2）写入',
    run: caseGs05StaleWrite,
  },
  {
    caseId: 'GS-05-CONC',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-05 负向：并发两个写入；S1 §12 示例语义',
    scope: 'S1 核心（负向）',
    precondition: '体验 v2；两个并发写入均携带 expected_state_version=2',
    inputFault: '并发同版本双写',
    run: caseGs05Concurrent,
  },
  {
    caseId: 'GS-05-REC',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-05 负向：冲突恢复不得丢失最新状态',
    scope: 'S1 核心（负向）',
    precondition: '陈旧写入已被拒绝',
    inputFault: '以刷新版本重新提交',
    run: caseGs05Recovery,
  },
  {
    caseId: 'GS-06-MUT',
    form: 'in-process',
    sourceClause: 'S1 §26 GS-06；C07–C08 / C07–C09；S1-CC01、S1-CC02-H01/H05；CC02 Runtime single-writer 约束；S1 §17',
    scope: 'S1 核心（Golden Subset）',
    precondition: '脚本化 LLM 网关注入越权提案（经 LlmGateway 同一接口）',
    inputFault: 'LLM 提案携带非空 state_update_proposal',
    run: caseGs06StateMutation,
  },
  {
    caseId: 'GS-06-FORGED',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-06 负向：伪造合法字段',
    scope: 'S1 核心（负向）',
    precondition: '脚本化网关',
    inputFault: 'state_update_proposal 携带合法外观状态字段',
    run: caseGs06ForgedFields,
  },
  {
    caseId: 'GS-06-EXTRA',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-06 负向：额外字段；S1 §16 提案结构',
    scope: 'S1 核心（负向）',
    precondition: '脚本化网关',
    inputFault: '提案携带结构外字段 policy_override',
    run: caseGs06ExtraFields,
  },
  {
    caseId: 'GS-06-NESTED',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-06 负向：嵌套状态变更',
    scope: 'S1 核心（负向）',
    precondition: '脚本化网关',
    inputFault: 'state_update_proposal 携带嵌套变更对象',
    run: caseGs06NestedMutation,
  },
  {
    caseId: 'GS-06-BYPASS',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A GS-06 负向：策略绕过；S1 §15 P-05',
    scope: 'S1 核心（负向）',
    precondition: '脚本化网关',
    inputFault: '提案携带 forced_action 字段',
    run: caseGs06PolicyBypass,
  },
  {
    caseId: 'WHATIF-POS',
    form: 'in-process',
    sourceClause: 'S1 §11/§14 WHAT_IF → SIMULATE；PODR-001 / PD-06；E8-G2-CC07（假设/事实/模拟结果分离）；acceptance-mapping §A S1-ACT-WHAT_IF',
    scope: 'S1 契约动作（非 Golden 编号）',
    precondition: '同 GS-01-POS',
    inputFault: '无（正向）：单次模拟提案',
    run: caseWhatIfPositive,
  },
  {
    caseId: 'WHATIF-STOP',
    form: 'in-process',
    sourceClause: 'acceptance-mapping §A S1-ACT-WHAT_IF 负向：输入含 STOP 时 STOP 优先；S1 §15 P-01',
    scope: 'S1 契约动作（负向）',
    precondition: '分类器确定性规则',
    inputFault: '输入同时含 WHAT_IF 与 STOP 标记',
    run: caseWhatIfStopPriority,
  },
  {
    caseId: 'ILLEGAL-TRANS',
    form: 'in-process',
    sourceClause: 'S1-04（非法 transition = reject）；状态机 §7/§23；S1 §28 INVALID_STATE_TRANSITION',
    scope: 'S1 核心（负向）',
    precondition: '生成在途（ACTIVE）；体验 COMPLETED',
    inputFault: '生成中常规输入；终态操作',
    run: caseIllegalTransition,
  },
  {
    caseId: 'SESSION-ENDED',
    form: 'in-process',
    sourceClause: 'S1-01（ended 后旧操作拒绝）；状态机 §4.4；S1 §27 API',
    scope: 'S1 核心（负向）',
    precondition: '会话 SESSION_ENDED',
    inputFault: '意图解析 / 体验启动 / 体验事件',
    run: caseSessionEnded,
  },
  {
    caseId: 'C6-ENVELOPE',
    form: 'in-process',
    sourceClause: 'C6 §7 Event Envelope；C6 §6 Event Identity',
    scope: 'C6 事件契约',
    precondition: '完整流程（WHY 完成 + STOP）的事件日志',
    inputFault: '无（正向契约校验）',
    run: caseC6Envelope,
  },
  {
    caseId: 'C6-ORDER',
    form: 'in-process',
    sourceClause: 'C6 §25 Event Ordering（同一 Experience Runtime 内状态相关事件确定逻辑顺序）',
    scope: 'C6 事件契约',
    precondition: '多轮交互（WHY → DIRECT_ANSWER → STOP）的事件日志',
    inputFault: '无（正向契约校验）',
    run: caseC6Ordering,
  },
  {
    caseId: 'C6-MINSET',
    form: 'in-process',
    sourceClause: 'S1 §23 S1 最低事件集；C6 §10–§21 事件分类；名称调和表（迭代记录 §4）',
    scope: 'C6 事件契约',
    precondition: '五条联合流程（WHY/CHANGE/STOP/陈旧写入/越权提案）',
    inputFault: '无（正向契约校验）',
    run: caseC6MinimumSet,
  },
  {
    caseId: 'C6-IDEMPOTENT',
    form: 'in-process',
    sourceClause: 'C6 §27 Idempotency（相同 event_id 不得产生两条逻辑事实）',
    scope: 'C6 事件契约',
    precondition: '独立 EventRecorder（白盒：事件摄入路径）',
    inputFault: '相同 event_id 重复记录',
    run: caseC6Idempotency,
  },
  {
    caseId: 'C6-TRACE-SEP',
    form: 'in-process',
    sourceClause: 'C6 §22 Decision Trace；C6 §23 LLM Trace 与 Policy Trace 必须分离；S1 §25',
    scope: 'C6 事件契约',
    precondition: 'WHY 完成流程',
    inputFault: '无（正向契约校验）',
    run: caseC6DecisionTraceSeparation,
  },
  {
    caseId: 'F1-REG-INPROC',
    form: 'in-process',
    sourceClause: 'F-1 回归：P3-S1-IMPL-AUTH-01 §3 F-1（流式端点行为不变）',
    scope: '回归（F-1 义务）',
    precondition: 'F-1 端点代码未变更（git 字节一致）',
    inputFault: '完整流 / 流中取消 / 策略 STOP / 表外动作',
    run: caseF1RegressionInProc,
  },
  {
    caseId: 'HTTP-01',
    form: 'http',
    sourceClause: 'S1 §27 POST /session/start；S1-01；状态机 §4',
    scope: 'HTTP 形态（真实 Next.js 生产服务器）',
    precondition: '服务器运行中（next start）',
    inputFault: '无（正向）',
    run: caseHttp01SessionStart,
  },
  {
    caseId: 'HTTP-02',
    form: 'http',
    sourceClause: 'S1 §27 POST /intent/resolve；API §10.1（不直接修改 ExperienceState）',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '无（正向）',
    run: caseHttp02IntentResolve,
  },
  {
    caseId: 'HTTP-03',
    form: 'http',
    sourceClause: 'S1 §27 POST /experience/start；API §11.1（不得由 Frontend 自己创建 ExperienceState）',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '无（正向）',
    run: caseHttp03ExperienceStart,
  },
  {
    caseId: 'HTTP-04',
    form: 'http',
    sourceClause: 'S1 §27 GET /experience/{id}/state；API §11.2/§2.3（Query 不改变任何状态）',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '无（正向：重复查询版本不变）',
    run: caseHttp04StateQuery,
  },
  {
    caseId: 'HTTP-05',
    form: 'http',
    sourceClause: 'S1 §27 POST /experience/{id}/event；API §11.3 执行链',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '无（正向：端到端 NDJSON 流 + 服务端事件链）',
    run: caseHttp05ExperienceEvent,
  },
  {
    caseId: 'HTTP-06',
    form: 'http',
    sourceClause: 'S1 §12；API §22 错误契约（STATE_VERSION_CONFLICT）',
    scope: 'HTTP 形态',
    precondition: '体验已推进',
    inputFault: '陈旧 state_version 提交',
    run: caseHttp06StaleVersion,
  },
  {
    caseId: 'HTTP-07',
    form: 'http',
    sourceClause: 'API §11.3 Semantic validation；运行时语义校验（客户端不得注入策略动作）',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '声明动作与输入分类不一致',
    run: caseHttp07SemanticMismatch,
  },
  {
    caseId: 'HTTP-08',
    form: 'http',
    sourceClause: '授权 §5.7（未知情况升级）；S1 §28 INVALID_ACTION',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '不可分类输入',
    run: caseHttp08Unclassifiable,
  },
  {
    caseId: 'HTTP-09',
    form: 'http',
    sourceClause: 'API §2.3（Query 与 Command 分离）；方法约束',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: 'GET 访问 Command 端点',
    run: caseHttp09MethodConstraint,
  },
  {
    caseId: 'HTTP-10',
    form: 'http',
    sourceClause: 'S1 §20；GS-04；S1-01（ended 后旧操作拒绝）',
    scope: 'HTTP 形态',
    precondition: '服务器运行中',
    inputFault: '无（正向 STOP）+ 负向（ended 会话提交）',
    run: caseHttp10StopEndToEnd,
  },
  {
    caseId: 'HTTP-11',
    form: 'http',
    sourceClause: 'S1 §11/§21；GS-03；S1-10（中断控制器经真实 HTTP）',
    scope: 'HTTP 形态',
    precondition: '生成在途（HTTP 响应流读取中）',
    inputFault: '无（正向：生成中 CHANGE）',
    run: caseHttp11ChangeMidGeneration,
  },
  {
    caseId: 'HTTP-12',
    form: 'http',
    sourceClause: 'F-1 回归（HTTP 形态）：P3-S1-IMPL-AUTH-01 §3 F-1',
    scope: 'HTTP 形态（回归）',
    precondition: '服务器运行中',
    inputFault: '无（正向：F-1 流式端点行为不变）',
    run: caseHttp12F1StreamRegression,
  },
];

// ---------------------------------------------------------------------------
// 静态无出口扫描（断言 A21）：产品运行时源码不得含真实出口调用
// ---------------------------------------------------------------------------
const FORBIDDEN_PATTERNS = [
  { pattern: /\bfetch\s*\(/, label: 'fetch() 调用' },
  { pattern: /http\.request|https\.request/, label: 'http(s).request 调用' },
  { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
  { pattern: /WebSocket/, label: 'WebSocket' },
  { pattern: /openai|anthropic|claude|gemini|gpt-|langchain|mistral|cohere|bedrock|vertex/, label: 'LLM 提供方引用', ignoreCase: true },
  { pattern: /api[_-]?key|secret|token|credential|password/, label: '凭据引用', ignoreCase: true },
];

async function staticNoEgressScan() {
  const scanDirs = [path.join(repoRoot, 'src', 'experience')];
  const extraDirs = [path.join(repoRoot, 'app', 'api')];
  const files = [];
  for (const dir of [...scanDirs, ...extraDirs]) {
    for (const entry of await readdir(dir, { recursive: true })) {
      const full = path.join(dir, entry);
      if ((await stat(full)).isFile() && /\.(ts|tsx)$/.test(full)) files.push(full);
    }
  }
  const results = [];
  let clean = true;
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const matches = [];
    for (const { pattern, label, ignoreCase } of FORBIDDEN_PATTERNS) {
      const regex = ignoreCase ? new RegExp(pattern.source, 'i') : pattern;
      if (regex.test(content)) matches.push(label);
    }
    if (matches.length > 0) clean = false;
    results.push({
      file: path.relative(repoRoot, file),
      sha256: sha256OfBuffer(Buffer.from(content, 'utf8')),
      forbiddenMatches: matches,
    });
  }
  return { clean, files: results };
}

// ---------------------------------------------------------------------------
// Main
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1-E2E-0001).
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
  // (neutral name; the iteration record registers each attempt's outcome),
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

  // Start the HTTP server (real Next.js production server).
  log(`starting HTTP server: next start -p ${PORT} (EXPERIENCE_EVENT_LOG / EXPERIENCE_DECISION_TRACE_LOG / EXPERIENCE_AUDIT_LOG → traces/)`);
  const server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      EXPERIENCE_EVENT_LOG: httpEventLogPath,
      EXPERIENCE_DECISION_TRACE_LOG: httpDecisionTracePath,
      EXPERIENCE_AUDIT_LOG: httpAuditPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  const serverUp = await waitForServer();
  if (!serverUp) {
    server.kill('SIGTERM');
    fatal(`HTTP server did not become ready within 60s: ${tail(serverLog)}`);
  }
  log(`HTTP server ready at ${BASE_URL}`);

  // Execute cases sequentially.
  const caseResults = [];
  let auditOffset = 0;
  let auditLogOffset = 0;
  for (const definition of CASE_REGISTRY) {
    const trace = new TraceWriter(tracesDir, `${RUN_ID}:${definition.caseId}`);
    await trace.start({ form: definition.form, sourceClause: definition.sourceClause });
    log(`case ${definition.caseId}: RUNNING (${definition.form})`);
    let outcome;
    try {
      outcome = await definition.run(trace, auditOffset, auditLogOffset);
    } catch (error) {
      await trace.emit('executor-error', { error: String(error) });
      outcome = {
        expected: { executed: 'without error' },
        actual: { error: String(error) },
        pass: false,
      };
    }
    const newOffset = outcome.newAuditOffset ?? auditOffset;
    if (outcome.newAuditLogOffset !== undefined) {
      auditLogOffset = outcome.newAuditLogOffset;
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
        'S1 范围边界：CREATE/SEARCH 禁用；WHAT_IF 仅单次模拟不建立持久/多轮分支；不持久化跨会话 Memory（PD-05/PD-06/PD-07）',
        'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
        '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；陈旧写入返回 STATE_VERSION_CONFLICT 且不得覆盖（S1-12）',
        'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）',
        '旧 operation 不得提交（generation epoch 守卫 + 版本双重检查，S1-10；CC02 H03）',
        '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
        '决策追踪与 LLM/Policy/State 事件分离记录（C6 §22/§23）',
        '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方；不收集真实用户数据',
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
        httpEventLog: definition.form === 'http' ? 'traces/http-events.jsonl' : null,
        httpDecisionTraceLog: definition.form === 'http' ? 'traces/http-decision-traces.jsonl' : null,
        httpAuditLog: definition.form === 'http' ? 'traces/http-audit.jsonl' : null,
      },
      result: outcome.pass ? 'PASS' : 'FAIL',
      evaluator: EVALUATOR_SEPARATION,
      defectsFollowUp: outcome.pass
        ? '无（本案例）；G5 16 项评测包仍 NOT RUN；E3 公开发布统计阈值待产品负责人批准'
        : '本案例未通过——按 ADR-0002 §5 如实登记，不得重跑至通过为止；缺陷须在下一迭代处置',
    };
    const validation = validateCaseRecord(caseRecord);
    if (!validation.valid) {
      log(`case ${definition.caseId}: record INVALID ${JSON.stringify(validation)}`);
    }
    await writeCaseRecord(casesDir, caseRecord);
    await trace.complete({ result: caseRecord.result, pass: outcome.pass });
    auditOffset = newOffset;
    caseResults.push({ caseId: definition.caseId, result: caseRecord.result, pass: outcome.pass });
    log(`case ${definition.caseId}: ${caseRecord.result}`);
  }

  // Stop the server.
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    server.on('close', resolve);
    setTimeout(resolve, 5000);
  });
  log('HTTP server stopped');

  // Assertions.
  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  const allCasesPass = caseResults.every((entry) => entry.pass);

  // A3: case records complete for all cases.
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  const recordCheck = recordFiles.length === CASE_REGISTRY.length;
  assert(
    'A3',
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4）`,
    recordCheck && allCasesPass,
    { recordFiles: recordFiles.length, expected: CASE_REGISTRY.length, allCasesPass },
  );

  // A4: traces exist and are non-empty.
  const traceFiles = (await readdir(tracesDir)).filter(
    (name) => name.endsWith('.jsonl') && !['http-events.jsonl', 'http-decision-traces.jsonl', 'http-audit.jsonl'].includes(name),
  );
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (
      await Promise.all(
        traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
      )
    ).every(Boolean);
  assert('A4', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // A5: GS-01.
  const gs01 = caseResults.find((entry) => entry.caseId === 'GS-01-POS');
  const gs01Det = caseResults.find((entry) => entry.caseId === 'GS-01-DET');
  assert(
    'A5',
    'GS-01：DIRECT_ANSWER → ANSWER；内容逐字节等于合成语料；分类确定性 20/20；探索进行中显式回答不被覆盖（CC04）',
    gs01?.pass === true && gs01Det?.pass === true,
    { gs01: gs01?.pass, gs01Det: gs01Det?.pass },
  );

  // A6: GS-02.
  const gs02 = caseResults.find((entry) => entry.caseId === 'GS-02-POS');
  assert(
    'A6',
    'GS-02：WHY → EXPLAIN；内容逐字节等于合成语料；未误作 STOP/CHANGE',
    gs02?.pass === true,
    { gs02: gs02?.pass },
  );

  // A7: GS-03.
  const gs03 = caseResults.find((entry) => entry.caseId === 'GS-03-POS');
  const gs03H03 = caseResults.find((entry) => entry.caseId === 'GS-03-H03');
  const gs03Dup = caseResults.find((entry) => entry.caseId === 'GS-03-DUP');
  assert(
    'A7',
    'GS-03：生成中 CHANGE——旧 generation 取消、旧候选拒绝、新候选生成、新方向流完成、状态迁移合法（v3→v4→v5）；重复请求幂等拒绝',
    gs03?.pass === true && gs03Dup?.pass === true,
    { gs03: gs03?.pass, gs03Dup: gs03Dup?.pass },
  );

  // A8: GS-03 H03 (late old-generation commit).
  assert(
    'A8',
    'GS-03 负向（CC02 H03）：旧 generation 迟到达提交被拒绝（STALE_GENERATION），新状态未被污染，state_write_rejected 登记',
    gs03H03?.pass === true,
    { gs03H03: gs03H03?.pass },
  );

  // A9: GS-04.
  const gs04 = caseResults.find((entry) => entry.caseId === 'GS-04-POS');
  const gs04Dup = caseResults.find((entry) => entry.caseId === 'GS-04-DUP');
  const gs04NoCont = caseResults.find((entry) => entry.caseId === 'GS-04-NOCONT');
  const gs04MidGen = caseResults.find((entry) => entry.caseId === 'GS-04-MIDGEN');
  assert(
    'A9',
    'GS-04：STOP 终止（单一 stopped 事件、零内容分块、体验 COMPLETED、会话 ENDED、四事件齐备）；重复 STOP 拒绝；STOP 后零 continuation（P0）；生成中客户端中止后零后续分块且 STOP 仍可从 ACTIVE 终止',
    gs04?.pass === true && gs04Dup?.pass === true && gs04NoCont?.pass === true && gs04MidGen?.pass === true,
    { gs04: gs04?.pass, gs04Dup: gs04Dup?.pass, gs04NoCont: gs04NoCont?.pass, gs04MidGen: gs04MidGen?.pass },
  );

  // A10: GS-05.
  const gs05Stale = caseResults.find((entry) => entry.caseId === 'GS-05-STALE');
  const gs05Conc = caseResults.find((entry) => entry.caseId === 'GS-05-CONC');
  const gs05Rec = caseResults.find((entry) => entry.caseId === 'GS-05-REC');
  assert(
    'A10',
    'GS-05：陈旧写入 → STATE_VERSION_CONFLICT（409，不覆盖）；并发同版本双写恰好一胜一负；冲突恢复以刷新版本成功且最新状态不丢失',
    gs05Stale?.pass === true && gs05Conc?.pass === true && gs05Rec?.pass === true,
    { gs05Stale: gs05Stale?.pass, gs05Conc: gs05Conc?.pass, gs05Rec: gs05Rec?.pass },
  );

  // A11: GS-06.
  const gs06Cases = ['GS-06-MUT', 'GS-06-FORGED', 'GS-06-EXTRA', 'GS-06-NESTED', 'GS-06-BYPASS'].map(
    (caseId) => ({ caseId, pass: caseResults.find((entry) => entry.caseId === caseId)?.pass }),
  );
  assert(
    'A11',
    'GS-06：越权状态写入提案（非空 state_update_proposal，含伪造合法字段与嵌套变更）→ POLICY_REJECTED；结构外字段与策略绕过 → LLM_SCHEMA_INVALID；全部不产生状态写入；llm_output_rejected + state_write_rejected 登记；决策追踪 state_after=null',
    gs06Cases.every((entry) => entry.pass === true),
    { cases: gs06Cases },
  );

  // A12: WHAT_IF.
  const whatIf = caseResults.find((entry) => entry.caseId === 'WHATIF-POS');
  const whatIfStop = caseResults.find((entry) => entry.caseId === 'WHATIF-STOP');
  assert(
    'A12',
    'S1-ACT-WHAT_IF：WHAT_IF → SIMULATE 单次模拟提案，内容区分事实/推断/假设，不创建新 Session/Experience，阶段 SIMULATION；STOP 优先（P-01）',
    whatIf?.pass === true && whatIfStop?.pass === true,
    { whatIf: whatIf?.pass, whatIfStop: whatIfStop?.pass },
  );

  // A13: illegal transitions + session lifecycle.
  const illegalTrans = caseResults.find((entry) => entry.caseId === 'ILLEGAL-TRANS');
  const sessionEnded = caseResults.find((entry) => entry.caseId === 'SESSION-ENDED');
  assert(
    'A13',
    'S1-04/S1-01：生成中常规输入拒绝（INVALID_STATE_TRANSITION，retryable=true）；终态操作拒绝；SESSION_ENDED 拒绝全部旧操作',
    illegalTrans?.pass === true && sessionEnded?.pass === true,
    { illegalTrans: illegalTrans?.pass, sessionEnded: sessionEnded?.pass },
  );

  // A14: C6 envelope + ordering.
  const c6Envelope = caseResults.find((entry) => entry.caseId === 'C6-ENVELOPE');
  const c6Order = caseResults.find((entry) => entry.caseId === 'C6-ORDER');
  assert(
    'A14',
    'C6 §7/§25：全部事件通过信封校验（event_id 格式、ISO-8601 时间戳、identity/context/source/properties/sequence_number 完备）；每体验 sequence_number 严格单调、时间戳非递减',
    c6Envelope?.pass === true && c6Order?.pass === true,
    { c6Envelope: c6Envelope?.pass, c6Order: c6Order?.pass },
  );

  // A15: C6 minimum event set + idempotency + trace separation.
  const c6MinSet = caseResults.find((entry) => entry.caseId === 'C6-MINSET');
  const c6Idem = caseResults.find((entry) => entry.caseId === 'C6-IDEMPOTENT');
  const c6Trace = caseResults.find((entry) => entry.caseId === 'C6-TRACE-SEP');
  assert(
    'A15',
    'C6 事件契约：S1 §23 全部 15 项最低事件发出（C6 权威名 + 调和表）；event_id 幂等去重（C6 §27）；LLM/Policy/State 追踪分离（C6 §22/§23）',
    c6MinSet?.pass === true && c6Idem?.pass === true && c6Trace?.pass === true,
    { c6MinSet: c6MinSet?.pass, c6Idem: c6Idem?.pass, c6Trace: c6Trace?.pass },
  );

  // A16: static no-egress scan.
  const scan = await staticNoEgressScan();
  assert(
    'A16',
    '无真实提供方调用：产品运行时源码（src/experience/** + app/api/**）静态扫描无 fetch/网络/LLM 提供方/凭据引用；流式内容逐字节等于合成 fixture（A5/A6 已证）',
    scan.clean,
    { files: scan.files },
  );

  // A17: F-1 regression.
  const f1RegInProc = caseResults.find((entry) => entry.caseId === 'F1-REG-INPROC');
  const f1RegHttp = caseResults.find((entry) => entry.caseId === 'HTTP-12');
  assert(
    'A17',
    'F-1 回归：流式端点（进程内 + HTTP 两形态）行为不变——完整流/流中取消/策略 STOP/表外动作拒绝与 F1-E2E-0001 一致',
    f1RegInProc?.pass === true && f1RegHttp?.pass === true,
    { f1RegInProc: f1RegInProc?.pass, f1RegHttp: f1RegHttp?.pass },
  );

  // A18: HTTP end-to-end chain.
  const httpCases = ['HTTP-01', 'HTTP-02', 'HTTP-03', 'HTTP-04', 'HTTP-05'].map((caseId) => ({
    caseId,
    pass: caseResults.find((entry) => entry.caseId === caseId)?.pass,
  }));
  assert(
    'A18',
    'HTTP 形态端到端：session/start → intent/resolve → experience/start → state 查询（Query 不改状态）→ event 端到端 NDJSON 流（首行 API §11.3 响应结构 + 服务端完整事件链）',
    httpCases.every((entry) => entry.pass === true),
    { cases: httpCases },
  );

  // A19: HTTP negatives.
  const httpNegatives = ['HTTP-06', 'HTTP-07', 'HTTP-08', 'HTTP-09', 'HTTP-10'].map((caseId) => ({
    caseId,
    pass: caseResults.find((entry) => entry.caseId === caseId)?.pass,
  }));
  assert(
    'A19',
    'HTTP 负向：陈旧版本 → 409 STATE_VERSION_CONFLICT；语义不匹配 → 400 INVALID_REQUEST；不可分类输入 → 400 INVALID_ACTION；GET 访问 Command → 405；STOP 端到端 + ended 会话拒绝',
    httpNegatives.every((entry) => entry.pass === true),
    { cases: httpNegatives },
  );

  // A20: HTTP change mid-generation.
  const httpChange = caseResults.find((entry) => entry.caseId === 'HTTP-11');
  assert(
    'A20',
    'HTTP 生成中 CHANGE：旧 HTTP 响应以 cancelled 终止（零后续分块），服务端登记 generation_cancelled + experience_interrupted + change_direction_requested，新方向流完成',
    httpChange?.pass === true,
    { httpChange: httpChange?.pass },
  );

  // A21: server-side logs written.
  const eventLogExists = existsSync(httpEventLogPath) && (await stat(httpEventLogPath)).size > 0;
  const decisionLogExists = existsSync(httpDecisionTracePath) && (await stat(httpDecisionTracePath)).size > 0;
  const auditLogExists = existsSync(httpAuditPath) && (await stat(httpAuditPath)).size > 0;
  let serverLogsValid = false;
  if (eventLogExists && decisionLogExists && auditLogExists) {
    const serverEvents = parseNdjsonEvents(await readFile(httpEventLogPath, 'utf8'));
    const serverTraces = parseNdjsonEvents(await readFile(httpDecisionTracePath, 'utf8'));
    const envelopeViolations = serverEvents.filter((event) => !validateEventEnvelope(event).ok).length;
    serverLogsValid = serverEvents.length > 0 && serverTraces.length > 0 && envelopeViolations === 0;
  }
  assert(
    'A21',
    'HTTP 形态服务端汇：事件日志 / 决策追踪日志 / 审计汇均已写入且为有效 NDJSON；服务端事件全部通过 C6 §7 信封校验',
    serverLogsValid,
    { eventLogExists, decisionLogExists, auditLogExists },
  );

  // A22: preflight + integrity.
  assert(
    'A22',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹全部匹配',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExit: typecheck.code, buildExit: build.code, referenceFailed: referenceCheck.failed.length, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // A23: git binding.
  assert(
    'A23',
    '证据-代码绑定：运行于干净工作树（HEAD 记录于版本矩阵）；运行时文件哈希逐文件登记于 run-metadata.json',
    git.workTreeClean && typeof git.commit === 'string' && git.commit.length > 0,
    { head: git.commit, workTreeClean: git.workTreeClean, uncommittedEntries: git.uncommittedEntries },
  );

  // A1: metadata completeness.
  const productPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const nextVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'next', 'package.json'), 'utf8')).version;
  const reactVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'react', 'package.json'), 'utf8')).version;
  const typescriptVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;
  const runtimeFiles = [
    'package.json',
    'package-lock.json',
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
    'src/experience/events.ts',
    'src/experience/decision-trace.ts',
    'src/experience/llm-gateway.ts',
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
    'src/experience/fixtures/change-direction.ts',
    'src/experience/fixtures/simulate.ts',
  ];
  const runtimeFileHashes = {};
  for (const rel of runtimeFiles) {
    runtimeFileHashes[rel] = sha256OfBuffer(await readFile(path.join(repoRoot, rel)));
  }
  const referenceEntries = (await readFile(path.join(repoRoot, 'docs', 'product', 'reference', 'SHA256SUMS'), 'utf8'))
    .split('\n')
    .filter((line) => /^\S+\s\s\S/.test(line))
    .map((line) => line.replace(/^([0-9a-f]{64})\s\s(.+)$/, '$2'));

  const versionMatrix = {
    runId: RUN_ID,
    obligation: 'P3-S1-IMPL-AUTH-01 §2 授权范围：GS-01…GS-06 完整动态执行 + C6 事件契约证据 + S1 启用动作契约测试 + F-1 回归（F-2 迭代）',
    authorization: { id: 'P3-S1-IMPL-AUTH-01', version: '1.1.0', issued: '2026-08', note: 'F-1 履行记录见 §8' },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17'],
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
    stateMachine: { contract: 'C2', version: 'state_machine_v1.0.0', implemented: ['L0 Session（§4）', 'L2 Experience 状态机（§7）', 'L2 阶段机（§14/§15：UNDERSTANDING→SIMULATION）', 'Forbidden Transitions（§23）'] },
    policy: {
      contract: 'C3',
      version: 'action_policy_v1.0.0',
      frozenMappingsImplemented: {
        DIRECT_ANSWER: 'ANSWER',
        WHY: 'EXPLAIN',
        WHAT_IF: 'SIMULATE',
        CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
        STOP: 'STOP',
      },
      frozenMapAuthority: 'S1 规范 §14 Policy Rules（acceptance-mapping §A/§C 批准范围）',
      semanticGapRegister: 'docs/product/baseline/c3-semantic-gap-register-v1.md（G-1…G-7 已登记，未由编码者补写；冻结点之外一律拒绝并升级）',
    },
    api: {
      contract: 'C5',
      version: 'api_v1.0.0',
      routes: [
        'POST /api/session/start',
        'POST /api/intent/resolve',
        'POST /api/experience/start',
        'GET /api/experience/{id}/state',
        'POST /api/experience/{id}/event',
        'POST /api/experience/stream（F-1 能力端点，回归）',
      ],
      errorContract: 'S1 §28（INVALID_REQUEST / INVALID_STATE_TRANSITION / STATE_VERSION_CONFLICT / INVALID_ACTION / POLICY_REJECTED / LLM_SCHEMA_INVALID / LLM_UNAVAILABLE / REQUEST_DUPLICATE / INTERNAL_ERROR）；HTTP 状态码映射为工程实现（400/409/405/500/503），记录于迭代记录',
    },
    event: {
      contract: 'C6',
      version: 'analytics_v1.0.0',
      implemented: [
        'Event Envelope（C6 §7）',
        'Event Identity（C6 §6）',
        'Event Source Rules（C6 §8）',
        'Event Ordering（C6 §25：每体验 sequence_number）',
        'Event Idempotency（C6 §27：event_id 去重）',
        'Decision Trace（C6 §22）',
        'LLM/Policy/State 追踪分离（C6 §23）',
        'S1 §23 最低事件集（15 项，C6 权威名 + 名称调和表）',
      ],
      nameReconciliation: 'S1 §23 → C6：intent_created→intent_received；semantic_action_detected→intent_parsed（携带 semantic_action 属性）；user_action→C6 §14 具体交互事件；version_conflict→state_version_conflict。调和表登记于迭代记录 P3-S1-IMPL-ITER-002 §4，pending 非作者复核',
    },
    evaluation: { contract: 'C7', version: 'evaluation_v1.0.0', note: 'G5 16 项评测包仍 NOT RUN' },
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
    model: { value: 'synthetic-fixture', reason: '同上；LLM 网关为合成实现（经 LlmGateway 接口；内容逐字节等于 fixture，见 A5/A6/A16）' },
    corpus: {
      fixtures: [
        { fixtureId: directAnswer.fixtureId, file: 'src/experience/fixtures/direct-answer.ts', sha256: runtimeFileHashes['src/experience/fixtures/direct-answer.ts'] },
        { fixtureId: why.fixtureId, file: 'src/experience/fixtures/why.ts', sha256: runtimeFileHashes['src/experience/fixtures/why.ts'] },
        { fixtureId: simulate.fixtureId, file: 'src/experience/fixtures/simulate.ts', sha256: runtimeFileHashes['src/experience/fixtures/simulate.ts'] },
        { fixtureId: 'synthetic/change-direction/v1', file: 'src/experience/fixtures/change-direction.ts', sha256: runtimeFileHashes['src/experience/fixtures/change-direction.ts'] },
        { fixtureId: 'synthetic/stop/v1', file: '（运行时内联构造：STOP 无内容分块）', sha256: null },
      ],
      realUserData: false,
    },
    regression: {
      status: 'F-1 回归已执行（A17：进程内 + HTTP 两形态通过）；运行时动态基线：F1-E2E-0001（9/9 案例、12/12 断言、退出码 0）',
      baselineRunId: 'F1-E2E-0001',
      note: '本次运行为第二个运行时动态证据运行；比较仅限 F-1 端点行为回归（代码字节未变），不据此推断任何 Gate 状态',
    },
    environment: {
      nodeVersion: process.version,
      nodeExecutable: process.execPath,
      nodeLockSource: 'F-2：2026-10-08 授权日重查 nodejs.org——v24.21.0 Latest LTS（Active LTS）；package.json engines.node 精确锁定',
      nextjs: { used: true, version: nextVersion },
      react: { version: reactVersion },
      typescript: { version: typescriptVersion },
      platform: process.platform,
      arch: process.arch,
      database: { engine: 'node:sqlite（仅证据执行器 fixture 状态存储；本运行时为内存态，S1 不持久化跨会话数据，PD-07）', sqliteVersion: await sqliteVersion() },
      npmRegistryReachable: 'via proxy 127.0.0.1:7890（2026-10-08 验证）',
    },
    run: {
      startedAt,
      finishedAt: null,
      command: 'npm run f2 (node tools/evidence/src/f2.mjs, from tools/evidence)',
      exitCode: null,
      executor: {
        executedBy: '工程负责人角色（代理）',
        independentEvaluator: '独立评测负责人（用户本人，角色 5，PD-15）',
      },
    },
    lockfiles: {
      'package-lock.json': { lockfileVersion: lockfile.lockfileVersion, sha256: runtimeFileHashes['package-lock.json'] },
    },
  };

  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix)');

  // A1: metadata completeness.
  const requiredSections = [
    'runId', 'obligation', 'authorization', 'productDecisions', 'contracts', 's1Specifications',
    'stateMachine', 'policy', 'api', 'event', 'evaluation', 'code', 'prompt', 'model',
    'corpus', 'regression', 'environment', 'run', 'lockfiles',
  ];
  const missingSections = requiredSections.filter((section) => versionMatrix[section] === undefined || versionMatrix[section] === null);
  assert('A1', 'run-metadata 完整（E5 §3 版本矩阵全部字段）', missingSections.length === 0, { missingSections });

  // A2: environment lock.
  const ENGINE_LOCK = '24.21.0';
  const engineLocked =
    productPackage.engines?.node === ENGINE_LOCK &&
    process.version === NODE_LOCK &&
    typeof nextVersion === 'string' &&
    lockfile.lockfileVersion === 3;
  assert(
    'A2',
    `环境锁定：engines.node === "${ENGINE_LOCK}"（F-2 精确锁定）且执行于 Node ${process.version}；Next.js ${nextVersion} / React ${reactVersion} 已记录`,
    engineLocked,
    { engines: productPackage.engines, nodeVersion: process.version, nextjs: nextVersion, react: reactVersion, lockfileVersion: lockfile.lockfileVersion },
  );

  // Summary + manifest.
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
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
    cases: caseResults.map((entry) => ({ caseId: `${RUN_ID}:${entry.caseId}`, result: entry.result })),
    allCasesPass,
    assertions: assertions.map(({ id, description, passed }) => ({ id, description, passed })),
    allAssertionsPass,
    allPassed,
    exitCode,
    vocabularyNote: '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2–G4）或产品状态为 PASS（E5 §2）。GS-01…GS-06 动态证据本运行已执行；C6 事件契约证据本运行已执行；G5 独立评测仍 NOT RUN。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written: cases=${caseResults.length} allCasesPass=${allCasesPass} assertions=${assertions.length} allAssertionsPass=${allAssertionsPass}`);

  // Manifest + independent re-verification.
  await writeSha256Sums(runDir);
  const manifestCheck = await verifySha256Sums(path.join(runDir, 'SHA256SUMS'), runDir);
  assert(
    'A24',
    '证据清单 SHA256SUMS 已产出且独立重算全部一致',
    manifestCheck.failed.length === 0,
    { verified: manifestCheck.verified, failed: manifestCheck.failed },
  );
  // Re-evaluate allPassed with A24 included; refresh the persisted summary
  // so it carries every assertion (A1–A24).
  const finalAllPassed = assertions.every((entry) => entry.passed) && allCasesPass;
  const finalExitCode = finalAllPassed ? 0 : 1;
  summary.assertions = assertions.map(({ id, description, passed }) => ({ id, description, passed }));
  summary.allAssertionsPass = assertions.every((entry) => entry.passed);
  summary.allPassed = finalAllPassed;
  summary.exitCode = finalExitCode;
  versionMatrix.run.exitCode = finalExitCode;
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');

  // Review README for the independent evaluator.
  const reviewReadme = `# F2-GS-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：F2-GS-0001（F-2 迭代：GS-01…GS-06 完整动态执行 + C6 事件契约证据 + S1 启用动作契约测试 + F-1 回归）
日期：${finishedAt}
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} ${allCasesPass ? '全部 PASS' : '存在 FAIL——见 cases/'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${finalExitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹 + http-events.jsonl（HTTP 形态服务端 C6 事件流）+ http-decision-traces.jsonl（决策追踪）+ http-audit.jsonl（F-1 形态审计汇）
3. run-metadata.json —— E5 §3 版本矩阵（契约 / 代码 / 语料 / 环境 / F-1 回归基线）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 本运行覆盖与未覆盖

已执行（本运行）：GS-01…GS-06 完整案例（含全部登记负向）、S1-ACT-WHAT_IF 契约测试、S1 §23/C6 最低事件集、C6 §7/§25/§27/§22/§23 契约校验、F-1 回归（进程内 + HTTP）、HTTP 形态端到端与负向。
未执行（NOT RUN）：G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（DEFERRED TO S2 或后续阶段）；真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）。

## 名称调和表（S1 §23 → C6 权威名，pending 非作者复核）

| S1 §23 最低事件 | C6 权威实现 | 依据 |
|---|---|---|
| intent_created | intent_received | C6 §12 意图事件 |
| semantic_action_detected | intent_parsed（properties.semantic_action） | C6 §12 + §8 输入层来源规则 |
| user_action | question_asked / why_requested / what_if_requested / change_direction_requested / stop_requested | C6 §14 交互事件 |
| version_conflict | state_version_conflict | C6 §21 状态事件 |
| 其余 10 项 | 同名 | C6 §10/§13/§15/§18/§21 |

## 独立重跑

    cd tools/evidence && npm run f2   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/F2-GS-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 'f2-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- F2-GS-0001 ${finalAllPassed ? 'PASSED' : 'FAILED'} — exit ${finalExitCode} ---`);
  process.exit(finalExitCode);
}

try {
  await main();
} catch (error) {
  console.error(`F2-GS-0001 executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 'f2-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
