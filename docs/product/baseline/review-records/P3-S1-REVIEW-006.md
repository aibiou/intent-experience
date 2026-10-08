# P3-S1 独立复核记录：R1（契约权威与版本）

**记录编号：** P3-S1-REVIEW-006
**版本：** 0.1.0 DRAFT（2026-10-08：起草代理完成复核分析与机械核验；**待复核者签署**）
**状态：** DRAFT——PENDING 复核者签署；本草案不构成 A1 / G1 签署或任何 Gate 证据
**适用门禁：** P2-EVIDENCE-8.1 A1 / G1 契约权威冻结

## 1. 复核记录（按 independent-review-package.md §4 模板）

| 字段 | 记录 |
|---|---|
| Review ID | P3-S1-REVIEW-006 |
| 复核区块 | R1（契约权威与版本，对应 A1 / G1） |
| 复核者及角色 | PENDING（拟定：用户本人，角色 2 架构负责人 / 各契约 Steward，OWNER-ROSTER-01 v0.2.4，PD-15） |
| 复核者与作者关系 | 非起草方：基线文件、处置表、C4 正式文件由代理会话起草；复核者未参与内容起草（同 K-5 先例：起草代理与复核者无同一性） |
| 基线版本与 Git revision | contract-authority-baseline v1.2.0；source-of-truth v0.2.0；C4-LLM-scope-disposition v1.1.0；C4-LLM-Contract v1.0.0；owner-roster v0.2.4；Git 65179fd（origin/main） |
| 结论 | PENDING（草案建议见 §5） |
| Findings（含严重度 / 条款 / Gate） | F-1…F-4（见 §4）；无 Critical |
| 遗留问题 / 责任人 / 到期阶段 | C1–C7 Steward 确认与 G1 非作者核验（责任人：用户本人各角色；到期阶段：A1 签署先于实施授权） |
| 证据位置与哈希 | `docs/product/baseline/contract-authority-baseline-v1.md` v1.2.0；`docs/product/reference/SHA256SUMS`（36 项）；`docs/product/contracts/C4-LLM-Contract-v1.0.0.md` §18（§1–§17 指纹） |
| 日期与签署 | PENDING（2026-10-08 草案） |

**复核范围说明：** 本复核直接核验治理衍生文件（基线、登记册、处置表、C4 正式文件）之间的一致性与完整性；归档源文件（SRC-04…SRC-09 等）的字节完整性由 `reference/SHA256SUMS` 36 项哈希锁定（readiness-record"源资料可追溯"行记录逐字节比较通过），复核时按哈希登记核验其唯一性与准确性，不逐字重读归档源。

## 2. 机械核对项（起草代理已逐项执行，复核者可独立重跑）

- [x] C1–C7 七契约来源、版本、SHA-256 在 contract-authority-baseline §1 唯一登记；每契约单一权威源，无双来源冲突；C4 行已更新为 C4-LLM-Contract-v1.0.0（v1.2.0 修正）。
- [x] 归档源哈希与 `reference/SHA256SUMS` 36 项登记一致；36 项哈希及字节比较已通过（readiness-record）。
- [x] C3 `action_policy_v1.0.0` 为基线赋予版本：基线 §3 显式声明"没有改写任何归档源文件"；C3 来源文档原状态 Draft for Product Freeze 已标注；行为语义空缺登记义务条文化（"任何行为语义空缺仍需登记，不能由编码者补写"）。
- [x] SRC-24 自指问题已消除：C4 权威不再引用 SRC-24 自身章节；SRC-24 整文件哈希准确标记为归档完整性（非 C4 分节指纹，baseline §1 C4 行 + disposition §1）；独立 C4 正式文件已建立。
- [x] C4 正式文件、版本、精确范围、Owner 与批准证据齐备：C4-LLM-Contract-v1.0.0，K-4 批准 + K-5 非作者会签（2026-10-08），§1–§17 全节 SHA-256 范围指纹登记于契约 §18；CR-10 / CR-11 关闭。
- [x] C4 处置表覆盖 SRC-23 全部 32 章（disposition §2 共 32 行，§1–§32 无遗漏）；未完全对应条款逐项标注采纳 / 部分映射 / S1 排除 / 延期（如 §5 模型注册表不纳入、§23 模型评测延期为准入前置流程、§24 完整升级工作流不纳入 S1、§25 A/B 明确不在 S1 实施）；AI 架构负责人确认已完成（K-4）。
- [x] Owner 角色矩阵已建立（OWNER-ROSTER-01 v0.2.4，角色 1–8 实名人选）；C1–C7 Steward 确认表已预填事实（`signing/steward-confirmation-c1-c7.md`），确认栏 PENDING。
- [x] REVIEW-001 的 F-01（C07–C08 逐章处置与架构确认）/ F-02（独立 C4 权威、消除自指及范围指纹）随 C4 正式文件建立与 K-4/K-5 完成而关闭。

## 3. R1 必须确认事项逐条分析

1. **C1–C7 来源、声明版本、哈希和适用章节唯一准确**：已确认（§2 机械核对）。C4 的"适用章节"由 C4-LLM-Contract-v1.0.0 §1–§17 范围指纹精确界定。
2. **C3 版本只标记、未暗改原文行为**：已确认（§2）。基线赋予版本不改写归档字节；原文歧义处置见 F-2。
3. **SRC-24 自指章节不再被当作 C4；SRC-24 哈希标记准确；独立 C4 正式文件已由责任人批准**：已确认（§2；K-4/K-5 完成）。
4. **C4 处置表覆盖全部 32 章且逐项明确处置，由 AI 架构负责人确认**：已确认（§2；K-4 批准）。
5. **Owner 角色足以满足 G1；须实名确认的职责与签署人**：角色矩阵已建立；**C1–C7 Steward 确认（除 C4 外六行）与 G1 非作者核验未签署**——见 F-1。

## 4. Findings

| ID | 严重度 | 条款 / Gate | 发现 | 处置 |
|---|---|---|---|---|
| F-1 | **Important** | R1 / A1 / G1 | C1–C7 Steward 确认未签署（C4 已完成，其余六行 PENDING）；G1 非作者核验未执行 | 各 Steward 本人签署确认表；G1 非作者核验在确认完成后安排；完成前 A1 / G1 保持 NOT PASSED |
| F-2 | Minor | R1 / A1 | C3 来源文档原状态为 Draft for Product Freeze，版本系基线赋予 | C3 Steward 确认时须显式接受该版本化安排，并登记任何行为语义空缺（不得由编码者补写） |
| F-3 | Minor | R1 / G1 | source-of-truth 登记册中 SRC-10 / SRC-19 等历史冲突标注（BLOCKED / 声称 CLOSED）与 PD-01 裁决（E8 状态为准）一致，无新冲突；登记册本身不宣布批准 | 保持现状；P2 状态冲突的正式更正仍属产品负责人后续签署项（PD-01 已裁决以 E8 为准） |
| F-4 | Minor | R1 / G1 | G1 独立静态核验（非作者）未执行 | 待 C1–C7 确认完成后，由非作者核验人执行并登记 |

无 Critical finding；无 BLOCK 级未决项（F-1 为执行项：签署动作本身，非材料缺陷）。

## 5. 草案建议结论（待复核者确认）

**建议：ACCEPT WITH FINDINGS。** 理由：R1 材料完备、内部一致；REVIEW-001 的两项 R1 blocker（F-01 / F-02）已关闭；剩余 F-1 是 G1 通过条件本身的执行（Steward 签署 + 非作者核验），不是材料缺陷。材料层面已具备 A1 签署条件；A1 / G1 的通过仍待七行 Steward 确认与非作者核验实际完成。

**备选：** 若复核者认为 C3 的"基线赋予版本 + Draft for Product Freeze 原文"构成未解决歧义，则 F-2 升为 Important 并在 C3 Steward 确认前保持 A1 PENDING。该判定属复核者权限。

## 6. 签署区

| 签署 | 记录 |
|---|---|
| 复核者（角色 2 架构负责人） | PENDING |
| 结论（ACCEPT / ACCEPT WITH FINDINGS / BLOCK） | PENDING |
| 日期 | PENDING |

**注意：** 本记录签署 ≠ A1 / G1 签署；G1 保持 NOT PASSED 直至 C1–C7 Steward 确认与非作者核验完成。
