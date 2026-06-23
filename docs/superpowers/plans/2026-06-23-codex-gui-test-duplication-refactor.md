# codex-gui Test Duplication Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛 `codex-gui/src` 中由 `jscpd` 识别出的测试重复代码，只修改测试和测试支撑文件，不改变生产行为。

**Architecture:** 采用薄 helper，而不是高层 DSL。跨 feature 的 projection/test payload builders 放到 `features/projection/__tests__/projectionTestBuilders.ts`；GUI host 和 App browser 的重复 setup 保留在各自测试支撑文件中；测试断言对象和关键事件顺序保持显式。

**Tech Stack:** TypeScript、React、Vitest、Vitest Browser Mode、jscpd、pnpm。

---

## 文件结构

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - 负责跨 feature 的 projection/test payload builders。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`
  - 改为 re-export 新 builders，避免一次迁移打断现有导入。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - 删除本地重复 builders，导入共享 builders。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
  - 复用 `attachWithTurns`、`runtimeFromAttach`、payload builders。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - 复用 `attachWithTurns`。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
  - 复用 `runtimeFromAttach` 和 payload builders。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
  - 复用 `runtimeFromAttach`。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
  - 增加 WebSocket / JSON-RPC 薄 helper。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
  - 替换非核心握手顺序测试中的重复 setup。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - 增加 App host harness helper，并复用 projection builders。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
  - 替换重复 host options、attach/status/commands ready 操作。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - 复用 command mock，增加局部 composer 状态断言 helper。

---

### Task 1: 迁移 projection/test builders

**Files:**

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`

- [ ] **Step 1: 创建共享 builder 文件**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts` 写入：

```ts
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";
import type { ThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";

export const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

export const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
});

export const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

export const agentMessage = (id: string, text: string): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase: "final_answer",
  memoryCitation: null,
});

export const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
});

export const sleepItem = (id: string): ThreadItem => ({
  type: "sleep",
  id,
  durationMs: 1000,
});

export const baseTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  id,
  items,
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

export const attachWithTurns = (
  attachBaseline: ThreadProjectionAttachResponse,
  turns: Turn[],
): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

export const runtimeFromAttach = (
  attach: ThreadProjectionAttachResponse,
): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = attach.snapshot.thread;

  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    eventBuffer: [],
    activeTurnId:
      snapshotTurns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null,
    subscription: { state: "active" },
  };
};

export const itemCompleted = (
  eventItemCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemCompleted.event.type !== "itemCompleted") {
    throw new Error("fixture must contain an itemCompleted projection event");
  }

  return {
    ...eventItemCompleted,
    commitId,
    event: {
      ...eventItemCompleted.event,
      notification: {
        ...eventItemCompleted.event.notification,
        turnId,
        item,
      },
    },
  };
};

export const itemStarted = (
  eventItemStarted: ThreadProjectionEventNotification,
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemStarted.event.type !== "itemStarted") {
    throw new Error("fixture must contain an itemStarted projection event");
  }

  return {
    ...eventItemStarted,
    commitId,
    event: {
      ...eventItemStarted.event,
      notification: {
        ...eventItemStarted.event.notification,
        turnId,
        item,
      },
    },
  };
};

export const turnStarted = (
  eventTurnStarted: ThreadProjectionEventNotification,
  commitId: string,
  turn: Turn,
): ThreadProjectionEventNotification => {
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  return {
    ...eventTurnStarted,
    commitId,
    event: {
      ...eventTurnStarted.event,
      notification: {
        ...eventTurnStarted.event.notification,
        turn,
      },
    },
  };
};

export const turnCompleted = (
  eventTurnCompleted: ThreadProjectionEventNotification,
  commitId: string,
  turn: Turn,
): ThreadProjectionEventNotification => {
  if (eventTurnCompleted.event.type !== "turnCompleted") {
    throw new Error("fixture must contain a turnCompleted projection event");
  }

  return {
    ...eventTurnCompleted,
    commitId,
    event: {
      ...eventTurnCompleted.event,
      notification: {
        ...eventTurnCompleted.event.notification,
        turn,
      },
    },
  };
};
```

- [ ] **Step 2: 保持旧 transcript builder 导入兼容**

将 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts` 内容替换为：

```ts
export {
  agentMessage,
  attachWithTurns,
  baseTurn,
  imageInput,
  itemCompleted,
  itemStarted,
  planItem,
  sleepItem,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 3: 更新 committed transcript browser test**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx` 中删除本地 `textInput`、`userMessage`、`agentMessage`、`baseTurn`、`attachWithTurns`、`itemStarted`、`itemCompleted`、`turnStarted` 定义，改为导入：

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

将调用从：

```ts
attachWithTurns([
  baseTurn("turn-surface", [
    userMessage("user-surface", [textInput("Hello "), textInput("surface")]),
    agentMessage("agent-surface", "Committed response"),
  ]),
])
```

改为：

```ts
attachWithTurns(attachBaseline, [
  baseTurn("turn-surface", [
    userMessage("user-surface", [textInput("Hello "), textInput("surface")]),
    agentMessage("agent-surface", "Committed response"),
  ]),
])
```

将 event builder 调用从：

```ts
turnStarted("commit-turn-live", turn)
itemStarted("commit-started", "turn-live", item)
itemCompleted("commit-completed", "turn-live", item)
```

改为：

```ts
turnStarted(eventTurnStarted, "commit-turn-live", turn)
itemStarted(eventItemStarted, "commit-started", "turn-live", item)
itemCompleted(eventItemCompleted, "commit-completed", "turn-live", item)
```

- [ ] **Step 4: 更新 snapshot/live/runtime/model tests 的导入**

在下列文件中删除本地重复 `attachWithTurns` 或 `runtimeFromAttach`，按需从共享 builder 导入：

```ts
import {
  attachWithTurns,
  runtimeFromAttach,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

涉及文件：

```text
/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/Users/jiangsheng/cnb/codex/codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

保留每个测试里的完整 expected object；只替换构造数据的重复代码。

- [ ] **Step 5: 运行相关 unit tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- \
  src/features/transcriptState/__tests__/transcriptStateSlice.test.ts \
  src/features/snapshotReplay/__tests__/snapshotReplay.test.ts \
  src/features/liveEventHandling/__tests__/liveEventHandling.test.ts \
  src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

Expected:

```text
Test Files ... passed
Tests ... passed
```

- [ ] **Step 6: 检查本切片 diff**

Run:

```sh
git -C /Users/jiangsheng/cnb/codex diff -- \
  codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts \
  codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts \
  codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx \
  codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts \
  codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts \
  codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts \
  codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

Expected:

```text
Only test/test-support builder movement and imports changed; production files are absent from the diff.
```

---

### Task 2: 收敛 GUI host client 测试握手

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`

- [ ] **Step 1: 增加 JSON-RPC 薄 helper**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts` 中追加导出：

```ts
import type { StartGuiHostConnectionOptions } from "../guiHostClient";
```

如果已有 import 需要合并，保持单个 `../guiHostClient` import。

新增类型和 helper：

```ts
type StatusSummary = {
  label: string;
  message?: string;
};

export function recordStatusLabels(): {
  labels: string[];
  onStatus: NonNullable<StartGuiHostConnectionOptions["onStatus"]>;
} {
  const labels: string[] = [];

  return {
    labels,
    onStatus: (status) => {
      labels.push(status.label);
    },
  };
}

export function recordStatusSummaries(): {
  summaries: StatusSummary[];
  onStatus: NonNullable<StartGuiHostConnectionOptions["onStatus"]>;
} {
  const summaries: StatusSummary[] = [];

  return {
    summaries,
    onStatus: (status) => {
      summaries.push({
        label: status.label,
        message: "message" in status ? status.message : undefined,
      });
    },
  };
}

export function sendJsonRpcResult(
  socket: RecordingWebSocket,
  id: number,
  result: Record<string, unknown>,
): void {
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id, result }),
  });
}

export function sendJsonRpcError(
  socket: RecordingWebSocket,
  id: number,
  error: { code: number; message: string },
): void {
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id, error }),
  });
}

export function sendAuthenticateResult(socket: RecordingWebSocket): void {
  sendJsonRpcResult(socket, 1, { authenticated: true });
}

export function sendInitializeResult(socket: RecordingWebSocket): void {
  sendJsonRpcResult(socket, 2, {});
}

export function sendAttachResult(
  socket: RecordingWebSocket,
  attachResponse: ThreadProjectionAttachResponse,
): void {
  socket.onmessage?.({
    data: JSON.stringify({ jsonrpc: "2.0", id: 3, result: attachResponse }),
  });
}

export function startGuiHostConnectionWithSocket({
  attachResponse,
  onCommandsReady,
  onCommandsUnavailable,
  onProjectionAttached,
  onProjectionClosed,
  onProjectionEvent,
  onStatus,
}: {
  attachResponse: ThreadProjectionAttachResponse;
  onCommandsReady?: StartGuiHostConnectionOptions["onCommandsReady"];
  onCommandsUnavailable?: StartGuiHostConnectionOptions["onCommandsUnavailable"];
  onProjectionAttached?: StartGuiHostConnectionOptions["onProjectionAttached"];
  onProjectionClosed?: StartGuiHostConnectionOptions["onProjectionClosed"];
  onProjectionEvent?: StartGuiHostConnectionOptions["onProjectionEvent"];
  onStatus?: StartGuiHostConnectionOptions["onStatus"];
}): {
  cleanup: () => void;
  socket: RecordingWebSocket;
  threadId: string;
} {
  const socket = new RecordingWebSocket();
  const threadId = attachResponse.snapshot.thread.id;

  const cleanup = startGuiHostConnection({
    location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
    replaceState: vi.fn<History["replaceState"]>(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady,
    onCommandsUnavailable,
    onProjectionAttached,
    onProjectionClosed,
    onProjectionEvent,
    onStatus,
  });

  return { cleanup, socket, threadId };
}
```

- [ ] **Step 2: 复用 helper 更新 `startConnectionUntilCommandsReady`**

将 `startConnectionUntilCommandsReady` 内部的重复启动和握手逻辑改为：

```ts
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const { cleanup, socket, threadId } = startGuiHostConnectionWithSocket({
    attachResponse,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
  });

  socket.onopen?.();
  sendAuthenticateResult(socket);
  sendInitializeResult(socket);
  sendAttachResult(socket, attachResponse);
```

保留后续 `expect(commandsReady).toHaveBeenCalledTimes(1)` 和返回值。

- [ ] **Step 3: 更新 `guiHostClient.test.ts` 的非核心重复 setup**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts` 中从 support 导入新增 helper：

```ts
  recordStatusLabels,
  recordStatusSummaries,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcError,
  startGuiHostConnectionWithSocket,
```

保留第一个测试 `"sends authenticate, initialize, attach, and forwards projection payloads"` 的显式步骤，不替换该测试中的 `socket.onmessage` 序列。

对命令 API 和错误路径测试，使用：

```ts
const { socket, threadId } = startGuiHostConnectionWithSocket({
  attachResponse,
  onCommandsReady: commandsReady,
  onStatus,
});

socket.onopen?.();
sendAuthenticateResult(socket);
sendInitializeResult(socket);
sendAttachResult(socket, attachResponse);
```

对 initialize/attach JSON-RPC error 测试，使用：

```ts
sendJsonRpcError(socket, 2, { code: -32601, message: "method not found" });
```

对 status 数组，使用：

```ts
const { labels: statuses, onStatus } = recordStatusLabels();
```

或：

```ts
const { summaries: statuses, onStatus } = recordStatusSummaries();
```

- [ ] **Step 4: 运行 GUI host client unit test**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostClient.test.ts
```

Expected:

```text
Test Files 1 passed
Tests ... passed
```

- [ ] **Step 5: 检查本切片 diff**

Run:

```sh
git -C /Users/jiangsheng/cnb/codex diff -- \
  codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts \
  codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts
```

Expected:

```text
The first handshake-order test remains explicit; repeated setup in later tests is replaced by thin helpers.
```

---

### Task 3: 收敛 App browser harness

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: 复用 projection builders 和重命名 command mock**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts` 中删除本地 `textInput`、`userMessage`、`agentMessage`，导入：

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

将 `createCommands` 改名为 `createGuiHostCommands`：

```ts
export const createGuiHostCommands = (): GuiHostCommands => ({
  startTurn: vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: {
      id: "turn-started-from-app",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: 1700000100,
      completedAt: null,
      durationMs: null,
    },
  }),
  interruptTurn: vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({}),
});
```

为兼容现有导入，暂时保留别名：

```ts
export const createCommands = createGuiHostCommands;
```

- [ ] **Step 2: 简化 committed attach helper**

将 `attachWithCommittedMessages` 改为复用 builders：

```ts
export const attachWithCommittedMessages = (): ThreadProjectionAttachResponse =>
  attachWithTurns(attachResponse, [
    baseTurn("turn-app-surface", [
      userMessage("user-app-surface", [textInput("Hello from App")]),
      agentMessage("agent-app-surface", "Committed App response"),
    ]),
  ]);
```

- [ ] **Step 3: 增加 App host 薄 helper**

在 `appBrowserTestSupport.ts` 中追加：

```ts
export const getHostOptions = (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
): StartGuiHostConnectionOptions => {
  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  if (options == null) {
    throw new Error("Expected GUI host connection to start");
  }

  return options;
};

export const attachProjection = (
  options: StartGuiHostConnectionOptions,
  response: ThreadProjectionAttachResponse = attachResponse,
): void => {
  options.onProjectionAttached?.(response);
};

export const markHostAttached = (options: StartGuiHostConnectionOptions): void => {
  options.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
};

export const markCommandsReady = (
  options: StartGuiHostConnectionOptions,
  commands: GuiHostCommands = createGuiHostCommands(),
): GuiHostCommands => {
  options.onCommandsReady?.(commands);
  return commands;
};

export const emitProjectionEvent = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionEvent"]>>[0],
): void => {
  options.onProjectionEvent?.(notification);
};

export const emitProjectionClosed = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionClosed"]>>[0],
): void => {
  options.onProjectionClosed?.(notification);
};
```

- [ ] **Step 4: 更新 App browser test 导入和重复操作**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx` 中将 `createCommands` 导入改为 `createGuiHostCommands`，并导入新增 helper：

```ts
  attachProjection,
  createGuiHostCommands,
  emitProjectionClosed,
  emitProjectionEvent,
  getHostOptions,
  markCommandsReady,
  markHostAttached,
```

将重复代码：

```ts
const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
options?.onProjectionAttached?.(attachResponse);
options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
options?.onCommandsReady?.(commandHandle);
```

替换为：

```ts
const options = getHostOptions(startGuiHostConnectionMock);
attachProjection(options);
markHostAttached(options);
markCommandsReady(options, commandHandle);
```

将 projection event 调用：

```ts
options?.onProjectionEvent?.(notification);
```

替换为：

```ts
emitProjectionEvent(options, notification);
```

将 projection closed 调用：

```ts
options?.onProjectionClosed?.(notification);
```

替换为：

```ts
emitProjectionClosed(options, notification);
```

- [ ] **Step 5: 运行 App browser test**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected:

```text
Test Files 1 passed
Tests ... passed
```

- [ ] **Step 6: 检查本切片 diff**

Run:

```sh
git -C /Users/jiangsheng/cnb/codex diff -- \
  codex-gui/src/__tests__/appBrowserTestSupport.ts \
  codex-gui/src/__tests__/App.browser.test.tsx
```

Expected:

```text
App tests still show attach/status/commands/event order; direct mock.calls access is centralized.
```

---

### Task 4: 收敛 composer command mock 和状态断言

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`

- [ ] **Step 1: 在 composer browser test 复用 command mock**

在 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` 中删除本地 `commands()` helper，导入：

```ts
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
```

将调用：

```ts
const commandHandle = commands();
```

替换为：

```ts
const commandHandle = createGuiHostCommands();
```

需要自定义 reject 的测试继续直接改 mock：

```ts
vi.mocked(commandHandle.startTurn).mockRejectedValueOnce(new Error("network failed"));
vi.mocked(commandHandle.interruptTurn).mockRejectedValueOnce(new Error("interrupt failed"));
```

- [ ] **Step 2: 增加局部 disabled 状态断言 helper**

在 `ComposerTurnControl.browser.test.tsx` 的测试 helper 区域增加：

```ts
const expectComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
};
```

将重复的三行 disabled 断言替换为：

```ts
await expectComposerDisabled(screen);
```

不要把这个 helper 移到全局；它只服务 composer browser test。

- [ ] **Step 3: 更新 App browser test 中 command mock 名称**

如果 Task 3 保留了 `createCommands` 兼容导出，本步骤只把 `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx` 中的导入和调用改成 `createGuiHostCommands`。

示例：

```ts
const commandHandle = createGuiHostCommands();
```

- [ ] **Step 4: 运行 composer browser test**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected:

```text
Test Files 1 passed
Tests ... passed
```

- [ ] **Step 5: 运行 App browser test**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected:

```text
Test Files 1 passed
Tests ... passed
```

---

### Task 5: 最终验证和重复率复测

**Files:**

- Read: `/Users/jiangsheng/cnb/codex/codex-gui/src`
- Read: `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-23-codex-gui-test-duplication-refactor-design.md`

- [ ] **Step 1: 运行格式化检查**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
```

Expected:

```text
All matched files use Prettier code style!
```

- [ ] **Step 2: 运行 lint**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
```

Expected:

```text
No lint errors.
```

- [ ] **Step 3: 运行 type-check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected:

```text
TypeScript exits successfully with code 0.
```

- [ ] **Step 4: 运行 unit tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit
```

Expected:

```text
Test Files ... passed
Tests ... passed
```

- [ ] **Step 5: 运行受影响 browser tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- \
  src/__tests__/App.browser.test.tsx \
  src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx \
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

Expected:

```text
Test Files 3 passed
Tests ... passed
```

- [ ] **Step 6: 复跑 jscpd**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
jscpd /Users/jiangsheng/cnb/codex/codex-gui/src \
  --reporters console \
  --min-lines 6 \
  --min-tokens 60 \
  --ignore "**/*.po,**/*.json,**/.DS_Store"
```

Expected:

```text
Found fewer than 29 clones.
Duplicated lines is lower than 353.
```

目标区间：

```text
10-15 clones, or a clearly explained reason for any remaining high-value explicit test duplication.
```

- [ ] **Step 7: 确认没有生产代码 diff**

Run:

```sh
git -C /Users/jiangsheng/cnb/codex diff --name-only
```

Expected output contains only:

```text
codex-gui/src/**/__tests__/**
codex-gui/src/__tests__/**
docs/superpowers/specs/2026-06-23-codex-gui-test-duplication-refactor-design.md
docs/superpowers/plans/2026-06-23-codex-gui-test-duplication-refactor.md
```

If a production file appears, stop and review whether it violates the design scope before continuing.
