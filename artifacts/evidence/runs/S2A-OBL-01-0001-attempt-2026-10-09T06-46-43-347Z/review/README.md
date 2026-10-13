# S2A-OBL-01-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S2A-OBL-01-0001（S2a F-1 迭代：OBL-01——环境门控 LlmGateway 注入缝 + HTTP 形态 LLM 故障 503 补测）
日期：2026-10-09T06:46:01.360Z
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：7/7 全部 （见 summary.json）
- 断言：10/12 通过
- 退出码：1（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 7 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹 + 四个服务器实例的独立事件汇（s1/s2/s3/s4-events.jsonl / -decision-traces.jsonl / -audit.jsonl）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：OBL-01 → 案例 / 断言 / 关闭债务 D-01 的映射；seamSpecification：注入缝规范）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖

- HTTP 形态 LLM 故障 503 补测（OBL-01 主目标，CR-18 选项 B 登记的 DEFERRED 项本迭代履行；四服务器姿态：S1 unavailable / S2 fail_once / S4 succeed_once / S3 无缝惰性）：
  - HTTP-503：503 / LLM_UNAVAILABLE / retryable=true 结构化错误体
  - CALL-ONCE：网关恰好一次调用（llm_request_started=1，无 llm_request_completed——无自动重试）
  - VERSION-INTACT：失败写入不消耗版本号（v2 → v2，WAITING 保留）
  - STOP-AFTER-FAILURE：成功后故障形态——WHY 成功后再次 WHY 失败（保持 WAITING v4），STOP 合法终止（stopped 事件、零内容分块、COMPLETED v5、STOP 窗口零网关调用）
  - RECOVERY-BOUNDED：fail_once 形态有界恢复（首次 503 → 用户重试 200，内容逐字节等于语料，WAITING v4）
- 注入缝安全性：
  - SEAM-INERT：缝未设置时 HTTP 形态行为与 S1 完全一致 + 静态字节断言（门控以环境变量为唯一开关；缝实现无网络出口字节）
  - INPROC-REGRESSION：进程内形态（默认合成网关）完整链路回归（信封全量、sequence 单调、内容逐字节等于语料）

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务（G04 全 Creation / G07 全 Correction / WHAT_IF 全分支 / Minimal Memory）——属 S2a 后续迭代（PD-23 选项 B 两切片裁决）
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 债务关闭

- D-01（HTTP 形态 LLM 故障 503 动态证据缺口）：本运行履行完毕，关闭登记于迭代记录 implementation-iteration-s2a-f1.md

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s2a-f1   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S2A-OBL-01-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
