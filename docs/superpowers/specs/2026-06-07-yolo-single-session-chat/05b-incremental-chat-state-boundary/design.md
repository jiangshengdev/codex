# Incremental Chat State Boundary Design

## 目标

`05b Incremental Chat State Boundary` 负责建立 GUI 侧等价于 TUI `ChatWidget` 的物化聊天状态边界。

这一层位于 `05 Live Event Handling` 之后、`06a Chat Text Model` 之前。它不渲染 React，不实现 composer，不解析 Markdown，不展示 tool activity UI；它只负责把 attach snapshot 初始化结果和 accepted live notification 按条 apply 成物化聊天状态。

`05b` 是 active chat surface 的事实边界。`06a/06b/06c` 不能再从 `snapshotReplay + liveEventHandling + eventBuffer` 每次 full fold 出聊天 UI。

## 已确认决策

**决策 1：active live path 按条 apply**

每条 accepted live notification 只 apply 一次到 `05b` 物化状态。一次 notification 更新只能处理该 notification 影响的 turn、item、message、status 或后续 tool activity placeholder。

禁止在 steady-state live path 中，每个 notification 到达后从 `snapshotTurns + eventBuffer` 全量重建聊天 view model。

**决策 2：`eventBuffer` 是 bounded replay/reconnect tail**

`threadRuntime.eventBuffer` 保留 replay/reconnect/debug/focused tests 所需的 accepted event tail。它不是 active chat surface 每次 render 或 selector 的事实源。

如果 `03` 当前实现还没有浏览器本地 cap，`05b` 实施计划必须明确补 cap 或把本地 cap 延后为单独阶段；但无论是否已有 cap，`eventBuffer` 都不能作为 `06a` 的 steady-state 输入。

**决策 3：`05` 保留为 material/debug 层**

`05 Live Event Handling` 可以保留 live material 类型和 replay/debug 组合 selector。`05b` 可以复用这些 material 类型或转换 helper，但 `05b` 的语义是 incremental reducer，不是 full timeline selector。

**决策 4：Redux slice + `extraReducers` 响应事件 action**

`05b` 使用 `incrementalChatStateSlice` 保存 serializable 物化状态。它通过 `extraReducers` 响应已经表示真实事件的 action，而不是为同一个 notification 连续 dispatch 多个 chat-specific setter action。

初始实现应响应：

- `threadRuntimeAttached`：清空旧 chat state，并从 attach snapshot turns rebuild baseline。
- `threadRuntimeEventBuffered`：按条 apply 当前 accepted live notification。
- `threadRuntimeManualReconnectRequired`：保留当前内容，并追加或更新全局 interrupted status。

这样一个 Redux action 表示一个真实事件，`threadRuntimeSlice` 和 `incrementalChatStateSlice` 分别更新自己的状态，符合 Redux Toolkit 的 event-style action 和多个 reducers 响应同一 action 的最佳实践。

`05b` 不用 listener middleware 驱动纯同步状态转移。listener middleware 只适合后续需要等待、取消、异步 workflow 或后台任务时再引入。

**决策 5：normalized + order arrays**

`05b` 内部使用 normalized state 和顺序数组，支持局部更新和稳定输出顺序：

```ts
type IncrementalChatState = {
  turnsById: Record<string, IncrementalChatTurn>;
  turnOrder: string[];
  messagesById: Record<string, IncrementalChatMessage>;
  messagesByTurnId: Record<string, string[]>;
  globalStatus: IncrementalChatGlobalStatus[];
  appliedEventIds: Record<string, true>;
};
```

第一版可以手写 normalized shape，不强制使用 `createEntityAdapter`。如果后续 turns/messages 操作增长，再考虑把部分集合迁移到 adapter。

**决策 6：第一版 rebuild 只发生在 attach / manual reconnect 后 attach**

第一版单会话 GUI 只在 `threadRuntimeAttached` 时从 snapshot turns 全量构建 baseline。手动重连成功后新的 attach 走同一 rebuild 逻辑。

live notification 到达后只按条 apply，不 replay `eventBuffer`。完整 TUI thread switch replay 语义留给未来多会话或 thread switch 阶段。

## 状态模型

推荐状态形状：

```ts
type IncrementalChatTurn = {
  id: string;
  status: "inProgress" | "completed" | "interrupted" | "failed";
};

type IncrementalChatMessage = {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  text: string;
};

type IncrementalChatGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: "commitChainMismatch" | "missingTurn" | "backpressure";
  subscriptionId: string | null;
};

type IncrementalChatState = {
  turnsById: Record<string, IncrementalChatTurn>;
  turnOrder: string[];
  messagesById: Record<string, IncrementalChatMessage>;
  messagesByTurnId: Record<string, string[]>;
  globalStatus: IncrementalChatGlobalStatus[];
  appliedEventIds: Record<string, true>;
};
```

字段含义：

- `turnsById` 保存已物化 turn 的最小状态。
- `turnOrder` 保存 turn 展示顺序。
- `messagesById` 保存普通 user/assistant 文本消息。
- `messagesByTurnId` 保存每个 turn 内 message 顺序。
- `globalStatus` 保存 turn 外全局状态，第一版只有 subscription interrupted。
- `appliedEventIds` 或等价 cursor 防止同一个 accepted live notification 被重复 apply。

如果 projection event 当前没有稳定 event id，实施计划必须定义一个确定性 apply key，例如 `subscriptionId + commitId`、`commitId` 或协议中已存在的等价唯一字段。不能用数组下标作为长期幂等 key，因为 reconnect/replay 后下标语义不稳定。

## 输入规则

### Attach Accepted

`threadRuntimeAttached` 表示 `02/03` 已经接受新的 attach snapshot，并替换 runtime baseline。

处理规则：

- 清空旧 `IncrementalChatState`。
- 按 snapshot turns 原始顺序建立 `turnsById` 和 `turnOrder`。
- 对每个 snapshot turn，按 `turn.items` 原始顺序处理已存在 item。
- `userMessage` 生成 user message。
- `agentMessage` 生成 assistant message。
- 非聊天 item 第一版静默忽略，留给 `08 Tool Activity`。
- 清空 `appliedEventIds`，因为新的 attach 是新的 baseline。
- 清空或重建 `globalStatus`；新的 attach 成功后不保留旧 interrupted status。

这是第一版唯一允许的全量 baseline rebuild 路径。

### Event Buffered

`threadRuntimeEventBuffered` 表示 `02/03` 已经接受一条 live event，并已把它写入 runtime buffer。

处理规则：

- 先计算 deterministic apply key。
- 如果 key 已存在于 `appliedEventIds`，忽略该 event。
- 否则按 event type 局部 apply，并记录 key。

具体行为：

- `turnStarted`：建立或更新对应 turn，状态设为 `inProgress`，必要时追加到 `turnOrder`。
- `itemStarted`：第一版普通聊天不生成 message。后续 `08` 可以用它建立 running tool activity。
- `itemCompleted`：如果 item 是 `userMessage` 或 `agentMessage`，局部追加或更新对应 message；非聊天 item 第一版忽略。
- `turnCompleted`：更新对应 turn 的 terminal status；如果 turn 不存在，可以建立最小 turn record 后更新状态。

同一 message id 再次到达时不得重复插入 `messagesByTurnId[turnId]`。如果协议允许同一 item id 的 completed event 重发，应更新 `messagesById[id]`，并保持原顺序。

### Manual Reconnect Required

`threadRuntimeManualReconnectRequired` 表示 projection baseline 已断裂或订阅因 backpressure 失效。

处理规则：

- 保留当前已物化内容。
- 追加或更新一个全局 `subscriptionInterrupted` status。
- 不清空 turns/messages。
- 不 replay `eventBuffer`。
- 新的 `threadRuntimeAttached` 才重建 baseline 并清除 interrupted status。

## Item Mapping

### User message

`userMessage.content` 中只读取 text input。

规则：

- 多个 text input 按原顺序拼接。
- 非 text input 静默忽略。
- 拼接后为空时不生成 message。
- `clientId` 暂不用于第一版去重；本地 prompt echo 去重留给 `07 Composer Turn Control`。

### Assistant message

`agentMessage.text` 原样作为纯文本内容。

规则：

- text 为空时不生成 message。
- Markdown 不解析，留给 `06d Basic Markdown Rendering`。
- `phase` 和 `memoryCitation` 第一版不进入 chat text state；若后续 UI 需要展示，再由对应阶段扩展。

### Non-chat items

以下 item 第一版不进入 `05b` 普通聊天 messages：

```text
hookPrompt
plan
reasoning
commandExecution
fileChange
mcpToolCall
dynamicToolCall
collabAgentToolCall
webSearch
imageView
imageGeneration
enteredReviewMode
exitedReviewMode
contextCompaction
```

它们留给 `08 Tool Activity` 或后续专门阶段。`05b` 可以保留必要 extension point，但不能提前设计完整 tool UI。

## Selectors

`05b` 应提供稳定 selectors，隐藏 normalized 内部结构：

```ts
selectIncrementalChatTurns(state): IncrementalChatTurnView[]
selectIncrementalChatGlobalStatus(state): IncrementalChatGlobalStatus[]
selectIncrementalChatIsInterrupted(state): boolean
```

推荐 turn view：

```ts
type IncrementalChatTurnView = {
  id: string;
  status: IncrementalChatTurn["status"];
  messages: IncrementalChatMessage[];
};
```

Selectors 可以按 `turnOrder` 和 `messagesByTurnId` 组装轻量 view，但不能读取 `snapshotTurns + eventBuffer` full fold。

`06a` 只能消费这些 selectors 或 `05b` 导出的等价 view builder，不能 import `liveEventHandling` 的 `TimelineMaterial` 作为长期输入。

## TUI Alignment

TUI 的 `ThreadEventStore` 保存可 replay 的材料；`ChatWidget` 保存物化 UI 状态。

GUI 对齐方式：

```text
threadRuntimeSlice ~= ThreadEventStore
incrementalChatStateSlice ~= ChatWidget materialized chat state
06a/06b ~= view model + React rendering
```

TUI live path 是 `handle_server_notification(notification, None)` 按条 mutate `ChatWidget`。GUI `05b` 的 `threadRuntimeEventBuffered` extra reducer 是浏览器/Redux 侧等价物。

TUI replay path 是重建 `ChatWidget` 后 replay snapshot turns 和 filtered buffered events。GUI 第一版只实现 attach/reconnect snapshot baseline rebuild；thread switch snapshot replay 留到未来范围扩大时再补。

## 非目标

- 不渲染 React。
- 不替换 `App.tsx`。
- 不写 CSS/Tailwind。
- 不发送 composer。
- 不处理中断按钮。
- 不实现 Markdown。
- 不接入 streaming delta。
- 不展示 tool activity UI。
- 不为非 text user input 设计占位 UI。
- 不实现 TUI 本地 prompt echo 去重。
- 不实现完整多会话 thread switch replay。
- 不引入 listener middleware 来驱动纯同步状态转移。

## 验收标准

- 新增 `incrementalChatStateSlice` 设计边界。
- slice state 是 serializable plain object/array，不使用 class instance、Map、Set 或 singleton。
- `threadRuntimeAttached` 可以从 snapshot turns rebuild baseline。
- `threadRuntimeEventBuffered` 可以按条 apply live notification。
- `threadRuntimeManualReconnectRequired` 可以保留内容并设置全局 interrupted status。
- 同一 accepted live notification 不会重复 apply。
- 同一 message id 不会重复插入同一个 turn。
- user/assistant message 能从 snapshot item 和 live `itemCompleted` 进入物化状态。
- live `itemStarted` 不生成普通聊天 message。
- 非聊天 item 第一版不生成普通聊天 message。
- selectors 从物化 state 生成轻量 view，不读取 `snapshotTurns + eventBuffer` full fold。
- `06a` 的设计和计划改为消费 `05b` selectors。

## Focused Verification

建议 focused tests：

```text
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
pnpm --dir codex-gui run type-check
```

`05b` 是 docs/design 阶段时不运行测试。进入 implementation 后，只运行上述 focused tests，不扩大到全量测试。

## 后续阶段关系

`06a Chat Text Model` 从 `05b` selectors 派生纯文本展示模型。

`06b Plain Text Chat Shell` 渲染 `06a` 输出，不直接解释 raw notification、timeline material 或 normalized chat state。

`07 Composer Turn Control` 才处理 local submit、pending prompt、user message echo 去重和 Stop。

`08 Tool Activity` 才解释 command、MCP、file change、web search、image generation、collab agent 等非聊天 item。
