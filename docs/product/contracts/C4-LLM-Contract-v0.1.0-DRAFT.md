# C4｜LLM Contract（大模型契约）正式文件

**编号：** C4-LLM-CONTRACT-01
**版本：** 0.2.0 DRAFT（2026-10-08：K-4 审定补齐——新增 §2 网关边界、§6 调用记录/生命周期/结果分类、§7 取消与 stale 拒绝、§8 重试边界、§9 Fallback、§10 供应商适配层、§11 结构化输出；§1 补目标架构链；§13 语义动作边界澄清；§16 补模型评测前置流程；D1–D10 裁定内容不变）
**状态：** DRAFT——待 AI 架构负责人批准（K-4）与非作者会签 + 范围指纹登记（K-5）；批准前 C4 正式权威未建立，G1 保持 NOT PASSED
**Owner：** AI 架构负责人（用户本人兼任，PD-15 / OWNER-ROSTER-01 行 3）
**建立依据：** CR-11 / PD-04；C4-signoff-checklist v1.0.0（32 章签署 + D1–D10 裁定，2026-10-08）；C4-signoff-comparison-brief-v1（等价性分析）
**内容来源：** SRC-23（P3-S1-C07～C08，32 章，处置表 + 逐章签署）与 SRC-24（P3-S1-C07～C09，操作规范候选）中经裁定采纳的条款；来源哈希见 `reference/SHA256SUMS`
**范围指纹：** PENDING（K-5 批准时按本文 §18 登记全节 SHA-256 清单）

## 1. 核心原则与边界（SRC-23 §1，签署接受）

- 模型无关：产品行为不得依赖任何特定模型 / 供应商 / 版本；LLM 是能力提供方，不是产品权威。
- 模型只能出现在五处：Model Configuration、Model Registry（S1 不建，见 §3）、Routing Configuration、Provider Adapter、Evaluation Baseline。
- 模型不得进入七处：ExperienceState、Intent Contract、Policy Contract、State Machine、Runtime Core、Frontend、Product API。
- 增补（SRC-24 §1）：可追踪、可解释、可回放；组件职责划分以 SRC-24 操作规范为准。
- 目标架构链（SRC-23 §29 / SRC-24 §1，架构已确认）：User → Intent → Semantic Action → Policy → LLM Gateway → Model Router → Provider Adapter → LLM → LLM Response / Error → Validator → State Machine → Runtime → ExperienceState → Event / Decision Trace。

## 2. 网关边界与 Provider / Model Agnostic（SRC-23 §二/§三 + SRC-24 §2.1/§3，映射草案采纳）

- LLM Gateway 是产品与外部模型能力之间的唯一标准边界；业务层只能依赖 `LLM Gateway Interface`，不得依赖 Provider SDK、Provider API、Provider 特定响应或错误；提供商特定实现必须终止于 Provider Adapter。
- 业务代码不得出现 `if model == xxx` 或 `if provider == xxx` 来决定产品行为（除非属于明确的 Provider Adapter / Model Capability Adapter 且不改变产品契约）。
- 产品不得绑定单一模型、单一模型系列、单一模型供应商、单一 SDK、单一 Provider API、单一模型 Prompt 格式。

## 3. Model Registry（裁定 D1）

S1 不建设 Model Registry 产品能力（多 Provider / Model / Version / Capability 注册表不纳入）；反单一模型绑定原则（"不得绑定唯一模型"）由本契约 §1 / §12 保留。完整 Registry 若进入后续切片，须版本化扩展本契约。

## 4. 模型配置与能力画像（裁定 D2）

- Model Configuration 为纯数据（JSON），不是逻辑；结构与 SRC-24 §3 一致。
- 能力画像 = 5 个配置标志：`structured_output` / `tool_calling` / `vision` / `long_context` / `streaming`。
- 路由输入覆盖 Latency / Cost / Reliability / Safety；Reasoning 无专属标志，经 §5 路由的通用 `Required Capability` 覆盖。若后续需要 Reasoning 作为画像属性或独立路由输入，须版本化扩展本契约。

## 5. 模型路由与选择（SRC-23 §7/§8 + SRC-24 §4）

- 路由属基础设施决策，不是产品策略；选择输入清单与禁止项（Session Time / Engagement / Click Probability / 用户停留时长不得作为模型调用授权依据）按 SRC-24 §4 原文。
- 每次调用（含失败）必须记录：模型选择可追踪记录结构按 SRC-24 §5/§6（SRC-23 §9 的超集）。

## 6. 调用记录、生命周期与结果分类（SRC-23 §9/§13 + SRC-24 §5–§8）

- 每一次 LLM 调用都必须产生一条 Call Record，无论结果是成功、失败、超时、取消、限流、Provider Error、Invalid Output、Schema Error、Policy Reject、Validator Reject、Stale Result、Fallback 或 Fallback Failed；不得出现"因为异常，所以没有记录"。
- Call Record 最小结构按 SRC-24 §6（含 request_id / generation_id / session_id / experience_id / intent_id / state_version / model_profile_id / provider_id / model_id / model_version / routing_policy_version / llm_contract_version / prompt_version / request / response / error / validation / runtime / performance / usage / created_at / completed_at）。
- 结果分类按 SRC-24 §7：SUCCESS 表示 Provider 正常返回，**不代表产品接受**；基础设施失败（TIMEOUT / NETWORK_ERROR / RATE_LIMIT / PROVIDER_ERROR / AUTH_ERROR / SERVICE_UNAVAILABLE）、输出失败（INVALID_OUTPUT / SCHEMA_ERROR / MALFORMED_OUTPUT / INCOMPLETE_OUTPUT）、产品验证失败（VALIDATOR_REJECTED / POLICY_REJECTED / STATE_VERSION_CONFLICT / STATE_MACHINE_REJECTED / INTENT_MISMATCH / AGENCY_REJECTED / CONTINUITY_REJECTED）、运行时控制结果（CANCELLED / STALE_RESULT / INTERRUPTED）不得简单统计为 LLM_FAILURE。
- 生命周期按 SRC-24 §8：REQUESTED → ROUTING → DISPATCHED → GENERATING → RECEIVED → VALIDATING → ACCEPTED；异常分支含"任何阶段 → STALE_RESULT"；每次状态变化必须可追踪；模型调用失败不能直接导致 ExperienceState Mutation（SRC-23 §13）。

## 7. 取消与 stale 拒绝（SRC-23 §14 + SRC-24 §9）

- 触发事件：STOP / CHANGE_DIRECTION / Intent Change / Session End / Experience Replacement / State Version Invalidated → 正在运行的模型请求进入 CANCEL_REQUESTED，且 Generation Invalidated。
- 旧 Generation 即使最终返回，也不得进入 Runtime；迟到响应经 Stale Check → REJECT_STALE_RESULT。
- 必须记录：generation_id / original_state_version / current_state_version / stale_reason / rejected_at。

## 8. 重试边界（SRC-23 §15 + SRC-24 §10）

- 允许重试：TIMEOUT / NETWORK_ERROR / RATE_LIMIT / 临时 PROVIDER_ERROR。
- 重试不得改变 User Intent / Experience Goal / State Version / Semantic Action / Policy Decision；重试须走 same logical request → same state validity check → Validator。
- 状态已变化时：Retry old generation → STALE → REJECT。
- 必须保留 retry_sequence，从而可还原 Request #1 → 失败 → Retry #1 → SUCCESS 的完整调用链。

## 9. Fallback（SRC-23 §10 + SRC-24 §11）

- Fallback 属基础设施行为，不是产品行为；Fallback 模型的结果仍必须完整验证。
- Fallback 不得：改变 Intent、改变 Policy、绕过 Validator、绕过 State Machine、直接写 Runtime State、自动改变用户意图或 Experience Goal、把失败隐藏成成功。

## 10. 供应商适配层（SRC-23 §21 + SRC-24 §12）

- Provider Adapter 只能负责：Authentication / Request Translation / Response Translation / Streaming Translation / Tool Protocol Translation / Error Normalization / Provider-specific Limits。
- Provider Adapter 不得拥有：Intent / Policy / Experience Selection / ExperienceState / Memory Decision / Agency Decision / Runtime State。

## 11. 结构化输出（SRC-23 §12 + SRC-24 §13 V1 / §7.3）

- C07 必须优先要求模型输出符合 Schema → Structured Proposal，不得让业务层解析任意自然语言。
- 模型不支持原生 Structured Output 时：Provider Adapter → Normalization → Gateway Schema，对上层暴露统一结构。
- Schema 不匹配 / 非法输出按 §6 结果分类拒绝。

## 12. Provider Lock-in 八项禁令（裁定 D6，规范性）

1. Frontend 不得调用 Provider API；
2. Frontend 不得调用 Model API；
3. Runtime 不得直接使用 Provider SDK（经 Provider Adapter 终止）；
4. Policy 不得包含模型特定逻辑；
5. ExperienceState 不得含供应商特定字段；
6. Intent 不得含模型特定语义；
7. Analytics 不得硬编码供应商假设；
8. Tests 不得仅测一家供应商 / 模型（直接影响 G5 评测设计）。

禁止"先写死再抽象"债务路径。

## 13. LLM Proposal 对象 Schema（裁定 D3，本契约定义）

模型输出只能是 Proposal，而不是 Runtime Command；结构（最小 S1 版）：

```text
proposal_id            string  唯一
request_id             string  关联调用
semantic_action        enum    已启用动作（S1：DIRECT_ANSWER / WHY / WHAT_IF / CHANGE_DIRECTION 提案）
content                object  按 semantic_action 定义的结构化内容
experience_candidate   object  候选体验（提案，非状态）
uncertainty            object  事实 / 推断 / 假设显式分离标注（含"未知 / 缺失"标记）
state_version          integer 绑定调用时的 expected_state_version（规范名，PD-16；别名 expected_version / state_version）
```

- 语义动作边界：CHANGE_DIRECTION 与 STOP 均为用户侧发起；模型不得自行发起方向变更或停止，仅得就用户已发起的方向变更提出内容候选；STOP 不作为模型提案动作。模型不能直接执行 STOP / CHANGE_STATE / WRITE_MEMORY / WRITE_SESSION / WRITE_EXPERIENCE_STATE / EXECUTE_TOOL / CHANGE_POLICY（SRC-23 §11）。
- 未经 Validator、Policy、State Machine 接受的 Proposal 不得进入 Runtime 状态。

## 14. Validator 检查层（裁定 D4）

- Validator 是 LLM Proposal → Product-Executable Proposal 之间的唯一验证边界；核心原则：LLM 可以提出任何东西，只有 Validator + Policy + State Machine + Runtime 可以决定什么能够进入产品状态。
- V1–V8 检查层名与定义以 SRC-24 §13 为准；各层详细检查项按 SRC-23 §17 原文采纳为规范内容（V1 schema / required fields / type / enum / format；V2 跨契约一致性 C01–C07 / 当前 Experience Contract / 当前 LLM Contract；V3 session_id / experience_id / state_version / generation_id 四类 ID；V4 Policy Action 允许性 / STOP / CHANGE_DIRECTION / Agency Gate；V5 当前 State + Candidate Action 合法 Transition；V6 意图匹配；V7 当前 Experience 归属 / 过期 Context / 非法分支 / 偷开始下一体验；V8 强迫继续 / 隐藏退出 / 未经允许扩大任务 / 自动 continuation / 把 engagement 当授权）。
- 验证输出（ACCEPT / REJECT / REVISE / FALLBACK）与记录结构按 SRC-24 §14/§15（与 SRC-23 §18 逐字相同）；REVISE 仅允许修复安全的结构问题，不得改变 User Intent / Policy / State / Agency boundary；FALLBACK 后仍必须重新验证。

## 15. 不得"脑补"机制（裁定 D5，SRC-23 §20——经审定的落地机制说明）

Validator 不生成、不补全、不改写任何事实性内容。事实性主张只能来源于用户输入或已确认的产品状态（ExperienceState / 已确认 Canon）；模型输出中出现源输入之外的事实实体时，Validator 按"未知信息"处理：以 REJECT 或带显式不确定性标记的 REVISE 返回，禁止静默补全。推断必须与事实分离标注（E8-G2-CC07 分离原则）；缺失信息必须以 REJECT / Request Safe Revision 路径返回。验证方式：(1) 负向案例——构造含未提供事实的模型输出，验证器必须拒绝；(2) 轨迹审计——抽查 Validator 记录，确认输出事实实体均可在输入 / 状态中溯源；(3) 评测样本覆盖事实 / 推断 / 未知 / 缺失四类注入。

## 16. 不变量、评测与验收（裁定 D8 / D9 / K-3）

- 不变量集 = SRC-24 §25（LLM-01…LLM-14、VAL-01…VAL-11、RUN-01…RUN-10）为基线，其中 LLM-08 采纳 SRC-23 完整表述："模型版本升级必须可评测、可追踪、**可回滚**"。
- 取消支持不变量（SRC-23 LLM-10 同义）经 SRC-24 §9 + RUN-04/05 确认覆盖。
- 模型评测是模型进入生产使用的前置流程：模型更换或版本升级必须通过同一套 Golden Suite / Scenario Matrix / Contract Tests / Agency Tests / State Integrity / Latency / Reliability 评测（SRC-23 §23/§24）；四类具名回归（意图解释 / 策略敏感 / 状态完整性 / 自主权）纳入重测清单；评测责任链由 AI 架构负责人与独立评测负责人共签（K-3 已完成）。
- C4 验收标准 = SRC-24 §28 清单（22 项 PASS / 12 项硬阻断）**加** SRC-23 §28 补入四项：`LLM Proposal Boundary`、`Structured Output`、`Fallback`、`Golden Suite Compatibility`；`Decision Trace` 由 `Runtime Mutation Traceable` 代表，如有分歧按较严格解释。
- 必测案例语料：SRC-23 §27 场景式案例与 SRC-24 §26 失败类别清单合并，逐项映射后执行。

## 17. 排除项与后续扩展（裁定 D7）

- A/B 与实验边界：明确不在 S1 实施；未来开展须产品负责人另行批准，且实验不得改变 Core Schema / State Machine / Policy / STOP / CHANGE_DIRECTION / Memory Priority / Agency Rules。
- Model Registry、Reasoning 画像属性、完整模型升级工作流：见 §3/§4，须版本化扩展。

## 18. 批准与指纹（K-4 / K-5）

| 事项 | 状态 |
|---|---|
| AI 架构负责人批准（K-4） | PENDING |
| 非作者复核者会签（K-5） | PENDING |
| 全节 SHA-256 范围指纹登记（K-5） | PENDING |

批准时：本文件升 1.0.0，登记全节哈希清单，CR-11 方可关闭；G1 另需 C1–C7 Steward 确认与非作者核验。

**边界提醒：** 本文件为契约草案，不构成实现授权；实现仍以 P3-S1 实施授权（readiness-record 授权判定）为准。本文不改变任何 Gate 状态。
