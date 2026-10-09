# S2 范围裁决提案（S2 Scope Proposal）

**编号：** S2-SCOPE-PROPOSAL-01
**版本：** 1.3.0（2026-10-09：S2b 语义定义版本化冻结完成——S2B-SEMANTIC-FREEZE-01 v1.0.0 产品负责人裁决 + 签署（D-01…D-05 + 附列项 VERIFY 全项选项 A，CR-24；C1/C2/C3 Steward 确认完成）；§6“S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结”义务履行；S2b 实施授权待另行签发（P3-S2B-IMPL-AUTH-01，staged 待签发，前置依赖：F-5 关闭）；同时 S2a F-5 语义冻结完成（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0，CR-23——D-01…D-05 全项选项 A，F-5 实施授权生效）；其余内容与 v1.2.0 相同）**版本：** 1.2.0（2026-10-09：授权签发跟进——S2 实施授权 P3-S2-IMPL-AUTH-01 v1.1.0 已签发（产品负责人 2026-10-09 签署，AUTHORIZED）；S2a 首个迭代 F-1（OBL-01）开工；其余内容与 v1.1.0 相同）
**状态：** DECIDED——产品负责人已裁决（PD-23，2026-10-09：四项建议全案批准）；S2 实施授权 P3-S2-IMPL-AUTH-01 v1.0.0 staged 待签发
**背景：** P2 = CLOSED（2026-10-09，PD-22）；PD-20"先关再建"——关闭已完成，进入"建"。S2 范围项冻结于 S1 规范 §37（P3-S2｜Experience Vertical Slice 九项）与 §11（保留动作 DEEPEN / SIMPLIFY / REFRAME / CREATE / MODIFY / SEARCH 不得自动启用）；完整 G04 / G07 / G08 语义 DEFERRED TO S2（acceptance-mapping §B，PD-05 / PD-06 / PD-07）；Minimal Memory 进入 S2 须另作版本化决策（PB-04）；义务延续：OBL-01（HTTP 形态 503 首个 S2 迭代补测）、OBL-02（延迟指标纪律）、G3 黄金套件跨迭代回归。
**依据：** S1 规范 §11 / §37 / §38；acceptance-mapping §B / §C；PODR-001 PD-05 / PD-06 / PD-07 / PD-20 / PD-22；P2-SIGNOFF-01 遗留债务 D-01 / D-02 / D-03；E2 Stage 5（Creation 编排）

## 1. 待决事项（PD-23）

S2 功能构建的范围与批次，以及配套版本化变更：

1. S2 首批范围与批次（选项 A / B / C，见 §2–§3）；
2. 语义动作启用集（DEEPEN / SIMPLIFY / REFRAME / MODIFY / SEARCH）与策略版本（policy_v1.1.0 → policy_v2.0.0）；
3. Minimal Memory 持久化形态（PB-04 版本化决策）；
4. 证据义务编排（OBL-01 首个迭代补测、G3 黄金套件扩展、OBL-02 指标纪律）。

## 2. 选项（首批范围与批次）

**选项 A：全量一批**——S1 规范 §37 九项 + 义务延续项全部编入 S2 首个实施授权，单次大范围实施与单次证据运行。

**选项 B：分批（建议）**——
- **S2a（核心能力收束）：** 完整 G04 Creation（多轮分支、持久创作状态；E2 Stage 5 编排 CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK）、完整 G07 Correction（MODIFY 与 CORRECTION 的映射关系同批明确）、WHAT_IF 完整分支、Minimal Memory（形态见 §4.2）——清偿 P2 遗留债务 D-02（完整 G04/G07/G08 语义）并落实 PB-04；
- **S2b（体验动作扩展）：** DEEPEN / SIMPLIFY / REFRAME / Search 启用、First Experience 完整呈现、更完整 Golden Suite。

**选项 C：单能力逐切片**——每项能力一个实施授权 + 一个证据运行（同 S1 F-1/F-2/F-3 逐义务节奏）。

## 3. 对比

| 维度 | 选项 A（全量一批） | 选项 B（分批，建议） | 选项 C（逐切片） |
|---|---|---|---|
| 范围风险 | 高（九项同批，交叉面大） | 中（核心能力先收束，体验动作后扩） | 低（但迭代数多、节奏慢） |
| 与 P2 债务衔接 | D-02 一次性清偿 | S2a 即清偿 D-02（完整 G04/G07/G08 语义） | 逐项清偿 |
| 证据复杂度 | 单次大运行 | 两次运行（S2a / S2b 各一） | 多次小运行 |
| 先例 | 无 | 同 S1 分批迭代模式（F-1/F-2/F-3 已验证） | 同 S1 逐义务模式 |
| 进度 | 快但风险集中 | 均衡 | 慢 |

建议选项 B 的理由：与 S1 已验证的分批节奏一致；S2a 直接清偿 P2 遗留债务 D-02 并落实 PB-04 的 Minimal Memory 版本化决策，S2b 再扩展体验动作；每批边界清晰、可独立评测、独立签署。

## 4. 配套版本化变更（任一选项均须逐项裁决）

### 4.1 语义动作启用与策略版本

- 启用集：DEEPEN / SIMPLIFY / REFRAME / MODIFY / SEARCH 中启用哪些（S1 §11 保留动作，现均为禁用）；CREATE 已在关闭切片最小启用（policy_v1.1.0），完整 Creation 语义属本裁决范围。
- 策略版本：policy_v1.1.0 → policy_v2.0.0（SemanticAction / PolicyAction 扩展；优先级链扩展后须重冻结：STOP > CHANGE_DIRECTION > CORRECTION > CREATE > …）。
- 状态机：DEEPEN / SIMPLIFY / REFRAME 的阶段语义与触发须定义（CREATION 阶段已存在）；MODIFY 与 CORRECTION 的关系须明确（映射或别名）。
- C3 行为语义空缺（G-1…G-7）不得由编码者补写；行使到空缺语义时按升级规则处理。

### 4.2 Minimal Memory 持久化形态（PB-04 版本化决策）

- 持久化范围：跨会话意图 / 偏好 / 创作状态中持久化哪些（须逐项列明，不得隐含扩大）。
- 存储形态与位置：隐私六要素已批准（2026-10-09，P3-S1-PRIVACY-SIX-01 v0.4.0）：存储位置=中国大陆（cn）/ 阿里云 / 云存储；保留期限至少 6 个月；访问控制=最小所需权限（四角色 + 双签审批流）；加密=两层机制 + 密钥分离；删除机制=到期自动删除 + 删除审计。
- 不变式保持：当前意图优先（隔离测试上下文结论，G08 关闭切片已证）；Memory 写入不得绕过 Runtime 单一写入者（GS-06 / CC02 约束不变）；真实用户数据收集仍须隐私六要素批准范围内进行。

### 4.3 证据义务编排

- OBL-01：HTTP 形态 LLM 故障 503 补测编入 S2 首个迭代（无论选项 A/B/C）；进程内形态已经 `LlmGateway` 接口覆盖故障语义（EB-06/EB-06-NO-RETRY-STOP/EB-07）。
- G3 黄金套件：扩展新语义动作案例 + 完整 G04/G07/G08 案例，跨迭代回归基准延续。
- OBL-02：延迟测量方法 v1.0.0 已批准；任何指标宣称前须满足方法第 5 节样本纪律并注明分层；公开发布仍须另行满足 E3 统计 Gate（无统计阈值，PB-03 / PD-08）。

### 4.4 不变项（不属本裁决）

- 真实 LLM 提供方接入：仍须另经产品决策与隐私六要素批准（本裁决不开启）。
- S1 §38 优先级不变：Runtime Correctness > Agency Integrity > Experience Adaptation > Content Quality。
- P0 硬门槛零容忍（PD-08）：用户主导权、状态完整性、策略边界违反直接阻断。

## 5. 裁决区（产品负责人已填写，2026-10-09）

| 待决项 | 裁决 | 理由 | 日期 |
|---|---|---|---|
| 首批范围与批次（选项 A / B / C） | **选项 B（分批）**：S2a 核心能力收束 → S2b 体验动作扩展 | 与 S1 已验证的分批节奏一致；S2a 直接清偿 D-02 并落实 PB-04；每批边界清晰、可独立评测签署 | 2026-10-09 |
| 语义动作启用集与策略版本 | S2a：扩展既有 CREATE / CORRECTION / WHAT_IF 语义，MODIFY 登记为 CORRECTION 用户面别名；策略升 policy_v1.2.0、状态机升 state_machine_v1.1.0。S2b：新增 DEEPEN / SIMPLIFY / REFRAME / SEARCH，语义定义随裁决冻结后实施；策略升 policy_v2.0.0 | S2a 不新增动作集，语义扩展风险可控；S2b 新动作语义须先定义后实施（C3 语义空缺纪律） | 2026-10-09 |
| Minimal Memory 持久化形态（PB-04） | S2a 仅持久化短期记忆（跨会话主题 / 意图信号）+ 用户显式纠正 / 撤回记录；Current State / Session State 会话结束即失效、不持久化；长期记忆（偏好画像）S2 不启用；默认保留 6 个月后自动删除；写入经 Runtime 单一写入者 | 依 07 号契约 §1 原则（只使用"真正能够改善用户体验、且用户不会因此感到被监视"的信息；长期记忆永远不是最高优先级）；与隐私六要素（保留至少 6 个月）一致 | 2026-10-09 |
| 证据义务编排 | OBL-01 编入 S2a 首个迭代（环境门控 LlmGateway 注入缝，CR-18 选项 A 形态 + HTTP 形态 503 补测）；G3 黄金套件随 S2a 扩展；S2a 不做延迟指标宣称 | 首个迭代即清偿 D-01；指标纪律维持 PB-03 / PD-08 | 2026-10-09 |

## 6. 裁决记录

| 决策者 | 选择 | 日期 | 备注 |
|---|---|---|---|
| 产品负责人 | 四项建议全案批准（选项 B 分批；S2a / S2b 语义动作与版本化路径；Minimal Memory 短期记忆形态；OBL-01 首个迭代编排） | 2026-10-09 | PD-23；S2 实施授权 P3-S2-IMPL-AUTH-01 v1.1.0 已签发（2026-10-09 签署，AUTHORIZED）；S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结 |

**S2b 冻结跟进（2026-10-09）：** S2b 新动作语义定义已经产品负责人版本化冻结（S2B-SEMANTIC-FREEZE-01 v1.0.0，CR-24——D-01…D-05 + 附列项 VERIFY 全项选项 A，C1/C2/C3 Steward 确认完成）——上表末行“S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结”义务履行；S2b 实施授权待另行签发（P3-S2B-IMPL-AUTH-01 v0.1.0，staged 待签发，生效条件：产品负责人签署 + S2a F-5 关闭）。 |
