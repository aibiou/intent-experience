# P3-ENTRY-1.0

## Vertical Slice Entry Package（首个完整产品切片准入包）

**Version:** 1.0\
**Status:** ENTRY PREPARATION（准入准备）\
**P2 Status:** CLOSURE CANDIDATE / BLOCKED\
**P3 Implementation:** NOT YET AUTHORIZED\
**Product Owner Decision:** Proceed with P3 preparation

---

# 1. P3 的真正目标

P3 不负责证明：

- AI 很聪明；
- UI 很漂亮；
- 可以生成很多内容；
- 可以做一个完整游戏平台；
- 用户可以和 AI 长时间聊天。

P3 只验证一个核心产品命题：

> **AI 能否把用户当前意图和状态转化为一个可实时适配、可中断、可改变方向、可自然结束的体验。**

因此 P3 的成功标准不是 Feature Count，而是：

```text
Intent
  ↓
Experience
  ↓
Interaction
  ↓
Adaptation
  ↓
User Agency
  ↓
Return / Continue
```

---

# 2. First Vertical Slice（首个完整产品切片）

## 冻结候选

**Exploratory Question Experience（探索型问题体验）**

这是 P3 的第一个完整体验类型。

不是聊天机器人。

不是信息流。

不是搜索框。

不是游戏生成器。

而是：

> **用户进入一个问题/现象，AI 根据用户反应实时改变体验路径。**

---

# 3. Canonical User Journey（标准用户路径）

```text
HOME
 ↓
CURRENT INTENT
 ↓
INTENT UNDERSTANDING
 ↓
FIRST EXPERIENCE
 ↓
EXPERIENCE RUNTIME
 ↓
USER RESPONSE
 ↓
ADAPTATION
 ↓
DEEPEN / WHAT-IF / ANSWER / CREATE
 ↓
CHANGE / CORRECTION / STOP
 ↓
EXPERIENCE COMPLETION
 ↓
OPTIONAL NEXT EXPERIENCE
```

注意：

> “Optional Next Experience（可选下一体验）”不能自动发生。

只有用户明确要求：

- 再来一个；
- 换一个；
- 随便看看；
- 你决定；

才允许进入 Next Best Experience。

---

# 4. P3 Scope（P3 范围）

## 4.1 必须实现

### A. Home（首页）

必须支持：

- 自然语言输入；
- 基础语音输入可后置；
- 当前状态入口；
- 最近探索入口；
- 一个低认知负担的探索入口。

核心行为：

> 用户不需要学习产品。

---

### B. Intent Understanding（意图理解）

系统需要从自然语言中识别：

- Goal
- State
- Energy
- Openness
- Novelty
- Depth
- Interaction
- Duration
- Constraints
- Confidence

但：

> 不要求一次把所有字段填满。

---

### C. First Experience（首个体验）

第一屏只做：

```text
Observation
+
One Explanation
+
Natural Entry
```

避免：

- 长说明；
- 复杂导航；
- 多按钮；
- 解释 AI 是怎么工作的。

---

### D. Experience Runtime（体验运行时）

这是 P3 的核心。

必须支持：

```text
ANSWER
EXPLAIN
WHAT_IF
DEEPEN
SIMPLIFY
REFRAME
CREATE
MODIFY
CHANGE_EXPERIENCE
WAIT
STOP
```

---

### E. ExperienceState（体验状态）

必须成为：

> Single Source of Truth（唯一事实源）

UI 不得自行维护产品状态。

---

### F. Policy Engine（策略引擎）

必须实现：

```text
Safety
 ↓
Explicit User Direction
 ↓
STOP / CHANGE
 ↓
Current Goal
 ↓
Current Intent
 ↓
Current Experience State
 ↓
Current User State
 ↓
Session Context
 ↓
Memory
 ↓
Novelty
```

---

### G. LLM Gateway（大模型网关）

LLM 只能：

> Propose（提出建议）

不能：

> Decide / Authorize / Mutate（决定、授权、直接修改状态）

---

### H. Memory（记忆）

只实现：

> **Minimal Runtime Memory（最小运行时记忆能力）**

不做完整 Memory Center。

---

### I. Creation Branch（创造分支）

只实现最小能力：

> 用户可以把当前探索转化为一个简单可操作的东西。

例如：

```text
问题
 ↓
思想实验
 ↓
“我们把它做成个小游戏”
 ↓
Minimal Build
 ↓
Preview
 ↓
Modify
```

---

# 5. Explicit Non-Goals（明确不做）

P3 第一切片禁止扩张到：

### 社交

- 关注
- 粉丝
- 点赞
- 评论
- 排行
- 社区

### 信息流

- 无限 Feed
- 热榜
- Trending
- 推荐流
- 内容频道

### 商业化

- 广告
- 积分
- 会员体系
- 虚拟商品

### AI 平台化

- Agent Marketplace
- Creator Marketplace
- Multi-Agent System
- RL Recommendation
- Autonomous Agent Network

### 创作平台化

- 完整 IDE
- 项目管理
- 模板市场
- 通用 Experience Builder
- 大型游戏引擎

---

# 6. P3 Architecture（P3 架构）

P3 不允许重新设计架构。

采用 P2 冻结的原则：

```text
Frontend
    ↓
Product API
    ↓
Experience Runtime
    ↓
State Engine
    ↓
Intent Engine
    ↓
Policy Engine
    ↓
LLM Gateway / Search / Tool
    ↓
Validator
    ↓
State Update
    ↓
Event / Decision Trace
```

其中：

```text
LLM ≠ Policy
LLM ≠ State
LLM ≠ Memory Authority
LLM ≠ Completion Authority
```

---

# 7. P3 Core State（核心状态）

第一切片必须至少维护：

```text
SessionState
IntentState
ExperienceState
CreationState
```

Memory 独立存在。

---

# 8. ExperienceState Minimum Schema（最小体验状态）

```json
{
  "experience_id": "exp_xxx",
  "experience_version": "v1",
  "session_id": "session_xxx",
  "stage": "UNDERSTANDING",
  "goal": "...",
  "context": {},
  "knowledge": [],
  "user_actions": [],
  "branches": [],
  "completion": {
    "status": "active"
  },
  "control": {
    "interruptible": true,
    "waiting_for_user": false
  },
  "state_version": 12
}
```

所有状态变化：

> `state_version + 1`

---

# 9. First Experience Design（首个体验设计）

第一切片建议使用：

> **“一个奇怪的问题”**

示例：

> 为什么有些树看起来已经死了，其实还活着？

然后：

> “答案比想象中奇怪。”

用户可以：

- 开始探索；
- 为什么；
- 换一个；
- 直接问；
- 深入；
- 做个假设；
- 停止。

---

# 10. Runtime Behavior（运行时行为）

标准循环：

```text
Trigger
 ↓
First Layer
 ↓
User Response
 ↓
Semantic Action
 ↓
Policy
 ↓
Action
 ↓
Experience Adaptation
 ↓
State Update
 ↓
Next Layer / WAIT / STOP
```

---

# 11. Critical Interaction Rules（关键交互规则）

### 用户问问题

直接回答。

### 用户说“为什么”

解释当前对象。

### 用户说“那如果……”

进入 WHAT_IF / SIMULATION。

### 用户说“换一个”

立即改变当前体验方向。

### 用户说“不是这个意思”

进行 CORRECTION。

### 用户说“好了”

停止。

### 用户什么都不说

不得自动无限推进。

进入：

> WAIT

---

# 12. WAIT（等待）不是失败

P3 明确把 WAIT 当作合法产品状态。

例如：

```text
AI
 ↓
提供一个有意义的体验节点
 ↓
等待用户决定
```

而不是：

```text
AI
 ↓
用户没反应
 ↓
继续生成
 ↓
继续推荐
 ↓
继续刺激
```

---

# 13. Next Best Experience（下一最佳体验）

P3 只做最小版本。

候选来源：

```text
Current Intent
Current State
Current Experience
Session Context
Relevant Memory
Novelty
```

但选择逻辑：

> Rules + Structured LLM Classification + Simple Scoring

不做：

- Deep Ranking
- RL
- 黑盒推荐模型

---

# 14. “换一个”机制

第一版固定：

```text
第一次
→ 改变主题

第二次
→ 改变体验类型

第三次
→ 降低认知负担

第四次
→ 最多一次自然澄清
```

目的：

> 学习用户拒绝信号，而不是逼用户填写偏好表。

---

# 15. Memory Boundary（记忆边界）

P3 必须支持：

> “记住这个。”

以及：

> “不要记这个。”

并正确区分：

> “今天不要这个。”

和：

> “以后不要这个。”

第一条是当前状态。

第二条才可能形成长期偏好。

---

# 16. Creation Boundary（创造边界）

P3 Creation 只验证：

> 用户是否真的能够从理解进入创造。

第一版本必须：

```text
Context Inherit
 ↓
Minimal Build
 ↓
Preview
 ↓
Modify
 ↓
Stop
```

不能自动扩展。

---

# 17. P3 Metrics（P3 核心指标）

P3 不使用 Session Time 作为核心指标。

第一层：

### First Experience Fit

用户第一次进入体验后：

> 是否符合当前 Intent？

---

### Intent Fulfillment

用户目标是否得到满足。

---

### Intent Change Recovery

用户改变方向后：

> 系统能否快速恢复正确状态？

---

### Agency Blocker Rate

目标：

> **0**

---

### Completion Correctness

系统是否正确判断：

- 完成；
- 停止；
- 未完成。

---

### State Integrity

目标：

> **0 violation**

---

### Creation Start Rate

作为学习指标，不作为硬产品门槛。

---

# 18. P3 Acceptance Gates（P3 验收闸门）

## Gate A — Contract Integrity

必须：

- C1–C7 一致；
- 无 P0；
- State Machine 正确；
- Policy 正确。

---

## Gate B — Golden Suite

G01–G08：

> 全部 PASS。

---

## Gate C — Runtime Integrity

必须：

- STOP 正确；
- CHANGE 正确；
- State Version 正确；
- stale write 拒绝；
- interrupt 正确。

---

## Gate D — Experience Quality

至少验证：

- First Experience Fit
- Intent Fulfillment
- Correction Recovery
- Completion Correctness

---

## Gate E — Agency

必须：

> Agency Blocker = 0

---

# 19. P3 Definition of Done（完成定义）

P3 不是：

> “页面做完了。”

而是：

```text
User can enter
      ↓
Intent is understood
      ↓
Experience begins
      ↓
Experience adapts
      ↓
User can ask
      ↓
User can change
      ↓
User can create
      ↓
User can stop
      ↓
State remains correct
      ↓
All decisions are observable
```

并且：

> G01–G08 + Contract Tests + Scenario Matrix + Engineering Boundary 全部通过。

---

# 20. P3 Engineering Task Structure（工程任务结构）

每个 AI Coding Task 必须采用：

```text
Task
Context
Contract
Inputs
Outputs
State
Allowed Actions
Forbidden Actions
APIs
Events
Tests
Acceptance
```

禁止：

> “帮我把这个功能做出来。”

这种模糊任务不得进入工程队列。

---

# 21. P3 Workstream（工程工作流）

P3 分成六条并行但有依赖关系的工作流：

### W1 Runtime Foundation（运行时基础）

- Session
- Intent
- ExperienceState
- State Machine
- State Version

### W2 Policy & LLM（策略与模型）

- Semantic Action
- Policy Decision
- LLM Gateway
- Validator

### W3 Experience（体验）

- First Experience
- Runtime interaction
- Change
- Stop
- Wait

### W4 Memory & Creation（记忆与创造）

- Minimal Memory
- Creation Branch
- Modify

### W5 Observability（可观测性）

- Events
- Decision Trace
- Replay
- Evaluation hooks

### W6 Frontend（前端）

- Home
- Intent input
- Experience runtime
- Creation preview
- Stop / Change

---

# 22. Dependency Order（依赖顺序）

禁止六条线完全自由并行。

正确顺序：

```text
Schema
 ↓
State Machine
 ↓
Runtime
 ↓
Policy
 ↓
LLM Gateway
 ↓
Experience
 ↓
Creation / Memory
 ↓
Frontend Polish
```

Observability 从第一天进入。

不是最后补 Analytics。

---

# 23. AI Coding Governance（AI 编码治理）

AI Coding Agent：

### 可以

- 实现明确 Task；
- 编写测试；
- 运行测试；
- 提交失败报告；
- 提出实现方案。

### 不可以

- 自己决定产品行为；
- 修改 Contract；
- 改 Golden Case；
- 降低验收标准；
- 删除失败测试；
- 绕过 Policy；
- 让 LLM 直接写 State；
- 为 Demo 硬编码行为。

核心规则：

> **不猜、不扩、不改、不绕。**

---

# 24. P3 Product Debt（P3 产品债务）

进入实现后，任何发现的模糊需求必须进入：

> Product Debt Register（产品债务登记册）

而不是：

> “先随便实现。”

分类：

```text
P3-Blocker
P3-Defer
P3-Experiment
Implementation Bug
Contract Conflict
```

---

# 25. P3 First Sprint（首个执行 Sprint）

第一 Sprint 不做完整产品。

目标：

> **跑通一个没有漂亮 UI 的完整 Runtime Vertical Slice。**

最小链路：

```text
User Input
 ↓
Intent
 ↓
ExperienceState
 ↓
Semantic Action
 ↓
Policy
 ↓
LLM Proposal
 ↓
Validator
 ↓
Runtime
 ↓
State Update
 ↓
Event
 ↓
Decision Trace
```

只需要支持：

```text
DIRECT_ANSWER
WHY
WHAT_IF
CHANGE
STOP
```

这是最重要的技术验证。

---

# 26. Sprint 1 不做什么

明确禁止：

- 大量模板；
- 完整 Creation；
- 完整 Memory UI；
- 推荐系统；
- 登录体系；
- 社交；
- 商业化；
- 动画打磨；
- 多模型编排；
- Agent Marketplace。

如果 Sprint 1 开始出现这些：

> Product Owner 应直接裁掉。

---

# 27. Sprint 1 Acceptance（首 Sprint 验收）

必须完成：

### S1-01

一个用户输入能够创建 Intent。

### S1-02

Intent 能启动 Experience。

### S1-03

ExperienceState 能被 Runtime 正确维护。

### S1-04

LLM 只能提出 Proposal。

### S1-05

Policy 决定 Action。

### S1-06

State Machine 决定 Transition。

### S1-07

用户说“换一个”可以中断。

### S1-08

用户说“好了”可以停止。

### S1-09

旧 generation 不能覆盖新 State。

### S1-10

每次关键决策有 Decision Trace。

---

# 28. Sprint 1 Definition of Done

只有以下全部成立：

```text
Schema ✓
State Machine ✓
Runtime ✓
Policy ✓
LLM Boundary ✓
STOP ✓
CHANGE ✓
State Version ✓
Event ✓
Decision Trace ✓
Golden Cases subset ✓
```

才允许进入 Sprint 2。

---

# 29. Sprint 2

Sprint 2 才增加：

- First Experience polish
- DEEPEN
- SIMPLIFY
- REFRAME
- Creation Branch
- Minimal Memory
- Search / Tool
- full Golden Suite

---

# 30. Sprint 3

Sprint 3：

> **Experience Quality + Evaluation**

重点：

- Scenario Matrix
- Fault Injection
- Replay
- Agency Evaluation
- First Experience Fit
- Intent Fulfillment
- Correction Recovery
- Completion Correctness

---

# 31. P3 Milestones（里程碑）

```text
P3-M0
Contract Freeze
        ↓
P3-M1
Runtime Vertical Slice
        ↓
P3-M2
Experience Vertical Slice
        ↓
P3-M3
Creation + Memory Boundary
        ↓
P3-M4
Golden / Scenario / Fault Evaluation
        ↓
P3-M5
Internal Product Review
        ↓
P4 Internal Test
```

---

# 32. Product Owner Rule（负责人规则）

从 P3 开始，任何新增需求必须回答：

1. 它解决哪个用户问题？
2. 它发生在哪个 User Moment？
3. 它改变哪个行为？
4. 它是否增强 Core Loop？
5. 它是否增加 Agency Risk？
6. 它增加多少 State？
7. 它增加多少 Policy？
8. 它是否必须现在做？

如果只是：

> “AI 可以做到。”

答案：

> **不做。**

---

# 33. Current Decision（当前负责人决策）

正式确定：

### P3 First Vertical Slice

> **Exploratory Question Experience（探索型问题体验）**

### First Technical Objective

> **Runtime Vertical Slice（运行时首个完整切片）**

### First User Capability

> **用户可以自然表达一个意图，并进入一个可以实时适配的体验。**

### First Agency Proof

> **用户可以随时问、改、换、停。**

### First Technical Proof

> **LLM 无法绕过 Policy / State Machine / Runtime。**

### First Product Proof

> **用户不是在“使用一个 AI 工具”，而是在经历一个由 AI 实时组织和适配的体验。**

---

# 34. Current Stage Status

```text
P0 Product Foundation
        COMPLETE

P1 Product System Definition
        COMPLETE

P2 Product Engineering Contract
        CLOSURE CANDIDATE
        EXIT GATE NOT PASSED

P3 Entry Preparation
        ACTIVE

P3 Implementation
        NOT YET AUTHORIZED

P3 Sprint 1
        READY TO SPECIFY
```

---

# 35. Next Concrete Deliverable

下一份正式产物不是继续做宏观规划。

而是：

> **P3-S1｜Runtime Vertical Slice Specification（运行时首个完整产品切片规范）**

它会把 Sprint 1 拆成真正可以交给工程 / AI Coding Team 的任务：

```text
S1-01 Session
S1-02 Intent
S1-03 ExperienceState
S1-04 State Machine
S1-05 Semantic Action
S1-06 Policy
S1-07 LLM Gateway
S1-08 Validator
S1-09 Runtime
S1-10 STOP
S1-11 CHANGE
S1-12 State Version
S1-13 Events
S1-14 Decision Trace
S1-15 Golden Subset
```

每一个任务都会有：

> **输入 → 输出 → 状态 → API → 事件 → 禁止行为 → 测试 → Acceptance**

**P3 现在正式进入“从产品契约到可执行 Runtime”的阶段。**
