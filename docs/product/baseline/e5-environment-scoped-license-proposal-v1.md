# E5 证据环境搭建授权提案（Scoped License Proposal）

**编号：** E5-LICENSE-PROPOSAL-01
**版本：** 1.0.0（2026-10-08：提案建立——为 CR-15（E5 环境搭建授权方式）提供裁决材料）
**状态：** DECISION MATERIAL——待产品负责人裁决；本提案不预填任何决定
**背景：** A1–A4、A6 准入条件已满足（2026-10-08 签署会）；A5（E5 证据环境就绪）为 P3-S1 实施授权唯一剩余前置。E5 证据操作计划本身已经独立复核接受（P3-S1-REVIEW-008，ACCEPT WITH FINDINGS），但可执行环境未搭建（E5 §8：Node / Web / DB 环境与锁文件、自动化执行器、trace 与证据哈希产出均"尚未搭建"；首次端到端试运行 NOT RUN）。ADR-0002 §3 的沙箱许可仅限 Spike 三项验证（S-1/S-2/S-3），不覆盖 E5 环境搭建。
**依据：** P3-EVIDENCE-8.1（两段式门禁）；P2-EVIDENCE-E5.1 v1.1.1 §7–§8；P3-S1-REVIEW-008 F-1（授权方式属产品负责人决定）

## 1. 待决事项（CR-15）

E5 证据环境搭建的授权方式，二选一：

- **选项 A：** 实施授权前签发 scoped 预授权许可（本提案 §2 许可文本）
- **选项 B：** 将 E5 环境搭建列为实施阶段首个迭代任务（随实施授权一并开工，本提案 §3）

## 2. 选项 A：Scoped 预授权许可（提案文本）

### 2.1 授权范围（仅限证据环境搭建）

1. 可复现 Node / Web / DB 环境与锁文件（E5 §8 准备项）；
2. 自动化执行器：run-metadata 生成（E5 §3 版本矩阵）、单案例证据记录（§4 11 字段）、trace 捕获、SHA-256 清单产出（§7 只追加布局 `artifacts/evidence/`）；
3. 首次端到端证据试运行：以合成 fixtures 验证证据管线本身（版本绑定、案例记录、trace、哈希清单的完整性与可审计性），不含产品运行时行为验证。

### 2.2 明确排除

- P3-S1 产品运行时代码（Next.js 应用、API Route、LLM 网关、Validator、Runtime 实现）——须另行签发 P3-S1 实施授权；
- 真实 LLM Provider 调用与真实用户数据（隐私六要素全部批准前，仅允许合成数据或经明确批准的脱敏夹具）；
- 任何 Gate PASS 判定——试运行结果仅作 A5 再评估输入，不改变任何 Gate 状态。

### 2.3 约束

- 每次运行按 E5 §3 记录完整版本矩阵；失败结果按 ADR-0002 §5 模式如实登记，不得重跑至通过为止而不留失败记录；
- 密钥、访问令牌、原始个人隐私数据不得进入证据文件（E5 §3）；
- 许可有效期至 A5 再评估完成或 P3-S1 实施授权签发（以先到者为准）；
- 许可不使 A5 通过；A5 仍为 NOT PASSED 直至环境、评测人（已任命，2026-10-08）、首次试运行三项就绪条件完成。

### 2.4 成功标准（A5 再评估输入）

环境可复现（锁文件 + 版本矩阵可重算）；执行器产出符合 E5 §4 / §7 结构；试运行证据链完整可审计（输入 / 预期 / 实际 / 状态前后 / 轨迹 / 事件 / 哈希齐全）。

## 3. 选项 B：实施阶段首个迭代任务

- P3-S1 实施授权签发后，首个迭代 = E5 环境搭建 + 首次端到端试运行；REVIEW-005 F-1（Next.js Route Handler 流式响应 + AbortSignal 取消的端到端动态证据）与 F-2（授权日 Node Active LTS 重查并锁定补丁）由实施计划编入同一或后续迭代。
- 影响：实施授权签发即可开工，但 A5 就绪与产品实现并行；首批动态证据的版本矩阵绑定须覆盖环境搭建变更（E5 §3 Code commit / revision 记录）。

## 4. 对比

| 维度 | 选项 A（scoped 许可） | 选项 B（实施阶段首个任务） |
|---|---|---|
| 实施授权前置 | A5 先就绪，授权签发时证据环境已在位 | A5 与实现并行，授权签发时环境未在位 |
| 授权边界 | 两级许可（scoped 证据许可 + 实施授权），边界清晰 | 单一实施授权覆盖，边界较宽 |
| 开工时点 | 许可签发即可开工，不等实施授权 | 须等实施授权签发 |
| 风险 | 低（范围受限、明确排除运行时代码） | 首批迭代范围较大（环境 + 实现 + F-1/F-2） |
| 先例 | 同 ADR-0002 沙箱许可模式（范围受限、单独批准） | 同常规迭代模式 |

## 5. 裁决记录

| 决策者 | 选择 | 日期 | 备注 |
|---|---|---|---|
| 产品负责人 | PENDING | PENDING | 本提案不预填决定；裁决后按选择更新 decision-register CR-15 与 readiness-record |

**注意：** 无论选项 A 或 B，E5 环境搭建均须遵守 E5 v1.1.1 全部条款（版本矩阵、案例结构、状态词汇、独立性规则、隐私护栏）；E5 通过标准不变（16 项评测包实际运行结果 + 独立评测者复核 + 产品负责人签署）。

## 6. 附录 A：E5 证据环境搭建设计草案（裁决后执行蓝图）

**编号：** E5-LICENSE-PROPOSAL-01-ANNEX-A
**版本：** 1.0.0（2026-10-08）
**状态：** DECISION SUPPORT——设计草案，非执行记录；CR-15 裁决前不执行任何搭建动作。选项 A 与选项 B 共用本设计（仅开工时点不同）。

### A.1 设计原则

- 零外部依赖（与 ADR-0002 Spike 一致）：仅 Node 内置模块（node:sqlite / node:http / node:crypto / node:fs / node:child_process）；package.json 仅声明元数据并生成 lockfile
- 只追加证据布局（E5 §7）；失败如实登记（ADR-0002 §5 模式：保留失败记录，不得重跑至通过为止而不留失败记录）
- 合成数据 only；密钥、访问令牌、原始个人隐私数据不得进入证据文件（E5 §3）

### A.2 目录结构

```text
artifacts/evidence/manifest/
artifacts/evidence/runs/<run-id>/run-metadata.json
artifacts/evidence/runs/<run-id>/cases/<namespace>-<case-id>.json
artifacts/evidence/runs/<run-id>/traces/
artifacts/evidence/runs/<run-id>/logs/
artifacts/evidence/runs/<run-id>/review/
tools/evidence/          # 自动化执行器（run-metadata 生成器 / 案例记录器 / trace 捕获 / SHA-256 清单产出）
```

### A.3 执行器设计

- run-metadata 生成：绑定 Product Decision 版本、C1–C7 契约版本与 SHA-256、S1 C01–C09 规范版本与 SHA-256、State Machine / Policy / API / Event / Evaluation 版本、code commit（未提交工作树记录差异摘要）、Prompt 模板版本与内容哈希、Provider / Model ID / 参数 / 调用区域 / SDK 版本（不能提供时标记 unavailable）、Golden corpus / fixture / 测试脚本版本与哈希、回归基线 revision（无历史运行时标记 BASELINE_NOT_AVAILABLE，不得伪造比较结果）、Node / Next.js / 运行平台 / 数据库版本与配置摘要、时间戳 / 命令 / 退出码 / 重试次数 / 执行人
- 单案例记录器：E5 §4 全部 11 字段（含 Evaluator 字段——同一案例的实现作者与独立评测者不得为同一人）
- trace 捕获：输入、状态前后快照、决定轨迹、事件、时间戳
- SHA-256 清单产出：每个 run 包生成 SHA256SUMS
- 退出码语义：退出码 0 仅表示该命令中的断言通过，不自动设置 Golden Case / Gate / 产品状态为 PASS

### A.4 首次端到端试运行设计（合成 fixtures）

- 目标：验证证据管线本身（版本绑定 → 案例记录 → trace → 哈希清单）的完整性与可审计性；**不是**产品运行时行为验证
- 场景：以合成 fixture 模拟完整链路（输入 → 语义动作 → 策略决策 → 事件 → 状态前后），覆盖 GS-01 / GS-02 / GS-05 管线级 smoke 与一条失败路径（如 stale state_version 拒绝）
- 断言：版本矩阵完整可重算；案例记录 11 字段齐备；trace 可还原输入与状态前后；哈希清单可独立重算；失败路径按预期登记
- 边界：产品运行时行为验证属 G2–G4 动态执行（实施授权后），不在本次试运行范围

### A.5 环境基线

- Node.js v24.21.0（Active LTS，ADR-0002 Spike 已验证）；授权日重查 Active LTS 并锁定补丁的义务（F-2）不因本附录免除
- 平台 darwin arm64（搭建环境记录于 run-metadata）

### A.6 约束复核

- 本附录不改变任何 Gate 状态；试运行结果仅作 A5 再评估输入
- A5 再评估通过标准不变：环境可复现（锁文件 + 版本矩阵）、执行器产出符合 E5 §4 / §7、试运行证据链完整可审计；A5 通过仍需独立评测者复核与产品负责人签署
