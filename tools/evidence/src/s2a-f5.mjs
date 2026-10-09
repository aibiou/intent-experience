// S2A-F5-0001 — S2a F-5 迭代动态证据执行器
// （P3-S2-IMPL-AUTH-01 v1.2.0 §2(4)/§6 授权范围：F-5——Minimal Memory，
//   依据 S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）
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
const { validateEventEnvelope } = await import('../../../src/experience/events');
const { classifyInput } = await import('../../../src/experience/classifier');
const { why } = await import('../../../src/experience/fixtures/why');
const { simulate } = await import('../../../src/experience/fixtures/simulate');
const { allFixtures } = await import('../../../src/experience/chunks');
const { SyntheticLlmGateway } = await import('../../../src/experience/llm-gateway');
const {
  MemoryStore,
  effectiveInterest,
  MEMORY_INTEREST_ANCHOR,
  MEMORY_DECAY_THRESHOLD,
  MEMORY_EXPIRE_THRESHOLD,
  MEMORY_RETENTION_MS,
} = await import('../../../src/experience/memory');

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
const RUN_ID = 'S2A-F5-0001';
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
  'F-5 范围边界（S2A-F5-SEMANTIC-FREEZE-01 §1/§2 D-01…D-05 全项选项 A）：不新增语义动作（DEEPEN / SIMPLIFY / REFRAME / SEARCH 仍属 S2b 保留禁用，授权 §5.7）；既有语义动作映射不变（policy_v1.5.0 §3 变更 1）；分类优先级层不变（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY > WHAT_IF > DIRECT_ANSWER——记忆操作识别仅在全部既有层未命中后调用，仅认领会成为 UNKNOWN 的输入，不改变优先级层）',
  '记忆域范围（policy_v1.5.0 §3 变更 2①）：仅短期记忆——跨会话主题 / 意图信号 + 用户显式纠正 / 撤回记录；长期记忆 / 偏好画像禁用，写入路径不存在（负向不变式）',
  '六类数据状态区分纪律（07 §2–§6 + §8 类型层）：记忆记录（Short-term Memory，跨会话持久——D-01 选项 A）不得与 Current State / Session State（会话结束即失效——负向不变式）混淆；类型维度（Fact / Inference / Preference）与状态维度分离',
  '信号措辞纪律（07 §4）：记忆为"最近产生过较高兴趣"信号 ≠ "用户喜欢 X"偏好——记录承载主题 / 意图信号，不承载偏好画像',
  '生命周期五阶段契约化（D-02 选项 A；state_machine_v1.4.0 §4 变更 1）：REMEMBERED（记住，创建即进入）→ IN_USE（暂时使用，经 RECALL）→ DECAYING（逐渐失效，时间衰减驱动）→ EXPIRED（到期，自动）；用户操作 CORRECT（被用户纠正：内容更正 + 纠正留痕，→REMEMBERED）与 WITHDRAW（被用户撤回：→EXPIRED + 撤回留痕 + 删除审计）；记忆域事件词表 memory_recorded / memory_corrected / memory_withdrawn / memory_expired（domain=memory，C6 §7 已预留层；衰减为内部置信度更新，不逐点发事件；检索为只读，不发事件——D-02 选项 A）',
  '写入侧过滤（07 §7 不默认长期记住清单，D-05 选项 A）：临时情绪 / 一次性兴趣 / 一次性任务 / 当前环境 / 单次拒绝 / 推测人格不得写入（命中即不记录、不发事件）',
  '作用面纪律（D-03 选项 A）：记忆仅作为 Context Builder 的 L5 相关短期记忆信号注入（07 §21 优先级链；07 §20 检索纪律——以当前意图为检索键，只取相关记录，不全量塞入）；L2 Current Intent 覆盖 L5（07 §12 不变式）；记忆检索为只读操作，不改变体验、不触发任何产品动作（07 §22——不启动新体验、不自动续行、不修改创作状态）；L6 长期记忆层在 S2 不存在（负向不变式）',
  '保留与删除（D-04 选项 A；隐私六要素 P3-S1-PRIVACY-SIX-01 要素 1/5）：默认 6 个月保留期自记录最后更新时间起算（活跃记忆不因持续使用而意外过期）；到期自动删除并登记删除审计记录（删除时间 / 记录范围 / 验证信息——删除可验证）；时间衰减采纳 07 §11 示例形态为规范参数（指数衰减：Day 0 = 0.90 → Day 3 ≈ 0.63；k = ln(0.9/0.63)/3 ≈ 0.1189/天）；兴趣衰减至阈值驱动迁移（IN_USE 且 < 0.50 → DECAYING；DECAYING 且 < 0.10 → EXPIRED）；用户再次主动探索时 interest 重新获得证据（再探索 +0.15，上限 1.0——07 §11 纪律）',
  '写入经 Runtime 单一写入者（D-05 选项 A；授权 §5.8；GS-06 / CC02 H01/H05）：记忆写入仅经 Runtime 内部写入方法；模型输出不得直接写记忆（Validator 拒绝 state_update 类提案）；用户纠正 / 撤回作为用户动作经确定性规则词表识别（WITHDRAW > CORRECT 优先级——撤回为用户主权更强信号，GS-04），经 Runtime 单一写入者执行并留痕（memory_corrected / memory_withdrawn）',
  '轴外记忆子状态机（state_machine_v1.4.0 §4 变更 1）：记忆记录为体验状态轴之外的持久对象（五分量：record_id / 内容分量（主题 + 意图信号）/ 生命周期状态 / 创建与更新时间戳 / 来源与置信度分量）；体验阶段轴不变（记忆操作不新增体验轴触发器——记忆操作经 resolveIntent 路由，不创建新 Session / Experience）',
  '版本不变式（policy_v1.5.0 §3 变更 5；S1-12 单调版本化）：记忆记录操作不改变体验状态版本链——单调版本化仅约束体验状态；记忆域经自身记录与事件日志留痕',
  '07 §10 映射冻结：OBSERVED/CANDIDATE → REMEMBERED（创建）；ACTIVE → IN_USE；DECAYING → DECAYING；EXPIRED → EXPIRED；显式 EXPLICIT 路径 S2 不存在（长期记忆禁用）',
  'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action；PD-12 同层解释顺序 WHY > WHAT_IF',
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

function shortId() {
  return Math.random().toString(16).slice(2, 10);
}

function jsonEquals(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
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
    decisionTraceSink: (traceEntry) => {
      traces.push(traceEntry);
    },
    auditSink: (event) => {
      audit.push(event);
    },
    ...(gateway ? { gateway } : {}),
  });
  return { runtime, events, traces, audit };
}

/** 标准链路：Session → 意图解析 → 体验启动（意图输入可参数化）。 */
async function setupChain(runtime, label, rawInput = '为什么') {
  const { session } = await runtime.startSession();
  const intent = await runtime.resolveIntent({
    sessionId: session.sessionId,
    rawInput,
    requestId: `req-s2a-${label}-intent-${shortId()}`,
  });
  if (!intent.ok) {
    throw new Error(`setupChain: resolveIntent failed: ${intent.error.code}`);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: `req-s2a-${label}-exp-${shortId()}`,
  });
  if (!exp.ok) {
    throw new Error(`setupChain: startExperience failed: ${exp.error.code}`);
  }
  return { session, intent: intent.intent, exp: exp.experience ?? exp };
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

/** 事件汇事件按 event_type 过滤（信封事件；流事件另有 type 字段）。 */
function eventsOf(events, type) {
  return events.filter((event) => event.event_type === type);
}

/** 记忆域事件按会话过滤（identity.session_id——信封会话归属）。 */
function memoryEventsOfSession(events, sessionId) {
  return events.filter(
    (event) => event.event_type.startsWith('memory_') && event.identity?.session_id === sessionId,
  );
}

/** 声明语义动作的体验事件提交（返回提交结果与流事件）。 */
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
  const stream = submission.ok ? await consume(submission.stream) : [];
  return { submission, stream, stateVersionBefore: state.stateVersion };
}

/** 记忆域快照（getMemory API——E5 进程内形态取证入口）。 */
function memorySnapshotOf(runtime) {
  return runtime.getMemory().memory;
}

// ---------------------------------------------------------------------------
// 证据网关（S2a F-5 进程内形态注入点——同 LlmGateway 接口）
// ---------------------------------------------------------------------------

/**
 * 捕获网关（跨会话检索可见性证据）：捕获每次 propose 的
 * request_id 与 context（Context Builder 注入面——L5 memory_signals），
 * 内容生成委托合成网关（合成数据；无真实 LLM 提供方调用）。
 */
class CapturingGateway {
  constructor(fixtures) {
    this.synthetic = new SyntheticLlmGateway(fixtures);
    this.captured = [];
  }
  async propose(request) {
    this.captured.push({ requestId: request.request_id, context: request.context });
    return this.synthetic.propose(request);
  }
}

/**
 * 越权网关（GS-06 单一写入者证据）：返回携带非空
 * state_update_proposal（含 memory_record 键——模型尝试直接写记忆）
 * 的脚本化提案，验证真实验证器与运行时拒绝路径。
 */
class MaliciousGateway {
  constructor() {
    this.captured = [];
  }
  async propose(request) {
    const proposal = {
      proposal_id: 'proposal_malicious_0001',
      content: '越权提案内容（合成证据）',
      state_update_proposal: { memory_record: { topic: '量子计算' } },
      confidence: 1,
    };
    this.captured.push({ requestId: request.request_id, proposal });
    return proposal;
  }
}

// ---------------------------------------------------------------------------
// 案例运行器（S2a F-5：Minimal Memory；全部进程内形态）
// ---------------------------------------------------------------------------

// --- CROSS-SESSION：跨会话持久化 + L5 检索注入（D-01/D-03 选项 A） -------
async function caseCrossSession(trace) {
  const gateway = new CapturingGateway(allFixtures());
  const { runtime, events } = createCaseRuntime(gateway);

  // 会话 A：WHY 探索 → STOP 完成 → 体验完成路径登记短期记忆
  // （主题 = 起源意图输入"为什么"——07 §4 跨会话主题 / 意图信号）。
  const chainA = await setupChain(runtime, 'f5cs-a', '为什么');
  const whyA = await submitRound(runtime, chainA, 'WHY', '量子计算为什么这么难？', `req-s2a-f5cs-a-why-${shortId()}`);
  const stopA = await submitRound(runtime, chainA, 'STOP', '好了', `req-s2a-f5cs-a-stop-${shortId()}`);

  const snapshotAfterA = memorySnapshotOf(runtime);
  const memoryRecorded = eventsOf(events, 'memory_recorded');
  const sessionEnded = eventsOf(events, 'session_ended');

  // 会话 B（同一 Runtime，新会话）：WHY 探索 → 生成前 Context Builder
  // 检索 L5 相关短期记忆（07 §20——以当前意图为检索键）并注入。
  const chainB = await setupChain(runtime, 'f5cs-b', '为什么');
  const whyB = await submitRound(runtime, chainB, 'WHY', '为什么量子计算这么快？', `req-s2a-f5cs-b-why-${shortId()}`);

  const lastContext = gateway.captured[gateway.captured.length - 1].context;
  const snapshotAfterB = memorySnapshotOf(runtime);
  const sessionBMemoryEvents = memoryEventsOfSession(events, chainB.session.sessionId);

  const recordA = snapshotAfterA.records[0];
  const recordB = snapshotAfterB.records[0];
  const expected = {
    chain: '会话 A：WHY 探索（"为什么"）→ STOP 完成 → 记忆登记；会话 B（新会话，同一 Runtime）：WHY 探索 → L5 检索注入生成上下文',
    sessionA: '体验完成（STOP）路径登记短期记忆——主题"为什么"，意图信号 turns=1;actions=WHY，来源 session_observation，置信度 0.7，兴趣锚点 0.90，生命周期 REMEMBERED',
    eventOrdering: 'memory_recorded 在 session_ended 之前登记（STOP 后无 continuation 硬边界——P0/CC02 H02 不受影响）',
    sessionB: '跨会话可见——同一主题 WHY 探索的生成请求 context 含 memory_signals ×1（recordId / 主题"为什么" / 生命周期 IN_USE——RECALL 经检索触发，07 §22 检索只读：不发事件、不改变体验）',
    readOnly: '会话 B 零 memory 域事件（检索为只读操作——D-02 选项 A）',
  };
  const actual = {
    sessionA: {
      sessionId: chainA.session.sessionId,
      whyOk: whyA.submission.ok,
      stopOk: stopA.submission.ok,
      stopSelectedAction: stopA.submission.ok ? stopA.submission.header.policy_decision.selected_action : stopA.submission.error.code,
      recordCount: snapshotAfterA.records.length,
      record: recordA
        ? {
            recordId: recordA.recordId,
            sessionId: recordA.sessionId,
            experienceId: recordA.experienceId,
            topic: recordA.topic,
            intentSignal: recordA.intentSignal,
            lifecycle: recordA.lifecycle,
            source: recordA.source,
            confidence: recordA.confidence,
            interestSignal: recordA.interestSignal,
            lastRecalledAt: recordA.lastRecalledAt,
          }
        : null,
    },
    eventOrdering: {
      memoryRecordedCount: memoryRecorded.length,
      memoryRecordedProperties: memoryRecorded.map((event) => ({
        topic: event.properties.topic,
        lifecycle: event.properties.lifecycle,
        record_id: event.properties.record_id,
        intent_signal: event.properties.intent_signal,
        source: event.properties.source,
        confidence: event.properties.confidence,
        reexploration: event.properties.reexploration,
      })),
      memoryRecordedBeforeSessionEnded:
        memoryRecorded.length === 1 && sessionEnded.length === 1 && memoryRecorded[0].sequence_number < sessionEnded[0].sequence_number,
    },
    sessionB: {
      sessionId: chainB.session.sessionId,
      distinctSession: chainB.session.sessionId !== chainA.session.sessionId,
      whyOk: whyB.submission.ok,
      whySelectedAction: whyB.submission.ok ? whyB.submission.header.policy_decision.selected_action : whyB.submission.error.code,
      capturedProposeCount: gateway.captured.length,
      memorySignals: lastContext?.memory_signals ?? null,
      recordAfterB: recordB
        ? {
            recordId: recordB.recordId,
            topic: recordB.topic,
            lifecycle: recordB.lifecycle,
            lastRecalledAt: recordB.lastRecalledAt,
          }
        : null,
    },
    readOnly: {
      sessionBMemoryEventCount: sessionBMemoryEvents.length,
      sessionBMemoryEvents: sessionBMemoryEvents.map((event) => event.event_type),
    },
  };
  const pass =
    whyA.submission.ok &&
    stopA.submission.ok &&
    stopA.submission.ok &&
    stopA.submission.header.policy_decision.selected_action === 'STOP' &&
    snapshotAfterA.records.length === 1 &&
    recordA.topic === '为什么' &&
    recordA.sessionId === chainA.session.sessionId &&
    recordA.experienceId === chainA.exp.experienceId &&
    recordA.intentSignal === 'turns=1;actions=WHY' &&
    recordA.lifecycle === 'REMEMBERED' &&
    recordA.source === 'session_observation' &&
    recordA.confidence === 0.7 &&
    recordA.interestSignal === MEMORY_INTEREST_ANCHOR &&
    recordA.lastRecalledAt === null &&
    memoryRecorded.length === 1 &&
    memoryRecorded[0].properties.topic === '为什么' &&
    memoryRecorded[0].properties.lifecycle === 'REMEMBERED' &&
    memoryRecorded[0].properties.record_id === recordA.recordId &&
    memoryRecorded[0].properties.intent_signal === 'turns=1;actions=WHY' &&
    memoryRecorded[0].properties.source === 'session_observation' &&
    memoryRecorded[0].properties.confidence === 0.7 &&
    memoryRecorded[0].properties.reexploration === false &&
    memoryRecorded.length === 1 &&
    sessionEnded.length === 1 &&
    memoryRecorded[0].sequence_number < sessionEnded[0].sequence_number &&
    chainB.session.sessionId !== chainA.session.sessionId &&
    whyB.submission.ok &&
    whyB.submission.header.policy_decision.selected_action === 'EXPLAIN' &&
    gateway.captured.length === 2 &&
    lastContext?.memory_signals?.length === 1 &&
    lastContext.memory_signals[0].recordId === recordA.recordId &&
    lastContext.memory_signals[0].topic === '为什么' &&
    lastContext.memory_signals[0].lifecycle === 'IN_USE' &&
    lastContext.memory_signals[0].interestSignal > 0.85 &&
    snapshotAfterB.records.length === 1 &&
    recordB.recordId === recordA.recordId &&
    recordB.lifecycle === 'IN_USE' &&
    recordB.lastRecalledAt !== null &&
    sessionBMemoryEvents.length === 0;
  return { expected, actual, pass };
}

// --- LIFECYCLE：生命周期迁移 + 规范衰减参数（D-02/D-04 选项 A） --------
async function caseLifecycle(trace) {
  const store = new MemoryStore();
  const t0 = '2026-01-01T00:00:00.000Z';

  // 记录 1（衰减路径主体）：CREATE → RECALL → DECAY → EXPIRE（衰减阈值）。
  const write = store.recordMemory({
    sessionId: 'session_synthetic_f5_lc',
    topic: '量子计算',
    intentSignal: 'turns=1;actions=WHY',
    source: 'session_observation',
    now: t0,
  });
  // 记录 2（保留期路径主体）：CREATE 后从未 RECALL——REMEMBERED 直达保留期到期。
  const retentionWrite = store.recordMemory({
    sessionId: 'session_synthetic_f5_lc',
    topic: '火星殖民',
    intentSignal: 'turns=1;actions=WHAT_IF',
    source: 'session_observation',
    now: t0,
  });

  // Day 0 / Day 3 兴趣锚点（07 §11 示例形态——规范参数）。
  const interestDay0 = effectiveInterest(write.record, t0);
  const interestDay3 = effectiveInterest(write.record, '2026-01-04T00:00:00.000Z');

  // RECALL（REMEMBERED → IN_USE）。
  const recall = store.recallMemory(write.record.recordId, t0);

  // Day 5：IN_USE 且有效兴趣 < 0.50 → DECAYING（内部置信度更新，不发事件）。
  const decayDay5 = store.applyDecay('2026-01-06T00:00:00.000Z');
  const afterDay5 = store.getSnapshot().records.find((record) => record.recordId === write.record.recordId);

  // Day 14：DECAYING 且有效兴趣 ≈ 0.170 > 0.10 ——保持 DECAYING。
  const decayDay14 = store.applyDecay('2026-01-15T00:00:00.000Z');
  const afterDay14 = store.getSnapshot().records.find((record) => record.recordId === write.record.recordId);

  // Day 19：DECAYING 且有效兴趣 < 0.10 → EXPIRED（衰减阈值到期 + 删除审计）。
  const decayDay19 = store.applyDecay('2026-01-20T00:00:00.000Z');
  const afterDay19 = store.getSnapshot().records.find((record) => record.recordId === write.record.recordId);

  // 保留期路径：Day 179 未到期（< 6 个月）；Day 180 整到期
  // （自最后更新时间起算 6 个月——隐私要素 1/5）。
  const decayDay179 = store.applyDecay('2026-06-29T00:00:00.000Z');
  const retentionDay179 = store.getSnapshot().records.find((record) => record.recordId === retentionWrite.record.recordId);
  const decayDay180 = store.applyDecay('2026-06-30T00:00:00.000Z');
  const retentionDay180 = store.getSnapshot().records.find((record) => record.recordId === retentionWrite.record.recordId);

  const expected = {
    chain: '直接 MemoryStore（时间显式控制）：CREATE(t0) → RECALL(t0) → DECAY(Day 5) → 保持 DECAYING(Day 14) → EXPIRE(Day 19，衰减阈值)；保留期路径：CREATE(t0) → 未到期(Day 179) → EXPIRE(Day 180 整，保留期)',
    anchors: 'Day 0 兴趣 = 0.90（锚点）；Day 3 ≈ 0.63（k = ln(0.9/0.63)/3——07 §11 示例形态采纳为规范参数）',
    decayThresholds: 'IN_USE 且 < 0.50 → DECAYING；DECAYING 且 < 0.10 → EXPIRED（MEMORY_DECAY_THRESHOLD / MEMORY_EXPIRE_THRESHOLD）',
    retention: '保留期 6 个月自最后更新时间起算（MEMORY_RETENTION_MS = 180 天）；到期自动删除 + 删除审计（删除时间 / 记录范围 / 验证信息）',
    events: 'DECAY 为内部置信度更新不发事件；EXPIRE 由调用方（Runtime buildLlmContext）登记 memory_expired —— 存储层 applyDecay 仅返回结果（D-02 选项 A）',
  };
  const actual = {
    create: {
      recorded: write.recorded,
      reexploration: write.recorded ? write.reexploration : null,
      record: write.recorded
        ? { recordId: write.record.recordId, topic: write.record.topic, lifecycle: write.record.lifecycle, interestSignal: write.record.interestSignal, confidence: write.record.confidence }
        : null,
      retentionRecorded: retentionWrite.recorded,
      retentionLifecycle: retentionWrite.recorded ? retentionWrite.record.lifecycle : null,
    },
    anchors: { interestDay0, interestDay3, day3Deviation: Math.abs(interestDay3 - 0.63) },
    recall: recall.ok ? { ok: true, lifecycle: recall.record.lifecycle, lastRecalledAt: recall.record.lastRecalledAt } : recall,
    day5: {
      decayed: decayDay5.decayed.map((record) => ({ recordId: record.recordId, lifecycle: record.lifecycle })),
      expired: decayDay5.expired.length,
      lifecycle: afterDay5?.lifecycle ?? null,
    },
    day14: {
      decayed: decayDay14.decayed.length,
      expired: decayDay14.expired.length,
      lifecycle: afterDay14?.lifecycle ?? null,
    },
    day19: {
      expired: decayDay19.expired.map((record) => ({ recordId: record.recordId, lifecycle: record.lifecycle, reason: record.deletionAudit?.reason })),
      lifecycle: afterDay19?.lifecycle ?? null,
      deletionAudit: afterDay19?.deletionAudit ?? null,
    },
    retentionPath: {
      day179: { expired: decayDay179.expired.length, lifecycle: retentionDay179?.lifecycle ?? null },
      day180: {
        expired: decayDay180.expired.map((record) => ({ recordId: record.recordId, lifecycle: record.lifecycle, reason: record.deletionAudit?.reason })),
        lifecycle: retentionDay180?.lifecycle ?? null,
        deletionAudit: retentionDay180?.deletionAudit ?? null,
      },
    },
    parameters: {
      anchor: MEMORY_INTEREST_ANCHOR,
      decayThreshold: MEMORY_DECAY_THRESHOLD,
      expireThreshold: MEMORY_EXPIRE_THRESHOLD,
      retentionMs: MEMORY_RETENTION_MS,
    },
  };
  const pass =
    write.recorded === true &&
    write.reexploration === false &&
    write.record.lifecycle === 'REMEMBERED' &&
    write.record.interestSignal === 0.9 &&
    write.record.confidence === 0.7 &&
    retentionWrite.recorded === true &&
    retentionWrite.record.lifecycle === 'REMEMBERED' &&
    interestDay0 === 0.9 &&
    Math.abs(interestDay3 - 0.63) < 1e-9 &&
    recall.ok === true &&
    recall.record.lifecycle === 'IN_USE' &&
    recall.record.lastRecalledAt === t0 &&
    decayDay5.decayed.length === 1 &&
    decayDay5.decayed[0].recordId === write.record.recordId &&
    decayDay5.expired.length === 0 &&
    afterDay5?.lifecycle === 'DECAYING' &&
    decayDay14.decayed.length === 0 &&
    decayDay14.expired.length === 0 &&
    afterDay14?.lifecycle === 'DECAYING' &&
    decayDay19.expired.length === 1 &&
    decayDay19.expired[0].recordId === write.record.recordId &&
    afterDay19?.lifecycle === 'EXPIRED' &&
    afterDay19?.deletionAudit?.reason === 'decay_threshold' &&
    typeof afterDay19?.deletionAudit?.deletedAt === 'string' &&
    afterDay19.deletionAudit.scope.includes(write.record.recordId) &&
    afterDay19.deletionAudit.scope.includes('量子计算') &&
    typeof afterDay19?.deletionAudit?.verification === 'string' &&
    afterDay19.deletionAudit.verification.length > 0 &&
    decayDay179.expired.length === 0 &&
    retentionDay179?.lifecycle === 'REMEMBERED' &&
    decayDay180.expired.length === 1 &&
    decayDay180.expired[0].recordId === retentionWrite.record.recordId &&
    retentionDay180?.lifecycle === 'EXPIRED' &&
    retentionDay180?.deletionAudit?.reason === 'retention_expired' &&
    retentionDay180?.deletionAudit?.scope.includes(retentionWrite.record.recordId) &&
    MEMORY_INTEREST_ANCHOR === 0.9 &&
    MEMORY_DECAY_THRESHOLD === 0.5 &&
    MEMORY_EXPIRE_THRESHOLD === 0.1 &&
    MEMORY_RETENTION_MS === 180 * 24 * 60 * 60 * 1000;
  return { expected, actual, pass };
}

// --- CORRECT-WITHDRAW：用户显式纠正 / 撤回（D-02/D-05 选项 A） ----------
async function caseCorrectWithdraw(trace) {
  const { runtime, events } = createCaseRuntime();

  // 会话 A：WHY 探索 → STOP 完成 → 记忆登记（主题"为什么"）。
  const chainA = await setupChain(runtime, 'f5cw-a', '为什么');
  await submitRound(runtime, chainA, 'WHY', '量子计算为什么这么难？', `req-s2a-f5cw-a-why-${shortId()}`);
  await submitRound(runtime, chainA, 'STOP', '好了', `req-s2a-f5cw-a-stop-${shortId()}`);
  const snapshotAfterA = memorySnapshotOf(runtime);

  // 会话 B：显式纠正（确定性词表 /记忆纠正/ ——仅认领会成为 UNKNOWN 的输入）。
  const sessionB = await runtime.startSession();
  const correctIntent = await runtime.resolveIntent({
    sessionId: sessionB.session.sessionId,
    rawInput: '记忆纠正：量子计算原理',
    requestId: `req-s2a-f5cw-b-correct-${shortId()}`,
  });
  const snapshotAfterCorrect = memorySnapshotOf(runtime);

  // 会话 C：显式撤回（07 §13"别再给我这个"）。
  const sessionC = await runtime.startSession();
  const withdrawIntent = await runtime.resolveIntent({
    sessionId: sessionC.session.sessionId,
    rawInput: '别再给我这个',
    requestId: `req-s2a-f5cw-c-withdraw-${shortId()}`,
  });
  const snapshotAfterWithdraw = memorySnapshotOf(runtime);

  // 会话 D：重复撤回 → 幂等空操作（无活跃目标——不重复留痕）。
  const sessionD = await runtime.startSession();
  const repeatWithdraw = await runtime.resolveIntent({
    sessionId: sessionD.session.sessionId,
    rawInput: '别再给我这个',
    requestId: `req-s2a-f5cw-d-repeat-${shortId()}`,
  });

  // 存储层幂等拒绝（直接 MemoryStore——WITHDRAW 已 EXPIRED 记录 → MEMORY_EXPIRED）。
  const store = new MemoryStore();
  const written = store.recordMemory({
    sessionId: 'session_synthetic_f5_cw_store',
    topic: '量子计算',
    intentSignal: 'turns=1;actions=WHY',
    source: 'session_observation',
    now: '2026-01-01T00:00:00.000Z',
  });
  store.withdrawMemory(written.record.recordId, '2026-01-02T00:00:00.000Z');
  const repeatStoreWithdraw = store.withdrawMemory(written.record.recordId, '2026-01-03T00:00:00.000Z');

  const memoryRecorded = eventsOf(events, 'memory_recorded');
  const memoryCorrected = eventsOf(events, 'memory_corrected');
  const memoryWithdrawn = eventsOf(events, 'memory_withdrawn');
  const sessionDMemoryEvents = memoryEventsOfSession(events, sessionD.session.sessionId);
  const experienceStarted = eventsOf(events, 'experience_started');
  const sessionStarted = eventsOf(events, 'session_started');

  const expected = {
    chain: '会话 A：WHY → STOP → 记忆登记；会话 B：记忆纠正（→ 纠正留痕 + 主题更正 + 回到 REMEMBERED）；会话 C：别再给我这个（→ EXPIRED + 删除审计）；会话 D：重复撤回（幂等空操作）',
    correct: 'UNKNOWN + memoryIntent=correct 经 Runtime 单一写入者执行——memory_corrected 留痕（corrected_topic / corrections=1 / previous_lifecycle）；主题更正为"量子计算原理"，来源 user_correction，置信度 0.95，兴趣重置锚点 0.90',
    withdraw: 'UNKNOWN + memoryIntent=withdraw 经 Runtime 单一写入者执行——memory_withdrawn 留痕（deletion_audit：reason=withdrawn，记录范围，验证信息）',
    idempotent: '重复撤回 → executed=false（无活跃目标——no_memory_target，不重复留痕）；存储层对已 EXPIRED 记录直接撤回 → MEMORY_EXPIRED 幂等拒绝',
    noNewExperience: '记忆操作不创建新 Session / Experience 之外的体验（体验轴不变——session_started=4，experience_started=1）',
  };
  const actual = {
    sessionA: {
      record: snapshotAfterA.records[0]
        ? { recordId: snapshotAfterA.records[0].recordId, topic: snapshotAfterA.records[0].topic, lifecycle: snapshotAfterA.records[0].lifecycle }
        : null,
    },
    correct: {
      ok: correctIntent.ok,
      semanticAction: correctIntent.ok ? correctIntent.semanticAction : correctIntent.error.code,
      action: correctIntent.ok ? correctIntent.action : null,
      memoryOperation: correctIntent.ok ? correctIntent.memoryOperation ?? null : null,
      events: memoryCorrected.map((event) => ({
        corrected_topic: event.properties.corrected_topic,
        topic: event.properties.topic,
        corrections: event.properties.corrections,
        previous_lifecycle: event.properties.previous_lifecycle,
        lifecycle: event.properties.lifecycle,
        record_id: event.properties.record_id,
      })),
      recordAfterCorrect: snapshotAfterCorrect.records[0]
        ? {
            topic: snapshotAfterCorrect.records[0].topic,
            corrections: snapshotAfterCorrect.records[0].corrections,
            source: snapshotAfterCorrect.records[0].source,
            confidence: snapshotAfterCorrect.records[0].confidence,
            interestSignal: snapshotAfterCorrect.records[0].interestSignal,
            lifecycle: snapshotAfterCorrect.records[0].lifecycle,
          }
        : null,
    },
    withdraw: {
      ok: withdrawIntent.ok,
      semanticAction: withdrawIntent.ok ? withdrawIntent.semanticAction : withdrawIntent.error.code,
      action: withdrawIntent.ok ? withdrawIntent.action : null,
      memoryOperation: withdrawIntent.ok ? withdrawIntent.memoryOperation ?? null : null,
      events: memoryWithdrawn.map((event) => ({
        record_id: event.properties.record_id,
        topic: event.properties.topic,
        previous_lifecycle: event.properties.previous_lifecycle,
        lifecycle: event.properties.lifecycle,
        deletion_audit: event.properties.deletion_audit,
      })),
      recordAfterWithdraw: snapshotAfterWithdraw.records[0]
        ? {
            lifecycle: snapshotAfterWithdraw.records[0].lifecycle,
            withdrawnAt: snapshotAfterWithdraw.records[0].withdrawnAt,
            deletionAudit: snapshotAfterWithdraw.records[0].deletionAudit,
          }
        : null,
    },
    idempotent: {
      runtimeRepeat: repeatWithdraw.ok ? repeatWithdraw.memoryOperation ?? null : repeatWithdraw.error.code,
      sessionDMemoryEventCount: sessionDMemoryEvents.length,
      storeRepeat: repeatStoreWithdraw,
    },
    noNewExperience: {
      sessionStarted: sessionStarted.length,
      experienceStarted: experienceStarted.length,
      memoryRecorded: memoryRecorded.length,
      memoryCorrected: memoryCorrected.length,
      memoryWithdrawn: memoryWithdrawn.length,
    },
  };
  const pass =
    snapshotAfterA.records.length === 1 &&
    snapshotAfterA.records[0].topic === '为什么' &&
    correctIntent.ok === true &&
    correctIntent.semanticAction === 'UNKNOWN' &&
    correctIntent.action === 'memory_operation' &&
    correctIntent.memoryOperation?.kind === 'correct' &&
    correctIntent.memoryOperation?.executed === true &&
    correctIntent.memoryOperation?.reason === null &&
    correctIntent.memoryOperation?.lifecycle === 'REMEMBERED' &&
    correctIntent.memoryOperation?.recordId === snapshotAfterA.records[0].recordId &&
    memoryCorrected.length === 1 &&
    memoryCorrected[0].properties.corrected_topic === '量子计算原理' &&
    memoryCorrected[0].properties.topic === '量子计算原理' &&
    memoryCorrected[0].properties.corrections === 1 &&
    memoryCorrected[0].properties.previous_lifecycle === 'REMEMBERED' &&
    memoryCorrected[0].properties.lifecycle === 'REMEMBERED' &&
    snapshotAfterCorrect.records.length === 1 &&
    snapshotAfterCorrect.records[0].topic === '量子计算原理' &&
    snapshotAfterCorrect.records[0].corrections === 1 &&
    snapshotAfterCorrect.records[0].source === 'user_correction' &&
    snapshotAfterCorrect.records[0].confidence === 0.95 &&
    snapshotAfterCorrect.records[0].interestSignal === MEMORY_INTEREST_ANCHOR &&
    snapshotAfterCorrect.records[0].lifecycle === 'REMEMBERED' &&
    withdrawIntent.ok === true &&
    withdrawIntent.semanticAction === 'UNKNOWN' &&
    withdrawIntent.action === 'memory_operation' &&
    withdrawIntent.memoryOperation?.kind === 'withdraw' &&
    withdrawIntent.memoryOperation?.executed === true &&
    withdrawIntent.memoryOperation?.lifecycle === 'EXPIRED' &&
    memoryWithdrawn.length === 1 &&
    memoryWithdrawn[0].properties.record_id === snapshotAfterA.records[0].recordId &&
    memoryWithdrawn[0].properties.previous_lifecycle === 'REMEMBERED' &&
    memoryWithdrawn[0].properties.lifecycle === 'EXPIRED' &&
    memoryWithdrawn[0].properties.deletion_audit?.reason === 'withdrawn' &&
    memoryWithdrawn[0].properties.deletion_audit?.scope?.includes(snapshotAfterA.records[0].recordId) &&
    memoryWithdrawn[0].properties.deletion_audit?.verification?.length > 0 &&
    snapshotAfterWithdraw.records.length === 1 &&
    snapshotAfterWithdraw.records[0].lifecycle === 'EXPIRED' &&
    snapshotAfterWithdraw.records[0].withdrawnAt !== null &&
    snapshotAfterWithdraw.records[0].deletionAudit?.reason === 'withdrawn' &&
    repeatWithdraw.ok === true &&
    repeatWithdraw.memoryOperation?.kind === 'withdraw' &&
    repeatWithdraw.memoryOperation?.executed === false &&
    repeatWithdraw.memoryOperation?.reason === 'no_memory_target' &&
    sessionDMemoryEvents.length === 0 &&
    repeatStoreWithdraw.ok === false &&
    repeatStoreWithdraw.code === 'MEMORY_EXPIRED' &&
    sessionStarted.length === 4 &&
    experienceStarted.length === 1 &&
    memoryRecorded.length === 1 &&
    memoryCorrected.length === 1 &&
    memoryWithdrawn.length === 1;
  return { expected, actual, pass };
}

// --- SESSION-SCOPED-NEG：Current State / Session State 会话结束失效（负向） ---
async function caseSessionScopedNeg(trace) {
  const { runtime, events } = createCaseRuntime();

  // 会话 A：WHY 探索 + WHAT_IF 轮（建立模拟分支状态）→ STOP 完成。
  const chain = await setupChain(runtime, 'f5ssn', '为什么');
  const why = await submitRound(runtime, chain, 'WHY', '量子计算为什么这么难？', `req-s2a-f5ssn-why-${shortId()}`);
  const whatIf = await submitRound(runtime, chain, 'WHAT_IF', '如果摩擦力为零会怎样', `req-s2a-f5ssn-whatif-${shortId()}`);
  const simulationBeforeStop = runtime.getSimulation(chain.exp.experienceId);
  const stop = await submitRound(runtime, chain, 'STOP', '好了', `req-s2a-f5ssn-stop-${shortId()}`);

  // 会话结束：模拟分支状态失效（F-4 D-04 选项 A——事件为不可变权威事实）。
  const simulationAfterStop = runtime.getSimulation(chain.exp.experienceId);
  // 对照：短期记忆跨会话存活（07 §4——F-5 D-01 选项 A）。
  const memoryAfterStop = memorySnapshotOf(runtime);

  // 已结束会话上的旧体验操作 → 拒绝（Session State 会话结束即失效——07 §3）。
  const endedState = runtime.getExperienceState(chain.exp.experienceId).state;
  const rejected = await runtime.submitExperienceEvent({
    experienceId: chain.exp.experienceId,
    sessionId: chain.session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: endedState.stateVersion,
    requestId: `req-s2a-f5ssn-rejected-${shortId()}`,
  });

  const simulationRecorded = eventsOf(events, 'simulation_recorded');

  const expected = {
    chain: '会话 A：WHY → WHAT_IF（模拟分支状态建立）→ STOP 完成 → 会话结束',
    sessionScoped: '模拟分支状态随会话结束失效（getSimulation 拒绝——F-4 D-04 选项 A）；已结束会话上的旧体验操作拒绝（INVALID_STATE_TRANSITION——07 §3 Session State 纪律）',
    contrast: '短期记忆跨会话存活（getMemory 可查——07 §4；D-01 选项 A）：同一会话内，Session State 与 Current State 会话结束即失效，Short-term Memory 不失效',
    events: 'simulation_recorded ×1（仅 WHAT_IF 轮——模拟域事件为会话内事实登记）',
  };
  const actual = {
    flow: {
      whyOk: why.submission.ok,
      whatIfOk: whatIf.submission.ok,
      whatIfSelectedAction: whatIf.submission.ok ? whatIf.submission.header.policy_decision.selected_action : whatIf.submission.error.code,
      stopOk: stop.submission.ok,
      simulationBeforeStop: simulationBeforeStop.ok
        ? { ok: true, branches: simulationBeforeStop.simulation.branches.length }
        : { ok: false, code: simulationBeforeStop.error.code },
      simulationAfterStop: simulationAfterStop.ok
        ? { ok: true }
        : { ok: false, code: simulationAfterStop.error.code },
    },
    memoryContrast: {
      recordCount: memoryAfterStop.records.length,
      record: memoryAfterStop.records[0]
        ? { topic: memoryAfterStop.records[0].topic, lifecycle: memoryAfterStop.records[0].lifecycle }
        : null,
    },
    endedSessionRejection: {
      ok: rejected.ok,
      errorCode: rejected.ok ? null : rejected.error.code,
      stateVersionUnchanged: runtime.getExperienceState(chain.exp.experienceId).state.stateVersion === endedState.stateVersion,
    },
    events: {
      simulationRecorded: simulationRecorded.length,
    },
  };
  const pass =
    why.submission.ok &&
    whatIf.submission.ok &&
    whatIf.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    stop.submission.ok &&
    simulationBeforeStop.ok === true &&
    simulationBeforeStop.simulation.branches.length === 1 &&
    simulationAfterStop.ok === false &&
    memoryAfterStop.records.length === 1 &&
    memoryAfterStop.records[0].topic === '为什么' &&
    memoryAfterStop.records[0].lifecycle === 'REMEMBERED' &&
    rejected.ok === false &&
    rejected.error.code === 'INVALID_STATE_TRANSITION' &&
    runtime.getExperienceState(chain.exp.experienceId).state.stateVersion === endedState.stateVersion &&
    simulationRecorded.length === 1;
  return { expected, actual, pass };
}

// --- LONGTERM-DISABLED：长期记忆（偏好画像）写入路径不存在（负向） ---
async function caseLongtermDisabled(trace) {
  // 静态边界：读取已提交产品源码字节（不做代码推断——只验证事实）。
  const source = await readFile(path.join(repoRoot, 'src', 'experience', 'memory.ts'), 'utf8');
  const lifecycleExportMatch = source.match(/^export type MemoryLifecycle = .+;$/m);
  const sourceExportMatch = source.match(/^export type MemorySource = .+;$/m);
  const staticFindings = {
    longTermIdentifiers: /EXPLICIT|LONG_TERM|long_term|preference[_ -]?profile/i.test(source),
    lifecycleExport: lifecycleExportMatch?.[0] ?? null,
    sourceExport: sourceExportMatch?.[0] ?? null,
  };

  // 动态：全流程后全部记录来源 / 生命周期仅在允许集合内。
  const { runtime, events } = createCaseRuntime();
  // 会话 A：WHY "为什么" → STOP → 记录 1（session_observation）。
  const chainA = await setupChain(runtime, 'f5ltd-a', '为什么');
  await submitRound(runtime, chainA, 'WHY', '量子计算为什么这么难？', `req-s2a-f5ltd-a-why-${shortId()}`);
  await submitRound(runtime, chainA, 'STOP', '好了', `req-s2a-f5ltd-a-stop-${shortId()}`);
  // 会话 B：WHY "为什么光速不变" → STOP → 记录 2（session_observation）。
  const chainB = await setupChain(runtime, 'f5ltd-b', '为什么光速不变');
  await submitRound(runtime, chainB, 'WHY', '光速为什么不变？', `req-s2a-f5ltd-b-why-${shortId()}`);
  await submitRound(runtime, chainB, 'STOP', '好了', `req-s2a-f5ltd-b-stop-${shortId()}`);
  // 会话 C：显式纠正 → 记录 2 来源更新为 user_correction。
  const sessionC = await runtime.startSession();
  await runtime.resolveIntent({
    sessionId: sessionC.session.sessionId,
    rawInput: '记忆纠正：光速恒定',
    requestId: `req-s2a-f5ltd-c-correct-${shortId()}`,
  });

  const snapshot = memorySnapshotOf(runtime);
  const dynamicFindings = {
    recordCount: snapshot.records.length,
    sources: [...new Set(snapshot.records.map((record) => record.source))].sort(),
    lifecycles: [...new Set(snapshot.records.map((record) => record.lifecycle))].sort(),
    records: snapshot.records.map((record) => ({
      topic: record.topic,
      source: record.source,
      lifecycle: record.lifecycle,
      corrections: record.corrections,
    })),
  };

  const expected = {
    static: 'src/experience/memory.ts 不含长期记忆 / 偏好画像标识符（EXPLICIT / LONG_TERM / long_term / preference profile）；MemoryLifecycle 联合恰为四态；MemorySource 联合恰为 session_observation | user_correction',
    dynamic: '全流程后全部记录 source ∈ {session_observation, user_correction}，lifecycle ∈ {REMEMBERED, IN_USE, DECAYING, EXPIRED}——长期记忆（偏好画像）写入路径不存在（负向不变式）',
  };
  const actual = { staticFindings, dynamicFindings };
  const pass =
    staticFindings.longTermIdentifiers === false &&
    staticFindings.lifecycleExport === "export type MemoryLifecycle = 'REMEMBERED' | 'IN_USE' | 'DECAYING' | 'EXPIRED';" &&
    staticFindings.sourceExport === "export type MemorySource = 'session_observation' | 'user_correction';" &&
    dynamicFindings.recordCount === 2 &&
    jsonEquals(dynamicFindings.sources, ['session_observation', 'user_correction']) &&
    dynamicFindings.lifecycles.every((lifecycle) => ['REMEMBERED', 'IN_USE', 'DECAYING', 'EXPIRED'].includes(lifecycle)) &&
    dynamicFindings.records.every((record) =>
      record.source === 'session_observation' || record.source === 'user_correction',
    ) &&
    dynamicFindings.records.every((record) =>
      ['REMEMBERED', 'IN_USE', 'DECAYING', 'EXPIRED'].includes(record.lifecycle),
    ) &&
    dynamicFindings.records.some((record) => record.topic === '光速恒定' && record.corrections === 1 && record.source === 'user_correction');
  return { expected, actual, pass };
}

// --- CURRENT-INTENT-OVERRIDE：Current Intent 覆盖 L5（D-03 选项 A） ---
async function caseCurrentIntentOverride(trace) {
  const gateway = new CapturingGateway(allFixtures());
  const { runtime } = createCaseRuntime(gateway);

  // 会话 A：WHY "为什么" → STOP → 记忆登记（主题"为什么"）。
  const chainA = await setupChain(runtime, 'f5cio-a', '为什么');
  await submitRound(runtime, chainA, 'WHY', '量子计算为什么这么难？', `req-s2a-f5cio-a-why-${shortId()}`);
  await submitRound(runtime, chainA, 'STOP', '好了', `req-s2a-f5cio-a-stop-${shortId()}`);

  // 会话 B：同一主题 WHY——记忆信号存在，Current Intent 覆盖
  // （07 §12：L2 > L5——策略动作由当前意图决定，记忆仅注入上下文）。
  const chainB = await setupChain(runtime, 'f5cio-b', '为什么');
  const whyB = await submitRound(runtime, chainB, 'WHY', '为什么量子计算这么快？', `req-s2a-f5cio-b-why-${shortId()}`);
  const whyBContext = gateway.captured[gateway.captured.length - 1].context;
  const whyBState = runtime.getExperienceState(chainB.exp.experienceId).state;
  const whyBStreamContent = contentOf(whyB.stream);

  // 会话 C：WHAT_IF——与记忆主题无 2 字窗口交集 → 检索过滤
  // （07 §20：只取相关记录，不全量塞入）。
  const chainC = await setupChain(runtime, 'f5cio-c', '如果火星殖民地会怎样');
  const whatIfC = await submitRound(runtime, chainC, 'WHAT_IF', '如果火星殖民地会怎样', `req-s2a-f5cio-c-whatif-${shortId()}`);
  const whatIfCContext = gateway.captured[gateway.captured.length - 1].context;

  const snapshot = memorySnapshotOf(runtime);

  const expected = {
    sessionB: '同一主题 WHY：memory_signals ×1（主题"为什么"）注入生成上下文；提交行为与无记忆时完全一致——selected_action=EXPLAIN，内容逐字节等于 why 语料，终态 WAITING/UNDERSTANDING v4（Current Intent 覆盖 L5——07 §12）',
    sessionC: 'WHAT_IF（无 2 字窗口交集）：memory_signals ×0（07 §20 相关性过滤——只取相关记录）',
  };
  const actual = {
    sessionB: {
      selectedAction: whyB.submission.ok ? whyB.submission.header.policy_decision.selected_action : whyB.submission.error.code,
      contentMatchesFixture: whyBStreamContent === why.chunks.join(''),
      finalStatus: whyBState.status,
      finalStage: whyBState.stage,
      finalVersion: whyBState.stateVersion,
      memorySignals: whyBContext?.memory_signals ?? null,
    },
    sessionC: {
      selectedAction: whatIfC.submission.ok ? whatIfC.submission.header.policy_decision.selected_action : whatIfC.submission.error.code,
      memorySignals: whatIfCContext?.memory_signals ?? null,
    },
    snapshot: {
      recordCount: snapshot.records.length,
      topics: snapshot.records.map((record) => record.topic),
    },
  };
  const pass =
    whyB.submission.ok &&
    whyB.submission.header.policy_decision.selected_action === 'EXPLAIN' &&
    whyBStreamContent === why.chunks.join('') &&
    whyBState.status === 'WAITING' &&
    whyBState.stage === 'UNDERSTANDING' &&
    whyBState.stateVersion === 4 &&
    whyBContext?.memory_signals?.length === 1 &&
    whyBContext.memory_signals[0].topic === '为什么' &&
    whatIfC.submission.ok &&
    whatIfC.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    whatIfCContext?.memory_signals?.length === 0 &&
    snapshot.records.length === 1 &&
    snapshot.records[0].topic === '为什么';
  return { expected, actual, pass };
}

// --- RETRIEVAL-READONLY：检索不改变体验（D-03 选项 A；07 §22） ---
async function caseRetrievalReadonly(trace) {
  const gateway = new CapturingGateway(allFixtures());
  const { runtime, events, traces } = createCaseRuntime(gateway);

  // 会话 A：WHY → STOP → 记忆登记。
  const chainA = await setupChain(runtime, 'f5rr-a', '为什么');
  await submitRound(runtime, chainA, 'WHY', '量子计算为什么这么难？', `req-s2a-f5rr-a-why-${shortId()}`);
  await submitRound(runtime, chainA, 'STOP', '好了', `req-s2a-f5rr-a-stop-${shortId()}`);

  const eventsBeforeB = events.length;
  const tracesBeforeB = traces.length;
  const sessionStartedBefore = eventsOf(events, 'session_started').length;
  const experienceStartedBefore = eventsOf(events, 'experience_started').length;

  // 会话 B：WHY 生成触发 L5 检索（读取时点注入生成上下文）。
  const chainB = await setupChain(runtime, 'f5rr-b', '为什么');
  const whyB = await submitRound(runtime, chainB, 'WHY', '为什么量子计算这么快？', `req-s2a-f5rr-b-why-${shortId()}`);

  const windowEvents = events.slice(eventsBeforeB);
  const sessionBMemoryEvents = windowEvents.filter((event) => event.event_type.startsWith('memory_'));
  const sessionBStarts = windowEvents.filter(
    (event) => event.event_type === 'session_started' || event.event_type === 'experience_started',
  );
  const sessionBTransitions = windowEvents.filter((event) => event.event_type === 'state_transitioned');
  const windowNewTraces = traces.slice(tracesBeforeB);

  // 快照查询为只读：连续两次 getMemory 逐字节一致（读取不改写）。
  const snapshotFirst = runtime.getMemory();
  const snapshotSecond = runtime.getMemory();

  const expected = {
    readOnly: '会话 B 的 L5 检索零 memory 域事件（检索只读——D-02 选项 A；07 §22）；零 session_started / experience_started（检索不触发产品动作——不自动启动）；state_transitioned 恰为 WHY 流自身两次（体验启动 CURIOSITY→UNDERSTANDING + 提交 USER_ACTION）',
    noMutation: '连续两次 getMemory() 快照逐字节一致（查询不改写记录）',
    decisionTrace: '会话 B 决策追踪与事件同步登记（无额外决策——检索不产生决策追踪）',
  };
  const actual = {
    sessionB: {
      whyOk: whyB.submission.ok,
      selectedAction: whyB.submission.ok ? whyB.submission.header.policy_decision.selected_action : whyB.submission.error.code,
      memoryEventCount: sessionBMemoryEvents.length,
      memoryEventTypes: sessionBMemoryEvents.map((event) => event.event_type),
      explicitStarts: sessionBStarts.map((event) => event.event_type),
      transitions: sessionBTransitions.map((event) => ({
        from: event.properties.from,
        to: event.properties.to,
        steps: event.properties.steps,
      })),
    },
    counts: {
      sessionStartedBefore,
      sessionStartedAfter: eventsOf(events, 'session_started').length,
      experienceStartedBefore,
      experienceStartedAfter: eventsOf(events, 'experience_started').length,
      newTraces: windowNewTraces.length,
    },
    snapshotStable: jsonEquals(snapshotFirst, snapshotSecond),
    snapshotRecord: snapshotFirst.memory.records[0]
      ? {
          recordId: snapshotFirst.memory.records[0].recordId,
          topic: snapshotFirst.memory.records[0].topic,
          lifecycle: snapshotFirst.memory.records[0].lifecycle,
          lastRecalledAt: snapshotFirst.memory.records[0].lastRecalledAt,
        }
      : null,
  };
  const pass =
    whyB.submission.ok &&
    whyB.submission.header.policy_decision.selected_action === 'EXPLAIN' &&
    sessionBMemoryEvents.length === 0 &&
    sessionBStarts.length === 2 &&
    sessionBStarts.filter((event) => event.event_type === 'session_started').length === 1 &&
    sessionBStarts.filter((event) => event.event_type === 'experience_started').length === 1 &&
    sessionBTransitions.length === 2 &&
    eventsOf(events, 'session_started').length === sessionStartedBefore + 1 &&
    eventsOf(events, 'experience_started').length === experienceStartedBefore + 1 &&
    jsonEquals(snapshotFirst, snapshotSecond) &&
    snapshotFirst.memory.records.length === 1 &&
    snapshotFirst.memory.records[0].topic === '为什么' &&
    snapshotFirst.memory.records[0].lifecycle === 'IN_USE' &&
    snapshotFirst.memory.records[0].lastRecalledAt !== null;
  return { expected, actual, pass };
}

// --- SINGLE-WRITER：模型 state_update 拒绝（GS-06 / CC02 H01/H05） ---
async function caseSingleWriter(trace) {
  const gateway = new MaliciousGateway();
  const { runtime, events, traces } = createCaseRuntime(gateway);

  // WHY 意图链 + 越权提案注入（state_update_proposal 含 memory_record——
  // 模型尝试直接写记忆，须经 Validator 拒绝）。
  const chain = await setupChain(runtime, 'f5sw', '为什么');
  const stateBefore = runtime.getExperienceState(chain.exp.experienceId).state;
  const why = await submitRound(runtime, chain, 'WHY', '量子计算为什么这么难？', `req-s2a-f5sw-why-${shortId()}`);
  const stateAfter = runtime.getExperienceState(chain.exp.experienceId).state;

  const llmOutputRejected = eventsOf(events, 'llm_output_rejected');
  const stateWriteRejected = eventsOf(events, 'state_write_rejected');
  const memoryEvents = events.filter((event) => event.event_type.startsWith('memory_'));
  const snapshot = memorySnapshotOf(runtime);
  const decisionTraces = traces.filter((entry) => entry.experience_id === chain.exp.experienceId);

  const expected = {
    rejection: '越权提案（非空 state_update_proposal：memory_record）→ POLICY_REJECTED（llm_state_mutation_forbidden）——llm_output_rejected + state_write_rejected 事件留痕',
    singleWriter: '模型未写入任何记忆（快照 records=0）——记忆写入仅经 Runtime 内部写入方法（GS-06 / CC02 H01/H05）',
    versionInvariant: '拒绝不提交——体验状态版本不变（失败写入不消耗版本号，OBL-01 / S1-12）',
    decisionTrace: '拒绝轮次决策追踪 reasonPrimary=proposal_rejected，llm_used=true，userOverride=true',
  };
  const actual = {
    submission: {
      ok: why.submission.ok,
      errorCode: why.submission.ok ? null : why.submission.error.code,
      retryable: why.submission.ok ? null : why.submission.error.retryable,
    },
    injectedProposal: gateway.captured[0]
      ? {
          requestId: gateway.captured[0].requestId,
          stateUpdateProposal: gateway.captured[0].proposal.state_update_proposal,
          confidence: gateway.captured[0].proposal.confidence,
        }
      : null,
    events: {
      llmOutputRejected: llmOutputRejected.map((event) => ({
        code: event.properties.code,
        reason: event.properties.reason,
        proposal_id: event.properties.proposal_id,
      })),
      stateWriteRejected: stateWriteRejected.map((event) => ({
        reason: event.properties.reason,
        detail: event.properties.detail,
      })),
      memoryEventCount: memoryEvents.length,
    },
    memory: {
      recordCount: snapshot.records.length,
    },
    version: {
      before: stateBefore.stateVersion,
      after: stateAfter.stateVersion,
      unchanged: stateBefore.stateVersion === stateAfter.stateVersion,
    },
    decisionTrace: decisionTraces.map((entry) => ({
      reasonPrimary: entry.reason.primary,
      llmUsed: entry.execution?.llm_used,
      userOverride: entry.user_override,
    })),
  };
  const pass =
    why.submission.ok === false &&
    why.submission.error.code === 'POLICY_REJECTED' &&
    gateway.captured.length === 1 &&
    typeof gateway.captured[0].proposal.state_update_proposal.memory_record === 'object' &&
    llmOutputRejected.length === 1 &&
    llmOutputRejected[0].properties.code === 'POLICY_REJECTED' &&
    llmOutputRejected[0].properties.reason.startsWith('llm_state_mutation_forbidden') &&
    stateWriteRejected.length === 1 &&
    stateWriteRejected[0].properties.reason === 'llm_state_mutation_forbidden' &&
    memoryEvents.length === 0 &&
    snapshot.records.length === 0 &&
    stateBefore.stateVersion === stateAfter.stateVersion &&
    decisionTraces.length >= 1 &&
    decisionTraces.every((entry) => entry.reason.primary === 'proposal_rejected');
  return { expected, actual, pass };
}

// --- WRITE-FILTER：07 §7 写入侧过滤（负向） -------------------
async function caseWriteFilter(trace) {
  // 存储层：六类不默认长期记住清单标记 → 全部过滤。
  const store = new MemoryStore();
  const now = '2026-01-01T00:00:00.000Z';
  const notPersistTopics = [
    '临时情绪：对明天的兴奋',
    '一次性兴趣：想看看流星雨',
    '一次性任务：完成注册',
    '当前环境：咖啡馆',
    '单次拒绝：这次不',
    '推测人格：用户可能内向',
  ];
  const directWrites = notPersistTopics.map((topic) =>
    store.recordMemory({
      sessionId: 'session_synthetic_f5_wf',
      topic,
      intentSignal: 'turns=1;actions=WHY',
      source: 'session_observation',
      now,
    }),
  );
  const directSnapshot = store.getSnapshot();

  // 运行时级：分类可达（WHY 层先命中"为什么"——优先级层不变）
  // 但 STOP 完成路径的写入被过滤（主题含"一次性"标记）。
  const { runtime, events } = createCaseRuntime();
  const chain = await setupChain(runtime, 'f5wf', '为什么一次性兴趣');
  const why = await submitRound(runtime, chain, 'WHY', '为什么一次性兴趣', `req-s2a-f5wf-why-${shortId()}`);
  const stop = await submitRound(runtime, chain, 'STOP', '好了', `req-s2a-f5wf-stop-${shortId()}`);
  const runtimeSnapshot = memorySnapshotOf(runtime);
  const memoryRecorded = eventsOf(events, 'memory_recorded');

  const expected = {
    store: '六类不默认长期记住清单（07 §7：临时情绪 / 一次性兴趣 / 一次性任务 / 当前环境 / 单次拒绝 / 推测人格）全部命中写入过滤——recorded=false, reason=write_filter，存储为空',
    runtime: 'WHY 意图链（"为什么一次性兴趣"——WHY 优先级层先命中，分类行为不变）→ STOP 完成路径写入被过滤（主题含"一次性"标记）：快照 records=0，零 memory_recorded 事件',
  };
  const actual = {
    store: {
      writes: directWrites.map((write) => ({ recorded: write.recorded, reason: write.recorded ? null : write.reason })),
      recordCount: directSnapshot.records.length,
    },
    runtime: {
      intentClassified: chain.intent.semanticAction,
      whyOk: why.submission.ok,
      stopOk: stop.submission.ok,
      recordCount: runtimeSnapshot.records.length,
      memoryRecordedCount: memoryRecorded.length,
    },
  };
  const pass =
    directWrites.length === 6 &&
    directWrites.every((write) => write.recorded === false && write.reason === 'write_filter') &&
    directSnapshot.records.length === 0 &&
    chain.intent.semanticAction === 'WHY' &&
    why.submission.ok &&
    stop.submission.ok &&
    runtimeSnapshot.records.length === 0 &&
    memoryRecorded.length === 0;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表（E5 §4 案例记录 12 字段来源）
// ---------------------------------------------------------------------------

const CASE_REGISTRY = [
  {
    caseId: 'CROSS-SESSION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §2 D-01 选项 A（切片内本地持久化记忆记录存储）/ D-03 选项 A（L5 信号注入）；授权 §2(4)（跨会话主题 / 意图信号持久化）；07 §4（短期记忆语义）/ §20（检索纪律）/ §21（优先级链 L5）/ §22（检索不应改变体验）',
    scope: '跨会话持久化：会话 A WHY 探索 → STOP 完成 → 短期记忆登记（主题 = 起源意图输入，意图信号 = 会话动作摘要）；会话 B（新会话，同一 Runtime）同主题 WHY 探索 → 生成上下文注入 memory_signals ×1（RECALL 经检索触发：REMEMBERED→IN_USE，lastRecalledAt 刷新）；记忆记录跨会话归属不变（sessionId 为起源会话）；会话 B 零 memory 域事件（检索只读）',
    precondition: '同一 Experience Runtime 实例；CapturingGateway 捕获生成请求 context（Context Builder 注入面取证）',
    inputFault: '洁净 WHY / STOP 输入（分类器洁净性核验——无记忆操作标记碰撞）',
    run: caseCrossSession,
  },
  {
    caseId: 'LIFECYCLE',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §2 D-02 选项 A（五阶段生命周期契约化）/ D-04 选项 A（保留期起算与删除执行）；07 §10（生命周期）/ §11（时间衰减——示例形态采纳为规范参数）；隐私六要素 P3-S1-PRIVACY-SIX-01 要素 1（保留 ≥6 个月）/ 要素 5（到期自动删除 + 删除审计记录）',
    scope: '直接 MemoryStore 时间显式控制：CREATE(t0) → RECALL(t0，REMEMBERED→IN_USE）→ DECAY(Day 5，IN_USE 且兴趣 < 0.50）→ 保持 DECAYING(Day 14，兴趣 ≈ 0.170 > 0.10）→ EXPIRE(Day 19，兴趣 < 0.10，decay_threshold + 删除审计）；保留期路径：CREATE(t0) → 未到期(Day 179）→ EXPIRE(Day 180 整，retention_expired + 删除审计）；Day 0 = 0.90 / Day 3 ≈ 0.63 锚点验证（k = ln(0.9/0.63)/3）',
    precondition: '直接 MemoryStore（进程内形态——轴外持久对象模型 on F-2 创作对象 / F-4 分支记录纪律）',
    inputFault: '无用户输入（存储层直接操作；时间参数显式控制）',
    run: caseLifecycle,
  },
  {
    caseId: 'CORRECT-WITHDRAW',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §2 D-02 选项 A（CORRECT / WITHDRAW 操作）/ D-05 选项 A（用户动作路由经 Runtime 单一写入者）；07 §13（"别再给我这个"）/ §15（用户控制）/ §17（Memory Correction）；C6 §14（事件命名 <domain>_<past_participle>）',
    scope: '用户显式纠正 / 撤回全链路：会话 A 记忆登记 → 会话 B "记忆纠正：量子计算原理"（UNKNOWN + memoryIntent=correct → 主题更正 + corrections=1 + 来源 user_correction + 置信度 0.95 + 兴趣重置锚点 + 回到 REMEMBERED，memory_corrected 留痕）→ 会话 C "别再给我这个"（→EXPIRED + 撤回留痕 + 删除审计 reason=withdrawn，memory_withdrawn 留痕）→ 会话 D 重复撤回（幂等空操作 no_memory_target，不重复留痕）；存储层对已 EXPIRED 记录直接撤回 → MEMORY_EXPIRED 幂等拒绝；记忆操作不创建新体验（session_started=4，experience_started=1）',
    precondition: 'WHY 意图链已建立并完成（记忆登记存在）',
    inputFault: '"记忆纠正：量子计算原理" / "别再给我这个"（确定性规则词表识别——仅认领会成为 UNKNOWN 的输入，不改变分类优先级层）',
    run: caseCorrectWithdraw,
  },
  {
    caseId: 'SESSION-SCOPED-NEG',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §1 元素 4（Current State / Session State 会话结束即失效——负向不变式）；授权 §2(4)；07 §2.1（Current State）/ §3（Session State）/ §4（Short-term Memory 对照）；S2A-F4-SEMANTIC-FREEZE-01 §2 D-04 选项 A（模拟分支状态会话结束失效）',
    scope: '负向对照：会话 A WHY + WHAT_IF 轮（模拟分支状态建立）→ STOP 完成 → 模拟分支状态随会话结束失效（getSimulation 拒绝）→ 已结束会话上的旧体验操作拒绝（INVALID_STATE_TRANSITION）；对照：短期记忆跨会话存活（getMemory 可查）——同一会话内 Session State / Current State 会话结束即失效，Short-term Memory 不失效（六类数据状态区分纪律）',
    precondition: 'WHY 意图链已建立；WHAT_IF 轮已完成（模拟分支 ACTIVE）',
    inputFault: '洁净 WHY / WHAT_IF / STOP 输入 + 已结束会话上的旧体验操作（负向）',
    run: caseSessionScopedNeg,
  },
  {
    caseId: 'LONGTERM-DISABLED',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §1 元素 5（长期记忆 S2 不启用——负向不变式）；PD-23（S2-SCOPE-PROPOSAL-01 §5 裁决）；授权 §2(4)（仅短期记忆持久化 + 用户显式纠正 / 撤回记录）；07 §5（Long-term Memory）/ §8（Fact / Inference / Preference 类型层）',
    scope: '长期记忆（偏好画像）写入路径不存在（负向）：静态——src/experience/memory.ts 不含长期记忆 / 偏好画像标识符（EXPLICIT / LONG_TERM / long_term / preference profile），MemoryLifecycle 联合恰为四态，MemorySource 联合恰为 session_observation | user_correction；动态——全流程（两主题 WHY→STOP 登记 + 一次显式纠正）后全部记录 source ∈ {session_observation, user_correction}，lifecycle ∈ {REMEMBERED, IN_USE, DECAYING, EXPIRED}',
    precondition: '已提交产品源码字节（静态断言读取事实，不做代码推断）；运行时全流程',
    inputFault: '洁净 WHY / STOP / 记忆纠正输入',
    run: caseLongtermDisabled,
  },
  {
    caseId: 'CURRENT-INTENT-OVERRIDE',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §1 元素 6 / §2 D-03 选项 A（L2 Current Intent 覆盖 L5）；07 §12（Current Intent 覆盖）；07 §20（检索纪律——只取相关记录）；07 §21（优先级链 L0–L6）',
    scope: 'Current Intent 覆盖：会话 A 记忆登记（主题"为什么"）→ 会话 B 同主题 WHY——memory_signals ×1 注入生成上下文，提交行为与无记忆时完全一致（selected_action=EXPLAIN，内容逐字节等于 why 语料，终态 WAITING/UNDERSTANDING v4——策略动作由当前意图决定，记忆仅注入上下文）→ 会话 C WHAT_IF（与记忆主题无 2 字窗口交集）——memory_signals ×0（相关性过滤：只取相关记录，不全量塞入）',
    precondition: '会话 A 记忆登记存在；CapturingGateway 捕获生成请求 context',
    inputFault: '洁净 WHY / WHAT_IF 输入（WHAT_IF 输入与记忆主题无 2 字窗口交集——相关性过滤负向验证）',
    run: caseCurrentIntentOverride,
  },
  {
    caseId: 'RETRIEVAL-READONLY',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §1 元素 7 / §2 D-03 选项 A（检索只读）；07 §22（记忆检索不应改变体验）；07 §16（透明性经事件日志 + 用户控制面承载——非检索写事件）',
    scope: '检索不改变体验（负向）：会话 B 的 L5 检索零 memory 域事件；零 session_started / experience_started（检索不触发产品动作——不自动启动新体验）；state_transitioned 恰为 WHY 流自身两次（体验启动 + 提交 USER_ACTION——无额外状态写入）；连续两次 getMemory() 快照逐字节一致（查询不改写记录）',
    precondition: '会话 A 记忆登记存在；CapturingGateway 捕获生成请求 context',
    inputFault: '洁净 WHY 输入',
    run: caseRetrievalReadonly,
  },
  {
    caseId: 'SINGLE-WRITER',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §2 D-05 选项 A（写入经 Runtime 单一写入者）；授权 §5.8；GS-06 / CC02 H01/H05（模型 state_update 提案拒绝）；S1 §17（LLM 禁止动作——不得写 Memory）',
    scope: '单一写入者（负向）：越权网关注入携带非空 state_update_proposal（memory_record 键——模型尝试直接写记忆）的脚本化提案 → POLICY_REJECTED（llm_state_mutation_forbidden）→ llm_output_rejected + state_write_rejected 事件留痕；记忆快照 records=0（模型未写入任何记忆）；体验状态版本不变（拒绝不提交——失败写入不消耗版本号）；决策追踪 reasonPrimary=proposal_rejected',
    precondition: 'WHY 意图链已建立；MaliciousGateway 经 RuntimeOptions.gateway 注入缝构造（证据注入点——同 LlmGateway 接口）',
    inputFault: '越权提案注入（脚本化——仅证据环境可用，非真实 LLM 提供方）',
    run: caseSingleWriter,
  },
  {
    caseId: 'WRITE-FILTER',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 §1 元素 11 / §2 D-05 选项 A（写入侧执行 07 §7 过滤）；07 §7（不默认长期记住清单：临时情绪 / 一次性兴趣 / 一次性任务 / 当前环境 / 单次拒绝 / 推测人格）',
    scope: '写入侧过滤（负向）：存储层六类标记输入全部 recorded=false, reason=write_filter（存储为空）；运行时级——"为什么一次性兴趣"经 WHY 优先级层分类（分类行为不变——记忆操作识别仅在全部既有层未命中后调用）→ STOP 完成路径写入被过滤（主题含"一次性"标记）：快照 records=0，零 memory_recorded 事件',
    precondition: '直接 MemoryStore（存储层）+ WHY 意图链（运行时级）',
    inputFault: '六类标记输入（存储层直接操作）+ "为什么一次性兴趣"（运行时级——WHY 层先命中，验证过滤发生在写入侧而非分类侧）',
    run: caseWriteFilter,
  },
];

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  // Engine gate: exact Node lock (F-2 authorization-date LTS re-verification; F-5 continues the lock).
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1 / F2 / F3 / G3 / S2A-OBL-01 / S2A-F2-0001 / S2A-F3-0001 / S2A-F4-0001).
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

  // Execute cases sequentially (in-process form only — no HTTP servers:
  // F-5 scope is memory-domain semantics, exercised against the real
  // committed runtime via module.registerHooks type-stripping).
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
        ? '无（本案例）；G5 16 项评测包仍 NOT RUN；E3 公开发布统计阈值待产品负责人批准'
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

  // A1: CROSS-SESSION.
  const cCross = caseResults.find((entry) => entry.caseId === 'CROSS-SESSION');
  assert(
    'A1',
    'CROSS-SESSION：跨会话持久化——会话 A WHY 探索 → STOP 完成 → 短期记忆登记（主题 = 起源意图输入"为什么"，意图信号 turns=1;actions=WHY，来源 session_observation，置信度 0.7，兴趣锚点 0.90，生命周期 REMEMBERED）；memory_recorded 在 session_ended 之前登记；会话 B（新会话，同一 Runtime）同主题 WHY 探索 → 生成上下文注入 memory_signals ×1（recordId / 主题一致，生命周期 IN_USE——RECALL 经检索触发，lastRecalledAt 刷新，有效兴趣 > 0.85）；记忆记录跨会话归属不变；会话 B 零 memory 域事件（检索只读——D-02 选项 A）',
    cCross?.pass === true,
    { crossSession: cCross?.pass },
  );

  // A2: LIFECYCLE.
  const cLifecycle = caseResults.find((entry) => entry.caseId === 'LIFECYCLE');
  assert(
    'A2',
    'LIFECYCLE：生命周期迁移 + 规范衰减参数——CREATE(t0)→REMEMBERED（兴趣 0.90）→RECALL(t0)→IN_USE（lastRecalledAt=t0）→Day 5 DECAYING（IN_USE 且有效兴趣 < 0.50）→Day 14 保持 DECAYING（兴趣 ≈ 0.170 > 0.10）→Day 19 EXPIRED（decay_threshold + 删除审计：删除时间 / 记录范围 / 验证信息）；保留期路径：Day 179 未到期（REMEMBERED）→Day 180 整 EXPIRED（retention_expired + 删除审计）；Day 0 = 0.90 / Day 3 ≈ 0.63 锚点（k = ln(0.9/0.63)/3——07 §11 示例形态采纳为规范参数）；规范参数 MEMORY_INTEREST_ANCHOR=0.9 / MEMORY_DECAY_THRESHOLD=0.5 / MEMORY_EXPIRE_THRESHOLD=0.1 / MEMORY_RETENTION_MS=180 天',
    cLifecycle?.pass === true,
    { lifecycle: cLifecycle?.pass },
  );

  // A3: CORRECT-WITHDRAW.
  const cCorrectWithdraw = caseResults.find((entry) => entry.caseId === 'CORRECT-WITHDRAW');
  assert(
    'A3',
    'CORRECT-WITHDRAW：用户显式纠正 / 撤回——"记忆纠正：量子计算原理"（UNKNOWN + memoryIntent=correct，经 Runtime 单一写入者执行）：主题更正"量子计算原理"，corrections=1，来源 user_correction，置信度 0.95，兴趣重置锚点 0.90，回到 REMEMBERED，memory_corrected 留痕（corrected_topic / previous_lifecycle）；"别再给我这个"（UNKNOWN + memoryIntent=withdraw）：→EXPIRED + 撤回留痕 + 删除审计 reason=withdrawn（记录范围 / 验证信息），memory_withdrawn 留痕；重复撤回 → 幂等空操作（no_memory_target，不重复留痕）；存储层对已 EXPIRED 记录直接撤回 → MEMORY_EXPIRED 幂等拒绝；记忆操作不创建新体验（session_started=4，experience_started=1）',
    cCorrectWithdraw?.pass === true,
    { correctWithdraw: cCorrectWithdraw?.pass },
  );

  // A4: SESSION-SCOPED-NEG.
  const cSessionScoped = caseResults.find((entry) => entry.caseId === 'SESSION-SCOPED-NEG');
  assert(
    'A4',
    'SESSION-SCOPED-NEG：Current State / Session State 会话结束即失效（负向）——WHAT_IF 轮建立的模拟分支状态随会话结束失效（getSimulation 拒绝——F-4 D-04 选项 A）；已结束会话上的旧体验操作拒绝（INVALID_STATE_TRANSITION——07 §3）；对照：短期记忆跨会话存活（getMemory 可查，主题"为什么"，REMEMBERED——07 §4；D-01 选项 A）——六类数据状态区分纪律：同一会话内 Session State / Current State 失效而 Short-term Memory 不失效；simulation_recorded ×1（仅 WHAT_IF 轮）',
    cSessionScoped?.pass === true,
    { sessionScopedNeg: cSessionScoped?.pass },
  );

  // A5: LONGTERM-DISABLED.
  const cLongterm = caseResults.find((entry) => entry.caseId === 'LONGTERM-DISABLED');
  assert(
    'A5',
    'LONGTERM-DISABLED：长期记忆（偏好画像）写入路径不存在（负向）——静态：src/experience/memory.ts 不含 EXPLICIT / LONG_TERM / long_term / preference profile 标识符，MemoryLifecycle 联合恰为四态（REMEMBERED / IN_USE / DECAYING / EXPIRED），MemorySource 联合恰为 session_observation | user_correction；动态：全流程（两主题 WHY→STOP 登记 + 一次显式纠正）后全部记录 source ∈ {session_observation, user_correction}，lifecycle ∈ 四态集合——长期记忆写入路径不存在（PD-23；授权 §2(4)）',
    cLongterm?.pass === true,
    { longtermDisabled: cLongterm?.pass },
  );

  // A6: CURRENT-INTENT-OVERRIDE.
  const cOverride = caseResults.find((entry) => entry.caseId === 'CURRENT-INTENT-OVERRIDE');
  assert(
    'A6',
    'CURRENT-INTENT-OVERRIDE：Current Intent 覆盖 L5（07 §12）——会话 B 同主题 WHY：memory_signals ×1 注入生成上下文，提交行为与无记忆时完全一致（selected_action=EXPLAIN，内容逐字节等于 why 语料，终态 WAITING/UNDERSTANDING v4——策略动作由当前意图决定，记忆仅注入上下文，不替用户决定当前意图——GS-04）；会话 C WHAT_IF（与记忆主题无 2 字窗口交集）：memory_signals ×0（07 §20 相关性过滤——只取相关记录，不全量塞入）',
    cOverride?.pass === true,
    { currentIntentOverride: cOverride?.pass },
  );

  // A7: RETRIEVAL-READONLY.
  const cReadonly = caseResults.find((entry) => entry.caseId === 'RETRIEVAL-READONLY');
  assert(
    'A7',
    'RETRIEVAL-READONLY：检索不改变体验（负向；07 §22）——会话 B 的 L5 检索零 memory 域事件（检索只读——D-02 选项 A）；零 session_started / experience_started（检索不触发产品动作——不自动启动新体验）；state_transitioned 恰为 WHY 流自身两次（体验启动 CURIOSITY→UNDERSTANDING + 提交 USER_ACTION——无额外状态写入）；连续两次 getMemory() 快照逐字节一致（查询不改写记录）',
    cReadonly?.pass === true,
    { retrievalReadonly: cReadonly?.pass },
  );

  // A8: SINGLE-WRITER.
  const cSingleWriter = caseResults.find((entry) => entry.caseId === 'SINGLE-WRITER');
  assert(
    'A8',
    'SINGLE-WRITER：模型 state_update 拒绝（GS-06 / CC02 H01/H05）——越权网关提案（非空 state_update_proposal：memory_record 键——模型尝试直接写记忆）→ POLICY_REJECTED（llm_state_mutation_forbidden）→ llm_output_rejected + state_write_rejected 事件留痕；记忆快照 records=0（模型未写入任何记忆——记忆写入仅经 Runtime 内部写入方法）；体验状态版本不变（拒绝不提交——失败写入不消耗版本号，OBL-01 / S1-12）；决策追踪 reasonPrimary=proposal_rejected',
    cSingleWriter?.pass === true,
    { singleWriter: cSingleWriter?.pass },
  );

  // A9: WRITE-FILTER.
  const cWriteFilter = caseResults.find((entry) => entry.caseId === 'WRITE-FILTER');
  assert(
    'A9',
    'WRITE-FILTER：07 §7 写入侧过滤（负向）——存储层六类不默认长期记住清单（临时情绪 / 一次性兴趣 / 一次性任务 / 当前环境 / 单次拒绝 / 推测人格）全部 recorded=false, reason=write_filter（存储为空）；运行时级——"为什么一次性兴趣"经 WHY 优先级层分类（分类行为不变——记忆操作识别仅在全部既有层未命中后调用）→ STOP 完成路径写入被过滤（主题含"一次性"标记）：快照 records=0，零 memory_recorded 事件',
    cWriteFilter?.pass === true,
    { writeFilter: cWriteFilter?.pass },
  );

  // A10: case record completeness (E5 §4 12 fields).
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
    'A10',
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4；${CASE_REGISTRY.length} 执行；PD-19 延期义务已履行——F-5 关闭切片执行，无 DEFERRED 登记）`,
    recordCheck,
    { recordFiles: recordFiles.length, expected: CASE_REGISTRY.length, allCasesPass },
  );

  // A11: trace files complete and non-empty.
  const traceFiles = (await readdir(tracesDir)).filter((name) => name.endsWith('.jsonl'));
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (await Promise.all(
      traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
    )).every((nonEmpty) => nonEmpty);
  assert(
    'A11',
    `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`,
    traceCheck,
    { traceFiles: traceFiles.length },
  );

  // A12-PREFLIGHT: preflight / integrity (informational; failures are FATAL above).
  assert(
    'A12-PREFLIGHT',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // ---------------------------------------------------------------------------
  // E5 §3 version matrix (run-metadata.json) — S2a F-5 memory-semantics form.
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
    'src/experience/correction.ts',
    'src/experience/validator.ts',
    'src/experience/events.ts',
    'src/experience/decision-trace.ts',
    'src/experience/llm-gateway.ts',
    'src/experience/creation.ts',
    'src/experience/simulation.ts',
    'src/experience/memory.ts',
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
    'src/experience/fixtures/change-direction.ts',
    'src/experience/fixtures/simulate.ts',
    'src/experience/fixtures/create.ts',
    'src/experience/fixtures/correction.ts',
    'tools/evidence/src/s2a-f5.mjs',
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
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2(4)/§6：F-5——Minimal Memory（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：轴外记忆记录存储 + 四态生命周期 + 记忆域事件词表 + L5 Context Builder 信号注入 + 写入侧 07 §7 过滤 + Runtime 单一写入者）',
    authorization: { id: 'P3-S2-IMPL-AUTH-01', version: '1.2.0', issued: '2026-10-09', note: '产品负责人签署生效（AUTHORIZED）；F-5 语义冻结文本于首个动态证据运行（S2A-F5-0001）前完成版本化冻结 + C1/C2/C3 Steward 确认（G1 式纪律）' },
    obligationTraceability: {
      'F-5 (Minimal Memory)': {
        semanticFreeze: 'docs/product/p3-s1/s2a-f5-semantic-freeze-staged.md（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-09 产品负责人签署——D-01…D-05 全项选项 A）',
        frozenDecisions: {
          'D-01': '选项 A（切片内本地持久化记忆记录存储——轴外持久对象，model on F-2 创作对象 / F-4 分支记录纪律；进程内形态；生产形态存储治理按隐私六要素已批准方向执行，属生产部署治理、不属本切片实施范围）',
          'D-02': '选项 A（五阶段生命周期契约化 + 轴外记忆子状态机 + 四事件词表——状态 {REMEMBERED, IN_USE, DECAYING, EXPIRED}；操作 {CREATE, RECALL, DECAY, EXPIRE, CORRECT, WITHDRAW}；事件词表 memory_recorded / memory_corrected / memory_withdrawn / memory_expired，domain=memory，C6 §7 已预留层；07 §10 映射冻结：OBSERVED/CANDIDATE→REMEMBERED，ACTIVE→IN_USE，DECAYING→DECAYING，EXPIRED→EXPIRED，显式 EXPLICIT 路径 S2 不存在）',
          'D-03': '选项 A（L5 信号注入 + Current Intent 覆盖不变 + 检索只读——07 §21 优先级链；07 §20 检索纪律：以当前意图为检索键，只取相关记录；07 §12 覆盖不变式；07 §22 检索不改变体验、不触发产品动作；L6 长期记忆层 S2 不存在）',
          'D-04': '选项 A（最后更新起算 6 个月 + 到期自动删除 + 删除审计 + 示例参数规范化——指数衰减 Day 0 = 0.90 → Day 3 ≈ 0.63，k = ln(0.9/0.63)/3；IN_USE 且 < 0.50 → DECAYING；DECAYING 且 < 0.10 → EXPIRED；删除审计含删除时间 / 记录范围 / 验证信息——隐私要素 1/5）',
          'D-05': '选项 A（运行时内部写入 API + 用户动作路由——记忆写入仅经 Runtime 内部写入方法；模型 state_update 拒绝（GS-06 / CC02 H05）；用户纠正 / 撤回经确定性规则词表识别（WITHDRAW > CORRECT）经 Runtime 单一写入者执行并留痕；写入侧执行 07 §7 不默认长期记住清单过滤）',
        },
        implementationFiles: [
          'src/experience/memory.ts（新增：记忆记录存储——五分量记录模型 / 四态生命周期状态机 / 六操作 / 07 §7 写入过滤 / 记忆操作识别词表 / 检索相关性判定 / 规范衰减参数）',
          'src/experience/runtime.ts（L5 Context Builder 集成：buildLlmContext 注入 memory_signals + 懒到期 memory_expired 登记；STOP 完成路径记忆登记（memory_recorded，先于 session_ended）；UNKNOWN + memoryIntent 路由 executeMemoryOperation（withdraw / correct）；getMemory API）',
          'src/experience/classifier.ts（记忆操作识别接入——分类优先级层全部未命中后调用，仅认领会成为 UNKNOWN 的输入）',
          'src/experience/events.ts（memory 域事件词表常量：MEMORY_RECORDED_EVENT / MEMORY_CORRECTED_EVENT / MEMORY_WITHDRAWN_EVENT / MEMORY_EXPIRED_EVENT——C6 §14 <domain>_<past_participle>）',
          'src/experience/policy.ts（POLICY_VERSION=policy_v1.5.0 + §3 变更 1–5 文档注释）',
          'src/experience/state-machine.ts（state_machine_v1.4.0 轴外记忆子状态机契约文档注释——07 §10 映射冻结）',
          'tools/evidence/src/golden.mjs（policy_v1.5.0 断言同步；G08-B 静态不存在证明→存在证明改写——PD-07 经授权 §2(4) 取代性扩展）',
        ],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: 'G3-GOLDEN-0001 PASSED（32/32 案例；断言已同步 policy_v1.5.0）',
      },
    },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17', 'PD-21', 'PD-22', 'PD-23'],
      note: 'PD-23：S2 范围裁决（选项 B 两切片；F-5 = Minimal Memory——仅短期记忆持久化 + 用户显式纠正 / 撤回记录；六类数据状态区分；长期记忆 S2 不启用）；PD-07：不持久化跨会话 Memory——F-5 起经授权 §2(4) 取代性扩展为"仅短期记忆跨会话持久化"（G08-B 证明同步改写）',
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
      version: 'state_machine_v1.4.0',
      implemented: [
        'L0 Session（§4）',
        'L2 Experience 状态机（§7）',
        'L2 阶段机（§14/§15）',
        'Forbidden Transitions（§23）',
        '创造状态机 V1（13 §16——轴外子状态机；S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1）',
        'CORRECTION 操作序列契约化（S2A-F3-SEMANTIC-FREEZE-01 §4 变更 1）',
        'RESTORE 语义（S2A-F3-SEMANTIC-FREEZE-01 §4 变更 2）',
        'WHAT_IF_SIMULATE 多轮模拟契约化（S2A-F4-SEMANTIC-FREEZE-01 §4 变更 1）',
        'WHAT_IF 分支状态（S2A-F4-SEMANTIC-FREEZE-01 §4 变更 2——轴外分支子状态机）',
        '轴外记忆子状态机（S2A-F5-SEMANTIC-FREEZE-01 §4 变更 1：状态 {REMEMBERED, IN_USE, DECAYING, EXPIRED}；操作 {CREATE（记住）, RECALL（暂时使用）, DECAY（逐渐失效——时间衰减驱动）, EXPIRE（到期——自动）, CORRECT（被用户纠正——内容更正 + 留痕）, WITHDRAW（被用户撤回——撤回留痕 + 删除审计）}；记忆域事件词表 memory_recorded / memory_corrected / memory_withdrawn / memory_expired；07 §10 映射冻结；体验阶段轴不变——记忆操作不新增体验轴触发器）',
      ],
    },
    policy: {
      contract: 'C3',
      version: 'policy_v1.5.0',
      frozenMappingsImplemented: {
        DIRECT_ANSWER: 'ANSWER',
        WHY: 'EXPLAIN',
        WHAT_IF: 'SIMULATE（映射不变——S1 §14；执行语义 F-4 起扩展为多轮模拟持久化 + 轴外分支子状态机）',
        CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
        STOP: 'STOP',
        CREATE: 'CREATE（PD-21 关闭切片启用；F-2 起承载完整 G04 创作语义；F-3 起创作会话内 MODIFY 别名输入经路由保护回创作解释；SIMULATION → CREATION 衔接 13 §15.5 不变）',
        CORRECTION: 'EXPLAIN（G07 完整语义 F-3 起完整化：定位目标 / 局部修改 / 重生成 / 历史版本化；MODIFY 用户面别名 + RESTORE 恢复子型；策略映射不变）',
      },
      frozenMapAuthority: 'S1 规范 §14 Policy Rules（acceptance-mapping §A/C 批准范围）+ S2A-F5-SEMANTIC-FREEZE-01 §3 变更文本（policy_v1.5.0——F-5 不新增语义动作，映射不变）',
      semanticGapRegister: 'docs/product/baseline/c3-semantic-gap-register-v1.md（G-1…G-7 已登记，未由编码者补写；冻结点之外一律拒绝并升级）',
      memorySemantics: 'S2A-F5-SEMANTIC-FREEZE-01 §3 变更 1–5（policy_v1.5.0）：① 语义动作映射不变；② 新增 Minimal Memory 策略章节（记忆域范围 / 六类数据状态区分纪律 / 信号措辞纪律 / 写入侧过滤 / 作用面纪律 / 单一写入者）；③ Context Builder 集成（优先级链 L0–L6 转写，L5 检索以当前意图为键，L6 层 S2 不存在）；④ 保留与删除（默认 6 个月——最后更新起算，到期自动删除 + 删除审计记录）；⑤ 版本不变式（记忆记录操作不改变体验状态版本链）',
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
        'POST /api/experience/{id}/stream',
      ],
      note: 'F-5 不新增 API 路由——记忆域操作经既有 resolveIntent 路由（UNKNOWN + memoryIntent）；记忆快照经进程内 getMemory API（E5 取证入口，非 HTTP 路由）',
    },
    decisionTrace: {
      contract: 'C6',
      version: 'decision_trace_v1.0.0',
      memoryDomainEvents: ['memory_recorded', 'memory_corrected', 'memory_withdrawn', 'memory_expired'],
      note: '记忆域事件 domain=memory（C6 §7 事件层枚举已预留）；衰减为内部置信度更新不发事件；检索只读不发事件（D-02 选项 A）',
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
    runtimeFiles: { count: runtimeFiles.length, sha256: runtimeFileHashes },
    git: { commit: git.commit, workTreeClean: git.workTreeClean },
    startedAt,
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S2a F-5 memory-semantics form)');

  // A13: run-metadata completeness (E5 §3).
  const missingSections = [];
  for (const section of [
    'runId',
    'obligation',
    'authorization',
    'obligationTraceability',
    'environmentLicense',
    'productDecisions',
    'contracts',
    's1Specifications',
    'stateMachine',
    'policy',
    'api',
    'decisionTrace',
    'environment',
    'runtimeFiles',
    'git',
    'startedAt',
  ]) {
    if (versionMatrix[section] === undefined) {
      missingSections.push(section);
    }
  }
  assert(
    'A13',
    'run-metadata 完整（E5 §3 版本矩阵全部字段 + F-5 记忆语义专项 memorySemantics + obligationTraceability：F-5 → 案例 / 断言映射）',
    missingSections.length === 0 &&
    versionMatrix.policy.version === 'policy_v1.5.0' &&
    versionMatrix.stateMachine.version === 'state_machine_v1.4.0' &&
    Object.keys(versionMatrix.obligationTraceability['F-5 (Minimal Memory)'].frozenDecisions).length === 5 &&
    versionMatrix.obligationTraceability['F-5 (Minimal Memory)'].goldenRegression.includes('policy_v1.5.0') &&
    versionMatrix.obligationTraceability['F-5 (Minimal Memory)'].implementationFiles.length === 7 &&
    versionMatrix.policy.memorySemantics !== undefined &&
    versionMatrix.runtimeFiles.count === runtimeFiles.length &&
    versionMatrix.runtimeFiles.sha256['src/experience/memory.ts'] !== undefined,
    { policyVersion: versionMatrix.policy.version, stateMachineVersion: versionMatrix.stateMachine.version, frozenDecisionCount: Object.keys(versionMatrix.obligationTraceability['F-5 (Minimal Memory)'].frozenDecisions).length, implementationFileCount: versionMatrix.obligationTraceability['F-5 (Minimal Memory)'].implementationFiles.length, missingSections },
  );

  // Summary (first pass — SHA256SUMS verification appended in second pass per G3-E-3).
  const allPassedFirst = allCasesPass && assertions.every((entry) => entry.passed);
  const summary = {
    runId: RUN_ID,
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2(4)/§6：F-5——Minimal Memory（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：轴外记忆记录存储 + 四态生命周期 + 记忆域事件词表 + L5 Context Builder 信号注入 + 写入侧 07 §7 过滤 + Runtime 单一写入者）',
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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。F-5 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A16', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Final pass: refresh summary with A16 included, then regenerate the
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

运行：${RUN_ID}（S2a F-5 迭代：Minimal Memory——轴外记忆记录存储 + 四态生命周期 + 记忆域事件词表 + L5 Context Builder 信号注入 + 写入侧 07 §7 过滤 + Runtime 单一写入者）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-5 → 案例 / 断言映射；frozenDecisions：D-01…D-05 裁决文本引用；memorySemantics：policy_v1.5.0 记忆语义规范注册）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 跨会话持久化（CROSS-SESSION）：会话 A WHY → STOP → 记忆登记（主题 = 起源意图输入，意图信号 = 会话动作摘要）；会话 B 同主题 WHY → 生成上下文注入 memory_signals ×1（RECALL 经检索触发：REMEMBERED→IN_USE）；记忆记录跨会话归属不变；会话 B 零 memory 域事件（检索只读）
- 生命周期迁移（LIFECYCLE）：CREATE → RECALL → DECAY(Day 5) → 保持 DECAYING(Day 14) → EXPIRE(Day 19，decay_threshold)；保留期路径 Day 179 未到期 → Day 180 整 EXPIRE（retention_expired）；Day 0 = 0.90 / Day 3 ≈ 0.63 锚点（k = ln(0.9/0.63)/3）；删除审计（删除时间 / 记录范围 / 验证信息）
- 纠正 / 撤回（CORRECT-WITHDRAW）："记忆纠正：量子计算原理" → 主题更正 + corrections=1 + user_correction + 置信度 0.95 + 回到 REMEMBERED（memory_corrected 留痕）；"别再给我这个" → EXPIRED + 删除审计 reason=withdrawn（memory_withdrawn 留痕）；重复撤回幂等（no_memory_target / MEMORY_EXPIRED）；记忆操作不创建新体验
- 会话作用域负向（SESSION-SCOPED-NEG）：模拟分支状态随会话结束失效（getSimulation 拒绝）；已结束会话操作拒绝（INVALID_STATE_TRANSITION）；对照：短期记忆跨会话存活（六类数据状态区分纪律）
- 长期记忆禁用负向（LONGTERM-DISABLED）：静态——源码不含长期记忆 / 偏好画像标识符，四态 / 双来源联合恰定；动态——全流程后记录 source / lifecycle 仅在允许集合内
- Current Intent 覆盖（CURRENT-INTENT-OVERRIDE）：同主题 WHY——memory_signals ×1 注入但提交行为与无记忆时完全一致（EXPLAIN，why 语料逐字节，WAITING/UNDERSTANDING v4——07 §12）；WHAT_IF 无交集 → memory_signals ×0（07 §20 过滤）
- 检索只读负向（RETRIEVAL-READONLY）：零 memory 域事件；零自动启动；state_transitioned 恰为 WHY 流自身两次；连续 getMemory() 快照逐字节一致（07 §22）
- 单一写入者（SINGLE-WRITER）：越权提案（state_update_proposal 含 memory_record）→ POLICY_REJECTED（llm_state_mutation_forbidden）→ llm_output_rejected + state_write_rejected 留痕；快照 records=0；版本不变（GS-06 / CC02 H01/H05）
- 写入过滤负向（WRITE-FILTER）：六类不默认长期记住清单（07 §7）全部 write_filter；运行时级 "为什么一次性兴趣" WHY 分类不变但 STOP 路径写入被过滤

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-1/F-2/F-3/F-4 已关闭（CR-18/CR-19/CR-20/CR-21）；本切片为 F-5 收口
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search——implementation-authorization-s2b-v1.md 待产品负责人签署后实施）
- "采用某分支结论"显式回流操作（F-4 D-03 选项 A 说明：须产品负责人另案版本化定义）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）；生产形态记忆存储治理（隐私六要素已批准方向：cn / 阿里云 / 云存储——属生产部署治理，不属本切片）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- 模拟语料（synthetic/simulate/v1）尾句"本提案为单次模拟，不建立分支状态"为 S1 基础形态遗留文本——F-4 起运行时建立分支状态；语料文本更新属产品语料裁决范围（另案，未决）

## 独立重跑

    cd tools/evidence && npm run s2a-f5   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's2a-f5-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's2a-f5-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
