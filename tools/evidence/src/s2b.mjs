// S2B-0001 — S2b 体验动作扩展动态证据执行器
// （P3-S2B-IMPL-AUTH-01 v1.0.0 §1/§2 授权范围：S2b 首批义务
//   G-1…G-4，依据 S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）
//
// 治理约束（授权 §4 持续约束，ADR-0002 §3/§5）：
// - 仅合成数据；无真实 LLM 提供方调用；无真实用户数据；
// - 失败结果如实登记（运行目录按 RUN_ID 归档，绝不覆盖既有证据）；
// - 退出码 0 只表示本运行断言通过，不设置任何 Gate（G2/G3/G4/G8）
//   或产品状态为 PASS——G3 判定属独立评测人（E5 §2）；
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
const { searchExperienceContext } = await import('../../../src/experience/search');
const {
  firstExperiencePresentation,
  presentationStageFor,
} = await import('../../../src/experience/presentation');
const { why } = await import('../../../src/experience/fixtures/why');
const { create } = await import('../../../src/experience/fixtures/create');
const { deepen } = await import('../../../src/experience/fixtures/deepen');
const { simplify } = await import('../../../src/experience/fixtures/simplify');
const { reframe } = await import('../../../src/experience/fixtures/reframe');

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
const RUN_ID = 'S2B-0001';
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
  'S2b 范围边界（S2B-SEMANTIC-FREEZE-01 §2/§3/§4）：DEEPEN / SIMPLIFY / REFRAME 为顶层语义动作（14 §8 恒等映射，policy_v2.0.0 变更 1，经 policy_v2.1.0 延续）；创作域顶层补丁操作 deepen / simplify / reframe（与 add / remove / modify 同级，非 modify 子型——变更 3）；优先级链 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER（变更 4）',
  '非创作会话保护（policy_v2.0.0 变更 5，经 policy_v2.1.0 延续）：DEEPEN / SIMPLIFY / REFRAME 在无活跃创作对象时按升级规则处理——INVALID_ACTION 升级，不静默执行未定义语义（C3 纪律，model on F-2/F-3 创作会话路由保护）；拒绝先于任何写入（失败不消耗版本号，OBL-01 纪律）',
  'SEARCH 能力纪律（policy_v2.0.0 变更 2/6，经 policy_v2.1.0 延续；14 §7）：内部能力动作，不入 SemanticAction 域；只读——不改变体验、不触发产品动作、不产生事件；无外部网络出口（确定性规则检索，不调用任何提供方）；作用面限当前体验内容 / 创作对象 / 会话内上下文（D-03 选项 A；跨会话记忆检索属 F-5 记忆域 L5，不经 SEARCH 动作）',
  'VERIFY 附列裁决区选项 A：VERIFY 不启用为语义动作——VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层处理，SEARCH 能力在这些路径内被调用（14 §8 路由纪律）',
  'First Experience 呈现路径（S2B-SEMANTIC-FREEZE-01 §4 变更 3；D-04 选项 A）：六阶段呈现（Curiosity → Understanding → Simulation → Branch → Creation → Completion）为已有体验阶段轴的呈现补全——E2 §7 冻结面不变，13 号状态机阶段轴不变（Branch 为 Simulation 阶段的分支探索呈现面——轴外分支记录 F-4 D-02）；只读呈现层——不产生事件、不改变任何状态；视觉样式不在冻结范围（E2 §5）',
  '方向性补丁合成模式（D-01 选项 A；08 §11 局部变更纪律）：结构保持（不重新生成整个作品）、版本单调 +1（S1-12 不变式）、user_changes 权威登记方向性条目（change.direction 标识操作方向——08 §11 不重新生成整个作品）；目标经 TARGET_SYNONYMS 确定性派生（默认 creation 级方向性修改）',
  'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
  '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；陈旧写入返回 STATE_VERSION_CONFLICT 且不得覆盖（S1-12 同族）；失败写入不消耗任何版本号（OBL-01 纪律）',
  'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
  '决策追踪与 LLM/Policy/State 事件分离记录（C6 §22/§23）；创作修改轮次决策追踪 llm_used=false（确定性规则，非模型）',
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

function jsonEquals(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

// ---------------------------------------------------------------------------
// 进程内形态辅助：每案例独立运行时与内存汇
// ---------------------------------------------------------------------------
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
    requestId: `req-s2b-${label}-intent-${shortId()}`,
  });
  if (!intent.ok) {
    throw new Error(`setupChain: resolveIntent failed: ${intent.error.code}`);
  }
  const exp = await runtime.startExperience({
    sessionId: session.sessionId,
    intentId: intent.intent.intentId,
    requestId: `req-s2b-${label}-exp-${shortId()}`,
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

/** 事件汇事件按 event_type 过滤（信封事件；流事件另有 type 字段）。 */
function eventsOf(events, type) {
  return events.filter((event) => event.event_type === type);
}

function expEventsOf(events, experienceId) {
  return events.filter((event) => event.context?.experience_id === experienceId);
}

function tracesOf(traces, experienceId) {
  return traces.filter((trace) => trace.experience_id === experienceId);
}

/** WHY → CREATE 建立链（创作会话基线；返回建立完成后的状态与创作对象）。 */
async function creationBaseline(runtime, label) {
  const { session, intent, exp } = await setupChain(runtime, label);
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么？',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2b-${label}-why-${shortId()}`,
  });
  if (!whySub.ok) {
    throw new Error(`creationBaseline: WHY failed: ${whySub.error.code}`);
  }
  await consume(whySub.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const createSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '这个可以做成一个小游戏。',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: `req-s2b-${label}-create-${shortId()}`,
  });
  if (!createSub.ok) {
    throw new Error(`creationBaseline: CREATE failed: ${createSub.error.code}`);
  }
  await consume(createSub.stream);
  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId);
  return { session, intent, exp, whySub, createSub, stateAfterWhy, state, creation };
}

// ---------------------------------------------------------------------------
// 案例运行器（S2b 首批义务 G-1…G-4；全部进程内形态）
// ---------------------------------------------------------------------------

// --- DIRECTIONAL-DEEPEN / SIMPLIFY / REFRAME：创作会话内方向性补丁 -----
// （冻结文本 §5.2 案例面 1：正常路径——补丁 + 版本 +1 + 事件）
async function directionalFlow(runtime, events, traces, params) {
  const { action, rawInput, fixture, target, label } = params;
  const operation = action.toLowerCase();
  const baseline = await creationBaseline(runtime, label);
  const { session, exp } = baseline;
  const stateAfterCreate = runtime.getExperienceState(exp.experienceId);
  const creationBefore = runtime.getCreation(exp.experienceId);
  const submission = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: action,
    rawInput,
    expectedStateVersion: stateAfterCreate.state.stateVersion,
    requestId: `req-s2b-${label}-1-${shortId()}`,
  });
  const streamEvents = submission.ok ? await consume(submission.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const creationAfter = runtime.getCreation(exp.experienceId);
  const requested = eventsOf(events, `${operation}_requested`);
  const patchApplied = eventsOf(events, 'creation_patch_applied');
  const createTransitions = eventsOf(events, 'state_transitioned').filter(
    (event) => event.properties.event === 'CREATE',
  );
  const decisionTrace = tracesOf(traces, exp.experienceId).at(-1);
  const structurePreserved =
    creationAfter.ok &&
    creationBefore.ok &&
    jsonEquals(creationAfter.creation.objects, creationBefore.creation.objects) &&
    jsonEquals(creationAfter.creation.rules, creationBefore.creation.rules) &&
    jsonEquals(creationAfter.creation.variables, creationBefore.creation.variables) &&
    jsonEquals(creationAfter.creation.interactions, creationBefore.creation.interactions) &&
    jsonEquals(creationAfter.creation.concept, creationBefore.creation.concept);
  const userChangeMatches =
    creationAfter.ok &&
    creationAfter.creation.userChanges.length === 1 &&
    creationAfter.creation.userChanges[0].version === 2 &&
    jsonEquals(creationAfter.creation.userChanges[0].patch, {
      operation,
      target,
      change: { direction: operation },
      summary: rawInput,
    });
  const pass =
    submission.ok &&
    submission.header.policy_decision.selected_action === action &&
    submission.header.policy_decision.policy_version === 'policy_v2.1.0' &&
    submission.header.policy_decision.reason === 'creation_modification' &&
    submission.header.state_version === 7 &&
    `${submission.header.state.status}/${submission.header.state.stage}` === 'ACTIVE/CREATION' &&
    streamEvents[0]?.type === 'submission' &&
    streamEvents.some((event) => event.type === 'done') &&
    streamEvents.some((event) => event.type === 'state_updated') &&
    contentOf(streamEvents) === fixture.chunks.join('') &&
    requested.length === 1 &&
    patchApplied.length === 1 &&
    patchApplied[0].properties.operation === operation &&
    patchApplied[0].properties.target === target &&
    jsonEquals(patchApplied[0].properties.change, { direction: operation }) &&
    patchApplied[0].properties.creation_version === 2 &&
    createTransitions.length === 2 &&
    decisionTrace?.semantic_action === action &&
    decisionTrace?.policy?.policy_version === 'policy_v2.1.0' &&
    decisionTrace?.reason?.primary === 'explicit_user_direction' &&
    decisionTrace?.execution?.llm_used === false &&
    finalState.ok &&
    finalState.state.stateVersion === 8 &&
    finalState.state.status === 'WAITING' &&
    finalState.state.stage === 'CREATION' &&
    finalState.state.lastSemanticAction === action &&
    creationAfter.ok &&
    creationAfter.active === true &&
    creationAfter.creation.version === 2 &&
    structurePreserved &&
    userChangeMatches;
  return {
    classification: classifyInput(rawInput).semanticAction,
    policyAction: submission.ok ? submission.header.policy_decision.selected_action : submission.error.code,
    policyVersion: submission.ok ? submission.header.policy_decision.policy_version : null,
    policyReason: submission.ok ? submission.header.policy_decision.reason : null,
    headerStateVersion: submission.ok ? submission.header.state_version : null,
    headerState: submission.ok ? `${submission.header.state.status}/${submission.header.state.stage}` : 'ERROR',
    streamTypes: streamEvents.map((event) => event.type),
    contentMatchesFixture: contentOf(streamEvents) === fixture.chunks.join(''),
    requestedEvents: requested.length,
    patchAppliedEvents: patchApplied.length,
    patchOperation: patchApplied[0]?.properties.operation ?? null,
    patchTarget: patchApplied[0]?.properties.target ?? null,
    patchChange: patchApplied[0] ? JSON.stringify(patchApplied[0].properties.change) : null,
    patchCreationVersion: patchApplied[0]?.properties.creation_version ?? null,
    createTransitions: createTransitions.length,
    decisionTraceSemanticAction: decisionTrace?.semantic_action ?? null,
    decisionTracePolicyVersion: decisionTrace?.policy?.policy_version ?? null,
    decisionTraceReason: decisionTrace?.reason?.primary ?? null,
    decisionTraceLlmUsed: decisionTrace?.execution?.llm_used ?? null,
    finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : 'ERROR',
    finalStateVersion: finalState.ok ? finalState.state.stateVersion : null,
    lastSemanticAction: finalState.ok ? finalState.state.lastSemanticAction : null,
    creationVersion: creationAfter.ok ? creationAfter.creation.version : null,
    creationActive: creationAfter.ok ? creationAfter.active : null,
    userChanges: creationAfter.ok ? creationAfter.creation.userChanges : null,
    structurePreserved,
    userChangeMatches,
    pass,
  };
}

async function caseDirectionalDeepen(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const observed = await directionalFlow(runtime, events, traces, {
    action: 'DEEPEN',
    rawInput: '再深入关卡一点',
    fixture: deepen,
    target: 'level',
    label: 'deepen',
  });
  const expected = {
    classification: 'DEEPEN（"深入"词表；目标经 TARGET_SYNONYMS 由"关卡"派生为 level）',
    policy: 'DEEPEN → DEEPEN（policy_v2.1.0；14 §8 恒等映射）',
    flow: 'WHY → CREATE → DEEPEN（创作会话内顶层补丁操作）',
    content: 'synthetic/deepen/v1 语料逐字节',
    headerState: 'ACTIVE/CREATION（迁移提交时视图，状态版本 7）',
    finalState: 'WAITING/CREATION（补丁轮次完成，状态版本 8）',
    creation: '版本 2（v1 + 方向性补丁 v2；user_changes 权威登记 direction=deepen 目标 level）',
    structure: 'objects / rules / variables / interactions / concept 逐字段保持（08 §11 局部变更纪律）',
    events: 'deepen_requested ×1 + creation_patch_applied ×1（operation=deepen, target=level, change={direction:deepen}, creation_version=2）+ CREATE 迁移 ×2',
  };
  return { expected, actual: observed, pass: observed.classification === 'DEEPEN' && observed.pass };
}

async function caseDirectionalSimplify(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const observed = await directionalFlow(runtime, events, traces, {
    action: 'SIMPLIFY',
    rawInput: '把难度简单一点',
    fixture: simplify,
    target: 'difficulty',
    label: 'simplify',
  });
  const expected = {
    classification: 'SIMPLIFY（"简单一点"词表；目标经 TARGET_SYNONYMS 由"难度"派生为 difficulty）',
    policy: 'SIMPLIFY → SIMPLIFY（policy_v2.1.0；14 §8 恒等映射）',
    flow: 'WHY → CREATE → SIMPLIFY（创作会话内顶层补丁操作）',
    content: 'synthetic/simplify/v1 语料逐字节',
    headerState: 'ACTIVE/CREATION（迁移提交时视图，状态版本 7）',
    finalState: 'WAITING/CREATION（补丁轮次完成，状态版本 8）',
    creation: '版本 2（v1 + 方向性补丁 v2；user_changes 权威登记 direction=simplify 目标 difficulty）',
    structure: 'objects / rules / variables / interactions / concept 逐字段保持（08 §11 局部变更纪律）',
    events: 'simplify_requested ×1 + creation_patch_applied ×1（operation=simplify, target=difficulty, change={direction:simplify}, creation_version=2）+ CREATE 迁移 ×2',
  };
  return { expected, actual: observed, pass: observed.classification === 'SIMPLIFY' && observed.pass };
}

async function caseDirectionalReframe(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const observed = await directionalFlow(runtime, events, traces, {
    action: 'REFRAME',
    rawInput: '换角度看看难度',
    fixture: reframe,
    target: 'difficulty',
    label: 'reframe',
  });
  const expected = {
    classification: 'REFRAME（"换角度"词表；目标经 TARGET_SYNONYMS 由"难度"派生为 difficulty）',
    policy: 'REFRAME → REFRAME（policy_v2.1.0；14 §8 恒等映射）',
    flow: 'WHY → CREATE → REFRAME（创作会话内顶层补丁操作）',
    content: 'synthetic/reframe/v1 语料逐字节',
    headerState: 'ACTIVE/CREATION（迁移提交时视图，状态版本 7）',
    finalState: 'WAITING/CREATION（补丁轮次完成，状态版本 8）',
    creation: '版本 2（v1 + 方向性补丁 v2；user_changes 权威登记 direction=reframe 目标 difficulty）',
    structure: 'objects / rules / variables / interactions / concept 逐字段保持（08 §11 局部变更纪律）',
    events: 'reframe_requested ×1 + creation_patch_applied ×1（operation=reframe, target=difficulty, change={direction:reframe}, creation_version=2）+ CREATE 迁移 ×2',
  };
  return { expected, actual: observed, pass: observed.classification === 'REFRAME' && observed.pass };
}

// --- ESCALATION-NEG：非创作会话升级路径（负向） ------------------------
// （冻结文本 §5.2 案例面 2；policy_v2.0.0 变更 5）
async function caseEscalationNegative(trace) {
  const scenarios = [
    { action: 'DEEPEN', rawInput: '再深入一点' },
    { action: 'SIMPLIFY', rawInput: '简单一点' },
    { action: 'REFRAME', rawInput: '换角度' },
  ];
  const observations = [];
  for (const scenario of scenarios) {
    const { runtime, events } = createCaseRuntime();
    const classification = classifyInput(scenario.rawInput);
    const { session, exp } = await setupChain(runtime, `esc-${scenario.action.toLowerCase()}`);
    const whySub = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHY',
      rawInput: '为什么？',
      expectedStateVersion: exp.stateVersion,
      requestId: `req-s2b-esc-${scenario.action.toLowerCase()}-why-${shortId()}`,
    });
    if (!whySub.ok) {
      throw new Error(`escalation setup: WHY failed: ${whySub.error.code}`);
    }
    await consume(whySub.stream);
    const stateBefore = runtime.getExperienceState(exp.experienceId);
    const creationBefore = runtime.getCreation(exp.experienceId);
    const submission = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: scenario.action,
      rawInput: scenario.rawInput,
      expectedStateVersion: stateBefore.state.stateVersion,
      requestId: `req-s2b-esc-${scenario.action.toLowerCase()}-1-${shortId()}`,
    });
    const stateAfter = runtime.getExperienceState(exp.experienceId);
    const directionalEvents = events.filter((event) =>
      ['deepen_requested', 'simplify_requested', 'reframe_requested'].includes(event.event_type ?? ''),
    );
    observations.push({
      action: scenario.action,
      rawInput: scenario.rawInput,
      classification: classification.semanticAction,
      submissionOk: submission.ok,
      errorCode: submission.ok ? null : submission.error.code,
      stateVersionBefore: stateBefore.state.stateVersion,
      stateVersionAfter: stateAfter.state.stateVersion,
      stageUnchanged:
        stateBefore.state.status === stateAfter.state.status &&
        stateBefore.state.stage === stateAfter.state.stage,
      creationObjectAbsent: !creationBefore.ok,
      directionalEvents: directionalEvents.length,
      patchAppliedEvents: eventsOf(events, 'creation_patch_applied').length,
    });
  }
  const pass = observations.every(
    (observation) =>
      observation.classification === observation.action &&
      !observation.submissionOk &&
      observation.errorCode === 'INVALID_ACTION' &&
      observation.stateVersionBefore === observation.stateVersionAfter &&
      observation.stageUnchanged &&
      observation.creationObjectAbsent &&
      observation.directionalEvents === 0 &&
      observation.patchAppliedEvents === 0,
  );
  const expected = {
    classification: 'DEEPEN / SIMPLIFY / REFRAME（各动作词表识别——升级为语义守卫，非分类失败）',
    escalation: 'INVALID_ACTION（三动作在无活跃创作对象时按升级规则处理——policy_v2.0.0 变更 5；C3 升级纪律，不静默执行未定义语义）',
    state: '状态版本与视图零增量（拒绝先于任何写入——失败不消耗版本号，OBL-01 纪律）',
    creation: '无创作对象（getCreation 返回错误——非创作会话）',
    events: '零方向性交互事件、零 creation_patch_applied（升级路径不产生任何产品动作）',
  };
  return { expected, actual: { scenarios: observations }, pass };
}

// --- SEARCH-CAPABILITY：SEARCH 内部能力 ---------------------------------
// （冻结文本 §5.2 案例面 3；policy_v2.0.0 变更 2/6；附列裁决区选项 A）
async function caseSearchCapability(trace) {
  // (a) 纯函数：三面作用域 + 相关性判定 + 只读标识
  const related = searchExperienceContext({
    query: '玩家进度',
    experienceContent: 'status=WAITING stage=CREATION version=6 lastAction=CREATE 玩家进度',
    creationObject: { active: true, theme: '为什么', goal: '一个小游戏：玩家进度', version: 1 },
    sessionContext: ['CREATE:做成一个小游戏（玩家进度反馈）'],
  });
  const unrelated = searchExperienceContext({
    query: '量子纠缠',
    experienceContent: 'status=WAITING stage=CREATION version=6 lastAction=CREATE',
    creationObject: { active: true, theme: '为什么', goal: '一个小游戏', version: 1 },
    sessionContext: ['CREATE:做成一个小游戏'],
  });
  const inactiveCreation = searchExperienceContext({
    query: '为什么',
    experienceContent: 'status=WAITING stage=UNDERSTANDING version=4',
    creationObject: { active: false, theme: '为什么', goal: '一个小游戏', version: 1 },
    sessionContext: [],
  });
  const facetChecks = [
    {
      name: 'related.readOnly',
      actual: related.read_only,
      expected: true,
      matches: related.read_only === true,
    },
    {
      name: 'related.facets',
      actual: related.facets.map((facet) => facet.facet),
      expected: ['experience_content', 'creation_object', 'session_context'],
      matches: jsonEquals(
        related.facets.map((facet) => facet.facet),
        ['experience_content', 'creation_object', 'session_context'],
      ),
    },
    {
      name: 'related.allRelevant',
      actual: related.facets.map((facet) => facet.relevant),
      expected: [true, true, true],
      matches: jsonEquals(
        related.facets.map((facet) => facet.relevant),
        [true, true, true],
      ),
    },
    {
      name: 'unrelated.allIrrelevant',
      actual: unrelated.facets.map((facet) => facet.relevant),
      expected: [false, false, false],
      matches: jsonEquals(
        unrelated.facets.map((facet) => facet.relevant),
        [false, false, false],
      ),
    },
    {
      name: 'unrelated.readOnly',
      actual: unrelated.read_only,
      expected: true,
      matches: unrelated.read_only === true,
    },
    {
      name: 'inactiveCreation.facetSkipped',
      actual: inactiveCreation.facets[1],
      expected: { facet: 'creation_object', relevant: false, summary: '无活跃创作对象（只读面跳过）' },
      matches:
        inactiveCreation.facets[1].facet === 'creation_object' &&
        inactiveCreation.facets[1].relevant === false &&
        inactiveCreation.facets[1].summary === '无活跃创作对象（只读面跳过）',
    },
    {
      name: 'inactiveCreation.queryRelevantToExperience',
      actual: inactiveCreation.facets[0].relevant,
      expected: false,
      matches: inactiveCreation.facets[0].relevant === false,
    },
  ];

  // (b) VERIFY 类输入路由（附列裁决区选项 A：VERIFY 不启用为语义动作——
  //     VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层处理）
  const verifyStyleInputs = [
    { input: '这个为什么是这样', expected: 'WHY' },
    { input: '直接告诉我这个对吗', expected: 'DIRECT_ANSWER' },
    { input: '这个对吗', expected: 'DIRECT_ANSWER' },
  ];
  const verifyRouting = verifyStyleInputs.map(({ input, expected }) => {
    const actual = classifyInput(input).semanticAction;
    return { input, expected, actual, matches: actual === expected };
  });

  // (c) 运行时 WHY 路径：VERIFY 类输入经既有解释层端到端执行——
  //     SEARCH 能力在生成上下文内被调用（buildGenerationContext），无副作用
  const { runtime, events, traces } = createCaseRuntime();
  const { session, exp } = await setupChain(runtime, 'search');
  const submission = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '这个为什么是这样',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2b-search-why-${shortId()}`,
  });
  const streamEvents = submission.ok ? await consume(submission.stream) : [];
  const stateAfter = runtime.getExperienceState(exp.experienceId);
  const whyRoundEvents = expEventsOf(events, exp.experienceId);
  const patchEvents = eventsOf(whyRoundEvents, 'creation_patch_applied');
  const memoryEvents = whyRoundEvents.filter((event) =>
    (event.event_type ?? '').startsWith('memory_'),
  );
  const directionalEvents = whyRoundEvents.filter((event) =>
    ['deepen_requested', 'simplify_requested', 'reframe_requested'].includes(event.event_type ?? ''),
  );
  const decisionTrace = tracesOf(traces, exp.experienceId).at(-1);

  // (d) 只读不变式：直接调用检索能力——事件汇零增量、状态版本零增量
  const eventsBefore = events.length;
  const stateVersionBefore = stateAfter.state.stateVersion;
  searchExperienceContext({
    query: '玩家',
    experienceContent: 'status=WAITING stage=CREATION version=6',
    creationObject: { active: true, theme: '为什么', goal: '一个小游戏', version: 1 },
    sessionContext: [],
  });
  searchExperienceContext({
    query: '出口',
    experienceContent: 'status=WAITING stage=CREATION version=6',
    creationObject: { active: true, theme: '为什么', goal: '一个小游戏', version: 1 },
    sessionContext: [],
  });
  const readOnlyInvariant =
    events.length === eventsBefore &&
    runtime.getExperienceState(exp.experienceId).state.stateVersion === stateVersionBefore;

  // (e) 静态边界（已提交源码字节——不做代码推断，只验证事实）：
  //     search.ts 为纯函数模块（无运行时 import）且无外部网络出口模式；
  //     runtime.ts 经 buildGenerationContext 在两条生成路径集成 SEARCH
  const searchSource = await readFile(path.join(repoRoot, 'src', 'experience', 'search.ts'), 'utf8');
  const runtimeSource = await readFile(path.join(repoRoot, 'src', 'experience', 'runtime.ts'), 'utf8');
  const noRuntimeImports = !/^import\s+(?!type\b)/m.test(searchSource);
  const noNetworkExit =
    !/\bfetch\s*\(/.test(searchSource) &&
    !/undici/.test(searchSource) &&
    !/node:http/.test(searchSource) &&
    !/node:https/.test(searchSource) &&
    !/https?:\/\//.test(searchSource);
  const searchIntegrated =
    runtimeSource.includes('import { searchExperienceContext') &&
    runtimeSource.includes('search_context: searchContext');
  const generationPaths = (runtimeSource.match(/buildGenerationContext\(input\)/g) ?? []).length;

  const pass =
    facetChecks.every((check) => check.matches) &&
    verifyRouting.every((route) => route.matches) &&
    submission.ok &&
    submission.header.policy_decision.selected_action === 'EXPLAIN' &&
    submission.header.policy_decision.policy_version === 'policy_v2.1.0' &&
    contentOf(streamEvents) === why.chunks.join('') &&
    stateAfter.ok &&
    stateAfter.state.stateVersion === 4 &&
    stateAfter.state.status === 'WAITING' &&
    stateAfter.state.stage === 'UNDERSTANDING' &&
    patchEvents.length === 0 &&
    memoryEvents.length === 0 &&
    directionalEvents.length === 0 &&
    readOnlyInvariant &&
    noRuntimeImports &&
    noNetworkExit &&
    searchIntegrated &&
    generationPaths >= 2;
  const expected = {
    searchCapability: '纯函数只读检索——read_only 恒真；三面（experience_content / creation_object / session_context，D-03 选项 A）；2 字窗口相关性判定；非活跃创作对象面跳过',
    verifyRouting: 'VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层路由（附列裁决区选项 A——VERIFY 不启用为语义动作；无 VERIFY 语义动作产生）',
    whyRound: 'VERIFY 类输入"这个为什么是这样"经 WHY 路径端到端执行——EXPLAIN（policy_v2.1.0）、内容逐字节等于 why 语料、WAITING/UNDERSTANDING v4；生成上下文内 SEARCH 能力被调用（buildGenerationContext——两条生成路径），零创作补丁 / 零记忆事件 / 零方向性事件（只读，不触发产品动作）',
    readOnlyInvariant: '直接调用检索能力——事件汇零增量、状态版本零增量（只读不变式）',
    staticBoundary: 'search.ts 已提交源字节：无运行时 import（纯函数模块）、无 fetch/undici/node:http/node:https/URL 模式（无外部网络出口）；runtime.ts 经 buildGenerationContext 集成（两条生成路径均携带 search_context）',
  };
  const actual = {
    facetChecks,
    verifyRouting,
    whyRound: {
      selectedAction: submission.ok ? submission.header.policy_decision.selected_action : submission.error.code,
      policyVersion: submission.ok ? submission.header.policy_decision.policy_version : null,
      contentMatchesFixture: contentOf(streamEvents) === why.chunks.join(''),
      finalState: stateAfter.ok ? `${stateAfter.state.status}/${stateAfter.state.stage} v${stateAfter.state.stateVersion}` : 'ERROR',
      patchEvents: patchEvents.length,
      memoryEvents: memoryEvents.length,
      directionalEvents: directionalEvents.length,
      decisionTraceLlmUsed: decisionTrace?.execution?.llm_used ?? null,
    },
    readOnlyInvariant,
    staticBoundary: {
      noRuntimeImports,
      noNetworkExit,
      searchIntegrated,
      generationPaths,
    },
  };
  return { expected, actual, pass };
}

// --- FIRST-EXPERIENCE：First Experience 呈现路径 -------------------------
// （冻结文本 §5.2 案例面 4；S2B-SEMANTIC-FREEZE-01 §4 变更 3；D-04 选项 A）
async function caseFirstExperiencePresentation(trace) {
  // (a) 呈现模型结构（只读导出——E2 §5 入口 / §6 六阶段 / §7 完成·退出·中断）
  const model = firstExperiencePresentation();
  const modelChecks = [
    {
      name: 'entryFlow',
      actual: model.entryFlow.map((step) => step.step),
      expected: ['question_presented', 'exploration_started', 'change_one'],
      matches: jsonEquals(
        model.entryFlow.map((step) => step.step),
        ['question_presented', 'exploration_started', 'change_one'],
      ),
    },
    {
      name: 'stages（六阶段）',
      actual: model.stages.map((step) => step.step),
      expected: ['curiosity', 'understanding', 'simulation', 'branch', 'creation', 'completion'],
      matches: jsonEquals(
        model.stages.map((step) => step.step),
        ['curiosity', 'understanding', 'simulation', 'branch', 'creation', 'completion'],
      ),
    },
    {
      name: 'stages→stateMachineStage 映射',
      actual: model.stages.map((step) => step.stateMachineStage),
      expected: ['CURIOSITY', 'UNDERSTANDING', 'SIMULATION', 'SIMULATION', 'CREATION', 'COMPLETION'],
      matches: jsonEquals(
        model.stages.map((step) => step.stateMachineStage),
        ['CURIOSITY', 'UNDERSTANDING', 'SIMULATION', 'SIMULATION', 'CREATION', 'COMPLETION'],
      ),
    },
    {
      name: 'completionFlow',
      actual: model.completionFlow.map((step) => step.step),
      expected: ['goal_reached', 'completion_registered', 'short_term_memory_recorded'],
      matches: jsonEquals(
        model.completionFlow.map((step) => step.step),
        ['goal_reached', 'completion_registered', 'short_term_memory_recorded'],
      ),
    },
    {
      name: 'exitFlow',
      actual: model.exitFlow.map((step) => step.step),
      expected: ['exit_requested', 'exit_registered'],
      matches: jsonEquals(
        model.exitFlow.map((step) => step.step),
        ['exit_requested', 'exit_registered'],
      ),
    },
    {
      name: 'interruptFlow',
      actual: model.interruptFlow.map((step) => step.step),
      expected: ['interrupt_requested', 'old_candidate_cancelled', 'new_cycle'],
      matches: jsonEquals(
        model.interruptFlow.map((step) => step.step),
        ['interrupt_requested', 'old_candidate_cancelled', 'new_cycle'],
      ),
    },
  ];

  // (b) 纯映射函数（含 BRANCH 区分——Simulation 呈现面）
  const mappingChecks = [
    { view: { status: 'ENTERING', stage: 'CURIOSITY' }, branchActive: false, expected: 'CURIOSITY' },
    { view: { status: 'READY', stage: 'UNDERSTANDING' }, branchActive: false, expected: 'UNDERSTANDING' },
    { view: { status: 'WAITING', stage: 'SIMULATION' }, branchActive: false, expected: 'SIMULATION' },
    { view: { status: 'WAITING', stage: 'SIMULATION' }, branchActive: true, expected: 'BRANCH' },
    { view: { status: 'WAITING', stage: 'CREATION' }, branchActive: false, expected: 'CREATION' },
    { view: { status: 'COMPLETED', stage: 'COMPLETION' }, branchActive: false, expected: 'COMPLETION' },
  ].map(({ view, branchActive, expected }) => {
    const actual = presentationStageFor(view, branchActive);
    return { view: `${view.status}/${view.stage}`, branchActive, expected, actual, matches: actual === expected };
  });

  // (c) 默认查询（无体验——CURIOSITY 入口呈现）
  const defaultQuery = runtimeDefaultQuery();
  const defaultQueryChecks = [
    { name: 'experienceId', actual: defaultQuery.current.experienceId, expected: null, matches: defaultQuery.current.experienceId === null },
    { name: 'view', actual: defaultQuery.current.view, expected: null, matches: defaultQuery.current.view === null },
    { name: 'presentationStage', actual: defaultQuery.current.presentationStage, expected: 'CURIOSITY', matches: defaultQuery.current.presentationStage === 'CURIOSITY' },
    { name: 'branchActive', actual: defaultQuery.current.branchActive, expected: false, matches: defaultQuery.current.branchActive === false },
  ];

  // (d) 生命周期游走：六阶段全路径（CURIOSITY → UNDERSTANDING →
  //     SIMULATION/BRANCH → CREATION → COMPLETION——既有阶段轴上的呈现补全）
  const walkRuntime = createCaseRuntime();
  const { runtime, events } = walkRuntime;
  const { session, exp } = await setupChain(runtime, 'presentation');
  const walk = [];
  const recordWalk = (label) => {
    const state = runtime.getExperienceState(exp.experienceId).state;
    const query = runtime.getFirstExperiencePresentation(exp.experienceId);
    const snapshot = runtime.getSimulation(exp.experienceId);
    const branchActive =
      snapshot.ok &&
      snapshot.simulation.currentBranchId != null &&
      snapshot.simulation.branches.find(
        (branch) => branch.branchId === snapshot.simulation.currentBranchId,
      )?.lifecycle === 'ACTIVE';
    walk.push({
      label,
      view: `${state.status}/${state.stage}`,
      stateVersion: state.stateVersion,
      branchActive,
      presentationStage: query.current.presentationStage,
      lastSemanticAction: state.lastSemanticAction,
    });
  };
  recordWalk('START');
  const rounds = [
    { label: 'WHY', semanticAction: 'WHY', rawInput: '为什么？', expectedStage: 'UNDERSTANDING' },
    { label: 'WHAT_IF', semanticAction: 'WHAT_IF', rawInput: '如果摩擦力为零会怎样', expectedStage: null },
    { label: 'CREATE', semanticAction: 'CREATE', rawInput: '这个可以做成一个小游戏。', expectedStage: 'CREATION' },
    { label: 'DEEPEN', semanticAction: 'DEEPEN', rawInput: '再深入关卡一点', expectedStage: 'CREATION' },
    { label: 'STOP', semanticAction: 'STOP', rawInput: '好了', expectedStage: 'COMPLETION' },
  ];
  for (const round of rounds) {
    const state = runtime.getExperienceState(exp.experienceId).state;
    const submission = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: round.semanticAction,
      rawInput: round.rawInput,
      expectedStateVersion: state.stateVersion,
      requestId: `req-s2b-pres-${round.label.toLowerCase()}-${shortId()}`,
    });
    if (!submission.ok) {
      walk.push({ label: round.label, error: submission.error.code });
      break;
    }
    await consume(submission.stream);
    recordWalk(round.label);
  }
  const creationAfterWalk = runtime.getCreation(exp.experienceId);
  // 生命周期期望（逐轮观测事实——startExperience 内候选选定
  // 完成：ENTERING/CURIOSITY → READY/UNDERSTANDING v2，瞬态
  // CURIOSITY 由纯映射（mappingChecks[0]）与默认查询覆盖；
  // STOP 完成路径消耗 +1 版本（s2a-f2 COMPLETION 契约：
  // stateVersion === before + 1）。
  const expectedViews = [
    'READY/UNDERSTANDING',
    'WAITING/UNDERSTANDING',
    'WAITING/SIMULATION',
    'WAITING/CREATION',
    'WAITING/CREATION',
    'COMPLETED/COMPLETION',
  ];
  const expectedVersions = [2, 4, 6, 8, 10, 11];
  const expectedActions = [null, 'WHY', 'WHAT_IF', 'CREATE', 'DEEPEN', 'STOP'];
  // 呈现阶段期望：WHAT_IF 轮按分支激活区分 SIMULATION / BRANCH
  // （Simulation 呈现面——轴外分支记录 F-4 D-02，阶段轴不变）。
  const expectedStages = ['UNDERSTANDING', 'UNDERSTANDING', null, 'CREATION', 'CREATION', 'COMPLETION'];
  const walkPass =
    walk.length === 6 &&
    walk.every(
      (entry, index) =>
        entry.view === expectedViews[index] &&
        entry.stateVersion === expectedVersions[index] &&
        entry.lastSemanticAction === expectedActions[index] &&
        (expectedStages[index] === null
          ? entry.presentationStage === (entry.branchActive ? 'BRANCH' : 'SIMULATION')
          : entry.presentationStage === expectedStages[index]),
    ) &&
    creationAfterWalk.ok &&
    creationAfterWalk.active === false;
  const pass =
    modelChecks.every((check) => check.matches) &&
    mappingChecks.every((check) => check.matches) &&
    defaultQueryChecks.every((check) => check.matches) &&
    walkPass;
  const expected = {
    model: '入口流程 3 步（question_presented / exploration_started / change_one）；六阶段（curiosity / understanding / simulation / branch / creation / completion——branch 的 stateMachineStage=SIMULATION）；完成流程 3 步；退出流程 2 步；中断流程 3 步（E2 §5/§6/§7 冻结面）',
    mapping: '状态机视图 → 呈现阶段：ENTERING/CURIOSITY→CURIOSITY；READY/UNDERSTANDING→UNDERSTANDING；WAITING/SIMULATION→SIMULATION（branchActive=false）或 BRANCH（branchActive=true——分支探索呈现面）；WAITING/CREATION→CREATION；COMPLETED/COMPLETION→COMPLETION',
    defaultQuery: '无体验查询——current.experienceId=null / view=null / presentationStage=CURIOSITY / branchActive=false',
    lifecycle: 'START(READY/UNDERSTANDING v2, UNDERSTANDING——startExperience 内候选选定完成；瞬态 ENTERING/CURIOSITY 由纯映射与默认查询覆盖) → WHY(WAITING/UNDERSTANDING v4, UNDERSTANDING) → WHAT_IF(WAITING/SIMULATION v6, BRANCH——首轮模拟创建激活分支；SIMULATION 面由纯映射覆盖) → CREATE(WAITING/CREATION v8, CREATION) → DEEPEN(WAITING/CREATION v10, CREATION) → STOP(COMPLETED/COMPLETION v11, COMPLETION——完成路径消耗 +1 版本)；终态创作 active=false（STOP 完成路径登记）',
  };
  const actual = {
    modelChecks,
    mappingChecks,
    defaultQueryChecks,
    walk,
    creationActiveAfterWalk: creationAfterWalk.ok ? creationAfterWalk.active : null,
  };
  return { expected, actual, pass };
}

/** 默认呈现查询（独立运行时——无体验上下文）。 */
function runtimeDefaultQuery() {
  const { runtime } = createCaseRuntime();
  return runtime.getFirstExperiencePresentation();
}

// --- PRIORITY-CHAIN：冻结优先级链 ---------------------------------------
// （冻结文本 §5.2 案例面 5；policy_v2.0.0 变更 4）
async function casePriorityChain(trace) {
  // (a) 分类器碰撞核验（逐层：STOP > CHANGE_DIRECTION > CORRECTION >
  //     CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER）
  const collisions = [
    { input: '好了再深入一点', expected: 'STOP', discipline: 'P-01 STOP 永远优先（STOP > DEEPEN——输入同时含 STOP 与 DEEPEN 词表标记）' },
    { input: '换个角度看看', expected: 'CHANGE_DIRECTION', discipline: 'P-03 显式方向变更优先（CHANGE_DIRECTION > REFRAME——"换个"命中变更层，高于 REFRAME 的"换角度"）' },
    { input: '做成一个小游戏再深入一点', expected: 'CREATE', discipline: 'CREATE > DEEPEN（显式创造意图优先于方向性操作）' },
    { input: '再深入一点为什么', expected: 'DEEPEN', discipline: 'DEEPEN > WHY（方向性操作优先于解释层）' },
    { input: '简单一点为什么', expected: 'SIMPLIFY', discipline: 'SIMPLIFY > WHY' },
    { input: '换角度看看为什么', expected: 'REFRAME', discipline: 'REFRAME > WHY' },
    { input: '换角度', expected: 'REFRAME', discipline: 'REFRAME 典范输入（"换角度"不含"换个/换一"——不落入 CHANGE_DIRECTION 层）' },
    { input: '为什么', expected: 'WHY', discipline: '基线解释层（链尾序不变——PD-12 解释顺序 WHY > WHAT_IF）' },
  ];
  const classifierResults = collisions.map(({ input, expected, discipline }) => {
    const actual = classifyInput(input).semanticAction;
    return { input, expected, actual, discipline, matches: actual === expected };
  });

  // (b) 运行时优先级证明：创作会话内 STOP 输入（含 DEEPEN 词表标记）
  //     经 STOP 执行路径完成——STOP 优先于 DEEPEN 在运行时同样成立
  const { runtime, events } = createCaseRuntime();
  const baseline = await creationBaseline(runtime, 'priority');
  const { session, exp } = baseline;
  const stateAfterCreate = runtime.getExperienceState(exp.experienceId);
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了再深入一点',
    expectedStateVersion: stateAfterCreate.state.stateVersion,
    requestId: `req-s2b-priority-stop-${shortId()}`,
  });
  const stopStream = stop.ok ? await consume(stop.stream) : [];
  const finalState = runtime.getExperienceState(exp.experienceId);
  const creationAfterStop = runtime.getCreation(exp.experienceId);
  const completedEvents = eventsOf(events, 'creation_completed');
  const patchEvents = eventsOf(events, 'creation_patch_applied');
  const runtimeProof =
    stop.ok &&
    stop.header.policy_decision.selected_action === 'STOP' &&
    finalState.ok &&
    finalState.state.status === 'COMPLETED' &&
    finalState.state.stage === 'COMPLETION' &&
    finalState.state.lastSemanticAction === 'STOP' &&
    creationAfterStop.ok &&
    creationAfterStop.active === false &&
    completedEvents.length === 1 &&
    patchEvents.length === 0;
  const pass = classifierResults.every((result) => result.matches) && runtimeProof;
  const expected = {
    classifier: '碰撞输入逐层裁决：STOP 压倒 DEEPEN（P-01）；CHANGE_DIRECTION 压倒 REFRAME（P-03 层先判）；CREATE 压倒 DEEPEN（显式创造优先）；DEEPEN/SIMPLIFY/REFRAME 压倒 WHY（新动作层先判）；"换角度"不落入 CHANGE_DIRECTION（词表碰撞核验）；"为什么"基线 WHY（链尾序不变）',
    runtime: '创作会话内"好了再深入一点"（含 DEEPEN 词表标记）经 STOP 执行路径完成——selected_action=STOP、COMPLETED/COMPLETION 终态、creation_completed ×1、active=false、零 creation_patch_applied（STOP 优先于 DEEPEN 于运行时成立；P-01 链不动）',
  };
  const actual = {
    classifierResults,
    runtimeProof: {
      submissionOk: stop.ok,
      selectedAction: stop.ok ? stop.header.policy_decision.selected_action : stop.error.code,
      finalState: finalState.ok ? `${finalState.state.status}/${finalState.state.stage}` : 'ERROR',
      lastSemanticAction: finalState.ok ? finalState.state.lastSemanticAction : null,
      creationActive: creationAfterStop.ok ? creationAfterStop.active : null,
      creationCompletedEvents: completedEvents.length,
      patchAppliedEvents: patchEvents.length,
      stopContentLength: contentOf(stopStream).length,
    },
  };
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表（冻结文本 §5.2 案例面五组；E5 §4 案例记录 12 字段）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'DIRECTIONAL-DEEPEN',
    scope: 'S2b G-1：DEEPEN 顶层语义动作正常路径（创作会话内方向性补丁：顶层补丁操作 + 版本单调 +1 + user_changes 权威登记 + 结构保持 + deepen_requested 事件）',
    precondition: 'WHY → CREATE 建立创作会话（WAITING/CREATION v6；创作 v1，USER_FEEDBACK 阶段）',
    inputFault: '无（正常路径；"再深入关卡一点" → DEEPEN，目标经 TARGET_SYNONYMS 由"关卡"派生为 level）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 1；14 §8 恒等映射；08 §十 方向性操作自然语示例锚点；policy_v2.0.0 变更 1/3/4',
    form: 'in-process',
    servers: [],
    run: caseDirectionalDeepen,
  },
  {
    caseId: 'DIRECTIONAL-SIMPLIFY',
    scope: 'S2b G-1：SIMPLIFY 顶层语义动作正常路径（创作会话内方向性补丁：simplify_requested 事件 + 版本 +1 + user_changes 登记 direction=simplify）',
    precondition: 'WHY → CREATE 建立创作会话（WAITING/CREATION v6；创作 v1，USER_FEEDBACK 阶段）',
    inputFault: '无（正常路径；"把难度简单一点" → SIMPLIFY，目标经 TARGET_SYNONYMS 由"难度"派生为 difficulty）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 1；14 §8 恒等映射；08 §十 方向性操作自然语示例锚点；policy_v2.0.0 变更 1/3/4',
    form: 'in-process',
    servers: [],
    run: caseDirectionalSimplify,
  },
  {
    caseId: 'DIRECTIONAL-REFRAME',
    scope: 'S2b G-1：REFRAME 顶层语义动作正常路径（创作会话内方向性补丁：reframe_requested 事件 + 版本 +1 + user_changes 登记 direction=reframe）',
    precondition: 'WHY → CREATE 建立创作会话（WAITING/CREATION v6；创作 v1，USER_FEEDBACK 阶段）',
    inputFault: '无（正常路径；"换角度看看难度" → REFRAME，目标经 TARGET_SYNONYMS 由"难度"派生为 difficulty）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 1；14 §8 恒等映射；08 §十 方向性操作自然语示例锚点；policy_v2.0.0 变更 1/3/4',
    form: 'in-process',
    servers: [],
    run: caseDirectionalReframe,
  },
  {
    caseId: 'ESCALATION-NEG',
    scope: 'S2b G-1 负向：非创作会话升级路径——DEEPEN / SIMPLIFY / REFRAME 在无活跃创作对象时按升级规则处理（INVALID_ACTION 升级，不静默执行未定义语义）',
    precondition: 'WHY 建立体验会话但无创作对象（WAITING/UNDERSTANDING v4；getCreation 返回错误）',
    inputFault: '无创作会话的方向性操作输入（"再深入一点" / "简单一点" / "换角度"——分类正确但执行升级拒绝）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 2；policy_v2.0.0 变更 5；C3 升级纪律（model on F-2/F-3 创作会话路由保护）',
    form: 'in-process',
    servers: [],
    run: caseEscalationNegative,
  },
  {
    caseId: 'SEARCH-CAPABILITY',
    scope: 'S2b G-2：SEARCH 内部能力——三面只读检索（相关性判定 / 非活跃创作对象面跳过）；VERIFY 类输入经既有 WHY / DIRECT_ANSWER 解释层路由（附列裁决区选项 A）；WHY 路径端到端无副作用；只读不变式；静态边界（纯函数模块 / 无外部网络出口 / 双生成路径集成）',
    precondition: 'WHY 体验会话（VERIFY 类输入"这个为什么是这样"经 WHY 解释层执行）；已提交源码字节可读',
    inputFault: '无（能力纪律验证：相关 / 不相关检索输入；VERIFY 类输入；只读调用前后事件汇与状态版本快照比对）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 3 + 附列裁决区选项 A；policy_v2.0.0 变更 2/6；14 §7/§8',
    form: 'in-process',
    servers: [],
    run: caseSearchCapability,
  },
  {
    caseId: 'FIRST-EXPERIENCE',
    scope: 'S2b G-3：First Experience 完整呈现——入口流程 / 六阶段（含 BRANCH Simulation 呈现面区分）/ 完成 / 退出 / 中断流程模型；视图→呈现阶段映射；默认查询；生命周期游走（六阶段全路径 START→WHY→WHAT_IF→CREATE→DEEPEN→STOP）',
    precondition: '独立运行时（默认查询）+ WHY 意图体验会话（生命周期游走）',
    inputFault: '无（呈现路径验证：只读查询不产生事件、不改变状态；分支激活区分经模拟域快照判定）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 4 + §4 变更 3；E2 §5/§6/§7；D-04 选项 A',
    form: 'in-process',
    servers: [],
    run: caseFirstExperiencePresentation,
  },
  {
    caseId: 'PRIORITY-CHAIN',
    scope: 'S2b G-1 边界：冻结优先级链——STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER；分类器碰撞核验 8 组 + 运行时 STOP 优先于 DEEPEN 证明',
    precondition: '分类器确定性规则（纯函数）；创作会话（WHY → CREATE 建立，运行时优先级证明）',
    inputFault: '碰撞输入（含多词表标记的输入——逐层裁决验证优先级链）',
    sourceClause: 'S2B-SEMANTIC-FREEZE-01 §5.2 案例面 5；policy_v2.0.0 变更 4；P-01/P-03',
    form: 'in-process',
    servers: [],
    run: casePriorityChain,
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1 / F2 / F3 / G3 / S2A).
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

  // Golden regression binding (E5 §3)：S2b 证据运行前，G3-GOLDEN-0001
  // 须已在 policy_v2.1.0 / state_machine_v1.5.0 通过（40/40）——
  // 本运行的回归基线绑定（失败为 FATAL）。
  const goldenSummaryPath = path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'G3-GOLDEN-0001', 'summary.json');
  const goldenSummary = JSON.parse(await readFile(goldenSummaryPath, 'utf8'));
  const goldenMetadata = JSON.parse(
    await readFile(path.join(repoRoot, 'artifacts', 'evidence', 'runs', 'G3-GOLDEN-0001', 'run-metadata.json'), 'utf8'),
  );
  const goldenRegressionOk =
    goldenSummary.exitCode === 0 &&
    goldenSummary.executedCases === 40 &&
    goldenSummary.allExecutedCasesPass === true &&
    goldenSummary.allAssertionsPass === true &&
    goldenMetadata.policy?.version?.includes('policy_v2.1.0') &&
    goldenMetadata.stateMachine?.version === 'state_machine_v1.5.0';
  log(`golden regression binding: G3-GOLDEN-0001 exitCode=${goldenSummary.exitCode} cases=${goldenSummary.executedCases}/${goldenSummary.cases?.length ?? goldenSummary.executedCases} allPass=${goldenSummary.allExecutedCasesPass} policy=${goldenMetadata.policy?.version} stateMachine=${goldenMetadata.stateMachine?.version}`);
  if (!goldenRegressionOk) {
    fatal('golden regression binding failed: G3-GOLDEN-0001 须在 policy_v2.1.0 / state_machine_v1.5.0 通过（40/40）后方可运行 S2B-0001');
  }

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
  // S2b scope is semantic-action / capability / presentation semantics,
  // exercised against the real committed runtime via module.registerHooks
  // type-stripping).
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
    'tools/evidence/src/s2b.mjs',
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
    obligation: 'P3-S2B-IMPL-AUTH-01 v1.0.0 §1/§2：S2b 体验动作扩展首批义务 G-1…G-4（S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：DEEPEN/SIMPLIFY/REFRAME 顶层语义动作 + SEARCH 内部能力 + First Experience 完整呈现）',
    authorization: { id: 'P3-S2B-IMPL-AUTH-01', version: '1.0.0', issued: '2026-10-09', note: '产品负责人签署生效（AUTHORIZED）——生效条件双满足（语义冻结 FROZEN + F-5 关闭）' },
    obligationTraceability: {
      'S2b 体验动作扩展（首批义务 G-1…G-4）': {
        semanticFreeze: 'docs/product/p3-s1/s2b-semantic-freeze-staged.md（S2B-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-09 产品负责人签署）',
        frozenDecisions: {
          'D-01': '选项 A——DEEPEN / SIMPLIFY / REFRAME 启用为顶层语义动作；创作域顶层补丁操作承载（与 add / remove / modify 同级，非 modify 子型）',
          'D-02': '选项 A——SEARCH 以内部能力动作启用（14 §7 taxonomy 既有；不入 SemanticAction 域）',
          'D-03': '选项 A——SEARCH 作用面限当前体验内容 / 创作对象 / 会话内上下文（跨会话记忆检索属 F-5 记忆域 L5，不经 SEARCH）',
          'D-04': '选项 A——First Experience 完整呈现（入口流程 + 六阶段 + 完成 / 退出 / 中断；E2 §7 冻结面不变；只读呈现层）',
          'D-05': '选项 A——policy_v2.0.0 + 优先级链扩展冻结 + state_machine_v1.5.0',
          '附列项（VERIFY）': '选项 A——VERIFY 不启用为语义动作；VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层处理，SEARCH 能力在这些路径内被调用',
        },
        implementationFiles: [
          'src/experience/classifier.ts（DEEPEN / SIMPLIFY / REFRAME 识别词表——判定位置 CREATE 之后、WHY 之前）',
          'src/experience/policy.ts（policy_v2.0.0 变更 1–6：SemanticAction/PolicyAction 域扩展 + 恒等映射 + 优先级链 + 非创作会话保护 + SEARCH 能力纪律）',
          'src/experience/creation.ts（创作域顶层补丁操作 deepen / simplify / reframe + buildDirectionalPatch + applyCreationPatch 合成模式结构保持）',
          'src/experience/runtime.ts（方向性路由 + 非创作会话 INVALID_ACTION 升级 + SEARCH 经 buildGenerationContext 集成 + First Experience 呈现查询 + 交互事件词表）',
          'src/experience/search.ts（searchExperienceContext 纯函数——只读三面检索）',
          'src/experience/presentation.ts（First Experience 呈现模型 + 视图→呈现阶段映射）',
          'src/experience/state-machine.ts（state_machine_v1.5.0 变更文本——变更 2/3 无需新迁移）',
          'src/experience/fixtures/{deepen,simplify,reframe}.ts（合成语料 synthetic/<op>/v1）',
        ],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: `G3-GOLDEN-0001 PASSED（40/40 案例；policy_v2.1.0 / state_machine_v1.5.0；本运行前置绑定验证 exitCode=${goldenSummary.exitCode}）`,
      },
    },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17', 'PD-21', 'PD-22', 'PD-23'],
      note: 'PD-23：S2 范围裁决（选项 B 分批——S2b 体验动作扩展为一批次）；PD-21/PD-22 见 G07 处置与 P2 关闭裁定',
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
        '创作域子状态机：补丁操作域扩展 {add, remove, modify, deepen, simplify, reframe}（S2b 变更 1——轴外承载纪律不变，F-2 D-02；每次合法补丁提交版本 +1，S1-12）',
        'SEARCH 能力状态纪律：无状态只读能力调用，不产生体验状态迁移、不产生创作域补丁（state_machine 无 SEARCH 迁移行——能力纪律经 policy_v2.1.0 §6 承载，policy_v2.0.0 变更 2 引入并经 policy_v2.1.0 延续，S2b 变更 2）',
        'First Experience 呈现路径：六阶段呈现迁移为已有体验阶段轴的呈现补全（E2 §6；13 号状态机阶段轴不变——S2b 变更 3）',
      ],
      source: 'SRC-05 / 13',
    },
    policy: {
      contract: 'C1',
      version: 'policy_v2.1.0',
      changes: [
        '变更 1：SemanticAction 域扩展——启用 DEEPEN / SIMPLIFY / REFRAME（14 §8 恒等映射）；SEARCH 不入 SemanticAction 域（内部能力动作，14 §7）；VERIFY 不启用（附列裁决区选项 A）',
        '变更 2：PolicyAction 域——确认 SEARCH 为内部策略动作（14 §7 taxonomy 既有，无新增）；VERIFY 类输入按既有解释层路径处理，SEARCH 能力在这些路径内被调用（14 §8 路由纪律）',
        '变更 3：创作域补丁操作域扩展——{add, remove, modify, deepen, simplify, reframe}（F-2 D-04 冻结域 + D-01 选项 A 三动作）；modify 子型域不变（{REPLACE, TUNE, REBALANCE, RENAME, RESTYLE}）',
        '变更 4：优先级链扩展冻结——STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER（同层解释顺序纪律不变，model on S1 §12）',
        '变更 5：非创作会话保护——DEEPEN / SIMPLIFY / REFRAME 输入在无创作对象时按升级规则处理（C3 纪律，model on F-2/F-3 创作会话路由保护）',
        '变更 6：SEARCH 能力纪律——只读、不改变体验、不触发产品动作；无外部网络出口；检索范围限当前体验内容 / 创作对象 / 会话内上下文（D-03 选项 A）',
      ],
      carriedForward: '变更 1–6 为 S2b 引入变更（policy_v2.0.0 历史记录在录，行为经现行版本延续不变）；现行 policy_v2.1.0 另含 S2 分支回流变更 1–5（ADOPT_BRANCH 第五分支操作显式回流——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A，经 S2A-F4 迭代实施登记），与本运行 S2b 义务正交',
      priorityChain: 'STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER',
      source: 'SRC-06 / 14',
    },
    api: { contract: 'C3', version: 'v1.0.0', note: 'E2 契约面不变——S2b 不新增 API 端点（呈现查询为运行时只读查询，同 getSimulation / getMemory 纪律）' },
    event: { contract: 'C6', version: 'v1.0.0', note: '交互事件经 C6 §14 <action>_requested 命名模式（deepen_requested / simplify_requested / reframe_requested——结构校验非封闭枚举）；SEARCH 只读无事件' },
    evaluation: { gate: 'G5', status: 'NOT RUN（独立评测人须先审阅本运行 staged 材料）', note: '本运行动态证据已执行；G5 16 项评测包独立评测未执行' },
    code: {
      form: 'in-process（真实 .ts 源字节；HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001）',
      files: runtimeFileHashes,
    },
    prompt: { model: 'synthetic（确定性规则网关——不调用任何真实 LLM 提供方）', lock: 'N/A（合成形态）' },
    model: { provider: 'none（合成数据边界，ADR-0002 §3）', lock: 'N/A' },
    corpus: { fixtures: ['synthetic/why/v1', 'synthetic/create/v1', 'synthetic/simulate/v2', 'synthetic/deepen/v1', 'synthetic/simplify/v1', 'synthetic/reframe/v1'], note: '全部合成数据；无真实用户数据（simulate 语料经 S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A 裁决升 v2——尾句对齐 F-4 分支语义）' },
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
      command: 'npm run s2b (node tools/evidence/src/s2b.mjs, from tools/evidence)',
      exitCode: null,
      form: 'in-process（真实 .ts 源字节）',
    },
    lockfiles: { packageLock: 'package-lock.json（lockfileVersion 3）' },
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S2B-0001 form)');

  // A1: run-metadata 完整（E5 §3 版本矩阵全部字段）。
  const requiredMatrixSections = [
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
    'event',
    'evaluation',
    'code',
    'prompt',
    'model',
    'corpus',
    'environment',
    'referenceIntegrity',
    'run',
    'lockfiles',
  ];
  const missingSections = requiredMatrixSections.filter((section) => !(section in versionMatrix));
  const frozenDecisionsComplete =
    versionMatrix.obligationTraceability['S2b 体验动作扩展（首批义务 G-1…G-4）'].frozenDecisions &&
    ['D-01', 'D-02', 'D-03', 'D-04', 'D-05', '附列项（VERIFY）'].every(
      (key) => key in versionMatrix.obligationTraceability['S2b 体验动作扩展（首批义务 G-1…G-4）'].frozenDecisions,
    );
  assert(
    'A1',
    'run-metadata 完整（E5 §3 版本矩阵全部字段 + S2b 专项：policy_v2.0.0 变更 1–6 / state_machine_v1.5.0 变更 1–3 / frozenDecisions D-01…D-05 + 附列项 VERIFY + 黄金回归绑定）',
    missingSections.length === 0 && frozenDecisionsComplete,
    { missingSections, frozenDecisionsComplete },
  );

  // A2: environment lock (F-2 exact Node lock).
  const engineLocked =
    productPackage.engines?.node === '24.21.0' &&
    process.version === NODE_LOCK &&
    lockfile.lockfileVersion === 3;
  assert(
    'A2',
    `环境锁定：engines.node === "24.21.0"（F-2 精确锁定）且执行于 Node ${process.version}；lockfileVersion 3`,
    engineLocked,
    { engines: productPackage.engines, nodeVersion: process.version, lockfileVersion: lockfile.lockfileVersion },
  );

  // A3: case records complete for all cases (12 fields per E5 §4; no deferred).
  const recordFiles = (await readdir(casesDir)).filter((name) => name.endsWith('.json'));
  assert(
    'A3',
    `全部 ${caseResults.length} 案例记录齐备且 12 字段完整（E5 §4；${caseResults.length} 执行；无 DEFERRED 登记——S2b 首批义务案例面五组全执行）`,
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

  // A5: case surface coverage — freeze §5.2 五组案例面全覆盖。
  const surfaceGroups = {
    '案例面 1（正常路径×3）': ['DIRECTIONAL-DEEPEN', 'DIRECTIONAL-SIMPLIFY', 'DIRECTIONAL-REFRAME'],
    '案例面 2（非创作会话升级负向）': ['ESCALATION-NEG'],
    '案例面 3（SEARCH 内部能力）': ['SEARCH-CAPABILITY'],
    '案例面 4（First Experience 呈现）': ['FIRST-EXPERIENCE'],
    '案例面 5（优先级链）': ['PRIORITY-CHAIN'],
  };
  const surfaceCoverage = Object.entries(surfaceGroups).map(([group, caseIds]) => ({
    group,
    caseIds,
    complete: caseIds.every((caseId) => caseResults.some((entry) => entry.caseId === caseId && entry.pass)),
  }));
  assert(
    'A5',
    '案例面覆盖：S2B-SEMANTIC-FREEZE-01 §5.2 五组案例面全覆盖且通过（正常路径×3 / 非创作会话升级负向 / SEARCH 内部能力 / First Experience 呈现 / 优先级链）',
    surfaceCoverage.every((group) => group.complete),
    { surfaceCoverage },
  );

  // A6: DIRECTIONAL 三动作正常路径。
  const cDeepen = caseResults.find((entry) => entry.caseId === 'DIRECTIONAL-DEEPEN');
  const cSimplify = caseResults.find((entry) => entry.caseId === 'DIRECTIONAL-SIMPLIFY');
  const cReframe = caseResults.find((entry) => entry.caseId === 'DIRECTIONAL-REFRAME');
  assert(
    'A6',
    'DIRECTIONAL 正常路径：DEEPEN / SIMPLIFY / REFRAME 创作会话内顶层补丁操作——分类正确（词表识别）、policy_v2.1.0 恒等映射、reason=creation_modification、头状态 ACTIVE/CREATION v7、流内容逐字节等于各方向性语料、<action>_requested ×1、creation_patch_applied ×1（operation/target/change={direction}/creation_version=2）、CREATE 迁移 ×2、决策追踪 semantic_action + explicit_user_direction + llm_used=false、终态 WAITING/CREATION v8 + lastSemanticAction、创作版本 2 + user_changes 权威登记 + 结构逐字段保持',
    cDeepen?.pass === true && cSimplify?.pass === true && cReframe?.pass === true,
    { deepen: cDeepen?.pass, simplify: cSimplify?.pass, reframe: cReframe?.pass },
  );

  // A7: ESCALATION-NEG — 非创作会话升级路径。
  const cEscalation = caseResults.find((entry) => entry.caseId === 'ESCALATION-NEG');
  assert(
    'A7',
    'ESCALATION-NEG：非创作会话方向性操作——三动作分类正确但执行升级拒绝（INVALID_ACTION——policy_v2.0.0 变更 5；C3 升级纪律，不静默执行未定义语义）；状态版本与视图零增量（拒绝先于任何写入——OBL-01）；零方向性事件、零 creation_patch_applied；创作对象不存在',
    cEscalation?.pass === true,
    { escalation: cEscalation?.pass },
  );

  // A8: SEARCH-CAPABILITY — 内部能力纪律。
  const cSearch = caseResults.find((entry) => entry.caseId === 'SEARCH-CAPABILITY');
  assert(
    'A8',
    'SEARCH-CAPABILITY：三面只读检索（read_only 恒真、相关性判定、非活跃创作对象面跳过）；VERIFY 类输入经既有 WHY / DIRECT_ANSWER 解释层路由（附列裁决区选项 A——无 VERIFY 语义动作）；WHY 路径端到端执行无副作用（零创作补丁 / 零记忆事件 / 零方向性事件）；只读不变式（事件汇与状态版本零增量）；静态边界（search.ts 无运行时 import / 无外部网络出口；runtime.ts 双生成路径集成 search_context）',
    cSearch?.pass === true,
    { search: cSearch?.pass },
  );

  // A9: FIRST-EXPERIENCE — 呈现路径。
  const cPresentation = caseResults.find((entry) => entry.caseId === 'FIRST-EXPERIENCE');
  assert(
    'A9',
    'FIRST-EXPERIENCE：呈现模型结构（入口 3 步 / 六阶段含 BRANCH=SIMULATION 轴映射 / 完成 3 步 / 退出 2 步 / 中断 3 步——E2 §5/§6/§7 冻结面）；视图→呈现阶段映射（含 BRANCH Simulation 呈现面区分）；默认查询 CURIOSITY；生命周期游走（READY/UNDERSTANDING v2 → WAITING/UNDERSTANDING v4 → WAITING/SIMULATION v6〔BRANCH——首轮模拟激活分支〕→ WAITING/CREATION v8 → WAITING/CREATION v10 → COMPLETED/COMPLETION v11——STOP 完成路径消耗 +1 版本；瞬态 ENTERING/CURIOSITY 与非分支 SIMULATION 面由纯映射覆盖；STOP 完成路径登记创作 active=false）',
    cPresentation?.pass === true,
    { presentation: cPresentation?.pass },
  );

  // A10: PRIORITY-CHAIN — 冻结优先级链。
  const cPriority = caseResults.find((entry) => entry.caseId === 'PRIORITY-CHAIN');
  assert(
    'A10',
    'PRIORITY-CHAIN：冻结优先级链 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER——分类器碰撞核验 8 组全通过（STOP 压倒 DEEPEN / CHANGE_DIRECTION 压倒 REFRAME / CREATE 压倒 DEEPEN / 方向性操作压倒 WHY / "换角度"不落入 CHANGE_DIRECTION / 基线 WHY 链尾序不变）；运行时证明：创作会话内"好了再深入一点"经 STOP 执行路径完成（COMPLETED/COMPLETION + creation_completed ×1 + 零 creation_patch_applied——STOP 优先于 DEEPEN 于运行时成立）',
    cPriority?.pass === true,
    { priorityChain: cPriority?.pass },
  );

  // A11: 黄金回归绑定（E5 §3）。
  assert(
    'A11',
    '黄金回归绑定：G3-GOLDEN-0001 在 policy_v2.1.0 / state_machine_v1.5.0 通过（40/40 案例、全部断言、退出码 0）——本运行动态证据的回归基线（S2b 案例已纳入 G3-GOLDEN-0001 回归基准，freeze §5.3）',
    goldenRegressionOk,
    {
      goldenExitCode: goldenSummary.exitCode,
      goldenCases: goldenSummary.executedCases,
      goldenAllPass: goldenSummary.allExecutedCasesPass,
      goldenPolicy: goldenMetadata.policy?.version,
      goldenStateMachine: goldenMetadata.stateMachine?.version,
    },
  );

  // A12: 案例记录形式校验（E5 §4 12 字段结构校验器逐案例通过）
  //      + 进程内形态守卫（无 HTTP 服务器——S2b 范围为语义动作 /
  //      能力 / 呈现语义；HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001）。
  assert(
    'A12',
    '案例记录形式校验：E5 §4 12 字段结构校验器逐案例通过；全部案例经进程内形态执行（无 HTTP 服务器）',
    recordValidations.every((validation) => validation.valid) &&
      CASE_REGISTRY.every((definition) => definition.form === 'in-process'),
    { recordValidations, forms: CASE_REGISTRY.map((definition) => definition.form) },
  );

  // A13: preflight / integrity (informational; failures are FATAL above).
  assert(
    'A13-PREFLIGHT',
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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G3/G4/G8）或产品状态为 PASS（E5 §2）。S2b 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）；G3 Gate 判定属独立评测人逐项裁决。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A14', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Final pass: refresh summary with A14 included, then regenerate the
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

运行：${RUN_ID}（S2b 体验动作扩展首批义务 G-1…G-4——DEEPEN/SIMPLIFY/REFRAME 顶层语义动作 + SEARCH 内部能力 + First Experience 完整呈现）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S2b → 案例 / 断言映射；frozenDecisions：D-01…D-05 + 附列项 VERIFY 裁决文本引用；policy_v2.0.0 变更 1–6 / state_machine_v1.5.0 变更 1–3 全文）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §5.2 案例面）

- 案例面 1 正常路径（DIRECTIONAL-DEEPEN / SIMPLIFY / REFRAME）：创作会话内顶层补丁操作——词表分类、policy_v2.1.0 恒等映射、reason=creation_modification、头状态 ACTIVE/CREATION v7、流内容逐字节等于方向性语料、<action>_requested ×1、creation_patch_applied ×1（operation / target 经 TARGET_SYNONYMS 派生 / change={direction} / creation_version=2）、决策追踪 explicit_user_direction + llm_used=false、终态 WAITING/CREATION v8、创作版本 2 + user_changes 权威登记 + 结构逐字段保持（08 §11 局部变更纪律：不重新生成整个作品）
- 案例面 2 非创作会话升级（ESCALATION-NEG）：三动作在无创作对象时 INVALID_ACTION 升级（policy_v2.0.0 变更 5；C3 纪律）——状态版本 / 视图零增量、零方向性事件、零补丁事件（拒绝先于任何写入——OBL-01）
- 案例面 3 SEARCH 内部能力（SEARCH-CAPABILITY）：三面只读检索（read_only 恒真 / 相关性判定 / 非活跃创作对象面跳过）；VERIFY 类输入经既有 WHY / DIRECT_ANSWER 解释层路由（附列裁决区选项 A——VERIFY 不启用）；WHY 路径端到端无副作用；只读不变式；静态边界（纯函数模块 / 无外部网络出口 / 双生成路径集成）
- 案例面 4 First Experience 呈现（FIRST-EXPERIENCE）：入口 / 六阶段 / 完成 / 退出 / 中断流程模型（E2 §5/§6/§7 冻结面）；视图→呈现阶段映射（含 BRANCH Simulation 呈现面区分）；默认查询；生命周期游走（v2→v4→v6〔BRANCH〕→v8→v10→v11——STOP 完成路径消耗 +1 版本；瞬态 ENTERING/CURIOSITY 与非分支 SIMULATION 面由纯映射覆盖；STOP 完成路径登记创作 active=false）
- 案例面 5 优先级链（PRIORITY-CHAIN）：冻结优先级链碰撞核验 8 组（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER）+ 运行时 STOP 优先于 DEEPEN 证明（"好了再深入一点"经 STOP 执行路径完成）

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（G3 Gate 判定属独立评测人逐项裁决——本运行不设置任何 Gate 为 PASS，E5 §2）
- S2b 后续批次（如有）：经产品负责人另行版本化裁决与授权
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- C3 行为语义空缺不得由编码者补写——新语义空缺出现须另行版本化裁决（授权 §4.7）

## 独立重跑

    cd tools/evidence && npm run s2b   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's2b-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

/** 解析 NDJSON 轨迹事件（trace_started / 案例事实 / trace_completed 计数）。 */
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

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's2b-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
