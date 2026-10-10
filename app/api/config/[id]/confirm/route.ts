import {
  confirmProviderPrivacy,
  listProviderConfigs,
  ConfigStoreError,
} from '../../../../../src/experience/config-store';

/**
 * POST /api/config/{id}/confirm — D-5 隐私再确认
 * （页面内启用确认流）。确认记录经通用模板签署
 * （PRIVACY-RECONFIRM-GENERIC/V1——提供方名称于
 * 签署时填写，不写死任何提供方——
 * S5A-SEMANTIC-FREEZE-01 v1.1.0）；确认人 =
 * 产品负责人 + 安全负责人双重身份（V1 本机单用户
 * 形态——D-4 访问控制）。确认前该提供方的配置
 * 不得启用。
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  const params = await context.params;
  let statement = '';
  try {
    const parsed = JSON.parse(await req.text()) as { statement?: unknown };
    if (typeof parsed.statement === 'string') {
      statement = parsed.statement;
    }
  } catch {
    // 无声明体时使用通用模板默认声明
  }
  try {
    const configs = await listProviderConfigs();
    const config = configs.find((candidate) => candidate.id === params.id);
    if (!config) {
      return Response.json(
        { code: 'CONFIG_NOT_FOUND', message: `provider config '${params.id}' not found` },
        { status: 404 },
      );
    }
    const confirmation = await confirmProviderPrivacy(
      params.id,
      statement.length > 0
        ? statement
        : `我已确认提供方 ${config.provider} 的数据处理条款（DPA）与已签署隐私六要素一致（存储：中国大陆（cn）/ 阿里云 / 云存储；加密：静态 + 传输两层、密钥分离；API key 仅以密文持久化，明文仅运行期内存持有）。`,
    );
    return Response.json({ confirmation });
  } catch (error) {
    if (error instanceof ConfigStoreError) {
      const status =
        error.code === 'CONFIG_NOT_FOUND'
          ? 404
          : error.code === 'CONFIG_STORE_CORRUPT' || error.code === 'CONFIG_CONFIRMATION_STORE_CORRUPT'
            ? 500
            : 400;
      return Response.json({ code: error.code, message: error.message }, { status });
    }
    return Response.json({ code: 'INTERNAL', message: 'internal error' }, { status: 500 });
  }
}

// 方法约束：本路由仅允许 POST。
export async function GET(): Promise<Response> {
  return Response.json({ error: 'METHOD_NOT_ALLOWED', allowed: ['POST'] }, { status: 405 });
}
