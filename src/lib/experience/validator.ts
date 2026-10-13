/**
 * 验证器（S1 切片）——LLM 提案进入产品前的守门。
 *
 * 只做结构性验证：非空、长度上限、无越权形态。
 * 验证器不改写内容（改写 = 伪造）；不合格一律拒绝并升级。
 * LlmProposal 类型本身没有状态字段——GS-06（LLM 不得改写状态）
 * 由构造保证；本验证器是第二道防线。
 */

import type { LlmProposal } from './types';

const MAX_PROPOSAL_LENGTH = 4000;

export type ValidationOutcome =
  | { ok: true; text: string }
  | { ok: false; code: 'EMPTY_PROPOSAL' | 'OVERSIZE_PROPOSAL' | 'FORBIDDEN_SHAPE' };

/** 越权形态标记：提案里不应出现任何试图充当指令/状态声明的结构。 */
const FORBIDDEN_MARKERS: ReadonlyArray<RegExp> = [
  /<\|?(system|state|action|policy)[^>]*>/i,
  /^```json/i,
];

export function validateProposal(proposal: LlmProposal): ValidationOutcome {
  const text = proposal.text.trim();
  if (text.length === 0) {
    return { ok: false, code: 'EMPTY_PROPOSAL' };
  }
  if (text.length > MAX_PROPOSAL_LENGTH) {
    return { ok: false, code: 'OVERSIZE_PROPOSAL' };
  }
  if (FORBIDDEN_MARKERS.some((pattern) => pattern.test(text))) {
    return { ok: false, code: 'FORBIDDEN_SHAPE' };
  }
  return { ok: true, text };
}
