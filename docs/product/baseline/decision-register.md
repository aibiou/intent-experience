# 产品冲突与未决决策登记册

**编号：** BASELINE-DECISIONS-01
**版本：** 0.24.0（2026-10-09：S2a 首个迭代 F-1（OBL-01）完成登记——动态证据 S2A-OBL-01-0001 通过（7/7 案例、12/12 断言、退出码 0，只表示本运行断言通过，不设置任何 Gate）；CR-18 选项 B 登记的 DEFERRED 项（HTTP 形态 LLM 故障 503 补测）已履行，P2-SIGNOFF-01 遗留债务 D-01 关闭；其余内容与 v0.23.0 相同）
**状态：** PODR-001 v1.0.4 已裁决 CR-01…CR-07、CR-09、CR-12、CR-13、CR-14，并增补 PD-14 / PD-15 / PD-16 / PD-17；CR-07 / CR-08 / CR-09 / CR-10 / CR-11 / CR-12 / CR-13 / CR-15 / CR-16 / CR-17 / CR-18 已关闭（CR-08 于 2026-10-09 关闭：隐私六要素全部裁决签署，P3-S1-PRIVACY-SIX-01 v0.4.0；CR-16 / CR-17 于 2026-10-09 经 REVIEW-009 非作者复核签署关闭；CR-18 于 2026-10-09 经产品负责人裁决关闭：选项 B——维持不暴露网关注入缝，HTTP 形态 LLM 故障 503 登记 DEFERRED TO 后续切片；CR-15 于 2026-10-08 经 PD-17 裁决关闭：选项 A，scoped 预授权许可签发）；G6 处置表（PB-01…PB-04）已建立，PB-01 解除条件已满足（2026-10-08）。
**规则：** 执行团队不得自行把产品决策解释为运行证据或 Gate PASS。

## CR-01｜P2 已关闭与仍阻塞的状态冲突

- **证据：** `P2｜Product Engineering Contract…` 声称 `P2 CLOSED`；E8 登记 `P2 Status: Closure Candidate / Blocked`，G1/G7/G8 为 BLOCKED，G2–G6 证据待补，并明确 `P3 IMPLEMENTATION = BLOCKED`。
- **影响：** 决定当前产品阶段及 P3 实施能否开始。
- **建议：** 暂以 E8 的逐 Gate 执行状态作风险保守记录；不得覆盖正式冲突。由产品负责人审阅证据并签署唯一有效状态及版本化更正。
- **严重度：** BLOCKER。
- **决策负责人：** 代理产品负责人（由用户于本会话授权 Codex 履行）。
- **所需变更：** 修订 P2 Closure / E8 同步状态并留下批准记录；明确状态生效日期与替代版本。
- **状态：** RESOLVED BY PRODUCT DECISION PD-01；P2 仍未关闭，动态证据与正式签署仍待执行。

## CR-02｜P2 Gate 与 P3 实现之间的循环依赖

- **证据：** E8 要求 G2–G4 的真实运行证据，G5 独立评测依赖 G2–G4；同时规定 P3 实施仍 BLOCKED，直到 Gate 全部完成。
- **影响：** 空仓库无法产生真实运行证据，按现有顺序无法开工。
- **建议：** 评审 `p2-p3-gate-transition.md` 中的“静态准入 → 经授权实现 → 动态证据 → 独立评测”提案；不得降低任何 G01–G08 或 P0 验收义务。
- **严重度：** BLOCKER。
- **决策负责人：** 产品负责人；独立评测负责人共同确认其职责。
- **所需变更：** 经批准版本化修订 E8 / P2 Entry Gate，并定义 P2 与 P3-S1 的签署关系。
- **状态：** RESOLVED BY PRODUCT DECISION PD-02；顺序修订见 P2-EVIDENCE-8.1；A1–A6 已满足（2026-10-08），P3-S1 实施授权已签发（P3-S1-IMPL-AUTH-01 v1.1.0）；动态证据阶段已启动——首个迭代（F-1）动态证据 F1-E2E-0001 通过（2026-10-08，9/9 案例、12/12 断言）；GS-01–GS-06 完整动态执行与独立评测（G5）未开始。

## CR-03｜S1 C07–C08 与 C07–C09 契约重叠

- **证据：** 归档同时包含 `P3-S1-C07～C08…` 与 `P3-S1-C07～C09…`，职责边界和哪个版本具有权威性尚未确认。
- **影响：** Validator、Runtime 写入职责及实现接口可能重复或矛盾。
- **建议：** 对照两份全文和 C01–C06，明确 C07/C08/C09 的单一职责及替代关系；在批准前两份均为候选，不选择性实现。
- **严重度：** BLOCKER。
- **决策负责人：** 产品负责人及架构负责人（待命名）。
- **所需变更：** 产生合并/取代决议，记录唯一权威文件、版本、哈希和批准人。
- **状态：** 运行规范候选已由 PD-03 选定；C07–C08 不并行指导实现，但其规范章节处置与架构确认仍 OPEN，见 CR-10。

## CR-04｜C4、E4、E5 与 P3-S1-EXEC-01 的权威材料不完整

- **证据：** 归档含 E1 指向 C4 `llm_v1.0.0`、E4/E5 执行步骤，但未找到独立的 C4 正式文件、E4、E5 完整材料；P3-S1-EXEC-01 仅在会话摘录中出现，未进入 36 份归档文档。
- **影响：** LLM 边界、Memory/template 范围、证据执行环境和实现细节存在不可验证缺口。
- **建议：** 向用户/产品负责人确认它们是否存在于其他来源；在取得并核验前记为“本归档未提供”，不声称全局不存在，也不从会话摘要推断冻结文本。
- **严重度：** BLOCKER。
- **决策负责人：** 代理产品负责人（由用户于本会话授权 Codex 履行）。
- **所需变更：** 导入带来源和版本的正式原件，或由负责人批准新版本补齐；纳入哈希、owner 和签署记录。
- **状态：** 部分解决。E4/E5/EXEC-01 缺件按 PD-04 / PD-07 处理；C4 正式权威已建立（C4-LLM-Contract-v1.0.0，K-4/K-5 完成，CR-11 关闭）；E5 环境仍须搭建。

## CR-05｜首体验类型、路径与发布指标仍待批准

- **证据：** E2 为 First Experience Freeze Proposal，E3 为 Release-Gate Metric Definition；P3 规范和总基线稿对探索型问题体验及阈值的批准状态并非充分签署证据。
- **影响：** S1 范围与发布判断可能被实现者自行解释。
- **建议：** 产品负责人逐项批准首体验、标准路径、指标定义/阈值，或明确哪些仅属观察指标；不擅自编造数值。
- **严重度：** BLOCKER（范围 / 发布判定）。
- **决策负责人：** 产品负责人。
- **所需变更：** 版本化首体验与指标决议，标注批准人、日期、适用版本。
- **状态：** RESOLVED BY PRODUCT DECISION PD-05 / PD-08；首体验与无阈值内部切片规则已定。

## CR-06｜P2 G01–G08 与 S1 GS-01–GS-06、动作范围不一致

- **证据：** E8 G3 要求 G01–G08（Direct Answer、Why、What If、Creation、Change、Stop、Correction、Memory Boundary）；S1 核心集 GS-01–GS-06 名称不同；S1 规范将完整 WHAT_IF / CREATE 等列为后续阶段，而 API 还提供相关接口。
- **影响：** 不能用相似名称推定同一验收，也不能为未决动作臆造 S1 行为或把延期冒充 PASS。
- **建议：** 在 `acceptance-mapping.md` 逐条列来源条款、差异、阶段、证据和状态；冲突语义保持 OPEN，待负责人裁决。
- **严重度：** BLOCKER。
- **决策负责人：** 产品负责人及评测负责人（待命名）。
- **所需变更：** 批准 Golden Suite 映射与范围版本；延期案例明确 NOT RUN / DEFERRED。
- **状态：** RESOLVED BY PRODUCT DECISION PD-05 / PD-06 / PD-07；细化见 acceptance-mapping 与 P3-S1 分阶段范围。

## CR-07｜七份 P2 契约尚无完整冻结证据

- **证据：** E1 将 C1–C7 的 Authority、Fingerprint、Owner、Approval 全列为 PENDING，当前均 BLOCKED；文档存在和版本号不能替代批准。
- **影响：** 实现团队无法确认唯一权威文本及允许变更边界。
- **建议：** 先完成 G1 清单、哈希、owner 与正式批准；将归档副本视为候选参考。
- **严重度：** BLOCKER。
- **决策负责人：** 产品负责人及各契约负责人（待命名）。
- **所需变更：** 每份契约形成独立冻结记录；更新 E1 与来源登记册。
- **状态：** RESOLVED（2026-10-08）：来源选择经 PODR-001 裁决；G1 指纹登记（contract-authority-baseline v1.2.0 + C4 §1–§17 范围指纹）、职责核验（C1–C7 Steward 确认，steward-confirmation-c1-c7.md）与独立复核（R1 / P3-S1-REVIEW-006，ACCEPT WITH FINDINGS）全部完成；CR-07 关闭。G1 PASSED（2026-10-08）。

## CR-08｜版本治理与变更授权签署人未指定

- **证据：** E8 要求 G1/G8 owner approval；当前资料没有实名签署人、仓库路径审批记录或生效版本证据。
- **影响：** AI 编码团队无法判断谁有权解释歧义、批准例外或改变验收。
- **建议：** 指定产品、架构、评测、工程负责人及替补；为规格、Prompt、Model、Policy、Schema、评测语料建立版本化变更流程。
- **严重度：** BLOCKER。
- **决策负责人：** 产品负责人。
- **所需变更：** 治理决议、职责清单及签署模板。
- **状态：** PARTIALLY RESOLVED BY PD-10 / PD-14 / PD-15；ADR-0002 会签完成并生效（2026-10-08）；ADR-0002 Spike 已执行（run 2 S-1/S-2/S-3 全过，run 1 S-3 测试桩缺陷按 §5 如实登记，报告 ADR-0002-spike-report.md 已落档，仅作 ADR-0001 复核输入）；CR-09 / CR-10 / CR-11 / CR-13 签署已执行；2026-10-08 签署会已执行：C1–C7 Steward 确认、ADR-0001 独立复核（REVIEW-005）、G5 隔离声明；隐私六要素全部裁决签署（2026-10-09，P3-S1-PRIVACY-SIX-01 v0.4.0：存储位置=中国大陆（cn）/ 阿里云 / 云存储、访问控制=最小所需权限、加密=两层机制 + 密钥分离）；**本项关闭**。

## CR-09｜E8、CC01 与 CC02 跨契约案例编号空间碰撞

- **证据：** E8 G2 定义 CC-01 至 CC-12；P3-S1-CC02 定义 CC-01 至 CC-40；P3-S1-CC01 另定义 CC-01 至 CC-20。相同裸编号可分别指向 STOP、Session/Intent 生命周期、Memory 等不同主题；CC02 还包含 12 项硬检查、8 个 GXC 场景及 18 项负向案例。
- **影响：** 错误映射可能造成漏测、伪称覆盖，或把停止控制与生命周期问题混为一谈。
- **决策：** PD-11 v1.0.1 定义 E8-G2-CCxx、S1-CCxx（仅 CC02 §3）、S1-CCSPEC-CCxx、S1-CC02-Hxx、S1-CC02-GXCxx、S1-CC02-NEGxx 六类清晰标识。
- **所需变更：** 静态映射须逐项覆盖 12 + 40 + 20 + 12 + 8 + 18 项，标注范围、来源和状态；证据目录不得使用裸编号。
- **状态：** RESOLVED（2026-10-08）；命名空间裁决 + 全量映射 + A2 非作者复核签署（P3-S1-REVIEW-004，结论 ACCEPT）。G2 动态执行仍 NOT RUN。

## CR-10｜SRC-23 C07–C08 规范要求未完成迁移处置

- **证据：** SRC-23 §1–§32 与 SRC-24 并非简单章节改名；Model Registry、Capability Profile、选择输入、Provider Lock-in、Model Evaluation、模型升级和 A/B 实验等条款存在未证明等价或无直接对应项。
- **影响：** 仅声明 SRC-23 不指导实现，不能证明这些要求已被合并、排除或延期；实现可能遗漏模型与验证器边界。
- **决策：** 建立 `C4-LLM-scope-disposition-v1.md` 逐章处置草案；它不替代架构负责人对等价性和范围的确认。
- **责任人：** AI 架构负责人；涉及跨模型评测时由独立评测负责人共同确认。
- **状态：** RESOLVED（2026-10-08）；SRC-23 32 章经 AI 架构负责人逐项签署（C4-signoff-checklist v1.1.0；D1–D10 按对照简报裁定）。G1 整体仍待其余 G1 项（C1–C7 Steward 确认与非作者核验）。

## CR-11｜C4 自指、独立权威源与范围指纹缺失

- **证据：** SRC-24 将 C4 列为自身权威来源；现有基线曾以 SRC-24 全文件哈希代表 C4 子章节范围。归档未含独立 C4 正式契约。
- **影响：** 权威链循环，且整个文件哈希不能识别 C4 分节的精确内容边界。
- **决策：** PD-04 修订明确 C4 尚未成立；分节只能作为候选范围映射。须由 AI 架构负责人批准独立 C4 文件、精确章节 / 指纹和变更规则。
- **状态：** RESOLVED（2026-10-08）：C4 正式文件 C4-LLM-Contract-v1.0.0 已建立——D1–D10 裁定全部落实（K-4 批准，含 DP-1 语义动作枚举收紧与 DP-2 Decision Trace 代表方式确认），K-5 非作者会签 + §1–§17 全节 SHA-256 范围指纹登记完成；CR-11 关闭。G1 整体仍 NOT PASSED（待 C1–C7 Steward 确认与非作者核验）。

## CR-12｜C3 与 S1 同层动作顺序细化

- **证据：** C3 将 WHY 与 WHAT_IF 列于同一优先级层；S1 §12 将 WHY 置于 WHAT_IF 之前。
- **影响：** 若无解释，执行者可能误把局部排序提升为权限或全局优先级变化。
- **决策：** PD-12 将其限定为同层冲突时的解释顺序，不改变授权和动作集合；更高层动作依 C3 / State Machine，未知情况升级而非由 LLM 决定。
- **状态：** RESOLVED（2026-10-08）：产品解释已记录；静态映射完成（XCC-MAP）；非作者复核已签署（P3-S1-REVIEW-007，R3，ACCEPT WITH FINDINGS——复核确认该解释顺序不改变授权与动作集合）；CR-12 关闭。

## CR-13｜CC01 与 CC02 严重度分类适用范围

- **证据：** SRC-25 / CC01 §27 定义一致性错误的 P0–P3 等级；SRC-26 / CC02 §9 定义 P3-S1 硬失败及其阻断类别。两者覆盖范围有交叠，但并非同一分类表。
- **影响：** 负向案例和跨契约发现可能被错误地套用单一严重度来源，导致错误升级或降级。
- **决策：** PD-13 按来源范围分别适用；同一发现同时落入两种范围且等级不同，按较严格等级处理并记录。NEG14 / NEG17 的个案严重度由 A2 非作者复核人确认。
- **状态：** RESOLVED（2026-10-08）；交叉取严规则经 A2 非作者复核签署确认（P3-S1-REVIEW-004 §3-D）。

## CR-14｜状态版本写入字段命名跨契约分歧

- **证据：** SRC-27 §22 使用 `expected_version`；SRC-26 §4 CC-H04 要求携带 `session_id / experience_id / expected_state_version`；SRC-07 §30 Case 05 客户端发送 `state_version = 12`。三者指同一概念（写入时携带的期望状态版本，冲突即拒绝并返回 `STATE_VERSION_CONFLICT`）。
- **影响：** Schema / API 设计与 GS-05、S1-CC02-H04、S1-CC18 / S1-CC23 / S1-CC24 测试设计无法定稿；A2 通过条件要求"冲突有产品决议"。
- **严重度：** Important。
- **决策负责人：** 产品负责人。
- **所需变更：** 版本化裁决统一规范字段名，其余列为别名；映射与测试设计同步更新。
- **状态：** RESOLVED BY PRODUCT DECISION PD-16；落实情况经 A2 非作者复核确认（P3-S1-REVIEW-004 §3-E，2026-10-08）。

## CR-15｜E5 证据环境搭建授权方式

- **证据：** P3-S1-REVIEW-008 F-1：A5 / E5 就绪条件未满足（可复现执行环境未搭建、首次端到端试运行 NOT RUN）；环境搭建的授权方式（实施授权前的 scoped 许可，或作为实施阶段首个迭代任务）属产品负责人决定，本复核不作默认；ADR-0002 §3 的沙箱许可仅限 Spike 三项验证，不覆盖 E5 环境搭建。
- **影响：** A1–A4、A6 准入条件已满足；A5 为 P3-S1 实施授权唯一剩余前置；授权方式决定下一步执行内容与开工时点。
- **建议：** 裁决材料已备（`e5-environment-scoped-license-proposal-v1.md`，E5-LICENSE-PROPOSAL-01：选项 A scoped 预授权许可 / 选项 B 实施阶段首个迭代任务，含许可文本、排除项、约束与对比）；本登记不作默认。
- **严重度：** BLOCKER（实施授权前置）。
- **决策负责人：** 产品负责人。
- **所需变更：** 签发 scoped 许可（选项 A）或将 E5 环境搭建列为实施阶段首个迭代任务（选项 B）；版本化记录并同步 readiness-record 与 owner-roster。
- **状态：** RESOLVED BY PRODUCT DECISION PD-17（2026-10-08：选项 A——签发 scoped 预授权许可，许可文本见 E5-LICENSE-PROPOSAL-01 §2，许可编号 E5-SCOPED-LICENSE-01 已签发；搭建执行蓝图见该提案附录 A）；E5 环境搭建完成、E5-TRIAL-0001 试运行通过、E5 = PASSED（2026-10-08）；许可由实施授权 P3-S1-IMPL-AUTH-01 接续（superseded）。

## CR-16｜S1 §23 最低事件名称与 C6 权威事件名称调和

- **证据：** S1 §23 最低事件清单使用 intent_created / semantic_action_detected / user_action / version_conflict 等名称；C6 事件契约（SRC-06）使用权威名称 intent_received / intent_parsed / C6 §14 交互事件（question_asked / why_requested / what_if_requested / change_direction_requested / stop_requested）/ state_version_conflict。两者指同一事实类别但命名不同。
- **影响：** C6-MINSET 案例与 G2 跨契约一致性检查无法定稿；实现侧必须选择权威名称并记录调和依据，否则最低事件集验证不可判定。
- **建议：** 实施侧调和表（intent_created→intent_received；semantic_action_detected→intent_parsed（properties.semantic_action）；user_action→C6 §14 交互事件五项；version_conflict→state_version_conflict；其余 10 项同名）已建立并 staged 于 `artifacts/evidence/runs/F2-GS-0001/review/README.md`；本登记不作默认——须 R2 非作者复核确认后方可作为契约结论。
- **严重度：** Important。
- **决策负责人：** 非作者复核人（角色 8 流程，R2）。
- **所需变更：** 非作者复核签署确认调和表，或裁定替代映射并回写 XCC-MAP。
- **状态：** RESOLVED（2026-10-09：调和表经非作者复核签署确认，P3-S1-REVIEW-009 §2-A——作为契约结论生效；C6-MINSET 与 G2 事件次序检查依据成立；F-009-1 编号笔误已于本版本（v0.12.0）更正为 SRC-08，不影响映射实质）。

## CR-17｜policy_decided 事件发射时机与内容解释

- **证据：** C6 §18 定义 policy_decided 事件；S1 执行链（GS-04 NOCONT 案例）观测到实现于分支派发完成后发出 policy_decided，state_after 携带已应用效果（如 STOP 后 state_after.status=COMPLETED），被拒绝的决策 state_after 为 null；决策链本身在决策追踪（C6 §22/§23）中权威记录。
- **影响：** GS-04-NOCONT 案例断言与 G2 事件次序一致性检查依赖该解释；若解释错误，事件次序契约验证不可判定。
- **建议：** 实施侧解释（policy_decided 在分支派发完成后发出、携带已应用效果；决策链在决策追踪中权威记录；拒绝决策 state_after=null）已用于 F2-GS-0001；本登记不作默认——须非作者复核确认。
- **严重度：** Important。
- **决策负责人：** 非作者复核人（角色 8 流程，R2）。
- **所需变更：** 非作者复核签署确认该解释，或裁定替代语义并回写案例与 XCC-MAP。
- **状态：** RESOLVED（2026-10-09：解释经非作者复核签署确认，P3-S1-REVIEW-009 §2-B——作为契约结论生效；GS-04-NOCONT 断言与 G2 事件次序检查依据成立）。

## CR-18｜HTTP 形态 LLM 故障 503 证据的网关注入缝决策

- **证据：** F3-EB-0001 EB-12 子项（HTTP 形态 LLM 故障 → 503 LLM_UNAVAILABLE）登记为 NOT RUN：S1 服务端运行时（`src/experience/server-runtime.ts`）以合成模式构造运行时，未暴露 `LlmGateway` 注入缝，LLM 故障无法经真实 HTTP 触发；进程内形态已经 `LlmGateway` 接口注入覆盖故障路径语义（EB-06/EB-06-NO-RETRY-STOP/EB-07，F3-EB-0001 动态证据：恰好一次调用、retryable=true、有界恢复、失败后 STOP 合法）。
- **影响：** G4 工程边界证据的 HTTP 形态故障注入子项缺项。若 G5 独立评测要求 HTTP 形态 503 证据，则 G4 证据链不完整；若评测人接受进程内形态 + 静态映射为充分输入，该子项可登记 DEFERRED（须产品负责人批准，不得由实施侧自行解释）。
- **建议：** 选项 A——在 `server-runtime.ts` 增加环境门控的 `LlmGateway` 注入缝（仅证据/测试环境启用，默认合成模式不变；属产品源码变更，须确认实施授权范围扩展）；选项 B——维持不暴露，HTTP 形态 503 登记 DEFERRED TO 后续切片（产品负责人批准并回写 E5 交叉表与 PB 处置表）；选项 C——经 Next.js 路由层测试 seam（`app/api` 路由测试形态，不改产品源码）。决策权在产品负责人；实施侧不自行解释。
- **严重度：** Important（证据完整性；非 P0——进程内形态已覆盖故障路径语义，用户主权与状态完整性不受影响）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 产品负责人裁定选项 A/B/C；若 A，确认 P3-S1-IMPL-AUTH-01 实施授权范围扩展后实施；若 B/C，登记 DEFERRED 并回写 evidence-execution-plan §6.1 第 8 项与 F3 迭代记录 §3.4 的 NOT RUN 登记状态。
- **状态：** RESOLVED（2026-10-09：产品负责人裁决选项 B——维持不暴露网关注入缝，HTTP 形态 LLM 故障 503 登记 DEFERRED TO 后续切片；G4 证据链该子项按产品负责人批准登记 DEFERRED；已回写 evidence-execution-plan §6.1 / §6.2 第 8 项（v1.8.0）与 P3-S1-IMPL-ITER-003 §3.4（v1.1.0）；F3-EB-0001 EB-12 子项执行时 NOT RUN 登记保留于迭代记录 §3.4 与审阅包"未执行"节作为时点事实——审阅包为哈希锁定证据，不因本裁决修改）。**DEFERRED 项已履行（2026-10-09）：** S2a 首个迭代 F-1 经 P3-S2-IMPL-AUTH-01 v1.1.0 授权实施环境门控 `LlmGateway` 注入缝（CR-18 选项 A 形态——仅证据/测试环境启用，默认合成模式不变），动态证据 S2A-OBL-01-0001 通过（7/7 案例、12/12 断言、退出码 0；HTTP 形态 503 / LLM_UNAVAILABLE / retryable=true + 恰好一次调用 + 版本完整 + 失败后 STOP 合法 + 有界恢复 + 缝惰性 + 进程内回归）；P2-SIGNOFF-01 遗留债务 D-01 关闭（登记于 P2-SIGNOFF-01 v1.1.0 债务表）；本 CR 关闭切片完成。

## 实施迭代记录（首批义务 F-1）

- **证据：** P3-S1-IMPL-ITER-001 v1.0.0（`../p3-s1/implementation-iteration-f1.md`）；运行时切片 `app/api/experience/stream/route.ts` + `src/experience/`；动态证据 F1-E2E-0001（`artifacts/evidence/runs/F1-E2E-0001/`：9/9 案例 PASS、12/12 断言 PASS、退出码 0；进程内 + HTTP 双形态）；失败尝试 3 次按 ADR-0002 §5 归档（F1-E2E-0001-attempt-1-failed/、F1-E2E-0001-failed-2026-10-08T14-25-36-102Z/）；动态证据发现运行时缺陷 D-1（STOP 策略被要求加载内容语料致 500）与 D-2（终止事件仅写审计汇未 yield 给流），均已修复并登记。
- **影响：** P3-S1 实施授权 §3 首批义务 F-1 履行；G2–G4 动态证据执行启动（仅流式传输与取消传播路径）。
- **建议：** 下一迭代执行 GS-01–GS-06 完整动态执行与 C6 事件证据；G5 16 项评测包执行前由独立评测人（角色 5）先审阅本迭代材料。
- **严重度：** N/A（履行记录，非冲突）。
- **决策负责人：** 工程负责人（执行）；独立评测负责人（审阅与否决）。
- **所需变更：** 无（义务履行登记）；后续迭代按 E5 计划继续。
- **状态：** RECORDED（2026-10-08：F-1 已履行；退出码 0 不设置任何 Gate 为 PASS；G2–G4 仍 NOT PASSED；S1 未验收）

## 实施迭代记录（第二批义务 F-2）

- **证据：** P3-S1-IMPL-ITER-002 v1.0.0（`../p3-s1/implementation-iteration-f2.md`）；S1 运行时核心 `src/experience/runtime.ts`（1663 行）+ session / state-store / state-machine / classifier / validator / llm-gateway / events / decision-trace / server-runtime / chunks / fixtures（提交 `2a81d34`，20 文件、+6334/−10）+ 5 条 HTTP 路由 + `policy.ts` S1 §14 冻结全映射；动态证据 F2-GS-0001（`artifacts/evidence/runs/F2-GS-0001/`：40/40 案例 PASS、24/24 断言 PASS、退出码 0、14.6s；覆盖 GS-01…GS-06 含全部登记负向、S1-ACT-WHAT_IF、S1 §23/C6 最低事件集、C6 §7/§22/§23/§25/§27 契约校验、HTTP 形态端到端与负向、F-1 回归双形态、无真实提供方静态扫描、36 项归档哈希 + C1–C7 契约指纹、证据-代码绑定干净工作树）；失败尝试 2 次按 ADR-0002 §5 归档（`F2-GS-0001-attempt-2026-10-08T15-19-59-851Z/`、`F2-GS-0001-attempt-2026-10-08T15-21-16-354Z/`）；动态证据未发现运行时缺陷（案例/执行器侧缺陷 E-1…E-3 已修复登记）；F-1 切片文件（`http.ts`/`stream.ts`/`audit.ts`）本迭代零改动。
- **影响：** P3-S1 实施授权 §2 授权范围内 GS-01…GS-06 完整动态执行与 C6 事件证据履行；G2 动态跨契约一致性案例与 G4 工程边界专项仍 NOT RUN；CR-16（事件名称调和）与 CR-17（policy_decided 发射时机解释）已经非作者复核签署关闭（P3-S1-REVIEW-009，2026-10-09）。
- **建议：** 下一迭代执行 G2 动态跨契约一致性案例 + G4 工程边界证据；G5 16 项评测包执行前由独立评测人（角色 5）先审阅 F-1 与 F-2 迭代材料；CR-16/CR-17 提交 R2 非作者复核。
- **严重度：** N/A（履行记录，非冲突）。
- **决策负责人：** 工程负责人（执行）；独立评测负责人（审阅与否决）。
- **所需变更：** 无（义务履行登记）；后续迭代按 E5 计划继续。
- **状态：** RECORDED（2026-10-08：F-2 已履行；退出码 0 不设置任何 Gate 为 PASS；G2–G4 仍 NOT PASSED；S1 未验收）。。

## 实施迭代记录（第三批义务 F-3）

- **证据：** P3-S1-IMPL-ITER-003 v1.0.0（`../p3-s1/implementation-iteration-f3.md`）；本迭代产品源码零改动（F-2 运行时核心为已实施基线，`git diff 67aac55..64a1391` 对产品源码为空）；证据执行器 `tools/evidence/src/f3.mjs`（2645 行；21 案例 = 5 G2 动态跨契约一致性 + 16 G4 工程边界；28 断言 B1–B28；E5 §3 版本矩阵含 engineeringBoundaries 专项；提交 `69c49f2` 执行器、`67aac55` 执行器侧缺陷修复）；动态证据 F3-EB-0001（`artifacts/evidence/runs/F3-EB-0001/`：21/21 案例 PASS、28/28 断言 PASS、退出码 0、9.0s；G2 动态跨契约一致性——WHY/CHANGE 完整链路（含复合步骤 [CHANGE_DIRECTION, EXPERIENCE_STARTED, USER_ACTION] v3→v4）、generation 归属（experience_interrupted + generation_cancelled）与迟到达旧 generation 提交 STALE_GENERATION 拒绝、UNKNOWN 升级（INVALID_ACTION）与语义不匹配（INVALID_REQUEST）故障链、版本链每次合法提交恰好 +1 不变式；G4 工程边界 EB-01…EB-15 动态/静态证据——单一写入者导入图、失败不消耗版本号、HTTP 重复 request_id 幂等、I1–I4 可中断性、过期结果拒绝、重试边界恰好一次、超时有界恢复、confidence 决策不变性（含决策路径静态扫描）、前端边界、记忆/工具 S1 缺席证明与动态拒绝、API 错误映射可区分、完成边界用户主权、事件日志追加只写、可回放性；EB-16 由 E5 §3 版本矩阵覆盖；HTTP 形态 LLM 故障 503 执行时 NOT RUN 登记——S1 服务端运行时未暴露 LlmGateway 注入缝；2026-10-09 经产品负责人裁决（CR-18 选项 B）登记 DEFERRED TO 后续切片）；失败尝试 2 次按 ADR-0002 §5 归档（`F3-EB-0001-attempt-2026-10-08T16-06-20-267Z/` 提交 `4b5f1d6`、`F3-EB-0001-attempt-2026-10-08T16-07-30-452Z/` 提交 `0fe8011`）；运行产物提交 `64a1391`，运行绑定至 git 提交 `4b5f1d6`（尝试 3 启动时 HEAD，记录于 run-metadata.json code.gitHead；相对 `67aac55` 仅追加证据归档，产品源码一致；A23/B27 干净工作树）；动态证据未发现运行时缺陷（案例/执行器侧缺陷 F3-E-1…F3-E-9 已修复登记）。
- **影响：** P3-S1 实施授权 §2 授权范围内 G2 动态跨契约一致性与 G4 工程边界证据履行；G2–G4 的 Gate 判定属 G5 独立评测范畴（NOT RUN）；CR-16/CR-17 与 F-3 实施侧解释（事件名称调和表、policy_decided 发射时机、HTTP 状态码映射）已经非作者复核签署关闭（P3-S1-REVIEW-009，2026-10-09）；HTTP 形态 503 证据经产品负责人裁决（CR-18 选项 B，2026-10-09）登记 DEFERRED TO 后续切片。
- **建议：** G5 16 项评测包执行前由独立评测人（角色 5）先审阅 F-1、F-2 与 F-3 迭代材料；CR-16/CR-17 提交 R2 非作者复核；产品负责人就服务端运行时是否暴露 LlmGateway 注入缝作出决策。
- **严重度：** N/A（履行记录，非冲突）。
- **决策负责人：** 工程负责人（执行）；独立评测负责人（审阅与否决）。
- **所需变更：** 无（义务履行登记）；后续按 E5 计划进入 G5 独立评测。
- **状态：** RECORDED（2026-10-08：F-3 已履行；退出码 0 不设置任何 Gate 为 PASS；G2–G4 仍 NOT PASSED；S1 未验收）。

## PD-20｜P2 收束路径方向裁决（先关再建）

- **证据：** 用户 2026-10-09 指令"先关再建吧，持续推进我们的产品项目，进度有些慢了"；当前 Gate 状态：G1/G2/G4/G5/G6/G7 PASSED（G5 为有条件通过，2026-10-09），G3/G8 NOT PASSED；开放义务 OBL-01 / OBL-02 / OBL-03。
- **影响：** P2 收束阶段的工作顺序：先执行 P2 关闭切片（履行 P2 关闭义务），再进入 S2 功能构建。关闭切片覆盖：G3 黄金案例套件执行（OBL-03）、OBL-01 处置、OBL-02 方法批准，以及为使 P2 G01–G08 完整可执行所需的最小 G04 Creation / G07 Correction / G08 Memory Boundary 能力（最小形态见 E2 §13 / Stage 5；G04/G07/G08 案例语义见 Evaluation System §5）。
- **建议：** 关闭切片的产品能力增量属 S1 冻结范围（PD-05）之外，其实施范围须另经产品负责人版本化裁决（PD-21）后方可实施，实施侧不得自行解释或扩大；G3 黄金执行器（`tools/evidence/src/golden.mjs`，E5 证据工具，PD-17 scoped 许可范围内）先行创建并提交，执行与产物按 E5 流程归档；证据运行本身不构成 G3 PASS——G3 判定仍须经独立评测（角色 5）签署。
- **严重度：** N/A（方向裁决，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 登记本裁决并回写 PODR-001 / 本登记册 / readiness-record / owner-roster；PD-21 范围裁决待产品负责人作出；OBL-01 / OBL-02 / OBL-03 跟踪表按本裁决调度。
- **状态：** RECORDED（2026-10-09：产品负责人"先关再建"指令经代理产品负责人登记为 PD-20；关闭切片产品能力范围经 PD-21 裁决（2026-10-09 批准，关闭切片进入实施）；关闭切片已执行通过（G3-GOLDEN-0001 32/32 PASS）；G3 判定 PASS、G8 签署完成（2026-10-09），**P2 = CLOSED**——"先关"完成，进入 S2"建"阶段）。

## PD-21｜P2 关闭切片产品能力范围裁决（最小 G04 / G07 / G08）

- **证据：** PD-20 遗留待决项：关闭切片产品能力增量范围；最小形态见 E2 §13 / Stage 5；G04/G07/G08 案例语义见 Evaluation System §5；当前黄金套件 G04/G07/G08 为 DEFERRED 登记（G3-GOLDEN-0001：20/20 PASS + 3 DEFERRED，2026-10-09）。
- **影响：** 关闭切片产品源码变更授权：实施最小 Creation / Correction / Memory Boundary 能力，使 P2 G01–G08 完整可执行；范围外（完整 Creation、多轮分支、持久 Memory）仍冻结至 S2。
- **建议：** 按关闭切片设计实施：分类器新增 CREATE / CORRECTION 语义动作与当前会话方向信号（“不要这个 / 不要了 / 别这样”）；策略 policy_v1.0.0 → policy_v1.1.0（SemanticAction += CREATE / CORRECTION；PolicyAction += CREATE；CREATE → CREATE，CORRECTION → EXPLAIN——重评估为内部过程，须落到合法 Policy Action）；状态机新增 CREATION 阶段与 CREATE / CORRECTION 触发（独立规则数组，目标 ACTIVE，不与既有转换冲突）；Runtime 新增 executeCreate / executeCorrect（中断在途生成、版本化提交、合成 fixture 流，失败路径不提交、版本不变，EB-02 语义保持）；黄金套件 20 → 32 案例（G04/G07/G08 × NORMAL/NEGATIVE/BOUNDARY/FAILURE_RECOVERY）。G08 关闭切片形态为边界证明（无记忆模块、零持久化事件），非记忆产品。
- **严重度：** N/A（范围裁决，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 登记本裁决并回写 PODR-001 / 本登记册 / readiness-record / owner-roster / acceptance-mapping；策略版本升 policy_v1.1.0；实施后执行扩展黄金套件并登记证据；G3/G8 Gate 判定仍属独立评测（角色 5）。
- **状态：** APPROVED（产品负责人 2026-10-09“批准”——PD-21、OBL-01 处置、OBL-02 方法三项一并批准）；关闭切片源码变更授权生效；关闭切片已实施并经 G3-GOLDEN-0001 执行通过（32/32 PASS）；G3 判定 PASS、G8 签署完成（2026-10-09），**P2 = CLOSED**。

## 黄金套件执行记录（G3-GOLDEN-0001）

- **证据：** 证据执行器 `tools/evidence/src/golden.mjs`（提交 `2779ef1`；案例设计修复 `bc38fb5`；关闭切片实施 `b480757`）；动态证据 G3-GOLDEN-0001（`artifacts/evidence/runs/G3-GOLDEN-0001/`：32/32 案例 PASS、断言 A1–A10 全通过、退出码 0；G01–G08 八黄金案例 × NORMAL/NEGATIVE/BOUNDARY/FAILURE_RECOVERY 四维度 = 32 案例；含 PD-21 关闭切片 G04 Creation / G07 Correction / G08 Memory Boundary 最小实现（CREATE / CORRECTION 语义动作 + CREATION 阶段 + 当前会话方向信号，policy_v1.1.0）；进程内形态，真实 .ts 源字节；期望冻结自 F2-GS-0001 / F3-EB-0001 回归基线；运行绑定 git 提交 `b480757`，工作树干净；无 DEFERRED 登记——PD-19 延期义务经本关闭切片履行，完整语义仍 DEFERRED TO S2（acceptance-mapping §B））；历史尝试按 ADR-0002 §5 归档留存：`G3-GOLDEN-0001-attempt-2026-10-09T03-39-36-322Z/`（首次尝试失败：G02-NEG / G05-FR 失败——执行器侧案例设计缺陷 G3-E-1 / G3-E-2；产品源码零改动；修复登记于 `bc38fb5`）与 `G3-GOLDEN-0001-attempt-2026-10-09T04-37-02-222Z/`（关闭切片前 20/20 PASS + 3 DEFERRED 登记尝试）。
- **影响：** OBL-03（G3 黄金套件）执行义务履行：套件已创建并执行通过（本运行断言层面；关闭切片义务 PD-19 履行完毕）。G3 Gate 判定本身属独立评测范畴（角色 5）——审阅包裁决表已由独立评测人填写（`G3-GOLDEN-0001/review/README.md`，八案例裁决全 PASS，2026-10-09）；G3 判定 PASS（P2-G3-WORKSHEET-01 v1.0.0，角色 5 签署、产品负责人接受）。
- **建议：** 无（裁决已作出）；遗留项（完整 G04/G07/G08 语义、OBL-01、OBL-02）按 P2-SIGNOFF-01 遗留债务登记 D-01/D-02/D-03 跟踪。
- **严重度：** N/A（义务履行记录，非冲突）。
- **决策负责人：** 工程负责人（执行）；独立评测负责人（评测与否决）。
- **所需变更：** 无（义务履行登记）；G3 Gate 判定与 P2 关闭签署待独立评测 / 产品负责人。
- **状态：** RECORDED（2026-10-09：G3-GOLDEN-0001 关闭切片执行通过（本运行断言；32/32 PASS，无 DEFERRED）；G3 Gate 判定 PASS（角色 5 裁决并签署，2026-10-09）；G8 签署完成（2026-10-09）；**P2 = CLOSED**。

## G3 Gate 判定登记（P2-G3-WORKSHEET-01）

- **证据：** G3-GOLDEN-0001 证据包（32/32 案例 PASS；断言 A1–A10 全通过；无 DEFERRED 登记）；审阅包裁决表八案例逐项裁决全 PASS（`artifacts/evidence/runs/G3-GOLDEN-0001/review/README.md`）；G3 独立评测工作表 P2-G3-WORKSHEET-01 v1.0.0（`../p3-s1/g3-evaluation-worksheet.md`）。
- **影响：** G3 Gate 判定：**PASS**（2026-10-09）。G04/G07/G08 以 PD-21 关闭切片最小形态执行，评测人接受其为 P2 关闭条件；完整语义 DEFERRED TO S2 登记为遗留项（acceptance-mapping §B，PD-05/PD-06/PD-07）。
- **建议：** 无（判定已作出）；遗留项按 P2-SIGNOFF-01 遗留债务登记 D-01/D-02/D-03 跟踪。
- **严重度：** N/A（判定登记，非冲突）。
- **决策负责人：** 独立评测负责人（角色 5，PD-15）；产品负责人接受。
- **所需变更：** 无；Gate 状态同步 readiness-record / owner-roster。
- **状态：** PASSED（2026-10-09：G3 判定 PASS 经角色 5 独立评测负责人裁决并签署、产品负责人接受；双行签署登记于 P2-G3-WORKSHEET-01 v1.0.0 签署区）。

## G8 正式签署登记（P2-SIGNOFF-01）

- **证据：** P2 正式签署工作表 P2-SIGNOFF-01 v1.0.0（`../p3-s1/p2-signoff-worksheet.md`）：六类责任人（产品负责人 / 契约负责人 / 运行时架构负责人 / 策略与 AI 负责人 / 独立评测负责人 / 工程负责人）逐行签署，每行含 §14 签署包九要素（Signer Role / Signer Identity / Document Version / Evidence Package Version / Date / Decision / Comments / Outstanding Risks / Signature / Approval Record）。
- **影响：** G8 Gate 判定：**PASSED**（2026-10-09）。六行 Decision 一致为 APPROVE WITH DOCUMENTED DEBT；签署人均为用户本人（PD-15），一人多角色已按 owner-roster 规则 3 逐行分别签署并声明冲突。
- **建议：** 无（签署已完成）；遗留债务 D-01/D-02/D-03 按 P2-SIGNOFF-01 登记跟踪。
- **严重度：** N/A（签署登记，非冲突）。
- **决策负责人：** 六类责任人（用户本人，PD-15，逐行分别签署）。
- **所需变更：** 无；P2 关闭状态同步 readiness-record / owner-roster / acceptance-mapping。
- **状态：** PASSED（2026-10-09：G8 六类责任人签署完成，Decision 一致 APPROVE WITH DOCUMENTED DEBT）。

## P2 关闭登记（P2 = CLOSED）

- **证据：** P2 Exit Gate §15 关闭公式满足：G1 PASSED（2026-10-08）∧ G2 PASSED（经 G5，2026-10-09）∧ G3 PASSED（2026-10-09）∧ G4 PASSED（经 G5，2026-10-09）∧ G5 PASSED（有条件，2026-10-09）∧ G6 PASSED（2026-10-08）∧ G7 PASSED（2026-10-08）∧ G8 PASSED（2026-10-09）；P0 Violations = 0、Agency Blockers = 0、State Integrity Blockers = 0、Policy Compliance Blockers = 0。
- **影响：** **P2 = CLOSED**（2026-10-09）。产品进入 S2 功能构建阶段（PD-20"先关再建"——关闭已完成，进入"建"）。
- **建议：** S2 范围不变：完整 Creation / 多轮分支 / 持久 Memory 语义（PD-05/PD-06/PD-07）；OBL-01 HTTP 形态 503 首个 S2 迭代补测；OBL-02 延迟指标（方法 v1.0.0 已批准，指标宣称前须满足样本纪律并经 E3 统计 Gate）；G3 黄金套件跨迭代回归延续入 S2。
- **严重度：** N/A（阶段关闭登记，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 登记本状态并回写 PODR-001（PD-22）/ readiness-record / owner-roster / acceptance-mapping；S2 规划另经产品负责人版本化裁决。
- **状态：** CLOSED（P2 = CLOSED，2026-10-09；经 PD-22 产品负责人接受）。

## 实施迭代记录（S2a 首个迭代 F-1 / OBL-01）

- **证据：** P3-S2A-IMPL-ITER-F1 v1.0.0（`../p3-s1/implementation-iteration-s2a-f1.md`）；产品源码两文件变更（`src/experience/llm-gateway.ts` 新增 `EvidenceFaultLlmGateway`——证据故障注入网关，故障形态 unavailable / fail_once / succeed_once；`src/experience/server-runtime.ts` 新增 `resolveServerGateway()`——环境门控注入缝，仅 `EXPERIENCE_LLM_GATEWAY_SEAM === '1'` 时启用，默认合成模式不变；提交 `ed2d468`，`runtime.ts` 零改动）；动态证据 S2A-OBL-01-0001（`artifacts/evidence/runs/S2A-OBL-01-0001/`：7/7 案例 PASS、12/12 断言 PASS、退出码 0、9.0s；四服务器姿态 S1 unavailable / S2 fail_once / S4 succeed_once / S3 无缝惰性；HTTP 形态 503 / LLM_UNAVAILABLE / retryable=true、网关恰好一次调用无自动重试（EB-06）、失败写入不消耗版本号、失败后 STOP 合法（WAITING v4 → COMPLETED v5，终止事实经事件日志权威登记）、fail_once 有界恢复（首次 503 → 用户重试 200 全链路，内容逐字节等于合成语料）、SEAM-INERT（缝未设置时行为与 S1 一致 + 静态字节断言：门控以环境变量为唯一开关、缝实现无网络出口字节）、INPROC-REGRESSION（进程内形态完整链路回归）；E5 §3 版本矩阵含 OBL-01 可追溯性映射与注入缝规范；SHA256SUMS 26 项经 G3-E-3 双遍生成）；失败尝试 3 次按 ADR-0002 §5 归档（`S2A-OBL-01-0001-attempt-2026-10-09T06-44-38-524Z/`、`...-06-45-57-265Z/`、`...-06-46-43-347Z/`，随证据提交 `7a03b40` 入库——三次均为执行器侧缺陷：C6 信封字段名误用、体验状态语义误设、STOP 版本与流事件断言误设；产品源码无缺陷，运行时对错误输入的拒绝路径（409 STATE_VERSION_CONFLICT 等）在失败尝试中被动态验证）；CR-18 选项 B 登记的 DEFERRED 项（HTTP 形态 LLM 故障 503 补测）经本迭代履行，P2-SIGNOFF-01 遗留债务 D-01 关闭（登记于 P2-SIGNOFF-01 v1.1.0 债务表）。
- **影响：** OBL-01 履行；G5 第 8 项 DEFERRED 条件关闭（G5 = PASSED（有条件）的遗留条件之一解除；剩余遗留条件：OBL-02 延迟测量执行）；S2a 后续义务（G04 完整 Creation / G07 完整 Correction / WHAT_IF 完整分支 / Minimal Memory）NOT STARTED。
- **建议：** 独立评测人（角色 5）审阅本迭代 staged 材料（`artifacts/evidence/runs/S2A-OBL-01-0001/review/README.md`）并保留否决权；S2a 后续迭代按 PD-23 裁决范围继续；OBL-02 延迟测量执行前须满足方法第 5 节样本纪律。
- **严重度：** N/A（义务履行登记，非冲突）。
- **决策负责人：** 工程负责人（执行）；独立评测负责人（审阅与否决）。
- **所需变更：** 无（义务履行登记）；D-01 关闭已回写 P2-SIGNOFF-01 v1.1.0 / readiness-record v1.18.0。
- **状态：** RECORDED（2026-10-09：OBL-01 已履行；退出码 0 不设置任何 Gate 为 PASS；S2a 后续义务 NOT STARTED）。

## S2a F-2 语义冻结登记（CR-19）

- **证据：** S2A-F2-SEMANTIC-FREEZE-01 v1.0.0（`../p3-s1/s2a-f2-semantic-freeze-staged.md`——§1 语义完备性评估：G04 全部 16 项语义元素在 frozen 源（08 号 §3–§28 / 13 号 §15.4–§23 / E2 Stage 5 / S1 §37）中可机械派生、无产品语义空缺；§2 裁决区 D-01…D-05 全项裁决；§3 policy_v1.2.0 变更文本；§4 state_machine_v1.1.0 变更文本；§5 实施与证据计划大纲；§6 签署区产品负责人 + C1/C2/C3 Steward 确认完成）；P3-S2-IMPL-AUTH-01 v1.2.0（§4 逐切片升版修订）。
- **影响：** S2a F-2（完整 G04 Creation 语义）语义文本冻结（2026-10-09 产品负责人签署"签署"）——D-01 选项 2（逐切片升版：policy_v1.2.0=F-2 G04；policy_v1.3.0=F-3 G07+MODIFY 别名；policy_v1.4.0=F-4 WHAT_IF 完整；state_machine 同步 v1.1.0/v1.2.0/v1.3.0，授权 §4 映射经 v1.2.0 修订）；D-02 选项 A（创作子状态机轴外承载于持久创作对象，体验阶段轴不变）；D-03 选项 A（F-2 会话内持久，跨会话持久列入 F-5）；D-04 选项 A（补丁 operation 值域 {add, remove, modify}，REPLACE/TUNE/REBALANCE/RENAME/RESTYLE 作 modify 的 change 子型，SIMPLIFY/DEEPEN/REFRAME DEFERRED 至 S2b）；D-05 选项 A（CREATION_COMPLETE 经 STOP 执行路径在创作域登记，轴触发器不变，creation_completed 事件 + 决策追踪 reason 区分）。授权 §4 原单版映射废止。
- **建议：** F-2 实施按冻结文本 §5 大纲执行（新增 `src/experience/creation.ts`；policy_v1.2.0 升版；runtime CREATE 完整编排扩展；创作域事件词表；golden 套件 policy_version 断言同步）；证据执行器 `tools/evidence/src/s2a-f2.mjs`（8 案例草案见冻结文本 §5）；独立评测人（角色 5）保留审阅与否决权。
- **严重度：** N/A（语义冻结登记，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 实施 F-2（feat(s2a-f2)）→ 动态证据 S2A-F2-0001 → 迭代记录写回。
- **状态：** IMPLEMENTED（2026-10-09：F-2 实施完成——产品源码三文件（`src/experience/creation.ts` 新增 / `src/experience/runtime.ts` / `src/experience/policy.ts`，提交 `1fcadaf`）；动态证据 S2A-F2-0001 通过（10/10 案例、16/16 断言、退出码 0，提交 `c2155df`；材料 `artifacts/evidence/runs/S2A-F2-0001/`）；迭代记录 P3-S2A-IMPL-ITER-F2 v1.0.0；readiness-record v1.20.0。退出码 0 不设置任何 Gate 为 PASS；G5 独立评测 NOT RUN（staged 审阅包待独立评测人审阅））。

## S2a F-3 语义冻结登记（CR-20）

- **证据：** S2A-F3-SEMANTIC-FREEZE-01 v1.0.0（`../p3-s1/s2a-f3-semantic-freeze-staged.md`——§1 语义完备性评估：G07 全部 8 项语义元素在 frozen 源（C05.2/C05.3 / 08 号 §10–§13/§16/§27/§28 / Evaluation System V1 §5 G07 / S1 §37）中可机械派生、无产品语义空缺；§2 裁决区 D-01…D-05 全项裁决；§3 policy_v1.3.0 变更文本；§4 state_machine_v1.2.0 变更文本；§5 实施与证据计划大纲；§6 签署区产品负责人 + C1/C2/C3 Steward 确认完成）；P3-S2-IMPL-AUTH-01 v1.2.0 §2(2)/§3(3)/§4。
- **影响：** S2a F-3（完整 G07 Correction 语义）语义文本冻结（2026-10-09 产品负责人签署"签署"）——D-01 选项 A（MODIFY 别名登记 + 创作会话路由保护：分类器登记 08 §10 修改类型族为 CORRECTION 用户面别名；活跃创作会话内 CORRECTION 分类输入先经 RESTORE 预检、再经创作修改族预检，命中 → 创作解释（CREATE 伞形 + 补丁轮次），冲突判据 → ASK（08 §16），未命中 → 通用 CORRECTION 路径）；D-02 选项 A（纠正目标确定性规则派生，无新增模型调用）；D-03 选项 A（创作域由 F-2 补丁机制承载不重建，非创作域重评估链路完整化）；D-04 选项 A（RESTORE_PREVIOUS_VERSION 登记为 CORRECTION 用户面恢复子型——创作域回滚提交版本单调 +1，非创作域重评估 reason=restore_previous_version，不新增轴触发器）；D-05 选项 A（纠正域事件 correction_applied / correction_restored，C6 §14 命名模式）。
- **建议：** F-3 实施按冻结文本 §5 大纲执行（classifier.ts MODIFY/RESTORE 词表；新增 correction.ts；creation.ts 版本快照历史 + restore 补丁操作；policy_v1.3.0；runtime.ts 路由扩展 + executeCorrect 扩展；events.ts 纠正域事件词表；golden 套件 policy_version 断言同步）；证据执行器 tools/evidence/src/s2a-f3.mjs（8 案例草案见冻结文本 §5）；独立评测人（角色 5）保留审阅与否决权。
- **严重度：** N/A（语义冻结登记，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 实施 F-3（feat(s2a-f3)）→ 动态证据 S2A-F3-0001 → 迭代记录写回。
- **状态：** IMPLEMENTED（2026-10-09：F-3 实施完成——产品源码六文件（`src/experience/correction.ts` 新增 120 行 / `src/experience/classifier.ts` / `src/experience/creation.ts` / `src/experience/events.ts` / `src/experience/policy.ts` / `src/experience/runtime.ts`，提交 `3bae4d5`）；黄金套件 policy_v1.3.0 断言同步后 G3-GOLDEN-0001 再生验证 32/32 案例 PASS（运行绑定 gitHead `7ed44e3`）；动态证据 S2A-F3-0001 通过（8/8 案例、15/15 断言、退出码 0，提交 `9e7294a`；材料 `artifacts/evidence/runs/S2A-F3-0001/`）；迭代记录 P3-S2A-IMPL-ITER-F3 v1.0.0；readiness-record v1.23.0。退出码 0 不设置任何 Gate 为 PASS；G5 独立评测 NOT RUN（staged 审阅包待独立评测人审阅））。

## S2a F-4 语义冻结登记（CR-21）

- **证据：** S2A-F4-SEMANTIC-FREEZE-01 v1.0.0（`../p3-s1/s2a-f4-semantic-freeze-staged.md`——§1 语义完备性评估：两层结构——第一层（多轮模拟持久化 + 四元分离）8 项元素在 frozen 源（13 号 §15.2/§15.3/§15.5 / E2 Stage 3 / E8-G2-CC07 / G03 黄金断言）中可机械派生；第二层（分支生命周期模型与分支-主线关系）经核查为 frozen 源语义空缺（E2 Stage 4"Branch"实为 CHANGE_DIRECTION 编排；07 §3 current_branch 为标量字段；13 §15.3 未定义分支记录结构），按授权 §5.7 纪律由产品负责人版本化定义；§2 裁决区 D-01…D-05 全项裁决（含第二层分支语义定义裁决 D-02/D-03）；§3 policy_v1.4.0 变更文本（分层）；§4 state_machine_v1.3.0 变更文本（分层）；§5 实施与证据计划大纲；§6 签署区产品负责人 + C1/C2/C3 Steward 确认完成）；P3-S2-IMPL-AUTH-01 v1.2.0 §2(3)/§3(4)/§4。
- **影响：** S2a F-4（WHAT_IF 完整分支）语义文本冻结（2026-10-09 产品负责人签署"签署"）——D-01 选项 A（分层实施：第一层多轮模拟持久化随本版实施；第二层分支生命周期语义经 D-02…D-04 产品负责人版本化定义后于同一 policy_v1.4.0 冻结文本内补写生效）；D-02 选项 A（轴外分支子状态机——分支记录含 branch_id / 源模拟轮次 / 模拟结果记录（四元分离）/ 版本 / 生命周期状态，体验阶段轴不变；分支模拟结果默认不回流为主线结论）；D-03 选项 A（四操作最小集 CREATE / SWITCH / ABANDON / RETURN，操作识别为确定性规则词表）；D-04 选项 A（分支状态会话内持久，会话结束失效，跨会话属 F-5）；D-05 选项 A（simulation_recorded 事件四元分离字段化承载）。
- **建议：** F-4 实施按冻结文本 §5 大纲执行（events.ts 模拟域事件词表；新增 simulation.ts；runtime.ts WHAT_IF 执行扩展 + 分支操作路由；policy_v1.4.0；golden 套件 policy_version 断言同步）；证据执行器 tools/evidence/src/s2a-f4.mjs（8 案例草案见冻结文本 §5）；独立评测人（角色 5）保留审阅与否决权。
- **严重度：** N/A（语义冻结登记，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 实施 F-4（feat(s2a-f4)）→ 动态证据 S2A-F4-0001 → 迭代记录写回。
- **状态：** IMPLEMENTED（2026-10-09：F-4 实施完成——产品源码五文件（`src/experience/simulation.ts` 新增 437 行 / `src/experience/events.ts` / `src/experience/policy.ts` / `src/experience/runtime.ts` / `tools/evidence/src/golden.mjs` 断言同步，提交 `dcc94fc`）；黄金套件 policy_v1.4.0 断言同步后 G3-GOLDEN-0001 再生验证 32/32 案例 PASS；动态证据 S2A-F4-0001 通过（9/9 案例、16/16 断言、退出码 0，提交 `45abe78`；材料 `artifacts/evidence/runs/S2A-F4-0001/`）；迭代记录 P3-S2A-IMPL-ITER-F4 v1.0.0；readiness-record v1.24.0。退出码 0 不设置任何 Gate 为 PASS；G5 独立评测 NOT RUN（staged 审阅包待独立评测人审阅））。

## OBL-02 延迟测量执行登记（CR-22）

- **证据：** G5 = PASSED（有条件）遗留条件之一：OBL-02 延迟测量执行（本登记册"后续切片义务跟踪表"OBL-02；G5 工作表第 9 项 DEFERRED，2026-10-09；风险 R3）；测量方法 OBL-02-LATENCY-METHOD-01 v1.0.0 已经产品负责人按 E3 批准（2026-10-09；批准范围仅测量方法——分层与样本窗口纪律，不含统计阈值，PB-03 / PD-08）
- **影响：** 测量执行属工程义务（方法已批准，无新增产品语义）：按方法第 1–6 节执行 16 分层（2 执行形态 × 7 请求类别正常路径 + 2 故障恢复分层）× 30 提交 = 480 提交连续执行窗口；原始值与参考统计量按形态 / 类别 / 路径分层登记；本运行不产生任何统计阈值宣称
- **建议：** 动态证据 OBL02-LATENCY-0001（执行器 `tools/evidence/src/obl02.mjs`，npm run obl02；16/16 案例、12/12 断言、退出码 0——只表示本运行断言通过，不设置任何 Gate；材料 `artifacts/evidence/runs/OBL02-LATENCY-0001/`，SHA256SUMS 65 文件独立重算全部一致）；测量记录 P3-S1-OBL02-RECORD-01 v1.0.0（`docs/product/p3-s1/obl02-latency-measurement-record-v1.md`）；首次尝试（执行器侧 A5 断言缺陷：STOP 空语料路径 wallClockMs=0.00ms 低于客户端观测分辨率）按 ADR-0002 §5 归档保留（`OBL02-LATENCY-0001-attempt-2026-10-09T10-41-11-515Z`）
- **严重度：** N/A（义务履行登记）
- **决策负责人：** 产品负责人（方法批准，2026-10-09）；工程负责人（测量执行）
- **所需变更：** 回写 readiness-record（v1.25.0 → v1.26.0）；G5 工作表第 9 项由 DEFERRED 关闭属角色 5 独立评测负责人逐项裁决，经 P3-S1-G5-WORKSHEET-01 签署后生效（staged 审阅包 `artifacts/evidence/runs/OBL02-LATENCY-0001/review/README.md`，含第 9 项裁决表）——**已履行（2026-10-09：评测人裁决签署，裁决表 5/5 PASS；工作表升 v1.8.0；第 9 项 DEFERRED→PASS）**
- **状态：** EXECUTED（2026-10-09：测量执行完成——OBL02-LATENCY-0001 退出码 0；G5 = PASSED（有条件）遗留条件（OBL-02 延迟测量执行）已履行；本登记不改变任何 Gate 状态；**G5 第 9 项经角色 5 独立评测人裁决签署关闭（2026-10-09：DEFERRED→PASS，P3-S1-G5-WORKSHEET-01 v1.8.0；staged 审阅包裁决表 5/5 PASS）——G5 = PASSED（无条件）**）

## S2a F-5 语义冻结登记（CR-23）

- **证据：** S2A-F5-SEMANTIC-FREEZE-01 v1.0.0（`../p3-s1/s2a-f5-semantic-freeze-staged.md`——§1 语义完备性评估：第一层 11 项元素在 frozen 源（07 号契约 §2–§22 / 隐私六要素 P3-S1-PRIVACY-SIX-01 v0.4.2 / 授权 §2(4)/§5.8 / PD-23）中可机械派生；第二层 5 项为 frozen 源语义空缺（切片内持久化载体 / 记忆记录 schema / 记忆域事件词表 / 时间衰减参数 / 记忆检索接口面），按授权 §5.7 纪律由产品负责人版本化裁决；§2 裁决区 D-01…D-05 全项裁决；§3 policy_v1.5.0 变更文本（分层）；§4 state_machine_v1.4.0 变更文本（分层）；§5 实施与证据计划大纲；§6 签署区产品负责人 + C1/C2/C3 Steward 确认完成）；P3-S2-IMPL-AUTH-01 v1.2.0 §2(4)/§3(5)；PD-23（S2-SCOPE-PROPOSAL-01 §5 裁决区——Minimal Memory 产品级形态已经产品负责人裁决）
- **影响：** S2a F-5（Minimal Memory）语义文本冻结（2026-10-09 产品负责人裁决"裁决A"——D-01…D-05 全项选项 A）——D-01 选项 A（切片内本地持久化记忆记录存储——轴外持久对象，model on F-2 创作对象 / F-4 分支记录纪律；隐私六要素 cn / 阿里云 / 云存储为生产治理方向、不属切片实施范围）；D-02 选项 A（五阶段生命周期契约化——轴外记忆子状态机 {REMEMBERED, IN_USE, DECAYING, EXPIRED} + 操作 {CREATE, RECALL, DECAY, EXPIRE, CORRECT, WITHDRAW} + 记忆域事件词表 {memory_recorded, memory_corrected, memory_withdrawn, memory_expired}，承载于 C6 §7 已预留 memory 层）；D-03 选项 A（L5 信号注入 + Current Intent 覆盖不变 + 检索只读不改变体验）；D-04 选项 A（保留期最后更新起算默认 6 个月 + 到期自动删除 + 删除审计记录 + 07 §11 示例形态采纳为规范衰减参数）；D-05 选项 A（运行时内部写入 API + 用户纠正 / 撤回经确定性规则词表路由；模型 state_update 拒绝不变，GS-06）
- **建议：** F-5 实施按冻结文本 §5 大纲执行（新增 `src/experience/memory.ts`；`runtime.ts` Context Builder L5 集成；`policy.ts` policy_v1.5.0 文本；`state-machine.ts` state_machine_v1.4.0 生命周期契约；`events.ts` memory 域事件类型；`validator.ts` state_update 拒绝核验——既有覆盖确认）；证据执行器 `tools/evidence/src/s2a-f5.mjs`（案例面见冻结文本 §5）；G3 黄金套件扩展（F-5 案例，policy_v1.5.0 断言同步）；独立评测人（角色 5）保留审阅与否决权
- **严重度：** N/A（语义冻结登记，非冲突）
- **决策负责人：** 产品负责人（用户本人，PD-15）
- **所需变更：** 实施 F-5（feat(s2a-f5)）→ 动态证据 S2A-F5-0001 → 迭代记录写回
- **状态：** FROZEN（2026-10-09：语义文本冻结完成——产品负责人裁决 D-01…D-05 全项选项 A + 签署 + C1/C2/C3 Steward 确认完成（G1 式纪律）；F-5 实施授权生效（P3-S2-IMPL-AUTH-01 v1.2.0 §3(5)）；待实施与动态证据 S2A-F5-0001）

## S2b 语义冻结登记（CR-24）

- **证据：** S2B-SEMANTIC-FREEZE-01 v1.0.0（`../p3-s1/s2b-semantic-freeze-staged.md`——§1 语义完备性评估：第一层 7 项元素在 frozen 源（14 号契约 §7/§8 / 08 号契约 §五/§十 / E2 §5–§9 / S1 §11/§12/§37 / S2 范围提案 §4.1）中可机械派生；第二层 5 项为 frozen 源语义空缺（DEEPEN/SIMPLIFY/REFRAME 承载层 / SEARCH 启用形态与作用面 / First Experience 完整呈现范围 / policy_v2.0.0 精确文本），按授权 §5.7 纪律由产品负责人版本化裁决；§2 裁决区 D-01…D-05 + 附列项（VERIFY）全项裁决；§3 policy_v2.0.0 变更文本（分层）；§4 state_machine_v1.5.0 变更文本（分层）；§5 实施与证据计划大纲；§6 签署区产品负责人 + C1/C2/C3 Steward 确认完成）；PD-23 §6（S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结——本登记即该义务履行）
- **影响：** S2b 语义定义版本化冻结（2026-10-09 产品负责人裁决"裁决A"——D-01…D-05 + 附列项全项选项 A）——D-01 选项 A（DEEPEN / SIMPLIFY / REFRAME 启用为顶层语义动作（14 §8 恒等映射）+ 创作域顶层补丁操作承载（与 add / remove / modify 同级，08 §十 同级列举纪律）；操作识别为确定性规则词表）；D-02 选项 A（SEARCH 内部能力动作启用——14 §7"SEARCH 不是用户体验类型，而是一种内部能力动作"；14 §8 VERIFY → SEARCH / ANSWER 路由为既有执行路径；分类器不将普通输入分类为 SEARCH 语义动作）；D-03 选项 A（SEARCH 作用面：当前体验内容 / 创作对象 / 会话内上下文，只读；跨会话记忆检索属 F-5 记忆域 L5 检索，不经 SEARCH 动作）；D-04 选项 A（First Experience 完整呈现 = 呈现路径补全——入口流程 + 六阶段逐阶段呈现 + 完成 / 退出 / 中断完整流程；E2 契约面不变）；D-05 选项 A（policy_v2.0.0 + 优先级链扩展冻结 + state_machine_v1.5.0）；附列项 选项 A（VERIFY 语义动作不启用——SEARCH 内部能力已覆盖 14 §8 路由）
- **建议：** S2b 实施授权待另行签发（P3-S2B-IMPL-AUTH-01，staged 待签发——`implementation-authorization-s2b-v1.md`；生效条件：产品负责人签署 + S2a F-5 关闭）；S2b 实施按 S2B-SEMANTIC-FREEZE-01 §3/§4 冻结文本执行；动态证据 S2B-0001；更完整 Golden Suite 随 S2b 证据运行扩展；独立评测人（角色 5）保留审阅与否决权
- **严重度：** N/A（语义冻结登记，非冲突）
- **决策负责人：** 产品负责人（用户本人，PD-15）
- **所需变更：** F-5 关闭后签发 P3-S2B-IMPL-AUTH-01 → S2b 实施 → 动态证据 S2B-0001 → 迭代记录写回
- **状态：** FROZEN（2026-10-09：语义定义版本化冻结完成——PD-23 §6 义务履行；S2b 实施授权待另行签发（前置依赖：F-5 关闭））

## S2 范围裁决登记（PD-23）

- **证据：** S2-SCOPE-PROPOSAL-01 v1.1.0（`s2-scope-proposal-v1.md`，§5 裁决区已填写、§6 裁决记录）；S1 规范 §37（P3-S2 九项）/ §11（保留动作 DEEPEN / SIMPLIFY / REFRAME / CREATE / MODIFY / SEARCH）；acceptance-mapping §B / §C；07 号契约（Memory & User State Engine：六类数据状态、优先级链、生命周期）；E2 Stage 5（Creation 编排）；PODR-001 PD-05 / PD-06 / PD-07 / PD-20 / PD-22；P2-SIGNOFF-01 遗留债务 D-01 / D-02 / D-03。
- **影响：** S2 功能构建范围经产品负责人 2026-10-09 裁决（"同意"，四项建议全案批准）——批次=选项 B（分批）：S2a 核心能力收束（完整 G04 Creation：多轮分支 + 持久创作状态，E2 Stage 5 编排；完整 G07 Correction；WHAT_IF 完整分支；Minimal Memory），S2b 体验动作扩展（DEEPEN / SIMPLIFY / REFRAME / Search 启用、First Experience 完整呈现、更完整 Golden Suite）；S2a 策略升 policy_v1.2.0、状态机升 state_machine_v1.1.0（CREATION 完整阶段链 + CORRECTION 阶段语义；关闭切片 CREATION 阶段经本裁决契约化）；Minimal Memory 仅持久化短期记忆（跨会话主题 / 意图信号）+ 用户显式纠正 / 撤回记录，Current State / Session State 会话结束即失效，长期记忆（偏好画像）S2 不启用，默认保留 6 个月后自动删除，写入经 Runtime 单一写入者；OBL-01 编入 S2a 首个迭代（环境门控 LlmGateway 注入缝，CR-18 选项 A 形态，仅证据 / 测试环境启用，默认合成模式不变；HTTP 形态 LLM 故障 503 补测）。
- **建议：** S2 实施授权已签发（P3-S2-IMPL-AUTH-01 v1.1.0，产品负责人 2026-10-09 签署）；S2a 首个迭代 = OBL-01（开工）；S2b 新动作语义定义须在 S2b 授权前由产品负责人版本化冻结；S2b 须另行裁决与授权。
- **严重度：** N/A（范围裁决，非冲突）。
- **决策负责人：** 产品负责人（用户本人，PD-15）。
- **所需变更：** 回写 PODR-001（PD-23）/ readiness-record / owner-roster / acceptance-mapping；S2 实施授权签发后启动 S2a 实施。
- **状态：** APPROVED（产品负责人 2026-10-09"同意"——四项建议全案批准）；S2 实施授权已签发（2026-10-09，P3-S2-IMPL-AUTH-01 v1.1.0，AUTHORIZED）；S2a 首个迭代 F-1（OBL-01）开工。

## 执行器缺陷登记（G3-E-3）

- **证据：** golden.mjs 写入顺序缺陷：SHA256SUMS 于中间态计算，其后 summary.json / run-metadata.json 定稿重写（追加 A10 断言条目与最终退出码），致磁盘清单与最终汇总单文件不一致（summary.json）；独立重算 65/66 精确匹配；三个 G3 运行目录（本次 + 两次归档尝试）呈同一单文件模式；内容交叉核验为真（与 32 案例记录 / 轨迹一致）。
- **影响：** 证据清单时点性不匹配（同 F1/F2 风险 R6 模式）；非篡改；已提交证据保持冻结不改写。
- **建议：** 执行器修复：最终产物写入后重算 SHA256SUMS（提交 9054c53），保障未来运行（S2 回归）清单自洽。
- **严重度：** 低（执行器侧，不影响证据有效性）。
- **决策负责人：** 工程负责人（执行）。
- **所需变更：** 无（缺陷登记 + 修复提交 9054c53）。
- **状态：** RESOLVED（2026-10-09：修复提交 9054c53；已提交证据冻结保留，时点性模式登记为非篡改）。

## 后续切片义务跟踪（OBL-01 / OBL-02 / OBL-03）

G5 = PASSED（无条件）（2026-10-09，P3-S1-G5-WORKSHEET-01 v1.8.0——第 9 项经角色 5 独立评测人裁决签署关闭，两项遗留条件全部解除；v1.7.0 时点为有条件通过）登记三项义务（含 G3 黄金套件 OBL-03）。本节为跟踪登记（结论与风险权威登记见该工作表"风险评估登记"R1 / R3）；义务未履行前，相关 Gate 不得据此宣告通过，任何延迟指标宣称不得作出。按 PD-20（2026-10-09，先关再建），三项义务均调度入 P2 关闭切片先行履行，再进入 S2 功能构建。

| 编号 | 义务（来源） | 内容 | 触发条件 | 责任人 | 状态 |
|---|---|---|---|---|---|
| OBL-01 | HTTP 形态 LLM 故障 503 后续切片补测（CR-18 选项 B，2026-10-09；G5 第 8 项维持 DEFERRED；风险 R1） | 在后续迭代切片中补测 HTTP 形态 LLM 故障 503 行为（当前进程内形态经 `LlmGateway` 接口注入覆盖 S1 范围故障语义、逐案通过；HTTP 形态因 S1 服务端运行时未暴露网关注入缝而执行时 NOT RUN） | 首个 S2 迭代（产品负责人 2026-10-09 处置：不暴露网关注入缝，关闭切片不补测；作为已知限制在 Gate 披露中明示） | 工程负责人（执行）；产品负责人（注入缝决策）；独立评测负责人（评测） | RESOLVED（产品负责人 2026-10-09 批准，维持 CR-18 选项 B 延续处置：DEFERRED 贯穿 P2 关闭切片、已知限制披露、首个 S2 迭代补测；本处置不改变 G5 第 8 项既有 DEFERRED 记录） |
| OBL-02 | 延迟测量方法定义（G5 第 9 项 DEFERRED，2026-10-09；风险 R3） | 定义延迟测量方法（环境 / 模型 / 请求类别分层、样本窗口），经产品负责人按 E3 批准后方可进行任何延迟指标宣称；S1 当前不设统计阈值、运行耗时登记为参考值 | 任何延迟指标宣称或公开发布评估之前 | 产品负责人（批准）；工程负责人（定义草案） | RESOLVED（2026-10-09：方法草案 v0.1.0 经产品负责人按 E3 批准为 v1.0.0——`obl-02-latency-measurement-method-v1.md`；批准范围仅测量方法，不含统计阈值（PB-03 / PD-08）；任何延迟指标宣称仍须满足方法第 5 节样本纪律并注明分层；公开发布仍须另行满足 E3 统计 Gate）；测量执行已履行（CR-22，2026-10-09：OBL02-LATENCY-0001——16 分层 / 480 提交 / 16/16 案例 / 12/12 断言 / 退出码 0；证据 `artifacts/evidence/runs/OBL02-LATENCY-0001/`；记录 P3-S1-OBL02-RECORD-01 v1.0.0；G5 第 9 项经角色 5 独立评测人裁决签署关闭（2026-10-09，P3-S1-G5-WORKSHEET-01 v1.8.0：DEFERRED→PASS；G5 = PASSED（无条件）） |
| OBL-03 | 黄金案例套件（G3 Gate；P2 G08 黄金案例回归套件义务；G5 第 3 项裁决 N/A——S1 范围外） | 创建并执行黄金案例回归套件（跨迭代回归基准），作为 G3 Gate 证据；S1 范围已冻结（PD-05），本义务不扩大 S1 范围 | S2 / P2 关闭切片（P2 关闭收束前）；G3 保持 NOT PASSED 直至套件执行并通过 | 产品负责人（范围批准）；工程负责人（执行）；独立评测负责人（评测） | 履行完成（2026-10-09：G3-GOLDEN-0001 关闭切片执行通过——32/32 PASS（G01–G08 × 四维度），断言 A1–A10 通过，无 DEFERRED 登记；PD-19 延期义务经 PD-21 关闭切片履行；G3 Gate 判定 PASS（角色 5 独立评测负责人 2026-10-09 裁决并签署，P2-G3-WORKSHEET-01 v1.0.0）；**G3 PASSED**） |

## G6 产品债务处置表（PB-01…PB-04）

A3 / G6 通过条件要求 PB-01…PB-04 均有产品负责人明确决定、责任人和适用阶段。本表为逐项处置记录（2026-10-08 建立，独立审查 F-R3-1）。

| 编号 | 阻断项（来源） | 处置决定 | 决策依据 | 责任人 | 适用阶段 | 状态 |
|---|---|---|---|---|---|---|
| PB-01 | Seven V1 Contracts Authority Freeze（七份 V1 契约权威冻结；E1 §3 / §14） | 维持 BLOCKED：G1 通过前不得解除；解除条件为各契约 Owner 签署、C4 独立权威建立且范围指纹获批 | PODR-001 §7；contract-authority-baseline §3 | 产品负责人 + 各契约 Steward（用户兼任，PD-15） | 编码前（A1） | RESOLVED / 解除（2026-10-08：解除条件全部满足——G1 通过（C1–C7 Steward 确认 + R1 非作者复核 REVIEW-006 签署）；各契约 Owner 签署完成（steward-confirmation-c1-c7.md）；C4 独立权威建立（C4-LLM-Contract-v1.0.0，K-4/K-5）且 §1–§17 范围指纹获批） |
| PB-02 | First Experience Type & Canonical Path（首个体验类型与标准路径；E2） | 已解决：首体验冻结为探索型问题体验；完整体验路径跨 S1 / S2 | PD-05 | 产品负责人 | S1（范围已冻结） | RESOLVED |
| PB-03 | Release-Gate Metric Definitions（发布门槛指标定义；E3） | 已解决：硬门槛零容忍；无真实基线不编造统计阈值；面向公开发布的统计阈值须预先批准 | PD-08 | 产品负责人 | 公开发布前 | RESOLVED（S1 内部受控验证不受限） |
| PB-04 | Memory / Template Scope Decision（记忆 / 模板范围决策；E2 / E8 G08） | 已解决：S1 不持久化跨会话 Memory；隔离测试上下文验证当前意图优先；最小持久 Memory 进入 S2 须另作版本化决策 | PD-07 | 产品负责人 + 独立评测负责人 | S1 / S2 边界 | RESOLVED |

任何从 BLOCKED 改为延期的处理必须由产品负责人批准并通过版本化治理修订，不得由实施团队自行解释。

## 暂定护栏（不替代上述决议）

- 任何 Gate 都不因本文、测试全绿、演示成功或代码存在而变为 PASS。
- P0 用户主导权、状态完整性、策略边界违反仍是硬阻断。
- 未批准事项不允许由 AI 自行解释、缩小验收或以“先做了再说”绕过。
