# P3-S1 独立复核记录：R4（技术架构与失败恢复 / ADR-0001 复核）

**记录编号：** P3-S1-REVIEW-005
**版本：** 0.1.0 DRAFT（2026-10-08：起草代理完成复核分析与机械核验；**待复核者签署**）
**状态：** DRAFT——PENDING 复核者签署；本草案不构成 A6 签署或任何 Gate 证据
**适用门禁：** P2-EVIDENCE-8.1 A6（G6 技术栈 / 架构工程复核）；ADR-0001 工程复核

## 1. 复核记录（按 independent-review-package.md §4 模板）

| 字段 | 记录 |
|---|---|
| Review ID | P3-S1-REVIEW-005 |
| 复核区块 | R4（技术架构与失败恢复，对应 A6）；ADR-0001 工程复核 |
| 复核者及角色 | PENDING（拟定：用户本人，角色 2 架构负责人，OWNER-ROSTER-01 v0.2.4 行 2，PD-15） |
| 复核者与作者关系 | 非起草方：ADR-0001、ADR-0002 Spike 代码与验证报告由代理会话起草；复核者未参与内容起草（同 K-5 先例：起草代理与复核者无同一性） |
| 基线版本与 Git revision | ADR-0001（@ git 77106a4，内容未变）；ADR-0002（@ 05fd95f，已生效）；ADR-0002-spike-report.md v1.0.0（@ 94f5fd5）；`spike/cancellation/` 代码与证据（@ 94f5fd5） |
| 结论 | PENDING（草案建议见 §5） |
| Findings（含严重度 / 条款 / Gate） | F-1…F-5（见 §4）；无 Critical |
| 遗留问题 / 责任人 / 到期阶段 | F-1 / F-2 处置义务转入实施计划首批必验项（责任人：工程负责人角色）；到期阶段：实施授权后首个迭代；幂等验证（S1-CC25 等）与产品 DB 复验属 G2–G4 动态证据 |
| 证据位置与哈希 | `docs/architecture/decisions/ADR-0002-spike-report.md` §5（run 1 / run 2 全部证据 SHA-256）；`spike/cancellation/evidence/SHA256SUMS`、`spike/cancellation/evidence-run-1-initial/SHA256SUMS` |
| 日期与签署 | PENDING（2026-10-08 草案） |

## 2. 机械核对项（起草代理已逐项执行，复核者可独立重跑）

- [x] 证据哈希自检：run 2 `evidence/SHA256SUMS` 13 项全部校验 OK；run 1 存档 `evidence-run-1-initial/SHA256SUMS` 13 项全部校验 OK（2026-10-08，复核时点）。
- [x] 报告 §5.1 / §5.2 哈希表与实际证据文件一致（逐项比对）。
- [x] Spike 代码硬边界扫描：`src/`、`run-all.mjs` 无产品契约对象标识符（Session / Intent / Semantic Action / Policy / Validator / Runtime / Gateway）；无外部网络或真实 LLM Provider 调用（S-1b 仅本机 127.0.0.1 自服务）。
- [x] 存储桩披露已核实：`experience_state` 表为通用版本化行（id / payload / version 三列），不含产品 ExperienceState 语义（无生命周期、无状态转换、无 mutation trace）；属 ADR-0002 §3 允许的"最小存储桩"。
- [x] run 1 失败记录完整：`s3-concurrent-write.json` 含每轮 accepted / conflicts / errors / finalVersion 明细；存档未删改，与报告 §4 所述一致。
- [x] ADR-0002 §3 七条硬边界逐条核对与报告 §7 声明一致。

## 3. R4 五项确认点逐条分析

### R4-1｜Next.js 模块化单体 + LTS 复核 + 目标部署方式下的取消 / STOP / CHANGE / 旧候选失效 / 可追踪

- **形态一致性：** ADR-0001 方案 A（Next.js App Router + TypeScript，常驻 Node.js 服务/容器）与目标部署形态一致；ADR-0002 §2 要求 Spike 在"常驻 Node.js 服务/容器"形态验证，S-1b 以常驻 `node:http` 服务达成该形态要求。
- **LTS：** Node 24 为本 ADR 查阅日基线；Spike 执行日按生命周期规则锁定 **v24.21.0（Active LTS）**并记录于证据 environment 字段。**授权日重查义务未消失**（F-2）。
- **取消与 stale 拒绝：** S-1（进程内 + 常驻 HTTP 服务两形态）证明取消信号端到端可达、取消后零 chunk、终止带时间戳；S-2 证明旧 `expected_state_version` 写入 100% 拒绝。结论限定为**常驻 Node.js 服务形态、Node 运行时层面**已证实。
- **未覆盖：** Spike 按 §3 以纯 Node ESM 最小桩实现；**Next.js App Router Route Handler 层的 streaming / AbortSignal 取消路径未在产品框架内验证**（F-1）。ADR-0001 §67 的撤销条款（"若取消场景经原型验证在 Next.js 目标环境中无法可靠满足产品契约，应撤销本推荐"）目前未被触发，也未被免除。

### R4-2｜状态版本冲突与幂等以持久层原子条件保证

- **已证实：** S-2 / S-3 证明单条条件 `UPDATE ... WHERE version = ?` 在跨独立 OS 进程、独立连接下原子生效：每轮恰 1 成功 / 19 拒绝、失败方读到最新版本、最终版本正确；100% stale 拒绝且审计完整。原子性来自 SQLite 存储引擎，不依赖进程内锁。
- **未覆盖：** 幂等（idempotency）不在 ADR-0002 §2 三项验证范围内，Spike 未验证（F-3）；重试幂等语义须在实施阶段以 S1-CC25 等案例动态验证。

### R4-3｜未决基础设施不妨碍关键接口与状态契约设计

- 数据库产品、部署商、身份方案均未决（ADR-0001 §未决项）；条件写模式已在 SQLite（ADR-0002 §4 候选之一）验证，PostgreSQL 同支持原子条件 UPDATE，模式可移植；产品 DB 选定后须在目标 DB 上复验（F-4）。
- 关键接口（Runtime 单写入、LLM Proposal 边界、Validator 检查层）已由 C4 / C09 契约定义，与 DB 选择解耦。
- 无擅自默认：Spike 报告 §6 显式声明"本报告不决定产品数据库选型"。

### R4-4｜Route Handler / 前端不绕过 Runtime；模型与 Provider SDK 不泄漏

- 静态规则已确立（ADR-0001 边界条款、C4 §12 Provider Lock-in 八项禁令 / §13 LLM Proposal 边界）；当前无产品运行时代码，静态审查未发现违反；Spike 代码扫描（见 §2）证实无产品契约对象、无外部 Provider 调用。
- 实施阶段须以模块边界设计 + G3 / G4 测试动态验证（F-5）。

### R4-5｜未知平台限制的可验证原型条件；A6 签署前提

- 原型条件已由 ADR-0002 给出且已完成：run 2 S-1 / S-2 / S-3 全部通过；run 1 S-3 测试桩缺陷（遗漏 `PRAGMA busy_timeout` 致 SQLITE_BUSY）已按 §5 如实登记并存档，存储语义在 run 1 每轮仍正确——失败性质（桩缺陷 vs 验证目标失败）**由本复核确认**：根因为测试桩配置遗漏，非存储原子性失效。
- 未证实的可取消性未被写成"已保证"：报告 §6 / §8 已将结论限定在验证范围内。

## 4. Findings

| ID | 严重度 | 条款 / Gate | 发现 | 处置 |
|---|---|---|---|---|
| F-1 | **Important** | R4-1 / A6 | Next.js Route Handler 级取消路径未在产品框架内验证（Spike 为纯 Node ESM 最小桩，ADR-0002 §4 基线含 Next.js + TypeScript，报告 §6 已作环境偏差披露） | 转入实施计划**首批必验项**：实施授权后首个迭代必须完成 Next.js App Router Route Handler + streaming + AbortSignal 端到端取消的动态证据（G2–G4）；不因本 Spike 通过而免除。若复核者判定该验证是 A6 签署前置，则 A6 须等待产品栈 Spike 或实施首批证据 |
| F-2 | **Important** | R4-1 / A6 | Node LTS 补丁锁定义务双重化：Spike 执行日锁定 v24.21.0 不等于授权日锁定 | 按 ADR-0001 §43：取得编码授权前重查 Node 官方发布状态，在依赖锁文件固定当时受支持的精确 Active / Maintenance LTS 补丁并记录 |
| F-3 | Minor | R4-2 / A6 | 幂等未在 Spike 范围（ADR-0002 §2 未含） | 实施阶段以 S1-CC25 等案例动态验证重试幂等 |
| F-4 | Minor | R4-3 / A6 | 产品 DB 未决；条件写仅在 SQLite 验证 | 产品 DB 选定后在目标 DB 复验条件写与并发语义 |
| F-5 | Minor | R4-4 / A6 | 模块边界 / SDK 隔离无运行时代码可查 | 实施阶段代码审查 + G3 / G4 测试验证 |

无 Critical finding；无 BLOCK 级未决项（F-1 的两种处置见 §5）。

## 5. 草案建议结论（待复核者确认）

**建议：ACCEPT WITH FINDINGS。** 理由：R4 五项确认点均有证据或明确的后续义务；F-1 / F-2 为 Important 但属实施阶段必验项而非准入阻断——ADR-0002 §2 的法定验证目标（常驻 Node 服务形态的取消与 stale 拒绝）已全部达成，产品框架集成验证按既有门禁序列（G2–G4 动态证据）在实施阶段完成，且 F-1 已显式登记并转入实施计划，不存在"未证实写成已保证"。

**备选：** 若复核者判定"Next.js 目标环境内的取消验证"是 A6 签署的前置条件，则本区块结论应为 **BLOCK**——A6 保持 PENDING，直至产品栈 Spike 或实施首批动态证据产生。该判定属复核者权限，本草案不作替代。

**A6 其余前置不变：** 授权日 LTS 重查（F-2）、R1/R2/R3/R5 复核结论、G5 隔离声明、E5 环境就绪等均不因本草案改变。

## 6. 签署区

| 签署 | 记录 |
|---|---|
| 复核者（角色 2 架构负责人） | PENDING |
| 结论（ACCEPT / ACCEPT WITH FINDINGS / BLOCK） | PENDING |
| 日期 | PENDING |

**注意：** 本记录签署 ≠ A6 签署 ≠ 实施授权；A1–A6 与各 Gate 状态不变。
