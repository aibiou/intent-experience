# P2-EVIDENCE-8.0

## Closure Evidence Execution Register（P2 关闭证据执行登记表）

**Document Version（文档版本）：** 1.0\
**P2 Status（P2 状态）：** Closure Candidate / Blocked（关闭候选 / 阻塞）\
**P3 Entry Preparation（P3 准入准备）：** Allowed（允许）\
**P3 Implementation（P3 实现）：** Blocked（禁止）

---

## 0. Evidence Rule（证据规则）

本登记表只负责把 P2 Exit Gate（P2 退出门槛）转化为可执行、可审计的证据任务。

### 严格规则

1. **没有原始证据，不得判定 PASS。**
2. “已经定义”“理论上正确”“代码应该如此”均不等于证据。
3. 单元测试通过不等于 Product Pass（产品通过）。
4. Demo 正常不等于 Golden Suite（黄金验收套件）通过。
5. 实现结果不能反向修改产品契约。
6. AI coding team（AI 编码团队）不能自行降低验收标准。
7. 没有独立评测结果，不得判定 G5 PASS。
8. 没有正式 owner approval（负责人批准记录），不得判定 G1/G8 PASS。
9. 所有 PASS 必须能够回答：
   - 测了什么？
   - 按哪个版本测？
   - 谁执行？
   - 谁验证？
   - 原始证据在哪里？
   - 失败是否存在？
10. 当前上下文没有实际执行证据，因此本文件**不得把任何 Gate 标记为 PASS**。

---

# 1. Evidence Status（证据状态）

统一状态：

| Status           | 含义           |
| ---------------- | ------------ |
| NOT_STARTED      | 尚未开始         |
| BLOCKED          | 前置条件缺失，无法执行  |
| EVIDENCE_PENDING | 已定义，但尚未取得证据  |
| FAILED           | 已执行且未通过      |
| PASS_CANDIDATE   | 证据基本完整，待最终审核 |
| PASS             | 正式通过         |

### 当前总状态

**P2 Exit Gate：NOT PASSED**

| Gate                                         | 当前状态             |
| -------------------------------------------- | ---------------- |
| G1 Contract Authority Freeze（契约权威冻结）         | BLOCKED          |
| G2 Cross-Contract Consistency（跨契约一致性）        | EVIDENCE_PENDING |
| G3 Golden Suite（黄金验收）                        | EVIDENCE_PENDING |
| G4 Engineering Boundary（工程边界）                | EVIDENCE_PENDING |
| G5 Independent Evaluation（独立评测）              | EVIDENCE_PENDING |
| G6 Product Debt / Open Decision（产品债务 / 未决决策） | EVIDENCE_PENDING |
| G7 P3 Scope Freeze（P3 范围冻结）                  | BLOCKED          |
| G8 Formal Sign-off（正式签署）                     | BLOCKED          |

---

# 2. G1 — Contract Authority Freeze（契约权威冻结）

## 目标

证明 C1–C7 七份 V1 契约是真正的 authoritative / versioned / fingerprintable / owned / approved（权威 / 有版本 / 可校验 / 有负责人 / 已批准）。

### Evidence Items

| ID      | Evidence                                              | Required |
| ------- | ----------------------------------------------------- | -------- |
| E-G1-01 | C1 Core Schema Specification V1（核心数据结构规范 V1）正式文件      | 必须       |
| E-G1-02 | C2 State Machine Specification V1（状态机规范 V1）正式文件       | 必须       |
| E-G1-03 | C3 Action & Policy Contract V1（动作与策略契约 V1）正式文件        | 必须       |
| E-G1-04 | C4 LLM Contract `llm_v1.0.0` 正式文件                     | 必须       |
| E-G1-05 | C5 API Contract `api_v1.0.0` 正式文件                     | 必须       |
| E-G1-06 | C6 Event & Analytics Contract `analytics_v1.0.0` 正式文件 | 必须       |
| E-G1-07 | C7 Evaluation System `evaluation_v1.0.0` 正式文件         | 必须       |
| E-G1-08 | 每份文件 authoritative location（权威位置）                     | 必须       |
| E-G1-09 | version / revision marker（版本 / 修订标识）                  | 必须       |
| E-G1-10 | fingerprint 或等价完整性标识                                  | 必须       |
| E-G1-11 | owner（负责人）                                            | 必须       |
| E-G1-12 | approval record（批准记录）                                 | 必须       |
| E-G1-13 | change classification（变更分类）                           | 必须       |

### PASS 条件

七份契约全部满足：

> Authoritative + Versioned + Fingerprintable + Owned + Approved

任何一项缺失：

> **G1 ≠ PASS**

### 当前判断

**BLOCKED**

原因：当前上下文只有契约内容和版本声明，没有七份正式权威文件、指纹和签署记录。

---

# 3. G2 — Cross-Contract Consistency（跨契约一致性）

必须验证 CC-01 至 CC-12。

| ID    | Consistency Case（一致性案例）                  | 必须证明                   |
| ----- | ---------------------------------------- | ---------------------- |
| CC-01 | ExperienceState Single Writer（体验状态单写入者）  | Runtime 是唯一写入者         |
| CC-02 | STOP                                     | STOP 永远具有最高用户控制优先级     |
| CC-03 | CHANGE_DIRECTION                         | 旧体验、生成、候选必须失效          |
| CC-04 | DIRECT_ANSWER                            | 用户要求答案时不能强制探索          |
| CC-05 | CORRECTION                               | 错误推断被修正且有效上下文保留        |
| CC-06 | Memory Boundary（记忆边界）                    | Memory 不得覆盖当前意图        |
| CC-07 | WHAT_IF / Simulation（假设 / 模拟）            | 假设、事实、模拟结果分离           |
| CC-08 | Creation Context Inheritance（创造上下文继承）    | 创造继承当前上下文              |
| CC-09 | State Version / Stale Write（状态版本 / 陈旧写入） | stale write 必须拒绝       |
| CC-10 | Interrupt / Retry（中断 / 重试）               | 用户中断后旧操作不能继续           |
| CC-11 | Decision Trace（决策追踪）                     | 可区分模型输出与策略决策           |
| CC-12 | Analytics Boundary（分析边界）                 | Analytics 不得控制 Runtime |

### 每个 Case 必须形成链路

```text
Product Rule
↓
Schema
↓
State Machine
↓
Semantic Action
↓
Policy
↓
LLM Contract
↓
API / Runtime
↓
Event / Decision Trace
↓
Evaluation Result
```

### PASS 条件

12 个案例全部有：

- contract clause
- implementation reference
- test/scenario
- expected result
- observed result
- evidence location

且不存在 P0/P1 冲突。

### 当前判断

**EVIDENCE_PENDING**

---

# 4. G3 — Golden Suite（黄金验收）

必须执行：

- G01 Direct Answer
- G02 Why
- G03 What If
- G04 Creation
- G05 Change
- G06 Stop
- G07 Correction
- G08 Memory Boundary

每个 Case 至少包含：

```text
Normal
Negative
Boundary
Failure
Recovery
```

G05 / G06 必须额外覆盖：

```text
In-flight Generation
+
Stale Response
```

### Golden Evidence Record

每个 Case 必须记录：

```text
Case ID
Contract Version
Code Revision
Prompt Version
Model Version
Policy Version
Schema Version
Eval Corpus Version

Initial State
User Input
Expected Semantic Action
Expected Policy Action
Expected State Transition
Expected Runtime Behavior

Observed Behavior
Expected Events
Observed Events
Decision Trace
Final State

Failure
Severity
Evidence Location
Evaluator
Result
```

### 硬规则

```text
G01–G08 全部 PASS
AND
P0 Violations = 0
```

才能：

> **G3 PASS**

平均分、总体满意度、模型平均准确率不能抵消 Golden Case 失败。

### 当前判断

**EVIDENCE_PENDING**

没有实际执行记录，因此不得声称 Golden Suite 已通过。

---

# 5. G4 — Engineering Boundary（工程边界）

必须验证 EB-01 至 EB-16：

```text
EB-01 Runtime Single Writer
EB-02 State Version
EB-03 Idempotency
EB-04 Interruptibility
EB-05 Stale Result Rejection
EB-06 Retry Boundary
EB-07 Timeout Boundary
EB-08 LLM Boundary
EB-09 Frontend Boundary
EB-10 Memory Write Boundary
EB-11 Tool Authorization Boundary
EB-12 API Boundary
EB-13 Completion Boundary
EB-14 Analytics Boundary
EB-15 Replayability
EB-16 Version Traceability
```

### 必须执行的异常测试

```text
LLM timeout
LLM schema invalid
LLM hallucination
Tool timeout
Tool failure
Search failure
State version conflict
Duplicate request
Candidate generation failure
Memory policy failure
Network failure
Streaming interruption
User interrupt during generation
```

### 重点 P0

以下任何一个失败，G4 直接 BLOCK：

- LLM 可以直接写 ExperienceState
- Frontend 可以绕过 Policy
- Memory 可以直接写 Active Memory
- stale result 可以覆盖新状态
- STOP 后旧任务继续执行
- CHANGE 后旧 Candidate 仍可生效
- Completion 可以由 LLM 单方面决定
- Analytics 可以改变 Runtime

### 当前判断

**EVIDENCE_PENDING**

---

# 6. G5 — Independent Evaluation（独立评测）

必须建立独立于实现团队的 evaluator。

## Evaluation Package（评测包）

必须包含：

1. Version Matrix（版本矩阵）
2. Test Scope（测试范围）
3. Golden Case Result（黄金案例结果）
4. Contract Test Result（契约测试结果）
5. Scenario Matrix Result（场景矩阵结果）
6. AI Evaluation Result（AI 评测结果）
7. Regression Result（回归结果）
8. Fault Injection Result（故障注入结果）
9. Latency Result（延迟结果）
10. Agency Result（主体性结果）
11. Known Failures（已知失败）
12. Product Debt（产品债务）
13. Risk Assessment（风险评估）
14. Release Recommendation（发布建议）
15. Evidence Index（证据索引）
16. Evaluator Sign-off（评测负责人签署）

### 独立性规则

实现团队：

- 可以执行测试
- 可以修复问题
- 可以提交证据

但不能单方面：

- 修改 Acceptance Criteria
- 修改 Golden Cases
- 降低 Severity
- 修改 Pass Semantics
- 删除失败测试
- 宣布 Product Pass

### 当前判断

**EVIDENCE_PENDING**

---

# 7. G6 — Product Debt / Open Decision（产品债务 / 未决决策）

当前必须继续维护：

### FROZEN-DEFERRED

- PD-01 Memory UI Final Form（记忆 UI 最终形态）
- PD-02 Recommendation Explanation UI（推荐解释 UI）
- PD-03 Creation Versioning UI（创造版本 UI）
- PD-04 Experience Template Presentation（体验模板呈现）

### P3-BLOCKER

- PB-01 七份 V1 契约正式冻结
- PB-02 First Experience Type & Canonical Path（首个体验类型与标准路径）
- PB-03 Release-Gate Metric Definitions（作为发布门槛的指标定义）
- PB-04 Memory / Template Scope Decision（记忆 / 模板范围决策）

### 隐性决策禁止

以下行为全部禁止：

> “工程上比较方便，所以这样做。”

> “模型这样输出比较自然，所以允许。”

> “Demo 看起来不错，所以先保留。”

> “这个指标高，所以把它设成默认行为。”

> “测试不好过，所以放宽测试。”

这些都必须转化为正式 Product Decision（产品决策）。

### 当前判断

**EVIDENCE_PENDING**

---

# 8. G7 — P3 Scope Freeze（P3 范围冻结）

P3 必须先冻结**一个**首个完整体验切片。

标准路径：

```text
Home
↓
Natural Intent
↓
Intent Understanding
↓
First Experience
↓
Question / Deepen / What-If
↓
Change / Correction / Stop / Minimal Creation
↓
Policy
↓
State Transition
↓
Runtime
↓
Event / Decision Trace
↓
Golden Acceptance
```

必须正式确定：

### IN SCOPE

首个体验类型：

> **待 Product Owner 冻结**

标准路径：

> **待 Product Owner 冻结**

### OUT OF SCOPE

至少继续排除：

- 社交
- 关注
- 点赞
- 评论
- 榜单
- Trending / Feed
- 通知
- 商业化
- Creator Marketplace（创作者市场）
- Agent Marketplace（智能体市场）
- Autonomous Multi-Agent（自主多智能体）
- RL Ranking（强化学习排序）
- 大规模推荐系统
- 完整用户画像
- 完整 Memory Center（记忆中心）
- 大规模运营系统

### PASS 条件

首个体验类型、Canonical Path（标准路径）、IN/OUT/DEFERRED 范围全部冻结，并有 Product Owner approval。

### 当前判断

**BLOCKED**

因为 PB-02 尚未正式冻结。

---

# 9. G8 — Formal Sign-off（正式签署）

必须有六类负责人：

| Signer                       | Responsibility   |
| ---------------------------- | ---------------- |
| Product Owner                | 产品方向与验收          |
| Contract Owner               | 七份契约             |
| Runtime / Architecture Owner | Runtime 与系统边界    |
| Policy / AI Owner            | Policy、LLM、AI 行为 |
| Independent Evaluation Owner | 独立评测             |
| Engineering Owner            | 工程实现与证据          |

每位负责人必须记录：

```text
Role
Identity
Document Version
Evidence Package Version
Date
Decision
Comments
Outstanding Risks
Approval Record
```

允许的最终决定：

```text
APPROVE
APPROVE WITH DOCUMENTED DEBT
BLOCK
```

### 当前判断

**BLOCKED**

因为前置 G1–G7 尚未全部通过。

---

# 10. Evidence Index（证据索引）

最终必须形成：

```text
P2-EVIDENCE-INDEX-1.0

G1
├── C1 Evidence
├── C2 Evidence
├── C3 Evidence
├── C4 Evidence
├── C5 Evidence
├── C6 Evidence
└── C7 Evidence

G2
├── CC-01
├── CC-02
├── ...
└── CC-12

G3
├── G01
├── G02
├── ...
└── G08

G4
├── EB-01
├── EB-02
├── ...
└── EB-16

G5
└── Independent Evaluation Report

G6
└── Product Debt / Open Decision Register

G7
└── P3 Scope Freeze Record

G8
└── Six Sign-off Records
```

任何 Evidence ID 都必须可以定位到实际：

```text
document
commit
test run
log
trace
snapshot
report
approval record
```

不能只有“已完成”文字。

---

# 11. Gate Transition Rule（门槛状态转换规则）

任何 Gate 只能按以下方向变化：

```text
NOT_STARTED
      ↓
EVIDENCE_PENDING
      ↓
PASS_CANDIDATE
      ↓
PASS
```

异常：

```text
任何状态
   ↓
FAILED
   ↓
修复
   ↓
重新执行
   ↓
PASS_CANDIDATE
```

禁止：

```text
BLOCKED → PASS
```

除非阻塞原因已经产生可验证证据。

也禁止：

```text
EVIDENCE_PENDING → PASS
```

如果实际执行证据不存在。

---

# 12. P2 Final Closure Equation（P2 最终关闭公式）

P2 关闭必须满足：

```text
G1 PASS
AND G2 PASS
AND G3 PASS
AND G4 PASS
AND G5 PASS
AND G6 PASS
AND G7 PASS
AND G8 PASS
```

同时：

```text
P0 Violations = 0
Agency Blockers = 0
State Integrity Blockers = 0
Policy Compliance Blockers = 0
```

最终：

```text
P2 CLOSED
        ↓
P3 ENTRY
        ↓
P3 IMPLEMENTATION
```

---

# 13. Current Decision（当前裁决）

截至本文件：

> **P2 EXIT GATE = NOT PASSED**

> **P2 STATUS = CLOSURE CANDIDATE / BLOCKED**

> **P3 ENTRY PREPARATION = ALLOWED**

> **P3 IMPLEMENTATION = BLOCKED**

当前不能因为已经完成大量规范设计，就把 P2 判为 CLOSED。

真正下一阶段不是继续写产品功能，而是：

```text
取得 C1–C7 正式权威文件
↓
完成版本 / 指纹 / Owner / Approval
↓
执行 CC-01–CC-12
↓
执行 G01–G08
↓
执行 EB-01–EB-16
↓
形成 Independent Evaluation
↓
关闭 P3 Blockers
↓
冻结 First Experience
↓
六方 Sign-off
↓
P2 CLOSED
```

**Governance Rule（治理规则）：**

> 不猜测证据，不把设计当实现，不把实现当验收，不把测试绿灯当产品正确，不把模型输出当策略，不把指标当用户价值。

---

## 14. Immediate Execution Order（立即执行顺序）

下一轮只允许按以下顺序推进：

### E1 — Contract Authority Evidence

先解决 **G1**。

### E2 — First Experience Freeze

并行解决 **G7 / PB-02**。

### E3 — Release-Gate Metric Definition

确定 PB-03 中真正会作为 Release Gate（发布门槛）的指标。

### E4 — Memory / Template Scope Decision

解决 PB-04。

### E5 — Evidence Execution Environment

确认能够运行 Contract / Golden / Fault / Regression tests 的实际工程环境。

### E6 — Execute G2 → G4

只有有真实实现和运行环境后，才执行跨契约、Golden、工程边界证据。

### E7 — Independent Evaluation

G2–G4 有真实结果后进入 G5。

### E8 — Final Sign-off

所有 Gate 满足条件后才进入 G8。

---

**本文件不改变 P2 契约，只负责执行和收集 P2 Closure Evidence（P2 关闭证据）。任何发现的契约冲突必须重新进入 Decision / Change Control（决策 / 变更控制），不得在执行阶段自行修订。**
