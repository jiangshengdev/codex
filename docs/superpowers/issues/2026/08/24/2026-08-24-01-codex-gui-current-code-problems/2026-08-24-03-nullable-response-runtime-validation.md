# nullable response 字段的运行时验证与 TypeScript 契约不一致

日期: 2026-08-24
状态: 🔴 未修复
范围: `codex-rs/app-server-protocol` schema / generated TypeScript、`codex-gui` generated runtime validator 与 thread list 消费链
优先级: P1

## 摘要

`thread/list` response 的 cursor 字段在生成 TypeScript 中是必传 nullable 字段，但生成 JSON Schema 和 runtime validator 允许字段缺失，导致运行时验证可以把不满足静态契约的响应收窄为合法 `ThreadListResponse`。

## 问题

`ThreadListResponse.nextCursor` 与 `backwardsCursor` 的 TypeScript 契约要求字段必须存在，值可以是 `string` 或 `null`。同一 Rust 类型生成的 JSON Schema 却只要求 `data` 存在，因此由该 schema 生成的 Ajv validator 会接受缺少 cursor 字段的对象。

transport 把这个 validator 作为 response 类型守卫。验证通过后，缺失字段产生的 `undefined` 会以 `string | null` 的静态类型继续流向 thread history 消费者；下游又使用 nullish 判断，使 `undefined` 被静默当作没有下一页，而不是暴露协议违规。

## 证据

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1508-1515`：Rust 权威 response 类型将 `next_cursor` 与 `backwards_cursor` 定义为 `Option<String>`。
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadListResponse.ts:6-18`：ts-rs 生成的 `ThreadListResponse` 将 `nextCursor` 与 `backwardsCursor` 表达为必传的 `string | null` 字段，而不是 optional 字段。
- `codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.schemas.json:20786-20818`：生成 JSON Schema 为两个 cursor 声明 `string | null`，但 `required` 数组只有 `data`。
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js:9016-9082`：生成 validator 只把 `data` 缺失视为错误；`backwardsCursor` 或 `nextCursor` 为 `undefined` 时直接跳过字段验证并返回有效。
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts:17-19`：同一个 validator 被声明为 `ProtocolValidator<RequestResponse<"thread/list">>`，即验证成功会把值收窄为完整的 generated response 类型。
- `codex-gui/src/features/guiHost/guiHostTransportSession.ts:237-243`：transport 在 validator 返回成功后，以 `T` 完成 request；此处会把缺失 cursor 的对象交给调用方。
- `codex-gui/src/features/threadHistory/threadHistoryListOwner.ts:134`：owner 直接把 `response.nextCursor` 发布为静态类型声明的 `string | null`，运行时缺失时实际会传入 `undefined`。
- `codex-gui/src/features/threadHistory/threadHistoryListOwner.ts:147`：`nextCursor == null` 同时匹配 `null` 和 `undefined`，因而把缺失字段静默解释为没有下一页。
- 本轮未运行测试；以上结论来自 2026-08-24 对当前生成物、transport 和直接消费者的静态核验。

## 判断

问题当前仍成立。根因是同一 Rust 权威类型经 ts-rs 与 JSON Schema/runtime validator 生成链后产生了不同的字段存在性约束，而不是 `threadHistoryListOwner` 单独缺少一次空值处理。

不能通过手工修改 `ThreadListResponse.ts`、JSON Schema 或 `appServerPayloadValidators.js` 解决；这些都是生成物，手改会在下次生成时丢失，也无法防止其他 nullable response 字段出现同类漂移。修复必须收敛权威 schema 与生成链的一致性，并由项目生成入口重新生成产物。

## 影响

- runtime validation 对非法或不完整的 `thread/list` response 产生假阳性，破坏 validator 作为类型收窄证据的可信度。
- pagination cursor 缺失会被解释为正常分页结束，协议生产端或生成链回归可能被隐藏，用户看到的表现可能只是线程列表提前停止加载。
- 同类生成规则若作用于其他 response 的 nullable 字段，风险可能不只限于 `ThreadListResponse`；当前证据尚未量化完整影响面。

## 后续处理

需要单独进入修复设计与计划阶段，核验 response 中“必传但可为 null”的权威表达和两条生成路径，修正生成链后通过项目固化入口重生成 schema、TypeScript 与 runtime validators，并增加能够阻止字段存在性再次漂移的契约验证。不得直接手改生成物。
