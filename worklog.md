# Worklog — 个人体验引擎（intent-experience 愿景实现）

项目：在 /home/z/my-project 中逐步实现 https://github.com/aibiou/intent-experience 的产品愿景。
纪律：实现一步验证一步；无验证证据不宣称完成（对齐仓库治理哲学：退出码 0 ≠ 产品正确）。

---
Task ID: 1-a
Agent: Z.ai Code (主控)
Task: 读取 intent-experience 仓库契约参考，建立分步实施计划

Work Log:
- 克隆仓库至 /home/z/intent-experience-repo，通读 36 份产品归档、baseline 治理文档、G5 评测工作表、readiness-record（v1.80.0/CR-61）、迭代规划 D+A
- 精读四个核心实现作移植参考：classifier.ts（优先级链 STOP > CHANGE_DIRECTION > CORRECTION > CREATE > DEEPEN=SIMPLIFY=REFRAME > WHY=WHAT_IF > DIRECT_ANSWER）、state-machine.ts（双轴：状态轴 ENTERING→READY→ACTIVE→WAITING→…→COMPLETED + 阶段轴 CURIOSITY→UNDERSTANDING→SIMULATION→CREATION→COMPLETION，非法迁移一律拒绝）、policy.ts（S1 冻结映射表）、catalog.ts（18 条体验种子，含 Screen03 hook/context/entries）
- 调用 LLM Skill 确认 z-ai-web-dev-sdk@0.0.18 后端用法（role:'assistant' 作 system prompt，thinking disabled）

Stage Summary:
- 本轮切片范围（对齐仓库 S1 等价）：GS-01 直接回答 / GS-02 上下文解释 / GS-03 换方向 / GS-04 停止零续行 / GS-05 版本冲突拒绝 / GS-06 LLM 不写状态（构造保证）
- 切片边界（诚实声明）：CREATE/DEEPEN/SIMPLIFY/REFRAME/REPEAT/记忆/作品墙 不在本切片，命中时按"范围外拒绝并升级"纪律给诚实的边界说明，不发明语义
- CHANGE_DIRECTION 的会话周期采用 S3B 语义（方向变更=endSession），单会话内候选周期为后续切片

---
Task ID: 2
Agent: Z.ai Code (主控，上下文截断前的会话完成，本条为诚实补记)
Task: S1 切片实现——体验引擎核心 + API + UI 跑通

Work Log:
- Prisma schema：ExperienceSession（state Json / stateVersion / generation）+ ExperienceEvent（append-only 审计账本，@@unique([sessionId, seq])）；GS-05 stale 写入经 updateMany 条件守卫拒绝
- 引擎层 src/lib/experience/：types / classifier（STOP>CHANGE_DIRECTION>CORRECTION>CREATE>DEEPEN/SIMPLIFY/REFRAME>WHY/WHAT_IF>DIRECT_ANSWER 优先级链）/ policy（S1 冻结映射表）/ state-machine（非法迁移拒绝）/ validator / store（Prisma 持久化）/ runtime（状态唯一写入者）/ prompt-engine / llm-gateway（ZaiLlmGateway，z-ai-web-dev-sdk 单 provider，有界重试 1 次）/ catalog（体验种子）
- API 路由：/api/experience/{catalog,start,message,stop,session,sse}
- UI：home-screen / entrance-screen / experience-screen / turn-item / thinking-indicator / motto-footer / use-experience-session / sse 客户端
- dev server 运行中，dev.log 证实真实交互成功（POST /api/experience/message 200、会话恢复、版本守卫 UPDATE 生效）

Stage Summary:
- S1 引擎端到端已跑通（curl/浏览器证据在 dev.log）
- 欠账（本切片补）：①worklog 当时未记录（上下文截断）②零单测——GS-01~06 无机器可复跑的锁定 ③llm-gateway 内嵌主应用且仅 zai 单 provider——参考仓库架构应为独立网关模块（config-store 多记录自定义配置 + newapi OpenAI 兼容对接 + /config 配置页）

---
Task ID: 3-b
Agent: general-purpose
Task: S1 引擎纯逻辑单测补齐

Work Log:
- 读 worklog 与 src/lib/experience/ 五个待测对象（types / classifier / policy / state-machine / validator），通读参考仓库 /home/z/intent-experience-repo/tools/unit/ 下三份参考测试，理解其 describe/it + 契约引用风格
- 先写临时脚本对 85 条分类期望、45 条状态机期望（18 合法 + 27 非法）、policy/validator 边界逐一跑通真实实现，确认断言全部来自实际词表/迁移表（不发明契约）后再落测试文件
- 创建 tests/engine/{classifier,state-machine,policy,validator}.test.ts（bun:test + 相对路径导入 + bun-types 引用；未 import store.ts/llm-gateway，纯逻辑零 DB 零网络，不触碰 3000 端口 dev server）
- classifier：优先级链逐层锁定（STOP 混合句压倒一切 / CHANGE_DIRECTION / CORRECTION / CREATE / DEEPEN=SIMPLIFY=REFRAME / PD-12 WHY>WHAT_IF / DIRECT_ANSWER 显式+通用提问标记 / CONTINUE/REPEAT / UNKNOWN / 确定性）；范围外动作只锁"如实识别"，支持边界锁在 policy 层
- state-machine：合法迁移全通（含两条主干全链路走到 COMPLETED）、非法迁移一律拒绝（终态 8 触发器全集、越级/跳步/倒退、阶段轴越级）、GS-04 终态零续行、GS-03 CHANGE_DIRECTION 回 ENTERING/CURIOSITY 且旧阶段彻底丢弃、错误结果形状（code+from+trigger）
- policy：冻结表 7 条映射逐条锁定、范围外（CREATE/DEEPEN/SIMPLIFY/REFRAME/REPEAT/UNKNOWN/表外 SEARCH）ACTION_OUT_OF_SLICE_SCOPE 拒绝、冻结性断言（可解析键集合精确=7 键、13 动作 7 进 6 出、值域封闭 5 动作、POLICY_VERSION 精确值）
- validator（纯逻辑，全量可测）：空/超长（4000 含端点）/越权形态（system/state/action/policy 标签、```json、大小写、非行首）拒绝、不改写内容（只裁空白）、GS-06 第二道防线（塞入 state 字段被忽略、返回对象仅 ok/text）、确定性
- 修正一处我方测试编写错误（"简单一点，换个角度"含"换个"实际落 CHANGE_DIRECTION 层——改为"换角度"并注明），重跑全绿；`bun run lint` 退出码 0 无新增错误

Stage Summary:
- 新增 4 个测试文件 / 101 个用例 / 302 个 expect 断言：bun test tests/engine/ → 101 pass / 0 fail（45ms）；lint 退出码 0
- GS-05 说明：stale 写入守卫落在 store.commitTurn 的 Prisma updateMany 条件守卫（where id+stateVersion+status）——属集成层，纯逻辑单测无法覆盖（mock Prisma 只是在测 mock）；运行时侧 runtime.ts 的版本前置检查也与 store/llm-gateway 耦合。GS-05 机器验证需后续在 tests/integration/（一次性 SQLite + 真库断言 commitTurn 假版本返回 false + runtime VERSION_CONFLICT 路径）
- 发现的实现缺陷（只报告不修改）：①STOP 词表缺口——"算了/停（单字）/别说了"等常见停止表达落入 UNKNOWN（用户得到"没听懂"而非确定性停止，GS-04 风险）；②CONTINUE 词表死条目——"然后呢/还有呢"含提问标记"呢"必然先落 DIRECT_ANSWER（S1 内二者都映射 ANSWER，行为无差，但 trace/history 记录的 semanticAction 有审计漂移）；③ENTERING 卡死会话无法停止——STOP 仅从 ACTIVE/WAITING 合法，首轮 LLM 网关失败后遗留 ENTERING 视图的会话永远无法走 STOP/CHANGE_DIRECTION 终止路径（会话永远停留 ACTIVE 状态）

---
Task ID: 3-a
Agent: general-purpose
Task: 模型网关独立 mini-service

Work Log:
- 通读参考仓库 src/experience/config-store.ts（636 行：D-3 多记录、tmp+rename 原子写、摘要永不回 key）、llm-gateway.ts（OpenAI 兼容 fetch、端点容错）、http.ts；通读主应用 src/lib/experience/llm-gateway.ts（z-ai-web-dev-sdk 用法）与 SDK dist（配置从 cwd/home//etc/.z-ai-config 加载，错误以 "API request failed with status N" 抛出）
- 新建 /home/z/my-project/mini-services/model-gateway/（独立 bun 项目，自己的 package.json + bun.lock，仅依赖 z-ai-web-dev-sdk@0.0.18，端口 3031 写死不读环境变量，主应用 src/ prisma/ 一律未动）
- src/config-store.ts：ProviderConfigRecord（id/name/kind/baseUrl/apiKey/model/modality/enabled/isDefault/createdAt/updatedAt）；data/config.json 持久化 {"records":[]}；tmp+rename 原子写（rename 失败清残留）；文件缺失/损坏/records 非数组→空列表不崩溃；enforceDefaultUniqueness 写入时保证至多一条 default；maskApiKey 脱敏（sk-***后4位，过短全掩蔽）+ hasKey:true，读路径永不回明文 key
- src/resolve.ts：纯函数 resolveProvider——'zai'→内置；enabled 记录 id→该记录；缺省→isDefault 且 enabled→否则 zai；不存在/已禁用→ProviderResolveError(400 PROVIDER_NOT_FOUND，中文消息)
- src/retry.ts：瞬态=网络异常（fetch throw/TypeError/TimeoutError）+ 408/429/500/502/503/504；withRetry 等 2 秒重试 1 次（共 2 次尝试）后仍失败才抛；400/401/403/404 与空内容立即报；sleep 可注入（单测零真实等待）；z-ai SDK 错误按 "status N" 消息归一分类
- src/validate.ts：name/baseUrl/apiKey/model 必填非空、baseUrl 必须 http(s)://、重名拒绝（更新自身除外——调用方传排除自身的比较集）、enabled/isDefault 可选布尔（默认 true/false），全部中文 400 消息
- src/openai.ts：parseChatRequest（messages/provider 校验）、buildUpstreamRequestBody（messages 原样透传 + stream:false）、buildChatCompletionResponse（chatcmpl-随机 id/秒级 created/choices/finish_reason:stop）、buildApiErrorBody（{error:{message,type,code}}）、toZaiMessages（zai 分支 system→assistant，SDK 约定）
- src/providers/zai.ts：ZAI.create() 单例复用 + thinking disabled + 60s 超时护栏 + wrapZaiError 状态归一；src/providers/openai-compatible.ts：base 拼 /chat/completions（尾斜杠/已含后缀容错）、Bearer 鉴权、60s 超时、非 2xx 读 error.message 抛 UpstreamHttpError、空内容抛 EmptyContentError
- index.ts：Bun.serve(3031)；GET /healthz（ok/uptimeSec/defaultProvider）；POST /v1/chat/completions（provider 可选 zai 或记录 id，默认链解析，重试包裹，错误映射 400/404/401 透传与 502 中文"无法连接到提供方"）；GET/POST /api/providers（201 新增/200 更新，脱敏响应）；DELETE /api/providers/:id；POST /api/providers/:id/test（极小请求"回复ok两个字"，60s 超时，总是 200 用 body 区分成败）；全响应带 Access-Control-Allow-Origin:*，OPTIONS 预检 204

Stage Summary:
- 产物：mini-services/model-gateway/（package.json / index.ts / src{config-store,resolve,retry,validate,openai,providers/{zai,openai-compatible}} / test 5 文件 / data 运行时生成）
- 测试：bun test 81 pass / 0 fail（resolve 11、validate 17、openai 20、retry 16、config-store 17），纯逻辑零真实网络
- curl 证据：healthz {"ok":true,"defaultProvider":"zai"}；真实 LLM 调用（z-ai SDK 非 mock）"1+1"→"2"、显式 provider:"zai" "3×7"→"21"（model glm-4-plus）；provider CRUD——POST 201 + apiKeyMasked "sk-***t123"（明文 key 全程不外泄）、GET 脱敏、isDefault 更新后 healthz defaultProvider="newapi-test"、DELETE 后列表空 + 回退 "zai"；错误路径——假 baseUrl 显式调用 502 "无法连接到提供方「newapi-test」"、test 端点 200 {ok:false,error}、重名/非法 URL/缺字段/不存在 id/缺 messages 均 400 中文消息；OPTIONS 204；data/ 无 tmp 残留
- 待办（下一任务）：主应用 llm-gateway 接线到 3031（替换内嵌 ZaiLlmGateway），/config 配置页

---
Task ID: 4
Agent: Z.ai Code (主控)
Task: 缺陷修复（单测发现）+ 主应用接线独立模型网关 + 全量回归

Work Log:
- 修复缺陷①（STOP 词表缺口，GS-04 风险）：classifier.ts STOP_PATTERNS 补 /算了/、/^停/（行首锚定防"地球停转""别停"误伤）、/别说了/、/别讲了/、/不聊了/、/不玩了/、/别继续了/、/退出/
- 修复缺陷③（ENTERING 卡死）：state-machine.ts 补 ENTERING/READY → COMPLETED/COMPLETION 两条 STOP 规则（任何非终态可停——用户主权；runtime STOP 路径自动生效）
- 缺陷②（CONTINUE"然后呢/还有呢"死条目）：不修——与参考仓库 classifier 同款行为（提问标记层优先于 CONTINUE），S1 内策略行为等价，记录为已知边界
- 测试同步：classifier.test.ts +2 用例（新停止词回归锁 11 输入、^停 锚定不误伤 3 断言）；state-machine.test.ts 改 3 处过时断言（ENTERING 触发器白名单加 STOP、READY STOP 转合法、错误信息示例换 USER_ACTION）+1 修复回归锁用例
- 主应用接线：llm-gateway.ts 重写 ZaiLlmGateway → HttpLlmGateway（POST 127.0.0.1:3031/v1/chat/completions，OpenAI 兼容；60s 超时；有界重试 1 次仅网络/5xx；4xx 不重试）；runtime.ts 单例改用 HttpLlmGateway
- 回归验证：bun test 103/103（+2）；lint 0；端到端——start（deep-luminous-sea「它们为什么要发光？」）经网关真实生成 FIRST_LAYER 内容；新停止词「算了」→ COMPLETED/user_stop/零 LLM 调用；终态后消息 → SESSION_COMPLETED 拒绝（GS-04 零续行）
- 依赖路径负向证明：停网关（kill pid 6052）→ 主应用 start → LLM_GATEWAY_ERROR"这一轮生成失败了（状态未改变）"诚实报错、stateVersion 零变更；重启网关 → 同体验重试成功生成

Stage Summary:
- 主应用 LLM 调用路径已唯一收敛到独立模型网关 mini-service（3031）；提供方路由（zai 内置/自定义 newapi）对主应用透明
- 3-b 发现的两个真缺陷修复并有回归锁；103 单测全绿
- 端到端证据链：正向生成 ✓ / 新停止词 ✓ / 零续行 ✓ / 停机诚实报错+零状态变更 ✓ / 恢复自愈 ✓

---
Task ID: 5
Agent: Z.ai Code (主控)
Task: 模型网关配置 UI（/ 路由内设置面板）+ 环境问题攻坚 + 浏览器全链路验证

Work Log:
- 新建 src/components/experience/settings-panel.tsx（首页右上角齿轮 → Dialog）：默认提供方横幅（healthz）、自定义 provider 列表（脱敏 key 徽章 + 设默认/测试/删除）、新增表单（name/baseUrl/apiKey/model/isDefault，OpenAI 兼容/newapi 语义 + 隐私说明）；home-screen.tsx 挂载入口
- 浏览器请求纪律：设置面板全部走相对路径 + XTransformPort=3031（经 caddy 转发）；主应用服务端调用走 127.0.0.1:3031 直连
- 环境攻坚①（XTransformPort 转发验证）：对外入口是 caddy(:81)；直连 3000 会绕过转发（agent-browser 首次开 127.0.0.1:3000 时面板显示"不可达"的根因）；改经 81 打开后 /healthz?XTransformPort=3031 → 200 网关响应 ✓；3003 无服务对照 → 502（转发机制本身工作）
- 环境攻坚②（沙箱进程收割，重要发现）：后台 mini-service 会被周期性静默收割（无 OOM、无错误输出，观察从 400 秒到 8 秒不等）；主 dev server 亦会被收割一次（Connection refused，重启恢复）；instrumentation.ts 的 setInterval 在 Next dev 中实测不持续运行
- 解法（请求驱动自愈）：llm-gateway.ts 增 ensureGateway()——每次生成前探测 healthz（活着时开销毫秒级）；不可达且过 10s 限频窗 → detached spawn 拉起 + 等 3s；instrumentation.ts 保留服务器启动时的单次拉起（冷启动就绪）
- 自愈实测：杀网关 → 用户立即发体验消息 → 5.2 秒内完整走完（拉起+真实生成），用户无感
- 浏览器验证（agent-browser 经 81）：首页渲染 ✓；设置面板"当前默认提供方：zai（内置）"✓；新增 newapi（假地址）→ 列表显示 + 密钥脱敏 sk-***3456 ✓（明文不出现在任何响应）；test 请求经 81 转发往返 200 ✓；删除 → 网关 data/config.json records=[] ✓；体验流冒烟（自由输入"雨声为什么让人平静？"→ 经网关真实生成 → 完整回答+操作条）✓；UI 点"好了"→ 干净结束层"这次探索到这里/你想继续的时候随时回来/回到首页"零推荐 ✓
- lint 0；bun test 103/103 维持全绿

Stage Summary:
- 模型网关体系闭环：独立 mini-service（3-a）+ 主应用 HTTP 客户端接线（4）+ 配置 UI（5）——自定义 provider（newapi OpenAI 兼容）从 UI 配置到网关路由到体验流调用的全链路打通
- 运维注意（本沙箱特性，worklog 留档）：后台进程会被收割；网关由主应用请求驱动自愈（ensureGateway）保障，主 dev server 若被收割需重启 bun run dev
- 诚实边界：编辑 provider 需重输密钥（网关 upsert 校验 apiKey 必填——简单安全，避免"省略=保留旧值"的隐式行为）；newapi 真实端点未实测（无真实密钥），OpenAI 兼容契约由网关 81 单测锁定 + 假地址错误路径验证

---
Task ID: 6-plan
Agent: Z.ai Code (主控)
Task: S2a 切片语义调研与实施规划（完整 G04 Creation / G07 Correction / WHAT_IF 分支 / Minimal Memory）

Work Log:
- 读参考仓库 S2 范围裁决（PD-23 选项 B 分批：S2a 核心能力收束 → S2b 体验动作扩展）
- 读 S2a 实施授权（F-1 网关注入缝已由我们的独立模型网关覆盖；F-2/F-3/F-4/F-5 为本轮切片）
- 精读四个参考实现：creation.ts（708 行：子状态机 CREATE_INTENT→CONTEXT_INHERIT→MINIMAL_BUILD→PREVIEW→USER_FEEDBACK→COMPLETE、五项上下文继承、补丁词表/冲突判据/ASK 纪律、版本化+stale 拒绝）、correction.ts（MODIFY 别名词表/RESTORE 子型/指代表/目标派生）、simulation.ts（四元分离、分支记录、SWITCH/ABANDON/RETURN/ADOPT_BRANCH、分支不回流主线）、memory.ts（REMEMBERED/IN_USE/DECAYING/EXPIRED 生命周期、衰减参数、写入过滤、6个月保留+删除审计）
- 读 F-2 语义冻结文本：D-02 轴外子状态机（阶段轴不变）、D-03 会话内持久（跨会话属 F-5）、D-05 完成信号经 STOP 路径登记（USER_FEEDBACK→COMPLETE + creation_completed，轴触发器不变）、创作会话输入路由（修改意图不落通用 CORRECTION；完成词表 08 §27；冲突 ASK 至多一问）
- 核对我方现状：state-machine.ts 的 CREATE/CORRECTION/WHAT_IF 触发器规则已齐备（S1 保留契约完整性）；classifier 已识别 CREATE/MODIFY 族缺失别名；policy 冻结表 7 键（CREATE 表外）

Stage Summary:
- 我方 S2a 适配决策（诚实边界）：①创作对象采用内容型模型（concept{theme,goal}+content 草稿+userChanges 补丁权威历史+version+phase）——参考的 objects/rules/variables 结构化模板为合成模式设计，真实 LLM 下局部修改纪律经提示约束+补丁权威登记实现；②创作/分支域持久化于会话 state JSON（D-03 会话内持久）；记忆为唯一跨会话域（Prisma 全局表）；③所有域写入仍经 runtime 单一写入者 + commitTurn 版本守卫（每轮恰好 +1，比参考更严）；④WHAT_IF 自 CREATION 阶段非法（冻结契约），创作会话内"如果…"按冲突判据 ASK 或诚实拒绝
- 实施分解：6-a 子代理 creation.ts+correction.ts 纯逻辑+单测；6-b 子代理 simulation.ts+memory.ts 纯逻辑+单测；6-c 主控契约层升级（types/policy_v2/classifier 别名/prompt-engine）+ runtime 编排 + Prisma 记忆表；6-d UI（创作卡/分支徽章/快捷动作）；6-e 全链路验证

---
Task ID: 6-a
Agent: general-purpose
Task: S2a 切片——creation.ts + correction.ts 纯逻辑模块 + 单测（G04 完整 Creation / G07 完整 Correction 语义）

Work Log:
- 读 worklog（3-b 测试纪律：先临时脚本跑通真实实现再落测试、断言不发明契约；6-plan S2a 决策①：内容型创作对象）与参考仓库 creation.ts（708 行）/correction.ts（120 行）；读我方 classifier.test.ts / state-machine.test.ts 对齐 bun:test + 契约引用 + 循环断言风格
- 新建 src/lib/experience/creation.ts（只新建，未动任何现有文件）：类型（CreationPhase / CreationOperation {add,remove,modify,restore} / CreationModifyKind 五子型 / CreationPatch 含 restoreFromVersion / CreationChange / 内容型 CreationObject{concept, content, userChanges, version, phase} / CreationInterpretation / InheritedCreationContext）+ 9 函数（nextCreationPhase 6 规则迁移表、inheritCreationContext 五项×N 计数、extractCount、TARGET_SYNONYMS 8 条、extractTarget 三层（中文同义词→content 英文目标词→'creation'）、interpretCreationInput（完成词表→add/remove/modify 构造→4 轴冲突判据 ASK 一问→none）、applyCreationPatchMeta（深拷贝+version 恰好+1+userChanges 追加，content 一律不变——真实 LLM 适配：登记权威/内容生成分离）、buildRestorePatch、interpretRestore（fromVersion=max(1, version-1)））
- 新建 src/lib/experience/correction.ts：MODIFY_PATTERNS（与 interpretCreationInput 修改族同源，D-01 单一词表两处路由）/RESTORE_PATTERNS 三词/PREVIOUS_CANDIDATE_PATTERNS 6 词/isRestoreIntent/deriveCorrectionTarget（指代→creation_component（TARGET_SYNONYMS 映射）→current_candidate）；creation↔correction 循环 import 经函数体引用（无顶层求值依赖，Bun ESM 安全）
- 临时脚本（/home/z/scratch-s2a/，跑完即删）对迁移表 6×6 全矩阵、继承五项、数量/目标全值域、解释四分支全样例、补丁登记不变式、恢复三态、纠正词表正负样本共 130+ 断言逐一跑通真实实现，确认零偏差后落测试文件
- 新建 tests/engine/creation.test.ts（47 用例/173 断言）：子状态机 6 合法全通（含主干全链路与 USER_FEEDBACK↔PREVIEW 三轮循环）+ 穷举 36 组合恰 6 合法 30 拒（越级/倒退/自环/patch_applied 仅自 USER_FEEDBACK/PREVIEW 上 completed 拒——完成必经预览的机器结构面/终态 COMPLETE 六事件全拒）；继承五项各断言（×N 计数、零计数不入表、"做成一个小游戏。"→"一个小游戏"、半角句号、无"做成"用原文、coreVariables 恒空）；extractCount 全值域+默认+词表首命中如实锁（"12"→2）；TARGET_SYNONYMS 全 8 条 11 词；extractTarget 三层；完成词表 4 词；add/remove 样例（"再加两个障碍"→{add, obstacle, count:2}）；modify 四子型（rebalance/restyle/rename 带 to（"改名叫做传送门"→to="叫做传送门"，冻结正则如实锁定）/tune）+ replace 不可达性如实锁（"换成/替换"必含"换"字恒落 CHANGE_DIRECTION 冲突轴→ambiguous，与参考一致）；冲突 4 轴全覆盖（question 用 08 §16 原文格式）；'none'；补丁登记（version 恰好+1、原对象不被 mutate（深拷贝+JSON 快照对照）、content 逐字节不变（同引用+长度）、连续 3 补丁 1→4 单调且旧版本对象冻结、登记与外部后续 patch 变异隔离）；恢复三态（version=3→2、version=1 收敛 1、未命中 null）
- 新建 tests/engine/correction.test.ts（10 用例/44 断言）：MODIFY 正/负样本（正 11 输入覆盖五子型词族；负含"再加两个障碍/移除出口"证明 ADD/REMOVE 不属 MODIFY 族）；RESTORE 三词命中 + 指代非恢复负样本 + 与 isRestoreIntent 同词表一致性；指代 6 词全命中；deriveCorrectionTarget 三分支（指代优先（"把刚才那个障碍改一下"→previous_candidate）、creation_component 分量值（obstacle/exit/difficulty）、默认 current_candidate（含无 creation 时同义词不参与路由的如实锁定））

Stage Summary:
- 产物：4 个新文件（src/lib/experience/{creation,correction}.ts + tests/engine/{creation,correction}.test.ts），零修改现有文件（git status 证实仅 4 个新增）；纯逻辑零 DB 零网络零 Prisma import
- 测试：bun test 两新文件 57 pass / 0 fail（217 断言）；全 engine 套件 160 pass / 0 fail（原 103 全绿不受影响）；bun run lint 退出码 0；bunx tsc --noEmit 对 4 个新文件零错误（仓库其余 tsc 报错均为既有，与本任务无关）
- 关键决策/发现（只报告不修改）：①applyCreationPatchMeta 与参考 applyCreationPatch 的关键差异——只登记不写 content（真实 LLM 适配：内容由 runtime 经 LLM 局部修改后另行写入，本函数只管版本与权威历史）；②replace 子型在冻结词表下不可达（"换成/替换"必含"换"字→恒命中 CHANGE_DIRECTION 冲突轴走澄清问题），与参考实现行为一致，已如实锁定并注明；③extractCount 词表首命中不做算术（"12"→2）、rename 正则捕获"改名"后全部文本（"改名叫做传送门"→to="叫做传送门"）——确定性表的真实行为，如实记录；④下一个任务（6-b/6-c）注意：CreationPhaseEvent/CreationObject 类型与 runtime 编排对接时，补丁应用轨道（applyCreationPatchMeta+LLM 写 content）与阶段迁移轨道（nextCreationPhase）分离，completed 仅可自 USER_FEEDBACK 发出

---
Task ID: 6-c
Agent: Z.ai Code (主控)
Task: S2a 契约层收尾 + runtime 编排 + 记忆持久化 + 全量回归与端到端验证

Work Log:
- 恢复上下文：检查发现上次会话截断前已完成部分契约升级（types/policy/classifier/prisma schema 已到 S2a 形态，policy.test 7 处失败未同步）；6-a/6-b 四个纯逻辑模块已在
- 测试同步：policy.test.ts 更新为 8 键冻结表（CREATE→CREATE 启用、13 动作 8 进 5 出、值域 6 动作、policy_v2.0.0-s2a）；state-machine.test.ts 版本断言 → state_machine_v1.3.0-s2a
- 6-c-2：types.ts CreationDomain 增 contentHistory: string[]（RESTORE 内容回填的唯一确定性数据源——放域层而非 6-a 的 creation.ts，零改动已测模块）
- 6-c-3：store.ts——createSession 初始化 creation:null + simulation 空域；loadSession 对遗留行防御回填（withS2aDomains）；记忆持久化 loadMemoryRecords/saveMemoryRecords（ISO 字符串 ↔ Prisma 行映射、upsert by recordId、deletionAudit 经 Prisma.JsonNull/InputJsonObject）；db push 确认 MemoryRecord 表已同步
- 【严重既有缺陷发现并修复（GS-05）】：store.commitTurn 的 `const count = await updateMany(...); if (count === 0)` ——count 是 BatchPayload 对象，与 0 比较恒 false，S1 起 stale 写入从未真正被拒绝（状态未更新但事件被追加且返回 true）。TS2367 恰好暴露。修复：解构 `{ count }`。git show HEAD 证实缺陷存在于 S1 提交
- 6-c-4：prompt-engine.ts——SIMULATE 提示加四元分离硬性格式（事实——/推断——/假设——/。本提案，deriveSimulationSeparation 依赖的标记）；新增 buildCreationFirstPrompt（最小构建纪律：不问配置、可感知初稿、分量括号标注）与 buildCreationPatchPrompt（局部修改纪律：只改要求部分、输出完整新草稿）
- 6-c-5：runtime.ts 完整 S2a 编排——①创作会话输入路由（对齐参考 runtime.ts:449-532：UNKNOWN/CORRECTION 层经 interpretCreationInput——完成信号→STOP 路径登记（D-05）、修改意图→CREATE 伞形、冲突→ASK；RESTORE 预检先判且 version>1）；②首建轮（EXPERIENCE_STARTED→CREATE 触发器→继承五项→LLM 最小构建→子状态机链 CREATE_INTENT→…→PREVIEW 同轮→CREATION_PREVIEW，superseded_by_create 取代登记）；③补丁轮（PREVIEW→feedback_started→USER_FEEDBACK→patch_applied→PREVIEW；RESTORE 走 contentHistory 字节级回填不调 LLM；applyCreationPatchMeta 登记+LLM 内容分离）；④ASK 轮（确定性问题、子状态不推进）；⑤STOP 轮创作完成登记（完成必经反馈轮：PREVIEW→USER_FEEDBACK→completed→COMPLETE；预览在途按终止登记；exitReason=creation_completed + CREATION_COMPLETED 内容轮）；⑥分支操作轮（interpretBranchOperation→validate→apply，四操作确定性 BRANCH_NOTICE；UI 需以"如果…"前缀发送——与参考 UI 一致）；⑦WHAT_IF 自 CREATION 非法（冻结契约）→冲突 ASK 或诚实边界；⑧记忆读写（loadMemorySignals 懒到期+RECALL+滑窗注入提示、内容轮后 recordMemory 观察、withdraw/correct 确定性 MEMORY_NOTICE 轮）
- 分支路由设计验证：查证参考 UI（experience-screen.tsx:1415）发送"如果采用分支N"——分支操作输入以"如果"前缀落 WHAT_IF 层，我方无需改分类器优先级链（零黄金回归）
- 环境处置：dev server 重启加载重新生成的 Prisma client（memoryRecord 模型在旧进程 undefined）；db:push 确认 schema 已同步

Stage Summary:
- 测试：bun test 246 pass / 0 fail（+2 policy 用例）；bunx tsc --noEmit experience 模块零错误；lint 退出码 0
- 端到端（curl SSE 全链路）：FIRST_LAYER→SIMULATION_RESULT（四元分离标记 ✓ + branch_0001 自动创建 + stage→SIMULATION）→RETURN 分支操作 BRANCH_NOTICE ✓→CREATION_PREVIEW v1（stage→CREATION）→add×2 补丁 v2→"退回刚才那个"RESTORE v3【字节级 === v1 ✓ + op=restore rf=1】→"就这样"creation_completed + COMPLETED + 终态零续行（GS-04）→ 旧版本写入 VERSION_CONFLICT（GS-05 修复后真实验效）
- 记忆域端到端：蜂鸟主题写入→"别再推荐蜂鸟相关的东西"撤回（EXPIRED + withdrawnAt + deletionAudit{reason:"withdrawn"}）→沙漠夜空写入→"记忆纠正：高原的夜空"更正（topic 更新 + corrections=1）；IN_USE/再探索 interest=1 均观察到
- 浏览器验证（agent-browser 经 81）：自由输入→体验流→"做成一个极光观测小游戏"→CREATION_PREVIEW 渲染→"再加两个障碍"补丁渲染→"就这样"→"作品完成"结束层 + 全控件禁用 + 回到首页 + 零 console 错误 + footer 正常 + 移动端 390px 无溢出
- 事件账本：SESSION_STARTED→POLICY_DECIDED→CONTENT_DELIVERED→SIMULATION_RECORDED→BRANCH_OPERATION→CREATION_PREVIEWED→CREATION_PATCHED×2→EXPERIENCE_COMPLETED 全程留痕
- 诚实边界（只报告）：①"撤销刚才的修改"（含"的"）不命中冻结 RESTORE 词表（/撤销刚才修改/）落 modify/tune——冻结契约词表行为，如实记录不改；②RESTORE 无 contentHistory 防御路径保底当前内容（正常流不可达）；③UI 对新 kind（CREATION_*/BRANCH_NOTICE/MEMORY_NOTICE）走默认卡片渲染不崩溃但无专项样式；④SIMULATION_RESULT 四段标记原样透出到前端（6-d 需解析渲染）；⑤创作/补丁轮 kind 徽标与分支面板、快捷动作未做——6-d 范围
- 下一步（6-d）：UI 升级——创作卡（版本徽章/分量标注渲染）、模拟四段解析渲染、分支徽章与分支面板、快捷动作（采用分支N/回到主线）、记忆设置入口；然后 6-e 全链路验收

---
Task ID: 6-b
Agent: general-purpose
Task: S2a 切片——simulation.ts + memory.ts 纯逻辑模块 + 单测（WHAT_IF 完整分支域 + Minimal Memory）

Work Log:
- 读 worklog（3-b 测试纪律：断言全部来自实际词表/迁移表、不发明契约；6-plan S2a 决策②③：分支域会话 state JSON 持久、记忆为唯一跨会话域；边界：不引入 S3a 跨会话分支持久化与长期记忆）；精读参考仓库 simulation.ts（519 行）/memory.ts（698 行）与参考单测风格；读我方 classifier.test.ts 对齐 bun:test + 契约引用头注释 + 循环断言风格
- 新建 src/lib/experience/simulation.ts（只新建，零修改现有文件）：类型（SimulationSeparation 四元分离 E8-G2-CC07 / SimulationRoundRecord / BranchLifecycle 三态 / BranchRecord 含 adopted 附加属性 / BranchOperation / SimulationDomainState 含 roundCounter+branchCounter）；5 函数（deriveSimulationSeparation 标记确定性切分、interpretBranchOperation 词表优先级 RETURN>SWITCH>ABANDON>ADOPT_BRANCH + 作用域词+序号可解析门槛（中文数字一~十→1~10）、validateBranchOperation 前置校验（RETURN 无激活拒绝/序号越界拒绝/ABANDONED 目标拒绝）、applyBranchOperation 四操作状态转移（RETURN→RETURNED+指针清空、ABANDON→ABANDONED+记录保留、ADOPT_BRANCH 幂等+指针不变+生命周期不变、SWITCH→ACTIVE 含 RETURNED 恢复）、recordSimulationRound 首轮自动 CREATE 分支+轮次双登记+跨分支连续编号）
- 新建 src/lib/experience/memory.ts：类型（MemoryLifecycle 四态 / MemoryRecord 十四字段 / MemoryDeletionAudit / MemorySignal / 共用结果联合）+ 规范参数常量（锚点 0.9 / K=ln(0.9/0.63)/3 / 阈值 0.5、0.1 / 保留期 180 天）+ 10 函数（effectiveInterest 指数衰减、passesMemoryWriteFilter 六类负向过滤、recognizeMemoryOperation WITHDRAW>CORRECT、extractCorrectedTopic、recordMemory（过滤/再探索 +0.15 上限 1/confidence 0.7|0.95 分支/recordId 注入或默认去重）、recallMemory（REMEMBERED→IN_USE、IN_USE/DECAYING 幂等）、correctMemory（corrections+1+锚点重置+source 变更）、withdrawMemory（→EXPIRED+撤回审计）、applyMemoryDecay（保留期优先>decay_threshold>DECAYING 迁移不刷新 updatedAt）、retrieveRelevant（先懒到期+2 字滑窗相关性+RECALL 迁移不发事件+读时点衰减值））
- 新建 tests/engine/simulation.test.ts（35 用例）与 tests/engine/memory.test.ts（49 用例）：完整四段切分/缺标记空串容错/ simulation=全文；RETURN 五词/中文数字序号/序号 0 越界/支线无"分支"字样不识别（词表实现细节如实锁定）/混合操作词优先级；validate 三类拒绝+合法通过；apply 四操作状态转移逐一断言（含 ADOPT 幂等、RETURNED 分支被 ADOPT/SWITCH 的生命周期不变/恢复）；recordSimulationRound 首轮建分支/第二轮同分支 version=2/RETURN 后跨分支连续编号 sim_round_0003+branch_0002/SWITCH 往返；衰减锚点 Day0=0.9/Day3≈0.63（容差 0.01）/未来时间不增/非法日期 0 天/常量锁定；六类过滤各一例+intentSignal 侧命中；recordMemory 新记录字段全量 toEqual+两 confidence 分支+默认 recordId 去重+再探索 0.6→0.75 与 0.9→1 上限+EXPIRED 同主题新建；recall/correct/withdraw 各迁移与拒绝与幂等路径；decay 四迁移（90 天 IN_USE→DECAYING 不刷新 updatedAt/60 天 DECAYING→EXPIRED decay_threshold/181 天 retention_expired 隐私优先/179 天不删+EXPIRED 跳过审计不覆盖）；retrieveRelevant（相关命中 REMEMBERED→IN_USE/3 天衰减读值≈0.63/EXPIRED 不返回/超保留期懒到期/无滑窗交集不返回/DECAYING 命中不迁移）；全部返回数组的函数均有 JSON 快照对照的入参未 mutate 断言
- 验证：bun test 两新文件 84 pass / 0 fail（333 断言）；bun run lint 退出码 0；bun test tests/engine/ 全量 244 pass / 0 fail（原 103 用例重跑确认 103/103 全绿不受影响；6-a 并行产物 57 例同套件共存）；bunx tsc --noEmit 对两新文件零错误（仓库其余 tsc 报错均为既有文件，与本任务无关）

Stage Summary:
- 产物：4 个新文件（src/lib/experience/{simulation,memory}.ts + tests/engine/{simulation,memory}.test.ts），零修改现有文件（git status 证实仅新增）；纯逻辑零 DB 零网络零 Prisma import；TypeScript 严格类型
- 关键决策（与参考实现的差异，规格优先）：①deriveSimulationSeparation 缺标记容错修正——参考实现 markerStart+len 无守卫，缺"事实——"标记时会从下标 3 切出错位垃圾片段；我方按规格"sectionOf：start>=0 && end>start 才截取"对标记缺失保持 -1 使该段为空串（完整四段输入行为与参考逐字节一致，仅缺标记边界面修正）；②Store 类去状态化——参考为进程内 Map 存储（S3a 跨会话形态），我方按 S2a 规格改纯函数（branches/records/state → 新数组新状态），持久化交给 6-c 接线会话 state JSON / Prisma 记忆表；③MemoryRecord 去掉 sessionId/experienceId/memoryClass/candidateLongTerm（S3a 范围外），MemorySource 仅 session_observation|user_correction；④withdrawMemory 不设 expiredAt（撤回留痕字段独立于到期字段，与参考一致）；⑤检索信号 interestSignal 取 RECALL 迁移前的读时点衰减值（参考语义：读时快照）
- 交接注意（6-c）：SimulationDomainState.roundCounter/branchCounter 从 0 起、编号自 1 起（sim_round_0001/branch_0001）；记忆 recordId 建议由 runtime 注入（默认 memory_ 四位补零仅测试/兜底）；apply 前必须先 validate（apply 未命中目标回退 branches[0] 属契约不可达路径）

---
Task ID: 6-d
Agent: Z.ai Code (主控)
Task: S2a UI 升级——创作卡 / 模拟四段解析 / 分支面板与快捷动作 / 记忆查看入口

Work Log:
- simulation.ts 新增 deriveSimulationPresentation（呈现层四段视图：事实/推断/假设 + proposal 尾段；缺标记 parsed=false 回退整文；标记保持模块私有）；simulation.test.ts +8 用例（含尾标记吞句号行为与 deriveSimulationSeparation 一致性锁定）——254 单测全绿
- use-experience-session.ts 扩展：state 事件/恢复提取分支域（branches 序号=记录顺序+1、currentBranchId）与创作域（version/active）；轮次徽章纯呈现层推导——创作版本游标（CREATION_PREVIEW→1、CREATION_PATCHED→+1，superseded 重建自然重置）+ 模拟轮次拉链（第 i 条 SIMULATION_RESULT ↔ rounds[i]，每成功 SIMULATE 轮恰登记一条）；live 与 restore 共用同一路径
- turn-item.tsx 重写：SIMULATION_RESULT 四段解析卡（SeparationRow 小标签行：事实/推断 stone、假设 rose；提案正文分区；缺标记回退整文）+ 多分支时「分支N」徽章；CREATION_PREVIEW/PATCHED 作品卡（「作品」「第 N 版」「已应用你的修改」徽章 + （分量：值）标注渲染——整段纯标注→chip 行、行内→amber 高亮）；CREATION_ASK 澄清卡（「再确认一下」+ 左暖边）；CREATION_COMPLETED 完成卡；BRANCH_NOTICE/MEMORY_NOTICE 虚线注记卡 + 徽章
- branch-panel.tsx 新组件：折叠面板（分支列表/生命周期三态徽章/已采纳/当前/轮次计数）；快捷动作发「如果…」前缀普通输入经既有词表路由（回到主线/切换到分支N/采用分支N）——面板零状态写入，Runtime 仍是唯一写入者；ABANDONED 不可操作、已采纳幂等（按钮消失）；明示「推演不自动变成事实」
- experience-screen.tsx：挂载分支面板；阶段化输入占位（SIMULATION/CREATION）；creation_completed 结束层文案区分（「作品完成」/「每一步修改都完整保留」）
- 记忆查看入口：/api/experience/memory GET（安全字段：topic/lifecycle/interestSignal/corrections/时间戳；不透出 intentSignal/deletionAudit）+ memory-panel.tsx（首页右上角 Brain 安静入口、生效/失效分区、兴趣 0-1 刻度、更正计数、撤回/更正引导语——只读，操作仍走体验内输入）
- sse.ts body 参数放宽 Record→object（StartInput 接口无索引签名的 tsc 误报）；use-experience-session cbRef 可选链（tsc 零错误）

Stage Summary:
- 产物：3 新文件（branch-panel/memory-panel/api/experience/memory）+ 7 修改（turn-item/use-experience-session/experience-screen/home-screen/simulation/simulation.test/sse）
- 回归：bun test 254/254；lint 0；tsc experience 相关零错误
- 设计纪律：面板动作=普通输入（分类器→词表路由，UI 无特权直写）；徽章推导=纯呈现层拉链（不碰引擎语义）；记忆端点只读（撤回/更正保持体验内确定性路径）

---
Task ID: 6-e
Agent: Z.ai Code (主控)
Task: S2a 全链路浏览器验收（agent-browser 经 81 入口）+ 验收中发现的真实缺陷修复

Work Log:
- 首页：渲染 ✓；记忆面板（我记住的）——生效区生命周期徽章/兴趣刻度/更正计数 ✓、失效区「你撤回的」/「自然过期」✓、引导语 ✓
- 模拟链：WHAT_IF→四段解析卡（事实/推断/假设标签行+提案正文+「模拟结果≠事实」脚注）✓；分支面板出现「分支 1 · 模拟进行中」✓；分支内第二轮同徽章 ✓；「回到主线」→BRANCH_NOTICE ✓；主线新 WHAT_IF 自动建分支2 + 新旧轮次分别带「分支 1」「分支 2」徽章 ✓；「进入」（SWITCH 分支1）✓；「采纳为参考」（ADOPT 分支2）→面板标记 + 幂等（按钮消失）✓
- 创作链：「做成一个山顶云观测小游戏」→CREATION_PREVIEW（作品/第 1 版/分量标注 chip 行）✓；「再加两个观察点…」→CREATION_PATCHED 第 2 版 + 内容三→五观察点 + v1 卡保留 ✓；「退回刚才那个」→RESTORE 第 3 版（内容=v1 正文，版本单调）✓；「就这样」→CREATION_COMPLETED 卡 + 结束层「作品完成」✓；终态全部控件禁用（零续行 GS-04）✓；恢复已完成会话——全部徽章（模拟/分支/作品 v1→v3）经拉链完整重放 + 分支面板 + 只读态 ✓
- 记忆链：正常会话内「别再推荐沙漠绿洲相关的东西」→MEMORY_NOTICE + DB 记录 EXPIRED/withdrawnAt/deletionAudit{withdrawn} + 会话 v4 同步提交 ✓；未命中主题→诚实「没有找到」✓
- 澄清链：创作中「不对，改名叫做星空图鉴」→分类器 CORRECTION + 创作修改词→冲突轴→CREATION_ASK「再确认一下」卡 ✓（确定性零 LLM）
- 布局：移动端 390px 无横向溢出、footer 正常 ✓；全程无 console/page 错误 ✓
- 【发现并修复真实缺陷（runtime 记忆轮非原子副作用）】：验收中观察到 ENTERING 视图会话的记忆撤回报「无法执行记忆操作」但记忆实际已被撤回——根因：runMemoryOperationTurn 先 saveMemoryRecords 后才做视图迁移校验，拒绝路径留下持久化副作用（违反"状态未改变"纪律）。修复：视图迁移校验前置到任何记忆变异之前（纯检查零写入）。修复后 DB 证据：记忆变更与轮次提交原子同成（绿洲撤回 + v4 + MEMORY_WITHDRAW 账本）
- 停止路径野化验证：卡在 ENTERING 的会话（首轮 UNKNOWN 无提交）「好了」→ 干净结束层 ✓（Task 4 修复真实生效）

Stage Summary:
- 全链路验收通过：模拟四操作（SWITCH/RETURN/ADOPT/自动 CREATE）+ 创作全周期（首建/补丁/恢复/澄清/完成）+ 记忆（写入/撤回/更正计数/衰减呈现）+ 恢复重放 + 移动端 + 零错误
- S2a 切片（6-a/6-b/6-c/6-d/6-e）至此闭环：纯逻辑模块→契约层→runtime 编排→UI→浏览器验收，254 单测全绿
- 已知边界（只报告，后续切片裁决）：①matchSeed 关键词过松——「旗云」自由输入被匹配到云种子、topic 显示种子 hook 而非用户原话；②会话首条消息即记忆操作（ENTERING 视图）被拒——现无副作用但错误文案不解释原因；③CREATION_ASK 问题模板透出内部轴名（CORRECTION 意图等）——6-a 冻结模板措辞，属文案质量非正确性；④「撤销刚才的修改」（含"的"）不命中冻结 RESTORE 词表（6-c 已记录）
