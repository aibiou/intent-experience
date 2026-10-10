import {
  getEnabledProviderConfig,
  hasEnabledPersistedConfigSync,
} from '../../../../src/experience/config-store';

/**
 * GET /api/config/status — 运行模式状态（合成演示 /
 * 已启用提供方）。不含 key 任何形态——仅 provider /
 * model 标识（用户面透明度：用户应知道当前回应
 * 来自合成演示还是自己配置的模型）。
 */
export async function GET(): Promise<Response> {
  try {
    if (hasEnabledPersistedConfigSync()) {
      const config = await getEnabledProviderConfig();
      if (config) {
        return Response.json({ mode: 'provider', provider: config.provider, model: config.model });
      }
    }
    return Response.json({ mode: 'synthetic' });
  } catch {
    return Response.json({ mode: 'synthetic', error: 'CONFIG_STORE_UNREADABLE' });
  }
}

// 方法约束：本路由仅允许 GET。
export async function POST(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['GET'] }, { status: 405 });
}
