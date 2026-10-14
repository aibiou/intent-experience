/**
 * GET /api/config/status — 运行模式状态（已启用提供方概要，不含 key 任何形态）。
 */

import { listProviderConfigs, PROVIDER_MODALITIES, type ProviderModality } from '@/experience/config-store';

export async function GET(): Promise<Response> {
  const configs = await listProviderConfigs();
  const byModality: Record<string, { enabled: boolean; provider: string; model: string; id: string } | null> = {};
  for (const m of PROVIDER_MODALITIES) {
    const modality = m as ProviderModality;
    const enabled = configs.find((c) => c.modality === modality && c.enabled);
    byModality[modality] = enabled
      ? { enabled: true, provider: enabled.provider, model: enabled.model, id: enabled.id }
      : null;
  }
  return Response.json({
    configs: configs.length,
    byModality,
    anyEnabled: configs.some((c) => c.enabled),
  });
}
