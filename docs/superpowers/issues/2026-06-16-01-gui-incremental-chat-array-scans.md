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

后续仍需单独评估:

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
