# P3-S2 分支回流实施迭代记录：ADOPT_BRANCH 显式回流操作（S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效）

**编号：** P3-S2-IMPL-ITER-ADOPT
**版本：** 1.0.0
**日期：** 2026-10-10
**授权：** 产品负责人 standing authorization（/goal：持续推进产品，完成，需要我签署和授权的，允许——2026-10-09 重述）；语义定义经 S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决版本化冻结（产品负责人 2026-10-09，CR-27）；实施按 P3-S2-IMPL-AUTH-01 授权路径执行（产品实施经用户授权路径签发——standing authorization 覆盖）
**范围：** 第五分支操作 ADOPT_BRANCH（分支结论显式回流）产品实施 + 动态证据回归扩展 + 黄金套件扩展 + 黄金回归再生成 + 治理写回。S2a F-4 / S2b 既有义务不在本迭代范围（已关闭）。

## 1. 实施内容（授权范围内）

- **产品源码（4 文件，实施提交 `728b3de`）：**
  - `src/experience/simulation.ts`：`BranchRecord` 附加 `adopted: boolean` 属性（幂等——附加属性而非生命周期状态，lifecycle 契约不变：ACTIVE / RETURNED / ABANDONED 三态不增第四态）；`BranchOperationKind` 扩展 `ADOPT_BRANCH`；`BRANCH_ADOPT_PATTERNS` 词表（/采用/、/采纳/——词表优先级 RETURN > SWITCH > ABANDON > ADOPT_BRANCH，须命中分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE 执行路径）；`validateBranchOperation` 同 SWITCH/ABANDON 校验纪律（目标序号须解析为 live 分支——不要求激活分支上下文，采用面向分支记录本身，RETURN 后 currentBranchId=null 时仍合法）；`applyBranchOperation` ADOPT 分支（adopted 标记附加 + updatedAt 刷新，version / rounds 不变——采用不累积模拟轮次）
  - `src/experience/events.ts`：`SIMULATION_ADOPTED_EVENT = 'simulation_adopted'`（C6 §14 命名模式 `<domain>_<past_participle>` 派生；properties 含 branch_id / source_round / adopted_content 摘要 / separation_invariant=simulation_result_is_not_fact——采纳结果仍标记为模拟来源，E8-G2-CC07）
  - `src/experience/runtime.ts`：ADOPT_BRANCH 路由与执行（WHAT_IF 语义动作声明路由内分支操作识别；确定性系统回合——llm_used=false、reasonPrimary=explicit_user_direction；state_transitioned 后登记 simulation_adopted ×1；结果流呈现分支最新模拟轮模拟内容为新一轮模拟上下文——模拟来源、非事实，separation_invariant 随文标注；采纳内容经独立 CREATE 提交方纳入作品——主线当前上下文不变，创作版本化纪律不变）
  - `src/experience/policy.ts`：`POLICY_VERSION = 'policy_v2.1.0'`（§3 变更 1–5 文本：①ADOPT_BRANCH 注册与词表优先级；②adopted 附加标记 / 生命周期契约不变 / 幂等；③simulation_adopted 事件（C6 §14 + E8-G2-CC07）；④新一轮模拟上下文呈现 / 主线当前上下文不变 / 独立 CREATE 提交；⑤确定性系统回合（llm_used=false、reasonPrimary=explicit_user_direction）。state_machine_v1.5.0 不变——分支操作不新增体验轴触发器，同 F-2 D-05 / F-3 D-04 轴外纪律）
- **证据执行器（3 文件，执行器提交 `a7077ce`）：**
  - `tools/evidence/src/s2a-f4.mjs`：S2A-F4 回归扩展——案例 9→10（新增 BRANCH-ADOPT：轮 1/2 自动 CREATE 分支 1 并累积 → 采用分支 1（adopted=true 附加、生命周期 ACTIVE 不变、currentBranchId 保持分支 1、simulation_adopted ×1、内容流呈现采纳内容为新一轮模拟上下文、确定性系统回合）→ 负向：采用分支九 INVALID_STATE_TRANSITION（零版本消耗——OBL-01）→ RETURN → 无激活分支上下文采用分支 1（RETURNED 生命周期不变、adopted 幂等、currentBranchId 保持 null））；断言 16→17（A10 新增 + 后续顺延）；simulationSemantics 五字段扩展；run-metadata obligationTraceability 扩展 adoptExtension 实施文件清单（6 文件）
  - `tools/evidence/src/golden.mjs`：黄金套件 9→10 黄金案例 × 4 维度 = 36→40 案例（新增 G10 Branch Reflow 案例组：G10-N 正常路径 / G10-NEG 负向（词表边界 + 不存在序号）/ G10-B 边界（RETURNED 采用 + 幂等）/ G10-FR 故障恢复（陈旧版本拒绝 → 重试 → CREATE 衔接））；A5 维度覆盖扩展 G01–G10；policy 断言同步 policy_v2.1.0（当前版本断言 + run-metadata 版本矩阵；历史引入版引用保留为事实）
  - `tools/evidence/src/s2b.mjs`：policy 版本引用同步 policy_v2.1.0（执行器保持可运行——运行时现输出 policy_v2.1.0；黄金回归绑定更新为 G3-GOLDEN-0001 在 policy_v2.1.0 / state_machine_v1.5.0 通过 40/40）；已提交 S2B-0001 证据保持冻结不改写（ADR-0002 §5）——S2b 变更 1–6 引入版引用保留为历史事实，版本矩阵增 carriedForward 注记
- **纯增量纪律：** 不改变任何既有分支操作（CREATE / SWITCH / ABANDON / RETURN）语义；不改变"分支模拟结果默认不回流为主线结论"默认语义——显式回流是经用户指令的例外通道；既有映射不变（WHAT_IF → SIMULATE 映射不变，S1 §14）；不新增顶层 SemanticAction / PolicyAction。

## 2. 动态证据（2026-10-10，锁定 Node v24.21.0）

- **S2A-F4-0001 重生产物**（`artifacts/evidence/runs/S2A-F4-0001/`）：10/10 案例 PASS（9 既有 + BRANCH-ADOPT 新增）、17/17 断言通过、退出码 0；运行于 policy_v2.1.0 / state_machine_v1.5.0；startedAt 2026-10-10T00:36:31.227Z，durationMs 16612。**退出码 0 只表示本运行断言通过，不设置任何 Golden Case、Gate（G2/G4/G8）或产品状态为 PASS（E5 §2）。**
- **G3-GOLDEN-0001 再生产物**（`artifacts/evidence/runs/G3-GOLDEN-0001/`）：40/40 案例 PASS（10 黄金案例 × 4 维度——含新增 G10 案例组）、10/10 断言通过、退出码 0；运行于 policy_v2.1.0 / state_machine_v1.5.0；startedAt 2026-10-10T00:38:50.195Z，durationMs 24413。同上词汇纪律。
- **S2B-0001 重生产物**（`artifacts/evidence/runs/S2B-0001/`）：7/7 案例 PASS、14/14 断言通过、退出码 0；黄金回归绑定验证（G3-GOLDEN-0001 在 policy_v2.1.0 / state_machine_v1.5.0 通过 40/40）通过后执行；startedAt 2026-10-10T00:39:19.732Z，durationMs 9581。同上词汇纪律。
- **代码绑定：** 三运行 run-metadata 登记 gitHead `76c1605`（workTreeClean=false——实施在裁决后工作树内执行；实施提交 `728b3de` / 执行器提交 `a7077ce` / 证据提交 `0a4be6d` 随后落地，字节经提交哈希可核验）。
- **G5 16 项评测包（S2 时代）仍 NOT RUN**——属 P3-S2-G5-WORKSHEET-01 v0.1.0 范围（S2-G5-EVAL-DEF-01 v1.0.0 选项 A：复用 16 项框架对 S2 证据执行独立评测，CR-26 STAGED→RULED），待角色 5 独立评测人逐项裁决签署；实现作者不得兼任独立评测人（PD-15）。

## 3. 执行尝试记录（ADR-0002 §5：失败如实登记，不重跑至通过为止而不留失败记录）

本迭代失败尝试 2 次（均为执行器侧案例断言缺陷，产品运行时无缺陷），按 ADR-0002 §5 归档留存（只追加、不覆盖、不删除）：

1. **S2A-F4-0001 失败尝试**（归档 `S2A-F4-0001-attempt-2026-10-10T00-36-33-645Z`）：BRANCH-ADOPT 案例 FAIL——执行器侧案例断言缺陷：adoptTraceReasons 期望序列误期望 `['explicit_user_direction', 'explicit_user_direction']`（2 轮），实际 ADOPT_BRANCH 决策轨迹 3 轮（采用 1 成功 / 采用九拒绝 / 采用 2 成功——负向拒绝轮 reasonPrimary=invalid_state_transition 同样命中 ADOPT_BRANCH 轨迹过滤）。**产品运行时行为经逐字段核验符合 S2-BRANCH-REFLOW-DEF-01 v1.0.0 冻结定义**（adopted 附加 true、生命周期 ACTIVE 不变、currentBranchId 保持分支 1、simulation_adopted ×1 属性齐备（branch_id / source_round=1 / adopted_content=分支最新模拟轮内容 / separation_invariant）、负向拒绝轮 INVALID_STATE_TRANSITION 零版本消耗（版本前后均为 8）、RETURNED 边界采用生命周期不变且幂等、终态 v12——全部正确）。修复案例断言（期望序列更正为 3 轮 + 成功轮计数 2）后重跑通过。
2. **G3-GOLDEN-0001 失败尝试**（归档 `G3-GOLDEN-0001-attempt-2026-10-10T00-38-52-586Z`）：G10-N / G10-NEG / G10-FR 三案例 FAIL——执行器侧案例断言缺陷三类：①G10-N 误断言迁移提交时视图的 state_version 与头状态（期望定居值 8 与 SIMULATION/SIMULATION——实际迁移提交时视图为 7 与 ACTIVE/SIMULATION，RESPONSE_COMPLETED 结算后定居 8 / WAITING/SIMULATION，13 §15.3）；②G10-NEG 引用 golden.mjs 不存在的 jsonEquals 辅助（ReferenceError）；③G10-FR 引用未导入绑定名 `create`（实际导入名 `createFixture`——TypeError）。**产品运行时无缺陷**（G10-B 同批通过；产品行为逐字段核验符合冻结定义）。修复案例断言后重跑 40/40 通过。

前置运行按 ADR-0002 §5 归档留存（通过运行的归档，非失败记录）：S2A-F4-0001-attempt-2026-10-10T00-33-01-157Z（2026-10-09 通过运行）、G3-GOLDEN-0001-attempt-2026-10-10T00-37-18-438Z（36/36 通过运行）、S2B-0001-attempt-2026-10-10T00-39-21-950Z（2026-10-09 通过运行）。

## 4. 实施侧事实核验记录（实施按冻结文本执行；零产品缺陷）

- 失败尝试 2 次均为执行器侧案例断言编写缺陷（期望序列遗漏负向拒绝轮轨迹 / 迁移提交时视图与结算后视图混淆 / 辅助函数与导入绑定名错误），产品源码零缺陷——与 S2a/S2b 迭代同类模式（失败尝试均为执行器侧缺陷）。
- 词表优先级与作用域边界经进程内探针核验：采用分支一 → ADOPT_BRANCH(1)；采纳分支 2 → ADOPT_BRANCH(2)；"如果采用这个结论呢"（未命中分支作用域词表——无序号）→ 不识别为分支操作，走通用 SIMULATE 执行路径；"如果切换分支一呢" / "如果放弃分支一呢" / "如果返回主线呢" 优先级保持；"如果切换分支一采用分支二呢"（词表碰撞）→ SWITCH 优先；"如果采用分支九的结论呢" → ADOPT_BRANCH(9) 识别但运行时校验拒绝（INVALID_STATE_TRANSITION）；普通 WHAT_IF → 不识别为分支操作。
- 版本化纪律核验：每次合法提交恰好 +1（S1-12——G10-N 版本链 2→4→6→8；G10-B 2→…→12；负向拒绝轮零消耗）；simulation_adopted 事件 properties 与分支快照逐字段一致；模拟域事件与决策追踪分离（C6 §23）。

## 5. 明确非结论（不得据此宣告任何产品 Gate）

- 三运行退出码 0 与案例 PASS 只表示各运行中的断言通过（E5 §2）；不设置 G3 / G5 或任何产品 Gate 为 PASS；G3 判定属独立评测人逐项裁决（P2 Exit Gate §8）。
- 本迭代不产生 S2 时代 G5 评测结论——P3-S2-G5-WORKSHEET-01 v0.1.0（16 项骨架）结论列全部 NOT RUN，待角色 5 独立评测人逐项裁决签署。
- adopted 标记与 simulation_adopted 事件为冻结形态（S2-BRANCH-REFLOW-DEF-01 §5 非结论——经产品负责人 2026-10-09 裁决采纳，未修改）。
- 跨会话分支持久化不属本迭代（属 F-5 Minimal Memory 裁决范围——D-04 选项 A；本迭代分支状态会话内持久、会话结束失效不变）。

## 6. 后续义务

- **S2 时代 G5 独立评测（角色 5）：NOT RUN**——P3-S2-G5-WORKSHEET-01 v0.1.0（`s2-g5-evaluation-worksheet.md`）待角色 5 独立评测人逐项裁决签署（含本迭代三运行动态证据与 staged 审阅包：`artifacts/evidence/runs/S2A-F4-0001/review/README.md` / `artifacts/evidence/runs/G3-GOLDEN-0001/review/README.md` / `artifacts/evidence/runs/S2B-0001/review/README.md`）；实现作者不得兼任独立评测人。
- "采用某分支结论"显式回流操作：**已实施（本迭代——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A 裁决补写生效；产品提交 `728b3de`；动态证据 S2A-F4-0001 BRANCH-ADOPT 案例 + 黄金套件 G10 案例组；CR-27 RULED→IMPLEMENTED）**；s2a-f4 / s2a-f5 / s2b / corpus-alignment 迭代记录 §6/§5 后续义务行已同步写回"已实施"。
- 黄金套件持续扩展：S2 后续批次（如有）经产品负责人另行版本化裁决与授权后纳入 G3-GOLDEN-0001 回归基准。
- OBL-02（延迟测量）：任何延迟指标宣称前须满足方法第 5 节样本纪律并注明分层（方法 v1.0.0 已经产品负责人按 E3 批准）；本迭代不产生延迟指标宣称。
- 暴露凭据轮换（用户侧）：会话记录中暴露的 GitHub token（ghp_hYIMv…）建议撤销/轮换——产品负责人确认尚未处理（治理步骤完成后执行）；已撤销凭据 ghp_rViK8… 保持撤销状态。

## 7. 签署

- 执行：工程负责人角色（代理，Codex），2026-10-10。
- 独立评测：独立评测负责人（用户本人，角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）——**NOT RUN（本迭代运行动态证据 staged 待审阅；审阅包见 §6）**。
- 本记录由执行方起草；独立评测人保留审阅与否决权。
