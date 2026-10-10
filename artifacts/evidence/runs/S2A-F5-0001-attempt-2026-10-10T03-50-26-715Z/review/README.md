# S2A-F5-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S2A-F5-0001（S2a F-5 迭代：Minimal Memory——轴外记忆记录存储 + 四态生命周期 + 记忆域事件词表 + L5 Context Builder 信号注入 + 写入侧 07 §7 过滤 + Runtime 单一写入者）
日期：2026-10-09T13:32:41.841Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：9/9 全部 PASS
- 断言：14/14 通过
- 退出码：0（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 9 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；事件汇 + 决策追踪 + 审计汇按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：F-5 → 案例 / 断言映射；frozenDecisions：D-01…D-05 裁决文本引用；memorySemantics：policy_v1.5.0 记忆语义规范注册）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S2A-F5-SEMANTIC-FREEZE-01 v1.0.0 冻结文本）

- 跨会话持久化（CROSS-SESSION）：会话 A WHY → STOP → 记忆登记（主题 = 起源意图输入，意图信号 = 会话动作摘要）；会话 B 同主题 WHY → 生成上下文注入 memory_signals ×1（RECALL 经检索触发：REMEMBERED→IN_USE）；记忆记录跨会话归属不变；会话 B 零 memory 域事件（检索只读）
- 生命周期迁移（LIFECYCLE）：CREATE → RECALL → DECAY(Day 5) → 保持 DECAYING(Day 14) → EXPIRE(Day 19，decay_threshold)；保留期路径 Day 179 未到期 → Day 180 整 EXPIRE（retention_expired）；Day 0 = 0.90 / Day 3 ≈ 0.63 锚点（k = ln(0.9/0.63)/3）；删除审计（删除时间 / 记录范围 / 验证信息）
- 纠正 / 撤回（CORRECT-WITHDRAW）："记忆纠正：量子计算原理" → 主题更正 + corrections=1 + user_correction + 置信度 0.95 + 回到 REMEMBERED（memory_corrected 留痕）；"别再给我这个" → EXPIRED + 删除审计 reason=withdrawn（memory_withdrawn 留痕）；重复撤回幂等（no_memory_target / MEMORY_EXPIRED）；记忆操作不创建新体验
- 会话作用域负向（SESSION-SCOPED-NEG）：模拟分支状态随会话结束失效（getSimulation 拒绝）；已结束会话操作拒绝（INVALID_STATE_TRANSITION）；对照：短期记忆跨会话存活（六类数据状态区分纪律）
- 长期记忆禁用负向（LONGTERM-DISABLED）：静态——源码不含长期记忆 / 偏好画像标识符，四态 / 双来源联合恰定；动态——全流程后记录 source / lifecycle 仅在允许集合内
- Current Intent 覆盖（CURRENT-INTENT-OVERRIDE）：同主题 WHY——memory_signals ×1 注入但提交行为与无记忆时完全一致（EXPLAIN，why 语料逐字节，WAITING/UNDERSTANDING v4——07 §12）；WHAT_IF 无交集 → memory_signals ×0（07 §20 过滤）
- 检索只读负向（RETRIEVAL-READONLY）：零 memory 域事件；零自动启动；state_transitioned 恰为 WHY 流自身两次；连续 getMemory() 快照逐字节一致（07 §22）
- 单一写入者（SINGLE-WRITER）：越权提案（state_update_proposal 含 memory_record）→ POLICY_REJECTED（llm_state_mutation_forbidden）→ llm_output_rejected + state_write_rejected 留痕；快照 records=0；版本不变（GS-06 / CC02 H01/H05）
- 写入过滤负向（WRITE-FILTER）：六类不默认长期记住清单（07 §7）全部 write_filter；运行时级 "为什么一次性兴趣" WHY 分类不变但 STOP 路径写入被过滤

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）；P2 G01–G08 未覆盖案例
- S2a 其余义务：F-1/F-2/F-3/F-4 已关闭（CR-18/CR-19/CR-20/CR-21）；本切片为 F-5 收口
- S2b（DEEPEN/SIMPLIFY/REFRAME/Search——implementation-authorization-s2b-v1.md 待产品负责人签署后实施）
- "采用某分支结论"显式回流操作（F-4 D-03 选项 A 说明：须产品负责人另案版本化定义）
- 真实 LLM 提供方接入（须另经产品决策与隐私六要素批准）；真实用户数据收集（隐私六要素批准前禁用）；生产形态记忆存储治理（隐私六要素已批准方向：cn / 阿里云 / 云存储——属生产部署治理，不属本切片）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- 模拟语料（synthetic/simulate/v1）尾句"本提案为单次模拟，不建立分支状态"为 S1 基础形态遗留文本——F-4 起运行时建立分支状态；语料文本更新属产品语料裁决范围（另案，未决）

## 独立重跑

    cd tools/evidence && npm run s2a-f5   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S2A-F5-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
