/**
 * GET /api/config/profiles — 已验证提供方预设（非准入清单——自定义配置无需登记）。
 *
 * 返回 endpoint / defaultModel 供表单预填；label / modality 供
 * 配置页「快捷接入」按模态归组展示。
 */

import {
  registeredProviders,
  providerDefaultModel,
  providerPresetEndpoint,
} from '@/experience/config-store';
import { PROVIDER_PROFILES, DEFAULT_PROVIDER_SYSTEM_PROMPT, DEFAULT_PROVIDER_TEMPERATURE } from '@/experience/llm-gateway';

export async function GET(): Promise<Response> {
  const profiles = registeredProviders().map((name) => {
    const p = PROVIDER_PROFILES[name];
    return {
      name,
      ...(p ? {
        label: p.label ?? name,
        modality: p.modality ?? 'text',
        endpoint: p.endpoint,
        defaultModel: p.defaultModel,
        temperature: p.temperature,
        systemPrompt: p.systemPrompt,
      } : {
        label: name,
        modality: 'text' as const,
        endpoint: providerPresetEndpoint(name) ?? '',
        defaultModel: providerDefaultModel(name) ?? '',
        temperature: DEFAULT_PROVIDER_TEMPERATURE,
        systemPrompt: DEFAULT_PROVIDER_SYSTEM_PROMPT,
      }),
    };
  });
  return Response.json({ profiles });
}
