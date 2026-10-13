# 14｜Action & Policy Contract V1

## 动作与策略契约 V1

**Status：Draft for Product Freeze**\
**Phase：P2｜Product Engineering Contract（产品工程契约）**\
**Dependency：**

- 12｜Core Schema Specification V1（核心数据结构规范 V1）
- 13｜State Machine Specification V1（状态机规范 V1）

**Next：**

- 15｜LLM Contract（大模型调用契约）

---

# 1. Contract Purpose｜契约目的

本契约定义：

> **用户输入经过语义理解后，系统如何决定下一步允许执行的动作。**

核心链路：

```text
User Input
↓
Semantic Action（语义动作）
↓
Policy Evaluation（策略评估）
↓
Policy Decision（策略决策）
↓
Allowed Action（允许执行的动作）
↓
State Transition（状态转换）
↓
Runtime Execution（运行时执行）
```

本契约解决五个问题：

1. 用户表达了什么行为意图？
2. 当前状态下系统允许做什么？
3. 哪个动作优先级最高？
4. 什么情况下必须停止、切换、回答或等待？
5. 什么情况下 AI 即使“能做”，也不允许做？

---

# 2. Core Principle｜核心原则

## 2.1 Semantic Action ≠ Policy Action

必须严格区分：

**Semantic Action（语义动作）**

> 用户想做什么。

与：

**Policy Action（策略动作）**

> 系统允许采取什么行为。

例如：

```text
用户：
“如果摩擦力不是 0 呢？”

↓ Semantic Action

WHAT_IF

↓ Policy

允许执行 SIMULATE

↓ State Transition

UNDERSTANDING → SIMULATION
```

因此：

> 用户表达不能直接决定系统动作。

中间必须经过 Policy Engine（策略引擎）。

---

# 3. Semantic Action Taxonomy V1｜语义动作分类 V1

V1 冻结以下语义动作。

| Semantic Action  | 中文   | 含义              |
| ---------------- | ---- | --------------- |
| QUESTION         | 提问   | 用户提出信息问题        |
| WHY              | 追问原因 | 用户要求解释原因        |
| HOW              | 追问方式 | 用户要求解释实现/过程     |
| WHAT_IF          | 假设变化 | 用户提出变量变化或假设     |
| COMPARE          | 比较   | 用户要求比较两个或多个对象   |
| VERIFY           | 验证   | 用户要求确认真实性/准确性   |
| DEEPEN           | 深入   | 用户要求更多细节        |
| SIMPLIFY         | 简化   | 用户要求降低复杂度       |
| REPEAT           | 重复   | 用户要求重新表达        |
| REFRAME          | 换个角度 | 用户要求从自身/其他角度解释  |
| CREATE           | 创造   | 用户希望产生一个可操作结果   |
| MODIFY           | 修改   | 用户要求修改当前结果      |
| CONTINUE         | 继续   | 用户希望继续当前体验      |
| CHANGE_DIRECTION | 换方向  | 用户拒绝当前方向并要求新的体验 |
| STOP             | 停止   | 用户明确结束当前行为      |
| DIRECT_ANSWER    | 直接回答 | 用户明确要求直接给答案     |
| KNOWN            | 已知   | 用户表示当前内容已经知道    |
| CORRECTION       | 纠正   | 用户指出系统理解错误      |

---

# 4. Semantic Action Priority｜语义动作优先级

并非所有 Semantic Action 权重相同。

V1 优先级：

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

原则：

> **用户控制类动作优先于内容推进类动作。**

因此：

```text
STOP > CONTINUE
CHANGE_DIRECTION > CONTINUE
DIRECT_ANSWER > EXPLAIN/ASK
CORRECTION > 原有推断
```

---

# 5. Action Normalization｜动作归一化

同一个用户意图可能有多种表达。

系统必须首先将自然语言归一化为 Semantic Action。

例如：

```text
“别说那么多，直接告诉我”
→ DIRECT_ANSWER

“答案是什么？”
→ DIRECT_ANSWER

“所以到底怎么回事？”
→ QUESTION / DIRECT_ANSWER
```

如果上下文已经明确用户要求答案：

```text
“所以到底怎么回事？”
→ DIRECT_ANSWER
```

而不是：

```text
→ ASK
```

---

# 6. Context-Aware Normalization｜上下文语义归一化

Semantic Action 不能只依赖当前句子。

解析顺序：

```text
L0 Current Turn
↓
L1 Experience State
↓
L2 Current Intent
↓
L3 Session Context
↓
L4 Relevant Memory
```

例如：

```text
用户：
“那如果速度再快一点？”

```

单独看是不完整的。

但如果当前 ExperienceState：

```text
current_topic = friction
current_stage = simulation
current_variables = {
    velocity: 1
}
```

则：

```text
WHAT_IF
target = velocity
change = increase
```

因此：

> Semantic Action 是“当前输入 + 当前状态”的结果，而不是单纯 NLP 分类。

---

# 7. Policy Action Taxonomy V1｜策略动作分类 V1

Policy Engine V1 允许以下动作：

| Policy Action     | 中文   |
| ----------------- | ---- |
| ANSWER            | 回答   |
| EXPLAIN           | 解释   |
| ASK               | 提问   |
| WAIT              | 等待用户 |
| SIMULATE          | 模拟   |
| CREATE            | 创建   |
| MODIFY            | 修改   |
| SEARCH            | 搜索   |
| BRANCH            | 进入分支 |
| CHANGE_EXPERIENCE | 更换体验 |
| SIMPLIFY          | 简化   |
| DEEPEN            | 深入   |
| REFRAME           | 换角度  |
| STOP              | 停止   |

注意：

> **SEARCH（搜索）不是用户体验类型，而是一种内部能力动作。**

同样：

> LLM 生成文本也不是 Policy Action。

---

# 8. Semantic Action → Policy Action Mapping｜语义动作到策略动作映射

V1 默认映射：

| Semantic Action  | Default Policy Action      |
| ---------------- | -------------------------- |
| QUESTION         | ANSWER                     |
| WHY              | EXPLAIN / ANSWER           |
| HOW              | EXPLAIN                    |
| WHAT_IF          | SIMULATE                   |
| COMPARE          | ANSWER / EXPLAIN           |
| VERIFY           | SEARCH / ANSWER            |
| DEEPEN           | DEEPEN                     |
| SIMPLIFY         | SIMPLIFY                   |
| REPEAT           | REPEAT equivalent response |
| REFRAME          | REFRAME                    |
| CREATE           | CREATE                     |
| MODIFY           | MODIFY                     |
| CONTINUE         | CONTINUE current runtime   |
| CHANGE_DIRECTION | CHANGE_EXPERIENCE          |
| STOP             | STOP                       |
| DIRECT_ANSWER    | ANSWER                     |
| KNOWN            | WAIT / DEEPEN / BRANCH     |
| CORRECTION       | REASSESS                   |

其中：

\*\*REASSESS（重新评估）\*\*不是新的长期 Action，而是 Policy Engine 的内部决策过程。

最终必须重新得到合法 Policy Action。

---

# 9. Policy Priority V1｜策略优先级

Policy Engine 必须严格遵循：

```text
0. Safety
1. Explicit User Direction
2. STOP / CHANGE
3. Current Experience Goal
4. Current Intent
5. Current Experience State
6. Current User State
7. Session Context
8. Short-term Memory
9. Long-term Memory
10. Novelty
```

其中：

> 长期记忆永远不能覆盖当前明确意图。

例如：

```text
长期偏好：用户经常喜欢物理内容

当前：
“今天不想看物理，给我别的。”

结果：

CHANGE_DIRECTION

而不是：

继续物理内容
```

---

# 10. Hard Policy Rules｜硬策略规则

以下规则属于 V1 Hard Rules（硬规则）。

## Rule 01｜明确指令优先

用户明确表达：

```text
“直接告诉我”
“换一个”
“好了”
“不要这个”
```

必须优先响应。

---

## Rule 02｜STOP 永远优先

任何状态下：

```text
STOP
```

必须：

```text
cancel current generation
cancel pending action
complete/exit runtime
```

不得：

```text
生成最后一句
推荐下一个体验
询问是否继续
```

---

## Rule 03｜CHANGE_DIRECTION 立即生效

用户说：

```text
“换一个”
“不是这个”
“我不想看这个”
```

系统不得继续完成旧体验。

必须：

```text
cancel current generation
reject current candidate
update experience state
select next candidate
```

---

## Rule 04｜能行动就不要询问

如果当前信息足以低风险执行：

```text
ACT
```

而不是：

```text
ASK
```

例如：

```text
“给我一个奇怪的问题。”

→ 直接生成体验
```

不允许：

```text
“你喜欢科学类还是历史类？”
```

---

## Rule 05｜高风险不确定性才允许 ASK

ASK 的触发条件：

```text
Required information missing
+
Different interpretations lead to materially different outcomes
+
Cannot safely choose default
```

否则：

```text
ACT
```

---

# 11. ASK Policy｜提问策略

ASK 是高成本动作。

V1 默认：

### Intent Capture

最多：

```text
1 active clarification
```

### Experience Runtime

默认：

```text
0 proactive clarification
```

即：

> 体验开始以后，AI 默认不主动盘问用户。

只有当用户目标无法继续执行时，才允许 ASK。

---

# 12. Clarification Budget｜澄清预算

每个 Intent Resolution：

```text
max_active_clarifications = 1
```

每次 Experience：

```text
default_proactive_questions = 0
```

如果一个问题无法解决歧义：

> 不允许连续生成问题列表。

应该：

```text
choose safe default
OR
change experience
OR
stop
```

而不是：

```text
Question 1
→ Question 2
→ Question 3
→ Question 4
```

---

# 13. Direct Answer Policy｜直接回答策略

当 Semantic Action = DIRECT_ANSWER：

默认：

```text
Policy Action = ANSWER
```

不得为了“体验感”故意：

```text
ASK
TEASE
WITHHOLD
BRANCH
```

例如：

```text
用户：
“黑洞为什么会有事件视界？直接告诉我。”

→ ANSWER
```

而不是：

```text
“你觉得可能是什么原因？”
```

---

# 14. WAIT Policy｜等待策略

WAIT 是正式的 Policy Action。

WAIT 表示：

> 当前一步已经完成，下一步应该由用户决定。

例如：

```text
AI：
摩擦力消失后，物体不会自然减速。

WAIT
```

而不是：

```text
AI：
摩擦力消失后……
↓
继续解释
↓
继续举例
↓
继续提出问题
↓
自动进入模拟
```

WAIT 是对用户 Agency（自主权）的保护。

---

# 15. State-Aware Eligibility｜状态相关动作资格

Policy Action 必须受到 State Machine V1 限制。

例如：

### ENTERING

允许：

```text
START
CHANGE
STOP
```

不允许：

```text
MODIFY
SIMULATE
```

---

### UNDERSTANDING

允许：

```text
ANSWER
EXPLAIN
SIMULATE
BRANCH
CREATE
CHANGE_EXPERIENCE
STOP
WAIT
```

---

### SIMULATION

允许：

```text
SIMULATE
EXPLAIN
ANSWER
BRANCH
CREATE
CHANGE_EXPERIENCE
STOP
WAIT
```

---

### CREATION

允许：

```text
MODIFY
CREATE
ANSWER
EXPLAIN
STOP
WAIT
```

---

### COMPLETION

只允许：

```text
STOP
```

以及由用户主动触发的新 Intent。

禁止系统自行继续当前 Experience。

---

# 16. Agency Gate｜自主权闸门

任何最终 Action 必须通过 Agency Gate。

Action 如果满足以下任一条件，必须拒绝：

1. 用户明确要求停止。
2. 与当前明确意图冲突。
3. 主要目的是延长 Session。
4. 依赖未经授权的长期推断。
5. 用户无法合理理解其出现原因。
6. 存在更低干扰的等价方案。
7. 系统试图替用户做本应由用户决定的选择。
8. Action 会阻止用户自然退出。

Agency Gate 不是推荐模块。

它是：

> **所有 Runtime Action 的最终约束层。**

---

# 17. Policy Decision Logic｜策略决策逻辑

V1 使用：

**Rule-based Policy + Structured LLM Classification + Simple Scoring**

而不是：

- Reinforcement Learning
- Deep Ranking
- Session-time optimization
- End-to-end LLM control

决策逻辑：

```text
Semantic Action
↓
Hard Rule Check
↓
State Eligibility Check
↓
Intent Alignment Check
↓
Agency Gate
↓
Candidate Actions
↓
Policy Scoring
↓
Select Action
↓
Validate
↓
State Transition
```

---

# 18. Policy Scoring｜策略评分

V1 可以使用：

```text
PolicyScore =
IntentFulfillment
+ GoalProgress
+ Agency
+ ExperienceFit
+ Reliability
- Friction
- UnnecessaryIntervention
- AgencyRisk
```

其中：

### IntentFulfillment

是否满足当前用户目标。

### GoalProgress

是否推进当前体验目标。

### Agency

用户是否仍然拥有方向控制权。

### ExperienceFit

动作是否适合当前体验阶段。

### Reliability

执行该动作的可靠性。

### Friction

是否增加不必要的认知/交互成本。

### UnnecessaryIntervention

是否在用户没有需要时主动介入。

### AgencyRisk

是否可能替用户做决定或阻碍退出。

---

# 19. Action Selection Principle｜动作选择原则

Policy Engine 不选择：

> “最能让用户继续使用的动作。”

而选择：

> **“当前最符合用户目标且干扰最小的合法动作。”**

因此：

```text
Best Action ≠ Most Engaging Action
```

而是：

```text
Best Action =
Maximum User Value
under
Policy + State + Agency Constraints
```

---

# 20. PolicyDecision Schema｜策略决策对象

V1：

```json
{
  "decision_id": "decision_xxx",
  "policy_version": "policy_v1.0.0",

  "input": {
    "event_id": "evt_xxx",
    "semantic_action": "WHAT_IF"
  },

  "context": {
    "intent_id": "intent_xxx",
    "experience_id": "frictionless_world_v1",
    "experience_state": "UNDERSTANDING",
    "experience_version": "1.0.0"
  },

  "selected_action": "SIMULATE",

  "reason": {
    "primary": "semantic_action",
    "secondary": "current_experience_goal",
    "supporting": [
      "state_allows_simulation"
    ],
    "rejected": []
  },

  "constraints": {
    "depth": "medium",
    "interaction": "medium",
    "clarification_allowed": false
  },

  "state_transition": {
    "from": "UNDERSTANDING",
    "event": "WHAT_IF",
    "to": "SIMULATION"
  },

  "requires_tool": false,

  "confidence": 0.95
}
```

---

# 21. Policy Reason｜策略理由

Reason 必须回答：

> 为什么系统做了这个动作？

至少包含：

```text
primary
secondary
supporting
rejected
```

例如：

```json
{
  "primary": "explicit_user_direction",
  "secondary": "current_experience_goal",
  "supporting": [
    "direct_answer_requested"
  ],
  "rejected": [
    {
      "action": "ASK",
      "reason": "unnecessary_clarification"
    }
  ]
}
```

理由必须描述产品决策依据。

不得记录：

```text
“LLM觉得这样比较好。”
```

---

# 22. Forbidden Actions｜禁止动作

以下行为在 V1 明确禁止。

## 22.1 未授权自动推荐

用户没有请求：

```text
不要自动生成下一体验。
```

---

## 22.2 Engagement-driven continuation

不得因为：

```text
用户停留时间长
用户互动多
用户快退出
```

而自动追加体验。

---

## 22.3 Forced clarification

不得为了提高理解精度而：

```text
连续提问
强制用户选择
要求用户填写参数
```

---

## 22.4 Memory override

不得因为长期偏好：

```text
覆盖当前明确意图
```

---

## 22.5 Hidden policy

不得存在：

```text
前端隐藏推荐逻辑
Prompt 中隐藏产品策略
客户端自行判断下一动作
```

---

## 22.6 LLM direct control

LLM 不得直接：

```text
修改 ExperienceState
修改 Memory
决定 completion
绕过 Policy Engine
决定 Authorization
```

---

# 23. Exception Handling｜异常处理

## Case A｜Semantic Action 不确定

如果：

```text
confidence < threshold
```

首先检查是否可以安全执行默认动作。

可以：

```text
ACT
```

否则：

```text
ASK
```

---

## Case B｜多个 Action 同时成立

使用优先级：

```text
STOP
>
CHANGE
>
DIRECT_ANSWER
>
CORRECTION
>
USER_GOAL
>
EXPERIENCE_PROGRESS
>
STATE
>
MEMORY
>
NOVELTY
```

---

## Case C｜Policy 无法决策

不得让 LLM 自由决定。

进入：

```text
SAFE_WAIT
```

或者：

```text
MINIMAL_CLARIFICATION
```

具体取决于是否存在安全默认路径。

---

## Case D｜State Conflict

如果：

```text
state_version
```

已经过期：

```text
reject decision
```

重新读取最新状态。

不得覆盖新状态。

---

# 24. Override｜策略覆盖

用户拥有最高产品级 Override（覆盖）能力。

例如：

```text
系统：
准备继续当前体验。

用户：
“不要继续。”

```

立即：

```text
STOP
```

系统不得以：

```text
experience_goal
recommendation
memory
policy_score
```

覆盖用户明确指令。

---

# 25. Policy Trace｜策略决策追踪

每一次 Policy Decision 必须能够回答：

```text
Input
↓
Semantic Action
↓
State
↓
Intent
↓
Candidate Actions
↓
Rejected Actions
↓
Selected Action
↓
Reason
↓
State Transition
↓
Outcome
```

Decision Trace 至少包含：

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

---

# 26. Interaction with State Machine｜与状态机的关系

两者职责必须严格分离。

### State Machine

回答：

> “这个状态变化是否合法？”

### Policy Engine

回答：

> “现在应该选择哪个动作？”

因此：

```text
Policy:
UNDERSTANDING
+
WHAT_IF
→
SIMULATE
```

State Machine：

```text
UNDERSTANDING
+
WHAT_IF
+
SIMULATE
→
SIMULATION
```

如果 State Machine 不允许：

```text
Policy Decision = invalid
```

Policy Engine 不得绕过状态机。

---

# 27. Interaction with LLM｜与大模型的关系

LLM 可以：

- 识别 Semantic Action
- 解析引用
- 提出候选解释
- 生成内容
- 提出 Candidate Actions
- 提供 confidence
- 提供 state update proposal

LLM 不可以：

- 最终决定 Policy
- 直接修改 Runtime State
- 决定 Memory 写入
- 决定用户是否完成
- 绕过 Agency Gate
- 绕过 State Machine

核心原则：

> **LLM proposes. Policy decides. Runtime executes.**

中文：

> **大模型提出建议，策略层做决定，运行时负责执行。**

---

# 28. Interaction with Memory｜与记忆的关系

Memory 只允许作为：

```text
contextual signal
```

参与 Policy。

Memory 不允许成为：

```text
hard instruction
```

例如：

```text
Memory：
用户经常喜欢小游戏。

Current Intent：
“今天我想深入了解黑洞。”

```

Policy：

```text
follow current intent
```

而不是：

```text
CREATE_GAME
```

---

# 29. Golden Cases｜黄金案例

## Case 01｜直接回答

```text
User:
“直接告诉我。”

Semantic:
DIRECT_ANSWER

Policy:
ANSWER

Result:
直接回答。
```

---

## Case 02｜为什么

```text
User:
“为什么？”

Semantic:
WHY

Policy:
EXPLAIN

Result:
基于当前 ExperienceState 回答。
不得重复整个背景。
```

---

## Case 03｜假设变化

```text
User:
“如果摩擦力不是 0 呢？”

Semantic:
WHAT_IF

Policy:
SIMULATE

Transition:
UNDERSTANDING → SIMULATION
```

---

## Case 04｜创建

```text
User:
“这个可以做成一个小游戏。”

Semantic:
CREATE

Policy:
CREATE

Transition:
UNDERSTANDING → CREATION

Requirement:
继承当前上下文。
不得要求用户重新描述主题。
```

---

## Case 05｜换一个

```text
User:
“换一个。”

Semantic:
CHANGE_DIRECTION

Policy:
CHANGE_EXPERIENCE

Required:
cancel current generation
reject current candidate
select next candidate
```

---

## Case 06｜停止

```text
User:
“好了。”

Semantic:
STOP

Policy:
STOP

Required:
end current experience
cancel generation
no recommendation
no follow-up question
```

---

## Case 07｜纠正

```text
User:
“不是这个意思。”

Semantic:
CORRECTION

Policy:
REASSESS

Requirement:
删除错误 inference。
保留仍然有效的 context。
重新评估当前 Intent。
```

---

## Case 08｜低信息表达

```text
User:
“我不知道。”

如果存在低风险默认体验：

→ ACT

否则：

→ minimal clarification
```

禁止直接进入：

```text
长问卷
```

---

# 30. Acceptance Tests｜验收测试

## AT-01 Explicit Direction

输入：

```text
“直接告诉我答案。”
```

Expected：

```text
Semantic Action = DIRECT_ANSWER
Policy Action = ANSWER
```

---

## AT-02 Stop Priority

任意 ExperienceState 输入：

```text
“好了。”
```

Expected：

```text
Policy Action = STOP
```

不得：

```text
ASK
CONTINUE
CHANGE_EXPERIENCE
```

---

## AT-03 Change Priority

生成过程中：

```text
“换一个。”
```

Expected：

```text
cancel generation
CHANGE_EXPERIENCE
```

---

## AT-04 State Eligibility

当前：

```text
CREATION
```

用户：

```text
“修改出口位置。”
```

Expected：

```text
MODIFY
```

---

## AT-05 Invalid Action

当前：

```text
COMPLETION
```

系统试图：

```text
DEEPEN
```

Expected：

```text
Policy Reject
```

---

## AT-06 Memory Cannot Override Intent

Long-term Memory：

```text
喜欢物理
```

Current Intent：

```text
“今天不想看物理。”
```

Expected：

```text
当前意图优先。
```

---

## AT-07 No Unnecessary Clarification

输入：

```text
“给我一个奇怪的问题。”
```

Expected：

```text
ACT
```

不得：

```text
ASK
```

---

## AT-08 Runtime Question Budget

当前 Experience：

```text
ACTIVE
```

没有必要澄清。

Expected：

```text
不主动 ASK。
```

---

## AT-09 Direct Answer Override

当前体验有推荐的探索路径。

用户：

```text
“不要模拟，直接告诉我。”
```

Expected：

```text
ANSWER
```

不得：

```text
SIMULATE
```

---

## AT-10 Stale State

Decision 基于：

```text
state_version = 12
```

Runtime 当前：

```text
state_version = 13
```

Expected：

```text
reject stale decision
```

不得覆盖 version 13。

---

# 31. Versioning｜版本管理

Policy 必须显式版本化：

```text
policy_v1.0.0
```

其中：

```text
MAJOR
MINOR
PATCH
```

### MAJOR

改变：

- Action taxonomy
- Policy priority
- Agency rules
- State eligibility
- hard rules

必须重新进行完整 Acceptance。

### MINOR

增加：

- 新的可选规则
- 新的解释字段
- 新的非破坏性候选能力

### PATCH

修复：

- bug
- schema typo
- logging issue
- non-behavioral implementation defect

---

# 32. No Silent Policy Changes｜禁止静默策略变化

以下任何变化都必须产生 Change ID：

```text
Prompt 改动
Semantic Action classifier 改动
Policy rule 改动
Scoring 权重改动
ASK threshold 改动
Agency threshold 改动
State eligibility 改动
```

不得出现：

```text
“只是改了 Prompt，所以不用升级版本。”
```

如果行为发生变化：

> 就是 Product Behavior Change（产品行为变化）。

必须：

```text
Change ID
Reason
Owner
Version
Tests
Acceptance
```

---

# 33. Product Boundary｜产品边界

本契约明确不负责：

- LLM prompt 具体写法
- 模型供应商选择
- 搜索供应商选择
- UI 视觉设计
- 具体内容生成质量
- 数据库存储实现
- API transport implementation
- Ranking Model
- 推荐模型训练

这些将在后续 Engineering Contract 中定义。

---

# 34. Definition of Done｜完成定义

Action & Policy Contract V1 只有满足以下条件才算完成：

```text
[ ] Semantic Action taxonomy frozen
[ ] Semantic Action definitions frozen
[ ] Action normalization defined
[ ] Policy Action taxonomy frozen
[ ] Semantic → Policy mapping defined
[ ] Policy priority defined
[ ] Hard rules defined
[ ] ASK policy defined
[ ] Clarification budget defined
[ ] WAIT behavior defined
[ ] STOP behavior defined
[ ] CHANGE behavior defined
[ ] Direct Answer behavior defined
[ ] State-aware eligibility defined
[ ] Agency Gate defined
[ ] Policy scoring defined
[ ] PolicyDecision schema defined
[ ] Decision Trace defined
[ ] Forbidden actions defined
[ ] Exception handling defined
[ ] Override rules defined
[ ] State Machine boundary defined
[ ] LLM boundary defined
[ ] Memory boundary defined
[ ] Golden Cases defined
[ ] Acceptance Tests defined
[ ] Versioning defined
[ ] No Silent Change rule defined
```

---

# 35. Final Contract｜最终契约

V1 最重要的工程约束冻结为：

```text
USER
 ↓
Semantic Action
 ↓
POLICY ENGINE
 ↓
Allowed Action
 ↓
STATE MACHINE
 ↓
RUNTIME
 ↓
USER
```

并严格遵守：

```text
LLM ≠ Policy
LLM ≠ State
LLM ≠ Memory
LLM ≠ Authorization

Frontend ≠ Policy
Frontend ≠ State Owner

Memory ≠ Current Intent

Engagement ≠ Product Goal

WAIT ≠ Failure

STOP ≠ Failure

CHANGE ≠ Error
```

最终原则：

> **系统不是为了永远知道下一步该说什么，而是为了在每一个时刻知道“现在什么动作最应该发生”，并且知道“哪些动作绝对不应该发生”。**
