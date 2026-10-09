# OBL02-LATENCY-0001 — 独立评测人审阅包（第 9 项裁决已登记：5/5 PASS，2026-10-09）

运行：OBL02-LATENCY-0001（OBL-02 延迟测量执行；方法 OBL-02-LATENCY-METHOD-01 v1.0.0，产品负责人 2026-10-09 按 E3 批准）
日期：2026-10-09T10:45:26.624Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）
git HEAD：d87285fd0f47dc56f94696b6d12cf06ae3525261（工作树含未提交变更：M tools/evidence/package.json, ?? artifacts/evidence/runs/OBL02-LATENCY-0001/, ?? tools/evidence/src/obl02.mjs）

## 结果

- 分层：16（2 执行形态 × 7 请求类别正常路径 + 2 故障恢复分层）
- 样本：480 提交（每分层 30；方法 §5 样本纪律满足，可计算参考统计量）
- 案例：16/16 PASS
- 断言：12/12 通过（A1–A12）
- 退出码：0（只表示本运行中的断言通过；不设置 G5 或任何产品 Gate 状态为 PASS）

## 分层汇总（参考统计量——不构成指标宣称，方法 §6）

| 分层 | 形态 | 类别 | 路径 | 样本数 | 墙钟均值 ms | 墙钟 p95 ms |
|---|---|---|---|---|---|---|
| inproc_direct_answer | in_process | direct_answer | normal | 30 | 335.9 | 338.54 |
| inproc_why | in_process | why | normal | 30 | 377.51 | 380.2 |
| inproc_what_if_simulate | in_process | what_if_simulate | normal | 30 | 587.49 | 589.83 |
| inproc_change_direction | in_process | change_direction | normal | 30 | 377.05 | 379.11 |
| inproc_stop | in_process | stop | normal | 30 | 0.03 | 0.04 |
| inproc_create | in_process | create | normal | 30 | 377.57 | 379.91 |
| inproc_correction | in_process | correction | normal | 30 | 376.76 | 379.36 |
| http_direct_answer | http | direct_answer | normal | 30 | 336.69 | 339.05 |
| http_why | http | why | normal | 30 | 379.04 | 381.98 |
| http_what_if_simulate | http | what_if_simulate | normal | 30 | 588.39 | 591.71 |
| http_change_direction | http | change_direction | normal | 30 | 372.37 | 379.48 |
| http_stop | http | stop | normal | 30 | 0 | 0 |
| http_create | http | create | normal | 30 | 370.62 | 373.32 |
| http_correction | http | correction | normal | 30 | 370.62 | 372.93 |
| inproc_fault_recovery | in_process | direct_answer | fault_recovery | 30 | n/a | n/a |
| http_fault_recovery | http | direct_answer | fault_recovery | 30 | n/a | n/a |

## G5 第 9 项（延迟结果）裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）

| 事项 | 本运行状态 | 评测人裁决 | 理由 |
|---|---|---|---|
| 测量方法定义并经批准 | OBL-02-LATENCY-METHOD-01 v1.0.0 APPROVED（2026-10-09） | PASS（2026-10-09 裁决） | 方法经产品负责人按 E3 批准为 v1.0.0（2026-10-09）；批准范围含分层与样本窗口纪律（方法 §2–§5），不含统计阈值（PB-03 / PD-08） |
| 测量执行（本运行） | 480 提交 / 16 分层；原始值 + 参考统计量已登记 | PASS（2026-10-09 裁决） | 运行履行方法 §1–§6：16 分层（2 执行形态 × 7 请求类别正常路径 + 2 故障恢复分层）× 30 提交 = 480 提交，连续窗口 257425ms；原始值与参考统计量按形态 / 类别 / 路径分层登记（summary.json + traces/ 16 份 JSONL）；案例 16/16 PASS、断言 12/12 通过、退出码 0（只表示本运行断言通过）；SHA256SUMS 65 文件独立重算全部一致 |
| 统计阈值 | 未设（PB-03 / PD-08：无真实基线不编造阈值） | PASS（2026-10-09 裁决） | 依 PB-03 / PD-08 不设统计阈值（无真实用户基线）；本项不构成缺陷——方法 §6 披露声明已明示；任何指标宣称前须另行满足 E3 统计 Gate |
| 指标宣称 | 无（仅参考值；方法 §6 指标宣称条件未触发） | PASS（2026-10-09 裁决） | 本运行仅登记参考统计量（方法 §5 样本纪律满足），不构成任何延迟指标宣称（方法 §6）；披露声明随证据包登记 |
| 样本纪律（方法 §5） | 每分层 30 提交（≥30）；窗口 Run ID / git HEAD / 起止已登记 | PASS（2026-10-09 裁决） | 每分层 30 提交（≥30，方法 §5 满足）；运行窗口 Run ID / git HEAD / 起止时间登记于 run-metadata.json（连续窗口 257425ms）；参考统计量可计算 |

## 审阅清单（不得只看汇总）

1. cases/ —— 16 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据
2. traces/ —— 16 份 JSONL 轨迹（每分层 trace_started → 30 条 latency_sample → trace_completed；每样本含 recordedAt ISO-8601 与逐项测量值）
3. logs/ —— HTTP 形态服务端事件汇（正常路径 http-normal-events.jsonl；故障恢复 fault-http-<n>-events.jsonl 每样本独立）
4. run-metadata.json —— 方法 §2–§6 分层登记（环境 / 模型 N/A / 类别 / 路径 / 样本纪律 / 观测点 / 披露）
5. summary.json —— 参考统计量（均值 / p50 / p95 / min / max）+ 断言 A1–A12
6. SHA256SUMS —— 证据包清单（可独立重算验证）

## 披露声明（方法 §6）

内部参考值 / 参考统计量（方法 §5 样本纪律满足：每分层 ≥30 提交）——不构成任何延迟指标宣称（方法 §6）；无统计阈值（PB-03 / PD-08：无真实用户基线不编造阈值）；任何指标宣称须同时满足方法批准 + 样本纪律 + 形态/环境/类别分层注明；公开发布须另行满足 E3 统计 Gate（人群、观察窗口、分子/分母、数据源、阈值、批准人）。

## 词汇表纪律（E5 §2）

退出码 0 与本汇总全部通过只表示本运行中的断言通过；不设置 G5 或任何产品 Gate 状态为 PASS（E5 §2）。G5 第 9 项（延迟结果）是否关闭由独立评测人（角色 5）经逐项裁决作出。

## 第 9 项裁决登记（2026-10-09）

独立评测负责人（角色 5，用户本人，PD-15）经逐项裁决：上表 5 项全部 **PASS**（2026-10-09 签署）。依据：测量方法 OBL-02-LATENCY-METHOD-01 v1.0.0 已经产品负责人按 E3 批准；本运行（OBL02-LATENCY-0001）履行方法 §1–§6——16 分层 / 480 提交 / 每分层 30 满足方法 §5 样本纪律；无统计阈值（PB-03 / PD-08）；仅参考统计量、不构成任何延迟指标宣称（方法 §6）。

结论：G5 工作表第 9 项（延迟结果）**DEFERRED → PASS**。G5 两项遗留条件全部解除（① HTTP 形态 LLM 故障 503 补测经 OBL-01 / S2A-OBL-01-0001 履行，2026-10-09；② 延迟测量经本运行 + 本裁决关闭）——**G5 = PASSED（无条件）**。登记回写：P3-S1-G5-WORKSHEET-01 v1.8.0 / P3-S1-READINESS-01 v1.26.0 / 决策登记册 CR-22。

评测人对全部原始轨迹与预期保留审阅与否决权；退出码 0 与本运行全部通过只表示本运行中的断言通过（E5 §2），不设置任何 Gate——Gate 状态变更仅经本裁决登记与工作表签署生效。
