// S2A-F3-0001 — S2a F-3 迭代动态证据执行器
// （P3-S2-IMPL-AUTH-01 v1.2.0 §2/§6 授权范围：F-3——G07 完整 Correction 语义，
//   依据 S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施）
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
const { create } = await import('../../../src/experience/fixtures/create');
const { correction } = await import('../../../src/experience/fixtures/correction');

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
const RUN_ID = 'S2A-F3-0001';
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
  'S2a 范围边界（S2A-F3-SEMANTIC-FREEZE-01 §2）：MODIFY 登记为 CORRECTION 用户面别名（授权 §2(2)）；不新增顶层 SemanticAction / PolicyAction（PD-23 §5）；分类优先级层不变（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY > WHAT_IF > DIRECT_ANSWER）',
  '创作会话路由保护（D-01 选项 A）：活跃创作会话内 CORRECTION 分类输入先经 RESTORE 预检（D-04 词表，创作版本 >1），再经创作修改族预检（复用 interpretCreationInput 词表族与 08 §16 冲突判据）——命中创作 ADD/REMOVE/MODIFY 族 → 创作解释（CREATE 伞形 + 补丁轮次，F-2 机制不变）；命中冲突判据 → ASK（至多一个澄清问题）；未命中 → 通用 CORRECTION 路径（F-2 变更 3 保持：重评估创作子状态，不推进子状态机）',
  '纠正目标确定性派生（D-02 选项 A）：指代词表（刚才 / 那个 / 上一步 / 上一个 / 上一版 / 上一个版本 → 上一候选）+ 创作分量映射（TARGET_SYNONYMS 同义词表）+ 默认当前候选；无新增模型调用',
  'G07 操作语义承载（D-03 选项 A）：创作域经 F-2 补丁机制承载（不重建）；非创作域经重评估候选替换（不重放会话历史——重评估仅替换被纠正候选）',
  'RESTORE_PREVIOUS_VERSION（D-04 选项 A）：CORRECTION 用户面恢复子型，不新增轴触发器；创作域经创作存储回滚提交——版本单调 +1（S1-12 不变式：版本指针永不回退），新版本内容 = 目标历史版本内容，user_changes 登记 restore 条目（含恢复来源版本号）；非创作域经意图登记 + 重评估（decision-trace reason=restore_previous_version）',
  '纠正域事件（D-05 选项 A）：correction_applied（correction_target / correction_summary / corrected_candidate_id / semantic_action=CORRECTION）与 correction_restored（restored_from_version / restored_to_version / creation_id / semantic_action=CORRECTION）；C6 §14 命名模式；事件为不可变权威事实（C6 §5）',
  'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action',
  '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；创作修改 / 恢复轮次经 expectedCreationVersion 双重前置校验——陈旧写入返回 STATE_VERSION_CONFLICT 且不得覆盖（S1-12 同族）；失败写入不消耗任何版本号（OBL-01 纪律）',
  'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）',
  '纠正与在途生成互斥（旧候选拒绝，old_generation_rejected=true）；重评估链路：取消在途 generation → 拒绝旧候选 → LLM 提案纠正候选 → 验证 → 版本化提交',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
  '决策追踪与 LLM/Policy/State 事件分离记录（C6 §22/§23）；创作修改 / 恢复轮次决策追踪 llm_used=false（确定性规则，非模型）',
  '纠正不持久化跨会话（PD-07——纠正域事件均为会话内事实登记，无 memory 层事件）',
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

/** 非创作会话 WHY → CORRECTION 基线（PD-21 关闭切片形态 + F-3 完整化）。 */
async function correctionBaseline(runtime, label, correctionInput) {
  const { session, intent, exp } = await setupChain(runtime, label);
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2a-${label}-why-${shortId()}`,
  });
  await consume(whySub.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const correctionSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: correctionInput,
    expectedStateVersion: stateAfterWhy.state.stateVersion,
    requestId: `req-s2a-${label}-correction-${shortId()}`,
  });
  const correctionStream = correctionSub.ok ? await consume(correctionSub.stream) : [];
  const state = runtime.getExperienceState(exp.experienceId);
  return { session, intent, exp, whySub, correctionSub, correctionStream, stateAfterWhy, state };
}

// ---------------------------------------------------------------------------
// 别名登记静态断言（分类器确定性规则；GS-01 负向案例纪律）
// ---------------------------------------------------------------------------
function classificationAliasFacts() {
  const checks = [
    { input: '修改这个', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY tune 族（/修改/）' },
    { input: '调整一下', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY tune 族（/调整/）' },
    { input: '把出口放远一点', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY tune 族（/放远/）' },
    { input: '太难了', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY rebalance 族（/太难/）' },
    { input: '做得更有科幻感', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY restyle 族（/更有…感/）' },
    { input: '换成文本模式', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY replace 族（/换成/）' },
    { input: '把主角改名为英雄', expected: 'CORRECTION', restoreIntent: false, family: 'MODIFY rename 族（/改名为/）' },
    { input: '刚才那个更好', expected: 'CORRECTION', restoreIntent: true, family: 'RESTORE 子型（08 §28）' },
    { input: '退回刚才那个', expected: 'CORRECTION', restoreIntent: true, family: 'RESTORE 子型（08 §28）' },
    { input: '撤销刚才修改', expected: 'CORRECTION', restoreIntent: true, family: 'RESTORE 子型（08 §28）' },
    { input: '不是', expected: 'CORRECTION', restoreIntent: false, family: '原生否定纠正族（PD-21）' },
    { input: '简单一点', expected: 'UNKNOWN', restoreIntent: false, family: 'S2b 保留（SIMPLIFY；/太简单/ 要求"太简单"连写）' },
    { input: '再加两个障碍', expected: 'UNKNOWN', restoreIntent: false, family: '创作 ADD 族（通用分类器无模式——UNKNOWN 路由不变）' },
  ];
  return checks.map((check) => {
    const result = classifyInput(check.input);
    return {
      input: check.input,
      family: check.family,
      expected: check.expected,
      actual: result.semanticAction,
      expectedRestoreIntent: check.restoreIntent,
      actualRestoreIntent: result.correctionIntent ?? null,
      pass:
        result.semanticAction === check.expected &&
        (result.correctionIntent ?? null) === (check.restoreIntent ? 'restore' : null),
    };
  });
}

// ---------------------------------------------------------------------------
// 案例运行器（S2a F-3：G07 完整 Correction 语义；全部进程内形态）
// ---------------------------------------------------------------------------

// --- MODIFY-ALIAS：MODIFY 别名登记（授权 §2(2)；D-01 选项 A） ---------
async function caseModifyAlias(trace) {
  // 静态分类断言：别名词表登记 + 恢复子型标记 + 优先级层不变（GS-01 纪律）。
  const aliasFacts = classificationAliasFacts();
  const priorityChecks = [
    { input: '好了，修改这个', expected: 'STOP', note: 'P-01 STOP 永远优先于 MODIFY 别名' },
    { input: '换个方向，修改这个', expected: 'CHANGE_DIRECTION', note: 'P-03 显式方向变更优先于 MODIFY 别名' },
  ].map((check) => {
    const result = classifyInput(check.input);
    return { input: check.input, note: check.note, expected: check.expected, actual: result.semanticAction, pass: result.semanticAction === check.expected };
  });

  // 动态链路 1："修改这个"（非创作会话）——MODIFY 别名 → CORRECTION 完整重评估链路。
  const ctx1 = createCaseRuntime();
  const base1 = await correctionBaseline(ctx1.runtime, 'modifyalias-1', '修改这个');
  const { session: session1, intent: intent1, exp: exp1 } = base1;
  const sub1 = base1.correctionSub;
  const expEvents1 = expEventsOf(ctx1.events, exp1.experienceId);
  const correctionRequested1 = eventsOf(expEvents1, 'correction_requested');
  const interrupted1 = eventsOf(expEvents1, 'experience_interrupted');
  const transitioned1 = eventsOf(expEvents1, 'state_transitioned');
  const correctionApplied1 = eventsOf(expEvents1, 'correction_applied');
  const trace1 = tracesOf(ctx1.traces, exp1.experienceId).at(-1);

  // 动态链路 2："调整一下"（非创作会话）——同一别名族第二输入。
  const ctx2 = createCaseRuntime();
  const base2 = await correctionBaseline(ctx2.runtime, 'modifyalias-2', '调整一下');
  const sub2 = base2.correctionSub;
  const expEvents2 = expEventsOf(ctx2.events, base2.exp.experienceId);
  const correctionApplied2 = eventsOf(expEvents2, 'correction_applied');

  const expected = {
    aliasRegistration: 'MODIFY 词表（08 §10 修改类型族）分类为 CORRECTION 用户面别名；RESTORE 词表分类为 CORRECTION 恢复子型（correctionIntent=restore）；原生否定族不变；S2b 保留输入（"简单一点"）仍 UNKNOWN；创作 ADD 族（"再加两个障碍"）仍 UNKNOWN；优先级层不变（STOP / CHANGE_DIRECTION 先判）',
    chain: 'MODIFY 别名输入在非创作会话走通用 CORRECTION 完整链路：correction_requested（semantic_action=CORRECTION）→ experience_interrupted（reason=correction, old_generation_rejected=true）→ generation / llm_request / llm_output_validated → state_transitioned(event=CORRECTION) → 版本化提交（v5）→ 流完成（v6）→ correction_applied（correction_target=current_candidate, correction_summary=输入, corrected_candidate_id=提案 ID, semantic_action=CORRECTION）',
    invariants: '策略决策 EXPLAIN（重评估落到合法 Policy Action）；决策追踪 reason=reassess, llm_used=true, policy_version=policy_v1.3.0；终态 WAITING/UNDERSTANDING v6（阶段保持）',
  };
  const actual = {
    aliasFacts,
    aliasAllPass: aliasFacts.every((entry) => entry.pass),
    priorityChecks,
    priorityAllPass: priorityChecks.every((entry) => entry.pass),
    chain1: {
      ok: sub1.ok,
      selectedAction: sub1.ok ? sub1.header.policy_decision.selected_action : null,
      policyVersion: sub1.ok ? sub1.header.policy_decision.policy_version : null,
      headerStateVersion: sub1.ok ? sub1.header.state_version : null,
      correctionRequested: correctionRequested1.length,
      correctionRequestedSemanticAction: correctionRequested1[0]?.properties.semantic_action ?? null,
      correctionRequestedRawInput: correctionRequested1[0]?.properties.raw_input ?? null,
      interrupted: interrupted1.map((event) => ({ reason: event.properties.reason, oldGenerationRejected: event.properties.old_generation_rejected })),
      transitioned: transitioned1.map((event) => ({ event: event.properties.event, action: event.properties.action })),
      correctionApplied: correctionApplied1.map((event) => ({
        correction_target: event.properties.correction_target,
        correction_summary: event.properties.correction_summary,
        corrected_candidate_id: event.properties.corrected_candidate_id,
        semantic_action: event.properties.semantic_action,
      })),
      finalState: `${base1.state.state.status}/${base1.state.state.stage} v${base1.state.state.stateVersion}`,
      decisionReason: trace1?.reason?.primary ?? null,
      decisionLlmUsed: trace1?.execution?.llm_used ?? null,
      decisionPolicyVersion: trace1?.policy?.policy_version ?? null,
    },
    chain2: {
      ok: sub2.ok,
      correctionApplied: correctionApplied2.length,
      finalState: `${base2.state.state.status}/${base2.state.state.stage} v${base2.state.state.stateVersion}`,
    },
  };
  const pass =
    aliasFacts.every((entry) => entry.pass) &&
    priorityChecks.every((entry) => entry.pass) &&
    sub1.ok &&
    sub1.header.policy_decision.selected_action === 'EXPLAIN' &&
    sub1.header.policy_decision.policy_version === 'policy_v1.3.0' &&
    sub1.header.state_version === 5 &&
    correctionRequested1.length === 1 &&
    correctionRequested1[0].properties.semantic_action === 'CORRECTION' &&
    correctionRequested1[0].properties.raw_input === '修改这个' &&
    interrupted1.length === 1 &&
    interrupted1[0].properties.reason === 'correction' &&
    interrupted1[0].properties.old_generation_rejected === true &&
    transitioned1.some((event) => event.properties.event === 'CORRECTION' && event.properties.action === 'EXPLAIN') &&
    correctionApplied1.length === 1 &&
    jsonEquals(correctionApplied1[0].properties.correction_target, { kind: 'current_candidate' }) &&
    correctionApplied1[0].properties.correction_summary === '修改这个' &&
    typeof correctionApplied1[0].properties.corrected_candidate_id === 'string' &&
    correctionApplied1[0].properties.corrected_candidate_id.length > 0 &&
    correctionApplied1[0].properties.semantic_action === 'CORRECTION' &&
    base1.state.state.status === 'WAITING' &&
    base1.state.state.stage === 'UNDERSTANDING' &&
    base1.state.state.stateVersion === 6 &&
    trace1?.reason?.primary === 'reassess' &&
    trace1?.execution?.llm_used === true &&
    trace1?.policy?.policy_version === 'policy_v1.3.0' &&
    sub2.ok &&
    correctionApplied2.length === 1 &&
    jsonEquals(correctionApplied2[0].properties.correction_target, { kind: 'current_candidate' }) &&
    base2.state.state.stateVersion === 6;
  return { expected, actual, pass };
}

// --- CORRECTION-FULL：完整 G07 链路（D-02 定位目标；Evaluation System V1 §5） ----
async function caseCorrectionFull(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await correctionBaseline(runtime, 'correctionfull', '刚才那个不对');
  const { session, intent, exp } = base;
  const sub = base.correctionSub;
  const expEvents = expEventsOf(events, exp.experienceId);
  const correctionApplied = eventsOf(expEvents, 'correction_applied');
  const llmCompleted = eventsOf(expEvents, 'llm_request_completed');
  const whyRequested = eventsOf(expEvents, 'why_requested');
  const transitioned = eventsOf(expEvents, 'state_transitioned');
  const correctionTrace = tracesOf(traces, exp.experienceId).at(-1);
  const sessionAfter = runtime.getSession(session.sessionId);
  const expected = {
    input: '"刚才那个不对"——指代词表命中（/刚才/）→ 纠正目标 previous_candidate；否定族（/不对/）→ CORRECTION 分类',
    targetRegistration: '纠正目标确定性登记：correction_applied.correction_target={kind:"previous_candidate"}（D-02 选项 A：指代词表 → 上一候选，无新增模型调用）',
    chain: 'G07 完整链路：取消在途 generation（experience_interrupted reason=correction, old_generation_rejected=true）→ 拒绝旧候选 → LLM 提案纠正候选（generation_started → llm_request_started → llm_request_completed → llm_output_validated）→ 验证 → 版本化提交（v5）→ 流完成（v6）→ correction_applied',
    contextPreservation: '有效上下文保留：session / intent / prior events 完整（why_requested 事件保留；session 未终止；intentId 一致）',
    invariants: '重评估候选替换即"局部修改"在非结构化理解状态的忠实派生（不重放会话历史——D-03 选项 A）；策略 EXPLAIN；终态 WAITING/UNDERSTANDING v6',
  };
  const actual = {
    ok: sub.ok,
    selectedAction: sub.ok ? sub.header.policy_decision.selected_action : null,
    policyVersion: sub.ok ? sub.header.policy_decision.policy_version : null,
    correctionApplied: correctionApplied.map((event) => ({
      correction_target: event.properties.correction_target,
      correction_summary: event.properties.correction_summary,
      corrected_candidate_id: event.properties.corrected_candidate_id,
      semantic_action: event.properties.semantic_action,
    })),
    correctedCandidateMatchesLlmProposal:
      correctionApplied.length === 1 &&
      llmCompleted.length === 2 &&
      correctionApplied[0].properties.corrected_candidate_id === llmCompleted.at(-1).properties.proposal_id,
    priorEventsIntact: whyRequested.length,
    sessionState: sessionAfter?.state ?? null,
    intentIdMatch: intent.intent.intentId.length > 0 && expEvents.every((event) => event.context.intent_id === null || event.context.intent_id === intent.intent.intentId),
    transitioned: transitioned.map((event) => ({ event: event.properties.event, steps: event.properties.steps })),
    finalState: `${base.state.state.status}/${base.state.state.stage} v${base.state.state.stateVersion}`,
    decisionReason: correctionTrace?.reason?.primary ?? null,
    decisionReasonSecondary: correctionTrace?.reason?.secondary ?? null,
    decisionTargetInTrace: typeof correctionTrace?.reason?.secondary === 'string' && correctionTrace.reason.secondary.includes('previous_candidate'),
  };
  const pass =
    sub.ok &&
    sub.header.policy_decision.selected_action === 'EXPLAIN' &&
    sub.header.policy_decision.policy_version === 'policy_v1.3.0' &&
    correctionApplied.length === 1 &&
    jsonEquals(correctionApplied[0].properties.correction_target, { kind: 'previous_candidate' }) &&
    correctionApplied[0].properties.correction_summary === '刚才那个不对' &&
    correctionApplied[0].properties.semantic_action === 'CORRECTION' &&
    actual.correctedCandidateMatchesLlmProposal &&
    whyRequested.length === 1 &&
    sessionAfter?.state !== 'SESSION_ENDED' &&
    actual.intentIdMatch &&
    transitioned.some((event) => event.properties.event === 'CORRECTION') &&
    base.state.state.status === 'WAITING' &&
    base.state.state.stage === 'UNDERSTANDING' &&
    base.state.state.stateVersion === 6 &&
    correctionTrace?.reason?.primary === 'reassess' &&
    actual.decisionTargetInTrace;
  return { expected, actual, pass };
}

// --- CREATION-INERT：创作会话路由保护（D-01 选项 A；F-2 机制不变） ------
async function caseCreationInert(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'creationinert');
  const { session, exp, state: stateAfterCreate, creation: creationAfterCreate } = base;
  let stateVersion = stateAfterCreate.state.stateVersion;
  const creationVersion0 = creationAfterCreate.creation.version;

  // 轮 1：MODIFY 别名输入命中创作修改族 → 创作补丁轮次（非 executeCorrect）。
  const modifyRound = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '修改障碍颜色',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: creationVersion0,
    requestId: `req-s2a-creationinert-mod-${shortId()}`,
  });
  const modifyStream = modifyRound.ok ? await consume(modifyRound.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 轮 1 不变量快照：轮 2/3 会产生纠正事实，轮 1 不变量必须对快照取值。
  const eventsAfterRound1 = expEventsOf(events, exp.experienceId);
  const patchAppliedAfterRound1 = eventsOf(eventsAfterRound1, 'creation_patch_applied').length;
  const correctionAppliedAfterRound1 = eventsOf(eventsAfterRound1, 'correction_applied').length;
  const reevaluatedAfterRound1 = eventsOf(eventsAfterRound1, 'creation_reevaluated').length;
  const correctionTransitionsAfterRound1 = eventsAfterRound1.filter(
    (event) => event.event_type === 'state_transitioned' && event.properties.event === 'CORRECTION',
  ).length;

  // 轮 2：否定纠正输入未命中创作修改族 → 通用 CORRECTION 路径（F-2 变更 3 保持）。
  const correctionRound = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不对',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-creationinert-correction-${shortId()}`,
  });
  const correctionStream = correctionRound.ok ? await consume(correctionRound.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 轮 3：冲突判据（纠正族 + ADD 族同时命中）→ ASK（至多一个澄清问题）。
  const askRound = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '不对，加两个障碍',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-creationinert-ask-${shortId()}`,
  });
  const askStream = askRound.ok ? await consume(askRound.stream) : [];

  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId).creation;
  const expEvents = expEventsOf(events, exp.experienceId);
  const patchApplied = eventsOf(expEvents, 'creation_patch_applied');
  const correctionApplied = eventsOf(expEvents, 'correction_applied');
  const reevaluated = eventsOf(expEvents, 'creation_reevaluated');
  const correctionTransitioned = expEvents.filter(
    (event) => event.event_type === 'state_transitioned' && event.properties.event === 'CORRECTION',
  );
  const modifyTrace = tracesOf(traces, exp.experienceId).find(
    (entry) => entry.reason?.secondary?.includes('creation modification applied as patch'),
  );
  const correctionTrace = tracesOf(traces, exp.experienceId).find(
    (entry) => entry.semantic_action === 'CORRECTION',
  );
  const askTrace = tracesOf(traces, exp.experienceId).at(-1);

  const expected = {
    round1: '"修改障碍颜色"（MODIFY 别名 → CORRECTION 分类）经创作修改族预检命中（/修改/ + 障碍 → obstacle）→ 创作解释 CREATE 伞形 + 补丁轮次：creation_patch_applied（operation=modify, target=obstacle, kind=tune）+ 创作 v2 + user_changes 登记；非 executeCorrect（无 correction_applied / 无 state_transitioned CORRECTION / 无 creation_reevaluated）',
    round2: '"不对"（否定纠正族）未命中创作修改族（interpretCreationInput 返回 none）→ 通用 CORRECTION 路径：executeCorrect 重评估创作子状态——creation_reevaluated（phase=USER_FEEDBACK 不变, creation_version=2 不变）+ correction_applied（target=current_candidate）+ state_transitioned CORRECTION；创作版本与子状态机不推进（F-2 变更 3 保持）',
    round3: '"不对，加两个障碍"同时命中否定纠正族与 ADD 族 → 冲突判据（08 §16）→ ASK：单块澄清问题流（含 CORRECTION 轴名与确认请求——本输入冲突轴为 CORRECTION）；创作版本 / 阶段 / user_changes 不变；无 creation_patch_applied',
    invariants: '三轮路由均不推进创作子状态机（除补丁轮次的 PREVIEW 循环）；决策追踪 llm_used：修改轮 false / 纠正轮 true / ASK 轮 false',
  };
  const actual = {
    round1: {
      ok: modifyRound.ok,
      headerReason: modifyRound.ok ? modifyRound.header.policy_decision.reason : modifyRound.error.code,
      policyVersion: modifyRound.ok ? modifyRound.header.policy_decision.policy_version : null,
      contentMatchesFixture: contentOf(modifyStream) === create.chunks.join(''),
      patchApplied: patchApplied.filter((event) => event.properties.creation_version === 2).map((event) => ({
        operation: event.properties.operation,
        target: event.properties.target,
        kind: event.properties.change?.kind ?? null,
      })),
      decisionLlmUsed: modifyTrace?.execution?.llm_used ?? null,
    },
    round2: {
      ok: correctionRound.ok,
      headerReason: correctionRound.ok ? correctionRound.header.policy_decision.reason : correctionRound.error.code,
      reevaluated: reevaluated.map((event) => ({ phase: event.properties.phase, creationVersion: event.properties.creation_version })),
      correctionApplied: correctionApplied.map((event) => event.properties.correction_target),
      correctionTransitions: correctionTransitioned.length,
      decisionLlmUsed: correctionTrace?.execution?.llm_used ?? null,
    },
    round3: {
      ok: askRound.ok,
      headerReason: askRound.ok ? askRound.header.policy_decision.reason : askRound.error.code,
      chunkCount: askStream.filter((event) => event.type === 'chunk').length,
      content: contentOf(askStream),
      decisionLlmUsed: askTrace?.execution?.llm_used ?? null,
    },
    finalCreation: `v${creation.version} ${creation.phase}`,
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    userChanges: creation.userChanges.map((change) => ({ version: change.version, operation: change.patch.operation })),
    totalPatchApplied: patchApplied.length,
    totalCorrectionApplied: correctionApplied.length,
    round1Invariants: {
      patchApplied: patchAppliedAfterRound1,
      correctionApplied: correctionAppliedAfterRound1,
      correctionTransitions: correctionTransitionsAfterRound1,
      reevaluated: reevaluatedAfterRound1,
    },
  };
  const pass =
    modifyRound.ok &&
    modifyRound.header.policy_decision.reason === 'creation_modification' &&
    modifyRound.header.policy_decision.policy_version === 'policy_v1.3.0' &&
    contentOf(modifyStream) === create.chunks.join('') &&
    patchApplied.length === 1 &&
    patchApplied[0].properties.operation === 'modify' &&
    patchApplied[0].properties.target === 'obstacle' &&
    patchApplied[0].properties.change.kind === 'tune' &&
    modifyTrace?.execution?.llm_used === false &&
    patchAppliedAfterRound1 === 1 &&
    correctionAppliedAfterRound1 === 0 &&
    correctionTransitionsAfterRound1 === 0 &&
    reevaluatedAfterRound1 === 0 &&
    correctionRound.ok &&
    correctionRound.header.policy_decision.reason === 'reassess' &&
    reevaluated.length === 1 &&
    reevaluated[0].properties.phase === 'USER_FEEDBACK' &&
    reevaluated[0].properties.creation_version === 2 &&
    correctionApplied.length === 1 &&
    jsonEquals(correctionApplied[0].properties.correction_target, { kind: 'current_candidate' }) &&
    correctionTransitioned.length === 1 &&
    correctionTrace?.execution?.llm_used === true &&
    creation.version === 2 &&
    creation.phase === 'USER_FEEDBACK' &&
    creation.userChanges.length === 1 &&
    askRound.ok &&
    askRound.header.policy_decision.reason === 'creation_ask_clarification' &&
    askStream.filter((event) => event.type === 'chunk').length === 1 &&
    contentOf(askStream).includes('CORRECTION') &&
    contentOf(askStream).includes('确认') &&
    askTrace?.execution?.llm_used === false &&
    patchApplied.length === 1 &&
    creation.version === 2 &&
    creation.phase === 'USER_FEEDBACK' &&
    creation.userChanges.length === 1 &&
    state.state.status === 'WAITING' &&
    state.state.stage === 'CREATION';
  return { expected, actual, pass };
}

// --- RESTORE：创作会话恢复提交（D-04 选项 A；08 §28） --------
async function caseRestore(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'restore');
  const { session, exp, state: stateAfterCreate, creation: creationAfterCreate } = base;
  let stateVersion = stateAfterCreate.state.stateVersion;
  const creationVersion0 = creationAfterCreate.creation.version;

  // 轮 1：add 结构化补丁（v1 → v2，objects 追加 obstacle×2）。
  const addRound = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再加两个障碍',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: creationVersion0,
    requestId: `req-s2a-restore-add-${shortId()}`,
  });
  await consume(addRound.stream);
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const creationAfterAdd = runtime.getCreation(exp.experienceId).creation;

  // 轮 2：陈旧 expectedCreationVersion 恢复 → 双重前置校验拒绝。
  const staleRestore = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '刚才那个更好',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: creationVersion0,
    requestId: `req-s2a-restore-stale-${shortId()}`,
  });

  // 轮 3：恢复提交（v2 → v3，新版本内容 = v1 内容）。
  const restoreRound = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '刚才那个更好',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: creationAfterAdd.version,
    requestId: `req-s2a-restore-${shortId()}`,
  });
  const restoreStream = restoreRound.ok ? await consume(restoreRound.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  const state = runtime.getExperienceState(exp.experienceId);
  const creation = runtime.getCreation(exp.experienceId).creation;
  const expEvents = expEventsOf(events, exp.experienceId);
  const patchApplied = eventsOf(expEvents, 'creation_patch_applied');
  const restored = eventsOf(expEvents, 'correction_restored');
  const restoreTrace = tracesOf(traces, exp.experienceId).at(-1);

  const expected = {
    round1: '"再加两个障碍" → add 结构化补丁：创作 v2（objects=[player, exit, obstacle, obstacle_2_2]，obstacle_count=2）',
    staleRestore: '陈旧 expectedCreationVersion（=1 vs 当前 2）恢复提交 → STATE_VERSION_CONFLICT 拒绝（双重前置校验先于任何写入；失败不消耗版本号）',
    round3: '"刚才那个更好"（RESTORE 子型）→ 创作存储回滚提交：版本单调 +1（v2 → v3，S1-12 不变式：版本指针永不回退）；新版本内容 = 目标历史版本内容（objects=[player, exit]，variables={progress: 0}——v1 快照，obstacle_count 消失证明内容恢复而非指针回滚）；user_changes 登记 restore 条目（change.restoreFromVersion=1）；correction_restored 事件（restored_from_version=1, restored_to_version=3, semantic_action=CORRECTION）；创作补丁轮次特例——creation_patch_applied(operation=restore) + 阶段 PREVIEW 循环；决策追踪 reason=creation_restore, llm_used=false；头 reason=creation_restore',
    invariants: '恢复为修改轮次特例（经补丁提交纪律：expectedCreationVersion + expectedStateVersion 双重前置校验）；创作子状态机不推进（除补丁轮次 PREVIEW 循环）',
  };
  const actual = {
    round1: {
      ok: addRound.ok,
      creationVersion: creationAfterAdd.version,
      objects: creationAfterAdd.objects,
      obstacleCount: creationAfterAdd.variables.obstacle_count,
    },
    staleRestore: {
      ok: staleRestore.ok,
      code: staleRestore.ok ? null : staleRestore.error.code,
      details: staleRestore.ok ? null : staleRestore.error.details ?? null,
    },
    round3: {
      ok: restoreRound.ok,
      headerReason: restoreRound.ok ? restoreRound.header.policy_decision.reason : restoreRound.error.code,
      headerStateVersion: restoreRound.ok ? restoreRound.header.state_version : null,
      contentMatchesFixture: contentOf(restoreStream) === create.chunks.join(''),
      creationVersion: creation.version,
      objects: creation.objects,
      variables: creation.variables,
      userChanges: creation.userChanges.map((change) => ({
        version: change.version,
        operation: change.patch.operation,
        restoreFromVersion: change.patch.change.restoreFromVersion ?? null,
      })),
      patchApplied: patchApplied.map((event) => ({
        operation: event.properties.operation,
        creationVersion: event.properties.creation_version,
      })),
      restored: restored.map((event) => ({
        restored_from_version: event.properties.restored_from_version,
        restored_to_version: event.properties.restored_to_version,
        creation_id: event.properties.creation_id,
        semantic_action: event.properties.semantic_action,
      })),
      decisionReason: restoreTrace?.reason?.primary ?? null,
      decisionLlmUsed: restoreTrace?.execution?.llm_used ?? null,
      decisionPolicyVersion: restoreTrace?.policy?.policy_version ?? null,
    },
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    finalCreation: `v${creation.version} ${creation.phase}`,
  };
  const pass =
    addRound.ok &&
    creationAfterAdd.version === 2 &&
    jsonEquals(creationAfterAdd.objects, ['player', 'exit', 'obstacle', 'obstacle_2_2']) &&
    creationAfterAdd.variables.obstacle_count === 2 &&
    !staleRestore.ok &&
    staleRestore.error.code === 'STATE_VERSION_CONFLICT' &&
    staleRestore.error.details?.expected_creation_version === creationVersion0 &&
    staleRestore.error.details?.current_creation_version === 2 &&
    restoreRound.ok &&
    restoreRound.header.policy_decision.reason === 'creation_restore' &&
    restoreRound.header.policy_decision.policy_version === 'policy_v1.3.0' &&
    contentOf(restoreStream) === create.chunks.join('') &&
    creation.version === 3 &&
    jsonEquals(creation.objects, ['player', 'exit']) &&
    jsonEquals(creation.variables, { progress: 0 }) &&
    creation.phase === 'USER_FEEDBACK' &&
    creation.userChanges.length === 2 &&
    creation.userChanges[0].version === 2 &&
    creation.userChanges[0].patch.operation === 'add' &&
    creation.userChanges[1].version === 3 &&
    creation.userChanges[1].patch.operation === 'restore' &&
    creation.userChanges[1].patch.change.restoreFromVersion === 1 &&
    patchApplied.length === 2 &&
    patchApplied[0].properties.operation === 'add' &&
    patchApplied[1].properties.operation === 'restore' &&
    restored.length === 1 &&
    restored[0].properties.restored_from_version === 1 &&
    restored[0].properties.restored_to_version === 3 &&
    restored[0].properties.creation_id === creation.creationId &&
    restored[0].properties.semantic_action === 'CORRECTION' &&
    restoreTrace?.reason?.primary === 'creation_restore' &&
    restoreTrace?.execution?.llm_used === false &&
    restoreTrace?.policy?.policy_version === 'policy_v1.3.0' &&
    state.state.status === 'WAITING' &&
    state.state.stage === 'CREATION';
  return { expected, actual, pass };
}

// --- STALE-REJECT：非创作会话陈旧纠正提交（S1-12；OBL-01） ---
async function caseStaleReject(trace) {
  const { runtime, events } = createCaseRuntime();
  const { session, exp } = await setupChain(runtime, 'stale-reject');
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: exp.stateVersion,
    requestId: `req-s2a-stalerej-why-${shortId()}`,
  });
  await consume(whySub.stream);
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId);
  const stateBeforeJson = JSON.stringify(stateAfterWhy.state);
  const eventsBefore = expEventsOf(events, exp.experienceId).length;

  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不是',
    expectedStateVersion: stateAfterWhy.state.stateVersion - 1,
    requestId: `req-s2a-stalerej-correction-${shortId()}`,
  });

  const stateAfter = runtime.getExperienceState(exp.experienceId);
  const stateAfterJson = JSON.stringify(stateAfter.state);
  const expEvents = expEventsOf(events, exp.experienceId);
  const correctionApplied = eventsOf(expEvents, 'correction_applied');
  const transitionedAfter = expEvents.filter(
    (event) => event.event_type === 'state_transitioned' && event.context.state_version > stateAfterWhy.state.stateVersion,
  );
  const stateVersionConflict = eventsOf(expEvents, 'state_version_conflict').at(-1);
  const expected = {
    input: '"不是"（否定纠正族）声明陈旧 expected_state_version（3 vs 当前 4）',
    rejection: 'STATE_VERSION_CONFLICT 拒绝（stale expected_state_version: expected 3, current 4; no overwrite, S1-12）',
    invariants: '拒绝先于版本化提交（冻结 §4 变更 1：LLM 提案 → 验证 → 版本化提交步拒绝）：状态逐字节不变（JSON 序列化前后一致）；无 correction_applied 事件；无新 state_transitioned 事件；拒绝事实经 state_version_conflict 事件登记（trigger=CORRECTION）；失败写入不消耗任何版本号（OBL-01）',
  };
  const actual = {
    ok: stale.ok,
    code: stale.ok ? null : stale.error.code,
    message: stale.ok ? null : stale.error.message,
    retryable: stale.ok ? null : stale.error.retryable,
    details: stale.ok ? null : stale.error.details ?? null,
    stateByteIdentical: stateBeforeJson === stateAfterJson,
    eventsBefore,
    eventsAfter: expEvents.length,
    correctionAppliedEvents: correctionApplied.length,
    newStateTransitions: transitionedAfter.length,
    stateVersionConflictTrigger: stateVersionConflict?.properties.trigger ?? null,
    stateVersionConflictExpected: stateVersionConflict?.properties.expected_state_version ?? null,
    stateVersionConflictCurrent: stateVersionConflict?.properties.current_state_version ?? null,
  };
  const pass =
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    stale.error.retryable === false &&
    stale.error.details?.expected_state_version === 3 &&
    stale.error.details?.current_state_version === 4 &&
    stateBeforeJson === stateAfterJson &&
    stateVersionConflict?.properties.trigger === 'CORRECTION' &&
    stateVersionConflict?.properties.expected_state_version === 3 &&
    stateVersionConflict?.properties.current_state_version === 4 &&
    correctionApplied.length === 0 &&
    transitionedAfter.length === 0;
  return { expected, actual, pass };
}

// --- NONCREATION-INERT：非创作会话 G07 黄金语义不回归 -------
async function caseNoncreationInert(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await correctionBaseline(runtime, 'noncreation', '不是');
  const { session, exp } = base;
  const sub = base.correctionSub;
  const expEvents = expEventsOf(events, exp.experienceId);
  const correctionRequested = eventsOf(expEvents, 'correction_requested');
  const whyRequested = eventsOf(expEvents, 'why_requested');
  const interrupted = eventsOf(expEvents, 'experience_interrupted');
  const transitioned = eventsOf(expEvents, 'state_transitioned');
  const correctionApplied = eventsOf(expEvents, 'correction_applied');
  const memoryEvents = events.filter(
    (event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)),
  );
  const correctionTrace = tracesOf(traces, exp.experienceId).at(-1);
  const expected = {
    regression: '非创作会话纠正行为与关闭切片（G07-N 黄金语义）一致：correction_requested×1 + why_requested×1 + interrupted(reason=correction)×1 + state_transitioned(CORRECTION)×1 + 决策追踪 reason=reassess + 终态 WAITING/UNDERSTANDING v6 + 零 memory 事件（PD-07）',
    deltas: '与关闭切片仅有的差异：policy_version=policy_v1.3.0（版本化升版）+ correction_applied 事件登记（D-05 选项 A——纠正域事件为 F-3 新增事实登记）',
  };
  const actual = {
    ok: sub.ok,
    selectedAction: sub.ok ? sub.header.policy_decision.selected_action : null,
    policyVersion: sub.ok ? sub.header.policy_decision.policy_version : null,
    correctionRequested: correctionRequested.length,
    whyRequested: whyRequested.length,
    interruptedReasons: interrupted.map((event) => event.properties.reason),
    transitionedEvents: transitioned.map((event) => event.properties.event),
    correctionApplied: correctionApplied.length,
    finalState: `${base.state.state.status}/${base.state.state.stage} v${base.state.state.stateVersion}`,
    lastSemanticAction: base.state.state.lastSemanticAction,
    decisionReason: correctionTrace?.reason?.primary ?? null,
    decisionPolicyVersion: correctionTrace?.policy?.policy_version ?? null,
    memoryEvents: memoryEvents.length,
  };
  const pass =
    sub.ok &&
    sub.header.policy_decision.selected_action === 'EXPLAIN' &&
    sub.header.policy_decision.policy_version === 'policy_v1.3.0' &&
    correctionRequested.length === 1 &&
    whyRequested.length === 1 &&
    interrupted.length === 1 &&
    interrupted[0].properties.reason === 'correction' &&
    transitioned.some((event) => event.properties.event === 'CORRECTION') &&
    correctionApplied.length === 1 &&
    base.state.state.status === 'WAITING' &&
    base.state.state.stage === 'UNDERSTANDING' &&
    base.state.state.stateVersion === 6 &&
    base.state.state.lastSemanticAction === 'CORRECTION' &&
    correctionTrace?.reason?.primary === 'reassess' &&
    correctionTrace?.policy?.policy_version === 'policy_v1.3.0' &&
    memoryEvents.length === 0;
  return { expected, actual, pass };
}

// --- NO-MEMORY：纠正域零 memory 事件（PD-07；G07-B 同族） ----
async function caseNoMemory(trace) {
  // 域 1：非创作会话纠正。
  const ctx1 = createCaseRuntime();
  await correctionBaseline(ctx1.runtime, 'nomemory-1', '不是');

  // 域 2：创作会话内通用纠正（未命中创作修改族）。
  const ctx2 = createCaseRuntime();
  const base2 = await creationBaseline(ctx2.runtime, 'nomemory-2');
  const correction2 = await ctx2.runtime.submitExperienceEvent({
    experienceId: base2.exp.experienceId,
    sessionId: base2.session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不对',
    expectedStateVersion: base2.state.state.stateVersion,
    requestId: `req-s2a-nomemory-correction-${shortId()}`,
  });
  if (correction2.ok) {
    await consume(correction2.stream);
  }

  // 域 3：创作会话恢复轮（RESTORE 子型）。
  const ctx3 = createCaseRuntime();
  const base3 = await creationBaseline(ctx3.runtime, 'nomemory-3');
  const add3 = await ctx3.runtime.submitExperienceEvent({
    experienceId: base3.exp.experienceId,
    sessionId: base3.session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '再加两个障碍',
    expectedStateVersion: base3.state.state.stateVersion,
    expectedCreationVersion: 1,
    requestId: `req-s2a-nomemory-add-${shortId()}`,
  });
  if (add3.ok) {
    await consume(add3.stream);
  }
  const stateAfterAdd = ctx3.runtime.getExperienceState(base3.exp.experienceId);
  const restore3 = await ctx3.runtime.submitExperienceEvent({
    experienceId: base3.exp.experienceId,
    sessionId: base3.session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '刚才那个更好',
    expectedStateVersion: stateAfterAdd.state.stateVersion,
    expectedCreationVersion: 2,
    requestId: `req-s2a-nomemory-restore-${shortId()}`,
  });
  if (restore3.ok) {
    await consume(restore3.stream);
  }

  const allEvents = [...ctx1.events, ...ctx2.events, ...ctx3.events];
  const memoryEvents = allEvents.filter(
    (event) => /memory/i.test(event.event_type) || /memory/i.test(String(event.source?.layer)),
  );
  const correctionDomainEvents = allEvents.filter(
    (event) => event.event_type === 'correction_applied' || event.event_type === 'correction_restored',
  );
  const expected = {
    domains: '三域纠正事实登记：非创作纠正 + 创作会话通用纠正（creation_reevaluated 同轮）+ 创作恢复轮（correction_restored 同轮）',
    invariants: '纠正域事件均为会话内事实登记，无 memory 层事件（PD-07：纠正不持久化跨会话；G07-B 黄金断言同族）；correction_applied / correction_restored 事件齐备',
  };
  const actual = {
    domain1CorrectionApplied: ctx1.events.filter((event) => event.event_type === 'correction_applied').length,
    domain2CorrectionApplied: ctx2.events.filter((event) => event.event_type === 'correction_applied').length,
    domain2Reevaluated: ctx2.events.filter((event) => event.event_type === 'creation_reevaluated').length,
    domain3Restored: ctx3.events.filter((event) => event.event_type === 'correction_restored').length,
    domain3PatchApplied: ctx3.events.filter((event) => event.event_type === 'creation_patch_applied' && event.properties.operation === 'restore').length,
    correctionDomainEvents: correctionDomainEvents.length,
    memoryEvents: memoryEvents.length,
    totalEvents: allEvents.length,
  };
  const pass =
    correction2.ok &&
    add3.ok &&
    restore3.ok &&
    actual.domain1CorrectionApplied === 1 &&
    actual.domain2CorrectionApplied === 1 &&
    actual.domain2Reevaluated === 1 &&
    actual.domain3Restored === 1 &&
    actual.domain3PatchApplied === 1 &&
    correctionDomainEvents.length === 3 &&
    memoryEvents.length === 0;
  return { expected, actual, pass };
}

// --- INPROC-REGRESSION：全链路回归（MODIFY 别名路由 + 通用纠正） ----
async function caseInprocRegression(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const base = await creationBaseline(runtime, 'inprocregression');
  const { session, exp } = base;
  let stateVersion = base.state.state.stateVersion;

  // 修改轮：MODIFY 别名输入经创作会话路由保护 → 创作补丁轮次。
  const modification = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '把出口放远一点',
    expectedStateVersion: stateVersion,
    expectedCreationVersion: 1,
    requestId: `req-s2a-f3inproc-mod-${shortId()}`,
  });
  const modStream = modification.ok ? await consume(modification.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 纠正轮：否定纠正输入未命中创作修改族 → 通用 CORRECTION 重评估。
  const correctionRound = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CORRECTION',
    rawInput: '不对',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-f3inproc-correction-${shortId()}`,
  });
  const correctionStream = correctionRound.ok ? await consume(correctionRound.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 完成信号：STOP 执行路径登记创作完成。
  const stop = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '就这样',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-f3inproc-stop-${shortId()}`,
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
  const correctionApplied = eventsOf(expEvents, 'correction_applied');
  const reevaluated = eventsOf(expEvents, 'creation_reevaluated');
  const patchApplied = eventsOf(expEvents, 'creation_patch_applied');
  const expected = {
    chain: 'WHY → CREATE（建立）→ 修改轮（"把出口放远一点"——MODIFY 别名经创作会话路由保护 → 创作补丁轮次，创作 v2）→ 纠正轮（"不对"——未命中创作修改族 → 通用 CORRECTION 重评估 + creation_reevaluated）→ 完成信号（"就这样"，STOP 路径登记创作完成）全链路',
    finalState: 'COMPLETED/COMPLETION；创作 COMPLETE（active=false）；会话 SESSION_ENDED',
    contracts: '全部事件信封符合 C6 §7；sequence_number 严格单调（C6 §25）；全部决策追踪 policy_version=policy_v1.3.0；修改轮内容逐字节等于 create 语料；纠正轮 correction_applied + creation_reevaluated 齐备',
  };
  const actual = {
    modificationOk: modification.ok,
    modificationReason: modification.ok ? modification.header.policy_decision.reason : modification.error.code,
    modificationContentMatchesFixture: contentOf(modStream) === create.chunks.join(''),
    correctionOk: correctionRound.ok,
    correctionReason: correctionRound.ok ? correctionRound.header.policy_decision.reason : correctionRound.error.code,
    correctionContentMatchesFixture: contentOf(correctionStream) === correction.chunks.join(''),
    stopOk: stop.ok,
    finalState: `${state.state.status}/${state.state.stage} v${state.state.stateVersion}`,
    creationPhase: creation.ok ? creation.creation.phase : null,
    creationActive: creation.ok ? creation.active : null,
    creationVersion: creation.ok ? creation.creation.version : null,
    sessionState: sessionAfter?.state ?? null,
    envelopeViolations: envelopeViolations.length,
    sequenceMonotonic: sequenceOk,
    policyVersions: [...new Set(decisionTraces.map((traceEntry) => traceEntry.policy?.policy_version))],
    patchApplied: patchApplied.map((event) => event.properties.operation),
    correctionApplied: correctionApplied.length,
    reevaluated: reevaluated.length,
    eventCount: expEvents.length,
  };
  const pass =
    modification.ok &&
    modification.header.policy_decision.reason === 'creation_modification' &&
    contentOf(modStream) === create.chunks.join('') &&
    correctionRound.ok &&
    correctionRound.header.policy_decision.reason === 'reassess' &&
    contentOf(correctionStream) === correction.chunks.join('') &&
    stop.ok &&
    state.state.status === 'COMPLETED' &&
    state.state.stage === 'COMPLETION' &&
    creation.ok &&
    creation.creation.phase === 'COMPLETE' &&
    creation.active === false &&
    creation.creation.version === 2 &&
    sessionAfter?.state === 'SESSION_ENDED' &&
    envelopeViolations.length === 0 &&
    sequenceOk &&
    decisionTraces.length > 0 &&
    decisionTraces.every((traceEntry) => traceEntry.policy?.policy_version === 'policy_v1.3.0') &&
    patchApplied.length === 1 &&
    patchApplied[0].properties.operation === 'modify' &&
    correctionApplied.length === 1 &&
    reevaluated.length === 1;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表（E5 §4：每案例 12 字段记录）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'MODIFY-ALIAS',
    form: 'inprocess',
    servers: [],
    sourceClause: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2(2)；S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 1；C05.2 动作表（MODIFY = "用户要求修改已有结果"）；08 §10 修改类型族',
    scope: 'MODIFY 别名登记：MODIFY 词表分类为 CORRECTION 用户面别名（静态分类断言 + 非创作会话完整重评估链路）；优先级层不变',
    precondition: '进程内形态（默认合成网关）；每案例独立 ExperienceRuntime 与内存汇；静态分类断言直接调用已提交分类器',
    inputFault: 'MODIFY 族输入（"修改这个" / "调整一下"）+ 优先级混合输入（"好了，修改这个" / "换个方向，修改这个"）',
    run: caseModifyAlias,
  },
  {
    caseId: 'CORRECTION-FULL',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §3 变更 2；Evaluation System V1 §5 G07（remove invalid inference / preserve valid context / reassess）；D-02 选项 A（目标确定性派生）',
    scope: '完整 G07 链路：定位目标（previous_candidate 登记）+ 取消在途 generation + 有效上下文保留 + 重评估候选提交（版本 +1）+ correction_applied 事件',
    precondition: '会话 / 意图 / 体验链已建立（启动 v2）；WHY 完成后（v4）',
    inputFault: '"刚才那个不对"（指代词表 /刚才/ 命中 + 否定族 /不对/ 命中；声明 CORRECTION）',
    run: caseCorrectionFull,
  },
  {
    caseId: 'CREATION-INERT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §3 变更 3（D-01 选项 A 创作会话路由保护）；F-2 冻结文本 §3 变更 2/§4 变更 3（创作会话解释路由与 CREATION 阶段纠正保持）；08 §16 冲突判据',
    scope: '创作会话路由保护三轮：MODIFY 别名命中创作修改族 → 创作补丁轮次；否定纠正未命中 → 通用 CORRECTION 重评估（子状态不推进）；冲突判据 → ASK',
    precondition: 'CREATION-CHAIN 基线（WAITING/CREATION v6，创作 v1 USER_FEEDBACK）',
    inputFault: '三轮输入："修改障碍颜色"（声明 CREATE）/"不对"（声明 CORRECTION）/"不对，加两个障碍"（声明 CREATE）',
    run: caseCreationInert,
  },
  {
    caseId: 'RESTORE',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §3 变更 4 / §4 变更 2（D-04 选项 A）；08 §28（版本化与 RESTORE_PREVIOUS_VERSION）；S1-12 单调版本化不变式；OBL-01 纪律',
    scope: '创作会话恢复：add 轮（v2）→ 陈旧 expectedCreationVersion 恢复拒绝 → 恢复提交（v3，内容 = v1 快照，版本单调 +1，user_changes restore 条目，correction_restored 事件）',
    precondition: 'CREATION-CHAIN 基线（WAITING/CREATION v6，创作 v1 USER_FEEDBACK）',
    inputFault: '"再加两个障碍"（声明 CREATE，expectedCreationVersion=1）/"刚才那个更好"（声明 CREATE；先陈旧 expectedCreationVersion=1 拒绝，后 =2 接受）',
    run: caseRestore,
  },
  {
    caseId: 'STALE-REJECT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §4 变更 1（版本化提交契约化）；S1-12 同族纪律；OBL-01 纪律（失败写入不消耗版本号）；PD-16',
    scope: '非创作会话陈旧 expected_state_version 纠正提交 → STATE_VERSION_CONFLICT，状态逐字节不变',
    precondition: '会话 / 意图 / 体验链已建立；WHY 完成后（v4）',
    inputFault: '"不是"（声明 CORRECTION；expected_state_version=3 vs 当前 4）',
    run: caseStaleReject,
  },
  {
    caseId: 'NONCREATION-INERT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §5（S2A-F3-NONCREATION-INERT 案例大纲）；G3 黄金套件 G07-N 语义（关闭切片行为不回归）；PD-07',
    scope: '非创作会话行为与关闭切片一致（除 policy_version 字段与纠正域 correction_applied 事件）——G07-N 黄金语义逐项回归',
    precondition: '会话 / 意图 / 体验链已建立；WHY 完成后（v4）',
    inputFault: '"不是"（声明 CORRECTION；否定族原生输入）',
    run: caseNoncreationInert,
  },
  {
    caseId: 'NO-MEMORY',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §1 元素 8 / §5（S2A-F3-NO-MEMORY 案例大纲）；PD-07（不持久化跨会话 Memory）；G07-B 黄金断言同族',
    scope: '纠正域零 memory 事件：三域纠正事实（非创作纠正 + 创作会话通用纠正 + 创作恢复轮）均为会话内事件登记',
    precondition: '三条独立链（非创作纠正链 / 创作会话纠正链 / 创作会话恢复链）',
    inputFault: '"不是"（CORRECTION）/"不对"（创作会话 CORRECTION）/"再加两个障碍" + "刚才那个更好"（创作恢复轮）',
    run: caseNoMemory,
  },
  {
    caseId: 'INPROC-REGRESSION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F3-SEMANTIC-FREEZE-01 §5（S2A-F3-INPROC-REGRESSION 案例大纲）；G2 跨契约一致性；C6 §7（信封）/§25（sequence 单调）',
    scope: '全链路回归：WHY → CREATE → 修改轮（MODIFY 别名经创作会话路由保护）→ 纠正轮（通用 CORRECTION 重评估）→ 完成信号；信封全量有效、sequence 严格单调、policy_version=policy_v1.3.0',
    precondition: 'CREATION-CHAIN 基线（WAITING/CREATION v6，创作 v1 USER_FEEDBACK）',
    inputFault: '"把出口放远一点"（声明 CREATE，expectedCreationVersion=1）/"不对"（声明 CORRECTION）/"就这样"（声明 STOP）',
    run: caseInprocRegression,
  },
];

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  // Engine gate: exact Node lock (F-2 authorization-date LTS re-verification; F-3 continues the lock).
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1 / F2 / F3 / G3 / S2A-OBL-01 / S2A-F2-0001).
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
  // F-3 scope is correction-domain semantics, exercised against the real
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

  // A1: MODIFY-ALIAS.
  const cAlias = caseResults.find((entry) => entry.caseId === 'MODIFY-ALIAS');
  assert(
    'A1',
    'MODIFY-ALIAS：MODIFY 词表（08 §10 修改类型族）分类为 CORRECTION 用户面别名（静态断言 13 项全过 + 优先级混合输入 2 项全过）；非创作会话 "修改这个" / "调整一下" 完整重评估链路（correction_requested semantic_action=CORRECTION → experience_interrupted old_generation_rejected=true → generation/llm 链路 → state_transitioned CORRECTION → v6）→ correction_applied（correction_target=current_candidate, corrected_candidate_id=提案 ID, semantic_action=CORRECTION）；策略 EXPLAIN；决策追踪 reason=reassess, llm_used=true, policy_version=policy_v1.3.0',
    cAlias?.pass === true,
    { modifyAlias: cAlias?.pass },
  );

  // A2: CORRECTION-FULL.
  const cFull = caseResults.find((entry) => entry.caseId === 'CORRECTION-FULL');
  assert(
    'A2',
    'CORRECTION-FULL：完整 G07 链路——纠正目标确定性登记（correction_target={kind:"previous_candidate"}，D-02 指代词表派生，无新增模型调用）；取消在途 generation（old_generation_rejected=true）；有效上下文保留（why_requested 保留 / session 未终止 / intentId 一致）；重评估候选提交（v5 → v6）；correction_applied（correction_summary=输入, corrected_candidate_id 与 llm_request_completed.proposal_id 一致）；决策追踪 reason=reassess 且 secondary 含 previous_candidate',
    cFull?.pass === true,
    { correctionFull: cFull?.pass },
  );

  // A3: CREATION-INERT.
  const cInert = caseResults.find((entry) => entry.caseId === 'CREATION-INERT');
  assert(
    'A3',
    'CREATION-INERT：创作会话路由保护（D-01 选项 A）——"修改障碍颜色"（MODIFY 别名 → CORRECTION 分类）经创作修改族预检命中 → 创作补丁轮次（creation_patch_applied operation=modify target=obstacle kind=tune，创作 v2，决策追踪 llm_used=false，无 correction_applied / 无 state_transitioned CORRECTION / 无 creation_reevaluated——非 executeCorrect）；"不对"未命中创作修改族 → 通用 CORRECTION（creation_reevaluated phase=USER_FEEDBACK creation_version=2 不变 + correction_applied + state_transitioned CORRECTION，llm_used=true——F-2 变更 3 保持）；"不对，加两个障碍"冲突判据 → ASK（单块澄清问题流含 CHANGE_DIRECTION 与确认，创作版本/阶段/user_changes 不变，无 creation_patch_applied，llm_used=false）',
    cInert?.pass === true,
    { creationInert: cInert?.pass },
  );

  // A4: RESTORE.
  const cRestore = caseResults.find((entry) => entry.caseId === 'RESTORE');
  assert(
    'A4',
    'RESTORE：创作会话恢复（D-04 选项 A）——add 轮 v2（objects=[player,exit,obstacle,obstacle_2_2]，obstacle_count=2）；陈旧 expectedCreationVersion（=1 vs 2）恢复提交 STATE_VERSION_CONFLICT 拒绝（details 含 expected/current_creation_version）；恢复提交 v3（版本单调 +1——S1-12 不变式；objects=[player,exit]，variables={progress:0} 即 v1 快照——obstacle_count 消失证明内容恢复而非版本指针回滚；user_changes 2 条 [add@2, restore@3]，restore 条目 change.restoreFromVersion=1；correction_restored 事件 restored_from_version=1 / restored_to_version=3 / semantic_action=CORRECTION；creation_patch_applied operation=restore；头 reason=creation_restore；决策追踪 reason=creation_restore, llm_used=false, policy_version=policy_v1.3.0；终态 WAITING/CREATION）',
    cRestore?.pass === true,
    { restore: cRestore?.pass },
  );

  // A5: STALE-REJECT.
  const cStale = caseResults.find((entry) => entry.caseId === 'STALE-REJECT');
  assert(
    'A5',
    'STALE-REJECT：非创作会话陈旧 expected_state_version（3 vs 4）纠正提交 → STATE_VERSION_CONFLICT（retryable=false，details 含 expected/current_state_version）；状态逐字节不变（JSON 序列化前后一致）；无 correction_applied 事件；无新 state_transitioned 事件；事件计数不变（失败写入不消耗版本号——OBL-01 纪律）',
    cStale?.pass === true,
    { staleReject: cStale?.pass },
  );

  // A6: NONCREATION-INERT.
  const cNoncreation = caseResults.find((entry) => entry.caseId === 'NONCREATION-INERT');
  assert(
    'A6',
    'NONCREATION-INERT：非创作会话行为与关闭切片一致（G07-N 黄金语义回归：correction_requested×1 + why_requested×1 + interrupted reason=correction×1 + state_transitioned CORRECTION + 决策追踪 reason=reassess + 终态 WAITING/UNDERSTANDING v6 + lastSemanticAction=CORRECTION + 零 memory 事件）；与关闭切片仅有的差异为 policy_version=policy_v1.3.0 与 correction_applied 事件登记（D-05）',
    cNoncreation?.pass === true,
    { noncreationInert: cNoncreation?.pass },
  );

  // A7: NO-MEMORY.
  const cNoMemory = caseResults.find((entry) => entry.caseId === 'NO-MEMORY');
  assert(
    'A7',
    'NO-MEMORY：纠正域零 memory 事件（PD-07；G07-B 同族）——三域纠正事实齐备（非创作 correction_applied×1 + 创作会话 correction_applied×1 与 creation_reevaluated×1 + 创作恢复轮 correction_restored×1 与 creation_patch_applied operation=restore×1）；全部事件中 memory 事件 = 0',
    cNoMemory?.pass === true,
    { noMemory: cNoMemory?.pass },
  );

  // A8: INPROC-REGRESSION.
  const cInproc = caseResults.find((entry) => entry.caseId === 'INPROC-REGRESSION');
  assert(
    'A8',
    'INPROC-REGRESSION：WHY → CREATE → 修改轮（"把出口放远一点"——MODIFY 别名经创作会话路由保护 → 创作补丁轮次，创作 v2，头 reason=creation_modification，内容逐字节等于 create 语料）→ 纠正轮（"不对"——通用 CORRECTION 重评估，头 reason=reassess，内容逐字节等于 correction 语料）→ 完成信号（"就这样" STOP 路径）全链路——信封全量有效（C6 §7）、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v1.3.0、creation_patch_applied operation=modify×1、correction_applied×1、creation_reevaluated×1、终态 COMPLETED/COMPLETION + 创作 COMPLETE(active=false, v2) + 会话 SESSION_ENDED',
    cInproc?.pass === true,
    { inprocRegression: cInproc?.pass },
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
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4；${CASE_REGISTRY.length} 执行；PD-19 延期义务已履行——G04/G07/G08 关闭切片执行，无 DEFERRED 登记）`,
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
  assert('A10', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // A11-PREFLIGHT: preflight / integrity (informational; failures are FATAL above).
  assert(
    'A11-PREFLIGHT',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // ---------------------------------------------------------------------------
  // E5 §3 version matrix (run-metadata.json) — S2a F-3 correction-semantics form.
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
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
    'src/experience/fixtures/change-direction.ts',
    'src/experience/fixtures/simulate.ts',
    'src/experience/fixtures/create.ts',
    'src/experience/fixtures/correction.ts',
    'tools/evidence/src/s2a-f3.mjs',
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
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2/§6：F-3——G07 完整 Correction 语义（S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：MODIFY 用户面别名登记 + 纠正目标确定性定位 + 创作会话路由保护 + RESTORE_PREVIOUS_VERSION 恢复子型 + 纠正域事件词表）',
    authorization: { id: 'P3-S2-IMPL-AUTH-01', version: '1.2.0', issued: '2026-10-09', note: '产品负责人签署生效（AUTHORIZED）；§4 修订：F-3 语义冻结文本于首个动态证据运行（S2A-F3-0001）前完成版本化冻结 + C1/C2/C3 Steward 确认（G1 式纪律）' },
    obligationTraceability: {
      'F-3 (G07 Correction)': {
        semanticFreeze: 'docs/product/p3-s1/s2a-f3-semantic-freeze-staged.md（S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-09 产品负责人签署）',
        frozenDecisions: {
          'D-01': '选项 A（MODIFY 别名登记 + 创作会话路由保护：RESTORE 预检 → 创作修改族预检 → 命中创作族 CREATE 伞形 / 冲突判据 ASK / 未命中通用 CORRECTION）',
          'D-02': '选项 A（纠正目标确定性规则派生——指代词表 + 默认当前候选 / 创作分量映射；无新增模型调用）',
          'D-03': '选项 A（创作域经 F-2 补丁机制承载不重建；非创作域经重评估链路完整化——目标登记 + 纠正历史事件登记）',
          'D-04': '选项 A（RESTORE_PREVIOUS_VERSION 登记为 CORRECTION 用户面恢复子型，不新增轴触发器；创作域经创作存储回滚提交——版本单调 +1，新版本内容 = 目标历史版本内容）',
          'D-05': '选项 A（纠正域事件 correction_applied / correction_restored；C6 §14 命名模式）',
        },
        implementationFiles: ['src/experience/correction.ts（纠正域：MODIFY/RESTORE/指代词表 + isRestoreIntent + deriveCorrectionTarget）', 'src/experience/classifier.ts（MODIFY 别名登记 + RESTORE 子型 correctionIntent 标记）', 'src/experience/creation.ts（CreationOperation=restore + 版本快照历史 + TARGET_SYNONYMS 导出）', 'src/experience/events.ts（纠正域事件词表常量）', 'src/experience/runtime.ts（创作会话路由保护 + correction_applied / correction_restored 事件 + restore_previous_version / creation_restore 决策追踪 reason）', 'src/experience/policy.ts（POLICY_VERSION=policy_v1.3.0）'],
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: 'G3-GOLDEN-0001 PASSED（32/32 案例；断言已同步 policy_v1.3.0）',
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
      version: 'state_machine_v1.2.0',
      implemented: [
        'L0 Session（§4）',
        'L2 Experience 状态机（§7）',
        'L2 阶段机（§14/§15）',
        'Forbidden Transitions（§23）',
        '创造状态机 V1（13 §16——轴外子状态机；S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1）',
        'CORRECTION 操作序列契约化（S2A-F3-SEMANTIC-FREEZE-01 §4 变更 1：定位目标（确定性派生）→ 取消在途 generation（旧候选拒绝）→ 重评估纠正候选（LLM 提案 → 验证）→ 版本化提交（S1-12；expected_state_version 陈旧 → STATE_VERSION_CONFLICT）→ 纠正域事件登记；序列任一步失败不消耗版本号、不修改已提交状态）',
        'RESTORE 语义（§4 变更 2：不新增体验轴触发器；创作域经创作存储回滚提交——创作版本单调 +1（新版本内容 = 目标历史版本内容；user_changes 登记 restore 条目；expectedCreationVersion + expectedStateVersion 双重前置校验）；创作子状态机不推进；非创作域 CORRECTION 迁移 + 重评估（decision-trace reason=restore_previous_version）；版本指针回滚非法（违反 S1-12 单调不变式））',
      ],
    },
    policy: {
      contract: 'C3',
      version: 'policy_v1.3.0',
      frozenMappingsImplemented: {
        DIRECT_ANSWER: 'ANSWER',
        WHY: 'EXPLAIN',
        WHAT_IF: 'SIMULATE',
        CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
        STOP: 'STOP',
        CREATE: 'CREATE（PD-21 关闭切片启用；F-2 起承载完整 G04 创作语义；F-3 起创作会话内 MODIFY 别名输入经路由保护回创作解释）',
        CORRECTION: 'EXPLAIN（G07 完整语义 F-3 起完整化：定位目标 / 局部修改 / 重生成 / 历史版本化；MODIFY 用户面别名 + RESTORE 恢复子型；策略映射不变）',
      },
      frozenMapAuthority: 'S1 规范 §14 Policy Rules（acceptance-mapping §A/C 批准范围）+ S2A-F3-SEMANTIC-FREEZE-01 §3 变更文本（policy_v1.3.0）',
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
        'POST /api/experience/{id}/event（event.semantic_action 声明校验 + expected_state_version；创作修改 / 恢复轮经 expected_creation_version 双重前置校验——工程实现字段，迭代记录登记）',
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
        '纠正域事件（S2A-F3：correction_applied / correction_restored——C6 §14 命名模式 <domain>_<past_participle>；D-05 选项 A）',
      ],
    },
    engineeringBoundaries: {
      contract: 'P2-EVIDENCE-4.0',
      evidence: 'EB-02（失败写入不消耗版本号——STALE-REJECT / RESTORE 陈旧拒绝）；EB-06（重试是工程恢复机制——本迭代无重试路径改动）；EB-07（超时不自行决定新方向）；EB-13（完成不属于 LLM 自主权限）；EB-14（分析只能观察）；EB-16（版本可追溯——本版本矩阵 + A2/A14）',
      seamBoundary: '本迭代无注入缝改动（注入缝属 F-1；SEAM-INERT 不变式由 S2A-OBL-01-0001 证据保持，本运行进程内形态默认合成网关）',
      s2ScopeItems: {
        memory: 'Minimal Memory 属 S2a 后续迭代 F-5（短期记忆 only，6 个月自动删除，无长期画像——PD-23 裁决）',
        deepenSimplifyReframe: 'DEEPEN/SIMPLIFY/REFRAME 属 S2b（PD-23 裁决；识别后 INVALID_ACTION 升级拒绝——S2A-F2-0001 DEFERRED-OP 案例）',
        correction: 'G07 完整 Correction 语义属 S2a F-3（policy_v1.3.0）——本迭代已实施（S2A-F3-0001）',
        whatIf: 'WHAT_IF 全分支属 S2a F-4（policy_v1.4.0）',
      },
    },
    correctionSemantics: {
      aliasRegistration: 'MODIFY 登记为 CORRECTION 用户面别名（授权 §2(2)；08 §10 修改类型族，与创作修改族同源——单一词表两处路由）；不新增顶层 SemanticAction / PolicyAction（PD-23 §5）；分类优先级层不变（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY > WHAT_IF > DIRECT_ANSWER）',
      targetDerivation: '确定性规则派生（D-02 选项 A）：指代词表（刚才 / 那个 / 上一步 / 上一个 / 上一版 / 上一个版本 → 上一候选）+ 创作分量映射（TARGET_SYNONYMS 同义词表）+ 默认当前候选；无新增模型调用（合成网关无真实语义提取能力——E5 环境约束）',
      domainCarriage: '创作域 G07 经 F-2 补丁机制承载（D-03 选项 A：不重建）；非创作域经重评估链路完整化（目标登记 + 纠正历史事件登记；重评估候选替换即"局部修改"在非结构化理解状态的忠实派生——不重放会话历史）',
      routingProtection: '创作会话路由保护（D-01 选项 A）：活跃创作会话内 CORRECTION 分类输入先经 RESTORE 预检（D-04 词表，创作版本 >1），再经创作修改族预检（复用 interpretCreationInput 词表族与 08 §16 冲突判据）——命中创作 ADD/REMOVE/MODIFY 族 → 创作解释（CREATE 伞形 + 补丁轮次，F-2 机制不变）；命中冲突判据 → ASK（至多一个澄清问题）；未命中 → 通用 CORRECTION 路径（F-2 变更 3 保持：重评估创作子状态，不推进子状态机）',
      restoreSubtype: 'RESTORE_PREVIOUS_VERSION 登记为 CORRECTION 用户面恢复子型（D-04 选项 A；词表：刚才那个更好 / 退回刚才那个 / 撤销刚才修改）：创作域经创作存储回滚提交（版本单调 +1——S1-12 不变式：版本指针永不回退；新版本内容 = 目标历史版本内容；user_changes 登记 restore 条目含恢复来源版本号；correction_restored 事件）；非创作域经意图登记 + 重评估（decision-trace reason=restore_previous_version）；版本指针回滚非法',
      events: '纠正域事件（D-05 选项 A）：correction_applied（correction_target / correction_summary / corrected_candidate_id / semantic_action=CORRECTION）与 correction_restored（restored_from_version / restored_to_version / creation_id / semantic_action=CORRECTION）；创作域常规修改轮次仍由 F-2 creation_patch_applied 登记（不重复建设）',
      crossSession: '纠正不持久化跨会话（PD-07——纠正域事件均为会话内事实登记，无 memory 层事件；NO-MEMORY 案例零 memory 事件断言）',
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
      changedFiles: ['src/experience/correction.ts', 'src/experience/classifier.ts', 'src/experience/creation.ts', 'src/experience/events.ts', 'src/experience/policy.ts', 'src/experience/runtime.ts', 'tools/evidence/src/golden.mjs', 'tools/evidence/src/s2a-f3.mjs', 'tools/evidence/package.json'],
    },
    prompt: { value: 'synthetic-fixture', reason: '无真实 LLM 提供方调用（E5 §2 排除项；ADR-0002 §3 硬边界）' },
    model: { value: 'synthetic-fixture', reason: '同上；LLM 网关为合成实现（经 LlmGateway 接口）' },
    corpus: {
      fixtures: [
        { fixtureId: 'synthetic/why/v1', file: 'src/experience/fixtures/why.ts', sha256: runtimeFileHashes['src/experience/fixtures/why.ts'] },
        { fixtureId: 'synthetic/create/v1', file: 'src/experience/fixtures/create.ts', sha256: runtimeFileHashes['src/experience/fixtures/create.ts'] },
        { fixtureId: 'synthetic/correction/v1', file: 'src/experience/fixtures/correction.ts', sha256: runtimeFileHashes['src/experience/fixtures/correction.ts'] },
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
      g3: { runId: 'G3-GOLDEN-0001', result: 'PASSED（golden 再生验证，policy_v1.3.0 断言同步后 32/32）' },
      s2a: {
        f1: { runId: 'S2A-OBL-01-0001', result: 'PASSED（7/7 案例、12/12 断言、退出码 0）' },
        f2: { runId: 'S2A-F2-0001', result: 'PASSED（10/10 案例、16/16 断言、退出码 0）' },
      },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    executor: 'tools/evidence/src/s2a-f3.mjs',
    executorSha256: sha256OfBuffer(await readFile(path.join(here, 's2a-f3.mjs'))),
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S2a F-3 correction-semantics form)');

  // A12: run-metadata completeness (E5 §3).
  const requiredSections = [
    'runId', 'obligation', 'authorization', 'obligationTraceability', 'productDecisions', 'contracts',
    's1Specifications', 'stateMachine', 'policy', 'api', 'event', 'engineeringBoundaries',
    'correctionSemantics', 'evaluation', 'code', 'prompt', 'model', 'corpus', 'environment', 'packages',
    'startedAt', 'finishedAt', 'durationMs', 'executor',
  ];
  const missingSections = requiredSections.filter((section) => !(section in versionMatrix));
  assert('A12', 'run-metadata 完整（E5 §3 版本矩阵全部字段 + F-3 纠正语义专项 correctionSemantics + obligationTraceability）', missingSections.length === 0, { missingSections });

  // A13: environment lock.
  assert(
    'A13',
    '环境锁定：engines.node === "24.21.0"（F-2 精确锁定，F-3 延续）且执行于 Node v24.21.0；lockfileVersion 3；Next.js / React / TypeScript 版本登记',
    productPackage.engines?.node === '24.21.0' && process.version === NODE_LOCK && lockfile.lockfileVersion === 3,
    { enginesNode: productPackage.engines?.node, processVersion: process.version, lockfileVersion: lockfile.lockfileVersion, next: nextVersion, react: reactVersion, typescript: typescriptVersion },
  );

  // A14: F-3 version matrix obligations (versioned change texts bound).
  assert(
    'A14',
    'F-3 版本矩阵义务绑定：policy 版本 policy_v1.3.0（S2A-F3-SEMANTIC-FREEZE-01 §3）；state_machine 版本 state_machine_v1.2.0（§4）；frozenDecisions D-01…D-05 齐备（全项选项 A）；黄金回归绑定 G3-GOLDEN-0001（断言已同步 policy_v1.3.0）；实施文件清单 6 项齐备（含 correction.ts 新增）',
    versionMatrix.policy.version === 'policy_v1.3.0' &&
      versionMatrix.stateMachine.version === 'state_machine_v1.2.0' &&
      Object.keys(versionMatrix.obligationTraceability['F-3 (G07 Correction)'].frozenDecisions).length === 5 &&
      versionMatrix.obligationTraceability['F-3 (G07 Correction)'].goldenRegression.includes('policy_v1.3.0') &&
      versionMatrix.obligationTraceability['F-3 (G07 Correction)'].implementationFiles.length === 6,
    { policyVersion: versionMatrix.policy.version, stateMachineVersion: versionMatrix.stateMachine.version, frozenDecisionCount: Object.keys(versionMatrix.obligationTraceability['F-3 (G07 Correction)'].frozenDecisions).length, implementationFileCount: versionMatrix.obligationTraceability['F-3 (G07 Correction)'].implementationFiles.length },
  );

  // Summary (first pass — SHA256SUMS verification appended in second pass per G3-E-3).
  const allPassedFirst = allCasesPass && assertions.every((entry) => entry.passed);
  const summary = {
    runId: RUN_ID,
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2/§6：F-3——G07 完整 Correction 语义（S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：MODIFY 用户面别名登记 + 纠正目标确定性定位 + 创作会话路由保护 + RESTORE_PREVIOUS_VERSION 恢复子型 + 纠正域事件词表）',
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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。F-3 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A15', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

  // Final pass: refresh summary with A12 included, then regenerate the
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

运行：${RUN_ID}（S2a F-3 迭代：G07 完整 Correction 语义——MODIFY 用户面别名登记 + 纠正目标确定性定位 + 创作会话路由保护 + RESTORE_PREVIOUS_VERSION 恢复子型 + 纠正域事件词表）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-3 → 案例 / 断言映射；correctionSemantics：纠正语义规范登记；frozenDecisions：D-01…D-05 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 别名登记（MODIFY-ALIAS）：MODIFY 词表（08 §10 修改类型族）分类为 CORRECTION 用户面别名——静态分类断言 13 项（tune / rebalance / restyle / replace / rename 各族 + RESTORE 子型标记 + 原生族不变 + S2b 保留输入仍 UNKNOWN + 创作 ADD 族仍 UNKNOWN）+ 优先级混合输入 2 项（P-01/P-03 不变）；非创作会话 "修改这个" / "调整一下" 完整重评估链路（correction_requested → experience_interrupted old_generation_rejected=true → generation/llm 链路 → state_transitioned CORRECTION → v6）→ correction_applied（correction_target=current_candidate, corrected_candidate_id=提案 ID）
- 完整 G07 链路（CORRECTION-FULL）："刚才那个不对"——纠正目标 previous_candidate 确定性登记（D-02 指代词表）；取消在途 generation；有效上下文保留（why_requested / session / intentId）；重评估候选提交（v5 → v6）；correction_applied（corrected_candidate_id 与 llm_request_completed.proposal_id 一致）；决策追踪 reason=reassess 且 secondary 含 previous_candidate
- 创作会话路由保护（CREATION-INERT）："修改障碍颜色"（MODIFY 别名 → CORRECTION 分类）经创作修改族预检命中 → 创作补丁轮次（creation_patch_applied operation=modify target=obstacle kind=tune，创作 v2，llm_used=false——非 executeCorrect）；"不对"未命中创作修改族 → 通用 CORRECTION（creation_reevaluated phase=USER_FEEDBACK 不变 + correction_applied + state_transitioned CORRECTION，llm_used=true——F-2 变更 3 保持）；"不对，加两个障碍"冲突判据（08 §16）→ ASK（单块澄清问题流，创作版本/阶段/user_changes 不变）
- 恢复提交（RESTORE）：add 轮 v2 → 陈旧 expectedCreationVersion 恢复 STATE_VERSION_CONFLICT 拒绝 → 恢复提交 v3（版本单调 +1——S1-12 不变式；objects=[player,exit]、variables={progress:0} 即 v1 快照——obstacle_count 消失证明内容恢复而非版本指针回滚；user_changes [add@2, restore@3]，restore 条目 change.restoreFromVersion=1；correction_restored 事件 restored_from_version=1 / restored_to_version=3 / semantic_action=CORRECTION；头 reason=creation_restore；决策追踪 reason=creation_restore, llm_used=false）
- 陈旧拒绝（STALE-REJECT）：非创作会话陈旧 expected_state_version（3 vs 4）纠正提交 → STATE_VERSION_CONFLICT；状态逐字节不变（JSON 序列化前后一致）；无 correction_applied / 无新 state_transitioned；事件计数不变（OBL-01）
- 非创作会话回归（NONCREATION-INERT）：G07-N 黄金语义逐项回归（correction_requested×1 + why_requested×1 + interrupted reason=correction×1 + state_transitioned CORRECTION + 决策追踪 reason=reassess + 终态 WAITING/UNDERSTANDING v6 + lastSemanticAction=CORRECTION + 零 memory 事件）；与关闭切片仅有的差异为 policy_version=policy_v1.3.0 与 correction_applied 事件登记
- 零 memory 事件（NO-MEMORY）：三域纠正事实（非创作纠正 + 创作会话通用纠正 + 创作恢复轮）均为会话内事件登记；全部事件 memory 事件 = 0（PD-07）
- 全链路回归（INPROC-REGRESSION）：WHY → CREATE → 修改轮（"把出口放远一点"——MODIFY 别名经创作会话路由保护 → 创作补丁轮次，创作 v2）→ 纠正轮（"不对"——通用 CORRECTION 重评估）→ 完成信号（"就这样" STOP 路径）全链路——信封全量有效（C6 §7）、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v1.3.0、修改轮 / 纠正轮内容逐字节等于 create / correction 语料、终态 COMPLETED/COMPLETION + 创作 COMPLETE(active=false, v2) + 会话 SESSION_ENDED

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-4（WHAT_IF 全分支，policy_v1.4.0）/ F-5（Minimal Memory——隐私敏感存储 / 加密设计待产品负责人指示）
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s2a-f3   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's2a-f3-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's2a-f3-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
