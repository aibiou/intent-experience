# 08｜Experience Creation Runtime｜从体验到创造 V1

## 一、这一层要解决什么问题

前面的 Runtime 已经证明：

> 用户可以从“我好奇”进入“我理解”。

但如果产品停在这里，依然可能只是一个更好的 AI 内容产品。

Creation Runtime 要证明第二件事：

> **用户理解一个东西之后，可以自然地把它变成自己的东西。**

核心行为链：

```text
好奇
 ↓
理解
 ↓
尝试
 ↓
发现
 ↓
创造
 ↓
修改
 ↓
完成
```

因此 Creation Runtime 不是一个独立的“AI 创作工具”。

它应该是：

> **Experience Runtime 的一个自然分支。**

用户不需要退出当前体验，也不需要重新填写需求。

例如：

```text
用户：
如果没有摩擦，人怎么移动？

AI：
可以通过向相反方向抛东西，让自己获得反向运动。

用户：
这个可以做成一个小游戏。

错误产品：
好的，请描述你的游戏需求。

正确产品：
可以。
就沿着我们刚才这个机制做：
“没有摩擦的房间”。
你不能正常走路，只能通过抛东西移动。
我们先做一个最小可玩的版本。
```

这就是 Creation Runtime 的核心。

---

# 二、Creation Runtime 的核心原则

## 原则 01：上下文继承，而不是重新开始

用户已经在体验中产生了：

- 主题
- 理解
- 假设
- 变量
- 规则
- 偏好
- 已经尝试过的东西

这些都属于 Creation Context。

所以：

```text
Experience State
        ↓
Creation Context
        ↓
Creation Runtime
```

而不是：

```text
Experience
 ↓
退出
 ↓
打开创作工具
 ↓
重新描述需求
```

后者会直接破坏体验连续性。

---

# 三、什么情况下允许进入 Creation

Creation 不是看到用户有一点兴趣就主动诱导。

主要触发来自用户明确表达：

### 强触发

```text
我想做一个……
把这个做成……
这个能不能变成……
我想试着做……
我想把这个做出来
```

直接进入 Creation。

---

### 中等触发

```text
这个挺有意思的
如果把它做成游戏呢？
这个好像可以玩
```

AI 可以识别 Creation Intent，但默认不要立即创建大量内容。

应该先给一个低成本入口：

> 可以。我们先做一个最小版本。

然后开始。

---

### 弱触发

```text
有意思
哈哈
原来如此
```

不能因为这些话就进入 Creation。

否则系统会变得过度主动。

---

# 四、Creation Intent

Creation Intent 在数据层统一表示：

```json
{
  "goal": "create",
  "object": "game",
  "topic": "frictionless_world",
  "style": null,
  "complexity": "minimal",
  "audience": null,
  "interaction": "high",
  "constraints": [],
  "confidence": 0.94
}
```

注意：

大量字段可以为空。

系统不应该要求用户一次性提供：

- 类型
- 风格
- 尺寸
- 受众
- 难度
- 规则
- UI
- 交互
- 技术方案

这些都可以在创建过程中逐渐形成。

---

# 五、Creation Runtime 的基本状态机

```text
CREATE_INTENT
      ↓
CONTEXT_INHERIT
      ↓
CREATE_PLAN
      ↓
MINIMAL_BUILD
      ↓
PREVIEW
      ↓
USER_FEEDBACK
      │
      ├── MODIFY
      │
      ├── ADD
      │
      ├── REMOVE
      │
      ├── REFRAME
      │
      ├── SIMPLIFY
      │
      ├── DEEPEN
      │
      └── COMPLETE
```

最重要的是：

> **第一次创建必须尽快产生一个可感知结果。**

不是先生成一大段解释。

不是先让用户填写配置。

不是先展示复杂的创作面板。

---

# 六、第一版 Creation：最小可玩物

继续使用：

**frictionless_world_v1**

用户：

> 这个可以做成一个小游戏。

系统从当前 Experience State 自动继承：

```text
主题：
没有摩擦力的世界

用户已经理解：
没有摩擦 → 很难通过普通方式改变运动状态

核心变量：
friction
velocity
force

用户已经尝试：
改变摩擦力
观察运动

用户新的目标：
create game
```

Creation Runtime 不问：

> “你想做什么类型的游戏？”

而是直接提出最小版本：

```text
我们先做一个最小版本。

你在一个没有摩擦力的房间里。

你不能正常走路，
只能通过向相反方向扔东西让自己移动。

目标：

到达出口。

[开始玩]
```

这里有一个非常重要的产品原则：

> **AI 先做一个可玩的东西，再让用户修改。**

而不是：

> AI 先采访用户，再开始工作。

---

# 七、为什么必须是 Minimal Build

第一次创建如果直接生成完整作品，会出现三个问题：

### 1. 用户没有参与感

用户只是：

```text
输入一句话
↓
AI生成作品
↓
用户观看
```

仍然是消费。

---

### 2. 用户不知道自己能修改什么

如果作品太复杂：

> “我想改一下。”

系统也不知道从哪里改。

---

### 3. 生成成本过高

一次生成完整作品会同时涉及：

- 内容
- 视觉
- 规则
- 交互
- 状态
- UI
- 反馈

错误率会迅速增加。

所以 V1 应采用：

```text
Minimal Core
+
User Modification
```

而不是：

```text
Full Generation
```

---

# 八、Creation Runtime 的核心对象

Creation Runtime 内部维护：

```json
{
  "creation_id": "creation_001",
  "source_experience": "frictionless_world_v1",

  "concept": {
    "theme": "frictionless_world",
    "core_mechanic": "counter_force_movement",
    "goal": "reach_exit"
  },

  "objects": [
    "player",
    "throwable_object",
    "exit"
  ],

  "rules": [
    "player_cannot_walk_normally",
    "throwing_object_creates_opposite_motion",
    "reach_exit_to_complete"
  ],

  "variables": {
    "friction": 0,
    "player_velocity": 0,
    "object_count": 3
  },

  "user_changes": [],

  "version": 1
}
```

---

# 九、Creation Object Model

所有可创建体验最终都需要一个可修改的内部结构。

V1 可以抽象成：

```text
Creation
├── Concept
├── Objects
├── Rules
├── Variables
├── Interactions
├── Presentation
├── Goal
└── Versions
```

其中最重要的是：

### Concept

用户到底想做什么。

### Objects

里面有什么。

### Rules

它怎么运行。

### Variables

什么东西可以变化。

### Interactions

用户能做什么。

### Goal

什么时候算完成。

### Versions

用户每次修改之后的状态。

---

# 十、用户修改不能要求“重新描述”

这是 Creation Runtime 最重要的交互原则之一。

例如：

> 我想让它更难一点。

系统必须知道：

```text
它 = 当前游戏
更难 = difficulty modification
```

不能问：

> “请描述你想制作的游戏。”

---

## 修改类型

V1 至少识别：

```text
MODIFY
ADD
REMOVE
REPLACE
TUNE
SIMPLIFY
DEEPEN
REBALANCE
RENAME
RESTYLE
```

例如：

> 再加两个障碍。

→ ADD

> 把出口放远一点。

→ MODIFY

> 不要让东西无限飞。

→ MODIFY RULE

> 太难了。

→ REBALANCE

> 简单一点。

→ SIMPLIFY

> 做得更有科幻感。

→ RESTYLE

---

# 十一、Modification Runtime

用户说：

> 再加两个障碍。

系统内部：

```text
Current Creation
+
User Modification
↓
Modification Plan
↓
Patch
↓
Preview
```

不要重新生成整个作品。

即：

```text
Version 1
 ↓
Patch
 ↓
Version 2
```

而不是：

```text
Version 1
 ↓
重新生成
 ↓
Version 2
```

这样才能保持用户控制和稳定性。

---

# 十二、Creation Patch

内部采用类似：

```json
{
  "operation": "add",
  "target": "obstacle",
  "count": 2
}
```

例如：

> 把出口放远一点。

```json
{
  "operation": "modify",
  "target": "exit.position",
  "change": {
    "distance": "+30%"
  }
}
```

例如：

> 太难了。

系统可能生成：

```json
{
  "operation": "modify",
  "target": "difficulty",
  "change": {
    "obstacle_count": -1,
    "object_count": 2
  }
}
```

---

# 十三、Creation Runtime 中 AI 的职责

AI 负责：

### 理解

```text
“太难了”
```

→ 识别用户是在表达 Difficulty Feedback。

### 解释

如果用户问：

> 为什么我一直过不去？

AI 可以解释当前规则。

### 规划

把自然语言转换为修改计划。

### 生成

生成新的：

- 规则
- 内容
- 视觉
- 交互
- 文本

### 反思

判断修改是否破坏原来的核心体验。

---

# 十四、AI 不应该拥有的权力

AI 不应该：

- 自动扩大项目
- 自动添加大量功能
- 自动改变用户没要求的规则
- 自动发布
- 自动分享
- 自动保存成长期记忆
- 自动继续创作
- 因为用户表现出兴趣就不断生成

核心规则：

> **用户提出变化，AI执行变化。**

而不是：

> **AI不断猜测用户下一步想要什么。**

---

# 十五、Creation Policy

Creation Runtime 同样需要 Policy。

输入：

```text
Current Creation
+
User Intent
+
Modification Request
+
Experience State
```

输出：

```text
CREATE
MODIFY
PREVIEW
EXPLAIN
ASK
WAIT
COMPLETE
STOP
```

---

# 十六、Creation 中的 ASK 极其严格

原则：

> 能安全推断就直接做。

例如：

> “让它更难。”

不需要问：

> “你想增加障碍还是减少资源？”

直接做一个合理的最小修改。

---

但是：

> “把这个改成适合小朋友玩的。”

这可能影响：

- 内容
- 难度
- 交互
- 视觉\
  -语言

如果无法安全确定，可以只问一个高价值问题：

> “你更在意简单易懂，还是更偏向好玩？”

最多一个澄清问题。

---

# 十七、Creation 的“用户主权”

必须保证：

```text
AI 建议 ≠ AI 决定
```

例如：

> 我觉得可以再增加一个时间限制。

正确：

> 可以加一个时间限制。
>
> [加上]\
> [先不要]

或者更轻：

> 可以。我先给你试一个 30 秒版本。

但如果涉及明显不可逆变化，则必须确认。

---

# 十八、Preview 是 Creation Runtime 的核心

用户修改之后，不应该首先看到：

```text
修改成功。
```

而应该看到：

> **修改后的东西。**

也就是说：

```text
Intent
 ↓
Modification
 ↓
Preview
 ↓
User Judgment
```

用户通过体验判断修改是否正确。

这比让用户读 AI 的解释更自然。

---

# 十九、Creation 的反馈循环

核心循环：

```text
Create
 ↓
Try
 ↓
Feel
 ↓
Modify
 ↓
Try Again
 ↓
Modify
 ↓
Complete
```

这才是真正的 Creation Loop。

注意：

**Try / Feel 是非常重要的一步。**

如果用户只能说：

> “看起来不错。”

而不能直接使用、玩、运行、操作，那么 Creation Runtime 仍然偏向内容生成。

---

# 二十、不同 Creation 类型

V1 不需要开放所有类型。

优先支持：

### 1. 小游戏

最适合验证：

```text
理解 → 规则 → 操作 → 修改
```

### 2. 小型互动实验

例如：

- 改变重力
- 改变声音
- 改变光线
- 改变环境变量

### 3. 小型故事

用户可以：

- 改角色
- 改选择
- 改结局

### 4. 小型工具

例如：

> “把刚才这个变成一个计算器。”

### 5. 小型视觉作品

例如：

> “把这个概念画出来。”

但 V1 不应该同时把所有 Creation 类型做深。

---

# 二十一、V1 优先级

建议：

```text
小游戏
★★★★★

互动实验
★★★★☆

小型故事
★★★☆☆

小型工具
★★☆☆☆

视觉作品
★★☆☆☆
```

原因不是游戏更重要。

而是：

> **游戏最容易验证“理解 → 规则 → 操作 → 修改”的完整闭环。**

如果这个闭环成立，再扩展其他 Creation 类型。

---

# 二十二、Creation Screen UI

第一次进入：

```text
┌──────────────────────────────┐
│ ← 从刚才的体验继续            │
│                              │
│ 没有摩擦的房间                │
│                              │
│ 你不能正常走路。              │
│ 你只能通过抛东西移动自己。     │
│                              │
│        ┌──────────────┐      │
│        │              │      │
│        │      ●       │      │
│        │              │      │
│        │          □   │      │
│        │              │      │
│        └──────────────┘      │
│                              │
│ 目标：到达出口                │
│                              │
│ [开始玩]                     │
│                              │
│ 说一句话修改它…… 🎙          │
└──────────────────────────────┘
```

这里没有：

- 属性面板
- 参数表
- 时间线
- 图层
- 节点编辑器
- Prompt 输入框
- 复杂工具栏

这些都是 AI 可以替用户处理的复杂性。

---

# 二十三、用户修改时的 UI

用户：

> 出口再远一点。

系统：

```text
出口已移动。

[重新试试]
```

然后直接更新场景。

不需要：

```text
修改成功
参数：
Exit Position = 137
保存？
```

---

# 二十四、Creation 中的自然语言是主要控制方式

用户可以直接说：

```text
更难一点
简单一点
再快一点
换成晚上
加一个敌人
不要这个
把它变成两个人玩的
我想让它更搞笑
这个规则不合理
为什么会这样
我想换个结局
```

系统全部解释成：

```text
Semantic Action
+
Target
+
Modification
```

---

# 二十五、Creation 的“上下文继承”是核心竞争壁垒

假设用户经历：

```text
体验：
没有摩擦

↓
理解：
摩擦影响运动控制

↓
假设：
没有摩擦就无法正常移动

↓
尝试：
调整摩擦变量

↓
发现：
可以通过反向施力移动

↓
创造：
小游戏
```

最终形成：

```text
Experience Graph
```

而不是一条聊天记录。

例如：

```text
                    摩擦
                     │
             ┌───────┴───────┐
             ↓               ↓
          理解机制         用户假设
             │               │
             └───────┬───────┘
                     ↓
                  模拟
                     ↓
                  发现
                     ↓
                  游戏
                     ↓
                  修改
```

这会逐渐形成用户自己的：

> **Experience Graph**

---

# 二十六、Creation Graph

V1 数据层可以记录：

```json
{
  "source_experience": "frictionless_world_v1",

  "derived_creation": {
    "creation_id": "creation_001",
    "concept": "frictionless_room_game"
  },

  "transitions": [
    {
      "from": "understanding",
      "to": "creation",
      "trigger": "user_explicit_intent"
    }
  ]
}
```

长期来看，这比简单记录：

```text
用户点击了什么
```

更有价值。

因为它记录的是：

> **用户如何从理解走向创造。**

---

# 二十七、Creation Completion

完成不是：

> AI 已经生成了全部东西。

完成应该定义为：

> **用户认为当前结果已经达到自己的目标。**

Completion Signals：

```text
“好了”
“就这样”
“可以了”
“完成”
“这个就是我想要的”
```

或者明确结束当前任务。

此时：

```text
CREATION_COMPLETE
```

立即结束。

不应该出现：

> “还可以继续添加……”

不应该自动推荐：

> “要不要再做一个？”

---

# 二十八、Creation Versioning

V1 必须保留简单版本：

```text
V1
 ↓
V2
 ↓
V3
```

用户可以说：

> 刚才那个更好。

系统支持：

```text
RESTORE_PREVIOUS_VERSION
```

UI 不必做复杂版本管理。

只需要：

```text
[撤销刚才修改]
```

或者自然语言：

> “退回刚才那个。”

---

# 二十九、Creation Safety

Creation Runtime 必须有独立安全层。

尤其涉及：

- 外部发布
- 外部发送
- 真实世界操作
- 高风险内容
- 第三方数据
- 不可逆行为

内部创建可以快速。

外部动作必须提高确认门槛。

原则：

```text
内部可逆修改 → 低摩擦

外部不可逆行为 → 明确确认
```

---

# 三十、Creation Metrics

不能只看生成数量。

核心指标：

### 1. Creation Intent Rate

进入体验后主动产生创造意图的比例。

### 2. Creation Start Rate

提出创造后真正开始创建的比例。

### 3. First Build Completion

第一次最小作品是否成功生成。

### 4. First Interaction Rate

生成后用户是否真正操作。

### 5. Modification Rate

第一次创建后是否产生主动修改。

### 6. Iteration Depth

平均修改轮数。

注意：

不是越高越好。

过高可能意味着第一次生成质量差。

### 7. Creation Completion Rate

用户认为作品完成的比例。

### 8. Context Carryover Accuracy

从 Experience → Creation 的上下文继承准确率。

### 9. Re-description Rate

用户是否被迫重新描述已经表达过的信息。

这个指标应该：

> **越低越好。**

### 10. User Agency

用户是否感觉：

> “这是我做出来的。”

而不是：

> “AI 替我做出来的。”

---

# 三十一、最关键的 Creation 指标

我建议 V1 特别关注：

```text
Creation Start
        ↓
First Build
        ↓
First Interaction
        ↓
First Modification
        ↓
Completion
```

其中：

> **First Modification Rate**

可能比单纯 Creation Rate 更重要。

因为：

```text
用户生成一次
→ 看看
→ 离开
```

仍然可能是内容消费。

而：

```text
生成
→ 试
→ “这里不对”
→ 修改
→ 再试
```

才真正证明：

> 用户进入了创造循环。

---

# 三十二、Creation 的最大风险

## 风险一：AI 做得太好了

听起来反直觉。

如果用户：

```text
说一句话
↓
得到完整作品
↓
结束
```

用户没有创造过程。

产品重新变成：

> AI 生成内容。

所以 V1 不应该追求：

> 一句话生成完美作品。

而应该追求：

> **一句话产生一个可操作起点。**

---

## 风险二：AI 做得太差

如果第一次结果完全不能用：

```text
用户
↓
不停修 AI 的错误
```

用户会觉得自己在做 Prompt Engineering。

这也是失败。

所以核心目标是：

> **First Build 足够好，让用户开始修改，而不是开始修复。**

---

## 风险三：修改没有连续性

用户：

> 加一个敌人。

AI 重新生成整个游戏。

结果：

- 出口消失
- 规则改变
- 难度改变
- 视觉改变

用户会失去信任。

因此：

> Modification 必须优先采用 Patch，而不是 Full Regeneration。

---

# 三十三、Creation Runtime 的最终产品原则

```text
01. 用户表达想创造，立即进入创造。
02. 不要求用户重新描述已经发生的事情。
03. 先产生最小可用结果。
04. 结果必须可以直接操作。
05. 用户通过自然语言修改。
06. 修改优先采用增量 Patch。
07. AI 不自动扩大项目。
08. AI 不擅自改变用户未要求的规则。
09. 用户可以随时撤销。
10. 用户可以随时停止。
11. 完成由用户定义。
12. 不为了 Engagement 强迫迭代。
13. Creation 是 Experience 的延伸，不是独立工具。
14. 用户拥有创作方向，AI负责降低实现成本。
15. 最终目标不是“AI生成了什么”，而是“用户做出了什么”。
```

---

# 三十四、完整闭环

至此，我们已经可以把 V1 的核心体验闭合：

```text
                  HOME
                   │
                   ↓
                 INTENT
                   │
                   ↓
              FIRST EXPERIENCE
                   │
                   ↓
             EXPERIENCE RUNTIME
                   │
          ┌────────┼────────┐
          ↓        ↓        ↓
        ANSWER   EXPLORE   SIMULATE
          │        │        │
          └────────┼────────┘
                   ↓
                CREATE
                   │
                   ↓
              MINIMAL BUILD
                   │
                   ↓
                TRY
                   │
                   ↓
               MODIFY
                   │
                   ↓
               TRY AGAIN
                   │
                   ↓
              COMPLETE
                   │
                   ↓
                MEMORY
                   │
                   ↓
             NEXT EXPERIENCE
```

这才形成真正完整的：

> **Personal Experience Loop**

而不是：

> 用户 → AI → 内容 → 用户离开。

---

# 三十五、当前 V1 已经形成的核心系统

```text
01 Home
02 Intent Capture
03 First Experience
04 Experience Runtime
05 Understanding / Answering
06 Experience Policy
07 Memory & User State
08 Creation Runtime
```

它们共同组成：

```text
┌─────────────────────────────┐
│       Personal Experience   │
│           Engine            │
├─────────────────────────────┤
│                             │
│  User State                 │
│      ↓                      │
│  Intent Engine              │
│      ↓                      │
│  Experience Engine          │
│      ↓                      │
│  Experience Policy          │
│      ↓                      │
│  LLM / Search / Tools       │
│      ↓                      │
│  Runtime                    │
│      ↓                      │
│  Exploration / Creation     │
│      ↓                      │
│  Outcome                    │
│      ↓                      │
│  Memory                     │
│                             │
└─────────────────────────────┘
```

下一步不应该继续无止境堆功能。

**第 09 层应该进入“Experience Recommendation / Next Best Experience Engine”。**

但这里需要特别谨慎：它不是传统推荐系统。

真正需要解决的问题是：

> **当用户没有明确说“我想要什么”时，系统如何决定下一步给什么，同时又不侵犯用户自主权？**

这是整个产品最容易走偏的一层。

下一阶段应该直接定义 **09｜Next Best Experience Engine**，包括候选生成、选择策略、探索/熟悉度平衡、`“随便看看”` 的真实含义、`“换一个”` 如何改变候选空间，以及如何证明它不是传统 Feed。
