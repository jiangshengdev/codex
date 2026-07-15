# Codex GUI Transport Session 与 Handshake Owner 设计

状态：待确认

## 唯一主目标

在保持现有公开 callbacks、成功状态序列、RPC 方法与参数、command 结果语义、projection handoff 和各终止路径可观察顺序不变的前提下，为 GUI host 连接建立明确的 `TransportSession`、`HandshakeController` 与 `CommandGateway` 三个 owner，移除握手阶段对全局 request ID `1/2/3` 的隐式依赖。

## 背景与根因

重构审计 B02 / `RA-02-002` 已确认，当前 `startGuiHostConnection` 在同一个闭包内同时拥有：

- WebSocket 创建、事件绑定、发送、关闭与 cleanup；
- 全局 request ID 分配、pending response correlation 与 pending rejection；
- `gui/authenticate -> initialize -> thread/projection/attach` 握手推进；
- `connecting -> authenticated -> initialized -> attached` 的公开状态；
- commands ready 门禁、`turn/start` / `turn/interrupt` 请求和 commands invalidation；
- decoded message 的 response、error 与 projection notification 路由；
- terminal error 单调性和不同终止路径的 callback 顺序。

当前 pending request 只记录 `terminalOnError`、`resolve` 和 `reject`。它不记录请求方法或握手阶段。握手响应完成 correlation 后，连接函数再次检查全局 request ID：

- request ID `1` 被解释为 authenticate；
- request ID `2` 被解释为 initialize；
- request ID `3` 被解释为 projection attach。

因此，握手阶段不是由握手 owner 的显式控制流表达，而是由“连接建立后前三个请求恰好是三个握手请求”这一共享计数器不变量表达。transport、handshake 与 commands 虽然共享同一个连接生命周期，但变化原因不同：transport 关心连接和请求资源，handshake 关心阶段顺序与终端失败，commands 关心 attach 后可用和 session 失效后不可用。将这些状态继续保留在同一个闭包中，会使任何握手步骤、请求行为或 teardown 调整都必须同时推理其他两类职责。

本设计不把现状描述为已复现的乱序响应 bug。现有测试没有覆盖 duplicate、out-of-order 或 stale handshake response；本设计解决的是 owner 和状态表达问题，并对这些响应建立明确语义。

## 设计目标

- `TransportSession` 独立拥有 socket、request ID、pending request correlation、pending rejection、关闭和 transport cleanup。
- `HandshakeController` 以 Promise 完成顺序显式拥有 authenticate、initialize、attach 三个阶段，不读取或推断具体 request ID。
- `CommandGateway` 独立拥有 attach 后的 readiness 门禁、两个 command 方法和永久 invalidation。
- `startGuiHostConnection` 保持唯一公开入口，并收缩为三个 owner 的 facade 与生命周期编排者。
- facade 继续统一拥有 `GuiHostStatus`、terminal status 单调性、公开 callback 顺序和 projection notification routing。
- decoded response 只有在当前存在对应 pending request 时才由 transport correlation 消费；未关联、重复、乱序或迟到的 response 不推进握手并被忽略。
- owner 内部必须能区分 correlated RPC error、本地 send failure 与 session unavailable/invalidation，避免把不同 request failure 统一解释为 handshake terminal error；该区分不改变现有 Error 文本或公开 Promise 的 resolve/reject 行为。
- 保持 handshake RPC error 与 command RPC error 的终端性差异。
- 保持 cleanup、socket error、socket close、protocol error 下 pending rejection、commands invalidation 和 status 的现有可观察行为。
- 继续复用现有 `parseRpcMessage` 与 projection guards，不改变它们的 runtime validation 或 trust 保证。

## 非目标与排除边界

### B01 browser launch owner

本设计继续使用 B01 已建立的 `consumeBrowserLaunchParams` 与 `BrowserLaunchParams`。不移动或改变：

- `threadId` / token 解析；
- token storage 与刷新恢复；
- fragment 清理；
- `onLaunchParams` 在 WebSocket 创建前同步触发的顺序；
- browser launch owner 的类型和依赖方向。

### B03 runtime validation/trust boundary

本设计允许继续调用当前 `parseRpcMessage`、`isThreadProjectionAttachResponse`、`isThreadProjectionEventNotification`、`isThreadProjectionDeltaNotification` 和 `isThreadProjectionClosedNotification`，但不改变：

- JSON-RPC envelope 的解析严格度；
- guards 实际检查的字段范围；
- guards 声明的 generated protocol 类型；
- command success payload 的 runtime trust；
- malformed payload 的错误文本与关闭策略；
- generated `@codex-protocol/v2` wire types。

是否完整验证 generated types、是否返回收窄 DTO、如何处理 malformed command success response，均属于 B03，不能借 B02 owner 拆分提前处理。

### 下游应用边界

本设计不修改：

- `GuiHostConnectionBridge` 的 Redux dispatch 与 projection application coordination；
- projection attach/event/delta/closed 进入下游后的处理；
- snapshot replay、thread runtime、Redux state shape 或 action；
- Transcript State、timeline、rendering、scroll 或 Composer UI；
- React state、AppShell 状态展示或 reconnect 语义；
- Rust GUI host、app-server API、RPC method、wire shape 或服务端行为。

本设计也不新增通用 event bus、跨 feature `shared/common/utils`、统一 lifecycle framework 或第四个 `ProtocolRouter` owner。

## 已确认总体架构

`startGuiHostConnection` 保持现有公开签名和 cleanup 返回值，内部组合三个 instance-scoped owner：

```text
browser launch params
        |
        v
startGuiHostConnection facade
  |        |               |
  |        |               +--> CommandGateway
  |        +------------------> HandshakeController
  +---------------------------> TransportSession
  |
  +--> GuiHostStatus / public callbacks
  +--> projection notification guards and forwarding
```

依赖方向固定为：

```text
HandshakeController ----request----> TransportSession
CommandGateway ---------request----> TransportSession

startGuiHostConnection facade
  -> constructs and coordinates all three owners
  -> receives transport lifecycle events
  -> receives handshake milestones or terminal failures
  -> activates and invalidates CommandGateway
  -> routes decoded projection notifications
```

三个 owner 都不依赖 React、Redux、Bridge、projection coordinator 或 UI。`TransportSession` 不依赖 `HandshakeController` 或 `CommandGateway`；后两者只能通过 transport 暴露的 request/lifecycle 能力工作。

## Owner 职责与接口语义

本节只定义设计级契约，不规定具体文件拆分、类名导出范围、迁移顺序或代码实现形式。

### TransportSession

`TransportSession` 唯一拥有：

- 一个 WebSocket instance 及其 event handlers；
- 单调递增的 request ID 分配；
- pending request map；
- JSON-RPC request 序列化和 `socket.send`；
- decoded response 与 pending request 的 correlation；
- transport 失效时拒绝全部 pending requests；
- socket close 请求、handler 解绑和幂等 cleanup；
- transport 是否仍可发送 request 的内部状态。

它提供的语义能力包括：

- 发送一个 method/params request，并返回只由对应 response 完成的 Promise；
- 对匹配 pending ID 的 decoded response 完成 correlation；
- 对匹配 response 中的 JSON-RPC error 拒绝对应 Promise；
- 在 owner 内部保留 request failure 的来源语义，使调用者能区分 correlated RPC error、本地 `socket.send` failure 与 session unavailable/invalidation；
- 在 socket error、socket close、protocol termination 或 cleanup 时，以现有错误 `GUI host WebSocket is not available` 拒绝仍 pending 的请求；
- 通知 facade socket open、socket error、socket close 与 transport invalidation；
- 将 parse 后但未被 pending response correlation 消费的 decoded message 交还 facade。

`TransportSession` 不拥有：

- authenticate、initialize 或 attach 阶段；
- “某个 RPC error 是否应关闭连接”的 handshake/command policy；
- `GuiHostStatus` 或 terminal error 单调性；
- commands readiness 或公开 commands callbacks；
- projection method、payload guards 或 projection callbacks；
- B03 runtime validation/trust 调整。

response correlation 规则为：

- 只有数字 ID 且 ID 当前存在于 pending map 的 response 才能完成 request；
- correlation 完成时先从 pending map 删除该 entry，确保同一 request 只完成一次；
- 同一 ID 的后续 duplicate response 已不再关联，不能再次 resolve、reject 或推进阶段；
- 尚未发送对应 request 的 out-of-order response 不关联，不能预先推进阶段；
- cleanup 或终止后到达的 stale response 不关联，也不能恢复已失效 session；
- 未关联 response 交还 facade 后按本设计忽略；只有带受支持 `method` 的 notification 继续进入 notification routing。

该规则是本设计对 duplicate、out-of-order 和 stale handshake response 的明确语义。它替代当前按固定 ID 再次解释阶段的偶然行为，但不新增 protocol error 或关闭状态。

request failure 的内部来源语义必须至少表达以下三类事实，但本设计不规定具体 TypeScript union、class 或 Error subclass：

- correlated RPC error：当前 pending request 收到匹配 ID 的 JSON-RPC error response；公开 Promise 继续以当前构造的 JSON-RPC `Error` reject；
- local send failure：`socket.send` 在 request 建立时抛错；公开 Promise 继续以当前 Error 或 `GUI host WebSocket is not available` reject；
- session unavailable/invalidation：request 发起时 session 已不可用，或 pending request 因 error、close、protocol termination、cleanup 被统一拒绝；公开 Promise 继续以 `GUI host WebSocket is not available` reject。

该来源信息只服务 owner 之间的内部 policy 选择，不能改变调用方看到的 Promise 值、错误文本或 stack-independent 行为，也不能泄漏为新的公开 GUI host API。

### HandshakeController

`HandshakeController` 唯一拥有：

- `gui/authenticate -> initialize -> thread/projection/attach` 的显式顺序；
- 各阶段的 request 参数；
- 当前握手是否仍 active/completed/failed 的内部状态；
- authenticate result、initialize result 与 attach result 的现有阶段成功条件；
- 将阶段 milestone 和 attach response 报告给 facade；
- 将 handshake RPC error 或现有 handshake payload error 报告为 terminal failure。

它通过 `TransportSession.request` 顺序等待每个阶段，不读取 request ID，也不假设握手请求一定占用 ID `1/2/3`。阶段推进只发生在当前 await 的 request Promise 成功完成后：

1. socket open 后发送 `gui/authenticate`，参数继续为 `{ token }`；
2. result 满足现有 `authenticated === true` 条件后报告 authenticated milestone；
3. 发送 `initialize`，参数继续为现有 `clientInfo` 与空 `capabilities`；
4. result 继续满足现有“存在 result payload”条件后报告 initialized milestone；
5. 发送 `thread/projection/attach`，参数继续为 `{ threadId }`；
6. result 继续通过现有 attach guard 后报告 attach response 和 attached milestone；
7. attach 成功后握手完成，不再接受任何 response 作为阶段输入。

`HandshakeController` 可以调用现有 attach guard，或由 facade 向其提供等价的现有验证能力；无论具体装配形式如何，B02 都不得改变 guard 的实现、保证范围或错误文本。

Handshake request 的 correlated JSON-RPC error 继续是 terminal failure。initialize 无 result、attach 无 result和 attach malformed result 继续使用现有错误文本与 close reason。

HandshakeController 必须按 transport 保留的内部 failure 来源选择 policy：

- 只有 correlated handshake RPC error 被转换为新的 handshake terminal failure；
- local send failure 的 rejection 继续由 handshake 内部消费，不发 status、不主动 close，握手不再推进；
- session unavailable/invalidation 表示 facade 已经因 socket error、close、protocol termination 或 cleanup 处理生命周期，HandshakeController 只停止推进，不重复发 error、不重复 close、不重复 invalidation。

这些差异不改变 handshake request Promise 的现有 Error 文本和 reject 行为。局部 send failure 的鲁棒性如需改善，必须单独设计。

`HandshakeController` 不拥有 socket handler、pending map、公开 status callback、commands ready callback 或 projection notification routing。

### CommandGateway

`CommandGateway` 唯一拥有：

- attach 成功前 commands 不可用的 readiness 门禁；
- `startTurn` 到 `turn/start` 的 method/params 映射；
- `interruptTurn` 到 `turn/interrupt` 的 method/params 映射；
- session 终止或 cleanup 后的永久 invalidation；
- 旧 `GuiHostCommands` handle 在 invalidation 后拒绝新调用的语义。

facade 只在 attach 已成功后 activate gateway，并把同一个 `GuiHostCommands` handle 交给 `onCommandsReady`。gateway 通过 `TransportSession.request` 发 command；command JSON-RPC error 只拒绝对应 Promise，不关闭 socket、不发 terminal status，也不使其他 commands 自动失效。

gateway 一旦 invalidated，在该 connection instance 中不能再次 activate。失效后：

- 新 command 调用拒绝 `GUI host WebSocket is not available`；
- 已 pending command 由 transport invalidation 拒绝同一错误；
- `onCommandsUnavailable` 只在 gateway 曾经 ready 时触发一次；
- 未完成 attach 的连接终止时不触发 `onCommandsUnavailable`；
- stale transport callback 或 response 不能使旧 gateway 复活。

`CommandGateway` 不拥有 `GuiHostStatus`、socket close、projection routing 或 handshake 阶段。

### startGuiHostConnection facade

facade 继续拥有公开 API 和跨 owner 编排：

- 消费 B01 launch params，并在创建 WebSocket 前同步调用 `onLaunchParams`；
- 创建 socket、transport、handshake 与 command gateway；
- 统一发出 `GuiHostStatus`；
- 保持 terminal error 后非 error status 被抑制，同时不新增 error status 去重；
- 在 socket open 时启动一次 handshake；
- 将握手 milestones 映射为 authenticated、initialized、attached status；
- 在 attach response callback 后发 attached status，再 activate commands 并调用 `onCommandsReady`；
- 将 transport 未消费的 decoded notification 按现有 method 和 guards 路由；
- 将 malformed message、malformed projection payload 和 handshake terminal failure 转成现有 protocol termination；
- 按终止来源保持 status、commands invalidation、pending rejection 与 close 的现有顺序；
- 编排幂等 cleanup，并抑制 cleanup 后的 socket callbacks 与 status。

facade 是公开 `GuiHostStatus` 的唯一 owner。TransportSession 和 HandshakeController 只报告事实或 milestone，不直接调用 `onStatus`。这样 terminal error 单调性、clean close 抑制和 callback 顺序不需要跨 owner 竞争。这里的“单调性”只表示 error 后不再降级为 authenticated、initialized、attached 或 closed；它不表示 error callback 去重。现有生命周期若先触发 socket error、随后又触发 abnormal close，后续 error status 仍可继续发出，B02 不对多个 error 做归一化或合并。

## Inbound message 分层

socket message 的分层固定为：

```text
WebSocket message
  -> existing parseRpcMessage
       -> parse failure: facade protocol termination
       -> decoded RpcMessage
            -> TransportSession correlates a currently pending response
                 -> matched: settle exactly one request Promise
                 -> unmatched: return message to facade
            -> facade
                 -> unmatched response: ignore
                 -> supported projection notification: existing guard + callback
                 -> malformed supported notification: protocol termination
                 -> other decoded message: preserve current no-op boundary unless it carries
                    an existing terminal error shape not covered by a correlated request
```

TransportSession 不识别 projection method，也不调用 projection guards。facade 不读取 transport 的 pending map，也不使用 response ID 推断握手阶段。

对于 correlated error，transport 只拒绝 request Promise，并保留其“correlated RPC error”来源。其终端性由调用者决定：HandshakeController 将 correlated handshake RPC error 报告为 terminal；CommandGateway 仅把 rejection 返回给 command caller。local send failure 与 session invalidation 不能因同样表现为 Promise rejection 而被 HandshakeController 误判为新的 terminal RPC error。

对于数字 ID 的未关联 response，包括 duplicate、out-of-order 和 stale response，facade 直接忽略，不再按 ID 进入握手分支。无 ID 的现有 error envelope 仍按现有 terminal protocol error 路径处理；本设计不借“忽略迟到 response”扩大为忽略所有非 request 错误消息。

## 完整成功数据流

```text
startGuiHostConnection
  -> consumeBrowserLaunchParams
  -> onLaunchParams
  -> create WebSocket and three owners
  -> facade emits connecting

socket open
  -> TransportSession reports open
  -> facade starts HandshakeController once

HandshakeController
  -> request gui/authenticate
  -> TransportSession correlates current response
  -> authenticated result accepted
  -> facade emits authenticated
  -> request initialize
  -> TransportSession correlates current response
  -> initialize result accepted
  -> facade emits initialized
  -> request thread/projection/attach
  -> TransportSession correlates current response
  -> existing attach guard accepts result
  -> facade calls onProjectionAttached
  -> facade emits attached
  -> facade activates CommandGateway
  -> facade calls onCommandsReady

later projection notification
  -> parseRpcMessage
  -> not a pending response
  -> facade selects existing method branch
  -> existing guard validates current accepted shape
  -> matching projection callback

later command
  -> ready CommandGateway
  -> TransportSession request
  -> correlated success result
  -> command Promise resolves with current asserted generated response type
```

成功 status 顺序必须保持：

`connecting -> authenticated -> initialized -> attached`

attach 完成时的 callback 顺序必须保持：

`onProjectionAttached -> attached status -> onCommandsReady`

本设计不增加额外公开 status，也不把 commands ready 表达为新的 status。

## 错误、关闭与 cleanup 数据流

### Handshake JSON-RPC error

```text
correlated handshake response contains error
  -> TransportSession rejects current handshake Promise
     and preserves correlated RPC error as the internal failure source
  -> HandshakeController reports terminal failure
  -> facade emits error
  -> facade invalidates session
       -> TransportSession rejects all remaining pending requests
       -> CommandGateway becomes unavailable if it was ready
  -> facade requests clean socket close with existing reason
  -> later clean close cannot replace terminal error
```

握手通常发生在 commands ready 前，因此该路径通常不调用 `onCommandsUnavailable`。若生命周期竞态使 gateway 已 ready，仍按 protocol error 的既有顺序先发 error，再 unavailable。

### Handshake result payload error

authenticate 未满足现有成功条件时不新增 B02 专属错误；保持当前不推进的边界。initialize 无 result、attach 无 result或 attach guard 失败时：

```text
HandshakeController detects existing invalid result condition
  -> facade emits existing error message
  -> invalidate pending requests and ready commands
  -> close code 1000 with existing close reason
  -> suppress later closed status because terminal error is already set
```

### Command JSON-RPC error

```text
correlated command response contains error
  -> TransportSession rejects only that command Promise
  -> CommandGateway forwards rejection
  -> no socket close
  -> no status change
  -> gateway remains ready
```

### Malformed JSON 或 projection payload

```text
parseRpcMessage throws, or an existing projection guard rejects
  -> facade emits error first
  -> TransportSession rejects pending requests
  -> CommandGateway invalidates and onCommandsUnavailable fires if ready
  -> facade closes socket with code 1000 and existing reason
  -> later clean close cannot overwrite error
```

该路径明确保持现有 protocol error 顺序：先 terminal status，后 commands unavailable。

### Socket error

```text
TransportSession receives socket error
  -> reject all pending requests
  -> invalidate CommandGateway and call onCommandsUnavailable if ready
  -> facade emits GUI host WebSocket failed error
  -> later clean close cannot overwrite error
```

该路径明确保持现有顺序：先 commands unavailable，后 error status。

### Socket close

```text
TransportSession receives socket close
  -> reject all pending requests
  -> invalidate CommandGateway and call onCommandsUnavailable if ready
  -> code 1000: facade emits closed unless terminal error already exists
  -> other code: facade emits existing close error text
```

该路径明确保持现有顺序：先 commands unavailable，后 closed/error status。

### Cleanup

```text
public cleanup called
  -> facade marks connection disposed
  -> repeated cleanup becomes no-op
  -> TransportSession rejects all pending requests
  -> CommandGateway invalidates and calls onCommandsUnavailable if it was ready
  -> detach socket handlers
  -> close code 1000 with reason cleanup
  -> do not emit closed or error status
  -> ignore later socket callbacks and messages
```

cleanup 前未 ready 时不调用 `onCommandsUnavailable`。cleanup 后旧 commands handle 永久不可用。cleanup 继续是同步、幂等的公开函数。

### Handshake request 的本地发送失败与 session invalidation

```text
local socket.send failure
  -> TransportSession rejects the request with the existing public Error behavior
  -> HandshakeController consumes the rejection internally
  -> no status, no close, no additional invalidation
  -> handshake does not advance

session unavailable or invalidated
  -> TransportSession rejects or has already rejected the request
  -> HandshakeController stops
  -> facade-owned socket error / close / protocol / cleanup path remains the sole lifecycle report
  -> no duplicate error, close, or commands invalidation from HandshakeController
```

## Status 与 callback 顺序不变量

facade 维护两个独立概念：

- disposed：cleanup 已发生，后续 status 和 socket callback 全部被抑制；
- terminal error：已发出 error，后续 authenticated、initialized、attached 或 closed 不得覆盖它；后续 error 本身不被该规则抑制或去重。

因此，terminal error gate 只过滤非 error status。socket error 后又收到 abnormal close 等现有事件序列仍可能产生后续 error callback；B02 不改变其次数、文本或顺序，也不引入“只发一次 error”的新不变量。

不同终止来源不统一重排，逐路径保持现有顺序：

| 路径 | 对外顺序 |
| --- | --- |
| protocol / handshake terminal error | `error status -> pending rejection / commands unavailable -> socket close` |
| socket error | `pending rejection / commands unavailable -> error status` |
| clean socket close | `pending rejection / commands unavailable -> closed status` |
| abnormal socket close | `pending rejection / commands unavailable -> error status` |
| cleanup | `pending rejection / commands unavailable -> detach / close`，不发 status |

`onCommandsUnavailable` 继续只表示一个曾经 ready 的 gateway 变为不可用，不表示握手前连接失败，也不替代 Bridge 自身 cleanup 中的 `setCommands(null)`。

## 重复、乱序与迟到 response 语义

已确认采用“只有当前 pending request 可消费 response”的方案：

- authenticate response 只有在 authenticate request 仍 pending 时才能完成该 Promise；
- initialize response 只有在 initialize request 已发送且仍 pending 时才能完成该 Promise；
- attach response 只有在 attach request 已发送且仍 pending 时才能完成该 Promise；
- 提前到达的 ID、已完成 ID 的重复 response、cleanup/close 后迟到的 response 均被忽略；
- 被忽略的 response 不发 status、不调用 projection callbacks、不启用 commands，也不关闭 socket；
- 后续真正匹配当前 pending request 的 response 仍可正常推进；
- request ID 仍可作为 transport correlation key，但不再具有 handshake stage 语义。

这是一项窄行为澄清：不保留当前按字面 ID `1/2/3` 可能重复推进的偶然行为，也不采用“乱序即终端协议错误”的更严格策略。runtime protocol trust 的其他部分仍不改变。

## 兼容性矩阵

| 场景 | 当前对外行为 | 设计后要求 |
| --- | --- | --- |
| launch params 成功 | `onLaunchParams` 同步发生在 WebSocket 创建前 | 完全保持 |
| 成功握手 | authenticate、initialize、attach 顺序发送；status 依次推进 | 完全保持，不依赖固定 ID |
| attach 成功 | attached callback 后发 attached status，再 commands ready | 完全保持 |
| projection notification | 现有 parser/guard 接受后转发对应 callback | 完全保持 |
| handshake RPC error | error、pending rejection、clean close；不继续阶段 | 完全保持 |
| command RPC error | 只拒绝该 command，不关闭、不改 status | 完全保持 |
| malformed JSON | `Malformed JSON-RPC message`，code 1000 / `invalid message` | 完全保持 |
| malformed attach | 既有错误文本，code 1000 / `protocol error` | 完全保持 |
| malformed projection notification | 既有错误文本；error 后 commands unavailable，再 close | 完全保持 |
| socket error | pending rejection与 unavailable 后发 WebSocket failed error | 完全保持 |
| clean socket close | pending rejection与 unavailable 后发 closed | 完全保持 |
| abnormal socket close | pending rejection与 unavailable 后发既有 close error 文本 | 完全保持 |
| cleanup | pending rejection、必要时 unavailable、解绑并 clean close；无新 status | 完全保持 |
| terminal error 后 clean close | 最终 status 仍为 error | 完全保持 |
| socket error 后 abnormal close | 两个入口均可继续发 error；不以 terminal gate 去重 | 完全保持，不归一化 |
| cleanup 后 callback | 不再推进 status 或握手 | 完全保持 |
| duplicate handshake response | 当前可能因固定 ID 再次进入阶段分支 | 明确忽略，不重复推进 |
| out-of-order future-stage response | 当前可能被固定 ID 解释为尚未开始的阶段 | 明确忽略，不提前推进 |
| stale response after invalidation | 当前受共享状态和 handler 时机影响 | 明确忽略，不恢复 session |
| command success runtime payload | 通过现有泛型断言返回 generated response type | 保持；留给 B03 |

## 测试策略

本设计阶段不运行测试。后续计划应以现有 GUI host Node tests 为基础，增加最小的新行为覆盖；不需要 UI snapshot，因为 B02 不改变用户可见 UI 文案或布局。

### Owner 与握手测试

- 完整成功路径仍只发送 authenticate、initialize、attach，且 method/params 不变；
- 在握手请求之间插入额外非握手 request 或改变实际 request ID 后，阶段仍按 Promise 完成顺序推进；
- status 仍为 `connecting -> authenticated -> initialized -> attached`；
- attach callback、attached status、commands ready 的顺序保持；
- duplicate authenticate/initialize/attach response 不重复发 status、不重复发送下一阶段、不重复调用 attach 或 commands ready；
- initialize/attach response 在对应 request 发送前到达时被忽略，后续当前 response 可正常推进；
- local send failure 的 rejection 被 handshake 内部消费，不发 status、不 close；
- socket error、close、protocol termination 或 cleanup 引起的 session invalidation 只停止 handshake，不由 HandshakeController 重复发终止状态或 close；
- cleanup、socket error或close 后的 stale response 不推进阶段。

### TransportSession 测试

- request ID 单调分配，response 只完成匹配 pending request；
- correlated success resolve 对应 Promise；
- correlated JSON-RPC error reject 对应 Promise；
- 内部能区分 correlated RPC error、本地 send failure 和 session unavailable/invalidation，但公开 Promise 的 Error 文本与 reject 行为不变；
- unmatched numeric response 不完成其他 request，并交给 facade 后被忽略；
- socket error、socket close、protocol invalidation 和 cleanup 拒绝全部 pending requests；
- cleanup 幂等、解绑 handlers、仅请求一次有效 close；
- send throw 保持当前 request rejection 语义，不借 B02 新增终止状态；session invalidation 也不被 handshake 二次终端化。

### CommandGateway 测试

- attach 前 command 不可用；
- ready 后 `turn/start`、`turn/interrupt` method、params、结果保持；
- command RPC error 非终端，gateway 仍 ready；
- cleanup、socket error、socket close 和 protocol error 拒绝 pending command；
- gateway 曾 ready 时 `onCommandsUnavailable` 只触发一次；
- gateway 未 ready 时不触发 unavailable；
- 失效后的旧 commands handle 拒绝新调用且不能复活。

### Facade 与错误顺序测试

- malformed JSON 和四类 malformed projection payload 继续使用既有错误文本和 close reason；
- protocol error 保持 `error -> unavailable`；
- socket error/close 保持 `unavailable -> terminal status`；
- terminal error 后 clean close 不覆盖 error；
- socket error 后 abnormal close 等后续 error 不被新增 gate 去重或合并；
- cleanup 不新增 status，并抑制后续 callbacks；
- projection notification 继续由 facade 使用现有 guards 转发，不由 transport 识别。

### 排除边界验证

- `guiHostProtocol.ts` guards 与 parser 无语义修改；
- generated protocol files 无变更；
- Bridge、Redux、projection coordinator 与 UI 无行为修改；
- browser launch owner 无修改；
- 不新增通用 protocol router、event bus 或跨 feature shared abstraction。

## 风险与控制

### 终止竞态导致重复 callback

拆成三个 owner 后，socket error、close、protocol termination 与 cleanup 可能从不同入口到达。若没有 facade 级 disposed/terminal gate，可能重复 unavailable 或让 clean close 覆盖 error；若把 gate 误实现为“error 只发一次”，又会改变 socket error 后 abnormal close 等现有多 error 序列。

控制：公开 status 和 callback 顺序继续由 facade 唯一编排；gateway invalidation 与 cleanup 必须幂等；terminal error gate 只抑制后续非 error status，不负责 error 去重。

### Promise rejection 分类改变终端性

若 transport 自己决定所有 JSON-RPC error 都关闭连接，会错误地把 command error 变成 terminal；若 HandshakeController 把所有 request rejection 都终端化，又会把 local send failure 和既有 session invalidation 错误地转换为新的 error/close；若全部当作普通 rejection，则会丢失 correlated handshake RPC error 的 terminal policy。

控制：transport 只 correlation 与 reject，同时在内部保留 failure 来源；HandshakeController 只终端化 correlated handshake RPC error，CommandGateway 保持 command rejection 语义，session invalidation 不被二次报告。具体类型表达留给 implementation plan。

### 不小心扩大 B03

owner 拆分可能诱使实现同时重写 `RpcMessage`、guards 或 command result validation，扩大 diff 和行为风险。

控制：B02 继续复用现有 parser/guards 和错误文本；validation/trust 的任何调整必须留在独立 B03 设计、计划与验收中。

### 迟到 response 被误路由为 notification

若 transport 将未关联 response 交给 facade，而 facade 仍按 ID 推进握手，固定 ID 耦合会以新形式保留。

控制：facade 只按受支持 `method` 路由 notification；数字 ID 的未关联 response 明确忽略。

### 旧 commands handle 复活

若 readiness 仍是 facade 与 gateway 各自维护的布尔值，close 后的迟到 attach callback 可能再次 ready。

控制：CommandGateway 拥有单向状态，invalidated 为永久终态；facade disposed/terminal 后不接受握手 milestone。

### 局部 send failure 的既有停滞行为

当前 handshake request 的本地 send throw 会 reject Promise，但连接函数吞掉 rejection，不主动发 status 或 close。直接把所有 handshake rejection 终端化会产生未批准的行为变化；同理，transport 因 session invalidation 拒绝 pending request 后，HandshakeController 再发一次 terminal error 也会重复生命周期报告。

控制：B02 要求内部区分三类 failure 并增加 characterization；local send failure 由 handshake 内部消费，session invalidation 只停止 handshake，若要改善 send failure 的公开行为应单独确认设计。

### 拆分造成过多公开 API

为测试方便导出所有内部 owner，可能扩大 feature API surface，并让下游绕过 facade。

控制：owner 应保持 feature-private；外部继续只使用 `startGuiHostConnection`、`GuiHostStatus`、`GuiHostCommands`、options 和 cleanup。

## 已排除的替代方案

### 单一 GuiHostSession class

曾考虑由一个 `GuiHostSession` class 包含 transport、handshake 和 commands 三个内部区域。该方案能减少文件或对象数量，但生命周期状态仍由同一个 owner 持有，职责隔离主要依赖代码排版，无法消除修改握手时同时理解 transport 与 commands 的问题，因此不采用。

### 保留闭包，仅抽取 request 和 handshake helper

该方案改动最小，但 pending map、request counter、commands readiness、terminal state 和 cleanup 仍由闭包共享；固定 ID 耦合容易变成 helper 之间的隐含约定，因此不采用。

### TransportSession 同时路由 notification

该方案把所有 socket message 处理集中在 transport，但会让 transport 知道 projection method、payload guards 和 application callbacks，重新混入 protocol/application 职责，因此不采用。

### 新增独立 ProtocolRouter

第四个 owner 可以更彻底分离 message routing，但会提前决定 B03 decoder/validation 的边界，扩大 B02 范围。当前 facade 已能承担有限的 notification routing，因此不采用。

### status 分散给各 owner

曾考虑由 HandshakeController 发阶段 status、TransportSession 发关闭 status。该方案需要跨 owner 协调 terminal error、clean close 抑制和 callback 顺序，容易重复或覆盖，因此不采用。

### 统一所有终止路径的 callback 顺序

统一为“先 unavailable 后 status”或“先 status 后 unavailable”都能简化模型，但会改变至少一类现有路径的外部可观察顺序。本设计逐路径保持现状，顺序统一如有价值应作为独立行为变更处理。

### 将乱序或重复 response 视为终端协议错误

该方案边界严格，但会新增 error status 和 socket close，并进入 B03 protocol policy 范围。当前没有证据要求如此严格，因此不采用。

### 保持固定 request ID 的偶然行为

机械保留 ID `1/2/3` 可以降低短期迁移差异，但会保留 B02 的根因，使 transport request counter 继续承担 handshake state machine 职责，因此不采用。

## 验收标准

- `startGuiHostConnection` 仍是唯一 production 连接入口，公开 types、options、callbacks 和 cleanup 形状不变。
- `TransportSession`、`HandshakeController`、`CommandGateway` 三个 owner 的状态与职责边界在实现中可独立辨认。
- handshake 阶段推进完全由当前 request Promise 和显式顺序表达；任何代码都不以 request ID `1/2/3` 判断阶段。
- TransportSession 只 correlation 当前 pending response，不识别 handshake stage 或 projection method。
- TransportSession 的内部 request failure 语义可区分 correlated RPC error、本地 send failure 和 session unavailable/invalidation，同时保持既有 Error 文本与公开 Promise 行为。
- facade 继续唯一拥有 `GuiHostStatus`、terminal error 单调性和 notification routing。
- facade 的 terminal error gate 只抑制后续非 error status；不新增 error 去重，现有连续 error callback 不被归一化。
- CommandGateway 只在 attach 成功后 ready，失效后永久不可用；旧 handle 不复活。
- duplicate、out-of-order 和 stale handshake response 被忽略，不重复推进、不新增 error 或 close。
- 成功 status 顺序、attach/commands callback 顺序、RPC method/params 和 command 结果保持。
- correlated handshake RPC error 保持 terminal；local send failure 不新增 status/close；session invalidation 不被 handshake 二次终端化；command RPC error 保持非 terminal。
- protocol error、socket error、socket close 和 cleanup 分别保持现有 `onCommandsUnavailable` 与 status 顺序。
- 所有 pending requests 在 socket error、close、protocol termination 或 cleanup 时被拒绝；cleanup 幂等并抑制后续 callbacks。
- 现有 `parseRpcMessage` 与 projection guards 的 runtime validation/trust 语义不变；B03 没有被提前实施。
- browser launch、Bridge、Redux、projection coordinator、thread runtime、UI、Rust 和 generated protocol 均无行为扩张。
- 聚焦 GUI host tests 覆盖三 owner、完整握手、commands、终止顺序及 duplicate/out-of-order/stale response；既有相关回归保持通过。

## 设计完成边界

本文只确定 B02 的 owner、依赖方向、生命周期、错误策略、兼容性与验收边界。具体文件清单、符号迁移、测试落点、执行顺序、验证命令和提交边界属于后续 implementation plan；在本文状态被用户明确确认前，不得创建或落盘该计划，也不得修改 workspace 实现。
