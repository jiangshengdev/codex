# Snapshot Replay Design

## 目标

`04 Snapshot Replay` 负责把 `03 Thread Runtime Store` 保存的 attach snapshot baseline 转成后续层可消费的 replay material。

这一层位于 `03 Thread Runtime Store` 之后、`04a ProjectionSlice Cleanup` 和 `05 Live Event Handling` 之前。它只处理 snapshot replay 路径：从 `threadRuntime.current.snapshotTurns` 和 thread metadata 派生有序 replay material，并显式标记这些 material 来自 `snapshotReplay`。

`04` 不生成 chat view model，不解释 live event，不写回 runtime store，也不触发 UI 副作用。它的职责是建立 replay path，让后续 `05/06/08` 可以在明确的 replay/live 边界上继续解释 turn、item、message 和 tool activity。

## 范围

这一层处理：

- `ThreadRuntimeRecord.thread`。
- `ThreadRuntimeRecord.snapshotTurns`。
- snapshot turn 顺序。
- snapshot turn 内 item 顺序。
- replay material 的 source 标记。
- replay-only 副作用隔离边界。

这一层不处理：

- 不消费 `ThreadRuntimeRecord.eventBuffer`。
- 不处理 accepted live projection event。
- 不派生 chat view model。
- 不解释 user/assistant/tool 的最终 UI 语义。
- 不处理 streaming delta。
- 不设计 composer。
- 不设计 reconnect UI。
- 不删除 `projectionSlice`。
- 不写回 `threadRuntimeSlice`。

## 设计决策

**A. Replay Material Boundary**

`04` 的产物是 replay material 序列，而不是 chat view model 或新的 runtime state。

replay material 是后续层解释 snapshot baseline 的输入材料。它必须足够结构化，能表达 turn/item 顺序和 replay source；但它不能提前决定这些 item 最终如何显示成普通聊天消息、tool activity、状态行或其他 UI。

**B. Snapshot Turns 展开深度**

`04` 按 snapshot 中的 turn 顺序、每个 turn 内的 item 顺序展开材料。

它可以表达：

- 一个 snapshot turn 开始 replay。
- 一个 snapshot item 被 replay。
- 一个已完成、已中断或失败的 snapshot turn 完成 replay。

它不把 `ThreadItem` 解释成 chat view model。`userMessage`、`agentMessage`、`commandExecution`、`mcpToolCall` 等 item type 在 `04` 中仍作为原始 item payload 保留。

**C. Replay Source 显式建模**

每条 material 必须带：

```ts
source: "snapshotReplay"
```

后续 `05 Live Event Handling` 的 live material 必须使用不同 source，例如 `liveProjection`。这样 replay/live 差异在类型层可见，调用方不能把 snapshot replay 当作 live event 隐式处理。

**D. ProjectionSlice Cleanup 独立阶段**

`04` 不删除旧 `projectionSlice`，也不依赖旧 `projectionSlice`。

`04` 的所有输入必须来自 `threadRuntimeSlice`。旧 `projectionSlice` 仍可作为 `03` 后残留的临时兼容路径存在，但 replay path 不从它读取、不向它写入、不基于它派生 material。

删除旧路径属于 `04a ProjectionSlice Cleanup`。

## TUI 对齐点

TUI 中 snapshot replay 的关键边界是：

- `ThreadEventStore` 保存 `turns` baseline。
- thread snapshot replay 时，`ChatWidget::replay_thread_turns(turns, ReplayKind::ThreadSnapshot)` 处理 snapshot turns。
- replay item 进入 `handle_thread_item(..., ThreadItemRenderSource::Replay(replay_kind))`。
- `from_replay` / `ReplayKind::ThreadSnapshot` 用于隔离 live-only 副作用。

GUI `04` 不复刻 `ChatWidget` 的 UI 行为。它只复刻这条边界在数据层的含义：

- snapshot turns 是 replay 输入。
- replay 和 live 必须有不同 source。
- replay material 可以保留原始 item，但不能触发 live-only 行为。
- snapshot replay 是从 baseline 重建下游状态的路径，不是新的 protocol ingress。

## 输入边界

`04` 只读取 `03` 的 runtime record：

```ts
type SnapshotReplayInput = {
  threadId: string;
  thread: Omit<Thread, "turns">;
  snapshotTurns: Turn[];
};
```

输入来自：

- `selectThreadRuntimeRecord(state)`
- 或更窄的 `selectThreadRuntimeSnapshotReplayInput(state)` selector。

如果当前没有 runtime record，`04` 产出空 material 序列。

`04` 不读取：

- `projectionSlice`
- `ProjectionIngressAdapter`
- `eventBuffer`
- WebSocket status
- App component local state

## 输出模型

推荐 material 形状：

```ts
type SnapshotReplaySource = "snapshotReplay";

type SnapshotReplayMaterial =
  | {
      type: "turnStarted";
      source: SnapshotReplaySource;
      threadId: string;
      turn: Turn;
    }
  | {
      type: "itemReplayed";
      source: SnapshotReplaySource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "turnCompleted";
      source: SnapshotReplaySource;
      threadId: string;
      turn: Omit<Turn, "items">;
    };
```

`turnStarted` 表示一个 snapshot turn replay 开始，不表示 live turn 刚启动。

`itemReplayed` 保留原始 `ThreadItem`，只表达这个 item 属于某个 snapshot turn 并按 baseline 顺序出现。

`turnCompleted` 只对 terminal turn 输出：

- `completed`
- `interrupted`
- `failed`

`inProgress` turn 不输出 `turnCompleted`，但仍输出 `turnStarted` 和已有 snapshot items。

`turnCompleted.turn` 不携带 `items`，避免同一 item 同时出现在 turn completion material 和 item material 中。

## 展开规则

对每个 `snapshotTurns` 中的 turn，按数组顺序执行：

1. 输出 `turnStarted` material。
2. 按 `turn.items` 顺序输出 `itemReplayed` material。
3. 如果 `turn.status` 是 terminal status，输出 `turnCompleted` material。

terminal status 是：

- `completed`
- `interrupted`
- `failed`

非 terminal status 是：

- `inProgress`

`04` 不重新计算 active turn。active turn 已由 `03` 从 snapshot turns 派生并保存。

`04` 不校验 commit chain、missing turn 或 subscription。那些属于 `02 Projection Ingress Adapter`。

## Replay-Only 副作用隔离

`source: "snapshotReplay"` 是硬边界。

后续消费者看到 snapshot replay material 时：

- 不能触发 live-only toast、popup、autosend 或 queued-input side effect。
- 不能把 `turnStarted` 当成新的 live turn start。
- 不能把 `turnCompleted` 当成当前 live turn 刚结束。
- 不能把 replayed item 当作新到达的 projection event。

`04` 本身不实现这些 UI 行为，但它必须通过类型和测试让 source 边界可见。

## 与相邻阶段的边界

`03 Thread Runtime Store`：

- 03 保存 `snapshotTurns`、thread metadata、event buffer 和 active turn。
- 04 只读取 `snapshotTurns` 和 thread metadata。
- 04 不修改 03 state。

`04a ProjectionSlice Cleanup`：

- 04 不依赖 `projectionSlice`。
- 04a 删除旧 `projectionSlice` 兼容路径。
- 04a 不新增 replay material 行为。

`05 Live Event Handling`：

- 05 消费 `eventBuffer`，并建立 live material / live handling path。
- 05 必须使用不同 source，不能复用 `snapshotReplay`。
- 05 可以与 04 对齐 material 形状，但 replay/live source 必须不同。

`06 Basic Chat Surface`：

- 06 才把 replay/live material 派生成普通聊天 view model。
- 04 不决定 user message、assistant message、status row 或 tool activity 的最终展示。

`08 Tool Activity`：

- 08 才解释 tool-related `ThreadItem` 的活动展示。
- 04 只保留原始 tool item payload。

## 现有实现迁移方向

`04` 的实现计划应新增一个独立 replay 模块，例如：

```text
codex-gui/src/features/snapshotReplay/
```

该模块可以包含：

- replay material 类型。
- 从 `ThreadRuntimeRecord` 派生 replay material 的纯函数。
- selector。
- focused unit tests。

`App.tsx` 不需要在 `04` 中接入新 UI。`04` 的验收可以通过 selector / pure function tests 完成。

旧 `projectionSlice` 在 `04` 中只允许作为现存未清理代码出现。新增 replay 代码不能 import 它。

## 验收标准

`04` 只验收 snapshot replay：

- 没有 runtime record 时，replay material 为空。
- 有 snapshot turns 时，按 turn 顺序产出 material。
- 每个 turn 先产出 `turnStarted`。
- 每个 item 按原始顺序产出 `itemReplayed`。
- terminal turn 产出 `turnCompleted`。
- `inProgress` turn 不产出 `turnCompleted`。
- 所有 material 都带 `source: "snapshotReplay"`。
- `itemReplayed` 保留原始 `ThreadItem` payload，不解释成 chat view model。
- replay material 只来自 `threadRuntimeSlice`，不依赖 `projectionSlice`。
- `04` 不消费 `eventBuffer`。
- `04` 不写回 runtime store。

不在 `04` 验收：

- 删除 `projectionSlice`。
- live event handling。
- chat surface rendering。
- assistant streaming buffer。
- composer send/interrupt。
- reconnect UI。
- tool activity 展示。

## 设计原则

- Snapshot replay 是 baseline 重建路径，不是 live event path。
- Replay material 是下游解释输入，不是 UI view model。
- Replay/live source 必须显式区分。
- `04` 只读 runtime，不写 runtime。
- `04` 不依赖旧 `projectionSlice`，但也不负责删除它。
- item interpretation 留给后续 replay/live consumer 和 chat/tool 层。
