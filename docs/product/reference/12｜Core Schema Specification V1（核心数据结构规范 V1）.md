

# 12｜Core Schema Specification V1

## 核心数据结构规范 V1

**Document Status:** Product Engineering Contract\
**Version:** V1.0.0\
**Product:** Personal Experience Engine（个人体验引擎）

---

## 0. 背景：为什么现在需要 Core Schema

本产品最初的战略问题是：

> **AI 时代已经到来之后，下一代大众级数字产品会是什么形态？**

上一代互联网产品的核心单位主要是预先生产的内容。

AI 时代的重要变化是：

> 内容、交互、工具和体验都可以根据用户当下状态与意图即时生成。

因此，本产品不是单纯的内容消费产品，也不是传统聊天工具。

它的核心范式是：

```text
用户当前状态
      ↓
当前意图
      ↓
体验理解
      ↓
体验规划
      ↓
生成 / 搜索 / 工具 / 模拟 / 创造
      ↓
用户参与
      ↓
状态变化
      ↓
下一最佳体验
```

这意味着系统不能只理解“用户说了什么”。

系统必须持续理解：

- 用户现在处于什么状态
- 用户现在想做什么
- 当前体验进行到哪里
- 用户已经知道什么
- 用户还想知道什么
- 用户做过什么
- AI 当前被允许做什么
- 什么信息可以记住
- 下一步可以发生什么

因此，需要一套统一的核心数据模型。

**Core Schema 的目的，是定义整个 Personal Experience Engine 的“状态语言”。**

---

# 1. Schema 总体原则

## 1.1 Single Source of Truth（单一事实来源）

对于当前体验：

> **ExperienceState（体验状态）是唯一事实来源。**

UI、LLM、Analytics、Memory 都不能各自维护一套独立的体验状态。

```text
User Input
    ↓
Intent / Semantic Action
    ↓
Policy
    ↓
ExperienceState
    ↓
Runtime
    ↓
UI
```

UI 是 State 的投影。

LLM 是 Capability Provider（能力提供者）。

Policy 是 Decision Authority（决策权）。

Runtime 是 State Owner（状态运行时所有者）。

---

# 2. 七个核心对象

V1 固定以下七个核心对象：

```text
1. UserState
   用户状态

2. Intent
   当前意图

3. ExperienceState
   当前体验状态

4. CreationState
   当前创造状态

5. Memory
   长期 / 短期记忆对象

6. ExperienceCandidate
   下一体验候选

7. PolicyDecision
   策略决策
```

它们不是平级的普通数据对象。

关系如下：

```text
UserState
   │
   ├── Intent
   │      │
   │      ↓
   │  ExperienceCandidate
   │
   ↓
ExperienceState
   │
   ├── CreationState
   │
   ↓
PolicyDecision
   │
   ↓
Runtime Action
   │
   ↓
ExperienceState Update
   │
   ↓
Memory Candidate
   │
   ↓
Memory
```

---

# 3. UserState（用户状态）

## 3.1 定义

UserState 描述：

> **用户当前可能影响体验选择与交互成本的状态。**

它不是用户档案。

不是人格画像。

不是永久兴趣标签。

不是“AI 对用户的完整理解”。

---

## 3.2 V1 字段

```json
{
  "user_id": "string",

  "current_state": {
    "energy": "low | medium | high | unknown",
    "mood": "string | unknown",
    "attention": "low | medium | high | unknown",
    "openness": "low | medium | high | unknown"
  },

  "interaction_preference": {
    "depth": "light | medium | deep | adaptive",
    "interaction_cost": "low | medium | high | adaptive"
  },

  "source": {
    "explicit": [],
    "inferred": []
  },

  "confidence": 0.0,

  "updated_at": "ISO-8601",

  "version": 1
}
```

---

## 3.3 重要限制

UserState 不得直接推导长期偏好。

例如：

```text
今天很累
```

只能形成：

```text
energy = low
```

不能直接形成：

```text
user_preference = likes_low_effort_content
```

原因：

> **Current State（当前状态）≠ Stable Preference（稳定偏好）**

---

# 4. Intent（当前意图）

## 4.1 定义

Intent 描述：

> **用户此刻希望系统帮助他完成、体验或探索什么。**

Intent 是短期对象。

它拥有比 Memory 更高的优先级。

---

## 4.2 V1 Schema

```json
{
  "intent_id": "string",
  "goal": {
    "type": "explore | understand | create | relax | discover"
  },

  "state": {
    "value": "string | null"
  },

  "energy": {
    "value": "low | medium | high | unknown"
  },

  "openness": {
    "value": "low | medium | high | unknown"
  },

  "novelty": {
    "value": "low | medium | high | adaptive"
  },

  "depth": {
    "value": "light | medium | deep | adaptive"
  },

  "interaction": {
    "value": "passive | interactive | adaptive"
  },

  "duration": {
    "value": "short | medium | long | unknown"
  },

  "constraints": [],

  "source": {
    "explicit": [],
    "inferred": []
  },

  "confidence": 0.0,

  "status": "created | interpreted | assumed | active | changed | completed | abandoned",

  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

---

## 4.3 Intent 优先级

系统决策中的优先级：

```text
Explicit Intent
      ↓
Current State
      ↓
Recent Context
      ↓
Short-term Memory
      ↓
Long-term Memory
      ↓
Novelty
```

长期记忆不得覆盖明确的当前意图。

---

# 5. ExperienceState（当前体验状态）

## 5.1 定义

ExperienceState 是整个 Experience Runtime 的：

> **Single Source of Truth（单一事实来源）**

它回答：

> “我们现在正在进行什么体验，以及这个体验已经发生了什么？”

---

## 5.2 V1 Schema

```json
{
  "experience_id": "string",
  "experience_version": "string",
  "session_id": "string",

  "stage": "curiosity | understanding | simulation | branch | creation | completion",

  "goal": {
    "primary": "explore | understand | create | relax | discover",
    "secondary": null,
    "satisfaction": 0.0
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

---

## 5.3 ExperienceState 的所有权

允许：

```text
Experience Runtime
Policy Engine
State Transition Handler
```

通过规定的接口修改。

不允许：

```text
Frontend
LLM
Search Tool
Memory
Analytics
```

直接修改 ExperienceState。

---

# 6. CreationState（创造状态）

## 6.1 定义

CreationState 描述：

> **用户正在创造的对象，以及当前创作版本处于什么状态。**

Creation 不是独立产品。

它是 Experience Runtime 的一个分支。

---

## 6.2 V1 Schema

```json
{
  "creation_id": "string",

  "stage": "create_intent | plan | build | preview | modify | complete",

  "concept": {
    "description": "string"
  },

  "objects": [],

  "rules": [],

  "variables": {},

  "interactions": [],

  "presentation": {},

  "goal": {
    "description": "string"
  },

  "versions": [
    {
      "version": 1,
      "created_at": "ISO-8601",
      "change_type": "initial | patch | rollback"
    }
  ],

  "current_version": 1,

  "completion": {
    "is_complete": false,
    "reason": null
  }
}
```

---

## 6.3 Creation 原则

CreationState 必须支持：

```text
最小可用结果
      ↓
Preview
      ↓
用户修改
      ↓
Patch
      ↓
Preview
      ↓
继续 / 完成 / 撤销
```

禁止：

> 用户修改一个参数 → AI 整个项目重新生成。

---

# 7. Memory（记忆）

## 7.1 定义

Memory 描述：

> **可能对未来体验有持续价值的信息。**

Memory 不是 UserState 的延伸。

也不是用户画像数据库。

---

## 7.2 V1 Schema

```json
{
  "memory_id": "string",

  "value": "string",

  "type": "fact | inference | preference",

  "source": "explicit | inferred | behavioral",

  "confidence": 0.0,

  "created_at": "ISO-8601",

  "last_confirmed_at": null,

  "expires_at": null,

  "status": "candidate | active | decaying | expired"
}
```

---

## 7.3 Memory 写入原则

必须区分：

```text
Observed
↓
Candidate
↓
Policy Evaluation
↓
Active Memory
```

LLM 只能产生：

```text
memory_candidate
```

不能直接写入长期 Memory。

---

## 7.4 Memory 的最高原则

> **Memory informs; it never overrides current intent.**

中文：

> **记忆可以帮助理解当前用户，但不能替用户决定当前想做什么。**

---

# 8. ExperienceCandidate（体验候选）

## 8.1 定义

ExperienceCandidate 描述：

> **系统认为可能适合用户下一步发生的一段体验。**

它不是内容卡片。

不是推荐商品。

不是 Feed Item。

它是一个：

> **Potential Experience（潜在体验）**

---

## 8.2 V1 Schema

```json
{
  "candidate_id": "string",

  "experience_id": "string",

  "type": "question | simulation | story | tool | creation | discovery",

  "trigger": "intent | context | creation | state | exploration",

  "topic": null,

  "goal": "explore | understand | create | relax | discover",

  "depth": "light | medium | deep",

  "interaction_cost": "low | medium | high",

  "novelty": 0.0,

  "context_fit": 0.0,

  "intent_fit": 0.0,

  "state_fit": 0.0,

  "repetition_risk": 0.0,

  "agency_risk": 0.0,

  "confidence": 0.0,

  "selection_reason": null
}
```

---

# 9. PolicyDecision（策略决策）

## 9.1 定义

PolicyDecision 描述：

> **在当前状态下，系统被允许采取什么行动。**

PolicyDecision 是决策对象。

它不是内容。

---

## 9.2 V1 Schema

```json
{
  "decision_id": "string",

  "action": "ANSWER | EXPLAIN | ASK | WAIT | SIMULATE | CREATE | MODIFY | SEARCH | BRANCH | CHANGE_EXPERIENCE | SIMPLIFY | DEEPEN | REFRAME | STOP",

  "reason": {
    "semantic_action": null,
    "goal_progress": null,
    "experience_support": false
  },

  "target": {},

  "constraints": {
    "depth": "adaptive",
    "interaction": "adaptive"
  },

  "requires_tool": false,

  "state_transition": {
    "from": null,
    "to": null
  },

  "confidence": 0.0,

  "policy_version": "string"
}
```

---

# 10. 七个对象的权限关系

这是 V1 最重要的部分之一。

| 对象                        | 谁可以创建              | 谁可以修改              | LLM 能否直接修改 |
| ------------------------- | ------------------ | ------------------ | ---------- |
| UserState（用户状态）           | State Engine       | State Engine       | 否          |
| Intent（当前意图）              | Intent Engine      | Intent Engine      | 否          |
| ExperienceState（体验状态）     | Runtime            | Runtime            | **否**      |
| CreationState（创造状态）       | Creation Runtime   | Creation Runtime   | **否**      |
| Memory（记忆）                | Memory Policy      | Memory Policy      | **否**      |
| ExperienceCandidate（体验候选） | Experience Planner | Experience Planner | 可提出，不可直接生效 |
| PolicyDecision（策略决策）      | Policy Engine      | Policy Engine      | **否**      |

核心原则：

> **LLM 可以提出，但不能拥有系统状态。**

---

# 11. Fact / Inference / Unknown

所有涉及用户理解或知识判断的信息，都必须尽量区分：

```text
FACT
事实

INFERENCE
推断

UNKNOWN
未知
```

例如用户说：

> “我今天有点累。”

系统可以：

```text
Fact:
user_explicitly_said_energy_low

Inference:
likely_low_energy

Unknown:
whether_user_wants_low_interaction
```

不能直接把推断当成事实。

---

# 12. Versioning（版本控制）

所有影响产品行为的核心对象必须可追踪版本。

至少包括：

```text
experience_version
policy_version
schema_version
creation_version
```

示例：

```text
schema_v1.0.0
policy_v1.2.0
experience_v1.0.0
```

禁止：

> 修改 Prompt → 行为发生变化 → 没有版本记录。

如果 Prompt 修改导致：

- Policy 改变
- Intent 分类改变
- Memory 行为改变
- Experience 行为改变

则必须进入版本管理。

---

# 13. 不允许出现的设计

V1 明确禁止以下模式：

### 13.1 LLM 直接修改产品状态

错误：

```text
LLM
 ↓
ExperienceState.completed = true
```

正确：

```text
User Input
 ↓
LLM Interpretation
 ↓
Policy Decision
 ↓
Runtime State Transition
 ↓
ExperienceState
```

---

### 13.2 Frontend 自己决定产品逻辑

错误：

```text
用户点击“换一个”
 ↓
Frontend 自己调用推荐逻辑
```

正确：

```text
User Action
 ↓
Semantic Action
 ↓
Policy
 ↓
CHANGE_EXPERIENCE
 ↓
Candidate Selection
 ↓
Runtime
```

---

### 13.3 Memory 直接控制体验

错误：

```text
Memory:
“用户喜欢科学”

→ 永远推荐科学
```

正确：

```text
Current Intent
      ↓
Current State
      ↓
Experience Context
      ↓
Relevant Memory
      ↓
Candidate Selection
```

---

### 13.4 把 ExperienceCandidate 当成内容推荐

ExperienceCandidate 不回答：

> “用户应该看哪个内容？”

它回答：

> **“下一步什么体验可能最值得发生？”**

这是产品范式上的关键区别。

---

# 14. Schema 与整个产品战略的关系

最终整个系统应该形成：

```text
AI时代产品范式
        ↓
Personal Experience Engine
        ↓
UserState
        ↓
Intent
        ↓
ExperienceCandidate
        ↓
PolicyDecision
        ↓
ExperienceState
        ↓
CreationState
        ↓
Memory
        ↓
下一次体验
```

因此，Schema 不是工程细节。

它实际上是在把我们最初提出的：

> **“AI 时代下一代大众产品应该从内容消费走向生成式体验。”**

转化成可以运行、测试、观察和迭代的系统。

---

# 15. Core Schema V1 Definition of Done

只有满足以下条件，Core Schema V1 才算完成：

```text
[ ] 七个核心对象定义完成
[ ] 每个对象字段定义完成
[ ] 类型定义完成
[ ] Required / Optional 定义完成
[ ] 生命周期定义完成
[ ] Owner 定义完成
[ ] Read / Write 权限定义完成
[ ] LLM 权限边界定义完成
[ ] State / Intent / Memory 边界明确
[ ] Fact / Inference / Unknown 明确
[ ] Versioning 明确
[ ] 对象之间的关系明确
[ ] Forbidden Mutation 明确
[ ] Golden Cases 可映射
[ ] 能支撑后续 State Machine
```

**V1 完成之后，不再随意修改核心 Schema。**

后续如果发现问题：

```text
发现问题
↓
Schema Issue
↓
Product Review
↓
Architecture Review
↓
决定是否进入 V1.1 / V2
```

而不是让开发人员现场“顺手加一个字段”。

---

# 16. 下一阶段

Core Schema V1 完成后，下一项固定进入：

> **13｜State Machine Specification V1（状态机规范 V1）**

它解决的是另一个问题：

> **这些对象到底允许如何变化？**

Schema 定义：

> “系统里有什么。”

State Machine 定义：

> **“这些东西什么时候可以变成什么。”**

二者必须分开。

最终形成：

```text
Schema
“有什么”
      ↓
State Machine
“怎么变化”
      ↓
Policy
“什么时候允许变化”
      ↓
LLM Contract
“AI 可以参与什么”
      ↓
API
“工程如何调用”
      ↓
Evaluation
“如何证明它正确”
```

这才是进入真正工程开发之前必须完成的 **Product Engineering Contract（产品工程契约）**。
