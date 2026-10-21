/**
 * 核心数据结构（S1 + S2a 切片；对齐 intent-experience C1 核心契约）。
 *
 * 纪律：
 * - 状态机视图（view）是 ExperienceState 的一部分，任何变更必须经
 *   state-machine.ts 的合法迁移表——禁用任意状态跳转（S1-04）。
 * - LlmProposal 只有内容字段：LLM 只提出候选内容，不拥有状态、策略
 *   或产品决策权（GS-06 由构造保证——该类型不可能携带状态变更）。
 *
 * S2a 扩展（F-2/F-4 域内嵌会话状态；D-02 轴外子状态机——阶段轴不变）：
 * - creation：创作域（会话内持久，D-03 选项 A）；
 * - simulation：分支域（会话内持久）；均随 ExperienceState JSON 持久化，
 *   写入仅经 Runtime 单一写入者 + commitTurn 版本守卫（比参考更严：
 *   域操作随轮次版本化，S1-12 每轮恰好 +1 保持）。
 */

import type { CreationObject } from './creation';
import type { SimulationDomainState } from './simulation';
import type { GenerationModality } from './generation-intent';

/** 创作域（会话内持久——G04；完成后历史保留至会话结束）。 */
export interface CreationDomain {
  creation: CreationObject;
  /** 会话内存活标记：完成/取代/终止后置 false（历史保留）。 */
  active: boolean;
  endedReason?: string; // completed | superseded_by_create | direction_changed | stopped_by_user
  /**
   * 各版本内容快照（index = version - 1；runtime 维护）。
   * RESTORE 恢复轮次的内容回填数据源（08 §28：新版本内容 = 目标
   * 历史版本内容）——真实 LLM 适配下唯一确定性回填来源。
   */
  contentHistory: string[];
}

/** 分支域初始空态。 */
export function initialSimulationDomain(): SimulationDomainState {
  return { rounds: [], branches: [], currentBranchId: null, roundCounter: 0, branchCounter: 0 };
}

export type ExperienceStatus = 'ENTERING' | 'READY' | 'ACTIVE' | 'WAITING' | 'COMPLETED';

export type ExperienceStage =
  | 'CURIOSITY'
  | 'UNDERSTANDING'
  | 'SIMULATION'
  | 'CREATION'
  | 'COMPLETION';

export interface ExperienceView {
  status: ExperienceStatus;
  stage: ExperienceStage;
}

/** LLM 内容提案——结构上不可能携带状态写入（GS-06 构造保证）。 */
export interface LlmProposal {
  text: string;
}

export type TurnKind =
  | 'FIRST_LAYER'
  | 'ANSWER'
  | 'EXPLANATION'
  | 'SIMULATION_RESULT'
  | 'CORRECTION_EXPLAIN'
  // S2a：创作域（G04 完整 Creation 语义）
  | 'CREATION_PREVIEW' // 最小可玩物首建预览
  | 'CREATION_PATCHED' // 补丁应用后的新版本预览（多轮循环）
  | 'CREATION_COMPLETED' // 创作完成（经 STOP 路径登记，D-05）
  | 'CREATION_ASK' // 歧义输入的至多一个澄清问题（08 §16 ASK 纪律）
  // S2a：分支域（WHAT_IF 完整分支）
  | 'BRANCH_NOTICE' // SWITCH/ABANDON/RETURN/ADOPT_BRANCH 确定性注记
  // S2a：记忆域（Minimal Memory）
  | 'MEMORY_NOTICE'; // 撤回/纠正的确定性注记

export interface TurnRecord {
  turn: number;
  semanticAction: string;
  policyAction: string;
  userText: string;
  kind: TurnKind;
  content: string;
  at: string; // ISO 时间戳
}

/** ExperienceState——Runtime 单一写入者维护的完整产品状态。 */
export interface ExperienceState {
  view: ExperienceView;
  experienceId: string; // 目录种子 id 或 'custom'
  topic: string;
  turn: number;
  goal: { primary: 'understand'; satisfaction: number };
  knowledge: { confirmed: string[]; inferred: string[] };
  userModel: { questions: string[]; hypotheses: string[]; corrections: string[] };
  variables: Record<string, number | string>;
  history: TurnRecord[];
  completion: { done: boolean; exitReason: string | null };
  // S2a 轴外域（阶段轴不变，D-02）
  creation: CreationDomain | null; // 创作域（无创作时 null）
  /**
   * 已被取代的创作域（DEFECT-CREATION-001：取代 ≠ 丢弃）。
   * 按取代顺序追加、最多保留最近 20 个；每个含自己的 contentHistory，
   * 因此用户此前的作品与版本在会话回看中仍可追溯。
   * 旧会话快照无此字段——读取侧一律 `?? []` 兜底。
   */
  creationHistory?: CreationDomain[];
  simulation: SimulationDomainState; // 分支域（结构恒在，空态起步）
}

/** 体验流事件（SSE 载荷）——Route 层透传给前端。 */
export type TurnEvent =
  | { type: 'session'; sessionId: string; stateVersion: number; view: ExperienceView; topic: string }
  | {
      type: 'trace';
      turn: number;
      semanticAction: string;
      policyAction: string;
      fromVersion: number;
    }
  | { type: 'content'; turn: number; kind: TurnKind | 'ESCALATION_NOTICE' | 'BOUNDARY_NOTICE'; text: string; stateVersion: number }
  /**
   * 流式增量（只用于呈现，不进入状态）。
   *
   * 与 content 的关系：content_delta 先到（可能很多条），定稿的 content
   * 后到并用完整文本替换它。验证器只作用于完整文本——若校验失败，
   * 服务端发 content_discard，前端把已显示的字撤掉。
   */
  | { type: 'content_delta'; turn: number; text: string }
  /** 撤回某一轮的流式增量（校验失败 / 生成中断）。 */
  | { type: 'content_discard'; turn: number }
  | {
      type: 'state';
      stateVersion: number;
      view: ExperienceView;
      state: ExperienceState;
    }
  // S2b 媒体生成切片：对话回应照常进行，媒体产物随流追加——
  // 事件出现在 content/state 之后、done 之前（生成不改变会话状态；
  // 失败不回滚轮次，媒体是体验产物而非产品状态）。
  | {
      type: 'generation';
      status: 'completed';
      turn: number;
      modality: GenerationModality;
      urls: string[];
      url: string;
      promptUsed: string;
      mime: string;
      /** G1.1 图像→视频：是否要求以既有图像为参考 / 提供方是否真正消费
       * （false 表示按画面描述降级——UI 如实说明，不假装参考生效）。 */
      referenceRequested?: boolean;
      referenceApplied?: boolean;
      referenceSource?: string;
    }
  | {
      type: 'generation';
      status: 'started';
      turn: number;
      modality: GenerationModality;
      prompt: string;
      /** G1.1：视频接续既有图像时，等待态可如实显示来源画面。 */
      referenceSource?: string;
    }
  | {
      type: 'generation';
      status: 'failed';
      turn: number;
      modality: GenerationModality;
      message: string;
    }
  | { type: 'done'; stateVersion: number; ended: boolean; exitReason: string | null }
  | { type: 'error'; code: TurnErrorCode; message: string };

export type TurnErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_COMPLETED'
  | 'VERSION_CONFLICT'
  | 'INVALID_INPUT'
  | 'LLM_GATEWAY_ERROR'
  | 'LLM_PROPOSAL_INVALID';

/** 会话摘要（首页"最近探索"用）。 */
export interface SessionSummary {
  id: string;
  topic: string;
  seedId: string | null;
  status: string;
  exitReason: string | null;
  view: ExperienceView;
  turn: number;
  updatedAt: string;
}
