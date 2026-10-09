# OBL02-LATENCY-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：OBL02-LATENCY-0001（OBL-02 延迟测量执行；方法 OBL-02-LATENCY-METHOD-01 v1.0.0，产品负责人 2026-10-09 按 E3 批准）
日期：2026-10-09T10:39:29.537Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）
git HEAD：d87285fd0f47dc56f94696b6d12cf06ae3525261（工作树含未提交变更：M tools/evidence/package.json, ?? tools/evidence/src/obl02.mjs）

## 结果

- 分层：16（2 执行形态 × 7 请求类别正常路径 + 2 故障恢复分层）
- 样本：480 提交（每分层 30；方法 §5 样本纪律满足，可计算参考统计量）
- 案例：15/16 PASS
- 断言：11/12 通过（A1–A12）
- 退出码：1（只表示本运行中的断言通过；不设置 G5 或任何产品 Gate 状态为 PASS）

## 分层汇总（参考统计量——不构成指标宣称，方法 §6）

| 分层 | 形态 | 类别 | 路径 | 样本数 | 墙钟均值 ms | 墙钟 p95 ms |
|---|---|---|---|---|---|---|
| inproc_direct_answer | in_process | direct_answer | normal | 30 | 329.24 | 330.93 |
| inproc_why | in_process | why | normal | 30 | 370.33 | 371.3 |
| inproc_what_if_simulate | in_process | what_if_simulate | normal | 30 | 575.7 | 577.21 |
| inproc_change_direction | in_process | change_direction | normal | 30 | 370.15 | 371.58 |
| inproc_stop | in_process | stop | normal | 30 | 0.04 | 0.08 |
| inproc_create | in_process | create | normal | 30 | 374.99 | 379.3 |
| inproc_correction | in_process | correction | normal | 30 | 377.09 | 379.76 |
| http_direct_answer | http | direct_answer | normal | 30 | 336.77 | 339.38 |
| http_why | http | why | normal | 30 | 378.7 | 381.48 |
| http_what_if_simulate | http | what_if_simulate | normal | 30 | 588.98 | 592.76 |
| http_change_direction | http | change_direction | normal | 30 | 378.45 | 380.83 |
| http_stop | http | stop | normal | 30 | 0 | 0 |
| http_create | http | create | normal | 30 | 378.53 | 381.27 |
| http_correction | http | correction | normal | 30 | 379 | 381.59 |
| inproc_fault_recovery | in_process | direct_answer | fault_recovery | 30 | n/a | n/a |
| http_fault_recovery | http | direct_answer | fault_recovery | 30 | n/a | n/a |

## G5 第 9 项（延迟结果）裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）

| 事项 | 本运行状态 | 评测人裁决 | 理由 |
|---|---|---|---|
| 测量方法定义并经批准 | OBL-02-LATENCY-METHOD-01 v1.0.0 APPROVED（2026-10-09） | 待裁决 | |
| 测量执行（本运行） | 480 提交 / 16 分层；原始值 + 参考统计量已登记 | 待裁决 | |
| 统计阈值 | 未设（PB-03 / PD-08：无真实基线不编造阈值） | 待裁决 | |
| 指标宣称 | 无（仅参考值；方法 §6 指标宣称条件未触发） | 待裁决 | |
| 样本纪律（方法 §5） | 每分层 30 提交（≥30）；窗口 Run ID / git HEAD / 起止已登记 | 待裁决 | |

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
