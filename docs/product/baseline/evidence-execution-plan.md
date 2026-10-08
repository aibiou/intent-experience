# E5 证据执行环境与独立评测计划

**编号：** P2-EVIDENCE-E5.1
**版本：** 1.7.0（2026-10-08：§6.1 准备项 E5-TRIAL-0001 断言计数更正（6/6：A1/A2a/A2b/A3/A4/A6）；§6.2 第 15 项更新——`artifacts/evidence/manifest/` 已建（MANIFEST.json + INDEX.md，独立重算生成）；§7 布局说明更新）
**状态：** 流程已定义；环境已搭建；E5 = PASSED（A5 满足）；动态证据执行三迭代完成（F-1/F-2/F-3 迭代证据已产出；G2/G4 证据已产出，但其 Gate 判定属 G5 独立评测 NOT RUN；G5 输入材料就绪度矩阵见 §6.2）
**依据：** E8、E1、PODR-001 / PD-02 / PD-10 / PD-11

## 1. 目标与边界

建立可复现、可审计的产品证据链，防止“代码存在 / 测试跑绿 / Demo 正常 / AI 自评完成”被当成产品通过。本文是证据操作规范，不代表测试已执行、E5 已通过或运行时代码已授权。

证据链必须可追溯：

Product Decision → Contract Clause → Case ID → Version Set → Input / Fault → Runtime Trace → State Before / After → Event → Expected / Actual → Independent Evaluation → Gate Decision

## 2. 案例状态词汇

| 状态 | 含义 |
|---|---|
| NOT RUN | 尚无执行记录 |
| RUNNING | 执行中，尚无结论 |
| PASS | 指定版本执行满足全部预先批准期望且证据完整 |
| FAIL | 执行结果违反预期或硬门槛 |
| BLOCKED | 缺失前置条件，不能执行 |
| DEFERRED | 经产品负责人批准，属于后续切片；不计为通过 |

测试框架退出码 0 只表示该命令中的断言通过；它不会自动设置 Golden Case、Gate 或产品状态为 PASS。

## 3. 每次运行必须记录的版本

每次运行分配不可复用的 Run ID，记录：

- 产品基线与 Product Decision 版本；
- C1–C7 契约版本与 SHA-256；
- S1 C01–C09 规范版本与 SHA-256；
- State Machine / Policy / API / Event / Evaluation 版本；
- Code commit / revision；未提交的工作树必须记录差异摘要；
- Prompt 模板版本与内容哈希；
- Provider、Model ID、模型参数、调用区域和 SDK 版本；不能提供时明确标记 unavailable；
- Golden corpus、fixture、测试脚本版本及哈希；
- 回归基线 revision、关联 Change ID、受影响 Case ID 和此前 Run ID；没有适用历史运行时明确标记 `BASELINE_NOT_AVAILABLE`，不得伪造比较结果；
- Node.js / Next.js / 运行平台 / 数据库版本与配置摘要；
- 时间戳、命令、退出码、重试次数和执行人。

密钥、访问令牌、原始个人隐私数据不得进入证据文件；应保存可复现的脱敏输入与必要关联 ID。

在数据保留期限、存储位置、访问控制、加密、删除机制以及产品 / 安全负责人批准全部确定之前，不得收集或保存任何真实用户数据。此阶段只允许使用合成数据或经明确批准的脱敏夹具；不得自行假设留存天数、区域或访问角色。

## 4. 单案例证据记录

每个 Case 必须保存一份记录，最少包含：

| 字段 | 内容 |
|---|---|
| Case ID / Namespace | 如 E8-G2-CC02、S1-CC19、S1-CCSPEC-CC02、S1-CC02-H02、S1-CC02-GXC02、S1-CC02-NEG07、GS-04；禁止使用有歧义的裸 CC 编号 |
| Source / Clause | 精确文档、版本、章节、哈希 |
| Scope | S1 / S2 / P2 closure；纳入、非适用或已批准延期的理由 |
| Precondition | 输入状态、state_version、session / intent / experience 状态 |
| Input / Fault | 脱敏用户输入、模型输出夹具、故障类型、并发时序 |
| Expected | 执行前由产品契约确定的结果，不能事后改写 |
| Actual | 原始结构化结果、返回码、决定轨迹、事件与状态快照 |
| Invariants | Runtime 单写入、Policy、状态机、停止/取消、陈旧结果拒绝等断言 |
| Evidence | 日志、trace、截图或执行附件的相对路径与哈希 |
| Result | PASS / FAIL / BLOCKED / NOT RUN / DEFERRED 及理由 |
| Evaluator | 实际执行人与独立复核人；同一人不可兼任同一案例的实现作者与独立评测者 |
| Defects / Follow-up | Issue / 决策 ID、严重度、修复版本、回归关联 |

## 5. 必测维度

每个适用 S1 核心场景至少包含正常、边界和负向 / 故障条件；中断、并发与恢复场景按契约要求加入：

- 正常路径与相邻输入；
- 错误 / 歧义输入、无效模型结构和 Provider 错误；
- STOP / CHANGE 在模型生成前、生成中、生成后到达；
- 迟到模型响应、重复请求、重试、Fallback 与并发状态写入；
- stale state_version、非法状态转换、伪造 state_update；
- Event / Decision Trace 缺失、重复、次序错误或意外影响 Runtime；
- 用户改变意图、拒绝建议、纠正模型、自然结束。

必须验证“不应该发生的事情没有发生”，特别是 STOP 后续行、CHANGE 后旧结果入库、LLM 直接状态变更、Analytics 触发产品动作。

## 6. 独立评测与 Gate 责任

- 实现作者负责提供可复现执行包，不得自行批准其实现的产品 Gate。
- 独立评测人需审阅预先冻结的期望、完整轨迹、负向案例和失败记录；不能只看测试汇总或演示。
- 评测人须在 G5 执行前由产品负责人指定，并声明与实现作者的职责独立性；人选已指定（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效，含身份关系与利益冲突声明）。
- 产品负责人决定是否接受 Gate 结果，但不得改变已执行案例的预期以追认 PASS；如需改变，新增决策版本并完整重跑受影响回归。
- Gate 的通过由证据责任人提出、独立评测者复核、产品负责人签署；任何 P0 失败直接阻断。

## 6.1 E8 G5 Evaluation Package（G5 独立评测包）16 项交叉表

以下逐项对应 E8 / P2-EVIDENCE-8.0 §6 的必需评测包。交叉表只说明证据归属与缺口；没有运行产物的字段均为 `NOT RUN`，不得由表格存在推断 G5 PASS。

| # | E8 G5 必需项 | E5 证据归属 / 最低记录 | 当前状态 / 未决项 |
|---|---|---|---|
| 1 | Version Matrix（版本矩阵） | §3 Run Metadata：合同、Schema、Policy、Prompt、Model、Corpus、Code、环境版本及哈希 | 字段已定义；自动生成和实际运行 NOT RUN |
| 2 | Test Scope（测试范围） | §4 案例记录中的 Scope 字段 + §5 必测维度；列清适用 / 延期 / 非适用理由 | 范围映射草案已建；非作者复核待办 |
| 3 | Golden Case Result（黄金案例结果） | 单案例 Expected / Actual / Result / Evidence；关联 acceptance-mapping 与 Case ID | Golden 执行 NOT RUN |
| 4 | Contract Test Result（契约测试结果） | cross-contract-static-mapping 中适用 ID 的逐案动态记录 | 静态映射待非作者复核；动态 NOT RUN |
| 5 | Scenario Matrix Result（场景矩阵结果） | S1-CC02-GXC01…GXC08 的逐案执行与 trace | NOT RUN |
| 6 | AI Evaluation Result（AI 评测结果） | 冻结模型 / Prompt / Corpus / rubric 版本、逐项输出和评测者理由 | 评测 rubric 与责任人须在 G5 前批准；NOT RUN |
| 7 | Regression Result（回归结果） | Change ID、前后版本、受影响案例、基线 Run ID 与重跑结果 | 结构已要求；尚无代码或运行基线，NOT RUN |
| 8 | Fault Injection Result（故障注入结果） | §5 Provider、非法输出、取消、迟到结果、并发和状态冲突案例 | 场景已定义；NOT RUN |
| 9 | Latency Result（延迟结果） | 环境 / 模型 / 请求类别分层的原始测量、样本窗口及计算方法 | 统计阈值仍须产品负责人按 E3 批准；未批准前不得宣告指标达标或发布 PASS |
| 10 | Agency Result（用户自主权结果） | STOP、CHANGE、拒绝、直接回答、无自主续行等案例的预期 / 实际 / trace | P0 违规零容忍；独立评测 NOT RUN |
| 11 | Known Failures（已知失败） | §4 Defects / Follow-up 与完整 FAIL / BLOCKED 记录 | 实际清单待运行生成；不得隐藏或覆盖失败 |
| 12 | Product Debt（产品债务） | 指定基线版本下的 decision-register 与未决事项快照 | 有登记草案；按运行版本封存待办 |
| 13 | Risk Assessment（风险评估） | 独立评测者按已知失败、缺失证据及严重度记录风险和残余风险 | 评测模板及评测人待批准；NOT RUN |
| 14 | Release Recommendation（发布建议） | 独立评测者基于完整证据给出建议；产品负责人另行决定 | 不得由 AI 或实现团队自动发布；NOT RUN |
| 15 | Evidence Index（证据索引） | §7 只追加运行包、路径索引与 SHA-256 清单 | 布局已定义；产物不存在 |
| 16 | Evaluator Sign-off（评测负责人签署） | §6 独立性声明、版本、结论、遗留问题及签署日期 | 独立评测负责人已任命（G5 隔离声明 2026-10-08）；16 项最终签署待运行后执行；NOT RUN |

G5 只有在上述 16 项均有适用的、版本化的真实材料，并由独立评测者复核且产品负责人正式签署后，才可按 E8 原关闭公式判定。任何 P0 失败、缺项或 `NOT RUN` 均不得被平均分或建议性报告抵消。

### 6.2 G5 输入材料就绪度矩阵（2026-10-08 登记）

本矩阵只登记输入材料的存在性与位置，供独立评测人（角色 5）执行 G5 16 项评测包时定位输入；**任何 G5 必需项的评测结论均 NOT RUN，不得由输入材料存在推断 G5 PASS**。

| # | G5 必需项 | 已产出的输入材料（staged，供评测人复核） | G5 评测人仍须执行 |
|---|---|---|---|
| 1 | Version Matrix | 三运行 `run-metadata.json`（E5 §3 矩阵；F3 含 engineeringBoundaries 专项 + 31 项运行时文件哈希 + 执行器哈希；三运行 SHA256SUMS 独立重算 46/46×3 通过） | 矩阵完备性复核与版本关联确认 |
| 2 | Test Scope | acceptance-mapping（范围冻结，PD-05…PD-08）+ XCC-MAP v1.4.0（A2 非作者复核 REVIEW-004）+ F3 案例范围声明（G2 5 案例 + EB-01…EB-16；S2 范围项 EB-10/EB-11 仅 S1 缺席证明） | 适用 / 延期 / 非适用理由的逐案确认 |
| 3 | Golden Case Result | —（无黄金案例执行产物） | NOT RUN——评测人执行 |
| 4 | Contract Test Result | F3-EB-0001 G2 动态跨契约一致性 5 案例记录与轨迹（G2-CHAIN-01/02、G2-FAULT-01/02、G2-VERSION-01） | 逐案动态评测 NOT RUN |
| 5 | Scenario Matrix Result | F2-GS-0001 GS-01…GS-06 场景案例 40 个（含全部登记负向）+ S1-ACT-WHAT_IF | GXC01…GXC08 逐案映射确认与评测 NOT RUN |
| 6 | AI Evaluation Result | —（S1 无真实 LLM 提供方接入；合成 fixtures；评测 rubric 与责任人须在 G5 前批准） | NOT RUN |
| 7 | Regression Result | F-1 回归双形态（F2-GS-0001：F1-REG-INPROC、HTTP-12；基线 F1-E2E-0001 9/9） | 正式回归基线重跑与 Change ID 关联 NOT RUN |
| 8 | Fault Injection Result | F3 故障注入案例：EB-02（失败不消耗版本号）、EB-05（过期结果拒绝）、EB-06/EB-06-NO-RETRY-STOP（LLM 故障 + 失败后 STOP）、EB-07（超时边界）——经 `LlmGateway` 接口注入；HTTP 形态 503 NOT RUN（CR-18 待产品负责人决策） | 故障注入逐案评测 NOT RUN；HTTP 形态 503 缺口处置待 CR-18 裁决 |
| 9 | Latency Result | F3 运行耗时 9.0s（参考值，非指标） | NOT RUN——统计阈值须产品负责人按 E3 批准后测量 |
| 10 | Agency Result | F3 EB-04/EB-06s/EB-13（可中断性、失败后 STOP、完成边界用户主权）+ F2 GS-04 系列（STOP 终止四事件齐备、零续行） | 用户自主权逐案评测 NOT RUN（P0 违规零容忍） |
| 11 | Known Failures | 三迭代失败尝试如实归档（F1 3 次、F2 2 次、F3 2 次，ADR-0002 §5）+ 缺陷登记 D-1/D-2（运行时，已修复）、E-1…E-3 与 F3-E-1…F3-E-9（案例/执行器侧，已修复） | G5 汇总与残余风险关联 NOT RUN |
| 12 | Product Debt | decision-register v0.10.0 快照（CR-16/CR-17/CR-18 OPEN；PB-01…PB-04 RESOLVED） | 按运行版本封存待办 |
| 13 | Risk Assessment | — | NOT RUN——评测人执行 |
| 14 | Release Recommendation | — | NOT RUN——评测人执行 |
| 15 | Evidence Index | `artifacts/evidence/runs/` 只追加布局；四运行 + 六失败尝试归档；各运行 SHA256SUMS；`artifacts/evidence/manifest/`（MANIFEST.json + INDEX.md，独立重算生成：各运行案例/断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead、产物提交哈希） | 索引已建（2026-10-08）；索引内容的 G5 评测 NOT RUN |
| 16 | Evaluator Sign-off | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 16 项最终签署 NOT RUN |

## 7. 保存与审计布局

实施时建议在仓库使用如下只追加的路径；`artifacts/evidence/manifest/` 已创建（MANIFEST.json + INDEX.md，2026-10-08，独立重算生成，G5 第 15 项输入）；运行产物位于 `artifacts/evidence/runs/`：

artifacts/evidence/manifest/
artifacts/evidence/runs/<run-id>/run-metadata.json
artifacts/evidence/runs/<run-id>/cases/<namespace>-<case-id>.json
artifacts/evidence/runs/<run-id>/traces/
artifacts/evidence/runs/<run-id>/logs/
artifacts/evidence/runs/<run-id>/review/

每个运行包要有 SHA-256 清单；修订应新增 Run ID，不覆盖失败记录。大体积或敏感产物应存放于批准的私有存储，并在仓库留存脱敏索引和完整性哈希。

## 8. E5 准备清单

| 准备项 | 当前状态 |
|---|---|
| 案例命名空间及结果状态定义 | 已定义（PODR-001 / PD-11） |
| 版本矩阵和运行记录字段 | 已定义；自动化已实现并验证（E5-TRIAL-0001 与 F1-E2E-0001 均产出 run-metadata E5 §3 版本矩阵） |
| S1 / P2 案例目录及预期冻结 | 映射已起草；非作者复核待办 |
| 可复现 Node / Web / DB 环境与锁文件 | 已搭建（2026-10-08：`tools/evidence/` 零依赖 Node ESM 执行器 + package-lock.json lockfileVersion 3；Node v24.21.0 Active LTS 锁定；DB = node:sqlite） |
| 自动化执行器、trace 与证据哈希产出 | 已搭建并验证（E5-TRIAL-0001：run-metadata 版本矩阵 / 案例记录 §4 全字段 / trace JSONL / SHA-256 清单产出；6/6 断言通过（A1/A2a/A2b/A3/A4/A6）；A7/A8 未持久化经独立审计登记于 P3-S1-IMPL-ITER-003 §3） |
| 私有数据、脱敏与证据保留策略 | 已冻结真实用户数据禁收护栏；保留期限 / 存储位置 / 访问 / 加密 / 删除规则须在收集前由产品与安全负责人批准 |
| E8 G5 16 项评测包交叉表 | 已逐项映射到证据字段；所有执行材料仍 NOT RUN，指标阈值与独立评测人待办 |
| 独立评测人 | 已指定（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效） |
| 首次端到端证据试运行 | 已完成（E5-TRIAL-0001，2026-10-08：4 案例 PASS、退出码 0；仅证据管线验证，非产品运行时验证；材料 `artifacts/evidence/runs/E5-TRIAL-0001/`） |
| 动态证据执行（G2–G4，三迭代） | F-1 迭代动态证据 F1-E2E-0001 完成（2026-10-08：9/9 案例 PASS、12/12 断言、退出码 0；进程内 + HTTP 双形态；材料 `artifacts/evidence/runs/F1-E2E-0001/`；失败尝试 3 次按 ADR-0002 §5 归档）；F-2 迭代动态证据 F2-GS-0001 完成（40/40 案例、24/24 断言、退出码 0；GS-01…GS-06 完整 + C6 事件契约 + F-1 回归）；F-3 迭代动态证据 F3-EB-0001 完成（21/21 案例、28/28 断言、退出码 0；G2 动态跨契约一致性 + G4 工程边界 EB-01…EB-16；HTTP 形态 LLM 故障 503 NOT RUN 登记——S1 服务端运行时未暴露网关注入缝）。G2–G4 动态证据三迭代已全部产出；Gate 判定属 G5 独立评测（NOT RUN） |

**当前判定：** E5 证据操作流程已形成；执行环境已建成、角色已齐（独立评测人 2026-10-08 任命生效）、首次试运行已执行并通过。三项就绪条件完成，因此 E5 = PASSED，A5 准入条件满足（2026-10-08）。G5 16 项评测包仍 NOT RUN（属实施后动态评测；评测人须先审阅 F-1/F-2/F-3 迭代材料）；G2–G4 动态证据已三迭代产出（F1-E2E-0001、F2-GS-0001、F3-EB-0001——各只表示本运行中的断言通过，不设置任何 Gate 为 PASS；G2–G4 仍 NOT PASSED）。
