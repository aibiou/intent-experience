# S2a F-4 语义冻结填写项（WHAT_IF 完整分支）

**编号：** S2A-F4-SEMANTIC-FREEZE-01
**版本：** 0.1.0（2026-10-09：STAGED——填写项待产品负责人裁决与签署）
**状态：** STAGED（待裁决）——本文件为填写项草案，不改变任何 Gate 状态；不授权实施；签署前不得进入代码开发
**背景：** S2a F-2（完整 G04 Creation 语义）已关闭（`deb48ef`）；F-3（完整 G07 Correction 语义）填写项已 staged（S2A-F3-SEMANTIC-FREEZE-01 v0.1.0，`29b5a8d`，待产品负责人裁决 D-01…D-05）。F-4 = WHAT_IF 完整分支实施（P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§3(4)/§4：持久分支状态；假设 / 事实 / 模拟结果分离不变 E8-G2-CC07；policy_v1.3.0 → policy_v1.4.0，state_machine_v1.2.0 → state_machine_v1.3.0）
**依据：** P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§3(4)/§4；C05.2/C05.3（WHAT_IF = 假设/模拟）；S1 规范 §11/§14（WHAT_IF → SIMULATE）；13 号状态机规范 §15.2/§15.3/§15.5/§24；E2 Stage 3（Simulation 四元分离）/ Stage 4（Branch = CHANGE_DIRECTION 编排）；07 号契约 §3（Session State current_branch 字段）；E8-G2-CC07（假设 / 事实 / 模拟结果分离不变）；PD-06（S1 基础单次模拟形态）；PD-07（不持久化跨会话 Memory）；acceptance-mapping §B（G03 完整 WHAT_IF 多轮 / 持久分支已调度入 S2a，PD-23）；Evaluation System V1 §5 G03

## 1. 语义完备性评估

**结论：WHAT_IF 完整分支语义在 frozen 源中部分完备——两层结构。** 第一层（模拟执行与分离不变）可由 frozen 源机械派生，无语义空缺；第二层（分支生命周期与分支-主线关系）为语义空缺——frozen 源无定义，按授权 §5.7 纪律（C3 行为语义空缺不得由编码者补写）须产品负责人版本化定义后方可实施。本填写项不补写任何产品语义，仅做派生与建模裁决提案。

**第一层（可机械派生）：**

| # | 语义元素 | frozen 源 | 派生方式 |
|---|---|---|---|
| 1 | 基础映射保持（WHAT_IF → SIMULATE） | S1 §14；PD-06 | 直接转写（基础形态不变，F-4 扩展的是执行语义非映射） |
| 2 | 分离不变（事实 / 推断 / 假设 / 模拟四元区分；模拟结果不得表现为事实） | E2 Stage 3；E8-G2-CC07；G03-N 黄金断言 | 直接转写（字段化承载 → 裁决 D-05） |
| 3 | 多轮模拟阶段迁移（SIMULATION → SIMULATION 合法） | 13 §15.3（"那如果速度再高一点呢？"） | 直接转写——多轮模拟在现有状态机上已合法，F-4 使其持久化 |
| 4 | 模拟 → 创造衔接（SIMULATION → CREATION 允许） | 13 §15.5（"用户已经进行了模拟，并希望把它做成东西"） | 直接转写（CREATE 触发器 7 条规则已覆盖，F-4 不变） |
| 5 | 不新建 Session / Experience | G03-N 黄金断言（session_started=1，experience_started=1） | 直接转写 |
| 6 | 版本纪律（每次合法提交恰好 +1；stale 拒绝） | S1-12；G03-FR 黄金案例 | 直接转写 |
| 7 | STOP 优先 / 同层解释顺序 WHY > WHAT_IF | P-01；PD-12；G03-NEG / G03-B 黄金案例 | 直接转写（分类器优先级层不变） |
| 8 | 持久状态的会话边界先例 | 07 §3（Session State：会话内持续变化，会话结束后大部分失效，不默认进入长期记忆） | 派生 → 裁决 D-04（与 F-2 D-03 选项 A 同纪律） |

**第二层（语义空缺——frozen 源无定义）：**

| # | 空缺元素 | 核查结论 | 处置 |
|---|---|---|---|
| 9 | 分支生命周期模型（分支的创建 / 切换 / 放弃 / 返回主线语义） | E2 Stage 4"Branch"经核查为 CHANGE_DIRECTION 编排（取消旧生成 / 作废旧候选 / 保留有效上下文 / 新方向），非 WHAT_IF 分支生命周期；07 §3 current_branch 为标量字段，无分支对象模型；13 §15.3 仅允许 SIMULATION→SIMULATION 迁移，未定义分支记录结构 | 须产品负责人版本化定义 → 裁决 D-02 / D-03 |
| 10 | 分支与主线的关系（分支模拟结果能否回流为主线结论） | frozen 源无定义（E2 Stage 3 仅约束模拟结果不得表现为事实） | 须产品负责人版本化定义 → 裁决 D-02 选项说明 |

开放点（建模与语义定义裁决，见 §2）：D-01…D-05。

## 2. 裁决项（产品负责人填写区）

### D-01 F-4 实施范围处置（因 §1 第二层语义空缺）

**背景：** 授权 §2(3) 明文要求 WHAT_IF 完整分支（持久分支状态），但分支生命周期语义无 frozen 源定义（§1 第 9/10 项）。处置方式须裁决。

**选项 A（推荐·分层实施）：** F-4 实施第一层可派生部分（多轮模拟持久化：每轮模拟结果经模拟域事件登记，四元分离；模拟历史会话内持久；版本链单调）；第二层分支生命周期语义经本填写项 D-02…D-04 由产品负责人版本化裁决后，于同一 policy_v1.4.0 冻结文本内补写并实施。先例：F-2 对 S2b 保留操作（SIMPLIFY / DEEPEN / REFRAME）显式 DEFERRED 的分层纪律。

**选项 B（先定义后实施）：** F-4 整体冻结延后，直至产品负责人版本化定义完整分支语义后再实施。问题：第一层（多轮模拟持久化）已具备实施条件且属授权 §2(3) 义务；整体延后无故拖慢 S2a 进度——不推荐。

**选项 C（保持 S1 基础形态）：** WHAT_IF 保持单次模拟（PD-06 形态），F-4 登记 DEFERRED。问题：与授权 §2(3)/§4 明文冲突（WHAT_IF 完整分支已经产品负责人 PD-23 裁决调度入 S2a）——不可选。

**裁决区（产品负责人填写）：** ______

### D-02 分支状态模型（语义定义裁决）

**背景：** "持久分支状态"的承载形态无 frozen 源定义。07 §3 Session State 的 current_branch 字段为唯一分支概念先例（标量，会话内有效）。模型形态须产品负责人定义。

**选项 A（推荐·轴外分支子状态机，model on F-2 创作子状态机纪律）：** 分支状态为轴外持久对象（current_branch 字段的对象化承载），每分支含：branch_id / 源模拟轮次 / 模拟结果记录（四元分离）/ 版本 / 生命周期状态。体验阶段轴不变（WHAT_IF 轮次保持 SIMULATION 阶段，13 §15.3）。分支模拟结果不自动回流为主线结论（E2 Stage 3 纪律的忠实推导：模拟结果不得表现为事实——回流即把模拟当事实，故默认不回流；是否允许显式回流操作见 D-03）。

**选项 B（SIMULATION 阶段内模拟历史列表）：** 分支状态承载于体验状态（SIMULATION 阶段的模拟历史列表）。问题：体验状态为单线版本链，分支并行语义在单线状态上须以状态回退表达，违反 S1-12 单调版本化不变式——不推荐。

**选项 C（分支即新体验）：** 每个 WHAT_IF 分支创建新 Experience。问题：违反 G03-N 不变式（不创建新 Session / Experience）与 13 §7 状态轴语义——不可选。

**裁决区（产品负责人填写）：** ______

### D-03 分支生命周期操作集（语义定义裁决）

**背景：** 分支的创建 / 切换 / 放弃 / 返回语义无 frozen 源定义（§1 第 9 项空缺）。操作集须产品负责人定义。

**选项 A（推荐·四操作最小集，默认不回流）：** 分支操作 = {CREATE（WHAT_IF 首轮自动创建分支记录）/ SWITCH（显式切换激活分支）/ ABANDON（放弃分支）/ RETURN（返回主线模拟上下文）}。分支模拟结果默认不回流为主线结论（D-02 选项 A 推导）；如需"采用某分支结论"须新增显式操作（本版不定义——避免编码者补写语义空缺；产品负责人如有此需求另案版本化）。操作识别为确定性规则词表（同分类器纪律），具体词表为实现细节。

**选项 B（二操作集，分支切换经 CHANGE_DIRECTION）：** 分支操作 = {CREATE / ABANDON}，分支切换经 CHANGE_DIRECTION 实现。问题：CHANGE_DIRECTION 语义为取消旧候选进入新候选周期（P-02，E2 Stage 4），与"切换查看已有分支"语义不同——混淆两个已冻结语义，且使分支历史不可达——不推荐。

**选项 C（无显式生命周期）：** 分支仅累积，不支持切换 / 放弃 / 返回。问题：与授权 §2(3)"完整分支"义务不符（持久分支状态若无生命周期操作，用户无法使用分支）——不推荐。

**裁决区（产品负责人填写）：** ______

### D-04 分支持久化范围与边界（对齐 PD-07 / F-5）

**选项 A（推荐·会话内持久）：** 分支状态会话内持久（跨 USER_ACTION / RESPONSE_COMPLETED 周期存活），会话结束失效（07 §3 Session State 纪律）；跨会话分支持久化属 F-5 Minimal Memory 裁决范围（授权 §2(4) 专管），本切片不实施。与 F-2 D-03 选项 A / F-3 同纪律。

**选项 B（跨会话持久）：** 分支状态跨会话持久。问题：扩大隐私六要素批准面（存储 / 保留 / 删除机制须重新对齐 P3-S1-PRIVACY-SIX-01），且超出授权 §2(3) 的 S2a 边界（跨会话持久化属 §2(4) Minimal Memory 专管）——不推荐。

**裁决区（产品负责人填写）：** ______

### D-05 模拟结果的内容契约（第一层可派生部分的形态裁决）

**选项 A（推荐·四元分离事件记录）：** 每轮模拟结果经模拟域事件（simulation_recorded，C6 §14 命名模式派生）登记，properties 含 fact / inference / hypothesis / simulation 四元字段（E8-G2-CC07 的字段化承载）+ 源输入摘要；"模拟结果不得表现为事实"由事件 schema 约束（simulation 字段与 fact 字段互斥注记）+ 内容语料分离格式双重保证（G03-N 黄金断言随版本同步）。

**选项 B（仅内容文本分离）：** 四元分离仅由生成内容文本表达（现状：合成语料文本含"事实 / 推断 / 假设"标记）。问题：分离不变仅为文本约定，事件层无结构化可验证承载——不变式不可审计——不推荐。

**裁决区（产品负责人填写）：** ______

## 3. policy_v1.4.0 变更文本草案

（依 D-01 选项 A 分层起草：第一层随本版冻结；第二层经 D-02…D-04 裁决后补写——若 D-01 裁决为选项 B，本版仅冻结第一层且 F-4 实施范围相应缩减。）

**版本：** policy_v1.4.0（待产品负责人批准——PD-15 签署；F-4 切片冻结文本）
**前置：** policy_v1.3.0（S2A-F3-SEMANTIC-FREEZE-01 §3）

**变更 1（WHAT_IF 多轮模拟持久化——第一层）：** WHAT_IF → SIMULATE 映射不变；执行语义由 PD-06 单次模拟提案扩展为多轮模拟持久化：

- 每轮模拟结果经模拟域事件登记（裁决 D-05 选项 A：simulation_recorded，properties 含 fact / inference / hypothesis / simulation 四元字段）；模拟结果不得表现为事实（E2 Stage 3 / E8-G2-CC07）。
- 模拟历史会话内持久（裁决 D-04 选项 A：07 §3 Session State 纪律；跨会话属 F-5）。
- 多轮模拟阶段迁移保持 SIMULATION（13 §15.3）；每次合法提交版本恰好 +1（S1-12；stale 拒绝）。
- 不新建 Session / Experience（G03-N 不变式）；STOP 优先（P-01）与 WHY > WHAT_IF 同层顺序（PD-12）不变。

**变更 2（WHAT_IF 分支语义——第二层，待 D-02…D-04 裁决后补写）：** 分支状态模型（轴外分支子状态机，D-02 选项 A 形态）与分支生命周期操作集（D-03 选项 A 四操作）经产品负责人裁决后，于本版冻结文本内补写生效；补写前运行时仅实施变更 1，分支操作词表识别为 UNKNOWN 并升级（授权 §5.7 纪律——未冻结语义不实施）。

**不变：** STOP / CHANGE_DIRECTION / DIRECT_ANSWER / CREATE / CORRECTION / WHY 映射；SEARCH 仍表外（PD-06）；SIMULATION → CREATION 衔接（13 §15.5，CREATE 触发器规则已覆盖）；Minimal Memory 语义随 F-5（policy_v1.5.0）版本化变更冻结实施（P3-S2-IMPL-AUTH-01 v1.2.0 §4 逐切片升版）。

## 4. state_machine_v1.3.0 变更文本草案

（依 D-01 选项 A 分层起草。）

**版本：** state_machine_v1.3.0（待产品负责人批准——PD-15 签署；F-4 切片冻结文本）
**前置：** state_machine_v1.2.0（S2A-F3-SEMANTIC-FREEZE-01 §4）

**变更 1（WHAT_IF 多轮模拟契约化——第一层）：** WHAT_IF_SIMULATE 触发规则不变（13 §15.2 UNDERSTANDING → SIMULATION；§15.3 SIMULATION → SIMULATION）；多轮模拟经模拟域事件序列登记（每轮恰好一次版本化提交，模拟结果四元分离）。

**变更 2（WHAT_IF 分支状态——第二层，待 D-02…D-04 裁决后补写）：** 分支子状态机（D-02 选项 A 形态：分支记录生命周期状态迁移）与分支操作触发器经产品负责人裁决后补写；体验轴触发器集不变（分支操作不新增体验轴触发器——同 F-2 D-05 / F-3 D-04 轴外纪律）。

**不变：** 体验状态轴（CURIOSITY / UNDERSTANDING / SIMULATION / CREATION / COMPLETION）与全部既有迁移表（LEGAL_TRANSITIONS / WHAT_IF_STAGE_RULES / CREATE_STAGE_RULES / CORRECTION_RULES）不变；COMPLETED 终态不变。

## 5. 实施与证据计划大纲（签署后执行）

**代码（建议切片，model on F-2/F-3 提交纪律）：**

1. `src/experience/events.ts`：模拟域事件词表常量（simulation_recorded；C6 §14 命名模式；properties 含四元分离字段——D-05 选项 A）。
2. `src/experience/simulation.ts`（新增）：模拟结果记录模型（四元分离 + 源输入摘要 + 版本）；模拟历史（会话内持久——D-04 选项 A）；分支记录模型与生命周期（D-02/D-03 选项 A 形态——随裁决补写）。
3. `src/experience/runtime.ts`：WHAT_IF 执行扩展（executeWhatIf 或 executeContentGeneration SIMULATE 路径扩展）：每轮模拟结果登记 simulation_recorded + 模拟历史累积 + 版本化提交；分支操作路由（随 D-02/D-03 裁决补写）。
4. `src/experience/policy.ts`：POLICY_VERSION → policy_v1.4.0；文档注释同步 §3 变更 1/2。
5. `tools/evidence/src/golden.mjs`：policy_version 断言同步（policy_v1.3.0 → policy_v1.4.0；G03 案例断言保持——S1 基础形态不回归）。

**证据执行器（`tools/evidence/src/s2a-f4.mjs`，model on s2a-f2.mjs；`npm run s2a-f4`）：** 案例草案——

- S2A-F4-MULTI-ROUND：多轮模拟（"如果摩擦力不是 0 呢？" → "那如果速度再高一点呢？"）；每轮版本 +1、simulation_recorded 事件累积、阶段保持 SIMULATION（13 §15.3）。
- S2A-F4-SEPARATION：每轮模拟结果四元分离断言（fact / inference / hypothesis / simulation 字段齐备且 simulation 不表现为事实——E8-G2-CC07）。
- S2A-F4-NO-NEW-EXPERIENCE：多轮模拟不创建新 Session / Experience（G03-N 不变式）。
- S2A-F4-STAGE-PRESERVED：WHAT_IF 轮次阶段迁移断言（UNDERSTANDING → SIMULATION → SIMULATION）；SIMULATION → CREATION 衔接（13 §15.5，"做成小游戏" → CREATE 触发器）。
- S2A-F4-STALE-REJECT：陈旧 expected_state_version 模拟提交 → STATE_VERSION_CONFLICT，状态逐字节不变。
- S2A-F4-STOP-PRIORITY：输入含 STOP 标记时 STOP 压倒 WHAT_IF（P-01；G03-NEG 同族）；WHY > WHAT_IF 同层顺序（PD-12；G03-B 同族）。
- S2A-F4-NONCREATION-INERT：非模拟场景行为与前置版本一致（除 policy_version 字段与模拟域事件）。
- S2A-F4-INPROC-REGRESSION：S1 黄金子集进程内回归（黄金套件断言随版本同步）。

**治理写回（签署后）：** decision-register 新条目（CR-21 登记 F-4 语义冻结）；readiness-record 版本递增；随后实施提交（`feat(s2a-f4)`）→ 证据运行（`evidence: S2A-F4-0001 …`）→ 迭代记录（`implementation-iteration-s2a-f4.md`，P3-S2A-IMPL-ITER-F4 v1.0.0）；失败尝试按 ADR-0002 §5 归档。

**不变式保持清单（授权 §3.4 明示）：** 版本化提交经现有承诺链（串行化 + stale 拒绝）；LLM / 前端不得直接写状态（CC02 H01 同族）；模拟写入经 Runtime 单一写入者（GS-06 / CC02）；错误路径不修改已提交状态（S1 §28）；版本链单调（每次合法提交恰好 +1，S1-12）；模拟结果不得表现为事实（E8-G2-CC07）；不持久化跨会话（PD-07）。

## 6. 签署区

| 角色 | 签署 | 结论 | 日期 |
|---|---|---|---|
| 产品负责人（PD-15） | （待签署） | §2 裁决区 D-01…D-05 全项裁决（含第二层分支语义定义裁决 D-02/D-03）；§3/§4 变更文本冻结 | |
| C1/C2/C3 Steward 确认 | （待确认） | G1 式纪律满足：版本化变更文本于首个动态证据运行（S2A-F4-0001）前完成冻结 | |

本填写项不改变任何 Gate 状态；不授权实施；签署前不得进入代码开发。
