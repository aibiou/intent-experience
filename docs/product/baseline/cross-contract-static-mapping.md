# 跨契约静态一致性映射

**编号：** XCC-MAP-01
**版本：** 1.3.0（2026-10-08：补 N3-01 补丁剩余两项；新增 PD-16 字段命名调和注记与 S1-CC31 WAIT 澄清）
**状态：** 产品负责人已裁决映射原则；逐条独立复核待完成；非动态证据
**依据：** E8 G2、P3-S1-CC01、P3-S1-CC02、PODR-001 / PD-11 / PD-13

## 1. 编号命名空间

当前有三个独立案例来源都从 CC-01 起号；必须显式标注来源命名空间，严禁将源文件中的裸编号当作可执行 Case ID：

- E8 Gate 案例统一写作 E8-G2-CC01…E8-G2-CC12。
- P3-S1-CC02 §3 的 40 项统一写作 S1-CC01…S1-CC40；本命名空间仅指 CC02 的矩阵行。
- P3-S1-CC01 的 20 个规范案例统一写作 S1-CCSPEC-CC01…S1-CCSPEC-CC20；CCSPEC 明确表示来自 CC01 规范。
- P3-S1-CC02 的硬检查、跨契约场景和负向案例分别写作 S1-CC02-H01…H12、S1-CC02-GXC01…GXC08、S1-CC02-NEG01…NEG18。

例如 E8-G2-CC02 是 STOP；S1-CC02 是 CC02 矩阵中的 Session 与 Intent 生命周期；S1-CCSPEC-CC02 是 CC01 规范中的 STOP 一致性。三者不能互相替代。本表只完成静态映射；所有动态执行状态都是 NOT RUN。

## 2. S1-CC02 全量矩阵映射

每个 S1 ID 精确指向 P3-S1-CC02 中同号原始矩阵行。原始矩阵的”权威、必须成立、正向、负向、留证”字段保持原文效力；本表增加阶段映射，不重写验收期望。

**字段命名调和注记（PD-16 / CR-14）：** 状态版本写入的规范字段名为 `expected_state_version`（SRC-26 §4 CC-H04）；SRC-27 §22 的 `expected_version` 与 SRC-07 §30 Case 05 的 `state_version` 为别名。S1-CC02-H04、S1-CC18、S1-CC23、S1-CC24 与 GS-05 的测试设计须同时记录规范名与来源表述。

| S1 ID | 契约组合 / 主题 | S1 阶段裁定 | 静态映射 / 证据要求 | 动态状态 |
|---|---|---|---|---|
| S1-CC01 | C01+C09；Session 写入权 | S1 纳入 | C09 Runtime 单写入；校验禁止 Frontend 直接写 ACTIVE；state trace | NOT RUN |
| S1-CC02 | C01+C02；Session / Intent 生命周期 | S1 纳入 | END 后无新 Active Intent；lifecycle trace | NOT RUN |
| S1-CC03 | C01+C03；Session / ExperienceState 生命周期 | S1 纳入 | END 取消旧 Experience / generation；state-version trace | NOT RUN |
| S1-CC04 | C02+C03；Intent 改变状态 | S1 纳入 | Intent 变更须经 Policy / State Machine / Runtime；decision trace | NOT RUN |
| S1-CC05 | C02+C05；Intent / Semantic Action | S1 纳入 | 明确动作优先于旧 Intent；action trace | NOT RUN |
| S1-CC06 | C02+C06；Intent / Policy | S1 纳入 | Policy 尊重当前 Intent；Memory 不得覆盖；policy trace | NOT RUN |
| S1-CC07 | C03+C04；State / 合法转换 | S1 纳入 | 所有状态变更符合 State Machine；transition trace | NOT RUN |
| S1-CC08 | C03+C05；Action / ExperienceState | S1 纳入 | Action 不直接写状态；mutation log | NOT RUN |
| S1-CC09 | C03+C06；Policy / ExperienceState | S1 纳入 | Policy 不绕过 Runtime 写状态；decision/state trace | NOT RUN |
| S1-CC10 | C04+C05；Action / State Machine | S1 纳入 | Action 仅触发合法转换；STOP 后不得 CONTINUE；transition evidence | NOT RUN |
| S1-CC11 | C05+C06；Action / Policy 映射 | S1 纳入 | 已启用动作均有确定映射；WHY 不误转 CHANGE；mapping trace | NOT RUN |
| S1-CC12 | C06+C07；Policy / LLM | S1 纳入 | LLM 仅执行授权能力；policy + LLM trace | NOT RUN |
| S1-CC13 | C06+C08；Policy / Validator | S1 纳入 | Validator 不批准 Policy 禁止动作；validation trace | NOT RUN |
| S1-CC14 | C07+C08；模型响应 / Validator | S1 纳入 | 每个 Proposal 都验证；格式错误拒绝；call + validation trace | NOT RUN |
| S1-CC15 | C08+C09；Validator / Runtime | S1 纳入 | 未接受的 Proposal 不写状态；validation + mutation trace | NOT RUN |
| S1-CC16 | C07+C09；LLM / Runtime | S1 纳入 | LLM 不得直接改 Runtime State；access trace | NOT RUN |
| S1-CC17 | C06+C09；Policy / Runtime | S1 纳入 | Policy 只授权、不执行状态写入；mutation trace | NOT RUN |
| S1-CC18 | C07+C08+C09；异步生成 | S1 纳入 | stale result 必须拒绝；generation/state trace | NOT RUN |
| S1-CC19 | C06+C07+C09；STOP | S1 纳入 / P0 | STOP 取消生成且阻止旧结果；完整链路 trace | NOT RUN |
| S1-CC20 | C05+C06+C07+C08+C09；CHANGE_DIRECTION | S1 纳入 / P0 | CHANGE 使旧候选失效；complete trace | NOT RUN |
| S1-CC21 | C01+C07+C09；生成中 Session End | S1 纳入 | Session End 取消或使 generation stale；trace | NOT RUN |
| S1-CC22 | C02+C07+C08；生成中 Intent Change | S1 纳入 | 旧 Intent 结果不得进入新 Intent；intent/generation trace | NOT RUN |
| S1-CC23 | C03+C07+C08；State Version | S1 纳入 | Proposal 绑定 state_version；不匹配拒绝；version trace | NOT RUN |
| S1-CC24 | C03+C09；并发 Mutation | S1 纳入 | 以 version / idempotency 控制并发写；mutation log | NOT RUN |
| S1-CC25 | C06+C07；Retry | S1 纳入 | Retry 不改变原 Policy 意图；retry chain | NOT RUN |
| S1-CC26 | C06+C07+C08；Fallback | S1 纳入 | Fallback 必须重新验证；validation trace | NOT RUN |
| S1-CC27 | C07+C08；模型切换 | S1 纳入 | 换模型不得跳过 Validator；model/version trace | NOT RUN |
| S1-CC28 | C07+C09；Provider Failure | S1 纳入 | 供应商失败不能伪装成功；call record | NOT RUN |
| S1-CC29 | C07+C08；Failure Classification | S1 纳入 | 基础设施失败与验证失败分别分类；failure class evidence | NOT RUN |
| S1-CC30 | C08+C09；Runtime Acceptance | S1 纳入 | Validation 成功不等于 Runtime mutation 成功；execution trace | NOT RUN |
| S1-CC31 | C06+C03；WAIT | S1 纳入 | WAIT 后不得系统自主 continuation；state trace。注：WAIT 为 SRC-27 状态机状态 WAITING（转换 WAITING→ACTIVE / WAITING→STOP），非 §11 启用的语义动作 | NOT RUN |
| S1-CC32 | C05+C06+C03；Explicit Correction | S1 延期至 S2 | S1 未启用 Correction 动作；不得让模型为自己辩护；S2 执行 action/policy trace | NOT RUN / DEFERRED |
| S1-CC33 | C02+Memory；当前意图 / Memory | S1 边界测试纳入 | 不实现持久 Memory；注入隔离测试上下文，验证明确当前意图优先；memory/policy trace | NOT RUN |
| S1-CC34 | C06+Memory；Memory / Policy | S1 边界测试纳入 | 测试夹具只能作上下文；不能直接触发 Policy Action；policy trace | NOT RUN |
| S1-CC35 | C09+Analytics；分析边界 | S1 纳入 | Analytics 只记录、不控制 Runtime；access trace | NOT RUN |
| S1-CC36 | C07+Analytics；LLM Call Record | S1 纳入 | 每次调用均分类记录结果与失败；call record | NOT RUN |
| S1-CC37 | C08+Analytics；Validation Record | S1 纳入 | 每次验证可追溯；不得静默拒绝；validation record | NOT RUN |
| S1-CC38 | C09+Analytics；Decision Trace | S1 纳入 | 每次状态变更可追溯至决策；decision trace | NOT RUN |
| S1-CC39 | C01+C02+C03+C04；Lifecycle Closure | S1 纳入 | 终止后无孤儿状态；lifecycle replay | NOT RUN |
| S1-CC40 | C05+C06+C07+C08+C09；End-to-End Authority | S1 纳入 | 用户动作到 Runtime 完整权责链；full trace | NOT RUN |

## 3. E8-G2-CC01…CC12 到 S1 矩阵关联

| E8 ID | E8 Gate 案例 | 关联 S1 ID | 阶段裁定 |
|---|---|---|---|
| E8-G2-CC01 | ExperienceState Single Writer | S1-CC01、08、09、15、16、17 | S1 纳入 |
| E8-G2-CC02 | STOP | S1-CC10、19、21、31、39、40 | S1 纳入 / P0 |
| E8-G2-CC03 | CHANGE_DIRECTION | S1-CC05、20、22、24、40 | S1 纳入 / P0 |
| E8-G2-CC04 | DIRECT_ANSWER | S1-CC05、11、40 | S1 纳入 |
| E8-G2-CC05 | CORRECTION | S1-CC32 | S2 延期；P2 G2 未通过 |
| E8-G2-CC06 | Memory Boundary | S1-CC06、33、34 | S1 只做隔离边界测试；完整 Memory 评测延期 |
| E8-G2-CC07 | WHAT_IF / Simulation | S1-CC07、11、40；S1-ACT-WHAT_IF | S1 基础单次模拟契约测试；完整分支延期 |
| E8-G2-CC08 | Creation Context Inheritance | S1 无 Creation 写入路径 | S2 延期；不得将 S1-CC08 误认成同一案例 |
| E8-G2-CC09 | State Version / Stale Write | S1-CC18、23、24、30 | S1 纳入 |
| E8-G2-CC10 | Interrupt / Retry | S1-CC18–22、25–30 | S1 纳入 |
| E8-G2-CC11 | Decision Trace | S1-CC38、40 | S1 纳入 |
| E8-G2-CC12 | Analytics Boundary | S1-CC35–38 | S1 纳入 |

## 4. P3-S1-CC01 规范案例（20 项）

以下 ID 对应 SRC-25 / P3-S1-CC01 的编号案例。原规范中 §15–§17 为 CC-11（跨集创作一致性）的支撑章节，也在该行显式处置。S1 不包含完整创作系统；延期不代表原规范失效或通过。

| Case ID | 来源条款 / 主题 | S1 范围裁定 | 对应矩阵 / 证据 | 状态 |
|---|---|---|---|---|
| S1-CCSPEC-CC01 | SRC-25 §4 / 单一写入者 | 纳入 | S1-CC01、08、15–17、35、40；GS-06；验证 Runtime 唯一写入 | NOT RUN |
| S1-CCSPEC-CC02 | SRC-25 §5 / STOP | 纳入 / P0 | S1-CC10、19、21、31、39、40；GS-04；不得 continuation 或接受旧结果 | NOT RUN |
| S1-CCSPEC-CC03 | SRC-25 §6 / CHANGE_DIRECTION | 纳入 / P0 | S1-CC05、20、22、24、40；GS-03；旧候选失效 | NOT RUN |
| S1-CCSPEC-CC04 | SRC-25 §7 / DIRECT_ANSWER | 纳入 | S1-CC05、11、40；GS-01；显式回答不被预设体验覆盖 | NOT RUN |
| S1-CCSPEC-CC05 | SRC-25 §8 / Memory 优先级 | 有限纳入 | S1-CC06、33、34；只用隔离夹具证明当前意图优先；不实现持久 Memory | NOT RUN |
| S1-CCSPEC-CC06 | SRC-25 §9 / 模型一致性 | 有限纳入；多模型评测待架构确认 | S1-CC12、14、16、27；产品规则与写入权限不得随模型改变；模型资格评测见 C4 处置表 | NOT RUN |
| S1-CCSPEC-CC07 | SRC-25 §10 / State Version | 纳入 | S1-CC18、23、24、30；验证状态版本、陈旧请求与并发写入 | NOT RUN |
| S1-CCSPEC-CC08 | SRC-25 §11 / Validation | 纳入 | S1-CC14、15、18、23、26、30；验证未经接受的提案不进入 Runtime | NOT RUN |
| S1-CCSPEC-CC09 | SRC-25 §12 / Analytics | 纳入 | S1-CC35–38；Analytics 只记录、不控制 Runtime | NOT RUN |
| S1-CCSPEC-CC10 | SRC-25 §13 / 跨 Experience 一致性 | 延期至 S2 | S1 不运行多个可继承上下文的完整 Experience；后续须定义 Carry Forward 与隔离规则 | NOT RUN / DEFERRED |
| S1-CCSPEC-CC11 | SRC-25 §14–§17 / 跨集创作、Creation State、Confirmed Fact、Canon / Proposal | 延期至 Creation 切片 | S1 不包含 Creation、Episode 或 Canon 写入；§15–§17 不被默认为已实现 | NOT RUN / DEFERRED |
| S1-CCSPEC-CC12 | SRC-25 §18 / 跨集事实 | 延期至 Creation 切片 | S1 无跨集内容与持久 Canon | NOT RUN / DEFERRED |
| S1-CCSPEC-CC13 | SRC-25 §19 / 人物状态 | 延期至 Creation 切片 | S1 不管理角色状态 | NOT RUN / DEFERRED |
| S1-CCSPEC-CC14 | SRC-25 §20 / 时间线 | 延期至 Creation 切片 | S1 不管理叙事时间线 | NOT RUN / DEFERRED |
| S1-CCSPEC-CC15 | SRC-25 §21 / 因果关系 | 延期至 Creation 切片 | S1 不生成或维护跨集因果状态 | NOT RUN / DEFERRED |
| S1-CCSPEC-CC16 | SRC-25 §22 / 分支一致性 | 延期至 S2 | 完整多轮 WHAT_IF / Branch 不在 S1；单次 SIMULATE 不等于分支状态 | NOT RUN / DEFERRED |
| S1-CCSPEC-CC17 | SRC-25 §23 / Creation 修改 | 延期至 Creation 切片 | S1 不实现 CREATE / MODIFY | NOT RUN / DEFERRED |
| S1-CCSPEC-CC18 | SRC-25 §24 / 版本一致性 | 部分纳入 | Runtime state_version 纳入 S1-CC18、23、24；Creation / Episode / Generation 内容版本延期 | NOT RUN |
| S1-CCSPEC-CC19 | SRC-25 §25 / 生成一致性 | 部分纳入 | 异步 generation 与 stale 状态纳入 S1-CC18–24；跨集创作内容版本绑定延期 | NOT RUN |
| S1-CCSPEC-CC20 | SRC-25 §26 / 再生成一致性 | 延期至 Creation 切片 | S1 无 Episode 再生成、Canon 或叙事设定修改 | NOT RUN / DEFERRED |

所有延期案例仍须由后续切片重新纳入范围、冻结期望并产生动态证据；本表不把延期改成非适用 PASS。

## 5. P3-S1-CC02 硬一致性检查（12 项）

每项必须有独立可检索记录。对应关系只建立追踪归属，不替代 CC02 的完整“必须证明”与故障断言。P0 严重度仅按 SRC-26 §9 的分类，不按本表中是否出现 P0 字样推断。

| Case ID | 来源条款 / 检查 | 关联 S1 矩阵 / Golden | S1 裁定 | 状态 |
|---|---|---|---|---|
| S1-CC02-H01 | SRC-26 §4 / Runtime 单一写入者 | S1-CC01、08、15–17、35、40；GS-06 | 纳入；越权写入按 §9 对应 P0 类别阻断 | NOT RUN |
| S1-CC02-H02 | SRC-26 §4 / STOP 一致性 | S1-CC10、19、21、31、39、40；GS-04 | 纳入；STOP 后未授权 continuation / stale mutation 为 P0 | NOT RUN |
| S1-CC02-H03 | SRC-26 §4 / CHANGE_DIRECTION 一致性 | S1-CC05、20、22、24、40；GS-03 | 纳入；旧 generation 污染新体验为 P0 | NOT RUN |
| S1-CC02-H04 | SRC-26 §4 / State Version 一致性 | S1-CC18、23、24、30；GS-05 | 纳入；覆盖写、忽略版本冲突不得放行 | NOT RUN |
| S1-CC02-H05 | SRC-26 §4 / LLM 权限边界 | S1-CC14、16、18、23、27；GS-06 | 纳入；LLM 只能提案，不得直接 mutation | NOT RUN |
| S1-CC02-H06 | SRC-26 §4 / Policy 权限边界 | S1-CC09、12、13、17 | 纳入；Policy ALLOW 不等于执行或拥有状态 | NOT RUN |
| S1-CC02-H07 | SRC-26 §4 / Validator 边界 | S1-CC14、15、18、23、26、30 | 纳入；所有提案路径含 retry / fallback 均需验证 | NOT RUN |
| S1-CC02-H08 | SRC-26 §4 / WAIT 一致性 | S1-CC31、39 | 纳入；WAIT 后等待用户动作，不自动继续 | NOT RUN |
| S1-CC02-H09 | SRC-26 §4 / Current Intent > Memory | S1-CC06、33、34 | 有限纳入；使用隔离夹具，不实现持久 Memory | NOT RUN |
| S1-CC02-H10 | SRC-26 §4 / Model Failure Completeness | S1-CC25–29、36–37 | 纳入；失败分类、调用记录和验证记录需关联 | NOT RUN |
| S1-CC02-H11 | SRC-26 §4 / Decision Trace Completeness | S1-CC35–40 | 纳入；从用户输入到可见结果及状态变更可回放 | NOT RUN |
| S1-CC02-H12 | SRC-26 §4 / End-to-End Authority | S1-CC40；GS-01–GS-06 | 纳入；完整权限链需跨层验证 | NOT RUN |

## 6. P3-S1-CC02 黄金跨契约场景（8 项）

| Case ID | 来源场景 | 关联矩阵 / Golden | S1 裁定 | 状态 |
|---|---|---|---|---|
| S1-CC02-GXC01 | SRC-26 §5 / 正常探索 | S1-CC05、11、14、30、38、40；GS-01 / GS-02 | 纳入 | NOT RUN |
| S1-CC02-GXC02 | SRC-26 §5 / 生成中 STOP | S1-CC19、21、23、30、39、40；GS-04 | 纳入 / P0 | NOT RUN |
| S1-CC02-GXC03 | SRC-26 §5 / 生成中 CHANGE_DIRECTION | S1-CC20、22、24、40；GS-03 | 纳入 / P0 | NOT RUN |
| S1-CC02-GXC04 | SRC-26 §5 / 模型超时 | S1-CC25、26、28、29、36 | 纳入 | NOT RUN |
| S1-CC02-GXC05 | SRC-26 §5 / 非法模型结构 | S1-CC14、15、29、37 | 纳入 | NOT RUN |
| S1-CC02-GXC06 | SRC-26 §5 / State Version 冲突 | S1-CC23、24、30 | 纳入 | NOT RUN |
| S1-CC02-GXC07 | SRC-26 §5 / Memory 与当前 Intent 冲突 | S1-CC06、33、34 | 有限纳入；隔离夹具，不实现持久 Memory | NOT RUN |
| S1-CC02-GXC08 | SRC-26 §5 / 完整 Decision Trace | S1-CC35–40 | 纳入 | NOT RUN |

## 7. P3-S1-CC02 负向测试矩阵（18 项）

以下顺序与 SRC-26 §6 原表一致；为每行分配稳定执行 ID。期望均为 REJECT。P0 分类按 SRC-26 §9 的具体类型标注；并非每个负向案例都自动是 P0。

| Case ID | SRC-26 §6 负向输入 | 关联 S1 矩阵 | 严重度依据 | 状态 |
|---|---|---|---|---|
| S1-CC02-NEG01 | Frontend 直接改 State | S1-CC01、08、15 | Unauthorized State Mutation / P0 | NOT RUN |
| S1-CC02-NEG02 | LLM 直接改 State | S1-CC16 | LLM Direct State Mutation / P0 | NOT RUN |
| S1-CC02-NEG03 | Policy 直接改 State | S1-CC17 | Unauthorized State Mutation / Policy Bypass / P0 | NOT RUN |
| S1-CC02-NEG04 | 非法 State Transition | S1-CC07、10、39 | Illegal State Transition / P0 | NOT RUN |
| S1-CC02-NEG05 | stale generation | S1-CC18–20、23 | Stale Result enters Runtime / P0 | NOT RUN |
| S1-CC02-NEG06 | stale State Version | S1-CC23、24 | State Version overwrite / P0 | NOT RUN |
| S1-CC02-NEG07 | STOP 后旧结果返回 | S1-CC19、21 | STOP Violation / Stale Result enters Runtime / P0 | NOT RUN |
| S1-CC02-NEG08 | CHANGE 后旧结果返回 | S1-CC20、22 | CHANGE_DIRECTION Violation / P0 | NOT RUN |
| S1-CC02-NEG09 | Session END 后结果返回 | S1-CC21、39 | Stale Result enters Runtime / P0 | NOT RUN |
| S1-CC02-NEG10 | Validator REJECT 后 Runtime 执行 | S1-CC15、30 | Validator bypass / P0 | NOT RUN |
| S1-CC02-NEG11 | Policy DENY 后 LLM 执行 | S1-CC12、13、17 | Policy Bypass / P0 | NOT RUN |
| S1-CC02-NEG12 | Memory 覆盖当前 Intent | S1-CC06、33、34 | Memory overrides Explicit Current Intent / P0 | NOT RUN |
| S1-CC02-NEG13 | WAIT 自动继续 | S1-CC31 | Hidden Continuation / P0 | NOT RUN |
| S1-CC02-NEG14 | Retry 改变原 Intent | S1-CC25 | 负向必测；严重度待 A2 非作者复核，若触发 Policy / Agency 硬违规则按适用分类处理 | NOT RUN |
| S1-CC02-NEG15 | Fallback 绕过 Validator | S1-CC26 | Validator bypass / P0 | NOT RUN |
| S1-CC02-NEG16 | Analytics 修改 Runtime | S1-CC35 | Unauthorized State Mutation / P0 | NOT RUN |
| S1-CC02-NEG17 | Provider timeout 被伪装成功 | S1-CC28、29、36 | 负向必测；严重度待 A2 非作者复核，不预先映射为 P1 或 P0 | NOT RUN |
| S1-CC02-NEG18 | malformed output 被接受 | S1-CC14、29、37 | Validator bypass / P0 | NOT RUN |

## 8. 严重度来源与适用范围

- SRC-25 / P3-S1-CC01 §27 的 P0–P3 分类适用于 CC01 一致性错误及其对应案例；SRC-26 / P3-S1-CC02 §9 的硬失败分类适用于 CC02 的 S1 系统级阻断案例。两者各自适用于其来源范围，不相互取代。本节规则依据 PODR-001 v1.0.2 / PD-13 与 decision-register CR-13。
- 同一发现同时落入两种范围且等级不同，按较严格等级处理并登记裁决；不得降级或通过平均分抵消。NEG14 / NEG17 的映射须由 A2 非作者复核人确认。
- CC02 §9 明列的 Unauthorized State Mutation、LLM Direct State Mutation、Policy Bypass、STOP / CHANGE_DIRECTION Violation、Stale Result enters Runtime、State Version overwrite、Illegal State Transition、Memory overrides Explicit Current Intent、Validator bypass、Hidden Continuation 任一出现，均直接阻断，不得平均。
- CC02 §3 的 40 行未在单行末尾标注 P0，不代表其相关负向断言可降级；反之，S1-CC19 / S1-CC20 标注 P0 也不代表只有这两项属于 P0。
- P0 映射仍待非作者核验；当前没有任何动态证据，全部为 NOT RUN。
- CC01 §27 与 CC02 §9 的交叉适用及较严格等级规则，须由非作者复核人在 A2 记录签署确认。

## 9. 裁决和复核边界

- 表中范围裁定来自 PODR-001 / PD-05–PD-11；静态映射不等于静态一致性 Gate 已 PASS。
- S1-CC32、E8-G2-CC05、E8-G2-CC08 的延期不豁免 P2 G2 / G3；相关 Gate 保持 NOT PASSED，直到后续阶段完成证据。
- S1-CC33/34 是策略边界测试，不得据此声称已实现 Memory 产品。
- 本文件尚无非作者独立复核记录。G2 静态准入仍 NOT PASSED；动态执行均 NOT RUN。
- 原始 CC02 §3 的 40 行以本表 `S1-CC01…S1-CC40` 为兼容标识；新执行产物必须同时记录源条款 `SRC-26 §3 / CC-xx`，禁止只写裸编号。
- 复核须检查 E8 12 项、CC02 40 项、CC01 20 项、CC02 的 12 项硬检查 / 8 个 GXC / 18 个负向案例均逐项有归属；检查所有延期决策不会被误记为 PASS。
