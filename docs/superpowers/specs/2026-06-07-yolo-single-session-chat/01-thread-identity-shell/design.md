# Thread Identity Shell Design

## 目标

`01 Thread Identity Shell` 负责确认 GUI 当前连接的 thread 与 TUI `/gui`
启动时指定的 thread 是同一个 thread。

这一层只建立 identity gate。只有启动 URL 中的 `threadId` 与
`thread/projection/attach` snapshot 中的 `thread.id` 一致时，后续
projection ingress、thread runtime、snapshot replay、chat surface 和 composer
才能继续推进。

## 范围

这一层只处理三件事：

- 记录 `/gui` launch URL query string 中的 `threadId`。
- 记录 attach snapshot 中返回的 `thread.id`。
- 比较两者，产出 identity gate 状态。

这一层不处理消息、turns、items、runtime、replay、live event、chat view model、
composer、tool activity、reattach 或 streaming。

## 状态模型

状态保持最小三态：

```ts
type GuiThreadIdentityState = {
  launchThreadId: string | null;
  attachedThreadId: string | null;
  attachStatus: "none" | "attached" | "mismatch";
};
```

字段含义：

- `launchThreadId` 是启动 GUI 的 thread intent，来自 `/gui` URL query string
  中的 `threadId`。
- `attachedThreadId` 是后端实际 attach 到的 thread identity，来自
  `thread/projection/attach` snapshot 的 `thread.id`。
- `attachStatus` 是 identity gate 的结果，不表达 WebSocket、JSON-RPC 或
  attach request 生命周期。

状态转换：

```text
initial
  -> none
     when launchThreadId is known but no attach snapshot has been accepted yet

none
  -> attached
     when attachedThreadId equals launchThreadId

none
  -> mismatch
     when attachedThreadId is present and differs from launchThreadId
```

`pending`、`attachFailed`、`missingLaunchThreadId`、`reattaching` 等状态不属于
这一层。它们分别由 launch/client、projection ingress 或后续 reconnect 设计负责。

## 输入与输出

输入：

- `launchThreadId`：从 URL query string 读取的 `threadId`。
- `attachedThreadId`：从 attach snapshot 的 `thread.id` 读取。

输出：

- `GuiThreadIdentityState`。
- 一个可供后续层读取的 gate：只有 `attachStatus === "attached"` 时，后续层才能消费
  attach snapshot 并继续构建 runtime。

这一层不直接拥有 attach request，也不定义 retry、detach、reattach 行为。

## Mismatch 行为

`mismatch` 是硬阻塞状态。

进入 `mismatch` 后：

- 不自动切换到 `attachedThreadId`。
- 不自动 retry 当前 attach。
- 不自动 detach。
- 不自动 reattach。
- 不继续推进 projection ingress、runtime、replay、chat surface 或 composer。

这个选择保留 `/gui` launch URL 的权威性：用户从 TUI 打开的是某个明确的 primary
thread，GUI 不能在 identity 不一致时悄悄信任另一个 thread。

## 与相邻阶段的边界

`01` 位于 launch 参数读取之后、projection ingress 之前。

它只消费 attach snapshot 中的 thread identity，不消费 snapshot 的 turns、items、
commit id、subscription id 或其他 projection 内容。

相邻阶段边界：

- `02 Projection Ingress Adapter` 负责把 projection attach/event/closed 转成 runtime
  可消费的输入，并处理 commit-chain、missing turn、backpressure reattach 等协议逻辑。
- `03 Thread Runtime Store` 负责保存 session、turns、buffer、active turn 和 runtime
  状态。
- `05b Incremental Chat State Boundary` 才负责维护 prepared chat facts；`06 Basic Chat Surface`
  才负责把 prepared facts 推进为普通聊天 view model 和 UI。

因此，`01` 不能把 projection snapshot 直接当成 GUI 状态模型，也不能提前定义 chat UI
或 composer 行为。

## 验收标准

`01` 只验收 identity state 和 gate：

- URL `threadId` 能进入 `launchThreadId`。
- attach snapshot 的 `thread.id` 能进入 `attachedThreadId`。
- 两者一致时，`attachStatus` 为 `attached`。
- 两者不一致时，`attachStatus` 为 `mismatch`。
- `mismatch` 后，后续 runtime/chat/composer 层不会继续消费该 attach snapshot。

不在这一阶段验收：

- 历史消息显示。
- replay/live event 更新。
- composer 发送或中断。
- tool activity 展示。
- reattach 或 reconnect。
- 浏览器级 smoke。

## 设计原则

- TUI `/gui` 启动意图优先于 projection 返回内容。
- Projection attach 是 identity 输入，不是 GUI truth model。
- 这一层只做 gate，不做恢复。
- 状态必须小到可以独立实现、独立测试、独立回退。
