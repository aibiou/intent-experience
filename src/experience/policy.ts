/**
 * S1 范围内策略解析（冻结映射）。
 *
 * 映射表为 S1 规范 §14 Policy Rules 的批准映射（acceptance-mapping §A/§C；
 * PODR-001 / PD-05 / PD-06 批准的范围）：
 * - DIRECT_ANSWER → ANSWER（C3 §8 单目标映射；GS-01）
 * - WHY → EXPLAIN（S1 §26 GS-02 冻结点）
 * - WHAT_IF → SIMULATE（S1 §14；仅基础单次模拟提案，不建立持久/多轮分支，PD-06）
 * - CHANGE_DIRECTION → CHANGE_EXPERIENCE（S1 §14；S1 硬边界，必须取消旧操作，P-02）
 * - STOP → STOP（C3 §7 单目标映射；S1 硬边界，永远优先，P-01）
 * - CREATE → CREATE（PD-21 关闭切片：最小 Creation Branch，C3 §7/§8 合法动作；
 *   完整 Creation 语义属 S2，PD-05/PD-06）
 * - CORRECTION → EXPLAIN（PD-21 关闭切片：重评估是内部过程，必须落到
 *   合法 Policy Action；EXPLAIN = 重评估后的纠正候选，G07）
 * - DEEPEN → DEEPEN / SIMPLIFY → SIMPLIFY / REFRAME → REFRAME
 *   （S2b：14 §8 恒等映射；S2B-SEMANTIC-FREEZE-01 v1.0.0 D-01 选项 A
 *   ——顶层语义动作，创作域顶层补丁操作承载）
 *
 * 治理约束：
 * - C3 行为语义空缺（G-1…G-7，见 c3-semantic-gap-register-v1.md）未由编码者补写：
 *   冻结点之外一律拒绝并升级，不在运行时发明语义。
 * - 范围边界（PD-05/PD-06/PD-07/PD-21）：SEARCH 禁用；不持久化跨会话 Memory；
 *   CREATE / CORRECTION 仅在 P2 关闭切片以最小形态启用，完整语义属 S2；
 *   S2b 起 SEARCH 为内部能力动作启用（D-02 选项 A——14 §7"SEARCH 不是
 *   用户体验类型，而是一种内部能力动作"），DEEPEN / SIMPLIFY / REFRAME
 *   为顶层语义动作（D-01 选项 A）。
 * - 策略不生成事实内容（P-04）；LLM 不允许自己选择最终 Action（P-05）。
 */

export type SemanticAction =
  | 'DIRECT_ANSWER'
  | 'WHY'
  | 'WHAT_IF'
  | 'CHANGE_DIRECTION'
  | 'STOP'
  | 'CREATE'
  | 'CORRECTION'
  | 'DEEPEN'
  | 'SIMPLIFY'
  | 'REFRAME';

export type PolicyAction =
  | 'ANSWER'
  | 'EXPLAIN'
  | 'SIMULATE'
  | 'CHANGE_EXPERIENCE'
  | 'STOP'
  | 'CREATE'
  | 'DEEPEN'
  | 'SIMPLIFY'
  | 'REFRAME';

/** 冻结映射表：键为 S1 范围内语义动作，值为对应策略动作（S1 §14）。 */
const FROZEN_POLICY_MAP: Readonly<Record<SemanticAction, PolicyAction>> = {
  DIRECT_ANSWER: 'ANSWER', // C3 §8 单目标映射；GS-01
  WHY: 'EXPLAIN', // S1 §26 GS-02 冻结点（C3 G-2 多目标选择准则未定义，仅此冻结点可实施）
  WHAT_IF: 'SIMULATE', // S1 §14；仅当前单次模拟提案（PD-06：不建立持久/多轮分支）
  CHANGE_DIRECTION: 'CHANGE_EXPERIENCE', // S1 §14；S1 硬边界（P-02：必须取消旧操作）
  STOP: 'STOP', // C3 §7 单目标映射；S1 硬边界（P-01：永远优先）
  CREATE: 'CREATE', // PD-21 关闭切片：最小 Creation Branch（C3 §7/§8 合法动作；完整语义属 S2）
  CORRECTION: 'EXPLAIN', // PD-21 关闭切片：重评估为内部过程，落到合法 Policy Action EXPLAIN（重评估后的纠正候选）
  DEEPEN: 'DEEPEN', // S2b（14 §8 恒等映射；S2B-SEMANTIC-FREEZE-01 D-01 选项 A——顶层语义动作，创作域顶层补丁操作承载）
  SIMPLIFY: 'SIMPLIFY', // S2b（同上——14 §8 恒等映射）
  REFRAME: 'REFRAME', // S2b（同上——14 §8 恒等映射）
};

/** S1 策略版本（决策追踪与策略事件记录使用，C6 §18/§22）。 */
/**
 * policy_v1.3.0（S2a F-3 版本化变更，2026-10-09 产品负责人批准——
 * S2A-F3-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3）：
 * CORRECTION 语义动作完整化（PD-21 关闭切片最小形态 → 完整 G07
 * 语义）：
 * 变更 1——MODIFY 登记为 CORRECTION 用户面别名（08 §10 修改类型族，
 * 与创作修改族同源，单一词表两处路由；策略映射 CORRECTION → EXPLAIN
 * 不变；不新增顶层 SemanticAction / PolicyAction——PD-23 §5；分类
 * 优先级层不变）；
 * 变更 2——G07 完整操作语义（定位目标：确定性规则派生——指代词表 +
 * 默认当前候选 / 创作分量映射，D-02 选项 A；局部修改：创作域经 F-2
 * 补丁机制、非创作域经重评估候选替换，D-03 选项 A；重生成：既有
 * 重评估链路保持；历史版本化：纠正域事件 correction_applied /
 * correction_restored，D-05 选项 A）；
 * 变更 3——CREATION 阶段纠正保持（F-2 变更 3：保持阶段且重评估创作
 * 子状态，不推进子状态机）+ 创作会话路由保护（D-01 选项 A：RESTORE
 * 预检 → 创作修改族预检 → 命中创作族 CREATE 伞形 / 冲突判据 ASK /
 * 未命中通用 CORRECTION）；
 * 变更 4——RESTORE_PREVIOUS_VERSION 登记为 CORRECTION 用户面恢复
 * 子型（词表：刚才那个更好 / 退回刚才那个 / 撤销刚才修改；创作域经
 * 创作存储回滚提交——版本单调 +1、新版本内容 = 目标历史版本内容、
 * user_changes 登记 restore 条目；非创作域经意图登记 + 重评估，
 * decision-trace reason=restore_previous_version；不新增体验轴
 * 触发器）。
 * 不变：CORRECTION → EXPLAIN、WHAT_IF → SIMULATE 关闭切片映射；
 * SEARCH 仍表外（PD-06）。
 */
/**
 * policy_v1.4.0（S2a F-4 版本化变更，2026-10-09 产品负责人批准——
 * S2A-F4-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3，分层——D-01 选项 A：
 * 第一层随本版生效；第二层分支语义经 D-02…D-04 产品负责人版本化
 * 定义后于本版冻结文本内补写生效）：
 * 变更 1——WHAT_IF 多轮模拟持久化（第一层，frozen 源可机械派生）：
 * WHAT_IF → SIMULATE 映射不变；执行语义由 PD-06 单次模拟提案扩展
 * 为多轮模拟持久化——每轮模拟结果经模拟域事件登记（simulation_recorded，
 * D-05 选项 A：properties 含 fact / inference / hypothesis / simulation
 * 四元分离字段 + 源输入摘要，模拟结果不得表现为事实——E2 Stage 3 /
 * E8-G2-CC07）；模拟历史会话内持久（D-04 选项 A——07 §3 Session State
 * 纪律，跨会话属 F-5）；多轮模拟阶段迁移保持 SIMULATION（13 §15.3）；
 * 每次合法提交版本恰好 +1（S1-12；stale 拒绝）；不新建 Session /
 * Experience（G03-N 不变式）。
 * 变更 2——WHAT_IF 分支语义（第二层，经 D-02…D-04 裁决补写生效）：
 * 轴外分支子状态机（D-02 选项 A——分支记录含 branch_id / 源模拟轮次 /
 * 模拟结果记录（四元分离）/ 版本 / 生命周期状态；体验阶段轴不变，
 * WHAT_IF 轮次保持 SIMULATION 阶段；分支模拟结果默认不回流为主线
 * 结论）+ 分支生命周期四操作最小集（D-03 选项 A——CREATE（WHAT_IF
 * 首轮自动创建分支记录）/ SWITCH（显式切换激活分支）/ ABANDON（放弃
 * 分支）/ RETURN（返回主线模拟上下文）；操作识别为确定性规则词表，
 * 具体词表为实现细节）+ 分支状态会话内持久、会话结束失效（D-04 选项 A）。
 * 不变：STOP / CHANGE_DIRECTION / DIRECT_ANSWER / CREATE / CORRECTION /
 * WHY 映射；SEARCH 仍表外（PD-06）；SIMULATION → CREATION 衔接
 * （13 §15.5，CREATE 触发器规则已覆盖）；Minimal Memory 语义随 F-5
 * （policy_v1.5.0）版本化变更冻结实施（P3-S2-IMPL-AUTH-01 v1.2.0 §4
 * 逐切片升版）。
 */
/**
 * policy_v1.5.0（S2a F-5 版本化变更，2026-10-09 产品负责人批准——
 * S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3，分层生效）：
 * Minimal Memory 策略章节（授权 §2(4)；PD-23）：
 * 变更 1——记忆域范围：仅短期记忆（跨会话主题 / 意图信号 + 用户
 * 显式纠正 / 撤回记录）；长期记忆 / 偏好画像禁用，写入路径不存在
 * （负向不变式）；六类数据状态区分纪律（07 §2–§6 + §8 类型层）；
 * 信号措辞纪律（"最近产生过较高兴趣" ≠ "用户喜欢 X"，07 §4）；
 * 写入侧过滤（07 §7 不默认长期记住清单：临时情绪 / 一次性兴趣 /
 * 一次性任务 / 当前环境 / 单次拒绝 / 推测人格不得写入）。
 * 变更 2——作用面纪律：记忆仅作为 Context Builder 的 L5 相关短期
 * 记忆信号注入（07 §21 优先级链 L0–L6；07 §20 检索纪律——以当前
 * 意图为检索键，只取相关记录，不全量塞入）；L2 Current Intent
 * 覆盖 L5（07 §12 不变式）；记忆检索为只读操作，不改变体验、不
 * 触发任何产品动作（07 §22）；L6 长期记忆层 S2 不存在（负向不变式）。
 * 变更 3——写入经 Runtime 单一写入者（授权 §5.8；GS-06 / CC02
 * H01/H05：模型 state_update 类提案拒绝——validator.ts 既有覆盖）；
 * 用户纠正 / 撤回经确定性规则词表识别（D-05 选项 A——model on
 * F-4 D-03 纪律）进入记忆域操作并留痕（memory_corrected /
 * memory_withdrawn 事件）。
 * 变更 4——保留与删除：默认保留期自最后更新时间起算 6 个月，到期
 * 自动删除 + 删除审计记录（隐私要素 1 / 5）；时间衰减采纳 07 §11
 * 示例形态为规范参数（指数衰减：Day 0 = 0.90 → Day 3 ≈ 0.63；
 * k = ln(0.9/0.63)/3 ≈ 0.1189 / 天）。
 * 变更 5——版本不变式：记忆记录操作不改变体验状态版本链（S1-12
 * 单调版本化仅约束体验状态；记忆域经自身记录与事件日志留痕）。
 * 不变：语义动作映射（F-5 不新增语义动作——DEEPEN / SIMPLIFY /
 * REFRAME / SEARCH 仍属 S2b 保留禁用，授权 §5.7；既有映射不变）；
 * SEARCH 仍表外（PD-06）。
 */
/**
 * policy_v2.0.0（S2b 版本化变更，2026-10-09 产品负责人批准——
 * S2B-SEMANTIC-FREEZE-01 v1.0.0 冻结文本 §3，分层生效）：
 * 体验动作扩展（DEEPEN / SIMPLIFY / REFRAME 启用 + SEARCH
 * 内部能力动作）：
 * 变更 1——SemanticAction 域扩展：启用 DEEPEN / SIMPLIFY /
 * REFRAME（14 §8 恒等映射 DEEPEN→DEEPEN / SIMPLIFY→SIMPLIFY /
 * REFRAME→REFRAME）；SEARCH 不入 SemanticAction 域（内部能力
 * 动作，14 §7——"SEARCH 不是用户体验类型"）；VERIFY 不启用
 * （附列裁决区选项 A——SEARCH 以内部能力动作启用即可覆盖
 * 14 §8 路由，VERIFY 类输入按既有 WHY / DIRECT_ANSWER 解释层
 * 处理）。
 * 变更 2——PolicyAction 域：确认 SEARCH 为内部策略动作
 * （14 §7 taxonomy 既有，无新增）；VERIFY 类输入按既有解释层
 * 路径处理，SEARCH 能力在这些路径内被调用（14 §8 路由纪律）。
 * 变更 3——创作域补丁操作域扩展：{add, remove, modify,
 * deepen, simplify, reframe}（F-2 D-04 冻结域 + D-01 选项 A
 * 三动作——整体验方向性操作（深入 / 简化 / 换角度），不可
 * 归约为局部修改，故为顶层补丁操作而非 modify 子型——F-2 将
 * REPLACE / TUNE / REBALANCE / RENAME / RESTYLE 降为 modify
 * 子型的归约纪律不适用于三动作）；modify 子型域不变
 * （{REPLACE, TUNE, REBALANCE, RENAME, RESTYLE}）。
 * 变更 4——优先级链扩展冻结：STOP > CHANGE_DIRECTION >
 * CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME >
 * WHY = WHAT_IF > DIRECT_ANSWER（同层解释顺序纪律不变，
 * model on S1 §12；分类器识别层位于 CREATE 之后、WHY 之前）。
 * 变更 5——非创作会话保护：DEEPEN / SIMPLIFY / REFRAME 输入
 * 在无活跃创作对象时按升级规则处理（C3 纪律，model on
 * F-2/F-3 创作会话路由保护——INVALID_ACTION 升级，不静默
 * 执行未定义语义）。
 * 变更 6——SEARCH 能力纪律：只读、不改变体验、不触发产品
 * 动作；无外部网络出口；检索范围限当前体验内容 / 创作对象 /
 * 会话内上下文（D-03 选项 A）；跨会话记忆检索属 F-5 记忆域
 * L5 检索（07 §20 纪律），不经 SEARCH 动作。
 * 不变：既有语义动作映射（DIRECT_ANSWER→ANSWER / WHY→
 * EXPLAIN / WHAT_IF→SIMULATE / CHANGE_DIRECTION→
 * CHANGE_EXPERIENCE / STOP→STOP / CREATE→CREATE /
 * CORRECTION→EXPLAIN）；Minimal Memory 语义（policy_v1.5.0）
 * 不变。
 */
/**
 * policy_v2.1.0（S2 分支回流版本化变更，2026-10-09 产品
 * 负责人批准——S2-BRANCH-REFLOW-DEF-01 v1.0.0 选项 A
 * 裁决语义，经产品实施授权路径签发补写生效）：
 * 显式回流操作（第五分支操作 ADOPT_BRANCH）：
 * 变更 1——ADOPT_BRANCH 注册为分支操作（词表优先级
 * RETURN > SWITCH > ABANDON > ADOPT_BRANCH；须命中
 * 分支作用域词表 + 可解析目标序号，否则走通用 SIMULATE
 * 执行路径——同 SWITCH / ABANDON 识别纪律）。
 * 变更 2——目标分支记录附加 adopted 标记（生命周期
 * 契约不变——ACTIVE / RETURNED / ABANDONED 三态不增
 * 第四态，adopted 为分支记录附加属性而非生命周期
 * 状态；幂等）。
 * 变更 3——模拟域事件 simulation_adopted（C6 §14 命名
 * 模式 <domain>_<past_participle> 派生；properties 含
 * branch_id / source_round / adopted_content 摘要 /
 * separation_invariant=simulation_result_is_not_fact——
 * 采用结果仍标记为模拟来源，模拟结果不得表现为事实，
 * E8-G2-CC07）。
 * 变更 4——采用结果呈现为新一轮模拟上下文（主线当前
 * 上下文不变——用户须另行 CREATE 提交方将采纳内容
 * 纳入作品，创作版本化纪律不变）。
 * 变更 5——确定性系统回合（llm_used=false，决策追踪
 * reasonPrimary=explicit_user_direction——同分支操作
 * 纪律）。
 * 不变：既有分支操作语义（CREATE / SWITCH / ABANDON /
 * RETURN）与"分支模拟结果默认不回流为主线结论"的默认
 * 语义（D-02 选项 A——显式回流是经用户指令的例外
 * 通道，非默认行为）；既有语义动作映射不变；不新增
 * 顶层 SemanticAction / PolicyAction（PD-23 §5）。
 */
export const POLICY_VERSION = 'policy_v2.1.0';

export type PolicyResolution =
  | { ok: true; semanticAction: SemanticAction; policyAction: PolicyAction }
  | { ok: false; code: 'ACTION_OUT_OF_S1_SCOPE'; semanticAction: string };

/**
 * 解析语义动作到策略动作。
 * 不在冻结表中的动作一律拒绝——包括已知但 S1 禁用的动作（CREATE/SEARCH 等）
 * 与语义未定义的动作（如 REPEAT/CONTINUE 等 G-1 空缺项）。
 */
export function resolvePolicy(semanticAction: string): PolicyResolution {
  if (Object.prototype.hasOwnProperty.call(FROZEN_POLICY_MAP, semanticAction)) {
    return {
      ok: true,
      semanticAction: semanticAction as SemanticAction,
      policyAction: FROZEN_POLICY_MAP[semanticAction as SemanticAction],
    };
  }
  return { ok: false, code: 'ACTION_OUT_OF_S1_SCOPE', semanticAction };
}
