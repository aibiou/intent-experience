

# V1 第一条完整 Experience

## Experience：如果世界突然失去摩擦力，会发生什么？

---

## 0. 为什么选择这个 Experience

第一条 Experience 不应该只是“一个有趣问题”。

它必须同时验证：

1. Home 能否接住用户当前意图
2. Intent Engine 能否正确理解自然语言
3. Experience Policy 能否决定下一步行为
4. Runtime 能否根据用户问题改变状态
5. 用户能否从理解自然进入 What-if
6. 用户能否从 What-if 自然进入创造
7. 用户能随时停止
8. AI 不会为了延长体验而强行追加内容

因此第一条 Experience 需要具备：

- 一个非常容易进入的问题
- 一个清晰的 mental model
- 一个可以操作的变量
- 一个自然的 What-if 分支
- 一个可以进一步创造的出口
- 明确的完成条件

选择：

> **如果世界突然失去摩擦力，会发生什么？**

这个问题的优势是：

- 不需要专业背景
- 很快形成直觉冲突
- 可以解释
- 可以模拟
- 可以改变变量
- 可以产生多个结果
- 最后可以变成小游戏/实验
- 用户不需要学习复杂产品机制

---

# 1. Experience Definition

```text
Experience ID
frictionless_world_v1

Experience Type
Thought Experiment + Simulation

Primary Goal
understand

Secondary Goals
explore
simulate
create

Expected Duration
30 seconds – 5 minutes

Interaction Level
low → medium → high

Depth
adaptive

Entry Requirement
none
```

核心 Experience：

```text
一个问题
↓
形成直觉
↓
解释基本机制
↓
用户提出 What-if
↓
改变一个变量
↓
观察结果
↓
用户形成自己的假设
↓
可选择创造
↓
自然结束
```

---

# 2. 用户真正看到的第一层

不是：

> 欢迎来到一个物理实验。

不是：

> 今天给你推荐一个思想实验。

而是：

```text
如果世界突然失去摩擦力，

会发生什么？

[开始试试 →]

换一个
为什么是这个？
```

这里的文案非常重要。

不要一开始解释：

> 摩擦力是阻碍两个接触表面相对运动的力……

因为这会把 Experience 变成教材。

第一层的任务只有一个：

> **让用户愿意进入。**

---

# 3. Home → Intent → Experience

## Case A：用户明确表达

用户：

> 我想找个有点奇怪的问题。

Intent：

```json
{
  "goal": "explore",
  "novelty": "high",
  "depth": "low",
  "interaction": "low",
  "duration": "short",
  "confidence": 0.93
}
```

Policy：

```text
candidate = frictionless_world
action = START_EXPERIENCE
```

直接进入。

不问：

> 你喜欢科学吗？

不问：

> 你想要物理、哲学还是心理学？

不让用户填写兴趣。

---

# 4. Screen 03 → Screen 04

用户点击：

> 开始试试 →

Runtime：

```text
ENTER
↓
CONTEXT_LOAD
↓
FIRST_LAYER
↓
WAIT
```

第一层内容：

```text
如果世界突然失去摩擦力，

很多我们习以为常的事情
会马上变得不一样。

比如：

你站着的时候，
其实鞋底和地面之间一直存在摩擦。

如果摩擦突然消失——

你可能根本没办法“站住”。

但真正奇怪的是：

汽车、门、铅笔、甚至走路，
都会开始出现完全不同的问题。

先试一个：

如果你正在房间里走路，
摩擦突然消失，

你觉得会发生什么？
```

然后：

```text
WAIT_FOR_USER
```

关键点：

**这里必须停。**

不能继续自动讲：

- 汽车会怎样
- 地球会怎样
- 飞机会怎样
- 人类会怎样
- 摩擦力的历史
- 牛顿定律

因为那是在优化内容消费，而不是推动用户体验。

---

# 5. 用户第一次回答

用户可能说：

> 我应该会直接摔倒吧？

Semantic Action：

```text
HYPOTHESIS
```

不是 QUESTION。

Runtime：

```text
user_hypothesis
=
"会直接摔倒"
```

Policy：

```text
action = EXPLAIN
```

回答：

```text
大概率会。

但还有一个更奇怪的问题：

你摔倒以后，
可能也很难“停下来”。

因为你原本能停下，
也是因为地面提供了摩擦。

所以问题不只是：

“还能不能走？”

而是：

“还能不能控制自己的运动？”

```

然后：

```text
WAIT_FOR_USER
```

再次等待。

---

# 6. 用户问“为什么？”

用户：

> 为什么？

Semantic Action：

```text
WHY
```

Context Resolver：

```text
target =
"为什么失去摩擦以后很难控制运动？"
```

Policy：

```text
ANSWER
```

回答：

```text
因为摩擦不只是“阻碍运动”。

它也负责让你改变运动状态。

比如你走路时：

脚向后推地面，
摩擦力让你的身体向前移动。

当你想停下来时，
摩擦又帮助你减速。

所以：

没有摩擦，
并不只是“东西滑得更快”。

而是：

很多原本负责控制运动的机制
一起消失了。
```

然后等待。

注意：

这里不需要返回 Home。

也不需要创建新页面。

这是同一个 Experience 的状态推进。

---

# 7. 用户开始形成自己的模型

用户：

> 那是不是只要动起来，就很难停？

Semantic Action：

```text
VERIFY + DEEPEN
```

Policy：

```text
ANSWER
```

回答：

```text
基本是这个方向。

不过还要区分两件事：

“没有摩擦”
不等于
“没有任何力”。

如果还有其他力，
你的运动仍然可能改变。

所以我们可以直接试一个。

```

这里第一次出现：

```text
SIMULATION_AVAILABLE
```

但不要强迫用户点击。

可以自然出现：

```text
[试试看]
```

同时保留：

```text
继续问…… 🎙
```

用户可以：

- 点击试试看
- 继续提问
- 离开

三者都是合法路径。

---

# 8. 进入 Simulation Runtime

用户点击：

> 试试看

Experience State：

```json
{
  "stage": "simulation",
  "current_topic": "motion_control",
  "current_variables": {
    "friction": 0,
    "initial_velocity": 1,
    "external_force": 0
  },
  "branch": "simulation"
}
```

UI 不应该变成传统表单。

不要：

```text
摩擦系数：
[____]

初速度：
[____]

外力：
[____]

[运行]
```

这是把 AI Experience 变成工程软件。

---

# 9. Simulation UI

应该尽可能直接：

```text
没有摩擦的地面

       ●
       →
────────────────

速度：██████

摩擦力：0

[让它停下来]
[给它一个推力]
```

用户点击：

> 给它一个推力

系统执行：

```text
USER_ACTION
    ↓
APPLY_FORCE
    ↓
SIMULATION
    ↓
STATE_UPDATE
    ↓
RENDER
```

结果：

```text
● ───────────────→
```

然后：

```text
刚才给它一个推力。

现在它会继续运动，
因为没有摩擦帮它减速。

```

这里不要马上追加：

> 那你还想试试改变质量吗？

应该等待。

---

# 10. 用户自然探索变量

用户：

> 那如果有一点点摩擦呢？

Semantic Action：

```text
WHAT_IF
```

Reference Resolver：

```text
target = friction
new_value = low
```

Policy：

```text
SIMULATE
```

直接执行。

结果：

```text
摩擦：一点点

● ────────────→
              ↓
             ↓
            ↓
           ●
```

解释：

```text
这一次它还是会向前运动，

但速度会逐渐下降。

所以真正关键的不是：

“有没有摩擦”。

而是：

“摩擦有多少，以及它作用在什么地方。”
```

然后等待。

---

# 11. 用户开始提出自己的问题

用户：

> 那如果人在没有摩擦的房间里，要怎么移动？

这是非常重要的行为。

因为用户已经从：

```text
接受信息
```

进入：

```text
使用模型解决新问题
```

Semantic Action：

```text
HOW
```

Policy：

```text
BRANCH
```

注意：

**不是重新开始一个新 Experience。**

当前 Experience：

```text
frictionless_world
```

进入：

```text
branch = human_movement
```

---

# 12. Human Movement Branch

回答：

```text
如果地面完全没有摩擦，

你不能像平常一样
“走路”。

但你仍然可以通过其他方式改变运动。

比如：

向后扔一个东西。

按照动量守恒，
你自己会向前移动。

所以：

没有摩擦以后，
“走路”消失了。

但“移动”没有消失。

只是移动方式改变了。
```

然后出现一个轻量操作：

```text
[扔一个东西试试]
```

用户点击。

系统展示：

```text
你
● ─────────→

物体
      ←────── ●
```

这里第一次让用户真正参与改变状态。

---

# 13. 用户进入 Creation

用户：

> 这个可以做成一个小游戏。

这是整个 V1 最重要的 Intent Mutation。

Semantic Action：

```text
CREATE
```

Policy：

```text
CREATE
```

不是：

> 好的，我可以帮你写一个小游戏。请告诉我游戏类型……

而是直接利用已有 Context。

当前已经知道：

```text
主题：
无摩擦世界

核心机制：
改变运动方式

用户已经理解：
没有摩擦 → 无法正常走路/停止

用户当前意图：
CREATE

已有变量：
friction
velocity
force
```

因此直接进入 Creation Runtime。

---

# 14. Creation Runtime

第一步不要生成 500 行代码。

先生成一个可以玩的最小规则：

```text
游戏目标：

你在一个没有摩擦力的房间里。

你不能正常走路。

你必须通过向相反方向扔东西，
让自己移动。

目标：

碰到出口。
```

然后：

```text
[开始玩]
```

---

# 15. 第一个可玩的版本

核心机制只有：

```text
Player
Object
Impulse
Position
Goal
```

用户：

> 我想让它更难一点。

Semantic Action：

```text
DEEPEN + MODIFY
```

Policy：

```text
CREATE_UPDATE
```

不要重新生成整个游戏。

只改变：

```text
difficulty
```

例如：

```text
出口位置改变
可投掷物数量减少
空间变窄
```

---

# 16. 用户说“算了”

用户：

> 算了，不想做了。

Semantic Action：

```text
STOP
```

Policy：

```text
STOP
```

系统：

```text
Experience Complete

原因：
user_stop
```

不能出现：

> 没关系！还有一个更有趣的挑战……

不能出现：

> 要不要试试困难模式？

不能出现：

> 根据你的兴趣，我还发现……

**直接结束。**

---

# 17. 另一种完成路径

用户没有进入 Creation。

而是在 Simulation 后说：

> 懂了。

Semantic Action：

```text
KNOWN / COMPLETION_SIGNAL
```

Policy：

```text
STOP
```

Experience：

```text
goal_satisfaction = high
completion = true
```

同样结束。

因为用户的目标只是理解。

---

# 18. Experience 的完整状态机

```text
                    ┌──────────────┐
                    │   ENTER      │
                    └──────┬───────┘
                           ↓
                    FIRST_LAYER
                           ↓
                     WAIT_USER
                           │
          ┌────────────────┼─────────────────┐
          ↓                ↓                 ↓
       QUESTION         HYPOTHESIS          STOP
          ↓                ↓                 ↓
        ANSWER          EXPLAIN            END
          ↓                ↓
        WAIT             WAIT
          │
          ├──────── WHAT_IF ────────→ SIMULATION
          │                              ↓
          │                           WAIT_USER
          │                              │
          │                     ┌────────┼────────┐
          │                     ↓        ↓        ↓
          │                   WHAT_IF   HOW      STOP
          │                     ↓        ↓        ↓
          │                 SIMULATE   BRANCH    END
          │                              ↓
          │                           WAIT_USER
          │
          ├──────── CREATE ─────────→ CREATION
          │                              ↓
          │                           CREATE
          │                              ↓
          │                           ITERATE
          │                              ↓
          │                     ┌────────┴────────┐
          │                     ↓                 ↓
          │                   STOP              CONTINUE
          │                     ↓
          │                    END
          │
          └──────── CHANGE ───────→ CHANGE_EXPERIENCE
```

---

# 19. Experience State 数据模型

```json
{
  "experience_id": "frictionless_world_v1",

  "stage": "simulation",

  "goal": {
    "primary": "understand",
    "satisfaction": 0.82
  },

  "knowledge": {
    "confirmed": [
      "friction_can_change_motion",
      "friction_can_enable_control"
    ],
    "inferred": [
      "user_understands_basic_motion_control"
    ],
    "uncertain": []
  },

  "user_model": {
    "hypotheses": [
      "without_friction_motion_is_hard_to_control"
    ],
    "questions": [
      "how_to_move_without_friction"
    ]
  },

  "variables": {
    "friction": 0,
    "velocity": 1,
    "external_force": 0
  },

  "branches": [
    "human_movement"
  ],

  "actions": [
    {
      "type": "what_if",
      "target": "friction"
    },
    {
      "type": "simulate",
      "target": "motion"
    }
  ],

  "completion": false,

  "exit_reason": null
}
```

---

# 20. AI 在这个 Experience 中到底负责什么

AI 不应该负责：

```text
决定什么时候继续
决定用户是否应该继续
决定什么时候推荐
决定用户是否应该看到更多
决定什么时候结束
```

AI 负责：

```text
理解自然语言
解释概念
回答问题
识别假设
生成模拟结果
生成创造方案
适配表达深度
处理用户纠正
```

Policy 负责：

```text
ANSWER
WAIT
SIMULATE
BRANCH
CREATE
CHANGE
STOP
```

Runtime 负责：

```text
执行状态变化
渲染体验
接受用户操作
保存 Experience State
```

这三层不能混。

---

# 21. Experience Template

为了让第一条 Experience 可以真正工程化，不应该把它写成一份长 Prompt。

应该定义模板：

```json
{
  "experience_id": "frictionless_world_v1",

  "entry": {
    "trigger": "curiosity",
    "question": "如果世界突然失去摩擦力，会发生什么？"
  },

  "stages": [
    "curiosity",
    "understanding",
    "simulation",
    "branch",
    "creation",
    "completion"
  ],

  "capabilities": [
    "explain",
    "answer",
    "simulate",
    "branch",
    "create"
  ],

  "variables": [
    "friction",
    "velocity",
    "external_force"
  ],

  "allowed_transitions": {
    "curiosity": [
      "understanding",
      "stop"
    ],
    "understanding": [
      "simulation",
      "branch",
      "creation",
      "stop"
    ],
    "simulation": [
      "simulation",
      "branch",
      "creation",
      "stop"
    ],
    "branch": [
      "simulation",
      "creation",
      "stop"
    ],
    "creation": [
      "creation",
      "stop"
    ]
  }
}
```

这就是未来 Experience Library 的最小原型。

---

# 22. 第一条 Experience 的真正产品价值

我们不是在证明：

> AI 可以讲一个有趣的物理知识。

我们要证明的是：

```text
用户说：
“我想找个有点奇怪的问题”

↓

系统理解当前意图

↓

给出一个值得进入的 Experience

↓

用户自然提问

↓

系统保持上下文

↓

用户提出：
“那如果……”

↓

系统改变 Experience

↓

用户开始操作

↓

用户说：
“这个可以做成一个小游戏”

↓

系统自然进入创造

↓

用户可以随时结束
```

这才是：

```text
Personal Context
×
Intent
×
Generative Experience
```

的第一次真实闭环。

---

# 23. V1 第一条 Experience 的硬性验收标准

## A. 意图

```text
用户一句自然语言
→
系统无需追问即可进入
```

目标：

> Direct Action Rate ≥ 80%

---

## B. 第一体验

用户进入后：

```text
10–20 秒内
```

至少出现一次：

```text
WHY
HOW
WHAT_IF
VERIFY
```

中的自然行为。

不是系统诱导出来的按钮点击。

---

## C. 上下文

用户说：

> 为什么？

系统必须知道“为什么什么”。

目标：

> Contextual Accuracy ≥ 90%

---

## D. 意图突变

用户：

> 我想把这个做成游戏。

必须：

```text
Understanding
→
Creation
```

不能：

```text
Home
→
重新输入
→
重新解释
```

---

## E. 停止

用户说：

> 好了。

必须：

```text
STOP
→
END
```

100% 不能追加内容。

---

## F. 改方向

用户说：

> 换一个。

必须：

```text
CANCEL
→
CHANGE_EXPERIENCE
```

而不是继续当前 Experience。

---

## G. 答案权

用户说：

> 直接告诉我。

必须：

```text
ANSWER
```

不能故意隐藏答案制造所谓“探索感”。

---

## H. Agency

测试用户应该能明确感觉：

> 我想继续就继续。\
> 我想问就问。\
> 我想改方向就改。\
> 我想做东西就做。\
> 我想走就走。

这比“平均使用时长”重要。

---

# 24. 第一条 Experience 不应该上线全部能力

第一版只实现：

```text
✓ Natural Input
✓ Experience State
✓ Answer
✓ Explain
✓ What-if
✓ One Simulation
✓ One Branch
✓ Minimal Creation
✓ Stop
✓ Change
```

暂时不实现：

```text
✗ 社交
✗ 分享
✗ 排行
✗ 关注
✗ 推荐流
✗ 复杂 Agent
✗ Creator Marketplace
✗ 长期个性化推荐
✗ 自动通知
✗ 游戏化
✗ 广告
```

原因非常简单：

**我们现在验证的是“Experience Engine”，不是整个产品生态。**

---

# 25. 第一条 Experience 的测试矩阵

至少准备以下 10 条真实用户路径：

| Case | 用户行为              | 预期                |
| ---- | ----------------- | ----------------- |
| 01   | 开始 → 问为什么         | 当前上下文回答           |
| 02   | 开始 → 说我已经知道了      | 跳过基础层             |
| 03   | 开始 → 直接告诉我        | 直接回答              |
| 04   | 开始 → What-if      | 进入 Simulation     |
| 05   | Simulation → 改变量  | 状态实时变化            |
| 06   | Simulation → 继续追问 | 保持上下文             |
| 07   | 理解 → 做成小游戏        | 进入 Creation       |
| 08   | 任意阶段 → 换一个        | 立即退出当前 Experience |
| 09   | 任意阶段 → 好了         | 立即结束              |
| 10   | AI 正在生成 → 用户打断    | 取消旧动作，处理新意图       |

---

# 26. 最危险的三个失败模式

### Failure 1：看起来很聪明，但用户只是看

```text
AI：
讲了一大段
↓
用户：
“哦”
↓
结束
```

这说明我们做成了 AI 内容。

不是 Experience Engine。

---

### Failure 2：用户开始玩，但不知道为什么

```text
AI：
“来试试看！”
↓
用户：
“为什么？”
```

如果用户不知道操作与理解之间的关系，说明 Interaction 是装饰。

每个交互都必须回答：

> 这个操作帮助用户理解什么？

---

### Failure 3：AI 太积极

```text
用户：
好了。

AI：
还有一个相关问题……
```

这是严重的 Agency Failure。

哪怕因此 session time 降低，也必须停止。

---

# 27. 这条 Experience 验证成功以后，才进入 Memory

因为到这里，我们第一次拥有：

```text
User
↓
Intent
↓
Experience
↓
Interaction
↓
State Change
↓
Outcome
```

下一层 Memory 才有真实的东西可以记。

而不是：

> 用户喜欢科学。

这种低价值、过度泛化的标签。

真正值得记忆的可能是：

```text
用户主动深入了一个问题
用户喜欢 What-if
用户从理解转向创造
用户对模拟型体验有较高完成度
```

但这仍然不能立即写进长期记忆。

这正是下一步 **Memory & User State Engine** 要严格解决的问题。

---

# 28. 当前阶段的产品结论

到这里，01–06 不再只是六个孤立模块：

```text
Home
↓
Intent
↓
Experience
↓
Runtime
↓
Understanding
↓
Policy
```

已经可以被压缩成一个真正的产品循环：

```text
用户现在想做什么
        ↓
系统理解
        ↓
给出一个具体 Experience
        ↓
用户行动
        ↓
Experience State 改变
        ↓
系统重新判断下一步
        ↓
用户继续 / 改变 / 创造 / 结束
```

而这正是我们第一阶段真正需要证明的产品假设：

> **AI 的价值不是替用户不断生成内容，而是让用户更低成本地进入、改变和完成一段属于自己的体验。**

因此下一步不应该继续堆页面。

下一步应严格进入：

**07｜Memory & User State Engine**

重点不是“怎么记更多”，而是反过来定义：

> **什么东西绝对不应该被记住？什么东西只属于今天？什么东西值得成为长期用户状态？以及用户如何知道、纠正和撤销这些判断。**

只有这一层做好，Personal Experience Engine 才不会从“懂我”滑向“监视我”。
