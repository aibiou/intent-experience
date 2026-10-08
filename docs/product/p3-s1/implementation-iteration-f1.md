# P3-S1 实施迭代记录：迭代 1（F-1 流式传输 + 取消传播）

**编号：** P3-S1-IMPL-ITER-001
**版本：** 1.0.0（2026-10-08：首个迭代完成——F-1 运行时切片已实施，F1-E2E-0001 端到端动态证据通过（9/9 案例、12/12 断言、退出码 0））
**状态：** FIRST ITERATION EVIDENCE PRODUCED（G2–G4 仍 NOT PASSED；S1 未验收）
**义务来源：** P3-S1-IMPL-AUTH-01 v1.0.0 §3 F-1（Next.js Route Handler 流式 + AbortSignal 取消端到端动态证据）
**记录日期：** 2026-10-08

## 1. 实施内容（S1 范围内）

| 项 | 记录 |
|---|---|
| 路由 | `POST /api/experience/stream`（Next.js 16.4.0 App Router Route Handler，`app/api/experience/stream/route.ts`） |
| 执行形态 | 进程内 + HTTP 双形态，同一处理函数（`src/experience/http.ts` 框架无关核心 + Route Handler 薄封装） |
| 策略解析 | 仅 S1 冻结映射：DIRECT_ANSWER→ANSWER（C3 §8 单目标）、WHY→EXPLAIN（S1 §26 GS-02 冻结点）、STOP→STOP（C3 §7）；冻结表外一律 400 `ACTION_OUT_OF_S1_SCOPE` 并升级——C3 语义空缺 G-1…G-7 不由编码者补写 |
| 取消传播 | AbortSignal（HTTP 形态为 `request.signal`）在每个分块之前与分块间等待中检查；取消后零后续分块；终止事件（stopped / cancelled）同时写入服务端审计汇（`EXPERIENCE_AUDIT_LOG`，追加只写）并 yield 给流 |
| 方法约束 | 仅 POST；GET 显式 405 `METHOD_NOT_ALLOWED`（结构化错误体）；其余未导出方法由框架返回 405 |
| 语料 | 合成 fixtures（`synthetic/why/v1`、`synthetic/direct-answer/v1`）；无真实 LLM 提供方、无真实用户数据（A11 静态扫描 + 内容逐字节比对双重证明） |
| 环境锁定 | Node v24.21.0 精确锁定（`package.json` engines.node，F-2）；package-lock.json lockfileVersion 3；Next.js 16.4.0 / React 19.3.0 / TypeScript 7.0.2 |
| 范围边界 | PD-05/PD-06/PD-07 持续生效：无 Feed、无 Creation、无完整 Memory；CREATE/SEARCH 禁用；WHAT_IF 仅基础单次模拟（本切片未实施） |

## 2. 动态证据（F1-E2E-0001，2026-10-08）

**结果：9/9 案例 PASS、12/12 断言 PASS、退出码 0。**（退出码 0 只表示本运行中的断言通过，不设置任何 Gate 为 PASS——见 §5）

| 案例 | 形态 | 覆盖维度 | 结果 |
|---|---|---|---|
| F1-STREAM-01-INPROC | 进程内 | 正常流式（WHY→EXPLAIN 全分块按序、内容等于语料、done 结束） | PASS |
| F1-STREAM-02-HTTP | HTTP | 正常流式 + 服务端审计汇与客户端事件一致性 | PASS |
| F1-ABORT-01-INPROC | 进程内 | 流中取消：收 2 分块后 abort，零后续分块，cancelled 登记于下标 2 | PASS |
| F1-ABORT-02-HTTP | HTTP | 客户端断开：服务端 request.signal 触发、审计登记、断开后服务器存活 | PASS |
| F1-ABORT-03-PRECHUNK | 进程内 | 取消先于第一个分块：零内容分块，cancelled 登记于下标 0 | PASS |
| F1-STOP-01-INPROC | 进程内 | 策略 STOP（S1 硬边界）：单一 stopped 事件、零内容分块 | PASS |
| F1-NEG-01-OUTOFSCOPE-HTTP | HTTP | 越权动作 CREATE → 400，不产出流 | PASS |
| F1-NEG-02-BADJSON-HTTP | HTTP | 非法请求体 → 400 INVALID_JSON_BODY | PASS |
| F1-NEG-03-METHOD-HTTP | HTTP | GET → 405 METHOD_NOT_ALLOWED | PASS |

断言 A1–A12：run-metadata 完整性（E5 §3）、环境锁定（F-2）、案例记录 §4 全字段、轨迹齐备、流式顺序与内容（双形态）、进程内取消、HTTP 取消 + 存活、预分块取消、STOP 策略、负向拒绝三例、无真实提供方调用（静态扫描）、SHA256SUMS 产出且独立重算一致。

**材料位置：** `artifacts/evidence/runs/F1-E2E-0001/`（cases/ 9 份 §4 记录、traces/ 9 份 JSONL + http-audit.jsonl 服务端审计汇、logs/、review/README.md 独立评测人审阅包、run-metadata.json E5 §3 版本矩阵、summary.json、SHA256SUMS）。

## 3. 动态证据发现的运行时缺陷（如实登记）

| ID | 严重度 | 发现案例 | 缺陷 | 处置 |
|---|---|---|---|---|
| D-1 | Important | F1-STOP-01-INPROC（尝试 1） | 策略 STOP 被要求加载内容语料 → 500 `NO_FIXTURE_FOR_ACTION`；STOP 无内容分块，不应要求语料 | `http.ts`：STOP 跳过语料加载（空 chunks，stream 核心在产出任何分块前即终止）。修复后 F1-STOP-01 PASS |
| D-2 | Important | F1-STOP-01-INPROC / 取消路径（尝试 2–3） | 终止事件（stopped/cancelled）仅 `emit` 到审计汇，从未 `yield` 给流——客户端（进程内消费者、断开前的 HTTP 客户端）看不到终止原因 | `stream.ts`：终止事件 emit + yield。修复后相关案例 PASS |

执行器侧缺陷（非产品缺陷，登记以保持透明）：进程内审计汇类型误用（数组 vs  sink 函数）；HTTP 审计切片偏移单位错误（字节偏移 vs 字符索引，中文多字节内容致切片自 JSON 行中部开始）；GET 请求携带 body；engines.node 比较未去除 `v` 前缀；SHA256SUMS 清单自引用（旧清单文件被哈希进新清单）；运行目录跨尝试复用致状态残留（现改为执行器启动时归档旧目录，不覆盖）。

## 4. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

| 尝试 | 时间 (UTC) | 结果 | 留存 |
|---|---|---|---|
| 1 | 14:18 | 6/9 案例 FAIL（暴露 D-1 与执行器缺陷 H1/H2/H3/H4/H5） | `artifacts/evidence/runs/F1-E2E-0001-attempt-1-failed/` |
| 2 | 14:22 | 预检 typecheck FATAL（TS2339 窄化错误）；无运行目录 | 失败记录于本节；修复后重跑 |
| 3 | 14:24 | 8/9 案例 FAIL（旧运行目录残留污染 STREAM-02 审计切片；SHA256SUMS 自引用致 A12 失败） | `artifacts/evidence/runs/F1-E2E-0001-failed-2026-10-08T14-25-36-102Z/` |
| 4 | 14:25 | **9/9 案例 PASS、12/12 断言 PASS、退出码 0** | `artifacts/evidence/runs/F1-E2E-0001/` |

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 退出码 0 与 12/12 断言通过只表示本运行中的断言通过；不设置 G2 / G3 / G4 或任何 Gate 为 PASS（E5 §2 状态词汇规则）。
- 本迭代仅覆盖流式传输与取消传播路径；GS-01–GS-06 的完整动态执行（状态机转换、并发写、stale `expected_state_version`、非法转换、伪造 state_update、轨迹缺失/重复/乱序等）属后续迭代，当前 NOT RUN。
- C6 事件与分析契约的动态证据属后续迭代。
- S1 未验收；P2 仍 CLOSURE CANDIDATE / BLOCKED；G5 16 项评测包 NOT RUN。
- 独立评测人（用户本人，角色 5，PD-15）对本运行材料保留审阅与否决权（材料 staged 于 `review/README.md`）；评测人不得由本运行执行者担任。

## 6. 后续义务

- 下一迭代：GS-01–GS-06 完整动态执行 + C6 事件证据；G5 16 项评测包执行前，独立评测人须先审阅本迭代材料。
- F-2 已履行（授权日 Node v24.21.0 Active LTS 重查 + 精确锁定；记录于 P3-S1-IMPL-AUTH-01 §4）。

## 7. 签署

| 角色 | 记录 | 日期 |
|---|---|---|
| 工程负责人（执行） | 工程负责人角色（代理）已实施并执行 F1-E2E-0001 | 2026-10-08 |
| 独立评测负责人 | PENDING（用户本人，角色 5，PD-15；审阅权与否决权生效中） | PENDING |
