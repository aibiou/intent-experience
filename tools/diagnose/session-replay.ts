/**
 * 创作域回放诊断（DEFECT-CREATION-001 的可执行判据）。
 *
 * 目的：把「创作域是否被无理由重置」变成可复跑判决，而不是靠人读事件表。
 *
 * 用法：
 *   npx tsx tools/diagnose/session-replay.ts
 *
 * 判据（任一命中即 FAIL）：
 *   A. 连续 superseded:true ≥ 2 次
 *   B. CREATE 出现 ≥ 2 次且版本从未推进
 *   C. 用户输入与上次完全相同时仍触发新建创作
 *
 * 关键：本脚本直接调用产品实现（src/lib/experience/turn-routing.ts 的
 * routeTurn 与 src/lib/experience/policy.ts 的 resolvePolicy），**不复刻逻辑**。
 * 复刻会把诊断变成「测自己的副本」——首次修复后回放仍 FAIL 正是此因。
 */

import { routeTurn } from '../../src/lib/experience/turn-routing';
import { resolvePolicy } from '../../src/lib/experience/policy';
import type { CreationObject } from '../../src/lib/experience/creation';

interface Step {
  turn: number;
  raw: string;
  semanticAction: string;
  policyAction: string;
  superseded: boolean;
  version: number;
}

/** 真实会话 cmvap0n9c000tn3fdeix419bp 的输入序列（见缺陷分析文档 §1）。 */
const REAL_INPUTS = [
  '讲讲傍晚海边风怎么形成的',
  '用图片展现刚才的内容',
  '生成动态的视频，俩人在观海',
  '继续',
  '生成视频',
  '生成动态的视频，俩人在观海',
  '继续生成动态的视频，俩人在观海',
  '继续生成动态的视频，俩人在观海',
];

function makeCreation(version: number, goal: string): CreationObject {
  return {
    creationId: `creation_sim_${version}`,
    sourceSession: 'simulated',
    sourceStateVersion: version,
    concept: { theme: '傍晚海边风', goal },
    content: '一幅傍晚海边风的插画',
    userChanges: [],
    version,
    phase: 'PREVIEW',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

function replay(inputs: string[]): Step[] {
  const steps: Step[] = [];
  let creation: CreationObject | null = null;

  inputs.forEach((raw, index) => {
    const routing = routeTurn(raw, creation);
    const resolution = resolvePolicy(routing.semanticAction as never);
    const policyAction = resolution.ok ? resolution.policyAction : 'ACTION_OUT_OF_SLICE_SCOPE';

    let superseded = false;
    if (policyAction === 'CREATE' && routing.creationIntent === null) {
      // 首建路径：runCreationFirstTurn 写死 version: 1（runtime.ts）
      superseded = creation !== null;
      creation = makeCreation(1, raw);
    } else if (policyAction === 'CREATE' && routing.creationIntent?.kind === 'modification') {
      // 补丁路径：version + 1
      if (creation) creation = makeCreation(creation.version + 1, creation.concept.goal);
    }

    steps.push({
      turn: index + 1,
      raw,
      semanticAction: routing.semanticAction,
      policyAction,
      superseded,
      version: creation ? creation.version : 0,
    });
  });

  return steps;
}

function judge(steps: Step[]): string[] {
  const violations: string[] = [];

  let run = 0;
  for (const s of steps) {
    run = s.superseded ? run + 1 : 0;
    if (run >= 2) {
      violations.push(`判据 A 命中：第 ${s.turn} 轮起连续 ${run} 次 superseded:true（创作域被反复重置）`);
      break;
    }
  }

  const creates = steps.filter((s) => s.policyAction === 'CREATE' && s.superseded);
  const maxVersion = Math.max(...steps.map((s) => s.version), 0);
  if (creates.length >= 2 && maxVersion <= 1) {
    violations.push(`判据 B 命中：新建创作 ${creates.length} 次，version 从未超过 1`);
  }

  for (let i = 1; i < steps.length; i++) {
    if (steps[i].raw === steps[i - 1].raw && steps[i].superseded) {
      violations.push(`判据 C 命中：第 ${steps[i].turn} 轮输入与上一轮完全相同，仍触发新建创作`);
      break;
    }
  }

  return violations;
}

const steps = replay(REAL_INPUTS);

console.log('轮次 | 用户输入                       | semanticAction | policyAction | superseded | version');
console.log('-----|--------------------------------|----------------|--------------|------------|--------');
for (const s of steps) {
  console.log(
    String(s.turn).padStart(4) +
      ' | ' +
      s.raw.padEnd(30).slice(0, 30) +
      ' | ' +
      s.semanticAction.padEnd(14) +
      ' | ' +
      s.policyAction.padEnd(12) +
      ' | ' +
      String(s.superseded).padEnd(10) +
      ' | ' +
      String(s.version),
  );
}

const violations = judge(steps);
console.log('');
if (violations.length === 0) {
  console.log('判决：PASS —— 创作域未被无理由重置');
  process.exit(0);
}
console.log('判决：FAIL —— 创作域存在重置缺陷');
for (const v of violations) console.log('  × ' + v);
process.exit(1);
