/**
 * 框架无关的请求处理：把语义动作请求转换为 NDJSON 流式响应。
 *
 * Route Handler（app/api/experience/stream/route.ts）仅做薄封装，
 * 使同一代码路径可在两种形态执行：
 * - 进程内形态：证据执行器直接调用本函数（注入内存审计汇与合成 Request 等价输入）。
 * - HTTP 形态：Next.js 运行时经 Route Handler 调用本函数（request.signal 为客户端断开信号）。
 *
 * S3b（D-3 选项 A——S3-SCOPE-PROPOSAL-01 v1.0.0 / S3B-SEMANTIC-FREEZE-01
 * v1.0.0 §3 变更 4：既有端点 semanticAction 枚举扩展——纯暴露层）：
 * 两种请求形态：
 * - S1 形态（向后兼容）：{ semanticAction }——合成语料 fixture 流式
 *   输出（既有路径，行为不变）。
 * - S2/S3 形态：{ request_id, session_id, user_input, experience_id?,
 *   state_version?, semantic_action? }——经同一 ExperienceRuntime
 *   单例执行真实运行路径（resolveIntent → startExperience →
 *   submitExperienceEvent）：WHAT_IF 分支操作经用户输入负载携带
 *   分支操作词（/采用/、/切换/、/放弃/、/返回主线/——词表优先级
 *   RETURN > SWITCH > ABANDON > ADOPT_BRANCH，与进程内识别完全
 *   一致）；创作域顶层动作（deepen / simplify / reframe）经创作
 *   会话路由承载；CORRECTION / RESTORE_PREVIOUS_VERSION 经既有
 *   纠正路径；记忆 WITHDRAW / CORRECT 与长期记忆显式表达
 *   （S3a D-1——"记住我喜欢…"等 A/B 类显式表达）经既有记忆
 *   事件路径（记忆操作结果经 NDJSON 响应行返回）；跨会话分支
 *   操作（S3a D-2——新会话对已结束会话的持久分支记录显式
 *   操作）经既有事件提交路径（experience_id + state_version
 *   定位持久体验）。
 * 暴露层不变量：API 面扩展不改变任何运行时语义、决策追踪、
 * 事件契约——同一运行时实例（默认 getServerRuntime() 单例；
 * 证据形态经 options.runtime 注入构造的运行时，进程内证据
 * 不经服务器单例）。
 */

import { resolvePolicy } from './policy';
import { loadChunkFixture, type ChunkFixture, type ChunkResolution } from './chunks';
import { createExperienceStream, type StreamEvent } from './stream';
import { classifyInput } from './classifier';
import { getServerRuntime } from './server-runtime';
import { recognizeGenerationIntent, type GenerationModality } from './generation-intent';
import {
  GENERATION_CALLS,
  GenerationError,
} from './generation-gateway';
import { getEnabledProviderConfigForModality } from './config-store';
import type { ExperienceRuntime, RuntimeError, SubmissionResult } from './runtime';
import type { AuditSink } from './audit';

export interface StreamRequestInput {
  method: string;
  body: string;
  signal?: AbortSignal;
  audit?: AuditSink;
  /** 运行时实例注入（S3b——证据形态注入构造的运行时；缺省为服务器单例）。 */
  runtime?: ExperienceRuntime;
}

export interface HandlerResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NDJSON_HEADERS = { 'Content-Type': 'application/x-ndjson' };

function jsonResponse(status: number, payload: Record<string, unknown>): HandlerResult {
  return {
    status,
    headers: JSON_HEADERS,
    body: new Blob([JSON.stringify(payload)]).stream(),
  };
}

/** NDJSON 流式响应（S3b——运行时执行结果流：submission 首行 + chunk / done / stopped / cancelled + state_updated）。 */
function ndjsonResponse(stream: AsyncGenerator<unknown>): HandlerResult {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  return { status: 200, headers: NDJSON_HEADERS, body };
}

/**
 * 生成编排（产品负责人指令 2026-10-10：问答过程中识别
 * 生成意图，自动调用相应模态模型）。
 *
 * 编排层——不触碰策略语义（policy_v2.3.0 不变）：对话
 * 事件原样透传；流末（done 之后）经确定性规则识别的
 * 生成意图触发对应模态模型调用，产物以 generation 事件
 * 随同一 NDJSON 流呈现。
 *
 * 事件形态：
 * - started：生成开始（呈现层占位）
 * - completed：{ url } 或 { dataUri }（远程 / 内联产物）
 * - unconfigured：该模态尚无启用模型（引导去配置）
 * - failed：提供方调用失败（错误信息不含 key）
 */
async function* withGeneration(
  source: AsyncGenerator<unknown>,
  intent: { modality: GenerationModality; prompt: string },
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  let ended = false;
  for await (const event of source) {
    yield event;
    if ((event as { type?: string }).type === 'done') ended = true;
  }
  // 流末（done 之后）触发生成——对话回应先完整呈现。
  if (!ended || signal?.aborted) return;
    const at = new Date().toISOString();
    yield { type: 'generation', status: 'started', modality: intent.modality, prompt: intent.prompt, at };
    try {
      const config = await getEnabledProviderConfigForModality(intent.modality);
      if (!config) {
        yield {
          type: 'generation',
          status: 'unconfigured',
          modality: intent.modality,
          message: `尚未启用${intent.modality === 'image' ? '图像' : intent.modality === 'video' ? '视频' : '语音'}模型——到模型配置添加并启用后，再说一次即可生成。`,
          at: new Date().toISOString(),
        };
        return;
      }
      const artifact = await GENERATION_CALLS[intent.modality](config, intent.prompt);
      yield {
        type: 'generation',
        status: 'completed',
        modality: intent.modality,
        ...(artifact.url !== undefined ? { url: artifact.url } : {}),
        ...(artifact.dataUri !== undefined ? { dataUri: artifact.dataUri } : {}),
        mime: artifact.mime,
        at: new Date().toISOString(),
      };
    } catch (error) {
      const message =
        error instanceof GenerationError
          ? error.message
          : `generation failed (modality=${intent.modality})`;
      yield { type: 'generation', status: 'failed', modality: intent.modality, message, at: new Date().toISOString() };
    }
}

/** 运行时错误 → JSON 错误响应（与 Route Handler 错误形态一致）。 */
function runtimeErrorResponse(error: RuntimeError): HandlerResult {
  return jsonResponse(error.status, {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.details ? { details: error.details } : {}),
  });
}

/**
 * S2/S3 执行形态（S3b——纯暴露层）：经同一运行时实例执行
 * 真实运行路径。experience_id + state_version 定位既有
 * 体验（跨会话分支操作 / 续轮提交）；缺省时经
 * resolveIntent → startExperience 建立新体验并提交首轮。
 */
async function handleExecutionForm(
  body: {
    request_id?: unknown;
    session_id?: unknown;
    user_input?: unknown;
    experience_id?: unknown;
    state_version?: unknown;
    semantic_action?: unknown;
  },
  input: StreamRequestInput,
): Promise<HandlerResult> {
  const runtime = input.runtime ?? getServerRuntime();
  const requestId =
    typeof body.request_id === 'string' && body.request_id.length > 0 ? body.request_id : null;
  const sessionId =
    typeof body.session_id === 'string' && body.session_id.length > 0 ? body.session_id : null;
  const userInput =
    typeof body.user_input === 'string' && body.user_input.length > 0 ? body.user_input : null;
  if (requestId === null || sessionId === null || userInput === null) {
    return jsonResponse(400, {
      error: 'INVALID_REQUEST',
      reason: 'request_id, session_id and user_input are required non-empty strings',
    });
  }
  const experienceId =
    typeof body.experience_id === 'string' && body.experience_id.length > 0 ? body.experience_id : null;
  const stateVersion =
    typeof body.state_version === 'number' && Number.isInteger(body.state_version) ? body.state_version : null;
  const declaredAction =
    typeof body.semantic_action === 'string' && body.semantic_action.length > 0 ? body.semantic_action : null;

  // 既有体验提交（含跨会话分支操作——S3a D-2：新会话经
  // experience_id + state_version 对持久分支记录显式操作，
  // 会话绑定放宽仅限分支操作路径——运行时内校验）。
  if (experienceId !== null && stateVersion !== null) {
    const classification = classifyInput(userInput);
    const generation = recognizeGenerationIntent(userInput);
    // 生成意图确定性路由（暴露层——与记忆操作同一
    // 纪律）：语义动作词表未命中且生成意图命中时，
    // 确定性路由为 CREATE（创作族——「画 / 生成 /
    // 制作」是创作表达；不发明新语义动作，
    // policy_v2.3.0 词汇表不变）。
    const semanticAction =
      declaredAction ??
      (classification.semanticAction !== 'UNKNOWN'
        ? classification.semanticAction
        : generation !== null
          ? 'CREATE'
          : null);
    if (semanticAction === null) {
      return jsonResponse(400, {
        error: 'INVALID_ACTION',
        reason: 'unclassifiable input: escalated per authorization §5.7 (unknown situations escalate, never LLM-decided)',
      });
    }
    const submission: SubmissionResult = await runtime.submitExperienceEvent({
      experienceId,
      sessionId,
      semanticAction,
      rawInput: userInput,
      expectedStateVersion: stateVersion,
      requestId,
      signal: input.signal,
    });
    if (!submission.ok) {
      return runtimeErrorResponse(submission.error);
    }
    return ndjsonResponse(
      generation
        ? withGeneration(submission.stream, generation, input.signal)
        : submission.stream,
    );
  }

  // 新体验流程：意图解析（分类权威——分支操作词 / 记忆操作 /
  // 长期记忆显式表达均在解析阶段确定性识别）。
  const resolution = await runtime.resolveIntent({
    sessionId,
    rawInput: userInput,
    requestId: `${requestId}#intent`,
  });
  if (!resolution.ok) {
    return runtimeErrorResponse(resolution.error);
  }

  // 记忆操作（WITHDRAW / CORRECT / 长期记忆显式表达写入
  // ——S3a D-1）：无体验轴动作——NDJSON 单行结果 + done。
  if (resolution.action === 'memory_operation') {
    const encoder = new TextEncoder();
    const result = resolution;
    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: 'submission',
              accepted: true,
              session_id: sessionId,
              request_id: requestId,
              intent_id: result.intent.intentId,
              memory_operation: result.memoryOperation ?? null,
              at: new Date().toISOString(),
            })}\n`,
          ),
        );
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'done', at: new Date().toISOString() })}\n`));
        controller.close();
      },
    });
    return { status: 200, headers: NDJSON_HEADERS, body: streamBody };
  }

  // 生成意图（确定性规则识别——运行时意图解析
  // 已将分类未命中的生成输入确定性路由为 CREATE
  // 创作体验——与 WHAT_IF 首轮自动 CREATE 同一
  // 先例，不发明语义动作）。
  const generation = recognizeGenerationIntent(userInput);

  // 升级拒绝（UNKNOWN——未知情况升级而非由系统
  // 决定）。
  if (resolution.action === 'escalate') {
    return jsonResponse(400, {
      error: 'INVALID_ACTION',
      reason: 'unclassifiable input: escalated per authorization §5.7 (unknown situations escalate, never LLM-decided)',
    });
  }

  // 体验建立 + 首轮提交（创作会话路由 / WHAT_IF 首轮自动
  // CREATE 分支——与进程内路径完全一致）。
  const started = await runtime.startExperience({
    sessionId,
    intentId: resolution.intent.intentId,
    requestId: `${requestId}#experience`,
  });
  if (!started.ok) {
    return runtimeErrorResponse(started.error);
  }
  const routedSemanticAction =
    declaredAction ?? resolution.semanticAction;
  const submission: SubmissionResult = await runtime.submitExperienceEvent({
    experienceId: started.experienceId,
    sessionId,
    semanticAction: routedSemanticAction,
    rawInput: userInput,
    expectedStateVersion: started.stateVersion,
    requestId: `${requestId}#event`,
    signal: input.signal,
  });
  if (!submission.ok) {
    return runtimeErrorResponse(submission.error);
  }
  return ndjsonResponse(
    generation
      ? withGeneration(submission.stream, generation, input.signal)
      : submission.stream,
  );
}

export async function handleExperienceStreamRequest(
  input: StreamRequestInput,
): Promise<HandlerResult> {
  if (input.method !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body);
  } catch {
    return jsonResponse(400, { error: 'INVALID_JSON_BODY' });
  }

  const body = parsed as {
    semanticAction?: unknown;
    request_id?: unknown;
    session_id?: unknown;
    user_input?: unknown;
    experience_id?: unknown;
    state_version?: unknown;
    semantic_action?: unknown;
  };

  // S2/S3 执行形态判定（S3b）：会话上下文三要素齐备
  // （request_id + session_id + user_input）→ 运行时执行
  // 路径；否则为 S1 fixture 形态（semanticAction 直送）。
  const executionForm =
    typeof body.request_id === 'string' &&
    body.request_id.length > 0 &&
    typeof body.session_id === 'string' &&
    body.session_id.length > 0 &&
    typeof body.user_input === 'string' &&
    body.user_input.length > 0;
  if (executionForm) {
    return handleExecutionForm(body, input);
  }

  const semanticAction = body.semanticAction;
  if (typeof semanticAction !== 'string' || semanticAction.length === 0) {
    return jsonResponse(400, { error: 'MISSING_SEMANTIC_ACTION' });
  }

  const policy = resolvePolicy(semanticAction);
  if (!policy.ok) {
    return jsonResponse(400, {
      error: policy.code,
      semanticAction,
      reason: 'action is not in the S1 frozen policy set; undefined semantics are escalated, not implemented',
    });
  }

  // 策略 STOP（S1 硬边界）立即终止，无内容分块，不需要内容语料。
  // 语义空缺（C3 G-1…G-7）不在此补写：冻结表之外的动作已在上方拒绝。
  const stopFixture: ChunkFixture = {
    fixtureId: 'synthetic/stop/v1',
    semanticAction: policy.semanticAction,
    policyAction: 'STOP',
    chunks: [],
  };
  const fixtureResolution: ChunkResolution =
    policy.policyAction === 'STOP'
      ? { ok: true, fixture: stopFixture }
      : loadChunkFixture(policy.semanticAction);
  if (!fixtureResolution.ok) {
    return jsonResponse(500, { error: fixtureResolution.code, semanticAction });
  }
  const fixture = fixtureResolution.fixture;

  const encoder = new TextEncoder();
  const audit = input.audit;
  const signal = input.signal;

  const streamBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of createExperienceStream({
          semanticAction: policy.semanticAction,
          policyAction: policy.policyAction,
          fixtureId: fixture.fixtureId,
          chunks: fixture.chunks,
          signal,
          chunkDelayMs: 40,
          audit,
        })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });

  return {
    status: 200,
    headers: NDJSON_HEADERS,
    body: streamBody,
  };
}
