# Codex GUI Projection Design

日期：2026-05-02

## 背景

GUI 的目标不是替代 TUI，而是作为从 TUI 启动的 companion surface。用户仍然从当前命令行
环境启动 Codex，TUI 保持终端交互、输入、approval 和复杂控制；GUI 负责更适合图形界面的
观察与切换。

当前 `port/lazy-projections` 分支已经实现 app-server 侧的 active projection 基础：

- `thread/projection/attach` 返回 snapshot、`projectionInstanceId` 和 `latestSequence`。
- `thread/projection/event` 为已 attach 的连接推送结构性投影事件。
- projection event 按 `threadId`、`projectionInstanceId` 和 `sequence` 约束顺序。

因此 GUI 第一阶段应直接建立在 projection 接口上，而不是读取 TUI render state。

## 目标

- 在 TUI 中通过 `/gui` 打开浏览器 GUI。
- GUI 通过 WebSocket 直接连接 app-server。
- GUI 第一阶段只消费 projection 接口。
- GUI 默认打开主代理 thread，不跟随 TUI 当前所在子代理。
- GUI 的 tab 以 `threadId` 为主键。
- 同一时间只有一个 tab 处于 active projection attach 状态。
- GUI 切换 active tab 不改变 TUI 当前视图。
- 非 active tab 不持续获取完整实时 projection。
- 切回 tab 时先重新 attach，用 snapshot 覆盖本地状态。

## 非目标

第一阶段不实现以下内容：

- GUI 输入用户需求。
- GUI approval 或权限控制。
- `item/agentMessage/delta`、reasoning delta、command output delta 等 streaming delta。
- pending request 的 live projection update。
- runtime status 的 live projection update。
- inactive tab 的 sequence catch-up append。
- Electron/Tauri host。
- 独立 GUI SDK。

## 架构

TUI、GUI 和 app-server 的边界如下：

```text
TUI
  ├─ owns terminal UX
  ├─ handles /gui
  ├─ ensures app-server WebSocket is available
  └─ opens browser GUI URL

Browser GUI
  ├─ owns selected thread/tab state
  ├─ connects directly to app-server WebSocket
  ├─ calls thread/projection/attach for the active thread
  └─ renders projection timeline

App Server
  ├─ owns thread state
  ├─ owns projection state
  ├─ owns projection subscriptions
  └─ emits JSON-RPC notifications
```

TUI 不是 GUI 的数据转发层。GUI 和 TUI 是同一个 app-server session 的两个客户端，各自维护
自己的 UI selection。

## 入口

第一阶段 `/gui` 永远默认打开主代理 thread。即使 TUI 当前处于某个子代理视图，GUI 也不
跟随 TUI 当前 view。

后续可以扩展但第一阶段不实现：

- `/gui --current`：打开 TUI 当前 thread。
- `/gui <threadId>`：打开指定 thread，用于调试或高级入口。

`/gui` 由 TUI 确保 app-server WebSocket 可用。如果当前 session 没有可连接的 WS listener，
TUI 负责启动或打开一个本地 listener，然后把 GUI URL 打开到浏览器。

## 前端位置

GUI 前端放在 monorepo 根目录：

```text
codex-gui/
```

它是正式的 Web GUI core，不是 TUI 内部 HTML 片段。未来如需 Electron/Tauri，桌面 shell
应复用这套 Web GUI，而不是重写 GUI core。

## 通信

GUI 使用 app-server WebSocket JSON-RPC，不使用 HTTP/SSE 作为主通道。

前端不复用现有 `sdk/typescript` 或 `sdk/python` 作为主客户端。GUI 自己实现轻量：

- `AppServerWsClient`：管理 WS、JSON-RPC request id、response promise、notification 分发。
- `ProjectionClient`：封装 `thread/projection/attach`、`thread/projection/detach` 和 projection
  event 处理。

类型来源使用 app-server protocol 的 generated TypeScript schema：

```text
codex-rs/app-server-protocol/schema/typescript
```

这样 GUI 类型跟随 app-server 协议生成物，而不被现有 SDK 的高层抽象限制。

## Projection Attach 模型

GUI 同一时间只 attach 一个 active thread：

```ts
type GuiWorkspaceState = {
  availableTabs: GuiTabSummary[];
  selectedThreadId: string | null;
  activeProjection: ActiveProjection | null;
};

type GuiTabSummary = {
  threadId: string;
  title: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  status: "idle" | "running" | "needsAttention" | "done" | "unknown";
};

type ActiveProjection = {
  threadId: string;
  thread: Thread;
  pendingRequests: ServerRequest[];
  runtimeStatus: ThreadStatus;
  projectionInstanceId: string;
  latestSequence: bigint;
};
```

切换 tab 的流程：

```text
old active tab
  -> thread/projection/detach(oldThreadId)

new active tab
  -> thread/projection/attach(newThreadId)
  -> replace activeProjection with attach snapshot
  -> apply later thread/projection/event notifications
```

`thread/projection/detach` 用于取消旧 active thread 的 projection 订阅。它只移除当前
WebSocket connection 对指定 thread 的 projection subscriber，不关闭连接、不清空其他连接的
订阅，也不卸载 thread。响应状态用于区分 `detached`、`notSubscribed` 和 `notLoaded`。

GUI 的 projection 生命周期不复用 `thread/unsubscribe`。`thread/unsubscribe` 只表示当前
connection 退出普通 turn/item event stream；它不会清理 `thread/projection/attach` 建立的
projection subscriber。GUI 的 `ProjectionClient` 必须在以下场景主动调用
`thread/projection/detach`：

- active tab 从旧 thread 切换到新 thread 前。
- active projection tab 被关闭或不再显示时。
- GUI WebSocket 正常关闭或组件 unmount 时，如果仍有 active projection。

如果浏览器崩溃、网络中断或 WebSocket 异常关闭，app-server 的 connection cleanup 负责兜底移除
该 connection 的 projection subscribers。这个兜底不改变客户端正常路径：正常路径仍应显式
detach，避免旧 active thread 因 projection subscriber 残留而继续接收 projection events 或保活。

## Tab 列表

首版 GUI 只有主代理一个 tab，不调用 tab 发现 API。

里程碑阶段的 tab 列表来源使用 app-server 轻量 API，例如：

```text
thread/children/list
```

这个接口可以先只返回空列表或主代理相关的最小数据，但边界要放在 app-server，而不是让 GUI
从 mixed notifications 中猜测子代理关系。

tab 的身份是 `threadId`。`agentNickname`、`agentRole`、thread title 等只作为显示元数据。

## Event 处理

GUI 第一阶段只消费：

```text
thread/projection/attach
thread/projection/detach
thread/projection/event
```

对 projection event 的处理规则：

- `threadId` 必须等于当前 `activeProjection.threadId`。
- `projectionInstanceId` 必须匹配当前 active projection。
- `sequence` 必须等于当前 `latestSequence + 1`。
- 应用事件后更新 `latestSequence`。
- 收到 `projectionReset` 后自动重新 attach 当前 active thread。
- instance 不匹配或检测到 gap 时，第一阶段直接重新 attach。

重新 attach 的语义是用 response snapshot 覆盖本地 durable state。第一阶段不做旧状态合并。

## UI

首版 UI 使用 timeline，而不是 raw JSON viewer，也不仿 TUI 完整 chat。

timeline 只渲染 projection 已覆盖的结构内容：

- turns
- item started
- item completed
- turn completed
- thread metadata update
- projection reset 后的刷新状态

因为第一阶段不消费 streaming delta，GUI 不承诺 token-by-token 文本流。只有 projection snapshot
或 projection event 中已包含的 item 内容会显示。

## 后续演进

后续按以下方向扩展：

- `thread/children/list` 返回真实子代理 thread summary。
- inactive tab 显示轻量 summary，但不 attach 完整 projection。
- 增加按 sequence 追赶的 projection event log，例如 `afterSequence`。
- pending request 和 runtime status 进入 projection event。
- streaming delta 作为独立 live overlay 接入 active tab。
- GUI 增加输入、approval 和控制能力。
- Electron/Tauri 作为可选 host，复用同一套 Web GUI。

## 测试策略

第一阶段实现时需要覆盖：

- `/gui` 默认选择主代理 thread，而不是 TUI 当前子代理。
- TUI 能确保 app-server WS 可用并打开 GUI URL。
- `thread/projection/detach` 能移除指定 connection 对指定 thread 的订阅。
- GUI client 能 initialize、attach、detach，并按 projection sequence 应用事件。
- tab 切换时旧 projection 被 detach，新 projection 由 attach snapshot 覆盖。
- `projectionReset` 触发自动 reattach。

如果改动 app-server v2 API，需要更新 README、schema fixtures，并运行 app-server protocol 相关测试。
