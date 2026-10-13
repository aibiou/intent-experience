# P3-S1 实现准入基线计划

> **性质：** 非权威工作产物（会话工作草稿，2026-10-08 标注）。本文件不构成治理基线、产品契约或任何 Gate 证据；权威决策以 `docs/product/baseline/` 与 `docs/product/p3-s1/` 为准。

> 面向 AI 编码人员：逐项执行本计划前，必须使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 技能。

**目标：** 在不降低产品验收标准的前提下，建立可追溯的产品文档与决策基线，为 P3-S1 实现授权做好准备。

**方案结构：** 导入用户提供的规划资料，不暗中改变其含义；在此基础上建立权威来源、冲突、范围和门禁登记。本计划不包含运行时代码；只有准入决策和技术架构记录获批后，才另行编写代码实施计划。

**技术栈：** 本准入资料使用 Markdown 与 Git。此处暂不选择运行时技术栈；第 6 项任务会先形成架构决策记录，之后才规划应用代码。

**依据文档：** docs/superpowers/specs/2026-10-08-p3-s1-product-development-baseline-design.md

## 全局约束

- 运行时（Runtime）仍是产品状态的唯一写入者。
- 状态机（State Machine）仍是合法状态转换的唯一权威。
- 用户当前明确意图优先于历史记忆。
- STOP 和其他用户控制指令不能被生成结果或后台任务覆盖。
- 大语言模型输出仍是提案；不能修改状态、策略、记忆或分析事实。
- 仅有测试全绿不能证明产品通过。
- P0 用户主导权、状态完整性或策略边界违规均阻断验收。
- S1 不扩展成信息流、社交产品、完整创作 IDE 或完整记忆平台。
- 修改已冻结的产品契约必须有版本化决策和回归证据。

## 评审重点

- 源文件重复项或 AppleDouble 元数据：只导入 36 份唯一 Markdown 文档；在任务 1 核对数量和源文件哈希。
- P2 CLOSED 与 P2 BLOCKED 状态冲突：两者都登记，没有证据不得标记 PASS；在任务 3 要求明确状态裁决。
- 正式 C4、E4、E5 和仅存在于聊天中的 P3-S1-EXEC-01：只登记为“提供的 ZIP 中未找到”，不推断其他来源也不存在；在任务 3 核实。
- P2 G01–G08 与 S1 GS-01–GS-06，以及 WHAT_IF / CREATE 动作范围：在任务 5 逐项映射，未裁决语义保持阻塞。
- 门禁闭环：在不降低验收标准的前提下区分编码前准入与编码后运行证据；在任务 4 和任务 7 核对批准状态，防止虚报 PASS。

---

### 任务 1：导入并核验 36 份源文档

**涉及文件：**
- 下列 36 个源文档保留原始文件名，以便核对来源及文件哈希。
- 新增：docs/product/reference/07｜Memory & User State Engine｜记忆与用户状态系统 V1.md
- 新增：docs/product/reference/08｜Experience Creation Runtime｜从体验到创造 V1.md
- 新增：docs/product/reference/10｜Experience Runtime Engineering Protocol V1｜体验运行时工程协议.md
- 新增：docs/product/reference/12｜Core Schema Specification V1（核心数据结构规范 V1）.md
- 新增：docs/product/reference/13｜State Machine Specification V1（状态机规范 V1）.md
- 新增：docs/product/reference/14｜Action & Policy Contract V1（动作与策略契约 V1）.md
- 新增：docs/product/reference/16｜API Contract V1（接口契约 V1）.md
- 新增：docs/product/reference/17｜Event & Analytics Contract V1（事件与数据分析契约 V1）.md
- 新增：docs/product/reference/18｜Evaluation System V1（评测与验收体系 V1）.md
- 新增：docs/product/reference/SHA256SUMS
- 新增：docs/product/reference/E1｜Contract Authority Evidence Package（契约权威证据包）.md
- 新增：docs/product/reference/E2｜First Experience Freeze Proposal（首个体验冻结提案）.md
- 新增：docs/product/reference/E3｜Release-Gate Metric Definition（发布门槛指标定义）.md
- 新增：docs/product/reference/P2 Closure Evidence Pack — Part 3：Golden Suite Evidence（黄金验收证据）.md
- 新增：docs/product/reference/P2 Closure Evidence Pack — Part 4：Engineering Boundary Evidence（工程边界证据）.md
- 新增：docs/product/reference/P2 Exit Gate & Sign-off（P2 退出门槛与签署）.md
- 新增：docs/product/reference/P2-EVIDENCE-5.0 — Evaluation Evidence（独立评测证据）.md
- 新增：docs/product/reference/P2-EVIDENCE-6.0｜Product Debt - Open Decision Closure（产品债务与未决决策收束）.md
- 新增：docs/product/reference/P2-EVIDENCE-8.0 — Closure Evidence Execution Register（P2 关闭证据执行登记表）.md
- 新增：docs/product/reference/P2｜Product Engineering Contract（产品工程契约）正式收束与 P3 准入包.md
- 新增：docs/product/reference/P3-ENTRY-1.0｜Vertical Slice Entry Package（首个完整产品切片准入包）.md
- 新增：docs/product/reference/P3-S1-C01～C04｜Runtime Core Foundation Contracts（运行时核心底座契约）.md
- 新增：docs/product/reference/P3-S1-C05～C06｜Semantic Action & Policy Contracts（语义动作与策略契约）.md
- 新增：docs/product/reference/P3-S1-C07～C08｜LLM Gateway & Validator Contracts（大模型网关与验证器契约）.md
- 新增：docs/product/reference/P3-S1-C07～C09｜LLM Gateway、Validator & Runtime Contracts（大模型网关、验证器与运行时契约）.md
- 新增：docs/product/reference/P3-S1-CC01｜Cross-Contract Consistency Specification（跨契约一致性规范）.md
- 新增：docs/product/reference/P3-S1-CC02｜C01～C09 Cross-Contract Consistency Matrix（跨契约一致性矩阵）.md
- 新增：docs/product/reference/P3-S1｜Runtime Vertical Slice Specification（运行时首个完整产品切片规范）.md
- 新增：docs/product/reference/Product Development Governance V1｜产品化开发总流程与变更治理规范.md
- 新增：docs/product/reference/Screen 03｜第一体验入口：从“被推荐”进入“主动探索”.md
- 新增：docs/product/reference/Screen 04｜第一体验 Runtime：从“看见”到“参与”.md
- 新增：docs/product/reference/Screen 05｜实时理解与回答 Runtime 规格.md
- 新增：docs/product/reference/Screen 06｜Experience Policy Engine 规格.md
- 新增：docs/product/reference/V1 第一条完整 Experience｜从好奇到创造的可运行垂直切片.md
- 新增：docs/product/reference/个人体验引擎 V1.1｜前 60 秒高保真产品规格.md
- 新增：docs/product/reference/个人体验引擎 V1｜Screen 01 首页高保真产品规格.md
- 新增：docs/product/reference/个人体验引擎 V1｜逐屏产品原型规格.md
- 新增：docs/product/reference/README.md

**输入与产出：**
- 输入：用户提供并解压的资料目录 ../2026-10-07/referenced-chatgpt-conversation-this-is-an/work/archive_unencrypted/。
- 产出：docs/product/reference/ 中恰有 36 份唯一源 Markdown 文档，并附带来源哈希和重复文件排除说明。

- [ ] 步骤 1：将列出的 36 份规范 Markdown 源文件复制到 docs/product/reference/；排除 __MACOSX 元数据及 5 份逐字节重复的“(1)”文件。
- [ ] 步骤 2：根据导入的 36 份源文件生成 docs/product/reference/SHA256SUMS，并在 docs/product/reference/README.md 中列出排除的 5 组重复文件名。
- [ ] 步骤 3：运行 find docs/product/reference -maxdepth 1 -type f -name '*.md' | wc -l；预期结果：共 37 个 Markdown 文件（36 份源文档及 README）。
- [ ] 步骤 4：运行 cd docs/product/reference && shasum -a 256 -c SHA256SUMS；预期结果：36 项全部显示 OK。
- [ ] 步骤 5：逐份比较导入文件与解压目录中的源文件字节；预期结果：36 份全部一致，没有未解释文件。

---

### 任务 2：建立权威来源与版本登记册

**涉及文件：**
- 新增：docs/product/baseline/source-of-truth.md
- 读取：docs/product/reference/README.md
- 读取：docs/product/reference/E1｜Contract Authority Evidence Package（契约权威证据包）.md
- 读取：docs/product/reference/P2-EVIDENCE-8.0 — Closure Evidence Execution Register（P2 关闭证据执行登记表）.md

**输入与产出：**
- 输入：任务 1 核验过的源文档集合。
- 产出：一份清单，将每份产品文档映射到编号、声明版本、状态、范围、权威角色、来源路径和批准证据状态。

- [ ] 步骤 1：创建 docs/product/baseline/source-of-truth.md，使用 SRC-01 至 SRC-36 编号；表格字段包括文档编号、声明版本、来源状态、范围、权威角色、来源路径、负责人和批准证据。
- [ ] 步骤 2：运行 grep -c '^| SRC-' docs/product/baseline/source-of-truth.md；预期结果：36。
- [ ] 步骤 3：确认每个导入文件名在表格中恰好出现一次；未知负责人或批准状态标为 PENDING；没有证据链接的项目不得标记 PASS。

---

### 任务 3：建立产品冲突与决策登记册

**涉及文件：**
- 新增：docs/product/baseline/decision-register.md
- 读取：docs/product/reference/P2｜Product Engineering Contract（产品工程契约）正式收束与 P3 准入包.md
- 读取：docs/product/reference/P2-EVIDENCE-8.0 — Closure Evidence Execution Register（P2 关闭证据执行登记表）.md
- 读取：docs/product/reference/P3-ENTRY-1.0｜Vertical Slice Entry Package（首个完整产品切片准入包）.md
- 读取：docs/product/reference/P3-S1-C07～C08｜LLM Gateway & Validator Contracts（大模型网关与验证器契约）.md
- 读取：docs/product/reference/P3-S1-C07～C09｜LLM Gateway、Validator & Runtime Contracts（大模型网关、验证器与运行时契约）.md

**输入与产出：**
- 输入：任务 2 的权威来源登记册。
- 产出：从 CR-01 起的冲突记录，包含证据、受影响契约、严重度、建议、负责人、状态和所需版本变更。

- [ ] 步骤 1：创建 docs/product/baseline/decision-register.md，至少包含 6 项初始冲突；每项须记录来源证据、影响、建议、决策负责人、所需版本变更和状态。
- [ ] 步骤 2：至少登记：P2 CLOSED/BLOCKED 状态冲突；P2/P3 门禁闭环；C07–C08 与 C07–C09 重叠；归档中未找到的 C4/E4/E5/EXEC-01 权威材料；首体验与发布指标仍为提案；P2 G01–G08 与 S1 GS-01–GS-06 及 WHAT_IF/CREATE 范围不一致。
- [ ] 步骤 3：运行 grep -c '^### CR-' docs/product/baseline/decision-register.md；预期结果：至少 6。
- [ ] 步骤 4：确认每项记录都包含规定字段，且仍标为 OPEN 或 PROPOSED；不得把任何未决事项悄悄视为已冻结。

---

### 任务 4：形成 P2 至 P3 门禁衔接提案

**涉及文件：**
- 新增：docs/product/baseline/p2-p3-gate-transition.md
- 读取：docs/product/baseline/decision-register.md
- 读取：docs/superpowers/specs/2026-10-08-p3-s1-product-development-baseline-design.md

**输入与产出：**
- 输入：门禁冲突登记和范围建议。
- 产出：一份有版本的提案，区分编码前准入证据与实现后的真实运行证据。

- [ ] 步骤 1：创建 docs/product/baseline/p2-p3-gate-transition.md，列出编码前和编码后的门禁、负责人、证据位置及依赖顺序。
- [ ] 步骤 2：定义编码前准入条件：G1 契约权威冻结、跨契约静态映射、G6 阻塞项决策、G7 S1 范围批准，以及 E5 证据环境和评测人员准备就绪。
- [ ] 步骤 3：定义编码后执行条件：动态 G2、适用于 S1 的黄金案例、G4 工程边界证据、G5 独立评测和正式签署；保留完整 G01–G08 义务，不得声称这些案例已在 S1 全部通过。
- [ ] 步骤 4：明确该文件是待产品负责人批准的提案，正式采用须版本化修订 E8；保留全部硬验收语义和 P0 阻断条件。
- [ ] 步骤 5：运行 rg -n 'PROPOSAL|待产品负责人批准|P0|NOT PASSED' docs/product/baseline/p2-p3-gate-transition.md；预期结果：提案状态、批准依赖、硬阻断条件可见，且没有宣称任何现有门禁已 PASS。

---

### 任务 5：映射 S1 动作、黄金案例与冻结范围

**涉及文件：**
- 新增：docs/product/p3-s1/acceptance-mapping.md
- 读取：docs/product/reference/P3-S1｜Runtime Vertical Slice Specification（运行时首个完整产品切片规范）.md
- 读取：docs/product/reference/P3-S1-CC02｜C01～C09 Cross-Contract Consistency Matrix（跨契约一致性矩阵）.md
- 读取：docs/product/reference/18｜Evaluation System V1（评测与验收体系 V1）.md
- 读取：docs/product/reference/16｜API Contract V1（接口契约 V1）.md

**输入与产出：**
- 输入：已批准的范围和冲突登记册。
- 产出：可追溯的映射，覆盖每个 S1 动作和 GS-01–GS-06 的来源条款、预期行为、负向案例、证据及延期事项。

- [ ] 步骤 1：创建 docs/product/p3-s1/acceptance-mapping.md，字段包括案例/动作编号、来源条款、范围、预期行为、负向案例、证据负责人和所属阶段。
- [ ] 步骤 2：将 GS-01 直接回答、GS-02 原因解释、GS-03 改变方向、GS-04 停止、GS-05 状态版本冲突、GS-06 拒绝模型改写状态映射到来源条款和预期轨迹。
- [ ] 步骤 3：明确登记 S1 的 WHAT_IF 动作与 S2 完整分支之间的区别，以及 API 中 CREATE / SEARCH 接口与 S1 非目标之间的关系；不得为未决动作臆造行为。
- [ ] 步骤 4：将 P2 G01–G08 映射至 S1 或后续切片；延期案例标记为 NOT RUN / DEFERRED，不得标为 PASS。
- [ ] 步骤 5：运行 for id in GS-01 GS-02 GS-03 GS-04 GS-05 GS-06 G01 G02 G03 G04 G05 G06 G07 G08; do rg -q --fixed-strings "$id" docs/product/p3-s1/acceptance-mapping.md || exit 1; done；预期结果：找到全部 14 个编号，人工逐行检查确认每项均有范围和证据负责人。

---

### 任务 6：形成运行时技术选型决策记录

**涉及文件：**
- 新增：docs/architecture/decisions/ADR-0001-runtime-stack.md
- 读取：docs/product/baseline/source-of-truth.md
- 读取：docs/product/p3-s1/acceptance-mapping.md

**输入与产出：**
- 输入：已批准的运行时、接口、评测要求及仓库约束。
- 产出：一份架构决策记录，比较至少两种可行的 Web 模块化单体技术栈并给出推荐方案；记录官方版本支持依据、运维权衡、测试策略和批准状态。

- [ ] 步骤 1：比较 TypeScript Web 模块化单体与前后端分离方案；评估中断取消、状态版本事务、JSON 契约共享、评测工具、部署方式和运维负担。
- [ ] 步骤 2：在撰写架构决策记录时，依据各框架官方文档核实所选框架及运行时版本支持，并记录链接和查阅日期。
- [ ] 步骤 3：推荐一种技术栈，并将产品负责人决策记录为 PENDING，直至明确批准；本任务不安装依赖、不搭建应用代码。
- [ ] 步骤 4：检查决策记录是否只推荐一个方案、包含备选方案和权衡，并且没有声称实现已经开始。

---

### 任务 7：汇总 P3-S1 准入记录

**涉及文件：**
- 新增：docs/product/p3-s1/readiness-record.md
- 读取：docs/product/baseline/source-of-truth.md
- 读取：docs/product/baseline/decision-register.md
- 读取：docs/product/baseline/p2-p3-gate-transition.md
- 读取：docs/product/p3-s1/acceptance-mapping.md
- 读取：docs/architecture/decisions/ADR-0001-runtime-stack.md

**输入与产出：**
- 输入：任务 2 至任务 6 的结果。
- 产出：一份准入核对表，包含证据链接、负责人批准、未解决阻塞项，以及明确的“已授权实现 / 未授权实现”结论。

- [ ] 步骤 1：创建 docs/product/p3-s1/readiness-record.md，列出每项准入前置条件、所需证据、决策负责人、签署状态和实现授权状态。
- [ ] 步骤 2：只要仍有 P2 阻塞项、范围决策、门禁修订或技术栈决策待定，初始授权状态就设为 NOT AUTHORIZED。
- [ ] 步骤 3：证据链接只指向实际获批材料；聊天提案或文档格式检查不能替代签署。
- [ ] 步骤 4：运行 rg -n '实现授权状态|NOT AUTHORIZED|PENDING|APPROVED' docs/product/p3-s1/readiness-record.md；预期结果：状态与实际签署相符，不存在无依据的授权声明。

---

## 执行交接

本计划只产出实现准入资料，不编写产品运行时代码。准入记录获批后，再单独编写与选定技术栈相符的 P3-S1 运行时核心实施计划，明确源文件、接口、测试和命令。
