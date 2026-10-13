# P3-S2a 实施迭代记录：迭代 F-1（OBL-01 环境门控 LlmGateway 注入缝 + HTTP 形态 503 补测）

**编号：** P3-S2A-IMPL-ITER-F1
**版本：** 1.0.0（2026-10-09：S2a 首个迭代 F-1 完成登记——动态证据 S2A-OBL-01-0001 通过（7/7 案例、12/12 断言、退出码 0）；P2-SIGNOFF-01 遗留债务 D-01 关闭）
**状态：** S2A FIRST ITERATION EVIDENCE PRODUCED（时点状态，2026-10-09：S2a 后续义务（G04 完整 Creation / G07 完整 Correction / WHAT_IF 完整分支 / Minimal Memory）NOT STARTED；S1 未验收——现行 Gate 状态见 P3-S1-READINESS-01 v1.18.0）
**义务来源：** P3-S2-IMPL-AUTH-01 v1.1.0 §2/§6（OBL-01：环境门控 `LlmGateway` 注入缝 + HTTP 形态 LLM 故障 503 补测）；CR-18 选项 B 登记的 DEFERRED 项履行；P2-SIGNOFF-01 遗留债务 D-01
**记录日期：** 2026-10-09

## 1. 实施内容（授权范围内）

| 项 | 记录 |
|---|---|
| 产品源码变更 | 两个文件：`src/experience/llm-gateway.ts`（新增 `EvidenceFaultLlmGateway implements LlmGateway`——证据故障注入网关，三种故障形态：`unavailable`（默认，每次调用均失败）/ `fail_once`（首次失败、后续委托合成网关）/ `succeed_once`（首次委托合成网关、后续均失败））；`src/experience/server-runtime.ts`（新增 `resolveServerGateway()`——环境门控注入缝，仅 `EXPERIENCE_LLM_GATEWAY_SEAM === '1'` 时构造注入网关并注入运行时选项，未设置时运行时保持默认合成网关）。`runtime.ts` 零改动——错误映射链（网关异常 → 运行时统一捕获 → `LLM_UNAVAILABLE` → HTTP 503，retryable=true）为既有路径，本迭代仅经注入缝使其在 HTTP 形态可触发 |
| 注入缝形态 | CR-18 选项 A 形态：仅证据 / 测试环境启用，默认合成模式不变（SEAM-INERT 不变式：缝未设置时 HTTP 形态行为与 S1 完全一致）。缝实现无网络出口字节（静态断言：无 `fetch(` / `node:http` / `https://` 构造） |
| 证据执行器 | `tools/evidence/src/s2a-f1.mjs`（自包含；RUN_ID `S2A-OBL-01-0001`，Node v24.21.0 精确锁定）：7 案例 + 12 断言（A1–A11 + A11-PREFLIGHT）+ E5 §3 版本矩阵（含 obligationTraceability：OBL-01 → 案例 / 断言 / 关闭债务 D-01 映射；seamSpecification：注入缝规范与故障形态定义） |
| 服务器姿态 | 四个真实 Next.js 生产服务器实例（独立端口 / 独立事件汇 / 独立注入缝姿态）：S1（端口 4331：seam=1 + unavailable）/ S2（端口 4332：seam=1 + fail_once）/ S4（端口 4334：seam=1 + succeed_once）/ S3（端口 4333：seam 未设置——默认合成模式） |
| 案例形态 | HTTP 形态（真实 `next start` 服务器、真实 HTTP 请求与 NDJSON 流、服务端 C6 事件日志偏移切片）+ 进程内形态（`module.registerHooks` 加载已提交 `.ts` 源字节）+ 静态形态（产品源码字节断言） |
| 环境锁定 | Node v24.21.0（引擎门禁 + engines 绑定 + lockfileVersion 3）；Next.js 16.4.0 / React 19.3.0 / TypeScript 7.0.2 |

实施提交：`ed2d468`（`feat(s2a-f1)`：注入缝 + 执行器 + `npm run s2a-f1` 脚本；迭代内经三次执行器侧缺陷修复修订——见 §3，产品源码自首次提交起未再变更）；证据提交 `7a03b40`（运行产物 + 3 次失败尝试归档，ADR-0002 §5）。

## 2. 动态证据（S2A-OBL-01-0001，2026-10-09）

**结果：7/7 案例 PASS、12/12 断言 PASS、退出码 0**（尝试 4，运行耗时 9.0s；退出码 0 只表示本运行中的断言通过，不设置任何 Gate 为 PASS——见 §5）。

| 案例 | 覆盖维度 | 结果 |
|---|---|---|
| HTTP-503 | HTTP 形态 LLM 上游不可用故障：WHY 提交 → HTTP 503 + `code=LLM_UNAVAILABLE` + `retryable=true`（结构化错误体 `{code, message, retryable}`，S1 §28 错误词表 / API 契约错误映射） | PASS |
| CALL-ONCE | 故障路径网关调用计数（经服务端 C6 事件日志切片）：`llm_request_started` 恰好 1 次、`llm_request_completed` 零次、`generation_started` 1 次——运行时无自动重试（EB-06） | PASS |
| VERSION-INTACT | 失败写入不消耗版本号：失败前后体验状态逐字段一致（`state_version` v2→v2；status / stage / waiting_for_user 均不变——失败不产生状态写入） | PASS |
| STOP-AFTER-FAILURE | 成功后故障形态（succeed_once）下"失败后 STOP 合法"：首次 WHY 成功（200 全链路、内容逐字节等于合成语料、WAITING v4）→ 再次 WHY 失败（503，状态保持 WAITING v4，失败窗口 `llm_request_started`=1 / `llm_request_completed`=0）→ 用户 STOP 以当前状态版本（v4）合法终止（200，流事件 `[submission, stopped]`、零内容分块；终止事实经事件日志权威登记：`state_transitioned` STOP v5 + `experience_completed`（completion_condition=user_stop）+ `session_ended`，终态 COMPLETED v5）；STOP 窗口零网关调用（本体验网关调用恒为 2） | PASS |
| RECOVERY-BOUNDED | fail_once 形态有界恢复：首次 WHY → 503（失败前后状态逐字段不变）→ 用户重试（新 request_id、同状态版本）→ 200 全链路（内容分块 + done + state_updated v4，内容逐字节等于 WHY 合成语料）；网关调用 2 次、`llm_request_completed` 恰好 1 次（仅重试成功那次）；终态 WAITING v4 | PASS |
| SEAM-INERT | 注入缝惰性不变式：缝未设置时 HTTP 形态 WHY → 200 全链路（内容逐字节等于语料、终态 WAITING v4；网关调用 1 次，`llm_request_started`=`llm_request_completed`=1，经事件日志验证）+ 静态字节断言（server-runtime.ts 含环境门控 `EXPERIENCE_LLM_GATEWAY_SEAM !== '1'` 与 `resolveServerGateway`；两文件均无网络出口字节） | PASS |
| INPROC-REGRESSION | 进程内形态（默认合成网关，未注入网关）完整链路回归：policy_decided(EXPLAIN) + generation_started + llm_request_started + llm_request_completed + 内容分块 + done + state_updated；内容逐字节等于语料；终态 WAITING v4；C6 §7 信封全量通过、sequence_number 严格单调 | PASS |

断言 A1–A11 + A11-PREFLIGHT：A1 run-metadata 完整（E5 §3 版本矩阵全部字段 + OBL-01 可追溯性专项）；A2 环境锁定（engines.node === "24.21.0" 且执行于 Node v24.21.0、lockfileVersion 3）；A3 全部 7 案例记录齐备且 12 字段完整（E5 §4）；A4 全部 7 案例轨迹文件齐备且非空；A5–A10 逐案例不变式（HTTP-503 语义 / 恰好一次调用 / 版本完整 / 失败后 STOP / 有界恢复 / 缝惰性）；A11 证据清单 SHA256SUMS 产出且独立重算全部一致（26 项，G3-E-3 双遍：最终摘要写入后重新生成清单）；A11-PREFLIGHT 预检与完整性（typecheck:core + next build 退出码 0；参考归档 36 项哈希验证通过；契约指纹 C1–C7 全部匹配——失败为 FATAL，不计入断言池）。

**材料位置：** `artifacts/evidence/runs/S2A-OBL-01-0001/`（cases/ 7 份 E5 §4 记录、traces/ 7 份案例 JSONL + 四服务器独立事件汇（`s1/s2/s3/s4-events.jsonl` / `-decision-traces.jsonl` / `-audit.jsonl`）、run-metadata.json E5 §3 版本矩阵（含 33 项运行时与执行器文件逐文件哈希）、summary.json、SHA256SUMS（26 项）、review/README.md 独立评测人审阅包）。

## 3. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

| 尝试 | 时间（UTC） | 结果 | 缺陷根因与处置 |
|---|---|---|---|
| 1 | 2026-10-09T06:22 | 1/7 案例 PASS（仅 HTTP-503 通过——注入缝与 503 映射本身首次即正确） | 执行器侧缺陷（产品源码无缺陷）：(a) C6 信封字段名误用——HTTP 事件日志与进程内事件均为 C6 信封（`event_type` 字段），误按 HTTP 流事件字段 `type` 过滤，致网关调用计数归零（CALL-ONCE / INPROC-REGRESSION 失败）；(b) 状态语义误设——体验启动后为 READY/UNDERSTANDING（waiting_for_user=false），WHY 完成后方进入 WAITING；"失败后 STOP 合法"的准确语义为"至少一次成功 WHY 之后（WAITING 状态）的失败"，从 READY 直接 STOP 为非法状态转换（状态机 §7：STOP 仅 ACTIVE/WAITING 合法——STOP-AFTER-FAILURE 首次尝试由 READY 提交 STOP 被运行时正确拒绝）；(c) 事实源误设——`llm_request_started`/`llm_request_completed` 为服务端 C6 事件日志事实，不在 HTTP 响应流中（RECOVERY-BOUNDED / SEAM-INERT 失败）。处置：C6 字段名校准；失败前后状态逐字段对比替代硬编码状态断言；网关计数改经事件日志偏移切片验证；新增 `succeed_once` 故障形态与 S4 服务器以正确建立"成功后故障"场景 |
| 2 | 2026-10-09T06:44 | 6/7 案例 PASS（STOP-AFTER-FAILURE 失败） | 执行器侧缺陷：STOP 提交使用初始状态版本 v2 而非当前版本 v4——运行时正确拒绝并返回 409 STATE_VERSION_CONFLICT（决策追踪如实登记 `state_version_conflict: expected 2, current 4`——拒绝路径本身即版本守卫的动态验证）。处置：STOP 以当前状态版本提交 |
| 3 | 2026-10-09T06:45 | 6/7 案例 PASS（STOP-AFTER-FAILURE 失败） | 执行器侧断言缺陷：错误要求 STOP 响应流携带 `state_updated`——实际 STOP 流为 `[submission, stopped]`（STOP 的版本化提交在流包装器外完成）；终止事实经事件日志权威登记（`state_transitioned` STOP v5 + `experience_completed` + `session_ended`），与 F3-EB-0001 EB-04/EB-06-NO-RETRY-STOP 观察一致。处置：断言改为事件日志事实验证 |
| 4 | 2026-10-09T06:46 | 7/7 案例 PASS、12/12 断言 PASS、退出码 0 | —— |

三次失败尝试归档留存（`S2A-OBL-01-0001-attempt-2026-10-09T06-44-38-524Z/`、`S2A-OBL-01-0001-attempt-2026-10-09T06-45-57-265Z/`、`S2A-OBL-01-0001-attempt-2026-10-09T06-46-43-347Z/`，随证据提交 `7a03b40` 入库），按 ADR-0002 §5 绝不覆盖、绝不删除。

## 4. 语义校准记录（实施侧发现，经既有证据交叉验证）

1. C6 信封字段名：HTTP 事件日志与进程内事件共享 C6 信封（`event_type`）；HTTP 响应流事件（submission / chunk / done / stopped / state_updated）使用 `type` 字段——两套命名空间经 F3-EB-0001 执行器交叉验证（其 `eventsOf` 用 `event_type`、`contentOf` 用 `type`）。
2. 体验状态语义：启动后 READY/UNDERSTANDING（waiting_for_user=false）；WHY 完成进入 WAITING（waiting_for_user=true）。"失败后 STOP 合法"（授权 §2 措辞）的准确语义：失败发生在 WAITING 状态（即至少一次成功 WHY 之后）；STOP 从 WAITING 合法、从 READY 非法。进程内形态先例（F3-EB-0001 EB-06-NO-RETRY-STOP）即此语义——HTTP 形态经 `succeed_once` 姿态复现并对齐。
3. 网关调用计数事实源：`llm_request_started` / `llm_request_completed` 经服务端 C6 事件汇持久化（HTTP 形态），不在 NDJSON 响应流中——调用计数经事件日志偏移切片验证（与 F3-EB-0001 EB-14 追加只写观察一致）。
4. STOP 流事件形态：`[submission, stopped]`（无 `state_updated`——STOP 的版本化提交在流包装器外完成）；终止事实经事件日志权威登记（`state_transitioned` / `experience_completed` / `session_ended`）。

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 退出码 0 与本运行全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G5/G8）或产品状态为 PASS（E5 §2）。
- 本迭代履行 OBL-01（CR-18 选项 B 登记的 DEFERRED 项 + P2-SIGNOFF-01 遗留债务 D-01）；D-01 关闭登记于 decision-register v0.24.0 与 P2-SIGNOFF-01 v1.1.0（债务表 D-01 行）。
- G5 独立评测对本运行材料保留审阅与否决权（`review/README.md` 为 staged 审阅包）。
- S2a 后续义务（G04 完整 Creation / G07 完整 Correction / WHAT_IF 完整分支 / Minimal Memory）与 S2b 均 NOT STARTED；本运行不构成对 S2 任何范围项的结论。

## 6. 后续义务

- S2a 后续迭代：G04 完整 Creation 语义、G07 完整 Correction 语义、WHAT_IF 完整分支、Minimal Memory（仅短期记忆形态，6 个月自动删除，无长期画像——PD-23 裁决）。
- S2b：DEEPEN / SIMPLIFY / REFRAME / Search 等新动作语义（须在 S2b 授权前版本化冻结，PD-23）；S2b 须另行裁决与授权。
- OBL-02（延迟测量）：方法 v1.0.0 已经产品负责人按 E3 批准（`obl-02-latency-measurement-method-v1.md`）；测量执行属后续义务，任何延迟指标宣称前须满足方法第 5 节样本纪律并注明分层。

## 7. 签署

- 执行：工程负责人角色（代理，Codex），2026-10-09。
- 独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）——审阅中（staged 审阅包：`artifacts/evidence/runs/S2A-OBL-01-0001/review/README.md`）。
- 本记录由执行方起草；独立评测人保留审阅与否决权。
