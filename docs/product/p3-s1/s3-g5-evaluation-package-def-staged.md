# S3 时代 G5 评测包范围定义提案（S3-G5-EVAL-DEF-01 v0.1.0）

**状态：** RULED——产品负责人（用户本人，PD-15）2026-10-10 裁决选项 A（复用 16 项框架对 S3 增量证据执行独立评测）
**编号：** S3-G5-EVAL-DEF-01
**版本：** 1.0.0（2026-10-10：产品负责人裁决"选项 A"升版 RULED）
**起草：** 工程负责人角色（代理，Codex 履行，PD-15 委托）
**关联：** P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代 G5 独立评测——PASSED 无条件，2026-10-10：16 项 = 12 PASS + 1 N/A（第 9 项））/ P3-S1-G5-WORKSHEET-01 v1.8.0（P2 时代 G5 16 项评测包——PASSED 无条件，2026-10-09）/ S2-G5-EVAL-DEF-01 v1.0.0（S2 时代评测包范围定义——选项 A 裁决先例）/ EVIDENCE-MANIFEST-01 v1.5.0（S3 实施证据登记）/ P3-S3-IMPL-ITER v1.0.0（S3 实施迭代记录）/ readiness-record v1.39.0 / decision-register v0.29.0（CR-28 IMPLEMENTED）/ S3-SCOPE-PROPOSAL-01 v1.0.0（D-1…D-5 全项 A 裁决）/ S3A / S3B-SEMANTIC-FREEZE-01 v1.0.0（语义冻结文本）

## 1. 事实取证

- **S2 时代 G5 独立评测已完成**（2026-10-10）：P3-S2-G5-WORKSHEET-01 v0.3.0——S2 时代 G5 评测判定 PASSED（无条件）——16 项 = 12 PASS（第 1/2/3/4/5/6/7/8/10/11/12/15 项）+ 1 N/A（第 9 项——签署定稿理由：S2 时代不作任何延迟指标宣称）；第 13 项风险评估与第 14 项发布建议已登记；无 DEFERRED、无 P0 失败、无 NOT RUN 残余。评测对象为 S2 时代证据 7 运行（当时形态：S2A-F5-0001 9/9 案例、G3-GOLDEN-0001 40/40 案例等）。
- **S3 实施完成**（CR-28 RULED→IMPLEMENTED，2026-10-10）：D-1…D-5 全项 A——产品提交 `f8b374f`（9 文件 +802/−64——src/experience/{classifier,http,memory,policy,runtime,simulation}.ts 修改 + app/api/memory/route.ts 与 app/api/experience/[experienceId]/simulation/route.ts 两只只读观测路由新增 + .gitignore）；policy_v2.2.0 变更 1–4（S3A-SEMANTIC-FREEZE-01：长期记忆启用）/ 变更 3–4（S3B-SEMANTIC-FREEZE-01：跨会话分支持久化）生效；state_machine_v1.5.0 不变（S3B §4 变更 1–2 为暴露层纪律，无状态机迁移）。
- **S3 动态证据五运行全绿**（2026-10-10，合计 87 案例 / 73 断言，均退出码 0——退出码 0 只表示各运行断言通过，不设置任何 Gate 为 PASS，E5 §2）：
  - G3-GOLDEN-0001：48/48 案例、10/10 断言（黄金套件扩展 G11 长期记忆案例组 + G12 跨会话分支持久化案例组（N/NEG/B/FR）——SHA256SUMS 98 项独立重算全部精确通过）；
  - S2A-F5-0001：14/14 案例、19/19 断言（S2 时代负向不变式 SESSION-SCOPED-NEG / LONGTERM-DISABLED 经 CR-28 D-1/D-2 选项 A 裁决取代，案例 9→14、断言 12→19——新增 LT-EXPLICIT-A / LT-REMEMBER-B / LT-BARE-NEG / LT-CANDIDATE-C / LT-GATE-NEG 长期记忆案例组——SHA256SUMS 30 项）；
  - S2A-F4-0001：10/10 案例、17/17 断言（INPROC-REGRESSION 跨会话持久化验证——S2 时代 D-04 失效不变式经 CR-28 D-2 选项 A 取代——SHA256SUMS 22 项）；
  - S2B-0001：7/7 案例、14/14 断言（黄金回归绑定新基线 G3-GOLDEN-0001 48/48 @ policy_v2.2.0 / state_machine_v1.5.0——SHA256SUMS 16 项）；
  - S3-API-0001：8/8 案例、13/13 断言（首次执行——HTTP 执行形态（三要素请求经真实运行路径，同一 getServerRuntime 单例）+ 只读观测路由 GET /api/memory / GET /api/experience/{id}/simulation——SHA256SUMS 18 项）。
- **每运行 staged 审阅包齐备**：`artifacts/evidence/runs/<run>/review/README.md` ×5（G3-GOLDEN-0001 / S2A-F5-0001 / S2A-F4-0001 / S2B-0001 / S3-API-0001——S2B-0001 审阅包已经角色 5 审阅 PASS（2026-10-09，S2b 独立评测关闭）；其余 4 份待角色 5 审阅）。
- **证据索引已覆盖 S3 运行**：EVIDENCE-MANIFEST-01 v1.5.0（MANIFEST.json + INDEX.md——五运行登记；尝试归档总数 53——S3 周期新增 12 个：失败尝试 5 个 + FATAL 部分产物 1 个 + 先前通过运行前置归档 6 个；新增 11 个含 SHA256SUMS 归档独立重算全部精确通过）。
- **S3 周期失败登记**：失败尝试 7 次 + FATAL 1 次按 ADR-0002 §5 如实归档留存——均为执行器侧案例断言 / 基线 / 元数据缺陷，产品运行时零缺陷（缺陷分类与根因分析：P3-S3-IMPL-ITER v1.0.0 §3 逐条登记）；S2B-0001 另有 FATAL 1 次（黄金回归绑定基线陈旧——先于运行目录创建，无运行产物，经迭代记录 §3 登记）。
- **现行 16 项框架为 S1/S2 证据设计**：P3-S2-G5-WORKSHEET-01 的 staged 输入映射不覆盖 S3 增量证据（S3-API-0001 HTTP 执行形态、G11/G12 案例组、长期记忆案例组、跨会话持久化回归、暴露层静态边界发现）。

## 2. 语义空缺分析

S3 时代证据与 G5 评测之间的空缺（约束自有 frozen 源派生：E5 计划 §6.1 判定规则、S3-SCOPE-PROPOSAL-01 v1.0.0 裁决文本、S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本、PD-15 角色分离）：

- **空缺 1（评测覆盖）**：S3 实施完成登记（CR-28 IMPLEMENTED）以「运行退出码 0 + 断言全通过 + 迭代记录」为据，**未经角色 5 独立评测**——S3 增量证据处于「证据已产出、独立评测未执行」状态。角色分离纪律（实现作者不得兼任独立评测人）使该评测必须由用户本人（角色 5）执行或在其书面隔离措施下执行。
- **空缺 2（框架映射）**：16 项框架的评测对象需重定向到 S3 增量证据（第 1/2/3/4/5/7/10/11/15/16 项等），S2 时代语义结论经 policy_v2.2.0 延续性确认（S2 语义经 policy_v2.0.0 / policy_v2.1.0 / policy_v2.2.0 延续不变——S2 时代 G5 结论对 S2 语义持续有效，不重复评测；延续性本身须核验）。
- **空缺 3（黄金案例增量）**：G3-GOLDEN-0001 再生至 48/48——G11 长期记忆案例组 + G12 跨会话分支持久化案例组为 S3 增量黄金案例（第 3 项 S2 时代已判 PASS（适用）——S3 时代为增量案例组评测：Expected / Actual / Result / Evidence 关联 acceptance-mapping 与 Case ID）。
- **空缺 4（rubric 适用性）**：S3 未新增合成 fixtures（长期记忆 / 跨会话分支语义经既有合成 fixtures + 新案例组覆盖）——rubric 对 S3 增量语义（记忆操作 / 跨会话分支操作请求类别）的适用性由评测人确认（批准范围仅测量方法与 rubric 定义本身，不含对 S3 增量语义的预先判定）。
- **空缺 5（负向不变式取代）**：S2 时代负向不变式（SESSION-SCOPED-NEG / LONGTERM-DISABLED / D-04 INPROC-REGRESSION 失效不变式）经 CR-28 D-1/D-2 选项 A 裁决取代——S2 时代 G5 评测（第 4/5/10 项）所据证据形态已事实变更（S2A-F5-0001 9/9 → 14/14 案例等）。S3 评测须确认：①取代后语义逐案覆盖；②S2 语义零回归（policy_v2.2.0 恒等映射）。
- **空缺 6（暴露层）**：S3b 暴露层为纯暴露层（同一 getServerRuntime 单例——API 面扩展不改变任何运行时语义、决策追踪、事件契约）。第 4/7/15 项须覆盖暴露层不变式；静态边界发现（executionFormDetection / runtimeInjection / s1FormPreserved / serverRuntimeSingleton 四项成立——静态边界断言读取已提交产品源码字节，不做代码推断）与 S1 fixture 形态向后兼容（semanticAction 直送——行为不变）为评测输入。
- **空缺 7（延迟）**：第 9 项 S2 时代已裁决 N/A（不作任何延迟指标宣称）。S3 时代同纪律——S3 新增请求类别（记忆操作 / 跨会话分支操作）如未来宣称指标，须按 OBL-02-LATENCY-METHOD-01 v1.0.0 §5 样本纪律另行测量并注明分层，方法分层如需覆盖 S3 新增请求类别须先升版批准。S3 时代是否另行执行延迟测量，属产品负责人裁决事项（或在工作表中登记 N/A 附理由）。

## 3. 选项

### 选项 A（实现方建议）：复用 16 项框架对 S3 增量证据执行独立评测

新建 **P3-S3-G5-WORKSHEET-01**（工作表骨架见 §4），沿用 P3-S1 / P3-S2-G5-WORKSHEET 的 16 项结构与执行规则（结论取值 PASS / FAIL / DEFERRED / N/A，默认 NOT RUN；任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消），逐项映射 S3 增量证据并核验 S2 时代结论延续性，结论由角色 5 独立评测人逐项裁决签署。**（2026-10-10 经产品负责人裁决采纳——见 §6）** 优点：与 P2/S2 时代评测框架一致、可比、可复用既有执行规则与隔离声明；缺点：工作量与 S2 时代相当（16 项）。

### 选项 B：S3 专属精简框架

仅执行 S3 增量直接相关项（建议子集：第 1/2/3/4/5/7/10/11/15/16 项），其余项登记 N/A 附理由（如第 6 项 rubric 经 S2 时代批准无维度扩展、第 8 项故障注入无新增面、第 9 项延迟同 S2 裁决 N/A、第 12/13/14 项经 S2 时代框架覆盖仅需增量更新）。优点：聚焦 S3 增量证据；缺点：N/A 理由链须逐项论证，评测可比性弱于选项 A。

### 选项 C：并入后续阶段统一评测

S3 证据暂不单独评测，待 P3 退出 Gate（或产品负责人指定的后续 Gate）统一执行。优点：减少评测轮次；缺点：S3 完成状态（readiness-record「CR-28 IMPLEMENTED」）在 P3 退出前持续处于「独立评测未执行」状态，与 S2「先关再建」（PD-20）纪律的严格程度不一致——S2 关闭前完成了 G5 独立评测（P3-S2-G5-WORKSHEET-01 v0.3.0 PASSED 无条件）。

## 4. 选项 A 实施影响

- 新建 `docs/product/p3-s1/s3-g5-evaluation-worksheet.md`（P3-S3-G5-WORKSHEET-01 v0.1.0，STAGED FOR EVALUATOR——骨架见下表；结论列全部 NOT RUN，由角色 5 逐项填写）。**（2026-10-10 已按本骨架新建 staged——`s3-g5-evaluation-worksheet.md`）**
- 评测输入：5 运行 staged 审阅包 ×5 + EVIDENCE-MANIFEST-01 v1.5.0 + S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + S3-SCOPE-PROPOSAL-01 v1.0.0 裁决文本 + decision-register 当前版本快照 + acceptance-mapping / XCC-MAP（S3 范围项）+ P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代结论——延续性核验输入）。
- 角色分离不变：实现作者（工程负责人角色代理）不得兼任独立评测人；本提案由实现方起草，裁决权归产品负责人，评测执行权归角色 5（用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效）。
- 不改变任何已冻结证据：各运行产物（summary.json / cases / traces / SHA256SUMS）为 hash-bound 冻结证据；工作表为评测工具，不是 Gate 证据。
- 裁决后登记：CR-29 状态 STAGED→RULED（S3 时代 G5 评测包范围定义裁决）+ 新建 P3-S3-G5-WORKSHEET-01 v0.1.0 staged + readiness-record 升版 + 本提案 §6 签署区填写。**（均已执行，2026-10-10）**

### 16 项工作表骨架（选项 A；结论列待角色 5 逐项裁决）

| # | G5 必需项 | S3 证据映射（staged 输入） | 评测问题（沿用 P2 框架问句） | 结论 |
|---|----------|--------------------------|------------------------------|------|
| 1 | Version Matrix（版本矩阵） | 5 运行 `run-metadata.json`（E5 §3 矩阵；G3-GOLDEN-0001 / S2A-F4-0001 / S3-API-0001 含 git 节 commit `5af5592` / `e6780c8`；S2A-F5-0001 含 runtimeFiles + git 节；S2B-0001 含文件级哈希；G3 含 policyVersions 链 policy_v1.0.0→v2.2.0；版本矩阵记录现行 state_machine_v1.5.0——轴外记忆子状态机契约化冻结于 state_machine_v1.4.0 §4 变更 1，provenance 注记承载） | 版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | NOT RUN |
| 2 | Test Scope（测试范围） | S3-SCOPE-PROPOSAL-01 v1.0.0（D-1…D-5 全项 A 裁决文本）+ S3A / S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + acceptance-mapping / XCC-MAP（S3 范围项） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | NOT RUN |
| 3 | Golden Case Result（黄金案例结果） | G3-GOLDEN-0001（48/48 案例、10/10 断言——G11 长期记忆案例组 + G12 跨会话分支持久化案例组 N/NEG/B/FR；语料 fixtureId synthetic/simulate/v2） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID）？**S3 增量案例组（G11/G12）适用性——S1/S2 时代 N/A 理由均已不成立（G3-GOLDEN-0001 存在并再生至 48/48）** | NOT RUN |
| 4 | Contract Test Result（契约测试结果） | S2A-F5-0001 记忆域事件链（memory_recorded properties 扩展 memory_class / source / confidence——C6 §14 属性扩展不新增事件名）/ S2A-F4-0001 simulation_adopted 事件链 + 跨会话持久化回归（INPROC-REGRESSION）/ S3-API-0001 HTTP 执行形态事件链（NDJSON 流：submission / chunk / done / state_updated + 错误语义 400 INVALID_ACTION / 400 INVALID_REQUEST / STATE_VERSION_CONFLICT） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？ | NOT RUN |
| 5 | Scenario Matrix Result（场景矩阵结果） | S2A-F5-0001 长期记忆场景 14 案例（含 LT-BARE-NEG / LT-GATE-NEG 等登记负向）/ G3-GOLDEN-0001 G11/G12 案例组 / S3-API-0001 8 场景（执行形态路由 / fixture 形态兼容 / 错误语义 / 只读观测） | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | NOT RUN |
| 6 | AI Evaluation Result（AI 评测结果） | 合成 fixtures（S3 未新增——长期记忆 / 跨会话分支语义经既有 fixtures + 新案例组覆盖）；rubric 定义已经产品负责人批准（2026-10-09：合成 fixtures 上的契约一致性评测） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？**rubric 对 S3 增量语义（记忆操作 / 跨会话分支操作请求类别）的适用性由评测人确认** | NOT RUN |
| 7 | Regression Result（回归结果） | S2A-F5-0001 / S2A-F4-0001 再生产物（S3 回归扩展 + 执行器元数据校正后再生成）/ S2B-0001 重跑（黄金回归绑定新基线 policy_v2.2.0 / 48 案例）/ G3-GOLDEN-0001 黄金套件回归基线（48/48）/ S3-API-0001 首次执行 | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？**S2 语义零回归（policy_v2.2.0 恒等映射）核验** | NOT RUN |
| 8 | Fault Injection Result（故障注入结果） | S2A-OBL-01-0001（HTTP 形态 LLM 故障 503 补测——S1/S2 时代已关闭）；S3 时代无新增故障注入面——暴露层错误语义（400 INVALID_ACTION / 400 INVALID_REQUEST / STATE_VERSION_CONFLICT）经 S3-API-0001 案例覆盖 | 故障注入逐案评测结论？**S3 暴露层错误语义覆盖是否充分（或登记 N/A 附理由——无新增故障注入面）** | NOT RUN |
| 9 | Latency Result（延迟结果） | S3 时代 5 运行耗时参考值（7923ms–29295ms）；OBL-02-LATENCY-METHOD-01 v1.0.0（方法已经产品负责人按 E3 批准） | 统计阈值是否已经产品负责人按 E3 批准？测量方法是否定义？**S3 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由——类比 S2 时代裁决）；任何指标宣称前须满足方法 §5 样本纪律，方法分层如需覆盖 S3 新增请求类别（记忆操作 / 跨会话分支操作）须先升版批准** | NOT RUN |
| 10 | Agency Result（用户自主权结果） | S2A-F5-0001 长期记忆用户主权（WITHDRAW / CORRECT 主权复用既有生命周期与事件；C 类候选 ≠ 已保存——V1 不允许仅凭行为自动升级为永久用户画像；裸记住请求不识别为记忆写入）/ 跨会话分支主权（新会话显式五操作——前置条件运行时内校验：输入会话 ACTIVE + 宿主会话已结束 + 分支记录存在；内容轮保持严格会话绑定）/ 停止路径与完成边界案例 | 逐案评测——用户主权是否零违规（P0 零容忍）？ | NOT RUN |
| 11 | Known Failures（已知失败） | S3 周期失败尝试 7 次 + FATAL 1 次（ADR-0002 §5 只追加留存——含 FATAL 部分产物归档 1 个（S2A-F5-0001-attempt-2026-10-10T04-41-45-293Z——仅含 cases/ ×14 / logs/ / traces/）与 S2B-0001 FATAL 1 次（无产物——先于运行目录创建）；均为执行器侧案例断言 / 基线 / 元数据缺陷，产品运行时零缺陷）+ 尝试归档总数 53 | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | NOT RUN |
| 12 | Product Debt（产品债务） | decision-register 当前版本（CR-01…CR-29）+ 按运行版本封存快照（评测人执行项） | 是否按运行版本封存决策登记册快照？未决事项是否列示？ | NOT RUN |
| 13 | Risk Assessment（风险评估） | —（评测人按已知失败、缺失证据及严重度记录） | 风险与残余风险是否登记？ | NOT RUN |
| 14 | Release Recommendation（发布建议） | —（评测人基于完整证据给出） | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布） | NOT RUN |
| 15 | Evidence Index（证据索引） | EVIDENCE-MANIFEST-01 v1.5.0（MANIFEST.json + INDEX.md——五运行登记 + 尝试归档总数 53，独立重算全部精确通过）+ `artifacts/evidence/runs/` 只追加布局 | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead、产物提交哈希是否与运行产物一致？ | NOT RUN |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期 | NOT RUN |

## 5. 明确非结论

- 本提案不预判任何评测结论；不推断任何 Gate 为 PASS；退出码 0 / 案例 PASS 只表示各运行中的断言通过（E5 §2）。
- 选项 A/B/C 的选择不改变已冻结证据；各运行产物保持 hash-bound 原样。
- S2 时代 G5 评测结论（P3-S2-G5-WORKSHEET-01 v0.3.0 PASSED 无条件）对 S2 语义持续有效——本评测覆盖 S3 增量证据并核验延续性，不重开 S2 时代已关闭项。
- 若产品负责人裁决选项 C，S3 证据维持「证据已产出、独立评测未执行」状态直至后续 Gate 统一评测——该状态的治理影响（readiness-record 状态行表述）由实现方按裁决登记。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10。
- 产品负责人裁决：**选项 A（复用 16 项框架对 S3 增量证据执行独立评测），2026-10-10**。
- 独立评测人（角色 5，用户本人，PD-15）：（待评测执行——P3-S3-G5-WORKSHEET-01 v0.1.0 staged 已建（`s3-g5-evaluation-worksheet.md`——16 项骨架，结论列全部 NOT RUN），待角色 5 逐项裁决签署）
