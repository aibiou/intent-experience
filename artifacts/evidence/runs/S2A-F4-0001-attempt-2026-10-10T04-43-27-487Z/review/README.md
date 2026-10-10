# S2A-F4-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S2A-F4-0001（S2a F-4 迭代：WHAT_IF 完整分支语义——多轮模拟持久化 + 四元分离事件登记 + 轴外分支子状态机 + 分支生命周期四操作最小集 + simulation_recorded 事件词表；ADOPT_BRANCH 显式回流经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效——policy_v2.1.0 变更 1–5，BRANCH-ADOPT 案例组）
日期：2026-10-10T00:36:47.851Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：10/10 全部 PASS
- 断言：17/17 通过
- 退出码：0（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 10 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-4 → 案例 / 断言映射；simulationSemantics：模拟语义规范注册；frozenDecisions：D-01…D-05 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 多轮模拟持久化（MULTI-ROUND）：两轮 WHAT_IF（"如果摩擦力为零会怎样" → "假如速度再高一点会怎样"）——每轮两次版本化提交（版本链 2→3→4→5→6，每次合法提交恰好 +1，S1-12）；selected_action=SIMULATE；阶段 UNDERSTANDING → SIMULATION → SIMULATION（13 §15.3）；simulation_recorded ×2（round 1/2 同一分支，branch_created [true, false]）；内容逐字节等于 simulate 语料；决策追踪 reasonPrimary=semantic_action，llm_used=true
- 四元分离（SEPARATION）：simulation_recorded properties 含 fact / inference / hypothesis / simulation 四元字段——fact / inference / hypothesis 逐字段等于语料分段（由已提交语料字节机械派生），simulation = 完整提案语料，simulation ≠ fact（模拟结果不表现为事实——E8-G2-CC07），separation_invariant=simulation_result_is_not_fact；模拟域快照 separation 与事件 properties 逐字段一致
- 不新建体验（NO-NEW-EXPERIENCE）：G03-N 不变式——多轮模拟 + 分支操作轮 session_started=1 / experience_started=1；会话保持 SESSION_ACTIVE；全部体验事件共享同一 session_id / experience_id
- 阶段保持与衔接（STAGE-PRESERVED）：CURIOSITY → UNDERSTANDING → SIMULATION → SIMULATION →（CREATE 衔接，13 §15.5）CREATION →（STOP 完成）COMPLETION；创作建立 / 完成事件齐备；创作 COMPLETE（active=false，v1）
- 陈旧拒绝（STALE-REJECT）：陈旧 expected_state_version（3 vs 4）→ STATE_VERSION_CONFLICT（retryable=false）；状态逐字节不变；无新 simulation_recorded / state_transitioned；拒绝事实经 state_version_conflict 事件登记（trigger=WHAT_IF）；当前版本重试成功（v6）
- 优先级（STOP-PRIORITY）：静态分类——STOP 标记 → STOP（P-01）/ WHY 标记 → WHY（PD-12）/ 洁净 WHAT_IF 对照不变；动态声明校验——声明 WHAT_IF 但输入含 STOP / WHY 标记 → INVALID_REQUEST（clients cannot inject policy actions）；拒绝后状态逐字节不变；零 simulation_recorded
- 非创作会话不回归（NONCREATION-INERT）：WHY → EXPLAIN 链路与 policy_v1.3.0 行为逐项一致（why_requested ×1，steps [USER_ACTION]，WAITING/UNDERSTANDING v4，内容逐字节等于 why 语料）；与前置版本（policy_v1.3.0）仅有的差异为 policy_version=policy_v2.1.0（版本化变更文本同步——F-4 语义经 policy_v1.4.0 冻结、policy_v2.1.0 延续）；模拟域零事件且无模拟上下文
- 全链路回归（INPROC-REGRESSION）：WHY → 模拟轮 1 → 模拟轮 2 → 分支操作 RETURN → 模拟轮 3（新分支自动 CREATE）→ CREATE 衔接 → 完成信号——信封全量有效（C6 §7）、sequence 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v2.1.0（F-4 语义经 policy_v1.4.0 冻结、policy_v2.1.0 延续不变）、内容逐字节等于语料；simulation_recorded ×3（round 1/2 同一分支，round 3 新分支）；RETURN 轮 llm_used=false；模拟域随会话结束失效（D-04）
- 分支生命周期（BRANCH-LIFECYCLE）：CREATE（首轮自动）→ 累积 → RETURN（RETURNED + 当前清空）→ 自动 CREATE 新分支 → SWITCH（RETURNED 恢复 ACTIVE）→ ABANDON（ABANDONED）→ 负向拒绝 ×2（切换已放弃分支 / 无激活分支 RETURN——INVALID_STATE_TRANSITION，不消耗版本号）；模拟历史 3 轮（轮 1/2 分支 1，轮 3 分支 2）；分支操作决策追踪 6 轮（含 2 拒绝轮）llm_used=false
- 显式回流（BRANCH-ADOPT）：轮 1/2 自动 CREATE 分支 1 并累积 → ADOPT_BRANCH 分支 1（adopted 标记附加——生命周期 ACTIVE 不变，主线当前上下文不变——currentBranchId 保持分支 1；simulation_adopted ×1，properties 含 branch_id / source_round=1 / adopted_content 摘要=分支最新模拟轮模拟内容 / separation_invariant=simulation_result_is_not_fact——采用结果仍标记为模拟来源；结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文）→ 负向：采用不存在分支序号（分支九）INVALID_STATE_TRANSITION（不消耗版本号）→ RETURN（分支 1 RETURNED，currentBranchId=null）→ 无激活分支上下文采用分支 1（RETURNED 生命周期不变，adopted 幂等，currentBranchId 保持 null——主线当前上下文不变）；simulation_recorded ×2（仅模拟轮登记）；分支操作决策追踪 4 轮 llm_used=false，ADOPT_BRANCH 轨迹 3 轮（采用轮成功 ×2 reasonPrimary=explicit_user_direction、拒绝轮 reasonPrimary=invalid_state_transition）；全部决策追踪 policy_version=policy_v2.1.0

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-5（Minimal Memory）——已由 S2a F-5 迭代实施（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本；src/experience/memory.ts；动态证据 S2A-F5-0001 9/9 案例、14/14 断言），非本回归范围
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）——已由 S2b 迭代实施（S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本；policy_v2.0.0 变更 1–6 / state_machine_v1.5.0；动态证据 S2B-0001 7/7 案例、14/14 断言），非本回归范围
- "采用某分支结论"显式回流操作——**已实施**（BRANCH-ADOPT 案例组；S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决生效——第五分支操作 ADOPT_BRANCH，policy_v2.1.0 变更 1–5；D-03 保留面关闭）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- 模拟语料尾句（S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A 裁决，产品负责人 2026-10-09）：语料已升 synthetic/simulate/v2——尾句对齐 F-4 分支语义（"本轮模拟已建立分支状态（会话内持久，可经后续"如果"轮继续）"）；本回归轮登记新 fixtureId 哈希（分离格式标记 事实——/推断——/假设—— 不变；v1 字节与 S2A-F4-0001 原始运行证据冻结于 git 历史）

## 独立重跑

    cd tools/evidence && npm run s2a-f4   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S2A-F4-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
