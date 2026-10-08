# C4 逐章签署清单 V1

**编号：** C4-SIGNOFF-01
**版本：** 0.1.1（2026-10-08：§2 主题列改为 SRC-23 原文标题逐字引用，消除意译歧义；处置类别与结论不变）
**状态：** DRAFT——AI 架构负责人的签署工具；**未签署前 CR-10 / CR-11 保持 OPEN，G1 / A1 保持 NOT PASSED**
**依据：** `C4-LLM-scope-disposition-v1.md` v1.0.0（SHA-256 `45fe7db475dc95a0100da1ea4cf21a3501edf675c8d0a25035babff698d01530`）
**用法：** 每行给出结论：`接受`（处置成立）/ `修改`（写明修改意见，将触发处置表新版本）/ `升级讨论`（列入架构评审）。部分映射行建议在签署前对照 SRC-23 原文与 SRC-24 对应章节逐条核阅。本清单不改变处置表内容；签署不等于 C4 成立——C4 正式文件、版本与范围指纹仍须按 CR-11 另行建立。

## 1. 处置表 §3 人工确认项（先签这五项）

| # | 确认项 | 结论 | 签署 / 日期 |
|---|---|---|---|
| K-1 | §1–§32 处置是否完整、是否有遗漏的规范性要求 | PENDING | PENDING |
| K-2 | 各"部分映射"行的等价性与差异 | PENDING | PENDING |
| K-3 | 模型评测、模型升级和跨模型回归的责任链（与独立评测负责人共签） | PENDING | PENDING |
| K-4 | C4 正式文件、版本、精确范围、Owner 与批准证据 | PENDING | PENDING |
| K-5 | 最终文件与选定范围指纹（契约 Owner + 非作者复核者会签） | PENDING | PENDING |

## 2. SRC-23 逐章签署（§1–§32）

| 章节 | 主题（SRC-23 原文标题） | 处置类别 | 结论 | 签署 / 日期 |
|---|---|---|---|---|
| §1 | 核心原则 | 部分映射 | PENDING | PENDING |
| §2 | C07｜LLM Gateway Contract（大模型网关契约） | 映射草案 | PENDING | PENDING |
| §3 | 模型无关性要求 | 部分映射 | PENDING | PENDING |
| §4 | Model Configuration（模型配置） | 部分映射 | PENDING | PENDING |
| §5 | Model Registry（模型注册表） | S1 完整注册表不纳入；基础配置部分映射 | PENDING | PENDING |
| §6 | Model Capability Profile（模型能力画像） | 部分映射 / 待确认 | PENDING | PENDING |
| §7 | Model Routing（模型路由） | 映射草案 | PENDING | PENDING |
| §8 | 模型选择输入 | 部分映射 / 待确认 | PENDING | PENDING |
| §9 | 模型选择必须可追踪 | 映射草案 | PENDING | PENDING |
| §10 | Model Fallback（模型故障切换） | 映射草案 | PENDING | PENDING |
| §11 | 模型输出必须是 Proposal | 映射草案 | PENDING | PENDING |
| §12 | Structured Output（结构化输出） | 部分映射 / 待确认 | PENDING | PENDING |
| §13 | 模型调用生命周期 | 映射草案 | PENDING | PENDING |
| §14 | Cancellation（可取消） | 映射草案 | PENDING | PENDING |
| §15 | Retry Boundary（重试边界） | 映射草案 | PENDING | PENDING |
| §16 | C08｜Validator Contract（验证器契约） | 映射草案 | PENDING | PENDING |
| §17 | Validator 检查层 | 部分映射 / 待确认 | PENDING | PENDING |
| §18 | Validator 输出 | 映射草案 | PENDING | PENDING |
| §19 | REJECT / REVISE / FALLBACK | 映射草案 | PENDING | PENDING |
| **§20** | **Validator 不得替模型"脑补"** | **未证明等价 / G1 阻断** | PENDING | PENDING |
| §21 | 模型供应商适配层 | 映射草案 | PENDING | PENDING |
| §22 | Provider Lock-in 禁止项 | 部分映射 / 待确认 | PENDING | PENDING |
| §23 | Model Evaluation（模型评测） | 延期为准入前置流程 / G1 待确认 | PENDING | PENDING |
| §24 | 模型版本升级 | 部分映射；完整升级工作流不纳入 S1 | PENDING | PENDING |
| §25 | A/B 与实验边界 | 明确不在 S1 实施 | PENDING | PENDING |
| §26 | C07/C08 核心不变量 | 部分映射 / 待逐项确认 | PENDING | PENDING |
| §27 | C07/C08 必测案例 | 部分映射 / 待逐项确认 | PENDING | PENDING |
| §28 | C07/C08 Acceptance Gate（验收门） | 部分映射 / 待逐项确认 | PENDING | PENDING |
| §29 | 正式冻结后的模型架构 | 架构决定待负责人确认 | PENDING | PENDING |
| §30 | P3-S1 当前依赖链更新 | 规划材料，不作为产品行为契约 | PENDING | PENDING |
| §31 | Freeze Status（冻结状态） | 来源状态，不迁移为有效 Gate 结论 | PENDING | PENDING |
| §32 | 下一步 | 非规范性计划项 | PENDING | PENDING |

## 3. 签署

| 角色 | 姓名 | 结论 | 日期 |
|---|---|---|---|
| AI 架构负责人（LLM Contract Owner） | 用户本人（兼任，PD-15；签署行为待执行） | PENDING | PENDING |
| 独立评测负责人（仅 K-3 共签） | 用户本人（兼任，PD-15；G5 隔离安排待声明） | PENDING | PENDING |
| 非作者复核者（仅 K-5 会签） | 用户本人（非起草方，可任；PD-15） | PENDING | PENDING |

**提醒：** §20 为处置表自记的 G1 阻断行，签署"接受"须同时给出"事实/推断/未知/缺失信息如何被验证"的落地机制说明；任何"修改"意见将使本清单作废并触发处置表新版本与回归核验。
