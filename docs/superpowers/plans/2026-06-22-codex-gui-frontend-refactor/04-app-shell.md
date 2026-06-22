# App Shell Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `codex-gui/src/App.tsx` into focused App shell and GUI host connection wiring modules without changing user-visible behavior.

**Architecture:** Keep `App.tsx` as a lightweight composition component with local `GuiHostStatus` and `GuiHostCommands | null` state. Extract stable UI layout into `AppShell`, and extract `startGuiHostConnection` lifecycle plus projection runtime dispatch wiring into `GuiHostConnectionBridge`. Extract App browser test support first so the behavior lock stays readable while production files move.

**Tech Stack:** React 19, TypeScript, Redux Toolkit hooks/actions, Vitest Browser, HeroUI React, app-server protocol generated TypeScript.

---

## Source Design

Implement only this confirmed design:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/04-app-shell-design.md
```

Use the overall constraints from:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/00-overall-design.md
```

Do not edit either design while executing this plan. If implementation exposes a design mismatch, stop and report the mismatch before changing design, tests, or source scope.

## Scope

This plan creates:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/AppShell.tsx`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`

This plan modifies:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx`

This plan does not modify:

- `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/guiHostClient.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/package.json`
- `/Users/jiangsheng/cnb/codex/codex-gui/pnpm-lock.yaml`

This plan does not stage or commit implementation changes unless the user explicitly asks during execution.

## File Structure

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - Owns the test-only `guiHostClient` mock registration, mock handle, command mock builder, fixture-derived attach response, committed-message attach builder, and cleanup/status helpers.
  - Must be imported before `@/App` in `App.browser.test.tsx` so the `guiHostClient` mock is registered before App imports `startGuiHostConnection`.

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
  - Imports support helpers from `./appBrowserTestSupport`.
  - Keeps all test names and assertions unchanged.
  - Keeps event fixture imports that are used directly by tests.

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/AppShell.tsx`
  - Owns only the rendered shell: `<main>`, `Toast.Provider`, `Surface`, `CommittedTranscriptSurface`, and `ComposerTurnControl`.
  - Accepts `status` and `commands` props.

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - Owns only host connection effect lifecycle and projection runtime dispatch wiring.
  - Receives `setStatus` and `setCommands` callbacks from `App.tsx`.
  - Returns `null`.

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx`
  - Owns only `status` / `commands` state and composition of `GuiHostConnectionBridge` plus `AppShell`.

## Behavior Contract

The refactor must preserve:

- `<main>` role and `data-gui-host-status` value.
- Current shell class names and layout.
- Current `Toast.Provider placement="top"` location.
- Current `Surface` class names and variant.
- Composer enabled/disabled behavior.
- Send payload and Stop payload behavior through existing `GuiHostCommands`.
- Launch thread identity recording.
- Attached thread identity mismatch handling.
- Projection attach/event/closed runtime dispatch outcomes.
- Manual reconnect behavior.
- Cleanup on App unmount.
- No optimistic user message after Send.

---

### Task 1: Extract App Browser Test Support

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Run the target App browser test before editing**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: tests pass before refactor. If this fails before edits, stop and report the pre-existing failure.

- [ ] **Step 2: Create `appBrowserTestSupport.ts`**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts` with this content:

```ts
import { vi } from "vitest";
import type {
  GuiHostCommands,
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

export const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

export type StartGuiHostConnectionMock = {
  mockImplementation: (
    implementation: (options: StartGuiHostConnectionOptions) => () => void,
  ) => void;
  mockReset: () => void;
  mock: {
    calls: [StartGuiHostConnectionOptions][];
  };
};

export const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

export const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
export const launchThreadId = attachResponse.snapshot.thread.id;

let emitStatus: ((status: GuiHostStatus) => void) | undefined;
let cleanupConnectionCallCount = 0;

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
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

export const createCommands = (): GuiHostCommands => ({
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

export const attachWithCommittedMessages = (): ThreadProjectionAttachResponse => {
  const turn: Turn = {
    id: "turn-app-surface",
    items: [
      userMessage("user-app-surface", [textInput("Hello from App")]),
      agentMessage("agent-app-surface", "Committed App response"),
    ],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: 1700000001,
    completedAt: 1700000005,
    durationMs: 4000,
  };

  return {
    ...attachResponse,
    snapshot: {
      ...attachResponse.snapshot,
      thread: {
        ...attachResponse.snapshot.thread,
        turns: [turn],
      },
    },
  };
};

export const resetAppBrowserTestSupport = (): void => {
  emitStatus = undefined;
  cleanupConnectionCallCount = 0;
  startGuiHostConnectionMock.mockReset();
  startGuiHostConnectionMock.mockImplementation((options) => {
    options.onLaunchParams?.({ threadId: launchThreadId, token: "secret" });
    emitStatus = options.onStatus;
    return () => {
      cleanupConnectionCallCount += 1;
    };
  });
};

export const emitGuiHostStatus = (status: GuiHostStatus): void => {
  emitStatus?.(status);
};

export const getCleanupConnectionCallCount = (): number => cleanupConnectionCallCount;
```

- [ ] **Step 3: Update `App.browser.test.tsx` imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`, replace the current import and mock setup block from the top of the file through `attachWithCommittedMessages` with this content:

```ts
import { beforeEach, expect, test } from "vitest";
import {
  attachResponse,
  attachWithCommittedMessages,
  createCommands,
  emitGuiHostStatus,
  getCleanupConnectionCallCount,
  guiHostClientMock,
  launchThreadId,
  resetAppBrowserTestSupport,
  startGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import App from "@/App";
import closedBackpressureJson from "@/features/projection/__fixtures__/closed-backpressure.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  buildSnapshotReplayMaterials,
  selectSnapshotReplayMaterials,
} from "@/features/snapshotReplay/snapshotReplay";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Expected: `./appBrowserTestSupport` is imported before `@/App`.

- [ ] **Step 4: Replace the `beforeEach` body**

Replace the existing `beforeEach` block with:

```ts
beforeEach(() => {
  resetAppBrowserTestSupport();
});
```

- [ ] **Step 5: Replace the status emitter call**

In the test named `"App keeps host status as a test hook instead of visible shell content"`, replace:

```ts
emitStatus?.({
  label: "received event",
  eventCount: 2,
  lastEventType: "turnStarted",
});
```

with:

```ts
emitGuiHostStatus({
  label: "received event",
  eventCount: 2,
  lastEventType: "turnStarted",
});
```

- [ ] **Step 6: Replace the cleanup count assertion**

In the test named `"App closes the host connection when unmounted"`, replace:

```ts
expect(cleanupConnectionCallCount).toBe(1);
```

with:

```ts
expect(getCleanupConnectionCallCount()).toBe(1);
```

- [ ] **Step 7: Run the App browser test after test support extraction**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: tests pass. If they fail because `App` imported the real `guiHostClient`, verify that `./appBrowserTestSupport` is imported before `@/App`.

### Task 2: Extract `AppShell`

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/AppShell.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx`

- [ ] **Step 1: Create `AppShell.tsx`**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/AppShell.tsx` with this content:

```tsx
import { Surface, Toast } from "@heroui/react";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";

export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
};

export function AppShell({ status, commands }: AppShellProps) {
  return (
    <main
      className="min-h-svh w-full px-4 py-6 pb-44 sm:px-6 lg:px-8"
      data-gui-host-status={status.label}
    >
      <Toast.Provider placement="top" />
      <Surface className="mx-auto grid min-w-0 w-full max-w-6xl content-start" variant="default">
        <CommittedTranscriptSurface />
      </Surface>
      <ComposerTurnControl commands={commands} guiHostStatus={status} />
    </main>
  );
}
```

- [ ] **Step 2: Update `App.tsx` to use `AppShell`**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx`, remove these imports:

```ts
import { Surface, Toast } from "@heroui/react";
import { CommittedTranscriptSurface } from "./features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "./features/composerTurnControl/ComposerTurnControl";
```

Add this import:

```ts
import { AppShell } from "./features/appShell/AppShell";
```

Replace the current `return (...)` block with:

```tsx
  return <AppShell status={status} commands={commands} />;
```

- [ ] **Step 3: Run the App browser test after `AppShell` extraction**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: tests pass. The tests that assert shell visibility, shell padding, composer behavior, and host status hook should keep passing without assertion changes.

### Task 3: Extract `GuiHostConnectionBridge`

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx`

- [ ] **Step 1: Create `GuiHostConnectionBridge.tsx`**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx` with this content:

```tsx
import { useEffect } from "react";
import { useAppDispatch } from "@/app/hooks";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import {
  ProjectionIngressAdapter,
  type ProjectionIngressOutcome,
} from "@/features/projectionIngress/projectionIngressAdapter";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let launchThreadId: string | null = null;
    let projectionIngress: ProjectionIngressAdapter | null = null;
    const dispatchProjectionOutcome = (outcome: ProjectionIngressOutcome) => {
      switch (outcome.type) {
        case "attachAccepted":
          dispatch(threadRuntimeAttached(outcome.response));
          return;
        case "eventAccepted":
          dispatch(threadRuntimeEventBuffered(outcome.notification));
          return;
        case "manualReconnectRequired":
          dispatch(
            threadRuntimeManualReconnectRequired({
              reason: outcome.reason,
              threadId: outcome.threadId,
              subscriptionId: outcome.subscriptionId,
            }),
          );
          return;
        case "ignored":
          return;
      }
    };

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
        onLaunchParams: (params) => {
          launchThreadId = params.threadId;
          projectionIngress = new ProjectionIngressAdapter(params.threadId);
          dispatch(launchThreadIdRecorded(params.threadId));
        },
        onProjectionAttached: (response) => {
          const attachedThreadId = response.snapshot.thread.id;
          dispatch(attachedThreadIdObserved(attachedThreadId));

          if (launchThreadId !== attachedThreadId || projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleAttach(response));
        },
        onProjectionEvent: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleEvent(notification));
        },
        onProjectionClosed: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleClosed(notification));
        },
        onCommandsReady: setCommands,
        onCommandsUnavailable: () => {
          setCommands(null);
        },
      });
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCommands(null);
        setStatus({
          label: "error",
          eventCount: 0,
          lastEventType: null,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return () => {
      isMounted = false;
      setCommands(null);
      cleanupConnection?.();
    };
  }, [dispatch, setCommands, setStatus]);

  return null;
}
```

- [ ] **Step 2: Update `App.tsx` to use `GuiHostConnectionBridge`**

Replace `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx` with this content:

```tsx
import { useState } from "react";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";

function App() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
    eventCount: 0,
    lastEventType: null,
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);

  return (
    <>
      <GuiHostConnectionBridge setStatus={setStatus} setCommands={setCommands} />
      <AppShell status={status} commands={commands} />
    </>
  );
}

export default App;
```

- [ ] **Step 3: Run the App browser test after bridge extraction**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: tests pass. The tests for projection dispatch, manual reconnect, command readiness, cleanup, and no optimistic message are the critical behavior lock for this task.

### Task 4: Stage Verification

**Files:**
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/AppShell.tsx`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: pass.

- [ ] **Step 2: Run App browser behavior lock**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: pass.

- [ ] **Step 3: Check the App shell diff for scope**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/App.tsx codex-gui/src/features/appShell codex-gui/src/__tests__/App.browser.test.tsx codex-gui/src/__tests__/appBrowserTestSupport.ts
```

Expected: diff only moves App browser test support, App shell rendering, and host connection wiring. If the diff changes e2e, protocol files, package files, lockfiles, or UI class names, stop and revert the unrelated change before continuing.

- [ ] **Step 4: Decide whether to run e2e smoke**

Default: do not run e2e for this stage.

Run only if the reviewer wants final smoke coverage or if the App browser test failure investigation touched behavior near real WebSocket payloads:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:e2e -- e2e/app.spec.ts
```

Expected if run: pass. Do not edit `e2e/app.spec.ts` as part of this plan.
