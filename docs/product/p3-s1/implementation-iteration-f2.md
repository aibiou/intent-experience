# P3-S1 实施迭代记录：迭代 2（F-2 GS-01…GS-06 完整动态执行 + C6 事件证据）

**编号：** P3-S1-IMPL-ITER-002
**版本：** 1.1.0（2026-10-09：§5 时点状态按单一状态源规范加履行注记（G5 16 项评测包已执行并双签署，G5 = PASSED（有条件）；CR-16/CR-17 已经 REVIEW-009 关闭——P3-S1-G5-WORKSHEET-01 v1.7.0；现行 Gate 状态见 P3-S1-READINESS-01 v1.9.0）；记录内容与 v1.0.0 相同）
**状态：** SECOND ITERATION EVIDENCE PRODUCED（时点状态，2026-10-08：G2–G4 仍 NOT PASSED；S1 未验收——现行 Gate 状态见 P3-S1-READINESS-01 v1.9.0）
**义务来源：** P3-S1-IMPL-AUTH-01 §2 授权范围；P2-EVIDENCE-8.1 §B 实施后动态证据段（GS-01…GS-06 完整动态执行 + S1 启用动作契约测试 + G4 工程边界 + C6 事件证据）
**记录日期：** 2026-10-08

## 1. 实施内容（S1 范围内）

| 项 | 记录 |
|---|---|
| 运行时核心 | `src/experience/runtime.ts`（S1-09 执行链，1663 行）：提交校验（请求幂等 → 会话 ACTIVE → 体验归属 → 未 COMPLETED → `expected_state_version` 正整数 → 分类 UNKNOWN 升级 INVALID_ACTION → 声明语义动作匹配 → 策略解析）→ 分支派发 → `policy_decided` 派发后发出（携带 state_before/state_after） |
| 会话与状态 | `session.ts`（IDLE→ACTIVE→ENDING→ENDED；ENDED 拒绝旧操作）；`state-store.ts`（每体验提交互斥锁、版本化写入、`expected_state_version` 冲突即拒绝）；`state-machine.ts`（§7/§14/§15 合法迁移 10 规则、WHAT_IF 阶段规则、复合步骤校验） |
| 语义分类 | `classifier.ts`（确定性分类：STOP > CHANGE > WHY > WHAT_IF > DIRECT_ANSWER；无 LLM 参与分类） |
| 提案校验 | `validator.ts` + `llm-gateway.ts`（LLM 仅可提 `state_update_proposal` 且恒为空；携带非空 / 伪造合法字段 / 结构外字段 / 嵌套变更一律拒绝；LLM 永不选择最终动作——GS-06 / H01 / H05） |
| C6 事件管线 | `events.ts`（§7 信封校验：event_id `^evt_[a-z0-9]+$`、ISO-8601 时间戳、identity/context/source/properties/sequence_number；§25 每体验序列号递增；§27 event_id 幂等去重）；`decision-trace.ts`（C6 §22 决策追踪，LLM / Policy / State 三层分离 §23） |
| 生成语料 | `chunks.ts` + `fixtures/{direct-answer,why,change-direction,simulate}.ts`（合成 fixtures；无真实 LLM 提供方、无真实用户数据） |
| 服务端装配 | `server-runtime.ts`（每 HTTP 请求新鲜运行时实例 + 内存汇） |
| HTTP 路由 | `POST /api/session/start`、`POST /api/intent/resolve`、`POST /api/experience/start`、`GET /api/experience/[experienceId]/state`、`POST /api/experience/[experienceId]/event`（NDJSON 流） |
| 策略映射 | `policy.ts` 扩展为 S1 §14 冻结全映射：DIRECT_ANSWER→ANSWER、WHY→EXPLAIN、WHAT_IF→SIMULATE、CHANGE_DIRECTION→CHANGE_EXPERIENCE、STOP→STOP；`POLICY_VERSION='policy_v1.0.0'`；冻结表外一律拒绝并升级（C3 语义空缺 G-1…G-7 不由编码者补写） |
| F-1 切片 | `http.ts` / `stream.ts` / `audit.ts` 本迭代零改动（F-1 行为不变作为回归基础，HTTP-12 / F1-REG-INPROC 验证） |
| 生成防护 | 世代纪元守卫（`activeGenerations` Map）：`completeGeneration` 先查纪元（陈旧 generation → STALE_GENERATION + `state_write_rejected` reason `superseded_generation`），再查版本——CC02 H03 双保险 |
| 环境锁定 | Node v24.21.0 精确锁定（F-2 义务，授权日 LTS 重查）；Next.js 16.4.0 / React 19.3.0 / TypeScript 7.0.2 |
| 范围边界 | PD-05/PD-06/PD-07 持续生效：无 Feed、无 Creation、无完整 Memory；CREATE/SEARCH 禁用；WHAT_IF 仅基础单次模拟（不建立持久/多轮分支） |

实施提交：`2a81d34`（运行时核心 + 路由 + 执行器，20 文件、+6334/−10）；`118bc04`（evidence 脚本 `npm run f2`）。F-1 文件（`http.ts`/`stream.ts`/`audit.ts`）在本迭代零改动（`git diff d13e54e..d957d39` 为空）。

## 2. 动态证据（F2-GS-0001，2026-10-08）

**结果：40/40 案例 PASS、24/24 断言 PASS、退出码 0**（运行耗时 14.6s；退出码 0 只表示本运行中的断言通过，不设置任何 Gate 为 PASS——见 §5）。

| 案例 | 覆盖维度 | 结果 |
|---|---|---|
| GS-01-POS | GS-01：DIRECT_ANSWER → ANSWER；内容逐字节等于合成语料 | PASS |
| GS-01-DET | GS-01：分类确定性 20/20（相同输入 → 相同动作）；探索进行中显式回答不被覆盖（CC04） | PASS |
| GS-02-POS | GS-02：WHY → EXPLAIN；内容逐字节等于合成语料；未误作 STOP/CHANGE | PASS |
| GS-03-POS | GS-03：生成中 CHANGE_DIRECTION → CHANGE_EXPERIENCE（旧 generation 取消、旧候选拒绝、新候选生成、新方向流完成、状态迁移合法 v3→v4→v5） | PASS |
| GS-03-H03 | GS-03 负向（CC02 H03）：旧 generation 迟到达提交被拒绝（STALE_GENERATION + `state_write_rejected` reason `superseded_generation`），新状态未被污染 | PASS |
| GS-03-DUP | GS-03：重复请求幂等拒绝（REQUEST_DUPLICATE） | PASS |
| GS-04-POS | GS-04：STOP → STOP 终止（单一 stopped 事件、零内容分块、体验 COMPLETED、会话 ENDED、四事件齐备：state_transitioned / experience_completed / experience_exited / session_ended） | PASS |
| GS-04-DUP | GS-04 负向：重复 STOP 拒绝（INVALID_STATE_TRANSITION，终态操作） | PASS |
| GS-04-NOCONT | GS-04 负向：STOP 后零续行（session_ended 后恰 1 事件即 STOP 自身 policy_decided；零 forbidden 续行事件；STOP 后输入被拒 INVALID_STATE_TRANSITION） | PASS |
| GS-04-MIDGEN | GS-04：生成中 STOP（P0：中断生成、终止事件、零内容分块、状态合法终态） | PASS |
| GS-05-STALE | GS-05：陈旧 `expected_state_version` → STATE_VERSION_CONFLICT（409，不覆盖；H04） | PASS |
| GS-05-CONC | GS-05：并发同版本双写恰好一胜一负（每体验提交互斥） | PASS |
| GS-05-REC | GS-05：冲突恢复（以刷新版本重试成功且最新状态不丢失） | PASS |
| GS-06-MUT | GS-06：LLM 提案携带非空 `state_update_proposal` → POLICY_REJECTED + `llm_output_rejected` + `state_write_rejected` reason `llm_state_mutation_forbidden`（H01/H05） | PASS |
| GS-06-FORGED | GS-06 负向：伪造合法字段（提案内嵌合法字段名）→ 拒绝 | PASS |
| GS-06-EXTRA | GS-06 负向：结构外字段 → 拒绝 | PASS |
| GS-06-NESTED | GS-06 负向：嵌套状态变更 → 拒绝 | PASS |
| GS-06-BYPASS | GS-06 负向：策略绕过尝试 → 拒绝（LLM 永不选择最终动作） | PASS |
| WHATIF-POS | S1-ACT-WHAT_IF：WHAT_IF → SIMULATE 单次模拟提案（内容区分事实/推断/假设；不创建新 Session/Experience；阶段规则合法） | PASS |
| WHATIF-STOP | WHAT_IF 模拟中 STOP（模拟不建立持久/多轮分支） | PASS |
| ILLEGAL-TRANS | 非法状态转换拒绝（INVALID_STATE_TRANSITION，retryable=true；S1-04/S1-01） | PASS |
| SESSION-ENDED | 终态会话操作拒绝（SESSION_ENDED） | PASS |
| C6-ENVELOPE | C6 §7/§25：全部事件通过信封校验（event_id 格式、ISO-8601 时间戳、identity/context/source/properties/sequence_number） | PASS |
| C6-ORDER | C6 §25：事件次序（每体验 sequence_number 递增；因果次序） | PASS |
| C6-MINSET | C6 §18/§21 + S1 §23：全部 15 项最低事件发出（C6 权威名 + 调和表，见 §3） | PASS |
| C6-IDEMPOTENT | C6 §27：event_id 幂等去重（相同 event_id 第二次记录被拒绝，不产生两条逻辑事实） | PASS |
| C6-TRACE-SEP | C6 §22/§23：决策追踪分离（LLM / Policy / State 三层分离） | PASS |
| F1-REG-INPROC | F-1 回归（进程内形态）：完整流 / 流中取消 / 策略 STOP / 表外动作拒绝与 F1-E2E-0001 一致 | PASS |
| HTTP-01 | HTTP 形态（真实 Next.js 生产服务器）：session/start → intent/resolve → experience/start 执行链 | PASS |
| HTTP-02 | HTTP：POST /intent/resolve（不直接修改 ExperienceState，API §10.1） | PASS |
| HTTP-03 | HTTP：POST /experience/start（不得由 Frontend 自己创建 ExperienceState，API §11.1） | PASS |
| HTTP-04 | HTTP：GET /experience/{id}/state——Query 不改变任何状态（两次 GET 前后事件日志字节长度不变证明） | PASS |
| HTTP-05 | HTTP：POST /experience/{id}/event 执行链（API §11.3） | PASS |
| HTTP-06 | HTTP 负向：陈旧版本 → 409 STATE_VERSION_CONFLICT（API §22 错误契约） | PASS |
| HTTP-07 | HTTP 负向：语义不匹配（客户端注入策略动作）→ 400 INVALID_REQUEST | PASS |
| HTTP-08 | HTTP 负向：不可分类输入 → 400（未知情况升级，授权 §5.7 / S1 §28 INVALID_ACTION） | PASS |
| HTTP-09 | HTTP 负向：GET /event → 405 METHOD_NOT_ALLOWED（Query 与 Command 分离，API §2.3） | PASS |
| HTTP-10 | HTTP：STOP 后会话 ENDED——ended 后旧操作拒绝（S1 §20 / GS-04 / S1-01） | PASS |
| HTTP-11 | HTTP 生成中 CHANGE：旧 HTTP 响应以 cancelled 终止（零后续分块），服务端登记 generation_cancelled + experience_interrupted（中断控制器经真实 HTTP，S1-10） | PASS |
| HTTP-12 | F-1 回归（HTTP 形态）：/api/experience/stream 流式端点行为与 F1-E2E-0001 一致 | PASS |

断言 A1–A24：A1 run-metadata 完整（E5 §3 版本矩阵全部字段）；A2 环境锁定（engines.node === "24.21.0" 且执行于 Node v24.21.0）；A3 全部 40 案例记录齐备且 12 字段完整（E5 §4）；A4 全部 40 案例轨迹文件齐备且非空；A5–A12 各组核心不变式（GS-01…GS-06、WHAT_IF、状态机边界）；A13 生成中常规输入拒绝 / 终态操作拒绝 / SESSION_ENDED；A14 信封校验全量；A15 最低事件集 + 幂等去重 + 轨迹分离；A16 无真实提供方调用（`src/experience/**` + `app/api/**` 静态扫描无 fetch/网络/LLM 提供方/凭据引用）；A17 F-1 回归；A18–A21 HTTP 形态端到端 / 负向 / 生成中 CHANGE / 服务端汇（事件日志 + 决策追踪日志 + 审计汇均为有效 NDJSON 且全部通过 C6 §7 信封校验）；A22 预检与完整性（typecheck:core + next build 退出码 0；参考归档 36 项哈希验证通过；契约指纹 C1–C7 全部匹配）；A23 证据-代码绑定（运行于干净工作树，HEAD 记录于版本矩阵；运行时文件哈希逐文件登记）；A24 证据清单 SHA256SUMS 产出且独立重算一致。

**材料位置：** `artifacts/evidence/runs/F2-GS-0001/`（cases/ 40 份 E5 §4 记录、traces/ 40 份 JSONL + http-events.jsonl + http-decision-traces.jsonl + http-audit.jsonl、run-metadata.json E5 §3 版本矩阵含 31 项运行时文件哈希、summary.json、SHA256SUMS、review/README.md 独立评测人审阅包）。

## 3. 动态证据发现的运行时缺陷与实施侧解释（如实登记）

**运行时缺陷：无。** F-2 动态证据（40 案例）未发现产品运行时缺陷——与 F-1（D-1/D-2）不同，本迭代全部案例与断言在第三次尝试中通过，前两次失败均为案例/执行器侧缺陷（见 §4）。

案例/执行器侧缺陷（非产品缺陷，登记以保持透明）：

| ID | 发现尝试 | 缺陷 | 处置 |
|---|---|---|---|
| E-1 | 尝试 1 | C6-IDEMPOTENT 案例构造的 event_id 含下划线（`evt_idempotency_000001`），违反 C6 §7 `^evt_[a-z0-9]+$`——案例自身构造了非法输入 | 案例修复为 `evt_idempotency0001`（`fa5313c`） |
| E-2 | 尝试 1 | GS-04-NOCONT 断言假设 `session_ended` 为最后事件；实现按 C6 §18 在分支派发完成后发出 `policy_decided`（决策事件携带已应用效果） | 断言改写为断言实现行为：policy_decided 为末事件、session_ended 后恰 1 事件（STOP 自身决策，selected_action=STOP、state_after.status=COMPLETED）、零续行事件、后续请求被拒（`fa5313c`） |
| E-3 | 尝试 2 | C6-IDEMPOTENT 修复过度：移除全部下划线致缺少必需 `evt_` 前缀（`evtidempotency0001`） | 修正为 `evt_idempotency0001`（保留前缀、去内部下划线；重跑前经 Node 模式测试验证）（`e9edad4`） |

实施侧解释（编码时作出的契约解释，**待非作者复核**，不得由编码者自行确认——CR-16 / CR-17）：

1. **事件名称调和表（S1 §23 最低事件 → C6 权威名）：** intent_created → intent_received；semantic_action_detected → intent_parsed（properties.semantic_action）；user_action → C6 §14 交互事件（question_asked / why_requested / what_if_requested / change_direction_requested / stop_requested）；version_conflict → state_version_conflict（C6 §21）；其余 10 项同名。调和表 staged 于 `F2-GS-0001/review/README.md`。
2. **policy_decided 发射时机：** 在分支派发完成后发出，state_after 携带已应用效果（C6 §18）；决策链本身在决策追踪中权威记录（C6 §22/§23 分离）；被拒绝的决策 state_after 为 null。
3. **HTTP 状态码映射：** 属工程映射（错误契约定义错误码而非 HTTP 状态码）：409 STATE_VERSION_CONFLICT / REQUEST_DUPLICATE、503 LLM_UNAVAILABLE、500 INTERNAL_ERROR、400/405 其余。

## 4. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

| 尝试 | 时间 (UTC) | 结果 | 留存 |
|---|---|---|---|
| 1 | 15:17:58–15:19:59 | 38/40 案例 PASS；GS-04-NOCONT 与 C6-IDEMPOTENT FAIL；断言 A3/A9/A15 失败；退出码 1 | `artifacts/evidence/runs/F2-GS-0001-attempt-2026-10-08T15-19-59-851Z/`（缺陷 E-1/E-2） |
| 2 | 15:19:57–15:21:16 | 39/40 案例 PASS；C6-IDEMPOTENT FAIL；断言 A3/A15 失败；退出码 1 | `artifacts/evidence/runs/F2-GS-0001-attempt-2026-10-08T15-21-16-354Z/`（缺陷 E-3） |
| 3 | 15:21:14–15:21:29 | **40/40 案例 PASS、24/24 断言 PASS、退出码 0** | `artifacts/evidence/runs/F2-GS-0001/` |

证据-代码绑定（A23）：运行前工作树干净——运行时核心（`2a81d34`）、执行器脚本（`118bc04`）、案例修复（`fa5313c`、`e9edad4`）均在运行前提交；每次运行产物在运行后提交（`c69d4f1`、`98f9a8f`、`d957d39`），运行绑定至 git 提交 `d957d39`（记录于 run-metadata.json）。

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 退出码 0 与 24/24 断言通过只表示本运行中的断言通过；不设置 G2 / G3 / G4 或任何 Gate 为 PASS（E5 §2 状态词汇规则）。
- GS-01…GS-06 动态证据本运行已执行；C6 事件契约证据本运行已执行；G2 动态跨契约一致性案例与 G4 工程边界证据的完整专项仍属后续迭代（NOT RUN）。
- G5 16 项评测包 NOT RUN；独立评测人（用户本人，角色 5，PD-15）须先审阅 F-1 与 F-2 staged 材料（`F1-E2E-0001/review/README.md`、`F2-GS-0001/review/README.md`）后方可执行评测（**时点义务，已履行 2026-10-09：F-1 与 F-2 staged 材料经审阅包审阅通过，G5 16 项评测包已执行并双签署，G5 = PASSED（有条件）——P3-S1-G5-WORKSHEET-01 v1.7.0**）。
- 事件名称调和表与 policy_decided 发射时机解释待非作者复核（CR-16 / CR-17）；未确认前不作为契约结论（**时点状态，已关闭 2026-10-09：经非作者复核签署关闭，P3-S1-REVIEW-009，ACCEPT——作为契约结论生效**）。
- S1 未验收；P2 仍 CLOSURE CANDIDATE / BLOCKED。
- 独立评测人对本运行材料保留审阅与否决权；评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。

## 6. 后续义务

- 下一迭代：G2 动态跨契约一致性案例 + G4 工程边界证据；G5 16 项评测包执行前，独立评测人须先审阅 F-1 与 F-2 迭代材料。
- 非作者复核：事件名称调和表（CR-16）与 policy_decided 发射时机解释（CR-17）按 R2/R3 流程确认。
- 隐私六要素批准前不得收集或保存任何真实用户数据（本运行仅合成数据；隐私六要素待产品/安全负责人批准——阻塞真实用户数据收集，不阻塞合成数据证据流）。

## 7. 签署

| 角色 | 记录 | 日期 |
|---|---|---|
| 工程负责人（执行） | 工程负责人角色（代理）已实施运行时核心并执行 F2-GS-0001 | 2026-10-08 |
| 独立评测负责人 | PENDING（用户本人，角色 5，PD-15；审阅权与否决权生效中） | PENDING |
