'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  CheckIcon,
  KeyIcon,
  RefreshIcon,
  ShieldIcon,
  TrashIcon,
  XIcon,
} from '../_components/icons';

interface ProviderConfig {
  id: string;
  provider: string;
  model: string;
  endpoint: string;
  modality?: Modality;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  providerConfirmed: boolean;
  hasKey: true;
}

type Modality = 'text' | 'voice' | 'image' | 'video';

const MODALITIES: { id: Modality; label: string; hint: string }[] = [
  { id: 'text', label: '文本', hint: '对话回应' },
  { id: 'voice', label: '语音', hint: '朗读生成' },
  { id: 'image', label: '图像', hint: '绘画生成' },
  { id: 'video', label: '视频', hint: '视频生成' },
];

const MODALITY_LABEL: Record<Modality, string> = {
  text: '文本',
  voice: '语音',
  image: '图像',
  video: '视频',
};

interface ProviderProfile {
  provider: string;
  default_model: string;
  default_endpoint?: string;
}

interface ConfigStatus {
  mode: 'synthetic' | 'provider';
  provider?: string;
  model?: string;
}

const defaultConfirmStatement = (provider: string) =>
  `我已确认提供方 ${provider} 的数据处理条款（DPA）与已签署隐私六要素一致：存储位置中国大陆（cn）/ 阿里云 / 云存储；加密为静态 + 传输两层机制、密钥分离；API key 仅以密文持久化，明文仅运行期内存持有，不进日志与证据产物。`;

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** 模型模态识别（确定性规则——按模型名关键词归入
 * 文本 / 语音 / 图像 / 视频四类；未命中归文本）。 */
function categorizeModels(
  models: string[],
): Array<{ modality: Modality; label: string; items: string[] }> {
  const groups: Array<{ modality: Modality; label: string; items: string[] }> = [
    { modality: 'text', label: '文本模型', items: [] },
    { modality: 'voice', label: '语音模型', items: [] },
    { modality: 'image', label: '图像模型', items: [] },
    { modality: 'video', label: '视频模型', items: [] },
  ];
  for (const entry of models) {
    const lower = entry.toLowerCase();
    if (
      lower.includes('video') || lower.includes('vid') ||
      lower.includes('movie') || lower.includes('animate')
    ) {
      groups[3].items.push(entry);
    } else if (
      lower.includes('tts') || lower.includes('speech') ||
      lower.includes('audio') || lower.includes('voice') ||
      lower.includes('sonic') || lower.includes('bark') ||
      lower.includes('whisper') || lower.includes('stt')
    ) {
      groups[1].items.push(entry);
    } else if (
      lower.includes('image') || lower.includes('img') ||
      lower.includes('dall') || lower.includes('flux') ||
      lower.includes('stable') || lower.includes('pix') ||
      lower.includes('draw') || lower.includes('paint')
    ) {
      groups[2].items.push(entry);
    } else {
      groups[0].items.push(entry);
    }
  }
  return groups.filter((group) => group.items.length > 0);
}

/** 识别后自动选中（产品负责人指令 2026-10-11：
 * key 保存好后对应模型要选中——每组首个模型
 * 默认选中；exclude 用于已存配置——其自身模态
 * 的模型即当前配置，不重复选）。 */
function autoSelectByModality(
  models: string[],
  exclude?: Modality,
): Partial<Record<Modality, string>> {
  const next: Partial<Record<Modality, string>> = {};
  for (const group of categorizeModels(models)) {
    if (group.modality !== exclude) {
      next[group.modality] = group.items[0];
    }
  }
  return next;
}

/** 模型分组选择（按模态分组——组内单选，
 * 再点已选项取消；选中态经 selectedByModality 传入）。 */
function ModelGroups({
  models,
  selectedByModality = {},
  onSelect,
}: {
  models: string[];
  selectedByModality: Partial<Record<Modality, string>>;
  onSelect: (modality: Modality, model: string) => void;
}) {
  const groups = categorizeModels(models);
  return (
    <div className="config-model-groups">
      <span className="config-preset-label">该提供方模型（点击选用）：</span>
      {groups.map((group) => (
        <div key={group.modality} className="config-model-group">
          <span className="config-model-group-label">
            {group.label}（{group.items.length}）
          </span>
          <div className="config-model-list">
            {group.items.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`config-button config-button-quiet${
                  entry === selectedByModality[group.modality]
                    ? ' config-button-active'
                    : ''
                }`}
                onClick={() =>
                  onSelect(
                    group.modality,
                    entry === selectedByModality[group.modality]
                      ? ''
                      : entry,
                  )
                }
              >
                {entry}
                {entry === selectedByModality[group.modality] && (
                  <span className="config-model-active-tag">当前</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="config-field-hint">
        类别按模型名识别（image / video 关键词，其余归为文本）；识别后各组首个模型已自动选中，可点击更换。
      </p>
    </div>
  );
}

export default function ConfigPage() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [encryptionKeyMissing, setEncryptionKeyMissing] = useState(false);

  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [creating, setCreating] = useState(false);
  /** 识别后按模态选择的模型（一次填写、多模态共享
   * 同端点与 key——无需逐模态重复配置）。 */
  const [selectedModels, setSelectedModels] = useState<
    Partial<Record<Modality, string>>
  >({});
  const [creatingSelected, setCreatingSelected] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModel, setEditModel] = useState('');
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const [probedModels, setProbedModels] = useState<string[]>([]);
  const [probing, setProbing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showEditApiKey, setShowEditApiKey] = useState(false);

  const [probingConfigId, setProbingConfigId] = useState<string | null>(null);
  const [configModels, setConfigModels] = useState<Record<string, string[]>>({});
  /** 已存配置识别后按模态选中的模型
  * （点击「识别模型」自动选中——一键批量
  * 克隆到对应模态，共享端点与 key）。 */
  const [configSelection, setConfigSelection] = useState<
    Record<string, Partial<Record<Modality, string>>>
  >({});

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // 删除两步确认（破坏性操作——第一次点击进入待确认态，
  // 再次点击才真正删除；误触不再直接丢配置）。
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [modality, setModality] = useState<Modality>('text');
  // 预设默认值仅首次加载填充一次（refresh 不随表单输入重跑）。
  const didInitDefaultsRef = useRef(false);

  const visibleConfigs = useMemo(
    () => configs.filter((config) => (config.modality ?? 'text') === modality),
    [configs, modality],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configsResponse, profilesResponse, statusResponse] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/config/profiles'),
        fetch('/api/config/status'),
      ]);
      if (!configsResponse.ok || !profilesResponse.ok) {
        throw new Error('加载配置失败');
      }
      const configsData = (await configsResponse.json()) as { configs: ProviderConfig[] };
      const profilesData = (await profilesResponse.json()) as { providers: ProviderProfile[] };
      setConfigs(configsData.configs);
      setProfiles(profilesData.providers);
      // 预设默认值仅首次填充——表单输入不触发整页重载
      // （此前 refresh 依赖 provider 状态：每敲一个字符都
      // 全量重拉三接口 + loading 闪烁）。
      if (profilesData.providers.length > 0 && !didInitDefaultsRef.current) {
        didInitDefaultsRef.current = true;
        setProvider(profilesData.providers[0].provider);
        setModel(profilesData.providers[0].default_model ?? '');
        setEndpoint(profilesData.providers[0].default_endpoint ?? '');
      }
      if (statusResponse.ok) {
        setStatus((await statusResponse.json()) as ConfigStatus);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApiError = useCallback(async (response: Response, fallback: string) => {
    let message = fallback;
    try {
      const data = (await response.json()) as { code?: string; message?: string };
      if (
        data.code === 'CONFIG_ENCRYPTION_KEY_MISSING' ||
        data.code === 'CONFIG_ENCRYPTION_KEY_INVALID'
      ) {
        setEncryptionKeyMissing(true);
      }
      if (typeof data.message === 'string') {
        message = data.message;
      }
    } catch {
      // 非 JSON 错误体
    }
    setError(message);
  }, []);

  const create = useCallback(async () => {
    if (!provider.trim() || !model.trim() || !endpoint.trim() || !apiKey.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.trim(),
          model: model.trim(),
          endpoint: endpoint.trim(),
          api_key: apiKey,
          modality,
        }),
      });
      if (!response.ok) {
        await handleApiError(response, '新增配置失败');
        return;
      }
      setApiKey('');
      await refresh();
    } finally {
      setCreating(false);
    }
  }, [provider, model, apiKey, creating, handleApiError, refresh]);

  /** 按模态选择模型（组内单选——传空串取消）。 */
  const selectModelByModality = useCallback(
    (modality: Modality, modelName: string) => {
      setSelectedModels((prev) => {
        const next = { ...prev };
        if (modelName.length === 0) {
          delete next[modality];
        } else {
          next[modality] = modelName;
        }
        return next;
      });
    },
    [],
  );

  /** 保存所选模态（各条记录共享同一端点与
   * key——仅模态与模型不同；key 仅以密文持久化）。 */
  const createSelected = useCallback(async () => {
    const entries = (Object.keys(selectedModels) as Modality[]).filter(
      (item) => selectedModels[item] && selectedModels[item]!.length > 0,
    );
    if (
      entries.length === 0 ||
      !provider.trim() ||
      !endpoint.trim() ||
      !apiKey.trim() ||
      creatingSelected
    ) {
      return;
    }
    setCreatingSelected(true);
    setError(null);
    try {
      for (const item of entries) {
        const response = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: provider.trim(),
            model: selectedModels[item],
            endpoint: endpoint.trim(),
            api_key: apiKey,
            modality: item,
          }),
        });
        if (!response.ok) {
          await handleApiError(response, `保存${MODALITY_LABEL[item]}模型失败`);
          return;
        }
      }
      setSelectedModels({});
      setProbedModels([]);
      setApiKey('');
      setNotice(`已保存 ${entries.length} 个模态的模型配置——到对应标签页启用`);
      await refresh();
    } finally {
      setCreatingSelected(false);
    }
  }, [selectedModels, provider, endpoint, apiKey, creatingSelected, handleApiError, refresh]);

  const saveEdit = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const body: Record<string, string> = {};
        if (editModel.trim().length > 0) body.model = editModel.trim();
        if (editEndpoint.trim().length > 0) body.endpoint = editEndpoint.trim();
        if (editApiKey.length > 0) body.api_key = editApiKey;
        const response = await fetch(`/api/config/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          await handleApiError(response, '更新配置失败');
          return;
        }
        setEditingId(null);
        setEditApiKey('');
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [editModel, editApiKey, handleApiError, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const response = await fetch(`/api/config/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          await handleApiError(response, '删除配置失败');
          return;
        }
        setDeletingId(null);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [handleApiError, refresh],
  );

  const confirmAndEnable = useCallback(
    async (id: string, configProvider: string) => {
      setConfirming(true);
      setError(null);
      try {
        const confirmResponse = await fetch(`/api/config/${id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ statement: defaultConfirmStatement(configProvider) }),
        });
        if (!confirmResponse.ok) {
          await handleApiError(confirmResponse, '隐私再确认失败');
          return;
        }
        const enableResponse = await fetch(`/api/config/${id}/enable`, { method: 'POST' });
        if (!enableResponse.ok) {
          await handleApiError(enableResponse, '启用配置失败');
          return;
        }
        setConfirmingId(null);
        setConfirmChecked(false);
        await refresh();
      } finally {
        setConfirming(false);
      }
    },
    [handleApiError, refresh],
  );

  const enable = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const response = await fetch(`/api/config/${id}/enable`, { method: 'POST' });
        if (!response.ok) {
          await handleApiError(response, '启用配置失败');
          return;
        }
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [handleApiError, refresh],
  );

  const disable = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const response = await fetch(`/api/config/${id}/disable`, { method: 'POST' });
        if (!response.ok) {
          await handleApiError(response, '停用配置失败');
          return;
        }
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [handleApiError, refresh],
  );

  const startEdit = (config: ProviderConfig) => {
    setEditingId(config.id);
    setEditModel(config.model);
    setEditEndpoint(config.endpoint);
    setEditApiKey('');
  };

  const applyPreset = (profile: ProviderProfile) => {
    setProvider(profile.provider);
    setModel(profile.default_model ?? '');
    setEndpoint(profile.default_endpoint ?? '');
  };

  const probeModels = useCallback(async () => {
    if (probing || endpoint.trim().length === 0 || apiKey.trim().length === 0) return;
    setProbing(true);
    setError(null);
    try {
      const response = await fetch('/api/config/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint.trim(), api_key: apiKey }),
      });
      if (!response.ok) {
        await handleApiError(response, '识别模型失败');
        return;
      }
      const data = (await response.json()) as { models: string[] };
      setProbedModels(data.models);
      // 识别成功后按模态自动选中各组首个模型。
      setSelectedModels(autoSelectByModality(data.models));
    } finally {
      setProbing(false);
    }
  }, [probing, endpoint, apiKey, handleApiError]);

  const probeEditModels = useCallback(async () => {
    if (probing || editEndpoint.trim().length === 0 || editApiKey.length === 0) return;
    setProbing(true);
    setError(null);
    try {
      const response = await fetch('/api/config/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: editEndpoint.trim(), api_key: editApiKey }),
      });
      if (!response.ok) {
        await handleApiError(response, '识别模型失败');
        return;
      }
      const data = (await response.json()) as { models: string[] };
      setProbedModels(data.models);
      setSelectedModels(autoSelectByModality(data.models));
    } finally {
      setProbing(false);
    }
  }, [probing, editEndpoint, editApiKey, handleApiError]);

  const probeConfigModels = useCallback(
    async (id: string) => {
      if (probingConfigId !== null) return;
      setProbingConfigId(id);
      setError(null);
      try {
        const response = await fetch('/api/config/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_id: id }),
        });
        if (!response.ok) {
          await handleApiError(response, '识别模型失败');
          return;
        }
        const data = (await response.json()) as { models: string[] };
        setConfigModels((previous) => ({ ...previous, [id]: data.models }));
        // 识别成功后自动选中各模态首个模型
        // （当前配置自身模态除外——其模型
        // 已是本配置，换模走「编辑」）。
        const source = configs.find((item) => item.id === id);
        setConfigSelection((previous) => ({
          ...previous,
          [id]: autoSelectByModality(
            data.models,
            source?.modality ?? 'text',
          ),
        }));
      } finally {
        setProbingConfigId(null);
      }
    },
    [probingConfigId, handleApiError, configs],
  );

  /** 选用所选（已存配置识别后——把各模态
  * 选中的模型批量克隆为新配置：共享该配置
  * 的端点与 key 密文，服务端原样复制——
  * 无需重复填写；同模态+模型已存在时
  * 服务端幂等返回既有记录）。 */
  const applyConfigSelection = useCallback(
    async (source: ProviderConfig) => {
      const selection = configSelection[source.id];
      if (!selection) return;
      const entries = (Object.keys(selection) as Modality[]).filter(
        (item) => selection[item] && selection[item]!.length > 0,
      );
      if (entries.length === 0) return;
      setBusyId(source.id);
      setError(null);
      try {
        for (const item of entries) {
          const response = await fetch(
            `/api/config/${source.id}/modality`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                modality: item,
                model: selection[item],
              }),
            },
          );
          if (!response.ok) {
            await handleApiError(response, `保存${MODALITY_LABEL[item]}模型失败`);
            return;
          }
        }
        setConfigSelection((previous) => {
          const next = { ...previous };
          delete next[source.id];
          return next;
        });
        setNotice(
          `已选中 ${entries.length} 个模态的模型（${source.provider}）——到对应标签页启用`,
        );
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [configSelection, handleApiError, refresh],
  );


  return (
    <main className="config-page">
      <header className="config-header">
        <a className="back-button" href="/">
          <ArrowLeftIcon size={16} /> 返回
        </a>
        <h1>模型配置</h1>
        {status && (
          <span className={`mode-badge mode-${status.mode}`}>
            当前：{status.mode === 'provider' ? `${status.provider} · ${status.model}` : '合成演示'}
          </span>
        )}
      </header>

      <p className="config-intro">
        任何 OpenAI 兼容提供方都可以直接配置：填写提供方名称、端点（chat/completions
        URL）、模型名与 API key——无需登记；模型名可点击「识别模型」自动获取。API key
        仅以密文持久化（AES-256-GCM 静态加密，加密密钥经环境变量注入、与密文分离）；
        明文只在运行期内存中，不进日志、不进证据产物、不进 git。启用前须完成隐私再确认。
      </p>

      {encryptionKeyMissing && (
        <div className="config-banner config-banner-error">
          <KeyIcon size={16} />
          <span>
            尚未设置加密密钥。请设置环境变量 <code>EXPERIENCE_CONFIG_ENCRYPTION_KEY</code>
            （32 字节 hex，64 个十六进制字符）后重启；生成方式：
            <code>node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;</code>
          </span>
        </div>
      )}

      {error && (
        <div className="config-banner config-banner-error" role="alert">
          <XIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="config-banner config-banner-notice" role="status">
          <CheckIcon size={16} />
          <span>{notice}</span>
        </div>
      )}

      <section className="config-card">
        <h2 className="config-card-title">添加提供方配置</h2>
        <div className="config-field">
          <label>模型模态（每类至多启用一条）</label>
          <div className="modality-tabs">
            {MODALITIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`modality-tab${modality === item.id ? ' is-active' : ''}`}
                onClick={() => setModality(item.id)}
                title={item.hint}
              >
                <span className="modality-tab-label">{item.label}</span>
                <span className="modality-tab-hint">{item.hint}</span>
              </button>
            ))}
          </div>
        </div>
        {profiles.length > 0 && (
          <div className="config-presets">
            <span className="config-preset-label">预设（自动填充）：</span>
            {profiles.map((profile) => (
              <button
                key={profile.provider}
                type="button"
                className="config-button config-button-quiet"
                onClick={() => applyPreset(profile)}
              >
                {profile.provider}
              </button>
            ))}
          </div>
        )}
        <div className="config-form">
          <div className="config-field">
            <label htmlFor="config-provider">提供方（自定义名称，如 my-provider）</label>
            <input
              id="config-provider"
              className="config-input"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              placeholder="任意名称——用于标识与隐私确认记录"
            />
          </div>
          <div className="config-field">
            <label htmlFor="config-endpoint">端点（OpenAI 兼容 chat/completions URL）</label>
            <input
              id="config-endpoint"
              className="config-input"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://api.example.com/v1/chat/completions"
            />
          </div>
          <div className="config-field">
            <label htmlFor="config-model">模型</label>
            <div className="config-model-row">
              <input
                id="config-model"
                className="config-input"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="模型名（可自动识别）"
                list="config-models"
              />
              <datalist id="config-models">
                {probedModels.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
              <button
                type="button"
                className="config-button config-button-quiet"
                onClick={() => void probeModels()}
                disabled={probing || endpoint.trim().length === 0 || apiKey.trim().length === 0}
                title={
                  endpoint.trim().length === 0 || apiKey.trim().length === 0
                    ? '需先填写端点与 API key'
                    : '向端点 /models 发起请求（仅发送上方填写的 key）'
                }
              >
                <RefreshIcon size={14} /> 识别模型
              </button>
            </div>
            <p className="config-field-hint">
              识别将向端点 /models 发起请求（仅发送上方填写的 key）；不支持该接口的提供方可手动填写。
            </p>
            {probedModels.length > 0 && (
              <div className="config-probe-panel">
                <ModelGroups
                  models={probedModels}
                  selectedByModality={selectedModels}
                  onSelect={selectModelByModality}
                />
                <div className="config-selected-actions">
                  <button
                    type="button"
                    className="config-button config-button-primary"
                    onClick={() => void createSelected()}
                    disabled={
                      creatingSelected ||
                      Object.values(selectedModels).every(
                        (entry) => !entry || entry.length === 0,
                      ) ||
                      provider.trim().length === 0 ||
                      endpoint.trim().length === 0 ||
                      apiKey.trim().length === 0
                    }
                  >
                    {creatingSelected
                      ? '保存中…'
                      : `保存所选（${Object.values(selectedModels).filter((entry) => entry && entry.length > 0).length} 个模态）`}
                  </button>
                  <span className="config-field-hint">
                    一次填写端点与 key，所选模型按模态分别保存——无需逐模态重复配置。
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="config-field">
            <label htmlFor="config-api-key">API key</label>
            <div className="config-model-row">
              <input
                id="config-api-key"
                className="config-input"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="输入时默认隐藏"
              />
              <button
                type="button"
                className="config-button config-button-quiet"
                onClick={() => setShowApiKey((value) => !value)}
                disabled={apiKey.length === 0}
                title={showApiKey ? '隐藏 key' : '显示 key'}
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="config-field-hint">
              保存后 key 不可再查看（仅以密文持久化——安全设计）；编辑时留空即保持不变。
            </p>
          </div>
          <button
            type="button"
            className="config-button config-button-primary"
            onClick={() => void create()}
            disabled={
              creating ||
              provider.trim().length === 0 ||
              model.trim().length === 0 ||
              endpoint.trim().length === 0 ||
              apiKey.trim().length === 0
            }
          >
            {creating ? '保存中…' : '保存'}
          </button>
        </div>
      </section>

      <section className="config-card">
        <div className="config-card-head">
          <h2 className="config-card-title">已保存的配置</h2>
          <div className="modality-filter">
            {MODALITIES.map((item) => {
              const count = configs.filter((config) => (config.modality ?? 'text') === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`modality-chip${modality === item.id ? ' is-active' : ''}`}
                  onClick={() => setModality(item.id)}
                >
                  {item.label}
                  <span className="modality-chip-count">{count}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="config-button config-button-quiet"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshIcon size={14} /> 刷新
          </button>
        </div>
        {loading && visibleConfigs.length === 0 ? (
          <p className="config-empty">加载中…</p>
        ) : visibleConfigs.length === 0 ? (
          <p className="config-empty">
            {configs.length === 0
              ? '还没有配置——从上面添加第一个提供方。'
              : `${MODALITY_LABEL[modality]}模型还没有配置——从上面添加并启用。`}
          </p>
        ) : (
          <ul className="config-list">
            {visibleConfigs.map((config) => (
              <li key={config.id} className="config-item">
                {editingId === config.id ? (
                  <div className="config-form config-form-edit">
                    <div className="config-field">
                      <label htmlFor={`edit-model-${config.id}`}>模型</label>
                      <div className="config-model-row">
                        <input
                          id={`edit-model-${config.id}`}
                          className="config-input"
                          value={editModel}
                          onChange={(event) => setEditModel(event.target.value)}
                          list="config-models"
                        />
                        <button
                          type="button"
                          className="config-button config-button-quiet"
                          onClick={() => void probeEditModels()}
                          disabled={probing || editEndpoint.trim().length === 0 || editApiKey.length === 0}
                          title={
                            editApiKey.length === 0
                              ? '重新输入 API key 后可识别'
                              : '向端点 /models 发起请求（仅发送重新输入的 key）'
                          }
                        >
                          <RefreshIcon size={14} /> 识别模型
                        </button>
                      </div>
                    </div>
                    <div className="config-field">
                      <label htmlFor={`edit-endpoint-${config.id}`}>端点</label>
                      <input
                        id={`edit-endpoint-${config.id}`}
                        className="config-input"
                        value={editEndpoint}
                        onChange={(event) => setEditEndpoint(event.target.value)}
                      />
                    </div>
                    <div className="config-field">
                      <label htmlFor={`edit-key-${config.id}`}>API key（留空保持不变）</label>
                      <div className="config-model-row">
                        <input
                          id={`edit-key-${config.id}`}
                          className="config-input"
                          type={showEditApiKey ? 'text' : 'password'}
                          value={editApiKey}
                          onChange={(event) => setEditApiKey(event.target.value)}
                          placeholder="留空保持不变——已保存的 key 不可查看"
                        />
                        <button
                          type="button"
                          className="config-button config-button-quiet"
                          onClick={() => setShowEditApiKey((value) => !value)}
                          disabled={editApiKey.length === 0}
                          title={showEditApiKey ? '隐藏 key' : '显示 key'}
                        >
                          {showEditApiKey ? '隐藏' : '显示'}
                        </button>
                      </div>
                    </div>
                    <div className="config-actions">
                      <button
                        type="button"
                        className="config-button config-button-primary"
                        onClick={() => void saveEdit(config.id)}
                        disabled={
                          busyId === config.id ||
                          (editModel.trim().length === 0 &&
                            editEndpoint.trim().length === 0 &&
                            editApiKey.length === 0)
                        }
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="config-button config-button-quiet"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="config-item-main">
                    <div className="config-item-head">
                      <span className="config-provider">{config.provider}</span>
                      <span className="config-model">{config.model}</span>
                <span className={`modality-badge modality-${config.modality ?? 'text'}`}>
                  {MODALITY_LABEL[config.modality ?? 'text']}
                </span>
                      <span className="config-endpoint" title={config.endpoint}>
                        {endpointHost(config.endpoint)}
                      </span>
                      <span className="config-badges">
                        <span
                          className="badge"
                          title="API key 已以 AES-256-GCM 密文保存——不可查看（安全设计）；编辑时留空保持不变"
                        >
                          <KeyIcon size={12} /> key 已保存
                        </span>
                        {config.enabled ? (
                          <span className="badge badge-enabled">已启用</span>
                        ) : (
                          <span className="badge">未启用</span>
                        )}
                        {config.providerConfirmed ? (
                          <span className="badge badge-confirmed">
                            <ShieldIcon size={12} /> 隐私已确认
                          </span>
                        ) : (
                          <span className="badge badge-unconfirmed">待隐私确认</span>
                        )}
                      </span>
                    </div>
                    {config.enabled && (
                      <p className="config-item-note">当前回应由该配置的模型生成。</p>
                    )}
                    {configModels[config.id] && (
                      <div className="config-probe-panel">
                        <ModelGroups
                          models={configModels[config.id]}
                          selectedByModality={{
                            ...(configSelection[config.id] ?? {}),
                            [config.modality ?? 'text']: config.model,
                          }}
                          onSelect={(item, entry) => {
                            if (item === (config.modality ?? 'text')) {
                              if (entry.length > 0) {
                                startEdit(config);
                                setEditModel(entry);
                              }
                              return;
                            }
                            setConfigSelection((previous) => {
                              const current = {
                                ...(previous[config.id] ?? {}),
                              };
                              if (entry.length === 0) {
                                delete current[item];
                              } else {
                                current[item] = entry;
                              }
                              return { ...previous, [config.id]: current };
                            });
                          }}
                        />
                        <div className="config-selected-actions">
                          <button
                            type="button"
                            className="config-button config-button-primary"
                            onClick={() => void applyConfigSelection(config)}
                            disabled={
                              busyId === config.id ||
                              Object.values(
                                configSelection[config.id] ?? {},
                              ).every(
                                (entry) => !entry || entry.length === 0,
                              )
                            }
                          >
                            {busyId === config.id
                              ? '保存中…'
                              : `选用所选（${Object.values(
                                  configSelection[config.id] ?? {},
                                ).filter(
                                  (entry) => entry && entry.length > 0,
                                ).length} 个模态）`}
                          </button>
                          <span className="config-field-hint">
                            所选模型共享该配置的端点与 key——一键按模态保存，无需重复配置。
                          </span>
                        </div>
                      </div>
                    )}
                    {confirmingId === config.id ? (
                      <div className="confirm-panel">
                        <p className="confirm-statement">
                          {defaultConfirmStatement(config.provider)}
                        </p>
                        <label className="confirm-checkbox">
                          <input
                            type="checkbox"
                            checked={confirmChecked}
                            onChange={(event) => setConfirmChecked(event.target.checked)}
                          />
                          <span>
                            我以产品负责人 + 安全负责人双重身份确认上述内容（确认记录经通用模板
                            签署，提供方名称于签署时填写）。
                          </span>
                        </label>
                        <div className="config-actions">
                          <button
                            type="button"
                            className="config-button config-button-primary"
                            onClick={() => void confirmAndEnable(config.id, config.provider)}
                            disabled={!confirmChecked || confirming}
                          >
                            {confirming ? '确认中…' : '确认并启用'}
                          </button>
                          <button
                            type="button"
                            className="config-button config-button-quiet"
                            onClick={() => {
                              setConfirmingId(null);
                              setConfirmChecked(false);
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="config-actions">
                        {config.enabled ? (
                          <button
                            type="button"
                            className="config-button config-button-quiet"
                            onClick={() => void disable(config.id)}
                            disabled={busyId === config.id}
                          >
                            停用
                          </button>
                        ) : config.providerConfirmed ? (
                          <button
                            type="button"
                            className="config-button config-button-primary"
                            onClick={() => void enable(config.id)}
                            disabled={busyId === config.id}
                          >
                            <CheckIcon size={14} /> 启用
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="config-button config-button-primary"
                            onClick={() => setConfirmingId(config.id)}
                          >
                            <ShieldIcon size={14} /> 确认并启用
                          </button>
                        )}
                        <button
                          type="button"
                          className="config-button config-button-quiet"
                          onClick={() => void probeConfigModels(config.id)}
                          disabled={busyId === config.id || probingConfigId !== null}
                          title="用已保存的端点与 key 识别该提供方的全部模型（key 服务端解密使用，不返回页面）"
                        >
                          <RefreshIcon size={14} /> 识别模型
                        </button>
                        <button
                          type="button"
                          className="config-button config-button-quiet"
                          onClick={() => startEdit(config)}
                          disabled={busyId === config.id}
                        >
                          编辑
                        </button>
                        {deletingId === config.id ? (
                          <>
                            <button
                              type="button"
                              className="config-button config-button-danger"
                              onClick={() => void remove(config.id)}
                              disabled={busyId === config.id}
                            >
                              <TrashIcon size={14} /> 确认删除
                            </button>
                            <button
                              type="button"
                              className="config-button config-button-quiet"
                              onClick={() => setDeletingId(null)}
                              disabled={busyId === config.id}
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="config-button config-button-danger"
                            onClick={() => setDeletingId(config.id)}
                            disabled={busyId === config.id}
                          >
                            <TrashIcon size={14} /> 删除
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="config-footer">
        任何 OpenAI 兼容提供方均可自定义配置（model-agnostic——产品不写死任何提供方，
        亦无准入登记）；预设仅自动填充表单。协议不兼容的提供方属后续构造规则切片。
      </p>
    </main>
  );
}
