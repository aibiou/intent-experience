# P3-S2a 实施迭代记录：迭代 F-4（WHAT_IF 完整分支语义）

**编号：** P3-S2A-IMPL-ITER-F4
**版本：** 1.0.0（2026-10-09：S2a 迭代 F-4 完成登记——动态证据 S2A-F4-0001 通过（9/9 案例、16/16 断言、退出码 0）；S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施完毕（分层：第一层多轮模拟持久化 + 四元分离；第二层轴外分支子状态机 + 四操作生命周期））
**状态：** S2A F-4 EVIDENCE PRODUCED（时点状态，2026-10-09：S2a 后续义务（F-5 Minimal Memory）NOT STARTED；S1 未验收——现行 Gate 状态见 P3-S1-READINESS-01 v1.24.0）
**义务来源：** P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§3(4)/§6（F-4：WHAT_IF 完整分支语义）；S2A-F4-SEMANTIC-FREEZE-01 v1.0.0（§2 裁决区 D-01…D-05 全项裁决，含第二层分支语义定义裁决 D-02/D-03；§3/§4 版本化变更文本冻结（分层））
**记录日期：** 2026-10-09

## 1. 实施内容（授权范围内）

| 项 | 记录 |
|---|---|
| 产品源码变更 | 五个文件：`src/experience/simulation.ts`（新增 437 行——四元分离模型 `SimulationSeparation`（事实 / 推断 / 假设 / 模拟结果）、模拟轮次记录 `SimulationRoundRecord`、分支记录 `BranchRecord`（五分量：branchId / sourceRound / rounds / version / lifecycle ∈ {ACTIVE, RETURNED, ABANDONED}）、分支操作 `BranchOperation`（SWITCH / ABANDON / RETURN，RETURN 优先 > SWITCH > ABANDON 词表优先级）、`interpretBranchOperation` 确定性规则词表（分支作用域词表 + 目标序号提取 `分支\s*([0-9一二三四五六七八九十]+)`）、`deriveSimulationSeparation` 语料分段解析（事实——/推断——/假设——/。本提案 标记）、`SimulationStore`（模拟历史 + 分支记录 + 当前激活分支三 Map，全局计数器 sim_round_synthetic_NNNN / branch_synthetic_NNNN；`recordRound` 无激活分支时自动 CREATE（D-03）；`validateBranchOperation` 前置校验（拒绝先于任何写入）；`applyBranchOperation`；`getSnapshot`；`invalidate`））；`src/experience/events.ts`（`SIMULATION_RECORDED_EVENT = 'simulation_recorded'` 模拟域事件词表常量，C6 §14 命名模式 <domain>_<past_participle> 派生，event_version 1.0.0 不变）；`src/experience/policy.ts`（`POLICY_VERSION = 'policy_v1.4.0'`，§3 变更 1/2 完整文档注释）；`src/experience/runtime.ts`（`SimulationStore` 实例 + `getSimulation(experienceId)` 公共 API；WHAT_IF 输入经分支操作词表识别——命中 → `executeBranchOperation` 确定性系统回合（校验 → 取消在途 generation → WHAT_IF_SIMULATE 逐步迁移校验 → 版本化提交 lastSemanticAction=WHAT_IF → 应用分支操作 → state_transitioned 事件 → 决策追踪 reasonPrimary=explicit_user_direction / 拒绝轮 invalid_state_transition，llm_used=false → 单块确定性流）；未命中 → `executeContentGeneration` SIMULATE 路径扩展（提交成功后 `simulations.recordRound` + `recordEvent(SIMULATION_RECORDED_EVENT)`——properties 含 simulation_id / round / branch_id / branch_created / source_input / fact / inference / hypothesis / simulation / separation_invariant=simulation_result_is_not_fact / proposal_id / generation_id）；三处会话终止站点（完成 / 方向变更 / 重复 CREATE 取代在途创作会话）模拟域失效（D-04））；`tools/evidence/src/golden.mjs`（policy_v1.3.0→policy_v1.4.0 断言同步 8 处） |
| 黄金套件同步 | `tools/evidence/src/golden.mjs`：policy_version 断言同步（0 处 policy_v1.3.0 残留）；G3-GOLDEN-0001 再生验证 32/32 案例 PASS、9/9 断言 PASS、退出码 0（G03-N 单次模拟形态不回归——单轮 WHAT_IF → SIMULATION/WAITING/v4、session_started=1、experience_started=1；G03-NEG STOP 优先、G03-B WHY > WHAT_IF 同层顺序不回归；G03-FR 陈旧拒绝 → 当前版本重试成功不回归） |
| 证据执行器 | `tools/evidence/src/s2a-f4.mjs`（约 1810 行；RUN_ID `S2A-F4-0001`，Node v24.21.0 精确锁定）：9 案例 + 16 断言（A1–A9 逐案例不变式 + A10 案例记录齐备（E5 §4 12 字段）+ A11 轨迹文件齐备 + A12-PREFLIGHT 预检与完整性 + A13 run-metadata 完整（E5 §3 版本矩阵 + simulationSemantics 专项八分量 + obligationTraceability）+ A14 环境锁定 + A15 版本矩阵义务绑定（policy_v1.4.0 / state_machine_v1.3.0 / frozenDecisions D-01…D-05 / 黄金回归绑定 / 实施文件清单 5 项）+ A16 SHA256SUMS 独立重算一致） |
| 案例形态 | 进程内形态（`module.registerHooks` 加载已提交 `.ts` 源字节——Node ≥23.6 原生类型剥离；无 HTTP 服务器——F-4 范围为模拟域语义，直接对真实已提交运行时取证） |
| 环境锁定 | Node v24.21.0（引擎门禁 + engines 绑定 + lockfileVersion 3；F-2 精确锁定延续）；Next.js / React / TypeScript 版本登记于 run-metadata |

实施提交：`dcc94fc`（`feat(s2a-f4)`：141 文件，+3462/−196——含黄金套件同步与 G3 再验证产物）；证据提交 `45abe78`（执行器 + 运行产物 + 三次失败尝试归档，ADR-0002 §5）。

## 2. 动态证据（S2A-F4-0001，2026-10-09）

**结果：9/9 案例 PASS、16/16 断言 PASS、退出码 0**（运行耗时约 18s（含 typecheck + next build 预检）；退出码 0 只表示本运行中的断言通过，不设置任何 Gate 为 PASS——见 §5）。

| 案例 | 覆盖维度 | 结果 |
|---|---|---|
| MULTI-ROUND | 多轮模拟持久化（§3 变更 1 第一层）：两轮 WHAT_IF（"如果摩擦力为零会怎样" → "假如速度再高一点会怎样"）——每轮两次版本化提交（版本链 2→3→4→5→6，每次合法提交恰好 +1，S1-12）；selected_action=SIMULATE；阶段 UNDERSTANDING → SIMULATION → SIMULATION（13 §15.3）；simulation_recorded ×2（round 1/2 同一分支，branch_created [true, false]，separation_invariant=simulation_result_is_not_fact）；内容逐字节等于 simulate 语料；决策追踪 reasonPrimary=semantic_action，llm_used=true，policy_version=policy_v1.4.0；模拟域快照 1 分支（ACTIVE，version=2，sourceRound=1） | PASS |
| SEPARATION | 四元分离（D-05 选项 A；E8-G2-CC07）：每轮 simulation_recorded properties 含 fact / inference / hypothesis / simulation 四元字段——fact / inference / hypothesis 逐字段等于语料分段（期望值由已提交语料字节机械派生，非代码推断），simulation = 完整提案语料（含 事实——/推断——/假设—— 标记），simulation ≠ fact（模拟结果不表现为事实），separation_invariant=simulation_result_is_not_fact；源输入摘要、simulation_id / proposal_id / generation_id 关联齐备；模拟域快照 separation 与事件 properties 逐字段一致（事件为不可变权威事实——C6 §5） | PASS |
| NO-NEW-EXPERIENCE | G03-N 不变式：多轮模拟 + 分支操作轮不创建新 Session / Experience（session_started=1，experience_started=1，session_ended=0）；会话保持 SESSION_ACTIVE；全部体验事件共享同一 session_id / experience_id | PASS |
| STAGE-PRESERVED | 阶段迁移保持与衔接：序列 CURIOSITY → UNDERSTANDING → SIMULATION（轮 1）→ SIMULATION（轮 2）→ CREATION（CREATE 衔接，13 §15.5，"做成一个小游戏"）→ COMPLETION（STOP 完成，"就这样"）；WHAT_IF 轮次保持 SIMULATION 阶段（体验阶段轴不变——D-02 选项 A）；创作建立 creation_started ×1（phase USER_FEEDBACK v1）；创作完成 creation_completed ×1（COMPLETE，active=false，v1）；CREATE 内容逐字节等于 create 语料 | PASS |
| STALE-REJECT | 陈旧 expected_state_version（3 vs 4）模拟提交 → STATE_VERSION_CONFLICT（retryable=false，details 含 expected/current_state_version）；状态逐字节不变；无新 simulation_recorded（失败不登记模拟轮次）；无新 state_transitioned（state_version > 4）；拒绝事实经 state_version_conflict 事件登记（trigger=WHAT_IF，expected=3，current=4）；失败写入不消耗任何版本号（OBL-01）；当前版本（4）重试 → SIMULATE 成功（v6，simulation_recorded round 2） | PASS |
| STOP-PRIORITY | 优先级纪律：静态分类——"如果摩擦力为零就好了" → STOP（P-01 永远优先）、"如果为什么" → WHY（PD-12 同层顺序 WHY > WHAT_IF）、"如果摩擦力为零会怎样" → WHAT_IF（对照不变）；动态声明校验——声明 WHAT_IF 但输入含 STOP / WHY 标记 → INVALID_REQUEST（semantic_action mismatch——clients cannot inject policy actions）；拒绝后状态逐字节不变；零 simulation_recorded；无模拟域上下文 | PASS |
| NONCREATION-INERT | 非模拟场景不回归：WHY → EXPLAIN 链路与 policy_v1.3.0 行为逐项一致（why_requested ×1，state_transitioned steps [USER_ACTION]，终态 WAITING/UNDERSTANDING v4，内容逐字节等于 why 语料，决策追踪 llm_used=true）；与前置版本仅有的差异为 policy_version=policy_v1.4.0；模拟域零事件（simulation_recorded=0）且无模拟上下文（getSimulation 拒绝——非模拟路径不受 F-4 影响） | PASS |
| INPROC-REGRESSION | 全链路进程内回归：WHY → 模拟轮 1 → 模拟轮 2 → 分支操作 RETURN → 模拟轮 3（RETURN 后首轮自动 CREATE 新分支）→ CREATE 衔接（13 §15.5）→ 完成信号（STOP）——C6 §7 信封全量有效、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v1.4.0；WHY / 模拟轮 / CREATE 内容逐字节等于 why / simulate / create 语料；RETURN 轮 selected_action=SIMULATE 且 reason=simulation_branch_operation（确定性系统回合，llm_used=false）；simulation_recorded ×3（round 1/2 同一分支，round 3 新分支）；终态 COMPLETED/COMPLETION；创作 COMPLETE（active=false，v1）；会话 SESSION_ENDED；模拟域随会话结束失效（D-04 选项 A——getSimulation 拒绝） | PASS |
| BRANCH-LIFECYCLE | 轴外分支子状态机全生命周期（D-02/D-03 选项 A）：轮 1 自动 CREATE 分支 1（sourceRound=1，ACTIVE）→ 轮 2 累积（分支 version=2）→ RETURN（分支 1 RETURNED，currentBranchId=null，模拟历史不变）→ 轮 3 自动 CREATE 分支 2（sourceRound=3）→ SWITCH 分支 1（RETURNED 恢复 ACTIVE，currentBranchId=分支 1）→ ABANDON 分支 2（ABANDONED，当前激活保持分支 1）→ 负向：切换已放弃分支 2 → INVALID_STATE_TRANSITION（版本保持 14，不消耗版本号）→ RETURN（分支 1 RETURNED）→ 负向：无激活分支 RETURN → INVALID_STATE_TRANSITION（版本保持 16）；simulation_recorded ×3（round 1/2/3——仅模拟轮登记）；分支操作决策追踪 6 轮（含 2 拒绝轮）llm_used=false，reasonPrimary ∈ {explicit_user_direction, invalid_state_transition} | PASS |

断言 A1–A16：A1–A9 逐案例不变式（上表）；A10 全部 9 案例记录齐备且 12 字段完整（E5 §4）；A11 全部 9 案例轨迹文件齐备且非空；A12-PREFLIGHT 预检与完整性（typecheck:core + next build 退出码 0；参考归档哈希 36/36 验证通过；契约指纹 C1–C7 全部匹配——失败为 FATAL，不计入断言池）；A13 run-metadata 完整（E5 §3 版本矩阵全部字段 + F-4 模拟语义专项 simulationSemantics（multiRoundPersistence / fourWaySeparation / branchSubStateMachine / branchOperations / branchMainlineRelation / sessionBoundary / negativePaths / events / crossSession）+ obligationTraceability）；A14 环境锁定（engines.node === "24.21.0" 且执行于 Node v24.21.0；lockfileVersion 3）；A15 F-4 版本矩阵义务绑定（policy_v1.4.0 / state_machine_v1.3.0 / frozenDecisions D-01…D-05 齐备（全项选项 A）/ 黄金回归绑定 G3-GOLDEN-0001（断言已同步 policy_v1.4.0）/ 实施文件清单 5 项齐备（含 simulation.ts 新增））；A16 证据清单 SHA256SUMS 产出且独立重算全部一致（20 项，G3-E-3 双遍：最终摘要写入后重新生成清单）。

**材料位置：** `artifacts/evidence/runs/S2A-F4-0001/`（cases/ 9 份 E5 §4 记录、traces/ 9 份案例 JSONL、run-metadata.json E5 §3 版本矩阵（含执行器与运行时文件逐文件哈希 + executorSha256 绑定）、summary.json、SHA256SUMS（20 项）、review/README.md 独立评测人审阅包）。

## 3. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

| 尝试 | 时间（UTC） | 结果 | 缺陷根因与处置 |
|---|---|---|---|
| 1 | 2026-10-09T09:48 | 7/9 案例 PASS（STALE-REJECT / NONCREATION-INERT 失败，A5 / A7） | 执行器侧断言缺陷（产品运行时行为全部正确——逐案核对运行时源码与事件流确认）：(a) STALE-REJECT：拒绝后事件窗口在重试提交之后才采样——采样值混入重试事件（simulationCountAfterStale=2、newStateTransitions=1 实为重试轮事实）→ 采样点移至重试提交之前，改为断言 state_version_conflict 事件（trigger=WHAT_IF，expected/current 版本号）+ 状态逐字节不变 + 无新 simulation_recorded / state_transitioned。(b) NONCREATION-INERT：transitionedSteps 断言未考虑建立链迁移（startExperience 的 CURIOSITY→UNDERSTANDING 迁移 properties.steps 为空）——断言改为仅对携带 steps 的迁移取证。归档留存 `S2A-F4-0001-attempt-2026-10-09T09-49-21-804Z/` |
| 2 | 2026-10-09T09:49 | 8/9 案例 PASS（NONCREATION-INERT 失败，A7） | 承接尝试 1(b)：建立链迁移的 `properties.steps` 为 `undefined`（非严格 `null`）——`!== null` 过滤不生效，JSON 序列化将 undefined 数组元素渲染为 null 致断言失配 → 过滤改为 `Array.isArray(event.properties.steps)`。归档留存 `S2A-F4-0001-attempt-2026-10-09T09-49-38-948Z/` |
| 3 | 2026-10-09T09:51 | 8/9 案例 PASS（NONCREATION-INERT 失败，A7） | 同一命令内第二次运行（同一执行器版本）——与尝试 2 同根因，验证修复前行为稳定复现。归档留存 `S2A-F4-0001-attempt-2026-10-09T09-51-02-708Z/` |
| 4 | 2026-10-09T09:51 | 9/9 案例 PASS、16/16 断言 PASS、退出码 0 | —— |

## 4. 实施侧事实核验记录（实施严格按冻结文本执行，无语义偏差；三项事实核验）

1. 黄金输入零暴露核验：G3 黄金输入不含分支操作词表词汇（返回 / 切换 / 放弃 / 分支）——F-4 分支操作词表对黄金套件行为零影响（32/32 再验证通过，断言已同步 policy_v1.4.0）；S2A-F3-0001 输入集在 F-4 下路由逐例不变（F-3 案例输入不含分支作用域词汇）——F-3 动态证据结论不受 F-4 影响。
2. 版本推进事实核验：每轮 WHAT_IF 消耗两次版本化提交（提交 +1 / 流完成 RESPONSE_COMPLETED +1）——S1-12"每次合法提交恰好 +1"按提交粒度成立（冻结文本 §5 案例大纲"每轮版本 +1"为示意性表述，证据按冻结不变式 §3 变更 1"每次合法提交恰好 +1（S1-12）"执行并取证版本链 2→3→4→5→6 逐级 +1）。
3. 语料文本遗留观察（非偏差——登记待产品负责人裁决）：模拟语料 `synthetic/simulate/v1` 尾句"本提案为单次模拟，不建立分支状态"为 S1 基础形态（PD-06）遗留文本——F-4 起运行时经轴外分支子状态机建立分支状态（D-02/D-03 选项 A），语料尾句与运行时行为不一致；语料文本更新属产品语料裁决范围，本迭代按冻结文本 §5 实施文件清单（5 项，未列 fixtures/simulate.ts）未改语料；分离格式标记（事实——/推断——/假设——）不变，G03-N 黄金断言随版本同步通过。

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 退出码 0 与本运行全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G5/G8）或产品状态为 PASS（E5 §2）。
- 本迭代履行 F-4（WHAT_IF 完整分支语义，S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）；CR-21 状态 FROZEN→IMPLEMENTED 登记于 decision-register；readiness-record 升 v1.24.0。
- G5 独立评测对本运行材料保留审阅与否决权（`review/README.md` 为 staged 审阅包）。
- S2a 后续义务（F-5 Minimal Memory）与 S2b 均 NOT STARTED；本运行不构成对 S2 任何后续范围项的结论。

## 6. 后续义务

- S2a F-5（Minimal Memory：仅短期记忆形态，6 个月自动删除，无长期画像——PD-23 / PB-04）：隐私敏感存储/加密设计须经产品负责人方向指示后版本化冻结，NOT STARTED；跨会话分支持久化属 F-5 裁决范围（D-04 选项 A——本切片不实施）。
- "采用某分支结论"显式回流操作（D-03 选项 A 说明）：须产品负责人另案版本化定义，本版不预先写死。
- 模拟语料尾句文本更新（§4 第 3 项观察）：待产品负责人语料裁决。
- S2a 动态证据扩展：S2 动态证据套件 + G3 黄金套件扩展 + 独立评测（角色 5 签署）。
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）：新动作语义定义须在 S2b 授权前由产品负责人版本化冻结；S2b 须另行裁决与授权。
- OBL-02（延迟测量）：方法 v1.0.0 已经产品负责人按 E3 批准；测量执行属后续义务，任何延迟指标宣称前须满足方法第 5 节样本纪律并注明分层。

## 7. 签署

- 执行：工程负责人角色（代理，Codex），2026-10-09。
- 独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）——审阅中（staged 审阅包：`artifacts/evidence/runs/S2A-F4-0001/review/README.md`）。
- 本记录由执行方起草；独立评测人保留审阅与否决权。
