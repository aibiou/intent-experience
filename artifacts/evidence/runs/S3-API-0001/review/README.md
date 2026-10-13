# S3-API-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S3-API-0001（S3b 暴露层——既有端点 semanticAction 枚举扩展，纯暴露层：同一 ExperienceRuntime 单例，不改变任何运行时语义）
日期：2026-10-10T04:58:37.004Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：8/8 全部 PASS
- 断言：13/13 通过
- 退出码：0（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 8 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S3b 暴露层 → 案例 / 断言映射；staticBoundary：静态边界发现）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S3B-SEMANTIC-FREEZE-01 v1.0.0 §3 变更 4 + S3A-SEMANTIC-FREEZE-01 v1.0.0）

- 执行形态 WHAT_IF 全链路（STREAM-EXECUTION）：三要素请求 → 真实运行路径 → NDJSON 流（submission 首行 policy_v2.2.0 + chunk ×17 逐字节等于 simulate 语料 + done + state_updated）；模拟域首轮分支自动 CREATE
- 执行形态 A 类显式长期记忆写入（STREAM-LONGTERM-A）：memory_operation NDJSON 两行；记录 long_term / explicit / confidence=1.0；事件属性扩展 recognition_path=explicit_preference
- 执行形态裸记住请求负向（STREAM-LONGTERM-BARE-NEG）：400 INVALID_ACTION——G08-NEG 不变式经暴露层保持
- S1 fixture 形态向后兼容（STREAM-S1-FORM）：既有形态行为不变（WHY → EXPLAIN，语料逐字节）
- 跨会话分支操作（CROSS-SESSION-ADOPT）：执行形态既有体验提交（experience_id + state_version）→ 200 NDJSON 流；分支 adopted=true；currentBranchId 保持 null（会话级不变式）；simulation_adopted ×1
- 跨会话内容轮负向（CROSS-SESSION-CONTENT-NEG）：400 INVALID_REQUEST experience/session mismatch——放宽仅限分支操作路径
- 版本冲突（VERSION-CONFLICT）：STATE_VERSION_CONFLICT retryable=false——不消耗版本；当前版本重试成功
- 只读观测（OBSERVABILITY）：GET /api/memory 与 GET /api/experience/{id}/simulation 底层快照——字段齐备；连续查询零事件登记

## 形态说明（进程内形态——http.ts 头部纪律）

本运行直接调用 handleExperienceStreamRequest（Route Handler 的薄封装目标函数——app/api/experience/stream/route.ts 仅做转发），经 StreamRequestInput.runtime 注入案例独立运行时。HTTP 形态（Next.js 运行时经 Route Handler 调用）执行路径与决策追踪完全一致——形态差异仅在调用入口。实机 HTTP 形态端到端演示于 2026-10-10 经开发服务器执行并由产品负责人目检（会话 A WHAT_IF → STOP → 会话 B 跨会话 ADOPT_BRANCH → 长期记忆 A/B 类写入 → 观测路由快照——全部通过）。

## 未执行（NOT RUN）

- G5 评测包（独立评测）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s3-api   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S3-API-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
