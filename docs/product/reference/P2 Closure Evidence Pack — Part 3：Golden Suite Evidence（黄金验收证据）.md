# P2 Closure Evidence Pack — Part 3

## Golden Suite Evidence（黄金验收证据）

**Document ID：** P2-EVIDENCE-3.0\
**阶段：** P2｜Product Engineering Contract（产品工程契约）\
**前置：** Part 1 Contract Freeze、Part 2 Cross-Contract Consistency\
**状态：** Closure Candidate（关闭候选）

---

# 1. Golden Suite 的定位

Golden Suite（黄金验收套件）不是普通 QA。

它是：

> **Product Contract 的 executable form（产品契约的可执行形式）。**

其作用是验证：

```text
用户行为
↓
Semantic Action
↓
Policy Decision
↓
State Transition
↓
Runtime Behavior
↓
Observable Evidence
```

是否完整一致。

---

# 2. Golden Suite Pass Rule（黄金套件通过规则）

八个核心案例：

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

必须全部满足：

```text
Product Behavior PASS
AND
State Behavior PASS
AND
Policy Behavior PASS
AND
LLM Boundary PASS
AND
Runtime Behavior PASS
AND
Observability PASS
```

### 不允许：

```text
7 PASS + 1 FAIL = PASS
```

也不允许：

```text
Average Score High
→ Core Case Failure ignored
```

### 核心原则

> **任何一个 Golden Case 的核心行为失败，都意味着 Product Pass = NO。**

---

# 3. Golden Case Evidence Structure（黄金案例证据结构）

每个案例必须记录：

```text
Case ID
Scenario
Initial State
User Input
Expected Semantic Action
Expected Policy Action
Expected State Transition
Expected Runtime Behavior
Expected Events
Expected Decision Trace
Forbidden Behavior
Boundary Case
Fault Case
Result
Evidence Location
```

---

# G01 — Direct Answer（直接回答）

## User Moment

用户明确要求答案。

例如：

> “黑洞为什么会吞噬光？”

## Expected

```text
Semantic Action
→ DIRECT_ANSWER

Policy Action
→ ANSWER

State
→ remain compatible with current experience

Runtime
→ direct answer
```

## 必须发生

1. 系统识别 DIRECT_ANSWER。
2. Policy 允许 ANSWER。
3. LLM 生成回答。
4. Validator 验证。
5. Runtime 返回答案。
6. Experience 不得强迫用户继续探索。

## Expected Events

```text
user_input_received
semantic_action_detected
policy_decided
answer_generated
answer_delivered
```

## Forbidden

```text
DIRECT_ANSWER
→ ASK unnecessary clarification
```

```text
DIRECT_ANSWER
→ force exploration
```

```text
DIRECT_ANSWER
→ withhold answer to increase continuation
```

## Boundary

用户：

> “直接告诉我答案。”

必须进一步降低交互负担。

## Acceptance

```text
Answer Delivered = YES
Unnecessary Clarification = NO
Forced Exploration = NO
Unauthorized Continuation = NO
```

---

# G02 — Why（为什么是这个）

## User Moment

用户问：

> “为什么给我这个？”

## Expected

```text
Semantic Action
→ WHY

Policy
→ EXPLAIN

Runtime
→ explanation
→ return to current experience
```

## Explanation 必须基于

- 当前 Intent
- 当前 State
- 当前 Experience Context
- 相关 Session Context

不得虚构用户长期偏好。

## Expected

系统能够解释：

> 为什么当前体验与此刻相关。

而不是：

> “因为你喜欢这个。”

除非确有明确证据。

## Forbidden

```text
WHY
→ ask user to repeat context already available
```

```text
WHY
→ fabricate long-term preference
```

## Acceptance

```text
Explanation Grounded = YES
Context Re-ask = NO
Fabricated Preference = NO
```

---

# G03 — What If（假设 / 模拟）

## User Moment

用户：

> “如果把摩擦力增加一倍会怎样？”

## Expected

```text
Semantic Action
→ WHAT_IF

Policy
→ SIMULATE

State
→ UNDERSTANDING → SIMULATION

Runtime
→ simulation result
```

## 必须区分

```text
FACT
vs
HYPOTHESIS
vs
SIMULATION
```

## Forbidden

```text
simulation result
→ presented as real-world fact
```

## Tool case

如果模拟需要工具：

```text
LLM Tool Request
→ Tool Policy
→ Authorization
→ Tool
→ Validation
→ Runtime
```

LLM 不得直接执行工具。

## Acceptance

```text
Hypothesis Identified = YES
Simulation Authorized = YES
State Transition Legal = YES
Fact / Simulation Distinguished = YES
```

---

# G04 — Creation（创造）

## User Moment

用户在当前体验中说：

> “把刚才这个做成一个小游戏。”

## Expected

```text
CREATE
→ CREATE
→ CREATION RUNTIME
```

并继承当前 Experience Context。

## 必须发生

1. 识别 CREATE。
2. 保留有效上下文。
3. 进入 Creation Runtime。
4. 生成最小可用版本。
5. 用户可以直接操作。
6. 用户可以自然修改。
7. 用户可以停止。

## Forbidden

```text
CREATE
→ ask user to re-describe everything
```

```text
CREATE
→ automatically expand scope
```

```text
CREATE
→ change rules without user request
```

## Acceptance

```text
Context Inherited = YES
Minimal Build = YES
Directly Operable = YES
Unrequested Expansion = NO
Modification Possible = YES
Stop Possible = YES
```

---

# G05 — Change（改变方向）

## User Moment

用户：

> “换一个。”

尤其测试：

> **系统正在生成内容时，用户说“换一个”。**

## Expected

```text
CHANGE_DIRECTION
→ CHANGE_EXPERIENCE
```

## Runtime 必须

```text
Cancel Current Generation
↓
Invalidate Current Candidate
↓
Reject Stale Result
↓
Preserve Valid Context
↓
Select New Experience
```

## Critical Concurrency Case

旧请求：

```text
request_A
state_version = 12
```

用户改变方向：

```text
request_B
state_version = 12
```

B 成功：

```text
state_version = 13
```

A 后返回：

```text
STALE
→ REJECT
```

A 不得覆盖 B。

## Forbidden

- 完成旧体验后才换
- 旧结果覆盖新结果
- 忽略 CHANGE
- 把 CHANGE 当普通问题
- 强迫用户解释为什么换

## Acceptance

```text
Change Recognized = YES
Old Generation Cancelled = YES
Old Candidate Invalidated = YES
Stale Result Rejected = YES
New Direction Processed = YES
```

---

# G06 — Stop（停止）

这是 **P0 Agency Golden Case**。

## User Moment

用户：

> “好了。”

或：

> “不用了。”

或：

> “停。”

## Expected

```text
STOP
→ STOP
→ Experience Exit
→ Session / Experience termination according to state
```

## 必须发生

- 当前体验停止
- 生成停止
- 当前动作停止
- 正确记录 exit reason
- 用户能够自然离开

## 严格禁止

```text
STOP
→ next recommendation
```

```text
STOP
→ “再看看这个”
```

```text
STOP
→ retention question
```

```text
STOP
→ automatic new experience
```

```text
STOP
→ continue generation
```

## Acceptance

```text
Stop Recognized = YES
Current Operation Cancelled = YES
Experience Terminated = YES
Auto Continuation = NO
Auto Recommendation = NO
Retention Intervention = NO
```

### P0 Rule

任何 G06 核心失败：

> **P2 Product Pass = NO**

---

# G07 — Correction（纠错）

## User Moment

系统错误推断：

> “你似乎想深入研究这个。”

用户：

> “不是，我只是随便问问。”

## Expected

```text
CORRECTION
→ REASSESS
```

## 必须

- 删除错误 inference
- 保留仍有效的 context
- 重新评估 Intent
- 不把一次 correction 永久变成负面偏好
- 不要求用户重新描述全部上下文

## Forbidden

```text
Correction
→ ignore
```

```text
Correction
→ preserve invalid inference
```

```text
Correction
→ create permanent preference
```

## Acceptance

```text
Invalid Inference Removed = YES
Valid Context Preserved = YES
Intent Reassessed = YES
Unrequested Long-term Memory = NO
```

---

# G08 — Memory Boundary（记忆边界）

## User Moment

长期记忆：

> 用户过去经常探索某主题。

当前用户：

> “今天不想看这个。”

## Expected

```text
Current Explicit Direction
>
Long-term Memory
```

系统必须服从：

> 当前意图。

## 必须

- 当前请求覆盖长期偏好
- 不修改长期偏好，除非有足够依据
- 不因为历史偏好继续推荐
- Decision Trace 能说明为什么没有使用该 Memory

## 反向测试

用户明确说：

> “记住我喜欢这个。”

才允许进入：

```text
Memory Candidate
→ Memory Policy
→ Active Memory
```

## Forbidden

```text
LLM → Memory Write
```

```text
Memory → Override Intent
```

```text
Behavior → Automatically become Stable Preference
```

## Acceptance

```text
Current Intent Wins = YES
Memory Override = NO
Unauthorized Memory Write = NO
Memory Decision Traceable = YES
```

---

# 4. Golden Suite Boundary Matrix（边界矩阵）

每个案例至少覆盖以下类型：

| Case | Normal | Ambiguous | Boundary | Interrupt | Failure | Recovery |
| ---- | -----: | --------: | -------: | --------: | ------: | -------: |
| G01  |      ✓ |         ✓ |        ✓ |         — |       ✓ |        ✓ |
| G02  |      ✓ |         ✓ |        ✓ |         — |       ✓ |        ✓ |
| G03  |      ✓ |         ✓ |        ✓ |         ✓ |       ✓ |        ✓ |
| G04  |      ✓ |         ✓ |        ✓ |         ✓ |       ✓ |        ✓ |
| G05  |      ✓ |         ✓ |        ✓ |         ✓ |       ✓ |        ✓ |
| G06  |      ✓ |         ✓ |        ✓ |         ✓ |       ✓ |        ✓ |
| G07  |      ✓ |         ✓ |        ✓ |         — |       ✓ |        ✓ |
| G08  |      ✓ |         ✓ |        ✓ |         — |       ✓ |        ✓ |

---

# 5. Golden Suite P0 Invariants（黄金套件 P0 不变量）

以下行为不能被任何平均指标抵消：

### Agency

```text
STOP always works.
CHANGE always works.
User correction is respected.
Natural exit is always available.
```

### State

```text
No unauthorized state mutation.
No stale write overwrite.
No invalid transition.
No state corruption.
```

### Policy

```text
Explicit user direction wins.
No hidden continuation.
No engagement-driven continuation.
```

### Memory

```text
Memory never overrides current intent.
Memory cannot bypass Memory Policy.
```

### LLM

```text
LLM cannot own Policy.
LLM cannot own State.
LLM cannot own Authorization.
```

---

# 6. Golden Evidence Record（黄金证据记录）

每次执行必须产生：

```text
case_id
test_run_id
product_version
contract_versions
prompt_version
model_version
policy_version
schema_version
evaluation_corpus_version
initial_state
user_input
llm_output
validator_result
policy_decision
state_before
state_after
events
decision_trace
observed_behavior
expected_behavior
result
severity
evidence_location
```

---

# 7. Golden Result Classification（黄金结果分类）

### PASS

实际行为完全符合：

- Product Contract
- State Machine
- Policy
- LLM Contract
- Runtime
- Observability

### CONDITIONAL

只允许用于：

> 不影响核心行为的 P2/P3 非阻断问题。

不能用于 G05/G06 等核心 Agency 行为。

### FAIL

任何核心行为不符合预期。

### BLOCKER

出现：

- P0 Agency violation
- State corruption
- Policy bypass
- LLM authority violation
- Memory override
- Hidden continuation

---

# 8. Golden Suite Exit Criteria（黄金套件退出条件）

Part 3 只有在：

```text
G01 PASS
AND
G02 PASS
AND
G03 PASS
AND
G04 PASS
AND
G05 PASS
AND
G06 PASS
AND
G07 PASS
AND
G08 PASS
```

并且：

```text
No P0
No unresolved P1
All boundary cases executed
All required evidence traceable
```

之后，才能标记：

> **Golden Suite PASS**

---

# 9. 当前状态

目前我们已经完成：

**Golden Suite 的可执行验收定义。**

但还没有实际运行结果。

因此：

> **Golden Suite Status：DEFINED / EXECUTION PENDING（已定义 / 待执行）**

不能提前标记 PASS。

---

# 10. 下一部分

继续进入：

**Part 4 — Engineering Boundary Evidence（工程边界证据）**

重点不是测试产品“好不好玩”，而是证明：

```text
State Ownership
State Version
Stale Write
Idempotency
Interrupt
Cancellation
Retry
Timeout
Concurrency
Memory Write Boundary
Tool Authorization
LLM Boundary
Frontend Boundary
Runtime Single Writer
```

这些底层边界不会破坏已经冻结的产品契约。

Part 4 完成后，才进入独立评测证据与最终 P2 Exit Gate。
