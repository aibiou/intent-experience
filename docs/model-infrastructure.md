# 模型基础设施层架构

## 设计目标

体验引擎主应用（Next.js :3000）不感知任何具体模型提供方——所有模型调用
（文本/图像/视频/语音）统一经本机模型网关（:3031）路由。提供方配置
按模态分组管理，页面可见、可编辑、可测试连通性。

## 2026-10-14 统一重构

### 核心变更

1. **统一配置源**：`data/config/provider-configs.json`（AES-256-GCM 加密）为唯一真相源。
   废弃 model-gateway 独立的 `providers.json` + `secrets.json`。
2. **取消合成回退**：无已配置的真实模型时，运行时不假装回答，
   明确进入 `MODEL_NOT_CONFIGURED` 状态，引导用户去 `/config` 配置。
3. **model-gateway 只读**：所有配置变更经主应用 `/config` 页面 → 主应用 config-store API。
   model-gateway 只读取配置用于路由调用。
4. **取消 zai 内置兜底**：所有模态（含文本）无配置时明确报 `MEDIA_PROVIDER_MISSING`。

### 拓扑

```
浏览器（用户）
  │
  ├── 体验引擎页面（Next.js :3000）
  │     └── /config 页面 ──→ 主应用 config-store API（增删改）
  │
  ├── 体验引擎服务端
  │     ├── llm-gateway.ts     → 直接调用真实模型 API（ProviderLlmGateway）
  │     └── generation-gateway.ts → 直接调用真实生成 API
  │
  └── 模型网关 mini-service（Bun :3031）
        ├── 读取 data/config/provider-configs.json（只读）
        ├── 模态路由：按 modality 字段选提供方
        └── 上游提供方（真实 API 调用）
```

### 数据源（单一真相）

| 文件 | 作用 | 是否入库 |
|------|------|----------|
| `data/config/provider-configs.json` | 提供方配置（id/provider/model/endpoint/modality/keyCiphertext/enabledAt） | ❌ gitignored |
| `data/config/privacy-confirmations.json` | 隐私确认记录 | ❌ gitignored |
| 环境变量 `EXPERIENCE_CONFIG_ENCRYPTION_KEY` | AES-256-GCM 解密密钥（32 字节 hex） | ❌ 不入库 |

**纪律**：
- API key 仅以 AES-256-GCM 密文持久化
- 加密密钥经环境变量注入，与密文分离
- 运行时 `configStore.load()` 解密密钥——仅在内存持有
- API 响应只有脱敏掩码（`sk-***后4位`）+ `hasKey` 标记
- model-gateway 只读取配置，不写入——所有配置变更经 `/config` 页面

### 运行时网关解析

```
1. EXPERIENCE_LLM_GATEWAY_SEAM=1 → 证据故障注入（仅测试环境）
2. hasEnabledPersistedConfigSync() → PersistedConfigLlmGateway（真实模型）
3. loadProviderGatewayConfig() → ProviderLlmGateway（环境变量配置）
4. 无配置 → undefined → MODEL_NOT_CONFIGURED（不假装回答）
```

### 调用链路

```
体验引擎 → ProviderLlmGateway → 直接调用上游 chat/completions
体验引擎 → generation-gateway.ts → 直接调用上游 images/generations
体验引擎 → generation-gateway.ts → 直接调用上游 audio/speech
体验引擎 → generation-gateway.ts → 直接调用上游 videos

模型网关 :3031 → 同一份配置 → 同一套上游调用
```
