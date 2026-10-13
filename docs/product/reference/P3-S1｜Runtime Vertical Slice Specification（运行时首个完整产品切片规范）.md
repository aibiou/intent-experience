# P3-S1

## Runtime Vertical Slice Specification（运行时首个完整产品切片规范）

**Version:** 1.0\
**Status:** IMPLEMENTATION PREPARATION（实现准备）\
**Stage:** P3\
**Parent:** P3-ENTRY-1.0\
**Product Slice:** Exploratory Question Experience（探索型问题体验）\
**Sprint:** S1\
**Implementation Scope:** Runtime Core（运行时核心）

---

# 1. S1 Objective（S1 目标）

S1 只证明一个技术与产品命题：

> **用户的一次自然输入，可以经过 Intent → ExperienceState → Semantic Action → Policy → LLM Proposal → Validation → Runtime → State Update → Event / Decision Trace，形成一个可中断、可改变、可停止的真实体验运行时。**

完整链路：

```text
USER
 ↓
INPUT
 ↓
INTENT
 ↓
EXPERIENCE
 ↓
SEMANTIC ACTION
 ↓
POLICY
 ↓
LLM PROPOSAL
 ↓
VALIDATOR
 ↓
RUNTIME
 ↓
STATE TRANSITION
 ↓
EVENT
 ↓
DECISION TRACE
 ↓
UI
```

S1 不允许绕过其中任何关键边界。

---

# 2. S1 Success Definition（S1 成功定义）

S1 成功不是：

> “AI 能回答问题。”

而是同时满足：

### Product

- 用户可以进入一个真实 Experience；
- 用户可以直接提问；
- 用户可以要求 Why；
- 用户可以改变方向；
- 用户可以停止；
- 系统保持上下文；
- 系统不会强迫用户继续。

### System

- Runtime 是 ExperienceState 唯一写入者；
- Policy 是 Action 决策者；
- LLM 是 Proposal Provider；
- State Machine 是 Transition Authority；
- Event 是事实记录；
- Decision Trace 可以解释关键决策。

### Reliability

- stale write 被拒绝；
- duplicate request 可控；
- generation 可以取消；
- STOP / CHANGE 不被 retry 机制重新执行；
- 非法 State Transition 被拒绝。

---

# 3. S1 Scope（S1 范围）

## Included

```text
S1-01 Session
S1-02 Intent
S1-03 ExperienceState
S1-04 State Machine
S1-05 Semantic Action
S1-06 Policy
S1-07 LLM Gateway
S1-08 Validator
S1-09 Runtime
S1-10 STOP
S1-11 CHANGE
S1-12 State Version
S1-13 Events
S1-14 Decision Trace
S1-15 Golden Subset
```

---

# 4. S1 Explicit Non-Goals（S1 明确不做）

禁止进入 S1：

- 完整推荐系统；
- 完整 Memory；
- 完整 Creation；
- 多 Agent；
- RL；
- 社交；
- Feed；
- 商业化；
- 大规模搜索；
- 复杂用户画像；
- 多租户权限体系；
- 大规模微服务拆分；
- UI 动画打磨；
- 模型训练。

S1 的工程原则：

> **先把 Product Runtime 做对，再扩大能力。**

---

# 5. S1 Architecture（S1 架构）

```text
                    ┌──────────────┐
                    │   Frontend   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Product API  │
                    └──────┬───────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ Experience       │
                  │ Runtime          │
                  └──────┬───────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        ┌───────────┐        ┌────────────┐
        │ State     │        │ Intent     │
        │ Engine    │        │ Engine     │
        └─────┬─────┘        └──────┬─────┘
              │                     │
              └──────────┬──────────┘
                         ▼
                  ┌────────────┐
                  │   Policy   │
                  └─────┬──────┘
                        │
                        ▼
                  ┌────────────┐
                  │ LLM Gateway│
                  └─────┬──────┘
                        │
                        ▼
                  ┌────────────┐
                  │ Validator  │
                  └─────┬──────┘
                        │
                        ▼
                  State Transition
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
           Events          Decision Trace
```

---

# 6. Authority Model（权责模型）

| Component      | Owns                       | Cannot Own         |
| -------------- | -------------------------- | ------------------ |
| Frontend       | UI/input                   | Product State      |
| Product API    | API boundary               | Policy             |
| Intent Engine  | Intent interpretation      | State mutation     |
| Runtime        | ExperienceState            | Policy definition  |
| State Engine   | State transition execution | LLM output         |
| Policy         | Allowed Action             | Content generation |
| LLM Gateway    | Model capability           | State / Policy     |
| Validator      | Proposal validation        | Product decision   |
| Event System   | Facts                      | Runtime control    |
| Decision Trace | Decision evidence          | Decision authority |

核心原则：

> **Capability ≠ Authority**

---

# 7. S1-01｜Session

## Responsibility

建立最小 Session 生命周期。

### States

```text
SESSION_IDLE
    ↓
SESSION_ACTIVE
    ↓
SESSION_ENDING
    ↓
SESSION_ENDED
```

### Allowed

- start
- active interaction
- stop
- end

### Forbidden

`SESSION_ENDED → SESSION_ACTIVE`

除非创建新的 Session。

### Acceptance

- Session ID 唯一；
- Session state 可追踪；
- Session ended 后旧操作拒绝；
- 不自动创建新 Session。

---

# 8. S1-02｜Intent

## Input

自然语言。

例如：

> “给我一个奇怪的问题。”

## Output

```json
{
  "intent_id": "intent_xxx",
  "goal": "explore",
  "state": "curious",
  "depth": "light",
  "interaction": "interactive",
  "confidence": 0.91,
  "source": "explicit"
}
```

字段不要求全部存在。

### Rule

如果用户意图已经足够明确：

> 不允许为了填字段而追问。

### Acceptance

- 明确 Intent → 直接执行；
- 模糊但低风险 → 合理默认；
- 只有重大结果差异时才允许 ASK；
- Intent 必须 versioned；
- Intent 不直接修改 ExperienceState。

---

# 9. S1-03｜ExperienceState

## Minimum Schema

```json
{
  "experience_id": "exp_xxx",
  "experience_version": "1.0.0",
  "session_id": "session_xxx",
  "stage": "CURIOSITY",
  "goal": "...",
  "context": {},
  "knowledge": [],
  "user_questions": [],
  "user_hypotheses": [],
  "user_actions": [],
  "branches": [],
  "completion": {
    "status": "active"
  },
  "control": {
    "interruptible": true,
    "waiting_for_user": false
  },
  "state_version": 1
}
```

### Ownership

只有 Runtime / State Engine 可以写入。

### Acceptance

任何未经授权的写入：

> REJECT

---

# 10. S1-04｜State Machine

S1 只实现当前切片需要的状态。

## Experience

```text
ENTERING
 ↓
READY
 ↓
ACTIVE
 ↓
WAITING
 ↓
ACTIVE
 ↓
COMPLETED
```

特殊：

```text
READY → CHANGE_DIRECTION
ACTIVE → CHANGE_DIRECTION
ACTIVE → STOP
WAITING → STOP
```

### Critical Rules

STOP：

> 不允许自动进入下一体验。

CHANGE：

> 必须取消当前 generation。

---

# 11. S1-05｜Semantic Action

S1 第一版只启用：

```text
DIRECT_ANSWER
WHY
WHAT_IF
CHANGE_DIRECTION
STOP
```

未来动作暂时保留但不得自动启用：

- DEEPEN
- SIMPLIFY
- REFRAME
- CREATE
- MODIFY
- SEARCH

---

# 12. Semantic Action Priority

```text
STOP
 ↓
CHANGE_DIRECTION
 ↓
DIRECT_ANSWER
 ↓
WHY
 ↓
WHAT_IF
```

### Critical Rule

如果用户输入同时包含多个信号：

> STOP 优先。

例如：

> “好了，不过你再告诉我……”

解释为：

> STOP

而不是继续回答。

---

# 13. S1-06｜Policy

Policy 输入：

```text
User Input
Semantic Action
Current Intent
Current ExperienceState
Session State
```

输出：

```json
{
  "decision_id": "decision_xxx",
  "action": "ANSWER",
  "reason": "explicit_user_request",
  "requires_tool": false,
  "state_transition": "ACTIVE_TO_ACTIVE",
  "confidence": 0.98
}
```

---

# 14. Policy Rules

### DIRECT_ANSWER

```text
DIRECT_ANSWER → ANSWER
```

### WHY

```text
WHY → EXPLAIN
```

### WHAT_IF

```text
WHAT_IF → SIMULATE
```

### CHANGE

```text
CHANGE_DIRECTION → CHANGE_EXPERIENCE
```

### STOP

```text
STOP → STOP
```

---

# 15. Policy Hard Rules

### Rule P-01

STOP 永远优先。

### Rule P-02

CHANGE 必须取消旧操作。

### Rule P-03

Explicit User Direction > Experience Progress。

### Rule P-04

Policy 不生成事实内容。

### Rule P-05

Policy 不允许 LLM 自己选择最终 Action。

---

# 16. S1-07｜LLM Gateway

LLM Request 必须结构化。

```json
{
  "request_id": "req_xxx",
  "session_id": "session_xxx",
  "experience_id": "exp_xxx",
  "intent": {},
  "experience_state": {},
  "semantic_action": "WHY",
  "allowed_action": "EXPLAIN",
  "context": {}
}
```

LLM Response 必须是 Proposal。

```json
{
  "proposal_id": "proposal_xxx",
  "content": "...",
  "state_update_proposal": {},
  "confidence": 0.91
}
```

---

# 17. LLM Forbidden Actions

LLM 不得：

- 写 ExperienceState；
- 决定 STOP 是否有效；
- 决定 CHANGE 是否有效；
- 修改 Policy；
- 写 Memory；
- 决定 Completion；
- 自动启动下一体验；
- 修改 State Version；
- 写 Analytics Truth。

---

# 18. S1-08｜Validator

Validator 检查：

```text
Schema
 ↓
Allowed Action
 ↓
State Compatibility
 ↓
Intent Alignment
 ↓
Continuity
 ↓
Reliability
 ↓
Uncertainty
 ↓
Agency
```

失败：

```text
Proposal
 ↓
REJECT
 ↓
bounded retry / fallback
```

不能无限 Retry。

---

# 19. S1-09｜Runtime

Runtime 是 S1 核心。

执行：

```text
Input
 ↓
Semantic Action
 ↓
Policy Decision
 ↓
Capability
 ↓
Validation
 ↓
State Transition
 ↓
Event
 ↓
Response
```

Runtime 必须保证：

> 每次状态变化都有明确 Transition。

---

# 20. S1-10｜STOP

输入：

> “好了。”

执行：

```text
USER
 ↓
STOP
 ↓
POLICY
 ↓
CANCEL CURRENT OPERATION
 ↓
STATE TRANSITION
 ↓
SESSION / EXPERIENCE END
 ↓
EVENT
```

### Forbidden

- 自动推荐；
- 自动继续；
- “最后再看一个”；
- 询问是否确定；
- 后台继续生成。

---

# 21. S1-11｜CHANGE

输入：

> “换一个。”

执行：

```text
CHANGE_DIRECTION
 ↓
Policy
 ↓
Cancel Generation
 ↓
Reject Old Candidate
 ↓
Create New Candidate
 ↓
New Experience
```

### Critical

旧 generation 即使晚返回：

> 也不得写入新 State。

---

# 22. S1-12｜State Version

所有写操作携带：

```text
state_version
```

例如：

```text
Current = 12

Request A:
expected_version = 12

Request B:
expected_version = 12
```

B 先提交：

```text
→ version 13
```

A 再提交：

```text
→ STATE_VERSION_CONFLICT
```

不得覆盖。

---

# 23. S1-13｜Events

S1 最低事件：

```text
session_started
intent_created
experience_started
user_action
semantic_action_detected
policy_decided
generation_started
generation_completed
generation_cancelled
state_transitioned
change_direction_requested
stop_requested
experience_completed
state_write_rejected
version_conflict
```

---

# 24. Event Rule

Event 是：

> Fact（事实）

不是：

> Command（命令）

Analytics 不得通过 Event 直接改变 Runtime。

---

# 25. S1-14｜Decision Trace

每个核心决策至少记录：

```json
{
  "decision_id": "decision_xxx",
  "input_event": "evt_xxx",
  "semantic_action": "CHANGE_DIRECTION",
  "state_before": {},
  "intent_before": {},
  "policy_version": "policy_v1.0.0",
  "selected_action": "CHANGE_EXPERIENCE",
  "reason": "explicit_user_direction",
  "state_after": {},
  "user_override": true
}
```

必须可以回答：

> “为什么系统刚才这么做？”

---

# 26. S1-15｜Golden Subset

S1 不等待完整 G01–G08 才开始开发。

先执行核心子集：

```text
GS-01 Direct Answer
GS-02 Why
GS-03 Change
GS-04 Stop
GS-05 State Version Conflict
GS-06 LLM State Mutation Rejection
```

### GS-01

输入：

> “直接告诉我答案。”

Expected:

`DIRECT_ANSWER → ANSWER`

---

### GS-02

输入：

> “为什么？”

Expected:

`WHY → EXPLAIN`

---

### GS-03

输入：

> “换一个。”

Expected:

`CHANGE → cancel → new direction`

---

### GS-04

输入：

> “好了。”

Expected:

`STOP → terminate`

---

### GS-05

模拟 stale write。

Expected:

`STATE_VERSION_CONFLICT`

---

### GS-06

模拟：

```text
LLM → state_update
```

Expected：

> Validator / Runtime reject。

---

# 27. S1 API Contract

最小接口：

```text
POST /session/start

POST /intent/resolve

POST /experience/start

GET /experience/{id}/state

POST /experience/{id}/event

POST /policy/decide

POST /capability/answer

POST /capability/explain

POST /capability/simulate

POST /events

POST /decision-traces
```

S1 暂不开放：

```text
POST /memory/*
POST /creation/*
POST /experience/candidates/*
```

除非具体任务进入 Sprint 2。

---

# 28. Error Contract

S1 必须实现：

```text
INVALID_REQUEST
INVALID_STATE_TRANSITION
STATE_VERSION_CONFLICT
INVALID_ACTION
POLICY_REJECTED
LLM_TIMEOUT
LLM_SCHEMA_INVALID
LLM_UNAVAILABLE
REQUEST_DUPLICATE
INTERNAL_ERROR
```

错误不得导致：

> State silently corrupted（状态静默损坏）。

---

# 29. Retry Policy

### LLM Schema Failure

最多：

> 1 retry

### LLM Timeout

最多：

> 1 retry / fallback

### STOP

> 不 retry

### CHANGE

> 不 retry old operation

### State Version Conflict

> 不自动覆盖

---

# 30. S1 Task Specification

## S1-01 Session Foundation

**Task**

实现 Session 生命周期。

**Contract**

C1 / C2 / C5

**Acceptance**

- Session 可创建；
- 状态合法；
- ended 后旧操作拒绝；
- Event 完整。

---

## S1-02 Intent Resolver

**Task**

实现自然语言 Intent → Structured Intent。

**Forbidden**

- 为填字段主动追问；
- 修改 ExperienceState；
- 创建 Memory。

**Acceptance**

明确 Intent 可直接进入 Experience。

---

## S1-03 ExperienceState Store

**Task**

实现 ExperienceState 唯一写入路径。

**Critical**

所有写操作必须经过 State Version。

**Acceptance**

stale write = reject。

---

## S1-04 State Machine

**Task**

实现 S1 状态与合法 Transition。

**Forbidden**

任意状态跳转。

**Acceptance**

非法 transition = reject。

---

## S1-05 Semantic Action Classifier

**Task**

输入自然语言 → Semantic Action。

**Acceptance**

GS-01 ～ GS-04 达到定义行为。

---

## S1-06 Policy Engine

**Task**

Semantic Action → Policy Action。

**Forbidden**

LLM 决策 Policy。

---

## S1-07 LLM Gateway

**Task**

封装模型能力。

**Critical**

LLM output 永远是 Proposal。

---

## S1-08 Validator

**Task**

验证 Proposal。

**Acceptance**

GS-06 PASS。

---

## S1-09 Runtime Executor

**Task**

串联完整执行链。

**Acceptance**

每次 action 有 State Transition。

---

## S1-10 Interrupt Controller

**Task**

处理 STOP / CHANGE 的 generation cancellation。

**Critical**

旧 operation 不得提交。

---

## S1-11 Event Pipeline

**Task**

生成完整 Event。

**Acceptance**

所有核心状态变化可追踪。

---

## S1-12 Decision Trace

**Task**

保存 Policy / Runtime 决策链。

**Acceptance**

可以重建一次核心决策。

---

## S1-13 API Layer

**Task**

暴露 Product API。

**Forbidden**

Frontend 直接调用 LLM。

---

## S1-14 Golden Runner

**Task**

自动执行 GS-01～GS-06。

**Acceptance**

结果可重复。

---

## S1-15 Integration Harness

**Task**

把上述模块组合成可运行 Vertical Slice。

**Acceptance**

完成一次：

```text
User
→ Intent
→ Experience
→ Action
→ Policy
→ LLM
→ Validator
→ Runtime
→ State
→ Event
→ Trace
```

---

# 31. AI Coding Task Protocol（AI 编码任务协议）

每个任务提交给 AI Coding Team 时必须包含：

```text
Task ID
Goal
Context
Authoritative Contracts
Inputs
Outputs
State
Allowed Actions
Forbidden Actions
Dependencies
API
Events
Tests
Acceptance
Failure Handling
Version Impact
```

AI Coding Team 如果发现：

> Spec Conflict

必须：

```text
STOP
→ Issue
→ Report conflict
```

不得自行选择。

---

# 32. Code Review Requirements（代码审查）

任何涉及以下文件/模块的 PR 必须提高审查级别：

- State Engine
- Runtime
- Policy
- Validator
- Memory
- Authorization
- Completion
- Interrupt
- Event

审查必须回答：

1. 是否违反权责边界？
2. 是否存在 State 双写？
3. 是否可能 stale write？
4. STOP 是否绝对有效？
5. CHANGE 是否真正取消旧 operation？
6. LLM 是否获得了隐性权限？
7. 是否新增未定义行为？
8. 是否新增 Product Debt？
9. 是否需要 Golden Case？
10. 是否改变 Contract Version？

---

# 33. S1 Product Review Gate

S1 完成后，不直接进入 UI 打磨。

必须经过：

```text
Engineering Test
 ↓
Contract Test
 ↓
Golden Subset
 ↓
Product Review
 ↓
P3-S2
```

---

# 34. S1 Blockers

任何以下情况都会阻塞 S1：

### P0

- LLM 直接修改 State；
- STOP 无法终止；
- CHANGE 后旧结果覆盖新状态；
- stale write 成功；
- 非法 State Transition 成功；
- Policy 可被 LLM 绕过；
- Event 与真实 State 不一致；
- 用户无法自然退出。

### P1

- Decision Trace 缺失；
- Intent 丢失；
- 核心上下文丢失；
- retry 造成重复执行；
- API 绕过 Runtime。

---

# 35. S1 Metrics

S1 不追踪：

- Session Time
- Message Count
- Click Count

核心工程指标：

```text
State Integrity
Policy Boundary Compliance
LLM Boundary Compliance
STOP Success
CHANGE Success
Stale Write Rejection
Interrupt Success
Decision Trace Completeness
Event Completeness
Golden Subset Pass Rate
```

其中关键硬门槛：

```text
State Integrity = 100%
STOP = 100%
CHANGE = 100%
Stale Write Rejection = 100%
LLM State Bypass = 0
Policy Bypass = 0
```

---

# 36. S1 Exit Criteria（S1 退出条件）

只有同时满足：

```text
Schema Implemented
AND
State Machine Implemented
AND
Runtime Implemented
AND
Policy Implemented
AND
LLM Boundary Verified
AND
Validator Verified
AND
STOP PASS
AND
CHANGE PASS
AND
State Version PASS
AND
Event PASS
AND
Decision Trace PASS
AND
Golden Subset PASS
```

才能：

> **S1 COMPLETE**

否则：

> S1 OPEN

---

# 37. S1 → S2

S1 完成后进入：

**P3-S2｜Experience Vertical Slice（体验首个完整切片）**

S2 才加入：

- First Experience 完整呈现；
- DEEPEN；
- SIMPLIFY；
- REFRAME；
- WHAT_IF 完整分支；
- Search；
- Creation Branch；
- Minimal Memory；
- 更完整的 Golden Suite。

---

# 38. S1 Product Owner Decision

正式冻结：

> **S1 不以“AI 回答质量”作为主要成功标准。**

第一优先级：

> **Runtime Correctness（运行时正确性）**

第二优先级：

> **Agency Integrity（用户主导权完整性）**

第三优先级：

> **Experience Adaptation（体验适应能力）**

第四优先级：

> **Content Quality（内容质量）**

原因：

如果 Runtime 权责边界没有建立，再好的模型只会把错误放大。

---

# 39. Current Status

```text
P0  COMPLETE
P1  COMPLETE

P2  CLOSURE CANDIDATE
    └─ Exit Gate not passed

P3  ACTIVE

P3-S1
    ├─ Scope          FROZEN
    ├─ Architecture   FROZEN
    ├─ Task List      DEFINED
    ├─ Acceptance     DEFINED
    └─ Implementation READY TO START
```

---

# 40. Next Execution Order

接下来严格按：

```text
S1-01 Session
 ↓
S1-02 Intent
 ↓
S1-03 ExperienceState
 ↓
S1-04 State Machine
 ↓
S1-05 Semantic Action
 ↓
S1-06 Policy
 ↓
S1-07 LLM Gateway
 ↓
S1-08 Validator
 ↓
S1-09 Runtime
 ↓
S1-10 Interrupt
 ↓
S1-11 Events
 ↓
S1-12 Decision Trace
 ↓
S1-13 API
 ↓
S1-14 Golden Runner
 ↓
S1-15 Integration Harness
```

**不得跳过 State / Policy / Validator，直接做 UI Demo。**

---

# Final Product Decision

**P3-S1 正式冻结为 Runtime-first（运行时优先）。**

第一条真正需要被证明的产品链路不是：

> “用户看到一个很酷的 AI 页面。”

而是：

> **用户表达意图 → 系统理解 → 体验开始 → 用户改变方向 → 系统正确响应 → 用户可以停止 → 整个过程中状态、策略、模型和行为边界都可验证。**

这条链路成立，才有资格进入下一阶段。
