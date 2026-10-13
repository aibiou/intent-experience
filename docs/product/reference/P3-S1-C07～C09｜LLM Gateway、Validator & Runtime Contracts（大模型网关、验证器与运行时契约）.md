# P3-S1-C07～C09｜LLM Gateway、Validator & Runtime Contracts

**大模型网关、验证器与运行时契约**

**Document ID：** P3-S1-C07-C09\
**Version：** 1.0.0\
**Status：** FREEZE CANDIDATE（冻结候选）\
**Scope：** P3-S1 Runtime Vertical Slice（运行时首个完整产品切片）\
**Dependencies：** C01～C06\
**Authority：** C1 Core Schema Specification（核心数据结构规范）+ C2 State Machine Specification（状态机规范）+ C3 Action & Policy Contract（动作与策略契约）+ C4 LLM Contract（大模型调用契约）

---

# 1. 核心原则

本契约正式冻结以下原则：

> **模型可以替换，模型调用可以失败，模型返回可以被拒绝，但任何一次调用及其最终处理结果都必须可追踪、可解释、可回放。**

同时：

> **LLM 是能力提供者，不是产品状态、策略或运行时的拥有者。**

完整边界：

```text
User
 ↓
Intent
 ↓
Semantic Action
 ↓
Policy
 ↓
LLM Gateway
 ↓
Model Router
 ↓
Provider Adapter
 ↓
LLM
 ↓
LLM Response / Error
 ↓
Validator
 ↓
Runtime
 ↓
ExperienceState
 ↓
Event / Decision Trace
```

其中：

- LLM Gateway：负责统一模型调用
- Model Router：负责模型选择
- Provider Adapter：负责供应商协议适配
- Validator：负责判断模型结果是否可以进入产品运行时
- Runtime：唯一负责状态实际执行与写入
- Event / Decision Trace：记录事实与决策链
- Analytics：观察系统，不控制系统

---

# 2. C07｜LLM Gateway Contract（大模型网关契约）

## 2.1 Provider / Model Agnostic

产品不得绑定：

- 单一模型
- 单一模型系列
- 单一模型供应商
- 单一 SDK
- 单一 Provider API
- 单一模型 Prompt 格式

业务层只能依赖：

```text
LLM Gateway Interface
```

而不能依赖：

```text
Provider SDK
Provider API
Provider-specific response
Provider-specific error
```

供应商差异必须终止于：

```text
Provider Adapter
```

---

# 3. Model Configuration（模型配置）

模型配置必须外部化。

```json
{
  "model_profile_id": "profile_xxx",
  "provider_id": "provider_xxx",
  "model_id": "model_xxx",
  "model_version": "version_xxx",

  "capabilities": {
    "structured_output": true,
    "tool_calling": false,
    "vision": false,
    "long_context": true,
    "streaming": true
  },

  "limits": {
    "context_tokens": 0,
    "output_tokens": 0
  },

  "generation": {
    "temperature": 0.2,
    "top_p": 1.0
  },

  "timeout_ms": 0,
  "retry_policy_id": "retry_xxx",
  "status": "ACTIVE"
}
```

产品逻辑不得写：

```text
if model == xxx
```

或者：

```text
if provider == xxx
```

来决定产品行为。

模型选择必须基于 Capability Profile（能力画像），而不是产品逻辑直接依赖模型名称。

---

# 4. Model Router（模型路由）

Model Router 负责：

> 根据当前任务需要选择满足条件的模型配置。

输入可以包括：

- Task Type
- Required Capability
- Latency Budget
- Reliability Requirement
- Context Size
- Output Schema
- Safety Requirement
- Availability
- Cost Constraint
- Model Version
- Experiment Configuration

但不得直接使用：

- Session Time
- Engagement
- Click Probability
- 用户停留时长

作为模型调用授权依据。

模型路由属于：

> Infrastructure Decision（基础设施决策）

而不是：

> Product Policy（产品策略）。

---

# 5. LLM Call Record（模型调用记录）

## 5.1 强制原则

**每一次 LLM 调用都必须产生一条 Call Record。**

无论结果是：

```text
成功
失败
超时
取消
限流
Provider Error
Invalid Output
Schema Error
Policy Reject
Validator Reject
Stale Result
Fallback
Fallback Failed
```

都不得出现：

> “因为异常，所以没有记录。”

异常本身就是必须记录的运行事实。

---

# 6. LLM Call Record Schema（模型调用记录结构）

建议最小结构：

```json
{
  "request_id": "request_xxx",
  "generation_id": "generation_xxx",

  "session_id": "session_xxx",
  "experience_id": "experience_xxx",
  "intent_id": "intent_xxx",

  "state_version": 12,

  "model_profile_id": "profile_xxx",
  "provider_id": "provider_xxx",
  "model_id": "model_xxx",
  "model_version": "version_xxx",

  "routing_policy_version": "routing_v1.0.0",
  "llm_contract_version": "C07-1.0.0",
  "prompt_version": "prompt_v1.0.0",

  "request": {
    "schema_version": "request_v1",
    "input_reference": "ref_xxx"
  },

  "response": {
    "status": "SUCCESS",
    "output_reference": "ref_xxx",
    "finish_reason": "stop"
  },

  "error": {
    "code": null,
    "provider_code": null,
    "message_reference": null
  },

  "validation": {
    "status": "PENDING",
    "validation_id": null
  },

  "runtime": {
    "accepted": false,
    "executed": false
  },

  "performance": {
    "queue_latency_ms": 0,
    "generation_latency_ms": 0,
    "total_latency_ms": 0
  },

  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0
  },

  "created_at": "ISO-8601",
  "completed_at": "ISO-8601"
}
```

---

# 7. LLM Result Classification（模型结果分类）

模型调用结果必须至少区分：

## 7.1 Successful Provider Response

```text
SUCCESS
```

表示 Provider 正常返回。

**不代表产品接受。**

---

## 7.2 Infrastructure Failure（基础设施失败）

```text
TIMEOUT
NETWORK_ERROR
RATE_LIMIT
PROVIDER_ERROR
AUTH_ERROR
SERVICE_UNAVAILABLE
```

---

## 7.3 Output Failure（输出失败）

```text
INVALID_OUTPUT
SCHEMA_ERROR
MALFORMED_OUTPUT
INCOMPLETE_OUTPUT
```

---

## 7.4 Product Validation Failure（产品验证失败）

```text
VALIDATOR_REJECTED
POLICY_REJECTED
STATE_VERSION_CONFLICT
STATE_MACHINE_REJECTED
INTENT_MISMATCH
AGENCY_REJECTED
CONTINUITY_REJECTED
```

---

## 7.5 Runtime Control Result（运行时控制结果）

```text
CANCELLED
STALE_RESULT
INTERRUPTED
```

这些不能简单统计为：

```text
LLM_FAILURE
```

因为它们代表不同的产品事实。

例如：

```text
User → STOP
      ↓
Cancel LLM Generation
      ↓
CANCELLED
```

这是**正确的产品行为**，不是系统故障。

---

# 8. LLM Lifecycle（模型调用生命周期）

```text
REQUESTED
   ↓
ROUTING
   ↓
DISPATCHED
   ↓
GENERATING
   ↓
RECEIVED
   ↓
VALIDATING
   ↓
ACCEPTED
```

异常分支：

```text
REQUESTED → FAILED
ROUTING → FAILED
DISPATCHED → TIMEOUT
GENERATING → CANCELLED
RECEIVED → INVALID_OUTPUT
VALIDATING → REJECTED
任何阶段 → STALE_RESULT
```

每次状态变化都必须可追踪。

---

# 9. Cancellation & Stale Result（取消与过期结果）

以下事件必须触发取消或失效机制：

```text
STOP
CHANGE_DIRECTION
Intent Change
Session End
Experience Replacement
State Version Invalidated
```

旧 Generation 即使最终返回：

> 也不能进入 Runtime。

必须记录：

```text
generation_id
original_state_version
current_state_version
stale_reason
rejected_at
```

---

# 10. Retry（重试）

允许重试：

```text
TIMEOUT
NETWORK_ERROR
RATE_LIMIT
临时 PROVIDER_ERROR
```

重试不得改变：

- User Intent
- Experience Goal
- State Version
- Semantic Action
- Policy Decision

重试产生新的：

```text
```

但必须保留：

```text
retry_sequence
```

从而可以还原：

```text
Request #1
   ↓
TIMEOUT
   ↓
Retry #1
   ↓
SUCCESS
```

---

# 11. Fallback（模型降级）

Fallback 属于基础设施行为。

例如：

```text
Model A
 ↓
TIMEOUT
 ↓
Model B
 ↓
Response
 ↓
Validator
```

Model B 的结果仍然必须完整验证。

Fallback 不得：

- 改变 Intent
- 改变 Policy
- 绕过 Validator
- 绕过 State Machine
- 直接写 Runtime State

---

# 12. Provider Adapter（供应商适配层）

Provider Adapter 只能负责：

- Authentication
- Request Translation
- Response Translation
- Streaming Translation
- Tool Protocol Translation
- Provider Error Normalization
- Provider-specific Limits

不得拥有：

- Intent
- Policy
- Experience Selection
- ExperienceState
- Memory Decision
- Agency Decision
- Runtime State

---

# 13. C08｜Validator Contract（验证器契约）

Validator 是：

> **LLM Proposal → Product-Executable Proposal**

之间的唯一验证边界。

所有 LLM Proposal 必须经过 Validator。

验证层：

```text
V1 Schema Validation
↓
V2 Contract Validation
↓
V3 State Validation
↓
V4 Policy Validation
↓
V5 State Machine Validation
↓
V6 Intent Validation
↓
V7 Continuity Validation
↓
V8 Agency Validation
```

---

# 14. Validation Record（验证记录）

每一次 Proposal 验证都必须记录：

```json
{
  "validation_id": "validation_xxx",
  "proposal_id": "proposal_xxx",

  "result": "ACCEPT | REJECT | REVISE | FALLBACK",

  "reason_codes": [],
  "violations": [],

  "state_version": 12,
  "validator_version": "C08-1.0.0",

  "created_at": "ISO-8601"
}
```

必须能够回答：

> 模型返回了什么？

> 为什么接受？

> 为什么拒绝？

> 哪条契约拒绝了？

> 当时 State Version 是多少？

> 最终有没有进入 Runtime？

---

# 15. Validator Result

### ACCEPT

允许进入 Runtime。

### REJECT

存在契约、Policy、State、Agency、Version 等违反。

不得执行。

### REVISE

仅允许修复安全的结构性问题。

不得改变：

- User Intent
- Policy
- State
- Agency boundary

### FALLBACK

模型能力不足或输出不可用，需要重新走合法的模型/能力路径。

Fallback 结果仍必须重新验证。

---

# 16. C09｜Runtime Contract（运行时契约）

Runtime 是：

> **唯一拥有 ExperienceState 实际写权限的产品运行组件。**

完整执行链：

```text
User Action
 ↓
Semantic Action
 ↓
Policy Decision
 ↓
LLM Proposal
 ↓
Validator
 ↓
State Machine
 ↓
Runtime
 ↓
ExperienceState Mutation
 ↓
Event
 ↓
Decision Trace
```

任何组件不得跳过中间层。

---

# 17. Runtime Single Writer（运行时单一写入者）

只有 Runtime 可以修改：

```text
ExperienceState
Session State
Active Experience
Runtime Variables
Completion State
Control State
```

以下组件只能提出请求：

```text
Frontend
LLM
Memory
Policy
Validator
Tool
Analytics
```

---

# 18. Runtime State Mutation（状态变更）

所有状态写入必须携带：

```text
session_id
experience_id
expected_state_version
action_id
decision_id
validation_id
generation_id
```

Runtime：

```text
expected_state_version
        ↓
compare current state_version
        ↓
match
        ↓
perform mutation
        ↓
state_version + 1
```

不匹配：

```text
STATE_VERSION_CONFLICT
```

不得：

- 覆盖新状态
- 自动 Merge
- 执行旧 Action
- 静默丢弃
- 自动重试旧写入

---

# 19. Runtime Acceptance Record（运行时接受记录）

必须区分：

```text
LLM Response
        ↓
Validator Accepted
        ↓
Runtime Accepted
        ↓
Runtime Executed
        ↓
State Mutated
```

因此：

> **LLM 成功 ≠ Validator 成功 ≠ Runtime 成功 ≠ 用户最终看到结果。**

这四个层级必须分别可观测。

---

# 20. Event & Decision Trace（事件与决策轨迹）

一次完整体验必须能够通过 Trace 还原：

```text
USER_INPUT
 ↓
INTENT_INTERPRETED
 ↓
SEMANTIC_ACTION_SELECTED
 ↓
POLICY_DECIDED
 ↓
LLM_REQUESTED
 ↓
MODEL_ROUTED
 ↓
LLM_RESPONSE / LLM_ERROR
 ↓
VALIDATION
 ↓
RUNTIME_EXECUTION
 ↓
STATE_MUTATION
 ↓
USER_VISIBLE_RESULT
```

---

# 21. Trace Correlation（轨迹关联）

所有关键对象必须可以通过 ID 关联：

```text
session_id
intent_id
experience_id
action_id
decision_id
request_id
generation_id
proposal_id
validation_id
state_version
event_id
```

目标：

> **任意一个用户可见结果，都能够向前追溯到它为什么发生；任意一次异常，都能够向后追溯到最终影响。**

---

# 22. Decision Trace 不等于 Analytics

必须严格区分：

### Decision Trace

回答：

> 系统当时做了什么？为什么？

### Analytics

回答：

> 系统长期表现如何？

Analytics 不得反向修改 Runtime。

例如：

```text
Analytics
“用户平均停留时间下降”
```

不能直接触发：

```text
Runtime
“自动增加推荐”
```

必须经过产品 Policy/版本变更流程。

---

# 23. Privacy / Data Boundary（数据边界）

模型调用记录必须尽量采用：

```text
Reference
Metadata
Hash
Structured Trace
```

而不是无条件保存所有原始用户内容。

尤其要区分：

- 可审计元数据
- Prompt Reference
- Model Output Reference
- 用户原始内容
- 敏感数据
- Provider 返回的诊断信息

保存策略由数据治理规范另行定义。

本契约只要求：

> **必须能够完成运行事实的追踪与故障诊断。**

---

# 24. Model Switch Compatibility（模型切换兼容性）

替换模型时：

```text
Model A
 ↓
Model B
```

产品以下部分不得被模型切换改变：

```text
Core Schema
State Machine
Policy
STOP
CHANGE_DIRECTION
Memory Priority
Agency Rules
Runtime Ownership
Validator Boundary
```

模型切换后必须重新执行：

- Golden Suite
- State Integrity
- Policy Compliance
- Validator Tests
- Agency Evaluation
- Latency Evaluation
- Reliability Evaluation

---

# 25. Required Hard Invariants（硬性不变量）

## C07

```text
LLM-01 Provider Agnostic
LLM-02 Model Agnostic
LLM-03 Model Config ≠ Product Logic
LLM-04 Model Router ≠ Product Policy
LLM-05 LLM Output = Proposal
LLM-06 Provider Adapter has no Product State
LLM-07 Model Switch cannot bypass Validator
LLM-08 Model Version is Traceable
LLM-09 Fallback cannot change Intent
LLM-10 Every Call is Recorded
LLM-11 Every Error is Recorded
LLM-12 Cancelled Calls are Recorded
LLM-13 Stale Calls are Recorded
LLM-14 Retry Chain is Traceable
```

## C08

```text
VAL-01 All Proposals Validated
VAL-02 State Version Checked
VAL-03 Policy Checked
VAL-04 State Machine Checked
VAL-05 Agency Checked
VAL-06 No Direct State Mutation
VAL-07 No Intent Invention
VAL-08 Rejected Proposal Cannot Execute
VAL-09 Stale Proposal Cannot Execute
VAL-10 Fallback Proposal Revalidated
VAL-11 Validation Result is Recorded
```

## C09

```text
RUN-01 Runtime is Single Writer
RUN-02 Every Mutation has State Version
RUN-03 Illegal Transition Rejected
RUN-04 Stale Write Rejected
RUN-05 Stale Result Rejected
RUN-06 STOP is Immediate Authority
RUN-07 CHANGE invalidates old Experience
RUN-08 WAIT has no Hidden Continuation
RUN-09 Runtime Execution is Traceable
RUN-10 State Mutation is Traceable
```

---

# 26. Mandatory Failure Cases（必须测试异常）

以下不能只测正常返回：

### LLM

```text
正常返回
空返回
非法 JSON
Schema 不匹配
Provider Timeout
Network Error
Rate Limit
Provider Error
Auth Error
Partial Output
Cancelled
Stale Result
```

### Validator

```text
Policy Reject
State Reject
State Version Conflict
Intent Mismatch
Agency Reject
Continuity Reject
Invalid Proposal
Fallback
```

### Runtime

```text
Illegal Transition
Stale Write
Duplicate Request
Retry
Concurrent Mutation
STOP during generation
CHANGE during generation
Session End during generation
```

---

# 27. Golden Trace Example（黄金轨迹示例）

用户：

> “换一个。”

系统必须能够还原：

```text
USER_INPUT
  ↓
SEMANTIC_ACTION
  CHANGE_DIRECTION
  ↓
POLICY
  CHANGE
  ↓
CURRENT_GENERATION
  CANCELLED
  ↓
OLD_GENERATION
  STALE
  ↓
OLD_RESULT
  REJECTED
  ↓
INTENT / CONTEXT
  RE-EVALUATED
  ↓
MODEL_ROUTING
  MODEL_B
  ↓
LLM_REQUEST
  REQUESTED
  ↓
LLM_RESPONSE
  SUCCESS
  ↓
VALIDATOR
  ACCEPT
  ↓
RUNTIME
  NEW_EXPERIENCE
  ↓
STATE_VERSION
  12 → 13
```

如果 Model B 返回非法结果：

```text
LLM_RESPONSE
  INVALID_OUTPUT
  ↓
VALIDATOR
  REJECT
  ↓
FALLBACK
  ↓
MODEL_C
  ↓
LLM_RESPONSE
  SUCCESS
  ↓
VALIDATOR
  ACCEPT
  ↓
RUNTIME
```

整个链条都必须可追踪。

---

# 28. Acceptance Criteria（验收标准）

C07～C09 正式冻结前，必须证明：

```text
Model Provider Agnostic = PASS
Model Config Externalized = PASS
Provider Adapter Boundary = PASS
Model Routing Boundary = PASS

Every LLM Call Recorded = PASS
Every LLM Error Recorded = PASS
Cancelled Call Recorded = PASS
Stale Result Recorded = PASS
Retry Chain Traceable = PASS
Model Version Traceable = PASS

Validator Boundary = PASS
State Version Validation = PASS
Policy Validation = PASS
State Machine Validation = PASS
Agency Validation = PASS

Runtime Single Writer = PASS
Runtime Mutation Traceable = PASS
Stale Write Rejection = PASS
Illegal Transition Rejection = PASS
STOP = PASS
CHANGE_DIRECTION = PASS
WAIT = PASS
```

硬性阻塞条件：

```text
LLM Direct State Mutation > 0
LLM Policy Bypass > 0
Provider-specific Product Logic > 0
Unrecorded LLM Call > 0
Unrecorded LLM Error > 0
Stale Proposal Execution > 0
Stale State Overwrite > 0
STOP Violation > 0
CHANGE Violation > 0
Unauthorized Continuation > 0
Validator Bypass > 0
Illegal State Transition > 0
```

任意一项 > 0：

> **P3-S1 BLOCKED（阻塞）。**

---

# 29. 当前状态

```text
P0 Product Foundation
    COMPLETE

P1 Product System Definition
    COMPLETE

P2 Product Engineering Contract
    CLOSURE CANDIDATE
    EXIT GATE NOT PASSED

P3 Vertical Slice
    ACTIVE

C01 Session
    FREEZE CANDIDATE

C02 Intent
    FREEZE CANDIDATE

C03 ExperienceState
    FREEZE CANDIDATE

C04 State Machine
    FREEZE CANDIDATE

C05 Semantic Action
    FREEZE CANDIDATE

C06 Policy
    FREEZE CANDIDATE

C07 LLM Gateway
    FREEZE CANDIDATE

C08 Validator
    FREEZE CANDIDATE

C09 Runtime
    FREEZE CANDIDATE
```

以上均为**契约状态**，不代表已经有代码执行证据。

---

# 30. 下一阶段执行顺序

不再继续无限增加概念契约。

下一步进入：

```text
C01～C09
   ↓
Cross-Contract Consistency（跨契约一致性检查）
   ↓
Golden Suite（黄金案例）
   ↓
Engineering Boundary（工程边界）
   ↓
LLM Call / Error Trace Verification
   ↓
Runtime Vertical Slice Implementation
   ↓
Integration Test
   ↓
Independent Evaluation
```

最终目标：

> **不是证明“AI 能回答问题”，而是证明一个可替换模型的 AI 能力，可以在严格的 State、Policy、Validator、Runtime 和 Trace 约束下，稳定地驱动一个真正的生成式体验。**
