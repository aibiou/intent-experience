# S4A-F1-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S4A-F1-0001（S4 动态证据——REPEAT / CONTINUE 策略动作版本化实施，policy_v2.3.0；S4A-SEMANTIC-FREEZE-01 v1.0.0 D-6 选项 A 一次性实施义务）
日期：2026-10-10T07:53:35.239Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：6/6 全部 PASS
- 断言：15/15 通过
- 退出码：0（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 6 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S4 → 案例 / 断言映射；frozenDecisions：D-1…D-6 裁决文本引用；policy_v2.3.0 变更 1–5 全文）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S4A-SEMANTIC-FREEZE-01 v1.0.0 动态证据计划）

- 案例面 1 词表分类（CONTINUE-CLASSIFICATION / REPEAT-CLASSIFICATION）：S4A §3 词表正常路径（CONTINUE 4 组 / REPEAT 5 组）+ 优先级碰撞核验 10 组（STOP / CORRECTION / WHY / 提问标记层先判——优先级链 §2 于运行时成立）+ 确定性恒定（GS-01）
- 案例面 2 运行时正常路径（CONTINUE-RUNTIME / REPEAT-RUNTIME）：CONTINUE 幂等确认回合（done ×1 / 0 分块 / continue_requested ×1 / state_version 不变 / 幂等性 / 决策追踪 llm_used=false）；REPEAT 呈现层重放（重放内容逐字节等于上一完成轮 / fixtureId 为上一轮语料 / CONTINUE 空轮次不覆盖数据源 / repeat_requested ×1 / state_version 不变）
- 案例面 3 负路径（REPEAT-NEGATIVE）：无上一完成轮 REPEAT → INVALID_STATE_TRANSITION；陈旧版本 CONTINUE / REPEAT → STATE_VERSION_CONFLICT ×2（trigger 留痕）；失败不消耗版本号；当前版本恢复成功
- 案例面 4 零回归（ZERO-REGRESSION）：41 组既有证据输入分类不变；优先级层插入位置静态字节序验证；captureLastResponse 应用验证；冻结表扩展与 POLICY_VERSION 验证

## 回归基线

- G3-GOLDEN-0001：policy_v2.3.0 / state_machine_v1.5.0 通过（48/48——S4 迭代后基线；黄金断言同步 policy_v2.3.0——版本期望随策略版本化迁移，行为断言不变）
- S2B-0001：policy_v2.3.0 基线重跑通过（7 案例 / 14 断言——S2b 行为面零回归）
- 首次运行失败记录：G3-GOLDEN-0001 首次 policy_v2.3.0 运行 8 案例失败（G04-N / G07-N / G09-N / G10-N / G10-B / G10-FR / G12-N / G12-FR——全部为 policy 版本字符串期望未随版本化迁移；行为断言全部通过）；按 ADR-0002 §5 归档于 G3-GOLDEN-0001-attempt-2026-10-10T07-39-50-764Z（保留于仓库，不删除）；期望同步后重跑 48/48 通过

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（G3 Gate 判定属独立评测人逐项裁决——本运行不设置任何 Gate 为 PASS，E5 §2）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- C3 行为语义空缺不得由编码者补写——新语义空缺出现须另行版本化裁决（授权 §4.7）

## 独立重跑

    cd tools/evidence && npm run s4a-f1   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S4A-F1-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
