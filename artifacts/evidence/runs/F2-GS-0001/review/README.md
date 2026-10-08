# F2-GS-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：F2-GS-0001（F-2 迭代：GS-01…GS-06 完整动态执行 + C6 事件契约证据 + S1 启用动作契约测试 + F-1 回归）
日期：2026-10-08T15:21:29.119Z
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：40/40 全部 PASS
- 断言：24/24 通过
- 退出码：0（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 40 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹 + http-events.jsonl（HTTP 形态服务端 C6 事件流）+ http-decision-traces.jsonl（决策追踪）+ http-audit.jsonl（F-1 形态审计汇）
3. run-metadata.json —— E5 §3 版本矩阵（契约 / 代码 / 语料 / 环境 / F-1 回归基线）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 本运行覆盖与未覆盖

已执行（本运行）：GS-01…GS-06 完整案例（含全部登记负向）、S1-ACT-WHAT_IF 契约测试、S1 §23/C6 最低事件集、C6 §7/§25/§27/§22/§23 契约校验、F-1 回归（进程内 + HTTP）、HTTP 形态端到端与负向。
未执行（NOT RUN）：G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（DEFERRED TO S2 或后续阶段）；真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）。

## 名称调和表（S1 §23 → C6 权威名，pending 非作者复核）

| S1 §23 最低事件 | C6 权威实现 | 依据 |
|---|---|---|
| intent_created | intent_received | C6 §12 意图事件 |
| semantic_action_detected | intent_parsed（properties.semantic_action） | C6 §12 + §8 输入层来源规则 |
| user_action | question_asked / why_requested / what_if_requested / change_direction_requested / stop_requested | C6 §14 交互事件 |
| version_conflict | state_version_conflict | C6 §21 状态事件 |
| 其余 10 项 | 同名 | C6 §10/§13/§15/§18/§21 |

## 独立重跑

    cd tools/evidence && npm run f2   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/F2-GS-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
