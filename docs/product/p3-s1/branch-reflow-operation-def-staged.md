# S2 分支回流操作版本化定义（S2-BRANCH-REFLOW-DEF-01 v1.0.0 RULED）

**编号：** S2-BRANCH-REFLOW-DEF-01
**版本：** 1.0.0（2026-10-09：产品负责人裁决"选项 A"升版 RULED——启用显式回流操作 ADOPT_BRANCH；语义定义经本裁决版本化冻结）
**状态：** RULED（产品负责人 2026-10-09 裁决选项 A——启用显式回流操作 ADOPT_BRANCH；产品实施按授权路径另行签发，实施前现行四操作词表保持冻结）
**登记来源：** S2A-F4-SEMANTIC-FREEZE-01 D-02/D-03 选项 A 说明（"采用某分支结论"显式回流操作须产品负责人另案版本化定义，本版不预先写死）；S2A-F4-0001 / S2A-F5-0001 / S2B-0001 迭代记录 §6 后续义务；S2-CORPUS-TAIL-RULING-01 §5 非结论第 3 项；S2b 迭代记录 §6 后续义务第 4 项
**记录日期：** 2026-10-09
**裁决授权（Go）：** 产品负责人 2026-10-09 裁决"分支回流操作 = Go"——由实现方起草本版本化定义提案（staged）；**裁决已完成（2026-10-09：选项 A——启用显式回流操作 ADOPT_BRANCH）**

## 1. 事实取证

| 项 | 证据 |
|---|---|
| 现行分支操作词表 | CREATE / SWITCH / ABANDON / RETURN（D-03 选项 A——确定性规则词表，词表优先级 RETURN > SWITCH > ABANDON；SWITCH / ABANDON 须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径） |
| 分支记录模型 | 五分量（branch_id / sourceRound / rounds（四元分离）/ version / lifecycle ∈ {ACTIVE, RETURNED, ABANDONED}）——轴外持久对象，会话内持久、会话结束失效（D-04 选项 A） |
| 现行回流语义 | 分支模拟结果默认不回流为主线结论（D-02 选项 A 推导——回流即把模拟当事实，违反 E8-G2-CC07）；无显式回流操作 |
| 分离不变式 | `simulation_result_is_not_fact`（simulation_recorded 事件互斥注记 + 语料分离格式双重保证） |
| 用户面现状 | 用户无法显式"采用某分支结论"——只能将分支内容重新表述为新的 WHAT_IF / CREATE 输入 |

## 2. 语义空缺分析

"采用某分支结论"是 F-4 冻结文本明确保留的产品负责人裁决面（D-02/D-03 选项 A 说明）。现行词表无回流操作；任何回流实现都触及 E8-G2-CC07 分离不变式的例外契约化——属 C3 行为语义空缺，授权 §4.7 纪律下不得由编码者补写。

核心设计约束（由 frozen 源可机械派生）：

- 回流不得把模拟结果表现为事实（E8-G2-CC07）——采纳结果须保留模拟来源标记；
- 回流不得自动修改主线作品内容（创作域补丁经 CREATE 提交纪律——S1-12 / 08 §11 局部变更纪律；自动写入即绕过创作版本化）；
- 回流操作须为显式用户指令（确定性系统回合——同分支操作纪律，决策追踪 `llm_used=false`、`reasonPrimary=explicit_user_direction`）；
- 轴外纪律不变（分支操作不新增体验轴触发器——D-02 选项 A；体验阶段轴保持 SIMULATION）。

## 3. 裁决选项（产品负责人择一）

- **选项 A（实现方建议）——启用显式回流操作 ADOPT_BRANCH。** 新增第五分支操作（词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH；须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径）。语义：目标分支记录附加 `adopted` 标记（lifecycle 契约不变——ACTIVE / RETURNED / ABANDONED 三态不增第四态，`adopted` 为分支记录附加属性而非生命周期状态）；经模拟域事件 `simulation_adopted` 登记（C6 §14 命名模式 `<domain>_<past_participle>` 派生，properties 含 branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact——采纳结果仍标记为模拟来源）；采纳结果呈现为新一轮模拟上下文（主线当前上下文不变，用户须另行 CREATE 提交方将采纳内容纳入作品——创作版本化纪律不变）；确定性系统回合（llm_used=false）。影响：新事件词表项 + 分支记录模型附加属性 + 呈现路径分支；需动态证据（S2A-F4 回归扩展 ADOPT 案例或新 RUN_ID）+ 黄金套件扩展 + policy 版本化变更文本。**（2026-10-09 经产品负责人裁决采纳——见 §6）**
- **选项 B——维持默认不回流，不启用显式操作。** 用户采用分支结论的现行路径：手动将分支内容重新表述为新的 WHAT_IF / CREATE 输入。影响：零产品变更；用户面无显式"采用"能力（即维持 F-4 保留面现状——冻结文本"须另案定义"的保留面继续保留）。
- **选项 C——经 CORRECTION 路径承载回流。** 回流表述为对主线模拟历史的纠正：`correction_applied` 事件承载（纠正域既有词表），分支内容作为纠正目标引用。影响：复用既有纠正域契约（无新事件词表）；但纠正语义为"修正错误"，与"采纳探索结论"语义不同（纠正目标派生确定性词表面向创作内容，模拟分支内容非创作内容——语义错配风险）；需版本化定义纠正目标派生对模拟分支内容的适用规则。

## 4. 选项 A 的实施影响（若裁决通过）

- 产品源码：`src/experience/simulation.ts`（分支记录模型附加 adopted 属性 + ADOPT_BRANCH 词表与执行）、`src/experience/events.ts`（simulation_adopted 事件类型 + properties schema）、`src/experience/runtime.ts`（ADOPT_BRANCH 路由与执行——确定性系统回合）、`src/experience/policy.ts`（policy 版本升版变更文本——语义扩展经版本化冻结）。
- 证据：动态证据（S2A-F4 回归扩展 ADOPT 案例或新 RUN_ID）；黄金套件扩展；G3-GOLDEN-0001 再生。
- 已提交证据保持冻结不改写（ADR-0002 §5）。
- 不改变任何既有分支操作（CREATE / SWITCH / ABANDON / RETURN）语义——纯增量。

## 5. 明确非结论

- v0.1.0 staged 期间本提案不生效、不改动任何代码；裁决前现行四操作词表保持冻结。v1.0.0 裁决后：ADOPT_BRANCH 语义定义经产品负责人裁决版本化冻结；产品实施按授权路径另行签发（实施前现行四操作词表保持冻结）。
- 选项 A 的事件名 / 属性集 / 呈现形态经产品负责人 2026-10-09 裁决采纳（未修改）——simulation_adopted 事件与 adopted 附加属性为冻结形态。
- 本提案不触及 F-5 记忆域（跨会话分支结论持久化属 F-5 裁决范围——D-04 选项 A）。
- 本定义不改变"分支模拟结果默认不回流为主线结论"的默认语义——显式回流是经用户指令的例外通道，非默认行为。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-09。
- 裁决：产品负责人（用户本人，PD-15）——**选项 A（启用显式回流操作 ADOPT_BRANCH），2026-10-09**。
- 裁决后登记：CR-27（decision-register——S2 分支回流操作版本化定义裁决登记）+ 迭代记录（s2a-f4 / s2a-f5 / s2b / corpus-alignment §6/§5 后续义务行）+ readiness-record 升版 v1.33.0（实现方义务，裁决签署后执行，2026-10-09 已完成）。
- 实施登记（2026-10-10）：ADOPT_BRANCH 产品实施完成（产品负责人 standing authorization"持续推进产品，完成，需要我签署和授权的，允许"——实施授权路径满足）——产品提交 `728b3de`（src/experience/simulation.ts / events.ts / runtime.ts / policy.ts 四文件；policy_v2.1.0 变更 1–5；state_machine_v1.5.0 不变）；执行器提交 `a7077ce`（s2a-f4.mjs 回归扩展 BRANCH-ADOPT 案例 10/10 + 17/17 断言；golden.mjs 黄金套件扩展 G10 案例组 40/40；s2b.mjs 版本引用同步）；证据提交 `0a4be6d`（S2A-F4-0001 重跑 10/10、17/17 断言、退出码 0 + G3-GOLDEN-0001 再生 40/40、10/10 断言、退出码 0 + S2B-0001 重跑 7/7、14/14 断言、退出码 0——退出码 0 只表示各运行断言通过，不设置任何 Golden Case、Gate 或产品状态为 PASS，E5 §2）；失败尝试 2 次按 ADR-0002 §5 归档留存（S2A-F4-0001-attempt-2026-10-10T00-36-33-645Z / G3-GOLDEN-0001-attempt-2026-10-10T00-38-52-586Z——均为执行器侧案例断言缺陷，产品运行时无缺陷）；迭代记录 P3-S2-IMPL-ITER-ADOPT v1.0.0；CR-27 RULED→IMPLEMENTED；readiness-record v1.34.0；EVIDENCE-MANIFEST-01 v1.4.0；S2 时代 G5 独立评测已完成（P3-S2-G5-WORKSHEET-01 v0.3.0——角色 5 逐项裁决签署，2026-10-10：16 项 = 12 PASS + 1 N/A（第 9 项），判定 PASSED（无条件）；CR-27 IMPLEMENTED→EVALUATED，decision-register v0.26.0）。
