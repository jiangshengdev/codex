# Codex GUI 权威契约漂移

日期: 2026-07-16
状态: ✅ 已修复
范围: `codex-gui` 与 Rust GUI Host / app-server protocol 的跨模块契约边界
优先级: P2

## 摘要

该问题已于 2026-07-16 修复。app-server request/response metadata、运行时 validator 与 descriptor 现在由 Rust 权威契约机械生成；Rust GUI Host 私有 browser contract 也有独立 owner、schema、TypeScript artifact 与 Ajv standalone validator。GUI transport、launch/QR/authenticate 消费者、downstream exhaustiveness 和合法 projection fixture 已迁移到这些机械链接的来源。

## 问题

以下内容保留为 2026-07-16 审计时的问题描述，不代表当前实现仍采用这些边界。

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

以下路径与行号是修复前的审计历史证据，用于保留问题来源和 taxonomy；当前代码位置与架构已随修复变化。

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

问题已修复，原判断中的范围边界仍然有效：这不是“整个前端都在手写 Rust 类型”，而是 GUI Host transport/protocol、browser launch/QR access、Rust GUI Host 私有握手契约以及少量 downstream exhaustiveness 和 fixture 的集中漂移。

最终实现保持 Rust 为唯一契约 owner，没有采用提交 `1052a362` 中 frontend-owned DTO 与手写 structural validator 的方向。app-server protocol 与 GUI Host 私有 browser contract 仍是两个独立权威边界，私有 authenticate、launch URL 和 WebSocket route 没有被加入 app-server v2 API。

## 修复记录

完成日期: 2026-07-16

- `59fe41f24`: 锁定 GUI Host 权威契约迁移前的行为。
- `47096ad42`: 从 app-server protocol 导出 request/response definitions。
- `65bdc2da3`: 生成 Ajv standalone validators、typed registry 与 descriptors。
- `4af8b73d7`: GUI transport 消费 generated app-server contracts。
- `19d4afad0`: 生成并原子迁移 Rust GUI Host 私有 browser contract。
- `59a63e896`: 收敛 downstream exhaustiveness 与合法 projection fixtures。
- 支持依赖提交：`cbcb5a891`（Ajv v8）、`480643e08`（esbuild）。
- CI ignore 修正：`022fb8a48`，仅排除不透明 generated standalone validator JavaScript 的格式化与 lint。
- 终审修正：`9463c358d`（generated JSON-RPC envelope validation）、`c0b9f2048`（CI generated drift gate）、`ced547dff`（fixture writer restore failures）。

修复后的权威链路为 Rust types/macros → ts-rs 与 schemars artifacts → 同一 frontend generator 的 Ajv standalone validators、declarations、typed registries/descriptors → GUI consumers。GUI Host 私有契约由 `codex-rs/gui-host` 独立拥有，不污染 app-server protocol。

## 验证记录

- Rust 6 个 focused tests 全部通过；authenticate parser 的实际测试 filter 为 `parses_valid_authenticate_request`。
- app-server protocol schema、GUI Host browser contract schema、frontend generated validators 三棵 generated tree 重生成后无 diff。
- frontend `ci` 通过：29 个 test files、243 个 tests。
- generator focused verification 通过：35 个 tests。
- generated JSON-RPC envelope validator 覆盖 3 个 invalid envelope cases。
- Rust fixture writer restore failure 覆盖 2 个 tests。
- production build 通过：1265 modules；app-server 与 GUI Host 两组 standalone validator 均进入实际 bundle。
- Browser Mode 通过：Chromium、Firefox、WebKit 3 个实例，共 87 个 tests。
- 最终 `just fix` 覆盖两个变更 crate，随后 `just fmt`，均未产生额外 diff。
- `bazel mod deps --lockfile_mode=error` 通过，`MODULE.bazel.lock` 无漂移。
- 最终代码复审未发现 Critical 或 Important 问题。

### 2026-07-17 validator bundle 体积复核

- 根因确认：完整 `ServerNotification` validator 被纳入 production graph。baseline 的 main bundle 为 1,320,592 raw bytes、约 278.16 kB gzip，`dist` 总大小为 11,604,274 bytes；最终 main bundle 为 905,183 raw bytes、247,498 gzip bytes，`dist` 总大小为 11,188,829 bytes。
- main bundle 恢复 415,409 bytes，`dist` 总大小恢复 415,445 bytes，超过计划要求的至少 400 kB。
- selected ESM validator groups 的 payload 为 475,246 bytes，envelope 为 19,010 bytes，合计 494,256 bytes。
- `windowsSandbox` method literal 在 main bundle 中仅保留 1 次，用于 known-notification classifier；对应 payload type、mode 和 validator markers 均完全缺失。这里保留的是 method literal，不代表 payload code 或 validator code 仍进入 production graph。
- GUI 当前选中的 3 个 notification methods 仍保留对应 validator；Shiki representative exact bytes 与 baseline 完全一致。
- 从 `codex-gui/` 执行并通过：`/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators`；`/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run scripts/protocolValidators/core.test.ts scripts/protocolValidators/cli.test.ts src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts`（104 tests）；`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`；`/opt/homebrew/bin/fnm exec --using-file pnpm run build`。
- 从 `codex-rs/` 执行 `just fmt` 并通过。
- 本轮本地提交：`baa7fcb6b`、`22c3c6a22`、`9eb81cf6c`、`062d90bba`。

## 影响

- Rust 删除、重命名或改变 GUI 已消费的 app-server 字段、method、response 或 notification variant 时，会通过 generation、validator drift、type-check、测试或 build 传播失败。
- GUI Host launch key、WebSocket route、authenticate payload/result 的变化会从 Rust 私有 owner 机械传播到 TypeScript、JSON Schema、runtime validator 与 frontend consumers。
- response 不再通过自由泛型、assertion 或空对象 fallback 制造无 runtime 证据的成功值；malformed handshake/command 继续遵循原有 terminal/non-terminal policy。
- 合法 projection fixture 与 downstream event/status 分类已收敛到 generated-linked builders 和 exhaustiveness gates，减少分散副本。

## 后续处理

本 issue 无剩余修复项。后续变更继续遵守 `codex-gui/AGENTS.md` 的单一权威契约与 fixture invariants，并保持 app-server protocol 与 GUI Host 私有 browser contract 两条生成链独立。

本次明确不包含 UI 或 Redux 业务重构、不新增 app-server v2 API、不引入其他 validator library。现有 fnm deprecation warning、Vitest type-check experimental warning 与 Vite large-chunk warning 不属于本 issue；如需处理，应分别建立独立问题和证据。
