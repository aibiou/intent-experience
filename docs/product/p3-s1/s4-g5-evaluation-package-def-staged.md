# S4 时代 G5 评测包范围定义提案（S4-G5-EVAL-DEF-01 v0.1.0）

**状态：** RULED——产品负责人（用户本人，PD-15）2026-10-10 裁决选项 A（复用 16 项框架对 S4 增量证据执行独立评测）
**编号：** S4-G5-EVAL-DEF-01
**版本：** 1.0.0（2026-10-10：产品负责人裁决"选项 A"升版 RULED）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** P3-S3-G5-WORKSHEET-01 v0.2.0（S3 时代 G5 独立评测——PASSED 无条件，2026-10-10：16 项 = 12 PASS + 1 N/A（第 9 项——S3 时代不作任何延迟指标宣称））/ P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代 G5 独立评测——PASSED 无条件）/ P3-S1-G5-WORKSHEET-01 v1.8.0（P2 时代 G5 16 项评测包——PASSED 无条件，2026-10-09）/ S3-G5-EVAL-DEF-01 v1.0.0（S3 时代评测包范围定义——选项 A 裁决先例）/ S2-G5-EVAL-DEF-01 v1.0.0（S2 时代评测包范围定义——选项 A 裁决先例）/ EVIDENCE-MANIFEST-01 v1.6.0（S4 实施证据登记）/ P3-S4-IMPL-ITER v1.0.0（S4 实施迭代记录）/ readiness-record v1.45.0 / decision-register v0.35.0（CR-30 IMPLEMENTED）/ S4-SCOPE-PROPOSAL-01 v1.0.0（D-1…D-6 全项 A 裁决）/ S4A-SEMANTIC-FREEZE-01 v1.0.0（语义冻结文本）

## 1. 事实取证

- **S3 时代 G5 独立评测已完成**（2026-10-10）：P3-S3-G5-WORKSHEET-01 v0.2.0——S3 时代 G5 评测判定 PASSED（无条件）——16 项 = 12 PASS（第 1/2/3/4/5/6/7/8/10/11/12/15 项）+ 1 N/A（第 9 项——签署定稿理由：S3 时代不作任何延迟指标宣称）；第 13 项风险评估与第 14 项发布建议已登记（评测人选项 A 文字）；无 DEFERRED、无 P0 失败、无 NOT RUN 残余。
- **S4 实施完成**（CR-30 RULED→IMPLEMENTED，2026-10-10）：D-1…D-6 全项 A——产品提交 `717fa61`（3 文件 +375/−7——src/experience/{classifier,policy,runtime}.ts；policy_v2.3.0 变更 1–5 生效——REPEAT / CONTINUE 策略动作版本化：C3 G-1 空缺版本化关闭；state_machine_v1.5.0 不变——S4 为纯策略语义，无状态机迁移）。
- **S4 动态证据三运行全绿**（2026-10-10，均退出码 0——退出码 0 只表示各运行断言通过，不设置任何 Gate 为 PASS，E5 §2）：
  - G3-GOLDEN-0001（再生成）：48/48 案例、10/10 断言（policy_v2.3.0 基线——既有黄金行为零回归；S4 无新增黄金案例组——SHA256SUMS 98 项独立重算全部精确通过）；
  - S2B-0001（重跑）：7/7 案例、14/14 断言（黄金回归绑定新基线 policy_v2.3.0 / 48 案例——S2b 行为面零回归：S4 经 policy_v2.3.0 在 DIRECT_ANSWER 之后扩展 CONTINUE > REPEAT，S2b 行为面零变化——SHA256SUMS 16 项）；
  - S4A-F1-0001（首次执行）：6/6 案例、15/15 断言（S4A-SEMANTIC-FREEZE-01 §5 动态证据计划六组案例面——词表分类×2（CONTINUE-CLASSIFICATION / REPEAT-CLASSIFICATION）/ 运行时正常路径×2（CONTINUE-RUNTIME / REPEAT-RUNTIME）/ 负路径（REPEAT-NEGATIVE）/ 零回归（ZERO-REGRESSION——41 组既有证据输入 + 优先级层插入位置静态字节序验证）——SHA256SUMS 14 项）。
- **每运行 staged 审阅包齐备**：`artifacts/evidence/runs/<run>/review/README.md` ×3（G3-GOLDEN-0001 / S2B-0001 / S4A-F1-0001——均待角色 5 审阅；S2B-0001 既有审阅包已经角色 5 审阅 PASS（2026-10-09，S2b 独立评测关闭），本次重跑审阅包为 policy_v2.3.0 基线再生产物）。
- **证据索引已覆盖 S4 运行**：EVIDENCE-MANIFEST-01 v1.6.0（MANIFEST.json + INDEX.md——13 运行登记；尝试归档总数 59——S4 周期新增 5 个：失败尝试 2 个 + 先前通过运行前置归档 3 个；新增 3 个运行 SHA256SUMS 独立重算全部精确通过——98 / 16 / 14 项）。
- **S4 周期失败登记**：失败尝试 2 次 + 先前通过运行前置归档 3 个按 ADR-0002 §5 如实归档留存——均为执行器侧断言 / 变量传递缺陷，产品运行时零缺陷（缺陷分类与根因分析：P3-S4-IMPL-ITER v1.0.0 §3 逐条登记——G3 首跑 8 案例版本字符串期望未迁移（行为断言全通过、零行为回归）；S4A-F1 首跑执行器双重缺陷（c4Entry 变量传递 FATAL + 流事件序列断言缺陷））。
- **现行 16 项框架为 S1/S2/S3 证据设计**：P3-S3-G5-WORKSHEET-01 的 staged 输入映射不覆盖 S4 增量证据（S4A-F1-0001 新运行、REPEAT / CONTINUE 策略动作语义、优先级层扩展、零回归核验形态）。

## 2. 语义空缺分析

S4 时代证据与 G5 评测之间的空缺（约束自有 frozen 源派生：E5 计划 §6.1 判定规则、S4-SCOPE-PROPOSAL-01 v1.0.0 裁决文本、S4A-SEMANTIC-FREEZE-01 v1.0.0 冻结文本、PD-15 角色分离）：

- **空缺 1（评测覆盖）**：S4 实施完成登记（CR-30 IMPLEMENTED）以「运行退出码 0 + 断言全通过 + 迭代记录」为据，**未经角色 5 独立评测**——S4 增量证据处于「证据已产出、独立评测未执行」状态。角色分离纪律（实现作者不得兼任独立评测人）使该评测必须由用户本人（角色 5）执行或在其书面隔离措施下执行。
- **空缺 2（框架映射）**：16 项框架的评测对象需重定向到 S4 增量证据（第 1/2/3/4/5/7/10/11/15/16 项等），S3 时代语义结论经 policy_v2.3.0 延续性确认（S2/S3 语义经 policy_v2.0.0 / policy_v2.1.0 / policy_v2.2.0 / policy_v2.3.0 延续不变——S4 为纯增量，优先级层插入全部既有层之后；延续性本身须核验）。
- **空缺 3（黄金案例增量）**：S4 无新增黄金案例组——G3-GOLDEN-0001 在 policy_v2.3.0 基线再生 48/48（既有黄金行为零回归）。S4 增量案例面由 S4A-F1-0001 承载（六组案例面——词表分类 / 运行时正常路径 / 负路径 / 零回归）。第 3 项（黄金案例）S4 时代适用性：G3-GOLDEN-0001 存在并再生至 48/48（policy_v2.3.0 基线）——S3 时代适用性理由持续成立；S4 增量案例（S4A-F1-0001 六组）的 Expected / Actual / Result / Evidence 关联由工作表第 3 项覆盖。
- **空缺 4（rubric 适用性）**：S4 未新增合成 fixtures——REPEAT / CONTINUE 语义经既有合成 fixtures + 固定 fixtureId（synthetic/continue/v1——CONTINUE 幂等确认回合 0 内容分片；REPEAT 重放上一完成轮语料 fixtureId）覆盖。rubric 对 S4 新增请求类别（CONTINUE 确认请求 / REPEAT 重放请求）的适用性由评测人确认（批准范围仅测量方法与 rubric 定义本身，不含对 S4 增量语义的预先判定）。
- **空缺 5（负向不变式）**：S4 为纯增量变更——既有负向不变式（优先级层碰撞、UNKNOWN 升级纪律、状态版本冲突、失败写入不消耗版本号）经 S4A-F1-0001 REPEAT-NEGATIVE（无上一完成轮 INVALID_STATE_TRANSITION / 陈旧版本 STATE_VERSION_CONFLICT ×2）与 ZERO-REGRESSION（41 组既有证据输入分类零变化 + 优先级层插入位置静态字节序验证）覆盖。S2/S3 时代负向不变式零回归（G3-GOLDEN-0001 48/48 + S2B-0001 7/7 在 policy_v2.3.0 基线全绿）。
- **空缺 6（暴露层）**：S4 无暴露层变更——纯策略语义（分类器 + 策略表 + 运行时方法），HTTP API 面未扩展（S3-API-0001 HTTP 形态证据为 S3 时代产物——S4 动态证据为进程内形态；HTTP 形态下 CONTINUE / REPEAT 行为经同一 getServerRuntime 单例执行路径——S4A-F1-0001 进程内形态断言对提交分派路径的覆盖即 HTTP 形态执行路径的同一代码路径，但 HTTP 形态逐行 NDJSON 断言未在 S4 周期重跑——该面由评测人确认是否充分或要求补测）。第 4/7/15 项须覆盖暴露层不变式。
- **空缺 7（延迟）**：第 9 项 S2/S3 时代已裁决 N/A（不作任何延迟指标宣称）。S4 时代同纪律——S4 新增请求类别（CONTINUE 确认 / REPEAT 重放）如未来宣称指标，须按 OBL-02-LATENCY-METHOD-01 v1.0.0 §5 样本纪律另行测量并注明分层，方法分层如需覆盖 S4 新增请求类别须先升版批准。S4 时代是否另行执行延迟测量，属产品负责人裁决事项（或在工作表中登记 N/A 附理由）。

## 3. 选项

### 选项 A（实现方建议）：复用 16 项框架对 S4 增量证据执行独立评测

新建 **P3-S4-G5-WORKSHEET-01**（工作表骨架见 §4），沿用 P3-S1 / P3-S2 / P3-S3-G5-WORKSHEET 的 16 项结构与执行规则（结论取值 PASS / FAIL / DEFERRED / N/A，默认 NOT RUN；任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消），逐项映射 S4 增量证据并核验 S2/S3 时代结论延续性，结论由角色 5 独立评测人逐项裁决签署。优点：与 P2/S2/S3 时代评测框架一致、可比、可复用既有执行规则与隔离声明；缺点：工作量与 S2/S3 时代相当（16 项）。**（2026-10-10 经产品负责人裁决采纳——见 §6）**

### 选项 B：S4 专属精简框架

仅执行 S4 增量直接相关项（建议子集：第 1/2/3/4/5/7/10/11/15/16 项），其余项登记 N/A 附理由（如第 6 项 rubric 经 S2 时代批准无维度扩展、第 8 项故障注入无新增面、第 9 项延迟同 S2/S3 裁决 N/A、第 12/13/14 项经 S3 时代框架覆盖仅需增量更新）。优点：聚焦 S4 增量证据；缺点：N/A 理由链须逐项论证，评测可比性弱于选项 A。

### 选项 C：并入后续阶段统一评测

S4 证据暂不单独评测，待 P3 退出 Gate（或产品负责人指定的后续 Gate）统一执行。优点：减少评测轮次；缺点：S4 完成状态（readiness-record「CR-30 IMPLEMENTED」）在 P3 退出前持续处于「独立评测未执行」状态，与 S2「先关再建」（PD-20）纪律的严格程度不一致——S2/S3 关闭前均完成了 G5 独立评测。

## 4. 选项 A 实施影响

- 新建 `docs/product/p3-s1/s4-g5-evaluation-worksheet.md`（P3-S4-G5-WORKSHEET-01 v0.1.0，STAGED FOR EVALUATOR——骨架见下表；结论列全部 NOT RUN，由角色 5 逐项填写）。**（2026-10-10 已按本骨架新建 staged——`s4-g5-evaluation-worksheet.md`）**
- 评测输入：3 运行 staged 审阅包 ×3 + EVIDENCE-MANIFEST-01 v1.6.0 + S4A-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + S4-SCOPE-PROPOSAL-01 v1.0.0 裁决文本 + decision-register 当前版本快照 + acceptance-mapping / XCC-MAP（S4 范围项）+ P3-S3-G5-WORKSHEET-01 v0.2.0（S3 时代结论——延续性核验输入）/ P3-S4-IMPL-ITER v1.0.0（迭代记录——失败尝试登记输入）。
- 角色分离不变：实现作者（工程负责人角色代理）不得兼任独立评测人；本提案由实现方起草，裁决权归产品负责人，评测执行权归角色 5（用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效）。
- 不改变任何已冻结证据：各运行产物（summary.json / cases / traces / SHA256SUMS）为 hash-bound 冻结证据；工作表为评测工具，不是 Gate 证据。
- 裁决后登记：CR-31 状态 STAGED→RULED（S4 时代 G5 评测包范围定义裁决）+ 新建 P3-S4-G5-WORKSHEET-01 v0.1.0 staged + readiness-record 升版 + 本提案 §6 签署区填写。**（均已执行，2026-10-10）**

### 16 项工作表骨架（选项 A；结论列待角色 5 逐项裁决）

| # | G5 必需项 | S4 证据映射（staged 输入） | 评测问题（沿用 P2 框架问句） | 结论 |
|---|----------|--------------------------|------------------------------|------|
| 1 | Version Matrix（版本矩阵） | 3 运行 `run-metadata.json`（E5 §3 矩阵；G3-GOLDEN-0001 含 git 节 commit `717fa61` + uncommittedEntries 运行时刻快照；S4A-F1-0001 含文件级哈希 43 项产品源文件绑定；版本矩阵记录现行 policy_v2.3.0 / state_machine_v1.5.0——S4 为纯策略语义，状态机不变） | 版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | NOT RUN |
| 2 | Test Scope（测试范围） | S4-SCOPE-PROPOSAL-01 v1.0.0（D-1…D-6 全项 A 裁决文本）+ S4A-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + acceptance-mapping / XCC-MAP（S4 范围项——C3 G-1 空缺关闭） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | NOT RUN |
| 3 | Golden Case Result（黄金案例结果） | G3-GOLDEN-0001（48/48 案例、10/10 断言——policy_v2.3.0 基线既有黄金行为零回归；S4 无新增黄金案例组）+ S4A-F1-0001 六组案例面（词表分类×2 / 运行时正常路径×2 / 负路径 / 零回归——Expected / Actual / Result / Evidence 关联 S4A §3 词表 / §4 不变量） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID）？**S4 增量案例面（S4A-F1-0001）适用性——G3-GOLDEN-0001 存在并再生至 48/48（policy_v2.3.0 基线）** | NOT RUN |
| 4 | Contract Test Result（契约测试结果） | S4A-F1-0001 CONTINUE-RUNTIME / REPEAT-RUNTIME 事件链（submission 头事件 policy_decision reason=semantic_action / done 终止事件 0 分片 / continue_requested / repeat_requested ×1——C6 §14 命名模式派生，不新增事件名）+ 决策追踪链（llm_used=false / user_override=true / explicit_user_direction / state_after.state_version === state_before.state_version）+ 版本链不变式（CONTINUE / REPEAT 零版本消耗） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？ | NOT RUN |
| 5 | Scenario Matrix Result（场景矩阵结果） | S4A-F1-0001 六场景（词表分类含碰撞核验 6 + 4 组 / 幂等确认回合 / 呈现层重放 / 负路径 INVALID_STATE_TRANSITION + STATE_VERSION_CONFLICT ×2 / 零回归 41 组输入） | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | NOT RUN |
| 6 | AI Evaluation Result（AI 评测结果） | 合成 fixtures（S4 未新增——REPEAT / CONTINUE 经既有 fixtures + 固定 fixtureId synthetic/continue/v1）；rubric 定义已经产品负责人批准（2026-10-09：合成 fixtures 上的契约一致性评测） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？**rubric 对 S4 新增请求类别（CONTINUE 确认 / REPEAT 重放）的适用性由评测人确认** | NOT RUN |
| 7 | Regression Result（回归结果） | G3-GOLDEN-0001 再生产物（policy_v2.3.0 基线 48/48——S4 纯增量零回归）/ S2B-0001 重跑（黄金回归绑定新基线 policy_v2.3.0 / 48 案例——S2b 行为面零回归）/ S4A-F1-0001 ZERO-REGRESSION（41 组既有证据输入分类零变化 + 优先级层插入位置静态字节序验证） | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？**S2/S3 语义零回归（policy_v2.3.0 恒等映射）核验** | NOT RUN |
| 8 | Fault Injection Result（故障注入结果） | S2A-OBL-01-0001（HTTP 形态 LLM 故障 503 补测——S1/S2 时代已关闭）；S4 时代无新增故障注入面——负路径错误语义（INVALID_STATE_TRANSITION / STATE_VERSION_CONFLICT——retryable=false）经 S4A-F1-0001 REPEAT-NEGATIVE 案例覆盖 | 故障注入逐案评测结论？**S4 负路径错误语义覆盖是否充分（或登记 N/A 附理由——无新增故障注入面）** | NOT RUN |
| 9 | Latency Result（延迟结果） | S4 时代 3 运行耗时参考值（约 33s / 12s / 5s——含预检）；OBL-02-LATENCY-METHOD-01 v1.0.0（方法已经产品负责人按 E3 批准） | 统计阈值是否已经产品负责人按 E3 批准？测量方法是否定义？**S4 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由——类比 S2/S3 时代裁决）；任何指标宣称前须满足方法 §5 样本纪律，方法分层如需覆盖 S4 新增请求类别（CONTINUE 确认 / REPEAT 重放）须先升版批准** | NOT RUN |
| 10 | Agency Result（用户自主权结果） | S4A-F1-0001 CONTINUE / REPEAT 用户主权（显式用户方向——user_override=true；CONTINUE 幂等确认不改变状态——用户确认语义；REPEAT 呈现层重放不改变状态——重放非再生成；REPEAT 前置条件——无上一完成轮拒绝（不虚构响应）；未知输入升级纪律不变）/ 停止路径与完成边界案例 | 逐案评测——用户主权是否零违规（P0 零容忍）？ | NOT RUN |
| 11 | Known Failures（已知失败） | S4 周期失败尝试 2 次 + 先前通过运行前置归档 3 个（ADR-0002 §5 只追加留存——均为执行器侧断言 / 变量传递缺陷，产品运行时零缺陷；G3 首跑 8 案例版本字符串期望未迁移——行为断言全通过；S4A-F1 首跑执行器双重缺陷——c4Entry 变量传递 FATAL + 流事件序列断言缺陷）+ 尝试归档总数 59 | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | NOT RUN |
| 12 | Product Debt（产品债务） | decision-register 当前版本（CR-01…CR-31）+ 按运行版本封存快照（评测人执行项） | 是否按运行版本封存决策登记册快照？未决事项是否列示？ | NOT RUN |
| 13 | Risk Assessment（风险评估） | —（评测人按已知失败、缺失证据及严重度记录） | 风险与残余风险是否登记？ | NOT RUN |
| 14 | Release Recommendation（发布建议） | —（评测人基于完整证据给出） | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布） | NOT RUN |
| 15 | Evidence Index（证据索引） | EVIDENCE-MANIFEST-01 v1.6.0（MANIFEST.json + INDEX.md——13 运行登记 + 尝试归档总数 59，独立重算全部精确通过）+ `artifacts/evidence/runs/` 只追加布局 | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead / 文件级哈希、产物提交哈希是否与运行产物一致？ | NOT RUN |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期 | NOT RUN |

## 5. 明确非结论

- 本提案不预判任何评测结论；不推断任何 Gate 为 PASS；退出码 0 / 案例 PASS 只表示各运行中的断言通过（E5 §2）。
- 选项 A/B/C 的选择不改变已冻结证据；各运行产物保持 hash-bound 原样。
- S2/S3 时代 G5 评测结论（P3-S2-G5-WORKSHEET-01 v0.3.0 / P3-S3-G5-WORKSHEET-01 v0.2.0 均 PASSED 无条件）对 S2/S3 语义持续有效——本评测覆盖 S4 增量证据并核验延续性，不重开 S2/S3 时代已关闭项。
- S4 实施完成登记（CR-30 IMPLEMENTED）仅表示裁决范围内实施完成且动态证据产出——不表示 G5 独立评测通过（E5 §2）。
- 若产品负责人裁决选项 C，S4 证据维持「证据已产出、独立评测未执行」状态直至后续 Gate 统一评测——该状态的治理影响（readiness-record 状态行表述）由实现方按裁决登记。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10。
- 产品负责人裁决：**选项 A（复用 16 项框架对 S4 增量证据执行独立评测），2026-10-10**。
- 独立评测人（角色 5，用户本人，PD-15）：（待评测执行——P3-S4-G5-WORKSHEET-01 v0.1.0 staged 已建（`s4-g5-evaluation-worksheet.md`——16 项骨架，结论列全部 NOT RUN），待角色 5 逐项裁决签署）
