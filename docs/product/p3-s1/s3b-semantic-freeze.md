# S3B 语义冻结文本：跨会话分支持久化（S3B-SEMANTIC-FREEZE-01 v1.0.0）

**编号：** S3B-SEMANTIC-FREEZE-01
**版本：** 1.0.0（RULED——语义定义经产品负责人裁决版本化冻结）
**状态：** RULED（产品负责人 2026-10-10 确认 S3-SCOPE-PROPOSAL-01 D-2 选项 A）
**日期：** 2026-10-10
**关联：** S3-SCOPE-PROPOSAL-01 v1.0.0（D-2 选项 A 裁决文本——本冻结文本为其版本化展开）/ S2A-F4-SEMANTIC-FREEZE-01 v1.0.0（分支域基础——本版为其增量）/ S2-BRANCH-REFLOW-DEF-01 v1.0.0（五操作词表 + ADOPT_BRANCH 纪律）/ 07 §3（Session State 纪律——会话级字段）/ S3A-SEMANTIC-FREEZE-01 v1.0.0（同批 S3a 核心能力）/ policy_v2.2.0（本版策略升版载体）

## 1. 语义元素（冻结）

1. **持久化范围：** 分支记录**全部分量**跨会话持久——branchId / experienceId / sessionId（创建会话）/ sourceRound / rounds（模拟轮内容——四元分离）/ version / lifecycle（ACTIVE / RETURNED / ABANDONED 三态契约不变）/ adopted 标记 / createdAt / updatedAt；模拟历史（体验内全部模拟轮次）同为跨会话持久对象（分支记录与模拟历史互为同一事实的两个投影——C6 §5 事件为不可变权威事实，失效仅作用于运行时指针）。
2. **主线上下文会话级不变式：** currentBranchId（当前激活分支指针）保持**会话级**——会话结束（SESSION_ENDED）清空，**不跨会话自动恢复激活分支**；新会话的 WHAT_IF 上下文无激活分支（下一轮 WHAT_IF 模拟自动创建新分支——D-03 选项 A CREATE 纪律不变）。
3. **恢复语义：** 跨会话恢复为**只读加载**——新会话（及任意查询方）可枚举持久分支记录（模拟域快照查询：rounds / branches / currentBranchId）并对存活分支执行五操作；加载本身**不登记任何事件**（模拟域事件 simulation_recorded / simulation_adopted 仅在相应动作发生时登记——纪律不变）。
4. **跨会话操作路径（新会话显式操作五操作）：** 新会话经既有事件提交路径（POST /api/experience/{experienceId}/event——semantic_action=WHAT_IF + 用户输入负载携带分支操作词）对持久分支记录执行 SWITCH / ABANDON / RETURN / ADOPT_BRANCH（CREATE 由模拟轮次自动执行——不变）：
   - 操作识别与词表优先级**不变**（RETURN > SWITCH > ABANDON > ADOPT_BRANCH；须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径——与进程内识别完全一致）；
   - 前置条件（跨会话操作仅在三条件同时满足时放行——任一不满足即按既有纪律拒绝）：① 输入会话为 SESSION_ACTIVE；② 目标体验存在且宿主会话（branchRecord.sessionId 所指创建会话）已 SESSION_ENDED（**不干扰在途会话**——宿主会话仍活跃时跨会话操作拒绝）；③ 目标分支经既有前置校验存活（ABANDONED 分支不可操作——validateBranchOperation 契约不变）；
   - 放宽范围**仅限分支操作路径**：内容生成轮次（通用 SIMULATE 模拟轮 / 创作修改轮 / 纠正轮 / STOP 等）保持严格会话绑定（experience.sessionId === input.sessionId——不变式不变）；跨会话操作仅操作分支记录本身（确定性系统回合——llm_used=false、reasonPrimary=explicit_user_direction，同进程内分支操作纪律）；
   - 已完成（COMPLETED）体验的分支记录仍可跨会话操作（持久分支记录的可操作性不因体验完成而终止——D-2 持久化语义）；版本化提交纪律不变（expected_state_version 校验——S1-12；成功操作版本 +1，失败零消耗）。
5. **会话结束语义（SimulationStore）：** 会话结束（SESSION_ENDED）/ 体验完成（STOP）/ 方向变更（CHANGE_DIRECTION）/ 相邻重复 CREATE 取代——四条路径统一为**endSession 语义**：清空当前激活分支指针（currentBranch），**保留**分支记录与模拟历史（S2 时代 invalidate 全量失效语义经本版废止——纯增量变更，分支操作语义、词表优先级、生命周期契约不变）。
6. **方向变更纪律（沿用 S2 语义，持久化形态）：** 方向变更后旧方向激活分支上下文结束（currentBranch 清空——下一方向 WHAT_IF 首轮自动创建新分支——D-03 CREATE）；旧方向分支记录保留（持久——可枚举可操作——RETURNED 分支经 SWITCH 恢复探索的纪律不变）。

## 2. 裁决选项记录

- 选项 A（采纳）：分支记录跨会话持久——持久化范围 = 分支记录全部分量；主线上下文会话级不变式；恢复为只读加载不登记新事件；新会话可枚举持久分支记录并对其执行五操作。
- 选项 B（未采纳）：仅分支记录元数据持久（不持久化模拟轮内容）——跨会话 ADOPT_BRANCH 不可用（无内容可采纳），须重新模拟。
- 选项 C（未采纳）：仅版本化定义语义（冻结），实施另行授权。
- 裁决：产品负责人（用户本人，PD-15）确认选项 A，2026-10-10（S3-SCOPE-PROPOSAL-01 D-2）。

## 3. 版本化变更（policy_v2.1.0 → policy_v2.2.0）

- 变更 3——跨会话分支持久化：持久化范围 = 分支记录全部分量（id / 内容 / 生命周期 / adopted 标记 / version / rounds / 模拟轮内容）；主线上下文 currentBranchId 会话级不变式（会话结束清空，不跨会话自动恢复激活分支）；恢复为只读加载（不登记新事件）；跨会话操作路径（新会话显式五操作——前置条件：输入会话 ACTIVE + 宿主会话 ENDED + 目标分支存活；放宽仅限分支操作路径，内容轮次会话绑定不变）。
- 变更 4——API 面暴露层不变量（D-3 选项 A——随本版登记，实施于 S3b）：既有端点 semanticAction 枚举扩展为纯暴露层——同一 ExperienceRuntime 单例（getServerRuntime），不改变任何运行时语义、决策追踪、事件契约；WHAT_IF 分支操作经用户输入负载携带分支操作词，与进程内识别完全一致；API 契约（16 号）§11 semanticAction 枚举随本裁决版本化登记。

## 4. 不变式

- 分支操作语义不变（五操作词表、优先级、生命周期契约——S2A-F4 / S2-BRANCH-REFLOW-DEF 冻结文本全量保持——本版为纯增量）。
- "分支模拟结果默认不回流为主线结论"默认语义不变（ADOPT_BRANCH 显式回流是经用户指令的例外通道——纪律不变）。
- 体验阶段轴不变（WHAT_IF 轮次保持 SIMULATION 阶段——13 §15.3；分支为体验状态轴之外的对象化承载——state_machine_v1.5.0 不变）。
- 会话绑定不变式（内容轮次）：体验内容生成 / 创作 / 纠正 / STOP 轮次严格绑定创建会话（experience.sessionId === input.sessionId——S1-01 纪律不变）。
- 版本化提交纪律不变（S1-12——每次合法提交恰好 +1；陈旧拒绝；失败零消耗）。
- 事件契约不变（simulation_recorded / simulation_adopted 事件名与 properties 契约不变——C6 §14；跨会话加载不登记事件）。

## 5. 明确非结论

- 本冻结文本不设置任何 Gate 为 PASS；S2 时代 G5 评测结论（PASSED 无条件）不因本版改变。
- 进程重启可恢复属工程实现细节（存储形态——"持久化经 StateStore 扩展"——不改契约）；当前进程内形态（运行时进程生命周期内持久）为 S3a 实施形态。
- 跨会话操作不授权跨用户体验操作——操作目标仍为同一用户体验对象（experienceId 寻址——单用户产品形态；多用户访问控制属生产部署治理）。
- 真实 LLM 提供方接入与真实用户数据收集不属本版（须隐私六要素全部确定并经产品/安全负责人批准——另行治理；当前默认合成模式不变）。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10（按 S3-SCOPE-PROPOSAL-01 D-2 选项 A 裁决文本展开）。
- 裁决：产品负责人（用户本人，PD-15）——选项 A 确认，2026-10-10（S3-SCOPE-PROPOSAL-01 v1.0.0 §6 签署区；standing authorization 2026-10-10 覆盖实施路径）。
- 登记：decision-register v0.28.0（CR-28 RULED）/ readiness-record v1.38.0。
- 实施登记：P3-S3-IMPL-ITER v1.0.0（2026-10-10——D-2 选项 A 实施完成：分支记录全量跨会话持久（持久化范围 = 分支记录全部分量——id / 内容 / 生命周期 / adopted / version / rounds / 模拟轮内容；WHAT_IF 轮分支状态 STOP 会话结束后 getSimulation 成功，分支记录与模拟历史全量保留）；主线上下文 currentBranchId 会话级不变式（会话结束清空===null，不跨会话自动恢复激活分支——恢复为只读加载，不登记新事件）；跨会话分支操作路径（三前提：WHAT_IF 分类 + 分支操作词识别 / 输入会话 SESSION_ACTIVE / 宿主会话 SESSION_ENDED——放宽仅限分支操作路径：新会话可对已结束宿主会话的持久分支记录执行五操作，会话 B 对已结束会话 A 的体验"如果采用分支一"→ ADOPT_BRANCH 成功，adopted=true）；跨会话内容轮保持严格会话绑定（WHY 内容输入经既有体验提交 → 400 INVALID_REQUEST——experience/session mismatch）；已结束会话上的旧体验内容操作拒绝（INVALID_STATE_TRANSITION——07 §3）；六类数据状态区分纪律成立（Session State / Current State 会话级失效而 Short-term Memory 与轴外分支记录跨会话持久）；产品提交 `f8b374f`（src/experience/{policy,runtime,simulation,http}.ts + app/api/experience/[experienceId]/simulation/route.ts 新增——只读观测）；动态证据：G3-GOLDEN-0001 G12 案例组 4/4 + S2A-F5-0001 BRANCH-PERSISTENCE / CROSS-SESSION 案例 + S2A-F4-0001 10/10 案例、17/17 断言（INPROC-REGRESSION 跨会话持久扩展——S2 时代 D-04 失效不变式经 CR-28 D-2 选项 A 取代）+ S3-API-0001 8/8 案例、13/13 断言（CROSS-SESSION-ADOPT / CROSS-SESSION-CONTENT-NEG / VERSION-CONFLICT）——均退出码 0（只表示各运行断言通过，不设置任何 Gate，E5 §2）；登记：decision-register v0.29.0（CR-28 RULED→IMPLEMENTED）/ readiness-record v1.39.0）
