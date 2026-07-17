# Codex GUI 协议校验器包体积优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve every task and local commit boundary; generated files、验证、stage 和 commit 必须作为独立微阶段执行。

**Goal:** 让 `codex-gui` 只生成并加载实际消费的 app-server payload validators，在保持 Rust 权威契约和既有已消费消息语义的同时，至少回收当前 validator 引入的 400 kB 生产包体积。

**Architecture:** 复用 Rust 已有的浅层 `JSONRPCMessage` schema，并从 `ServerNotification` 的同一 Rust schema owner 导出 method→params schema metadata。前端 generator 分别生成 envelope ESM 和 selected payload ESM，使用静态 named exports 与 generated notification classifier，移除完整 `ServerNotification` validator 和 app-server eager registry。

**Tech Stack:** Rust、serde、schemars、ts-rs、Ajv v8 standalone、esbuild、TypeScript Compiler API、oxfmt、Vitest、Vite、pnpm with fnm、Cargo/Just。

---

## Execution rules

- 未经用户明确确认本计划，不得开始实施。
- 不创建新的设计、计划、research 或任务清单文档。
- 不运行任何 Git 远程命令。
- 不安装、升级或删除依赖；本计划不需要依赖变更。
- 使用 TDD：先写失败测试，确认预期失败，再实现最小生产改动并运行聚焦测试。
- Rust generated schema/metadata 只能通过 `just write-app-server-schema` 更新，禁止手工修改生成文件。
- Frontend generated validators 只能通过 `protocol:generate-validators` 更新，禁止手工 patch generated JavaScript、declaration 或 descriptor。
- Ajv standalone JavaScript 继续视为不透明输出；除 generated header 与 esbuild 模块封装外，不解析或重写其内部逻辑。
- 所有 frontend 命令使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不运行裸 `cargo test`、裸 `just test`、crate-wide Rust tests、`pnpm run ci`、全部 unit tests、Browser Mode 或 Playwright。
- Rust 测试通过后再运行 scoped fix 与 `just fmt`；运行 fix/fmt 后不重新运行测试。
- 每个任务只 stage 本任务文件，检查 staged diff，然后创建一个本地 commit。
- 设计和计划文档不随实现任务提交；除非用户另行要求提交文档，始终保持它们在实现 commit 之外。

## Planned commit sequence

1. `feat(app-server-protocol): export server notification definitions`
2. `build(gui): generate selected protocol validators`
3. `refactor(gui): route selected generated notifications`
4. `docs(gui): record validator bundle reduction`

## File responsibility map

### Rust authority and generated metadata

- Modify: `codex-rs/app-server-protocol/src/export.rs` — 从已过滤的 Rust `ServerNotification` schema 机械导出 notification metadata。
- Modify: `codex-rs/app-server-protocol/tests/schema_fixtures.rs` — 锁定 metadata 内容、wire rename、experimental filtering 和浅层 JSON-RPC schema。
- Generate: `codex-rs/app-server-protocol/schema/json/server-notification-definitions.json` — 全部合法 notification method 与 params schema ID。

现有 `codex-rs/app-server-protocol/src/rpc.rs` 已经定义浅层 `JSONRPCMessage`，本计划不修改它。现有 `codex-rs/app-server-protocol/src/protocol/common.rs` 继续是 `ServerNotification` 唯一 owner；本计划不新增第二份 method 表。

### Frontend generator and artifacts

- Modify: `codex-gui/src/features/guiHost/appServerProtocol.ts` — 声明 GUI 选择的三个 notification methods。
- Modify: `codex-gui/scripts/protocolValidators/core.ts` — 加载 notification metadata、选择 schema root、分组生成 ESM、为 app-server 设置 `allErrors: false`。
- Modify: `codex-gui/scripts/protocolValidators/typescriptArtifacts.ts` — 生成分组 declarations、request descriptors 和 notification classifier；移除 app-server eager registry。
- Modify: `codex-gui/scripts/protocolValidators/cli.ts` — 加载新 metadata 并传入 notification selection。
- Modify: `codex-gui/scripts/protocolValidators/core.test.ts` — 锁定 schema slicing、分组 exports、共享闭包和 determinism。
- Modify: `codex-gui/scripts/protocolValidators/cli.test.ts` — 锁定新输入和 stale artifact 原子删除。
- Modify: `codex-gui/.oxfmtrc.json` — 忽略新的 opaque generated JavaScript 文件。
- Modify: `codex-gui/.oxlintrc.json` — 忽略新的 opaque generated JavaScript 文件。
- Generate: `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.raw.js`
- Generate: `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.js`
- Generate: `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.d.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js`
- Generate: `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js`
- Generate: `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/index.ts`
- Remove through generator sync: `codex-gui/src/generated/appServerProtocol/standaloneValidators.raw.js`
- Remove through generator sync: `codex-gui/src/generated/appServerProtocol/standaloneValidators.js`
- Remove through generator sync: `codex-gui/src/generated/appServerProtocol/standaloneValidators.d.ts`
- Remove through generator sync: `codex-gui/src/generated/appServerProtocol/validatorRegistry.ts`

### Transport and behavior tests

- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts` — 使用浅层 envelope validator 和 generated notification classifier。
- Modify: `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts` — 校验具体 generated payload validators。
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts` — 锁定 method→payload 类型 narrowing。
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts` — 锁定三个 projection payload 的合法与非法行为、已知未消费 notification 忽略语义。
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts` — 锁定非法 envelope 与未知 method terminal 行为。
- Verify unchanged: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts` — selected response 和 command error policy 回归验证。

## Task 1: Export authoritative server notification metadata

**Files:**

- Modify: `codex-rs/app-server-protocol/src/export.rs`
- Modify: `codex-rs/app-server-protocol/tests/schema_fixtures.rs`
- Generate: `codex-rs/app-server-protocol/schema/json/server-notification-definitions.json`

- [ ] **Step 1: Add the failing notification metadata fixture test**

在 `codex-rs/app-server-protocol/tests/schema_fixtures.rs` 增加测试 `server_notification_definitions_export_method_and_params_schema`。它通过 `generate_json_with_experimental()` 生成临时 JSON tree，读取 `server-notification-definitions.json`，并至少断言以下完整对象存在：

```rust
json!({
    "method": "thread/projection/event",
    "paramsSchema": "v2/ThreadProjectionEventNotification",
})
json!({
    "method": "thread/projection/delta",
    "paramsSchema": "v2/ThreadProjectionDeltaNotification",
})
json!({
    "method": "thread/projection/closed",
    "paramsSchema": "v2/ThreadProjectionClosedNotification",
})
```

测试还必须：

```rust
assert_eq!(methods.len(), methods.iter().collect::<BTreeSet<_>>().len());
assert!(!methods.contains("process/outputDelta"));
```

随后以 `experimental_api: true` 重新生成并断言 `process/outputDelta` 存在，证明 metadata 沿用 Rust experimental filtering，而不是维护新的过滤规则。

- [ ] **Step 2: Lock the existing shallow JSON-RPC authority**

在同一测试文件增加 `jsonrpc_message_schema_keeps_payloads_opaque`，读取 fresh generated `JSONRPCMessage.json`，断言四种 envelope 仍然存在，并检查 notification/request 的 `params` 与 response 的 `result` schema 为 permissive JSON value，而不是 `$ref` 到 `ServerNotification` 或具体 response payload。

核心断言必须包含：

```rust
assert!(!jsonrpc_source.contains("ServerNotification"));
assert!(!jsonrpc_source.contains("ThreadProjectionEventNotification"));
```

- [ ] **Step 3: Run the new Rust tests and verify RED**

Run from `codex-rs`:

```bash
just test -p codex-app-server-protocol --test schema_fixtures server_notification_definitions_export_method_and_params_schema
```

Expected: FAIL because `server-notification-definitions.json` does not exist.

Run:

```bash
just test -p codex-app-server-protocol --test schema_fixtures jsonrpc_message_schema_keeps_payloads_opaque
```

Expected: PASS, confirming no new Rust envelope DTO is required.

- [ ] **Step 4: Generate the metadata from the filtered ServerNotification schema**

在 `codex-rs/app-server-protocol/src/export.rs` 增加：

```rust
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ServerNotificationDefinitionManifestEntry {
    method: String,
    params_schema: String,
}
```

新增私有函数：

```rust
fn server_notification_definition_manifest(
    flat_v2_bundle: &Value,
) -> Result<Vec<ServerNotificationDefinitionManifestEntry>>
```

函数必须从：

```text
#/definitions/ServerNotification/oneOf/*/properties/method/enum[0]
#/definitions/ServerNotification/oneOf/*/properties/params/$ref
```

机械读取 method 与 params schema，删除 `$ref` 的 `#/definitions/` 前缀，按 method 排序，并对以下情况返回带上下文的错误：

- `ServerNotification` root 缺失；
- `oneOf` 不是数组；
- method enum 不是单值字符串；
- params `$ref` 缺失；
- method 重复。

在 `generate_json_with_experimental()` 写完 `codex_app_server_protocol.v2.schemas.json` 后写入：

```rust
write_pretty_json(
    out_dir.join("server-notification-definitions.json"),
    &server_notification_definition_manifest(&flat_v2_bundle)?,
)?;
```

必须使用已经执行 experimental filtering 的 `flat_v2_bundle`，不得重新读取 macro、维护 literal 列表或从 TypeScript 文本推断。

- [ ] **Step 5: Regenerate Rust schema artifacts**

Run from repository root:

```bash
just write-app-server-schema
```

Expected:

- 新增 `schema/json/server-notification-definitions.json`；
- 三个 projection entries 指向各自 `v2/*Notification` schema；
- 非 experimental artifact 不包含 experimental methods；
- 其他既有 schema 没有非预期变化。

- [ ] **Step 6: Run focused Rust fixture verification**

Run from `codex-rs`:

```bash
just test -p codex-app-server-protocol --test schema_fixtures server_notification_definitions_export_method_and_params_schema
just test -p codex-app-server-protocol --test schema_fixtures jsonrpc_message_schema_keeps_payloads_opaque
just test -p codex-app-server-protocol --test schema_fixtures json_schema_fixtures_match_generated
```

Expected: PASS.

- [ ] **Step 7: Apply scoped Rust fix and formatting**

Run from `codex-rs`, after the tests pass:

```bash
just fix -p codex-app-server-protocol
just fmt
```

Expected: commands complete successfully. Inspect the resulting diff; do not rerun tests after fix/fmt.

- [ ] **Step 8: Commit the Rust metadata boundary**

Stage only the three Task 1 paths, inspect the staged diff, then create:

```text
feat(app-server-protocol): export server notification definitions
```

Do not include the design or plan document.

## Task 2: Generate selected ESM validator groups

**Files:**

- Modify: `codex-gui/src/features/guiHost/appServerProtocol.ts`
- Modify: `codex-gui/scripts/protocolValidators/core.ts`
- Modify: `codex-gui/scripts/protocolValidators/typescriptArtifacts.ts`
- Modify: `codex-gui/scripts/protocolValidators/cli.ts`
- Modify: `codex-gui/scripts/protocolValidators/core.test.ts`
- Modify: `codex-gui/scripts/protocolValidators/cli.test.ts`
- Modify: `codex-gui/.oxfmtrc.json`
- Modify: `codex-gui/.oxlintrc.json`
- Generate/remove: `codex-gui/src/generated/appServerProtocol/**`

- [ ] **Step 1: Add the frontend notification selection**

在 `codex-gui/src/features/guiHost/appServerProtocol.ts` 增加：

```ts
import type { ServerNotification } from "@codex-protocol/ServerNotification";

export const APP_SERVER_NOTIFICATION_METHODS = [
  "thread/projection/event",
  "thread/projection/delta",
  "thread/projection/closed",
] as const satisfies readonly ServerNotification["method"][];
```

该列表只选择消费范围，不声明 params shape。

- [ ] **Step 2: Rewrite generator fixtures to match the real shallow envelope**

在 `core.test.ts` 的 fixture bundle 中，让 `JSONRPCMessage` 只引用 fixture request、notification、response 和 error envelope，且 `params/result` 使用 permissive schema。不要再让 fixture `JSONRPCMessage` 引用 `ServerNotification`。

增加 notification metadata fixture：

```ts
[
  { method: "fixture/selected", paramsSchema: "v2/SelectedNotification" },
  { method: "fixture/unselected", paramsSchema: "v2/UnselectedNotification" },
]
```

- [ ] **Step 3: Add failing schema-selection and artifact tests**

在 `core.test.ts` 增加以下失败测试：

```text
loads real Rust request and notification metadata
rejects duplicate notification methods
rejects selected notification missing from metadata
rejects selected notification params schema missing from bundle
emits separate JSON-RPC envelope and selected payload ESM groups
payload ESM contains SelectedNotification but not UnselectedNotification
payload ESM does not contain windowsSandbox/setupCompleted for real Rust inputs
envelope ESM does not contain ThreadProjectionEventNotification
declarations and descriptors match each runtime group exactly
app-server artifacts contain no validatorRegistry.ts
generation remains byte-for-byte deterministic
```

预期 artifact key 必须精确为：

```ts
[
  "appServerPayloadValidators.d.ts",
  "appServerPayloadValidators.js",
  "appServerPayloadValidators.raw.js",
  "index.ts",
  "jsonRpcEnvelopeValidators.d.ts",
  "jsonRpcEnvelopeValidators.js",
  "jsonRpcEnvelopeValidators.raw.js",
  "notificationDescriptors.ts",
  "requestDescriptors.ts",
]
```

在 `cli.test.ts` 增加 `server-notification-definitions.json` 输入，并断言 write 模式原子删除旧 `standaloneValidators*` 与 `validatorRegistry.ts`，check 模式能报告任一新 group 漂移。

- [ ] **Step 4: Run generator tests and verify RED**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  scripts/protocolValidators/core.test.ts \
  scripts/protocolValidators/cli.test.ts
```

Expected: FAIL because notification metadata、grouped artifacts and selected payload generation are not implemented.

- [ ] **Step 5: Extend generator input and validation types**

在 `core.ts` 和 `typescriptArtifacts.ts` 增加：

```ts
export type NotificationDefinitionMetadata = {
  method: string;
  paramsSchema: string;
};
```

将 app-server generator options 扩展为：

```ts
type GenerateProtocolArtifactsOptions = {
  schemaBundle: JsonObject;
  requestDefinitions: readonly JsonObject[];
  notificationDefinitions: readonly JsonObject[];
  selectedRequestMethods: readonly string[];
  selectedNotificationMethods: readonly string[];
  dependencies?: GeneratorDependencies;
};
```

notification selection 必须与 request selection 一样建立 method map，拒绝重复、缺失和不存在的 params schema。

- [ ] **Step 6: Generalize standalone group generation**

把 `generateStandaloneArtifacts()` 改为接收显式 basename 和 Ajv options：

```ts
type StandaloneGroupOptions = {
  basename: "jsonRpcEnvelopeValidators" | "appServerPayloadValidators" | "standaloneValidators";
  schemaBundle: JsonObject;
  schemaBundleId: string;
  rootSchemaIds: readonly string[];
  allErrors: boolean;
  dependencies: GeneratorDependencies;
};
```

输出文件名由 basename 机械生成：

```ts
`${basename}.raw.js`
`${basename}.js`
```

`buildAjvValidators()` 接收 `allErrors`。app-server 两组传 `false`；GUI Host contract 继续使用原 `standaloneValidators` basename，并保持当前 `allErrors` 行为，避免扩大变更范围。

分别生成：

```ts
envelope roots = ["JSONRPCMessage"]
payload roots = [
  ...selectedResponses.map(({ responseSchema }) => responseSchema),
  ...selectedNotifications.map(({ paramsSchema }) => paramsSchema),
]
```

不得把 `ServerNotification` 加入任何 root。

- [ ] **Step 7: Generate direct declarations and notification classification**

在 `typescriptArtifacts.ts` 中：

- 为 envelope group 生成 `validateJSONRPCMessage: ProtocolValidator<JSONRPCMessage>` declaration；
- 为 payload group 生成 selected response declarations；
- 对每个 selected notification params validator 使用：

```ts
ProtocolValidator<
  Extract<ServerNotification, { method: "thread/projection/event" }>["params"]
>
```

- `requestDescriptors.ts` 从 `./appServerPayloadValidators.js` 直接 named import response validators；
- 删除 app-server `validatorRegistry.ts` 生成路径；
- `notificationDescriptors.ts` 从 payload module 直接 named import 三个 params validators，并生成一个静态 switch classifier。

classifier 的公开结果类型固定为：

```ts
export type SelectedServerNotification = Extract<
  ServerNotification,
  {
    method:
      | "thread/projection/event"
      | "thread/projection/delta"
      | "thread/projection/closed";
  }
>;

export type ServerNotificationClassification =
  | { type: "selected"; notification: SelectedServerNotification }
  | { type: "selectedInvalid"; method: SelectedServerNotification["method"] }
  | { type: "knownUnconsumed" }
  | { type: "unknown" };
```

实现必须由 generated method metadata 构造 switch：

```ts
export function classifyServerNotification(
  notification: JSONRPCNotification,
): ServerNotificationClassification {
  switch (notification.method) {
    case "thread/projection/event": {
      if (!validateV2ThreadProjectionEventNotification(notification.params)) {
        return { type: "selectedInvalid", method: notification.method };
      }
      return {
        type: "selected",
        notification: { method: notification.method, params: notification.params },
      };
    }
    case "thread/projection/delta": {
      if (!validateV2ThreadProjectionDeltaNotification(notification.params)) {
        return { type: "selectedInvalid", method: notification.method };
      }
      return {
        type: "selected",
        notification: { method: notification.method, params: notification.params },
      };
    }
    case "thread/projection/closed": {
      if (!validateV2ThreadProjectionClosedNotification(notification.params)) {
        return { type: "selectedInvalid", method: notification.method };
      }
      return {
        type: "selected",
        notification: { method: notification.method, params: notification.params },
      };
    }
    default:
      return isKnownServerNotificationMethod(notification.method)
        ? { type: "knownUnconsumed" }
        : { type: "unknown" };
  }
}
```

`isKnownServerNotificationMethod()` 及其 literal cases 必须由完整 Rust notification metadata 生成。`typescriptArtifacts.ts` 应通过 `notificationDefinitions.map(...)` 构造 TypeScript AST case clauses，不得在 generator 源码中手写完整 method 列表。

不要生成 eager validator registry，不要通过 method 字符串动态索引 validator object。

- [ ] **Step 8: Extend the CLI and generated ignore rules**

`cli.ts` 必须加载：

```text
codex-rs/app-server-protocol/schema/json/server-notification-definitions.json
```

并从 `appServerProtocol.ts` 读取 `APP_SERVER_REQUEST_METHODS` 与 `APP_SERVER_NOTIFICATION_METHODS`。保持现有多 group 原子 write/check 机制。

将 `.oxfmtrc.json` 和 `.oxlintrc.json` 的 generated ignore 更新为覆盖：

```text
src/generated/appServerProtocol/*Validators.raw.js
src/generated/appServerProtocol/*Validators.js
```

不得忽略 declarations、descriptors 或其他 authored TypeScript。

- [ ] **Step 9: Generate the new app-server artifacts**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
```

Expected:

- 创建两个 app-server ESM groups；
- 原子删除旧单体 app-server validator 和 registry；
- GUI Host contract generated group 保持独立；
- generated diff 中不出现手写修改。

- [ ] **Step 10: Run focused generator tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  scripts/protocolValidators/core.test.ts \
  scripts/protocolValidators/cli.test.ts
```

Expected: PASS.

- [ ] **Step 11: Apply scoped frontend formatting and lint fixes**

Run from `codex-gui` against authored files only:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt \
  scripts/protocolValidators/core.ts \
  scripts/protocolValidators/typescriptArtifacts.ts \
  scripts/protocolValidators/cli.ts \
  scripts/protocolValidators/core.test.ts \
  scripts/protocolValidators/cli.test.ts \
  src/features/guiHost/appServerProtocol.ts \
  --write

/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint \
  scripts/protocolValidators/core.ts \
  scripts/protocolValidators/typescriptArtifacts.ts \
  scripts/protocolValidators/cli.ts \
  scripts/protocolValidators/core.test.ts \
  scripts/protocolValidators/cli.test.ts \
  src/features/guiHost/appServerProtocol.ts \
  --fix

/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint \
  scripts/protocolValidators/core.ts \
  scripts/protocolValidators/typescriptArtifacts.ts \
  scripts/protocolValidators/cli.ts \
  scripts/protocolValidators/core.test.ts \
  scripts/protocolValidators/cli.test.ts \
  src/features/guiHost/appServerProtocol.ts \
  --fix --no-cache
```

Inspect the diff. Do not manually format generated JavaScript.

- [ ] **Step 12: Commit the generator boundary**

Stage only Task 2 authored files and `src/generated/appServerProtocol/**`, inspect the staged diff, then create:

```text
build(gui): generate selected protocol validators
```

Do not include transport production changes or docs.

## Task 3: Route selected generated notifications

**Files:**

- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- Verify: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`

- [ ] **Step 1: Add failing generated-contract behavior tests**

在 `generatedAppServerProtocol.test.ts` 直接 import 两个 runtime groups，断言：

```text
validateJSONRPCMessage accepts request/notification/success/error envelopes with opaque payloads
validateJSONRPCMessage rejects arrays, primitives and mutually invalid response shapes
each selected projection params validator accepts a legal fixture
each selected projection params validator rejects missing required fields
```

在 `guiHostGeneratedProtocol.test.ts` 使用 `expectTypeOf` 锁定 selected classifier 返回的 notification 与对应 generated `Extract<ServerNotification, { method: M }>` 一致。

- [ ] **Step 2: Add failing transport behavior tests**

在 `guiHostHandshake.test.ts` 增加：

```ts
socket.serverMessage({
  method: "thread/started",
  params: {},
});
```

其中 `thread/started` 是 Rust metadata 中已知但 GUI 未消费的 method，故即使 payload 不完整也必须：

```text
not call projection callbacks
not emit error status
not close the socket
```

在 `guiHostProtocolErrors.test.ts` 增加未知 method：

```ts
socket.serverMessage({
  method: "fixture/unknown-notification",
  params: {},
});
```

Expected:

```text
status becomes the existing malformed/protocol error
socket closes with protocol error policy
no projection callback fires
```

保留并扩展现有三组 malformed projection tests，证明 selected payload 仍严格校验。

- [ ] **Step 3: Run focused contract and transport tests and verify RED**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  src/features/guiHost/__tests__/guiHostCommands.test.ts
```

Expected: new known-unconsumed/unknown behavior tests FAIL against the current full `ServerNotification` flow; existing response and projection tests remain PASS.

- [ ] **Step 4: Replace full notification validation in guiHostClient**

将 imports 改为直接依赖：

```ts
import { validateJSONRPCMessage } from "@/generated/appServerProtocol/jsonRpcEnvelopeValidators.js";
import {
  classifyServerNotification,
  requestDescriptors,
} from "@/generated/appServerProtocol";
```

移除：

```text
validatorRegistry
validateServerNotification
isProjectionServerNotification
```

消息入口保持一次 `JSON.parse`，再执行：

```ts
if (!validateJSONRPCMessage(parsedMessage)) {
  failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
  return;
}
```

response/error/id 分支保持现有顺序。notification 分支使用 generated classifier：

```ts
const classification = classifyServerNotification(message);
switch (classification.type) {
  case "selected":
    // Exhaustively route the three generated notification variants.
    return;
  case "selectedInvalid":
    failProtocolAndClose(
      `${classification.method} returned malformed params payload`,
      "protocol error",
    );
    return;
  case "knownUnconsumed":
    return;
  case "unknown":
    failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
    return;
}
```

selected routing switch 必须保留 `satisfies never` exhaustiveness，不改变 callback 参数类型或调用顺序。

- [ ] **Step 5: Run focused transport tests**

Run the same command from Step 3.

Expected: PASS.

- [ ] **Step 6: Run focused type-check and generated drift check**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS; no generated drift and no assertion-based type recovery.

- [ ] **Step 7: Apply scoped frontend formatting and lint fixes**

Run against the Task 3 files:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt \
  src/features/guiHost/guiHostClient.ts \
  src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  --write

/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint \
  src/features/guiHost/guiHostClient.ts \
  src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  --fix

/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint \
  src/features/guiHost/guiHostClient.ts \
  src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  --fix --no-cache
```

Inspect the diff; do not rerun tests after the final fix commands unless those commands alter runtime semantics rather than formatting/lint-only code.

- [ ] **Step 8: Commit the transport migration**

Stage only Task 3 files, inspect the staged diff, then create:

```text
refactor(gui): route selected generated notifications
```

## Task 4: Verify production bundle reduction

**Files:**

- Verify: `codex-gui/dist/**`
- Verify: `codex-gui/src/generated/appServerProtocol/**`
- No production file modifications are expected.

- [ ] **Step 1: Run final focused frontend verification**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  scripts/protocolValidators/core.test.ts \
  scripts/protocolValidators/cli.test.ts \
  src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  src/features/guiHost/__tests__/guiHostCommands.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 2: Build production assets**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run build
```

Expected: Vite build succeeds. The existing Shiki large-chunk warnings may remain; do not treat them as this task's failure unless their file count or sizes change unexpectedly.

- [ ] **Step 3: Record raw, gzip and total sizes**

Run from `codex-gui`:

```bash
find dist/assets -maxdepth 1 -name 'index-*.js' -exec wc -c {} \;
find dist -type f -print0 | xargs -0 wc -c | tail -1
find dist/assets -maxdepth 1 -type f -name '*.js' | wc -l
wc -c src/generated/appServerProtocol/*Validators.js
```

Run gzip measurement against the single main index file reported by Vite:

```bash
gzip -c dist/assets/index-*.js | wc -c
```

Compare with the accepted baseline:

```text
current main raw: 1,320,592 B
current main gzip: approximately 278.16 kB
current dist total: 11,604,274 B
required reduction in main raw: at least 400,000 B
required reduction in dist total: at least 400,000 B
```

If either threshold is missed, stop completion and inspect selected roots、duplicate closures and imports. Do not change chunk warning limits or move the same code to lazy chunks.

- [ ] **Step 4: Prove unrelated notification code is absent**

Run:

```bash
rg -n -e 'windowsSandbox/setupCompleted' dist/assets/index-*.js
rg -n -e 'windowsSandbox/setupCompleted' src/generated/appServerProtocol/*Validators.js
```

Expected: no matches.

Confirm the three selected methods remain present:

```bash
rg -n -e 'thread/projection/event' -e 'thread/projection/delta' -e 'thread/projection/closed' \
  src/generated/appServerProtocol/*Validators.js \
  src/generated/appServerProtocol/notificationDescriptors.ts
```

Expected: matches for all three methods.

- [ ] **Step 5: Verify Shiki assets did not change as part of this work**

Compare the build report with the accepted baseline for representative unchanged assets:

```text
angular-ts: 183.72 kB
vue-vine: 190.07 kB
wolfram: 262.38 kB
cpp: 626.05 kB
emacs-lisp: 779.84 kB
Oniguruma wasm: 622.32 kB
```

Expected: only content hashes may change if the bundler graph changes; raw sizes must remain effectively unchanged. Any material Shiki change is out of scope and must be investigated before completion.

- [ ] **Step 6: Run final Rust formatting requirement**

Because this repository requires Rust formatting after code changes anywhere, run from `codex-rs` after all tests and build have passed:

```bash
just fmt
```

Expected: success and no unexpected diff. Do not rerun tests afterward.

This task creates no commit if verification and `just fmt` produce no changes. If `just fmt` changes Task 1 Rust files, amend only the Task 1 local commit after inspecting the diff; do not mix formatting into the frontend commits.

## Task 5: Record verified bundle evidence

**Files:**

- Modify: `docs/superpowers/issues/2026-07-16-01-codex-gui-authoritative-contract-drift.md`

- [ ] **Step 1: Update only verified implementation evidence**

After Task 4 succeeds, append a bundle-size follow-up subsection containing:

```text
root cause: full ServerNotification standalone validator entered the production graph
old main raw/gzip and dist total
new main raw/gzip and dist total
exact recovered byte counts
generated validator group sizes
confirmation that windowsSandbox/setupCompleted is absent
confirmation that representative Shiki assets are unchanged
focused test, drift, type-check and build commands that passed
```

Do not rewrite the existing issue taxonomy or earlier authoritative-contract findings.

- [ ] **Step 2: Verify the documentation diff**

Run:

```bash
git diff --check -- docs/superpowers/issues/2026-07-16-01-codex-gui-authoritative-contract-drift.md
git diff -- docs/superpowers/issues/2026-07-16-01-codex-gui-authoritative-contract-drift.md
```

Expected: only the verified bundle follow-up subsection changes.

- [ ] **Step 3: Commit the evidence update**

Stage only the issue file, inspect the staged diff, then create:

```text
docs(gui): record validator bundle reduction
```

Do not include this design or implementation plan unless the user separately asks to submit them.

## Final completion checklist

- [ ] Rust metadata is generated from the filtered Rust `ServerNotification` schema, with no second method table.
- [ ] Existing Rust `JSONRPCMessage` remains the only shallow envelope owner.
- [ ] Frontend app-server generation has two ESM groups and no eager app-server registry.
- [ ] No app-server validator root is the complete `ServerNotification` schema.
- [ ] Selected response and projection payload validators retain Rust schema semantics.
- [ ] Known unconsumed notification payloads are ignored; unknown methods remain terminal.
- [ ] Existing response, handshake, projection, cleanup and error policy tests pass.
- [ ] Generated drift and TypeScript type-check pass.
- [ ] Main raw size and total dist size each decrease by at least 400,000 B.
- [ ] Unrelated notification literals are absent from production validator output.
- [ ] Representative Shiki assets remain unchanged.
- [ ] Each implementation task has its own reviewed local commit.
- [ ] Design and plan documents remain outside implementation commits unless separately authorized.
