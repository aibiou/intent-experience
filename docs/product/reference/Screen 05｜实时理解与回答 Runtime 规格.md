

# Screen 05｜实时理解与回答 Runtime

## 1. 产品目标

Screen 05 解决一个核心问题：

> 用户在体验过程中自然地说话，AI 如何既理解当前这句话，又不丢失整个体验上下文？

目标不是做一个“更聪明的聊天框”。

目标是：

**用户无需重复上下文，AI 能理解当前意图，并让体验继续向前发展。**

---

# 2. 核心原则

### 原则 1：当前体验优先

AI 理解用户输入时，优先考虑：

```text
当前这句话
↓
当前 Experience State
↓
当前 Intent
↓
当前 Session Context
↓
短期记忆
↓
长期记忆
```

而不是把所有历史信息一股脑塞给模型。

---

### 原则 2：用户说的是“控制信号”，不只是聊天内容

例如：

> “为什么？”

不是普通问题。

它意味着：

```text
semantic = WHY
target = 当前未解释的因果关系
```

> “那如果温度升高呢？”

意味着：

```text
semantic = WHAT_IF
target = temperature
operation = modify(variable)
```

> “我已经知道这个了。”

意味着：

```text
semantic = KNOWN
action = skip_current_layer
depth = increase
```

> “不是这个意思。”

意味着：

```text
semantic = CORRECTION
action = invalidate_current_interpretation
```

因此：

**Language → Semantic Action → Runtime Transition**

而不是：

**Language → LLM → 一段文字**

---

# 3. Context Architecture

Runtime 中不允许只有一个巨大 conversation history。

采用分层上下文：

```text
L0  Current Turn
    ↓
L1  Current Experience State
    ↓
L2  Current Intent
    ↓
L3  Session Context
    ↓
L4  Short-term Memory
    ↓
L5  Long-term Memory
```

## L0｜Current Turn

只包含当前用户输入以及必要的上一轮信息。

例如：

> “为什么？”

必须能够知道上一轮提出的是：

> “它怎么知道什么时候重新开始？”

---

## L1｜Experience State

这是最重要的一层。

包含：

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

它比完整聊天历史更重要。

---

## L2｜Current Intent

记录用户当前真正想完成什么。

例如：

```json
{
  "goal": "understand",
  "depth": "medium",
  "interaction": "low",
  "novelty": "medium",
  "energy": "unknown",
  "confidence": 0.94
}
```

注意：

**Intent 可以在体验过程中变化。**

例如：

```text
理解
↓
深入
↓
模拟
↓
创造
```

不能锁死最初 Intent。

---

## L3｜Session Context

记录本次使用中的背景：

```text
用户刚刚看过什么
用户刚刚拒绝什么
用户已经问过什么
用户已经知道什么
当前体验持续多久
用户刚刚改变过什么方向
```

---

## L4｜Short-term Memory

保存本次 session 中有价值但不属于 Experience State 的信息。

例如：

> “我其实是高中生。”

如果只是为了当前讨论理解上下文，可以短期存在。

---

## L5｜Long-term Memory

只有满足长期价值和明确可信度时才进入。

例如：

> “用户长期喜欢生物学。”

但：

> “用户今天想了解植物。”

不能直接进入长期记忆。

---

# 4. Context Assembly

每次用户输入时，不把全部历史发送给模型。

Context Builder：

```text
Current Turn
+
Relevant Experience State
+
Current Intent
+
Relevant Session Context
+
Relevant Memory
+
System / Policy
```

形成：

```text
LLM Context
```

而不是：

```text
Entire Conversation
```

这样可以同时解决：

- token 成本
- 上下文污染
- 长对话失控
- 旧信息覆盖新意图
- 隐私风险
- 模型越来越啰嗦

---

# 5. 用户输入处理 Pipeline

完整流程：

```text
USER INPUT
   ↓
Input Normalization
   ↓
Semantic Intent Detection
   ↓
Reference Resolution
   ↓
Context Assembly
   ↓
Experience Policy
   ↓
Action Decision
   ↓
LLM / Search / Tool
   ↓
Response Validation
   ↓
Experience State Update
   ↓
UI Render
```

其中必须把：

**理解用户**

和

**决定产品怎么做**

分开。

---

# 6. Semantic Intent Detection

系统首先判断用户这句话属于什么行为。

第一版只需要支持：

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
CREATE
CHANGE_DIRECTION
CONTINUE
STOP
DIRECT_ANSWER
KNOWN
CORRECTION
REFRAME
```

例如：

| 用户说       | Semantic          |
| --------- | ----------------- |
| 为什么？      | WHY               |
| 怎么做到的？    | HOW               |
| 如果温度高一点呢？ | WHAT_IF           |
| 真的吗？      | VERIFY            |
| 这个我知道     | KNOWN             |
| 讲简单一点     | SIMPLIFY          |
| 再详细一点     | DEEPEN            |
| 不是这个意思    | CORRECTION        |
| 这和我有什么关系？ | REFRAME           |
| 换一个       | CHANGE_DIRECTION  |
| 好了        | STOP              |
| 我想自己试试    | CREATE / INTERACT |

---

# 7. Reference Resolution

这是 Screen 05 最容易被低估的能力。

用户不会一直说完整句子。

例如：

> “为什么？”

系统必须知道“为什么什么”。

又例如：

> “那它呢？”

必须知道“它”指什么。

又例如：

> “再高一点。”

必须知道：

```text
什么变量？
当前值是多少？
“高一点”意味着多少？
```

因此建立：

```text
Reference Resolver
```

输入：

```json
{
  "user_input": "为什么？",
  "recent_entities": [
    "tree",
    "dormancy",
    "restart_signal"
  ],
  "current_question": "tree_restart_signal"
}
```

输出：

```json
{
  "resolved_target": "tree_restart_signal",
  "confidence": 0.97
}
```

如果置信度很高：

**直接执行。**

不要问：

> “你是指树什么时候恢复生长吗？”

如果置信度不足：

才进行最小澄清。

---

# 8. Depth Adaptation

用户不应该看到：

```text
简单
中等
专业
```

这种参数选择。

系统自己调整。

### 用户说：

> “讲简单点。”

直接：

```text
depth ↓
technicality ↓
sentence_complexity ↓
```

### 用户说：

> “详细一点。”

直接：

```text
depth ↑
mechanism_detail ↑
examples ↑
```

### 用户连续问：

> 为什么？

> 那为什么？

> 那如果……

说明：

```text
engagement ↑
depth ↑
```

但不能仅仅因为用户停留时间长就自动增加深度。

**行为兴趣 ≠ 用户授权深入。**

---

# 9. Explicit Intent Override

如果用户明确要求，必须优先于系统推断。

例如：

用户状态可能被推断为：

```text
energy = low
```

但用户说：

> “我今天很累，但我就是想搞懂这个机制，讲深一点。”

最终：

```text
energy = low
goal = understand
depth = deep
```

系统应该：

- 减少交互负担
- 减少无关信息
- 但保持内容深度

而不是：

> “你累了，我给你一个轻松的问题。”

---

# 10. Answer Policy

LLM 不是决定回答方式的最终控制器。

Experience Policy 根据用户行为决定：

```text
ANSWER
ASK
BRANCH
SIMULATE
CREATE
SEARCH
CHANGE
STOP
```

例如：

### 用户：

> “直接告诉我答案。”

Policy：

```text
DIRECT_ANSWER
```

不能为了提高继续率故意隐藏答案。

---

### 用户：

> “那如果温度高一点呢？”

Policy：

```text
WHAT_IF
→ check_variable
→ if_simulatable
→ enter_simulation
```

---

### 用户：

> “这个是真的吗？”

Policy：

```text
VERIFY
→ factuality_check
→ if_current_or_uncertain
→ search
```

---

### 用户：

> “我不想看这个了。”

Policy：

```text
CHANGE_DIRECTION
→ exit_current_experience
→ return_to_intent_entry
```

---

# 11. Search / Tool Policy

不是所有问题都调用外部工具。

判断：

```text
Is knowledge stable?
        ↓
       YES
        ↓
   LLM / knowledge base

       NO
        ↓
   Search / tool
```

需要外部验证的典型情况：

- 最新事实
- 当前数据
- 实时状态
- 用户明确要求查证
- 高不确定性事实
- 具体外部资源

重要原则：

**工具是后台能力，不应该成为用户体验的主角。**

用户不应该被迫理解：

> “现在正在调用搜索工具。”

除非这对透明度有实际价值。

---

# 12. Uncertainty Policy

AI 必须区分：

```text
FACT
INFERENCE
UNCERTAINTY
```

例如：

> “植物一定是因为温度下降才进入休眠吗？”

不能直接说：

> “是。”

而应该：

```text
已知：
低温通常是重要信号之一。

但并不只有温度。

推断：
对于某些植物，光照和内部生理状态也可能参与。

不确定：
具体机制取决于物种。
```

这直接关系到用户对系统的长期信任。

---

# 13. Correction Handling

用户说：

> “不是这个意思。”

系统不能继续沿着旧假设生成。

立即：

```text
invalidate_current_interpretation
↓
preserve_valid_context
↓
reparse_current_intent
```

例如：

```text
之前：
用户想知道“为什么树冬天不生长”

用户纠正：
“我其实想知道它怎么判断什么时候重新开始”

那么：

旧 target：
winter_dormancy

新 target：
restart_signal

Experience State 不需要重置。

```

这就是：

**纠正局部状态，而不是重新开始整个体验。**

---

# 14. Intent Change Detection

体验过程中允许用户突然改变方向。

例如：

```text
“为什么树会休眠？”
        ↓
“如果我把它放到热带呢？”
        ↓
“算了，我想做个植物实验。”
```

这是：

```text
UNDERSTAND
→ WHAT_IF
→ CREATE
```

不是异常。

Runtime 应该支持：

```text
Current Experience
        ↓
Intent Mutation
        ↓
New Experience Mode
```

而不是要求用户回 Home。

---

# 15. Interruptibility

生成过程中：

```text
GENERATING
```

用户突然说：

> “不是这个，换一个。”

立即：

```text
USER_INTERRUPT
↓
CANCEL_GENERATION
↓
CANCEL_CURRENT_ACTION
↓
PROCESS_NEW_INPUT
```

不能：

```text
先把上一段讲完
再处理用户
```

这会产生非常明显的“机器感”。

---

# 16. Response Contract

LLM 不直接输出最终 UI。

输出结构化结果：

```json
{
  "semantic_action": "WHAT_IF",

  "resolved_target": {
    "type": "variable",
    "name": "temperature"
  },

  "runtime_action": "SIMULATE",

  "response": {
    "summary": "...",
    "explanation": "...",
    "uncertainty": null
  },

  "state_update": {
    "known_facts": [],
    "user_hypotheses": [],
    "unresolved_questions": []
  },

  "next_state": {
    "stage": "simulation"
  },

  "confidence": 0.94
}
```

Frontend 只负责：

```text
Render
Input
Animation
Interaction
```

不负责：

```text
判断用户意图
决定是否搜索
决定是否继续
修改 Experience State
```

---

# 17. Runtime State Update

每一次用户输入之后：

```text
Old State
+
User Action
+
AI Result
↓
New State
```

例如：

```json
{
  "before": {
    "stage": "understanding",
    "unresolved_questions": [
      "restart_signal"
    ]
  },

  "user_action": {
    "semantic": "WHY"
  },

  "after": {
    "stage": "understanding",
    "unresolved_questions": [],
    "known_facts": [
      "restart_signal_mechanism"
    ]
  }
}
```

因此 Experience 是真正“向前走”的。

---

# 18. UI 设计

Screen 05 不应该增加复杂 UI。

核心界面仍然是：

```text
┌──────────────────────────────┐
│ ← 一个奇怪的问题             │
│                              │
│ 为什么有些树看起来死了，      │
│ 其实还活着？                 │
│                              │
│ ……                           │
│                              │
│ 用户：                        │
│ “那它怎么知道什么时候重新开始？”│
│                              │
│ AI：                          │
│ “它并不是读取一个‘开始按钮’。  │
│ 植物会综合温度、光照等信号……” │
│                              │
│ 继续问…… 🎙                 │
└──────────────────────────────┘
```

没有：

- 参数面板
- 模型选择
- 深度选择
- 工具选择
- Prompt 编辑
- 复杂控制栏

复杂度存在于 Runtime，不应该转嫁给用户。

---

# 19. 特殊输入行为

## “直接告诉我”

```text
→ DIRECT_ANSWER
```

## “我已经知道这个”

```text
→ KNOWN
→ skip_redundant_layer
→ increase_depth
```

## “讲简单一点”

```text
→ SIMPLIFY
```

## “详细一点”

```text
→ DEEPEN
```

## “这和我有什么关系？”

```text
→ REFRAME
→ connect_to_user_context
```

## “换一个”

```text
→ CHANGE_DIRECTION
→ candidate_space_update
```

## “好了”

```text
→ STOP
→ EXPERIENCE_COMPLETE / USER_EXIT
```

---

# 20. Candidate Rejection Memory

“换一个”不能简单理解为：

```text
random()
```

需要记录：

```json
{
  "rejected": {
    "topic": "botany",
    "experience_type": "counterintuitive_question",
    "reason": "unknown"
  }
}
```

下一次候选生成：

```text
avoid exact topic
+
consider broader type
+
preserve current intent
```

例如连续两次：

> “换一个。”

第三次应该明显改变候选空间，而不是换一个类似的问题。

---

# 21. Metrics

Screen 05 的核心指标：

### Contextual Accuracy

AI 是否正确理解当前上下文。

---

### Rephrase Rate

用户需要重复表达自己的比例。

目标：

**持续下降。**

---

### Correction Rate

用户说：

> “不是这个意思。”

的比例。

这个指标不是越低越好，因为它也可能意味着系统不给用户表达空间。

真正要看：

```text
Correction
→ Recovery Success
```

---

### Depth Fit

用户请求深度与实际回答深度是否匹配。

---

### Direct Answer Satisfaction

用户明确要求答案后，是否满意。

这是防止“AI 为了留住用户而故意绕弯”的关键指标。

---

### Context Carryover

用户无需重复上下文，AI 能否继续正确处理。

---

### Intent Change Detection

用户改变目标时，系统能否及时识别。

---

### Hallucination / Uncertainty Accuracy

AI 对未知、不确定、事实和推断的区分是否正确。

---

# 22. Screen 05 Human-first Audit

上线前逐项测试：

### A

用户问一句：

> “为什么？”

是否无需重复上下文？

### B

用户说：

> “不是这个意思。”

是否可以立即纠正？

### C

用户说：

> “直接告诉我。”

是否马上给答案？

### D

用户说：

> “我已经知道了。”

是否跳过重复内容？

### E

用户突然说：

> “我想做个东西。”

是否可以从理解模式进入创造模式？

### F

用户生成过程中说：

> “换一个。”

是否立即停止当前生成？

### G

用户结束：

> “好了。”

产品是否真正结束？

### H

用户第二天回来：

系统是否不会把昨天的状态误认为今天的 Intent？

---

# 23. Screen 05 的验收标准

Screen 05 完成，不以“AI 回答得很聪明”为标准。

必须达到：

```text
用户自然表达
      ↓
无需重复上下文
      ↓
系统正确理解
      ↓
系统执行合适 Runtime Action
      ↓
体验状态发生变化
      ↓
用户感觉体验在向前推进
```

最终用户感受应该是：

> **“我不用教它怎么跟我聊，我只需要告诉它我现在想做什么。”**

而不是：

> “这个聊天机器人回答得不错。”

---

# 24. Screen 05 完成后的下一步

完成 Screen 05 后，不应该马上做 Screen 06。

下一步应该做：

**Experience Policy Engine。**

因为现在我们已经有：

```text
Home
↓
Intent
↓
Experience Entry
↓
Experience Runtime
↓
Real-time Understanding
```

但还缺一个真正的“大脑”：

```text
什么时候应该解释？
什么时候应该问？
什么时候应该搜索？
什么时候应该让用户操作？
什么时候应该结束？
什么时候应该换体验？
什么时候应该主动把一个理解型体验转成创造型体验？
```

这就是：

# Experience Policy Engine

它会成为整个产品的行为控制层。

最终架构会变成：

```text
                 USER
                   ↓
              Intent Engine
                   ↓
          ┌─────────────────┐
          │ Experience      │
          │ Policy Engine   │
          └────────┬────────┘
                   ↓
          Experience Planner
                   ↓
       ┌───────────┼───────────┐
       ↓           ↓           ↓
      LLM        Search       Tools
       └───────────┼───────────┘
                   ↓
          Experience Runtime
                   ↓
                 USER
                   ↓
             State Update
```

**所以当前最合理的推进顺序是：**

```text
01 Home                     ✅
02 Intent Capture           ✅
03 First Experience         ✅
04 Experience Runtime       ✅
05 Real-time Understanding  ← 当前
06 Experience Policy        ← 下一步
07 Memory                   ← 再下一步
08 First Complete           Experience
09 User Testing
10 Prototype Validation
```

这里开始，产品的重点已经从“页面设计”进入 **AI 产品行为系统设计**。这是必须先做扎实的部分，否则后面的视觉、动效、更多 Experience 类型都会建立在不稳定的 AI 行为之上。
