# 16｜API Contract V1（接口契约 V1）

**Phase:** P2｜Product Engineering Contract（产品工程契约）\
**Status:** Freeze Candidate\
**Version:** `api_v1.0.0`

---

## 1. Contract Purpose（契约目的）

API Contract V1 的目标是将已经冻结的：

- Core Schema Specification V1（核心数据结构规范 V1）
- State Machine Specification V1（状态机规范 V1）
- Action & Policy Contract V1（动作与策略契约 V1）
- LLM Contract V1（大模型调用契约 V1）

连接为一个可以被工程实现、测试和审计的产品系统边界。

API Contract 不定义新的产品行为。

它只回答：

> **谁可以调用什么、以什么输入调用、得到什么输出、谁拥有状态写入权，以及发生错误时系统必须如何处理。**

---

# 2. API Core Principles（接口核心原则）

### 2.1 API 是产品系统边界

API 不是：

> Frontend → LLM

而是：

```text
Frontend
   ↓
Product API
   ↓
Runtime / Policy / Capability
   ↓
LLM Gateway / Tool
```

Frontend 不直接调用 LLM。

Frontend 不直接修改 ExperienceState。

Frontend 不直接写 Memory。

Frontend 不直接决定 Policy。

---

### 2.2 Runtime 是 ExperienceState 的唯一写入者

```text
LLM
  ↓ proposal

Validator
  ↓ validated proposal

Policy
  ↓ authorized action

State Machine
  ↓ legal transition

Runtime
  ↓

ExperienceState
```

任何 API 都不得绕过该链路。

---

### 2.3 Query 与 Command 必须分离

**Query（查询）**：

> 读取已经存在的系统状态。

**Command（命令）**：

> 请求系统执行一个可能改变状态的动作。

例如：

```http
GET /experience/{experience_id}/state
```

是 Query。

而：

```http
POST /experience/{experience_id}/event
```

是 Command。

不能通过 GET 隐式改变状态。

---

### 2.4 API 不承担产品决策

API 层负责：

- 参数验证
- 身份与权限边界
- 请求路由
- 并发控制
- 幂等
- 调用正确的内部模块
- 返回标准化结果

API 层不负责：

- 判断用户真正想要什么
- 判断下一体验是什么
- 决定是否继续
- 决定是否记忆
- 决定是否为了 Engagement 延长体验

这些属于产品系统内部的 Intent / Policy / Runtime / Memory Policy。

---

# 3. Service Ownership（服务所有权）

V1 不建立大量微服务。

采用**逻辑模块边界 + API 边界**，而不是为了“架构完整”制造几十个服务。

| 模块                     | 所有权                                     |
| ---------------------- | --------------------------------------- |
| Input Layer            | 输入标准化                                   |
| Intent Engine          | Intent 解释与生命周期                          |
| Experience Runtime     | 当前体验运行状态                                |
| Policy Engine          | Action 决策                               |
| State Machine          | 合法状态转换                                  |
| LLM Gateway            | 模型能力调用                                  |
| Capability Layer       | Answer / Simulate / Search / Create 等能力 |
| Memory Policy          | Memory 生命周期                             |
| Next Experience Engine | Candidate 生成/选择                         |
| Analytics              | Event ingestion                         |
| Decision Trace         | 决策审计                                    |

核心原则：

> **一个对象只能存在一个权威 Owner。**

---

# 4. API Resource Model（API 资源模型）

V1 核心资源：

```text
Session
Intent
Experience
ExperienceState
UserAction
PolicyDecision
CapabilityRequest
Creation
MemoryCandidate
Memory
ExperienceCandidate
Event
DecisionTrace
```

其中：

### Session

代表一次用户连续使用上下文。

### Intent

代表当前用户意图。

### Experience

代表一个体验实例。

### ExperienceState

代表当前体验的运行状态。

### UserAction

代表用户产生的语义动作。

### PolicyDecision

代表系统允许执行的动作。

### CapabilityRequest

代表向 LLM / Search / Simulation / Creation 等能力层提出的请求。

### MemoryCandidate

代表待评估的潜在记忆。

### Memory

代表经过 Memory Policy 接受后的持久记忆。

### ExperienceCandidate

代表一个潜在的下一体验。

### Event

代表分析系统记录的事实事件。

### DecisionTrace

代表系统为什么做出某个决策的可审计记录。

---

# 5. Standard Request Envelope（标准请求信封）

所有 Command API V1 采用统一请求元数据。

```json
{
  "request_id": "req_xxx",
  "session_id": "session_xxx",
  "client_request_id": "client_req_xxx",
  "timestamp": "ISO-8601",
  "api_version": "v1",
  "payload": {}
}
```

### request_id

服务端生成或接受可信调用链 ID。

用于：

- tracing
- debugging
- correlation

### client_request_id

客户端生成的幂等标识。

用于：

> 同一个用户动作因为网络重试而被重复提交时，不应执行两次。

---

# 6. Standard Response Envelope（标准响应信封）

成功：

```json
{
  "request_id": "req_xxx",
  "status": "ok",
  "data": {},
  "meta": {
    "api_version": "v1"
  }
}
```

失败：

```json
{
  "request_id": "req_xxx",
  "status": "error",
  "error": {
    "code": "STATE_VERSION_CONFLICT",
    "message": "State version is stale.",
    "retryable": false,
    "details": {}
  }
}
```

API 不返回未经结构化定义的控制文本。

---

# 7. State Version（状态版本）

所有 ExperienceState 都必须拥有：

```json
{
  "state_version": 12
}
```

任何修改 ExperienceState 的 Command 必须携带：

```json
{
  "state_version": 12
}
```

Runtime 只接受：

```text
request.state_version
=
current.state_version
```

否则：

```text
STATE_VERSION_CONFLICT
```

处理：

```text
Client
 ↓
stale command
 ↓
Runtime rejects
 ↓
return current state/version
 ↓
Client re-sync
```

禁止：

> 后写请求覆盖先写状态。

---

# 8. Idempotency（幂等）

以下 Command 必须支持幂等：

- Intent resolve
- Experience start
- Experience event
- Creation modify
- Memory evaluation
- Event ingestion
- Decision trace ingestion

使用：

```text
client_request_id
```

作为幂等键。

同一：

```text
session_id
+
client_request_id
```

不得产生两个不同的状态改变。

---

# 9. Concurrency（并发）

同一个 Experience：

> 同一时刻只允许一个 authoritative state transition。

例如：

```text
User A:
“换一个”

同时

User B/system:
自动 continuation
```

后者不得绕过当前状态。

V1 原则：

> **User control command 优先于后台生成。**

当：

```text
CHANGE_DIRECTION
STOP
```

发生时：

1. cancel current generation
2. cancel pending action
3. reject stale result
4. process new command

---

# 10. Intent API（意图接口）

## 10.1 Resolve Intent

```http
POST /intent/resolve
```

用途：

> 将自然语言输入转换为 Intent Proposal / Semantic Action。

Request：

```json
{
  "request_id": "req_xxx",
  "session_id": "session_xxx",
  "payload": {
    "user_input": "我想做一个小游戏",
    "session_context": {},
    "recent_context": {}
  }
}
```

Response：

```json
{
  "intent": {},
  "semantic_action": "CREATE",
  "confidence": 0.96,
  "action": "start_experience",
  "clarification": null
}
```

重要：

`/intent/resolve` 不直接修改 ExperienceState。

它只产生解释结果。

最终状态转换仍由 Runtime / State Machine 执行。

---

# 11. Experience API（体验接口）

## 11.1 Start Experience

```http
POST /experience/start
```

职责：

> 创建并启动一个 Experience Instance。

输入：

```json
{
  "session_id": "session_xxx",
  "intent_id": "intent_xxx",
  "candidate_id": "candidate_xxx"
}
```

输出：

```json
{
  "experience_id": "experience_xxx",
  "experience_version": "1.0.0",
  "state_version": 1,
  "state": {}
}
```

不得由 Frontend 自己创建 ExperienceState。

---

## 11.2 Get Experience State

```http
GET /experience/{experience_id}/state
```

这是 Query。

返回：

```json
{
  "experience_id": "experience_xxx",
  "state_version": 12,
  "state": {}
}
```

不得改变任何状态。

---

## 11.3 Submit Experience Event

```http
POST /experience/{experience_id}/event
```

这是核心 Runtime Command。

Request：

```json
{
  "session_id": "session_xxx",
  "state_version": 12,
  "event": {
    "type": "user_action",
    "semantic_action": "WHAT_IF",
    "raw_input": "如果摩擦力不是0呢？",
    "source": "text"
  }
}
```

Runtime 执行：

```text
Event
↓
Semantic validation
↓
Policy
↓
State Machine
↓
Capability
↓
State Update
```

Response：

```json
{
  "accepted": true,
  "policy_decision": {},
  "state_version": 13,
  "state": {},
  "response": {}
}
```

---

# 12. Policy API（策略接口）

## 12.1 Decide Action

```http
POST /policy/decide
```

职责：

> 根据 Semantic Action + Context 决定允许执行的 Policy Action。

Request：

```json
{
  "session_id": "session_xxx",
  "experience_id": "experience_xxx",
  "state_version": 12,
  "semantic_action": "WHAT_IF",
  "context": {}
}
```

Response：

```json
{
  "decision_id": "decision_xxx",
  "policy_version": "policy_v1.0.0",
  "selected_action": "SIMULATE",
  "state_transition": {
    "from": "UNDERSTANDING",
    "event": "WHAT_IF",
    "to": "SIMULATION"
  },
  "confidence": 0.95
}
```

注意：

Policy API 可以被 Runtime 调用。

Frontend 不应直接依赖 Policy API 来决定 UI 行为。

---

# 13. Capability API（能力接口）

Capability API 是**执行能力层**，不是产品策略层。

---

## 13.1 Answer

```http
POST /capability/answer
```

用于：

- ANSWER
- EXPLAIN
- SIMPLIFY
- DEEPEN
- REFRAME

必须由 Policy Decision 授权后调用。

---

## 13.2 Simulate

```http
POST /capability/simulate
```

用于：

> WHAT_IF → SIMULATE

输入必须包含：

```text
experience context
simulation variables
constraints
state version
```

Simulation 结果不得自行修改 ExperienceState。

---

## 13.3 Search

```http
POST /capability/search
```

Search 是能力。

不是体验。

不是策略。

不是自动推荐。

Search 请求必须具有：

```text
reason
authorization
query
freshness requirement
```

例如：

```json
{
  "reason": "verification_requested",
  "query": "...",
  "freshness_required": true
}
```

---

# 14. Creation API（创造接口）

Creation 是 Experience Runtime 的分支。

---

## 14.1 Create

```http
POST /capability/create
```

输入：

```json
{
  "experience_id": "experience_xxx",
  "state_version": 18,
  "context": {},
  "creation_goal": "做成一个小游戏"
}
```

必须继承当前 Experience Context。

不得要求用户重新描述已经存在于 ExperienceState 中的信息。

---

## 14.2 Modify

```http
POST /capability/modify
```

修改优先采用 Patch：

```json
{
  "operation": "modify",
  "target": "exit.position",
  "change": {
    "distance": "+30%"
  }
}
```

禁止默认完整重生成。

禁止自动扩大项目范围。

---

# 15. Memory API（记忆接口）

Memory API 是高权限边界。

Frontend 与 LLM 均不能直接写长期 Memory。

---

## 15.1 Create Memory Candidate

```http
POST /memory/candidate
```

输出：

```json
{
  "candidate_id": "memory_candidate_xxx",
  "value": "...",
  "type": "preference",
  "source": "inferred",
  "confidence": 0.68
}
```

这不是 Memory Write。

---

## 15.2 Evaluate Memory

```http
POST /memory/evaluate
```

由 Memory Policy 决定：

```text
accept
reject
defer
expire
```

---

## 15.3 Relevant Memory Query

```http
GET /memory/relevant
```

返回：

> 当前上下文相关的 Memory。

Memory 返回结果只是 Context。

不得直接覆盖 Current Intent。

---

# 16. Next Experience API（下一体验接口）

Next Best Experience Engine 不暴露成传统推荐 API。

---

## 16.1 Generate Candidates

```http
POST /experience/candidates
```

生成：

```text
ExperienceCandidate[]
```

Candidate 包含：

- intent_fit
- state_fit
- context_fit
- novelty
- interaction_cost
- agency_risk
- repetition_risk

---

## 16.2 Select Candidate

```http
POST /experience/candidates/select
```

选择必须经过：

```text
Candidate
↓
Policy
↓
Agency Gate
↓
Selection
```

禁止：

```text
LLM → Candidate → User
```

---

# 17. Event API（事件接口）

```http
POST /events
```

用途：

> Analytics ingestion。

事件必须被视为事实记录，而不是 Runtime Command。

例如：

```json
{
  "event_id": "evt_xxx",
  "event_type": "experience_started",
  "session_id": "session_xxx",
  "experience_id": "experience_xxx",
  "timestamp": "ISO-8601",
  "properties": {}
}
```

Analytics Event 不得反向直接修改产品状态。

---

# 18. Decision Trace API（决策追踪接口）

```http
POST /decision-traces
```

记录：

```text
Input
↓
Semantic Action
↓
State Before
↓
Policy Version
↓
Policy Decision
↓
Capability
↓
State After
↓
User Override
```

必须能够回答：

> “这个动作到底是模型决定的，还是产品策略决定的？”

---

# 19. LLM Gateway API（大模型网关接口）

Frontend 永远不能：

```text
Frontend → OpenAI/LLM
```

必须：

```text
Product Module
↓
LLM Gateway
↓
Model Provider
```

LLM Gateway Request：

```json
{
  "request_id": "req_xxx",
  "task_type": "semantic_classification",
  "model_contract_version": "llm_v1.0.0",
  "prompt_version": "prompt_xxx",
  "state_version": 12,
  "input": {},
  "context": {},
  "constraints": {}
}
```

LLM Gateway 返回：

```json
{
  "model": "...",
  "model_version": "...",
  "contract_version": "llm_v1.0.0",
  "output": {},
  "confidence": {},
  "latency_ms": 320
}
```

LLM Gateway 不拥有：

- Product State
- Policy
- Memory
- Authorization

---

# 20. Tool Boundary（工具边界）

LLM 不得直接执行任意工具。

必须：

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

因此：

> Tool API 是 Capability Boundary，不是 LLM 权限扩张机制。

---

# 21. Authentication & Authorization（身份与权限）

V1 只冻结边界，不过度设计身份系统。

必须区分：

```text
User Identity
Session Identity
Service Identity
Request Identity
```

权限原则：

### User

可以：

- 创建 Intent
- 控制 Experience
- STOP
- CHANGE
- CREATE
- MODIFY

### Frontend

只能代表 User 发起合法 API 请求。

### Runtime

拥有 ExperienceState 写入权限。

### Policy

拥有 Policy Decision 权限。

### Memory Policy

拥有 Memory 接受/拒绝权限。

### LLM

没有上述系统权限。

---

# 22. Error Model（错误模型）

V1 标准错误码：

```text
INVALID_REQUEST
UNAUTHORIZED
FORBIDDEN
RESOURCE_NOT_FOUND

STATE_VERSION_CONFLICT
INVALID_STATE_TRANSITION
INVALID_ACTION
POLICY_REJECTED

LLM_TIMEOUT
LLM_SCHEMA_INVALID
LLM_UNAVAILABLE

TOOL_TIMEOUT
TOOL_FAILED
TOOL_UNAUTHORIZED

MEMORY_POLICY_REJECTED

IDEMPOTENCY_CONFLICT
REQUEST_DUPLICATE

INTERNAL_ERROR
```

错误必须明确：

```json
{
  "code": "INVALID_STATE_TRANSITION",
  "message": "Transition is not allowed.",
  "retryable": false
}
```

禁止向 Frontend 返回模型内部原始错误作为产品行为。

---

# 23. Retry Contract（重试契约）

原则：

> Retry 是工程恢复机制，不是产品行为。

V1：

| 情况                 | Retry                   |
| ------------------ | ----------------------- |
| Network timeout    | bounded                 |
| LLM timeout        | max 1                   |
| LLM schema failure | max 1 constrained retry |
| Tool failure       | max 1                   |
| State conflict     | no blind retry          |
| Policy rejection   | no automatic retry      |
| User STOP          | never retry             |
| User CHANGE        | cancel old operation    |

禁止：

```text
失败
↓
无限重试
↓
用户等待
```

---

# 24. Timeout Contract（超时）

每类请求必须有明确 timeout。

核心原则：

```text
Timeout
↓
Fallback
↓
Preserve State
↓
User remains in control
```

不能因为后台任务超时：

- 阻塞 STOP
- 阻塞 CHANGE
- 阻塞新的 User Input
- 自动重新开始体验

---

# 25. Ordering（事件顺序）

同一 Experience 内：

```text
event_101
event_102
event_103
```

必须保持逻辑顺序。

如果：

```text
event_102
```

依赖：

```text
state_version = 12
```

但系统当前已经：

```text
state_version = 13
```

则拒绝：

```text
STATE_VERSION_CONFLICT
```

不得尝试猜测用户想要什么。

---

# 26. Versioning（版本管理）

API：

```text
/api/v1/
```

产品对象独立版本：

```text
policy_v1.0.0
llm_v1.0.0
experience_v1.0.0
```

API MAJOR 变化包括：

- 删除字段
- 改变字段语义
- 改变状态转换契约
- 改变权限边界
- 改变错误语义
- 改变幂等语义

Behavior-changing API changes 必须：

```text
Change ID
Reason
Owner
Version
Tests
Acceptance
```

禁止 silent change。

---

# 27. Pagination（分页）

V1 不默认所有接口分页。

只有可能产生大量资源的 Query 才允许分页，例如：

```text
GET /memory/relevant
GET /decision-traces
GET /events
```

Runtime State、Intent、当前 Experience 不需要分页。

原则：

> 不为“未来可能需要”增加 API 复杂度。

---

# 28. Observability（可观测性）

每个重要请求至少可关联：

```text
request_id
session_id
experience_id
state_version
policy_version
llm_contract_version
prompt_version
decision_id
latency
result
error_code
```

核心链路：

```text
User Event
↓
API Request
↓
LLM Trace
↓
Policy Decision
↓
State Transition
↓
Capability Execution
↓
API Response
```

这条链必须可追踪。

---

# 29. Data Minimization（数据最小化）

API 不应默认传递完整：

- 历史聊天
- 长期 Memory
- 用户所有行为
- 无关 Session

Context 必须按需要组装：

```text
Current Turn
↓
Experience State
↓
Current Intent
↓
Current State
↓
Relevant Session Context
↓
Relevant Memory
```

原则：

> **相关性优先，而不是信息量优先。**

---

# 30. API Golden Cases（接口黄金案例）

### Case 01 — Direct Answer

```text
User:
直接告诉我。
```

调用：

```text
POST /experience/{id}/event
```

结果：

```text
DIRECT_ANSWER
→ Policy: ANSWER
→ Capability: answer
```

不得继续制造体验。

---

### Case 02 — What If

```text
如果摩擦力不是0呢？
```

结果：

```text
WHAT_IF
→ SIMULATE
→ UNDERSTANDING → SIMULATION
```

---

### Case 03 — Change

```text
换一个。
```

系统必须：

```text
cancel generation
cancel current action
register CHANGE_DIRECTION
reject current candidate
select new candidate
```

---

### Case 04 — Stop

```text
好了。
```

必须：

```text
STOP
→ Experience completed
→ no next experience
→ no background continuation
```

---

### Case 05 — Stale Write

客户端发送：

```text
state_version = 12
```

但 Runtime 已经：

```text
state_version = 13
```

必须：

```text
STATE_VERSION_CONFLICT
```

不得覆盖。

---

### Case 06 — Duplicate Request

同一：

```text
session_id
+
client_request_id
```

重复发送。

必须：

```text
return previous result
```

不得重复执行状态改变。

---

### Case 07 — Memory Bypass

Frontend 尝试：

```http
POST /memory
```

直接写长期偏好。

必须拒绝。

合法路径：

```text
memory candidate
↓
Memory Policy
↓
accepted memory
```

---

### Case 08 — LLM Bypass

Frontend 尝试直接调用模型。

必须不存在产品级公开路径：

```text
Frontend → LLM
```

所有模型请求必须经过 LLM Gateway。

---

# 31. API Acceptance Tests（接口验收测试）

V1 必须通过：

### Boundary

- [ ] Frontend cannot call LLM directly
- [ ] Frontend cannot mutate ExperienceState
- [ ] Frontend cannot write Memory
- [ ] LLM cannot mutate Product State
- [ ] LLM cannot execute arbitrary Tool
- [ ] Policy remains authoritative

### State

- [ ] Every state mutation validates state_version
- [ ] stale writes are rejected
- [ ] illegal transitions are rejected
- [ ] STOP interrupts active generation
- [ ] CHANGE interrupts active generation

### Idempotency

- [ ] duplicate commands do not duplicate state transitions
- [ ] duplicate analytics events are safely handled
- [ ] creation modification is idempotent where applicable

### Policy

- [ ] Policy decision is traceable
- [ ] Policy rejection cannot be bypassed
- [ ] LLM output cannot become Policy Action directly

### Memory

- [ ] memory candidate ≠ memory
- [ ] Memory Policy owns acceptance
- [ ] current Intent overrides Memory

### Capability

- [ ] capability cannot bypass authorization
- [ ] tool failure preserves valid state
- [ ] search cannot become automatic product behavior

### Observability

- [ ] request trace exists
- [ ] state transition trace exists
- [ ] policy trace exists
- [ ] LLM trace exists
- [ ] versions are recorded

---

# 32. API Definition of Done（完成标准）

API Contract V1 只有在以下条件全部满足后才允许进入实现：

```text
[ ] API boundary defined
[ ] Service ownership defined
[ ] Resource model defined
[ ] Request envelope defined
[ ] Response envelope defined
[ ] Query / Command separation defined
[ ] Authentication boundary defined
[ ] Authorization boundary defined
[ ] Idempotency defined
[ ] Request ID / Correlation defined
[ ] State version defined
[ ] Stale write protection defined
[ ] Concurrency rules defined
[ ] Ordering defined
[ ] Intent API defined
[ ] Experience API defined
[ ] Runtime Event API defined
[ ] Policy API defined
[ ] Capability API defined
[ ] Creation API defined
[ ] Memory API defined
[ ] Next Experience API defined
[ ] Event API defined
[ ] Decision Trace API defined
[ ] LLM Gateway defined
[ ] Tool boundary defined
[ ] Error model defined
[ ] Retry rules defined
[ ] Timeout rules defined
[ ] Versioning defined
[ ] Observability defined
[ ] Data minimization defined
[ ] Golden API cases passed
[ ] Acceptance tests defined
[ ] No direct LLM access from frontend
[ ] No state bypass
[ ] No memory bypass
[ ] No policy bypass
[ ] Version assigned
```

---

# 33. Final Contract Principle（最终契约原则）

整个 API 层最终必须保持以下结构：

```text
                         USER
                           ↓
                      FRONTEND
                           ↓
                      PRODUCT API
                           ↓
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
   Intent Engine       Experience         Query APIs
                           Runtime
                             ↓
                       Policy Engine
                             ↓
                       State Machine
                             ↓
                    ┌────────┴────────┐
                    ↓                 ↓
              LLM Gateway       Capability Layer
                    ↓                 ↓
                 Models          Search / Tools
                    └────────┬────────┘
                             ↓
                          Validator
                             ↓
                       State Update
                             ↓
                      ExperienceState
```

系统中最重要的权限关系保持不变：

```text
LLM 可以理解
LLM 可以生成
LLM 可以建议

Policy 可以决定
State Machine 可以授权合法转换
Runtime 可以写当前状态
Memory Policy 可以决定记忆

用户可以改变方向
用户可以停止
用户拥有最终体验控制权
```

因此 API 层的核心职责不是“让所有模块互相调用”，而是：

> **让每一次调用都必须经过正确的产品边界。**

**API Contract V1 冻结候选。**
