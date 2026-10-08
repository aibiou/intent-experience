# P2-EVIDENCE-5.0

## Evaluation Evidence（独立评测证据）

**所属阶段：** P2｜Product Engineering Contract（产品工程契约）\
**用途：** P2 正式关闭证据包 Part 5\
**状态：** Defined / Evidence Pending（已定义 / 证据待执行）\
**前置依赖：** P2-EVIDENCE-1.0 ～ P2-EVIDENCE-4.0\
**不得解释为：** Evaluation PASS / Product PASS / P2 CLOSED

---

# 1. Evaluation Objective（评测目标）

Evaluation System（评测与验收体系）的唯一目的不是证明代码“能运行”，而是证明：

> **实现行为是否符合已经冻结的产品契约、工程契约、状态机、策略规则、AI 调用边界、接口契约、事件契约以及用户自主权原则。**

因此必须严格区分：

```text
Test Green
≠
Contract Correct
≠
Experience Correct
≠
Product Correct
≠
P2 Closed
```

最终判断链：

```text
Implementation Tests
↓
Contract Tests
↓
Golden Suite
↓
Scenario Matrix
↓
Fault / Recovery
↓
Regression
↓
Agency Evaluation
↓
Product Acceptance
↓
Release Gate
```

任何中间层失败，不得通过修改更高层验收标准来“消除失败”。

---

# 2. Evaluation Independence（评测独立性）

## 2.1 基本原则

评测不能完全由实现团队自行定义、自行修改、自行判定。

至少必须区分：

```text
Implementation Owner
        ↓
执行工程测试

Contract / Product Owner
        ↓
确认契约符合性

Independent Evaluation Owner
        ↓
独立验收

Product Owner
        ↓
最终产品判断
```

实现团队可以：

- 编写测试
- 执行测试
- 修复问题
- 提交证据
- 提出失败原因

实现团队不得单方面：

- 修改验收标准
- 修改 Golden Case
- 修改 PASS / FAIL 定义
- 降低严重度
- 删除失败测试
- 用 Mock 掩盖真实边界失败
- 修改产品契约以使实现“通过”
- 宣布 Product Pass

---

# 3. Evaluation Authority（评测权威）

评测结果的权威顺序：

```text
Product Baseline
↓
Frozen Contracts
↓
Golden Suite
↓
Evaluation System
↓
Independent Evaluation Result
↓
Product Acceptance Decision
```

其中：

- **Product Baseline** 定义用户应获得什么。
- **Contracts** 定义系统必须如何合法实现。
- **Golden Suite** 定义关键行为是否正确。
- **Evaluation System** 定义如何测试。
- **Independent Evaluation** 判断证据是否足够。
- **Product Owner** 决定是否达到产品验收门槛。

任何单独的：

- Unit Test Green
- Integration Test Green
- Demo Successful
- Model Quality Score
- User Session Time
- Retention
- Average Satisfaction

都不能替代 Product Acceptance（产品验收）。

---

# 4. Evaluation Evidence Model（评测证据模型）

每一个验收结论必须能够追溯：

```text
Product Requirement
↓
Contract Clause
↓
Implementation
↓
Test Case
↓
Input / Scenario
↓
Observed Result
↓
Expected Result
↓
Evidence
↓
Evaluator
↓
Decision
```

每条关键证据至少应关联：

```text
requirement_id
contract_id
contract_version
code_revision
prompt_version
model_version
policy_version
schema_version
evaluation_corpus_version
test_case_id
run_id
timestamp
environment
result
severity
evaluator
```

目的：

> **任何 Product Pass 结论都必须能够回答“依据哪份契约、哪次实现、哪组输入、哪次运行、谁判断的”。**

---

# 5. Deterministic Tests（确定性测试）

以下行为原则上必须使用确定性测试：

### 5.1 State（状态）

- State Machine 合法转换
- 非法转换被拒绝
- state_version 正确递增
- stale write 被拒绝
- State 单写入者成立
- STOP 后不存在非法继续
- CHANGE 后旧候选不能重新生效
- Completion 不得由 LLM 直接写入

### 5.2 API（接口）

- Schema
- Request / Response
- Error Code
- Authentication / Authorization boundary
- Idempotency
- Duplicate Request
- Version Conflict
- Timeout
- Retry Boundary

### 5.3 Policy（策略）

- STOP 必须被接受
- CHANGE 必须取消当前方向
- Explicit User Direction 优先于 Memory / Novelty
- Direct Answer 不得被强制转化为探索
- Memory 不得覆盖 Current Intent
- 未授权 Action 必须被拒绝

### 5.4 LLM Boundary（大模型边界）

确定性验证：

```text
LLM output
↓
Validator
↓
Policy
↓
State Machine
↓
Runtime
```

禁止：

```text
LLM
↓
State Mutation
```

以及：

```text
LLM
↓
Policy Decision
```

### 5.5 Analytics（数据分析）

验证：

- Event 不修改 Runtime
- Metric 不修改 Policy
- Decision Trace 可关联
- State Snapshot 可重放
- 事实与模型输出、策略决定、最终状态可区分

---

# 6. Probabilistic AI Evaluation（概率型 AI 评测）

以下行为不能要求模型输出完全一致，而应评价行为是否符合契约：

- Intent Understanding
- Semantic Action Classification
- Reference Resolution
- Ambiguity Detection
- Answer Quality
- Explanation Quality
- Candidate Generation
- Uncertainty Detection
- Context Continuity
- Creation Adaptation

评测对象不是：

> “模型是否生成完全相同的一句话？”

而是：

> **模型是否在允许的行为空间内产生正确、可靠、可验证、符合当前意图的 Proposal。**

---

# 7. AI Evaluation Dimensions（AI 评测维度）

至少覆盖：

| 维度                       | 判断重点              |
| ------------------------ | ----------------- |
| Intent Accuracy          | 是否正确理解当前意图        |
| Semantic Action Accuracy | 是否识别正确动作          |
| Reference Accuracy       | 是否正确解析“这个/它/刚才那个” |
| Ambiguity Accuracy       | 是否在真正不确定时保持不确定    |
| Context Continuity       | 是否保留有效上下文         |
| Fact Reliability         | 是否区分事实与推断         |
| Uncertainty Calibration  | 是否正确表达不确定性        |
| Experience Fit           | 是否符合当前体验          |
| Depth Fit                | 信息深度是否匹配          |
| Agency Compliance        | 是否保持用户控制权         |
| Correction Recovery      | 用户纠正后是否正确恢复       |
| Change Recovery          | 用户改变方向后是否正确切换     |
| Stop Compliance          | 用户停止后是否真正结束       |
| Memory Discipline        | 是否错误形成长期偏好        |

---

# 8. Scenario Matrix（场景矩阵）

所有核心行为必须覆盖至少以下场景：

```text
NORMAL
↓
AMBIGUOUS
↓
BOUNDARY
↓
CONTRADICTORY
↓
INTERRUPT
↓
FAILURE
↓
RECOVERY
↓
ADVERSARIAL
```

## 8.1 Normal（正常）

验证标准路径是否正确。

例如：

```text
用户提出问题
→ 正确理解
→ ANSWER
→ 状态更新
→ 正常结束
```

## 8.2 Ambiguous（歧义）

验证系统是否能够保持 UNKNOWN，而不是强行猜测。

例如：

> “继续那个。”

若存在两个同等可能目标：

```text
Reference Resolution
→ AMBIGUOUS
→ Policy 判断
→ 必要时一次最小澄清
```

不得：

```text
强行选择
→ 假装确定
```

## 8.3 Boundary（边界）

验证临界条件，例如：

- state_version 边界
- timeout 边界
- retry 上限
- clarification 上限
- STOP 在生成中发生
- CHANGE 在生成中发生

## 8.4 Contradictory（矛盾）

例如：

```text
Long-term Memory：
用户喜欢 A

Current Intent：
今天不想 A
```

必须：

```text
Current Intent
>
Long-term Memory
```

## 8.5 Interrupt（中断）

必须覆盖：

```text
GENERATING
↓
USER_INTERRUPT
↓
CANCEL_GENERATION
↓
CANCEL_CURRENT_ACTION
↓
PROCESS_NEW_INPUT
```

验证旧结果不能污染新状态。

## 8.6 Failure（失败）

至少覆盖：

- LLM timeout
- invalid schema
- LLM unavailable
- tool timeout
- tool failure
- network failure
- state conflict
- duplicate request
- memory policy failure
- streaming interruption

## 8.7 Recovery（恢复）

失败后必须验证：

> 系统是否保持合法状态，而不是仅仅返回错误。

例如：

```text
Tool Failure
↓
Preserve State
↓
Offer legal next action
```

不得：

```text
Tool Failure
↓
State Corruption
```

## 8.8 Adversarial（对抗）

包括：

- prompt injection
- malformed model output
- unauthorized state proposal
- fake completion
- fake memory write
- stale response
- duplicate command
- conflicting user directions
- analytics payload attempting to alter runtime

---

# 9. Fault Injection（故障注入）

故障注入不是额外测试，而是验证系统在失败情况下是否仍遵守产品契约。

至少覆盖：

```text
LLM Timeout
LLM Schema Invalid
LLM Hallucination
Tool Timeout
Tool Failure
Search Failure
Network Failure
State Version Conflict
Duplicate Request
Candidate Generation Failure
Memory Policy Failure
Streaming Interruption
User Interrupt During Generation
```

每个故障必须验证：

```text
Failure
↓
State Integrity
↓
Control Integrity
↓
Recovery Path
↓
Observability
```

禁止只验证：

> HTTP 返回 500。

真正要验证的是：

> **失败后，用户是否仍然拥有合法、可理解、可恢复的控制路径。**

---

# 10. Golden Suite Evaluation（黄金验收评测）

G01-G08 是 P2 产品验收核心。

必须全部执行：

```text
G01 Direct Answer
G02 Why
G03 What If
G04 Creation
G05 Change
G06 Stop
G07 Correction
G08 Memory Boundary
```

每个 Golden Case 必须至少执行：

```text
Normal
+
Negative / Forbidden Behavior
+
Boundary
+
Failure / Recovery
```

其中：

- G05 CHANGE 必须覆盖生成中改变方向。
- G06 STOP 必须覆盖生成中停止。
- G08 Memory Boundary 必须覆盖 Memory 与 Current Intent 冲突。

规则：

> **任何一个 Golden Case 失败，Product Pass = NO。**

不得通过平均分抵消。

---

# 11. Agency Evaluation（用户自主权评测）

Agency 不是满意度，也不是 NPS。

必须验证用户是否真正能够：

### 改变方向

```text
用户说换一个
→ 当前体验停止
→ 新方向生效
```

### 停止

```text
用户说好了
→ 当前体验结束
→ 不自动生成下一体验
→ 不询问是否继续
```

### 纠正

```text
用户纠正 AI
→ 错误推断移除
→ 有效上下文保留
→ 重新评估
```

### 拒绝记忆

```text
用户不希望形成长期偏好
→ 不得因为一次行为永久推断
```

### 理解原因

对于关键推荐/候选：

```text
为什么是这个？
→ 能给出可理解、真实的理由
```

而不是：

```text
虚构用户偏好
```

---

# 12. Agency Blockers（自主权阻断项）

以下任一情况出现，直接阻断相关 Product Pass：

- STOP 被忽略
- CHANGE 被忽略
- 用户无法自然退出
- 系统为了延长 Session 强行继续
- 系统制造无意义问题以延长交互
- Memory 覆盖 Explicit User Direction
- LLM 擅自决定下一体验
- 用户明确要求答案却被强制探索
- 用户无法改变 AI 当前方向
- 系统未经授权形成长期偏好
- 系统使用无法解释的关键推荐
- 更低干扰方案存在却强行增加交互

---

# 13. Regression（回归）

任何行为变化都必须触发相应回归。

至少覆盖：

```text
Contract Regression
Golden Regression
State Regression
Policy Regression
LLM Boundary Regression
API Regression
Analytics Regression
Agency Regression
```

行为变化的版本链：

```text
Change ID
↓
Reason
↓
Owner
↓
Changed Contract / Prompt / Model / Policy / Schema
↓
Version
↓
Affected Tests
↓
Regression Result
```

禁止：

> “只是 Prompt 改了一点，所以不用回归。”

Prompt、Model、Policy、Schema、Evaluation Corpus 任何可能改变行为的变更，都必须具备可追溯版本。

---

# 14. Reproducibility（可复现性）

AI 评测必须记录：

```text
Model
Model Version
Prompt Version
Policy Version
Schema Version
Contract Version
Evaluation Corpus Version
Tool Version
Code Revision
Runtime Environment
```

如果无法确定一次结果由哪个版本产生：

> 该结果不能作为强验收证据。

---

# 15. Product Acceptance（产品验收）

Product Acceptance 采用硬性判断，而不是平均评分。

必须满足：

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

任何一个核心项为 NO：

```text
Product Pass = NO
```

---

# 16. P0 / P1 Blocking Rules（阻断规则）

## P0 Blocker

以下任一项出现：

- Safety Violation
- Unauthorized State Mutation
- LLM Bypass Policy
- LLM Bypass State Machine
- Memory Overrides Current Intent
- STOP Ignored
- CHANGE Ignored
- Hidden Continuation
- Unauthorized Action
- State Corruption
- Incorrect Completion
- Fabricated Analytics Fact
- Unrecoverable State Conflict
- Critical Decision Cannot Be Explained
- User Agency Fundamentally Violated

结果：

```text
RELEASE = BLOCK
PRODUCT PASS = NO
```

## P1 Critical

默认同样阻断：

- Golden Case Failure
- Critical Correction Failure
- Critical Creation Context Loss
- Critical Decision Trace Missing
- Critical Recovery Failure
- Critical Context Continuity Failure

除非经过正式 Product Owner + Independent Evaluation Owner 裁决并记录，否则：

```text
P1 > 0
→ RELEASE BLOCK
```

---

# 17. Metrics vs Acceptance（指标与验收分离）

必须严格区分：

### Acceptance Criteria（验收标准）

回答：

> **能不能通过？**

例如：

```text
STOP 是否必然停止？
```

答案只能是：

```text
YES / NO
```

### Metrics（质量指标）

回答：

> **做得有多好？**

例如：

```text
Intent Fulfillment Rate
First Experience Fit
Agency Score
Correction Recovery Rate
```

规则：

> **质量平均值不能抵消硬性契约失败。**

例如：

```text
Agency Score = 95
但 STOP 被忽略一次

→ Product Pass = NO
```

---

# 18. Evaluation Report（评测报告）

正式评测必须输出：

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
15. Evidence Index
16. Evaluator Sign-off
```

每个失败项必须包含：

```text
Failure ID
Severity
Contract
Expected
Observed
Reproduction
Evidence
Root Cause
Affected Scope
Owner
Fix
Regression Requirement
Status
```

---

# 19. AI Coding Governance（AI 编码团队评测权限）

AI Coding Team（AI 编码团队）可以：

- 执行测试
- 生成测试
- 修复实现
- 发现缺陷
- 提交评测证据
- 提出技术原因

不得：

```text
修改 Acceptance Criteria
修改 Golden Case
修改 PASS 定义
降低 Severity
删除失败测试
修改 Product Contract
修改 Policy 以适应实现
修改 State Machine 以适应测试
隐藏失败
使用 Mock 掩盖真实行为
自行宣布 Product Pass
```

如果 AI 编码团队发现：

```text
Implementation
vs
Contract
```

冲突：

```text
STOP
↓
Register Conflict
↓
Cite Contract
↓
Present Limited Options
↓
Product Decision
↓
Version Update
↓
Regression
↓
Resume
```

---

# 20. Evidence Status（证据状态）

本 Part 的状态必须明确分成：

| 项目                            | 当前状态    |
| ----------------------------- | ------- |
| Evaluation Authority          | Defined |
| Evaluation Independence       | Defined |
| Deterministic Tests           | Defined |
| Probabilistic AI Evaluation   | Defined |
| Scenario Matrix               | Defined |
| Fault Injection               | Defined |
| Regression                    | Defined |
| Agency Evaluation             | Defined |
| Product Acceptance            | Defined |
| Release Gate                  | Defined |
| Evaluation Report             | Defined |
| Traceability                  | Defined |
| Evaluator Sign-off            | Pending |
| Actual Test Execution         | Pending |
| Golden Execution Evidence     | Pending |
| Fault Injection Evidence      | Pending |
| Independent Evaluation Report | Pending |

因此：

> **Part 5 = Defined / Evidence Pending**

不得标记：

> PASS

不得标记：

> P2 CLOSED

---

# 21. P2 Closure Impact（对 P2 关闭的影响）

Part 5 完成定义后，P2 仍处于：

> **Closure Candidate（关闭候选）**

而不是：

> **Closed（已关闭）**

P2 Exit Gate 仍要求实际获得：

```text
Seven Contract Freeze Evidence
+
Cross-Contract Evidence
+
Golden Suite Evidence
+
Engineering Boundary Evidence
+
Independent Evaluation Evidence
```

最终：

```text
P2 Evidence Complete
↓
P2 Exit Gate
↓
Independent Sign-off
↓
P2 CLOSED
```

在此之前：

```text
P3 Entry Preparation
= ALLOWED

P3 Implementation
= BLOCKED
```

---

# 22. Final Governance Rule（最终治理规则）

> **评测不能修改产品契约；评测只能证明实现是否符合产品契约。**

> **测试通过不是产品通过；模型表现好不是产品正确；Demo 成功不是系统正确。**

> **任何核心契约、Golden Case、Agency Rule、State Integrity Rule 的失败，都必须先修复或正式裁决，不能通过降低验收标准消除失败。**

> **没有可追溯证据，就没有正式通过。**

**Part 5 Status：Defined / Evidence Pending。**
