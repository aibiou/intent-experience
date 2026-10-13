/**
 * LLM 网关（S1 切片）。
 *
 * 边界纪律（契约 GS-06 / CC02 H01/H05）：
 * - 网关只产出内容提案（LlmProposal：仅 text 字段）。
 * - 网关不接触数据库、不接触 ExperienceState、不接触策略——
 *   LLM 只提出候选结果，不拥有状态、策略或产品决策权。
 * - 网关失败时抛出 GatewayError；Runtime 决定如何呈现失败
 *   （诚实报错，不伪造内容）。
 */

import ZAI from 'z-ai-web-dev-sdk';
import type { LlmProposal } from './types';

export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  signal?: AbortSignal;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface LlmGateway {
  readonly name: string;
  generate(request: LlmRequest): Promise<LlmProposal>;
}

/**
 * z-ai-web-dev-sdk 实现（唯一真实提供方；后端专用）。
 * 有界重试：1 次（失败不无限重跑，不伪造内容）。
 */
export class ZaiLlmGateway implements LlmGateway {
  readonly name = 'zai-llm-gateway';

  private zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

  private async client() {
    if (!this.zai) {
      this.zai = await ZAI.create();
    }
    return this.zai;
  }

  async generate(request: LlmRequest): Promise<LlmProposal> {
    const messages = [
      { role: 'assistant' as const, content: request.systemPrompt },
      { role: 'user' as const, content: request.userPrompt },
    ];
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (request.signal?.aborted) {
          throw new GatewayError('生成已被取消', false);
        }
        const zai = await this.client();
        const completion = await zai.chat.completions.create({
          messages,
          thinking: { type: 'disabled' },
        });
        const text = completion.choices[0]?.message?.content;
        if (typeof text !== 'string' || text.trim().length === 0) {
          throw new GatewayError('模型返回了空内容', true);
        }
        return { text: text.trim() };
      } catch (error) {
        lastError = error;
        if (error instanceof GatewayError && !error.retryable) throw error;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
    throw new GatewayError(
      `生成失败：${lastError instanceof Error ? lastError.message : String(lastError)}`,
      true
    );
  }
}
