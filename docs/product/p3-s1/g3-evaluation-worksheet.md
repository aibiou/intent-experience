# G3 独立评测工作表（供独立评测人逐项执行填写）

**编号：** P2-G3-WORKSHEET-01
**版本：** 1.0.0（2026-10-09：G3 逐项裁决完成——八黄金案例 × 四维度共 32 案例全部 PASS；**G3 判定：PASS**；签署区双行签署已登记（独立评测负责人（角色 5）+ 产品负责人）；Gate 状态同步见 readiness-record P3-S1-READINESS-01 v1.15.0（G1–G8 全部 PASSED；P2 = CLOSED））
**状态：** EVALUATED（评测已完成并签署）
**评测人：** 用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效——兼任实现相关角色，书面隔离措施已记录于 G5 隔离声明）
**前置义务：** 评测人须先审阅 staged 审阅包 `artifacts/evidence/runs/G3-GOLDEN-0001/review/README.md` 后方可执行评测。**（已履行：角色 5 审阅通过，2026-10-09，无否决登记。）**

## 执行规则

1. 每项结论取值：`PASS` / `FAIL` / `DEFERRED` / `N/A`（非适用，须附理由）；默认 `NOT RUN`，不得由输入材料存在推断 `PASS`。
2. 任何 P0 失败、缺项或 `NOT RUN` 均不得被平均分或建议性报告抵消（P2 Exit Gate Rule 02 / evidence-execution-plan §6.1）。
3. G04/G07/G08 以 PD-21 关闭切片最小形态执行（PD-21，2026-10-09 批准）；完整语义 DEFERRED TO S2（acceptance-mapping §B，PD-05/PD-06/PD-07）——DEFERRED 不计为通过；本表裁决对象为关闭切片最小形态是否足以接受为 P2 关闭条件。
4. 退出码 0 与汇总通过只表示本运行断言通过（E5 §2）；G3 判定由本工作表逐项裁决 + 双行签署作出。

## G3 逐项裁决表（8 黄金案例 × 4 维度）

| 黄金案例 | 四维度覆盖（本运行） | 本运行状态 | 评测人裁决 | 理由 | 证据引用 |
|---|---|---|---|---|---|
| G01 Direct Answer | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | 直答路径 DIRECT_ANSWER→ANSWER 成立：正常输入不强迫进入探索体验；负向输入不误作 WHY/STOP/CHANGE；边界与失败恢复符合 C1/C3 契约预期 | cases/G3-GOLDEN-0001_G01-*.json + traces/G3-GOLDEN-0001:G01-*.jsonl |
| G02 Why | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | WHY→EXPLAIN 成立：解释请求不误作 STOP/CHANGE；不声称无依据事实 | cases/G3-GOLDEN-0001_G02-*.json + traces/G3-GOLDEN-0001:G02-*.jsonl |
| G03 What If（S1 基础单次模拟形态） | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | WHAT_IF→SIMULATE 单次模拟形态成立：区分事实 / 推断 / 假设；不建立持久 / 多轮分支状态；完整多轮 / 持久分支属 S2（acceptance-mapping §B） | cases/G3-GOLDEN-0001_G03-*.json + traces/G3-GOLDEN-0001:G03-*.jsonl |
| G04 Creation（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | 关闭切片最小形态成立：CREATE 语义动作→CREATE Policy Action；状态机 WAITING/UNDERSTANDING v4→ACTIVE/CREATION v5→WAITING/CREATION v6；生成中 CREATE 中断在途生成（generation_cancelled: superseded_by_create）；完整 Creation 语义属 S2（acceptance-mapping §B，PD-05/PD-06） | cases/G3-GOLDEN-0001_G04-*.json + traces/G3-GOLDEN-0001:G04-*.jsonl |
| G05 Change | N/NEG/B/FR（含 in-flight/stale 必测维度） | 4/4 PASS | PASS（2026-10-09） | CHANGE 全链路成立：生成中 CHANGE 中断在途生成（superseded_by_change）；迟到达旧 generation 拒绝 STALE_GENERATION；旧候选不污染新状态；in-flight/stale 必测维度已覆盖（G05-N/G05-NEG） | cases/G3-GOLDEN-0001_G05-*.json + traces/G3-GOLDEN-0001:G05-*.jsonl |
| G06 Stop | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | STOP 优先成立：STOP 终止当前体验、终止事件齐备且零续行；生成中客户端中止合法（G06-FR）；P0 用户自主权零违规 | cases/G3-GOLDEN-0001_G06-*.json + traces/G3-GOLDEN-0001:G06-*.jsonl |
| G07 Correction（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | 关闭切片最小形态成立：CORRECTION 语义动作→EXPLAIN（重评估为内部过程，阶段保持）；生成中 CORRECTION 中断在途生成（generation_cancelled: correction）；完整 Correction 语义属 S2（acceptance-mapping §B，PD-05） | cases/G3-GOLDEN-0001_G07-*.json + traces/G3-GOLDEN-0001:G07-*.jsonl |
| G08 Memory Boundary（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | PASS（2026-10-09） | 当前会话边界证明成立：全部运行 memory 事件 = 0，零持久化跨会话记忆；当前意图优先；完整持久 Memory 语义属 S2（acceptance-mapping §B，PD-07） | cases/G3-GOLDEN-0001_G08-*.json + traces/G3-GOLDEN-0001:G08-*.jsonl |

## 断言核对（A1–A10）

| 断言 | 内容 | 结果 |
|---|---|---|
| A1 | run-metadata 完整（E5 §3 版本矩阵全部字段，含黄金语料定义与回归基线绑定） | PASS |
| A2 | 环境锁定：engines.node === "24.21.0"（F-2 精确锁定）且执行于 Node v24.21.0；lockfileVersion 3 | PASS |
| A3 | 全部 32 案例记录齐备且 12 字段完整（E5 §4；32 执行；PD-19 延期义务已履行——G04/G07/G08 关闭切片执行，无 DEFERRED 登记） | PASS |
| A4 | 全部 32 执行案例轨迹齐备且非空（trace_started + 案例事实 + trace_completed） | PASS |
| A5 | 黄金维度覆盖：G01–G08 各具备 NORMAL/NEGATIVE/BOUNDARY/FAILURE_RECOVERY 四维度（P2 Exit Gate §8；G04/G07/G08 为 PD-21 关闭切片最小实现） | PASS |
| A6 | G04/G05/G06/G07 in-flight generation / stale response 必测维度已覆盖且通过（G04-NEG 生成中 CREATE、G05-N 生成中 CHANGE、G05-NEG 旧 generation 迟到达拒绝、G06-FR 生成中客户端中止、G07-NEG 生成中 CORRECTION） | PASS |
| A7 | 跨迭代回归基线绑定：F2-GS-0001 / F3-EB-0001 基线运行存在；本运行期望逐项冻结自该基线 | PASS |
| A8 | PD-19 延期义务履行：G04/G07/G08 最小实现（PD-21 关闭切片）四维度黄金证据齐备且无 DEFERRED 登记（完整语义仍 DEFERRED TO S2，acceptance-mapping §B） | PASS |
| A9 | 全部 32 执行案例 PASS（本运行断言；不设置 G3 为 PASS——G3 判定属独立评测） | PASS |
| A10 | 证据清单 SHA256SUMS 已产出且独立重算全部一致 | PASS（清单生成时点通过；见下"证据完整性核对"注记） |

## 证据完整性核对

- cases/ —— 32 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希；32 份执行（无 DEFERRED 登记）
- traces/ —— 32 份 JSONL 轨迹（每案例 trace_started → 案例事实 → trace_completed）
- run-metadata.json —— E5 §3 版本矩阵（黄金语料定义、回归基线绑定 F2-GS-0001/F3-EB-0001、契约指纹、代码字节绑定；运行绑定 git 提交 b480757，工作树干净）
- SHA256SUMS —— 独立重算 65/66 精确匹配；summary.json 1 项时点性不匹配：执行器先于最终 summary 定稿计算清单、其后重写 summary.json（追加 A10 断言条目）——执行器侧写入顺序缺陷 G3-E-3（修复见提交 9054c53，保障未来运行自洽）；已提交证据保持冻结不改写；summary 内容经交叉核验为真（与 32 案例记录 / 轨迹一致）；同 F1/F2 风险 R6 模式，三个 G3 运行目录（本次 + 两次归档尝试）呈同一单文件模式，非篡改

## 判定公式核对（P2 Exit Gate §15）

| Gate | 状态 | 判定日期 | 依据 |
|---|---|---|---|
| G1 契约权威冻结 | PASSED | 2026-10-08 | C1–C7 Steward 确认 + R1 非作者复核（REVIEW-006） |
| G2 跨契约一致性 | PASSED | 2026-10-09 | 经 G5 独立评测（第 2/4/5 项 PASS） |
| G3 黄金验收 | **PASSED** | 2026-10-09 | 本工作表（八案例裁决全 PASS；32/32 执行 PASS；A1–A10 全通过） |
| G4 工程边界 | PASSED | 2026-10-09 | 经 G5 独立评测（第 8 项 PASS；HTTP 503 子项按 CR-18 选项 B 登记 DEFERRED） |
| G5 独立评测 | PASSED（有条件） | 2026-10-09 | P3-S1-G5-WORKSHEET-01 v1.7.0（12 PASS + 1 N/A + 1 DEFERRED + 建议 B，双行签署） |
| G6 产品债务 | PASSED | 2026-10-08 | PB-01…PB-04 全部闭环 |
| G7 P3 范围冻结 | PASSED | 2026-10-08 | PD-05…PD-08 批准；R3 非作者复核（REVIEW-007） |
| G8 正式签署 | PASSED | 2026-10-09 | P2-SIGNOFF-01 v1.0.0（六类责任人签署，Decision 一致 APPROVE WITH DOCUMENTED DEBT） |

阻断项核对：P0 违规 = 0；用户自主权（Agency）阻断 = 0；状态完整性（State Integrity）阻断 = 0；策略合规（Policy Compliance）阻断 = 0（既有证据与本次运行零违规登记）。

→ 满足 §15 关闭公式：**P2 = CLOSED**（与 P2-SIGNOFF-01 v1.0.0 关闭声明一致）。

## 遗留项（DEFERRED TO S2，不计为通过）

1. 完整 G04 Creation 语义（多轮分支、持久创作状态）——DEFERRED TO S2（PD-05/PD-06）
2. 完整 G07 Correction 语义——DEFERRED TO S2（PD-05）
3. 完整 G08 持久 Memory 语义——DEFERRED TO S2（PD-07）
4. OBL-01 HTTP 形态 LLM 故障 503 补测——首个 S2 迭代（CR-18 选项 B；风险 R1）
5. OBL-02 延迟测量方法 v1.0.0 已批准；无统计阈值、无指标宣称（PB-03/PD-08；风险 R3）
6. G3 黄金套件跨迭代回归义务延续入 S2（每迭代回归基准）

## 签署区（评测完成后填写）

| 角色 | 签署 | 结论（G3 判定） | 遗留问题 | 日期 |
|---|---|---|---|---|
| 独立评测负责人（角色 5） | 已签署（2026-10-09；独立性声明：角色 5 独立执行，与实现作者身份冲突已按 G5 隔离声明 2026-10-08 书面记录隔离措施；对全部原始轨迹与预期保留审阅与否决权） | G3 判定：PASS | 完整 G04/G07/G08 语义 DEFERRED TO S2（PD-05/PD-06/PD-07）；OBL-01 首个 S2 迭代补测；OBL-02 无指标宣称；黄金套件跨迭代回归延续 | 2026-10-09 |
| 产品负责人（正式签署） | 已签署（2026-10-09；接受 G3 判定 PASS，含 DEFERRED 遗留项；未改变任何已执行案例的预期） | G3 判定：PASS——接受 | 同上 | 2026-10-09 |

**判定公式提醒：** G3 只有在上述逐项裁决均有适用的、版本化的真实材料，并由独立评测者复核且产品负责人正式签署后，才可按 §15 关闭公式判定。本工作表与 G3-GOLDEN-0001 证据包（含审阅包裁决表）交叉一致。
