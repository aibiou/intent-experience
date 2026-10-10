# S4 范围提案（S4-SCOPE-PROPOSAL-01 v0.1.0）

**状态：** STAGED FOR PRODUCT-OWNER RULING——待产品负责人逐项裁决 D-1…D-6
**编号：** S4-SCOPE-PROPOSAL-01
**版本：** 0.1.0（2026-10-10：staged——实现方起草，待产品负责人裁决）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** C3-SEMANTIC-GAP-REGISTER-01 v1.0.0（G-1…G-7 空缺登记）/ SRC-06（`docs/product/reference/14｜Action & Policy Contract V1（动作与策略契约 V1）.md`——C3 frozen 源）/ contract-authority-baseline §3 C3 条 / S3-SCOPE-PROPOSAL-01 v1.0.0（S3 先例）/ policy_v2.2.0 / state_machine_v1.5.0 / ADR-0002 §3（硬边界）
**记录日期：** 2026-10-10

## 1. 事实取证

- **S3 时代全部关闭**（2026-10-10）：S3 G5 独立评测 PASSED（无条件）——P3-S3-G5-WORKSHEET-01 v0.2.0（16 项 = 12 PASS + 1 N/A（第 9 项））；CR-29 RULED→EVALUATED（decision-register v0.32.0）；readiness-record v1.42.0。
- **C3 语义空缺 G-1…G-7 登记在案**（C3-SEMANTIC-GAP-REGISTER-01 v1.0.0，2026-10-08）：SRC-06 经逐节核对存在 7 项行为语义空缺；登记约束 §3.1——空缺补齐（选择判据、取值域、阈值、评分公式、分类扩展、内部过程定义）均为产品行为变化，须产品负责人版本化决策（Change ID + 版本 + 批准 + 测试 + 验收），不得由实现者、编码者或代理自行补写；§3 约束不改写归档源字节。
- **现行分类器对空缺项的处理**（policy_v2.2.0）：确定性优先级链 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER；全部优先级层未命中的输入 → UNKNOWN → 升级（授权 §5.7：未知情况升级，非 LLM 决定）；resolvePolicy 对冻结表外动作一律拒绝（ACTION_OUT_OF_S1_SCOPE——含 REPEAT/CONTINUE 等 G-1 空缺项）。
- **状态机已含 ENTERING**（state_machine_v1.5.0：ENTERING → READY → ACTIVE → WAITING → COMPLETED；CHANGE_DIRECTION 经 READY/ACTIVE → ENTERING）——源 §15 资格表引用的 START/CHANGE 在实现中以 CHANGE_DIRECTION 承载（G-3 的实现侧事实）。
- **产品运行时为合成 fixture 模式**（ADR-0002 §3 硬边界：产品代码不含真实 LLM 提供商）——分类与策略解析均为确定性规则；S4 任何语义定义须可确定性实现，不得依赖 LLM 判定。
- **内部过程已事实使用**：策略决策理由已出现 reason=reassess（REASSESS 内部过程——S3 冒烟 CORRECTION 决策实证），但内部过程语义未版本化（G-7）。

## 2. 语义空缺分析（G-1…G-7 → 产品行为影响）

| # | 空缺（登记册） | 产品行为影响（现状） |
|---|---|---|
| G-1 | §7 分类表无 REPEAT/CONTINUE 策略动作；§8 映射「REPEAT → REPEAT equivalent response」「CONTINUE → CONTINUE current runtime」未定义 | 用户「重新表达 / 继续」类输入无法分类为策略动作——经 UNKNOWN 升级或命中其他层；源 §8 优先级关系（STOP > CONTINUE、CHANGE_DIRECTION > CONTINUE）暗示 CONTINUE 为既定策略动作，但分类表缺正式定义 |
| G-2 | §8 多选映射未定义选择判据（WHY → EXPLAIN / ANSWER；COMPARE → ANSWER / EXPLAIN；VERIFY → SEARCH / ANSWER；KNOWN → WAIT / DEEPEN / BRANCH） | 多选语义动作的策略动作选择无一般规则——实现按冻结映射表逐案例执行（S1 黄金案例 GS-02 WHY → EXPLAIN 经冻结预期指定） |
| G-3 | §15 ENTERING 状态资格表允许 START/CHANGE，二者均不在 §7 分类表 | 实现侧经 CHANGE_DIRECTION 承载（state_machine_v1.5.0）；源文档引用一致性空缺 |
| G-4 | §20 PolicyDecision.constraints 的 depth / interaction 取值域未定义 | 策略决策约束字段取值域未版本化 |
| G-5 | §23 Case A confidence < threshold 的 threshold 数值未定义 | 确定性分类器不产生低置信匹配（未命中即 UNKNOWN 升级）——阈值语义待版本化 |
| G-6 | §17 / §18「Simple Scoring」评分公式与权重未定义 | 评分公式未版本化（实现分类为确定性词表，不使用该评分） |
| G-7 | REASSESS / SAFE_WAIT / MINIMAL_CLARIFICATION 为 Policy Engine 内部决策过程，定义与返回合法策略动作的完整出口条件未定义 | 实现已内部使用 reassess 作为决策理由（policy_decision.reason=reassess），但内部过程语义与出口条件未版本化 |

## 3. 裁决选项（D-1…D-6——选项文本经裁决版本化冻结）

### D-1：G-1 REPEAT / CONTINUE 策略动作分类扩展

- **选项 A（实现方建议）**：版本化定义并纳入 §7 分类表——REPEAT = 重复上一响应（呈现层重放上一完成轮响应——不登记状态变更事件，决策追踪留痕形态由冻结文本定义）；CONTINUE = 继续当前体验（确定性系统回合——维持当前运行时状态并继续当前未完成轮次；无未完成轮次时为幂等空操作；llm_used=false、reasonPrimary=explicit_user_direction）；**优先级层插入位置：全部既有层之后**（仅认领全部优先级层未命中的 REPEAT/CONTINUE 类输入——零既有输入行为变化；源 §8 优先级关系 STOP > CONTINUE / CHANGE_DIRECTION > CONTINUE 经此实例化）；resolvePolicy 冻结表扩展。
- **选项 B**：维持空缺——REPEAT/CONTINUE 保持拒绝（ACTION_OUT_OF_S1_SCOPE），§8 映射经版本化注记改述为显式升级。
- **选项 C**：仅定义其一（如仅 CONTINUE）。

### D-2：G-2 多选映射一般选择判据

- **选项 A（实现方建议）**：版本化定义确定性选择规则——多选语义动作按固定优先级序选择（WHY → EXPLAIN 优先于 ANSWER——与 S1 黄金案例 GS-02 冻结预期一致；COMPARE → ANSWER 优先于 EXPLAIN；VERIFY → SEARCH 优先于 ANSWER；KNOWN → WAIT 优先于 DEEPEN / BRANCH），判据为确定性优先级序而非上下文推断。
- **选项 B**：维持空缺——多选映射逐案例经冻结预期指定（S1 先例），不定义一般规则。
- **选项 C**：部分映射定义（如仅 WHY / COMPARE）。

### D-3：G-3 ENTERING 资格表引用一致性

- **选项 A（实现方建议）**：版本化登记更正——资格表 START/CHANGE 经策略版本注记登记合法动作名为 CHANGE_DIRECTION（与实现一致）；纯引用一致性更正，无产品行为变化；不改写归档源字节（登记册约束 §3）。
- **选项 B**：维持空缺（登记注记）。
- **选项 C**：分类表扩展 START/CHANGE 为新策略动作（产品行为变化——实现方不推荐：无实现需求，CHANGE_DIRECTION 已承载）。

### D-4：G-4 / G-5 / G-6 策略内部参数组（取值域 / 阈值 / 评分公式）

- **选项 A（实现方建议）**：版本化定义——constraints depth / interaction 枚举（取值域由策略版本冻结——如 depth: shallow / medium / deep；interaction: single / multi）；confidence 阈值（确定性分类器不产生低置信匹配——版本化确认「未命中即升级」为阈值语义的实例化，threshold 定义不改变行为）；Simple Scoring 公式与权重（版本化登记为规范定义——实现分类不依赖该评分，公式定义不改变行为）。
- **选项 B**：维持空缺（参数组保持未定义）。
- **选项 C**：仅定义部分（如仅取值域）。

### D-5：G-7 内部过程定义与出口条件

- **选项 A（实现方建议）**：版本化定义 REASSESS / SAFE_WAIT / MINIMAL_CLARIFICATION 内部过程与返回合法策略动作的完整出口条件——REASSESS = 内部重新评估过程（出口：重新分类后返回合法策略动作——实现已用 reason=reassess）；SAFE_WAIT = 安全等待过程（出口：等待用户输入或升级）；MINIMAL_CLARIFICATION = 最小澄清过程（出口：澄清请求或升级）。
- **选项 B**：维持空缺。
- **选项 C**：部分定义（如仅 REASSESS——实现已使用）。

### D-6：实施路径

- **选项 A（实现方建议）**：一次性实施（D-1…D-5 全项 A → policy_v2.3.0 变更 1–5 → 动态证据 S4A-F1-0001 + G3-GOLDEN-0001 回归 + S2B-0001 重跑 → S4 G5 独立评测）。
- **选项 B**：分批（先 D-1 / D-5 行为变更组 → 证据 → 再 D-2 / D-4 参数组）。
- **选项 C**：仅版本化决策不实施（语义冻结文本签发，实施授权另行签发）。

## 4. 选项 A 实施影响（D-1…D-6 全项 A）

- policy_v2.2.0 → policy_v2.3.0（变更 1–5：D-1 分类表扩展 / D-2 多选判据 / D-3 源引用一致性 / D-4 参数组 / D-5 内部过程）；state_machine_v1.5.0 不变（REPEAT/CONTINUE 为策略动作与分类内部语义，不新增体验轴触发器——REPEAT 不登记状态变更事件、CONTINUE 为确定性系统回合）。
- classifier.ts：REPEAT/CONTINUE 词表（确定性模式——「重新表达 / 再说一遍 / 重复上一条」与「继续 / 继续当前体验」）；优先级层插入全部既有层之后（仅认领全部优先级层未命中的输入——零既有输入行为变化，黄金套件 48/48 不变式核验）。
- resolvePolicy 冻结表扩展（REPEAT → REPEAT 策略动作；CONTINUE → CONTINUE 策略动作）。
- 动态证据计划：S4A-F1-0001（分类行为回归——REPEAT/CONTINUE 正常路径 + 负向（未知输入升级不变）+ 多选判据案例组 + 幂等性）/ G3-GOLDEN-0001 黄金套件回归（48/48 不变式核验）/ S2B-0001 重跑。
- S4 G5 评测链：复用 16 项框架（类比 S2/S3-G5-EVAL-DEF 先例——范围定义提案另行 staged 待裁决）。
- 无事件契约变更（C6 不变——REPEAT 不登记状态变更事件；CONTINUE 经既有事件提交路径——留痕形态由冻结文本定义）。
- 角色分离不变：实施作者不得兼任独立评测人。

## 5. 明确非结论

- 本提案不预判任何裁决结果；不改变任何已冻结证据；空缺补齐的裁决权归产品负责人（登记册约束 §3.1）。
- 选项 B/C 的选择不改变已提交证据；产品运行时保持 policy_v2.2.0 直至裁决后实施。
- 本提案不构成任何 Gate 状态变化（S3 G5 PASSED 无条件结论不受影响）；不设置任何产品 Gate 为 PASS（E5 §2）。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10。
- 产品负责人裁决：（待裁决——D-1…D-6 逐项）
- 独立评测人（角色 5，用户本人，PD-15）：（待评测执行）
