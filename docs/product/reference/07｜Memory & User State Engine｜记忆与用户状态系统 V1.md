# 07｜Memory & User State Engine

## 记忆与用户状态系统 V1

### 1. 产品目标

Memory & User State Engine 不负责“尽可能记住用户”。

它负责：

> 在下一次体验中，只使用那些真正能够改善用户体验、且用户不会因此感到被监视的信息。

核心原则：

```text
当前意图 > 当前状态 > 当前体验上下文 > Session Context
> 短期记忆 > 长期记忆
```

长期记忆永远不是最高优先级。

系统必须允许：

```text
记住
↓
暂时使用
↓
逐渐失效
↓
被用户纠正
↓
被用户撤回
```

而不是：

```text
用户说过
↓
永久保存
↓
永远影响推荐
```

---

# 2. 六种不同的数据状态

V1 必须严格区分以下六类信息。

## 2.1 Current State｜当前状态

描述用户“现在怎么样”。

例如：

```text
energy = low
attention = medium
openness = high
friction_tolerance = low
```

特点：

- 生命周期很短
- 通常只影响当前 Session
- 默认不进入长期记忆
- 不应该被用户感觉成“系统在给我画像”

例如：

> “今天有点累。”

应该产生：

```text
current_state.energy = low
```

而不是：

```text
user.preference = 喜欢低强度内容
```

---

# 3. Session State｜本次会话状态

描述用户当前正在做什么。

例如：

```json
{
  "current_goal": "understand",
  "current_experience": "frictionless_world",
  "depth": "medium",
  "interaction": "medium",
  "recent_rejection": [],
  "current_branch": "human_movement"
}
```

Session State：

- Session 开始时创建
- Session 过程中持续变化
- Session 结束后大部分失效
- 不默认进入长期记忆

这是 Experience Runtime 的主要上下文。

---

# 4. Short-term Memory｜短期记忆

短期记忆用于跨 Session 保留“最近发生过、可能对下一次体验有帮助”的信息。

例如：

> 昨天用户正在研究“为什么飞机能飞”。

系统可以暂时保存：

```json
{
  "topic": "flight",
  "interest_signal": "high",
  "last_seen": "...",
  "source": "recent_exploration",
  "confidence": 0.91
}
```

但它不是：

> 用户喜欢航空。

而是：

> 用户最近对航空产生过较高兴趣。

这两句话的数据意义完全不同。

---

# 5. Long-term Memory｜长期记忆

长期记忆必须满足更高门槛。

V1 只允许保存：

### A. 明确表达的长期偏好

例如：

> “以后我都希望解释尽量简单。”

可以保存：

```json
{
  "preference": "explanation_style",
  "value": "simple",
  "source": "explicit",
  "confidence": 1.0
}
```

### B. 用户明确要求记住

例如：

> “记住我喜欢这种体验。”

这是最高置信度的长期记忆候选。

### C. 多次稳定出现、且具有长期价值的偏好

例如用户在多个独立 Session 中持续表现出：

```text
喜欢直接进入实践
偏好互动而不是纯阅读
```

系统可以产生：

```text
candidate_long_term_preference
```

但：

> 候选 ≠ 已保存。

V1 不允许仅凭行为自动升级为永久用户画像。

---

# 6. Explicit Memory｜用户主动保存

这是整个 Memory 系统最重要的信任机制之一。

用户可以说：

```text
记住这个
以后都这样
以后我喜欢这种
这个对我很重要
```

系统可以将其升级。

例如：

```text
用户：
以后解释科学问题的时候，别太简单。

↓

Memory Candidate

type:
explanation_preference

value:
medium_or_deep

source:
explicit

confidence:
1.0

↓

SAVE
```

---

# 7. 什么绝对不能默认长期记住

V1 明确禁止以下信息仅因为一次行为就进入长期 Memory：

### 临时情绪

> “今天心情不好。”

### 一次性的兴趣

> “今天想看恐怖故事。”

### 一次性任务

> “今天帮我做一个小游戏。”

### 当前环境

> “我现在在机场。”

### 单次拒绝

> “我今天不想看这个。”

### 推测出来的人格

例如：

```text
用户喜欢冒险
用户是夜猫子
用户比较内向
用户喜欢复杂问题
```

除非用户明确表达并要求长期记住，否则只能作为当前推断。

---

# 8. Fact / Inference / Preference

Memory 系统必须保存信息来源。

每条 Memory 都必须包含：

```json
{
  "value": "...",
  "type": "fact | inference | preference",
  "source": "explicit | inferred | behavioral",
  "confidence": 0.0,
  "created_at": "...",
  "last_confirmed_at": "...",
  "expires_at": null
}
```

例如：

### Fact

> “我是一名程序员。”

```text
type = fact
source = explicit
```

### Inference

> “用户可能喜欢互动式学习。”

```text
type = inference
source = behavioral
```

### Preference

> “以后给我解释的时候深入一点。”

```text
type = preference
source = explicit
```

三者不能混在一起。

---

# 9. Memory Confidence

V1 使用简单置信度模型。

```text
Explicit User Statement
        ↓
      1.00

User Explicit Correction
        ↓
      1.00

Repeated Explicit Preference
        ↓
      0.95+

Repeated Behavioral Signal
        ↓
      0.70–0.85

Single Behavioral Signal
        ↓
      0.30–0.50
```

但：

> Confidence ≠ Permission to Remember.

一个模型可以 99% 确信用户喜欢某类东西，也不代表它应该把这个信息永久保存。

---

# 10. Memory Lifecycle

每条 Memory 都拥有生命周期。

```text
OBSERVED
   ↓
CANDIDATE
   ↓
ACTIVE
   ↓
DECAYING
   ↓
EXPIRED
```

对于明确长期偏好：

```text
EXPLICIT
   ↓
ACTIVE
```

对于行为推断：

```text
OBSERVED
   ↓
CANDIDATE
   ↓
ACTIVE
```

但 V1 建议：

> 行为推断默认不直接成为长期 Memory。

---

# 11. Temporal Decay｜时间衰减

用户不是静态人格。

因此：

```text
昨天喜欢 ≠ 今天喜欢
```

短期兴趣必须衰减。

例如：

```text
Day 0
航空兴趣 = 0.90

Day 3
航空兴趣 = 0.63

Day 14
航空兴趣 = 0.25

Day 30
航空兴趣 = 0.08
```

如果用户再次主动探索航空：

```text
interest ↑
```

系统重新获得证据。

---

# 12. Current Intent 对 Memory 的覆盖

这是 Policy Engine 与 Memory Engine 的关键连接。

假设长期 Memory：

```text
用户喜欢深度解释
```

但今天用户说：

> “我现在很累，简单讲一下。”

系统必须：

```text
Current Intent
        ↓
Override Long-term Preference
```

最终：

```text
depth = simple
```

不能因为：

> “你以前喜欢深度内容。”

而继续输出复杂内容。

---

# 13. “别再给我这个”的特殊处理

这是一个非常重要的语义。

### 用户：

> 别再给我这个。

默认解释：

```text
temporary_negative_preference
```

影响：

- 当前 Experience
- 当前 Session
- 近期候选选择

不直接解释为：

> 永久讨厌这个主题。

只有用户明确说：

> “以后都不要给我这个。”

才进入长期负偏好候选。

---

# 14. “我喜欢这个”的特殊处理

同样不能过度推断。

### 用户：

> 这个挺有意思。

只代表：

```text
positive_feedback
```

不是：

```text
long_term_preference
```

### 用户：

> 我很喜欢这种体验。

可以产生：

```text
preference_candidate
```

### 用户：

> 以后都可以给我这种。

才可以进入：

```text
long_term_preference
```

---

# 15. 用户如何控制 Memory

用户必须可以自然表达：

```text
记住这个
不要记这个
暂时别记
别再用这个
为什么你觉得我喜欢这个？
我已经不喜欢这个了
把这个偏好改掉
清除这个兴趣
```

系统都必须理解。

不要求用户进入复杂设置页面。

---

# 16. Memory Transparency

当用户问：

> 为什么你给我这个？

系统必须能够回答：

```text
因为你最近两次主动探索了类似的问题。
```

而不是：

> “根据我们的算法分析……”

如果使用的是推断：

```text
我猜可能是因为你最近对这类问题比较感兴趣。
如果不是，你可以直接告诉我。
```

必须明确：

```text
事实
vs
推断
```

---

# 17. Memory Correction

用户：

> 我其实不喜欢这种。

系统：

```text
invalidate(current_preference)
```

但不能因此删除所有相关事实。

例如：

```text
User:
我其实不喜欢互动式游戏。

```

应该：

```text
negative_preference:
interactive_games

remove / downgrade:
interactive_game_preference

preserve:
user_understands_simulation
```

一个偏好被纠正，不代表整个 User Model 被重置。

---

# 18. Memory UI

V1 不需要复杂 Memory Dashboard。

在体验中，只在必要时轻量展示。

例如：

```text
我会记住：
以后科学问题可以讲得深入一点。

[记住]
[不用记]
```

但默认不应该频繁出现。

更自然的方式：

用户主动说：

> “记住这个。”

系统直接执行。

---

# 19. User State Model

User State 不应该是一个巨大的人格 JSON。

V1 保持极简：

```json
{
  "current_state": {
    "energy": null,
    "attention": null,
    "openness": null,
    "friction_tolerance": null
  },

  "recent_context": {
    "recent_experiences": [],
    "recent_interests": [],
    "recent_rejections": []
  },

  "preferences": {
    "explicit": [],
    "candidate": []
  }
}
```

长期 Memory 单独存储。

---

# 20. Memory Retrieval

Experience Runtime 不允许每次把所有 Memory 全部塞进 Context。

应该：

```text
Current Intent
        ↓
Memory Retrieval
        ↓
Relevant Memories
        ↓
Context Builder
```

只取相关信息。

例如当前：

> “帮我把刚才那个东西做成小游戏。”

Memory Retrieval 可能只需要：

```text
recent_experience = frictionless_world
creation_preference = interactive
```

不需要读取：

```text
用户三个月前看过的植物问题
```

---

# 21. Memory Priority

Context Builder：

```text
L0 Current Turn
L1 Experience State
L2 Current Intent
L3 Current State
L4 Session Context
L5 Relevant Short-term Memory
L6 Relevant Long-term Memory
```

并且：

```text
高优先级信息
覆盖
低优先级信息
```

---

# 22. Memory Retrieval 不应该改变体验

这是一个非常容易犯的错误。

例如：

长期 Memory：

```text
用户喜欢创造。
```

当前用户：

> “我只想知道答案。”

系统不能：

```text
ANSWER
+
顺便给你做个小游戏
```

Memory 只能帮助理解用户。

不能改变用户已经明确表达的目标。

---

# 23. Memory 与 Recommendation 的关系

V1 不建立：

```text
Memory
↓
推荐 Feed
```

而是：

```text
Intent
+
State
+
Experience
+
Relevant Memory
↓
Next Best Experience
```

Memory 是输入。

不是产品本身。

---

# 24. Memory Safety Rule

任何情况下：

```text
Memory ≠ Authority
```

Memory 只能：

```text
inform
```

不能：

```text
override
```

例如：

```text
长期偏好：喜欢深度内容

当前：
“我现在只想看一分钟的。”

↓

当前意图优先
```

---

# 25. Memory Acceptance Cases

### Case 01

用户：

> 今天有点累。

结果：

```text
Current State:
energy = low
```

不进入长期 Memory。

---

### Case 02

用户：

> 我今天想看恐怖故事。

结果：

```text
Current Intent:
topic = horror
```

不进入长期 Memory。

---

### Case 03

用户：

> 我很喜欢这种互动体验。

结果：

```text
Preference Candidate:
interactive_experience = positive
```

---

### Case 04

用户：

> 以后都可以给我这种互动体验。

结果：

```text
Long-term Preference:
interactive_experience = positive
source = explicit
```

---

### Case 05

用户：

> 别再给我这种问题。

结果：

```text
Session / Recent Negative Signal
```

---

### Case 06

用户：

> 以后不要再给我这种问题。

结果：

```text
Long-term Negative Preference
```

---

### Case 07

用户：

> 为什么你觉得我喜欢这个？

系统必须解释 Memory 来源。

---

### Case 08

用户：

> 我不喜欢这个了。

系统：

```text
invalidate relevant preference
```

并立即改变后续行为。

---

# 26. Memory Metrics

V1 不追求“记住多少”。

核心指标：

### Memory Usefulness

使用 Memory 后体验是否真的改善。

### Memory Correction Rate

用户纠正 Memory 的频率。

### Memory Violation Rate

系统使用错误 Memory 的频率。

这是严重指标。

### Unnecessary Personalization

用户没有需要，但系统主动暴露个性化依据。

应该尽量低。

### Memory Trust

用户是否愿意主动告诉系统：

> “记住这个。”

### Forget Success

用户要求不再使用某信息后，系统是否真的停止使用。

---

# 27. 一个非常重要的新指标：Memory Regret

定义：

> 用户事后认为系统“不应该记住 / 不应该使用”某信息的比例。

例如：

```text
用户：
我只是昨天随便看了一下，
为什么今天还给我这个？

```

这是 Memory Regret。

目标：

```text
Memory Regret → 极低
```

---

# 28. Human-first Memory Audit

每次 Memory 功能上线前，必须问：

```text
1. 这是用户主动告诉我们的，还是我们猜的？

2. 如果是猜的，真的需要保存吗？

3. 如果今天发生变化，系统会不会继续坚持昨天的判断？

4. 用户能不能自然纠正？

5. 用户能不能说“别用这个”？

6. 用户能不能知道为什么系统用了这个？

7. 用户停止使用产品后，这个信息是否仍然必要？

8. 这个 Memory 是帮助用户，还是帮助系统提高 Engagement？

9. 如果用户不知道系统记住了它，会不会产生被监视感？

10. 如果这个 Memory 是错的，后果是什么？
```

如果第 8、9、10 项无法回答清楚，不应该进入 V1。

---

# 29. V1 Memory Rulebook

最终收敛为：

```text
01. 当前意图永远优先于长期偏好。
02. 当前状态默认短生命周期。
03. 一次行为不能证明长期偏好。
04. 推断不等于事实。
05. 高置信度不等于永久保存权限。
06. 用户明确要求记住，才是最强长期记忆信号。
07. “今天不要”不等于“以后不要”。
08. “喜欢这个”不自动等于“以后都喜欢”。
09. Memory 只能帮助理解，不能覆盖当前意图。
10. 用户可以自然纠正 Memory。
11. 用户说不要使用某 Memory，系统必须立即停止使用。
12. 系统必须能够解释为什么使用某 Memory。
13. Memory 应该衰减，而不是无限累积。
14. 不为了推荐或 Engagement 而保存信息。
15. 用户应该感觉被理解，而不是被画像。
```

---

# 30. 与前面系统的最终连接

现在整个核心架构变成：

```text
                 ┌──────────────────┐
                 │      Memory      │
                 │ short / long     │
                 └────────┬─────────┘
                          ↓
User
 ↓
Current State
 ↓
Intent Engine
 ↓
Experience State
 ↓
Experience Policy
 ↓
LLM / Search / Tool
 ↓
Experience Runtime
 ↓
User Action
 ↓
State Update
 ↓
Memory Candidate
 ↓
Memory Policy
```

这里有一个关键闭环：

```text
Experience
    ↓
User Behavior
    ↓
State Change
    ↓
Memory Candidate
    ↓
Future Experience
```

但最后一步必须受到严格限制。

不是：

```text
用户做过什么
↓
系统永久记住
↓
以后一直这么推荐
```

而是：

```text
用户经历过什么
↓
系统获得一点证据
↓
判断是否值得保留
↓
判断生命周期
↓
必要时才使用
↓
用户可以纠正
```

这才是我们要的 **Personal Experience Engine**。

---

# 31. 当前系统已经形成五层核心能力

```text
01 Home
    ↓
02 Intent
    ↓
03 Experience Entry
    ↓
04 Experience Runtime
    ↓
05 Real-time Understanding
    ↓
06 Experience Policy
    ↓
07 Memory / User State
```

其中真正形成壁垒的不是某个 UI，而是：

```text
User State
+
Intent
+
Experience State
+
Policy Decision
+
Outcome
```

这五者共同构成：

> **Personal Experience Model**

它比传统的“用户画像”更接近我们真正想做的东西。

因为我们不是只想知道：

> “这个人是谁。”

而是要知道：

> **“这个人在此刻想做什么，以及什么体验最适合帮助他完成它。”**
