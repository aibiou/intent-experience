import {
  providerDefaultModel,
  registeredProviders,
} from '../../../../src/experience/config-store';

/**
 * GET /api/config/profiles — 已登记提供方规则族
 * （S5A-SEMANTIC-FREEZE-01 §1 D-2——model-agnostic：
 * 配置面经此枚举可选提供方，产品代码不写死任何提供方）。
 */
export async function GET(): Promise<Response> {
  const providers = registeredProviders().map((provider) => ({
    provider,
    default_model: providerDefaultModel(provider),
  }));
  return Response.json({ providers });
}

// 方法约束：本路由仅允许 GET。
export async function POST(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET'] }, { status: 405 });
}
