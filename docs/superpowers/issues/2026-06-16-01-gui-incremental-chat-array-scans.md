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

## 建议方向

- 将 `appliedEventIds` 的去重从无界数组扫描改为常数级查找或有界 cursor 机制。
  - 若 Redux state 需要保持完全 serializable,可以维护 `appliedEventIdsById:
    Record<string, true>` 与有界顺序数组组合。
  - 如果 commit chain 已经保证严格递增且 duplicate 只需防当前/近期 replay,也可以重新评估
    是否需要保留全量历史 commit id。
- 为 `turnOrder` 增加配套 index/fact,避免用顺序数组承担 membership check。
- 为 `messagesByTurnId` 增加 per-turn membership fact,或在 upsert 时优先依赖
  `messagesById` / view index 来判断是否已存在。
- 明确 `selectChatTextModel` / `selectThreadTimelineMaterials` 是 legacy 或 replay/debug-only;
  后续聊天 UI 必须消费 `incrementalChatState` 的 prepared read model,不要从 timeline
  material 重新 fold 全量历史。

## 非问题或低风险项

- `threadRuntime.eventBuffer` 已经限制为 500,`liveEventHandling` 对它的 `map` 成本有硬上限。
- `threadRuntimeSlice.ts` 中 attach 时的 `toReversed().find(...)` 只发生在 attach/reconnect,
  不是每条 live event 或每次 render。
- 单条 `userMessage.content.map(...).join("")` 只随单条 message 的 content parts 增长,
  不直接随整段会话增长。
