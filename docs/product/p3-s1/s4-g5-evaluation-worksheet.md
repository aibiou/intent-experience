# S4 时代 G5 评测工作表（P3-S4-G5-WORKSHEET-01）

**状态：** STAGED FOR EVALUATOR——16 项骨架结论列全部 NOT RUN，待角色 5 独立评测人（用户本人，PD-15）逐项裁决签署
**编号：** P3-S4-G5-WORKSHEET-01
**版本：** 0.1.0（2026-10-10：staged——按 S4-G5-EVAL-DEF-01 v1.0.0 §4 骨架新建）
**框架：** 沿用 P3-S1 / P3-S2 / P3-S3-G5-WORKSHEET 16 项结构与执行规则（结论取值 PASS / FAIL / DEFERRED / N/A，默认 NOT RUN；任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消）
**角色分离：** 本工作表由实现方（工程负责人角色代理）起草；实现作者不得兼任独立评测人——结论列全部留白 NOT RUN，由角色 5 独立评测人逐项填写并签署
**评测输入：** 3 运行 staged 审阅包 ×3（`artifacts/evidence/runs/<run>/review/README.md`——G3-GOLDEN-0001 / S2B-0001 / S4A-F1-0001）+ EVIDENCE-MANIFEST-01 v1.6.0（MANIFEST.json + INDEX.md）+ S4A-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + S4-SCOPE-PROPOSAL-01 v1.0.0 裁决文本 + decision-register 当前版本快照 + acceptance-mapping / XCC-MAP（S4 范围项）+ P3-S3-G5-WORKSHEET-01 v0.2.0（S3 时代结论——延续性核验输入）+ P3-S4-IMPL-ITER v1.0.0（S4 实施迭代记录——失败尝试登记输入）
**关联：** S4-G5-EVAL-DEF-01 v1.0.0（选项 A 裁决——复用 16 项框架）/ P3-S3-G5-WORKSHEET-01 v0.2.0（S3 时代 G5——PASSED 无条件，2026-10-10）/ P3-S2-G5-WORKSHEET-01 v0.3.0（S2 时代 G5——PASSED 无条件）/ P3-S1-G5-WORKSHEET-01 v1.8.0（P2 时代 16 项——PASSED 无条件，2026-10-09）/ OBL-02-LATENCY-METHOD-01 v1.0.0（第 9 项延迟方法）/ EVIDENCE-MANIFEST-01 v1.6.0 / P3-S4-IMPL-ITER v1.0.0
**记录日期：** 2026-10-10

## 16 项评测表（结论列——角色 5 逐项裁决）

| # | G5 必需项 | S4 证据映射（staged 输入） | 评测问题（沿用 P2 框架问句） | 结论 |
|---|----------|--------------------------|------------------------------|------|
| 1 | Version Matrix（版本矩阵） | 3 运行 `run-metadata.json`（E5 §3 矩阵；G3-GOLDEN-0001 含 git 节 commit `717fa61` + uncommittedEntries 运行时刻快照（102 项——证据执行器与治理文档运行时刻未提交，其后经证据提交入库）；S4A-F1-0001 含文件级哈希 43 项产品源文件绑定 + runtimeFiles；版本矩阵记录现行 policy_v2.3.0 / state_machine_v1.5.0——S4 为纯策略语义，状态机不变） | 版本矩阵字段是否完备（合同 / Schema / Policy / Prompt / Model / Corpus / Code / 环境版本及哈希）？产品行为 → 契约版本 → 代码修订的关联是否可追溯？ | NOT RUN |
| 2 | Test Scope（测试范围） | S4-SCOPE-PROPOSAL-01 v1.0.0（D-1…D-6 全项 A 裁决文本）+ S4A-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 + acceptance-mapping / XCC-MAP（S4 范围项——C3 G-1 空缺关闭） | 适用 / 延期 / 非适用理由是否逐案明确且与范围冻结一致？ | NOT RUN |
| 3 | Golden Case Result（黄金案例结果） | G3-GOLDEN-0001（48/48 案例、10/10 断言——policy_v2.3.0 基线既有黄金行为零回归；S4 无新增黄金案例组）+ S4A-F1-0001 六组案例面（CONTINUE-CLASSIFICATION / REPEAT-CLASSIFICATION / CONTINUE-RUNTIME / REPEAT-RUNTIME / REPEAT-NEGATIVE / ZERO-REGRESSION——Expected / Actual / Result / Evidence 关联 S4A §3 词表 / §4 不变量） | 是否创建黄金案例并执行（Expected / Actual / Result / Evidence，关联 acceptance-mapping 与 Case ID）？**S4 增量案例面（S4A-F1-0001 六组）适用性——G3-GOLDEN-0001 存在并再生至 48/48（policy_v2.3.0 基线），S1/S2/S3 时代适用性理由持续成立** | NOT RUN |
| 4 | Contract Test Result（契约测试结果） | S4A-F1-0001 CONTINUE-RUNTIME / REPEAT-RUNTIME 事件链（submission 头事件 policy_decision reason=semantic_action / done 终止事件 0 内容分片 / continue_requested / repeat_requested ×1——C6 §14 命名模式派生，不新增事件名）+ 决策追踪链（llm_used=false / user_override=true / reasonPrimary=explicit_user_direction / state_after.state_version === state_before.state_version）+ 版本链不变式（CONTINUE / REPEAT 零版本消耗——completionCommit:false 不提交） | 逐案动态记录是否支持跨契约一致性结论（事件链 / 决策追踪 / 版本链跨契约一致）？**暴露层充分性：S4 动态证据为进程内形态——HTTP 形态逐行 NDJSON 断言未在 S4 周期重跑（S3-API-0001 为 S3 时代产物），该面由评测人确认充分性或要求补测** | NOT RUN |
| 5 | Scenario Matrix Result（场景矩阵结果） | S4A-F1-0001 六场景（词表分类含碰撞核验 6 + 4 组——STOP / CORRECTION / WHY / 提问标记先判；幂等确认回合（第二次 CONTINUE 同结果）；呈现层重放（逐字节等于上一完成轮响应；CONTINUE 空轮不覆盖数据源）；负路径（无上一完成轮 INVALID_STATE_TRANSITION / 陈旧版本 STATE_VERSION_CONFLICT ×2）；零回归（41 组既有证据输入 + 优先级层插入位置静态字节序验证）） | 场景矩阵覆盖是否完备？GXC01…GXC08 逐案映射是否确认？ | NOT RUN |
| 6 | AI Evaluation Result（AI 评测结果） | 合成 fixtures（S4 未新增——REPEAT / CONTINUE 经既有 fixtures + 固定 fixtureId synthetic/continue/v1——CONTINUE 幂等确认回合 0 内容分片；REPEAT 重放上一完成轮语料 fixtureId）；rubric 定义已经产品负责人批准（2026-10-09：合成 fixtures 上的契约一致性评测） | rubric 与责任人是否已于 G5 前批准？批准后逐项输出与评测者理由是否记录？**rubric 对 S4 新增请求类别（CONTINUE 确认 / REPEAT 重放）的适用性由评测人确认** | NOT RUN |
| 7 | Regression Result（回归结果） | G3-GOLDEN-0001 再生产物（policy_v2.3.0 基线 48/48——S4 纯增量零回归；首次 policy_v2.3.0 运行 8 案例版本字符串期望未迁移——行为断言全通过，缺陷为执行器侧）/ S2B-0001 重跑（黄金回归绑定新基线 policy_v2.3.0 / 48 案例——S2b 行为面零回归）/ S4A-F1-0001 ZERO-REGRESSION（41 组既有证据输入分类零变化 + 优先级层插入位置静态字节序验证（QUESTION_MARKERS < CONTINUE < REPEAT < 记忆操作识别 < 长期记忆识别）） | 正式回归基线重跑是否完成？Change ID / 前后版本 / 受影响案例 / 基线 Run ID 关联是否齐备？**S2/S3 语义零回归（policy_v2.3.0 恒等映射）核验** | NOT RUN |
| 8 | Fault Injection Result（故障注入结果） | S2A-OBL-01-0001（HTTP 形态 LLM 故障 503 补测——S1/S2 时代已关闭）；S4 时代无新增故障注入面——负路径错误语义（INVALID_STATE_TRANSITION——无上一完成轮 REPEAT 拒绝 / STATE_VERSION_CONFLICT——陈旧版本拒绝 ×2，均 retryable=false）经 S4A-F1-0001 REPEAT-NEGATIVE 案例覆盖 | 故障注入逐案评测结论？**S4 负路径错误语义覆盖是否充分（或登记 N/A 附理由——无新增故障注入面）** | NOT RUN |
| 9 | Latency Result（延迟结果） | S4 时代 3 运行耗时参考值（约 33s / 12s / 5s——含 typecheck + next build 预检，非纯运行耗时）；OBL-02-LATENCY-METHOD-01 v1.0.0（方法已经产品负责人按 E3 批准） | 统计阈值是否已经产品负责人按 E3 批准？测量方法是否定义？**S4 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由——类比 S2/S3 时代裁决）；任何指标宣称前须满足方法 §5 样本纪律，方法分层如需覆盖 S4 新增请求类别（CONTINUE 确认 / REPEAT 重放）须先升版批准** | NOT RUN |
| 10 | Agency Result（用户自主权结果） | S4A-F1-0001 CONTINUE / REPEAT 用户主权（显式用户方向——user_override=true；CONTINUE 幂等确认不改变状态——用户确认语义，非系统代行；REPEAT 呈现层重放不改变状态——重放非再生成，llm_used=false；REPEAT 前置条件——无上一完成轮拒绝（不虚构响应）；未知输入升级纪律不变——未命中词表输入仍经 UNKNOWN 升级，授权 §5.7）/ 停止路径与完成边界案例 | 逐案评测——用户主权是否零违规（P0 零容忍）？ | NOT RUN |
| 11 | Known Failures（已知失败） | S4 周期失败尝试 2 次 + 先前通过运行前置归档 3 个（ADR-0002 §5 只追加留存——均为执行器侧断言 / 变量传递缺陷，产品运行时零缺陷：G3 首跑 8 案例（G04-N / G07-N / G09-N / G10-N / G10-B / G10-FR / G12-N / G12-FR）版本字符串期望未迁移——行为断言全通过；S4A-F1 首跑执行器双重缺陷——c4Entry 变量传递 FATAL（崩溃于汇总写入前）+ CONTINUE-RUNTIME 流事件序列断言缺陷）+ 尝试归档总数 59 | G5 汇总是否完整？残余风险关联是否记录？有无隐藏或覆盖失败？ | NOT RUN |
| 12 | Product Debt（产品债务） | decision-register 当前版本（CR-01…CR-31）+ 按运行版本封存快照（评测人执行项） | 是否按运行版本封存决策登记册快照？未决事项是否列示？ | NOT RUN |
| 13 | Risk Assessment（风险评估） | —（评测人按已知失败、缺失证据及严重度记录） | 风险与残余风险是否登记？ | NOT RUN |
| 14 | Release Recommendation（发布建议） | —（评测人基于完整证据给出） | 评测人基于完整证据给出发布建议（产品负责人另行决定；不得由 AI 或实现团队自动发布） | NOT RUN |
| 15 | Evidence Index（证据索引） | EVIDENCE-MANIFEST-01 v1.6.0（MANIFEST.json + INDEX.md——13 运行登记 + 尝试归档总数 59（v1.5.0 实际 54 + 本版新增 5——前版注记计数偏差 53 经 v1.6.0 按实际数更正），独立重算全部精确通过——G3 98 项 / S2B 16 项 / S4A-F1 14 项）+ `artifacts/evidence/runs/` 只追加布局 | 索引内容评测——案例 / 断言计数、SHA256SUMS 独立重算状态、代码绑定 gitHead / 文件级哈希、产物提交哈希是否与运行产物一致？ | NOT RUN |
| 16 | Evaluator Sign-off（评测负责人签署） | G5 隔离声明（2026-10-08 签署生效，独立评测人任命） | 1–15 项完成后填写：独立性声明、版本、结论、遗留问题及签署日期 | NOT RUN |

## 执行规则（沿用 P2 框架）

- 结论取值：PASS / FAIL / DEFERRED / N/A；默认 NOT RUN。
- 任何 P0 失败、缺项或 NOT RUN 均不得被平均分或建议性报告抵消。
- 退出码 0 与案例 PASS 只表示各运行中的断言通过；不设置任何 Gate 为 PASS（E5 §2）。
- 第 13 项风险：评测人按已知失败、缺失证据及严重度记录；第 14 项发布建议：评测人基于完整证据给出（产品负责人另行决定；不得由 AI 或实现团队自动发布）。
- 第 9 项延迟：任何延迟指标宣称前须满足 OBL-02-LATENCY-METHOD-01 v1.0.0 §5 样本纪律并注明分层（方法 §6 披露声明）；S4 时代是否另行执行延迟测量属产品负责人裁决事项（或登记 N/A 附理由）；方法分层如需覆盖 S4 新增请求类别（CONTINUE 确认 / REPEAT 重放）须先升版批准。
- 第 3 项黄金案例：S4 无新增黄金案例组——G3-GOLDEN-0001 存在并再生至 48/48（policy_v2.3.0 基线）——适用性由评测人裁决（执行或登记 N/A 附理由）；S4 增量案例面（S4A-F1-0001 六组）评测。
- 延续性核验：S2/S3 时代 G5 评测结论（P3-S2-G5-WORKSHEET-01 v0.3.0 / P3-S3-G5-WORKSHEET-01 v0.2.0 均 PASSED 无条件）对 S2/S3 语义持续有效（policy_v2.3.0 延续——S4 为纯增量，优先级层插入全部既有层之后）——本工作表覆盖 S4 增量证据并核验延续性，不重开 S2/S3 时代已关闭项。
- 暴露层充分性（第 4/8/15 项相关）：S4 动态证据为进程内形态——HTTP 形态逐行 NDJSON 断言未在 S4 周期重跑（S3-API-0001 为 S3 时代产物，S4 未新增 HTTP 面）；该面充分性由评测人确认或要求补测。

## 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10（按 S4-G5-EVAL-DEF-01 v1.0.0 §4 骨架）。
- 独立评测人（角色 5，用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效）：（待评测执行——结论列全部 NOT RUN，待角色 5 逐项裁决签署第 16 项）
