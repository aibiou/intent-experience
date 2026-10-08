# P3-S1 签署会运行手册（2026-10-08）

**编号：** P3-S1-SIGNING-RUNBOOK-01
**版本：** 1.0.0
**用途：** 全部材料已准备完毕（复核草案 + 签署模板 + 证据报告）。本手册把待签项合并为一次机械通行；**不预填任何决定**——每个决策点须用户本人作出。
**当前状态：** P3-S1 Runtime Implementation = **NOT AUTHORIZED**；G1–G8 / A1–A6 保持 NOT PASSED / NOT RUN。本手册签署前该状态不改变。
**前置核验（2026-10-08 已通过）：** 36/36 归档源 SHA-256 校验 OK；run 1 / run 2 Spike 证据哈希全部 OK；治理文件状态一致性扫描无矛盾。

## 决策点 1｜REVIEW-005（R4 / A6）——唯一实质判断

F-1：Spike 以纯 Node ESM 最小桩验证取消与 stale 拒绝（ADR-0002 §3 允许）；**Next.js Route Handler 级 streaming / AbortSignal 取消路径未在产品框架内验证**。

- **选项 A（草案建议）**：ACCEPT WITH FINDINGS——F-1 转入实施计划首批必验项（实施授权后首个迭代完成 Next.js 取消路径动态证据，G2–G4）。
- **选项 B**：BLOCK——A6 保持 PENDING，直至产品栈 Spike 或实施首批证据产生。

**你的判定：A / B**（其余 F-2…F-5 为登记项，草案已列处置）

## 决策点 2｜REVIEW-006 / 007 / 008（R1 / R3 / R5）

三份草案均建议 ACCEPT WITH FINDINGS（R1：C1–C7 确认属执行项；R3：映射完整、延期未误记；R5：计划完备但 A5/E5 就绪条件未满足，维持 NOT PASSED）。

**你的判定：逐项 接受 / 修改 / 改判 BLOCK**（REVIEW-006：____；REVIEW-007：____；REVIEW-008：____）

## 决策点 3｜C1–C7 Steward 确认（6 行，C4 已完成）

按 `signing/steward-confirmation-c1-c7.md` 逐行确认五性（Authority / Versioned / Fingerprintable / Owned / Approved）并签署：C1 ____ / C2 ____ / C3 ____（含 Draft-for-Product-Freeze 版本化安排接受与语义空缺登记）/ C5 ____ / C6 ____ / C7 ____。

## 决策点 4｜G5 独立评测隔离声明（6 项）

按 `signing/g5-isolation-declaration.md` 填写并签署：任命 / 与实现者身份关系 / 利益冲突声明（**不得代填**）/ G5 16 项承诺 / 证据审阅与否决权 / 隐私边界确认。

## 决策点 5｜隐私六要素（6 项实质决定）

按 `signing/privacy-six-elements-approval.md` 逐项决定并签署：① 保留期限 ____ ② 存储位置 ____ ③ 访问控制 ____ ④ 加密 ____ ⑤ 删除机制 ____ ⑥ 批准责任 ____。全部确定前真实用户数据禁收（护栏持续生效）。

## 签署后代理将执行的落档（待你确认后）

1. REVIEW-005/006/007/008 状态改 SIGNED，回填结论与签署；decision-register 相应 CR 行更新。
2. steward-confirmation-c1-c7.md 签署行回填；G1 判定更新（七行齐备 + 非作者核验后 G1 方可 PASS）。
3. G5 隔离声明与隐私六要素签署回填；readiness-record / owner-roster / independent-review-package §7 状态同步。
4. A1–A6 逐项评估；齐备后按授权流程签发实施授权（授权日重查 Node 官方发布状态，锁定 Active / Maintenance LTS 精确补丁并记录）。
5. 全部落档后提交推送。

**签署方式提示：** 可直接回复本手册决策点的判定（如"1-A；2 全接受；3 六行确认；4/5 待我填写后交回"），代理按判定执行落档；4/5 的内容须由你本人填写，代理只回填已签署文本。
