# S5B-F1-0001 — 独立评测人审阅包（staged，待审阅与否决）

运行：S5B-F1-0001（S5B 动态证据——页面配置面：提供方配置持久化 + D-5 隐私再确认 + 运行期委托网关；S5B-CONFIG-SURFACE-PROPOSAL-01 v1.0.0 裁决选项 A，产品负责人指令 2026-10-10 全项 A）
日期：2026-10-10T10:26:26.569Z
执行器：工程负责人角色（代理，Codex）；独立评测负责人：用户本人（角色 5，PD-15；G5 隔离声明 2026-10-08 签署生效）

## 结果

- 案例：13/13 全部 （见 summary.json）
- 断言：12/12 通过
- 退出码：1（只表示本运行断言通过；不设置任何 Gate 或产品状态）

## 审阅清单（不得只看汇总）

1. cases/ —— 13 份 E5 §4 案例记录（12 字段），含预期 / 实际 / 不变式 / 证据哈希
2. traces/ —— 每案例 JSONL 轨迹（进程内形态；案例事实按案例隔离记录于轨迹）
3. run-metadata.json —— E5 §3 版本矩阵（含 obligationTraceability：S5B → 案例 / 断言映射；frozenDecisions：D-1…D-5 裁决文本引用）
4. SHA256SUMS —— 证据包清单（可独立重算验证；G3-E-3：最终摘要写入后重新生成）

## 本运行覆盖（S5B 动态证据计划——四维度）

- 正常路径（6）：CREATE-NORMAL（密文落盘 / 摘要无 key）/ CONFIRM-GENERIC-TEMPLATE（通用模板签署）/ ENABLE-DECRYPT-SINGLE-ACTIVE（解密回环 + 单激活）/ DISABLE-FALLBACK（禁用即时回退）/ RUNTIME-PRIORITY（优先级字节序 + 委托输入契约）/ PROVIDER-REGISTRY（model-agnostic 规则族登记源）
- 负路径（3）：CREATE-UNREGISTERED（未登记提供方拒绝）/ CREATE-MISSING-FIELDS（必填字段缺失）/ ENABLE-BEFORE-CONFIRM（未确认不得启用）
- 边界（2）：KEY-SEPARATION（加密密钥缺失 / 非法 / 长度不足拒绝 + 合法恢复）/ READ-NO-KEY-LEAK（读操作零 key 泄漏扫描）
- 故障恢复（2）：DELETE-CORRUPT-NOTFOUND（删除 404 + 存储损坏拒绝不静默回退）/ CIPHERTEXT-TAMPER（密文篡改认证失败 + 畸形引用拒绝）

## 关键不变式验证

- A5：API key 明文零落盘（扫描 43 个持久化 / 证据文件，0 命中）
- A6：运行期加密密钥（环境变量注入）零出现于任何文件（0 命中——密钥分离独立验证）
- A7：配置面源码无提供方字面量（model-agnostic——提供方身份仅经 PROVIDER_PROFILES 登记）
- A8：D-5 通用模板 PRIVACY-RECONFIRM-GENERIC/V1（提供方名称于签署时填写，不写死任何提供方）
- A9：运行时优先级字节序（证据注入缝 > 页面持久化配置 > 环境变量 > 合成默认）

## 回归基线

- G3-GOLDEN-0001：policy_v2.3.0 / state_machine_v1.5.0 通过（48/48——S5B 零策略 / 状态机 / 事件契约变更）
- S2B-0001：通过（7/7——S2b 行为面零回归）

## 未执行（NOT RUN）

- G5 16 项评测包（独立评测）
- 真实 LLM 提供方调用（S5A-F1-0001——须用户在 /config 页面添加真实 API key 并首次签署 D-5 隐私再确认后执行；本运行不进入 ProviderLlmGateway 网络路径——合成数据边界，ADR-0002 §3）
- HTTP 形态端到端（配置面 API 路由的 HTTP 形态证据——经同一函数路径转发；本运行为进程内形态直接执行存储 / 委托契约层）

## 待复核项（不得由编码者自行确认）

- 本运行全部结论待独立评测人（角色 5）审阅；否决权归独立评测人
- 加密密钥管理形态（环境变量注入）为开发期形态——生产形态密钥注入方案属部署决策（隐私六要素要素 4 注记）

## 独立重跑

    cd tools/evidence && npm run s5b-f1   # Node v24.21.0

重跑不覆盖既有证据：运行目录按 RUN_ID 固定为 artifacts/evidence/runs/S5B-F1-0001；重跑前既有目录按尝试归档（保留于仓库，不删除）。

## 否决权

独立评测人可审阅任意原始轨迹与预期，并对本运行结论提出否决；否决须登记于独立复核记录。评测人不得由本运行执行者担任（角色分离见各案例记录 evaluator 字段）。
