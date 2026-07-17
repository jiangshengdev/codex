# Codex GUI 连接生命周期 Owner 设计

状态：已确认

## 文档关系

本设计基于 2026-07-17 的当前代码与 generated authoritative contract 边界重新校准 B02 / `RA-02-002`。

旧文档 `docs/superpowers/specs/2026-07-15-codex-gui-transport-session-handshake-owner-design.md` 保留为历史记录，用于说明当时的证据与决策过程；其中关于固定 request ID、手写 protocol guards、raw generic request client 和 runtime trust boundary 的假设已经过时，不得直接执行，也不得作为后续实施计划的接口依据。

## 唯一主目标

在保持 `startGuiHostConnection` 的公开接口、RPC 与 wire 语义、generated authoritative contract 依赖、同步握手时序、成功状态序列、command Promise 行为以及所有终止路径可观察 callback 顺序不变的前提下，将当前共置于连接闭包中的 transport、handshake 和 commands 生命周期状态拆分给三个清晰的内部 owner，并由一个兼容 facade 统一编排。

## 当前状态与根因

### 已消除的固定 ID 子问题

当前实现已经不再以 request ID `1/2/3` 判断 authenticate、initialize 和 projection attach 阶段。每个 request 在 pending entry 中绑定自己的 result settlement 与 validated-result continuation；只有当前 pending ID 才能完成对应 request。未关联、重复或迟到 response 不会按字面 ID 推进握手。

因此，“移除固定 request ID 阶段语义”不再是本设计要解决的根因，也不能作为实施完成的主要证明。

### 仍存在的 owner 共置

`startGuiHostConnection` 当前仍在同一个闭包中拥有并交叉修改以下状态与策略：

- WebSocket 创建、事件 handler、发送、关闭与 handler teardown；
- request ID 分配、pending correlation、response validation、pending rejection；
- authenticate、initialize、projection attach 的同步握手推进；
- command readiness、stable commands handle 和 invalidation；
- generated envelope validation、response/error 分流与 notification classification；
- `GuiHostStatus` 的 terminal gate；
- protocol error、socket error、socket close 和 cleanup 的不同 callback 顺序。

这些职责共享一个连接生命周期，但变化原因不同。transport 关心 socket 与 request 资源；handshake 关心阶段顺序和阶段失败策略；commands 关心 attach 后可用性以及旧 handle 永久失效；facade 关心公开状态、callback 顺序和 notification handoff。继续共置会使任一局部调整都需要同时推理整个闭包，并增加 generated contract 边界在重构中被擦除或重复表达的风险。

## Authoritative contract 硬约束

本设计把 authoritative contract 依赖视为结构约束，而不是实现偏好。

### App-server request

- app-server request 的 authoritative 类型来自 generated `ClientRequestDefinition`。
- method 与 params/response 的关联必须通过现有 `RequestParams<M>`、`RequestResponse<M>` 以及 generated `requestDescriptors[M]` 保持。
- runtime response validation 必须调用该 method 对应 descriptor 的 generated `validateResponse`。
- transport、handshake 和 command owner 之间传递 request 能力时，必须保留 method、params、response type 与 response validator 的同一绑定关系。
- 不允许退化为 `<T>(method: string, params: unknown)`、`Promise<T>` 后由调用者断言，或其他可让 method 与 response type 任意组合的自由 generic 接口。

### Authenticate private contract

- `gui/authenticate` 不属于 app-server `ClientRequestDefinition`；它使用 GUI host 自己的 generated private contract。
- method 必须来自 `AUTHENTICATE_METHOD`，params/result 必须来自 `GuiAuthenticateParams` 与 `GuiAuthenticateResult`，runtime result validation 必须来自 generated `validateGuiAuthenticateResult`。
- 可以在内部把这些 authoritative artifacts 组合为 transport 可消费的“已绑定 request 能力”，但该组合只能引用 authoritative method、types 和 validator，不能重新声明 authenticate DTO、字段清单、schema 或 guard。

### Envelope 与 notification

- JSON parse 后的值保持为 `unknown`，不得在未验证时断言为 JSON-RPC message。
- JSON-RPC envelope 必须使用 generated `validateJSONRPCMessage` 验证。
- server notification 必须使用 generated `classifyServerNotification` 分类和收窄。
- selected notification 的 method-specific params 必须来自 classifier 返回的 authoritative discriminated union；不得恢复手写 `isThreadProjection*` guards。

### 禁止的 consumer-owned contract

任何 owner 都不得新增或恢复以下形状：

- 手写 protocol DTO、response wrapper、schema、字段列表、literal method union 或 runtime guard；
- 用 `unknown`、宽 record、宽 generic 或 assertion boundary 擦除 authoritative 类型后再自行重建；
- 对 missing 或 malformed result 使用 `as Response`、`result ?? {}` 或其他 fallback 将验证失败变成成功；
- 为方便测试而建立可把任意 method 与任意 params/response 组合的 fake contract。

测试替身可以记录和控制 request，但它模拟的能力也必须保留 production request binding 的类型关系。

## 总体架构

采用三个 feature-private owner 与一个兼容 facade：

```text
startGuiHostConnection facade
  ├── TransportSession
  ├── HandshakeController ── bound request ──> TransportSession
  └── CommandGateway ─────── bound request ──> TransportSession

facade
  ├── public status and callback ordering
  ├── generated envelope validation
  ├── generated notification classification
  └── owner lifecycle coordination
```

依赖方向固定如下：

- `TransportSession` 不依赖 `HandshakeController`、`CommandGateway`、React、Redux、projection coordinator 或 UI。
- `HandshakeController` 与 `CommandGateway` 只依赖 transport 提供的 authoritative-bound request 能力，不访问 socket、pending map 或 request ID。
- facade 创建并协调三个 owner；三个 owner 不反向依赖 facade 的公开 options type，也不直接拥有公开 status。
- production 外部仍只通过 `startGuiHostConnection`、`GuiHostStatus`、`GuiHostCommands`、options 和 cleanup 与连接交互。

## Owner 职责

### TransportSession

`TransportSession` 唯一拥有：

- 单个 WebSocket instance 与四类 socket event handler；
- socket handler 收到事件后，在同一调用栈内把 raw message data 或 open/error/close lifecycle fact 交给 facade；
- 单调 request ID 分配；
- pending request map 及 exactly-once settlement；
- JSON-RPC request envelope 序列化与 `socket.send`；
- 已验证 response/error 与 pending ID 的 correlation；
- 与 pending request 绑定的 authoritative response validator 和 settlement continuation；
- transport invalidation 时拒绝全部 pending requests；
- socket close、handler 解绑和幂等 disposal；
- session 是否仍允许发起 request 的内部状态。

Transport request contract 必须在每次 request 建立时绑定以下事实：

- authoritative method；
- 与该 method 对应的 params type；
- 与该 method 对应的 response type；
- generated response validator；
- missing/malformed result 的既有错误文本来源；
- 该 request 的 failure policy 所需内部元数据，但不包含公开 status policy。

具体 TypeScript 表达留给实施计划决定。无论使用 descriptor、受约束 overload、discriminated capability 还是等价表达，都不得把该关系擦除成独立的 `string`、`unknown` 和自由 `T`。

`TransportSession` 不拥有：

- authenticate、initialize 或 attach 的阶段顺序；
- command readiness 或 `GuiHostCommands`；
- 某类 failure 是否应成为公开 terminal status 的业务策略；
- projection notification method、classifier 结果处理或 projection callbacks；
- `GuiHostStatus`、terminal status gate 或公开 callback 顺序。

TransportSession 与 facade 的交接必须保持同步。transport handler 不自行 parse、延迟或排队 raw message，也不通过 Promise/microtask 转发 lifecycle fact。facade 完成 generated validation/classification 后，只能调用 transport 暴露的窄 settlement、correlation、pending rejection 或 invalidation 能力；facade 不得读取、遍历或修改 pending map。

### HandshakeController

`HandshakeController` 唯一拥有：

- authenticate → initialize → projection attach 的显式阶段顺序；
- token、thread ID 和当前 authoritative request params 的构造；
- started、active、completed/failed 等握手内部状态；
- authenticate 成功条件与各阶段 validated result continuation；
- authenticated、initialized、attached milestone；
- handshake failure 的 terminal/non-terminal policy 选择。

握手推进必须保持当前同步 message 栈语义。匹配 response 到达时，result validation、milestone callback、下一 request 的发送以及 attach 后 callback 链应在当前 `onmessage` 调用栈内连续发生。不得把现有 callback continuation 机械改成 `async`/`await` Promise 链，从而引入额外 microtask，改变测试可观察的 request 发送时点、status 时点或 callback 顺序。

`HandshakeController` 不拥有：

- socket handler、request ID 或 pending map；
- generated envelope validation和 notification classification；
- command stable handle 或 unavailable callback；
- 公开 `GuiHostStatus` callback；
- socket close 的直接执行。

### CommandGateway

`CommandGateway` 唯一拥有：

- attach 成功前不可用、attach 成功后 ready 的门禁；
- stable `GuiHostCommands` handle；
- `startTurn` 与 `interruptTurn` 到对应 generated request descriptor 的映射；
- connection 终止或 cleanup 后的永久 invalidation；
- 旧 commands handle 在 invalidation 后拒绝所有新调用；
- ready/invalidated 状态，以及是否发生过 `ready -> invalidated` transition 的内部事实。

CommandGateway 只能收到通过 generated descriptor 验证后的 `RequestResponse<M>`。missing result、malformed result 和 RPC error 均拒绝对应 command Promise；它们不关闭 socket、不发 terminal status，也不自动使 gateway 失效。gateway 只有在 facade 编排的 connection invalidation 中永久失效。gateway 向 facade 报告是否实际发生了 `ready -> invalidated` transition；公开 `onCommandsUnavailable` 是否调用以及相对 status/close 的调用顺序只由 facade 决定。

`CommandGateway` 不拥有：

- socket、pending map 或 response correlation；
- handshake 阶段；
- status、`onCommandsUnavailable` 的直接调用、socket close 或 projection routing；
- response fallback、assertion 或独立 runtime validation。

### startGuiHostConnection facade

facade 保持公开兼容层并唯一拥有跨 owner 编排：

- 消费 browser launch params，并保持 `onLaunchParams` 在 WebSocket 创建前同步触发；
- 创建 socket 和三个内部 owner；
- 发出 `connecting` 并统一拥有 `GuiHostStatus`；
- 保持 terminal error 后抑制非 error status，但不新增 error callback 去重；
- 在 socket open 时启动一次 handshake；
- 将 handshake milestones 映射为 authenticated、initialized 和 attached status；
- 保持 attach response callback、attached status、commands ready 的现有顺序；
- 执行 generated envelope validation、missing-result 特殊分流和 generated notification classification；
- 将 selected projection notifications 转交既有 callbacks；
- 将 malformed envelope、malformed selected notification 和 handshake terminal failure 转换为既有 protocol termination；
- 按终止来源保持 pending rejection、commands invalidation、status 与 close 的精确顺序；
- 编排幂等 cleanup，并抑制 cleanup 后的 socket callbacks 与 status。

facade 不读取 request ID 来推断握手阶段，也不直接操作 transport pending map。missing-result 特殊路径可以通过 transport 暴露的窄 settlement/correlation 能力完成，但 facade 不能因此取得 pending entry 的所有权。transport handler 必须同步把 raw message/lifecycle fact 交给 facade；facade 的 generated validation/classification 与随后调用 transport 窄能力的整个交接不得引入额外 microtask。

## Inbound message 流程

Inbound message 必须保留以下分层与顺序：

```text
WebSocket message data
  -> parseRpcMessage
       -> parse failure
            -> protocol error path
       -> unknown value
            -> generated validateJSONRPCMessage
                 -> validation failed
                      -> if numeric ID matches a pending request and both result/error are absent
                           -> settle that request as missing result
                      -> otherwise
                           -> malformed-envelope protocol error path
                 -> validation passed
                      -> success response
                           -> numeric ID: correlate current pending ID
                                -> matched: validate result with request-bound generated validator
                                -> unmatched: ignore
                           -> non-numeric ID: ignore
                      -> error response
                           -> numeric ID: correlate current pending ID
                                -> matched: classify as correlated RPC failure
                                -> unmatched: ignore
                           -> non-numeric ID: terminal protocol path with "handshake error" close reason
                      -> client/server request carrying an ID
                           -> preserve current no-op boundary
                      -> notification
                           -> generated classifyServerNotification
                                -> selected: forward authoritative params
                                -> selectedInvalid: protocol error path
                                -> knownUnconsumed: ignore
                                -> unknown: malformed-message protocol error path
```

missing-result 特殊路径是当前行为的一部分：一个包含 numeric ID、但同时缺少 `result` 与 `error` 的对象无法通过 generated envelope validator；若该 ID 当前 pending，必须产生该 request 对应的 `returned no result payload`，而不是统一改写为 `Malformed JSON-RPC message`。若 ID 不匹配 pending request，则继续走 malformed-envelope protocol error。

只有当前 pending numeric ID 可以完成或拒绝 request。correlation 必须先删除 pending entry，再执行 validator、resolve/reject 或 continuation，确保 duplicate response 不会重复推进。

合法 success response 若 ID 不是 number，保持当前无操作语义：不 correlation、不发 status、不 close。合法 error response 若 ID 不是 number，不能按 unmatched numeric error 忽略；facade 必须保持当前 terminal 行为，使用现有 JSON-RPC error 文本发 error status，并以 `handshake error` 作为 close reason。只有 unmatched numeric error response 才直接忽略。

## Failure source 与 policy

内部 failure 分类至少表达四类事实：

| Failure source | 含义 | 公开 Error 文本 | Handshake policy | Command policy |
| --- | --- | --- | --- | --- |
| `rpc`（correlated numeric） | 匹配当前 pending numeric ID 的 JSON-RPC error response | 保持当前 `JSON-RPC error (id=..., code=...): ...` | terminal，进入 `handshake error` close path | 仅拒绝当前 Promise，非 terminal |
| `rpc`（valid non-numeric envelope） | generated envelope validator 接受、但 ID 非 number 的 JSON-RPC error response | 保持当前 JSON-RPC error 文本 | 不交给 HandshakeController；由 facade 直接 terminal，并以 `handshake error` close | 不进入 command correlation |
| `missing/malformed result` | 缺少 result 或 generated validator 拒绝 result | 保持当前 method-specific `returned no result payload` / `returned malformed result payload` | terminal，进入 protocol error close path | 仅拒绝当前 Promise，非 terminal |
| `send` | `socket.send` 同步失败 | 保持当前原始 Error；非 Error 值继续归一为 unavailable 文本 | 停止推进，不新增 status/close | 仅拒绝当前 Promise |
| `unavailable` | 发起时不可用，或 pending 因 error/close/protocol termination/cleanup 被拒绝 | `GUI host WebSocket is not available` | 停止推进，不重复 status/close | 拒绝 Promise；gateway 是否 invalidated 由 facade 生命周期决定 |

该分类只服务内部 owner policy，不能泄漏为新的公开 GUI host API，不能改变调用方观察到的 Error message，也不能让同一次生命周期 failure 被 HandshakeController 二次 terminalize。

## 成功数据流与 callback 顺序

成功路径保持：

```text
consume launch params
  -> onLaunchParams
  -> create WebSocket
  -> create owners
  -> status: connecting

socket open
  -> send gui/authenticate

validated authenticate result
  -> status: authenticated
  -> synchronously send initialize

validated initialize result
  -> status: initialized
  -> synchronously send thread/projection/attach

validated attach result
  -> onProjectionAttached(response)
  -> status: attached
  -> CommandGateway becomes ready
  -> onCommandsReady(stable commands handle)
```

状态序列仍为 `connecting → authenticated → initialized → attached`。不增加中间状态，不把 command readiness 提前到 attached status 之前，也不改变 `onProjectionAttached` 的先行顺序。

### Startup 同步异常边界

startup 顺序严格保持为：

```text
consumeBrowserLaunchParams
  -> onLaunchParams
  -> createWebSocket
  -> construct owners
  -> status: connecting
```

`consumeBrowserLaunchParams`、`onLaunchParams` 或 `createWebSocket` 中任一步同步抛错时，后续步骤均不得执行：不创建后续 owner、不发 `connecting`、不启动 handshake。facade 不捕获、不改写该异常，也不转换为 `GuiHostStatus`；异常按当前同步边界继续传播给调用 `startGuiHostConnection` 的 bridge。owner 抽取不得通过 Promise、microtask 或延迟初始化改变该传播方式。

## 终止与 cleanup 数据流

### Protocol error

适用于 malformed JSON、malformed envelope、matched handshake missing/malformed result、malformed selected notification 和 handshake terminal failure：

```text
status: error
  -> reject all pending requests
  -> if commands were ready: onCommandsUnavailable
  -> close socket with existing code/reason
```

公开 error status 必须先于 commands unavailable。terminal gate 抑制随后出现的 closed、authenticated、initialized 或 attached，但不合并后续 error callback。

### Socket error

```text
reject all pending requests
  -> if commands were ready: onCommandsUnavailable
  -> status: error("GUI host WebSocket failed")
```

commands unavailable 必须先于 socket error status。

### Socket close

```text
reject all pending requests
  -> if commands were ready: onCommandsUnavailable
  -> code 1000: status closed
  -> other code: status error with existing code/reason text
```

如果此前已进入 terminal protocol error，非 error 的 clean closed status 被抑制；异常 close 的后续 error callback仍按当前规则允许出现。

### Cleanup

```text
mark facade disposed
  -> reject all pending requests
  -> if commands were ready: onCommandsUnavailable
  -> detach socket handlers
  -> close socket with 1000 / "cleanup"
  -> no status callback
```

cleanup 必须同步、幂等。重复调用不重复 unavailable、不重复 close，也不允许捕获的迟到 handler 恢复 handshake 或 commands。

## Response 与 commands 生命周期语义

### Unmatched、duplicate 与 stale response

- numeric response 只有在 ID 当前存在于 pending map 时才被消费；
- duplicate response 在首次 settlement 删除 entry 后成为 unmatched，直接忽略；
- 尚未发出对应 request 的提前 response 直接忽略，不预先建立状态；
- cleanup、error、close 或 invalidation 后的 stale response 不能发 status、调用 projection callback、启用 commands 或恢复 session；
- valid success response 的非 numeric ID 直接忽略；
- unmatched numeric JSON-RPC error 直接忽略，不新增 terminal error；
- valid JSON-RPC error response 的非 numeric ID 保持 terminal error，并以 `handshake error` close；
- 这些规则不扩大为忽略 malformed envelope、unknown notification 或无 numeric correlation 语义的其他既有 protocol error。

### Commands stable handle

- 每个 connection instance 只有一个 stable commands handle；
- attach 成功前 gateway inactive，handle 不对外发布；
- attach 成功后 gateway ready，facade 只发布一次 stable handle；
- ready 状态下的单个 command failure 不改变 gateway readiness；
- connection invalidation 后 gateway 永久 invalidated，同一 instance 不得重新 activate；
- 已经被调用方保存的旧 handle 在 invalidation 后继续存在，但任何新调用都拒绝 unavailable；
- gateway 只报告是否发生 `ready -> invalidated` transition；facade 仅在该 transition 首次发生时调用一次 `onCommandsUnavailable`，并负责其相对 status/close 的路径特定顺序。

## 兼容性与行为保持表

| 边界 | 必须保持 | 本设计允许的内部变化 |
| --- | --- | --- |
| 公开入口 | `startGuiHostConnection` 签名与同步 cleanup 返回值 | 内部创建三个 owner |
| Startup | launch params → launch callback → WebSocket → owners → connecting；同步异常原样传播并阻止后续步骤 | owner construction 可拆分但不能延迟 |
| 公开 types | `GuiHostStatus`、`GuiHostCommands`、options callbacks 不变 | feature-private owner types 可新增 |
| RPC/wire | method、params、JSON-RPC envelope、close code/reason 不变 | request serialization owner 可移动 |
| Contract | generated types、validators、classifier 与 failure propagation 不变 | authoritative artifacts 可由 bound request capability 传递 |
| Handshake 时序 | 当前 message 栈内同步推进 | continuation owner 可移动，不能引入 microtask |
| 成功 callbacks | attach callback → attached status → commands ready | callbacks 的调用位置可由 facade 编排 |
| Command success | 只返回 generated validator 接受的 response | correlation/validation owner 可移动 |
| Command failure | RPC、missing、malformed 仅拒绝当前 Promise | 内部 failure source 可显式化 |
| Protocol error | error status → pending rejection/unavailable → close | owner 间调用可拆分 |
| Socket error/close | pending rejection/unavailable → status | lifecycle callback 可由 transport 报告给 facade |
| Cleanup | unavailable（若 ready）→ detach/close；无 status；幂等 | teardown 细节可由 transport owner 承担 |
| Notifications | generated classification 与 projection callbacks 不变 | facade switch 可收缩但不能手写 guard |

## 测试策略

设计验证需要覆盖两个层次。

### 现有 facade 行为套件

继续以现有三个 GUI host suite 作为公开兼容性证据：

- handshake suite：成功阶段、同步推进、authenticate/initialize/attach validation、duplicate/unmatched/late response、attach callback 顺序；
- commands suite：ready 门禁、method/params 映射、generated response validation、RPC/missing/malformed result、cleanup/error/close invalidation；
- protocol errors suite：malformed JSON/envelope、JSON-RPC error、selected invalid/unknown notification、status/close reason 与 callback 顺序。

这些测试应继续通过公开 facade 驱动，不依赖内部 owner 的实现形状。合法 projection payload 继续使用共享 fixtures/builders；malformed payload 与 JSON-RPC envelope 保持测试本地显式表达。

### Owner 单元边界

- TransportSession：request ID、generated validator 的 runtime invocation、missing-result settlement、exactly-once correlation、failure source、pending rejection、同步 handler-to-facade handoff 和幂等 disposal；
- HandshakeController：同步三阶段 continuation、milestones、stop 后抑制、各 failure source policy，且不直接操作 socket/status；
- CommandGateway：stable handle、inactive/ready/invalidated 状态、`ready -> invalidated` transition fact、permanent invalidation以及单个 command failure 非 terminal；facade 测试验证 unavailable 的实际调用次数与顺序。

method/params/response/validator 的 authoritative binding 必须由 TypeScript typecheck/build 的 failure propagation 证明：不兼容的 method/params/response 组合或 generated contract 漂移必须在类型检查、generated artifact check 或 build 中失败。Vitest owner tests 只证明 runtime validator 确实被调用，以及 correlation、settlement、failure policy 和 lifecycle state 的运行时行为；不得用宽 generic fake、`as` assertion 或手写 DTO 伪造“类型关联已被证明”。

Owner tests 只验证 owner 边界；不得复制 generated contract fixtures，也不得用宽 generic fake 绕过 production 类型关系。

## 风险与控制

### Authoritative 关联在抽取中丢失

风险：为形成通用 transport API，把 method、params、response 和 validator拆成 `string`、`unknown` 与自由 `T`。

控制：transport request contract 必须接收一个已绑定 capability；设计和计划审查均检查 method-specific params/response 是否仍由 authoritative type 推导，runtime validator 是否仍来自 generated descriptor/private contract。

### Promise microtask 改变握手时序

风险：将当前同步 continuation 改为 `async`/`await`，使 initialize/attach 发送和 callbacks 延迟到 microtask。

控制：HandshakeController 使用同步 settlement continuation 或语义等价机制；以现有 handshake suite 和明确的同步时序测试锁定行为。

### Missing-result 特殊路径被 envelope validator 吞没

风险：所有 validation failure 都直接变成 malformed-message terminal error，改变 command 与 handshake 的 method-specific Error 文本和终端性。

控制：在 generated envelope validation 失败后保留窄的 correlated missing-result 识别；仅匹配当前 pending numeric ID，其他 invalid envelope 仍 terminal。

### Failure 被重复终端化

风险：transport invalidation 拒绝 handshake request 后，HandshakeController 又把 unavailable 当成新的 terminal error。

控制：内部 failure source 明确区分 rpc、result validation、send 与 unavailable；只有 rpc 和 handshake missing/malformed result触发 handshake terminal policy。

### Callback 顺序在 owner 间漂移

风险：不同 owner 各自发 status、invalidate commands 或 close socket，导致 protocol error 与 socket error 路径被错误统一。

控制：公开 status 与跨 owner 顺序只由 facade 编排；逐路径保留兼容性表中的顺序，不追求表面统一。

### 旧 commands handle 复活

风险：迟到 attach continuation 或 socket callback 在 invalidation 后重新 activate gateway。

控制：HandshakeController stop、facade disposed gate 与 CommandGateway permanent invalidation共同阻止复活；gateway 的 invalidated 状态不可逆。

### 内部 owner 扩大为公共 API

风险：为测试便利导出 owner 或 contract types，使下游绕过 facade。

控制：owner 保持 feature-private；公开 API 仍由 `guiHostClient.ts` 定义。

## 排除项

本设计不涉及：

- Redux dispatch、state shape 或 selectors；
- projection application coordinator、snapshot replay 或 thread runtime；
- React、UI、HeroUI、transcript、scroll 或 composer；
- Rust GUI host、app-server API 或 server 行为；
- RPC method、wire shape、schema 或 close protocol；
- generated artifacts 内容或 B03 validator/classifier 生成流程；
- browser launch params 的解析、storage、fragment 清理或 callback 顺序；
- reconnect、新增 retry、超时、取消、backpressure 或并发 command policy；
- 将 unmatched/duplicate/stale response 升级为新的 protocol error；
- 新增用户可见状态、错误文本或 diagnostics。

## 被否决方案

### 仅抽取 transport helper

只把 request ID、pending map 和 send 抽成 helper，而让 handshake、commands、terminal state 与 cleanup 继续共享 facade 闭包，无法解决 owner 共置；helper 还容易演变成 raw `string`/`unknown` request API，因此不采用。

### 单一 GuiHostSession

一个 class 包含 transport、handshake、commands 和 status 虽可减少对象数量，但只是把大闭包搬进大 class，变化原因仍由同一 owner 持有，因此不采用。

### 新增 ProtocolRouter owner

当前 generated envelope validation 和 notification classification 已形成清晰边界，facade 的 routing 规模有限。新增第四个 router 会增加生命周期协调面，且没有独立状态需要拥有，因此不采用。

### Status 下沉到各 owner

TransportSession 发 close/error status、HandshakeController 发阶段 status 会让 terminal gate 和 callback 顺序分散，容易产生重复或乱序，因此不采用。

### 统一所有错误路径顺序

protocol error 当前先发 status，socket error/close 当前先使 commands unavailable。强行统一会改变用户可观察行为，因此不采用；顺序差异由 facade 明确保留。

## 验收标准

- `startGuiHostConnection` 仍是唯一 production 连接入口，公开签名、types、callbacks 和 cleanup 不变。
- startup 保持 launch params → launch callback → WebSocket → owners → connecting 的同步顺序；任一步同步异常原样传播给 bridge，并阻止后续步骤和 connecting status。
- TransportSession、HandshakeController、CommandGateway 的状态与职责在实现中可独立辨认，且依赖方向符合本设计。
- transport handler 同步把 raw message/lifecycle fact 交给 facade；facade generated validation/classification 后只调用 transport 窄 settlement/correlation/invalidation 能力，不访问 pending map且不引入 microtask。
- app-server request 始终通过 `requestDescriptors` 与 `RequestParams<M>` / `RequestResponse<M>` 保留 method-specific authoritative 关联。
- authenticate 始终使用 generated private method、types 与 validator。
- 不存在 raw `<T>(method: string, params: unknown)` request client、consumer-owned protocol DTO/schema/guard、response assertion 或 missing-result fallback。
- parse 后的 `unknown` 必须经过 generated envelope validator；notification 必须经过 generated classifier。
- correlated missing-result 特殊路径、valid response/error correlation 和 selected notification 分流保持当前语义；非 numeric success response 忽略，非 numeric error response terminal 并以 `handshake error` close，只有 unmatched numeric error 忽略。
- handshake 在当前 message 栈中同步推进，不因 owner 抽取新增 Promise microtask。
- rpc、missing/malformed result、send 和 unavailable failure source 可由内部 policy 区分，同时公开 Error 文本不变。
- handshake RPC 与 missing/malformed result保持 terminal；command failure 保持 per-request non-terminal。
- 成功 status、attach/commands callbacks、protocol error、socket error/close 和 cleanup 的精确顺序符合本设计。
- unmatched、duplicate 和 stale numeric response 不推进、不发 status、不关闭、不恢复 session；该规则不吞掉 valid non-numeric error 的既有 terminal 行为。
- commands handle 稳定，attach 后 ready，invalidation 永久；gateway 只拥有 transition fact，facade 拥有 unavailable 的实际调用及顺序且最多一次。
- method/params/response/validator binding 由 TypeScript typecheck/build failure propagation 证明；Vitest 不以宽 fake 或 assertion 代替类型证据。
- 现有 handshake、commands、protocol errors suites 保持公开行为覆盖，并新增与 owner 边界相称的单元覆盖。
- Redux、projection application、UI、Rust、wire、generated artifacts 和 B03 生成流程均无行为或所有权变化。

## 设计完成边界

本轮设计只确定 owner、authoritative contract、inbound processing、failure policy、同步时序和兼容性边界。它不规定具体 TypeScript interface 语法、类或函数命名、最终文件拆分、迁移步骤、测试命令、提交边界或实施任务清单。

只有本设计经用户明确确认后，下一轮才能编写与本设计对应的实施计划。旧 2026-07-15 设计与计划不得被直接恢复执行；后续计划必须以本文件和届时当前代码为唯一 B02 设计依据。
