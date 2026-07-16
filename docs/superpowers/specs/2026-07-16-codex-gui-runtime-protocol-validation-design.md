# Codex GUI Runtime Protocol Validation / Trust Boundary 设计

状态：待确认

## 唯一主目标

在保持 GUI host wire shape、RPC 方法、现有错误文本与关闭策略、projection/Redux 运行时对象和 action 顺序不变的前提下，为 B03 / `RA-02-003` 建立清晰的 runtime protocol validation / trust boundary：严格区分 JSON-RPC envelope，按消息成本提供分层 runtime guarantee，使 `attach/event` 只承诺前端实际验证的 DTO，使 `delta/closed` 完整验证生成的 v2 类型，并把不被消费的 command 返回值收窄为 `Promise<void>`。

## 背景与问题证据

重构审计 B03 / `RA-02-003` 已确认，`codex-gui/src/features/guiHost/guiHostProtocol.ts` 是正确的 feature-private runtime protocol owner，但当前实现混用了三种不一致的信任策略：

- `parseRpcMessage` 只要 JSON 能解析且顶层是 object，就从中挑选 `id`、`method`、object `result`、部分 `error` 和 object `params`；它不验证 `jsonrpc: "2.0"`，也不把 success response、error response、notification 与 malformed envelope 建模为互斥分支。
- `isThreadProjectionAttachResponse` 只检查 `subscriptionId`、`snapshot.thread.id`、`snapshot.thread.turns` 和 `snapshot.headCommitId`，却声明整个值是生成的 `ThreadProjectionAttachResponse`。
- `isThreadProjectionEventNotification` 检查 outer commit chain、event discriminant，以及 `Turn` / `ThreadItem` 的少量字段，却声明整个值是生成的 `ThreadProjectionEventNotification`。
- `isThreadProjectionDeltaNotification` 已逐一检查四个 generated delta variant 的全部字段；`isThreadProjectionClosedNotification` 已检查 generated closed notification 的全部字段和唯一 reason `backpressure`。这两类 payload 的 runtime guarantee 可以与生成类型一致。
- `GuiHostTransportSession.request<T>` 和 `GuiHostRpcResponse<T>` 通过泛型把 runtime `unknown` 包装成调用方指定的 `T`；`GuiHostCommandGateway` 再用 `response.result ?? ({} as TResponse)` 把 command success result 直接视为 `TurnStartResponse` 或 `TurnInterruptResponse`。
- `turn/start` 与 `turn/interrupt` 的生产调用方只等待成功或失败，不读取 success payload。继续承诺完整 response 类型只会扩大没有 runtime 证据的静态信任面。
- attach snapshot 会递归进入完整 `Thread`、`Turn` 与大型 `ThreadItem` discriminated union；event 也会携带完整 `Turn` 或 `ThreadItem`。为这些消息复制整套 generated contract validator 会增加维护与遍历成本，而当前前端只需要 projection ingress、thread runtime 与 transcript projection 真实链路所消费的结构；未接入的 material helper 不作为 DTO 字段依据。

B02 已经把 transport correlation、handshake 和 command gateway 拆成独立 owner，但明确保留了上述 B03 边界。因此本设计接续 B02，不重新设计 connection lifecycle。

## 已确认设计决策

### 分层 runtime guarantee

采用分层保证：

- JSON-RPC envelope 进行严格、显式、互斥的 runtime decoding。
- `thread/projection/delta` 与 `thread/projection/closed` 完整验证生成的 v2 payload，并继续向下游承诺 generated type。
- `thread/projection/attach` 与 `thread/projection/event` 转换为 frontend-owned DTO；DTO 只承诺 decoder 实际验证的字段。
- `turn/start` 与 `turn/interrupt` 只承诺完成或失败，公开 command 方法返回 `Promise<void>`，不再把 success result 断言成生成 response 类型。

### 按消息类别处理 malformed 输入

错误策略由消息所属生命周期决定：

- correlated command response 的 envelope 异常只拒绝当前 command Promise；gateway 保持 ready，socket 不关闭，其他 pending request 不受影响。
- attach 的 malformed envelope、missing result 或 malformed payload 继续是 handshake terminal protocol error；valid RPC error 继续走既有 handshake error。
- 已知 projection notification 的 payload 异常继续是 terminal protocol error，并按现有策略关闭连接。
- 格式正确但 method 未知的 notification 继续忽略。

### 只收窄 TypeScript 静态契约

decoder 不构造裁剪对象。合法 `attach/event` 输入经过验证后，仍把同一个原始 object reference 交给 coordinator、adapter 与 Redux：

- 不删除额外字段；
- 不复制 snapshot、turn、item 或 event；
- 不改变 Redux action payload 的运行时数据；
- 不改变 action dispatch、state mutation、projection flush 或 callback 顺序；
- TypeScript 类型只承诺已经验证的字段，未验证的额外字段即使继续存在，也只能视为 `unknown`，不能继续冒充完整 generated contract。

## 设计目标

- 让 runtime decoder 的返回类型与实际证明范围一致。
- 让 JSON-RPC envelope 在进入 transport correlation、handshake 或 notification routing 前具有明确 discriminant。
- 保持 B02 owner 边界以及 command 非终端、handshake/projection 终端的差异。
- 保持 generated v2 类型作为 wire contract 定义侧，让下游 projection/Redux 显式依赖 frontend-owned DTO。
- 对大型 snapshot 只做一次必要遍历，不进行 clone、normalize 或二次 JSON round-trip。
- 用共享合法 fixture builders 和显式 malformed mutation 覆盖边界，避免测试 fixture 与 production decoder 各自手写不同协议。

## 非目标与排除边界

本设计不包含：

- 修改 Rust app-server、generated TypeScript schema、wire、RPC method/params 或服务端 serializer。
- 新增 runtime validator 依赖或生成完整 `Thread` / `Turn` / `ThreadItem` runtime schema。
- 修改现有错误文本、close code/reason、terminal status 单调性或 B02 lifecycle。
- 修改 projection ingress、commit chain、known turn、manual reconnect、stale subscription、Redux runtime 数据或 dispatch 顺序。
- 修改 UI、B07 timeline runtime、material builder/selector、rendering、scroll、Composer 或 reconnect 产品语义。
- 把 protocol validator 移入 transport、Redux、thread runtime，或新增宽泛的 `shared/common/protocol` 层。

## 备选方案与选择理由

采用分层保证，因为它让小型 `delta/closed` 保留低成本的完整 generated guarantee，让递归且体积大的 `attach/event` 只承担前端实际消费成本，并删除无消费价值的 command 泛型信任。未采用“全部最小 DTO”，因为会放弃 `delta/closed` 已有的完整证明；未采用“全部深度验证”，因为会复制大型 generated schema；未采用“attach/event 后续再做”，因为会保留本 finding 的核心静态谎言。

## Owner 与模块边界

- `guiHostProtocol.ts` 继续是唯一 feature-private runtime decoder/adapter owner：解析 raw JSON、生成 discriminated envelope、保留 malformed response 的可恢复 numeric ID、decode attach/event DTO，并完整 decode delta/closed。frontend-owned DTO 的每个非 `unknown` 字段都必须由它证明；不得用 assertion、泛型或返回注解升格 raw object。
- `GuiHostTransportSession` 继续唯一拥有 request ID、pending map、settle、invalidation 与 socket。request result 收窄为 `{ hasResult: boolean; result: unknown }`；transport 只 correlation 已 decode response，不识别 projection method。带匹配 numeric ID 的 malformed response 只 settle 当前 pending entry，不自行关闭 socket 或发 status；failure source 足以让 handshake 与 command 选择不同 policy。B02 的 duplicate、stale、out-of-order 和 unmatched response 语义不变。
- `startGuiHostConnection` facade 继续拥有 decoder 入口、correlation 后 routing、terminal status 单调性、现有 error/close 映射与 unknown valid notification 忽略。它只对 envelope discriminant 做 exhaustive routing，不再从宽泛可选字段推断类别。
- `GuiHostHandshakeController` 继续拥有 authenticate → initialize → attach。前两步成功条件不变；attach result 必须 decode 为 DTO。attach payload malformed 继续使用现有错误文本与 `protocol error`；任何 correlated handshake envelope malformed 都是 terminal。
- `GuiHostCommandGateway` 继续拥有 ready/invalidation 与 method/params，方法改为 `Promise<void>`。合法 success 且 result 存在时只表示完成；missing result、correlated RPC error 或 malformed response 只拒绝该 Promise，不关闭、不失效、不触发 `onCommandsUnavailable`。
- coordinator、adapter、thread runtime 与 Transcript State 等真实 runtime consumer 改为依赖 frontend-owned attach/event DTO。它们继续接收、dispatch 并保存同一 object；extra properties 继续存在但为 `unknown`。`snapshotReplay`、`liveEventHandling` 若因 type-check 被触达，只做 type-only 签名兼容，不作为 runtime owner。下游不得重新导入完整 generated attach/event 类型或用 assertion 恢复信任。

## Frontend-owned DTO 契约

frontend-owned DTO 定义与 decoder 同属 GUI host protocol feature；允许通过 feature-private type export 向 projection handoff 消费方提供。DTO 必须满足以下规范：

- 每一层 object 都保留原始 reference，并具有 `Record<string, unknown>` 意义上的额外字段承载能力。
- DTO 类型中每一个声明为 `string`、`number`、`null`、array、union discriminant 或嵌套 DTO 的字段，都必须由 decoder 检查。
- 未检查字段不得通过与 generated type 的 intersection、泛型或 assertion 获得静态类型。
- decoder 返回原始 value；类型收窄不通过 object spread、pick、clone 或 normalize 实现。

### Attach DTO

attach DTO 至少并完整承诺当前 handoff 所需的以下结构：

```text
subscriptionId: string
snapshot:
  headCommitId: string | null
  thread:
    id: string
    sessionId: string
    turns: FrontendProjectionTurn[]
    其他 thread metadata: 仅在前端生产消费方读取且 decoder 已验证时有具体类型；否则 unknown
```

`FrontendProjectionTurn` 的精确 guarantee 为：`id: string`；`items: FrontendProjectionItem[]`；`status` 仅接受 `completed | interrupted | failed | inProgress`；`itemsView` 仅接受 `notLoaded | summary | full`；`error` 为 `null`，或 object 且 `message: string`、`codexErrorInfo: unknown | null`、`additionalDetails: string | null`；`startedAt`、`completedAt`、`durationMs` 均为 `number | null`。`itemsView/error/timestamps` 进入 DTO 只是为了兼容现有 `snapshotReplay.ts` 与 `liveEventHandling.ts` 的编译期 production helper；不得把尚未接入的 material helper 当作新增 timeline runtime 行为依据。

`FrontendProjectionItem` 以 `type` 为 discriminant，精确检查如下；所有未列字段继续原样保留为 `unknown`：

| variant | runtime guarantee |
| --- | --- |
| `userMessage` | `id: string`、`content: FrontendUserInput[]` |
| `agentMessage` | `id: string`、`text: string`、`phase: commentary | final_answer | null` |
| `hookPrompt`、`plan`、`reasoning`、`commandExecution`、`fileChange` | 仅各自的 `type` 与 `id: string` |
| `mcpToolCall`、`dynamicToolCall`、`collabAgentToolCall`、`subAgentActivity` | 仅各自的 `type` 与 `id: string` |
| `webSearch`、`imageView`、`sleep`、`imageGeneration` | 仅各自的 `type` 与 `id: string` |
| `enteredReviewMode`、`exitedReviewMode`、`contextCompaction` | 仅各自的 `type` 与 `id: string` |

`FrontendUserInput` 接受现有 `text`、`image`、`localImage`、`skill`、`mention` discriminant；`text` 额外验证 `text: string`，其余 variant 因当前 transcript helper 只读取 discriminant 而不承诺其他字段。若未来生产 helper 读取更多字段，必须在同一变更中扩展 DTO、decoder 与 malformed coverage。

这一定义意味着 DTO 的静态字段集合就是 runtime guarantee 的完整清单；新增前端字段消费时，必须在同一变更中扩展 DTO、decoder 和 malformed coverage，不能只扩大 TypeScript 类型。

### Event DTO

event DTO 完整承诺 outer routing 与 commit chain 字段：

```text
threadId: string
subscriptionId: string
commitId: string
parentCommitId: string | null
event: frontend-owned discriminated union
```

event union 只包含当前四个 generated event discriminant：

- `turnStarted` / `turnCompleted`：notification 的 `threadId: string` 与 `turn: FrontendProjectionTurn`。
- `itemStarted`：notification 的 `threadId: string`、`turnId: string`、`startedAtMs: number` 与 `item: FrontendProjectionItem`。
- `itemCompleted`：notification 的 `threadId: string`、`turnId: string`、`completedAtMs: number` 与 `item: FrontendProjectionItem`。

event、notification、turn 与 item 上的额外字段保留在原始 object 上但不承诺。未知 event discriminant 继续视为已知 projection method 的 malformed payload，而不是 unknown notification method。

### Delta 与 closed

delta decoder 必须完整验证 outer `threadId`、`subscriptionId`、delta discriminant，以及四个 variant notification 的所有 generated 字段：

- `agentMessage`：`threadId`、`turnId`、`itemId`、`delta`。
- `reasoningSummaryText`：上述字段加 `summaryIndex`。
- `reasoningSummaryPartAdded`：`threadId`、`turnId`、`itemId`、`summaryIndex`。
- `reasoningText`：`threadId`、`turnId`、`itemId`、`delta`、`contentIndex`。

closed decoder 必须完整验证 `threadId`、`subscriptionId` 与唯一 generated reason `backpressure`。两者成功后可以继续返回 generated v2 type，因为 runtime proof 与静态声明一致。

## JSON-RPC discriminated envelope

protocol owner 将 inbound JSON 表达为互斥分支，而不是可选字段集合：

```text
success response:
  jsonrpc: "2.0"
  id: string | number | null
  hasResult: boolean
  result: unknown

error response:
  jsonrpc: "2.0"
  id: string | number | null
  error:
    code: number
    message: string（按 JSON-RPC 要求存在）
    data: unknown（可选，仅保留）

notification:
  jsonrpc: "2.0"
  method: string
  params: unknown（可选）

malformed envelope:
  correlationId: number | undefined
  failure kind
```

严格规则为：

- 顶层必须是非 null object，`jsonrpc` 必须严格等于 `"2.0"`。
- success response 必须有 `id`，且不能同时有 `error` 或 `method`；decoder 用 `hasResult` 显式保留 own `result` property 是否存在，missing result 不在 envelope 层一律判为 malformed。
- error response 必须有 `id` 和合法 error object，且不能同时有 `result` 或 `method`。
- notification 必须有 string `method`，不能有 `id`、`result` 或 `error`。
- response ID 按 JSON-RPC 接受 string、number 或 null；transport 只 correlation 本客户端分配的 numeric ID。
- JSON parse 失败、scalar/array 顶层、version mismatch、response 同时带 result/error 或其他混合 shape 都是 malformed envelope；valid RPC error response 保持独立 error 分支，不归为 protocol malformed。
- malformed object 若含有 numeric `id`，decoder 保留该值作为可恢复 correlation ID；是否匹配 pending request 由 transport 决定。
- extra envelope properties 不影响分类并保留在原始 object，但不进入公开 envelope 静态契约。

## Response 数据流

raw message 先由 protocol owner 完成 JSON parse 与 envelope decode。numeric ID 的 valid 或 malformed response 先进入 transport correlation；matched pending 先删除 entry 再 settle，unmatched 一律按 B02 忽略。matched success 由 owner 读取 `hasResult`：authenticate missing result 继续静默停止；initialize 保留 `initialize returned no result payload`；attach 保留专属 missing-result 错误；command missing result 只 reject 当前 Promise。valid error response 继续走既有 RPC failure：handshake terminal，command 非终端。string/null success response 忽略；string/null error response 保持当前 facade terminal RPC error。其他已解析但 malformed 的未知 object 保持当前忽略，只有能明确识别为已知 projection notification envelope/payload 的输入才进入 method-specific terminal policy；JSON parse failure 仍进入 `Malformed JSON-RPC message` terminal 路径。

## Notification 数据流

valid notification 由 facade 按 method routing：event 经 DTO decoder 后把同一 raw object 交给 callback、coordinator、adapter 与 Redux；delta/closed 经完整 generated decoder 后进入现有 callback；unknown method 忽略。decoder 不 clone。能明确识别为已知 projection method 但 envelope/`params` 缺失、非 object、字段类型错误、unknown payload discriminant 或 nested DTO failure 的输入，均沿用当前 method-specific malformed params 错误；其他未知 malformed object 忽略。

## 错误与关闭策略

| 输入/失败 | Promise 或 callback 结果 | gateway | status / socket |
| --- | --- | --- | --- |
| raw JSON parse failure | 不进入业务 callback | invalidated | 沿用 `Malformed JSON-RPC message` terminal 路径与现有 close policy |
| unmatched numeric valid/malformed response 或 string/null success | 忽略 | 不变 | 保持 B02；不发 status、不关闭 |
| string/null valid error response | 不进入业务 callback | invalidated | 保持当前 facade terminal RPC error |
| 其他未知 malformed parsed object | 忽略 | 不变 | 不发 status、不关闭 |
| matched command error、malformed envelope 或 missing result | 当前 command reject | 保持 ready | 不发 terminal status，不关闭 |
| matched authenticate/initialize envelope malformed | handshake 停止 | commands 尚未 ready | terminal handshake/protocol error，按现有 close policy |
| authenticate missing result | handshake 静默停止 | commands 尚未 ready | 保持当前无新 status、无主动 close |
| initialize missing result | handshake 停止 | commands 尚未 ready | 沿用 `initialize returned no result payload` |
| attach 缺少 result | handshake 停止 | commands 尚未 ready | 沿用 `thread/projection/attach returned no result payload` |
| attach result DTO malformed | handshake 停止 | commands 尚未 ready | 沿用 `thread/projection/attach returned malformed result payload` 与 `protocol error` |
| 明确为已知 event/delta/closed envelope 或 payload malformed | 不调用 projection callback | invalidated | 沿用当前 method-specific error text、terminal status 与 `protocol error` close reason |
| 格式正确的未知 notification | 忽略 | 不变 | 不发 status，不关闭 |

本设计不新增新的用户可见 error copy。若内部需要区分 `rpc`、`send`、`unavailable` 与 `protocol` failure，可扩展 B02 的内部 failure source，但该分类不得泄漏为新公开 API 或改变现有错误文本。

## 性能边界

- 每个 WebSocket message 只执行一次 `JSON.parse`。
- envelope decode 与 payload decode 直接检查同一个 object，不通过 `JSON.stringify`、structured clone、object spread 或 schema normalization 复制数据。
- `delta/closed` 验证成本与 payload 大小成正比且上界很小。
- decoder validation 对 frontend-owned DTO 声明的嵌套结构只递归遍历一次；attach validation 为单次 O(snapshot item count)。本设计不重构、合并或删除现有 replay、Redux、transcript 业务遍历，它们不是 decoder 的重复验证。
- decoder 不保留 snapshot 副本或全局 validation cache；生命周期与内存所有权继续由现有 connection/Redux owner 管理。
- extra fields 不遍历、不复制、不删除。只有 DTO 明确声明的嵌套结构进入 validation。
- 不引入通用 schema runtime、代码生成步骤或 bundle dependency。

## 兼容性与 breaking-change 分析

### Wire 与服务端兼容

无 wire breaking change：请求 method、params、ID 分配、JSON-RPC version、projection payload 和服务端 response shape 均不修改。Rust、app-server protocol schema 和 generated TS 文件保持不变。

严格 envelope validation 会把此前被宽松 parser 接受或静默忽略的 version mismatch、混合 envelope 和 malformed correlated response 显式归类。这是 B03 的预期客户端 runtime 行为收紧，但不改变合法服务端消息。

### GUI host facade 的 TypeScript 兼容

存在有意的内部 TypeScript breaking change：

- `GuiHostCommands.startTurn` 从 `Promise<TurnStartResponse>` 收窄为 `Promise<void>`。
- `GuiHostCommands.interruptTurn` 从 `Promise<TurnInterruptResponse>` 收窄为 `Promise<void>`。
- attach/event callbacks 从 generated full types 改为 frontend-owned DTO。

仓库内生产调用方不消费 command success value，因此没有运行时行为变化。测试中若断言 success payload，需要改为断言 Promise 完成和 wire request，而不是返回 object。

### Redux 与 projection 兼容

Redux action 的 runtime type、action name、payload object identity、state shape 和 data content保持不变。静态 payload/state 类型只承诺 DTO 字段；extra metadata 继续存在但不再获得未经验证的 generated 静态类型。任何依赖未验证字段的新生产读取都必须同时扩展 decoder，不能用 assertion 绕过。

### 外部 integration surface

B03 不修改 app-server API、raw response item events、CLI 参数、config loading 或 rollout resume。变更限于 `codex-gui` 内部 browser client/runtime boundary。

## 测试设计与矩阵

测试遵循两类 fixture 规则：

- 合法消息统一从现有 projection JSON fixtures 与共享 builders 构造，避免在每个 guiHost 测试中复制完整合法 `Thread` / `Turn` / `ThreadItem`。
- malformed case 必须先复制一个已知合法 fixture，再显式 mutation 一个目标字段；禁止变异模块级共享对象。合法 variant 缺 builder 时先扩展共享 builder surface，不得用与真实 generated shape 无关的手写半对象充当合法基线。

### Envelope decoder

覆盖：success 的 `hasResult=true/false`、合法 error、合法/未知 notification；malformed JSON、非 object JSON、错误 `jsonrpc`、result/error 同时存在、notification 混入 id、error 字段错误，以及 numeric/string/null ID。Node unit 分别证明 decoder classification、correlation 和 owner policy；明确断言 unmatched numeric valid/malformed、string/null success 与未知 malformed object 忽略，string/null error terminal。

decoder 单元测试直接断言 discriminated result，client/transport characterization test 断言 lifecycle policy，避免只测 helper boolean。

### Attach DTO

合法 attach fixture 必须证明：

- decoder 返回与输入严格相同的 reference；
- extra top-level、snapshot、thread、turn 和 item fields 保留；
- DTO 必需字段可被 coordinator、adapter、Redux 与 transcript 消费。

malformed mutation 覆盖 subscription、head commit、thread identity/session、turn array、turn fields、实际消费的 item discriminant/identity/variant field。每个 nested failure 都必须走现有 attach terminal error，不得调用 attached callback 或 commands ready。

### Event DTO

四个 event variant 都有合法 fixture，并断言同一 object reference 进入 callback。malformed mutation 覆盖 outer thread/subscription/commit chain、unknown event discriminant、turn notification、item notification、timestamp 和 frontend-owned turn/item field。所有 failure 继续走 method-specific terminal protocol error。

### Delta 与 closed

四个 delta variant 与 closed reason 分别覆盖合法 generated fixture；对每个 generated required field 做至少一个缺失或错误类型 mutation。测试证明 decoder 成功返回 generated type，unknown delta discriminant 和非 `backpressure` reason 被拒绝。

### Command

覆盖 `turn/start` 与 `turn/interrupt` 的 method/params、合法 success 完成 `void`、missing result、correlated JSON-RPC error、malformed correlated envelope、重复 response 和 pending command invalidation。

关键 lifecycle 断言为：单个 command error 或 malformed response 后 socket 未 close、没有 error status、gateway 仍可发送下一条 command、其他 pending command 可独立完成。

### Handshake 与 lifecycle

覆盖 authenticate missing result 静默停止、initialize/attach 专属 missing-result 错误、attach malformed DTO、correlated handshake malformed、unmatched numeric malformed 忽略、known notification malformed、unknown valid/malformed object 忽略。断言 terminal path 的 status、pending rejection、commands invalidation、close code/reason 和 callback 顺序与现有 characterization 一致。

### Static contract

`expectTypeOf` 只证明类型关系，不作为 runtime validation 证据。type tests 证明：

- attach/event DTO 不再 extend完整 generated attach/event type；
- `delta/closed` 仍精确兼容 generated type；
- command 方法返回 `Promise<void>`；
- projection handoff、adapter、coordinator 和 Redux 不再要求 generated attach/event 类型；
- production source 中不存在恢复完整类型的 assertion 或 generic command response trust；计划与验收使用限定到 B03 production 目录的 `rg` 搜索 generated attach/event import 与相关 `as`，不得全仓误报 fixture/generated 文件。

Node unit 覆盖 decoder、correlation、owner policy 和 DTO handoff。Browser 只复用现有 `App.browser` handoff/Redux 回归，不新增 browser decoder tests。`pnpm run ci` 不包含 Browser Mode，实施计划必须把 targeted Browser 命令单列，并与 Node CI 结果分别报告。

## 预期涉及文件范围

预期实施集中在 `guiHostProtocol.ts`、`guiHostTransportSession.ts`、`guiHostClient.ts`、`guiHostHandshakeController.ts`、`guiHostCommandGateway.ts` 及对应 `guiHost/__tests__` support/handshake/commands/protocol tests；另包括 projection shared fixtures/builders，以及 `projectionIngress`、`projectionCoordination`、`threadRuntime`、`transcriptState`、`snapshotReplay`、`liveEventHandling` 中 DTO handoff 所必需的 type import、签名与 type tests。

实际计划必须以 source search 确认所有 generated attach/event import 和生产消费方，但不得因此扩大到运行时业务重构。若某个下游文件只需要类型 import 替换，它仍属于 B03 静态契约迁移；若需要改变 reducer、projection outcome、rendering 或用户行为，则超出本设计。

明确排除 `codex-rs/**`、generated schema、package manifest/lockfile、新依赖、app-server docs、无关 `docs/superpowers` 文档、UI/CSS/layout/browser behavior 与 UI snapshot。`snapshotReplay.ts`、`liveEventHandling.ts` 等若被触达，只允许 DTO import/签名兼容，不得修改 material builder、selector、顺序或测试语义；现有集成测试只允许无视觉变化的类型适配。

## 实施分批建议

本设计拆为四个可独立审查但属于同一 B03 的实现批次。

第一批收敛 envelope/correlation，并同时删除 command response 泛型、公开 `Promise<void>`，锁定 missing result、RPC error、malformed 与 unmatched policy。第二批完成 attach DTO decoder 和从 handshake 到 Redux/transcript 的端到端静态迁移。第三批完成 event DTO decoder 和 event handoff 迁移。第四批完成 delta/closed 回归、限定 source search、type-check 与现有 Browser handoff 收口。

计划阶段必须对每批使用 `git diff --numstat` 核对规模：非机械变化目标小于 500 行，任何批次不得超过 800 行；超出时必须按实际依赖重新拆分，而不是把多个 owner 堆入同一批。

这些批次描述的是 review boundary，不是 implementation checklist。正式实施前仍需单独编写并确认 implementation plan。

## 验收标准

- inbound JSON-RPC message 在 protocol owner 中被 decode 为互斥 envelope，`jsonrpc: "2.0"` 得到严格验证。
- success envelope 显式保留 `hasResult`；authenticate、initialize、attach 与 command missing result 分别保持设计规定的阶段语义，valid RPC error 不被误归为 malformed。
- transport request API 不再通过调用方泛型承诺 runtime result type；correlated malformed command response 只拒绝当前 Promise，socket、gateway、其他 pending request 和 status 保持有效。
- unmatched numeric valid/malformed response、string/null success 与未知 malformed object 忽略；string/null error 保持当前 facade terminal behavior；JSON parse failure 仍 terminal。
- attach malformed 仍是 handshake terminal；known projection malformed 仍是 terminal；unknown valid notification 仍被忽略。
- `delta/closed` decoder 的 runtime proof 与 generated v2 返回类型一致。
- `attach/event` 返回 frontend-owned DTO，DTO 每个具体字段都有对应 runtime check。
- attach/event 的成功值与 raw parsed payload 是同一 object reference；额外字段、Redux payload/state 数据和 dispatch 顺序不变。
- command API 返回 `Promise<void>`，生产代码和测试均不再读取或断言 success payload。
- 下游 production source 不使用 generated attach/event 类型或 assertion 绕过 DTO boundary。
- 不新增 runtime validator 依赖，不修改 Rust、generated schema、wire、RPC method、错误文本、close policy 或 Redux runtime behavior。
- Node unit、type-check、`pnpm run ci` 和单列的现有 Browser handoff/Redux 回归全部通过；不新增 browser decoder tests，且 malformed matrix 覆盖 envelope、attach/event、delta/closed、command 和 lifecycle。

## 风险与缓解

### DTO 漏掉现有生产消费字段

风险：静态迁移可能暴露当前通过 generated type 隐式依赖的字段；若只改类型不扩 decoder，会诱发 assertion 回退。

缓解：以 production consumer search 和 TypeScript compile 作为字段清单来源；每增加一个具体 DTO 字段同时添加 runtime check 和 malformed mutation。禁止通过 `as` 或完整 generated intersection 消除类型错误。

### DTO 过度膨胀为手写 generated schema

风险：为了让现有代码编译，可能无差别复制完整 `ThreadItem` union。

缓解：只承诺 production conversion/rendering 实际读取的字段；额外字段继续原样保留为 `unknown`。review 时按 DTO 字段逐项要求消费证据。

### 严格 envelope 改变 lifecycle

风险：version mismatch 或混合 shape 会被显式分类；若 classification、correlation 和 terminal policy 混在 protocol owner 中，可能误关 command socket 或错误终止 unmatched 输入。

缓解：decoder 只分类并保留 recoverable ID；transport 只 correlation；handshake/facade/command 决定 policy。测试必须证明 command malformed 后下一条 command 仍成功，并证明 unmatched numeric/未知 malformed object 保持忽略。

### 大型 snapshot 验证成本

风险：attach DTO 若多次递归或构造新对象，会增加启动延迟和内存峰值。

缓解：单次原位 traversal、无 clone、无 normalization、无第二次 JSON round-trip；性能 review 明确检查 object identity 和遍历 owner。

### Generated contract 漂移

风险：服务端新增字段不会自动进入 frontend DTO；删除或改变已消费字段可能只在 runtime 暴露。

缓解：generated type继续作为 wire contract 参考；合法 fixtures来自 generated shape；DTO 字段可用 generated `Pick`/indexed access做编译时名称与基础类型对齐，但 runtime decoder仍逐字段证明。服务端对已消费字段的 breaking change会在 schema/type compilation和 decoder tests中同时暴露。

### 测试 fixture 自证循环

风险：decoder 和测试都使用同一不完整手写 object，可能共同遗漏 generated required field或实际消费字段。

缓解：合法基线复用真实 projection JSON fixture/shared builders；malformed测试只对合法基线进行单点 mutation；type tests、decoder unit tests和 lifecycle tests分别验证静态、局部 runtime 与端到端 policy。
