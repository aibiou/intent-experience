# P3-S2a 实施迭代记录：迭代 F-3（G07 完整 Correction 语义）

**编号：** P3-S2A-IMPL-ITER-F3
**版本：** 1.0.0（2026-10-09：S2a 迭代 F-3 完成登记——动态证据 S2A-F3-0001 通过（8/8 案例、15/15 断言、退出码 0）；S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施完毕）
**状态：** S2A F-3 EVIDENCE PRODUCED（时点状态，2026-10-09：S2a 后续义务（F-4 WHAT_IF 完整分支 / F-5 Minimal Memory）NOT STARTED；S1 未验收——现行 Gate 状态见 P3-S1-READINESS-01 v1.23.0）
**义务来源：** P3-S2-IMPL-AUTH-01 v1.2.0 §2(2)/§3(3)/§6（F-3：G07 完整 Correction 语义）；S2A-F3-SEMANTIC-FREEZE-01 v1.0.0（§2 裁决区 D-01…D-05 全项裁决；§3/§4 版本化变更文本冻结）
**记录日期：** 2026-10-09

## 1. 实施内容（授权范围内）

| 项 | 记录 |
|---|---|
| 产品源码变更 | 六个文件：`src/experience/correction.ts`（新增 120 行——MODIFY/RESTORE 指代词表与否定族模式表、`isRestoreIntent`、`deriveCorrectionTarget` 确定性目标派生（指代词表 → 上一候选；创作分量映射 TARGET_SYNONYMS；默认当前候选），无新增模型调用）；`src/experience/classifier.ts`（MODIFY→CORRECTION 用户面别名登记（08 §10 修改类型族）+ `correctionIntent?: 'restore'` 恢复子型标记；优先级层不变——STOP > CHANGE_DIRECTION > CORRECTION > CREATE > WHY > WHAT_IF > DIRECT_ANSWER）；`src/experience/creation.ts`（`CreationOperation` 增 `restore`；`applyCreationPatch` restore 分支恢复目标快照内容并版本单调 +1；`CreationStore.histories` 版本快照 Map；`TARGET_SYNONYMS` 导出）；`src/experience/events.ts`（`CORRECTION_APPLIED_EVENT` / `CORRECTION_RESTORED_EVENT` 纠正域事件常量，C6 §14 命名模式）；`src/experience/policy.ts`（`POLICY_VERSION = 'policy_v1.3.0'`，§3 变更 1–4）；`src/experience/runtime.ts`（创作会话 CORRECTION 路由保护——活跃创作会话内 CORRECTION 分类输入先经 RESTORE 预检（创作版本 >1）再经创作修改族预检：命中修改族 → 创作解释 CREATE 伞形 + 补丁轮次；命中冲突判据 → ASK；未命中 → 通用 CORRECTION 路径；`executeCorrect` 顶部确定性目标派生 + 提交后登记 `correction_applied`（correction_target / correction_summary / corrected_candidate_id / semantic_action），恢复意图时决策追踪 reasonPrimary=`restore_previous_version`，否则 `reassess`；`executeCreationModify` 恢复轮登记 `correction_restored`（restored_from_version / restored_to_version / creation_id / semantic_action）+ 决策追踪与头 reason=`creation_restore`） |
| 黄金套件同步 | `tools/evidence/src/golden.mjs`：8 处 policy_v1.2.0→policy_v1.3.0 断言同步 + 元数据状态文本（随 `3bae4d5` 提交）；G3-GOLDEN-0001 再生验证 32/32 案例 PASS、10/10 断言 PASS、退出码 0（运行绑定 gitHead `7ed44e3`——F-3 实施后状态；黄金输入零 MODIFY/RESTORE 词表词汇暴露，分类器变更对黄金行为零影响；前次运行归档 `G3-GOLDEN-0001-attempt-2026-10-09T08-46-45-835Z/`） |
| 证据执行器 | `tools/evidence/src/s2a-f3.mjs`（1742 行；RUN_ID `S2A-F3-0001`，Node v24.21.0 精确锁定）：8 案例 + 15 断言（A1–A8 逐案例不变式 + A9 案例记录齐备（E5 §4 12 字段）+ A10 轨迹文件齐备 + A11-PREFLIGHT 预检与完整性 + A12 run-metadata 完整（E5 §3 版本矩阵 + correctionSemantics 专项七分量 + obligationTraceability）+ A13 环境锁定 + A14 版本矩阵义务绑定（policy_v1.3.0 / state_machine_v1.2.0 / frozenDecisions D-01…D-05 / 黄金回归绑定 / 实施文件清单 6 项）+ A15 SHA256SUMS 独立重算一致） |
| 案例形态 | 进程内形态（`module.registerHooks` 加载已提交 `.ts` 源字节——Node ≥23.6 原生类型剥离；无 HTTP 服务器——F-3 范围为纠正域语义，直接对真实已提交运行时取证） |
| 环境锁定 | Node v24.21.0（引擎门禁 + engines 绑定 + lockfileVersion 3；F-2 精确锁定延续）；Next.js / React / TypeScript 版本登记于 run-metadata |

实施提交：`3bae4d5`（`feat(s2a-f3)`：143 文件，+3009/−225——含黄金套件同步与 G3 再验证产物）；证据提交 `9e7294a`（执行器 + 运行产物 + 两次失败尝试归档，ADR-0002 §5）。

## 2. 动态证据（S2A-F3-0001，2026-10-09）

**结果：8/8 案例 PASS、15/15 断言 PASS、退出码 0**（运行耗时约 15s（含 typecheck + next build 预检）；退出码 0 只表示本运行中的断言通过，不设置任何 Gate 为 PASS——见 §5）。

| 案例 | 覆盖维度 | 结果 |
|---|---|---|
| MODIFY-ALIAS | MODIFY 词表（08 §10 修改类型族）分类为 CORRECTION 用户面别名：静态断言 13 项全过（词表命中 / 优先级层不变 / 混合输入 2 项——"好了，修改这个" STOP 优先、"换个方向，修改这个" CHANGE_DIRECTION 优先）；非创作会话 "修改这个" / "调整一下" 完整重评估链路（correction_requested semantic_action=CORRECTION → experience_interrupted old_generation_rejected=true → generation/llm 链路 → state_transitioned CORRECTION → v6）→ correction_applied（correction_target=current_candidate，corrected_candidate_id=提案 ID，semantic_action=CORRECTION）；策略 EXPLAIN；决策追踪 reason=reassess，llm_used=true，policy_version=policy_v1.3.0 | PASS |
| CORRECTION-FULL | 完整 G07 链路（Evaluation System V1 §5）："刚才那个不对"——指代词表命中（/刚才/）→ 纠正目标确定性登记 previous_candidate（D-02 选项 A，无新增模型调用）；取消在途 generation（old_generation_rejected=true）；有效上下文保留（why_requested 事件保留 / session 未终止 / 意图-体验一致性经事件 context.intent_id 取证）；重评估候选提交 v5→v6；correction_applied（corrected_candidate_id 与最后一次 llm_request_completed.proposal_id 一致——WHY 轮与纠正轮各 1 次 LLM 完成事件）；决策追踪 reason=reassess 且 secondary 含 previous_candidate；终态 WAITING/UNDERSTANDING v6 | PASS |
| CREATION-INERT | 创作会话路由保护（D-01 选项 A，F-2 机制不变）：轮 1 "修改障碍颜色"（MODIFY 别名 → CORRECTION 分类）经创作修改族预检命中（/修改/ + 障碍 → obstacle）→ 创作解释 CREATE 伞形 + 补丁轮次（creation_patch_applied operation=modify target=obstacle kind=tune，创作 v2，user_changes 登记，决策追踪 llm_used=false；无 correction_applied / 无 state_transitioned CORRECTION / 无 creation_reevaluated——非 executeCorrect，逐轮快照取证）；轮 2 "不对"未命中创作修改族（interpretCreationInput 返回 none）→ 通用 CORRECTION 路径（creation_reevaluated phase=USER_FEEDBACK / creation_version=2 不变 + correction_applied target=current_candidate + state_transitioned CORRECTION，llm_used=true——F-2 变更 3 保持）；轮 3 "不对，加两个障碍"同时命中否定纠正族与 ADD 族 → 冲突判据（08 §16）→ ASK（单块澄清问题流，含 CORRECTION 轴名与确认请求——本输入冲突轴为 CORRECTION；创作版本/阶段/user_changes 不变；无 creation_patch_applied；llm_used=false） | PASS |
| RESTORE | 创作会话恢复提交（D-04 选项 A，08 §28）：轮 1 add 结构化补丁 v1→v2（objects=[player, exit, obstacle, obstacle_2_2]，obstacle_count=2）；轮 2 陈旧 expectedCreationVersion（=1 vs 2）→ 双重前置校验 STATE_VERSION_CONFLICT 拒绝；轮 3 恢复提交 v2→v3（版本单调 +1——S1-12 不变式；objects=[player, exit]，variables={progress: 0} 即 v1 快照——obstacle_count 消失证明内容恢复而非版本指针回退；user_changes 2 条 [add@2, restore@3]，restore 条目 change.restoreFromVersion=1）；correction_restored 事件（restored_from_version=1 / restored_to_version=3 / semantic_action=CORRECTION）+ creation_patch_applied operation=restore；头 reason=creation_restore；决策追踪 reason=creation_restore，llm_used=false，policy_version=policy_v1.3.0；终态 WAITING/CREATION | PASS |
| STALE-REJECT | 非创作会话陈旧 expected_state_version（3 vs 4）纠正提交 → STATE_VERSION_CONFLICT（retryable=false，details 含 expected/current_state_version）——按冻结 §4 变更 1，拒绝发生在 LLM 提案之后的版本化提交步，拒绝事实事件如实登记（correction_requested / experience_interrupted / generation_started / llm_request_started / llm_request_completed / llm_output_validated / state_version_conflict（trigger=CORRECTION）/ policy_decided 共 8 个）；状态逐字节不变（JSON 序列化前后一致）；无 correction_applied；无新 state_transitioned；失败写入不消耗任何版本号（OBL-01） | PASS |
| NONCREATION-INERT | 非创作会话行为与关闭切片（G07-N 黄金语义）一致：correction_requested×1 + why_requested×1 + interrupted(reason=correction)×1 + state_transitioned(CORRECTION)×1 + 决策追踪 reason=reassess + 终态 WAITING/UNDERSTANDING v6 + lastSemanticAction=CORRECTION + 零 memory 事件；与关闭切片仅有的差异：policy_version=policy_v1.3.0（版本化升版）+ correction_applied 事件登记（D-05 选项 A——纠正域事件为 F-3 新增事实登记） | PASS |
| NO-MEMORY | 纠正域零 memory 事件（PD-07；G07-B 同族）：三域纠正事实齐备——域 1 非创作纠正（correction_applied×1）+ 域 2 创作会话通用纠正（correction_applied×1 与 creation_reevaluated×1）+ 域 3 创作恢复轮（correction_restored×1 与 creation_patch_applied operation=restore×1）；全部事件 memory 事件 = 0（纠正不持久化跨会话——纠正域事件均为会话内事实登记） | PASS |
| INPROC-REGRESSION | 全链路回归：WHY → CREATE（建立）→ 修改轮（"把出口放远一点"——MODIFY 别名经创作会话路由保护 → 创作补丁轮次，创作 v2，头 reason=creation_modification，内容逐字节等于 create 语料）→ 纠正轮（"不对"——未命中创作修改族 → 通用 CORRECTION 重评估，头 reason=reassess，内容逐字节等于 correction 语料）→ 完成信号（"就这样"，STOP 路径登记创作完成）——C6 §7 信封全量有效、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v1.3.0、creation_patch_applied operation=modify×1、correction_applied×1、creation_reevaluated×1、终态 COMPLETED/COMPLETION + 创作 COMPLETE（active=false，v2）+ 会话 SESSION_ENDED | PASS |

断言 A1–A15：A1–A8 逐案例不变式（上表）；A9 全部 8 案例记录齐备且 12 字段完整（E5 §4；PD-19 延期义务已履行——G04/G07/G08 关闭切片执行，无 DEFERRED 登记）；A10 全部 8 案例轨迹文件齐备且非空；A11-PREFLIGHT 预检与完整性（typecheck:core + next build 退出码 0；参考归档哈希 36/36 验证通过；契约指纹 C1–C7 全部匹配——失败为 FATAL，不计入断言池）；A12 run-metadata 完整（E5 §3 版本矩阵全部字段 + F-3 纠正语义专项 correctionSemantics（aliasRegistration / targetDerivation / domainCarriage / routingProtection / restoreSubtype / events / crossSession）+ obligationTraceability）；A13 环境锁定（engines.node === "24.21.0" 且执行于 Node v24.21.0；lockfileVersion 3）；A14 F-3 版本矩阵义务绑定（policy_v1.3.0 / state_machine_v1.2.0 / frozenDecisions D-01…D-05 齐备（全项选项 A）/ 黄金回归绑定 G3-GOLDEN-0001（断言已同步 policy_v1.3.0）/ 实施文件清单 6 项齐备（含 correction.ts 新增））；A15 证据清单 SHA256SUMS 产出且独立重算全部一致（18 项，G3-E-3 双遍：最终摘要写入后重新生成清单）。

**材料位置：** `artifacts/evidence/runs/S2A-F3-0001/`（cases/ 8 份 E5 §4 记录、traces/ 8 份案例 JSONL、run-metadata.json E5 §3 版本矩阵（含执行器与运行时文件逐文件哈希 + executorSha256 绑定）、summary.json、SHA256SUMS（18 项）、review/README.md 独立评测人审阅包）。

## 3. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

| 尝试 | 时间（UTC） | 结果 | 缺陷根因与处置 |
|---|---|---|---|
| 1 | 2026-10-09T09:10 | 4/8 案例 PASS（MODIFY-ALIAS / RESTORE / NONCREATION-INERT / NO-MEMORY） | 执行器侧断言缺陷（产品运行时行为全部正确——逐案核对运行时源码与事件流确认）：(a) CORRECTION-FULL：`llm_request_completed` 按 1 次断言，实际 WHY 轮与纠正轮各 1 次（共 2 次），且 corrected_candidate_id 应与最后一次提案 ID 比对（改 `.at(-1)`）；`intentIdMatch` 误从不存在的 `startExperience` 返回字段取 intentId（其 ok-返回为 `{ ok, sessionId, experienceId, stateVersion }`，无 intentId 字段）→ 改为经事件 context.intent_id 取证。(b) CREATION-INERT：轮 1 不变量对最终聚合值断言（轮 2/3 产生纠正事实致计数为 1）→ 改为逐轮快照取值；ASK 轮内容断言误查 CHANGE_DIRECTION 轴名，实际冲突轴为 CORRECTION（"不对"经否定族判 CORRECTION）→ 断言改查 CORRECTION 轴名与确认请求。(c) STALE-REJECT：事件计数不变不变量错误——按冻结 §4 变更 1，拒绝发生在 LLM 提案后的版本化提交步，拒绝事实事件（8 个）如实登记 → 移除计数断言，改为断言 state_version_conflict 事件（trigger=CORRECTION，expected/current 版本号）+ 状态逐字节不变 + 无 correction_applied + 无新 state_transitioned。(d) INPROC-REGRESSION：局部变量 `correction` 遮蔽模块级导入的 correction fixture，`correction.chunks.join('')` 抛 TypeError → 局部变量改名 `correctionRound`。归档留存 `S2A-F3-0001-attempt-2026-10-09T09-10-28-595Z/` |
| 2 | 2026-10-09T09:11 | 7/8 案例 PASS（CORRECTION-FULL 剩余失败） | 承接尝试 1(a)：`intentIdMatch` 断言过强——要求体验内全部事件携带解析意图 ID，但运行时级事件 `generation_completed` / `runtime_waiting` 的 `context.intent_id` 为 null 属设计事实（非意图作用域事件，经 runtime.ts 流完成辅助路径核实）→ 一致性断言改为：体验事件不引用任何其他意图（`intent_id` 为 null 或等于解析意图 ID）且解析意图 ID 非空。归档留存 `S2A-F3-0001-attempt-2026-10-09T09-11-45-939Z/` |
| 3 | 2026-10-09T09:11 | 8/8 案例 PASS、15/15 断言 PASS、退出码 0 | —— |

## 4. 实施侧事实核验记录（实施严格按冻结文本执行，无语义偏差；两项事实核验）

1. 黄金输入零暴露核验：G3 黄金输入不含 MODIFY/RESTORE 词表词汇——F-3 分类器变更对黄金套件行为零影响（32/32 再验证通过，运行绑定 gitHead `7ed44e3`）；S2A-F2-0001 输入集在 F-3 下路由逐例不变（F-2 案例输入不含纠正词表词汇，创作修改族预检不改变 F-2 已裁决路由）——F-2 动态证据结论不受 F-3 影响。
2. `startExperience` 返回形状事实：ok-返回为 `{ ok, sessionId, experienceId, stateVersion }`（无 intentId 字段）——意图-体验一致性经事件 `context.intent_id` 取证；运行时级事件（`generation_completed` / `runtime_waiting`）的 `context.intent_id` 为 null 属设计事实（非意图作用域），执行器断言按此形状建立。

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 退出码 0 与本运行全部通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G5/G8）或产品状态为 PASS（E5 §2）。
- 本迭代履行 F-3（G07 完整 Correction 语义，S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）；CR-20 状态 FROZEN→IMPLEMENTED 登记于 decision-register；readiness-record 升 v1.23.0。
- G5 独立评测对本运行材料保留审阅与否决权（`review/README.md` 为 staged 审阅包）。
- S2a 后续义务（F-4 WHAT_IF 完整分支 / F-5 Minimal Memory）与 S2b 均 NOT STARTED；本运行不构成对 S2 任何后续范围项的结论。

## 6. 后续义务

- S2a F-4（WHAT_IF 完整分支；policy_v1.4.0 / state_machine_v1.3.0——S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 已冻结，CR-21 FROZEN，实施授权生效）：按冻结文本 §5 大纲执行（分层实施——第一层多轮模拟持久化 + 四元分离随本版实施；第二层分支生命周期语义经 D-02…D-04 产品负责人版本化定义后于同一 policy_v1.4.0 冻结文本内补写生效；新增 `src/experience/simulation.ts`；`events.ts` 模拟域事件词表 `simulation_recorded`；`runtime.ts` WHAT_IF 执行扩展 + 分支操作路由 CREATE/SWITCH/ABANDON/RETURN）；证据执行器 `tools/evidence/src/s2a-f4.mjs`（8 案例草案见冻结文本 §5）。
- S2a F-5（Minimal Memory：仅短期记忆形态，6 个月自动删除，无长期画像——PD-23 / PB-04）：隐私敏感存储/加密设计须经产品负责人方向指示后版本化冻结，NOT STARTED。
- S2a 动态证据扩展：S2 动态证据套件 + G3 黄金套件扩展 + 独立评测（角色 5 签署）。
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）：新动作语义定义须在 S2b 授权前由产品负责人版本化冻结；S2b 须另行裁决与授权。
- OBL-02（延迟测量）：方法 v1.0.0 已经产品负责人按 E3 批准；测量执行属后续义务，任何延迟指标宣称前须满足方法第 5 节样本纪律并注明分层。

## 7. 签署

- 执行：工程负责人角色（代理，Codex），2026-10-09。
- 独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）——审阅中（staged 审阅包：`artifacts/evidence/runs/S2A-F3-0001/review/README.md`）。
- 本记录由执行方起草；独立评测人保留审阅与否决权。
