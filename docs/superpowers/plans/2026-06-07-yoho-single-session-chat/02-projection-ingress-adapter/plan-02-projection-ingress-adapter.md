# Projection Ingress Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a projection ingress adapter that converts projection attach/event/closed inputs into structured outcomes and marks broken baselines as requiring user-initiated reconnect.

**Architecture:** Keep `guiHostClient` as transport-only: it parses JSON-RPC and forwards projection payloads. Add a small `ProjectionIngressAdapter` that owns only protocol cursor state (`threadId`, `subscriptionId`, `headCommitId`, known turn ids, manual reconnect reason). Wire `App` so the existing temporary `projectionSlice` only receives adapter-accepted attach/event inputs.

**Tech Stack:** TypeScript, React, Redux Toolkit, Vitest, Vitest Browser, pnpm.

---

## Scope

This plan implements only `02 Projection Ingress Adapter`.

It does not build the real reconnect button, runtime store, replay, chat UI, composer, or tool activity. `manualReconnectRequired` is a state signal; this plan stops short of user-facing reconnect controls.

## File Structure

- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
  - Add `ThreadProjectionClosedNotification` parsing and an `onProjectionClosed` callback.
- Modify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
  - Cover valid and malformed `thread/projection/closed` notifications.
- Create: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
  - Own adapter cursor, structured outcome types, and attach/event/closed handling.
- Create: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
  - Cover accepted attach/event, ignored inputs, and manual reconnect reasons.
- Modify: `codex-gui/src/App.tsx`
  - Instantiate the adapter after launch params and gate projection dispatches through adapter outcomes.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Verify `closed(backpressure)` prevents later current-subscription events from advancing the temporary projection store.

---

### Task 1: Forward Projection Closed Notifications From Transport

**Files:**
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`

- [ ] **Step 1: Write the failing transport test**

In `codex-gui/src/features/guiHost/guiHostClient.test.ts`, update the protocol import:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

In the `"sends authenticate, initialize, attach, and forwards projection payloads"` test, add closed notification capture next to `projectionEvents`:

```ts
const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
const projectionClosed: ThreadProjectionClosedNotification = {
  threadId: attachResponse.snapshot.thread.id,
  subscriptionId: attachResponse.subscriptionId,
  reason: "backpressure",
};
```

Pass the new callback into `startGuiHostConnection` in that test:

```ts
onProjectionClosed: (notification) => {
  projectionClosedNotifications.push(notification);
},
```

After the existing projection event socket message, add:

```ts
socket.onmessage?.({
  data: JSON.stringify({
    jsonrpc: "2.0",
    method: "thread/projection/closed",
    params: projectionClosed,
  }),
});
```

Update the status assertion to expect the closed notification to count as a received event:

```ts
expect(statuses).toContain("received event");
expect(projectionClosedNotifications).toEqual([projectionClosed]);
```

Add this test after `"reports malformed projection event payloads without forwarding them"`:

```ts
it("reports malformed projection closed payloads without forwarding them", () => {
  const socket = new RecordingWebSocket();
  const statuses: { label: string; message?: string }[] = [];
  const projectionClosedNotifications: ThreadProjectionClosedNotification[] = [];
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;

  startGuiHostConnection({
    location: new URL(
      `http://127.0.0.1:4567/?threadId=${attachResponse.snapshot.thread.id}#token=secret`,
    ),
    replaceState: vi.fn(),
    tokenStorage: new MemoryStorage(),
    createWebSocket: () => socket as unknown as WebSocket,
    onStatus: (status) => {
      statuses.push({
        label: status.label,
        message: "message" in status ? status.message : undefined,
      });
    },
    onProjectionClosed: (notification) => {
      projectionClosedNotifications.push(notification);
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
  socket.onmessage?.({
    data: JSON.stringify({
      jsonrpc: "2.0",
      method: "thread/projection/closed",
      params: {
        threadId: attachResponse.snapshot.thread.id,
        subscriptionId: attachResponse.subscriptionId,
        reason: "unexpected",
      },
    }),
  });

  expect(projectionClosedNotifications).toEqual([]);
  expect(statuses.at(-1)).toEqual({
    label: "error",
    message: "thread/projection/closed returned malformed params payload",
  });
});
```

- [ ] **Step 2: Run the focused transport test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected: FAIL because `ThreadProjectionClosedNotification` is not imported or handled by `guiHostClient.ts`, and `onProjectionClosed` is not part of `StartGuiHostConnectionOptions`.

- [ ] **Step 3: Add closed notification support in `guiHostClient.ts`**

Update the import:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Add the callback field:

```ts
export type StartGuiHostConnectionOptions = {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
  createWebSocket?: (url: string) => WebSocket;
  onStatus?: (status: GuiHostStatus) => void;
  onLaunchParams?: (params: LaunchParams) => void;
  onProjectionAttached?: (response: ThreadProjectionAttachResponse) => void;
  onProjectionEvent?: (notification: ThreadProjectionEventNotification) => void;
  onProjectionClosed?: (notification: ThreadProjectionClosedNotification) => void;
};
```

Destructure it in `startGuiHostConnection`:

```ts
  onProjectionAttached,
  onProjectionEvent,
  onProjectionClosed,
}: StartGuiHostConnectionOptions): GuiHostConnectionCleanup {
```

After the existing `thread/projection/event` branch, add:

```ts
    if (message.method === "thread/projection/closed") {
      if (!isThreadProjectionClosedNotification(message.params)) {
        emit({
          label: "error",
          eventCount,
          lastEventType: null,
          message: "thread/projection/closed returned malformed params payload",
        });
        return;
      }

      const notification = message.params;
      eventCount += 1;
      onProjectionClosed?.(notification);
      emit({
        label: "received event",
        eventCount,
        lastEventType: "projectionClosed",
      });
    }
```

Add this type guard near the event notification guard:

```ts
function isThreadProjectionClosedNotification(
  value: unknown,
): value is ThreadProjectionClosedNotification {
  return (
    isRecord(value) &&
    typeof value.threadId === "string" &&
    typeof value.subscriptionId === "string" &&
    value.reason === "backpressure"
  );
}
```

- [ ] **Step 4: Run the focused transport test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/guiHost/guiHostClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit transport closed forwarding**

Run:

```bash
git add codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts
git commit -m "feat(gui): forward projection closed notifications"
```

---

### Task 2: Add The Projection Ingress Adapter

**Files:**
- Create: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Create: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`

- [ ] **Step 1: Write the failing adapter tests**

Create `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import attachReplacementJson from "@/features/projection/__fixtures__/attach-replacement.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventSubscriptionReplacementJson from "@/features/projection/__fixtures__/event-subscription-replacement.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import { ProjectionIngressAdapter } from "../projectionIngressAdapter";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventSubscriptionReplacement =
  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;
const projectionThreadId = attachBaseline.snapshot.thread.id;

const deriveEvent = (
  event: ThreadProjectionEventNotification,
  overrides: Partial<ThreadProjectionEventNotification>,
): ThreadProjectionEventNotification => ({
  ...event,
  ...overrides,
});

const attachWithTurnsAndHead = (
  turns: Turn[],
  headCommitId: string | null,
): ThreadProjectionAttachResponse => ({
  ...attachBaseline,
  snapshot: {
    ...attachBaseline.snapshot,
    headCommitId,
    thread: {
      ...attachBaseline.snapshot.thread,
      turns,
    },
  },
});

const closed = (
  overrides: Partial<ThreadProjectionClosedNotification> = {},
): ThreadProjectionClosedNotification => ({
  threadId: projectionThreadId,
  subscriptionId: attachBaseline.subscriptionId,
  reason: "backpressure",
  ...overrides,
});

describe("ProjectionIngressAdapter", () => {
  it("accepts attach and contiguous projection events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);

    expect(adapter.handleAttach(attachBaseline)).toStrictEqual({
      type: "attachAccepted",
      response: attachBaseline,
    });
    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "eventAccepted",
      notification: eventTurnStarted,
    });
  });

  it("ignores wrong-thread events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(
      adapter.handleEvent(
        deriveEvent(eventTurnStarted, {
          threadId: "00000000-0000-0000-0000-000000000099",
        }),
      ),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
  });

  it("ignores stale subscription events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleEvent(eventSubscriptionReplacement)).toStrictEqual({
      type: "ignored",
      reason: "staleSubscription",
    });
  });

  it("ignores duplicate latest commit events", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAtCommit = attachWithTurnsAndHead(
      [eventTurnStarted.event.notification.turn],
      eventTurnStarted.commitId,
    );
    adapter.handleAttach(snapshotAtCommit);

    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "ignored",
      reason: "duplicateCommit",
    });
  });

  it("requires manual reconnect when parent commit does not match local head", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleEvent(eventItemStarted)).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "commitChainMismatch",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
  });

  it("requires manual reconnect when an item event is missing its parent turn", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    const snapshotWithoutLiveTurn = attachWithTurnsAndHead(
      attachBaseline.snapshot.thread.turns,
      eventTurnStarted.commitId,
    );
    adapter.handleAttach(snapshotWithoutLiveTurn);

    expect(adapter.handleEvent(eventItemStarted)).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "missingTurn",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
  });

  it("ignores later events after manual reconnect is required", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);
    adapter.handleEvent(eventItemStarted);

    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
  });

  it("resets manual reconnect state after a replacement attach", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);
    adapter.handleEvent(eventItemStarted);

    expect(adapter.handleAttach(attachReplacement)).toStrictEqual({
      type: "attachAccepted",
      response: attachReplacement,
    });
    expect(adapter.handleEvent(eventSubscriptionReplacement)).toStrictEqual({
      type: "eventAccepted",
      notification: eventSubscriptionReplacement,
    });
  });

  it("requires manual reconnect for matching backpressure closed notifications", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(adapter.handleClosed(closed())).toStrictEqual({
      type: "manualReconnectRequired",
      reason: "backpressure",
      threadId: projectionThreadId,
      subscriptionId: attachBaseline.subscriptionId,
    });
    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "ignored",
      reason: "alreadyRequiresManualReconnect",
    });
  });

  it("ignores wrong-thread and stale-subscription closed notifications", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    adapter.handleAttach(attachBaseline);

    expect(
      adapter.handleClosed(closed({ threadId: "00000000-0000-0000-0000-000000000099" })),
    ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
    expect(
      adapter.handleClosed(closed({ subscriptionId: "projection-fixture-replacement-subscription" })),
    ).toStrictEqual({ type: "ignored", reason: "staleSubscription" });
  });
});
```

- [ ] **Step 2: Run the focused adapter test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: FAIL because `../projectionIngressAdapter` does not exist yet.

- [ ] **Step 3: Add the adapter implementation**

Create `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEvent,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export type ProjectionManualReconnectReason =
  | "commitChainMismatch"
  | "missingTurn"
  | "backpressure";

export type ProjectionIgnoredReason =
  | "wrongThread"
  | "staleSubscription"
  | "duplicateCommit"
  | "alreadyRequiresManualReconnect";

export type ProjectionIngressOutcome =
  | {
      type: "attachAccepted";
      response: ThreadProjectionAttachResponse;
    }
  | {
      type: "eventAccepted";
      notification: ThreadProjectionEventNotification;
    }
  | {
      type: "manualReconnectRequired";
      reason: ProjectionManualReconnectReason;
      threadId: string;
      subscriptionId: string | null;
    }
  | {
      type: "ignored";
      reason: ProjectionIgnoredReason;
    };

type ProjectionManualReconnect = {
  reason: ProjectionManualReconnectReason;
};

type ProjectionIngressCursor = {
  threadId: string;
  subscriptionId: string | null;
  headCommitId: string | null;
  knownTurnIds: Set<string>;
  manualReconnect: ProjectionManualReconnect | null;
};

export class ProjectionIngressAdapter {
  private cursor: ProjectionIngressCursor;

  constructor(threadId: string) {
    this.cursor = {
      threadId,
      subscriptionId: null,
      headCommitId: null,
      knownTurnIds: new Set(),
      manualReconnect: null,
    };
  }

  handleAttach(response: ThreadProjectionAttachResponse): ProjectionIngressOutcome {
    const thread = response.snapshot.thread;
    if (thread.id !== this.cursor.threadId) {
      return { type: "ignored", reason: "wrongThread" };
    }

    this.cursor = {
      threadId: thread.id,
      subscriptionId: response.subscriptionId,
      headCommitId: response.snapshot.headCommitId,
      knownTurnIds: new Set(thread.turns.map((turn) => turn.id)),
      manualReconnect: null,
    };

    return { type: "attachAccepted", response };
  }

  handleEvent(notification: ThreadProjectionEventNotification): ProjectionIngressOutcome {
    const ignored = this.ignoreReasonForNotification(
      notification.threadId,
      notification.subscriptionId,
    );
    if (ignored != null) {
      return { type: "ignored", reason: ignored };
    }

    if (notification.commitId === this.cursor.headCommitId) {
      return { type: "ignored", reason: "duplicateCommit" };
    }

    if (notification.parentCommitId !== this.cursor.headCommitId) {
      return this.requireManualReconnect("commitChainMismatch");
    }

    if (this.eventIsMissingParentTurn(notification.event)) {
      return this.requireManualReconnect("missingTurn");
    }

    this.cursor.headCommitId = notification.commitId;
    this.recordKnownTurn(notification.event);

    return { type: "eventAccepted", notification };
  }

  handleClosed(notification: ThreadProjectionClosedNotification): ProjectionIngressOutcome {
    const ignored = this.ignoreReasonForNotification(
      notification.threadId,
      notification.subscriptionId,
    );
    if (ignored != null) {
      return { type: "ignored", reason: ignored };
    }

    return this.requireManualReconnect("backpressure");
  }

  private ignoreReasonForNotification(
    threadId: string,
    subscriptionId: string,
  ): ProjectionIgnoredReason | null {
    if (threadId !== this.cursor.threadId) {
      return "wrongThread";
    }

    if (subscriptionId !== this.cursor.subscriptionId) {
      return "staleSubscription";
    }

    if (this.cursor.manualReconnect != null) {
      return "alreadyRequiresManualReconnect";
    }

    return null;
  }

  private requireManualReconnect(
    reason: ProjectionManualReconnectReason,
  ): ProjectionIngressOutcome {
    this.cursor.manualReconnect = { reason };

    return {
      type: "manualReconnectRequired",
      reason,
      threadId: this.cursor.threadId,
      subscriptionId: this.cursor.subscriptionId,
    };
  }

  private eventIsMissingParentTurn(event: ThreadProjectionEvent): boolean {
    switch (event.type) {
      case "turnStarted":
      case "turnCompleted":
        return false;
      case "itemStarted":
      case "itemCompleted":
        return !this.cursor.knownTurnIds.has(event.notification.turnId);
    }
  }

  private recordKnownTurn(event: ThreadProjectionEvent): void {
    switch (event.type) {
      case "turnStarted":
      case "turnCompleted":
        this.cursor.knownTurnIds.add(event.notification.turn.id);
        return;
      case "itemStarted":
      case "itemCompleted":
        return;
    }
  }
}
```

- [ ] **Step 4: Run the focused adapter test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the adapter**

Run:

```bash
git add codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts \
  codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
git commit -m "feat(gui): add projection ingress adapter"
```

---

### Task 3: Gate App Projection Dispatch Through The Adapter

**Files:**
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Write the failing App browser test**

Update the protocol import in `codex-gui/src/__tests__/App.browser.test.tsx`:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Add this test before `"App closes the GUI host connection when unmounted"`:

```ts
test("App stops forwarding projection events after backpressure requires manual reconnect", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const projectionClosed: ThreadProjectionClosedNotification = {
    threadId: launchThreadId,
    subscriptionId: attachResponse.subscriptionId,
    reason: "backpressure",
  };

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionClosed?.(projectionClosed);
  options?.onProjectionEvent?.(projectionEvent);

  const projection = selectProjectionByThreadId(store.getState(), launchThreadId);
  expect(projection?.subscriptionId).toBe(attachResponse.subscriptionId);
  expect(projection?.headCommitId).toBe(attachResponse.snapshot.headCommitId);
  expect(projection?.thread.turns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(selectProjectionReattachByThreadId(store.getState(), launchThreadId)).toBeNull();
});
```

- [ ] **Step 2: Run the focused App browser test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: FAIL because `StartGuiHostConnectionOptions` may not yet expose `onProjectionClosed` if Task 1 was not completed, and because `App` does not create or use `ProjectionIngressAdapter`.

- [ ] **Step 3: Wire `App` through the adapter**

Update imports in `codex-gui/src/App.tsx`:

```ts
import { ProjectionIngressAdapter } from "./features/projectionIngress/projectionIngressAdapter";
```

Inside the `useEffect` block, add an adapter variable next to `launchThreadId`:

```ts
let launchThreadId: string | null = null;
let projectionIngress: ProjectionIngressAdapter | null = null;
```

Update `onLaunchParams`:

```ts
onLaunchParams: (params) => {
  launchThreadId = params.threadId;
  projectionIngress = new ProjectionIngressAdapter(params.threadId);
  dispatch(launchThreadIdRecorded(params.threadId));
},
```

Replace the body of `onProjectionAttached` with:

```ts
onProjectionAttached: (response) => {
  const attachedThreadId = response.snapshot.thread.id;
  dispatch(attachedThreadIdObserved(attachedThreadId));

  if (launchThreadId !== attachedThreadId || projectionIngress == null) {
    return;
  }

  const outcome = projectionIngress.handleAttach(response);
  if (outcome.type === "attachAccepted") {
    dispatch(projectionAttached(outcome.response));
  }
},
```

Replace the body of `onProjectionEvent` with:

```ts
onProjectionEvent: (notification) => {
  if (projectionIngress == null) {
    return;
  }

  const outcome = projectionIngress.handleEvent(notification);
  if (outcome.type === "eventAccepted") {
    dispatch(projectionEventReceived(outcome.notification));
  }
},
```

Add the closed callback:

```ts
onProjectionClosed: (notification) => {
  projectionIngress?.handleClosed(notification);
},
```

This task intentionally does not add a visible reconnect UI. The adapter outcome blocks later event forwarding; the runtime/UI state for `manualReconnectRequired` belongs to the next layer.

- [ ] **Step 4: Run the focused App browser test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit App adapter wiring**

Run:

```bash
git add codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): gate projection dispatch through ingress adapter"
```

---

### Task 4: Final Verification

**Files:**
- Verify: `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- Verify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `codex-gui/src/App.tsx`
- Verify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Verify: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`

- [ ] **Step 1: Format changed frontend files**

Run:

```bash
pnpm --dir codex-gui exec prettier --write \
  src/App.tsx \
  src/__tests__/App.browser.test.tsx \
  src/features/guiHost/guiHostClient.ts \
  src/features/guiHost/guiHostClient.test.ts \
  src/features/projectionIngress/projectionIngressAdapter.ts \
  src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: Prettier rewrites files or reports them unchanged.

- [ ] **Step 2: Run focused unit tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --run \
  src/features/guiHost/guiHostClient.test.ts \
  src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused browser test**

Run:

```bash
pnpm --dir codex-gui exec vitest --config=vitest.browser.config.ts --run src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run type-check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected:

- `git diff --check` prints nothing.
- Diff is limited to the files listed in this plan.
- No lockfile changes.

- [ ] **Step 6: Commit verification cleanup if formatting changed files**

If Step 1 changed files after Task 3's commit, run:

```bash
git add codex-gui/src/App.tsx \
  codex-gui/src/__tests__/App.browser.test.tsx \
  codex-gui/src/features/guiHost/guiHostClient.ts \
  codex-gui/src/features/guiHost/guiHostClient.test.ts \
  codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts \
  codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
git commit -m "style(gui): format projection ingress adapter changes"
```

Expected: A commit is created only when formatting produced unstaged changes.

---

## Self-Review

Spec coverage:

- `thread/projection/closed` transport forwarding: Task 1.
- Structured `ProjectionIngressOutcome`: Task 2.
- Minimal cursor with `subscriptionId`, `headCommitId`, known turn ids, manual reconnect state: Task 2.
- `commitChainMismatch`, `missingTurn`, and `backpressure` manual reconnect rules: Task 2.
- `wrongThread`, `staleSubscription`, and `duplicateCommit` ignored outcomes: Task 2.
- No automatic reconnect loop: Task 2 and Task 3.
- Existing temporary projection store consumes only accepted outcomes: Task 3.
- Focused verification: Task 4.

Placeholder scan:

- No placeholder steps.
- No dependency installation.
- No runtime store, replay, chat UI, composer, or tool activity implementation.

Type consistency:

- `manualReconnectRequired` is the only reconnect outcome name.
- `ProjectionIngressAdapter` exposes `handleAttach`, `handleEvent`, and `handleClosed`.
- `onProjectionClosed` is the transport callback name used by both `guiHostClient` and `App`.
