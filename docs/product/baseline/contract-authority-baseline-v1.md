# P2 / P3-S1 契约权威来源基线 V1

**编号：** CONTRACT-AUTHORITY-BASELINE-01
**版本：** 1.1.0
**状态：** 产品负责人已选定来源与基线版本；G1 尚未通过
**决策依据：** PODR-001 / PD-03 / PD-04
**哈希算法：** SHA-256；归档源指纹针对原文件字节，完整清单见 `docs/product/reference/SHA256SUMS`。治理衍生文件指纹须标明用途，不得冒充契约内容指纹。

## 1. P2 七份契约权威来源

| 契约 | 采用版本 | 权威源文件 / 来源编号 | SHA-256 | 责任角色 | 当前批准状态 |
|---|---|---|---|---|---|
| C1 Core Schema（核心结构） | core_schema_v1.0.0 | SRC-04 / 12｜Core Schema Specification V1 | e6350ae427f6ccb75ea317345398932b2bc6fddd3b3b57af52296ba58ca2e20c | Schema Steward（架构负责人） | 产品负责人采纳；架构责任人确认待办 |
| C2 State Machine（状态机） | state_machine_v1.0.0 | SRC-05 / 13｜State Machine Specification V1 | feb1130cacc0d628b983a5f46815c46fdb99e35245c797cdad476f29ba3499a1 | State Machine Steward（运行时架构负责人） | 产品负责人采纳；架构责任人确认待办 |
| C3 Action & Policy（动作与策略） | action_policy_v1.0.0（本基线赋予版本） | SRC-06 / 14｜Action & Policy Contract V1 | 15139925ae66c023b93e9c2adff3699a4812a1baedb228ebf2dc555db8c46c3f | Policy Owner（产品负责人） | 产品负责人采纳；文档原状态 Draft for Product Freeze，版本化基线待责任人确认 |
| C4 LLM Contract（大模型契约） | llm_v1.0.0 仅为候选标签，未获 C4 Owner 批准 | 独立 C4 正式源尚未建立；SRC-24 仅为候选；逐章处置见 `C4-LLM-scope-disposition-v1.md` | C4 指纹：未建立；范围处置登记 SHA-256：`45fe7db475dc95a0100da1ea4cf21a3501edf675c8d0a25035babff698d01530`（只绑定处置文本，不是 C4 分节指纹）；SRC-23 / SRC-24 整文件 SHA-256 仅用于归档完整性 | LLM Contract Owner（AI 架构负责人） | C4 权威尚未成立；架构负责人逐项确认、独立范围复核及正式版本化文件均待办；G1 BLOCKED |
| C5 API（接口） | api_v1.0.0 | SRC-07 / 16｜API Contract V1 | 2470f0a33d38c0561fcf7b10e4d006b69f75eb4327e33ba48c365a71f21f82eb | API Owner（工程负责人） | 产品负责人采纳；工程责任人确认待办 |
| C6 Event & Analytics（事件与分析） | analytics_v1.0.0 | SRC-08 / 17｜Event & Analytics Contract V1 | 474d73c488744cf22fba2ce2013bfc63b2d7ac6129bf758c4fc46f30a5372671 | Event / Analytics Owner（数据工程负责人） | 产品负责人采纳；工程责任人确认待办 |
| C7 Evaluation（评测与验收） | evaluation_v1.0.0 | SRC-09 / 18｜Evaluation System V1 | ec07d4e68a9f5afaa6eea0c6a3a160619b2950083d0a2ca5c30d4b6f7cf563b0 | Evaluation Owner（独立评测负责人） | 产品负责人采纳；独立评测负责人确认待办 |

## 2. P3-S1 实现契约来源

| 契约组 | 权威源 | 版本 / 状态 | 裁决 |
|---|---|---|---|
| C01–C04 Runtime Core（运行时核心） | SRC-21 / P3-S1-C01～C04 | 文档声明 Version 1.0 / FREEZE CANDIDATE；未获责任人批准 | 用户会话、意图、体验状态与状态机依各自分节；与 P2 C1–C2 不一致时暂停并升级决策 |
| C05–C06 Action & Policy（动作与策略） | SRC-22 / P3-S1-C05～C06 | 文档声明 Version 1.0.0 / FREEZE CANDIDATE；未获责任人批准 | Semantic Action 与 Policy 分权；引用 C3 唯一来源 |
| C07–C09 Gateway / Validator / Runtime（网关/验证器/运行时） | SRC-24 / P3-S1-C07～C09 | 文档声明 Version 1.0.0 / FREEZE CANDIDATE；未获责任人批准；整体哈希如上 | 当前 S1 候选综合操作规范；SRC-23 不指导实现，但其 32 章须完成逐章处置，未处置/未确认项不视为废弃 |
| Cross-Contract Consistency（跨契约一致性） | SRC-25 CC01 + SRC-26 CC02 | 各 1.0.0，Freeze Candidate；CC01 SHA-256 cf3aafdfa3d8372ad0d1ebc79b07b380cb47ab5bd6f45e62f3171452e56f1f8c；CC02 SHA-256 b8430bd46d5783d6fee562ab713fd8059e2f1dc77f0a8857d05ea3b9abd96f58 | 静态复核至少覆盖 CC01 20 项、CC02 40 项、12 项硬检查、8 个 GXC 场景及 18 项负向案例；详见 PD-11 修订和映射表 |

## 3. 冻结边界与 G1 状态

- 本基线为产品负责人明确的来源选择和版本分配；它没有改写任何归档源文件。
- 除 C4 外，以上 SHA-256 锁定候选归档原文件的完整字节；原始文件后续变化必须新建版本、重算哈希并执行回归，不覆盖旧证据。SRC-24 整文件哈希不等于 C4 分节指纹。
- C3 被分配 action_policy_v1.0.0，来源文档本身标为 Draft for Product Freeze；任何行为语义空缺仍需登记，不能由编码者补写。
- C4 正式权威源目前未建立。`C4-LLM-scope-disposition-v1.md` 仅列出 SRC-23 逐章处置及候选对应，不构成 C4 合同或批准；AI 架构负责人须确认全部条款、创建/批准独立 C4 版本，并由非作者核验精确范围和指纹。
- 产品负责人已批准选定范围；各责任角色确认、静态复核和 G1 签署仍待完成。
- G1 当前为 NOT PASSED；本表不能单独授权运行时代码开发。

## 4. 变更规则

任何字段、动作、权限、状态转换、LLM 边界、API、事件、评测通过语义的变更，必须有 Change ID、理由、影响分析、产品批准、版本号、哈希及回归证据。不得仅更改版本标签以掩盖内容变化。
