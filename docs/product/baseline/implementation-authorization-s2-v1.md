# P3-S2 实施授权（S2a）

**编号：** P3-S2-IMPL-AUTH-01
**版本：** 1.1.0（2026-10-09：产品负责人签署——授权生效（AUTHORIZED）；S2a 首个迭代 F-1（OBL-01：环境门控 LlmGateway 注入缝 + HTTP 形态 503 补测）开工）
**状态：** AUTHORIZED（2026-10-09 签发）
**授权依据：** PD-23（S2 功能构建范围裁决，2026-10-09 四项建议全案批准）；PD-20（先关再建）；PD-22（P2 = CLOSED）
**签发：** 产品负责人（用户本人，PD-15）已签署（2026-10-09）

## 1. 准入条件满足证据

| 条件 | 状态 | 证据 |
|---|---|---|
| P2 关闭 | PASSED | G1–G8 全 PASSED（P2 Exit Gate §15 关闭公式满足，2026-10-09；P2-SIGNOFF-01 v1.0.0，六行 Decision 一致 APPROVE WITH DOCUMENTED DEBT） |
| S2 范围裁决 | APPROVED | PD-23（2026-10-09；S2-SCOPE-PROPOSAL-01 v1.1.0，§5 裁决区已填写） |
| 隐私治理 | APPROVED | 隐私六要素全部批准（P3-S1-PRIVACY-SIX-01 v0.4.0，2026-10-09：存储位置=中国大陆（cn）/ 阿里云 / 云存储；保留期限至少 6 个月；访问控制=最小所需权限；加密=两层机制 + 密钥分离；删除机制；批准责任） |
| 证据环境 | PASSED | E5 环境（`tools/evidence/` 零依赖执行器 + golden.mjs；G3-E-3 修复后清单自洽，提交 9054c53） |
| 独立评测人 | APPOINTED | 角色 5（用户本人，PD-15；G5 隔离声明 2026-10-08 签署生效） |
| 黄金回归基线 | PASSED | G3-GOLDEN-0001（32/32 案例 PASS，断言 A1–A10 全通过，无 DEFERRED） |
| 运行时基线 | LOCKED | Node v24.21.0 Active LTS 精确锁定（F-2 履行，2026-10-08） |

## 2. 授权范围

S2a（核心能力收束）产品运行时代码的开发与动态证据执行：

1. 完整 G04 Creation 语义——多轮分支、持久创作状态；E2 Stage 5 编排 CREATE → CONTEXT_INHERIT → MINIMAL_BUILD → PREVIEW → USER_FEEDBACK；
2. 完整 G07 Correction 语义——MODIFY 登记为 CORRECTION 用户面别名；定位目标、局部修改、重生成、历史版本化；
3. WHAT_IF 完整分支——持久分支状态；假设 / 事实 / 模拟结果分离不变（E8-G2-CC07）；
4. Minimal Memory——仅短期记忆持久化（跨会话主题 / 意图信号）+ 用户显式纠正 / 撤回记录；六类数据状态区分；生命周期"记住 → 暂时使用 → 逐渐失效 → 被用户纠正 → 被用户撤回"；Current State / Session State 会话结束即失效；长期记忆（偏好画像）不启用；
5. OBL-01（首个迭代义务）——环境门控的 `LlmGateway` 注入缝（CR-18 选项 A 形态，仅证据 / 测试环境启用，默认合成模式不变）+ HTTP 形态 LLM 故障 503 动态证据补测；
6. G3 黄金套件扩展（完整 G04/G07/G08 案例 + 新动作案例）与 S2a 动态证据运行。

**不授权：** S2b（DEEPEN / SIMPLIFY / REFRAME / Search 启用、First Experience 完整呈现、更完整 Golden Suite）——须另行裁决与授权，且新动作语义定义须在授权前由产品负责人版本化冻结；真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；任何 Gate PASS 判定（只有真实运行证据 + 独立评测 + 正式签署）。

## 3. 首批迭代义务（S2a）

1. **F-1（首个迭代，OBL-01）：** 环境门控 `LlmGateway` 注入缝实施（仅证据 / 测试环境启用，默认合成模式不变）+ HTTP 形态 LLM 故障 503 补测（503 → `LLM_UNAVAILABLE`；恰好一次调用、retryable=true、有界恢复、失败后 STOP 合法——进程内形态已覆盖语义，HTTP 形态经注入缝触发）；动态证据按 E5 §3/§4 记录。
2. **F-2：** 完整 G04 Creation 语义实施（CREATION 完整阶段链；多轮分支；持久创作状态；版本化提交与 stale 拒绝不变式保持）。
3. **F-3：** 完整 G07 Correction 语义实施（MODIFY 别名登记；定位目标、局部修改、重生成、历史版本化）。
4. **F-4：** WHAT_IF 完整分支实施（持久分支状态；假设 / 事实 / 模拟结果分离不变）。
5. **F-5：** Minimal Memory 实施（短期记忆持久化；生命周期；用户纠正 / 撤回；Current State / Session State 会话结束失效；长期记忆不启用；写入经 Runtime 单一写入者）。
6. **F-6：** S2a 动态证据运行 + G3 黄金套件扩展 + 独立评测（G5 式评测包；角色 5 签署）。

## 4. 版本化变更清单（实施前冻结）

| 变更 | 版本 | 说明 |
|---|---|---|
| 策略 | policy_v1.1.0 → policy_v1.2.0 | CREATE / CORRECTION / WHAT_IF 完整语义；MODIFY 登记为 CORRECTION 用户面别名 |
| 状态机 | state_machine_v1.0.0 → state_machine_v1.1.0 | CREATION 完整阶段链（CONTEXT_INHERIT / MINIMAL_BUILD / PREVIEW / USER_FEEDBACK）+ CORRECTION 阶段语义；关闭切片 CREATION 阶段契约化 |
| 契约冻结 | C1 / C2 / C3 Steward 确认 | 版本化变更文本于首个动态证据运行前完成冻结 + Steward 确认（G1 式纪律） |

## 5. 持续约束（授权不解除）

1. 隐私护栏：真实用户数据禁收（隐私六要素批准范围内除外）；仅允许合成数据或经明确批准的脱敏夹具；Minimal Memory 保留期限默认 6 个月后自动删除。
2. P0 硬门槛零容忍（PD-08）：用户主导权、状态完整性、策略合规违反直接阻断。
3. 任何 Gate 不因代码存在、测试全绿或演示成功而 PASS；只有真实运行证据 + 独立评测 + 正式签署（E5 §2）。
4. 每次运行按 E5 §3 记录完整版本矩阵；失败结果按 ADR-0002 §5 如实登记，不得重跑至通过为止而不留失败记录。
5. 密钥、访问令牌、原始个人隐私数据不得进入证据文件。
6. 不得由实现代理自行批准其实现的产品 Gate；独立评测负责人（角色 5）保留审阅与否决权。
7. C3 行为语义空缺（G-1…G-7）不得由编码者补写；DEEPEN / SIMPLIFY / REFRAME / SEARCH 语义定义须在 S2b 授权前由产品负责人版本化冻结。
8. Minimal Memory 写入不得绕过 Runtime 单一写入者（GS-06 / CC02 约束不变）；模型提出 `state_update` 时 Validator / Runtime 拒绝（GS-06）。

## 6. 签署区

| 角色 | 签署 | 结论 | 日期 |
|---|---|---|---|
| 产品负责人（用户本人，PD-15） | 已签署（2026-10-09） | AUTHORIZED——S2a 实施授权生效 | 2026-10-09 |

本授权已生效（2026-10-09 签署）。S2a 首个迭代（F-1 / OBL-01：环境门控 `LlmGateway` 注入缝 + HTTP 形态 503 补测）开工。
