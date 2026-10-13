# G3-GOLDEN-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：G3-GOLDEN-0001（P2 G3 黄金案例回归套件——OBL-03 / PD-19；S1 已实现黄金子集 5 案例 × 4 维度 = 20 案例执行 + G04/G07/G08 经批准延期登记）
日期：2026-10-09T03:27:41.797Z
执行器：工程负责人角色（代理）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 执行案例：20/20 存在 FAIL——见 cases/
- 延期案例：3（G04 Creation / G07 Correction / G08 Memory Boundary——PD-19 批准 DEFERRED TO S2/P2 关闭切片；DEFERRED 不计为通过）
- 断言：8/10 通过（A1–A10）
- 退出码：1（只表示本运行断言通过；不设置 G3 或任何产品 Gate 状态）

## G3 逐项裁决表（评测人填写；取值 PASS / FAIL / DEFERRED / N/A，附理由）

| 黄金案例 | 四维度覆盖（本运行） | 本运行状态 | 评测人裁决 | 理由 |
|---|---|---|---|---|
| G01 Direct Answer | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G02 Why | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G03 What If（S1 基础单次模拟形态） | N/NEG/B/FR | 4/4 PASS | 待裁决 | 完整多轮/持久分支属 S2（acceptance-mapping §B） |
| G04 Creation | 未执行 | DEFERRED（PD-19） | 待裁决 | S2/P2 关闭切片：最小 Creation 实现 + 四维度证据 |
| G05 Change | N/NEG/B/FR（含 in-flight/stale 必测维度） | 4/4 PASS | 待裁决 | |
| G06 Stop | N/NEG/B/FR | 4/4 PASS | 待裁决 | |
| G07 Correction | 未执行 | DEFERRED（PD-19） | 待裁决 | S2/P2 关闭切片：Correction 动作启用 + 四维度证据 |
| G08 Memory Boundary | 未执行 | DEFERRED（PD-19） | 待裁决 | S2/P2 关闭切片：最小 Memory 边界实现 + 四维度证据 |

## 审阅清单（不得只看汇总）

1. cases/ —— 23 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希；20 份执行 + 3 份 DEFERRED 登记
2. traces/ —— 20 份 JSONL 轨迹（每案例 trace_started → 案例事实 → trace_completed）
3. run-metadata.json —— E5 §3 版本矩阵（黄金语料定义、回归基线绑定 F2-GS-0001/F3-EB-0001、契约指纹、代码字节绑定）
4. SHA256SUMS —— 证据包清单（可独立重算验证）

## 语料范围声明

- 已执行（本运行）：S1 已实现黄金子集（G01/G02/G03 基础形态/G05/G06）四维度共 20 案例，进程内形态（真实 .ts 源字节）。
- 延期（经批准）：G04/G07/G08——S1 范围冻结（PD-05/PD-06/PD-07），最小实现与黄金证据安排在 S2/P2 关闭切片（PD-19 / OBL-03）。
- 形态覆盖：HTTP 形态回归证据见 F2-GS-0001 / F3-EB-0001（本套件为跨迭代回归基准的进程内形态）。
- 未执行（NOT RUN）：真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（按 ADR-0002 §3 证据运行仅使用合成数据）。

## 独立重跑

    cd tools/evidence && npm run golden   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/G3-GOLDEN-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。G3 Gate 的最终判定（尤其 G04/G07/G08 的 DEFERRED 是否可接受为关闭条件）属产品负责人与评测人共同裁决范畴。
