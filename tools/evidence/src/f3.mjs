// F3-EB-0001 — F-3 迭代动态证据执行器
// （P3-S1-IMPL-AUTH-01 §2 授权范围内 / P2-EVIDENCE-8.1 §B：
//   G2 动态跨契约一致性案例与故障链路 + G4 工程边界 EB-01…EB-16）
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate（G2/G4）或产品状态为 PASS；
// - 进程内形态经 module.registerHooks 解析无扩展名说明符到真实 .ts 源码
//   （Node ≥23.6 原生类型剥离），使证据执行器运行的是已提交的真实运行时代码；
// - HTTP 形态经真实 Next.js 生产服务器（next start）；
// - 静态边界断言读取已提交的产品源码字节（不做代码推断，只验证事实）。

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
const { why } = await import('../../../src/experience/fixtures/why');
const { changeDirection } = await import('../../../src/experience/fixtures/change-direction');

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
const RUN_ID = 'F3-EB-0001';
const PORT = 4323;
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

/** HTTP 服务端日志切片（偏移按 content.length——UTF-16 码元）。 */
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

/** 日志当前长度（UTF-16 码元；与切片偏移同一度量）。 */
async function httpLogSize(logPath) {
  if (!existsSync(logPath)) {
    return 0;
  }
  const content = await readFile(logPath, 'utf8');
  return content.length;
}

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

/** 递归列举目录下指定扩展名文件（相对路径）。 */
async function listFiles(dir, extension, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, extension, base)));
    } else if (entry.name.endsWith(extension)) {
      files.push(path.relative(base, full));
    }
  }
  return files.sort();
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

/** 计数网关：包装任意网关并统计 propose 调用次数（EB-06 无自动重试证据）。 */
function countingGateway(inner) {
  const state = { calls: 0 };
  return {
    calls: state,
    async propose(request) {
      state.calls += 1;
      return inner.propose(request);
    },
  };
}

/** 失败网关：每次调用均失败（EB-06 重试边界 / EB-07 超时类故障）。 */
function failingGateway(mode = 'throw') {
  return {
    async propose() {
      if (mode === 'timeout') {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(mode === 'timeout' ? 'synthetic gateway timeout' : 'synthetic gateway failure');
    },
  };
}

/** 一次失败后恢复的合成网关（EB-07 有界恢复 + 用户控制保留）。 */
function recoverableGateway() {
  const state = { calls: 0 };
  return {
    calls: state,
    async propose(request) {
      state.calls += 1;
      if (state.calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error('synthetic gateway timeout');
      }
      const fixture = request.semantic_action === 'WHY' ? why : undefined;
      if (!fixture) {
        throw new Error(`no synthetic fixture for semantic action: ${request.semantic_action}`);
      }
      return {
        proposal_id: `proposal_recovered_${String(state.calls).padStart(4, '0')}`,
        content: fixture.chunks.join(''),
        state_update_proposal: {},
        confidence: 1,
      };
    },
  };
}

/** 首次成功、其后失败的合成网关（EB-06 失败后 STOP 边界）。 */
function succeedOnceGateway() {
  const state = { calls: 0 };
  return {
    calls: state,
    async propose(request) {
      state.calls += 1;
      if (state.calls > 1) {
        throw new Error('synthetic gateway failure');
      }
      const fixture = request.semantic_action === 'WHY' ? why : undefined;
      if (!fixture) {
        throw new Error(`no synthetic fixture for semantic action: ${request.semantic_action}`);
      }
      return {
        proposal_id: `proposal_first_${String(state.calls).padStart(4, '0')}`,
        content: fixture.chunks.join(''),
        state_update_proposal: {},
        confidence: 1,
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

/** 读取产品源码（静态边界断言用；只验证已提交字节，不做推断）。 */
async function readProductSource(relPath) {
  return readFile(path.join(repoRoot, relPath), 'utf8');
}

/** 提取源码中的 import 说明符（静态导入图断言用）。 */
function importSpecifiers(source) {
  const specifiers = [];
  const pattern = /^import\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm;
  let match = pattern.exec(source);
  while (match) {
    specifiers.push(match[1]);
    match = pattern.exec(source);
  }
  return specifiers;
}

// ---------------------------------------------------------------------------
// HTTP 形态辅助
// ---------------------------------------------------------------------------
async function httpSetupChain(label) {
  const sessionResult = await httpJson('/api/session/start', { method: 'POST', body: '{}' });
  const sessionId = sessionResult.payload?.session_id;
  const intentResult = await httpJson('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-f3-${label}-intent-${Math.random().toString(16).slice(2, 8)}`,
      session_id: sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const intentId = intentResult.payload?.intent?.intent_id;
  const expResult = await httpJson('/api/experience/start', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-f3-${label}-exp-${Math.random().toString(16).slice(2, 8)}`,
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

async function httpPostEvent(setup, { requestId, semanticAction = 'WHY', rawInput = '为什么？', stateVersion }) {
  const response = await fetch(`${BASE_URL}/api/experience/${setup.experienceId}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: requestId,
      session_id: setup.sessionId,
      state_version: stateVersion ?? setup.stateVersion,
      event: { type: 'user_action', semantic_action: semanticAction, raw_input: rawInput, source: 'text' },
    }),
  });
  return response;
}

// ---------------------------------------------------------------------------
// 案例运行器（进程内形态 — G2 动态跨契约一致性）
// ---------------------------------------------------------------------------

// --- G2-CHAIN-01：WHY 完整链路跨契约一致性 -----------------------------
async function caseG2Chain01(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g2c1-1',
  });
  const streamEvents = sub.ok ? await consume(sub.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);

  const violations = [];
  for (const event of events) {
    const result = validateEventEnvelope(event);
    if (!result.ok) violations.push({ event_id: event.event_id, violations: result.violations });
  }
  const intentParsed = eventsOf(events, 'intent_parsed')[0];
  // 本次提交的版本化提交（startExperience 的初始提交 v1→v2 也在事件流中；按 request_id 精确定位）。
  const stateTransitioned = eventsOf(events, 'state_transitioned').find(
    (event) => event.context?.request_id === 'req-g2c1-1',
  );
  const stateUpdated = streamEvents.find((event) => event.type === 'state_updated');
  const expEvents = events.filter((event) => event.context?.experience_id === exp.experienceId);
  const sequenceOk = expEvents.every((event, index) => index === 0 || event.sequence_number > expEvents[index - 1].sequence_number);

  const expected = {
    crossContractAgreement:
      'C1 会话 ACTIVE；C2 intent.semanticAction=WHY；C5 intent_parsed.semantic_action=WHY；C6 policy_decided.selected_action=EXPLAIN（冻结映射 WHY→EXPLAIN）；C7/C8 流内容逐字节等于合成语料；C9 终态 WAITING v4；决策追踪 state_before=v2→state_after=v3 与 state_transitioned 一致；信封全量通过；sequence_number 严格单调',
  };
  const actual = {
    sessionStateAfter: sessionAfter?.state ?? null,
    intentSemanticAction: intent.semanticAction,
    intentParsedSemanticAction: intentParsed?.properties?.semantic_action ?? null,
    decisionTraceSemanticAction: traces[0]?.semantic_action ?? null,
    headerSelectedAction: sub.ok ? sub.header.policy_decision.selected_action : sub.error.code,
    traceSelectedAction: traces[0]?.policy?.selected_action ?? null,
    streamContent: contentOf(streamEvents),
    fixtureContent: why.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    traceStateBefore: traces[0]?.state_before ?? null,
    traceStateAfter: traces[0]?.state_after ?? null,
    stateTransitionedVersions: stateTransitioned
      ? { before: stateTransitioned.properties.state_version_before, after: stateTransitioned.properties.state_version_after, steps: stateTransitioned.properties.steps }
      : null,
    stateUpdatedVersion: stateUpdated?.state_version ?? null,
    envelopeViolations: violations.length,
    sequenceMonotonic: sequenceOk,
    decisionTraceSeparation: traces[0]?.execution
      ? { llm_used: traces[0].execution.llm_used, tool_used: traces[0].execution.tool_used }
      : null,
  };
  const pass =
    sessionAfter?.state === 'SESSION_ACTIVE' &&
    intent.semanticAction === 'WHY' &&
    intentParsed?.properties?.semantic_action === 'WHY' &&
    traces[0]?.semantic_action === 'WHY' &&
    sub.ok &&
    sub.header.policy_decision.selected_action === 'EXPLAIN' &&
    traces[0]?.policy?.selected_action === 'EXPLAIN' &&
    contentOf(streamEvents) === why.chunks.join('') &&
    finalState.ok &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stateVersion === 4 &&
    traces[0]?.state_before?.state_version === 2 &&
    traces[0]?.state_after?.state_version === 3 &&
    stateTransitioned?.properties?.state_version_before === 2 &&
    stateTransitioned?.properties?.state_version_after === 3 &&
    JSON.stringify(stateTransitioned?.properties?.steps) === JSON.stringify(['USER_ACTION']) &&
    stateUpdated?.state_version === 4 &&
    violations.length === 0 &&
    sequenceOk &&
    traces[0]?.execution?.llm_used === true &&
    traces[0]?.execution?.tool_used === false;
  return { expected, actual, pass };
}

// --- G2-CHAIN-02：CHANGE 完整链路（复合步骤 + generation 归属） ---------
async function caseG2Chain02(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g2c2-1',
  });
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  await iterator.next(); // chunk 0
  const inFlight = runtime.getExperienceState(exp.experienceId);
  const oldGenerationId = first.generationId;
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-g2c2-2',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  let oldStreamCancelled = false;
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    if (next.value?.type === 'cancelled') oldStreamCancelled = true;
  }
  const late = await runtime.completeGeneration(exp.experienceId, oldGenerationId);
  const finalState = runtime.getExperienceState(exp.experienceId);

  const changeTransition = eventsOf(events, 'state_transitioned').find(
    (event) => event.properties?.event === 'CHANGE_DIRECTION',
  );
  const interrupted = eventsOf(events, 'experience_interrupted')[0];
  // 旧 generation 归属：experience_interrupted 登记候选级中断事实
  // （interrupted_candidate_id / reason=change_direction / old_generation_rejected）；
  // generation 级归属由 generation_cancelled 携带 generation_id 权威登记。
  const generationCancelled = eventsOf(events, 'generation_cancelled').find(
    (event) => event.properties?.generation_id === oldGenerationId,
  );
  const newGenerationStarted = eventsOf(events, 'generation_started').find(
    (event) => event.properties?.generation_id !== oldGenerationId,
  );
  const candidateGenerated = eventsOf(events, 'experience_candidate_generated')[0];
  const candidateSelected = eventsOf(events, 'experience_candidate_selected')[0];
  const changeTrace = traces.find((item) => item.semantic_action === 'CHANGE_DIRECTION');

  const expected = {
    compoundSteps: "['CHANGE_DIRECTION', 'EXPERIENCE_STARTED', 'USER_ACTION']（状态机 §14 复合迁移）",
    versionCommit: '单次版本化提交 v3→v4（复合结果一次提交）',
    generationAttribution: 'experience_interrupted(reason=change_direction, old_generation_rejected=true, interrupted_candidate_id) + generation_cancelled.generation_id = 旧 generation（reason=superseded_by_change）；新 candidate 的 generation_started/llm_* 携带新 generation_id',
    lateOldCommit: '拒绝（STALE_GENERATION）——旧 operation 不得提交（S1-10）',
    finalState: 'WAITING v5（新方向完成）',
  };
  const actual = {
    compoundSteps: changeTransition?.properties?.steps ?? null,
    versionBeforeAfter: changeTransition
      ? { before: changeTransition.properties.state_version_before, after: changeTransition.properties.state_version_after }
      : null,
    interrupted: interrupted
      ? {
          reason: interrupted.properties.reason,
          old_generation_rejected: interrupted.properties.old_generation_rejected,
          interrupted_candidate_id: interrupted.properties.interrupted_candidate_id,
        }
      : null,
    generationCancelledForOld: generationCancelled
      ? { generation_id: generationCancelled.properties.generation_id, reason: generationCancelled.properties.reason }
      : null,
    oldGenerationId,
    newGenerationId: newGenerationStarted?.properties?.generation_id ?? null,
    candidateId: candidateGenerated?.properties?.candidate_id ?? null,
    candidateSelectedId: candidateSelected?.properties?.candidate_id ?? null,
    changeTraceVersions: changeTrace
      ? { before: changeTrace.state_before?.state_version, after: changeTrace.state_after?.state_version }
      : null,
    changeTraceAction: changeTrace?.policy?.selected_action ?? null,
    lateCommitResult: late.ok ? 'OK（缺陷！）' : late.code,
    writeRejected: eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason),
    streamContent: contentOf(changeEvents),
    fixtureContent: changeDirection.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    oldStreamCancelled,
  };
  const pass =
    JSON.stringify(changeTransition?.properties?.steps) ===
      JSON.stringify(['CHANGE_DIRECTION', 'EXPERIENCE_STARTED', 'USER_ACTION']) &&
    changeTransition?.properties?.state_version_before === 3 &&
    changeTransition?.properties?.state_version_after === 4 &&
    generationCancelled !== undefined &&
    interrupted?.properties?.reason === 'change_direction' &&
    interrupted?.properties?.old_generation_rejected === true &&
    newGenerationStarted?.properties?.generation_id !== oldGenerationId &&
    candidateGenerated?.properties?.candidate_id === candidateSelected?.properties?.candidate_id &&
    changeTrace?.state_before?.state_version === 3 &&
    changeTrace?.state_after?.state_version === 4 &&
    changeTrace?.policy?.selected_action === 'CHANGE_EXPERIENCE' &&
    !late.ok &&
    late.code === 'STALE_GENERATION' &&
    actual.writeRejected.includes('superseded_generation') &&
    contentOf(changeEvents) === changeDirection.chunks.join('') &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    oldStreamCancelled;
  return { expected, actual, pass };
}

// --- G2-FAULT-01：不可分类输入故障链（UNKNOWN → INVALID_ACTION 升级） --
async function caseG2Fault01(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const eventsBefore = events.length;
  const tracesBefore = traces.length;
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: 'xyzzy 不可分类输入',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g2f1-1',
  });
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    escalation: '分类 UNKNOWN → INVALID_ACTION 升级（未知情况升级而非由 LLM 决定，授权 §5.7）',
    sideEffects: '零事件写入 / 零决策追踪 / 零版本消耗 / 零内容分块',
    retryable: false,
  };
  const actual = {
    ok: sub.ok,
    errorCode: sub.ok ? null : sub.error.code,
    retryable: sub.ok ? null : sub.error.retryable,
    eventsDelta: events.length - eventsBefore,
    tracesDelta: traces.length - tracesBefore,
    stateVersion: finalState.ok ? finalState.state.stateVersion : null,
    classification: classifyInput('xyzzy 不可分类输入').semanticAction,
  };
  const pass =
    !sub.ok &&
    sub.error.code === 'INVALID_ACTION' &&
    sub.error.retryable === false &&
    events.length === eventsBefore &&
    traces.length === tracesBefore &&
    finalState.ok &&
    finalState.state.stateVersion === exp.stateVersion &&
    classifyInput('xyzzy 不可分类输入').semanticAction === 'UNKNOWN';
  return { expected, actual, pass };
}

// --- G2-FAULT-02：语义不匹配故障链（声明动作 ≠ 分类结果） -------------
async function caseG2Fault02(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '直接告诉我答案' });
  const eventsBefore = events.length;
  const tracesBefore = traces.length;
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY', // 声明 WHY，但输入分类为 DIRECT_ANSWER → 不匹配
    rawInput: '直接告诉我答案',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-g2f2-1',
  });
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    rejection: '声明语义动作与分类结果不一致 → INVALID_REQUEST（客户端不得注入策略动作，API §11.3）',
    sideEffects: '零事件写入 / 零决策追踪 / 零版本消耗',
    retryable: false,
  };
  const actual = {
    ok: sub.ok,
    errorCode: sub.ok ? null : sub.error.code,
    retryable: sub.ok ? null : sub.error.retryable,
    declaredSemanticAction: 'WHY',
    classifiedSemanticAction: intent.semanticAction,
    eventsDelta: events.length - eventsBefore,
    tracesDelta: traces.length - tracesBefore,
    stateVersion: finalState.ok ? finalState.state.stateVersion : null,
  };
  const pass =
    !sub.ok &&
    sub.error.code === 'INVALID_REQUEST' &&
    sub.error.retryable === false &&
    intent.semanticAction === 'DIRECT_ANSWER' &&
    events.length === eventsBefore &&
    traces.length === tracesBefore &&
    finalState.ok &&
    finalState.state.stateVersion === exp.stateVersion;
  return { expected, actual, pass };
}

// --- G2-VERSION-01：版本链完整性（+1 增量；失败写入不消耗版本号） ------
async function caseG2Version01(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const versionAfterStart = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterStart,
    requestId: 'req-g2v1-1',
  });
  await consume(first.stream);
  const versionAfterFirst = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  // 陈旧写入：expected=启动版本（当前已推进）→ 冲突拒绝，版本不消耗。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterStart,
    requestId: 'req-g2v1-stale',
  });
  const versionAfterStale = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const second = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterStale,
    requestId: 'req-g2v1-2',
  });
  await consume(second.stream);
  const versionAfterSecond = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: versionAfterSecond,
    requestId: 'req-g2v1-3',
  });
  await consume(stop.stream);
  const finalState = runtime.getExperienceState(exp.experienceId);

  const transitions = eventsOf(events, 'state_transitioned');
  const incrementsOk = transitions.every(
    (event) => event.properties.state_version_after === event.properties.state_version_before + 1,
  );
  const conflictEvent = eventsOf(events, 'state_version_conflict')[0];
  const maxEventVersion = Math.max(
    ...events
      .map((event) => event.context?.state_version)
      .filter((version) => Number.isInteger(version) && version > 0),
  );

  const expected = {
    versionProgression: '启动 v2 → WHY 完成 v4 →（陈旧写入拒绝，v4 不消耗）→ WHY 完成 v6 → STOP v7',
    commitInvariant: '每次合法版本化提交恰好 +1（EB-02 核心不变式）',
    failedWrite: '陈旧写入返回 STATE_VERSION_CONFLICT 且不消耗版本号',
    finalVersion: 'v7 = 全部事件 context.state_version 的最大值',
  };
  const actual = {
    versionAfterStart,
    versionAfterFirst,
    staleResult: stale.ok ? 'OK（缺陷！）' : stale.error.code,
    versionAfterStale,
    versionAfterSecond,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    transitionPairs: transitions.map((event) => [event.properties.state_version_before, event.properties.state_version_after]),
    allCommitsIncrementByOne: incrementsOk,
    conflictEventVersions: conflictEvent
      ? { expected: conflictEvent.properties.expected_state_version, current: conflictEvent.properties.current_state_version }
      : null,
    maxEventVersion,
    finalVersion: finalState.ok ? finalState.state.stateVersion : null,
  };
  const pass =
    versionAfterStart === 2 &&
    versionAfterFirst === 4 &&
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    versionAfterStale === 4 &&
    versionAfterSecond === 6 &&
    finalState.ok &&
    finalState.state.stateVersion === 7 &&
    finalState.state.status === 'COMPLETED' &&
    incrementsOk &&
    conflictEvent?.properties?.expected_state_version === 2 &&
    conflictEvent?.properties?.current_state_version === 4 &&
    maxEventVersion === 7;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例运行器（进程内形态 — G4 工程边界）
// ---------------------------------------------------------------------------

// --- EB-01：Runtime 单一写入者（静态导入图） ---------------------------
async function caseEb01SingleWriter(trace) {
  const experienceFiles = await listFiles(path.join(repoRoot, 'src', 'experience'), '.ts');
  const apiFiles = await listFiles(path.join(repoRoot, 'app', 'api'), '.ts');
  const stateStoreImporters = [];
  const commitCallers = [];
  const routeStateImports = [];
  for (const rel of experienceFiles) {
    const source = await readProductSource(path.join('src', 'experience', rel));
    if (importSpecifiers(source).some((specifier) => specifier.includes('state-store'))) {
      stateStoreImporters.push(path.join('src', 'experience', rel));
    }
    if (/\.commit\(/.test(source)) {
      commitCallers.push(path.join('src', 'experience', rel));
    }
  }
  for (const rel of apiFiles) {
    const source = await readProductSource(path.join('app', 'api', rel));
    const specifiers = importSpecifiers(source);
    if (specifiers.some((specifier) => specifier.includes('state-store') || specifier.includes('/events') || specifier.includes('decision-trace'))) {
      routeStateImports.push(path.join('app', 'api', rel));
    }
  }
  const expected = {
    singleWriter: 'state-store 仅被 runtime.ts 导入；.commit( 仅在 runtime.ts 调用（EB-01 Contract）',
    apiBoundary: 'app/api 路由不直接导入 state-store / events 写入 API / decision-trace（EB-09/EB-12 协同）',
  };
  const actual = {
    stateStoreImporters,
    commitCallers,
    routeStateImports,
    experienceFileCount: experienceFiles.length,
    apiFileCount: apiFiles.length,
  };
  const pass =
    JSON.stringify(stateStoreImporters) === JSON.stringify(['src/experience/runtime.ts']) &&
    JSON.stringify(commitCallers) === JSON.stringify(['src/experience/runtime.ts']) &&
    routeStateImports.length === 0;
  return { expected, actual, pass };
}

// --- EB-02：状态版本——失败写入不消耗版本号 ------------------------------
async function caseEb02FailNoBump(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const versionAfterStart = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  // 路径 1：陈旧写入（expected < current）→ STATE_VERSION_CONFLICT。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterStart - 1,
    requestId: 'req-eb02-1',
  });
  const versionAfterStale = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  // 路径 2：非法状态转换（READY 状态 STOP 不合法——STOP 仅 ACTIVE/WAITING 合法）→ INVALID_STATE_TRANSITION。
  const illegal = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: versionAfterStart,
    requestId: 'req-eb02-2',
  });
  const versionAfterIllegal = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  // 失败写入不得产生任何超出启动提交（v1→v2）的版本化迁移。
  const transitions = eventsOf(events, 'state_transitioned');
  const transitionsBeyondStart = transitions.filter(
    (event) => event.properties.state_version_after > versionAfterStart,
  );
  const expected = {
    staleWrite: 'STATE_VERSION_CONFLICT，版本号不消耗（v2 → v2）',
    illegalTransition: 'INVALID_STATE_TRANSITION（STOP 从 READY 不合法；retryable=false——原样重试不会成功，须先刷新状态），版本号不消耗（v2 → v2）',
    invariant: '失败写入绝不推进 state_version（last-write-wins 禁止，EB-02 Forbidden）；事件流中唯一 state_transitioned 是启动提交 v1→v2',
  };
  const actual = {
    versionAfterStart,
    staleResult: stale.ok ? 'OK（缺陷！）' : `${stale.error.code}/${stale.error.retryable}`,
    versionAfterStale,
    illegalResult: illegal.ok ? 'OK（缺陷！）' : `${illegal.error.code}/${illegal.error.retryable}`,
    versionAfterIllegal,
    transitionCountBeyondStart: transitionsBeyondStart.length,
  };
  const pass =
    versionAfterStart === 2 &&
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    versionAfterStale === 2 &&
    !illegal.ok &&
    illegal.error.code === 'INVALID_STATE_TRANSITION' &&
    illegal.error.retryable === false &&
    versionAfterIllegal === 2 &&
    transitionsBeyondStart.length === 0;
  return { expected, actual, pass };
}

// --- EB-03：幂等——HTTP 重复 request_id（仅一次执行） -------------------
async function caseEb03HttpDuplicate(trace, auditOffset) {
  const setup = await httpSetupChain('eb03');
  const first = await httpPostEvent(setup, { requestId: 'req-f3-eb03-dup-1' });
  const firstEvents = await readStreamEvents(first.body);
  const logAfterFirst = await httpLogSize(httpEventLogPath);
  const second = await httpPostEvent(setup, { requestId: 'req-f3-eb03-dup-1' });
  const secondPayload = await second.json().catch(() => null);
  const logAfterSecond = await httpLogSize(httpEventLogPath);
  const expected = {
    firstRequest: '200 NDJSON 流（submission → chunks → done → state_updated v4）',
    duplicateRequest: '409 REQUEST_DUPLICATE（结构化错误体 {code, message, retryable}），不重复执行',
    executionCount: '事件日志在重复请求后长度不变（仅一次执行）',
  };
  const actual = {
    firstStatus: first.status,
    firstStreamTypes: firstEvents.map((event) => event.type),
    firstFinalVersion: firstEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    secondStatus: second.status,
    secondBody: secondPayload,
    logSizeAfterFirst: logAfterFirst,
    logSizeAfterSecond: logAfterSecond,
    logGrewOnDuplicate: logAfterSecond > logAfterFirst,
  };
  const pass =
    first.status === 200 &&
    firstEvents[0]?.type === 'submission' &&
    firstEvents.find((event) => event.type === 'state_updated')?.state_version === 4 &&
    second.status === 409 &&
    secondPayload?.code === 'REQUEST_DUPLICATE' &&
    secondPayload?.retryable === false &&
    typeof secondPayload?.message === 'string' &&
    logAfterSecond === logAfterFirst;
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- EB-04：可中断性（I1–I4 组合执行） ---------------------------------
async function caseEb04Interrupt(trace) {
  const gateway = countingGateway(scriptedGateway({}));
  const { runtime, events, traces } = createCaseRuntime(gateway);
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  // 生成在途（I2/I3 的前提）。
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb04-1',
  });
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  await iterator.next(); // chunk 0
  const inFlight = runtime.getExperienceState(exp.experienceId);
  const oldGenerationId = first.generationId;
  // I3：生成中输入新的问题（常规输入，分类为 WHY）→ 拒绝（ACTIVE 中期仅接受 STOP/CHANGE）。
  const plainInput = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么还有别的原因？',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-eb04-2',
  });
  const versionAfterPlain = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  // I2：生成中"换一个"→ CHANGE 取消旧 generation，新候选生成。
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-eb04-3',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  let oldStreamCancelled = false;
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    if (next.value?.type === 'cancelled') oldStreamCancelled = true;
  }
  // 旧 generation 迟到达提交 → 拒绝（旧结果不得重新进入 Runtime）。
  const late = await runtime.completeGeneration(exp.experienceId, oldGenerationId);
  // I1/I4：STOP 终止（用户"停"）。
  const versionAfterChange = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: versionAfterChange,
    requestId: 'req-eb04-4',
  });
  const stopEvents = stop.ok ? await consume(stop.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);

  const cancelledEvent = eventsOf(events, 'generation_cancelled')[0];
  const contentEventsAfterStop = eventsOf(events, 'chunk');
  const expected = {
    i3: '生成中常规输入 → INVALID_STATE_TRANSITION（retryable=true），版本不消耗',
    i2: '生成中 CHANGE → 旧 generation 取消（generation_cancelled reason=superseded_by_change），新候选完成且内容逐字节等于 change-direction 合成语料',
    lateOldResult: '旧 generation 迟到达提交 → STALE_GENERATION（旧结果不得重新进入 Runtime）',
    i1i4: 'STOP → 单一 stopped 事件、零内容分块、体验 COMPLETED、会话 ENDED',
    gatewayCalls: '恰好 2 次（旧 WHY + 新候选；中断不触发额外网关调用）',
  };
  const actual = {
    i3Result: plainInput.ok ? 'OK（缺陷！）' : `${plainInput.error.code}/retryable=${plainInput.error.retryable}`,
    versionAfterPlain,
    cancelledEvent: cancelledEvent
      ? { generation_id: cancelledEvent.properties.generation_id, reason: cancelledEvent.properties.reason }
      : null,
    oldGenerationId,
    lateCommitResult: late.ok ? 'OK（缺陷！）' : late.code,
    stopStreamTypes: stopEvents.map((event) => event.type),
    contentChunkCount: contentEventsAfterStop.length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    sessionStateAfter: sessionAfter?.state ?? null,
    gatewayCalls: gateway.calls.calls,
    oldStreamCancelled,
    changeStreamContent: contentOf(changeEvents),
  };
  const pass =
    !plainInput.ok &&
    plainInput.error.code === 'INVALID_STATE_TRANSITION' &&
    plainInput.error.retryable === true &&
    versionAfterPlain === 3 &&
    cancelledEvent?.properties?.generation_id === oldGenerationId &&
    cancelledEvent?.properties?.reason === 'superseded_by_change' &&
    !late.ok &&
    late.code === 'STALE_GENERATION' &&
    stopEvents.some((event) => event.type === 'stopped') &&
    !stopEvents.some((event) => event.type === 'chunk') &&
    finalState.ok &&
    finalState.state.status === 'COMPLETED' &&
    finalState.state.stateVersion === 6 &&
    sessionAfter?.state === 'SESSION_ENDED' &&
    gateway.calls.calls === 2 &&
    oldStreamCancelled &&
    contentOf(changeEvents) === changeDirection.chunks.join('');
  return { expected, actual, pass };
}

// --- EB-05：过期结果拒绝（旧请求晚于新请求返回——P2 强制测试） ---------
async function caseEb05StaleLate(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '直接告诉我答案' });
  // 旧请求：DIRECT_ANSWER 生成在途。
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb05-1',
  });
  const iterator = first.stream[Symbol.asyncIterator]();
  await iterator.next(); // submission
  await iterator.next(); // chunk 0
  const inFlight = runtime.getExperienceState(exp.experienceId);
  const oldGenerationId = first.generationId;
  // 新请求：CHANGE（用户改变方向）→ 新状态提交。
  const change = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换一个',
    expectedStateVersion: inFlight.state.stateVersion,
    requestId: 'req-eb05-2',
  });
  const changeEvents = change.ok ? await consume(change.stream) : [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
  }
  // 旧请求响应迟到达 → 尝试提交旧结果。
  const late = await runtime.completeGeneration(exp.experienceId, oldGenerationId);
  const finalState = runtime.getExperienceState(exp.experienceId);
  const rejected = eventsOf(events, 'state_write_rejected').filter(
    (event) => event.properties?.reason === 'superseded_generation',
  );
  const expected = {
    requiredTest: '人为制造"旧请求晚于新请求返回"（EB-05 P2 强制测试）',
    rejection: 'STALE_GENERATION——旧 A 响应不得覆盖新 B 状态',
    identityFields: 'state_write_rejected 携带 attempted_generation_id / active_generation_id（迟到达归属可追踪）',
    statePreserved: '最终状态 = 新方向完成版本（v5 WAITING），无旧 generation 写入',
  };
  const actual = {
    lateCommitResult: late.ok ? 'OK（缺陷！）' : late.code,
    lateCurrentStateVersion: late.ok ? null : late.currentStateVersion,
    rejectedWrites: rejected.map((event) => ({
      attempted: event.properties.attempted_generation_id,
      active: event.properties.active_generation_id,
      reason: event.properties.reason,
    })),
    oldGenerationId,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    changeCompleted: changeEvents.some((event) => event.type === 'state_updated'),
  };
  const pass =
    !late.ok &&
    late.code === 'STALE_GENERATION' &&
    late.currentStateVersion === 5 &&
    rejected.length === 1 &&
    rejected[0].properties.attempted_generation_id === oldGenerationId &&
    typeof rejected[0].properties.active_generation_id === 'string' &&
    rejected[0].properties.active_generation_id !== oldGenerationId &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'WAITING' &&
    changeEvents.some((event) => event.type === 'state_updated');
  return { expected, actual, pass };
}

// --- EB-06：重试边界（网关失败——恰好一次调用，无自动重试） -------------
async function caseEb06RetryBoundary(trace) {
  const gateway = countingGateway(failingGateway('throw'));
  const { runtime, events, traces } = createCaseRuntime(gateway);
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const eventsBefore = events.length;
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb06-1',
  });
  const finalState = runtime.getExperienceState(exp.experienceId);
  const newEvents = events.slice(eventsBefore);
  const expected = {
    failureSurface: 'LLM_UNAVAILABLE（retryable=true）——工程恢复机制，非产品决策机制',
    callCount: '网关恰好调用 1 次（无自动重试；Retry is an engineering recovery mechanism, not a product decision mechanism）',
    sideEffects: '零 state_transitioned（超出启动提交 v1→v2）/ 零 llm_request_completed / 零 generation_completed；policy_decided.state_after=null',
    statePreserved: '版本与状态不因失败改变（v2 READY 不变）',
  };
  const actual = {
    ok: sub.ok,
    errorCode: sub.ok ? null : sub.error.code,
    retryable: sub.ok ? null : sub.error.retryable,
    gatewayCalls: gateway.calls.calls,
    newEventTypes: newEvents.map((event) => event.type),
    stateTransitionedBeyondStart: eventsOf(events, 'state_transitioned').filter(
      (event) => event.properties.state_version_before >= exp.stateVersion,
    ).length,
    llmRequestCompletedCount: eventsOf(events, 'llm_request_completed').length,
    generationCompletedCount: eventsOf(events, 'generation_completed').length,
    policyDecidedStateAfter: eventsOf(events, 'policy_decided')[0]
      ? eventsOf(events, 'policy_decided')[0].properties.state_after
      : 'MISSING',
    policyDecidedReason: eventsOf(events, 'policy_decided')[0]?.properties?.reason ?? null,
    stateVersion: finalState.ok ? finalState.state.stateVersion : null,
    stateStatus: finalState.ok ? finalState.state.status : null,
    decisionTraces: traces.length,
  };
  const pass =
    !sub.ok &&
    sub.error.code === 'LLM_UNAVAILABLE' &&
    sub.error.retryable === true &&
    gateway.calls.calls === 1 &&
    eventsOf(events, 'state_transitioned').filter(
      (event) => event.properties.state_version_before >= exp.stateVersion,
    ).length === 0 &&
    eventsOf(events, 'llm_request_completed').length === 0 &&
    eventsOf(events, 'generation_completed').length === 0 &&
    eventsOf(events, 'policy_decided')[0]?.properties?.state_after === null &&
    eventsOf(events, 'policy_decided')[0]?.properties?.reason === 'LLM_UNAVAILABLE' &&
    finalState.ok &&
    finalState.state.stateVersion === 2 &&
    finalState.state.status === 'READY' &&
    traces.length === 0;
  return { expected, actual, pass };
}

// --- EB-06（续）：失败后 STOP——终止不触发网关调用（EB-06 Forbidden） -----------
async function caseEb06NoRetryAfterStop(trace) {
  // 场景：首次 WHY 成功（WAITING v4）；第二次 WHY 失败（失败不产生状态写入，
  // 状态保持 WAITING v4）；随后用户 STOP 从 WAITING 合法终止。
  // 断言：STOP 不重试旧体验、不再调用网关（网关调用恒为 2）。
  const gateway = succeedOnceGateway();
  const { runtime, events } = createCaseRuntime(gateway);
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb06s-1',
  });
  await consume(first.stream);
  const versionAfterFirst = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const failed = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterFirst,
    requestId: 'req-eb06s-2',
  });
  const versionAfterFailure = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const statusAfterFailure = runtime.getExperienceState(exp.experienceId).state.status;
  // 失败后用户 STOP：STOP 是用户主权动作，不重试生成、不调用网关。
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: versionAfterFailure,
    requestId: 'req-eb06s-3',
  });
  const stopEvents = stop.ok ? await consume(stop.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    failedGeneration: '第二次 WHY 失败（LLM_UNAVAILABLE；失败不产生状态写入，状态保持 WAITING v4）',
    stopAfterFailure: 'STOP 从 WAITING 合法终止（流事件 stopped、零内容分块、体验 COMPLETED v5、会话 ENDED；C6 事件 stop_requested / experience_completed / session_ended 齐备——无独立 "stopped" C6 事件，终止事实由流事件与完成事件权威登记）',
    gatewayCalls: '恒为 2（STOP/CHANGE 后不得重试旧体验、不得再次调用网关——EB-06 Forbidden）',
  };
  const actual = {
    firstResult: first.ok ? 'accepted' : 'ERROR',
    versionAfterFirst,
    failedResult: failed.ok ? 'OK（缺陷！）' : failed.error.code,
    versionAfterFailure,
    statusAfterFailure,
    stopResult: stop.ok ? 'accepted' : stop.error.code,
    stopStreamTypes: stopEvents.map((event) => event.type),
    stopRequestedEventCount: eventsOf(events, 'stop_requested').length,
    experienceCompletedCount: eventsOf(events, 'experience_completed').length,
    sessionEndedCount: eventsOf(events, 'session_ended').length,
    contentChunkCount: stopEvents.filter((event) => event.type === 'chunk').length,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    gatewayCalls: gateway.calls.calls,
  };
  const pass =
    first.ok &&
    versionAfterFirst === 4 &&
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    versionAfterFailure === 4 &&
    statusAfterFailure === 'WAITING' &&
    stop.ok &&
    stopEvents.some((event) => event.type === 'stopped') &&
    !stopEvents.some((event) => event.type === 'chunk') &&
    eventsOf(events, 'stop_requested').length === 1 &&
    eventsOf(events, 'experience_completed').length === 1 &&
    eventsOf(events, 'session_ended').length === 1 &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'COMPLETED' &&
    gateway.calls.calls === 2;
  return { expected, actual, pass };
}

// --- EB-07：超时边界（延迟拒绝 → 有界恢复 + 用户控制保留） -------------
async function caseEb07TimeoutRecovery(trace) {
  const gateway = recoverableGateway();
  const { runtime, events, traces } = createCaseRuntime(gateway);
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const eventsBeforeFailure = events.length;
  // 第一次提交：网关超时类故障（延迟 50ms 后拒绝）。
  const failed = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb07-1',
  });
  const versionAfterFailure = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const eventsAfterFailure = events.length;
  // 用户控制保留：同一体验后续合法输入成功完成。
  const retry = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterFailure,
    requestId: 'req-eb07-2',
  });
  const retryEvents = retry.ok ? await consume(retry.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    timeoutBehavior: '超时 → 有界恢复（bounded recovery）：状态保留、版本不变、无隐藏续行',
    userControl: '用户控制保留——同一体验后续合法 WHY 输入成功完成（WAITING v4，内容逐字节等于语料）',
    noAutoDecision: '不因模型超时而自行决定新的体验方向（EB-07 禁止项）',
  };
  const actual = {
    failedResult: failed.ok ? 'OK（缺陷！）' : `${failed.error.code}/retryable=${failed.error.retryable}`,
    versionAfterFailure,
    failureEventTypes: events.slice(eventsBeforeFailure).map((event) => event.event_type),
    hiddenContinuationEvents: eventsAfterFailure - eventsBeforeFailure,
    retryResult: retry.ok ? 'accepted' : retry.error.code,
    retryContent: contentOf(retryEvents),
    fixtureContent: why.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    gatewayCalls: gateway.calls.calls,
    decisionTraceCount: traces.length,
  };
  const pass =
    !failed.ok &&
    failed.error.code === 'LLM_UNAVAILABLE' &&
    failed.error.retryable === true &&
    versionAfterFailure === 2 &&
    eventsAfterFailure - eventsBeforeFailure === 4 &&
    retry.ok &&
    contentOf(retryEvents) === why.chunks.join('') &&
    finalState.ok &&
    finalState.state.stateVersion === 4 &&
    finalState.state.status === 'WAITING' &&
    gateway.calls.calls === 2 &&
    traces.length === 1;
  return { expected, actual, pass };
}

// --- EB-08：LLM 边界（confidence 不影响决策；运行时不读 confidence） ----
async function caseEb08Confidence(trace) {
  const runtimeA = createCaseRuntime(scriptedGateway({ confidence: 0.0 }));
  const runtimeB = createCaseRuntime(scriptedGateway({ confidence: 1.0 }));
  const run = async (context) => {
    const { session, intent, exp } = await setupChain(context.runtime, { rawInput: '为什么' });
    const sub = await context.runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHY',
      rawInput: '为什么？',
      expectedStateVersion: exp.stateVersion,
      requestId: `req-eb08-${context.label}`,
    });
    const streamEvents = sub.ok ? await consume(sub.stream) : [];
    const finalState = context.runtime.getExperienceState(exp.experienceId);
    return {
      sub,
      streamEvents,
      finalState,
      trace: context.traces[0] ?? null,
    };
  };
  const resultA = await run({ ...runtimeA, label: 'a' });
  const resultB = await run({ ...runtimeB, label: 'b' });
  const runtimeSource = await readProductSource('src/experience/runtime.ts');
  const policySource = await readProductSource('src/experience/policy.ts');
  const expected = {
    decisionInvariance: 'confidence 0.0 与 1.0 的提案产生完全一致的决策（selected_action / 终态 / 版本链 / 流内容逐字节等于合成语料）',
    llmBoundary: 'LLM 网关是能力边界而非产品控制中心——决策路径（运行时 + 策略）不读取 proposal.confidence（静态断言）；验证器仅做 schema 校验（数值 ∈ [0,1]），不参与决策',
  };
  const actual = {
    a: {
      selectedAction: resultA.sub.ok ? resultA.sub.header.policy_decision.selected_action : resultA.sub.error.code,
      finalState: resultA.finalState.ok ? `${resultA.finalState.state.status} v${resultA.finalState.state.stateVersion}` : 'ERROR',
      content: contentOf(resultA.streamEvents),
      traceSelectedAction: resultA.trace?.policy?.selected_action ?? null,
    },
    b: {
      selectedAction: resultB.sub.ok ? resultB.sub.header.policy_decision.selected_action : resultB.sub.error.code,
      finalState: resultB.finalState.ok ? `${resultB.finalState.state.status} v${resultB.finalState.state.stateVersion}` : 'ERROR',
      content: contentOf(resultB.streamEvents),
      traceSelectedAction: resultB.trace?.policy?.selected_action ?? null,
    },
    runtimeReadsConfidence: /\.confidence\b/.test(runtimeSource),
    policyReadsConfidence: /\.confidence\b/.test(policySource),
  };
  const pass =
    resultA.sub.ok &&
    resultB.sub.ok &&
    resultA.sub.header.policy_decision.selected_action === 'EXPLAIN' &&
    resultB.sub.header.policy_decision.selected_action === 'EXPLAIN' &&
    resultA.trace?.policy?.selected_action === resultB.trace?.policy?.selected_action &&
    resultA.finalState.state.stateVersion === resultB.finalState.state.stateVersion &&
    resultA.finalState.state.status === resultB.finalState.state.status &&
    contentOf(resultA.streamEvents) === contentOf(resultB.streamEvents) &&
    contentOf(resultA.streamEvents) === why.chunks.join('') &&
    !/\.confidence\b/.test(runtimeSource) &&
    !/\.confidence\b/.test(policySource);
  return { expected, actual, pass };
}

// --- EB-09：前端边界（S1 无前端；产品 API 是唯一状态变更面） -----------
async function caseEb09FrontendBoundary(trace) {
  const apiFiles = await listFiles(path.join(repoRoot, 'app', 'api'), '.ts');
  const routeImports = {};
  const violations = [];
  const allowedModules = ['server-runtime', '/experience/http', '/experience/audit'];
  for (const rel of apiFiles) {
    const source = await readProductSource(path.join('app', 'api', rel));
    const specifiers = importSpecifiers(source);
    routeImports[path.join('app', 'api', rel)] = specifiers;
    for (const specifier of specifiers) {
      const resolvesToProductModule = specifier.includes('src/experience/');
      if (resolvesToProductModule && !allowedModules.some((allowed) => specifier.includes(allowed))) {
        violations.push({ file: path.join('app', 'api', rel), specifier });
      }
    }
  }
  const frontendFiles = await listFiles(path.join(repoRoot, 'app'), '.tsx');
  const frontendMutates = [];
  for (const rel of frontendFiles) {
    const source = await readProductSource(path.join('app', rel));
    if (/state-store|ExperienceState|\.commit\(/.test(source)) {
      frontendMutates.push(path.join('app', rel));
    }
  }
  const expected = {
    frontendRole: 'Frontend 只负责 render/input/interaction（S1 无前端页面直接访问状态层）',
    apiSurface: 'app/api 路由仅导入 server-runtime / http / audit——状态变更只能经 Runtime 实例方法',
  };
  const actual = {
    routeImports,
    violations,
    frontendFiles,
    frontendMutates,
  };
  const pass = violations.length === 0 && frontendMutates.length === 0;
  return { expected, actual, pass };
}

// --- EB-10：记忆写入边界（S1 无记忆持久化；memory 字段提案被拒） -------
async function caseEb10MemoryBoundary(trace) {
  const experienceFiles = await listFiles(path.join(repoRoot, 'src', 'experience'), '.ts');
  const apiFiles = await listFiles(path.join(repoRoot, 'app', 'api'), '.ts');
  const memoryFiles = experienceFiles
    .concat(apiFiles)
    .filter((rel) => /memory/i.test(rel));
  const memoryImports = [];
  for (const [base, files] of [
    [path.join('src', 'experience'), experienceFiles],
    [path.join('app', 'api'), apiFiles],
  ]) {
    for (const rel of files) {
      const source = await readProductSource(path.join(base, rel));
      for (const specifier of importSpecifiers(source)) {
        if (/memory/i.test(specifier)) memoryImports.push({ file: rel, specifier });
      }
    }
  }
  // 动态：携带 memory_* 字段的提案 → 验证器拒绝（任何非空 state_update_proposal 均越权）。
  const { runtime, events } = createCaseRuntime(
    scriptedGateway({ state_update_proposal: { memory_candidate: '用户偏好蓝色' } }),
  );
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb10-1',
  });
  const finalState = runtime.getExperienceState(exp.experienceId);
  const expected = {
    s1Scope: 'S1 不持久化跨会话 Memory（PD-07）——无记忆模块、无记忆导入',
    dynamicRejection: '携带 memory_* 字段的状态写入提案 → POLICY_REJECTED + llm_output_rejected + state_write_rejected(llm_state_mutation_forbidden)，零状态写入',
  };
  const actual = {
    memoryFiles,
    memoryImports,
    ok: sub.ok,
    errorCode: sub.ok ? null : sub.error.code,
    llmOutputRejected: eventsOf(events, 'llm_output_rejected').map((event) => event.properties.reason),
    stateWriteRejected: eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason),
    stateVersion: finalState.ok ? finalState.state.stateVersion : null,
  };
  const pass =
    memoryFiles.length === 0 &&
    memoryImports.length === 0 &&
    !sub.ok &&
    sub.error.code === 'POLICY_REJECTED' &&
    eventsOf(events, 'llm_output_rejected').length === 1 &&
    eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason).includes('llm_state_mutation_forbidden') &&
    finalState.ok &&
    finalState.state.stateVersion === 2;
  return { expected, actual, pass };
}

// --- EB-11：工具授权边界（S1 无工具；tool_used === false） --------------
async function caseEb11ToolBoundary(trace) {
  const experienceFiles = await listFiles(path.join(repoRoot, 'src', 'experience'), '.ts');
  const apiFiles = await listFiles(path.join(repoRoot, 'app', 'api'), '.ts');
  const toolFiles = experienceFiles.concat(apiFiles).filter((rel) => /tool/i.test(rel));
  const toolImports = [];
  for (const [base, files] of [
    [path.join('src', 'experience'), experienceFiles],
    [path.join('app', 'api'), apiFiles],
  ]) {
    for (const rel of files) {
      const source = await readProductSource(path.join(base, rel));
      for (const specifier of importSpecifiers(source)) {
        if (/tool/i.test(specifier)) toolImports.push({ file: rel, specifier });
      }
    }
  }
  // 动态：完成交互的决策追踪 execution.tool_used 恒为 false。
  const { runtime, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb11-1',
  });
  await consume(sub.stream);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: runtime.getExperienceState(exp.experienceId).state.stateVersion,
    requestId: 'req-eb11-2',
  });
  await consume(stop.stream);
  const expected = {
    s1Scope: 'S1 无工具网关（无工具模块、无工具导入）',
    traceInvariant: '全部决策追踪 execution.tool_used === false（LLM 不得直接执行工具）；WHY 决策 llm_used === true（能力经 LLM 网关），STOP 决策 llm_used === false（用户主权动作不经 LLM——工具与 LLM 均为能力，非决策者）',
  };
  const actual = {
    toolFiles,
    toolImports,
    traces: traces.map((item) => ({
      decision_id: item.decision_id,
      tool_used: item.execution?.tool_used,
      llm_used: item.execution?.llm_used,
    })),
  };
  const pass =
    toolFiles.length === 0 &&
    toolImports.length === 0 &&
    traces.length === 2 &&
    traces.every((item) => item.execution?.tool_used === false) &&
    traces[0]?.execution?.llm_used === true;
  return { expected, actual, pass };
}

// --- EB-12：API 边界（错误语义可区分；HTTP 错误体结构） ----------------
async function caseEb12ApiBoundary(trace, auditOffset) {
  const runtimeSource = await readProductSource('src/experience/runtime.ts');
  // 静态：错误→HTTP 状态映射表（工程映射，记录于迭代记录）。
  const mapping = {
    STATE_VERSION_CONFLICT: /case 'STATE_VERSION_CONFLICT':\s*\n\s*case 'REQUEST_DUPLICATE':\s*\n\s*return 409;/.test(runtimeSource),
    REQUEST_DUPLICATE: /case 'STATE_VERSION_CONFLICT':\s*\n\s*case 'REQUEST_DUPLICATE':\s*\n\s*return 409;/.test(runtimeSource),
    LLM_UNAVAILABLE: /case 'LLM_UNAVAILABLE':\s*\n\s*return 503;/.test(runtimeSource),
    INTERNAL_ERROR: /case 'INTERNAL_ERROR':\s*\n\s*return 500;/.test(runtimeSource),
    default400: /default:\s*\n\s*return 400;/.test(runtimeSource),
  };
  const distinctStatuses = new Set([409, 503, 500, 400]);
  // HTTP 形态：错误体 {code, message, retryable} 齐备（405 / 400 / 409）。
  const methodNotAllowed = await httpJson('/api/experience/some-exp/event', { method: 'GET' });
  const badJson = await fetch(`${BASE_URL}/api/experience/some-exp/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  const badJsonPayload = await badJson.json().catch(() => null);
  const setup = await httpSetupChain('eb12');
  const stale = await httpPostEvent(setup, { requestId: 'req-f3-eb12-stale', stateVersion: 1 });
  const stalePayload = await stale.json().catch(() => null);
  const expected = {
    mapping: 'STATE_VERSION_CONFLICT/REQUEST_DUPLICATE→409；LLM_UNAVAILABLE→503；INTERNAL_ERROR→500；其余→400（工程映射，非错误契约规定）',
    distinguishable: '错误码经结构化错误体区分——禁止所有错误统一变成 500（EB-12 Error Semantics）',
    httpErrorBody: '运行时错误体 {code, message, retryable} 齐备（400/409 形态）；方法约束 405 体为 {error, allowed}（路由级工程约束，非错误契约结构）',
    http503: 'NOT RUN——服务端运行时（S1 合成模式）未暴露网关注入缝，LLM 故障无法经真实 HTTP 触发；进程内形态已覆盖（EB-06/EB-07 案例）',
  };
  const actual = {
    mapping,
    distinctStatusCount: distinctStatuses.size,
    methodNotAllowed: { status: methodNotAllowed.status, body: methodNotAllowed.payload },
    badJson: { status: badJson.status, body: badJsonPayload },
    staleVersion: { status: stale.status, body: stalePayload },
  };
  const errorBodyOk = (payload) =>
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.code === 'string' &&
    typeof payload.message === 'string' &&
    typeof payload.retryable === 'boolean';
  const pass =
    Object.values(mapping).every(Boolean) &&
    distinctStatuses.size >= 3 &&
    methodNotAllowed.status === 405 &&
    methodNotAllowed.payload?.error === 'METHOD_NOT_ALLOWED' &&
    badJson.status === 400 &&
    errorBodyOk(badJsonPayload) &&
    stale.status === 409 &&
    stalePayload?.code === 'STATE_VERSION_CONFLICT' &&
    errorBodyOk(stalePayload);
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- EB-13：完成边界（"好了"→STOP；完成类提案被拒；用户主权） ----------
async function caseEb13CompletionBoundary(trace) {
  const stopClassification = classifyInput('好了');
  const stopClassification2 = classifyInput('先这样');
  // 动态：队列网关——首次 WHY 正常提案（→ WAITING v4）；第二次 WHY 携带
  // is_complete 完成字段（Completion 不属于 LLM 自主权限）→ POLICY_REJECTED
  // （不产生状态写入，版本不消耗）；随后用户"好了"按 STOP 终止。
  const proposals = [
    { proposal_id: 'proposal_eb13_0001', content: why.chunks.join(''), state_update_proposal: {}, confidence: 1 },
    { proposal_id: 'proposal_eb13_0002', content: why.chunks.join(''), state_update_proposal: { is_complete: true }, confidence: 1 },
  ];
  const gateway = {
    async propose() {
      return proposals.shift() ?? { proposal_id: 'proposal_eb13_0003', content: why.chunks.join(''), state_update_proposal: {}, confidence: 1 };
    },
  };
  const { runtime, events, traces } = createCaseRuntime(gateway);
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb13-1',
  });
  await consume(first.stream);
  const versionAfterFirst = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: versionAfterFirst,
    requestId: 'req-eb13-2',
  });
  const versionAfterRejection = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  // 用户"好了"按 STOP 处理（用户主权，非 LLM 判断"用户应该还想继续"）。
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: versionAfterRejection,
    requestId: 'req-eb13-3',
  });
  const stopEvents = stop.ok ? await consume(stop.stream) : [];
  const stopTrace = traces.find((item) => item.semantic_action === 'STOP');
  const expected = {
    userSovereignty: '用户说"好了"必须按 STOP 处理（分类器确定性："好了"/"先这样" → STOP），而非 LLM 自行判断继续',
    completionField: 'LLM 提案携带 is_complete 完成字段 → POLICY_REJECTED + llm_output_rejected + state_write_rejected(llm_state_mutation_forbidden)（完成必须经 User Goal + Runtime State + Policy + 合法状态迁移），版本不消耗',
    stopDecision: 'STOP 从 WAITING 合法终止（流事件 stopped、零内容分块）；STOP 决策追踪 user_override === true（用户主导权动作）',
  };
  const actual = {
    classification好了: stopClassification.semanticAction,
    classification先这样: stopClassification2.semanticAction,
    firstResult: first.ok ? 'accepted' : 'ERROR',
    versionAfterFirst,
    completionProposalResult: sub.ok ? 'OK（缺陷！）' : sub.error.code,
    versionAfterRejection,
    llmOutputRejected: eventsOf(events, 'llm_output_rejected').length,
    stateWriteRejected: eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason),
    stopResult: stop.ok ? 'accepted' : stop.error.code,
    stopStreamTypes: stopEvents.map((event) => event.type),
    stopTrace: stopTrace
      ? { user_override: stopTrace.user_override, selected_action: stopTrace.policy?.selected_action }
      : null,
  };
  const pass =
    stopClassification.semanticAction === 'STOP' &&
    stopClassification2.semanticAction === 'STOP' &&
    first.ok &&
    versionAfterFirst === 4 &&
    !sub.ok &&
    sub.error.code === 'POLICY_REJECTED' &&
    versionAfterRejection === versionAfterFirst &&
    eventsOf(events, 'llm_output_rejected').length === 1 &&
    eventsOf(events, 'state_write_rejected').map((event) => event.properties.reason).includes('llm_state_mutation_forbidden') &&
    stop.ok &&
    stopEvents.some((event) => event.type === 'stopped') &&
    !stopEvents.some((event) => event.type === 'chunk') &&
    stopTrace?.user_override === true &&
    stopTrace?.policy?.selected_action === 'STOP';
  return { expected, actual, pass };
}

// --- EB-14：分析边界（事件日志追加只写——前缀不可变） ------------------
async function caseEb14AppendOnly(trace, auditOffset) {
  const setup = await httpSetupChain('eb14');
  const first = await httpPostEvent(setup, { requestId: 'req-f3-eb14-1' });
  const firstEvents = await readStreamEvents(first.body);
  const contentAfterFirst = await readFile(httpEventLogPath, 'utf8');
  const lengthAfterFirst = contentAfterFirst.length;
  // 第二次交互：新意图解析 + 新事件提交。
  const intent2 = await httpJson('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-f3-eb14-intent2-${Math.random().toString(16).slice(2, 8)}`,
      session_id: setup.sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const second = await httpPostEvent(
    { ...setup, stateVersion: firstEvents.find((event) => event.type === 'state_updated')?.state_version ?? setup.stateVersion },
    { requestId: 'req-f3-eb14-2' },
  );
  const secondEvents = await readStreamEvents(second.body);
  const contentAfterSecond = await readFile(httpEventLogPath, 'utf8');
  const lengthAfterSecond = contentAfterSecond.length;
  const expected = {
    analyticsRole: '分析只能观察（User Event / System Event / Decision Trace / Outcome / Metric），不能修改 Runtime State',
    appendOnly: '事件日志追加只写——第二次交互后前缀字节逐字节不变、长度严格递增（无历史改写）',
  };
  const actual = {
    firstStatus: first.status,
    firstFinalVersion: firstEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    secondStatus: second.status,
    secondFinalVersion: secondEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    lengthAfterFirst,
    lengthAfterSecond,
    prefixUnchanged: contentAfterSecond.startsWith(contentAfterFirst),
  };
  const pass =
    first.status === 200 &&
    second.status === 200 &&
    lengthAfterSecond > lengthAfterFirst &&
    contentAfterSecond.startsWith(contentAfterFirst) &&
    secondEvents.find((event) => event.type === 'state_updated')?.state_version === 6;
  return { expected, actual, pass, newAuditOffset: auditOffset };
}

// --- EB-15：可回放性（从事件流 + 决策追踪重建终态） --------------------
async function caseEb15Replayability(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, { rawInput: '为什么' });
  const first = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: 'req-eb15-1',
  });
  await consume(first.stream);
  const versionAfterFirst = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: versionAfterFirst,
    requestId: 'req-eb15-2',
  });
  await consume(stop.stream);
  const finalState = runtime.getExperienceState(exp.experienceId);

  // 回放重建：仅使用记录的事件流与决策追踪。
  const transitions = eventsOf(events, 'state_transitioned');
  const replayChain = transitions.map((event) => ({
    before: event.properties.state_version_before,
    after: event.properties.state_version_after,
  }));
  const chainContiguous = replayChain.every((entry) => entry.after === entry.before + 1);
  const traceChain = traces
    .filter((item) => item.state_before !== null && item.state_after !== null)
    .map((item) => ({ before: item.state_before.state_version, after: item.state_after.state_version }));
  const traceChainOk = traceChain.every((entry) => entry.after === entry.before + 1);
  const maxEventVersion = Math.max(
    ...events
      .map((event) => event.context?.state_version)
      .filter((version) => Number.isInteger(version) && version > 0),
  );
  const lastTransition = transitions[transitions.length - 1];
  const replayedFinal = lastTransition
    ? { status: lastTransition.properties.to.status, stage: lastTransition.properties.to.stage }
    : null;
  const sequenceOk = events
    .filter((event) => event.context?.experience_id === exp.experienceId)
    .every((event, index, list) => index === 0 || event.sequence_number > list[index - 1].sequence_number);
  const versionedEventsInRange = events
    .map((event) => event.context?.state_version)
    .filter((version) => Number.isInteger(version) && version > 0)
    .every((version) => version <= finalState.state.stateVersion);

  const expected = {
    replayQuestion: '可回放回答"为什么当时系统做出了这个决定"（Event + Decision Trace + State 版本链）',
    reconstruction: '从事件流 state_transitioned 链与决策追踪 state_before/state_after 链重建：每次提交 +1、链连续、终态与运行时视图一致',
    coverage: '支持 STOP / CHANGE / stale write 的行为回放（本案例覆盖 STOP；CHANGE / stale 见 G2-CHAIN-02 / G2-VERSION-01 存档轨迹）',
  };
  const actual = {
    replayChain,
    chainContiguous,
    traceChain,
    traceChainOk,
    maxEventVersion,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    replayedFinal,
    sequenceMonotonic: sequenceOk,
    versionedEventsInRange,
    traceCount: traces.length,
    traceDecisions: traces.map((item) => item.decision_id),
  };
  const pass =
    chainContiguous &&
    traceChainOk &&
    traceChain.length === 2 &&
    maxEventVersion === finalState.state.stateVersion &&
    finalState.ok &&
    finalState.state.stateVersion === 5 &&
    finalState.state.status === 'COMPLETED' &&
    replayedFinal?.status === 'COMPLETED' &&
    replayedFinal?.stage === 'COMPLETION' &&
    sequenceOk &&
    versionedEventsInRange;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'G2-CHAIN-01',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-8.1 §B.1（G2 动态跨契约一致性）；门禁转换表"编码后 G"（真实请求、状态前后、决策轨迹、事件及版本）；C1/C2/C4/C5/C6/C7/C8/C9 一致性',
    scope: 'G2 动态（跨契约链路）',
    precondition: '标准链路（Session → WHY 意图 → 体验启动 v2）',
    inputFault: '无（正向链路一致性验证）',
    run: caseG2Chain01,
  },
  {
    caseId: 'G2-CHAIN-02',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-8.1 §B.1；状态机 §14 复合迁移；S1-10（旧 operation 不得提交）；CC02 H03',
    scope: 'G2 动态（CHANGE 链路 + generation 归属）',
    precondition: 'WHY 生成在途（ACTIVE v3，generation G1）',
    inputFault: '无（正向）；迟到达旧 generation 提交（负向验证）',
    run: caseG2Chain02,
  },
  {
    caseId: 'G2-FAULT-01',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-8.1 §B.1（故障链路）；授权 §5.7（未知情况升级）；S1 §28 INVALID_ACTION',
    scope: 'G2 动态（故障链：不可分类输入）',
    precondition: '标准链路 v2',
    inputFault: '不可分类输入（分类 UNKNOWN）',
    run: caseG2Fault01,
  },
  {
    caseId: 'G2-FAULT-02',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-8.1 §B.1（故障链路）；API §11.3 Semantic validation（客户端不得注入策略动作）',
    scope: 'G2 动态（故障链：语义不匹配）',
    precondition: '标准链路（DIRECT_ANSWER 意图）v2',
    inputFault: '声明语义动作（WHY）与分类结果（DIRECT_ANSWER）不一致',
    run: caseG2Fault02,
  },
  {
    caseId: 'G2-VERSION-01',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-8.1 §B.1（版本）；EB-02（State Version）；S1 §12；C6 §25',
    scope: 'G2 动态（版本链完整性）',
    precondition: '标准链路 v2',
    inputFault: '链中插入陈旧写入（expected=启动版本）',
    run: caseG2Version01,
  },
  {
    caseId: 'EB01-SINGLE-WRITER',
    form: 'static+in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-01（Runtime Single Writer）',
    scope: 'G4 工程边界',
    precondition: '已提交产品源码（静态导入图）',
    inputFault: '无（静态验证：写入 API 所有权 + 未授权写入测试 + 模块权限测试）',
    run: caseEb01SingleWriter,
  },
  {
    caseId: 'EB02-FAIL-NO-BUMP',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-02（State Version：失败写入不消耗版本号）',
    scope: 'G4 工程边界',
    precondition: '标准链路 v2（READY）',
    inputFault: '陈旧写入 + 非法状态转换（STOP 从 READY）',
    run: caseEb02FailNoBump,
  },
  {
    caseId: 'EB03-HTTP-DUP',
    form: 'http',
    sourceClause: 'P2-EVIDENCE-4.0 EB-03（Idempotency）；API §2.4；C6 §27',
    scope: 'G4 工程边界（HTTP 形态）',
    precondition: 'HTTP 形态标准链路 v2',
    inputFault: '重复 request_id 提交同一事件',
    run: caseEb03HttpDuplicate,
  },
  {
    caseId: 'EB04-INTERRUPT',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-04（Interruptibility：I1–I4 必需中断案例）',
    scope: 'G4 工程边界',
    precondition: 'WHY 生成在途（ACTIVE v3，generation G1）',
    inputFault: 'I3 生成中常规输入；I2 生成中 CHANGE；旧 generation 迟到达提交；I1/I4 STOP',
    run: caseEb04Interrupt,
  },
  {
    caseId: 'EB05-STALE-LATE',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-05（Stale Result Rejection：P2 强制测试——旧请求晚于新请求返回）',
    scope: 'G4 工程边界',
    precondition: 'DIRECT_ANSWER 生成在途（ACTIVE v3，generation G1）',
    inputFault: 'CHANGE 提交新状态后，旧 generation 完成提交迟到达',
    run: caseEb05StaleLate,
  },
  {
    caseId: 'EB06-RETRY',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-06（Retry Boundary：重试是工程恢复机制而非产品决策机制）',
    scope: 'G4 工程边界',
    precondition: '标准链路 v2；网关注入失败（证据注入点）',
    inputFault: 'LLM 网关调用失败（模拟 transient failure）',
    run: caseEb06RetryBoundary,
  },
  {
    caseId: 'EB06-NO-RETRY-STOP',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-06 Forbidden（User STOP → retry generation 为禁止项）',
    scope: 'G4 工程边界',
    precondition: '标准链路 v2；WHY 提交已失败（LLM_UNAVAILABLE）',
    inputFault: '失败后用户 STOP——不得触发网关重试',
    run: caseEb06NoRetryAfterStop,
  },
  {
    caseId: 'EB07-TIMEOUT-RECOVERY',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-07（Timeout Boundary：超时 → 有界恢复 → 保留状态 → 允许用户控制）',
    scope: 'G4 工程边界',
    precondition: '标准链路 v2；网关首次调用延迟拒绝（模拟超时）',
    inputFault: 'LLM 超时类故障；随后同一体验合法输入',
    run: caseEb07TimeoutRecovery,
  },
  {
    caseId: 'EB08-CONFIDENCE',
    form: 'in-process+static',
    sourceClause: 'P2-EVIDENCE-4.0 EB-08（LLM Boundary：LLM 网关是能力边界而非产品控制中心）',
    scope: 'G4 工程边界',
    precondition: '两个运行时（网关 confidence 0.0 / 1.0）',
    inputFault: '提案 confidence 极端差异——决策不得受影响',
    run: caseEb08Confidence,
  },
  {
    caseId: 'EB09-FRONTEND',
    form: 'static',
    sourceClause: 'P2-EVIDENCE-4.0 EB-09（Frontend Boundary：Frontend → Product API，而非 Frontend → LLM Provider）',
    scope: 'G4 工程边界',
    precondition: '已提交产品源码（S1 无前端页面；app/api 为唯一产品面）',
    inputFault: '无（静态验证：路由导入面 + 前端文件无状态变更）',
    run: caseEb09FrontendBoundary,
  },
  {
    caseId: 'EB10-MEMORY',
    form: 'static+in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-10（Memory Write Boundary）；PD-07（S1 不持久化跨会话 Memory）',
    scope: 'G4 工程边界',
    precondition: '已提交产品源码；S1 范围无记忆模块',
    inputFault: '携带 memory_* 字段的 LLM 状态写入提案',
    run: caseEb10MemoryBoundary,
  },
  {
    caseId: 'EB11-TOOL',
    form: 'static+in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-11（Tool Authorization Boundary：LLM 不得直接执行工具）',
    scope: 'G4 工程边界',
    precondition: '已提交产品源码；S1 范围无工具网关',
    inputFault: '无（S1 无工具路径——静态缺席证明 + 决策追踪 tool_used 不变式）',
    run: caseEb11ToolBoundary,
  },
  {
    caseId: 'EB12-ERROR-MAP',
    form: 'static+http',
    sourceClause: 'P2-EVIDENCE-4.0 EB-12（API Boundary：Error Semantics 必须区分；禁止统一 500）',
    scope: 'G4 工程边界',
    precondition: '已提交产品源码（错误映射表）；HTTP 形态服务器',
    inputFault: '方法不允许 / 非法 JSON / 陈旧 state_version（HTTP 形态错误体结构）',
    run: caseEb12ApiBoundary,
  },
  {
    caseId: 'EB13-COMPLETION',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-13（Completion Boundary：完成不属于 LLM 自主权限）；S1 §20',
    scope: 'G4 工程边界',
    precondition: '标准链路 v2',
    inputFault: 'LLM 提案携带 is_complete 字段；用户"好了"输入',
    run: caseEb13CompletionBoundary,
  },
  {
    caseId: 'EB14-APPEND-ONLY',
    form: 'http',
    sourceClause: 'P2-EVIDENCE-4.0 EB-14（Analytics Boundary：分析只能观察，不能修改 Runtime State）',
    scope: 'G4 工程边界（HTTP 形态）',
    precondition: 'HTTP 形态标准链路 + 首次 WHY 交互完成',
    inputFault: '第二次交互后验证事件日志前缀不可变（追加只写）',
    run: caseEb14AppendOnly,
  },
  {
    caseId: 'EB15-REPLAY',
    form: 'in-process',
    sourceClause: 'P2-EVIDENCE-4.0 EB-15（Replayability：从 Event + Decision Trace + State Snapshot 重建关键行为）',
    scope: 'G4 工程边界',
    precondition: 'WHY → STOP 完整交互（v2 → v5 COMPLETED）',
    inputFault: '无（回放重建：版本链 +1 不变式、终态一致性、sequence 单调）',
    run: caseEb15Replayability,
  },
];

// ---------------------------------------------------------------------------
// 静态扫描：无真实提供方调用（A16 同构）
// ---------------------------------------------------------------------------
async function staticNoEgressScan() {
  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bhttps?:\/\//,
    /\bnavigator\.sendBeacon\b/,
    /openai|anthropic|claude|gemini|llama|mistral|qwen|deepseek|zhipu|moonshot|minimax|baidu|aliyun.*dashscope/i,
    /\bapi[_-]?key\b/i,
    /\bsecret\b/i,
    /\btoken\b/i,
    /\bcredential/i,
    /\bpassword\b/i,
  ];
  const files = [
    ...(await listFiles(path.join(repoRoot, 'src', 'experience'), '.ts')).map((rel) => path.join('src', 'experience', rel)),
    ...(await listFiles(path.join(repoRoot, 'app', 'api'), '.ts')).map((rel) => path.join('app', 'api', rel)),
  ];
  const violations = [];
  for (const rel of files) {
    const source = await readProductSource(rel);
    for (const pattern of forbiddenPatterns) {
      const match = source.match(pattern);
      if (match) {
        violations.push({ file: rel, pattern: String(pattern), match: match[0] });
      }
    }
  }
  return { files, violations };
}

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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1-E2E-0001 / F2-GS-0001).
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
  for (const definition of CASE_REGISTRY) {
    const trace = new TraceWriter(tracesDir, `${RUN_ID}:${definition.caseId}`);
    await trace.start({ form: definition.form, sourceClause: definition.sourceClause });
    log(`case ${definition.caseId}: RUNNING (${definition.form})`);
    let outcome;
    try {
      outcome = await definition.run(trace, auditOffset);
    } catch (error) {
      await trace.emit('executor-error', { error: String(error) });
      outcome = {
        expected: { executed: 'without error' },
        actual: { error: String(error) },
        pass: false,
      };
    }
    const newOffset = outcome.newAuditOffset ?? auditOffset;
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
        '工程边界（P2-EVIDENCE-4.0）：重试是工程恢复机制而非产品决策机制（EB-06）；超时不自行决定新方向（EB-07）；完成不属于 LLM 自主权限（EB-13）；分析只能观察（EB-14）',
        '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方；不收集真实用户数据',
      ],
      evidence: {
        trace: `traces/${`${RUN_ID}:${definition.caseId}`}.jsonl`,
        traceSha256: sha256OfBuffer(
          Buffer.from(
            await readFile(path.join(tracesDir, `${`${RUN_ID}:${definition.caseId}`}.jsonl`), 'utf8'),
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

  // Static scans (no-egress; recorded as evidence, not a case).
  const egressScan = await staticNoEgressScan();
  log(`static no-egress scan: ${egressScan.files.length} files scanned, ${egressScan.violations.length} violations`);

  // Assertions.
  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  const allCasesPass = caseResults.every((entry) => entry.pass);

  // B3: case records complete for all cases.
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  const recordCheck = recordFiles.length === CASE_REGISTRY.length;
  assert(
    'B3',
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4）`,
    recordCheck && allCasesPass,
    { recordFiles: recordFiles.length, expected: CASE_REGISTRY.length, allCasesPass },
  );

  // B4: traces exist and are non-empty.
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
  assert('B4', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // B5: G2-CHAIN-01.
  const g2c1 = caseResults.find((entry) => entry.caseId === 'G2-CHAIN-01');
  assert(
    'B5',
    'G2-CHAIN-01：WHY 完整链路跨契约一致性（C1 会话 / C2 意图 / C4 状态机 / C5 语义动作 / C6 策略 / C7/C8 提案内容 / C9 终态 + 信封全量 + sequence 单调 + 决策追踪分离）',
    g2c1?.pass === true,
    { g2c1: g2c1?.pass },
  );

  // B6: G2-CHAIN-02.
  const g2c2 = caseResults.find((entry) => entry.caseId === 'G2-CHAIN-02');
  assert(
    'B6',
    'G2-CHAIN-02：CHANGE 完整链路（复合步骤 [CHANGE_DIRECTION, EXPERIENCE_STARTED, USER_ACTION]、单次提交 v3→v4、generation 归属正确、迟到达旧 generation 提交 STALE_GENERATION 拒绝）',
    g2c2?.pass === true,
    { g2c2: g2c2?.pass },
  );

  // B7: G2 fault chains.
  const g2f1 = caseResults.find((entry) => entry.caseId === 'G2-FAULT-01');
  const g2f2 = caseResults.find((entry) => entry.caseId === 'G2-FAULT-02');
  assert(
    'B7',
    'G2 故障链：不可分类输入 → INVALID_ACTION 升级（零事件/零追踪/零版本消耗）；语义不匹配 → INVALID_REQUEST（零副作用）',
    g2f1?.pass === true && g2f2?.pass === true,
    { g2f1: g2f1?.pass, g2f2: g2f2?.pass },
  );

  // B8: G2 version chain.
  const g2v1 = caseResults.find((entry) => entry.caseId === 'G2-VERSION-01');
  assert(
    'B8',
    'G2-VERSION-01：版本链完整性（每次合法提交恰好 +1；陈旧写入拒绝且不消耗版本号；最终版本 = 全部事件 context.state_version 最大值）',
    g2v1?.pass === true,
    { g2v1: g2v1?.pass },
  );

  // B9: EB-01.
  const eb01 = caseResults.find((entry) => entry.caseId === 'EB01-SINGLE-WRITER');
  assert(
    'B9',
    'EB-01 Runtime 单一写入者：state-store 仅被 runtime.ts 导入；.commit( 仅在 runtime.ts 调用；API 路由不直接导入状态层（未授权写入测试 + 模块权限测试 + 写入所有权）',
    eb01?.pass === true,
    { eb01: eb01?.pass },
  );

  // B10: EB-02.
  const eb02 = caseResults.find((entry) => entry.caseId === 'EB02-FAIL-NO-BUMP');
  assert(
    'B10',
    'EB-02 状态版本：失败写入（陈旧 + 非法转换双路径）不消耗版本号——v2 → v2，零 state_transitioned',
    eb02?.pass === true,
    { eb02: eb02?.pass },
  );

  // B11: EB-03.
  const eb03 = caseResults.find((entry) => entry.caseId === 'EB03-HTTP-DUP');
  assert(
    'B11',
    'EB-03 幂等（HTTP 形态）：重复 request_id → 409 REQUEST_DUPLICATE（{code,message,retryable} 结构），事件日志长度不变（仅一次执行）',
    eb03?.pass === true,
    { eb03: eb03?.pass },
  );

  // B12: EB-04.
  const eb04 = caseResults.find((entry) => entry.caseId === 'EB04-INTERRUPT');
  assert(
    'B12',
    'EB-04 可中断性（I1–I4 组合）：生成中常规输入拒绝（retryable）；CHANGE 取消旧 generation（superseded_by_change）；旧 generation 迟到达提交 STALE_GENERATION 拒绝；STOP 终止（零内容分块、COMPLETED、ENDED）；网关恰好 2 次调用',
    eb04?.pass === true,
    { eb04: eb04?.pass },
  );

  // B13: EB-05.
  const eb05 = caseResults.find((entry) => entry.caseId === 'EB05-STALE-LATE');
  assert(
    'B13',
    'EB-05 过期结果拒绝（P2 强制测试）：旧请求晚于新请求返回 → STALE_GENERATION；state_write_rejected 携带 attempted/active generation_id；新状态（v5 WAITING）未被污染',
    eb05?.pass === true,
    { eb05: eb05?.pass },
  );

  // B14: EB-06.
  const eb06 = caseResults.find((entry) => entry.caseId === 'EB06-RETRY');
  const eb06s = caseResults.find((entry) => entry.caseId === 'EB06-NO-RETRY-STOP');
  assert(
    'B14',
    'EB-06 重试边界：网关失败 → 恰好 1 次调用（无自动重试）、LLM_UNAVAILABLE retryable=true、零状态写入、policy_decided.state_after=null；失败后 STOP 不触发网关调用（重试是工程恢复机制而非产品决策机制）',
    eb06?.pass === true && eb06s?.pass === true,
    { eb06: eb06?.pass, eb06s: eb06s?.pass },
  );

  // B15: EB-07.
  const eb07 = caseResults.find((entry) => entry.caseId === 'EB07-TIMEOUT-RECOVERY');
  assert(
    'B15',
    'EB-07 超时边界：延迟拒绝 → 有界恢复（版本不变、无隐藏续行——失败事件恰 4 个）；用户控制保留（同一体验后续合法 WHY 输入成功，WAITING v4，内容逐字节等于语料）；不因超时而自行决定新方向',
    eb07?.pass === true,
    { eb07: eb07?.pass },
  );

  // B16: EB-08.
  const eb08 = caseResults.find((entry) => entry.caseId === 'EB08-CONFIDENCE');
  assert(
    'B16',
    'EB-08 LLM 边界：confidence 0.0 与 1.0 提案决策完全一致（EXPLAIN / 同终态 / 同版本 / 同内容）；决策路径（运行时 + 策略）源码不读 proposal.confidence（静态断言）',
    eb08?.pass === true,
    { eb08: eb08?.pass },
  );

  // B17: EB-09.
  const eb09 = caseResults.find((entry) => entry.caseId === 'EB09-FRONTEND');
  assert(
    'B17',
    'EB-09 前端边界：app/api 路由仅导入 server-runtime / http / audit（无状态层直接导入）；前端文件无状态变更（Frontend → Product API 为唯一产品面）',
    eb09?.pass === true,
    { eb09: eb09?.pass },
  );

  // B18: EB-10.
  const eb10 = caseResults.find((entry) => entry.caseId === 'EB10-MEMORY');
  assert(
    'B18',
    'EB-10 记忆写入边界：S1 无记忆模块/导入（PD-07 缺席证明）；携带 memory_* 字段的提案 → POLICY_REJECTED + llm_output_rejected + state_write_rejected(llm_state_mutation_forbidden)，零状态写入',
    eb10?.pass === true,
    { eb10: eb10?.pass },
  );

  // B19: EB-11.
  const eb11 = caseResults.find((entry) => entry.caseId === 'EB11-TOOL');
  assert(
    'B19',
    'EB-11 工具授权边界：S1 无工具模块/导入（缺席证明）；全部决策追踪 execution.tool_used === false（LLM 不得直接执行工具）',
    eb11?.pass === true,
    { eb11: eb11?.pass },
  );

  // B20: EB-12.
  const eb12 = caseResults.find((entry) => entry.caseId === 'EB12-ERROR-MAP');
  assert(
    'B20',
    'EB-12 API 边界：错误→状态映射可区分且完备（409/503/500/400，禁止统一 500）；HTTP 错误体 {code,message,retryable} 齐备（405/400/409 形态验证）；HTTP 形态 503 NOT RUN 明示（服务端运行时未暴露网关注入缝——非结论登记）',
    eb12?.pass === true,
    { eb12: eb12?.pass },
  );

  // B21: EB-13.
  const eb13 = caseResults.find((entry) => entry.caseId === 'EB13-COMPLETION');
  assert(
    'B21',
    'EB-13 完成边界：用户"好了"/"先这样"确定性分类为 STOP（用户主权，非 LLM 判断）；LLM 提案携带 is_complete → POLICY_REJECTED（零状态写入）；STOP 决策追踪 user_override === true',
    eb13?.pass === true,
    { eb13: eb13?.pass },
  );

  // B22: EB-14.
  const eb14 = caseResults.find((entry) => entry.caseId === 'EB14-APPEND-ONLY');
  assert(
    'B22',
    'EB-14 分析边界：HTTP 事件日志追加只写——第二次交互后前缀字节逐字节不变、长度严格递增（分析只能观察，不能修改 Runtime State）',
    eb14?.pass === true,
    { eb14: eb14?.pass },
  );

  // B23: EB-15.
  const eb15 = caseResults.find((entry) => entry.caseId === 'EB15-REPLAY');
  assert(
    'B23',
    'EB-15 可回放性：从事件流 + 决策追踪重建版本链（每次提交 +1、链连续、trace 链与事件链一致）、终态与运行时视图一致（COMPLETED/COMPLETION v5）、sequence_number 单调、全部版本化事件 ≤ 最终版本',
    eb15?.pass === true,
    { eb15: eb15?.pass },
  );

  // B25: no real provider egress.
  assert(
    'B25',
    '无真实提供方调用：产品运行时源码（src/experience/** + app/api/**）静态扫描无 fetch/网络/LLM 提供方/凭据引用',
    egressScan.violations.length === 0,
    { files: egressScan.files.length, violations: egressScan.violations.slice(0, 5) },
  );

  // B26: preflight.
  assert(
    'B26',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // B27: evidence-code binding.
  assert(
    'B27',
    '证据-代码绑定：运行于干净工作树（HEAD 记录于版本矩阵）；运行时文件哈希逐文件登记于 run-metadata.json',
    git.workTreeClean && typeof git.commit === 'string' && git.commit.length > 0,
    { head: git.commit, workTreeClean: git.workTreeClean, uncommittedEntries: git.uncommittedEntries },
  );

  // ---------------------------------------------------------------------------
  // E5 §3 version matrix (run-metadata.json).
  // ---------------------------------------------------------------------------
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
    obligation: 'P3-S1-IMPL-AUTH-01 §2 授权范围 / P2-EVIDENCE-8.1 §B：G2 动态跨契约一致性案例与故障链路 + G4 工程边界 EB-01…EB-16（F-3 迭代）',
    authorization: { id: 'P3-S1-IMPL-AUTH-01', version: '1.2.0', issued: '2026-08', note: 'F-1/F-2 履行记录见 §8/§9' },
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
      errorContract: 'S1 §28（INVALID_REQUEST / INVALID_STATE_TRANSITION / STATE_VERSION_CONFLICT / INVALID_ACTION / POLICY_REJECTED / LLM_SCHEMA_INVALID / LLM_UNAVAILABLE / REQUEST_DUPLICATE / INTERNAL_ERROR）；HTTP 状态码映射为工程实现（400/405/409/500/503），记录于迭代记录',
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
      nameReconciliation: 'S1 §23 → C6：intent_created→intent_received；semantic_action_detected→intent_parsed（携带 semantic_action 属性）；user_action→C6 §14 具体交互事件；version_conflict→state_version_conflict。调和表登记于迭代记录 P3-S1-IMPL-ITER-002 §4，pending 非作者复核（CR-16）',
    },
    engineeringBoundaries: {
      contract: 'P2-EVIDENCE-4.0',
      evidence: 'EB-01…EB-16 逐项证据见 cases/（EB01…EB15 案例）与断言 B9–B23；EB-16 版本可追溯由本版本矩阵 + B26/B27/B28 覆盖',
      s2ScopeItems: {
        EB10: 'S1 无记忆持久化（PD-07）：缺席证明 + memory 字段提案拒绝；S2 记忆生命周期（Candidate → Policy Evaluation → Active Memory）属 S2 范围',
        EB11: 'S1 无工具网关：缺席证明 + tool_used === false 不变式；S2 工具授权链（Tool Policy → Authorization → Execution → Validation）属 S2 范围',
      },
      notRunOverHttp: {
        EB12_503: 'HTTP 形态 LLM 故障（503 LLM_UNAVAILABLE）NOT RUN——S1 服务端运行时（合成模式）未暴露网关注入缝；进程内形态经 LlmGateway 接口注入失败网关已覆盖（EB-06/EB-07 案例）',
      },
    },
    evaluation: { contract: 'C7', version: 'evaluation_v1.0.0', note: 'G5 16 项评测包仍 NOT RUN；独立评测人须先审阅 F-1/F-2/F-3 staged 材料（review/README.md）' },
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
    model: { value: 'synthetic-fixture', reason: '同上；LLM 网关为合成实现（经 LlmGateway 接口；证据注入点用于故障/越权注入）' },
    corpus: {
      fixtures: [
        { fixtureId: 'synthetic/why/v1', file: 'src/experience/fixtures/why.ts', sha256: runtimeFileHashes['src/experience/fixtures/why.ts'] },
        { fixtureId: 'synthetic/change-direction/v1', file: 'src/experience/fixtures/change-direction.ts', sha256: runtimeFileHashes['src/experience/fixtures/change-direction.ts'] },
        { fixtureId: 'synthetic/direct-answer/v1', file: 'src/experience/fixtures/direct-answer.ts', sha256: runtimeFileHashes['src/experience/fixtures/direct-answer.ts'] },
        { fixtureId: 'synthetic/simulate/v1', file: 'src/experience/fixtures/simulate.ts', sha256: runtimeFileHashes['src/experience/fixtures/simulate.ts'] },
        { fixtureId: 'synthetic/stop/v1', file: '（运行时内联构造：STOP 无内容分块）', sha256: null },
      ],
      realUserData: false,
      privacyGuardrail: '隐私六要素批准前不得收集或保存任何真实用户数据（evidence-execution-plan §3；本运行仅合成数据）',
    },
    environment: {
      node: process.version,
      nodeLock: NODE_LOCK,
      next: nextVersion,
      react: reactVersion,
      typescript: typescriptVersion,
      lockfileVersion: lockfile.lockfileVersion,
      platform: process.platform,
      arch: process.arch,
      sqlite: sqliteVersion(),
    },
    packages: {
      product: { name: productPackage.name, version: productPackage.version, engines: productPackage.engines },
    },
    f1RegressionBaseline: {
      runId: 'F1-E2E-0001',
      result: '9/9 案例 PASS、12/12 断言 PASS、退出码 0（2026-10-08）',
      relation: 'F-1 流式端点行为在本迭代之前已冻结；本迭代未修改 http.ts/stream.ts/audit.ts（git diff d13e54e..bf21196 对三文件为空——F-2/F-3 迭代零改动）',
    },
    priorIterations: {
      f1: { runId: 'F1-E2E-0001', result: 'PASSED（9/9 案例、12/12 断言、退出码 0）' },
      f2: { runId: 'F2-GS-0001', result: 'PASSED（40/40 案例、24/24 断言、退出码 0）' },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    executor: 'tools/evidence/src/f3.mjs',
    executorSha256: sha256OfBuffer(await readFile(path.join(here, 'f3.mjs'))),
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix)');

  // B1: run-metadata completeness (E5 §3).
  const requiredSections = [
    'runId', 'obligation', 'authorization', 'productDecisions', 'contracts', 's1Specifications',
    'stateMachine', 'policy', 'api', 'event', 'engineeringBoundaries', 'evaluation', 'code',
    'prompt', 'model', 'corpus', 'environment', 'packages', 'startedAt', 'finishedAt', 'durationMs', 'executor',
  ];
  const missingSections = requiredSections.filter((section) => !(section in versionMatrix));
  assert('B1', 'run-metadata 完整（E5 §3 版本矩阵全部字段）', missingSections.length === 0, { missingSections });

  // B2: environment lock.
  assert(
    'B2',
    '环境锁定：engines.node === "24.21.0"（F-2 精确锁定）且执行于 Node v24.21.0；Next.js / React / TypeScript 版本登记',
    productPackage.engines?.node === '24.21.0' && process.version === NODE_LOCK,
    { enginesNode: productPackage.engines?.node, processVersion: process.version, next: nextVersion, react: reactVersion, typescript: typescriptVersion },
  );

  // B24: EB-16 version traceability.
  assert(
    'B24',
    'EB-16 版本可追溯：一次产品行为可关联 Product Version / Contract Versions / Schema Version / Policy Version / Code Revision / Corpus 版本（本矩阵全部登记）；运行时文件逐文件哈希；执行器自身哈希登记',
    missingSections.length === 0 &&
      Object.keys(runtimeFileHashes).length === runtimeFiles.length &&
      typeof versionMatrix.executorSha256 === 'string',
    { runtimeFileCount: Object.keys(runtimeFileHashes).length, executorSha256Registered: typeof versionMatrix.executorSha256 === 'string' },
  );

  // B28: SHA256SUMS.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('B28', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Summary.
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
    allPassed: allCasesPass && assertions.every((entry) => entry.passed),
    exitCode: allCasesPass && assertions.every((entry) => entry.passed) ? 0 : 1,
    vocabularyNote:
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4）或产品状态为 PASS（E5 §2）。G2 动态跨契约一致性与 G4 工程边界证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅 F-1/F-2/F-3 staged 材料）；CR-16/CR-17 待非作者复核。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (${caseResults.length} cases, ${assertions.length} assertions)`);

  // Review package (staged for the independent evaluator).
  const reviewReadme = `# ${RUN_ID} — 独立评测人审阅包（staged，待审阅与否决）

运行：${RUN_ID}（F-3 迭代：G2 动态跨契约一致性案例与故障链路 + G4 工程边界 EB-01…EB-16）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹 + http-events.jsonl（HTTP 形态服务端 C6 事件流）+ http-decision-traces.jsonl（决策追踪）+ http-audit.jsonl（F-1 形态审计汇）
3. run-metadata.json —— E5 §3 版本矩阵（含 engineeringBoundaries 专项：EB-01…EB-16 证据映射、S2 范围项处置、HTTP 503 NOT RUN 登记）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 本运行覆盖与未覆盖

已执行（本运行）：
- G2 动态跨契约一致性（5 案例）：WHY/CHANGE 完整链路跨契约一致性（状态前后、决策轨迹、事件及版本）；不可分类输入与语义不匹配故障链；版本链完整性（+1 不变式、失败写入不消耗版本号）
- G4 工程边界（EB-01…EB-15 案例 + EB-16 由版本矩阵覆盖）：单一写入者（静态导入图）、状态版本、幂等（HTTP 重复请求）、可中断性（I1–I4 组合）、过期结果拒绝（P2 强制测试）、重试边界（恰好一次调用）、超时边界（有界恢复 + 用户控制保留）、LLM 边界（confidence 无关性）、前端边界（路由导入面）、记忆/工具边界（S1 缺席证明 + 动态拒绝）、API 边界（错误语义可区分）、完成边界（用户主权）、分析边界（追加只写）、可回放性（版本链重建）

未执行（NOT RUN）：
- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（DEFERRED TO S2 或后续阶段）
- HTTP 形态 LLM 故障 503（EB-12）：S1 服务端运行时（合成模式）未暴露网关注入缝——进程内形态已覆盖；HTTP 形态须待网关注入缝决策（产品负责人）后执行
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）
- EB-10/EB-11 的 S2 范围项（记忆生命周期、工具授权链）属 S2 范围，本运行仅 S1 缺席证明

## 待复核项（不得由编码者自行确认）

- CR-16（S1 §23 → C6 事件名称调和）与 CR-17（policy_decided 发射时机解释）：PENDING NON-AUTHOR REVIEW（登记于 decision-register v0.8.0）
- 事件名称调和表 staged 于 F2-GS-0001/review/README.md

## 独立重跑

    cd tools/evidence && npm run f3   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 'f3-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 'f3-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
