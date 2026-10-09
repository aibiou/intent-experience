# 证据运行包索引（EVIDENCE-MANIFEST-01）

**版本：** 1.3.0（2026-10-09：追加 S2 时代证据运行 7 项——S2A-OBL-01-0001 / S2A-F2-0001 / S2A-F3-0001 / S2A-F4-0001 / S2A-F5-0001 / S2B-0001 / G3-GOLDEN-0001 当前再生产物状态；7 运行 SHA256SUMS 独立重算全部精确通过；30 个尝试归档中 27 个全部精确通过、3 个各 1 项 summary.json 时点性不符（与 F1/F2 同类——执行器写入顺序，实质内容经交叉核验为真）；v1.0.0/v1.2.0 内容保持原样，git 历史可查）
生成：2026-10-08T16:35:08.546081Z（v1.0.0，工程负责人角色，代理）；v1.3.0 追加生成 2026-10-09（工程负责人角色，代理）
依据：E5 计划 §7 只追加布局；G5 第 15 项（Evidence Index）输入。方法：独立重算（不信任执行器自报断言）。
**退出码 0 / 案例 PASS 只表示本运行中的断言通过；不设置任何 Gate 为 PASS。P2 时代 G5 16 项评测包已于 2026-10-09 完成（PASSED 无条件——P3-S1-G5-WORKSHEET-01 v1.8.0）；S2 时代 G5 评测包 NOT RUN（范围定义提案 S2-G5-EVAL-DEF-01 v0.1.0 staged 待产品负责人裁决——独立评测人：用户本人，角色 5，PD-15）。**

## E5-TRIAL-0001（E5 环境就绪（A5））
- 义务：E5-SCOPED-LICENSE-01（PD-17 选项 A）：首次端到端试运行——证据管线可复现性验证（非产品运行时验证）
- 结果：案例 4/4 PASS；断言 6/6；退出码 0；耗时未记录（无 durationMs 字段）
- SHA256SUMS 独立重算：11/11 通过（全部精确通过）；清单含 summary.json=True、review/README.md=True
- 断言说明：summary.json 权威记录 6 项断言（A1/A2a/A2b/A3/A4/A6，全部通过）。A7（哈希清单产出）/A8（清单可独立重算）断言因执行器写入顺序（summary.json 先于 A7/A8 记录写入）未持久化到任何产物；其 A7/A8 实质内容经独立重算验证为真（SHA256SUMS 11/11 精确通过）。治理文档原记载"8/8 断言"为错误计数，已更正（2026-10-08）。
- 产物提交：`a3506a1`；审阅包：`artifacts/evidence/runs/E5-TRIAL-0001/review/README.md`

## F1-E2E-0001（F-1）
- 义务：P3-S1-IMPL-AUTH-01 §3 F-1：Next.js Route Handler 流式 + AbortSignal 取消端到端动态证据（进程内 + HTTP 双形态）
- 结果：案例 9/9 PASS；断言 12/12；退出码 0；耗时 4599ms
- 代码绑定：gitHead `6b3aca7`（workTreeClean=False），记录于 run-metadata.json code
- SHA256SUMS 独立重算：20/21 通过，1 项不符（已解释）；清单含 summary.json=True、review/README.md=False
  - summary.json 列入清单但在清单计算之后才定稿——1 项声明哈希与实际不符（独立重算 20/21）；已登记于 F-3 迭代记录 §3 独立审计发现。
- 产物提交：`ece0ba3`；审阅包：`artifacts/evidence/runs/F1-E2E-0001/review/README.md`
  - 失败尝试归档：`F1-E2E-0001-attempt-1-failed`（案例 2/9 PASS；断言 3/11；退出码 1；SHA256SUMS 重算 21/22 通过；提交 `ece0ba3`；ADR-0002 §5（失败如实登记，留存于仓库））
  - 失败尝试归档：`F1-E2E-0001-failed-2026-10-08T14-25-36-102Z`（案例 8/9 PASS；断言 9/11；退出码 1；SHA256SUMS 重算 21/24 通过；提交 `ece0ba3`；ADR-0002 §5（失败如实登记，留存于仓库））

## F2-GS-0001（F-2）
- 义务：P3-S1-IMPL-AUTH-01 §2 / P2-EVIDENCE-8.1 §B：GS-01…GS-06 完整动态执行 + S1 启用动作契约测试 + C6 事件证据 + F-1 回归
- 结果：案例 40/40 PASS；断言 24/24；退出码 0；耗时 14574ms
- 代码绑定：gitHead `98f9a8f`（workTreeClean=True），记录于 run-metadata.json code
- SHA256SUMS 独立重算：84/85 通过，1 项不符（已解释）；清单含 summary.json=True、review/README.md=False
  - summary.json 列入清单但在清单计算之后才定稿——1 项声明哈希与实际不符（独立重算 84/85）；已登记于 F-3 迭代记录 §3 独立审计发现。
- 产物提交：`d957d39`；审阅包：`artifacts/evidence/runs/F2-GS-0001/review/README.md`
  - 失败尝试归档：`F2-GS-0001-attempt-2026-10-08T15-19-59-851Z`（案例 38/40 PASS；断言 21/24；退出码 1；SHA256SUMS 重算 84/85 通过；提交 `c69d4f1`；ADR-0002 §5（失败如实登记，留存于仓库））
  - 失败尝试归档：`F2-GS-0001-attempt-2026-10-08T15-21-16-354Z`（案例 39/40 PASS；断言 22/24；退出码 1；SHA256SUMS 重算 84/85 通过；提交 `98f9a8f`；ADR-0002 §5（失败如实登记，留存于仓库））

## F3-EB-0001（F-3）
- 义务：P3-S1-IMPL-AUTH-01 §2 / P2-EVIDENCE-8.1 §B：G2 动态跨契约一致性案例与故障链路 + G4 工程边界 EB-01…EB-16
- 结果：案例 21/21 PASS；断言 28/28；退出码 0；耗时 9012ms
- 代码绑定：gitHead `4b5f1d6`（workTreeClean=True），记录于 run-metadata.json code
- SHA256SUMS 独立重算：46/46 通过（全部精确通过）；清单含 summary.json=False、review/README.md=False
  - summary.json 不列入清单（F3 执行器改进）；46 项全部精确通过。
- 案例记录绑定说明：案例记录 evidence.traceSha256 绑定轨迹文件除末行 trace_completed 信封外的内容（执行器系统性行为，F1/F2/F3 一致；"除末行外"重算全部匹配）——已登记于 F-3 迭代记录 §3 独立审计发现。
- 产物提交：`64a1391`；审阅包：`artifacts/evidence/runs/F3-EB-0001/review/README.md`
  - 失败尝试归档：`F3-EB-0001-attempt-2026-10-08T16-06-20-267Z`（案例 11/21 PASS；断言 17/28；退出码 1；SHA256SUMS 重算 46/46 通过；提交 `4b5f1d6`；ADR-0002 §5（失败如实登记，留存于仓库））
  - 失败尝试归档：`F3-EB-0001-attempt-2026-10-08T16-07-30-452Z`（案例 21/21 PASS；断言 27/28；退出码 1；SHA256SUMS 重算 46/46 通过；提交 `0fe8011`；ADR-0002 §5（失败如实登记，留存于仓库））

## S2A-OBL-01-0001（S2a F-1 / OBL-01）
- 义务：P3-S2-IMPL-AUTH-01 §3(1) / CR-18 选项 B 登记 DEFERRED 项：OBL-01 HTTP 形态 LLM 故障 503 补测（P2 G5 遗留条件①解除）
- 结果：案例 7/7 PASS；断言 12/12；退出码 0；耗时 9042ms
- 代码绑定：gitHead `ed2d468`（workTreeClean=False——实施期未提交工作树如实记录，经独立评测人核对满足 E5 §3 记录要求）
- SHA256SUMS 独立重算：26/26 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：`7a03b40`；审阅包：`artifacts/evidence/runs/S2A-OBL-01-0001/review/README.md`
  - 失败尝试归档：`S2A-OBL-01-0001-attempt-2026-10-09T06-44-38-524Z`（案例 1/7 PASS；断言 6/12；退出码 1）；`S2A-OBL-01-0001-attempt-2026-10-09T06-45-57-265Z`（案例 6/7；断言 10/12；退出码 1）；`S2A-OBL-01-0001-attempt-2026-10-09T06-46-43-347Z`（案例 6/7；断言 10/12；退出码 1）（ADR-0002 §5，留存于仓库）

## S2A-F2-0001（S2a F-2 / G04 完整 Creation）
- 义务：P3-S2-IMPL-AUTH-01 §3(2)：G04 完整 Creation 语义——创作运行时 + 轴外子状态机 + 版本化补丁提交 + STOP 路径完成登记（policy_v1.2.0 / state_machine_v1.1.0）
- 结果：案例 10/10 PASS；断言 16/16；退出码 0；耗时 12861ms
- 代码绑定：gitHead `1fcadaf`（workTreeClean=False——实施期未提交工作树如实记录）
- SHA256SUMS 独立重算：22/22 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：`c2155df`；审阅包：`artifacts/evidence/runs/S2A-F2-0001/review/README.md`
  - 失败尝试归档：`S2A-F2-0001-attempt-2026-10-09T07-47-44-887Z`（案例 7/10 PASS；断言 12/16；退出码 1；ADR-0002 §5，留存于仓库）

## S2A-F3-0001（S2a F-3 / G07 完整 Correction）
- 义务：P3-S2-IMPL-AUTH-01 §3(3)：G07 完整 Correction 语义——MODIFY 用户面别名登记 + 纠正目标确定性派生 + 创作会话路由保护 + RESTORE_PREVIOUS_VERSION 恢复子型 + 纠正域事件词表（policy_v1.3.0 / state_machine_v1.2.0）
- 结果：案例 8/8 PASS；断言 15/15；退出码 0；耗时 14851ms
- 代码绑定：gitHead `3bae4d5`（workTreeClean=False——实施期未提交工作树如实记录）
- SHA256SUMS 独立重算：18/18 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：`9e7294a`；审阅包：`artifacts/evidence/runs/S2A-F3-0001/review/README.md`
  - 失败尝试归档：`S2A-F3-0001-attempt-2026-10-09T09-10-28-595Z`（案例 4/8 PASS；断言 11/15；退出码 1）；`S2A-F3-0001-attempt-2026-10-09T09-11-45-939Z`（案例 7/8；断言 14/15；退出码 1）（ADR-0002 §5，留存于仓库）

## S2A-F4-0001（S2a F-4 / WHAT_IF 完整分支）
- 义务：P3-S2-IMPL-AUTH-01 §3(4)：WHAT_IF 完整分支语义——多轮模拟持久化 + 四元分离事件登记（simulation_recorded）+ 轴外分支子状态机（分支记录五分量 + CREATE/SWITCH/ABANDON/RETURN 操作 + ACTIVE/RETURNED/ABANDONED 生命周期）
- 结果：案例 9/9 PASS；断言 16/16；退出码 0；耗时 15767ms（当前再生产物：语料裁决 S2-CORPUS-TAIL-RULING-01 选项 A 实施后域回归，运行于 policy_v2.0.0 / state_machine_v1.5.0——F-4 语义经 policy_v1.4.0 冻结、policy_v2.0.0 延续不变）
- 代码绑定：gitHead `44b7fa6`（workTreeClean=False——语料裁决实施期未提交工作树如实记录）
- SHA256SUMS 独立重算：20/20 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：当前状态 `f6763e5`（首次证据提交 `45abe78`——policy_v1.4.0 时代 9/9 案例、16/16 断言）；审阅包：`artifacts/evidence/runs/S2A-F4-0001/review/README.md`
  - 失败尝试归档：`S2A-F4-0001-attempt-2026-10-09T09-49-21-804Z`（案例 7/9 PASS；断言 14/16；退出码 1）；`S2A-F4-0001-attempt-2026-10-09T09-49-38-948Z`（案例 8/9；断言 15/16；退出码 1）；`S2A-F4-0001-attempt-2026-10-09T09-51-02-708Z`（案例 8/9；断言 15/16；退出码 1）；`S2A-F4-0001-attempt-2026-10-09T17-50-08-431Z`（案例 6/9；断言 13/16；退出码 1——**执行器侧缺陷**：执行器期望硬编码 policy_v1.4.0，而运行时自 S2b 实施 `65ea951` 起合法输出 policy_v2.0.0，致 A1/A7/A8 失败；产品运行时无缺陷（失败运行实际数据：内容逐字节等于语料、版本链单调、simulation_recorded ×2 同一分支、四元分离、分支快照 ACTIVE 全数成立）；执行器期望同步修复后重跑通过——迭代记录 P3-S2-CORPUS-ALIGN-ITER v1.0.0 §3）（ADR-0002 §5，留存于仓库）
  - 先前通过运行归档：`S2A-F4-0001-attempt-2026-10-09T17-37-26-969Z`（案例 9/9 PASS；断言 16/16；退出码 0——语料再生成前置归档，非失败尝试；只追加纪律留存）

## S2A-F5-0001（S2a F-5 / Minimal Memory）
- 义务：P3-S2-IMPL-AUTH-01 §3(5)：Minimal Memory——轴外记忆记录存储 + 四态生命周期（REMEMBERED/IN_USE/DECAYING/EXPIRED）+ 六操作（CREATE/RECALL/DECAY/EXPIRE/CORRECT/WITHDRAW）+ 跨会话短期持久 + 6 个月保留（衰减时钟）+ Runtime 单一写入者（policy_v1.5.0 / state_machine_v1.4.0）
- 结果：案例 9/9 PASS；断言 14/14；退出码 0；耗时 8121ms
- 代码绑定：run-metadata 以 runtimeFiles + git 节登记文件级哈希与 git 状态（无 code.gitHead 字段——S2a F-5 时代执行器形态）
- SHA256SUMS 独立重算：20/20 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：`1cc0083`；审阅包：`artifacts/evidence/runs/S2A-F5-0001/review/README.md`
  - 失败尝试归档：`S2A-F5-0001-attempt-2026-10-09T13-27-49-284Z`（案例 0/9 PASS；断言 5/14；退出码 1）；`S2A-F5-0001-attempt-2026-10-09T13-32-36-510Z`（案例 5/9；断言 10/14；退出码 1）（ADR-0002 §5，留存于仓库）

## S2B-0001（S2b 首批义务 G-1…G-4）
- 义务：P3-S2B-IMPL-AUTH-01：S2b 体验动作扩展首批义务——G-1 DEEPEN/SIMPLIFY/REFRAME 顶层语义动作（创作域顶层补丁操作承载）+ G-2 SEARCH 内部能力（searchExperienceContext 只读纯函数）+ G-3 First Experience 完整呈现 + G-4 动态证据 S2B-0001 + 黄金套件扩展 G09 方向性操作案例组（policy_v2.0.0 / state_machine_v1.5.0）
- 结果：案例 7/7 PASS；断言 14/14；退出码 0；耗时 9896ms
- 代码绑定：run-metadata 以文件级哈希登记代码绑定（42 个运行时/证据文件，无 code.gitHead 字段——S2b 时代执行器形态）
- SHA256SUMS 独立重算：16/16 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：`434142f`；审阅包：`artifacts/evidence/runs/S2B-0001/review/README.md`（**2026-10-09 角色 5 独立评测人审阅结论：PASS——S2b 独立评测关闭，G-4 关闭；审阅包为治理文档，不列入 SHA256SUMS，随治理提交 `b4c1cc2` 冻结**）
  - 失败尝试归档：`S2B-0001-attempt-2026-10-09T15-17-14-442Z`（案例 6/7 PASS；断言 11/14；退出码 1——执行器侧案例预期缺陷，产品源码无缺陷；ADR-0002 §5，留存于仓库）

## G3-GOLDEN-0001（G3 黄金套件回归）
- 义务：黄金套件回归（G3 Gate 证据基线）：36 案例（含 S2b G09 方向性操作四维度案例组）——语料裁决 S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A 实施后再生产（模拟语料 fixtureId `synthetic/simulate/v2`，SHA256 `dfa4045bb0457267f53b7f320472d55afd5b00635cf8366e8449b8aa793bc58a`）
- 结果：案例 36/36 PASS；断言 10/10（A1–A10）；退出码 0；耗时 19855ms
- 代码绑定：gitHead `44b7fa6`（workTreeClean=False——语料裁决实施期未提交工作树如实记录）
- SHA256SUMS 独立重算：74/74 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：当前状态 `f6763e5`（36 案例扩展形态首次提交 `849c0fc`——G09 案例组纳入）；审阅包：`artifacts/evidence/runs/G3-GOLDEN-0001/review/README.md`
- 说明：本运行为黄金套件回归基线，非 Gate 判定证据（E5 §2：退出码 0 不设置任何 Gate 为 PASS；G3 Gate 判定经角色 5 独立评测人裁决——P2-G3-WORKSHEET-01 v1.0.0，2026-10-09 PASS）
  - 失败尝试归档（4）：`G3-GOLDEN-0001-attempt-2026-10-09T03-39-36-322Z`（案例 18/23 PASS；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-09T12-57-51-194Z`（案例 29/32；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-09T14-57-52-489Z`（案例 35/36；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-09T14-58-52-514Z`（案例 35/36；断言 8/10；退出码 1）（ADR-0002 §5，留存于仓库）
  - 先前通过运行归档（12，再生成前置归档——非失败尝试，只追加纪律留存）：`04-37-02-222Z`（20/23 案例、10/10 断言）、`07-23-42-361Z` / `07-26-46-098Z` / `07-39-01-294Z` / `08-06-40-720Z` / `08-46-45-835Z` / `09-35-23-291Z` / `09-54-12-711Z` / `12-52-28-861Z` / `13-32-11-467Z` / `14-48-51-128Z`（各 32/32 案例、10/10 断言）、`17-36-20-924Z`（36/36 案例、10/10 断言——语料 v1 尾句时代 36 案例形态）
  - 归档哈希注记：`03-39-36-322Z` / `04-37-02-222Z` / `07-23-42-361Z` 三个归档各 1 项 summary.json 时点性不符（列入清单后定稿——与 F1/F2 同类系统性行为；实质内容经交叉核验为真：案例计数与 cases/ 目录一致；其余各项精确通过）

## 审计说明

- 全部运行均为合成数据；无真实 LLM 提供方调用；无真实用户数据（隐私六要素批准前禁收护栏持续生效）。
- F1/F2 的 summary.json 列入其 SHA256SUMS 但在清单计算之后才定稿（各 1 项声明哈希不符，实质内容经交叉核验为真）；F3 执行器已改进（summary.json 不列入清单）。
- 案例记录 evidence.traceSha256 绑定轨迹文件除末行 trace_completed 信封外的内容（三迭代系统性行为，"除末行外"重算全部匹配）；完整产物核验以各运行 SHA256SUMS 为准。
- v1.3.0 追加登记：G3-GOLDEN-0001 三个尝试归档（`03-39-36-322Z` / `04-37-02-222Z` / `07-23-42-361Z`）各 1 项 summary.json 时点性不符（列入清单后在清单计算之后才定稿——与 F1/F2 同类系统性行为，非篡改；实质内容经交叉核验为真：案例计数与 cases/ 目录一致，其余各项精确通过）。S2 时代其余 27 个尝试归档与全部 7 个现行运行目录 SHA256SUMS 独立重算全部精确通过。
- 本清单不产生任何 Gate 结论。P2 时代 G5 16 项评测包已于 2026-10-09 完成（PASSED 无条件——P3-S1-G5-WORKSHEET-01 v1.8.0）；S2 时代 G5 评测包 NOT RUN（范围定义提案 S2-G5-EVAL-DEF-01 v0.1.0 staged 待产品负责人裁决——独立评测人：用户本人，角色 5，PD-15）。

## 重跑复现验证（2026-10-08，manifest v1.2.0）

- 协议：临时 git worktree（HEAD `24c71ef`）+ Node v24.21.0（F-2 授权日锁定 LTS）；依赖以硬链接实文件就位（Next.js/turbopack 拒绝 workspace root 外的符号链接依赖）；每轮执行器运行前恢复工作树至干净态。
- 结果：已提交执行器重跑复现全部通过——F1-E2E-0001 9/9 案例 + 12/12 断言 exit 0；F2-GS-0001 40/40 + 24/24 exit 0；F3-EB-0001 21/21 + 28/28 exit 0（F3 dry-run 绑定 gitHead=`24c71ef`、workTreeClean=true，如实记录 dry-run 实际 HEAD）。
- 中间失败轮次（如实登记）：顺序执行的前两轮 F2/F3 中 A23/B27（干净工作树绑定）失败——上一轮 dry-run 产物使工作树变脏；此为绑定断言按设计工作的演示（同 F3 尝试 2 的 B27 检测机制）。按干净树协议重跑后全部通过。
- 日志：`repro-logs/`（f1-dryrun.log 通过；f2-dryrun.log A23 失败；f2-dryrun2.log 通过；f3-dryrun.log B27 失败；f3-dryrun2.log 通过）。
- 范围：dry-run 产物仅存于临时 worktree（已清理），不进入证据链、不修改已提交证据；本验证不产生任何 Gate 结论。
- 补充（manifest v1.2.0）：E5-TRIAL-0001 试运行执行器（`tools/evidence/src/trial.mjs`）dry-run 通过——4/4 案例 + 6/6 持久化断言（A1/A2a/A2b/A3/A4/A6）exit 0，与已提交 summary.json 逐字段一致；A7/A8 未持久化特征同样复现（系统性行为确认）。dry-run 清单 12 项 vs 已提交 11 项：dry-run 运行于预置目录，`logs/trial-run.log` 在清单计算时已存在并被登记、其后步骤 5 覆写——1 项声明哈希不符（与 F1/F2 summary.json 时序项同类）；原运行日志在清单时刻尚不存在故为 11 项无不符。日志：`repro-logs/trial-dryrun.log`。

## S2 时代运行追加（2026-10-09，manifest v1.3.0）

- 范围：S2 时代证据运行 7 项（S2A-OBL-01-0001 / S2A-F2-0001 / S2A-F3-0001 / S2A-F4-0001 / S2A-F5-0001 / S2B-0001 / G3-GOLDEN-0001 当前再生产物状态）——S2 时代 G5 评测第 15 项（Evidence Index）输入。
- 方法：与 v1.0.0 一致——每运行 summary.json 计数、SHA256SUMS 逐项独立重算（含全部 30 个尝试归档）、run-metadata 代码绑定核验；7 运行全部精确通过；30 个尝试归档中 27 个全部精确通过、3 个各 1 项 summary.json 时点性不符（与 F1/F2 同类——执行器写入顺序，实质内容经交叉核验为真）。
- S2A-F4-0001 注记：当前再生产物为语料裁决（CR-25）实施后域回归；失败尝试 `S2A-F4-0001-attempt-2026-10-09T17-50-08-431Z` 为执行器侧过期期望（policy_v1.4.0）缺陷，产品运行时无缺陷——根因分析与修复登记于迭代记录 P3-S2-CORPUS-ALIGN-ITER v1.0.0 §3。
- 本追加不改变 v1.2.0 及以前已评测内容（git 历史可查）；不产生任何 Gate 结论。
