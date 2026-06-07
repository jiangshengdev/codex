# YOHO GUI Layered Foundation Model

## 目标

为 YOHO 风格 GUI 先建立可长期扩展的底层模型。第一阶段即使界面仍然不可见或只显示调试状态，也必须先把协议事实、运行时状态、聊天视图模型和 UI 控制状态分层清楚。

这个设计以 TUI 的线程模型为主要参考，但只继承底层结构和扩展边界，不复刻 TUI 的完整 transcript 表达、review 流程、approval UI 或多线程导航体验。

## 核心原则

- 地基优先：早期验收允许 UI 功能很少，但不允许把协议事实、派生视图和交互状态混在一起。
- TUI 对齐：底层层级参考 TUI 的 `Thread -> Turn -> ThreadItem`、thread event buffer、ChatWidget 派生 UI 三段式模型。
- 单会话约束：当前只支持 `/gui` 打开的 primary thread，但 store shape 必须保留按 `threadId` 扩展的能力。
- 派生优先：普通聊天消息、tool activity、状态行等 UI 数据从底层事实派生，不反向污染 projection store。
- 可重建：任何上层 view model 都应能从 projection snapshot 加连续 events 重新构建。
- 小步扩展：后续多会话、subagent、side conversation、approval、review 都应能新增层或字段，而不是推翻现有结构。

## 总体分层

GUI 底层分为四层：

1. Projection Store Layer
2. Thread Runtime Layer
3. Chat View Model Layer
4. UI Interaction Layer

前两层是地基。第一阶段应优先完成前两层和第三层的纯派生选择器，即使第四层只保留最小调试 UI。

## 1. Projection Store Layer

Projection Store Layer 保存 app-server projection 给出的协议事实。

职责：

- 保存 `thread/projection/attach` 返回的 snapshot。
- 应用连续的 `thread/projection/event`。
- 保存 projection lifecycle：`subscriptionId`、`headCommitId`、`reattach`、closed reason。
- 保存 `Thread -> Turn -> ThreadItem` 的可查询结构。
- 校验 commit chain，不连续时标记 reattach，不尝试猜测修复。

建议状态：

```ts
type ProjectionStoreState = {
  activeThreadId: string | null;
  projectionsByThreadId: Record<string, ProjectionLifecycle>;
  threadsById: Record<string, ThreadRecord>;
  turnIdsByThreadId: Record<string, string[]>;
  turnsById: Record<string, TurnRecord>;
  itemIdsByTurnId: Record<string, string[]>;
  itemsById: Record<string, ThreadItemRecord>;
};
```

当前虽然只允许单会话，但仍保留 `byThreadId` 形状。`activeThreadId` 是当前 GUI URL 绑定的 thread，不表示用户可在 GUI 内切换 thread。

非职责：

- 不保存聊天气泡颜色、展开状态、滚动位置。
- 不保存 Markdown 渲染结果。
- 不把 tool activity 摘要反写进 item。
- 不处理 composer draft。

## 2. Thread Runtime Layer

Thread Runtime Layer 保存当前 GUI 会话运行过程中的状态，参考 TUI 的 thread event channel 和 active thread 缓存，但第一版只服务一个 active thread。

职责：

- 保存 WebSocket 和 app-server handshake 状态。
- 保存当前 active thread 的运行状态：idle、running、interrupting、closed、error。
- 跟踪 active turn id。
- 处理 send/interrupt 请求的 pending 状态。
- 记录 projection 需要 reattach 或已经 closed 的恢复需求。
- 为未来多 thread runtime cache 预留 `byThreadId` 扩展点。

建议状态：

```ts
type ThreadRuntimeState = {
  activeThreadId: string | null;
  connection: GuiConnectionState;
  threadsById: Record<string, ThreadRuntimeRecord>;
};

type ThreadRuntimeRecord = {
  status: "idle" | "running" | "interrupting" | "closed" | "error";
  activeTurnId: string | null;
  pendingRequest: PendingThreadRequest | null;
  reattach: ReattachRequest | null;
  error: RuntimeError | null;
};
```

非职责：

- 不复制完整 turns/items。
- 不派生聊天消息。
- 不存储用户输入草稿。
- 不决定某个 `ThreadItem` 应如何展示。

## 3. Chat View Model Layer

Chat View Model Layer 从 Projection Store 派生普通聊天界面需要的显示模型。

职责：

- 从 `Thread -> Turn -> ThreadItem` 派生有序聊天块。
- 把 user item 映射为 user message。
- 把 assistant text item 映射为 assistant message。
- 把 command、MCP、dynamic tool、file change、web search、image 等 item 映射为 tool activity。
- 把 unknown item 映射为低噪声 fallback activity。
- 暴露当前 turn 是否正在输出、最后一个 assistant block 是否可继续合并等 UI 需要的派生信息。

建议模型：

```ts
type ChatBlock =
  | UserMessageBlock
  | AssistantMessageBlock
  | ToolActivityBlock
  | StatusBlock
  | UnknownActivityBlock;
```

这一层只做派生，不持久保存。未来如果渲染性能需要缓存，也应以 memoized selector 或 view-cache 形式存在，并保持可从底层重建。

非职责：

- 不执行 projection event。
- 不发送 turn 请求。
- 不保存展开状态。
- 不复制 TUI 的完整 transcript cell taxonomy。

## 4. UI Interaction Layer

UI Interaction Layer 保存浏览器界面自身的临时交互状态。

职责：

- Composer draft。
- 发送按钮和 Stop 按钮的可用状态。
- tool activity 展开/收起状态。
- 滚动锚点、是否 stick-to-bottom。
- 错误 toast、局部 loading 和短期提示。

建议状态：

```ts
type UiInteractionState = {
  composer: ComposerState;
  expandedActivityIds: Record<string, boolean>;
  scroll: ChatScrollState;
  transientErrors: UiError[];
};
```

这层可以直接服务 React 组件，但不得成为协议事实来源。刷新页面后丢失这层状态是可接受的。

## 层间数据流

启动：

1. URL 提供 `threadId` 和 launch token。
2. GUI 完成 `gui/authenticate`。
3. GUI 完成 `initialize`。
4. GUI 发送 `thread/projection/attach`。
5. Projection Store 保存 snapshot。
6. Thread Runtime 标记 attached/idle 或 running。
7. Chat View Model 从 projection 派生初始聊天块。

增量更新：

1. app-server 发送 `thread/projection/event`。
2. Projection Store 校验 subscription 和 commit chain。
3. 事件连续时更新 turn/item/head commit。
4. Thread Runtime 根据 turn started/completed 更新 active turn。
5. Chat View Model 自动重新派生。

异常：

1. commit chain 不连续时，Projection Store 标记 `reattach`。
2. projection closed 时，Thread Runtime 标记 thread closed 或需要 reattach。
3. UI 可以展示短错误或刷新提示，但不能自己拼接缺失事件。

## 和 TUI 的对应关系

| GUI 层 | TUI 参考 | 继承内容 | 不继承内容 |
| --- | --- | --- | --- |
| Projection Store Layer | app-server `Thread -> Turn -> ThreadItem` | 协议事实、事件连续性、projection lifecycle | TUI history cell |
| Thread Runtime Layer | `ThreadEventStore`、`thread_event_channels`、`active_thread_id` | active thread、active turn、event lifecycle、replay 边界 | 多 thread 切换 UI、side thread 导航 |
| Chat View Model Layer | `ChatWidget` 事件消费和 history 派生 | 从事件派生可视内容 | 完整 transcript renderer |
| UI Interaction Layer | bottom pane、composer input state | draft、send/interrupt、局部交互 | TUI keymap、slash popup、approval modal |

## 初期验收

第一阶段的验收不要求聊天 UI 完整可见。最低验收是：

- projection snapshot 能进入规范化 store。
- 连续 projection event 能更新 store。
- commit mismatch 能标记 reattach。
- projection closed 能进入 runtime 状态。
- active turn 能从 turn started/completed 派生。
- chat blocks selector 能从已有 history 派生 user/assistant/tool fallback 三类块。
- UI 可以仍然只显示调试状态，但不能绕过上述 store 和 selector。

## 后续拆分

这个 `00` 文档只定义多层模型和边界。后续设计应在同一目录继续拆分：

- `01-projection-store-layer.md`
- `02-thread-runtime-layer.md`
- `03-chat-view-model-layer.md`
- `04-ui-interaction-layer.md`
- `05-foundation-verification-plan.md`

每一层设计都应先说明和 TUI 的对应关系，再说明当前单会话范围内要实现的最小子集。
