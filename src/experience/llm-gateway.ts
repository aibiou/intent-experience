/**
 * LLM 网关（S1-07；S1 规范 §16/§17）。
 *
 * LLM Request 必须结构化（§16）；LLM Response 必须是 Proposal（§16）。
 * LLM 禁止动作（§17）：不得写 ExperienceState / 决定 STOP 或 CHANGE 是否
 * 有效 / 修改 Policy / 写 Memory / 决定 Completion / 自动启动下一体验 /
 * 修改 State Version / 写 Analytics Truth。
 *
 * 治理约束（ADR-0002 §3 边界在实施阶段持续有效）：
 * - 合成模式：网关从合成语料 fixture 生成提案，不调用任何真实 LLM
 *   提供方；真实提供方接入须另经产品决策与隐私六要素批准。
 * - 网关接口是证据注入点：GS-06 证据（进程内形态）经同一接口注入
 *   带越权 state_update 的脚本化提案，验证真实验证器与运行时拒绝路径。
 */

import type { PolicyAction, SemanticAction } from './policy';
import type { ChunkFixture } from './chunks';

export interface LlmRequest {
  request_id: string;
  session_id: string;
  experience_id: string;
  intent: unknown;
  experience_state: unknown;
  semantic_action: SemanticAction;
  allowed_action: PolicyAction;
  context: unknown;
}

export interface LlmProposal {
  proposal_id: string;
  content: string;
  state_update_proposal: Record<string, unknown>;
  confidence: number;
}

export interface LlmGateway {
  propose(request: LlmRequest): Promise<LlmProposal>;
}

let proposalCounter = 0;

/**
 * 合成网关：按语义动作返回合成语料提案。
 * state_update_proposal 恒为空对象——合成模式下模型从不提案状态写入
 * （越权提案只能经证据注入的脚本化网关产生，以测试拒绝路径）。
 */
export class SyntheticLlmGateway implements LlmGateway {
  private readonly fixtures: Readonly<Record<string, ChunkFixture>>;

  constructor(fixtures: Readonly<Record<string, ChunkFixture>>) {
    this.fixtures = fixtures;
  }

  async propose(request: LlmRequest): Promise<LlmProposal> {
    const fixture = this.fixtures[request.semantic_action];
    if (!fixture) {
      // 调用方（运行时）已在策略层拒绝表外动作；此处为防御性兜底。
      throw new Error(`no synthetic fixture for semantic action: ${request.semantic_action}`);
    }
    proposalCounter += 1;
    return {
      proposal_id: `proposal_synthetic_${String(proposalCounter).padStart(4, '0')}`,
      content: fixture.chunks.join(''),
      state_update_proposal: {},
      confidence: 1,
    };
  }
}
