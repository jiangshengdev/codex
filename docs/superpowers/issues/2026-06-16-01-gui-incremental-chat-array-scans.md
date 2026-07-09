# GUI incremental chat 数组扫描随会话增长退化

日期: 2026-06-16
状态: ✅ 已修复，2026-07-01 复核完成
范围: codex-gui YOLO single-session chat / incremental chat state
优先级: P2

## 摘要

`codex-gui` incremental chat state 中曾有多处数组 membership scan 或长数组复制风险；截至 2026-07-01 复核，live event 去重、turn membership 和长 turn committed transcript 写入路径都已通过结构性 read model 修复。

## 问题

早期 incremental chat state 已避免从 `snapshotTurns + eventBuffer` 在每次 notification 后全量重建聊天视图，但仍有若干状态使用数组并在线性扫描。部分扫描在 live event 热路径上，部分扫描在 attach / reconnect 的 snapshot rebuild 路径上。

主要风险点：

- `appliedEventIds` 是未设上限的数组。`codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:363` 每个 `threadRuntimeEventBuffered` 都执行 `state.appliedEventIds.includes(action.payload.commitId)`，随后在同一 reducer 中 push commit id。`threadRuntime.eventBuffer` 已经有 500 上限，但 `appliedEventIds` 没有上限，所以长时间连接后每条 live event 的去重成本会随已接收 event 总数线性增长。
- `turnOrder.includes(...)` 在 snapshot rebuild 中可能形成 O(T^2)。`ensureTurnExists` / `upsertTurnFromPayload` 曾在 `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:124` 和 `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:139` 用 `turnOrder.includes(...)` 防重复；`rebuildFromSnapshot` 在 `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:324` 遍历 snapshot 中所有 turn，导致大历史 attach / reconnect 时每个 turn 再扫描已有 `turnOrder`。
- `turnMessages.includes(...)` 在长 turn 中可能退化。`upsertMessage` 曾在 `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:244` 对单个 turn 的 message id 数组做 `includes`。普通 live append 下影响通常小于 `appliedEventIds`，但 snapshot rebuild 会对每个可物化 item 调用 `upsertMessage`；如果单个 turn 内 message 很多，会按该 turn 的 message 数量退化。
- 旧 timeline selector 仍会全量 materialize 历史，路径包括 `codex-gui/src/features/chatTextModel/chatTextModel.ts:79`、`codex-gui/src/features/liveEventHandling/liveEventHandling.ts:150`、`codex-gui/src/features/snapshotReplay/snapshotReplay.ts:61` 和 `codex-gui/src/features/liveEventHandling/liveEventHandling.ts:123`。这条路径当时主要由测试引用，未接入 `App.tsx` render，但若后续 UI 误接 `selectChatTextModel` / `selectThreadTimelineMaterials`，会重新引入每次 selector/render 全量遍历历史的问题。

## 证据

- YOLO GUI 的设计边界要求 active chat path 按 notification 追加演进：attach / reconnect 可以全量 replay 一次；accepted live notification 必须只处理该 notification 影响的局部 facts；`eventBuffer` 和 `snapshotTurns` 只能用于 replay/debug/显式 rebuild，不能作为 active chat surface 每次 render 或 selector 执行时的全量输入。
- 当时 `incrementalChatState` 的 read model 方向是正确的：`selectIncrementalChatTurns` 直接返回已维护好的 `turnViews`，且已有测试覆盖重复 selector 调用不会重建引用。
- `appliedEventIds.includes(...)` 是 live event reducer 的每事件成本，且输入不受 `eventBuffer` 的 500 cap 保护；长会话中这会逐步放大每条 notification 的处理时间。
- attach / reconnect 路径虽然不是 steady-state，但它正是大历史最容易被用户感知为慢的路径；`turnOrder.includes(...)` 和 `turnMessages.includes(...)` 在 rebuild 中反复扫描数组，会让大 snapshot 的初始化成本高于必要值。
- 2026-06-17 追加证据指出 `upsertMessageIntoTurnView` 还存在长 turn 下 `turnView.messages` 复制风险。append 新 message 时曾构造 `const messages = [...turnView.messages, message]`；更新已有 message 时曾构造 `const messages = [...turnView.messages]` 后替换索引。即使改为 Immer 风格 draft mutation，长 turn 中已有 `M` 条可见 message 时，一次 append / update 仍可能触发与 `M` 成正比的数组复制，累计成本接近 O(M^2)。

## 判断

该 issue 已修复。2026-06-17 已确认前两个问题修复；2026-07-01 复核确认剩余 long turn 风险也已通过当前 `transcriptState` 的结构性设计修复。

旧 timeline selector 仍应视为 replay/debug-only 陷阱：后续聊天 UI 不应消费 `selectChatTextModel` / `selectThreadTimelineMaterials` 来从 timeline material 重新 fold 全量历史。

## 修复记录

- `appliedEventIds` 已拆为 `appliedEventIdsById` + `appliedEventOrder`，并设置 `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500`。查重从 `Array.includes(...)` 的 O(N) 改为对象属性读取的 O(1)，顺序数组只用于 eviction，cap 与 `threadRuntime.eventBuffer` 对齐为 500。
- `turnOrder.includes(...)` 已移除，turn membership 依赖 canonical `turnsById`。`turnOrder` 只保存展示顺序，不承担 membership check。
- `transcriptStateSlice.ts` 现在使用 `turnIds`、`turnsById`、`chunksById`、`entriesById` 和 `entryChunkById` 维护 committed transcript，不再维护 `turnViews[].messages[]` 或 `messagesByTurnId` 这类不断增长的整 turn 消息数组。
- live event 去重使用 `appliedEventIdsById[commitId]` O(1) 查重，`appliedEventOrder` 只作为 500 上限的 eviction 顺序数组。
- middle / temporary entries 按 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100` 拆成 bounded chunk。append 只写尾部 chunk；update 通过 `entryChunkById` 定位所属 chunk 并 bump revision，不按整个 turn 扫描。
- `CommittedTranscriptSurface` 渲染 middle content 时按 `chunkId` 订阅 `MiddleTranscriptChunk`，没有把所有 middle chunks `flatMap` 回整 turn entries。
- collapsed temporary module 不挂载隐藏 entries；只有展开时才渲染 chunk entries。
- disclosure label 使用 `middleEntryCount`，不是在 render 时扫描 chunk entries 计算。

## 验证记录

2026-07-01 复核结论：

- snapshot rebuild 中未发现 `turnOrder.includes(...)` 或 `turnIds.includes(...)`。
- 保留成本均有界：`appliedEventOrder.shift()` 最多处理 500 长度数组；`selectTranscriptChunk` 会 materialize 单个 chunk 的 `entryIds`，但单 chunk 当前上限是 100。
- `finalAssistantEntryIds` 未 chunk 化，但它不属于本 issue 的 temporary/middle hot path，且正常语义下一轮只有少量 final answer。

## 影响

修复前，live event 热路径会随已接收 event 总数线性变慢；大历史 attach / reconnect 可能按 turn 数或单 turn message 数退化；长时间代理会话中，同一 turn 的不断增长数组还可能放大 Redux/Immer immutable update 成本。修复后，主要 active chat 写入路径改为 O(1) membership + bounded chunk 更新，长会话性能边界更明确。

## 后续处理

- 后续聊天 UI 必须消费 incremental / transcript read model，不要从 legacy timeline selector 每次 render 重新 fold 全量历史。
- 若将来发现 `finalAssistantEntryIds` 在真实 workload 中变成长列表，再单独进入设计/计划阶段评估是否需要 chunk 化。
- 如果要重新评估旧 `chatTextModel` / `snapshotReplay` 路径，应先确认它们是否仍只用于 replay/debug 或测试。

## 历史记录

### 2026-06-17 追加：长 turn 下 `turnView.messages` 复制风险

当时剩余热点主要在 `upsertMessageIntoTurnView`。同 turn 内 append 或 update visible message 时，`turnView.messages` 会被整体复制：

```ts
const messages = [...turnView.messages, message];
state.turnViews[turnViewIndex] = {
  ...turnView,
  messages,
};
```

更新已有 message 时也会复制整个 messages 数组：

```ts
const messages = [...turnView.messages];
messages[existingMessageIndex.index] = message;
```

这比 `turnMessages.includes(...)` 更严重：一个会话可能持续 8 小时以上；一个 turn 不等于一条 message，代理会在同一个 turn 内持续回复、执行工具、产出多条可见 entry；`selectIncrementalChatTurns` 当时直接返回 reducer 维护的 `turnViews`，读路径避免了每次全量 materialize，但写路径仍会为单个长 turn 复制不断增长的 `messages[]`。

`messagesByTurnId[turnId].includes(message.id)` 仍是一个线性扫描点，但它不是根因。即使把 membership 改成 O(1)，只要 `turnViews[].messages[]` 仍是一个不断增长的大数组，append/update 仍会触发大数组复制。

### 旧候选方案

方案 A 是战术性改为 Immer mutable 写法，例如 `turnView.messages.push(message)` 和 `turnView.messages[existingMessageIndex.index] = message`。它能降低显式数组展开和对象重建的常数成本，但不改变 immutable update 的结构成本，不能保证 very long turn 的 append/update 成本有硬上限。

方案 B 是 bounded chunks 拆分 committed messages，例如维护 `committedChunksById`、`chunkOrderByTurnId` 和 `openChunkIdByTurnId`。append 只修改最后一个未满 chunk，chunk 满后开新 chunk。该方向可以把每次 append 的复制成本限制在小 chunk 内，但要求 UI/selector 不能再 `flatMap` 回完整 `messages[]`，并需要把 `messageViewIndexById` 从 `{ turnId, index }` 调整为 `{ turnId, chunkId, index }`。

方案 C 是 committed transcript + active live tail：finalized/stable entry 进入 committed chunks；running tool、streaming assistant message、hook/status 等 mutable 内容放在 active tail；finalize 时再合并进 committed chunk。该方向与方案 B 组合后形成 `bounded committed chunks + active live tail`，但设计复杂度更高，需要明确 active/finalize 边界。

方案 D 是把高频 transcript buffer 移出 Redux，使用 external mutable store 或组件本地 buffer 承接高频 append，Redux 只保存较粗粒度状态。该方向可避开 Redux/Immer immutable copy 成本，但会削弱 Redux DevTools / replay / deterministic reducer 边界，与当时 YOLO 05b 的 reducer-maintained read model 方向不一致，因此不建议作为首选。

当时仍需单独评估的问题包括：是否先做方案 A 作为短期止血，还是直接进入方案 B/C 的结构性修复；是否为 `messagesByTurnId` 增加 per-turn membership fact，或在 upsert 时优先依赖 `messagesById` / view index；chunk size 初始值在 100 和 200 之间如何选择；以及明确 `selectChatTextModel` / `selectThreadTimelineMaterials` 是 legacy 或 replay/debug-only。

### 非问题或低风险项

- `threadRuntime.eventBuffer` 已经限制为 500，`liveEventHandling` 对它的 `map` 成本有硬上限。
- `threadRuntimeSlice.ts` 中 attach 时的 `toReversed().find(...)` 只发生在 attach/reconnect，不是每条 live event 或每次 render。
- 单条 `userMessage.content.map(...).join("")` 只随单条 message 的 content parts 增长，不直接随整段会话增长。
