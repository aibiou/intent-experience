# G3-GOLDEN-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：G3-GOLDEN-0001（P2 G3 黄金案例回归套件——OBL-03 / PD-19；8 黄金案例 × 4 维度 = 32 案例执行；PD-21 关闭切片：G04/G07/G08 最小实现）
日期：2026-10-09T12:52:42.936Z
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 执行案例：32/32 存在 FAIL——见 cases/
- 延期案例：0（PD-19 延期义务已履行：G04/G07/G08 以 PD-21 关闭切片最小形态执行；完整语义 DEFERRED TO S2，acceptance-mapping §B；DEFERRED 不计为通过）
- 断言：8/10 通过（A1–A10）
- 退出码：1（只表示本运行断言通过；不设置 G3 或任何产品 Gate 状态）

## G3 逐项裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）

| 黄金案例 | 四维度覆盖（本运行） | 本运行状态 | 评测人裁决 | 理由 |
|---|---|---|---|---|
| G01 Direct Answer | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G02 Why | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G03 What If（S1 基础单次模拟形态） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整多轮/持久分支属 S2（acceptance-mapping §B） |
| G04 Creation（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整 Creation 语义属 S2（acceptance-mapping §B，PD-05/PD-06） |
| G05 Change | N/NEG/B/FR（含 in-flight/stale 必测维度） | 4/4 PASS | 待裁决 | |
| G06 Stop | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G07 Correction（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整 Correction 语义属 S2（acceptance-mapping §B，PD-05） |
| G08 Memory Boundary（PD-21 关闭切片最小实现） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整持久 Memory 语义属 S2（acceptance-mapping §B，PD-07） |

## 审阅清单（不得只看汇总）

1. cases/ —— 32 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希；32 份执行（无 DEFERRED 登记）
2. traces/ —— 32 份 JSONL 轨迹（每案例 trace_started → 案例事实 → trace_completed）
3. run-metadata.json —— E5 §3 版本矩阵（黄金语料定义、回归基线绑定 F2-GS-0001/F3-EB-0001、契约指纹、代码字节绑定）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 语料范围声明

- 已执行（本运行）：G01–G08 八黄金案例四维度共 32 案例，进程内形态（真实 .ts 源字节）；G03 为 S1 基础单次模拟形态（PD-06）。
- 关闭切片（PD-21）：G04/G07/G08 最小实现（CREATE / CORRECTION 语义动作 + CREATION 阶段 + 当前会话方向信号）；完整 Creation / Correction / 持久 Memory 语义仍属 S2（PD-05/PD-06/PD-07；acceptance-mapping §B）。
- 形态覆盖：HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001（本套件为跨迭代回归基准的进程内形态）。
- 未执行（NOT RUN）：真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（按 ADR-0002 §3 证据运行仅使用合成数据）。

## 独立重跑

    cd tools/evidence && npm run golden   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/G3-GOLDEN-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。G3 Gate 的最终判定（尤其 G04/G07/G08 关闭切片最小形态是否足以接受为 P2 关闭条件）属产品负责人与评测人共同裁决范畴。
