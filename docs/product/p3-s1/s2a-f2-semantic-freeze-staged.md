# S2a F-2 语义冻结填写项（G04 完整 Creation 语义）

**编号：** S2A-F2-SEMANTIC-FREEZE-01
**版本：** 0.1.0（staged——填写项待裁决）
**状态：** STAGED——待产品负责人裁决（§2 裁决区）与冻结签署（§6）；冻结 + C1/C2/C3 Steward 确认（G1 式纪律，授权 §4）后方可进入实施与首个动态证据运行
**背景：** S2a F-1（OBL-01）已关闭（HEAD `71475ba`，S2A-OBL-01-0001 PASSED，债务 D-01 关闭）；F-2 = 完整 G04 Creation 语义实施（P3-S2-IMPL-AUTH-01 §3.2：CREATION 完整阶段链；多轮分支；持久创作状态；版本化提交与 stale 拒绝不变式保持）
**依据：** P3-S2-IMPL-AUTH-01 v1.1.0 §2(1)/§3 F-2/§4；PD-23（S2-SCOPE-PROPOSAL-01 v1.2.0 §5 裁决区）；E2 Stage 5（Creation 编排）；08 号契约（Experience Creation Runtime V1）§3–§28；13 号状态机规范 §15.4/§15.5/§16–§23；S1 规范 §37（P3-S2 九项）；C3-SEMANTIC-GAP-REGISTER-01（G-1…G-7 空缺纪律）

## 1. 语义完备性评估

**结论：G04 完整 Creation 语义在 frozen 源中完备——全部语义元素均可由 frozen 源机械派生，无产品语义空缺。** 对照：S2b 的 DEEPEN / SIMPLIFY / REFRAME / SEARCH 语义尚无 frozen 定义，须产品负责人版本化定义后方可实施（授权 §5.7）；G04 不存在该类空缺，本填写项不补写任何产品语义，仅做派生与建模裁决。

| # | 语义元素 | frozen 源 | 派生方式 |
|---|---|---|---|
| 1 | 进入条件（强 / 中 / 弱触发） | 08 §3 | 直接转写 |
| 2 | 阶段链编排 | E2 Stage 5（CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK）；08 §5；13 §16 | E2 为 P3 冻结编排（授权 §2(1) 同名引用）；标签对账见 §4 变更 1 |
| 3 | 创作对象模型 | 08 §8（规范实例 JSON）+ §9（九分量：Concept / Objects / Rules / Variables / Interactions / Presentation / Goal / Versions） | §9 为模型契约，§8 为规范实例 |
| 4 | 上下文继承 | 08 §4 / §6 / §25 | 直接转写（继承五项：主题、用户已经理解、核心变量、用户已经尝试、用户新的目标） |
| 5 | 修改类型与补丁格式 | 08 §10（V1 类型集与示例映射）/ §12（`{operation, target, change}`） | 派生；S2b 保留项（SIMPLIFY / DEEPEN / REFRAME）不纳入 F-2 → 裁决 D-04 |
| 6 | 修改运行时（局部补丁、不重新生成整个作品） | 08 §11 | 直接转写 |
| 7 | 创作域策略（输入 → 输出） | 08 §15 | 创作运行时内部子策略，不新增顶层 PolicyAction（PD-23 §5：S2a 不新增动作集） |
| 8 | ASK 纪律（能推断即做，至多一个澄清问题） | 08 §16 | 直接转写 |
| 9 | 用户主权（AI 建议 ≠ AI 决定） | 08 §17 | 预览即确认（补丁经版本化历史可逆，08 §18 / §28） |
| 10 | 反馈循环（Try / Feel 是必要步） | 08 §19 | USER_FEEDBACK 轮语义 |
| 11 | 完成语义（CREATION_COMPLETE，立即结束，不自动继续） | 08 §27；13 §22（条件 A/B/C） | 派生 → 裁决 D-05 |
| 12 | 版本化提交（V1→V2→…，单调） | 08 §28；授权 §3.2；S1-12 不变式 | F-2 实施单调版本化提交 + stale 拒绝；RESTORE_PREVIOUS_VERSION 属 F-3（授权 §3.3"历史版本化"） |
| 13 | 安全禁区（禁止自动扩张等） | 08 §14 / §29；13 §23 | 引用已冻结 forbidden transitions |
| 14 | Creation Graph 记录 | 08 §26 | 创作域事件（`creation_*`）登记，事件词表扩展经 C6 §14 命名模式 |
| 15 | 多轮分支（定义） | 授权 §2(1)；08 §19 循环 | 多轮 = USER_FEEDBACK 循环的多轮（每轮一个版本化补丁提交，版本化历史单调增长）；WHAT_IF 假设分支不属本变更（F-4） |
| 16 | 创作修改意图识别 | 08 §10 示例映射（"再加两个障碍"→ADD 等） | 示例映射冻结 + 歧义 ASK 纪律（08 §16）；具体模式规则为实现细节（确定性规则，非模型——同 S1 分类器纪律） |

开放点（非语义空缺——建模与范围裁决，见 §2）：D-01…D-05。

## 2. 裁决项（产品负责人填写区）

### D-01 版本化路径（policy / state_machine 版本号分配）

**背景：** 授权 §4 声明 S2a 终点为 policy_v1.2.0 / state_machine_v1.1.0（CREATE / CORRECTION / WHAT_IF 完整语义 + MODIFY 别名一版含）；PD-23 §5 同义。F-2 / F-3 / F-4 分三个迭代实施，每个迭代须"实施前冻结"各自的变更文本（G1 式纪律：版本化变更文本于首个动态证据运行前完成冻结 + Steward 确认）。版本号如何分配须裁决。

**选项 1（授权字面·单版）：** policy_v1.2.0 / state_machine_v1.1.0 一次性冻结 S2a 全部语义增量（CREATE / CORRECTION / WHAT_IF 完整 + MODIFY 别名），分节标注生效切片（F-2 / F-3 / F-4）。问题：运行时代码随切片逐步实施，同一版本标签下 frozen 文档语义与运行时实现不一致（F-2 时决策追踪报 policy_v1.2.0，但 CORRECTION 完整语义未实施）——追踪语义失真，且决策追踪 schema（C6 §22）无切片字段，改 schema 又牵动冻结契约。

**选项 2（推荐·逐切片升版）：** F-2 → policy_v1.2.0 / state_machine_v1.1.0（G04 完整 Creation）；F-3 → policy_v1.3.0 / state_machine_v1.2.0（G07 完整 Correction + MODIFY 别名）；F-4 → policy_v1.4.0 / state_machine_v1.3.0（WHAT_IF 完整分支）。每个版本标签如实描述已实施语义（仓库既定纪律：每次版本化变更 = 一次批准 + 描述新增内容，先例 PD-21 policy_v1.1.0）。代价：须对 IMPL-AUTH-01 §4 版本映射作版本化修订（授权文档 v1.1.0 → v1.2.0，产品负责人签署——§6 签署区含该修订批准行）。

**选项 3（双轨版本）：** 文档版本与运行时版本分离的二元机制。无仓库先例，新增机制复杂度，且追踪消费者需同时解析两个版本——不推荐。

**裁决区：** ＿＿＿＿＿＿＿＿（建议填写：选项 / 理由 / 日期）

### D-02 阶段链建模位置

**选项 A（推荐·轴外子状态机）：** 创作子状态机承载于持久创作对象，体验阶段轴不变（CURIOSITY / UNDERSTANDING / SIMULATION / CREATION / COMPLETION 保持 S1 冻结契约）。依据：13 §16 已将创造状态机定义为独立 V1 机器（"Creation State Machine"专节）；E2 Stage 5 为编排而非轴扩展；授权 §4"关闭切片 CREATION 阶段契约化"读作将 PD-21 最小 CREATION 阶段契约化为完整链，非扩展轴。

**选项 B（扩展轴枚举）：** ExperienceStage 枚举细化为创作阶段。破坏 S1 冻结阶段轴（13 §14/§15 迁移表、acceptance-mapping 冻结预期），状态机契约、黄金套件、事件语义大改；无 frozen 源要求扩展轴——不推荐。

**裁决区：** ＿＿＿＿＿＿＿＿

### D-03 持久创作状态的范围边界

**选项 A（推荐·会话内持久）：** F-2 持久化范围 = 本会话内创作对象 + 创作子状态 + 单调版本历史（跨 USER_ACTION / RESPONSE_COMPLETED 周期存活，经承诺链版本化提交 + stale 拒绝）。跨会话持久化不实施——列入 F-5 Minimal Memory 裁决（PB-04 纪律："逐项列明，不得隐含扩大"）；授权 §2(4) 明文由 Minimal Memory 专管跨会话持久化（短期记忆：跨会话主题 / 意图信号 + 用户显式纠正 / 撤回记录）。

**选项 B（跨会话持久）：** F-2 即实施跨会话创作状态持久化。超出授权 §2(1) 的 F-2 范围边界（"持久创作状态"在授权语境中指创作循环内的持久状态维护），且扩大隐私六要素批准面（存储 / 保留 / 删除机制须重新对齐 P3-S1-PRIVACY-SIX-01）——不推荐。

**裁决区：** ＿＿＿＿＿＿＿＿

### D-04 F-2 创作补丁操作集

**选项 A（推荐·收敛 operation 值域）：** operation 值域 = `{add, remove, modify}`（08 §12 示例 operation 值即 add / modify）；REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 作为 modify 的 change 子型（`change.kind`）。USER_FEEDBACK 轮可用操作 = ADD / REMOVE / MODIFY（含五子型）+ COMPLETE；SIMPLIFY / DEEPEN / REFRAME 显式 DEFERRED 至 S2b（授权 §2 不授权）。

**选项 B（十类型全独立）：** 08 §10 十类型全独立 operation 值。排除 S2b 三项后仍七值，补丁格式 operation 值域膨胀，与 08 §12 示例不一致——不推荐。

**裁决区：** ＿＿＿＿＿＿＿＿

### D-05 完成信号路由（CREATION_COMPLETE 语义落点）

**选项 A（推荐·轴触发器不变）：** CREATION_COMPLETE 不作为体验轴新触发器；创作完成经 STOP 执行路径在创作域登记：创作子状态机 USER_FEEDBACK → COMPLETE，创作域事件 `creation_completed`，决策追踪 reason 区分"创作完成"（08 §27 完成信号）与"停止体验"（通用 STOP）。轴契约零变更，P-01（STOP 永远优先）冻结链不变，黄金套件轴断言不受影响；08 §27 / 13 §22 的完成语义是可观测行为约束（立即结束、不自动继续），非新轴迁移。

**选项 B（新增轴触发器）：** 新增 CREATION_COMPLETE 轴触发器（ACTIVE/CREATION → COMPLETED/COMPLETION）。轴契约扩展，须同步状态机实现与黄金套件；终态行为与 STOP 同效，仅事件语义区分——收益不抵契约成本。

**裁决区：** ＿＿＿＿＿＿＿＿

## 3. policy_v1.2.0 变更文本草案

（依 D-01 选项 2 起草：F-2 切片 = G04 完整 Creation 语义。若 D-01 裁决为选项 1，本文本与 F-3 / F-4 变更合并为单一 policy_v1.2.0 文档，分节标注生效切片。）

**版本：** policy_v1.2.0（＿＿＿＿ 产品负责人批准）
**前置：** policy_v1.1.0（PD-21 关闭切片）

**变更 1（CREATE 完整语义）：** CREATE → CREATE 映射不变；执行语义由 PD-21 最小 Creation Branch 扩展为 E2 Stage 5 完整编排：CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK（多轮循环至 COMPLETE；多轮定义见 §1 第 15 项）。

- 上下文继承（08 §4/§6/§25）：从当前 Experience State 继承五项——主题、用户已经理解、核心变量、用户已经尝试、用户新的目标；不问类型配置问题（08 §6：不问"你想做什么类型的游戏"，直接提出最小版本）。
- 最小可玩物优先（08 §6/§7）：第一次创建必须尽快产生可感知结果；先做一个可玩的东西，再让用户修改；不做配置面板、不发大段解释、不展示复杂创作面板。
- 创作对象模型（08 §8/§9）：creation_id / source_experience / concept（theme / core mechanic（见注） / goal）/ objects / rules / variables / interactions / presentation / goal / user_changes[] / version。（注：08 §9 分量名 core mechanic 派生为字段 coreMechanic。）
- 创作域子策略（08 §15）：创作运行时内部子策略——输入：当前创作 + 用户意图 + 修改请求 + 体验状态；输出：CREATE / MODIFY / PREVIEW / EXPLAIN / ASK / WAIT / COMPLETE / STOP。均为创作执行内部决策记录，不新增顶层 SemanticAction / PolicyAction（PD-23 §5：S2a 不新增动作集）。
- ASK 纪律（08 §16）：能安全推断就直接做；至多一个高价值澄清问题。
- 用户主权（08 §17）：AI 建议 ≠ AI 决定；创作补丁经版本化历史可逆（08 §28），预览即确认机制（08 §18：用户通过体验判断修改是否正确）。
- 安全禁区（08 §14 / 13 §23）：禁止自动扩张（13 §23.4）、自动发布、自动分享、自动保存为长期记忆、自动继续创作、因用户表现出兴趣而不断生成；用户提出变化，AI 执行变化。

**变更 2（创作会话内输入路由）：** 创作会话活跃（CREATION 阶段且创作子状态非终态）时：

- 修改意图输入由创作运行时解释（08 §13 理解职责），不落入通用 CORRECTION → EXPLAIN 路径；创作域外 CORRECTION 行为不变（关闭切片映射保持至 F-3）。
- 完成信号词表（08 §27："好了" / "就这样" / "可以了" / "完成" / "这个就是我想要的"）识别为创作完成语义（CREATION_COMPLETE），立即结束，不自动推荐、不自动继续（13 §23.2）。
- 与既有轴触发器冲突的词表（如"不要这个"同时命中 CHANGE_DIRECTION 模式与创作 REMOVE 直觉）按 ASK 纪律处理：至多一个澄清问题，不自动判定（08 §16）。

**不变：** CORRECTION → EXPLAIN、WHAT_IF → SIMULATE 关闭切片映射保持；SEARCH 仍表外（PD-06）；完整 CORRECTION 语义随 F-3（policy_v1.3.0）、WHAT_IF 完整分支随 F-4（policy_v1.4.0）各自版本化变更冻结实施（依 D-01 选项 2）；MODIFY 别名登记属 F-3 范围，本版本不实施。

## 4. state_machine_v1.1.0 变更文本草案

（依 D-01 选项 2 起草：F-2 切片 = CREATION 完整阶段链契约化。）

**版本：** state_machine_v1.1.0（＿＿＿＿ 产品负责人批准）
**前置：** state_machine_v1.0.0

**变更 1（创作子状态机）：** 新增创作子状态机（13 §16 独立创造状态机的 E2 标签契约化），承载于持久创作对象（D-02 选项 A），不占体验状态轴：

```text
CREATE_INTENT（E2 标签：CREATE）
      ↓
CONTEXT_INHERIT
      ↓
MINIMAL_BUILD
      ↓
PREVIEW
      ↓
USER_FEEDBACK
      │
      ├── 创作补丁应用（操作集依 D-04）→ PREVIEW → USER_FEEDBACK（多轮，每轮一个版本化提交）
      │
      └── COMPLETE
```

- 标签对账：13 §16 的 PLAN / BUILD / MODIFY 循环为同一概念的同义标签（13 §18 PLAN ≡ 创作计划；§19 BUILD ≡ MINIMAL_BUILD；§21 MODIFY → BUILD PATCH → PREVIEW ≡ USER_FEEDBACK 轮补丁应用）；08 §5 的 CREATE_INTENT ≡ E2 Stage 5 链首 CREATE。契约标签以 E2 Stage 5 为准（授权 §2(1) 同名引用）。
- 不变式（13 §21）：存在未预览补丁时不得 COMPLETE——修改必须先经 PREVIEW 再由用户判断。
- 非法迁移：子状态机未列出的迁移一律拒绝（同 S1-04 纪律）。

**变更 2（CREATION_COMPLETE 语义）：** 不新增体验轴触发器（轴触发器集不变）；创作完成经 STOP 执行路径在创作域登记：创作子状态机 USER_FEEDBACK → COMPLETE，创作域事件 creation_completed，决策追踪 reason 区分"创作完成"（08 §27 完成信号）与"停止体验"（通用 STOP）。轴迁移与终态行为与 S1 完全一致（ACTIVE/CREATION → COMPLETED/COMPLETION）。

**变更 3（CORRECTION 阶段语义·创作域）：** CORRECTION 在 CREATION 阶段保持阶段于 CREATION 且重评估创作子状态（不推进子状态机）；CORRECTION 完整操作语义（定位目标 / 局部修改 / 重生成 / 历史版本化）随 F-3 版本化变更（state_machine_v1.2.0）实施。

**不变：** 体验状态轴（CURIOSITY / UNDERSTANDING / SIMULATION / CREATION / COMPLETION）与全部既有迁移表（LEGAL_TRANSITIONS / WHAT_IF_STAGE_RULES / CREATE_STAGE_RULES / CORRECTION_RULES）不变；COMPLETED 终态不变；CREATE 触发器 7 条规则保持（关闭切片契约化）。

## 5. 实施与证据计划大纲（签署后执行）

**代码（建议切片，model on F-1 提交纪律）：**

1. `src/experience/creation.ts`（新增）：创作对象 schema（08 §9 九分量 + creation_id / source_experience / user_changes[] / version / phase）；创作子状态机（类型 + 迁移表 + 非法拒绝）；上下文继承（从 ExperienceState 提取 08 §6 五项，纯函数）；补丁应用（纯函数：当前创作 + patch `{operation, target, change}` → 新创作，version +1，user_changes 登记）；创作修改意图识别（确定性规则词表，非模型；含冲突词表 ASK 纪律）。
2. `src/experience/policy.ts`：POLICY_VERSION → policy_v1.2.0（依 D-01）；文档注释同步 §3 变更 1/2。
3. `src/experience/runtime.ts`：CREATE 执行扩展为完整编排（建立创作会话 → 上下文继承 → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK 等待）；创作会话内 USER_ACTION 的创作解释与补丁应用（版本化提交，expected_state_version 陈旧 → STATE_VERSION_CONFLICT）；完成信号 → CREATION_COMPLETE 登记 + STOP 终态。
4. `src/experience/events.ts`：创作域事件词表（creation_started / creation_phase_transitioned / creation_patch_applied / creation_completed；C6 §14 命名模式；事件契约版本注记）。
5. `tools/evidence/src/golden.mjs`：policy_version 断言同步（policy_v1.1.0 → policy_v1.2.0，CREATE / CORRECTION 案例；同提交维护，先例：PD-21）。

**证据执行器（`tools/evidence/src/s2a-f2.mjs`，model on s2a-f1.mjs；`npm run s2a-f2`）：** 案例草案——

- S2A-F2-CREATION-CHAIN：完整阶段链 + 上下文继承五项断言 + 创作对象九分量断言 + source_experience 登记（08 §26 Creation Graph 形态）。
- S2A-F2-MULTI-TURN：多轮补丁（ADD → MODIFY → ADD）；每轮 version +1、user_changes 累积；断言"不重新生成整个作品"（08 §11：版本单调且增量登记）。
- S2A-F2-STALE-REJECT：陈旧版本补丁提交 → STATE_VERSION_CONFLICT，创作状态逐字节不变。
- S2A-F2-NO-AUTO-EXPANSION：最小构建不含未请求对象 / 规则（13 §23.4）。
- S2A-F2-COMPLETION：完成信号 → creation_completed 事件 + COMPLETED 终态 + 无自动推荐 / 自动继续事件（13 §23.2）。
- S2A-F2-ASK-BOUND：歧义输入 → 至多一个澄清问题，不自动执行修改。
- S2A-F2-INPROC-REGRESSION：S1 黄金子集进程内回归（黄金套件断言随版本同步）。
- S2A-F2-NONCREATION-INERT：非创作会话行为与关闭切片一致（除 policy_version 字段）。

**治理写回（签署后）：** decision-register 新条目（CR-19 登记 F-2 语义冻结）；readiness-record 版本递增；IMPL-AUTH-01 §4 版本映射修订（依 D-01 裁决——若选项 2，修订为逐切片升版，授权文档升 v1.2.0 产品负责人签署）；随后实施提交（`feat(s2a-f2)`）→ 证据运行（`evidence: S2A-F2-0001 …`）→ 迭代记录（`implementation-iteration-s2a-f2.md`）。

**不变式保持清单（授权 §3.2 明示）：** 版本化提交经现有承诺链（串行化 + stale 拒绝）；LLM / 前端不得直接写创作状态（CC02 H01 同族）；创作状态写入经 Runtime 单一写入者（GS-06 / CC02）；错误路径不修改已提交状态（S1 §28）。

## 6. 签署区

| 角色 | 签署 | 结论 | 日期 |
|---|---|---|---|
| 产品负责人（PD-15） | 待签署 | §2 裁决区（D-01…D-05）填写后生效 | |
| C1/C2/C3 Steward 确认 | 待确认 | G1 式纪律：版本化变更文本于首个动态证据运行前冻结 | |
| IMPL-AUTH-01 §4 修订批准（仅 D-01 选项 2 时） | 待签署 | 授权文档 v1.1.0 → v1.2.0：版本映射修订为逐切片升版 | |

本填写项不改变任何 Gate 状态；不授权实施；签署前不得进入代码开发。
