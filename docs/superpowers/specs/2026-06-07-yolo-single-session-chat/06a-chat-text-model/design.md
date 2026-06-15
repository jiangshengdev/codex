# Chat Text Model Design

## 目标

`06a Chat Text Model` 是纯 TypeScript / selector 阶段。它把 `05b Incremental Chat State Boundary` 已经物化的聊天状态派生成普通聊天界面可消费的纯文本 view model。

这一阶段只建立 model 边界，不渲染 React，不写 HTML/CSS，不替换 `App.tsx`，不实现 composer，不实现 Markdown，不展示 tool activity。

`06a` 完成后，`06b Plain Text Chat Shell` 可以只消费稳定的 chat text model，不需要直接解释 raw notification、`ThreadItem`、replay/live lifecycle、`snapshotTurns` 或 `eventBuffer`。

## 当前基线

旧 `06a` 设计从 `05 Live Event Handling` 的 timeline material 派生 model：

```text
selectThreadTimelineMaterials(state)
  = snapshotReplay materials
  + liveEventHandling materials
  + live subscription status material
```

这个路径会在 steady-state live path 中反复遍历 snapshot replay materials 和 runtime event buffer，和 TUI 的 active live path 不一致。

新的边界是：

```text
05b incrementalChatStateSlice
  -> selectIncrementalChatTurns(state)
  -> selectIncrementalChatGlobalStatus(state)
  -> 06a chat text model
```

`06a` 不能 import `TimelineMaterial`，不能调用 `selectThreadTimelineMaterials(state)`，也不能从 `snapshotTurns + eventBuffer` full fold。

## TUI 对齐依据

TUI 的 `ThreadEventStore` 保存 `turns`、`buffer`、`active_turn_id` 等 runtime material，并只在 notification 进入时维护 active turn。它不解释 item 内容。

TUI 的 item 解释和 transcript 物化发生在 `ChatWidget`：

- replay path 把 turn items 交给 `handle_thread_item`。
- live path 对普通 user / assistant 展示主要由 `ItemCompleted` 进入 `handle_thread_item`。
- live `ItemStarted` 主要用于 command、MCP、file change、web search、image generation、collab agent 等 activity 的 started 状态。

GUI 的 `05b` 是 `ChatWidget` 物化状态边界。`06a` 只是在该物化状态之上做展示模型投影，不再承担 replay/live item interpretation。

## 已确认决策

**决策 1：输入只来自 `05b` selectors**

`06a` 只消费 `05b` 导出的物化状态 selectors，例如：

```ts
selectIncrementalChatTurns(state)
selectIncrementalChatGlobalStatus(state)
```

`06a` 不读取旧 `projectionSlice`，不读取 `threadRuntimeSlice.snapshotTurns`，不读取 `threadRuntimeSlice.eventBuffer`，不调用 `selectThreadTimelineMaterials`。

**决策 2：输出 turn-grouped model**

`06a` 输出按 turn 分组的 model，而不是 flat entries 或 rich timeline model。

`06b` 可以消费 turn groups，但仍不直接解释 raw protocol state。

**决策 3：turn group 内只允许普通 message**

每个 turn group 内只放普通 user / assistant message。tool、reasoning、plan、file change 等非聊天 item 不进入 turn group。

第一版 turn group 内不产出 lifecycle status；如果后续需要 turn 内 status，必须在对应子设计或后续设计中重新确认。

**决策 4：manual reconnect 作为 turn 外全局 status**

`05b` 的 `subscriptionInterrupted` global status 进入 `06a` model，但不归属任何 turn group。

它表示 projection subscription 状态，不是某个 turn 或 item 的内容。

**决策 5：输出隐藏 normalized state 细节**

Turn group 使用 `turn.id`。Message entry 使用 `message.id`。Status entry 使用确定性 id。

UI 不消费 `turnsById`、`messagesById`、`messagesByTurnId`、`appliedEventIds` 等 `05b` 内部结构，也不消费 replay/live lifecycle。

## 推荐模型形状

实际命名可在实施时按项目局部习惯微调，但语义边界应保持如下：

```ts
type ChatTextModel = {
  turns: ChatTextTurn[];
  globalStatus: ChatTextGlobalStatus[];
};

type ChatTextTurn = {
  id: string;
  entries: ChatTextMessageEntry[];
};

type ChatTextMessageEntry = {
  type: "message";
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ChatTextGlobalStatus = {
  type: "status";
  id: string;
  status: "subscriptionInterrupted";
  text: string;
};
```

`06a` 可以保留 `buildChatTextModel(...)` 纯函数，但它的输入必须是 `05b` selector 输出，而不是 timeline materials。

推荐输入形状：

```ts
type ChatTextModelInput = {
  turns: IncrementalChatTurnView[];
  globalStatus: IncrementalChatGlobalStatus[];
};
```

## 数据流

```text
selectIncrementalChatTurns(state)
selectIncrementalChatGlobalStatus(state)
  -> buildChatTextModel(input)
     -> turns[] grouped by turn id
     -> message entries copied from materialized user/assistant messages
     -> globalStatus[] from materialized subscriptionInterrupted status
  -> selectChatTextModel(state)
```

建议模块保持：

```text
codex-gui/src/features/chatTextModel/chatTextModel.ts
codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

`chatTextModel.ts` 负责导出：

```ts
buildChatTextModel(input): ChatTextModel
selectChatTextModel(state): ChatTextModel
```

## Mapping 规则

### Turn group

`06a` 按 `05b` selector 返回的 turn 顺序输出 turn groups。

Turn group 顺序来自 `05b` 的 `turnOrder`，不按 timestamp 重新排序。

如果某个 turn 没有 messages，第一版可以保留空 turn group；是否隐藏空 turn 留给 `06b` 渲染设计决定。`06a` 不基于 raw lifecycle material 重建或删除 turn。

### Message entry

`06a` 直接读取 `05b` 已物化的 message：

- `role: "user"` 输出 user message。
- `role: "assistant"` 输出 assistant message。
- text 原样作为纯文本。
- text 为空的 message 正常情况下不应由 `05b` 生成；如果存在，`06a` 可以选择过滤，避免 UI 出现空消息。

`06a` 不再解析 `ThreadItem.userMessage.content` 或 `ThreadItem.agentMessage.text`。这些映射属于 `05b`。

### Manual reconnect

`05b` 的 `subscriptionInterrupted` 产出一个全局 status。文案应保持轻量，例如表达 “connection interrupted; reconnect required” 的含义。

Reason 可以保留在内部用于生成文案或测试，但不要求 `06b` 直接展示 raw reason。

## 非目标

- 不渲染 React。
- 不替换 `App.tsx`。
- 不写 CSS/Tailwind。
- 不发送 composer。
- 不处理中断。
- 不实现 Markdown。
- 不接入 streaming delta。
- 不实现 append/update message buffer。
- 不展示 tool activity。
- 不为非 text user input 设计占位 UI。
- 不实现 TUI 本地 prompt echo 去重；这属于 `07 Composer Turn Control`。
- 不解释 `ThreadItem`。
- 不读取 `snapshotTurns + eventBuffer`。
- 不消费 `TimelineMaterial`。

## 验收标准

- `selectChatTextModel(state)` 只从 `05b` incremental chat state selectors 派生。
- `06a` 不 import `liveEventHandling` 的 `TimelineMaterial`。
- `06a` 不调用 `selectThreadTimelineMaterials(state)`。
- `06a` 不读取 `threadRuntime.snapshotTurns` 或 `threadRuntime.eventBuffer`。
- `05b` 物化 user message 后，`06a` 输出 user message entry。
- `05b` 物化 assistant message 后，`06a` 输出 assistant message entry。
- Turn group 顺序遵循 `05b` selector 输出顺序。
- Turn 内 message 顺序遵循 `05b` selector 输出顺序。
- `subscriptionInterrupted` 产出 turn 外全局 status。
- 输出 model 不暴露 normalized state、replay/live lifecycle 或 protocol item payload 给 UI 消费。

## Focused Verification

建议 focused tests：

```text
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui run type-check
```

`06a` 是 docs/design 阶段时不运行测试。进入 implementation 后，只运行上述 focused tests，不扩大到全量测试。

## 后续阶段关系

`06b Plain Text Chat Shell` 消费 `ChatTextModel`，不直接解释 timeline material、normalized chat state 或 raw notification。

`06c App Integration And Browser Coverage` 把 `05b`、`06a` 和 `06b` 接入 `App.tsx` 并验证真实 App path。

`06d Basic Markdown Rendering` 才处理 Markdown parse、sanitize、链接和代码块展示。

`07 Composer Turn Control` 才处理 local submit、pending prompt、user message echo 去重和 Stop。

`08 Tool Activity` 才处理 command、MCP、file change、web search、image generation、collab agent 等非聊天 item。
