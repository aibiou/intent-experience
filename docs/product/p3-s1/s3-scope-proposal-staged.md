# S3 范围提案：持久记忆与跨会话状态（S3-SCOPE-PROPOSAL-01 v1.0.0）

**编号：** S3-SCOPE-PROPOSAL-01
**版本：** 1.0.0（RULED——§3 裁决选项文本经产品负责人裁决版本化冻结）
**状态：** RULED（产品负责人 2026-10-10 确认全项 A（D-1…D-5）——语义定义版本化冻结；语义冻结文本签发：S3A-SEMANTIC-FREEZE-01 v1.0.0（长期记忆）/ S3B-SEMANTIC-FREEZE-01 v1.0.0（跨会话分支持久化）；D-3/D-4/D-5 语义随本提案 §3 选项 A 文本冻结）
**日期：** 2026-10-10
**背景：** 产品负责人 2026-10-10 裁决 S3 范围——选项 A（①长期记忆 + ②跨会话分支持久化）+ ③HTTP API 面扩展纳入 + 首页文案更正（产品负责人指令"纳入；更正"）；2026-10-10 产品负责人确认全项 A（D-1…D-5），本提案升版 v1.0.0 RULED
**关联：** PD-23（S2 范围裁决——长期记忆 S2 不启用；跨会话持久化属后续裁决）/ 07 号契约 §5 Long-term Memory / S2A-F5-SEMANTIC-FREEZE-01 v1.0.0（D-04/D-05）/ S2-BRANCH-REFLOW-DEF-01 v1.0.0（D-04 选项 A）/ 16 号契约 API Contract V1 §11（体验流式 API）/ 14 号契约 §8（VERIFY→SEARCH/ANSWER 路由）/ P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代 G5 评测 PASSED 无条件，2026-10-10）

## 1. 事实取证

- S2 时代全部关闭：PD-23 九项（F-1…F-5 / G-1…G-4）+ S2 时代 G5 独立评测 PASSED（无条件，2026-10-10——P3-S2-G5-WORKSHEET-01 v0.3.0，16 项 = 12 PASS + 1 N/A）。
- 延期项登记（P2 / S2 关闭时点）：
  - 完整 G08 持久 Memory 语义 DEFERRED TO S2（PD-07）→ S2 裁决"长期记忆（偏好画像）S2 不启用"（PD-23 影响行；S2A-F5-SEMANTIC-FREEZE-01 D-05 选项 A——负向不变式：长期记忆写入路径不存在）。
  - 跨会话分支持久化：S2 裁决"会话内持久、会话结束失效"（S2-BRANCH-REFLOW-DEF-01 D-04 选项 A）；跨会话持久化不属 S2 范围（P3-S2-IMPL-ITER-ADOPT §7 注记）。
  - S2 能力 HTTP 不可达：HTTP API 面为 S1 首体验切片（`app/api/`——stream 请求体 semanticAction 枚举 DIRECT_ANSWER / WHY / STOP，16 号契约 §11）；S2 能力（WHAT_IF 分支操作五操作 / 纠正 / 记忆 / 创作域顶层动作 deepen-simplify-reframe / SEARCH）在运行时核心实现，由证据执行器进程内行使（`src/experience/server-runtime.ts` 设计注记："进程内证据形态由执行器直接构造 ExperienceRuntime 并注入内存汇，不经本模块"）。
  - 首页文案过时（`app/page.tsx`："no Feed, no Creation, no full Memory; CREATE / SEARCH disabled"——S1 时代边界表述，与 S2 已实施范围不符；产品负责人 2026-10-10 指令更正）。
- 既有设施（可复用，非新建）：
  - 记忆域（`src/experience/memory.ts`）：MemoryRecord / 生命周期 IN_USE → DECAYING → EXPIRED（WITHDRAW → EXPIRED + 撤回留痕 + 删除审计）/ 衰减（MEMORY_DECAY_K / MEMORY_DECAY_THRESHOLD / MEMORY_EXPIRE_THRESHOLD）/ MEMORY_RETENTION_MS = 180 天（6 个月——PD-23 已裁决的保留期已落地为常量）/ 事件 memory_recorded / memory_corrected / memory_withdrawn / memory_expired（C6 §14 派生）/ 写入经 Runtime 单一写入者（S2 已裁决）。
  - 分支域（`src/experience/simulation.ts`）：BranchRecord 五分量（id / 内容 / 生命周期 ACTIVE-RETURNED-ABANDONED / version / rounds）+ adopted 附加标记（幂等）+ 五操作词表（CREATE / SWITCH / ABANDON / RETURN / ADOPT_BRANCH——词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH）+ simulation_adopted 事件（properties 含 branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact）。
  - 07 号契约 §5 长期记忆门槛：V1 只允许保存——A 类 明确表达的长期偏好（source=explicit，confidence=1.0）/ B 类 用户明确要求记住（最高置信度候选）/ C 类 多次稳定出现且具长期价值（系统仅产生 candidate_long_term_preference——候选 ≠ 已保存；V1 不允许仅凭行为自动升级为永久用户画像）；"长期记忆永远不是最高优先级"；"不应该被用户感觉成系统在给我画像"。
  - PD-23 已裁决约束（长期记忆启用时生效）：默认保留 6 个月后自动删除；写入经 Runtime 单一写入者。

## 2. 语义空缺分析（约束自有 frozen 源派生）

- G1：长期记忆写入路径不存在（S2 D-05 负向不变式）——S3 启用须版本化定义写入门槛 / 优先级链位置 / 保留与删除 / 用户主权 / 事件属性扩展。
- G2：分支记录生命周期绑定会话（StateStore 会话级——会话结束即失效）——跨会话持久化须版本化定义持久化范围 / 主线上下文会话级不变式 / 恢复语义。
- G3：S2 动作 HTTP 不可达——API 面扩展须版本化定义暴露层不变量（不改变任何运行时语义）。
- G4：首页文案与已实施范围不符——纯文案更正（无语义变更）。

## 3. 裁决选项（产品负责人逐项裁决）

### D-1 长期记忆语义（G08 完整语义）

- **选项 A（推荐，实现方建议）：** 启用长期记忆——写入门槛按 07 号契约 §5：A 类（明确表达的长期偏好）与 B 类（用户明确要求记住）经用户显式表达即保存（source=explicit；confidence=1.0）；C 类（多次稳定出现、且具有长期价值）仅产生 candidate_long_term_preference（候选 ≠ 已保存——V1 不允许仅凭行为自动升级为永久用户画像）；优先级链：长期记忆永远不是最高优先级（07 §5——位于短期记忆之后）；保留：默认保留 6 个月后自动删除（PD-23 已裁决——复用 MEMORY_RETENTION_MS = 180 天，到期 EXPIRE + memory_expired + 删除审计）；写入经 Runtime 单一写入者（PD-23 已裁决）；用户主权：WITHDRAW（→EXPIRED + 撤回留痕 + 删除审计，memory_withdrawn）与 CORRECT（memory_corrected）复用 S2 记忆域既有生命周期与事件；不主动画像（07 §5——系统不主动归纳用户画像，仅 A/B 类经显式表达保存）；事件：复用 memory_recorded，properties 增 memory_class=long_term / source / confidence（C6 §14 派生纪律——属性扩展不新增事件名）。
- **选项 B：** 仅 A 类启用（B 类 / C 类候选处理另行裁决）。
- **选项 C：** 仅版本化定义语义（冻结），实施另行授权。

### D-2 跨会话分支持久化

- **选项 A（推荐，实现方建议）：** 分支记录跨会话持久——持久化范围：分支记录全部分量（id / 内容 / 生命周期 ACTIVE-RETURNED-ABANDONED / adopted 标记 / version / rounds / 模拟轮内容）；主线当前上下文（currentBranchId）保持会话级——会话结束清空，不跨会话自动恢复激活分支（新会话须显式 SWITCH / RETURN / ADOPT_BRANCH）；恢复语义：新会话可枚举持久分支记录并对其执行五操作（ADOPT_BRANCH 采纳内容经独立 CREATE 提交纳入作品的纪律不变）；持久化经 StateStore 扩展（Runtime 单一写入者；进程重启可恢复——存储形态属工程实现细节，不改契约）；分支操作语义、词表优先级、生命周期契约不变（纯增量）；跨会话恢复为只读加载，不登记新事件（模拟域事件 simulation_adopted 仅在采纳时登记——纪律不变）。
- **选项 B：** 仅分支记录元数据持久（不持久化模拟轮内容）——跨会话 ADOPT_BRANCH 不可用（无内容可采纳），须重新模拟。
- **选项 C：** 仅版本化定义语义（冻结），实施另行授权。

### D-3 HTTP API 面扩展（S2 动作经 API 可达）

- **选项 A（推荐，实现方建议）：** 既有端点语义扩展——`/api/experience/stream` 的 semanticAction 枚举扩展：创作域顶层动作（deepen / simplify / reframe）经创作会话路由承载（operation + direction 字段，G-1 既有语义不变）；WHAT_IF 分支操作经用户输入负载携带分支操作词（/采用/、/采纳/——词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH，须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径——与进程内识别完全一致）；CORRECTION / RESTORE_PREVIOUS_VERSION 经既有纠正路径；记忆 WITHDRAW 经既有记忆事件路径；SEARCH 为既有执行路径（14 §8 VERIFY→SEARCH/ANSWER 路由）；暴露层不变量：API 面扩展不改变任何运行时语义、决策追踪、事件契约——同一 ExperienceRuntime 单例（getServerRuntime）；API 契约（16 号）§11 semanticAction 枚举随本裁决版本化登记。
- **选项 B：** 新增 REST 端点（`/api/experience/[id]/branch` 等）——结构化但新增契约面，工作量大。
- **选项 C：** 暂不扩展，仅文档登记不可达状态。

### D-4 首页文案更正

- 无选项（纯更正，产品负责人 2026-10-10 指令"更正"）：`app/page.tsx` 文案更正为当前范围（移除 S1 时代 "no Feed, no Creation, no full Memory; CREATE / SEARCH disabled" 过时表述）；无语义变更。**已即时执行（2026-10-10——随本提案同批提交，产品负责人指令直接授权）**。

### D-5 迭代划分

- **选项 A（推荐，实现方建议）：** 分批——S3a 核心能力（D-1 长期记忆 + D-2 跨会话分支持久化）→ 动态证据 + 独立评测 → S3b 暴露层（D-3 API 面扩展 + D-4 文案更正）→ 动态证据 + 独立评测（沿用 PD-23 选项 B 分批纪律）。
- **选项 B：** 单批一次实施（D-1…D-4 同一迭代）。

## 4. 选项 A 实施影响

- 策略升版：policy_v2.1.0 → policy_v2.2.0（变更 1–4：①长期记忆启用与写入门槛（A/B 类经显式表达保存；C 类仅候选——候选 ≠ 已保存）；②优先级链与保留纪律（长期记忆永远不是最高优先级；默认保留 6 个月后自动删除；写入经 Runtime 单一写入者）；③跨会话分支持久化（持久化范围 = 分支记录全部分量；主线上下文会话级不变式；恢复为只读加载）；④API 面暴露层不变量（同一运行时实例——不改变任何运行时语义））。
- 状态机：state_machine_v1.5.0 不变——长期记忆与跨会话分支为既有轴外域（记忆域 / 分支域），不新增体验轴触发器（同 F-2 D-05 / ADOPT_BRANCH 纪律）。
- 事件契约：C6 事件名不变（memory 域事件既有复用；simulation_adopted 既有）；memory_recorded properties 增 memory_class / source / confidence（C6 §14 派生——属性扩展不新增事件名）；API 契约（16 号）§11 semanticAction 枚举扩展随本裁决登记。
- 动态证据：S2A-F5 回归扩展（长期记忆案例组——A/B/C 三类门槛、优先级、6 个月保留、WITHDRAW/CORRECT 主权）/ S2A-F4 回归扩展（跨会话持久化案例组——会话结束保留、新会话枚举与五操作、主线上下文会话级、ADOPT_BRANCH 跨会话采纳）/ G3-GOLDEN-0001 扩展（G11 长期记忆案例组 + G12 跨会话分支案例组）/ S2B-0001 绑定新基线 / API 面端到端证据（HTTP 形态——S2 动作经 API 可达）。
- 迭代记录：P3-S3A-IMPL-ITER / P3-S3B-IMPL-ITER；CR 登记：CR-28（本提案）。

## 5. 明确非结论

- 本提案不设置任何 Gate 为 PASS；S2 时代 G5 评测结论（PASSED 无条件）不因本提案改变。
- 长期记忆启用不改变"不主动画像"边界（07 §5）；C 类候选不自动保存（V1 不允许仅凭行为自动升级为永久用户画像）。
- 跨会话持久化不改变"分支模拟结果默认不回流为主线结论"默认语义（ADOPT_BRANCH 显式回流纪律不变）。
- API 面扩展为暴露层——不改变任何运行时语义（进程内路径与 HTTP 路径为同一运行时实例）。
- 真实 LLM 提供方接入与真实用户数据收集不属本提案（须隐私六要素全部确定并经产品/安全负责人批准——另行治理；当前默认合成模式不变）。

## 6. 签署区（裁决已填写）

- 起草：工程负责人角色（代理，Codex），2026-10-10（v0.1.0 staged）。
- 裁决：产品负责人（用户本人，PD-15）——**确认全项 A（D-1…D-5），2026-10-10**：
  - D-1 长期记忆语义：选项 A（启用——07 号契约 §5 A/B 类经显式表达保存；C 类仅候选）；
  - D-2 跨会话分支持久化：选项 A（分支记录全量跨会话持久；主线上下文会话级不变式）；
  - D-3 HTTP API 面扩展：选项 A（既有端点 semanticAction 枚举扩展——纯暴露层）；
  - D-4 首页文案更正：已即时执行（2026-10-10）；
  - D-5 迭代划分：选项 A（分批——S3a 核心能力 → S3b 暴露层）。
- 裁决后登记：decision-register v0.28.0（CR-28 STAGED→RULED）+ readiness-record 升版 v1.38.0 + 语义冻结文本签发（S3A-SEMANTIC-FREEZE-01 v1.0.0 / S3B-SEMANTIC-FREEZE-01 v1.0.0）→ 授权（产品负责人 standing authorization 2026-10-10"持续推进产品，完成，需要我签署和授权的，允许"——覆盖 S3a 核心能力实施路径）→ 实施 → 动态证据 + 独立评测。
- §3 裁决选项文本（选项 A 各条）经本裁决版本化冻结——实施不得偏离；偏离须另行裁决。
