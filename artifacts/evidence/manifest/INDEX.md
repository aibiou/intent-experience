# 证据运行包索引（EVIDENCE-MANIFEST-01）

**版本：** 1.5.0（2026-10-10：S3 实施（CR-28 D-1…D-5 全项 A——S3a 核心能力（长期记忆启用 + 跨会话分支持久化）+ S3b 暴露层（HTTP API 面扩展）；产品提交 `f8b374f` / 执行器提交 `87681c3` / 执行器元数据校正 `e6780c8`）后证据登记——黄金套件扩展 G11 长期记忆案例组 + G12 跨会话分支持久化案例组（G3-GOLDEN-0001 再生 48/48 案例、10/10 断言，SHA256SUMS 98 项独立重算全部精确通过）；S2A-F5-0001 再生（14/14 案例、19/19 断言——S2 时代负向不变式经 CR-28 D-1/D-2 选项 A 裁决取代，案例 9→14、断言 12→19，30 项）；S2A-F4-0001 再生（10/10 案例、17/17 断言——跨会话分支持久化回归扩展，22 项）；S2B-0001 重跑（7/7 案例、14/14 断言——黄金回归绑定新基线 policy_v2.2.0 / 48 案例，16 项）；S3-API-0001 首次执行（新运行——8/8 案例、13/13 断言——HTTP 执行形态 + 只读观测路由，18 项）；五运行退出码 0、SHA256SUMS 独立重算全部精确通过（98/30/22/16/18 项）；尝试归档新增 12 个（失败尝试 5 个 + FATAL 部分产物 1 个 + 先前通过运行前置归档 6 个——全部失败均为执行器侧案例断言 / 基线 / 元数据缺陷，产品运行时零缺陷；缺陷分类与根因分析：P3-S3-IMPL-ITER v1.0.0 §3）；S2B-0001 另有 FATAL 1 次（黄金回归绑定基线陈旧——先于运行目录创建无运行产物，经迭代记录 §3 登记）；尝试归档总数 53；v1.4.0 及以前内容保持原样，git 历史可查）**版本：** 1.4.0（2026-10-10：S2 分支回流（ADOPT_BRANCH 显式回流操作——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A，policy_v2.1.0 变更 1–5；产品提交 `728b3de` / 执行器提交 `a7077ce`）实施后 S2 时代 3 运行再生产物登记——S2A-F4-0001 重跑（10/10 案例、17/17 断言——新增 BRANCH-ADOPT 案例）、G3-GOLDEN-0001 再生（40/40 案例——新增 G10 分支回流案例组 N/NEG/B/FR）、S2B-0001 重跑（7/7 案例、14/14 断言——黄金回归绑定新基线 40/40）；3 运行退出码 0、SHA256SUMS 独立重算全部精确通过；尝试归档新增 5 个（先前通过运行前置归档 3 个 + 失败尝试 2 个——均为执行器侧案例断言缺陷，产品运行时无缺陷），新增 5 个归档 SHA256SUMS 独立重算全部精确通过；尝试归档总数 41；全部产物经证据提交 `0a4be6d` 入库；v1.0.0/v1.2.0/v1.3.0 内容保持原样，git 历史可查）
生成：2026-10-08T16:35:08.546081Z（v1.0.0，工程负责人角色，代理）；v1.3.0 追加生成 2026-10-09（工程负责人角色，代理）；v1.4.0 再生生成 2026-10-10（工程负责人角色，代理）
依据：E5 计划 §7 只追加布局；G5 第 15 项（Evidence Index）输入。方法：独立重算（不信任执行器自报断言）。
**退出码 0 / 案例 PASS 只表示本运行中的断言通过；不设置任何 Gate 为 PASS。P2 时代 G5 16 项评测包已于 2026-10-09 完成（PASSED 无条件——P3-S1-G5-WORKSHEET-01 v1.8.0）；S2 时代 G5 独立评测 NOT RUN（范围定义 S2-G5-EVAL-DEF-01 v1.0.0 已经产品负责人 2026-10-09 裁决选项 A——复用 16 项框架对 S2 证据执行独立评测，CR-26 STAGED→RULED；评测工作表 P3-S2-G5-WORKSHEET-01 v0.1.0 新建，16 项骨架结论列全部 NOT RUN，待角色 5 逐项裁决签署——独立评测人：用户本人，角色 5，PD-15；实现作者不得兼任独立评测人）。**

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
- 义务：P3-S2-IMPL-AUTH-01 §3(4)：WHAT_IF 完整分支语义——多轮模拟持久化 + 四元分离事件登记（simulation_recorded）+ 轴外分支子状态机（分支记录五分量 + CREATE/SWITCH/ABANDON/RETURN 操作 + ACTIVE/RETURNED/ABANDONED 生命周期）+ S2 分支回流扩展：ADOPT_BRANCH 显式回流操作（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A——第五分支操作，词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH；分支记录附加 adopted 标记幂等、生命周期契约不变；simulation_adopted 事件登记，properties 含 branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact；采纳结果呈新一轮模拟上下文、主线当前上下文不变；确定性系统回合 llm_used=false、reasonPrimary=explicit_user_direction）（F-4 语义冻结于 policy_v1.4.0 §3 变更 1/2，经 policy_v2.0.0 / policy_v2.1.0 延续；本再生产物运行于 policy_v2.1.0 / state_machine_v1.5.0）
- 结果：案例 10/10 PASS；断言 17/17；退出码 0；耗时 17515ms（当前再生产物：S3 回归扩展 + 执行器元数据校正后再生成——INPROC-REGRESSION 跨会话持久化验证（S2 时代 D-04 失效不变式经 CR-28 D-2 选项 A 取代），运行于 policy_v2.2.0 / state_machine_v1.5.0——F-4 语义经 policy_v1.4.0 冻结、经 policy_v2.0.0 / policy_v2.1.0 / policy_v2.2.0 延续不变；黄金回归基线链补记 S3a 再生成基线 48/48（G11 长期记忆案例组并入）——历史绑定链 32/32 → 36/36 → 40/40 → 48/48 完整在录）
- 代码绑定：gitHead `e6780c8`（workTreeClean=False——执行器元数据校正后未提交工作树如实记录：再生产物 bed768d 内容当时未提交，uncommittedEntries 经 run-metadata.json code 登记；其后经 bed768d 提交入库；历史绑定 gitHead `76c1605`（S2 分支回流实施期，uncommittedEntries 32 项）经 v1.4.0 登记在录，git 历史可查）
- SHA256SUMS 独立重算：22/22 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：当前状态 `bed768d`（首次证据提交 `45abe78`——policy_v1.4.0 时代 9/9 案例、16/16 断言；中间再生产物 `f6763e5`——语料裁决 S2-CORPUS-TAIL-RULING-01 选项 A 实施后回归 9/9 案例、16/16 断言；v1.4.0 再生产物 `0a4be6d`——S2 分支回流后域回归 10/10 案例、17/17 断言）；审阅包：`artifacts/evidence/runs/S2A-F4-0001/review/README.md`
  - 失败尝试归档：`S2A-F4-0001-attempt-2026-10-09T09-49-21-804Z`（案例 7/9 PASS；断言 14/16；退出码 1）；`S2A-F4-0001-attempt-2026-10-09T09-49-38-948Z`（案例 8/9；断言 15/16；退出码 1）；`S2A-F4-0001-attempt-2026-10-09T09-51-02-708Z`（案例 8/9；断言 15/16；退出码 1）；`S2A-F4-0001-attempt-2026-10-09T17-50-08-431Z`（案例 6/9；断言 13/16；退出码 1——**执行器侧缺陷**：执行器期望硬编码 policy_v1.4.0，而运行时自 S2b 实施 `65ea951` 起合法输出 policy_v2.0.0，致 A1/A7/A8 失败；产品运行时无缺陷（失败运行实际数据：内容逐字节等于语料、版本链单调、simulation_recorded ×2 同一分支、四元分离、分支快照 ACTIVE 全数成立）；执行器期望同步修复后重跑通过——迭代记录 P3-S2-CORPUS-ALIGN-ITER v1.0.0 §3）；`S2A-F4-0001-attempt-2026-10-10T00-36-33-645Z`（案例 9/10 PASS；断言 16/17；退出码 1——**执行器侧缺陷**：A10 BRANCH-ADOPT 案例断言失败——执行器通过谓词期望 2 条 ADOPT_BRANCH 决策轨迹，实际 3 条（负向拒绝轮 reasonSecondary 亦含 ADOPT_BRANCH 字样——拒绝轮 reasonPrimary=invalid_state_transition）；产品运行时行为经逐字段核验符合 S2-BRANCH-REFLOW-DEF-01 v1.0.0 冻结定义（adopted 附加标记、生命周期不变、主线当前上下文不变、simulation_adopted ×1 属性齐备、拒绝轮零版本消耗、终态 v12），无产品缺陷；执行器谓词修正后重跑通过——迭代记录 P3-S2-IMPL-ITER-ADOPT v1.0.0 §3）（ADR-0002 §5，留存于仓库）
  - 先前通过运行归档：`S2A-F4-0001-attempt-2026-10-09T17-37-26-969Z`（案例 9/9 PASS；断言 16/16；退出码 0——语料再生成前置归档，非失败尝试；只追加纪律留存）；`S2A-F4-0001-attempt-2026-10-10T00-33-01-157Z`（案例 9/9 PASS；断言 16/16；退出码 0——S2 分支回流再生成前置归档（语料裁决实施后通过运行），非失败尝试；只追加纪律留存）；`S2A-F4-0001-attempt-2026-10-10T04-43-27-487Z`（案例 10/10 PASS；断言 17/17；退出码 0——S3 回归重跑前置归档（ADOPT 时代通过运行），非失败尝试；只追加纪律留存）；`S2A-F4-0001-attempt-2026-10-10T05-23-28-507Z`（案例 10/10 PASS；断言 17/17；退出码 0——执行器元数据校正（黄金回归基线链补记 48/48）后重跑前置归档，非失败尝试；只追加纪律留存）

## S2A-F5-0001（S2a F-5 / Minimal Memory）
- 义务：P3-S2-IMPL-AUTH-01 §3(5)：Minimal Memory——轴外记忆记录存储 + 四态生命周期（REMEMBERED/IN_USE/DECAYING/EXPIRED）+ 六操作（CREATE/RECALL/DECAY/EXPIRE/CORRECT/WITHDRAW）+ 跨会话短期持久 + 6 个月保留（衰减时钟）+ Runtime 单一写入者（policy_v1.5.0 / state_machine_v1.4.0）；S3 回归扩展（S3A-SEMANTIC-FREEZE-01 v1.0.0 长期记忆启用 + S3B-SEMANTIC-FREEZE-01 v1.0.0 跨会话分支持久化——S2 时代负向不变式 SESSION-SCOPED-NEG / LONGTERM-DISABLED 经 CR-28 D-1/D-2 选项 A 裁决取代，案例 9→14、断言 12→19——P3-S3-IMPL-ITER v1.0.0）
- 结果：案例 14/14 PASS；断言 19/19；退出码 0；耗时 9905ms（当前再生产物：S3 回归扩展 + 执行器元数据校正后再生成——新增 LT-EXPLICIT-A / LT-REMEMBER-B / LT-BARE-NEG / LT-CANDIDATE-C / LT-GATE-NEG 长期记忆案例组；运行于 policy_v2.2.0 / state_machine_v1.5.0——版本矩阵记录现行状态机版本（轴外记忆子状态机契约化冻结于 state_machine_v1.4.0 §4 变更 1，延续不变——provenance 注记承载，A18 断言描述同步）；黄金回归基线字符串同步 G3-GOLDEN-0001 48/48）
- 代码绑定：run-metadata 以 runtimeFiles + git 节登记文件级哈希与 git 状态（git 节：commit `5af5592`、workTreeClean=False——S3 实施期未提交工作树如实记录：产品提交 f8b374f / 执行器提交 87681c3 内容当时未提交；其后经 f8b374f / 87681c3 / 2b2bbf5 提交入库；无 code.gitHead 字段——S2a F-5 时代执行器形态）
- SHA256SUMS 独立重算：30/30 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：当前状态 `bed768d`（首次证据提交 `1cc0083`——policy_v1.5.0 时代 9/9 案例、14/14 断言；中间再生产物 `2b2bbf5`——S3 回归扩展后 14/14 案例、19/19 断言）；审阅包：`artifacts/evidence/runs/S2A-F5-0001/review/README.md`
  - 失败尝试归档：`S2A-F5-0001-attempt-2026-10-09T13-27-49-284Z`（案例 0/9 PASS；断言 5/14；退出码 1）；`S2A-F5-0001-attempt-2026-10-09T13-32-36-510Z`（案例 5/9；断言 10/14；退出码 1）；`S2A-F5-0001-attempt-2026-10-10T04-36-38-550Z`（案例 7/9 PASS；断言 12/14；退出码 1——**执行器侧负向不变式陈旧**：SESSION-SCOPED-NEG / LONGTERM-DISABLED 两案例为 S2 时代负向不变式，经 CR-28 D-1/D-2 选项 A 裁决（2026-10-10）取代，S3a/S3b 语义启用后两不变式反转；产品运行时无缺陷；案例组替换后重跑——P3-S3-IMPL-ITER v1.0.0 §3）；`S2A-F5-0001-attempt-2026-10-10T04-41-45-293Z`（**FATAL**——ENOENT：执行器侧 run-metadata 运行时文件清单路径构造附中文描述串，先于 summary.json / SHA256SUMS / run-metadata.json 写入；部分产物留存——案例记录 14 份（含 3 FAIL：BRANCH-PERSISTENCE TypeError adopt.submission.header / LT-EXPLICIT-A / LT-REMEMBER-B recognition_path 描述串——通过条件本身正确）/ 轨迹 / 日志；无汇总与清单产物；FATAL 事实经迭代记录 §3 登记）；`S2A-F5-0001-attempt-2026-10-10T04-43-10-669Z`（案例 13/14 PASS；断言 18/19；退出码 1——**执行器侧取证时序缺陷**（同 G12-FR 模式）：stateVersionUnchanged 实际值在重试提交后采集，观测到版本已推进；语义要求拒绝后立即取证（拒绝先于任何写入——版本不变）；修复后重跑——P3-S3-IMPL-ITER v1.0.0 §3）（ADR-0002 §5，留存于仓库）
  - 先前通过运行归档：`S2A-F5-0001-attempt-2026-10-10T05-22-28-693Z`（案例 14/14 PASS；断言 19/19；退出码 0——执行器元数据校正（版本矩阵现行口径 state_machine_v1.5.0 + 黄金基线字符串 48/48）后重跑前置归档，非失败尝试；只追加纪律留存）

## S2B-0001（S2b 首批义务 G-1…G-4）
- 义务：P3-S2B-IMPL-AUTH-01：S2b 体验动作扩展首批义务——G-1 DEEPEN/SIMPLIFY/REFRAME 顶层语义动作（创作域顶层补丁操作承载）+ G-2 SEARCH 内部能力（searchExperienceContext 只读纯函数）+ G-3 First Experience 完整呈现 + G-4 动态证据 S2B-0001 + 黄金套件扩展 G09 方向性操作案例组（policy_v2.0.0 变更 1–6 经 policy_v2.1.0 / policy_v2.2.0 延续 + S2 分支回流变更 1–5 正交；本再生产物运行于 policy_v2.2.0 / state_machine_v1.5.0——黄金回归绑定新基线 G3-GOLDEN-0001 48/48 案例）
- 结果：案例 7/7 PASS；断言 14/14；退出码 0；耗时 10733ms（当前再生产物：S3 回归重跑——黄金回归绑定新基线 G3-GOLDEN-0001 48/48 案例 @ policy_v2.2.0 / state_machine_v1.5.0（S3a 迭代后回归基线）；policy_v2.2.0 恒等映射经 policy_v2.2.0 延续；S2b 语义动作 / SEARCH 能力 / First Experience 呈现 / 优先级链行为零碰撞）
- 代码绑定：run-metadata 以文件级哈希登记代码绑定（无 code.gitHead 字段——S2b 时代执行器形态）；本再生产物重跑于 S3 实施后未提交工作树（产品提交 f8b374f / 执行器提交 87681c3 内容当时未提交——run-metadata 文件级哈希如实登记；其后经 f8b374f / 87681c3 / 2b2bbf5 提交入库）
- SHA256SUMS 独立重算：16/16 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：当前状态 `2b2bbf5`（首次证据提交 `434142f`——policy_v2.0.0 时代 7/7 案例、14/14 断言；中间再生产物 `0a4be6d`——S2 分支回流后重跑 7/7 案例、14/14 断言）；审阅包：`artifacts/evidence/runs/S2B-0001/review/README.md`（**2026-10-09 角色 5 独立评测人审阅结论：PASS——S2b 独立评测关闭，G-4 关闭；审阅包为治理文档，不列入 SHA256SUMS，随治理提交 `b4c1cc2` 冻结**）
  - 失败尝试归档：`S2B-0001-attempt-2026-10-09T15-17-14-442Z`（案例 6/7 PASS；断言 11/14；退出码 1——执行器侧案例预期缺陷，产品源码无缺陷；ADR-0002 §5，留存于仓库）；**FATAL（2026-10-10T04:56 前，无归档——先于运行目录创建）**：黄金回归绑定失败——执行器侧基线陈旧（A11 绑定检查冻结于 ADOPT 迭代基线"须在 policy_v2.1.0 / state_machine_v1.5.0 通过（40/40）"，而黄金套件经 S3a 迭代已升 policy_v2.2.0 / 48 案例——绑定基线未随黄金套件版本化变更新同步）；无运行产物可归档；FATAL 事实经迭代记录 P3-S3-IMPL-ITER v1.0.0 §3 如实登记（ADR-0002 §5）；修复（绑定检查同步 policy_v2.2.0 / 48 案例 + 断言值 / 版本矩阵 / carriedForward 文本 15 处同步）后重跑
  - 先前通过运行归档：`S2B-0001-attempt-2026-10-10T00-39-21-950Z`（案例 7/7 PASS；断言 14/14；退出码 0——S2 分支回流重跑前置归档（policy_v2.0.0 时代通过运行），非失败尝试；只追加纪律留存）；`S2B-0001-attempt-2026-10-10T04-56-27-942Z`（案例 7/7 PASS；断言 14/14；退出码 0——S3 回归重跑前置归档（ADOPT 时代通过运行），非失败尝试；只追加纪律留存）

## G3-GOLDEN-0001（G3 黄金套件回归）
- 义务：黄金套件回归（G3 Gate 证据基线）：48 案例（G01–G12 各 NORMAL/NEGATIVE/BOUNDARY/FAILURE_RECOVERY 四维度——含 S2b G09 方向性操作案例组、S2 G10 分支回流案例组与 S3 G11 长期记忆案例组 / G12 跨会话分支持久化案例组）——语料裁决 S2-CORPUS-TAIL-RULING-01 v1.0.0 选项 A 实施后再生产（模拟语料 fixtureId `synthetic/simulate/v2`，SHA256 `dfa4045bb0457267f53b7f320472d55afd5b00635cf8366e8449b8aa793bc58a`）；G10 案例组依据 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 冻结定义（policy_v2.1.0 变更 1–5）；G11/G12 案例组依据 S3A / S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结定义（policy_v2.2.0 变更 1–4 / 3–4）
- 结果：案例 48/48 PASS；断言 10/10（A1–A10）；退出码 0；耗时 29295ms（当前再生产物：S3a 迭代后再生成——新增 G11 长期记忆案例组 + G12 跨会话分支持久化案例组（N/NEG/B/FR），运行于 policy_v2.2.0 / state_machine_v1.5.0）
- 代码绑定：gitHead `5af5592`（workTreeClean=False——S3 实施期未提交工作树如实记录：产品提交 f8b374f / 执行器提交 87681c3 内容当时未提交，uncommittedEntries 经 run-metadata.json code 登记；其后经 f8b374f / 87681c3 / 2b2bbf5 提交入库，经独立评测人核对满足 E5 §3 记录要求；历史绑定 gitHead `76c1605`（S2 分支回流实施期，uncommittedEntries 118 项）经 v1.4.0 登记在录）
- SHA256SUMS 独立重算：98/98 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：当前状态 `2b2bbf5`（40 案例形态首次提交 `849c0fc`——G09 案例组纳入；36 案例再生产物 `f6763e5`——语料 v2 尾句对齐；40 案例再生产物 `0a4be6d`——G10 分支回流案例组纳入）；审阅包：`artifacts/evidence/runs/G3-GOLDEN-0001/review/README.md`
- 说明：本运行为黄金套件回归基线，非 Gate 判定证据（E5 §2：退出码 0 不设置任何 Gate 为 PASS；G3 Gate 判定经角色 5 独立评测人裁决——P2-G3-WORKSHEET-01 v1.0.0，2026-10-09 PASS）
  - 失败尝试归档（8）：`G3-GOLDEN-0001-attempt-2026-10-09T03-39-36-322Z`（案例 18/23 PASS；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-09T12-57-51-194Z`（案例 29/32；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-09T14-57-52-489Z`（案例 35/36；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-09T14-58-52-514Z`（案例 35/36；断言 8/10；退出码 1）；`G3-GOLDEN-0001-attempt-2026-10-10T00-38-52-586Z`（案例 37/40 PASS；断言 8/10；退出码 1——**执行器侧缺陷**：G10-N / G10-NEG / G10-FR 三案例失败，三类案例编写缺陷（①G10-N 误断言迁移提交时视图的 state_version 与头状态——迁移提交时视图为 7 / ACTIVE/SIMULATION，结算后定居 8 / WAITING/SIMULATION，13 §15.3；②G10-NEG 引用 golden.mjs 不存在的 jsonEquals 辅助——ReferenceError；③G10-FR 引用未导入绑定名 create——实际导入名 createFixture，TypeError）；产品运行时无缺陷，案例断言修复后重跑 40/40 通过——迭代记录 P3-S2-IMPL-ITER-ADOPT v1.0.0 §3）；`G3-GOLDEN-0001-attempt-2026-10-10T04-43-51-277Z`（案例 34/40 PASS；断言 8/10；退出码 1——**执行器侧案例预期缺陷**（产品运行时无缺陷）：G04-N / G07-N / G09-N / G10-N / G10-B / G10-FR 六案例通过条件仍断言 policy_v2.1.0（冻结于 ADOPT 迭代），而产品经 S3a 实施已升 policy_v2.2.0——期望未随版本化变更同步；修复（期望同步 policy_v2.2.0 + G11/G12 案例组并入后案例 40→48）后重跑——P3-S3-IMPL-ITER v1.0.0 §3）；`G3-GOLDEN-0001-attempt-2026-10-10T04-47-42-104Z`（案例 44/48 PASS；断言 8/10；退出码 1——**执行器侧案例预期缺陷**：G11-N / G12-N / G12-NEG / G12-FR 四案例——G11-N recognition_path 期望写 explicit_a（产品发射 explicit_preference——A 类偏好词直接命中形态）；G12 组 setupChain 复用固定默认 requestId 触发请求幂等拒绝（REQUEST_DUPLICATE——request-id 幂等为产品正确行为，执行器多 setupChain 调用须显式区分 id）；修复后重跑——P3-S3-IMPL-ITER v1.0.0 §3）；`G3-GOLDEN-0001-attempt-2026-10-10T04-48-35-438Z`（案例 47/48 PASS；断言 8/10；退出码 1——**执行器侧取证时序缺陷**：G12-FR——branchAdoptedAfterStale 实际值在对象构造时（重试采用成功之后）才采集，观测到 adopted=true；G12-FR 语义要求"拒绝后立即取证"（拒绝先于任何写入——adopted 保持 false，后续重试为合法采用）；修复（拒绝提交后立即采集 simulationAfterStale 快照并引用该常量）后重跑——P3-S3-IMPL-ITER v1.0.0 §3）（ADR-0002 §5，留存于仓库）
  - 先前通过运行归档（14，再生成前置归档——非失败尝试，只追加纪律留存）：`04-37-02-222Z`（20/23 案例、10/10 断言）、`07-23-42-361Z` / `07-26-46-098Z` / `07-39-01-294Z` / `08-06-40-720Z` / `08-46-45-835Z` / `09-35-23-291Z` / `09-54-12-711Z` / `12-52-28-861Z` / `13-32-11-467Z` / `14-48-51-128Z`（各 32/32 案例、10/10 断言）、`17-36-20-924Z`（36/36 案例、10/10 断言——语料 v1 尾句时代 36 案例形态）、`00-37-18-438Z`（36/36 案例、10/10 断言——S2 分支回流再生成前置归档（语料 v2 尾句时代 36 案例形态））、`03-51-03-660Z`（40/40 案例、10/10 断言——S3a 扩维（G11/G12 案例组并入）前最后一次全绿运行（ADOPT 时代 40 案例基线），前置归档）
  - 归档哈希注记：`03-39-36-322Z` / `04-37-02-222Z` / `07-23-42-361Z` 三个归档各 1 项 summary.json 时点性不符（列入清单后定稿——与 F1/F2 同类系统性行为；实质内容经交叉核验为真：案例计数与 cases/ 目录一致；其余各项精确通过）

## S3-API-0001（S3b 暴露层 / HTTP API 面扩展）
- 义务：S3-SCOPE-PROPOSAL-01 v1.0.0 RULED §4 动态证据计划——D-3 选项 A：既有端点 semanticAction 枚举扩展（纯暴露层——同一 ExperienceRuntime 单例，不改变任何运行时语义）；S3A/S3B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本实施（S3B-SEMANTIC-FREEZE-01 §4 变更 1–2——暴露层纪律：会话上下文三要素（request_id + session_id + user_input 均非空字符串）齐备 → S2/S3 执行形态（真实运行路径——HTTP 服务器经同一 getServerRuntime 单例）；三要素不齐备 → S1 fixture 形态（semanticAction 直送——向后兼容，行为不变）；执行形态路由：experience_id + state_version 齐备 → 既有体验直接提交（含跨会话分支操作——会话绑定放宽仅限分支操作路径，运行时内校验 S3B §1.4 三前提）；缺省 → resolveIntent（记忆操作 → NDJSON 单行结果 + done；升级 → 400 INVALID_ACTION；start_experience → startExperience + submitExperienceEvent → NDJSON 流）；错误语义 400 INVALID_ACTION / 400 INVALID_REQUEST（experience/session mismatch——内容轮保持严格会话绑定）/ STATE_VERSION_CONFLICT（retryable=false——不覆盖、不消耗版本，S1-12 同族）；只读观测路由 GET /api/memory + GET /api/experience/{id}/simulation（Query 与 Command 分离——只读不改变任何状态）
- 结果：案例 8/8 PASS；断言 13/13（A1–A13）；退出码 0；耗时 7923ms（首次执行——HTTP 执行形态 + 只读观测路由；首次通过运行经执行器侧描述串修正（A2 断言描述与审阅包文本 recognition_path=explicit_a → 产品实际发射 explicit_preference——A 类偏好词直接命中形态）后按 ADR-0002 §5 前置归档重跑）
- 代码绑定：run-metadata 以 git 节登记绑定（commit `5af5592`，workTreeClean=False——执行形态 HTTP 取证：真实 HTTP 服务器经同一 getServerRuntime 单例）+ API 路由清单（api_v1.0.0 / C5——POST /api/session/start、POST /api/intent/resolve、POST /api/experience/start、GET /api/experience/{id}/state、POST /api/experience/{id}/event、POST /api/experience/{id}/stream（S2/S3 执行形态——三要素请求经真实运行路径）、GET /api/memory（新增——只读观测）、GET /api/experience/{id}/simulation（新增——只读观测））+ 静态边界发现（静态边界断言读取已提交产品源码字节——不做代码推断只验证事实：executionFormDetection / runtimeInjection / s1FormPreserved / serverRuntimeSingleton 四项成立）+ 源文件级哈希（6 文件——src/experience/http.ts、src/experience/runtime.ts、src/experience/server-runtime.ts、app/api/experience/stream/route.ts、app/api/memory/route.ts、app/api/experience/[experienceId]/simulation/route.ts）
- SHA256SUMS 独立重算：18/18 通过（全部精确通过）；清单含 summary.json=True、review/README.md=False
- 产物提交：`2b2bbf5`；审阅包：`artifacts/evidence/runs/S3-API-0001/review/README.md`
  - 先前通过运行归档（1，再生产物前置归档——非失败尝试，只追加纪律留存）：`S3-API-0001-attempt-2026-10-10T04-58-31-883Z`（案例 8/8 PASS；断言 13/13；退出码 0——首次执行通过运行 04:57:26→04:57:34（耗时 7956ms）——通过条件全部正确；执行器侧描述串缺陷（A2 断言描述文本与审阅包文本写 recognition_path=explicit_a，产品实际发射 explicit_preference——描述串与产品行为不符，非行为缺陷）；描述串修正后按 ADR-0002 §5 前置归档重跑）

## 审计说明

- 全部运行均为合成数据；无真实 LLM 提供方调用；无真实用户数据（隐私六要素批准前禁收护栏持续生效）。
- F1/F2 的 summary.json 列入其 SHA256SUMS 但在清单计算之后才定稿（各 1 项声明哈希不符，实质内容经交叉核验为真）；F3 执行器已改进（summary.json 不列入清单）。
- 案例记录 evidence.traceSha256 绑定轨迹文件除末行 trace_completed 信封外的内容（三迭代系统性行为，"除末行外"重算全部匹配）；完整产物核验以各运行 SHA256SUMS 为准。
- v1.3.0 追加登记：G3-GOLDEN-0001 三个尝试归档（`03-39-36-322Z` / `04-37-02-222Z` / `07-23-42-361Z`）各 1 项 summary.json 时点性不符（列入清单后在清单计算之后才定稿——与 F1/F2 同类系统性行为，非篡改；实质内容经交叉核验为真：案例计数与 cases/ 目录一致，其余各项精确通过）。S2 时代其余 27 个尝试归档与全部 7 个现行运行目录 SHA256SUMS 独立重算全部精确通过。
- v1.4.0 再生登记：S2 分支回流实施后 3 运行再生产物（S2A-F4-0001 / G3-GOLDEN-0001 / S2B-0001）summary.json 计数、SHA256SUMS 逐项独立重算（22/22、82/82、16/16 全部精确通过）、run-metadata 代码绑定核验（gitHead `76c1605`、workTreeClean=False——实施期未提交工作树如实记录）；新增 5 个尝试归档 SHA256SUMS 独立重算全部精确通过；失败尝试 2 个（`S2A-F4-0001-attempt-2026-10-10T00-36-33-645Z` / `G3-GOLDEN-0001-attempt-2026-10-10T00-38-52-586Z`）均为执行器侧案例断言缺陷，产品运行时无缺陷（缺陷分类与根因分析：P3-S2-IMPL-ITER-ADOPT v1.0.0 §3）。
- v1.5.0 S3 实施登记：S3 实施（CR-28 D-1…D-5 全项 A——S3a 核心能力（长期记忆启用 + 跨会话分支持久化）+ S3b 暴露层（HTTP API 面扩展 + 只读观测路由）；产品提交 `f8b374f` / 执行器提交 `87681c3` / 执行器元数据校正 `e6780c8`）后五运行证据登记——G3-GOLDEN-0001 再生成（48/48 案例、10/10 断言——黄金套件扩展 G11 长期记忆案例组 + G12 跨会话分支持久化案例组）、S2A-F5-0001 再生成（14/14 案例、19/19 断言——S2 时代负向不变式经 CR-28 D-1/D-2 选项 A 裁决取代，案例 9→14、断言 12→19）、S2A-F4-0001 再生成（10/10 案例、17/17 断言——INPROC-REGRESSION 跨会话持久化验证（S2 时代 D-04 失效不变式经 CR-28 D-2 选项 A 取代））、S2B-0001 重跑（7/7 案例、14/14 断言——黄金回归绑定新基线 G3-GOLDEN-0001 48/48 @ policy_v2.2.0 / state_machine_v1.5.0）、S3-API-0001 首次执行（8/8 案例、13/13 断言——HTTP 执行形态 + 只读观测路由）；五运行退出码 0、summary.json 计数核验、SHA256SUMS 逐项独立重算（98/30/22/16/18 全部精确通过）、run-metadata 代码绑定核验（gitHead `5af5592` / `e6780c8`、workTreeClean=False——实施期未提交工作树如实记录；S2B-0001 文件级哈希无 gitHead——S2b 时代执行器形态）；新增 12 个尝试归档（11 个含 SHA256SUMS 归档独立重算全部精确通过；FATAL 部分产物归档 1 个无 SHA256SUMS——先于清单计算步骤终止，仅含 cases/ ×14 / logs/ / traces/，如实登记）；失败尝试 5 个均为执行器侧案例断言缺陷，产品运行时零缺陷（缺陷分类与根因分析：P3-S3-IMPL-ITER v1.0.0 §3）；S2B-0001 另有 FATAL 1 次（黄金回归绑定基线陈旧——先于运行目录创建无运行产物，经迭代记录 §3 登记）；尝试归档总数 53。
- 本清单不产生任何 Gate 结论。P2 时代 G5 16 项评测包已于 2026-10-09 完成（PASSED 无条件——P3-S1-G5-WORKSHEET-01 v1.8.0）；S2 时代 G5 独立评测 NOT RUN（范围定义 S2-G5-EVAL-DEF-01 v1.0.0 已经产品负责人 2026-10-09 裁决选项 A——复用 16 项框架对 S2 证据执行独立评测，CR-26 STAGED→RULED；评测工作表 P3-S2-G5-WORKSHEET-01 v0.1.0 新建，16 项骨架结论列全部 NOT RUN，待角色 5 逐项裁决签署——独立评测人：用户本人，角色 5，PD-15；实现作者不得兼任独立评测人）。

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

## S2 时代运行再生产物登记（2026-10-10，manifest v1.4.0）

- 范围：S2 分支回流（ADOPT_BRANCH 显式回流操作——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A，policy_v2.1.0 变更 1–5；产品提交 `728b3de` / 执行器提交 `a7077ce`）实施后 S2 时代 3 运行再生产物——S2A-F4-0001 重跑（10/10 案例、17/17 断言——新增 BRANCH-ADOPT 案例）、G3-GOLDEN-0001 再生（40/40 案例——新增 G10 分支回流案例组 N/NEG/B/FR）、S2B-0001 重跑（7/7 案例、14/14 断言——黄金回归绑定新基线 40/40）。
- 方法：与 v1.0.0/v1.3.0 一致——每运行 summary.json 计数、SHA256SUMS 逐项独立重算（22/22、82/82、16/16 全部精确通过）、run-metadata 代码绑定核验（gitHead `76c1605`、workTreeClean=False——实施期未提交工作树如实记录）。
- 尝试归档：新增 5 个（先前通过运行前置归档 3 个：`S2A-F4-0001-attempt-2026-10-10T00-33-01-157Z` / `G3-GOLDEN-0001-attempt-2026-10-10T00-37-18-438Z` / `S2B-0001-attempt-2026-10-10T00-39-21-950Z`；失败尝试 2 个：`S2A-F4-0001-attempt-2026-10-10T00-36-33-645Z` / `G3-GOLDEN-0001-attempt-2026-10-10T00-38-52-586Z`——均为执行器侧案例断言缺陷，产品运行时无缺陷，缺陷分类与根因分析见 P3-S2-IMPL-ITER-ADOPT v1.0.0 §3）；新增 5 个归档 SHA256SUMS 独立重算全部精确通过；尝试归档总数 41。
- 产物提交：全部再生产物经证据提交 `0a4be6d` 入库。
- 本追加不改变 v1.3.0 及以前已评测内容（git 历史可查）；不产生任何 Gate 结论。

## S3 实施证据登记（2026-10-10，manifest v1.5.0）

- 范围：S3 实施（CR-28 D-1…D-5 全项 A——S3a 核心能力：长期记忆启用（07 号契约 §5 A/B 类经显式表达保存、C 类仅候选——PD-23 禁用经 S3 裁决解除）+ 跨会话分支持久化（分支记录全量跨会话持久、currentBranchId 会话级不变式、分支操作路径三前提运行时内校验）；S3b 暴露层：HTTP API 面扩展（既有端点 semanticAction 枚举扩展——纯暴露层，同一 getServerRuntime 单例，不改变任何运行时语义）+ 只读观测路由 GET /api/memory / GET /api/experience/{id}/simulation（Query 与 Command 分离）；产品提交 `f8b374f` / 执行器提交 `87681c3` / 执行器元数据校正 `e6780c8`）后证据登记——G3-GOLDEN-0001 再生成（48/48 案例、10/10 断言——黄金套件扩展 G11 长期记忆案例组 + G12 跨会话分支持久化案例组）、S2A-F5-0001 再生成（14/14 案例、19/19 断言——S2 时代负向不变式经 CR-28 D-1/D-2 选项 A 裁决取代，案例 9→14、断言 12→19）、S2A-F4-0001 再生成（10/10 案例、17/17 断言——INPROC-REGRESSION 跨会话持久化验证）、S2B-0001 重跑（7/7 案例、14/14 断言——黄金回归绑定新基线 G3-GOLDEN-0001 48/48 @ policy_v2.2.0 / state_machine_v1.5.0）、S3-API-0001 首次执行（8/8 案例、13/13 断言——HTTP 执行形态 + 只读观测路由）。
- 方法：与 v1.0.0/v1.3.0/v1.4.0 一致——每运行 summary.json 计数、SHA256SUMS 逐项独立重算（98/30/22/16/18 全部精确通过）、run-metadata 代码绑定核验（gitHead `5af5592` / `e6780c8`、workTreeClean=False——实施期未提交工作树如实记录；S2B-0001 文件级哈希无 gitHead——S2b 时代执行器形态）。
- 尝试归档：新增 12 个（失败尝试 5 个：`G3-GOLDEN-0001-attempt-2026-10-10T04-43-51-277Z`（案例 34/40 PASS；断言 8/10）/ `G3-GOLDEN-0001-attempt-2026-10-10T04-47-42-104Z`（44/48；8/10）/ `G3-GOLDEN-0001-attempt-2026-10-10T04-48-35-438Z`（47/48；8/10）/ `S2A-F5-0001-attempt-2026-10-10T04-36-38-550Z`（7/9；12/14）/ `S2A-F5-0001-attempt-2026-10-10T04-43-10-669Z`（13/14；18/19）——均为执行器侧案例断言缺陷，产品运行时零缺陷；FATAL 部分产物 1 个：`S2A-F5-0001-attempt-2026-10-10T04-41-45-293Z`——FATAL ENOENT 先于清单计算步骤终止，仅含 cases/ ×14 / logs/ / traces/，无 summary.json / SHA256SUMS / run-metadata.json / review/README.md，如实登记；先前通过运行前置归档 6 个：`G3-GOLDEN-0001-attempt-2026-10-10T03-51-03-660Z`（40/40；10/10）/ `S2A-F4-0001-attempt-2026-10-10T04-43-27-487Z`（10/10；17/17）/ `S2A-F4-0001-attempt-2026-10-10T05-23-28-507Z`（10/10；17/17）/ `S2A-F5-0001-attempt-2026-10-10T05-22-28-693Z`（14/14；19/19）/ `S2B-0001-attempt-2026-10-10T04-56-27-942Z`（7/7；14/14）/ `S3-API-0001-attempt-2026-10-10T04-58-31-883Z`（8/8；13/13）——非失败尝试，只追加纪律留存）；新增 11 个含 SHA256SUMS 归档独立重算全部精确通过；尝试归档总数 53。
- 缺陷登记：全部失败（含 S2B-0001 FATAL 1 次——黄金回归绑定基线陈旧——先于运行目录创建无运行产物，经迭代记录 P3-S3-IMPL-ITER v1.0.0 §3 登记）均为执行器侧案例断言 / 基线 / 元数据缺陷，产品运行时零缺陷；缺陷分类与根因分析：P3-S3-IMPL-ITER v1.0.0 §3。
- 产物提交：S3 时代动态证据产物经证据提交 `2b2bbf5` 入库（728 文件——五运行当前产物 + 7 个新尝试归档）；执行器元数据校正后再生产物经证据提交 `bed768d` 入库（S2A-F5-0001 / S2A-F4-0001，112 文件）。
- 本追加不改变 v1.4.0 及以前已评测内容（git 历史可查）；不产生任何 Gate 结论。S3 独立评测（G5）NOT RUN——属角色 5 独立评测人逐项裁决（实现作者不得兼任独立评测人，PD-15；S3 G5 评测范围定义待签发）。
