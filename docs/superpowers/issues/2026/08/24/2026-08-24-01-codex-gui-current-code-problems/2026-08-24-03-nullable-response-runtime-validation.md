# nullable response 字段的运行时验证与 TypeScript 契约不一致

日期: 2026-08-24
状态: ✅ 已修复
范围: `codex-rs/app-server-protocol` schema / generated TypeScript、`codex-gui` generated runtime validator 与 thread list 消费链
优先级: P1

## 摘要

app-server v2 response 的字段存在性与 nullable 值域已经从 Rust 权威类型统一到 TypeScript、JSON Schema 和 Codex GUI runtime validator；缺少必传 nullable 字段的响应现会在 transport 边界被拒绝。

## 问题

修复前，`ThreadListResponse.nextCursor` 与 `backwardsCursor` 的 TypeScript 契约要求字段必须存在，值可以是 `string` 或 `null`；同一 Rust 类型生成的 JSON Schema 却只要求 `data` 存在，因此由该 schema 生成的 Ajv validator 会接受缺少 cursor 字段的对象。

transport 把这个 validator 作为 response 类型守卫。修复前，缺失字段产生的 `undefined` 会以 `string | null` 的静态类型继续流向 thread history 消费者；下游又使用 nullish 判断，使 `undefined` 被静默当作没有下一页，而不是暴露协议违规。

## 证据

- `codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1581-1599`：`ThreadListResponse` 的两个 cursor 仍为 `Option<String>`，并使用 `schemars(required, schema_with = "...nullable_string_schema")` 明确表达“字段必传、值可为 null”。
- `codex-rs/app-server-protocol/schema/json/v2/ThreadListResponse.json`：根级 `required` 现同时包含 `backwardsCursor`、`data`、`nextCursor`，两个 cursor 的值域仍为 `string | null`。
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js:837,9022-9074`：生成 validator 现显式拒绝缺少 `backwardsCursor` 或 `nextCursor` 的 response，并继续接受合法 `null`。
- `codex-rs/app-server-protocol/src/schema_fixtures_tests.rs:180`：stable/experimental 交叉契约测试从 fresh TypeScript 与 JSON Schema 核对 response 字段存在性和 nullable 值域。
- `codex-rs/app-server/tests/suite/v2/config_rpc.rs:219`：原始 wire 回归验证 `ConfigReadResponse.layers` 在 `includeLayers=false` 时省略、为 `true` 时是数组。
- `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts:169-183`：GUI 回归覆盖 `thread/list` 与 `thread/resume` 的四个字段，断言缺失被拒绝、显式 `null` 被接受。

## 判断

问题已修复。根因位于 ts-rs 与 schemars 对 Rust `Option<T>` response 字段存在性的不同默认解释，修复落在 Rust 权威 schema 表达与机械生成链，而不是在 transport 或 consumer 中兼容 `undefined`。

修复覆盖 manifest 可达的全部 v2 response：53 个普通字段统一为 required + nullable；`ConfigReadResponse.layers`、`McpServerToolCallResponse.isError` 与 `EnvironmentStatusResponse.error` 保持 optional + non-null。生成物均由固化入口刷新，没有手工修改 validator、JSON Schema、TypeScript 或压缩导出。

## 修复记录

- `7d7b85f2caa27e965e963c36e6fafbfffb26055b`：统一 Rust response 契约并增加跨生成物与 wire 回归测试。
- `6371419f13c300550a1e0eb2075312930c892e02`：恢复 `just write-app-server-schema` 固化入口。
- `5fe2e64dff6039d57c8a8de91b05d304f3752d25`：重新生成 stable/experimental protocol schema、TypeScript 与预计算导出。
- `2761ff3d5dc8d2816d74743703842432e2f00400`：增加 GUI runtime validator 四字段回归测试。
- `21546c740634d81b4caa0ee7747d07bea39fc67f`：重新生成 GUI app-server validators。

## 验证记录

- protocol stable/experimental fixture 与预计算导出四个窄测试通过。
- response 字段存在性与 nullable 值域交叉契约测试通过。
- `ConfigReadResponse.layers` 原始 wire 契约测试通过。
- GUI 目标测试 `29/29` 通过，TypeScript type-check、validator drift check 与 oxfmt check 通过。
- 全部测试完成后运行 `just fmt`；格式化后未重跑测试。

## 影响

- runtime validator 再次可以作为 generated response 类型收窄的可信边界。
- 缺失分页 cursor 不再被静默解释为正常分页结束，而会在 transport 验证阶段暴露协议违规。
- stable/experimental 的通用交叉测试会阻止同类字段存在性或 nullable 值域漂移再次进入生成物。

## 后续处理

本 issue 无剩余修复项。后续 v2 response 新增 optional 或 nullable 字段时，应继续由 Rust 权威类型表达契约、通过固化入口生成产物，并保持交叉契约测试通过。

## 历史记录

- 2026-08-24 初次静态核验时状态为 `🔴 未修复`：TypeScript 将 `ThreadListResponse` cursor 表达为必传 nullable，但 JSON Schema 与 GUI validator 允许字段缺失；transport 和 thread history consumer 会把漏出的 `undefined` 静默当作分页结束。
- 原诊断已排除手改生成物和 consumer `undefined` fallback；后续设计与实施确认该判断正确。
