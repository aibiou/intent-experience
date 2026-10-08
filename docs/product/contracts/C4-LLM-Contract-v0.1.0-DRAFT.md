# C4｜LLM Contract（大模型契约）正式文件

**编号：** C4-LLM-CONTRACT-01
**版本：** 0.1.0 DRAFT
**状态：** DRAFT——待 AI 架构负责人批准（K-4）与非作者会签 + 范围指纹登记（K-5）；批准前 C4 正式权威未建立，G1 保持 NOT PASSED
**Owner：** AI 架构负责人（用户本人兼任，PD-15 / OWNER-ROSTER-01 行 3）
**建立依据：** CR-11 / PD-04；C4-signoff-checklist v1.0.0（32 章签署 + D1–D10 裁定，2026-10-08）；C4-signoff-comparison-brief-v1（等价性分析）
**内容来源：** SRC-23（P3-S1-C07～C08，32 章，处置表 + 逐章签署）与 SRC-24（P3-S1-C07～C09，操作规范候选）中经裁定采纳的条款；来源哈希见 `reference/SHA256SUMS`
**范围指纹：** PENDING（K-5 批准时按本文 §10 登记全节 SHA-256 清单）

## 1. 核心原则与边界（SRC-23 §1，签署接受）

- 模型无关：产品行为不得依赖任何特定模型 / 供应商 / 版本；LLM 是能力提供方，不是产品权威。
- 模型只能出现在五处：Model Configuration、Model Registry（S1 不建，见 §2）、Routing Configuration、Provider Adapter、Evaluation Baseline。
- 模型不得进入七处：ExperienceState、Intent Contract、Policy Contract、State Machine、Runtime Core、Frontend、Product API。
- 增补（SRC-24 §1）：可追踪、可解释、可回放；组件职责划分以 SRC-24 操作规范为准。

## 2. Model Registry（裁定 D1）

S1 不建设 Model Registry 产品能力（多 Provider / Model / Version / Capability 注册表不纳入）；反单一模型绑定原则（"不得绑定唯一模型"）由本契约 §3 / §5 保留。完整 Registry 若进入后续切片，须版本化扩展本契约。

## 3. 模型配置与能力画像（裁定 D2）

- Model Configuration 为纯数据（JSON），不是逻辑；结构与 SRC-24 §3 一致。
- 能力画像 = 5 个配置标志：`structured_output` / `tool_calling` / `vision` / `long_context` / `streaming`。
- 路由输入覆盖 Latency / Cost / Reliability / Safety；Reasoning 无专属标志，经 §4 路由的通用 `Required Capability` 覆盖。若后续需要 Reasoning 作为画像属性或独立路由输入，须版本化扩展本契约。

## 4. 模型路由与选择（SRC-23 §7/§8）

- 路由属基础设施决策，不是产品策略；选择输入清单与禁止项（停留时长 / 参与度 / 点击概率不得作为选择输入）按 SRC-24 §4 原文。
- 每次调用（含失败）必须记录：模型选择可追踪记录结构按 SRC-24 §5/§6（SRC-23 §9 的超集）。

## 5. Provider Lock-in 八项禁令（裁定 D6，规范性）

1. Frontend 不得调用 Provider API；
2. Frontend 不得调用 Model API；
3. Runtime 不得直接使用 Provider SDK（经 Provider Adapter 终止）；
4. Policy 不得包含模型特定逻辑；
5. ExperienceState 不得含供应商特定字段；
6. Intent 不得含模型特定语义；
7. Analytics 不得硬编码供应商假设；
8. Tests 不得仅测一家供应商 / 模型（直接影响 G5 评测设计）。

禁止"先写死再抽象"债务路径。Fallback 须重新验证（不得绕过 Validator / Policy、不得改变意图、不得隐藏失败）。

## 6. LLM Proposal 对象 Schema（裁定 D3，本契约定义）

模型输出只能是 Proposal，结构（最小 S1 版）：

```text
proposal_id            string  唯一
request_id             string  关联调用
semantic_action        enum    已启用动作（S1：DIRECT_ANSWER / WHY / WHAT_IF / CHANGE_DIRECTION 提案 / STOP 由用户侧发起，模型不得直接执行）
content                object  按 semantic_action 定义的结构化内容
experience_candidate   object  候选体验（提案，非状态）
uncertainty            object  事实 / 推断 / 假设显式分离标注（含"未知 / 缺失"标记）
state_version          integer 绑定调用时的 expected_state_version（规范名，PD-16；别名 expected_version / state_version）
```

未经 Validator、Policy、State Machine 接受的 Proposal 不得进入 Runtime 状态。

## 7. Validator 检查层（裁定 D4）

V1–V8 检查层名与定义以 SRC-24 §13 为准；各层详细检查项按 SRC-23 §17 原文采纳为规范内容（V2 跨契约一致性 C01–C07 / 当前 Experience Contract / 当前 LLM Contract；V3 四类 ID；V4 STOP / CHANGE / Agency Gate；V6 意图匹配；V7 分支检查；V8 不得把 engagement 当授权）。验证输出（REJECT / REVISE / FALLBACK）语义按 SRC-24 §14/§15；REVISE 不得改变意图。

## 8. 不得"脑补"机制（裁定 D5，SRC-23 §20——经审定的落地机制说明）

Validator 不生成、不补全、不改写任何事实性内容。事实性主张只能来源于用户输入或已确认的产品状态（ExperienceState / 已确认 Canon）；模型输出中出现源输入之外的事实实体时，Validator 按"未知信息"处理：以 REJECT 或带显式不确定性标记的 REVISE 返回，禁止静默补全。推断必须与事实分离标注（E8-G2-CC07 分离原则）；缺失信息必须以 REJECT / Request Safe Revision 路径返回。验证方式：(1) 负向案例——构造含未提供事实的模型输出，验证器必须拒绝；(2) 轨迹审计——抽查 Validator 记录，确认输出事实实体均可在输入 / 状态中溯源；(3) 评测样本覆盖事实 / 推断 / 未知 / 缺失四类注入。

## 9. 不变量与验收（裁定 D8 / D9）

- 不变量集 = SRC-24 §25（LLM-01…LLM-14、VAL-01…VAL-11）为基线，其中 LLM-08 采纳 SRC-23 完整表述："模型版本升级必须可评测、可追踪、**可回滚**"。
- 取消支持不变量（SRC-23 LLM-10 同义）经 SRC-24 §9 + RUN-04/05 确认覆盖。
- 四类具名回归（意图解释 / 策略敏感 / 状态完整性 / 自主权）纳入模型升级重测清单（SRC-23 §24）。
- C4 验收标准 = SRC-24 §28 清单（22 项 PASS / 12 项硬阻断）**加** SRC-23 §28 补入四项：`LLM Proposal Boundary`、`Structured Output`、`Fallback`、`Golden Suite Compatibility`；`Decision Trace` 由 `Runtime Mutation Traceable` 代表，如有分歧按较严格解释。
- 必测案例语料：SRC-23 §27 场景式案例与 SRC-24 §26 失败类别清单合并，逐项映射后执行。

## 10. 排除项与后续扩展（裁定 D7）

- A/B 与实验边界：明确不在 S1 实施；未来开展须产品负责人另行批准，且实验不得改变 Core Schema / State Machine / Policy / STOP / CHANGE / Memory Priority / Agency Rules。
- Model Registry、Reasoning 画像属性、完整模型升级工作流：见 §2/§3，须版本化扩展。

## 11. 批准与指纹（K-4 / K-5）

| 事项 | 状态 |
|---|---|
| AI 架构负责人批准（K-4） | PENDING |
| 非作者复核者会签（K-5） | PENDING |
| 全节 SHA-256 范围指纹登记（K-5） | PENDING |

批准时：本文件升 1.0.0，登记全节哈希清单，CR-11 方可关闭；G1 另需 C1–C7 Steward 确认与非作者核验。

**边界提醒：** 本文件为契约草案，不构成实现授权；实现仍以 P3-S1 实施授权（readiness-record 授权判定）为准。本文不改变任何 Gate 状态。
