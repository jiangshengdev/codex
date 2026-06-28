# P1 · codex-gui 前端事件流和 transcript 渲染热路径性能风险

日期:2026-06-23
范围:codex-gui/src 前端事件流、transcript 渲染、首屏样式加载
优先级:高(长会话、流式事件和用户输入并发时的可见性能风险)

## 问题

对 `codex-gui/src` 的只读性能检查发现,当前前端热路径有几类会随会话长度或事件频率放大的成本。

### 1. 每条 projection event 都触发顶层 React state 更新

`guiHostClient` 在每个 `thread/projection/event` 上递增 `eventCount` 并发出
`received event` 状态:

- `codex-gui/src/features/guiHost/guiHostClient.ts:343`

`GuiHostConnectionBridge` 把 `onStatus` 直接接到 `App` 顶层的 `setStatus`:

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:55`
- `codex-gui/src/App.tsx:7`

`status` 随后传入 `AppShell` 和固定底部 composer:

- `codex-gui/src/features/appShell/AppShell.tsx:18`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:24`

这意味着每条 projection event 除了 Redux 更新外,还会额外触发顶层 React state 更新。因为
`eventCount` 每次变化,React 无法按相等值跳过。用户正在输入时,后台持续收到
`itemStarted` / `itemCompleted` / `turnCompleted` 会带动 composer 反复重渲染。

### 2. 每个 transcript chunk selector 在每次 store 更新时重建 view

`CommittedTranscriptChunk` 为每个 chunk 订阅:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:59`

对应 selector 每次调用都会返回新的 `{ id, turnId, revision, entries }` 对象,并通过
`chunk.entryIds.flatMap(...)` 重建 `entries`:

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:259`

自定义 equality function 会再遍历 entries 比较 `id` 和 `revision`:

- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts:24`

`equalityFn` 可以阻止 React 子树重渲染,但不能阻止 selector 本身和 equality 比较在每次
store 更新时运行。长 transcript 中已经挂载多个 chunk 后,每条事件都可能产生
`O(已挂载 chunk 数 * 每 chunk entry 数)` 的同步工作。单个 chunk 有 100 entry 上限,但
长会话的 chunk 数仍会线性增长。

### 3. 无可见 transcript 变化的 `itemStarted` 仍会改写 transcriptState

`threadRuntimeEventBuffered` 进入 `transcriptState` 后先做 duplicate window 记录:

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:291`

之后 `itemStarted` 分支直接返回,不会产生 committed entry,也不会更新可见 transcript 内容。
但此时 `appliedEventIdsById` / `appliedEventOrder` 已经被修改,会让 transcript 相关订阅重新
运行 selector。大量 `itemStarted` 会放大上一节的 chunk selector 扫描成本。

### 4. 长 transcript 没有窗口化或渲染裁剪

当前 committed transcript surface 会渲染全部 turn、全部 chunk 和全部 entry:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:170`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:121`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:71`

`memo` 可以减少未变化子组件的 render,但不能减少历史 DOM 节点数量,也不能避免父组件每次
render 时重新遍历完整 turn 列表。长时间会话或大 snapshot attach 后,浏览器仍需要持有并
布局完整历史 DOM。

### 5. 首屏同步加载 HeroUI 全量 CSS

入口 CSS 无条件导入 HeroUI 全量样式:

- `codex-gui/src/index.css:2`
- `codex-gui/src/main.tsx:10`

这条路径是首屏同步加载,不受 JS tree-shaking 保护。当前页面只使用少量 HeroUI 组件,但打开
app 时仍会下载、解析并匹配整套样式。具体体积应以当前分支的 fresh build 为准。

## 为何是风险

这些问题都集中在用户最容易感知的路径:

- active thread 的 projection event 可能连续到达。
- 用户可能在 composer 输入时同时收到后台事件。
- transcript 历史会随长时间会话和大 snapshot attach 增长。
- 首屏 CSS 会阻塞初始渲染路径。

当前代码已经把 transcript state 设计成 chunk 化结构,方向比每次从完整 timeline
materialize 更好。但 selector 和顶层状态更新仍把部分成本重新带回每事件热路径。长会话中,
每条新增 event 的成本不应随已经渲染的完整 transcript 历史稳定增长。

## 建议方向

优先处理事件流热路径:

1. 把每事件变化的 `eventCount` / `lastEventType` 从 `App` 顶层渲染路径移走,或降低更新频率。
   composer 实际只需要连接是否可用、是否 error/closed、当前 `threadId` 和 active turn。
2. 拆分 `ComposerTurnControl` 对 `selectThreadRuntimeRecord` 的订阅,避免被 `eventBuffer`
   高频变化带动。需要的字段应由窄 selector 提供,例如 `threadId`、`activeTurnId`、
   `subscription`。
3. 让 transcript chunk selector 返回稳定引用或按 `chunk.revision` 缓存 view,避免每次 store
   更新都重建 entries 并执行 equality entries 扫描。
4. 对 `itemStarted` 这类无 committed transcript 变化的事件,评估是否需要进入
   `transcriptState` 的 applied-event window。若去重职责已由 `ProjectionIngressAdapter`
   覆盖,可以避免无可见变化的 transcript slice 写入。
5. 长 transcript 需要独立设计渲染裁剪或窗口化方案。该方案应保留 sticky-bottom 语义和
   snapshot/browser test 覆盖。
6. HeroUI 样式加载需要基于当前 build 体积先量化,再评估是否能按组件样式、按 route 或其他
   HeroUI 支持的方式缩小首屏 CSS。

## 当前状态

部分修复。

2026-06-27 更新:

- 建议方向 3 已修复:`selectTranscriptChunk` 现在通过 module-private `WeakMap` 按
  `TranscriptChunk` object identity 和 `chunk.revision` 缓存 `TranscriptChunkView`,避免
  unchanged chunk 在无关 Redux 更新后重复 materialize `entries`。
- 覆盖测试已加入 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`,
  包括 unchanged chunk 引用稳定、chunk 变更后失效、snapshot reattach 不复用旧 view。
- 验证通过:`pnpm run ci`。

2026-06-28 更新:

- 建议方向 1 已修复:`GuiHostStatus` 已收窄为 lifecycle-only 状态,`thread/projection/event`
  和 `thread/projection/closed` 不再通过 `onStatus` 推动 `App` 顶层 React state 更新。
  projection payload 继续通过 `onProjectionEvent` / `onProjectionClosed` 进入
  `ProjectionIngressAdapter` 和 Redux 路径。
- 建议方向 2 已修复:`ComposerTurnControl` 不再订阅完整 `selectThreadRuntimeRecord` 或
  `selectThreadRuntimeSubscription`,改为订阅 primitive selectors:
  `selectThreadRuntimeThreadId`、`selectThreadRuntimeActiveTurnId` 和
  `selectThreadRuntimeSubscriptionState`。composer command payload 继续使用当前
  `threadId` / `activeTurnId`。
- 覆盖测试已更新 `guiHostClient`, `threadRuntimeSlice`, `composerTurnControlModel`,
  `ComposerTurnControl.browser`, `App.browser` 和 `e2e/app.spec.ts`,旧
  `received event` / `eventCount` / `lastEventType` 测试契约已移除。
- 验证通过:`pnpm run type-check`; focused unit tests; focused browser tests;
  `pnpm run test:e2e -- e2e/app.spec.ts`; `pnpm run format:prettier`; `pnpm run lint`。
- 建议方向 4、5、6 仍未修复。

已检查并复核的主要文件:

- `codex-gui/src/App.tsx`
- `codex-gui/src/main.tsx`
- `codex-gui/src/index.css`
- `codex-gui/src/features/appShell/AppShell.tsx`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

本记录只落盘问题和候选方向,不包含实现变更。
