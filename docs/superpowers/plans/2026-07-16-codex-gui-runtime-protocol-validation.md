# Codex GUI Runtime Protocol Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立严格且分层的 GUI host runtime protocol boundary：显式 decode JSON-RPC envelope，令 attach/event 只承诺 frontend-owned DTO，完整验证 delta/closed，并把 command success API 收窄为 `Promise<void>`。

**Architecture:** `guiHostProtocol.ts` 保持唯一 inbound protocol owner，负责 JSON parse、discriminated envelope、全部 runtime structural validators 与 projection decoder；新增的 `guiHostProjectionDto.ts` 只承载 feature-private frontend-owned DTO 类型，不包含 validator、decoder、routing、error policy 或 lifecycle。`GuiHostTransportSession` 只 correlation numeric pending response，handshake、command gateway 和 client facade 分别保留既有阶段策略、非终端 command policy 与 terminal notification policy。

**Tech Stack:** TypeScript 6、JSON-RPC 2.0、WebSocket、Redux Toolkit、Vitest Node、Vitest Browser Mode + Playwright、oxfmt、oxlint、ESLint，以及 fnm 管理的 Node/pnpm。

---

**状态：** 待确认

**设计依据：** [Codex GUI Runtime Protocol Validation / Trust Boundary 设计](../specs/2026-07-16-codex-gui-runtime-protocol-validation-design.md)（用户已在聊天中确认设计；计划确认后由 Task 0 同步文档状态）

## 实施前提与不可越界项

- 当前分支必须是 `dev`。只有用户明确确认本计划后才能执行 Task 0–4。
- 所有 `pnpm` 命令在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不运行 `pnpm install`、`pnpm add`，不安装浏览器或依赖，不执行任何 Git 远程命令。
- 严格 TDD：每个行为先写 RED test，运行并确认因缺少目标行为而失败，再写最小 production code，随后运行 GREEN test。
- 合法 projection payload 复用 `src/features/projection/__tests__/projectionFixtures.ts` 和 `projectionTestBuilders.ts`；malformed case 必须先 `structuredClone` 合法 fixture，再单点修改，禁止变异模块级共享对象。
- 不修改 Rust、generated schema、wire shape、RPC method/params、现有错误文本、close code/reason、Redux runtime 数据、dispatch 顺序、B07 timeline runtime、material builder/selector、UI 或 snapshot。
- 不新增 runtime validation dependency。所有 validator 是 feature-private TypeScript structural checks。
- `snapshotReplay.ts`、`liveEventHandling.ts` 若因 type-check 被触达，只允许 type import/签名兼容；不得改变 builder、selector、返回顺序或测试语义。
- Task 1–4 是设计确认的四个 code review boundary。每个 Task stage 后运行 `git diff --cached --numstat`：总变更不得超过 800 行，非机械行为变化目标小于 500 行；超限必须停止并拆分，不得直接提交。
- 每个 Task 独立创建本地 commit。不得把下一 Task 的文件提前 stage。

## 文件结构与责任

Create:

- `codex-gui/src/features/guiHost/guiHostProjectionDto.ts`
  - 只定义 frontend-owned input/item/turn/thread/attach/event DTO 类型；不包含 runtime validator、decoder、JSON parse、routing 或 terminal policy。
- `codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts`
  - Node unit 覆盖 envelope classification、attach/event decoder identity、delta/closed完整 validation 与 malformed mutation。

Modify in Task 1:

- `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- `codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

Modify for attach DTO handoff in Task 2:

- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`

Modify for event DTO handoff in Task 3:

- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- relevant type assertions in existing projection ingress/coordinator/thread runtime tests

Task 4 modifies only protocol/client tests or decoder call sites required to make delta/closed return the complete generated types; it does not change downstream runtime behavior.

### Task 0: Record the accepted design and plan

**Files:**

- Modify: `docs/superpowers/specs/2026-07-16-codex-gui-runtime-protocol-validation-design.md:3`
- Modify: `docs/superpowers/plans/2026-07-16-codex-gui-runtime-protocol-validation.md`

- [ ] **Step 1: Change only the two status markers after plan approval**

Use `apply_patch` to change:

```text
状态：待确认
```

to:

```text
状态：已确认
```

and change this plan's `**状态：** 待确认` to `**状态：** 已确认`. Do not alter the accepted design or plan tasks.

- [ ] **Step 2: Verify the docs-only diff**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
git diff --check -- docs/superpowers/specs/2026-07-16-codex-gui-runtime-protocol-validation-design.md docs/superpowers/plans/2026-07-16-codex-gui-runtime-protocol-validation.md
git status --short -- docs/superpowers/specs/2026-07-16-codex-gui-runtime-protocol-validation-design.md docs/superpowers/plans/2026-07-16-codex-gui-runtime-protocol-validation.md
```

Expected: no whitespace diagnostics; status contains exactly the design and plan in this docs-only scope.

- [ ] **Step 3: Create the accepted-documents local commit**

```bash
git add docs/superpowers/specs/2026-07-16-codex-gui-runtime-protocol-validation-design.md docs/superpowers/plans/2026-07-16-codex-gui-runtime-protocol-validation.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs(gui): design runtime protocol validation"
```

Expected: staged paths are exactly the two documents; the local commit succeeds.

### Task 1: Decode envelopes, preserve correlation policy, and make commands completion-only

**Files:**

- Create: `codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts:8-45`
- Modify: `codex-gui/src/features/guiHost/guiHostTransportSession.ts:3-168`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts:1-172`
- Modify: `codex-gui/src/features/guiHost/guiHostHandshakeController.ts:1-126`
- Modify: `codex-gui/src/features/guiHost/guiHostCommandGateway.ts:1-50`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

- [ ] **Step 1: Write RED envelope decoder tests**

Create `guiHostProtocol.test.ts` with tests using this target API:

```ts
import { describe, expect, it } from "vitest";
import { decodeRpcMessage } from "../guiHostProtocol";

describe("decodeRpcMessage", () => {
  it("preserves success result presence", () => {
    expect(decodeRpcMessage('{"jsonrpc":"2.0","id":1}')).toEqual({
      kind: "success",
      id: 1,
      hasResult: false,
      result: undefined,
    });
    expect(decodeRpcMessage('{"jsonrpc":"2.0","id":2,"result":null}')).toEqual({
      kind: "success",
      id: 2,
      hasResult: true,
      result: null,
    });
  });

  it("keeps valid RPC errors separate from malformed envelopes", () => {
    const withoutData = decodeRpcMessage(
      '{"jsonrpc":"2.0","id":"server-id","error":{"code":-32601,"message":"method not found"}}',
    );
    expect(withoutData).toEqual({
      kind: "error",
      id: "server-id",
      error: { code: -32601, message: "method not found" },
    });
    if (withoutData.kind !== "error") {
      throw new Error("expected an RPC error response");
    }
    expect("data" in withoutData.error).toBe(false);

    const withData = decodeRpcMessage(
      '{"jsonrpc":"2.0","id":8,"error":{"code":-32000,"message":"busy","data":{"retry":false}}}',
    );
    expect(withData).toEqual({
      kind: "error",
      id: 8,
      error: { code: -32000, message: "busy", data: { retry: false } },
    });
    if (withData.kind !== "error") {
      throw new Error("expected an RPC error response");
    }
    expect("data" in withData.error).toBe(true);
  });

  it("retains correlation and method hints for malformed objects", () => {
    expect(
      decodeRpcMessage('{"jsonrpc":"1.0","id":7,"method":"thread/projection/event"}'),
    ).toEqual({
      kind: "malformed",
      failure: "invalidVersion",
      correlationId: 7,
      method: "thread/projection/event",
      params: undefined,
    });
  });
});
```

Also test valid notification, string/null success IDs, result+error mixed shape, scalar JSON, unknown object, and that malformed JSON throws. Add this explicit error-envelope RED matrix:

```ts
expect(decodeRpcMessage('{"jsonrpc":"2.0","id":3,"error":{"code":-32601}}')).toEqual({
  kind: "malformed",
  failure: "invalidError",
  correlationId: 3,
  method: undefined,
  params: undefined,
});
expect(
  decodeRpcMessage(
    '{"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":false}}',
  ),
).toEqual({
  kind: "malformed",
  failure: "invalidError",
  correlationId: 4,
  method: undefined,
  params: undefined,
});
```

Both missing and non-string `message` must be malformed, never `kind: "error"`. The preceding valid cases prove that omitted `data` stays absent and present `data` retains its parsed value.

Add a classification matrix with one exact case per internal failure discriminant:

```ts
it.each([
  ["null", "invalidTopLevel"],
  ['{"jsonrpc":"1.0"}', "invalidVersion"],
  ['{"jsonrpc":"2.0","id":1,"result":{},"error":{"code":-1,"message":"x"}}', "mixedEnvelope"],
  ['{"jsonrpc":"2.0","id":true,"result":{}}', "invalidResponseId"],
  ['{"jsonrpc":"2.0","id":1,"error":{"code":-1}}', "invalidError"],
  ['{"jsonrpc":"2.0","method":1}', "invalidNotification"],
  ['{"jsonrpc":"2.0","arbitrary":true}', "missingDiscriminant"],
])("classifies malformed envelopes with %s", (json, failure) => {
  expect(decodeRpcMessage(json)).toMatchObject({ kind: "malformed", failure });
});
```

- [ ] **Step 2: Write RED transport, handshake, command, and facade policy tests**

Update transport test request expectations to the non-generic response:

```ts
expect(session.correlate({ kind: "success", id: 2, hasResult: true, result: "second" })).toBe(
  true,
);
await expect(second).resolves.toEqual({ hasResult: true, result: "second" });
```

Add a correlated malformed test:

```ts
const request = session.request("turn/start", {});
expect(
  session.correlate({ kind: "malformed", failure: "mixedEnvelope", correlationId: 1 }),
).toBe(true);
await expect(request).rejects.toThrow("Malformed JSON-RPC message");
```

Change the fake request client in handshake/command tests to:

```ts
type DeferredRequest = {
  method: string;
  params: unknown;
  resolve: (response: GuiHostRpcResponse) => void;
  reject: (error: unknown) => void;
};

class DeferredRequestClient implements GuiHostRequestClient {
  readonly requests: DeferredRequest[] = [];
  request(method: string, params: unknown): Promise<GuiHostRpcResponse> {
    return new Promise((resolve, reject) => {
      this.requests.push({ method, params, resolve, reject });
    });
  }
}
```

Add exact stage tests:

```ts
requestAt(client, 0).resolve({ hasResult: false, result: undefined });
expect(onTerminalError).not.toHaveBeenCalled();
expect(client.requests).toHaveLength(1);
```

```ts
requestAt(client, 1).resolve({ hasResult: false, result: undefined });
expect(onTerminalError).toHaveBeenCalledExactlyOnceWith(
  "initialize returned no result payload",
  "protocol error",
);
```

Replace command response assertions with `Promise<void>` and add missing-result isolation:

```ts
const failed = commands.startTurn(startParams);
requestAt(client, 0).resolve({ hasResult: false, result: undefined });
await expect(failed).rejects.toThrow("Malformed JSON-RPC message");

const next = commands.interruptTurn(interruptParams);
requestAt(client, 1).resolve({ hasResult: true, result: {} });
await expect(next).resolves.toBeUndefined();
```

In `guiHostProtocolErrors.test.ts`, add tests proving:

```ts
sendRaw(socket, { jsonrpc: "1.0", id: 99, result: {} });
expect(statuses).toEqual(["connecting"]);
expect(socket.closed).toEqual([]);
```

```ts
sendRaw(socket, { jsonrpc: "2.0", id: "server-id", result: {} });
expect(statuses).toEqual(["connecting"]);
```

```ts
sendRaw(socket, {
  jsonrpc: "2.0",
  id: null,
  error: { code: -32601, message: "method not found" },
});
expect(statuses.at(-1)?.label).toBe("error");
expect(socket.closed).toEqual([{ code: 1000, reason: "handshake error" }]);
```

```ts
sendRaw(socket, { jsonrpc: "1.0", arbitrary: true });
expect(statuses).toEqual(["connecting"]);
expect(socket.closed).toEqual([]);
```

Add `sendRaw(socket, value)` and `sendJsonRpcResultWithoutPayload(socket, id)` to test support; both must serialize explicit test-owned envelopes.

- [ ] **Step 3: Run the focused suite and verify RED**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: FAIL because `decodeRpcMessage`, discriminated envelopes, `hasResult`, protocol correlation failure, and `Promise<void>` do not exist yet.

- [ ] **Step 4: Implement the discriminated envelope and transport contract**

Replace `RpcMessage`/`parseRpcMessage` with these exported shapes:

```ts
export type RpcId = string | number | null;
export type RpcSuccessResponse = {
  kind: "success";
  id: RpcId;
  hasResult: boolean;
  result: unknown;
};
export type RpcErrorResponse = {
  kind: "error";
  id: RpcId;
  error: { code: number; message: string; data?: unknown };
};
export type RpcNotification = {
  kind: "notification";
  method: string;
  params: unknown;
};
export type RpcMalformedEnvelope = {
  kind: "malformed";
  failure:
    | "invalidTopLevel"
    | "invalidVersion"
    | "mixedEnvelope"
    | "invalidResponseId"
    | "invalidError"
    | "invalidNotification"
    | "missingDiscriminant";
  correlationId?: number;
  method?: string;
  params?: unknown;
};
export type RpcMessage =
  | RpcSuccessResponse
  | RpcErrorResponse
  | RpcNotification
  | RpcMalformedEnvelope;
```

`decodeRpcMessage` must perform one `JSON.parse`, require `jsonrpc === "2.0"` for valid branches, use `Object.hasOwn(parsed, "result")` for `hasResult`, accept string/number/null response IDs, require both numeric `error.code` and string `error.message` for a valid error response, and preserve optional `error.data` only when the property exists. Every malformed return must carry exactly one `failure` value from the self-contained union above; this classification is internal and must not change any public error text. It returns malformed hints without throwing except on invalid JSON.

Change transport types to:

```ts
export type GuiHostRequestFailureSource = "rpc" | "protocol" | "send" | "unavailable";
export type GuiHostRpcResponse = { hasResult: boolean; result: unknown };
export type GuiHostRequestClient = {
  request(method: string, params: unknown): Promise<GuiHostRpcResponse>;
};
```

`correlate` accepts only response/malformed branches, uses `message.id` or `message.correlationId`, ignores non-numeric/unmatched IDs, deletes the pending entry first, rejects valid errors with source `rpc`, rejects malformed with source `protocol` and `Malformed JSON-RPC message`, and resolves success with `{ hasResult, result }`.

- [ ] **Step 5: Implement owner-specific result and routing policy**

Change command API and gateway:

```ts
export type GuiHostCommands = {
  startTurn: (params: TurnStartParams) => Promise<void>;
  interruptTurn: (params: TurnInterruptParams) => Promise<void>;
};
```

```ts
private async request(method: string, params: unknown): Promise<void> {
  this.assertReady();
  const response = await this.requestClient.request(method, params);
  if (!response.hasResult) {
    throw new Error("Malformed JSON-RPC message");
  }
}
```

Handshake must branch on `hasResult` before payload inspection: authenticate missing result silently deactivates; initialize/attach missing result call the existing exact protocol errors. Extend its request catch so source `rpc` uses `handshake error`, source `protocol` uses `Malformed JSON-RPC message` with `protocol error`, while send/unavailable stay non-duplicating lifecycle failures.

Change client routing to an exhaustive `switch (message.kind)`: numeric response/malformed first calls `transport.correlate` and always returns; string/null success returns; string/null error uses the existing facade terminal RPC error; notification routes known methods; unmatched unknown malformed object returns unless `method` is one of the three known projection methods, in which case it enters that method's existing malformed payload error.

- [ ] **Step 6: Run GREEN tests and focused formatting**

Run the Step 3 test command.

Expected: PASS; command tests resolve to `undefined`; unmatched cases leave the socket open.

Then run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts
```

Expected: write touches only listed Task 1 files; check passes. Re-run Step 3 after formatting and expect PASS.

- [ ] **Step 7: Stage, enforce the review-size gate, and commit Task 1**

From `/Users/jiangsheng/cnb/codex`:

```bash
git add codex-gui/src/features/guiHost/guiHostProtocol.ts codex-gui/src/features/guiHost/guiHostTransportSession.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostHandshakeController.ts codex-gui/src/features/guiHost/guiHostCommandGateway.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached --numstat | awk '{ added += $1; deleted += $2 } END { print added + deleted }'
```

Expected: only Task 1 paths are staged; total is below 800 and non-mechanical behavior work is reviewed below 500. Then run:

```bash
git commit -m "refactor(gui): validate rpc envelopes"
```

### Task 2: Add attach DTO validation and migrate the attach runtime chain

**Files:**

- Create: `codex-gui/src/features/guiHost/guiHostProjectionDto.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts`
- Modify: attach callback/type paths listed in the file map
- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Modify: `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Write RED attach decoder tests with cloned fixtures**

Add a helper and identity test:

```ts
const cloneAttach = (): unknown => structuredClone(attachBaseline);

it("decodes an attach DTO without copying or dropping extra fields", () => {
  const input = structuredClone(attachBaseline) as Record<string, unknown>;
  input.extraTopLevel = "preserved";
  const decoded = decodeThreadProjectionAttachResponse(input);
  expect(decoded).toBe(input);
  expect(decoded?.extraTopLevel).toBe("preserved");
});
```

Use `it.each` with a fresh `cloneAttach()` per case to mutate exactly one of: subscription ID, head commit, thread ID/session ID, turns array, turn status/itemsView/error/timestamps, user text input, agent message text/phase, unknown item type, and missing identity-only item ID. Add type assertions:

```ts
expectTypeOf<ThreadProjectionAttachResponse>().toExtend<FrontendProjectionAttachResponse>();
expectTypeOf<FrontendProjectionAttachResponse>().not.toExtend<ThreadProjectionAttachResponse>();
```

- [ ] **Step 2: Write RED end-to-end attach type tests**

Change compile-time expectations so handshake callback, `ProjectionIngressAdapter.handleAttach`, coordinator attach handler, `threadRuntimeAttached`, transcript rebuild, and snapshot/live type-only helpers accept `FrontendProjectionAttachResponse` / `FrontendProjectionTurn` / `FrontendProjectionItem`, not generated full attach types. Keep all existing runtime equality assertions unchanged.

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts
```

Expected: FAIL because frontend DTO types/decoder do not exist and production signatures still require generated attach/turn/item types.

- [ ] **Step 3: Implement exact frontend attach DTO types and protocol-owned validators**

Create `guiHostProjectionDto.ts` with `Record<string, unknown>`-preserving intersections and these exact unions:

```ts
type ExtraFields = Record<string, unknown>;
type IdentityItemType =
  | "hookPrompt"
  | "plan"
  | "reasoning"
  | "commandExecution"
  | "fileChange"
  | "mcpToolCall"
  | "dynamicToolCall"
  | "collabAgentToolCall"
  | "subAgentActivity"
  | "webSearch"
  | "imageView"
  | "sleep"
  | "imageGeneration"
  | "enteredReviewMode"
  | "exitedReviewMode"
  | "contextCompaction";

type IdentityProjectionItem<T extends IdentityItemType = IdentityItemType> = {
  [K in T]: ExtraFields & { type: K; id: string };
}[T];

export type FrontendUserInput =
  | (ExtraFields & { type: "text"; text: string })
  | {
      [K in "image" | "localImage" | "skill" | "mention"]: ExtraFields & { type: K };
    }["image" | "localImage" | "skill" | "mention"];

export type FrontendProjectionItem =
  | (ExtraFields & { type: "userMessage"; id: string; content: FrontendUserInput[] })
  | (ExtraFields & {
      type: "agentMessage";
      id: string;
      text: string;
      phase: "commentary" | "final_answer" | null;
    })
  | IdentityProjectionItem;

export type FrontendProjectionTurnError = ExtraFields & {
  message: string;
  codexErrorInfo: unknown | null;
  additionalDetails: string | null;
};

export type FrontendProjectionTurn = ExtraFields & {
  id: string;
  items: FrontendProjectionItem[];
  itemsView: "notLoaded" | "summary" | "full";
  status: "completed" | "interrupted" | "failed" | "inProgress";
  error: FrontendProjectionTurnError | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
};

export type FrontendProjectionThread = ExtraFields & {
  id: string;
  sessionId: string;
  turns: FrontendProjectionTurn[];
};

export type FrontendProjectionSnapshot = ExtraFields & {
  thread: FrontendProjectionThread;
  headCommitId: string | null;
};

export type FrontendProjectionAttachResponse = ExtraFields & {
  subscriptionId: string;
  snapshot: FrontendProjectionSnapshot;
};
```

`guiHostProjectionDto.ts` stops at these type declarations and exports no runtime function. In the protocol-owned `FrontendProjectionTurnError` validator, `message` must be string, `additionalDetails` must be string/null, and `codexErrorInfo` must be an own property; its value is accepted as `unknown | null` without recursively validating the generated error schema. All three timestamps/durations must be number/null.

Implement all attach structural validators in `guiHostProtocol.ts`. They must use exhaustive switches, `Object.hasOwn` for required unknown-valued fields, validate every concrete DTO field, and never copy the input. Export `decodeThreadProjectionAttachResponse(value): FrontendProjectionAttachResponse | undefined`; success returns the same object reference.

- [ ] **Step 4: Migrate the real attach consumer chain without runtime edits**

Replace generated attach/turn/item imports with frontend DTO imports in the listed production files. Preserve existing bodies. Key type shapes become:

```ts
export type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Omit<FrontendProjectionThread, "turns">;
  snapshotTurns: FrontendProjectionTurn[];
  eventBuffer: ThreadRuntimeBufferedEvent[];
  activeTurnId: string | null;
  subscription: ThreadRuntimeSubscription;
};
```

```ts
export type TranscriptMessagePhase = Extract<
  FrontendProjectionItem,
  { type: "agentMessage" }
>["phase"];
```

Change `materializeTranscriptItem`, `applyCompletedTranscriptItem`, `appendStartedLiveItem`, `rebuildTranscriptFromSnapshot`, `snapshotReplay` and `liveEventHandling` signatures only; do not change their switch bodies, selectors, material order, reducer bodies, or tests' runtime expected values.

Handshake must call `decodeThreadProjectionAttachResponse` and keep the exact missing/malformed error strings. Client attach callback becomes `(response: FrontendProjectionAttachResponse) => void`.

- [ ] **Step 5: Run GREEN attach tests, type-check, and format**

Run the Step 2 test command, then:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: focused tests PASS; type-check PASS with no generated attach type required by production consumers.

Format and check exactly the Task 2 production/test paths:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostProjectionDto.ts src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/projectionIngress/projectionIngressAdapter.ts src/features/projectionCoordination/projectionApplicationCoordinator.ts src/features/threadRuntime/threadRuntimeSlice.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptEntryMaterialization.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptLiveProjection.ts src/features/snapshotReplay/snapshotReplay.ts src/features/liveEventHandling/liveEventHandling.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostProjectionDto.ts src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/projectionIngress/projectionIngressAdapter.ts src/features/projectionCoordination/projectionApplicationCoordinator.ts src/features/threadRuntime/threadRuntimeSlice.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptEntryMaterialization.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptLiveProjection.ts src/features/snapshotReplay/snapshotReplay.ts src/features/liveEventHandling/liveEventHandling.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: only Task 2 files change. Re-run Step 2 and expect PASS.

- [ ] **Step 6: Stage, enforce the review-size gate, and commit Task 2**

Stage exactly the Task 2 scope, then run:

```bash
git add codex-gui/src/features/guiHost/guiHostProjectionDto.ts codex-gui/src/features/guiHost/guiHostProtocol.ts codex-gui/src/features/guiHost/guiHostHandshakeController.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts codex-gui/src/features/transcriptState/transcriptLiveProjection.ts codex-gui/src/features/snapshotReplay/snapshotReplay.ts codex-gui/src/features/liveEventHandling/liveEventHandling.ts codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached --numstat | awk '{ added += $1; deleted += $2 } END { print added + deleted }'
```

Expected: total below 800; non-mechanical validator/behavior work below 500; no event DTO migration is staged. Commit:

```bash
git commit -m "refactor(gui): validate projection attachments"
```

### Task 3: Add event DTO validation and migrate the event runtime chain

**Files:**

- Modify: `codex-gui/src/features/guiHost/guiHostProjectionDto.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Modify: `codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Modify: `codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Write RED tests for all four event variants and cloned malformed mutations**

Use existing `eventTurnStarted`, `eventTurnCompleted`, `eventItemStarted`, and `eventItemCompleted` fixtures:

```ts
it.each([
  eventTurnStarted,
  eventTurnCompleted,
  eventItemStarted,
  eventItemCompleted,
])("returns the original event DTO object", (fixture) => {
  const input = structuredClone(fixture);
  expect(decodeThreadProjectionEventNotification(input)).toBe(input);
});
```

For every malformed case, call `structuredClone` inside the test before changing one outer commit field, event discriminant, turn field, item field, or timestamp. Add type assertions showing generated event extends the frontend DTO while the frontend DTO does not extend the generated event.

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts
```

Expected: FAIL because the event DTO/decoder and migrated production signatures do not exist.

- [ ] **Step 2: Implement event DTO types and protocol-owned decoder**

Add these shapes to `guiHostProjectionDto.ts`:

```ts
export type FrontendProjectionEvent =
  | {
      [K in "turnStarted" | "turnCompleted"]: ExtraFields & {
        type: K;
        notification: ExtraFields & { threadId: string; turn: FrontendProjectionTurn };
      };
    }["turnStarted" | "turnCompleted"]
  | (ExtraFields & {
      type: "itemStarted";
      notification: ExtraFields & {
        threadId: string;
        turnId: string;
        startedAtMs: number;
        item: FrontendProjectionItem;
      };
    })
  | (ExtraFields & {
      type: "itemCompleted";
      notification: ExtraFields & {
        threadId: string;
        turnId: string;
        completedAtMs: number;
        item: FrontendProjectionItem;
      };
    });

export type FrontendProjectionEventNotification = ExtraFields & {
  threadId: string;
  subscriptionId: string;
  commitId: string;
  parentCommitId: string | null;
  event: FrontendProjectionEvent;
};
```

`guiHostProjectionDto.ts` contains only these event type declarations. In `guiHostProtocol.ts`, implement separate turn/item notification validators and reuse the protocol-owned Task 2 turn/item validators. Export `decodeThreadProjectionEventNotification`; it returns the original object or `undefined`.

- [ ] **Step 3: Migrate the event consumer chain with type-only changes**

Change client callback, projection ingress outcome/handler/private event methods, coordinator handler, thread runtime event payload/buffer/replay helper, and related test type assertions to `FrontendProjectionEventNotification` / `FrontendProjectionEvent`. Preserve every switch branch, commit-chain check, known-turn update, action payload, replay classification and reducer order.

Do not modify `snapshotReplay` or `liveEventHandling` runtime logic. If type-check reaches them, change only imports/signatures to frontend DTO types already defined in Task 2.

- [ ] **Step 4: Run GREEN event tests, type-check, and format**

Run the Step 1 test command and `pnpm run type-check` through fnm.

Expected: PASS. Format and check exactly the Task 3 paths:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostProjectionDto.ts src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/projectionIngress/projectionIngressAdapter.ts src/features/projectionCoordination/projectionApplicationCoordinator.ts src/features/threadRuntime/threadRuntimeSlice.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostProjectionDto.ts src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/projectionIngress/projectionIngressAdapter.ts src/features/projectionCoordination/projectionApplicationCoordinator.ts src/features/threadRuntime/threadRuntimeSlice.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Re-run Step 1 and expect PASS after formatting.

- [ ] **Step 5: Stage, enforce the review-size gate, and commit Task 3**

```bash
git add codex-gui/src/features/guiHost/guiHostProjectionDto.ts codex-gui/src/features/guiHost/guiHostProtocol.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts codex-gui/src/features/projectionCoordination/projectionApplicationCoordinator.ts codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts codex-gui/src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached --numstat | awk '{ added += $1; deleted += $2 } END { print added + deleted }'
```

Expected: only Task 3 files are staged; total below 800 and non-mechanical work below 500. Commit:

```bash
git commit -m "refactor(gui): validate projection events"
```

### Task 4: Lock complete delta/closed validation and run final B03 verification

**Files:**

- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- No Redux, timeline, UI, Rust, generated schema, package, lockfile or snapshot changes

- [ ] **Step 1: Write RED direct decoder tests for every generated delta and closed field**

Use the four shared delta fixtures and `closedBackpressure`. First assert each decoder returns the same original object. Then clone before each mutation and delete or mistype one required field:

```ts
const input = structuredClone(eventReasoningTextDelta) as Record<string, unknown>;
const delta = input.delta as Record<string, unknown>;
const notification = delta.notification as Record<string, unknown>;
notification.contentIndex = "0";
expect(decodeThreadProjectionDeltaNotification(input)).toBeUndefined();
```

Repeat for outer thread/subscription, each variant's turn/item/delta/index fields, unknown delta discriminant, closed thread/subscription, and a non-`backpressure` reason. Add:

```ts
expectTypeOf<ReturnType<typeof decodeThreadProjectionDeltaNotification>>().toEqualTypeOf<
  ThreadProjectionDeltaNotification | undefined
>();
expectTypeOf<ReturnType<typeof decodeThreadProjectionClosedNotification>>().toEqualTypeOf<
  ThreadProjectionClosedNotification | undefined
>();
```

- [ ] **Step 2: Run delta/closed tests and verify RED**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: FAIL until the guards are exposed as decoders returning the complete generated types and all malformed cases are covered.

- [ ] **Step 3: Implement minimal delta/closed decoder exports**

Rename or wrap the existing complete guards as:

```ts
export function decodeThreadProjectionDeltaNotification(
  value: unknown,
): ThreadProjectionDeltaNotification | undefined {
  return isThreadProjectionDeltaNotification(value) ? value : undefined;
}

export function decodeThreadProjectionClosedNotification(
  value: unknown,
): ThreadProjectionClosedNotification | undefined {
  return isThreadProjectionClosedNotification(value) ? value : undefined;
}
```

Update client notification routing to call each decoder once and forward the returned object. Do not add object copies or downstream type migrations.

- [ ] **Step 4: Run the complete focused Node suite**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts
```

Expected: PASS with no failed tests or unhandled errors.

- [ ] **Step 5: Run scoped trust-boundary source searches**

From `codex-gui`:

```bash
rg -n -e 'ThreadProjectionAttachResponse' -e 'ThreadProjectionEventNotification' src/features/guiHost src/features/projectionIngress src/features/projectionCoordination src/features/threadRuntime src/features/transcriptState src/features/snapshotReplay src/features/liveEventHandling -g '*.ts' -g '*.tsx' -g '!**/__tests__/**'
rg -n -e 'as ThreadProjectionAttachResponse' -e 'as ThreadProjectionEventNotification' -e 'request<T' -e 'GuiHostRpcResponse<' src/features/guiHost src/features/projectionIngress src/features/projectionCoordination src/features/threadRuntime src/features/transcriptState src/features/snapshotReplay src/features/liveEventHandling -g '*.ts' -g '*.tsx' -g '!**/__tests__/**'
```

Expected: no production generated attach/event import, assertion, generic request or generic RPC response remains. Generated delta/closed imports in `guiHostProtocol.ts`/client are allowed and must be reviewed explicitly.

- [ ] **Step 6: Run final formatting, static verification, and Node CI**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Expected: every command exits 0. `pnpm run ci` repeats format/lint/type-check/unit and does not run Browser Mode.

- [ ] **Step 7: Run the existing Browser handoff/Redux regression separately**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: `App.browser.test.tsx` passes on configured Chromium, Firefox and WebKit instances; no new browser decoder test or snapshot is created.

- [ ] **Step 8: Format any final Task 4 edits, re-run the focused delta test, and stage**

If Step 6 identifies formatting changes, run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostProtocol.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Then re-run Step 2 and expect PASS.

From the repository root, stage only Task 4 files and run:

```bash
git add codex-gui/src/features/guiHost/guiHostProtocol.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocol.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached --numstat | awk '{ added += $1; deleted += $2 } END { print added + deleted }'
```

Expected: only Task 4 protocol/client/test files are staged; total below 800 and non-mechanical work below 500.

- [ ] **Step 9: Create the fourth code-batch local commit**

```bash
git commit -m "test(gui): lock runtime protocol validation"
```

Expected: commit succeeds. Final `git status --short` shows no uncommitted B03 code/test files; unrelated pre-existing user changes, if any, remain untouched.

## Final self-review before execution approval

- Four code commits map one-to-one to envelope+command, attach DTO, event DTO, and delta/closed+verification review boundaries.
- Every production behavior begins with a RED test and an observed expected failure.
- Every legal fixture comes from shared fixtures/builders; every malformed mutation clones first.
- No task installs dependencies, changes generated/Rust/wire/UI/timeline behavior, or uses Git remotes.
- `pnpm run ci` and Browser Mode are reported separately.
- Each code batch has `git diff --cached --numstat`, `<800` total-line gate, `<500` non-mechanical target, staged diff inspection and one local commit.
