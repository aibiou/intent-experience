'use client';

/**
 * 模型网关设置面板（Screen 01 右上角入口；对齐参考仓库 /config 语义）。
 *
 * 对接独立模型网关 mini-service（端口 3031）：
 * - 浏览器请求一律走相对路径 + XTransformPort=3031（经网关转发）。
 * - 提供方配置（newapi 等 OpenAI 兼容端点）由网关统一存储，
 *   网页代码里不出现任何密钥明文（列表响应只有脱敏掩码）。
 * - 内置 zai 提供方开箱即用；自定义提供方配置后可设为默认。
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, PlugZap, Settings2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface ProviderSummary {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  modality: string;
  enabled: boolean;
  isDefault: boolean;
  apiKeyMasked: string;
  hasKey: boolean;
}

interface ProviderForm {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  modality: string;
  isDefault: boolean;
}

/** 模态（一条提供方记录只服务一个模态；默认按模态各自独立）。 */
const MODALITY_LABEL: Record<string, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  voice: '语音',
};

const EMPTY_FORM: ProviderForm = {
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  modality: 'text',
  isDefault: false,
};

/** 浏览器 → 网关：相对路径 + 端口参数（网关转发规则）。 */
function gwUrl(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}XTransformPort=3031`;
}

async function gwJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(gwUrl(path), init);
    const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!res.ok) {
      const message =
        (data as { error?: { message?: string } } | null)?.error?.message ?? `网关返回 ${res.status}`;
      return { ok: false, status: res.status, data: null, error: message };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `模型网关服务不可达（127.0.0.1:3031）：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState<string>('…');
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await gwJson<{ providers: ProviderSummary[]; count: number }>('/api/providers');
      if (list.ok && list.data) {
        setProviders(list.data.providers);
        // 从 providers 列表里找默认提供方名称（healthz 端点在 Next.js 下无 proxy 路由）
        const def = list.data.providers.find((p) => p.isDefault && p.enabled)
          ?? list.data.providers.find((p) => p.enabled);
        setDefaultProvider(def?.name ?? '未配置');
      } else {
        setDefaultProvider('不可达');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
          const trimmed: ProviderForm = {
            name: form.name.trim(),
            baseUrl: form.baseUrl.trim(),
            apiKey: form.apiKey.trim(),
            model: form.model.trim(),
            modality: form.modality,
            isDefault: form.isDefault,
          };
      if (!trimmed.name || !trimmed.baseUrl || !trimmed.apiKey || !trimmed.model) {
        toast({ description: '名称、接口地址、密钥、模型都要填。' });
        return;
      }
      setSaving(true);
      try {
        const result = await gwJson<{ provider: ProviderSummary }>('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed.name,
            kind: 'openai-compatible',
            baseUrl: trimmed.baseUrl,
            apiKey: trimmed.apiKey,
            model: trimmed.model,
            modality: trimmed.modality,
            enabled: true,
            isDefault: trimmed.isDefault,
          }),
        });
        if (!result.ok) {
          toast({ description: result.error ?? '保存失败，请检查输入。' });
          return;
        }
        toast({
          description: trimmed.isDefault
            ? `已保存「${trimmed.name}」并设为${MODALITY_LABEL[trimmed.modality] ?? trimmed.modality}模态默认提供方。`
            : `已保存「${trimmed.name}」（${MODALITY_LABEL[trimmed.modality] ?? trimmed.modality}模态）。`,
        });
        setForm(EMPTY_FORM);
        await refresh();
      } finally {
        setSaving(false);
      }
    },
    [form, refresh]
  );

  const handleDelete = useCallback(
    async (provider: ProviderSummary) => {
      const result = await gwJson(`/api/providers/${encodeURIComponent(provider.id)}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        toast({ description: result.error ?? '删除失败。' });
        return;
      }
      toast({ description: `已删除「${provider.name}」。` });
      await refresh();
    },
    [refresh]
  );

  const handleSetDefault = useCallback(
    async (provider: ProviderSummary) => {
      // 网关 upsert 语义：编辑时 apiKey 必填——设置默认仅改标志，
      // 密钥让用户重输不友好，因此这里提示后走表单路径。
      setForm({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: '',
        model: provider.model,
        modality: provider.modality,
        isDefault: true,
      });
      toast({
        description: `把「${provider.name}」的密钥再填一次即可设为${MODALITY_LABEL[provider.modality] ?? provider.modality}模态默认（编辑需要重输密钥）。`,
      });
    },
    []
  );

  const handleTest = useCallback(
    async (provider: ProviderSummary) => {
      setTestingId(provider.id);
      try {
        const result = await gwJson<{ ok: boolean; sample?: string; error?: string }>(
          `/api/providers/${encodeURIComponent(provider.id)}/test`,
          { method: 'POST' }
        );
        if (!result.ok) {
          toast({ description: result.error ?? '测试请求失败。' });
          return;
        }
        if (result.data?.ok) {
          toast({ description: `连通正常，模型回了：「${result.data.sample ?? ''}」` });
        } else {
          toast({ description: `连不通：${result.data?.error ?? '未知原因'}` });
        }
      } finally {
        setTestingId(null);
      }
    },
    []
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="模型网关设置"
          title="模型网关设置"
          className="absolute right-4 top-4 rounded-full text-stone-400 hover:text-stone-600"
        >
          <Settings2 className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>模型网关</DialogTitle>
          <DialogDescription>
            体验引擎的模型调用全部经本机网关（独立服务）。提供方按模态（文本/图像/视频/语音）
            分别配置、各有默认；密钥只保存在网关的本地文件里，不会出现在网页代码中。
          </DialogDescription>
        </DialogHeader>

        {/* 当前默认提供方 */}
        <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
          <div className="text-sm">
            <span className="text-stone-500">当前默认提供方：</span>
            <span className="ml-1 font-medium text-stone-800">{defaultProvider}</span>
            {defaultProvider === 'zai' && (
              <span className="ml-2 text-xs text-stone-400">（内置，开箱即用）</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '刷新'}
          </Button>
        </div>

        {/* 自定义提供方列表（newapi 等 OpenAI 兼容端点） */}
        {providers.length > 0 && (
          <section aria-label="自定义提供方" className="space-y-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-800">{p.name}</span>
                    <Badge variant="outline">{MODALITY_LABEL[p.modality] ?? p.modality}</Badge>
                    {p.isDefault && <Badge variant="secondary">默认</Badge>}
                    {!p.enabled && <Badge variant="outline">已停用</Badge>}
                  </div>
                  <div className="mt-1 truncate text-xs text-stone-500">
                    {p.model} · {p.baseUrl}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-400">密钥 {p.apiKeyMasked}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!p.isDefault && (
                    <Button variant="ghost" size="sm" onClick={() => void handleSetDefault(p)}>
                      设默认
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`测试 ${p.name} 连通性`}
                    title="测试连通"
                    onClick={() => void handleTest(p)}
                    disabled={testingId === p.id}
                  >
                    {testingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlugZap className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`删除 ${p.name}`}
                    title="删除"
                    className="text-stone-400 hover:text-red-600"
                    onClick={() => void handleDelete(p)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* 新增提供方表单 */}
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-dashed border-stone-300 p-4">
          <div className="text-sm font-medium text-stone-700">接入自定义提供方（OpenAI 兼容 / newapi）</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gw-name">名称</Label>
              <Input
                id="gw-name"
                placeholder="如 newapi"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gw-model">模型名</Label>
              <Input
                id="gw-model"
                placeholder="如 gpt-4o / deepseek-chat"
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gw-modality">模态（这条提供方服务什么）</Label>
              <Select
                value={form.modality}
                onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}
              >
                <SelectTrigger id="gw-modality" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">文本（对话）</SelectItem>
                  <SelectItem value="image">图像（画一张）</SelectItem>
                  <SelectItem value="video">视频</SelectItem>
                  <SelectItem value="voice">语音（读给我听）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gw-baseurl">接口地址（Base URL）</Label>
            <Input
              id="gw-baseurl"
              placeholder="https://你的网关域名/v1"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              maxLength={300}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gw-apikey">API 密钥</Label>
            <Input
              id="gw-apikey"
              type="password"
              placeholder="sk-…"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              maxLength={200}
            />
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="gw-default" className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
              <Switch
                id="gw-default"
                checked={form.isDefault}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
              />
              设为{MODALITY_LABEL[form.modality] ?? form.modality}模态默认
            </label>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
