/**
 * GET /api/config/profiles — 已验证提供方预设（非准入清单——自定义配置无需登记）。
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
        endpoint: p.endpoint,
        defaultModel: p.defaultModel,
        temperature: p.temperature,
        systemPrompt: p.systemPrompt,
      } : {
        endpoint: providerPresetEndpoint(name) ?? '',
        defaultModel: providerDefaultModel(name) ?? '',
        temperature: DEFAULT_PROVIDER_TEMPERATURE,
        systemPrompt: DEFAULT_PROVIDER_SYSTEM_PROMPT,
      }),
    };
  });
  return Response.json({ profiles });
}
