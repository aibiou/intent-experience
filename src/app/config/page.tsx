'use client';

/**
 * 模型网关配置页面（/config）。
 *
 * 全页面布局——比弹窗空间大得多，按模态分组展示提供方，
 * 每个提供方卡片显示模型名、Base URL、密钥状态，
 * 可拉取上游最新模型列表并切换。
 *
 * 添加提供方时，填写 Base URL + 密钥后自动拉取上游 /v1/models，
 * 用户从下拉列表中选择模型，无需手输模型名。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Check, ChevronDown, Loader2, PlugZap, Plus,
  RefreshCw, Star, Trash2, X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

// ────────────────────────── 类型 ──────────────────────────

interface ProviderSummary {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  modality: string;
  enabled: boolean;
  isDefault: boolean;
  hasKey: boolean;
}

/** /api/config GET 原始返回格式（ProviderConfigSummary）。 */
interface ProviderConfigSummaryRaw {
  id: string;
  provider: string;
  model: string;
  endpoint: string;
  modality: string;
  enabled: boolean;
  providerConfirmed: boolean;
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

interface ProbeState {
  loading: boolean;
  models: string[];
  error: string | null;
}

// ────────────────────────── 常量 ──────────────────────────

const MODALITIES = ['text', 'image', 'video', 'voice'] as const;
type Modality = (typeof MODALITIES)[number];

const MODALITY_LABEL: Record<Modality, string> = {
  text: '文本对话',
  image: '图像生成',
  video: '视频生成',
  voice: '语音合成',
};

const MODALITY_ICON: Record<Modality, string> = {
  text: '💬', image: '🎨', video: '🎬', voice: '🔊',
};

const MODALITY_DESC: Record<Modality, string> = {
  text: '对话问答、文本生成',
  image: '文生图、图像创作',
  video: '文生视频、视频生成',
  voice: '文字转语音、朗读',
};

const EMPTY_FORM: ProviderForm = {
  name: '', baseUrl: '', apiKey: '', model: '', modality: 'text', isDefault: false,
};

const EMPTY_PROBE: ProbeState = { loading: false, models: [], error: null };

// ────────────────────────── 工具函数 ──────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const res = await fetch(path, init);
    const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string }; code?: string; message?: string }) | null;
    if (!res.ok) {
      const errorMsg =
        (data as { error?: { message?: string } } | null)?.error?.message ??
        (data as { message?: string } | null)?.message ??
        (data as { code?: string } | null)?.code ??
        `HTTP ${res.status}`;
      return { ok: false, data: null, error: errorMsg };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// ────────────────────────── 模型选择下拉器（带点击外部收起） ──────────────────────────

function ModelSelectDropdown({
  models, selected, onSelect, placeholder, disabled,
}: {
  models: string[];
  selected: string;
  onSelect: (m: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? 'font-mono' : 'text-stone-400'}>{selected || placeholder}</span>
        {models.length > 0 && (
          <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && models.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {models.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onSelect(m); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs hover:bg-stone-50 ${
                m === selected ? 'text-amber-700' : 'text-stone-600'
              }`}
            >
              <span className="truncate">{m}</span>
              {m === selected && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────── 提供方卡片 ──────────────────────────

function ProviderCard({
  provider, onTest, onDelete, onSetDefault, onRefreshModels, onUpdateModel,
  testing, refreshingModels, modelList, devMode,
}: {
  provider: ProviderSummary;
  onTest: (p: ProviderSummary) => void;
  onDelete: (p: ProviderSummary) => void;
  onSetDefault: (p: ProviderSummary) => void;
  onRefreshModels: (p: ProviderSummary) => void;
  onUpdateModel: (p: ProviderSummary, model: string) => void;
  testing: boolean;
  refreshingModels: boolean;
  modelList: string[];
  /** 开发者视图：关闭时隐藏 Base URL 等内部细节。 */
  devMode: boolean;
}) {
  const [showModels, setShowModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部收起模型下拉
  useEffect(() => {
    if (!showModels) return;
    function onDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowModels(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showModels]);

  return (
    <div className={`group relative rounded-xl border transition-colors ${
      provider.isDefault
        ? 'border-amber-300/60 bg-amber-50/30'
        : 'border-stone-200 bg-white hover:border-stone-300'
    }`}>
      {/* 卡片头部 */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {provider.isDefault && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />}
          <span className="font-medium text-stone-800">{provider.name}</span>
          {!provider.enabled && <Badge variant="outline" className="text-[10px] text-stone-400">停用</Badge>}
        </div>

        {/* 模型名——可点击展开选择 */}
        <div ref={dropdownRef} className="mt-2">
          <button
            type="button"
            onClick={() => setShowModels((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-sm text-stone-700 hover:bg-stone-100 disabled:cursor-default disabled:opacity-60"
            disabled={!provider.hasKey || modelList.length === 0}
            title={provider.hasKey ? '点击切换模型' : '需先配置密钥'}
          >
            {provider.model}
            {provider.hasKey && modelList.length > 0 && (
              <ChevronDown className={`h-3.5 w-3.5 text-stone-400 transition-transform ${showModels ? 'rotate-180' : ''}`} />
            )}
          </button>
        </div>

        {/* 模型下拉列表 */}
        {showModels && modelList.length > 0 && (
          <div className="mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-sm">
            {modelList.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onUpdateModel(provider, m); setShowModels(false); }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs hover:bg-stone-50 ${
                  m === provider.model ? 'text-amber-700' : 'text-stone-600'
                }`}
              >
                <span className="truncate">{m}</span>
                {m === provider.model && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* Base URL——开发者视图才显示（内部细节不向普通用户裸露） */}
        {devMode ? (
          <div className="mt-2 truncate text-xs text-stone-400">{provider.baseUrl}</div>
        ) : null}
      </div>

      {/* 卡片底部：密钥状态 + 操作 */}
      <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2">
        <div className="flex items-center gap-1 text-xs">
          {provider.hasKey ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-3.5 w-3.5" /> {devMode ? '已配置密钥' : '已连接'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-400">
              <X className="h-3.5 w-3.5" /> {devMode ? '未配置密钥' : '未连接'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {provider.hasKey && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onRefreshModels(provider)} disabled={refreshingModels} title="拉取上游模型列表">
              {refreshingModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              刷新模型
            </Button>
          )}
          {!provider.isDefault && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onSetDefault(provider)}>设默认</Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onTest(provider)} disabled={testing} title="测试连通">
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-stone-300 hover:text-red-500" onClick={() => onDelete(provider)} title="删除">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── 添加表单中的模型选择区域 ──────────────────────────

function ModelPicker({
  probe, selected, onSelect, onRetry,
}: {
  probe: ProbeState;
  selected: string;
  onSelect: (m: string) => void;
  onRetry: () => void;
}) {
  if (probe.loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 正在拉取模型列表…
      </div>
    );
  }
  if (probe.models.length > 0) {
    return (
      <ModelSelectDropdown
        models={probe.models}
        selected={selected}
        onSelect={onSelect}
        placeholder="选择模型"
      />
    );
  }
  // probe 失败或未触发：显示手动输入 + 重试
  return (
    <div className="space-y-2">
      {probe.error && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-amber-300/60 bg-amber-50/30 px-3 py-2 text-xs text-stone-500">
          <span className="truncate">拉取失败：{probe.error}</span>
          <button type="button" className="ml-auto shrink-0 text-stone-500 underline" onClick={onRetry}>重试</button>
        </div>
      )}
      <Input
        placeholder="手动输入模型名，如 seed-audio-1.0"
        value={selected}
        maxLength={100}
        onChange={(e) => onSelect(e.target.value)}
        className="font-mono text-sm"
      />
      {!probe.error && (
        <p className="text-xs text-stone-400">填写 Base URL 和密钥后自动拉取，也可直接手动输入模型名</p>
      )}
    </div>
  );
}

// ────────────────────────── 主页面 ──────────────────────────

export default function ConfigPage() {
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [probe, setProbe] = useState<ProbeState>(EMPTY_PROBE);
  /** 开发者视图：默认关闭——普通用户不被模型名/API 地址/密钥状态淹没。 */
  const [devMode, setDevMode] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ configs: ProviderConfigSummaryRaw[] }>('/api/config');
      if (result.ok && result.data) {
        const mapped: ProviderSummary[] = result.data.configs.map((c) => ({
          id: c.id,
          name: c.provider,
          baseUrl: c.endpoint,
          model: c.model,
          modality: c.modality,
          enabled: c.enabled,
          isDefault: c.enabled,
          hasKey: c.hasKey,
        }));
        setProviders(mapped);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const grouped = useMemo(() => {
    const map: Record<Modality, ProviderSummary[]> = { text: [], image: [], video: [], voice: [] };
    for (const p of providers) { if (p.modality in map) map[p.modality as Modality].push(p); }
    for (const mod of MODALITIES) {
      map[mod].sort((a, b) => (a.isDefault !== b.isDefault ? (a.isDefault ? -1 : 1) : a.name.localeCompare(b.name)));
    }
    return map;
  }, [providers]);

  const defaultSummary = useMemo(() => {
    return MODALITIES.map((mod) => {
      const def = grouped[mod].find((p) => p.isDefault && p.enabled);
      return def ? `${MODALITY_LABEL[mod]}: ${def.name}` : null;
    }).filter(Boolean).join(' · ');
  }, [grouped]);

  /** 用户向默认摘要：不含内部提供方名（模型层零打扰——2026-10-16）。 */
  const userSummary = useMemo(() => {
    const ready = MODALITIES.filter((mod) => grouped[mod].some((p) => p.isDefault && p.enabled));
    if (ready.length === 0) return '还没有可用的服务';
    return ready.map((mod) => MODALITY_LABEL[mod]).join(' · ');
  }, [grouped]);

  // ── 添加表单：自动拉取模型 ──

  const probeModels = useCallback(async (baseUrl: string, apiKey: string) => {
    setProbe({ loading: true, models: [], error: null });
    try {
      const r = await apiFetch<{ ok: boolean; models: string[]; count: number }>('/api/config/probe-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      if (!r.ok || !r.data?.ok) {
        setProbe({ loading: false, models: [], error: r.error ?? '拉取失败' });
        return;
      }
      setProbe({ loading: false, models: r.data.models, error: null });
    } catch {
      setProbe({ loading: false, models: [], error: '网络错误' });
    }
  }, []);

  // 当 baseUrl 和 apiKey 都填好时自动拉取（600ms 防抖）
  useEffect(() => {
    const trimmedUrl = form.baseUrl.trim();
    const trimmedKey = form.apiKey.trim();
    if (!trimmedUrl || !trimmedKey) {
      setProbe(EMPTY_PROBE);
      return;
    }
    const timer = setTimeout(() => { void probeModels(trimmedUrl, trimmedKey); }, 600);
    return () => clearTimeout(timer);
  }, [form.baseUrl, form.apiKey, probeModels]);

  // 切换 baseUrl 或 apiKey 时清空已选模型
  useEffect(() => {
    setForm((f) => (f.model && probe.models.length > 0 && !probe.models.includes(f.model) ? { ...f, model: '' } : f));
  }, [probe.models]);

  // ── 操作 ──

  const handleTest = useCallback(async (p: ProviderSummary) => {
    setTestingId(p.id);
    try {
      // 连通性测试经模型网关代理（/api/providers/:id/test）——
      // 测试即真实最小模型调用，属网关职责（主应用不直连上游）
      const r = await apiFetch<{ ok: boolean; sample?: string; error?: string }>(`/api/providers/${encodeURIComponent(p.id)}/test`, { method: 'POST' });
      if (!r.ok) { toast({ description: r.error ?? '测试失败' }); return; }
      if (r.data?.ok) toast({ description: `连通正常：${r.data.sample ?? ''}` });
      else toast({ description: `连不通：${r.data?.error ?? '未知'}` });
    } finally { setTestingId(null); }
  }, []);

  const handleDelete = useCallback(async (p: ProviderSummary) => {
    const r = await apiFetch(`/api/config/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    if (!r.ok) { toast({ description: r.error ?? '删除失败' }); return; }
    toast({ description: `已删除「${p.name}」` });
    setModelLists((prev) => { const next = { ...prev }; delete next[p.id]; return next; });
    await refresh();
  }, [refresh]);

  const handleSetDefault = useCallback(async (p: ProviderSummary) => {
    const r = await apiFetch<{ config: ProviderSummary }>(`/api/config/${encodeURIComponent(p.id)}/enable`, {
      method: 'POST',
    });
    if (!r.ok) {
      // 隐私未确认：自动确认后重试
      if (r.error && r.error.includes('PROVIDER_NOT_CONFIRMED')) {
        const cr = await apiFetch<{ confirmation: unknown }>(`/api/config/${encodeURIComponent(p.id)}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statement: '我确认已了解该提供方的数据隐私风险，同意启用。' }),
        });
        if (!cr.ok) {
          toast({ description: cr.error ?? '隐私确认失败' });
          return;
        }
        const r2 = await apiFetch<{ config: ProviderSummary }>(`/api/config/${encodeURIComponent(p.id)}/enable`, {
          method: 'POST',
        });
        if (!r2.ok) {
          toast({ description: r2.error ?? '启用失败' });
          return;
        }
        toast({ description: `已确认并启用「${p.name}」为${MODALITY_LABEL[p.modality as Modality]}默认` });
        await refresh();
        return;
      }
      toast({ description: r.error ?? '启用失败' });
      return;
    }
    toast({ description: `已启用「${p.name}」为${MODALITY_LABEL[p.modality as Modality]}默认` });
    await refresh();
  }, [refresh]);

  const handleRefreshModels = useCallback(async (p: ProviderSummary) => {
    setRefreshingId(p.id);
    try {
      const r = await apiFetch<{ ok: boolean; models: string[]; count: number }>(`/api/config/${encodeURIComponent(p.id)}/models`);
      if (!r.ok || !r.data?.ok) { toast({ description: r.error ?? '拉取模型失败' }); return; }
      setModelLists((prev) => ({ ...prev, [p.id]: r.data!.models }));
      toast({ description: `拉取到 ${r.data.models.length} 个模型` });
    } finally { setRefreshingId(null); }
  }, []);

  const handleUpdateModel = useCallback(async (p: ProviderSummary, model: string) => {
    const r = await apiFetch<{ config: ProviderSummary }>(`/api/config/${encodeURIComponent(p.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    if (!r.ok) { toast({ description: r.error ?? '更新模型失败' }); return; }
    toast({ description: `已切换到 ${model}` });
    await refresh();
  }, [refresh]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const trimmed: ProviderForm = { name: form.name.trim(), baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim(), modality: form.modality, isDefault: form.isDefault };
    if (!trimmed.name || !trimmed.baseUrl || !trimmed.apiKey) { toast({ description: '名称、地址、密钥都要填' }); return; }
    if (!trimmed.model) { toast({ description: '请选择或输入模型名' }); return; }
    setSaving(true);
    try {
      const r = await apiFetch<{ config: ProviderSummary }>('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: trimmed.name,
          endpoint: trimmed.baseUrl,
          api_key: trimmed.apiKey,
          model: trimmed.model,
          modality: trimmed.modality,
        }),
      });
      if (!r.ok) { toast({ description: r.error ?? '保存失败' }); return; }
      toast({ description: `已保存「${trimmed.name}」` });
      setForm(EMPTY_FORM); setShowAddForm(false); setProbe(EMPTY_PROBE);
      await refresh();
    } finally { setSaving(false); }
  }, [form, refresh]);

  const openAddForm = useCallback((mod?: Modality) => {
    setForm(mod ? { ...EMPTY_FORM, modality: mod } : EMPTY_FORM);
    setProbe(EMPTY_PROBE);
    setShowAddForm(true);
  }, []);

  const closeAddForm = useCallback(() => {
    setShowAddForm(false);
    setForm(EMPTY_FORM);
    setProbe(EMPTY_PROBE);
  }, []);

  return (
    <div className="min-h-dvh bg-[#faf9f7]">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-[#faf9f7]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-200/50 hover:text-stone-600" title="返回首页">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-medium text-stone-800">模型配置</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* 用户向说明（开发者视图关闭时）——模型层零打扰 */}
        {!devMode ? (
          <div className="mb-5 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500">
            这里管理背后提供 AI 能力的大模型服务。日常使用时不用关心——
            需要调整时打开「开发者视图」再操作。
          </div>
        ) : null}

        {/* 默认摘要 */}
        <div className="mb-6 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <div className="text-xs text-stone-400">当前可用</div>
          <div className="mt-1 text-sm font-medium text-stone-700">
            {devMode ? (defaultSummary || '未配置') : (userSummary || '未配置')}
          </div>
        </div>

        {/* 开发者视图开关 */}
        <div className="mb-6 flex items-center justify-end gap-2.5 border-t border-stone-200/70 pt-4">
          <label htmlFor="gw-dev" className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
            <Switch id="gw-dev" checked={devMode} onCheckedChange={setDevMode} />
            开发者视图（显示模型与接口详情）
          </label>
        </div>

        {/* 按模态分组 */}
        <div className="space-y-8">
          {MODALITIES.map((mod) => {
            const list = grouped[mod];
            return (
              <section key={mod}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl">{MODALITY_ICON[mod]}</span>
                  <h2 className="text-base font-semibold text-stone-800">{MODALITY_LABEL[mod]}</h2>
                  <span className="text-xs text-stone-400">{MODALITY_DESC[mod]}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">{list.length}</span>
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openAddForm(mod)}>
                      <Plus className="h-3.5 w-3.5" /> 添加
                    </Button>
                  </div>
                </div>

                {list.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">
                    尚未配置——点击上方"添加"
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((p) => (
                      <ProviderCard
                        key={p.id}
                        provider={p}
                        onTest={handleTest}
                        onDelete={handleDelete}
                        onSetDefault={handleSetDefault}
                        onRefreshModels={handleRefreshModels}
                        onUpdateModel={handleUpdateModel}
                        testing={testingId === p.id}
                        refreshingModels={refreshingId === p.id}
                        modelList={modelLists[p.id] ?? []}
                        devMode={devMode}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* 添加提供方 */}
        <div className="mt-8">
          {!showAddForm ? (
            <Button variant="outline" className="w-full border-dashed py-6" onClick={() => openAddForm()}>
              <Plus className="mr-2 h-5 w-5" />
              添加提供方
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-dashed border-stone-300 bg-white p-6">
              <div className="text-sm font-medium text-stone-700">
                接入新提供方（OpenAI 兼容）· {MODALITY_LABEL[form.modality as Modality] ?? form.modality}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gw-name" className="text-xs">名称</Label>
                  <Input id="gw-name" placeholder="如 newapi" value={form.name} maxLength={40}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gw-modality" className="text-xs">模态</Label>
                  <Select value={form.modality} onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}>
                    <SelectTrigger id="gw-modality"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODALITIES.map((mod) => (
                        <SelectItem key={mod} value={mod}>{MODALITY_ICON[mod]} {MODALITY_LABEL[mod]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gw-apikey" className="text-xs">API 密钥</Label>
                  <Input id="gw-apikey" type="password" placeholder="sk-…" value={form.apiKey} maxLength={200}
                    onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gw-baseurl" className="text-xs">Base URL</Label>
                  <Input id="gw-baseurl" placeholder="https://api.example.com/v1" value={form.baseUrl} maxLength={300}
                    onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} />
                </div>
              </div>
              {/* 模型选择：自动拉取，无需手输 */}
              <div className="space-y-1.5">
                <Label className="text-xs">模型</Label>
                <ModelPicker
                  probe={probe}
                  selected={form.model}
                  onSelect={(m) => setForm((f) => ({ ...f, model: m }))}
                  onRetry={() => void probeModels(form.baseUrl.trim(), form.apiKey.trim())}
                />
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="gw-default" className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
                  <Switch id="gw-default" checked={form.isDefault}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))} />
                  设为{MODALITY_LABEL[form.modality as Modality] ?? form.modality}默认
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={closeAddForm}>取消</Button>
                  <Button type="submit" size="sm" disabled={saving || probe.loading}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} 保存
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
