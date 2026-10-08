# C4 逐章对照简报（SRC-23 → SRC-24 等价性分析）

**编号：** C4-SIGNOFF-BRIEF-01
**版本：** 0.1.0
**状态：** DRAFT——AI 架构负责人（用户本人，角色 3）签署 `C4-signoff-checklist-v1.md` 前的对照支持材料；本文件不是治理工具，不改变处置表内容，不构成 C4 成立
**编制：** 本会话代理（只读分析）；裁定权归 AI 架构负责人
**对象：** SRC-23（`P3-S1-C07～C08`，SHA-256 `e3d19f98…`）32 章 vs SRC-24（`P3-S1-C07～C09`，SHA-256 `be86a386…`）30 章
**用途：** 支撑 C4-signoff-checklist §2 逐章签署与 §1 K-1…K-5 确认；每章给出等价性评估与签署建议，SRC-23 原文条款效力不因本简报改变

## 1. 逐章对照（32 章）

| SRC-23 章 | SRC-24 对应 | 等价性评估 | 签署建议 |
|---|---|---|---|
| §1 核心原则 | §1 | 原则等价（模型无关、LLM=能力提供方非产品权威）；SRC-24 增"可追踪/可解释/可回放"原则与组件职责划分；SRC-23 的"模型只能存在于五处"（Model Configuration/Model Registry/Routing Configuration/Provider Adapter/Evaluation Baseline）与"七不得进入"清单（ExperienceState/Intent Contract/Policy Contract/State Machine/Runtime Core/Frontend/Product API）未在 SRC-24 §1 重述，由 §12/§17 执行 | 接受（注记） |
| §2 C07 网关定义 | §2.1 | 等价：网关为唯一边界，提供商特定实现终止于适配器 | 接受 |
| §3 模型无关性要求 | §2.1 / §3 | 等价：硬编码禁止项与 `if model == xxx` 示例相同 | 接受 |
| §4 Model Configuration | §3 | JSON 结构几乎逐字相同；"配置是数据不是逻辑"一致 | 接受 |
| §5 Model Registry | §3 | **差异**：多 Provider/Model/Version/Capability 注册表结构在 SRC-24 无对应；"不得绑定唯一模型"由 §2.1 保留。处置表已定"S1 完整注册表不纳入" | 部分映射；裁定 D1 |
| §6 Model Capability Profile | §3 / §4 | **差异**：SRC-23 §六列 10 个能力维度（Structured Output/Reasoning/Long Context/Tool Calling/Streaming/Multimodal/Latency/Cost/Reliability/Safety Capability）；SRC-24 §3 配置结构仅 5 个能力标志（structured_output/tool_calling/vision/long_context/streaming）；Latency/Cost/Reliability/Safety 由 §4 路由输入覆盖；Reasoning 在 SRC-24 无专属标志或路由输入（仅被 §4 通用「Required Capability」间接覆盖） | 部分映射；裁定 D2 |
| §7 Model Routing | §4 | 等价：路由属基础设施决策而非产品策略；输入清单相同 | 接受 |
| §8 模型选择输入 | §4 | 等价（SRC-24 合并 §7/§8）；停留/参与/点击概率禁止项相同 | 接受 |
| §9 模型选择可追踪 | §5 / §6 | SRC-24 为超集：强制每次调用记录（含失败）、记录 Schema 含 SRC-23 全部字段并扩展 | 接受 |
| §10 Model Fallback | §11 | 等价：Fallback 须重新验证，不得绕过 Validator/Policy、不得改变意图、不得隐藏失败 | 接受 |
| §11 模型输出为提案 | §13 / §15 / §17 | **差异**：提案对象 Schema（`proposal_id / request_id / semantic_action / content / experience_candidate / uncertainty / state_version`）未在 SRC-24 定义；"模型不得直接执行 STOP/CHANGE_STATE/WRITE_…"由 §17 单写入者与 §18 间接保证 | 部分映射；裁定 D3 |
| §12 Structured Output | §13 V1 / §7.3 | 层等价（Schema 验证 + 非法输出分类）；"适配器归一化统一结构"由 §12 适配器职责隐含 | 接受（注记） |
| §13 模型调用生命周期 | §8 | 等价（SRC-24 为超集，增"任何阶段 → STALE_RESULT"） | 接受 |
| §14 Cancellation | §9 | 等价（SRC-24 为超集：触发事件增 Experience Replacement / State Version Invalidated；强制 stale 记录字段） | 接受 |
| §15 Retry Boundary | §10 | 等价；注：SRC-24 §10 有一个空代码块（排版缺陷，无语义影响） | 接受（注记 D10） |
| §16 C08 Validator | §13 | 等价：定义与核心原则一致 | 接受 |
| §17 Validator 检查层 | §13 | **差异**：V1–V8 层名等价，但 SRC-23 的逐层详细检查项（如 V2 的 C01–C07/当前 Experience Contract/当前 LLM Contract、V3 的四 ID、V4 的 STOP/CHANGE/Agency Gate、V6 意图匹配、V7 分支检查、V8 把 engagement 当授权）未在 SRC-24 重述 | 部分映射；裁定 D4 |
| §18 Validator 输出 | §14 / §15 | 等价：验证记录结构逐字相同；四结果语义一致 | 接受 |
| §19 REJECT / REVISE / FALLBACK | §15 | 等价：REVISE 不得改变意图；Fallback 后重新验证 | 接受 |
| §20 Validator 不得替模型"脑补" | **无直接对应**（VAL-06/VAL-07 部分覆盖） | **G1 阻断行**：四项禁止（替模型创造事实 / 替用户创造 Intent / 替 Policy 做产品决策 / 替 Runtime 修改 State）与"隐形产品大脑"机理未在 SRC-24 重述；VAL-06 覆盖"不得直接改状态"、VAL-07 覆盖"不得创造意图"，但"替模型创造事实"与"替 Policy 做产品决策"无直接不变量 | 未证明等价；裁定 D5（必填机制说明） |
| §21 供应商适配层 | §12 | 等价（SRC-24 为超集，禁项增 ExperienceState / Runtime State） | 接受 |
| §22 Provider Lock-in 禁止项 | §2.1 / §3 / §12 / §24 | **差异**：八项明确禁止（Frontend→Provider API、Frontend→Model API、Runtime→Provider SDK、Policy→模型特定逻辑、ExperienceState→供应商特定字段、Intent→模型特定语义、Analytics→硬编码供应商假设、Tests→仅测一家供应商/模型）与"先写死再抽象"债务声明未逐字重述；原则由 §2.1/§3/§24 覆盖 | 部分映射；裁定 D6 |
| §23 Model Evaluation | §24 / E5 / G5 | 实质等价：模型切换须重跑同一套评测；评测作为准入前置流程（处置表已定） | 接受（流程责任确认） |
| §24 模型版本升级 | §24 | 基本等价：重测清单一致；SRC-23 的四类具名回归（意图解释/策略敏感/状态完整性/自主权）未在 SRC-24 具名 | 接受（注记） |
| §25 A/B 与实验边界 | **无对应** | SRC-24 无 A/B 实验边界章节；实验不得改变 Core Schema/State Machine/Policy/STOP/CHANGE/Memory Priority/Agency Rules 的边界在操作规范中无载体 | 明确不在 S1 实施；裁定 D7 |
| §26 C07/C08 核心不变量 | §25 | LLM-01…09 与 VAL-01…10 基本 1:1；**差异**：(a) SRC-24 LLM-08 仅"Model Version is Traceable"，缺 SRC-23 LLM-08 的"可回滚"；(b) SRC-23 LLM-10（请求须支持取消与 stale 拒绝）在 SRC-24 由 §9 与 RUN-04/05 覆盖，但不变量表述不同；SRC-24 增 LLM-11…14 / VAL-11（超集） | 部分映射；裁定 D8 |
| §27 C07/C08 必测案例 | §26 | 覆盖重叠但形态不同：SRC-23 为场景式案例（如"STOP 后模型仍返回→Stale Check→REJECT"、"模型自行提议下一体验→Policy→WAIT"），SRC-24 为失败类别清单；SRC-23 LLM-07 场景在 SRC-24 §26 无直接对应（§28 有 Unauthorized Continuation 阻断项） | 部分映射；测试语料合并确认 |
| §28 C07/C08 验收门槛 | §28 | SRC-24 §28 为超集（22 项 PASS / 12 项硬阻断 vs SRC-23 的 17 项 PASS / 8 项硬阻断；SRC-23 的 8 项硬阻断全部保留于 SRC-24）；**差异**：SRC-23 的 `LLM Proposal Boundary`、`Structured Output`、`Fallback`、`Golden Suite Compatibility` 四项 PASS 条件未列入 SRC-24 §28；`Decision Trace` 仅由 `Runtime Mutation Traceable` 部分代表 | 部分映射；裁定 D9 |
| §29 正式冻结后的模型架构 | §29（状态表） | 内容不同：SRC-23 为目标架构图（与 ADR-0001 模块化单体一致）；SRC-24 §29 为契约状态表 | 接受（架构确认） |
| §30 P3-S1 依赖链更新 | §30 | 互补无冲突：依赖链 vs 执行顺序 | 规划材料 |
| §31 Freeze Status | §29 | 基本一致：均 FREEZE CANDIDATE 且声明不得视为正式冻结；差异：SRC-23 §三十一写 C09 = NEXT（C09 尚未起草时写成），SRC-24 §29 已将 C09 列为 FREEZE CANDIDATE（后写文件，状态更新） | 来源状态 |
| §32 下一步 | §30 | 计划项 | 非规范性 |

## 2. 签署前必须裁定的事项（AI 架构负责人）

| 裁定 | 事项 | 建议 | 影响 |
|---|---|---|---|
| D1 | S1 不建设 Model Registry 产品能力；反单一模型绑定原则经 SRC-24 §2.1 保留 | 接受处置表既定口径 | G1 范围界定 |
| D2 | 能力画像：SRC-23 §六 的 10 个维度中 5 个有 SRC-24 配置标志，4 个（Latency/Cost/Reliability/Safety）由 §4 路由输入覆盖，Reasoning 无专属载体 | S1 最小切片可接受 5 标志 + 路由输入；若要求 Reasoning 作为画像属性或独立路由输入，须在 C4 正式文件扩展 | Schema 设计 |
| D3 | LLM Proposal 对象 Schema 未在 SRC-24 定义：采纳 SRC-23 §11 结构，或在 C4 正式文件中定义 | 必须在 C4 正式文件中定义提案对象（Validator 的验证对象） | C4 正式文件内容 |
| D4 | Validator V1–V8 详细检查项仅存于 SRC-23 §17：建议采纳为规范检查层内容 | 采纳（否则操作规范下 Validator 检查项不完整） | 实现与测试设计 |
| D5 | §20 不脑补：签署"接受"必须附机制说明——事实/推断/未知/缺失信息如何被验证 | 必填；见 §3 机制说明草案 | **G1 阻断** |
| D6 | 八项 Provider Lock-in 禁止（尤其"Tests→仅测一家供应商/模型"）采纳为规范 | 采纳并写入 C4 正式文件；该条直接影响 G5 评测设计 | C4 正式文件 / G5 |
| D7 | A/B 实验明确排除出 S1；未来开展须另行产品批准 | 签署"接受"为 S1 排除项 | 范围 |
| D8 | (a) 采纳 SRC-23 LLM-08 完整表述（模型升级"可评测、可追踪、可回滚"）；(b) 确认取消支持不变量经 SRC-24 §9 + RUN-04/05 覆盖 | 采纳 (a)；确认 (b) | 不变量完整性 |
| D9 | C07/C08 验收标准 = SRC-24 §28 清单（22 项 PASS / 12 项硬阻断）+ 补入 SRC-23 §28 的 LLM Proposal Boundary / Structured Output / Fallback / Golden Suite Compatibility 四项，并确认 Decision Trace 由 Runtime Mutation Traceable 代表或单列 | 补入 C4 正式文件验收标准 | 验收设计 |
| D10 | SRC-24 §10 空代码块为排版缺陷，无语义影响；不需修订 SRC-24（归档源不可变） | 记录在案即可 | 无 |

## 3. §20 机制说明草案（供 AI 架构负责人审定后附于签署）

> 机制说明（草案）：Validator 不生成、不补全、不改写任何事实性内容。事实性主张只能来源于用户输入或已确认的产品状态（ExperienceState / 已确认 Canon）；模型输出中出现源输入之外的事实实体时，Validator 按"未知信息"处理：以 REJECT 或带显式不确定性标记的 REVISE 返回，禁止静默补全。推断必须与事实分离标注（E8-G2-CC07 分离原则）；缺失信息必须以 REJECT / Request Safe Revision 路径返回。验证方式：(1) 负向案例——构造含未提供事实的模型输出，验证器必须拒绝；(2) 轨迹审计——抽查 Validator 记录，确认输出事实实体均可在输入/状态中溯源；(3) 评测样本覆盖事实/推断/未知/缺失四类注入。

## 4. 状态

```text
C4 formal contract: NOT ESTABLISHED（本简报不改变此状态）
逐章签署: PENDING（32 章 + K-1…K-5）
D1–D10 裁定: PENDING（AI 架构负责人）
G1 / A1: NOT PASSED
```
