# P3-S1 独立复核记录：R5（E5 证据可复现性与独立性）

**记录编号：** P3-S1-REVIEW-008
**版本：** 1.0.0（2026-10-08：复核者签署——对 E5 计划本身 ACCEPT WITH FINDINGS；A5 / E5 就绪状态维持 NOT PASSED；F-2 独立评测人任命经 G5 隔离声明签署完成）
**状态：** SIGNED——复核者已签署（2026-10-08，用户本人，非起草方）；本记录是 A5 复核证据；E5 仍 NOT PASSED
**适用门禁：** P2-EVIDENCE-8.1 A5 / E5

## 1. 复核记录（按 independent-review-package.md §4 模板）

| 字段 | 记录 |
|---|---|
| Review ID | P3-S1-REVIEW-008 |
| 复核区块 | R5（E5 证据可复现性与独立性，对应 A5） |
| 复核者及角色 | 用户本人（角色 5 独立评测负责人职责相关，OWNER-ROSTER-01 v0.2.4，PD-15）；2026-10-08 签署 |
| 复核者与作者关系 | 非起草方：evidence-execution-plan 由代理会话起草；复核者未参与内容起草 |
| 基线版本与 Git revision | evidence-execution-plan v1.1.0；contract-authority-baseline v1.2.0；cross-contract-static-mapping v1.4.0；acceptance-mapping v0.3.1；Git 65179fd（origin/main） |
| 结论 | 对 E5 证据操作计划本身 ACCEPT WITH FINDINGS；A5 / E5 就绪状态维持 NOT PASSED（F-1 环境未搭建） |
| Findings（含严重度 / 条款 / Gate） | F-1…F-4（见 §4）；无 Critical |
| 遗留问题 / 责任人 / 到期阶段 | E5 执行环境搭建（授权方式属产品负责人决定）；独立评测人正式任命；首次端到端试运行；到期阶段：实施授权前后（按产品负责人决定） |
| 证据位置与哈希 | `docs/product/baseline/evidence-execution-plan.md` v1.1.0；`docs/product/baseline/signing/`（G5 隔离声明、隐私六要素模板） |
| 日期与签署 | PENDING（2026-10-08 草案） |

## 2. 机械核对项（起草代理已逐项执行，复核者可独立重跑）

- [x] E8 G5 Evaluation Package 16 项与 evidence-execution-plan §6.1 逐项交叉对应；未产出材料的字段均保持 NOT RUN / PENDING（第 16 项 Evaluator Sign-off：独立评测负责人尚未指定）。
- [x] 版本矩阵字段（§3）能绑定 Contract、Code、Prompt、Model、Policy、Schema、Corpus、运行环境及回归基线；无适用历史运行时标记 `BASELINE_NOT_AVAILABLE` 的规则在位，"不得伪造比较结果"条文化。
- [x] 单案例证据结构（§4，11 字段）足以还原输入、预期、实际、状态前后、轨迹、事件及故障时序；Case ID 命名空间规则在位（禁止有歧义的裸 CC 编号）；Evaluator 字段要求"同一人不可兼任同一案例的实现作者与独立评测者"。
- [x] 状态词汇表（§2：NOT RUN / RUNNING / PASS / FAIL / BLOCKED / DEFERRED）在位；"测试框架退出码 0 只表示该命令中的断言通过；它不会自动设置 Golden Case、Gate 或产品状态为 PASS"显式化——FAIL / BLOCKED / NOT RUN / DEFERRED 不会因退出码或汇总分被改成 PASS。
- [x] 独立评测与实现分离规则在位（§6）：实现作者不得自行批准其实现的产品 Gate；评测人须在 G5 执行前由产品负责人指定并声明职责独立性；评测人须审阅预先冻结的期望、完整轨迹、负向案例和失败记录，不能只看测试汇总或演示；产品负责人不得改变已执行案例的预期以追认 PASS。
- [x] 敏感数据护栏在位：§3"密钥、访问令牌、原始个人隐私数据不得进入证据文件"；真实用户数据禁收直至隐私六要素（保留期限、存储位置、访问控制、加密、删除机制、批准责任）全部批准——当前六要素 PENDING（模板 `signing/privacy-six-elements-approval.md` 已建），护栏生效中；本阶段仅允许合成数据或经明确批准的脱敏夹具。
- [x] 必测维度（§5）覆盖正常 / 边界 / 负向 / 故障条件，含 STOP / CHANGE 在生成前中后到达、迟到响应、重试、Fallback、并发写、stale state_version、非法转换、伪造 state_update、轨迹缺失 / 重复 / 乱序等；"必须验证不应该发生的事情没有发生"条文化。

## 3. R5 必须确认事项逐条分析

1. **E8 G5 16 项与计划逐项交叉对应；未产出材料保持 NOT RUN**：已确认（§2）。
2. **版本矩阵绑定能力**：已确认（§2）。
3. **每案证据结构充分性**：已确认（§2）。
4. **FAIL / BLOCKED / NOT RUN / DEFERRED 不被改写为 PASS**：已确认（§2，规则显式化）。
5. **独立评测角色与实现者分离，评测者可审阅原始证据并提出否决**：规则已确认在位；**独立评测人尚未正式任命**——见 F-2。
6. **敏感数据与隐私治理；未确定项是否阻止真实数据收集**：已确认——六要素未确定前真实用户数据禁收的护栏生效（§2）；六要素决定 PENDING。

## 4. Findings

| ID | 严重度 | 条款 / Gate | 发现 | 处置 |
|---|---|---|---|---|
| F-1 | **Important** | R5 / A5 / E5 | 可复现执行环境未搭建（§8：Node / Web / DB 环境与锁文件、自动化执行器、trace 与证据哈希产出均"尚未搭建"）；首次端到端试运行 NOT RUN | A5 / E5 保持 NOT PASSED。环境搭建的授权方式（实施授权前的 scoped 许可，或作为实施阶段首个迭代任务）属产品负责人决定，本复核不作默认；ADR-0002 §3 的沙箱许可仅限 Spike 三项验证，不覆盖 E5 环境搭建 |
| F-2 | **Important** | R5 / A5 / E5 | 独立评测人未正式任命（G5 隔离声明模板已建，决定与签署 PENDING） | G5 前由产品负责人正式任命；任命与隔离声明签署完成前，G5 不可通过 |
| F-3 | Minor | R5 / E5 | G5 16 项评测包材料全部待运行生成；AI 评测 rubric 与责任人待 G5 前批准 | 实施授权后按 E5 计划逐项生成；rubric 与责任人于 G5 前批准 |
| F-4 | Minor | R5 / E5 | 延迟统计阈值待产品负责人按 E3 批准 | 公开发布前批准；未批准前不得宣告指标达标 |

无 Critical finding。F-1 / F-2 是 A5 的就绪条件未满足（非材料缺陷），在就绪条件完成前 A5 / E5 保持 NOT PASSED。

## 5. 复核结论（复核者已确认）

**复核者确认（2026-10-08，用户本人，非起草方）：** 接受草案建议——**对 E5 证据操作计划本身 ACCEPT WITH FINDINGS；A5 / E5 就绪状态维持 NOT PASSED**。F-1（环境搭建）的授权方式保留为产品负责人待决项（实施授权前的 scoped 许可，或作为实施阶段首个迭代任务）；F-2 独立评测人任命已于 2026-10-08 经 G5 隔离声明签署完成；F-3 / F-4 登记在案。备选（E5 环境必须在实施授权前建成，F-1 升 BLOCK 级）未采纳——产品负责人须另行签发 scoped 许可方可启动环境搭建。

**建议：对 E5 证据操作计划本身 ACCEPT WITH FINDINGS；A5 / E5 就绪状态维持 NOT PASSED。** 理由：证据规范完整（版本矩阵、案例结构、状态词汇、独立性规则、隐私护栏齐备且与 E8 G5 16 项交叉对应）；未满足项（F-1 环境、F-2 评测人、F-3 试运行）是就绪条件的执行缺口，计划已为其定义了明确的完成标准与责任。复核者不把"计划完备"当作"E5 通过"。

**备选：** 若复核者认为 E5 环境必须在实施授权前建成（即 A5 是 A6 / 实施授权的硬前置且不允许实施阶段并行），则 F-1 升为 BLOCK 级，产品负责人须先行签发 E5 环境搭建的 scoped 许可。该判定属产品负责人权限。

## 6. 签署区

| 签署 | 记录 |
|---|---|
| 复核者 | 用户本人（PD-15），非起草方（evidence-execution-plan 由代理会话起草，复核者未参与内容起草） |
| 结论（ACCEPT WITH FINDINGS on plan / BLOCK） | ACCEPT WITH FINDINGS on plan；A5 / E5 维持 NOT PASSED |
| 日期 | 2026-10-08 |

**注意：** 本记录签署 ≠ A5 / E5 签署；E5 保持 NOT PASSED 直至环境、评测人、试运行三项就绪条件完成。
