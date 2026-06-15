# Chat Text Model Design

## 目标

`06a Chat Text Model` 是纯 TypeScript / selector 阶段。它把 `05 Live Event Handling` 产出的 timeline material 派生成普通聊天界面可消费的纯文本 model。

这一阶段只建立 model 边界，不渲染 React，不写 HTML/CSS，不替换 `App.tsx`，不实现 composer，不实现 Markdown，不展示 tool activity。

`06a` 完成后，`06b Plain Text Chat Shell` 可以只消费稳定的 chat text model，不需要直接解释 raw timeline material、`ThreadItem` 或 replay/live lifecycle。

## 当前基线

`05` 已经提供：

```text
selectThreadTimelineMaterials(state)
  = snapshotReplay materials
  + liveEventHandling materials
  + live subscription status material
```

Timeline material 的当前来源：

- `snapshotReplay` 产出 replay `turnStarted`、`itemReplayed`、`turnCompleted`。
- `liveEventHandling` 产出 live `turnStarted`、`itemStarted`、`itemCompleted`、`turnCompleted`。
- `liveEventHandling` 也会在 subscription interrupted 时产出 `subscriptionInterrupted` material。

`06a` 只能消费这些已完成的 selector 输出。它不能读取旧 `projectionSlice`，不能修改 `threadRuntimeSlice`，不能改变 `snapshotReplay` 或 `liveEventHandling` 的语义。

## TUI 对齐依据

TUI 的 `ThreadEventStore` 保存 `turns`、`buffer`、`active_turn_id` 等 runtime material，并只在 notification 进入时维护 active turn。它不解释 item 内容。

TUI 的 item 解释发生在 `ChatWidget`：

- replay path 把 turn items 交给 `handle_thread_item`。
- live path 对普通 user / assistant 展示主要由 `ItemCompleted` 进入 `handle_thread_item`。
- live `ItemStarted` 主要用于 command、MCP、file change、web search、image generation、collab agent 等 activity 的 started 状态。

`06a` 是 GUI 侧对 `ChatWidget` 普通聊天解释边界的纯 selector 等价实现，但只覆盖纯文本 user / assistant 消息和轻量状态。

## 已确认决策

**决策 1：输出 turn-grouped model**

`06a` 输出按 turn 分组的 model，而不是 flat entries 或 rich timeline model。

`06b` 可以消费 turn groups，但仍不直接解释 raw timeline material。

**决策 2：turn group 内只允许 `message + status`**

每个 turn group 内只放普通 user / assistant message 和轻量 status。tool、reasoning、plan、file change 等非聊天 item 不进入 turn group。

**决策 3：只从 replay `itemReplayed` 和 live `itemCompleted` 产出 message**

`itemStarted` 不产出 user / assistant message。turn lifecycle 只用于建立或归属 turn group，以及必要的状态判断。

这保持了与 TUI 的边界一致：普通 user / assistant 内容在 item replay 或 completed 后进入聊天展示；started 状态留给后续 tool activity 或 streaming 阶段。

**决策 4：user 拼接所有 text input；assistant 使用完整 `agentMessage.text`**

`userMessage.content` 中所有 text input 按顺序拼接。非 text input 不进入 `06a` 纯文本内容。

`agentMessage.text` 原样作为纯文本展示内容。Markdown 语法不解析，留给 `06d Basic Markdown Rendering`。

**决策 5：暴露稳定业务 id，不暴露 lifecycle 细节**

Turn group 使用 `turn.id`。Message entry 使用 `item.id`。Status entry 使用确定性 id。

UI 不消费 `source`、`lifecycle`、`itemReplayed`、`itemCompleted` 等底层 timeline 细节。

**决策 6：静默忽略非聊天 item**

`plan`、`reasoning`、`commandExecution`、`fileChange`、`mcpToolCall`、`dynamicToolCall`、`collabAgentToolCall`、`webSearch`、`imageView`、`imageGeneration`、review mode 和 context compaction 等 item 都不产出 `06a` entry。

这些能力留给 `08 Tool Activity` 或后续专门阶段。

**决策 7：manual reconnect 作为 turn 外全局 status**

`subscriptionInterrupted` material 进入 `06a` model，但不归属任何 turn group。

它表示 projection subscription 状态，不是某个 turn 或 item 的内容。

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

第一版实际产出的 status 只有 turn 外的 `subscriptionInterrupted`。Turn group 内不产出 lifecycle status；如果后续需要 turn 内 status，必须在对应子设计或后续设计中重新确认。

## 数据流

```text
selectThreadTimelineMaterials(state)
  -> buildChatTextModel(materials)
     -> turns[] grouped by turn id
     -> message entries from itemReplayed / itemCompleted
     -> globalStatus[] from subscriptionInterrupted
  -> selectChatTextModel(state)
```

建议模块：

```text
codex-gui/src/features/chatTextModel/chatTextModel.ts
codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

`chatTextModel.ts` 负责导出：

```ts
buildChatTextModel(materials): ChatTextModel
selectChatTextModel(state): ChatTextModel
```

## Mapping 规则

### Turn group

`turnStarted` 可以建立 turn group。遇到 `itemReplayed` 或 `itemCompleted` 时，如果对应 turn group 尚不存在，可以按 `turnId` 创建 group，避免 model 因缺少 started material 而丢消息。

Turn group 顺序必须遵循 timeline material 顺序，不按 timestamp 重新排序。

### User message

当 item type 是 `userMessage`：

- 只读取 content 中的 text input。
- 多个 text input 按原顺序拼接。
- 非 text input 静默忽略。
- 如果拼接后的 text 为空，不产出 message entry。

`06a` 不处理 image、local image、mention、skill 的占位展示。

### Assistant message

当 item type 是 `agentMessage`：

- 读取完整 `agentMessage.text`。
- 原样作为纯文本。
- 如果 text 为空，不产出 message entry。
- `phase` 和 `memoryCitation` 不进入第一版 UI model。

### Item lifecycle

Replay:

- `itemReplayed(userMessage | agentMessage)` 产出 message entry。

Live:

- `itemCompleted(userMessage | agentMessage)` 产出 message entry。
- `itemStarted(userMessage | agentMessage)` 不产出 message entry。

Turn lifecycle:

- `turnStarted` / `turnCompleted` 不直接产出普通 message。
- 第一版只用于 turn group 建立和归属，不产出 turn 内 status。

### Manual reconnect

`subscriptionInterrupted` 产出一个全局 status。文案应保持轻量，例如表达“connection interrupted; reconnect required”的含义。

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

## 验收标准

- `selectChatTextModel(state)` 只从 `selectThreadTimelineMaterials(state)` 的下层事实派生。
- replay `itemReplayed(userMessage)` 产出 user message。
- replay `itemReplayed(agentMessage)` 产出 assistant message。
- live `itemCompleted(userMessage)` 产出 user message。
- live `itemCompleted(agentMessage)` 产出 assistant message。
- live `itemStarted(userMessage | agentMessage)` 不产出 message。
- 多段 user text input 按顺序拼接。
- 非 text user input 不进入纯文本 message。
- 非聊天 item 静默忽略。
- `subscriptionInterrupted` 产出 turn 外全局 status。
- 输出 model 不暴露 replay/live lifecycle 给 UI 消费。

## Focused Verification

建议 focused tests：

```text
pnpm --dir codex-gui exec vitest --run src/features/chatTextModel/__tests__/chatTextModel.test.ts
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

`06a` 是 docs/design 阶段时不运行测试。进入 implementation 后，只运行上述 focused tests，不扩大到全量测试。

## 后续阶段关系

`06b Plain Text Chat Shell` 消费 `ChatTextModel`，不直接解释 timeline material。

`06c App Integration And Browser Coverage` 把 `06a` 和 `06b` 接入 `App.tsx` 并验证真实 App path。

`06d Basic Markdown Rendering` 才处理 Markdown parse、sanitize、链接和代码块展示。

`07 Composer Turn Control` 才处理 local submit、pending prompt、user message echo 去重和 Stop。

`08 Tool Activity` 才处理 command、MCP、file change、web search、image generation、collab agent 等非聊天 item。
