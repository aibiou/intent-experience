# P3-S1 独立复核记录：R2（编号与跨契约静态一致性）

**记录编号：** P3-S1-REVIEW-004
**版本：** 1.0.0（2026-10-08：复核者逐项确认五项裁定并签署；NEG14 / NEG17 裁定已回写 XCC-MAP v1.4.0）
**状态：** SIGNED——静态复核完成；本记录是 A2 静态复核证据；动态 G2 仍 NOT RUN，A2 准入判定由产品负责人在准入评审确认
**适用门禁：** P2-EVIDENCE-8.1 A2 / G2 静态

## 1. 复核记录（按 independent-review-package.md §4 模板）

| 字段 | 记录 |
|---|---|
| Review ID | P3-S1-REVIEW-004 |
| 复核区块 | R2（编号与跨契约静态一致性，对应 A2 / G2 静态） |
| 复核者及角色 | 用户本人（角色 8：A2 非作者复核人，OWNER-ROSTER-01 v0.2.1 第 8 行，PD-15） |
| 复核者与作者关系 | 非起草方：XCC-MAP / acceptance-mapping / decision-register 由 Codex 代理会话起草；复核者未参与该会话的内容起草；后续会话代理仅执行 PD-16 / N3-01 文本修订（非内容作者）。复核者与起草方无同一性 |
| 基线版本与 Git revision | XCC-MAP-01 v1.3.0；acceptance-mapping v0.3.1；decision-register v0.3.2；PODR-001 v1.0.4；independent-review-package v1.2.1；Git revision 640ac0f（origin/main） |
| 结论 | ACCEPT（五项裁定完成；机械核对 8 项无误；遗留仅动态执行 NOT RUN，不属静态复核范围） |
| Findings（含严重度 / 条款 / Gate） | 见 §3（5 项待裁定）；机械核对项见 §2 |
| 遗留问题 / 责任人 / 到期阶段 | NEG14 / NEG17 裁定已由起草方回写 XCC-MAP v1.4.0 §7（2026-10-08）；G2 动态执行待 E5 环境与实现授权；责任人：用户本人（角色 8）；到期阶段：A2 签署先于实施授权 |
| 证据位置与哈希 | `docs/product/baseline/cross-contract-static-mapping.md` v1.3.0；`docs/product/p3-s1/acceptance-mapping.md` v0.3.1；`docs/product/baseline/decision-register.md` v0.3.2；`docs/product/baseline/product-owner-decisions-v1.md` v1.0.4；Git 640ac0f |
| 日期与签署 | 2026-10-08，用户本人（角色 8，非作者）；本会话逐项确认；锚点：XCC-MAP v1.3.0 @ git 55a8e88（SHA-256 6d1cf171…） |

## 2. 机械核对项（已由复核者逐项核对）

以下为静态可核对事实，复核者已核对无误；不构成对规范性内容的批准：

- [x] 六个案例命名空间齐备且计数相符：E8-G2-CC01…12（12）、S1-CCSPEC-CC01…20（20）、S1-CC01…40（40 矩阵）、S1-CC02-H01…H12（12 硬检查）、S1-CC02-GXC01…GXC08（8）、S1-CC02-NEG01…NEG18（18）；无裸编号混用（XCC-MAP §1）。
- [x] §2 PD-16 / CR-14 字段命名调和注记在位：规范名 `expected_state_version`（SRC-26 §4 CC-H04），别名 `expected_version`（SRC-27 §22）/ `state_version`（SRC-07 §30 Case 05）；涉及行 S1-CC02-H04、S1-CC18、S1-CC23、S1-CC24 已列明。
- [x] S1-CC31 WAIT 澄清在位：WAIT 为 SRC-27 状态机状态 WAITING（WAITING→ACTIVE / WAITING→STOP），非 §11 语义动作。
- [x] 延期行均标记 NOT RUN / DEFERRED，无一处被记为 PASS：S1-CC32、E8-G2-CC05、E8-G2-CC08、S1-CCSPEC-CC10–17、CC12–15、CC20 等。
- [x] §8 严重度适用范围规则在位并引 PD-13 / CR-13：CC01 §27 与 CC02 §9 各自适用于来源范围；交叉情形按较严格等级；§9 的 10 类硬失败任一出现即直接阻断。
- [x] NEG14 / NEG17 未被预先定级（§7 两行均标"严重度待 A2 非作者复核"），符合 N-03 要求。
- [x] NEG01–13 / NEG15 / NEG16 / NEG18 已按 SRC-26 §9 具体类别标注 P0（16 项，见 §3-C）。
- [x] XCC-MAP §9 自述"尚无非作者独立复核记录；G2 静态准入仍 NOT PASSED"，与本记录状态一致。

## 3. 待复核者裁定事项（5 项，均须本人逐项确认）

### A. NEG14（Retry 改变原 Intent，关联 S1-CC25）定级

- 原文状态：负向必测；严重度待 A2 非作者复核，若触发 Policy / Agency 硬违规则按适用分类处理。
- 事实依据：SRC-27 §10 与 SRC-23 §15 均规定重试不得改变 User Intent / Experience Goal / Policy Decision / State Version；SRC-24 §10 同（并增 Semantic Action）。
- 候选结论：
  - A1（建议）：定级 **P0 / Policy Bypass**——重试若实际改变原 Intent，即执行了被 Policy 禁止的语义变更，落入 §9 "Policy Bypass" 硬失败类；
  - A2：仅在重试链完整记录且未改变实际执行结果时降级为 P1（记录完整性问题）。
- 复核者裁定：**A1 采纳——NEG14 定级 P0 / Policy Bypass（2026-10-08）**：重试若实际改变原 Intent，即落入 SRC-26 §9 "Policy Bypass" 硬失败类。

### B. NEG17（Provider timeout 被伪装成功，关联 S1-CC28 / 29 / 36）定级

- 原文状态：负向必测；严重度待 A2 非作者复核，不预先映射为 P1 或 P0。
- 事实依据：SRC-23 §10 与 SRC-24 §11 均禁止"把失败隐藏成成功"；SRC-24 §7.1 明确 SUCCESS "不代表产品接受"；SRC-24 §28 硬阻断含 Unrecorded LLM Error / Unrecorded LLM Call。
- 候选结论：
  - B1（建议）：基础定级 **P1**——伪装成功本身是失败分类与调用记录完整性违反（S1-CC02-H10 硬检查）；
  - B2：若伪装后的响应未经 Validator 即进入 Runtime，则升级为 **P0**（Stale Result enters Runtime / Validator bypass，按 §9 适用类别）；
  - B3：若仅记录错误但分类错误（timeout 记为 success），维持 P1 并要求分类修正。
- 复核者裁定：**B1 采纳并保留 B2 升级条件（2026-10-08）**：基础 P1（失败分类 / 调用记录完整性，S1-CC02-H10）；若伪装响应未经 Validator 进入 Runtime，按 Stale Result enters Runtime / Validator bypass 升 P0。

### C. NEG01–13 / NEG15 / NEG16 / NEG18 派生 P0 逐项确认（16 项）

XCC-MAP §7 已按 SRC-26 §9 具体类别标注 P0。复核者须逐项确认映射类别正确：

| Case | 负向输入 | 已标类别 | 确认 |
|---|---|---|---|
| NEG01 | Frontend 直接改 State | Unauthorized State Mutation / P0 | 确认（2026-10-08） |
| NEG02 | LLM 直接改 State | LLM Direct State Mutation / P0 | 确认（2026-10-08） |
| NEG03 | Policy 直接改 State | Unauthorized State Mutation / Policy Bypass / P0 | 确认（2026-10-08） |
| NEG04 | 非法 State Transition | Illegal State Transition / P0 | 确认（2026-10-08） |
| NEG05 | stale generation | Stale Result enters Runtime / P0 | 确认（2026-10-08） |
| NEG06 | stale State Version | State Version overwrite / P0 | 确认（2026-10-08） |
| NEG07 | STOP 后旧结果返回 | STOP Violation / Stale Result enters Runtime / P0 | 确认（2026-10-08） |
| NEG08 | CHANGE 后旧结果返回 | CHANGE_DIRECTION Violation / P0 | 确认（2026-10-08） |
| NEG09 | Session END 后结果返回 | Stale Result enters Runtime / P0 | 确认（2026-10-08） |
| NEG10 | Validator REJECT 后 Runtime 执行 | Validator bypass / P0 | 确认（2026-10-08） |
| NEG11 | Policy DENY 后 LLM 执行 | Policy Bypass / P0 | 确认（2026-10-08） |
| NEG12 | Memory 覆盖当前 Intent | Memory overrides Explicit Current Intent / P0 | 确认（2026-10-08） |
| NEG13 | WAIT 自动继续 | Hidden Continuation / P0 | 确认（2026-10-08） |
| NEG15 | Fallback 绕过 Validator | Validator bypass / P0 | 确认（2026-10-08） |
| NEG16 | Analytics 修改 Runtime | Unauthorized State Mutation / P0 | 确认（2026-10-08） |
| NEG18 | malformed output 被接受 | Validator bypass / P0 | 确认（2026-10-08） |

### D. PD-13 交叉取严规则确认

确认：同一发现同时落入 CC01 §27 与 CC02 §9 两范围且等级不同时，按较严格等级处理并登记裁决；不得降级或平均分抵消；CC02 §9 十类硬失败任一出现直接阻断。

复核者确认：**确认（2026-10-08）**

### E. PD-16 字段命名落实确认

确认：状态版本写入规范名 `expected_state_version` 已在 XCC-MAP §2 注记与 acceptance-mapping GS-05 行落实；`expected_version` / `state_version` 为别名；S1-CC02-H04、S1-CC18、S1-CC23、S1-CC24 与 GS-05 的测试设计须同时记录规范名与来源表述；该裁决不改变任何验收语义。

复核者确认：**确认（2026-10-08）**

## 4. 签署区

| 角色 | 姓名 | 结论 | 日期 |
|---|---|---|---|
| A2 非作者复核人（角色 8） | 用户本人（兼任，PD-15；非起草方） | ACCEPT（五项裁定按建议确认并签署） | 2026-10-08 |

**提醒：** 本记录签署前，A2 / G2 静态保持 NOT PASSED；§3-A/B 的裁定结果须由起草方回写 XCC-MAP §7 对应行后方可关闭本记录；任何动态执行状态均为 NOT RUN，本记录不评价运行时正确性。
