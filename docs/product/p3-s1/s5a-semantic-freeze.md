# S5A 语义冻结文本（S5A-SEMANTIC-FREEZE-01 v1.0.0）

**状态：** FROZEN——产品负责人（用户本人，PD-15）2026-10-10 裁决（D-1…D-7 全项 A，经 S5-SCOPE-PROPOSAL-01 v1.0.0 裁决）
**编号：** S5A-SEMANTIC-FREEZE-01
**版本：** 1.2.0（2026-10-10：CR-38 增量流式形态修订——D-2 增 `stream:true` 流式变体（SSE `data:` 行解析 `choices[0].delta.content`）+ 接口可选方法 `proposeStream` + `LlmRequest.signal` 取消 + 流式形态完成时机纪律（§1 D-2 增量流式形态节）+ C6 chunk 事件流式语义（运行计数，done 为最终总数）；v1.1.0 语义（D-5 通用机制 / S5B 注记）不变；v1.0.0 冻结文本经 v1.1.0 更正）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** S5-SCOPE-PROPOSAL-01 v1.0.0（RULED——D-1…D-7 全项 A）/ ADR-0002 §3（硬边界解除——本冻结文本为该解除的版本化登记）/ P3-S1-PRIVACY-SIX-01 v0.4.2（隐私六要素——要素 2：区域=中国大陆（cn）/ 服务商=阿里云 / 介质=云存储）/ SRC-06 §16/§17（LLM Request 结构化 / LLM Response 为 Proposal / LLM 禁止动作）/ `src/experience/llm-gateway.ts`（`LlmGateway` 接口——提供方抽象层）/ OBL-02-LATENCY-METHOD-01 v1.0.0（延迟测量分层）/ policy_v2.3.0（不变）/ state_machine_v1.5.0（不变）/ C6 事件契约（不变——chunk 事件 totalChunks 流式语义经本版登记）/ S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0（RULED——配置面切片）
**记录日期：** 2026-10-10

## 1. 语义定义（D-1…D-7 裁决原文——版本化冻结）

### D-1：接入架构（model-agnostic）与首个验证提供方

- **架构**：`LlmGateway` 接口即提供方抽象层——产品运行时只依赖接口（`propose(LlmRequest)→LlmProposal`），不依赖任何提供方实现；提供方身份（provider / model / 参数）经配置注入。产品代码不写死任何提供方。
- **提供方选择机制（S5 形态）**：环境变量配置——`EXPERIENCE_LLM_MODE`（运行模式）/ `EXPERIENCE_LLM_PROVIDER`（提供方标识）/ `EXPERIENCE_LLM_MODEL`（模型名，覆盖提供方默认模型）。用户面选择 UI 属后续暴露层切片（另行 staged 提案）。
- **首个验证提供方**：`dashscope`（阿里云 DashScope 平台 / 通义千问 Qwen 系列——与已签署隐私六要素要素 2 对齐：区域=中国大陆（cn）、服务商=阿里云）。**仅用于路径验证与证据执行，非产品默认、非产品写死**。
- **用户可选集**：经 D-5 隐私再确认的提供方集合——**选择自由以隐私确认为边界**；未确认提供方不得启用（治理约束，非技术限制）。

### D-2：上下文构造纪律（按提供方版本化的构造规则族）

- 构造规则按提供方版本化冻结——本冻结文本登记首个提供方规则（dashscope profile v1）：
  - **端点**：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`（DashScope OpenAI 兼容模式——HTTPS POST）
  - **鉴权**：`Authorization: Bearer $EXPERIENCE_LLM_API_KEY`（API key 仅运行期环境变量注入——绝不写死、绝不落盘、不进日志、错误信息不得包含 key）
  - **请求体**：`{ model, messages: [system, user], temperature }`——`model` 默认 `qwen-plus`（`EXPERIENCE_LLM_MODEL` 覆盖）；`temperature` 固定 `0.7`（版本化默认值）；`stream` 不设置（单次完整响应——`propose()` 形态）
  - **system 消息（冻结原文）**：`你是个人体验引擎的回应生成器。依据提供的上下文，生成对用户的回应内容。`
  - **user 消息（确定性映射）**：`LlmRequest.context` 为运行时构造的 `{ raw_input, memory_signals }` 形态——user 消息内容 = `raw_input` + 换行 + `[memory_signals]` + 换行 + `JSON.stringify(memory_signals)`；`context` 缺失该形态时回退 `JSON.stringify(context)`（防御性兜底——确定性）
  - **响应解析（确定性映射）**：`choices[0].message.content` → `LlmProposal.content`；`state_update_proposal` 恒空对象 `{}`（LLM 禁止动作 §17——提供方不提案状态写入，越权提案经 `validator.ts` 拒绝路径强制）；`confidence` 恒 `1.0`（提供方未返回结构化置信字段——映射为固定值，与合成模式一致；未来提供方返回结构化置信时经版本化修订）
  - **失败映射**：HTTP 非 2xx / 网络错误 / 响应形态缺失（无 `choices[0].message.content`）→ 以异常向上抛出（错误信息仅含 provider / 状态码 / 调用计数——不含 key、不含请求体）；由运行时统一捕获映射为 `LLM_UNAVAILABLE`（HTTP 503，retryable=true——与既有故障语义一致）
- **增量流式形态（v1.2.0 / CR-38 增补——同一构造规则族的流式变体）**：
  - **请求体**：同上加 `stream: true`（chat-completions 兼容 SSE 流式形态）；`LlmRequest.signal`（可选 AbortSignal）经 fetch `signal` 注入——取消中止上游连接
  - **响应解析（SSE）**：`data:` 行逐片解析——`choices[0].delta.content` 为内容增量（空增量跳过）；`[DONE]` 终止；非 JSON `data:` 行 → 形态缺失错误（同失败映射纪律——错误信息仅含 provider / 调用计数）
  - **接口形态**：`LlmGateway` 增可选方法 `proposeStream?(request: LlmRequest): AsyncIterable<string>`——提供方网关覆写为真流式；合成 / 故障注入网关不实现（运行时经可选方法存在性判定回退 `propose()` 单次完整路径——行为零变化）
  - **运行时流式形态完成时机**：版本化提交先于流（header 携带已提交版本）；chunk 事件随 delta 逐片产出（真流式呈现）；`llm_request_completed` / 验证（S1-08）/ `llm_output_validated` / 决策轨迹 / WHAT_IF 模拟结果登记于**流末**产出（静态形态于流前——完成时机差异经本版登记；事件契约 / 名称 / 形状不变）
  - **流末提案构造**：运行期于流末构造提案（`proposal_id` 经提供方提案 id 分配器——与 `propose()` 共享计数不重复；`content` = 增量累计；`state_update_proposal` 恒空 `{}`；`confidence` 恒 `1`——提供方网关构造不变式）并经 `validateProposal` 验证（S1-08 纪律不变；拒绝链对提供方构造提案结构不可达——保留同形拒绝链以守纪律）
  - **C6 chunk 事件流式语义**：chunk 事件 `totalChunks` 为已产出数（运行计数——流式形态总数于流末可知）；`done` 事件携带最终总数（静态形态 `totalChunks` 为语料总块数——不变）
  - **取消**：信号中止 → `cancelled` 事件（与静态路径同形）；提供方流故障（非取消）向上抛出——客户端按连接中断处理（不静默回退——与失败语义一致）
  - **范围**：探索路径先行（`executeChange` / `executeContentGeneration`——WHY / WHAT_IF / DEEPEN / SIMPLIFY / REFRAME / 换一个）；CREATE / CORRECTION 域流式化属后续切片；STOP 永不流式（策略硬边界——不产出内容分块，`stopped` 事件纪律不变）
- 新增提供方经各自构造规则版本化冻结后方可启用（每次扩展走「范围提案 staged → 产品负责人裁决 → 语义冻结 → 动态证据」链）。

### D-3：双模式运行纪律

- **合成模式为 DEFAULT**：无 `EXPERIENCE_LLM_MODE` 环境变量时运行时保持默认合成网关——行为与 S1–S4 完全一致（黄金套件 G3-GOLDEN-0001 48/48 不变式）。
- **LLM 模式**：`EXPERIENCE_LLM_MODE=provider` 启用——按 `EXPERIENCE_LLM_PROVIDER` 加载已登记提供方规则（未登记提供方 → 拒绝启动并报错；配置不得绕过版本化纪律）；API key 缺失 → 拒绝启动并报错（不静默回退合成模式——静默回退将违背「LLM 模式已启用」的启用意图）。
- **证据注入缝优先**：`EXPERIENCE_LLM_GATEWAY_SEAM=1`（证据故障注入）优先于 LLM 模式——证据 / 测试环境纪律不变。

### D-4：证据策略

- **双层证据**：① 合成基线回归不变（G3-GOLDEN-0001 再生 48/48 不变式 + S2B-0001 重跑）；② LLM 模式结构断言（S5A-F1-0001——信封有效 / sequence 单调 / policy_v2.3.0 版本 / state_version 链 +1 不变式 / llm_used 标记 / 禁止动作拒绝路径）——**内容不断言字节**（真实模型输出非确定性）。
- 接口契约断言对任何提供方一致——证据面随提供方数线性扩展，不随模型内容膨胀；新增提供方经各自结构证据（S5A-F1-0001 形态重跑）后启用。
- API key 经环境变量运行期注入（用户提供，不落盘、不提交、不进日志）。

### D-5：隐私再确认（逐提供方）

- 每个提供方启用前，产品负责人 + 安全负责人确认其 DPA / 数据处理条款与已签署六要素一致（要素 2 区域 / 服务商、要素 4 传输加密、要素 1 留存期限）；确认前该提供方不得处理任何真实用户输入（证据运行仅合成输入）。
- **确认记录经通用模板签署**——提供方名称于签署时填写，不预设、不写死任何提供方于冻结文本（2026-10-10 产品负责人指令修订：D-5 不写死 DashScope——逐提供方通用机制）。首个验证提供方（dashscope）的确认为本机制的首个实例——于启用前经同一通用模板签署。

### D-6：延迟测量纪律

- 按 OBL-02-LATENCY-METHOD-01 v1.0.0 §3 分层（provider / model / version——与 model-agnostic 架构天然对齐，样本窗口 §5）；阈值另行裁决（PB-03 / PD-08——无真实用户基线不编造统计阈值）；S5 周期仅登记参考统计量，不构成指标宣称。

### D-7：实施路径

- 一次性实施：model-agnostic 接入架构（配置化提供方选择 + 构造规则族加载）→ 首个验证提供方（dashscope）接入与路径验证 → S5A-F1-0001 证据执行器 → S5 G5 评测链（16 项框架范围定义提案另行 staged）。第二提供方起属后续切片。

## 2. 不变量（零回归核验）

- 策略语义不变（policy_v2.3.0 不变——优先级链、冻结映射表、REPEAT/CONTINUE 语义全不变）；状态机不变（state_machine_v1.5.0 不变）；事件契约不变（C6 不变——S5 不新增事件名、不新增路由；chunk 事件 `totalChunks` 流式语义经 v1.2.0 登记）。
- 合成模式行为零变化（无环境变量时——G3-GOLDEN-0001 48/48 不变式核验 + S2B-0001 重跑核验；CR-38 后基线回归再核验通过——静态路径代码零改动（仅嵌套于 `!streamingForm` 分支内），黄金 48/48 + S2B 7/7 退出码 0）。
- LLM 禁止动作（§17）对真实提供方提案同样强制（`validator.ts` 拒绝路径——网关层不因「真实」而豁免；流式形态提案于流末构造后同样经 `validateProposal` 强制）。
- 失败语义不变：提供方失败 → `LLM_UNAVAILABLE`（HTTP 503，retryable=true——S2A-OBL-01-0001 已覆盖路径）；流式形态提供方流故障（非取消）向上抛出——客户端按连接中断处理（不静默回退）。

## 3. 环境变量登记（实现细节——S5 形态）

- `EXPERIENCE_LLM_MODE`——运行模式（缺省 = synthetic；`provider` = LLM 模式）。纪律：仅证据 / 测试环境启用——不处理真实用户输入。
- `EXPERIENCE_LLM_PROVIDER`——提供方标识（S5 登记集：`dashscope`）。纪律：未登记值 → 拒绝启动并报错。
- `EXPERIENCE_LLM_MODEL`——模型名（覆盖提供方默认——dashscope 默认 `qwen-plus`）。纪律：自由字符串（提供方可解析性由提供方端点裁决）。
- `EXPERIENCE_LLM_API_KEY`——提供方 API key。纪律：仅运行期环境变量；绝不写死 / 落盘 / 进日志 / 进错误信息。
- `EXPERIENCE_LLM_GATEWAY_SEAM`——证据故障注入缝（既有——优先于 LLM 模式）。纪律：仅证据 / 测试环境（`=1` 启用）。
- `EXPERIENCE_GATEWAY_FAULT_MODE`——注入故障形态（既有）。纪律：`unavailable`（默认）/ `fail_once` / `succeed_once`。
- 配置形态注记（v1.1.0）：本节环境变量形态为 S5 证据 / 测试环境配置形态；用户页面配置形态（用户经页面添加 API key、配置多个不同提供商的对应模型）属 S5B 配置面切片（CR-33——S5B-CONFIG-SURFACE-PROPOSAL-01 staged，另行裁决）。

## 4. 明确非结论

- 本冻结文本不设置任何产品 Gate 为 PASS（E5 §2）；实施完成以动态证据 + 独立评测为准（S5 G5 评测链另行 staged）。
- 用户面选择 UI（提供方 / 模型设置）不在本冻结文本——属后续暴露层切片。
- 延迟阈值不在本冻结文本——另行裁决（PB-03 / PD-08）。

## 5. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10。
- 产品负责人裁决：**D-1…D-7 全项 A，2026-10-10**（经 S5-SCOPE-PROPOSAL-01 v1.0.0 裁决——「和模型无关」为产品初衷，提供方必须可选择）。
- v1.2.0 修订（CR-38 增量流式形态）：工程负责人角色（代理，Codex）起草，2026-10-10——产品负责人 2026-10-10 指令「不是流式回答的」驱动；实施登记：`LlmGateway.proposeStream` 可选方法 + `ProviderLlmGateway` SSE 解析 + `LlmRequest.signal` 取消 + 运行时双形态分支（`executeChange` / `executeContentGeneration`）+ 委托网关流式能力（随启用配置即时变化）+ 基线回归（G3-GOLDEN-0001 48/48 + S2B-0001 7/7 退出码 0）+ 真流式动态核验（TTFB 13ms——header 先于 LLM 调用到达；chunk 事件跨 LLM 生成窗口渐进到达）。
- D-5 隐私再确认（逐提供方通用模板——提供方名称于签署时填写，不写死任何提供方）：（待签署——首个实例于首个验证提供方启用前经本模板签署，产品负责人 + 安全负责人双人确认）
- 实施登记：v1.0.0/v1.1.0（待实施——ProviderLlmGateway + 配置加载 + server-runtime 环境缝扩展 + 动态证据 S5A-F1-0001 + 基线回归）——S5 机制层已实施（eb7a28d）；S5A-F1-0001 结构证据 NOT RUN（待用户侧前置：API key 运行期注入 + D-5 首个实例签署）；CR-38 流式形态已实施（本版登记）——S5A-F1-0001 执行时覆盖流式形态结构断言（信封有效 / sequence 单调 / state_version 链 +1 / llm_used 标记）。
