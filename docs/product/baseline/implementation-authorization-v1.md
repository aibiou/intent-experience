# P3-S1 实施授权

**编号：** P3-S1-IMPL-AUTH-01
**版本：** 1.5.0（2026-10-09：§8–§10 履行记录"非结论"/"待复核项"/"独立评测"行按单一状态源规范更正（G2/G4 经 G5 独立评测 PASSED；CR-16/CR-17 已经 REVIEW-009 关闭；G5 16 项评测包已执行并双签署——P3-S1-G5-WORKSHEET-01 v1.7.0）；其余内容与 v1.4.0 相同）
**状态：** AUTHORIZED（2026-10-08 签发）；F-1 已履行（2026-10-08）；F-2 已履行（2026-10-08）；F-3 已履行（2026-10-08）
**授权依据：** P2-EVIDENCE-8.1 两段式门禁（PD-02）；A1–A6 准入条件全部满足（2026-10-08）
**签发：** 代理产品负责人（Codex 履行，PODR-001 / PD-10 / PD-14 / PD-15 委托）

## 1. 准入条件满足证据（A1–A6）

| 条件 | 状态 | 证据 |
|---|---|---|
| A1 / G1 契约权威冻结 | PASSED | C1–C7 Steward 确认（`signing/steward-confirmation-c1-c7.md`，2026-10-08）+ R1 非作者复核（P3-S1-REVIEW-006，ACCEPT WITH FINDINGS） |
| A2 / G2 静态跨契约映射 | PASSED | R2 非作者复核（P3-S1-REVIEW-004，ACCEPT，2026-10-08）；动态执行 NOT RUN |
| A3 / A4 / G6 / G7 | PASSED | R3 非作者复核（P3-S1-REVIEW-007，ACCEPT WITH FINDINGS）；PB-01…PB-04 处置闭环（PB-01 解除条件已满足） |
| A5 / E5 证据环境就绪 | PASSED | E5-SCOPED-LICENSE-01（PD-17 选项 A）+ 环境搭建（`tools/evidence/` + package-lock.json）+ 首次端到端试运行 E5-TRIAL-0001（4 案例 PASS、6/6 断言（A1/A2a/A2b/A3/A4/A6）、退出码 0；`artifacts/evidence/runs/E5-TRIAL-0001/`）+ 独立评测人任命（G5 隔离声明，2026-10-08） |
| A6 技术可行性 | PASSED | R4 复核（P3-S1-REVIEW-005，ACCEPT WITH FINDINGS）；ADR-0002 Spike 完成（run 2 S-1/S-2/S-3 全过，run 1 失败如实登记） |

准入记录：`docs/product/p3-s1/readiness-record.md` v1.1.0。

## 2. 授权范围

P3-S1 Runtime Implementation：运行时首个完整产品切片（S1）运行时代码的开发与动态证据执行。

## 3. 首个迭代义务（REVIEW-005 F-1 / F-2 处置）

1. **F-1（Important，选项 A 采纳）：** Next.js Route Handler 流式响应 + AbortSignal 取消传播的端到端动态证据——在产品框架（Next.js + TypeScript）内验证 S-1 客户端中止传播（进程内与 HTTP 两种形态），作为实施首批必验项；动态证据按 E5 §3/§4 记录。
2. **F-2（Important）：** 授权日 Node Active LTS 重查并锁定补丁——**已履行**（见 §4）。

## 4. F-2 履行记录（授权日 LTS 重查）

| 项 | 记录 |
|---|---|
| 重查日期 | 2026-10-08 |
| 重查来源 | nodejs.org 官方发布页（页脚："v24.21.0 Latest LTS"） |
| 当前 Active LTS 线 | Node.js 24.x |
| 最新补丁版本 | v24.21.0 |
| 锁定版本 | Node.js v24.21.0（与 ADR-0002 Spike 锁定版本一致；nvm 已安装 `/Users/pg014/.nvm/versions/node/v24.21.0`） |
| 锁定位置 | `tools/evidence/package.json` engines.node `>=24.0.0`；产品运行时代码 package.json 锁定精确版本 v24.21.0 |
| 结论 | F-2 义务履行：授权日重查通过，补丁锁定 v24.21.0 |

## 5. 持续约束（授权不解除）

1. 隐私护栏：隐私六要素全部批准前，不得收集或保存任何真实用户数据；仅允许合成数据或经明确批准的脱敏夹具；不得自行假设留存天数、区域或访问角色（evidence-execution-plan §3）。
2. P0 硬门槛零容忍（PD-08）：用户主导权、状态完整性、策略边界违反直接阻断。
3. 任何 Gate 不因代码存在、测试全绿或演示成功而 PASS；只有真实运行证据 + 独立评测 + 正式签署（E5 §2）。
4. 每次运行按 E5 §3 记录完整版本矩阵；失败结果按 ADR-0002 §5 如实登记，不得重跑至通过为止而不留失败记录。
5. 密钥、访问令牌、原始个人隐私数据不得进入证据文件。
6. 不得由实现代理自行批准其实现的产品 Gate；独立评测负责人（角色 5，用户本人，G5 隔离声明 2026-10-08 任命生效）保留审阅与否决权。
7. C3 行为语义空缺（G-1…G-7，C3-SEMANTIC-GAP-REGISTER-01）不得由编码者补写；行使到空缺语义时按升级规则处理，未知情况升级而非由 LLM 决定。
8. S1 范围边界：CREATE / SEARCH 禁用；WHAT_IF 仅基础单次模拟（不建立持久 / 多轮分支）；不持久化跨会话 Memory（PD-05 / PD-06 / PD-07）；STOP / CHANGE 为硬边界。
9. 严重度按来源适用（PD-13）；案例 ID 按六类命名空间（PD-11）；状态写入字段规范名 `expected_state_version`（PD-16）。

## 6. 授权不授予

- 不授予任何 Gate PASS：G2–G8 仍 NOT RUN / NOT PASSED，须经动态证据 + 独立评测 + 正式签署。
- 不授予真实用户数据收集权（隐私六要素待产品 / 安全负责人批准）。
- 不授予 P2 关闭（P2 仍为 CLOSURE CANDIDATE / BLOCKED，NOT CLOSED）。

## 7. 签署记录

| 角色 | 记录 | 日期 |
|---|---|---|
| 产品负责人（签发人；代理 Codex 履行，用户本人 PD-15 委托） | 签发 P3-S1 实施授权（A1–A6 已满足） | 2026-10-08 |
| 架构负责人（用户本人，PD-15） | 准入条件 A1–A6 满足确认（见 readiness-record v1.0.0） | 2026-10-08 |

**注意：** 本授权是 P2-EVIDENCE-8.1 两段式门禁的第二段起点。首个迭代完成后，动态证据（G2–G4）与独立评测（G5）按 E5 计划执行；任何 P0 失败直接阻断。

## 8. F-1 首批义务履行记录（2026-10-08）

| 项 | 记录 |
|---|---|
| 义务 | §3 F-1：Next.js Route Handler 流式 + AbortSignal 取消端到端动态证据（进程内 + HTTP 双形态） |
| 实施 | P3-S1 运行时切片：`app/api/experience/stream/route.ts`（POST NDJSON 流 + 显式 GET 405）+ `src/experience/`（policy 仅 S1 冻结映射、chunks 合成语料、stream 取消感知生成器、audit 追加只写服务端审计汇、http 框架无关处理核心）；Node v24.21.0 精确锁定；Next.js 16.4.0 / React 19.3.0 |
| 动态证据 | F1-E2E-0001：**9/9 案例 PASS、12/12 断言 PASS、退出码 0**（材料 `artifacts/evidence/runs/F1-E2E-0001/`，含 §4 案例记录、trace、服务端审计汇、run-metadata E5 §3 版本矩阵、SHA256SUMS） |
| 动态证据发现的缺陷 | D-1：STOP 策略被要求加载内容语料致 500（已修复：STOP 无内容分块，跳过语料加载）；D-2：终止事件仅写审计汇未 yield 给流（已修复：终止事件 emit + yield）。均按 ADR-0002 §5 登记，失败尝试归档留存（`F1-E2E-0001-attempt-1-failed/`、`F1-E2E-0001-failed-2026-10-08T14-25-36-102Z/`） |
| 迭代记录 | `docs/product/p3-s1/implementation-iteration-f1.md`（P3-S1-IMPL-ITER-001 v1.0.0） |
| 非结论 | 退出码 0 不设置任何 Gate 为 PASS（时点声明，2026-10-08）；GS-01–GS-06 完整动态执行与 C6 事件证据属后续迭代（F-2 已履行，2026-10-08）；G2/G4 Gate 判定经 G5 独立评测作出：PASSED（2026-10-09，P3-S1-READINESS-01 v1.9.0）；S1 未验收 |
| 独立评测 | 材料 staged 于 `F1-E2E-0001/review/README.md`；独立评测负责人（用户本人，角色 5）保留审阅与否决权 |

## 9. F-2 履行记录（2026-10-08）

| 项 | 记录 |
|---|---|
| 义务 | §2 授权范围 / P2-EVIDENCE-8.1 §B：GS-01…GS-06 完整动态执行 + S1 启用动作契约测试 + C6 事件证据 |
| 实施 | S1 运行时核心（`src/experience/runtime.ts` 1663 行 + session / state-store / state-machine / classifier / validator / llm-gateway / events / decision-trace / server-runtime / chunks + fixtures）+ 5 条 HTTP 路由（session/start、intent/resolve、experience/start、state GET、event POST）+ `policy.ts` 扩展为 S1 §14 冻结全映射（`POLICY_VERSION='policy_v1.0.0'`）；F-1 切片（`http.ts`/`stream.ts`/`audit.ts`）零改动；提交 `2a81d34`（20 文件、+6334/−10） |
| 动态证据 | F2-GS-0001：**40/40 案例 PASS、24/24 断言 PASS、退出码 0**（14.6s；材料 `artifacts/evidence/runs/F2-GS-0001/`：cases/ 40 份 E5 §4 记录、traces/、run-metadata.json E5 §3 版本矩阵、SHA256SUMS）；覆盖 GS-01…GS-06（含全部登记负向）、S1-ACT-WHAT_IF、S1 §23/C6 最低事件集、C6 §7/§25/§27/§22/§23 契约校验、F-1 回归（进程内 + HTTP）、HTTP 形态端到端与负向、无真实提供方静态扫描、完整性（36 项归档哈希 + C1–C7 契约指纹）、证据-代码绑定（干净工作树，绑定提交 `d957d39`） |
| 动态证据发现的缺陷 | 运行时缺陷：**无**。案例/执行器侧缺陷 3 项（E-1 event_id 格式、E-2 GS-04-NOCONT 断言次序假设、E-3 event_id 前缀修复过度），均已修复并登记于迭代记录 §3；失败尝试按 ADR-0002 §5 归档（`F2-GS-0001-attempt-2026-10-08T15-19-59-851Z/`、`F2-GS-0001-attempt-2026-10-08T15-21-16-354Z/`） |
| 迭代记录 | `docs/product/p3-s1/implementation-iteration-f2.md`（P3-S1-IMPL-ITER-002 v1.0.0） |
| 待复核项 | 事件名称调和表（S1 §23 → C6 权威名，CR-16）与 policy_decided 发射时机解释（CR-17）——编码时契约解释，已经非作者复核签署关闭（P3-S1-REVIEW-009，ACCEPT，2026-10-09），作为契约结论生效 |
| 非结论 | 退出码 0 不设置任何 Gate 为 PASS（时点声明，2026-10-08）；G2 动态跨契约一致性案例与 G4 工程边界证据专项已由 F-3 履行（2026-10-08）；G2/G4 Gate 判定经 G5 独立评测作出：PASSED（2026-10-09，P3-S1-READINESS-01 v1.9.0）；S1 未验收 |
| 独立评测 | 材料 staged 于 `F2-GS-0001/review/README.md`；独立评测负责人（用户本人，角色 5）保留审阅与否决权；G5 16 项评测包执行前须先审阅 F-1 与 F-2 材料（**已履行 2026-10-09：staged 材料经三份审阅包审阅通过，G5 评测已执行并双签署——P3-S1-G5-WORKSHEET-01 v1.7.0**） |

## 10. F-3 履行记录（2026-10-08）

| 项 | 记录 |
|---|---|
| 义务 | §2 授权范围 / P2-EVIDENCE-8.1 §B：G2 动态跨契约一致性案例与故障链路 + G4 工程边界/并发/重复请求/取消/陈旧响应/恢复/数据完整性验证（P2-EVIDENCE-4.0 EB-01…EB-16） |
| 实施 | 本迭代产品源码零改动（F-2 运行时核心为已实施基线，`git diff 67aac55..64a1391` 对产品源码为空）；证据执行器 `tools/evidence/src/f3.mjs`（2645 行；21 案例 = 5 G2 动态跨契约一致性 + 16 G4 工程边界；28 断言 B1–B28；E5 §3 版本矩阵含 engineeringBoundaries 专项）；提交 `69c49f2`（执行器）、`67aac55`（执行器侧缺陷修复） |
| 动态证据 | F3-EB-0001：**21/21 案例 PASS、28/28 断言 PASS、退出码 0**（9.0s；材料 `artifacts/evidence/runs/F3-EB-0001/`：cases/ 21 份 E5 §4 记录、traces/、run-metadata.json E5 §3 版本矩阵、SHA256SUMS）；进程内形态（注入网关/内存汇）+ 静态形态（导入图/属性访问/路由面扫描）+ HTTP 形态（真实 Next.js 生产服务器）三形态；失败尝试 2 次按 ADR-0002 §5 归档（`F3-EB-0001-attempt-2026-10-08T16-06-20-267Z/`、`F3-EB-0001-attempt-2026-10-08T16-07-30-452Z/`，提交 `4b5f1d6`/`0fe8011`）；运行产物提交 `64a1391`；运行绑定至 git 提交 `4b5f1d6`（尝试 3 启动时 HEAD，记录于 run-metadata.json code.gitHead；相对 `67aac55` 仅追加证据归档，产品源码一致；A23/B27 干净工作树） |
| 动态证据发现的缺陷 | 运行时缺陷：**无**（三次尝试中的全部失败均为案例/执行器侧缺陷）；案例/执行器侧缺陷 F3-E-1…F3-E-9 已登记于迭代记录 §3（含尝试 2 的 A23 绑定违规如实记录） |
| 迭代记录 | `docs/product/p3-s1/implementation-iteration-f3.md`（P3-S1-IMPL-ITER-003 v1.0.0） |
| 待复核项 | CR-16（事件名称调和表）/ CR-17（policy_decided 发射时机解释）已经非作者复核签署关闭（P3-S1-REVIEW-009，ACCEPT，2026-10-09）；HTTP 形态 LLM 故障 503（EB-12 子项）NOT RUN——S1 服务端运行时未暴露 LlmGateway 注入缝，2026-10-09 经产品负责人裁决（CR-18 选项 B）登记 DEFERRED TO 后续切片 |
| 非结论 | 退出码 0 不设置任何 Gate 为 PASS（时点声明，2026-10-08）；G2/G4 证据已产出，Gate 判定经 G5 独立评测作出：PASSED（2026-10-09，P3-S1-READINESS-01 v1.9.0）；S1 未验收 |
| 独立评测 | 材料 staged 于 `F3-EB-0001/review/README.md`；独立评测负责人（用户本人，角色 5）保留审阅与否决权；G5 16 项评测包执行前须先审阅 F-1、F-2 与 F-3 材料（**已履行 2026-10-09：staged 材料经三份审阅包审阅通过，G5 评测已执行并双签署——P3-S1-G5-WORKSHEET-01 v1.7.0**） |
