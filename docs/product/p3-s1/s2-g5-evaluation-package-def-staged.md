# S2 时代 G5 评测包范围定义提案（S2-G5-EVAL-DEF-01 v1.0.0）

**状态：** RULED——产品负责人（用户本人，PD-15）2026-10-09 裁决选项 A（复用 16 项框架对 S2 证据执行独立评测）
**编号：** S2-G5-EVAL-DEF-01
**版本：** 1.0.0（2026-10-09：产品负责人裁决"选项 A"升版 RULED）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** P3-S1-G5-WORKSHEET-01 v1.8.0（P2 时代 G5 16 项评测包——PASSED 无条件，2026-10-09）/ P2-EVIDENCE-E5.1（E5 证据执行环境与独立评测计划）§6.1/§6.2 / EVIDENCE-MANIFEST-01 v1.3.0（S2 时代运行追加）/ readiness-record v1.31.0 / P3-S2-G5-WORKSHEET-01 v0.1.0（选项 A 裁决产物——`s2-g5-evaluation-worksheet.md`，STAGED FOR EVALUATOR）

## 1. 事实取证

- **P2 时代 G5 16 项评测包已完成**（2026-10-09）：PASSED 无条件——16 项 = 13 PASS + 1 N/A（第 3 项黄金案例，S1 范围未定义黄金套件）+ 发布建议 B（第 14 项，遗留条件已全数履行）；双行签署 + 第 9 项关闭签署已登记。评测对象为 S1 时代证据：E5-TRIAL-0001 / F1-E2E-0001 / F2-GS-0001 / F3-EB-0001 三运行体系。
- **S2 时代证据 7 运行全部通过**（2026-10-09）：S2A-OBL-01-0001（7/7 案例、12/12 断言）/ S2A-F2-0001（10/10、16/16）/ S2A-F3-0001（8/8、15/15）/ S2A-F4-0001（9/9、16/16）/ S2A-F5-0001（9/9、14/14）/ S2B-0001（7/7、14/14）/ G3-GOLDEN-0001 再生产物（36/36、10/10）——合计 86/86 案例、97/97 断言、退出码 0。**退出码 0 只表示各运行中的断言通过；不设置任何 Gate 为 PASS（E5 §2）。**
- **每运行 staged 审阅包齐备**：`artifacts/evidence/runs/<run>/review/README.md` ×7（其中 S2B-0001 审阅包已经角色 5 审阅——PASS，2026-10-09，S2b 独立评测关闭；其余 6 份待角色 5 审阅）。
- **证据索引已覆盖 S2 运行**：EVIDENCE-MANIFEST-01 升版 v1.3.0（MANIFEST.json + INDEX.md——7 运行追加，7 运行 SHA256SUMS 独立重算全部精确通过；30 个尝试归档中 27 个全部精确通过、3 个各 1 项 summary.json 时点性不符（与 F1/F2 同类——执行器写入顺序，实质内容经交叉核验为真）；生成方法与 v1.0.0 一致）。
- **现行 16 项框架为 S1 证据设计**：P3-S1-G5-WORKSHEET-01 的 staged 输入映射（三运行 run-metadata、F2 GS-01…GS-06 案例组、F3 G2 5 案例 + EB-01…EB-16、S1 合成 fixtures 4 件套、decision-register v0.14.0 快照）不覆盖 S2 证据。

## 2. 语义空缺分析

S2 时代证据与 G5 评测之间的空缺（约束自有 frozen 源派生：E5 计划 §6.1 判定规则、PD-23 S2 范围裁决、各 S2A/S2B SEMANTIC-FREEZE-01 冻结文本）：

- **空缺 1（评测覆盖）**：S2a 五项义务（F-1…F-5）与 S2b 首批义务（G-1…G-4）的实施完成登记（CR-18…CR-24）以「运行退出码 0 + 断言全通过 + 迭代记录」为据，**未经角色 5 独立评测**——S2 证据处于「证据已产出、独立评测未执行」状态。角色分离纪律（实现作者不得兼任独立评测人）使该评测必须由用户本人（角色 5）执行或在其书面隔离措施下执行。
- **空缺 2（框架映射）**：16 项框架的评测对象需重定向到 S2 证据（第 1/2/4/5/7/8/10/11/12/15 项等），部分项的 S1 时代结论形态（如第 8 项 HTTP 503 维持 DEFERRED）已被 S2 时代证据事实变更（S2A-OBL-01-0001 已履行 HTTP 形态 503 补测——CR-18 选项 B DEFERRED 项关闭）。
- **空缺 3（黄金案例适用性）**：第 3 项 S1 时代裁决 N/A 的理由（S1 范围冻结未定义黄金案例套件）在 S2 时代已不成立——黄金套件经 PD-23 裁决纳入 S2b 范围（义务 G-4「更完整 Golden Suite」），G3-GOLDEN-0001 以 36 案例形态存在并通过。第 3 项在 S2 时代是否适用（执行或登记 N/A 附理由）属产品负责人裁决事项。
- **空缺 4（rubric 适用性）**：第 6 项 rubric 已经产品负责人批准为「合成 fixtures 上的契约一致性评测」（2026-10-09）；S2 时代 fixtures 扩至 11 件套（新增 create / correction / deepen / simplify / reframe 等）——rubric 对新增 fixtures 的适用性由评测人确认（批准范围仅测量方法与 rubric 定义本身，不含对 S2 fixtures 的预先判定）。
- **空缺 5（延迟）**：第 9 项 S1 时代已关闭（OBL02-LATENCY-0001 履行方法 §1–§6，16 分层 × 30 提交）。S2 时代 7 运行耗时（8.1s–19.9s）仅为参考值；任何延迟指标宣称前须满足 OBL-02-LATENCY-METHOD-01 v1.0.0 §5 样本纪律并注明分层（方法 §6 披露声明）。S2 时代是否另行执行延迟测量，属产品负责人裁决事项（或在工作表中登记 N/A 附理由）。

## 3. 选项

### 选项 A（实现方建议）：复用 16 项框架对 S2 证据执行独立评测

新建 **P3-S2-G5-WORKSHEET-01**（工作表骨架见 §4），沿用 P3-S1-G5-WORKSHEET-01 的 16 项结构与执行规则（结论取值 PASS / FAIL / DEFERRED / N/A，默认 NOT RUN；任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消），逐项映射 S2 证据，结论由角色 5 独立评测人逐项裁决签署。**（2026-10-09 经产品负责人裁决采纳——见 §6）** 优点：与 P2 时代评测框架一致、可比、可复用既有执行规则与隔离声明；缺点：工作量与 P2 时代相当（16 项）。

### 选项 B：S2 专属精简框架

仅执行 S2 义务直接相关项（建议子集：第 1/2/4/5/7/8/10/11/15/16 项），其余项登记 N/A 附理由（如第 3 项黄金案例已在 G3 Gate 流水线覆盖、第 9 项延迟测量已由 OBL02-LATENCY-0001 关闭）。优点：聚焦 S2 增量证据；缺点：N/A 理由链须逐项论证，评测可比性弱于选项 A。

### 选项 C：并入后续阶段统一评测

S2 证据暂不单独评测，待 P3 退出 Gate（或产品负责人指定的后续 Gate）统一执行。优点：减少评测轮次；缺点：S2 完成状态（readiness-record「S2a 五项义务全部关闭、S2b 首批义务完成」）在 P3 退出前持续处于「独立评测未执行」状态，与 P2「先关再建」（PD-20）纪律的严格程度不一致——P2 关闭前完成了 G5 评测。

## 4. 选项 A 实施影响

- 新建 `docs/product/p3-s1/s2-g5-evaluation-worksheet.md`（P3-S2-G5-WORKSHEET-01 v0.1.0，STAGED FOR EVALUATOR——骨架见下表；结论列全部 NOT RUN，由角色 5 逐项填写）。**（2026-10-09 已按本骨架新建 staged——`s2-g5-evaluation-worksheet.md`）**
- 评测输入：7 运行 staged 审阅包 ×7 + EVIDENCE-MANIFEST-01 v1.3.0 + 各 SEMANTIC-FREEZE-01 冻结文本 + decision-register 当前版本快照 + acceptance-mapping / XCC-MAP（S2 范围项）。
- 角色分离不变：实现作者（工程负责人角色代理）不得兼任独立评测人；本提案由实现方起草，裁决权归产品负责人，评测执行权归角色 5（用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效）。
- 不改变任何已冻结证据：各运行产物（summary.json / cases / traces / SHA256SUMS）为 hash-bound 冻结证据；工作表为评测工具，不是 Gate 证据。
- 裁决后登记：CR-26 状态 STAGED→RULED（S2 时代 G5 评测包范围定义裁决——选项 A）+ 新建 P3-S2-G5-WORKSHEET-01 v0.1.0 staged（`s2-g5-evaluation-worksheet.md`——16 项骨架，结论列全部 NOT RUN，待角色 5 逐项裁决）+ readiness-record 升版 v1.33.0 + 本提案 §6 签署区填写（均已执行，2026-10-09）。

### 16 项工作表骨架（选项 A；结论列待角色 5 逐项裁决）

| # | G5 必需项 | S2 证据映射（staged 输入） | 评测问题（沿用 P2 框架问句） | 结论 |
|---|----------|--------------------------|------------------------------|------|
| 1 | Version Matrix（版本矩阵） | 7 运行 `run-metadata.json`（E5 §3 矩阵；S2A-F2/F3/F4 含 code.gitHead；S2A-F5 含 runtimeFiles + git 节；S2B 含 42 文件级哈希；G3 含 policyVersions 链 policy_v1.0.0→v2.0.0） | 版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | NOT RUN |
| 2 | Test Scope（测试范围） | PD-23 S2 范围裁决（S2a 五义务 / S2b 首批义务）+ S2A-F*-SEMANTIC-FREEZE-01 / S2B-SEMANTIC-FREEZE-01 冻结文本 + acceptance-mapping / XCC-MAP v1.4.0（S2 范围项 EB-10/EB-11） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | NOT RUN |
| 3 | Golden Case Result（黄金案例结果） | G3-GOLDEN-0001（36/36 案例、10/10 断言——含 G09 方向性操作四维度案例组；语料 fixtureId synthetic/simulate/v2） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID），或登记 N/A 并附理由？**S1 时代 N/A 理由（S1 范围未定义黄金套件）在 S2 时代已不成立——适用性待产品负责人裁决** | NOT RUN |
| 4 | Contract Test Result（契约测试结果） | S2A-F2-0001 创作事件链 / S2A-F3-0001 纠正域事件链（correction_applied / correction_restored）/ S2A-F4-0001 simulation_recorded 四元分离事件登记 / S2A-F5-0001 记忆域事件（memory_recorded / corrected / withdrawn / expired） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？ | NOT RUN |
| 5 | Scenario Matrix Result（场景矩阵结果） | S2A-F2-0001 创作场景 10 案例（含全部登记负向）/ S2B-0001 G09 方向性操作案例组 / G3-GOLDEN-0001 36 案例 | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | NOT RUN |
| 6 | AI Evaluation Result（AI 评测结果） | 合成 fixtures 11 件套（`src/experience/fixtures/`——含 S2 新增 create / correction / deepen / simplify / reframe）；rubric 定义已经产品负责人批准（2026-10-09：合成 fixtures 上的契约一致性评测） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？**rubric 对 S2 新增 fixtures 的适用性由评测人确认** | NOT RUN |
| 7 | Regression Result（回归结果） | S2A-OBL-01-0001（F-1 回归双形态——INPROC-REGRESSION）/ S2A-F4-0001 语料裁决后域回归（9/9）/ G3-GOLDEN-0001 黄金套件回归基线（36/36） | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？ | NOT RUN |
| 8 | Fault Injection Result（故障注入结果） | S2A-OBL-01-0001 HTTP 形态 LLM 故障 503 补测（进程内 `LlmGateway` 接口注入 + HTTP 形态双覆盖——S1 时代 CR-18 选项 B DEFERRED 项已关闭） | 故障注入逐案评测结论？HTTP 形态 503：评测人是否接受为充分输入？**（S1 时代维持 DEFERRED 的裁决前提已事实变更——S2 时代重新裁决）** | NOT RUN |
| 9 | Latency Result（延迟结果） | S2 时代 7 运行耗时参考值（8121ms–19855ms）；OBL-02-LATENCY-METHOD-01 v1.0.0（方法已经产品负责人按 E3 批准） | 统计阈值是否已经产品负责人按 E3 批准？测量方法是否定义？**S2 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由）；任何指标宣称前须满足方法 §5 样本纪律** | NOT RUN |
| 10 | Agency Result（用户自主权结果） | S2A-F2/F3/F4/F5 停止路径与完成边界案例（STOP 合法终止、生成中常规输入拒绝、版本号不消耗、记忆 WITHDRAW 用户主权） | 逐案评测——用户主权是否零违规（P0 零容忍）？ | NOT RUN |
| 11 | Known Failures（已知失败） | S2 时代失败尝试 30 个归档目录（ADR-0002 §5 只追加留存——含 S2A-F4-0001-attempt-2026-10-09T17-50-08-431Z 执行器侧过期期望缺陷，产品运行时无缺陷）+ 缺陷登记（执行器侧 E-* / 案例侧缺陷全数修复） | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | NOT RUN |
| 12 | Product Debt（产品债务） | decision-register 当前版本（CR-01…CR-25）+ 按运行版本封存快照（评测人执行项） | 是否按运行版本封存决策登记册快照？未决事项是否列示？ | NOT RUN |
| 13 | Risk Assessment（风险评估） | —（评测人按已知失败、缺失证据及严重度记录） | 风险与残余风险是否登记？ | NOT RUN |
| 14 | Release Recommendation（发布建议） | —（评测人基于完整证据给出） | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布） | NOT RUN |
| 15 | Evidence Index（证据索引） | EVIDENCE-MANIFEST-01 v1.3.0（MANIFEST.json + INDEX.md——S2 运行追加，独立重算零不符）+ `artifacts/evidence/runs/` 只追加布局 | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead、产物提交哈希是否与运行产物一致？ | NOT RUN |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期 | NOT RUN |

## 5. 明确非结论

- 本提案不预判任何评测结论；不推断任何 Gate 为 PASS；退出码 0 / 案例 PASS 只表示各运行中的断言通过（E5 §2）。
- 选项 A/B/C 的选择不改变已冻结证据；S2B-0001 等运行产物保持 hash-bound 原样。
- 若产品负责人裁决选项 C，S2 证据维持「证据已产出、独立评测未执行」状态直至后续 Gate 统一评测——该状态的治理影响（readiness-record 状态行表述）由实现方按裁决登记。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-09。
- 产品负责人裁决：**选项 A（复用 16 项框架对 S2 证据执行独立评测），2026-10-09**。
- 独立评测人（角色 5，用户本人，PD-15）：（待评测执行——P3-S2-G5-WORKSHEET-01 v0.1.0 staged 已建，结论列全部 NOT RUN，待角色 5 逐项裁决签署）
