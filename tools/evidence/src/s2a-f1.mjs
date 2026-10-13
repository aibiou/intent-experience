// S2A-OBL-01-0001 — S2a F-1 迭代动态证据执行器
// （P3-S2-IMPL-AUTH-01 v1.1.0 §2/§6 授权范围：OBL-01——
//   环境门控 LlmGateway 注入缝 + HTTP 形态 LLM 故障 503 补测）
//
// 治理约束（授权 §5 持续约束，ADR-0002 §3/§5）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate（G2/G4）或产品状态为 PASS；
// - 进程内形态经 module.registerHooks 解析无扩展名说明符到真实 .ts 源码
//   （Node ≥23.6 原生类型剥离），使证据执行器运行的是已提交的真实运行时代码；
// - HTTP 形态经真实 Next.js 生产服务器（next start），四个独立实例：
//   S1（端口 4331：注入缝开启 + 故障形态 unavailable）/
//   S2（端口 4332：注入缝开启 + 故障形态 fail_once）/
//   S4（端口 4334：注入缝开启 + 故障形态 succeed_once——成功后故障）/
//   S3（端口 4333：注入缝关闭——默认合成模式，SEAM-INERT 不变式）；
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
const { validateEventEnvelope } = await import('../../../src/experience/events');
const { why } = await import('../../../src/experience/fixtures/why');

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
const RUN_ID = 'S2A-OBL-01-0001';
const NODE_LOCK = 'v24.21.0';

// 三个 HTTP 形态服务器实例（独立端口 / 独立事件汇 / 独立注入缝形态）。
const SERVER_DEFS = [
  { id: 'S1', port: 4331, seam: true, faultMode: 'unavailable', label: 'seam=1 fault=unavailable' },
  { id: 'S2', port: 4332, seam: true, faultMode: 'fail_once', label: 'seam=1 fault=fail_once' },
  { id: 'S4', port: 4334, seam: true, faultMode: 'succeed_once', label: 'seam=1 fault=succeed_once' },
  { id: 'S3', port: 4333, seam: false, faultMode: null, label: 'seam 未设置（默认合成模式）' },
];

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.resolve(here, '..'); // tools/evidence
const repoRoot = path.resolve(evidenceRoot, '..', '..'); // repository root
const runDir = path.join(repoRoot, 'artifacts', 'evidence', 'runs', RUN_ID);
const casesDir = path.join(runDir, 'cases');
const tracesDir = path.join(runDir, 'traces');
const logsDir = path.join(runDir, 'logs');
const reviewDir = path.join(runDir, 'review');

// 每服务器独立事件汇（HTTP 形态 C6 事件流 / 决策追踪 / 审计汇）。
const serverPaths = {};
for (const def of SERVER_DEFS) {
  serverPaths[def.id] = {
    events: path.join(tracesDir, `${def.id.toLowerCase()}-events.jsonl`),
    decisions: path.join(tracesDir, `${def.id.toLowerCase()}-decision-traces.jsonl`),
    audit: path.join(tracesDir, `${def.id.toLowerCase()}-audit.jsonl`),
  };
}

const EVALUATOR_SEPARATION =
  '执行：工程负责人角色（代理，Codex）；独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）。本记录由执行方起草，独立评测人保留审阅与否决权。';

const INVARIANTS = [
  'S1 范围边界：CREATE/SEARCH 禁用；WHAT_IF 仅单次模拟不建立持久/多轮分支；不持久化跨会话 Memory（PD-05/PD-06/PD-07）',
  'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
  '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；陈旧写入返回 STATE_VERSION_CONFLICT 且不得覆盖（S1-12）',
  'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）',
  '旧 operation 不得提交（generation epoch 守卫 + 版本双重检查，S1-10；CC02 H03）',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
  '决策追踪与 LLM/Policy/State 事件分离记录（C6 §22/§23）',
  '工程边界（P2-EVIDENCE-4.0）：重试是工程恢复机制而非产品决策机制（EB-06）；超时不自行决定新方向（EB-07）；完成不属于 LLM 自主权限（EB-13）；分析只能观察（EB-14）',
  '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方；不收集真实用户数据',
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
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
  });
}

function tail(text, maxLines = 12) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-maxLines).join('\n');
}

function shortId() {
  return Math.random().toString(16).slice(2, 10);
}

async function waitForServer(port, timeoutMs = 60_000) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(2000) });
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

// ---------------------------------------------------------------------------
// HTTP 形态客户端（每服务器实例）
// ---------------------------------------------------------------------------
function makeClient(def) {
  const baseUrl = `http://127.0.0.1:${def.port}`;
  return {
    def,
    baseUrl,
    async json(pathname, options = {}) {
      const response = await fetch(`${baseUrl}${pathname}`, {
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
    },
    async postEvent(setup, { requestId, semanticAction = 'WHY', rawInput = '为什么？', stateVersion }) {
      return fetch(`${baseUrl}/api/experience/${setup.experienceId}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          session_id: setup.sessionId,
          state_version: stateVersion ?? setup.stateVersion,
          event: { type: 'user_action', semantic_action: semanticAction, raw_input: rawInput, source: 'text' },
        }),
      });
    },
  };
}

/** HTTP 形态：会话 → 意图 → 体验 启动链。 */
async function httpSetupChain(client, label) {
  const sessionResult = await client.json('/api/session/start', { method: 'POST', body: '{}' });
  const sessionId = sessionResult.payload?.session_id;
  const intentResult = await client.json('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s2a-${label}-intent-${shortId()}`,
      session_id: sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const intentId = intentResult.payload?.intent?.intent_id;
  const expResult = await client.json('/api/experience/start', {
    method: 'POST',
    body: JSON.stringify({
      request_id: `req-s2a-${label}-exp-${shortId()}`,
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

async function inprocSetupChain(runtime, label) {
  const { session } = await runtime.startSession();
  const intent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput: '为什么',
    requestId: `req-s2a-${label}-intent-${shortId()}`,
  });
  if (!intent.ok) {
    throw new Error(`inprocSetupChain: resolveIntent failed: ${intent.error.code}`);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: `req-s2a-${label}-exp-${shortId()}`,
  });
  if (!exp.ok) {
    throw new Error(`inprocSetupChain: startExperience failed: ${exp.error.code}`);
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

function eventsOf(events, type) {
  return events.filter((event) => event.type === type);
}

// ---------------------------------------------------------------------------
// 案例运行器（S2a F-1 / OBL-01：HTTP 形态 503 补测 + 缝惰性 + 进程内回归）
// ---------------------------------------------------------------------------

// --- HTTP-503：HTTP 形态 LLM 故障 → 503 LLM_UNAVAILABLE（S1） --------------
async function caseHttp503(trace, ctx) {
  const client = ctx.clients.S1;
  const setup = await httpSetupChain(client, 'http503');
  const response = await client.postEvent(setup, { requestId: `req-s2a-http503-${shortId()}` });
  const payload = await response.json().catch(() => null);
  const expected = {
    status: 503,
    code: 'LLM_UNAVAILABLE',
    retryable: true,
    body: '结构化错误体 {code, message, retryable}（S1 §28 错误词表 / API 契约错误映射）',
  };
  const actual = {
    experienceId: setup.experienceId,
    stateVersionAtFailure: setup.stateVersion,
    status: response.status,
    code: payload?.code ?? null,
    retryable: payload?.retryable ?? null,
    message: payload?.message ?? null,
    hasStructuredErrorBody:
      typeof payload?.code === 'string' &&
      typeof payload?.message === 'string' &&
      typeof payload?.retryable === 'boolean',
  };
  const pass =
    response.status === 503 &&
    payload?.code === 'LLM_UNAVAILABLE' &&
    payload?.retryable === true &&
    typeof payload?.message === 'string' &&
    payload.message.length > 0;
  return { expected, actual, pass };
}

// --- CALL-ONCE：故障时网关恰好一次调用、无完成事件（S1 事件日志） ---------
async function caseCallOnce(trace, ctx) {
  const client = ctx.clients.S1;
  const logPath = ctx.serverPaths.S1.events;
  const offsetBefore = await httpLogSize(logPath);
  const setup = await httpSetupChain(client, 'callonce');
  const response = await client.postEvent(setup, { requestId: `req-s2a-callonce-${shortId()}` });
  const payload = await response.json().catch(() => null);
  const slice = await httpLogSlice(logPath, offsetBefore);
  const expEvents = slice.events.filter((event) => event.context?.experience_id === setup.experienceId);
  const started = expEvents.filter((event) => event.event_type === 'llm_request_started');
  const completed = expEvents.filter((event) => event.event_type === 'llm_request_completed');
  const generationStarted = expEvents.filter((event) => event.event_type === 'generation_started');
  const expected = {
    gatewayCalls: '恰好 1 次（llm_request_started = 1；无自动重试——EB-06）',
    completion: '零 llm_request_completed（调用失败，完成事件不得发射）',
    precondition: '本次 WHY 提交本身返回 503 LLM_UNAVAILABLE',
  };
  const actual = {
    submissionStatus: response.status,
    submissionCode: payload?.code ?? null,
    llmRequestStarted: started.length,
    llmRequestCompleted: completed.length,
    generationStarted: generationStarted.length,
    startedEventRequestIds: started.map((event) => event.context?.request_id ?? null),
    sliceEventCount: expEvents.length,
  };
  const pass =
    response.status === 503 &&
    payload?.code === 'LLM_UNAVAILABLE' &&
    started.length === 1 &&
    completed.length === 0 &&
    generationStarted.length === 1;
  return { expected, actual, pass };
}

// --- VERSION-INTACT：失败不消耗状态版本（S1） ------------------------------
async function caseVersionIntact(trace, ctx) {
  const client = ctx.clients.S1;
  const setup = await httpSetupChain(client, 'versionintact');
  const stateBefore = await client.json(`/api/experience/${setup.experienceId}/state`);
  const response = await client.postEvent(setup, { requestId: `req-s2a-versionintact-${shortId()}` });
  const stateAfter = await client.json(`/api/experience/${setup.experienceId}/state`);
  const expected = {
    failure: 'WHY 提交返回 503 LLM_UNAVAILABLE',
    stateVersion: `失败后状态版本不变（v${setup.stateVersion} → v${setup.stateVersion}；失败写入不消耗版本号）`,
    state: '失败前后体验状态逐字段一致（status / stage / waiting_for_user 均不变——失败不产生状态写入）',
  };
  const before = stateBefore.payload ?? {};
  const after = stateAfter.payload ?? {};
  const actual = {
    submissionStatus: response.status,
    submissionCode: (await response.json().catch(() => null))?.code ?? null,
    stateVersionBefore: before.state_version ?? null,
    stateVersionAfter: after.state_version ?? null,
    statusBefore: before.state?.status ?? null,
    statusAfter: after.state?.status ?? null,
    stageBefore: before.state?.stage ?? null,
    stageAfter: after.state?.stage ?? null,
    waitingForUserBefore: before.state?.waiting_for_user ?? null,
    waitingForUserAfter: after.state?.waiting_for_user ?? null,
  };
  const pass =
    response.status === 503 &&
    before.state_version === setup.stateVersion &&
    after.state_version === setup.stateVersion &&
    after.state_version === before.state_version &&
    after.state?.status === before.state?.status &&
    after.state?.stage === before.state?.stage &&
    after.state?.waiting_for_user === before.state?.waiting_for_user;
  return { expected, actual, pass };
}

// --- STOP-AFTER-FAILURE：成功后故障，失败后 STOP 合法（S4） ----------------
async function caseStopAfterFailure(trace, ctx) {
  const client = ctx.clients.S4;
  const logPath = ctx.serverPaths.S4.events;
  const offsetBefore = await httpLogSize(logPath);
  const setup = await httpSetupChain(client, 'stopafterfailure');

  // 1. 首次 WHY 成功（succeed_once：首次调用委托合成网关）→ WAITING v4。
  const first = await client.postEvent(setup, { requestId: `req-s2a-stopafterfailure-1-${shortId()}` });
  const firstEvents = first.ok ? await readStreamEvents(first.body) : [];
  const stateAfterFirst = await client.json(`/api/experience/${setup.experienceId}/state`);
  const versionAfterFirst = stateAfterFirst.payload?.state_version;

  // 2. 再次 WHY 失败（succeed_once：后续调用均失败）→ 503，状态保持 WAITING v4。
  const failureOffset = await httpLogSize(logPath);
  const failed = await client.postEvent(
    setup,
    { requestId: `req-s2a-stopafterfailure-2-${shortId()}`, stateVersion: stateAfterFirst.payload?.state_version },
  );
  const failedPayload = await failed.json().catch(() => null);
  const stateAfterFailure = await client.json(`/api/experience/${setup.experienceId}/state`);

  // 3. 用户 STOP 以当前状态版本提交 → 合法终止（stopped 事件、零内容分块、COMPLETED v5）。
  const stopOffset = await httpLogSize(logPath);
  const stopResponse = await client.postEvent(
    setup,
    { requestId: `req-s2a-stopafterfailure-stop-${shortId()}`, semanticAction: 'STOP', rawInput: '好了', stateVersion: versionAfterFirst },
  );
  const stopEvents = stopResponse.ok ? await readStreamEvents(stopResponse.body) : [];
  const stateAfterStop = await client.json(`/api/experience/${setup.experienceId}/state`);

  // 事件日志窗口验证：失败窗口恰好 1 次网关调用（无完成事件）；STOP 窗口零网关调用。
  const failureWindow = await httpLogSlice(logPath, failureOffset);
  const failureWindowEvents = failureWindow.events.filter((event) => event.context?.experience_id === setup.experienceId);
  const stopWindow = await httpLogSlice(logPath, stopOffset);
  const stopWindowEvents = stopWindow.events.filter((event) => event.context?.experience_id === setup.experienceId);
  const fullWindow = await httpLogSlice(logPath, offsetBefore);
  const fullWindowEvents = fullWindow.events.filter((event) => event.context?.experience_id === setup.experienceId);

  const expected = {
    firstWhy: '首次 WHY → 200 NDJSON 全链路（内容逐字节等于合成语料；succeed_once 形态首次调用成功），终态 WAITING v4',
    secondWhy: '再次 WHY → 503 LLM_UNAVAILABLE（succeed_once 形态后续调用失败）；失败不产生状态写入，状态保持 WAITING v4',
    stop: 'STOP 以当前状态版本（v4）提交 → 200 NDJSON（stopped 事件、零内容分块）；终止事实经事件日志权威登记（state_transitioned STOP v5 + experience_completed + session_ended）；STOP 不触发网关调用（STOP 窗口零 llm_request_started）',
    gatewayCalls: '本体验网关调用恒为 2（两次 WHY；STOP 不调用网关），llm_request_completed 恰好 1 次（仅首次 WHY）',
    finalState: '体验终态 COMPLETED v5',
  };
  const actual = {
    firstStatus: first.status,
    firstStreamTypes: firstEvents.map((event) => event.type),
    firstContent: contentOf(firstEvents),
    fixtureContent: why.chunks.join(''),
    firstContentMatchesFixture: contentOf(firstEvents) === why.chunks.join(''),
    firstStateUpdatedVersion: firstEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    stateAfterFirst: { state_version: versionAfterFirst ?? null, status: stateAfterFirst.payload?.state?.status ?? null },
    failureStatus: failed.status,
    failureCode: failedPayload?.code ?? null,
    failureRetryable: failedPayload?.retryable ?? null,
    stateAfterFailure: {
      state_version: stateAfterFailure.payload?.state_version ?? null,
      status: stateAfterFailure.payload?.state?.status ?? null,
    },
    failureWindowLlmRequestStarted: failureWindowEvents.filter((event) => event.event_type === 'llm_request_started').length,
    failureWindowLlmRequestCompleted: failureWindowEvents.filter((event) => event.event_type === 'llm_request_completed').length,
    stopStatus: stopResponse.status,
    stopStreamTypes: stopEvents.map((event) => event.type),
    stopContentChunks: stopEvents.filter((event) => event.type === 'chunk').length,
    stopTransitionVersion: fullWindowEvents
      .filter((event) => event.event_type === 'state_transitioned' && event.properties?.event === 'STOP')
      .map((event) => event.context?.state_version ?? null),
    experienceCompletedCount: fullWindowEvents.filter((event) => event.event_type === 'experience_completed').length,
    sessionEndedCount: fullWindowEvents.filter((event) => event.event_type === 'session_ended').length,
    stopWindowLlmRequestStarted: stopWindowEvents.filter((event) => event.event_type === 'llm_request_started').length,
    totalLlmRequestStarted: fullWindowEvents.filter((event) => event.event_type === 'llm_request_started').length,
    totalLlmRequestCompleted: fullWindowEvents.filter((event) => event.event_type === 'llm_request_completed').length,
    stateAfterStop: {
      state_version: stateAfterStop.payload?.state_version ?? null,
      status: stateAfterStop.payload?.state?.status ?? null,
    },
  };
  const pass =
    first.status === 200 &&
    contentOf(firstEvents) === why.chunks.join('') &&
    firstEvents.find((event) => event.type === 'state_updated')?.state_version === setup.stateVersion + 2 &&
    versionAfterFirst === setup.stateVersion + 2 &&
    stateAfterFirst.payload?.state?.status === 'WAITING' &&
    failed.status === 503 &&
    failedPayload?.code === 'LLM_UNAVAILABLE' &&
    stateAfterFailure.payload?.state_version === versionAfterFirst &&
    stateAfterFailure.payload?.state?.status === 'WAITING' &&
    failureWindowEvents.filter((event) => event.event_type === 'llm_request_started').length === 1 &&
    failureWindowEvents.filter((event) => event.event_type === 'llm_request_completed').length === 0 &&
    stopResponse.status === 200 &&
    stopEvents.some((event) => event.type === 'stopped') &&
    !stopEvents.some((event) => event.type === 'chunk') &&
    fullWindowEvents.filter((event) => event.event_type === 'state_transitioned' && event.properties?.event === 'STOP').length === 1 &&
    fullWindowEvents.filter((event) => event.event_type === 'state_transitioned' && event.properties?.event === 'STOP')[0]?.context?.state_version === versionAfterFirst + 1 &&
    fullWindowEvents.filter((event) => event.event_type === 'experience_completed').length === 1 &&
    fullWindowEvents.filter((event) => event.event_type === 'session_ended').length === 1 &&
    stopWindowEvents.filter((event) => event.event_type === 'llm_request_started').length === 0 &&
    fullWindowEvents.filter((event) => event.event_type === 'llm_request_started').length === 2 &&
    fullWindowEvents.filter((event) => event.event_type === 'llm_request_completed').length === 1 &&
    stateAfterStop.payload?.state_version === versionAfterFirst + 1 &&
    stateAfterStop.payload?.state?.status === 'COMPLETED';
  return { expected, actual, pass };
}

// --- RECOVERY-BOUNDED：fail_once 形态有界恢复（S2） ------------------------
async function caseRecoveryBounded(trace, ctx) {
  const client = ctx.clients.S2;
  const logPath = ctx.serverPaths.S2.events;
  const offsetBefore = await httpLogSize(logPath);
  const setup = await httpSetupChain(client, 'recoverybounded');
  const stateBefore = await client.json(`/api/experience/${setup.experienceId}/state`);
  const first = await client.postEvent(setup, { requestId: `req-s2a-recoverybounded-1-${shortId()}` });
  const firstPayload = await first.json().catch(() => null);
  const stateBetween = await client.json(`/api/experience/${setup.experienceId}/state`);
  const second = await client.postEvent(
    setup,
    { requestId: `req-s2a-recoverybounded-2-${shortId()}`, stateVersion: setup.stateVersion },
  );
  const secondEvents = second.ok ? await readStreamEvents(second.body) : [];
  const stateAfter = await client.json(`/api/experience/${setup.experienceId}/state`);
  const slice = await httpLogSlice(logPath, offsetBefore);
  const expEvents = slice.events.filter((event) => event.context?.experience_id === setup.experienceId);
  const llmStarted = expEvents.filter((event) => event.event_type === 'llm_request_started');
  const llmCompleted = expEvents.filter((event) => event.event_type === 'llm_request_completed');
  const expected = {
    firstAttempt: '首次 WHY → 503 LLM_UNAVAILABLE（fail_once 形态：首次调用失败）',
    versionBetween: '失败后状态版本与体验状态逐字段不变（失败写入不消耗版本号）',
    secondAttempt: '用户重试（新 request_id、同状态版本）→ 200 NDJSON 全链路（内容分块 + done + state_updated）',
    content: '流内容逐字节等于 WHY 合成语料',
    llmCalls: '网关调用 2 次（首次失败 + 重试成功）；llm_request_completed 恰好 1 次（仅重试成功那次）',
    finalState: `终态 WAITING v${setup.stateVersion + 2}（USER_ACTION 提交 + 完成提交各 +1）`,
  };
  const actual = {
    firstStatus: first.status,
    firstCode: firstPayload?.code ?? null,
    firstRetryable: firstPayload?.retryable ?? null,
    stateVersionBefore: stateBefore.payload?.state_version ?? null,
    stateVersionBetween: stateBetween.payload?.state_version ?? null,
    statusBetween: stateBetween.payload?.state?.status ?? null,
    stateUnchangedOnFailure:
      stateBetween.payload?.state_version === stateBefore.payload?.state_version &&
      stateBetween.payload?.state?.status === stateBefore.payload?.state?.status &&
      stateBetween.payload?.state?.stage === stateBefore.payload?.state?.stage &&
      stateBetween.payload?.state?.waiting_for_user === stateBefore.payload?.state?.waiting_for_user,
    secondStatus: second.status,
    secondStreamTypes: secondEvents.map((event) => event.type),
    secondContent: contentOf(secondEvents),
    fixtureContent: why.chunks.join(''),
    contentMatchesFixture: contentOf(secondEvents) === why.chunks.join(''),
    secondStateUpdatedVersion: secondEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    llmRequestStarted: llmStarted.length,
    llmRequestCompleted: llmCompleted.length,
    stateVersionAfter: stateAfter.payload?.state_version ?? null,
    statusAfter: stateAfter.payload?.state?.status ?? null,
  };
  const pass =
    first.status === 503 &&
    firstPayload?.code === 'LLM_UNAVAILABLE' &&
    actual.stateUnchangedOnFailure &&
    second.status === 200 &&
    secondEvents.some((event) => event.type === 'done') &&
    contentOf(secondEvents) === why.chunks.join('') &&
    secondEvents.find((event) => event.type === 'state_updated')?.state_version === setup.stateVersion + 2 &&
    llmStarted.length === 2 &&
    llmCompleted.length === 1 &&
    stateAfter.payload?.state_version === setup.stateVersion + 2 &&
    stateAfter.payload?.state?.status === 'WAITING';
  return { expected, actual, pass };
}

// --- SEAM-INERT：注入缝关闭时行为与 S1 完全一致（S3）+ 静态门控字节 -------
async function caseSeamInert(trace, ctx) {
  const client = ctx.clients.S3;
  const logPath = ctx.serverPaths.S3.events;
  const offsetBefore = await httpLogSize(logPath);
  const setup = await httpSetupChain(client, 'seaminert');
  const response = await client.postEvent(setup, { requestId: `req-s2a-seaminert-${shortId()}` });
  const streamEvents = response.ok ? await readStreamEvents(response.body) : [];
  const stateAfter = await client.json(`/api/experience/${setup.experienceId}/state`);
  const slice = await httpLogSlice(logPath, offsetBefore);
  const expEvents = slice.events.filter((event) => event.context?.experience_id === setup.experienceId);
  const llmStarted = expEvents.filter((event) => event.event_type === 'llm_request_started');
  const llmCompleted = expEvents.filter((event) => event.event_type === 'llm_request_completed');

  // 静态字节断言：门控代码存在且以环境变量为唯一开关（读取已提交源码字节）。
  const serverRuntimeSrc = await readFile(path.join(repoRoot, 'src/experience/server-runtime.ts'), 'utf8');
  const llmGatewaySrc = await readFile(path.join(repoRoot, 'src/experience/llm-gateway.ts'), 'utf8');
  const staticChecks = {
    serverRuntimeHasGate: serverRuntimeSrc.includes("process.env.EXPERIENCE_LLM_GATEWAY_SEAM !== '1'"),
    serverRuntimeHasResolver: serverRuntimeSrc.includes('function resolveServerGateway()'),
    serverRuntimeHasSeamConstruction: serverRuntimeSrc.includes('new EvidenceFaultLlmGateway(allFixtures())'),
    llmGatewayHasFaultClass: llmGatewaySrc.includes('export class EvidenceFaultLlmGateway'),
    llmGatewayHasFaultModeEnv: llmGatewaySrc.includes("process.env.EXPERIENCE_GATEWAY_FAULT_MODE"),
    serverRuntimeNoEgress: !/\bfetch\s*\(|node:https?|https?:\/\//.test(serverRuntimeSrc),
    llmGatewayNoEgress: !/\bfetch\s*\(|node:https?|https?:\/\//.test(llmGatewaySrc),
  };

  const expected = {
    http: '注入缝未设置：WHY → 200 NDJSON 全链路（内容分块 + done + state_updated），内容逐字节等于合成语料',
    llmCalls: '网关调用 1 次（llm_request_started = 1 且 llm_request_completed = 1，经服务端事件日志验证）',
    finalState: `终态 WAITING v${setup.stateVersion + 2}`,
    staticGate: 'server-runtime.ts 字节包含环境门控（EXPERIENCE_LLM_GATEWAY_SEAM !== \'1\' → resolveServerGateway 返回 undefined）；两文件均无网络出口（fetch/node:http/URL）字节',
  };
  const actual = {
    status: response.status,
    streamTypes: streamEvents.map((event) => event.type),
    content: contentOf(streamEvents),
    fixtureContent: why.chunks.join(''),
    contentMatchesFixture: contentOf(streamEvents) === why.chunks.join(''),
    stateUpdatedVersion: streamEvents.find((event) => event.type === 'state_updated')?.state_version ?? null,
    llmRequestStarted: llmStarted.length,
    llmRequestCompleted: llmCompleted.length,
    stateVersionAfter: stateAfter.payload?.state_version ?? null,
    statusAfter: stateAfter.payload?.state?.status ?? null,
    staticChecks,
  };
  const pass =
    response.status === 200 &&
    streamEvents.some((event) => event.type === 'done') &&
    contentOf(streamEvents) === why.chunks.join('') &&
    streamEvents.find((event) => event.type === 'state_updated')?.state_version === setup.stateVersion + 2 &&
    llmStarted.length === 1 &&
    llmCompleted.length === 1 &&
    stateAfter.payload?.state_version === setup.stateVersion + 2 &&
    Object.values(staticChecks).every(Boolean);
  return { expected, actual, pass };
}

// --- INPROC-REGRESSION：进程内形态（默认网关）完整链路回归 ------------------
async function caseInprocRegression(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const { session, intent, exp } = await inprocSetupChain(runtime, 'inprocregression');
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2a-inprocregression-${shortId()}`,
  });
  const streamEvents = sub.ok ? await consume(sub.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);
  const envelopeViolations = [];
  for (const event of events) {
    const result = validateEventEnvelope(event);
    if (!result.ok) envelopeViolations.push({ event_id: event.event_id, violations: result.violations });
  }
  const expected = {
    chain: '进程内形态（未注入网关）WHY 完整链路：policy_decided(EXPLAIN) + generation_started + llm_request_started + llm_request_completed + 内容分块 + done + state_updated',
    content: '流内容逐字节等于 WHY 合成语料',
    finalState: `终态 WAITING v${exp.stateVersion + 2}；信封全量通过；sequence_number 严格单调`,
  };
  const expEvents = events.filter((event) => event.context?.experience_id === exp.experienceId);
  const sequenceOk = expEvents.every((event, index) => index === 0 || event.sequence_number > expEvents[index - 1].sequence_number);
  const actual = {
    ok: sub.ok,
    headerSelectedAction: sub.ok ? sub.header.policy_decision.selected_action : sub.error.code,
    decisionTraceSemanticAction: traces[0]?.semantic_action ?? null,
    decisionTraceSelectedAction: traces[0]?.policy?.selected_action ?? null,
    llmRequestStarted: expEvents.filter((event) => event.event_type === 'llm_request_started').length,
    llmRequestCompleted: expEvents.filter((event) => event.event_type === 'llm_request_completed').length,
    streamContent: contentOf(streamEvents),
    fixtureContent: why.chunks.join(''),
    contentMatchesFixture: contentOf(streamEvents) === why.chunks.join(''),
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage} v${finalState.state.stateVersion}` : 'ERROR',
    sessionStateAfter: sessionAfter?.state ?? null,
    envelopeViolations: envelopeViolations.length,
    sequenceMonotonic: sequenceOk,
  };
  const pass =
    sub.ok &&
    sub.header.policy_decision.selected_action === 'EXPLAIN' &&
    traces[0]?.semantic_action === 'WHY' &&
    traces[0]?.policy?.selected_action === 'EXPLAIN' &&
    expEvents.filter((event) => event.event_type === 'llm_request_started').length === 1 &&
    expEvents.filter((event) => event.event_type === 'llm_request_completed').length === 1 &&
    contentOf(streamEvents) === why.chunks.join('') &&
    finalState.ok &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stateVersion === exp.stateVersion + 2 &&
    sessionAfter?.state === 'SESSION_ACTIVE' &&
    envelopeViolations.length === 0 &&
    sequenceOk;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表（E5 §4：每案例 12 字段记录）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'HTTP-503',
    form: 'http',
    servers: ['S1'],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / S1 §28（LLM_UNAVAILABLE 错误词表）/ API 契约错误→HTTP 状态映射 / C5',
    scope: 'HTTP 形态 LLM 上游不可用故障的错误语义（CR-18 选项 A 注入缝触发）',
    precondition: 'S1 服务器（端口 4331）以 EXPERIENCE_LLM_GATEWAY_SEAM=1 + EXPERIENCE_GATEWAY_FAULT_MODE=unavailable 启动；会话/意图/体验链已建立（WAITING v2）',
    inputFault: 'WHY 事件提交时网关 propose() 抛出上游不可用异常（证据故障注入）',
    run: caseHttp503,
  },
  {
    caseId: 'CALL-ONCE',
    form: 'http',
    servers: ['S1'],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / EB-06（重试是工程恢复机制，运行时无自动重试）/ C6 §8（llm_request_started/completed 事件规则）',
    scope: '故障路径网关调用计数：恰好一次调用且无完成事件',
    precondition: '同 HTTP-503；本案例使用独立体验实例，服务端事件日志按偏移切片隔离',
    inputFault: 'WHY 事件提交时网关 propose() 抛出上游不可用异常',
    run: caseCallOnce,
  },
  {
    caseId: 'VERSION-INTACT',
    form: 'http',
    servers: ['S1'],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / S1-12（版本化单写者）/ PD-16（expected_state_version）/ EB-02（失败写入不消耗版本号）',
    scope: 'LLM 故障后状态版本与体验状态完整性',
    precondition: '同 HTTP-503；体验处于 WAITING v2',
    inputFault: 'WHY 事件提交时网关 propose() 抛出上游不可用异常',
    run: caseVersionIntact,
  },
  {
    caseId: 'STOP-AFTER-FAILURE',
    form: 'http',
    servers: ['S4'],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / P-01（STOP 永远优先）/ S1 状态机 §7（WAITING 接受 STOP）/ EB-06（失败后 STOP 不触发网关调用）',
    scope: '成功后故障形态下“失败后 STOP 合法”：WHY 成功后再次 WHY 失败（体验保持 WAITING），用户 STOP 以当前状态版本合法终止',
    precondition: 'S4 服务器（端口 4334）以 EXPERIENCE_LLM_GATEWAY_SEAM=1 + EXPERIENCE_GATEWAY_FAULT_MODE=succeed_once 启动；首次 WHY 成功（WAITING v4）后再次 WHY 失败（503，状态保持 WAITING v4）',
    inputFault: 'succeed_once 形态：首次网关调用成功、后续调用均失败；随后提交 STOP（语义动作 STOP，原始输入"好了"）',
    run: caseStopAfterFailure,
  },
  {
    caseId: 'RECOVERY-BOUNDED',
    form: 'http',
    servers: ['S2'],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / EB-07（有界恢复 + 用户控制保留，不因故障自行决定新方向）',
    scope: 'fail_once 故障形态下的有界恢复：首次失败、用户重试成功',
    precondition: 'S2 服务器（端口 4332）以 EXPERIENCE_LLM_GATEWAY_SEAM=1 + EXPERIENCE_GATEWAY_FAULT_MODE=fail_once 启动；体验处于 WAITING v2',
    inputFault: '首次 WHY 调用网关失败（fail_once 形态）；第二次 WHY（新 request_id、同状态版本）委托合成网关成功',
    run: caseRecoveryBounded,
  },
  {
    caseId: 'SEAM-INERT',
    form: 'http',
    servers: ['S3'],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / CR-18 选项 A（仅证据/测试环境启用，默认合成模式不变）/ ADR-0002 §3（无真实提供方调用）',
    scope: '注入缝惰性不变式：未启用环境变量时行为与 S1 完全一致；门控字节静态断言',
    precondition: 'S3 服务器（端口 4333）未设置 EXPERIENCE_LLM_GATEWAY_SEAM / EXPERIENCE_GATEWAY_FAULT_MODE；体验处于 WAITING v2',
    inputFault: '无故障注入（WHY 正常提交）；另对已提交源码字节做门控存在性与无网络出口静态断言',
    run: caseSeamInert,
  },
  {
    caseId: 'INPROC-REGRESSION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'P3-S2-IMPL-AUTH-01 §2 OBL-01 / G2 动态跨契约一致性（进程内形态回归）/ C6 §7 信封 / C6 §25 sequence 单调',
    scope: '进程内形态（默认合成网关）完整链路回归：注入缝改动不改变既有进程内行为',
    precondition: '执行器经 module.registerHooks 直接加载已提交 .ts 源字节；每案例独立 ExperienceRuntime 与内存汇（未注入网关）',
    inputFault: '无故障注入（WHY 正常提交）',
    run: caseInprocRegression,
  },
];

// ---------------------------------------------------------------------------
// 执行器主体
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1 / F2 / F3 / G3).
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

  // Start three HTTP servers (real Next.js production servers), each with
  // independent event sinks and an independent seam / fault-mode posture.
  const servers = [];
  for (const def of SERVER_DEFS) {
    const env = { ...process.env };
    delete env.EXPERIENCE_LLM_GATEWAY_SEAM;
    delete env.EXPERIENCE_GATEWAY_FAULT_MODE;
    env.EXPERIENCE_EVENT_LOG = serverPaths[def.id].events;
    env.EXPERIENCE_DECISION_TRACE_LOG = serverPaths[def.id].decisions;
    env.EXPERIENCE_AUDIT_LOG = serverPaths[def.id].audit;
    if (def.seam) {
      env.EXPERIENCE_LLM_GATEWAY_SEAM = '1';
      env.EXPERIENCE_GATEWAY_FAULT_MODE = def.faultMode;
    }
    const server = spawn(process.execPath, [nextBin, 'start', '-p', String(def.port)], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    server.stdout.on('data', (chunk) => {
      serverLog += chunk;
    });
    server.stderr.on('data', (chunk) => {
      serverLog += chunk;
    });
    const serverUp = await waitForServer(def.port);
    if (!serverUp) {
      for (const running of servers) running.kill('SIGTERM');
      fatal(`HTTP server ${def.id} (port ${def.port}) did not become ready within 60s: ${tail(serverLog)}`);
    }
    servers.push(server);
    log(`HTTP server ${def.id} ready at http://127.0.0.1:${def.port} (${def.label}; sinks → traces/${def.id.toLowerCase()}-*.jsonl)`);
  }

  const clients = {};
  for (const def of SERVER_DEFS) {
    clients[def.id] = makeClient(def);
  }
  const ctx = { clients, serverPaths };

  // Execute cases sequentially.
  const caseResults = [];
  for (const definition of CASE_REGISTRY) {
    const trace = new TraceWriter(tracesDir, `${RUN_ID}:${definition.caseId}`);
    await trace.start({ form: definition.form, sourceClause: definition.sourceClause, servers: definition.servers });
    log(`case ${definition.caseId}: RUNNING (${definition.form}${definition.servers.length ? ` on ${definition.servers.join(',')}` : ''})`);
    let outcome;
    try {
      outcome = await definition.run(trace, ctx);
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
        httpEventLogs: definition.servers.map((id) => `traces/${id.toLowerCase()}-events.jsonl`),
        httpDecisionTraceLogs: definition.servers.map((id) => `traces/${id.toLowerCase()}-decision-traces.jsonl`),
        httpAuditLogs: definition.servers.map((id) => `traces/${id.toLowerCase()}-audit.jsonl`),
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
    caseResults.push({ caseId: definition.caseId, result: caseRecord.result, pass: outcome.pass });
    log(`case ${definition.caseId}: ${caseRecord.result}`);
  }

  // Stop the servers.
  for (const server of servers) {
    server.kill('SIGTERM');
  }
  await new Promise((resolve) => {
    let pending = servers.length;
    if (pending === 0) {
      resolve();
      return;
    }
    for (const server of servers) {
      server.on('close', () => {
        pending -= 1;
        if (pending === 0) resolve();
      });
    }
    setTimeout(resolve, 5000);
  });
  log('HTTP servers stopped (S1/S2/S3/S4)');

  // Assertions.
  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  const allCasesPass = caseResults.every((entry) => entry.pass);

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
    'tools/evidence/src/s2a-f1.mjs',
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
    obligation: 'P3-S2-IMPL-AUTH-01 v1.1.0 §2/§6：OBL-01——环境门控 LlmGateway 注入缝（CR-18 选项 A 形态，仅证据/测试环境启用，默认合成模式不变）+ HTTP 形态 LLM 故障 503 动态证据补测（S2a 首个迭代 F-1）',
    authorization: { id: 'P3-S2-IMPL-AUTH-01', version: '1.1.0', issued: '2026-10-09', note: '产品负责人签署生效（AUTHORIZED）；§6：签署后 S2a 首个迭代（F-1 / OBL-01）开工' },
    obligationTraceability: {
      'OBL-01': {
        seamImplementation: ['src/experience/llm-gateway.ts（EvidenceFaultLlmGateway）', 'src/experience/server-runtime.ts（resolveServerGateway，env-gated）'],
        seamEnvVars: {
          EXPERIENCE_LLM_GATEWAY_SEAM: "仅当值为 '1' 时解析证据故障注入网关；未设置时运行时保持默认合成网关（SEAM-INERT 不变式）",
          EXPERIENCE_GATEWAY_FAULT_MODE: "故障形态：'unavailable'（默认，每次调用失败）/ 'fail_once'（首次失败，后续委托合成网关）",
        },
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        closesDebt: 'D-01（HTTP 形态 LLM 故障 503 动态证据缺口，CR-18 选项 B 登记 DEFERRED TO 后续切片——本迭代履行）',
      },
    },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17', 'PD-21', 'PD-22', 'PD-23'],
      note: 'PD-23：S2 范围裁决（选项 B 两切片：S2a = 全 G04 Creation / 全 G07 Correction / WHAT_IF 全分支 / Minimal Memory）；PD-21/PD-22 见 G07 处置与 P2 关闭裁定',
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
    stateMachine: { contract: 'C2', version: 'state_machine_v1.0.0', implemented: ['L0 Session（§4）', 'L2 Experience 状态机（§7）', 'L2 阶段机（§14/§15）', 'Forbidden Transitions（§23）'] },
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
        'POST /api/experience/stream（F-1 能力端点，本迭代未修改）',
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
      s2aObservation: 'llm_request_started / llm_request_completed 作为网关调用计数的可观察事实（CALL-ONCE 案例经 HTTP 事件日志切片验证）',
    },
    engineeringBoundaries: {
      contract: 'P2-EVIDENCE-4.0',
      evidence: 'EB-06（重试边界：HTTP 形态恰好一次调用——CALL-ONCE）；EB-07（有界恢复 + 用户控制保留——RECOVERY-BOUNDED / STOP-AFTER-FAILURE）；EB-16（版本可追溯——本版本矩阵 + A2/A11）',
      seamBoundary: '注入缝为环境门控（EXPERIENCE_LLM_GATEWAY_SEAM）：默认合成模式字节不变（SEAM-INERT 案例 + 静态断言）；缝实现无网络出口字节（无 fetch / node:http / URL 构造）',
      s2ScopeItems: {
        memory: 'Minimal Memory 属 S2a 后续迭代（短期记忆 only，6 个月自动删除，无长期画像——PD-23 裁决）',
        deepenSimplifyReframe: 'DEEPEN/SIMPLIFY/REFRAME/Search 属 S2b（PD-23 裁决）',
      },
    },
    evaluation: { contract: 'C7', version: 'evaluation_v1.0.0', note: 'G5 16 项评测包仍 NOT RUN；独立评测人须先审阅本运行 staged 材料（review/README.md）' },
    code: {
      gitHead: git.commit,
      workTreeClean: git.workTreeClean,
      uncommittedEntries: git.uncommittedEntries,
      runtimeFiles: runtimeFileHashes,
      typecheckCommand: 'npm run typecheck:core',
      buildCommand: 'npm run build (next build, Turbopack)',
      typecheckExitCode: typecheck.code,
      buildExitCode: build.code,
      changedFiles: ['src/experience/llm-gateway.ts', 'src/experience/server-runtime.ts', 'tools/evidence/src/s2a-f1.mjs', 'tools/evidence/package.json'],
    },
    prompt: { value: 'synthetic-fixture', reason: '无真实 LLM 提供方调用（E5 §2 排除项；ADR-0002 §3 硬边界）' },
    model: { value: 'synthetic-fixture', reason: '同上；LLM 网关为合成实现（经 LlmGateway 接口；证据注入点用于故障注入，仅证据/测试环境启用）' },
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
      httpServers: SERVER_DEFS.map((def) => ({ id: def.id, port: def.port, posture: def.label })),
    },
    packages: {
      product: { name: productPackage.name, version: productPackage.version, engines: productPackage.engines },
    },
    seamSpecification: {
      gatewayClass: 'EvidenceFaultLlmGateway（implements LlmGateway）',
      constructionSite: 'resolveServerGateway()（server-runtime.ts）——仅 EXPERIENCE_LLM_GATEWAY_SEAM === \'1\' 时构造',
      failureMode: 'propose() 抛出 Error（运行时统一捕获 → LLM_UNAVAILABLE → HTTP 503，retryable=true）',
      faultModes: {
        unavailable: '每次调用均失败（S1 服务器形态）',
        fail_once: '首次调用失败，后续调用委托合成网关（S2 服务器形态）',
        succeed_once: '首次调用委托合成网关，后续调用均失败（S4 服务器形态——成功后故障，支撑“失败后 STOP 合法”）',
      },
      inertnessProof: 'SEAM-INERT 案例（HTTP 形态）+ INPROC-REGRESSION 案例（进程内形态）+ 静态字节断言',
    },
    priorIterations: {
      f1: { runId: 'F1-E2E-0001', result: 'PASSED（9/9 案例、12/12 断言、退出码 0）' },
      f2: { runId: 'F2-GS-0001', result: 'PASSED（40/40 案例、24/24 断言、退出码 0）' },
      f3: { runId: 'F3-EB-0001', result: 'PASSED（26/26 案例、28/28 断言、退出码 0）' },
      g3: { runId: 'G3-GOLDEN-0001', result: 'PASSED（golden 再生验证）' },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    executor: 'tools/evidence/src/s2a-f1.mjs',
    executorSha256: sha256OfBuffer(await readFile(path.join(here, 's2a-f1.mjs'))),
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix)');

  // A1: run-metadata completeness (E5 §3).
  const requiredSections = [
    'runId', 'obligation', 'authorization', 'productDecisions', 'contracts', 's1Specifications',
    'stateMachine', 'policy', 'api', 'event', 'engineeringBoundaries', 'evaluation', 'code',
    'prompt', 'model', 'corpus', 'environment', 'packages', 'startedAt', 'finishedAt', 'durationMs', 'executor',
  ];
  const missingSections = requiredSections.filter((section) => !(section in versionMatrix));
  assert('A1', 'run-metadata 完整（E5 §3 版本矩阵全部字段 + OBL-01 可追溯性专项）', missingSections.length === 0, { missingSections });

  // A2: environment lock.
  assert(
    'A2',
    '环境锁定：engines.node === "24.21.0"（F-2 精确锁定）且执行于 Node v24.21.0；lockfileVersion 3；Next.js / React / TypeScript 版本登记',
    productPackage.engines?.node === '24.21.0' && process.version === NODE_LOCK && lockfile.lockfileVersion === 3,
    { enginesNode: productPackage.engines?.node, processVersion: process.version, lockfileVersion: lockfile.lockfileVersion, next: nextVersion, react: reactVersion, typescript: typescriptVersion },
  );

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
    (name) => name.endsWith('.jsonl') && !/^s\d+-(events|decision-traces|audit)\.jsonl$/.test(name),
  );
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (
      await Promise.all(
        traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
      )
    ).every(Boolean);
  assert('A4', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // A5: HTTP-503 semantics.
  const c503 = caseResults.find((entry) => entry.caseId === 'HTTP-503');
  assert(
    'A5',
    'HTTP-503：LLM 上游不可用 → HTTP 503 + code=LLM_UNAVAILABLE + retryable=true（结构化错误体 {code, message, retryable}）',
    c503?.pass === true,
    { http503: c503?.pass },
  );

  // A6: exactly-one-call.
  const cOnce = caseResults.find((entry) => entry.caseId === 'CALL-ONCE');
  assert(
    'A6',
    'CALL-ONCE：故障路径网关恰好一次调用（llm_request_started=1、llm_request_completed=0、generation_started=1——无自动重试，EB-06）',
    cOnce?.pass === true,
    { callOnce: cOnce?.pass },
  );

  // A7: version intact.
  const cVersion = caseResults.find((entry) => entry.caseId === 'VERSION-INTACT');
  assert(
    'A7',
    'VERSION-INTACT：LLM 失败写入不消耗状态版本（v2 → v2），体验保持 WAITING（waiting_for_user=true）',
    cVersion?.pass === true,
    { versionIntact: cVersion?.pass },
  );

  // A8: STOP after failure.
  const cStop = caseResults.find((entry) => entry.caseId === 'STOP-AFTER-FAILURE');
  assert(
    'A8',
    'STOP-AFTER-FAILURE：WHY 成功后再次 WHY 失败（保持 WAITING v4），STOP 以当前状态版本合法终止（200 + stopped 事件 + 零内容分块 + 终态 COMPLETED v5）；STOP 窗口零网关调用（网关调用恒为 2）',
    cStop?.pass === true,
    { stopAfterFailure: cStop?.pass },
  );

  // A9: bounded recovery.
  const cRecovery = caseResults.find((entry) => entry.caseId === 'RECOVERY-BOUNDED');
  assert(
    'A9',
    'RECOVERY-BOUNDED：fail_once 形态有界恢复——首次 503（版本不消耗）、用户重试 200 全链路（内容逐字节等于语料、终态 WAITING v4）',
    cRecovery?.pass === true,
    { recoveryBounded: cRecovery?.pass },
  );

  // A10: seam inert.
  const cSeam = caseResults.find((entry) => entry.caseId === 'SEAM-INERT');
  assert(
    'A10',
    'SEAM-INERT：注入缝未设置时 HTTP 形态 WHY 200 全链路（行为与 S1 一致）+ 静态字节断言（门控存在、缝实现无网络出口字节）',
    cSeam?.pass === true,
    { seamInert: cSeam?.pass },
  );

  // B26-equivalent preflight/integrity is fatal above; record as informational assertion.
  assert(
    'A11-PREFLIGHT',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。OBL-01 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern:
  // the manifest is regenerated after the final summary write.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A11', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Final pass: refresh summary with A11 included, then regenerate the
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

运行：${RUN_ID}（S2a F-1 迭代：OBL-01——环境门控 LlmGateway 注入缝 + HTTP 形态 LLM 故障 503 补测）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹 + 四个服务器实例的独立事件汇（s1/s2/s3/s4-events.jsonl / -decision-traces.jsonl / -audit.jsonl）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：OBL-01 → 案例 / 断言 / 关闭债务 D-01 的映射；seamSpecification：注入缝规范）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖

- HTTP 形态 LLM 故障 503 补测（OBL-01 主目标，CR-18 选项 B 登记的 DEFERRED 项本迭代履行；四服务器姿态：S1 unavailable / S2 fail_once / S4 succeed_once / S3 无缝惰性）：
  - HTTP-503：503 / LLM_UNAVAILABLE / retryable=true 结构化错误体
  - CALL-ONCE：网关恰好一次调用（llm_request_started=1，无 llm_request_completed——无自动重试）
  - VERSION-INTACT：失败写入不消耗版本号（v2 → v2，WAITING 保留）
  - STOP-AFTER-FAILURE：成功后故障形态——WHY 成功后再次 WHY 失败（保持 WAITING v4），STOP 合法终止（stopped 事件、零内容分块、COMPLETED v5、STOP 窗口零网关调用）
  - RECOVERY-BOUNDED：fail_once 形态有界恢复（首次 503 → 用户重试 200，内容逐字节等于语料，WAITING v4）
- 注入缝安全性：
  - SEAM-INERT：缝未设置时 HTTP 形态行为与 S1 完全一致 + 静态字节断言（门控以环境变量为唯一开关；缝实现无网络出口字节）
  - INPROC-REGRESSION：进程内形态（默认合成网关）完整链路回归（信封全量、sequence 单调、内容逐字节等于语料）

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务（G04 全 Creation / G07 全 Correction / WHAT_IF 全分支 / Minimal Memory）——属 S2a 后续迭代（PD-23 选项 B 两切片裁决）
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 债务关闭

- D-01（HTTP 形态 LLM 故障 503 动态证据缺口）：本运行履行完毕，关闭登记于迭代记录 implementation-iteration-s2a-f1.md

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s2a-f1   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's2a-f1-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's2a-f1-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
