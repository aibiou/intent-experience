# P3-S1 验收映射（范围已批准；运行证据待执行）

**编号：** P3-S1-ACCEPTANCE-MAP-01
**版本：** 0.4.0（2026-10-09：PD-21 范围回写——§B G04/G07/G08 与 §C CREATE 行从 DEFERRED TO S2 更新为 P2 关闭切片最小范围（产品负责人 2026-10-09 批准；能力待实施、执行待扩展黄金套件）；其余内容与 v0.3.2 相同）
**状态：** APPROVED FOR S1 SCOPE BY PODR-001；评测负责人复核待办；所有运行证据 NOT RUN
**提醒：** 下表是来源条款的工作映射，不是测试结果；所有运行证据均为 `NOT RUN`。未批准动作不在此臆定语义。

## A. S1 Golden Subset

| 编号 / 动作 | 来源条款 | 拟定范围 | 预期行为（按原规范转述） | 必需负向案例 | 证据负责人 | 阶段 / 当前证据 |
|---|---|---|---|---|---|---|
| GS-01 Direct Answer | `P3-S1｜Runtime Vertical Slice Specification` §26 GS-01；Evaluation System V1 Golden Cases / Direct Answer；API V1 Case 01 | S1 核心 | 用户要求直接回答时走 `DIRECT_ANSWER → ANSWER`，不强迫进入探索体验 | 不应继续生成体验或隐式推荐；模型异常时不得改写用户意图 | 评测负责人（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN |
| GS-02 Why | S1 §26 GS-02；Evaluation System V1 G02 Why | S1 核心 | “为什么？”触发 `WHY → EXPLAIN` | 不得把问题误作 STOP/CHANGE；不得声称无依据事实 | 评测负责人（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN |
| GS-03 Change | S1 §26 GS-03；S1-CC20 / S1-CC02-H03；API V1 Case 03 | S1 核心 | 改变方向时取消旧生成/动作、拒绝旧候选，再开始获准的新方向 | 并发旧回复、取消失败、重复请求、旧候选不得污染新状态 | 工程负责人 + 独立评测者（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN |
| GS-04 Stop | S1 §26 GS-04；S1-CC19 / S1-CC02-H02；Evaluation System P0 STOP blocker；API V1 Case 04 | S1 核心 | STOP 终止当前 Experience，不自动开启新体验、不继续发送内容 | 在生成中 STOP 后旧结果返回；后台 retry / continuation；重复 STOP | 工程负责人 + 独立评测者（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN；任何违规为 P0 阻断 |
| GS-05 State Version Conflict | S1 §26 GS-05；S1 state-version / stale-write contract sections；CC02 stale-write cases；API V1 Case 05 | S1 核心 | 陈旧版本写入（携带旧 `expected_state_version`，规范字段名按 PD-16）返回 `STATE_VERSION_CONFLICT`，不得覆盖新状态 | 并发两个写入；旧版本重试；冲突恢复不得丢失最新状态 | 工程负责人 + 评测负责人（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN |
| GS-06 LLM State Mutation Rejection | S1 §26 GS-06；C07–C08 / C07–C09 候选文本；S1-CC01、S1-CC02-H01/H05；CC02 Runtime single-writer 约束 | S1 核心 | 模型提出 `state_update` 时 Validator / Runtime 拒绝；模型不直接写状态 | 伪造合法字段、额外字段、嵌套状态变更、策略绕过 | 架构负责人 + 独立评测者（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN；C4 权威 / C07–C08 迁移处置待 CR-10 / CR-11 确认 |
| S1-ACT-WHAT_IF 基础动作（非 Golden 编号） | S1 §11 / §14 WHAT_IF → SIMULATE；PODR-001 / PD-06；E8-G2-CC07（假设 / 事实 / 模拟结果分离） | S1 契约动作；不新增 GS 编号 | 按既有 Policy 产生当前单次模拟提案；区分事实、推断与假设；不创建持久 / 多轮分支状态 | 不能把假设当事实；不修改产品状态；输入含 STOP 时 STOP 优先；模拟失败不得继续或伪造结果 | 工程负责人 + 独立评测者（已指定：用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08） | P3-S1；NOT RUN |

注：上表"必需负向案例"列内容源自 SRC-27 §34 P0 阻断清单与契约原则的派生；SRC-27 §26 原文仅含正向输入与 Expected，未含负向案例。负向案例不改变 GS-01–GS-06 原义。

## B. P2 G01–G08 完整义务到 S1 / 后续切片

| P2 编号 | P2 来源与义务 | 与 S1 子集关系 | 当前映射状态 | 不可误读之处 |
|---|---|---|---|---|
| G01 Direct Answer | Evaluation System V1 §5 Golden Cases | 与 GS-01 名称相近，需逐项核对输入、轨迹、边界和评分 | PROPOSED；S1 映射候选；运行 NOT RUN | 名称相似不等于验收等价或 PASS |
| G02 Why | Evaluation System V1 §5 | 与 GS-02 名称相近，需核对事实与解释标准 | PROPOSED；S1 映射候选；运行 NOT RUN | 不以回答流畅替代产品契约正确 |
| G03 What If | Evaluation System V1 §5；API Contract V1 Case 02；S1 §11 / §14 / §26 | S1 支持基础 WHAT_IF 契约动作；完整 WHAT_IF 多轮 / 持久分支属于 S2 | 基础动作测试 S1 NOT RUN；完整 P2 G03 NOT RUN / DEFERRED TO S2 | S1 动作支持不等于完整 G03 通过；不可扩大为分支体验 |
| G04 Creation | Evaluation System V1 §5；API Contract V1 CREATE 示例；P3 Entry / Creation 参考 | S1 明确排除完整 Creation；E2 的最小 Creation 安排到 S2；P2 关闭切片（PD-21）实施最小 Creation 能力（CREATE 语义动作 → CREATE Policy Action → CREATION 阶段） | P2 关闭切片（PD-21，2026-10-09 批准）：最小 Creation 能力待实施，实施后经扩展黄金套件执行；完整 Creation 仍 DEFERRED TO S2（按 PD-05 / PD-06） | API 存在 CREATE 不代表 S1 必须实现；P2 G04 仍须未来验收 |
| G05 Change | Evaluation System V1 §5；S1 GS-03；API Contract V1 Case 03 | S1 映射候选 | PROPOSED；需验证取消、旧候选拒绝及状态轨迹；NOT RUN | 需对照完整 G05 原始输入、指标、并发要求，不仅测单一路径 |
| G06 Stop | Evaluation System V1 §5；S1 GS-04；CC02 STOP；API Contract V1 Case 04 | S1 映射候选 | PROPOSED；P0 blocker；NOT RUN | STOP 后继续 / 后台续行不能被平均分抵消 |
| G07 Correction | Evaluation System V1 §5 G07 Correction | S1 没有启用 Correction Semantic Action；S2 候选；P2 关闭切片（PD-21）实施最小 Correction 能力（CORRECTION 语义动作 → EXPLAIN——重评估为内部过程，须落到合法 Policy Action） | P2 关闭切片（PD-21，2026-10-09 批准）：最小 Correction 能力待实施，实施后经扩展黄金套件执行；完整 Correction 仍 DEFERRED TO S2（按 PD-05） | 不推断 correction 的状态写入和确认语义；P2 G07 保留 |
| G08 Memory Boundary | Evaluation System V1 §5 G08；Memory/User State V1；PODR-001 / PD-07 | S1 无持久跨会话 Memory；隔离测试上下文验证当前意图优先；完整 Memory Boundary 评测放 S2；P2 关闭切片（PD-21）验证当前会话内边界（不持久化任何跨会话记忆，PD-07 不变） | P2 关闭切片（PD-21，2026-10-09 批准）：当前会话边界证明待实施与执行（零持久化事件）；完整 Memory Boundary 仍 NOT RUN / DEFERRED TO S2 | 不将测试夹具描述为已建成记忆产品；不声称完整 G08 通过 |

## C. 动作、API 与范围边界

| 项目 | 归档事实 | S1 处理 | 状态 |
|---|---|---|---|
| `WHAT_IF` | S1 §11 启用该动作；§14 定义 `WHAT_IF → SIMULATE`；完整 WHAT_IF 分支在 S2 | S1 只做当前单次模拟提案，不建立持久 / 多轮分支；尊重 STOP 优先和状态不越权 | 范围已由 PD-06 决定；执行 NOT RUN |
| `CREATE` | API 示例包含 CREATE；S1 §11 将其列为未来动作，且明确完整 Creation 非目标 | S1 禁用；最小 Creation Branch 属 S2 候选；完整 IDE 不在 P3 初始范围；P2 关闭切片（PD-21）实施最小 CREATE 语义动作（仅关闭切片启用） | P2 关闭切片（PD-21，2026-10-09 批准）：最小 CREATE 已批准待实施；完整 Creation 仍属 S2；G04 待执行 |
| `SEARCH` | API / 功能表出现 SEARCH；S1 §11 将其列为未来动作 | S1 禁用；接口示例不授权搜索产品能力 | S1 范围已由 PD-06 决定 |
| STOP 与 CHANGE | 多份契约均规定用户控制不可覆盖，CC02 强调中断旧生成与阻止旧状态污染 | 是 S1 硬边界；具体动态测试仍待实现后执行 | 范围明确；NOT RUN |

## D. 执行记录约束

每次案例执行至少绑定契约 / Schema / State Machine / Policy / Prompt / Model / Evaluation Corpus / Code Revision；保留输入、状态前后、决定轨迹、事件、预期与实际结果。只有实际证据可将 `NOT RUN` 改为执行状态；只有适用验收条件满足且有独立复核，方可记录 PASS。不得由实现代理自行批准映射或判定 P2 关闭。

## E. 产品负责人裁决引用

本映射的产品范围依据 PODR-001 / PD-05–PD-08 已批准。范围审批不代表评测负责人已复核、不代表任何案例执行过，也不代表 P2 G01–G08 已通过。

## F. 动作优先级与编号引用

- 同一动作优先级层内的 WHY > WHAT_IF 仅按 PODR-001 / PD-12 作为解释顺序，不改变权限；未覆盖的冲突输入阻断并升级，禁止由模型自行裁决。
- Case ID 按 PD-11 v1.0.1 来源隔离：E8-G2、CC02 矩阵、CC01 规范、CC02 硬检查 / GXC / 负向案例不得以相同裸编号相互替代。
- 严重度按 PD-13 按来源适用；同一发现跨 CC01 / CC02 且等级不同，采用较严格等级并由非作者复核人记录。
- 本映射记录的是范围和预期，不构成任何运行证据；全部案例仍为 NOT RUN。
