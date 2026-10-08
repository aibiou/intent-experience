# P3-S1-C01～C04｜Runtime Core Foundation Contracts（运行时核心底座契约）

**Document Version（文档版本）：** 1.0\
**Status（状态）：** FREEZE CANDIDATE（冻结候选）\
**Scope（范围）：** P3-S1 Runtime Vertical Slice（运行时首个完整产品切片）\
**Parent Spec（上位规范）：** P3-S1 Runtime Vertical Slice Specification 1.0\
**Authority（规范来源）：** C1 Core Schema Specification + C2 State Machine Specification\
**Purpose（目的）：** 建立 Session、Intent、ExperienceState、State Machine 四个核心底座，使后续 Policy、LLM、Runtime、API 和 Evaluation 均建立在确定性的状态基础上。

---

# 0. Core Principle（核心原则）

本组契约定义 P3-S1 的最低确定性运行时底座。

必须满足：

> **User Action → Intent → ExperienceState → State Transition → Runtime**

任何后续能力都不得绕过该链路直接改变产品状态。

四条底线：

1. **Runtime 是 ExperienceState 的唯一写入者。**
2. **State Machine 是合法状态转换的唯一权威。**
3. **Intent 表达用户当前想做什么，不等同于用户长期偏好。**
4. **Session 结束后，系统不得自行重新启动体验。**

LLM、Frontend、Memory、Analytics 均不得直接修改上述核心状态。

---

# C01｜Session Contract（Session 契约）

## 1. Session Definition（Session 定义）

Session 表示一次连续的产品交互生命周期。

Session 不是：

- 用户账号生命周期
- 用户长期画像
- 单个 Experience 生命周期
- 单次 LLM Request 生命周期

Session 负责回答：

> “用户当前是否仍处于一次主动产品交互中？”

---

## 2. Session State（Session 状态）

```text
SESSION_IDLE
    ↓ START
SESSION_ACTIVE
    ↓ END_REQUEST
SESSION_ENDING
    ↓ FINALIZED
SESSION_ENDED
```

允许：

```text
SESSION_IDLE → SESSION_ACTIVE
SESSION_ACTIVE → SESSION_ENDING
SESSION_ENDING → SESSION_ENDED
```

禁止：

```text
SESSION_ENDED → SESSION_ACTIVE
SESSION_ENDED → SESSION_IDLE
```

新的交互必须创建新的 Session。

---

## 3. Session Schema（Session 数据结构）

```json
{
  "session_id": "session_xxx",
  "user_id": "user_xxx",
  "state": "IDLE | ACTIVE | ENDING | ENDED",
  "created_at": "ISO-8601",
  "started_at": "ISO-8601 | null",
  "ended_at": "ISO-8601 | null",
  "current_intent_id": "intent_xxx | null",
  "current_experience_id": "experience_xxx | null",
  "version": 1
}
```

---

## 4. Session Ownership（Session 所有权）

| 对象                 | 权限                    |
| ------------------ | --------------------- |
| Frontend           | 读取 / 发起用户动作           |
| Runtime            | 创建、推进、结束 Session      |
| Intent Engine      | 读取 current_intent     |
| Experience Runtime | 读取 current_experience |
| LLM                | 只读                    |
| Memory             | 只读                    |
| Analytics          | 记录                    |
| Policy             | 判断允许的 Action          |
| User               | 通过显式动作控制开始/结束         |

任何非 Runtime 组件不得直接修改 Session State。

---

## 5. Session Invariants（Session 不变量）

### SESS-INV-01

`SESSION_ENDED` 是终态。

### SESS-INV-02

Session End 后不得自动产生新的 Experience。

### SESS-INV-03

Session End 必须取消当前可取消的生成任务。

### SESS-INV-04

Session End 后到达的旧异步结果必须被拒绝。

### SESS-INV-05

Session version 每次状态变化递增。

---

# C02｜Intent Contract（意图契约）

## 6. Intent Definition（Intent 定义）

Intent 表示用户**当前阶段的目标、方向或需求**。

Intent 必须与以下概念分离：

```text
Current Intent ≠ User Profile
Current Intent ≠ Long-term Preference
Current Intent ≠ Memory
Current Intent ≠ Exact User Wording
```

Intent 是运行时决策的重要输入，但不能绕过 Policy 直接决定 Action。

---

## 7. Intent Lifecycle（Intent 生命周期）

```text
CREATED
   ↓
INTERPRETED
   ↓
ASSUMED / CONFIRMED
   ↓
ACTIVE
   ↓
COMPLETED
```

异常路径：

```text
INTERPRETED → ABANDONED
ACTIVE → CHANGED
```

---

## 8. Intent Schema（Intent 数据结构）

```json
{
  "intent_id": "intent_xxx",
  "session_id": "session_xxx",

  "goal": {
    "value": "string | null",
    "confidence": 0.0
  },

  "state": {
    "value": "string | null",
    "confidence": 0.0
  },

  "energy": "low | medium | high | unknown",
  "openness": "low | medium | high | unknown",
  "novelty": "low | medium | high | unknown",
  "depth": "shallow | medium | deep | unknown",
  "interaction": "passive | interactive | creative | unknown",
  "duration": "short | medium | long | unknown",

  "constraints": [],

  "source": "explicit | inferred | mixed",
  "confidence": 0.0,

  "lifecycle": "CREATED | INTERPRETED | ASSUMED | CONFIRMED | ACTIVE | CHANGED | COMPLETED | ABANDONED",

  "version": 1
}
```

字段可以为 `unknown` 或 `null`。

**未知不是错误。**

---

## 9. Intent Priority（Intent 优先级）

运行时决策必须遵守：

```text
Explicit Current Intent
        ↓
Current User State
        ↓
Current Experience Context
        ↓
Session Context
        ↓
Short-term Memory
        ↓
Long-term Memory
```

因此：

> 当前用户说“今天不想聊这个”，不能被历史兴趣覆盖。

---

## 10. Intent Clarification Rule（Intent 澄清规则）

P3-S1：

```text
主动澄清预算 = 1
```

只有当：

1. 当前 Intent 不足以执行；
2. 不同解释会显著改变结果；
3. 没有安全、低成本默认行为；

才允许 ASK。

否则：

> **Act Before Interview（先行动，再采访）**

---

## 11. Intent Invariants（Intent 不变量）

### INT-INV-01

LLM 可以提出 Intent Proposal，但不能直接写入 Active Intent。

### INT-INV-02

Intent 必须经过 Validator + Runtime。

### INT-INV-03

一次行为不能直接产生稳定长期偏好。

### INT-INV-04

Intent Change 必须能够使当前 Experience 重新评估。

### INT-INV-05

Intent 不得直接产生 Policy Action。

正确链路：

```text
User Input
 ↓
Intent Interpretation
 ↓
Semantic Action
 ↓
Policy
 ↓
Action
```

---

# C03｜ExperienceState Contract（体验状态契约）

## 12. ExperienceState Definition（体验状态定义）

ExperienceState 是当前 Experience 的：

> **Single Source of Truth（唯一事实来源）**

UI、LLM、Memory、Analytics 都不得成为 ExperienceState 的第二写入源。

---

## 13. ExperienceState Minimum Schema（最低状态结构）

```json
{
  "experience_id": "experience_xxx",
  "experience_version": "1.0.0",
  "session_id": "session_xxx",

  "stage": "ENTERING | READY | ACTIVE | WAITING | COMPLETED",

  "goal": "string",

  "context": {},

  "knowledge": {
    "known": [],
    "unknown": [],
    "unresolved": []
  },

  "user_model": {
    "current_interests": [],
    "current_questions": [],
    "current_hypotheses": []
  },

  "variables": {},

  "actions": [],

  "branches": [],

  "completion": {
    "status": "INCOMPLETE | COMPLETED",
    "reason": null
  },

  "control": {
    "waiting_for_user": false,
    "interruptible": true,
    "generation_id": null
  },

  "state_version": 1
}
```

---

## 14. State Ownership（状态所有权）

唯一允许：

```text
Runtime → ExperienceState
```

以下均只能 Proposal / Request：

```text
LLM → Runtime
Policy → Runtime
Frontend → Runtime
Memory → Runtime
Tool → Runtime
```

禁止：

```text
LLM → ExperienceState
Frontend → ExperienceState
Memory → ExperienceState
Analytics → ExperienceState
```

---

## 15. State Version（状态版本）

每一次合法状态变更：

```text
state_version = state_version + 1
```

任何状态写入必须携带：

```json
{
  "experience_id": "experience_xxx",
  "expected_state_version": 12
}
```

如果当前版本不是 `12`：

```text
STATE_VERSION_CONFLICT
```

该写入必须被拒绝。

不得：

- 覆盖新状态
- 自动合并未知状态
- 重试旧状态写入
- 静默丢弃冲突

必须重新读取当前状态并重新决策。

---

## 16. Stale Result Rejection（陈旧结果拒绝）

每个异步生成任务必须关联：

```text
session_id
experience_id
generation_id
state_version
```

如果返回时任一关键上下文已经失效：

```text
REJECT_STALE_RESULT
```

尤其适用于：

```text
用户点击“换一个”
用户点击“停止”
用户改变 Intent
Session 已结束
```

旧结果不得进入 UI 或 Runtime State。

---

# C04｜State Machine Contract（状态机契约）

## 17. State Machine Authority（状态机权威）

State Machine 是：

> **Legal Transition Authority（合法状态转换的唯一权威）**

Policy 决定：

> “允许执行什么 Action？”

State Machine 决定：

> “这个 Action 能否导致这个 State Transition？”

两者不能混为一谈。

---

# 18. Session State Machine（Session 状态机）

```text
IDLE
 ↓ START
ACTIVE
 ↓ END_REQUEST
ENDING
 ↓ FINALIZED
ENDED
```

---

# 19. Intent State Machine（Intent 状态机）

```text
CREATED
 ↓
INTERPRETED
 ├──→ ASSUMED
 │      ↓
 │    ACTIVE
 │
 └──→ ABANDONED

INTERPRETED → CONFIRMED → ACTIVE

ACTIVE → CHANGED
ACTIVE → COMPLETED
```

---

# 20. Experience State Machine（体验状态机）

```text
ENTERING
   ↓
READY
   ↓ START
ACTIVE
   ↓
WAITING
   ↓ USER_RESPONSE
ACTIVE
   ↓
COMPLETED
```

允许控制转换：

```text
READY → CHANGE_DIRECTION
ACTIVE → CHANGE_DIRECTION
ACTIVE → STOP
WAITING → STOP
```

其中：

```text
STOP ≠ FAILURE
STOP = Successful User-Controlled Exit
```

---

# 21. Transition Contract（状态转换契约）

任何状态转换必须具备完整记录：

```json
{
  "from_state": "ACTIVE",
  "event": "USER_INPUT",
  "semantic_action": "WHAT_IF",
  "policy_action": "SIMULATE",
  "to_state": "ACTIVE",
  "state_version_before": 12,
  "state_version_after": 13
}
```

缺少任一核心字段，不得提交状态转换。

---

# 22. STOP Contract（停止契约）

用户表达：

```text
停止
好了
不用了
退出
算了
不想继续
```

经过 Semantic Action Detection 后：

```text
STOP
```

必须：

```text
STOP
 ↓
Policy = STOP
 ↓
Cancel Active Generation
 ↓
Reject Stale Results
 ↓
Update State
 ↓
End Current Experience / Session as applicable
 ↓
WAIT
```

禁止：

```text
STOP → 自动推荐下一个体验
STOP → 继续解释
STOP → 继续生成
STOP → 追问用户
```

---

# 23. CHANGE_DIRECTION Contract（改变方向契约）

用户表达：

```text
换一个
换个话题
不要这个
我想看别的
```

转换为：

```text
CHANGE_DIRECTION
```

必须：

```text
CHANGE_DIRECTION
 ↓
Cancel Current Generation
 ↓
Reject Current Candidate
 ↓
Invalidate Stale Result
 ↓
Re-evaluate Intent / Context
 ↓
Generate New Candidate
 ↓
Policy Decision
 ↓
New Experience
```

旧 Experience 不得继续消费生成资源。

---

# 24. WAIT Contract（等待契约）

WAIT 是正式 Runtime State，不是异常。

```json
{
  "waiting_for_user": true
}
```

含义：

> 系统已经完成当前可执行动作，但下一步需要用户决定。

WAIT 状态下：

- 不自动继续
- 不自动扩展
- 不自动推荐
- 不自动生成下一层内容

除非用户产生新的 Action。

---

# 25. Core Invariants（底座级不变量）

以下规则属于 P3-S1 Blocker。

### CORE-01 Single Writer

ExperienceState 只能由 Runtime 写入。

### CORE-02 No Direct LLM Mutation

LLM 不得直接修改 State。

### CORE-03 No Policy Bypass

Runtime 不得绕过 Policy 执行需要授权的 Action。

### CORE-04 Legal Transition Only

任何 State Mutation 必须符合 State Machine。

### CORE-05 Version Safety

陈旧 State Write 必须拒绝。

### CORE-06 Stale Result Safety

陈旧异步结果不得污染当前状态。

### CORE-07 STOP Authority

STOP 不得被任何推荐、生成、体验目标覆盖。

### CORE-08 CHANGE Authority

CHANGE 必须使旧 Experience 失效。

### CORE-09 No Hidden Continuation

WAIT / STOP 后不得隐式继续。

### CORE-10 Session Termination

Session 结束后不得自动重新开始体验。

### CORE-11 Current Intent Priority

Current Intent 不得被 Memory 覆盖。

### CORE-12 Unknown Is Valid

Intent / State 中未知字段不得被模型强行填充为事实。

---

# 26. Required Tests（必须测试）

## C01 Session

- SESSION-001 正常开始
- SESSION-002 正常结束
- SESSION-003 END 后拒绝旧请求
- SESSION-004 END 时取消生成
- SESSION-005 END 后不得自动启动 Experience

## C02 Intent

- INTENT-001 明确 Intent 直接执行
- INTENT-002 信息不足但存在安全默认值 → 不澄清
- INTENT-003 信息不足且结果显著不同 → 允许一次澄清
- INTENT-004 当前 Intent 覆盖历史 Memory
- INTENT-005 LLM Proposal 不得直接写 Active Intent
- INTENT-006 Intent Change 触发重新评估

## C03 ExperienceState

- STATE-001 Runtime 正常写入
- STATE-002 Frontend 直接写入必须失败
- STATE-003 LLM 直接写入必须失败
- STATE-004 正确 state_version 写入成功
- STATE-005 stale state_version 写入失败
- STATE-006 stale generation result 被拒绝
- STATE-007 每次 mutation version +1

## C04 State Machine

- SM-001 合法 Transition 成功
- SM-002 非法 Transition 被拒绝
- SM-003 STOP 永远优先
- SM-004 CHANGE 取消旧 Generation
- SM-005 WAIT 不自动继续
- SM-006 Session End 后禁止重新激活
- SM-007 COMPLETED 后禁止非法继续
- SM-008 transition trace 完整记录

---

# 27. P3-S1 Acceptance Criteria（验收标准）

本组契约只有在以下条件全部满足时才能标记：

> **C01-C04 PASS**

### 必须满足

```text
Session Lifecycle = PASS
Intent Lifecycle = PASS
ExperienceState Single Writer = PASS
State Version = PASS
Stale Write Rejection = PASS
Stale Result Rejection = PASS
State Machine = PASS
STOP = PASS
CHANGE_DIRECTION = PASS
WAIT = PASS
Current Intent > Memory = PASS
LLM Direct Mutation = 0
Illegal State Transition = 0
State Corruption = 0
```

任何一个核心底座 Blocker 失败：

> **P3-S1 BLOCKED**

不能通过降低测试标准、增加特殊分支或前端 workaround 绕过。

---

# 28. Versioning（版本规则）

本组契约版本：

```text
P3-S1-C01 = 1.0.0
P3-S1-C02 = 1.0.0
P3-S1-C03 = 1.0.0
P3-S1-C04 = 1.0.0
```

以下变化必须升级版本并重新评测：

- State 字段变化
- State Lifecycle 变化
- Transition 变化
- Ownership 变化
- STOP / CHANGE 行为变化
- State Version 机制变化
- Intent Priority 变化

禁止：

> 通过 Prompt、Config、Frontend、Feature Flag 或 AI Coding Agent 静默改变契约行为。

---

# 29. Freeze Decision（冻结决策）

当前建议：

```text
C01 Session Contract          → FREEZE CANDIDATE
C02 Intent Contract           → FREEZE CANDIDATE
C03 ExperienceState Contract  → FREEZE CANDIDATE
C04 State Machine Contract    → FREEZE CANDIDATE
```

在正式冻结前必须完成：

1. 与 C1 Core Schema 一致性检查
2. 与 C2 State Machine 一致性检查
3. 与 C3 Action & Policy Contract 一致性检查
4. 与 C4 LLM Contract 一致性检查
5. 与 C5 API Contract 一致性检查
6. 与 C6 Event Contract 一致性检查
7. 与 C7 Evaluation Contract 一致性检查
8. Golden Suite 映射
9. Engineering Boundary 映射
10. Product Owner / Architecture Owner 审批

---

# 30. Next Dependency（下一依赖）

完成 C01-C04 后，严格进入：

```text
C01 Session
      ↓
C02 Intent
      ↓
C03 ExperienceState
      ↓
C04 State Machine
      ↓
C05 Semantic Action Contract
      ↓
C06 Policy Contract
      ↓
C07 LLM Gateway Contract
      ↓
C08 Validator Contract
      ↓
C09 Runtime Contract
```

不得先做 UI Demo，再反推底层状态。

**P3-S1 的第一目标不是“看到一个漂亮页面”，而是证明产品拥有一个可靠、可中断、可验证、不会被 LLM 绕过的 Runtime Core（运行时核心）。**
