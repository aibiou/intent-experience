# S4A 语义冻结文本（S4A-SEMANTIC-FREEZE-01 v1.0.0）

**状态：** FROZEN——产品负责人（用户本人，PD-15）2026-10-10 裁决（D-1…D-5 全项 A，经 S4-SCOPE-PROPOSAL-01 v1.0.0 裁决）
**编号：** S4A-SEMANTIC-FREEZE-01
**版本：** 1.0.0（2026-10-10：产品负责人裁决 D-1…D-5 全项 A——语义版本化冻结）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** S4-SCOPE-PROPOSAL-01 v1.0.0（RULED——D-1…D-6 全项 A）/ C3-SEMANTIC-GAP-REGISTER-01 v1.0.0（G-1…G-7 空缺登记——§3.1 补齐须产品负责人版本化决策；§3 不改写归档源字节）/ SRC-06（`docs/product/reference/14｜Action & Policy Contract V1（动作与策略契约 V1）.md`——C3 frozen 源）/ policy_v2.2.0 → policy_v2.3.0（本冻结文本实施）/ state_machine_v1.5.0（不变）/ ADR-0002 §3（硬边界——确定性实现，不依赖 LLM 判定）
**记录日期：** 2026-10-10

## 1. 语义定义（D-1…D-5 裁决原文——版本化冻结）

### D-1（G-1）：REPEAT / CONTINUE 策略动作分类扩展

- **REPEAT = 重复上一响应**：呈现层重放上一完成轮响应内容（经既有流式 chunk 路径呈现上一完成轮响应——确定性系统回合：llm_used=false、reasonPrimary=explicit_user_direction）；不登记状态变更事件（state_version 不变——纯呈现层重放）；决策追踪留痕（REPEAT 决策经既有决策追踪路径登记）。
- **CONTINUE = 继续当前体验**：幂等确认回合——维持当前运行时状态（state_version 不变），响应 done 事件确认体验继续；确定性系统回合（llm_used=false、reasonPrimary=explicit_user_direction）。取消中断轮次的恢复属客户端重连语义（经既有取消传播纪律——客户端断开后不恢复部分生成），CONTINUE 不恢复中断轮次。
- **优先级层位置**：CONTINUE / REPEAT 位于全部既有优先级层之后（仅认领全部优先级层未命中的输入——零既有输入行为变化）；源 §8 优先级关系（STOP > CONTINUE、CHANGE_DIRECTION > CONTINUE）经此实例化。
- **resolvePolicy 冻结表扩展**：REPEAT → REPEAT 策略动作；CONTINUE → CONTINUE 策略动作（原拒绝码 ACTION_OUT_OF_S1_SCOPE 对二者不再返回）。

### D-2（G-2）：多选映射一般选择判据

- 多选语义动作的策略动作选择经**固定优先级序**确定（判据为确定性优先级序，非上下文推断）：
  - WHY → EXPLAIN（优先于 ANSWER——与 S1 黄金案例 GS-02 冻结预期一致）
  - COMPARE → ANSWER（优先于 EXPLAIN）
  - VERIFY → SEARCH（优先于 ANSWER）
  - KNOWN → WAIT（优先于 DEEPEN / BRANCH）
- 优先级序第一条命中即为所选策略动作；单选映射不受影响（既有冻结映射表不变）。

### D-3（G-3）：ENTERING 资格表引用一致性

- 源 §15 ENTERING 状态资格表引用的 START / CHANGE 经本冻结文本版本化注记：**合法动作名为 CHANGE_DIRECTION**（与 state_machine_v1.5.0 及实现一致——CHANGE_DIRECTION 经 READY/ACTIVE → ENTERING）；不改写归档源字节（C3-SEMANTIC-GAP-REGISTER-01 §3 约束）；policy_v2.3.0 变更 3 登记该注记。

### D-4（G-4 / G-5 / G-6）：策略内部参数组

- **constraints 取值域**（§20）：depth ∈ { shallow, medium, deep }；interaction ∈ { single, multi }——取值域由 policy_v2.3.0 冻结；PolicyDecision.constraints 为可选字段（未使用时省略）。
- **confidence 阈值**（§23 Case A）：确定性分类器不产生低置信匹配——「全部优先级层未命中即 UNKNOWN → 升级」（授权 §5.7）为阈值语义的实例化：分类匹配输入 confidence=1.0 恒满足任何 ≤1.0 阈值；未命中输入不经阈值判定、直接升级。threshold 数值定义不改变行为。
- **Simple Scoring 公式与权重**（§17 / §18）：版本化登记为规范定义——score = 0.5 × intent_match + 0.3 × context_relevance + 0.2 × history_signal（权重 0.5 / 0.3 / 0.2）；实现分类为确定性词表（不使用该评分——公式定义不改变行为）；评分公式仅作契约规范登记，未来依评分实现的分类须经另行版本化决策。

### D-5（G-7）：内部过程定义与出口条件

- **REASSESS** = 内部重新评估过程：分类输出经策略层重新评估（决策理由 reason=reassess——实现已事实使用，S3 冒烟 CORRECTION 决策实证）；**出口**：重新分类后返回合法策略动作。
- **SAFE_WAIT** = 安全等待过程：输入存在安全疑虑或上下文不足时等待；**出口**：等待用户输入（WAITING 状态）或升级（授权 §5.7）。
- **MINIMAL_CLARIFICATION** = 最小澄清过程：输入歧义时发出最小澄清请求；**出口**：澄清请求（响应 clarification 字段）或升级。
- **完整出口条件**：内部过程必须返回合法策略动作（源 §8 注）——内部过程本身不直接修改 ExperienceState（经 Runtime 单一写入者路径）。

## 2. 分类器优先级链（policy_v2.3.0 变更 1）

STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER > **CONTINUE > REPEAT** > UNKNOWN（升级）

- CONTINUE / REPEAT 位于全部既有层之后——仅认领全部优先级层未命中的「继续 / 重新表达」类输入；零既有输入行为变化（黄金套件 G3-GOLDEN-0001 48/48 不变式核验）。

## 3. 词表（实现细节——确定性模式）

- CONTINUE 词表（示例基线——实现可扩词，扩词属实现细节不改变语义）：/继续/、/继续当前体验/、/往下进行/、/接着来/
- REPEAT 词表（示例基线）：/重复上一/、/重复上一条/、/再说一遍/、/重新表达/、/再表达一次/
- 词表冲突纪律：任一既有优先级层命中优先于 CONTINUE / REPEAT 层（如「继续创作」命中 CREATE 层 → CREATE——不因含「继续」而降级）。

## 4. 不变量（零回归核验）

- 全部既有优先级层命中行为不变（G3-GOLDEN-0001 48/48 不变式核验；S2B-0001 重跑核验）。
- 未知输入升级纪律不变（授权 §5.7——未命中 CONTINUE / REPEAT 词表的输入仍经 UNKNOWN 升级）。
- 无事件契约变更（C6 不变——REPEAT 不登记状态变更事件；CONTINUE 为幂等确认回合）；无状态机迁移（state_machine_v1.5.0 不变——REPEAT / CONTINUE 不新增体验轴触发器）。
- REPEAT / CONTINUE 不登记状态变更事件（state_version 不变——纯呈现 / 确认语义；决策追踪留痕）。

## 5. 明确非结论

- 本冻结文本不设置任何产品 Gate 为 PASS（E5 §2）；实施完成以动态证据 + 独立评测为准（S4 G5 评测链另行 staged）。
- 评分公式（D-4）为规范登记——不构成实现承诺；依评分实现的分类须经另行版本化决策。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10。
- 产品负责人裁决：**D-1…D-5 全项 A，2026-10-10**（经 S4-SCOPE-PROPOSAL-01 v1.0.0 裁决——D-6 实施路径选项 A：一次性实施）。
- 实施登记：**已完成，2026-10-10**（CR-30 D-1…D-6 全项 A 实施——D-6 选项 A 一次性实施路径；产品提交 `717fa61`：3 文件 +375/−7——policy_v2.3.0 变更 1–5 生效：① 分类器优先级层 CONTINUE / REPEAT 识别插入全部既有层之后（QUESTION_MARKERS 之后、记忆操作识别之前——仅认领全部既有层未命中输入，零既有输入行为变化）② 词表（CONTINUE=/继续当前体验/继续/往下进行/接着来/、REPEAT=/重复上一/重复上一条/再说一遍/重新表达/再表达一次/）③ resolvePolicy 冻结表恒等映射（CONTINUE → CONTINUE / REPEAT → REPEAT）④ 运行时 executeContinue（幂等确认回合——done 终止事件、0 内容分块、fixtureId=synthetic/continue/v1、无状态提交、completionCommit:false）/ executeRepeat（呈现层重放——上一完成轮响应逐字节重放、fixtureId 为上一轮语料；无上一完成轮 → INVALID_STATE_TRANSITION（retryable=false））/ captureLastResponse（空轮不覆盖上一内容轮记录）⑤ 事件属性扩展（continue_requested / repeat_requested ×1——C6 §14 派生，不新增事件名）；state_machine_v1.5.0 不变——S4 为纯策略语义；动态证据三运行全绿（G3-GOLDEN-0001 再生 48/48 案例、10/10 断言——既有黄金行为零回归；S2B-0001 重跑 7/7 案例、14/14 断言——S2b 行为面零回归；S4A-F1-0001 首次执行 6/6 案例、15/15 断言——S4A §5 动态证据计划六组案例面：词表分类×2 / 运行时正常路径×2 / 负路径 / 零回归；均退出码 0，SHA256SUMS 98 / 16 / 14 项独立重算一致——退出码 0 只表示各运行断言通过，不设置任何 Gate 为 PASS，E5 §2）；失败尝试 2 次 + 先前通过运行前置归档 3 个按 ADR-0002 §5 如实归档（均为执行器侧缺陷，产品运行时零缺陷）；迭代记录 P3-S4-IMPL-ITER v1.0.0（`implementation-iteration-s4.md`）；EVIDENCE-MANIFEST-01 v1.6.0；**S4 G5 独立评测 NOT RUN——属角色 5 独立评测人（用户本人，PD-15）逐项裁决（P3-S4-G5-WORKSHEET-01 待新建）**）
