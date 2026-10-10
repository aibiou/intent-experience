import {
  providerDefaultModel,
  providerPresetEndpoint,
  registeredProviders,
} from '../../../../src/experience/config-store';

/**
 * GET /api/config/profiles — 已验证提供方预设
 * （S5B-SEMANTIC-FREEZE-01 v1.1.0——预设非准入：
 * 任何 chat-completions 兼容提供方可自定义配置，无需登记；
 * 预设仅作表单自动填充与缺省回退——model-agnostic，
 * 产品代码不写死任何提供方）。
 */
export async function GET(): Promise<Response> {
  const providers = registeredProviders().map((provider) => ({
    provider,
    default_model: providerDefaultModel(provider),
    default_endpoint: providerPresetEndpoint(provider),
  }));
  return Response.json({ providers });
}

// 方法约束：本路由仅允许 GET。
export async function POST(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET'] }, { status: 405 });
}
