# G5 独立评测工作表（供独立评测人逐项执行填写）

**编号：** P3-S1-G5-WORKSHEET-01
**版本：** 1.7.0（2026-10-09：第 16 项签署完成——独立评测负责人（角色 5）与产品负责人双行签署已登记（评测人确认签署区内容；产品负责人接受 G5 结果，含两项 DEFERRED 遗留）；**G5 判定：PASS（有条件）**——16 项 = 12 PASS + 1 N/A（第 3 项）+ 1 DEFERRED（第 9 项）+ 发布建议 B（第 14 项）；遗留事项：① HTTP 形态 LLM 故障 503 后续切片补测（CR-18 选项 B，风险 R1）；② 延迟测量方法定义（第 9 项 DEFERRED，风险 R3）；Gate 状态同步见 readiness-record P3-S1-READINESS-01 v1.8.0（G1/G2/G4/G5/G6/G7 PASSED；G3/G8 仍 NOT PASSED；P2 仍 CLOSURE CANDIDATE / BLOCKED））
**状态：** STAGED FOR EVALUATOR（staged 输入材料已备；本工作表为评测工具，不是 Gate 证据——不得由工作表存在推断 G5 PASS）
**评测人：** 用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效——兼任实现相关角色，书面隔离措施已记录于 G5 隔离声明）
**前置义务：** 评测人须先审阅三份 staged 审阅包后方可执行评测：`artifacts/evidence/runs/F1-E2E-0001/review/README.md`、`artifacts/evidence/runs/F2-GS-0001/review/README.md`、`artifacts/evidence/runs/F3-EB-0001/review/README.md`。**（已履行：角色 5 审阅通过，2026-10-09，无否决登记——见下"staged 审阅包审阅登记"节。）**

## 执行规则

1. 每项结论取值：`PASS` / `FAIL` / `DEFERRED` / `N/A`（非适用，须附理由）；默认 `NOT RUN`，不得由输入材料存在推断 `PASS`。
2. 任何 P0 失败、缺项或 `NOT RUN` 均不得被平均分或建议性报告抵消（evidence-execution-plan §6.1 判定规则）。
3. 第 16 项（评测负责人签署）须在 1–15 项均有适用结论后填写。
4. 第 3 项前置裁决已登记 N/A（2026-10-09）；第 6 / 9 项前置裁决已批准（2026-10-09）——第 6 / 9 项评测执行与结论仍属评测人，保持 `NOT RUN` 直至逐项执行。
5. 本工作表与三份 staged 审阅包、evidence-execution-plan §6.1/§6.2 交叉表、G5 证据要点简报（P3-S1-G5-BRIEFING-01——代理整理的定位辅助，非证据、非结论）配套使用；Gate 判定以产品负责人正式签署的 G5 结论为准。

## staged 审阅包审阅登记（输入审阅，非评测结论）

角色 5（用户本人，PD-15）已审阅三份 staged 审阅包并通过（2026-10-09）：

| 审阅包 | 审阅结果 | 否决登记 |
|---|---|---|
| `artifacts/evidence/runs/F1-E2E-0001/review/README.md` | 通过（2026-10-09） | 无 |
| `artifacts/evidence/runs/F2-GS-0001/review/README.md` | 通过（2026-10-09） | 无 |
| `artifacts/evidence/runs/F3-EB-0001/review/README.md` | 通过（2026-10-09） | 无 |

此登记为输入审阅事实：确认三份审阅包可作为 G5 评测的 staged 输入。**不构成 16 项评测结论**——16 项结论须评测人逐项执行后填写（当前全部 `NOT RUN`，第 3 项为已裁决 `N/A`）。

## 前置裁决（评测人 / 产品负责人，G5 执行前）

| 项 | 前置条件 | 建议方向（裁决权在产品负责人 / 评测人） | 裁决 |
|---|---|---|---|
| 3 | 黄金案例套件是否存在 | S1 范围未定义黄金套件——建议登记 N/A 并附理由，或先创建黄金案例后执行 | **已裁决（选项 A，2026-10-09 产品负责人）：登记 N/A 并附理由**——S1 范围冻结（PD-05…PD-08）未定义黄金案例套件；创建黄金案例属新增范围项，须先经产品负责人批准 |
| 6 | 评测 rubric 与责任人批准 | S1 无真实 LLM 提供方——建议 rubric 定义为"合成 fixtures 上的契约一致性评测"，责任人：用户本人 | **已裁决（选项 A，2026-10-09 产品负责人）：rubric 定义为"合成 fixtures 上的契约一致性评测"，责任人：用户本人（角色 5，PD-15）**——批准生效；评测人据此逐项执行并记录逐项输出与评测者理由 |
| 9 | 延迟统计阈值批准（E3） | 依 PB-03"无真实基线不编造统计阈值"——建议暂不设统计阈值，F3 运行耗时 9.0s 登记为参考值 | **已裁决（选项 A，2026-10-09 产品负责人）：暂不设统计阈值**（PB-03：无真实基线不编造统计阈值）；F1/F2/F3 运行耗时 4.6s / 14.6s / 9.0s 登记为参考值；测量方法（环境 / 模型 / 请求类别分层、样本窗口）待定义——未批准前不得宣告指标达标或发布 PASS |

## 16 项评测表

| # | E8 G5 必需项 | staged 输入位置 | 评测问题（评测人逐项回答） | 评测人结论 | 证据引用 |
|---|---|---|---|---|---|
| 1 | Version Matrix（版本矩阵） | 三运行 `run-metadata.json`（E5 §3 矩阵；F3 含 engineeringBoundaries 专项 + 31 项运行时文件哈希 + 执行器哈希；SHA256SUMS 独立重算：F3 46/46 精确匹配，F1 20/21、F2 84/85——各 1 项时点性不匹配（summary.json 于清单计算后定稿，经独立审计登记为非篡改， git e03e6b9）） | 三运行版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | PASS（2026-10-09 评测人判定：字段完备、哈希一致、Product Decision → 契约版本 → 代码修订关联可追溯；F1 未提交工作树 12 项条目为实施期如实记录，经评测人核对满足 E5 §3 记录要求） | 三运行 `run-metadata.json`（E5 §3 全字段；F3 含 engineeringBoundaries / packages / f1RegressionBaseline / priorIterations / executorSha256）；C1 core_schema_v1.0.0 registeredHash=computedHash（E5-TRIAL-0001 可核对）；运行时文件逐文件哈希 F1 15 / F2 32 / F3 32 项 |
| 2 | Test Scope（测试范围） | acceptance-mapping（范围冻结，PD-05…PD-08）+ XCC-MAP v1.4.0（A2 非作者复核 REVIEW-004）+ F3 案例范围声明（G2 5 案例 + EB-01…EB-16；S2 范围项 EB-10/EB-11 仅 S1 缺席证明） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | PASS（2026-10-09 评测人判定：适用 / 延期 / 非适用理由逐案明确且与范围冻结一致；acceptance-mapping / XCC-MAP 内 "NOT RUN" 状态文本为冻结 / staged 时点内容，以「冻结范围 vs 已执行案例」对照为准——F2/F3 已动态执行 GS-01…GS-06） | acceptance-mapping（范围冻结 PD-05…PD-08）；XCC-MAP v1.4.0（A2 非作者复核 REVIEW-004）；F3 run-metadata engineeringBoundaries（G2 5 案例 + EB-01…EB-16；S2 范围项 EB-10/EB-11 仅 S1 缺席证明）；P2 G01–G08 未覆盖案例 DEFERRED TO S2 |
| 3 | Golden Case Result（黄金案例结果） | —（无黄金案例执行产物） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID），或登记 N/A 并附理由？ | N/A（2026-10-09 产品负责人裁决：S1 范围冻结未定义黄金案例套件——见前置裁决） | — |
| 4 | Contract Test Result（契约测试结果） | F3-EB-0001 G2 动态跨契约一致性 5 案例记录与轨迹（G2-CHAIN-01/02、G2-FAULT-01/02、G2-VERSION-01） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？ | PASS（2026-10-09 评测人判定：逐案动态记录支持跨契约一致性结论——WHY/CHANGE 完整链路（含复合步骤 [CHANGE_DIRECTION, EXPERIENCE_STARTED, USER_ACTION] v3→v4）、generation 归属与迟到达旧 generation 拒绝、UNKNOWN 升级与语义不匹配故障链、版本链 +1 不变式） | F3-EB-0001 cases/ G2-CHAIN-01/02、G2-FAULT-01/02、G2-VERSION-01 + traces/（24 份 JSONL、133 事件，经独立审计核验有效非空） |
| 5 | Scenario Matrix Result（场景矩阵结果） | F2-GS-0001 GS-01…GS-06 场景案例 40 个（含全部登记负向）+ S1-ACT-WHAT_IF | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | PASS（2026-10-09 评测人判定：场景矩阵覆盖完备（GS-01…GS-06 含全部登记负向 + S1-ACT-WHAT_IF），GXC01…GXC08 逐案映射经评测人确认） | F2-GS-0001 cases/ 40 案例 + XCC-MAP v1.4.0（GXC01…GXC08 映射，A2 非作者复核 REVIEW-004） |
| 6 | AI Evaluation Result（AI 评测结果） | —（S1 无真实 LLM 提供方接入；合成 fixtures） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？ | PASS（2026-10-09 评测人判定：rubric 逐 fixture 判定——**4 个均一致，理由：映射与内容均符合对应契约条款**（评测人原话，覆盖 direct-answer / why / change-direction / simulate 全部 4 个 fixture）；逐项判定记录见下"AI 评测 rubric 执行记录"节） | 合成 fixtures（`src/experience/fixtures/` 4 文件）；AI 评测 rubric 执行记录（本工作表下节：fixture × 契约条款 × 评测人判定）；B25 静态扫描 0 违规（`src/experience/**` + `app/api/**` 25 文件） |
| 7 | Regression Result（回归结果） | F-1 回归双形态（F2-GS-0001：F1-REG-INPROC、HTTP-12；基线 F1-E2E-0001 9/9） | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？ | PASS（2026-10-09 评测人判定：F-1 回归双形态重跑已完成且关联齐备——前后版本 / 受影响案例 / 基线 Run ID 可追溯；**Change ID 形式缺口已经产品负责人批准补登记（PD-18，2026-10-09）：以实施授权记录 + 迭代记录 + Run ID 链作为 Change ID 等价物**） | F2-GS-0001 cases/ F1-REG-INPROC、HTTP-12（PASS）；基线 F1-E2E-0001（9/9）；F3 run-metadata.f1RegressionBaseline（http.ts / stream.ts / audit.ts 零改动，git diff d13e54e..bf21196 为空）；PD-18（PODR-001 v1.0.5） |
| 8 | Fault Injection Result（故障注入结果） | F3 故障注入案例：EB-02 / EB-05 / EB-06 / EB-06-NO-RETRY-STOP / EB-07（进程内 `LlmGateway` 接口注入）；HTTP 形态 503 已 DEFERRED（CR-18 选项 B，2026-10-09） | 进程内故障注入逐案评测结论？HTTP 形态 503：评测人是否接受进程内形态 + 静态映射为充分输入（接受 → 维持 DEFERRED；不接受 → G4 证据链不完整，须后续切片补测）？ | PASS（2026-10-09 评测人判定：进程内形态经 `LlmGateway` 接口注入覆盖 S1 范围故障语义，逐案通过；**评测人接受进程内形态 + 静态映射为充分输入——HTTP 形态 503 维持 DEFERRED（CR-18 选项 B），登记为已知局限 / 后续切片**（风险 R1）） | F3-EB-0001 cases/ EB-02、EB-05、EB-06、EB-06-NO-RETRY-STOP、EB-07（全 PASS）；CR-18 裁决记录（decision-register）；F3 run-metadata engineeringBoundaries.notRunOverHttp.EB12_503 |
| 9 | Latency Result（延迟结果） | F3 运行耗时 9.0s（参考值，非指标） | 统计阈值是否已经产品负责人按 E3 批准（未批准前不得宣告指标达标或发布 PASS）？测量方法（环境 / 模型 / 请求类别分层、样本窗口）是否定义？ | DEFERRED（2026-10-09 评测人选项 A：本项适用但执行条件未备——测量方法（环境 / 模型 / 请求类别分层、样本窗口）定义列入后续切片；统计阈值不设（PB-03，2026-10-09 裁决）；F1/F2/F3 耗时 4.6s / 14.6s / 9.0s 保持参考值；测量方法定义并经批准前不得宣告指标达标或发布 PASS） | 三运行 summary.json durationMs（参考值）；PB-03 / PD-08（无真实基线不编造统计阈值）；测量方法定义列入后续切片（风险 R3） |
| 10 | Agency Result（用户自主权结果） | F3 EB-04 / EB-06s / EB-13（可中断性、失败后 STOP、完成边界用户主权）+ F2 GS-04 系列（STOP 终止四事件齐备、零续行） | 逐案评测——用户主权是否零违规（P0 零容忍）？STOP / CHANGE / 拒绝 / 直接回答 / 无自主续行案例的预期 / 实际 / trace 是否齐备？ | PASS（2026-10-09 评测人判定：用户主权逐案零违规——STOP 终止四事件齐备且零续行、"好了"确定性分类 STOP、生成中常规输入拒绝、CHANGE 取消旧 generation、LLM 提案 is_complete 拒绝；本面"不应发生"清单（STOP 后续行 / CHANGE 后旧结果入库 / LLM 直接状态变更 / Analytics 触发产品动作）核对无违规） | F3-EB-0001 cases/ EB-04（I1–I4 组合可中断性）、EB-06s（失败后 STOP）、EB-13（完成边界用户主权）；F2-GS-0001 GS-04 系列 |
| 11 | Known Failures（已知失败） | 三迭代失败尝试如实归档（F1 3 次、F2 2 次、F3 2 次，ADR-0002 §5）+ 缺陷登记 D-1/D-2（运行时，已修复）、E-1…E-3 与 F3-E-1…F3-E-9（案例/执行器侧，已修复） | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | PASS（2026-10-09 评测人判定：失败与缺陷汇总完整、无隐藏或覆盖——三迭代失败尝试 6 次全部只追加归档留存；缺陷 D-1/D-2、E-1…E-3、F3-E-1…F3-E-9 全数登记并修复；三项执行器时序行为经独立审计登记为非篡改；残余风险关联见风险登记 R6） | artifacts/evidence/runs/ 失败尝试归档 6 目录（只追加，ADR-0002 §5）；缺陷登记 D-1/D-2、E-1…E-3、F3-E-1…F3-E-9；P3-S1-IMPL-ITER-003 §3 独立审计发现 |
| 12 | Product Debt（产品债务） | decision-register v0.13.0（CR-01…CR-18 已关闭；G6 处置表 PB-01…PB-04 RESOLVED） | 是否按运行版本封存决策登记册快照？未决事项（隐私六要素剩余值、G5 自身）是否列示？ | PASS（2026-10-09 评测人判定：按评测时点版本封存决策登记册快照 v0.14.0（git 提交哈希 9674aaf 即快照）；未决事项列示——G5 自身（本工作表）、G8、P2 收束；注：staged 输入引用 v0.13.0 为时点性滞后，封存对象以评测时点现行版本为准） | decision-register.md v0.14.0 @ git 9674aaf（CR-01…CR-18 全关闭；G6 处置表 PB-01…PB-04 RESOLVED；隐私六要素全部裁决签署 P3-S1-PRIVACY-SIX-01 v0.4.0） |
| 13 | Risk Assessment（风险评估） | — | 评测人按已知失败、缺失证据及严重度记录风险与残余风险。 | PASS（2026-10-09 评测人判定：风险与残余风险已登记 R1–R7——见下"风险评估登记"节，经评测人审定） | 风险评估登记（本工作表"风险评估登记"节：R1–R7，2026-10-09 评测人审定） |
| 14 | Release Recommendation（发布建议） | — | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布）。 | B=建议有条件通过（2026-10-09 评测人复选路径 1：**建议 G5 通过（有条件）**——12 项 PASS + 第 3 项 N/A + 第 9 项 DEFERRED；遗留事项：① HTTP 形态 LLM 故障 503 后续切片补测（CR-18 选项 B，风险 R1）；② 延迟测量方法定义（第 9 项 DEFERRED，风险 R3）；产品负责人是否接受 G5 结果另行决定——不得改变已执行案例的预期以追认 PASS） | 全部 16 项评测记录（本工作表 v1.6.0）；风险登记 R1–R7；三运行证据包（F1-E2E-0001 / F2-GS-0001 / F3-EB-0001） |
| 15 | Evidence Index（证据索引） | `artifacts/evidence/runs/` 只追加布局；四运行 + 六失败尝试归档；各运行 SHA256SUMS；`artifacts/evidence/manifest/`（MANIFEST.json + INDEX.md，独立重算生成） | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead、产物提交哈希是否与运行产物一致？ | PASS（2026-10-09 评测人判定：索引与运行产物一致，可独立重算验证——各运行案例 / 断言计数、SHA256SUMS 重算状态（F3 46/46 精确；F1 20/21、F2 84/85 各 1 项时点性不匹配已登记）、代码绑定 gitHead、产物提交哈希均与运行产物一致） | `artifacts/evidence/manifest/`（MANIFEST.json + INDEX.md + repro-logs/，2026-10-08T16:35:08 独立重算生成）；`artifacts/evidence/runs/` 只追加布局（四运行 + 六失败尝试归档）；各运行 SHA256SUMS |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期。 | 已签署（2026-10-09：独立性声明、版本、结论、遗留问题及签署日期齐备——见签署区；评测人结论 G5 通过（有条件）） | 签署区（本工作表下节）；G5 隔离声明（2026-10-08）；P3-S1-READINESS-01 v1.8.0 |

## 签署区（评测完成后填写）

| 角色 | 签署 | 结论（G5 判定） | 遗留问题 | 日期 |
|---|---|---|---|---|
| 独立评测负责人（角色 5） | 已签署（2026-10-09；独立性声明：角色 5 独立执行，与实现作者身份冲突已按 G5 隔离声明 2026-10-08 书面记录隔离措施；三份 staged 审阅包审阅通过、无否决登记；对全部原始轨迹与预期保留审阅与否决权） | G5 通过（有条件） | ① HTTP 形态 LLM 故障 503 后续切片补测（CR-18 选项 B，风险 R1）；② 延迟测量方法定义（第 9 项 DEFERRED，风险 R3）；风险登记 R1–R7 全关联 | 2026-10-09 |
| 产品负责人（正式签署） | 已签署（2026-10-09；接受 G5 结果（有条件通过），含两项 DEFERRED 遗留；未改变任何已执行案例的预期） | G5 通过（有条件）——接受 | 同上 | 2026-10-09 |

## 风险评估登记（第 13 项，2026-10-09 评测人审定）

| ID | 风险 | 严重度 | 描述 | 残余风险处置 |
|---|---|---|---|---|
| R1 | HTTP 形态 LLM 故障 503 未覆盖 | 高 | S1 服务端运行时（合成模式）未暴露网关注入缝，HTTP 形态故障注入未执行 | DEFERRED TO 后续切片（CR-18 选项 B，2026-10-09 产品负责人裁决）；进程内形态经 `LlmGateway` 接口覆盖失败语义 |
| R2 | 正式 Change ID 关联未注册 | 中 | 回归关联无正式 Change ID 登记 | 已经产品负责人批准补登记等价关联（PD-18，2026-10-09：实施授权 + 迭代记录 + Run ID 链）；正式 Change ID 注册表如后续建立，本登记应并入 |
| R3 | 延迟测量方法未定义、无统计阈值 | 中 | 发布指标不可判定；F1/F2/F3 耗时仅参考值 | 第 9 项已裁决 DEFERRED（2026-10-09 评测人选项 A）：测量方法定义列入后续切片；定义并经批准前不得宣告指标达标或发布 PASS |
| R4 | 黄金案例套件缺位 | 中 | P2 关闭公式所需黄金案例在 S1 范围未定义 | 第 3 项已裁决 N/A（2026-10-09）；创建属新增范围项，须产品负责人批准 |
| R5 | 一人多角色集中 | 中 | 角色 2–8 由用户本人兼任（PD-15），利益冲突风险 | G5 隔离声明 2026-10-08 签署生效，书面隔离措施已记录；G5 评测由角色 5 独立执行 |
| R6 | F1/F2 summary.json 时点性不匹配 | 低 | SHA256SUMS 各 1 项不匹配（清单先于 summary 定稿计算） | 独立审计登记为非篡改（git e03e6b9）；summary 内容交叉核验为真 |
| R7 | 时点状态文本滞后 | 低 | acceptance-mapping / XCC-MAP / F3 审阅包内部分状态文本为冻结 / staged 时点内容 | 以登记册现行状态与「冻结范围 vs 已执行案例」对照为准 |

## AI 评测 rubric 执行记录（第 6 项，2026-10-09 评测人判定）

rubric 定义：合成 fixtures 上的契约一致性评测（前置裁决，2026-10-09 产品负责人批准；责任人：评测人本人，角色 5，PD-15）。

| fixture | semanticAction → policyAction | 适用条款 | 评测人判定 | 评测者理由（评测人原话） |
|---|---|---|---|---|
| direct-answer（synthetic/direct-answer/v1） | DIRECT_ANSWER → ANSWER | acceptance-mapping GS-01（直答路径，不强迫进入探索体验）；C3 动作映射 | 一致 | 映射与内容均符合对应契约条款 |
| why（synthetic/why/v1） | WHY → EXPLAIN | acceptance-mapping GS-02（不得误作 STOP/CHANGE；不得声称无依据事实） | 一致 | 同上 |
| change-direction（synthetic/change-direction/v1） | CHANGE_DIRECTION → CHANGE_EXPERIENCE | acceptance-mapping GS-03；S1 §11（Cancel Generation → Reject Old Candidate → Create New Candidate → New Experience） | 一致 | 同上 |
| simulate（synthetic/simulate/v1） | WHAT_IF → SIMULATE | PD-06（基础 WHAT_IF→SIMULATE，不做完整多轮分支）；S1 §14；E8-G2-CC07（区分事实 / 推断 / 假设）；S1-ACT-WHAT_IF 边界（单次提案，不建立分支状态） | 一致 | 同上 |

**第 6 项结论：** 4 个 fixture 均一致（2026-10-09 评测人判定，理由如上）。

## 第 14 项裁决（2026-10-09 登记——已关闭）

评测人初选 A=建议通过 G5，但 14-A 前提（1–15 项结论全为 PASS 或经裁决的 N/A）因第 9 项 DEFERRED 不满足（DEFERRED 不计为通过——证据计划 §2 案例状态词汇）。**评测人复选（2026-10-09）：路径 1，B=建议有条件通过**——建议 G5 通过（有条件），遗留事项：① HTTP 形态 LLM 故障 503 后续切片补测（CR-18 选项 B，风险 R1）；② 延迟测量方法定义（第 9 项 DEFERRED，风险 R3）。路径 2（改 9 为 N/A → 14=A）未采用。

**判定公式提醒：** G5 只有在上述 16 项均有适用的、版本化的真实材料，并由独立评测者复核且产品负责人正式签署后，才可按 E8 原关闭公式判定。
