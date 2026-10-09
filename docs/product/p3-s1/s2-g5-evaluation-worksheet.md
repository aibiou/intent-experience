# S2 时代 G5 评测工作表（P3-S2-G5-WORKSHEET-01）

**状态：** STAGED FOR EVALUATOR——待角色 5 独立评测人（用户本人，PD-15）逐项裁决签署
**编号：** P3-S2-G5-WORKSHEET-01
**版本：** 0.1.0（2026-10-09：实现方按 S2-G5-EVAL-DEF-01 v1.0.0 §4 骨架起草 staged）
**框架：** 沿用 P3-S1-G5-WORKSHEET-01 16 项结构与执行规则（结论取值 PASS / FAIL / DEFERRED / N/A，默认 NOT RUN；任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消）
**角色分离：** 本工作表由实现方（工程负责人角色代理）起草；实现作者不得兼任独立评测人——结论列全部留白 NOT RUN，由角色 5 独立评测人逐项填写并签署
**评测输入：** 7 运行 staged 审阅包 ×7（`artifacts/evidence/runs/<run>/review/README.md`）+ EVIDENCE-MANIFEST-01 v1.3.0（MANIFEST.json + INDEX.md）+ 各 S2A/S2B SEMANTIC-FREEZE-01 冻结文本 + decision-register 当前版本快照 + acceptance-mapping / XCC-MAP（S2 范围项）
**关联：** S2-G5-EVAL-DEF-01 v1.0.0（选项 A 裁决——复用 16 项框架）/ P3-S1-G5-WORKSHEET-01 v1.8.0（P2 时代 16 项——PASSED 无条件，2026-10-09）/ OBL-02-LATENCY-METHOD-01 v1.0.0（第 9 项延迟方法）/ EVIDENCE-MANIFEST-01 v1.3.0
**记录日期：** 2026-10-09

## 16 项评测表（结论列待角色 5 逐项裁决）

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

## 执行规则（沿用 P2 框架）

- 结论取值：PASS / FAIL / DEFERRED / N/A；默认 NOT RUN。
- 任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消。
- 退出码 0 与案例 PASS 只表示各运行中的断言通过；不设置任何 Gate 为 PASS（E5 §2）。
- 第 13 项风险：评测人按已知失败、缺失证据及严重度记录；第 14 项发布建议：评测人基于完整证据给出（产品负责人另行决定；不得由 AI 或实现团队自动发布）。
- 第 9 项延迟：任何延迟指标宣称前须满足 OBL-02-LATENCY-METHOD-01 v1.0.0 §5 样本纪律并注明分层（方法 §6 披露声明）；S2 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由）。
- 第 3 项黄金案例：S1 时代 N/A 理由（S1 范围未定义黄金套件）在 S2 时代已不成立——适用性由评测人裁决（执行或登记 N/A 附理由）。

## 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-09（按 S2-G5-EVAL-DEF-01 v1.0.0 §4 骨架）。
- 独立评测人（角色 5，用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效）：（待逐项评测——第 1–15 项完成后填写第 16 项：独立性声明、版本、结论、遗留问题及签署日期）
