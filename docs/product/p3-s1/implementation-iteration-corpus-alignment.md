# P3-S2 语料对齐迭代记录（模拟语料尾句对齐 F-4 分支语义）

**编号：** P3-S2-CORPUS-ALIGN-ITER
**版本：** 1.0.0
**状态：** COMPLETED（证据链闭合——G3-GOLDEN-0001 再生 36/36 案例 PASS + S2A-F4-0001 域回归 9/9 案例、16/16 断言、退出码 0；退出码 0 只表示本运行断言通过，不设置任何 Gate 为 PASS，E5 §2）
**记录日期：** 2026-10-09
**范围：** S2-CORPUS-TAIL-RULING-01 v1.0.0（选项 A 裁决）实施——模拟语料尾句与 F-4 分支语义对齐（fixtureId 升 `synthetic/simulate/v2`）；不改变任何状态机 / 分类器 / 策略映射行为（纯呈现文本对齐）。
**登记来源：** S2-CORPUS-TAIL-RULING-01 v1.0.0 §4 实施清单；S2a F-4 / F-5 与 S2b 迭代记录 §6 后续义务（"待产品负责人语料裁决（另案）"——裁决已履行 2026-10-09）
**材料位置：** `artifacts/evidence/runs/G3-GOLDEN-0001/`（黄金套件再生）与 `artifacts/evidence/runs/S2A-F4-0001/`（域回归）+ 归档尝试目录（`G3-GOLDEN-0001-attempt-2026-10-09T17-36-20-924Z` / `S2A-F4-0001-attempt-2026-10-09T17-37-26-969Z` / `S2A-F4-0001-attempt-2026-10-09T17-50-08-431Z`）

## 1. 裁决与实施内容

- **裁决：** 产品负责人（用户本人，PD-15）2026-10-09 选项 A——语料尾句更新、fixtureId 升 `synthetic/simulate/v2`（S2-CORPUS-TAIL-RULING-01 v1.0.0 RULED）。
- **语料变更（`src/experience/fixtures/simulate.ts`）：**
  - fixtureId：`synthetic/simulate/v1` → `synthetic/simulate/v2`；
  - chunks 尾句：`'。本提案为单次'` / `'模拟，不建立分支'` / `'状态。（流式结束）'` → `'。本提案为单次'` / `'模拟；本轮模拟已'` / `'建立分支状态（会'` / `'话内持久，可经后'` / `'续"如果"轮继续）'` / `'。（流式结束）'`；
  - 文件头注：S1-ACT-WHAT_IF 边界描述 → F-4 语义描述（本轮模拟经模拟域事件 `simulation_recorded` 登记 ACTIVE 分支记录——会话内持久、会话结束失效，后续模拟轮在分支上继续）。
- **执行器侧同步（纯描述性元数据，无断言语义变更）：**
  - `tools/evidence/src/golden.mjs` G03-N 预期文本 `singleShot`（描述性字段，不在 pass 谓词内）；
  - `tools/evidence/src/s2b.mjs` run-metadata corpus fixtures 列表 + 注记；
  - `tools/evidence/src/s2a-f4.mjs` 审阅包"待复核项"注记。

## 2. 证据链（按裁决 §4 实施清单执行）

| 步骤 | 结果 |
|---|---|
| G3-GOLDEN-0001 再生 | 36/36 案例 PASS、10/10 断言、退出码 0（2026-10-09T17:36；WHAT_IF 内容断言逐字节等于新语料自动对齐——内容断言经动态 import 语料 fixture 派生，无硬编码尾字节）；先前通过运行按 ADR-0002 §5 归档（`G3-GOLDEN-0001-attempt-2026-10-09T17-36-20-924Z`） |
| S2A-F4-0001 域回归（第一次尝试） | **FAILED**（退出码 1，2026-10-09T17:37:24.315Z，duration 15616ms）——9/9 案例中 MULTI-ROUND / NONCREATION-INERT / INPROC-REGRESSION FAIL；断言 A1 / A7 / A8 FAILED，其余 6 案例、13 断言 PASS。按 ADR-0002 §5 如实登记并归档；先前通过运行（提交 `45abe78`）归档为 `S2A-F4-0001-attempt-2026-10-09T17-37-26-969Z` |
| 失败根因与修复 | 执行器侧过期期望（见 §3 失败登记）——产品运行时无缺陷 |
| S2A-F4-0001 域回归（修复后重跑） | 9/9 案例 PASS、16/16 断言（A1–A16）、退出码 0（2026-10-09T17:50:21.444Z；run-metadata E5 §3 版本矩阵登记新 fixtureId 哈希 `dfa4045bb0457267f53b7f320472d55afd5b00635cf8366e8449b8aa793bc58a`；SHA256SUMS 20 文件独立重算一致） |

## 3. 失败登记（ADR-0002 §5——失败结果如实登记，不得重跑至通过为止而不留失败记录）

- **失败运行：** S2A-F4-0001 第一次尝试（2026-10-09T17:37:24.315Z——案例 MULTI-ROUND / NONCREATION-INERT / INPROC-REGRESSION FAIL；断言 A1（MULTI-ROUND）/ A7（NONCREATION-INERT）/ A8（INPROC-REGRESSION）FAILED）。归档：`artifacts/evidence/runs/S2A-F4-0001-attempt-2026-10-09T17-50-08-431Z`（保留于仓库，不删除；`summary.json` exitCode=1 如书）。
- **根因：** `tools/evidence/src/s2a-f4.mjs` 执行器案例断言与版本矩阵硬编码 `policy_version=policy_v1.4.0`（F-4 实施时点版本）。S2b 实施（提交 `65ea951`，policy_v2.0.0）后运行时合法输出 policy_v2.0.0 决策追踪，执行器期望未随 S2b 基线同步——该执行器自 F-4 实施（`45abe78`）后未重跑，过期期望在本次语料变更前即存在，与语料变更无因果关系（失败运行实际数据：两轮 `contentMatchesFixture=true`，语料字节对齐正常）。
- **缺陷定性：** 执行器侧期望缺陷；产品运行时无缺陷（失败运行实际数据全部 F-4 语义正确：版本链 [2,3,4,5,6] 单调、simulation_recorded ×2 同一分支 `branch_synthetic_0001`、branch_created [true, false]、分离不变式 `simulation_result_is_not_fact`、模拟域快照 1 分支 ACTIVE version=2 sourceRound=1）。
- **修复：** `s2a-f4.mjs` 执行器期望同步（28 处）——A1/A7/A8 断言与案例记录 scope 的 policy_version 期望 policy_v1.4.0 → policy_v2.0.0（附"F-4 语义冻结于 policy_v1.4.0 §3 变更 1/2，经现行 policy_v2.0.0 延续不变"注记）；版本矩阵现行基线字段 `policy.version` → `policy_v2.0.0` / `stateMachine.version` → `state_machine_v1.5.0`（A15 断言同步）；`s2ScopeItems` 更新为现行基线真实状态（F-5 / S2b 已实施——原文本在现行基线下为假陈述）；corpus fixtureId → `synthetic/simulate/v2`；历史绑定（frozenDecisions D-01 / implementationFiles / goldenRegression"F-4 实施时 32/32"）保留为历史引用。
- **重跑结果：** 9/9 案例、16/16 断言、退出码 0（2026-10-09T17:50:21.444Z）。
- **已提交证据冻结：** S2A-F4-0001 原始通过运行（`45abe78`）与 S2B-0001（`434142f`）保持冻结于 git 历史，哈希链不断裂。S2B-0001 为角色 5 评测包（独立评测 PASS 2026-10-09），不因语料变更重跑——其断言不绑定 simulate 尾字节（内容断言经动态 import 派生，无硬编码尾字节）。

## 4. 不变量确认

- F-4 语义全部保持（新旧语料下）：多轮模拟持久化、四元分离事件登记、轴外分支子状态机、分支生命周期四操作最小集、会话结束失效（D-04 选项 A）。
- 内容断言机制：golden / s2a-f4 语料内容断言经动态 import 已提交语料 fixture 派生（无硬编码尾字节）——语料字节变更自动对齐，无需断言代码变更（grep 验证：执行器内无"不建立分支" / "本提案为单次" / "流式结束"硬编码命中）。
- 退出码 0 与全部断言通过只表示本运行中的断言通过；不设置任何 Golden Case、Gate（G2/G4/G5/G8）或产品状态为 PASS（E5 §2）。

## 5. 后续义务

- 分支回流操作版本化定义（F-4 D-02/D-03 选项 A 说明）：**已裁决（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A——启用显式回流操作 ADOPT_BRANCH，产品负责人 2026-10-09 裁决；CR-27 登记；`branch-reflow-operation-def-staged.md` 升版 RULED；产品实施按授权路径另行签发）**。
- G5 16 项评测包：NOT RUN（属 G5 工作表范围；S2b 独立评测已经角色 5 签署 PASS，2026-10-09；S2 时代 G5 评测包范围定义 S2-G5-EVAL-DEF-01 v1.0.0 已经产品负责人 2026-10-09 裁决选项 A——复用 16 项框架对 S2 证据执行独立评测（CR-26 STAGED→RULED）；新建 P3-S2-G5-WORKSHEET-01 v0.1.0 staged（`s2-g5-evaluation-worksheet.md`——16 项骨架，结论列全部 NOT RUN，待角色 5 逐项裁决签署）；EVIDENCE-MANIFEST-01 升版 v1.3.0——S2 时代 7 运行追加，7 运行 SHA256SUMS 独立重算全部精确通过）。
- 黄金套件持续扩展：随后续批次经产品负责人另行版本化裁决与授权纳入 G3-GOLDEN-0001 回归基准。

## 6. 签署

- 执行：工程负责人角色（代理，Codex），2026-10-09。
- 裁决：产品负责人（用户本人，PD-15）——S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A，2026-10-09。
- 独立评测人对本记录与证据材料保留审阅与否决权（角色分离：本记录由实现方起草，实现作者未兼任独立评测人）。
