'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  MicIcon,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
  VideoIcon,
  XIcon,
} from '../_components/icons';
import {
  creationId,
  loadCreations,
  saveCreations,
  type CreationEntry,
} from '../_components/creations';
import { splitGenerationDetail, downloadFileName } from '../_components/generation-text';

type Modality = 'image' | 'voice' | 'video';
type Phase = 'idle' | 'pending' | 'completed' | 'failed';

interface ConfigOption {
  id: string;
  provider: string;
  model: string;
}

const MODALITY_TABS: {
  id: Modality;
  label: string;
  icon: typeof ImageIcon;
  hint: string;
}[] = [
  {
    id: 'video',
    label: '视频生成',
    icon: VideoIcon,
    hint: '描述你想要的画面和运动……',
  },
  {
    id: 'image',
    label: '图片生成',
    icon: ImageIcon,
    hint: '描述构图、风格与光线……',
  },
  {
    id: 'voice',
    label: '语音生成',
    icon: MicIcon,
    hint: '输入想朗读的文字……',
  },
];

const MODALITY_LABELS: Record<Modality, string> = {
  image: '图像',
  voice: '语音',
  video: '视频',
};

function srcOf(entry: Pick<CreationEntry, 'url' | 'dataUri'>): string | undefined {
  return entry.dataUri ?? entry.url;
}

/** 作品上报服务端作品库（与首页同一份作品墙——
 * 本地缓存仅 12 条，服务端全量展示）。 */
async function postWork(entry: CreationEntry): Promise<void> {
  try {
    await fetch('/api/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modality: entry.modality,
        prompt: entry.prompt,
        ...(entry.url !== undefined && !entry.url.startsWith('/api/works/')
          ? { url: entry.url }
          : {}),
        ...(entry.dataUri !== undefined ? { dataUri: entry.dataUri } : {}),
        ...(entry.mime !== undefined ? { mime: entry.mime } : {}),
      }),
    });
  } catch {
    // 上报失败不影响创作本身——本地缓存仍在。
  }
}

export default function CreatePage() {
  const [modality, setModality] = useState<Modality>('video');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<ConfigOption[]>([]);
  const [modelId, setModelId] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<number>();
  const [result, setResult] = useState<CreationEntry | null>(null);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<CreationEntry[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const refInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  // 参考图文件 → 压缩 dataURI（≤1024px JPEG；≤3 张）。
  const handleReferenceFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 3 - referenceImages.length);
    for (const file of picked) {
      try {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const image = new Image();
            image.onload = () => {
              const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(image.width * scale));
              canvas.height = Math.max(1, Math.round(image.height * scale));
              const context = canvas.getContext('2d');
              if (!context) {
                resolve(String(reader.result));
                return;
              }
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            image.onerror = () => reject(new Error('image decode failed'));
            image.src = String(reader.result);
          };
          reader.onerror = () => reject(new Error('file read failed'));
          reader.readAsDataURL(file);
        });
        setReferenceImages((prev) => [...prev, dataUri].slice(0, 3));
      } catch {
        // 单张失败不影响其余。
      }
    }
  }, [referenceImages.length]);

  // 可选模型：该模态已启用的配置
  // （一次配置、按模态选用——不重复配置）。
  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || data === null) return;
        const records = Array.isArray(data)
          ? data
          : data.configs ?? data.items ?? [];
        const list: ConfigOption[] = records
          .filter(
            (item: Record<string, unknown>) =>
              item.enabled === true && item.modality === modality,
          )
          .map((item: Record<string, unknown>) => ({
            id: String(item.id),
            provider: String(item.provider),
            model: String(item.model),
          }));
        if (!cancelled) {
          setOptions(list);
          setModelId((prev) =>
            prev && list.some((item) => item.id === prev) ? prev : list[0]?.id,
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [modality]);

  const generate = useCallback(() => {
    const input = prompt.trim();
    if (input.length === 0 || phase === 'pending') return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase('pending');
    setProgress(0);
    setMessage('');
    setResult(null);
    (async () => {
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            request_id: `web_${crypto.randomUUID()}`,
            modality,
            prompt: input,
            ...(modelId !== undefined ? { model_id: modelId } : {}),
            ...(referenceImages.length > 0
              ? { reference_images: referenceImages }
              : {}),
          }),
        });
        if (!response.ok || response.body === null) {
          setPhase('failed');
          setMessage('生成服务不可用');
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.length === 0) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }
            if (event.type === 'progress') {
              setProgress(
                typeof event.progress === 'number' ? event.progress : undefined,
              );
            } else if (event.type === 'completed') {
              const entry: CreationEntry = {
                id: creationId(),
                modality,
                prompt: input,
                ...(typeof event.url === 'string' ? { url: event.url } : {}),
                ...(typeof event.dataUri === 'string'
                  ? { dataUri: event.dataUri }
                  : {}),
                ...(typeof event.mime === 'string'
                  ? { mime: event.mime }
                  : {}),
                at: new Date().toISOString(),
              };
              setResult(entry);
              setPhase('completed');
              setHistory((prev) => [entry, ...prev]);
              // 持久化到作品墙（首页可见）。
              const next = [entry, ...loadCreations()].slice(0, 12);
              saveCreations(next);
              // 服务端作品库同步（首页作品墙以其为准）。
              void postWork(entry);
            } else if (event.type === 'failed' || event.type === 'unconfigured') {
              setPhase('failed');
              setMessage(String(event.message ?? '生成失败'));
            }
          }
        }
      } catch {
        // 用户主动取消（切换请求或点击取消）——回到可输入态
        // （不归位会永远停在「生成中…」）；真实网络故障才报失败。
        if (controller.signal.aborted) {
          setPhase('idle');
          setProgress(undefined);
          setMessage('');
        } else {
          setPhase('failed');
          setMessage('网络中断');
        }
      }
    })();
  }, [prompt, phase, modality, modelId]);

  // 取消在途生成（fetch abort → 服务端流中断）。
  const cancelGeneration = useCallback(() => {
    requestRef.current?.abort();
  }, []);

  const activeTab = MODALITY_TABS.find((tab) => tab.id === modality);
  const resultSrc = result !== null ? srcOf(result) : undefined;

  return (
    <main className="workspace">
      <header className="workspace-header">
        <a className="workspace-brand" href="/">
          <ArrowLeftIcon size={15} />
          <span>个人体验引擎</span>
        </a>
        <span className="workspace-title">
          <SparklesIcon size={14} />
          创作工作台
        </span>
      </header>

      <div className="workspace-split">
        <section className="workspace-left">
          <div className="workspace-modality">
            {MODALITY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`modality-tab${modality === tab.id ? ' is-active' : ''}`}
                onClick={() => {
                  setModality(tab.id);
                  setPhase('idle');
                  setResult(null);
                  setProgress(undefined);
                }}
              >
                <tab.icon size={15} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <textarea
            className="workspace-prompt"
            rows={5}
            placeholder={activeTab?.hint}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                !event.shiftKey
              ) {
                event.preventDefault();
                void generate();
              }
            }}
          />

          {referenceImages.length > 0 && (
            <div className="ref-thumbs">
              {referenceImages.map((uri, index) => (
                <span key={index} className="ref-thumb">
                  <img src={uri} alt={`参考图${index + 1}`} />
                  <button
                    type="button"
                    className="ref-thumb-remove"
                    onClick={() =>
                      setReferenceImages((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                    aria-label="移除参考图"
                  >
                    ×
                  </button>
                </span>
              ))}
              <span className="ref-thumbs-hint">
                参考图——本次生成与其保持一致
              </span>
            </div>
          )}

          <label className="workspace-field">
            <span className="workspace-field-label">模型</span>
            <select
              className="workspace-model"
              value={modelId ?? ''}
              onChange={(event) =>
                setModelId(event.target.value || undefined)
              }
            >
              {options.length === 0 && <option value="">暂无启用模型</option>}
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.provider} · {option.model}
                </option>
              ))}
            </select>
          </label>
          {options.length === 0 && (
            <p className="workspace-field-hint">
              该模态还没有启用的模型——<a href="/config">去模型配置</a>添加并启用后再生成。
            </p>
          )}

          {phase === 'pending' ? (
            <button
              type="button"
              className="workspace-generate workspace-cancel"
              onClick={cancelGeneration}
            >
              <XIcon size={15} />
              <span>取消生成</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ref-attach workspace-ref-attach"
                onClick={() => refInputRef.current?.click()}
                title="添加参考图（≤3 张，本次生成与其保持一致）"
              >
                参考图{referenceImages.length > 0 ? ` ${referenceImages.length}` : ''}
              </button>
              <input
                ref={refInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  void handleReferenceFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="workspace-generate"
                onClick={() => void generate()}
                disabled={prompt.trim().length === 0}
              >
                <SendIcon size={15} />
                <span>开始生成</span>
              </button>
            </>
          )}

          {history.length > 0 && (
            <div className="workspace-history">
              <h3 className="workspace-history-title">本次会话</h3>
              <div className="workspace-history-row">
                {history.map((item) => {
                  const src = srcOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="workspace-history-item"
                      onClick={() => {
                        setResult(item);
                        setPhase('completed');
                      }}
                    >
                      {item.modality === 'voice' ? (
                        <MicIcon size={14} />
                      ) : src !== undefined ? (
                        <img src={src} alt={item.prompt} />
                      ) : (
                        <SparklesIcon size={14} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="workspace-right">
          {phase === 'idle' && (
            <div className="workspace-empty">
              <SparklesIcon size={28} />
              <p>说出你想创作的——{activeTab?.label}即时呈现</p>
            </div>
          )}
          {phase === 'pending' && (
            <div className="workspace-pending">
              <div className="workspace-pending-label">
                <span className="gen-pending-dot" aria-hidden="true" />
                <span>
                  {MODALITY_LABELS[modality]}生成中…
                </span>
                {typeof progress === 'number' && progress > 0 && (
                  <span className="gen-progress">
                    <span className="gen-progress-bar">
                      <span
                        className="gen-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                    <span className="gen-progress-num">{progress}%</span>
                  </span>
                )}
                {typeof progress === 'number' && progress === 0 && (
                  <span className="gen-queued">排队中</span>
                )}
              </div>
              <p className="workspace-pending-hint">
                视频生成需排队与渲染，通常数十秒至数分钟
              </p>
            </div>
          )}
          {phase === 'completed' && resultSrc !== undefined && (
            <div className="workspace-output">
              {modality === 'voice' ? (
                <audio className="workspace-audio" controls src={resultSrc} />
              ) : modality === 'video' ? (
                <video className="workspace-video" controls src={resultSrc} />
              ) : (
                <img className="workspace-image" src={resultSrc} alt={prompt} />
              )}
              <p className="workspace-output-prompt" title={prompt}>
                {prompt}
              </p>
              {modality !== 'voice' && (
                <a
                  className="gen-download"
                  href={resultSrc}
                  download={downloadFileName({ label: undefined, prompt, modality })}
                  target="_blank"
                  rel="noreferrer"
                >
                  {modality === 'video' ? '下载视频' : '下载图片'}
                </a>
              )}
            </div>
          )}
          {phase === 'failed' && (
            <div className="workspace-failed">
              <p className="gen-message">{splitGenerationDetail(message).main}</p>
              {splitGenerationDetail(message).detail !== null && (
                <p className="gen-detail" title={splitGenerationDetail(message).detail ?? undefined}>
                  {splitGenerationDetail(message).detail}
                </p>
              )}
              <button
                type="button"
                className="gen-regen"
                onClick={() => void generate()}
              >
                <RefreshIcon size={13} />
                <span>重试</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
