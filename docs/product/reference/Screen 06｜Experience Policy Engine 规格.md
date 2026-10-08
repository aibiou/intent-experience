

# Screen 06｜Experience Policy Engine

## 0. 定义

\*\*Experience Policy Engine（体验策略引擎）\*\*不是推荐算法，也不是 LLM Prompt。

它负责回答一个核心问题：

> **在当前用户状态、当前意图、当前体验状态下，AI 下一步“应该做什么”？**

它决定：

- 现在应该回答吗？
- 应该继续解释吗？
- 应该问用户吗？
- 应该让用户操作吗？
- 应该搜索吗？
- 应该生成吗？
- 应该切换体验吗？
- 应该进入创造吗？
- 应该等待吗？
- 应该结束吗？

核心原则：

> **LLM 负责产生能力，Policy 负责决定行为。**

---

# 1. 为什么必须独立出来

如果系统只有：

```text
User
 ↓
LLM
 ↓
Response
```

那么产品行为实际上由模型决定。

今天模型可能：

> “我给你讲讲这个问题。”

下一次可能：

> “你想继续了解吗？”

再下一次可能：

> “这里还有三个相关问题。”

最终产品行为会不断漂移。

而我们需要的是：

```text
User
 ↓
Intent Engine
 ↓
Experience State
 ↓
Policy Engine
 ↓
决定下一步行为
 ↓
LLM / Search / Tool
 ↓
Experience Runtime
```

所以：

> **模型是能力层，Policy 是产品行为层。**

这两者必须解耦。

---

# 2. Policy Engine 的第一原则

Policy Engine 不追求：

> “让用户尽可能继续。”

而追求：

> **“让当前体验尽可能准确地服务用户当前意图。”**

因此：

```text
用户想继续
→ 继续

用户想深入
→ 深入

用户想创造
→ 创造

用户想换方向
→ 换方向

用户已经得到答案
→ 可以结束

用户不想继续
→ 结束
```

不存在：

```text
用户准备离开
↓
AI 强行抛出一个新问题
↓
重新刺激好奇心
↓
延长 Session
```

这类行为在产品设计层面直接禁止。

---

# 3. Policy Engine 的输入

Policy Engine 接收六类状态。

```text
Policy Input
│
├── User Intent
├── User State
├── Experience State
├── Interaction History
├── Candidate Experience
└── System Constraints
```

---

## 3.1 User Intent

例如：

```json
{
  "goal": "understand",
  "depth": "medium",
  "interaction": "low",
  "novelty": "medium",
  "duration": "short",
  "energy": "low",
  "confidence": 0.94
}
```

---

## 3.2 User State

例如：

```json
{
  "energy": "low",
  "attention": "medium",
  "openness": "medium",
  "friction_tolerance": "low"
}
```

注意：

**State 不能覆盖 Intent。**

例如：

> “我今天很累，但我就是想搞懂量子力学。”

Policy 不应该：

```text
energy = low
→ 自动给简单内容
```

正确行为：

```text
goal = deep_understanding
depth = high
energy = low

→ 内容深度保持高
→ 交互复杂度降低
→ 信息呈现更清晰
```

---

# 4. Experience State

Policy 最重要的输入之一。

例如：

```json
{
  "experience_id": "winter_tree",
  "stage": "understanding",
  "current_topic": "dormancy",
  "known_facts": [],
  "unresolved_questions": [
    "tree_restart_signal"
  ],
  "user_hypotheses": [],
  "user_actions": [],
  "current_variables": {},
  "branch": null,
  "completion": false
}
```

Policy 必须知道：

> **体验现在进行到哪里了。**

否则 AI 只能根据聊天历史猜。

---

# 5. Interaction History

不是保存全部聊天。

只保留对当前决策有用的信息。

例如：

```json
{
  "last_actions": [
    "QUESTION",
    "WHY"
  ],
  "depth_changes": [
    "DEEPEN"
  ],
  "rejections": [],
  "corrections": [],
  "direction_changes": 0
}
```

---

# 6. Candidate Experience

当需要选择下一体验时，Policy 可以收到候选集合：

```json
[
  {
    "id": "simulation_01",
    "type": "simulation",
    "topic": "climate"
  },
  {
    "id": "creation_02",
    "type": "creation",
    "topic": "game"
  }
]
```

Policy 决定：

> 哪一个允许进入 Runtime。

---

# 7. System Constraints

包括：

```text
Safety
Trust
Privacy
User Control
Tool Availability
Latency
Cost
Content Reliability
```

其中：

**User Control 是硬约束，不是优化项。**

---

# 8. Policy 的 Action Space

V1 不允许无限自由行动。

定义固定 Action Space：

```text
ANSWER
EXPLAIN
ASK
WAIT
SIMULATE
CREATE
SEARCH
BRANCH
CHANGE_EXPERIENCE
SIMPLIFY
DEEPEN
REFRAME
STOP
```

---

# 9. 每个 Action 的含义

## ANSWER

用户明确提出问题。

例如：

> “它为什么冬天不长？”

Policy：

```text
ANSWER
```

不能为了保持探索感而故意不回答。

---

## EXPLAIN

用户需要理解机制。

例如：

> “这到底是怎么工作的？”

Policy：

```text
EXPLAIN
```

---

## ASK

只有在：

> **缺少的信息会明显影响下一步选择**

时才允许 ASK。

例如：

> “我想做个游戏。”

如果存在两个完全不同的方向：

```text
自己玩
做给别人
```

可以问。

但如果缺失的信息并不影响第一步：

> 不允许问。

---

# 10. ASK 的严格预算

V1：

```text
单次 Intent Capture：
最多 1 次主动澄清

Experience Runtime：
默认 0 次主动澄清
```

因为进入 Experience 后，系统应该优先：

> **行动，而不是继续采访用户。**

---

# 11. WAIT

这是非常重要的 Action。

大多数 AI 产品没有真正的 WAIT。

它们倾向：

```text
AI 输出
→ AI 再输出
→ AI 再推荐
→ AI 再问
```

我们必须允许：

```text
AI 输出
↓
WAIT
↓
用户决定下一步
```

例如：

> “有些树在冬天进入休眠状态。它们降低代谢活动，把资源保存下来。”

然后：

```text
WAIT
```

不自动追加：

> “你想知道它怎么重新苏醒吗？”

---

# 12. SIMULATE

当用户提出：

> “如果温度高一点呢？”

如果当前体验存在可操作变量：

```text
temperature
```

Policy：

```text
WHAT_IF
→ SIMULATE
```

而不是：

```text
WHAT_IF
→ 普通文字回答
```

因为此时用户已经从：

> 理解

进入：

> 操作

---

# 13. CREATE

当用户从理解转向创造：

> “那我能不能做一个这样的东西？”

Policy：

```text
CREATE
```

这意味着：

```text
Understanding Runtime
        ↓
Creation Runtime
```

而不是回 Home。

这是产品非常重要的能力。

---

# 14. SEARCH

Search 不是默认能力。

只有满足以下条件之一：

### A. 用户明确要求验证

> “真的假的？”

### B. 信息可能发生变化

例如：

- 最新事件
- 当前数据
- 当前价格
- 当前政策

### C. 模型自身不确定

并且事实准确性对用户目标重要。

---

# 15. Search 不应该改变体验结构

错误：

```text
用户问一个问题
↓
Search
↓
打开一堆结果
↓
用户离开 Experience
```

正确：

```text
User Question
↓
Policy = VERIFY
↓
Search
↓
提取可靠结论
↓
回到当前 Experience
↓
继续体验
```

Search 是能力，不是目的。

---

# 16. BRANCH

Branch 是 Experience Runtime 最重要的能力之一。

例如：

用户：

> “那如果这个树一直很冷呢？”

当前 Experience：

```text
winter_tree
```

Policy 判断：

```text
WHAT_IF
+
variable exists
+
current experience supports simulation
```

于是：

```text
winter_tree
   ↓
branch: extreme_cold
```

而不是重新创建一个新聊天。

---

# 17. CHANGE_EXPERIENCE

触发条件：

```text
“换一个”
“不是这个”
“我不想看这个了”
“没意思”
```

但这些表达强度不同。

Policy 要区分：

### “换一个”

当前候选被拒绝。

```text
candidate rejected
```

### “不想看植物”

形成临时负向约束：

```text
topic_constraint:
avoid = botany
```

### “我以后都不想看植物”

才可能形成长期偏好。

这三者绝不能混在一起。

---

# 18. STOP

以下表达直接触发：

```text
好了
不用了
先这样
我知道了
就到这里
```

Policy：

```text
STOP
```

不要：

```text
“当然，不过还有一个有趣的点……”
```

不要。

---

# 19. Policy Decision Pipeline

完整流程：

```text
User Input
     ↓
Semantic Action
     ↓
Experience State
     ↓
Intent State
     ↓
Check User Control
     ↓
Check Completion
     ↓
Check Required Information
     ↓
Select Runtime Action
     ↓
Execute
     ↓
Update State
```

可以抽象成：

```text
Policy(
    intent,
    state,
    experience,
    interaction,
    constraints
)
→
action
```

---

# 20. Decision Priority

Policy 决策必须有固定优先级。

### Priority 0 — Safety

如果存在安全问题：

```text
Safety Policy
```

优先级最高。

---

### Priority 1 — Explicit User Direction

例如：

> “直接告诉我。”

直接回答。

---

### Priority 2 — User Stop / Change

例如：

> “换一个。”

立即改变方向。

---

### Priority 3 — Current Experience Goal

用户正在：

```text
understand
simulate
create
explore
```

Policy 应优先维持当前目标。

---

### Priority 4 — Current State

例如：

```text
low energy
```

调整交互成本。

---

### Priority 5 — Recent Context

例如用户刚刚连续探索某个主题。

---

### Priority 6 — Long-term Preference

只作为弱信号。

---

### Priority 7 — Novelty

最后才考虑新鲜感。

这意味着：

> **新奇不能战胜用户明确意图。**

---

# 21. 一个非常重要的 Policy 原则

定义：

```text
Explicit Intent > Optimization
```

也就是：

> 用户明确说出来的东西，优先于系统认为“可能更有意思”的东西。

例如：

用户：

> “我想深入理解黑洞。”

系统发现用户过去喜欢轻松内容。

不能：

> “给你一个轻松有趣的黑洞故事。”

应该：

> 进入深度理解体验。

---

# 22. Completion Policy

体验完成不能由：

```text
内容是否全部讲完
```

决定。

应该由：

```text
User Goal Fulfilled
```

决定。

例如用户目标：

> “我只想知道为什么树冬天看起来死了。”

回答：

> “因为它进入休眠状态。”

用户：

> “懂了。”

那么：

```text
completion = true
```

即使还有 30 个相关知识点，也应该结束。

---

# 23. Completion Model

```json
{
  "goal": "understand_winter_dormancy",
  "goal_satisfaction": 0.94,
  "unresolved_questions": [],
  "user_signal": "done",
  "completion": true
}
```

---

# 24. Policy 不允许使用的优化目标

V1 明确禁止：

```text
maximize_session_time
maximize_messages
maximize_clicks
maximize_questions
maximize_content_consumption
maximize_return_frequency
```

这些指标最多作为诊断指标。

不能成为 Policy Reward。

---

# 25. Policy Reward

第一阶段使用：

```text
Experience Value
=
Intent Fulfillment
+
Experience Fit
+
Agency
+
Understanding
+
Creation Progress
```

而不是：

```text
Engagement
```

---

# 26. 一个更精确的目标函数

概念上：

```text
Policy Score =
w1 * IntentFulfillment
+
w2 * GoalProgress
+
w3 * Agency
+
w4 * ExperienceFit
+
w5 * Reliability
-
w6 * Friction
-
w7 * UnnecessaryIntervention
```

其中：

```text
UnnecessaryIntervention
```

尤其重要。

AI 主动做得越多，不代表体验越好。

---

# 27. Intervention Budget

为 AI 建立：

> **Intervention Budget（干预预算）**

V1 可以定义：

```text
主动提问：低预算
主动切换：极低预算
主动推荐：极低预算
主动追加内容：低预算
主动结束：允许
等待用户：高优先级
```

换句话说：

> **AI 的默认状态不是“行动”，而是“根据需要行动”。**

---

# 28. Policy Example 01

用户：

> “我想知道为什么天空是蓝的。”

Intent：

```text
goal = understand
depth = medium
```

Policy：

```text
EXPLAIN
```

流程：

```text
Explain Rayleigh scattering
↓
WAIT
```

不自动：

```text
“顺便我们还可以讲日落为什么是红的。”
```

---

# 29. Policy Example 02

用户：

> “为什么天空是蓝的？”

AI 解释后：

> “那为什么日落又变红？”

Semantic Action：

```text
QUESTION
```

Context：

```text
current_topic = sky_color
```

Policy：

```text
ANSWER
```

继续当前 Experience。

不是：

```text
new experience
```

---

# 30. Policy Example 03

用户：

> “如果大气厚一倍呢？”

Semantic Action：

```text
WHAT_IF
```

Policy：

```text
SIMULATE
```

进入：

```text
simulation_stage
```

---

# 31. Policy Example 04

用户：

> “我想把这个做成一个小游戏。”

Semantic Action：

```text
CREATE
```

Policy：

```text
CREATE
```

Runtime：

```text
Understanding
↓
Creation
```

用户无需重新描述：

> “我想做一个关于天空颜色的小游戏。”

因为 Experience State 已经知道上下文。

---

# 32. Policy Example 05

用户：

> “直接告诉我。”

Policy：

```text
DIRECT_ANSWER
```

系统必须直接回答。

这是一个硬规则：

> **好奇心不能成为隐藏答案的理由。**

---

# 33. Policy Example 06

用户：

> “换一个。”

Policy：

```text
CHANGE_EXPERIENCE
```

但不是：

```text
random()
```

而是：

```text
Rejected Candidate
↓
Infer rejection scope
↓
Update candidate constraints
↓
Generate candidates
↓
Select next experience
```

---

# 34. Candidate Selection

候选选择顺序：

```text
1. Explicit Intent
2. Current Experience State
3. Current State
4. Recent Context
5. Stable Preference
6. Novelty
```

例如：

用户：

> “我现在很累，给我找点奇怪的东西。”

正确：

```text
奇怪
+
低认知负担
```

不是：

```text
普通轻松内容
```

也不是：

```text
高强度知识
```

---

# 35. “换一个”的 Candidate Policy

第一次：

```text
avoid exact topic
```

第二次：

```text
broaden experience type
```

第三次：

```text
reduce cognitive burden
```

第四次：

```text
Ask minimal clarification
```

例如：

> “你是想换主题，还是连这种形式也不想要？”

这是第一次真正值得询问。

---

# 36. Policy Output Contract

Policy 不直接输出最终 UI 文案。

输出结构：

```json
{
  "action": "SIMULATE",

  "reason": {
    "semantic_action": "WHAT_IF",
    "goal_progress": "high",
    "experience_support": true
  },

  "target": {
    "experience_id": "sky_color",
    "variable": "atmosphere_density"
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

然后：

```text
Experience Runtime
```

决定如何呈现。

---

# 37. Policy 与 LLM 的边界

必须严格分开。

### LLM 可以：

```text
理解语言
生成解释
生成候选
提出模拟结果
总结
转换表达
```

### LLM 不应该直接决定：

```text
是否继续
是否追问
是否推荐
是否改变体验
是否保存长期记忆
是否结束
是否调用高风险工具
```

这些由：

```text
Policy
```

决定。

---

# 38. Policy 与 Frontend 的边界

Frontend 不负责：

```text
判断用户意图
判断是否搜索
判断是否继续
判断是否进入创造
```

Frontend 只负责：

```text
Render
Input
Interaction
Animation
State Display
```

---

# 39. 完整架构

```text
                         USER
                           │
                           ▼
                    Input Layer
                           │
                           ▼
                    Intent Engine
                           │
                           ▼
                  Experience State
                           │
                           ▼
                ┌──────────────────┐
                │ Experience Policy│
                │      Engine      │
                └────────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
        LLM            Search          Tools
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Response Validator
                         │
                         ▼
                 Experience Runtime
                         │
                         ▼
                        USER
                         │
                         ▼
                    State Update
```

---

# 40. Response Validator

Policy 选完 Action 后，生成结果不能直接给用户。

需要 Validator。

检查：

```text
Fact accuracy
Uncertainty
Policy compliance
Intent alignment
Experience continuity
Safety
Length
Cognitive load
```

例如 Policy：

```text
ANSWER
```

LLM 却回答了一大段并追加三个问题。

Validator 应识别：

```text
Unnecessary continuation
```

然后裁剪。

---

# 41. Policy State Machine

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

用户输入后：

```text
WAIT
 ↓
NEW_INPUT
 ↓
ASSESS
```

---

# 42. Interrupt Handling

这是 V1 必须做的。

例如：

```text
AI 正在生成
        ↓
用户：“换一个”
        ↓
CANCEL_GENERATION
        ↓
CANCEL_CURRENT_ACTION
        ↓
UPDATE_POLICY_STATE
        ↓
SELECT_NEW_EXPERIENCE
```

不能：

```text
等待原回答生成完成
↓
再处理“换一个”
```

用户控制优先。

---

# 43. Policy 的三个状态

每一个 AI 行动必须记录：

```text
WHY
WHAT
RESULT
```

例如：

```json
{
  "policy_action": "SIMULATE",

  "why": "user_asked_what_if",

  "what": "simulate_temperature_change",

  "result": "simulation_started"
}
```

这为未来的：

> “为什么给我这个？”

提供基础。

---

# 44. Explainability

用户问：

> “为什么给我这个？”

不要暴露：

```text
embedding
ranking score
model probability
```

而是生成用户能理解的解释：

> “因为你刚才说想找一个奇怪的问题，而且你不想花太多时间。我选了一个可以很快进入、也可以继续深入的问题。”

并区分：

```text
明确知道：
你刚才说了……

系统推测：
我猜你现在……

不确定：
如果我理解错了，可以直接换一个。
```

---

# 45. Policy Logging

记录：

```text
policy_decision
policy_reason
input_semantic_action
experience_state_before
experience_state_after
action
confidence
tool_used
user_override
```

不记录：

```text
所有原始输入的无限历史
所有微交互
所有无意义行为
```

数据应该服务于：

> 改善体验。

而不是：

> 尽可能收集用户。

---

# 46. Policy Metrics

V1 核心指标：

### 1. Policy Accuracy

AI 选择的行为是否正确。

---

### 2. Unnecessary Intervention Rate

不必要主动干预比例。

这个指标越低越好。

---

### 3. User Override Rate

用户需要纠正 AI 决策的比例。

---

### 4. Recovery Success

AI 被纠正后能否正确恢复。

---

### 5. Intent Fulfillment

用户目标是否完成。

---

### 6. Agency Score

用户是否感觉自己掌控方向。

---

### 7. Completion Accuracy

系统是否在正确的时间结束体验。

---

### 8. Context Continuity

体验切换时上下文是否被正确保留。

---

# 47. 一个重要的新指标：Policy Regret

定义：

> **如果用户没有主动纠正，系统是否做了一个事后看来不应该做的动作？**

例如：

用户：

> “我就想知道答案。”

AI：

> “在告诉你之前，我们先做个小实验……”

这就是：

```text
Policy Regret = high
```

虽然用户可能继续了，但这是错误行为。

---

# 48. Agency Violation

建立硬指标：

```text
Agency Violation
```

包括：

```text
用户要求停止 → AI继续
用户要求答案 → AI故意隐藏
用户要求换方向 → AI阻拦
用户纠正 → AI不接受
用户未授权 → AI主动扩大任务
```

这些不应该被 Engagement 数据“抵消”。

即使：

```text
session_time ↑
```

也仍然是失败。

---

# 49. Policy V1 不做 ML

第一版不要马上训练复杂 Policy Model。

采用：

```text
Rules
+
Structured LLM Classification
+
Experience Templates
```

例如：

```text
IF user_action == STOP
→ STOP

IF user_action == DIRECT_ANSWER
→ ANSWER

IF user_action == WHAT_IF
AND variable_exists
→ SIMULATE

IF goal == CREATE
→ CREATE
```

先把行为边界跑稳定。

---

# 50. 第二阶段再学习

积累足够数据后再考虑：

```text
Policy Learning
```

训练目标不是：

> “什么最能留住用户？”

而是：

> “在什么状态下，什么行动最有可能帮助用户完成目标，同时保持 agency？”

这会形成真正长期的产品数据资产。

---

# 51. V1 Policy Rulebook

最终压缩成 12 条硬规则：

```text
01. 用户明确说什么，优先做什么。
02. 能行动就不要无意义提问。
03. 一个澄清问题解决不了就不要连续追问。
04. 用户问答案，直接回答。
05. 用户想换方向，立即允许。
06. 用户想停止，立即停止。
07. 当前体验上下文优先于聊天历史。
08. State 调节交互成本，不覆盖明确目标。
09. Search 是能力，不是体验本身。
10. Experience Goal 达成即可结束。
11. AI 默认等待，而不是默认追加。
12. 不允许为了 Engagement 牺牲 Agency。
```

---

# 52. Screen 06 的最终验收标准

必须全部通过：

### Case A

用户：

> “直接告诉我。”

结果：

```text
ANSWER
```

---

### Case B

用户：

> “为什么？”

结果：

```text
基于当前 Experience State 回答
```

用户不需要重新解释上下文。

---

### Case C

用户：

> “那如果温度高一点？”

结果：

```text
WHAT_IF
→ SIMULATE
```

---

### Case D

用户：

> “不是这个意思。”

结果：

```text
CORRECTION
→ invalidate wrong inference
→ preserve valid state
→ reparse
```

---

### Case E

用户：

> “换一个。”

结果：

```text
CANCEL
→ reject current candidate
→ select different candidate
```

---

### Case F

用户：

> “好了。”

结果：

```text
STOP
→ COMPLETE
→ no forced continuation
```

---

### Case G

用户：

> “我想把这个做成一个小游戏。”

结果：

```text
CREATE
→ Creation Runtime
```

不能让用户重新描述上下文。

---

# 53. 最终产品含义

到这里，产品已经不是：

```text
输入
→ AI回答
→ 输入
→ AI回答
```

而是：

```text
用户目标
      ↓
当前状态
      ↓
体验状态
      ↓
Policy 判断
      ↓
AI 能力
      ↓
体验变化
      ↓
用户行动
      ↓
Policy 再判断
```

这才开始接近我们定义的：

> **Personal Experience Engine**

因为真正被生成的不是一句回答，而是：

> **下一步体验。**

而真正的核心资产也开始清晰：

```text
User State
     +
Intent
     +
Experience State
     +
Policy Decisions
     +
Outcome
```

这五者形成闭环后，产品才有可能逐渐学会：

> **“这个人在这个时刻，什么样的下一步最有价值。”**

而不是简单学习：

> “这个人喜欢什么内容。”
