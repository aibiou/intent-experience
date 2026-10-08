# G5 独立评测工作表（供独立评测人逐项执行填写）

**编号：** P3-S1-G5-WORKSHEET-01
**版本：** 1.0.0（2026-10-09：工作表已建立——16 项评测结论全部 NOT RUN，供独立评测人（角色 5）逐项执行填写）
**状态：** STAGED FOR EVALUATOR（staged 输入材料已备；本工作表为评测工具，不是 Gate 证据——不得由工作表存在推断 G5 PASS）
**评测人：** 用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效——兼任实现相关角色，书面隔离措施已记录于 G5 隔离声明）
**前置义务：** 评测人须先审阅三份 staged 审阅包后方可执行评测：`artifacts/evidence/runs/F1-E2E-0001/review/README.md`、`artifacts/evidence/runs/F2-GS-0001/review/README.md`、`artifacts/evidence/runs/F3-EB-0001/review/README.md`。

## 执行规则

1. 每项结论取值：`PASS` / `FAIL` / `DEFERRED` / `N/A`（非适用，须附理由）；默认 `NOT RUN`，不得由输入材料存在推断 `PASS`。
2. 任何 P0 失败、缺项或 `NOT RUN` 均不得被平均分或建议性报告抵消（evidence-execution-plan §6.1 判定规则）。
3. 第 16 项（评测负责人签署）须在 1–15 项均有适用结论后填写。
4. 第 3 / 6 / 9 项有前置条件（见下"前置裁决"），未满足前保持 `NOT RUN`。
5. 本工作表与三份 staged 审阅包、evidence-execution-plan §6.1/§6.2 交叉表配套使用；Gate 判定以产品负责人正式签署的 G5 结论为准。

## 前置裁决（评测人 / 产品负责人，G5 执行前）

| 项 | 前置条件 | 建议方向（裁决权在产品负责人 / 评测人） | 裁决 |
|---|---|---|---|
| 3 | 黄金案例套件是否存在 | S1 范围未定义黄金套件——建议登记 N/A 并附理由，或先创建黄金案例后执行 | 待裁决 |
| 6 | 评测 rubric 与责任人批准 | S1 无真实 LLM 提供方——建议 rubric 定义为"合成 fixtures 上的契约一致性评测"，责任人：用户本人 | 待裁决 |
| 9 | 延迟统计阈值批准（E3） | 依 PB-03"无真实基线不编造统计阈值"——建议暂不设统计阈值，F3 运行耗时 9.0s 登记为参考值 | 待裁决 |

## 16 项评测表

| # | E8 G5 必需项 | staged 输入位置 | 评测问题（评测人逐项回答） | 评测人结论 | 证据引用 |
|---|---|---|---|---|---|
| 1 | Version Matrix（版本矩阵） | 三运行 `run-metadata.json`（E5 §3 矩阵；F3 含 engineeringBoundaries 专项 + 31 项运行时文件哈希 + 执行器哈希；SHA256SUMS 独立重算：F3 46/46 精确匹配，F1 20/21、F2 84/85——各 1 项时点性不匹配（summary.json 于清单计算后定稿，经独立审计登记为非篡改，git e03e6b9）） | 三运行版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | NOT RUN | — |
| 2 | Test Scope（测试范围） | acceptance-mapping（范围冻结，PD-05…PD-08）+ XCC-MAP v1.4.0（A2 非作者复核 REVIEW-004）+ F3 案例范围声明（G2 5 案例 + EB-01…EB-16；S2 范围项 EB-10/EB-11 仅 S1 缺席证明） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | NOT RUN | — |
| 3 | Golden Case Result（黄金案例结果） | —（无黄金案例执行产物） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID），或登记 N/A 并附理由？ | NOT RUN | — |
| 4 | Contract Test Result（契约测试结果） | F3-EB-0001 G2 动态跨契约一致性 5 案例记录与轨迹（G2-CHAIN-01/02、G2-FAULT-01/02、G2-VERSION-01） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？ | NOT RUN | — |
| 5 | Scenario Matrix Result（场景矩阵结果） | F2-GS-0001 GS-01…GS-06 场景案例 40 个（含全部登记负向）+ S1-ACT-WHAT_IF | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | NOT RUN | — |
| 6 | AI Evaluation Result（AI 评测结果） | —（S1 无真实 LLM 提供方接入；合成 fixtures） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？ | NOT RUN | — |
| 7 | Regression Result（回归结果） | F-1 回归双形态（F2-GS-0001：F1-REG-INPROC、HTTP-12；基线 F1-E2E-0001 9/9） | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？ | NOT RUN | — |
| 8 | Fault Injection Result（故障注入结果） | F3 故障注入案例：EB-02 / EB-05 / EB-06 / EB-06-NO-RETRY-STOP / EB-07（进程内 `LlmGateway` 接口注入）；HTTP 形态 503 已 DEFERRED（CR-18 选项 B，2026-10-09） | 进程内故障注入逐案评测结论？HTTP 形态 503：评测人是否接受进程内形态 + 静态映射为充分输入（接受 → 维持 DEFERRED；不接受 → G4 证据链不完整，须后续切片补测）？ | NOT RUN | — |
| 9 | Latency Result（延迟结果） | F3 运行耗时 9.0s（参考值，非指标） | 统计阈值是否已经产品负责人按 E3 批准（未批准前不得宣告指标达标或发布 PASS）？测量方法（环境 / 模型 / 请求类别分层、样本窗口）是否定义？ | NOT RUN | — |
| 10 | Agency Result（用户自主权结果） | F3 EB-04 / EB-06s / EB-13（可中断性、失败后 STOP、完成边界用户主权）+ F2 GS-04 系列（STOP 终止四事件齐备、零续行） | 逐案评测——用户主权是否零违规（P0 零容忍）？STOP / CHANGE / 拒绝 / 直接回答 / 无自主续行案例的预期 / 实际 / trace 是否齐备？ | NOT RUN | — |
| 11 | Known Failures（已知失败） | 三迭代失败尝试如实归档（F1 3 次、F2 2 次、F3 2 次，ADR-0002 §5）+ 缺陷登记 D-1/D-2（运行时，已修复）、E-1…E-3 与 F3-E-1…F3-E-9（案例/执行器侧，已修复） | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | NOT RUN | — |
| 12 | Product Debt（产品债务） | decision-register v0.13.0（CR-01…CR-18 已关闭；G6 处置表 PB-01…PB-04 RESOLVED） | 是否按运行版本封存决策登记册快照？未决事项（隐私六要素剩余值、G5 自身）是否列示？ | NOT RUN | — |
| 13 | Risk Assessment（风险评估） | — | 评测人按已知失败、缺失证据及严重度记录风险与残余风险。 | NOT RUN | — |
| 14 | Release Recommendation（发布建议） | — | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布）。 | NOT RUN | — |
| 15 | Evidence Index（证据索引） | `artifacts/evidence/runs/` 只追加布局；四运行 + 六失败尝试归档；各运行 SHA256SUMS；`artifacts/evidence/manifest/`（MANIFEST.json + INDEX.md，独立重算生成） | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead、产物提交哈希是否与运行产物一致？ | NOT RUN | — |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期。 | NOT RUN | — |

## 签署区（评测完成后填写）

| 角色 | 签署 | 结论（G5 判定） | 遗留问题 | 日期 |
|---|---|---|---|---|
| 独立评测负责人（角色 5） | PENDING | NOT RUN | — | — |
| 产品负责人（正式签署） | PENDING | NOT RUN | — | — |

**判定公式提醒：** G5 只有在上述 16 项均有适用的、版本化的真实材料，并由独立评测者复核且产品负责人正式签署后，才可按 E8 原关闭公式判定。
