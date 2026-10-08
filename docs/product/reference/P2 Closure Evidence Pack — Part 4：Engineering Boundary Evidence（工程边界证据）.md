# P2 Closure Evidence Pack — Part 4

## Engineering Boundary Evidence（工程边界证据）

**Document ID：** P2-EVIDENCE-4.0\
**阶段：** P2｜Product Engineering Contract（产品工程契约）\
**前置：** Part 1–3\
**当前状态：** Closure Candidate（关闭候选）

---

# 1. 目的

Part 4 不重新设计系统架构。

它只回答一个问题：

> **实现层是否具备足够的边界控制，使 C1–C7 和 Golden Suite 的产品契约不会被实现细节绕过？**

核心原则：

```text
Implementation
    ↓
must obey
    ↓
Frozen Contracts
```

而不是：

```text
Implementation Difficulty
    ↓
change
    ↓
Product Contract
```

---

# 2. Engineering Boundary Model（工程边界模型）

系统必须保持：

```text
USER
 ↓
FRONTEND
 ↓
PRODUCT API
 ↓
RUNTIME
 ├── INTENT
 ├── POLICY
 ├── LLM GATEWAY
 ├── TOOL GATEWAY
 ├── MEMORY POLICY
 └── STATE MACHINE
 ↓
EXPERIENCE STATE
 ↓
EVENT / DECISION TRACE
```

其中：

> **Runtime（运行时）是当前体验执行边界。**

---

# 3. EB-01 — Runtime Single Writer（Runtime 单一写入者）

## Contract

ExperienceState 的唯一合法写入者：

> Runtime。

其他模块只能：

- Read
- Propose
- Request
- Decide

不能直接写入。

## Allowed

```text
LLM
→ State Update Proposal

Policy
→ State Transition Decision

State Machine
→ Transition Authorization

Runtime
→ State Mutation
```

## Forbidden

```text
LLM → DB / State
Frontend → DB / State
Analytics → DB / State
Memory → ExperienceState
Tool → ExperienceState
```

## Required Evidence

必须存在：

- state write API ownership
- unauthorized write test
- module permission test
- runtime write trace
- state mutation audit

## Blocker

任何非 Runtime 模块能够直接修改 ExperienceState：

> **P0 State Integrity Violation**

## Status

**Evidence Required：☐**

---

# 4. EB-02 — State Version（状态版本）

每次合法状态变更必须：

```text
state_version + 1
```

请求必须绑定预期状态版本。

### Example

```text
Current = 10

Request A expects 10
→ success
→ 11

Request B expects 10
→ STATE_VERSION_CONFLICT
```

### Required

```text
Expected Version
Current Version
Write Result
```

都必须可追踪。

## Forbidden

```text
last write wins
```

对于产品状态来说不是合法策略。

## Required Tests

- concurrent write
- delayed write
- stale response
- duplicate write
- retry after conflict

## Status

**Evidence Required：☐**

---

# 5. EB-03 — Idempotency（幂等）

重复请求不得产生重复产品行为。

尤其是：

```text
START
CREATE
MODIFY
STOP
CHANGE
```

### Example

同一个：

```text
client_request_id
```

重复发送：

```text
Request #1 → executed
Request #2 → duplicate
```

不能：

```text
CREATE
→ CREATE AGAIN
```

## Required

```text
request_id
client_request_id
idempotency semantics
duplicate detection
```

## 特殊规则

STOP 重复：

```text
STOP
STOP
STOP
```

必须保持安全、幂等。

CHANGE 重复不得生成多个不必要体验。

## Status

**Evidence Required：☐**

---

# 6. EB-04 — Interruptibility（可中断性）

这是 AI-native Experience Runtime 的核心工程能力。

系统必须允许：

```text
GENERATING
↓
USER INTERRUPT
↓
CANCEL
↓
PROCESS NEW INPUT
```

而不是：

```text
GENERATING
↓
finish generation
↓
finally process user
```

---

## Required Interrupt Cases

### I1

用户在普通生成过程中说：

> “停。”

### I2

用户在生成过程中说：

> “换一个。”

### I3

用户在生成过程中输入新的问题。

### I4

用户关闭当前体验。

---

## Required Result

旧操作必须进入：

```text
CANCELLED
```

或等价终止状态。

旧结果不得重新进入 Runtime。

## Blocker

用户已经 STOP，但旧 generation 最终仍改变当前体验：

> **P0 Agency / State Integrity Violation**

## Status

**Evidence Required：☐**

---

# 7. EB-05 — Stale Result Rejection（过期结果拒绝）

任何异步结果必须验证：

```text
session_id
experience_id
experience_version
state_version
request_id
```

至少满足当前契约要求的版本一致性。

### Example

```text
Experience A
state_version = 12

↓ user CHANGE

Experience B
state_version = 13

↓ old A response arrives

Runtime
→ REJECT STALE RESULT
```

禁止：

```text
old A response
→ overwrite B
```

## Required Test

必须人为制造：

> **旧请求晚于新请求返回。**

这是 P2 强制测试。

## Status

**Evidence Required：☐**

---

# 8. EB-06 — Retry Boundary（重试边界）

Retry 只用于：

- transient failure
- timeout
- schema failure
- bounded tool failure

不能用于：

> **把用户意图重新解释到系统满意为止。**

### Allowed

```text
LLM Schema Invalid
→ constrained retry
→ max 1
```

### Forbidden

```text
User: STOP
→ retry generation
```

```text
User: CHANGE
→ retry old experience
```

```text
Ambiguous input
→ repeatedly retry until certainty
```

## Core Rule

> Retry is an engineering recovery mechanism, not a product decision mechanism.

## Status

**Evidence Required：☐**

---

# 9. EB-07 — Timeout Boundary（超时边界）

超时不能导致：

- state corruption
- hidden continuation
- duplicate creation
- lost STOP
- lost CHANGE
- invalid completion

### Required Behavior

```text
Timeout
↓
bounded recovery
↓
preserve state
↓
allow user control
```

### Failure Options

根据当前状态：

- retry bounded
- fallback
- WAIT
- CHANGE
- STOP

不能：

> 因为模型超时而自行决定新的体验方向。

## Status

**Evidence Required：☐**

---

# 10. EB-08 — LLM Boundary（LLM 边界）

LLM Gateway 必须是能力边界，而不是产品控制中心。

## Allowed

```text
Understand
Classify
Resolve
Generate
Propose
Detect Uncertainty
Generate Candidate
```

## Forbidden

```text
Policy Decision
State Mutation
Memory Write
Authorization
Completion Decision
Safety Permission
Engagement Optimization
UI Navigation Decision
```

## Required Test

人为构造一个：

> LLM 输出要求直接修改 ExperienceState。

Validator / Runtime 必须拒绝。

### Expected

```text
LLM Output
→ Validator
→ REJECT
```

而不是：

```text
LLM Output
→ State
```

## Status

**Evidence Required：☐**

---

# 11. EB-09 — Frontend Boundary（前端边界）

Frontend 只负责：

- render
- input
- interaction
- animation
- local presentation state

Frontend 不负责：

- Policy
- Intent decision
- Experience selection
- Memory decision
- LLM direct invocation
- ExperienceState mutation

## Forbidden

```text
Frontend
→ LLM
→ Policy bypass
```

或：

```text
Frontend
→ directly mutate ExperienceState
```

## Required Test

前端尝试执行未经 Runtime 授权的产品行为。

Expected：

```text
Rejected / impossible by architecture
```

## Status

**Evidence Required：☐**

---

# 12. EB-10 — Memory Write Boundary（记忆写入边界）

Memory lifecycle：

```text
Observed
↓
Candidate
↓
Policy Evaluation
↓
Active Memory
```

### Allowed

LLM：

```text
propose Memory Candidate
```

### Forbidden

LLM：

```text
write Active Memory
```

Frontend：

```text
write Active Memory
```

Runtime：

```text
bypass Memory Policy
```

### Required Cases

1. 行为产生 Candidate。
2. Policy Reject。
3. Explicit “记住这个”。
4. 用户要求停止使用某记忆。
5. Current Intent 与 Memory 冲突。

## P0

Memory bypass Policy：

> **P0 Policy / Agency Violation**

## Status

**Evidence Required：☐**

---

# 13. EB-11 — Tool Authorization Boundary（工具授权边界）

工具调用：

```text
LLM Tool Request
↓
Tool Policy
↓
Authorization
↓
Tool Execution
↓
Result Validation
↓
Runtime / LLM
```

LLM 不得直接执行工具。

### Required Tests

- unauthorized tool
- malformed request
- tool timeout
- tool failure
- duplicate tool request
- user STOP during tool execution
- user CHANGE during tool execution

### 特别规则

STOP / CHANGE 后：

> 旧 Tool Result 不得重新触发已取消的 Experience Action。

## Status

**Evidence Required：☐**

---

# 14. EB-12 — API Boundary（API 边界）

Product API 是产品系统边界。

Frontend：

```text
Frontend
→ Product API
```

而不是：

```text
Frontend
→ LLM Provider
```

---

## State-changing API

必须具备：

```text
request_id
session_id
state_version
```

必要时：

```text
client_request_id
idempotency key
```

---

## Error Semantics

必须区分：

```text
INVALID_STATE_TRANSITION
STATE_VERSION_CONFLICT
POLICY_REJECTED
LLM_TIMEOUT
LLM_SCHEMA_INVALID
TOOL_TIMEOUT
TOOL_FAILED
MEMORY_POLICY_REJECTED
REQUEST_DUPLICATE
```

禁止所有错误统一变成：

```text
500 INTERNAL ERROR
```

否则 Runtime 无法进行正确恢复。

## Status

**Evidence Required：☐**

---

# 15. EB-13 — Completion Boundary（完成边界）

Completion 不属于 LLM 自主权限。

LLM 可以：

> 判断“用户似乎已经理解”。

但不能直接：

```text
completion.is_complete = true
```

### Completion 来源

必须经过：

```text
User Goal
+
Runtime State
+
Policy
+
Legal State Transition
```

### 特别规则

用户说：

> “好了。”

必须按 STOP 处理，而不是让 LLM 自行判断：

> “用户应该还想继续。”

## Status

**Evidence Required：☐**

---

# 16. EB-14 — Analytics Boundary（分析边界）

Analytics 只能观察：

```text
User Event
System Event
Decision Trace
Outcome
Metric
```

不能修改：

```text
Policy
Runtime State
Experience State
```

### Required Test

构造：

```text
Session Time ↓
```

系统不能因此自动：

```text
extend experience
```

构造：

```text
Completion Rate ↓
```

系统不能自动：

```text
lower completion threshold
```

## Status

**Evidence Required：☐**

---

# 17. EB-15 — Replayability（可回放）

系统必须能够利用：

```text
Event
+
Decision Trace
+
State Snapshot
+
Contract Versions
```

重建关键行为。

至少支持：

- Golden Cases
- STOP
- CHANGE
- CORRECTION
- Memory Boundary
- stale write

的行为回放。

## 目标

回答：

> **为什么当时系统做出了这个决定？**

而不是只能回答：

> “日志里好像发生过。”

## Status

**Evidence Required：☐**

---

# 18. EB-16 — Version Traceability（版本可追溯性）

一次产品行为必须能够关联：

```text
Product Version
Contract Versions
Schema Version
Policy Version
Prompt Version
Model Version
Evaluation Corpus Version
Code Revision
```

否则出现问题时无法判断：

> 哪一个版本改变了行为。

---

# 19. Engineering Boundary Fault Matrix（工程故障矩阵）

| Fault                           | Expected Protection    | Blocker |
| ------------------------------- | ---------------------- | ------- |
| LLM timeout                     | bounded retry/fallback | P1      |
| LLM invalid schema              | validator + retry      | P1      |
| stale state write               | reject                 | P0      |
| duplicate request               | idempotency            | P1      |
| user STOP during generation     | cancel                 | P0      |
| user CHANGE during generation   | cancel + invalidate    | P0      |
| old result arrives late         | reject                 | P0      |
| unauthorized LLM state mutation | reject                 | P0      |
| unauthorized memory write       | reject                 | P0      |
| unauthorized tool               | reject                 | P1      |
| frontend policy bypass          | impossible/reject      | P0      |
| analytics runtime mutation      | impossible/reject      | P0      |
| network interruption            | preserve state         | P1      |
| replay mismatch                 | investigate            | P1      |

---

# 20. Engineering Boundary Exit Criteria（工程边界退出条件）

Part 4 只有满足：

```text
Runtime Single Writer PASS
AND
State Version PASS
AND
Idempotency PASS
AND
Interrupt PASS
AND
Stale Result Rejection PASS
AND
Retry Boundary PASS
AND
Timeout Boundary PASS
AND
LLM Boundary PASS
AND
Frontend Boundary PASS
AND
Memory Boundary PASS
AND
Tool Boundary PASS
AND
API Boundary PASS
AND
Completion Boundary PASS
AND
Analytics Boundary PASS
AND
Replayability PASS
AND
Version Traceability PASS
```

才能标记：

> **Engineering Boundary PASS**

---

# 21. P2 Blocker Rule

任何以下问题都直接阻止 P2 Closure：

```text
LLM can mutate state
OR
Frontend can bypass Policy
OR
Memory can override current intent
OR
STOP can be lost
OR
CHANGE can be lost
OR
Stale result can overwrite new state
OR
Runtime state can be corrupted
OR
Unauthorized action can execute
OR
Critical decision cannot be traced
```

---

# 22. 当前状态

Part 4 当前完成的是：

> **Engineering Boundary Requirements Defined（工程边界要求已定义）**

尚未执行真实测试。

因此：

> **Status：EVIDENCE PENDING（证据待补）**

不得标记 PASS。

---

# 23. P2 Closure Progress

当前证据链：

```text
P2 Closure Evidence Pack
│
├── Part 1 Contract Freeze
│   └── Defined / Evidence Pending
│
├── Part 2 Cross-Contract Consistency
│   └── Defined / Evidence Pending
│
├── Part 3 Golden Suite
│   └── Defined / Execution Pending
│
└── Part 4 Engineering Boundary
    └── Defined / Evidence Pending
```

因此：

> **P2 仍然是 Closure Candidate。**

---

# 24. 下一步

进入：

**Part 5 — Evaluation Evidence（独立评测证据）**

Part 5 要回答：

> **谁来证明系统真的符合这些契约，而且这个“证明者”本身没有被实现团队或模型输出影响？**

重点包括：

- Evaluation Independence（评测独立性）
- Deterministic Tests（确定性测试）
- Probabilistic AI Evaluation（概率型 AI 评测）
- Scenario Matrix（场景矩阵）
- Fault Injection（故障注入）
- Regression（回归）
- Agency Evaluation（用户自主权评测）
- Product Acceptance（产品验收）
- Release Gate（发布门槛）
- Evaluation Report（评测报告）

Part 5 仍属于 P2。

**在 Part 5、Part 6、Part 7 完成之前，不进入 P3 实现。**
