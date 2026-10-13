# Screen 04｜第一体验 Runtime

## 1. Screen 04 的唯一核心任务

Screen 03 负责让用户产生：

> “我想进去看看。”

Screen 04 负责让用户产生：

> “我已经开始参与了。”

因此 Screen 04 不是传统意义上的“详情页”。

它是：

> **Experience Runtime 的第一次实例化。**

用户进入之后，系统需要根据用户的行为实时决定：

- 现在应该解释什么
- 现在应该回答什么
- 现在应该问什么
- 现在是否应该让用户操作
- 现在是否应该换一个方向
- 什么时候应该结束

---

# 2. 最小体验结构

V1 第一体验严格限制为：

```text
Trigger
↓
First Layer
↓
User Response
↓
Adaptation
↓
Next Layer
```

不要一开始设计：

```text
完整故事
↓
10 个章节
↓
5 个分支
↓
复杂任务树
```

因为那是在制作“内容”。

我们需要制作的是：

> **一个能够根据用户状态变化的 Runtime。**

---

# 3. 第一体验的标准结构

例如：

用户选择：

> 一个奇怪的问题

Screen 03：

> 为什么有些树看起来死了，其实还活着？

进入 Screen 04。

第一层：

```text
有些树在冬天看起来完全没有生命迹象。

没有叶子。
没有明显生长。
甚至树皮看起来也很“死”。

但地下可能发生着完全不同的事情。

树并不是停止生命活动，
而是在降低活动水平，
把资源集中到更重要的部分。

这会带来一个有趣的问题：

如果一棵树可以把“生命活动”降到很低，
那我们怎么判断它到底还活不活着？
```

然后停。

**不要继续自动讲。**

---

# 4. 为什么必须停？

因为这一刻已经完成：

```text
事实
+
解释
+
新问题
```

接下来应该由用户决定。

如果 AI 继续：

> “其实植物的细胞呼吸……”

然后：

> “此外还有……”

然后：

> “在生态学中……”

用户就从：

> 参与者

变成：

> 观众。

这是第一种必须避免的产品退化。

---

# 5. Screen 04 的核心原则

## 原则一：一次只推进一个认知单位

每次输出只解决一个问题。

```text
Observation
→ Explanation
→ Question
```

不要：

```text
Observation
→ History
→ Background
→ Theory
→ Exception
→ Data
→ Related Topics
→ Summary
```

---

# 6. “第一层理解”到底是什么

第一层理解必须满足：

### 用户能复述

例如：

> “哦，所以它不是死了，只是把活动降下来了。”

如果用户无法复述：

说明第一层太复杂。

---

### 用户还能继续问

例如：

> “那它怎么知道什么时候重新开始？”

这非常重要。

第一层不是为了结束问题。

而是为了：

> **让用户形成自己的下一个问题。**

---

# 7. 第一层不能故意制造信息缺口

这里需要非常严格。

不能：

> “但真正神奇的是……”

然后故意不说。

也不能：

> “答案可能会让你震惊。”

然后继续吊用户。

我们允许：

> **自然产生的未知。**

不允许：

> **人为制造的未知。**

两者完全不同。

---

# 8. 用户直接要答案时

用户：

> “那它到底怎么判断？”

系统直接回答。

用户：

> “别绕了，直接告诉我。”

系统直接回答。

用户：

> “所以到底是不是活的？”

系统：

> “是。只要它仍然维持基本生命活动，就仍然是活的。”

然后再决定是否提供：

> “如果你想，我们可以继续看它是怎么做到的。”

但不能强迫继续。

---

# 9. Runtime 的第一状态机

```text
EXPERIENCE_ENTER
        ↓
CONTEXT_LOAD
        ↓
FIRST_LAYER_GENERATE
        ↓
FIRST_LAYER_PRESENT
        ↓
WAIT_FOR_USER
        │
        ├── QUESTION
        │      ↓
        │   ANSWER
        │      ↓
        │   REASSESS
        │
        ├── ACTION
        │      ↓
        │   EXECUTE
        │      ↓
        │   REASSESS
        │
        ├── CHANGE_DIRECTION
        │      ↓
        │   BRANCH
        │
        ├── “直接告诉我”
        │      ↓
        │   DIRECT_ANSWER
        │
        ├── “换一个”
        │      ↓
        │   EXPERIENCE_EXIT
        │
        └── DONE
               ↓
           EXPERIENCE_COMPLETE
```

这里最重要的是：

> **WAIT_FOR_USER**

AI 不是一直运行。

AI 应该知道什么时候：

> **轮到用户了。**

---

# 10. Runtime 不应该是“聊天无限循环”

错误架构：

```text
AI
↓
User
↓
AI
↓
User
↓
AI
↓
User
↓
AI
↓
……
```

这种结构很容易退化成普通聊天。

正确架构：

```text
Experience State
↓
AI Interpretation
↓
Experience State Transition
↓
Experience Output
↓
User Action
↓
Experience State Update
```

也就是说：

> 用户不是在和一个聊天机器人聊天。

用户是在：

> **改变一个正在运行的体验。**

---

# 11. Experience State

每个体验内部维护：

```text
ExperienceState
├── current_stage
├── known_facts
├── user_questions
├── user_hypotheses
├── user_actions
├── discovered_elements
├── unresolved_questions
├── interaction_state
├── branch
├── completion
└── exit_reason
```

例如：

```json
{
  "current_stage": "first_understanding",

  "known_facts": [
    "tree_can_reduce_activity"
  ],

  "user_questions": [],

  "user_hypotheses": [],

  "unresolved_questions": [
    "how_tree_detects_environment"
  ],

  "interaction_state": "none",

  "completion": 0.25
}
```

注意：

`completion = 0.25`

不是：

> “用户完成了 25% 的内容。”

而是：

> **系统对当前体验状态的估计。**

用户随时可以结束。

---

# 12. 用户问题不是普通 Chat Message

这是架构上的重要区别。

用户说：

> “那如果冬天突然变暖呢？”

普通 AI：

```text
回答问题
```

Experience Runtime：

```text
Detect:
用户正在改变条件

↓
Interpret:
这是一个“what-if”操作

↓
Experience transition:
进入条件变化分支

↓
Action:
修改环境参数

↓
Outcome:
展示结果

↓
Explanation:
解释为什么发生变化
```

所以：

> “那如果……”

是一个**体验控制信号**。

不只是文本。

---

# 13. 用户语言的 Runtime 意图

至少识别：

```text
QUESTION
WHY
HOW
VERIFY
WHAT_IF
COMPARE
CREATE
CHANGE_DIRECTION
CONTINUE
STOP
DIRECT_ANSWER
REPEAT
DEEPEN
SIMPLIFY
REFRAME
```

例如：

### “为什么？”

```text
WHY
```

### “真的假的？”

```text
VERIFY
```

### “那如果温度高一点呢？”

```text
WHAT_IF
```

### “我不想看这个了”

```text
CHANGE_DIRECTION
```

### “讲简单点”

```text
SIMPLIFY
```

### “详细一点”

```text
DEEPEN
```

### “这和我有什么关系？”

```text
REFRAME
```

### “好了”

```text
STOP
```

这就是 Experience Runtime 与普通 Chat Runtime 的核心区别。

---

# 14. AI 输出必须结构化

不要允许前端直接接受：

```text
LLM → 一段自然语言
```

应该：

```text
LLM
↓
Structured Experience Response
↓
Experience Policy
↓
Renderer
```

例如：

```json
{
  "action": "answer",

  "content": {
    "summary": "...",
    "explanation": "...",
    "optional_detail": "..."
  },

  "state_update": {
    "known_facts": [],
    "unresolved_questions": []
  },

  "next_possible_actions": [
    "ask",
    "simulate",
    "continue",
    "stop"
  ],

  "confidence": 0.93
}
```

前端只负责：

> Render。

不是决定：

> AI 应该干什么。

---

# 15. Experience Policy

这是整个系统非常重要的一层。

```text
User Input
↓
Intent Engine
↓
Experience Planner
↓
Experience Policy
↓
LLM / Search / Tool
↓
Experience Runtime
```

Policy 决定：

### 可以回答

### 应该展示

### 是否应该启动交互

### 是否需要澄清

### 是否应该结束

### 是否需要用户确认

### 是否应该拒绝

---

# 16. 为什么不能让 LLM 自己决定一切？

因为如果：

```text
Frontend
↓
LLM
```

那么产品行为会变成：

> Prompt 决定产品。

今天改了一版 prompt：

AI 开始过度解释。

明天换一个模型：

AI 开始频繁提问。

后天换一个模型：

AI 开始不停推荐。

最终产品没有稳定的行为规范。

所以：

> **模型负责生成智能，Policy 负责维护产品行为。**

---

# 17. 第一层内容生成策略

First Layer 不应该完全自由生成。

V1 使用模板约束。

```text
Observation
+
One Explanation
+
One Natural Question
```

例如：

```text
Observation:
有些树冬天看起来完全没有生命迹象。

Explanation:
它们会降低部分生命活动，把资源保存下来。

Question:
那它怎么知道什么时候重新开始？
```

LLM 可以自由表达。

但结构不能乱。

---

# 18. 每次回答的“信息预算”

必须建立一个概念：

> **Cognitive Load Budget**

用户当前状态：

```text
energy = low
```

则：

```text
短句
+
低信息密度
+
少分支
```

如果：

```text
energy = high
depth = high
```

则：

```text
更完整解释
+
更多变量
+
更深推理
```

但是：

> 用户明确要求的深度 > 系统推测的状态。

---

# 19. 用户主动要求复杂内容

例如：

> “别简化，我想知道真正的生物机制。”

系统应该立即升级：

```text
depth:
medium → high
```

而不是：

> “考虑到你刚才看起来比较累，我还是简单说。”

这属于典型的：

> AI 自作主张。

必须避免。

---

# 20. “自然问题”是重要产品信号

我们需要记录：

```text
First Layer
↓
User Question
```

尤其关注：

```text
WHY
WHAT_IF
HOW
VERIFY
```

因为这些问题意味着：

> 用户已经开始建立自己的 mental model。

这比：

> 点击“继续”

价值高很多。

---

# 21. 用户没有提问怎么办？

非常重要。

**不要立即补一个问题。**

也不要：

> “你想知道更多吗？”

更不要：

> “要不要继续探索？”

因为这会变成推销。

等待。

如果用户：

```text
退出
```

正常结束。

如果用户：

```text
停留
```

可以提供极轻的自然入口：

```text
继续问…… 🎙
```

仅此而已。

---

# 22. “继续问”不是强制 CTA

它应该是：

```text
继续问…… 🎙
```

而不是：

> “继续探索 →”

因为现在用户已经进入体验。

下一步应该由：

> **用户的问题**

推动。

这会让交互从：

```text
系统 → 用户
```

变成：

```text
用户 → 系统
```

这是非常重要的心理转变。

---

# 23. Screen 04 UI

推荐：

```text
┌──────────────────────────────┐
│ ← 一个奇怪的问题             │
│                              │
│ 为什么有些树看起来死了，      │
│ 其实还活着？                 │
│                              │
│ 有些树在冬天看起来完全没有     │
│ 生命迹象。                   │
│                              │
│ 但地下可能发生着完全不同的事。 │
│                              │
│ 它们会降低部分生命活动，       │
│ 把资源保存下来。             │
│                              │
│ 那么问题来了：                │
│ 它怎么知道什么时候重新开始？   │
│                              │
│                              │
│ ─────────────────────────    │
│ 继续问…… 🎙                 │
└──────────────────────────────┘
```

注意：

这里没有：

```text
猜你喜欢
相关文章
相关推荐
热门问题
下一篇
```

---

# 24. 用户问“为什么？”

界面不应该跳到新的页面。

而是：

```text
当前体验
↓
用户问题
↓
AI 在当前上下文回答
```

例如：

```text
你：
为什么？

AI：
因为冬季温度下降后，
光合作用和生长都会受到影响。

树会降低资源消耗，
把能量集中到维持基本生命活动上。

所以从外面看，
它像是“停止了”。

但内部并没有完全停止。
```

然后：

```text
继续问…… 🎙
```

如果这个回答自然产生了一个可操作问题：

> “那如果冬天突然变暖呢？”

这时才进入交互。

---

# 25. 何时从“解释”转入“操作”？

建立一个非常简单的规则：

如果用户的问题属于：

```text
WHAT_IF
COMPARE
MODIFY
SIMULATE
TRY
```

优先考虑：

> **操作体验**

而不是继续写文字。

例如：

用户：

> “如果温度突然升高呢？”

AI：

> “我们可以直接试一下。”

然后进入：

**Interactive Experience。**

---

# 26. 这是产品最重要的一次跃迁

```text
用户：
“如果……呢？”

↓

AI：
“我们可以直接试一下。”

↓

世界发生变化

↓

用户看到结果

↓

用户继续改变条件
```

这时用户不再是在消费 AI。

而是在：

> **使用 AI 作为体验引擎。**

---

# 27. 交互启动规则

满足任意两个：

```text
用户明确提出 What-if
+
存在可操作变量
```

或者：

```text
用户明确要求尝试
+
系统存在可执行模拟
```

才进入 Interactive Runtime。

不要为了“炫技”强行把任何内容做成互动。

---

# 28. 用户只想知道答案

例如：

> “那到底为什么？”

如果文字回答已经足够：

**就回答。**

不要：

> “我们来模拟一下。”

因为：

> 交互本身不是价值。

价值是：

> **帮助用户更好地理解或实现自己的意图。**

---

# 29. Experience Completion

体验完成不是：

> 系统讲完所有内容。

而是：

```text
用户目标满足
```

例如：

用户：

> “我只是想知道为什么树冬天看起来死了。”

回答完成。

那么：

```text
completion = true
```

不要再：

> “顺便了解一下……”

---

# 30. 用户主动说“好了”

系统：

> 好。

结束。

最多提供：

```text
保存这次探索
```

或者：

```text
下次继续
```

但默认不要：

> “那我再给你一个。”

---

# 31. Exit 是正常状态

Runtime：

```text
ACTIVE
↓
DONE
```

不是：

```text
ACTIVE
↓
USER_ABANDONED
```

“结束”不应该被产品内部定义成负面行为。

因为：

> **一个成功完成的体验，本来就应该允许自然结束。**

---

# 32. Runtime 数据模型

最终：

```json
{
  "experience_id": "...",

  "session": {
    "started_at": "...",
    "ended_at": "...",
    "exit_reason": "user_done"
  },

  "state": {
    "stage": "understanding",
    "depth": "medium",
    "interaction": "none"
  },

  "user_actions": [
    {
      "type": "question",
      "semantic": "why"
    }
  ],

  "knowledge": {
    "introduced": [],
    "confirmed": [],
    "uncertain": []
  },

  "branches": [],

  "completion": {
    "user_goal_met": true
  }
}
```

---

# 33. 必须记录“AI 不确定”

例如科学事实存在不确定性：

```text
Fact
Inference
Uncertainty
```

回答：

> “目前比较确定的是……”

而不是：

> “事实就是……”

如果 AI 只是推测：

> “一种可能的解释是……”

这不仅是准确性要求。

它还是：

> **建立用户信任的产品机制。**

---

# 34. Screen 04 的 Human-first Audit

上线前逐条检查。

### Q1

用户能随时停吗？

**必须。**

### Q2

用户能改变方向吗？

**必须。**

### Q3

AI 会不会为了让用户继续而故意藏答案？

**不能。**

### Q4

AI 会不会在用户已经得到答案后继续塞内容？

**不能。**

### Q5

用户能不能直接问，而不用选择预设按钮？

**必须。**

### Q6

用户说“换一个”后，系统是否真正理解“不喜欢当前方向”？

**必须。**

### Q7

AI 是否把推测当事实？

**不能。**

### Q8

用户是否需要学习产品操作方式？

**尽量不需要。**

### Q9

用户是否能够说：

> “不是这个意思。”

**必须。**

### Q10

用户结束后，系统是否接受结束？

**必须。**

---

# 35. Screen 04 的核心指标

## 第一指标

### Natural Question Rate

```text
产生自然问题的用户
/
进入第一体验的用户
```

这是 V1 最值得关注的指标之一。

---

## 第二指标

### Intent Continuation Rate

用户是否主动继续自己的意图。

不是点击继续。

而是：

```text
问
+
改
+
试
+
创
```

---

## 第三指标

### Answer Satisfaction

用户得到答案后是否：

```text
继续探索
或者
自然结束
```

两者都可以是成功。

---

## 第四指标

### Agency Score

用户是否觉得：

```text
我可以改变方向
我可以随时结束
AI 听得懂我
AI 没有强迫我
决定权在我
```

---

# 36. 最危险的指标误读

如果：

```text
平均体验时长 = 8 分钟
```

我们不能因此认为：

> 产品很好。

可能只是：

> AI 太啰嗦。

或者：

> 用户不知道怎么退出。

反过来：

```text
平均体验时长 = 90 秒
```

也不一定失败。

如果：

```text
用户提出问题
→ 得到答案
→ 满意结束
```

这是一个**成功的短体验**。

因此：

> **Session Time 永远不能成为 V1 的核心北极星。**

---

# 37. Screen 04 的真正北极星

第一阶段建议：

> **Intent Fulfillment**

即：

> 用户原本想做的事情，有没有被真正推进？

然后辅以：

```text
Natural Question Rate
Intent Continuation Rate
Experience Completion
Agency Score
Voluntary Return
```

---

# 38. Screen 04 完成标准

如果用户测试后出现：

```text
用户：
“为什么？”

AI：
解释

用户：
“那如果……？”

AI：
“我们可以试一下。”

用户：
“把这个改掉。”

AI：
实时改变体验。

用户：
“哦，我懂了。”

用户：
“好了。”

AI：
“好。”
```

那么第一条 Runtime 已经成立。

因为我们证明了：

```text
Intent
↓
Experience
↓
Question
↓
Adaptation
↓
Action
↓
Understanding
↓
Exit
```

这是我们的最小闭环。

---

# 39. 最终判断

Screen 04 做对之后，产品已经不再是：

> **“AI 给用户生成一些东西。”**

而开始成为：

> **“用户进入一个由 AI 实时运行、并且可以由用户改变方向的体验。”**

这才是我们真正需要继续投资的技术与产品基础。

下一步 Screen 05 不应该继续增加内容类型。

应该解决一个更尖锐的问题：

> **用户真正开始提问以后，AI 怎样做到“懂上下文、懂意图、懂深度”，而又不把整个体验重新变成聊天框？**

这会进入 **Screen 05｜实时理解与回答 Runtime**，也是我们第一次需要把 **Intent Engine + Experience State + Memory + LLM Context** 四层真正接起来。
