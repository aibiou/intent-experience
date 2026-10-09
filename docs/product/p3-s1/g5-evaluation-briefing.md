# G5 独立评测证据要点简报（代理整理，供角色 5 评测人加速定位）

**编号：** P3-S1-G5-BRIEFING-01
**版本：** 1.0.0（2026-10-09：简报已建立——16 项 staged 输入定位 + 已核实运行事实）
**状态：** STAGED INPUT AID——本简报是定位辅助，**不是证据、不是评测结论**；G5 16 项评测结论均 NOT RUN，不得由简报存在推断 G5 PASS
**整理者：** 工程负责人角色（代理）；**评测人：** 用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）
**使用顺序：** ① 先读三份 staged 审阅包（`artifacts/evidence/runs/<run>/review/README.md`，评测人保留审阅与否决权）→ ② 对照本简报逐项定位 → ③ 在工作表（P3-S1-G5-WORKSHEET-01）逐项填写结论（PASS / FAIL / DEFERRED / N/A 附理由）与证据引用

## 运行事实总览（独立核实，2026-10-09 重算）

| 运行 | 义务 | 案例 | 断言 | 退出码 | 耗时 | 代码绑定 gitHead | 工作树 | typecheck / build | SHA256SUMS 独立重算 |
|---|---|---|---|---|---|---|---|---|---|
| E5-TRIAL-0001 | E5-SCOPED-LICENSE-01（PD-17 选项 A）首次试运行 | 4/4 PASS | 6/6（A1/A2a/A2b/A3/A4/A6；A7/A8 未持久化，经独立审计登记） | 0 | 未记录 | 6934d21 | — | — | 11/11 精确 |
| F1-E2E-0001 | F-1：流式 + AbortSignal 取消端到端（进程内 + HTTP 双形态） | 9/9 PASS | 12/12 | 0 | 4.6s | 6b3aca7 | clean=false（如实登记 12 项未提交条目——实施期运行） | 0 / 0 | 20/21（summary.json 时点性不匹配 1 项） |
| F2-GS-0001 | F-2：GS-01…GS-06 完整 + C6 事件契约 + S1-ACT-WHAT_IF + F-1 回归 | 40/40 PASS | 24/24 | 0 | 14.6s | 98f9a8f | clean | 0 / 0 | 84/85（summary.json 时点性不匹配 1 项） |
| F3-EB-0001 | F-3：G2 动态跨契约一致性 + G4 工程边界 EB-01…EB-16 | 21/21 PASS | 28/28 | 0 | 9.0s | 4b5f1d6 | clean | 0 / 0 | 46/46 精确 |

- 环境（一致）：Node v24.21.0（engines 锁定）、Next.js 16.4.0 / React 19.3.0 / TypeScript 7.0.2 / lockfileVersion 3、darwin arm64；证据执行器为纯 Node ESM 零依赖。
- 运行时文件逐文件哈希登记：F1 15 项、F2 32 项、F3 32 项（run-metadata.json `code.runtimeFiles`）。
- F1/F2 的 summary.json 时点性不匹配（各 1 项）：清单先于 summary.json 定稿计算——经独立审计登记为系统性执行器时序行为、非证据篡改（git e03e6b9）；summary 内容（案例/断言计数、退出码）经交叉核验全部为真。
- 独立重跑：`cd tools/evidence && npm run f1|f2|f3`（Node v24.21.0）。运行目录按 RUN_ID 固定——重跑前须归档旧材料，不得覆盖既有证据。

## 三份 staged 审阅包要点（评审核前必读）

- **F1-E2E-0001/review/README.md**：结果 9/9 + 12/12；审阅清单（cases/ 9 份 E5 §4 记录、traces/ + http-audit.jsonl、run-metadata.json、SHA256SUMS）；证据绑定说明（traceSha256 除末行 `trace_completed` 信封外全部覆盖）；否决权声明。
- **F2-GS-0001/review/README.md**：结果 40/40 + 24/24；覆盖与未覆盖清单（未覆盖：G5 16 项评测包、P2 G01–G08 未覆盖案例 DEFERRED TO S2、真实 LLM 提供方、真实用户数据）；**名称调和表**（S1 §23 → C6 权威名，5 组映射——CR-16 实施侧解释，staged 时点文本）；证据绑定说明；否决权声明。
- **F3-EB-0001/review/README.md**：结果 21/21 + 28/28；覆盖清单（G2 5 案例 + EB-01…EB-15 案例 + EB-16 由版本矩阵覆盖）与未覆盖清单（**HTTP 形态 LLM 故障 503 NOT RUN**——staged 时点文本；CR-18 已于 2026-10-09 经产品负责人裁决选项 B 登记 DEFERRED TO 后续切片，该审阅包为哈希锁定证据保留时点文本）；待复核项（CR-16/CR-17——staged 时点为 PENDING，现已经 REVIEW-009 非作者复核签署关闭，2026-10-09）；证据绑定说明（46/46 精确）；否决权声明。

## 16 项证据要点（与工作表逐项对应）

| # | G5 必需项 | staged 输入位置 | 关键事实（已核实） |
|---|---|---|---|
| 1 | Version Matrix | 三运行 `run-metadata.json`；契约基线 `docs/product/baseline/contract-authority-baseline-v1.md` | E5 §3 矩阵字段齐备（productDecisions / contracts / s1Specifications / stateMachine / policy / api / event / evaluation / code / prompt / model / corpus / environment；F3 另含 engineeringBoundaries / packages / f1RegressionBaseline / priorIterations / executorSha256）；C1 core_schema_v1.0.0 registeredHash 与 computedHash 一致（E5-TRIAL 记录可核对）；产品包 intent-experience-runtime 0.1.0、engines.node=24.21.0；执行器自身哈希登记（F3 executorSha256=0af9266a…） |
| 2 | Test Scope | `../p3-s1/acceptance-mapping.md`（范围冻结 PD-05…PD-08）；XCC-MAP v1.4.0（A2 非作者复核 REVIEW-004）；F2/F3 审阅包"覆盖与未覆盖"节；F3 run-metadata engineeringBoundaries.s2ScopeItems | F2：GS-01…GS-06 含全部登记负向、S1-ACT-WHAT_IF、S1 §23/C6 最低事件集、C6 §7/§22/§23/§25/§27 契约校验、HTTP 端到端与负向、F-1 回归；F3：G2 5 案例 + EB-01…EB-16；S2 范围项 EB-10/EB-11 仅 S1 缺席证明（记忆生命周期、工具授权链属 S2）；P2 G01–G08 未覆盖案例 DEFERRED TO S2 或后续阶段 |
| 3 | Golden Case Result | —（无黄金案例执行产物） | 缺位——工作表前置裁决：登记 N/A 附理由，或先创建黄金案例后执行（评测人 / 产品负责人裁决） |
| 4 | Contract Test Result | F3 `cases/` G2-CHAIN-01/02、G2-FAULT-01/02、G2-VERSION-01 + `traces/`（24 份 JSONL、133 事件，经独立审计核验有效非空） | G2 动态跨契约一致性：WHY/CHANGE 完整链路（含复合步骤 [CHANGE_DIRECTION, EXPERIENCE_STARTED, USER_ACTION] v3→v4）、generation 归属与迟到达旧 generation 拒绝、UNKNOWN 升级与语义不匹配故障链、版本链 +1 不变式 |
| 5 | Scenario Matrix Result | F2 `cases/` 40 份 + F2 审阅包覆盖清单 | GS-01…GS-06 场景矩阵 40 案例（含全部登记负向）+ S1-ACT-WHAT_IF；GXC01…GXC08 逐案映射确认属评测人执行项 |
| 6 | AI Evaluation Result | 合成 fixtures（`src/experience/fixtures/`：direct-answer / why / change-direction / simulate）；B25 静态扫描记录 | S1 无真实 LLM 提供方接入（`src/experience/**` + `app/api/**` 25 文件静态扫描 0 违规）；rubric 与责任人前置裁决待裁定（建议：合成 fixtures 上的契约一致性评测，责任人用户本人） |
| 7 | Regression Result | F2 `cases/` F1-REG-INPROC / HTTP-12；F1-E2E-0001 基线（9/9）；F3 run-metadata.f1RegressionBaseline | F-1 回归双形态已执行；F-1 流式端点行为冻结——`http.ts`/`stream.ts`/`audit.ts` 于 F-2/F-3 迭代零改动（git diff d13e54e..bf21196 对三文件为空）；正式回归基线重跑与 Change ID 关联属评测人执行项 |
| 8 | Fault Injection Result | F3 `cases/` EB-02 / EB-05 / EB-06 / EB-06-NO-RETRY-STOP / EB-07；F3 run-metadata engineeringBoundaries.notRunOverHttp.EB12_503 | 进程内形态经 `LlmGateway` 接口注入失败网关已执行（失败不消耗版本号、过期结果拒绝、恰好一次调用、retryable=true、有界恢复、失败后 STOP 合法）；**HTTP 形态 503 NOT RUN——CR-18 选项 B（2026-10-09 产品负责人裁决）登记 DEFERRED TO 后续切片**；评测人须裁定：是否接受进程内形态 + 静态映射为充分输入 |
| 9 | Latency Result | 三运行 summary.json durationMs | F1 4.6s / F2 14.6s / F3 9.0s——**参考值，非指标**；统计阈值前置裁决待裁定（PB-03：无真实基线不编造统计阈值；未批准前不得宣告指标达标或发布 PASS） |
| 10 | Agency Result | F3 `cases/` EB-04（I1–I4 组合可中断性）/ EB-06s（失败后 STOP）/ EB-13（完成边界用户主权）；F2 GS-04 系列 | 用户主权案例动态证据齐备（生成中常规输入拒绝、CHANGE 取消旧 generation、STOP 终止四事件齐备且零续行、"好了"确定性分类 STOP、LLM 提案 is_complete 拒绝）；P0 违规零容忍——逐案评测属评测人 |
| 11 | Known Failures | 失败尝试归档 6 目录（F1 3 次、F2 2 次、F3 2 次，ADR-0002 §5）；缺陷登记 D-1/D-2（运行时，F-1）、E-1…E-3 与 F3-E-1…F3-E-9（案例/执行器侧，已修复）；P3-S1-IMPL-ITER-003 §3 独立审计发现 | 三迭代失败尝试如实归档留存；动态证据未发现运行时缺陷（F-2/F-3）；独立审计三项执行器时序行为（traceSha256 除末行信封、summary.json 时点性、E5-TRIAL A7/A8 未持久化）均如实登记、非篡改 |
| 12 | Product Debt | `docs/product/baseline/decision-register.md` v0.14.0；G6 处置表（PB-01…PB-04 RESOLVED） | CR-01…CR-18 全部已关闭（含 CR-08 于 2026-10-09 关闭：隐私六要素全部裁决签署）；按运行版本封存登记册快照属评测人执行项；当前未决事项：G5 自身、G8、P2 收束 |
| 13 | Risk Assessment | —（无 staged 输入） | 评测人按已知失败、缺失证据（HTTP 503 DEFERRED、黄金案例缺位、GXC 映射待确认、隐私要素 3/4 细节按建议稿登记待更正）及严重度记录风险与残余风险 |
| 14 | Release Recommendation | —（无 staged 输入） | 评测人基于完整证据给出建议；产品负责人另行决定；不得由 AI 或实现团队自动发布 |
| 15 | Evidence Index | `artifacts/evidence/manifest/`（MANIFEST.json + INDEX.md + repro-logs/，2026-10-08T16:35:08 独立重算生成）；`artifacts/evidence/runs/` 只追加布局 | 四运行 + 六失败尝试归档；INDEX.md 载各运行案例/断言计数、SHA256SUMS 独立重算状态、产物提交哈希（E5-TRIAL a3506a1 等）；索引内容的 G5 评测属评测人 |
| 16 | Evaluator Sign-off | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期 |

## 不变式提醒（与工作表执行规则一致）

- 退出码 0 / 案例 PASS 只表示本运行中的断言通过，不设置任何 Gate 为 PASS。
- 任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消。
- 评测人不得由本运行执行者担任（角色分离）；评测人对全部原始轨迹与预期保留审阅与否决权，否决须登记于独立复核记录。
