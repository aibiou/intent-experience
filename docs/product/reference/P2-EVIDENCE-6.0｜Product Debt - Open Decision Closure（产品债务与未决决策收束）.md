# P2-EVIDENCE-6.0

## Product Debt / Open Decision Closure（产品债务与未决决策收束）

**阶段：P2｜Product Engineering Contract（产品工程契约）**\
**文档性质：P2 正式关闭证据包 Part 6**\
**状态：Defined / Evidence Pending（已定义 / 证据待补）**

---

## 0. 本文件目的

本文件不负责解决所有产品细节。

本文件只回答四个问题：

1. 当前有哪些 Product Debt（产品债务）与 Open Decision（未决决策）？
2. 哪些必须在 P2 关闭前解决？
3. 哪些可以明确冻结并延期，不影响 P2 关闭？
4. 如何防止延期事项在 P3 实现过程中被 AI Coding Team（AI 编码团队）或工程人员自行解释成产品行为？

核心原则：

> **没有被明确关闭、冻结延期或注册为阻塞项的决策，不得进入实现。**

---

# 1. 决策状态定义

所有未决事项只能处于以下五种状态之一：

### CLOSED｜已关闭

已经完成产品决策，并有明确证据。

要求：

- 决策内容明确
- Owner 明确
- 影响范围明确
- 如影响行为，已有对应 Contract / Version
- 有验收或引用依据

不得在实现阶段重新解释。

---

### FROZEN-DEFERRED｜冻结延期

当前不解决，但明确决定：

> **本事项暂不进入当前产品切片，不得自行扩展为实现行为。**

必须记录：

- 延期原因
- 不影响当前 P2/P3 核心目标的理由
- 未来重新打开的条件
- 未来 Owner
- 是否需要新版本

冻结延期 ≠ 默认行为。

---

### P3-BLOCKER｜P3 准入阻塞

如果没有完成，该事项会导致 P3 无法进行。

典型原因：

- 会改变首个 Vertical Slice（首个完整产品切片）
- 会改变核心状态机
- 会改变 Policy
- 会改变核心 API / Schema
- 会改变 Golden Suite 验收语义
- 会导致实现团队必须猜测产品行为

---

### CONFLICT｜契约冲突

不同正式规范对同一行为给出了不可同时成立的定义。

处理：

```text
发现冲突
↓
停止受影响实现
↓
登记冲突
↓
引用冲突条款
↓
Product Decision
↓
更新相关 Contract / Version
↓
Regression
```

不得通过实现层“折中”。

---

### REQUIRES-OWNER｜缺少决策责任人

问题已经识别，但没有明确谁有权作最终决定。

此状态本身不能作为实现依据。

如果影响 P3 核心行为，则自动升级为 P3-BLOCKER。

---

# 2. Product Debt Register（产品债务登记表）

## PD-01｜Memory UI Final Form（记忆最终 UI 形态）

**当前状态：FROZEN-DEFERRED｜冻结延期**

### 当前决策

P2 不冻结完整 Memory UI（记忆界面）的最终视觉与交互形态。

P3 只实现满足核心 Memory Contract（记忆契约）所必需的最小能力。

### 必须保持不变的行为边界

无论 UI 最终形态如何：

```text
Current Intent
    >
Current Experience
    >
Session Context
    >
Short-term Memory
    >
Long-term Memory
```

且：

> Memory informs; never overrides current intent.

记忆不得因为 UI 尚未最终确定而获得额外权限。

### P3 是否阻塞

**否。**

前提：

- P3 不依赖完整记忆管理中心
- Memory Policy 已冻结
- Memory Write Boundary 已冻结
- Golden G08 可以验证

### 延期原因

当前问题主要属于体验呈现层，而非 P2 核心架构契约。

### 重新打开条件

出现以下任一情况时重新评估：

- Memory 成为 P3 核心用户路径的一部分
- 用户需要主动管理多个记忆
- 当前 UI 影响 Agency
- Memory 权限模型发生变化

### Version Impact

若仅改变 UI，不改变行为契约，可按 Type A 处理。

若改变 Memory 行为、权限、生命周期或优先级，必须进入 Type B / C Change Review，并更新相关 Contract。

---

# PD-02｜Recommendation Explanation UI（推荐解释 UI）

**当前状态：FROZEN-DEFERRED｜冻结延期**

### 当前决策

P2 不要求建立完整的“为什么推荐这个”解释系统。

P3 只保留：

> **为什么是这个？**

所需的最小可解释能力。

### 最小要求

解释必须能够回答：

- 当前体验为什么与当前意图有关
- 为什么适合当前状态
- 是否使用了当前上下文
- 是否存在明显的排除因素

不得：

- 暴露未经验证的内部推理
- 把推测伪装成事实
- 制造用户并不存在的兴趣
- 使用解释 UI 为未经授权的推荐行为背书

### P3 是否阻塞

**否。**

前提：

- Candidate Selection（候选选择）有 Decision Trace（决策轨迹）
- PolicyDecision 可追溯
- 用户可执行 CHANGE_DIRECTION

### 延期范围

暂不设计：

- 完整推荐解释中心
- 用户兴趣画像可视化
- 复杂推荐理由编辑
- 推荐偏好管理系统

---

# PD-03｜Creation Versioning UI（创造版本管理 UI）

**当前状态：FROZEN-DEFERRED｜冻结延期**

### 当前决策

P2 不冻结完整的 Creation Versioning UI（创造版本管理界面）。

P3 只要求底层 CreationState（创造状态）具备：

- 当前版本
- 修改记录
- Patch（增量修改）
- Undo（撤销）所需的最小状态能力
- 当前结果与旧结果之间的可追踪关系

### 必须保持的产品原则

用户说：

> “把这个改一下。”

系统应优先修改当前创造结果，而不是要求用户重新描述整个项目。

### P3 是否阻塞

**否。**

只要：

- MODIFY 合法
- Patch 可追踪
- State Version 可追踪
- Undo / Stop 在规定范围内成立

### 不进入 P3

- 完整版本时间线
- 分支管理 UI
- 历史版本浏览器
- 协作式版本系统

---

# PD-04｜Experience Template Presentation（体验模板最终呈现）

**当前状态：FROZEN-DEFERRED｜冻结延期**

### 当前决策

当前体验模板的最终视觉表现不在 P2 收束范围内。

P3 只冻结：

```text
体验类型
+
用户触发
+
初始状态
+
核心交互
+
状态转换
+
完成/退出条件
```

而不冻结所有视觉表现细节。

### P3 是否阻塞

**否。**

前提：

> 模板呈现变化不能改变 Experience Contract（体验契约）。

### 禁止

不得因为视觉实现方便而改变：

- 用户目标
- Policy Action
- State Transition
- Completion Condition
- Stop 行为
- Change 行为
- Agency 边界

---

# 3. P3-BLOCKER Register（P3 准入阻塞项）

以下事项不是普通 Product Debt。

它们必须在 P2 Exit Gate（P2 退出门槛）前具备关闭证据，或者被明确列为 P3 Entry Gate（P3 准入门槛）的硬条件。

---

## PB-01｜Seven V1 Contracts Authority Freeze（七份 V1 契约权威冻结）

**状态：P3-BLOCKER**

必须完成：

- C1 Core Schema V1
- C2 State Machine V1
- C3 Action & Policy V1
- C4 LLM Contract `llm_v1.0.0`
- C5 API Contract `api_v1.0.0`
- C6 Event & Analytics Contract `analytics_v1.0.0`
- C7 Evaluation System `evaluation_v1.0.0`

每份均必须具备：

```text
Authoritative Location
Version
Fingerprint / Revision Marker
Owner
Approval Record
```

当前只有定义，不代表已经完成冻结证据。

---

## PB-02｜First Experience Type & Canonical Path（首个体验类型与标准路径）

**状态：P3-BLOCKER**

P3 不能以“以后再选一个体验类型”的方式启动。

必须冻结：

```text
First Experience Type
↓
Canonical User Path
↓
Initial State
↓
Core Interaction
↓
Change
↓
Correction
↓
Stop
↓
Optional Creation Branch
↓
Completion / Exit
```

否则实现团队会自行选择一个“看起来最适合 Demo”的体验。

这是禁止的。

---

## PB-03｜Release-Gate Metric Definitions（发布门槛指标定义）

**状态：P3-BLOCKER（仅限真正作为 Release Gate 的指标）**

必须区分：

### Acceptance Criteria

硬条件：

```text
PASS / FAIL
```

例如：

- STOP 必须有效
- CHANGE 必须有效
- Memory 不得覆盖 Current Intent
- LLM 不得直接写 ExperienceState

### Product Metrics

质量指标：

- Intent Fulfillment Rate
- First Experience Fit
- Experience Continuation Rate
- Agency Score
- Experience Completion
- Voluntary Return

如果某指标被声明为 Release Gate，则必须进一步定义：

```text
Metric Definition
Measurement Window
Population
Calculation
Threshold
Evidence Source
Owner
```

否则不得声称该指标已经是发布门槛。

---

## PB-04｜Memory / Template Scope Decision（记忆与模板是否进入首个切片）

**状态：P3-BLOCKER**

必须明确：

> 某项未完成的 Memory / Experience Template 能力，是否真的进入 P3 Vertical Slice。

决策只能是：

### A — Included

进入首个切片。

则必须补齐对应：

- Contract
- State
- Policy
- API
- Event
- Evaluation
- Golden / Scenario Case

### B — Excluded

明确排除。

不得在 P3 中通过“顺便支持”重新进入产品。

### C — Minimal Slice Only

只保留完成核心闭环所需的最小能力。

必须明确最小边界。

---

# 4. Hidden Decision Prohibition（隐性决策禁止）

P2 关闭后，以下行为均视为违规：

### 4.1 通过代码决定产品行为

例如：

> “这个 UI 做起来比较方便，所以就默认自动推荐。”

禁止。

---

### 4.2 通过模型输出决定产品权限

例如：

> “模型判断用户应该继续，所以自动生成下一体验。”

禁止。

LLM 只能 Proposal（提议），不能获得 Policy 权限。

---

### 4.3 通过测试方便改变契约

例如：

> “STOP 测试不好写，所以暂时不测。”

禁止。

---

### 4.4 通过 Demo 表现补足产品定义

例如：

> “Demo 看起来不错，所以就把这个行为算作默认产品行为。”

禁止。

---

### 4.5 通过指标反推产品规则

例如：

> “用户停留时间较短，所以应该让 AI 多问几个问题。”

禁止。

Analytics（分析）观察系统，不控制 Runtime（运行时）。

---

# 5. Open Decision Register（未决决策登记模板）

所有仍未关闭的问题必须登记：

| 字段                  | 要求                                                                |
| ------------------- | ----------------------------------------------------------------- |
| Decision ID         | 唯一 ID                                                             |
| Question            | 未决问题                                                              |
| Context             | 为什么出现                                                             |
| Affected Contract   | 影响哪个契约                                                            |
| Affected Behavior   | 影响什么行为                                                            |
| Product Impact      | 产品影响                                                              |
| Agency Impact       | Agency 影响                                                         |
| Architecture Impact | 架构影响                                                              |
| P3 Impact           | 是否阻塞                                                              |
| Options             | 可选方案                                                              |
| Recommendation      | 建议方案                                                              |
| Owner               | 决策责任人                                                             |
| Status              | CLOSED / FROZEN-DEFERRED / P3-BLOCKER / CONFLICT / REQUIRES-OWNER |
| Version Impact      | 是否需要版本变化                                                          |
| Evidence            | 决策证据                                                              |
| Follow-up Condition | 重新打开条件                                                            |

---

# 6. Product Debt Admission Rule（产品债务准入规则）

一个问题只有同时满足以下条件，才能被标记为 FROZEN-DEFERRED：

1. 不改变 P0/P1/P2 已冻结原则
2. 不改变核心状态机
3. 不改变 Policy Priority（策略优先级）
4. 不改变 Semantic Action Priority（语义动作优先级）
5. 不改变 LLM 权限边界
6. 不改变 ExperienceState 单一写入者原则
7. 不改变 Memory Boundary（记忆边界）
8. 不改变 STOP / CHANGE / CORRECTION 语义
9. 不阻塞 P3 核心 Vertical Slice
10. 有明确重新打开条件
11. 不会因为延期而迫使工程人员自行猜测行为

只要有一项不满足：

> 不得简单标记为 Product Debt。

应升级为 P3-BLOCKER 或 CONTRACT CONFLICT。

---

# 7. Current Closure Classification（当前收束结论）

| 项目                               | 当前状态            | P2 影响   |
| -------------------------------- | --------------- | ------- |
| Memory UI Final Form             | FROZEN-DEFERRED | 不阻塞     |
| Recommendation Explanation UI    | FROZEN-DEFERRED | 不阻塞     |
| Creation Versioning UI           | FROZEN-DEFERRED | 不阻塞     |
| Experience Template Presentation | FROZEN-DEFERRED | 不阻塞     |
| Seven V1 Contract Authority      | P3-BLOCKER      | 必须补证据   |
| First Experience Type            | P3-BLOCKER      | 必须冻结    |
| Canonical User Path              | P3-BLOCKER      | 必须冻结    |
| Release-Gate Metric Definitions  | P3-BLOCKER      | 使用前必须定义 |
| Memory/Template Slice Scope      | P3-BLOCKER      | 必须明确    |
| Hidden Decisions                 | PROHIBITED      | 不得进入实现  |

---

# 8. P2 Closure Impact（对 P2 关闭的影响）

当前没有发现需要重新打开 P0 / P1 产品原则的事项。

当前也没有发现必须重新设计整体架构的 Product Debt。

因此：

> **已识别的普通 Product Debt 可以冻结延期，不阻塞 P2。**

但是：

> **P2 仍不能宣布 CLOSED。**

原因不是 Product Debt 本身，而是 P2 Exit Gate 所要求的**冻结证据、版本指纹、执行结果和签署记录尚未完成**。

---

# 9. No Hidden Decision Rule（零隐性决策原则）

从本文件开始：

> **没有登记的产品决策，不存在。**

如果 P3 实现过程中遇到：

- Spec 未定义
- 两份 Contract 冲突
- Golden Case 未覆盖
- Product Debt 与实现发生冲突
- UI 需要自行决定产品行为
- AI Coding Team 无法判断正确行为

必须：

```text
STOP
↓
Register Decision / Conflict
↓
Identify Authority
↓
Product Decision
↓
Update Contract if required
↓
Version
↓
Regression
↓
Resume
```

禁止：

```text
“先做出来看看”
```

禁止：

```text
“AI 自己判断”
```

禁止：

```text
“以后再改”
```

---

# 10. Part 6 Acceptance Criteria（本部分验收标准）

Part 6 只有满足以下条件，才可以进入 P2 Exit Gate：

- [x] 已识别主要 Product Debt
- [x] 已区分 Product Debt 与 P3 Blocker
- [x] 已明确冻结延期事项
- [x] 已定义 Open Decision Register
- [x] 已禁止隐性产品决策
- [x] 已定义重新打开条件
- [x] 未重新打开 P0/P1 原则
- [x] 未修改既有 Contract 语义
- [x] 未把 Product Debt 当作 P2 Pass
- [ ] P3 Blocker 的实际证据已完成
- [ ] Owner / Approval / Evidence 已补齐

---

# 11. Part 6 Status

**STATUS：DEFINED / EVIDENCE PENDING**

Part 6 已完成“定义层”的收束。

但：

> **Part 6 不构成 P2 Pass。**

当前总体状态仍为：

```text
P2
Closure Candidate
        ↓
Part 1  Contract Freeze Evidence     Defined / Pending
Part 2  Cross-Contract Evidence      Defined / Pending
Part 3  Golden Suite Evidence        Defined / Pending
Part 4  Engineering Boundary         Defined / Pending
Part 5  Evaluation Evidence          Defined / Pending
Part 6  Product Debt Closure         Defined / Pending
        ↓
Part 7  P2 Exit Gate & Sign-off
        ↓
P2 CLOSED
```

---

# 12. Final Governance Statement

本阶段的最终判断：

> **当前产品债务没有发现需要重新打开 P0/P1/P2 核心原则的事项。**

> **已识别的 UI / 表现层债务可以冻结延期。**

> **真正影响 P3 准入的事项已经明确列为 Blocker，不得由实现团队自行补决策。**

> **因此，现在可以准备 P2 Exit Gate，但不能声称 P2 已关闭。**

最终执行原则保持不变：

> **不猜测契约，不用实现替代产品决策，不用测试绿灯替代产品验收。发现冲突先停下、记录并裁决；满足契约并通过独立验收后，才判定完成。**
