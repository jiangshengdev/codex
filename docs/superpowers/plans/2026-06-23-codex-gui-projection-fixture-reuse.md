# Codex Gui Projection Fixture Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收敛 `codex-gui` 前端测试中仍手写的合法 projection/turn 测试数据，让它们从现有 typed fixtures 和 test builders 派生。

**Architecture:** 保持 `codex-gui/src/features/projection/__tests__/projectionFixtures.ts` 作为 Rust-generated JSON fixtures 的 typed 入口，扩展 `projectionTestBuilders.ts` 提供一个窄的 `inProgressTurn(...)` helper。调用点只替换合法 payload 构造，保留 JSON-RPC envelope、出站 payload 断言和 malformed payload 的显式手写形状。

**Tech Stack:** TypeScript、Vitest、Vitest Browser、Playwright e2e、pnpm。

---

## 文件结构

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - 新增 `inProgressTurn(id, items?)`，复用 `baseTurn` 的默认字段，只覆盖 in-progress 所需字段。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
  - 从 `eventTurnStarted` 和 `inProgressTurn` 派生合法 active turn event 与 `turn/start` mock response。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - 让 `createGuiHostCommands().startTurn` 默认 response 复用 `inProgressTurn`。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
  - 让正向 `TurnStartResponse` 复用 `inProgressTurn`；保留 `TurnStartParams` 显式对象。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - 让 pending send resolve response 复用 `inProgressTurn`。
- Optional Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
  - 只在改动保持可读时，用 `baseTurn` / `planItem` 收敛局部手写 turn/item。
- Optional Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - 只在改动保持可读时，用 `turnCompleted(...)` builder 派生不同 turn id 的 completed event。

## 执行约束

- 不修改生产代码。
- 不移动或重写 `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__fixtures__` 下的 JSON 文件。
- 不抽象 `gui/authenticate`、`initialize`、`thread/projection/attach` 等 JSON-RPC envelope。
- 不抽象 e2e 中 `turn/start`、`turn/interrupt` 的 outbound params 断言。
- 不把 malformed attach/event/closed payload 改成合法 fixture 派生。
- 不安装依赖。
- 不 stage、不 commit，除非用户另行明确要求。

---

### Task 1: Add `inProgressTurn` Builder

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Depends on: `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-23-codex-gui-projection-fixture-reuse-design.md`

- [ ] **Step 1: Add the builder next to `baseTurn`**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`, place this immediately after `baseTurn`:

```ts
export const inProgressTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  ...baseTurn(id, items),
  status: "inProgress",
  completedAt: null,
  durationMs: null,
});
```

Expected local shape around the insertion:

```ts
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

export const inProgressTurn = (id: string, items: ThreadItem[] = []): Turn => ({
  ...baseTurn(id, items),
  status: "inProgress",
  completedAt: null,
  durationMs: null,
});
```

- [ ] **Step 2: Run focused type check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: type-check completes successfully.

---

### Task 2: Reuse Fixtures in E2E Legal Projection Payloads

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: Expand imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`, change the projection fixture import from:

```ts
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
```

to:

```ts
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Change the builder import from:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

to:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Replace the hand-written active projection event**

Replace the current `projectionEvent` object:

```ts
const projectionEvent = {
  threadId,
  subscriptionId,
  commitId: "commit-turn-started",
  parentCommitId: null,
  event: {
    type: "turnStarted",
    notification: {
      threadId,
      turn: {
        id: "turn-in-progress",
        items: [],
        itemsView: "full",
        status: "inProgress",
        error: null,
        startedAt: 1700000010,
        completedAt: null,
        durationMs: null,
      },
    },
  },
};
```

with:

```ts
const projectionEvent = {
  ...eventTurnStarted,
  subscriptionId,
  event: {
    ...eventTurnStarted.event,
    notification: {
      ...eventTurnStarted.event.notification,
      turn: inProgressTurn("turn-in-progress"),
    },
  },
};
```

Do not change `threadId`, `subscriptionId`, `attachResponse`, `mobileStressAttachResponse`, or the outbound request assertions in this task.

- [ ] **Step 3: Replace the hand-written `turn/start` response turn**

In the `request.method === "turn/start"` branch, replace:

```ts
result: {
  turn: {
    id: "turn-started-from-e2e",
    items: [],
    itemsView: "full",
    status: "inProgress",
    error: null,
    startedAt: 1700000100,
    completedAt: null,
    durationMs: null,
  },
},
```

with:

```ts
result: {
  turn: inProgressTurn("turn-started-from-e2e"),
},
```

Keep the surrounding JSON-RPC envelope explicit:

```ts
ws.send(
  JSON.stringify({
    jsonrpc: "2.0",
    id: request.id,
    result: {
      turn: inProgressTurn("turn-started-from-e2e"),
    },
  }),
);
```

- [ ] **Step 4: Verify e2e TypeScript boundary**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec tsc -p e2e/tsconfig.json --noEmit
```

Expected: command exits successfully with no TypeScript errors.

---

### Task 3: Reuse `inProgressTurn` in src Test Support and Tests

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Update App browser test support imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`, change:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

to:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Update `createGuiHostCommands` default response**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`, replace:

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

with:

```ts
export const createGuiHostCommands = (): GuiHostCommands => ({
  startTurn: vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: inProgressTurn("turn-started-from-app"),
  }),
  interruptTurn: vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({}),
});
```

- [ ] **Step 3: Update GUI host client test imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`, add this import near the projection fixture import:

```ts
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
```

Keep the existing type import:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
```

- [ ] **Step 4: Update GUI host `TurnStartResponse`**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`, replace:

```ts
const response: TurnStartResponse = {
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
```

with:

```ts
const response: TurnStartResponse = {
  turn: inProgressTurn("turn-started-by-command"),
};
```

Do not change `TurnStartParams` in this file. The explicit params object is the wire-level request assertion input.

- [ ] **Step 5: Update composer browser test imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`, add:

```ts
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
```

Place it near the existing projection fixture import.

- [ ] **Step 6: Update pending send resolve responses**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`, replace both repeated pending resolve blocks:

```ts
pending.resolve({
  turn: {
    id: "turn-finished",
    items: [],
    itemsView: "full",
    status: "inProgress",
    error: null,
    startedAt: 1700000101,
    completedAt: null,
    durationMs: null,
  },
});
```

with:

```ts
pending.resolve({
  turn: inProgressTurn("turn-finished"),
});
```

Keep both test names, user interactions, and assertions unchanged.

- [ ] **Step 7: Run focused unit and browser-related validation**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
pnpm run test:unit
```

Expected: both commands exit successfully.

---

### Task 4: Optional Low-Risk Builder Cleanup

**Files:**

- Optional Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- Optional Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

This task is optional during execution. Skip it if Task 1 through Task 3 already produce a small, reviewable diff and the local code reads clearly.

- [ ] **Step 1: Decide whether to include optional cleanup**

Open the current diff:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/e2e/app.spec.ts codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
```

Proceed with this task only if the diff is still easy to review and the optional edits remove obvious duplication without hiding test intent.

- [ ] **Step 2: Use `planItem` for snapshot replay plan items**

If proceeding, change the import in `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts` from:

```ts
import {
  attachWithTurns,
  runtimeFromAttach,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

to:

```ts
import {
  attachWithTurns,
  planItem,
  runtimeFromAttach,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

Replace:

```ts
items: [
  { type: "plan", id: "second-plan", text: "Second replayed item" },
  { type: "plan", id: "third-plan", text: "Third replayed item" },
],
```

with:

```ts
items: [planItem("second-plan"), planItem("third-plan")],
```

Replace:

```ts
items: [
  { type: "plan", id: "first-plan", text: "First replayed item" },
  eventItemStarted.event.notification.item,
],
```

with:

```ts
items: [planItem("first-plan"), eventItemStarted.event.notification.item],
```

The expected snapshot replay objects in the assertions should continue to reference `firstItem`, `secondFirstItem`, and `secondSecondItem`; do not rewrite expected material arrays.

- [ ] **Step 3: Use `turnCompleted(...)` for the non-matching completed event**

If proceeding, change the builder import in `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` from:

```ts
import { attachWithTurns } from "@/features/projection/__tests__/projectionTestBuilders";
```

to:

```ts
import {
  attachWithTurns,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

Replace:

```ts
const nonMatchingCompleted: ThreadProjectionEventNotification = {
  ...eventTurnCompleted,
  event: {
    ...eventTurnCompleted.event,
    notification: {
      ...eventTurnCompleted.event.notification,
      turn: {
        ...eventTurnCompleted.event.notification.turn,
        id: "another-turn",
      },
    },
  },
};
```

with:

```ts
const nonMatchingCompleted: ThreadProjectionEventNotification = turnCompleted(
  eventTurnCompleted,
  eventTurnCompleted.commitId,
  {
    ...eventTurnCompleted.event.notification.turn,
    id: "another-turn",
  },
);
```

Keep the `ThreadProjectionEventNotification` type import if it remains used by this declaration.

- [ ] **Step 4: Run validation after optional cleanup**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
pnpm run test:unit
```

Expected: both commands exit successfully.

---

### Task 5: Final Formatting and Verification

**Files:**

- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [ ] **Step 1: Format changed frontend files**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier -- --write e2e/app.spec.ts src/__tests__/appBrowserTestSupport.ts src/features/guiHost/__tests__/guiHostClient.test.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts
```

If Task 4 modified optional files, include them in the same command:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier -- --write e2e/app.spec.ts src/__tests__/appBrowserTestSupport.ts src/features/guiHost/__tests__/guiHostClient.test.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/projection/__tests__/projectionTestBuilders.ts src/features/snapshotReplay/__tests__/snapshotReplay.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: Prettier rewrites only formatting in the listed files.

- [ ] **Step 2: Run TypeScript checks**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
pnpm exec tsc -p e2e/tsconfig.json --noEmit
```

Expected: both commands exit successfully.

- [ ] **Step 3: Run unit tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit
```

Expected: unit test suite passes.

- [ ] **Step 4: Run e2e tests if `e2e/app.spec.ts` changed**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:e2e
```

Expected: Playwright e2e suite passes.

- [ ] **Step 5: Review final diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/e2e/app.spec.ts codex-gui/src/__tests__/appBrowserTestSupport.ts codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected diff characteristics:

- `projectionTestBuilders.ts` adds `inProgressTurn(...)`.
- `e2e/app.spec.ts` derives active projection event from `eventTurnStarted`.
- Repeated legal in-progress turn response objects are replaced by `inProgressTurn(...)`.
- JSON-RPC envelopes remain explicit.
- Outbound `turn/start` and `turn/interrupt` params assertions remain explicit.
- Malformed payload tests remain hand-written.

Do not stage or commit after review unless the user explicitly asks.
