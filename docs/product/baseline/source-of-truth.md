# 产品文档权威来源与版本登记册

**编号：** BASELINE-SOT-01
**版本：** 0.3.0（2026-10-09 增补："状态权威记录登记"与"治理规则索引"两节——状态变更单一权威记录机制与治理规则位置索引）
**状态：** 产品负责人已选定契约来源；G1 证据与责任人复核仍待完成
**用途：** 记录归档文档的来源与拟议权威角色；另登记各类治理状态的权威记录（单一状态源）与治理规则位置。登记不等于批准、冻结或解除阻塞。

## 判定规则

- 所有 36 项均来自用户提供的归档；仓库副本与源文件哈希见 `../reference/SHA256SUMS`。
- “声明版本”只抄录文件中可识别的版本标记；含糊或多个版本时记为“待核实”，不推断版本。
- “权威角色”是供评审的分类，不赋予文件新的权威性。
- 所有者和正式批准证据当前均为 `PENDING`；无签署证据的文档不得标记 `PASS` 或 `FROZEN`。
- 下表“来源状态”统一为“归档参考 / 批准待核”，后续须结合正文与治理决议更新。

## 登记表

| 编号 | 文档 | 声明版本 | 来源状态 | 范围 / 拟议角色 | 仓库来源路径 | 负责人 | 批准证据 |
|---|---|---|---|---|---|---|---|
| SRC-01 | `07｜Memory & User State Engine｜记忆与用户状态系统 V1.md` | V1（文件名） | 归档参考 / 批准待核 | Memory / User State 参考 | `docs/product/reference/07｜Memory & User State Engine｜记忆与用户状态系统 V1.md` | PENDING | PENDING |
| SRC-02 | `08｜Experience Creation Runtime｜从体验到创造 V1.md` | V1（文件名） | 归档参考 / 批准待核 | Creation Runtime 参考 | `docs/product/reference/08｜Experience Creation Runtime｜从体验到创造 V1.md` | PENDING | PENDING |
| SRC-03 | `10｜Experience Runtime Engineering Protocol V1｜体验运行时工程协议.md` | V1（文件名） | 归档参考 / 批准待核 | Runtime 工程流程参考 | `docs/product/reference/10｜Experience Runtime Engineering Protocol V1｜体验运行时工程协议.md` | PENDING | PENDING |
| SRC-04 | `12｜Core Schema Specification V1（核心数据结构规范 V1）.md` | V1（文件名） | 归档参考 / 批准待核 | C1 Schema 候选来源 | `docs/product/reference/12｜Core Schema Specification V1（核心数据结构规范 V1）.md` | PENDING | PENDING |
| SRC-05 | `13｜State Machine Specification V1（状态机规范 V1）.md` | V1（文件名） | 归档参考 / 批准待核 | C2 状态转换候选来源 | `docs/product/reference/13｜State Machine Specification V1（状态机规范 V1）.md` | PENDING | PENDING |
| SRC-06 | `14｜Action & Policy Contract V1（动作与策略契约 V1）.md` | V1（文件名） | 归档参考 / 批准待核 | C3 动作与策略候选来源 | `docs/product/reference/14｜Action & Policy Contract V1（动作与策略契约 V1）.md` | PENDING | PENDING |
| SRC-07 | `16｜API Contract V1（接口契约 V1）.md` | V1（文件名） | 归档参考 / 批准待核 | C5 API 候选来源 | `docs/product/reference/16｜API Contract V1（接口契约 V1）.md` | PENDING | PENDING |
| SRC-08 | `17｜Event & Analytics Contract V1（事件与数据分析契约 V1）.md` | V1（文件名） | 归档参考 / 批准待核 | C6 Event / Analytics 候选来源 | `docs/product/reference/17｜Event & Analytics Contract V1（事件与数据分析契约 V1）.md` | PENDING | PENDING |
| SRC-09 | `18｜Evaluation System V1（评测与验收体系 V1）.md` | V1（文件名） | 归档参考 / 批准待核 | C7 Evaluation 候选来源 | `docs/product/reference/18｜Evaluation System V1（评测与验收体系 V1）.md` | PENDING | PENDING |
| SRC-10 | `E1｜Contract Authority Evidence Package（契约权威证据包）.md` | 1.0（正文） | BLOCKED（正文） | G1 权威冻结证据登记 | `docs/product/reference/E1｜Contract Authority Evidence Package（契约权威证据包）.md` | PENDING | PENDING |
| SRC-11 | `E2｜First Experience Freeze Proposal（首个体验冻结提案）.md` | 待核实 | 归档参考 / 批准待核 | 首体验冻结提案 | `docs/product/reference/E2｜First Experience Freeze Proposal（首个体验冻结提案）.md` | PENDING | PENDING |
| SRC-12 | `E3｜Release-Gate Metric Definition（发布门槛指标定义）.md` | 待核实 | 归档参考 / 批准待核 | 发布指标定义参考 | `docs/product/reference/E3｜Release-Gate Metric Definition（发布门槛指标定义）.md` | PENDING | PENDING |
| SRC-13 | `P2 Closure Evidence Pack — Part 3：Golden Suite Evidence（黄金验收证据）.md` | 待核实 | 归档参考 / 批准待核 | P2 Golden Suite 证据规范 | `docs/product/reference/P2 Closure Evidence Pack — Part 3：Golden Suite Evidence（黄金验收证据）.md` | PENDING | PENDING |
| SRC-14 | `P2 Closure Evidence Pack — Part 4：Engineering Boundary Evidence（工程边界证据）.md` | 待核实 | 归档参考 / 批准待核 | P2 工程边界证据规范 | `docs/product/reference/P2 Closure Evidence Pack — Part 4：Engineering Boundary Evidence（工程边界证据）.md` | PENDING | PENDING |
| SRC-15 | `P2 Exit Gate & Sign-off（P2 退出门槛与签署）.md` | 待核实 | 归档参考 / 批准待核 | P2 退出门槛 / 签署参考 | `docs/product/reference/P2 Exit Gate & Sign-off（P2 退出门槛与签署）.md` | PENDING | PENDING |
| SRC-16 | `P2-EVIDENCE-5.0 — Evaluation Evidence（独立评测证据）.md` | 5.0（文件名） | 归档参考 / 批准待核 | 独立评测证据参考 | `docs/product/reference/P2-EVIDENCE-5.0 — Evaluation Evidence（独立评测证据）.md` | PENDING | PENDING |
| SRC-17 | `P2-EVIDENCE-6.0｜Product Debt - Open Decision Closure（产品债务与未决决策收束）.md` | 6.0（文件名） | 归档参考 / 批准待核 | 产品债务与决策记录 | `docs/product/reference/P2-EVIDENCE-6.0｜Product Debt - Open Decision Closure（产品债务与未决决策收束）.md` | PENDING | PENDING |
| SRC-18 | `P2-EVIDENCE-8.0 — Closure Evidence Execution Register（P2 关闭证据执行登记表）.md` | 8.0（文件名） | Closure Candidate / Blocked（正文） | P2 Gate 执行状态登记 | `docs/product/reference/P2-EVIDENCE-8.0 — Closure Evidence Execution Register（P2 关闭证据执行登记表）.md` | PENDING | PENDING |
| SRC-19 | `P2｜Product Engineering Contract（产品工程契约）正式收束与 P3 准入包.md` | 待核实 | 声称 CLOSED（与 E8 冲突） | P2 汇总 / P3 Entry 候选 | `docs/product/reference/P2｜Product Engineering Contract（产品工程契约）正式收束与 P3 准入包.md` | PENDING | PENDING |
| SRC-20 | `P3-ENTRY-1.0｜Vertical Slice Entry Package（首个完整产品切片准入包）.md` | 1.0（文件名） | 归档参考 / 批准待核 | P3 准入范围候选 | `docs/product/reference/P3-ENTRY-1.0｜Vertical Slice Entry Package（首个完整产品切片准入包）.md` | PENDING | PENDING |
| SRC-21 | `P3-S1-C01～C04｜Runtime Core Foundation Contracts（运行时核心底座契约）.md` | 1.0（正文） | FREEZE CANDIDATE（正文）/责任人批准待核 | S1 C01–C04 候选契约 | `docs/product/reference/P3-S1-C01～C04｜Runtime Core Foundation Contracts（运行时核心底座契约）.md` | PENDING | PENDING |
| SRC-22 | `P3-S1-C05～C06｜Semantic Action & Policy Contracts（语义动作与策略契约）.md` | 1.0.0（正文） | FREEZE CANDIDATE（正文）/责任人批准待核 | S1 C05–C06 候选契约 | `docs/product/reference/P3-S1-C05～C06｜Semantic Action & Policy Contracts（语义动作与策略契约）.md` | PENDING | PENDING |
| SRC-23 | `P3-S1-C07～C08｜LLM Gateway & Validator Contracts（大模型网关与验证器契约）.md` | 1.0.0（正文） | FREEZE CANDIDATE（正文）/与 SRC-24 重叠；逐章处置待确认 | S1 C07–C08 候选契约 | `docs/product/reference/P3-S1-C07～C08｜LLM Gateway & Validator Contracts（大模型网关与验证器契约）.md` | PENDING | PENDING |
| SRC-24 | `P3-S1-C07～C09｜LLM Gateway、Validator & Runtime Contracts（大模型网关、验证器与运行时契约）.md` | 1.0.0（正文） | FREEZE CANDIDATE（正文）/S1 操作规范候选；C4 引用关系待架构确认 | S1 C07–C09 候选契约 | `docs/product/reference/P3-S1-C07～C09｜LLM Gateway、Validator & Runtime Contracts（大模型网关、验证器与运行时契约）.md` | PENDING | PENDING |
| SRC-25 | `P3-S1-CC01｜Cross-Contract Consistency Specification（跨契约一致性规范）.md` | 1.0.0（正文） | FREEZE CANDIDATE（正文） | S1 一致性规范 | `docs/product/reference/P3-S1-CC01｜Cross-Contract Consistency Specification（跨契约一致性规范）.md` | PENDING | PENDING |
| SRC-26 | `P3-S1-CC02｜C01～C09 Cross-Contract Consistency Matrix（跨契约一致性矩阵）.md` | 1.0.0（正文） | FREEZE CANDIDATE（正文） | S1 契约矩阵 | `docs/product/reference/P3-S1-CC02｜C01～C09 Cross-Contract Consistency Matrix（跨契约一致性矩阵）.md` | PENDING | PENDING |
| SRC-27 | `P3-S1｜Runtime Vertical Slice Specification（运行时首个完整产品切片规范）.md` | 1.0（正文） | IMPLEMENTATION PREPARATION（正文）/责任人批准待核 | S1 运行时切片候选规范 | `docs/product/reference/P3-S1｜Runtime Vertical Slice Specification（运行时首个完整产品切片规范）.md` | PENDING | PENDING |
| SRC-28 | `Product Development Governance V1｜产品化开发总流程与变更治理规范.md` | V1（文件名） | 归档参考 / 批准待核 | 产品治理与变更流程 | `docs/product/reference/Product Development Governance V1｜产品化开发总流程与变更治理规范.md` | PENDING | PENDING |
| SRC-29 | `Screen 03｜第一体验入口：从“被推荐”进入“主动探索”.md` | 待核实 | 归档参考 / 批准待核 | 入口体验参考 | `docs/product/reference/Screen 03｜第一体验入口：从“被推荐”进入“主动探索”.md` | PENDING | PENDING |
| SRC-30 | `Screen 04｜第一体验 Runtime：从“看见”到“参与”.md` | 待核实 | 归档参考 / 批准待核 | Runtime 体验参考 | `docs/product/reference/Screen 04｜第一体验 Runtime：从“看见”到“参与”.md` | PENDING | PENDING |
| SRC-31 | `Screen 05｜实时理解与回答 Runtime 规格.md` | 待核实 | 归档参考 / 批准待核 | 实时理解 / 回答体验参考 | `docs/product/reference/Screen 05｜实时理解与回答 Runtime 规格.md` | PENDING | PENDING |
| SRC-32 | `Screen 06｜Experience Policy Engine 规格.md` | 待核实 | 归档参考 / 批准待核 | Policy Engine 体验参考 | `docs/product/reference/Screen 06｜Experience Policy Engine 规格.md` | PENDING | PENDING |
| SRC-33 | `V1 第一条完整 Experience｜从好奇到创造的可运行垂直切片.md` | V1（文件名） | 归档参考 / 批准待核 | 第一条完整 Experience 参考 | `docs/product/reference/V1 第一条完整 Experience｜从好奇到创造的可运行垂直切片.md` | PENDING | PENDING |
| SRC-34 | `个人体验引擎 V1.1｜前 60 秒高保真产品规格.md` | V1.1（文件名） | 归档参考 / 批准待核 | 首 60 秒体验规格参考 | `docs/product/reference/个人体验引擎 V1.1｜前 60 秒高保真产品规格.md` | PENDING | PENDING |
| SRC-35 | `个人体验引擎 V1｜Screen 01 首页高保真产品规格.md` | V1（文件名） | 归档参考 / 批准待核 | 首页体验规格参考 | `docs/product/reference/个人体验引擎 V1｜Screen 01 首页高保真产品规格.md` | PENDING | PENDING |
| SRC-36 | `个人体验引擎 V1｜逐屏产品原型规格.md` | V1（文件名） | 归档参考 / 批准待核 | 逐屏原型参考 | `docs/product/reference/个人体验引擎 V1｜逐屏产品原型规格.md` | PENDING | PENDING |

## 当前权威判定

该登记册不宣布任何源文件已获正式批准。尤其 E1 将 C1–C7 的权威位置、指纹、负责人和批准证据列为 PENDING / BLOCKED；P2 E8 将 G1 与 G7 标为 BLOCKED，且 G2–G6 证据未完成。因此本登记册当前不能作为 P2 关闭或 P3 实现授权证据。

## 产品负责人来源裁决更新

PODR-001 / PD-03、PD-04 已选定 C1–C7 权威来源，具体版本、哈希、职责角色及候选 / 待复核状态见 contract-authority-baseline-v1.md。该产品裁决解决”采用哪份来源”的问题，但不表示 E1 所要求的 G1 已通过：责任角色复核、C4 范围完整性确认及独立静态核验仍待完成。E8 现行状态仍是 P2 CLOSURE CANDIDATE / BLOCKED。

## 状态权威记录登记（2026-10-09 增补）

**规范：** 状态变更只在权威记录登记；其他治理文档仅引用权威记录的编号与版本号，不复述状态细节。既有文档已同步的状态文本保留为时点记录，后续变更按本规范以版本引用方式同步（降低多文档回写成本与不一致风险）。权威记录版本号随每次变更递增。

| 状态类别 | 权威记录 | 位置 |
|---|---|---|
| 冲突与未决决策（CR-01…）、G6 处置表 | BASELINE-DECISIONS-01 | `docs/product/baseline/decision-register.md` |
| 隐私六要素裁决 | P3-S1-PRIVACY-SIX-01 | `docs/product/baseline/signing/privacy-six-elements-approval.md` |
| G5 16 项评测结论、前置裁决与签署 | P3-S1-G5-WORKSHEET-01 | `docs/product/p3-s1/g5-evaluation-worksheet.md` |
| 准入与授权状态、G1–G8 判定 | P3-S1-READINESS-01 | `docs/product/p3-s1/readiness-record.md` |
| 角色矩阵与签署矩阵 | OWNER-ROSTER-01 | `docs/product/baseline/owner-roster-v1.md` |
| 证据运行事实与独立审计 | P3-S1-IMPL-ITER-001/002/003 | `docs/product/p3-s1/implementation-iteration-f1/f2/f3.md` |
| 证据操作规范、G5 输入就绪度 | P2-EVIDENCE-E5.1 | `docs/product/baseline/evidence-execution-plan.md` |
| 归档文档来源权威登记（SRC-01…SRC-36） | 本登记册 BASELINE-SOT-01 | `docs/product/baseline/source-of-truth.md` |

## 治理规则索引（2026-10-09 增补）

| 规则 | 位置 |
|---|---|
| 案例状态词汇（NOT RUN / RUNNING / PASS / FAIL / BLOCKED / DEFERRED）与退出码语义（退出码 0 只表示断言通过，不设置任何 Gate 或产品状态） | P2-EVIDENCE-E5.1 §2 |
| 每次运行必须记录的版本（Run ID、契约 / 代码 / 环境版本与哈希等） | P2-EVIDENCE-E5.1 §3 |
| 隐私护栏：密钥、访问令牌、原始个人隐私数据不得进入证据文件；真实用户数据收集的六要素前置条件（2026-10-09 已全部裁决签署，禁收护栏解除；ADR-0002 §3 证据沙箱合成数据边界独立生效） | P2-EVIDENCE-E5.1 §3 末段；P3-S1-PRIVACY-SIX-01 |
| 单案例证据记录最少字段（含 Evaluator 字段：同一人不可兼任同一案例的实现作者与独立评测者） | P2-EVIDENCE-E5.1 §4 |
| 必测维度（正常 / 边界 / 负向 / 故障；须验证”不应该发生的事情没有发生”） | P2-EVIDENCE-E5.1 §5 |
| 独立评测与 Gate 责任（实现作者不得自行批准其实现的 Gate；评测人指定与独立性声明；Gate 通过须 16 项适用版本化真实材料 + 独立评测者复核 + 产品负责人正式签署；任何 P0 失败直接阻断；缺项或 NOT RUN 不得被平均分抵消） | P2-EVIDENCE-E5.1 §6、§6.1 末段 |
| G5 16 项必需评测包与判定公式 | E8（P2-EVIDENCE-8.0）§6；P2-EVIDENCE-E5.1 §6.1 |
| 角色兼任逐行声明、利益冲突声明不得代填、角色 5 与实现作者冲突时须换人或书面记录隔离 | OWNER-ROSTER-01 头部规则与 §2；PD-15（`docs/product/baseline/product-owner-decisions-v1.md`） |
| 复核人不得复核自己撰写的内容；Codex 起草方不得兼任 A2 非作者复核人 | PD-15；OWNER-ROSTER-01 §2；独立复核记录（REVIEW-*） |
| 失败结果必须如实登记，不得重跑至通过为止而不留失败记录 | ADR-0002 §5（`docs/architecture/decisions/ADR-0002-engineering-validation-spike.md`） |
| 证据沙箱硬边界（仅合成数据；不得产出 Gate / Golden / G2–G5 / A 条件证据等七条禁止） | ADR-0002 §3 |
| 状态权威记录登记与版本引用规范 | 本登记册 BASELINE-SOT-01”状态权威记录登记”节 |
