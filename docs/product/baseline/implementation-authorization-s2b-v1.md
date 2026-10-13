# P3-S2b 实施授权（S2b）

**编号：** P3-S2B-IMPL-AUTH-01
**版本：** 1.0.0（2026-10-09：产品负责人签署签发——生效条件全部满足：① 产品负责人签署（2026-10-09 会话内"签署"确认）；② S2a F-5 关闭（动态证据 S2A-F5-0001 通过 9/9 案例、14/14 断言、退出码 0，提交 `1cc0083`；迭代记录 P3-S2A-IMPL-ITER-F5 v1.0.0 登记；readiness-record v1.28.0 登记——治理提交 `8ea04a8`）。本授权生效，S2b 实施开工）**版本：** 0.1.0（2026-10-09：staged 待产品负责人签发——生效条件：① 产品负责人签署；② S2a F-5 关闭（动态证据 S2A-F5-0001 通过 + 迭代记录登记 + readiness-record 登记）。两项条件均满足前本授权不生效，不授权任何 S2b 实施）
**状态：** AUTHORIZED（2026-10-09 产品负责人签署——生效条件①②全部满足；S2b 实施开工；实施按 S2B-SEMANTIC-FREEZE-01 v1.0.0 §3/§4 冻结文本执行（policy_v2.0.0 / state_machine_v1.5.0））
**背景：** S2 范围经 PD-23 裁决（选项 B 分批）：S2a 核心能力收束（F-1…F-4 已关闭；F-5 语义冻结完成——S2A-F5-SEMANTIC-FREEZE-01 v1.0.0，CR-23，实施授权生效，待实施与证据）；S2b 体验动作扩展。S2b 语义定义已经产品负责人版本化冻结（S2B-SEMANTIC-FREEZE-01 v1.0.0，CR-24——D-01…D-05 + 附列项 VERIFY 全项选项 A，C1/C2/C3 Steward 确认完成）——PD-23 §6"S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结"义务已履行。S2b 实施须另行授权（PD-23 §6；S2-SCOPE-PROPOSAL-01 §6）——本授权即该授权文件。
**依据：** PD-23（S2-SCOPE-PROPOSAL-01 v1.3.0 §5/§6）；S2B-SEMANTIC-FREEZE-01 v1.0.0（`../p3-s1/s2b-semantic-freeze-staged.md`，CR-24）；P3-S2-IMPL-AUTH-01 v1.3.0 §4/§5（持续约束延续）；S1 规范 §37（S2 范围）；授权 §5.1–§5.8（持续约束）

## 1. 授权范围

S2b（体验动作扩展）产品运行时代码的开发与动态证据执行：

1. DEEPEN / SIMPLIFY / REFRAME 语义动作启用——顶层语义动作（14 §8 恒等映射）+ 创作域顶层补丁操作承载（与 add / remove / modify 同级；操作识别为确定性规则词表；非创作会话输入按升级规则处理）（S2B-SEMANTIC-FREEZE-01 D-01 选项 A）；
2. SEARCH 内部能力动作启用——VERIFY → SEARCH / ANSWER 路由（14 §8）；作用面：当前体验内容 / 创作对象 / 会话内上下文，只读、不改变体验、不触发产品动作；无外部网络出口（D-02/D-03 选项 A）；
3. First Experience 完整呈现——呈现路径补全：入口流程（问题呈现 → 开始探索 → 换一个）+ 六阶段逐阶段呈现（Curiosity / Understanding / Simulation / Branch / Creation / Completion）+ 完成 / 退出 / 中断完整流程；E2 契约面（Experience Type / Trigger / Initial State / Allowed Actions / State Transitions / Completion / Exit / Interrupt / Policy / Evaluation）不变；视觉样式不在冻结范围（D-04 选项 A；E2 §5/§6/§7）；
4. 更完整 Golden Suite——S2b 案例纳入 G3-GOLDEN-0001 回归基准（policy_v2.0.0 / state_machine_v1.5.0 断言同步；G3-E-3 双遍 SHA256SUMS 纪律不变）；
5. S2b 动态证据运行（S2B-0001）+ 独立评测（G5 式评测包；角色 5 签署）。

**不授权：** 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；VERIFY 语义动作启用（S2B-SEMANTIC-FREEZE-01 附列裁决：选项 A 不启用）；任何 Gate PASS 判定（只有真实运行证据 + 独立评测 + 正式签署，E5 §2）。

**前置依赖（生效条件②）：** S2a F-5 关闭——动态证据 S2A-F5-0001 通过 + 迭代记录登记 + readiness-record 登记——**已满足（2026-10-09，治理提交 `8ea04a8`）**。policy_v1.5.0 / state_machine_v1.4.0 为 S2b 升版基线。

## 2. 首批义务（S2b）

1. **G-1：** DEEPEN / SIMPLIFY / REFRAME 语义动作实施（分类器识别词表；创作域补丁操作域扩展 {add, remove, modify, deepen, simplify, reframe}；非创作会话升级路径；优先级链扩展冻结）。
2. **G-2：** SEARCH 内部能力实施（Context Builder 只读检索集成；无外部网络出口；检索不改变体验不变式）。
3. **G-3：** First Experience 完整呈现实施（入口流程 + 六阶段呈现 + 完成 / 退出 / 中断；E2 契约面不变）。
4. **G-4：** S2b 动态证据运行 S2B-0001 + G3 黄金套件扩展 + 独立评测（角色 5 签署）。

## 3. 版本化变更清单（已冻结——S2B-SEMANTIC-FREEZE-01 v1.0.0 §3/§4）

| 变更 | 版本 | 说明 |
|---|---|---|
| 策略（S2b） | policy_v1.5.0 → policy_v2.0.0 | SemanticAction 域扩展：启用 DEEPEN / SIMPLIFY / REFRAME（14 §8 恒等映射）；SEARCH 不入 SemanticAction 域（内部能力动作，14 §7）；VERIFY 不启用（附列裁决）；PolicyAction 域确认 SEARCH 内部能力定位（14 §7 taxonomy 既有）；创作域补丁操作域扩展 {add, remove, modify, deepen, simplify, reframe}；优先级链扩展冻结：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > DIRECT_ANSWER > WHY > WHAT_IF（S1 §12 既有相对顺序保持）；非创作会话保护（无创作对象时按升级规则处理）；SEARCH 能力纪律（只读、不改变体验、不触发产品动作、无外部网络出口、检索范围限当前体验内容 / 创作对象 / 会话内上下文） |
| 状态机（S2b） | state_machine_v1.4.0 → state_machine_v1.5.0 | 创作域子状态机：补丁操作域扩展为 {add, remove, modify, deepen, simplify, reframe}（轴外承载纪律不变，F-2 D-02；每次合法补丁提交版本 +1，S1-12 不变式）；SEARCH 能力状态纪律：SEARCH 为无状态只读能力调用，不产生体验状态迁移、不产生创作域补丁（state_machine 无 SEARCH 迁移行——能力纪律经 policy_v2.0.0 承载）；First Experience 呈现路径：六阶段呈现迁移为已有体验阶段轴的呈现补全（E2 §6；13 号状态机阶段轴不变） |
| 契约冻结 | C1 / C2 / C3 Steward 确认 | S2b 版本化变更文本于其首个动态证据运行前完成冻结 + Steward 确认（G1 式纪律）——**已完成（2026-10-09，S2B-SEMANTIC-FREEZE-01 v1.0.0 签署时确认，CR-24）** |

## 4. 持续约束（授权不解除——P3-S2-IMPL-AUTH-01 §5 全文延续）

1. 隐私护栏：真实用户数据禁收（隐私六要素批准范围内除外）；仅允许合成数据或经明确批准的脱敏夹具。
2. P0 硬门槛零容忍（PD-08）：用户主导权、状态完整性、策略合规违反直接阻断。
3. 任何 Gate 不因代码存在、测试全绿或演示成功而 PASS；只有真实运行证据 + 独立评测 + 正式签署（E5 §2）。
4. 每次运行按 E5 §3 记录完整版本矩阵；失败结果按 ADR-0002 §5 如实登记，不得重跑至通过为止而不留失败记录。
5. 密钥、访问令牌、原始个人隐私数据不得进入证据文件。
6. 不得由实现代理自行批准其实现的产品 Gate；独立评测负责人（角色 5）保留审阅与否决权。
7. C3 行为语义空缺（G-1…G-7）不得由编码者补写；DEEPEN / SIMPLIFY / REFRAME / SEARCH 语义定义已经版本化冻结（S2B-SEMANTIC-FREEZE-01 v1.0.0）——实施不得偏离冻结文本；新语义空缺出现须另行版本化裁决。
8. Minimal Memory 写入不得绕过 Runtime 单一写入者（GS-06 / CC02 约束不变）；模型提出 `state_update` 时 Validator / Runtime 拒绝（GS-06）。

## 5. 签署区

| 角色 | 签署 | 结论 | 日期 |
|---|---|---|---|
| 产品负责人（用户本人，PD-15） | 已签署（2026-10-09） | 签署——生效条件①②全部满足，本授权生效（v1.0.0），S2b 实施开工 | 2026-10-09 |

**顺序纪律：** 本授权生效前不得实施 S2b（PD-23 §6；授权 §5.7 C3 语义空缺纪律）；S2b 实施授权不解除任何 Gate 纪律。
