/**
 * OpenAI 兼容请求/响应构造（纯逻辑——不发网络请求）。
 *
 * - 对外契约：网关接受 OpenAI 格式（system/user/assistant）。
 * - openai-compatible 提供方：messages 原样透传。
 * - z-ai-web-dev-sdk：该 SDK 用 'assistant' role 承载 system prompt
 *   （SDK 约定）——toZaiMessages 在 zai 分支内部做 system→assistant
 *   转换，转换不外泄到对外契约。
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ParsedChatRequest {
  messages: ChatMessage[];
  provider?: string; // 'zai' 或某条配置记录的 id；缺省 = 默认解析链
}

/** 发往 openai-compatible 端点的请求体形态。 */
export interface UpstreamChatRequestBody {
  model: string;
  messages: ChatMessage[];
  stream: false;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: 'assistant'; content: string };
  finish_reason: 'stop';
}

/** 网关对外的 chat.completion 响应形态（OpenAI 兼容）。 */
export interface ChatCompletionResponseBody {
  id: string; // "chatcmpl-"+随机
  object: 'chat.completion';
  created: number; // 秒级时间戳
  model: string; // 实际使用的模型名
  choices: ChatCompletionChoice[];
}

/** OpenAI 风格错误响应形态。 */
export interface ApiErrorBody {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/** openai-compatible 上游请求构造：messages 原样透传 + model + stream:false。 */
export function buildUpstreamRequestBody(
  model: string,
  messages: ChatMessage[],
): UpstreamChatRequestBody {
  return {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: false,
  };
}

/** 对外 chat.completion 响应构造。 */
export function buildChatCompletionResponse(
  model: string,
  content: string,
  now: number = Date.now(),
): ChatCompletionResponseBody {
  return {
    id: `chatcmpl-${crypto.randomUUID().replace(/-/g, '')}`,
    object: 'chat.completion',
    created: Math.floor(now / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
  };
}

/** OpenAI 风格错误响应构造。 */
export function buildApiErrorBody(message: string, type: string, code: string): ApiErrorBody {
  return { error: { message, type, code } };
}

/**
 * zai 分支消息转换：system → assistant（z-ai-web-dev-sdk 用
 * 'assistant' role 承载 system prompt 的约定）；user/assistant 原样。
 */
export function toZaiMessages(
  messages: ChatMessage[],
): Array<{ role: 'assistant' | 'user'; content: string }> {
  return messages.map((m) => ({
    role: m.role === 'system' ? ('assistant' as const) : m.role,
    content: m.content,
  }));
}

export type ChatRequestParseResult =
  | { ok: true; value: ParsedChatRequest }
  | { ok: false; message: string };

/** /v1/chat/completions 请求体校验（中文错误消息）。 */
export function parseChatRequest(body: unknown): ChatRequestParseResult {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: '请求体必须是 JSON 对象' };
  }
  const { messages, provider } = body as { messages?: unknown; provider?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, message: 'messages 必须是非空数组' };
  }
  const parsedMessages: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, message: `messages[${i}] 必须是包含 role 与 content 的对象` };
    }
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      return { ok: false, message: `messages[${i}].role 必须是 system / user / assistant` };
    }
    if (typeof content !== 'string') {
      return { ok: false, message: `messages[${i}].content 必须是字符串` };
    }
    parsedMessages.push({ role, content });
  }
  if (provider !== undefined && typeof provider !== 'string') {
    return { ok: false, message: 'provider 必须是字符串（"zai" 或配置记录 id）' };
  }
  const normalizedProvider =
    typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : undefined;
  return { ok: true, value: { messages: parsedMessages, provider: normalizedProvider } };
}
