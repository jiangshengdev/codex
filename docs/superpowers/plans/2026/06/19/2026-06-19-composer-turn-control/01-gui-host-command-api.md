# GUI Host Command API 实施计划

> **给 agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标:** 扩展 `guiHostClient` 支持 handshake 之后的 `turn/start` 和 `turn/interrupt` command API。

**架构:** 保留现有 `startGuiHostConnection` 入口, 在内部引入 request id allocator 和 pending request map。Handshake request error 仍是 terminal host error, command request error 只 reject 对应 Promise, 不关闭 socket。

**技术栈:** TypeScript, WebSocket JSON-RPC, generated `@codex-protocol/v2` types, Vitest。

---

## 文件结构

**修改:**

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`
  - 继续拥有 WebSocket lifecycle、handshake、projection notification parsing。
  - 新增 command handle: `startTurn`, `interruptTurn`。
  - 新增 request id 分配、pending request map、business error reject。

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`
  - 复用 `RecordingWebSocket`。
  - 新增 command request 成功/失败/cleanup 测试。

**不要修改:**

- `/Users/jiangsheng/cnb/codex/codex-rs/app-server-protocol/src/protocol/v2/turn.rs`
- `/Users/jiangsheng/cnb/codex/codex-rs/gui-host/src/filter.rs`

## 接口目标

实施后 `startGuiHostConnection` 应能向 `App` 暴露 command handle:

```ts
import type {
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";

export type GuiHostCommands = {
  startTurn: (params: TurnStartParams) => Promise<TurnStartResponse>;
  interruptTurn: (params: TurnInterruptParams) => Promise<TurnInterruptResponse>;
};

export type StartGuiHostConnectionOptions = {
  // existing fields stay unchanged
  onCommandsReady?: (commands: GuiHostCommands) => void;
  onCommandsUnavailable?: () => void;
};
```

`onCommandsReady` 应在 projection attach 成功、`onProjectionAttached` 已经记录 attach snapshot、并发出
`attached` status 后调用。Cleanup、任何 `socket.close`、socket error 或 terminal protocol error 都应调用
`onCommandsUnavailable` 并 reject pending command requests。

## Task 1: 写 command API 成功路径测试

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: 新增测试 helper**

在 test 文件现有 helper 附近加入:

```ts
type ParsedRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

function readRpcRequest(message: string): ParsedRpcRequest {
  return JSON.parse(message) as ParsedRpcRequest;
}
```

- [ ] **Step 2: 写 `startTurn` 成功测试**

先把 `guiHostClient` import 扩展为:

```ts
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
  type GuiHostCommands,
  type LaunchParams,
} from "./guiHostClient";
```

新增测试:

```ts
it("sends turn/start through the ready command API", async () => {
  const socket = new RecordingWebSocket();
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  const readyCommands: GuiHostCommands[] = [];

  startGuiHostConnection({
    location: new URL(
      `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
    ),
    replaceState: vi.fn(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady: (commands) => {
      readyCommands.push(commands);
    },
  });

  socket.onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachResponse }),
  });

  expect(readyCommands).toHaveLength(1);
  const startPromise = readyCommands[0].startTurn({
    threadId: attachResponse.snapshot.thread.id,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello", text_elements: [] }],
  });

  const request = readRpcRequest(socket.sent.at(-1) ?? "");
  expect(request).toEqual({
    jsonrpc: "2.0",
    id: 4,
    method: "turn/start",
    params: {
      threadId: attachResponse.snapshot.thread.id,
      clientUserMessageId: null,
      input: [{ type: "text", text: "Hello", text_elements: [] }],
    },
  });

  const response = {
    turn: {
      id: "turn-started-by-command",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: 1700000100,
      completedAt: null,
      durationMs: null,
    },
  };
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 4, result: response }),
  });

  await expect(startPromise).resolves.toEqual(response);
});
```

实现前预期: TypeScript 或 runtime 失败, 因为 `GuiHostCommands` / `onCommandsReady` 还不存在。

- [ ] **Step 3: 写 `interruptTurn` 成功测试**

新增测试:

```ts
it("sends turn/interrupt through the ready command API", async () => {
  const socket = new RecordingWebSocket();
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  let commands: GuiHostCommands | null = null;

  startGuiHostConnection({
    location: new URL(
      `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
    ),
    replaceState: vi.fn(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady: (readyCommands) => {
      commands = readyCommands;
    },
  });

  socket.onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }),
  });
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachResponse }),
  });

  if (commands == null) {
    throw new Error("commands were not made ready");
  }

  const interruptPromise = commands.interruptTurn({
    threadId: attachResponse.snapshot.thread.id,
    turnId: "turn-active",
  });

  const request = readRpcRequest(socket.sent.at(-1) ?? "");
  expect(request).toEqual({
    jsonrpc: "2.0",
    id: 4,
    method: "turn/interrupt",
    params: {
      threadId: attachResponse.snapshot.thread.id,
      turnId: "turn-active",
    },
  });

  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 4, result: {} }),
  });

  await expect(interruptPromise).resolves.toEqual({});
});
```

- [ ] **Step 4: 运行测试确认失败**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
```

预期: FAIL, 原因是 command API 类型/实现还不存在。

## Task 2: 实现 request id 和 pending response matching

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`

- [ ] **Step 1: 引入协议类型**

在文件顶部 import 中加入:

```ts
import type {
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
```

- [ ] **Step 2: 扩展 options 和导出 command 类型**

加入:

```ts
export type GuiHostCommands = {
  startTurn: (params: TurnStartParams) => Promise<TurnStartResponse>;
  interruptTurn: (params: TurnInterruptParams) => Promise<TurnInterruptResponse>;
};
```

并扩展 `StartGuiHostConnectionOptions`:

```ts
onCommandsReady?: (commands: GuiHostCommands) => void;
onCommandsUnavailable?: () => void;
```

- [ ] **Step 3: 新增 pending request 类型**

在 `RpcMessage` 附近加入:

```ts
type PendingRequest = {
  method: string;
  terminalOnError: boolean;
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};
```

- [ ] **Step 4: 在 `startGuiHostConnection` 内初始化 id 和 pending map**

在 `let closed = false;` 后加入:

```ts
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();
let commandsReady = false;
```

- [ ] **Step 5: 增加 request helper**

在 `emit` helper 后加入:

```ts
const isSocketClosingOrClosed = (): boolean =>
  typeof socket.readyState === "number" && socket.readyState >= 2;

const request = (
  method: string,
  params: Record<string, unknown>,
  options: { terminalOnError: boolean },
): Promise<Record<string, unknown>> => {
  if (closed || isSocketClosingOrClosed()) {
    return Promise.reject(new Error("GUI host WebSocket is not available"));
  }

  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      method,
      terminalOnError: options.terminalOnError,
      resolve,
      reject,
    });
    sendRequest(socket, id, method, params);
  });
};
```

- [ ] **Step 6: 用 helper 替换固定握手发送**

`socket.onopen` 改为:

```ts
void request("gui/authenticate", { token }, { terminalOnError: true });
```

`authenticated` 分支中改为:

```ts
void request(
  "initialize",
  {
    clientInfo: { name: "codex-gui", version: "0.0.0" },
    capabilities: {},
  },
  { terminalOnError: true },
);
```

`initialized` 分支中改为:

```ts
void request("thread/projection/attach", { threadId }, { terminalOnError: true });
```

保留 id 1/2/3 的行为, 因为 `nextRequestId` 从 1 开始。

- [ ] **Step 7: 在 attach 成功后暴露 commands**

在 `thread/projection/attach` success branch 中, 保持现有 attach result validation, 然后按固定顺序执行:

```ts
onProjectionAttached?.(attachResponse);
emit({
  label: "attached",
  eventCount,
  lastEventType: null,
});
commandsReady = true;
onCommandsReady?.({
  startTurn: async (params) => {
    const result = await request("turn/start", params, { terminalOnError: false });
    return result as TurnStartResponse;
  },
  interruptTurn: async (params) => {
    const result = await request("turn/interrupt", params, { terminalOnError: false });
    return result as TurnInterruptResponse;
  },
});
```

如果现有代码中 `attached` status payload 包含额外字段, 保留那些字段; 只固定顺序为
`onProjectionAttached` -> `emit attached` -> `onCommandsReady`。

不要向 `GuiHostCommands` 添加 `isReady`; App 使用 `commands != null` 加 Redux selectors 判断是否可发送。

- [ ] **Step 8: 处理 response / error matching**

在 `socket.onmessage` parse 成功后、旧 `if (message.error)` 前, 加入:

```ts
if (typeof message.id === "number") {
  const pending = pendingRequests.get(message.id);
  if (pending != null) {
    pendingRequests.delete(message.id);

    if (message.error) {
      const error = new Error(
        `JSON-RPC error (id=${formatRpcId(message.id)}, code=${String(message.error.code)}): ${
          message.error.message ?? ""
        }`.trim(),
      );
      if (pending.terminalOnError) {
        emit({
          label: "error",
          eventCount,
          lastEventType: null,
          message: error.message,
        });
        try {
          socket.close(1000, "handshake error");
        } catch {
          // Ignore close races; the status above is already terminal.
        }
      }
      pending.reject(error);
      return;
    }

    pending.resolve(message.result ?? {});
  }
}
```

然后保留现有按 id 分支的 handshake 逻辑, 让它们继续校验 result shape 并推进 status。

- [ ] **Step 9: reject pending requests on terminal cleanup**

在 `startGuiHostConnection` 中加入 helper:

```ts
const rejectPendingRequests = (reason: string): void => {
  for (const pending of pendingRequests.values()) {
    pending.reject(new Error(reason));
  }
  pendingRequests.clear();
  if (commandsReady) {
    commandsReady = false;
    onCommandsUnavailable?.();
  }
};
```

Call it in `socket.onerror`, every `socket.onclose` path including code `1000`, malformed message close path, and
returned cleanup before closing:

```ts
rejectPendingRequests("GUI host WebSocket is not available");
```

- [ ] **Step 10: 运行成功路径测试**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
```

预期: command success tests PASS。若现有测试因为旧 generic `message.error` 分支重复处理 error 而失败, 确保 matched pending error 在 legacy branch 前 return。

## Task 3: 覆盖 business error 和 cleanup

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`
- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`

- [ ] **Step 1: 写 business error 测试**

新增测试:

```ts
it("rejects command JSON-RPC errors without closing the socket", async () => {
  const socket = new RecordingWebSocket();
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  let commands: GuiHostCommands | null = null;
  const statuses: string[] = [];

  startGuiHostConnection({
    location: new URL(
      `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
    ),
    replaceState: vi.fn(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onStatus: (status) => statuses.push(status.label),
    onCommandsReady: (readyCommands) => {
      commands = readyCommands;
    },
  });

  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }) });
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }) });
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachResponse }) });

  if (commands == null) {
    throw new Error("commands were not made ready");
  }

  const promise = commands.startTurn({
    threadId: attachResponse.snapshot.thread.id,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello", text_elements: [] }],
  });

  socket.onmessage?.({
    data: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      error: { code: -32000, message: "active turn already running" },
    }),
  });

  await expect(promise).rejects.toThrow("active turn already running");
  expect(socket.closed).toEqual([]);
  expect(statuses.at(-1)).toBe("attached");
});
```

- [ ] **Step 2: 写 cleanup reject 测试**

新增测试:

```ts
it("rejects pending command requests during cleanup", async () => {
  const socket = new RecordingWebSocket();
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  let commands: GuiHostCommands | null = null;

  const cleanup = startGuiHostConnection({
    location: new URL(
      `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
    ),
    replaceState: vi.fn(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady: (readyCommands) => {
      commands = readyCommands;
    },
  });

  socket.onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { authenticated: true } }) });
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }) });
  socket.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachResponse }) });

  if (commands == null) {
    throw new Error("commands were not made ready");
  }

  const promise = commands.interruptTurn({
    threadId: attachResponse.snapshot.thread.id,
    turnId: "turn-active",
  });

  cleanup();

  await expect(promise).rejects.toThrow("GUI host WebSocket is not available");
});
```

- [ ] **Step 3: 实现缺失 cleanup 行为**

如果测试因为 cleanup 没有 reject 而失败, 在返回的 cleanup 中、`socket.close(...)` 之前加入 `rejectPendingRequests(...)`。

- [ ] **Step 4: 运行 guiHostClient 测试**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/features/guiHost/guiHostClient.test.ts
```

预期: PASS。

## Task 4: 局部验证与提交

- [ ] **Step 1: 运行 lint/type-check**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
pnpm run type-check
```

预期: 两个命令 exit 0。

- [ ] **Step 2: 提交**

运行:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/guiHostClient.test.ts
git commit -m "feat(gui): add host turn command api"
```
