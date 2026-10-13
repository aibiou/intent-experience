

# Product Development Governance V1

## 产品化开发总流程与变更治理规范

**Owner:** Product Lead\
**Status:** Product Master Baseline\
**Version:** V1.0

---

# 01. 项目基本定位

我们开发的不是：

- AI Demo
- AI 玩具
- AI Chat UI
- AI 功能集合
- AI 能力展示器
- Prompt 集合
- 一堆可以生成东西的工具

我们开发的是：

> **一个以个人当前意图、状态和上下文为基础，动态组织并生成下一段体验的 Personal Experience Engine。**

因此所有开发决策必须回答：

```text
这个功能
↓
解决哪个用户问题？
↓
属于哪个产品核心能力？
↓
改变哪个用户行为？
↓
是否增强核心体验闭环？
↓
是否产生长期产品价值？
```

如果只是：

> “AI 现在能做到，所以我们做。”

**禁止进入主产品。**

---

# 02. 产品开发的五层结构

整个项目必须始终保持五层结构：

```text
L1 Product Vision
        ↓
L2 Product Principles
        ↓
L3 Product System
        ↓
L4 Experience / Feature
        ↓
L5 Implementation
```

不能反过来：

```text
AI 能做什么
↓
做一个功能
↓
再想它有什么用
↓
最后找产品定位
```

后者是典型的工具型开发思维。

---

# 03. L1｜Product Vision

当前产品核心命题：

> **帮助一个人从“我现在想做点什么”，自然进入一个真正适合此刻的体验，并允许他随时探索、理解、创造、改变方向或结束。**

核心公式：

```text
Personal Context
×
Current Intent
×
Generative Experience
=
Personal Experience
```

核心系统问题：

> **Next Best Experience**

而不是：

> Next Best Content

更不是：

> Next Best Click

---

# 04. L2｜不可改变的产品原则

除非未来正式修改 Product Constitution，否则以下原则不能被单个 Feature 改变。

## P01 人决定方向

AI 降低实现成本，不接管人生方向。

## P02 当前意图最高优先级

长期偏好不能覆盖当前明确意图。

## P03 用户可以随时停止

STOP 是成功状态，不是流失状态。

## P04 AI 必须可被打断

用户新意图优先于正在生成的内容。

## P05 能行动就不要无意义提问

避免把用户变成产品配置人员。

## P06 AI 不隐藏答案制造 Engagement

用户要答案，就直接给答案。

## P07 推荐必须有授权

用户没有授权时，默认 WAIT。

## P08 记忆必须克制

记住是为了帮助，不是为了建立越来越完整的人物画像。

## P09 AI 不拥有产品状态

LLM 是能力，不是系统控制器。

## P10 不以 Session Time 为北极星

核心价值是：

> 用户是否获得了他想要的体验。

---

# 05. L3｜产品系统

当前已经确定的核心系统：

```text
User
 ↓
Current State
 ↓
Intent Engine
 ↓
Experience State
 ↓
Experience Policy
 ↓
Experience Runtime
 ↓
LLM / Search / Tool
 ↓
Validator
 ↓
User Action
 ↓
State Update
 ↓
Memory Policy
```

同时存在：

```text
Next Best Experience Engine
Creation Runtime
Memory Engine
Observability
```

这些不是孤立 Feature。

它们共同组成：

> **Personal Experience Engine**

---

# 06. 产品能力地图

V1 不继续无限增加功能，而是先把能力收敛为六个核心模块。

```text
                    Personal Experience Engine
                              │
       ┌──────────┬───────────┼──────────┬──────────┐
       ▼          ▼           ▼          ▼          ▼
     Intent   Experience   Runtime    Creation   Memory
     Engine    Policy                  Runtime
       │
       └─────────────────────────────────────────┐
                                                 ▼
                                      Next Best Experience
```

再加：

```text
Infrastructure
├── Model Gateway
├── Tool Gateway
├── State Store
├── Event System
├── Observability
└── Evaluation
```

---

# 07. 当前产品开发阶段

我们正式定义项目阶段。

## Phase 0｜Product Foundation

目标：

> 把产品到底是什么定义清楚。

状态：

**基本完成。**

包括：

- Vision
- Product Thesis
- Human-first Principles
- Core Loop
- Product Architecture
- Core Metrics

---

# 08. Phase 1｜System Definition

目标：

> 把产品系统定义成工程可以实现的结构。

当前：

**基本完成。**

包括：

- Home
- Intent
- Experience
- Runtime
- Policy
- Memory
- Creation
- Next Best Experience
- Engineering Protocol

---

# 09. Phase 2｜Vertical Slice

下一阶段不是继续疯狂增加 Screen。

而是：

> **把一条完整用户路径真正跑通。**

目标：

```text
Open
↓
Express Intent
↓
Understand
↓
Enter Experience
↓
Interact
↓
Ask
↓
Explore
↓
Create
↓
Modify
↓
Complete
```

也就是：

```text
Home
→ Intent
→ Experience
→ Runtime
→ Simulation
→ Creation
→ Completion
```

我们已经有：

**frictionless_world_v1**

所以它将作为：

> **第一条 Golden Experience**

而不是马上再做十条 Experience。

---

# 10. 为什么先做 Vertical Slice

因为现在最大的风险不是：

> 功能不够。

而是：

> **系统各部分接起来以后是否真的形成产品。**

必须验证：

```text
Intent
    ↓
Experience
    ↓
Interaction
    ↓
Understanding
    ↓
Creation
    ↓
Completion
```

是否真的连通。

如果这一条都没有跑通：

继续增加 Experience Type 只是在扩大问题。

---

# 11. Phase 3｜Controlled User Testing

Vertical Slice 完成后，才进入真实用户测试。

不是先问：

> “你喜欢这个产品吗？”

而是观察：

```text
用户为什么打开？
↓
是否能够表达意图？
↓
AI 是否理解？
↓
第一体验是否匹配？
↓
用户是否自然产生问题？
↓
是否愿意参与？
↓
是否自然进入创造？
↓
是否可以自然结束？
↓
是否愿意回来？
```

---

# 12. Phase 4｜Product-Market Signal

只有当核心行为成立，才开始验证：

- 哪些 Experience 最有价值
- 哪些用户状态最常见
- 哪些 Intent 最有价值
- 哪些 Creation 类型最自然
- 哪些 Memory 真正有帮助
- 什么形成 Return

此阶段才开始扩大 Experience Graph。

---

# 13. Phase 5｜Scale

最后才考虑：

- 更多 Experience
- 更强模型
- 更丰富工具
- 更复杂生成能力
- 更强个性化
- Creator ecosystem
- 商业化
- 更复杂推荐

**不是现在。**

---

# 14. Feature Admission System｜功能准入机制

以后任何人提出一个新功能，必须经过 Feature Admission。

统一提交：

```text
Feature Proposal
```

至少回答：

### 1. User Problem

解决什么真实问题？

### 2. User Moment

用户在什么时刻需要它？

### 3. Product Role

属于哪个核心系统？

### 4. Behavioral Change

希望用户因此发生什么行为变化？

### 5. Core Loop Impact

增强哪一段：

```text
Curiosity
→
Exploration
→
Understanding
→
Creation
→
New Exploration
```

### 6. Agency Impact

是否降低用户控制权？

### 7. Complexity Cost

增加多少系统复杂度？

### 8. Data Cost

需要采集什么数据？

### 9. Memory Impact

是否需要记忆？

### 10. Policy Impact

是否改变 Policy？

---

# 15. Feature Score

新功能必须至少经过五项评估：

```text
User Value
Product Fit
Strategic Value
Complexity Cost
Agency Risk
```

概念评分：

```text
Feature Value
=
User Value
×
Product Fit
×
Strategic Value
-
Complexity
-
Agency Risk
```

注意：

**不是简单算数学分数。**

它是决策框架。

---

# 16. Feature Kill Rule

以下情况直接考虑砍掉：

### Case A

只是因为：

> “AI 能做。”

### Case B

只是增加：

> Session Time

### Case C

用户没有明确需求。

### Case D

需要用户学习复杂产品机制。

### Case E

会增加大量状态，但没有对应用户价值。

### Case F

破坏：

> 人决定方向，AI 降低成本。

### Case G

只是 Demo 看起来很酷。

### Case H

功能可以用一个已有能力解决。

最后一个尤其重要：

> **不要为了展示系统能力制造新 Feature。**

---

# 17. Change Management｜需求变更管理

从现在开始：

**已经确认的产品规则不能随意修改。**

所有修改分为三类。

---

## Type A｜Minor Change

不改变核心行为。

例如：

- 文案
- spacing
- UI 微调
- 动画
- icon

可以快速迭代。

---

## Type B｜Behavior Change

改变用户行为或 Runtime。

例如：

> “换一个”的逻辑改变。

必须：

```text
Product Review
↓
Policy Review
↓
Acceptance Test
↓
Version
```

---

## Type C｜Architecture Change

改变系统边界。

例如：

> 让 LLM 直接决定 Policy。

这种修改：

**禁止由工程师自行决定。**

必须重新评估：

```text
Product
Architecture
Security
Data
Agency
Testing
Migration
```

---

# 18. No Silent Changes

这是 AI Coding 团队必须特别遵守的规则。

禁止：

```text
Prompt 改一下
↓
Behavior 变了
↓
上线
```

禁止：

```text
为了让 Demo 更好看
↓
偷偷增加自动推荐
```

禁止：

```text
为了减少代码
↓
让 LLM 直接决定 State
```

任何行为变化必须有：

```text
Change ID
Reason
Owner
Version
Test
```

---

# 19. Product Baseline

我们建立：

> **Product Baseline**

当前 Baseline：

```text
PB-001
```

包含：

```text
Vision
Principles
Architecture
Core Loop
Runtime Contract
Policy Rules
Memory Rules
Experience Rules
Metrics
Acceptance Criteria
```

任何工程版本都必须说明：

```text
Implemented Against:
PB-001
```

这样未来即使团队扩大，也不会出现：

> “我不知道当初为什么这么设计。”

---

# 20. Decision Log

所有重要产品决策建立：

```text
Decision ID
Date
Decision
Reason
Alternatives
Rejected Options
Impact
```

例如：

```text
DEC-009

Decision:
Recommendation 不采用 Feed。

Reason:
产品核心是 Experience Transition，
不是 Content Consumption。

Rejected:
连续内容流。

Impact:
Next Best Experience 只提供单个候选体验，
且需要用户授权。
```

以后即使换工程团队，也不会重新讨论同一个问题。

---

# 21. ADR｜Architecture Decision Record

技术架构重大决策必须记录。

例如：

```text
ADR-001

Decision:
LLM cannot directly mutate ExperienceState.

Reason:
避免模型输出不稳定导致 Runtime 不可预测。

Alternative:
LLM directly controls runtime.

Rejected:
不可测试、不可审计、不可控。
```

这类记录非常重要。

---

# 22. Product Spec 与 Engineering Spec 分离

以后每一个模块都必须有两层文档。

## Product Spec

回答：

> 用户应该经历什么？

例如：

```text
用户说：
“换一个。”

用户应该看到：
一个真正不同的体验。
```

---

## Engineering Spec

回答：

> 系统到底怎么实现？

例如：

```text
CHANGE_DIRECTION
↓
cancel generation
↓
register rejection
↓
candidate regeneration
↓
Agency Gate
↓
new experience
```

两者不能混为一谈。

---

# 23. Experience Spec 标准模板

以后任何 Experience 必须按照统一模板。

```text
Experience ID
Version

User Trigger

User Goal

Entry Condition

Initial State

Experience Stages

State Schema

Allowed Actions

Semantic Actions

Policy Rules

Variables

Interaction Rules

LLM Contract

Tool Requirements

Completion Condition

Exit Conditions

Interrupt Rules

Memory Candidates

Analytics Events

Failure Cases

Acceptance Tests
```

这样以后可以规模化生产 Experience。

---

# 24. 一个 Experience 不是一篇 Prompt

禁止：

```text
Experience
=
Prompt
```

正确：

```text
Experience
=
State Machine
+
Experience Template
+
Policy
+
Capabilities
+
UI Runtime
+
Validation
```

Prompt 只是其中一部分。

---

# 25. AI Coding Team 的任务拆解方式

不能给 AI 团队：

> “把这个页面做出来。”

必须给：

```text
Task
↓
Context
↓
Contract
↓
Inputs
↓
Outputs
↓
State
↓
Allowed Actions
↓
Forbidden Actions
↓
Tests
↓
Acceptance
```

例如：

### 错误任务

> “做一个智能推荐页面。”

### 正确任务

> Implement `NextBestExperienceCandidateSelector v1.0` according to NES-001. It may generate 3–5 candidates, must apply Agency Gate, must not select a candidate unless user has delegated choice, and must pass tests NBE-001 through NBE-018.

这才是 AI Engineering 可以稳定执行的任务。

---

# 26. AI Coding 的“四不原则”

工程 AI 不得：

### 不猜

需求不明确时不能自行扩大解释。

### 不扩

不能自动增加产品功能。

### 不改

不能自行修改已有 Product Rule。

### 不绕

不能绕过 Policy / Validator / Runtime Contract。

---

# 27. AI Coding 的“发现问题机制”

但“不猜”不意味着 AI 工程师遇到问题只能停。

正确流程：

```text
发现 Spec Conflict
        ↓
创建 Issue
        ↓
指出冲突位置
        ↓
提出 1–2 个建议方案
        ↓
Product Decision
        ↓
更新 Spec
        ↓
继续开发
```

而不是：

```text
发现问题
↓
自己选一个
↓
悄悄实现
```

---

# 28. Product Debt

我们不仅要记录 Technical Debt。

还必须记录：

> **Product Debt**

例如：

```text
PD-001
当前 Memory UI 尚未定义。

PD-002
Recommendation Explanation 尚未完成最终交互规范。

PD-003
Creation Versioning UI 尚未定义。
```

产品债务必须有：

```text
Impact
Priority
Owner
Target Phase
```

否则临时方案会逐渐变成永久方案。

---

# 29. Technical Debt 与 Product Debt 的区别

### Technical Debt

代码未来难维护。

### Product Debt

产品行为未来难统一。

对于这个项目：

> **Product Debt 甚至可能比 Technical Debt 更危险。**

因为 AI 系统一旦行为规则模糊：

```text
模糊规则
↓
Prompt 补丁
↓
更多例外
↓
更多 Prompt
↓
行为冲突
↓
工程开始打补丁
↓
无法解释
↓
无法测试
```

最终整个系统会变成：

> Prompt spaghetti。

我们必须提前阻断。

---

# 30. Product Review Gate

以后每个大模块至少通过五道 Gate。

```text
G1 Product Fit
↓
G2 UX Fit
↓
G3 System Fit
↓
G4 Engineering Contract
↓
G5 Acceptance
```

没有通过：

> 不进入下一阶段。

---

# 31. 当前真正的优先级

现在不要继续：

```text
Screen 11
Screen 12
Screen 13
Screen 14
```

然后无限扩功能。

正确顺序应该是：

```text
01–09 Product Experience
        ↓
10 Runtime Protocol
        ↓
11 Product Governance       ← 当前补齐
        ↓
12 System Schema
        ↓
13 API Contract
        ↓
14 State/Event Matrix
        ↓
15 Evaluation & Test System
        ↓
16 Vertical Slice Engineering
        ↓
17 Internal Dogfood
        ↓
18 User Test
        ↓
19 Product Iteration
```

---

# 32. 下一阶段的工程交付包

接下来我们要正式建立：

## Package A｜Core Schema

```text
UserState
Intent
ExperienceState
CreationState
Memory
Candidate
PolicyDecision
```

全部字段类型、枚举、必填/可选、生命周期。

---

## Package B｜Event Dictionary

每个 Event：

```text
Event Name
Trigger
Payload
Producer
Consumer
Required Fields
Privacy Level
Retention
```

---

## Package C｜State Transition Matrix

例如：

| Current State | Event            | Allowed Action | Next State     |
| ------------- | ---------------- | -------------- | -------------- |
| curiosity     | START            | ENTER          | understanding  |
| understanding | WHY              | ANSWER         | understanding  |
| understanding | WHAT_IF          | SIMULATE       | simulation     |
| understanding | CREATE           | CREATE         | creation       |
| \*            | STOP             | STOP           | completion     |
| \*            | CHANGE_DIRECTION | CHANGE         | new experience |

这张表最终是工程团队最重要的参考之一。

---

## Package D｜API Contract

明确：

```text
Request
Response
Error
Timeout
Retry
Idempotency
Version
Auth
```

---

## Package E｜AI Contract

明确：

```text
Model Input
Model Output
Schema
Confidence
Forbidden Fields
Validation
Fallback
```

---

## Package F｜Evaluation System

建立：

```text
Golden Dataset
Golden Experiences
Policy Tests
Regression Tests
Safety Tests
Agency Tests
Context Tests
Memory Tests
```

---

# 33. 最重要的产品管理原则

从现在开始，我会主动阻止我们犯一个非常常见的错误：

> **“这个功能挺酷，我们以后可以做。”**

不是不能做。

而是先问：

```text
为什么现在做？
解决什么？
属于哪层？
依赖什么？
会增加什么复杂度？
会不会破坏已有原则？
是否有更简单的方法？
```

如果答案不好：

**就不做。**

这不是保守。

这是在保护产品的系统性。

---

# 34. 当前 Product Master Roadmap

```text
                  PRODUCT FOUNDATION
                         │
                         ▼
              ┌────────────────────┐
              │ Product Constitution│
              └──────────┬─────────┘
                         │
                         ▼
                SYSTEM DEFINITION
                         │
                         ▼
              ┌────────────────────┐
              │ Runtime Protocol   │
              │ Policy             │
              │ Memory             │
              │ Creation           │
              │ NBE                │
              └──────────┬─────────┘
                         │
                         ▼
                ENGINEERING CONTRACT
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
            Schema      API       Events
              │          │          │
              └──────────┼──────────┘
                         ▼
                  EVALUATION SYSTEM
                         │
                         ▼
                   VERTICAL SLICE
                         │
                         ▼
                    INTERNAL TEST
                         │
                         ▼
                     USER TEST
                         │
                         ▼
                 PRODUCT ITERATION
                         │
                         ▼
                       SCALE
```

---

# 35. 当前阶段结论

我们现在**不缺功能设计**。

现在真正缺的是：

> **把已经设计好的产品，变成一个不会随着开发人员、模型、Prompt 和时间变化而逐渐失控的系统。**

因此接下来的工作原则正式确定：

> **先建立标准，再开发。**
>
> **先定义边界，再增加能力。**
>
> **先跑通一条完整链路，再扩大产品。**
>
> **先验证用户价值，再优化 AI 能力。**

最终希望做到：

```text
产品团队
   ↓
Product Spec
   ↓
Engineering Contract
   ↓
AI Coding Team
   ↓
Implementation
   ↓
Automated Tests
   ↓
Evaluation
   ↓
Human Review
   ↓
Release
```

而不是：

```text
产品想到一个点子
↓
丢给 AI
↓
AI 自己发挥
↓
看起来能跑
↓
继续加东西
↓
最后没人知道系统为什么这样运行
```

**后者从今天开始禁止。**
