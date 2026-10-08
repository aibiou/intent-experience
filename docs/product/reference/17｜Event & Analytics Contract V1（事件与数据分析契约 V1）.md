# 17｜Event & Analytics Contract V1（事件与数据分析契约 V1）

**Phase:** P2｜Product Engineering Contract（产品工程契约）\
**Status:** Freeze Candidate\
**Version:** `analytics_v1.0.0`

---

# 1. Contract Purpose（契约目的）

Event & Analytics Contract V1（事件与数据分析契约 V1）用于定义：

1. 什么叫“系统事实”
2. 什么叫“用户行为”
3. 什么叫“模型行为”
4. 什么叫“策略决策”
5. 什么叫“状态变化”
6. 什么叫“产品指标”
7. 什么数据可以进入 Analytics
8. Analytics 如何追踪一次完整体验
9. 如何区分 User Action、Policy Decision、LLM Output 和 State Transition
10. 如何保证指标不会反向污染产品逻辑

核心原则：

> **Analytics 记录产品发生了什么，不决定产品应该发生什么。**

---

# 2. Core Principle（核心原则）

系统中的四类事实必须严格分开：

```text
User Fact
↓
System Fact
↓
Model Observation
↓
Product Decision
```

更准确地说：

```text
USER ACTION
    ↓
SEMANTIC INTERPRETATION
    ↓
POLICY DECISION
    ↓
STATE TRANSITION
    ↓
RUNTIME RESULT
```

Analytics 必须能够观察这条链。

但 Analytics **不能反向控制**这条链。

---

# 3. Four-Layer Observability Model（四层可观测模型）

V1 将产品运行事实分为四层。

## L1 — User Event（用户事件）

用户实际做了什么。

例如：

- 点击
- 输入
- 语音
- STOP
- CHANGE_DIRECTION
- CREATE
- MODIFY

这是最接近用户事实的一层。

---

## L2 — System Event（系统事件）

系统实际发生了什么。

例如：

- experience_started
- state_transitioned
- generation_started
- generation_cancelled
- tool_called
- experience_completed

---

## L3 — Decision Trace（决策追踪）

系统为什么这么做。

例如：

```text
semantic_action = WHAT_IF
policy_action = SIMULATE
reason = current_experience_goal
state_before = UNDERSTANDING
state_after = SIMULATION
```

---

## L4 — Outcome / Metric（结果与指标）

这次行为最终产生了什么结果。

例如：

- Intent Fulfillment
- Experience Continuation
- Intent Change
- Deepening
- Completion
- Voluntary Return
- Agency Score

---

# 4. Absolute Boundary（绝对边界）

必须保持：

```text
Event
≠
State

Event
≠
Decision

Decision
≠
Metric

Metric
≠
Policy
```

例如：

```text
experience_completed
```

是 Event。

而：

```text
ExperienceState.completion.is_complete = true
```

是 State。

前者记录后者发生。

不能因为 Analytics 收到：

```text
experience_completed
```

就反向把 ExperienceState 设置为 completed。

---

# 5. Event as Immutable Fact（事件是不可变事实）

一旦 Event 被确认写入：

> 不修改原始 Event。

如果发生纠正：

```text
original_event
↓
correction_event
```

而不是：

```text
UPDATE original_event
```

原因：

- 审计
- 重放
- 指标重算
- 行为分析
- Debug
- 数据一致性

---

# 6. Event Identity（事件身份）

每个 Event 必须具有：

```json
{
  "event_id": "evt_xxx",
  "event_type": "experience_started",
  "timestamp": "ISO-8601",
  "session_id": "session_xxx",
  "user_id": "user_xxx",
  "experience_id": "experience_xxx"
}
```

可选：

```text
intent_id
state_version
request_id
decision_id
client_request_id
```

---

# 7. Event Envelope（事件信封）

统一结构：

```json
{
  "event_id": "evt_xxx",
  "event_type": "string",
  "event_version": "1.0.0",
  "timestamp": "ISO-8601",

  "identity": {
    "user_id": "user_xxx",
    "session_id": "session_xxx"
  },

  "context": {
    "experience_id": "experience_xxx",
    "intent_id": "intent_xxx",
    "state_version": 12,
    "request_id": "req_xxx",
    "decision_id": null
  },

  "source": {
    "layer": "frontend | runtime | policy | llm | tool | memory | analytics",
    "component": "string"
  },

  "properties": {}
}
```

---

# 8. Event Source Rules（事件来源规则）

不同来源只能记录自己真正知道的事实。

| Source        | 可以记录                         | 不可以冒充记录         |
| ------------- | ---------------------------- | --------------- |
| Frontend      | 用户点击/输入/UI 行为                | Policy Decision |
| Input Layer   | 输入标准化结果                      | 用户真实意图          |
| Intent Engine | Intent interpretation result | 用户最终满意          |
| LLM           | Model output                 | 产品最终决策          |
| Policy        | Policy Decision              | 用户行为            |
| Runtime       | State Transition / execution | 用户主观满意          |
| Tool          | Tool execution/result        | 产品是否完成          |
| Memory        | Memory lifecycle             | 用户稳定偏好（若仅为推断）   |
| Analytics     | aggregation/metric           | Runtime State   |

---

# 9. Event Taxonomy V1（事件分类）

V1 使用以下一级事件域：

```text
Session
Home
Intent
Experience
Interaction
Runtime
Creation
Memory
Policy
LLM
Tool
State
Analytics
```

---

# 10. Session Events（会话事件）

```text
session_started
session_ended
```

### session_started

记录一次 Session 正式开始。

### session_ended

只有满足 Session End Condition 后才产生。

不能因为：

- 页面切后台
- 网络断开
- 用户短暂离开

就立即推断 Session End。

---

# 11. Home Events（首页事件）

```text
home_viewed
intent_button_clicked
free_input_opened
text_submitted
voice_started
voice_cancelled
voice_confirmed
recent_exploration_clicked
```

禁止：

```text
home_viewed → 用户产生了兴趣
```

页面展示不等于用户意图。

---

# 12. Intent Events（意图事件）

V1：

```text
intent_received
intent_parsed
intent_clarification_shown
intent_clarification_answered
intent_assumed
intent_confirmed
intent_changed
intent_completed
intent_abandoned
intent_rejected
```

必须区分：

```text
intent_parsed
```

和：

```text
intent_confirmed
```

因为：

> AI 理解 ≠ 用户确认。

如果产品采用低摩擦 Assume 模式：

```text
intent_assumed
```

必须单独记录。

---

# 13. Experience Events（体验事件）

```text
experience_candidate_generated
experience_candidate_selected
experience_entered
experience_started
experience_changed
experience_interrupted
experience_completed
experience_exited
```

特别注意：

### experience_candidate_generated

不代表用户看到。

### experience_candidate_selected

不代表用户接受。

### experience_started

表示体验真正进入 Runtime。

### experience_completed

表示系统确认满足 Completion Condition。

### experience_exited

表示体验结束，但原因可能不是完成。

因此：

```text
completed ≠ exited
```

---

# 14. Interaction Events（交互事件）

```text
question_asked
answer_requested
why_requested
how_requested
what_if_requested
compare_requested
verify_requested
deepen_requested
simplify_requested
reframe_requested
known_declared
correction_submitted
change_direction_requested
stop_requested
continue_requested
```

这些事件主要用于：

> 分析用户如何与 Experience Runtime 交互。

不能直接把它们当成 Policy Action。

例如：

```text
what_if_requested
```

是 User/Semantic Event。

而：

```text
SIMULATE
```

是 Policy Action。

---

# 15. Runtime Events（运行时事件）

```text
action_started
action_completed
action_cancelled
generation_started
generation_completed
generation_cancelled
response_rendered
runtime_waiting
runtime_resumed
runtime_fallback
```

特别重要：

```text
runtime_waiting
```

不是：

> AI 不知道怎么办。

而是：

> Runtime 正确选择等待用户。

---

# 16. Creation Events（创造事件）

```text
creation_started
creation_plan_generated
creation_previewed
creation_modified
creation_undo
creation_reframed
creation_completed
creation_stopped
```

核心指标：

> `creation_modified`

因为：

**AI 生成了东西 ≠ 用户真正开始创造。**

---

# 17. Memory Events（记忆事件）

```text
memory_candidate_created
memory_candidate_evaluated
memory_accepted
memory_rejected
memory_corrected
memory_expired
memory_used
memory_not_used
```

禁止把：

```text
memory_candidate_created
```

统计为：

```text
memory_created
```

候选不是记忆。

---

# 18. Policy Events（策略事件）

```text
policy_decided
policy_validated
policy_rejected
policy_overridden
```

必须记录：

```text
policy_version
decision_id
selected_action
reason
state_before
state_after
```

---

# 19. LLM Events（大模型事件）

LLM 层至少记录：

```text
llm_request_started
llm_request_completed
llm_request_failed
llm_output_validated
llm_output_rejected
llm_retry_started
```

不得把：

```text
llm_request_completed
```

当成：

```text
experience_completed
```

模型完成输出，不等于产品完成体验。

---

# 20. Tool Events（工具事件）

```text
tool_requested
tool_authorized
tool_started
tool_completed
tool_failed
tool_cancelled
```

必须能够追踪：

```text
LLM Tool Request
↓
Authorization
↓
Execution
↓
Result
```

否则无法判断工具使用到底是谁触发、是否被授权。

---

# 21. State Events（状态事件）

核心：

```text
state_transitioned
state_write_rejected
state_version_conflict
```

`state_transitioned` 必须记录：

```json
{
  "from": "UNDERSTANDING",
  "event": "WHAT_IF",
  "action": "SIMULATE",
  "to": "SIMULATION",
  "state_version_before": 12,
  "state_version_after": 13
}
```

---

# 22. Decision Trace（决策追踪）

Decision Trace 不是普通 Analytics Event。

它是：

> **系统决策的可审计对象。**

结构：

```json
{
  "decision_id": "decision_xxx",
  "session_id": "session_xxx",
  "experience_id": "experience_xxx",

  "input_event": "evt_xxx",

  "semantic_action": "WHAT_IF",

  "state_before": {
    "stage": "UNDERSTANDING",
    "state_version": 12
  },

  "policy": {
    "policy_version": "policy_v1.0.0",
    "selected_action": "SIMULATE"
  },

  "reason": {
    "primary": "semantic_action",
    "secondary": "current_experience_goal"
  },

  "execution": {
    "tool_used": false,
    "llm_used": true
  },

  "state_after": {
    "stage": "SIMULATION",
    "state_version": 13
  },

  "user_override": false
}
```

---

# 23. LLM Trace 与 Policy Trace 必须分离

系统必须能够回答：

### Question A

> 模型认为用户想做什么？

读取：

```text
LLM Trace
```

### Question B

> 产品为什么决定这样做？

读取：

```text
Policy Trace
```

### Question C

> 最终状态发生了什么变化？

读取：

```text
State Transition
```

这三个问题不能用一条模糊的：

```text
ai_response
```

解决。

---

# 24. State Snapshot（状态快照）

State Snapshot 用于 Debug / Replay / Evaluation。

它不是 Event。

结构：

```json
{
  "snapshot_id": "snapshot_xxx",
  "session_id": "session_xxx",
  "experience_id": "experience_xxx",
  "state_version": 13,
  "timestamp": "ISO-8601",
  "state": {}
}
```

规则：

> Event 记录变化，Snapshot 记录某个时间点的状态。

---

# 25. Event Ordering（事件顺序）

同一 Session / Experience 中：

```text
event_sequence
```

必须可排序。

V1 不要求所有分布式系统事件拥有绝对全局顺序。

只要求：

> **同一个 Experience Runtime 内，状态相关事件具有确定的逻辑顺序。**

核心字段：

```json
{
  "sequence_number": 103
}
```

---

# 26. Event Versioning（事件版本）

每种 Event 拥有独立：

```text
event_type
event_version
```

例如：

```text
experience_started
v1.0.0
```

字段变化必须遵循：

### PATCH

修复解析/文档问题，不改变语义。

### MINOR

增加向后兼容字段。

### MAJOR

改变字段语义、删除字段或改变事件含义。

---

# 27. Idempotency（事件幂等）

Event ingestion 必须支持：

```text
event_id
```

去重。

相同：

```text
event_id
```

不得产生两条逻辑事实。

Analytics ingestion 重试：

```text
same event_id
→ safe deduplication
```

---

# 28. Metric Definition（指标定义原则）

所有核心指标必须由 Event 派生。

禁止：

```text
Runtime
↓
直接告诉 Metrics
↓
“这个用户满意了”
```

而应该：

```text
User/System Events
↓
Metric Definition
↓
Metric Calculation
```

---

# 29. North Star / Core Metrics V1（核心指标）

V1 不以 Session Time、消息数、点击数作为核心产品成功指标。

核心指标：

### 1. Intent Fulfillment Rate

用户表达的目标是否得到满足。

不是：

> 是否聊得久。

---

### 2. First Experience Fit

首次进入体验后是否表现出有效匹配。

观察：

- immediate exit
- CHANGE_DIRECTION
- continuation
- direct answer request
- early completion

---

### 3. Experience Continuation Rate

用户主动继续当前体验的比例。

---

### 4. Intent Change Rate

用户主动改变方向的比例。

这个指标不是单纯越低越好。

因为：

> 用户改变方向是正常 Agency 行为。

需要区分：

- healthy exploration
- poor initial fit

---

### 5. Deepening Rate

用户是否自然进入：

```text
WHY
HOW
WHAT_IF
COMPARE
DEEPEN
```

等更深层交互。

---

### 6. Creation Start Rate

用户从 Experience 进入 Creation 的比例。

---

### 7. First Modification Rate

Creation 中用户第一次真正修改结果的比例。

这是 V1 Creation 的关键指标。

---

### 8. Experience Completion Rate

用户达到自身目标并完成体验的比例。

---

### 9. Voluntary Return Rate

用户在没有：

- notification
- streak
- reward
- forced continuation

情况下主动回来。

---

### 10. Agency Score

衡量用户是否感到：

- 可以改变方向
- 可以停止
- AI 理解自己
- AI 没有强迫自己
- 最终决定权仍然在自己

---

# 30. AI Quality Metrics（AI 质量指标）

V1：

```text
Clarification Rate
Clarification Abandonment
Intent Correction Rate
User Rephrase Rate
Free Expression Rate
Time to Intent

Policy Accuracy
Unnecessary Intervention Rate
User Override Rate
Recovery Success
Completion Accuracy

Context Continuity
Policy Regret
Agency Violation

Fact Reliability
Uncertainty Accuracy
Reference Resolution Accuracy
```

---

# 31. Memory Metrics（记忆指标）

Memory V1 重点不是：

> 记得越多越好。

而是：

```text
Memory Usefulness
Memory Correction Rate
Memory Violation Rate
Memory Regret
Memory Trust
Memory Acceptance Rate
Memory Rejection Rate
Memory Expiration Rate
```

尤其关注：

> Memory 是否错误地干扰当前 Intent。

---

# 32. Creation Metrics（创造指标）

```text
Creation Start Rate
First Build Completion
First Modification Rate
First Interaction Rate
Iteration Depth
Creation Completion Rate
Creation Stop Rate
Re-description Rate
Undo Rate
```

其中：

### Re-description Rate

用户是否被迫重新描述已经存在于上下文中的需求。

这是重要的体验质量指标。

---

# 33. Agency Metrics（自主性指标）

Agency 不允许只通过问卷判断。

V1 同时观察行为信号：

```text
STOP success
CHANGE success
USER_OVERRIDE
UNNECESSARY_CONTINUATION
FORCED_CLARIFICATION
UNAUTHORIZED_MEMORY_USE
HIDDEN_RECOMMENDATION
```

构成：

```text
Agency Score
=
User Control
+
Exit Success
+
Direction Change Success
+
Intent Respect
-
Forced Continuation
-
Unnecessary Intervention
-
Unauthorized Inference
```

该公式用于分析，不直接作为 Runtime Policy Score。

---

# 34. Metric Anti-Gaming Rules（指标反作弊）

任何指标都不得直接成为唯一 Policy Optimization Target。

尤其禁止：

```text
Session Time ↑
→ Policy 自动认为产品变好
```

```text
Message Count ↑
→ AI 自动增加问题
```

```text
Return Rate ↑
→ 自动增加通知
```

```text
Completion Rate ↑
→ 降低 Completion 标准
```

核心原则：

> **Metric 是观测工具，不是产品目标函数本身。**

---

# 35. Funnel Definition（漏斗定义）

V1 的核心体验漏斗：

```text
Home Viewed
↓
Intent Captured
↓
Intent Accepted / Assumed
↓
Experience Entered
↓
Experience Started
↓
First Interaction
↓
Continuation / Deepening / Creation
↓
Completion / Exit
↓
Voluntary Return
```

不能把所有用户行为压缩成：

```text
DAU → Session Time
```

---

# 36. Experience Quality Analysis（体验质量分析）

每个 Experience 至少分析：

```text
Entry
↓
First Layer
↓
First User Action
↓
Policy Decision
↓
Runtime Response
↓
Continuation
↓
Change / Stop / Completion
```

重点识别：

### Failure A

用户第一次看到就：

```text
CHANGE
```

可能表示 First Experience Fit 不足。

### Failure B

用户连续：

```text
“不是这个意思”
```

可能表示 Intent / Context / Reference Resolution 失败。

### Failure C

用户频繁：

```text
“直接告诉我”
```

可能表示系统过度体验化。

### Failure D

用户频繁：

```text
“好了”
```

可能表示：

- Experience Goal 已完成
- 或体验价值不足

不能仅凭单一事件判断。

---

# 37. Policy Regret（策略后悔）

V1 新增重要分析概念：

> **Policy Regret：系统执行某个动作后，从用户随后行为看，该动作是否明显偏离了更合适的选择。**

示例：

```text
Policy:
ASK clarification
```

随后：

```text
user abandons
```

可能形成：

```text
policy_regret = true
```

但不能简单归因。

必须结合：

- Intent
- State
- User Action
- Alternative Action
- Outcome

---

# 38. Unnecessary Intervention（不必要干预）

定义：

> 系统进行了一个本可以不进行、且降低用户体验或 Agency 的干预。

例如：

用户：

```text
讲讲黑洞。
```

系统：

```text
你想从物理学、哲学还是科幻角度了解？
```

如果存在安全、正确、低成本的默认解释，则：

```text
unnecessary_intervention = true
```

---

# 39. Decision Replay（决策回放）

系统必须支持：

```text
Event Sequence
+
State Snapshots
+
LLM Trace
+
Policy Trace
+
Version Information
```

重建：

> 当时系统为什么做了这个决定。

必须包含：

```text
policy_version
llm_contract_version
prompt_version
experience_version
state_version
```

否则无法可靠复现历史行为。

---

# 40. Privacy & Data Minimization（隐私与数据最小化）

Analytics 不默认保存完整原始用户输入。

根据事件需要决定：

```text
raw_input
normalized_input
semantic_action
```

优先：

> 保存分析所需的最小数据。

例如对于：

```text
“如果摩擦力不是0呢？”
```

Analytics 通常需要：

```text
semantic_action = WHAT_IF
```

未必需要永久保存完整原文。

---

# 41. Sensitive Data Boundary（敏感数据边界）

Analytics 不得为了“以后可能有用”保存：

- 无关私人信息
- 完整长期对话
- 不必要的用户身份数据
- 与指标无关的 Memory 内容

原则：

> **能用事件语义解决，就不要保存更多原始内容。**

---

# 42. Analytics Cannot Control Runtime（分析系统不得控制 Runtime）

绝对禁止：

```text
Analytics
↓
“这个用户 Session Time 很低”
↓
Runtime
↓
自动增加体验
```

Analytics 可以：

```text
observe
measure
diagnose
evaluate
```

不能：

```text
decide
authorize
continue
recommend
```

---

# 43. Data Quality Rules（数据质量规则）

V1 必须检查：

### Completeness

关键 Event 是否缺失。

### Consistency

例如：

```text
experience_completed
```

之前是否存在：

```text
experience_started
```

### Ordering

State Event 是否按合法顺序发生。

### Duplication

Event 是否重复。

### Attribution

Event 是否能够关联：

```text
session
experience
intent
request
decision
```

### Version Validity

Event Version 是否有效。

---

# 44. Golden Analytics Cases（数据黄金案例）

## Case 01 — Direct Answer

用户：

```text
直接告诉我。
```

应产生：

```text
answer_requested
policy_decided
action_started
action_completed
response_rendered
```

不能产生：

```text
clarification_shown
```

除非确实存在必要澄清。

---

## Case 02 — Change

用户：

```text
换一个。
```

至少能够追踪：

```text
change_direction_requested
generation_cancelled
policy_decided
experience_candidate_rejected
experience_candidate_selected
experience_changed
```

---

## Case 03 — Stop

用户：

```text
好了。
```

必须能够追踪：

```text
stop_requested
policy_decided
generation_cancelled(if active)
experience_completed OR experience_exited
session_continues_or_ends
```

并且：

> 不产生自动 next experience。

---

## Case 04 — Creation

用户：

```text
这个可以做成一个小游戏。
```

必须能够追踪：

```text
creation_started
creation_previewed
```

之后用户修改：

```text
creation_modified
```

因此可以计算：

```text
First Modification Rate
```

---

## Case 05 — Correction

用户：

```text
不是这个意思。
```

必须能够区分：

```text
correction_submitted
```

与：

```text
intent_changed
```

不能把所有纠正都统计成换方向。

---

# 45. Acceptance Tests（验收测试）

### Event

- [ ] Every core product action has a defined event
- [ ] Event source is explicit
- [ ] Event version exists
- [ ] Event is immutable
- [ ] Duplicate events are deduplicated
- [ ] Event ordering is defined

### State

- [ ] State changes generate state transition records
- [ ] Event cannot directly mutate state
- [ ] Snapshot can reconstruct state
- [ ] State version is traceable

### Decision

- [ ] LLM Trace is separate from Policy Trace
- [ ] Decision ID is traceable
- [ ] Policy version is recorded
- [ ] Reason is recorded
- [ ] User override is recorded

### Metrics

- [ ] Core metrics derive from defined events
- [ ] Metrics do not directly control Runtime
- [ ] Session Time is not North Star
- [ ] Engagement metrics cannot override Agency

### Memory

- [ ] Candidate and accepted Memory are separate
- [ ] Memory use is observable
- [ ] Memory violation is observable

### Creation

- [ ] Creation start is observable
- [ ] First modification is observable
- [ ] Undo is observable
- [ ] Completion is observable
- [ ] Re-description is observable

### Privacy

- [ ] Raw user input is not collected by default without analytical need
- [ ] Long-term Memory is not copied wholesale into Analytics
- [ ] Analytics data is minimized
- [ ] Sensitive information is not retained unnecessarily

### Replay

- [ ] Historical decision can be reconstructed
- [ ] Policy version is available
- [ ] LLM contract version is available
- [ ] Prompt version is available
- [ ] Experience version is available
- [ ] State version is available

---

# 46. Definition of Done（完成标准）

```text
[ ] Event model defined
[ ] Event envelope defined
[ ] Event source ownership defined
[ ] Event taxonomy defined
[ ] Session events defined
[ ] Home events defined
[ ] Intent events defined
[ ] Experience events defined
[ ] Interaction events defined
[ ] Runtime events defined
[ ] Creation events defined
[ ] Memory events defined
[ ] Policy events defined
[ ] LLM events defined
[ ] Tool events defined
[ ] State events defined

[ ] Decision Trace defined
[ ] LLM Trace / Policy Trace separated
[ ] State Snapshot defined
[ ] Event ordering defined
[ ] Event versioning defined
[ ] Event idempotency defined

[ ] Core metrics defined
[ ] AI quality metrics defined
[ ] Memory metrics defined
[ ] Creation metrics defined
[ ] Agency metrics defined
[ ] Metric anti-gaming rules defined
[ ] Funnel defined
[ ] Policy Regret defined
[ ] Unnecessary Intervention defined

[ ] Decision replay defined
[ ] Privacy boundary defined
[ ] Data minimization defined
[ ] Data quality rules defined
[ ] Golden cases defined
[ ] Acceptance tests defined
[ ] Version assigned
```

---

# 47. Final Contract Principle（最终契约原则）

整个数据系统最终保持：

```text
USER ACTION
      ↓
SEMANTIC INTERPRETATION
      ↓
POLICY DECISION
      ↓
STATE TRANSITION
      ↓
RUNTIME RESULT
      ↓
OUTCOME
```

Analytics 从旁边观察：

```text
                 ┌───────────────┐
                 │   ANALYTICS   │
                 │               │
                 │ observe       │
                 │ measure       │
                 │ diagnose      │
                 │ evaluate      │
                 └───────────────┘
                         ↑
                         │
USER → SYSTEM → DECISION → STATE → OUTCOME
```

而不是：

```text
USER
 ↓
ANALYTICS
 ↓
ENGAGEMENT SCORE
 ↓
AI
 ↓
MORE CONTENT
```

产品必须始终坚持：

> **数据用于理解产品，而不是让产品为了数据而改变自己。**

最终原则：

> **Event 记录发生了什么；Decision Trace 记录为什么这么做；State Snapshot 记录当时系统是什么状态；Metric 记录最终表现。四者不可混为一谈。**

**Event & Analytics Contract V1 冻结候选。**
