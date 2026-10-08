# P2｜Product Engineering Contract

## Part 7 — P2 Exit Gate & Sign-off

### P2 退出门槛与正式签署

**Document ID：P2-EVIDENCE-7.0**\
**Document Version：1.0**\
**Status：Closure Candidate / Blocked（关闭候选 / 阻塞）**\
**P3 Entry Preparation：Allowed（允许准备）**\
**P3 Implementation：Blocked（禁止实现）**

---

## 1. Purpose｜目的

本文件将 Part 1–6 的 P2 证据汇总为一个不可绕过的最终退出门槛。

P2 的目标不是证明：

> “我们已经设计得差不多了。”

而是证明：

> **产品契约已经冻结、跨契约一致、关键行为可验收、工程边界可验证、独立评测机制成立、未决决策已经分类，并且责任人正式签署。**

只有全部强制条件满足，P2 才能从：

> Closure Candidate（关闭候选）

变为：

> **CLOSED（正式关闭）**

---

# 2. P2 Exit Principle｜P2 退出原则

P2 Exit Gate 遵循以下不可绕过原则：

### Rule 01 — Defined ≠ Verified

“已经写进规范”不等于“已经证明实现符合规范”。

### Rule 02 — Test Green ≠ Product Pass

单元测试、集成测试或 Demo 成功不能替代产品验收。

### Rule 03 — Metrics ≠ Acceptance

平均指标不能抵消 STOP、CHANGE、State Integrity、Policy Compliance 等硬性失败。

### Rule 04 — Implementation Cannot Close P2

实现团队不能通过“代码已经跑通”自行关闭 P2。

### Rule 05 — No Silent Product Decisions

任何仍然需要产品判断的问题，都必须进入 Open Decision / Product Debt Register。

### Rule 06 — No Contract Bypass

任何实现、Prompt、Model、Frontend、Memory、Analytics 或 Tool 都不得绕过既定 Authority Boundary。

### Rule 07 — User Agency Is a Release Gate

STOP、CHANGE、CORRECTION、Direct Answer、Memory Boundary 等用户控制行为属于硬验收条件。

---

# 3. Authority Baseline｜最终权威基线

P2 最终工程基线：

```text
User
  ↓
Intent
  ↓
Experience State
  ↓
Policy
  ↓
LLM / Search / Tool
  ↓
Validator
  ↓
State Machine
  ↓
Runtime
  ↓
User
```

核心责任：

```text
LLM proposes
Policy decides
State Machine authorizes
Runtime executes
Analytics records
Evaluation verifies
```

### ExperienceState

ExperienceState 是当前体验的：

> **Single Source of Truth（唯一事实源）**

Runtime 是其唯一写入者。

### Memory

Memory：

> informs, never overrides

即：

> **Memory 提供上下文，但永远不能覆盖当前明确意图。**

### Analytics

Analytics：

> observes, never controls

即：

> **Analytics 记录和分析事实，但不能反向控制 Runtime。**

---

# 4. Priority Separation｜优先级严格分离

P2 冻结时必须明确区分两个不同概念。

## 4.1 Policy Priority｜策略优先级

```text
Safety
↓
Explicit User Direction
↓
STOP / CHANGE
↓
Current Experience Goal
↓
Current Intent
↓
Current Experience State
↓
Current User State
↓
Session Context
↓
Short-term Memory
↓
Long-term Memory
↓
Novelty
```

这是**策略冲突裁决顺序**。

---

## 4.2 Semantic Action Priority｜语义动作优先级

```text
STOP
↓
CHANGE_DIRECTION
↓
DIRECT_ANSWER
↓
CORRECTION
↓
CREATE / MODIFY
↓
WHAT_IF / VERIFY / QUESTION / WHY / HOW
↓
DEEPEN / SIMPLIFY / REFRAME / REPEAT
↓
CONTINUE
```

这是**用户输入被识别为 Semantic Action 时的优先级体系**。

二者不得合并。

> **Policy Priority ≠ Semantic Action Priority**

这是 P2 冻结后的强制术语规则。

---

# 5. Final Exit Gate｜最终退出门槛

P2 设置八个 Gate。

| Gate | 名称                           | 必须证明什么                                   | 当前状态                 |
| ---- | ---------------------------- | ---------------------------------------- | -------------------- |
| G1   | Contract Authority Freeze    | C1–C7 已正式冻结并具备权威版本信息                     | **BLOCKED**          |
| G2   | Cross-Contract Consistency   | C1–C7 对关键行为无冲突                           | **EVIDENCE PENDING** |
| G3   | Golden Suite                 | G01–G08 全部通过                             | **EVIDENCE PENDING** |
| G4   | Engineering Boundary         | Runtime/State/LLM/API/Memory/Tool 等边界可验证 | **EVIDENCE PENDING** |
| G5   | Independent Evaluation       | 独立评测完成并形成报告                              | **EVIDENCE PENDING** |
| G6   | Product Debt / Open Decision | 所有未决事项已分类且无隐藏决策                          | **EVIDENCE PENDING** |
| G7   | P3 Scope Freeze              | 首个 Vertical Slice 已冻结                    | **BLOCKED**          |
| G8   | Formal Sign-off              | 六类责任人完成正式签署                              | **BLOCKED**          |

---

# 6. G1 — Contract Authority Freeze｜契约权威冻结

必须对以下七份契约逐项建立正式证据：

```text
C1 Core Schema Specification V1
C2 State Machine Specification V1
C3 Action & Policy Contract V1
C4 LLM Contract llm_v1.0.0
C5 API Contract api_v1.0.0
C6 Event & Analytics Contract analytics_v1.0.0
C7 Evaluation System evaluation_v1.0.0
```

每份必须具备：

```text
Authoritative Location
Version
Fingerprint / Revision Marker
Owner
Approval Record
Change Classification
```

冻结条件：

```text
Authoritative
AND
Versioned
AND
Fingerprintable
AND
Owned
AND
Approved
```

缺任一项：

> **G1 = BLOCKED**

当前没有在本上下文中看到完整的七份正式签署记录、Fingerprint/Revision Evidence，因此：

> **G1 = BLOCKED**

---

# 7. G2 — Cross-Contract Consistency｜跨契约一致性

至少验证：

```text
CC-01 ExperienceState Single Writer
CC-02 STOP
CC-03 CHANGE_DIRECTION
CC-04 DIRECT_ANSWER
CC-05 CORRECTION
CC-06 Memory Boundary
CC-07 WHAT_IF / Simulation
CC-08 Creation Context Inheritance
CC-09 State Version / Stale Write
CC-10 Interrupt / Retry
CC-11 Decision Trace
CC-12 Analytics Boundary
```

每个 Case 必须能够回答：

```text
Product Rule
↓
Schema
↓
State Machine
↓
Semantic Action
↓
Policy
↓
LLM Contract
↓
API / Runtime
↓
Event / Decision Trace
↓
Evaluation
```

禁止出现：

- 同一行为在不同契约中拥有不同定义
- LLM 获得 Policy 权限
- Memory 获得 Runtime 控制权
- Analytics 改变 Runtime
- Frontend 绕过 Product API
- stale result 覆盖新状态
- STOP 后自动继续
- CHANGE 后旧生成结果重新写入状态

当前：

> **G2 = EVIDENCE PENDING**

---

# 8. G3 — Golden Suite｜黄金验收

以下八个 Case 是 P2 的核心 Product Acceptance：

```text
G01 Direct Answer
G02 Why
G03 What If
G04 Creation
G05 Change
G06 Stop
G07 Correction
G08 Memory Boundary
```

每个 Case 必须至少具备：

```text
Normal Case
Negative Case
Boundary Case
Failure / Recovery Case
Expected Result
Observed Result
Evidence Location
Evaluator
```

G05 / G06 必须覆盖：

> in-flight generation / stale response

即：

```text
用户 CHANGE / STOP
        ↓
旧生成正在进行
        ↓
旧任务必须取消或失效
        ↓
旧结果不得覆盖新状态
```

Golden Suite 任何一个核心 Case 失败：

> **P2 = BLOCKED**

当前没有实际执行结果和独立证据，因此：

> **G3 = EVIDENCE PENDING**

---

# 9. G4 — Engineering Boundary｜工程边界

必须验证：

```text
EB-01 Runtime Single Writer
EB-02 State Version
EB-03 Idempotency
EB-04 Interruptibility
EB-05 Stale Result Rejection
EB-06 Retry Boundary
EB-07 Timeout Boundary
EB-08 LLM Boundary
EB-09 Frontend Boundary
EB-10 Memory Write Boundary
EB-11 Tool Authorization Boundary
EB-12 API Boundary
EB-13 Completion Boundary
EB-14 Analytics Boundary
EB-15 Replayability
EB-16 Version Traceability
```

特别是以下 P0 条件：

### State Integrity

```text
Old State
↓
Concurrent / Delayed Result
↓
Rejected
```

不得：

```text
Old Result
↓
Overwrite New State
```

### LLM Boundary

LLM 不得：

```text
Policy Decision
State Mutation
Memory Write
Authorization
Completion Decision
Safety Permission
UI Control
Engagement Optimization
```

### Runtime Boundary

只有 Runtime 可以写入 ExperienceState。

### Memory Boundary

```text
Observed
↓
Candidate
↓
Policy Evaluation
↓
Active Memory
```

不得由 LLM 直接写入长期记忆。

当前：

> **G4 = EVIDENCE PENDING**

---

# 10. G5 — Independent Evaluation｜独立评测

独立评测必须与实现团队的开发职责分离。

实现团队可以：

- 执行测试
- 修复问题
- 提交证据
- 报告失败

但不得自行决定：

- 降低验收标准
- 修改 Golden Case
- 删除失败测试
- 修改 Pass Semantics
- 修改严重级别
- 宣布 Product Pass

必须形成正式：

**Evaluation Report（评测报告）**

至少包含：

```text
1. Version Matrix
2. Test Scope
3. Golden Case Result
4. Contract Test Result
5. Scenario Matrix Result
6. AI Evaluation Result
7. Regression Result
8. Fault Injection Result
9. Latency Result
10. Agency Result
11. Known Failures
12. Product Debt
13. Risk Assessment
14. Release Recommendation
15. Evidence Index
16. Evaluator Sign-off
```

当前：

> **G5 = EVIDENCE PENDING**

---

# 11. G6 — Product Debt / Open Decision｜产品债务与未决决策

所有未决事项必须进入 Register。

允许：

> FROZEN-DEFERRED

但必须满足：

```text
不改变 P0/P1/P2 原则
不改变核心 State Machine
不改变 Policy Priority
不改变 Semantic Action Priority
不改变 LLM Boundary
不改变 Memory Boundary
不改变 STOP / CHANGE / CORRECTION
不改变 P3 核心 Loop
不要求工程师自行猜测
```

当前已经分类的事项：

```text
PD-01 Memory UI Final Form
→ FROZEN-DEFERRED

PD-02 Recommendation Explanation UI
→ FROZEN-DEFERRED

PD-03 Creation Versioning UI
→ FROZEN-DEFERRED

PD-04 Experience Template Presentation
→ FROZEN-DEFERRED
```

真正影响 P3 准入的事项：

```text
PB-01 Seven Contract Authority Freeze
PB-02 First Experience Type & Canonical Path
PB-03 Release-Gate Metric Definitions
PB-04 Memory / Template Scope Decision
```

因此：

> **G6 = EVIDENCE PENDING**

---

# 12. G7 — P3 Scope Freeze｜P3 范围冻结

P3 不允许“边做边决定第一体验”。

必须在进入实现前冻结：

### First Experience Type

只能选择：

> **一个**

### Canonical Path

必须完整定义：

```text
Home
→ Natural Intent
→ Intent Understanding
→ First Experience
→ Question / Deepen / What-If
→ Change / Correction / Stop / Minimal Creation
→ Policy
→ State Transition
→ Runtime
→ Event / Decision Trace
→ Golden Acceptance
```

同时冻结：

- Entry Condition
- Initial State
- Experience Stages
- Allowed Actions
- Completion Condition
- Exit Conditions
- Interrupt Rules
- Memory Scope
- Analytics Events
- Failure Cases
- Acceptance Tests

必须明确：

```text
IN SCOPE
OUT OF SCOPE
DEFERRED
```

当前首个 Experience Type / Canonical Path 尚未在本上下文形成正式冻结证据。

因此：

> **G7 = BLOCKED**

---

# 13. G8 — Formal Sign-off｜正式签署

P2 必须由以下六类责任人签署：

```text
1. Product Owner
2. Contract Owner
3. Runtime / Architecture Owner
4. Policy / AI Owner
5. Independent Evaluation Owner
6. Engineering Owner
```

签署不是形式动作。

签署代表：

> “我确认自己负责的边界已经具备足够证据，可以进入 P3 实现。”

---

# 14. Sign-off Package｜签署包

每位签署人必须确认：

```text
Signer Role
Signer Identity
Document Version
Evidence Package Version
Date
Decision
Comments
Outstanding Risks
Signature / Approval Record
```

Decision 只能使用：

```text
APPROVE
APPROVE WITH DOCUMENTED DEBT
BLOCK
```

不得使用：

```text
Looks Good
Probably Ready
Test Seems Fine
Can Fix Later
```

这些不构成正式签署。

---

# 15. P2 Closed Definition｜P2 正式关闭定义

只有满足以下逻辑：

```text
G1 PASS
AND
G2 PASS
AND
G3 PASS
AND
G4 PASS
AND
G5 PASS
AND
G6 PASS
AND
G7 PASS
AND
G8 PASS
```

并且：

```text
P0 Violations = 0
Agency Blockers = 0
State Integrity Blockers = 0
Policy Compliance Blockers = 0
```

才允许写：

> **P2 = CLOSED**

否则必须写：

> **P2 = NOT CLOSED**

---

# 16. Current Gate Result｜当前最终判定

截至本文件形成时：

| Gate                            | 当前判断                 |
| ------------------------------- | -------------------- |
| G1 Contract Authority Freeze    | **BLOCKED**          |
| G2 Cross-Contract Consistency   | **EVIDENCE PENDING** |
| G3 Golden Suite                 | **EVIDENCE PENDING** |
| G4 Engineering Boundary         | **EVIDENCE PENDING** |
| G5 Independent Evaluation       | **EVIDENCE PENDING** |
| G6 Product Debt / Open Decision | **EVIDENCE PENDING** |
| G7 P3 Scope Freeze              | **BLOCKED**          |
| G8 Formal Sign-off              | **BLOCKED**          |

因此：

```text
P2 EXIT GATE
= NOT PASSED
```

正式状态：

```text
P2 STATUS
= CLOSURE CANDIDATE / BLOCKED
```

允许：

```text
P3 Entry Preparation
```

禁止：

```text
P3 Implementation
```

---

# 17. Required Closure Sequence｜关闭前唯一允许的执行顺序

下一阶段不得直接写 P3 功能代码。

严格顺序：

```text
P2 Contract Authority Freeze
        ↓
P2 Cross-Contract Evidence
        ↓
P2 Golden Suite Execution
        ↓
P2 Engineering Boundary Verification
        ↓
Independent Evaluation
        ↓
Product Debt / Open Decision Closure
        ↓
Freeze First Experience
        ↓
P2 Exit Review
        ↓
Six Owner Sign-offs
        ↓
P2 CLOSED
        ↓
P3 Entry
        ↓
P3 Implementation
```

任何一步失败：

```text
STOP
↓
Register Failure
↓
Identify Authority
↓
Resolve
↓
Version
↓
Regression
↓
Resume
```

不得通过跳过 Gate 继续向后推进。

---

# 18. Final Governance Statement｜最终治理声明

P2 的关闭不是一个“感觉已经准备好了”的判断。

它必须是：

> **一个可追溯、可验证、可复现、可签署的工程与产品治理结论。**

因此，在正式证据、评测结果和签署记录出现以前：

> **不声明 P2 CLOSED。**

在 P2 CLOSED 之前：

> **不启动 P3 产品实现。**

P3 可以准备材料，但不能通过实现反向定义产品。

最终原则：

> **不猜测契约，不用实现替代产品决策，不用测试绿灯替代产品验收，不用指标替代用户价值，不用 LLM 替代 Policy，不用 Memory 替代当前意图，不用 Analytics 替代产品判断。**

发现冲突：

> **先停、记录、裁决、更新契约、回归验证，再继续。**
