# Codex GUI 历史任务列表查看设计

设计状态：已确认（含补充设计）

确认日期：2026-08-16

补充设计确认原文：`确认补充设计`

设计日期：2026-08-16

补充设计日期：2026-08-16

设计分支：`dev`

设计时 HEAD：`b09b58a85220f5bcc99735f0fd208c9a8be44d4c`

## 唯一主目标

为 Codex GUI 增加当前工作目录下的历史任务浏览能力：用户通过全宽顶栏中的 Drawer 菜单进入
独立历史页面，以 Card 列表查看未归档任务，打开某条记录后只读查看其 transcript，并且只有在
用户显式点击“继续此任务”后，才在当前 GUI 中恢复并切换到该任务。

本设计不增加跨工作目录历史、归档管理、搜索、排序控制、任务编辑或多窗口能力。

## 当前实现与问题证据

### GUI 只有单任务入口

当前路由树只有 `/`，没有历史列表或历史详情路由：

- `codex-gui/src/router.tsx:5-17`

浏览器启动参数必须包含一个 `threadId`。GUI 消费 URL 中的 launch token 后，仍以该唯一
`threadId` 建立当前连接：

- `codex-gui/src/features/browserLaunch/browserLaunchParams.ts:3-44`

握手在 `initialize` 后直接调用 `thread/projection/attach`。当前流程没有先列出、读取或选择
thread 的阶段：

- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts:99-123`

### AppShell 没有全局导航

当前 `AppShell` 只包含错误 notice、单个 `CommittedTranscriptSurface` 和
`ComposerTurnControl`。页面没有顶栏、Drawer、历史入口或多页面标题：

- `codex-gui/src/features/appShell/AppShell.tsx:44-91`

`CommittedTranscriptSurface` 中现有的 Pagination 只按 context compaction 切换同一 thread
内部的 transcript context page，不是跨任务历史列表：

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:831-945`

因此，本设计不能把现有 context pagination 改名或复用为任务历史；两者分别承担 thread 内
上下文浏览和跨 thread 导航。

### 当前状态与连接所有权只有一个 live thread

`threadIdentity` 只保存 launch thread 与 attached thread，并以两者一致作为继续消费 projection
的前提：

- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts:4-40`

`threadRuntime` 只有一个 `current` record，attach 新 snapshot 时整体替换该 record：

- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:45-68`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:112-130`

`GuiHostConnectionBridge` 还把 projection coordinator、当前 thread、Composer queue coordinator
和 commands 生命周期绑定在同一连接作用域中：

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:27-92`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:107-116`

因此，只读查看历史任务不得把 `thread/read` 结果写进现有 live `threadRuntime` 或 transcript
state。否则查看动作会替换当前任务、接收不属于历史详情的 live projection 事件，或让 Composer
向错误的 thread 发送消息。

`ComposerInputQueueCoordinator` 还是 connection/thread-scoped 的本地 owner。其公开 snapshot
目前只包含普通排队数量、恢复批次数量和恢复中状态；`dispose()` 会清空恢复与 deferred effects，
并通过 generation 使尚未 settle 的 start request 结果失效：

- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts:15-32`
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts:115-122`
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts:143-167`

因此，旧任务仍有未安全结清的本地消息时，切换后再 cleanup 旧 queue 会造成未发送内容或发送结果
不确定状态静默丢失。切换前必须先检查 queue 是否可安全释放，不能把 `dispose()` 当成无条件清理。

### app-server 已有权威历史协议，GUI 尚未接入

app-server v2 已提供：

- `thread/list`：按 cursor 分页列出持久化 thread；
- `thread/read`：不恢复 thread 即可读取元数据，并可通过 `includeTurns` 返回 turns；
- `thread/resume`：按 `threadId` 恢复或重新加入 thread；
- `thread/projection/detach` 与 `thread/projection/attach`：切换 live projection subscription。

协议注册与语义证据：

- `codex-rs/app-server-protocol/src/protocol/common.rs:596-600`
- `codex-rs/app-server-protocol/src/protocol/common.rs:628-632`
- `codex-rs/app-server-protocol/src/protocol/common.rs:744-748`
- `codex-rs/app-server-protocol/src/protocol/common.rs:788-791`
- `codex-rs/app-server/README.md:167-173`
- `codex-rs/app-server/README.md:192-196`
- `codex-rs/app-server/README.md:355-361`
- `codex-rs/app-server/README.md:541-570`

生成的 TypeScript `Thread` 已直接提供列表 Card 所需的 `name`、`preview`、时间、`status`、
`cwd`、Git 与来源等字段；`ThreadListResponse` 提供 `nextCursor` 与 `backwardsCursor`。列表响应中
`turns` 必须为空，完整 transcript 只能另行读取：

- `codex-rs/app-server-protocol/schema/typescript/v2/Thread.ts:12-84`
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadListResponse.ts:6-18`
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadReadParams.ts:5-9`

GUI 的 contract 类型已经从生成协议导入，但 runtime request allowlist 和 command gateway 目前
只允许 initialize、projection attach 与 turn 控制命令，没有纳入 list、read、resume 或 detach：

- `codex-gui/src/features/guiHost/appServerProtocol.ts:1-29`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts:29-50`

这说明缺口位于 GUI 请求 surface、页面状态和 thread 切换生命周期，不需要新增 app-server v2
字段，也不得在 frontend 手写一份 `Thread` DTO。

## 已确认的产品与界面语义

### 历史范围

1. “历史记录”指跨任务的 thread/task 列表，不是当前 thread 内的消息目录或 context page。
2. 列表只查询当前 GUI thread 的 `cwd`，不混入其他工作目录。
3. 默认且仅查询未归档任务；本次不提供归档筛选或归档任务页面。
4. 列表按最近活动时间从新到旧展示。排序使用协议现有 `recency_at`，没有 `recencyAt` 时 Card
   时间显示回退到 `updatedAt`。
5. 本次不提供搜索、模型/来源过滤、section、手动排序或跨项目切换。

### 导航与全宽顶栏

1. AppShell 增加横跨整个视口宽度的固定顶栏，而不是只在内容列左上角放置浮动按钮。
2. 顶栏在当前任务页、历史列表页和历史详情页共用。
3. 顶栏展示 Drawer 菜单按钮和当前页面标题，不展示任务运行状态。
4. 当前任务页标题使用当前 thread 的用户可见 `name`；为空时使用 `preview`，两者都为空时使用
   本地化默认标题。
5. 历史列表页标题为“历史记录”；历史详情页标题使用所查看 thread 的同一标题回退规则。
6. 菜单使用 HeroUI v3 `Drawer`，从左侧打开，支持 backdrop dismiss、Escape 关闭、focus trap 与
   `Drawer.CloseTrigger`。
7. Drawer 首期只包含“当前任务”和“历史记录”两个导航项。不得把示例中的 Search、
   Notifications、Messages、Profile 或 Settings 当作本次交付物。
8. 菜单 trigger 与导航项使用 HeroUI `Button`；不得用手写 `<button>` 模拟 HeroUI 控件。
9. 项目没有 `@gravity-ui/icons`，已有 `lucide-react`。本次使用现有 Lucide 菜单与历史图标，
   不增加新的图标依赖。

### 历史列表 Card

1. 历史列表是独立页面，不使用常驻侧栏、popover 或 Composer 内菜单。
2. 每条任务使用 HeroUI v3 `Card variant="default"`，通过 `Card.Header`、`Card.Title`、
   `Card.Description`、`Card.Content` 和 `Card.Footer` 表达层级。
3. Card 展示：
   - 标题：优先 `thread.name`，为空时使用 `thread.preview`，两者均为空时使用本地化默认标题；
   - 摘要：只有 `name` 非空且 `preview` 非空时展示，避免标题与摘要重复；
   - 最近活动时间：`recencyAt ?? updatedAt`；
   - 状态：映射 `notLoaded`、`idle`、`active`、`systemError`。
4. Card 不展示 `cwd`，因为列表已经限定为当前工作目录；也不展示模型、Git 分支、来源、CLI
   版本、rollout path、session/subagent identity 或 section。
5. HeroUI Card 没有 `onPress` 或 `href`。本设计保留真实 `Card` compound component，并在
   `Card.Footer` 放置明确的“查看”Button；不得通过点击 handler 把非交互 Card 伪装成链接。
6. 状态是辅助识别信息，不使用 danger 色把 `systemError` 以外的普通状态升级为警告。具体
   `Chip`/`Tag` 选择和语义 variant 在实施计划中依据本地 HeroUI v3 文档确定，但不得手写
   强色状态徽章。

### Cursor 加载

1. 首次进入历史页，以固定的有界 `limit` 请求第一页；具体数值是实现细节，但必须有硬上限。
2. 请求参数至少包含当前 `cwd`、`archived: false`、`sortKey: "recency_at"` 和降序。
3. `thread/list` 不返回总条数，因此不显示虚构的页码或“共 N 页”。
4. `nextCursor` 非空时，在 Card 列表底部显示“加载更多”Button。
5. 点击后追加下一批结果，保留已经加载的 Card 和滚动上下文；请求进行中 Button 使用 pending
   状态并禁止重复请求。
6. `nextCursor` 为空时移除“加载更多”，不显示无效的 disabled 控件。
7. 相邻页因服务端状态变化出现重复 thread 时按 `thread.id` 去重，同时保持首次出现顺序；不得
   用标题或时间作为 identity。
8. 从历史详情返回列表时销毁旧列表浏览状态，重新请求第一页并回到页面顶部；不恢复此前已加载
   的 Card、cursor 或滚动位置，也不设计跨刷新持久缓存。

### 只读历史详情

1. 点击 Card Footer 的“查看”后进入该 thread 的独立历史详情路由。
2. 详情调用 `thread/read({ threadId, includeTurns: true })`；读取动作不得调用 `thread/resume`，
   不得 attach projection，也不得改变 thread runtime status。
3. read response 由独立的 read-only history detail owner 持有。它只接受生成协议中的 `Thread`
   并建立只读 transcript view，不写入 live `threadIdentity`、`threadRuntime`、现有 transcript
   state 或 Composer queue owner。
4. 只读详情允许复用现有 transcript 的展示规则和 chunk-level renderer，但复用必须发生在一个
   小 interface 后面。调用方只提供生成的 `Thread.turns` 和读取状态，不得复制 protocol DTO、
   展平所有 entries，或让历史页面了解 projection replay、live delta、queue 等实现细节。
5. 只读详情保留当前 transcript 的 context-compaction 分页语义；只挂载当前 context page，不能
   为“只读”而一次渲染所有隐藏页面。
6. 详情页不显示 Composer，也不允许 start、steer 或 interrupt turn。
7. 详情页顶栏只负责 Drawer 导航和返回历史列表；“继续此任务”不放在顶栏。
8. 页面底部固定一个明确的主操作“继续此任务”。其视觉位置接近现有 Composer 区域，但必须
   与输入框形态区分，不能让只读详情看起来可直接输入。

### 显式恢复与当前 GUI 切换

1. 只有用户点击“继续此任务”才启动继续流程；目标不是当前 live thread 时才调用
   `thread/resume({ threadId })`。
2. 点击后按钮进入 pending 状态；重复点击不产生并发 resume。
3. 若目标 `threadId` 等于当前 live thread identity，不调用 resume，不重复 attach，也不重建
   transcript、projection coordinator 或 Composer queue；直接返回当前任务页。app-server 同一连接对
   同一 thread 重复 attach 会替换旧 subscription，因此该分支不能进入一般 candidate 流程。
4. 若旧任务仍有普通排队消息、待恢复消息、正在恢复的消息，或尚未由 transport/runtime 事实
   解决的 start request，则旧 queue 不可安全释放。此时必须在任何 resume、attach 或 detach 前
   阻止切换，保留历史详情与旧 live owner，显示明确说明和“返回当前任务”操作；不得静默丢弃、
   自动重试、后台保留第二个 queue owner，或把 delivery unknown 当作未发送。
5. queue 安全检查必须来自 queue owner 的权威状态，而不是页面根据 `queuedCount` 猜测。普通队列、
   recovery、recovering 和未解决 start claim 全部安全结清后，用户可再次点击“继续此任务”；仅有
   server-side active turn 而没有上述本地未完成状态，不因本补充设计额外阻止切换。
6. resume 成功不等于 GUI 已完成切换。不同目标 thread 的切换必须使用
   prepare / commit / cleanup 三阶段 owner replacement：
   - prepare：保留旧 live owner 与 Composer queue 可用；resume 目标 thread，attach 新 projection，
     并在隔离的 candidate owner 中准备 snapshot、transcript 与 active turn 状态；
   - commit：只有 candidate 已完整可用时，才原子切换 current identity/runtime/transcript，并为
     新 thread 创建 Composer queue owner；旧 owner 从此不再接受页面操作；
   - cleanup：commit 后 dispose 旧 queue/coordinator，并 detach 或失效旧 projection subscription。
7. `thread/projection/detach` 不是传输 drain barrier。旧 subscription 已在 outbound path 的事件
   仍可能到达，因此切换必须按 thread/subscription identity 拒绝陈旧事件，不能只依赖 detach
   response 的先后顺序。
8. prepare 期间允许旧 subscription 与 candidate subscription 短暂并存，但只有旧 owner 对页面和
   Composer 生效，candidate 事件只进入隔离缓冲。commit 后只有新 owner 生效，旧 subscription
   即使仍有在途事件也必须被 identity gate 拒绝。最终状态只能有一个 live thread、一个有效
   projection owner 和一个 Composer queue owner；不得保留旧新 thread 双写、双读、fallback 或
   长期兼容 adapter。
9. resume 或 attach 任一步失败时：
   - 显示完整失败反馈；
   - 不把只读详情伪装成已恢复；
   - 不为 candidate 启用 Composer；
   - 丢弃 candidate 并继续保留旧当前任务及其 live owner；
   - commit 必须是内存中的原子 owner replacement，不设计“旧 owner 已销毁但新 owner 尚不可用”
     的不可回滚中间状态。
10. 成功 attach 新 thread 后，路由回到当前任务页，顶栏标题、transcript、状态和 Composer 全部
   来自新 owner；浏览器 URL 中的 thread query 同步为新 identity，但 launch token 不重新暴露
   到 URL。

## 页面结构

```text
App root
├─ Global top bar (full viewport width, fixed)
│  ├─ Menu Button
│  ├─ current page title
│  └─ HeroUI Drawer
│     ├─ Current task
│     └─ History
├─ /                     live current task
│  ├─ CommittedTranscriptSurface
│  └─ ComposerTurnControl
├─ /history              current-cwd history list
│  ├─ Card[]
│  │  ├─ title / preview
│  │  ├─ recency / status
│  │  └─ View Button
│  └─ Load more Button
└─ /history/$threadId    read-only history detail
   ├─ read-only transcript surface
   └─ fixed bottom Continue this task Button
```

路由 segment 的具体命名可按 TanStack Router 现有惯例调整，但必须保持“列表”和“详情”是独立
可返回的导航状态，不能把详情塞进临时 modal 后丢失浏览器前进/后退语义。

## 模块与状态所有权

### GUI host history interface

GUI host transport 继续是 app-server request 的唯一 adapter。历史功能应在同一 transport session
上暴露一个小 interface，隐藏 request descriptor、runtime validation、delivery classification 与
gateway ready state：

```ts
type GuiHistoryCommands = Readonly<{
  listThreads: (params: RequestParams<"thread/list">) => Promise<RequestResponse<"thread/list">>;
  readThread: (params: RequestParams<"thread/read">) => Promise<RequestResponse<"thread/read">>;
  resumeThread: (
    params: RequestParams<"thread/resume">,
  ) => Promise<RequestResponse<"thread/resume">>;
}>;
```

这只是 interface 形状示意，不要求使用该类型名。实现必须从 generated
`ClientRequestDefinition` 派生 params/response，并把相应 method 加入现有生成 validator 流程；
不得手写响应 schema、DTO、字段列表或 `unknown` parser。

projection detach/attach 与 owner replacement 不应暴露给页面逐步编排。应由 connection/thread
切换 module 提供一个深 interface，例如“继续指定 thread”，在实现内部完成 resume、旧 owner
失效、subscription 更换、snapshot apply 和 commands/queue 重建。删除该 module 时复杂度会重新
散落到页面、bridge、coordinator 与 queue，因而这个 seam 具有实际深度。

### 历史列表 owner

列表数据属于路由页面的短期 server response cache，不参与 live projection，也没有多个独立
消费者。本设计不为它新增 Redux 全局 slice，也不在 Redux 中镜像 `Thread[]`、Card title、摘要或
格式化时间。

历史列表 owner 只保存最小状态：

- 按 identity 去重后的 generated `Thread[]`；
- `nextCursor`；
- 初次加载 / 追加加载 / 失败状态；
- 防止陈旧请求覆盖当前页面的 request generation 或取消 identity。

标题回退、摘要是否显示、格式化时间、状态文案均从原始 Thread 派生。不得同时存储 raw Thread
和第二份 Card view model 后再手工同步。

### 只读详情 owner

只读详情与 live thread 是两个同时存在但职责不同的 owner：

```text
live owner
  generated projection snapshot + live events
  -> threadRuntime/transcript state
  -> current task + Composer

read-only detail owner
  generated thread/read response
  -> isolated bounded transcript view
  -> history detail, no Composer, no subscription
```

两者可以复用纯 projection/renderer implementation，但不能共享可变实例、current thread identity
或 event ingress。read-only owner 在离开详情路由时销毁；live owner 在浏览历史期间继续保持其
唯一 subscription 和 queue 状态，直到用户显式继续另一任务。

## 权威 contract 与生成链路

权威来源始终是 app-server v2 generated contract：

```text
Rust app-server protocol v2
  -> generated ClientRequestDefinition / v2 Thread types
  -> codex-gui selected request method list
  -> generated runtime request descriptors and validators
  -> typed GUI host history interface
  -> history owners and HeroUI pages
```

允许使用 `Extract`、indexed access、`Pick` 等机械 TypeScript derivation。禁止：

- 在 GUI 手写 `HistoryThread` 来镜像 `Thread` 字段；
- 把响应擦除为 `unknown` 或 broad record 后自行重建类型；
- 手写 thread status union、runtime schema 或 validator；
- 直接编辑 generated TypeScript 或 generated validator；
- 捕获协议不兼容后静默忽略字段或回退到假数据。

增加 selected request methods 后，既有生成流程必须使受影响的上游 contract 变化在生成、
type-check 或 build 时失败，而不是退化为运行时兼容分支。

## HeroUI、视觉层级与响应式

使用本地 HeroUI React v3 文档所示的 compound API：

- 导航：`Drawer`、`Drawer.Backdrop`、`Drawer.Content`、`Drawer.Dialog`、
  `Drawer.CloseTrigger`、`Drawer.Header`、`Drawer.Heading`、`Drawer.Body`；
- 控件：HeroUI `Button`，使用 `onPress` 和 `isPending`；
- 历史条目：`Card` 及其 Header、Title、Description、Content、Footer；
- 页面表面：优先 `Surface` 和 background/surface/separator/field 语义 token；
- 反馈：请求失败使用 HeroUI `Alert`，空状态使用 Card 或低强调 Surface。

语义 variant：

- 菜单 trigger 是普通全局导航操作，使用 `secondary`；
- Card 是常规列表内容，使用 `default`；
- “查看”是替代导航操作，不与“继续此任务”争夺主操作层级；
- “继续此任务”是详情页唯一 primary action；
- 返回、关闭和加载更多使用 secondary/tertiary 层级；
- 请求错误使用 danger Alert，但不得把普通 `notLoaded` 状态渲染为 danger。

顶栏横跨视口，内容仍可与现有 `max-w-3xl` 主内容列建立对齐。具体 height、padding、gap、圆角、
阴影和断点属于实现细节，不写成产品契约，也不以测试固化。窄屏时 Drawer 仍从左侧覆盖打开，Card
保持单列；本次不新增桌面多列 grid。

当前 `AppShellTopNotices` 使用 `sticky top-0`。加入 fixed 顶栏后，notice 必须位于顶栏下方且不被
遮挡；顶栏、notice、内容和底部 fixed action 的占位必须由 shell 统一管理，禁止各页面用硬编码
magic offset 相互补偿。

## i18n、时间与可访问性

所有新增可见文案使用 Lingui macro：

- JSX 文本使用 `Trans`；
- `aria-label`、页面 title fallback、状态映射等非 JSX 字符串使用 `useLingui`；
- 模块级状态文案表若存在，使用 `msg` 延迟消息，不能在模块级调用 `t`。

时间使用 `Intl.DateTimeFormat` 或 `Intl.RelativeTimeFormat` 并以当前 Lingui locale 创建 formatter，
不得硬编码中文日期格式或拼接英文单位。设计不要求固定“几分钟前”还是绝对日期；实现应让当日
记录易扫读，同时保留可访问的完整时间信息。

可访问性约束：

- 顶栏是全局 banner，Drawer 内使用 `<nav>` 并有本地化 accessible name；
- icon-only Button 必须有可翻译 `aria-label`；若同时显示“菜单”文本，则图标不重复播报；
- Drawer 依赖 HeroUI/React Aria 的 dialog、focus trap、Escape 和 focus return 语义；
- Card 保持 article/group 语义，真正交互由 Footer Button 承担；
- 加载状态不能只靠 spinner，Button pending 与页面 status 应可被辅助技术感知；
- 错误 Alert 使用明确 role；失败原文作为文本显示，不解析为 Markdown；
- 历史详情明确标识为只读，且 DOM 中不存在可编辑 Composer；
- fixed bottom action 不得遮挡 transcript 末尾，页面必须提供对应布局占位。

## 加载、空状态与错误状态

### 历史列表

- 初次加载：显示有界 skeleton/placeholder，不保留上一 cwd 的 Card；
- 空列表：显示“当前工作目录暂无历史任务”，不建议用户切换到未实现的跨项目视图；
- 初次失败：显示完整错误 Alert 和显式重试；
- 加载更多失败：保留已有 Card，在列表底部显示错误与重试，不清空列表、不前移 cursor；
- 重试成功：追加并按 thread ID 去重。

### 历史详情

- 读取中：标题可先使用列表记录，正文显示有界 loading 状态；
- 读取成功但无 turns：显示明确空状态；
- 读取失败：保留返回历史列表导航，显示完整错误和重试，不调用 resume；
- thread 不再存在：按 read 的权威错误显示，不用列表旧数据伪造 transcript。

### 恢复

- pending：固定底部 Button `isPending`，禁止重复提交；
- 旧 queue 不可安全释放：不进入 pending/resume，显示明确提示和“返回当前任务”操作；提示与
  “继续此任务”控件建立可访问关联，不能只用 disabled 状态表达原因；
- resume 失败：保留只读详情与 Button 重试能力，完整错误与操作标签分离；
- projection attach 失败：不得展示已可输入状态；应进入明确连接错误状态；
- 成功：只有新 snapshot 已成为唯一 live owner 后才显示 Composer。

所有错误反馈必须保留 app-server/transport 提供的完整原始 error message，不截断、脱敏、重写或
用笼统文案替换。界面上的失败标题与错误正文分开。

## 性能边界

1. `thread/list` 每次请求有硬 `limit`，列表按 cursor 追加；不得一次读取全部 rollout。
2. Card view 只派生当前已加载 threads，不读取 turns，不预取所有详情。
3. 历史详情不得把所有 turns/items 展平为一个长期全局数组。
4. 复用 transcript renderer 时继续保留 turn fragment、middle chunk、selector cache 与 context
   page 边界；只挂载当前可见 context page。
5. 浏览历史列表或详情不得使 live transcript 因路由 state 改变而重新投影；live owner 继续处理
   自己的 bounded event buffer。
6. 列表 Card 使用稳定 `thread.id` key；追加新页时既有 Card 保持 identity。
7. 固定顶栏、Drawer 和底部 action 不得把隐藏 transcript 或 Drawer 内容长期重复挂载。

`thread/read(includeTurns: true)` 仍可能返回较长历史。本次遵循已确认的 read 语义，并依靠现有
transcript chunk/context-page 渲染边界限制 DOM 成本；这些边界不限制响应体大小、`Turn[]` 内存或
snapshot 重建遍历成本。

稳定版 `thread/resume` 默认再次返回完整 `thread.turns`，随后 `thread/projection/attach` 又返回
完整 snapshot。因此用户从已读取的历史详情继续任务时，整个流程会经历 read、resume、attach 三次
历史传输，其中 resume 与 attach 是切换阶段连续发生的两次完整重建输入。本设计明确不启用
experimental capability，也不使用当前稳定生成类型中不存在的 `excludeTurns`。实施必须测量长历史
下这三段响应大小、解析时间、candidate 重建时间和切换延迟；若成本不可接受，应停止并单独设计
`thread/turns/list` 或 experimental resume 能力，不能在本实现中暗加截断、丢弃历史或静默降级。

## 保持不变

- 当前 task 的 projection event/delta、snapshot replay、duplicate classification 和 reconnect 语义；
- 当前 task transcript 的 item 内容、顺序、context pagination 与 Markdown 渲染；
- Composer turn start/steer/interrupt 和输入队列语义；
- app-server v2 `Thread`、`Turn`、list/read/resume/projection payload；
- TUI、CLI、Codex desktop 侧栏和其他客户端的历史显示；
- 当前 cwd、permission profile、model 与 sandbox 的运行时来源。

## 非目标

- 不显示所有工作目录或提供工作目录切换；
- 不显示归档任务，不提供 archive/unarchive/delete；
- 不提供搜索、排序设置、section、收藏、置顶或批量操作；
- 不增加右侧详情面板、常驻历史侧栏、popover 或多列 dashboard；
- 不增加新建任务入口；
- 不打开新窗口，不创建新的 Codex desktop task；
- 不允许在只读详情直接输入、steer 或 interrupt；
- 不在 Card 展示模型、Git、来源、cwd 或完整 session metadata；
- 不安装 `@gravity-ui/icons` 或其他新依赖；
- 不新增 app-server 协议字段，不手写 runtime contract；
- 不创建实施计划，不修改代码，不 stage 或 commit。

## 预计影响边界

后续实施计划预计涉及以下模块范围，但本文不规定任务拆分或提交顺序：

- router 与 App/AppShell 页面组合；
- 全宽顶栏、HeroUI Drawer、历史列表 Card、历史详情和固定底部操作；
- GUI host selected request methods、生成 runtime descriptors/validators 和 typed command interface；
- history list/read owner 与 read-only transcript projection/renderer seam；
- connection/thread 切换 owner，包括 resume、projection detach/attach、identity、queue lifecycle；
- Lingui catalog 提取与编译产物；
- 单元、Browser Mode 与响应式界面验证。

若实施证据表明必须修改 Rust/app-server protocol、跨工作目录语义、归档行为、Composer queue 产品
语义或计划外共享 fixture surface，必须停止并回到设计确认，不得自行扩大。

## 验证设计

### 协议与状态验证

- request selection/generation 覆盖 list、read、resume 与 projection detach/attach 的合法响应和
  malformed response 拒绝；
- list owner 覆盖当前 cwd/未归档/recency 排序参数、cursor 追加、去重、pending 与失败重试；
- read-only owner 覆盖 turns 重建、空历史、context pages，以及不写入 live Redux state；
- thread switch owner 覆盖 resume 成功、resume 失败、旧 subscription 陈旧事件、新 attach 失败、
  同 identity 快路径、旧 queue 不安全时零切换请求、queue 安全后可重试、queue owner disposal 与
  最终唯一 owner。

### Browser Mode 验证

- 当前任务页显示全宽顶栏、菜单按钮和任务标题；
- 菜单打开左侧 Drawer，focus/close/navigation 正常；
- 历史列表显示 Card 的标题、摘要、时间、状态和“查看”；
- “加载更多”追加 Card、保留既有内容，失败后可重试；
- read-only 详情显示 transcript 且没有 Composer；
- 固定底部“继续此任务”不遮挡末尾内容；
- 恢复成功后回到 live 当前任务，Composer 只绑定新 thread；
- 初次加载、空列表、列表失败、读取失败和恢复失败均有明确反馈；
- 窄屏下顶栏、Drawer、Card 和固定底部操作可用。

用户可见 UI 变化必须有对应的 Browser Mode 或 screenshot coverage。测试应断言可访问名称、行为、
内容层级和关键 DOM 顺序；不得固化 padding、gap、颜色、阴影、圆角数值或 HeroUI 私有 DOM。

### 常规验证

后续实施应使用 `codex-gui` 的 fnm/pnpm 工具链运行：

- 相关单元测试；
- 相关 Browser Mode 测试；
- Lingui extract/compile 对应项目命令；
- format、lint、type-check；
- 必要的可见 Chrome 响应式人工检查。

具体命令、测试分区和提交拆分属于实施计划，不在本文展开。

## 验收标准

完成状态必须同时满足：

- 全宽固定顶栏在当前任务、历史列表和历史详情中一致存在；
- Drawer 菜单可以在当前任务与历史记录之间导航；
- 历史页只列当前 cwd、未归档任务，并按 cursor 有界加载；
- 每条任务以 HeroUI v3 Card 展示已确认四类信息；
- 查看历史不会 resume、attach 或替换当前 live owner；
- 历史详情完整只读展示，不存在 Composer；
- 只有点击固定底部“继续此任务”才恢复；
- 旧任务存在未安全结清的本地消息时，切换在任何 resume/attach/detach 前被阻止，且消息状态不丢失；
- 恢复后只有新 thread 拥有 live projection、transcript 和 Composer queue；
- 所有新增 contract 继续机械派生自 app-server v2 generated source；
- loading、empty 和各阶段 failure 均明确且可恢复；
- i18n、键盘、焦点、屏幕阅读器和窄屏交互满足上述约束；
- 相关格式、lint、type-check、单元与 Browser Mode 验证通过。

## 设计否决条件

出现以下任一情况时，实施必须停止并回到设计：

- 需要新增或修改 app-server v2 API；
- 需要在 GUI 复制 `Thread`/`Turn` contract 或手写 validator；
- 只读查看必须写入 live thread/transcript/queue state 才能工作；
- thread 切换无法保证唯一 live owner 或必须长期保留旧新双路径；
- thread 切换只能通过静默清空旧 queue、猜测 `queuedCount` 或忽略未解决 start request 才能进行；
- 需要跨 cwd、归档、搜索、任务管理、多窗口或新建任务能力；
- 需要新增 `@gravity-ui/icons` 或其他依赖；
- 需要一次渲染全部隐藏 transcript page 或破坏 chunk selector 稳定性；
- 需要以截断、静默兜底、忽略错误或放宽断言掩盖协议/性能/状态问题。

## 后续门禁

本文已落盘基础设计与补充设计，不授权创建实施计划、修改代码、运行生成/格式化、stage 或 commit。

用户确认补充设计后，下一轮才能落盘实施计划；实施计划再次获得明确确认后，才允许开始代码修改、
验证和按计划逐任务本地提交。
