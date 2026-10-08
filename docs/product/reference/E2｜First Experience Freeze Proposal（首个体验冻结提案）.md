# P2-EVIDENCE-E2.0

## First Experience Freeze Proposal（首个体验冻结提案）

**Version：** 1.0\
**Status：** PROPOSAL / AWAITING PRODUCT FREEZE（提案 / 待产品冻结）\
**对应 Gate：** G7 P3 Scope Freeze（P3 范围冻结）\
**对应 Blocker：** PB-02 First Experience Type & Canonical Path（首个体验类型与标准路径）

---

# 1. 决策目标

P3 不验证“平台有多少能力”。

P3 只验证：

> **一个真实用户，能否从自然表达出发，进入一个 AI-native Experience，并在其中自然理解、追问、改变方向、纠正、停止，以及在合适情况下进入最小创造分支。**

因此首个体验必须满足：

```text
低进入成本
+
高自然交互密度
+
可中断
+
可改变方向
+
可纠错
+
可解释
+
可验证
+
状态可追踪
+
Policy 可验证
+
LLM 边界清晰
```

---

# 2. 首选方案

## E2-01｜探索型问题体验

**Experience Type：**

> Exploratory Question Experience（探索型问题体验）

核心形式：

```text
一个值得探索的问题
↓
第一层理解
↓
用户自然反应
↓
AI 根据当前状态继续
↓
WHY / WHAT IF / DEEPEN / SIMPLIFY / VERIFY
↓
CHANGE / CORRECTION / STOP
↓
必要时进入最小 CREATE
```

它不是传统问答页面。

它的核心不是：

> “AI 给用户一个答案。”

而是：

> **AI 给用户一个可以进入、理解、改变和继续探索的体验。**

---

# 3. 为什么选择它

## 3.1 覆盖核心 Product Thesis

产品 Thesis：

> Personal Context × Intent × Generative Experience

探索型问题可以直接验证：

```text
Current State
+
Current Intent
↓
Experience Candidate
↓
Generated Experience
↓
Real-time Adaptation
```

因此它不是一个单纯的 Chat Demo。

---

## 3.2 覆盖核心 Golden Suite

| Golden Case         | 覆盖情况   |
| ------------------- | ------ |
| G01 Direct Answer   | ✓      |
| G02 Why             | ✓      |
| G03 What If         | ✓      |
| G04 Creation        | ✓ 最小分支 |
| G05 Change          | ✓      |
| G06 Stop            | ✓      |
| G07 Correction      | ✓      |
| G08 Memory Boundary | ✓      |

这是选择该体验的关键原因之一。

如果一个体验无法自然覆盖 G01–G08，就不适合作为 P3 首个 Vertical Slice。

---

# 4. 用户标准路径

Canonical Path（标准路径）冻结候选：

```text
HOME
  ↓
Natural Intent
  ↓
Intent Understanding
  ↓
First Experience
  ↓
Experience Runtime
  ↓
Question / Deepen / What-If
  ↓
Change / Correction / Stop
  ↓
Minimal Creation Branch
  ↓
Policy Decision
  ↓
State Transition
  ↓
Runtime Execution
  ↓
Event / Decision Trace
  ↓
Golden Acceptance
```

注意：

这不是要求每个用户都走完整路径。

它是：

> **P3 系统必须能够合法支持的完整验证路径。**

---

# 5. 第一体验入口

推荐最小形式：

```text
一个奇怪的问题

为什么有些树看起来死了，
其实还活着？

答案比想象中奇怪。

[ 开始探索 → ]

换一个

为什么是这个？
```

这只是 Presentation Example（表现示例），不是最终视觉稿。

P3 真正冻结的是：

```text
Experience Type
Trigger
Initial State
Allowed Actions
State Transitions
Completion
Exit
Interrupt
Policy
Evaluation
```

而不是最终 UI 样式。

---

# 6. 第一体验的内部结构

## Stage 1｜Curiosity（好奇）

目标：

让用户愿意进入。

系统输出：

```text
Observation
+
One Interesting Point
+
One Natural Opening
```

禁止：

- 信息倾倒
- 长篇百科
- 强迫提问
- 制造虚假信息缺口
- “你想继续吗？”式留存话术

---

## Stage 2｜Understanding（理解）

用户可以：

```text
QUESTION
WHY
HOW
VERIFY
SIMPLIFY
DEEPEN
```

Policy 根据用户动作选择：

```text
ANSWER
EXPLAIN
SEARCH
SIMPLIFY
DEEPEN
WAIT
```

---

## Stage 3｜Simulation（模拟）

如果用户说：

> “那如果……？”

识别：

```text
Semantic Action = WHAT_IF
```

然后：

```text
WHAT_IF
↓
SIMULATE
↓
State Transition
↓
Simulation Result
```

必须区分：

```text
Fact
Inference
Hypothesis
Simulation
```

不得把模拟结果表现为事实。

---

## Stage 4｜Branch（分支）

用户可以改变方向：

```text
“那换个角度呢？”

“我其实更想知道……”

“这个我不感兴趣。”
```

系统：

```text
CHANGE_DIRECTION
↓
Cancel Current Generation
↓
Invalidate Old Candidate
↓
Preserve Valid Context
↓
New Intent / Direction
↓
Policy Re-evaluation
```

旧生成结果不得重新写入当前体验。

---

## Stage 5｜Creation（创造）

只有用户明确表达创造意图时进入：

```text
“那我们做一个出来。”

“能不能做个小游戏？”

“我想试试看。”
```

进入：

```text
CREATE
↓
CONTEXT_INHERIT
↓
MINIMAL_BUILD
↓
PREVIEW
↓
USER_FEEDBACK
```

不要求第一版就实现完整创作平台。

---

## Stage 6｜Completion（完成）

完成条件：

> 用户目标已经得到满足，或者用户明确结束。

特别是：

```text
“好了。”
“行了。”
“先这样。”
“不想继续了。”
```

必须能够：

```text
STOP
↓
EXIT
```

不能：

```text
STOP
↓
推荐下一个
↓
继续生成
↓
询问“要不要再来一个”
```

---

# 7. P3 必须冻结的 ExperienceState

最小状态：

```json
{
  "experience_id": "string",
  "experience_version": "string",
  "session_id": "string",

  "stage": "curiosity",

  "goal": {
    "primary": "understand",
    "secondary": null
  },

  "context": {
    "current_topic": null,
    "current_focus": null,
    "branch": null
  },

  "knowledge": {
    "confirmed": [],
    "inferred": [],
    "uncertain": []
  },

  "user_model": {
    "hypotheses": [],
    "questions": [],
    "known": []
  },

  "variables": {},

  "actions": [],
  "branches": [],

  "completion": {
    "is_complete": false,
    "reason": null
  },

  "control": {
    "waiting_for_user": true,
    "interruptible": true,
    "user_can_stop": true
  },

  "version": 1
}
```

P3 不得为展示方便而另外建立第二套“真实体验状态”。

---

# 8. P3 Allowed Action（允许动作）

首个体验允许：

```text
ANSWER
EXPLAIN
ASK
WAIT
SIMULATE
SEARCH
BRANCH
CHANGE_EXPERIENCE
SIMPLIFY
DEEPEN
REFRAME
CREATE
MODIFY
STOP
```

其中：

```text
STOP
CHANGE_EXPERIENCE
```

属于最高优先级控制动作。

---

# 9. P3 明确不冻结的内容

以下不属于 P3 首个体验冻结范围：

```text
完整推荐系统
完整 Memory Center
复杂用户画像
社交系统
Feed
关注
点赞
评论
排行榜
Trending
Creator Marketplace
Agent Marketplace
复杂多 Agent
RL Ranking
长期自动推荐
完整创作 IDE
复杂项目管理
完整作品版本管理 UI
商业化
通知系统
```

这些不是“以后一定做”。

当前只是：

> **不允许它们进入首个 Vertical Slice。**

---

# 10. 三个候选方案比较

| 方案      | 核心价值     | Golden 覆盖 | 工程复杂度 | P3 推荐  |
| ------- | -------- | --------: | ----: | ------ |
| 探索型问题体验 | 验证体验消费范式 |         高 |   低–中 | **首选** |
| 小型互动实验  | 强互动、强生成  |         高 |   中–高 | 第二选择   |
| 快速创造体验  | 验证 AI 创造 |         高 |     高 | 不作为首切片 |

---

# 11. 为什么暂不选择“小游戏”

小游戏看起来更接近“AI 生成体验”，但作为第一 Vertical Slice 有明显问题：

```text
Generation Complexity ↑
Runtime Complexity ↑
Rendering Complexity ↑
Creation State Complexity ↑
Debugging Complexity ↑
Evaluation Surface ↑
```

它很容易导致团队把 P3 变成：

> “先把 AI 游戏生成器做出来。”

这会偏离真正需要验证的：

> **Next Best Experience + Human Agency + Real-time Adaptation**

因此：

> **小游戏可以作为 Creation Branch 的测试对象，但不应成为第一体验的产品主轴。**

---

# 12. 为什么暂不选择“纯聊天”

纯聊天实现最容易，但验证价值最低。

因为它无法充分证明：

```text
Experience State
Policy
State Machine
Candidate
Experience Runtime
Completion
Agency
```

是否真的构成了一个新的产品单位。

如果 P3 最后只是：

> 用户输入 → LLM 回答

那么即使模型效果很好，也不能证明 Product Thesis。

---

# 13. P3 Vertical Slice 的最小成功定义

首个体验至少必须证明：

### A. Intent

用户一句自然表达可以进入合适体验。

### B. Fit

第一体验与当前 Intent / State 基本匹配。

### C. Adaptation

用户一句自然反应可以改变下一步体验。

### D. Agency

用户能够：

```text
Change
Correct
Stop
```

且系统不会抵抗。

### E. State Integrity

所有关键状态变化可追踪。

### F. Policy Integrity

LLM 不绕过 Policy。

### G. Runtime Integrity

旧生成不能污染新状态。

### H. Memory Boundary

长期记忆不能覆盖当前明确意图。

### I. Evaluation

G01–G08 可以执行并验收。

---

# 14. P3 Acceptance Skeleton（P3 验收骨架）

```text
P3 Product Pass
=
Intent Capture Pass
AND
First Experience Fit Pass
AND
Runtime Pass
AND
G01–G08 Pass
AND
State Integrity Pass
AND
Policy Boundary Pass
AND
LLM Boundary Pass
AND
Interrupt / Retry Pass
AND
Memory Boundary Pass
AND
Agency Pass
AND
Decision Trace Pass
AND
Regression Pass
```

任何一个核心项失败：

```text
P3 Product Pass = NO
```

---

# 15. E2 冻结决策

### 推荐冻结

```text
First Experience Type:
探索型问题体验

English:
Exploratory Question Experience

Primary Goal:
Explore / Understand

Secondary Capability:
What-If / Deepen / Verify / Create

Canonical Path:
Home
→ Natural Intent
→ Intent Understanding
→ First Experience
→ Runtime
→ Question / Deepen / What-If
→ Change / Correction / Stop / Minimal Creation
→ Policy
→ State Transition
→ Runtime
→ Trace
→ Acceptance
```

### 当前状态

```text
E2 = PROPOSAL

PB-02 = OPEN

G7 = BLOCKED
```

原因：

> 这是产品负责人应确认的冻结决策，不能由工程实现或 LLM 自行替产品做最终决定。

---

# 16. 冻结后产生的不可变约束

一旦 E2 正式批准：

```text
First Experience Type
Canonical Path
P3 In-Scope
P3 Out-of-Scope
P3 Deferred
```

均进入 P3 Engineering Contract。

之后：

> “实现起来比较麻烦”

不能成为改变产品范围的理由。

如果必须改变：

```text
Change ID
↓
Reason
↓
Impact Analysis
↓
Product Decision
↓
Contract Update
↓
Version Change
↓
Regression
```

不能静默修改。

---

# 17. 当前 P2 状态

```text
G1 Contract Authority Freeze
= BLOCKED

G2 Cross-Contract Consistency
= EVIDENCE PENDING

G3 Golden Suite
= EVIDENCE PENDING

G4 Engineering Boundary
= EVIDENCE PENDING

G5 Independent Evaluation
= EVIDENCE PENDING

G6 Product Debt / Open Decision
= EVIDENCE PENDING

G7 P3 Scope Freeze
= BLOCKED
  └─ 等待 PB-02 First Experience Freeze

G8 Formal Sign-off
= BLOCKED
```

因此：

```text
P2 = CLOSURE CANDIDATE / BLOCKED

P3 Entry Preparation = ALLOWED

P3 Implementation = BLOCKED
```

---

# 18. 下一执行顺序

当前严格执行：

```text
E1 Contract Authority Evidence
        │
        ├── C1–C7 authority
        ├── fingerprints
        ├── owners
        └── approvals
                 │
                 ▼
E2 First Experience Freeze
        │
        └── Product decision required
                 │
                 ▼
E3 Release-Gate Metric Definition
                 │
                 ▼
E4 Memory / Template Scope Decision
                 │
                 ▼
G1 / G7 closure candidates
                 │
                 ▼
G2 Cross-Contract Evidence
                 │
                 ▼
G3 Golden Execution
                 │
                 ▼
G4 Engineering Boundary
                 │
                 ▼
G5 Independent Evaluation
                 │
                 ▼
G6 Debt Closure
                 │
                 ▼
G8 Sign-off
                 │
                 ▼
P2 CLOSED
                 │
                 ▼
P3 IMPLEMENTATION
```

**本文件不宣称 E2 已冻结。**

当前唯一正式结论：

> **推荐“探索型问题体验（Exploratory Question Experience｜探索型问题体验）”作为 P3 首个 Vertical Slice；等待产品冻结确认。**
