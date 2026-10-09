// obl02.mjs — OBL-02 延迟测量执行器（OBL02-LATENCY-0001）。
//
// 方法：OBL-02-LATENCY-METHOD-01 v1.0.0（产品负责人 2026-10-09 按 E3 批准；
// 批准范围仅测量方法——分层与样本窗口纪律，不含任何统计阈值，PB-03 / PD-08）。
//
// 测量对象（方法 §1）：提交接受到流完成的墙钟时间 / 首内容分块延迟（TTFB）/
// 分块间隔分布；故障恢复路径（LLM_UNAVAILABLE → 健康重试完成）单列，不与正常路径混合。
//
// 分层（方法 §2–§4）：
// - 执行形态：进程内证据形态与 HTTP 形态（Next.js 路由端到端）分别登记，不合并；
// - 模型维度：当前仅合成网关——登记为 N/A（synthetic）；
// - 请求类别：语义动作 DIRECT_ANSWER / WHY / WHAT_IF_SIMULATE / CHANGE_DIRECTION /
//   STOP / CREATE / CORRECTION 各类独立登记，不计算混合平均值；
// - 路径维度：正常 / 故障恢复四维度之一，故障恢复单列。
//
// 样本窗口（方法 §5）：单次证据运行内的连续提交序列；本运行每分层 30 提交
//（方法学建议，非验收阈值），满足参考统计量计算条件；原始值全量登记。
//
// 披露（方法 §6）：本运行产出为内部参考值 / 参考统计量，不构成任何延迟指标宣称；
// 无统计阈值（PB-03 / PD-08）；公开发布须另行满足 E3 统计 Gate。
//
// 治理约束：退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何
// Gate 状态为 PASS。G5 第 9 项（延迟结果）是否关闭由独立评测人（角色 5）
// 经逐项裁决作出（E5 §2 词汇表纪律）。

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

// 进程内形态经 registerHooks 解析无扩展名说明符到真实 .ts 源码
// （Node ≥23.6 原生类型剥离；s2a-f2 同一形态），使证据执行器运行的是
// 已提交的真实运行时代码。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context);
      } catch {
        // 非相对说明符或解析失败时回退默认解析
      }
    }
    return nextResolve(specifier, context);
  },
});

const { ExperienceRuntime } = await import('../../../src/experience/runtime');
const { EvidenceFaultLlmGateway } = await import('../../../src/experience/llm-gateway');
const { allFixtures } = await import('../../../src/experience/chunks');
const { TraceWriter } = await import('./trace.mjs');
const { writeCaseRecord } = await import('./caselog.mjs');
const { writeSha256Sums, verifySha256Sums } = await import('./hashes.mjs');
const {
  verifyReferenceIntegrity,
  verifyContractFingerprints,
  gitState,
} = await import('./metadata.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const evidenceRoot = path.resolve(here, '..'); // tools/evidence
const repoRoot = path.resolve(evidenceRoot, '..', '..'); // repository root

const RUN_ID = 'OBL02-LATENCY-0001';
const NODE_LOCK = 'v24.21.0'; // F-2 精确锁定（授权日 Active LTS 重查）
const SAMPLES_PER_STRATUM = 30; // 方法 §5 样本纪律（方法学建议，非验收阈值）
const METHOD_ID = 'OBL-02-LATENCY-METHOD-01';
const METHOD_VERSION = '1.0.0';
const NORMAL_HTTP_PORT = 4400;
const FAULT_HTTP_PORT_BASE = 4401; // 每故障样本独立服务器实例（注入缝为进程级单例）

const runDir = path.join(repoRoot, 'artifacts', 'evidence', 'runs', RUN_ID);
const casesDir = path.join(runDir, 'cases');
const tracesDir = path.join(runDir, 'traces');
const logsDir = path.join(runDir, 'logs');
const reviewDir = path.join(runDir, 'review');

const EVALUATOR_SEPARATION =
  '执行：工程负责人角色（代理，Codex）；独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）。本记录由执行方起草，独立评测人保留审阅与否决权。';

const DISCLOSURE =
  '内部参考值 / 参考统计量（方法 §5 样本纪律满足：每分层 ≥30 提交）——不构成任何延迟指标宣称（方法 §6）；无统计阈值（PB-03 / PD-08：无真实用户基线不编造阈值）；任何指标宣称须同时满足方法批准 + 样本纪律 + 形态/环境/类别分层注明；公开发布须另行满足 E3 统计 Gate（人群、观察窗口、分子/分母、数据源、阈值、批准人）。';

const VOCABULARY_NOTE =
  '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置 G5 或任何产品 Gate 状态为 PASS（E5 §2）。G5 第 9 项（延迟结果）是否关闭由独立评测人（角色 5）经逐项裁决作出。';

// ---------------------------------------------------------------------------
// 请求类别定义（方法 §4）：每类的意图输入、测量输入、期望策略动作、内容 fixture
// 搭建路径对齐既有黄金证据（G01-N / G02-N / G03-N / S2A-F2 / S2A-F3 案例形态）。
// ---------------------------------------------------------------------------
const CATEGORIES = [
  {
    id: 'direct_answer',
    semanticAction: 'DIRECT_ANSWER',
    rawInput: '直接告诉我答案',
    intentInput: '直接告诉我答案',
    expectedPolicyAction: 'ANSWER',
    setupSubmission: null,
    chunked: true,
  },
  {
    id: 'why',
    semanticAction: 'WHY',
    rawInput: '为什么？',
    intentInput: '为什么',
    expectedPolicyAction: 'EXPLAIN',
    setupSubmission: null,
    chunked: true,
  },
  {
    id: 'what_if_simulate',
    semanticAction: 'WHAT_IF',
    rawInput: '如果世界突然失去摩擦力会怎样',
    intentInput: '如果世界突然失去摩擦力会怎样',
    expectedPolicyAction: 'SIMULATE',
    setupSubmission: null,
    chunked: true,
  },
  {
    id: 'change_direction',
    semanticAction: 'CHANGE_DIRECTION',
    rawInput: '换个话题',
    intentInput: '换个话题',
    expectedPolicyAction: 'CHANGE_EXPERIENCE',
    setupSubmission: null,
    chunked: true,
  },
  {
    id: 'stop',
    semanticAction: 'STOP',
    rawInput: '停止',
    intentInput: '直接告诉我答案',
    expectedPolicyAction: 'STOP',
    setupSubmission: { semanticAction: 'DIRECT_ANSWER', rawInput: '直接告诉我答案' },
    chunked: false, // STOP 流无内容分块（空语料，运行时内联 stop fixture）
  },
  {
    id: 'create',
    semanticAction: 'CREATE',
    rawInput: '做成一个小游戏',
    intentInput: '为什么',
    expectedPolicyAction: 'CREATE',
    setupSubmission: { semanticAction: 'WHY', rawInput: '为什么' },
    chunked: true,
  },
  {
    id: 'correction',
    semanticAction: 'CORRECTION',
    rawInput: '修改这个',
    intentInput: '为什么',
    expectedPolicyAction: 'EXPLAIN',
    setupSubmission: { semanticAction: 'WHY', rawInput: '为什么' },
    chunked: true,
  },
];

function fixtureContent(category) {
  if (category.id === 'stop') {
    return ''; // STOP：空语料（运行时内联 stop fixture，无内容分块）
  }
  const fixtures = allFixtures();
  const fixture = fixtures[category.semanticAction];
  if (!fixture) {
    throw new Error('no synthetic fixture for semantic action: ' + category.semanticAction);
  }
  return fixture.chunks.join('');
}

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------
const logLines = [];
function log(message) {
  const line = '[' + new Date().toISOString() + '] ' + message;
  logLines.push(line);
  console.log(line);
}

function fatal(message) {
  log('FATAL: ' + message);
  throw new Error(message);
}

function shortId() {
  return Math.random().toString(16).slice(2, 10);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/** 参考统计量（方法 §5：≥30 提交方可计算；否则仅登记原始值）。 */
function statsOf(values) {
  if (values.length === 0) {
    return { count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    meanMs: round2(mean),
    p50Ms: round2(quantile(sorted, 0.5)),
    p95Ms: round2(quantile(sorted, 0.95)),
    minMs: round2(sorted[0]),
    maxMs: round2(sorted[sorted.length - 1]),
  };
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

function tail(text, maxLines = 12) {
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(-maxLines)
    .join('\n');
}

async function waitForServer(port, timeoutMs = 60_000) {
  const baseUrl = 'http://127.0.0.1:' + port;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl + '/', { signal: AbortSignal.timeout(2000) });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
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

// ---------------------------------------------------------------------------
// HTTP 形态：客户端 / 启动链 / 带时序的 NDJSON 流读取
// ---------------------------------------------------------------------------
function makeClient(port) {
  const baseUrl = 'http://127.0.0.1:' + port;
  return {
    baseUrl,
    async json(pathname, options = {}) {
      const response = await fetch(baseUrl + pathname, {
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
    postEvent(experienceId, { requestId, semanticAction, rawInput, stateVersion, sessionId }) {
      return fetch(baseUrl + '/api/experience/' + experienceId + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          session_id: sessionId,
          state_version: stateVersion,
          event: { type: 'user_action', semantic_action: semanticAction, raw_input: rawInput, source: 'text' },
        }),
      });
    },
  };
}

/** HTTP 形态：会话 → 意图 → 体验 启动链（与既有 HTTP 证据同一形态）。 */
async function httpSetupChain(client, label) {
  const sessionResult = await client.json('/api/session/start', { method: 'POST', body: '{}' });
  const sessionId = sessionResult.payload?.session_id;
  const intentResult = await client.json('/api/intent/resolve', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-obl02-' + label + '-intent-' + shortId(),
      session_id: sessionId,
      payload: { user_input: '为什么' },
    }),
  });
  const intentId = intentResult.payload?.intent?.intent_id;
  const expResult = await client.json('/api/experience/start', {
    method: 'POST',
    body: JSON.stringify({
      request_id: 'req-obl02-' + label + '-exp-' + shortId(),
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

/**
 * 带时序的 NDJSON 流读取（HTTP 形态测量核心）。
 * 观测点（方法 §5 数据源：HTTP 形态经服务端日志 / 客户端流观测）：
 * - headerAt：首行 NDJSON（提交接受：accepted / policy_decision / state）到达时刻；
 * - firstChunkAt / 分块间隔：内容分块事件到达时刻（客户端观测分辨率）；
 * - terminalAt：终止事件（done / stopped / cancelled）到达时刻 = 流完成。
 */
async function readStreamTimed(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  let header = null;
  let headerAt = null;
  let firstChunkAt = null;
  let lastChunkAt = null;
  let terminalAt = null;
  let chunkCount = 0;
  const intervals = [];
  let terminal = null;
  let stateUpdated = null;
  const contentParts = [];
  const observe = (event, now) => {
    events.push(event);
    if (header === null) {
      header = event;
      headerAt = now;
    }
    if (event.type === 'chunk') {
      contentParts.push(event.content);
      chunkCount += 1;
      if (firstChunkAt === null) {
        firstChunkAt = now;
      } else {
        intervals.push(now - lastChunkAt);
      }
      lastChunkAt = now;
    } else if (event.type === 'done' || event.type === 'stopped' || event.type === 'cancelled') {
      terminal = event.type;
      terminalAt = now;
    } else if (event.type === 'state_updated') {
      stateUpdated = event;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const now = performance.now();
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line.trim().length === 0) continue;
      observe(JSON.parse(line), now);
    }
  }
  if (buffer.trim().length > 0) {
    observe(JSON.parse(buffer), performance.now());
  }
  return {
    header,
    events,
    headerAt,
    firstChunkAt,
    chunkCount,
    intervals,
    terminal,
    terminalAt,
    stateUpdated,
    content: contentParts.join(''),
  };
}

/** 启动一个 Next.js 生产服务器实例（HTTP 形态）。 */
function spawnNextServer(port, extraEnv) {
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const env = { ...process.env };
  delete env.EXPERIENCE_LLM_GATEWAY_SEAM;
  delete env.EXPERIENCE_GATEWAY_FAULT_MODE;
  delete env.EXPERIENCE_EVENT_LOG;
  delete env.EXPERIENCE_DECISION_TRACE_LOG;
  delete env.EXPERIENCE_AUDIT_LOG;
  Object.assign(env, extraEnv);
  const server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
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
  return {
    server,
    log: () => serverLog,
  };
}

// ---------------------------------------------------------------------------
// 进程内形态：启动链 / 正常路径样本 / 故障恢复样本
// ---------------------------------------------------------------------------
async function inprocSetupChain(runtime, category, label) {
  const { session } = await runtime.startSession();
  const intent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput: category.intentInput,
    requestId: 'req-obl02-' + label + '-intent',
  });
  if (!intent.ok) {
    throw new Error('inprocSetupChain: resolveIntent failed: ' + intent.error.code);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: 'req-obl02-' + label + '-exp',
  });
  if (!exp.ok) {
    throw new Error('inprocSetupChain: startExperience failed: ' + exp.error.code);
  }
  return { session, intent, exp };
}

function currentVersion(runtime, experienceId) {
  const state = runtime.getExperienceState(experienceId);
  if (!state.ok) {
    throw new Error('getExperienceState failed: ' + state.error.code);
  }
  return state.state.stateVersion;
}

/**
 * 进程内形态单样本测量（方法 §1：提交接受 → 流完成 / TTFB / 分块间隔）。
 * 时钟起点：submitExperienceEvent 解析完成（提交接受，header 在手）——
 * 与 HTTP 形态首行 NDJSON 到达同一语义点。
 */
async function runInprocNormalSample(runtime, category, index) {
  const label = 'inproc-' + category.id + '-' + index;
  const { session, exp } = await inprocSetupChain(runtime, category, label);
  let stateVersion = exp.stateVersion;
  if (category.setupSubmission) {
    const setupSub = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: category.setupSubmission.semanticAction,
      rawInput: category.setupSubmission.rawInput,
      expectedStateVersion: stateVersion,
      requestId: 'req-obl02-' + label + '-setup',
    });
    if (!setupSub.ok) {
      throw new Error('setup submission failed: ' + setupSub.error.code);
    }
    await consume(setupSub.stream);
    stateVersion = currentVersion(runtime, exp.experienceId);
  }
  const sub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: category.semanticAction,
    rawInput: category.rawInput,
    expectedStateVersion: stateVersion,
    requestId: 'req-obl02-' + label + '-meas',
  });
  if (!sub.ok) {
    throw new Error('measured submission failed: ' + sub.error.code);
  }
  const acceptedAt = performance.now();
  let firstChunkAt = null;
  let lastChunkAt = null;
  let chunkCount = 0;
  const intervals = [];
  let terminal = null;
  let terminalAt = null;
  let stateVersionAfter = null;
  const contentParts = [];
  for await (const event of sub.stream) {
    const now = performance.now();
    if (event.type === 'chunk') {
      contentParts.push(event.content);
      chunkCount += 1;
      if (firstChunkAt === null) {
        firstChunkAt = now;
      } else {
        intervals.push(now - lastChunkAt);
      }
      lastChunkAt = now;
    } else if (event.type === 'done' || event.type === 'stopped' || event.type === 'cancelled') {
      terminal = event.type;
      terminalAt = now;
    } else if (event.type === 'state_updated') {
      stateVersionAfter = event.state_version;
    }
  }
  const content = contentParts.join('');
  return {
    stratum: 'inproc_' + category.id,
    form: 'in_process',
    category: category.id,
    path: 'normal',
    sample: index,
    requestId: 'req-obl02-' + label + '-meas',
    policyAction: sub.header.policy_decision.selected_action,
    policyVersion: sub.header.policy_decision.policy_version,
    semanticAction: sub.header.policy_decision.semantic_action,
    stateVersionBefore: stateVersion,
    stateVersionAfter: stateVersionAfter,
    wallClockMs: round2(terminalAt - acceptedAt),
    ttfbMs: firstChunkAt === null ? null : round2(firstChunkAt - acceptedAt),
    chunkCount,
    chunkIntervalsMs: intervals.map(round2),
    terminal,
    contentMatchFixture: content === fixtureContent(category),
    recordedAt: new Date().toISOString(),
  };
}

/**
 * 进程内形态故障恢复样本（方法 §1：故障恢复路径单列）。
 * 每样本独立运行时 + 独立证据故障注入网关（fail_once：首次调用失败，
 * 后续委托合成网关）——每次提交恰好经历一次 LLM_UNAVAILABLE → 健康重试完成。
 */
async function runInprocFaultSample(index) {
  const category = CATEGORIES[0]; // 代表类别：DIRECT_ANSWER（首个探索动作）
  const label = 'inproc-fault-' + index;
  const events = [];
  const traces = [];
  const audit = [];
  const gateway = new EvidenceFaultLlmGateway(allFixtures());
  const runtime = new ExperienceRuntime({
    eventSink: (event) => {
      events.push(event);
    },
    decisionTraceSink: (trace) => {
      traces.push(trace);
    },
    auditSink: (item) => {
      audit.push(item);
    },
    gateway,
  });
  process.env.EXPERIENCE_GATEWAY_FAULT_MODE = 'fail_once';
  try {
    const { session, exp } = await inprocSetupChain(runtime, category, label);
    const attempt = async (suffix) => {
      const startedAt = performance.now();
      const sub = await runtime.submitExperienceEvent({
        experienceId: exp.experienceId,
        sessionId: session.sessionId,
        semanticAction: category.semanticAction,
        rawInput: category.rawInput,
        expectedStateVersion: exp.stateVersion,
        requestId: 'req-obl02-' + label + '-' + suffix,
      });
      return { startedAt, sub };
    };
    // 首次尝试：网关首次调用失败 → LLM_UNAVAILABLE（retryable=true）。
    const failAttempt = await attempt('fail');
    const failDoneAt = performance.now();
    const failure = {
      ok: failAttempt.sub.ok,
      code: failAttempt.sub.ok ? null : failAttempt.sub.error.code,
      retryable: failAttempt.sub.ok ? null : failAttempt.sub.error.retryable,
      roundTripMs: round2(failDoneAt - failAttempt.startedAt),
      stateVersionAfterFailure: currentVersion(runtime, exp.experienceId),
    };
    // 健康重试：新 request_id、同状态版本（失败写入不消耗版本号，OBL-01）。
    const retryAttempt = await attempt('retry');
    if (!retryAttempt.sub.ok) {
      throw new Error('fault recovery retry failed: ' + retryAttempt.sub.error.code);
    }
    const acceptedAt = performance.now();
    let firstChunkAt = null;
    let lastChunkAt = null;
    let chunkCount = 0;
    const intervals = [];
    let terminal = null;
    let terminalAt = null;
    const contentParts = [];
    for await (const event of retryAttempt.sub.stream) {
      const now = performance.now();
      if (event.type === 'chunk') {
        contentParts.push(event.content);
        chunkCount += 1;
        if (firstChunkAt === null) {
          firstChunkAt = now;
        } else {
          intervals.push(now - lastChunkAt);
        }
        lastChunkAt = now;
      } else if (event.type === 'done' || event.type === 'stopped' || event.type === 'cancelled') {
        terminal = event.type;
        terminalAt = now;
      }
    }
    const llmStarted = events.filter((event) => event.event_type === 'llm_request_started').length;
    const llmCompleted = events.filter((event) => event.event_type === 'llm_request_completed').length;
    return {
      stratum: 'inproc_fault_recovery',
      form: 'in_process',
      category: category.id,
      path: 'fault_recovery',
      sample: index,
      failure,
      recovery: {
        requestId: 'req-obl02-' + label + '-retry',
        policyAction: retryAttempt.sub.header.policy_decision.selected_action,
        wallClockMs: round2(terminalAt - acceptedAt),
        ttfbMs: firstChunkAt === null ? null : round2(firstChunkAt - acceptedAt),
        chunkCount,
        chunkIntervalsMs: intervals.map(round2),
        terminal,
        contentMatchFixture: contentParts.join('') === fixtureContent(category),
        llmRequestStarted: llmStarted,
        llmRequestCompleted: llmCompleted,
      },
      recordedAt: new Date().toISOString(),
    };
  } finally {
    delete process.env.EXPERIENCE_GATEWAY_FAULT_MODE;
  }
}

// ---------------------------------------------------------------------------
// HTTP 形态：正常路径样本 / 故障恢复样本
// ---------------------------------------------------------------------------
async function runHttpNormalSample(client, category, index) {
  const label = 'http-' + category.id + '-' + index;
  const setup = await httpSetupChain(client, label);
  let stateVersion = setup.stateVersion;
  if (category.setupSubmission) {
    const setupResp = await client.postEvent(setup.experienceId, {
      requestId: 'req-obl02-' + label + '-setup',
      semanticAction: category.setupSubmission.semanticAction,
      rawInput: category.setupSubmission.rawInput,
      stateVersion,
      sessionId: setup.sessionId,
    });
    if (setupResp.status !== 200) {
      throw new Error('http setup submission failed: ' + setupResp.status);
    }
    const setupTimed = await readStreamTimed(setupResp.body);
    if (setupTimed.terminal !== 'done') {
      throw new Error('http setup submission terminal: ' + String(setupTimed.terminal));
    }
    stateVersion = setupTimed.stateUpdated ? setupTimed.stateUpdated.state_version : stateVersion;
  }
  const sentAt = performance.now();
  const response = await client.postEvent(setup.experienceId, {
    requestId: 'req-obl02-' + label + '-meas',
    semanticAction: category.semanticAction,
    rawInput: category.rawInput,
    stateVersion,
    sessionId: setup.sessionId,
  });
  const timed = await readStreamTimed(response.body);
  if (response.status !== 200) {
    throw new Error('measured http submission failed: ' + response.status);
  }
  if (timed.terminalAt === null) {
    throw new Error('measured http submission missing terminal event');
  }
  return {
    stratum: 'http_' + category.id,
    form: 'http',
    category: category.id,
    path: 'normal',
    sample: index,
    requestId: 'req-obl02-' + label + '-meas',
    policyAction: timed.header ? timed.header.policy_decision.selected_action : null,
    policyVersion: timed.header ? timed.header.policy_decision.policy_version : null,
    semanticAction: timed.header ? timed.header.policy_decision.semantic_action : null,
    stateVersionBefore: stateVersion,
    stateVersionAfter: timed.stateUpdated ? timed.stateUpdated.state_version : null,
    httpRoundTripMs: round2(timed.headerAt - sentAt),
    wallClockMs: round2(timed.terminalAt - timed.headerAt),
    ttfbMs: timed.firstChunkAt === null ? null : round2(timed.firstChunkAt - timed.headerAt),
    chunkCount: timed.chunkCount,
    chunkIntervalsMs: timed.intervals.map(round2),
    terminal: timed.terminal,
    contentMatchFixture: timed.content === fixtureContent(category),
    recordedAt: new Date().toISOString(),
  };
}

/**
 * HTTP 形态故障恢复样本（方法 §1：故障恢复路径单列）。
 * 注入缝为服务器进程级单例（getServerRuntime），fail_once 形态下每服务器
 * 进程恰好经历一次失败 → 健康重试，故每样本独立启动一个服务器实例
 * （同运行时版本、同环境；方法 §5 窗口纪律：同窗口不切换运行时版本）。
 */
async function runHttpFaultSample(index) {
  const category = CATEGORIES[0]; // 代表类别：DIRECT_ANSWER
  const port = FAULT_HTTP_PORT_BASE + index;
  const label = 'http-fault-' + index;
  const eventLog = path.join(logsDir, 'fault-http-' + index + '-events.jsonl');
  const instance = spawnNextServer(port, {
    EXPERIENCE_LLM_GATEWAY_SEAM: '1',
    EXPERIENCE_GATEWAY_FAULT_MODE: 'fail_once',
    EXPERIENCE_EVENT_LOG: eventLog,
  });
  try {
    const up = await waitForServer(port);
    if (!up) {
      throw new Error('fault http server ' + port + ' not ready: ' + tail(instance.log()));
    }
    const client = makeClient(port);
    const setup = await httpSetupChain(client, label);
    // 首次尝试：503 LLM_UNAVAILABLE（retryable=true）。
    const failSentAt = performance.now();
    const failResp = await client.postEvent(setup.experienceId, {
      requestId: 'req-obl02-' + label + '-fail',
      semanticAction: category.semanticAction,
      rawInput: category.rawInput,
      stateVersion: setup.stateVersion,
      sessionId: setup.sessionId,
    });
    const failPayload = await failResp.json().catch(() => null);
    const failDoneAt = performance.now();
    const failure = {
      status: failResp.status,
      code: failPayload ? failPayload.code : null,
      retryable: failPayload ? failPayload.retryable : null,
      roundTripMs: round2(failDoneAt - failSentAt),
    };
    // 健康重试：新 request_id、同状态版本 → 200 NDJSON 全链路。
    const retryResp = await client.postEvent(setup.experienceId, {
      requestId: 'req-obl02-' + label + '-retry',
      semanticAction: category.semanticAction,
      rawInput: category.rawInput,
      stateVersion: setup.stateVersion,
      sessionId: setup.sessionId,
    });
    const timed = await readStreamTimed(retryResp.body);
    if (retryResp.status !== 200) {
      throw new Error('fault recovery retry http status: ' + retryResp.status);
    }
    if (timed.terminalAt === null) {
      throw new Error('fault recovery retry missing terminal event');
    }
    return {
      stratum: 'http_fault_recovery',
      form: 'http',
      category: category.id,
      path: 'fault_recovery',
      sample: index,
      failure,
      recovery: {
        requestId: 'req-obl02-' + label + '-retry',
        policyAction: timed.header ? timed.header.policy_decision.selected_action : null,
        httpRoundTripMs: round2(timed.headerAt - failDoneAt),
        wallClockMs: round2(timed.terminalAt - timed.headerAt),
        ttfbMs: timed.firstChunkAt === null ? null : round2(timed.firstChunkAt - timed.headerAt),
        chunkCount: timed.chunkCount,
        chunkIntervalsMs: timed.intervals.map(round2),
        terminal: timed.terminal,
        contentMatchFixture: timed.content === fixtureContent(category),
        stateVersionAfter: timed.stateUpdated ? timed.stateUpdated.state_version : null,
      },
      serverEventLog: path.relative(repoRoot, eventLog),
      recordedAt: new Date().toISOString(),
    };
  } finally {
    instance.server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// ---------------------------------------------------------------------------
// 分层统计量 / 环境登记 / 案例记录（E5 §4）构造
// ---------------------------------------------------------------------------
function stratumStats(samples) {
  const wallClock = samples.map((sample) => sample.wallClockMs);
  const ttfbValues = samples
    .map((sample) => sample.ttfbMs)
    .filter((value) => value !== null && value !== undefined);
  const chunkCounts = samples.map((sample) => sample.chunkCount);
  const allIntervals = samples.flatMap((sample) => sample.chunkIntervalsMs);
  const stopCategory = samples.length > 0 && samples[0].terminal === 'stopped' && ttfbValues.length === 0;
  return {
    sampleCount: samples.length,
    wallClockMs: statsOf(wallClock),
    ttfbMs: stopCategory ? null : statsOf(ttfbValues),
    ttfbNote: stopCategory
      ? 'STOP 路径无内容分块（空语料）——TTFB 登记为 N/A（方法 §1：首内容分块延迟对该类别不适用）'
      : null,
    chunkCount: statsOf(chunkCounts),
    chunkIntervalsMs: statsOf(allIntervals),
    contentMatchFixture: {
      true: samples.filter((sample) => sample.contentMatchFixture).length,
      false: samples.filter((sample) => !sample.contentMatchFixture).length,
    },
    terminals: [...new Set(samples.map((sample) => sample.terminal))],
  };
}

function faultStratumStats(samples) {
  const wallClock = samples.map((sample) => sample.recovery.wallClockMs);
  const ttfbValues = samples
    .map((sample) => sample.recovery.ttfbMs)
    .filter((value) => value !== null && value !== undefined);
  const chunkCounts = samples.map((sample) => sample.recovery.chunkCount);
  const allIntervals = samples.flatMap((sample) => sample.recovery.chunkIntervalsMs);
  return {
    sampleCount: samples.length,
    failure: {
      codeOk: samples.filter((sample) => sample.failure.code === 'LLM_UNAVAILABLE' || sample.failure.status === 503).length,
      retryableOk: samples.filter((sample) => sample.failure.retryable === true).length,
      roundTripMs: statsOf(samples.map((sample) => sample.failure.roundTripMs)),
    },
    recovery: {
      wallClockMs: statsOf(wallClock),
      ttfbMs: statsOf(ttfbValues),
      chunkCount: statsOf(chunkCounts),
      chunkIntervalsMs: statsOf(allIntervals),
      terminals: [...new Set(samples.map((sample) => sample.recovery.terminal))],
      contentMatchFixture: {
        true: samples.filter((sample) => sample.recovery.contentMatchFixture).length,
        false: samples.filter((sample) => !sample.recovery.contentMatchFixture).length,
      },
    },
  };
}

function captureEnvironment() {
  const cpus = os.cpus();
  return {
    os: os.type() + ' ' + os.release(),
    platform: process.platform,
    arch: os.arch(),
    cpu: { model: cpus.length > 0 ? cpus[0].model : 'unknown', logicalProcessors: cpus.length },
    memory: { totalBytes: os.totalmem() },
    node: process.version,
    nodeExecutable: process.execPath,
  };
}

async function captureVersions() {
  const read = async (rel) => {
    try {
      const text = await readFile(path.join(repoRoot, 'node_modules', rel, 'package.json'), 'utf8');
      return JSON.parse(text).version;
    } catch {
      return 'unknown';
    }
  };
  return {
    next: await read('next'),
    react: await read('react'),
    typescript: await read('typescript'),
  };
}

function normalSourceClause(formLabel, category) {
  return (
    'OBL-02-LATENCY-METHOD-01 v1.0.0 §1（测量对象：提交接受→流完成 / TTFB / 分块间隔）/ §2（环境分层：执行形态 ' +
    formLabel +
    '）/ §3（模型分层：N/A synthetic）/ §4（请求类别分层：' +
    category.semanticAction +
    ' 独立登记）/ §5（样本窗口与采集纪律：每分层 ≥30 提交）/ §6（披露：参考值不构成指标宣称）'
  );
}

function faultSourceClause(formLabel) {
  return (
    'OBL-02-LATENCY-METHOD-01 v1.0.0 §1（测量对象：故障恢复路径单列——LLM_UNAVAILABLE → 健康重试完成，不与正常路径混合）/ §2（环境分层：执行形态 ' +
    formLabel +
    '）/ §4（路径维度：故障恢复）/ §5（样本窗口与采集纪律）/ §6（披露纪律）'
  );
}

function buildNormalCase(stratumId, formLabel, category, samples) {
  const stats = stratumStats(samples);
  const policyOk = samples.filter((sample) => sample.policyAction === category.expectedPolicyAction).length;
  const contentOk = stats.contentMatchFixture.true;
  const terminalsOk = samples.every((sample) => sample.terminal === 'done' || sample.terminal === 'stopped');
  const pass =
    samples.length >= SAMPLES_PER_STRATUM &&
    policyOk === samples.length &&
    contentOk === samples.length &&
    terminalsOk &&
    samples.every((sample) =>
      category.id === 'stop' ? sample.wallClockMs >= 0 : sample.wallClockMs > 0,
    );
  return {
    caseIdNamespace: 'OBL02-LATENCY-0001:' + stratumId.toUpperCase(),
    sourceClause: normalSourceClause(formLabel, category),
    scope:
      '延迟测量（' +
      formLabel +
      ' / ' +
      category.semanticAction +
      ' / 正常路径）：提交接受→流完成墙钟时间、TTFB、分块间隔；每分层 ' +
      SAMPLES_PER_STRATUM +
      ' 提交连续执行窗口',
    precondition: category.setupSubmission
      ? '启动链（Session → 意图解析 → 体验启动）完成后，先提交一次 ' +
        category.setupSubmission.semanticAction +
        ' 建立合法状态（' +
        category.setupSubmission.rawInput +
        '），再测量目标动作'
      : '启动链（Session → 意图解析 → 体验启动，意图输入：' + category.intentInput + '）完成后直接测量目标动作',
    inputFault:
      '合成输入「' + category.rawInput + '」× ' + samples.length + '（声明语义动作 ' + category.semanticAction + '；分类器确定性规则校验声明一致性）',
    expected: {
      policyAction: category.expectedPolicyAction,
      policyActionOnEverySample: true,
      terminal: category.id === 'stop' ? 'stopped（STOP 流无内容分块）' : 'done',
      contentMatchFixture:
        '全部样本流内容逐字节等于合成语料 ' + (category.id === 'stop' ? '（空语料）' : category.semanticAction + ' fixture'),
      sampleCount: '≥ ' + SAMPLES_PER_STRATUM + '（方法 §5 样本纪律）',
      metrics:
        '每样本含 wallClockMs / ttfbMs（STOP 类别 TTFB 为 N/A）/ chunkCount / chunkIntervalsMs；STOP 类别（空语料）提交接受到流完成低于客户端观测分辨率时 wallClockMs 登记为 0.00ms（同一网络读到达——方法 §1 观测点注记）',
      separation: '本形态本类别独立登记，不与任何其他形态 / 类别 / 路径混合（方法 §2/§4）',
    },
    actual: {
      sampleCount: stats.sampleCount,
      policyActionMatch: policyOk,
      policyVersion: samples[0].policyVersion,
      terminals: stats.terminals,
      contentMatchFixture: stats.contentMatchFixture,
      wallClockMs: stats.wallClockMs,
      ttfbMs: stats.ttfbMs,
      ttfbNote: stats.ttfbNote,
      chunkCount: stats.chunkCount,
      chunkIntervalsMs: stats.chunkIntervalsMs,
    },
    invariants: [
      '分类权威：客户端声明语义动作与分类器结果一致（不一致即 INVALID_REQUEST，本运行全部一致）',
      '事件为不可变事实（C6 §5）；版本化单写者路径（PD-16）',
      '合成语保真：流内容逐字节等于 fixture（ADR-0002 §3 合成数据边界）',
      '分层纪律：形态 / 类别 / 路径分别登记，不计算混合平均值（方法 §2/§4/§5）',
      '无统计阈值（PB-03 / PD-08）；本案例结果不构成延迟指标宣称（方法 §6）',
    ],
    evidence: {
      trace: 'traces/' + stratumId + '.jsonl',
      samples: samples.length,
      runId: RUN_ID,
      method: METHOD_ID + ' v' + METHOD_VERSION,
    },
    result: pass ? 'PASS' : 'FAIL',
    evaluator: EVALUATOR_SEPARATION,
    defectsFollowUp: pass ? '无（本运行）' : '见上方 actual 与 expected 差异项',
  };
}

function buildFaultCase(stratumId, form, formLabel, samples) {
  const stats = faultStratumStats(samples);
  const failureOk = samples.every(
    (sample) =>
      (sample.failure.code === 'LLM_UNAVAILABLE' || sample.failure.status === 503) &&
      sample.failure.retryable === true,
  );
  const recoveryOk =
    stats.recovery.terminals.length === 1 &&
    stats.recovery.terminals[0] === 'done' &&
    stats.recovery.contentMatchFixture.true === samples.length &&
    samples.every((sample) => sample.recovery.wallClockMs > 0);
  const pass = samples.length >= SAMPLES_PER_STRATUM && failureOk && recoveryOk;
  return {
    caseIdNamespace: 'OBL02-LATENCY-0001:' + stratumId.toUpperCase(),
    sourceClause: faultSourceClause(formLabel),
    scope:
      '延迟测量（' +
      formLabel +
      ' / DIRECT_ANSWER / 故障恢复路径）：首次尝试 LLM_UNAVAILABLE（503 / retryable=true）→ 客户端新 request_id 同状态版本健康重试 → 全链路完成；故障恢复路径单列，不与正常路径混合',
    precondition:
      '证据故障注入网关（fail_once：首次调用失败，后续委托合成网关）；' +
      (form === 'http'
        ? '注入缝为服务器进程级单例，每样本独立启动一个 Next.js 生产服务器实例（同运行时版本、同环境）'
        : '每样本独立构造运行时与独立注入网关实例'),
    inputFault: '合成输入「直接告诉我答案」× ' + samples.length + '；首次尝试经注入缝失败（LLM_UNAVAILABLE），重试尝试健康完成',
    expected: {
      failure: '每次首次尝试均失败：进程内形态 error.code=LLM_UNAVAILABLE / HTTP 形态 503；retryable=true；失败写入不消耗版本号（OBL-01）',
      recovery: '重试尝试（新 request_id、同状态版本）全链路完成：terminal=done、内容逐字节等于 DIRECT_ANSWER 合成语料',
      separation: '故障恢复路径单列（方法 §1）；仅 DIRECT_ANSWER 代表类别（首个探索动作）',
      sampleCount: '≥ ' + SAMPLES_PER_STRATUM,
      llmCalls: '进程内形态：llm_request_started=2 / llm_request_completed=1（仅重试成功那次完成）',
    },
    actual: {
      sampleCount: stats.sampleCount,
      failure: stats.failure,
      recovery: {
        wallClockMs: stats.recovery.wallClockMs,
        ttfbMs: stats.recovery.ttfbMs,
        chunkCount: stats.recovery.chunkCount,
        chunkIntervalsMs: stats.recovery.chunkIntervalsMs,
        terminals: stats.recovery.terminals,
        contentMatchFixture: stats.recovery.contentMatchFixture,
      },
      llmCalls:
        samples[0] && samples[0].recovery.llmRequestStarted !== undefined
          ? {
              llmRequestStarted: samples[0].recovery.llmRequestStarted,
              llmRequestCompleted: samples[0].recovery.llmRequestCompleted,
              note: '每样本独立运行时实例；计数为该样本窗口内观测值',
            }
          : { note: 'HTTP 形态：网关调用计数见 logs/fault-http-*-events.jsonl（每样本独立事件汇）' },
    },
    invariants: [
      '重试是工程恢复机制而非产品决策机制（EB-06）；重试不自行决定新方向（EB-07）',
      '失败写入不消耗版本号（OBL-01 / S1-12）：重试使用与失败尝试相同的状态版本',
      '故障恢复路径不与正常路径混合（方法 §1/§4）',
      '合成语保真：重试流内容逐字节等于 fixture（ADR-0002 §3）',
      '无统计阈值（PB-03 / PD-08）；本案例结果不构成延迟指标宣称（方法 §6）',
    ],
    evidence: {
      trace: 'traces/' + stratumId + '.jsonl',
      serverEventLogs:
        form === 'http'
          ? 'logs/fault-http-*-events.jsonl（每样本独立）'
          : '进程内形态事件经执行器内存汇观测（llm_request_started/completed 计数登记于样本记录）',
      samples: samples.length,
      runId: RUN_ID,
      method: METHOD_ID + ' v' + METHOD_VERSION,
    },
    result: pass ? 'PASS' : 'FAIL',
    evaluator: EVALUATOR_SEPARATION,
    defectsFollowUp: pass ? '无（本运行）' : '见上方 actual 与 expected 差异项',
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  log('OBL-02 latency measurement executor: ' + RUN_ID + ' (method ' + METHOD_ID + ' v' + METHOD_VERSION + ')');

  // 引擎门控：Node 精确锁定（F-2 授权日 Active LTS 重查）。
  if (process.version !== NODE_LOCK) {
    fatal('engine gate: expected Node ' + NODE_LOCK + ' (F-2 lock), found ' + process.version);
  }
  log('engine gate passed: Node ' + process.version);

  // 预检：typecheck + 生产构建（HTTP 形态经真实 Next.js 生产服务器）。
  const tscJs = path.join(repoRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  log('preflight: typecheck:core (tsc -p tsconfig.core.json)');
  const typecheck = await runCommandSync(process.execPath, [tscJs, '-p', path.join(repoRoot, 'tsconfig.core.json')]);
  log('preflight: typecheck exit ' + typecheck.code);
  if (typecheck.code !== 0) {
    fatal('typecheck failed: ' + tail(typecheck.stdout + typecheck.stderr));
  }
  log('preflight: next build (production)');
  const build = await runCommandSync(process.execPath, [nextBin, 'build']);
  log('preflight: build exit ' + build.code);
  if (build.code !== 0) {
    fatal('next build failed: ' + tail(build.stdout + build.stderr));
  }

  // 完整性验证（与既有证据管线同一检查集）。
  const referenceCheck = await verifyReferenceIntegrity(repoRoot);
  log('reference archive integrity: ' + referenceCheck.verified + '/' + referenceCheck.total + ' verified, ' + referenceCheck.failed.length + ' failed');
  if (referenceCheck.failed.length > 0) {
    fatal('reference archive hash verification failed: ' + JSON.stringify(referenceCheck.failed));
  }
  const fingerprintCheck = await verifyContractFingerprints(repoRoot);
  const c4Entry = fingerprintCheck.contracts.find((entry) => entry.id === 'C4');
  log('contract fingerprints: allMatch=' + fingerprintCheck.allMatch + ' (C4 整文件哈希仅信息记录：' + (c4Entry ? c4Entry.registeredNote : 'n/a') + ')');
  if (!fingerprintCheck.allMatch) {
    fatal('contract fingerprint verification failed');
  }
  const git = await gitState(repoRoot);
  log('git state: HEAD=' + git.commit + ' (workTreeClean=' + git.workTreeClean + ')');

  // 运行目录：上一尝试归档（ADR-0002 §5），不覆盖。
  if (existsSync(runDir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = runDir + '-attempt-' + stamp;
    await rename(runDir, archiveDir);
    log('archived previous attempt at ' + path.basename(archiveDir) + ' (preserved, not overwritten)');
  }
  for (const dir of [casesDir, tracesDir, logsDir, reviewDir]) {
    await mkdir(dir, { recursive: true });
  }

  // 环境登记（方法 §2：平台登记 OS / CPU / 内存）。
  const environment = captureEnvironment();
  const versions = await captureVersions();
  log(
    'environment registered: ' +
      environment.os +
      ' / ' +
      environment.cpu.model +
      ' × ' +
      environment.cpu.logicalProcessors +
      ' / Node ' +
      environment.node +
      ' / Next.js ' +
      versions.next +
      ' / React ' +
      versions.react +
      ' / TypeScript ' +
      versions.typescript,
  );

  // -----------------------------------------------------------------------
  // 分层执行（方法 §2/§4/§5：形态 × 类别 × 路径；每分层 30 提交连续窗口）
  // -----------------------------------------------------------------------
  const samplesByStratum = {};
  const stratumOrder = [];

  // 1) 进程内形态：7 请求类别 × 30 提交（正常路径）。
  for (const category of CATEGORIES) {
    const stratumId = 'inproc_' + category.id;
    const samples = [];
    for (let i = 0; i < SAMPLES_PER_STRATUM; i += 1) {
      const runtime = new ExperienceRuntime({
        eventSink: () => {},
        decisionTraceSink: () => {},
        auditSink: () => {},
      });
      const sample = await runInprocNormalSample(runtime, category, i);
      samples.push(sample);
    }
    samplesByStratum[stratumId] = samples;
    stratumOrder.push(stratumId);
    log('stratum ' + stratumId + ': ' + samples.length + ' samples (in_process / ' + category.semanticAction + ' / normal)');
  }

  // 2) HTTP 形态：7 请求类别 × 30 提交（正常路径；单一生产服务器实例）。
  const httpNormalEventLog = path.join(logsDir, 'http-normal-events.jsonl');
  const normalServer = spawnNextServer(NORMAL_HTTP_PORT, {
    EXPERIENCE_EVENT_LOG: httpNormalEventLog,
  });
  try {
    const up = await waitForServer(NORMAL_HTTP_PORT);
    if (!up) {
      fatal('normal HTTP server (port ' + NORMAL_HTTP_PORT + ') not ready: ' + tail(normalServer.log()));
    }
    log('HTTP server ready at http://127.0.0.1:' + NORMAL_HTTP_PORT + ' (默认合成模式——注入缝未设置，与 S1 行为完全一致)');
    const httpClient = makeClient(NORMAL_HTTP_PORT);
    for (const category of CATEGORIES) {
      const stratumId = 'http_' + category.id;
      const samples = [];
      for (let i = 0; i < SAMPLES_PER_STRATUM; i += 1) {
        const sample = await runHttpNormalSample(httpClient, category, i);
        samples.push(sample);
      }
      samplesByStratum[stratumId] = samples;
      stratumOrder.push(stratumId);
      log('stratum ' + stratumId + ': ' + samples.length + ' samples (http / ' + category.semanticAction + ' / normal)');
    }
  } finally {
    normalServer.server.kill('SIGTERM');
  }

  // 3) 进程内形态：故障恢复路径 × 30 提交（方法 §1：单列，不与正常路径混合）。
  {
    const stratumId = 'inproc_fault_recovery';
    const samples = [];
    for (let i = 0; i < SAMPLES_PER_STRATUM; i += 1) {
      const sample = await runInprocFaultSample(i);
      samples.push(sample);
    }
    samplesByStratum[stratumId] = samples;
    stratumOrder.push(stratumId);
    log('stratum ' + stratumId + ': ' + samples.length + ' samples (in_process / DIRECT_ANSWER / fault_recovery)');
  }

  // 4) HTTP 形态：故障恢复路径 × 30 提交（每样本独立服务器实例——注入缝为进程级单例）。
  {
    const stratumId = 'http_fault_recovery';
    const samples = [];
    for (let i = 0; i < SAMPLES_PER_STRATUM; i += 1) {
      const sample = await runHttpFaultSample(i);
      samples.push(sample);
    }
    samplesByStratum[stratumId] = samples;
    stratumOrder.push(stratumId);
    log('stratum ' + stratumId + ': ' + samples.length + ' samples (http / DIRECT_ANSWER / fault_recovery)');
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
  log('measurement window closed: ' + stratumOrder.length + ' strata, ' + Object.values(samplesByStratum).reduce((sum, samples) => sum + samples.length, 0) + ' samples, ' + durationMs + 'ms');

  // -----------------------------------------------------------------------
  // 断言（A1–A11；A12 清单两遍验证在产物写入后登记）
  // -----------------------------------------------------------------------
  const assertions = [];
  function assert(id, description, passed, actual) {
    assertions.push({ id, description, passed, actual });
    if (!passed) {
      log('ASSERTION FAILED: ' + id + ' — ' + description);
    }
  }

  const allSamples = Object.values(samplesByStratum).flat();
  const normalSamples = allSamples.filter((sample) => sample.path === 'normal');
  const faultSamples = allSamples.filter((sample) => sample.path === 'fault_recovery');
  const inprocFault = samplesByStratum.inproc_fault_recovery;
  const httpFault = samplesByStratum.http_fault_recovery;

  // A1 样本纪律（方法 §5）：16 分层齐备且每分层 ≥30 提交。
  const expectedStrata = [];
  for (const category of CATEGORIES) {
    expectedStrata.push('inproc_' + category.id);
    expectedStrata.push('http_' + category.id);
  }
  expectedStrata.push('inproc_fault_recovery');
  expectedStrata.push('http_fault_recovery');
  assert(
    'A1',
    '样本纪律（方法 §5）：16 分层全部执行且每分层 ≥ ' + SAMPLES_PER_STRATUM + ' 提交',
    stratumOrder.length === 16 &&
      expectedStrata.every((id) => stratumOrder.includes(id)) &&
      Object.values(samplesByStratum).every((samples) => samples.length >= SAMPLES_PER_STRATUM),
    {
      strata: stratumOrder.length,
      expectedStrata: expectedStrata.length,
      minSamplesPerStratum: Math.min(...Object.values(samplesByStratum).map((samples) => samples.length)),
    },
  );

  // A2 执行形态分层（方法 §2）：进程内与 HTTP 分别登记，无跨形态混合汇总。
  const formCounts = {
    in_process: Object.keys(samplesByStratum).filter((id) => id.startsWith('inproc_')).length,
    http: Object.keys(samplesByStratum).filter((id) => id.startsWith('http_')).length,
  };
  assert(
    'A2',
    '执行形态分层（方法 §2）：进程内 / HTTP 分别登记（各 8 分层：7 类别 + 1 故障恢复），不合并、不计算跨形态混合均值',
    formCounts.in_process === 8 && formCounts.http === 8 && !('all' in samplesByStratum) && !('mixed' in samplesByStratum),
    formCounts,
  );

  // A3 请求类别分层（方法 §4）：7 类语义动作各成层，策略动作逐样本一致。
  const policyFidelity = {};
  for (const category of CATEGORIES) {
    const inprocSamples = samplesByStratum['inproc_' + category.id];
    const httpSamples = samplesByStratum['http_' + category.id];
    const all = [...inprocSamples, ...httpSamples];
    policyFidelity[category.semanticAction] = {
      expected: category.expectedPolicyAction,
      match: all.filter((sample) => sample.policyAction === category.expectedPolicyAction).length,
      total: all.length,
    };
  }
  assert(
    'A3',
    '请求类别分层（方法 §4）：7 类语义动作独立登记，策略动作与类别期望逐样本一致（无混合平均值）',
    Object.values(policyFidelity).every((entry) => entry.match === entry.total),
    policyFidelity,
  );

  // A4 路径分层（方法 §1/§4）：故障恢复单列；失败语义与健康重试语义逐样本成立。
  const failureOk = faultSamples.filter(
    (sample) => (sample.failure.code === 'LLM_UNAVAILABLE' || sample.failure.status === 503) && sample.failure.retryable === true,
  ).length;
  const recoveryDone = faultSamples.filter((sample) => sample.recovery.terminal === 'done').length;
  const inprocLlmCallsOk = inprocFault.every(
    (sample) => sample.recovery.llmRequestStarted === 2 && sample.recovery.llmRequestCompleted === 1,
  );
  assert(
    'A4',
    '路径分层（方法 §1/§4）：故障恢复路径单列；每次首次尝试均失败（LLM_UNAVAILABLE / 503，retryable=true），每次重试均全链路完成；进程内形态 llm_request_started=2 / completed=1',
    failureOk === faultSamples.length &&
      recoveryDone === faultSamples.length &&
      inprocFault.length === SAMPLES_PER_STRATUM &&
      httpFault.length === SAMPLES_PER_STRATUM &&
      inprocLlmCallsOk,
    {
      faultSamples: faultSamples.length,
      failureOk,
      recoveryDone,
      inprocLlmCallsOk,
      httpFaultSamples: httpFault.length,
    },
  );

  // A5 指标完整性（方法 §1）：每样本含墙钟 / TTFB / 分块计数；STOP 类别 TTFB 为 N/A。
  const metricsComplete = normalSamples.every(
    (sample) =>
      typeof sample.wallClockMs === 'number' &&
      (sample.category === 'stop'
        ? sample.wallClockMs >= 0
        : sample.wallClockMs > 0) &&
      (sample.terminal === 'done' || sample.terminal === 'stopped') &&
      typeof sample.chunkCount === 'number' &&
      (sample.category === 'stop' ? sample.ttfbMs === null : typeof sample.ttfbMs === 'number'),
  );
  assert(
    'A5',
    '指标完整性（方法 §1）：每正常路径样本含 wallClockMs / terminal / chunkCount；TTFB 对有内容分块类别为数值，对 STOP（空语料）登记为 N/A；STOP 类别（空语料，同一网络读到达）wallClockMs 允许登记为 0.00ms（低于客户端观测分辨率，观测点注记）',
    metricsComplete && normalSamples.length === 420,
    { normalSamples: normalSamples.length, metricsComplete },
  );

  // A6 分块间隔一致性：intervals.length === max(0, chunkCount − 1)。
  const intervalsConsistent = allSamples.every((sample) => {
    const chunks = sample.path === 'fault_recovery' ? sample.recovery.chunkCount : sample.chunkCount;
    const intervals = sample.path === 'fault_recovery' ? sample.recovery.chunkIntervalsMs : sample.chunkIntervalsMs;
    return intervals.length === Math.max(0, chunks - 1);
  });
  assert('A6', '分块间隔一致性：每样本 chunkIntervalsMs.length === max(0, chunkCount − 1)', intervalsConsistent, { samplesChecked: allSamples.length });

  // A7 环境分层登记（方法 §2）：Node 锁 + OS / CPU / 内存 + 运行时依赖版本齐备。
  assert(
    'A7',
    '环境分层登记（方法 §2）：Node ' + NODE_LOCK + ' 精确锁定；OS / CPU / 内存 / Next.js / React / TypeScript 版本齐备',
    environment.node === NODE_LOCK &&
      Boolean(environment.os) &&
      Boolean(environment.cpu.model) &&
      environment.cpu.logicalProcessors > 0 &&
      environment.memory.totalBytes > 0 &&
      versions.next !== 'unknown' &&
      versions.react !== 'unknown' &&
      versions.typescript !== 'unknown',
    { environment, versions },
  );

  // A8 运行窗口登记（方法 §5）：Run ID / git HEAD / 起止时间 / 持续时长齐备。
  assert(
    'A8',
    '运行窗口登记（方法 §5）：Run ID / git HEAD / 窗口起止 / 持续时长齐备（同一窗口不切换运行时版本）',
    Boolean(RUN_ID) && Boolean(git.commit) && Boolean(startedAt) && Boolean(finishedAt) && durationMs > 0,
    { runId: RUN_ID, gitHead: git.commit, startedAt, finishedAt, durationMs },
  );

  // A9 模型分层（方法 §3）：模型维度 N/A（synthetic）；运行时无真实提供方出口（静态扫描）。
  const { hashTree } = await import('./hashes.mjs');
  const egressScan = {};
  for (const rel of ['runtime.ts', 'llm-gateway.ts', 'server-runtime.ts', 'stream.ts']) {
    const text = await readFile(path.join(repoRoot, 'src/experience', rel), 'utf8');
    egressScan[rel] = { fetchCall: /\bfetch\s*\(/.test(text), httpsEgress: /node:https?|https?:\/\//.test(text) };
  }
  const egressFree = Object.values(egressScan).every((entry) => !entry.fetchCall && !entry.httpsEgress);
  assert(
    'A9',
    '模型分层（方法 §3）：模型维度登记 N/A（synthetic gateway）；运行时代码无真实提供方出口（静态扫描 src/experience 核心模块无 fetch / https 出口）',
    egressFree,
    egressScan,
  );

  // A10 披露纪律（方法 §6）：披露声明齐备；无统计阈值宣称（PB-03 / PD-08）。
  const statsObjects = JSON.stringify(
    Object.entries(samplesByStratum).map(([id, samples]) => (id.includes('fault') ? faultStratumStats(samples) : stratumStats(samples))),
  );
  assert(
    'A10',
    '披露纪律（方法 §6）：汇总含披露声明（参考值不构成指标宣称）；无统计阈值键 / 无“达标”宣称（PB-03 / PD-08）',
    Boolean(DISCLOSURE) && !/threshold/i.test(statsObjects) && !/达标|meets threshold/i.test(statsObjects),
    { disclosurePresent: Boolean(DISCLOSURE) },
  );

  // A11 内容保真（ADR-0002 §3）：全部样本流内容逐字节等于合成语料。
  const contentOk = allSamples.filter((sample) =>
    sample.path === 'fault_recovery' ? sample.recovery.contentMatchFixture : sample.contentMatchFixture,
  ).length;
  assert(
    'A11',
    '内容保真（ADR-0002 §3 合成数据边界）：全部 ' + allSamples.length + ' 样本流内容逐字节等于对应语义动作合成语料（STOP 为空语料）',
    contentOk === allSamples.length,
    { contentMatch: contentOk, total: allSamples.length },
  );

  // -----------------------------------------------------------------------
  // 产物：traces / cases / run-metadata / summary / SHA256SUMS / 审阅包
  // -----------------------------------------------------------------------
  const strataStats = {};
  for (const stratumId of stratumOrder) {
    const samples = samplesByStratum[stratumId];
    const isFault = stratumId.includes('fault');
    strataStats[stratumId] = isFault ? faultStratumStats(samples) : stratumStats(samples);
    const trace = new TraceWriter(tracesDir, stratumId);
    const meta = isFault
      ? { form: samples[0].form, category: samples[0].category, path: samples[0].path, method: METHOD_ID + ' v' + METHOD_VERSION, sampleTarget: SAMPLES_PER_STRATUM }
      : { form: samples[0].form, category: samples[0].category, semanticAction: samples[0].semanticAction, path: samples[0].path, method: METHOD_ID + ' v' + METHOD_VERSION, sampleTarget: SAMPLES_PER_STRATUM };
    await trace.start(meta);
    for (const sample of samples) {
      await trace.emit('latency_sample', sample);
    }
    await trace.complete({ sampleCount: samples.length });
    log('trace written: traces/' + stratumId + '.jsonl (' + samples.length + ' samples)');
  }

  const caseRecords = [];
  for (const category of CATEGORIES) {
    caseRecords.push(buildNormalCase('inproc_' + category.id, '进程内证据形态（in_process）', category, samplesByStratum['inproc_' + category.id]));
    caseRecords.push(buildNormalCase('http_' + category.id, 'HTTP 形态（Next.js 路由端到端）', category, samplesByStratum['http_' + category.id]));
  }
  caseRecords.push(buildFaultCase('inproc_fault_recovery', 'in_process', '进程内证据形态（in_process）', inprocFault));
  caseRecords.push(buildFaultCase('http_fault_recovery', 'http', 'HTTP 形态（Next.js 路由端到端）', httpFault));
  for (const record of caseRecords) {
    const { filePath } = await writeCaseRecord(casesDir, record);
    log('case record written: ' + path.relative(repoRoot, filePath) + ' [' + record.result + ']');
  }
  const allCasesPass = caseRecords.every((record) => record.result === 'PASS');

  const runtimeFileHashes = {};
  for (const entry of await hashTree(path.join(repoRoot, 'src/experience'))) {
    runtimeFileHashes[entry.path] = entry.hash;
  }

  const achievedCounts = {};
  for (const stratumId of stratumOrder) {
    achievedCounts[stratumId] = samplesByStratum[stratumId].length;
  }

  const runMetadata = {
    runId: RUN_ID,
    recordedAt: startedAt,
    executor: {
      executedBy: '工程负责人角色（代理，Codex）',
      independentEvaluator: '独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）',
    },
    obligation: 'OBL-02 延迟测量执行（G5 第 9 项 DEFERRED 遗留条件的执行履行；decision-register 后续切片义务跟踪表 OBL-02）',
    authorization: 'OBL-02-LATENCY-METHOD-01 v1.0.0（产品负责人 2026-10-09 按 E3 批准；批准范围仅测量方法——分层与样本窗口纪律，不含统计阈值）',
    method: {
      id: METHOD_ID,
      version: METHOD_VERSION,
      status: 'APPROVED',
      approver: '产品负责人（用户本人，PD-15）',
      approvedAt: '2026-10-09',
      source: 'docs/product/baseline/obl-02-latency-measurement-method-v1.md',
    },
    window: {
      startedAt,
      finishedAt,
      durationMs,
      rule: '方法 §5：连续执行窗口（单次证据运行内的连续提交序列）；同一窗口内不切换运行时版本（typecheck / build / 测量执行同一 git HEAD）',
    },
    code: {
      gitHead: git.commit,
      workTreeClean: git.workTreeClean,
      uncommittedEntries: git.uncommittedEntries,
      typecheckExitCode: typecheck.code,
      buildExitCode: build.code,
      runtimeFiles: runtimeFileHashes,
    },
    environment: {
      ...environment,
      ...versions,
      note: '方法 §2：平台登记 OS / CPU / 内存；证据运行仅使用合成数据（ADR-0002 §3）；运行时 / 依赖 / 硬件变更须重新开窗（方法 §5）',
    },
    model: {
      dimension: 'N/A',
      reason: '方法 §3：当前仅合成网关（SyntheticLlmGateway）——模型维度登记为 N/A（synthetic）；真实提供方接入须另经产品决策与隐私六要素批准，接入后按提供方 / 模型标识 / 模型版本分层（跨模型评测责任链由角色 3 与角色 5 共签）',
    },
    executionForms: [
      { form: 'in_process', description: '进程内证据形态：执行器直接构造 ExperienceRuntime（加载已提交 .ts 源字节）；事件经内存汇观测' },
      { form: 'http', description: 'HTTP 形态：Next.js 生产服务器路由端到端（next start；POST /api/experience/{experienceId}/event，application/x-ndjson）' },
    ],
    requestCategories: CATEGORIES.map((category) => ({
      semanticAction: category.semanticAction,
      expectedPolicyAction: category.expectedPolicyAction,
      measuredInput: category.rawInput,
      intentInput: category.intentInput,
      setupPath: category.setupSubmission
        ? '启动链 + 一次 ' + category.setupSubmission.semanticAction + ' 预提交（建立合法状态）'
        : '启动链（意图输入即类别意图）后直接测量',
      forms: ['in_process', 'http'],
      samplesPerForm: SAMPLES_PER_STRATUM,
    })),
    paths: [
      { path: 'normal', description: '正常路径（方法 §4 路径维度之一）' },
      { path: 'fault_recovery', description: '方法 §1/§4：故障恢复路径单列（LLM_UNAVAILABLE → 健康重试完成），不与正常路径混合；代表类别 DIRECT_ANSWER（首个探索动作）' },
    ],
    sampleDiscipline: {
      rule: '方法 §5：每类别每形态 ≥ 30 次提交方可计算参考统计量；低于该量仅登记原始值。样本量为方法学建议，非验收阈值',
      targetPerStratum: SAMPLES_PER_STRATUM,
      achieved: achievedCounts,
      rawValuesRegistered: true,
      dataSource: '方法 §5：证据执行器 trace 时间戳（traces/<stratum>.jsonl，每样本一条 latency_sample，含 recordedAt ISO-8601）；HTTP 形态另经服务端事件汇（正常路径：logs/http-normal-events.jsonl；故障恢复：logs/fault-http-<n>-events.jsonl 每样本独立）',
    },
    observationPoint: '进程内形态：流事件 yield 时刻（performance.now()）；HTTP 形态：NDJSON 行解析时刻（客户端观测）。分块间隔受事件循环与网络缓冲分辨率限制，登记为观测值而非提供方内部耗时',
    strata: Object.fromEntries(
      stratumOrder.map((stratumId) => [
        stratumId,
        {
          form: samplesByStratum[stratumId][0].form,
          category: samplesByStratum[stratumId][0].category,
          path: samplesByStratum[stratumId][0].path,
          sampleCount: samplesByStratum[stratumId].length,
          trace: 'traces/' + stratumId + '.jsonl',
          case: 'cases/' + ('OBL02-LATENCY-0001_' + stratumId.toUpperCase()).replace(/[^A-Za-z0-9._-]+/g, '_') + '.json',
        },
      ]),
    ),
    disclosure: DISCLOSURE,
    vocabularyNote: VOCABULARY_NOTE,
  };

  const summary = {
    runId: RUN_ID,
    method: { id: METHOD_ID, version: METHOD_VERSION, source: 'docs/product/baseline/obl-02-latency-measurement-method-v1.md' },
    window: { startedAt, finishedAt, durationMs },
    environment: { ...environment, ...versions },
    strata: strataStats,
    totals: {
      strata: stratumOrder.length,
      samples: allSamples.length,
      normalPathSamples: normalSamples.length,
      faultRecoverySamples: faultSamples.length,
      forms: 2,
      requestCategories: 7,
      paths: 2,
    },
    cases: {
      total: caseRecords.length,
      pass: caseRecords.filter((record) => record.result === 'PASS').length,
      fail: caseRecords.filter((record) => record.result === 'FAIL').length,
    },
    assertions: assertions.map(({ id, description, passed }) => ({ id, description, passed })),
    disclosure: DISCLOSURE,
    vocabularyNote: VOCABULARY_NOTE,
  };

  await writeFile(path.join(runDir, 'run-metadata.json'), JSON.stringify(runMetadata, null, 2) + '\n', 'utf8');
  await writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  log('run-metadata.json + summary.json written (intermediate; assertions A1–A' + assertions.length + ')');

  // A12 证据清单：SHA256SUMS 两遍（写入 → 独立重算）。
  await writeSha256Sums(runDir);
  const manifestCheck = await verifySha256Sums(path.join(runDir, 'SHA256SUMS'), runDir);
  assert('A12', '证据清单 SHA256SUMS 已产出且独立重算全部一致（两遍：写入 → 独立重算）', manifestCheck.failed.length === 0, {
    verified: manifestCheck.verified,
    failed: manifestCheck.failed,
  });

  // 汇总刷新：携带全部断言（A1–A12）；清单再生成以匹配最终落盘产物。
  const allAssertionsPass = assertions.every((entry) => entry.passed);
  const allPassed = allAssertionsPass && allCasesPass;
  const exitCode = allPassed ? 0 : 1;
  summary.assertions = assertions.map(({ id, description, passed }) => ({ id, description, passed }));
  summary.allAssertionsPass = allAssertionsPass;
  summary.allCasesPass = allCasesPass;
  summary.allPassed = allPassed;
  summary.exitCode = exitCode;
  await writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  await writeFile(path.join(runDir, 'run-metadata.json'), JSON.stringify(runMetadata, null, 2) + '\n', 'utf8');
  await writeSha256Sums(runDir);

  // 独立评测人审阅包（staged）。
  const stratumTable = stratumOrder
    .map((stratumId) => {
      const stats = strataStats[stratumId];
      const samples = samplesByStratum[stratumId];
      const wall = stats.wallClockMs || {};
      return (
        '| ' +
        stratumId +
        ' | ' +
        samples[0].form +
        ' | ' +
        samples[0].category +
        ' | ' +
        samples[0].path +
        ' | ' +
        stats.sampleCount +
        ' | ' +
        (wall.meanMs !== undefined ? wall.meanMs : 'n/a') +
        ' | ' +
        (wall.p95Ms !== undefined ? wall.p95Ms : 'n/a') +
        ' |'
      );
    })
    .join('\n');
  const reviewReadme =
    '# OBL02-LATENCY-0001 — 独立评测人审阅包（staged，待审阅与否决）\n' +
    '\n' +
    '运行：OBL02-LATENCY-0001（OBL-02 延迟测量执行；方法 OBL-02-LATENCY-METHOD-01 v1.0.0，产品负责人 2026-10-09 按 E3 批准）\n' +
    '日期：' + finishedAt + '\n' +
    '执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）\n' +
    'git HEAD：' + git.commit + '（工作树' + (git.workTreeClean ? '干净' : '含未提交变更：' + git.uncommittedEntries.join(', ')) + '）\n' +
    '\n' +
    '## 结果\n' +
    '\n' +
    '- 分层：16（2 执行形态 × 7 请求类别正常路径 + 2 故障恢复分层）\n' +
    '- 样本：' + allSamples.length + ' 提交（每分层 ' + SAMPLES_PER_STRATUM + '；方法 §5 样本纪律满足，可计算参考统计量）\n' +
    '- 案例：' + summary.cases.pass + '/' + summary.cases.total + ' PASS\n' +
    '- 断言：' + assertions.filter((entry) => entry.passed).length + '/' + assertions.length + ' 通过（A1–A12）\n' +
    '- 退出码：' + exitCode + '（只表示本运行中的断言通过；不设置 G5 或任何产品 Gate 状态为 PASS）\n' +
    '\n' +
    '## 分层汇总（参考统计量——不构成指标宣称，方法 §6）\n' +
    '\n' +
    '| 分层 | 形态 | 类别 | 路径 | 样本数 | 墙钟均值 ms | 墙钟 p95 ms |\n' +
    '|---|---|---|---|---|---|---|\n' +
    stratumTable +
    '\n' +
    '\n' +
    '## G5 第 9 项（延迟结果）裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）\n' +
    '\n' +
    '| 事项 | 本运行状态 | 评测人裁决 | 理由 |\n' +
    '|---|---|---|---|\n' +
    '| 测量方法定义并经批准 | OBL-02-LATENCY-METHOD-01 v1.0.0 APPROVED（2026-10-09） | 待裁决 | |\n' +
    '| 测量执行（本运行） | ' + allSamples.length + ' 提交 / 16 分层；原始值 + 参考统计量已登记 | 待裁决 | |\n' +
    '| 统计阈值 | 未设（PB-03 / PD-08：无真实基线不编造阈值） | 待裁决 | |\n' +
    '| 指标宣称 | 无（仅参考值；方法 §6 指标宣称条件未触发） | 待裁决 | |\n' +
    '| 样本纪律（方法 §5） | 每分层 ' + SAMPLES_PER_STRATUM + ' 提交（≥30）；窗口 Run ID / git HEAD / 起止已登记 | 待裁决 | |\n' +
    '\n' +
    '## 审阅清单（不得只看汇总）\n' +
    '\n' +
    '1. cases/ —— 16 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据\n' +
    '2. traces/ —— 16 份 JSONL 轨迹（每分层 trace_started → ' + SAMPLES_PER_STRATUM + ' 条 latency_sample → trace_completed；每样本含 recordedAt ISO-8601 与逐项测量值）\n' +
    '3. logs/ —— HTTP 形态服务端事件汇（正常路径 http-normal-events.jsonl；故障恢复 fault-http-<n>-events.jsonl 每样本独立）\n' +
    '4. run-metadata.json —— 方法 §2–§6 分层登记（环境 / 模型 N/A / 类别 / 路径 / 样本纪律 / 观测点 / 披露）\n' +
    '5. summary.json —— 参考统计量（均值 / p50 / p95 / min / max）+ 断言 A1–A12\n' +
    '6. SHA256SUMS —— 证据包清单（可独立重算验证）\n' +
    '\n' +
    '## 披露声明（方法 §6）\n' +
    '\n' +
    DISCLOSURE +
    '\n' +
    '\n' +
    '## 词汇表纪律（E5 §2）\n' +
    '\n' +
    VOCABULARY_NOTE +
    '\n';
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');
  log('review package written: review/README.md');

  // 控制台结论（不构成任何 Gate 判定）。
  log('===== ' + RUN_ID + ' 完成 =====');
  log('分层：' + stratumOrder.length + '（进程内 × 7 类别 + HTTP × 7 类别 + 故障恢复 × 2 形态）');
  log('样本：' + allSamples.length + ' 提交（每分层 ' + SAMPLES_PER_STRATUM + '）');
  log('案例：' + summary.cases.pass + '/' + summary.cases.total + ' PASS');
  log('断言：' + assertions.filter((entry) => entry.passed).length + '/' + assertions.length + ' 通过');
  log('退出码：' + exitCode + '（只表示本运行断言通过；不设置任何 Gate 状态为 PASS）');
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('FATAL: ' + (error && error.stack ? error.stack : String(error)));
  process.exit(1);
});
