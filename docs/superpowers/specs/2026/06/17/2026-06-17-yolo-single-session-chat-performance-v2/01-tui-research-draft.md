# TUI 调研草案:GUI v2 性能设计参考

日期:2026-06-17
范围:YOLO single-session chat GUI performance v2
状态:草案,仅记录调研结论,不是最终设计或实施计划

## 背景

现有 `00-overall-design.md` 已经要求 active chat path 不能在每次 notification 后全量
fold `snapshotTurns + eventBuffer`,也提到 streaming 需要 stable finalized history 和
mutable active tail 分离。但当前 GUI 实现暴露出新的性能问题:即使 selector 不再全量
materialize,Redux/Immer 写路径仍会在长 turn 下反复复制 `turnViews[].messages[]` 这类不断
增长的大数组。

因此 v2 总设计需要重新定义整条链路的性能边界:输入、runtime、chat projection、selector、
React render、streaming/finalize 都必须有 bounded 行为。TUI 是主要参考,但只能借鉴边界和
数据流,不能照搬终端 UI 对象模型。

## TUI event store

TUI 的 `ThreadEventStore` 是 per-thread 的可重建事实包,不是 steady-state UI materializer。
它保存:

- `session: Option<ThreadSessionState>`;
- `turns: Vec<Turn>`;
- `buffer: VecDeque<ThreadBufferedEvent>`;
- `pending_interactive_replay`;
- `active_turn_id: Option<String>`;
- `input_state: Option<ThreadInputState>`;
- `capacity`;
- `active`;

证据:

- `ThreadEventSnapshot` 包含 `session`、`turns`、`events`、`input_state`:
  `codex-rs/tui/src/app/thread_events.rs:10`
- `ThreadBufferedEvent` 包含 notification、request、history lookup response、feedback:
  `codex-rs/tui/src/app/thread_events.rs:18`
- `ThreadEventStore` 字段定义:
  `codex-rs/tui/src/app/thread_events.rs:40`

live notification 进入 store 的核心路径是 `push_notification`:

- 先更新 pending interactive replay 状态;
- `TurnStarted` 设置 `active_turn_id`;
- 匹配当前 active turn 的 `TurnCompleted` 清空 `active_turn_id`;
- `ThreadClosed` 清空 `active_turn_id`;
- notification 被包成 `ThreadBufferedEvent::Notification` 放入 bounded buffer;
- 超过 `capacity` 时从头驱逐旧 event。

证据:

- `push_notification` 维护 active turn:
  `codex-rs/tui/src/app/thread_events.rs:107`
- notification push 到 buffer 并按 capacity 驱逐:
  `codex-rs/tui/src/app/thread_events.rs:124`
- channel 同时持有 sender、receiver 和共享 store:
  `codex-rs/tui/src/app/thread_events.rs:289`

## Live 与 replay 的边界

TUI 对 active thread 和 inactive thread 的处理不同:

- notification 先写入对应 thread 的 store;
- 只有该 thread active 时,才通过 channel 送给当前 `ChatWidget`;
- inactive thread 不会让当前 UI 每次 notification 都重算。

证据:

- `ensure_thread_channel` 为 thread 建立 channel:
  `codex-rs/tui/src/app/thread_routing.rs:38`
- `enqueue_thread_notification` 写 store,仅在 `guard.active` 时发送到 channel:
  `codex-rs/tui/src/app/thread_routing.rs:852`
- `drain_active_thread_events` 只 drain 当前 active receiver:
  `codex-rs/tui/src/app/thread_routing.rs:1235`

replay 是显式边界:

- `ThreadEventStore::snapshot()` 复制 session、turns、filtered events、input_state;
- request 只有仍需要 replay 的 pending request 才进入 snapshot;
- thread switch / resume 时重建 `ChatWidget`,再 replay snapshot turns 和 filtered events;
- replay 之后再 drain live events。

证据:

- snapshot 构造:
  `codex-rs/tui/src/app/thread_events.rs:208`
- pending request replay filter:
  `codex-rs/tui/src/app/thread_events.rs:217`
- `replay_thread_snapshot` replay session、turns、events:
  `codex-rs/tui/src/app/thread_routing.rs:1290`
- replay event 走 `handle_thread_event_replay`:
  `codex-rs/tui/src/app/thread_routing.rs:1449`

GUI v2 启发:

- event tail 只能是 bounded replay/debug 材料,不能作为 production selector/render 的
  steady-state 输入。
- attach / reconnect / explicit replay 可以全量 rebuild 一次。
- live notification 必须按条 apply 到 bounded facts/read model。
- replay 和 live 必须带来源标记,用于禁止 replay 触发 live-only 副作用。

## ChatWidget transcript 边界

TUI `ChatWidget` 明确区分 committed transcript cells 和 in-flight active cell:

- committed history 是 finalized `HistoryCell`;
- active cell 是 `TranscriptState.active_cell`,用于可变、进行中的内容;
- active cell flush 后才通过 `AppEvent::InsertHistoryCell` 进入 committed history;
- transcript overlay 渲染 committed cells 加 active cell 派生的 render-only live tail。

证据:

- `ChatWidget` 文件头注释说明 committed cells + active cell:
  `codex-rs/tui/src/chatwidget.rs:6`
- `TranscriptState.active_cell` 和 `active_cell_revision`:
  `codex-rs/tui/src/chatwidget/transcript.rs:12`
- `flush_active_cell` 把 active cell 发送为 history cell:
  `codex-rs/tui/src/chatwidget.rs:1174`
- `add_boxed_history` 在必要时先 flush active cell:
  `codex-rs/tui/src/chatwidget.rs:1186`

active cell 还有显式 cache key / revision:

- `active_cell_revision` 用于失效 transcript overlay live-tail cache;
- key 还包含 `is_stream_continuation` 和 `animation_tick`;
- 如果 active cell 原地变化却不 bump revision,overlay 会显示 stale tail。

证据:

- `bump_active_cell_revision`:
  `codex-rs/tui/src/chatwidget/transcript.rs:57`
- `active_cell_transcript_key` 注释和实现:
  `codex-rs/tui/src/chatwidget.rs:1888`
- `active_cell_transcript_hyperlink_lines` 生成 active tail lines:
  `codex-rs/tui/src/chatwidget.rs:1918`

GUI v2 启发:

- committed transcript 和 active live tail 必须是不同状态区。
- active tail 需要显式 revision/cache key,让 React 组件和 memoization 知道何时刷新。
- replay/live 可以共用解释逻辑,但必须带来源标记控制副作用。
- GUI 不应把 `HistoryCell` / React node / rendered Markdown object 存为事实源;应存协议级或
  view-model 级 serializable data。

## Streaming 两区模型

TUI streaming 是 stable region + mutable tail:

- stable region 进入 scrollback commit queue;
- tail region 保持可变,显示在 active-cell slot;
- `raw_source` 在 active stream 生命周期内 append-only;
- `rendered_lines` 是当前 source 在当前 width 下的完整 render snapshot;
- `emitted_stable_len <= enqueued_stable_len <= rendered_lines.len()`;
- tail 从 `enqueued_stable_len` 精确开始。

证据:

- streaming controller 文件头注释:
  `codex-rs/tui/src/streaming/controller.rs:1`
- invariants:
  `codex-rs/tui/src/streaming/controller.rs:30`
- `StreamCore` 字段:
  `codex-rs/tui/src/streaming/controller.rs:73`

delta 处理不是简单 token append:

- 只有 newline-terminated source 能进入 `raw_source`;
- 追加 source 后重 render,再把新 stable lines 入队;
- 未完成行不能进入 stable/tail,避免短暂 malformed rendering;
- table streaming 有 holdback,因为新 row 可能改变已有列宽。

证据:

- newline-gated `push_delta`:
  `codex-rs/tui/src/streaming/controller.rs:122`
- current tail 从 `enqueued_stable_len` 开始:
  `codex-rs/tui/src/streaming/controller.rs:206`
- stable boundary 计算:
  `codex-rs/tui/src/streaming/controller.rs:321`
- table holdback:
  `codex-rs/tui/src/streaming/controller.rs:373`

GUI v2 启发:

- streaming delta 不能直接写入 committed transcript。
- active stream 必须保存 canonical raw source 和 mutable render tail。
- stable boundary 不能用“已经展示到屏幕”定义,否则会重复显示 queued-but-not-yet-committed 内容。
- Markdown/table/code 这类结构化内容需要 holdback 或等价策略,不能假设所有 delta 都是 append-only
  plain text。

## Finalize 与 canonicalization

TUI 在 stream finalize 时做 canonicalization:

- controller drain 剩余 source,从完整 raw source 重新 render;
- `StreamController::finalize()` 返回 transient cell 和 raw source;
- App 找到 transcript 尾部连续的 `AgentMessageCell` run;
- 用一个 source-backed `AgentMarkdownCell` 替换整段 transient cells;
- finalized cell 保存 raw markdown source 和 cwd,resize/display 时从 source 重渲染。

证据:

- `finalize_remaining` 从完整 raw source render:
  `codex-rs/tui/src/streaming/controller.rs:147`
- `StreamController::finalize()` 转移 raw source ownership:
  `codex-rs/tui/src/streaming/controller.rs:484`
- `handle_consolidate_agent_message` 替换尾部 streaming cells:
  `codex-rs/tui/src/app/agent_message_consolidation.rs:24`
- `AgentMarkdownCell` 是 source-backed:
  `codex-rs/tui/src/history_cell/messages.rs:332`
- `AgentMarkdownCell::display_hyperlink_lines` 从 source 重渲染:
  `codex-rs/tui/src/history_cell/messages.rs:368`
- `StreamingAgentTailCell` 是 transient active-tail 表示:
  `codex-rs/tui/src/history_cell/messages.rs:398`

GUI v2 启发:

- committed message 应保存 source-backed entry,而不是保存某次渲染后的 DOM/line wrapping。
- finalize 时必须把 active stream 归并成 committed entry。
- render width、viewport、Markdown renderer 变化时,committed entry 应从 source 重新派生 view。
- active stream controller finalize 后必须 reset,避免下一条 assistant answer 继承旧 source。

## 对 GUI v2 的建议约束

v2 总设计应把以下约束写成硬边界:

1. 输入层有界

   `eventBuffer` 只能是 bounded replay/debug tail。live notification 的 production path 不能从
   event tail 反复 fold。

2. 写路径有界

   Redux/Immer 下不能维护单个无限增长的 `turnViews[].messages[]`。committed transcript 应拆成
   bounded chunks,append 只修改最后一个小 chunk 或 active tail。

3. 读路径有界

   selector 不能返回完整巨大树。生产 UI 应按 stable ids 订阅:

   - `turnIds`;
   - `chunkIdsByTurnId`;
   - `entryChunkById`;
   - `activeEntriesByTurnId`;
   - global status / composer / runtime status。

4. 渲染路径有界

   React 组件应按 turn、chunk、active tail 拆分订阅和 memoization。长历史需要 virtualization 或
   windowing,否则 reducer/selector 优化后仍会在 DOM/render 上退化。

5. streaming 有 active tail

   streaming/running item 先进入 active tail。只有 finalize 后才进入 committed chunk。

6. source-backed finalized entry

   committed assistant/markdown entry 保存 canonical source,rendered view 是派生结果。

7. replay/live 分源

   replay 可以重建 baseline,但 replay 不能触发 live-only 副作用,也不能成为 steady-state render
   输入。

## 不应照搬的 TUI 设计

- 不照搬 `Box<dyn HistoryCell>`。GUI state 应是 serializable facts / view-model,不是 UI object。
- 不照搬 terminal scrollback、commit animation queue、terminal title、overlay 的具体实现。
- 不用 UI replay side effects 作为状态恢复机制。GUI 应通过 reducer/state snapshot 明确表达
  replay 后的状态。
- 不把 hook/token/tool activity 机械拼入 transcript tail。GUI v2 需要单独决定它们属于
  transcript、activity lane 还是 side panel。

## 后续设计问题

- v2 是否从单会话继续出发,但保留 per-thread store/channel shape?
- committed chunk size 初始值选 100 还是 200?
- active tail 覆盖哪些 item 类型:assistant streaming、running tool、hook、plan、reasoning?
- Markdown table/code holdback 在 GUI 第一版是否需要实现,还是先记录为 streaming 阶段约束?
- 是否保留 legacy `selectThreadTimelineMaterials` / `selectChatTextModel` 为 replay/debug/test-only,
  并禁止生产 UI 消费?
- 是否在 v2 总设计中要求 UI virtualization/windowing 作为进入长历史聊天 UI 前的前置条件?
