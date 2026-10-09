# S2b 语义冻结填写项（体验动作扩展：DEEPEN / SIMPLIFY / REFRAME / Search + First Experience 完整呈现 + 更完整 Golden Suite）

**编号：** S2B-SEMANTIC-FREEZE-01
**版本：** 1.0.0（2026-10-09：产品负责人裁决 + 签署——§2 裁决区 D-01…D-05 + 附列项（VERIFY）全项裁决完成（全项选项 A），§3/§4 版本化变更文本冻结（分层），C1/C2/C3 Steward 确认完成（G1 式纪律）；S2b 语义定义版本化冻结完成（PD-23 §6 义务履行）；S2b 实施授权待另行签发（P3-S2B-IMPL-AUTH-01，前置依赖：F-5 关闭））**版本：** 0.1.0（2026-10-09：staged 待产品负责人裁决 D-01…D-05）
**状态：** FROZEN（2026-10-09 产品负责人裁决 + 签署——D-01…D-05 + 附列项全项选项 A；§3/§4 变更文本冻结：policy_v2.0.0 / state_machine_v1.5.0）；S2b 语义定义版本化冻结完成（PD-23 §6）；S2b 实施授权待另行签发（P3-S2B-IMPL-AUTH-01，staged 待签发；前置依赖：F-5 关闭）；冻结后实施不得偏离 §3/§4
**背景：** S2 范围经 PD-23 裁决（选项 B 分批，S2-SCOPE-PROPOSAL-01 §5/§6）：S2a 核心能力收束（F-1…F-4 已关闭；F-5 staged 待裁决，S2A-F5-SEMANTIC-FREEZE-01 v0.1.0）；S2b 体验动作扩展（S1 规范 §37：First Experience 完整呈现；DEEPEN；SIMPLIFY；REFRAME；Search；更完整的 Golden Suite）。PD-23 §6 与授权 §5.7：S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结（C3 行为语义空缺不得由编码者补写）。本填写项将 S2b 语义定义裁决提案 staged，供产品负责人逐项裁决。
**依据：** S1 规范 §11（保留动作：DEEPEN / SIMPLIFY / REFRAME / CREATE / MODIFY / SEARCH 不得自动启用）/ §12（语义动作优先级）/ §37（S1→S2 范围）；PD-23（S2-SCOPE-PROPOSAL-01 v1.2.0 §4.1：策略升 policy_v2.0.0，优先级链扩展后须重冻结）；14 号契约 §7（Policy Action Taxonomy V1——**SEARCH 不是用户体验类型，而是一种内部能力动作**）/ §8（Semantic Action → Policy Action Mapping：DEEPEN→DEEPEN / SIMPLIFY→SIMPLIFY / REFRAME→REFRAME 恒等映射；VERIFY→SEARCH / ANSWER）；08 号契约 §五（Creation Runtime 状态机：USER_FEEDBACK → MODIFY / ADD / REMOVE / REFRAME / SIMPLIFY / DEEPEN / COMPLETE）/ §十（Modification 操作域与自然语示例——"简单一点"→SIMPLIFY、"做得更有科幻感"→RESTYLE、"太难了"→REBALANCE）；E2 §5（第一体验入口）/ §6（六阶段结构 Curiosity→Understanding→Simulation→Branch→Creation→Completion）/ §7（P3 必须冻结的 ExperienceState）/ §8（Allowed Action）/ §9（明确不冻结内容）；F-2 D-04（补丁操作域 {add, remove, modify} 冻结；REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 作 modify 子型；SIMPLIFY / DEEPEN / REFRAME 显式 DEFERRED 至 S2b）；P3-S2-IMPL-AUTH-01 v1.2.0 §4/§5.7

## 1. 语义完备性评估

**结论：S2b 语义在 frozen 源中部分完备——动作身份 / 映射 / 定位可机械派生，承载层与范围细节为语义空缺。**

**第一层（可机械派生）：**

| # | 语义元素 | frozen 源 | 派生方式 |
|---|---|---|---|
| 1 | DEEPEN / SIMPLIFY / REFRAME 语义动作身份与恒等映射 | 14 §8 映射表 | 直接转写（DEEPEN→DEEPEN / SIMPLIFY→SIMPLIFY / REFRAME→REFRAME） |
| 2 | SEARCH 定位（内部能力动作，非用户体验类型） | 14 §7 注记 | 直接转写（负向纪律：不得作为面向用户的体验类型启用） |
| 3 | VERIFY → SEARCH / ANSWER 路由 | 14 §8 映射表 | 直接转写（VERIFY 类输入的执行路径之一） |
| 4 | 创作域操作语义（深入 / 简化 / 换角度；自然语示例） | 08 §十 | 直接转写（操作识别词表 → D-01 选项 A 说明；词表为确定性实现细节，model on F-4 D-03 纪律） |
| 5 | 第一体验冻结面（Experience Type / Trigger / Initial State / Allowed Actions / State Transitions / Completion / Exit / Interrupt / Policy / Evaluation） | E2 §5/§7/§8 | 直接转写（已冻结契约不变；呈现补全 → D-04） |
| 6 | 不冻结内容边界（完整推荐系统 / Memory Center / 复杂画像 / 社交 / Feed / 关注 / 点赞 / 评论 / 排行榜 / Trending / Marketplace / 多 Agent / RL Ranking / 长期自动推荐 / 完整创作 IDE / 复杂项目管理 / 完整作品版本管理 UI / 商业化 / 通知系统） | E2 §9 | 直接转写（负向边界） |
| 7 | 优先级链扩展义务（扩展后须重冻结：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > …） | PD-23（S2 范围提案 §4.1） | 直接转写（链形态 → D-05） |

**第二层（语义空缺——frozen 源无定义或两处定义须统一）：**

| # | 空缺元素 | 核查结论 | 处置 |
|---|---|---|---|
| 8 | DEEPEN / SIMPLIFY / REFRAME 的承载层 | S1 §11 列为保留语义动作；14 §8 以语义动作行给恒等映射；08 §五/§十 将其定义于创作运行时 USER_FEEDBACK 分支与修改操作域；F-2 D-04 将其 DEFERRED 时未定承载层 | 须产品负责人版本化裁决 → D-01 |
| 9 | SEARCH 启用形态 | S1 §11 列为保留动作；14 §7 明确定位为内部能力动作；E2 §8 列入允许动作表——"允许动作"与"用户体验类型"两级须区分 | 须产品负责人版本化裁决 → D-02 |
| 10 | SEARCH 作用面（检索范围） | frozen 源无检索范围定义（14 号契约仅给定位与路由） | 须产品负责人版本化裁决 → D-03 |
| 11 | First Experience 完整呈现的范围 | S1 §37 明文"First Experience 完整呈现"；S1 已实施核心垂直切片路径；E2 冻结的是契约面而非最终视觉稿（E2 §5"这只是 Presentation Example"） | 须产品负责人版本化裁决 → D-04 |
| 12 | policy_v2.0.0 精确文本与优先级链扩展形态 | S2 范围提案 §4.1 仅给方向（策略升 policy_v2.0.0；优先级链扩展后须重冻结） | 须产品负责人版本化裁决 → D-05 |

开放点（裁决区 §2）：D-01…D-05。

## 2. 裁决项（产品负责人填写区）

### D-01 DEEPEN / SIMPLIFY / REFRAME 的启用形态与承载层

**背景：** 三动作在 frozen 源中同时出现于语义动作层（S1 §11 / 14 §8）与创作运行时操作层（08 §五/§十）。F-2 D-04 冻结补丁操作域 {add, remove, modify} 时将其 DEFERRED 至 S2b，承载层未定。

**选项 A（推荐·顶层语义动作启用 + 创作域顶层补丁操作承载）：** DEEPEN / SIMPLIFY / REFRAME 启用为顶层语义动作（分类器识别词表 + 14 §8 恒等映射，policy_v2.0.0）；执行语义承载于创作域——作为与 add / remove / modify 同级的顶层补丁操作（08 §十 将三动作与 MODIFY / ADD / REMOVE 同级列举；F-2 将 REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 降为 modify 子型，是因其语义可归约为局部修改，而 DEEPEN / SIMPLIFY / REFRAME 为整体验方向性操作——深入 / 简化 / 换角度——不可归约为局部修改）。操作识别为确定性规则词表（实现细节，model on F-4 D-03 纪律；自然语示例锚点：08 §十 "简单一点"→SIMPLIFY、"太难了"→REBALANCE（modify 子型）、"做得更有科幻感"→RESTYLE（modify 子型））。非创作会话内的 DEEPEN / SIMPLIFY / REFRAME 输入按升级规则处理（无创作对象可作用，C3 升级纪律）。

**选项 B（降级为 modify 子型）：** 三动作作 modify 的 change 子型（同 REPLACE / TUNE 纪律）。问题：08 §十 将其与 MODIFY / ADD / REMOVE 同级列举，14 §8 给予独立恒等映射行——降级与 frozen 源列举层级冲突——不推荐。

**选项 C（语义动作启用 + 独立执行路径不经创作域）：** 问题：08 §五/§十 将三动作定义于创作运行时内（USER_FEEDBACK 分支与修改操作域）；独立路径无 frozen 源——不可选。

**裁决区（产品负责人 2026-10-09 填写）：** **选项 A（顶层语义动作启用 + 创作域顶层补丁操作承载）**。理由：14 §8 恒等映射与 08 §十 同级列举为 frozen 源层级；DEEPEN / SIMPLIFY / REFRAME 为整体验方向性操作（深入 / 简化 / 换角度），不可归约为局部修改（F-2 将 REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 降为 modify 子型的归约纪律不适用于三动作）；操作识别为确定性规则词表（model on F-4 D-03 纪律）；选项 B 与 frozen 源列举层级冲突，选项 C 无 frozen 源。日期：2026-10-09。

### D-02 SEARCH 的启用形态

**背景：** S1 §11 将 SEARCH 列为保留动作，S1 §37 明文 S2 加入 Search；但 14 §7 明确定位"SEARCH 不是用户体验类型，而是一种内部能力动作"，14 §8 仅以 VERIFY → SEARCH / ANSWER 路由引用之。E2 §8 允许动作表含 SEARCH（与 STOP / CHANGE_EXPERIENCE 并列最高优先级控制动作之外的一般允许动作）。

**选项 A（推荐·内部能力动作启用）：** SEARCH 作为内部策略动作启用（policy_v2.0.0 PolicyAction 域已有 SEARCH，14 §7  taxonomy 不变）；执行路径：VERIFY 类输入经映射路由至 SEARCH / ANSWER（14 §8）；检索作用面见 D-03；不启用为面向用户的语义动作（分类器不将普通输入分类为 SEARCH 语义动作——14 §7 纪律）；E2 §8 允许动作表中的 SEARCH 按"内部能力动作"解释（允许动作表是能力清单，非语义动作启用清单）。

**选项 B（用户面语义动作启用）：** 将 SEARCH 同时启用为面向用户的语义动作（分类器可分类出 SEARCH 语义动作）。问题：与 14 §7"SEARCH 不是用户体验类型"纪律直接冲突——不可选。

**选项 C（本批次不启用）：** 问题：与 S1 §37 明文（S2 加入 Search）冲突——不可选。

**裁决区（产品负责人 2026-10-09 填写）：** **选项 A（内部能力动作启用）**。理由：14 §7 明文“SEARCH 不是用户体验类型，而是一种内部能力动作”；14 §8 VERIFY → SEARCH / ANSWER 路由为既有执行路径；E2 §8 允许动作表按“内部能力动作”解释；选项 B 与 14 §7 纪律直接冲突，选项 C 与 S1 §37 明文冲突。日期：2026-10-09。

### D-03 SEARCH 的作用面（检索范围）

**背景：** SEARCH 启用后须界定检索范围。frozen 源无定义。

**选项 A（推荐·体验内容与创作对象内检索，只读）：** SEARCH 检索当前体验内容 / 创作对象 / 会话内上下文（只读能力，不改变体验、不触发产品动作）；跨会话记忆检索属 F-5 记忆域 L5 检索（07 §20 纪律，Memory Retrieval 流程），不经 SEARCH 动作；E2 §9 不冻结内容边界不变（无推荐系统 / Feed / Trending 等）。

**选项 B（外部 / 全网检索）：** 问题：引入外部网络出口与外部依赖（授权 §5.1 隐私护栏；SEAM-INERT 纪律下运行时无网络出口先例）——不可选。

**选项 C（全量记忆 + 体验内容检索）：** 问题：与 07 §20"Experience Runtime 不允许每次把所有 Memory 全部塞进 Context"冲突——不可选。

**裁决区（产品负责人 2026-10-09 填写）：** **选项 A（体验内容与创作对象内检索，只读）**。理由：只读能力不改变体验（07 §22 纪律延伸）；跨会话记忆检索属 F-5 记忆域 L5 检索（07 §20），不经 SEARCH 动作；选项 B 引入外部网络出口（授权 §5.1 隐私护栏；SEAM-INERT 无网络出口先例），选项 C 与 07 §20“不允许每次把所有记忆全部塞进上下文”冲突。日期：2026-10-09。

### D-04 First Experience 完整呈现的范围

**背景：** S1 §37 明文 S2 加入"First Experience 完整呈现"。S1 已实施核心垂直切片（首体验主路径）；E2 冻结的是契约面（ExperienceType / Trigger / Initial State / Allowed Actions / State Transitions / Completion / Exit / Interrupt / Policy / Evaluation），明确"这只是 Presentation Example，不是最终视觉稿"（E2 §5）。

**选项 A（推荐·呈现路径补全，契约面不变）：** 完整呈现 = 入口流程（问题呈现 → 开始探索 → 换一个，E2 §5 形态）+ 六阶段逐阶段呈现（Curiosity / Understanding / Simulation / Branch / Creation / Completion，E2 §6）+ 完成 / 退出 / 中断完整流程（E2 §7 冻结面）；E2 §7 已冻结的 ExperienceState / Allowed Actions / State Transitions 不变——不改契约，只补全运行时呈现路径；视觉样式不在冻结范围（E2 §5 纪律）。

**选项 B（重新定义第一体验）：** 问题：E2 为已冻结提案（"首个体验冻结提案"），重新定义违反冻结纪律——不可选。

**选项 C（仅入口文案 / 视觉微调）：** 问题：与 S1 §37"完整呈现"范围不符——不推荐。

**裁决区（产品负责人 2026-10-09 填写）：** **选项 A（呈现路径补全，契约面不变）**。理由：E2 为已冻结提案，契约面（Experience Type / Trigger / Initial State / Allowed Actions / State Transitions / Completion / Exit / Interrupt / Policy / Evaluation）不变；完整呈现 = 入口流程 + 六阶段逐阶段呈现 + 完成 / 退出 / 中断完整流程；E2 §5 明文视觉样式不在冻结范围；选项 B 违反冻结纪律，选项 C 与 S1 §37“完整呈现”范围不符。日期：2026-10-09。

### D-05 策略版本与优先级链扩展形态

**背景：** S2 范围提案 §4.1 已裁决方向：策略升 policy_v2.0.0（SemanticAction / PolicyAction 扩展；优先级链扩展后须重冻结：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > …）。精确链形态与 state_machine 版本须裁决。F-5 冻结后 policy_v1.5.0 / state_machine_v1.4.0 为 S2b 升版基线。

**选项 A（推荐·policy_v2.0.0 + 优先级链扩展冻结 + state_machine_v1.5.0）：** SemanticAction 域启用 DEEPEN / SIMPLIFY / REFRAME（SEARCH 不入 SemanticAction 域——D-02 选项 A 纪律；VERIFY 是否启用为语义动作另列裁决区说明）；PolicyAction 域确认 SEARCH 内部能力定位（14 §7 taxonomy 已含，无新增）；优先级链扩展冻结：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN / SIMPLIFY / REFRAME（创作域方向性操作同级）> WHY / WHAT_IF / DIRECT_ANSWER（解释层）……完整链文本随 §3 草案冻结；state_machine 升 state_machine_v1.5.0（创作域补丁操作域扩展 {add, remove, modify, deepen, simplify, reframe} + SEARCH 能力纪律）。

**选项 B（逐动作切片升版）：** 问题：PD-23 裁决 S2b 为一批次（选项 B 分批——S2b 体验动作扩展），逐切片升版与批次裁决冲突——不推荐。

**选项 C（不升版直接实施）：** 问题：违反版本化变更纪律（授权 §4；G1 契约权威冻结纪律）——不可选。

**裁决区（产品负责人 2026-10-09 填写）：** **选项 A（policy_v2.0.0 + 优先级链扩展冻结 + state_machine_v1.5.0）**。理由：S2 范围提案 §4.1 已裁决方向（策略升 policy_v2.0.0；优先级链扩展后须重冻结）；S2b 为 PD-23 裁决的一批次，逐切片升版与批次裁决冲突；版本化变更纪律（授权 §4）要求升版冻结；选项 B 与 PD-23 批次裁决冲突，选项 C 违反版本化变更纪律。日期：2026-10-09。

**附列裁决区（VERIFY 语义动作）：** 14 §8 映射表含 VERIFY → SEARCH / ANSWER，但 VERIFY 未列入 S1 §11 保留动作清单。VERIFY 是否随 S2b 启用为语义动作：**选项 A（推荐）：不启用——SEARCH 以内部能力动作启用即可覆盖 14 §8 路由（VERIFY 类输入按现有 WHY / DIRECT_ANSWER 解释层处理，SEARCH 作为内部能力在这些路径中被调用）；选项 B：启用 VERIFY 为语义动作（须同时定义其分类器词表与优先级链位置）。** 本附列项与 D-02 联动裁决。**附列裁决（产品负责人 2026-10-09 填写）：** **选项 A（不启用 VERIFY 语义动作）**。理由：SEARCH 以内部能力动作启用即可覆盖 14 §8 路由（VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层处理，SEARCH 能力在这些路径中被调用）；VERIFY 未列入 S1 §11 保留动作清单，启用须同时定义分类器词表与优先级链位置——本批次不引入未定义语义动作。日期：2026-10-09。

## 3. policy_v2.0.0 变更文本草案（分层；D-01…D-05 全项选项 A 时生效）

1. SemanticAction 域扩展：启用 DEEPEN / SIMPLIFY / REFRAME（14 §8 恒等映射）；SEARCH 不入 SemanticAction 域（内部能力动作，14 §7）；VERIFY 不启用（附列裁决区选项 A）。
2. PolicyAction 域：确认 SEARCH 为内部策略动作（14 §7 taxonomy 既有，无新增）；VERIFY 类输入按既有解释层路径处理，SEARCH 能力在这些路径内被调用（14 §8 路由纪律）。
3. 创作域补丁操作域扩展：{add, remove, modify, deepen, simplify, reframe}（F-2 D-04 冻结域 + D-01 选项 A 三动作）；modify 子型域不变（{REPLACE, TUNE, REBALANCE, RENAME, RESTYLE}）。
4. 优先级链扩展冻结：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER（同层解释顺序纪律不变，model on S1 §12）。
5. 非创作会话保护：DEEPEN / SIMPLIFY / REFRAME 输入在无创作对象时按升级规则处理（C3 纪律，model on F-2/F-3 创作会话路由保护）。
6. SEARCH 能力纪律：只读、不改变体验、不触发产品动作；无外部网络出口；检索范围限当前体验内容 / 创作对象 / 会话内上下文（D-03 选项 A）。

## 4. state_machine_v1.5.0 变更文本草案（分层；D-01/D-05 选项 A 时生效）

1. 创作域子状态机：补丁操作域扩展为 {add, remove, modify, deepen, simplify, reframe}（轴外承载纪律不变，F-2 D-02）；每次合法补丁提交版本 +1（S1-12 不变式）。
2. SEARCH 能力状态纪律：SEARCH 为无状态只读能力调用，不产生体验状态迁移、不产生创作域补丁（state_machine 无 SEARCH 迁移行——能力纪律经 policy_v2.0.0 §6 承载）。
3. First Experience 呈现路径：六阶段呈现迁移（Curiosity → Understanding → Simulation → Branch → Creation → Completion）为已有体验阶段轴的呈现补全（E2 §6；13 号状态机阶段轴不变）。

## 5. 实施与证据计划大纲（签署后执行；S2b 实施授权另行签发）

1. 实施文件（预计）：`classifier.ts`（DEEPEN / SIMPLIFY / REFRAME 识别词表）；`policy.ts`（policy_v2.0.0 文本 + 优先级链扩展）；`creation.ts`（补丁操作域扩展三操作）；`state-machine.ts`（state_machine_v1.5.0）；`runtime.ts`（SEARCH 能力集成——只读检索）；First Experience 呈现路径（D-04 选项 A 范围）；`events.ts`（如需事件词表扩展——DEEPEN / SIMPLIFY / REFRAME 补丁事件经既有创作域事件承载，SEARCH 只读无事件）。
2. 动态证据 S2B-0001（E5 §3/§4）：案例面——DEEPEN / SIMPLIFY / REFRAME 正常路径（创作会话内补丁 + 版本 +1 + 事件）、非创作会话升级路径（负向）、SEARCH 内部能力（VERIFY 类输入路由 + 只读不变式 + 无外部出口）、First Experience 呈现路径（六阶段 + 入口流程 + 完成 / 退出 / 中断）、优先级链（STOP / CHANGE_DIRECTION 优先于新动作）。
3. 更完整 Golden Suite：S2b 案例纳入 G3-GOLDEN-0001 回归基准（policy_v2.0.0 / state_machine_v1.5.0 断言同步；G3-E-3 双遍 SHA256SUMS 纪律不变）。
4. 版本矩阵：policy_v2.0.0 / state_machine_v1.5.0 / frozenDecisions D-01…D-05 / 黄金回归绑定（E5 §3）。
5. 前置依赖：F-5 冻结与实施完成（policy_v1.5.0 / state_machine_v1.4.0 为升版基线）。

## 6. 签署区

| 角色 | 裁决 / 签署 | 结论 | 日期 |
|---|---|---|---|
| 产品负责人（用户本人，PD-15） | D-01…D-05 + 附列项（VERIFY）逐项裁决（已填写） | 全项选项 A（2026-10-09 裁决） | 2026-10-09 |
| 产品负责人（用户本人，PD-15） | 已签署（2026-10-09） | FROZEN——§3/§4 变更文本冻结（policy_v2.0.0 / state_machine_v1.5.0），S2b 语义定义版本化冻结完成（PD-23 §6 义务履行）；S2b 实施授权待另行签发（P3-S2B-IMPL-AUTH-01，staged 待签发；前置依赖：F-5 关闭） | 2026-10-09 |
| C1 / C2 / C3 Steward | Steward 确认完成（G1 式纪律；2026-10-09） | 确认 | 2026-10-09 |

**顺序纪律：** S2b 实施授权须在 S2a（F-5）关闭后或经产品负责人另行裁决批次并行；本冻结签署不解除任何 Gate 纪律（授权 §5.3：任何 Gate 不因代码存在、测试全绿或演示成功而 PASS）。
