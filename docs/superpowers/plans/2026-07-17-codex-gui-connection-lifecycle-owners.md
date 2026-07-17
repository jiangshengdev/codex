# Codex GUI 连接生命周期 Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

状态：待确认

设计依据：[2026-07-17-codex-gui-connection-lifecycle-owners-design.md](../specs/2026-07-17-codex-gui-connection-lifecycle-owners-design.md)

**Goal:** 在不改变 `startGuiHostConnection` 公开接口、generated authoritative contract、同步握手时序、command Promise 语义及终止 callback 顺序的前提下，将 GUI host 连接闭包拆分为 `TransportSession`、`HandshakeController`、`CommandGateway` 三个 feature-private owner 和一个兼容 facade。

**Architecture:** `guiHostClient.ts` 保留 browser launch、generated envelope validation/classification、公开 status、projection callback 与跨 owner 终止顺序；`TransportSession` 独占 WebSocket、request correlation、同步 settlement 与 teardown；`HandshakeController` 通过窄 authoritative request capability 同步推进 authenticate → initialize → attach；`CommandGateway` 独占 stable commands handle 及 inactive/ready/invalidated 状态。三个 owner 不依赖 React、Redux、projection coordinator 或公开 options type。

**Tech Stack:** TypeScript 6、WebSocket、generated `@codex-protocol` / `@codex-gui-host-contract` 类型、generated request descriptors / validators、Vitest 4、oxfmt、oxlint、ESLint、pnpm（仅通过用户的 fnm runtime 调用）。

---

## Planned commit sequence

1. `docs(gui): design connection lifecycle owners`
2. `test(gui): lock connection lifecycle compatibility`
3. `refactor(gui): add gui host transport session`
4. `refactor(gui): add gui host handshake controller`
5. `refactor(gui): add gui host command gateway`
6. 可选，仅当 Task 5 发现本计划文件集内的问题时：`fix(gui): close connection lifecycle verification`
7. `docs(gui): record B02 lifecycle owners`

## 固定实施边界

- 只在 `dev` 分支执行；每个 task 开始前运行 `git branch --show-current`，预期输出 `dev`。
- 所有 pnpm 命令均使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`；不得使用 Codex runtime shim。
- 不安装、更新、删除或重建依赖、Node、pnpm、浏览器二进制或其他可执行组件。
- 不运行任何 git remote 命令，不 fetch、pull、push 或读取远程引用。
- 不恢复旧 B02 提交或复制旧实现。
- 不修改 `guiHostProtocol.ts`、`appServerProtocol.ts`、generated artifacts、browser launch、`GuiHostConnectionBridge.tsx`、Redux、projection、UI、Rust、lockfile 或 package scripts。
- 不新增 `ProtocolRouter`、shared types 文件、barrel export 或公共 session API。
- 不运行 browser/e2e、Rust 或 production build。本设计不产生 build-only 风险；若实现实际引入 dynamic import、module resolution 改造或其他计划外 build-only 风险，视为范围扩大并立即停止，不自动扩展 build，也不把普通内部实现选择交给用户。
- 每个 task 只 stage 其 `Files` 列表；stage 后先检查文件名、`git diff --cached --check` 和完整 staged diff，再本地 commit。
- 每个实现提交的 changed lines 必须小于 800；任何包含复杂非机械逻辑的单个提交目标小于 500 changed lines。整个 ownership extraction 属于 behavior-preserving 机械迁移并新增边界测试，aggregate 可以超过 800，但 Task 5 必须证明超出部分只来自机械移动或测试，且非机械逻辑 subtotal 小于 500；无法证明时停止并拆成更小的 coherent stage。
- 所有 frontend 命令均以 `codex-gui` 为工作目录；命令中的 `src/...` 路径相对于该目录。
- 所有 git status/diff/add/commit 命令均以仓库根目录为工作目录；frontend验证与git检查之间显式切换工作目录，不依赖调用方当前目录。

### Task 0: 确认计划并提交设计与计划

**Files:**
- Modify: `docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md`
- Stage existing: `docs/superpowers/specs/2026-07-17-codex-gui-connection-lifecycle-owners-design.md`

- [ ] **Step 1: 等待用户明确确认本计划**

只有用户明确回复“确认”“确认计划”或等价直接授权后才继续。确认前不得修改状态、stage 或 commit。

- [ ] **Step 2: 将计划状态改为已确认**

先执行状态 RED gate：

```bash
rg -n -e '^状态：待确认$' docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md
```

Expected: 命中且只命中计划开头状态行。

使用 `apply_patch` 只替换计划开头这一行：

```diff
-状态：待确认
+状态：已确认
```

再执行状态 GREEN gate：

```bash
rg -n -e '^状态：已确认$' docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md
```

Expected: 命中且只命中计划开头状态行。

- [ ] **Step 3: 检查文档格式和范围**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-07-17-codex-gui-connection-lifecycle-owners-design.md docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md
git diff -- docs/superpowers/specs/2026-07-17-codex-gui-connection-lifecycle-owners-design.md docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md
```

Expected: `git diff --check` 无输出；diff 只包含已确认设计和本计划，计划状态为“已确认”。

- [ ] **Step 4: Stage、检查并提交**

```bash
git add -- docs/superpowers/specs/2026-07-17-codex-gui-connection-lifecycle-owners-design.md docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): design connection lifecycle owners'
```

Expected staged names exactly:

```text
docs/superpowers/plans/2026-07-17-codex-gui-connection-lifecycle-owners.md
docs/superpowers/specs/2026-07-17-codex-gui-connection-lifecycle-owners-design.md
```

Expected: staged check 无输出；commit 成功且不包含代码、测试或报告。

### Task 1: 锁定当前连接生命周期兼容行为

**Files:**
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

- [ ] **Step 1: 在 handshake suite 添加 startup 同步异常 characterization**

先运行结构 RED gate：

```bash
rg -n -e 'propagates a WebSocket factory error after launch params' -e 'propagates an onLaunchParams error without creating the WebSocket' codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: 无命中且命令返回未找到；这只证明 characterization 尚未存在，不要求 production 行为失败。

在 `calls onLaunchParams synchronously before creating the WebSocket` 后插入以下完整测试；不得修改 production：

```ts
it("propagates a WebSocket factory error after launch params and before connecting", () => {
  const calls: string[] = [];
  const socketError = new Error("WebSocket factory failed");

  expect(() =>
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      onLaunchParams: () => {
        calls.push("launch");
      },
      onStatus: (status) => {
        calls.push(`status:${status.label}`);
      },
      createWebSocket: () => {
        calls.push("create-websocket");
        throw socketError;
      },
    }),
  ).toThrow(socketError);

  expect(calls).toEqual(["launch", "create-websocket"]);
});

it("propagates an onLaunchParams error without creating the WebSocket", () => {
  const createWebSocket = vi.fn<(url: string) => WebSocket>();
  const launchError = new Error("launch callback failed");

  expect(() =>
    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      onLaunchParams: () => {
        throw launchError;
      },
      createWebSocket,
    }),
  ).toThrow(launchError);

  expect(createWebSocket).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 在 protocol error suite 添加 response ID characterization**

先运行结构 RED gate：

```bash
rg -n -e 'ignores a valid success response with a non-numeric id' -e 'treats a valid error response with a non-numeric id as terminal' -e 'ignores an unmatched numeric JSON-RPC error response' codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: 无命中且命令返回未找到。

在 `surfaces JSON-RPC errors on initialize/attach instead of advancing` 前插入：

```ts
it("ignores a valid success response with a non-numeric id", () => {
  const { labels: statuses, onStatus } = recordStatusLabels();
  const { socket } = startGuiHostConnectionWithSocket({
    attachResponse: attachBaseline,
    onStatus,
  });

  socket.onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: "external", result: { authenticated: true } }),
  });

  expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  expect(statuses).toEqual(["connecting"]);
  expect(socket.closed).toEqual([]);
});

it("treats a valid error response with a non-numeric id as terminal", () => {
  const { summaries: statuses, onStatus } = recordStatusSummaries();
  const { socket } = startGuiHostConnectionWithSocket({
    attachResponse: attachBaseline,
    onStatus,
  });

  socket.onmessage?.({
    data: JSON.stringify({
      jsonrpc: "2.0",
      id: "external",
      error: { code: -32601, message: "method not found" },
    }),
  });

  expect(statuses.at(-1)).toEqual({
    label: "error",
    message: "JSON-RPC error (id=external, code=-32601): method not found",
  });
  expect(socket.closed).toEqual([{ code: 1000, reason: "handshake error" }]);
});

it("ignores an unmatched numeric JSON-RPC error response", () => {
  const { labels: statuses, onStatus } = recordStatusLabels();
  const { socket } = startGuiHostConnectionWithSocket({
    attachResponse: attachBaseline,
    onStatus,
  });

  socket.onmessage?.({
    data: JSON.stringify({
      jsonrpc: "2.0",
      id: 999,
      error: { code: -32601, message: "method not found" },
    }),
  });

  expect(statuses).toEqual(["connecting"]);
  expect(socket.closed).toEqual([]);
});
```

- [ ] **Step 3: 运行 characterization tests，确认它们在当前实现上为 GREEN**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: 两个文件全部 PASS。若任一新增测试 FAIL，停止；这表示计划描述与当前行为不一致，不得通过修改 production 强行变绿。

- [ ] **Step 4: Scoped format write/check 并复跑测试**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: format check 和 tests 均 PASS。

- [ ] **Step 5: Stage、检查 diff size 并提交**

```bash
git add -- codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached
git diff --cached --numstat
git commit -m 'test(gui): lock connection lifecycle compatibility'
```

Expected staged names exactly为两个 test 文件；changed lines 小于 800；commit 成功。

### Task 2: 抽取 TransportSession

**Files:**
- Create: `codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

- [ ] **Step 1: 创建 RED transport owner tests**

创建测试文件并从尚不存在的模块导入以下 production API；测试必须覆盖这些断言，不得通过 `as` 构造任意 request contract：

```ts
import { describe, expect, it, vi } from "vitest";
import { requestDescriptors } from "@/generated/appServerProtocol";
import { GuiHostTransportSession } from "../guiHostTransportSession";
import { RecordingWebSocket, readRpcRequest } from "./guiHostClientTestSupport";

class ThrowingWebSocket extends RecordingWebSocket {
  failNextSend = false;

  override send(message: string): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("send failed");
    }
    super.send(message);
  }
}

const callbacks = () => ({
  onOpen: vi.fn<() => void>(),
  onMessage: vi.fn<(data: unknown) => void>(),
  onError: vi.fn<() => void>(),
  onClose: vi.fn<(event: { code: number; reason: string }) => void>(),
});

describe("GuiHostTransportSession", () => {
  it("correlates a descriptor-bound result exactly once in the same stack", async () => {
    const socket = new RecordingWebSocket();
    const settlements: string[] = [];
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, {
      onOpen: vi.fn(),
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    });
    const promise = session.request(
      requestDescriptors["turn/interrupt"],
      { threadId: "thread-1", turnId: "turn-1" },
      (settlement) => {
        settlements.push(settlement.type);
      },
    );
    const request = readRpcRequest(socket.sent[0] ?? "");

    expect(session.settleResult(request.id, {})).toBe(true);
    expect(settlements).toEqual(["result"]);
    expect(session.settleResult(request.id, {})).toBe(false);
    await expect(promise).resolves.toEqual({});
  });

  it("reports missing result as a plain Error", async () => {
    const socket = new RecordingWebSocket();
    const failures: { source: string; error: Error }[] = [];
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks());
    const promise = session.request(
      requestDescriptors["turn/interrupt"],
      { threadId: "thread-1", turnId: "turn-1" },
      (settlement) => {
        if (settlement.type === "failure") {
          failures.push(settlement.failure);
        }
      },
    );
    const request = readRpcRequest(socket.sent[0] ?? "");

    expect(session.settleMissingResult(request.id)).toBe(true);
    await expect(promise).rejects.toThrow("turn/interrupt returned no result payload");
    expect(failures).toEqual([
      { source: "missingResult", error: new Error("turn/interrupt returned no result payload") },
    ]);
  });

  it("reports malformed result as a plain Error", async () => {
    const socket = new RecordingWebSocket();
    const sources: string[] = [];
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks());
    const promise = session.request(
      requestDescriptors["turn/start"],
      { threadId: "thread-1", clientUserMessageId: null, input: [] },
      (settlement) => {
        if (settlement.type === "failure") {
          sources.push(settlement.failure.source);
          expect(settlement.failure.error).toBeInstanceOf(Error);
        }
      },
    );
    const request = readRpcRequest(socket.sent[0] ?? "");

    expect(session.settleResult(request.id, { turn: null })).toBe(true);
    await expect(promise).rejects.toThrow("turn/start returned malformed result payload");
    expect(sources).toEqual(["malformedResult"]);
  });

  it("reports correlated rpc failure as a plain Error", async () => {
    const socket = new RecordingWebSocket();
    const sources: string[] = [];
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks());
    const promise = session.request(
      requestDescriptors["turn/interrupt"],
      { threadId: "thread-1", turnId: "turn-1" },
      (settlement) => {
        if (settlement.type === "failure") {
          sources.push(settlement.failure.source);
          expect(settlement.failure.error).toBeInstanceOf(Error);
        }
      },
    );
    const request = readRpcRequest(socket.sent[0] ?? "");

    expect(session.settleRpcError(request.id, { code: -32000, message: "rejected" })).toBe(true);
    await expect(promise).rejects.toThrow(
      `JSON-RPC error (id=${String(request.id)}, code=-32000): rejected`,
    );
    expect(sources).toEqual(["rpc"]);
  });

  it("reports synchronous send failure without invalidating the session", async () => {
    const socket = new ThrowingWebSocket();
    const sources: string[] = [];
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks());
    socket.failNextSend = true;

    const failed = session.request(
      requestDescriptors["turn/interrupt"],
      { threadId: "thread-1", turnId: "turn-1" },
      (settlement) => {
        if (settlement.type === "failure") {
          sources.push(settlement.failure.source);
        }
      },
    );
    await expect(failed).rejects.toThrow("send failed");
    expect(sources).toEqual(["send"]);

    const next = session.request(requestDescriptors["turn/interrupt"], {
      threadId: "thread-1",
      turnId: "turn-2",
    });
    expect(socket.sent).toHaveLength(1);
    const request = readRpcRequest(socket.sent[0] ?? "");
    session.settleResult(request.id, {});
    await expect(next).resolves.toEqual({});
  });

  it("rejects new requests as unavailable after invalidation", async () => {
    const socket = new RecordingWebSocket();
    const sources: string[] = [];
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks());
    session.invalidate("GUI host WebSocket is not available");

    const promise = session.request(
      requestDescriptors["turn/interrupt"],
      { threadId: "thread-1", turnId: "turn-1" },
      (settlement) => {
        if (settlement.type === "failure") {
          sources.push(settlement.failure.source);
        }
      },
    );

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(sources).toEqual(["unavailable"]);
    expect(socket.sent).toEqual([]);
  });

  it("hands socket lifecycle and raw message data to the facade synchronously", () => {
    const calls: string[] = [];
    const socket = new RecordingWebSocket();
    new GuiHostTransportSession(socket as unknown as WebSocket, {
      onOpen: () => calls.push("open"),
      onMessage: (data) => calls.push(`message:${String(data)}`),
      onError: () => calls.push("error"),
      onClose: (event) => calls.push(`close:${String(event.code)}:${event.reason}`),
    });

    socket.onopen?.();
    socket.onmessage?.({ data: "payload" });
    socket.onerror?.();
    socket.onclose?.({ code: 1006, reason: "lost" });

    expect(calls).toEqual(["open", "message:payload", "error", "close:1006:lost"]);
  });

  it("invalidates pending requests and disposes handlers exactly once", async () => {
    const socket = new RecordingWebSocket();
    const session = new GuiHostTransportSession(socket as unknown as WebSocket, callbacks());
    const promise = session.request(requestDescriptors["turn/interrupt"], {
      threadId: "thread-1",
      turnId: "turn-1",
    });

    session.dispose(1000, "cleanup");
    session.dispose(1000, "cleanup");

    await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onerror).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.closed).toEqual([{ code: 1000, reason: "cleanup" }]);
  });
});
```

- [ ] **Step 2: 运行 RED test**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts
```

Expected: FAIL，原因是 `../guiHostTransportSession` 不存在。

- [ ] **Step 3: 创建最终 authoritative-bound transport API**

`guiHostTransportSession.ts` 必须定义并实现以下核心类型和签名；名称在后续 task 中保持一致：

```ts
import type { JSONRPCMessage } from "@codex-protocol/JSONRPCMessage";
import {
  AUTHENTICATE_METHOD,
  type GuiAuthenticateParams,
  type GuiAuthenticateResult,
} from "@codex-gui-host-contract";
import { requestDescriptors } from "@/generated/appServerProtocol";
import { validateGuiAuthenticateResult } from "@/generated/guiHostContract";
import type { RequestParams, RequestResponse } from "./appServerProtocol";

export type GuiRequestMethod = keyof typeof requestDescriptors;
export type RequestDescriptor<M extends GuiRequestMethod> = (typeof requestDescriptors)[M];
type JsonRpcErrorResponse = Extract<JSONRPCMessage, { error: unknown }>;

export type TransportRequestFailure = {
  source: "rpc" | "missingResult" | "malformedResult" | "send" | "unavailable";
  error: Error;
};

export type TransportRequestSettlement<R> =
  | { type: "result"; response: R }
  | { type: "failure"; failure: TransportRequestFailure };

export type AppServerRequestSender = {
  request<M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
    onSettlement?: (settlement: TransportRequestSettlement<RequestResponse<M>>) => void,
  ): Promise<RequestResponse<M>>;
};

export type AuthenticateRequestSender = {
  authenticate(
    params: GuiAuthenticateParams,
    onSettlement?: (settlement: TransportRequestSettlement<GuiAuthenticateResult>) => void,
  ): Promise<GuiAuthenticateResult>;
};

export type GuiHostTransportCallbacks = {
  onOpen: () => void;
  onMessage: (data: unknown) => void;
  onError: () => void;
  onClose: (event: { code: number; reason: string }) => void;
};

export class GuiHostTransportSession
  implements AppServerRequestSender, AuthenticateRequestSender
{
  constructor(socket: WebSocket, callbacks: GuiHostTransportCallbacks);

  request<M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
    onSettlement?: (settlement: TransportRequestSettlement<RequestResponse<M>>) => void,
  ): Promise<RequestResponse<M>>;

  authenticate(
    params: GuiAuthenticateParams,
    onSettlement?: (settlement: TransportRequestSettlement<GuiAuthenticateResult>) => void,
  ): Promise<GuiAuthenticateResult>;

  settleResult(id: number, result: unknown): boolean;
  settleRpcError(id: number, rpcError: JsonRpcErrorResponse["error"]): boolean;
  settleMissingResult(id: number): boolean;
  invalidate(reason: string): void;
  close(code: number, reason: string): void;
  dispose(code: number, reason: string): void;
}
```

实现规则：

- `request` 直接使用传入 generated descriptor 的 `method` 与 `validateResponse`；`authenticate` 只组合 `AUTHENTICATE_METHOD` 和 `validateGuiAuthenticateResult`。
- 私有 primitive 可接收一个绑定了 method、validator 和错误文本来源的对象，但不得暴露 raw `<T>(method: string, params: unknown)` API。
- pending entry 保存同步 settlement closure；匹配时先从 map 删除，再 validate、resolve/reject 和调用 `onSettlement`。
- success 时先 resolve thunk，再同步调用 result settlement，保持当前 Promise handler 晚于 continuation 的语义。
- failure 始终包含 plain `Error`；不得新增公开 error class。
- `settleMissingResult` 与 `settleResult` 分别生成当前 method-specific missing/malformed 文本。
- `invalidate` 标记 session unavailable 并以 unavailable failure 拒绝全部 pending，但不 detach/close。
- `close` 只执行现有 try/catch close，不 detach handler。
- `dispose` 幂等执行 invalidate、handler 置 null、close；重复调用不重复 close。
- socket 四类 handler 只同步转交 raw/lifecycle fact，不 parse、不 validate、不排 microtask。

- [ ] **Step 4: 将 guiHostClient 的 transport 状态迁入 session**

在 `guiHostClient.ts`：

- 删除 `nextRequestId`、`pendingRequests`、`PendingRequest`、`sendRequest`、通用 `request` 实现和直接 handler assignment。
- 保留 `terminalError`、`closed`、generated `validateJSONRPCMessage`、`classifyServerNotification`、status/callback policy。
- 构造 `GuiHostTransportSession`，callbacks 分别调用 facade 的 `startAuthenticationRequest`、`handleMessage`、socket error、socket close 分支。
- app-server command 和 initialize/attach 暂时调用 `transport.request(...)`；authenticate 暂时调用 `transport.authenticate(...)`。
- invalid envelope 的 numeric missing-result 特殊路径调用 `transport.settleMissingResult(parsedMessage.id)`；返回 false 才进入 malformed-envelope terminal path。
- valid numeric result/error 分别调用 `settleResult` / `settleRpcError`；非 numeric success 忽略；非 numeric error 保持 facade terminal `handshake error`。
- protocol error 顺序保持：`emit(error)` → `transport.invalidate(...)` → 当前 commands unavailable → `transport.close(...)`。
- socket error/close 顺序保持：`transport.invalidate(...)` → 当前 commands unavailable → status。
- cleanup 保持：`closed = true` → `transport.invalidate(...)` → 当前 commands unavailable → `transport.dispose(1000, "cleanup")`，无 status。

同步 handshake settlement 使用实际 closure，不用 Promise chain：

```ts
void transport
  .request(descriptor, params, (settlement) => {
    if (settlement.type === "result") {
      onValidatedResult(settlement.response);
      return;
    }
    if (settlement.failure.source === "rpc") {
      failProtocolAndClose(settlement.failure.error.message, "handshake error");
      return;
    }
    if (
      settlement.failure.source === "missingResult" ||
      settlement.failure.source === "malformedResult"
    ) {
      failProtocolAndClose(settlement.failure.error.message, "protocol error");
    }
  })
  .catch(() => undefined);
```

command request不传 terminal settlement callback，继续仅由 Promise reject 表达非终端失败。

- [ ] **Step 5: 运行 GREEN owner test和三套 facade回归**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected: owner test和三个 facade suite全部 PASS；handshake下一 request仍在同一 message调用栈发送。

- [ ] **Step 6: Scoped format write/check并复跑**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts --check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:全部 PASS。

- [ ] **Step 7: Stage、检查并提交**

```bash
git add -- codex-gui/src/features/guiHost/guiHostTransportSession.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached
git diff --cached --numstat
git commit -m 'refactor(gui): add gui host transport session'
```

Expected staged names exactly为上述三个文件；changed lines小于800，非机械复杂逻辑小于500；commit成功。

### Task 3: 抽取 HandshakeController

**Files:**
- Create: `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

- [ ] **Step 1: 创建 RED handshake owner tests**

测试通过 Task 2 的 production transport capability驱动 controller，完整文件使用以下结构：

```ts
import { describe, expect, it, vi } from "vitest";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { GuiHostHandshakeController } from "../guiHostHandshakeController";
import { GuiHostTransportSession } from "../guiHostTransportSession";
import {
  RecordingWebSocket,
  readLatestRpcRequest,
  readRpcMethod,
} from "./guiHostClientTestSupport";

class ThrowingWebSocket extends RecordingWebSocket {
  override send(): void {
    throw new Error("send failed");
  }
}

function setup(socket: RecordingWebSocket = new RecordingWebSocket()) {
  const calls: string[] = [];
  const terminalFailures: { message: string; closeReason: string }[] = [];
  const transport = new GuiHostTransportSession(socket as unknown as WebSocket, {
    onOpen: vi.fn(),
    onMessage: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  });
  const controller = new GuiHostHandshakeController({
    requests: transport,
    token: "secret",
    threadId: attachBaseline.snapshot.thread.id,
    callbacks: {
      onAuthenticated: () => calls.push("milestone:authenticated"),
      onInitialized: () => calls.push("milestone:initialized"),
      onAttached: () => calls.push("milestone:attached"),
      onTerminalFailure: (failure) => terminalFailures.push(failure),
    },
  });
  return { calls, controller, socket, terminalFailures, transport };
}

describe("GuiHostHandshakeController", () => {
  it("advances authenticate, initialize, and attach synchronously", () => {
    const { calls, controller, socket, transport } = setup();
    controller.start();
    const authenticate = readLatestRpcRequest(socket, "gui/authenticate");
    expect(authenticate.params).toEqual({ token: "secret" });

    transport.settleResult(authenticate.id, { authenticated: true });
    calls.push(`request:${readRpcMethod(socket.sent.at(-1) ?? "")}`);
    const initialize = readLatestRpcRequest(socket, "initialize");
    expect(initialize.params).toEqual({
      clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
      capabilities: null,
    });

    transport.settleResult(initialize.id, {
      userAgent: "codex-test",
      codexHome: "/codex-home",
      platformFamily: "test",
      platformOs: "test",
    });
    calls.push(`request:${readRpcMethod(socket.sent.at(-1) ?? "")}`);
    const attach = readLatestRpcRequest(socket, "thread/projection/attach");
    expect(attach.params).toEqual({ threadId: attachBaseline.snapshot.thread.id });
    transport.settleResult(attach.id, attachBaseline);

    expect(calls).toEqual([
      "milestone:authenticated",
      "request:initialize",
      "milestone:initialized",
      "request:thread/projection/attach",
      "milestone:attached",
    ]);
  });

  it("starts once and ignores settlements after stop", () => {
    const { calls, controller, socket, transport } = setup();
    controller.start();
    controller.start();
    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
    const authenticate = readLatestRpcRequest(socket, "gui/authenticate");

    controller.stop();
    transport.settleResult(authenticate.id, { authenticated: true });

    expect(calls).toEqual([]);
    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  });

  it("maps rpc failure to handshake error without an unhandled rejection", async () => {
    const { controller, socket, terminalFailures, transport } = setup();
    controller.start();
    const request = readLatestRpcRequest(socket, "gui/authenticate");

    transport.settleRpcError(request.id, { code: -32000, message: "rejected" });

    expect(terminalFailures).toEqual([
      {
        message: `JSON-RPC error (id=${String(request.id)}, code=-32000): rejected`,
        closeReason: "handshake error",
      },
    ]);
    await Promise.resolve();
  });

  it("maps missing and malformed results to protocol error without unhandled rejections", async () => {
    const missing = setup();
    missing.controller.start();
    const missingRequest = readLatestRpcRequest(missing.socket, "gui/authenticate");
    missing.transport.settleMissingResult(missingRequest.id);
    expect(missing.terminalFailures).toEqual([
      {
        message: "gui/authenticate returned no result payload",
        closeReason: "protocol error",
      },
    ]);

    const malformed = setup();
    malformed.controller.start();
    const malformedRequest = readLatestRpcRequest(malformed.socket, "gui/authenticate");
    malformed.transport.settleResult(malformedRequest.id, {});
    expect(malformed.terminalFailures).toEqual([
      {
        message: "gui/authenticate returned malformed result payload",
        closeReason: "protocol error",
      },
    ]);
    await Promise.resolve();
  });

  it("stops silently on send and unavailable failures without unhandled rejections", async () => {
    const send = setup(new ThrowingWebSocket());
    send.controller.start();
    expect(send.terminalFailures).toEqual([]);

    const unavailable = setup();
    unavailable.transport.invalidate("GUI host WebSocket is not available");
    unavailable.controller.start();
    expect(unavailable.terminalFailures).toEqual([]);
    expect(unavailable.socket.sent).toEqual([]);
    await Promise.resolve();
  });

  it("treats authenticated false as a malformed authenticate result", async () => {
    const { controller, socket, terminalFailures, transport } = setup();
    controller.start();
    const request = readLatestRpcRequest(socket, "gui/authenticate");
    transport.settleResult(request.id, { authenticated: false });

    expect(terminalFailures).toEqual([
      {
        message: "gui/authenticate returned malformed result payload",
        closeReason: "protocol error",
      },
    ]);
    await Promise.resolve();
  });
});
```

- [ ] **Step 2: 运行 RED test**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshakeController.test.ts
```

Expected: FAIL，原因是 `../guiHostHandshakeController` 不存在。

- [ ] **Step 3: 创建同步 HandshakeController**

实现以下稳定接口：

```ts
import {
  AUTHENTICATE_METHOD,
  type GuiAuthenticateResult,
} from "@codex-gui-host-contract";
import { requestDescriptors } from "@/generated/appServerProtocol";
import type { RequestResponse } from "./appServerProtocol";
import type {
  AppServerRequestSender,
  AuthenticateRequestSender,
  TransportRequestFailure,
  TransportRequestSettlement,
} from "./guiHostTransportSession";

export type GuiHostHandshakeCallbacks = {
  onAuthenticated: () => void;
  onInitialized: () => void;
  onAttached: (response: RequestResponse<"thread/projection/attach">) => void;
  onTerminalFailure: (failure: {
    message: string;
    closeReason: "protocol error" | "handshake error";
  }) => void;
};

export class GuiHostHandshakeController {
  constructor(options: {
    requests: AppServerRequestSender & AuthenticateRequestSender;
    token: string;
    threadId: string;
    callbacks: GuiHostHandshakeCallbacks;
  });

  start(): void;
  stop(): void;
}
```

Controller内部必须使用同步 settlement continuation，不能使用 `async`/`await`或 `.then`推进阶段。每次内部调用 `requests.authenticate(...)` 或 `requests.request(...)` 后，都必须立即对返回 Promise 安装 rejection sink；同步 settlement callback仍是唯一 policy和阶段推进入口：

```ts
const requestPromise = this.requests.authenticate(params, (settlement) => {
  this.handleAuthenticateSettlement(settlement);
});
void requestPromise.catch(() => undefined);
```

initialize和attach使用同一模式：先传同步 settlement callback，再执行 `void requestPromise.catch(() => undefined)`。该catch只消除已经由同步 settlement处理的 rejected Promise，不能发 milestone、不能 terminalize、不能发送下一request，也不能替代 settlement callback。exact params：

```ts
{
  clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
  capabilities: null,
}
```

和：

```ts
{ threadId }
```

failure policy使用一个私有同步函数：

```ts
function terminalFailureFor(
  failure: TransportRequestFailure,
): { message: string; closeReason: "protocol error" | "handshake error" } | undefined {
  switch (failure.source) {
    case "rpc":
      return { message: failure.error.message, closeReason: "handshake error" };
    case "missingResult":
    case "malformedResult":
      return { message: failure.error.message, closeReason: "protocol error" };
    case "send":
    case "unavailable":
      return undefined;
    default:
      failure.source satisfies never;
      return undefined;
  }
}
```

authenticate result先由 generated validator通过 transport验证，再由 controller要求 `authenticated === true`；false时使用 `${AUTHENTICATE_METHOD} returned malformed result payload`。

owner tests中的 rpc、missingResult、malformedResult、send、unavailable和authenticate false路径均保持测试函数存活到一个microtask后；Expected为Vitest没有报告unhandled rejection，同时terminal/stop policy仍在调用 `settle*` 或 `start()` 的当前同步栈内完成。

- [ ] **Step 4: 将 facade握手逻辑替换为 controller callbacks**

删除 `startHandshakeRequest`、`startAuthenticationRequest` 和 facade内嵌阶段 continuation。构造 controller：

```ts
const handshake = new GuiHostHandshakeController({
  requests: transport,
  token,
  threadId,
  callbacks: {
    onAuthenticated: () => emit({ label: "authenticated" }),
    onInitialized: () => emit({ label: "initialized" }),
    onAttached: (response) => {
      onProjectionAttached?.(response);
      emit({ label: "attached" });
      commandsReady = true;
      onCommandsReady?.(commands);
    },
    onTerminalFailure: ({ message, closeReason }) => {
      failProtocolAndClose(message, closeReason);
    },
  },
});
```

transport open callback只调用 `handshake.start()`；protocol/socket/close/cleanup invalidation在拒绝 pending前或同一编排中调用 `handshake.stop()`，确保 unavailable rejection不被二次 terminalize。commands仍留在 facade，等 Task 4迁移。

- [ ] **Step 5: 运行 GREEN owner test和 facade回归**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshakeController.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:全部 PASS；现有facade synchronous handshake tests不需要改成async，owner failure tests没有unhandled rejection。

- [ ] **Step 6: Scoped format write/check并复跑**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts --check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:全部 PASS。

- [ ] **Step 7: Stage、检查并提交**

```bash
git add -- codex-gui/src/features/guiHost/guiHostHandshakeController.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached
git diff --cached --numstat
git commit -m 'refactor(gui): add gui host handshake controller'
```

Expected staged names exactly为上述三个文件；changed lines小于800，非机械复杂逻辑小于500；commit成功。

### Task 4: 抽取 CommandGateway并完成 facade编排

**Files:**
- Create: `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- Create: `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- Test regression: `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

- [ ] **Step 1: 创建 RED command owner tests**

测试使用 production transport，完整文件采用以下代码：

```ts
import { describe, expect, it, vi } from "vitest";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandGateway } from "../guiHostCommandGateway";
import { GuiHostTransportSession } from "../guiHostTransportSession";
import {
  RecordingWebSocket,
  readLatestRpcRequest,
  readRpcRequest,
} from "./guiHostClientTestSupport";

class FailOnceWebSocket extends RecordingWebSocket {
  failNextSend = false;

  override send(message: string): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("send failed");
    }
    super.send(message);
  }
}

function setup(socket: RecordingWebSocket = new RecordingWebSocket()) {
  const transport = new GuiHostTransportSession(socket as unknown as WebSocket, {
    onOpen: vi.fn(),
    onMessage: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
  });
  return { gateway: new GuiHostCommandGateway(transport), socket, transport };
}

async function expectInterruptStillWorks(
  state: ReturnType<typeof setup>,
  turnId: string,
): Promise<void> {
  const promise = state.gateway.commands.interruptTurn({
    threadId: "thread-1",
    turnId,
  });
  const request = readLatestRpcRequest(state.socket, "turn/interrupt");
  state.transport.settleResult(request.id, {});
  await expect(promise).resolves.toEqual({});
}

describe("GuiHostCommandGateway", () => {
  it("publishes one stable handle only after activation", async () => {
    const { gateway, socket } = setup();
    const commands = gateway.commands;

    await expect(
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-1" }),
    ).rejects.toThrow("GUI host WebSocket is not available");
    expect(socket.sent).toEqual([]);
    expect(gateway.activate()).toBe(true);
    expect(gateway.activate()).toBe(false);
    expect(gateway.commands).toBe(commands);
  });

  it("maps startTurn and interruptTurn to their generated descriptors", async () => {
    const { gateway, socket, transport } = setup();
    gateway.activate();
    const startParams = {
      threadId: "thread-1",
      clientUserMessageId: null,
      input: [{ type: "text" as const, text: "Hello", text_elements: [] }],
    };
    const startPromise = gateway.commands.startTurn(startParams);
    const startRequest = readLatestRpcRequest(socket, "turn/start");
    expect(startRequest).toEqual({
      jsonrpc: "2.0",
      id: startRequest.id,
      method: "turn/start",
      params: startParams,
    });
    const startResponse = { turn: inProgressTurn("turn-1") };
    transport.settleResult(startRequest.id, startResponse);
    await expect(startPromise).resolves.toEqual(startResponse);

    const interruptParams = { threadId: "thread-1", turnId: "turn-1" };
    const interruptPromise = gateway.commands.interruptTurn(interruptParams);
    const interruptRequest = readLatestRpcRequest(socket, "turn/interrupt");
    expect(interruptRequest).toEqual({
      jsonrpc: "2.0",
      id: interruptRequest.id,
      method: "turn/interrupt",
      params: interruptParams,
    });
    transport.settleResult(interruptRequest.id, {});
    await expect(interruptPromise).resolves.toEqual({});
  });

  it("keeps ready state after a single rpc, missing, malformed, or send failure", async () => {
    const rpc = setup();
    rpc.gateway.activate();
    const rpcPromise = rpc.gateway.commands.interruptTurn({
      threadId: "thread-1",
      turnId: "turn-rpc",
    });
    const rpcRequest = readRpcRequest(rpc.socket.sent[0] ?? "");
    rpc.transport.settleRpcError(rpcRequest.id, { code: -32000, message: "rejected" });
    await expect(rpcPromise).rejects.toThrow("rejected");
    expect(rpc.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(rpc, "turn-after-rpc");

    const missing = setup();
    missing.gateway.activate();
    const missingPromise = missing.gateway.commands.interruptTurn({
      threadId: "thread-1",
      turnId: "turn-missing",
    });
    const missingRequest = readRpcRequest(missing.socket.sent[0] ?? "");
    missing.transport.settleMissingResult(missingRequest.id);
    await expect(missingPromise).rejects.toThrow("returned no result payload");
    expect(missing.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(missing, "turn-after-missing");

    const malformed = setup();
    malformed.gateway.activate();
    const malformedPromise = malformed.gateway.commands.startTurn({
      threadId: "thread-1",
      clientUserMessageId: null,
      input: [],
    });
    const malformedRequest = readRpcRequest(malformed.socket.sent[0] ?? "");
    malformed.transport.settleResult(malformedRequest.id, { turn: null });
    await expect(malformedPromise).rejects.toThrow("returned malformed result payload");
    expect(malformed.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(malformed, "turn-after-malformed");

    const sendSocket = new FailOnceWebSocket();
    const send = setup(sendSocket);
    send.gateway.activate();
    sendSocket.failNextSend = true;
    await expect(
      send.gateway.commands.interruptTurn({ threadId: "thread-1", turnId: "turn-send" }),
    ).rejects.toThrow("send failed");
    expect(send.gateway.activate()).toBe(false);
    await expectInterruptStillWorks(send, "turn-after-send");
  });

  it("permanently invalidates the old stable handle", async () => {
    const { gateway, socket } = setup();
    const commands = gateway.commands;
    expect(gateway.activate()).toBe(true);
    expect(gateway.invalidate()).toBe(true);
    expect(gateway.invalidate()).toBe(false);
    expect(gateway.activate()).toBe(false);

    await expect(
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-after-close" }),
    ).rejects.toThrow("GUI host WebSocket is not available");
    expect(socket.sent).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行 RED test**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
```

Expected: FAIL，原因是 `../guiHostCommandGateway` 不存在。

- [ ] **Step 3: 创建 CommandGateway**

将 `GuiHostCommands` 从 `guiHostClient.ts` 移到 `guiHostCommandGateway.ts` 定义并从该文件导出；`guiHostClient.ts`再 re-export type，保持现有 import兼容：

```ts
import { requestDescriptors } from "@/generated/appServerProtocol";
import type { RequestParams, RequestResponse } from "./appServerProtocol";
import type { AppServerRequestSender } from "./guiHostTransportSession";

export type GuiHostCommands = {
  startTurn: (params: RequestParams<"turn/start">) => Promise<RequestResponse<"turn/start">>;
  interruptTurn: (
    params: RequestParams<"turn/interrupt">,
  ) => Promise<RequestResponse<"turn/interrupt">>;
};

type CommandGatewayState = "inactive" | "ready" | "invalidated";

export class GuiHostCommandGateway {
  readonly commands: GuiHostCommands;
  private state: CommandGatewayState = "inactive";

  constructor(private readonly requests: AppServerRequestSender) {
    this.commands = {
      startTurn: (params) =>
        this.withReadyGateway(() =>
          this.requests.request(requestDescriptors["turn/start"], params),
        ),
      interruptTurn: (params) =>
        this.withReadyGateway(() =>
          this.requests.request(requestDescriptors["turn/interrupt"], params),
        ),
    };
  }

  activate(): boolean {
    if (this.state !== "inactive") {
      return false;
    }
    this.state = "ready";
    return true;
  }

  invalidate(): boolean {
    const wasReady = this.state === "ready";
    this.state = "invalidated";
    return wasReady;
  }

  private withReadyGateway<T>(startRequest: () => Promise<T>): Promise<T> {
    if (this.state !== "ready") {
      return Promise.reject(new Error("GUI host WebSocket is not available"));
    }
    return startRequest();
  }
}
```

gateway不得接收或调用 `onCommandsUnavailable`，不得发 status或close。

- [ ] **Step 4: 用 transition boolean完成 facade精确顺序**

`guiHostClient.ts`同时导入本地类型并保持原导出路径兼容：

```ts
import {
  GuiHostCommandGateway,
  type GuiHostCommands,
} from "./guiHostCommandGateway";

export type { GuiHostCommands } from "./guiHostCommandGateway";
```

内部创建 `const commandGateway = new GuiHostCommandGateway(transport)`，并定义唯一 helper：

```ts
const invalidateCommands = (): void => {
  if (commandGateway.invalidate()) {
    onCommandsUnavailable?.();
  }
};
```

attach success严格编排：

```ts
onProjectionAttached?.(response);
emit({ label: "attached" });
if (commandGateway.activate()) {
  onCommandsReady?.(commandGateway.commands);
}
```

四类终止路径保持：

```text
protocol: emit error -> handshake.stop -> transport.invalidate -> invalidateCommands -> transport.close
socket error: handshake.stop -> transport.invalidate -> invalidateCommands -> emit error
socket close: handshake.stop -> transport.invalidate -> invalidateCommands -> emit closed/error
cleanup: closed=true -> handshake.stop -> transport.invalidate -> invalidateCommands -> transport.dispose -> no status
```

删除 `commandsReady`、inline `commands`和 `withReadyCommands`。不得统一 protocol与socket顺序。

- [ ] **Step 5: 运行 GREEN owner test和 facade回归**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:全部 PASS；特别是 protocol error为 status先于 unavailable，socket error为 unavailable先于status，cleanup无status且 unavailable最多一次。

- [ ] **Step 6: Scoped format write/check并复跑**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts --check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:全部 PASS。

- [ ] **Step 7: Stage、检查并提交**

```bash
git add -- codex-gui/src/features/guiHost/guiHostCommandGateway.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached
git diff --cached --numstat
git commit -m 'refactor(gui): add gui host command gateway'
```

Expected staged names exactly为上述三个文件；changed lines小于800，非机械复杂逻辑小于500；commit成功。

### Task 5: 完整验证、边界搜索与计划内闭环

**Files allowed for fix-only changes:**
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/guiHostTransportSession.ts`
- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`

- [ ] **Step 1: fnm / pnpm version gate**

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
```

Expected: Node满足 `^22.18.0 || >=24.12.0`；pnpm命令成功；`which pnpm`不得位于 `/Users/jiangsheng/.cache/codex-runtimes/`。若不满足，停止且不安装。

本Task的 RED 是后续任一验证命令非零退出；GREEN 是Step 2–7全部通过且无范围外diff。只允许Step 8闭环本次引入的问题。

- [ ] **Step 2: Scoped oxfmt write/check**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --check
```

Expected: check PASS；若 write产生diff，只能在 allowed files中。

- [ ] **Step 3: 运行新增 owner tests和三个 facade suites**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:六个 test文件全部 PASS。

- [ ] **Step 4: 运行 type-check、lint和 validator check**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
```

Expected:三个命令均 exit 0；validator tree无漂移。不得运行 validator write。

- [ ] **Step 5: 运行 frontend CI**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Expected: protocol check、format、lint、type-check和完整 unit tests全部 PASS。不运行build、browser或e2e。若实现引入dynamic import、module resolution改造或其他计划外build-only风险，立即按范围扩大停止，不运行build，也不继续Task 6。

- [ ] **Step 6: Source boundary searches**

```bash
rg -n -e 'terminalOnError' codex-gui/src/features/guiHost
rg -n -e '<T>\(method: string' -e 'method: string, params: unknown' codex-gui/src/features/guiHost
rg -n -e 'isThreadProjection' -e 'result \?\? \{\}' -e 'as RequestResponse' codex-gui/src/features/guiHost
rg -n -e 'id === 1' -e 'id === 2' -e 'id === 3' codex-gui/src/features/guiHost
rg -n -e 'ProtocolRouter' codex-gui/src/features/guiHost
```

Expected:全部无输出。若命中测试文字或无害类型声明，逐项阅读并证明不违反设计；不得用更宽搜索结果替代判断。

- [ ] **Step 7: Diff size和范围审计**

```bash
git status --short
git log --fixed-strings --max-count=1 --grep='test(gui): lock connection lifecycle compatibility' --format='commit %H%nsubject %s' --numstat -- codex-gui/src/features/guiHost
git log --fixed-strings --max-count=1 --grep='refactor(gui): add gui host transport session' --format='commit %H%nsubject %s' --numstat -- codex-gui/src/features/guiHost
git log --fixed-strings --max-count=1 --grep='refactor(gui): add gui host handshake controller' --format='commit %H%nsubject %s' --numstat -- codex-gui/src/features/guiHost
git log --fixed-strings --max-count=1 --grep='refactor(gui): add gui host command gateway' --format='commit %H%nsubject %s' --numstat -- codex-gui/src/features/guiHost
git diff --numstat ':/design connection lifecycle owners$'..HEAD -- codex-gui/src/features/guiHost
git diff --check ':/design connection lifecycle owners$'..HEAD -- codex-gui/src/features/guiHost
```

Expected:

- 四次subject搜索各返回且只返回对应Task 1–4提交及其numstat，不依赖HEAD相对计数。
- 每个提交changed lines小于800；任何包含复杂非机械逻辑的单个提交，其非机械changed lines小于500。
- 从docs提交到HEAD的aggregate只包含计划内production/test文件，diff check无输出。
- aggregate允许超过800，因为本任务包含behavior-preserving owner搬移和新增边界测试；若超过800，必须逐文件把changed lines标为“机械迁移”“测试”或“非机械逻辑”，并证明超出800的部分全部来自前两类，同时非机械逻辑subtotal小于500。
- 任一提交达到800、单个复杂逻辑提交达到500、aggregate超出部分无法证明为机械迁移/测试，或出现范围外文件时，停止并拆分，不进入Task 6。

- [ ] **Step 8: 只闭环本次引入的问题**

若Step 2–7失败，只能先使用现有project auto-fix对allowed TS/test文件做scoped修复；不得手写扩大修改，不得修改generated、package scripts、lockfile或范围外模块。

在`codex-gui`工作目录依次运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --fix
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --fix --cache
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --write
git diff -- src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
git diff --check -- src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

Expected:auto-fix只改变allowed files；diff check无输出。逐行阅读diff，确认没有contract、callback顺序或测试语义漂移。然后运行非fix闭环：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --cache
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/guiHost/guiHostClient.ts src/features/guiHost/guiHostTransportSession.ts src/features/guiHost/guiHostHandshakeController.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts --check
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostTransportSession.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

Expected:nonfix lint、format、type-check、focused tests、validator check和CI全部PASS。随后重新执行Step 6 source searches和Step 7 diff审计，最终状态必须GREEN。

若产生fix diff，回到仓库根目录执行：

```bash
git add -- codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostTransportSession.ts codex-gui/src/features/guiHost/guiHostHandshakeController.ts codex-gui/src/features/guiHost/guiHostCommandGateway.ts codex-gui/src/features/guiHost/__tests__/guiHostTransportSession.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached
git diff --cached --numstat
git commit -m 'fix(gui): close connection lifecycle verification'
```

Expected: staged files均属于allowed list，changed lines小于800，非机械复杂逻辑小于500，commit成功。若没有fix diff，不创建空commit。

### Task 6: 更新B02实施状态

**Files:**
- Modify: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`
- Modify: `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`

- [ ] **Step 1: 收集本地提交和验证事实**

```bash
git log --oneline -7
git status --short
```

Expected:包含本计划的docs、characterization、transport、handshake、command提交，以及可选fix提交；工作树中没有未解释的production/test diff。只记录实际存在的提交，不补写可选fix。

运行文档状态 RED gate：

```bash
rg -n -e 'B02 回退状态' -e '当前实施状态.*B02.*回退' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
```

Expected: 命中当前未完成/回退记录，证明状态尚未更新。

- [ ] **Step 2: 更新00-summary的B02状态**

保持原Finding表、状态统计和历史回退记录不变；只在“实施状态更新”中：

- 将“B02回退状态”改为“B02完成状态”。
- 先保留历史回退事实，再新增2026-07-17重新校准后的结论：固定ID子问题此前已消除，本轮按generated contract边界完成TransportSession、HandshakeController、CommandGateway与兼容facade。
- 在实施状态表新增或替换B02行为：状态“已完成”，日期“2026-07-17”，本地提交列按实际顺序列出以下已存在subject及Step 1读取的真实短SHA：
  - `test(gui): lock connection lifecycle compatibility`
  - `refactor(gui): add gui host transport session`
  - `refactor(gui): add gui host handshake controller`
  - `refactor(gui): add gui host command gateway`
  - 只有实际存在时才列 `fix(gui): close connection lifecycle verification`
- 验证结果准确写为：owner tests与三个facade suites通过；type-check、lint、`protocol:check-validators`、`pnpm run ci`通过；source boundary searches无违规命中；未运行build/browser/e2e/Rust；未操作远程。

- [ ] **Step 3: 更新02报告的RA-02-002当前实施状态**

不重写“审计时结论摘要”、历史证据或Finding ID；只更新“当前实施状态”、测试覆盖状态和报告建议：

- 状态改为“已实施（B02）”。
- 明确当前owner：transport拥有socket/correlation/teardown；handshake拥有同步三阶段和terminal policy；commands拥有stable handle与不可逆invalidation；facade拥有generated inbound routing、status和callback顺序。
- 明确authoritative path仍为generated request descriptors/private authenticate validator/JSON-RPC envelope validator/notification classifier，没有consumer-owned guard或raw generic。
- 记录Step 2相同的实际提交和验证事实。

- [ ] **Step 4: 检查文档diff**

```bash
git diff --check -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git diff -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
```

Expected: check无输出；只更新B02实施进度，不改变稳定Finding统计、B03或其他批次。

运行文档状态 GREEN gate：

```bash
rg -n -e 'B02 完成状态' -e '已实施（B02）' docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
```

Expected: 两个报告均出现B02完成语义。Markdown不运行oxfmt；本Task的格式门禁是`git diff --check`和人工阅读完整diff。

- [ ] **Step 5: Stage、检查并提交**

```bash
git add -- docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md
git diff --cached --name-only
git diff --cached --check
git diff --cached
git commit -m 'docs(gui): record B02 lifecycle owners'
```

Expected staged names exactly为两个报告文件；commit成功。完成本Task后立即终止本轮，不追加复审、测试、实现或提交。
