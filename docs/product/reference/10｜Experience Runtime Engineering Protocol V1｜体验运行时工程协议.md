

# 10｜Experience Runtime Engineering Protocol V1

**Status:** Engineering Baseline\
**Version:** V1.0\
**Scope:** Screen 01–09 全部运行逻辑\
**Primary Goal:** 让 AI 工程团队可以基于明确契约开发，而不是自行解释产品意图。

---

# 10.1 第一原则：先定义“谁有权决定什么”

整个系统必须严格遵守责任边界。

```text
User
  ↓
Input Layer
  ↓
Intent Engine
  ↓
Experience Runtime
  ↓
Policy Engine
  ↓
Capability Layer
  ↓
LLM / Search / Tool
  ↓
Validator
  ↓
State Transition
  ↓
UI Runtime
```

但实际上不是所有模块都有同等决策权。

## Authority Matrix

| 模块                 | 可以决定            | 不可以决定               |
| ------------------ | --------------- | ------------------- |
| User               | 当前目标、方向、停止、修改   | —                   |
| Frontend           | 展示、输入、动画、交互     | AI 意图、Policy、Memory |
| Input Layer        | 输入标准化           | 用户意图                |
| Intent Engine      | 解析用户表达          | 最终产品行为              |
| Experience Runtime | 当前体验状态          | 长期记忆                |
| Policy Engine      | 下一步允许执行的 Action | 编造事实                |
| LLM                | 理解、生成、解释、候选方案   | 产品状态、长期记忆、最终 UI 行为  |
| Search/Tool        | 提供外部能力/事实       | 改变产品 Policy         |
| Validator          | 判断输出是否符合契约      | 自己创造新业务逻辑           |
| Memory Policy      | 是否形成/更新记忆       | 覆盖当前意图              |
| Analytics          | 记录和分析           | 修改运行时行为             |

**硬规则：**

> LLM 永远不能成为 Product State 的最终拥有者。

---

# 10.2 Runtime 的唯一事实来源

整个 Experience Runtime 必须采用：

> **Single Source of Truth**

唯一可信的运行状态：

```text
ExperienceState
```

不能出现：

```text
Frontend State
+
LLM State
+
Policy State
+
Backend State
```

然后互相猜测。

正确方式：

```text
User Event
    ↓
Runtime
    ↓
Current ExperienceState
    ↓
Policy Decision
    ↓
State Transition
    ↓
New ExperienceState
```

任何 UI 都只是：

```text
ExperienceState → View
```

UI 不拥有业务真相。

---

# 10.3 Core State Schema

V1 所有 Experience 必须至少具备以下结构。

```json
{
  "experience_id": "string",
  "experience_version": "string",

  "session_id": "string",

  "stage": "curiosity",

  "goal": {
    "primary": "understand",
    "secondary": null,
    "satisfaction": 0.0
  },

  "context": {
    "current_topic": null,
    "current_focus": null,
    "branch": null
  },

  "knowledge": {
    "confirmed": [],
    "inferred": [],
    "uncertain": []
  },

  "user_model": {
    "hypotheses": [],
    "questions": [],
    "known": []
  },

  "variables": {},

  "actions": [],

  "branches": [],

  "completion": {
    "is_complete": false,
    "reason": null
  },

  "control": {
    "waiting_for_user": true,
    "interruptible": true,
    "user_can_stop": true
  },

  "version": 1
}
```

---

# 10.4 State 字段的严格定义

## stage

只能来自枚举：

```text
curiosity
understanding
simulation
branch
creation
completion
```

V1 禁止工程师自行增加：

```text
thinking
smart_mode
engaged
deep_engagement
recommended
viral
etc.
```

如果业务确实需要新状态，必须修改 Schema Version。

---

## goal.primary

只能来自：

```text
explore
understand
create
relax
discover
```

不要把：

```text
"have_fun"
"stay_longer"
"engage"
```

作为用户目标。

---

## satisfaction

不是“用户开心程度”。

它表示：

> 当前用户目标是否已经得到满足的运行时估计。

范围：

```text
0.0 – 1.0
```

注意：

```text
satisfaction = 1
```

**不意味着必须结束。**

用户仍然可以主动继续。

---

# 10.5 Knowledge 必须区分三种状态

绝对禁止：

```json
{
  "knowledge": ["AI认为用户知道X"]
}
```

必须：

```json
{
  "confirmed": [],
  "inferred": [],
  "uncertain": []
}
```

含义：

### confirmed

系统可以直接依赖。

来源：

- 用户明确确认
- 高可靠外部来源
- Runtime 已验证结果

### inferred

系统推断，但不能当事实。

例如：

```text
用户连续问了三个机制问题
→ 可能理解程度较高
```

只能：

```text
inferred:
user_understands_basic_mechanism
```

不能：

```text
confirmed:
user_understands_basic_mechanism
```

### uncertain

系统不确定。

例如：

```text
用户可能在问 A
也可能在问 B
```

必须保留不确定性，而不是强行选择。

---

# 10.6 User Action Schema

所有用户行为必须标准化。

```json
{
  "event_id": "evt_xxx",
  "timestamp": "ISO-8601",
  "type": "user_action",
  "semantic_action": "WHY",
  "raw_input": "...",
  "source": "text"
}
```

## semantic_action V1

```text
QUESTION
WHY
HOW
WHAT_IF
COMPARE
VERIFY

DEEPEN
SIMPLIFY
REPEAT
REFRAME

CREATE
MODIFY

CONTINUE
CHANGE_DIRECTION
STOP

DIRECT_ANSWER
KNOWN
CORRECTION
```

---

# 10.7 特别重要：用户自然语言 ≠ Action

例如：

> “如果摩擦只有一点呢？”

不能直接把文字交给 Experience Runtime。

必须经过：

```text
Raw Input
↓
Semantic Parser
↓
WHAT_IF
↓
Target Resolver
↓
friction
↓
Policy
↓
SIMULATE
```

最终：

```json
{
  "semantic_action": "WHAT_IF",
  "target": {
    "type": "variable",
    "name": "friction"
  }
}
```

---

# 10.8 Action Schema

Policy Engine 的输出必须是严格枚举。

```text
ANSWER
EXPLAIN
ASK
WAIT

SIMULATE
CREATE
MODIFY

SEARCH
BRANCH
CHANGE_EXPERIENCE

SIMPLIFY
DEEPEN
REFRAME

STOP
```

禁止：

```text
"maybe_continue"
"probably_recommend"
"keep_user_engaged"
"make_it_fun"
```

这些不是工程 Action。

---

# 10.9 Policy Engine 是唯一的 Action Authority

正确流程：

```text
User
 ↓
Semantic Action
 ↓
Policy Engine
 ↓
Allowed Action
 ↓
Capability
```

例如：

```text
User:
“那如果摩擦只有一点呢？”

↓
Semantic Action:
WHAT_IF

↓
Policy:
SIMULATE

↓
Simulation Capability

↓
Result

↓
State Update
```

而不是：

```text
User
 ↓
LLM
 ↓
LLM自己决定：
“我们来做个小游戏吧”
```

---

# 10.10 Policy Decision Contract

Policy Engine 必须返回：

```json
{
  "decision_id": "decision_xxx",

  "action": "SIMULATE",

  "reason": {
    "semantic_action": "WHAT_IF",
    "goal_progress": "high",
    "experience_support": true
  },

  "target": {
    "variable": "friction"
  },

  "constraints": {
    "depth": "medium",
    "interaction": "high"
  },

  "requires_tool": false,

  "state_transition": {
    "from": "understanding",
    "to": "simulation"
  },

  "confidence": 0.95
}
```

---

# 10.11 Reason 必须是可解释的，但不是 Chain of Thought

工程日志需要：

```text
reason.semantic_action
reason.goal_progress
reason.experience_support
```

不需要保存模型内部思维过程。

系统只需要知道：

> 为什么这个 Action 被 Policy 允许。

例如：

```text
WHAT_IF
+
当前体验支持变量操作
+
用户目标仍然是理解
=
允许 SIMULATE
```

而不是记录模型的内部推理文本。

---

# 10.12 State Transition Contract

所有状态变化必须通过明确迁移。

例如：

```text
understanding
      ↓
WHAT_IF
      ↓
simulation
```

必须记录：

```json
{
  "transition": {
    "from": "understanding",
    "event": "WHAT_IF",
    "action": "SIMULATE",
    "to": "simulation"
  }
}
```

---

# 10.13 禁止非法 State Transition

例如：

```text
curiosity
↓
creation
```

如果用户没有 CREATE 意图：

**禁止。**

例如：

```text
understanding
↓
creation
```

只有：

```text
semantic_action = CREATE
```

才允许。

例如：

```text
completion
↓
继续生成内容
```

默认禁止。

如果用户重新表达新 Intent：

```text
completion
↓
new_intent
↓
new experience/session
```

才允许。

---

# 10.14 Runtime State Machine

V1 Runtime 必须实现：

```text
IDLE
 ↓
ASSESS
 ↓
DECIDE
 ↓
EXECUTE
 ↓
VALIDATE
 ↓
UPDATE
 ↓
WAIT
```

### IDLE

没有正在处理的用户事件。

### ASSESS

解析：

- 当前用户输入
- Experience State
- Intent
- Context
- Memory

### DECIDE

Policy Engine 决定 Action。

### EXECUTE

调用：

- LLM
- Search
- Simulation
- Creation
- Branch

### VALIDATE

检查结果。

### UPDATE

更新 ExperienceState。

### WAIT

明确进入：

> 等待用户。

---

# 10.15 WAIT 是正式状态，不是“什么都没发生”

这是一个非常重要的工程要求。

系统必须知道：

```json
{
  "waiting_for_user": true
}
```

而不是：

```text
AI response finished
→ frontend 自己决定下一步
```

WAIT 表示：

> 当前体验已经完成当前认知/交互单元，下一步方向属于用户。

这直接保护用户 Agency。

---

# 10.16 Interrupt Protocol

用户任何时候都可以打断。

例如 AI 正在生成：

```text
GENERATING
```

用户说：

> “换一个。”

必须：

```text
GENERATING
 ↓
USER_INTERRUPT
 ↓
CANCEL_GENERATION
 ↓
CANCEL_CURRENT_ACTION
 ↓
REGISTER_REJECTION
 ↓
PROCESS_NEW_INTENT
```

不能：

```text
等 AI 生成完
↓
再处理“换一个”
```

---

# 10.17 Interrupt Priority

用户新输入的优先级：

```text
STOP
>
CHANGE_DIRECTION
>
CORRECTION
>
DIRECT_ANSWER
>
CREATE
>
MODIFY
>
QUESTION
>
CONTINUE
```

例如：

AI 正在讲解。

用户：

> “好了。”

系统必须立即：

```text
STOP
```

不能：

```text
“好的，最后再补充一点……”
```

---

# 10.18 LLM Contract

LLM 不允许返回：

```text
“我认为我们应该继续探索……”
```

作为业务控制结果。

LLM 必须输出结构化对象。

例如：

```json
{
  "semantic_action": "WHAT_IF",

  "resolved_target": {
    "type": "variable",
    "name": "friction"
  },

  "response": {
    "summary": "...",
    "explanation": "..."
  },

  "state_update_proposal": {
    "confirmed": [],
    "inferred": [],
    "uncertain": []
  },

  "confidence": 0.94
}
```

然后：

```text
LLM Output
↓
Schema Validation
↓
Policy Validation
↓
Runtime Update
```

Structured Outputs / 严格 schema 本身也是降低 AI 输出自由度、避免非预期数据流进入下游的重要工程手段。

---

# 10.19 LLM 不允许修改这些字段

LLM 不得直接修改：

```text
completion.is_complete
completion.reason

control.user_can_stop
control.interruptible

memory
policy
authorization

experience_version
session_state
```

这些只能由系统代码修改。

---

# 10.20 Response Validator

所有模型输出必须经过 Validator。

Validator 至少检查：

```text
Schema Validity
↓
Action Validity
↓
State Compatibility
↓
Intent Alignment
↓
Experience Continuity
↓
Fact Reliability
↓
Uncertainty Accuracy
↓
Cognitive Load
↓
Agency Compliance
```

例如：

Policy：

```text
ANSWER
```

LLM：

```text
回答问题
+
顺便问三个新问题
+
推荐另一个主题
```

Validator 必须拒绝多余行为。

最终：

```text
保留答案
删除无授权 continuation
```

---

# 10.21 Experience Runtime 与 Memory 严格隔离

Runtime 可以产生：

```text
memory_candidate
```

但不能直接写：

```text
long_term_memory
```

正确：

```text
Experience
 ↓
Observed Signal
 ↓
Memory Candidate
 ↓
Memory Policy
 ↓
Accept / Reject / Decay
```

例如：

用户：

> “这个挺有意思。”

只能产生：

```json
{
  "candidate": {
    "topic": "friction",
    "signal": "positive_feedback"
  }
}
```

不能直接：

```text
user_likes_physics = true
```

---

# 10.22 Event Contract

V1 标准事件必须统一命名。

## Session

```text
session_started
session_ended
```

## Home

```text
home_viewed
intent_button_clicked
free_input_opened
text_submitted
voice_started
voice_cancelled
voice_confirmed
```

## Intent

```text
intent_received
intent_parsed
intent_clarification_shown
intent_clarification_answered
intent_changed
intent_rejected
```

## Experience

```text
experience_created
experience_entered
experience_started
experience_changed
experience_completed
experience_exited
```

## Interaction

```text
question_asked
answer_requested
what_if_requested
simulation_started
simulation_updated
branch_entered
```

## Creation

```text
creation_started
creation_previewed
creation_modified
creation_undo
creation_completed
creation_stopped
```

## Memory

```text
memory_candidate_created
memory_accepted
memory_rejected
memory_corrected
memory_expired
memory_not_used
```

## Policy

```text
policy_decided
policy_overridden
policy_rejected
policy_validated
```

---

# 10.23 Event 不等于 Analytics Metric

这是工程团队非常容易犯的错误。

例如：

```text
question_asked
```

是 Event。

而：

```text
Natural Question Rate
```

是 Metric。

Metric：

```text
Natural Question Rate
=
users_with_natural_question
/
users_entering_experience
```

不能让前端自己计算。

Analytics Layer 负责聚合。

---

# 10.24 必须记录 Decision Trace

每一次重要 Policy Decision 都必须可以追溯：

```text
decision_id
session_id
experience_id

input_event
semantic_action

state_before
intent_before

policy_version

selected_action

reason

confidence

tool_used

state_after

user_override
```

这样出现：

> “为什么 AI 刚才突然开始做游戏？”

工程团队可以直接查：

```text
用户输入
↓
Semantic Action = CREATE
↓
Policy = CREATE
↓
Policy Version = 1.2.0
↓
Creation Runtime
```

而不是靠工程师猜。

---

# 10.25 Policy Version 必须版本化

例如：

```text
policy_v1.0.0
policy_v1.1.0
policy_v1.2.0
```

每次改变：

```text
“换一个”的处理方式
```

或者：

```text
STOP 的判定
```

都必须产生新的 Policy Version。

不能偷偷修改 prompt 就上线。

---

# 10.26 Experience Template 必须版本化

例如：

```text
frictionless_world_v1
frictionless_world_v1.1
frictionless_world_v2
```

Runtime 数据必须保存：

```json
{
  "experience_id": "frictionless_world",
  "experience_version": "1.1"
}
```

否则用户昨天开始的 Experience，今天重新进入时可能突然发生结构变化。

---

# 10.27 API Contract

V1 至少需要以下内部接口。

## Intent

```http
POST /intent/resolve
```

## Experience

```http
POST /experience/start
GET  /experience/{id}/state
POST /experience/{id}/event
```

## Policy

```http
POST /policy/decide
```

## Capability

```http
POST /capability/answer
POST /capability/simulate
POST /capability/create
POST /capability/modify
POST /capability/search
```

## Memory

```http
POST /memory/candidate
POST /memory/evaluate
GET  /memory/relevant
```

## Observability

```http
POST /events
POST /decision-traces
```

---

# 10.28 API 的基本原则

Frontend：

```text
不能直接调用 LLM
```

Frontend：

```text
不能直接写 ExperienceState
```

Frontend：

```text
不能直接写 Memory
```

Frontend：

```text
不能决定 Policy
```

正确：

```text
Frontend
 ↓
Runtime API
 ↓
Policy / Capability
 ↓
State
 ↓
Frontend
```

这样 AI Coding 团队即使修改 UI，也不能偷偷改变核心业务逻辑。

---

# 10.29 Error Handling

V1 必须定义失败，而不是假设 AI 永远成功。

## Case A：Intent 解析失败

```text
Intent Parse Failed
↓
confidence < threshold
↓
minimal clarification
```

最多一个澄清问题。

---

## Case B：LLM Timeout

```text
LLM_TIMEOUT
↓
retry ≤ configured_limit
↓
fallback response
```

不能无限 retry。

---

## Case C：LLM Schema Invalid

```text
INVALID_OUTPUT
↓
retry with constrained request
↓
still invalid
↓
fallback
```

不能把非法 JSON 直接送给 Runtime。

---

## Case D：Tool Failure

例如 Simulation 服务失败：

```text
SIMULATION_FAILED
↓
保留当前 ExperienceState
↓
告诉用户无法完成当前操作
↓
允许继续 / 改变方向 / 停止
```

不能因为 Tool 失败导致整个 Experience 状态损坏。

---

## Case E：State Conflict

如果：

```text
Request A
Request B
```

同时修改 State：

必须通过：

```text
version
```

检测冲突。

例如：

```json
{
  "state_version": 7
}
```

请求提交时：

```text
expected_version = 7
```

如果实际已经是：

```text
8
```

则拒绝旧写入。

---

# 10.30 Retry Policy

AI 团队最容易做出：

```text
失败 → 再试
失败 → 再试
失败 → 再试
```

必须明确：

```text
Intent Parse: max 2
LLM Generation: max 2
Tool Call: max 2
State Commit: max 1 + conflict resolution
```

达到上限：

```text
Fallback
```

而不是无限循环。

---

# 10.31 Fallback 原则

Fallback 的目标不是：

> “假装 AI 没失败。”

而是：

> **保留用户控制权。**

例如：

Simulation 失败：

错误：

> “我来换一种方式继续给你讲……”

正确：

> “刚才的模拟没跑起来。你可以重新试一次，也可以直接继续问。”

---

# 10.32 Observability 三层结构

必须同时存在：

```text
Event
↓
Decision Trace
↓
State Snapshot
```

## Event

发生了什么？

## Decision Trace

为什么这么做？

## State Snapshot

做完以后系统变成什么？

三者缺一不可。

---

# 10.33 Debug 场景

用户反馈：

> “我明明说了不要继续，它为什么还在继续？”

工程师必须可以看到：

```text
Event:
STOP

Semantic:
STOP

Policy:
CONTINUE  ← BUG

Policy Version:
1.3.2

State Before:
understanding

State After:
understanding

Validator:
FAILED

UI:
continued_generation
```

这样才能定位是：

```text
Input
还是 Semantic Parser
还是 Policy
还是 Validator
还是 Frontend
```

而不是笼统地说：

> “模型今天表现不好。”

---

# 10.34 Acceptance Test 标准

每一条产品原则必须有机器测试。

例如：

### Test 001

Input:

```text
“直接告诉我。”
```

Expected:

```text
semantic_action = DIRECT_ANSWER
action = ANSWER
```

---

### Test 002

Input:

```text
“为什么？”
```

Expected:

```text
action = ANSWER
context_reuse = true
clarification = false
```

---

### Test 003

Input:

```text
“那如果温度高一点？”
```

Expected:

```text
semantic_action = WHAT_IF
action = SIMULATE
```

---

### Test 004

Input:

```text
“不是这个意思。”
```

Expected:

```text
semantic_action = CORRECTION
wrong_inference_removed = true
valid_context_preserved = true
```

---

### Test 005

Input:

```text
“换一个。”
```

Expected:

```text
action = CHANGE_EXPERIENCE
current_generation_cancelled = true
candidate_rejection_registered = true
```

---

### Test 006

Input:

```text
“好了。”
```

Expected:

```text
action = STOP
experience_completed = true
new_experience_started = false
additional_content = false
```

---

### Test 007

Input:

```text
“这个可以做成一个小游戏。”
```

Expected:

```text
semantic_action = CREATE
action = CREATE
context_carryover = true
re_description_required = false
```

---

# 10.35 Contract Test

除了单个 Case，还必须测试整个链路：

```text
Input
 ↓
Intent
 ↓
Policy
 ↓
Action
 ↓
Capability
 ↓
Validator
 ↓
State
```

例如：

```text
“这个可以做成小游戏”
```

不能只测试：

```text
LLM 输出 CREATE
```

必须测试：

```text
CREATE
→ Creation Runtime
→ source_experience preserved
→ concept preserved
→ minimal build generated
→ preview available
```

---

# 10.36 Golden Cases

V1 必须建立一套固定 Golden Dataset。

至少包含：

```text
明确意图
模糊意图
状态表达
问题
为什么
怎么办
假设
验证
纠正
换一个
停止
直接告诉我
继续
创建
修改
简化
深入
重新表达
```

每次：

```text
Model change
Prompt change
Policy change
Experience template change
```

都必须跑 Golden Cases。

---

# 10.37 AI Coding 团队的开发纪律

以后工程团队不能：

> “觉得这样比较智能，所以我加一个自动推荐。”

必须先问：

```text
1. 这是哪个 State？
2. 这是哪个 Event？
3. 这是哪个 Action？
4. 谁拥有这个 Action 的 Authority？
5. 是否需要修改 Policy？
6. 是否需要修改 Schema？
7. 是否破坏现有 Acceptance Test？
8. 是否增加新的用户控制风险？
```

如果答不上来：

**不允许直接实现。**

---

# 10.38 Definition of Done

一个 Experience 功能只有同时满足以下条件才算完成：

```text
[ ] Schema defined
[ ] Event defined
[ ] Action defined
[ ] Policy defined
[ ] State transition defined
[ ] API defined
[ ] LLM output schema defined
[ ] Validator defined
[ ] Error handling defined
[ ] Interrupt behavior defined
[ ] Observability defined
[ ] Acceptance tests defined
[ ] Golden cases passed
[ ] Version number assigned
```

少任何一个：

> **Not Ready for Production**

---

# 10.39 V1 工程架构最终形态

```text
                         USER
                           │
                           ▼
                    ┌─────────────┐
                    │ Input Layer │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Intent      │
                    │ Engine      │
                    └──────┬──────┘
                           │
                           ▼
                ┌────────────────────┐
                │ Experience Runtime │
                │                    │
                │ Experience State   │
                └─────────┬──────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │ Policy Engine   │
                 └────────┬────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
          Answer       Simulate     Create
              │           │           │
              └───────────┼───────────┘
                          ▼
                    ┌───────────┐
                    │ LLM/Tool  │
                    └─────┬─────┘
                          │
                          ▼
                    ┌───────────┐
                    │ Validator │
                    └─────┬─────┘
                          │
                          ▼
                  State Transition
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
           Runtime                   Memory
             │                         │
             ▼                         ▼
            USER                    Candidate
```

---

# 10.40 最终工程原则

### P01

**User owns intent.**

### P02

**Runtime owns experience state.**

### P03

**Policy owns action authorization.**

### P04

**LLM provides intelligence, not authority.**

### P05

**Validator owns output acceptance.**

### P06

**Memory cannot override current intent.**

### P07

**Frontend cannot own business decisions.**

### P08

**Every important decision must be traceable.**

### P09

**Every state transition must be explicit.**

### P10

**Every AI behavior must be testable.**

### P11

**Every autonomous behavior must be interruptible.**

### P12

**STOP is a valid successful outcome.**

### P13

**No hidden engagement objective.**

### P14

**No feature may be added merely because the model can do it.**

### P15

**If a behavior cannot be clearly specified, it is not ready to be built.**

---

# 10.41 对 AI 开发团队的最终一句话

> **不要让 AI 猜产品应该怎么运行；把产品运行规则写成 AI 无法歧义解释的协议。**

这套 Runtime Protocol 才是后续所有开发的“宪法”。

任何 Prompt、Model、UI、Experience Template、Memory、Recommendation、Creation 能力，都必须在这套协议之内运行。
