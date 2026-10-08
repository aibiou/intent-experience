/**
 * 提案验证器（S1-08；S1 规范 §16/§17/§18；GS-06）。
 *
 * LLM 输出永远是 Proposal（S1-07 Critical）：
 * - 合法提案结构：proposal_id / content / state_update_proposal / confidence；
 * - state_update_proposal 必须为空——LLM 不得写 ExperienceState、
 *   不得修改 State Version、不得写 Memory（S1 §17 禁止动作；CC02 H01/H05）；
 * - 不得出现结构外字段（伪造合法字段、额外字段、策略绕过一律拒绝）。
 *
 * 验证失败：Proposal → REJECT → bounded retry / fallback（S1 §18；
 * 不能无限 Retry——S1 §29：LLM schema 失败最多 1 次重试）。
 *
 * 治理约束：验证器是产品组件，规则来自契约冻结，不由模型自行裁决。
 */

export interface LlmProposal {
  proposal_id: string;
  content: string;
  state_update_proposal?: Record<string, unknown>;
  confidence: number;
  [key: string]: unknown;
}

export type ValidationResult =
  | { ok: true; proposal: LlmProposal }
  | {
      ok: false;
      /** LLM_SCHEMA_INVALID：结构不符合提案 schema（缺失/类型错误/额外字段）。 */
      code: 'LLM_SCHEMA_INVALID';
      reason: string;
    }
  | {
      ok: false;
      /** POLICY_REJECTED：提案尝试越权状态写入或策略绕过（S1 §17 禁止动作）。 */
      code: 'POLICY_REJECTED';
      reason: string;
    };

/** 提案结构的合法字段（S1 §16 LLM Response）。 */
const ALLOWED_PROPOSAL_FIELDS: ReadonlySet<string> = new Set([
  'proposal_id',
  'content',
  'state_update_proposal',
  'confidence',
]);

/**
 * 校验提案。
 * GS-06 负向案例（伪造合法字段 / 额外字段 / 嵌套状态变更 / 策略绕过）
 * 全部在本函数拒绝，且不产生任何状态写入。
 */
export function validateProposal(proposal: unknown): ValidationResult {
  if (typeof proposal !== 'object' || proposal === null || Array.isArray(proposal)) {
    return {
      ok: false,
      code: 'LLM_SCHEMA_INVALID',
      reason: 'proposal must be an object',
    };
  }
  const candidate = proposal as LlmProposal;

  // 结构检查：字段存在性与类型。
  if (typeof candidate.proposal_id !== 'string' || candidate.proposal_id.length === 0) {
    return {
      ok: false,
      code: 'LLM_SCHEMA_INVALID',
      reason: 'proposal_id must be a non-empty string',
    };
  }
  if (typeof candidate.content !== 'string') {
    return {
      ok: false,
      code: 'LLM_SCHEMA_INVALID',
      reason: 'content must be a string',
    };
  }
  if (typeof candidate.confidence !== 'number' || !Number.isFinite(candidate.confidence)) {
    return {
      ok: false,
      code: 'LLM_SCHEMA_INVALID',
      reason: 'confidence must be a finite number',
    };
  }
  if (candidate.confidence < 0 || candidate.confidence > 1) {
    return {
      ok: false,
      code: 'LLM_SCHEMA_INVALID',
      reason: 'confidence must be within [0, 1]',
    };
  }

  // 额外字段检查：结构外字段一律拒绝（策略绕过 / 伪造字段的载体）。
  for (const key of Object.keys(candidate)) {
    if (!ALLOWED_PROPOSAL_FIELDS.has(key)) {
      return {
        ok: false,
        code: 'LLM_SCHEMA_INVALID',
        reason: `unexpected proposal field: ${key} (policy bypass or forged field)`,
      };
    }
  }

  // 越权状态写入检查：state_update_proposal 出现任何键即为 LLM 尝试写状态
  // （含伪造合法字段与嵌套状态变更——任何键都拒绝，不解析其内容）。
  if (candidate.state_update_proposal !== undefined) {
    if (typeof candidate.state_update_proposal !== 'object' || candidate.state_update_proposal === null) {
      return {
        ok: false,
        code: 'LLM_SCHEMA_INVALID',
        reason: 'state_update_proposal must be an object when present',
      };
    }
    if (Object.keys(candidate.state_update_proposal).length > 0) {
      return {
        ok: false,
        code: 'POLICY_REJECTED',
        reason: 'llm_state_mutation_forbidden: state_update_proposal must be empty (S1 §17: LLM must not write ExperienceState)',
      };
    }
  }

  return { ok: true, proposal: candidate };
}
