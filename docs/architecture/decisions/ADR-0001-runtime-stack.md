# ADR-0001：P3-S1 运行时技术栈

**状态：** ACCEPTED BY PRODUCT OWNER（产品负责人已批准技术栈建议；工程复核待完成）
**日期：** 2026-10-08
**决策范围：** P3-S1 单一 Web 垂直切片；不授权开始编码。
**决策负责人：** 代理产品负责人（用户于当前会话授权 Codex 履行）。

## 背景

P3-S1 需要在一条完整链路中实现交互界面、契约化 HTTP 接口、运行时单写入、可取消生成、状态版本冲突处理、事件 / 决策轨迹和可复现评测。团队规模、云厂商、身份系统、数据库和部署目标尚未由产品负责人确定，因此本 ADR 只推荐应用技术形态，不把基础设施细节伪装成已决定事项。

## 评估方案

| 方案 | 组成 | 中断 / 取消与状态事务 | 契约共享与评测 | 部署 / 运维 | 取舍 |
|---|---|---|---|---|---|
| A：TypeScript Web 模块化单体 | Next.js App Router + TypeScript；同一 Node.js 服务承载 UI 与 API；按模块隔离 Runtime、Policy、LLM、Validator、Events、Evaluation | 单一进程边界易于实现请求取消与运行时编排；数据库版本比较仍须在事务内显式实现。禁止部署为易中断的无状态函数形态，避免长请求/取消语义被平台限制 | UI 与 API 可共享 schema/types；完整端到端链路可在同一仓库按模块测试 | 一个应用部署单元、一个主要运行时；需使用常驻 Node.js 服务或容器，不采用静态导出/默认 serverless | 降低早期运维与跨服务故障面；需严格模块边界，避免 Next route/UI 越权调用状态写入 |
| B：前后端分离 | Vite + TypeScript 前端；独立 Fastify + TypeScript API 服务 | 前后端取消需跨网络传递；API/DB 仍可精细控制状态事务；服务部署、鉴权、版本兼容增加变量 | OpenAPI/JSON Schema 可作为共享契约，但需生成或维护客户端；E2E 必须运行两个进程 | 两个可独立部署单元及网络边界，扩展灵活但运维和故障诊断成本更高 | 边界天然清晰；当前切片阶段需要额外治理和分布式集成工作 |

## 建议决策

**推荐方案 A：TypeScript Web 模块化单体。** 建议使用 Next.js App Router 与 TypeScript，在 Node.js 服务 / 容器中运行。选择依据是 S1 要验证产品运行链，而非独立服务弹性；模块化单体减少早期部署和跨服务干扰，仍能把唯一状态写入封装在 Runtime 模块，并让 Policy、LLM Gateway、Validator 仅提交命令 / 提案。

此建议不改变下列边界：

- 只有 Runtime 模块可提交产品状态写入；界面、Route Handler、模型适配层不能直接写状态。
- 状态机仍是合法状态转换的唯一权威；并发控制须使用持久化版本条件或等价原子操作，不能依赖进程内锁。
- LLM 响应仅为提案；由 Validator、Policy 与 State Machine 校验后再交 Runtime 决定。
- `STOP` / `CHANGE` 取消必须贯通客户端请求、服务端任务和旧候选拒绝；客户端断开连接不等同于状态已安全终止，须以实现证据验证。
- API schema / DTO 与产品契约字段保持可追溯；不得由 TypeScript 类型检查替代运行时输入校验。
- 部署限制：不采用静态导出或具有短超时、不可控后台续行的 serverless 部署。若目标平台不支持受控取消及可靠任务生命周期，需重新评审 ADR。

## 版本支持依据（查阅日期：2026-10-08）

- Node.js 官方发布表显示 Node.js 24 为 LTS，并指出生产应用应使用 Active LTS 或 Maintenance LTS；建议以 Node.js 24 LTS 为基线，具体补丁版本在实施计划中锁定并记录。[Node.js Releases](https://nodejs.org/en/about/previous-releases)
- Next.js 官方文档将其描述为全栈 Web 框架，App Router 支持现代 React 能力；Route Handlers 支持基于 Web Request / Response 的接口处理。部署文档说明 Node.js server / Docker 支持全部 Next.js 功能，而静态导出有限。[Next.js App Router](https://nextjs.org/docs/app), [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [部署方式](https://nextjs.org/docs/app/getting-started/deploying)
- 官方 Next.js TypeScript 文档说明其具备内建 TypeScript 支持和路由类型辅助；仍需单独配置运行时校验，静态类型不是信任边界。[Next.js TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript)
- 替代方案的官方资料表明 Fastify 支持 TypeScript（其文档也提示部分类型需留意），Vite 提供 TypeScript 转译但不负责类型检查，因此应另设类型检查步骤。[Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Vite Features](https://vite.dev/guide/features.html)
- 并发版本控制须由数据库操作保证；Prisma 官方事务文档说明事务、乐观并发控制及版本字段可检测冲突。这是可选 ORM 的能力依据，不构成已选 Prisma 或数据库的决定。[Prisma Transactions / OCC](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions)
- Playwright 官方 Trace Viewer 可查看测试执行步骤与重试轨迹，可作为端到端证据采集候选工具；是否采用需在实施计划中确认。[Playwright Trace Viewer](https://playwright.dev/docs/next/trace-viewer-intro)

### Node.js 生命周期复核规则

Node.js 主版本状态会随时间变化；Node.js 24 是本 ADR 查阅日的建议基线，不是对未来实施日期的永久锁定。取得 P3-S1 编码授权前，工程负责人必须重新核对 Node.js 官方发布状态，并在依赖锁文件中固定当时受支持的精确补丁版本。若 Node.js 26 届时仍为 Current，则继续比较并优先评估 Node.js 24 LTS；若 26 已进入 Active LTS，则通过 ADR 版本化修订比较兼容性后再选，不得由编码者静默升级。只使用官方标注的 Active LTS 或 Maintenance LTS 作为生产运行时。

## 测试与评测要求

技术栈不能代替产品验收。实现计划须分别覆盖：

1. 单元 / 状态机与策略契约测试；
2. 数据库版本冲突与 Runtime 单写入集成测试；
3. API 契约、输入校验和错误路径测试；
4. 真实浏览器纵向流程及生成中 STOP / CHANGE 取消场景；
5. 版本化 Golden Suite、故障注入、可追溯执行产物；
6. 与实现团队独立的评测复核。

这些测试全部通过仍不等于产品通过；P0 用户主导权、状态完整性、策略边界任一失败均阻断。

## 未决项 / 不在本 ADR 决定

- 数据库产品 / 托管商、部署商、区域与预算；
- 登录 / 身份与多租户策略；
- 模型供应商、模型版本、Prompt 管理方案；
- 具体 Next.js、React、TypeScript、ORM、测试工具锁定版本；
- 运行时后台任务 / streaming 的目标平台约束。

以上必须在用户批准的产品和运维约束下另行决策。若取消场景经原型验证在 Next.js 目标环境中无法可靠满足产品契约，应撤销本推荐并重新比较方案 B，不得降低验收标准。

## 批准记录

| 决策者 | 结论 | 日期 | 证据 |
|---|---|---|---|
| 代理产品负责人（用户本会话授权） | 接受方案 A，限于本文范围 | 2026-10-08 | PODR-001 / PD-09 |

**当前结论：** 产品负责人已批准方案 A；架构 / 工程复核和数据、部署细节仍待定。尚未安装依赖、创建运行时代码或授权 P3-S1 开发。
