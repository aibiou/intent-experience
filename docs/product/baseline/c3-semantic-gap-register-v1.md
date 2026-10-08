# C3 行为语义空缺登记

**编号：** C3-SEMANTIC-GAP-REGISTER-01
**版本：** 1.0.0（2026-10-08：登记建立——G-1…G-7 空缺登记完成，履行 P3-S1-REVIEW-006 F-2 处置义务）
**状态：** REGISTERED——空缺已登记；空缺的补齐属产品负责人版本化决策，不得由编码者、实现者或代理补写
**依据：** P3-S1-REVIEW-006 F-2（处置：C3 Steward 确认时须显式接受版本化安排，并登记任何行为语义空缺）；contract-authority-baseline §3 C3 条；steward-confirmation-c1-c7.md C3 行（C3 Steward 已显式接受该版本化安排，2026-10-08）
**范围声明：** 本登记只登记空缺，不补写、不解释性补齐、不产生 Gate 证据；不改变 C3 版本（仍 action_policy_v1.0.0），不改写归档源字节。

## 1. 登记背景

C3 来源文档 SRC-06（`14｜Action & Policy Contract V1`）原状态为 Draft for Product Freeze；基线赋予版本 action_policy_v1.0.0。文档结构完整（§1–§35），但经逐节核对，存在以下行为语义空缺或未定义项。C3 Steward 确认（2026-10-08）已显式接受该版本化安排；本登记将空缺逐项登记在案。

## 2. 空缺清单

| # | 位置 | 空缺内容 | 登记处置 |
|---|---|---|---|
| G-1 | §7 vs §8 | Policy Action Taxonomy（§7）无 REPEAT 与 CONTINUE 策略动作；§8 映射 `REPEAT → REPEAT equivalent response`（"等价响应"未定义）与 `CONTINUE → CONTINUE current runtime`（"CONTINUE" 非 §7 策略动作） | 空缺登记；实现不得自造 REPEAT / CONTINUE 策略动作或等价行为；语义待产品负责人版本化决策 |
| G-2 | §8 | 多选映射未定义选择判据：`WHY → EXPLAIN / ANSWER`、`COMPARE → ANSWER / EXPLAIN`、`VERIFY → SEARCH / ANSWER`、`KNOWN → WAIT / DEEPEN / BRANCH` | 空缺登记；一般选择规则待版本化决策。注：S1 黄金案例层面 `WHY → EXPLAIN` 由 S1 §26 GS-02 与 acceptance-mapping 冻结预期指定，不依赖 C3 一般规则 |
| G-3 | §15 | ENTERING 状态资格表允许 `START` / `CHANGE`，二者均不在 §7 Policy Action Taxonomy | 空缺登记；资格表引用动作名与分类表不一致，待版本化决策 |
| G-4 | §20 | PolicyDecision.constraints 的 `depth` / `interaction` 取值域未定义（示例值 `medium` 无枚举定义） | 空缺登记；取值域待版本化决策 |
| G-5 | §23 Case A | `confidence < threshold` 的 threshold 数值未定义 | 空缺登记；阈值待版本化决策 |
| G-6 | §17 / §18 | "Simple Scoring" 的评分公式与权重未定义（§18 仅列组件名，无计算式） | 空缺登记；公式与权重待版本化决策 |
| G-7 | §8 注 / §23 Case C | `REASSESS`、`SAFE_WAIT`、`MINIMAL_CLARIFICATION` 为 Policy Engine 内部决策过程，不在 §7 分类表；除 §8 注（"最终必须重新得到合法 Policy Action"）与 §23 Case C（"取决于是否存在安全默认路径"）外，内部过程定义与返回合法策略动作的完整出口条件未定义 | 空缺登记；内部过程语义待版本化决策 |

## 3. 约束

1. 上述空缺的补齐（选择判据、取值域、阈值、评分公式、分类扩展、内部过程定义）均为产品行为变化，须产品负责人版本化决策（Change ID + 版本 + 批准 + 测试 + 验收），不得由实现者、编码者或代理自行补写。
2. S1 动态执行（G2–G4）如行使到空缺语义（如 KNOWN 的多选映射、confidence 阈值判定），按 P2-EVIDENCE-8.1 升级规则处理：未知情况升级而非由 LLM 决定；案例预期以 S1 §26 与 acceptance-mapping 冻结预期为准。
3. S1 范围已由 PD-05 / PD-06 决定：完整 CREATE / MODIFY 行为属 S2 候选，S1 不实现完整 Creation；本登记 G-1…G-7 不构成对 S1 范围裁决的修改。
4. 本登记不改变任何 Gate 状态；G1 已 PASSED（2026-10-08，C1–C7 Steward 确认 + R1 非作者复核 REVIEW-006）不因本登记变化。

## 4. 关联

- P3-S1-REVIEW-006 §4 F-2（处置义务来源，已签署）
- steward-confirmation-c1-c7.md C3 行（版本化安排显式接受，2026-10-08）
- contract-authority-baseline-v1.md §3 C3 条（v1.2.1 引用本登记）
- acceptance-mapping.md §A（GS-01…GS-06 冻结预期）
