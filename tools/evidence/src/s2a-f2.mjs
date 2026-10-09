// S2A-F2-0001 — S2a F-2 迭代动态证据执行器
// （P3-S2-IMPL-AUTH-01 v1.2.0 §2/§6 授权范围：F-2——G04 完整 Creation 语义，
//   依据 S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）
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
const { why } = await import('../../../src/experience/fixtures/why');
const { create } = await import('../../../src/experience/fixtures/create');

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
const RUN_ID = 'S2A-F2-0001';
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
  'S2a 范围边界（S2A-F2-SEMANTIC-FREEZE-01 §2）：创作子状态机轴外承载于持久创作对象，体验阶段轴不变；创作状态会话内持久（跨 USER_ACTION / RESPONSE_COMPLETED 周期存活）；补丁 operation 值域 {add, remove, modify}（REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 作 modify 子型）；CREATION_COMPLETE 经 STOP 执行路径在创作域登记',
  'S1 范围边界保持：CREATE/SEARCH 禁用旧词表项（CREATE 为 PD-21 关闭切片启用动作）；WHAT_IF 仅单次模拟；S2b 保留操作（SIMPLIFY / DEEPEN / REFRAME）识别后升级拒绝，不静默执行',
  'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
  '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；创作修改轮次经 expectedCreationVersion 双重前置校验——陈旧写入返回 STATE_VERSION_CONFLICT 且不得覆盖（S1-12 同族）；失败写入不消耗任何版本号（OBL-01 纪律）',
  'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）',
  '补丁应用是局部变更（08 §11：不重新生成整个作品；版本单调 + user_changes 累积）；修改仅在 USER_FEEDBACK 轮应用（13 §21：存在未预览补丁不得 COMPLETE——补丁必经 PREVIEW）',
  '创作 ASK 纪律（08 §16）：输入与既有轴触发器冲突时不自动判定——至多一个高价值澄清问题；创作子状态不推进',
  '完成语义（08 §27 / 13 §22/§23.2）：完成信号词表识别后立即结束，不自动推荐、不自动继续；创作完成经 STOP 路径登记（USER_FEEDBACK → COMPLETE + creation_completed 事件；决策追踪 reason 区分"创作完成"与"停止体验"——D-05 选项 A）',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
  '决策追踪与 LLM/Policy/State 事件分离记录（C6 §22/§23）；创作修改轮次决策追踪 llm_used=false（确定性规则，非模型）',
  '工程边界（P2-EVIDENCE-4.0）：超时不自行决定新方向（EB-07）；完成不属于 LLM 自主权限（EB-13）；分析只能观察（EB-14）',
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

/** WHY → CREATE 建立链：返回建立完成后的状态版本（v6）与创作基线事实。 */
async function creationBaseline(runtime, label) {
  const { session, intent, exp } = await setupChain(runtime, label);
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2a-${label}-why-${shortId()}`,
  });
  const whyStream = await consume(whySub.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const createSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '做成一个小游戏',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: `req-s2a-${label}-create-${shortId()}`,
  });
  const createStream = await consume(createSub.stream);
  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId);
  return { session, intent, exp, whySub, whyStream, createSub, createStream, stateAfterWhy, state, creation };
}

// ---------------------------------------------------------------------------
// 案例运行器（S2a F-2：G04 完整 Creation 语义；全部进程内形态）
// ---------------------------------------------------------------------------

// --- CREATION-CHAIN：WHY → CREATE 建立链（08 §4/§6/§8/§9；13 §16） ------
async function caseCreationChain(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, exp, whySub, whyStream, createSub, createStream, stateAfterWhy, state, creation } =
    await creationBaseline(runtime, 'creationchain');
  const expEvents = expEventsOf(events, exp.experienceId);
  const started = eventsOf(expEvents, 'creation_started');
  const transitioned = eventsOf(expEvents, 'creation_phase_transitioned');
  const transitions = transitioned.map((event) => ({
    from: event.properties.from_phase,
    to: event.properties.to_phase,
    trigger: event.properties.trigger,
  }));
  const expected = {
    chain: 'WHY（EXPLAIN，WAITING/UNDERSTANDING v4）→ CREATE "做成一个小游戏"（explicit_user_direction，提交 v5）→ 流完成 WAITING/CREATION v6',
    creationObject: '九分量齐备：creationId=creation_0001；sourceExperience.stateVersion=5；concept{theme=为什么, coreMechanic=minimal_playable_loop, goal=一个小游戏}；objects=[player, exit]；rules=模板 2 项；variables={progress: 0}；interactions=[move, observe]；presentation=text；goal=一个小游戏；userChanges=[]；version=1；phase=USER_FEEDBACK',
    events: 'creation_started×1（theme=为什么, goal=一个小游戏）+ creation_phase_transitioned×3（CONTEXT_INHERIT→MINIMAL_BUILD/minimal_built；MINIMAL_BUILD→PREVIEW/previewed；PREVIEW→USER_FEEDBACK/feedback_started）',
    content: 'CREATE 流内容逐字节等于 synthetic/create/v1 语料',
  };
  const actual = {
    whySelected: whySub.header.policy_decision.selected_action,
    stateAfterWhy: `${stateAfterWhy.state.status}/${stateAfterWhy.state.stage} v${stateAfterWhy.state.stateVersion}`,
    createSelected: createSub.header.policy_decision.selected_action,
    createReason: createSub.header.policy_decision.reason,
    createHeaderStateVersion: createSub.header.state_version,
    creationId: creation.ok ? creation.creation.creationId : null,
    sourceExperience: creation.ok ? creation.creation.sourceExperience : null,
    concept: creation.ok ? creation.creation.concept : null,
    objects: creation.ok ? creation.creation.objects : null,
    rules: creation.ok ? creation.creation.rules : null,
    variables: creation.ok ? creation.creation.variables : null,
    interactions: creation.ok ? creation.creation.interactions : null,
    presentation: creation.ok ? creation.creation.presentation : null,
    goal: creation.ok ? creation.creation.goal : null,
    userChanges: creation.ok ? creation.creation.userChanges.length : null,
    version: creation.ok ? creation.creation.version : null,
    phase: creation.ok ? creation.creation.phase : null,
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationStarted: started.length,
    startedProperties: started.map((event) => ({
      creation_id: event.properties.creation_id,
      theme: event.properties.theme,
      goal: event.properties.goal,
    })),
    phaseTransitioned: transitioned.length,
    transitions,
    createContentMatchesFixture: contentOf(createStream) === create.chunks.join(''),
    whyContentMatchesFixture: contentOf(whyStream) === why.chunks.join(''),
  };
  const pass =
    whySub.ok &&
    whySub.header.policy_decision.selected_action === 'EXPLAIN' &&
    stateAfterWhy.state.status === 'WAITING' &&
    stateAfterWhy.state.stateVersion === 4 &&
    createSub.ok &&
    createSub.header.policy_decision.selected_action === 'CREATE' &&
    createSub.header.policy_decision.reason === 'explicit_user_direction' &&
    createSub.header.state_version === 5 &&
    creation.ok &&
    creation.active &&
    creation.creation.creationId === 'creation_0001' &&
    creation.creation.sourceExperience.experienceId === exp.experienceId &&
    creation.creation.sourceExperience.stateVersion === 5 &&
    creation.creation.concept.theme === '为什么' &&
    creation.creation.concept.coreMechanic === 'minimal_playable_loop' &&
    creation.creation.concept.goal === '一个小游戏' &&
    jsonEquals(creation.creation.objects, ['player', 'exit']) &&
    jsonEquals(creation.creation.rules, ['player_progresses_toward_exit', 'reach_exit_to_complete']) &&
    jsonEquals(creation.creation.variables, { progress: 0 }) &&
    jsonEquals(creation.creation.interactions, ['move', 'observe']) &&
    creation.creation.presentation === 'text' &&
    creation.creation.goal === '一个小游戏' &&
    creation.creation.userChanges.length === 0 &&
    creation.creation.version === 1 &&
    creation.creation.phase === 'USER_FEEDBACK' &&
    state.state.status === 'WAITING' &&
    state.state.stage === 'CREATION' &&
    state.state.stateVersion === 6 &&
    started.length === 1 &&
    started[0].properties.creation_id === 'creation_0001' &&
    started[0].properties.theme === '为什么' &&
    started[0].properties.goal === '一个小游戏' &&
    transitioned.length === 3 &&
    jsonEquals(transitions, [
      { from: 'CONTEXT_INHERIT', to: 'MINIMAL_BUILD', trigger: 'minimal_built' },
      { from: 'MINIMAL_BUILD', to: 'PREVIEW', trigger: 'previewed' },
      { from: 'PREVIEW', to: 'USER_FEEDBACK', trigger: 'feedback_started' },
    ]) &&
    contentOf(createStream) === create.chunks.join('') &&
    contentOf(whyStream) === why.chunks.join('');
  return { expected, actual, pass };
}

// --- MULTI-TURN：多轮修改（08 §11/§12/§28；冻结文本 §4 变更 1） --------
async function caseMultiTurn(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'multiturn');
  const { session, exp, state: stateAfterCreate, creation: creationAfterCreate } = base;
  const rounds = [];
  const roundInputs = [
    { rawInput: '再加两个障碍', expectedCreationVersion: 1 },
    { rawInput: '把出口放远一点', expectedCreationVersion: undefined },
    { rawInput: '再加一个障碍', expectedCreationVersion: 3 },
  ];
  let stateVersion = stateAfterCreate.state.stateVersion;
  for (const round of roundInputs) {
    const submission = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'CREATE',
      rawInput: round.rawInput,
      expectedStateVersion: stateVersion,
      ...(round.expectedCreationVersion !== undefined
        ? { expectedCreationVersion: round.expectedCreationVersion }
        : {}),
      requestId: `req-s2a-multiturn-${round.rawInput}-${shortId()}`,
    });
    if (!submission.ok) {
      rounds.push({ rawInput: round.rawInput, error: submission.error.code });
      continue;
    }
    const stream = await consume(submission.stream);
    const state = runtime.getExperienceState(exp.experienceId);
    const creation = runtime.getCreation(exp.experienceId).creation;
    const decisionTrace = tracesOf(traces, exp.experienceId).at(-1);
    rounds.push({
      rawInput: round.rawInput,
      headerReason: submission.header.policy_decision.reason,
      headerStateVersion: submission.header.state_version,
      policyVersion: submission.header.policy_decision.policy_version,
      creationVersion: creation.version,
      phase: creation.phase,
      objects: creation.objects,
      obstacleCount: creation.variables.obstacle_count,
      userChanges: creation.userChanges.length,
      userChangeVersions: creation.userChanges.map((change) => change.version),
      lastPatch: creation.userChanges.at(-1)?.patch ?? null,
      stateVersion: state.state.version ?? state.state.stateVersion,
      stateStatus: `${state.state.status}/${state.state.stage}`,
      contentMatchesFixture: contentOf(stream) === create.chunks.join(''),
      decisionLlmUsed: decisionTrace?.execution?.llm_used ?? null,
    });
    stateVersion = state.state.stateVersion;
  }
  const creation = runtime.getCreation(exp.experienceId).creation;
  const expEvents = expEventsOf(events, exp.experienceId);
  const patchApplied = eventsOf(expEvents, 'creation_patch_applied');
  const expected = {
    rounds: '三轮修改均接受（声明 CREATE）："再加两个障碍" → v2（add obstacle×2，obstacle_count=2，objects=[player,exit,obstacle,obstacle_2_2]）；"把出口放远一点" → v3（modify tune，非结构性——结构保持，变更事实经 userChanges 登记）；"再加一个障碍" → v4（obstacle_count=3，objects 追加 obstacle_4_1）',
    invariants: '创作版本单调 1→2→3→4；user_changes 累积 3 条（版本 [2,3,4]）；player/exit 始终保留于 objects[0..1]（局部补丁，不重新生成整个作品——08 §11）；每轮预览内容逐字节等于 create 语料；决策追踪 llm_used=false；头 reason=creation_modification',
    finalState: 'WAITING/CREATION v12；创作 v4 USER_FEEDBACK',
  };
  const actual = {
    baseline: `v${creationAfterCreate.creation.version} ${creationAfterCreate.creation.phase} / state v${stateAfterCreate.state.stateVersion}`,
    rounds,
    finalCreation: `v${creation.version} ${creation.phase}`,
    finalState: (() => {
      const state = runtime.getExperienceState(exp.experienceId);
      return `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`;
    })(),
    patchAppliedEvents: patchApplied.length,
    versionMonotonic: creation.version === 4 &&
      creation.userChanges.map((change) => change.version).join(',') === '2,3,4',
    objectsPreserved: creation.objects[0] === 'player' && creation.objects[1] === 'exit',
    obstacleCount: creation.variables.obstacle_count,
  };
  const pass =
    rounds.length === 3 &&
    rounds.every((round) => round.headerReason === 'creation_modification') &&
    rounds.every((round) => round.policyVersion === 'policy_v1.2.0') &&
    rounds.every((round) => round.contentMatchesFixture === true) &&
    rounds.every((round) => round.decisionLlmUsed === false) &&
    rounds[0].creationVersion === 2 &&
    jsonEquals(rounds[0].objects, ['player', 'exit', 'obstacle', 'obstacle_2_2']) &&
    rounds[0].obstacleCount === 2 &&
    rounds[0].userChanges === 1 &&
    rounds[0].lastPatch.operation === 'add' &&
    rounds[0].lastPatch.target === 'obstacle' &&
    rounds[0].lastPatch.change.count === 2 &&
    rounds[1].creationVersion === 3 &&
    jsonEquals(rounds[1].objects, ['player', 'exit', 'obstacle', 'obstacle_2_2']) &&
    rounds[1].obstacleCount === 2 &&
    rounds[1].userChanges === 2 &&
    rounds[1].lastPatch.operation === 'modify' &&
    rounds[1].lastPatch.target === 'exit' &&
    rounds[1].lastPatch.change.kind === 'tune' &&
    rounds[2].creationVersion === 4 &&
    jsonEquals(rounds[2].objects, ['player', 'exit', 'obstacle', 'obstacle_2_2', 'obstacle_4_1']) &&
    rounds[2].obstacleCount === 3 &&
    rounds[2].userChanges === 3 &&
    creation.version === 4 &&
    creation.phase === 'USER_FEEDBACK' &&
    creation.userChanges.map((change) => change.version).join(',') === '2,3,4' &&
    creation.objects[0] === 'player' &&
    creation.objects[1] === 'exit' &&
    creation.variables.obstacle_count === 3 &&
    patchApplied.length === 3 &&
    runtime.getExperienceState(exp.experienceId).state.stateVersion === 12;
  return { expected, actual, pass };
}

// --- STALE-REJECT：陈旧版本拒绝（S1-12 同族；OBL-01 纪律） --------------
async function caseStaleReject(trace) {
  const { runtime, events } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'stalereject');
  const { session, exp, state: stateAfterCreate, creation: creationAfterCreate } = base;
  const stateVersion = stateAfterCreate.state.stateVersion;
  const creationVersion = creationAfterCreate.creation.version;
  const staleCreation = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再加两个障碍',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: creationVersion + 99,
    requestId: `req-s2a-stalereject-creation-${shortId()}`,
  });
  const staleState = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再加两个障碍',
    expectedStateVersion: stateVersion - 1,
    expectedCreationVersion: creationVersion,
    requestId: `req-s2a-stalereject-state-${shortId()}`,
  });
  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId).creation;
  const expEvents = expEventsOf(events, exp.experienceId);
  const expected = {
    staleCreationVersion: '拒绝：STATE_VERSION_CONFLICT（expected_creation_version=100, current_creation_version=1）',
    staleStateVersion: '拒绝：STATE_VERSION_CONFLICT（expected_state_version=5, current_state_version=6）',
    invariants: '双重前置校验（体验状态版本 + 创作版本）先于任何写入；失败写入不消耗版本号——状态保持 v6、创作保持 v1 USER_FEEDBACK；无 creation_patch_applied 事件',
  };
  const actual = {
    staleCreationOk: staleCreation.ok,
    staleCreationCode: staleCreation.ok ? null : staleCreation.error.code,
    staleCreationDetails: staleCreation.ok ? null : staleCreation.error.details ?? null,
    staleStateOk: staleState.ok,
    staleStateCode: staleState.ok ? null : staleState.error.code,
    staleStateDetails: staleState.ok ? null : staleState.error.details ?? null,
    stateAfter: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationAfter: `v${creation.version} ${creation.phase}`,
    patchAppliedEvents: eventsOf(expEvents, 'creation_patch_applied').length,
  };
  const pass =
    !staleCreation.ok &&
    staleCreation.error.code === 'STATE_VERSION_CONFLICT' &&
    staleCreation.error.details?.expected_creation_version === 100 &&
    staleCreation.error.details?.current_creation_version === 1 &&
    !staleState.ok &&
    staleState.error.code === 'STATE_VERSION_CONFLICT' &&
    staleState.error.details?.expected_state_version === stateVersion - 1 &&
    staleState.error.details?.current_state_version === stateVersion &&
    state.state.stateVersion === stateVersion &&
    creation.version === creationVersion &&
    creation.phase === 'USER_FEEDBACK' &&
    eventsOf(expEvents, 'creation_patch_applied').length === 0;
  return { expected, actual, pass };
}

// --- NO-AUTO-EXPANSION：最小可玩物模板精确（08 §7；13 §23.4） ----------
async function caseNoAutoExpansion(trace) {
  const { runtime } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'noautoexpansion');
  const { creation } = base;
  const expected = {
    minimalBuild: '最小可玩构建严格等于模板：objects 恰 2 项 [player, exit]；rules 恰 2 项模板规则；variables 恰 {progress: 0}；interactions [move, observe]；presentation text；coreMechanic minimal_playable_loop',
    rationale: '08 §7：第一次创建尽快产生可感知结果，先做一个可玩的东西再让用户修改，不问类型配置；13 §23.4：不自动扩张为完整作品',
  };
  const actual = {
    objects: creation.ok ? creation.creation.objects : null,
    rules: creation.ok ? creation.creation.rules : null,
    variables: creation.ok ? creation.creation.variables : null,
    interactions: creation.ok ? creation.creation.interactions : null,
    presentation: creation.ok ? creation.creation.presentation : null,
    coreMechanic: creation.ok ? creation.creation.concept.coreMechanic : null,
  };
  const pass =
    creation.ok &&
    jsonEquals(creation.creation.objects, ['player', 'exit']) &&
    jsonEquals(creation.creation.rules, ['player_progresses_toward_exit', 'reach_exit_to_complete']) &&
    jsonEquals(creation.creation.variables, { progress: 0 }) &&
    jsonEquals(creation.creation.interactions, ['move', 'observe']) &&
    creation.creation.presentation === 'text' &&
    creation.creation.concept.coreMechanic === 'minimal_playable_loop';
  return { expected, actual, pass };
}

// --- COMPLETION：完成信号经 STOP 路径登记（08 §27；13 §22/§23.2；D-05） --
async function caseCompletion(trace) {
  // 子链 1："就这样"（创作完成信号词表 → UNKNOWN → STOP 适配）
  const ctx1 = createCaseRuntime();
  const base1 = await creationBaseline(ctx1.runtime, 'completion-signal');
  const { session: session1, exp: exp1 } = base1;
  const stateVersion1 = base1.state.state.stateVersion;
  const generationBefore1 = eventsOf(expEventsOf(ctx1.events, exp1.experienceId), 'generation_started').length;
  const stop1 = await ctx1.runtime.submitExperienceEvent({
    experienceId: exp1.experienceId,
    sessionId: session1.sessionId,
    semanticAction: 'STOP',
    rawInput: '就这样',
    expectedStateVersion: stateVersion1,
    requestId: `req-s2a-completion-signal-${shortId()}`,
  });
  const stopStream1 = await consume(stop1.stream);
  const state1 = ctx1.runtime.getExperienceState(exp1.experienceId);
  const creation1 = ctx1.runtime.getCreation(exp1.experienceId);
  const expEvents1 = expEventsOf(ctx1.events, exp1.experienceId);
  const completed1 = eventsOf(expEvents1, 'creation_completed');
  const ended1 = eventsOf(expEvents1, 'creation_ended');
  const transitioned1 = eventsOf(expEvents1, 'creation_phase_transitioned');
  const generationAfter1 = eventsOf(expEvents1, 'generation_started').length;
  const stopTrace1 = tracesOf(ctx1.traces, exp1.experienceId).at(-1);
  const session1After = ctx1.runtime.getSession(session1.sessionId);

  // 子链 2："好了"（通用 STOP 分类直接覆盖）
  const ctx2 = createCaseRuntime();
  const base2 = await creationBaseline(ctx2.runtime, 'completion-direct');
  const { session: session2, exp: exp2 } = base2;
  const stateVersion2 = base2.state.state.stateVersion;
  const stop2 = await ctx2.runtime.submitExperienceEvent({
    experienceId: exp2.experienceId,
    sessionId: session2.sessionId,
    semanticAction: 'STOP',
    rawInput: '好了',
    expectedStateVersion: stateVersion2,
    requestId: `req-s2a-completion-direct-${shortId()}`,
  });
  await consume(stop2.stream);
  const state2 = ctx2.runtime.getExperienceState(exp2.experienceId);
  const creation2 = ctx2.runtime.getCreation(exp2.experienceId);
  const completed2 = eventsOf(expEventsOf(ctx2.events, exp2.experienceId), 'creation_completed');
  const stopTrace2 = tracesOf(ctx2.traces, exp2.experienceId).at(-1);

  const expected = {
    completionSignal: '"就这样"（完成词表 08 §27）→ 分类 UNKNOWN → 创作解释 completion → 适配 STOP（声明 STOP 校验通过）→ executeStop：体验 ACTIVE/CREATION→COMPLETED/COMPLETION（v7）+ 创作 USER_FEEDBACK→COMPLETE + creation_completed（completion_condition=creation_completion_signal）+ active=false',
    directStop: '"好了"（通用 STOP 分类）→ 同一 STOP 执行路径：creation_completed（completion_condition=user_stop）——决策追踪 reason 区分"创作完成"与"停止体验"（D-05 选项 A）',
    invariants: '立即结束，不自动推荐、不自动继续（13 §23.2）：STOP 后零 generation_started 增量；STOP 流无内容分块（仅 submission + stopped）；creation_ended=0（完成不是终止）',
  };
  const actual = {
    signalChain: {
      ok: stop1.ok,
      streamTypes: stopStream1.map((event) => event.type),
      finalState: `${state1.state.status}/${state1.state.stage} v${state1.state.stateVersion}`,
      creationPhase: creation1.ok ? creation1.creation.phase : null,
      creationVersion: creation1.ok ? creation1.creation.version : null,
      creationActive: creation1.ok ? creation1.active : null,
      creationCompleted: completed1.length,
      completionCondition: completed1.map((event) => event.properties.completion_condition),
      creationEnded: ended1.length,
      finalTransition: transitioned1.map((event) => `${event.properties.from_phase}->${event.properties.to_phase}(${event.properties.trigger})`).at(-1) ?? null,
      generationStartedBefore: generationBefore1,
      generationStartedAfter: generationAfter1,
      decisionReasonSecondary: stopTrace1?.reason?.secondary ?? null,
      decisionLlmUsed: stopTrace1?.execution?.llm_used ?? null,
      sessionState: session1After?.state ?? null,
    },
    directChain: {
      finalState: `${state2.state.status}/${state2.state.stage} v${state2.state.stateVersion}`,
      creationPhase: creation2.ok ? creation2.creation.phase : null,
      creationActive: creation2.ok ? creation2.active : null,
      creationCompleted: completed2.length,
      completionCondition: completed2.map((event) => event.properties.completion_condition),
      decisionReasonSecondary: stopTrace2?.reason?.secondary ?? null,
    },
  };
  const pass =
    stop1.ok &&
    stop1.header.policy_decision.selected_action === 'STOP' &&
    jsonEquals(stopStream1.map((event) => event.type), ['submission', 'stopped']) &&
    state1.state.status === 'COMPLETED' &&
    state1.state.stage === 'COMPLETION' &&
    state1.state.stateVersion === stateVersion1 + 1 &&
    creation1.ok &&
    creation1.creation.phase === 'COMPLETE' &&
    creation1.creation.version === 1 &&
    creation1.active === false &&
    completed1.length === 1 &&
    completed1[0].properties.completion_condition === 'creation_completion_signal' &&
    completed1[0].properties.creation_version === 1 &&
    ended1.length === 0 &&
    transitioned1.some(
      (event) =>
        event.properties.from_phase === 'USER_FEEDBACK' &&
        event.properties.to_phase === 'COMPLETE' &&
        event.properties.trigger === 'completed',
    ) &&
    generationAfter1 === generationBefore1 &&
    typeof stopTrace1?.reason?.secondary === 'string' &&
    stopTrace1.reason.secondary.includes('CREATION_COMPLETE') &&
    stopTrace1?.execution?.llm_used === false &&
    session1After?.state === 'SESSION_ENDED' &&
    state2.state.status === 'COMPLETED' &&
    state2.state.stateVersion === stateVersion2 + 1 &&
    creation2.ok &&
    creation2.creation.phase === 'COMPLETE' &&
    creation2.active === false &&
    completed2.length === 1 &&
    completed2[0].properties.completion_condition === 'user_stop' &&
    stopTrace2?.reason?.secondary === 'STOP terminates the current experience (P-01: STOP always wins)';
  return { expected, actual, pass };
}

// --- ASK-BOUND：轴冲突澄清（08 §16；冻结文本 §4 变更 1） ----------------
async function caseAskBound(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'askbound');
  const { session, exp, state: stateAfterCreate, creation: creationAfterCreate } = base;
  const stateVersion = stateAfterCreate.state.stateVersion;
  const ask = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '换玩法，加两个障碍',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-askbound-${shortId()}`,
  });
  let stream = [];
  if (ask.ok) {
    stream = await consume(ask.stream);
  }
  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId).creation;
  const expEvents = expEventsOf(events, exp.experienceId);
  const askTrace = tracesOf(traces, exp.experienceId).at(-1);
  const expected = {
    input: '"换玩法，加两个障碍"：同时命中修改意图（ADD obstacle×2）与既有轴触发词（"换" → CHANGE_DIRECTION 轴）——通用分类器判 UNKNOWN（"换" 单字不构成通用 CHANGE_DIRECTION 模式），创作解释按冲突判据（08 §16）不自动判定',
    askRound: 'CREATE 伞形动作 + 澄清问题流（单块，fixtureId=creation_ask）：至多一个澄清问题；体验状态 ACTIVE/CREATION v7 → 流完成 WAITING/CREATION v8',
    invariants: '创作版本与阶段不变（v1 USER_FEEDBACK——澄清不修改作品）；无 creation_patch_applied 事件；决策追踪 llm_used=false；头 reason=creation_ask_clarification',
  };
  const actual = {
    ok: ask.ok,
    headerReason: ask.ok ? ask.header.policy_decision.reason : ask.error.code,
    headerStateVersion: ask.ok ? ask.header.state_version : null,
    chunkCount: stream.filter((event) => event.type === 'chunk').length,
    content: contentOf(stream),
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationVersion: creation.version,
    creationPhase: creation.phase,
    userChanges: creation.userChanges.length,
    patchAppliedEvents: eventsOf(expEvents, 'creation_patch_applied').length,
    decisionLlmUsed: askTrace?.execution?.llm_used ?? null,
    decisionReasonSecondary: askTrace?.reason?.secondary ?? null,
    baseline: `v${creationAfterCreate.creation.version} ${creationAfterCreate.creation.phase} / state v${stateVersion}`,
  };
  const pass =
    ask.ok &&
    ask.header.policy_decision.reason === 'creation_ask_clarification' &&
    ask.header.state_version === stateVersion + 1 &&
    stream.filter((event) => event.type === 'chunk').length === 1 &&
    contentOf(stream).includes('CHANGE_DIRECTION') &&
    contentOf(stream).includes('确认') &&
    state.state.status === 'WAITING' &&
    state.state.stage === 'CREATION' &&
    state.state.stateVersion === stateVersion + 2 &&
    creation.version === creationAfterCreate.creation.version &&
    creation.phase === 'USER_FEEDBACK' &&
    creation.userChanges.length === 0 &&
    eventsOf(expEvents, 'creation_patch_applied').length === 0 &&
    askTrace?.execution?.llm_used === false &&
    typeof askTrace?.reason?.secondary === 'string' &&
    askTrace.reason.secondary.includes('creation ASK');
  return { expected, actual, pass };
}

// --- DEFERRED-OP：S2b 保留操作升级拒绝（授权 §2；冻结文本 D-04） --------
async function caseDeferredOp(trace) {
  const { runtime, events } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'deferredop');
  const { session, exp, state: stateAfterCreate, creation: creationAfterCreate } = base;
  const stateVersion = stateAfterCreate.state.stateVersion;
  const eventsBefore = expEventsOf(events, exp.experienceId).length;
  const submission = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '简单一点',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-deferredop-${shortId()}`,
  });
  const eventsAfter = expEventsOf(events, exp.experienceId).length;
  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId).creation;
  const expected = {
    input: '"简单一点"：命中 S2b 保留操作 SIMPLIFY（授权 §2 不授权实施）',
    rejection: '升级拒绝：INVALID_ACTION（"creation operation SIMPLIFY is deferred to S2b"）——不静默执行、不降级为 tune/modify 近似语义',
    invariants: '拒绝先于任何写入：状态保持 v6、创作保持 v1 USER_FEEDBACK；本次提交不产生任何事件（请求级校验失败，request_id 不消耗）',
  };
  const actual = {
    ok: submission.ok,
    code: submission.ok ? null : submission.error.code,
    message: submission.ok ? null : submission.error.message,
    stateAfter: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationAfter: `v${creation.version} ${creation.phase}`,
    eventsBefore,
    eventsAfter,
  };
  const pass =
    !submission.ok &&
    submission.error.code === 'INVALID_ACTION' &&
    submission.error.message.includes('SIMPLIFY') &&
    submission.error.message.includes('deferred to S2b') &&
    state.state.stateVersion === stateVersion &&
    creation.version === creationAfterCreate.creation.version &&
    creation.phase === 'USER_FEEDBACK' &&
    eventsAfter === eventsBefore;
  return { expected, actual, pass };
}

// --- RESTART-SUPERSEDED：相邻 CREATE 取代（G04-Boundary；D-03） ------------
async function caseRestartSuperseded(trace) {
  const { runtime, events } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'restartsuperseded');
  const { session, exp, state: stateAfterCreate, creation: firstCreation } = base;
  const stateVersion = stateAfterCreate.state.stateVersion;
  const second = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再做一个这样的小游戏',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-restartsuperseded-${shortId()}`,
  });
  const stream = second.ok ? await consume(second.stream) : [];
  const state = runtime.getExperienceState(exp.experienceId);
  const activeCreation = runtime.getCreation(exp.experienceId);
  const expEvents = expEventsOf(events, exp.experienceId);
  const ended = eventsOf(expEvents, 'creation_ended');
  const started = eventsOf(expEvents, 'creation_started');
  const expected = {
    input: '"再做一个这样的小游戏"（通用分类器 CREATE 模式 /做成|做一个/ 直接命中）',
    supersede: '相邻重复 CREATE 取代在途创作会话：creation_ended（creation_0001, reason=superseded_by_create）→ 新创作会话 creation_0002 v1（全新最小构建，objects=[player, exit]——不累积上一会话内容）',
    finalState: 'WAITING/CREATION v8；创作 v1 USER_FEEDBACK；CREATE 流内容逐字节等于 create 语料',
  };
  const actual = {
    ok: second.ok,
    headerStateVersion: second.ok ? second.header.state_version : null,
    firstCreationId: firstCreation.creation.creationId,
    activeCreationId: activeCreation.ok ? activeCreation.creation.creationId : null,
    activeCreationVersion: activeCreation.ok ? activeCreation.creation.version : null,
    activeCreationPhase: activeCreation.ok ? activeCreation.creation.phase : null,
    activeCreationObjects: activeCreation.ok ? activeCreation.creation.objects : null,
    creationEnded: ended.map((event) => ({
      creation_id: event.properties.creation_id,
      reason: event.properties.reason,
    })),
    creationStarted: started.length,
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    contentMatchesFixture: contentOf(stream) === create.chunks.join(''),
  };
  const pass =
    second.ok &&
    second.header.state_version === stateVersion + 1 &&
    firstCreation.creation.creationId === 'creation_0001' &&
    activeCreation.ok &&
    activeCreation.active &&
    activeCreation.creation.creationId === 'creation_0002' &&
    activeCreation.creation.version === 1 &&
    activeCreation.creation.phase === 'USER_FEEDBACK' &&
    jsonEquals(activeCreation.creation.objects, ['player', 'exit']) &&
    ended.length === 1 &&
    ended[0].properties.creation_id === 'creation_0001' &&
    ended[0].properties.reason === 'superseded_by_create' &&
    started.length === 2 &&
    state.state.status === 'WAITING' &&
    state.state.stage === 'CREATION' &&
    state.state.stateVersion === stateVersion + 2 &&
    contentOf(stream) === create.chunks.join('');
  return { expected, actual, pass };
}

// --- PHASE-GUARD：PREVIEW 阶段补丁非法（13 §21） --------------------------
async function casePhaseGuard(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, intent, exp } = await setupChain(runtime, 'phaseguard');
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2a-phaseguard-why-${shortId()}`,
  });
  await consume(whySub.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const createSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '做成一个小游戏',
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: `req-s2a-phaseguard-create-${shortId()}`,
  });
  // 不消费流：创作处于 PREVIEW（预览在途，13 §21——补丁仅在 USER_FEEDBACK 轮应用）
  const creation = runtime.getCreation(exp.experienceId).creation;
  const stateAtPreview = runtime.getExperienceState(exp.experienceId);
  const modification = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再加两个障碍',
    expectedStateVersion: stateAtPreview.state.stateVersion,
    requestId: `req-s2a-phaseguard-mod-${shortId()}`,
  });
  const state = runtime.getExperienceState(exp.experienceId);
  const creationAfter = runtime.getCreation(exp.experienceId).creation;
  const expected = {
    precondition: 'CREATE 已提交（状态 v5 ACTIVE/CREATION）但流未消费——创作处于 PREVIEW 阶段（预览在途）',
    rejection: '修改轮拒绝：INVALID_STATE_TRANSITION（"creation patch illegal in phase PREVIEW"）——补丁仅在 USER_FEEDBACK 轮应用（13 §21：修改必须先经 PREVIEW 再由用户判断）',
    invariants: '拒绝先于任何写入：状态保持 v5、创作保持 v1 PREVIEW',
  };
  const actual = {
    creationPhaseAtSubmission: creation.phase,
    stateAtSubmission: `${stateAtPreview.state.status}/${stateAtPreview.state.stage} v${stateAtPreview.state.stateVersion}`,
    modificationOk: modification.ok,
    modificationCode: modification.ok ? null : modification.error.code,
    modificationMessage: modification.ok ? null : modification.error.message,
    stateAfter: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationAfter: `v${creationAfter.version} ${creationAfter.phase}`,
  };
  const pass =
    creation.phase === 'PREVIEW' &&
    stateAtPreview.state.stateVersion === 5 &&
    !modification.ok &&
    modification.error.code === 'INVALID_STATE_TRANSITION' &&
    modification.error.message.includes('illegal in phase PREVIEW') &&
    state.state.stateVersion === 5 &&
    creationAfter.version === 1 &&
    creationAfter.phase === 'PREVIEW';
  return { expected, actual, pass };
}

// --- INPROC-REGRESSION：全链路回归（G2 跨契约一致性；C6 §7/§25） ---------
async function caseInprocRegression(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'inprocregression');
  const { session, exp } = base;
  let stateVersion = base.state.state.stateVersion;
  const modification = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再加两个障碍',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: 1,
    requestId: `req-s2a-inprocregression-mod-${shortId()}`,
  });
  const modStream = modification.ok ? await consume(modification.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '就这样',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-inprocregression-stop-${shortId()}`,
  });
  const stopStream = stop.ok ? await consume(stop.stream) : [];
  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);
  const expEvents = expEventsOf(events, exp.experienceId);
  const decisionTraces = tracesOf(traces, exp.experienceId);
  const envelopeViolations = [];
  for (const event of events) {
    const result = validateEventEnvelope(event);
    if (!result.ok) envelopeViolations.push({ event_id: event.event_id, violations: result.violations });
  }
  const sequenceOk = expEvents.every(
    (event, index) => index === 0 || event.sequence_number > expEvents[index - 1].sequence_number,
  );
  const expected = {
    chain: 'WHY → CREATE（建立）→ 修改轮（"再加两个障碍"，创作 v2）→ 完成信号（"就这样"，STOP 路径登记创作完成）全链路',
    finalState: 'COMPLETED/COMPLETION；创作 COMPLETE（active=false）；会话 SESSION_ENDED',
    contracts: '全部事件信封符合 C6 §7；sequence_number 严格单调（C6 §25）；全部决策追踪 policy_version=policy_v1.2.0；修改轮内容逐字节等于 create 语料',
  };
  const actual = {
    modificationOk: modification.ok,
    modificationContentMatchesFixture: contentOf(modStream) === create.chunks.join(''),
    stopOk: stop.ok,
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationPhase: creation.ok ? creation.creation.phase : null,
    creationActive: creation.ok ? creation.active : null,
    sessionState: sessionAfter?.state ?? null,
    envelopeViolations: envelopeViolations.length,
    sequenceMonotonic: sequenceOk,
    policyVersions: [...new Set(decisionTraces.map((traceEntry) => traceEntry.policy?.policy_version))],
    eventCount: expEvents.length,
  };
  const pass =
    modification.ok &&
    contentOf(modStream) === create.chunks.join('') &&
    stop.ok &&
    state.state.status === 'COMPLETED' &&
    state.state.stage === 'COMPLETION' &&
    creation.ok &&
    creation.creation.phase === 'COMPLETE' &&
    creation.active === false &&
    sessionAfter?.state === 'SESSION_ENDED' &&
    envelopeViolations.length === 0 &&
    sequenceOk &&
    decisionTraces.length > 0 &&
    decisionTraces.every((traceEntry) => traceEntry.policy?.policy_version === 'policy_v1.2.0');
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表（E5 §4：每案例 12 字段记录）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'CREATION-CHAIN',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 §3/§4 变更 1/变更 4；08 §4/§6/§8/§9（进入条件 / 上下文继承 / 创作对象模型 / 九分量）；13 §16（创造状态机 V1）',
    scope: 'G04 建立链：WHY → CREATE 建立创作会话（九分量创作对象 + 轴外子状态机阶段链事件）',
    precondition: '进程内形态（默认合成网关）；每案例独立 ExperienceRuntime 与内存汇；会话/意图/体验链已建立（启动 v2）',
    inputFault: '无故障注入（WHY → CREATE "做成一个小游戏" 正常提交）',
    run: caseCreationChain,
  },
  {
    caseId: 'MULTI-TURN',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1；08 §11/§12/§28（局部补丁 / 补丁形状 / 版本化历史）；D-04 选项 A（operation 值域收敛）',
    scope: '多轮修改：add（结构化）+ modify tune（非结构性登记）+ add 累积；版本单调、user_changes 累积、不重新生成整个作品',
    precondition: 'CREATION-CHAIN 基线（WAITING/CREATION v6，创作 v1 USER_FEEDBACK）',
    inputFault: '三轮创作修改输入（声明 CREATE；首轮显式声明 expectedCreationVersion=1，次轮缺省（默认当前版本），三轮显式声明 =3）',
    run: caseMultiTurn,
  },
  {
    caseId: 'STALE-REJECT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §2 D-01（逐切片升版）+ §4 变更 1；S1-12 同族纪律；OBL-01 纪律（失败写入不消耗版本号）；PD-16',
    scope: '陈旧版本双重前置校验：expectedCreationVersion 陈旧与 expectedStateVersion 陈旧均拒绝且不修改状态',
    precondition: 'CREATION-CHAIN 基线（状态 v6，创作 v1 USER_FEEDBACK）',
    inputFault: '声明 expectedCreationVersion=100（当前 1）；声明 expectedStateVersion=5（当前 6）',
    run: caseStaleReject,
  },
  {
    caseId: 'NO-AUTO-EXPANSION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §4 变更 4；08 §7（最小可玩物）；13 §23.4（不自动扩张）',
    scope: '最小构建模板精确性：创作对象严格等于最小模板（objects/rules/variables/interactions/presentation 逐项相等）',
    precondition: 'CREATION-CHAIN 基线（创作 v1 USER_FEEDBACK）',
    inputFault: '无故障注入（验证建立产物本身）',
    run: caseNoAutoExpansion,
  },
  {
    caseId: 'COMPLETION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §2 D-05 + §4 变更 2；08 §27（完成信号词表）；13 §22/§23.2（完成语义：立即结束，不自动推荐/继续）',
    scope: '完成信号双路径："就这样"（词表 → UNKNOWN → STOP 适配）与"好了"（通用 STOP 分类）均经 STOP 执行路径登记创作完成；决策追踪 reason 区分创作完成与停止体验',
    precondition: '两条独立 CREATION-CHAIN 基线（各 WAITING/CREATION v6，创作 v1 USER_FEEDBACK）',
    inputFault: '完成信号输入（声明 STOP）',
    run: caseCompletion,
  },
  {
    caseId: 'ASK-BOUND',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1；08 §16（冲突判据：至多一个澄清问题）',
    scope: '创作 ASK 纪律：输入同时命中修改意图与既有轴触发词时不自动判定——单块澄清问题流，创作版本/阶段不变',
    precondition: 'CREATION-CHAIN 基线（创作 v1 USER_FEEDBACK）',
    inputFault: '"换玩法，加两个障碍"（ADD 意图 + "换" 轴冲突词；通用分类器判 UNKNOWN）',
    run: caseAskBound,
  },
  {
    caseId: 'DEFERRED-OP',
    form: 'inprocess',
    servers: [],
    sourceClause: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2（授权范围）；S2A-F2-SEMANTIC-FREEZE-01 §2 D-04 选项 A（SIMPLIFY/DEEPEN/REFRAME 显式 DEFERRED 至 S2b）',
    scope: 'S2b 保留操作升级拒绝：识别后以 INVALID_ACTION 拒绝，不静默执行、不降级近似语义',
    precondition: 'CREATION-CHAIN 基线（创作 v1 USER_FEEDBACK）',
    inputFault: '"简单一点"（命中 S2b 保留操作 SIMPLIFY；声明 CREATE）',
    run: caseDeferredOp,
  },
  {
    caseId: 'RESTART-SUPERSEDED',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §2 D-03 选项 A + §4 变更 1；G04-Boundary 黄金契约（相邻重复 CREATE 各生成完整最小构建）',
    scope: '相邻重复 CREATE 取代在途创作会话：creation_ended(superseded_by_create) + 全新 v1 创作（不累积上一会话内容）',
    precondition: 'CREATION-CHAIN 基线（创作 creation_0001 v1 USER_FEEDBACK，状态 v6）',
    inputFault: '"再做一个这样的小游戏"（通用分类器 CREATE 直接命中；声明 CREATE）',
    run: caseRestartSuperseded,
  },
  {
    caseId: 'PHASE-GUARD',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1；13 §21（修改必须先经 PREVIEW 再由用户判断；补丁仅在 USER_FEEDBACK 轮应用）',
    scope: '阶段守卫：PREVIEW 阶段（预览在途）的修改轮拒绝——INVALID_STATE_TRANSITION，不消耗版本号',
    precondition: 'WHY → CREATE 已提交但流未消费（创作处于 PREVIEW，状态 v5）',
    inputFault: '"再加两个障碍"（声明 CREATE，expectedStateVersion=5）',
    run: casePhaseGuard,
  },
  {
    caseId: 'INPROC-REGRESSION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2/§6；G2 动态跨契约一致性；C6 §7（信封）/§25（sequence 单调）；S2A-F2-SEMANTIC-FREEZE-01 §4（policy_v1.2.0）',
    scope: '进程内形态全链路回归：WHY → CREATE → 修改轮 → 完成信号；信封全量有效、sequence 单调、policy_version=policy_v1.2.0',
    precondition: '执行器经 module.registerHooks 直接加载已提交 .ts 源字节；每案例独立 ExperienceRuntime 与内存汇',
    inputFault: '无故障注入（全链路正常提交）',
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1 / F2 / F3 / G3 / S2A-OBL-01).
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
  // F-2 scope is creation-domain semantics, exercised against the real
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
    'src/experience/creation.ts',
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
    'src/experience/fixtures/change-direction.ts',
    'src/experience/fixtures/simulate.ts',
    'src/experience/fixtures/create.ts',
    'tools/evidence/src/s2a-f2.mjs',
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
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2/§6：F-2——G04 完整 Creation 语义（S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：创作运行时 + 轴外子状态机 + 版本化补丁提交 + STOP 路径完成登记）',
    authorization: { id: 'P3-S2-IMPL-AUTH-01', version: '1.2.0', issued: '2026-10-09', note: '产品负责人签署生效（AUTHORIZED）；§4 修订：F-2 语义冻结文本于首个动态证据运行（S2A-F2-0001）前完成版本化冻结 + C1/C2/C3 Steward 确认（G1 式纪律）' },
    obligationTraceability: {
      'F-2 (G04 Creation)': {
        semanticFreeze: 'docs/product/p3-s1/s2a-f2-semantic-freeze-staged.md（S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-09 产品负责人签署）',
        frozenDecisions: {
          'D-01': '选项 2 逐切片升版（policy_v1.2.0=F-2 G04 / policy_v1.3.0=F-3 G07+MODIFY 别名 / policy_v1.4.0=F-4 WHAT_IF；state_machine 同步 v1.1.0/v1.2.0/v1.3.0）',
          'D-02': '选项 A 轴外子状态机（创作阶段轴独立于体验阶段轴）',
          'D-03': '选项 A 会话内持久（跨 USER_ACTION / RESPONSE_COMPLETED 周期存活；跨会话持久化属 F-5 Minimal Memory）',
          'D-04': '选项 A operation 值域 {add, remove, modify} + change 子型（replace/tune/rebalance/rename/restyle）；SIMPLIFY/DEEPEN/REFRAME 显式 DEFERRED 至 S2b',
          'D-05': '选项 A CREATION_COMPLETE 经 STOP 执行路径登记（轴触发器不变；P-01 STOP 永远优先链不动）',
        },
        implementationFiles: ['src/experience/creation.ts（创作域：对象模型 / 子状态机 / 上下文继承 / 最小构建 / 补丁应用 / 输入解释 / 创作存储）', 'src/experience/runtime.ts（集成：建立 / 修改轮 / ASK 轮 / STOP 路径完成登记 / 取代）', 'src/experience/policy.ts（POLICY_VERSION=policy_v1.2.0）'],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: 'G3-GOLDEN-0001 PASSED（32/32 案例；断言已同步 policy_v1.2.0）',
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
    stateMachine: {
      contract: 'C2',
      version: 'state_machine_v1.1.0',
      implemented: [
        'L0 Session（§4）',
        'L2 Experience 状态机（§7）',
        'L2 阶段机（§14/§15）',
        'Forbidden Transitions（§23）',
        '创造状态机 V1（13 §16——轴外子状态机：CREATE_INTENT→CONTEXT_INHERIT→MINIMAL_BUILD→PREVIEW→USER_FEEDBACK→COMPLETE，USER_FEEDBACK 经 patch_applied 循环回 PREVIEW；S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1）',
      ],
    },
    policy: {
      contract: 'C3',
      version: 'policy_v1.2.0',
      frozenMappingsImplemented: {
        DIRECT_ANSWER: 'ANSWER',
        WHY: 'EXPLAIN',
        WHAT_IF: 'SIMULATE',
        CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
        STOP: 'STOP',
        CREATE: 'CREATE（PD-21 关闭切片启用；F-2 起承载完整 G04 创作语义）',
        CORRECTION: 'EXPLAIN（G07 重评估落到合法动作；完整 Correction 语义属 F-3）',
      },
      frozenMapAuthority: 'S1 规范 §14 Policy Rules（acceptance-mapping §A/§C 批准范围）+ S2A-F2-SEMANTIC-FREEZE-01 §4 变更文本（policy_v1.2.0）',
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
        'POST /api/experience/{id}/event（event.semantic_action 声明校验 + expected_state_version；F-2 起创作修改轮经 expected_creation_version 双重前置校验——工程实现字段，迭代记录登记）',
        'POST /api/experience/stream',
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
        '创作域事件（S2A-F2：creation_started / creation_phase_transitioned / creation_patch_applied / creation_completed / creation_ended——C6 §14 命名模式）',
      ],
    },
    engineeringBoundaries: {
      contract: 'P2-EVIDENCE-4.0',
      evidence: 'EB-02（失败写入不消耗版本号——STALE-REJECT / DEFERRED-OP / PHASE-GUARD）；EB-06（重试是工程恢复机制——本迭代无重试路径改动）；EB-07（超时不自行决定新方向）；EB-13（完成不属于 LLM 自主权限——COMPLETION 案例）；EB-14（分析只能观察）；EB-16（版本可追溯——本版本矩阵 + A2/A15）',
      seamBoundary: '本迭代无注入缝改动（注入缝属 F-1；SEAM-INERT 不变式由 S2A-OBL-01-0001 证据保持，本运行进程内形态默认合成网关）',
      s2ScopeItems: {
        memory: 'Minimal Memory 属 S2a 后续迭代 F-5（短期记忆 only，6 个月自动删除，无长期画像——PD-23 裁决）',
        deepenSimplifyReframe: 'DEEPEN/SIMPLIFY/REFRAME 属 S2b（PD-23 裁决；DEFERRED-OP 案例验证升级拒绝）',
        correction: 'G07 完整 Correction 语义属 S2a F-3（policy_v1.3.0）',
        whatIf: 'WHAT_IF 全分支属 S2a F-4（policy_v1.4.0）',
      },
    },
    creationSemantics: {
      subStateMachine: 'CREATE_INTENT→CONTEXT_INHERIT→MINIMAL_BUILD→PREVIEW→USER_FEEDBACK→COMPLETE；USER_FEEDBACK 经 patch_applied→PREVIEW（修改循环，08 §11/13 §21）',
      patchOperations: '{add, remove, modify}；modify 子型 {replace, tune, rebalance, rename, restyle}（D-04 选项 A）',
      completionSignals: '"就这样" / "可以了" / "完成" / "这个就是我想要的"（08 §27 词表；"好了" 由通用 STOP 分类直接覆盖）',
      completionRegistration: '经 STOP 执行路径（D-05 选项 A）：USER_FEEDBACK→COMPLETE + creation_completed 事件（completion_condition=creation_completion_signal | user_stop）+ 决策追踪 reason 区分创作完成与停止体验；轴迁移与终态行为与 S1 完全一致',
      askDiscipline: '轴冲突判据（08 §16）：不自动判定，至多一个高价值澄清问题；创作子状态不推进',
      versioning: '创作修改轮经 expectedCreationVersion 前置校验（默认当前版本）；陈旧 → STATE_VERSION_CONFLICT，不修改状态；补丁提交 version+1 + user_changes 追加（08 §28 单调历史）',
      deferredToS2b: 'SIMPLIFY / DEEPEN / REFRAME（授权 §2 不授权；识别后 INVALID_ACTION 升级拒绝）',
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
      changedFiles: ['src/experience/creation.ts', 'src/experience/policy.ts', 'src/experience/runtime.ts', 'tools/evidence/src/golden.mjs', 'tools/evidence/src/s2a-f2.mjs', 'tools/evidence/package.json'],
    },
    prompt: { value: 'synthetic-fixture', reason: '无真实 LLM 提供方调用（E5 §2 排除项；ADR-0002 §3 硬边界）' },
    model: { value: 'synthetic-fixture', reason: '同上；LLM 网关为合成实现（经 LlmGateway 接口）' },
    corpus: {
      fixtures: [
        { fixtureId: 'synthetic/why/v1', file: 'src/experience/fixtures/why.ts', sha256: runtimeFileHashes['src/experience/fixtures/why.ts'] },
        { fixtureId: 'synthetic/create/v1', file: 'src/experience/fixtures/create.ts', sha256: runtimeFileHashes['src/experience/fixtures/create.ts'] },
        { fixtureId: 'synthetic/change-direction/v1', file: 'src/experience/fixtures/change-direction.ts', sha256: runtimeFileHashes['src/experience/fixtures/change-direction.ts'] },
        { fixtureId: 'synthetic/direct-answer/v1', file: 'src/experience/fixtures/direct-answer.ts', sha256: runtimeFileHashes['src/experience/fixtures/direct-answer.ts'] },
        { fixtureId: 'synthetic/simulate/v1', file: 'src/experience/fixtures/simulate.ts', sha256: runtimeFileHashes['src/experience/fixtures/simulate.ts'] },
        { fixtureId: 'synthetic/stop/v1', file: '（运行时内联构造：STOP 无内容分块）', sha256: null },
        { fixtureId: 'creation_ask', file: '（运行时内联构造：ASK 轮单块澄清问题）', sha256: null },
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
      httpServers: '（本运行无 HTTP 服务器——进程内形态直接加载已提交 .ts 源字节）',
    },
    packages: {
      product: { name: productPackage.name, version: productPackage.version, engines: productPackage.engines },
    },
    priorIterations: {
      f1: { runId: 'F1-E2E-0001', result: 'PASSED（9/9 案例、12/12 断言、退出码 0）' },
      f2: { runId: 'F2-GS-0001', result: 'PASSED（40/40 案例、24/24 断言、退出码 0）' },
      f3: { runId: 'F3-EB-0001', result: 'PASSED（26/26 案例、28/28 断言、退出码 0）' },
      g3: { runId: 'G3-GOLDEN-0001', result: 'PASSED（golden 再生验证，policy_v1.2.0 断言同步后 32/32）' },
      s2a: { f1: { runId: 'S2A-OBL-01-0001', result: 'PASSED（7/7 案例、12/12 断言、退出码 0）' } },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    executor: 'tools/evidence/src/s2a-f2.mjs',
    executorSha256: sha256OfBuffer(await readFile(path.join(here, 's2a-f2.mjs'))),
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S2a F-2 creation-semantics form)');

  // A1: run-metadata completeness (E5 §3).
  const requiredSections = [
    'runId', 'obligation', 'authorization', 'obligationTraceability', 'productDecisions', 'contracts',
    's1Specifications', 'stateMachine', 'policy', 'api', 'event', 'engineeringBoundaries',
    'creationSemantics', 'evaluation', 'code', 'prompt', 'model', 'corpus', 'environment', 'packages',
    'startedAt', 'finishedAt', 'durationMs', 'executor',
  ];
  const missingSections = requiredSections.filter((section) => !(section in versionMatrix));
  assert('A1', 'run-metadata 完整（E5 §3 版本矩阵全部字段 + F-2 创作语义专项 + obligationTraceability）', missingSections.length === 0, { missingSections });

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
  const traceFiles = (await readdir(tracesDir)).filter((name) => name.endsWith('.jsonl'));
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (
      await Promise.all(
        traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
      )
    ).every(Boolean);
  assert('A4', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // A5: CREATION-CHAIN semantics.
  const cChain = caseResults.find((entry) => entry.caseId === 'CREATION-CHAIN');
  assert(
    'A5',
    'CREATION-CHAIN：WHY→CREATE 建立链——九分量创作对象（sourceExperience.stateVersion=5 / theme=为什么 / goal=一个小游戏）+ creation_started×1 + creation_phase_transitioned×3（CONTEXT_INHERIT→MINIMAL_BUILD→PREVIEW→USER_FEEDBACK）+ 终态 WAITING/CREATION v6 + 内容逐字节等于 create 语料',
    cChain?.pass === true,
    { creationChain: cChain?.pass },
  );

  // A6: MULTI-TURN patch semantics.
  const cMulti = caseResults.find((entry) => entry.caseId === 'MULTI-TURN');
  assert(
    'A6',
    'MULTI-TURN：三轮修改——创作版本单调 1→2→3→4、user_changes 累积 [2,3,4]、player/exit 保留（局部补丁不重新生成整个作品 08 §11）、add 结构化（obstacle_count 2→3）+ modify tune 非结构性登记、决策追踪 llm_used=false、头 reason=creation_modification、policy_version=policy_v1.2.0、终态 WAITING/CREATION v12',
    cMulti?.pass === true,
    { multiTurn: cMulti?.pass },
  );

  // A7: STALE-REJECT.
  const cStale = caseResults.find((entry) => entry.caseId === 'STALE-REJECT');
  assert(
    'A7',
    'STALE-REJECT：expectedCreationVersion 陈旧（100 vs 1）与 expectedStateVersion 陈旧（5 vs 6）均 STATE_VERSION_CONFLICT 拒绝；双重前置校验先于任何写入；失败不消耗版本号（状态 v6、创作 v1 USER_FEEDBACK 不变）；无 creation_patch_applied 事件',
    cStale?.pass === true,
    { staleReject: cStale?.pass },
  );

  // A8: NO-AUTO-EXPANSION.
  const cNoExp = caseResults.find((entry) => entry.caseId === 'NO-AUTO-EXPANSION');
  assert(
    'A8',
    'NO-AUTO-EXPANSION：最小可玩构建严格等于模板（objects=[player, exit] 恰 2 项 / rules 模板 2 项 / variables={progress: 0} / interactions=[move, observe] / presentation=text / coreMechanic=minimal_playable_loop——13 §23.4 不自动扩张）',
    cNoExp?.pass === true,
    { noAutoExpansion: cNoExp?.pass },
  );

  // A9: COMPLETION.
  const cCompletion = caseResults.find((entry) => entry.caseId === 'COMPLETION');
  assert(
    'A9',
    'COMPLETION：完成信号双路径（"就这样" 词表→STOP 适配 / "好了" 通用 STOP）均经 STOP 执行路径登记创作完成——USER_FEEDBACK→COMPLETE + creation_completed（completion_condition 区分 creation_completion_signal / user_stop）+ active=false + COMPLETED/COMPLETION 终态 + 零 generation 增量（不自动推荐/继续 13 §23.2）+ 决策追踪 reason 区分创作完成与停止体验（D-05）',
    cCompletion?.pass === true,
    { completion: cCompletion?.pass },
  );

  // A10: ASK-BOUND.
  const cAsk = caseResults.find((entry) => entry.caseId === 'ASK-BOUND');
  assert(
    'A10',
    'ASK-BOUND：轴冲突输入（"换玩法，加两个障碍"）不自动判定——单块澄清问题流（fixtureId=creation_ask，含 CHANGE_DIRECTION 轴名与确认请求）、创作版本/阶段不变（v1 USER_FEEDBACK）、无 creation_patch_applied、头 reason=creation_ask_clarification、决策追踪 llm_used=false、终态 WAITING/CREATION v8',
    cAsk?.pass === true,
    { askBound: cAsk?.pass },
  );

  // A11: DEFERRED-OP.
  const cDeferred = caseResults.find((entry) => entry.caseId === 'DEFERRED-OP');
  assert(
    'A11',
    'DEFERRED-OP：S2b 保留操作（"简单一点" → SIMPLIFY）以 INVALID_ACTION 升级拒绝（不静默执行、不降级近似语义）；拒绝先于任何写入（状态 v6、创作 v1 USER_FEEDBACK 不变、本次提交零事件）',
    cDeferred?.pass === true,
    { deferredOp: cDeferred?.pass },
  );

  // A12: RESTART-SUPERSEDED.
  const cRestart = caseResults.find((entry) => entry.caseId === 'RESTART-SUPERSEDED');
  assert(
    'A12',
    'RESTART-SUPERSEDED：相邻重复 CREATE 取代在途创作会话——creation_ended(creation_0001, superseded_by_create) + 全新 creation_0002 v1（objects=[player, exit] 不累积）+ creation_started×2 + 终态 WAITING/CREATION v8 + 内容逐字节等于 create 语料（G04-Boundary 契约保持）',
    cRestart?.pass === true,
    { restartSuperseded: cRestart?.pass },
  );

  // A13: PHASE-GUARD.
  const cPhase = caseResults.find((entry) => entry.caseId === 'PHASE-GUARD');
  assert(
    'A13',
    'PHASE-GUARD：PREVIEW 阶段（预览在途）修改轮拒绝——INVALID_STATE_TRANSITION（illegal in phase PREVIEW，13 §21 补丁仅在 USER_FEEDBACK 轮应用）；拒绝不消耗版本号（状态 v5、创作 v1 PREVIEW 不变）',
    cPhase?.pass === true,
    { phaseGuard: cPhase?.pass },
  );

  // A14: INPROC-REGRESSION.
  const cInproc = caseResults.find((entry) => entry.caseId === 'INPROC-REGRESSION');
  assert(
    'A14',
    'INPROC-REGRESSION：WHY→CREATE→修改轮→完成信号全链路——信封全量有效（C6 §7）、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v1.2.0、修改轮内容逐字节等于 create 语料、终态 COMPLETED/COMPLETION + 创作 COMPLETE(active=false) + 会话 SESSION_ENDED',
    cInproc?.pass === true,
    { inprocRegression: cInproc?.pass },
  );

  // A15: preflight / integrity (informational; failures are FATAL above).
  assert(
    'A15-PREFLIGHT',
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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。F-2 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）。',
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

运行：${RUN_ID}（S2a F-2 迭代：G04 完整 Creation 语义——创作运行时 + 轴外子状态机 + 版本化补丁提交 + STOP 路径完成登记）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-2 → 案例 / 断言映射；creationSemantics：创作语义规范登记；frozenDecisions：D-01…D-05 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F2-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 建立链（CREATION-CHAIN）：WHY → CREATE 建立创作会话——九分量创作对象、轴外子状态机阶段链事件（CONTEXT_INHERIT→MINIMAL_BUILD→PREVIEW→USER_FEEDBACK）、终态 WAITING/CREATION v6
- 多轮修改（MULTI-TURN）：add 结构化补丁（obstacle×2 → obstacle_count=2）+ modify tune 非结构性登记 + 累积 add（obstacle_count=3）；版本单调 1→4、user_changes 累积、player/exit 保留（局部补丁，不重新生成整个作品——08 §11）
- 陈旧拒绝（STALE-REJECT）：expectedCreationVersion 与 expectedStateVersion 双重前置校验；陈旧 → STATE_VERSION_CONFLICT，失败不消耗版本号
- 最小构建（NO-AUTO-EXPANSION）：创作对象严格等于最小模板（13 §23.4 不自动扩张）
- 完成登记（COMPLETION）："就这样"（词表）与"好了"（通用 STOP）双路径经 STOP 执行路径登记——creation_completed + USER_FEEDBACK→COMPLETE + active=false + 决策追踪 reason 区分创作完成与停止体验（D-05 选项 A）+ 零自动推荐/继续
- ASK 纪律（ASK-BOUND）：轴冲突输入至多一个澄清问题，创作版本/阶段不变（08 §16）
- S2b 保留操作（DEFERRED-OP）：SIMPLIFY 识别后 INVALID_ACTION 升级拒绝（授权 §2 不授权）
- 取代（RESTART-SUPERSEDED）：相邻重复 CREATE → creation_ended(superseded_by_create) + 全新 v1（G04-Boundary 契约保持）
- 阶段守卫（PHASE-GUARD）：PREVIEW 阶段修改轮拒绝（13 §21）
- 全链路回归（INPROC-REGRESSION）：信封有效 + sequence 单调 + policy_v1.2.0

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-3（G07 全 Correction + MODIFY 别名，policy_v1.3.0）/ F-4（WHAT_IF 全分支，policy_v1.4.0）/ F-5（Minimal Memory）
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s2a-f2   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's2a-f2-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's2a-f2-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
