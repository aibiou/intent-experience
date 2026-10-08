# P3-S1-CC01｜Cross-Contract Consistency Specification

## 跨契约一致性规范

**Document ID：** P3-S1-CC01\
**Version：** 1.0.0\
**Status：** FREEZE CANDIDATE（冻结候选）\
**Scope：** P3-S1 Runtime Vertical Slice（运行时首个完整产品切片）\
**Dependencies：** C01～C09\
**Purpose：** 验证产品契约、状态、策略、模型、验证器、运行时及内容上下文之间不存在隐性冲突。

---

# 1. 一致性不是“模型回答得像不像”

本规范首先冻结一个原则：

> **Consistency（一致性）不是语言风格一致，而是同一世界、同一用户状态、同一体验状态下，系统对已经成立的事实、约束、状态和因果关系保持一致。**

因此：

```text
语言相似
≠
内容一致

角色名字没变
≠
角色状态一致

设定没变
≠
世界规则一致

每一集都好看
≠
整部内容成立
```

---

# 2. 一致性的五个层级

## CC-L1｜Contract Consistency（契约一致性）

检查：

```text
C01 Session
C02 Intent
C03 ExperienceState
C04 State Machine
C05 Semantic Action
C06 Policy
C07 LLM Gateway
C08 Validator
C09 Runtime
```

之间是否存在：

- 字段定义冲突
- 生命周期冲突
- 权限冲突
- 写入权冲突
- 状态转换冲突
- Action 定义冲突
- Policy 与 State Machine 冲突
- LLM 与 Runtime 边界冲突

---

## CC-L2｜State Consistency（状态一致性）

同一个：

```text
Session
Intent
Experience
```

在任何时刻只能存在一个合法的 Runtime State。

必须保证：

```text
State Version
+
State Machine
+
Runtime Single Writer
```

共同成立。

---

## CC-L3｜Context Consistency（上下文一致性）

模型在生成新内容时，必须区分：

```text
Current State
Current Intent
Established Facts
Current Experience Context
Historical Memory
Generated Content
```

不能把：

```text
模型上一轮猜测
```

自动升级成：

```text
产品事实
```

---

## CC-L4｜Narrative / Creation Consistency（内容创作一致性）

当产品进入内容创作场景时，必须保证跨内容单元：

```text
人物
世界观
时间
地点
事件
因果
关系
能力
资源
限制
用户已确认设定
```

的一致性。

---

## CC-L5｜Decision Consistency（决策一致性）

同样的：

```text
User Intent
+
Experience State
+
Policy
+
Constraints
```

不应该因为模型随机变化而产生违反产品规则的行为。

模型可以产生不同内容：

```text
内容可以不同
```

但不能产生：

```text
产品规则不同
```

---

# 3. Cross-Contract Authority Matrix（跨契约权威矩阵）

| 信息                | 权威来源                      | 其他组件                |
| ----------------- | ------------------------- | ------------------- |
| Session State     | C01 / Runtime             | 只读                  |
| Intent            | C02 / Runtime             | LLM 只能 Proposal     |
| ExperienceState   | C03 / Runtime             | 只读/提出 Mutation      |
| Legal Transition  | C04                       | Runtime 必须遵守        |
| Semantic Action   | C05                       | LLM 可 Proposal      |
| Policy Action     | C06                       | Policy 决定           |
| Model Selection   | C07 Router                | 不得改变 Product Policy |
| Proposal Validity | C08                       | 必须验证                |
| State Mutation    | C09                       | 只有 Runtime          |
| Event             | Event Contract            | 只记录                 |
| Decision Trace    | Trace                     | 只记录                 |
| Content Facts     | Experience/Creation State | LLM 不得自行升级          |
| Long-term Memory  | Memory Policy             | 不得覆盖 Current Intent |

核心原则：

> **任何一个组件都不能因为“自己更了解”而越权成为另一层的权威。**

---

# 4. CC-01｜Single Writer Consistency

必须证明：

```text
ExperienceState
Session
Active Intent
```

只有 Runtime 能实际写入。

禁止：

```text
LLM → State
Frontend → State
Memory → State
Analytics → State
Provider → State
```

---

# 5. CC-02｜STOP Consistency

STOP 必须在所有契约中保持同一语义：

```text
User
 ↓
STOP
 ↓
Policy STOP
 ↓
State Machine STOP
 ↓
Cancel Generation
 ↓
Invalidate Generation
 ↓
Runtime
 ↓
WAIT / SESSION END
```

任何模块不得解释成：

```text
STOP = “暂时停一下然后自动继续”
```

或者：

```text
STOP = “降低推荐强度”
```

---

# 6. CC-03｜CHANGE_DIRECTION Consistency

“换一个”必须同时满足：

```text
Semantic Action = CHANGE_DIRECTION
Policy Action = CHANGE
State Machine = Legal
Runtime = Invalidate Old Experience
LLM = New Proposal
Validator = Revalidate
```

旧生成结果：

> 即使成功返回，也必须视为 stale。

---

# 7. CC-04｜DIRECT_ANSWER Consistency

当用户明确要求答案：

```text
User
 ↓
DIRECT_ANSWER
 ↓
Policy ANSWER
 ↓
LLM / Knowledge Capability
 ↓
Validator
 ↓
Runtime
```

不能因为系统当前处于：

```text
Explore
Create
Deepen
```

而强制继续体验。

即：

> **当前用户明确需求优先于产品预设体验路径。**

---

# 8. CC-05｜Memory Consistency

必须保持：

```text
Current Intent
      >
Current User State
      >
Experience Context
      >
Memory
```

禁止：

```text
Memory
 ↓
直接产生 Policy Action
```

例如：

用户历史上喜欢科幻。

当前用户：

> “今天不想看科幻。”

则：

```text
Current Intent = 非科幻
Historical Preference = 科幻
```

最终：

```text
Current Intent wins.
```

---

# 9. CC-06｜LLM Consistency

必须证明：

> 不同模型可以产生不同 Proposal，但不能改变产品契约。

例如：

```text
Model A → Proposal A
Model B → Proposal B
Model C → Proposal C
```

只要：

```text
Intent
Policy
State Machine
Agency
```

均满足，三者都可以执行。

反之：

```text
Model A → 合法
Model B → 越权
```

则：

```text
Model B
 ↓
Validator
 ↓
REJECT
```

而不是修改产品规则迁就模型。

---

# 10. CC-07｜State Version Consistency

任何异步任务必须绑定：

```text
session_id
experience_id
generation_id
state_version
```

例如：

```text
State V10
 ↓
LLM Request
 ↓
User: 换一个
 ↓
State V11
 ↓
New LLM Request
```

旧请求返回：

```text
generation(V10)
```

必须：

```text
STALE_RESULT
```

不得写入 V11。

---

# 11. CC-08｜Validation Consistency

必须保持：

```text
LLM Response
≠
Executable Result
```

合法链：

```text
LLM Response
 ↓
Validator
 ↓
Policy
 ↓
State Machine
 ↓
Runtime
```

任何：

```text
LLM → Runtime
```

均为架构违规。

---

# 12. CC-09｜Analytics Consistency

Analytics 只能记录：

```text
Fact
Event
Decision
Metric
```

不得：

```text
Analytics
 ↓
Runtime Mutation
```

例如：

> “用户停留时间太短。”

不能直接导致：

> “系统自动增加内容。”

---

# 13. CC-10｜Cross-Experience Consistency

当一个体验结束、另一个体验开始时：

```text
Experience A
 ↓
Completion
 ↓
New Candidate
 ↓
Experience B
```

必须明确哪些信息：

```text
Carry Forward
```

哪些信息：

```text
Reset
```

哪些信息：

```text
Historical Only
```

禁止隐式继承。

---

# 14. CC-11｜Cross-Episode Creation Consistency

这是内容创作场景的核心检查。

当用户进行：

```text
Episode 1
→ Episode 2
→ Episode 3
→ ...
```

系统必须建立：

```text
Creation State
```

而不是单纯把上一集文本塞进下一次 Prompt。

---

# 15. Creation State（创作状态）

建议至少区分：

```text
World State
Character State
Timeline State
Relationship State
Event State
Resource State
Constraint State
Open Thread State
Confirmed Fact State
Generated-but-Unconfirmed State
```

例如：

```json
{
  "creation_id": "creation_xxx",
  "version": 12,

  "world": {},
  "characters": {},
  "timeline": {},
  "relationships": {},
  "events": {},

  "resources": {},
  "constraints": {},

  "open_threads": [],

  "confirmed_facts": [],
  "unconfirmed_generation": []
}
```

---

# 16. Confirmed Fact（已确认事实）

只有以下内容可以进入：

```text
Confirmed Fact
```

例如：

- 用户明确确认
- 已经正式写入创作状态
- 前序内容中已经被产品确认为 Canon
- 用户明确选择的设定

模型自己生成：

> “也许这个角色其实有一个妹妹。”

只能属于：

```text
Suggestion
```

不能直接变成：

```text
Confirmed Fact
```

---

# 17. Canon / Proposal Boundary（正史与提案边界）

必须区分：

```text
CANON
```

和：

```text
PROPOSAL
```

模型生成：

```text
Proposal
```

用户确认：

```text
Proposal → Canon
```

没有确认：

```text
Proposal ≠ Canon
```

这是跨集创作防止“模型自己改历史”的关键机制。

---

# 18. CC-12｜Cross-Episode Fact Consistency

对于 Episode N：

系统必须能够回答：

> 当前这一集引用的每一个关键事实来自哪里？

例如：

```text
Fact:
“主角已经失去右手。”

Source:
Episode 2 / Confirmed Event E-204
```

下一集不能出现：

> 主角突然使用双手操作。

除非存在：

```text
State Change Event
```

例如：

```text
医疗恢复
机械义肢
时间线重置
平行世界
用户主动修改设定
```

否则：

```text
Consistency Violation
```

---

# 19. CC-13｜Character State Consistency

角色状态必须可追踪：

```text
Physical State
Knowledge State
Relationship State
Location State
Goal State
Possession State
Capability State
```

例如：

Episode 3：

```text
Character A
Location = Tokyo
```

Episode 4：

```text
Character A
Location = London
```

系统必须存在：

```text
Transition Event
```

否则不能直接生成。

---

# 20. CC-14｜Timeline Consistency

所有重要事件必须可以映射到时间线：

```text
Event A
 ↓
Event B
 ↓
Event C
```

必须防止：

```text
B before A
```

以及：

```text
Character participates in event
before character was introduced.
```

时间冲突属于：

> Hard Consistency Error（硬一致性错误）

而不是“文风问题”。

---

# 21. CC-15｜Causal Consistency

不仅检查：

```text
发生了什么
```

还要检查：

```text
为什么能够发生
```

例如：

```text
Episode 2:
角色失去钥匙

Episode 4:
角色使用钥匙打开门
```

即使模型记住了“钥匙”这个词：

> 仍然属于因果一致性错误。

除非：

```text
获得新钥匙
复制钥匙
钥匙被归还
时间线改变
```

等事件成立。

---

# 22. CC-16｜Branch Consistency

当用户产生分支：

```text
What If A
```

不能污染：

```text
Main Timeline
```

必须区分：

```text
Main Branch
Alternative Branch A
Alternative Branch B
```

例如：

```text
主线：
角色没有进入城堡

What If：
角色进入城堡
```

What If 中产生的新事实：

> 默认不能写回 Main Branch。

---

# 23. CC-17｜Creation Modification Consistency

当用户说：

> “把第一集那个角色改成医生。”

系统不能只修改当前文本。

必须识别：

```text
Character State
 ↓
Related Episodes
 ↓
Affected Facts
 ↓
Affected Relationships
 ↓
Affected Events
```

然后计算：

```text
Impact Scope
```

最终让用户决定：

```text
仅修改当前集
```

还是：

```text
修改整个作品设定
```

---

# 24. CC-18｜Version Consistency

创作内容必须具备：

```text
Creation Version
Episode Version
State Version
Generation Version
```

例如：

```text
Creation V8
 ├─ Episode 1 V3
 ├─ Episode 2 V4
 └─ Episode 3 V2
```

不能出现：

```text
Episode 3
引用 Creation V6
```

却不知道为什么。

---

# 25. CC-19｜Generation Consistency

模型生成内容时必须绑定：

```text
creation_version
episode_version
state_version
prompt_version
model_version
```

因此可以回答：

> 这一段内容是在什么创作状态下生成的？

---

# 26. CC-20｜Regeneration Consistency

用户要求：

> “重新生成这一集。”

允许：

```text
文本不同
叙事方式不同
镜头不同
语言不同
```

但默认不能改变：

```text
Canon
Timeline
Character State
World Rules
Confirmed Constraints
```

除非用户明确修改设定。

---

# 27. Consistency Error Severity（错误等级）

### P0｜Critical

直接破坏产品可信度：

```text
Canon contradiction
Illegal state mutation
Cross-episode hard contradiction
Unauthorized branch pollution
State corruption
```

### P1｜Major

明显影响体验：

```text
Timeline contradiction
Character state contradiction
Causal contradiction
Constraint violation
```

### P2｜Moderate

影响连续性但可恢复：

```text
Minor context loss
Relationship drift
Non-critical detail inconsistency
```

### P3｜Cosmetic

```text
Style variation
Wording variation
Minor descriptive difference
```

---

# 28. Consistency Evaluation Matrix（最终评测矩阵）

至少必须覆盖：

| 维度        | 正常 | 异常 | 跨集 |
| --------- | -- | -- | -- |
| State     | ✓  | ✓  | ✓  |
| Intent    | ✓  | ✓  | ✓  |
| Policy    | ✓  | ✓  | ✓  |
| Model     | ✓  | ✓  | ✓  |
| Validator | ✓  | ✓  | ✓  |
| Timeline  | ✓  | ✓  | ✓  |
| Character | ✓  | ✓  | ✓  |
| World     | ✓  | ✓  | ✓  |
| Causality | ✓  | ✓  | ✓  |
| Branch    | ✓  | ✓  | ✓  |
| Version   | ✓  | ✓  | ✓  |
| Memory    | ✓  | ✓  | ✓  |

---

# 29. 核心验收原则

必须同时满足：

```text
Contract Consistency = PASS
AND
State Consistency = PASS
AND
Policy Consistency = PASS
AND
LLM Boundary = PASS
AND
Runtime Integrity = PASS
AND
Creation Consistency = PASS
```

不能用平均分掩盖硬错误。

例如：

```text
平均一致性 99%
```

如果存在：

```text
Episode 1:
角色已经死亡

Episode 5:
角色正常参加会议
```

则：

> **直接判定失败。**

---

# 30. 本规范的产品意义

最终要达到的不是：

> “模型记住了上一集。”

而是：

> **产品拥有一个可验证、可版本化、可追踪的世界状态；模型只是基于这个状态进行生成。**

因此未来的跨集创作架构应该逐渐形成：

```text
作品
 ↓
Canonical State（正史状态）
 ↓
Episode State（单集状态）
 ↓
Branch State（分支状态）
 ↓
Generation Proposal（生成提案）
 ↓
Validation
 ↓
User Confirmation
 ↓
Canonical Update
```

这比：

```text
上一集文本
 ↓
塞进 Prompt
 ↓
让模型续写
```

是完全不同的产品架构。

---

# 31. P3-S1-CC01 当前状态

```text
Contract Consistency
    DEFINED

State Consistency
    DEFINED

Creation Consistency
    DEFINED

Cross-Episode Consistency
    DEFINED

Branch Consistency
    DEFINED

Version Consistency
    DEFINED

Execution Evidence
    PENDING
```

因此：

> **本规范定义了检查标准，但不能把“定义完成”冒充成“验证通过”。**

下一步必须使用真实或构造的 Golden Cases（黄金案例）执行这些检查。
