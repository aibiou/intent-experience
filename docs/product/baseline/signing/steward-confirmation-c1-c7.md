# C1–C7 Steward 确认表（G1 契约权威冻结，A1）

**编号：** P3-S1-STEWARD-CONFIRM-01
**版本：** 0.1.0 DRAFT（2026-10-08：事实部分已按 contract-authority-baseline-v1.md v1.2.0 预填；**确认与签署栏待各 Steward 本人填写**）
**用途：** G1 要求七份 P2 契约均满足 Authority / Versioned / Fingerprintable / Owned / Approved 五性，且责任角色实名确认。本表只登记确认事实，不因填写而通过 G1。
**规则：** 每行须 Steward 本人确认并签署；用户本人兼任多角色时须逐行分别声明角色切换（OWNER-ROSTER-01 §2 规则 3）。

## 确认表

| 契约 | 权威源文件 | 采用版本 | SHA-256（归档源） | Steward 角色 | 五性确认 | 确认签署 | 日期 |
|---|---|---|---|---|---|---|---|
| C1 Core Schema | SRC-04 / 12｜Core Schema Specification V1 | core_schema_v1.0.0 | e6350ae427f6ccb75ea317345398932b2bc6fddd3b3b57af52296ba58ca2e20c | Schema Steward（架构负责人） | Authority / Versioned / Fingerprintable / Owned / Approved — **待确认** | PENDING | PENDING |
| C2 State Machine | SRC-05 / 13｜State Machine Specification V1 | state_machine_v1.0.0 | feb1130cacc0d628b983a5f46815c46fdb99e35245c797cdad476f29ba3499a1 | State Machine Steward（运行时架构负责人） | 待确认 | PENDING | PENDING |
| C3 Action & Policy | SRC-06 / 14｜Action & Policy Contract V1 | action_policy_v1.0.0（本基线赋予版本） | 15139925ae66c023b93e9c2adff3699a4812a1baedb228ebf2dc555db8c46c3f | Policy Owner（产品负责人） | 待确认（注：来源文档原状态 Draft for Product Freeze；版本为基线赋予，行为语义空缺须登记，不得由编码者补写） | PENDING | PENDING |
| C4 LLM Contract | 独立正式源 `docs/product/contracts/C4-LLM-Contract-v1.0.0.md`（SRC-23 逐章处置 + SRC-24 候选条款经裁定采纳） | C4-LLM-Contract-v1.0.0 | §1–§17 全节 SHA-256 范围指纹见契约 §18（2026-10-08 登记）；SRC-23 / SRC-24 整文件哈希仅用于归档完整性 | LLM Contract Owner（AI 架构负责人） | **已确认（K-4/K-5，2026-10-08，CR-10 / CR-11 关闭）**；G1 其余项待办 | 已完成（见契约 §18） | 2026-10-08 |
| C5 API | SRC-07 / 16｜API Contract V1 | api_v1.0.0 | 2470f0a33d38c0561fcf7b10e4d006b69f75eb4327e33ba48c365a71f21f82eb | API Owner（工程负责人） | 待确认 | PENDING | PENDING |
| C6 Event & Analytics | SRC-08 / 17｜Event & Analytics Contract V1 | analytics_v1.0.0 | 474d73c488744cf22fba2ce2013bfc63b2d7ac6129bf758c4fc46f30a5372671 | Event / Analytics Owner（数据工程负责人） | 待确认 | PENDING | PENDING |
| C7 Evaluation | SRC-09 / 18｜Evaluation System V1 | evaluation_v1.0.0 | ec07d4e68a9f5afaa6eea0c6a3a160619b2950083d0a2ca5c30d4b6f7cf563b0 | Evaluation Owner（独立评测负责人） | 待确认 | PENDING | PENDING |

## 确认前核验说明

- 归档源 SHA-256 与 `docs/product/reference/SHA256SUMS` 逐字节核验已通过（readiness-record"源资料可追溯"行，36 项哈希比较）；各 Steward 确认时可独立重算。
- C4 行已由 K-4/K-5 完成确认；本表保留该行以维持 G1 七契约全景完整。
- 哈希核验不得替代对契约内容适用性的确认；确认即表示接受该契约作为 G1 冻结权威。

## G1 判定

七行全部确认前，G1 保持 **NOT PASSED**；本表不单独授权运行时代码开发。
