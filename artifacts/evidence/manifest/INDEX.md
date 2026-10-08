# 证据运行包索引（EVIDENCE-MANIFEST-01 v1.0.0）

生成：2026-10-08T16:35:08.546081Z（工程负责人角色，代理）
依据：E5 计划 §7 只追加布局；G5 第 15 项（Evidence Index）输入。方法：独立重算（不信任执行器自报断言）。
**退出码 0 / 案例 PASS 只表示本运行中的断言通过；不设置任何 Gate 为 PASS。G5 16 项评测包均 NOT RUN。**

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

## 审计说明

- 全部运行均为合成数据；无真实 LLM 提供方调用；无真实用户数据（隐私六要素批准前禁收护栏持续生效）。
- F1/F2 的 summary.json 列入其 SHA256SUMS 但在清单计算之后才定稿（各 1 项声明哈希不符，实质内容经交叉核验为真）；F3 执行器已改进（summary.json 不列入清单）。
- 案例记录 evidence.traceSha256 绑定轨迹文件除末行 trace_completed 信封外的内容（三迭代系统性行为，"除末行外"重算全部匹配）；完整产物核验以各运行 SHA256SUMS 为准。
- 本清单不产生任何 Gate 结论；G5 16 项评测包均 NOT RUN（独立评测人：用户本人，角色 5，PD-15）。
