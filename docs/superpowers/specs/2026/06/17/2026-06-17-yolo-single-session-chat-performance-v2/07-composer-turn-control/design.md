# Composer Turn Control 设计

日期: 2026-06-19
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI 的纯文本 composer、发送按钮和终止当前 turn 控制

## 目标

本设计定义 Performance v2 的 composer turn control 边界: 在现有单会话 GUI 中支持纯文本输入、
`Send` 按钮和 `Stop` 按钮, 让用户可以启动一个新的 turn, 也可以中断当前 active turn。

第一版只覆盖最小可用控制面:

- 纯文本多行输入;
- 空闲时通过 `turn/start` 发送输入;
- running 时禁用发送, 只允许通过 `turn/interrupt` 中断当前 active turn;
- 发送和中断失败通过 HeroUI Toast 做轻量反馈;
- transcript 内容仍只来自 projection / transcript state, 不做 optimistic message。

本设计不是实施计划, 不定义任务顺序、checkbox、测试命令或提交策略。

## 与既有设计的关系

本设计建立在以下边界之上:

- `00-overall-design.md` 定义 Performance v2 的有界输入、写入、读取和渲染总目标;
- `02-committed-transcript-state-cleanup-design.md` 定义 committed transcript facts owner;
- `03-committed-transcript-surface-design.md` 定义 committed transcript React surface;
- `04a-heroui-chat-shell-design.md` 定义 HeroUI page shell 和 committed transcript 可见 UI。

`CommittedTranscriptSurface` 仍是只读 committed transcript surface。Composer 不应放入
`CommittedTranscriptSurface`, 也不应让 committed transcript surface 负责拼 JSON-RPC 请求或管理输入
草稿。Composer 应作为 App shell 中与 transcript 并列的操作区挂载。

本设计不改变 projection protocol、不改变 transcript facts owner、不引入 active tail streaming UI,
也不要求实现 virtualization。

## 已确认决策

1. 第一版只支持纯文本多行 textarea。
2. `Enter` 发送, `Shift+Enter` 插入换行。
3. `trim()` 后为空时禁用 `Send`, `Enter` 不提交。
4. 有 `activeTurnId` 时禁用 `Send`, 只允许 `Stop`。
5. `Stop` = 调用 `turn/interrupt` 中断当前 active turn。
6. `turn/start` 成功后清空草稿; 失败时保留草稿并显示 Toast。
7. `turn/start` pending 时禁用重复发送和 `Enter` 提交, 不显示 loading/spinner。
8. `Stop` 只由 active turn 和连接可用性决定, 不受发送 pending 状态影响。
9. `Stop` 失败按可恢复竞态处理, 显示 Toast, 不作为 fatal host error。
10. 未 attach、thread mismatch、manual reconnect required 或 WebSocket error 时禁用输入、`Send` 和
    `Stop`, 并保留草稿。
11. 不做 optimistic user message。消息列表只由 projection / transcript state 更新。
12. Composer 草稿、发送中和局部错误状态先放组件本地 state, 不进入 Redux。
13. JSON-RPC 请求由 `guiHostClient` 拥有, UI 不直接 `socket.send`。
14. 第一版按钮文案使用英文 `Send` / `Stop`, 后续再接本地化。

## 协议契约

### 发送纯文本

GUI 发送纯文本时调用 `turn/start`:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "turn/start",
  "params": {
    "threadId": "thread-abc",
    "clientUserMessageId": null,
    "input": [
      {
        "type": "text",
        "text": "Hello",
        "text_elements": []
      }
    ]
  }
}
```

`UserInput` 的 plain text wire 形态使用 `text_elements`, 不是 `textElements`。虽然 Rust
deserialize 对 `text_elements` 有 default, 生成 TypeScript 类型要求显式提供数组, 因此 GUI 应始终
发送 `text_elements: []`。

第一版不调用 `turn/steer`, 不在 running turn 中追加输入, 不做本地队列。

### 中断当前 turn

GUI 中断当前 turn 时调用 `turn/interrupt`:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "turn/interrupt",
  "params": {
    "threadId": "thread-abc",
    "turnId": "turn-1"
  }
}
```

`turnId` 必须来自当前 projection/runtime state 的 `activeTurnId`。如果 active turn 已经完成, interrupt
失败属于正常竞态, UI 应显示轻量 Toast 并等待 projection 状态收敛。

`turn/start` 和 `turn/interrupt` 已经在 GUI host client request allowlist 中。实现不需要开放
`turn/steer`。

## GUI host client 边界

当前 `guiHostClient` 只覆盖 launch token、WebSocket 连接、`gui/authenticate`、`initialize` 和
`thread/projection/attach`。它使用固定 request id 处理握手, 并把任何 JSON-RPC error 都当成 terminal
host error。

Composer 需要把这个边界扩展为可复用 command API:

```ts
type GuiHostCommands = {
  startTurn(params: TurnStartParams): Promise<TurnStartResponse>;
  interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse>;
};
```

`guiHostClient` 应继续拥有:

- WebSocket 生命周期;
- JSON-RPC request id 分配;
- pending request map;
- response / error matching;
- socket close cleanup 时 reject pending requests;
- malformed protocol message 的 terminal error 处理;
- projection notification 分发。

业务 RPC error 不应自动关闭 WebSocket。`turn/start` 或 `turn/interrupt` 的 request error 应 reject 对应
Promise, 由 composer 显示 Toast。握手阶段的 authenticate / initialize / attach error 仍可以保持
terminal host error。

## Composer 状态与启用规则

Composer 读取 Redux 中已有 runtime / identity facts, 但不拥有这些事实:

- `selectCanAdvanceThreadIdentity`: attach status 必须为 `attached`;
- `selectThreadRuntimeRecord`: 提供当前 `threadId`;
- `selectThreadRuntimeActiveTurnId`: 判断 running 状态和 `Stop` 目标;
- `selectThreadRuntimeSubscription`: `manualReconnectRequired` 时禁用操作。

派生状态:

```ts
const isConnectionUsable =
  canAdvanceThreadIdentity &&
  runtime != null &&
  runtime.subscription.state === "active" &&
  guiHostStatus.label !== "error" &&
  guiHostStatus.label !== "closed";

const hasActiveTurn = activeTurnId != null;
const hasSendableDraft = draft.trim().length > 0;

const canEdit = isConnectionUsable;
const canSend = isConnectionUsable && !hasActiveTurn && hasSendableDraft && !isSending;
const canStop = isConnectionUsable && hasActiveTurn;
```

`draft` 和 `isSending` 是 composer 组件本地 state。发送失败时保留 `draft`; 发送成功后清空
`draft`; 用户编辑草稿不需要写 Redux。

## UI 形态

Composer 固定在 viewport 底部, 页面主体使用 window/page 滚动。消息列表不能变成局部
`overflow-y-auto` 容器。主内容底部必须预留空间, 避免最后一条 committed message 被固定 composer 遮挡。

布局:

```text
Composer
  -> TextArea 全宽
  -> action row
      -> Stop
      -> Send
```

TextArea:

```tsx
<TextArea fullWidth placeholder="Message Codex" variant="secondary" />
```

`TextArea` 放在 HeroUI `Surface` 语境中时使用 `variant="secondary"`。连接不可用时 disabled。running 时
仍允许编辑草稿, 但 `Send` 禁用。

按钮:

```tsx
<Button variant="outline">Send</Button>
<Button variant="danger-soft">Stop</Button>
```

本地 HeroUI Button 文档当前只列出 `primary | secondary | tertiary | outline | ghost | danger`。
实施前必须用安装包 TypeScript 类型或本地组件源码确认 `danger-soft` 是否有效。若本地包不支持
`danger-soft`, 实施应回到设计层确认替代方案, 不能擅自改依赖或锁文件。

## 键盘行为

`Enter` 在满足 `canSend` 时触发发送。`Shift+Enter` 插入换行。`Enter` 在以下状态不提交:

- `draft.trim()` 为空;
- 当前存在 `activeTurnId`;
- `turn/start` pending;
- 连接不可用;
- textarea disabled。

键盘提交和点击 `Send` 必须共用同一条 submit path, 避免行为分叉。

## 错误处理

发送失败:

- 保留草稿;
- 清除 `isSending`;
- 显示 HeroUI `toast.danger("Message failed to send", { description })`;
- 不写入 transcript state;
- 不关闭 WebSocket。

Stop 失败:

- 视为可恢复竞态;
- 显示 HeroUI `toast.danger("Stop failed", { description })`;
- 不写入 transcript state;
- 不重试 interrupt;
- 不清空草稿。

Toast:

```tsx
<Toast.Provider placement="top center" />
```

使用 HeroUI 默认 timeout。Toast 只承载临时反馈, 不成为 runtime 或 transcript facts。

## 数据流

```text
User input
  -> Composer 本地 draft
  -> 点击 Send / Enter
  -> guiHostClient.startTurn(...)
  -> app-server turn/start
  -> projection event(s)
  -> threadRuntime / transcriptState
  -> CommittedTranscriptSurface
```

```text
Stop click
  -> 从 threadRuntime 读取 activeTurnId
  -> guiHostClient.interruptTurn(...)
  -> app-server turn/interrupt
  -> projection event(s)
  -> turn 完成时 threadRuntime 清除 activeTurnId
  -> 如果 projection 提供 committed status, transcriptState 同步更新
```

Composer 不合成 transcript entry。Projection 仍是屏幕上 transcript 内容的唯一事实来源。

## 测试契约

测试应验证用户可见行为和协议 payload, 不验证 HeroUI 内部 DOM 或内部 class。

`guiHostClient` 测试应覆盖:

- handshake 之后分配 request id;
- `startTurn` 发送 method `turn/start`, params 包含 `threadId`、`clientUserMessageId` 和纯文本 input;
- `interruptTurn` 发送 method `turn/interrupt`, params 包含 `threadId` 和 `turnId`;
- 业务 JSON-RPC error 只 reject 匹配的 command Promise, 不关闭 socket;
- terminal handshake / malformed protocol error 仍暴露为 host error;
- cleanup reject pending command requests。

Composer browser 测试应覆盖:

- 未 attach / 连接不可用时禁用 TextArea、`Send` 和 `Stop`;
- 已 attach、idle 且草稿非空时启用 `Send`;
- 只有空白字符的 draft 禁用 `Send` 和 `Enter` submit;
- `Enter` 提交, `Shift+Enter` 插入换行;
- `turn/start` pending 时禁用重复 `Send` 和 `Enter`;
- send 成功后清空 draft;
- send 失败后保留 draft 并显示 Toast;
- active turn 禁用 `Send` 并启用 `Stop`;
- stop 失败后显示 Toast, 不清空 draft;
- manual reconnect required 时禁用 composer 操作。

App / e2e 测试应覆盖:

- Composer 挂载在 App shell 中, 且不重新引入旧 `GUI host` debug panel;
- 在真实 browser route 中点击 `Send` 会发送 `turn/start` JSON-RPC request;
- 收到 active turn projection 之后点击 `Stop` 会发送 `turn/interrupt` JSON-RPC request;
- transcript rendering 仍来自 projection events, 不是 optimistic local messages。

## 不变量

本设计完成后应满足:

- Composer 不读取或 materialize 完整 transcript tree;
- `CommittedTranscriptSurface` 保持只读 committed transcript 边界;
- `threadRuntime` 继续拥有 active turn 和 subscription facts, 不拥有草稿;
- `transcriptState` 不记录 composer draft、pending send 或 Toast error;
- UI 不直接拼 `socket.send` JSON-RPC;
- `turn/start` failure 不丢用户输入;
- `turn/interrupt` failure 不变成 fatal host error;
- running 时不走 `turn/steer`、不排队、不 optimistic append;
- page/window 是 transcript 滚动容器, 不是局部 message list 滚动容器;
- 不新增依赖, 不修改 lockfile。

## 非目标

- 不支持富输入、图片、附件、mention、skill 或 slash command。
- 不支持 running turn 中继续发送或 steer。
- 不支持本地输入队列。
- 不支持 optimistic message 或 pending message bubble。
- 不设计 connection error banner、loading skeleton 或 reconnect UI。
- 不实现 active tail streaming UI。
- 不设计本地化系统接入; 第一版文案保持 `Send` / `Stop` / `Message Codex`。
