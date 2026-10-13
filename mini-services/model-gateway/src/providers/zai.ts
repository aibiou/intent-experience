/**
 * 内置 zai 提供方（z-ai-web-dev-sdk 适配）。
 *
 * 严格按 SDK 约定：
 * - const zai = await ZAI.create();  // 复用单例（ZAI.create 每次都重读
 *   .z-ai-config，进程内只建一次）
 * - zai.chat.completions.create({
 *     messages: [
 *       { role: 'assistant', content: systemPrompt },  // SDK 用 'assistant' role 承载 system prompt！
 *       { role: 'user', content: userPrompt },
 *     ],
 *     thinking: { type: 'disabled' },
 *   });
 * - 文本取 completion.choices[0].message.content
 *
 * role 转换：网关对外是 OpenAI 格式（system/user/assistant），
 * 本适配器内部经 toZaiMessages 把 system 转成 assistant（SDK 约定）。
 *
 * SDK 失败以普通 Error 抛出（"API request failed with status N: ..."），
 * 经 wrapZaiError 归一为 UpstreamHttpError 供重试分类。
 */

import ZAI from 'z-ai-web-dev-sdk';
import { toZaiMessages, type ChatMessage } from '../openai';
import {
  EmptyContentError,
  UpstreamHttpError,
  UpstreamNetworkError,
  extractUpstreamStatus,
} from '../retry';

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

interface ZaiCompletion {
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
}

const ZAI_CALL_TIMEOUT_MS = 60_000;

let zaiSingleton: ZaiClient | null = null;

/** 复用单例。 */
export async function getZaiClient(): Promise<ZaiClient> {
  if (!zaiSingleton) {
    zaiSingleton = await ZAI.create();
  }
  return zaiSingleton;
}

/** SDK 错误归一：携带上游状态的普通 Error → UpstreamHttpError（重试分类用）。 */
export function wrapZaiError(error: unknown): unknown {
  if (error instanceof Error) {
    const status = extractUpstreamStatus(error.message);
    if (status !== null) {
      return new UpstreamHttpError(status, error.message);
    }
  }
  return error;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new UpstreamNetworkError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface ZaiCallResult {
  content: string;
  model: string;
}

export async function callZai(messages: ChatMessage[]): Promise<ZaiCallResult> {
  const zai = await getZaiClient();
  let completion: ZaiCompletion;
  try {
    completion = (await withTimeout(
      zai.chat.completions.create({
        messages: toZaiMessages(messages),
        thinking: { type: 'disabled' },
      }),
      ZAI_CALL_TIMEOUT_MS,
      `请求超时（${ZAI_CALL_TIMEOUT_MS / 1000} 秒）`,
    )) as ZaiCompletion;
  } catch (error) {
    throw wrapZaiError(error);
  }
  const text = completion?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.length === 0) {
    throw new EmptyContentError();
  }
  const model =
    typeof completion.model === 'string' && completion.model.length > 0 ? completion.model : 'zai';
  return { content: text, model };
}
