// S3-API-0001 — S3b 暴露层动态证据执行器
// （S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划——
//   D-3 选项 A：既有端点 semanticAction 枚举扩展，纯暴露层；
//   依据 S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）
//
// 形态说明（http.ts 头部纪律——两种执行形态同一代码路径）：
// - 进程内形态（本运行）：证据执行器直接调用
//   handleExperienceStreamRequest（Route Handler 的薄封装目标
//   函数——app/api/experience/stream/route.ts 仅做转发），经
//   StreamRequestInput.runtime 注入案例独立运行时（进程内证据
//   不经服务器单例——getServerRuntime 仅在缺省时生效）。
// - HTTP 形态：Next.js 运行时经 Route Handler 调用本函数
//   （request.signal 为客户端断开信号）——形态差异仅在调用
//   入口，执行路径与决策追踪完全一致。
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate（G2/G4/G8）或产品状态为 PASS；
// - 进程内形态经 module.registerHooks 解析无扩展名说明符到真实 .ts 源码
//   （Node ≥23.6 原生类型剥离），使证据执行器运行的是已提交的真实运行时代码；
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
const { handleExperienceStreamRequest } = await import('../../../src/experience/http');
const { validateEventEnvelope } = await import('../../../src/experience/events');
const { classifyInput } = await import('../../../src/experience/classifier');
const { why } = await import('../../../src/experience/fixtures/why');
const { simulate } = await import('../../../src/experience/fixtures/simulate');
const { allFixtures } = await import('../../../src/experience/chunks');
const { SyntheticLlmGateway } = await import('../../../src/experience/llm-gateway');

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
const RUN_ID = 'S3-API-0001';
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
  '纯暴露层不变式（S3B-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 4 / D-3 选项 A）：API 面扩展不改变任何运行时语义、决策追踪、事件契约——同一运行时实例（证据形态经 options.runtime 注入构造的运行时，进程内证据不经服务器单例）',
  '请求形态判定（S3b）：会话上下文三要素齐备（request_id + session_id + user_input 均非空字符串）→ S2/S3 执行形态（真实运行路径）；否则为 S1 fixture 形态（semanticAction 直送——向后兼容，行为不变）',
  '执行形态路由（S3b）：experience_id + state_version 齐备 → 既有体验直接提交（含跨会话分支操作——会话绑定放宽仅限分支操作路径，运行时内校验三前提）；缺省 → resolveIntent（记忆操作 → NDJSON 单行结果 + done；升级 → 400 INVALID_ACTION；start_experience → startExperience + submitExperienceEvent → NDJSON 流）',
  '长期记忆识别纪律（S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.2）：识别仅在全部既有优先级层与记忆操作词表未命中后调用（仅认领会成为 UNKNOWN 的输入）；B 类须记住标记与偏好内容双命中——裸记住请求保持 UNKNOWN 升级纪律（黄金 G08-NEG 不变式）',
  '跨会话分支操作三前提（S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.4）：WHAT_IF 分类 + 分支操作词识别；输入会话 SESSION_ACTIVE；宿主会话 SESSION_ENDED——放宽仅限分支操作路径（内容轮保持严格会话绑定）',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
  '工程边界（P2-EVIDENCE-4.0）：超时不自行决定新方向（EB-07）；完成不属于 LLM 自主权限（EB-13）；分析只能观察（EB-14）',
  '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方；不收集真实用户数据；默认仅合成数据（ADR-0002 §3 证据沙箱硬边界）',
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

function tail(text, maxLines = 12) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-maxLines).join('\n');
}

function shortId() {
  return Math.random().toString(16).slice(2, 10);
}

function jsonEquals(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// ---------------------------------------------------------------------------
// 进程内形态辅助
// ---------------------------------------------------------------------------
function createCaseRuntime() {
  const events = [];
  const traces = [];
  const audit = [];
  const runtime = new ExperienceRuntime({
    eventSink: (event) => {
      events.push(event);
    },
    decisionTraceSink: (traceEntry) => {
      traces.push(traceEntry);
    },
    auditSink: (event) => {
      audit.push(event);
    },
  });
  return { runtime, events, traces, audit };
}

/** NDJSON 响应体解码为结构化行（HandlerResult.body → 行数组）。 */
async function ndjsonLines(handlerResult) {
  if (handlerResult.status !== 200 || handlerResult.body === null) {
    return [];
  }
  const decoder = new TextDecoder();
  const reader = handlerResult.body.getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/** 错误响应体解码（JSON 错误形态）。 */
async function errorBody(handlerResult) {
  if (handlerResult.body === null) {
    return {};
  }
  const decoder = new TextDecoder();
  const reader = handlerResult.body.getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** S2/S3 执行形态请求（stream 端点——三要素 + 可选既有体验定位）。 */
function executionRequest(requestId, sessionId, userInput, extra = {}) {
  return {
    method: 'POST',
    body: JSON.stringify({ request_id: requestId, session_id: sessionId, user_input: userInput, ...extra }),
    runtime: undefined, // 由调用方经 options 注入——见 runStreamCase
  };
}

/** 执行 stream 请求（注入案例运行时——进程内证据不经服务器单例）。 */
async function runStream(runtime, request) {
  return handleExperienceStreamRequest({ ...request, runtime });
}

// ---------------------------------------------------------------------------
// 黄金案例（S3b 暴露层——执行形态端到端）
// ---------------------------------------------------------------------------

// --- STREAM-EXECUTION：执行形态 WHAT_IF 全链路（真实运行路径） ---
async function caseStreamExecution(trace) {
  const { runtime, events, traces, audit } = createCaseRuntime();
  const session = await runtime.startSession();
  const result = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-exec-${shortId()}`,
      session_id: session.session.sessionId,
      user_input: '如果摩擦力为零会怎样',
    }),
    runtime,
  });
  const lines = await ndjsonLines(result);
  const submission = lines.find((line) => line.type === 'submission') ?? null;
  const chunks = lines.filter((line) => line.type === 'chunk');
  const done = lines.find((line) => line.type === 'done') ?? null;
  const stateUpdated = lines.find((line) => line.type === 'state_updated') ?? null;
  const memory = runtime.getMemory();
  const simulation = runtime.getSimulation(
    submission ? submission.experience_id : '',
  );
  const envelopeViolations = [];
  for (const event of events) {
    const validation = validateEventEnvelope(event);
    if (!validation.ok) envelopeViolations.push({ event_id: event.event_id, violations: validation.violations });
  }
  const expected = {
    routing: '三要素齐备（request_id + session_id + user_input）→ S2/S3 执行形态：resolveIntent（WHAT_IF）→ startExperience → submitExperienceEvent——真实运行路径（与进程内提交完全一致）',
    stream: 'NDJSON 流：submission 首行（accepted=true，experience_id，policy_decision{policy_version=policy_v2.2.0，semantic_action=WHAT_IF，selected_action=SIMULATE}，state_version，state）+ chunk ×17（内容逐字节等于 simulate 语料）+ done + state_updated（WAITING/SIMULATION，waiting_for_user=true）',
    domain: 'WHAT_IF 首轮自动 CREATE 分支 1（模拟域快照可查——currentBranchId=分支 1，rounds ×1，sourceInput=用户输入）；短期记忆经 STOP 路径登记（本案例无 STOP——records=0）',
    integrity: '全部事件信封符合 C6 §7；零信封违规',
  };
  const actual = {
    status: result.status,
    contentType: result.headers['Content-Type'],
    lineTypes: lines.map((line) => line.type),
    submission: submission
      ? {
          accepted: submission.accepted,
          experience_id: submission.experience_id,
          session_id: submission.session_id,
          policy_version: submission.policy_decision?.policy_version ?? null,
          semantic_action: submission.policy_decision?.semantic_action ?? null,
          selected_action: submission.policy_decision?.selected_action ?? null,
          state_version: submission.state_version,
          state: submission.state,
        }
      : null,
    chunkCount: chunks.length,
    contentMatchesFixture: chunks.map((chunk) => chunk.content).join('') === simulate.chunks.join(''),
    donePresent: done !== null,
    stateUpdated: stateUpdated
      ? { state_version: stateUpdated.state_version, status: stateUpdated.state?.status, stage: stateUpdated.state?.stage, waiting_for_user: stateUpdated.state?.waiting_for_user }
      : null,
    simulation: simulation.ok
      ? { currentBranchId: simulation.simulation.currentBranchId, branches: simulation.simulation.branches.length, rounds: simulation.simulation.branches[0]?.rounds.length ?? 0, sourceInput: simulation.simulation.branches[0]?.rounds[0]?.sourceInput ?? null }
      : { error: simulation.error?.code ?? 'unknown' },
    memoryRecords: memory.memory.records.length,
    envelopeViolations: envelopeViolations.length,
    sessionStartedEvents: events.filter((event) => event.event_type === 'session_started').length,
    experienceStartedEvents: events.filter((event) => event.event_type === 'experience_started').length,
  };
  const pass =
    result.status === 200 &&
    result.headers['Content-Type'] === 'application/x-ndjson' &&
    submission !== null &&
    submission.accepted === true &&
    submission.policy_decision?.policy_version === 'policy_v2.2.0' &&
    submission.policy_decision?.semantic_action === 'WHAT_IF' &&
    submission.policy_decision?.selected_action === 'SIMULATE' &&
    submission.state_version === 3 &&
    submission.state?.status === 'ACTIVE' &&
    submission.state?.stage === 'SIMULATION' &&
    chunks.length === 17 &&
    actual.contentMatchesFixture === true &&
    done !== null &&
    stateUpdated !== null &&
    stateUpdated.state_version === 4 &&
    stateUpdated.state?.status === 'WAITING' &&
    stateUpdated.state?.stage === 'SIMULATION' &&
    stateUpdated.state?.waiting_for_user === true &&
    simulation.ok === true &&
    simulation.simulation.currentBranchId !== null &&
    simulation.simulation.branches.length === 1 &&
    simulation.simulation.branches[0].rounds.length === 1 &&
    simulation.simulation.branches[0].rounds[0].sourceInput === '如果摩擦力为零会怎样' &&
    memory.memory.records.length === 0 &&
    envelopeViolations.length === 0 &&
    events.filter((event) => event.event_type === 'session_started').length === 1 &&
    events.filter((event) => event.event_type === 'experience_started').length === 1;
  return { expected, actual, pass };
}

// --- STREAM-LONGTERM-A：执行形态 A 类显式长期记忆写入 ---
async function caseStreamLongtermA(trace) {
  const { runtime, events } = createCaseRuntime();
  const session = await runtime.startSession();
  const result = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-lta-${shortId()}`,
      session_id: session.session.sessionId,
      user_input: '我喜欢古典音乐',
    }),
    runtime,
  });
  const lines = await ndjsonLines(result);
  const submission = lines.find((line) => line.type === 'submission') ?? null;
  const done = lines.find((line) => line.type === 'done') ?? null;
  const memory = runtime.getMemory();
  const record = memory.memory.records[0] ?? null;
  const memoryRecorded = events.filter((event) => event.event_type === 'memory_recorded');
  const expected = {
    routing: 'A 类显式表达（偏好词直接命中——全部优先级层与记忆操作词表未命中后识别）→ resolveIntent action=memory_operation → NDJSON 两行：submission（accepted=true，memory_operation{kind=record_long_term，executed=true，memoryClass=long_term}）+ done——无体验轴动作（零 experience_started）',
    record: '记忆快照记录 ×1：topic="我喜欢古典音乐"，memoryClass=long_term，source=explicit，confidence=1.0，lifecycle=REMEMBERED；memory_recorded ×1（properties：memory_class=long_term / source=explicit / confidence=1 / recognition_path=explicit_preference——A 类识别路径）',
  };
  const actual = {
    status: result.status,
    lineTypes: lines.map((line) => line.type),
    submission: submission
      ? {
          accepted: submission.accepted,
          memory_operation: submission.memory_operation
            ? { kind: submission.memory_operation.kind, executed: submission.memory_operation.executed, memoryClass: submission.memory_operation.memoryClass ?? null }
            : null,
        }
      : null,
    donePresent: done !== null,
    record: record
      ? { topic: record.topic, memoryClass: record.memoryClass, source: record.source, confidence: record.confidence, lifecycle: record.lifecycle }
      : null,
    memoryRecorded: memoryRecorded.map((event) => ({
      memory_class: event.properties.memory_class,
      source: event.properties.source,
      confidence: event.properties.confidence,
      recognition_path: event.properties.recognition_path,
    })),
    experienceStarted: events.filter((event) => event.event_type === 'experience_started').length,
  };
  const pass =
    result.status === 200 &&
    submission !== null &&
    submission.accepted === true &&
    submission.memory_operation?.kind === 'record_long_term' &&
    submission.memory_operation?.executed === true &&
    submission.memory_operation?.memoryClass === 'long_term' &&
    done !== null &&
    lines.length === 2 &&
    record !== null &&
    record.topic === '我喜欢古典音乐' &&
    record.memoryClass === 'long_term' &&
    record.source === 'explicit' &&
    record.confidence === 1 &&
    memoryRecorded.length === 1 &&
    memoryRecorded[0].properties.memory_class === 'long_term' &&
    memoryRecorded[0].properties.recognition_path === 'explicit_preference' &&
    events.filter((event) => event.event_type === 'experience_started').length === 0;
  return { expected, actual, pass };
}

// --- STREAM-LONGTERM-BARE-NEG：裸记住请求升级拒绝（负向） ---
async function caseStreamLongtermBareNeg(trace) {
  const { runtime, events } = createCaseRuntime();
  const session = await runtime.startSession();
  const result = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-ltn-${shortId()}`,
      session_id: session.session.sessionId,
      user_input: '记住这个',
    }),
    runtime,
  });
  const error = await errorBody(result);
  const memory = runtime.getMemory();
  const memoryRecorded = events.filter((event) => event.event_type === 'memory_recorded');
  const expected = {
    negative: '裸记住请求"记住这个"（无偏好内容——黄金 G08-NEG 对抗语料）→ 400 INVALID_ACTION（UNKNOWN 升级——未知情况升级而非由系统决定）；零记忆写入（快照 records=0，零 memory_recorded 事件）',
  };
  const actual = {
    status: result.status,
    error: error.error ?? null,
    reason: error.reason ?? null,
    recordCount: memory.memory.records.length,
    memoryRecorded: memoryRecorded.length,
  };
  const pass =
    result.status === 400 &&
    error.error === 'INVALID_ACTION' &&
    memory.memory.records.length === 0 &&
    memoryRecorded.length === 0;
  return { expected, actual, pass };
}

// --- STREAM-S1-FORM：S1 fixture 形态向后兼容（行为不变） ---
async function caseStreamS1Form(trace) {
  const { runtime, events } = createCaseRuntime();
  const result = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({ semanticAction: 'WHY' }),
    runtime,
  });
  const lines = await ndjsonLines(result);
  const chunks = lines.filter((line) => line.type === 'chunk');
  const done = lines.find((line) => line.type === 'done') ?? null;
  const expected = {
    compatibility: 'S1 fixture 形态（{ semanticAction }——三要素不齐备）→ 既有路径不变：策略 WHY → EXPLAIN，合成语料流式输出（chunk ×9 内容逐字节等于 why 语料）+ done——API 面扩展不改变既有形态行为（D-3 选项 A 纯暴露层）',
  };
  const actual = {
    status: result.status,
    chunkCount: chunks.length,
    contentMatchesFixture: chunks.map((chunk) => chunk.content).join('') === why.chunks.join(''),
    donePresent: done !== null,
    policyAction: chunks[0]?.policyAction ?? null,
    semanticAction: chunks[0]?.semanticAction ?? null,
  };
  const pass =
    result.status === 200 &&
    chunks.length === 9 &&
    actual.contentMatchesFixture === true &&
    done !== null &&
    actual.policyAction === 'EXPLAIN' &&
    actual.semanticAction === 'WHY';
  return { expected, actual, pass };
}

// --- CROSS-SESSION-ADOPT：跨会话分支操作（执行形态既有体验提交） ---
async function caseCrossSessionAdopt(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  // 会话 A：WHAT_IF 轮（建立持久分支）→ STOP（会话结束）。
  const sessionA = await runtime.startSession();
  const whatIf = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-csa-1-${shortId()}`,
      session_id: sessionA.session.sessionId,
      user_input: '如果摩擦力为零会怎样',
    }),
    runtime,
  });
  const whatIfLines = await ndjsonLines(whatIf);
  const whatIfSubmission = whatIfLines.find((line) => line.type === 'submission') ?? null;
  if (!whatIfSubmission) {
    return { expected: { setup: 'WHAT_IF 执行形态提交应被接受' }, actual: { setupError: whatIf.status }, pass: false };
  }
  const experienceId = whatIfSubmission.experience_id;
  const stateAfterWhatIf = runtime.getExperienceState(experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId,
    sessionId: sessionA.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterWhatIf.state.stateVersion,
    requestId: `req-s3api-csa-stop-${shortId()}`,
  });
  if (!stop.ok) {
    return { expected: { setup: 'STOP 提交应被接受' }, actual: { setupError: stop.error.code }, pass: false };
  }
  await consumeStream(stop.stream);
  const stateAfterStop = runtime.getExperienceState(experienceId);
  // 会话 B：新会话 + 自身体验（SESSION_ACTIVE——跨会话操作前提 ②）。
  const sessionB = await runtime.startSession();
  const intentB = await runtime.resolveIntent({
    sessionId: sessionB.session.sessionId,
    rawInput: '为什么',
    requestId: `req-s3api-csa-intent-${shortId()}`,
  });
  const expB = await runtime.startExperience({
    sessionId: sessionB.session.sessionId,
    intentId: intentB.intent.intentId,
    requestId: `req-s3api-csa-exp-${shortId()}`,
  });
  // 跨会话分支操作（执行形态既有体验提交——experience_id +
  // state_version 定位持久体验；三前提经运行时内校验）。
  const adopt = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-csa-2-${shortId()}`,
      session_id: sessionB.session.sessionId,
      user_input: '如果采用分支一的结论呢',
      experience_id: experienceId,
      state_version: stateAfterStop.state.stateVersion,
    }),
    runtime,
  });
  const adoptLines = await ndjsonLines(adopt);
  const adoptSubmission = adoptLines.find((line) => line.type === 'submission') ?? null;
  const simulation = runtime.getSimulation(experienceId);
  const simAdopted = events.filter((event) => event.event_type === 'simulation_adopted');
  const adoptTrace = traces.find((entry) => entry.reason?.secondary?.includes('ADOPT_BRANCH'));
  const expected = {
    setup: '会话 A：执行形态 WHAT_IF（真实运行路径）→ STOP（会话结束——currentBranchId 会话级清空，分支记录持久）；会话 B：新会话 + 自身体验（SESSION_ACTIVE）',
    crossSession: '执行形态既有体验提交（experience_id + state_version 定位持久体验）：会话 B 对已结束会话 A 的体验"如果采用分支一的结论呢"（WHAT_IF + ADOPT_BRANCH 词表识别——S3B §1.4 三前提）→ 200 NDJSON 流（submission：selected_action=SIMULATE，reason=simulation_branch_operation，policy_version=policy_v2.2.0——确定性系统回合，llm_used=false）',
    branchModel: '分支 1：adopted false→true（附加标记——生命周期 ACTIVE 不变）；currentBranchId 保持 null（跨会话采用不恢复主线指针——会话级不变式）；simulation_adopted ×1（adopted_content=分支最新模拟轮模拟内容，separation_invariant=simulation_result_is_not_fact）',
  };
  const actual = {
    stopOk: stop.ok,
    stateAfterStop: stateAfterStop.state.status,
    sessionAState: runtime.getSession(sessionA.session.sessionId)?.state ?? null,
    sessionBState: runtime.getSession(sessionB.session.sessionId)?.state ?? null,
    adoptStatus: adopt.status,
    adoptSubmission: adoptSubmission
      ? {
          accepted: adoptSubmission.accepted,
          experience_id: adoptSubmission.experience_id,
          session_id: adoptSubmission.session_id,
          selected_action: adoptSubmission.policy_decision?.selected_action ?? null,
          reason: adoptSubmission.policy_decision?.reason ?? null,
          policy_version: adoptSubmission.policy_decision?.policy_version ?? null,
        }
      : null,
    simulation: simulation.ok
      ? {
          currentBranchId: simulation.simulation.currentBranchId,
          branchAdopted: simulation.simulation.branches[0]?.adopted ?? null,
          branchLifecycle: simulation.simulation.branches[0]?.lifecycle ?? null,
          branchRounds: simulation.simulation.branches[0]?.rounds.length ?? 0,
        }
      : { error: simulation.error?.code ?? 'unknown' },
    simulationAdoptedEvents: simAdopted.map((event) => ({
      branch_id: event.properties.branch_id,
      source_round: event.properties.source_round,
      separation_invariant: event.properties.separation_invariant,
    })),
    decisionTraceReason: adoptTrace?.reason?.primary ?? null,
    decisionTraceLlmUsed: adoptTrace?.execution?.llm_used ?? null,
    finalStatus: runtime.getExperienceState(experienceId).state.status,
  };
  const pass =
    stop.ok === true &&
    stateAfterStop.state.status === 'COMPLETED' &&
    runtime.getSession(sessionA.session.sessionId)?.state === 'SESSION_ENDED' &&
    runtime.getSession(sessionB.session.sessionId)?.state === 'SESSION_ACTIVE' &&
    adopt.status === 200 &&
    adoptSubmission !== null &&
    adoptSubmission.accepted === true &&
    adoptSubmission.experience_id === experienceId &&
    adoptSubmission.session_id === sessionB.session.sessionId &&
    adoptSubmission.policy_decision?.selected_action === 'SIMULATE' &&
    adoptSubmission.policy_decision?.reason === 'simulation_branch_operation' &&
    adoptSubmission.policy_decision?.policy_version === 'policy_v2.2.0' &&
    simulation.ok === true &&
    simulation.simulation.currentBranchId === null &&
    simulation.simulation.branches[0].adopted === true &&
    simulation.simulation.branches[0].lifecycle === 'ACTIVE' &&
    simulation.simulation.branches[0].rounds.length === 1 &&
    simAdopted.length === 1 &&
    simAdopted[0].properties.source_round === 1 &&
    simAdopted[0].properties.separation_invariant === 'simulation_result_is_not_fact' &&
    adoptTrace?.reason?.primary === 'explicit_user_direction' &&
    adoptTrace?.execution?.llm_used === false &&
    runtime.getExperienceState(experienceId).state.status === 'COMPLETED';
  return { expected, actual, pass };
}

// --- CROSS-SESSION-CONTENT-NEG：跨会话内容轮拒绝（放宽仅限分支操作路径） ---
async function caseCrossSessionContentNeg(trace) {
  const { runtime, events } = createCaseRuntime();
  // 会话 A：WHAT_IF 轮 → STOP（会话结束）。
  const sessionA = await runtime.startSession();
  const whatIf = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-csn-1-${shortId()}`,
      session_id: sessionA.session.sessionId,
      user_input: '如果摩擦力为零会怎样',
    }),
    runtime,
  });
  const whatIfLines = await ndjsonLines(whatIf);
  const whatIfSubmission = whatIfLines.find((line) => line.type === 'submission') ?? null;
  if (!whatIfSubmission) {
    return { expected: { setup: 'WHAT_IF 执行形态提交应被接受' }, actual: { setupError: whatIf.status }, pass: false };
  }
  const experienceId = whatIfSubmission.experience_id;
  const stateAfterWhatIf = runtime.getExperienceState(experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId,
    sessionId: sessionA.session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateAfterWhatIf.state.stateVersion,
    requestId: `req-s3api-csn-stop-${shortId()}`,
  });
  if (!stop.ok) {
    return { expected: { setup: 'STOP 提交应被接受' }, actual: { setupError: stop.error.code }, pass: false };
  }
  await consumeStream(stop.stream);
  const stateAfterStop = runtime.getExperienceState(experienceId);
  // 会话 B：SESSION_ACTIVE（跨会话提交前提 ①——输入会话
  // 须经自身体验激活；会话状态校验先于跨会话判定）。
  const chainB = await setupChain(runtime, 's3api-csn-b', '为什么');
  // 跨会话内容轮（WHY——非分支操作）→ 拒绝（INVALID_REQUEST
  // experience/session mismatch——放宽仅限分支操作路径）。
  const crossContent = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-csn-2-${shortId()}`,
      session_id: chainB.session.sessionId,
      user_input: '为什么采用分支一',
      experience_id: experienceId,
      state_version: stateAfterStop.state.stateVersion,
    }),
    runtime,
  });
  const error = await errorBody(crossContent);
  const expected = {
    precondition: '会话 B 经自身体验 SESSION_ACTIVE（输入会话状态校验先于跨会话判定——会话状态机纪律）',
    negative: '跨会话内容轮（WHY——非分支操作）经执行形态既有体验提交 → 错误响应（INVALID_REQUEST experience/session mismatch——S3B §1.4：放宽范围仅限分支操作路径，内容轮保持严格会话绑定）；体验状态版本不变（拒绝不提交——失败写入不消耗版本号）',
  };
  const actual = {
    sessionBState: runtime.getSession(chainB.session.sessionId)?.state ?? null,
    status: crossContent.status,
    code: error.code ?? null,
    message: error.message ?? null,
    retryable: error.retryable ?? null,
    versionUnchanged: runtime.getExperienceState(experienceId).state.stateVersion === stateAfterStop.state.stateVersion,
  };
  const pass =
    runtime.getSession(chainB.session.sessionId)?.state === 'SESSION_ACTIVE' &&
    crossContent.status === 400 &&
    error.code === 'INVALID_REQUEST' &&
    error.message === 'experience/session mismatch' &&
    actual.versionUnchanged === true;
  return { expected, actual, pass };
}

// --- VERSION-CONFLICT：执行形态陈旧版本拒绝（S1-12 纪律） ---
async function caseVersionConflict(trace) {
  const { runtime, events } = createCaseRuntime();
  const session = await runtime.startSession();
  const whatIf = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-vc-1-${shortId()}`,
      session_id: session.session.sessionId,
      user_input: '如果摩擦力为零会怎样',
    }),
    runtime,
  });
  const whatIfLines = await ndjsonLines(whatIf);
  const whatIfSubmission = whatIfLines.find((line) => line.type === 'submission') ?? null;
  if (!whatIfSubmission) {
    return { expected: { setup: 'WHAT_IF 执行形态提交应被接受' }, actual: { setupError: whatIf.status }, pass: false };
  }
  const experienceId = whatIfSubmission.experience_id;
  // 陈旧版本（v2——体验启动版本）第二轮 WHAT_IF → 冲突拒绝。
  const stale = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-vc-2-${shortId()}`,
      session_id: session.session.sessionId,
      user_input: '假如速度再高一点会怎样',
      experience_id: experienceId,
      state_version: 2,
    }),
    runtime,
  });
  const error = await errorBody(stale);
  const conflictEvents = events.filter((event) => event.event_type === 'state_version_conflict');
  const stateAfterStale = runtime.getExperienceState(experienceId);
  // 恢复：携带当前版本重试成功。
  const retry = await runStream(runtime, {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s3api-vc-3-${shortId()}`,
      session_id: session.session.sessionId,
      user_input: '假如速度再高一点会怎样',
      experience_id: experienceId,
      state_version: stateAfterStale.state.stateVersion,
    }),
    runtime,
  });
  const retryLines = await ndjsonLines(retry);
  const retrySubmission = retryLines.find((line) => line.type === 'submission') ?? null;
  const expected = {
    failure: '执行形态既有体验提交携带陈旧 state_version（2 vs 当前 4）→ 错误响应（STATE_VERSION_CONFLICT，retryable=false——不覆盖、不消耗版本，S1-12 同族）；state_version_conflict ×1（expected_state_version / current_state_version 留痕）',
    recovery: '携带当前版本重试成功（submission accepted=true，state_version=5——合法提交恰好 +1）',
  };
  const actual = {
    staleStatus: stale.status,
    staleCode: error.code ?? null,
    staleMessage: error.message ?? null,
    staleRetryable: error.retryable ?? null,
    staleDetails: error.details ?? null,
    conflictEvents: conflictEvents.length,
    conflictExpectedVersion: conflictEvents[0]?.properties.expected_state_version ?? null,
    conflictCurrentVersion: conflictEvents[0]?.properties.current_state_version ?? null,
    stateVersionAfterStale: stateAfterStale.state.stateVersion,
    retryStatus: retry.status,
    retryAccepted: retrySubmission?.accepted ?? null,
    retryStateVersion: retrySubmission?.state_version ?? null,
  };
  const pass =
    stale.status === 409 &&
    error.code === 'STATE_VERSION_CONFLICT' &&
    error.retryable === false &&
    error.details?.expected_state_version === 2 &&
    error.details?.current_state_version === 4 &&
    conflictEvents.length === 1 &&
    conflictEvents[0].properties.expected_state_version === 2 &&
    conflictEvents[0].properties.current_state_version === 4 &&
    stateAfterStale.state.stateVersion === 4 &&
    retry.status === 200 &&
    retrySubmission?.accepted === true &&
    retrySubmission?.state_version === 5;
  return { expected, actual, pass };
}

// --- OBSERVABILITY：只读观测路由底层快照（记忆域 / 模拟域） ---
async function caseObservability(trace) {
  const { runtime, events } = createCaseRuntime();
  // 会话 A：WHY → STOP（短期记忆登记）→ WHAT_IF 体验分支 → STOP。
  const chainA = await setupChain(runtime, 's3api-obs-a', '为什么');
  const whyRound = await submitRound(runtime, chainA, 'WHY', '量子计算为什么这么难？', `req-s3api-obs-why-${shortId()}`);
  const stopA = await submitRound(runtime, chainA, 'STOP', '好了', `req-s3api-obs-stop-${shortId()}`);
  const chainB = await setupChain(runtime, 's3api-obs-b', '如果摩擦力为零会怎样');
  const whatIfRound = await submitRound(runtime, chainB, 'WHAT_IF', '如果摩擦力为零会怎样', `req-s3api-obs-whatif-${shortId()}`);
  const stopB = await submitRound(runtime, chainB, 'STOP', '好了', `req-s3api-obs-stop2-${shortId()}`);
  // 只读快照（GET /api/memory 与 GET /api/experience/{id}/simulation
  // 路由的底层运行时方法——Query 与 Command 分离纪律）。
  const memory = runtime.getMemory();
  const simulation = runtime.getSimulation(chainB.exp.experienceId);
  const eventsBefore = events.length;
  const memoryAgain = runtime.getMemory();
  const simulationAgain = runtime.getSimulation(chainB.exp.experienceId);
  const eventsAfter = events.length;
  const expected = {
    memory: 'GET /api/memory 底层快照：记录 ×2（两条链各经 STOP 完成路径登记短期记忆——topic="为什么" / topic="如果摩擦力为零会怎样"，memoryClass=short_term，source=session_observation，confidence=0.7，lifecycle=REMEMBERED）',
    simulation: 'GET /api/experience/{id}/simulation 底层快照：currentBranchId===null（STOP 会话级清空），分支记录 ×1（rounds ×1，sourceInput=用户输入——持久化范围 = 分支记录全部分量）',
    readOnly: '连续查询零事件登记（events 长度不变——查询不改变任何状态——Query 与 Command 分离）',
  };
  const actual = {
    whyOk: whyRound.submission.ok,
    stopAOk: stopA.submission.ok,
    whatIfOk: whatIfRound.submission.ok,
    stopBOk: stopB.submission.ok,
    memory: memory.memory.records.map((record) => ({
      topic: record.topic,
      memoryClass: record.memoryClass,
      source: record.source,
      confidence: record.confidence,
      lifecycle: record.lifecycle,
    })),
    simulation: simulation.ok
      ? {
          currentBranchId: simulation.simulation.currentBranchId,
          branches: simulation.simulation.branches.length,
          rounds: simulation.simulation.branches[0]?.rounds.length ?? 0,
          sourceInput: simulation.simulation.branches[0]?.rounds[0]?.sourceInput ?? null,
        }
      : { error: simulation.error?.code ?? 'unknown' },
    queriesEqual: jsonEquals(memory.memory.records, memoryAgain.memory.records) &&
      jsonEquals(simulation.ok ? simulation.simulation : null, simulationAgain.ok ? simulationAgain.simulation : null),
    eventsDelta: eventsAfter - eventsBefore,
  };
  const pass =
    whyRound.submission.ok &&
    stopA.submission.ok &&
    whatIfRound.submission.ok &&
    stopB.submission.ok &&
    memory.memory.records.length === 2 &&
    memory.memory.records[0].topic === '为什么' &&
    memory.memory.records[0].memoryClass === 'short_term' &&
    memory.memory.records[0].source === 'session_observation' &&
    memory.memory.records[0].confidence === 0.7 &&
    memory.memory.records[0].lifecycle === 'REMEMBERED' &&
    memory.memory.records[1].topic === '如果摩擦力为零会怎样' &&
    memory.memory.records[1].memoryClass === 'short_term' &&
    memory.memory.records[1].source === 'session_observation' &&
    memory.memory.records[1].confidence === 0.7 &&
    memory.memory.records[1].lifecycle === 'REMEMBERED' &&
    simulation.ok === true &&
    simulation.simulation.currentBranchId === null &&
    simulation.simulation.branches.length === 1 &&
    simulation.simulation.branches[0].rounds.length === 1 &&
    simulation.simulation.branches[0].rounds[0].sourceInput === '如果摩擦力为零会怎样' &&
    actual.queriesEqual === true &&
    actual.eventsDelta === 0;
  return { expected, actual, pass };
}

/** 流事件消费（提交结果流）。 */
async function consumeStream(stream) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

/** 标准链路：Session → 意图解析 → 体验启动。 */
async function setupChain(runtime, label, rawInput = '为什么') {
  const { session } = await runtime.startSession();
  const intent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput,
    requestId: `req-s3api-${label}-intent-${shortId()}`,
  });
  if (!intent.ok) {
    throw new Error(`setupChain: resolveIntent failed: ${intent.error.code}`);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: `req-s3api-${label}-exp-${shortId()}`,
  });
  if (!exp.ok) {
    throw new Error(`setupChain: startExperience failed: ${exp.error.code}`);
  }
  return { session, intent: intent.intent, exp: exp.experience ?? exp };
}

/** 声明语义动作的体验事件提交。 */
async function submitRound(runtime, chain, semanticAction, rawInput, requestId) {
  const state = runtime.getExperienceState(chain.exp.experienceId).state;
  const submission = await runtime.submitExperienceEvent({
    experienceId: chain.exp.experienceId,
    sessionId: chain.session.sessionId,
    semanticAction,
    rawInput,
    expectedStateVersion: state.stateVersion,
    requestId,
  });
  if (submission.ok) {
    await consumeStream(submission.stream);
  }
  return { submission, stateVersion: state.stateVersion };
}

// ---------------------------------------------------------------------------
// 案例注册表（E5 §4 案例记录 12 字段来源）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'STREAM-EXECUTION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3B-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 4（D-3 选项 A——纯暴露层）；S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划；S1 §14（WHAT_IF → SIMULATE 映射不变）；S2A-F4-SEMANTIC-FREEZE-01 §2 D-03 选项 A（WHAT_IF 首轮自动 CREATE 分支）',
    scope: '执行形态 WHAT_IF 全链路：三要素请求 → resolveIntent → startExperience → submitExperienceEvent（真实运行路径）→ NDJSON 流（submission 首行 policy_v2.2.0 + chunk ×17 逐字节等于 simulate 语料 + done + state_updated）；模拟域首轮分支自动 CREATE（快照可查）',
    precondition: '新会话（SESSION_IDLE）；案例独立运行时经 StreamRequestInput.runtime 注入',
    inputFault: '洁净 WHAT_IF 输入（执行形态三要素齐备）',
    run: caseStreamExecution,
  },
  {
    caseId: 'STREAM-LONGTERM-A',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.1（A 类门槛）/ §1.6（单一写入者）/ §1.8（事件属性扩展）；07 §5（A 类：明确表达的长期偏好）；policy_v2.2.0 变更 1',
    scope: '执行形态 A 类显式长期记忆写入：resolveIntent action=memory_operation → NDJSON 两行（submission 含 memory_operation{kind=record_long_term，executed=true，memoryClass=long_term} + done）；记录 source=explicit，confidence=1.0；零 experience_started（记忆操作不创建体验轴）',
    precondition: '新会话（SESSION_IDLE）',
    inputFault: '"我喜欢古典音乐"（A 类显式表达——洁净输入）',
    run: caseStreamLongtermA,
  },
  {
    caseId: 'STREAM-LONGTERM-BARE-NEG',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3A-SEMANTIC-FREEZE-01 v1.0.0 §1.2（裸记住请求不识别为记忆写入）；黄金 G08-NEG 不变式；授权 §5.7（未知情况升级而非由系统决定）',
    scope: '执行形态裸记住请求负向："记住这个" → 400 INVALID_ACTION（UNKNOWN 升级）；零记忆写入（快照 records=0，零 memory_recorded 事件）',
    precondition: '新会话（SESSION_IDLE）',
    inputFault: '"记住这个"（G08-NEG 对抗语料）',
    run: caseStreamLongtermBareNeg,
  },
  {
    caseId: 'STREAM-S1-FORM',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3B-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 4（纯暴露层——既有形态行为不变）；S1 §14（WHY → EXPLAIN 映射）；C5 API 契约（向后兼容）',
    scope: 'S1 fixture 形态向后兼容：{ semanticAction }（三要素不齐备）→ 既有路径不变（WHY → EXPLAIN，chunk ×9 逐字节等于 why 语料 + done）——API 面扩展不改变既有形态行为',
    precondition: '无会话上下文（S1 形态不要求会话）',
    inputFault: '无（正向路径——S1 形态声明语义动作）',
    run: caseStreamS1Form,
  },
  {
    caseId: 'CROSS-SESSION-ADOPT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.4（跨会话操作路径三前提）/ §1.1（持久化范围）；S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A（ADOPT_BRANCH 显式回流）；policy_v2.2.0 变更 3',
    scope: '跨会话分支操作（执行形态既有体验提交）：会话 A 执行形态 WHAT_IF → STOP（会话结束）→ 会话 B（SESSION_ACTIVE）经 experience_id + state_version 定位持久体验，"如果采用分支一的结论呢" → 200 NDJSON 流（selected_action=SIMULATE，reason=simulation_branch_operation——确定性系统回合 llm_used=false）；分支 adopted=true，currentBranchId 保持 null（会话级不变式）；simulation_adopted ×1',
    precondition: '会话 A 持久分支记录存在（已 STOP）；会话 B SESSION_ACTIVE（经自身体验建立）',
    inputFault: '洁净 WHAT_IF 分支操作词输入（跨会话三前提齐备）',
    run: caseCrossSessionAdopt,
  },
  {
    caseId: 'CROSS-SESSION-CONTENT-NEG',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.4（放宽范围仅限分支操作路径——内容轮保持严格会话绑定）；OBL-01（失败写入不消耗版本号）',
    scope: '跨会话内容轮负向：WHY 内容输入经执行形态既有体验提交 → 400 INVALID_REQUEST（experience/session mismatch）；体验状态版本不变（拒绝不提交）',
    precondition: '会话 A 已结束（持久分支记录存在）；会话 B SESSION_ACTIVE',
    inputFault: '跨会话 WHY 内容轮输入（非分支操作——负向）',
    run: caseCrossSessionContentNeg,
  },
  {
    caseId: 'VERSION-CONFLICT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3B-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 4（执行形态既有体验提交）；S1-12（版本冲突不消耗版本）；OBL-01（失败写入纪律）；G10-FR 故障恢复纪律',
    scope: '执行形态陈旧 state_version 提交 → 错误响应（STATE_VERSION_CONFLICT，retryable=false——不覆盖、不消耗版本）；state_version_conflict ×1 留痕；携带当前版本重试成功（合法提交恰好 +1）',
    precondition: '执行形态 WHAT_IF 首轮已提交（体验存在）',
    inputFault: '陈旧 state_version（2 vs 当前 4）→ 冲突 → 当前版本重试',
    run: caseVersionConflict,
  },
  {
    caseId: 'OBSERVABILITY',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S3B-SEMANTIC-FREEZE-01 v1.0.0 §1.1/§1.2（只读快照——currentBranchId 会话级不变式）；API 契约 §2.3（Query 与 Command 分离——只读路由不改变任何状态）；07 §22（检索不改变体验）',
    scope: '只读观测路由底层快照：GET /api/memory 底层（短期记忆记录——STOP 完成路径登记，字段齐备）/ GET /api/experience/{id}/simulation 底层（currentBranchId===null，分支记录持久——sourceInput 可查）；连续查询零事件登记（只读纪律）',
    precondition: 'WHY → STOP 链 + WHAT_IF → STOP 链（记忆与分支记录均存在）',
    inputFault: '无输入（只读查询）',
    run: caseObservability,
  },
];

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  // Engine gate: exact Node lock.
  if (process.version !== NODE_LOCK) {
    fatal(`engine gate: expected Node ${NODE_LOCK}, found ${process.version}`);
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

  // Integrity verification (同既有执行器纪律).
  const referenceCheck = await verifyReferenceIntegrity(repoRoot);
  log(`reference archive integrity: ${referenceCheck.verified}/${referenceCheck.total} verified, ${referenceCheck.failed.length} failed`);
  if (referenceCheck.failed.length > 0) {
    fatal(`reference archive hash verification failed: ${JSON.stringify(referenceCheck.failed)}`);
  }
  const fingerprintCheck = await verifyContractFingerprints(repoRoot);
  log(`contract fingerprints: allMatch=${fingerprintCheck.allMatch}`);
  if (!fingerprintCheck.allMatch) fatal('contract fingerprint verification failed');
  const git = await gitState(repoRoot);
  log(`git state: HEAD=${git.commit} (workTreeClean=${git.workTreeClean})`);

  // Prepare run directories (previous attempt archived, never overwritten — ADR-0002 §5).
  if (existsSync(runDir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = `${runDir}-attempt-${stamp}`;
    await rename(runDir, archiveDir);
    log(`archived previous attempt at ${path.basename(archiveDir)} (preserved, not overwritten)`);
  }
  for (const dir of [casesDir, tracesDir, logsDir, reviewDir]) {
    await mkdir(dir, { recursive: true });
  }

  // Execute cases sequentially (in-process form — no HTTP servers:
  // the executor calls the Route Handler's target function directly
  // with a case-isolated runtime injected, per http.ts form discipline).
  const caseResults = [];
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
        ? '无（本案例）；G5 评测包 NOT RUN；E3 公开发布统计阈值待产品负责人批准'
        : '本案例未通过——按 ADR-0002 §5 如实登记，不得重跑至通过为止；缺陷须在下一迭代处置',
    };
    const validation = validateCaseRecord(caseRecord);
    if (!validation.valid) {
      log(`case ${definition.caseId}: record INVALID ${JSON.stringify(validation)}`);
    }
    await writeCaseRecord(casesDir, caseRecord);
    await caseTrace.complete({ result: caseRecord.result, pass: outcome.pass });
    caseResults.push({ caseId: definition.caseId, result: caseRecord.result, pass: outcome.pass });
    log(`case ${definition.caseId}: ${caseRecord.result}`);
  }

  // Assertions.
  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  const allCasesPass = caseResults.every((entry) => entry.pass);

  // A1: STREAM-EXECUTION.
  const cExecution = caseResults.find((entry) => entry.caseId === 'STREAM-EXECUTION');
  assert(
    'A1',
    'STREAM-EXECUTION：执行形态 WHAT_IF 全链路——三要素请求 → 真实运行路径（resolveIntent → startExperience → submitExperienceEvent）→ NDJSON 流（submission 首行 accepted=true / policy_v2.2.0 / WHAT_IF→SIMULATE / state_version=3 ACTIVE/SIMULATION；chunk ×17 逐字节等于 simulate 语料；done；state_updated v4 WAITING/SIMULATION waiting_for_user=true）；模拟域首轮分支自动 CREATE（currentBranchId=分支 1，rounds ×1，sourceInput=用户输入）；信封零违规；session_started ×1 / experience_started ×1',
    cExecution?.pass === true,
    { streamExecution: cExecution?.pass },
  );

  // A2: STREAM-LONGTERM-A.
  const cLongtermA = caseResults.find((entry) => entry.caseId === 'STREAM-LONGTERM-A');
  assert(
    'A2',
    'STREAM-LONGTERM-A：执行形态 A 类显式长期记忆写入——"我喜欢古典音乐" → resolveIntent action=memory_operation → NDJSON 两行（submission 含 memory_operation{kind=record_long_term，executed=true，memoryClass=long_term} + done）；记录 topic="我喜欢古典音乐" / memoryClass=long_term / source=explicit / confidence=1.0 / lifecycle=REMEMBERED；memory_recorded ×1（properties：memory_class=long_term / source=explicit / confidence=1 / recognition_path=explicit_preference）；零 experience_started（记忆操作不创建体验轴）',
    cLongtermA?.pass === true,
    { streamLongtermA: cLongtermA?.pass },
  );

  // A3: STREAM-LONGTERM-BARE-NEG.
  const cLongtermBare = caseResults.find((entry) => entry.caseId === 'STREAM-LONGTERM-BARE-NEG');
  assert(
    'A3',
    'STREAM-LONGTERM-BARE-NEG：执行形态裸记住请求负向——"记住这个"（G08-NEG 对抗语料）→ 400 INVALID_ACTION（UNKNOWN 升级——未知情况升级而非由系统决定）；零记忆写入（快照 records=0，零 memory_recorded 事件）',
    cLongtermBare?.pass === true,
    { streamLongtermBareNeg: cLongtermBare?.pass },
  );

  // A4: STREAM-S1-FORM.
  const cS1Form = caseResults.find((entry) => entry.caseId === 'STREAM-S1-FORM');
  assert(
    'A4',
    'STREAM-S1-FORM：S1 fixture 形态向后兼容——{ semanticAction }（三要素不齐备）→ 既有路径不变（WHY → EXPLAIN，chunk ×9 逐字节等于 why 语料 + done）——API 面扩展不改变既有形态行为（D-3 选项 A 纯暴露层）',
    cS1Form?.pass === true,
    { streamS1Form: cS1Form?.pass },
  );

  // A5: CROSS-SESSION-ADOPT.
  const cCrossAdopt = caseResults.find((entry) => entry.caseId === 'CROSS-SESSION-ADOPT');
  assert(
    'A5',
    'CROSS-SESSION-ADOPT：跨会话分支操作（执行形态既有体验提交）——会话 A 执行形态 WHAT_IF → STOP（COMPLETED——会话结束）；会话 B（SESSION_ACTIVE）经 experience_id + state_version 定位持久体验，"如果采用分支一的结论呢" → 200 NDJSON 流（accepted=true，experience_id / session_id 归属正确，selected_action=SIMULATE，reason=simulation_branch_operation，policy_v2.2.0——确定性系统回合 llm_used=false）；分支 adopted=true / lifecycle=ACTIVE / rounds ×1；currentBranchId 保持 null（跨会话采用不恢复主线指针——会话级不变式）；simulation_adopted ×1（source_round=1，separation_invariant=simulation_result_is_not_fact）；体验轴保持 COMPLETED',
    cCrossAdopt?.pass === true,
    { crossSessionAdopt: cCrossAdopt?.pass },
  );

  // A6: CROSS-SESSION-CONTENT-NEG.
  const cCrossContent = caseResults.find((entry) => entry.caseId === 'CROSS-SESSION-CONTENT-NEG');
  assert(
    'A6',
    'CROSS-SESSION-CONTENT-NEG：跨会话内容轮负向——WHY 内容输入经执行形态既有体验提交 → 400 INVALID_REQUEST（experience/session mismatch——S3B §1.4：放宽范围仅限分支操作路径，内容轮保持严格会话绑定）；体验状态版本不变（拒绝不提交——失败写入不消耗版本号）',
    cCrossContent?.pass === true,
    { crossSessionContentNeg: cCrossContent?.pass },
  );

  // A7: VERSION-CONFLICT.
  const cVersionConflict = caseResults.find((entry) => entry.caseId === 'VERSION-CONFLICT');
  assert(
    'A7',
    'VERSION-CONFLICT：执行形态陈旧 state_version 提交 → 错误响应（STATE_VERSION_CONFLICT，retryable=false——不覆盖、不消耗版本，S1-12 同族）；state_version_conflict ×1（expected_state_version=2 / current_state_version=4 留痕）；冲突后版本不变（v4）；携带当前版本重试成功（accepted=true，state_version=5——合法提交恰好 +1）',
    cVersionConflict?.pass === true,
    { versionConflict: cVersionConflict?.pass },
  );

  // A8: OBSERVABILITY.
  const cObservability = caseResults.find((entry) => entry.caseId === 'OBSERVABILITY');
  assert(
    'A8',
    'OBSERVABILITY：只读观测路由底层快照——GET /api/memory 底层：记录 ×2（两条链各经 STOP 完成路径登记——topic="为什么" / "如果摩擦力为零会怎样"，memoryClass=short_term，source=session_observation，confidence=0.7，lifecycle=REMEMBERED）；GET /api/experience/{id}/simulation 底层：currentBranchId===null（STOP 会话级清空），分支记录 ×1（rounds ×1，sourceInput=用户输入——持久化范围 = 分支记录全部分量）；连续查询快照逐字节一致且零事件登记（Query 与 Command 分离——只读不改变任何状态）',
    cObservability?.pass === true,
    { observability: cObservability?.pass },
  );

  // A9: case record completeness (E5 §4 12 fields).
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  const recordCheck =
    recordFiles.length === CASE_REGISTRY.length &&
    (await Promise.all(
      recordFiles.map(async (name) => {
        const record = JSON.parse(await readFile(path.join(casesDir, name), 'utf8'));
        return validateCaseRecord(record).valid;
      }),
    )).every((valid) => valid);
  assert(
    'A9',
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4；${CASE_REGISTRY.length} 执行；无 DEFERRED 登记）`,
    recordCheck,
    { recordFiles: recordFiles.length, expected: CASE_REGISTRY.length, allCasesPass },
  );

  // A10: trace files complete and non-empty.
  const traceFiles = (await readdir(tracesDir)).filter((name) => name.endsWith('.jsonl'));
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (await Promise.all(
      traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
    )).every((nonEmpty) => nonEmpty);
  assert(
    'A10',
    `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`,
    traceCheck,
    { traceFiles: traceFiles.length },
  );

  // A11-PREFLIGHT: preflight / integrity (informational; failures are FATAL above).
  assert(
    'A11-PREFLIGHT',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // ---------------------------------------------------------------------------
  // E5 §3 version matrix (run-metadata.json) — S3b exposure form.
  // ---------------------------------------------------------------------------
  const productPackage = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(await readFile(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const nextVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'next', 'package.json'), 'utf8')).version;
  const reactVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'react', 'package.json'), 'utf8')).version;
  const typescriptVersion = JSON.parse(await readFile(path.join(repoRoot, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;
  const sourceFiles = [
    'src/experience/http.ts',
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'app/api/experience/stream/route.ts',
    'app/api/memory/route.ts',
    'app/api/experience/[experienceId]/simulation/route.ts',
  ];
  const sourceFileHashes = {};
  for (const rel of sourceFiles) {
    sourceFileHashes[rel] = sha256OfBuffer(await readFile(path.join(repoRoot, rel)));
  }
  const httpSource = await readFile(path.join(repoRoot, 'src', 'experience', 'http.ts'), 'utf8');
  const staticFindings = {
    executionFormDetection: /request_id/.test(httpSource) && /session_id/.test(httpSource) && /user_input/.test(httpSource),
    runtimeInjection: /runtime\?: ExperienceRuntime/.test(httpSource),
    s1FormPreserved: /semanticAction/.test(httpSource),
    serverRuntimeSingleton: /getServerRuntime/.test(httpSource),
  };

  const versionMatrix = {
    runId: RUN_ID,
    obligation: 'S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划——D-3 选项 A：既有端点 semanticAction 枚举扩展（纯暴露层——同一 ExperienceRuntime 单例，不改变任何运行时语义）；S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施',
    authorization: { id: 'CR-28', version: 'S3-SCOPE-PROPOSAL-01 v1.0.0 RULED', issued: '2026-10-10', note: '产品负责人确认全项 A（D-1…D-5）——standing authorization 覆盖实施路径；S3b 暴露层依据 D-3 选项 A' },
    obligationTraceability: {
      'S3b 暴露层（D-3 选项 A）': {
        semanticFreeze: 'docs/product/p3-s1/s3b-semantic-freeze.md（S3B-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-10 产品负责人签署——§3 变更 4：既有端点 semanticAction 枚举扩展——纯暴露层）',
        frozenDecisions: {
          'D-3': '选项 A（既有端点 semanticAction 枚举扩展——纯暴露层：同一 ExperienceRuntime 单例 getServerRuntime，不改变任何运行时语义；WHAT_IF 分支操作经用户输入负载携带分支操作词，与进程内识别完全一致）',
        },
        implementationFiles: [
          'src/experience/http.ts（S2/S3 执行形态：三要素请求 → 真实运行路径；S1 fixture 形态向后兼容；StreamRequestInput.runtime 注入缝——进程内证据不经服务器单例）',
          'app/api/experience/stream/route.ts（薄封装——转发至 handleExperienceStreamRequest，形态差异仅在调用入口）',
          'app/api/memory/route.ts（新增——GET /api/memory 只读观测路由）',
          'app/api/experience/[experienceId]/simulation/route.ts（新增——GET /api/experience/{id}/simulation 只读观测路由）',
        ],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
      },
    },
    staticBoundary: {
      note: '静态边界断言读取已提交产品源码字节（不做代码推断——只验证事实）',
      findings: staticFindings,
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
        'POST /api/experience/{id}/stream（S2/S3 执行形态——三要素请求经真实运行路径）',
        'GET /api/memory（新增——只读观测）',
        'GET /api/experience/{id}/simulation（新增——只读观测）',
      ],
      note: '纯暴露层不变式：API 面扩展不改变任何运行时语义、决策追踪、事件契约——同一运行时实例（证据形态经 options.runtime 注入构造的运行时，进程内证据不经服务器单例）',
    },
    environment: {
      node: process.version,
      nodeLock: NODE_LOCK,
      typescript: typescriptVersion,
      react: reactVersion,
      next: nextVersion,
      packageName: productPackage.name,
      packageVersion: productPackage.version,
      lockfileVersion: lockfile.lockfileVersion,
      sqlite: await sqliteVersion(),
    },
    sourceFiles: { count: sourceFiles.length, sha256: sourceFileHashes },
    git: { commit: git.commit, workTreeClean: git.workTreeClean },
    startedAt,
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S3b exposure form)');

  // A12: run-metadata completeness (E5 §3).
  const missingSections = [];
  for (const section of ['runId', 'obligation', 'authorization', 'obligationTraceability', 'staticBoundary', 'api', 'environment', 'sourceFiles', 'git', 'startedAt']) {
    if (versionMatrix[section] === undefined) {
      missingSections.push(section);
    }
  }
  assert(
    'A12',
    'run-metadata 完整（E5 §3 版本矩阵全部字段 + 静态边界发现 + obligationTraceability：S3b 暴露层 → 案例 / 断言映射）',
    missingSections.length === 0 &&
    staticFindings.executionFormDetection === true &&
    staticFindings.runtimeInjection === true &&
    staticFindings.s1FormPreserved === true &&
    staticFindings.serverRuntimeSingleton === true &&
    versionMatrix.sourceFiles.count === sourceFiles.length &&
    versionMatrix.sourceFiles.sha256['src/experience/http.ts'] !== undefined,
    { missingSections, staticFindings },
  );

  // Summary (first pass — SHA256SUMS verification appended in second pass per G3-E-3).
  const allPassedFirst = allCasesPass && assertions.every((entry) => entry.passed);
  const summary = {
    runId: RUN_ID,
    obligation: 'S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划——D-3 选项 A：既有端点 semanticAction 枚举扩展（纯暴露层——同一 ExperienceRuntime 单例，不改变任何运行时语义）；S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施',
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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。S3b 暴露层证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A13', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Final pass: refresh summary with A13 included, then regenerate the
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

运行：${RUN_ID}（S3b 暴露层——既有端点 semanticAction 枚举扩展，纯暴露层：同一 ExperienceRuntime 单例，不改变任何运行时语义）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S3b 暴露层 → 案例 / 断言映射；staticBoundary：静态边界发现）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S3B-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 4 + S3A-SEMANTIC-FREEZE-01 v1.0.0）

- 执行形态 WHAT_IF 全链路（STREAM-EXECUTION）：三要素请求 → 真实运行路径 → NDJSON 流（submission 首行 policy_v2.2.0 + chunk ×17 逐字节等于 simulate 语料 + done + state_updated）；模拟域首轮分支自动 CREATE
- 执行形态 A 类显式长期记忆写入（STREAM-LONGTERM-A）：memory_operation NDJSON 两行；记录 long_term / explicit / confidence=1.0；事件属性扩展 recognition_path=explicit_preference
- 执行形态裸记住请求负向（STREAM-LONGTERM-BARE-NEG）：400 INVALID_ACTION——G08-NEG 不变式经暴露层保持
- S1 fixture 形态向后兼容（STREAM-S1-FORM）：既有形态行为不变（WHY → EXPLAIN，语料逐字节）
- 跨会话分支操作（CROSS-SESSION-ADOPT）：执行形态既有体验提交（experience_id + state_version）→ 200 NDJSON 流；分支 adopted=true；currentBranchId 保持 null（会话级不变式）；simulation_adopted ×1
- 跨会话内容轮负向（CROSS-SESSION-CONTENT-NEG）：400 INVALID_REQUEST experience/session mismatch——放宽仅限分支操作路径
- 版本冲突（VERSION-CONFLICT）：STATE_VERSION_CONFLICT retryable=false——不消耗版本；当前版本重试成功
- 只读观测（OBSERVABILITY）：GET /api/memory 与 GET /api/experience/{id}/simulation 底层快照——字段齐备；连续查询零事件登记

## 形态说明（进程内形态——http.ts 头部纪律）

本运行直接调用 handleExperienceStreamRequest（Route Handler 的薄封装目标函数——app/api/experience/stream/route.ts 仅做转发），经 StreamRequestInput.runtime 注入案例独立运行时。HTTP 形态（Next.js 运行时经 Route Handler 调用）执行路径与决策追踪完全一致——形态差异仅在调用入口。实机 HTTP 形态端到端演示于 2026-10-10 经开发服务器执行并由产品负责人目检（会话 A WHAT_IF → STOP → 会话 B 跨会话 ADOPT_BRANCH → 长期记忆 A/B 类写入 → 观测路由快照——全部通过）。

## 未执行（NOT RUN）

- G5 评测包（独立评测）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s3-api   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's3-api-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
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
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (error) => resolve({ code: -1, stdout: '', stderr: String(error) }));
  });
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's3-api-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
