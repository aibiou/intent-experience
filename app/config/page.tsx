'use client';

import { useCallback, useEffect, useState } from 'react';
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
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  providerConfirmed: boolean;
  hasKey: true;
}

interface ProviderProfile {
  provider: string;
  default_model: string;
}

interface ConfigStatus {
  mode: 'synthetic' | 'provider';
  provider?: string;
  model?: string;
}

const defaultConfirmStatement = (provider: string) =>
  `我已确认提供方 ${provider} 的数据处理条款（DPA）与已签署隐私六要素一致：存储位置中国大陆（cn）/ 阿里云 / 云存储；加密为静态 + 传输两层机制、密钥分离；API key 仅以密文持久化，明文仅运行期内存持有，不进日志与证据产物。`;

export default function ConfigPage() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [encryptionKeyMissing, setEncryptionKeyMissing] = useState(false);

  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModel, setEditModel] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

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
      if (profilesData.providers.length > 0 && provider === '') {
        setProvider(profilesData.providers[0].provider);
        setModel(profilesData.providers[0].default_model ?? '');
      }
      if (statusResponse.ok) {
        setStatus((await statusResponse.json()) as ConfigStatus);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  }, [provider]);

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
    if (!provider || !model.trim() || !apiKey.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: model.trim(), api_key: apiKey }),
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

  const saveEdit = useCallback(
    async (id: string) => {
      setBusyId(id);
      setError(null);
      try {
        const body: Record<string, string> = {};
        if (editModel.trim().length > 0) body.model = editModel.trim();
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
    setEditApiKey('');
  };

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
        API key 由你在页面添加，仅以密文持久化（AES-256-GCM 静态加密，加密密钥经环境变量
        注入、与密文分离）；明文只在运行期内存中，不进日志、不进证据产物、不进 git。
        可以配置多个不同提供商的对应模型，启用前须完成隐私再确认。
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

      <section className="config-card">
        <h2 className="config-card-title">添加提供方配置</h2>
        <div className="config-form">
          <div className="config-field">
            <label htmlFor="config-provider">提供方</label>
            <select
              id="config-provider"
              className="config-select"
              value={provider}
              onChange={(event) => {
                const next = event.target.value;
                setProvider(next);
                const profile = profiles.find((item) => item.provider === next);
                setModel(profile?.default_model ?? '');
              }}
            >
              {profiles.map((profile) => (
                <option key={profile.provider} value={profile.provider}>
                  {profile.provider}
                </option>
              ))}
            </select>
          </div>
          <div className="config-field">
            <label htmlFor="config-model">模型</label>
            <input
              id="config-model"
              className="config-input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="模型名"
            />
          </div>
          <div className="config-field">
            <label htmlFor="config-api-key">API key</label>
            <input
              id="config-api-key"
              className="config-input"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="仅本次输入可见，随后仅以密文保存"
            />
          </div>
          <button
            type="button"
            className="config-button config-button-primary"
            onClick={() => void create()}
            disabled={creating || !provider || model.trim().length === 0 || apiKey.trim().length === 0}
          >
            {creating ? '保存中…' : '保存'}
          </button>
        </div>
      </section>

      <section className="config-card">
        <div className="config-card-head">
          <h2 className="config-card-title">已保存的配置</h2>
          <button
            type="button"
            className="config-button config-button-quiet"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshIcon size={14} /> 刷新
          </button>
        </div>
        {loading && configs.length === 0 ? (
          <p className="config-empty">加载中…</p>
        ) : configs.length === 0 ? (
          <p className="config-empty">还没有配置——从上面添加第一个提供方。</p>
        ) : (
          <ul className="config-list">
            {configs.map((config) => (
              <li key={config.id} className="config-item">
                {editingId === config.id ? (
                  <div className="config-form config-form-edit">
                    <div className="config-field">
                      <label htmlFor={`edit-model-${config.id}`}>模型</label>
                      <input
                        id={`edit-model-${config.id}`}
                        className="config-input"
                        value={editModel}
                        onChange={(event) => setEditModel(event.target.value)}
                      />
                    </div>
                    <div className="config-field">
                      <label htmlFor={`edit-key-${config.id}`}>API key（留空保持不变）</label>
                      <input
                        id={`edit-key-${config.id}`}
                        className="config-input"
                        type="password"
                        value={editApiKey}
                        onChange={(event) => setEditApiKey(event.target.value)}
                      />
                    </div>
                    <div className="config-actions">
                      <button
                        type="button"
                        className="config-button config-button-primary"
                        onClick={() => void saveEdit(config.id)}
                        disabled={busyId === config.id || (editModel.trim().length === 0 && editApiKey.length === 0)}
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
                      <span className="config-badges">
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
                          onClick={() => startEdit(config)}
                          disabled={busyId === config.id}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="config-button config-button-danger"
                          onClick={() => void remove(config.id)}
                          disabled={busyId === config.id}
                        >
                          <TrashIcon size={14} /> 删除
                        </button>
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
        提供方选择经已登记提供方规则族（model-agnostic——产品不写死任何提供方）；
        新增提供方经各自构造规则版本化冻结后方可登记启用。
      </p>
    </main>
  );
}
