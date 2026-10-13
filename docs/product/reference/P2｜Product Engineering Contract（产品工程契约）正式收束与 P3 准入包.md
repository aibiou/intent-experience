# P2｜Product Engineering Contract（产品工程契约）

## Formal Closure & Vertical Slice Entry Package

### 正式收束与首个完整产品切片准入包

**Version：P2-CLOSE-1.0**\
**Status：P2 CLOSED / P3 READY ONLY AFTER GATE PASS**

---

## 1. P2 的正式结论

P2 的任务不是“把技术方案写得更多”，而是完成一件事：

> **把产品意图转换成可执行、可验证、不可随意解释的工程契约。**

至此，产品系统已经完成从：

**Product Vision（产品愿景）**

到：

**Product System（产品系统）**

再到：

**Engineering Contract（工程契约）**

的转换。

P2 不再继续增加新的产品能力。

---

# 2. P2 最终冻结的七项核心契约

以下七项构成当前产品工程的唯一基线：

### 01. Core Schema Specification V1（核心数据结构规范 V1）

定义系统中“有什么”。

冻结对象：

- UserState（用户状态）
- Intent（当前意图）
- ExperienceState（体验状态）
- CreationState（创造状态）
- Memory（记忆）
- ExperienceCandidate（体验候选）
- PolicyDecision（策略决策）

核心原则：

> ExperienceState 是当前体验的 Single Source of Truth（单一事实源）。

LLM、Frontend、Memory 均不得绕过 Runtime 直接修改核心运行状态。

---

### 02. State Machine Specification V1（状态机规范 V1）

定义系统“如何合法变化”。

冻结：

- Session State
- Intent State
- Experience State
- Creation State
- State Transition
- WAITING
- STOP
- CHANGE_DIRECTION
- Interrupt
- State Version

核心原则：

> **任何状态变化都必须经过合法 Transition（状态转换）。**

禁止：

- 隐式状态变化
- LLM 直接改 State
- Frontend 直接改 State
- stale write 覆盖新状态
- STOP 后自动继续
- CHANGE 后旧 Runtime 继续写入

---

### 03. Action & Policy Contract V1（动作与策略契约 V1）

定义：

> 用户表达什么 → 系统允许做什么。

冻结：

**Semantic Action（语义动作）**

与

**Policy Action（策略动作）**

之间的边界。

核心优先级：

```text
Safety
↓
Explicit User Direction
↓
STOP / CHANGE
↓
DIRECT_ANSWER
↓
CORRECTION
↓
User Goal
↓
Experience Progress
↓
Current State
↓
Memory
↓
Novelty
```

核心原则：

> **LLM 提议，Policy 决策，Runtime 执行。**

禁止：

- LLM 直接决定产品动作
- 为 Engagement 自动继续
- 强制澄清
- Memory 覆盖当前意图
- 隐藏推荐
- 绕过 Agency Gate

---

### 04. LLM Contract V1（大模型调用契约 V1）

定义：

> LLM 可以做什么，以及绝对不能做什么。

LLM 可以：

- 理解自然语言
- 判断 Semantic Action
- Reference Resolution
- Intent Interpretation
- 生成内容
- 生成 Experience Candidate
- 提出 State Update
- 提出 Memory Candidate
- 提出 Tool Request
- 表达 Uncertainty

LLM 不可以：

- 决定 Policy
- 直接修改 State
- 写入 Memory
- 决定 Completion
- 决定 Authorization
- 决定 UI 行为
- 决定用户是否可以退出
- 自动延长体验
- 优化 Session Time / Message Count
- 绕过 State Machine

核心原则：

> **LLM 是能力提供者，不是产品状态、策略和权限的所有者。**

---

### 05. API Contract V1（接口契约 V1）

定义系统模块之间“如何通信”。

冻结：

- API Version
- Request Envelope
- Response Envelope
- Error Contract
- State Version
- Idempotency
- Query / Command
- LLM Gateway
- Tool Boundary
- Retry
- Timeout
- Observability
- Data Minimization

核心原则：

> **Frontend 只调用 Product API，不直接调用 LLM。**

所有状态写入必须经过：

```text
API
↓
Runtime
↓
State Machine
↓
合法 State Transition
```

禁止：

- Frontend → LLM
- Frontend → State
- API → 任意 LLM 行为
- Memory API 绕过 Memory Policy
- stale write
- 无边界 retry
- 静默改变 API 行为

---

### 06. Event & Analytics Contract V1（事件与数据分析契约 V1）

定义系统如何知道：

> **发生了什么、为什么发生、最终产生什么结果。**

冻结四层：

```text
User Event
↓
System Event
↓
Decision Trace
↓
Outcome / Metric
```

明确：

```text
Event ≠ State
Event ≠ Decision
Decision ≠ Metric
Metric ≠ Policy
```

核心原则：

> **Analytics 记录系统事实，但不控制系统行为。**

尤其冻结：

- LLM Trace 与 Policy Trace 分离
- State Snapshot
- Event Version
- Event Idempotency
- Decision Replay
- Agency Metrics
- Policy Regret
- Unnecessary Intervention
- Memory Metrics
- Creation Metrics

禁止：

- 为了指标伪造 Event
- 用 Metric 反向偷偷改变 Policy
- 用 Session Time 作为运行时优化目标
- 将 LLM Proposal 记录成 Runtime Decision

---

### 07. Evaluation System V1（评测与验收体系 V1）

定义：

> **什么叫做“产品正确”。**

冻结五层：

```text
L1 Product Evaluation
L2 Experience Evaluation
L3 System Contract Evaluation
L4 AI Evaluation
L5 Engineering Evaluation
```

并冻结：

- Golden Cases
- Scenario Matrix
- Contract Tests
- Regression Suite
- Fault Injection
- Agency Tests
- Latency Evaluation
- Evaluation Report
- Release Gate
- Severity
- P0/P1/P2/P3/P4

最重要的判断：

> **Demo Pass ≠ Product Pass。**

---

# 3. 七项契约之间的最终关系

整个工程系统最终收敛为：

```text
Product Vision
      ↓
Experience Contract
      ↓
Core Schema
      ↓
State Machine
      ↓
Action & Policy
      ↓
LLM Contract
      ↓
API Contract
      ↓
Event & Analytics
      ↓
Evaluation
      ↓
Implementation
```

它们分别回答：

| 契约            | 回答的问题      |
| ------------- | ---------- |
| Schema        | 系统里有什么？    |
| State Machine | 状态怎么合法变化？  |
| Policy        | 现在允许做什么？   |
| LLM Contract  | AI 可以参与什么？ |
| API           | 模块如何通信？    |
| Analytics     | 系统实际发生了什么？ |
| Evaluation    | 怎么证明它是对的？  |

**Implementation（实现）不得反过来定义上述任何一层。**

---

# 4. P2 最终系统边界

最终责任边界冻结如下：

```text
USER
 ↓
Input Layer
 ↓
Context Assembly
 ↓
LLM Gateway
 ↓
Semantic Understanding
 ↓
Validator
 ↓
Policy Engine
 ↓
State Machine
 ↓
Experience Runtime
 ↓
USER
```

辅助能力：

```text
Runtime
 ├── Search / Tool
 ├── Creation
 ├── Memory Policy
 ├── Next Experience Engine
 └── Analytics
```

最终原则：

> **能力可以来自 AI，但产品行为必须来自系统契约。**

---

# 5. 最终权责矩阵

| 模块            | 可以决定                        | 不可以决定                    |
| ------------- | --------------------------- | ------------------------ |
| User          | 方向、目标、修改、停止                 | —                        |
| Frontend      | 展示、输入、动画                    | Intent / Policy / Memory |
| Input Layer   | 输入标准化                       | 用户真正意图                   |
| Intent Engine | Intent Proposal / Lifecycle | 最终 Runtime Policy        |
| LLM           | 理解、生成、候选、Proposal           | State / Policy / Memory  |
| Validator     | 接受或拒绝模型输出                   | 产品业务策略                   |
| Policy Engine | Allowed Action              | 事实内容                     |
| State Machine | Transition 合法性              | 产品推荐                     |
| Runtime       | 当前 Experience 执行            | 长期用户记忆                   |
| Memory Policy | Memory 生命周期                 | 当前 Intent                |
| Tool          | 外部能力 / 信息                   | Policy                   |
| Analytics     | 记录、分析                       | Runtime 行为               |
| Evaluation    | 验收与发布判断                     | 在线产品策略                   |

---

# 6. P2 不允许再出现的架构方向

以下方向正式列为 **Architecture Prohibited（架构禁止项）**：

### P2-P01

LLM 直接拥有 ExperienceState。

### P2-P02

LLM 直接决定 Policy Action。

### P2-P03

Frontend 直接调用 LLM。

### P2-P04

Frontend 直接修改核心 Runtime State。

### P2-P05

Memory 直接覆盖 Current Intent。

### P2-P06

Recommendation 自动驱动用户进入下一体验。

### P2-P07

系统为了 Engagement 自动延长体验。

### P2-P08

STOP 后自动生成新的体验。

### P2-P09

CHANGE 后旧 Runtime 继续执行或写 State。

### P2-P10

AI Coding Team 为解决实现困难而修改产品契约。

### P2-P11

为了让测试通过而降低 Acceptance Criteria。

### P2-P12

通过 Prompt 偷偷改变产品行为而不升级版本。

---

# 7. P2 最终行为基线

以下行为已经成为不可随意改变的 Product Baseline：

### 用户说：

**“直接告诉我。”**

系统必须：

```text
DIRECT_ANSWER
↓
ANSWER
```

不得为了“体验感”拒绝直接回答。

---

### 用户说：

**“为什么？”**

系统必须基于当前 Experience Context 回答原因。

不得要求用户重新描述上下文。

---

### 用户说：

**“如果摩擦力不是 0 呢？”**

系统应识别：

```text
WHAT_IF
↓
SIMULATE
↓
UNDERSTANDING → SIMULATION
```

---

### 用户说：

**“这个可以做成一个小游戏。”**

系统应：

```text
CREATE
↓
Context Inheritance
↓
Minimal Build
```

不得要求用户重新描述已经发生的内容。

---

### 用户说：

**“换一个。”**

系统必须：

```text
CANCEL GENERATION
↓
CANCEL CURRENT ACTION
↓
CHANGE_DIRECTION
↓
REJECT CURRENT CANDIDATE
↓
SELECT NEW CANDIDATE
```

---

### 用户说：

**“好了。”**

系统必须：

```text
STOP
↓
COMPLETE / EXIT
```

不得：

- 自动推荐
- 自动继续
- 自动生成新内容
- 用问题挽留用户

---

### 用户说：

**“不是这个意思。”**

系统必须：

```text
CORRECTION
↓
REMOVE INVALID INFERENCE
↓
PRESERVE VALID CONTEXT
↓
REASSESS
```

不得把错误推断继续作为事实使用。

---

# 8. P2 Exit Gate（P2 退出门槛）

P2 只有同时满足以下条件，才允许标记为 **CLOSED**：

### Engineering Contract

- [x] Core Schema V1
- [x] State Machine V1
- [x] Action & Policy Contract V1
- [x] LLM Contract V1
- [x] API Contract V1
- [x] Event & Analytics Contract V1
- [x] Evaluation System V1

### System Governance

- [x] Authority Matrix
- [x] State Ownership
- [x] Policy Boundary
- [x] LLM Boundary
- [x] Memory Boundary
- [x] API Boundary
- [x] Analytics Boundary
- [x] Versioning Rules
- [x] Change Management
- [x] AI Coding Governance

### Evaluation

- [x] Golden Suite
- [x] Scenario Matrix
- [x] Contract Test Definition
- [x] Regression Framework
- [x] Agency Test
- [x] Fault Injection
- [x] Evaluation Report
- [x] Release Gate

### Product Governance

- [x] Product Baseline
- [x] Decision Log
- [x] Architecture Boundary
- [x] Product Debt Boundary
- [x] Feature Admission Rules
- [x] Feature Kill Rules

### Architecture Blockers

- [x] Type C Architecture Conflict = 0
- [x] P0 Agency Violation = 0
- [x] P0 State Violation = 0
- [x] P0 Policy Violation = 0

---

# 9. P2 正式冻结后的变更规则

P2 关闭以后，不再允许通过普通讨论修改上述契约。

任何修改必须进入 Change Management。

### Type A — Minor

例如：

- 文案
- spacing
- animation
- 非行为性 UI 调整

可以快速处理。

---

### Type B — Behavior Change

例如：

- 改变 Clarification 行为
- 改变 Candidate Selection
- 改变 Memory 使用方式
- 改变 Runtime 行为
- 改变 STOP / CHANGE 行为

必须：

```text
Product Review
↓
Policy Review
↓
Contract Impact
↓
Acceptance Test
↓
Version
↓
Regression
```

---

### Type C — Architecture Change

例如：

- LLM 获得 Policy 权限
- Frontend 获得 State 写权限
- Memory 获得 Intent 覆盖权
- Runtime 边界重新划分

必须重新进行：

```text
Product
Architecture
Security
Data
Agency
Testing
Migration
```

评审。

**不得在 P3 实现过程中偷偷完成。**

---

# 10. P2 Product Debt 正式处理原则

仍未完全确定的内容不允许通过工程实现“顺便决定”。

例如：

- Memory UI 最终形态
- Recommendation Explanation 的最终交互形态
- Creation Versioning UI
- 某些体验模板的最终表现

这些属于：

> **Product Debt（产品债务）**

处理原则：

```text
Unknown
↓
Registered
↓
Scoped
↓
Not silently implemented
```

工程团队不得自行把 Product Debt 转换成 Product Decision。

---

# 11. P3 Vertical Slice（首个完整产品切片）准入范围

P3 不是：

> “开始开发整个 App。”

也不是：

> “把所有页面做出来。”

P3 的唯一任务是验证：

> **一个真实用户是否能够完成一条完整的 AI-native Experience Loop（AI 原生体验闭环）。**

因此 P3 只实现：

```text
Home
 ↓
Intent
 ↓
First Experience
 ↓
Experience Runtime
 ↓
Policy
 ↓
LLM
 ↓
State
 ↓
Memory Boundary
 ↓
Analytics
 ↓
Evaluation
```

---

# 12. P3 Vertical Slice 最小闭环

必须能够完成：

### Step 1

用户进入 Home。

### Step 2

用户自然表达一个意图。

### Step 3

系统理解意图。

### Step 4

系统在不进行无意义采访的情况下进入第一体验。

### Step 5

用户可以自然提问、追问、改变方向或停止。

### Step 6

Runtime 根据语义动作进行状态转换。

### Step 7

Policy 控制允许的 Action。

### Step 8

LLM 提供理解与生成能力，但不能越权。

### Step 9

State 可以被完整追踪。

### Step 10

Memory 不得越权。

### Step 11

所有关键行为产生可审计 Event / Trace。

### Step 12

Golden Cases 与 Contract Tests 能够验证整个闭环。

---

# 13. P3 明确不做什么

P3 不做：

- 社交系统
- Follow
- Like
- Comment
- Leaderboard
- Trending
- Feed
- Notification System
- Monetization
- Creator Marketplace
- Agent Marketplace
- Autonomous Agent
- Multi-Agent
- RL Ranking
- 大规模推荐模型
- 大规模长期用户画像
- 复杂权限系统
- 大量 Experience Types
- 为展示 AI 能力而增加的 Demo Features

这些不是当前 Vertical Slice 的验证目标。

---

# 14. P3 的真正成功标准

不是：

> 页面做得多完整。

不是：

> AI 看起来多聪明。

不是：

> Demo 有多惊艳。

而是：

> **用户表达一个真实意图后，系统能否以极低摩擦把用户带入一个有价值、可交互、可改变方向、可自然结束的体验。**

并且整个过程：

```text
可理解
可追踪
可中断
可纠正
可验证
可复现
不越权
不操纵
```

---

# 15. P3 首要验证的产品假设

P3 只验证以下核心假设：

### H1 — Intent Capture

用户不需要学习产品，就能表达自己现在想做什么。

### H2 — First Experience Fit

系统第一次给出的体验足够匹配当前意图。

### H3 — Experience Continuation

用户愿意主动进行下一步，而不是因为系统强迫。

### H4 — Natural Interaction

用户可以自然提问、追问、纠正、改变方向。

### H5 — Agency

用户始终能够：

- 改变方向
- 停止
- 纠正系统
- 要求直接回答
- 不接受系统推断

### H6 — Experience Completion

体验可以自然结束，而不是依赖无限延长。

### H7 — Creation Transition

当用户产生创造意图时，可以自然从理解进入创造。

---

# 16. P3 首轮 Golden Suite

P3 第一版必须至少通过：

```text
G01 Direct Answer
G02 Why
G03 What If
G04 Create
G05 Change
G06 Stop
G07 Correction
G08 Memory Boundary
```

任何一个核心 Golden Case 失败：

> **P3 Product Pass = NO**

不能通过平均指标抵消。

---

# 17. 最终产品运行哲学

P2 收束后，以下原则成为整个工程组织的最高执行准则：

> **人决定方向，AI 降低成本。**

> **LLM 提议，Policy 决策，State Machine 授权，Runtime 执行。**

> **Memory 提供上下文，不拥有当前意图。**

> **Analytics 记录事实，不决定产品行为。**

> **Evaluation 定义正确，而不是 Demo 定义正确。**

> **用户可以随时改变方向，也可以随时停止。**

> **Stop 是成功状态。**

---

# 18. P2 最终状态

```text
P0 Product Foundation
        ↓
P1 Product System Definition
        ↓
P2 Product Engineering Contract
        ↓
┌──────────────────────────────┐
│       P2 CLOSED              │
│                              │
│ Schema             FROZEN    │
│ State Machine      FROZEN    │
│ Policy             FROZEN    │
│ LLM Contract       FROZEN    │
│ API Contract       FROZEN    │
│ Analytics          FROZEN    │
│ Evaluation         FROZEN    │
└──────────────────────────────┘
        ↓
P3 Vertical Slice
```

**P2 到此正式收束。**

从现在开始，默认不再继续讨论“产品应该是什么”。

除非发现明确的 Product / Architecture Conflict，否则下一阶段只回答：

> **如何在不破坏上述契约的情况下，把第一个完整 Vertical Slice 真正实现出来。**

---

# 19. P3 Entry Gate（P3 准入门）

进入 P3 前，必须形成以下唯一输入包：

```text
P3 Entry Package
│
├── Product Baseline
├── Core Schema V1
├── State Machine V1
├── Action & Policy Contract V1
├── LLM Contract V1
├── API Contract V1
├── Event & Analytics Contract V1
├── Evaluation System V1
├── Golden Suite
├── Scenario Matrix
├── Product Debt Register
├── Architecture Decision Record
├── Vertical Slice Scope
└── Acceptance Criteria
```

其中：

> **Vertical Slice Scope（首个完整产品切片范围）**

是 P3 唯一允许继续定义的新边界。

不能借 P3 之名重新打开 P0/P1/P2。

---

# 20. 正式收束声明

**P2 的产品定义工作结束。**

**P2 的工程契约工作结束。**

**P2 的架构权责划分结束。**

**P2 的核心行为规则结束。**

**P2 的评测与验收规则结束。**

后续任何实现团队，包括 AI Coding Team，都必须以本基线为上限和边界：

> **不猜。**\
> **不扩。**\
> **不改。**\
> **不绕。**

如果实现过程中发现契约冲突：

```text
发现冲突
↓
停止自行解释
↓
建立 Issue
↓
指出冲突
↓
提出有限方案
↓
Product Decision
↓
更新 Contract
↓
重新 Version
↓
继续实现
```

**未经这一流程，不得改变产品行为。**

---

## Final Status

**P2｜Product Engineering Contract（产品工程契约）**

**STATUS：CLOSED**

**NEXT：P3｜Vertical Slice（首个完整产品切片）**

**原则：不再扩张产品，开始验证产品。**
