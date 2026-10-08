# P2-EVIDENCE-8.1｜P2 至 P3 门禁衔接修订

**版本：** 1.0.1
**日期：** 2026-10-08
**状态：** 已采纳的产品治理修订
**依据：** PODR-001 / PD-02
**替代范围：** 仅调整 P3-S1 实施准入与 P2 动态证据的先后顺序；不替代 E8 的 Gate 义务、严重度、PASS 条件或最终关闭公式。
**决策人：** 代理产品负责人（用户本会话明确委托）。

## 1. 继续有效的原则

1. P2 CLOSED 仍须满足 E8 G1–G8 全部 PASS、P0 / Agency / State Integrity / Policy Blocker 为零，并完成 G8 正式签署。
2. 代码存在、Demo 可用、单元测试跑绿或模型表现良好，都不能单独证明 Gate PASS。
3. P0 用户主导权、状态完整性、策略边界任一失败不可被均值或其他案例通过抵消。
4. P2 G01–G08 全部保留为 P2 关闭义务；S1 未覆盖项不得伪报 PASS。

## 2. 新的两段式门禁

### A. 编码前准入 Gate（Pre-Implementation Entry Gate）

须全部满足并在仓库留下证据，才可签发受限 P3-S1 实施授权：

| 条件 | 通过要求 | 证据记录 |
|---|---|---|
| A1｜G1 静态权威基线 | C1–C7 唯一来源、版本、SHA-256、职责角色和本次产品批准均登记；任何缺失契约已明确从候选来源形成版本化契约，不可悬空。 | baseline source-of-truth + contract manifest |
| A2｜G2 静态一致性 | E8 12 项、CC02 矩阵 40 项、CC01 规范 20 项、CC02 硬检查 12 项、GXC 8 项、负向案例 18 项逐项映射并说明纳入 / 边界 / 延期；统一使用来源命名空间；C01–C09 权威条款、读写权、状态、动作、Policy、LLM、API、事件及验收映射完成；冲突有产品决议；至少一名非作者复核。 | cross-contract-static-mapping + review record |
| A3｜G6 产品债务 | PB-01…PB-04 均有产品负责人明确决定、责任人和适用阶段；任何 BLOCKED 项不得被实施团队默认为延期。 | PODR-001 + decision-register |
| A4｜G7 S1 范围 | 首体验、标准路径、启用动作、非目标、Golden 子集及延期案例已版本化批准。 | S1 scope decision + acceptance mapping |
| A5｜E5 证据方案就绪 | 版本矩阵、可复现运行记录格式、测试语料版本、证据保存路径、异常/负向执行流程和独立评测职责预先定义。 | evidence-execution-plan |
| A6｜签发授权 | 产品负责人记录授权 ID、代码计划版本、实现范围和到期条件；架构/工程负责人完成技术可行性复核。 | readiness record + approval record |

A1–A6 任一未通过，S1 Runtime Implementation 仍为 NOT AUTHORIZED。来源限定：E8 Gate 表的 12 项、P3-S1-CC01 的 20 项规范案例、P3-S1-CC02 的 40 项矩阵 / 12 项硬检查 / 8 项 GXC / 18 项负向案例是不同来源集，必须使用各自完整命名空间，不能仅凭数字匹配。

### B. 编码后动态 Evidence Gate（Post-Implementation Evidence Gate）

实施后、对外宣称 P3-S1 完成前，必须基于确切代码和契约版本执行：

1. G2 动态跨契约一致性案例与故障链路；
2. 适用于 S1 的 GS-01–GS-06 与 S1 启用动作契约测试；
3. G4 工程边界、并发、重复请求、取消、陈旧响应、恢复及数据完整性验证；
4. 由非实现作者完成独立 G5 评测；
5. 每次执行保存输入、版本、状态前后、决策轨迹、事件、预期/实际结果和评测记录；
6. P2 G01–G08 的未覆盖案例继续标记 NOT RUN / DEFERRED，直至后续阶段真实执行。

### C. P2 关闭

编码前准入只允许按边界实施，不关闭 P2。只有 E8 原有最终关闭公式中的 G1–G8 全部通过并完成 G8 签署，才可将 P2 更新为 CLOSED。

### D. 本修订当前状态

P2 Status = CLOSURE CANDIDATE / BLOCKED
Pre-Implementation Entry Gate = NOT PASSED
P3-S1 Implementation Authorization = NOT AUTHORIZED
Post-Implementation Evidence = NOT RUN
P2 Closure = NOT PASSED

本修订正式解决“先有运行证据才能实现、先实现才能有运行证据”的顺序矛盾；它不是任何 Gate 的通过证据，也不自动签发 S1 实施授权。

## 3. 变更控制

任何对 A1–A6、G01–G08、硬阻断条件或 E8 关闭公式的修改，须建立新的版本化产品决策，列明影响和回归要求。不得通过改写历史证据、删除失败案例或改变指标定义来获得 PASS。
