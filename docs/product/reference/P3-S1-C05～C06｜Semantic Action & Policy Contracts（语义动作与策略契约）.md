# P3-S1-C05～C06｜Semantic Action & Policy Contracts

## 语义动作与策略契约

**Document ID：** P3-S1-C05-C06\
**Version：** 1.0.0\
**Status：** FREEZE CANDIDATE（冻结候选）\
**Scope：** P3-S1 Runtime Vertical Slice（运行时首个完整产品切片）\
**Parent：** P3-S1 Runtime Vertical Slice Specification\
**Dependencies：** C01 Session / C02 Intent / C03 ExperienceState / C04 State Machine\
**Authority：** C1 Core Schema + C2 State Machine + C3 Action & Policy Contract

---

# 一、必须先固定的四层关系

本契约明确禁止将以下四个概念混为一谈：

```text
User Input
    ↓
Semantic Action（语义动作）
“用户想做什么？”
    ↓
Policy Decision（策略决策）
“系统现在允许做什么？”
    ↓
State Machine
“这个动作能否合法改变当前状态？”
    ↓
Runtime
“实际执行并写入状态”
```

因此：

- **Semantic Action ≠ Policy Action**
- **Policy Decision ≠ State Transition**
- **LLM Proposal ≠ Runtime Decision**
- **Runtime Execution ≠ Policy Authorization**

四者必须保持独立。

---

# 二、C05 Semantic Action Contract（语义动作契约）

## C05.1 定义

Semantic Action（语义动作）表示：

> 用户当前输入在产品语境下表达的最主要行动意图。

它回答：

> **用户现在想让系统做什么？**

Semantic Action 不负责判断系统是否允许执行。

---

# 三、C05.2 P3-S1 Semantic Action Taxonomy

P3-S1 只冻结以下核心动作：

| Action           | 中文    | 含义               |
| ---------------- | ----- | ---------------- |
| STOP             | 停止    | 用户要求结束当前体验/执行    |
| CHANGE_DIRECTION | 改变方向  | 用户要求换方向、换体验、重新选择 |
| DIRECT_ANSWER    | 直接回答  | 用户希望得到明确答案       |
| CORRECTION       | 纠正    | 用户指出当前理解/内容存在错误  |
| WHY              | 解释原因  | 用户要求解释为什么        |
| WHAT_IF          | 假设/模拟 | 用户要求改变条件、进行假设    |
| DEEPEN           | 深入    | 用户希望继续深入当前主题     |
| SIMPLIFY         | 简化    | 用户希望降低复杂度        |
| REFRAME          | 换一种方式 | 用户希望以不同结构/角度理解   |
| CREATE           | 创建    | 用户要求产生某个具体结果     |
| MODIFY           | 修改    | 用户要求修改已有结果       |
| QUESTION         | 提问/探索 | 用户提出新的探索问题       |
| VERIFY           | 验证    | 用户要求检查真实性/正确性    |
| CONTINUE         | 继续    | 用户明确要求继续当前体验     |

---

# 四、C05.3 Semantic Action Priority

这是**语义层优先级**，不是 Policy Priority。

当一次用户输入同时表达多个动作时，使用：

```text
STOP
↓
CHANGE_DIRECTION
↓
DIRECT_ANSWER
↓
CORRECTION
↓
CREATE / MODIFY
↓
WHAT_IF / VERIFY / QUESTION / WHY / HOW
↓
DEEPEN / SIMPLIFY / REFRAME / REPEAT
↓
CONTINUE
```

核心原则：

> 越接近用户对当前系统行为的直接控制，优先级越高。

例如：

### 输入

> “这个解释不对，别继续这个，换一个。”

解析结果不是：

```text
CORRECTION
```

而是：

```text
CHANGE_DIRECTION
```

其中：

```text
CORRECTION = context
CHANGE_DIRECTION = controlling action
```

Runtime 不得继续当前体验后再处理 CHANGE。

---

# 五、C05.4 Semantic Action Schema

```json
{
  "action_id": "action_xxx",
  "session_id": "session_xxx",
  "experience_id": "experience_xxx",
  "type": "CHANGE_DIRECTION",
  "confidence": 0.94,
  "source": "explicit | inferred | mixed",
  "evidence": [],
  "target": {},
  "constraints": [],
  "created_at": "ISO-8601",
  "state_version": 12
}
```

---

# 六、C05.5 LLM 对 Semantic Action 的权限

LLM 可以：

```text
Input
↓
Semantic Action Proposal
```

但不能：

```text
LLM
↓
Runtime Action
```

LLM 只能产生：

```json
{
  "semantic_action_proposal": {
    "type": "CHANGE_DIRECTION",
    "confidence": 0.94
  }
}
```

之后必须经过：

```text
Validator
↓
Policy
↓
State Machine
↓
Runtime
```

---

# 七、C05.6 Ambiguity Rule

当多个 Semantic Action 均可能成立时：

### Rule 1

优先使用明确表达的控制动作。

### Rule 2

如果存在低风险、可逆、符合上下文的默认动作：

> 直接执行，不优先追问。

### Rule 3

只有当不同解释会导致**实质不同结果**，且不存在安全默认动作时，才允许 ASK。

### Rule 4

ASK 本身必须受到 Policy 的预算控制。

---

# 八、C05.7 Semantic Action 不得直接改变 State

以下全部禁止：

```text
LLM → ExperienceState
LLM → Intent
LLM → Session
Semantic Action → ExperienceState
Semantic Action → Policy State
Frontend → ExperienceState
```

唯一合法路径：

```text
Semantic Action
↓
Policy Decision
↓
State Machine Validation
↓
Runtime
↓
State Mutation
```

---

# 九、C06 Policy Contract（策略契约）

## C06.1 定义

Policy（策略）回答：

> **在当前状态、用户意图、体验上下文和系统约束下，系统现在允许采取什么动作？**

Policy 是**授权层**，不是内容生成层。

---

# 十、C06.2 Policy Priority

Policy Priority 与 Semantic Action Priority 严格分离。

正式优先级：

```text
Safety
↓
Explicit User Direction
↓
STOP / CHANGE_DIRECTION
↓
Current Experience Goal
↓
Current Intent
↓
Current Experience State
↓
Current User State
↓
Session Context
↓
Short-term Memory
↓
Long-term Memory
↓
Novelty
```

解释：

### Safety

最高优先级。

### Explicit User Direction

用户明确告诉系统怎么做。

### STOP / CHANGE_DIRECTION

用户主动结束或改变方向。

### Current Experience Goal

当前体验本身的目标。

### Current Intent

用户当前想解决什么问题。

### Current Experience State

当前体验处于什么阶段。

### Current User State

当前状态，例如 energy / depth / openness。

### Memory

只作为上下文。

### Novelty

只能用于同等条件下的候选选择。

---

# 十一、C06.3 Policy Action Taxonomy

Policy Action 表示：

> 系统实际被授权采取的动作类别。

P3-S1 冻结：

```text
ANSWER
EXPLAIN
SIMULATE
QUESTION
DEEPEN
SIMPLIFY
REFRAME
CHANGE
CREATE
MODIFY
STOP
WAIT
CONTINUE
ASK
REJECT
RETRY
FALLBACK
```

注意：

**Semantic Action 与 Policy Action 不要求一一对应。**

例如：

```text
Semantic Action:
WHY

可能产生：

Policy Action:
EXPLAIN
```

而：

```text
Semantic Action:
QUESTION

可能产生：

Policy Action:
ANSWER
QUESTION
WAIT
```

最终选择取决于当前状态和策略。

---

# 十二、C06.4 Policy Decision Schema

```json
{
  "decision_id": "decision_xxx",
  "session_id": "session_xxx",
  "experience_id": "experience_xxx",
  "input_action": {
    "type": "WHY",
    "confidence": 0.96
  },
  "policy_action": "EXPLAIN",
  "reason_codes": [
    "EXPLICIT_USER_REQUEST",
    "CURRENT_EXPERIENCE_SUPPORTS_EXPLANATION"
  ],
  "allowed": true,
  "state_version": 12,
  "requires_llm": true,
  "requires_user_input": false,
  "requires_confirmation": false,
  "agency_gate": {
    "passed": true
  },
  "created_at": "ISO-8601"
}
```

---

# 十三、C06.5 Policy Decision 的核心约束

Policy 必须同时检查：

```text
User Intent
+
Semantic Action
+
Experience State
+
Session State
+
State Machine
+
Safety
+
Agency
+
Execution Capability
```

不能只根据：

```text
LLM 判断
```

决定动作。

---

# 十四、C06.6 Agency Gate（用户自主权闸门）

任何可能产生主动延伸的 Policy Action 必须经过 Agency Gate。

Agency Gate 至少检查：

```text
1. 是否符合当前 Intent？
2. 是否违反明确用户方向？
3. 是否未经授权扩大体验范围？
4. 是否会产生隐藏式继续？
5. 用户是否仍然可以随时停止？
6. 是否把 engagement 当成继续执行的理由？
```

如果任一关键条件违反：

```text
Policy = REJECT / WAIT / STOP
```

而不是：

```text
继续生成
```

---

# 十五、C06.7 STOP Policy

STOP 拥有最高的普通用户控制优先级。

合法路径：

```text
User Input
↓
Semantic Action = STOP
↓
Policy = STOP
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
“好的，不过在结束之前……”
```

禁止任何自动续接。

---

# 十六、C06.8 CHANGE_DIRECTION Policy

合法路径：

```text
User Input
↓
CHANGE_DIRECTION
↓
Policy = CHANGE
↓
Cancel Current Generation
↓
Reject Current Candidate
↓
Invalidate Old Generation
↓
Re-evaluate Intent / Context
↓
Generate New Candidate
↓
Validate
↓
Runtime
```

旧体验不能继续消耗：

- generation
- tool call
- recommendation computation
- UI continuation
- background task

除非明确被定义为可共享的基础资源且不会产生旧体验副作用。

---

# 十七、C06.9 ASK Policy

ASK 不是默认策略。

P3-S1：

```text
ASK_ALLOWED = true
```

仅当：

```text
Intent insufficient
AND
Interpretations materially differ
AND
No safe low-cost default exists
```

才允许 ASK。

### ASK Budget

单次主动澄清预算：

```text
1
```

如果用户已经明确表达方向，不得重复询问。

如果 ASK 后仍然无法确定：

```text
优先采用安全默认
```

而不是进入无限澄清循环。

---

# 十八、C06.10 WAIT Policy

WAIT 表示：

> 当前系统动作已经完成，下一步应由用户决定。

WAIT 时：

```text
No auto continuation
No auto expansion
No unsolicited recommendation
No hidden generation
```

只有新的 User Action 才能离开 WAIT。

---

# 十九、C06.11 Memory 与 Policy

Memory 永远不能直接成为 Policy Action。

禁止：

```text
Memory
↓
Policy Action
```

合法路径：

```text
Memory
↓
Context
↓
Intent / State Interpretation
↓
Candidate Generation
↓
Policy
↓
Action
```

因此：

> Memory 是证据，不是命令。

当前明确意图永远优先于历史记忆。

---

# 二十、C06.12 Policy Conflict Resolution

当多个 Policy 候选冲突：

```text
Safety
↓
Explicit User Direction
↓
STOP / CHANGE
↓
Current Intent
↓
Current Experience State
↓
Agency
↓
Task / Experience Goal
↓
Memory
↓
Novelty
```

若仍无法解决：

```text
Policy = WAIT
```

而不是让 LLM 自行选择。

---

# 二十一、C06.13 Policy 与 State Machine 的边界

Policy：

> **这个动作现在是否应该被允许？**

State Machine：

> **这个动作是否可以合法地改变状态？**

例如：

```text
Policy:
CHANGE = ALLOWED
```

不意味着：

```text
ExperienceState
↓
可以任意跳转
```

必须继续经过：

```text
State Machine
↓
legal transition?
```

因此：

```text
Policy ALLOW
≠
State Transition ALLOW
```

二者必须同时成立。

---

# 二十二、C06.14 Policy 与 LLM 的边界

LLM 可以：

- 理解自然语言
- 生成 Semantic Action Proposal
- 生成候选内容
- 生成候选体验
- 解释
- 模拟
- 创建结果

LLM 不可以：

- 授权自己继续
- 决定是否 STOP
- 绕过 Policy
- 修改 ExperienceState
- 修改 Session
- 修改 Intent
- 决定 Memory 是否写入
- 决定是否执行 Tool
- 绕过 Validator

---

# 二十三、C05-C06 核心不变量

### SA-01

Semantic Action 不是 Runtime Action。

### SA-02

Semantic Action 不直接修改 State。

### SA-03

Explicit User Direction 优先。

### SA-04

STOP 优先于体验继续。

### SA-05

CHANGE_DIRECTION 优先于当前体验延续。

### SA-06

Unknown / Ambiguous 不得被伪装成高置信度。

### PO-01

Policy 是唯一普通 Action Authorization 层。

### PO-02

Policy 不生成事实内容。

### PO-03

Policy 不直接写 Runtime State。

### PO-04

Policy 必须尊重 State Machine。

### PO-05

Memory 不能直接产生 Policy Action。

### PO-06

Engagement 不能成为 Policy 授权理由。

### PO-07

ASK 必须受预算约束。

### PO-08

WAIT 禁止隐藏式继续。

### PO-09

STOP 必须可中断当前执行。

### PO-10

CHANGE 必须使旧候选失效。

---

# 二十四、必须加入 Golden / Boundary Tests

## C05 Tests

**SA-01**\
“停止” → STOP

**SA-02**\
“换一个” → CHANGE_DIRECTION

**SA-03**\
“这个不对” → CORRECTION

**SA-04**\
“这个不对，换一个” → CHANGE_DIRECTION + correction context

**SA-05**\
“为什么？” → WHY

**SA-06**\
“如果把条件改成……” → WHAT_IF

**SA-07**\
明确问题 + 无需澄清 → 不 ASK

**SA-08**\
高歧义 + 无安全默认 → ASK

**SA-09**\
LLM 提议 Action ≠ Runtime Action

---

## C06 Tests

**PO-01**\
STOP 永远不能被 CONTINUE 覆盖。

**PO-02**\
CHANGE_DIRECTION 永远不能被当前体验目标覆盖。

**PO-03**\
Memory 不得覆盖 Current Intent。

**PO-04**\
Policy ALLOW 仍必须经过 State Machine。

**PO-05**\
Policy DENY 时 LLM 不得自行执行。

**PO-06**\
WAIT 后不得自动继续。

**PO-07**\
ASK 超过预算必须拒绝继续 ASK。

**PO-08**\
Engagement 不得作为授权依据。

**PO-09**\
旧 State Version 的 Policy Decision 不得执行。

**PO-10**\
旧 Generation 的 Policy Decision 不得进入 Runtime。

---

# 二十五、C05-C06 Acceptance Gate

C05-C06 只有在以下条件全部满足后才允许正式冻结：

```text
Semantic Action Taxonomy PASS
AND
Semantic Action Priority PASS
AND
Policy Action Taxonomy PASS
AND
Policy Priority PASS
AND
Semantic → Policy Mapping PASS
AND
Policy → State Machine Boundary PASS
AND
LLM Boundary PASS
AND
STOP PASS
AND
CHANGE_DIRECTION PASS
AND
WAIT PASS
AND
ASK Budget PASS
AND
Agency Gate PASS
AND
Memory Boundary PASS
AND
State Version PASS
AND
Stale Decision Rejection PASS
```

Hard Blockers：

```text
LLM Direct Policy Bypass = 0
LLM Direct State Mutation = 0
Unauthorized Continuation = 0
STOP Violation = 0
CHANGE Violation = 0
Illegal Transition = 0
Memory Override Current Intent = 0
Policy Action Without Authorization = 0
```

任何一项 Hard Blocker > 0：

> **P3-S1 BLOCKED**

---

# 二十六、版本与变更控制

C05：

```text
Version: 1.0.0
```

C06：

```text
Version: 1.0.0
```

以下变化必须升版本并重新执行相关 Golden / Boundary Tests：

- 新增 Semantic Action
- 删除 Semantic Action
- 修改 Action Priority
- 修改 Policy Action
- 修改 Policy Priority
- 修改 STOP / CHANGE 行为
- 修改 ASK Budget
- 修改 Agency Gate
- 修改 Memory → Policy 边界
- 修改 Policy → State Machine 边界
- 修改 LLM Authorization Boundary

禁止通过以下方式绕过版本控制：

```text
Prompt 修改
Config 修改
Feature Flag
Frontend Logic
LLM Model 更换
AI Coding Agent 自行实现
```

---

# 二十七、冻结结论

当前：

```text
C01 Session                  FREEZE CANDIDATE
C02 Intent                  FREEZE CANDIDATE
C03 ExperienceState         FREEZE CANDIDATE
C04 State Machine           FREEZE CANDIDATE
C05 Semantic Action         FREEZE CANDIDATE
C06 Policy                  FREEZE CANDIDATE
```

但尚不宣布正式冻结。

正式冻结前必须完成：

```text
C01-C06
   ↓
Cross-Contract Consistency
   ↓
Golden Suite
   ↓
Engineering Boundary
   ↓
Independent Evaluation
   ↓
Owner Approval
   ↓
FORMAL FREEZE
```

下一依赖链：

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

**P3-S1 当前禁止跳过 C07-C08，直接做 UI Demo。**

真正的首个产品切片必须证明：

> **用户说什么 → 系统理解什么 → 系统允许做什么 → 状态是否允许改变 → AI 提供什么候选 → 验证是否通过 → Runtime 执行什么 → 用户能否随时改变或停止。**
