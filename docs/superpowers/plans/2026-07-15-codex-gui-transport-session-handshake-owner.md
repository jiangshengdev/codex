# Codex GUI Transport Session 与 Handshake Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 待确认

**设计依据：** [Codex GUI Transport Session 与 Handshake Owner 设计](../specs/2026-07-15-codex-gui-transport-session-handshake-owner-design.md)（用户已在聊天中确认设计；本计划当前等待确认。进入实现后，Task 0 先同步两份文档的确认状态并独立提交）

**Goal:** 在保持公开 callbacks、成功 status 序列、RPC method/params、command Promise、projection handoff、错误文本、关闭理由和各终止路径 callback 顺序不变的前提下，把 GUI host 连接拆为 feature-private `TransportSession`、`HandshakeController` 与 `CommandGateway` 三个 owner，并移除握手对 request ID `1/2/3` 的阶段依赖。

**Architecture:** `guiHostTransportSession.ts` 独占 WebSocket handler、单调 request ID、pending correlation、failure-source 分类、pending rejection、close 与 handler teardown；`guiHostHandshakeController.ts` 只按 Promise 完成顺序执行 authenticate → initialize → attach；`guiHostCommandGateway.ts` 只拥有 attach 后 readiness、command 映射和永久 invalidation。`guiHostClient.ts` 保持唯一公开 facade，继续拥有 `GuiHostStatus`、terminal/disposed gates、逐路径 callback 顺序、现有 parser/guards 与 projection notification routing。

**Tech Stack:** TypeScript 6、WebSocket、JSON-RPC 2.0、Vitest Node、oxfmt、oxlint、ESLint、fnm 管理的 Node/pnpm。

---

## 实施前提与范围边界

- 当前分支必须保持 `dev`。只有用户明确确认本计划并进入实现后，才执行 Task 0，把设计与计划状态同步为“已确认”并作为 docs-only 变更独立提交；代码任务不得 stage `docs/superpowers/**`，最后的实施状态更新除外。
- 所有 pnpm 命令都在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。不得直接调用 Codex runtime shim 下的 `pnpm`。
- 不安装、升级或重建依赖、运行时、浏览器二进制；不执行 `pnpm install`、`pnpm add` 或任何 Git 远程命令。
- 实施使用 TDD：先提交 GREEN characterization；每个新 owner 先写 RED unit test，再写最小实现；facade 收缩前先写 duplicate、out-of-order、stale 与 unmatched numeric error 的 RED integration tests。
- 不修改 `codex-gui/src/features/guiHost/guiHostProtocol.ts`，不改变 `parseRpcMessage`、projection guards、generated `@codex-protocol/v2` 类型或 command success runtime trust；这些属于 B03。
- 不修改 `features/browserLaunch/**`、`GuiHostConnectionBridge`、Redux、projection coordinator、thread runtime、React/UI、Rust、schema、snapshot、lockfile或 generated files。
- 不新增第四个 `ProtocolRouter`、通用 event bus、跨 feature `shared/common/utils` 或 lifecycle framework。
- 不运行 Browser Mode、Playwright、UI snapshot 或 Rust tests。本批次没有 UI 文案或布局变化，不需要 `insta` 或浏览器截图。
- `GuiHostStatus`、`GuiHostCommands`、`StartGuiHostConnectionOptions` 与 cleanup 继续由 `guiHostClient.ts` 暴露；三个新 owner 只在 `features/guiHost` 内使用，不从 package 或 feature barrel 导出。
- 所有手工源码编辑使用 `apply_patch`；格式化只用项目 `oxfmt` 命令，并先限定文件 write、再限定文件 check。

## 文件结构与提交边界

- Task 0 modifies only the accepted spec and this plan, then commits `docs(gui): design gui host connection owners`.
- Task 1 modifies only existing GUI host tests/support and commits `test(gui): lock gui host connection lifecycle`.
- Task 2 creates `guiHostTransportSession.ts` and `guiHostTransportSession.test.ts`, then commits `refactor(gui): add gui host transport session`.
- Task 3 creates `guiHostHandshakeController.ts`、`guiHostHandshakeController.test.ts`、`guiHostCommandGateway.ts`、`guiHostCommandGateway.test.ts`, then commits `refactor(gui): add gui host handshake and command owners`.
- Task 4 first adds RED integration coverage, then atomically contracts `guiHostClient.ts` and adjusts the three existing integration test files, then commits `refactor(gui): split gui host connection owners`.
- Task 5 performs formatting, focused tests, lint/type-check, `pnpm run ci`, source searches and diff-size review. It creates no planned commit; the documented failure-closure path creates one `fix(gui): close B02 verification findings` commit containing only accepted B02 files.
- Task 6 runs only after Task 5 is green, updates `00-summary.md` and `02-gui-host-transport-and-protocol.md` with actual execution evidence, and creates a separate docs commit.
- Normal execution creates six local commits: one accepted-design docs commit, four code/test task commits, and one final report commit. The Task 5 failure-closure path adds exactly one seventh local fix commit.

### Task 0: Record the accepted design and plan before code implementation

**Files:**

- Modify: `docs/superpowers/specs/2026-07-15-codex-gui-transport-session-handshake-owner-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-codex-gui-transport-session-handshake-owner.md`
- No code or report files

- [ ] **Step 1: Synchronize both document status lines after plan approval**

Use `apply_patch` to change the design document's `状态：待确认` to `状态：已确认`, and change this plan's `**状态：** 待确认` to `**状态：** 已确认`. Do not change the accepted design content, plan tasks, report status or implementation evidence.

- [ ] **Step 2: Verify the docs-only diff**

Run from the repository root:

```bash
git diff --no-index --check /dev/null docs/superpowers/specs/2026-07-15-codex-gui-transport-session-handshake-owner-design.md
git diff --no-index --check /dev/null docs/superpowers/plans/2026-07-15-codex-gui-transport-session-handshake-owner.md
git status --short -- docs/superpowers/specs/2026-07-15-codex-gui-transport-session-handshake-owner-design.md docs/superpowers/plans/2026-07-15-codex-gui-transport-session-handshake-owner.md
```

Expected: each no-index command prints no whitespace diagnostics; exit code 1 is expected because each new document differs from `/dev/null`. Status lists exactly the accepted spec and plan in this docs-only scope.

- [ ] **Step 3: Create the accepted-design local commit**

Run:

```bash
git add docs/superpowers/specs/2026-07-15-codex-gui-transport-session-handshake-owner-design.md docs/superpowers/plans/2026-07-15-codex-gui-transport-session-handshake-owner.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs(gui): design gui host connection owners"
```

Expected: staged diff contains exactly the two accepted documents; commit succeeds before Task 1 starts.

### Task 1: Characterize facade lifecycle and remove fixed-ID assumptions from test support

**Files:**

- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- No production files

- [ ] **Step 1: Make phase helpers discover the outbound request ID by method**

Use `apply_patch` to add this helper after `readRpcMethod` and replace the three fixed-ID phase helpers:

```ts
export function readLatestRpcRequest(
  socket: RecordingWebSocket,
  method: string,
): ParsedRpcRequest {
  const request = socket.sent.map(readRpcRequest).findLast((candidate) => candidate.method === method);
  if (!request) {
    throw new Error(`Expected ${method} request`);
  }
  return request;
}

export function sendAuthenticateResult(socket: RecordingWebSocket): void {
  sendJsonRpcResult(socket, readLatestRpcRequest(socket, "gui/authenticate").id, {
    authenticated: true,
  });
}

export function sendInitializeResult(socket: RecordingWebSocket): void {
  sendJsonRpcResult(socket, readLatestRpcRequest(socket, "initialize").id, {});
}

export function sendAttachResult(
  socket: RecordingWebSocket,
  attachResponse: ThreadProjectionAttachResponse,
): void {
  sendJsonRpcResult(
    socket,
    readLatestRpcRequest(socket, "thread/projection/attach").id,
    attachResponse,
  );
}
```

Update command tests to read the actual `turn/start` or `turn/interrupt` request ID before sending a result/error. Keep the full outbound object assertion, but bind the ID instead of assuming `4`:

```ts
const request = readLatestRpcRequest(socket, "turn/start");
expect(request).toEqual({ jsonrpc: "2.0", id: request.id, method: "turn/start", params });
sendJsonRpcResult(socket, request.id, response);
```

Use the same shape for `turn/interrupt` and `sendJsonRpcError`.

- [ ] **Step 2: Add GREEN callback-order characterization tests**

Add these tests to the existing suites, using a shared `calls: string[]` per test:

```ts
it("keeps attach, status, and commands-ready callback order", () => {
  const calls: string[] = [];
  const { socket } = startGuiHostConnectionWithSocket({
    attachResponse: attachBaseline,
    onProjectionAttached: () => calls.push("projection-attached"),
    onStatus: (status) => calls.push(`status:${status.label}`),
    onCommandsReady: () => calls.push("commands-ready"),
  });

  socket.onopen?.();
  sendAuthenticateResult(socket);
  sendInitializeResult(socket);
  calls.length = 0;
  sendAttachResult(socket, attachBaseline);

  expect(calls).toEqual(["projection-attached", "status:attached", "commands-ready"]);
});
```

```ts
it("emits protocol error before commands become unavailable", () => {
  const calls: string[] = [];
  const { socket } = startConnectionUntilCommandsReady({
    attachResponse: attachBaseline,
    onStatus: (status) => calls.push(`status:${status.label}`),
    onCommandsUnavailable: () => calls.push("commands-unavailable"),
  });
  calls.length = 0;

  socket.onmessage?.({ data: "{" });

  expect(calls).toEqual(["status:error", "commands-unavailable"]);
});
```

```ts
it("makes commands unavailable before reporting socket error", () => {
  const calls: string[] = [];
  const { socket } = startConnectionUntilCommandsReady({
    attachResponse: attachBaseline,
    onStatus: (status) => calls.push(`status:${status.label}`),
    onCommandsUnavailable: () => calls.push("commands-unavailable"),
  });
  calls.length = 0;

  socket.onerror?.();

  expect(calls).toEqual(["commands-unavailable", "status:error"]);
});
```

Also add a cleanup characterization that calls cleanup twice, expects one unavailable callback, one `{ code: 1000, reason: "cleanup" }` close and no status after `connecting`; and add a socket-error-then-abnormal-close characterization that expects both existing error callbacks rather than deduplication.

- [ ] **Step 3: Run the existing implementation against the characterization suite**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: PASS. These tests lock current lifecycle behavior and do not require production edits.

- [ ] **Step 4: Format and re-check only Task 1 files**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: write touches only the four listed files; check passes.

- [ ] **Step 5: Re-run the characterization suite**

Run the Step 3 command again.

Expected: PASS after formatting.

- [ ] **Step 6: Create the tests-only local commit**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
git add codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "test(gui): lock gui host connection lifecycle"
```

Expected: only the four test/support paths are staged; commit succeeds; no production or docs path is included.

### Task 2: Add the feature-private TransportSession with failure-source semantics

**Files:**

- Create: `codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`
- No facade integration yet

- [ ] **Step 1: Write RED transport unit tests**

Create `guiHostTransportSession.test.ts` with a local socket double and tests for:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  GuiHostRequestError,
  GuiHostTransportSession,
} from "../guiHostTransportSession";

class TransportSocket {
  sent: string[] = [];
  closed: Array<{ code?: number; reason?: string }> = [];
  readyState = WebSocket.OPEN;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn((message: string) => this.sent.push(message));
  close = vi.fn((code?: number, reason?: string) => this.closed.push({ code, reason }));
}
```

Cover all of these exact contracts:

- first and second requests use IDs `1` and `2`;
- `correlate({ id: 2, result: { value: "second" } })` settles only request 2;
- a duplicate or unknown numeric response returns `false` and settles nothing;
- correlated JSON-RPC error rejects with `GuiHostRequestError.source === "rpc"` and the existing `JSON-RPC error (id=..., code=...): ...` message;
- synchronous `socket.send` throw rejects with `source === "send"` and preserves the thrown Error message;
- request after invalidation and requests rejected by invalidation use `source === "unavailable"` and `GUI host WebSocket is not available`;
- `socket.onerror` and `socket.onclose` reject pending requests before invoking their lifecycle callback;
- `dispose(1000, "cleanup")` rejects pending requests, detaches all four handlers, closes once, and is idempotent.

- [ ] **Step 2: Run the transport test and verify RED**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts
```

Expected: FAIL because `../guiHostTransportSession` does not exist.

- [ ] **Step 3: Implement the minimal transport owner**

Create `guiHostTransportSession.ts` with these types and responsibilities:

```ts
import type { RpcMessage } from "./guiHostProtocol";

export type GuiHostRequestFailureSource = "rpc" | "send" | "unavailable";

export class GuiHostRequestError extends Error {
  readonly source: GuiHostRequestFailureSource;

  constructor(source: GuiHostRequestFailureSource, message: string) {
    super(message);
    this.name = "GuiHostRequestError";
    this.source = source;
  }
}

export type GuiHostRpcResponse<T> = {
  result: T | undefined;
};

export type GuiHostRequestClient = {
  request: <T>(method: string, params: unknown) => Promise<GuiHostRpcResponse<T>>;
};

type TransportCallbacks = {
  onOpen: () => void;
  onError: () => void;
  onClose: (event: CloseEvent) => void;
  onMessage: (data: string) => void;
};

type PendingRequest = {
  resolve: (response: GuiHostRpcResponse<unknown>) => void;
  reject: (error: GuiHostRequestError) => void;
};
```

Implement `GuiHostTransportSession` so that:

```ts
export class GuiHostTransportSession implements GuiHostRequestClient {
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private invalidated = false;
  private disposed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly callbacks: TransportCallbacks,
  ) {
    socket.onopen = () => {
      if (!this.disposed) this.callbacks.onOpen();
    };
    socket.onerror = () => {
      if (this.disposed) return;
      this.invalidate();
      this.callbacks.onError();
    };
    socket.onclose = (event) => {
      if (this.disposed) return;
      this.invalidate();
      this.callbacks.onClose(event);
    };
    socket.onmessage = (event) => {
      if (!this.disposed) this.callbacks.onMessage(String(event.data));
    };
  }

  request<T>(method: string, params: unknown): Promise<GuiHostRpcResponse<T>>;
  correlate(message: RpcMessage): boolean;
  invalidate(): void;
  close(code: number, reason: string): void;
  dispose(code: number, reason: string): void;
}
```

`request` must reject unavailable when invalidated/disposed/CLOSING/CLOSED; allocate and store before `socket.send`; serialize `{ jsonrpc: "2.0", id, method, params }`; delete the entry on send throw. `correlate` must only consume a numeric ID currently in the map, delete before settling, reject RPC errors with source `rpc`, and otherwise resolve `{ result: message.result }`. `invalidate` rejects and clears every pending entry exactly once without closing the socket. `close` preserves the current catch-and-ignore close race behavior. `dispose` is idempotent, marks disposed, invalidates, nulls handlers, then closes.

- [ ] **Step 4: Run transport tests and verify GREEN**

Run the Step 2 command.

Expected: PASS; failure-source assertions and cleanup idempotency all pass.

- [ ] **Step 5: Format, check and rerun Task 2 tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts
```

Expected: format check and tests pass.

- [ ] **Step 6: Commit the transport owner**

Run from the repository root:

```bash
git add codex-gui/src/features/guiHost/guiHostTransportSession.ts codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts
git diff --cached --check
git commit -m "refactor(gui): add gui host transport session"
```

Expected: commit contains only the transport owner and its unit test.

### Task 3: Add HandshakeController and CommandGateway as independently tested owners

**Files:**

- Create: `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- Create: `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`

- [ ] **Step 1: Write RED HandshakeController tests**

Use a deferred `GuiHostRequestClient` fake whose `request` records `{ method, params, resolve, reject }`. Cover:

- `start()` sends only `gui/authenticate` with `{ token }`;
- resolving authenticated result calls `onAuthenticated`, then sends `initialize` with `{ clientInfo: { name: "codex-gui", version: "0.0.0" }, capabilities: {} }`;
- resolving initialize with `{}` calls `onInitialized`, then sends `thread/projection/attach` with `{ threadId }`;
- valid attach calls `onAttached` once and completes;
- duplicate `start()` does not start a second chain;
- authenticate result without `authenticated: true` stops without status or terminal error;
- missing initialize result emits `initialize returned no result payload` / `protocol error`;
- missing or malformed attach uses the two existing attach messages / `protocol error`;
- `GuiHostRequestError("rpc", ...)` emits terminal error / `handshake error`;
- `send` and `unavailable` failure sources are consumed without terminal callback;
- `stop()` suppresses later milestones and attach callbacks.

Run the new test and expect module-not-found RED.

- [ ] **Step 2: Implement HandshakeController**

Create the controller with this dependency surface:

```ts
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import { isThreadProjectionAttachResponse } from "./guiHostProtocol";
import {
  GuiHostRequestError,
  type GuiHostRequestClient,
} from "./guiHostTransportSession";

type HandshakeCallbacks = {
  onAuthenticated: () => void;
  onInitialized: () => void;
  onAttached: (response: ThreadProjectionAttachResponse) => void;
  onTerminalError: (message: string, closeReason: string) => void;
};

export class GuiHostHandshakeController {
  private started = false;
  private active = true;

  constructor(
    private readonly requestClient: GuiHostRequestClient,
    private readonly token: string,
    private readonly threadId: string,
    private readonly callbacks: HandshakeCallbacks,
  ) {}

  start(): void {
    if (this.started || !this.active) return;
    this.started = true;
    void this.run();
  }

  stop(): void {
    this.active = false;
  }
}
```

Implement one private async `run()` with three sequential awaits. After every await, check `active` before emitting a milestone or sending the next request. Preserve current payload checks and messages. Catch only at the outer boundary: call `onTerminalError(error.message, "handshake error")` only when `error instanceof GuiHostRequestError && error.source === "rpc"`; consume all other request failures.

- [ ] **Step 3: Run HandshakeController tests and verify GREEN**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshakeController.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write RED CommandGateway tests**

Use a request-client fake and cover:

- before activation, both commands reject `GUI host WebSocket is not available` and send nothing;
- `activate()` returns the stable commands handle and a second activation returns the same handle without resetting state;
- `startTurn` maps to `turn/start`; `interruptTurn` maps to `turn/interrupt`; params are unchanged;
- success resolves `response.result ?? {}` with the current generated response type assertion boundary;
- RPC error rejects only that command and the gateway remains ready for the next command;
- `invalidate()` while ready calls the injected unavailable callback once;
- invalidation before ready does not call unavailable;
- invalidated gateway rejects new calls, cannot reactivate, and the old commands handle stays unavailable.

Run the new test and expect module-not-found RED.

- [ ] **Step 5: Implement CommandGateway**

Create this owner without moving the public `GuiHostCommands` type:

```ts
import type { TurnInterruptResponse, TurnStartResponse } from "@codex-protocol/v2";
import type { GuiHostCommands } from "./guiHostClient";
import type { GuiHostRequestClient } from "./guiHostTransportSession";

type CommandGatewayState = "inactive" | "ready" | "invalidated";

export class GuiHostCommandGateway {
  private state: CommandGatewayState = "inactive";
  private readonly commands: GuiHostCommands = {
    startTurn: async (params) => {
      this.assertReady();
      const response = await this.requestClient.request<TurnStartResponse>("turn/start", params);
      return (response.result ?? {}) as TurnStartResponse;
    },
    interruptTurn: async (params) => {
      this.assertReady();
      const response = await this.requestClient.request<TurnInterruptResponse>(
        "turn/interrupt",
        params,
      );
      return (response.result ?? {}) as TurnInterruptResponse;
    },
  };

  constructor(
    private readonly requestClient: GuiHostRequestClient,
    private readonly onUnavailable: () => void,
  ) {}

  activate(): GuiHostCommands | undefined;
  invalidate(): void;
  private assertReady(): void;
}
```

`activate` returns the stable handle when inactive, returns the same handle when already ready, and returns `undefined` when invalidated. `invalidate` transitions permanently to invalidated and invokes `onUnavailable` only when the previous state was ready. `assertReady` throws `new Error("GUI host WebSocket is not available")` unless ready.

- [ ] **Step 6: Run both owner suites and verify GREEN**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
```

Expected: both files pass.

- [ ] **Step 7: Format/check Task 3 files and rerun tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
```

Expected: checks and tests pass.

- [ ] **Step 8: Commit the handshake and command owners**

Run from the repository root:

```bash
git add codex-gui/src/features/guiHost/guiHostHandshakeController.ts codex-gui/src/features/guiHost/guiHostCommandGateway.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
git diff --cached --check
git commit -m "refactor(gui): add gui host handshake and command owners"
```

Expected: commit contains exactly the two owners and their two tests.

### Task 4: RED integration semantics, then atomically contract guiHostClient into the facade

**Files:**

- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`
- Reuse without semantic modification: `codex-gui/src/features/guiHost/guiHostProtocol.ts`

- [ ] **Step 1: Add RED duplicate, out-of-order, stale and unmatched-numeric-error tests**

Add integration tests with these exact expectations:

```ts
it("ignores a duplicate authenticate response", () => {
  const { labels, onStatus } = recordStatusLabels();
  const { socket } = startGuiHostConnectionWithSocket({ attachResponse: attachBaseline, onStatus });
  socket.onopen?.();
  const authenticateId = readLatestRpcRequest(socket, "gui/authenticate").id;
  sendAuthenticateResult(socket);
  const sentAfterAuthenticate = socket.sent.length;

  sendJsonRpcResult(socket, authenticateId, { authenticated: true });

  expect(socket.sent).toHaveLength(sentAfterAuthenticate);
  expect(labels).toEqual(["connecting", "authenticated"]);
});
```

```ts
it("ignores initialize and attach responses before their requests exist", () => {
  const { labels, onStatus } = recordStatusLabels();
  const attached = vi.fn();
  const commandsReady = vi.fn();
  const { socket } = startGuiHostConnectionWithSocket({
    attachResponse: attachBaseline,
    onStatus,
    onProjectionAttached: attached,
    onCommandsReady: commandsReady,
  });
  socket.onopen?.();

  sendJsonRpcResult(socket, 2, {});
  sendJsonRpcResult(socket, 3, attachBaseline);

  expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  expect(labels).toEqual(["connecting"]);
  expect(attached).not.toHaveBeenCalled();
  expect(commandsReady).not.toHaveBeenCalled();

  sendAuthenticateResult(socket);
  sendInitializeResult(socket);
  sendAttachResult(socket, attachBaseline);
  expect(labels).toEqual(["connecting", "authenticated", "initialized", "attached"]);
});
```

```ts
it("ignores a stale attach response delivered through a captured handler after cleanup", () => {
  const attached = vi.fn();
  const commandsReady = vi.fn();
  const { cleanup, socket } = startGuiHostConnectionWithSocket({
    attachResponse: attachBaseline,
    onProjectionAttached: attached,
    onCommandsReady: commandsReady,
  });
  const capturedOnMessage = socket.onmessage;
  cleanup();

  capturedOnMessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachBaseline }),
  });

  expect(attached).not.toHaveBeenCalled();
  expect(commandsReady).not.toHaveBeenCalled();
});
```

```ts
it("ignores an unmatched numeric JSON-RPC error response", () => {
  const { summaries, onStatus } = recordStatusSummaries();
  const { socket } = startGuiHostConnectionWithSocket({ attachResponse: attachBaseline, onStatus });

  sendJsonRpcError(socket, 99, { code: -32601, message: "unknown request" });

  expect(summaries).toEqual([{ label: "connecting", message: undefined }]);
  expect(socket.closed).toEqual([]);
});
```

- [ ] **Step 2: Run integration tests and verify RED for the intended fixed-ID behavior**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: the new cases fail because the current facade can re-enter stages by literal ID, route a captured stale attach response, and terminalize an unmatched numeric error. Existing tests remain green.

- [ ] **Step 3: Replace shared closure state with the three owners**

Use `apply_patch` to remove `nextRequestId`、`pendingRequests`、`commandsReady`、`request`、`commandRequest`、`commands`、`startHandshakeRequest`、literal ID branches and the local `PendingRequest`/`sendRequest` helpers from `guiHostClient.ts`.

Import and construct:

```ts
import { GuiHostCommandGateway } from "./guiHostCommandGateway";
import { GuiHostHandshakeController } from "./guiHostHandshakeController";
import { GuiHostTransportSession } from "./guiHostTransportSession";
```

Keep `closed` as the facade disposed gate and `terminalError` as the non-error suppression gate. Construct the socket first, then use `let handshakeController` / `let commandGateway` references in transport callbacks so the transport can be created before its dependents.

The facade protocol termination helper must preserve this order:

```ts
const failProtocolAndClose = (message: string, closeReason: string): void => {
  emit({ label: "error", message });
  handshakeController?.stop();
  transport.invalidate();
  commandGateway?.invalidate();
  transport.close(1000, closeReason);
};
```

Transport lifecycle callbacks must preserve their different existing order:

```ts
onError: () => {
  handshakeController?.stop();
  commandGateway?.invalidate();
  emit({ label: "error", message: "GUI host WebSocket failed" });
},
onClose: (event) => {
  handshakeController?.stop();
  commandGateway?.invalidate();
  if (event.code === 1000) {
    emit({ label: "closed" });
    return;
  }
  emit({
    label: "error",
    message: `GUI host WebSocket closed (code=${String(event.code)}${
      event.reason ? `, reason=${event.reason}` : ""
    })`,
  });
},
```

Transport already rejects pending requests before these callbacks, so socket error/close remains `pending rejection -> commands unavailable -> status`.

- [ ] **Step 4: Route parsed messages through correlation before facade notification routing**

The message callback must keep the existing parser and guards unchanged:

```ts
onMessage: (data) => {
  let message: RpcMessage;
  try {
    message = parseRpcMessage(data);
  } catch {
    failProtocolAndClose("Malformed JSON-RPC message", "invalid message");
    return;
  }

  if (transport.correlate(message)) {
    return;
  }

  if (typeof message.id === "number") {
    return;
  }

  if (message.error) {
    failProtocolAndClose(
      `JSON-RPC error (id=${formatRpcId(message.id)}, code=${String(message.error.code)}): ${
        message.error.message ?? ""
      }`.trim(),
      "handshake error",
    );
    return;
  }

  // Keep the three existing projection method branches and guards byte-for-byte equivalent.
}
```

The numeric-ID early return is the explicit duplicate/out-of-order/stale/unmatched response policy. Do not broaden it to method notifications or change no-ID error behavior.

- [ ] **Step 5: Wire handshake milestones and command activation through facade-owned callbacks**

Construct the gateway with `onCommandsUnavailable`, then construct the controller with these callbacks:

```ts
commandGateway = new GuiHostCommandGateway(transport, () => onCommandsUnavailable?.());
handshakeController = new GuiHostHandshakeController(transport, token, threadId, {
  onAuthenticated: () => emit({ label: "authenticated" }),
  onInitialized: () => emit({ label: "initialized" }),
  onAttached: (response) => {
    if (closed || terminalError) return;
    onProjectionAttached?.(response);
    emit({ label: "attached" });
    const commands = commandGateway?.activate();
    if (commands) onCommandsReady?.(commands);
  },
  onTerminalError: failProtocolAndClose,
});
```

`onOpen` calls `handshakeController?.start()` exactly once. The public cleanup remains synchronous and idempotent:

```ts
return () => {
  if (closed) return;
  closed = true;
  handshakeController.stop();
  transport.invalidate();
  commandGateway.invalidate();
  transport.dispose(1000, "cleanup");
};
```

This preserves cleanup as pending rejection → optional unavailable → detach/close, with no status.

- [ ] **Step 6: Run all GUI host owner and integration tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: PASS. In particular, the four new response-semantics tests are green and all existing lifecycle/error-order tests remain green.

- [ ] **Step 7: Format/check only B02 code and tests, then rerun focused tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Run the Step 6 Vitest command again.

Expected: format check and all focused tests pass.

- [ ] **Step 8: Commit the facade split**

Run from the repository root:

```bash
git add codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "refactor(gui): split gui host connection owners"
```

Expected: staged diff contains only the facade and three existing integration test adjustments. Task 1 support changes and new owner files are already committed. No docs, protocol, browser launch, Bridge, Redux, UI, Rust or generated file is staged.

### Task 5: Final code verification and scope audit

**Files:** no planned edits

- [ ] **Step 1: Verify the fnm-backed toolchain without installing anything**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file node --version
```

Expected: `which pnpm` prints the fnm-managed pnpm path, not a path under `/Users/jiangsheng/.cache/codex-runtimes/`; pnpm and Node report repository-compatible versions.

- [ ] **Step 2: Run focused GUI host tests**

Run the Task 4 Step 6 Vitest command.

Expected: all six GUI host test files pass.

- [ ] **Step 3: Run non-fix lint and type verification**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: both commands exit 0.

When lint reports B02-introduced fixable findings, run the project-native fixers only against the accepted B02 file set:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint --fix src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --fix src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

The path-limited fix commands should not touch files outside the accepted B02 set. Inspect the resulting diff before any further action. When the diff contains an out-of-scope path, an unrelated semantic change, or a pre-existing user change, stop and report it; do not restore, clean up or overwrite that change. Resolve remaining B02 type errors with `apply_patch` only in the same accepted files. Then run the limited format and verification closure:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: limited formatting, affected tests, non-fix lint and type-check all pass. Do not run workspace-wide fix commands.

Stage and commit the verified failure-closure changes from the repository root:

```bash
git add codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostTransportSession.ts codex-gui/src/features/guiHost/guiHostHandshakeController.ts codex-gui/src/features/guiHost/guiHostCommandGateway.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(gui): close B02 verification findings"
```

Expected: staged paths are a subset of the eleven accepted B02 code/test paths listed in `git add`; no docs, protocol, browser launch, Bridge, Redux, projection, UI, Rust, generated or pre-existing user change is staged. Cached diff check passes and the local fix commit succeeds before continuing to `pnpm run ci`.

- [ ] **Step 4: Run the repository GUI CI script**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Expected: `format:oxfmt`、lint、type-check and full Node `test:unit` all exit 0. Do not run `test:browser` or `test:e2e`.

- [ ] **Step 5: Prove the fixed-ID handshake and old shared-state implementation are gone**

Run from the repository root:

```bash
rg -n -e 'message\.id === [123]' codex-gui/src/features/guiHost
rg -n -e 'terminalOnError|commandsReady|pendingRequests|nextRequestId' codex-gui/src/features/guiHost/guiHostClient.ts
rg -n -e 'gui/authenticate|thread/projection/attach|turn/start|turn/interrupt' codex-gui/src/features/guiHost/guiHostTransportSession.ts
rg -n -e 'thread/projection/event|thread/projection/delta|thread/projection/closed' codex-gui/src/features/guiHost/guiHostTransportSession.ts
```

Expected: first two searches return no matches; transport contains no handshake, command or projection method knowledge. Method strings live only in the handshake controller, command gateway, facade projection router and tests where appropriate.

- [ ] **Step 6: Verify excluded files and changed-line size**

Run:

```bash
git diff --stat ':/^docs\(gui\): design gui host connection owners$'..HEAD -- codex-gui
git diff --name-only ':/^docs\(gui\): design gui host connection owners$'..HEAD -- codex-gui
git diff --numstat ':/^docs\(gui\): design gui host connection owners$'..HEAD -- codex-gui
```

Expected: code commits are limited to the four GUI host production files and their feature-local tests/support. `guiHostProtocol.ts`、`features/browserLaunch/**`、Bridge、Redux、projection、UI、Rust、lockfiles、snapshots and generated files are absent. Review total added/deleted lines against the 800-line guidance. A non-mechanical production/test change above 800 lines stops execution and must be split at an owner commit boundary before docs status updates.

- [ ] **Step 7: Inspect final working tree and commit evidence**

Run:

```bash
git status --short
git log --oneline ':/^docs\(gui\): design gui host connection owners$'..HEAD -- codex-gui
```

Expected: no uncommitted code/test changes remain. The log lists the four planned code commits in execution order and also lists `fix(gui): close B02 verification findings` when the documented failure-closure path ran; the accepted design/plan docs remain in the preceding Task 0 commit and are not mixed into code commits.

### Task 6: Update B02 implementation status only after all verification is green

**Files:**

- Modify: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`
- Modify: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`

- [ ] **Step 1: Update the summary finding and implementation table using actual evidence**

Use `apply_patch` only after Task 5 passes:

- change the `RA-02-002` summary status from `确认重构点` to `已实施（B02）` without changing its stable title, priority or evidence owner;
- add one B02 row under “实施状态更新” recording the actual completion date, every actual local code commit hash/message printed by the Task 5 Step 7 log command, the focused GUI host test counts, `pnpm run ci` result, source-search results, diff-size review and “未操作远程”；
- do not prefill or invent counts, hashes or success claims that were not observed in Task 5.

- [ ] **Step 2: Update the 02 report implementation evidence without rewriting the audit**

Use `apply_patch` to change only B02 implementation status/evidence:

- set `RA-02-002` to `已实施（B02）`;
- add a concise implementation-result paragraph stating that `guiHostTransportSession.ts`、`guiHostHandshakeController.ts` and `guiHostCommandGateway.ts` are the three feature-private owners, `guiHostClient.ts` is the facade, and literal request IDs no longer encode handshake stages;
- add the actual local commit and verification evidence from Task 5;
- retain the original finding title, priority, design rationale, exclusions and B03 boundary;
- do not change `RA-02-003` status or claim stronger runtime validation.

- [ ] **Step 3: Verify docs formatting and scope**

Run from the repository root:

```bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git diff --name-only
```

Expected: diff check passes; the final uncommitted diff contains exactly the two report files.

- [ ] **Step 4: Create the separate docs status commit**

Run:

```bash
git add docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git diff --cached --check
git commit -m "docs(gui): record B02 owner split"
```

Expected: commit contains only the two audit report files and records observed implementation evidence; no code or unrelated docs are staged.

## 最终验收清单

- [ ] 用户确认计划并进入实现后，Task 0 已先把 spec/plan 状态同步为“已确认”，并创建只含这两个文件的 `docs(gui): design gui host connection owners` 本地提交。
- [ ] `startGuiHostConnection` 仍是唯一 production connection entry；公开 options/types/callbacks/cleanup 形状不变。
- [ ] TransportSession 独占 socket、handlers、request IDs、pending correlation、failure source、rejection、close 与 teardown；不识别 handshake、commands 或 projection methods。
- [ ] HandshakeController 只通过 Promise 顺序推进 authenticate → initialize → attach；production 无 `message.id === 1/2/3` 阶段判断。
- [ ] CommandGateway 只在 attach 后 ready，RPC error 非终端，invalidation 永久且 unavailable callback 最多一次。
- [ ] duplicate、out-of-order、stale 和 unmatched numeric response 被忽略，不推进、不 close、不新增 status。
- [ ] no-ID existing JSON-RPC error 仍走 terminal protocol path；B03 parser/guard/trust semantics 未改变。
- [ ] 成功 status 与 attach callback 顺序保持；protocol error、socket error/close、cleanup 的现有相对顺序保持。
- [ ] local send failure 与 session invalidation 不被 HandshakeController 二次 terminalize；correlated handshake RPC error 仍 terminal。
- [ ] focused GUI host tests、lint、type-check 与 `pnpm run ci` 全部通过；未运行 Browser/Playwright/snapshot/Rust tests。
- [ ] lint/type failure 只使用限定 B02 文件的 oxlint/ESLint fix、限定 oxfmt 和 affected tests 闭环；未运行 workspace-wide fix。
- [ ] excluded files 无变更，diff size 符合审查指导，没有安装依赖、没有操作 Git 远程。
- [ ] 最后才更新两份审计报告，并且只记录实际 commit 与验证证据。
- [ ] 正常路径共有 6 个本地提交；只有 Task 5 的既定 failure-closure 被触发时才增加第 7 个 `fix(gui): close B02 verification findings` 提交。
