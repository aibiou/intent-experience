# P3-S1 实施迭代记录：迭代 3（F-3 G2 动态跨契约一致性 + G4 工程边界证据）

**编号：** P3-S1-IMPL-ITER-003
**版本：** 1.0.0（2026-10-08：第三迭代完成——F3-EB-0001 动态证据通过（21/21 案例、28/28 断言、退出码 0）；G2 动态跨契约一致性与 G4 工程边界证据已产出）
**状态：** THIRD ITERATION EVIDENCE PRODUCED（G2–G4 仍 NOT PASSED；S1 未验收）
**义务来源：** P3-S1-IMPL-AUTH-01 §2 授权范围；P2-EVIDENCE-8.1 §B 实施后动态证据段（G2 动态跨契约一致性案例与故障链路 + G4 工程边界/并发/重复请求/取消/陈旧响应/恢复/数据完整性验证）；P2-EVIDENCE-4.0 EB-01…EB-16
**记录日期：** 2026-10-08

## 1. 实施内容（S1 范围内）

| 项 | 记录 |
|---|---|
| 运行时核心 | 本迭代零改动（F-2 运行时核心 `src/experience/runtime.ts` 1663 行 + 11 模块 + 5 路由 + `policy.ts` 冻结映射为已实施基线；`git diff 67aac55..64a1391` 对产品源码为空——本迭代仅新增证据执行器） |
| 证据执行器 | `tools/evidence/src/f3.mjs`（2645 行，自包含；RUN_ID `F3-EB-0001`，端口 4323，Node v24.21.0 精确锁定）：21 案例（5 G2 动态跨契约一致性 + 16 G4 工程边界）+ 28 断言（B1–B28）+ E5 §3 版本矩阵（含 engineeringBoundaries 专项：EB-01…EB-16 证据映射、S2 范围项处置、HTTP 503 NOT RUN 登记） |
| 案例形态 | 进程内形态（注入网关/内存汇，真实运行时方法调用）+ 静态形态（产品源码导入图/属性访问/路由面扫描）+ HTTP 形态（真实 Next.js 生产服务器 `next start -p 4323`，真实 HTTP 请求与 NDJSON 流） |
| 故障注入 | 经 `LlmGateway` 接口注入失败网关（throw / 延迟 50ms 超时类 / 首次成功后失败队列）——进程内形态；HTTP 形态 503 无注入缝（NOT RUN，见 §3） |
| 迟到达提交 | 经公共方法 `runtime.completeGeneration(experienceId, generationId)` 人为制造"旧请求晚于新请求返回"（EB-05 P2 强制测试） |
| 环境锁定 | Node v24.21.0（引擎门禁 + engines 绑定）；Next.js 16.4.0 / React 19.3.0 / TypeScript 7.0.2 |
| 范围边界 | PD-05/PD-06/PD-07 持续生效；EB-10/EB-11 S2 范围项（记忆生命周期、工具授权链）属 S2 范围，本迭代仅 S1 缺席证明 + 动态拒绝 |

实施提交：`69c49f2`（执行器 + `npm run f3` 脚本）；`67aac55`（尝试 1/2 发现的执行器侧缺陷修复）；`4b5f1d6`（失败尝试 1 归档 + 尝试 2 原始产物，ADR-0002 §5）；`64a1391`（尝试 3 运行产物）；`0fe8011`（尝试 2 归档路径副本补提交——尝试 3 启动时执行器将尝试 2 产物重命名至归档路径，该副本于运行后补提交，ADR-0002 §5）。产品源码在本迭代零改动。

## 2. 动态证据（F3-EB-0001，2026-10-08）

**结果：21/21 案例 PASS、28/28 断言 PASS、退出码 0**（尝试 3，运行耗时 9.0s；退出码 0 只表示本运行中的断言通过，不设置任何 Gate 为 PASS——见 §5）。

| 案例 | 覆盖维度 | 结果 |
|---|---|---|
| G2-CHAIN-01 | G2 WHY 完整链路跨契约一致性：C1 会话 ACTIVE / C2 intent.semanticAction=WHY / C5 intent_parsed / C6 policy_decided.selected_action=EXPLAIN（冻结映射）/ C7/C8 流内容逐字节等于合成语料 / C9 终态 WAITING v4；决策追踪 state_before v2→state_after v3 与 state_transitioned（按 request_id 定位）一致；信封全量通过；sequence_number 严格单调；决策追踪分离（llm_used=true / tool_used=false） | PASS |
| G2-CHAIN-02 | G2 CHANGE 完整链路：复合步骤 [CHANGE_DIRECTION, EXPERIENCE_STARTED, USER_ACTION] 单次版本化提交 v3→v4；generation 归属（experience_interrupted reason=change_direction + old_generation_rejected；generation_cancelled.generation_id=旧 generation reason=superseded_by_change；新 generation_started 携带新 generation_id）；候选生成/选择同一 candidate_id；迟到达旧 generation 提交 STALE_GENERATION 拒绝；终态 WAITING v5 | PASS |
| G2-FAULT-01 | G2 故障链：不可分类输入 → 分类 UNKNOWN → INVALID_ACTION 升级（授权 §5.7；未知情况升级而非 LLM 决定）；零事件写入 / 零决策追踪 / 零版本消耗 | PASS |
| G2-FAULT-02 | G2 故障链：声明语义动作 ≠ 分类结果（客户端注入策略动作）→ INVALID_REQUEST；零副作用 | PASS |
| G2-VERSION-01 | G2 版本链完整性：每次合法版本化提交恰好 +1（v2→v4→v6→v7）；陈旧写入拒绝且不消耗版本号；最终版本 = 全部事件 context.state_version 最大值；state_version_conflict 事件携带 expected/current 版本 | PASS |
| EB01-SINGLE-WRITER | EB-01 Runtime 单一写入者（静态导入图）：state-store 仅被 runtime.ts 导入；`.commit(` 仅在 runtime.ts 调用；app/api 路由不直接导入 state-store / events 写入 API / decision-trace | PASS |
| EB02-FAIL-NO-BUMP | EB-02 状态版本：失败写入（陈旧期望版本 + 非法状态转换双路径）不消耗版本号——v2 → v2；事件流中唯一 state_transitioned 是启动提交 v1→v2；last-write-wins 禁止 | PASS |
| EB03-HTTP-DUP | EB-03 幂等（HTTP 形态）：重复 request_id → 409 REQUEST_DUPLICATE（结构化错误体 {code, message, retryable}）；事件日志长度不变（仅一次执行） | PASS |
| EB04-INTERRUPT | EB-04 可中断性（I1–I4 组合）：生成中常规输入拒绝（INVALID_STATE_TRANSITION retryable=true，版本不消耗）；生成中 CHANGE 取消旧 generation（superseded_by_change）并完成新候选（内容逐字节等于 change-direction 语料）；旧 generation 迟到达提交 STALE_GENERATION 拒绝；STOP 终止（流事件 stopped、零内容分块、COMPLETED v6、ENDED）；网关恰好 2 次调用（中断不触发额外调用） | PASS |
| EB05-STALE-LATE | EB-05 过期结果拒绝（P2 强制测试）：人为制造"旧请求晚于新请求返回"→ STALE_GENERATION；state_write_rejected 携带 attempted_generation_id / active_generation_id；新状态（v5 WAITING）未被污染 | PASS |
| EB06-RETRY | EB-06 重试边界：网关失败 → 恰好 1 次调用（无自动重试）、LLM_UNAVAILABLE retryable=true、零 state_transitioned（超出启动提交）/ 零 llm_request_completed / 零 generation_completed、policy_decided.state_after=null reason=LLM_UNAVAILABLE；版本与状态不因失败改变（v2 READY） | PASS |
| EB06-NO-RETRY-STOP | EB-06（续）失败后 STOP：首次 WHY 成功（WAITING v4）→ 第二次 WHY 失败（状态保持 WAITING v4）→ STOP 从 WAITING 合法终止（流事件 stopped、零内容分块、COMPLETED v5、ENDED；C6 事件 stop_requested / experience_completed / session_ended 齐备——无独立 "stopped" C6 事件）；网关调用恒为 2（STOP 后不得重试旧体验、不得再次调用网关） | PASS |
| EB07-TIMEOUT-RECOVERY | EB-07 超时边界：延迟 50ms 拒绝 → 有界恢复（版本不变、无隐藏续行——失败事件恰 4 个：why_requested / generation_started / llm_request_started / policy_decided）；用户控制保留（同一体验后续合法 WHY 输入成功，WAITING v4，内容逐字节等于语料，网关第 2 次调用）；不因超时而自行决定新方向 | PASS |
| EB08-CONFIDENCE | EB-08 LLM 边界：confidence 0.0 与 1.0 的提案产生完全一致的决策（selected_action=EXPLAIN / 同终态 v4 / 同版本链 / 流内容逐字节等于合成语料）；决策路径（运行时 + 策略）源码不读 `proposal.confidence`（静态断言；验证器仅做 schema 数值校验 ∈ [0,1]，不参与决策） | PASS |
| EB09-FRONTEND | EB-09 前端边界：app/api 路由仅导入 server-runtime / http / audit（无状态层直接导入）；前端文件（app/*.tsx）无状态变更（Frontend → Product API 为唯一产品面） | PASS |
| EB10-MEMORY | EB-10 记忆写入边界：S1 无记忆模块/导入（PD-07 缺席证明：文件名与导入说明符双扫描）；携带 memory_* 字段的提案 → POLICY_REJECTED + llm_output_rejected + state_write_rejected(llm_state_mutation_forbidden)，零状态写入（v2 不变） | PASS |
| EB11-TOOL | EB-11 工具授权边界：S1 无工具模块/导入（缺席证明）；全部决策追踪 execution.tool_used === false（LLM 不得直接执行工具）；WHY 决策 llm_used === true，STOP 决策 llm_used === false（用户主权动作不经 LLM） | PASS |
| EB12-ERROR-MAP | EB-12 API 边界：错误→HTTP 状态映射可区分且完备（409 STATE_VERSION_CONFLICT/REQUEST_DUPLICATE、503 LLM_UNAVAILABLE、500 INTERNAL_ERROR、400 其余——工程映射，非错误契约规定）；HTTP 错误体 {code, message, retryable} 齐备（400/409 形态验证；405 方法约束体为 {error, allowed} 路由级工程约束）；HTTP 形态 503 NOT RUN 明示登记（服务端运行时未暴露网关注入缝——非结论，见 §3） | PASS |
| EB13-COMPLETION | EB-13 完成边界：用户"好了"/"先这样"确定性分类为 STOP（用户主权，非 LLM 判断"用户应该还想继续"）；LLM 提案携带 is_complete 完成字段 → POLICY_REJECTED + llm_output_rejected + state_write_rejected(llm_state_mutation_forbidden)（版本不消耗）；STOP 从 WAITING 合法终止；STOP 决策追踪 user_override === true、selected_action === STOP | PASS |
| EB14-APPEND-ONLY | EB-14 分析边界（HTTP 形态）：事件日志追加只写——第二次交互后前缀字节逐字节不变、长度严格递增（分析只能观察，不能修改 Runtime State）；第二次交互终态 v6 | PASS |
| EB15-REPLAY | EB-15 可回放性：仅使用记录的事件流 + 决策追踪重建版本链（每次提交 +1、trace 链与事件链一致）、终态与运行时视图一致（COMPLETED/COMPLETION v5）、sequence_number 单调、全部版本化事件 ≤ 最终版本 | PASS |
| EB-16 | EB-16 版本可追溯：由 E5 §3 版本矩阵覆盖（B24/B26/B27/B28）：一次产品行为可关联 Product Version / Contract Versions / Schema Version / Policy Version / Code Revision / Corpus 版本；运行时 31 文件逐文件哈希登记；执行器自身哈希登记；证据-代码绑定（干净工作树，HEAD `67aac55`） | PASS |

断言 B1–B28：B1 run-metadata 完整（E5 §3 版本矩阵全部字段）；B2 环境锁定（engines.node === "24.21.0" 且执行于 Node v24.21.0）；B3 全部 21 案例记录齐备且 12 字段完整（E5 §4）；B4 全部 21 案例轨迹文件齐备且非空；B5–B8 G2 组不变式（WHY/CHANGE 链路、故障链、版本链）；B9–B23 EB-01…EB-15 逐项不变式（含 B14 重试边界双案例、B16 决策路径静态扫描）；B24 EB-16 版本可追溯；B25 无真实提供方调用（`src/experience/**` + `app/api/**` 25 文件静态扫描 0 违规）；B26 预检与完整性（typecheck:core + next build 退出码 0；参考归档 36 项哈希验证通过；契约指纹 C1–C7 全部匹配）；B27 证据-代码绑定（干净工作树，HEAD 记录于版本矩阵）；B28 证据清单 SHA256SUMS 产出且独立重算一致。

**材料位置：** `artifacts/evidence/runs/F3-EB-0001/`（cases/ 21 份 E5 §4 记录、traces/ 21 份 JSONL + http-events.jsonl + http-decision-traces.jsonl + http-audit.jsonl、run-metadata.json E5 §3 版本矩阵含 31 项运行时文件哈希与 engineeringBoundaries 专项、summary.json、SHA256SUMS、review/README.md 独立评测人审阅包）。

## 3. 动态证据发现的运行时缺陷与实施侧解释（如实登记）

**运行时缺陷：无。** F-3 动态证据（21 案例）未发现产品运行时——三次尝试中的全部失败均为案例/执行器侧缺陷（见 §4），产品源码在本迭代零改动。

案例/执行器侧缺陷（非产品缺陷，登记以保持透明；尝试 1 发现 8 类、尝试 2 发现 1 类）：

| ID | 发现尝试 | 缺陷 | 处置 |
|---|---|---|---|
| F3-E-1 | 1 | G2-CHAIN-01/EB-02/EB-06 断言取事件流首个 `state_transitioned`，而启动提交（v1→v2）也在事件流中——首个迁移是启动提交而非提交迁移 | 按 request_id 精确定位提交迁移（G2-CHAIN-01）；仅统计超出启动提交的迁移（EB-02/EB-06/EB-06s）（`67aac55`） |
| F3-E-2 | 1 | G2-CHAIN-02 断言 `experience_interrupted.properties.generation_id`——该事件实际携带 `interrupted_candidate_id` / `reason=change_direction` / `old_generation_rejected`，generation 级归属由 `generation_cancelled` 携带 | 断言改写为实现行为：interrupted 三属性 + generation_cancelled.generation_id 归属（`67aac55`） |
| F3-E-3 | 1 | EB-03 对原始 `Response` 对象读取 `.payload`（该属性不存在） | 解析响应体 `.json()` 后断言 {code, message, retryable}（`67aac55`） |
| F3-E-4 | 1 | EB-04/EB-08 断言流内容等于网关注入提案内容——流式内容实际由 `loadChunkFixture` 语料分块交付（提案经校验但其内容非流交付物） | 断言流内容逐字节等于对应合成语料（change-direction / why fixture）（`67aac55`） |
| F3-E-5 | 1 | EB-06s 断言不存在的 C6 `stopped` 事件——终止事实由流事件 `stopped` + C6 事件 stop_requested / experience_completed / session_ended 权威登记 | 断言改写为实现事件集（`67aac55`） |
| F3-E-6 | 1 | EB-11 断言全部决策追踪 `llm_used === true`——STOP 决策为用户主权动作，合法地 `llm_used === false` | 断言改为 EB-11 不变式 tool_used === false（全部）+ WHY 决策 llm_used === true（`67aac55`） |
| F3-E-7 | 1 | EB-13 设计缺陷：提案被拒后状态停在 READY（拒绝不提交），STOP 从 READY 不合法；且对拒绝提交的流调用 consume 致 TypeError | 案例重设计为 成功→拒绝→STOP（队列网关：首次正常提案、二次 is_complete 提案）；consume 加 ok 守卫（`67aac55`） |
| F3-E-8 | 1 | B28 断言 `verifySha256Sums(...).ok`——该函数返回 `{verified, failed}`（无 ok 字段） | 断言 `failed.length === 0`（`67aac55`） |
| F3-E-9 | 2 | A23 证据-代码绑定违规：尝试 2 在执行器修复未提交时运行——`git status --porcelain` 非空，B27 workTreeClean=false（如实记录，非掩盖） | 纪律执行：代码与执行器先提交（`67aac55`）、失败尝试产物先归档提交（`4b5f1d6`），尝试 3 于干净工作树运行（`64a1391`） |

实施侧解释（编码时作出的契约解释，**待非作者复核**——与 CR-16 / CR-17 同一复核批次，不得由编码者自行确认）：

1. **事件名称调和表（S1 §23 最低事件 → C6 权威名）：** 同 F-2 §3.1（intent_created → intent_received；semantic_action_detected → intent_parsed；user_action → C6 §14 交互事件；version_conflict → state_version_conflict），本迭代动态证据与之一致，未新增解释。
2. **policy_decided 发射时机：** 同 F-2 §3.2（分支派发完成后发出；被拒绝的决策 state_after 为 null——EB-06/EB-07 动态证据再次确认）。
3. **HTTP 状态码映射：** 同 F-2 §3.3（工程映射：409/503/500/400；405 方法约束体为路由级 {error, allowed} 结构，非错误契约结构——EB-12 动态验证）。
4. **HTTP 形态 LLM 故障 503（EB-12 子项）NOT RUN：** S1 服务端运行时（`server-runtime.ts`）以合成模式构造运行时，未暴露 `LlmGateway` 注入缝，LLM 故障无法经真实 HTTP 触发；进程内形态经接口注入失败网关已覆盖（EB-06/EB-07）。HTTP 形态 503 须待"服务端运行时是否暴露网关注入缝"决策（产品负责人）后执行——登记为 NOT RUN，非结论。

## 4. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

| 尝试 | 时间 (UTC) | 结果 | 留存 |
|---|---|---|---|
| 1 | 15:59:52–15:59:59 | 11/21 案例 PASS；G2-CHAIN-01/02、EB02、EB03、EB04、EB06、EB06-NO-RETRY-STOP、EB08、EB11、EB13 FAIL；断言 B3/B5/B6/B10/B11/B12/B14/B16/B19/B21/B28 失败；退出码 1 | `artifacts/evidence/runs/F3-EB-0001-attempt-2026-10-08T16-06-20-267Z/`（缺陷 F3-E-1…F3-E-8） |
| 2 | 16:06:20–16:06:27 | 21/21 案例 PASS；27/28 断言 PASS；B27 失败（workTreeClean=false——执行器修复未提交，A23 绑定违规）；退出码 1 | `artifacts/evidence/runs/F3-EB-0001-attempt-2026-10-08T16-07-30-452Z/`（尝试 2 产物原始提交于 `4b5f1d6` 的 `F3-EB-0001/` 路径；尝试 3 启动时执行器将其重命名至本归档路径，归档副本补提交 `0fe8011`；缺陷 F3-E-9） |
| 3 | 16:07:28–16:07:37 | **21/21 案例 PASS、28/28 断言 PASS、退出码 0**（9.0s） | `artifacts/evidence/runs/F3-EB-0001/`（`64a1391` 提交） |

证据-代码绑定（A23/B27）：尝试 3 运行前工作树干净——执行器（`69c49f2`）、缺陷修复（`67aac55`）、失败尝试归档（`4b5f1d6`）均在运行前提交；运行产物于运行后提交（`64a1391`）；运行绑定至 git 提交 `67aac55`（记录于 run-metadata.json code.gitHead）。

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 退出码 0 与 28/28 断言通过只表示本运行中的断言通过；不设置 G2 / G4 或任何 Gate 为 PASS（E5 §2 状态词汇规则）。
- G2 动态跨契约一致性案例与 G4 工程边界证据本运行已执行（证据已产出）；G2–G4 的 Gate 判定属 G5 独立评测范畴，NOT RUN。
- G5 16 项评测包 NOT RUN；独立评测人（用户本人，角色 5，PD-15）须先审阅 F-1、F-2 与 F-3 staged 材料（`F1-E2E-0001/review/README.md`、`F2-GS-0001/review/README.md`、`F3-EB-0001/review/README.md`）后方可执行评测。
- 事件名称调和表与 policy_decided 发射时机解释待非作者复核（CR-16 / CR-17）；未确认前不作为契约结论。
- HTTP 形态 LLM 故障 503 NOT RUN（非结论登记，见 §3.4）。
- EB-10/EB-11 的 S2 范围项（记忆生命周期、工具授权链）属 S2 范围，本运行仅 S1 缺席证明。
- S1 未验收；P2 仍 CLOSURE CANDIDATE / BLOCKED。
- 独立评测人对本运行材料保留审阅与否决权；评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。

## 6. 后续义务

- 非作者复核：事件名称调和表（CR-16）与 policy_decided 发射时机解释（CR-17）按 R2/R3 流程确认（用户本人，角色 8）。
- G5 16 项评测包执行前，独立评测人须先审阅 F-1/F-2/F-3 迭代材料（三份 review/README.md）。
- 产品负责人决策：服务端运行时是否暴露 LlmGateway 注入缝（决定 HTTP 形态 503 证据可否执行）。
- 隐私六要素批准前不得收集或保存任何真实用户数据（本运行仅合成数据；隐私六要素待产品/安全负责人批准——阻塞真实用户数据收集，不阻塞合成数据证据流）。

## 7. 签署

| 角色 | 记录 | 日期 |
|---|---|---|
| 工程负责人（执行） | 工程负责人角色（代理）已执行 F3-EB-0001（21/21 案例、28/28 断言、退出码 0；三次尝试如实登记） | 2026-10-08 |
| 独立评测负责人 | PENDING（用户本人，角色 5，PD-15；审阅权与否决权生效中） | PENDING |
