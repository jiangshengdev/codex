# Codex GUI 权威契约漂移

日期: 2026-07-16
状态: 🔴 未修复
范围: `codex-gui` 与 Rust GUI Host / app-server protocol 的跨模块契约边界
优先级: P2

## 摘要

`codex-gui` 的大部分 production 领域模型仍直接使用 Rust 生成的 TypeScript 类型或机械类型派生，但 GUI Host 边界存在两组明确的契约漂移：已有 generated protocol 被擦除后通过手写 validator、宽泛泛型和 assertion 恢复；尚未进入生成链的 launch URL、WebSocket route 与 authenticate 前置协议则由 Rust 和前端分别手写。Rust 侧发生不兼容变化时，这些边界不能稳定传播为前端 generation、type-check 或 build 错误，可能退化为运行时连接失败、协议拒绝或静默误分类。

## 问题

### Generated app-server protocol 被擦除并手写重建

GUI Host 接收边界先把 JSON-RPC 消息转换为手写的宽泛 `RpcMessage`，再用前端字段清单和 literal union 将 `unknown` / `Record<string, unknown>` 重新声明为完整 generated projection 类型。attach/event validator 只验证少量外壳字段，却通过 type predicate 承诺完整 generated payload；delta/closed validator 虽覆盖更多当前字段，仍与 Rust/generated 来源没有机械链接。

请求发送边界使用 `request<TResponse>(method: string, params: unknown)`、自由响应泛型和 `result as TResponse`。这切断了 method、params 与 response 的类型关联，也绕过了已经生成的 `ClientRequest` 与 `ServerNotification` 判别联合。缺失的 response result 还会通过空对象 fallback 进入后续流程。

### Rust GUI Host 私有契约没有机械导出路径

Rust GUI Host 负责生产 launch URL、注册 WebSocket route 并定义首帧 authenticate 协议，但这些契约没有生成或共享的 TypeScript artifact。前端分别手写：

- launch URL 的 `threadId` query key 与 `token` fragment key；
- WebSocket endpoint `/ws`；
- `gui/authenticate` method、`params.token` 与 `result.authenticated`；
- QR access URL 中同一组 `threadId` / `token` 字段。

Rust 修改这些字段、路径或消息结构时，前端不会在编译阶段失败，只会在启动、扫码访问或 WebSocket 握手时暴露运行时错误。

### Generated variant 的语义分类未完全传播失败

部分 downstream 代码直接接受 generated 类型，但又用手写 literal 或非穷尽分类表达协议语义：

- projection closed 处理固定产生 `"backpressure"`，没有使用 generated `notification.reason`；
- snapshot replay 手写当前 terminal `TurnStatus` 集合；
- 部分 event reducer / state transition 的 `void` switch 没有 `never` exhaustiveness 门禁。

这些位置不是手写 DTO，但上游 variant 或语义发生变化时，前端不一定被迫重新判断对应行为。

### 合法测试 payload 绕过共享 fixture builder

5 个测试文件仍在本地展开或组合合法 projection attach/event/turn payload，而不是通过 `projectionFixtures.ts` 与 `projectionTestBuilders.ts` 的共享 builder surface 构造。这不会直接改变 production 类型边界，但会增加 fixture 与 generated contract 分散漂移的风险，并违反当前 `Test Fixture Invariants`。

## 证据

### Production generated protocol 边界

- `codex-gui/src/features/guiHost/guiHostProtocol.ts:8-17`：手写 `RpcMessage`，将 `result` 与 `params` 擦除为宽泛 record。
- `codex-gui/src/features/guiHost/guiHostProtocol.ts:47-208`：手写 attach/event/delta/closed 字段验证、event/delta discriminant、timestamp/index 字段和 `backpressure` literal，并通过 type predicate 声明 generated 类型。
- `codex-gui/src/features/guiHost/guiHostProtocol.ts:145-150`：turn 只验证 `id` 与 `items` array，item 只验证 `id`，但上层 predicate 声明完整 generated event notification。
- `codex-gui/src/features/guiHost/guiHostClient.ts:129-167`：`method: string`、`params: unknown` 与自由 `TResponse`。
- `codex-gui/src/features/guiHost/guiHostClient.ts:148-150`：使用 `result as TResponse` 恢复调用方指定类型。
- `codex-gui/src/features/guiHost/guiHostClient.ts:170-176`：手写 command method/response 关联与宽泛 handshake request。
- `codex-gui/src/features/guiHost/guiHostClient.ts:235`：缺失 result 通过 `{}` fallback settle。
- `codex-gui/src/features/guiHost/guiHostClient.ts:295-322`：手写三种 projection notification method routing。
- `codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts:93`：generated client request method/params 判别联合。
- `codex-rs/app-server-protocol/schema/typescript/ServerNotification.ts:80`：generated server notification method/params 判别联合。
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionAttachResponse.ts:6`、`ThreadProjectionEvent.ts:9`、`ThreadProjectionDelta.ts:9`、`ThreadProjectionClosedReason.ts:5`：projection payload 与 variant 的 generated 权威类型。

### Rust GUI Host 私有契约

- `codex-gui/src/features/browserLaunch/browserLaunchParams.ts:1-4,19-40`：手写 `BrowserLaunchParams`、`threadId` query 与 `token` fragment 解析。
- `codex-gui/src/features/qrAccess/qrAccessUrl.ts:1-10`：再次手写 `threadId` / `token` URL contract。
- `codex-gui/src/features/guiHost/guiHostClient.ts:77`：手写 `/ws` endpoint。
- `codex-gui/src/features/guiHost/guiHostClient.ts:175-180,251-252`：手写 `gui/authenticate`、`params.token` 与 `result.authenticated`。
- `codex-rs/gui-host/src/url.rs:59-109`：Rust launch URL producer；固定生成 `?threadId=...#token=...`。
- `codex-rs/gui-host/src/host.rs:117-155`：Rust dev/prod router 注册 `/ws`。
- `codex-rs/gui-host/src/ws.rs:36-47,110-124,226-235`：Rust authenticate request、校验规则与 success response。

### Downstream 失败传播

- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:9-12,125-135`：手写 reconnect reason 的 `backpressure`，`handleClosed` 未使用 generated `notification.reason`。
- `codex-gui/src/features/snapshotReplay/snapshotReplay.ts:33-34`：手写 terminal `TurnStatus` 分类。
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:150-162`：generated event 的 `void` switch 无显式 exhaustive 门禁。
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:114`：同类 event state transition switch。

### 测试 fixture

- `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts:22`：本地 `deriveEvent`、`deriveDelta`、attach/closed helper。
- `codex-gui/src/__tests__/App.browser.test.tsx:310`：多处展开合法 event/attach payload 并覆盖 commit/head 字段。
- `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts:95`：本地展开合法 `Turn`。
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts:150`：本地展开合法 turn/event payload。
- `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts:215`：本地展开合法 `turnStarted` event。

### 已排除项

- `ThreadRuntimeRecord`、snapshot/live timeline materials、Transcript State、rendering chunk、scroll revision 与 GUI status 表达不同的前端运行时或展示语义，不是 Rust DTO 重命名。
- `Omit<Turn, "items">`、`Extract<ThreadItem, ...>["phase"]` 等保持 generated 依赖的机械派生符合约束。
- `materializeTranscriptItem` 与 user input materialization 使用 generated union，并通过 `never` 保持 variant exhaustiveness。
- error handling、locale guard、Navigator capability check、URL/storage 作为不可信输入的普通边界不属于 generated contract 重建。
- malformed test payload、JSON-RPC envelope assertion 与 expected-state object 可以在测试内显式书写，不属于合法协议 fixture 漂移。

## 判断

问题当前仍成立，但不是“整个前端都在手写 Rust 类型”。高风险边界集中在 GUI Host 的 transport/protocol、browser launch/QR access 与 Rust GUI Host 私有握手契约；大多数 projection、thread runtime、timeline 和 transcript production 模型仍直接依赖 generated 类型或机械派生。

提交 `1052a362` 不能作为后续修正依据。该提交提出以 frontend-owned attach/event DTO 和手写 structural validator 替换 generated production contract，会进一步切断 Rust → generated TypeScript → frontend type-check 的失败传播。`Promise<void>` 等局部决策可以独立重新评估，但不能保留该提交的 DTO/validator 方向。

## 影响

- Rust 删除、重命名或改变已消费字段时，部分前端边界可能继续编译，在运行时才拒绝消息或错误解释 payload。
- Rust 新增或修改 GUI Host launch/auth/route 契约时，扫码、页面启动或 WebSocket 握手可能直接失败，而 CI/type-check 无法提前发现。
- 自由 response 泛型和 assertion 允许调用方声明没有 runtime 证据的成功类型；空对象 fallback 还可能制造虚假成功值。
- 手写 validator、literal union 与分散 fixture 会随 generated contract 演进产生多处维护点，使测试可能验证前端自有副本而不是权威契约。

## 后续处理

后续需要单独进入设计阶段，且至少保持两个独立问题边界：

- app-server generated protocol 边界：以现有 `ClientRequest`、`ServerNotification` 和 generated payload 为唯一权威来源，保留 method/params/variant 的机械关联；不得用 frontend-owned DTO、宽泛泛型、assertion 或手写 validator 重建契约。
- Rust GUI Host 私有契约：先在 Rust 权威侧确定 launch URL、WebSocket endpoint 与 authenticate 协议的机械导出路径，再让前端消费该 artifact；不能只在前端抽常量或再写一套类型。

Downstream exhaustiveness 与测试 fixture 可作为较小的独立收敛项处理，但不得借此扩大为业务行为重构。任何 runtime validation 若代表 Rust/generated contract，必须从同一权威来源机械生成；当前没有 generated validator 时，不得在前端复制 schema。
