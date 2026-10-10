# S3A 语义冻结文本：长期记忆启用（S3A-SEMANTIC-FREEZE-01 v1.0.0）

**编号：** S3A-SEMANTIC-FREEZE-01
**版本：** 1.0.0（RULED——语义定义经产品负责人裁决版本化冻结）
**状态：** RULED（产品负责人 2026-10-10 确认 S3-SCOPE-PROPOSAL-01 D-1 选项 A）
**日期：** 2026-10-10
**关联：** S3-SCOPE-PROPOSAL-01 v1.0.0（D-1 选项 A 裁决文本——本冻结文本为其版本化展开）/ 07 号契约 §5 Long-term Memory（门槛）/ §7（写入过滤）/ §8（类型层）/ §11（衰减）/ §12（L2 覆盖 L5 不变式）/ §13（撤回）/ §17（纠正）/ §20（检索纪律）/ §21（优先级链 L0–L6）/ §22（检索只读）/ S2A-F5-SEMANTIC-FREEZE-01 v1.0.0（记忆域基础——本版为其增量）/ PD-23（长期记忆 S2 不启用——本版经 S3 裁决解除该禁用）/ policy_v2.2.0（本版策略升版载体）/ C6 §14（事件属性扩展纪律）

## 1. 语义元素（冻结）

1. **写入门槛（07 §5——V1 只允许两类保存）：**
   - A 类——明确表达的长期偏好：用户显式表达长期偏好（source=explicit，confidence=1.0）；
   - B 类——用户明确要求记住：显式记住请求**携带明确偏好内容**（"记住 + 偏好表达"形态——记住请求与偏好表达同时命中；source=explicit，confidence=1.0）；
   - C 类——多次稳定出现且具长期价值：系统仅产生 candidate_long_term_preference **候选标记**（candidateLongTerm=true——候选 ≠ 已保存；V1 不允许仅凭行为自动升级为永久用户画像；候选标记不免除显式表达门槛——候选记录仍为短期记忆类（memoryClass='short_term'），不经显式表达不得升级为 long_term）。
2. **识别（确定性规则词表——同分类器纪律，具体词表为实现细节）：**
   - 长期记忆显式表达识别**仅在全部既有优先级层（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER）与记忆操作词表（WITHDRAW > CORRECT）未命中后调用**——仅认领会成为 UNKNOWN 的输入；不改变任何优先级层（零黄金回归面——S2B-SEMANTIC-FREEZE-01 D-01 碰撞核验纪律）；
   - B 类词表：记住请求标记（/请记住/、/帮我记住/、/要记住/、/记住/）**且**余下内容命中 A 类偏好词表（/我喜欢/、/我喜爱/、/我长期需要/、/我一直/、/以后都用/、/以后都/）——无偏好内容的裸记住请求（如"记住这个"）**不识别为记忆写入**——保持 UNKNOWN 升级纪律（未知情况升级而非由系统决定记忆内容——黄金 G08-NEG 不变式：零黄金回归面）；
   - A 类词表：显式偏好表达（同上一组偏好词表）——输入整体为偏好表达（无更高优先级层命中）。
3. **记忆记录扩展（轴外持久对象——D-01 选项 A 纪律沿用）：** MemoryRecord 增 memoryClass（'short_term' | 'long_term'——默认 'short_term'）与 candidateLongTerm（boolean——C 类候选标记，默认 false）；长期记忆记录写入时 source='explicit'、confidence=1.0（07 §5 门槛——存储层强制：memoryClass='long_term' 仅经显式表达路径写入）。
4. **优先级链（07 §21——长期记忆永远不是最高优先级）：** 长期记忆位于短期记忆之后（L6——优先级链 L0–L6 中最低用户状态层）；记忆信号仅作为 Context Builder 的 L5/L6 相关记忆信号注入（07 §20 检索纪律——以当前意图为检索键，只取相关记录，不全量塞入）；L2 Current Intent 覆盖 L5/L6（07 §12 不变式）；记忆检索为只读操作，不改变体验、不触发任何产品动作（07 §22）。
5. **保留与删除（PD-23 已裁决约束——S2 落地常量复用）：** 默认保留期自最后更新时间起算 6 个月（MEMORY_RETENTION_MS = 180 天），到期自动删除 + 删除审计记录（隐私要素 1/5——删除时间 / 记录范围 / 验证信息）；时间衰减纪律不变（07 §11 规范参数——指数衰减 k = ln(0.9/0.63)/3 ≈ 0.1189 / 天；长期记忆记录同样衰减——到期 EXPIRE + memory_expired）。
6. **用户主权：** WITHDRAW（→EXPIRED + 撤回留痕 + 删除审计，memory_withdrawn）与 CORRECT（内容更正 + 留痕，memory_corrected）复用 S2 记忆域既有生命周期与事件——长期记忆记录同样可被用户撤回 / 纠正（用户主权不因记忆类别而削弱）。
7. **写入纪律：** 写入仅经 Runtime 内部写入方法（单一写入者——PD-23 已裁决；GS-06 / CC02 H01/H05——模型 state_update 类提案拒绝）；写入侧执行 07 §7 不默认长期记住清单过滤（临时情绪 / 一次性兴趣 / 一次性任务 / 当前环境 / 单次拒绝 / 推测人格不得写入——命中即不记录，长期记忆路径同样过滤）。
8. **事件契约（C6 §14 派生纪律——属性扩展不新增事件名）：** 复用 memory_recorded 事件，properties 增 memory_class（'short_term' | 'long_term'）/ source / confidence（source / confidence 既有携带——memory_class 为本版新增属性）；memory_corrected / memory_withdrawn / memory_expired 事件契约不变。
9. **不主动画像（07 §5 边界）：** 系统不主动归纳用户画像——仅 A/B 类经显式表达保存；C 类仅候选标记；信号措辞纪律不变（"最近产生过较高兴趣" ≠ "用户喜欢 X"，07 §4）。

## 2. 裁决选项记录

- 选项 A（采纳）：启用长期记忆——07 §5 A/B 类经显式表达保存；C 类仅候选；优先级链位于短期记忆之后；默认保留 6 个月后自动删除；写入经 Runtime 单一写入者；WITHDRAW/CORRECT 主权复用；事件属性扩展（memory_class / source / confidence）。
- 选项 B（未采纳）：仅 A 类启用（B 类 / C 类候选处理另行裁决）。
- 选项 C（未采纳）：仅版本化定义语义（冻结），实施另行授权。
- 裁决：产品负责人（用户本人，PD-15）确认选项 A，2026-10-10（S3-SCOPE-PROPOSAL-01 D-1）。

## 3. 版本化变更（policy_v2.1.0 → policy_v2.2.0）

- 变更 1——长期记忆启用与写入门槛：记忆域范围由"仅短期记忆（S2 D-05 负向不变式——长期记忆写入路径不存在）"扩展为短期记忆 + 长期记忆（A/B 类经显式表达保存——07 §5 门槛；B 类须携带明确偏好内容——裸记住请求不识别为记忆写入）；C 类仅 candidate_long_term_preference 候选标记（候选 ≠ 已保存——V1 不允许仅凭行为自动升级为永久用户画像）。
- 变更 2——优先级链与保留纪律：长期记忆永远不是最高优先级（07 §5——位于短期记忆之后，L6）；默认保留 6 个月后自动删除（PD-23——复用 MEMORY_RETENTION_MS=180 天常量）；写入经 Runtime 单一写入者（PD-23）。
- 变更 3——记忆记录与事件属性扩展：MemoryRecord 增 memoryClass / candidateLongTerm；memory_recorded properties 增 memory_class / source / confidence（C6 §14 派生——属性扩展不新增事件名）。
- 变更 4——识别层增量：长期记忆显式表达识别（确定性规则词表——仅在全部既有优先级层与记忆操作词表未命中后调用；不改变任何优先级层——零黄金回归面；"记住这个"等无内容裸记住请求保持 UNKNOWN 升级纪律——黄金 G08-NEG 不变式）。

## 4. 不变式

- 体验阶段轴不变（记忆域为轴外域——同 F-5 D-02 纪律；state_machine_v1.5.0 不变——不新增体验轴触发器）。
- 语义动作域不变（PD-23 §5——长期记忆识别不新增顶层 SemanticAction / PolicyAction；识别仅作用于 UNKNOWN 输入）。
- 优先级层不变（STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN = SIMPLIFY = REFRAME > WHY = WHAT_IF > DIRECT_ANSWER——长期记忆识别位于全部层之后）。
- 记忆域生命周期状态机不变（{REMEMBERED, IN_USE, DECAYING, EXPIRED}——长期记忆记录同生命周期）。
- 检索只读不变（07 §22）；L2 覆盖 L5/L6 不变（07 §12）；不主动画像不变（07 §5）。
- 既有短期记忆语义不变（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0——短期记忆写入 / 再探索 / 衰减 / 主权纪律全量保持；本版为纯增量）。

## 5. 明确非结论

- 本冻结文本不设置任何 Gate 为 PASS；S2 时代 G5 评测结论（PASSED 无条件）不因本版改变。
- 真实 LLM 提供方接入与真实用户数据收集不属本版（须隐私六要素全部确定并经产品/安全负责人批准——另行治理；当前默认合成模式不变）。
- 候选标记（candidateLongTerm）为系统内部观察标记——不向用户呈现为"系统在画像"（07 §5 边界）。
- 长期记忆的生产形态存储治理（存储位置 / 访问控制 / 加密）按隐私六要素已批准方向执行，属生产部署治理、不属本版实施范围（同 S2A-F5 D-01 纪律）。

## 6. 签署区

- 起草：工程负责人角色（代理，Codex），2026-10-10（按 S3-SCOPE-PROPOSAL-01 D-1 选项 A 裁决文本展开）。
- 裁决：产品负责人（用户本人，PD-15）——选项 A 确认，2026-10-10（S3-SCOPE-PROPOSAL-01 v1.0.0 §6 签署区；standing authorization 2026-10-10 覆盖实施路径）。
- 登记：decision-register v0.28.0（CR-28 RULED）/ readiness-record v1.38.0。
