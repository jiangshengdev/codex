# P2 · GUI incremental chat 中若干数组扫描会随会话增长退化

日期:2026-06-16
范围:codex-gui YOLO single-session chat / incremental chat state
优先级:中高(live event 热路径和 attach/reconnect 大历史性能风险)

## 问题

当前 `codex-gui` 的 incremental chat state 已经避免了从 `snapshotTurns + eventBuffer`
在每次 notification 后全量重建聊天视图,但仍有若干状态使用数组并在线性扫描。部分扫描在
live event 热路径上,部分扫描在 attach / reconnect 的 snapshot rebuild 路径上。

主要风险点:

1. `appliedEventIds` 是未设上限的数组

   `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:363`
   每个 `threadRuntimeEventBuffered` 都执行:

   ```ts
   state.appliedEventIds.includes(action.payload.commitId)
   ```

   随后在同一 reducer 中 push commit id。`threadRuntime.eventBuffer` 已经有 500 上限,
   但 `appliedEventIds` 没有上限,所以长时间连接后每条 live event 的去重成本会随已接收
   event 总数线性增长。

2. `turnOrder.includes(...)` 在 snapshot rebuild 中可能形成 O(T^2)

   `ensureTurnExists` / `upsertTurnFromPayload` 会用 `turnOrder.includes(...)` 防重复:

   - `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:124`
   - `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:139`

   `rebuildFromSnapshot` 会遍历 snapshot 中的所有 turn:

   - `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:324`

   大历史 attach / reconnect 时,每个 turn 再扫描已有 `turnOrder`,存在按 turn 数退化为
   O(T^2) 的风险。

3. `turnMessages.includes(...)` 在长 turn 中可能退化

   `upsertMessage` 对单个 turn 的 message id 数组做 `includes`:

   - `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts:244`

   普通 live append 下影响通常小于 `appliedEventIds`,但 snapshot rebuild 会对每个可物化
   item 调用 `upsertMessage`。如果单个 turn 内 message 很多,会按该 turn 的 message 数量
   退化。

4. 旧 timeline selector 仍会全量 materialize 历史

   下面这条路径当前主要由测试引用,没有接入 `App.tsx` render:

   - `codex-gui/src/features/chatTextModel/chatTextModel.ts:79`
   - `codex-gui/src/features/liveEventHandling/liveEventHandling.ts:150`
   - `codex-gui/src/features/snapshotReplay/snapshotReplay.ts:61`
   - `codex-gui/src/features/liveEventHandling/liveEventHandling.ts:123`

   其中 `snapshotReplay` 会遍历全部 snapshot turns 和 items,`liveEventHandling` 会遍历
   bounded `eventBuffer`,`chatTextModel` 再 fold 整条 timeline。若后续 UI 误接
   `selectChatTextModel` / `selectThreadTimelineMaterials`,就会重新引入每次 selector/render
   全量遍历历史的问题,违背 `00-overall-design.md` 中的 steady-state 性能边界。

## 为何是风险

YOLO GUI 的设计边界要求 active chat path 按 notification 追加演进:

- attach / reconnect 可以全量 replay 一次。
- accepted live notification 必须只处理该 notification 影响的局部 facts。
- `eventBuffer` 和 `snapshotTurns` 只能用于 replay/debug/显式 rebuild,不能作为 active chat
  surface 每次 render 或 selector 执行时的全量输入。

当前 `incrementalChatState` 的 read model 方向是正确的:

- `selectIncrementalChatTurns` 直接返回已维护好的 `turnViews`;
- 已有测试覆盖重复 selector 调用不会重建引用。

但 `appliedEventIds.includes(...)` 是 live event reducer 的每事件成本,且输入不受
`eventBuffer` 的 500 cap 保护。长会话中这会逐步放大每条 notification 的处理时间。

attach / reconnect 路径虽然不是 steady-state,但它正是大历史最容易被用户感知为慢的路径。
`turnOrder.includes(...)` 和 `turnMessages.includes(...)` 在 rebuild 中反复扫描数组,会让大
snapshot 的初始化成本高于必要值。

旧 timeline selector 目前还不是当前页面热点:现有 `App.tsx` 仍只显示 GUI host 状态,没有
接 chat 列表 selector。但它是明显的后续接入陷阱,需要在进入 `06a/06b` UI 接入前切断或
标注为 replay/debug-only。

## 当前状态

状态:已修复(2026-07-01 复核)

截至 2026-06-17,前两个问题已经在当前分支修复:

- `appliedEventIds` 已拆为 `appliedEventIdsById` + `appliedEventOrder`,并设置
  `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500`。
- `turnOrder.includes(...)` 已移除,turn membership 依赖 canonical `turnsById`。

截至 2026-07-01,后续复核确认剩余 long turn 风险也已通过当前 `transcriptState`
结构性修复:

- `transcriptStateSlice.ts` 现在使用 `turnIds`、`turnsById`、`chunksById`、
  `entriesById` 和 `entryChunkById` 维护 committed transcript,不再维护
  `turnViews[].messages[]` 或 `messagesByTurnId` 这类不断增长的整 turn 消息数组。
- live event 去重使用 `appliedEventIdsById[commitId]` O(1) 查重,`appliedEventOrder`
  只作为 500 上限的 eviction 顺序数组。
- turn membership 依赖 `turnsById`,snapshot rebuild 中未发现 `turnOrder.includes(...)`
  或 `turnIds.includes(...)`。
- middle / temporary entries 按 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100` 拆成
  bounded chunk。append 只写尾部 chunk; update 通过 `entryChunkById` 定位所属 chunk 并
  bump revision,不按整个 turn 扫描。
- `CommittedTranscriptSurface` 渲染 middle content 时按 `chunkId` 订阅
  `MiddleTranscriptChunk`,没有把所有 middle chunks `flatMap` 回整 turn entries。
- collapsed temporary module 不挂载隐藏 entries;只有展开时才渲染 chunk entries。
- disclosure label 使用 `middleEntryCount`,不是在 render 时扫描 chunk entries 计算。

保留的成本是有界成本:`appliedEventOrder.shift()` 最多处理 500 长度数组;
`selectTranscriptChunk` 会 materialize 单个 chunk 的 `entryIds`,但单 chunk 当前上限是
100。`finalAssistantEntryIds` 未 chunk 化,但它不属于本 issue 的 temporary/middle hot path,
且正常语义下一轮只有少量 final answer。

## 已选择方向

针对 `appliedEventIds` 问题,采用 `Record` 查重表 + 有界顺序数组:

```ts
appliedEventIdsById: Record<string, true>;
appliedEventOrder: string[];
```

选择原因:

- 查重从 `Array.includes(...)` 的 O(N) 改为对象属性读取的 O(1)。
- Redux state 继续保持普通 serializable object/array,不引入 `Set`。
- 顺序数组只用于 eviction,不再承担 membership check。
- cap 建议先与 `threadRuntime.eventBuffer` 对齐为 500。

语义边界:

- 这是 `incrementalChatStateSlice` 的 reducer 幂等窗口,不是协议级完整历史去重。
- 窗口外旧 commit 如果再次被 dispatch,该 slice 不保证继续拦截。
- 正常 projection 输入路径的 commit chain / stale subscription / duplicate 判断仍由
  `ProjectionIngressAdapter` 负责。

针对 `turnOrder.includes(...)` 问题,采用删除冗余 membership scan 的方案,不新增
`turnOrderIndexById`:

```ts
const existingTurn = state.turnsById[turnId];
if (existingTurn != null) {
  syncTurnView(state, existingTurn);
  return existingTurn;
}

state.turnsById[turnId] = turn;
state.turnOrder.push(turnId);
```

选择原因:

- `turnsById` 已经是 turn membership 的 canonical fact。
- `ensureTurnExists` 和 `upsertTurnFromPayload` 都是在 `turnsById[id]` 不存在时才进入
  push 分支,所以 `turnOrder.includes(...)` 是重复防御。
- 删除 `includes` 后,attach / reconnect snapshot rebuild 不再对每个新 turn 扫描已有
  `turnOrder`,整体从潜在 O(T^2) 回到 O(T)。
- 不新增 `turnOrderIndexById`,避免让 `turnOrder`、`turnsById`、`turnViewIndexById` 之外
  再多一个需要同步维护的重复事实。

语义边界:

- `turnOrder` 只保存展示顺序,不承担 membership check。
- `turnOrder` 必须继续只通过 `ensureTurnExists` / `upsertTurnFromPayload` 这类 helper 维护;
  不允许外部直接写入并绕过 `turnsById`。
- 回归测试应证明 snapshot rebuild 不再为了 turn id 调用数组 membership scan,同时保持
  `selectIncrementalChatTurns` 输出顺序不变。

## 2026-06-17 追加:长 turn 下 `turnView.messages` 复制风险

当前剩余热点主要在 `upsertMessageIntoTurnView`:

```ts
const messages = [...turnView.messages, message];
state.turnViews[turnViewIndex] = {
  ...turnView,
  messages,
};
```

同 turn 内更新已有 message 时也会复制整个 messages 数组:

```ts
const messages = [...turnView.messages];
messages[existingMessageIndex.index] = message;
```

表面看这是数组 spread 的成本,但本质是 Redux/Immer 的 immutable update 成本。即使改成
Immer 风格的 `turnView.messages.push(message)`,也只能减少显式展开和部分常数开销;为了产生
下一版 immutable state,Immer 在修改已有长数组时仍需要 copy-on-write。长 turn 中已有 `M`
条可见 message 时,一次 append / update 仍可能触发与 `M` 成正比的数组复制。若代理在一个
turn 内持续运行数小时并不断产出 item,累计成本会接近 O(M^2)。

这比 `turnMessages.includes(...)` 更严重:

- 一个会话可能持续 8 小时以上。
- 一个 turn 不等于一条 message;代理会在同一个 turn 内持续回复、执行工具、产出多条可见 entry。
- `selectIncrementalChatTurns` 现在直接返回 reducer 维护的 `turnViews`,读路径避免了每次全量
  materialize,但写路径仍会为单个长 turn 复制不断增长的 `messages[]`。

`messagesByTurnId[turnId].includes(message.id)` 仍是一个线性扫描点,但它不是根因。即使把
membership 改成 O(1),只要 `turnViews[].messages[]` 仍是一个不断增长的大数组,append/update
仍会触发大数组复制。

## 可能方案

### 方案 A:战术性改为 Immer mutable 写法

把显式 spread 改为 reducer draft mutation:

```ts
turnView.messages.push(message);
turnView.messages[existingMessageIndex.index] = message;
```

优点:

- 改动小,符合 Redux Toolkit reducer 写法。
- 可降低显式数组展开和对象重建的常数成本。

局限:

- 不改变 immutable update 的结构成本。
- 对 very long turn 仍会修改同一个长数组,不能保证 append/update 成本有硬上限。

结论:可作为局部清理,但不是这个性能问题的真正修复。

### 方案 B:bounded chunks 拆分 committed messages

把每个 turn 的 committed messages 从一个大数组改为多个固定上限 chunk。例如每 100 或 200
条 entry 一个 chunk:

```ts
committedChunksById: Record<string, EntryChunk>;
chunkOrderByTurnId: Record<string, string[]>;
openChunkIdByTurnId: Record<string, string>;
```

append 时只修改最后一个未满 chunk。chunk 满后开新 chunk,`chunkOrderByTurnId` 只在每 N 条
entry 时增长一次。

优点:

- 每次 append 最多复制一个小 chunk,成本有明确上限。
- 长 turn 累计成本从复制整个历史,变成复制固定大小尾块。
- 保留 Redux serializable state 和 reducer 内 deterministic projection。

风险点:

- UI/selector 不能再 `flatMap` 回完整 `messages[]`,否则会把成本转移到读路径。
- 组件需要按 `chunkId` / chunk view 渲染,或至少按 chunk memoize。
- 需要重新定义 `messageViewIndexById`,从 `{ turnId, index }` 调整为 `{ turnId, chunkId, index }`。

结论:这是当前最适合的结构性修复方向。

### 方案 C:committed transcript + active live tail

借鉴 TUI 思路,把稳定历史和正在变化的 live tail 分开:

- finalized/stable entry 进入 committed chunks。
- running tool、streaming assistant message、hook/status 等 mutable 内容放在 active tail。
- finalize 时把 active tail 合并进 committed chunk。

优点:

- 高频变化只触碰很小的 active state。
- committed 历史大部分时间不变,引用稳定,更适合长会话。
- 与 TUI 的 transcript / active cell 边界一致。

风险点:

- 设计复杂度高于单纯 chunk。
- 需要明确哪些 protocol item 算 active,哪些事件触发 finalize。
- 测试需要覆盖 active 到 committed 的迁移和 reconnect rebuild。

结论:推荐与方案 B 组合,形成 `bounded committed chunks + active live tail`。

### 方案 D:把高频 transcript buffer 移出 Redux

使用 external mutable store 或组件本地 buffer 承接高频 append,Redux 只保存较粗粒度状态。

优点:

- 可以避开 Redux/Immer 的 immutable copy 成本。

风险点:

- 削弱 Redux DevTools / replay / deterministic reducer 边界。
- 更容易出现 store 与 UI 状态不同步。
- 与当前 YOLO 05b 的 reducer-maintained read model 方向不一致。

结论:不建议作为首选。除非 chunk + active tail 仍无法满足性能目标,否则不应先走这条路。

后续仍需单独评估:

- 是否先做方案 A 作为短期止血,还是直接进入方案 B/C 的结构性修复。
- 为 `messagesByTurnId` 增加 per-turn membership fact,或在 upsert 时优先依赖
  `messagesById` / view index 来判断是否已存在。注意这只能解决 membership scan,不能解决
  `turnViews[].messages[]` 长数组复制。
- chunk size 初始值建议在 100 和 200 之间选择;需要结合 UI 渲染粒度和 reducer 更新频率定。
- 明确 `selectChatTextModel` / `selectThreadTimelineMaterials` 是 legacy 或 replay/debug-only;
  后续聊天 UI 必须消费 `incrementalChatState` 的 prepared read model,不要从 timeline
  material 重新 fold 全量历史。

## 非问题或低风险项

- `threadRuntime.eventBuffer` 已经限制为 500,`liveEventHandling` 对它的 `map` 成本有硬上限。
- `threadRuntimeSlice.ts` 中 attach 时的 `toReversed().find(...)` 只发生在 attach/reconnect,
  不是每条 live event 或每次 render。
- 单条 `userMessage.content.map(...).join("")` 只随单条 message 的 content parts 增长,
  不直接随整段会话增长。
