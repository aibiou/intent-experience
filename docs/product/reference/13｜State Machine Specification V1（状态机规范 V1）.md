

# 13｜State Machine Specification V1

## 状态机规范 V1

**Document Status:** Product Engineering Contract\
**Version:** V1.0.0\
**Product:** Personal Experience Engine（个人体验引擎）

---

# 0. 本阶段承接关系

上一阶段：

> **12｜Core Schema Specification V1（核心数据结构规范 V1）**

解决的是：

> **系统里有什么对象？**

本阶段解决：

> **这些对象什么时候允许变化？**

下一阶段：

> **14｜Action & Policy Contract（动作与策略契约）**

解决：

> **用户做了某个动作以后，系统为什么允许进入某个状态，以及下一步允许做什么？**

因此：

```text
Core Schema
有什么
    ↓
State Machine
怎么变化
    ↓
Policy
为什么允许变化
    ↓
LLM Contract
AI 可以参与什么
```

---

# 1. 状态机的产品意义

本产品不是一个简单的聊天窗口。

用户的每一次输入，都可能改变：

- 当前意图
- 当前体验阶段
- 当前体验目标
- 当前知识状态
- 当前创造状态
- 当前决策上下文
- 是否应该继续
- 是否应该停止
- 是否应该切换体验

如果没有明确状态机，AI 很容易自行解释：

> “用户刚才问了一个问题，所以我继续讲。”

然后继续：

> “既然讲完了，我再推荐一个相关问题。”

最终产品就会从：

> **Experience（体验）**

滑向：

> **无边界 AI 对话。**

因此：

> **状态机是防止 AI 自行扩展产品行为的核心工程边界。**

---

# 2. 状态机总体原则

## 2.1 State is authoritative（状态具有最终权威）

任何产品行为必须基于当前合法状态。

不能因为 LLM 认为：

> “现在应该进入 simulation。”

就直接改变 State。

必须经过：

```text
User Event
↓
Semantic Action
↓
Policy Decision
↓
State Transition Validation
↓
State Update
```

---

# 3. V1 状态层级

系统 V1 使用四层状态：

```text
L0 Session State
    会话状态

L1 Intent State
    意图状态

L2 Experience State
    体验状态

L3 Creation State
    创造状态
```

Memory 不属于当前 Runtime State。

Memory 是跨 Session 的持久化信息。

---

# 4. Session State（会话状态）

V1：

```text
SESSION_IDLE
    ↓
SESSION_ACTIVE
    ↓
SESSION_ENDING
    ↓
SESSION_ENDED
```

## 4.1 SESSION_IDLE

用户尚未进入有效体验。

允许：

- 打开 Home
- 表达 Intent
- 开始探索
- 退出

---

## 4.2 SESSION_ACTIVE

至少存在一个有效的用户意图或体验上下文。

允许：

- 更新 Intent
- 开始 Experience
- 交互
- 创建
- 切换
- 停止

---

## 4.3 SESSION_ENDING

系统正在完成：

- 当前事件记录
- 状态保存
- 必要的 Memory Candidate 生成
- Decision Trace 写入

此状态非常短。

不允许启动新体验。

---

## 4.4 SESSION_ENDED

会话结束。

不允许：

- 自动开始新体验
- 自动推送内容
- 自动生成下一体验

如果用户再次操作：

> 创建新的 Session。

---

# 5. Intent State Machine（意图状态机）

V1：

```text
CREATED
   ↓
INTERPRETED
   ↓
ASSUMED / CONFIRMED
   ↓
ACTIVE
   ↓
COMPLETED
```

异常路径：

```text
INTERPRETED
   ↓
ABANDONED

ACTIVE
   ↓
CHANGED
```

---

# 6. Intent 状态定义

## 6.1 CREATED（已创建）

用户刚刚表达自然语言。

例如：

> “给我找点奇怪的东西。”

此时系统知道用户说了什么，但还没有完成语义解析。

---

## 6.2 INTERPRETED（已理解）

Intent Engine 已完成初步解释：

```text
goal = discover
novelty = high
depth = adaptive
```

但不代表所有信息都已确定。

---

## 6.3 ASSUMED（已合理假设）

当用户没有明确提供全部信息，但系统可以低风险行动时：

> **允许 Assumption。**

例如：

> “我想做点什么。”

系统可以：

```text
goal = create
type = unknown
```

然后直接进入低成本创作入口。

不得因为缺少所有字段而强迫用户填写。

---

## 6.4 CONFIRMED（已确认）

用户明确确认或明确表达了关键方向。

例如：

> “我想做一个小游戏。”

---

## 6.5 ACTIVE（生效中）

Intent 已成为当前 Session 的有效意图。

---

## 6.6 CHANGED（已改变）

用户明确改变方向。

例如：

> “换个东西。”

或者：

> “我不想做游戏了，给我讲点东西。”

旧 Intent：

```text
status = changed
```

新 Intent：

```text
status = active
```

---

## 6.7 COMPLETED（已完成）

当前 Intent 的用户目标已经满足。

---

## 6.8 ABANDONED（已放弃）

用户退出或中断当前意图，而没有完成目标。

---

# 7. Experience State Machine（体验状态机）

这是 V1 最重要的状态机。

核心状态：

```text
ENTERING
    ↓
READY
    ↓
ACTIVE
    ↓
WAITING
    ↓
ACTIVE
    ↓
COMPLETED
```

同时允许：

```text
READY
 ↓
CHANGE_DIRECTION

ACTIVE
 ↓
CHANGE_DIRECTION

ACTIVE
 ↓
STOP

WAITING
 ↓
STOP
```

---

# 8. Experience State 定义

## 8.1 ENTERING（进入中）

系统正在根据：

- Intent
- UserState
- Session Context
- Candidate

确定具体体验。

允许：

- Candidate Selection
- Experience Initialization

不允许：

- 用户已经看到完整体验内容后重新初始化
- 自动进入下一体验

---

# 9. READY（体验准备完成）

体验已经生成，可以向用户呈现。

例如：

> “如果世界突然失去摩擦力，会发生什么？”

此时：

```text
experience_id
experience_version
goal
stage
context
```

均已确定。

---

# 10. ACTIVE（体验进行中）

用户已经开始参与。

例如：

```text
User:
“那人还能走路吗？”
```

系统处理：

```text
QUESTION
↓
ANSWER
↓
State Update
↓
WAITING
```

---

# 11. WAITING（等待用户）

这是一个非常重要的产品状态。

含义：

> **系统已经完成当前应该完成的工作，现在等待用户决定下一步。**

WAITING 不是：

> “AI 没想好说什么。”

而是：

> **AI 有意不替用户继续决定。**

例如：

```text
AI:
“没有摩擦力时，人很难正常行走，因为脚无法获得足够的反作用力。

你可以继续问，也可以试试看如果人在这种环境里移动会发生什么。”
```

然后：

```text
waiting_for_user = true
```

系统不得自动追加：

> “另外还有一个有趣的现象……”

---

# 12. EXPERIENCE → STOP

用户说：

> “好了。”

或者：

> “先这样。”

或者点击结束。

统一映射：

```text
STOP
↓
EXPERIENCE_COMPLETED / EXIT
↓
SESSION_END 或回到 Home
```

核心原则：

> **停止本身是成功状态。**

不允许：

```text
STOP
↓
推荐下一个体验
```

除非用户主动请求下一步。

---

# 13. EXPERIENCE → CHANGE_DIRECTION

用户说：

> “换一个。”

系统必须：

```text
Cancel Current Generation
↓
Mark Current Candidate Rejected
↓
Update Intent / Experience Context
↓
Generate New Candidate
↓
READY
```

不得：

```text
旧体验继续生成
+
后台再生成新体验
```

---

# 14. Experience Stage Machine（体验阶段状态机）

ExperienceState 内部 stage：

```text
CURIOSITY
    ↓
UNDERSTANDING
    ↓
SIMULATION
    ↓
BRANCH
    ↓
CREATION
    ↓
COMPLETION
```

注意：

> **这些不是强制线性流程。**

体验可以跳转。

例如：

```text
CURIOSITY
↓
UNDERSTANDING
↓
CREATION
```

或者：

```text
CURIOSITY
↓
UNDERSTANDING
↓
SIMULATION
↓
UNDERSTANDING
```

---

# 15. Stage Transition Rules（阶段转换规则）

## 15.1 CURIOSITY → UNDERSTANDING

触发：

- 用户开始询问
- 用户请求解释
- 用户明确想理解

例如：

> “为什么？”

---

## 15.2 UNDERSTANDING → SIMULATION

触发：

> WHAT_IF

例如：

> “如果摩擦力不是 0，而是只有原来的 10% 呢？”

---

## 15.3 SIMULATION → SIMULATION

允许。

例如：

> “那如果速度再高一点呢？”

---

## 15.4 UNDERSTANDING → CREATION

触发：

> CREATE

例如：

> “这个可以做成一个小游戏。”

---

## 15.5 SIMULATION → CREATION

允许。

用户已经进行了模拟，并希望把它做成东西。

---

## 15.6 任意 ACTIVE Stage → COMPLETION

仅在：

- 用户明确 STOP
- 用户目标已经完成
- Experience Completion Condition 满足

时允许。

---

# 16. Creation State Machine（创造状态机）

V1：

```text
CREATE_INTENT
      ↓
PLAN
      ↓
BUILD
      ↓
PREVIEW
      ↓
MODIFY
      ↓
PREVIEW
      ↓
COMPLETE
```

---

# 17. CREATE_INTENT（创造意图）

用户表达：

> “做一个小游戏。”

或者：

> “这个能不能做成一个互动实验？”

系统确认用户存在明确创造方向。

---

# 18. PLAN（创建计划）

系统确定最小可用结果。

例如：

```text
Goal:
在无摩擦环境中移动到出口。

Core Mechanic:
通过抛掷物体改变自身运动。

Success:
到达出口。
```

V1 禁止：

> 自动增加排行榜、关卡、积分、角色系统等用户没有要求的内容。

---

# 19. BUILD（构建）

生成最小可用版本。

目标：

> **First Usable Result（第一次可用结果）**

而不是：

> “尽可能完整。”

---

# 20. PREVIEW（预览）

用户可以直接操作结果。

此时允许：

- MODIFY
- ADD
- REMOVE
- SIMPLIFY
- DEEPEN
- UNDO
- STOP

---

# 21. MODIFY（修改）

修改必须形成明确 Patch。

例如：

```json
{
  "operation": "modify",
  "target": "exit.position",
  "change": {
    "distance": "+30%"
  }
}
```

修改完成后：

```text
MODIFY
↓
BUILD PATCH
↓
PREVIEW
```

不得直接跳到 COMPLETE。

---

# 22. Creation → COMPLETE

完成条件：

### 条件 A

用户明确：

> “完成了。”

### 条件 B

用户明确表示结果已经达到目标。

### 条件 C

Creation Spec 定义的 Completion Condition 已满足。

---

# 23. Forbidden Transitions（禁止状态转换）

以下 V1 全部禁止。

## 23.1 LLM → State

```text
LLM
↓
直接修改 ExperienceState
```

禁止。

---

## 23.2 STOP → AUTO NEXT

```text
STOP
↓
自动推荐
```

禁止。

---

## 23.3 WAITING → AUTO CONTINUE

```text
WAITING
↓
系统自行继续
```

禁止。

---

## 23.4 CREATE → AUTO EXPANSION

```text
用户做小游戏
↓
AI 自动增加复杂系统
```

禁止。

---

## 23.5 Memory → Override Intent

```text
长期记忆
↓
覆盖当前明确意图
```

禁止。

---

## 23.6 CHANGE → Preserve Old Runtime

用户已经：

> “换一个。”

旧 Experience Runtime 必须被取消或冻结。

不得让旧体验继续占用生成资源。

---

# 24. Transition Contract（状态转换契约）

所有合法状态转换必须具备：

```json
{
  "transition": {
    "from": "understanding",
    "event": "WHAT_IF",
    "semantic_action": "WHAT_IF",
    "policy_action": "SIMULATE",
    "to": "simulation"
  }
}
```

必须能够回答：

1. 从哪里来？
2. 什么事件触发？
3. 用户的语义动作是什么？
4. Policy 允许什么 Action？
5. 到哪里去？

缺少其中任何一项：

> **不得执行状态转换。**

---

# 25. State Version Control（状态版本控制）

每一次 State Mutation 必须产生新的：

```text
state_version
```

例如：

```text
version 12
    ↓
USER_ACTION
    ↓
Policy Decision
    ↓
version 13
```

不得出现：

```text
多个服务
同时写入同一个 State
```

而没有版本检查。

---

# 26. Stale State Protection（过期状态保护）

如果两个请求同时修改状态：

```text
Request A
state_version = 12

Request B
state_version = 12
```

A 成功更新：

```text
state_version = 13
```

B 再写入时：

```text
expected_version = 12
actual_version = 13
```

必须拒绝：

```text
STATE_VERSION_CONFLICT
```

然后重新读取当前状态。

禁止覆盖最新状态。

---

# 27. Interrupt State Machine（中断状态机）

所有生成过程必须可中断。

```text
GENERATING
     ↓
USER_INTERRUPT
     ↓
CANCEL_REQUESTED
     ↓
CANCELLED
     ↓
PROCESS_NEW_INPUT
```

例如：

AI 正在回答。

用户突然说：

> “不对，我不是这个意思。”

必须：

```text
停止旧生成
↓
处理 CORRECTION
↓
更新理解
↓
继续当前体验
```

而不是等旧回答生成完再处理。

---

# 28. Correction（用户纠正）

这是 V1 的特殊状态事件。

例如：

> “不是这个意思。”

系统应：

```text
CURRENT INTERPRETATION
        ↓
MARK INCORRECT INFERENCE
        ↓
PRESERVE VALID CONTEXT
        ↓
REINTERPRET
        ↓
CONTINUE
```

重要原则：

> **纠正局部理解，不应默认清空整个体验上下文。**

---

# 29. Golden State Cases（黄金状态案例）

## Case 01：直接回答

```text
User:
“直接告诉我。”

Semantic Action:
DIRECT_ANSWER

Policy:
ANSWER

State:
保持当前 Stage
```

不得因为用户要求答案而强制进入互动。

---

## Case 02：为什么

```text
User:
“为什么？”

Semantic Action:
WHY

Policy:
ANSWER / EXPLAIN

State:
保持当前 Stage
```

---

## Case 03：What-if

```text
User:
“如果摩擦力不是 0 呢？”

Semantic Action:
WHAT_IF

Policy:
SIMULATE

State:
UNDERSTANDING
↓
SIMULATION
```

---

## Case 04：创造

```text
User:
“这个可以做成小游戏。”

Semantic Action:
CREATE

Policy:
CREATE

State:
UNDERSTANDING
↓
CREATION

Creation:
CREATE_INTENT
↓
PLAN
```

---

## Case 05：换一个

```text
User:
“换一个。”

Semantic Action:
CHANGE_DIRECTION

Policy:
CHANGE_EXPERIENCE

State:
CURRENT EXPERIENCE
↓
CANCEL
↓
NEW CANDIDATE
↓
READY
```

---

## Case 06：结束

```text
User:
“好了。”

Semantic Action:
STOP

Policy:
STOP

State:
ACTIVE
↓
COMPLETION
```

系统不自动产生下一体验。

---

## Case 07：纠正

```text
User:
“不是这个意思。”

Semantic Action:
CORRECTION

Policy:
REINTERPRET

State:
保留有效上下文
↓
修正错误推断
```

---

# 30. State Machine 不负责什么

状态机不负责：

- 选择最佳体验
- 判断用户喜欢什么
- 生成回答
- 搜索信息
- 生成创作内容
- 决定是否允许某个 Action

这些分别属于：

```text
Experience Planner
LLM / Capability
Search / Tool
Creation Runtime
Policy Engine
```

State Machine 只负责：

> **“当前状态是什么，以及某个合法事件是否允许状态转换。”**

---

# 31. 与下一阶段 Policy 的边界

状态机：

> **Can this state transition happen?（这个状态转换是否合法？）**

Policy：

> **Should this action happen now?（现在应该采取这个动作吗？）**

例如：

用户说：

> “如果速度再快一点呢？”

Semantic Action：

```text
WHAT_IF
```

Policy：

```text
SIMULATE
```

State Machine：

```text
UNDERSTANDING
→
SIMULATION
```

三个系统各司其职。

不能合并成一个巨大 AI Prompt。

---

# 32. State Machine Definition of Done

V1 完成必须满足：

```text
[ ] Session State 定义
[ ] Intent State 定义
[ ] Experience State 定义
[ ] Experience Stage 定义
[ ] Creation State 定义
[ ] 合法 Transition 定义
[ ] Forbidden Transition 定义
[ ] STOP 行为定义
[ ] WAIT 行为定义
[ ] CHANGE 行为定义
[ ] INTERRUPT 行为定义
[ ] CORRECTION 行为定义
[ ] State Version 定义
[ ] Stale State Protection 定义
[ ] Golden Cases 定义
[ ] 与 Policy 的边界定义
[ ] 与 LLM 的边界定义
```

完成标准：

> **任何核心状态变化，都能够从 Event → Semantic Action → Policy → Transition 完整追踪。**

---

# 33. 下一阶段

下一项固定进入：

> **14｜Action & Policy Contract V1（动作与策略契约 V1）**

它将正式冻结：

```text
用户说了什么
      ↓
Semantic Action
（语义动作）
      ↓
Policy Decision
（策略决策）
      ↓
Allowed Action
（允许执行的系统动作）
      ↓
State Transition
（状态转换）
```

重点解决一个核心问题：

> **AI 理解用户以后，到底“允许做什么”？**

这一步完成后，才能进入 LLM Contract。
