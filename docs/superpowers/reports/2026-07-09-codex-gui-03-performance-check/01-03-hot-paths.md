# Codex GUI 03 hot path audit

## 审计口径

每个切片按 `触发频率 * 单次同步工作 * 规模变量` 判断时间复杂度风险，并用当前代码证据校准已有 issue 状态。

Allowed status values:

- `仍成立`
- `已修复`
- `部分过期`
- `非 03 归因`
- `证据不足`

## 08 projection delta Redux action frequency

## 结论

`08-projection-delta-redux-action-frequency` 的原始复杂度假设已部分过期。当前 03 实现中，projection delta 不再由 bridge 以每个 delta 一次 Redux action 投递的形式送入 store；`GuiHostConnectionBridge` 会先入队并用 `requestAnimationFrame` 批量 flush。因此 action 投递和 store subscription 频率不再严格绑定到 delta 频率。

`transcriptState` 的 batch reducer 仍会在一次 action 内逐条 delta 调用 `applyAcceptedProjectionDelta`，每个 `agentMessage` delta 仍会写入 live item、递增 revision 和 `liveScrollPulse`。

## 审计字段

- 关联 issue: `08-projection-delta-redux-action-frequency`，原假设是每个 transient `agentMessage` delta 都触发一次 Redux action、一次 Immer reducer 写入和一次 store subscription。
- 触发源: `onProjectionDelta` 接收 projection delta，经 projection outcome 分支入队，随后由 `flushPendingDeltas` 投递 `threadRuntimeDeltasAccepted({ notifications })`。
- 触发频率: delta 接收频率仍决定入队数量；Redux action 投递 / store subscription 频率变为非空 batch flush 频率，通常最多每 animation frame 一次，并在 attach/event/reconnect 前同步 flush。
- 单次同步工作: 单次 batch action 在 `threadRuntimeSlice` 不修改 runtime state；在 `transcriptStateSlice` 中遍历 batch 内所有 notifications，对匹配线程的 `agentMessage` delta 查找 live item，拼接 `transientText`，设置 `status`，递增 item `revision` 和 `liveScrollPulse`。
- 规模变量: `D` = projection delta 数量；`F` = 非空 batch flush / Redux action 投递次数；`B_i` = 第 `i` 次 batch 内 delta 数量，且 `sum(B_i)=D`。
- 累计时间复杂度: action 投递和 store subscription 为 `O(F)`，不再固定为 `O(D)`；reducer 内逐 delta 应用仍为 `O(D)` 次同步处理，外加每次文本拼接的字符串长度成本。
- 03 归因: 原 issue 的“每 delta 一次 action 投递 / subscription”不应作为当前 03 finding；当前 03 相关新增同步写入主要是可见 live assistant delta 推进 `liveScrollPulse`，该写入发生在 batch reducer 的逐 delta 循环内。
- 当前状态: 部分过期

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md:9`: 原 issue 假设每个 transient delta 触发 Redux action。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md:29`: 原 issue 把 Redux action 投递、Immer reducer 写入和 store subscription 绑定到 delta 频率。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:47`: bridge 维护 `pendingDeltaNotifications`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:61`: `flushPendingDeltas` 将累计 notifications 作为一个 `threadRuntimeDeltasAccepted` action 投递。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:73`: `schedulePendingDeltaFlush` 使用 `requestAnimationFrame`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:84`: `enqueueProjectionDelta` 只入队并安排 flush。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:109`: `deltaAccepted` 走 `enqueueProjectionDelta`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:163`: `onProjectionDelta` 进入 projection outcome 分发。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:127`: 单 delta action 在 runtime slice 中是跨 slice 信号。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:131`: batch delta action 在 runtime slice 中也是跨 slice 信号。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:257`: 每个 `agentMessage` delta 写 live item、revision 和 `liveScrollPulse`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:274`: `applyAcceptedProjectionDelta` 按 notification 类型应用 delta。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:571`: batch action 内逐 notification 调用 `applyAcceptedProjectionDelta`。

## 排除项

- 未审计限定范围外的 render 组件、selector 使用方、store 配置或 `ProjectionIngressAdapter` 内部实现。
- 未将原始 pre-03 的每 delta action 投递 / subscription 问题报告为当前 03 finding。
- 未运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 未提出任何代码变更方向。

## 报告建议

该 issue 记录为 `部分过期`：原报告中的“每个 delta 一次 Redux action 投递 / store subscription”复杂度假设应更新为“当前 bridge 已按 frame/boundary flush 批量投递”；同时保留“batch reducer 内仍逐 delta 做 `transcriptState` 同步写入”的事实，但不把原始 action-frequency 问题归因为 03。

## 09 projection delta transientText concat

## 结论

`09-projection-delta-transient-text-concat` 在当前 03 实现中仍成立。当前代码仍把 live `agentMessage` delta 通过 `item.transientText += delta` 累积为可渲染字符串；该字符串随后直接传入 `LiveMarkdownText` / `Streamdown`。

这里的 finding 仅覆盖 text accumulation cost。Markdown rendering cost 是独立消费成本，本次只确认消费边界，不扩展成未证实 finding。

## 审计字段

- 关联 issue: `09-projection-delta-transient-text-concat`；复杂度假设是 JS 字符串不可变，`transientText += delta` 会随 accumulated live text length 增长反复复制已有文本，整体可能接近 `O(n^2)`。
- 触发源: `threadRuntimeDeltaAccepted` / `threadRuntimeDeltasAccepted` 接收 `notification.delta.type === "agentMessage"` 后调用 live item delta append。
- 触发频率: 每个 accepted `agentMessage` delta 一次；批量 action 中每个 notification 各调用一次。
- 单次同步工作: 状态层先按 live item key/index 找到 item，然后执行 `item.transientText += delta`、更新 `status`、`revision`、`liveScrollPulse`。其中字符串追加是 text accumulation cost；消费端把完整 `transientText` 作为 `source` 传给 Markdown 渲染，但 Markdown rendering cost 与该累积成本分离。
- 规模变量: 单次追加成本主要随当前 accumulated live text length 增长，并叠加当前 delta length；累计成本还取决于 delta count。若最终文本长度为 `N`、delta 数为 `D`，累积复制成本是前缀长度求和；小 delta 高频场景下可接近 `O(N^2)`。
- 累计时间复杂度: text accumulation 为 `O(sum(prefix_lengths + delta_lengths))`；常见小 delta streaming 下接近 `O(N^2)`。Markdown rendering cost 本次只确认消费边界，不给复杂度 finding。
- 03 归因: 当前 03 live assistant message 路径仍使用 `transientText` 字符串承载 streaming delta，并直接进入 live Markdown 展示；因此该问题在当前 03 实现中仍存在。
- 当前状态: 仍成立

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md:9`: issue 指向直接追加 `transientText` 的实现形态。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md:17`: issue 说明 JS 字符串不可变导致长回答小 delta 高频追加时可能接近 `O(n^2)`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:74`: `TranscriptRenderableLiveItem.transientText` 当前仍是 `string`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:228`: live item 创建时 `transientText` 初始化为空字符串。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:257`: `appendAgentMessageDeltaToLiveItem` 仍执行 `item.transientText += delta`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:282`: `agentMessage` delta 分支把 `delta` 交给上述 append 函数。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:571`: 单个和批量 accepted delta 都进入 `applyAcceptedProjectionDelta`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:189`: live assistant entry 将 `item.transientText` 传给 `LiveMarkdownText source`。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:11`: `source` 作为 `Streamdown` children 渲染。

## 排除项

- 未审计 Markdown renderer 内部复杂度；只确认完整 accumulated live text 被传入渲染边界。
- 未把 `Streamdown` 的渲染成本计入 `09` 的 text accumulation finding。
- 未运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 未读取范围外仓库文件。
- 未提出任何代码变更方向。

## 报告建议

保留该 issue，状态写为 `仍成立`。报告中应把复杂度变量明确成 accumulated live text length 与 delta count 的组合，并把 reducer 中的字符串累积成本与 Markdown rendering cost 分开描述，避免把渲染器成本扩展成未验证结论。

## 10 live slot selector cache invalidation

## 结论

`10-live-slot-selector-cache-invalidation` 的旧 selector cache invalidation 假设在当前 02e/03 实现中不再成立：当前代码没有 `selectCachedLiveItemsForTurn`、`liveTurn.revision`、`slotKeys`、`slotRevisions` 或 `slotOrder` 驱动的 read-time materialization / revision comparison / key scan。`selectTranscriptLiveItemsForTurn` 现在只是从 reducer-owned `liveItemsByTurnId` 直接返回数组引用，单次选择为 `O(1)`。

该 issue 不是完全无关：`CommittedTranscriptSurface` 当前仍在 render/selector consumption 阶段对 live item 做 `.some()` 和 `.filter()`，这是 03 live display 的当前热路径成本，不是旧的 selector cache invalidation 成本。

## 审计字段

- 关联 issue: `10-live-slot-selector-cache-invalidation`。
- 触发源: 旧假设为每个 projection delta bump `slot.revision` 导致 live turn selector cache 失效；当前触发源为 `threadRuntimeDeltaAccepted` / `threadRuntimeDeltasAccepted` 中的 `agentMessage` delta 更新 reducer-owned live item。
- 触发频率: 旧假设为每个 projection delta；当前 reducer 更新也是每个 accepted `agentMessage` delta，批量 action 内按 notification 循环处理。
- 单次同步工作: 当前 `selectTranscriptLiveItemsForTurn` 为 `O(1)` 字典读取；`CommittedTranscriptTurn` 对当前 turn live items 执行 `.some()` 为 `O(Lt)`；`LiveAssistantMessages` 执行 `.filter()` 为 `O(Lt)`；`hasSurfaceContent` 扫描 turns，并且只在对应 turn 尚无 committed content 时扫描该 turn live items。
- 规模变量: `D` = accepted `agentMessage` delta 数；`Lt` = 当前 turn live item 数；`T` = turn 数；`Ls` = `hasSurfaceContent` 为判断空状态实际扫描到的 live item 总数。
- 累计时间复杂度: 旧 issue 假设为 selector cache 高频失效导致约 `O(D * Lt)` read-time live item materialization。当前 selector materialization 成本为 `O(D)` 次 `O(1)` 读取；当前 03 consumption 仍可能产生 `O(D * Lt)` 的 current-turn `.some()` / `.filter()` 扫描，以及 `O(D * (T + Ls))` 的 `hasSurfaceContent` 空状态判断扫描。
- 03 归因: 旧 selector cache invalidation 已被 reducer-owned renderable live list 行为取代；剩余 `.some()` / `.filter()` / `hasSurfaceContent` 属于当前 03 live display consumption，而不是旧 selector cache invalidation。
- 当前状态: 部分过期

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md:9`: 旧 issue 指向 `selectCachedLiveItemsForTurn` 使用 `liveTurn.revision`、`slotKeys`、`slotRevisions` 判断缓存复用。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md:15`: 旧 issue 假设每个 projection delta 执行 `slot.revision += 1`。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md:21`: 旧 issue 判断每个 delta 会让 live item view cache 失效并重新 materialize `TranscriptRenderableLiveItem[]`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:74`: 当前 live item 已是 reducer state 中的 `TranscriptRenderableLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:94`: 当前 state 直接保存 `liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:206`: 当前 `ensureLiveItemsForTurn` 只创建并保存 reducer-owned live item array。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:257`: 当前 delta 通过 key/index 找到 live item 后原地更新 `transientText`、`status`、`revision`，并 bump `liveScrollPulse`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:512`: 当前 `selectTranscriptLiveItemsForTurn` 直接返回 `transcriptState.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS`，无 read-time materialization。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:205`: 当前 `LiveAssistantMessages` 对 live items 执行 `.filter(isLiveAgentMessage)`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:222`: 当前 turn 通过 `selectTranscriptLiveItemsForTurn` 消费 live items。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:228`: 当前 turn 判空对 live items 执行 `.some(isLiveAgentMessage)`。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:268`: 当前 surface-level `hasSurfaceContent` 扫描 turns。
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:276`: `hasSurfaceContent` 在需要时调用 `selectTranscriptLiveItemsForTurn(...).some(isLiveAgentMessage)`。

## 排除项

- 未发现当前代码中仍存在 `selectCachedLiveItemsForTurn`、`liveTurn.revision`、`slotKeys`、`slotRevisions`、`slotOrder` 或 `slot.revision` 驱动的 live selector cache invalidation。
- 不把 `item.transientText += delta` 的字符串累加成本计入本 issue；旧 issue 明确关注 selector cache invalidation，且本审计目标限定为 live item materialization / slot revision comparison / slot key scan / equivalent selector invalidation。
- `hasSurfaceContent` 只按当前代码证据计入 03 live consumption：它确实在 surface selector 中扫描 turns，并且只对缺少 committed visible content 的 turn 扫描 live items。
- 未运行测试、benchmark、profiling、browser automation、格式化或 package scripts。
- 未提出任何代码变更方向。

## 报告建议

将该 issue 从“live slot selector cache 高频失效仍未修正”校准为“旧 selector cache invalidation 已由 reducer-owned renderable live list 消除；当前仅保留 03 live consumption 阶段的 live item `.some()` / `.filter()` / empty-surface scan 成本”。状态记录为 `部分过期`。

## 03 itemStarted dirtying boundary

## 结论

`03-item-started-dirties-transcript-state` 对首次 `itemStarted` 与重复 `itemStarted` 的区分仍然有效：首次 `itemStarted(agentMessage)` 创建可见 live render state，属于 03 文档已更新后的预期行为，不应分类为 performance bug。剩余窄边界是已有 live item 时，收到不同 `commitId` 的重复 `itemStarted`，当前 reducer 仍会先记录 applied event window，从而产生 dirty state，但不会新增 live slot、committed entry 或 chunk。

## 审计字段

- 关联 issue: `03-item-started-dirties-transcript-state`，issue 明确指出首次 `itemStarted` 已不再是纯 no-op；仅保留“已有 live slot + 不同 `commitId` 的重复 `itemStarted`”窄边界。
- 触发源: `threadRuntimeEventBuffered` 中 `notification.event.type === "itemStarted"`，且 `turnId + item.id` 对应 live slot 已存在，但 `notification.commitId` 尚未进入 `appliedEventIdsById`。
- 触发频率: 与重复 `itemStarted` 且每次携带不同 `commitId` 的事件数量成正比；同一 `commitId` 会被 `hasAppliedEvent` 提前拦截。
- 单次同步工作: 先写入 `appliedEventIdsById`、追加 `appliedEventOrder`，窗口超限时执行一次 `shift` 和 delete；随后 existing turn `O(1)` 返回、existing live item `O(1)` 返回。
- 规模变量: 剩余 dirty-state cost 的核心变量是重复不同 `commitId` 的 `itemStarted` 数量 `D`，以及 applied event window 长度 `W`；`W` 受 `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500` 约束。
- 累计时间复杂度: 对该窄边界累计为 `O(D * W)` 最坏情况，因 `appliedEventOrder.shift()` 可能按窗口长度移动元素；由于 `W <= 500`，实际为有界窗口成本。未发现与 live item 总数或 transcript entry 总数相关的扫描。
- 03 归因: 首次 live slot creation 非 03 performance bug；重复不同 `commitId` 的 existing live item dirty applied-event window 仍属于 03 的窄边界归因。
- 当前状态: 部分过期

## 关键证据路径/行号

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md:17`: issue 明确现状已更新：当前 `itemStarted` 会创建 `turnId + itemId` keyed live slot。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md:22`: issue 指出剩余窄边界：已有 live slot 时，不同 `commitId` 的重复 `itemStarted` 仍会先记录 applied event。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md:40`: issue 明确首次 `itemStarted` dirty `transcriptState` 属于预期 live-state 写入。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:162`: `recordAppliedEvent` 写 `appliedEventIdsById` 并 push `appliedEventOrder`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:166`: applied event window 超过 `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH` 后会 `shift`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:220`: `appendStartedLiveItem` 以 `turnId:item.id` 建 key。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:222`: live item 已存在时直接返回。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:237`: 首次 `agentMessage` live item 创建会 bump `liveScrollPulse`，确认其为可见 live render state。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:541`: 相同 `commitId` 会提前返回。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:545`: 不同未见过的 `commitId` 在事件分支前被记录。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:563`: `itemStarted` 分支调用 `ensureTurnExists` 和 `appendStartedLiveItem`。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:507`: selectors 暴露 `selectTranscriptLiveItem` 与 `selectTranscriptLiveItemsForTurn`，确认 live slot 是 renderable state。

## 排除项

- 排除首次 `itemStarted(agentMessage)` 创建 live slot：这是可见 live render state 创建，不列为 finding。
- 排除相同 `commitId` 的重复事件：会被 `hasAppliedEvent` 拦截，不进入 dirty 窄边界。
- 排除 committed transcript 输出变化：重复 existing live item 的 `itemStarted` 不创建 committed entry/chunk，也不更新 `committedScrollCommitKey`。
- 排除 live item 列表规模扫描：该路径使用 `liveItemIndexByKey` 做 key lookup，未看到按 live item 总数扫描。
- 未运行测试、benchmark、profiling、browser automation、格式化或 package scripts。

## 报告建议

报告中保留 issue 的“部分过期，仍有窄边界”表述；finding 只写“已有 live item + 不同 `commitId` 的重复 `itemStarted` 仍会 dirty applied event window”。不要把首次 `itemStarted(agentMessage)` live slot creation 写成性能问题；剩余 cost 的规模变量写为重复不同 `commitId` 事件数 `D` 与有界 applied event window `W <= 500`。
