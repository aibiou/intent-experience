# P3-S1-C07～C08｜LLM Gateway & Validator Contracts

## 大模型网关与验证器契约

**Document ID：** P3-S1-C07-C08\
**Version：** 1.0.0\
**Status：** FREEZE CANDIDATE（冻结候选）\
**Scope：** P3-S1 Runtime Vertical Slice（运行时首个完整产品切片）\
**Parent：** P3-S1 Runtime Vertical Slice Specification\
**Dependencies：** C01-C06\
**Authority：** C1 Core Schema + C3 Action & Policy Contract + C4 LLM Contract

---

# 一、核心原则

P3-S1 必须遵守：

> **产品不绑定任何单一大模型、模型家族、模型提供商或模型 API。**

LLM 是：

> **Capability Provider（能力提供方）**

而不是：

> **Product Authority（产品决策权威）**

完整链路：

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
Model Selection / Routing
 ↓
Model Provider
 ↓
LLM Proposal
 ↓
Validator
 ↓
Policy / State Machine Re-check
 ↓
Runtime
 ↓
ExperienceState
```

任何具体模型都只能存在于：

```text
Model Configuration
Model Registry
Routing Configuration
Provider Adapter
Evaluation Baseline
```

中。

不得进入：

```text
ExperienceState
Intent Contract
Policy Contract
State Machine
Runtime Core
Frontend
Product API
```

---

# 二、C07｜LLM Gateway Contract（大模型网关契约）

## C07.1 Gateway 定义

LLM Gateway 是产品与外部模型能力之间的唯一标准边界。

业务层只知道：

```text
LLM Gateway
```

业务层不知道：

```text
某个具体模型名称
某个具体供应商
某个供应商 SDK
某个供应商的特殊消息格式
某个供应商的私有参数
```

因此：

> **Provider-specific implementation must terminate at the Gateway Adapter Boundary（提供商特定实现必须终止于网关适配器边界）。**

---

# 三、模型无关性要求

## C07.2 Model Agnosticism（模型无关性）

以下内容不得成为产品核心契约的硬编码依赖：

- Model Provider
- Model Name
- Model Version
- Provider SDK
- Provider-specific API format
- Provider-specific prompt syntax
- Provider-specific tool protocol
- Provider-specific context-window assumptions
- Provider-specific reasoning behavior

例如，业务代码不得出现：

```text
if model == "某具体模型":
    ...
```

也不得出现：

```text
if provider == "某具体提供商":
    change_product_behavior()
```

除非该逻辑属于明确的：

> Provider Adapter（提供商适配器）

或：

> Model Capability Adapter（模型能力适配器）

并且不能改变产品契约。

---

# 四、Model Configuration（模型配置）

模型配置必须外置。

最小结构：

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

具体字段可根据实际实现扩展，但必须满足：

> **Model configuration is data, not business logic（模型配置属于数据，不属于业务逻辑）。**

---

# 五、Model Registry（模型注册表）

系统允许存在多个：

```text
Provider
    ↓
Model
    ↓
Model Version
    ↓
Capability Profile
```

例如：

```text
Provider A
 ├─ Model A1
 └─ Model A2

Provider B
 ├─ Model B1
 └─ Model B2

Provider C
 └─ Model C1
```

以上只是架构示例。

**P3 不允许把任何一个具体模型定义为产品唯一模型。**

---

# 六、Model Capability Profile（模型能力画像）

模型选择不能只依赖名称。

Gateway 应识别模型能力：

```text
Structured Output
Reasoning
Long Context
Tool Calling
Streaming
Multimodal
Latency
Cost
Reliability
Safety Capability
```

业务系统请求：

```text
需要：
- Structured Output
- Natural Language Understanding
- Low Latency
- Streaming
```

而不是：

```text
必须使用 Model X
```

因此：

```text
Capability Requirement
        ↓
Model Routing
        ↓
Eligible Models
        ↓
Selected Model
```

---

# 七、Model Routing（模型路由）

模型选择属于：

> **Infrastructure / Capability Routing（基础设施/能力路由）**

而不是产品 Policy。

必须区分：

### Product Policy

回答：

> 系统现在应该做什么？

### Model Routing

回答：

> 使用哪个可用模型能力来完成已经被允许执行的任务？

因此：

```text
Policy
 ↓
需要生成解释
 ↓
LLM Gateway
 ↓
Capability Requirement
 ↓
Model Routing
 ↓
Model
```

而不是：

```text
Model
 ↓
决定产品应该做什么
```

---

# 八、模型选择输入

Model Router 可以使用：

```text
Task Type
Required Capability
Latency Budget
Reliability Requirement
Context Size
Output Schema
Safety Requirement
Availability
Cost Constraint
Model Version
Experiment Configuration
```

但：

> **Engagement / Session Time / Click Probability 不得直接成为模型选择授权依据。**

尤其不得因为某模型更容易让用户继续停留，就自动选择它。

---

# 九、模型选择必须可追踪

每次 LLM 调用必须记录：

```json
{
  "request_id": "request_xxx",
  "model_profile_id": "profile_xxx",
  "provider_id": "provider_xxx",
  "model_id": "model_xxx",
  "model_version": "version_xxx",
  "routing_policy_version": "routing_v1.0.0",
  "llm_contract_version": "C07-1.0.0"
}
```

因此任何一次用户体验都可以回答：

> 当时到底使用了什么模型、什么版本、什么路由规则？

---

# 十、Model Fallback（模型故障切换）

允许模型故障切换，但必须遵守：

```text
Primary Model
      ↓
Failure
      ↓
Retry / Fallback Policy
      ↓
Alternative Eligible Model
      ↓
Validator
      ↓
Runtime
```

Fallback 不得：

- 绕过 Validator
- 绕过 Policy
- 直接修改 State
- 自动改变用户意图
- 自动改变 Experience Goal
- 把失败隐藏成成功

尤其：

> **Fallback 是基础设施行为，不是产品行为。**

如果模型 A 和模型 B 产生不同的产品语义结果，仍然必须经过同一个：

```text
Validator
Policy
State Machine
Runtime
```

---

# 十一、模型输出必须是 Proposal

LLM 的输出定义为：

> **LLM Proposal（大模型提案）**

而不是：

> Runtime Command（运行时命令）

例如：

```json
{
  "proposal_id": "proposal_xxx",
  "request_id": "request_xxx",
  "semantic_action": {},
  "content": {},
  "experience_candidate": {},
  "uncertainty": {},
  "state_version": 12
}
```

模型可以提出：

```text
回答什么
解释什么
模拟什么
创建什么
下一层体验候选
```

模型不能直接执行：

```text
STOP
CHANGE_STATE
WRITE_MEMORY
WRITE_SESSION
WRITE_EXPERIENCE_STATE
EXECUTE_TOOL
CHANGE_POLICY
```

---

# 十二、Structured Output（结构化输出）

C07 必须优先要求模型输出符合：

```text
Schema
 ↓
Structured Proposal
```

而不是让业务层解析任意自然语言。

如果模型不支持原生 Structured Output：

```text
Provider Adapter
 ↓
Normalization
 ↓
Gateway Schema
```

对上层暴露统一结构。

---

# 十三、模型调用生命周期

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
ACCEPTED / REJECTED
```

异常：

```text
TIMEOUT
PROVIDER_ERROR
RATE_LIMIT
INVALID_OUTPUT
SCHEMA_ERROR
STALE_RESULT
CANCELLED
```

模型调用失败不能直接导致：

```text
ExperienceState Mutation
```

---

# 十四、Cancellation（可取消）

当发生：

```text
STOP
CHANGE_DIRECTION
Intent Change
Session End
```

正在运行的模型请求必须进入：

```text
CANCEL_REQUESTED
```

并且：

```text
Generation Invalidated
```

即使 Provider 仍然返回结果：

```text
Provider Response
 ↓
Stale Check
 ↓
REJECT_STALE_RESULT
```

不得进入 Runtime。

---

# 十五、Retry Boundary（重试边界）

允许重试：

```text
network failure
provider transient failure
timeout
rate limit
```

但必须：

```text
Retry
 ↓
same logical request
 ↓
same state validity check
 ↓
Validator
```

不得通过重试改变：

```text
User Intent
Experience Goal
Policy Decision
State Version
```

如果状态已经变化：

```text
Retry old generation
        ↓
STALE
        ↓
REJECT
```

---

# 十六、C08｜Validator Contract（验证器契约）

Validator 是：

> **LLM Proposal → Product-Executable Proposal**

之间的安全边界。

核心原则：

> **LLM 可以提出任何东西；只有 Validator + Policy + State Machine + Runtime 可以决定什么能够进入产品状态。**

---

# 十七、Validator 检查层

Validator 至少包含：

### V1 Schema Validation（结构验证）

检查：

- schema
- required fields
- type
- enum
- format

### V2 Contract Validation（契约验证）

检查：

- C01-C07
- 当前 Experience Contract
- 当前 LLM Contract

### V3 State Validation（状态验证）

检查：

```text
session_id
experience_id
state_version
generation_id
```

### V4 Policy Validation（策略验证）

检查：

- Policy Action 是否被允许
- 是否违反 STOP
- 是否违反 CHANGE_DIRECTION
- 是否违反 Agency Gate

### V5 State Machine Validation（状态机验证）

检查：

```text
当前 State
    +
Candidate Action
    ↓
是否合法 Transition？
```

### V6 Intent Validation（意图验证）

检查：

> 生成内容是否仍然符合当前 Intent？

尤其防止：

```text
User changed direction
        ↓
old model response
        ↓
Validator
        ↓
REJECT
```

### V7 Continuity Validation（连续性验证）

检查：

- 是否仍属于当前 Experience
- 是否引用过期 Context
- 是否产生非法分支
- 是否偷偷开始下一体验

### V8 Agency Validation（用户自主性验证）

检查：

- 是否强迫继续
- 是否隐藏退出
- 是否未经允许扩大任务
- 是否通过模型输出制造自动 continuation
- 是否把 engagement 当成授权

---

# 十八、Validator 输出

Validator 不应该简单返回：

```text
true / false
```

而应产生：

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

---

# 十九、REJECT / REVISE / FALLBACK

### REJECT

提案违反：

- Contract
- Policy
- State Machine
- Agency
- State Version
- Schema

则直接拒绝。

### REVISE

如果只是：

```text
格式问题
缺失非关键字段
可安全修复的结构问题
```

可以进入受控修正。

但：

> **REVISE 不允许改变用户 Intent。**

### FALLBACK

如果模型能力不足：

```text
Model A
 ↓
Validator
 ↓
Capability Failure
 ↓
Fallback Model
 ↓
Validator
```

Fallback 后仍必须重新验证。

---

# 二十、Validator 不得替模型“脑补”

一个重要边界：

Validator 可以：

```text
Reject
Normalize
Validate
Route
Request Safe Revision
```

但不应该：

```text
替模型创造事实
替用户创造 Intent
替 Policy 做产品决策
替 Runtime 修改 State
```

否则 Validator 会逐渐变成第二个隐形产品大脑。

---

# 二十一、模型供应商适配层

架构必须保持：

```text
                    ┌─ Provider Adapter A
                    │
LLM Gateway ─ Router ├─ Provider Adapter B
                    │
                    ├─ Provider Adapter C
                    │
                    └─ Local / Self-hosted Adapter
```

Adapter 负责：

```text
Authentication
Request Translation
Response Translation
Streaming Translation
Tool Protocol Translation
Error Normalization
Provider-specific Limits
```

Adapter 不负责：

```text
Intent
Policy
State
Memory
Experience Selection
Agency
```

---

# 二十二、Provider Lock-in 禁止项

P3-S1 明确禁止：

```text
Frontend → Provider API
Frontend → Model API

Runtime → Provider SDK

Policy → Model-specific logic

ExperienceState → Provider-specific fields

Intent → Model-specific semantics

Analytics → hard-coded provider assumptions

Tests → only one provider/model
```

特别禁止：

> “为了快速开发，先把某一个模型写死，以后再抽象。”

这属于架构债务，P3-S1 不接受。

---

# 二十三、Model Evaluation（模型评测）

模型可以更换，但必须经过同一套：

```text
Golden Suite
Scenario Matrix
Contract Tests
Agency Tests
State Integrity Tests
Latency Tests
Reliability Tests
```

因此：

```text
Model A
 ↓
Evaluation
 ↓
Eligible

Model B
 ↓
Evaluation
 ↓
Eligible
```

而不是：

```text
换模型
 ↓
重新定义产品行为
```

---

# 二十四、模型版本升级

Model Upgrade：

```text
Model A v1
 ↓
Model A v2
```

必须视为：

> **可影响产品行为的依赖变化。**

至少重新执行：

```text
Golden Suite
Critical State Tests
Policy Compliance
Validator Tests
Agency Tests
Latency / Reliability
```

如果出现：

```text
Intent Interpretation Regression
Policy-sensitive Regression
State Integrity Regression
Agency Regression
```

不得直接切换生产流量。

---

# 二十五、A/B 与实验边界

允许：

```text
Model A ↔ Model B
```

进行受控实验。

但实验不得改变：

```text
Core Schema
State Machine
Policy
STOP
CHANGE_DIRECTION
Memory Priority
Agency Rules
```

实验只能改变：

```text
Capability Provider
Routing Configuration
Prompt Version
Model Version
Generation Parameters
```

并必须：

```text
Experiment Assignment
+
Model Version
+
Prompt Version
+
Contract Version
```

全部进入 Decision Trace。

---

# 二十六、C07/C08 核心不变量

### C07

**LLM-01**\
产品不绑定单一模型。

**LLM-02**\
产品不绑定单一 Provider。

**LLM-03**\
Model Configuration ≠ Product Logic。

**LLM-04**\
Model Router ≠ Product Policy。

**LLM-05**\
LLM Output = Proposal。

**LLM-06**\
Provider Adapter 不得拥有产品状态。

**LLM-07**\
模型切换不能绕过 Validator。

**LLM-08**\
模型升级必须可评测、可追踪、可回滚。

**LLM-09**\
Fallback 不得改变用户意图。

**LLM-10**\
模型请求必须支持取消与 Stale Result Rejection。

### C08

**VAL-01**\
所有 LLM Proposal 必须经过 Validator。

**VAL-02**\
Validator 必须检查 State Version。

**VAL-03**\
Validator 必须检查 Policy。

**VAL-04**\
Validator 必须检查 State Machine。

**VAL-05**\
Validator 必须检查 Agency。

**VAL-06**\
Validator 不得直接修改 Runtime State。

**VAL-07**\
Validator 不得替用户创造 Intent。

**VAL-08**\
Rejected Proposal 不得进入 Runtime。

**VAL-09**\
Stale Proposal 不得进入 Runtime。

**VAL-10**\
Fallback Proposal 必须重新 Validation。

---

# 二十七、C07/C08 必测案例

### LLM-01

更换模型后：

```text
Experience Contract 不变
Policy 不变
State Machine 不变
Runtime Contract 不变
```

### LLM-02

更换 Provider：

```text
Provider Adapter 改变
Product Behavior Contract 不改变
```

### LLM-03

模型返回非法 Schema：

```text
LLM
 ↓
Validator
 ↓
REJECT
 ↓
Runtime 不变
```

### LLM-04

模型返回旧 State Version：

```text
Validator
 ↓
STALE
 ↓
REJECT
```

### LLM-05

STOP 后模型仍返回内容：

```text
Response
 ↓
Stale Check
 ↓
REJECT
 ↓
不得进入 UI / Runtime
```

### LLM-06

CHANGE_DIRECTION 后旧模型完成：

```text
Old Generation
 ↓
REJECT_STALE_RESULT
```

### LLM-07

模型自行提出：

```text
"继续下一个体验"
```

但用户没有继续：

```text
Policy
 ↓
WAIT
```

不得自动执行。

### LLM-08

模型提出未经授权的 Memory Write：

```text
Validator
 ↓
REJECT
```

### LLM-09

模型提出 Tool Execution：

```text
Policy
 ↓
Tool Authorization
 ↓
State Machine
 ↓
Runtime
```

模型不能直接调用。

### LLM-10

主模型故障：

```text
Model A
 ↓
Timeout
 ↓
Fallback
 ↓
Model B
 ↓
Validator
 ↓
Runtime
```

全过程可追踪。

---

# 二十八、C07/C08 Acceptance Gate（验收门）

C07/C08 只有在以下全部满足时才能正式冻结：

```text
Model Provider Agnostic          PASS
Model Config Externalized        PASS
Provider Adapter Boundary        PASS
Model Routing Boundary           PASS
LLM Proposal Boundary            PASS
Structured Output                PASS
Cancellation                     PASS
Retry Boundary                   PASS
Fallback                         PASS
State Version Validation         PASS
Policy Validation                PASS
State Machine Validation         PASS
Agency Validation                PASS
Stale Result Rejection           PASS
Decision Trace                   PASS
Model Version Traceability       PASS
Golden Suite Compatibility       PASS
```

硬阻断项：

```text
LLM Direct State Mutation       = 0
LLM Policy Bypass               = 0
Provider-specific Product Logic = 0
Stale Proposal Execution        = 0
STOP Violation                  = 0
CHANGE Violation                = 0
Unauthorized Continuation       = 0
Validator Bypass                = 0
```

任意一项 > 0：

> **P3-S1 BLOCKED**

---

# 二十九、正式冻结后的模型架构

最终目标：

```text
                 PRODUCT
                    │
                    ▼
              LLM Gateway
                    │
            ┌───────┴────────┐
            ▼                ▼
      Model Router      Capability Profile
            │
      ┌─────┼─────┬──────────┐
      ▼     ▼     ▼          ▼
    Model  Model  Model    Local Model
      A     B      C
      │     │      │
      └─────┴──────┴──────────┘
                    │
                    ▼
               LLM Proposal
                    │
                    ▼
                Validator
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       Policy   StateMachine  Agency
          │         │         │
          └─────────┼─────────┘
                    ▼
                 Runtime
                    │
                    ▼
             ExperienceState
```

这个结构的关键不是“以后可以接很多模型”。

真正关键的是：

> **模型可以变化，产品不应该因此失去确定性。**

---

# 三十、P3-S1 当前依赖链更新

```text
C01 Session
   ↓
C02 Intent
   ↓
C03 ExperienceState
   ↓
C04 State Machine
   ↓
C05 Semantic Action
   ↓
C06 Policy
   ↓
C07 LLM Gateway
   ↓
C08 Validator
   ↓
C09 Runtime
```

其中：

```text
C01-C04 = State Foundation
C05-C06 = Decision Foundation
C07-C08 = AI Execution Boundary
C09     = Product Runtime
```

因此 C07/C08 不是普通的“调用 AI”模块。

它们是：

> **AI 与产品确定性系统之间的防火墙。**

---

# 三十一、Freeze Status（冻结状态）

当前：

```text
C01  FREEZE CANDIDATE
C02  FREEZE CANDIDATE
C03  FREEZE CANDIDATE
C04  FREEZE CANDIDATE
C05  FREEZE CANDIDATE
C06  FREEZE CANDIDATE
C07  FREEZE CANDIDATE
C08  FREEZE CANDIDATE
C09  NEXT
```

仍然不能宣布正式冻结。

正式 Freeze 仍需：

```text
Cross-Contract Consistency
        ↓
Golden Suite
        ↓
Engineering Boundary
        ↓
Independent Evaluation
        ↓
Owner Approval
```

---

# 三十二、下一步

下一份契约不继续扩展模型能力，而是进入：

> **C09｜Runtime Contract（运行时契约）**

C09 将把前面所有东西真正闭合：

```text
User Action
 ↓
Semantic Action
 ↓
Policy
 ↓
LLM Gateway
 ↓
Validator
 ↓
State Machine
 ↓
Runtime
 ↓
ExperienceState
 ↓
Event
 ↓
Decision Trace
```

届时我们才能形成第一个真正可实现的：

> **Runtime Vertical Slice（运行时首个完整产品切片）**
