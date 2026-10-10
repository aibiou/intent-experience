# S3 时代 G5 评测工作表（P3-S3-G5-WORKSHEET-01）

**状态：** STAGED FOR EVALUATOR——16 项骨架结论列全部 NOT RUN，待角色 5 独立评测人（用户本人，PD-15）逐项裁决签署
**编号：** P3-S3-G5-WORKSHEET-01
**版本：** 0.1.0（2026-10-10：staged——按 S3-G5-EVAL-DEF-01 v1.0.0 §4 骨架新建）
**框架：** 沿用 P3-S1 / P3-S2-G5-WORKSHEET 16 项结构与执行规则（结论取值 PASS / FAIL / DEFERRED / N/A，默认 NOT RUN；任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消）
**角色分离：** 本工作表由实现方（工程负责人角色代理）起草；实现作者不得兼任独立评测人——结论列全部留白 NOT RUN，由角色 5 独立评测人逐项填写并签署
**评测输入：** 5 运行 staged 审阅包 ×5（`artifacts/evidence/runs/<run>/review/README.md`——G3-GOLDEN-0001 / S2A-F5-0001 / S2A-F4-0001 / S2B-0001 / S3-API-0001）+ EVIDENCE-MANIFEST-01 v1.5.0（MANIFEST.json + INDEX.md）+ S3A / S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + S3-SCOPE-PROPOSAL-01 v1.0.0 裁决文本 + decision-register 当前版本快照 + acceptance-mapping / XCC-MAP（S3 范围项）+ P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代结论——延续性核验输入）
**关联：** S3-G5-EVAL-DEF-01 v1.0.0（选项 A 裁决——复用 16 项框架）/ P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代 G5——PASSED 无条件，2026-10-10）/ P3-S1-G5-WORKSHEET-01 v1.8.0（P2 时代 16 项——PASSED 无条件，2026-10-09）/ OBL-02-LATENCY-METHOD-01 v1.0.0（第 9 项延迟方法）/ EVIDENCE-MANIFEST-01 v1.5.0 / P3-S3-IMPL-ITER v1.0.0
**记录日期：** 2026-10-10

## 16 项评测表（结论列——角色 5 逐项裁决）

| # | G5 必需项 | S3 证据映射（staged 输入） | 评测问题（沿用 P2 框架问句） | 结论 |
|---|----------|--------------------------|------------------------------|------|
| 1 | Version Matrix（版本矩阵） | 5 运行 `run-metadata.json`（E5 §3 矩阵；G3-GOLDEN-0001 / S2A-F4-0001 / S3-API-0001 含 git 节 commit `5af5592` / `e6780c8`；S2A-F5-0001 含 runtimeFiles + git 节；S2B-0001 含文件级哈希；G3 含 policyVersions 链 policy_v1.0.0→v2.2.0；版本矩阵记录现行 state_machine_v1.5.0——轴外记忆子状态机契约化冻结于 state_machine_v1.4.0 §4 变更 1，provenance 注记承载） | 版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | NOT RUN |
| 2 | Test Scope（测试范围） | S3-SCOPE-PROPOSAL-01 v1.0.0（D-1…D-5 全项 A 裁决文本）+ S3A / S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + acceptance-mapping / XCC-MAP（S3 范围项） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | NOT RUN |
| 3 | Golden Case Result（黄金案例结果） | G3-GOLDEN-0001（48/48 案例、10/10 断言——G11 长期记忆案例组 + G12 跨会话分支持久化案例组 N/NEG/B/FR；语料 fixtureId synthetic/simulate/v2） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID）？**S3 增量案例组（G11/G12）适用性——S1/S2 时代 N/A 理由均已不成立（G3-GOLDEN-0001 存在并再生至 48/48）** | NOT RUN |
| 4 | Contract Test Result（契约测试结果） | S2A-F5-0001 记忆域事件链（memory_recorded properties 扩展 memory_class / source / confidence——C6 §14 属性扩展不新增事件名）/ S2A-F4-0001 simulation_adopted 事件链 + 跨会话持久化回归（INPROC-REGRESSION）/ S3-API-0001 HTTP 执行形态事件链（NDJSON 流：submission / chunk / done / state_updated + 错误语义 400 INVALID_ACTION / 400 INVALID_REQUEST / STATE_VERSION_CONFLICT） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？ | NOT RUN |
| 5 | Scenario Matrix Result（场景矩阵结果） | S2A-F5-0001 长期记忆场景 14 案例（含 LT-BARE-NEG / LT-GATE-NEG 等登记负向）/ G3-GOLDEN-0001 G11/G12 案例组 / S3-API-0001 8 场景（执行形态路由 / fixture 形态兼容 / 错误语义 / 只读观测） | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | NOT RUN |
| 6 | AI Evaluation Result（AI 评测结果） | 合成 fixtures（S3 未新增——长期记忆 / 跨会话分支语义经既有 fixtures + 新案例组覆盖）；rubric 定义已经产品负责人批准（2026-10-09：合成 fixtures 上的契约一致性评测） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？**rubric 对 S3 增量语义（记忆操作 / 跨会话分支操作请求类别）的适用性由评测人确认** | NOT RUN |
| 7 | Regression Result（回归结果） | S2A-F5-0001 / S2A-F4-0001 再生产物（S3 回归扩展 + 执行器元数据校正后再生成）/ S2B-0001 重跑（黄金回归绑定新基线 policy_v2.2.0 / 48 案例）/ G3-GOLDEN-0001 黄金套件回归基线（48/48）/ S3-API-0001 首次执行 | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？**S2 语义零回归（policy_v2.2.0 恒等映射）核验** | NOT RUN |
| 8 | Fault Injection Result（故障注入结果） | S2A-OBL-01-0001（HTTP 形态 LLM 故障 503 补测——S1/S2 时代已关闭）；S3 时代无新增故障注入面——暴露层错误语义（400 INVALID_ACTION / 400 INVALID_REQUEST / STATE_VERSION_CONFLICT）经 S3-API-0001 案例覆盖 | 故障注入逐案评测结论？**S3 暴露层错误语义覆盖是否充分（或登记 N/A 附理由——无新增故障注入面）** | NOT RUN |
| 9 | Latency Result（延迟结果） | S3 时代 5 运行耗时参考值（7923ms–29295ms）；OBL-02-LATENCY-METHOD-01 v1.0.0（方法已经产品负责人按 E3 批准） | 统计阈值是否已经产品负责人按 E3 批准？测量方法是否定义？**S3 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由——类比 S2 时代裁决）；任何指标宣称前须满足方法 §5 样本纪律，方法分层如需覆盖 S3 新增请求类别（记忆操作 / 跨会话分支操作）须先升版批准** | NOT RUN |
| 10 | Agency Result（用户自主权结果） | S2A-F5-0001 长期记忆用户主权（WITHDRAW / CORRECT 主权复用既有生命周期与事件；C 类候选 ≠ 已保存——V1 不允许仅凭行为自动升级为永久用户画像；裸记住请求不识别为记忆写入）/ 跨会话分支主权（新会话显式五操作——前置条件运行时内校验：输入会话 ACTIVE + 宿主会话已结束 + 分支记录存在；内容轮保持严格会话绑定）/ 停止路径与完成边界案例 | 逐案评测——用户主权是否零违规（P0 零容忍）？ | NOT RUN |
| 11 | Known Failures（已知失败） | S3 周期失败尝试 7 次 + FATAL 1 次（ADR-0002 §5 只追加留存——含 FATAL 部分产物归档 1 个（S2A-F5-0001-attempt-2026-10-10T04-41-45-293Z——仅含 cases/ ×14 / logs/ / traces/）与 S2B-0001 FATAL 1 次（无产物——先于运行目录创建）；均为执行器侧案例断言 / 基线 / 元数据缺陷，产品运行时零缺陷）+ 尝试归档总数 53 | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | NOT RUN |
| 12 | Product Debt（产品债务） | decision-register 当前版本（CR-01…CR-29）+ 按运行版本封存快照（评测人执行项） | 是否按运行版本封存决策登记册快照？未决事项是否列示？ | NOT RUN |
| 13 | Risk Assessment（风险评估） | —（评测人按已知失败、缺失证据及严重度记录） | 风险与残余风险是否登记？ | NOT RUN |
| 14 | Release Recommendation（发布建议） | —（评测人基于完整证据给出） | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布） | NOT RUN |
| 15 | Evidence Index（证据索引） | EVIDENCE-MANIFEST-01 v1.5.0（MANIFEST.json + INDEX.md——五运行登记 + 尝试归档总数 53，独立重算全部精确通过）+ `artifacts/evidence/runs/` 只追加布局 | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead、产物提交哈希是否与运行产物一致？ | NOT RUN |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期 | NOT RUN |

## 执行规则（沿用 P2 框架）

- 结论取值：PASS / FAIL / DEFERRED / N/A；默认 NOT RUN。
- 任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消。
- 退出码 0 与案例 PASS 只表示各运行中的断言通过；不设置任何 Gate 为 PASS（E5 §2）。
- 第 13 项风险：评测人按已知失败、缺失证据及严重度记录；第 14 项发布建议：评测人基于完整证据给出（产品负责人另行决定；不得由 AI 或实现团队自动发布）。
- 第 9 项延迟：任何延迟指标宣称前须满足 OBL-02-LATENCY-METHOD-01 v1.0.0 §5 样本纪律并注明分层（方法 §6 披露声明）；S3 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由）；方法分层如需覆盖 S3 新增请求类别（记忆操作 / 跨会话分支操作）须先升版批准。
- 第 3 项黄金案例：S1/S2 时代 N/A 理由均已不成立（黄金套件存在并再生至 48/48）——适用性由评测人裁决（执行或登记 N/A 附理由）；S3 增量案例组（G11/G12）评测。
- 延续性核验：S2 时代 G5 评测结论（P3-S2-G5-WORKSHEET-01 v0.3.0 PASSED 无条件）对 S2 语义持续有效——本工作表覆盖 S3 增量证据并核验延续性，不重开 S2 时代已关闭项。

## 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10（按 S3-G5-EVAL-DEF-01 v1.0.0 §4 骨架）。
- 独立评测人（角色 5，用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效）：（待评测执行——结论列全部 NOT RUN，待角色 5 逐项裁决签署第 16 项）
