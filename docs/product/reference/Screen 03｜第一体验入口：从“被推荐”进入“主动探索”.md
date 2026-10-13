# Screen 03｜第一体验入口

## 1. 产品目的

Screen 03 不是：

- 推荐卡片页
- AI 内容详情页
- 聊天页面
- Feed
- “猜你喜欢”
- 一段漂亮的 AI 生成内容

它真正负责的是：

> **把用户刚刚表达的意图，转化成一个足够具体、足够低门槛、又足够有探索空间的第一体验。**

用户应该在 10–20 秒内产生至少一种感觉：

> “这个有点意思。”

或者：

> “我想知道答案。”

或者：

> “我想试试看。”

最终希望进入：

**被呈现 → 好奇 → 主动操作**

而不是：

**被呈现 → 看完 → 划走**

---

# 2. Screen 03 的核心原则

### 原则 01：体验，而不是内容

系统生成的单位不是：

> 一篇文章 / 一张图片 / 一段视频 / 一段回答

而是：

> **一个可以继续发展的 Experience。**

Experience 至少包含：

```text
Trigger
Context
Curiosity
First Understanding
Interaction
Possible Branches
User Action
Outcome
Exit
```

因此 Screen 03 展示的只是 Experience 的入口。

---

### 原则 02：第一屏只负责制造一个“值得进入的问题”

不要一次性解释完。

但也不能故意藏答案。

正确结构：

```text
一个具体现象
        ↓
一个反常识点
        ↓
一个值得验证的问题
        ↓
开始探索
```

错误结构：

```text
标题
↓
背景介绍
↓
历史
↓
10 条知识
↓
相关内容
↓
猜你喜欢
```

这会立即退化成内容消费。

---

### 原则 03：好奇心不能成为留存操纵

例如：

> “99%的人都不知道答案。”

禁止。

> “看到最后你就知道真正原因。”

禁止。

> “还有一个更惊人的秘密……”

禁止。

产品应该让用户因为**真的想知道**而继续，而不是因为系统故意制造信息缺口。

如果用户直接说：

> “直接告诉我。”

系统必须直接告诉。

---

# 3. Screen 03 默认 UI

```text
┌─────────────────────────────┐
│                             │
│        一个奇怪的问题        │
│                             │
│   为什么有些树看起来已经死了， │
│   其实还活着？               │
│                             │
│   答案比想象中奇怪。          │
│                             │
│                             │
│       [ 开始探索 → ]         │
│                             │
│       换一个                 │
│                             │
│                             │
│   为什么是这个？             │
│                             │
└─────────────────────────────┘
```

实际视觉设计不需要大量 UI。

重点是：

**一个问题 + 一个入口。**

---

# 4. 页面组件

```text
ExperienceEntryScreen
│
├── ExperienceType
├── ExperienceTitle
├── ExperienceHook
├── PrimaryAction
├── AlternativeAction
├── WhyThis
│
└── ExperienceEntryController
```

---

## 4.1 ExperienceType

例如：

```text
一个奇怪的问题
```

或者：

```text
试试看
```

或者：

```text
一个思想实验
```

或者：

```text
做个东西
```

作用不是分类导航。

作用是让用户快速理解：

> “我接下来是在干什么？”

---

## 4.2 ExperienceTitle

必须：

- 具体
- 简短
- 可理解
- 不依赖上下文才能看懂

例如：

> 为什么有些树“死了”其实还活着？

优于：

> 植物生命机制中的一个有趣现象

---

## 4.3 ExperienceHook

只提供一层。

例如：

> 答案比想象中奇怪。

或者：

> 如果把这个条件改变，结果会完全不同。

或者：

> 你可以自己试试看。

Hook 的作用不是制造悬念。

而是告诉用户：

> **进入之后，我能做什么。**

---

# 5. Primary Action

默认：

> **开始探索 →**

不同 Experience 类型可以变化。

例如：

```text
知识探索
→ 开始探索

思想实验
→ 试试看

现实模拟
→ 进入实验

快速创造
→ 开始做

轻松发现
→ 看看
```

不要所有东西都叫：

> “继续”

因为“继续”描述的是页面流程，不是用户即将获得的体验。

---

# 6. Secondary Action

固定：

> **换一个**

但它绝对不是：

```text
random()
```

而应该是：

```text
reject(current_experience)
        ↓
update(current_intent)
        ↓
expand_candidate_space()
        ↓
select_next_experience()
```

也就是说：

> 用户说“换一个”，是在告诉系统当前体验不对。

而不是：

> “再随机抽一个。”

---

# 7. “换一个”的算法语义

第一次：

```text
用户：
“发现点东西”

Experience A：
宇宙中的奇怪现象
```

用户：

> 换一个

系统不能简单：

```text
A → B → C → D
```

而应该逐渐判断：

```text
用户不喜欢：
宇宙
```

还是：

```text
用户不喜欢：
知识型内容
```

还是：

```text
用户不喜欢：
这种表达方式
```

还是：

```text
当前状态不适合深度探索
```

因此：

### 第一次拒绝

改变具体主题。

### 第二次拒绝

扩大体验类型。

### 第三次拒绝

降低认知负担。

例如：

```text
深度问题
↓
现实模拟
↓
轻松发现
```

而不是：

```text
黑洞
↓
量子力学
↓
恐龙
↓
火山
```

---

# 8. “为什么是这个？”

这是一个非常重要的信任入口。

但默认不展开。

用户点击后：

```text
为什么给我这个？

因为你刚才说：
“我想发现点东西。”

我猜你现在更适合一个
可以直接进入的问题。

这个判断是推测，不是你的长期偏好。
```

如果用户近期确实有相关探索：

```text
你刚才刚好在探索“生命为什么会适应环境”。

所以我先给你一个相关、但方向不同的问题。
```

这里必须区分：

```text
事实
推测
未知
```

不能写：

> “因为你最近很喜欢生物。”

除非用户明确表达过。

---

# 9. “为什么是这个？”的设计边界

不能变成 AI 的长篇解释。

目标不是：

> 向用户解释模型架构。

目标是：

> 让用户知道“为什么现在看到这个”。

最多三层：

```text
为什么？
↓
基于什么
↓
你可以改变什么
```

例如：

```text
为什么是这个？

你刚才说想“随便发现点东西”。

我选择了一个：
- 不需要背景知识
- 30 秒内可以理解
- 后面可以自己操作

如果不喜欢，直接说“换一个”。
```

最后一句非常重要。

它重新把控制权交给用户。

---

# 10. 第一体验的选择策略

Experience Planner 输入：

```text
Current Intent
+
Current State
+
Energy
+
Novelty
+
Depth
+
Interaction Preference
+
Recent Exploration
+
Previous Rejections
```

输出：

```text
Experience Candidate
+
Expected Fit
+
Reason
+
Confidence
+
Alternative Candidates
```

例如：

```json
{
  "experience": {
    "type": "thought_experiment",
    "topic": "time",
    "depth": "medium",
    "interaction": "light"
  },
  "expected_fit": 0.87,
  "reason": {
    "explicit": [
      "user wants to discover something"
    ],
    "inferred": [
      "user appears open to novelty"
    ]
  }
}
```

注意：

**Planner 可以推测。**

但不能把推测直接写入用户长期画像。

---

# 11. Experience Selection Policy

优先级：

```text
Explicit Intent
      ↓
Current State
      ↓
Recent Context
      ↓
Stable Preference
      ↓
Exploration / Novelty
```

例如用户说：

> “今天特别累，但我想学点难的。”

不能因为：

```text
energy = low
```

就直接把内容变简单。

正确处理：

```text
Goal = difficult learning
Depth = high
Energy = low

→ 保留内容难度
→ 降低操作复杂度
→ 减少无意义输入
→ 让 AI 主动承担组织工作
```

这就是：

> **适应人的状态，而不是覆盖人的意图。**

---

# 12. Screen 03 不应该做什么

第一版明确禁止：

### 不做 Feed

没有：

```text
猜你喜欢
更多内容
热门
为你推荐
大家都在看
```

### 不做社交

没有：

```text
点赞
评论
关注
转发
粉丝
```

### 不做游戏化

没有：

```text
积分
等级
连续探索
勋章
任务
奖励
```

### 不做商业转化

没有：

```text
会员弹窗
广告
付费体验
推荐商品
```

### 不做复杂个人化设置

没有：

```text
选择你的兴趣
选择内容类型
选择人格
选择推荐算法
选择喜欢的主题
```

因为这些都是：

> **让用户替产品做管理工作。**

---

# 13. Screen 03 的状态机

```text
ENTERING
   ↓
LOADING_EXPERIENCE
   ↓
EXPERIENCE_READY
   │
   ├── START
   │      ↓
   │   EXPERIENCE_ACTIVE
   │
   ├── CHANGE
   │      ↓
   │   CANDIDATE_REJECTED
   │      ↓
   │   EXPERIENCE_RESELECT
   │      ↓
   │   EXPERIENCE_READY
   │
   ├── WHY_THIS
   │      ↓
   │   EXPLANATION
   │      ↓
   │   EXPERIENCE_READY
   │
   └── EXIT
          ↓
       SESSION_END
```

---

# 14. 必须支持中断

例如：

```text
AI：
“这个问题有意思的地方在于——”

用户：
“等等，我想问……”

```

系统必须：

```text
GENERATING
     ↓
USER_INTERRUPT
     ↓
CANCEL_GENERATION
     ↓
PROCESS_NEW_INPUT
```

而不是：

```text
AI继续说完
↓
再处理用户
```

这是体验引擎和普通内容播放器的关键区别之一。

---

# 15. Loading 状态

不要：

> “AI 正在思考……”

不要：

> “正在为你生成个性化内容……”

也不要暴露复杂模型过程。

理想状态：

```text
轻微、短暂的视觉过渡
```

如果超过阈值：

```text
正在准备一个体验…
```

同时允许：

```text
返回
```

不能让用户感觉：

> “我已经点了，就只能等。”

---

# 16. 第一体验生成时间

目标：

### 理想

< 2 秒

### 可接受

2–4 秒

### 超过 4 秒

应该开始采用：

```text
progressive rendering
```

先出现：

```text
体验类型
+
标题
```

再出现：

```text
Hook
```

而不是等完整 Experience 全部生成后才展示。

---

# 17. Experience Entry 的内容结构

内部标准：

```json
{
  "experience_id": "...",
  "type": "thought_experiment",

  "entry": {
    "label": "一个奇怪的问题",
    "title": "为什么有些树看起来死了，其实还活着？",
    "hook": "答案比想象中奇怪。",
    "primary_action": "开始探索",
    "secondary_action": "换一个"
  },

  "experience": {
    "first_layer": {},
    "possible_interactions": [],
    "possible_branches": []
  },

  "selection": {
    "intent_fit": 0.91,
    "novelty": 0.73,
    "effort": 0.21
  }
}
```

---

# 18. 体验选择不是单目标优化

不能：

```text
maximize_engagement
```

应该至少考虑：

```text
Fit
+
Curiosity
+
Novelty
+
Effort
+
Agency
+
Safety
```

概念上：

```text
Experience Score
=
Fit
×
Curiosity
×
Novelty
×
Agency
÷
Effort
```

但这只是产品研究阶段的概念模型。

V1 不应该过早把它固化成复杂 ML ranking。

第一阶段完全可以：

```text
规则
+
LLM structured output
+
少量人工策划 Experience
```

先证明行为，再优化算法。

---

# 19. 最重要的设计判断：什么叫“成功”？

Screen 03 成功不是：

> 用户点击了“开始探索”。

因为这只能证明按钮有效。

真正成功是：

```text
Experience Shown
        ↓
User Chooses
        ↓
User Forms Question / Action
        ↓
User Continues Intentionally
```

因此：

### Experience Entry CTR

可以看。

但不是核心指标。

真正核心：

### First Experience Fit

用户进入后是否认为：

> “这确实是我现在想做的。”

---

# 20. Screen 03 核心事件

```text
experience_requested
experience_generated
experience_shown

experience_started

experience_changed
experience_change_reason

why_this_opened
why_this_closed

experience_completed
experience_exited

user_interrupted
user_question_started
```

不要记录：

```text
每一次鼠标移动
每一次滑动距离
每一次停留毫秒
所有原始语音
```

除非这些数据有明确产品研究目的并经过必要的数据治理。

---

# 21. Screen 03 核心指标

### 1. First Experience Fit

进入体验后：

> “这个是我想要的吗？”

---

### 2. Start Rate

```text
Experience Started
/
Experience Shown
```

---

### 3. Natural Question Rate

进入后用户是否自然产生：

```text
为什么？
怎么回事？
那如果……？
真的假的？
能不能……
```

这是非常重要的。

因为：

> **问题的产生说明用户开始参与，而不只是消费。**

---

### 4. Change Rate

```text
Change Experience
/
Experience Shown
```

不能简单认为越低越好。

如果 Change Rate = 0：

可能是完美匹配。

也可能是：

> 用户根本不知道可以换。

所以必须和 Agency Score 一起看。

---

### 5. Voluntary Continuation

用户是否主动继续：

```text
问问题
+
改变参数
+
尝试分支
+
开始创造
```

---

# 22. Screen 03 的核心验收标准

第一次用户测试时，不问：

> “你喜欢这个产品吗？”

这种问题价值很低。

应该观察：

### Test 01

用户是否在 5 秒内理解：

> “这里在让我做什么？”

---

### Test 02

用户是否愿意点击：

> 开始探索

---

### Test 03

用户进入后是否自然问：

> “为什么？”

或者：

> “那如果……”

---

### Test 04

用户不喜欢时，是否知道：

> “换一个”

---

### Test 05

用户是否感觉：

> “我可以控制方向。”

---

### Test 06

用户是否认为：

> “这个东西是在跟着我变化。”

---

# 23. 最关键的失败测试

我们必须主动验证最危险的情况：

用户看完说：

> “挺有意思。”

然后离开。

如果大量发生：

**Screen 03 失败。**

因为我们做出来的是：

> AI Curiosity Content

而不是：

> Personal Experience Engine

真正希望出现的是：

```text
“挺有意思。”
      ↓
“为什么？”
      ↓
“那如果把它改一下呢？”
      ↓
“可以试试。”
      ↓
“我想把这个变成……”
```

也就是：

**发现 → 理解 → 提问 → 操作 → 创造**

---

# 24. Screen 03 的第一批 Experience

V1 不应该生成无限种 Experience。

先人工定义 5 个模板。

## Template A：反直觉问题

```text
一个奇怪的问题

为什么……
```

目标：

**Curiosity**

---

## Template B：现实模拟

```text
试试看

如果把 X 改变，
会发生什么？
```

目标：

**Interaction**

---

## Template C：思想实验

```text
想象一下

如果世界从今天开始……
```

目标：

**Reasoning**

---

## Template D：快速创造

```text
做个东西

我们可以把刚才这个想法
直接变成一个……
```

目标：

**Creation**

---

## Template E：轻松发现

```text
给你一个小发现

你可能不知道……
```

目标：

**Low Effort Discovery**

---

# 25. 五种体验不是五个栏目

这一点必须锁死。

用户不应该看到：

```text
探索
模拟
思想实验
创造
发现
```

然后自己选。

因为那又变成：

> 产品功能菜单。

正确方式是：

```text
用户表达状态 / 意图
        ↓
Experience Planner
        ↓
选择最合适的 Experience Type
```

类型是：

> **系统内部的能力。**

不是：

> **用户需要学习的产品结构。**

---

# 26. Screen 03 与 Screen 04 的边界

这是整个产品非常关键的一刀。

### Screen 03

回答：

> **“为什么值得进入？”**

### Screen 04

回答：

> **“这个东西到底是什么？”**

因此：

```text
Screen 03
一个问题
+
一个钩子
+
开始体验

        ↓

Screen 04
第一层理解
+
事实
+
解释
+
自然问题
```

如果 Screen 03 已经把答案讲完：

Screen 04 就失去意义。

如果 Screen 03 故意藏答案：

产品就变成 clickbait。

所以正确答案是：

> **给足进入理由，但不给不必要的完整解释。**

---

# 27. Screen 03 最终用户心理路径

理想状态：

```text
我刚才说：
“发现点东西。”

↓

它真的给了我一个东西。

↓

“这个问题有点怪。”

↓

“我想知道为什么。”

↓

我点进去。

↓

我开始问。

↓

它跟着我的问题改变。

↓

“等等，我可以自己试？”

↓

我开始操作。
```

这才是第一条真正属于这个产品的用户路径。

---

# 28. 产品经理最终判断

Screen 03 现在有一个非常明确的任务：

> **不要证明 AI 很聪明。**

而是证明：

> **AI 可以把“我现在想做什么”变成一个值得我亲自参与的体验。**

如果用户只是觉得：

> “AI 生成得不错。”

不够。

如果用户觉得：

> “它好像知道给我什么。”

还不够。

真正达到目标的信号是：

> **“我本来不知道自己想干什么，它给了我一个起点，但接下来是我自己决定往哪走。”**

这才是 **Personal Experience Engine** 的第一性产品体验。
