# 产品迭代规划 D+A：单测底座 + 第一体验入口屏

> 定位：产品规划师 + 体验官视角的全流程迭代规划。
> 日期：2026-10-12
> 状态：规划（待实施）

---

## 1. 背景与判断校准

用户主线：按优先级继续产品改进优化。上一阶段 runtime 深拆已完成并全绿推送（`6f7fef2..1e763d2`）。

作为体验官复核现状后，**校准结论**：

- **B（分支/模拟出口）已在体验屏落地**——分支面板（采用分支 / 返回主线）、"如果…会怎样"dock 动作、记忆面板均已在 `experience-screen.tsx` 实现；且动作坞已做过"七钮墙 → 按会话阶段给相关动作"的 UX 收敛（注释自述）。**不重复建设，仅列为可选微调。**
- **A（第一体验入口屏）才是真正缺失的产品差异化层**：现在从首页点卡片 / 推荐 / 惊喜，都直接 `onStart(prompt)` 跳进 runtime 立即生成，缺 Screen 03 规格的"制造一个值得进入的问题 → 好奇 → 主动选择方向 → 参与"环节。
- **D（vitest 单测层）是最佳起点**：项目零测试脚本、零 CI，拆分后 runtime-actions 3561 行无秒级保护；G3 golden 是唯一回归网且单次 180–300s。1 轮投入换来秒级回归，是继续安全开发的垫。

## 2. 产品意图（产品规划师口径）

个人体验引擎的核心单位是 **Experience**（Trigger → Context → Curiosity → First Understanding → Interaction → Possible Branches → User Action → Outcome → Exit），**不是内容、不是 Feed**。

第一分钟要建立：**低摩擦 + 好奇 + 控制感 + 初步信任**。

当前首页点卡片即"生成"，跳过了 Curiosity/First Understanding/Possible Branches 三个环节——用户被直接抛进"内容输出"，而非"一个值得进入的问题"。第一体验入口屏正是补齐这三环。

## 3. D：vitest 轻量单测层（工程底座）

**目标**：锁住纯逻辑模块核心规则，秒级回归；golden 降为发布前回归。

**范围（先锁最关键的纯逻辑）**：
- `state-machine.ts`：状态转移表（含 CHANGE_DIRECTION WAITING→ENTERING 修复回归）
- `policy.ts`：动作决策（semantic_action 选择）
- `classifier.ts`：意图分类
- 若模块依赖解析顺畅，再补 `events.ts` 事件契约、`catalog.ts` 静态完整性

**实施**：`vitest` 作为 devDependency；`vitest.config.ts`（node 环境，测试目录 `tools/unit/` 或 `src/experience/**/__tests__`，与 `tsconfig.core.json` include 保持一致，避免污染全量 tsc）；package.json 加 `"test": "vitest run"` 脚本。

**验收**：
- `vitest run` 全绿（退出码 0）
- `typecheck:core` + 全量 `tsc --noEmit` 退出码 0（新增测试不在全量 include 内或受控）
- G3 golden 保持全绿（拆分后行为零变化）

## 4. A：第一体验入口屏（Screen 03 落地）

### 4.1 体验设计原则（体验官把控）

- **不是一个内容页**：不展示完整答案，只展示"一个值得进入的问题"。
- **秒级好奇**：入口屏静态呈现，无需等待生成；10–20s 内用户产生"有点意思 / 想知道答案 / 想试试看"。
- **不解释完、不藏答案**：给一小段"第一理解"（留探索空间），给具体可点的入口角度。
- **控制感**：用户能从 1–3 个入口角度中选方向，也可自由输入。
- **轻**：视觉与交互都比首页更收敛，不叠第二个信息流。

### 4.2 数据模型（catalog 扩展）

`ExperienceSeed` 扩展三个字段（**保留原有字段不动**，向后兼容）：

```ts
hook: string;                            // 现象/问题钩子（Curiosity）
context?: string;                        // 一小段第一理解（不解释完）
entries: { label: string; prompt: string }[]; // 1–3 个入口角度（低门槛参与）
```

为 18 条体验逐条撰写。示例（deep-luminous-sea）：
- hook：`没有阳光的海底，生命是怎么自己"开灯"的？`
- context：`深海没有光合作用，却住着一大群会发光、会借光的居民——它们把这当成语言、诱饵和伪装。`
- entries：
  - `{ label: '它们为什么要发光', prompt: '深海生物为什么要发光？' }`
  - `{ label: '一次深潜听它们聊', prompt: '带我潜入深海，听这些发光生物讲讲它们的生存策略' }`
  - `{ label: '灯光秀还是信号灯', prompt: '深海的生物发光更像灯光秀还是信号灯？' }`

### 4.3 路由与交互（page.tsx）

- 新增 phase：`'home' | 'entrance' | 'experience'`。
- 首页点卡片 / 今日精选 / 惊喜（有 seed 的入口）→ `entrance`（携带 seed）。
- 自由输入（用户已有明确意图）→ 直接 `experience`（尊重低摩擦）。
- 入口屏：选入口角度 / 直接开始 / 自由输入 → 发起 session → `experience`（沿用现有 `start()` 路径）。

### 4.4 验收

- 从首页任一有策展的体验进入时，先见入口屏（hook + context + 入口角度 + 自由输入）。
- 选择任一入口角度后进入 ExperienceScreen 并正确生成（沿用现有流）。
- 自由输入与续作仍直接进 ExperienceScreen（行为不变）。
- 全量 tsc / typecheck exit 0；G3 golden 保绿；`vitest run` 全绿。

## 5. 实施顺序

1. **D 先**（安全垫，1 轮）→ 验证。
2. **A 后**（产品核心）→ 验证。
3. 治理登记（decision-register / readiness-record 新版本 + 新 CR 号）→ push。

## 6. 风险与边界

- **catalog 扩展工作量**：18 条手工撰写，是本任务主要成本；逐条撰写保证 hook 具体、entries 低门槛、context 不剧透。
- **单测范围收敛**：只锁纯逻辑，不碰 UI / 流式（避免 jsdom 与重依赖）。
- **不越界**：不重做已落地的分支/模拟出口（B 已覆盖）；不改变现有 start/session 语义。
- **治理口径**：沿用用户授权"先开发后填表、免除逐项裁决签署"；不设置任何产品 Gate 为 PASS（E5 §2）；G3 Gate 判定仍属独立评测（角色 5、用户本人 PD-15）。
