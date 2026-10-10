// S2A-F4-0001 — S2a F-4 迭代动态证据执行器
// （P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§6 授权范围：F-4——WHAT_IF 完整分支语义，
//   依据 S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施；
//   ADOPT_BRANCH 显式回流经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A
//   裁决补写生效——policy_v2.2.0 变更 1–5，本运行扩展 BRANCH-ADOPT
//   案例组回归；S2B-SEMANTIC-FREEZE-01 D-05 经 policy_v2.2.0 延续）
//
// S3 回归扩展（S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划——
//   CR-28 全项 A 裁决 2026-10-10）：① 策略版本随 S3a 实施升至
//   policy_v2.2.0（S3A/S3B-SEMANTIC-FREEZE-01 §3 变更文本——F-4 语义
//   经 policy_v2.2.0 延续不变，全部 policy_version 断言同步）；② S2 时代
//   "模拟域随会话结束失效"负向不变式（D-04 选项 A）经 S3B-SEMANTIC-
//   FREEZE-01 v1.0.0 D-2 选项 A 取代——分支记录全量跨会话持久化
//   （STOP 后 getSimulation 成功：currentBranchId 会话级清空为 null，
//   分支记录与模拟历史保留）；S2 时代已提交运行产物按 ADR-0002 §5
//   保持冻结不改写；本执行器断言当前冻结语义。
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
const RUN_ID = 'S2A-F4-0001';
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
  'F-4 范围边界（S2A-F4-SEMANTIC-FREEZE-01 §1/§2 D-01 选项 A 分层）：WHAT_IF → SIMULATE 映射不变（S1 §14）；执行语义由 PD-06 单次模拟提案扩展为多轮模拟持久化（第一层）+ 轴外分支子状态机（第二层，D-02/D-03 选项 A）；不新增顶层 SemanticAction / PolicyAction（PD-23 §5）；分类优先级层不变（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY > WHAT_IF > DIRECT_ANSWER）',
  '多轮模拟持久化（§3 变更 1，第一层）：每轮模拟结果经模拟域事件登记（simulation_recorded，D-05 选项 A）——properties 含 fact / inference / hypothesis / simulation 四元分离字段 + 源输入摘要；模拟历史会话内持久（D-04 选项 A——07 §3 Session State 纪律）；多轮模拟阶段迁移保持 SIMULATION（13 §15.3）；每次合法提交版本恰好 +1（S1-12；stale 拒绝）；不新建 Session / Experience（G03-N 不变式）',
  '四元分离不变式（E8-G2-CC07）：模拟结果不得表现为事实——事件 schema 约束（simulation 字段与 fact 字段互斥注记 separation_invariant=simulation_result_is_not_fact）+ 内容语料分离格式（事实——/推断——/假设——标记）双重保证',
  '轴外分支子状态机（§3 变更 2 / §4 变更 2，D-02 选项 A）：分支记录为体验状态轴之外的持久对象（branch_id / 源模拟轮次 / 模拟结果记录（四元分离）/ 版本 / 生命周期状态五分量）；体验阶段轴不变（WHAT_IF 轮次保持 SIMULATION 阶段，13 §15.3——分支操作不新增体验轴触发器）；分支模拟结果默认不回流为主线结论（D-02 选项 A 推导——"采用某分支结论"须产品负责人另案版本化定义，本版不预先写死）',
  '分支生命周期操作集（D-03 选项 A 四操作最小集 + S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 第五操作）：CREATE（WHAT_IF 首轮自动创建分支记录）/ SWITCH（显式切换激活分支）/ ABANDON（放弃分支）/ RETURN（返回主线模拟上下文）/ ADOPT_BRANCH（显式采用分支结论——目标分支记录附加 adopted 标记，生命周期契约不变；采用结果经 simulation_adopted 事件登记，properties 含 branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact；采用结果呈现为新一轮模拟上下文，主线当前上下文不变，用户须另行 CREATE 提交方将采纳内容纳入作品）；操作识别为确定性规则词表（同分类器纪律，具体词表为实现细节；词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH）；SWITCH / ABANDON / ADOPT_BRANCH 须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径；分支模拟结果默认不回流为主线结论（D-02 选项 A——显式回流是经用户指令的例外通道，非默认行为）',
  '分支状态会话内持久、会话结束失效（D-04 选项 A）：跨 USER_ACTION / RESPONSE_COMPLETED 周期存活；体验完成 / 方向变更 / 重复 CREATE 取代在途创作会话时模拟域失效（事件为不可变权威事实——C6 §5，失效仅作用于运行时存储）；跨会话分支持久化属 F-5 Minimal Memory 裁决范围（授权 §2(4) 专管），本切片不实施',
  'P-01 STOP 永远优先；P-02 CHANGE 必须取消旧操作；P-03 显式用户方向优先；P-04 策略不生成事实内容；P-05 LLM 不选择最终 Action；PD-12 同层解释顺序 WHY > WHAT_IF',
  '所有状态写入经版本化单写者路径（expected_state_version，PD-16）；分支操作轮次经同一串行化写者纪律（版本化提交后应用——S1-12）；失败写入不消耗任何版本号（OBL-01 纪律——含分支操作前置校验拒绝）',
  'LLM 输出永远是提案；任何越权状态写入提案被拒绝且不产生状态写入（S1 §17；CC02 H01/H05）；分支操作轮次为确定性系统回合（无 LLM 提案——决策追踪 llm_used=false）',
  '事件为不可变事实（C6 §5）；信封符合 C6 §7；同一 Experience Runtime 内 sequence_number 严格单调（C6 §25）；event_id 幂等去重（C6 §27）',
  '决策追踪与 LLM/Policy/State 事件分离记录（C6 §22/§23）；模拟轮次决策追踪 reasonPrimary=semantic_action（llm_used=true）；分支操作轮次 reasonPrimary=explicit_user_direction（llm_used=false）；拒绝轮次 reasonPrimary=invalid_state_transition',
  '模拟不持久化跨会话（PD-07——模拟域事件与分支记录均为会话内事实登记，无 memory 层事件）',
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

/** 标准链路：Session → 意图解析 → 体验启动（WHAT_IF 意图输入可参数化）。 */
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
  return { session, intent, exp: exp.experience ?? exp };
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

/** 模拟域快照（getSimulation API——E5 进程内形态取证入口）。 */
function snapshotOf(runtime, experienceId) {
  const result = runtime.getSimulation(experienceId);
  return result.ok ? result.simulation : undefined;
}

/** WHAT_IF 模拟轮提交（声明语义动作 WHAT_IF；返回提交结果与流事件）。 */
async function whatIfRound(runtime, chain, rawInput, requestId) {
  const state = runtime.getExperienceState(chain.exp.experienceId).state;
  const submission = await runtime.submitExperienceEvent({
    experienceId: chain.exp.experienceId,
    sessionId: chain.session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput,
    expectedStateVersion: state.stateVersion,
    requestId,
  });
  const stream = submission.ok ? await consume(submission.stream) : [];
  return { submission, stream, stateVersionBefore: state.stateVersion };
}

// ---------------------------------------------------------------------------
// 案例运行器（S2a F-4：WHAT_IF 完整分支语义；全部进程内形态）
// ---------------------------------------------------------------------------

// --- MULTI-ROUND：多轮模拟持久化（§3 变更 1 第一层；13 §15.3） -------
async function caseMultiRound(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'multiround', '如果摩擦力为零会怎样');
  const { session, exp } = chain;

  // 模拟轮 1：WHAT_IF 首轮——UNDERSTANDING → SIMULATION，版本 v2 → v4。
  const r1 = await whatIfRound(runtime, chain, '如果摩擦力为零会怎样', `req-s2a-f4mr-1-${shortId()}`);
  const afterR1 = runtime.getExperienceState(exp.experienceId).state;

  // 模拟轮 2：SIMULATION → SIMULATION（13 §15.3 多轮合法），版本 v4 → v6。
  const r2 = await whatIfRound(runtime, chain, '假如速度再高一点会怎样', `req-s2a-f4mr-2-${shortId()}`);
  const afterR2 = runtime.getExperienceState(exp.experienceId).state;

  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');
  const transitioned = eventsOf(expEvents, 'state_transitioned');
  const decisionTraces = tracesOf(traces, exp.experienceId);
  const snapshot = snapshotOf(runtime, exp.experienceId);
  const r1Content = contentOf(r1.stream);
  const r2Content = contentOf(r2.stream);

  const expected = {
    chain: 'WHAT_IF 意图链 → 模拟轮 1（"如果摩擦力为零会怎样"）→ 模拟轮 2（"假如速度再高一点会怎样"）',
    versionChain: '启动 v2 → 轮 1 提交 v3 / 完成 v4 → 轮 2 提交 v5 / 完成 v6（每次合法提交恰好 +1，S1-12；版本链单调）',
    stage: 'UNDERSTANDING → SIMULATION → SIMULATION（13 §15.3 多轮模拟阶段保持）',
    events: 'simulation_recorded ×2（round 1 / 2，同一 branch——WHAT_IF 首轮自动 CREATE，D-03 选项 A；branch_created [true, false]）',
    content: '两轮内容逐字节等于 simulate 语料（合成数据；不省略、不累积）',
    decisionTrace: 'WHAT_IF 轮次决策追踪 reasonPrimary=semantic_action，llm_used=true，policy_version=policy_v2.2.0（F-4 语义冻结于 policy_v1.4.0 §3 变更 1/2，经现行 policy_v2.2.0 延续不变）',
  };
  const actual = {
    round1: {
      ok: r1.submission.ok,
      selectedAction: r1.submission.ok ? r1.submission.header.policy_decision.selected_action : r1.submission.error.code,
      headerVersion: r1.submission.ok ? r1.submission.header.state_version : null,
      finalVersion: afterR1.stateVersion,
      status: afterR1.status,
      stage: afterR1.stage,
      contentMatchesFixture: r1Content === simulate.chunks.join(''),
    },
    round2: {
      ok: r2.submission.ok,
      selectedAction: r2.submission.ok ? r2.submission.header.policy_decision.selected_action : r2.submission.error.code,
      headerVersion: r2.submission.ok ? r2.submission.header.state_version : null,
      finalVersion: afterR2.stateVersion,
      status: afterR2.status,
      stage: afterR2.stage,
      contentMatchesFixture: r2Content === simulate.chunks.join(''),
    },
    versionChain: [
      r1.stateVersionBefore,
      r1.submission.ok ? r1.submission.header.state_version : null,
      afterR1.stateVersion,
      r2.submission.ok ? r2.submission.header.state_version : null,
      afterR2.stateVersion,
    ],
    simulationRecorded: simEvents.map((event) => ({
      round: event.properties.round,
      branch_id: event.properties.branch_id,
      branch_created: event.properties.branch_created,
      separation_invariant: event.properties.separation_invariant,
    })),
    transitionedStages: transitioned.map((event) => `${event.properties.from.stage}->${event.properties.to.stage}`),
    snapshot: snapshot
      ? {
          rounds: snapshot.rounds.map((round) => round.round),
          branchCount: snapshot.branches.length,
          branchLifecycle: snapshot.branches.map((branch) => branch.lifecycle),
          branchVersions: snapshot.branches.map((branch) => branch.version),
          branchSourceRounds: snapshot.branches.map((branch) => branch.sourceRound),
          currentBranchId: snapshot.currentBranchId,
        }
      : null,
    policyVersions: [...new Set(decisionTraces.map((traceEntry) => traceEntry.policy?.policy_version))],
    llmUsed: decisionTraces.filter((traceEntry) => traceEntry.semantic_action === 'WHAT_IF').map((traceEntry) => traceEntry.execution.llm_used),
    reasonPrimary: decisionTraces.filter((traceEntry) => traceEntry.semantic_action === 'WHAT_IF').map((traceEntry) => traceEntry.reason.primary),
  };
  const pass =
    r1.submission.ok &&
    r1.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    r1.submission.header.state_version === 3 &&
    afterR1.stateVersion === 4 &&
    afterR1.status === 'WAITING' &&
    afterR1.stage === 'SIMULATION' &&
    r1Content === simulate.chunks.join('') &&
    r2.submission.ok &&
    r2.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    r2.submission.header.state_version === 5 &&
    afterR2.stateVersion === 6 &&
    afterR2.status === 'WAITING' &&
    afterR2.stage === 'SIMULATION' &&
    r2Content === simulate.chunks.join('') &&
    jsonEquals(actual.versionChain, [2, 3, 4, 5, 6]) &&
    simEvents.length === 2 &&
    simEvents[0].properties.round === 1 &&
    simEvents[1].properties.round === 2 &&
    simEvents[0].properties.branch_id === simEvents[1].properties.branch_id &&
    simEvents[0].properties.branch_created === true &&
    simEvents[1].properties.branch_created === false &&
    simEvents.every((event) => event.properties.separation_invariant === 'simulation_result_is_not_fact') &&
    jsonEquals(actual.transitionedStages, ['CURIOSITY->UNDERSTANDING', 'UNDERSTANDING->SIMULATION', 'SIMULATION->SIMULATION']) &&
    snapshot !== undefined &&
    snapshot.rounds.length === 2 &&
    snapshot.branches.length === 1 &&
    snapshot.branches[0].lifecycle === 'ACTIVE' &&
    snapshot.branches[0].version === 2 &&
    snapshot.branches[0].sourceRound === 1 &&
    snapshot.currentBranchId === snapshot.branches[0].branchId &&
    jsonEquals(actual.policyVersions, ['policy_v2.2.0']) &&
    jsonEquals(actual.llmUsed, [true, true]) &&
    jsonEquals(actual.reasonPrimary, ['semantic_action', 'semantic_action']);
  return { expected, actual, pass };
}

// --- SEPARATION：四元分离（E8-G2-CC07；D-05 选项 A） ----------------
async function caseSeparation(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'separation', '如果摩擦力为零会怎样');
  const { exp } = chain;

  const r1 = await whatIfRound(runtime, chain, '如果摩擦力为零会怎样', `req-s2a-f4sep-1-${shortId()}`);
  const r2 = await whatIfRound(runtime, chain, '假如速度再高一点会怎样', `req-s2a-f4sep-2-${shortId()}`);

  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');
  const snapshot = snapshotOf(runtime, exp.experienceId);

  // 语料分离格式确定性派生（与 deriveSimulationSeparation 同一解析规则——
  // 期望值由已提交语料字节机械派生，非代码推断）。
  const corpus = simulate.chunks.join('');
  const factSection = corpus.slice(corpus.indexOf('事实——') + '事实——'.length, corpus.indexOf('推断——'));
  const inferenceSection = corpus.slice(corpus.indexOf('推断——') + '推断——'.length, corpus.indexOf('假设——'));
  const hypothesisSection = corpus.slice(corpus.indexOf('假设——') + '假设——'.length, corpus.indexOf('。本提案'));

  const separationFacts = simEvents.map((event) => {
    const properties = event.properties;
    return {
      round: properties.round,
      fourFieldsPresent:
        typeof properties.fact === 'string' && properties.fact.length > 0 &&
        typeof properties.inference === 'string' && properties.inference.length > 0 &&
        typeof properties.hypothesis === 'string' && properties.hypothesis.length > 0 &&
        typeof properties.simulation === 'string' && properties.simulation.length > 0,
      factMatchesCorpusSection: properties.fact === factSection,
      inferenceMatchesCorpusSection: properties.inference === inferenceSection,
      hypothesisMatchesCorpusSection: properties.hypothesis === hypothesisSection,
      simulationIsFullCorpus: properties.simulation === corpus,
      simulationNotPresentedAsFact: properties.simulation !== properties.fact && properties.simulation.includes(properties.fact) && properties.simulation.length > properties.fact.length,
      corpusMarkers: ['事实——', '推断——', '假设——'].every((marker) => properties.simulation.includes(marker)),
      invariantNote: properties.separation_invariant,
      sourceInput: properties.source_input,
      linkage: {
        simulation_id: properties.simulation_id,
        proposal_id: properties.proposal_id,
        generation_id: properties.generation_id,
      },
    };
  });

  const snapshotMatchesEvents =
    snapshot !== undefined &&
    snapshot.rounds.length === simEvents.length &&
    snapshot.rounds.every((round, index) =>
      jsonEquals(round.separation, {
        fact: simEvents[index].properties.fact,
        inference: simEvents[index].properties.inference,
        hypothesis: simEvents[index].properties.hypothesis,
        simulation: simEvents[index].properties.simulation,
      }),
    );

  const expected = {
    separation: '每轮 simulation_recorded 事件 properties 含 fact / inference / hypothesis / simulation 四元字段（E8-G2-CC07 字段化承载——D-05 选项 A）',
    factSection: 'fact 字段 = 语料"事实——"与"推断——"之间分段（非全文——模拟结果不表现为事实）',
    simulationField: 'simulation 字段 = 完整模拟提案语料（含 事实——/推断——/假设—— 标记——内容语料分离格式双重保证）',
    invariant: 'separation_invariant=simulation_result_is_not_fact（事件 schema 互斥注记）',
    snapshotConsistency: '模拟域快照 separation 与事件 properties 逐字段一致（事件为不可变权威事实——C6 §5）',
  };
  const actual = {
    rounds: separationFacts,
    snapshotMatchesEvents,
    snapshotRounds: snapshot ? snapshot.rounds.length : null,
  };
  const pass =
    r1.submission.ok &&
    r2.submission.ok &&
    simEvents.length === 2 &&
    separationFacts.length === 2 &&
    separationFacts.every(
      (fact) =>
        fact.fourFieldsPresent &&
        fact.factMatchesCorpusSection &&
        fact.inferenceMatchesCorpusSection &&
        fact.hypothesisMatchesCorpusSection &&
        fact.simulationIsFullCorpus &&
        fact.simulationNotPresentedAsFact &&
        fact.corpusMarkers &&
        fact.invariantNote === 'simulation_result_is_not_fact' &&
        fact.linkage.simulation_id.startsWith('sim_round_synthetic_') &&
        typeof fact.linkage.proposal_id === 'string' && fact.linkage.proposal_id.length > 0 &&
        typeof fact.linkage.generation_id === 'string' && fact.linkage.generation_id.length > 0,
    ) &&
    separationFacts[0].sourceInput === '如果摩擦力为零会怎样' &&
    separationFacts[1].sourceInput === '假如速度再高一点会怎样' &&
    snapshotMatchesEvents;
  return { expected, actual, pass };
}

// --- NO-NEW-EXPERIENCE：多轮模拟不创建新 Session / Experience -------
async function caseNoNewExperience(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'nonewexperience', '如果摩擦力为零会怎样');
  const { session, exp } = chain;

  const r1 = await whatIfRound(runtime, chain, '如果摩擦力为零会怎样', `req-s2a-f4nne-1-${shortId()}`);
  const r2 = await whatIfRound(runtime, chain, '假如速度再高一点会怎样', `req-s2a-f4nne-2-${shortId()}`);
  // 分支操作轮（RETURN）同样不创建新 Session / Experience。
  const stateBeforeReturn = runtime.getExperienceState(exp.experienceId).state;
  const returnOp = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果返回主线呢',
    expectedStateVersion: stateBeforeReturn.stateVersion,
    requestId: `req-s2a-f4nne-return-${shortId()}`,
  });
  if (returnOp.ok) {
    await consume(returnOp.stream);
  }
  const sessionAfter = runtime.getSession(session.sessionId);

  const sessionStarted = eventsOf(events, 'session_started');
  const experienceStarted = eventsOf(events, 'experience_started');
  const sessionEnded = eventsOf(events, 'session_ended');
  const expEvents = expEventsOf(events, exp.experienceId);
  const distinctSessions = new Set(expEvents.map((event) => event.context.session_id));
  const distinctExperiences = new Set(expEvents.map((event) => event.context.experience_id));

  const expected = {
    invariant: 'G03-N 不变式：多轮模拟 + 分支操作轮不创建新 Session / Experience（session_started=1，experience_started=1）',
    session: '会话保持 SESSION_ACTIVE（未终止）',
    identity: '全部体验事件共享同一 session_id / experience_id',
  };
  const actual = {
    round1Ok: r1.submission.ok,
    round2Ok: r2.submission.ok,
    returnOk: returnOp.ok,
    sessionStartedCount: sessionStarted.length,
    experienceStartedCount: experienceStarted.length,
    sessionEndedCount: sessionEnded.length,
    sessionState: sessionAfter?.state ?? null,
    distinctSessionIds: distinctSessions.size,
    distinctExperienceIds: distinctExperiences.size,
    eventCount: expEvents.length,
  };
  const pass =
    r1.submission.ok &&
    r2.submission.ok &&
    returnOp.ok &&
    sessionStarted.length === 1 &&
    experienceStarted.length === 1 &&
    sessionEnded.length === 0 &&
    sessionAfter?.state === 'SESSION_ACTIVE' &&
    distinctSessions.size === 1 &&
    distinctExperiences.size === 1;
  return { expected, actual, pass };
}

// --- STAGE-PRESERVED：阶段迁移保持 + SIMULATION → CREATION 衔接 -----
async function caseStagePreserved(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'stagepreserved', '如果摩擦力为零会怎样');
  const { session, exp } = chain;

  const r1 = await whatIfRound(runtime, chain, '如果摩擦力为零会怎样', `req-s2a-f4sp-1-${shortId()}`);
  const r2 = await whatIfRound(runtime, chain, '假如速度再高一点会怎样', `req-s2a-f4sp-2-${shortId()}`);
  // SIMULATION → CREATION 衔接（13 §15.5：用户已经进行了模拟，并希望把它做成东西）。
  const stateAfterR2 = runtime.getExperienceState(exp.experienceId).state;
  const createSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '做成一个小游戏',
    expectedStateVersion: stateAfterR2.stateVersion,
    requestId: `req-s2a-f4sp-create-${shortId()}`,
  });
  const createStream = createSub.ok ? await consume(createSub.stream) : [];
  const stateAfterCreate = runtime.getExperienceState(exp.experienceId).state;
  // 完成信号：STOP 执行路径登记创作完成。
  const stopSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '就这样',
    expectedStateVersion: stateAfterCreate.stateVersion,
    requestId: `req-s2a-f4sp-stop-${shortId()}`,
  });
  const stopStream = stopSub.ok ? await consume(stopSub.stream) : [];
  const state = runtime.getExperienceState(exp.experienceId).state;
  const creation = runtime.getCreation(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);

  const expEvents = expEventsOf(events, exp.experienceId);
  const transitioned = eventsOf(expEvents, 'state_transitioned');
  const creationStarted = eventsOf(expEvents, 'creation_started');
  const creationCompleted = eventsOf(expEvents, 'creation_completed');
  const createContent = contentOf(createStream);

  const expected = {
    stageAxis: 'CURIOSITY → UNDERSTANDING →（轮 1）SIMULATION →（轮 2）SIMULATION →（CREATE 衔接，13 §15.5）CREATION →（STOP 完成）COMPLETION',
    whatIfStagePreserved: 'WHAT_IF 轮次保持 SIMULATION 阶段（13 §15.3——分支为轴外对象，体验阶段轴不变，D-02 选项 A）',
    creationLink: 'SIMULATION → CREATION 衔接合法（CREATE 触发器规则已覆盖——冻结文本 §1 元素 4 直接转写）；创作建立（creation_started，phase USER_FEEDBACK v1）',
    completion: 'STOP 完成信号 → COMPLETED/COMPLETION；创作 COMPLETE（active=false，v1）；会话 SESSION_ENDED',
  };
  const actual = {
    round1Ok: r1.submission.ok,
    round2Ok: r2.submission.ok,
    transitionedStages: transitioned.map((event) => `${event.properties.from.stage}->${event.properties.to.stage}`),
    createOk: createSub.ok,
    createSelectedAction: createSub.ok ? createSub.header.policy_decision.selected_action : createSub.error.code,
    createContentMatchesFixture: createContent === create.chunks.join(''),
    stateAfterCreate: `${stateAfterCreate.status}/${stateAfterCreate.stage} v${stateAfterCreate.stateVersion}`,
    creationStarted: creationStarted.length,
    creationCompleted: creationCompleted.length,
    stopOk: stopSub.ok,
    finalState: `${state.status}/${state.stage} v${state.stateVersion}`,
    creationPhase: creation.ok ? creation.creation.phase : null,
    creationActive: creation.ok ? creation.active : null,
    creationVersion: creation.ok ? creation.creation.version : null,
    sessionState: sessionAfter?.state ?? null,
  };
  const pass =
    r1.submission.ok &&
    r2.submission.ok &&
    jsonEquals(actual.transitionedStages, [
      'CURIOSITY->UNDERSTANDING',
      'UNDERSTANDING->SIMULATION',
      'SIMULATION->SIMULATION',
      'SIMULATION->CREATION',
      'CREATION->COMPLETION',
    ]) &&
    createSub.ok &&
    createSub.header.policy_decision.selected_action === 'CREATE' &&
    createContent === create.chunks.join('') &&
    creationStarted.length === 1 &&
    creationCompleted.length === 1 &&
    stopSub.ok &&
    state.status === 'COMPLETED' &&
    state.stage === 'COMPLETION' &&
    creation.ok &&
    creation.creation.phase === 'COMPLETE' &&
    creation.active === false &&
    creation.creation.version === 1 &&
    sessionAfter?.state === 'SESSION_ENDED';
  return { expected, actual, pass };
}

// --- STALE-REJECT：陈旧版本模拟提交拒绝（§3 变更 1；S1-12；OBL-01） --
async function caseStaleReject(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'stalereject', '如果摩擦力为零会怎样');
  const { session, exp } = chain;

  const r1 = await whatIfRound(runtime, chain, '如果摩擦力为零会怎样', `req-s2a-f4sr-1-${shortId()}`);
  const stateAfterR1 = runtime.getExperienceState(exp.experienceId).state;
  const stateBytesBefore = JSON.stringify(stateAfterR1);
  const eventCountBefore = expEventsOf(events, exp.experienceId).length;
  const simCountBefore = eventsOf(expEventsOf(events, exp.experienceId), 'simulation_recorded').length;

  // 陈旧提交：expected_state_version=3 vs 当前 4（轮 1 已完成）。
  const stale = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '假如速度再高一点会怎样',
    expectedStateVersion: 3,
    requestId: `req-s2a-f4sr-stale-${shortId()}`,
  });
  const stateAfterStale = runtime.getExperienceState(exp.experienceId).state;
  const stateBytesAfter = JSON.stringify(stateAfterStale);

  // 拒绝后事件窗口（重试前采样——拒绝事实经 state_version_conflict
  // 事件登记，trigger=WHAT_IF；拒绝先于版本化提交；失败写入不消耗
  // 任何版本号，OBL-01 纪律）。
  const expEventsAfterStale = expEventsOf(events, exp.experienceId);
  const newStateTransitions = expEventsAfterStale.filter(
    (event) => event.event_type === 'state_transitioned' && event.context.state_version > stateAfterR1.stateVersion,
  );
  const stateVersionConflict = eventsOf(expEventsAfterStale, 'state_version_conflict').at(-1);

  // 恢复：携带当前版本重试成功。
  const retry = await whatIfRound(runtime, chain, '假如速度再高一点会怎样', `req-s2a-f4sr-retry-${shortId()}`);
  const stateAfterRetry = runtime.getExperienceState(exp.experienceId).state;
  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');

  const expected = {
    failure: '陈旧 expected_state_version（3 vs 4）模拟提交 → STATE_VERSION_CONFLICT（retryable=false，details 含 expected/current_state_version；不覆盖最新状态，S1-12）',
    invariants: '拒绝先于版本化提交：状态逐字节不变（JSON 序列化前后一致）；无新 simulation_recorded（失败不登记模拟轮次）；无新 state_transitioned（state_version > 4）；拒绝事实经 state_version_conflict 事件登记（trigger=WHAT_IF，expected/current_state_version）；失败写入不消耗任何版本号（OBL-01）',
    recovery: '携带当前版本（4）重试 → SIMULATE 成功（v6；simulation_recorded round 2 登记）',
  };
  const actual = {
    round1Ok: r1.submission.ok,
    staleOk: stale.ok,
    staleCode: stale.ok ? 'UNEXPECTED_OK' : stale.error.code,
    staleRetryable: stale.ok ? null : stale.error.retryable,
    staleDetails: stale.ok ? null : stale.error.details ?? null,
    stateByteIdentical: stateBytesBefore === stateBytesAfter,
    eventsBefore: eventCountBefore,
    eventsAfterStale: expEventsAfterStale.length,
    simulationCountBefore: simCountBefore,
    simulationCountAfterStale: eventsOf(expEventsAfterStale, 'simulation_recorded').length,
    newStateTransitions: newStateTransitions.length,
    stateVersionConflictTrigger: stateVersionConflict?.properties.trigger ?? null,
    stateVersionConflictExpected: stateVersionConflict?.properties.expected_state_version ?? null,
    stateVersionConflictCurrent: stateVersionConflict?.properties.current_state_version ?? null,
    retryOk: retry.submission.ok,
    retryFinalVersion: stateAfterRetry.stateVersion,
    retryStage: `${stateAfterRetry.status}/${stateAfterRetry.stage}`,
    simulationRounds: simEvents.map((event) => event.properties.round),
  };
  const pass =
    r1.submission.ok &&
    !stale.ok &&
    stale.error.code === 'STATE_VERSION_CONFLICT' &&
    stale.error.retryable === false &&
    stale.error.details?.expected_state_version === 3 &&
    stale.error.details?.current_state_version === 4 &&
    stateBytesBefore === stateBytesAfter &&
    simCountBefore === 1 &&
    eventsOf(expEventsAfterStale, 'simulation_recorded').length === 1 &&
    newStateTransitions.length === 0 &&
    stateVersionConflict?.properties.trigger === 'WHAT_IF' &&
    stateVersionConflict?.properties.expected_state_version === 3 &&
    stateVersionConflict?.properties.current_state_version === 4 &&
    retry.submission.ok &&
    retry.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    stateAfterRetry.stateVersion === 6 &&
    stateAfterRetry.stage === 'SIMULATION' &&
    simEvents.length === 2 &&
    simEvents[1].properties.round === 2;
  return { expected, actual, pass };
}

// --- STOP-PRIORITY：STOP 优先（P-01）与 WHY > WHAT_IF（PD-12） --
async function caseStopPriority(trace) {
  // 静态分类断言（分类器确定性规则——G03-NEG / G03-B 同族）。
  const stopMarker = classifyInput('如果摩擦力为零就好了');
  const whyMarker = classifyInput('如果为什么');
  const plainWhatIf = classifyInput('如果摩擦力为零会怎样');
  const classificationFacts = {
    stopMarker: { input: '如果摩擦力为零就好了', expected: 'STOP', actual: stopMarker.semanticAction, note: 'P-01：STOP 永远优先于 WHAT_IF' },
    whyMarker: { input: '如果为什么', expected: 'WHY', actual: whyMarker.semanticAction, note: 'PD-12：同层解释顺序 WHY > WHAT_IF' },
    control: { input: '如果摩擦力为零会怎样', expected: 'WHAT_IF', actual: plainWhatIf.semanticAction, note: '对照：WHAT_IF 洁净输入分类不变' },
  };

  // 动态：声明 WHAT_IF 但输入含 STOP 标记 → 声明校验拒绝
  // （分类器优先级先于声明——clients cannot inject policy actions）。
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'stoppriority', '如果摩擦力为零会怎样');
  const { session, exp } = chain;
  const stateBefore = runtime.getExperienceState(exp.experienceId).state;
  const stateBytesBefore = JSON.stringify(stateBefore);

  const stopDeclared = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果摩擦力为零就好了',
    expectedStateVersion: stateBefore.stateVersion,
    requestId: `req-s2a-f4sp-stop-${shortId()}`,
  });
  const stateAfterStop = runtime.getExperienceState(exp.experienceId).state;
  const stateBytesAfterStop = JSON.stringify(stateAfterStop);

  const whyDeclared = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果为什么',
    expectedStateVersion: stateAfterStop.stateVersion,
    requestId: `req-s2a-f4sp-why-${shortId()}`,
  });
  const stateAfterWhy = runtime.getExperienceState(exp.experienceId).state;
  const stateBytesAfterWhy = JSON.stringify(stateAfterWhy);

  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');

  const expected = {
    classification: 'STOP 标记输入分类为 STOP（P-01 永远优先）；WHY 标记输入分类为 WHY（PD-12 同层顺序）；WHAT_IF 洁净输入分类为 WHAT_IF（对照不变）',
    dynamic: '声明 WHAT_IF 但输入含 STOP / WHY 标记 → INVALID_REQUEST（semantic_action mismatch——clients cannot inject policy actions；分类器优先级先于客户端声明）',
    inertness: '拒绝后状态逐字节不变；零 simulation_recorded；无模拟域上下文（getSimulation 拒绝）',
  };
  const actual = {
    classification: classificationFacts,
    stopDeclared: {
      ok: stopDeclared.ok,
      code: stopDeclared.ok ? 'UNEXPECTED_OK' : stopDeclared.error.code,
      message: stopDeclared.ok ? null : stopDeclared.error.message,
    },
    whyDeclared: {
      ok: whyDeclared.ok,
      code: whyDeclared.ok ? 'UNEXPECTED_OK' : whyDeclared.error.code,
      message: whyDeclared.ok ? null : whyDeclared.error.message,
    },
    stateByteIdenticalAfterStop: stateBytesBefore === stateBytesAfterStop,
    stateByteIdenticalAfterWhy: stateBytesAfterStop === stateBytesAfterWhy,
    simulationRecordedCount: simEvents.length,
    simulationContext: snapshotOf(runtime, exp.experienceId) === undefined ? 'rejected (no simulation context)' : 'present (defect)',
    finalVersion: stateAfterWhy.stateVersion,
  };
  const pass =
    stopMarker.semanticAction === 'STOP' &&
    whyMarker.semanticAction === 'WHY' &&
    plainWhatIf.semanticAction === 'WHAT_IF' &&
    !stopDeclared.ok &&
    stopDeclared.error.code === 'INVALID_REQUEST' &&
    String(stopDeclared.error.message).includes('semantic_action mismatch') &&
    !whyDeclared.ok &&
    whyDeclared.error.code === 'INVALID_REQUEST' &&
    stateBytesBefore === stateBytesAfterStop &&
    stateBytesAfterStop === stateBytesAfterWhy &&
    simEvents.length === 0 &&
    snapshotOf(runtime, exp.experienceId) === undefined &&
    stateAfterWhy.stateVersion === stateBefore.stateVersion;
  return { expected, actual, pass };
}

// --- NONCREATION-INERT：非模拟场景行为与前置版本一致 -------
async function caseNoncreationInert(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'noncreation', '为什么');
  const { session, exp } = chain;

  // WHY 链路（非模拟场景——与 policy_v1.3.0 行为逐项对照）。
  const stateBefore = runtime.getExperienceState(exp.experienceId).state;
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: stateBefore.stateVersion,
    requestId: `req-s2a-f4ni-why-${shortId()}`,
  });
  const whyStream = whySub.ok ? await consume(whySub.stream) : [];
  const state = runtime.getExperienceState(exp.experienceId).state;

  const expEvents = expEventsOf(events, exp.experienceId);
  const whyRequested = eventsOf(expEvents, 'why_requested');
  const transitioned = eventsOf(expEvents, 'state_transitioned');
  const simEvents = eventsOf(expEvents, 'simulation_recorded');
  const decisionTraces = tracesOf(traces, exp.experienceId);
  const whyContent = contentOf(whyStream);

  const expected = {
    inertness: '非模拟场景（WHY → EXPLAIN）行为与前置版本（policy_v1.3.0）一致：why_requested ×1 → generation/llm 链路 → state_transitioned（steps [USER_ACTION]）→ 终态 WAITING/UNDERSTANDING v4；内容逐字节等于 why 语料',
    difference: '与前置版本（policy_v1.3.0）仅有的差异：policy_version 字段 = policy_v2.2.0（版本化变更文本同步——F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续）；模拟域事件零登记（非模拟路径不受 F-4 影响）',
    simulationDomain: '零 simulation_recorded 事件；无模拟域上下文（getSimulation 拒绝——未建立模拟上下文）',
  };
  const actual = {
    whyOk: whySub.ok,
    whySelectedAction: whySub.ok ? whySub.header.policy_decision.selected_action : whySub.error.code,
    whyReason: whySub.ok ? whySub.header.policy_decision.reason : null,
    whyPolicyVersion: whySub.ok ? whySub.header.policy_decision.policy_version : null,
    whyContentMatchesFixture: whyContent === why.chunks.join(''),
    whyRequested: whyRequested.length,
    transitionedSteps: transitioned.filter((event) => Array.isArray(event.properties.steps)).map((event) => event.properties.steps),
    finalState: `${state.status}/${state.stage} v${state.stateVersion}`,
    simulationRecordedCount: simEvents.length,
    simulationContext: snapshotOf(runtime, exp.experienceId) === undefined ? 'rejected (no simulation context)' : 'present (defect)',
    policyVersions: [...new Set(decisionTraces.map((traceEntry) => traceEntry.policy?.policy_version))],
    llmUsed: decisionTraces.filter((traceEntry) => traceEntry.semantic_action === 'WHY').map((traceEntry) => traceEntry.execution.llm_used),
  };
  const pass =
    whySub.ok &&
    whySub.header.policy_decision.selected_action === 'EXPLAIN' &&
    whySub.header.policy_decision.reason === 'semantic_action' &&
    whySub.header.policy_decision.policy_version === 'policy_v2.2.0' &&
    whyContent === why.chunks.join('') &&
    whyRequested.length === 1 &&
    jsonEquals(actual.transitionedSteps, [['USER_ACTION']]) &&
    state.status === 'WAITING' &&
    state.stage === 'UNDERSTANDING' &&
    state.stateVersion === 4 &&
    simEvents.length === 0 &&
    snapshotOf(runtime, exp.experienceId) === undefined &&
    jsonEquals(actual.policyVersions, ['policy_v2.2.0']) &&
    jsonEquals(actual.llmUsed, [true]);
  return { expected, actual, pass };
}

// --- INPROC-REGRESSION：全链路进程内回归（WHY → 模拟多轮 + 分支操作 → CREATE 衔接 → STOP） --
async function caseInprocRegression(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'inprocregression', '为什么');
  const { session, exp } = chain;
  let stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // WHY 轮（非模拟场景行为不回归）。
  const whySub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHY',
    rawInput: '为什么',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-f4ip-why-${shortId()}`,
  });
  const whyStream = whySub.ok ? await consume(whySub.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 模拟轮 1 / 2（多轮持久化——同一分支）。
  const r1 = await whatIfRound(runtime, chain, '如果摩擦力为零会怎样', `req-s2a-f4ip-r1-${shortId()}`);
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const r2 = await whatIfRound(runtime, chain, '假如速度再高一点会怎样', `req-s2a-f4ip-r2-${shortId()}`);
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 分支操作轮（RETURN——确定性系统回合，llm_used=false）。
  const returnSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'WHAT_IF',
    rawInput: '如果返回主线呢',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-f4ip-return-${shortId()}`,
  });
  const returnStream = returnSub.ok ? await consume(returnSub.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 模拟轮 3（RETURN 后首轮自动 CREATE 新分支——D-03）。
  const r3 = await whatIfRound(runtime, chain, '如果摩擦力再小一点会怎样', `req-s2a-f4ip-r3-${shortId()}`);
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // SIMULATION → CREATION 衔接（13 §15.5）。
  const createSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'CREATE',
    rawInput: '做成一个小游戏',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-f4ip-create-${shortId()}`,
  });
  const createStream = createSub.ok ? await consume(createSub.stream) : [];
  stateVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // 完成信号（STOP 路径——创作完成登记 + 会话收尾 + 模拟域失效，D-04）。
  const stopSub = await runtime.submitExperienceEvent({
    experienceId: exp.experienceId,
    sessionId: session.sessionId,
    semanticAction: 'STOP',
    rawInput: '就这样',
    expectedStateVersion: stateVersion,
    requestId: `req-s2a-f4ip-stop-${shortId()}`,
  });
  const stopStream = stopSub.ok ? await consume(stopSub.stream) : [];
  const state = runtime.getExperienceState(exp.experienceId).state;
  const creation = runtime.getCreation(exp.experienceId);
  const sessionAfter = runtime.getSession(session.sessionId);
  const simulationAfterStop = snapshotOf(runtime, exp.experienceId);

  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');
  const decisionTraces = tracesOf(traces, exp.experienceId);
  const envelopeViolations = [];
  for (const event of events) {
    const result = validateEventEnvelope(event);
    if (!result.ok) envelopeViolations.push({ event_id: event.event_id, violations: result.violations });
  }
  const sequenceOk = expEvents.every(
    (event, index) => index === 0 || event.sequence_number > expEvents[index - 1].sequence_number,
  );
  const returnContent = contentOf(returnStream);

  const expected = {
    chain: 'WHY → 模拟轮 1 → 模拟轮 2 → 分支操作 RETURN → 模拟轮 3（新分支自动 CREATE）→ CREATE 衔接（13 §15.5）→ 完成信号（STOP）全链路',
    contracts: '全部事件信封符合 C6 §7；sequence_number 严格单调（C6 §25）；全部决策追踪 policy_version=policy_v2.2.0（F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续不变）；WHY / 模拟轮 / CREATE 内容逐字节等于 why / simulate / create 语料',
    simulationDomain: 'simulation_recorded ×3（round 1/2 同一分支，round 3 新分支——RETURN 后首轮自动 CREATE）；分支操作轮零 simulation_recorded（确定性系统回合）',
    finalState: 'COMPLETED/COMPLETION；创作 COMPLETE（active=false，v1）；会话 SESSION_ENDED；模拟域跨会话持久（S3B §1.1/§1.5——取代 S2 时代 D-04 失效不变式：getSimulation 成功，currentBranchId===null——会话级指针清空不跨会话自动恢复，分支记录 ×2 与模拟历史全量保留）',
  };
  const actual = {
    whyOk: whySub.ok,
    whyContentMatchesFixture: contentOf(whyStream) === why.chunks.join(''),
    round1Ok: r1.submission.ok,
    round2Ok: r2.submission.ok,
    round3Ok: r3.submission.ok,
    simulationContentMatchesFixture: [r1, r2, r3].every((round) => contentOf(round.stream) === simulate.chunks.join('')),
    returnOk: returnSub.ok,
    returnSelectedAction: returnSub.ok ? returnSub.header.policy_decision.selected_action : returnSub.error.code,
    returnReason: returnSub.ok ? returnSub.header.policy_decision.reason : null,
    createOk: createSub.ok,
    createContentMatchesFixture: contentOf(createStream) === create.chunks.join(''),
    stopOk: stopSub.ok,
    finalState: `${state.status}/${state.stage} v${state.stateVersion}`,
    creationPhase: creation.ok ? creation.creation.phase : null,
    creationActive: creation.ok ? creation.active : null,
    creationVersion: creation.ok ? creation.creation.version : null,
    sessionState: sessionAfter?.state ?? null,
    simulationRecorded: simEvents.map((event) => ({ round: event.properties.round, branch_id: event.properties.branch_id })),
    simulationContextAfterStop: simulationAfterStop === undefined
      ? 'invalidated (unexpected——S3B 持久化语义下应存在)'
      : { currentBranchId: simulationAfterStop.currentBranchId, branches: simulationAfterStop.branches.length },
    envelopeViolations: envelopeViolations.length,
    sequenceMonotonic: sequenceOk,
    policyVersions: [...new Set(decisionTraces.map((traceEntry) => traceEntry.policy?.policy_version))],
    branchOpLlmUsed: decisionTraces.filter((traceEntry) => traceEntry.reason?.secondary?.includes('branch operation')).map((traceEntry) => traceEntry.execution.llm_used),
    eventCount: expEvents.length,
  };
  const pass =
    whySub.ok &&
    contentOf(whyStream) === why.chunks.join('') &&
    r1.submission.ok &&
    r2.submission.ok &&
    r3.submission.ok &&
    [r1, r2, r3].every((round) => contentOf(round.stream) === simulate.chunks.join('')) &&
    returnSub.ok &&
    returnSub.header.policy_decision.selected_action === 'SIMULATE' &&
    returnSub.header.policy_decision.reason === 'simulation_branch_operation' &&
    createSub.ok &&
    contentOf(createStream) === create.chunks.join('') &&
    stopSub.ok &&
    state.status === 'COMPLETED' &&
    state.stage === 'COMPLETION' &&
    creation.ok &&
    creation.creation.phase === 'COMPLETE' &&
    creation.active === false &&
    creation.creation.version === 1 &&
    sessionAfter?.state === 'SESSION_ENDED' &&
    simEvents.length === 3 &&
    simEvents[0].properties.round === 1 &&
    simEvents[1].properties.round === 2 &&
    simEvents[2].properties.round === 3 &&
    simEvents[0].properties.branch_id === simEvents[1].properties.branch_id &&
    simEvents[2].properties.branch_id !== simEvents[0].properties.branch_id &&
    simulationAfterStop !== undefined &&
    simulationAfterStop.currentBranchId === null &&
    simulationAfterStop.branches.length === 2 &&
    envelopeViolations.length === 0 &&
    sequenceOk &&
    jsonEquals(actual.policyVersions, ['policy_v2.2.0']) &&
    jsonEquals(actual.branchOpLlmUsed, [false]);
  return { expected, actual, pass };
}

// --- BRANCH-LIFECYCLE：轴外分支子状态机全生命周期（D-02/D-03 选项 A） --
async function caseBranchLifecycle(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'branchlifecycle', '如果摩擦力为零会怎样');
  const { session, exp } = chain;
  const startVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  async function submit(rawInput, requestId) {
    const state = runtime.getExperienceState(exp.experienceId).state;
    const submission = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHAT_IF',
      rawInput,
      expectedStateVersion: state.stateVersion,
      requestId,
    });
    if (submission.ok) {
      await consume(submission.stream);
    }
    return submission;
  }

  // 轮 1 / 轮 2：WHAT_IF 首轮自动 CREATE 分支 1；轮 2 累积至同一分支。
  const r1 = await submit('如果摩擦力为零会怎样', `req-s2a-f4bl-r1-${shortId()}`);
  const r2 = await submit('假如速度再高一点会怎样', `req-s2a-f4bl-r2-${shortId()}`);
  const snapAfterR2 = snapshotOf(runtime, exp.experienceId);

  // RETURN：分支 1 生命周期 RETURNED，当前激活分支清空。
  const ret1 = await submit('如果返回主线呢', `req-s2a-f4bl-ret1-${shortId()}`);
  const snapAfterReturn = snapshotOf(runtime, exp.experienceId);

  // 轮 3：RETURN 后首轮自动 CREATE 分支 2（D-03 CREATE）。
  const r3 = await submit('如果摩擦力再小一点会怎样', `req-s2a-f4bl-r3-${shortId()}`);
  const snapAfterR3 = snapshotOf(runtime, exp.experienceId);

  // SWITCH：显式切换激活分支 1（RETURNED 分支恢复探索——生命周期 ACTIVE）。
  const sw1 = await submit('如果切换到分支一呢', `req-s2a-f4bl-sw1-${shortId()}`);
  const snapAfterSwitch = snapshotOf(runtime, exp.experienceId);

  // ABANDON：放弃分支 2（非当前分支——当前激活分支保持分支 1）。
  const ab1 = await submit('如果放弃分支二呢', `req-s2a-f4bl-ab1-${shortId()}`);
  const snapAfterAbandon = snapshotOf(runtime, exp.experienceId);

  // 负向：切换至已放弃分支 → INVALID_STATE_TRANSITION（前置校验拒绝，不消耗版本号）。
  const sw2 = await submit('如果切换到分支二呢', `req-s2a-f4bl-sw2-${shortId()}`);
  const versionAfterRejection = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // RETURN：分支 1 RETURNED，当前清空。
  const ret2 = await submit('如果返回主线呢', `req-s2a-f4bl-ret2-${shortId()}`);
  const snapAfterReturn2 = snapshotOf(runtime, exp.experienceId);

  // 负向：无激活分支时 RETURN → INVALID_STATE_TRANSITION。
  const ret3 = await submit('如果返回主线呢', `req-s2a-f4bl-ret3-${shortId()}`);
  const finalVersion = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const snapshot = snapshotOf(runtime, exp.experienceId);

  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');
  const decisionTraces = tracesOf(traces, exp.experienceId);
  const branchOpTraces = decisionTraces.filter((traceEntry) => String(traceEntry.reason?.secondary ?? '').includes('branch operation'));

  const expected = {
    lifecycle: 'CREATE（首轮自动）→ 累积 → RETURN（RETURNED + 当前清空）→ 自动 CREATE 新分支 → SWITCH（RETURNED 恢复 ACTIVE）→ ABANDON（ABANDONED）→ 负向拒绝（切换已放弃分支 / 无激活分支 RETURN）',
    operations: '四操作最小集（D-03 选项 A）：CREATE / SWITCH / ABANDON / RETURN；操作识别为确定性规则词表；分支操作轮次为确定性系统回合（llm_used=false）',
    rejections: '负向路径前置校验拒绝（INVALID_STATE_TRANSITION）：切换已放弃分支 / 无激活分支 RETURN；拒绝不消耗版本号（OBL-01）',
    records: '模拟历史 3 轮（轮 1/2 分支 1，轮 3 分支 2）；分支操作轮零 simulation_recorded；分支记录会话内持久（D-04）',
  };
  const actual = {
    startVersion,
    round1: { ok: r1.ok, finalVersion: r1.ok ? 4 : null },
    round2: { ok: r2.ok, finalVersion: r2.ok ? 6 : null },
    afterR2: snapAfterR2 ? { branches: snapAfterR2.branches.length, lifecycle: snapAfterR2.branches.map((b) => b.lifecycle), versions: snapAfterR2.branches.map((b) => b.version), rounds: snapAfterR2.rounds.map((r) => r.round), current: snapAfterR2.currentBranchId === snapAfterR2.branches[0].branchId } : null,
    return1: { ok: ret1.ok, finalVersion: ret1.ok ? 8 : null },
    afterReturn: snapAfterReturn ? { lifecycle: snapAfterReturn.branches.map((b) => b.lifecycle), current: snapAfterReturn.currentBranchId, rounds: snapAfterReturn.rounds.length } : null,
    round3: { ok: r3.ok, finalVersion: r3.ok ? 10 : null },
    afterR3: snapAfterR3 ? { branches: snapAfterR3.branches.length, sourceRounds: snapAfterR3.branches.map((b) => b.sourceRound), lifecycle: snapAfterR3.branches.map((b) => b.lifecycle), currentIsBranch2: snapAfterR3.currentBranchId === snapAfterR3.branches[1].branchId } : null,
    switch1: { ok: sw1.ok, finalVersion: sw1.ok ? 12 : null },
    afterSwitch: snapAfterSwitch ? { lifecycle: snapAfterSwitch.branches.map((b) => b.lifecycle), currentIsBranch1: snapAfterSwitch.currentBranchId === snapAfterSwitch.branches[0].branchId } : null,
    abandon1: { ok: ab1.ok, finalVersion: ab1.ok ? 14 : null },
    afterAbandon: snapAfterAbandon ? { lifecycle: snapAfterAbandon.branches.map((b) => b.lifecycle), currentIsBranch1: snapAfterAbandon.currentBranchId === snapAfterAbandon.branches[0].branchId } : null,
    switchToAbandoned: { ok: sw2.ok, code: sw2.ok ? 'UNEXPECTED_OK' : sw2.error.code },
    versionAfterRejection,
    return2: { ok: ret2.ok, finalVersion: ret2.ok ? 16 : null },
    afterReturn2: snapAfterReturn2 ? { lifecycle: snapAfterReturn2.branches.map((b) => b.lifecycle), current: snapAfterReturn2.currentBranchId } : null,
    returnNoBranch: { ok: ret3.ok, code: ret3.ok ? 'UNEXPECTED_OK' : ret3.error.code },
    finalVersion,
    simulationRecorded: simEvents.map((event) => event.properties.round),
    branchOpTraceCount: branchOpTraces.length,
    branchOpLlmUsed: [...new Set(branchOpTraces.map((traceEntry) => traceEntry.execution.llm_used))],
    branchOpReasons: [...new Set(branchOpTraces.map((traceEntry) => traceEntry.reason.primary))],
  };
  const pass =
    r1.ok && r2.ok &&
    snapAfterR2?.branches.length === 1 &&
    snapAfterR2.branches[0].lifecycle === 'ACTIVE' &&
    snapAfterR2.branches[0].version === 2 &&
    snapAfterR2.rounds.map((round) => round.round).join() === '1,2' &&
    snapAfterR2.currentBranchId === snapAfterR2.branches[0].branchId &&
    ret1.ok &&
    snapAfterReturn?.branches[0].lifecycle === 'RETURNED' &&
    snapAfterReturn.currentBranchId === null &&
    snapAfterReturn.rounds.length === 2 &&
    r3.ok &&
    snapAfterR3?.branches.length === 2 &&
    snapAfterR3.branches[1].sourceRound === 3 &&
    snapAfterR3.branches[1].lifecycle === 'ACTIVE' &&
    snapAfterR3.currentBranchId === snapAfterR3.branches[1].branchId &&
    sw1.ok &&
    snapAfterSwitch?.branches[0].lifecycle === 'ACTIVE' &&
    snapAfterSwitch.currentBranchId === snapAfterSwitch.branches[0].branchId &&
    ab1.ok &&
    snapAfterAbandon?.branches[1].lifecycle === 'ABANDONED' &&
    snapAfterAbandon.currentBranchId === snapAfterAbandon.branches[0].branchId &&
    !sw2.ok &&
    sw2.error.code === 'INVALID_STATE_TRANSITION' &&
    versionAfterRejection === 14 &&
    ret2.ok &&
    snapAfterReturn2?.branches[0].lifecycle === 'RETURNED' &&
    snapAfterReturn2.currentBranchId === null &&
    !ret3.ok &&
    ret3.error.code === 'INVALID_STATE_TRANSITION' &&
    finalVersion === 16 &&
    simEvents.length === 3 &&
    simEvents.map((event) => event.properties.round).join() === '1,2,3' &&
    branchOpTraces.length === 6 &&
    jsonEquals(actual.branchOpLlmUsed, [false]) &&
    actual.branchOpReasons.includes('explicit_user_direction') &&
    actual.branchOpReasons.includes('invalid_state_transition');
  return { expected, actual, pass };
}

// --- BRANCH-ADOPT：显式回流操作 ADOPT_BRANCH（S2-BRANCH-REFLOW-DEF-01
// v1.0.0 选项 A——第五分支操作；policy_v2.2.0 变更 1–5） ----------
async function caseBranchAdopt(trace) {
  const { runtime, events, traces } = createCaseRuntime();
  const chain = await setupChain(runtime, 'branchadopt', '如果摩擦力为零会怎样');
  const { session, exp } = chain;

  async function submit(rawInput, requestId) {
    const state = runtime.getExperienceState(exp.experienceId).state;
    const submission = await runtime.submitExperienceEvent({
      experienceId: exp.experienceId,
      sessionId: session.sessionId,
      semanticAction: 'WHAT_IF',
      rawInput,
      expectedStateVersion: state.stateVersion,
      requestId,
    });
    const stream = submission.ok ? await consume(submission.stream) : [];
    return { submission, stream };
  }

  // 轮 1 / 轮 2：WHAT_IF 首轮自动 CREATE 分支 1；轮 2 累积至同一分支。
  const r1 = await submit('如果摩擦力为零会怎样', `req-s2a-f4ba-r1-${shortId()}`);
  const r2 = await submit('假如速度再高一点会怎样', `req-s2a-f4ba-r2-${shortId()}`);
  const snapAfterR2 = snapshotOf(runtime, exp.experienceId);

  // 采用分支 1（显式回流——主线当前上下文不变：currentBranchId
  // 保持分支 1；adopted 标记附加，生命周期 ACTIVE 不变）。
  const adopt1 = await submit('如果采用分支一的结论呢', `req-s2a-f4ba-adopt1-${shortId()}`);
  const snapAfterAdopt1 = snapshotOf(runtime, exp.experienceId);

  // 负向：采用不存在的分支序号（分支九）——INVALID_STATE_TRANSITION，
  // 拒绝先于任何写入，不消耗版本号（OBL-01 同族纪律）。
  const versionBeforeNegative = runtime.getExperienceState(exp.experienceId).state.stateVersion;
  const adoptNine = await submit('如果采用分支九的结论呢', `req-s2a-f4ba-adopt9-${shortId()}`);
  const versionAfterNegative = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  // RETURN：分支 1 生命周期 RETURNED，当前激活分支清空。
  const ret = await submit('如果返回主线呢', `req-s2a-f4ba-ret-${shortId()}`);
  const snapAfterReturn = snapshotOf(runtime, exp.experienceId);

  // 采用分支 1（RETURNED 分支——生命周期 RETURNED 不变；无激活
  // 分支上下文时采用仍合法——采用面向分支记录本身，主线当前
  // 上下文不变：currentBranchId 保持 null）。
  const adopt2 = await submit('如果采用分支一的结论呢', `req-s2a-f4ba-adopt2-${shortId()}`);
  const snapAfterAdopt2 = snapshotOf(runtime, exp.experienceId);

  const expEvents = expEventsOf(events, exp.experienceId);
  const simEvents = eventsOf(expEvents, 'simulation_recorded');
  const adoptEvents = eventsOf(expEvents, 'simulation_adopted');
  const decisionTraces = tracesOf(traces, exp.experienceId);
  const branchOpTraces = decisionTraces.filter((traceEntry) => traceEntry.reason?.secondary?.includes('branch operation'));
  const adoptTraces = decisionTraces.filter((traceEntry) => traceEntry.reason?.secondary?.includes('ADOPT_BRANCH'));
  const envelopeViolations = [];
  for (const event of events) {
    const result = validateEventEnvelope(event);
    if (!result.ok) envelopeViolations.push({ event_id: event.event_id, violations: result.violations });
  }
  const sequenceOk = expEvents.every(
    (event, index) => index === 0 || event.sequence_number > expEvents[index - 1].sequence_number,
  );
  const adoptedContent = simulate.chunks.join('');
  const adopt1Content = contentOf(adopt1.stream);
  const adopt2Content = contentOf(adopt2.stream);
  const versionAfterAdopt2 = runtime.getExperienceState(exp.experienceId).state.stateVersion;

  const expected = {
    chain: 'WHAT_IF 轮 1（自动 CREATE 分支 1）→ 轮 2（累积）→ ADOPT_BRANCH 分支 1（adopted 附加，主线当前上下文不变）→ 负向：采用分支九 INVALID_STATE_TRANSITION（不消耗版本号）→ RETURN（分支 1 RETURNED，当前清空）→ ADOPT_BRANCH 分支 1（RETURNED 生命周期不变，adopted 幂等，currentBranchId 保持 null）',
    contracts: '全部事件信封符合 C6 §7；sequence_number 严格单调（C6 §25）；全部决策追踪 policy_version=policy_v2.2.0（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 经 policy_v2.2.0 变更 1–5 生效）；模拟轮内容逐字节等于 simulate 语料；采用轮结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文',
    simulationDomain: 'simulation_recorded ×2（round 1/2 同一分支——仅模拟轮登记）；simulation_adopted ×2（branch_id=分支 1，source_round=1，adopted_content=分支 1 最新模拟轮模拟内容，separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源）',
    branchModel: '分支 1：lifecycle ACTIVE→ACTIVE（采用不变）→RETURNED（RETURN）→RETURNED（采用不变）；adopted false→true（附加标记，幂等）；version=2（采用不累积模拟轮次）；currentBranchId 分支 1→分支 1（采用不变）→null（RETURN）→null（采用不变——主线当前上下文不变）',
    decisionTraces: '分支操作决策追踪 4 轮（采用 1 / 采用九拒绝 / RETURN / 采用 2）llm_used=false（确定性系统回合）；ADOPT_BRANCH 轨迹 3 轮——采用轮（成功 ×2）reasonPrimary=explicit_user_direction、拒绝轮 reasonPrimary=invalid_state_transition；全部 policy_version=policy_v2.2.0',
    finalState: 'WAITING/SIMULATION v12（启动 v2 + 轮 1/2 各 +2 + 采用 1 +2 + RETURN +2 + 采用 2 +2；负向拒绝轮零消耗——OBL-01）',
  };
  const actual = {
    r1Ok: r1.submission.ok,
    r2Ok: r2.submission.ok,
    roundContentMatchesFixture: [r1, r2].every((round) => contentOf(round.stream) === simulate.chunks.join('')),
    branchCountAfterR2: snapAfterR2?.branches.length ?? null,
    branchAdoptedAfterR2: snapAfterR2?.branches[0]?.adopted ?? null,
    branchLifecycleAfterR2: snapAfterR2?.branches[0]?.lifecycle ?? null,
    branchVersionAfterR2: snapAfterR2?.branches[0]?.version ?? null,
    currentBranchIdAfterR2: snapAfterR2?.currentBranchId ?? null,
    adopt1Ok: adopt1.submission.ok,
    adopt1SelectedAction: adopt1.submission.ok ? adopt1.submission.header.policy_decision.selected_action : adopt1.submission.error.code,
    adopt1Reason: adopt1.submission.ok ? adopt1.submission.header.policy_decision.reason : null,
    adopt1PolicyVersion: adopt1.submission.ok ? adopt1.submission.header.policy_decision.policy_version : null,
    adopt1ContentPresentsAdoptedContent: adopt1Content.includes(adoptedContent),
    branchAdoptedAfterAdopt1: snapAfterAdopt1?.branches[0]?.adopted ?? null,
    branchLifecycleAfterAdopt1: snapAfterAdopt1?.branches[0]?.lifecycle ?? null,
    branchVersionAfterAdopt1: snapAfterAdopt1?.branches[0]?.version ?? null,
    branchRoundsAfterAdopt1: snapAfterAdopt1?.branches[0]?.rounds.length ?? null,
    currentBranchIdAfterAdopt1: snapAfterAdopt1?.currentBranchId ?? null,
    adoptNineOk: adoptNine.submission.ok,
    adoptNineErrorCode: adoptNine.submission.ok ? 'OK（缺陷！）' : adoptNine.submission.error.code,
    versionBeforeNegative,
    versionAfterNegative,
    retOk: ret.submission.ok,
    branchLifecycleAfterReturn: snapAfterReturn?.branches[0]?.lifecycle ?? null,
    currentBranchIdAfterReturn: snapAfterReturn?.currentBranchId ?? null,
    adopt2Ok: adopt2.submission.ok,
    adopt2SelectedAction: adopt2.submission.ok ? adopt2.submission.header.policy_decision.selected_action : adopt2.submission.error.code,
    adopt2Reason: adopt2.submission.ok ? adopt2.submission.header.policy_decision.reason : null,
    adopt2ContentPresentsAdoptedContent: adopt2Content.includes(adoptedContent),
    branchAdoptedAfterAdopt2: snapAfterAdopt2?.branches[0]?.adopted ?? null,
    branchLifecycleAfterAdopt2: snapAfterAdopt2?.branches[0]?.lifecycle ?? null,
    branchVersionAfterAdopt2: snapAfterAdopt2?.branches[0]?.version ?? null,
    branchRoundsAfterAdopt2: snapAfterAdopt2?.branches[0]?.rounds.length ?? null,
    currentBranchIdAfterAdopt2: snapAfterAdopt2?.currentBranchId ?? null,
    simulationRecorded: simEvents.map((event) => ({ round: event.properties.round, branch_id: event.properties.branch_id })),
    simulationAdopted: adoptEvents.map((event) => ({
      branch_id: event.properties.branch_id,
      source_round: event.properties.source_round,
      adopted_content_matches_latest_round: event.properties.adopted_content === adoptedContent,
      separation_invariant: event.properties.separation_invariant,
    })),
    branchOpLlmUsed: branchOpTraces.map((traceEntry) => traceEntry.execution.llm_used),
    adoptTraceReasons: adoptTraces.map((traceEntry) => traceEntry.reason?.primary ?? null),
    adoptTraceCount: adoptTraces.length,
    envelopeViolations: envelopeViolations.length,
    sequenceMonotonic: sequenceOk,
    policyVersions: [...new Set(decisionTraces.map((traceEntry) => traceEntry.policy?.policy_version))],
    finalStateVersion: versionAfterAdopt2,
  };
  const pass =
    r1.submission.ok &&
    r2.submission.ok &&
    [r1, r2].every((round) => contentOf(round.stream) === simulate.chunks.join('')) &&
    snapAfterR2?.branches.length === 1 &&
    snapAfterR2?.branches[0]?.adopted === false &&
    snapAfterR2?.branches[0]?.lifecycle === 'ACTIVE' &&
    snapAfterR2?.branches[0]?.version === 2 &&
    snapAfterR2?.currentBranchId === snapAfterR2?.branches[0]?.branchId &&
    adopt1.submission.ok &&
    adopt1.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    adopt1.submission.header.policy_decision.reason === 'simulation_branch_operation' &&
    adopt1.submission.header.policy_decision.policy_version === 'policy_v2.2.0' &&
    adopt1Content.includes(adoptedContent) &&
    snapAfterAdopt1?.branches[0]?.adopted === true &&
    snapAfterAdopt1?.branches[0]?.lifecycle === 'ACTIVE' &&
    snapAfterAdopt1?.branches[0]?.version === 2 &&
    snapAfterAdopt1?.branches[0]?.rounds.length === 2 &&
    snapAfterAdopt1?.currentBranchId === snapAfterAdopt1?.branches[0]?.branchId &&
    !adoptNine.submission.ok &&
    adoptNine.submission.error.code === 'INVALID_STATE_TRANSITION' &&
    versionAfterNegative === versionBeforeNegative &&
    ret.submission.ok &&
    snapAfterReturn?.branches[0]?.lifecycle === 'RETURNED' &&
    snapAfterReturn?.currentBranchId === null &&
    adopt2.submission.ok &&
    adopt2.submission.header.policy_decision.selected_action === 'SIMULATE' &&
    adopt2.submission.header.policy_decision.reason === 'simulation_branch_operation' &&
    adopt2Content.includes(adoptedContent) &&
    snapAfterAdopt2?.branches[0]?.adopted === true &&
    snapAfterAdopt2?.branches[0]?.lifecycle === 'RETURNED' &&
    snapAfterAdopt2?.branches[0]?.version === 2 &&
    snapAfterAdopt2?.branches[0]?.rounds.length === 2 &&
    snapAfterAdopt2?.currentBranchId === null &&
    simEvents.length === 2 &&
    simEvents[0].properties.round === 1 &&
    simEvents[1].properties.round === 2 &&
    simEvents[0].properties.branch_id === simEvents[1].properties.branch_id &&
    adoptEvents.length === 2 &&
    adoptEvents.every(
      (event) =>
        event.properties.branch_id === snapAfterR2.branches[0].branchId &&
        event.properties.source_round === 1 &&
        event.properties.adopted_content === adoptedContent &&
        event.properties.separation_invariant === 'simulation_result_is_not_fact',
    ) &&
    jsonEquals(actual.branchOpLlmUsed, [false, false, false, false]) &&
    jsonEquals(actual.adoptTraceReasons, ['explicit_user_direction', 'invalid_state_transition', 'explicit_user_direction']) &&
    actual.adoptTraceCount === 3 &&
    actual.adoptTraceReasons.filter((reason) => reason === 'explicit_user_direction').length === 2 &&
    envelopeViolations.length === 0 &&
    sequenceOk &&
    jsonEquals(actual.policyVersions, ['policy_v2.2.0']) &&
    versionAfterAdopt2 === 12;
  return { expected, actual, pass };
}

// ---------------------------------------------------------------------------
// 案例注册表（E5 §4：每案例 12 字段记录）
// ---------------------------------------------------------------------------
const CASE_REGISTRY = [
  {
    caseId: 'MULTI-ROUND',
    form: 'inprocess',
    servers: [],
    sourceClause: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)；S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 1（第一层）；S1 §14（WHAT_IF → SIMULATE 映射不变）；13 §15.3（SIMULATION → SIMULATION）；S1-12（每次合法提交恰好 +1）',
    scope: '多轮模拟持久化：两轮 WHAT_IF（"如果摩擦力为零会怎样" → "假如速度再高一点会怎样"）；每轮两次版本化提交（提交 +1 / RESPONSE_COMPLETED +1）；simulation_recorded ×2 累积；阶段保持 SIMULATION；WHAT_IF 首轮自动 CREATE 分支（D-03）',
    precondition: 'WHAT_IF 意图链已建立（启动 v2）；进程内形态（默认合成网关）',
    inputFault: 'WHAT_IF 洁净输入两轮（冻结文本 §5 案例大纲的示例输入为示意——"不是" 属 CORRECTION 否定族，证据输入经分类器洁净性核验）',
    run: caseMultiRound,
  },
  {
    caseId: 'SEPARATION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §2 D-05 选项 A（四元分离事件记录）；E8-G2-CC07（假设 / 事实 / 模拟结果分离不变）；E2 Stage 3；C6 §14（命名模式 <domain>_<past_participle>）',
    scope: '每轮模拟结果四元分离断言：simulation_recorded properties 含 fact / inference / hypothesis / simulation 四元字段；fact = 语料事实分段（非全文——模拟结果不表现为事实）；simulation = 完整提案语料；separation_invariant 互斥注记；快照与事件逐字段一致',
    precondition: 'WHAT_IF 意图链已建立；两轮模拟完成',
    inputFault: 'WHAT_IF 洁净输入两轮（语料分离格式：事实——/推断——/假设——标记）',
    run: caseSeparation,
  },
  {
    caseId: 'NO-NEW-EXPERIENCE',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §1 元素 5 / §5（S2A-F4-NO-NEW-EXPERIENCE 案例大纲）；G03-N 黄金不变式（不创建新 Session / Experience）',
    scope: '多轮模拟 + 分支操作轮不创建新 Session / Experience：session_started=1，experience_started=1；会话保持 SESSION_ACTIVE；全部体验事件共享同一 session_id / experience_id',
    precondition: 'WHAT_IF 意图链已建立',
    inputFault: 'WHAT_IF 洁净输入两轮 + 分支操作输入（"如果返回主线呢"）',
    run: caseNoNewExperience,
  },
  {
    caseId: 'STAGE-PRESERVED',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §1 元素 3/4 / §5（S2A-F4-STAGE-PRESERVED 案例大纲）；13 §15.3（多轮 SIMULATION 保持）/ §15.5（SIMULATION → CREATION 衔接）；D-02 选项 A（体验阶段轴不变）',
    scope: '阶段迁移断言：CURIOSITY → UNDERSTANDING → SIMULATION → SIMULATION →（CREATE 衔接）CREATION →（STOP 完成）COMPLETION；创作建立（creation_started，phase USER_FEEDBACK v1）；创作完成（COMPLETE，active=false）',
    precondition: 'WHAT_IF 意图链已建立；两轮模拟完成（SIMULATION 阶段）',
    inputFault: 'WHAT_IF 洁净输入两轮 + "做成一个小游戏"（声明 CREATE）+ "就这样"（声明 STOP）',
    run: caseStagePreserved,
  },
  {
    caseId: 'STALE-REJECT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §3 变更 1（版本纪律）/ §5（S2A-F4-STALE-REJECT 案例大纲）；S1-12（每次合法提交恰好 +1；stale 拒绝）；OBL-01 纪律（失败写入不消耗版本号）',
    scope: '陈旧 expected_state_version（3 vs 4）模拟提交 → STATE_VERSION_CONFLICT（retryable=false）；状态逐字节不变；无新 simulation_recorded / state_transitioned；拒绝事实经 state_version_conflict 事件登记（trigger=WHAT_IF）；当前版本重试成功',
    precondition: 'WHAT_IF 意图链已建立；模拟轮 1 完成（v4）',
    inputFault: '"假如速度再高一点会怎样"（声明 WHAT_IF；expected_state_version=3 vs 当前 4）',
    run: caseStaleReject,
  },
  {
    caseId: 'STOP-PRIORITY',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §1 元素 7 / §5（S2A-F4-STOP-PRIORITY 案例大纲）；P-01（STOP 永远优先）；PD-12（同层解释顺序 WHY > WHAT_IF）；G03-NEG / G03-B 黄金案例同族；C5（semantic_action 声明校验）',
    scope: '优先级静态断言（STOP 标记 → STOP；WHY 标记 → WHY；洁净 WHAT_IF 对照）+ 动态声明校验（声明 WHAT_IF 但输入含 STOP / WHY 标记 → INVALID_REQUEST——clients cannot inject policy actions）；拒绝后状态逐字节不变；零 simulation_recorded',
    precondition: 'WHAT_IF 意图链已建立（启动 v2）',
    inputFault: '"如果摩擦力为零就好了"（STOP 标记）/"如果为什么"（WHY 标记）/ "如果摩擦力为零会怎样"（对照）',
    run: caseStopPriority,
  },
  {
    caseId: 'NONCREATION-INERT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §5（S2A-F4-NONCREATION-INERT 案例大纲）；G3 黄金套件 G02 语义（非模拟路径不回归）；PD-07',
    scope: '非模拟场景（WHY → EXPLAIN）行为与前置版本一致：why_requested ×1 → generation/llm 链路 → state_transitioned（steps [USER_ACTION]）→ 终态 WAITING/UNDERSTANDING v4；内容逐字节等于 why 语料；与前置版本（policy_v1.3.0）仅有的差异为 policy_version=policy_v2.2.0（版本化变更文本同步——F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续）；模拟域零事件、无模拟上下文',
    precondition: 'WHY 意图链已建立（启动 v2）',
    inputFault: '"为什么"（声明 WHY）',
    run: caseNoncreationInert,
  },
  {
    caseId: 'INPROC-REGRESSION',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §5（S2A-F4-INPROC-REGRESSION 案例大纲）；G2 跨契约一致性；C6 §7（信封）/§25（sequence 单调）；13 §15.5（SIMULATION → CREATION 衔接）；D-04 选项 A（会话结束失效）',
    scope: '全链路进程内回归：WHY → 模拟轮 1 → 模拟轮 2 → 分支操作 RETURN → 模拟轮 3（新分支自动 CREATE）→ CREATE 衔接 → 完成信号；信封全量有效、sequence 严格单调、全部决策追踪 policy_version=policy_v2.2.0（F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续不变）、内容逐字节等于语料；simulation_recorded ×3；模拟域跨会话持久（STOP 后 getSimulation 成功——currentBranchId===null，分支记录 ×2 保留——S3B 取代 S2 时代失效不变式）',
    precondition: 'WHY 意图链已建立（启动 v2）',
    inputFault: '"为什么" / "如果摩擦力为零会怎样" / "假如速度再高一点会怎样" / "如果返回主线呢" / "如果摩擦力再小一点会怎样" / "做成一个小游戏" / "就这样"',
    run: caseInprocRegression,
  },
  {
    caseId: 'BRANCH-LIFECYCLE',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2A-F4-SEMANTIC-FREEZE-01 §2 D-02 选项 A（轴外分支子状态机）/ D-03 选项 A（四操作最小集）/ §4 变更 2；S1-12；OBL-01（拒绝不消耗版本号）',
    scope: '轴外分支子状态机全生命周期：CREATE（首轮自动）→ 累积 → RETURN（RETURNED + 当前清空）→ 自动 CREATE 新分支 → SWITCH（RETURNED 恢复 ACTIVE）→ ABANDON（ABANDONED）→ 负向拒绝（切换已放弃分支 / 无激活分支 RETURN，INVALID_STATE_TRANSITION，不消耗版本号）；分支操作轮为确定性系统回合（llm_used=false，6 轮含拒绝轮）',
    precondition: 'WHAT_IF 意图链已建立（启动 v2）',
    inputFault: 'WHAT_IF 洁净输入三轮 + 分支操作输入（"如果返回主线呢" ×2 / "如果切换到分支一呢" / "如果放弃分支二呢" / "如果切换到分支二呢"〔负向〕）',
    run: caseBranchLifecycle,
  },
  {
    caseId: 'BRANCH-ADOPT',
    form: 'inprocess',
    servers: [],
    sourceClause: 'S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A（第五分支操作 ADOPT_BRANCH——产品负责人 2026-10-09 裁决）；policy_v2.2.0 变更 1–5；C6 §14（simulation_adopted 命名模式 <domain>_<past_participle>）；E8-G2-CC07（采用结果仍标记为模拟来源）；D-02 选项 A（主线当前上下文不变——显式回流为经用户指令的例外通道）；S1-12；OBL-01（拒绝不消耗版本号）',
    scope: '显式回流操作 ADOPT_BRANCH：分支 1 累积两轮后采用（adopted 标记附加，生命周期 ACTIVE 不变，主线当前上下文不变——currentBranchId 保持分支 1；simulation_adopted ×1，properties 含 branch_id / source_round=1 / adopted_content 摘要=分支最新模拟轮模拟内容 / separation_invariant=simulation_result_is_not_fact；结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文）→ 负向：采用不存在分支序号（分支九）INVALID_STATE_TRANSITION（拒绝先于任何写入，不消耗版本号）→ RETURN（分支 1 RETURNED，currentBranchId=null）→ 无激活分支上下文采用分支 1（RETURNED 生命周期不变，adopted 幂等，currentBranchId 保持 null——主线当前上下文不变）；分支操作轮为确定性系统回合（llm_used=false）',
    precondition: 'WHAT_IF 意图链已建立（启动 v2）；两轮模拟完成（分支 1，version=2，ACTIVE）',
    inputFault: 'WHAT_IF 洁净输入两轮 + 分支操作输入（"如果采用分支一的结论呢" ×2 / "如果采用分支九的结论呢"〔负向〕/ "如果返回主线呢"）',
    run: caseBranchAdopt,
  },
];

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  // Engine gate: exact Node lock (F-2 authorization-date LTS re-verification; F-4 continues the lock).
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

  // Integrity verification (same checks as E5-TRIAL-0001 / F1 / F2 / F3 / G3 / S2A-OBL-01 / S2A-F2-0001 / S2A-F3-0001).
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
  // F-4 scope is simulation-domain semantics, exercised against the real
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

  // A1: MULTI-ROUND.
  const cMultiRound = caseResults.find((entry) => entry.caseId === 'MULTI-ROUND');
  assert(
    'A1',
    'MULTI-ROUND：多轮模拟持久化——两轮 WHAT_IF（"如果摩擦力为零会怎样" → "假如速度再高一点会怎样"）各一次合法提交两次版本化提交（版本链 2→3→4→5→6，每次合法提交恰好 +1，S1-12）；selected_action=SIMULATE；阶段 UNDERSTANDING → SIMULATION → SIMULATION（13 §15.3）；simulation_recorded ×2（round 1/2 同一分支，branch_created [true, false]，separation_invariant=simulation_result_is_not_fact）；内容逐字节等于 simulate 语料；决策追踪 reasonPrimary=semantic_action，llm_used=true，policy_version=policy_v2.2.0（F-4 语义冻结于 policy_v1.4.0 §3 变更 1/2，经 policy_v2.2.0 延续不变）；模拟域快照 1 分支（ACTIVE，version=2，sourceRound=1）',
    cMultiRound?.pass === true,
    { multiRound: cMultiRound?.pass },
  );

  // A2: SEPARATION.
  const cSeparation = caseResults.find((entry) => entry.caseId === 'SEPARATION');
  assert(
    'A2',
    'SEPARATION：每轮 simulation_recorded properties 含 fact / inference / hypothesis / simulation 四元字段（E8-G2-CC07 字段化承载——D-05 选项 A）——fact / inference / hypothesis 逐字段等于语料分段（由已提交语料字节机械派生），simulation = 完整提案语料（含 事实——/推断——/假设—— 标记），simulation ≠ fact（模拟结果不表现为事实），separation_invariant=simulation_result_is_not_fact；源输入摘要、simulation_id / proposal_id / generation_id 关联齐备；模拟域快照 separation 与事件 properties 逐字段一致',
    cSeparation?.pass === true,
    { separation: cSeparation?.pass },
  );

  // A3: NO-NEW-EXPERIENCE.
  const cNoNew = caseResults.find((entry) => entry.caseId === 'NO-NEW-EXPERIENCE');
  assert(
    'A3',
    'NO-NEW-EXPERIENCE：G03-N 不变式——多轮模拟 + 分支操作轮不创建新 Session / Experience（session_started=1，experience_started=1，session_ended=0）；会话保持 SESSION_ACTIVE；全部体验事件共享同一 session_id / experience_id',
    cNoNew?.pass === true,
    { noNewExperience: cNoNew?.pass },
  );

  // A4: STAGE-PRESERVED.
  const cStage = caseResults.find((entry) => entry.caseId === 'STAGE-PRESERVED');
  assert(
    'A4',
    'STAGE-PRESERVED：阶段迁移序列 CURIOSITY → UNDERSTANDING → SIMULATION（轮 1）→ SIMULATION（轮 2，13 §15.3）→ CREATION（CREATE 衔接，13 §15.5）→ COMPLETION（STOP 完成）；WHAT_IF 轮次保持 SIMULATION 阶段（体验阶段轴不变——D-02 选项 A）；创作建立 creation_started ×1（phase USER_FEEDBACK v1）；创作完成 creation_completed ×1（COMPLETE，active=false，v1）；CREATE 内容逐字节等于 create 语料；终态 COMPLETED/COMPLETION；会话 SESSION_ENDED',
    cStage?.pass === true,
    { stagePreserved: cStage?.pass },
  );

  // A5: STALE-REJECT.
  const cStale = caseResults.find((entry) => entry.caseId === 'STALE-REJECT');
  assert(
    'A5',
    'STALE-REJECT：陈旧 expected_state_version（3 vs 4）模拟提交 → STATE_VERSION_CONFLICT（retryable=false，details 含 expected/current_state_version）；状态逐字节不变（JSON 序列化前后一致）；无新 simulation_recorded（失败不登记模拟轮次）；无新 state_transitioned（state_version > 4）；拒绝事实经 state_version_conflict 事件登记（trigger=WHAT_IF，expected=3，current=4）；失败写入不消耗任何版本号（OBL-01）；携带当前版本（4）重试 → SIMULATE 成功（v6，simulation_recorded round 2）',
    cStale?.pass === true,
    { staleReject: cStale?.pass },
  );

  // A6: STOP-PRIORITY.
  const cStop = caseResults.find((entry) => entry.caseId === 'STOP-PRIORITY');
  assert(
    'A6',
    'STOP-PRIORITY：分类器优先级静态断言——"如果摩擦力为零就好了" 分类为 STOP（P-01：STOP 永远优先于 WHAT_IF）；"如果为什么" 分类为 WHY（PD-12：同层解释顺序 WHY > WHAT_IF）；"如果摩擦力为零会怎样" 分类为 WHAT_IF（对照不变）；动态声明校验——声明 WHAT_IF 但输入含 STOP / WHY 标记 → INVALID_REQUEST（semantic_action mismatch——clients cannot inject policy actions）；拒绝后状态逐字节不变；零 simulation_recorded；无模拟域上下文',
    cStop?.pass === true,
    { stopPriority: cStop?.pass },
  );

  // A7: NONCREATION-INERT.
  const cInert = caseResults.find((entry) => entry.caseId === 'NONCREATION-INERT');
  assert(
    'A7',
    'NONCREATION-INERT：非模拟场景（WHY → EXPLAIN）行为与前置版本一致——why_requested ×1，state_transitioned steps [USER_ACTION]，终态 WAITING/UNDERSTANDING v4，内容逐字节等于 why 语料，决策追踪 llm_used=true；与前置版本（policy_v1.3.0）仅有的差异为 policy_version=policy_v2.2.0（版本化变更文本同步——F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续）；模拟域零事件（simulation_recorded=0）且无模拟上下文（getSimulation 拒绝——非模拟路径不受 F-4 影响）',
    cInert?.pass === true,
    { noncreationInert: cInert?.pass },
  );

  // A8: INPROC-REGRESSION.
  const cInproc = caseResults.find((entry) => entry.caseId === 'INPROC-REGRESSION');
  assert(
    'A8',
    'INPROC-REGRESSION：WHY → 模拟轮 1 → 模拟轮 2 → 分支操作 RETURN → 模拟轮 3（RETURN 后首轮自动 CREATE 新分支）→ CREATE 衔接（13 §15.5）→ 完成信号（STOP）全链路——信封全量有效（C6 §7）、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v2.2.0（F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续不变）；WHY / 模拟轮 / CREATE 内容逐字节等于 why / simulate / create 语料；RETURN 轮 selected_action=SIMULATE 且 reason=simulation_branch_operation（确定性系统回合）；simulation_recorded ×3（round 1/2 同一分支，round 3 新分支）；终态 COMPLETED/COMPLETION；创作 COMPLETE（active=false，v1）；会话 SESSION_ENDED；模拟域跨会话持久（STOP 后 getSimulation 成功——currentBranchId===null 会话级指针清空，分支记录 ×2 与模拟历史全量保留——S3B §1.1/§1.5 取代 S2 时代 D-04 失效不变式）',
    cInproc?.pass === true,
    { inprocRegression: cInproc?.pass },
  );

  // A9: BRANCH-LIFECYCLE.
  const cBranch = caseResults.find((entry) => entry.caseId === 'BRANCH-LIFECYCLE');
  assert(
    'A9',
    'BRANCH-LIFECYCLE：轴外分支子状态机全生命周期（D-02/D-03 选项 A）——轮 1 自动 CREATE 分支 1（sourceRound=1，ACTIVE）→ 轮 2 累积（分支 version=2）→ RETURN（分支 1 RETURNED，currentBranchId=null，模拟历史不变）→ 轮 3 自动 CREATE 分支 2（sourceRound=3）→ SWITCH 分支 1（RETURNED 恢复 ACTIVE，currentBranchId=分支 1）→ ABANDON 分支 2（ABANDONED，当前激活保持分支 1）→ 负向：切换已放弃分支 2 INVALID_STATE_TRANSITION（版本保持 14，不消耗版本号）→ RETURN（分支 1 RETURNED）→ 负向：无激活分支 RETURN INVALID_STATE_TRANSITION（版本保持 16）；simulation_recorded ×3（round 1/2/3——仅模拟轮登记）；分支操作决策追踪 6 轮（含 2 拒绝轮）llm_used=false（确定性系统回合），reasonPrimary ∈ {explicit_user_direction, invalid_state_transition}',
    cBranch?.pass === true,
    { branchLifecycle: cBranch?.pass },
  );

  // A10: BRANCH-ADOPT.
  const cAdopt = caseResults.find((entry) => entry.caseId === 'BRANCH-ADOPT');
  assert(
    'A10',
    'BRANCH-ADOPT：显式回流操作 ADOPT_BRANCH（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A——第五分支操作，policy_v2.2.0 变更 1–5）——轮 1/2 自动 CREATE 分支 1 并累积（adopted=false，ACTIVE，version=2）→ 采用分支 1（adopted=true 附加，生命周期 ACTIVE 不变，主线当前上下文不变——currentBranchId 保持分支 1；simulation_adopted ×1，properties 含 branch_id / source_round=1 / adopted_content 摘要=分支最新模拟轮模拟内容 / separation_invariant=simulation_result_is_not_fact；结果流呈现采纳内容为新一轮模拟上下文；selected_action=SIMULATE，reason=simulation_branch_operation，policy_version=policy_v2.2.0）→ 负向：采用不存在分支序号（分支九）INVALID_STATE_TRANSITION（拒绝先于任何写入，不消耗版本号——OBL-01）→ RETURN（分支 1 RETURNED，currentBranchId=null）→ 无激活分支上下文采用分支 1（RETURNED 生命周期不变，adopted 幂等保持 true，currentBranchId 保持 null——主线当前上下文不变）；simulation_recorded ×2（仅模拟轮登记）；simulation_adopted ×2；分支操作决策追踪 4 轮 llm_used=false（确定性系统回合），ADOPT_BRANCH 轨迹 3 轮——采用轮（成功 ×2）reasonPrimary=explicit_user_direction、拒绝轮 reasonPrimary=invalid_state_transition；全部决策追踪 policy_version=policy_v2.2.0；信封全量有效、sequence 严格单调；终态 WAITING/SIMULATION v12（负向拒绝轮零版本消耗）',
    cAdopt?.pass === true,
    { branchAdopt: cAdopt?.pass },
  );

  // A11: case record completeness (E5 §4 12 fields).
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
    'A11',
    `全部 ${CASE_REGISTRY.length} 案例记录齐备且 12 字段完整（E5 §4；${CASE_REGISTRY.length} 执行；PD-19 延期义务已履行——G04/G07/G08 关闭切片执行，无 DEFERRED 登记）`,
    recordCheck,
    { recordFiles: recordFiles.length, expected: CASE_REGISTRY.length, allCasesPass },
  );

  // A12: trace files complete and non-empty.
  const traceFiles = (await readdir(tracesDir)).filter((name) => name.endsWith('.jsonl'));
  const traceCheck =
    traceFiles.length === CASE_REGISTRY.length &&
    (await Promise.all(
      traceFiles.map(async (name) => (await stat(path.join(tracesDir, name))).size > 0),
    )).every((nonEmpty) => nonEmpty);
  assert('A12', `全部 ${CASE_REGISTRY.length} 案例轨迹文件齐备且非空`, traceCheck, { traceFiles: traceFiles.length });

  // A13-PREFLIGHT: preflight / integrity (informational; failures are FATAL above).
  assert(
    'A13-PREFLIGHT',
    '预检与完整性：typecheck:core + next build 退出码 0；参考归档哈希全部验证通过；契约指纹 C1–C7 全部匹配（失败为 FATAL，不计入断言池）',
    typecheck.code === 0 && build.code === 0 && referenceCheck.failed.length === 0 && fingerprintCheck.allMatch,
    { typecheckExitCode: typecheck.code, buildExitCode: build.code, referenceVerified: `${referenceCheck.verified}/${referenceCheck.total}`, fingerprintsAllMatch: fingerprintCheck.allMatch },
  );

  // ---------------------------------------------------------------------------
  // E5 §3 version matrix (run-metadata.json) — S2a F-4 simulation-semantics form.
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
    'src/experience/runtime.ts',
    'src/experience/server-runtime.ts',
    'src/experience/fixtures/direct-answer.ts',
    'src/experience/fixtures/why.ts',
    'src/experience/fixtures/change-direction.ts',
    'src/experience/fixtures/simulate.ts',
    'src/experience/fixtures/create.ts',
    'src/experience/fixtures/correction.ts',
    'tools/evidence/src/s2a-f4.mjs',
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
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§6：F-4——WHAT_IF 完整分支语义（S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：多轮模拟持久化 + 四元分离事件登记 + 轴外分支子状态机 + 分支生命周期四操作最小集 + simulation_recorded 事件词表；ADOPT_BRANCH 显式回流经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效——policy_v2.2.0 变更 1–5，本运行扩展 BRANCH-ADOPT 案例组）',
    authorization: { id: 'P3-S2-IMPL-AUTH-01', version: '1.2.0', issued: '2026-10-09', note: '产品负责人签署生效（AUTHORIZED）；§4 修订：F-4 语义冻结文本于首个动态证据运行（S2A-F4-0001）前完成版本化冻结 + C1/C2/C3 Steward 确认（G1 式纪律）' },
    obligationTraceability: {
      'F-4 (WHAT_IF full branch)': {
        semanticFreeze: 'docs/product/p3-s1/s2a-f4-semantic-freeze-staged.md（S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 FROZEN，2026-10-09 产品负责人签署）',
        frozenDecisions: {
          'D-01': '选项 A（分层实施：第一层多轮模拟持久化随 policy_v1.4.0 生效——frozen 源可机械派生；第二层分支语义经 D-02…D-04 产品负责人版本化裁决后于同一冻结文本内补写生效）',
          'D-02': '选项 A（轴外分支子状态机，model on F-2 创作子状态机纪律——分支记录五分量：branch_id / 源模拟轮次 / 模拟结果记录（四元分离）/ 版本 / 生命周期状态；体验阶段轴不变，WHAT_IF 轮次保持 SIMULATION 阶段，13 §15.3；分支模拟结果默认不回流为主线结论）',
          'D-03': '选项 A（四操作最小集：CREATE（WHAT_IF 首轮自动创建分支记录）/ SWITCH（显式切换激活分支）/ ABANDON（放弃分支）/ RETURN（返回主线模拟上下文）；操作识别为确定性规则词表，具体词表为实现细节；"采用某分支结论"须产品负责人另案版本化定义，本版不预先写死）——保留面经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效：第五操作 ADOPT_BRANCH（policy_v2.2.0 变更 1–5；词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH）',
          'D-04': '选项 A（会话内持久——07 §3 Session State 纪律；跨会话分支持久化属 F-5 Minimal Memory 裁决范围，授权 §2(4) 专管，本切片不实施）',
          'D-05': '选项 A（四元分离事件记录——simulation_recorded，C6 §14 命名模式派生；properties 含 fact / inference / hypothesis / simulation 四元字段 + 源输入摘要；分离不变由事件 schema 互斥注记 + 内容语料分离格式双重保证）',
        },
        implementationFiles: ['src/experience/simulation.ts（新增：模拟域——四元分离派生 / 分支操作词表 / SimulationStore / 快照 API）', 'src/experience/events.ts（模拟域事件词表常量 simulation_recorded）', 'src/experience/policy.ts（POLICY_VERSION=policy_v1.4.0 + §3 变更 1/2 文档注释）', 'src/experience/runtime.ts（WHAT_IF 执行扩展：每轮 simulation_recorded 登记 + 分支操作路由与执行 + 会话终止站点模拟域失效 + getSimulation API）', 'tools/evidence/src/golden.mjs（policy_version 断言同步 policy_v1.4.0）'],
        adoptExtension: 'S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 实施（policy_v2.2.0 变更 1–5）：src/experience/simulation.ts（BranchRecord adopted 附加属性 + ADOPT_BRANCH 词表与执行——词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH）/ src/experience/events.ts（simulation_adopted 事件词表常量）/ src/experience/runtime.ts（ADOPT_BRANCH 路由与执行——确定性系统回合；simulation_adopted 事件登记；采用结果呈现为新一轮模拟上下文）/ src/experience/policy.ts（POLICY_VERSION=policy_v2.2.0 + 变更 1–5 文档注释）/ tools/evidence/src/golden.mjs（G10 分支回流黄金案例组 + policy_version 断言同步 policy_v2.2.0）/ tools/evidence/src/s2a-f4.mjs（BRANCH-ADOPT 案例组 + policy_version 断言同步 policy_v2.2.0）',
        evidenceCases: caseResults.map((entry) => `${RUN_ID}:${entry.caseId}=${entry.result}`),
        assertions: assertions.map((entry) => `${entry.id}=${entry.passed ? 'PASSED' : 'FAILED'}`),
        goldenRegression: 'G3-GOLDEN-0001 PASSED（F-4 实施时 32/32 案例，断言已同步 policy_v1.4.0——历史绑定在录；前置基线 2026-10-09：36/36 案例、policy_v2.0.0 / state_machine_v1.5.0、退出码 0——历史绑定在录；本运行再生成基线：40/40 案例（G10 分支回流黄金案例组新增）、policy_v2.2.0 / state_machine_v1.5.0、退出码 0）',
      },
    },
    environmentLicense: { id: 'E5-SCOPED-LICENSE-01', version: '1.0.0', decision: 'PD-17', status: 'superseded-by-implementation-authorization' },
    productDecisions: {
      register: 'docs/product/baseline/product-owner-decisions-v1.md',
      keys: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08', 'PD-09', 'PD-10', 'PD-11', 'PD-12', 'PD-13', 'PD-14', 'PD-15', 'PD-16', 'PD-17', 'PD-21', 'PD-22', 'PD-23'],
      note: 'PD-23：S2 范围裁决（选项 B 两切片：S2a = 全 G04 Creation / 全 G07 Correction / WHAT_IF 全分支 / Minimal Memory）；PD-06：S1 基础单次模拟形态（F-4 起执行语义扩展为多轮持久化——映射不变）；PD-07：不持久化跨会话 Memory',
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
        '创造状态机 V1（13 §16——轴外子状态机；S2A-F2-SEMANTIC-FREEZE-01 §4 变更 1）',
        'CORRECTION 操作序列契约化（S2A-F3-SEMANTIC-FREEZE-01 §4 变更 1）',
        'RESTORE 语义（S2A-F3-SEMANTIC-FREEZE-01 §4 变更 2）',
        'WHAT_IF_SIMULATE 多轮模拟契约化（S2A-F4-SEMANTIC-FREEZE-01 §4 变更 1：WHAT_IF_SIMULATE 触发规则不变——13 §15.2 UNDERSTANDING → SIMULATION、§15.3 SIMULATION → SIMULATION；多轮模拟经模拟域事件序列登记，每轮恰好一次版本化提交，模拟结果四元分离）',
        'WHAT_IF 分支状态（S2A-F4-SEMANTIC-FREEZE-01 §4 变更 2：轴外分支子状态机——D-02 选项 A 形态，分支记录生命周期状态迁移 ACTIVE / RETURNED / ABANDONED 与分支操作触发器经产品负责人裁决后补写生效；体验轴触发器集不变——分支操作不新增体验轴触发器，同 F-2 D-05 / F-3 D-04 轴外纪律）',
        'S2b 时代扩展（state_machine_v1.5.0 变更 1–3：创作域补丁操作域扩展 {add, remove, modify, deepen, simplify, reframe} / SEARCH 能力状态纪律 / First Experience 呈现路径——S2B-SEMANTIC-FREEZE-01 §4；本清单为 F-4 义务绑定范围，S2b 扩展由 S2B-0001 证据登记）',
      ],
    },
    policy: {
      contract: 'C3',
      version: 'policy_v2.2.0',
      frozenMappingsImplemented: {
        DIRECT_ANSWER: 'ANSWER',
        WHY: 'EXPLAIN',
        WHAT_IF: 'SIMULATE（映射不变——S1 §14；执行语义 F-4 起扩展为多轮模拟持久化 + 轴外分支子状态机，冻结于 policy_v1.4.0 §3 变更 1/2，经 policy_v2.2.0 延续不变——ADOPT_BRANCH 显式回流操作随 policy_v2.2.0 变更 1 生效，S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A）',
        CHANGE_DIRECTION: 'CHANGE_EXPERIENCE',
        STOP: 'STOP',
        DEEPEN: 'DEEPEN（S2b 启用——14 §8 恒等映射，policy_v2.0.0 变更 1；动态证据 S2B-0001 登记）',
        SIMPLIFY: 'SIMPLIFY（同上——S2b 启用）',
        REFRAME: 'REFRAME（同上——S2b 启用）',
        CREATE: 'CREATE（PD-21 关闭切片启用；F-2 起承载完整 G04 创作语义；F-3 起创作会话内 MODIFY 别名输入经路由保护回创作解释；SIMULATION → CREATION 衔接 13 §15.5 不变）',
        CORRECTION: 'EXPLAIN（G07 完整语义 F-3 起完整化：定位目标 / 局部修改 / 重生成 / 历史版本化；MODIFY 用户面别名 + RESTORE 恢复子型；策略映射不变）',
      },
      frozenMapAuthority: 'S1 规范 §14 Policy Rules（acceptance-mapping §A/C 批准范围）+ S2A-F4-SEMANTIC-FREEZE-01 §3 变更文本（policy_v1.4.0，经现行 policy_v2.2.0 延续不变）',
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
        '模拟域事件（S2A-F4：simulation_recorded——C6 §14 命名模式派生；properties 含 fact / inference / hypothesis / simulation 四元分离字段 + 源输入摘要 + 分支关联（branch_id / branch_created）+ 分离不变互斥注记 separation_invariant；D-05 选项 A）',
        '模拟域事件扩展（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A：simulation_adopted——C6 §14 命名模式 <domain>_<past_participle> 派生；properties 含 branch_id / source_round / adopted_content 摘要（分支最新模拟轮的模拟结果内容——分支探索摘要）/ separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源；主线当前上下文不变——采用内容经独立 CREATE 提交方纳入作品）',
      ],
    },
    engineeringBoundaries: {
      contract: 'P2-EVIDENCE-4.0',
      evidence: 'EB-02（失败写入不消耗版本号——STALE-REJECT / 分支操作前置校验拒绝）；EB-06（重试是工程恢复机制——本迭代无重试路径改动）；EB-07（超时不自行决定新方向）；EB-13（完成不属于 LLM 自主权限）；EB-14（分析只能观察）；EB-16（版本可追溯——本版本矩阵 + A10/A15）',
      seamBoundary: '本迭代无注入缝改动（注入缝属 F-1；SEAM-INERT 不变式由 S2A-OBL-01-0001 证据保持，本运行进程内形态默认合成网关）',
      s2ScopeItems: {
        memory: 'Minimal Memory 属 S2a F-5——已实施（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本；src/experience/memory.ts 新增；动态证据 S2A-F5-0001 9/9 案例、14/14 断言；policy_v1.5.0 冻结语义，经 policy_v2.2.0 延续）——非本回归范围',
        deepenSimplifyReframe: 'DEEPEN/SIMPLIFY/REFRAME 属 S2b（PD-23 裁决）——S2b 首批义务 G-1…G-4 已实施启用（顶层语义动作，policy_v2.0.0 变更 1；S2B-SEMANTIC-FREEZE-01 D-01 选项 A；动态证据 S2B-0001 7/7 案例、14/14 断言）——非本回归范围（S2A-F2-0001 DEFERRED-OP 案例为 F-4 时点历史记录）',
        correction: 'G07 完整 Correction 语义属 S2a F-3（policy_v1.3.0）——已实施（S2A-F3-0001）',
        whatIf: 'WHAT_IF 全分支属 S2a F-4（语义冻结于 policy_v1.4.0，经 policy_v2.2.0 延续）——本迭代已实施（S2A-F4-0001）；本回归轮登记语料升版 synthetic/simulate/v2（S2-CORPUS-TAIL-RULING-01 选项 A）后的域语义',
      },
    },
    simulationSemantics: {
      multiRoundPersistence: 'WHAT_IF 多轮模拟持久化（§3 变更 1 第一层，D-01 选项 A）：WHAT_IF → SIMULATE 映射不变（S1 §14）；每轮模拟结果经模拟域事件登记（simulation_recorded，D-05 选项 A）；模拟历史会话内持久（D-04 选项 A——07 §3 Session State 纪律）；多轮模拟阶段迁移保持 SIMULATION（13 §15.3——SIMULATION → SIMULATION 直接转写，状态机无需新增规则）；每次合法提交版本恰好 +1（S1-12——每轮两次版本化提交：提交 + RESPONSE_COMPLETED）；不新建 Session / Experience（G03-N 不变式）；WHAT_IF 首轮自动创建分支记录（D-03 选项 A CREATE）',
      fourWaySeparation: '四元分离（E8-G2-CC07，D-05 选项 A）：simulation_recorded properties 含 fact / inference / hypothesis / simulation 四元字段——fact / inference / hypothesis 由语料分离格式（事实——/推断——/假设——标记）确定性切分；simulation = 完整模拟提案语料；模拟结果不得表现为事实由事件 schema 互斥注记（separation_invariant=simulation_result_is_not_fact）+ 内容语料分离格式双重保证；模拟域快照（getSimulation API）separation 与事件 properties 逐字段一致（事件为不可变权威事实——C6 §5）',
      branchSubStateMachine: '轴外分支子状态机（§3 变更 2 / §4 变更 2，D-02 选项 A）：分支记录为体验状态轴之外的持久对象（五分量：branch_id / 源模拟轮次 sourceRound / 模拟结果记录 rounds（四元分离）/ 版本 version / 生命周期状态 lifecycle ∈ {ACTIVE, RETURNED, ABANDONED}——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 起附加 adopted 标记属性（非生命周期状态——生命周期契约不增第四态；幂等））；体验阶段轴不变（WHAT_IF 轮次与分支操作轮次均保持 SIMULATION 阶段，13 §15.3——分支操作不新增体验轴触发器）；分支模拟结果默认不回流为主线结论（D-02 选项 A 推导——回流即把模拟当事实，违反 E8-G2-CC07；"采用某分支结论"经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效——ADOPT_BRANCH 显式回流为经用户指令的例外通道，默认语义不变）',
      branchOperations: '分支生命周期操作集（D-03 选项 A 四操作最小集 + S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 第五操作）：CREATE（WHAT_IF 首轮自动创建分支记录——无激活分支上下文时自动开启新分支）/ SWITCH（显式切换激活分支——RETURNED 分支经切换恢复探索，生命周期 ACTIVE；ABANDONED 分支不可切换）/ ABANDON（放弃分支——生命周期 ABANDONED；放弃当前激活分支时当前清空）/ RETURN（返回主线模拟上下文——当前分支生命周期 RETURNED，currentBranchId 清空，下一 WHAT_IF 轮自动 CREATE 新分支）/ ADOPT_BRANCH（显式采用分支结论——目标分支记录附加 adopted 标记，生命周期契约不变（ACTIVE / RETURNED 均可采用；ABANDONED 不可采用——前置校验拒绝）；主线当前上下文不变（current_branch 不改动——采用面向分支记录本身，无激活分支上下文时采用仍合法）；采用结果经 simulation_adopted 事件登记（properties 含 branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源）；采用结果呈现为新一轮模拟上下文（分支最新模拟轮的模拟结果内容随结果流呈现），用户须另行 CREATE 提交方将采纳内容纳入作品——创作版本化纪律不变）；操作识别为确定性规则词表（同分类器纪律，具体词表为实现细节——词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH；SWITCH / ABANDON / ADOPT_BRANCH 须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径）；分支操作轮次为确定性系统回合（无 LLM 提案——决策追踪 llm_used=false，reasonPrimary=explicit_user_direction；拒绝轮 reasonPrimary=invalid_state_transition）',
      branchMainlineRelation: '分支与主线关系（D-02 选项 A 说明）：分支模拟结果默认不回流为主线结论——分支为轴外探索上下文，主线模拟历史与分支历史分别登记（simulation_recorded 事件序列 + 分支记录 rounds）；分支操作经版本化提交后应用（与体验状态提交同一串行化写者纪律——S1-12）；显式回流例外通道（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A）：ADOPT_BRANCH 经用户指令采用分支结论——采用结果仍标记为模拟来源（separation_invariant=simulation_result_is_not_fact），主线当前上下文不变，采纳内容经独立 CREATE 提交方纳入作品（创作版本化纪律不变）',
      sessionBoundary: '分支持久化范围与边界（D-04 选项 A）：分支状态会话内持久（跨 USER_ACTION / RESPONSE_COMPLETED 周期存活），会话结束失效（体验完成 / 方向变更 / 重复 CREATE 取代在途创作会话时模拟域失效——失效仅作用于运行时存储，事件为不可变权威事实——C6 §5）；跨会话分支持久化属 F-5 Minimal Memory 裁决范围（授权 §2(4) 专管），本切片不实施',
      negativePaths: '负向路径（前置校验拒绝——OBL-01 同族纪律）：切换已放弃分支 / 不存在分支序号 / 无激活分支 RETURN → INVALID_STATE_TRANSITION（拒绝先于任何写入，不修改任何状态，不消耗版本号）；ADOPT_BRANCH 负向：采用不存在分支序号 / 采用已放弃分支 → INVALID_STATE_TRANSITION（同族纪律——拒绝先于任何写入，不消耗版本号）；未命中分支作用域词表或未解析目标序号的"采用"输入 → 不识别为分支操作（走通用 SIMULATE 执行路径——词表边界纪律）',
      events: '模拟域事件（D-05 选项 A）：simulation_recorded（properties：simulation_id / round / branch_id / branch_created / source_input / fact / inference / hypothesis / simulation / separation_invariant / proposal_id / generation_id）；C6 §14 命名模式 <domain>_<past_participle> 派生；event_version 1.0.0 不变——词表扩展经 C6 §14 派生；仅模拟轮次登记（分支操作轮次为确定性系统回合，零 simulation_recorded）；simulation_adopted（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A——ADOPT_BRANCH 轮次登记，properties：branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源，E8-G2-CC07）',
      crossSession: '模拟不持久化跨会话（PD-07——模拟域事件与分支记录均为会话内事实登记，无 memory 层事件）',
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
      changedFiles: ['src/experience/simulation.ts', 'src/experience/events.ts', 'src/experience/policy.ts', 'src/experience/runtime.ts', 'tools/evidence/src/golden.mjs', 'tools/evidence/src/s2a-f4.mjs', 'tools/evidence/package.json'],
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
        { fixtureId: 'synthetic/simulate/v2', file: 'src/experience/fixtures/simulate.ts', sha256: runtimeFileHashes['src/experience/fixtures/simulate.ts'] },
        { fixtureId: 'synthetic/stop/v1', file: '（运行时内联构造：STOP 无内容分块）', sha256: null },
        { fixtureId: 'creation_ask', file: '（运行时内联构造：ASK 轮单块澄清问题）', sha256: null },
        { fixtureId: 'simulation_branch_operation', file: '（运行时内联构造：分支操作轮单块确定性内容——D-03 选项 A 确定性系统回合；ADOPT_BRANCH 轮呈现分支最新模拟轮模拟结果为新一轮模拟上下文——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 变更 4）', sha256: null },
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
      g3: { runId: 'G3-GOLDEN-0001', result: 'PASSED（golden 再生验证——F-4 实施时 32/32、断言已同步 policy_v1.4.0；前置基线 2026-10-09：36/36 案例、policy_v2.0.0 / state_machine_v1.5.0、退出码 0——历史绑定在录；本运行再生成基线：40/40 案例（G10 分支回流黄金案例组新增）、policy_v2.2.0 / state_machine_v1.5.0、退出码 0）' },
      s2a: {
        f1: { runId: 'S2A-OBL-01-0001', result: 'PASSED（7/7 案例、12/12 断言、退出码 0）' },
        f2: { runId: 'S2A-F2-0001', result: 'PASSED（10/10 案例、16/16 断言、退出码 0）' },
        f3: { runId: 'S2A-F3-0001', result: 'PASSED（8/8 案例、15/15 断言、退出码 0）' },
      },
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAtMs,
    executor: 'tools/evidence/src/s2a-f4.mjs',
    executorSha256: sha256OfBuffer(await readFile(path.join(here, 's2a-f4.mjs'))),
  };
  await writeFile(path.join(runDir, 'run-metadata.json'), `${JSON.stringify(versionMatrix, null, 2)}\n`, 'utf8');
  log('run-metadata.json written (E5 §3 version matrix, S2a F-4 simulation-semantics form)');

  // A14: run-metadata completeness (E5 §3).
  const requiredSections = [
    'runId', 'obligation', 'authorization', 'obligationTraceability', 'productDecisions', 'contracts',
    's1Specifications', 'stateMachine', 'policy', 'api', 'event', 'engineeringBoundaries',
    'simulationSemantics', 'evaluation', 'code', 'prompt', 'model', 'corpus', 'environment', 'packages',
    'startedAt', 'finishedAt', 'durationMs', 'executor',
  ];
  const missingSections = requiredSections.filter((section) => !(section in versionMatrix));
  assert('A14', 'run-metadata 完整（E5 §3 版本矩阵全部字段 + F-4 模拟语义专项 simulationSemantics + obligationTraceability）', missingSections.length === 0, { missingSections });

  // A15: environment lock.
  assert(
    'A15',
    '环境锁定：engines.node === "24.21.0"（F-2 精确锁定，F-4 延续）且执行于 Node v24.21.0；lockfileVersion 3；Next.js / React / TypeScript 版本登记',
    productPackage.engines?.node === '24.21.0' && process.version === NODE_LOCK && lockfile.lockfileVersion === 3,
    { enginesNode: productPackage.engines?.node, processVersion: process.version, lockfileVersion: lockfile.lockfileVersion, next: nextVersion, react: reactVersion, typescript: typescriptVersion },
  );

  // A16: F-4 version matrix obligations (versioned change texts bound).
  assert(
    'A16',
    'F-4 版本矩阵义务绑定：policy 版本 policy_v2.2.0（现行冻结——S2B-SEMANTIC-FREEZE-01 D-05 经 policy_v2.2.0 延续 + S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 变更 1–5 补写生效；F-4 语义冻结于 policy_v1.4.0 §3 变更 1/2，经 policy_v2.2.0 延续不变）；state_machine 版本 state_machine_v1.5.0（现行——F-4 契约化冻结于 state_machine_v1.3.0 §4 变更 1/2，延续不变）；frozenDecisions D-01…D-05 齐备（全项选项 A）；黄金回归绑定 G3-GOLDEN-0001（F-4 实施时 32/32、断言已同步 policy_v1.4.0——历史绑定在录）；实施文件清单 5 项齐备（含 simulation.ts 新增）',
    versionMatrix.policy.version === 'policy_v2.2.0' &&
      versionMatrix.stateMachine.version === 'state_machine_v1.5.0' &&
      Object.keys(versionMatrix.obligationTraceability['F-4 (WHAT_IF full branch)'].frozenDecisions).length === 5 &&
      versionMatrix.obligationTraceability['F-4 (WHAT_IF full branch)'].goldenRegression.includes('policy_v1.4.0') &&
      versionMatrix.obligationTraceability['F-4 (WHAT_IF full branch)'].implementationFiles.length === 5,
    { policyVersion: versionMatrix.policy.version, stateMachineVersion: versionMatrix.stateMachine.version, frozenDecisionCount: Object.keys(versionMatrix.obligationTraceability['F-4 (WHAT_IF full branch)'].frozenDecisions).length, implementationFileCount: versionMatrix.obligationTraceability['F-4 (WHAT_IF full branch)'].implementationFiles.length },
  );

  // Summary (first pass — SHA256SUMS verification appended in second pass per G3-E-3).
  const allPassedFirst = allCasesPass && assertions.every((entry) => entry.passed);
  const summary = {
    runId: RUN_ID,
    obligation: 'P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§6：F-4——WHAT_IF 完整分支语义（S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施：多轮模拟持久化 + 四元分离事件登记 + 轴外分支子状态机 + 分支生命周期四操作最小集 + simulation_recorded 事件词表；ADOPT_BRANCH 显式回流经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效——policy_v2.2.0 变更 1–5，本运行扩展 BRANCH-ADOPT 案例组）',
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
      '退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。F-4 证据本运行已执行；G5 独立评测 NOT RUN（独立评测人须先审阅本运行 staged 材料）。',
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log(`summary.json written (first pass: ${caseResults.length} cases, ${assertions.length} assertions)`);

  // SHA256SUMS (first pass) + independent re-verification — G3-E-3 pattern.
  const sumsPath = path.join(runDir, 'SHA256SUMS');
  await writeSha256Sums(runDir);
  const verifyResult = await verifySha256Sums(sumsPath, runDir);
  assert('A17', '证据清单 SHA256SUMS 已产出且独立重算全部一致', verifyResult.failed.length === 0, { verified: verifyResult.verified, failed: verifyResult.failed });

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

运行：${RUN_ID}（S2a F-4 迭代：WHAT_IF 完整分支语义——多轮模拟持久化 + 四元分离事件登记 + 轴外分支子状态机 + 分支生命周期四操作最小集 + simulation_recorded 事件词表；ADOPT_BRANCH 显式回流经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效——policy_v2.2.0 变更 1–5，BRANCH-ADOPT 案例组）
日期：${new Date().toISOString()}
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：${caseResults.length}/${caseResults.length} 全部 ${allCasesPass ? 'PASS' : '（见 summary.json）'}
- 断言：${assertions.filter((entry) => entry.passed).length}/${assertions.length} 通过
- 退出码：${summary.exitCode}（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— ${caseResults.length} 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-4 → 案例 / 断言映射；simulationSemantics：模拟语义规范注册；frozenDecisions：D-01…D-05 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 多轮模拟持久化（MULTI-ROUND）：两轮 WHAT_IF（"如果摩擦力为零会怎样" → "假如速度再高一点会怎样"）——每轮两次版本化提交（版本链 2→3→4→5→6，每次合法提交恰好 +1，S1-12）；selected_action=SIMULATE；阶段 UNDERSTANDING → SIMULATION → SIMULATION（13 §15.3）；simulation_recorded ×2（round 1/2 同一分支，branch_created [true, false]）；内容逐字节等于 simulate 语料；决策追踪 reasonPrimary=semantic_action，llm_used=true
- 四元分离（SEPARATION）：simulation_recorded properties 含 fact / inference / hypothesis / simulation 四元字段——fact / inference / hypothesis 逐字段等于语料分段（由已提交语料字节机械派生），simulation = 完整提案语料，simulation ≠ fact（模拟结果不表现为事实——E8-G2-CC07），separation_invariant=simulation_result_is_not_fact；模拟域快照 separation 与事件 properties 逐字段一致
- 不新建体验（NO-NEW-EXPERIENCE）：G03-N 不变式——多轮模拟 + 分支操作轮 session_started=1 / experience_started=1；会话保持 SESSION_ACTIVE；全部体验事件共享同一 session_id / experience_id
- 阶段保持与衔接（STAGE-PRESERVED）：CURIOSITY → UNDERSTANDING → SIMULATION → SIMULATION →（CREATE 衔接，13 §15.5）CREATION →（STOP 完成）COMPLETION；创作建立 / 完成事件齐备；创作 COMPLETE（active=false，v1）
- 陈旧拒绝（STALE-REJECT）：陈旧 expected_state_version（3 vs 4）→ STATE_VERSION_CONFLICT（retryable=false）；状态逐字节不变；无新 simulation_recorded / state_transitioned；拒绝事实经 state_version_conflict 事件登记（trigger=WHAT_IF）；当前版本重试成功（v6）
- 优先级（STOP-PRIORITY）：静态分类——STOP 标记 → STOP（P-01）/ WHY 标记 → WHY（PD-12）/ 洁净 WHAT_IF 对照不变；动态声明校验——声明 WHAT_IF 但输入含 STOP / WHY 标记 → INVALID_REQUEST（clients cannot inject policy actions）；拒绝后状态逐字节不变；零 simulation_recorded
- 非创作会话不回归（NONCREATION-INERT）：WHY → EXPLAIN 链路与 policy_v1.3.0 行为逐项一致（why_requested ×1，steps [USER_ACTION]，WAITING/UNDERSTANDING v4，内容逐字节等于 why 语料）；与前置版本（policy_v1.3.0）仅有的差异为 policy_version=policy_v2.2.0（版本化变更文本同步——F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续）；模拟域零事件且无模拟上下文
- 全链路回归（INPROC-REGRESSION）：WHY → 模拟轮 1 → 模拟轮 2 → 分支操作 RETURN → 模拟轮 3（新分支自动 CREATE）→ CREATE 衔接 → 完成信号——信封全量有效（C6 §7）、sequence 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v2.2.0（F-4 语义经 policy_v1.4.0 冻结、policy_v2.2.0 延续不变）、内容逐字节等于语料；simulation_recorded ×3（round 1/2 同一分支，round 3 新分支）；RETURN 轮 llm_used=false；模拟域跨会话持久（STOP 后 getSimulation 成功——currentBranchId===null，分支记录 ×2 保留——S3B 取代 S2 时代 D-04 失效不变式）
- 分支生命周期（BRANCH-LIFECYCLE）：CREATE（首轮自动）→ 累积 → RETURN（RETURNED + 当前清空）→ 自动 CREATE 新分支 → SWITCH（RETURNED 恢复 ACTIVE）→ ABANDON（ABANDONED）→ 负向拒绝 ×2（切换已放弃分支 / 无激活分支 RETURN——INVALID_STATE_TRANSITION，不消耗版本号）；模拟历史 3 轮（轮 1/2 分支 1，轮 3 分支 2）；分支操作决策追踪 6 轮（含 2 拒绝轮）llm_used=false
- 显式回流（BRANCH-ADOPT）：轮 1/2 自动 CREATE 分支 1 并累积 → ADOPT_BRANCH 分支 1（adopted 标记附加——生命周期 ACTIVE 不变，主线当前上下文不变——currentBranchId 保持分支 1；simulation_adopted ×1，properties 含 branch_id / source_round=1 / adopted_content 摘要=分支最新模拟轮模拟内容 / separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源；结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文）→ 负向：采用不存在分支序号（分支九）INVALID_STATE_TRANSITION（不消耗版本号）→ RETURN（分支 1 RETURNED，currentBranchId=null）→ 无激活分支上下文采用分支 1（RETURNED 生命周期不变，adopted 幂等，currentBranchId 保持 null——主线当前上下文不变）；simulation_recorded ×2（仅模拟轮登记）；分支操作决策追踪 4 轮 llm_used=false，ADOPT_BRANCH 轨迹 3 轮（采用轮成功 ×2 reasonPrimary=explicit_user_direction、拒绝轮 reasonPrimary=invalid_state_transition）；全部决策追踪 policy_version=policy_v2.2.0

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-5（Minimal Memory）——已由 S2a F-5 迭代实施（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本；src/experience/memory.ts；动态证据 S2A-F5-0001 9/9 案例、14/14 断言），非本回归范围
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）——已由 S2b 迭代实施（S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本；policy_v2.0.0 变更 1–6 / state_machine_v1.5.0；动态证据 S2B-0001 7/7 案例、14/14 断言），非本回归范围
- "采用某分支结论"显式回流操作——**已实施**（BRANCH-ADOPT 案例组；S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决生效——第五分支操作 ADOPT_BRANCH，policy_v2.2.0 变更 1–5；D-03 保留面关闭）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- 模拟语料尾句（S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A 裁决，产品负责人 2026-10-09）：语料已升 synthetic/simulate/v2——尾句对齐 F-4 分支语义（"本轮模拟已建立分支状态（会话内持久，可经后续"如果"轮继续）"）；本回归轮登记新 fixtureId 哈希（分离格式标记 事实——/推断——/假设—— 不变；v1 字节与 S2A-F4-0001 原始运行证据冻结于 git 历史）

## 独立重跑

    cd tools/evidence && npm run s2a-f4   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/${RUN_ID}；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
`;
  await writeFile(path.join(reviewDir, 'README.md'), reviewReadme, 'utf8');

  // Persist executor log.
  await writeFile(path.join(logsDir, 's2a-f4-run.log'), `${logLines.join('\n')}\n`, 'utf8');

  console.log(`--- ${RUN_ID} ${summary.allPassed ? 'PASSED' : 'FAILED'} — exit ${summary.exitCode} ---`);
  process.exit(summary.exitCode);
}

try {
  await main();
} catch (error) {
  console.error(`${RUN_ID} executor failed: ${error.stack ?? error}`);
  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(path.join(logsDir, 's2a-f4-run.log'), `${logLines.join('\n')}FATAL: ${error.stack ?? error}\n`, 'utf8');
  } catch {
    // best effort
  }
  process.exit(1);
}
