# Worklog — 个人体验引擎（intent-experience 愿景实现）

项目：在 /home/z/my-project 中逐步实现 https://github.com/aibiou/intent-experience 的产品愿景。
纪律：实现一步验证一步；无验证证据不宣称完成（对齐仓库治理哲学：退出码 0 ≠ 产品正确）。

---
Task ID: 1-a
Agent: Z.ai Code (主控)
Task: 读取 intent-experience 仓库契约参考，建立分步实施计划

Work Log:
- 克隆仓库至 /home/z/intent-experience-repo，通读 36 份产品归档、baseline 治理文档、G5 评测工作表、readiness-record（v1.80.0/CR-61）、迭代规划 D+A
- 精读四个核心实现作移植参考：classifier.ts（优先级链 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN=SIMPLIFY=REFRAME > WHY=WHAT_IF > DIRECT_ANSWER）、state-machine.ts（双轴：状态轴 ENTERING→READY→ACTIVE→WAITING→…→COMPLETED + 阶段轴 CURIOSITY→UNDERSTANDING→SIMULATION→CREATION→COMPLETION，非法迁移一律拒绝）、policy.ts（S1 冻结映射表）、catalog.ts（18 条体验种子，含 Screen03 hook/context/entries）
- 调用 LLM Skill 确认 z-ai-web-dev-sdk@0.0.18 后端用法（role:'assistant' 作 system prompt，thinking disabled）

Stage Summary:
- 本轮切片范围（对齐仓库 S1 等价）：GS-01 直接回答 / GS-02 上下文解释 / GS-03 换方向 / GS-04 停止零续行 / GS-05 版本冲突拒绝 / GS-06 LLM 不写状态（构造保证）
- 切片边界（诚实声明）：CREATE/DEEPEN/SIMPLIFY/REFRAME/REPEAT/记忆/作品墙 不在本切片，命中时按"范围外拒绝并升级"纪律给诚实的边界说明，不发明语义
- CHANGE_DIRECTION 的会话周期采用 S3B 语义（方向变更=endSession），单会话内候选周期为后续切片
