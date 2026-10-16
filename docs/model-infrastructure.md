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

## 2026-10-15 图像提供方新增：元宝生图（腾讯混元 Hy-Image）

### 结论：元宝 App 没有可对接的本地接口

本机 `/Applications/元宝.app` 是直连腾讯云的客户端：不监听任何 TCP 端口
（`lsof -nP -iTCP -sTCP:LISTEN` 无记录），无本地 HTTP 服务、无开放 SDK，
也没有对外可用的会话凭证接口。因此「调用本机元宝 App 生图」不存在
可实现的路径——只能接它背后的**同一模型**。

元宝的「AI 生图」用的是腾讯混元生图模型（界面上显示的
`Hy Image3.5 preview` 即混元图像 3.5 预览版，2026-09-22 发布时曾在元宝
App 灰度）。腾讯通过**大模型服务平台 TokenHub** 对该系列开放官方 API，
这就是本次接入的提供方。

### 接入形态

| 项 | 值 |
|----|----|
| 提供方预设 | `元宝生图`（配置页「快捷接入」一键填充） |
| 端点 | `https://tokenhub.tencentmaas.com/v1` |
| 缺省模型 | `hy-image-v3.5-preview`（可选 `hy-image-v3`） |
| 鉴权 | `Authorization: Bearer <API KEY>`（TokenHub 控制台获取） |
| 调用形态 | 同步——一次请求直接出图，无任务轮询 |
| 模型列表 | `GET /v1/models`（兼容 OpenAI 协议，配置页自动拉取） |

### 契约差异（`image-contract.ts`）

混元生图**不是** OpenAI 兼容的 `images/generations`，走自有路径，
由 `imageProviderOf()` 按模型名（`hy-image-*`）判定，端点域名兜底：

| 模型 | 路径 | 请求体 | 产物字段 |
|------|------|--------|----------|
| `hy-image-v3.5-preview` | `/wand/hunyuan-image/v35-generation` | `messages` 多模态协议（文本 + `image_url` 参考图） | `choices[0].delta.image.url` |
| `hy-image-v3` | `/wand/hunyuan-image/v3-generation` | `prompt` + `images[]`（≤3） | `data[0].url` |

画幅经 `hunyuanImageSize()` 映射为官方 `size`（"宽x高"），两代约束不同：
3.5 按 2K 档位（面积 ≤ 4M），3.0 按 1M 面积上限（宽高 ∈ [512, 2048]）。
未指定画幅时 3.5 改传 `generate_max_pixels` 面积档位，3.0 交给官方预设尺寸。

纯函数（判定 / 请求体构造 / 响应解析）在 `src/experience/image-contract.ts`
与 `mini-services/model-gateway/src/providers/image-contract.ts` 各持一份
同源副本（与 `video-contract.ts` 的移植纪律一致），由
`tools/unit/image-contract.test.ts` 同时锁定两份行为。

### 配置步骤

1. 腾讯云控制台开通 TokenHub，在「在线推理 - 视觉模型」开启 Hy-Image 后付费
2. TokenHub 控制台创建 API Key
3. 本项目 `/config` 页 → 图像生成 → 「添加」→ 点「元宝生图」快捷接入
4. 填入 API Key → 保存 → 设为默认

### 注意

- 产物 URL 是临时签名地址（有效期 12 小时），须及时下载转存——
  `media-gateway` 的 `artifactToBuffer()` 已在生成后立即落盘 `data/media/`
- `422` = 内容安全审核拦截（非瞬态，不重试）；`429`/`5xx` 按瞬态退避重试一次
- TokenHub 支持广州（`tokenhub.tencentmaas.com`）与新加坡
  （`tokenhub-intl.tencentmaas.com`）两个地域，不支持跨地域调用

## 2026-10-15 图像提供方新增：元宝 App 本机生图（辅助功能桥接）

上一节结论需要修订：元宝 App 虽然没有本地 API，但它的**辅助功能
（Accessibility）树完整暴露了聊天界面**——输入区、AI 生图开关、发送、
生成图元素与图片查看器都在。于是「调用本机元宝 App 生图」可以走
UI 自动化实现，不必依赖 TokenHub 的 API Key。

### 桥接形态（tools/yuanbao-bridge）

macOS 的辅助功能授权按**代码签名**授予进程，普通 CLI（Node 子进程 /
shell）拿不到授权；只有经 LaunchServices 启动、被加入「辅助功能」列表
的 .app 才稳定持有。所以桥接做成独立 app：

| 项 | 值 |
|----|----|
| 源码 / 构建 | `tools/yuanbao-bridge/Sources/YuanbaoBridge.swift`、`build.sh` |
| 安装位置 | `/Applications/YuanbaoBridge.app`（授权绑定此路径） |
| 监听 | `127.0.0.1:3210`（仅回环，`YUANBAO_BRIDGE_PORT` 可改） |
| 启动 | `tools/yuanbao-bridge/start.sh` |

对产品暴露的就是 OpenAI 兼容的图像端点，因此生成网关零改动：

| 接口 | 行为 |
|------|------|
| `POST /v1/images/generations` | 驱动元宝：新建会话 → 开 AI 生图 → 粘贴提示词 → 回车 → 等新图 → 打开查看器逐张无水印下载 |
| `GET /v1/images/<id>` | 回传已下载的图片字节 |
| `POST /v1/ax` | 通用 AX 原语（dump / query / act / key / click / script），流程调优不必重编桥接 |
| `GET /health` | `trusted`（辅助功能是否生效）+ 元宝是否在运行 |

### 关键实测结论

- 元宝是 Tauri/WKWebView 应用：app 元素在 AX 树里自引用嵌套，遍历必须
  以 `kAXWindowsAttribute` 的窗口为根，跳过 app→app 层。
- 生成图在 AX 里是 `AXImage`，`description` 就是提示词（Web alt 文本），
  带 `AXPress / AXShowMenu / AXScrollToVisible` 动作。
- 聊天里的图组是横向滚动条，第四张的 frame 落在视口外点不到；查看器内
  逐张翻页下载才拿得全。翻页用方向键，连续两次无新文件即停。
- 发送按钮是 `AXGroup`，其 `AXPress` 静默无效——用回车键触发。
- 历史消息同样带图，完成判定用「发送前大图基线对比」而非文本标记
  （文本标记会匹配历史消息）。

### 授权与重建

辅助功能授权绑定签名指纹。ad-hoc 签名下重新编译会换指纹，需要在
「系统设置 → 隐私与安全性 → 辅助功能」重新打开开关；安装位置改为
`/Applications` 是为了让这条记录稳定可复现。

### 配置步骤

1. `tools/yuanbao-bridge/build.sh`，产物安装到 `/Applications/YuanbaoBridge.app`
2. `tools/yuanbao-bridge/start.sh`，若提示未授权则到系统设置打开开关
3. `/config` 页 → 图像生成 → 「添加」→ 点「元宝 App 本机生图（AI 生图）」
   快捷接入——本机桥接不校验密钥，表单占位值会自动补上
4. 保存并设为图像默认

### 边界

- 一次生成会占用本机元宝会话（自动化会新建会话），元宝必须已登录
- 产物在本机磁盘（`~/Library/Application Support/YuanbaoBridge/images`），
  不再是临时签名 URL，无 12 小时过期问题
- 同提示词短时去重：网关超时重试不会在元宝里重复生成
