# P3-S1-CC02｜C01～C09 Cross-Contract Consistency Matrix（跨契约一致性矩阵）

**Document ID**：P3-S1-CC02\
**Version**：1.0.0\
**Status**：FREEZE CANDIDATE（冻结候选）\
**Scope**：P3-S1 Runtime Vertical Slice（运行时首个完整产品切片）\
**Dependencies**：C01～C09、P3-S1-CC01\
**Authority**：C1 Core Schema + C2 State Machine + C3 Action & Policy + C4 LLM + C7 Evaluation

---

## 1. Purpose｜目的

本矩阵用于验证：

> **任意两个或多个契约单独看都正确，并不代表组合后仍然正确。**

因此，P3-S1 不允许仅以单元测试分别证明 C01～C09。

必须证明：

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

在真实执行链中不会产生：

- 状态冲突
- 权限越级
- 非法状态转换
- 旧结果污染新状态
- LLM 越权
- Policy 越权
- Validator 与 Runtime 不一致
- STOP / CHANGE_DIRECTION 被后续链路覆盖
- Memory 越过 Intent / Policy 边界
- Analytics 反向影响 Runtime

---

# 2. Authority Rule｜权威规则

跨契约冲突按照以下原则处理：

### 2.1 Schema 冲突

涉及字段定义、字段所有权、对象生命周期：

> **C01～C03 为权威。**

### 2.2 Transition 冲突

涉及：

- 当前状态是否合法
- 状态能否转换
- 状态结束条件
- STOP / CHANGE / WAIT

> **C04 为唯一合法状态转换权威。**

### 2.3 Action 冲突

涉及“用户想做什么”：

> **C05 为 Semantic Action（语义动作）权威。**

### 2.4 Authorization 冲突

涉及“系统现在允许做什么”：

> **C06 为 Policy（策略）权威。**

### 2.5 Model Capability 冲突

涉及：

- 使用哪个模型
- 如何调用模型
- Provider error
- Retry
- Fallback
- Model response

> **C07 为模型基础设施权威。**

C07 不拥有产品决策权。

### 2.6 Proposal Validation 冲突

涉及模型输出是否可以被产品接受：

> **C08 为 Proposal Validation（提案验证）权威。**

### 2.7 State Mutation 冲突

涉及真正改变：

- Session
- Intent
- ExperienceState
- Runtime State

> **C09 Runtime（运行时）为唯一写入权威。**

---

# 3. Matrix｜核心一致性矩阵

| ID    | 契约组合                | 冲突点                               | 权威            | 必须成立的规则                                               | 正向案例                    | 负向案例                              | 必须留证                    |
| ----- | ------------------- | --------------------------------- | ------------- | ----------------------------------------------------- | ----------------------- | --------------------------------- | ----------------------- |
| CC-01 | C01+C09             | Session 谁能修改                      | C09           | 只有 Runtime 修改 Session                                 | START→ACTIVE            | Frontend 直接写 ACTIVE               | state trace             |
| CC-02 | C01+C02             | Session 与 Intent 生命周期             | C01/C02       | Session END 后不得产生新的 Active Intent                     | 正常结束                    | END 后 LLM 创建 Intent               | lifecycle trace         |
| CC-03 | C01+C03             | Session 与 ExperienceState 生命周期    | C01/C09       | Session END 后旧 Experience 不得继续执行                      | END→cancel              | END 后旧 generation 写 State         | state/version trace     |
| CC-04 | C02+C03             | Intent 是否可以直接改变 ExperienceState   | C02/C09       | Intent 变化必须经过 Policy/State Machine/Runtime            | CHANGE→new experience   | Intent object 直接写 ExperienceState | decision trace          |
| CC-05 | C02+C05             | Intent 与 Semantic Action          | C05/C02       | 用户明确动作优先于旧 Intent                                     | “换一个”                   | 继续旧目标                             | action trace            |
| CC-06 | C02+C06             | Intent 与 Policy                   | C06           | Policy 必须尊重当前 Intent                                  | Intent 支持→ALLOW         | Memory 覆盖 Intent                  | policy trace            |
| CC-07 | C03+C04             | State 与合法转换                       | C04           | 所有 State Mutation 必须符合 State Machine                  | ACTIVE→WAITING          | ACTIVE→ENDED                      | transition trace        |
| CC-08 | C03+C05             | Semantic Action 与 ExperienceState | C05/C09       | Semantic Action 不能直接写 State                           | ACTION→Policy           | Action 直接 mutation                | mutation log            |
| CC-09 | C03+C06             | Policy 与 ExperienceState          | C06/C09       | Policy 决策不能绕过 Runtime 写 State                         | ALLOW→Runtime           | Policy object 直接改 State           | decision/state trace    |
| CC-10 | C04+C05             | Action 与 State Machine            | C04           | Action 只能触发合法 Transition                              | STOP→WAIT               | STOP→CONTINUE                     | transition evidence     |
| CC-11 | C05+C06             | Semantic Action→Policy            | C06           | Action 与 Policy 必须有明确映射                               | WHY→EXPLAIN             | WHY→CHANGE                        | mapping trace           |
| CC-12 | C06+C07             | Policy 与 LLM                      | C06           | LLM 只能执行已授权能力                                         | EXPLAIN→LLM             | LLM 自行决定 CONTINUE                 | policy + LLM trace      |
| CC-13 | C06+C08             | Policy 与 Validator                | C06/C08       | Validator 不得批准被 Policy 禁止的动作                          | ALLOW→VALIDATE          | DENY→ACCEPT                       | validation trace        |
| CC-14 | C07+C08             | Model Response 与 Validator        | C08           | 所有模型 Proposal 必须验证                                    | valid JSON→ACCEPT       | malformed→REJECT                  | LLM call + validation   |
| CC-15 | C08+C09             | Validator 与 Runtime               | C09           | 未通过 Validator 的 Proposal 不得写 State                    | ACCEPT→Runtime          | REJECT→Runtime                    | validation/mutation     |
| CC-16 | C07+C09             | LLM 与 Runtime                     | C09           | LLM 不得直接修改 Runtime State                              | Proposal→Runtime        | LLM mutation                      | access trace            |
| CC-17 | C06+C09             | Policy 与 Runtime                  | C09           | Policy 只能授权，不能直接执行 State Mutation                     | ALLOW→Runtime           | Policy mutation                   | mutation trace          |
| CC-18 | C07+C08+C09         | Async Generation                  | C08/C09       | stale result 必须被拒绝                                    | old result→REJECT       | old result→State                  | generation/state trace  |
| CC-19 | C06+C07+C09         | STOP                              | C06/C09       | STOP 必须中断 generation 并阻止旧结果进入 Runtime                 | STOP→cancel             | STOP 后继续输出                        | complete trace          |
| CC-20 | C05+C06+C07+C08+C09 | CHANGE_DIRECTION                  | C05/C06/C09   | CHANGE 必须使旧候选失效                                       | CHANGE→new candidate    | old candidate继续                   | complete trace          |
| CC-21 | C01+C07+C09         | Session End during generation     | C01/C09       | Session End 必须取消或使 generation stale                   | END→cancel              | END 后写 State                      | trace                   |
| CC-22 | C02+C07+C08         | Intent Change during generation   | C02/C08       | 旧 Intent 下的结果不得进入新 Intent                             | CHANGE→stale            | old result accepted               | intent/generation trace |
| CC-23 | C03+C07+C08         | State Version                     | C03/C08       | Proposal 必须绑定 state_version                           | version match→accept    | mismatch→reject                   | version trace           |
| CC-24 | C03+C09             | Concurrent Mutation               | C09           | 并发 mutation 必须通过 version/idempotency 控制               | one accepted            | stale second rejected             | mutation log            |
| CC-25 | C06+C07             | Retry                             | C07           | Retry 不能改变原 Policy 意图                                 | timeout→retry same task | retry→different action            | retry chain             |
| CC-26 | C06+C07+C08         | Fallback                          | C07/C08       | Fallback 必须重新验证                                       | fallback→validate       | fallback bypass validator         | validation trace        |
| CC-27 | C07+C08             | Model Switching                   | C07/C08       | 换模型不得跳过 Validator                                     | model A→B→validate      | model B bypass                    | model/version trace     |
| CC-28 | C07+C09             | Provider Failure                  | C07/C09       | Provider failure 不得被伪装成成功结果                           | timeout→failure         | timeout→fake content              | call record             |
| CC-29 | C07+C08             | Model Failure Classification      | C07/C08       | infrastructure failure ≠ validation failure           | timeout                 | invalid schema                    | failure class           |
| CC-30 | C08+C09             | Runtime Acceptance                | C08/C09       | Validation success ≠ Runtime mutation success         | ACCEPT→execute          | mutation conflict                 | execution trace         |
| CC-31 | C06+C03             | WAIT                              | C06/C03       | WAIT 后没有系统自主 continuation                             | WAIT                    | auto-next                         | state trace             |
| CC-32 | C05+C06+C03         | Explicit Correction               | C05/C06       | 用户纠正优先于当前生成内容                                         | correction→re-evaluate  | model defends itself              | action/policy trace     |
| CC-33 | C02+Memory          | Current Intent vs Memory          | C02/Policy    | 当前明确意图优先历史记忆                                          | “今天不要这个”                | memory强推                          | memory/policy trace     |
| CC-34 | C06+Memory          | Memory→Policy                     | C06           | Memory 不能直接成为 Policy Action                           | memory→context          | memory→CONTINUE                   | policy trace            |
| CC-35 | C09+Analytics       | Analytics Boundary                | C09           | Analytics 只记录，不控制 Runtime                             | event recorded          | metric triggers action            | access trace            |
| CC-36 | C07+Analytics       | LLM Call Recording                | C07/Analytics | 每次调用都有完整结果分类                                          | success recorded        | missing timeout                   | call record             |
| CC-37 | C08+Analytics       | Validation Recording              | C08/Analytics | 每次 validation 都可追溯                                    | ACCEPT recorded         | silent reject                     | validation record       |
| CC-38 | C09+Analytics       | Decision Trace                    | C09/Analytics | State Mutation 必须可追溯到 Decision                        | mutation→decision       | unexplained mutation              | decision trace          |
| CC-39 | C01+C02+C03+C04     | Lifecycle Closure                 | 各自权威          | 生命周期终止不能产生孤儿状态                                        | END→all stop            | orphan Experience                 | lifecycle replay        |
| CC-40 | C05+C06+C07+C08+C09 | End-to-End Authority              | 分层权威          | User Action→Action→Policy→Proposal→Validation→Runtime | 完整链路                    | 任一层越级                             | full trace              |

---

# 4. P3-S1 Mandatory Hard Checks｜P3-S1 必须验证的硬检查

上述 40 项不是全部都必须在 S1 实现。

P3-S1 只冻结以下 **12 项硬一致性检查**：

### CC-H01｜Single Writer

```text
Frontend
LLM
Policy
Memory
Analytics
Tool
        ↓
   Proposal / Request
        ↓
      Runtime
        ↓
 ExperienceState
```

要求：

> Runtime 是 ExperienceState 的唯一写入者。

**Hard Failure：**\
任何其他模块直接写入 = P0。

---

### CC-H02｜STOP Consistency

完整链路：

```text
User
↓
STOP
↓
Semantic Action
↓
Policy STOP
↓
Cancel Generation
↓
Invalidate Generation
↓
Reject Stale Result
↓
Runtime State Update
↓
WAIT / SESSION END
```

禁止：

```text
STOP
↓
“不过我还可以……”
↓
继续生成
```

**Hard Failure：**\
STOP 后任何未经用户新指令触发的 continuation = P0。

---

### CC-H03｜CHANGE_DIRECTION Consistency

```text
CHANGE_DIRECTION
↓
Cancel Old Generation
↓
Invalidate Old Candidate
↓
Re-evaluate Intent
↓
Generate New Candidate
↓
Validate
↓
Runtime
```

旧候选不得重新进入 Runtime。

**Hard Failure：**\
旧 generation 污染新 Experience = P0。

---

### CC-H04｜State Version Consistency

任何 State Mutation 必须携带：

```text
session_id
experience_id
expected_state_version
```

版本不匹配：

```text
STATE_VERSION_CONFLICT
```

不得：

- overwrite
- auto merge
- retry old write
- silent discard

必须重新读取当前状态并重新决策。

---

### CC-H05｜LLM Boundary

必须证明：

```text
LLM Output
≠
Runtime Action
```

合法：

```text
LLM
↓
Proposal
↓
Validator
↓
Policy / State Machine checks
↓
Runtime
```

非法：

```text
LLM
↓
State mutation
```

---

### CC-H06｜Policy Boundary

必须证明：

```text
Policy ALLOW
≠
Runtime execution
```

正确：

```text
Policy
↓
Authorization
↓
State Machine
↓
Runtime
```

Policy 不拥有 State。

---

### CC-H07｜Validator Boundary

所有 LLM Proposal 必须经过 Validator。

以下全部不得进入 Runtime：

- malformed output
- schema failure
- policy rejection
- state mismatch
- stale result
- intent mismatch
- agency violation
- continuity violation

---

### CC-H08｜WAIT Consistency

进入 WAIT 后：

```text
WAIT
↓
No automatic continuation
↓
No automatic recommendation
↓
No automatic generation
↓
Wait for User Action
```

WAIT 不是“模型正在想”。

WAIT 是：

> 系统已经完成当前可执行动作，下一步控制权回到用户。

---

### CC-H09｜Current Intent > Memory

必须验证：

```text
Explicit Current Intent
>
Historical Memory
```

例如：

```text
历史：
用户喜欢科幻

当前：
“今天不想看科幻，换个方向”
```

必须执行当前方向。

Memory 不得 override Current Intent。

---

### CC-H10｜Model Failure Completeness

每次模型调用都必须有 Call Record。

至少记录：

```text
request_id
parent_request_id
provider
model
model_version
request_time
response_time
latency
status
result_class
error_code
retry_count
fallback_used
cancelled
stale
validation_result
state_version
```

至少能够区分：

```text
SUCCESS
TIMEOUT
NETWORK_ERROR
RATE_LIMIT
PROVIDER_ERROR
AUTH_ERROR
INVALID_OUTPUT
SCHEMA_ERROR
VALIDATOR_REJECTED
POLICY_REJECTED
STATE_VERSION_CONFLICT
CANCELLED
STALE_RESULT
```

---

### CC-H11｜Decision Trace Completeness

至少能够回放：

```text
USER_INPUT
↓
INTENT
↓
SEMANTIC_ACTION
↓
POLICY
↓
LLM_REQUEST
↓
MODEL_ROUTING
↓
LLM_RESPONSE / ERROR
↓
VALIDATION
↓
RUNTIME_EXECUTION
↓
STATE_MUTATION
↓
USER_VISIBLE_RESULT
```

任何 Runtime State Mutation 都必须能够回答：

> 为什么发生？\
> 谁授权？\
> 哪个 Intent？\
> 哪个 Action？\
> 哪个 Policy Decision？\
> 哪个 Model Call？\
> 哪个 Validation？\
> 哪个 State Version？

---

### CC-H12｜End-to-End Authority Consistency

最终必须证明：

```text
User
 ↓
Intent
 ↓
Semantic Action
 ↓
Policy
 ↓
State Machine
 ↓
LLM Proposal
 ↓
Validator
 ↓
Runtime
 ↓
State
```

任何一步越级均视为架构违规。

---

# 5. Golden Cross-Contract Scenarios｜黄金跨契约场景

P3-S1 至少执行以下 8 个跨契约场景。

## GXC-01｜正常探索

```text
用户：
“为什么天空是蓝色的？”

Intent
→ QUESTION / UNDERSTAND

Semantic Action
→ QUESTION

Policy
→ ANSWER / EXPLAIN

LLM
→ Proposal

Validator
→ ACCEPT

Runtime
→ ExperienceState mutation

UI
→ Experience
```

要求：

全链路可追踪。

---

## GXC-02｜生成过程中 STOP

```text
User
→ QUESTION

LLM
→ GENERATING

User
→ STOP

Policy
→ STOP

Runtime
→ cancel

Old Result
→ STALE / REJECTED
```

要求：

旧结果不得显示，不得写入 State。

---

## GXC-03｜生成过程中 CHANGE_DIRECTION

```text
Experience A
→ GENERATING

User
→ “换一个”

Policy
→ CHANGE

Experience A
→ INVALIDATED

Intent
→ RE-EVALUATED

Experience B
→ GENERATED

Experience B
→ VALIDATED

Experience B
→ ACTIVE
```

要求：

A 永远不能重新成为当前 Experience。

---

## GXC-04｜模型超时

```text
LLM
→ TIMEOUT

Call Record
→ TIMEOUT

Policy
→ 根据能力决定 RETRY / FALLBACK / WAIT

Retry
→ parent_request_id 保持一致

最终结果
→ 重新 Validation
```

禁止：

> 把 timeout 当成正常模型结果。

---

## GXC-05｜模型返回非法结构

```text
LLM
→ malformed JSON

C07
→ INVALID_OUTPUT

C08
→ SCHEMA_REJECT

C09
→ no mutation
```

要求：

非法输出不能因为“内容看起来不错”而进入 Runtime。

---

## GXC-06｜State Version 冲突

```text
State Version = 12

Request A
→ expected 12

Request B
→ mutates State
→ version 13

Request A returns
→ expected 12

Runtime
→ STATE_VERSION_CONFLICT
```

要求：

A 不得覆盖 Version 13。

---

## GXC-07｜Memory 与当前 Intent 冲突

```text
Memory:
用户经常探索科幻

Current Intent:
“今天不要科幻，想看看现实问题”
```

要求：

```text
Current Intent
>
Memory
```

不得因为历史偏好继续推荐科幻。

---

## GXC-08｜完整 Decision Trace

随机抽取一条真实 Runtime Mutation：

必须能够完整反查：

```text
State Mutation
↓
Runtime Execution
↓
Validation
↓
LLM Response
↓
Model Call
↓
Policy Decision
↓
Semantic Action
↓
Intent
↓
User Input
```

如果链路断裂：

> Decision Trace 不通过。

---

# 6. Negative Test Matrix｜负向测试

P3-S1 不接受只测正常流程。

至少必须验证：

| Negative Case                  | Expected Result |
| ------------------------------ | --------------- |
| Frontend 直接改 State             | REJECT          |
| LLM 直接改 State                  | REJECT          |
| Policy 直接改 State               | REJECT          |
| 非法 State Transition            | REJECT          |
| stale generation               | REJECT          |
| stale State Version            | REJECT          |
| STOP 后旧结果返回                    | REJECT          |
| CHANGE 后旧结果返回                  | REJECT          |
| Session END 后结果返回              | REJECT          |
| Validator Reject 后 Runtime 执行  | REJECT          |
| Policy DENY 后 LLM 执行           | REJECT          |
| Memory override Current Intent | REJECT          |
| WAIT 自动继续                      | REJECT          |
| Retry 改变原 Intent               | REJECT          |
| Fallback 绕过 Validator          | REJECT          |
| Analytics 修改 Runtime           | REJECT          |
| Provider timeout 被伪装成功         | REJECT          |
| malformed output 被接受           | REJECT          |

---

# 7. Evidence Requirements｜证据要求

任何一致性检查必须有 Evidence（证据）。

以下均**不能**视为 PASS：

- “代码应该不会这样”
- “架构上已经限制”
- “Prompt 已经写了”
- “Agent 会遵守”
- “Demo 没问题”
- “Unit Test 是绿的”
- “我们人工测试过”
- “正常流程成功”
- “模型一般不会这样”

有效 Evidence 至少来自：

1. Runtime execution trace
2. State mutation log
3. State version record
4. Decision trace
5. LLM Call Record
6. Validation Record
7. Negative test result
8. Golden Scenario result
9. Replay result
10. Independent evaluation result

---

# 8. P3-S1 Scope Boundary｜范围边界

跨集内容创作的一致性问题已经被正式纳入架构，但：

> **不得因为 CC-11～CC-20 而把 P3-S1 扩张成完整内容创作平台。**

P3-S1 只建立未来可承载一致性系统所需要的边界：

```text
Canonical State
    ↓
Experience State
    ↓
Generation Proposal
    ↓
Validation
    ↓
Runtime
```

以下能力暂不进入 S1 实现：

- 完整长篇作品管理
- 多集项目管理
- 完整 Character Database
- World Bible
- Timeline Editor
- Branch Editor
- Creator Marketplace
- Full Creation IDE
- 自动长篇续写
- 多 Agent 创作系统

这些属于后续 Creation Vertical Slice（创作型完整产品切片）的范围。

但其核心原则现在冻结：

> **Generated Content ≠ Canonical Fact（生成内容不自动等于正史事实）。**

---

# 9. Hard Failure Classification｜硬失败定义

以下任何一项出现一次，即：

**P3-S1 BLOCKED**

### P0

- Unauthorized State Mutation
- LLM Direct State Mutation
- Policy Bypass
- STOP Violation
- CHANGE_DIRECTION Violation
- Stale Result enters Runtime
- State Version overwrite
- Illegal State Transition
- Memory overrides Explicit Current Intent
- Validator bypass
- Hidden Continuation

### P1

- Decision Trace incomplete
- LLM Call Record incomplete
- Retry/Fallback trace incomplete
- Validation reason missing
- Model version not traceable
- Runtime mutation missing decision linkage

### P2

- Minor metadata inconsistency
- Non-critical event field missing
- Replay information incomplete但不影响状态正确性

P0/P1 不允许通过平均分抵消。

---

# 10. Freeze Criteria｜冻结标准

CC02 正式冻结必须满足：

```text
C01～C09 Contract Consistency
        +
State Consistency
        +
Policy Consistency
        +
LLM Boundary
        +
Validator Boundary
        +
Runtime Integrity
        +
STOP / CHANGE Integrity
        +
Decision Trace
        +
Negative Test
```

并满足：

```text
P0 = 0
Agency Blocker = 0
State Integrity Blocker = 0
Policy Compliance Blocker = 0
```

---

# 11. Current Status｜当前状态

| 项目                    | 状态               |
| --------------------- | ---------------- |
| C01～C09               | FREEZE CANDIDATE |
| CC01 Concept          | DEFINED          |
| CC02 Matrix           | FREEZE CANDIDATE |
| 12 Hard Checks        | DEFINED          |
| 8 Golden Scenarios    | DEFINED          |
| Negative Tests        | DEFINED          |
| Evidence Requirements | DEFINED          |
| Execution             | **PENDING**      |
| PASS                  | **NONE**         |
| P3-S1 Implementation  | PREPARATION      |
| P2 Exit Gate          | **NOT PASSED**   |

---

# 12. Immediate Next Step｜下一执行步骤

不再继续增加一致性概念。

下一步进入：

**P3-S1-EXEC-01｜Runtime Vertical Slice Implementation Contract（运行时首个完整产品切片实现契约）**

执行顺序固定：

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
↓
CC02 Cross-Contract Tests
↓
Golden Cross-Contract Tests
↓
Negative Tests
↓
Replay
↓
Independent Evaluation
↓
P3-S1 Product Review Gate
```

**禁止：**

```text
先做 UI Demo
↓
再补 State
↓
再补 Policy
↓
最后让测试适配实现
```

正确顺序必须是：

```text
Contract
↓
State
↓
Policy
↓
Runtime
↓
Evidence
↓
UI Projection
```

**结论：P3-S1 现在进入“实现准备完成、执行尚未开始”的状态。不得声称任何 Gate 已通过。**
