# S2A-F3-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S2A-F3-0001（S2a F-3 迭代：G07 完整 Correction 语义——MODIFY 用户面别名登记 + 纠正目标确定性定位 + 创作会话路由保护 + RESTORE_PREVIOUS_VERSION 恢复子型 + 纠正域事件词表）
日期：2026-10-09T09:11:57.301Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：8/8 全部 PASS
- 断言：15/15 通过
- 退出码：0（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 8 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-3 → 案例 / 断言映射；correctionSemantics：纠正语义规范登记；frozenDecisions：D-01…D-05 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 别名登记（MODIFY-ALIAS）：MODIFY 词表（08 §10 修改类型族）分类为 CORRECTION 用户面别名——静态分类断言 13 项（tune / rebalance / restyle / replace / rename 各族 + RESTORE 子型标记 + 原生族不变 + S2b 保留输入仍 UNKNOWN + 创作 ADD 族仍 UNKNOWN）+ 优先级混合输入 2 项（P-01/P-03 不变）；非创作会话 "修改这个" / "调整一下" 完整重评估链路（correction_requested → experience_interrupted old_generation_rejected=true → generation/llm 链路 → state_transitioned CORRECTION → v6）→ correction_applied（correction_target=current_candidate, corrected_candidate_id=提案 ID）
- 完整 G07 链路（CORRECTION-FULL）："刚才那个不对"——纠正目标 previous_candidate 确定性登记（D-02 指代词表）；取消在途 generation；有效上下文保留（why_requested / session / intentId）；重评估候选提交（v5 → v6）；correction_applied（corrected_candidate_id 与 llm_request_completed.proposal_id 一致）；决策追踪 reason=reassess 且 secondary 含 previous_candidate
- 创作会话路由保护（CREATION-INERT）："修改障碍颜色"（MODIFY 别名 → CORRECTION 分类）经创作修改族预检命中 → 创作补丁轮次（creation_patch_applied operation=modify target=obstacle kind=tune，创作 v2，llm_used=false——非 executeCorrect）；"不对"未命中创作修改族 → 通用 CORRECTION（creation_reevaluated phase=USER_FEEDBACK 不变 + correction_applied + state_transitioned CORRECTION，llm_used=true——F-2 变更 3 保持）；"不对，加两个障碍"冲突判据（08 §16）→ ASK（单块澄清问题流，创作版本/阶段/user_changes 不变）
- 恢复提交（RESTORE）：add 轮 v2 → 陈旧 expectedCreationVersion 恢复 STATE_VERSION_CONFLICT 拒绝 → 恢复提交 v3（版本单调 +1——S1-12 不变式；objects=[player,exit]、variables={progress:0} 即 v1 快照——obstacle_count 消失证明内容恢复而非版本指针回滚；user_changes [add@2, restore@3]，restore 条目 change.restoreFromVersion=1；correction_restored 事件 restored_from_version=1 / restored_to_version=3 / semantic_action=CORRECTION；头 reason=creation_restore；决策追踪 reason=creation_restore, llm_used=false）
- 陈旧拒绝（STALE-REJECT）：非创作会话陈旧 expected_state_version（3 vs 4）纠正提交 → STATE_VERSION_CONFLICT；状态逐字节不变（JSON 序列化前后一致）；无 correction_applied / 无新 state_transitioned；事件计数不变（OBL-01）
- 非创作会话回归（NONCREATION-INERT）：G07-N 黄金语义逐项回归（correction_requested×1 + why_requested×1 + interrupted reason=correction×1 + state_transitioned CORRECTION + 决策追踪 reason=reassess + 终态 WAITING/UNDERSTANDING v6 + lastSemanticAction=CORRECTION + 零 memory 事件）；与关闭切片仅有的差异为 policy_version=policy_v1.3.0 与 correction_applied 事件登记
- 零 memory 事件（NO-MEMORY）：三域纠正事实（非创作纠正 + 创作会话通用纠正 + 创作恢复轮）均为会话内事件登记；全部事件 memory 事件 = 0（PD-07）
- 全链路回归（INPROC-REGRESSION）：WHY → CREATE → 修改轮（"把出口放远一点"——MODIFY 别名经创作会话路由保护 → 创作补丁轮次，创作 v2）→ 纠正轮（"不对"——通用 CORRECTION 重评估）→ 完成信号（"就这样" STOP 路径）全链路——信封全量有效（C6 §7）、sequence_number 严格单调（C6 §25）、全部决策追踪 policy_version=policy_v1.3.0、修改轮 / 纠正轮内容逐字节等于 create / correction 语料、终态 COMPLETED/COMPLETION + 创作 COMPLETE(active=false, v2) + 会话 SESSION_ENDED

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-4（WHAT_IF 全分支，policy_v1.4.0）/ F-5（Minimal Memory——隐私敏感存储 / 加密设计待产品负责人指示）
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人

## 独立重跑

    cd tools/evidence && npm run s2a-f3   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S2A-F3-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
