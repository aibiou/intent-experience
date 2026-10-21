# 创作域失效缺陷分析（DEFECT-CREATION-001）

- 状态：已定位根因，未修复
- 分析日期：2026-10-20
- 证据基线：`db/custom.db` 41 个会话 / 269 个事件；`data/media/jobs.json` 28 个任务
- 分析对象：`src/lib/experience/`（产品实际运行的实现树）

---

## 1. 现象

全库 41 个会话中：

| 指标 | 数值 |
|---|---|
| 会话总数 | 41 |
| 有创作域的会话 | 20 |
| 创作 `version` 恒为 1 的会话 | **19 / 20** |
| 创作 `version` 曾推进的会话 | 1（到 version 3） |
| 走到 `COMPLETED` 的会话 | **1 / 41（2.4%）** |

具有代表性的复现会话：`cmvap0n9c000tn3fdeix419bp`（topic = 讲讲傍晚海边风怎么形成的）

逐轮真实输入与结果：

| 轮 | 用户输入 | semanticAction | policyAction | 事件 |
|---|---|---|---|---|
| 1 | 讲讲傍晚海边风怎么形成的 | DIRECT_ANSWER | ANSWER | CONTENT_DELIVERED (FIRST_LAYER) |
| 2 | 用图片展现刚才的内容 | REPEAT | REPEAT | CONTENT_DELIVERED |
| 3 | 生成动态的视频，俩人在观海 | CREATE | CREATE | CREATION_PREVIEWED superseded=**false** |
| 4 | 继续 | CONTINUE | ANSWER | CONTENT_DELIVERED |
| 5 | 生成视频 | CREATE | CREATE | CREATION_PREVIEWED superseded=**true** |
| 6 | 生成动态的视频，俩人在观海 | CREATE | CREATE | CREATION_PREVIEWED superseded=**true** |
| 7 | 继续生成动态的视频，俩人在观海 | CREATE | CREATE | CREATION_PREVIEWED superseded=**true** |
| 8 | 继续生成动态的视频，俩人在观海 | CREATE | CREATE | CREATION_PREVIEWED superseded=**true** |

从第 5 轮起，用户每次输入都触发一次「新建创作并取代上一个」，`version` 永远停留在 1。

---

## 2. 根因（逐行追踪）

链路：`classifier.ts` → `generation-intent.ts` → `runtime.ts` 路由改写 → `policy.ts` → `runCreationFirstTurn`

| 步骤 | 位置 | 行为 |
|---|---|---|
| 1 | `classifier.ts:230` `CONTINUE_PATTERNS` 含 `/继续/` | 「继续生成动态的视频」→ `CONTINUE` |
| 2 | `generation-intent.ts:155` `recognizeGenerationIntent` | 识别 `modality='video'`，`useContext` **未设置**（非呈现形式类表达） |
| 3 | `runtime.ts:377-395` 生成意图改写 | `CONTINUE` + `useContext=false` → **改写为 `CREATE`** |
| 4 | `policy.ts` `FROZEN_POLICY_MAP` | `CREATE → CREATE` |
| 5 | `runtime.ts:1030` `transitionExperience(view,'CREATE')` | 视图迁移通过 |
| 6 | `runtime.ts:1042` `superseded = Boolean(state.creation?.active)` | 已有活跃创作 → `superseded = true` |
| 7 | `runtime.ts:1044` | 旧 creation 标记 `active:false, endedReason:'superseded_by_create'` |
| 8 | `runtime.ts:1104` | `state.creation = { creation, active: true, contentHistory: [content] }` —— **全新对象，`version` 硬编码为 1** |
| 9 | 用户重复同样输入 | 回到步骤 1，无限循环 |

### 关键缺陷代码

```ts
// runtime.ts:1041-1045 —— 旧创作被标记为失效
const superseded = Boolean(state.creation && state.creation.active);
if (superseded) {
  state.creation = { ...state.creation!, active: false, endedReason: 'superseded_by_create' };
}

// runtime.ts:1104 —— 紧接着整个覆盖，旧创作连同 contentHistory 全部丢弃
state.creation = { creation, active: true, contentHistory: [content] };
```

`creation` 对象在 `runtime.ts:1099` 构造时写死 `version: 1`：

```ts
const creation: CreationObject = {
  creationId: \`creation_\${sessionId.slice(-6)}_\${String(expectedVersion).padStart(3, '0')}\`,
  ...
  version: 1,
  phase: p3,   // 恒为 PREVIEW
  ...
};
```

---

## 3. 语义错误性质

用户表达的是「**再生成一次视频**」——这是一个**媒体生成重复请求**，创作对象应当保持不变。
系统理解成了「**重新开始一个创作**」——因此新建 creation 对象并把旧的取代。

两者语义完全不同：

| 用户意图 | 正确行为 | 当前行为 |
|---|---|---|
| 再生成一次（同目标） | 复用现有 creation，只追加 `runGeneration` | 新建 creation，`version` 重置为 1 |
| 修改现有作品 | `runCreationPatchTurn`，`version + 1` | （补丁路径本身正常，但被上一条淹没） |
| 真正换一个方向 | 诚实地取代并保留历史 | 取代了，但历史被丢弃 |

---

## 4. 连带后果

### 4.1 创作历史丢失

`contentHistory` 只在补丁路径追加：

- `runtime.ts:1104`（首建）：`contentHistory: [content]` —— 新数组
- `runtime.ts:1249`（补丁）：`contentHistory: [...(domain.contentHistory ?? []), newContent]` —— 追加

首建路径反复触发时，历史永远只有 1 条。

### 4.2 作品墙与创作状态脱钩

`work-wall.ts` 的 `selectWorkWallRecords()` 从 `data/media/index.json` 的 `MediaArtifactRecord` 聚合，**不读 `state.creation`**。

因此：媒体产物存在于磁盘与索引中，但「当前创作」指向的对象已被丢弃——用户在前端看到的创作与他此前生成的内容不是同一个实体。

### 4.3 失败无痕

`TURN_FAILED` 事件在该会话中为 **0**。生成失败只在 SSE 流里推一条 `generation:failed`，不落 `ExperienceEvent`，事后无法从数据库复盘。

---

## 5. 修复方案（分三步，各自独立可验）

### 步骤 1：修正 CONTINUE 的生成意图改写

**位置**：`runtime.ts:377-395`

**现状**：

```ts
} else if (semanticAction === 'CONTINUE') {
  semanticAction = generationIntent.useContext ? 'REPEAT' : 'CREATE';
}
```

**改为**：当已存在活跃创作域时，`CONTINUE` + 生成意图**不应**改写为 `CREATE`，应保持 `CONTINUE`，由内容轮追加媒体生成，不触碰 `state.creation`。

**判据**：连续 3 次「继续生成视频」后，`CREATION_PREVIEWED` 事件数 ≤ 1，且不出现连续两次 `superseded:true`。

### 步骤 2：supersede 时保留历史

**位置**：`runtime.ts:1042-1045`、`types.ts` `ExperienceState`

**改动**：新增 `creationHistory: CreationDomain[]`，supersede 时把旧域 push 进历史而非丢弃。

**判据**：会话结束后 `creationHistory` 长度 = 实际创作次数。

### 步骤 3：同目标合并

**位置**：`runtime.ts:1030` 进入首建之前

**改动**：若 `inherited.newGoal` 与现有 `creation.concept.goal` 相同（或高度相似），直接复用现有 creation，不新建、不 supersede。

**判据**：`data/media/jobs.json` 中同一 session 不出现 `idempotencyKey` 不同但 prompt 相同的重复任务。

---

## 6. 验证方式

回放脚本 `tools/diagnose/session-replay.ts`：

- 输入：真实用户输入序列（见 §1 表格）
- 输出：每步 `semanticAction` / `policyAction` / `creation.version` / `superseded`
- 判据：
  - 连续 `superseded:true` ≥ 2 次 → **FAIL**
  - `CREATE` 出现 ≥ 2 次而 `version` 不变 → **FAIL**
  - `creation.active` 被无理由覆盖 → **FAIL**

修复前回放应 FAIL，修复后应 PASS。这是产品级验收，不是单元测试覆盖率。

---

## 7. 与既有结论的关系

此缺陷解释了此前观察到的「41 个会话仅 1 个 COMPLETED」的直接原因：
不是用户不想完成，而是创作域在用户重复表达同一诉求时反复自我重置，用户无法推进到 COMPLETE。

修复此项的预期效果：创作域 `version` 可正常递增，用户能沿 PREVIEW → USER_FEEDBACK → PREVIEW → COMPLETE 走完创作闭环。

---

## 8. 当前状态（防止分析随对话丢失）

| 项 | 状态 | 位置 |
|---|---|---|
| 根因分析 | ✅ 完成，已落文档 | 本文档 §2 |
| 可执行判据 | ✅ 已实现，当前 **PASS** | `tools/diagnose/session-replay.ts` |
| 步骤 1 修复（CONTINUE 改写） | ✅ **已修复** | `turn-routing.ts` `routeTurn` |
| 步骤 1b 修复（UNKNOWN 入口） | ✅ **已修复**（含新目标例外，见 §9.2） | `turn-routing.ts` `routeTurn` |
| 路由逻辑抽为纯函数供诊断共用 | ✅ 已完成 | `turn-routing.ts`（新文件） |
| 步骤 2 修复（supersede 保留历史） | ✅ **已修复**（2026-10-20） | `creation-domain.ts`（新文件）、`types.ts` `creationHistory` |
| 步骤 3 修复（同目标合并） | ✅ **已修复**（2026-10-20） | `creation.ts` `isSameCreationGoal` / `hasCreationSubject`、`turn-routing.ts` |
| 失败落库（`TURN_FAILED` 补全） | ✅ **已修复**（2026-10-20） | `runtime.ts` `recordGenerationFailure` |

### 修复内容（2026-10-20）

**新增 `src/lib/experience/turn-routing.ts`**：把 `runtime.ts` 内联的三段路由改写链
（分类器 → 生成意图 → 创作域意图）抽为纯函数 `routeTurn(raw, activeCreation)`。

抽取原因：首版诊断脚本复刻了这段逻辑，修复产品代码后回放仍 FAIL——**诊断测的是
自己的副本，不是产品**。抽出后诊断直接 import 产品实现，判据才有效。

**修复两个入口**（同一缺陷的两个触发路径）：

| 入口 | 输入示例 | 原行为 | 修复后 |
|---|---|---|---|
| ① `CONTINUE` 层 | 「继续生成动态的视频」 | 改写为 `CREATE` → 重建创作 | 活跃创作域内保持 `CONTINUE` |
| ② `UNKNOWN` 层 | 「生成视频」「生成动态的视频」 | 改写为 `CREATE` → 重建创作 | 活跃创作域内改为 `CONTINUE` |

判据：仅在 `activeCreation` 为真时改变行为；无活跃创作时路径与原来完全一致
（首次创作不受影响）。

### 验证命令与实测结果

```bash
# 缺陷判据（修复前 FAIL / 修复后 PASS）
npx tsx tools/diagnose/session-replay.ts
```

修复前后回放对比（同一输入序列）：

| 轮 | 输入 | 修复前 | 修复后 |
|---|---|---|---|
| 5 | 生成视频 | CREATE，superseded=true | **CONTINUE**，superseded=false |
| 6 | 生成动态的视频，俩人在观海 | CREATE，superseded=true | **CONTINUE**，superseded=false |
| 7 | 继续生成动态的视频，俩人在观海 | CREATE，superseded=true | **CONTINUE**，superseded=false |
| 8 | 继续生成动态的视频，俩人在观海 | CREATE，superseded=true | **CONTINUE**，superseded=false |

判决：**FAIL（3 项判据命中）→ PASS**。

```bash
# 既有回归（全绿，改动未破坏任何既有行为）
bun test tests/engine          # 355 pass / 0 fail
npx vitest run tools/unit      # 169 pass / 0 fail
npx tsc --noEmit               # exit 0
npx eslint .                   # exit 0
```

### 基线与现状对比（2026-10-20）

| 指标 | 当前真实数据 | 修复后期望 |
|---|---|---|
| 创作 version 恒为 1 的会话 | 19 / 20 | 0 / 20 |
| 有创作域的会话完成率 | 1 / 20 | ≥ 30% |
| 会话整体完成率 | 1 / 41（2.4%） | ≥ 30% |

### 后续优先级（不依赖本次修复）

1. **文本流式**：网关 `openai.ts:27` 硬编码 `stream:false`，首字延迟 8–20s → 目标 < 2s
2. **视频可用性**：`data/media/jobs.json` 中视频任务 2 个全部失败（队列满），当前实际可用性为 0
3. **失败可见性**：生成失败不写 `ExperienceEvent`，事后无法复盘

---

## 9. 步骤 2 / 3 / 失败落库的修复与证据（2026-10-20 第二轮）

### 9.1 步骤 2：取代 ≠ 丢弃

- **实现**：新增 `src/lib/experience/creation-domain.ts::archiveActiveCreation`——把活跃创作域连同 `contentHistory` 归档进 `ExperienceState.creationHistory`（上限 20，防止状态 JSON 无限增长），再标记 `active:false / endedReason:'superseded_by_create'`。
- **为什么抽成独立纯函数**：runtime 与回放诊断必须调用同一份实现。上一轮已经踩过「诊断复刻一份逻辑 → 测的是自己的副本」的坑。
- **类型**：`ExperienceState.creationHistory?: CreationDomain[]` 为可选——旧会话快照没有该字段，读取侧一律 `?? []` 兜底。
- **审计**：`CREATION_PREVIEWED` 事件 payload 增加 `archived: {creationId, version, versions}`，事后可从事件表追溯「哪一次取代归档了哪个作品、带几个版本」。
- **单测**：`tests/engine/creation-domain.test.ts` 6 用例（no-op / 幂等 / 整域归档 / 连续取代顺序 / 上限 20 / 覆盖后仍可追溯）。

### 9.2 步骤 3：同目标合并（含一个新语义判断）

原分析只写了「同目标合并」，落地时发现必须区分**两种**生成请求，否则会误伤用户开新作品的能力：

| 请求形态 | 例子 | 正确语义 | 处理 |
|---|---|---|---|
| 裸生成请求 | 「生成视频」「继续生成视频」「换一张图片」 | 没说新目标 → 对**当前作品**再生成 | `CONTINUE`（创作对象不动） |
| 带目标请求 | 「生成一张森林的图」 | 说了新目标，与当前作品不同 → 另起创作 | `CREATE`（取代并归档） |
| 带目标且同目标 | 「生成动态的视频，俩人在观海」× N | 同一作品再生成 | `CONTINUE` |

- **`isSameCreationGoal`**：规范化（去空白/中英文标点/小写）后**完全相等**才判同目标。保守策略——相近但不相同（换主体/换场景）一律新建并归档，绝不把换向意图悄悄合并。
- **`hasCreationSubject`**：剥掉生成动作 / 数量 / 模态 / 语气词后仍有内容，才算「说出了新目标」。这是区分「生成视频」（裸）与「生成一张森林的图」（带目标）的确定性判据。
- **单测**：`tests/engine/turn-routing.test.ts` 12 用例（同目标判定 4 + 路由 8，含「停止语义优先于合并」）。

### 9.3 失败落库

`runtime.ts::recordGenerationFailure`：媒体生成的四条失败出口（无参考图 / 空提示词 / 任务失败 / 异常）都写 `TURN_FAILED { stage:'generation', modality, turn, message }`。审计写入失败被吞掉——旁路不能影响用户流。

### 9.4 真实链路证据（非 mock）

`node tools/diagnose/e2e-creation-archive.mjs`：

```text
轮1 讲讲傍晚海边风怎么形成的 → DIRECT_ANSWER/ANSWER v2
轮  做成一个小游戏        → CREATE/CREATE v3 | creation.v=1 归档=0 版本内容=1
轮  做成一个小游戏        → CREATE/CREATE v4 | creation.v=1 归档=1 版本内容=1
归档1: creation_knj5ce_002 v1 版本内容=1 结束原因=superseded_by_create
判决：PASS
```

媒体路径（真实生图，非 mock）：

```text
start 傍晚海边风的插画                    → CREATE v2
生成一张傍晚海边的插画                     → CREATE   v3 creation.v=1 归档=1 gen=started:image,completed:image
生成一张傍晚海边的插画（同目标，再来一次）    → CONTINUE v4 creation.v=1 归档=1 gen=started:image,completed:image
生成一张雪山木屋的插画（换作品）             → CREATE   v5 creation.v=1 归档=2 gen=started:image,completed:image
```

第二行是本缺陷的核心判据：**同一句话第二次说，不再重建创作**（`CONTINUE`、`creation.version` 保持 1、归档数不增长），而换作品时归档数从 1 增到 2——历史被保留而不是丢弃。

### 9.5 回归

```bash
bun test tests/engine            # 381 pass / 0 fail（17 files）
npx vitest run tools/unit        # 169 pass
npx tsx tools/diagnose/session-replay.ts   # PASS
npx tsc --noEmit                 # exit 0
npx eslint .                     # exit 0
```
