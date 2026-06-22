# Test Support Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract test-only builders and support objects from the largest `codex-gui` unit tests without changing production behavior or test semantics.

**Architecture:** Keep test cases, fixture imports, and assertions in their existing test files. Move reusable builders and mock support objects into same-feature `__tests__` helper files so production feature directories stay clean and each refactor slice can be verified independently.

**Tech Stack:** TypeScript, Vitest, generated `@codex-protocol/v2` types, pnpm.

---

## Source Design

Implement only this confirmed design:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/02-test-support-design.md
```

Use the overall constraints from:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/00-overall-design.md
```

Do not edit either design while executing this plan. If implementation exposes a design mismatch, stop and report the mismatch before changing design, tests, or source scope.

## Scope

This plan creates:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`

This plan modifies:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`

This plan does not modify:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
- `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
- Any production source, UI component, fixture JSON, protocol file, lockfile, or dependency file

This plan does not stage or commit implementation changes unless the user explicitly asks during execution.

## File Structure

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`
  - Owns test-only transcript input, item, turn, attach, and projection event builders.
  - Imports only generated protocol types.
  - Does not import fixture JSON.
  - Accepts typed fixture objects as parameters for event builders.

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Imports builders from `./transcriptStateTestBuilders`.
  - Keeps fixture JSON imports and typed fixture constants.
  - Keeps all test names, assertions, and reducer flows unchanged.

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
  - Owns test-only storage mocks, WebSocket recorder, JSON-RPC request reader, and ready-connection harness.
  - Imports `vi` from Vitest and generated protocol types needed by the harness.
  - Imports `startGuiHostConnection` and `GuiHostCommands` from `../guiHostClient`.
  - Does not import fixture JSON.
  - Accepts typed fixture objects as parameters for harness helpers.

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`
  - Imports support objects from `./__tests__/guiHostClientTestSupport`.
  - Keeps fixture JSON imports and all test cases.
  - Keeps inline flow assertions in each test.

## Behavior Contract

The refactor must preserve:

- Test count.
- Test names.
- Fixture JSON imports and typed fixture constants.
- Assertion payloads.
- Transcript object shapes.
- JSON-RPC request ids, methods, and params.
- WebSocket close assertions.
- Existing command readiness and cleanup semantics.

---

### Task 1: Extract Transcript State Test Builders

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Run the target transcript reducer test before editing**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: tests pass before refactor. If this fails before edits, stop and report the pre-existing failure.

- [ ] **Step 2: Create `transcriptStateTestBuilders.ts`**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts` with this content:

```ts
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

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

- [ ] **Step 3: Update transcript test imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`, remove `ThreadItem`, `Turn`, and `UserInput` from the `@codex-protocol/v2` type import so it becomes:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Add this import below the selector import block:

```ts
import {
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
} from "./transcriptStateTestBuilders";
```

- [ ] **Step 4: Remove local transcript builders**

From `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`, remove these local declarations:

```ts
const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
});

const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

const agentMessage = (id: string, text: string): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase: "final_answer",
  memoryCitation: null,
});

const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
});

const sleepItem = (id: string): ThreadItem => ({
  type: "sleep",
  id,
  durationMs: 1000,
});

const baseTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  id,
  items,
  itemsView: "full",
  status: "completed",
  error: null,
  startedAt: 1700000001,
  completedAt: 1700000005,
  durationMs: 4000,
});

const attachWithTurns = (turns: Turn[]): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

const itemCompleted = (
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

const itemStarted = (
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

const turnStarted = (commitId: string, turn: Turn): ThreadProjectionEventNotification => {
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

const turnCompleted = (commitId: string, turn: Turn): ThreadProjectionEventNotification => {
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

- [ ] **Step 5: Pass fixtures into transcript event builders**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`, update helper call sites as follows:

```ts
attachWithTurns([...])
```

becomes:

```ts
attachWithTurns(attachBaseline, [...])
```

```ts
itemCompleted("commit-id", "turn-id", item)
```

becomes:

```ts
itemCompleted(eventItemCompleted, "commit-id", "turn-id", item)
```

```ts
itemStarted("commit-id", "turn-id", item)
```

becomes:

```ts
itemStarted(eventItemStarted, "commit-id", "turn-id", item)
```

```ts
turnStarted("commit-id", turn)
```

becomes:

```ts
turnStarted(eventTurnStarted, "commit-id", turn)
```

```ts
turnCompleted("commit-id", turn)
```

becomes:

```ts
turnCompleted(eventTurnCompleted, "commit-id", turn)
```

- [ ] **Step 6: Run the transcript reducer test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS. If it fails, fix only the helper extraction or call-site wiring; do not change assertions or production code.

### Task 2: Extract Gui Host Client Test Support

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: Run the target gui host client test before editing**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected: tests pass before refactor. If this fails before edits, stop and report the pre-existing failure.

- [ ] **Step 2: Create the guiHost `__tests__` directory**

Create this directory if it does not already exist:

```text
/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__
```

Expected: the directory exists and contains only test support files for the guiHost feature.

- [ ] **Step 3: Create `guiHostClientTestSupport.ts`**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts` with this content:

```ts
import { expect, vi } from "vitest";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import {
  startGuiHostConnection,
  type GuiHostCommands,
} from "../guiHostClient";

export class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}

type SocketCloseEvent = {
  code: number;
  reason: string;
};

export type ParsedRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

export function readRpcRequest(message: string): ParsedRpcRequest {
  return JSON.parse(message) as ParsedRpcRequest;
}

export class RecordingWebSocket {
  sent: string[] = [];
  closed: { code: number | undefined; reason: string | undefined }[] = [];
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }
}

export function startConnectionUntilCommandsReady({
  attachResponse,
  onCommandsUnavailable,
  onStatus,
}: {
  attachResponse: ThreadProjectionAttachResponse;
  onCommandsUnavailable?: () => void;
  onStatus?: Parameters<typeof startGuiHostConnection>[0]["onStatus"];
}): {
  attachResponse: ThreadProjectionAttachResponse;
  cleanup: () => void;
  commands: GuiHostCommands;
  socket: RecordingWebSocket;
  threadId: string;
} {
  const socket = new RecordingWebSocket();
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const threadId = attachResponse.snapshot.thread.id;

  const cleanup = startGuiHostConnection({
    location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
    replaceState: vi.fn<History["replaceState"]>(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
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

  expect(commandsReady).toHaveBeenCalledTimes(1);
  const commands = commandsReady.mock.calls[0]?.[0];
  if (!commands) {
    throw new Error("Expected commands to be ready");
  }

  return { attachResponse, cleanup, commands, socket, threadId };
}
```

- [ ] **Step 4: Update guiHost test imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`, keep the existing Vitest import:

```ts
import { describe, expect, it, vi } from "vitest";
```

Remove `GuiHostCommands` from the `./guiHostClient` import so it becomes:

```ts
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
  type LaunchParams,
} from "./guiHostClient";
```

Add this support import:

```ts
import {
  MemoryStorage,
  RecordingWebSocket,
  ThrowingSetItemStorage,
  readRpcRequest,
  startConnectionUntilCommandsReady,
} from "./__tests__/guiHostClientTestSupport";
```

- [ ] **Step 5: Pass attach fixture into ready-connection helper**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`, update every `startConnectionUntilCommandsReady(...)` call to pass the existing typed fixture constant.

For calls with no arguments:

```ts
startConnectionUntilCommandsReady()
```

use:

```ts
startConnectionUntilCommandsReady({ attachResponse: attachBaseline })
```

For calls with options:

```ts
startConnectionUntilCommandsReady({
  onCommandsUnavailable: commandsUnavailable,
})
```

use:

```ts
startConnectionUntilCommandsReady({
  attachResponse: attachBaseline,
  onCommandsUnavailable: commandsUnavailable,
})
```

For calls with status capture:

```ts
startConnectionUntilCommandsReady({
  onStatus,
})
```

use:

```ts
startConnectionUntilCommandsReady({
  attachResponse: attachBaseline,
  onStatus,
})
```

- [ ] **Step 6: Remove local guiHost support declarations**

From `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`, remove these local declarations:

```ts
class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}

type SocketCloseEvent = {
  code: number;
  reason: string;
};

type ParsedRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

function readRpcRequest(message: string): ParsedRpcRequest {
  return JSON.parse(message) as ParsedRpcRequest;
}

class RecordingWebSocket {
  sent: string[] = [];
  closed: { code: number | undefined; reason: string | undefined }[] = [];
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: ((event: SocketCloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }
}

function startConnectionUntilCommandsReady({
  onCommandsUnavailable,
  onStatus,
}: {
  onCommandsUnavailable?: () => void;
  onStatus?: Parameters<typeof startGuiHostConnection>[0]["onStatus"];
} = {}): {
  attachResponse: ThreadProjectionAttachResponse;
  cleanup: () => void;
  commands: GuiHostCommands;
  socket: RecordingWebSocket;
  threadId: string;
} {
  const socket = new RecordingWebSocket();
  const commandsReady = vi.fn<(commands: GuiHostCommands) => void>();
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  const threadId = attachResponse.snapshot.thread.id;

  const cleanup = startGuiHostConnection({
    location: new URL(`http://127.0.0.1:4567/?threadId=${threadId}#token=secret`),
    replaceState: vi.fn<History["replaceState"]>(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onCommandsReady: commandsReady,
    onCommandsUnavailable,
    onStatus,
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

  expect(commandsReady).toHaveBeenCalledTimes(1);
  const commands = commandsReady.mock.calls[0]?.[0];
  if (!commands) {
    throw new Error("Expected commands to be ready");
  }

  return { attachResponse, cleanup, commands, socket, threadId };
}
```

- [ ] **Step 7: Run the guiHost client test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected: PASS. If it fails, fix only helper import/export wiring or type-only imports; do not change test assertions or production code.

### Task 3: Stage Verification

**Files:**
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: Run type-check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS. If it fails, fix only type import/export issues caused by the helper extraction.

- [ ] **Step 2: Review changed files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateTestBuilders.ts codex-gui/src/features/guiHost/guiHostClient.test.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts
```

Expected: diff shows helper extraction only. There should be no production source changes, fixture JSON changes, assertion changes, or test name changes.

- [ ] **Step 3: Stop for review**

Report:

```text
02 test support refactor complete.
Verified:
- transcriptStateSlice.test.ts
- guiHostClient.test.ts
- pnpm run type-check
No production source files changed.
```

Do not stage or commit implementation changes unless the user explicitly asks.
