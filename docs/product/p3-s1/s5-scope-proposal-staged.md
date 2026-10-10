# S5 范围提案（S5-SCOPE-PROPOSAL-01 v0.1.0）

**状态：** STAGED FOR PRODUCT-OWNER RULING（待产品负责人逐项裁决 D-1…D-7）
**编号：** S5-SCOPE-PROPOSAL-01
**版本：** 0.1.0（2026-10-10：实现方起草 staged）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** ADR-0002 §3（硬边界——产品代码不含真实 LLM 提供方——本提案即该边界的版本化解除申请）/ P3-S1-PRIVACY-SIX-01 v0.4.2（隐私六要素已裁决签署——要素 2：区域=中国大陆（cn）、服务商=阿里云、介质=云存储）/ SRC-06 §16/§17（LLM Request 结构化 / LLM Response 为 Proposal / LLM 禁止动作）/ `src/experience/llm-gateway.ts`（`LlmGateway` 接口——`propose(LlmRequest)→LlmProposal`；`SyntheticLlmGateway` / `EvidenceFaultLlmGateway`）/ `src/experience/server-runtime.ts`（`resolveServerGateway()` 环境门控注入缝）/ OBL-02-LATENCY-METHOD-01 v1.0.0（延迟测量方法——分层纪律）/ S4-SCOPE-PROPOSAL-01 v1.0.0（S4 先例）/ decision-register CR-08（隐私六要素关闭登记）
**记录日期：** 2026-10-10

## 1. 事实取证

- **S4 时代全部关闭**（2026-10-10）：S4 G5 独立评测 PASSED（无条件）——P3-S4-G5-WORKSHEET-01 v0.2.0（16 项 = 12 PASS + 1 N/A（第 9 项））；CR-31 RULED→EVALUATED（decision-register v0.38.0）；readiness-record v1.48.0；登记册快照封存（decision-register v0.37.0 @ `e4eb004`）。
- **产品运行时为合成 fixture 模式**（ADR-0002 §3 硬边界）：分类与策略解析均为确定性规则；LLM 提案由 `SyntheticLlmGateway` 按合成语料 fixture 生成——真实提供方从未接入，产品全部「回答」内容来自预写 fixture。
- **`LlmGateway` 接口已就位**（SRC-06 §16/§17 契约）：`propose(LlmRequest)→LlmProposal`；运行时经 `gateway` 选项注入（默认 `SyntheticLlmGateway`）；`server-runtime.ts` 经 `resolveServerGateway()` 环境门控（`EXPERIENCE_GATEWAY_SEAM` / `EXPERIENCE_GATEWAY_FAULT_MODE`——仅证据 / 测试环境启用，默认合成模式不变）。
- **LLM 禁止动作（§17）已由 `validator.ts` 强制**（拒绝 state_update_proposal 等越权提案——GS-06 证据覆盖）；真实提供方提案同样经此验证路径——网关层不因「真实」而豁免。
- **隐私六要素已裁决签署**（P3-S1-PRIVACY-SIX-01 v0.4.2，2026-10-09）：要素 2 存储位置 = 区域=中国大陆（cn）/ 服务商=阿里云 / 介质=云存储；真实用户数据收集护栏已解除——但 ADR-0002 §3 证据沙箱合成数据边界独立生效（证据运行仅合成数据，设计如此）。
- **产品负责人 2026-10-10 会话指令链**：「接 llm 是肯定要接的，就看什么时候接，你来全局判断呀」+「全部按建议，下阶段是让产品活起来了吗？」——产品负责人确认 S5（真实 LLM 接入）为下阶段方向；具体范围与裁决维度经本提案版本化定义，裁决权归产品负责人（登记册约束 §3.1）。

## 2. 范围分析（执行面切换——非语义空缺补齐）

- **S5 不是语义空缺补齐**：C3 语义空缺 G-1…G-7 已经 S4 全部版本化关闭（C3-SEMANTIC-GAP-REGISTER-01 注记）。S5 是执行面切换——**谁生成 `LlmProposal`**（合成 fixture → 真实模型推理）。
- **产品行为影响（现状）**：真实用户输入无法获得模型生成内容；产品处于「治理完备、产品未活」状态——逐屏规格 Screen 05「共同思考」体验（用户提问 → 模型生成回应）尚未由真实推理驱动。
- **范围边界**：S5 不改变策略语义（policy_v2.3.0 不变）、不改变状态机（state_machine_v1.5.0 不变）、不改变事件契约（C6 不变）；仅新增 `ProviderLlmGateway`（`LlmGateway` 接口实现）+ 环境门控启用路径 + 版本化上下文构造规则。
- **硬边界解除性质**：ADR-0002 §3「产品代码不含真实 LLM 提供方」为架构硬边界；其解除属产品决策，须产品负责人版本化裁决（本提案即该解除申请），不得由实现团队自行解释为已授权。

## 3. 裁决选项（D-1…D-7——选项文本经裁决版本化冻结）

### D-1：提供方选择

- **选项 A（实现方建议）**：阿里云地域内提供方（DashScope / 通义千问系列）——与已签署隐私六要素要素 2（区域=中国大陆（cn）、服务商=阿里云）直接对齐，无需隐私版本化修订即满足存储位置裁决；API 调用经阿里云地域内端点；模型名 / 请求参数经 D-2 版本化冻结。（裁决后生效——见 §6）
- **选项 B**：其他地域 / 服务商提供方——须先经隐私六要素要素 2 版本化修订（产品负责人 + 安全负责人双签）方可接入。
- **选项 C**：多提供方抽象层 V1——实现方不推荐（V1 范围膨胀；先单提供方验证完整路径，抽象层待第二提供方需求出现时经新切片裁决）。

### D-2：上下文构造纪律（结构化请求构造规则版本化）

- **选项 A（实现方建议）**：版本化定义 `LlmRequest` 结构化字段 → provider 请求体的构造规则（S5A-SEMANTIC-FREEZE-01 冻结文本——含 model 名、请求参数（如 temperature）、系统提示与上下文组装顺序、响应解析为 `LlmProposal` 的确定性映射：content / state_update_proposal 恒空 / confidence 映射规则）。（裁决后生效——见 §6）
- **选项 B**：实现内自由构造（不版本化）——不推荐（违反登记册约束 §3.1 精神：行为规则须版本化可审计）。
- **选项 C**：仅版本化 model 名——不推荐（构造规则不完整，解析映射仍游离于版本化之外）。

### D-3：双模式运行纪律

- **选项 A（实现方建议）**：合成模式保持 DEFAULT（黄金套件 48/48 回归面不变——G3-GOLDEN-0001 不变式）；LLM 模式经环境门控启用（`EXPERIENCE_LLM_MODE=provider`——与既有 `EXPERIENCE_GATEWAY_SEAM` / `EXPERIENCE_GATEWAY_FAULT_MODE` 缝纪律一致，仅证据 / 测试环境启用，不处理真实用户输入）。（裁决后生效——见 §6）
- **选项 B**：LLM 模式默认——不推荐（破坏合成基线回归面 + ADR-0002 §3 证据沙箱纪律 + 无 key 环境不可运行）。
- **选项 C**：按请求路由——不推荐（V1 复杂度；路由语义本身须另行版本化）。

### D-4：证据策略

- **选项 A（实现方建议）**：双层证据——① 合成基线回归不变（G3-GOLDEN-0001 再生 48/48 不变式 + S2B-0001 重跑）；② LLM 模式结构断言（S5A-F1-0001——信封有效 / sequence 单调 / policy_v2.3.0 版本 / state_version 链 +1 不变式 / llm_used 标记 / 禁止动作拒绝路径（越权 state_update_proposal 经 validator 拒绝）——内容不断言字节（真实模型输出非确定性）；API key 经环境变量运行期注入（用户提供，不落盘、不提交、不进日志）。（裁决后生效——见 §6）
- **选项 B**：内容字节断言——不推荐（真实模型输出非确定性，字节断言必然 flaky，污染证据基线）。
- **选项 C**：仅人工演示无证据——不推荐（违反 E5 证据纪律；演示不设置任何 Gate 为 PASS）。

### D-5：隐私再确认（用户侧前置）

- **选项 A（实现方建议）**：LLM 模式启用前，产品负责人 + 安全负责人确认所选 provider 的 DPA / 数据处理条款与已签署六要素一致（要素 2 区域 / 服务商、要素 4 传输加密、要素 1 留存期限）；确认前 LLM 模式不处理任何真实用户输入（证据运行仅合成输入）。（裁决后生效——见 §6）
- **选项 B**：跳过再确认直接启用——不推荐（六要素签署针对产品数据存储面，provider 调用链（提示词 / 上下文出境）须单独核对）。
- **选项 C**：由实现方代确认——不允许（登记册约束：不得由实现者、编码者或代理代填隐私裁决值）。

### D-6：延迟测量纪律

- **选项 A（实现方建议）**：按 OBL-02-LATENCY-METHOD-01 v1.0.0 §3 分层（provider / model / version 分层，样本窗口 §5）；阈值另行裁决——PB-03 / PD-08（无真实用户基线不编造统计阈值）；S5 周期仅登记参考统计量，不构成指标宣称。（裁决后生效——见 §6）
- **选项 B**：S5 即宣称延迟指标——不允许（违反 OBL-02 §6 披露纪律）。
- **选项 C**：不测量——不推荐（方法已批准，LLM 模式增量测量成本低）。

### D-7：实施路径

- **选项 A（实现方建议）**：一次性实施（语义冻结 S5A-SEMANTIC-FREEZE-01 → `ProviderLlmGateway` 实施（`src/experience/llm-gateway.ts` 新增；runtime 经既有 `gateway` 选项注入；`server-runtime.ts` 环境缝扩展 `EXPERIENCE_LLM_MODE`）→ S5A-F1-0001 证据执行器 → S5 G5 评测链（16 项框架范围定义提案另行 staged））。（裁决后生效——见 §6）
- **选项 B**：分批（先网关骨架 → 再证据）——不推荐（单切片即可闭合；分批产生中间未完成态与额外治理开销）。
- **选项 C**：仅冻结不实施——保留为备选（产品负责人可仅裁决语义不授权实施，实施授权另行签发）。

## 4. 选项 A 实施影响（D-1…D-7 全项 A）

- 新增 `src/experience/llm-gateway.ts` `ProviderLlmGateway`（`LlmGateway` 接口实现——HTTPS 调用 provider 端点；失败以异常向上抛出，由运行时统一捕获映射为 `LLM_UNAVAILABLE`（HTTP 503，retryable=true——与既有故障语义一致，S2A-OBL-01-0001 已覆盖该路径）。
- `server-runtime.ts`：`resolveServerGateway()` 扩展 `EXPERIENCE_LLM_MODE=provider` 分支（合成默认不变——无环境变量时行为零变化）。
- 无 policy 版本变更（policy_v2.3.0 不变）；无状态机变更（state_machine_v1.5.0 不变）；无事件契约变更（C6 不变）；无 HTTP 面变更（S5 不新增路由——进程内形态；HTTP 形态经既有路由）。
- API key 纪律：环境变量注入（provider 指定环境变量名，S5A-SEMANTIC-FREEZE-01 登记）；绝不写入代码、日志、证据产物、git 历史。
- 动态证据计划：S5A-F1-0001（LLM 模式结构断言）+ G3-GOLDEN-0001 再生（48/48 不变式核验）+ S2B-0001 重跑。
- 用户侧前置：产品负责人提供 provider API key（运行期环境变量）+ D-5 隐私再确认签署——二者均为实施开工前置条件。

## 5. 明确非结论

- 本提案不预判任何裁决结果；不改变任何已冻结证据；真实提供方接入的裁决权归产品负责人（登记册约束 §3.1）。
- 选项 B/C 的选择不改变已提交证据；产品运行时保持合成模式直至裁决后实施。
- 本提案不构成任何 Gate 状态变化（S4 G5 PASSED 无条件结论不受影响）；不设置任何产品 Gate 为 PASS（E5 §2）。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10。
- 产品负责人裁决：（待裁决——D-1…D-7 逐项）
- 独立评测人（角色 5，用户本人，PD-15）：（待评测执行——S5 G5 评测链另行 staged）
