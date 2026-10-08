# ADR-0002 Spike 验证报告：取消与 stale 拒绝原型

**编号：** ADR-0002-SPIKE-REPORT-01
**版本：** 1.0.0（2026-10-08）
**状态：** SPIKE COMPLETED——S-1 / S-2 / S-3 全部通过（run 2）；run 1 S-3 测试桩缺陷已按 ADR-0002 §5 如实登记（§4）
**执行依据：** ADR-0002 §2（验证目标与通过标准）、§3（范围与禁止项）、§4（技术基线）、§5（结果处置）
**执行人：** 用户本人（工程负责人角色，PD-15），在 ADR-0002 授权范围内执行
**代码与证据：** `spike/cancellation/`（代码）、`spike/cancellation/evidence/`（run 2 原始记录）、`spike/cancellation/evidence-run-1-initial/`（run 1 失败记录存档）

> **重要声明（ADR-0002 §3 第 5 条 / §5）：** 本报告**仅**作为 ADR-0001 技术可行性复核的输入之一（A6 技术可行性部分的输入），**不产生任何 Gate、Golden、G2–G5、A 条件证据**，不改变 G1–G8 / A1–A6 任何门禁状态，不计入 S1 进度；P3-S1 实施授权保持 **NOT AUTHORIZED**。

## 1. 环境与版本锁定

| 项 | 值 |
|---|---|
| Node.js | **v24.21.0**（Active LTS；启动时由 `run.sh` 按 ADR-0001 生命周期规则选择并锁定补丁版本；`/Users/pg014/.nvm/versions/node/v24.21.0/bin/node`） |
| 平台 | darwin arm64 |
| 存储引擎 | SQLite **3.53.4**（`node:sqlite` 内置，Node 24 无需实验标志）——ADR-0002 §4 候选之一；**本报告不决定产品数据库选型**，选型仍为未决项 |
| 依赖 | 零（无 npm install、无第三方包） |
| 运行命令 | `sh run.sh`（工作目录 `spike/cancellation/`） |

环境偏差：系统 Node 为 v20.10.0（EOL，无 `node:sqlite`），未用于本次验证；验证使用 nvm 安装的 v24.21.0，与 ADR-0001 的 Node 24 LTS 基线一致。

## 2. 验证方法摘要

- **S-1a 进程内**：`GenerationTask`（固定延迟桩）+ `AbortController`；abort 后下一 tick 确定性终止。
- **S-1b 常驻 HTTP 流式服务**：`node:http` 常驻服务，客户端 `fetch` + `ReadableStream` 读取 2 个 chunk 后中止；目标部署形态（常驻 Node.js 服务）验证。
- **S-2 stale 拒绝**：先由当前 generation 写入（version 1→2），再由旧 generation 携带旧 `expected_state_version`=1 迟到写入 ×50；条件写为单条条件 `UPDATE ... WHERE version = ?`。
- **S-3 并发条件写**：5 轮 × 20 个**独立 OS 进程**（独立连接）并发竞争同一版本条件写；无进程内锁，原子性完全由存储引擎保证。

## 3. 通过标准与实测结果对照（ADR-0002 §2）

| 验证项 | 通过标准（§2） | 实测结果 | 结论 |
|---|---|---|---|
| S-1 客户端中止传播 | 取消信号端到端可达；取消后无新 chunk 写出；任务终止有日志与时间戳证据 | 进程内与 HTTP 两形态均可达：abort / 客户端断开均触发确定性停止；终止事件后零 chunk 写出（客户端中止后至多 1 个在途 chunk）；`task_terminated` / `generation_stopped` 事件均带 ISO 时间戳，原始 JSONL 留证 | **PASS** |
| S-2 stale 响应拒绝 | 并发时序下旧版本写入 100% 拒绝；拒绝路径有可审计记录；无 overwrite / auto-merge / silent-discard | 旧版本迟到写入 **50/50（100%）** 拒绝，拒绝语义 `STATE_VERSION_CONFLICT`；`write_audit` 50 行完整（generation_id / original_state_version=1 / current_state_version=2 / stale_reason / decision=REJECTED / rejected_at）；最终状态 version=2 且 payload 不变；无覆盖、无合并、无静默丢弃 | **PASS** |
| S-3 持久层条件写 | 同一版本并发竞争恰有一个成功；失败方读到最新版本 | 5 轮 × 20 进程，每轮恰 **1 个 accepted / 19 个 rejected**；失败方均读到最新版本（currentVersion = baseVersion + 1）；最终版本每轮正确 +1；原子性来自 SQLite 存储引擎（跨独立进程与独立连接，无进程内锁） | **PASS**（run 2） |

## 4. run 1 失败记录与处置（按 §5 如实登记，不得重跑至通过而不留失败记录）

- **run 1（2026-10-08，先于 run 2 执行）**：S-1a / S-1b / S-2 PASS；**S-3 FAIL**。
- **现象**：每轮 20 进程中 1–4 个报 `ERR_SQLITE_ERROR: database is locked`（SQLITE_BUSY，errcode 5），错误进程未能完成条件写（round 0–3 的 errorCount 分别为 1 / 2 / 4 / 1，round 4 为 0）。
- **根因**：测试桩遗漏 `PRAGMA busy_timeout`——并发连接竞争 SQLite 文件锁时立即报错而非等待。**非存储原子性失效**：run 1 每轮的存储语义仍全部正确（恰 1 个 accepted、失败方读最新版本、最终版本 +1，见 run 1 存档证据 `s3-concurrent-write.json`）。
- **处置**：桩代码补 `PRAGMA busy_timeout = 5000`（`src/store.mjs`、`src/s3-worker.mjs`）；run 1 全部原始证据原样存档于 `spike/cancellation/evidence-run-1-initial/`（哈希见 §5.2）。
- **run 2（2026-10-08）**：S-1 / S-2 / S-3 全部通过（§3）。
- **待复核人确认**：run 1 失败的性质判定（测试桩缺陷 vs 验证目标失败）由 ADR-0001 复核人确认；本报告不作最终裁定。

## 5. 原始记录路径与 SHA-256

### 5.1 run 2（通过）`spike/cancellation/evidence/`

| 文件 | SHA-256 |
|---|---|
| s1a-inprocess-abort.json | 9529770ddf2f1bf5f34f8da15127fce034caa64c0e11ac649f0e844569da0365 |
| s1a-inprocess-abort.jsonl | abc089bcdfd99f5ad83a421fa00efc7f1364fbc27d3aaf97f3101b0a8dd6033a |
| s1b-http-abort.json | a7cc2c42df247b6e4c7b7f72e2e17309b492bd47d4f0255628b7386cb6c9bd4f |
| s2-stale-rejection.json | 43d5917640ee8db5fc5f737b8f43e87dbe3402be6580bb3e22c4e2a86c605dc7 |
| s2-stale-rejection.jsonl | 32d536ea6f12c069518cd74894773dc0048a8af4bdbdffe4df85264c751fabff |
| s2-state.db | cce702ec80ffc2148aee7a4e22bf515435cbcfba46fbc424461b512d71bbebd5 |
| s3-concurrent-write.json | af6b353758f3bbb08ebf0e43751d24464e30a9eee94125fd6135dca1ca2f379c |
| s3-round-0.db | 6d555b207181af5ba58e600fefb07a670c0bf19006718ffb1a6a71f34ce06662 |
| s3-round-1.db | 0e11d935f4ac92b147f7868c2886e5bcb88404ee2d40e9944f2c5dab23d0b88a |
| s3-round-2.db | c2cbb08c13e2d9b523d7b1167348e326dc53859c3a3020856f4c0cade5312fdf |
| s3-round-3.db | 7fc25ee49287a2c7a55548d6b5e942d8c22ce777544424bf80e63e09ad0be9cd |
| s3-round-4.db | 380edaf07507904c53c80a94e658ecddc314738a20b90760df43015fcb01b484 |
| summary.json | bd2843a44afdef818834fc3f104c5f9232eac20cb2ad1e4332aef715c0b3de3c |

同目录 `SHA256SUMS` 为运行时自动生成的哈希清单（覆盖上表除 summary.json / SHA256SUMS 外的全部文件）。

### 5.2 run 1（失败记录存档）`spike/cancellation/evidence-run-1-initial/`

| 文件 | SHA-256 |
|---|---|
| s3-concurrent-write.json（含每轮失败明细） | cb6e317fbc88d68c67df911fd555256524c7ad7b52ad5ebf4878a0716775 |
| summary.json | 649ee7504470fc064308e08574ad3d2c3a95181d1c9ab1cc4e2d352132e515b3 |
| SHA256SUMS | 060a2ca6103565e4f15c9f02a12cdd39d029551ac48643593c829ce478af5571 |
| s1a-inprocess-abort.json | 52f45fc9c76b837b00d444b1574295af3e72c080a20145b573525f3b1b2dcb3e |
| s1a-inprocess-abort.jsonl | ef55c4ef726dde6208f531e27c607c03d86c312fb6e0a72efc2b7678c50f52a0 |
| s1b-http-abort.json | 92d631ec448084acab2342df1ee4e97eed0cf10d72980ff4b88772b2865628ed |
| s2-stale-rejection.json | 7dbd0327d8a090ffd225985925423c6b42c02b90d31de0430f536e4c41113800 |
| s2-stale-rejection.jsonl | dc932268c60bcbdc3ae641866d81b17cd57955adfde0d5d26e0248de11da0237 |

## 6. 环境偏差说明（对 ADR-0001 产品基线）

- Spike 按 §3 以最小桩实现（纯 Node ESM，无框架、无 TypeScript 编译）；产品形态为 Next.js App Router + TypeScript（ADR-0001）。本验证环境无 `tsc`，TypeScript 编译路径未验证——产品实现时的取消语义须在产品技术栈上重新验证（属获准实施后的范围，不在本 Spike 内）。
- Node 版本与 ADR-0001 基线一致（Node 24 LTS，锁定 v24.21.0）；实现授权日须按既有规则重查 Active LTS 并锁定补丁。
- SQLite 仅为 §4 候选验证；产品数据库选型未决，本报告不作选型结论。

## 7. 硬边界合规声明（ADR-0002 §3 七条逐条确认）

1. 未实现任何产品契约对象（Session / Intent / ExperienceState / Semantic Action / Policy / LLM Gateway / Validator / Runtime 一概未建；仅 `GenerationTask` 与版本化存储桩）。
2. 未接入、未复制、未简化实现 C01–C09 / GS-01–GS-06 / CC02 案例体系。
3. 未调用真实 LLM Provider（固定延迟桩）。
4. 未收集任何真实用户数据（payload 为合成字符串）；未引入产品 schema 或产品 API 契约。
5. 未产生任何 Gate / Golden / G2–G5 / A 条件证据——本报告仅作 ADR-0001 复核输入。
6. 未计入 S1 进度、未作为实施授权的"部分完成"。
7. Spike 代码一次性：归档于 `spike/cancellation/`，永不并入产品代码库；后续实施须在获准范围内重写并走正常契约 / 测试流程。

## 8. 结果处置（ADR-0002 §5）

三项验证全部通过（run 2）。按 §5，本报告附入 ADR-0001 复核材料，作为架构 / 工程负责人签署 A6 技术可行性部分的**输入之一**（A6 其余前置不变：授权日 LTS 重查、R4 独立架构复核等）。run 1 的 S-3 失败为测试桩缺陷而非验证目标失败，已如实登记并存档；该性质判定须由 ADR-0001 复核人确认。若后续复核推翻本结论，按 §5 触发 ADR-0001 重议（含改评估方案 B）。

| 签署 | 记录 |
|---|---|
| 执行 / 报告撰写 | 用户本人（工程负责人角色，PD-15），2026-10-08 |
| 锚点 | 本报告与 `spike/cancellation/` 同提交；基线 git 77106a4 之上 |

**注意：** 本报告签署 ≠ A6 签署 ≠ 实施授权；A1–A6 与各 Gate 状态不变。
