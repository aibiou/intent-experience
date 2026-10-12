import {
  GENERATION_CALLS,
  humanizeGenerationFailure,
} from '../../../src/experience/generation-gateway';
import {
  getEnabledProviderConfigForModality,
  getProviderConfigById,
} from '../../../src/experience/config-store';
import type { ProviderModality } from '../../../src/experience/config-store';

/**
 * POST /api/generate —— 直接生成（创作工作台消费）。
 *
 * 请求：{ request_id, modality, prompt, model_id? }
 *   modality：image | voice | video（文本模态不经此
 *   路径——对话走体验流）
 *   model_id：指定配置 id（缺省为该模态当前启用
 *   配置）——指定时校验模态一致，防止跨模态误用。
 * 响应：application/x-ndjson
 *   progress 事件（0–100，视频异步任务透传）→
 *   completed（{ url } 或 { dataUri }）/ failed /
 *   unconfigured。
 */

const NDJSON_HEADERS = { 'Content-Type': 'application/x-ndjson' };
const GENERATION_MODALITIES: ReadonlyArray<'image' | 'voice' | 'video'> = [
  'image',
  'voice',
  'video',
];

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return jsonError(400, 'INVALID_REQUEST', 'body must be valid JSON');
  }
  const body = parsed as {
    request_id?: unknown;
    modality?: unknown;
    prompt?: unknown;
    model_id?: unknown;
    reference_images?: unknown;
  };
  if (typeof body.request_id !== 'string' || body.request_id.length === 0) {
    return jsonError(400, 'INVALID_REQUEST', 'request_id is required');
  }
  if (
    typeof body.modality !== 'string' ||
    !GENERATION_MODALITIES.includes(
      body.modality as 'image' | 'voice' | 'video',
    )
  ) {
    return jsonError(400, 'INVALID_MODALITY', 'modality must be image, voice or video');
  }
  if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    return jsonError(400, 'INVALID_PROMPT', 'prompt is required');
  }
  const modality = body.modality as 'image' | 'voice' | 'video';
  const prompt = body.prompt.trim();
  const modelId =
    typeof body.model_id === 'string' && body.model_id.length > 0
      ? body.model_id
      : undefined;

  const encoder = new TextEncoder();
  const body_stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      // 配置解析：指定模型优先（同模态校验），
      // 缺省走该模态当前启用配置。
      let config = null;
      try {
        if (modelId !== undefined) {
          const specific = await getProviderConfigById(modelId);
          if (specific !== null && specific.modality !== modality) {
            emit({ type: 'failed', modality, message: '所选模型与该生成模态不一致' });
            controller.close();
            return;
          }
          config = specific;
        } else {
          config = await getEnabledProviderConfigForModality(modality);
        }
      } catch {
        config = null;
      }
      if (config === null) {
        emit({
          type: 'unconfigured',
          modality,
          message: '该模态尚无启用模型——到模型配置添加并启用后再生成。',
        });
        controller.close();
        return;
      }
      const progressQueue: number[] = [];
      emit({ type: 'started', modality, prompt });
      try {
        // 参考图（图生图——dataURI 白名单校验，≤3 张）。
        const referenceImages = Array.isArray(body.reference_images)
          ? body.reference_images
              .filter(
                (item): item is string =>
                  typeof item === 'string' &&
                  item.startsWith('data:image/') &&
                  item.length <= 1_500_000,
              )
              .slice(0, 3)
          : undefined;
        const artifactPromise = GENERATION_CALLS[modality](
          config,
          prompt,
          (progress) => {
            progressQueue.push(progress);
          },
          {
            ...(referenceImages !== undefined && referenceImages.length > 0
              ? { referenceImages }
              : {}),
          },
        );
        // 进度随流输出（每 400ms drain——
        // 与体验流同一节奏）。
        for (;;) {
          while (progressQueue.length > 0) {
            const progress = progressQueue.shift();
            if (progress !== undefined) {
              emit({ type: 'progress', modality, progress });
            }
          }
          const settled = await Promise.race([
            artifactPromise.then(
              () => true,
              () => true,
            ),
            new Promise<boolean>((resolve) => {
              setTimeout(() => resolve(false), 400);
            }),
          ]);
          if (settled) break;
        }
        const artifact = await artifactPromise;
        emit({
          type: 'completed',
          modality,
          ...(artifact.url !== undefined ? { url: artifact.url } : {}),
          ...(artifact.dataUri !== undefined ? { dataUri: artifact.dataUri } : {}),
          mime: artifact.mime,
        });
      } catch (error) {
        // 失败文案与体验流同一人性化纪律
        // （humanizeGenerationFailure——主行可行动，
        // 提供方细节在尾部括注供前端拆为次行）。
        emit({
          type: 'failed',
          modality,
          message: humanizeGenerationFailure(error, modality),
        });
      }
      controller.close();
    },
  });
  return new Response(body_stream, { status: 200, headers: NDJSON_HEADERS });
}

export async function GET(): Promise<Response> {
  return jsonError(405, 'METHOD_NOT_ALLOWED', 'POST only');
}
