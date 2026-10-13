# S2B-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S2B-0001（S2b 体验动作扩展首批义务 G-1…G-4——DEEPEN/SIMPLIFY/REFRAME 顶层语义动作 + SEARCH 内部能力 + First Experience 完整呈现）
日期：2026-10-09T15:15:33.662Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：7/7 全部 （见 summary.json）
- 断言：11/14 通过
- 退出码：1（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 7 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S2b → 案例 / 断言映射；frozenDecisions：D-01…D-05 + 附列项 VERIFY 裁决文本引用；policy_v2.0.0 变更 1–6 / state_machine_v1.5.0 变更 1–3 全文）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §5.2 案例面）

- 案例面 1 正常路径（DIRECTIONAL-DEEPEN / SIMPLIFY / REFRAME）：创作会话内顶层补丁操作——词表分类、policy_v2.0.0 恒等映射、reason=creation_modification、头状态 ACTIVE/CREATION v7、流内容逐字节等于方向性语料、<action>_requested ×1、creation_patch_applied ×1（operation / target 经 TARGET_SYNONYMS 派生 / change={direction} / creation_version=2）、决策追踪 explicit_user_direction + llm_used=false、终态 WAITING/CREATION v8、创作版本 2 + user_changes 权威登记 + 结构逐字段保持（08 §11 局部变更纪律：不重新生成整个作品）
- 案例面 2 非创作会话升级（ESCALATION-NEG）：三动作在无创作对象时 INVALID_ACTION 升级（policy_v2.0.0 变更 5；C3 纪律）——状态版本 / 视图零增量、零方向性事件、零补丁事件（拒绝先于任何写入——OBL-01）
- 案例面 3 SEARCH 内部能力（SEARCH-CAPABILITY）：三面只读检索（read_only 恒真 / 相关性判定 / 非活跃创作对象面跳过）；VERIFY 类输入经既有 WHY / DIRECT_ANSWER 解释层路由（附列裁决区选项 A——VERIFY 不启用）；WHY 路径端到端无副作用；只读不变式；静态边界（纯函数模块 / 无外部网络出口 / 双生成路径集成）
- 案例面 4 First Experience 呈现（FIRST-EXPERIENCE）：入口 / 六阶段 / 完成 / 退出 / 中断流程模型（E2 §5/§6/§7 冻结面）；视图→呈现阶段映射（含 BRANCH Simulation 呈现面区分）；默认查询；生命周期游走六阶段全路径（v2→v4→v6→v8→v10→v12；STOP 完成路径登记创作 active=false）
- 案例面 5 优先级链（PRIORITY-CHAIN）：冻结优先级链碰撞核验 8 组（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER）+ 运行时 STOP 优先于 DEEPEN 证明（"好了再深入一点"经 STOP 执行路径完成）

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例（G3 Gate 判定属独立评测人逐项裁决——本运行不设置任何 Gate 为 PASS，E5 §2）
- S2b 后续批次（如有）：经产品负责人另行版本化裁决与授权
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- C3 行为语义空缺不得由编码者补写——新语义空缺出现须另行版本化裁决（授权 §4.7）

## 独立重跑

    cd tools/evidence && npm run s2b   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S2B-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
