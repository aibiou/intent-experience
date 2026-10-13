/**
 * 提示引擎（S1 + S2a 切片）——把产品铁律注入 LLM 的唯一通道。
 *
 * 内容纪律（来自逐屏产品原型规格与 E2 首体验冻结提案）：
 * 1. 分层解释：先给直觉层，不把所有相关知识一次倒出。
 * 2. 不藏答案：用户要答案就给答案；分层 ≠ 吊胃口。
 * 3. 上下文一致："为什么"默认指上一轮内容。
 * 4. 结尾即停：回答完就停，最多一句自然的可选方向，绝不追问、绝不自动继续。
 * 5. 事实纪律：区分事实/推断/假设，不确定就说不确定
 *    （模拟结果不得表现为事实——E8-G2-CC07）。
 *
 * S2a 扩展：
 * - WHAT_IF 模拟轮要求四元分离标记（事实——/推断——/假设——），
 *   使 deriveSimulationSeparation 可确定性解析（F-4 D-05）；
 * - 创作最小构建提示（F-2：08 §6/§7 不问类型配置、快速可感知结果）；
 * - 创作补丁提示（08 §11 局部修改纪律：只改用户要求的部分）；
 * - L5 记忆信号注入（F-5：07 §4 信号措辞纪律——"最近探索过" ≠ "喜欢"，
 *   07 §20 只取相关记录，L2 当前意图覆盖 L5）。
 */

import type { PolicyAction } from './policy';
import type { CreationObject, CreationPatch, InheritedCreationContext } from './creation';
import type { ExperienceState } from './types';

export interface MemorySignalInput {
  topic: string;
  interestSignal: number;
}

export function buildSystemPrompt(state: ExperienceState, memorySignals?: readonly MemorySignalInput[]): string {
  const recent = state.history.slice(-2);
  const earlierQuestions = state.userModel.questions.slice(-5);
  const lines: string[] = [
    '你是「个人体验引擎」的理解引擎。产品铁律：人决定方向，AI 降低成本——你永远不替用户决定继续。',
    `当前体验主题：${state.topic}`,
    `当前阶段：${state.view.stage === 'SIMULATION' ? '模拟探索' : state.view.stage === 'CREATION' ? '创造' : '理解建立'}（第 ${state.turn + 1} 轮）`,
  ];
  // S2a F-5：L5 记忆信号注入（只取相关记录；信号措辞纪律——不代表用户偏好）
  if (memorySignals && memorySignals.length > 0) {
    const topics = memorySignals.slice(0, 3).map((signal) => signal.topic).join('；');
    lines.push(`用户最近探索过的相关主题（仅作背景参考，不代表用户现在想聊它）：${topics}`);
  }
  if (state.creation?.active) {
    lines.push(`用户正在创作一个作品：「${state.creation.creation.concept.goal}」（当前第 ${state.creation.creation.version} 版）`);
  }
  if (state.userModel.corrections.length > 0) {
    lines.push(`用户已纠正过的理解（以此为准）：${state.userModel.corrections.slice(-2).join('；')}`);
  }
  if (earlierQuestions.length > 0) {
    lines.push(`用户问过的问题：${earlierQuestions.join('；')}`);
  }
  if (recent.length > 0) {
    lines.push('最近两轮内容（保持上下文一致）：');
    for (const turn of recent) {
      lines.push(`- 用户：「${turn.userText}」→ 你讲了：${turn.content.slice(0, 200)}`);
    }
  }
  lines.push(
    '',
    '内容纪律（必须遵守）：',
    '1. 分层解释：每轮只讲最核心的一层理解（4-6 个短段落），不要倾倒全部知识。',
    '2. 不藏答案：用户要答案就直接给答案，分层不是吊胃口。',
    '3. 上下文一致：用户说"为什么"默认指你上一轮讲的内容。',
    '4. 结尾即停：讲完就停。最多在结尾自然提一个可选的深入方向（一句），绝不追问、绝不自动继续、绝不推销。',
    '5. 事实纪律：确定的说事实，推测的标注推测；不确定就说不确定。',
    '6. 语言：中文，短段落，口语但准确，像聪明的朋友在解释，不像教材。不用列表堆砌，不用标题，不用 emoji。'
  );
  return lines.join('\n');
}

export function buildUserPrompt(policyAction: PolicyAction, userText: string, turn: number): string {
  if (turn === 0) {
    return [
      `用户带着这个问题进入体验：「${userText}」`,
      '',
      '这是第一轮。请给出第一层理解：',
      '- 直接回应这个问题本身（给真答案，不绕弯）',
      '- 用一个具体、可想象的画面或例子建立直觉',
      '- 讲完这一层就停，结尾可以自然留一个"往下还能探索什么"的方向（仅一句，可选）',
    ].join('\n');
  }
  switch (policyAction) {
    case 'ANSWER':
      return `用户：「${userText}」\n\n请直接回答这个问题（基于当前体验的上下文）。回答要完整，不绕弯；讲完就停。`;
    case 'EXPLAIN':
      return `用户：「${userText}」\n\n用户在问"为什么"。先自然衔接用户的话（确认或修正其理解），再解释背后的机制，默认指向你上一轮讲的内容。`;
    case 'SIMULATE':
      return [
        `用户：「${userText}」`,
        '',
        '这是一个 What-if 模拟请求。请基于当前体验主题做思想实验：',
        '- 用一个具体的画面推演会发生什么',
        '- 明确区分：哪些是已知事实、哪些是合理推断、哪些是假设（模拟结果不得表现为事实）',
        '- 讲完就停',
      ].join('\n');
    default:
      return `用户：「${userText}」\n\n请基于当前体验上下文回应。`;
  }
}

/** G07 纠正轮的附加指令（CORRECTION → EXPLAIN 的重评估纪律）。 */
export function buildCorrectionPrompt(userText: string): string {
  return [
    `用户：「${userText}」`,
    '',
    '用户在纠正你之前的理解。纪律：',
    '- 把用户的纠正当作权威事实，重新解释',
    '- 不为之前的错误辩解，简单承认后修正',
    '- 修正后的解释必须与用户的纠正一致',
  ].join('\n');
}
