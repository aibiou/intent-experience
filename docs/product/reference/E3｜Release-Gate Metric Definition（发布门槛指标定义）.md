# P2-EVIDENCE-E3.0

## E3｜Release-Gate Metric Definition（发布门槛指标定义）

**Document Version:** 1.0\
**Status:** PROPOSAL / AWAITING PRODUCT APPROVAL（提案 / 待产品批准）\
**Corresponding Gate:** G6｜Product Debt / Open Decision（产品债务与未决决策）\
**Related Blocker:** PB-03｜Release-Gate Metric Definitions（发布门槛指标定义）

---

## 1. Purpose（目的）

本文件只解决一个问题：

> **哪些指标具备“发布阻断”资格，以及这些指标必须如何被定义和验证。**

必须严格区分：

```text
Product Metric（产品指标）
        ↓
用于理解产品质量与用户行为

Release-Gate Metric（发布门槛指标）
        ↓
用于决定某一版本是否允许发布
```

不是所有产品指标都可以成为 Release Gate。

尤其不能出现：

```text
指标不好
↓
为了让指标变好
↓
改变 Policy / Runtime / Experience
```

正确关系必须是：

```text
Frozen Product Contract
        ↓
Acceptance Criteria
        ↓
Release-Gate Metrics
        ↓
Release Decision
```

指标不能反向修改产品契约。

---

# 2. Metric Governance（指标治理原则）

## 2.1 Hard Acceptance 优先于统计指标

以下行为不能依赖统计指标判断：

- STOP 是否立即生效
- CHANGE_DIRECTION 是否取消旧体验
- stale write 是否被拒绝
- LLM 是否绕过 Policy
- LLM 是否直接修改 State
- Memory 是否覆盖当前 Intent
- Frontend 是否绕过 Product API
- Analytics 是否控制 Runtime
- 是否存在隐藏 continuation
- 用户是否拥有自然退出权

这些必须是：

> **Hard Acceptance Criteria（硬验收标准）**

而不是：

> “99% 的时候都正确”。

即：

```text
STOP ignored once
→ P0 Blocker
→ Release Block
```

而不是：

```text
STOP success rate = 99.5%
→ 看起来不错
→ 继续发布
```

---

# 3. Release-Gate Classification（发布门槛分类）

P3 建议将发布判断分为四层。

### GATE-A｜Contract Integrity Gate（契约完整性门槛）

判断系统是否违反产品/工程契约。

包括：

- State Integrity
- Policy Compliance
- LLM Boundary
- Memory Boundary
- Agency Blockers
- API Boundary
- Analytics Boundary

特点：

> **零容忍。**

任何 P0 级违反直接 BLOCK。

---

### GATE-B｜Core Experience Quality Gate（核心体验质量门槛）

判断用户是否真正进入了正确体验。

候选：

- First Experience Fit
- Intent Fulfillment
- Intent Correction Recovery
- Experience Completion

这些是统计型指标，需要定义 population、window、calculation、threshold。

---

### GATE-C｜Engineering Reliability Gate（工程可靠性门槛）

判断系统是否具备可运行性。

包括：

- State Version Conflict handling
- Idempotency
- Interruptibility
- Stale Result Rejection
- LLM Timeout Recovery
- Tool Failure Recovery
- Latency

其中关键完整性行为属于 Hard Acceptance；性能指标可以采用统计阈值。

---

### GATE-D｜Product Learning Metrics（产品学习指标）

用于产品迭代，但默认不阻断 P3 发布：

- Voluntary Return Rate
- Deepening Rate
- Creation Start Rate
- First Modification Rate
- Natural Question Rate
- Exploration Rate
- Long-term Memory Usefulness
- Session Time
- Message Count

这些指标不能因为“看起来不好”而直接阻止 Vertical Slice。

---

# 4. Proposed P3 Release-Gate Metrics（P3 建议发布门槛指标）

以下为**建议定义，不代表已经批准的最终阈值**。

---

## RG-01｜First Experience Fit（首个体验匹配度）

### Purpose（目的）

判断用户表达当前意图后，系统给出的第一个体验是否与用户当前目标/状态基本匹配。

### Population（统计人群）

进入 P3 首个 Experience、且 Intent Resolution 成功的用户会话。

### Numerator（分子）

满足以下条件的首个体验：

- 与 Explicit Intent 不冲突
- 与 Current Intent Goal 一致
- 不违反明确 Constraint
- 用户无需立即纠正方向
- 进入体验后没有立即发生无意义的 CHANGE

### Denominator（分母）

符合统计资格的首个 Experience 会话。

### Calculation（计算）

```text
First Experience Fit
=
符合 Fit 标准的首次体验数
/
符合统计条件的首次体验总数
```

### Evidence Source（证据来源）

- Intent State
- Experience Candidate
- Policy Decision
- Experience Entered Event
- CHANGE_DIRECTION Event
- Decision Trace
- Evaluation Annotation

### Gate Type

**Proposed Release Gate**

### Threshold

**TBD — Product Owner Approval Required**

不得由 Engineering 或 AI Coding Team 自行设定。

### Related Golden Cases

- G01 Direct Answer
- G04 Creation
- G05 Change
- G07 Correction
- G08 Memory Boundary

---

# 5. RG-02｜Intent Fulfillment（意图完成度）

### Purpose

判断系统是否真正帮助用户完成当前明确目标，而不是仅仅产生内容。

### Population

具有明确或足够明确 Current Intent 的有效体验会话。

### Numerator

用户目标达到可接受完成状态的会话。

### Denominator

符合统计条件的 Intent 会话。

### Calculation

```text
Intent Fulfillment
=
达到 Intent Completion Criteria 的会话数
/
有效 Intent 会话总数
```

### Completion Criteria

必须由 Experience Spec 定义。

禁止使用：

```text
session ended
message count increased
time spent increased
```

作为完成的代理变量。

### Evidence

- Intent State
- Experience State
- Completion Event
- User Action
- Decision Trace
- Evaluation Annotation

### Gate Type

**Proposed Release Gate**

### Threshold

**TBD**

### Related Golden Cases

G01 / G02 / G03 / G04 / G05 / G07

---

# 6. RG-03｜Agency Blocker Rate（用户自主权阻断率）

这是 P3 最重要的质量门槛之一。

### Purpose

判断系统是否出现破坏用户自主权的行为。

### Population

所有进入 P3 Experience Runtime 的有效会话，以及专门 Agency Test Cases。

### Blocker Examples

包括：

- STOP 未生效
- CHANGE 未生效
- 用户明确要求结束后继续生成
- 用户明确改变方向后旧体验继续执行
- 未经授权的长期偏好推断
- Memory 覆盖当前 Intent
- 强制用户继续体验
- 为增加 session time 而继续
- 用户无法自然退出
- 系统替用户作出未经授权的重要决定

### Calculation

统计型指标可以定义为：

```text
Agency Blocker Rate
=
Agency Blocker 次数
/
Agency Evaluation Opportunities
```

但：

> **任何单独的 P0 Agency Blocker 本身就是 Release Block。**

因此不能用平均值抵消严重违规。

### Gate Type

**Hard Gate + Statistical Monitoring**

### Threshold

```text
P0 Agency Blocker = 0
```

其他非 P0 Agency 问题按照严重度进入 P1/P2 管理。

### Evidence

- G05 Change
- G06 Stop
- G07 Correction
- G08 Memory Boundary
- Agency Evaluation
- Decision Trace
- Runtime State Snapshot

---

# 7. RG-04｜Intent Correction Recovery（意图纠正恢复率）

### Purpose

判断用户说：

> “不是这个意思。”

之后，系统是否真正修正，而不是继续沿用错误推断。

### Population

发生有效 CORRECTION 的会话。

### Successful Recovery

同时满足：

1. 错误 inference 被移除或降级
2. 有效 context 被保留
3. Current Intent 被重新评估
4. 后续 Action 与修正后的 Intent 一致
5. 没有未经授权的永久 preference 写入

### Calculation

```text
Intent Correction Recovery
=
成功恢复的 Correction 会话数
/
有效 Correction 会话总数
```

### Gate Type

**Proposed Release Gate**

### Threshold

**TBD**

### Related Golden Case

G07 Correction

---

# 8. RG-05｜Experience Completion Correctness（体验完成判断正确率）

### Purpose

避免系统因为：

- 用户停留时间
- 消息数量
- 模型判断
- engagement

而错误地判断体验已经完成。

### Hard Rules

以下情况必须 BLOCK：

```text
用户明确 STOP
→ 未结束

用户明确改变方向
→ 旧体验仍被视为当前体验

LLM 自行决定 completion
→ 越权

系统为了继续体验
→ 阻止自然结束
```

因此 Completion Correctness 主要作为：

> **Contract / Golden Acceptance**

而非单纯统计指标。

### Gate Type

**Hard Gate**

### Related Golden Cases

- G05 Change
- G06 Stop
- G07 Correction

---

# 9. RG-06｜Critical State Integrity（关键状态完整性）

这是工程与产品共同的硬门槛。

必须：

```text
Unauthorized State Mutation = 0
Stale State Overwrite = 0
State Corruption = 0
Illegal Transition = 0
```

尤其包括：

- stale write
- duplicate command 导致重复状态变更
- old generation 覆盖 new state
- CHANGE 后旧 candidate 被重新执行
- STOP 后旧任务继续改变 ExperienceState

### Gate Type

**Hard Gate**

### Evidence

- EB-01 Runtime Single Writer
- EB-02 State Version
- EB-03 Idempotency
- EB-05 Stale Result Rejection
- G05
- G06
- State Snapshot
- Event Replay

---

# 10. RG-07｜Core Latency（核心延迟）

Latency 是工程门槛，不是用户价值本身。

当前冻结候选目标：

### First Experience

```text
< 2s       Target
2–4s       Acceptable
> 4s       Progressive / Fallback Required
```

### Runtime

```text
< 2s       Target
```

复杂任务可以更长，但必须：

- 可中断
- 有状态反馈
- 不阻塞用户改变方向
- 不执行过期结果

### Gate Type

**Engineering Release Gate**

最终阈值必须基于真实 P3 运行环境和实际模型链路确认。

### Important

不得为了降低 latency：

- 删除 Policy
- 绕过 Validator
- 缩短必要 State transition
- 直接让 LLM 写 State
- 删除 Decision Trace
- 删除 Agency checks

---

# 11. Metrics Explicitly NOT Recommended as P3 Hard Gates（不建议作为 P3 硬发布门槛）

## Voluntary Return Rate（自愿回访率）

重要，但 P3 样本量和观察周期不足以作为第一阶段硬门槛。

---

## Session Time（会话时长）

**禁止作为 Product Release Gate。**

原因：

```text
更长 ≠ 更好
```

尤其不能出现：

```text
Session Time ↓
→ Policy 强制增加体验
```

---

## Message Count（消息数量）

不作为产品成功指标。

---

## Experience Continuation Rate（体验继续率）

可以观察，但不能要求：

> 用户必须继续。

用户 STOP 是成功行为。

---

## Creation Start Rate（创造开始率）

P3 可以观察，但不是所有用户都应创造。

---

## Deepening Rate（深入率）

属于行为学习指标，不应强迫用户深入。

---

# 12. Release-Gate Matrix（发布门槛矩阵）

| ID            | Metric / Criterion         | Type                   | P3 Gate  | Threshold                    |
| ------------- | -------------------------- | ---------------------- | -------- | ---------------------------- |
| RG-01         | First Experience Fit       | Statistical            | Proposed | TBD                          |
| RG-02         | Intent Fulfillment         | Statistical            | Proposed | TBD                          |
| RG-03         | Agency Blocker Rate        | Hard + Statistical     | **YES**  | P0 = 0                       |
| RG-04         | Intent Correction Recovery | Statistical            | Proposed | TBD                          |
| RG-05         | Completion Correctness     | Hard Acceptance        | **YES**  | 0 violation                  |
| RG-06         | State Integrity            | Hard Acceptance        | **YES**  | 0 violation                  |
| RG-07         | Core Latency               | Engineering Gate       | **YES**  | TBD / Environment validation |
| Return Rate   | Voluntary Return           | Learning               | NO       | Observe                      |
| Continuation  | Experience Continuation    | Learning               | NO       | Observe                      |
| Creation      | Creation Start             | Learning               | NO       | Observe                      |
| Deepening     | Deepening Rate             | Learning               | NO       | Observe                      |
| Session Time  | Session Time               | Learning / Anti-gaming | NO       | Not a gate                   |
| Message Count | Message Count              | Anti-gaming            | NO       | Not a gate                   |

---

# 13. Relationship to Golden Suite（与黄金验收的关系）

Release Gate 不能替代 Golden Suite。

正确关系：

```text
Golden Suite
    +
Contract Tests
    +
Scenario Matrix
    +
Engineering Boundary
    +
Release-Gate Metrics
    ↓
Product Release Decision
```

例如：

```text
Agency Score 很高
+
G06 Stop 失败
=
BLOCK
```

而不是：

```text
Agency Score 很高
→ 平均表现不错
→ 忽略 STOP failure
```

同理：

```text
First Experience Fit 很高
+
LLM 绕过 Policy
=
BLOCK
```

---

# 14. Metric Evidence Requirements（指标证据要求）

任何正式 Release-Gate Metric 必须记录：

```text
Metric ID
Metric Name
Definition
Purpose
Population
Observation Window
Numerator
Denominator
Calculation
Threshold
Evidence Source
Owner
Evaluator
Version
Related Contract
Related Golden Cases
Failure Severity
Release Action
```

特别要求：

> **Threshold 必须有明确 Owner 和 Approval Record。**

不能出现：

```text
“感觉 80% 左右应该可以”
```

也不能由：

- AI Coding Agent
- Engineering
- Analytics
- LLM
- 临时测试人员

自行决定产品发布阈值。

---

# 15. Metric Versioning（指标版本化）

指标定义变化必须产生版本变化。

例如：

```text
RG-01 v1.0
```

修改：

- population
- numerator
- denominator
- observation window
- threshold
- scoring rules

任意一项，都必须：

```text
Change ID
↓
Reason
↓
Impact Analysis
↓
Product Approval
↓
Metric Version
↓
Regression / Historical Comparability Assessment
```

不能静默修改。

---

# 16. P3 Recommended Release Decision Logic（P3 建议发布裁决逻辑）

最终逻辑：

```text
IF
P0 Violations > 0
    → BLOCK

OR
Agency Blockers > 0
    → BLOCK

OR
State Integrity Blockers > 0
    → BLOCK

OR
Policy Compliance Blockers > 0
    → BLOCK

OR
Golden Suite < PASS
    → BLOCK

OR
Required Contract Tests < PASS
    → BLOCK

OR
Required Engineering Gates < PASS
    → BLOCK

OR
Approved Release-Gate Metric < Threshold
    → BLOCK

ELSE
    → RELEASE CANDIDATE
```

注意：

> “RELEASE CANDIDATE” 仍不等于 Product Pass。

还需要正式 Product Acceptance。

---

# 17. Decisions Required（需要产品裁决的事项）

E3 目前提出以下候选 Release Gates：

### 建议冻结为硬门槛

1. Agency Blocker
2. Completion Correctness
3. State Integrity
4. Policy Compliance
5. Golden Suite
6. Contract Compliance
7. Engineering Reliability

### 建议进入统计型 Release Gate

1. First Experience Fit
2. Intent Fulfillment
3. Intent Correction Recovery
4. Core Latency

### 建议暂不作为硬门槛

1. Voluntary Return
2. Experience Continuation
3. Deepening
4. Creation Start
5. Session Time
6. Message Count

其中所有统计型门槛的具体 Threshold 当前均为：

> **TBD / Product Owner Approval Required**

---

# 18. E3 Status（当前状态）

```text
E3 = PROPOSAL
PB-03 = OPEN
G6 = EVIDENCE_PENDING
```

E3 尚未完成正式冻结。

正式关闭条件：

```text
Release-Gate Metric Set approved
        ↓
每个 Gate 的 Definition 完整
        ↓
Threshold / Hard Gate 规则明确
        ↓
Evidence Source 明确
        ↓
Owner 明确
        ↓
Version registered
        ↓
G6 Evidence Complete
```

---

# 19. Governance Conclusion（治理结论）

E3 不允许发生以下错误：

> **把“用户喜欢什么”偷换成“指标要变高”。**

也不允许：

> **把“指标表现不好”作为修改产品契约的理由。**

正确原则：

> **契约定义什么是正确产品；指标帮助我们判断产品在真实用户中的表现；发布门槛决定什么时候可以安全地把当前版本交给用户。**

最终必须保持：

```text
Product Contract
      ↓
Acceptance
      ↓
Metrics
      ↓
Release Decision
```

而不能变成：

```text
Metrics
  ↓
改变 Product Contract
  ↓
改变 Runtime
  ↓
追求更高指标
```

**E3 当前结论：未冻结。**\
**PB-03 当前结论：OPEN。**\
**G6 当前结论：EVIDENCE PENDING。**\
**P2 当前仍为：CLOSURE CANDIDATE / BLOCKED。**\
**P3 Implementation：继续 BLOCKED。**
