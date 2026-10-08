# P2-EVIDENCE-E1.0

## Contract Authority Evidence Package（契约权威证据包）

**Version：** 1.0\
**Status：** BLOCKED / EVIDENCE PENDING（阻塞 / 证据待补）\
**对应 Gate：** G1 Contract Authority Freeze（契约权威冻结）\
**对应阻塞：** PB-01 Seven V1 Contracts Authority Freeze（七份 V1 契约权威冻结）

---

## 1. 目的

将当前七份契约从：

> “已经定义”

推进到：

> “具有唯一权威版本、可验证版本指纹、明确负责人、正式批准记录，因此可以被冻结并作为 P3 唯一工程基线”。

本包**不修改七份契约的产品语义**。

如果证据不足，只能保持 `BLOCKED / EVIDENCE PENDING`，不得将其标记为 PASS。

---

## 2. G1 冻结判定公式

单份契约只有同时满足以下条件，才能判定 `FROZEN`：

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

七份契约全部 `FROZEN` 后：

```text
G1 = PASS CANDIDATE
```

再经过正式 P2 Exit Review：

```text
G1 = PASS
```

---

## 3. 七份契约权威登记表

| ID | Contract                              | Version             | Authority | Fingerprint | Owner   | Approval | Current |
| -- | ------------------------------------- | ------------------- | --------- | ----------- | ------- | -------- | ------- |
| C1 | Core Schema Specification（核心数据结构规范）   | V1                  | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |
| C2 | State Machine Specification（状态机规范）    | V1                  | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |
| C3 | Action & Policy Contract（动作与策略契约）     | V1                  | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |
| C4 | LLM Contract（大模型调用契约）                 | `llm_v1.0.0`        | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |
| C5 | API Contract（接口契约）                    | `api_v1.0.0`        | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |
| C6 | Event & Analytics Contract（事件与数据分析契约） | `analytics_v1.0.0`  | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |
| C7 | Evaluation System（评测与验收体系）            | `evaluation_v1.0.0` | PENDING   | PENDING     | PENDING | PENDING  | BLOCKED |

**注意：**

这里的 `Version` 只证明当前声明的版本号，**不能替代正式冻结证据**。

---

## 4. C1｜Core Schema Specification（核心数据结构规范）

### 必须冻结的对象

```text
UserState
Intent
ExperienceState
CreationState
Memory
ExperienceCandidate
PolicyDecision
```

### 必须确认的关键约束

- ExperienceState 是当前体验唯一事实源。
- Runtime 是 ExperienceState 唯一写入者。
- LLM 只能提出 State Update Proposal。
- UserState ≠ 用户长期画像。
- Current Intent ≠ Stable Preference。
- Memory 不能覆盖 Current Intent。
- Fact / Inference / Unknown 必须可区分。
- 行为改变必须有版本。

### E1 证据

```text
E-G1-01-C1-Authority
E-G1-01-C1-Version
E-G1-01-C1-Fingerprint
E-G1-01-C1-Owner
E-G1-01-C1-Approval
```

**当前判定：BLOCKED**

---

## 5. C2｜State Machine Specification（状态机规范）

### 必须冻结的状态层

```text
L0 Session
L1 Intent
L2 Experience
L3 Creation
```

Memory 不属于当前 Runtime State。

### 必须冻结的关键行为

```text
STOP
CHANGE_DIRECTION
CORRECTION
WAIT
INTERRUPT
STALE WRITE REJECTION
STATE VERSION
```

特别需要验证：

```text
STOP
→ 不自动开启下一体验

CHANGE_DIRECTION
→ 取消旧生成
→ 旧 Candidate 失效
→ 旧异步结果不得写回

WAIT
→ 等待用户
→ 不自动替用户决定
```

### E1 证据

```text
E-G1-02-C2-Authority
E-G1-02-C2-Version
E-G1-02-C2-Fingerprint
E-G1-02-C2-Owner
E-G1-02-C2-Approval
```

**当前判定：BLOCKED**

---

## 6. C3｜Action & Policy Contract（动作与策略契约）

### 必须严格分离

```text
Semantic Action
≠
Policy Action
```

### Semantic Action Priority（语义动作优先级）

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

### Policy Priority（策略优先级）

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

**必须保持这两个优先级体系独立。**

### E1 证据

```text
E-G1-03-C3-Authority
E-G1-03-C3-Version
E-G1-03-C3-Fingerprint
E-G1-03-C3-Owner
E-G1-03-C3-Approval
```

**当前判定：BLOCKED**

---

## 7. C4｜LLM Contract（大模型调用契约）

### 核心冻结原则

> LLM 是能力提供者，不是产品状态、策略和权限的所有者。

固定链路：

```text
LLM Proposal
↓
Validator
↓
Policy
↓
State Machine
↓
Runtime
```

LLM 不得直接：

```text
mutate State
write Memory
decide Policy
authorize Action
decide Completion
override Safety
control UI
optimize Engagement
```

### E1 证据

```text
E-G1-04-C4-Authority
E-G1-04-C4-Version
E-G1-04-C4-Fingerprint
E-G1-04-C4-Owner
E-G1-04-C4-Approval
```

**当前判定：BLOCKED**

---

## 8. C5｜API Contract（接口契约）

### 核心冻结原则

```text
Frontend
↓
Product API
↓
Runtime / Policy / Capability
```

禁止：

```text
Frontend → LLM
Frontend → State Mutation
LLM → Product State
Memory API → bypass Memory Policy
Analytics → Runtime
```

State-changing request 必须具备相应：

```text
request_id
session_id
state_version
client_request_id / idempotency
```

### E1 证据

```text
E-G1-05-C5-Authority
E-G1-05-C5-Version
E-G1-05-C5-Fingerprint
E-G1-05-C5-Owner
E-G1-05-C5-Approval
```

**当前判定：BLOCKED**

---

## 9. C6｜Event & Analytics Contract（事件与数据分析契约）

### 必须严格区分

```text
Event
≠
State

Decision
≠
Metric

Metric
≠
Policy
```

Analytics 的职责：

```text
Record
Observe
Trace
Measure
```

而不是：

```text
Control Runtime
Modify State
Choose Policy
Extend Experience
```

Decision Trace 必须能够回答：

> 是用户表达、LLM 判断、Policy 决策，还是 State Machine 执行导致了最终行为？

### E1 证据

```text
E-G1-06-C6-Authority
E-G1-06-C6-Version
E-G1-06-C6-Fingerprint
E-G1-06-C6-Owner
E-G1-06-C6-Approval
```

**当前判定：BLOCKED**

---

## 10. C7｜Evaluation System（评测与验收体系）

### 核心冻结原则

```text
Demo Pass ≠ Product Pass
Test Green ≠ Product Correct
```

Evaluation 必须能够独立判断：

```text
Product Correct
AND
Experience Correct
AND
State Correct
AND
Policy Correct
AND
LLM Contract Correct
AND
API Correct
AND
Analytics Correct
AND
Agency Correct
AND
Regression Safe
```

Golden Suite：

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

### E1 证据

```text
E-G1-07-C7-Authority
E-G1-07-C7-Version
E-G1-07-C7-Fingerprint
E-G1-07-C7-Owner
E-G1-07-C7-Approval
```

**当前判定：BLOCKED**

---

# 11. 每份契约的正式冻结记录格式

每份 C1–C7 最终必须形成如下记录：

```text
Contract ID:
Contract Name:
Contract Version:

Authoritative Location:
[正式权威文档位置]

Revision / Fingerprint:
[Git commit / SHA-256 / immutable revision / 等价可审计标识]

Owner:
[负责人]

Approver:
[批准人 / 批准角色]

Approval Date:
[日期]

Approval Decision:
APPROVE / APPROVE WITH DOCUMENTED DEBT / BLOCK

Change Classification:
Type A / Type B / Type C

Effective From:
[生效版本/日期]

Supersedes:
[被替代版本，如有]

Evidence:
[正式文档、revision、approval record]

Status:
FROZEN / BLOCKED
```

---

# 12. 不允许接受的“伪冻结证据”

以下任何一种都**不能**使 G1 PASS：

```text
“我们之前已经讨论过”
“代码里已经这么实现”
“测试已经通过”
“Demo 看起来没问题”
“Prompt 已经写好了”
“版本号已经写了”
“大家口头同意了”
“AI coding agent 已经按照这个做了”
“文档存在，但没有明确哪个版本是权威版本”
```

尤其禁止：

> 用实现结果反向证明产品契约已经冻结。

---

# 13. 当前证据缺口

当前上下文中已经拥有：

- C1–C7 的规范内容
- 版本声明
- 契约职责边界
- 冲突裁决规则
- Golden Suite
- Engineering Boundary
- Evaluation System

但仍缺：

```text
□ C1 正式权威文档位置
□ C1 Fingerprint / Revision
□ C1 Owner
□ C1 Approval Record

□ C2 正式权威文档位置
□ C2 Fingerprint / Revision
□ C2 Owner
□ C2 Approval Record

□ C3 正式权威文档位置
□ C3 Fingerprint / Revision
□ C3 Owner
□ C3 Approval Record

□ C4 正式权威文档位置
□ C4 Fingerprint / Revision
□ C4 Owner
□ C4 Approval Record

□ C5 正式权威文档位置
□ C5 Fingerprint / Revision
□ C5 Owner
□ C5 Approval Record

□ C6 正式权威文档位置
□ C6 Fingerprint / Revision
□ C6 Owner
□ C6 Approval Record

□ C7 正式权威文档位置
□ C7 Fingerprint / Revision
□ C7 Owner
□ C7 Approval Record
```

---

# 14. G1 当前判定

```text
C1 = BLOCKED
C2 = BLOCKED
C3 = BLOCKED
C4 = BLOCKED
C5 = BLOCKED
C6 = BLOCKED
C7 = BLOCKED

G1 = BLOCKED
```

原因不是“契约没有定义”。

原因是：

> **契约内容已经基本定义，但当前没有足够的正式权威、版本指纹、Owner、Approval Evidence 来证明它已经冻结。**

这是正确的阻塞，而不是产品问题。

---

# 15. E1 完成条件

E1 不允许用“准备好了”关闭。

只有：

```text
C1 FROZEN
AND
C2 FROZEN
AND
C3 FROZEN
AND
C4 FROZEN
AND
C5 FROZEN
AND
C6 FROZEN
AND
C7 FROZEN
```

才允许：

```text
G1 → PASS CANDIDATE
```

随后进入：

```text
P2 Exit Review
→ Formal Sign-off
→ G1 PASS
```

---

# 16. 下一执行动作

在没有正式 authority evidence 之前，不执行 P3 coding。

下一并行工作为：

```text
E1 Contract Authority Evidence
        ↓
解决 G1 / PB-01

E2 First Experience Freeze
        ↓
解决 G7 / PB-02

E3 Release-Gate Metric Definition
        ↓
解决 PB-03

E4 Memory / Template Scope Decision
        ↓
解决 PB-04
```

然后才进入：

```text
G2 Cross-Contract Evidence
↓
G3 Golden Suite Execution
↓
G4 Engineering Boundary Verification
↓
G5 Independent Evaluation
↓
G6 Product Debt Closure
↓
G7 P3 Scope Freeze
↓
G8 Sign-off
↓
P2 CLOSED
```

**禁止跳过任何一项。**
