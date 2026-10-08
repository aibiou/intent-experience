# ADR-0002 工程验证 Spike（取消与 stale 拒绝原型）

**性质：** 一次性、非产品化的技术可行性验证代码（ADR-0002 §3 允许的沙箱目录 `spike/cancellation/`）。**永不并入产品代码库**；验证结束后归档于此目录。
**范围：** 仅 ADR-0002 §2 的 S-1 / S-2 / S-3 三项验证。硬边界（ADR-0002 §3）：不实现任何产品契约对象（Session / Intent / ExperienceState / Semantic Action / Policy / LLM Gateway / Validator / Runtime 一概不建）；不接入真实 LLM Provider（固定延迟桩）；不收集真实用户数据；不产生任何 Gate / Golden / G2–G5 / A 条件证据；不计入 S1 进度。
**运行：** `sh run.sh`（按 ADR-0001 生命周期规则选择 Active / Maintenance LTS Node，锁定补丁版本并记录于证据 environment 字段；零依赖，无需 npm install）。
**产物：** `evidence/`（原始 JSONL 记录 + SHA256SUMS）；验证报告见 `docs/architecture/decisions/ADR-0002-spike-report.md`。

## 验证项与通过标准（ADR-0002 §2）

- **S-1 客户端中止传播**：进程内 GenerationTask + 常驻 HTTP 流式服务两种形态；abort / 客户端断开后生成循环确定性停止，取消后无新 chunk 写出，任务终止有日志与时间戳证据。
- **S-2 stale 响应拒绝**：携带旧 `expected_state_version` 的迟到写入被持久层条件写原子拒绝（`STATE_VERSION_CONFLICT` 语义），并发时序下旧版本写入 100% 拒绝，拒绝路径有可审计记录，无 overwrite / auto-merge / silent-discard。
- **S-3 持久层条件写**：多进程并发竞争同一版本条件写，恰有一个成功；失败方读到最新版本；原子性由 SQLite 存储引擎保证，不依赖进程内锁。

## 结构

```text
run.sh               启动器（Node 版本选择与锁定）
run-all.mjs          编排器（S-1 → S-2 → S-3，写证据与汇总）
src/task.mjs         可中止生成任务（S-1 进程内形态）
src/server.mjs       常驻 HTTP 流式生成服务（S-1 服务形态）
src/s1-abort.mjs     S-1 验证驱动（进程内 + HTTP）
src/store.mjs        版本化状态存储（SQLite 条件写，S-2/S-3）
src/s2-stale.mjs     S-2 验证驱动（迟到响应 100% 拒绝）
src/s3-concurrent.mjs S-3 验证驱动（多进程并发竞争）
src/s3-worker.mjs    S-3 独立进程工作器
evidence/            原始记录（运行后生成）
```
