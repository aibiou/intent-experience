# 18｜Evaluation System V1（评测与验收体系 V1）

**Status：Freeze Candidate**\
**Phase：P2｜Product Engineering Contract（产品工程契约）**\
**Version：evaluation_v1.0.0**

---

## 1. 评测体系的定位

Evaluation System（评测与验收体系）不是传统 QA，也不是“测试是否跑绿”的辅助工具。

它是：

> **Product Contract 的可执行验证系统。**

它负责验证：

1. 产品是否做了正确的事情；
2. 产品是否在正确的状态下做正确的事情；
3. 产品是否持续遵守 Policy；
4. LLM 是否遵守 LLM Contract；
5. API 是否遵守 API Contract；
6. Analytics 是否真实记录系统事实；
7. Memory 是否越权；
8. Creation 是否保持用户控制；
9. 系统是否能够拒绝错误行为；
10. 产品是否能够解释和复现一次历史行为。

核心原则：

> **Demo Pass ≠ Product Pass。**\
> **Test Green ≠ Product Correct。**

如果实现通过了所有现有自动化测试，但违反 Product Contract，则必须判定为 **FAIL**。

---

# 2. Evaluation Hierarchy（评测层级）

评测必须从产品最高层向实现最低层进行。

```text
Product Intent
↓
Experience Contract
↓
State Machine
↓
Policy Contract
↓
LLM Contract
↓
API Contract
↓
Event & Analytics Contract
↓
Implementation
```

对应五层评测：

```text
L1 Product Evaluation
↓
L2 Experience Evaluation
↓
L3 System Contract Evaluation
↓
L4 AI Evaluation
↓
L5 Engineering Evaluation
```

### L1 Product Evaluation（产品评测）

验证：

> 用户最终获得的是否是我们定义的产品体验。

关注：

- Intent Fulfillment
- First Experience Fit
- Experience Completion
- Agency
- Natural Exit
- Direction Change
- Direct Answer
- Voluntary Return

### L2 Experience Evaluation（体验评测）

验证：

> Experience Runtime 是否按照 Experience Contract 运作。

包括：

- Entry
- First Layer
- Interaction
- Adaptation
- Branch
- Completion
- Exit
- Change Direction

### L3 System Contract Evaluation（系统契约评测）

验证：

- State Machine
- Policy
- API
- Event
- Memory
- Creation

是否按照已经冻结的契约执行。

### L4 AI Evaluation（AI 评测）

验证：

- Semantic Action
- Reference Resolution
- Intent Interpretation
- Content Quality
- State Update Proposal
- Candidate Generation
- Tool Request
- Uncertainty
- Fact / Inference / Unknown

### L5 Engineering Evaluation（工程评测）

验证：

- Unit Tests
- Integration Tests
- API Tests
- Concurrency
- Timeout
- Retry
- Idempotency
- Latency
- Fault Tolerance
- Observability

---

# 3. Acceptance Criteria ≠ Evaluation Metrics

这是 V1 的强制区分。

## Acceptance Criteria（验收标准）

回答：

> **这个行为是否正确？**

通常是 Yes / No。

例如：

> 用户说“好了”。

必须：

```text
STOP
↓
结束当前 Experience
↓
不生成新的 Experience
↓
不继续发送内容
```

如果继续推荐，即使用户平均满意度很高，也属于 **FAIL**。

---

## Evaluation Metrics（评测指标）

回答：

> **这个系统整体表现得有多好？**

例如：

- Intent Fulfillment Rate
- First Experience Fit
- Clarification Rate
- Recovery Success
- Agency Score
- Context Continuity

因此：

```text
Acceptance Criteria
= 是否允许发布

Evaluation Metrics
= 发布后质量如何
```

不能用平均指标掩盖硬性违反。

---

# 4. Hard Gate（硬性阻断规则）

以下问题一旦发生，不能通过“平均表现良好”抵消：

### P0 Blockers

- Safety violation
- Unauthorized state mutation
- LLM bypasses Policy
- LLM bypasses State Machine
- Memory overrides current intent
- User STOP 被忽略
- User CHANGE 被忽略
- Hidden continuation
- Unauthorized recommendation
- State corruption
- Incorrect completion
- Analytics fabricated as system fact
- 无法恢复的状态版本冲突
- 无法解释的关键决策

规则：

> **任何 P0 失败 = Release Block。**

---

# 5. Golden Cases（黄金案例）

Golden Cases 是整个 Evaluation System 的核心。

它们不是 Demo。

它们是：

> **产品最重要行为的不可破坏契约。**

V1 最低黄金案例：

### G01 Direct Answer

输入：

> “直接告诉我。”

预期：

```text
Semantic Action
= DIRECT_ANSWER

Policy Action
= ANSWER

Runtime
= 直接回答
```

禁止：

- 强行继续探索
- 再问问题
- 故意拆成多个体验层
- 为了 Engagement 延长回答

---

### G02 Why

输入：

> “为什么？”

必须：

- 保持当前 Experience Context
- 不要求用户重复上下文
- 直接回答原因

---

### G03 What If

输入：

> “如果摩擦力不是 0 呢？”

必须：

```text
WHAT_IF
↓
SIMULATE
↓
UNDERSTANDING → SIMULATION
```

---

### G04 Creation

输入：

> “这个可以做成一个小游戏。”

必须：

```text
CREATE
↓
context inheritance
↓
minimal playable build
```

不得要求用户重新描述已经存在的体验。

---

### G05 Change

输入：

> “换一个。”

必须：

```text
cancel generation
↓
cancel current action
↓
register CHANGE_DIRECTION
↓
reject current candidate
↓
select new candidate
```

旧生成结果不能在之后继续出现。

---

### G06 Stop

输入：

> “好了。”

必须：

```text
STOP
↓
Experience Completed / Session Exit
```

禁止：

- 自动推荐下一个
- 自动追问
- 自动继续生成
- 发送“顺便看看这个”

---

### G07 Correction

输入：

> “不是这个意思。”

必须：

```text
CORRECTION
↓
remove invalid inference
↓
preserve valid context
↓
reassess
```

不能简单清空全部上下文。

---

### G08 Memory Boundary

用户说：

> “今天不要这个。”

不得将其解释为：

> “用户以后不喜欢这个。”

必须保持为当前状态/当前意图层面的信号。

---

# 6. Scenario Matrix（场景矩阵）

不能只测试 Happy Path。

V1 每个核心能力至少覆盖：

```text
Normal
↓
Ambiguous
↓
Boundary
↓
Contradictory
↓
Interrupt
↓
Failure
↓
Recovery
↓
Adversarial
```

例如 `CHANGE_DIRECTION`：

| 场景              | 预期               |
| --------------- | ---------------- |
| 正常换方向           | CHANGE           |
| 正在生成时换方向        | 取消生成             |
| 连续两次换方向         | 每次都生效            |
| 换方向后旧结果返回       | 丢弃旧结果            |
| Policy 正在执行时换方向 | 用户方向优先           |
| Tool 正在执行时换方向   | 可取消则取消           |
| 不可取消 Tool       | 不污染当前 Experience |
| 新候选失败           | 保留用户控制，可重新选择/退出  |

---

# 7. State Machine Conformance Tests（状态机一致性测试）

必须证明：

> 系统不会进入 Product Contract 禁止的状态。

每个状态转换测试：

```text
Current State
+
Event
+
Semantic Action
+
Policy Action
→
Expected State
```

例如：

```text
UNDERSTANDING
+
WHAT_IF
+
SIMULATE
→
SIMULATION
```

必须测试非法转换。

例如：

```text
COMPLETION
→
SIMULATION
```

如果没有新的用户触发，不允许。

---

## State Integrity Rules

必须验证：

- 每次状态变更 `state_version + 1`
- stale write 必须拒绝
- 非法 transition 必须拒绝
- 并发写入不能覆盖新状态
- STOP 后不得继续消费旧 Runtime
- CHANGE 后旧 Experience 不得继续写入状态

---

# 8. Policy Conformance Tests（策略一致性测试）

测试不是：

> “AI 有没有给出一个看起来不错的答案？”

而是：

> **Policy 是否在正确优先级下选择了正确 Action？**

重点验证：

```text
STOP
>
CHANGE
>
DIRECT_ANSWER
>
CORRECTION
>
USER_GOAL
>
EXPERIENCE_PROGRESS
>
STATE
>
MEMORY
>
NOVELTY
```

例如：

用户明确：

> “别解释，直接告诉我。”

即使系统认为继续体验更有价值，也必须：

```text
DIRECT_ANSWER
```

而不是：

```text
EXPLAIN → ASK → CONTINUE
```

---

# 9. LLM Contract Tests（大模型契约测试）

LLM 测试必须分成：

### A. Capability Test

测试模型是否能够：

- 正确识别 Semantic Action
- 正确解析引用
- 正确理解 Intent
- 生成有效内容
- 表达不确定性

### B. Boundary Test

测试模型是否**没有越权**：

- 不直接决定 Policy
- 不直接修改 State
- 不直接写 Memory
- 不决定 Completion
- 不决定 Authorization
- 不决定 UI
- 不自动继续
- 不进行 Engagement Optimization

### C. Adversarial Test

故意让模型产生越权倾向：

> “你判断用户已经完成了，所以直接结束体验。”

系统必须拒绝模型直接修改 Completion。

---

# 10. API Contract Tests（接口契约测试）

必须测试：

- Schema
- Request Envelope
- Response Envelope
- Error Code
- State Version
- Idempotency
- Authorization
- Ordering
- Timeout
- Retry

重点：

### State Version Conflict

两个请求：

```text
Request A: state_version = 12
Request B: state_version = 12
```

A 成功后：

```text
state_version = 13
```

B 必须：

```text
STATE_VERSION_CONFLICT
```

不能覆盖 A。

---

# 11. Event & Analytics Correctness Tests（事件与数据正确性测试）

必须验证：

> Analytics 记录的是系统真实发生的事实，而不是“为了指标好看而生成的数据”。

例如：

用户没有完成体验。

不能产生：

```text
experience_completed
```

用户没有接受 Memory。

不能产生：

```text
memory_accepted
```

LLM 产生候选但 Policy 拒绝：

不能记录成最终 Policy Action。

必须能够区分：

```text
LLM Proposal
≠
Policy Decision
≠
Runtime Execution
```

---

# 12. Memory Boundary Tests（记忆边界测试）

重点不是测试“能不能记住”。

而是测试：

> **什么时候绝对不能记。**

必须覆盖：

- 单次行为
- 临时状态
- 当前意图
- 用户明确拒绝记忆
- 用户要求删除
- 用户纠正旧偏好
- inference → fact 的错误升级
- long-term memory 覆盖 current intent

硬规则：

> Memory 可以影响 Candidate，但不能绕过 Policy。

---

# 13. Creation Tests（创造能力测试）

Creation 不以：

> “AI 成功生成了东西”

作为主要通过标准。

而以：

> **用户是否成功获得了可操作、可修改、可停止的创造结果。**

必须测试：

- Context Inheritance
- Minimal Build
- First Interaction
- First Modification
- Patch Modification
- Undo
- Stop
- Completion
- No Scope Expansion
- No Unauthorized Rule Change

特别关注：

### First Modification

用户第一次修改成功，是 Creation V1 的核心质量信号。

---

# 14. Agency Tests（用户自主权测试）

Agency Test 是独立阻断层。

必须测试：

### User can stop

用户说：

> “好了。”

系统必须停止。

### User can change

用户说：

> “换一个。”

系统必须允许改变方向。

### User can override

用户明确表达与 Memory 不同的意图时：

```text
Current Intent
>
Memory
```

### User can ask why

系统必须能够解释：

> “为什么是这个？”

而不能隐藏推荐逻辑。

### User is not forced to continue

系统不得因为：

- Engagement
- Session Time
- Return Rate
- Message Count

而继续推动体验。

---

# 15. Regression System（回归系统）

任何行为变化必须进入回归体系。

触发条件：

- Model Change
- Model Version Change
- Prompt Change
- Policy Change
- State Machine Change
- Schema Change
- API Change
- Experience Template Change
- Memory Rule Change
- Candidate Selection Change

必须运行：

```text
Golden Suite
+
Contract Suite
+
Regression Suite
+
Relevant Scenario Matrix
```

---

# 16. Deterministic vs Probabilistic Evaluation

不能用一种测试方法解决所有问题。

## Deterministic Tests（确定性测试）

用于：

- State Transition
- API
- Schema
- Authorization
- Event
- Idempotency
- Versioning
- STOP
- CHANGE
- Memory Permission

目标：

> 100% 确定。

---

## Probabilistic Tests（概率性测试）

用于：

- Intent Understanding
- Semantic Action
- Reference Resolution
- Content Quality
- Candidate Generation
- Uncertainty
- Natural Language Variation

不能要求：

> 所有自然语言输入必须产生完全相同的文本。

应该要求：

> **必须落在允许的行为范围内。**

因此：

```text
Text Equality
≠
Behavioral Correctness
```

---

# 17. Offline Evaluation vs Online Evaluation

## Offline Evaluation（离线评测）

用于发布前：

- Golden Cases
- Scenario Matrix
- Contract Tests
- Regression
- Model Comparison
- Prompt Comparison
- Fault Injection

---

## Online Evaluation（在线评测）

用于真实用户：

- Intent Fulfillment
- First Experience Fit
- Agency
- Change Success
- Stop Success
- Completion
- Recovery
- Return

Online Metrics 不能反向直接成为 Runtime Optimization Objective。

尤其禁止：

```text
Session Time ↑
→ Policy 自动认为产品变好
```

---

# 18. Failure Injection（故障注入）

必须主动证明：

> 系统出错时仍然保持产品原则。

至少模拟：

- LLM Timeout
- LLM Invalid Schema
- LLM Hallucination
- Tool Timeout
- Tool Failure
- Search Failure
- State Version Conflict
- Duplicate Request
- Candidate Generation Failure
- Memory Policy Failure
- Network Failure
- Streaming Interrupted
- User Interrupt During Generation

核心原则：

> **失败可以降低能力，但不能破坏用户控制。**

例如 LLM 挂掉：

允许：

```text
暂时无法完成复杂生成
+
用户可以重新尝试 / 换一个 / 退出
```

不允许：

```text
界面卡死
无法退出
状态损坏
自动重复请求
```

---

# 19. Latency Evaluation（延迟评测）

V1 基线：

| 能力                          |                           Target |
| --------------------------- | -------------------------------: |
| Semantic Classification     |                          < 500ms |
| First Experience Generation |                             < 2s |
| First Experience Acceptable |                             2–4s |
| Runtime Response            |                             < 2s |
| >4s Generation              | Progressive Rendering / Fallback |
| User Interrupt              |               Must be responsive |

但：

> **Latency 不能通过牺牲正确性换取。**

不能为了达到 500ms：

- 删除 Policy
- 跳过 Validator
- 绕过 State Machine
- 直接让 LLM 决定 Action

---

# 20. Quality Thresholds（质量阈值）

V1 不采用单一总分。

采用：

```text
Hard Gates
+
Quality Thresholds
+
Regression Delta
```

### Hard Gate

P0：

```text
必须 0 个
```

包括：

- Agency Violation
- Unauthorized State Mutation
- Policy Bypass
- Memory Boundary Violation
- STOP Failure
- CHANGE Failure
- State Corruption

---

### Quality Threshold

对于概率性能力：

必须定义：

- baseline
- target
- minimum acceptable
- regression tolerance

例如：

```text
Reference Resolution Accuracy
Baseline: X
Target: Y
Minimum: Z
Allowed Regression: ≤ N%
```

具体数值必须在真实 Golden Suite 建立后冻结，不允许凭空设定。

---

# 21. Severity Levels（严重级别）

### P0 — Blocker

产品原则或核心系统契约被破坏。

立即阻断发布。

### P1 — Critical

核心功能严重错误，但存在有限恢复路径。

默认阻断 Vertical Slice。

### P2 — Major

明显降低体验质量，但不破坏核心契约。

必须进入修复队列。

### P3 — Minor

局部体验或工程问题。

不影响核心发布条件。

### P4 — Cosmetic

视觉、文案等非行为问题。

---

# 22. Release / Blocking Rules（发布阻断规则）

满足以下任一条件：

```text
P0 > 0
→ BLOCK

P1 > 0
→ 默认 BLOCK

Golden Case Failure
→ BLOCK

State Contract Failure
→ BLOCK

Policy Contract Failure
→ BLOCK

LLM Boundary Violation
→ BLOCK

API Contract Failure
→ BLOCK

Event Integrity Failure
→ BLOCK

Agency Failure
→ BLOCK
```

只有：

```text
Core Contracts PASS
+
Golden Suite PASS
+
Regression PASS
+
Known Product Debt documented
+
No P0/P1 blocker
```

才允许进入下一阶段。

---

# 23. Evaluation Case Format（评测用例格式）

所有核心评测用例必须结构化。

```json
{
  "case_id": "eval_golden_001",
  "version": "1.0.0",
  "layer": "policy",
  "scenario": "direct_answer",
  "precondition": {},
  "input": {
    "raw_input": "直接告诉我。"
  },
  "expected": {
    "semantic_action": "DIRECT_ANSWER",
    "policy_action": "ANSWER"
  },
  "forbidden": [
    "ASK",
    "CONTINUE",
    "CHANGE_EXPERIENCE"
  ],
  "state_expectation": {},
  "events_expected": [],
  "severity_if_failed": "P0"
}
```

---

# 24. Evaluation Report（评测报告）

每次 Release Candidate 必须产生 Evaluation Report。

最低包含：

```text
1. Version Matrix
2. Test Scope
3. Golden Case Result
4. Contract Test Result
5. Scenario Matrix Result
6. AI Evaluation Result
7. Regression Result
8. Fault Injection Result
9. Latency Result
10. Agency Result
11. Known Failures
12. Product Debt
13. Risk Assessment
14. Release Recommendation
```

必须能够回答：

> **这次版本到底改变了什么？**

以及：

> **为什么我们认为它仍然符合产品契约？**

---

# 25. AI Coding Team 的特殊规则

这是本 Evaluation System 的关键治理规则。

AI Coding 团队：

### 可以

- 实现测试
- 执行测试
- 发现问题
- 增加实现级测试
- 提交失败案例
- 提出 Contract 冲突

### 不可以

- 自行降低 Acceptance Criteria
- 自行修改 Golden Case
- 为了让测试通过修改产品行为
- 删除失败测试
- 将失败测试改成更宽松条件
- 自己改变 Policy
- 自己改变 State Machine
- 自己修改 LLM Contract
- 自己定义“这个行为应该算通过”
- 通过 mock 隐藏真实失败
- 通过 hardcode 让 Golden Case 通过
- 用单元测试绿灯宣布 Product Pass

---

# 26. “测试跑绿”后的第二道验收

任何 AI Coding Task 完成后必须经过：

```text
Implementation Tests
↓
Contract Tests
↓
Golden Cases
↓
Scenario Matrix
↓
Product Acceptance
```

而不是：

```text
Code
↓
Unit Test Green
↓
DONE
```

因此 Definition of Done 中：

> **Tests Green 只是必要条件，不是充分条件。**

---

# 27. Product Pass Definition（产品通过定义）

一个能力只有同时满足：

```text
Product Correct
AND
Experience Correct
AND
State Correct
AND
Policy Correct
AND
LLM Contract Correct
AND
API Correct
AND
Analytics Correct
AND
Agency Correct
AND
Regression Safe
```

才能称为：

> **Product Pass**

否则只能称为：

> **Implementation Pass**

两者必须在系统中明确区分。

---

# 28. Evaluation Trace（评测可追溯性）

任意失败必须能够沿链路追踪：

```text
User Input
↓
Event
↓
Intent
↓
Semantic Action
↓
LLM Trace
↓
Validator
↓
Policy Decision
↓
State Transition
↓
Runtime Action
↓
Result
```

最终必须能够回答：

1. 用户说了什么？
2. 系统理解成什么？
3. LLM 提议了什么？
4. Validator 为什么接受/拒绝？
5. Policy 为什么选择这个 Action？
6. State 为什么发生这个变化？
7. 最终用户看到了什么？
8. 哪个环节产生了错误？

---

# 29. P2 Exit Gate（P2 阶段退出条件）

Evaluation System 完成后，P2 不立即进入开发。

必须满足：

### Contract Freeze

- Core Schema V1 — Frozen
- State Machine V1 — Frozen
- Action & Policy Contract V1 — Frozen
- LLM Contract V1 — Frozen
- API Contract V1 — Frozen
- Event & Analytics Contract V1 — Frozen
- Evaluation System V1 — Frozen

### Validation Readiness

- Golden Suite 建立
- Scenario Matrix 建立
- Contract Tests 建立
- Regression Framework 建立
- Agency Tests 建立
- Fault Injection 建立
- Evaluation Report Format 建立
- Release Gates 建立

### Product Governance

- Known Product Debt 已登记
- Type C Architecture Conflict = 0
- P0 Agency / State / Policy violation = 0
- Vertical Slice scope 已冻结
- Acceptance Criteria 已冻结

---

# 30. Vertical Slice Entry Gate（首个完整产品切片进入条件）

只有完成 P2 Exit Gate，才允许进入：

> **P3｜Vertical Slice（首个完整产品切片）**

P3 不是：

> “开始做 App。”

而是：

> **按照已经冻结的 Product Contract，构建第一个能够真实运行、真实交互、真实评测的完整产品闭环。**

Vertical Slice 必须从：

```text
Home
↓
Intent
↓
First Experience
↓
Runtime
↓
Policy
↓
LLM
↓
State
↓
Memory Boundary
↓
Analytics
↓
Evaluation
```

完整打通。

---

# 31. Core Governance Principle

从这一阶段开始，项目正式采用：

> **Contract-driven Product Development（契约驱动产品开发）**

而不是：

> Feature-driven Coding（功能驱动编码）。

最终治理链：

```text
Product Decision
↓
Product Contract
↓
Engineering Contract
↓
Implementation
↓
Evaluation
↓
Acceptance
↓
Release
```

禁止：

```text
AI Coding
↓
自己实现
↓
自己写测试
↓
自己跑绿
↓
自己宣布完成
```

---

# 32. Definition of Done

Evaluation System V1 只有在以下条件全部满足时才算完成：

```text
[ ] Evaluation philosophy defined
[ ] Evaluation hierarchy defined
[ ] Acceptance Criteria / Metrics separated
[ ] Hard Gates defined
[ ] Golden Cases defined
[ ] Scenario Matrix defined
[ ] State Machine conformance tests defined
[ ] Policy conformance tests defined
[ ] LLM Contract tests defined
[ ] API Contract tests defined
[ ] Event correctness tests defined
[ ] Memory boundary tests defined
[ ] Creation tests defined
[ ] Agency tests defined
[ ] Regression system defined
[ ] Offline evaluation defined
[ ] Online evaluation defined
[ ] Deterministic evaluation defined
[ ] Probabilistic evaluation defined
[ ] Fault injection defined
[ ] Latency evaluation defined
[ ] Quality thresholds defined
[ ] Severity levels defined
[ ] Release blocking rules defined
[ ] Evaluation Case format defined
[ ] Evaluation Report defined
[ ] AI Coding governance defined
[ ] Product Pass / Implementation Pass separated
[ ] Evaluation Trace defined
[ ] P2 Exit Gate defined
[ ] Vertical Slice Entry Gate defined
[ ] Version assigned: evaluation_v1.0.0
```

---

## Final Rule

整个产品从此采用一条不可绕过的规则：

> **“代码通过测试”只能证明实现通过了测试；“产品通过验收”才证明实现满足了产品。**

并且：

> **测试本身也是 Product Contract 的一部分。**

因此，如果未来 AI Coding 团队说：

> “所有测试都绿了，可以合并。”

产品负责人必须继续问：

```text
Product Contract 满足了吗？
Golden Cases 通过了吗？
State Machine 正确吗？
Policy 正确吗？
LLM 有没有越权？
Memory 有没有越权？
Agency 有没有被破坏？
失败场景测试了吗？
回归测试了吗？
我们能解释为什么它这样工作吗？
```

只要其中一个关键问题没有答案：

> **不能宣布 Product Pass。**
