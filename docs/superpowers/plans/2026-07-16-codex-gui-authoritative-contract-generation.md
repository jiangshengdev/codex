# Codex GUI Authoritative Contract Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Each task must preserve its file and commit boundary; generated files, dependency updates, verification, staging, and commits are separate micro-stages where the plan says so.

**Goal:** Replace GUI Host consumer-owned protocol reconstruction with Rust-generated TypeScript contracts and Ajv v8 standalone validators, and mechanically export the Rust GUI Host private launch/auth/route contract to `codex-gui`.

**Architecture:** Rust remains the only contract authority. `ts-rs` exports static TypeScript types, `schemars` exports JSON Schema, the app-server request macro exports method/params/response metadata, and a frontend Ajv generator produces checked-in standalone validators plus typed descriptors. A separate Rust GUI Host browser-contract owner generates launch constants and authenticate artifacts without adding private host behavior to app-server v2.

**Tech Stack:** Rust, `ts-rs`, `schemars`, Ajv v8 standalone code generation, TypeScript 6, Vitest, Vitest Browser Mode, pnpm with fnm, Cargo/Just, Bazel lock generation.

---

## Execution rules

- Do not begin implementation until the user explicitly confirms this plan.
- Do not create another design, research, or plan document during implementation.
- Do not run Git remote commands.
- Use TDD for production behavior: add the failing test, run it and confirm the expected failure, implement the minimum change, then rerun the focused test.
- Generated artifacts are updated only through their generator commands. Never patch generated files manually.
- Use fnm-backed pnpm for every dependency or frontend command.
- Before each frontend commit, run scoped `oxfmt`, `oxlint --fix`, and ESLint fix/check on authored source and test files. Generated files must be formatted by the generator itself, not by a separate manual formatting pass.
- Before each Rust production commit, run the focused tests first, then the scoped `just fix -p <crate>` and `just fmt`; inspect their diff and do not rerun tests after those fix/format commands.
- The confirmed implementation scope includes adding Ajv v8 as a direct `codex-gui` dependency and adding existing workspace `schemars`/`ts-rs` dependencies to `codex-gui-host` if required.
- Rust dependency changes require `just bazel-lock-update` and inclusion of `Cargo.lock` and `MODULE.bazel.lock` in the same commit.
- Run focused tests before `just fix` and `just fmt`. Do not rerun tests after the final Rust fix/format step.
- Do not run crate-wide or workspace-wide Rust test suites without separate explicit authorization. Use the filters listed below.
- Keep the original issue taxonomy intact. Update its status and add implementation evidence only after all implementation verification is complete.

## Planned commit sequence

1. `test(gui): lock authoritative GUI host contract behavior`
2. `feat(app-server-protocol): export request response definitions`
3. `build(gui): generate standalone protocol validators`
4. `refactor(gui): consume generated app-server contracts`
5. `refactor(gui-host): generate private browser contract`
6. `refactor(gui): enforce projection exhaustiveness and consolidate fixtures`
7. `docs(gui): close authoritative contract drift`

## Task 1: Lock existing public behavior before ownership changes

**Files:**

- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- Modify if required: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `codex-gui/src/features/browserLaunch/__tests__/browserLaunchParams.test.ts`
- Modify: `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts`
- Modify: `codex-rs/gui-host/src/url.rs` test module only
- Modify: `codex-rs/gui-host/src/host.rs` test module only
- Modify: `codex-rs/gui-host/src/ws.rs` test module only

- [ ] **Step 1: Add or strengthen characterization tests for behavior that must remain stable**

Cover these exact observations without changing production code:

```text
launch URL query key: threadId
launch URL fragment key: token
WebSocket path: /ws
authenticate method: gui/authenticate
authenticate params: { token: string }
authenticate success result: { authenticated: true }
status order: connecting -> authenticated -> initialized -> attached
command RPC error: rejects one command and remains non-terminal
projection malformed payload: emits the existing terminal error and closes
cleanup: invalidates commands and rejects pending requests
```

Keep wire literals in these black-box tests. Their purpose is to catch accidental contract changes after production code starts consuming generated constants.

- [ ] **Step 2: Run focused frontend characterization tests**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit \
  src/features/guiHost/__tests__/guiHostCommands.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  src/features/browserLaunch/__tests__/browserLaunchParams.test.ts \
  src/features/qrAccess/__tests__/qrAccessUrl.test.ts
```

Expected: PASS. These are characterization tests, so a failure means the asserted behavior does not match the current implementation and must be corrected before continuing.

- [ ] **Step 3: Run focused Rust characterization tests**

Run from `codex-rs` using existing or newly named test filters:

```bash
just test -p codex-gui-host launch_url_uses_thread_query_and_fragment_token
just test -p codex-gui-host parse_authenticate_request
just test -p codex-gui-host websocket_route
```

Expected: PASS. If the router test has a different existing name, use the narrowest exact filter that exercises dev and prod `/ws` registration and record that name in the commit message body.

- [ ] **Step 4: Commit the tests only**

Stage only the test-file changes listed in this task, inspect the staged diff, then create:

```text
test(gui): lock authoritative GUI host contract behavior
```

Do not include production, generated, dependency, lockfile, or documentation changes.

## Task 2: Export app-server request method/params/response definitions

**Files:**

- Modify: `codex-rs/app-server-protocol/src/protocol/common.rs`
- Modify: `codex-rs/app-server-protocol/src/export.rs`
- Modify: `codex-rs/app-server-protocol/src/schema_fixtures.rs`
- Modify: `codex-rs/app-server-protocol/tests/schema_fixtures.rs`
- Generate: `codex-rs/app-server-protocol/schema/typescript/ClientRequestDefinition.ts`
- Generate: `codex-rs/app-server-protocol/schema/json/client-request-definitions.json`
- Generate as required: `codex-rs/app-server-protocol/schema/typescript/index.ts`

- [ ] **Step 1: Write failing export tests**

Add focused assertions for at least these definitions:

```text
initialize
  params: InitializeParams
  response: InitializeResponse

thread/projection/attach
  params: ThreadProjectionAttachParams
  response: ThreadProjectionAttachResponse

turn/start
  params: TurnStartParams
  response: TurnStartResponse

turn/interrupt
  params: TurnInterruptParams
  response: TurnInterruptResponse
```

The tests must also cover a renamed wire method so the exporter cannot fall back to the Rust enum variant name.

- [ ] **Step 2: Run the new Rust test and verify RED**

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-app-server-protocol client_request_definitions_export_method_params_and_response
```

Expected: FAIL because the definition artifact and export entry point do not exist.

- [ ] **Step 3: Extend the request macro with generated metadata**

Add one metadata emission path inside `client_request_definitions!`; do not parse generated TypeScript or maintain a second method table. The generated TypeScript contract must have this effective shape:

```ts
export type ClientRequestDefinition =
  | {
      method: "initialize";
      params: InitializeParams;
      response: InitializeResponse;
    }
  | {
      method: "thread/projection/attach";
      params: ThreadProjectionAttachParams;
      response: ThreadProjectionAttachResponse;
    };
```

The JSON manifest must contain only stable generation metadata, for example:

```json
{
  "method": "thread/projection/attach",
  "paramsSchema": "v2/ThreadProjectionAttachParams",
  "responseSchema": "v2/ThreadProjectionAttachResponse"
}
```

Generate both artifacts from the same macro expansion. Experimental method filtering must follow the existing schema-generation option rather than creating a separate filtering rule.

- [ ] **Step 4: Regenerate app-server schema artifacts**

Run from the repository root:

```bash
just write-app-server-schema
```

Expected: the new definition artifacts and index export appear; unrelated schema files do not change. If unrelated files change, stop and determine whether the generator is stale before proceeding.

- [ ] **Step 5: Run focused generation tests**

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-app-server-protocol client_request_definitions_export_method_params_and_response
just test -p codex-app-server-protocol typescript_schema_fixtures_match_generated
just test -p codex-app-server-protocol json_schema_fixtures_match_generated
```

Expected: PASS.

- [ ] **Step 6: Commit the Rust generation boundary**

Stage only app-server protocol source, tests, and generated schema artifacts. Inspect the staged diff and create:

```text
feat(app-server-protocol): export request response definitions
```

## Task 3: Add Ajv v8 standalone validator generation

**Files:**

- Modify via pnpm: `codex-gui/package.json`
- Modify via pnpm: `codex-gui/pnpm-lock.yaml`
- Create: `codex-gui/scripts/protocolValidators/cli.ts`
- Create: `codex-gui/scripts/protocolValidators/cli.test.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/validators.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts`
- Generate: `codex-gui/src/generated/appServerProtocol/index.ts`

- [ ] **Step 1: Verify the user-managed package manager**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Expected: pnpm resolves through the user's fnm environment. Stop if it resolves under `/Users/jiangsheng/.cache/codex-runtimes/`.

- [ ] **Step 2: Write failing generator tests**

The tests must invoke the generator through exported functions rather than shelling out. Cover:

```ts
expect(validateAttach(validAttach)).toBe(true);
expect(validateAttach({ ...validAttach, snapshot: null })).toBe(false);
expect(validateEvent({ ...validEvent, event: { type: "unknown" } })).toBe(false);
expect(() => buildValidators({ missingResponseSchema: true })).toThrow();
expect(generateOnce()).toEqual(generateOnce());
```

Also test duplicate methods, unresolved `$ref`, missing schema IDs, nullable fields, optional fields, and tagged unions.

- [ ] **Step 3: Run the generator test and verify RED**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit scripts/protocolValidators/cli.test.ts
```

Expected: FAIL because the generator module and generated validators do not exist.

- [ ] **Step 4: Add Ajv v8 through pnpm**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm add 'ajv@^8.17.1'
```

Expected: `ajv` appears as a direct `dependencies` entry and `codex-gui/pnpm-lock.yaml` is updated by pnpm. Do not install `ajv-formats` unless a generator test proves an existing Rust schema format cannot compile without it.

- [ ] **Step 5: Implement the generator**

The generator must:

```text
read app-server JSON schemas
read client-request-definitions.json
register stable schema IDs in Ajv strict mode
compile JSON-RPC envelope, response, and ServerNotification validators
emit ESM standalone code
emit typed request and notification descriptors
sort methods and output files deterministically
support write mode and check-only mode
```

Add exact package scripts:

```json
{
  "protocol:generate-validators": "tsx scripts/protocolValidators/cli.ts --write",
  "protocol:check-validators": "tsx scripts/protocolValidators/cli.ts --check"
}
```

Generated request descriptors must mechanically preserve the TypeScript association:

```ts
export type RequestDefinitionFor<M extends ClientRequestDefinition["method"]> = Extract<
  ClientRequestDefinition,
  { method: M }
>;

export type RequestParams<M extends ClientRequestDefinition["method"]> =
  RequestDefinitionFor<M>["params"];

export type RequestResponse<M extends ClientRequestDefinition["method"]> =
  RequestDefinitionFor<M>["response"];
```

No frontend-owned response map or literal method union is permitted.

- [ ] **Step 6: Generate and verify artifacts**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit scripts/protocolValidators/cli.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS and the check command reports no drift.

- [ ] **Step 7: Commit the generator boundary**

Stage only dependency files, generator source/tests, scripts, and generated validator/descriptor files. Create:

```text
build(gui): generate standalone protocol validators
```

## Task 4: Migrate the app-server GUI transport to generated descriptors

**Files:**

- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts`

- [ ] **Step 1: Add failing transport tests**

Add tests that require the new behavior:

```text
missing command result rejects instead of resolving {}
malformed command result rejects only that command
missing initialize result remains terminal with existing text
malformed attach result remains terminal with existing text
valid event/delta/closed notifications reach the same callbacks
malformed projection notification remains terminal
unmatched, duplicate, and late responses do not advance handshake
```

Add compile-time coverage in `guiHostGeneratedProtocol.test.ts` using `expectTypeOf` so `turn/start` accepts only `TurnStartParams` and resolves only `TurnStartResponse`.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  src/features/guiHost/__tests__/guiHostCommands.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: FAIL on missing-result fallback, malformed response validation, or missing descriptor APIs.

- [ ] **Step 3: Replace the erased request API**

Replace the free response generic with a descriptor-driven API equivalent to:

```ts
function request<M extends ClientRequestDefinition["method"]>(
  descriptor: RequestDescriptor<M>,
  params: RequestParams<M>,
  options: RequestOptions,
): Promise<RequestResponse<M>>;
```

Each pending entry stores the descriptor and uses its result validator. Remove `result as TResponse` and reject missing or invalid result according to the request category.

- [ ] **Step 4: Replace handwritten notification validation**

Keep only transport-level JSON parsing and generic error-envelope handling in `guiHostProtocol.ts`. Delete the attach/event/delta/closed field-list validators. Validate notifications with the generated validator, then route the generated discriminated union exhaustively.

Do not change `/ws`, launch keys, or `gui/authenticate` in this task.

- [ ] **Step 5: Run focused transport verification**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit \
  src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts \
  src/features/guiHost/__tests__/guiHostCommands.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit the transport migration**

Stage only GUI Host transport/protocol source and related tests. Create:

```text
refactor(gui): consume generated app-server contracts
```

## Task 5: Generate and atomically migrate the Rust GUI Host private browser contract

**Files:**

- Create: `codex-rs/gui-host/src/browser_contract.rs`
- Create: `codex-rs/gui-host/src/browser_contract_fixtures.rs`
- Create: `codex-rs/gui-host/src/bin/write_browser_contract_fixtures.rs`
- Create: `codex-rs/gui-host/tests/browser_contract_fixtures.rs`
- Modify: `codex-rs/gui-host/src/lib.rs`
- Modify: `codex-rs/gui-host/src/url.rs`
- Modify: `codex-rs/gui-host/src/host.rs`
- Modify: `codex-rs/gui-host/src/ws.rs`
- Modify: `codex-rs/gui-host/Cargo.toml`
- Modify: `codex-rs/gui-host/BUILD.bazel`
- Modify: `codex-rs/Cargo.lock`
- Modify: `MODULE.bazel.lock`
- Modify: `justfile`
- Generate: `codex-rs/gui-host/schema/typescript/browserContract.ts`
- Generate: `codex-rs/gui-host/schema/json/GuiAuthenticateParams.json`
- Generate: `codex-rs/gui-host/schema/json/GuiAuthenticateResult.json`
- Modify: `codex-gui/tsconfig.app.json`
- Modify: `codex-gui/vite.config.ts`
- Modify if required: `codex-gui/vitest.config.ts`
- Modify if required: `codex-gui/vitest.browser.config.ts`
- Modify: `codex-gui/scripts/protocolValidators/cli.ts`
- Modify: `codex-gui/scripts/protocolValidators/cli.test.ts`
- Generate: `codex-gui/src/generated/guiHostContract/**`
- Modify: `codex-gui/src/features/browserLaunch/browserLaunchParams.ts`
- Modify: `codex-gui/src/features/qrAccess/qrAccessUrl.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify related tests from Task 1.

- [ ] **Step 1: Write the Rust artifact drift test and verify RED**

The test must fresh-generate the private contract tree and compare it byte-for-byte with the vendored tree.

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-gui-host browser_contract_fixtures_match_generated
```

Expected: FAIL because the contract owner and vendored artifacts do not exist.

- [ ] **Step 2: Create the Rust browser contract owner**

Define one owner containing constants and typed payloads equivalent to:

```rust
pub(crate) const THREAD_QUERY_KEY: &str = "threadId";
pub(crate) const TOKEN_FRAGMENT_KEY: &str = "token";
pub(crate) const WEBSOCKET_PATH: &str = "/ws";
pub(crate) const AUTHENTICATE_METHOD: &str = "gui/authenticate";

#[derive(Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GuiAuthenticateParams {
    pub token: String,
}

#[derive(Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GuiAuthenticateResult {
    pub authenticated: bool,
}
```

Use the same constants and structs in URL construction, both routers, request parsing, and success response serialization. Do not add these types to app-server protocol.

Do not add `deny_unknown_fields`: the existing authenticate structs accept extra fields, and this plan must preserve that serde behavior. The generated JSON Schema and Ajv validator must match the actual Rust deserializer rather than imposing a stricter frontend-only policy.

- [ ] **Step 3: Add the writer and project command**

Add one root recipe:

```text
write-gui-host-browser-contract
```

It must regenerate the complete GUI Host contract tree, delete stale generated files, and use a stable generated header. Register schema/type dependencies through workspace dependencies and update Bazel data when compile-time reads require it.

- [ ] **Step 4: Update Rust dependency locks mechanically**

After editing `Cargo.toml`, run from the repository root:

```bash
just bazel-lock-update
```

Expected: `codex-rs/Cargo.lock` and `MODULE.bazel.lock` reflect only the declared workspace dependency changes.

- [ ] **Step 5: Generate the GUI Host contract and verify Rust tests**

```bash
just write-gui-host-browser-contract
cd codex-rs
just test -p codex-gui-host browser_contract_fixtures_match_generated
just test -p codex-gui-host launch_url_uses_thread_query_and_fragment_token
just test -p codex-gui-host parse_authenticate_request
```

Expected: PASS.

- [ ] **Step 6: Add frontend aliases and generated validator input**

Use the same `@codex-gui-host-contract` alias in TypeScript, Vite, unit-test, and Browser Mode resolution. Extend the existing Ajv generator; do not add a second validator pipeline.

Add a failing frontend test showing that an authenticate result missing `authenticated` or containing the wrong type is rejected through the existing handshake protocol-error path. Run it and confirm RED before changing production consumers.

- [ ] **Step 7: Migrate all production consumers atomically**

Replace production literals in:

```text
browserLaunchParams.ts
qrAccessUrl.ts
guiHostClient.ts
```

Use generated keys, path, method, types, and authenticate validator. Keep the browser storage key frontend-owned. Preserve fragment clearing, storage fallback, callback order, error text, and socket close behavior.

- [ ] **Step 8: Run focused frontend verification**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit \
  src/features/browserLaunch/__tests__/browserLaunchParams.test.ts \
  src/features/qrAccess/__tests__/qrAccessUrl.test.ts \
  src/features/guiHost/__tests__/guiHostHandshake.test.ts \
  src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 9: Check literal ownership**

Use single-quoted patterns and inspect every remaining production hit:

```bash
rg -n -e 'threadId' -e 'gui/authenticate' -e '"/ws"' -e 'searchParams.*token' \
  codex-rs/gui-host/src codex-gui/src
```

Expected: contract literals remain only in the Rust owner, generated artifacts, or intentional black-box/malformed tests.

- [ ] **Step 10: Commit the atomic private-contract migration**

Stage Rust owner/generator/artifacts, dependency locks, aliases, Ajv regeneration, frontend consumers, and focused tests together. Create:

```text
refactor(gui-host): generate private browser contract
```

Do not commit an intermediate state where Rust and frontend both retain stable production owners.

## Task 6: Close downstream exhaustiveness and legal fixture drift

**Files:**

- Modify: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Modify: `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Modify: `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`

- [ ] **Step 1: Consolidate legal fixtures without changing expectations**

Extend the existing shared builder with narrow, generated-type-linked operations only. Prefer composition of existing attach builders. If an override helper is necessary, restrict it to named envelope fields and do not expose `Partial<ThreadProjection...>` or `Record<string, unknown>`.

Migrate only legal protocol inputs in the five listed test files. Leave malformed inputs, JSON-RPC envelopes, outbound assertions, and expected-state objects local.

- [ ] **Step 2: Lock current closed-reason behavior before production change**

Update the adapter test so its expected manual reconnect reason comes from the legal generated notification fixture rather than a duplicated literal. This characterization remains green because the current generated union has only `backpressure`; the production change is a compile-time exhaustiveness improvement, not a runtime behavior change. After the test is in place, change production to consume `notification.reason` directly.

- [ ] **Step 3: Add exhaustive status coverage**

Add table-driven coverage for all current `Turn["status"]` values:

```text
inProgress -> false
completed -> true
interrupted -> true
failed -> true
```

Implement `isTerminalTurn` as an exhaustive switch with a `never` default.

- [ ] **Step 4: Add generated event exhaustiveness gates**

Add `never` gates to the generated event switches in projection ingress, thread runtime, and transcript state. Prefer an existing local helper; otherwise keep the expression in the owning module rather than adding a one-use shared utility.

- [ ] **Step 5: Run focused unit tests**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit \
  src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts \
  src/features/snapshotReplay/__tests__/snapshotReplay.test.ts \
  src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the Browser Mode fixture regression**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest \
  --config=vitest.browser.config.ts \
  --run src/__tests__/App.browser.test.tsx
```

Expected: PASS in Chromium without downloading a new browser binary.

- [ ] **Step 7: Commit the downstream slice**

Stage only the files listed in this task and create:

```text
refactor(gui): enforce projection exhaustiveness and consolidate fixtures
```

## Task 7: Final verification, formatting, and issue closure

**Files:**

- Modify after verification: `docs/superpowers/issues/2026-07-16-01-codex-gui-authoritative-contract-drift.md`

- [ ] **Step 1: Verify generated artifact drift**

```bash
cd /Users/jiangsheng/cnb/codex
just write-app-server-schema
just write-gui-host-browser-contract
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
cd ..
git diff --exit-code -- \
  codex-rs/app-server-protocol/schema \
  codex-rs/gui-host/schema \
  codex-gui/src/generated
```

Expected: no generated diff.

- [ ] **Step 2: Run focused Rust tests**

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-app-server-protocol client_request_definitions_export_method_params_and_response
just test -p codex-app-server-protocol typescript_schema_fixtures_match_generated
just test -p codex-app-server-protocol json_schema_fixtures_match_generated
just test -p codex-gui-host browser_contract_fixtures_match_generated
just test -p codex-gui-host launch_url_uses_thread_query_and_fragment_token
just test -p codex-gui-host parse_authenticate_request
```

Expected: PASS. Do not replace these with crate-wide `just test -p ...` commands.

- [ ] **Step 3: Run frontend verification**

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest \
  --config=vitest.browser.config.ts \
  --run src/__tests__/App.browser.test.tsx
```

Expected: all checks PASS. No UI snapshot update should be produced because the task does not change user-visible rendering.

- [ ] **Step 4: Inspect dependency and change scope**

```bash
cd /Users/jiangsheng/cnb/codex
git diff --check
git diff --stat
git status --short
```

Confirm:

```text
Ajv v8 is a direct codex-gui dependency
no Zod/TypeBox/Valibot/ArkType dependency was added
no app-server v2 method was added
no UI or unrelated Redux behavior changed
no unplanned docs/research files were created
```

- [ ] **Step 5: Run final Rust fix and format**

Run only after all tests pass:

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just fix -p codex-app-server-protocol
just fix -p codex-gui-host
just fmt
```

Inspect the resulting diff. Do not rerun tests after this step. If fix/format changes semantics or touches unrelated files, stop and investigate before updating the issue.

- [ ] **Step 6: Update the existing issue**

Change the issue status to fixed only if all required verification passed. Preserve the original evidence and taxonomy, and add an implementation status section containing:

```text
completion date
local commit SHAs for each task boundary
Rust generation and focused test evidence
Ajv drift-check evidence
frontend CI and Browser Mode evidence
remaining explicitly excluded follow-ups, if any
```

Do not rewrite the historical finding as though the repaired architecture existed at audit time.

- [ ] **Step 7: Commit the issue update only**

Stage only the issue file, inspect the staged diff, and create:

```text
docs(gui): close authoritative contract drift
```

## Plan completion criteria

- Rust request definitions mechanically export method/params/response associations.
- Ajv v8 standalone validators are generated from Rust JSON Schema and pass drift checks.
- GUI request correlation validates response results through generated descriptors.
- Handwritten projection contract validators, free response generics, result assertions, and the empty-object fallback are removed.
- Rust GUI Host launch/auth/route values have one owner and generated frontend artifacts.
- Generated variants fail exhaustively in downstream production code.
- Legal projection fixtures use the shared builder surface.
- Focused Rust tests, frontend CI, and Browser Mode tests pass.
- The issue is updated only after verified implementation completion.
