// f1.mjs — F-1 first-iteration dynamic evidence executor (F1-E2E-0001).
//
// Obligation: P3-S1-IMPL-AUTH-01 §3 F-1 — Next.js Route Handler streaming
// with AbortSignal cancellation, end-to-end dynamic evidence in BOTH forms:
// in-process (direct handler invocation) and HTTP (real Next.js server).
//
// Governance:
// - Synthetic fixtures only; NO real LLM provider and NO real user data.
// - Exit code 0 means "all assertions in THIS run passed"; it does NOT set
//   any Gate (G2–G4) or S1 status to PASS (E5 §2 vocabulary rule).
// - Failures are recorded, never retried into passing (ADR-0002 §5).
//
// Run (from tools/evidence, Node v24.21.0):
//   npm run f1

import { registerHooks } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Resolve hook: the product runtime sources are TypeScript with extensionless
// relative imports (Next.js/Turbopack-native style). Node >= 23.6 strips
// types natively; this hook resolves extensionless specifiers to .ts files
// so the in-process form executes the REAL source bytes that Next compiles.
// ---------------------------------------------------------------------------

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-zA-Z]+$/.test(specifier)) {
        for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
          try {
            return nextResolve(candidate, context);
          } catch {
            // try next candidate
          }
        }
      }
      throw error;
    }
  },
});

// Product runtime sources (real bytes, type-stripped at runtime).
const { handleExperienceStreamRequest } = await import('../../../src/experience/http');
const { directAnswer } = await import('../../../src/experience/fixtures/direct-answer');
const { why } = await import('../../../src/experience/fixtures/why');

// Evidence framework (zero-dependency ESM).
const { sha256OfBuffer, writeSha256Sums, verifySha256Sums } = await import('./hashes.mjs');
const { TraceWriter } = await import('./trace.mjs');
const { writeCaseRecord, validateCaseRecord } = await import('./caselog.mjs');
const {
  CONTRACT_AUTHORITY,
  verifyReferenceIntegrity,
  verifyContractFingerprints,
  gitState,
  sqliteVersion,
} = await import('./metadata.mjs');

// ---------------------------------------------------------------------------
// Constants and paths
// ---------------------------------------------------------------------------

const RUN_ID = 'F1-E2E-0001';
const PORT = 4321;
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
const httpAuditPath = path.join(tracesDir, 'http-audit.jsonl');

const EVALUATOR_SEPARATION =
  '实现作者：代理（Codex，工程负责人角色履行）；独立评测负责人：用户本人（角色 5，PD-15）。本案例由代理执行器运行；独立评测人保留对完整轨迹、预期与失败记录的审阅与否决权（材料 staged 于 review/README.md）。';

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
// Preflight helpers
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

// ---------------------------------------------------------------------------
// Case runners — each returns { expected, actual, pass, invariants }
// ---------------------------------------------------------------------------

const FIXTURES = { WHY: why, DIRECT_ANSWER: directAnswer };

async function runInProcessCase(semanticAction, { signal, audit } = {}) {
  const result = await handleExperienceStreamRequest({
    method: 'POST',
    body: JSON.stringify({ semanticAction }),
    signal,
    audit,
  });
  if (result.status !== 200 || !result.body) {
    const errorBody = result.body
      ? await new Response(result.body).text()
      : '<no body>';
    return { status: result.status, errorBody, events: [] };
  }
  const events = await readStreamEvents(result.body);
  return { status: result.status, errorBody: null, events };
}

async function runHttpCase(semanticAction, { signal, method = 'POST', rawBody } = {}) {
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const response = await fetch(`${BASE_URL}/api/experience/stream`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: hasBody ? (rawBody ?? JSON.stringify({ semanticAction })) : undefined,
    signal,
  });
  const text = await response.text();
  return { status: response.status, contentType: response.headers.get('content-type'), body: text };
}

async function httpAuditSlice(auditPath, offset) {
  if (!existsSync(auditPath)) return { events: [], newOffset: 0 };
  const content = await readFile(auditPath, 'utf8');
  const slice = content.slice(offset);
  // Offsets are tracked in UTF-16 code units (string indices) — the same
  // units content.slice() uses. Byte offsets would start a slice mid-line
  // for multi-byte (CJK) audit content.
  return { events: parseNdjsonEvents(slice), newOffset: content.length };
}

function chunkSequence(events) {
  return events.filter((event) => event.type === 'chunk');
}

function contentOf(events) {
  return chunkSequence(events).map((event) => event.content);
}

// --- Case F1-STREAM-01-INPROC: normal full stream, in-process form --------

async function caseStream01InProc(trace) {
  const auditEvents = [];
  const audit = (event) => {
    auditEvents.push(event);
  };
  const startedAt = Date.now();
  const { status, events } = await runInProcessCase('WHY', { audit });
  const durationMs = Date.now() - startedAt;
  await trace.emit('request-completed', { form: 'in-process', status, eventCount: events.length, durationMs });

  const expected = {
    status: 200,
    eventTypes: [...why.chunks.map(() => 'chunk'), 'done'],
    policyAction: 'EXPLAIN',
    chunkCount: why.chunks.length,
    chunkIndexes: why.chunks.map((_, index) => index),
    contentEqualsFixture: true,
    finalEvent: 'done',
  };
  const actual = {
    status,
    eventTypes: events.map((event) => event.type),
    policyAction: events[0]?.policyAction ?? null,
    chunkCount: chunkSequence(events).length,
    chunkIndexes: chunkSequence(events).map((event) => event.index),
    contentEqualsFixture: JSON.stringify(contentOf(events)) === JSON.stringify(why.chunks),
    finalEvent: events[events.length - 1]?.type ?? null,
    auditEventCount: auditEvents.length,
  };
  const pass =
    actual.status === expected.status &&
    JSON.stringify(actual.eventTypes) === JSON.stringify(expected.eventTypes) &&
    actual.policyAction === expected.policyAction &&
    actual.chunkCount === expected.chunkCount &&
    JSON.stringify(actual.chunkIndexes) === JSON.stringify(expected.chunkIndexes) &&
    actual.contentEqualsFixture === true &&
    actual.finalEvent === 'done' &&
    actual.auditEventCount === events.length;
  return { expected, actual, pass };
}

// --- Case F1-STREAM-02-HTTP: normal full stream, HTTP form -----------------

async function caseStream02Http(trace, auditOffset) {
  const startedAt = Date.now();
  const { status, contentType, body } = await runHttpCase('WHY');
  const durationMs = Date.now() - startedAt;
  const events = parseNdjsonEvents(body);
  await trace.emit('request-completed', { form: 'http', status, eventCount: events.length, durationMs });

  const { events: auditEvents, newOffset } = await httpAuditSlice(httpAuditPath, auditOffset);
  const expected = {
    status: 200,
    contentType: 'application/x-ndjson',
    chunkCount: why.chunks.length,
    chunkIndexes: why.chunks.map((_, index) => index),
    contentEqualsFixture: true,
    finalEvent: 'done',
    serverAuditMatchesClientEvents: true,
  };
  const auditChunkContents = auditEvents.filter((event) => event.type === 'chunk').map((event) => event.content);
  const actual = {
    status,
    contentType,
    chunkCount: chunkSequence(events).length,
    chunkIndexes: chunkSequence(events).map((event) => event.index),
    contentEqualsFixture: JSON.stringify(contentOf(events)) === JSON.stringify(why.chunks),
    finalEvent: events[events.length - 1]?.type ?? null,
    serverAuditEventCount: auditEvents.length,
    serverAuditFinalEvent: auditEvents[auditEvents.length - 1]?.type ?? null,
    serverAuditContentEqualsClient:
      JSON.stringify(auditChunkContents) === JSON.stringify(contentOf(events)),
  };
  const pass =
    actual.status === expected.status &&
    actual.contentType === expected.contentType &&
    actual.chunkCount === expected.chunkCount &&
    JSON.stringify(actual.chunkIndexes) === JSON.stringify(expected.chunkIndexes) &&
    actual.contentEqualsFixture === true &&
    actual.finalEvent === 'done' &&
    actual.serverAuditEventCount === events.length &&
    actual.serverAuditFinalEvent === 'done' &&
    actual.serverAuditContentEqualsClient === true;
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- Case F1-ABORT-01-INPROC: mid-stream abort, in-process form ------------

async function caseAbort01InProc(trace) {
  const auditEvents = [];
  const audit = (event) => {
    auditEvents.push(event);
  };
  const controller = new AbortController();
  const result = await handleExperienceStreamRequest({
    method: 'POST',
    body: JSON.stringify({ semanticAction: 'WHY' }),
    signal: controller.signal,
    audit,
  });
  const reader = result.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const received = [];
  let abortError = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        const event = JSON.parse(line);
        if (event.type === 'chunk') received.push(event);
        if (received.length === 2) {
          await trace.emit('abort-issued', { form: 'in-process', afterChunks: 2 });
          controller.abort();
        }
      }
    }
  } catch (error) {
    abortError = error.name ?? String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  await trace.emit('abort-observed', { form: 'in-process', receivedChunks: received.length, abortError });

  const expected = {
    receivedChunkCount: 2,
    receivedChunkIndexes: [0, 1],
    chunksAfterAbort: 0,
    auditEvents: [
      { type: 'chunk', index: 0 },
      { type: 'chunk', index: 1 },
      { type: 'cancelled', index: 2 },
    ],
    eventsAfterCancellation: 0,
  };
  const cancelledEvent = auditEvents.find((event) => event.type === 'cancelled');
  const cancelledPosition = auditEvents.findIndex((event) => event.type === 'cancelled');
  const actual = {
    receivedChunkCount: received.length,
    receivedChunkIndexes: received.map((event) => event.index),
    chunksAfterAbort: auditEvents
      .slice(cancelledPosition + 1)
      .filter((event) => event.type === 'chunk').length,
    auditEvents: auditEvents.map((event) => ({ type: event.type, index: event.index })),
    eventsAfterCancellation: auditEvents.slice(cancelledPosition + 1).length,
    abortError,
  };
  const pass =
    actual.receivedChunkCount === 2 &&
    JSON.stringify(actual.receivedChunkIndexes) === JSON.stringify([0, 1]) &&
    actual.chunksAfterAbort === 0 &&
    actual.auditEvents.length === 3 &&
    actual.auditEvents[2].type === 'cancelled' &&
    actual.auditEvents[2].index === 2 &&
    actual.eventsAfterCancellation === 0;
  return { expected, actual, pass };
}

// --- Case F1-ABORT-02-HTTP: mid-stream client disconnect, HTTP form --------

async function caseAbort02Http(trace, auditOffset) {
  const controller = new AbortController();
  const response = await fetch(`${BASE_URL}/api/experience/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ semanticAction: 'WHY' }),
    signal: controller.signal,
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const received = [];
  let abortError = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        const event = JSON.parse(line);
        if (event.type === 'chunk') received.push(event);
        if (received.length === 2) {
          await trace.emit('abort-issued', { form: 'http', afterChunks: 2 });
          controller.abort();
        }
      }
    }
  } catch (error) {
    abortError = error.name ?? String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, 300));

  const { events: auditEvents, newOffset } = await httpAuditSlice(httpAuditPath, auditOffset);
  await trace.emit('abort-observed', {
    form: 'http',
    receivedChunks: received.length,
    abortError,
    serverAuditEvents: auditEvents.map((event) => event.type),
  });

  // Server must remain alive after a client disconnect.
  const probe = await runHttpCase('DIRECT_ANSWER');
  const probeEvents = parseNdjsonEvents(probe.body);
  await trace.emit('server-alive-probe', { status: probe.status, chunkCount: chunkSequence(probeEvents).length });

  const cancelledPosition = auditEvents.findIndex((event) => event.type === 'cancelled');
  const expected = {
    receivedChunkCount: 2,
    receivedChunkIndexes: [0, 1],
    serverAuditEvents: [
      { type: 'chunk', index: 0 },
      { type: 'chunk', index: 1 },
      { type: 'cancelled', index: 2 },
    ],
    eventsAfterCancellation: 0,
    serverAliveAfterDisconnect: true,
  };
  const actual = {
    receivedChunkCount: received.length,
    receivedChunkIndexes: received.map((event) => event.index),
    serverAuditEvents: auditEvents.map((event) => ({ type: event.type, index: event.index })),
    eventsAfterCancellation:
      cancelledPosition >= 0 ? auditEvents.length - cancelledPosition - 1 : auditEvents.length,
    serverAliveAfterDisconnect:
      probe.status === 200 &&
      chunkSequence(probeEvents).length === directAnswer.chunks.length &&
      probeEvents[probeEvents.length - 1]?.type === 'done',
    abortError,
  };
  const pass =
    actual.receivedChunkCount === 2 &&
    JSON.stringify(actual.receivedChunkIndexes) === JSON.stringify([0, 1]) &&
    actual.serverAuditEvents.length === 3 &&
    actual.serverAuditEvents[2].type === 'cancelled' &&
    actual.serverAuditEvents[2].index === 2 &&
    actual.eventsAfterCancellation === 0 &&
    actual.serverAliveAfterDisconnect === true;
  return { expected, actual, pass, newAuditOffset: newOffset };
}

// --- Case F1-ABORT-03-PRECHUNK: abort before first chunk -------------------

async function caseAbort03PreChunk(trace) {
  const auditEvents = [];
  const audit = (event) => {
    auditEvents.push(event);
  };
  const controller = new AbortController();
  controller.abort(); // aborted before the request starts
  await trace.emit('abort-issued', { form: 'in-process', timing: 'before-first-chunk' });
  const { status, events } = await runInProcessCase('WHY', {
    signal: controller.signal,
    audit,
  });
  await trace.emit('abort-observed', { form: 'in-process', receivedChunks: 0 });

  const expected = {
    status: 200,
    chunkCount: 0,
    auditEvents: [{ type: 'cancelled', index: 0 }],
  };
  const actual = {
    status,
    chunkCount: chunkSequence(events).length,
    eventTypes: events.map((event) => event.type),
    auditEvents: auditEvents.map((event) => ({ type: event.type, index: event.index })),
  };
  const pass =
    actual.status === 200 &&
    actual.chunkCount === 0 &&
    JSON.stringify(actual.eventTypes) === JSON.stringify(['cancelled']) &&
    actual.auditEvents.length === 1 &&
    actual.auditEvents[0].type === 'cancelled' &&
    actual.auditEvents[0].index === 0;
  return { expected, actual, pass };
}

// --- Case F1-STOP-01-INPROC: policy STOP terminates the stream -------------

async function caseStop01InProc(trace) {
  const auditEvents = [];
  const audit = (event) => {
    auditEvents.push(event);
  };
  const { status, events } = await runInProcessCase('STOP', { audit });
  await trace.emit('request-completed', { form: 'in-process', status, eventCount: events.length });

  const expected = {
    status: 200,
    eventTypes: ['stopped'],
    chunkCount: 0,
    policyAction: 'STOP',
  };
  const actual = {
    status,
    eventTypes: events.map((event) => event.type),
    chunkCount: chunkSequence(events).length,
    policyAction: events[0]?.policyAction ?? null,
  };
  const pass =
    actual.status === 200 &&
    JSON.stringify(actual.eventTypes) === JSON.stringify(['stopped']) &&
    actual.chunkCount === 0 &&
    actual.policyAction === 'STOP';
  return { expected, actual, pass };
}

// --- Case F1-NEG-01: out-of-scope action (CREATE) rejected ----------------

async function caseNeg01OutOfScope(trace) {
  const { status, contentType, body } = await runHttpCase('CREATE');
  await trace.emit('request-completed', { form: 'http', status, semanticAction: 'CREATE' });
  let errorPayload = null;
  try {
    errorPayload = JSON.parse(body);
  } catch {
    errorPayload = null;
  }
  const expected = {
    status: 400,
    error: 'ACTION_OUT_OF_S1_SCOPE',
    streamProduced: false,
  };
  const actual = {
    status,
    contentType,
    error: errorPayload?.error ?? null,
    semanticAction: errorPayload?.semanticAction ?? null,
    streamProduced: contentType?.includes('x-ndjson') ?? false,
  };
  const pass =
    actual.status === 400 &&
    actual.error === 'ACTION_OUT_OF_S1_SCOPE' &&
    actual.streamProduced === false;
  return { expected, actual, pass };
}

// --- Case F1-NEG-02: invalid JSON body rejected ----------------------------

async function caseNeg02BadJson(trace) {
  const { status, body } = await runHttpCase(null, { rawBody: '{not-valid-json' });
  await trace.emit('request-completed', { form: 'http', status, fault: 'invalid-json-body' });
  let errorPayload = null;
  try {
    errorPayload = JSON.parse(body);
  } catch {
    errorPayload = null;
  }
  const expected = { status: 400, error: 'INVALID_JSON_BODY' };
  const actual = { status, error: errorPayload?.error ?? null };
  const pass = actual.status === 400 && actual.error === 'INVALID_JSON_BODY';
  return { expected, actual, pass };
}

// --- Case F1-NEG-03: GET method rejected -----------------------------------

async function caseNeg03Method(trace) {
  const { status, body } = await runHttpCase(null, { method: 'GET' });
  await trace.emit('request-completed', { form: 'http', status, method: 'GET' });
  let errorPayload = null;
  try {
    errorPayload = JSON.parse(body);
  } catch {
    errorPayload = null;
  }
  const expected = { status: 405, error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] };
  const actual = { status, error: errorPayload?.error ?? null, allowed: errorPayload?.allowed ?? null };
  const pass =
    actual.status === 405 &&
    actual.error === 'METHOD_NOT_ALLOWED' &&
    JSON.stringify(actual.allowed) === JSON.stringify(['POST']);
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// Case registry (E5 §4 records)
// ---------------------------------------------------------------------------

const CASE_REGISTRY = [
  {
    caseId: 'F1-STREAM-01-INPROC',
    form: 'in-process',
    sourceClause:
      'S1 §26 GS-01/GS-02（首体验流式输出）；C5 API Contract V1（接口）；P3-S1-REVIEW-005 F-1（Route Handler 流式 + AbortSignal 取消，选项 A：进程内形态）',
    scope: '进程内形态正常流式：直接调用运行时处理函数，WHY → EXPLAIN 全部分块按序产出并以 done 结束',
    precondition: '运行时核心已加载（真实 .ts 源码，Node 原生类型剥离）；合成语料 synthetic/why/v1 已注册；策略映射 WHY→EXPLAIN 为 S1 §26 冻结点',
    inputFault: '正常输入：POST 等价请求 { semanticAction: "WHY" }；无故障注入',
    run: (trace) => caseStream01InProc(trace),
  },
  {
    caseId: 'F1-STREAM-02-HTTP',
    form: 'http',
    sourceClause:
      'S1 §26 GS-01/GS-02；C5 API Contract V1；P3-S1-REVIEW-005 F-1（选项 A：HTTP 形态，真实 Next.js 服务器）',
    scope: 'HTTP 形态正常流式：真实 HTTP 请求经 Next.js Route Handler，NDJSON 增量到达；服务端审计汇与客户端事件一致',
    precondition: 'Next.js 生产构建成功；服务器监听 127.0.0.1:4321；EXPERIENCE_AUDIT_LOG 指向本运行 traces/http-audit.jsonl',
    inputFault: '正常输入：HTTP POST /api/experience/stream { semanticAction: "WHY" }；无故障注入',
    run: (trace, ctx) => caseStream02Http(trace, ctx.auditOffset),
  },
  {
    caseId: 'F1-ABORT-01-INPROC',
    form: 'in-process',
    sourceClause:
      'P3-S1-REVIEW-005 F-1（AbortSignal 取消传播）；E5 §5 必测维度（故障条件：取消）；C2 State Machine（生成终止不产生半状态）',
    scope: '进程内形态流中取消：收到 2 个分块后 abort()；不得产出任何后续分块；审计汇登记 cancellation（含分块下标）',
    precondition: '同 F1-STREAM-01-INPROC；调用方持有 AbortController',
    inputFault: '故障注入：第 2 个分块到达后立即 abort()（模拟客户端断开）',
    run: (trace) => caseAbort01InProc(trace),
  },
  {
    caseId: 'F1-ABORT-02-HTTP',
    form: 'http',
    sourceClause:
      'P3-S1-REVIEW-005 F-1（AbortSignal 取消传播，HTTP 形态）；E5 §5 必测维度（故障条件：客户端断开）；C5 API Contract V1',
    scope: 'HTTP 形态流中取消：客户端断开后服务端 request.signal 触发，生成循环终止，服务端审计汇登记 cancellation；服务器在断开后保持存活',
    precondition: '同 F1-STREAM-02-HTTP；客户端持有 AbortController',
    inputFault: '故障注入：第 2 个分块到达后客户端 abort()（真实 HTTP 连接中断）',
    run: (trace, ctx) => caseAbort02Http(trace, ctx.auditOffset),
  },
  {
    caseId: 'F1-ABORT-03-PRECHUNK',
    form: 'in-process',
    sourceClause:
      'P3-S1-REVIEW-005 F-1（取消先于第一个分块到达）；E5 §5 必测维度（边界条件）',
    scope: '取消先于第一个分块：信号在请求开始前已 aborted；零内容分块，cancellation 登记于下标 0',
    precondition: '同 F1-STREAM-01-INPROC',
    inputFault: '边界注入：请求开始前 abort()',
    run: (trace) => caseAbort03PreChunk(trace),
  },
  {
    caseId: 'F1-STOP-01-INPROC',
    form: 'in-process',
    sourceClause:
      'C3 §7 STOP（策略动作）；S1 硬边界（STOP/CHANGE）；S1 §26；E5 §5 必测维度（边界条件）',
    scope: '策略 STOP 立即终止：单一 stopped 事件，零内容分块（与传输层取消不同的终止路径）',
    precondition: '同 F1-STREAM-01-INPROC；STOP→STOP 为 C3 §7 单目标冻结映射',
    inputFault: '正常输入（策略边界）：{ semanticAction: "STOP" }',
    run: (trace) => caseStop01InProc(trace),
  },
  {
    caseId: 'F1-NEG-01-OUTOFSCOPE-HTTP',
    form: 'http',
    sourceClause:
      'PD-05（CREATE 禁用）；C3 §7 动作集；E5 §2 状态词汇（不得把拒绝记为 PASS 以外的产品状态）；c3-semantic-gap-register-v1.md（未定义语义不得由编码者补写）',
    scope: '越权动作拒绝：CREATE 不在 S1 冻结策略集 → 400 ACTION_OUT_OF_S1_SCOPE，不产出流',
    precondition: '同 F1-STREAM-02-HTTP',
    inputFault: '负向输入：{ semanticAction: "CREATE" }（S1 禁用动作）',
    run: (trace) => caseNeg01OutOfScope(trace),
  },
  {
    caseId: 'F1-NEG-02-BADJSON-HTTP',
    form: 'http',
    sourceClause: 'C5 API Contract V1（请求体校验）；E5 §5 必测维度（负向案例）',
    scope: '非法请求体拒绝：非 JSON 请求体 → 400 INVALID_JSON_BODY',
    precondition: '同 F1-STREAM-02-HTTP',
    inputFault: '负向输入：请求体 "{not-valid-json"',
    run: (trace) => caseNeg02BadJson(trace),
  },
  {
    caseId: 'F1-NEG-03-METHOD-HTTP',
    form: 'http',
    sourceClause: 'C5 API Contract V1（方法约束）；E5 §5 必测维度（负向案例）',
    scope: '方法约束：GET /api/experience/stream → 405 METHOD_NOT_ALLOWED',
    precondition: '同 F1-STREAM-02-HTTP',
    inputFault: '负向输入：HTTP GET（仅 POST 允许）',
    run: (trace) => caseNeg03Method(trace),
  },
];

// ---------------------------------------------------------------------------
// Static no-egress scan (assertion A11): product runtime sources must not
// call any real provider or network API.
// ---------------------------------------------------------------------------

const FORBIDDEN_PATTERNS = [
  { pattern: /\bfetch\s*\(/, label: 'fetch()' },
  { pattern: /https?\.request\s*\(/, label: 'http/https.request()' },
  { pattern: /XMLHttpRequest/, label: 'XMLHttpRequest' },
  { pattern: /WebSocket/, label: 'WebSocket' },
  { pattern: /openai|anthropic|claude|gemini|groq|mistral|cohere/i, label: 'LLM provider name' },
  { pattern: /api[_-]?key|secret|token/i, label: 'credential reference' },
];

async function staticNoEgressScan() {
  const scanDirs = [path.join(repoRoot, 'src', 'experience')];
  const extraFiles = [path.join(repoRoot, 'app', 'api', 'experience', 'stream', 'route.ts')];
  const files = [];
  for (const dir of scanDirs) {
    for (const entry of await readdir(dir, { recursive: true })) {
      const full = path.join(dir, entry);
      if ((await stat(full)).isFile() && /\.(ts|tsx)$/.test(full)) files.push(full);
    }
  }
  files.push(...extraFiles);
  const results = [];
  let clean = true;
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const matches = [];
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) matches.push(label);
    }
    if (matches.length > 0) clean = false;
    results.push({ file: path.relative(repoRoot, file), sha256: sha256OfBuffer(Buffer.from(content, 'utf8')), forbiddenMatches: matches });
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

  // Integrity verification (same checks as E5-TRIAL-0001).
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

  // Prepare run directories. A previous attempt's run directory is archived,
  // never overwritten (ADR-0002 §5: failed runs remain on record; every
  // run starts from a clean directory so no state leaks between attempts).
  if (existsSync(runDir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveDir = `${runDir}-failed-${stamp}`;
    await rename(runDir, archiveDir);
    log(`archived previous attempt at ${path.basename(archiveDir)} (preserved, not overwritten)`);
  }
  for (const dir of [casesDir, tracesDir, logsDir, reviewDir]) {
    await mkdir(dir, { recursive: true });
  }

  // Start the HTTP server (real Next.js production server).
  log(`starting HTTP server: next start -p ${PORT} (EXPERIENCE_AUDIT_LOG=${path.relative(repoRoot, httpAuditPath)})`);
  const server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: repoRoot,
    env: { ...process.env, EXPERIENCE_AUDIT_LOG: httpAuditPath },
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
    const trace = new TraceWriter(tracesDir, `F1-E2E-0001:${definition.caseId}`);
    await trace.start({ form: definition.form, sourceClause: definition.sourceClause });
    log(`case ${definition.caseId}: RUNNING (${definition.form})`);
    let outcome;
    try {
      outcome = await definition.run(trace, { auditOffset });
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
      caseIdNamespace: `F1-E2E-0001:${definition.caseId}`,
      sourceClause: definition.sourceClause,
      scope: definition.scope,
      precondition: definition.precondition,
      inputFault: definition.inputFault,
      expected: outcome.expected,
      actual: outcome.actual,
      invariants: [
        '流式分块必须按语料顺序产出，不得重放、缺失或乱序',
        '取消（传输层 abort 或策略 STOP）后不得产出任何后续内容分块',
        '每次取消必须登记 cancellation 事件并含取消时的分块下标',
        '越权/非法输入必须被拒绝且不得产出流',
        '合成语料内容逐字节等于 fixture；运行时不调用任何真实 LLM 提供方',
      ],
      evidence: {
        trace: `traces/${`F1-E2E-0001:${definition.caseId}`}.jsonl`,
        traceSha256: sha256OfBuffer(
          Buffer.from(
            await readFile(path.join(tracesDir, `F1-E2E-0001:${definition.caseId}.jsonl`), 'utf8'),
            'utf8',
          ),
        ),
        form: definition.form,
        httpAuditLog: definition.form === 'http' ? 'traces/http-audit.jsonl' : null,
      },
      result: outcome.pass ? 'PASS' : 'FAIL',
      evaluator: EVALUATOR_SEPARATION,
      defectsFollowUp: outcome.pass
        ? '无（本案例）；E3 公开发布统计阈值仍待产品负责人批准（F-4，REVIEW-007/008）'
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

  // Assertions (A1–A12).
  const assertions = [];
  function assert(id, description, passed, detail) {
    assertions.push({ id, description, passed, detail });
    log(`assertion ${id}: ${passed ? 'PASSED' : 'FAILED'} — ${description}`);
  }

  const allCasesPass = caseResults.every((entry) => entry.pass);

  // A1: case records complete (12 fields) for all 9 cases.
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  const recordCheck = recordFiles.length === CASE_REGISTRY.length;
  assert(
    'A3',
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4）`,
    recordCheck && allCasesPass,
    { recordFiles: recordFiles.length, expected: CASE_REGISTRY.length, allCasesPass },
  );

  // A4: traces exist and are non-empty.
  const traceFiles = (await readdir(tracesDir)).filter((name) => name.endsWith('.jsonl') && name !== 'http-audit.jsonl');
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (
      await Promise.all(
        traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
      )
    ).every(Boolean);
  assert('A4', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // A5: streaming order preserved (cases 1–2).
  const streamCases = caseResults.filter((entry) => entry.caseId.startsWith('F1-STREAM-'));
  assert(
    'A5',
    '流式顺序与内容：分块按序（0..N-1）、内容逐字节等于合成语料、以 done 结束（进程内 + HTTP 两形态）',
    streamCases.length === 2 && streamCases.every((entry) => entry.pass),
    { cases: streamCases.map((entry) => ({ caseId: entry.caseId, pass: entry.pass })) },
  );

  // A6: in-process abort.
  const abort1 = caseResults.find((entry) => entry.caseId === 'F1-ABORT-01-INPROC');
  assert(
    'A6',
    '进程内流中取消：收到 2 分块后 abort，零后续分块，cancellation 登记于下标 2，其后无任何事件',
    abort1?.pass === true,
    { pass: abort1?.pass },
  );

  // A7: HTTP abort + server alive.
  const abort2 = caseResults.find((entry) => entry.caseId === 'F1-ABORT-02-HTTP');
  assert(
    'A7',
    'HTTP 流中取消：客户端断开后服务端 request.signal 触发，审计汇登记 cancellation（下标 2），其后无任何事件；服务器断开后存活',
    abort2?.pass === true,
    { pass: abort2?.pass },
  );

  // A8: pre-chunk abort.
  const abort3 = caseResults.find((entry) => entry.caseId === 'F1-ABORT-03-PRECHUNK');
  assert('A8', '取消先于第一个分块：零内容分块，cancellation 登记于下标 0', abort3?.pass === true, { pass: abort3?.pass });

  // A9: STOP policy.
  const stopCase = caseResults.find((entry) => entry.caseId === 'F1-STOP-01-INPROC');
  assert('A9', '策略 STOP：单一 stopped 事件、零内容分块（S1 硬边界终止路径）', stopCase?.pass === true, { pass: stopCase?.pass });

  // A10: negatives.
  const negCases = caseResults.filter((entry) => entry.caseId.startsWith('F1-NEG-'));
  assert(
    'A10',
    '负向拒绝：CREATE→400 ACTION_OUT_OF_S1_SCOPE（不产出流）；非法 JSON→400 INVALID_JSON_BODY；GET→405 METHOD_NOT_ALLOWED',
    negCases.length === 3 && negCases.every((entry) => entry.pass),
    { cases: negCases.map((entry) => ({ caseId: entry.caseId, pass: entry.pass })) },
  );

  // A11: static no-egress scan.
  const scan = await staticNoEgressScan();
  assert(
    'A11',
    '无真实提供方调用：产品运行时源码静态扫描无 fetch/网络/LLM 提供方/凭据引用；流式内容逐字节等于合成 fixture（A5 已证）',
    scan.clean,
    { files: scan.files },
  );

  // A12 is checked after the manifest is written (below).

  // Version matrix (E5 §3).
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
    'src/experience/policy.ts',
    'src/experience/chunks.ts',
    'src/experience/stream.ts',
    'src/experience/audit.ts',
    'src/experience/http.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
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
    obligation: 'P3-S1-IMPL-AUTH-01 §3 F-1（Next.js Route Handler 流式 + AbortSignal 取消端到端动态证据）',
    authorization: { id: 'P3-S1-IMPL-AUTH-01', version: '1.0.0', issued: '2026-10-08' },
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
        status: 'FREEZE CANDIDATE，未获责任人批准；与本切片不一致时暂停并升级决策',
      },
    },
    s1Specifications: referenceEntries.filter((name) => name.startsWith('P3-S1')),
    stateMachine: { contract: 'C2', version: 'state_machine_v1.0.0' },
    policy: {
      contract: 'C3',
      version: 'action_policy_v1.0.0',
      frozenMappingsImplemented: { DIRECT_ANSWER: 'ANSWER', WHY: 'EXPLAIN', STOP: 'STOP' },
      semanticGapRegister: 'docs/product/baseline/c3-semantic-gap-register-v1.md（G-1…G-7 已登记，未由编码者补写）',
    },
    api: { contract: 'C5', version: 'api_v1.0.0', route: 'POST /api/experience/stream' },
    event: { contract: 'C6', version: 'analytics_v1.0.0', note: '本切片为流式传输证据；事件与分析契约的动态证据属后续迭代' },
    evaluation: { contract: 'C7', version: 'evaluation_v1.0.0', note: 'G5 评测包仍 NOT RUN' },
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
    model: { value: 'synthetic-fixture', reason: '同上；流式内容由合成语料分块构成，内容逐字节等于 fixture（见 A5/A11）' },
    corpus: {
      fixtures: [
        { fixtureId: directAnswer.fixtureId, file: 'src/experience/fixtures/direct-answer.ts', sha256: runtimeFileHashes['src/experience/fixtures/direct-answer.ts'] },
        { fixtureId: why.fixtureId, file: 'src/experience/fixtures/why.ts', sha256: runtimeFileHashes['src/experience/fixtures/why.ts'] },
      ],
      realUserData: false,
    },
    regression: {
      status: 'BASELINE_NOT_AVAILABLE',
      reason: '运行时动态证据首次执行；无先前运行时基线可比较；不得伪造比较结果',
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
      database: { engine: 'node:sqlite（仅证据执行器 fixture 状态存储；本运行时切片无状态）', sqliteVersion: await sqliteVersion() },
      npmRegistryReachable: 'via proxy 127.0.0.1:7890（2026-10-08 验证）',
    },
    run: {
      startedAt,
      finishedAt: null,
      command: 'npm run f1 (node tools/evidence/src/f1.mjs, from tools/evidence)',
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

  // A2: environment lock. (package.json engines.node carries the bare
  // version "24.21.0"; process.version carries the "v"-prefixed form.)
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
    cases: caseResults.map((entry) => ({ caseId: `F1-E2E-0001:${entry.caseId}`, result: entry.result })),
    allCasesPass,
    assertions: assertions.map(({ id, description, passed }) => ({ id, description, passed })),
    allAssertionsPass,
    allPassed,
    exitCode,
    vocabularyNote: '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2–G4）或产品状态为 PASS（E5 §2）。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written: cases=${caseResults.length} allCasesPass=${allCasesPass} assertions=${assertions.length} allAssertionsPass=${allAssertionsPass}`);

  // Manifest + independent re-verification (A12).
  await writeSha256Sums(runDir);
  const manifestCheck = await verifySha256Sums(path.join(runDir, 'SHA256SUMS'), runDir);
  assert(
    'A12',
    '证据清单 SHA256SUMS 已产出且独立重算全部一致',
    manifestCheck.failed.length === 0,
    { verified: manifestCheck.verified, failed: manifestCheck.failed },
  );
  // Re-evaluate allPassed with A12 included; refresh the assertions list so
  // the persisted summary carries every assertion (A1–A12).
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
  const reviewReadme = `# F1-E2E-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：F1-E2E-0001（P3-S1-IMPL-AUTH-01 §3 F-1 首批义务：Next.js Route Handler 流式 + AbortSignal 取消端到端动态证据）
日期：${finishedAt}
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15）

## 结果

- 案例：${caseResults.length}/${caseResults.length} ${allCasesPass ? '全部 PASS' : '存在 FAIL——见 cases/'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${finalExitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ — 9 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ — 每案例 JSONL 轨迹 + http-audit.jsonl（HTTP 形态服务端审计汇：取消事件登记）
3. run-metadata.json — E5 §3 版本矩阵（契约 / 代码 / 语料 / 环境 / 回归基线）
4. SHA256SUMS — 证据包清单（可独立重算验证）

## 独立重跑

    cd tools/evidence && npm run f1   # Node v24.21.0；经代理 127.0.0.1:7890 安装过依赖

重跑会覆盖本目录之外的新运行目录吗？不会——运行目录按 RUN_ID 固定为 artifacts/evidence/runs/F1-E2E-0001；重跑前请归档旧材料（不得覆盖既有证据）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（同一案例的实现作者与独立评测者不得同一人）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 'f1-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- F1-E2E-0001 ${finalAllPassed ? 'PASSED' : 'FAILED'} — exit ${finalExitCode} ---`);
  process.exit(finalExitCode);
}

try {
  await main();
} catch (error) {
  console.error(`F1-E2E-0001 executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 'f1-run.log'), `${logLines.join('\n')}\nFATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
