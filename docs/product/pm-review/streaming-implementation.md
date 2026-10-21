# 文本流式改造（STREAM-TEXT-001）

- 状态：已实现并验证（2026-10-20）
- 动机：非流式路径下，用户要等 8–20 秒才看到第一个字。这个产品讲的是「陪伴」，
  而陪伴感在沉默里就消失了——首字延迟是用户感知最强的剩余短板。

---

## 1. 改造范围（四层）

| 层 | 文件 | 改动 |
|---|---|---|
| 网关 → 上游 | `mini-services/model-gateway/src/providers/stream.ts`（新） | `streamOpenAICompatible`：`stream:true` + SSE 解析 + 首字/空闲双超时 |
| 网关对外 | `mini-services/model-gateway/index.ts` | `POST /v1/chat/completions` 接受 `stream:true` → `text/event-stream`；`Bun.serve` 加 `idleTimeout:255` |
| 主应用传输 | `src/lib/experience/loopback-http.ts` | `localHttpStream`：socket 直连的增量读取（chunked / content-length） |
| 主应用客户端 | `src/lib/experience/llm-gateway.ts` | `LlmGateway.stream?()`：SSE → 异步增量序列（队列 + promise 桥接） |
| 运行时 | `src/lib/experience/runtime.ts` | 内容轮改流式：逐块 `content_delta`，完整文本仍走验证器 |
| 事件契约 | `src/lib/experience/types.ts` | 新增 `content_delta` / `content_discard` |
| 前端 | `use-experience-session.ts`、`turn-item.tsx` | 增量累积到待定气泡，定稿 content 整体替换；失败撤回 |

## 2. 纪律：流式不削弱 GS-06

**增量只用于展示，完整文本通过验证器后才写入状态。**

```text
content_delta × N（展示）
        ↓ 拼接
validateProposal(完整文本)
        ├─ 通过 → content（定稿）+ state + commitTurn
        └─ 失败 → content_discard（前端撤掉已显示的字）+ error
```

这是刻意的取舍：如果为了「快」跳过校验直接展示，就等于让模型输出绕过了
「不越权 / 不伪装状态」的防线。现在的做法是——**先给用户看，但随时准备撤回**。

## 3. 落地时踩到的四个坑（都已修）

1. **Bun.serve 默认 `idleTimeout` 是 10 秒**。SSE 在「上游首字还没来」时被判定为空闲，
   连接被掐断（日志：`[Bun.serve]: request timed out after 10 seconds`）。取上限 255s。
2. **客户端断开后 `controller.enqueue` 抛 `ERR_INVALID_STATE`**。用户切走 / 刷新时
   网关会炸出未处理异常。`send` / `finish` 全部包上「已关闭」守卫。
3. **SSE 事件会被网络块切断**。JSON 被拆到两个 TCP 块里，按块 `JSON.parse` 必然失败。
   客户端维护跨块的行缓冲（`sseBuffer`），按 `\n` 切行后再解析。
4. **UTF-8 多字节会被切坏**。中文一个字三个字节，落在块边界上会变成乱码。
   流式解码必须用 `TextDecoder({stream:true})`，收尾时再 `decode()` 冲刷残留。

## 4. 真实测量（非 mock）

产品端（`POST /api/experience/start`，读到第一个 `content_delta` 的时间）：

| 轮次 | TTFT | 总时长 | 增量条数 | 字符数 |
|---|---|---|---|---|
| 冷启动后首次 | 19.1s | 22.1s | 221 | 364 |
| 第 2 次 | 5.7s | 6.1s | 89 | 278 |
| 第 3 次 | 7.4s | 7.6s | 136 | 357 |
| 第 4 次 | 7.7s | 10.2s | 213 | 473 |

网关直连同一上游：1.7s / 2.5s / 5.5s / 13.3s（波动极大）。

**诚实结论：**

- 流式**已经生效**——`deltaCount` 89–221，说明文字是一块块出现的，不是最后一次性弹出；
- 但**首字延迟的主要来源是上游模型本身**（Agnes `agnes-3.0-flash` 的 TTFT 在
  1.7–13s 之间波动），不是我们的链路。这次改造把「链路瓶颈」清掉了，
  瓶颈暴露在上游选型上。
- 因此「首字 < 2s」这个目标**没有达成**，也不该靠继续优化代码达成。
  下一步是换更快的文本模型（配置里有 `deepseek-v4-flash` 记录，但当前密钥
  返回 HTTP 400，不可用），或给慢模型加「已连接、正在思考」的阶段性反馈。

## 5. 验证

```bash
bun test tests/engine                                   # 388 pass（含流式客户端 7 用例）
NO_PROXY=127.0.0.1 bun test mini-services/model-gateway/tests   # 100 pass（含 SSE 6 用例）
npx tsc --noEmit                                        # exit 0
```

`package.json` 的 `test:gateway` 已带上 `NO_PROXY=127.0.0.1,localhost`——
Bun 的 fetch 会把 127.0.0.1 也交给 `HTTP_PROXY`，mock server 否则不可达。
这只是测试可达性，不代表网关对上游 provider 的代理策略改变（外部域名仍走代理）。

## 6. 前端渲染验证（真实浏览器，CDP）

用无头 Chrome（`--headless=new --no-sandbox`）+ CDP 驱动真实页面：填入
「傍晚海边风为什么会变大」→ 点击「开始探索」→ 每 350ms 采样 `body.innerText` 长度。

```text
352ms:97   703ms:97   1085ms:97  1437ms:97  1787ms:97  2140ms:97
2495ms:113 2847ms:119 3199ms:173 3552ms:173 ... 6384ms:173
6746ms:239 7153ms:451 7606ms:451 8313ms:451 8666ms:451
```

**正文分 6 个阶段增长**（97 → 113 → 119 → 173 → 239 → 451）。改造前这里只会有
一次跳变（97 → 451），中间是 7 秒空白。这就是流式在真实 UI 上生效的直接证据。

截图：`e2e-stream-text-desktop.png`（完整回答落定后的体验页）。

注意：采样到的「首字」约 2.5s，比 SSE 事件层的 5–8s 更快——因为 innerText
包含了用户气泡与等待指示，真正的正文增长从 2495ms 起算。两个数字量级一致，
差异来自采样粒度与上游波动。
