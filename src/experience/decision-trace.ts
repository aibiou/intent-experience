/**
 * 决策追踪（S1-12；S1 规范 §25；C6 §22/§23）。
 *
 * Decision Trace 不是普通 Analytics Event，而是系统决策的可审计对象
 * （C6 §22）。每个核心决策至少记录（S1 §25）：
 *   decision_id / input_event / semantic_action / state_before /
 *   intent_before / policy_version / selected_action / reason /
 *   state_after / user_override
 * 且必须能回答"为什么系统刚才这么做"。
 *
 * LLM Trace 与 Policy Trace 必须分离（C6 §23）：
 * - 模型认为用户想做什么 → LLM Trace（llm_request_* / llm_output_* 事件）
 * - 产品为什么决定这样做 → Policy Trace（本模块 + policy_decided 事件）
 * - 最终状态发生了什么变化 → State Transition（state_transitioned 事件）
 * 三者不得合并为一条模糊的 ai_response。
 */

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface DecisionTraceState {
  status: string;
  stage: string;
  state_version: number;
}

export interface DecisionTrace {
  decision_id: string;
  session_id: string;
  experience_id: string | null;
  input_event: string | null;
  semantic_action: string;
  intent_before: unknown;
  state_before: DecisionTraceState | null;
  policy: {
    policy_version: string;
    selected_action: string;
  };
  reason: {
    primary: string;
    secondary: string | null;
  };
  execution: {
    tool_used: boolean;
    llm_used: boolean;
  };
  state_after: DecisionTraceState | null;
  user_override: boolean;
  at: string;
}

export type DecisionTraceSink = (trace: DecisionTrace) => void | Promise<void>;

/**
 * 服务端决策追踪汇（追加只写 NDJSON，独立于事件流与审计汇——
 * C6 §23 分离要求）。路径经环境变量注入；未设置时为无操作。
 */
export function createServerDecisionTraceSink(logPath: string | undefined): DecisionTraceSink {
  if (!logPath) {
    return () => undefined;
  }
  const dir = path.dirname(logPath);
  let ensured = false;
  return async (trace: DecisionTrace): Promise<void> => {
    try {
      if (!ensured) {
        await mkdir(dir, { recursive: true });
        ensured = true;
      }
      await appendFile(logPath, `${JSON.stringify(trace)}\n`, 'utf8');
    } catch {
      // 决策追踪汇失败不得中断运行时；证据执行器独立校验文件内容。
    }
  };
}

export function serverDecisionTraceLogPath(): string | undefined {
  const value = process.env.EXPERIENCE_DECISION_TRACE_LOG;
  return value && value.length > 0 ? value : undefined;
}

let decisionCounter = 0;

/** 生成决策 ID（decision_ 前缀，C6 §22 结构示例）。 */
export function nextDecisionId(): string {
  decisionCounter += 1;
  return `decision_${String(decisionCounter).padStart(6, '0')}${Math.random().toString(16).slice(2, 6)}`;
}
