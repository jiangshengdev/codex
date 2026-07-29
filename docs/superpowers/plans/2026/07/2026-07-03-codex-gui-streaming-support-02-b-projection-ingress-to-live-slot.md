# Projection Ingress To Live Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `02b` GUI data-layer path that accepts `thread/projection/delta` and appends agent message delta text into existing `transcriptState` live slots.

**Architecture:** `ProjectionIngressAdapter` remains the ingress gate for projection subscription correctness. `threadRuntimeSlice` exports an accepted-delta action, and `transcriptState` consumes that action to update only existing live slots without touching committed transcript chunks or projection commit-chain state.

**Tech Stack:** TypeScript, Redux Toolkit `createSlice`, Vitest unit tests, codex-gui projection fixtures/builders.

---

## Scope

This plan implements only `02b projection ingress to live slot`.

Implement:

- GUI protocol guard and host client callback for `thread/projection/delta`
- projection delta fixture export and test builder
- `ProjectionIngressAdapter.handleDelta`
- accepted delta Redux action in `threadRuntimeSlice`
- `transcriptState` reducer logic that appends delta text to an existing live slot
- bridge dispatch from accepted projection delta to the runtime action
- focused unit coverage for each boundary

Do not implement:

- `itemCompleted` live slot settlement or cleanup
- snapshot, attach, reconnect, or replay convergence
- UI rendering, Streamdown, or Markdown streaming
- thinking, tool call, exec output, or other streaming item types
- Rust protocol changes

## Files

- Modify: `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
- Modify: `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`

## Verification Environment

Before running any `pnpm` command in `codex-gui`, initialize the user fnm environment:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
```

Expected: `command -v pnpm` and `pnpm --version` must resolve to the user project pnpm, not a binary under `/Users/jiangsheng/.cache/codex-runtimes/`.

## Task 1: Add projection delta fixture surface

**Files:**

- Modify: `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
- Modify: `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`

- [ ] **Step 1: Write failing fixture import coverage**

Update `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts` imports:

```ts
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnCompleted,
  eventTurnStarted,
} from "./projectionFixtures";
```

Add `eventAgentMessageDelta` to `fixturePayloads`:

```ts
const fixturePayloads = [
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventTurnStarted,
  eventItemStarted,
  eventItemCompleted,
  eventTurnCompleted,
  eventSubscriptionReplacement,
  eventAgentMessageDelta,
];
```

Add this test in the `Rust-generated projection fixtures` describe block:

```ts
it("imports projection delta notifications with expected discriminators", () => {
  expect(eventAgentMessageDelta.delta.type).toBe("agentMessage");
  if (eventAgentMessageDelta.delta.type !== "agentMessage") {
    throw new Error("fixture must contain an agentMessage projection delta");
  }

  expect(eventAgentMessageDelta.delta.notification).toMatchObject({
    threadId: attachBaseline.snapshot.thread.id,
    turnId: "turn-in-progress",
    itemId: "assistant-message",
    delta: "streamed text",
  });
});
```

Update the historical field count assertion:

```ts
expect(fixturePayloads).toHaveLength(9);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/projection/__tests__/projectionFixtures.test.ts
```

Expected: FAIL because `eventAgentMessageDelta` is not exported.

- [ ] **Step 3: Export the Rust-generated projection delta fixture**

Update `codex-gui/src/features/projection/__tests__/projectionFixtures.ts`:

```ts
import eventAgentMessageDeltaJson from "../__fixtures__/event-agent-message-delta.json" with { type: "json" };
```

Update the protocol imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Export the fixture:

```ts
export const eventAgentMessageDelta =
  eventAgentMessageDeltaJson as ThreadProjectionDeltaNotification;
```

- [ ] **Step 4: Add a projection delta test builder**

Update `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts` imports:

```ts
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";
```

Append this builder near the projection event builders:

```ts
export const agentMessageDelta = (
  eventAgentMessageDelta: ThreadProjectionDeltaNotification,
  turnId: string,
  itemId: string,
  delta: string,
): ThreadProjectionDeltaNotification => {
  if (eventAgentMessageDelta.delta.type !== "agentMessage") {
    throw new Error("fixture must contain an agentMessage projection delta");
  }

  return {
    ...eventAgentMessageDelta,
    delta: {
      ...eventAgentMessageDelta.delta,
      notification: {
        ...eventAgentMessageDelta.delta.notification,
        turnId,
        itemId,
        delta,
      },
    },
  };
};
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/projection/__tests__/projectionFixtures.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```zsh
git add codex-gui/src/features/projection/__tests__/projectionFixtures.ts codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
git diff --cached
git commit -m "test(gui): expose projection delta fixture"
```

## Task 2: Parse and forward projection delta notifications from GUI host

**Files:**

- Modify: `codex-gui/src/features/guiHost/guiHostProtocol.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`

- [ ] **Step 1: Write failing host client tests**

Update `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts` imports:

```ts
import {
  attachBaseline,
  closedBackpressure,
  eventAgentMessageDelta,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Update protocol type imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

In `sends authenticate, initialize, attach, and forwards projection payloads`, add local capture:

```ts
const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
const projectionDelta = eventAgentMessageDelta;
```

Pass the callback to `startGuiHostConnection`:

```ts
onProjectionDelta: (notification) => {
  projectionDeltas.push(notification);
},
```

After the projection event message, send the delta notification:

```ts
socket.onmessage?.({
  data: JSON.stringify({
    jsonrpc: "2.0",
    method: "thread/projection/delta",
    params: projectionDelta,
  }),
});
```

Assert it was forwarded:

```ts
expect(projectionDeltas).toEqual([projectionDelta]);
```

Add malformed delta coverage:

```ts
it("reports malformed projection delta payloads without forwarding them", () => {
  const { summaries: statuses, onStatus } = recordStatusSummaries();
  const projectionDeltas: ThreadProjectionDeltaNotification[] = [];
  const attachResponse = attachBaseline;

  const { socket } = startGuiHostConnectionWithSocket({
    attachResponse,
    onStatus,
    onProjectionDelta: (notification) => {
      projectionDeltas.push(notification);
    },
  });

  socket.onopen?.();
  sendAuthenticateResult(socket);
  sendInitializeResult(socket);
  sendAttachResult(socket, attachResponse);
  socket.onmessage?.({
    data: JSON.stringify({
      jsonrpc: "2.0",
      method: "thread/projection/delta",
      params: {
        threadId: attachResponse.snapshot.thread.id,
        subscriptionId: attachResponse.subscriptionId,
        delta: {
          type: "agentMessage",
          notification: {
            threadId: attachResponse.snapshot.thread.id,
            turnId: "turn-1",
            itemId: "item-1",
          },
        },
      },
    }),
  });

  expect(projectionDeltas).toEqual([]);
  expect(statuses.at(-1)).toEqual({
    label: "error",
    message: "thread/projection/delta returned malformed params payload",
  });
});
```

- [ ] **Step 2: Run the focused host tests and verify they fail**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: FAIL because `onProjectionDelta` and the delta guard do not exist.

- [ ] **Step 3: Add the projection delta protocol guard**

Update `codex-gui/src/features/guiHost/guiHostProtocol.ts` imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Add the exported guard near the event guard:

```ts
export function isThreadProjectionDeltaNotification(
  value: unknown,
): value is ThreadProjectionDeltaNotification {
  if (
    !isRecord(value) ||
    typeof value.threadId !== "string" ||
    typeof value.subscriptionId !== "string"
  ) {
    return false;
  }

  const delta = value.delta;
  return isThreadProjectionDelta(delta);
}
```

Add these helpers near `isThreadProjectionEvent`:

```ts
function isThreadProjectionDelta(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.notification)) {
    return false;
  }

  switch (value.type) {
    case "agentMessage":
      return isAgentMessageDeltaNotification(value.notification);
    default:
      return false;
  }
}

function isAgentMessageDeltaNotification(value: Record<string, unknown>): boolean {
  return (
    typeof value.threadId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.itemId === "string" &&
    typeof value.delta === "string"
  );
}
```

- [ ] **Step 4: Add the host client callback and router branch**

Update `codex-gui/src/features/guiHost/guiHostClient.ts` protocol imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
} from "@codex-protocol/v2";
```

Update guard imports:

```ts
import {
  formatRpcId,
  isThreadProjectionAttachResponse,
  isThreadProjectionClosedNotification,
  isThreadProjectionDeltaNotification,
  isThreadProjectionEventNotification,
  parseRpcMessage,
  type RpcMessage,
} from "./guiHostProtocol";
```

Add the option:

```ts
onProjectionDelta?: (notification: ThreadProjectionDeltaNotification) => void;
```

Destructure it in `startGuiHostConnection`:

```ts
onProjectionDelta,
```

Add the message branch after `thread/projection/event`:

```ts
if (message.method === "thread/projection/delta") {
  if (!isThreadProjectionDeltaNotification(message.params)) {
    failProtocolAndClose(
      "thread/projection/delta returned malformed params payload",
      "protocol error",
    );
    return;
  }

  const notification = message.params;
  onProjectionDelta?.(notification);
}
```

- [ ] **Step 5: Thread the test support callback**

Update `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts` `startGuiHostConnectionWithSocket` parameters:

```ts
onProjectionDelta,
```

Update its type object:

```ts
onProjectionDelta?: StartGuiHostConnectionOptions["onProjectionDelta"];
```

Pass it to `startGuiHostConnection`:

```ts
onProjectionDelta,
```

- [ ] **Step 6: Run the focused host tests and verify they pass**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```zsh
git add codex-gui/src/features/guiHost/guiHostProtocol.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts
git diff --cached
git commit -m "feat(gui): parse projection delta notifications"
```

## Task 3: Add projection ingress delta acceptance

**Files:**

- Modify: `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`

- [ ] **Step 1: Write failing ingress tests for delta acceptance and filtering**

Update `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts` imports:

```ts
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Update protocol type imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
```

Add a delta derive helper:

```ts
const deriveDelta = (
  delta: ThreadProjectionDeltaNotification,
  overrides: Partial<ThreadProjectionDeltaNotification>,
): ThreadProjectionDeltaNotification => ({
  ...delta,
  ...overrides,
});
```

Add these tests:

```ts
it("accepts matching projection deltas without advancing the commit chain", () => {
  const adapter = new ProjectionIngressAdapter(projectionThreadId);
  adapter.handleAttach(attachBaseline);

  expect(adapter.handleDelta(eventAgentMessageDelta)).toStrictEqual({
    type: "deltaAccepted",
    notification: eventAgentMessageDelta,
  });
  expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
    type: "eventAccepted",
    notification: eventTurnStarted,
  });
});

it("ignores wrong-thread and stale-subscription deltas", () => {
  const adapter = new ProjectionIngressAdapter(projectionThreadId);
  adapter.handleAttach(attachBaseline);

  expect(
    adapter.handleDelta(
      deriveDelta(eventAgentMessageDelta, {
        threadId: "00000000-0000-0000-0000-000000000099",
      }),
    ),
  ).toStrictEqual({ type: "ignored", reason: "wrongThread" });
  expect(
    adapter.handleDelta(
      deriveDelta(eventAgentMessageDelta, {
        subscriptionId: "projection-fixture-replacement-subscription",
      }),
    ),
  ).toStrictEqual({ type: "ignored", reason: "staleSubscription" });
});

it("ignores deltas after manual reconnect is required", () => {
  const adapter = new ProjectionIngressAdapter(projectionThreadId);
  adapter.handleAttach(attachBaseline);
  adapter.handleClosed(closed());

  expect(adapter.handleDelta(eventAgentMessageDelta)).toStrictEqual({
    type: "ignored",
    reason: "alreadyRequiresManualReconnect",
  });
});
```

- [ ] **Step 2: Run the focused ingress tests and verify they fail**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: FAIL because `handleDelta` and `deltaAccepted` do not exist.

- [ ] **Step 3: Add `deltaAccepted` to ingress outcomes**

Update `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts` imports:

```ts
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEvent,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
```

Add the outcome variant:

```ts
| {
    type: "deltaAccepted";
    notification: ThreadProjectionDeltaNotification;
  }
```

- [ ] **Step 4: Add `handleDelta`**

Add this method to `ProjectionIngressAdapter`:

```ts
handleDelta(notification: ThreadProjectionDeltaNotification): ProjectionIngressOutcome {
  const ignored = this.ignoreReasonForNotification(
    notification.threadId,
    notification.subscriptionId,
  );
  if (ignored != null) {
    return { type: "ignored", reason: ignored };
  }

  return { type: "deltaAccepted", notification };
}
```

Do not update `this.cursor.headCommitId` in `handleDelta`.

- [ ] **Step 5: Run the focused ingress tests and verify they pass**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```zsh
git add codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
git diff --cached
git commit -m "feat(gui): accept projection deltas in ingress"
```

## Task 4: Add accepted delta runtime action

**Files:**

- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Write a failing runtime action export test**

Update `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` imports from `threadRuntimeSlice` to include:

```ts
threadRuntimeDeltaAccepted,
```

Add this test:

```ts
it("exports accepted projection delta actions without mutating runtime buffers", () => {
  const state = reduce(undefined, threadRuntimeAttached(attachBaseline));
  const nextState = reduce(
    state,
    threadRuntimeDeltaAccepted({ notification: eventAgentMessageDelta }),
  );

  expect(nextState).toStrictEqual(state);
});
```

Update the projection fixture imports in the same file to include:

```ts
eventAgentMessageDelta,
```

- [ ] **Step 2: Run the focused runtime tests and verify they fail**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: FAIL because `threadRuntimeDeltaAccepted` is not exported.

- [ ] **Step 3: Add the accepted delta action**

Update `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts` imports:

```ts
import type {
  Thread,
  ThreadProjectionAttachResponse,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
```

Add payload type:

```ts
export type ThreadRuntimeProjectionDeltaPayload = {
  notification: ThreadProjectionDeltaNotification;
};
```

Add a reducer in `threadRuntimeSlice`:

```ts
threadRuntimeDeltaAccepted: create.reducer(
  (_state, _action: PayloadAction<ThreadRuntimeProjectionDeltaPayload>) => {},
),
```

Export the action:

```ts
export const {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} = threadRuntimeSlice.actions;
```

- [ ] **Step 4: Run the focused runtime tests and verify they pass**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```zsh
git add codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git diff --cached
git commit -m "feat(gui): add projection delta runtime action"
```

## Task 5: Append accepted deltas into existing live slots

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Write failing transcript delta reducer tests**

Update `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts` projection fixture imports:

```ts
eventAgentMessageDelta,
```

Update thread runtime imports:

```ts
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

Update projection test builder imports:

```ts
agentMessageDelta,
```

Add this test:

```ts
it("appends accepted agent message deltas into an existing live slot", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
  const initialItem = agentMessage("agent-streaming", "");
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-streaming-started",
        "turn-streaming",
        initialItem,
      ),
      replay: "live",
    }),
  );

  store.dispatch(
    threadRuntimeDeltaAccepted({
      notification: agentMessageDelta(
        eventAgentMessageDelta,
        "turn-streaming",
        "agent-streaming",
        "Hello",
      ),
    }),
  );
  store.dispatch(
    threadRuntimeDeltaAccepted({
      notification: agentMessageDelta(
        eventAgentMessageDelta,
        "turn-streaming",
        "agent-streaming",
        " world",
      ),
    }),
  );

  expect(selectTranscriptLiveItem(store.getState(), "turn-streaming", "agent-streaming")).toStrictEqual({
    key: "turn-streaming:agent-streaming",
    turnId: "turn-streaming",
    itemId: "agent-streaming",
    status: "streaming",
    initialItem,
    transientText: "Hello world",
    completedItem: null,
    revision: 2,
  });
  expect(selectTranscriptEntry(store.getState(), "agent-streaming")).toBeNull();
  expect(selectTranscriptChunk(store.getState(), "turn-streaming:chunk:0")).toBeNull();
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
});
```

Add missing-slot coverage:

```ts
it("ignores accepted agent message deltas when the live slot is missing", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const beforeState = store.getState().transcriptState;
  store.dispatch(
    threadRuntimeDeltaAccepted({
      notification: agentMessageDelta(
        eventAgentMessageDelta,
        "turn-missing-slot",
        "agent-missing-slot",
        "ignored",
      ),
    }),
  );

  expect(store.getState().transcriptState).toStrictEqual(beforeState);
  expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-missing-slot")).toStrictEqual([]);
});
```

- [ ] **Step 2: Run the focused transcript tests and verify they fail**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: FAIL because accepted deltas do not update live slots.

- [ ] **Step 3: Add the live slot delta helper**

Update `codex-gui/src/features/transcriptState/transcriptStateSlice.ts` imports:

```ts
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

Add this helper near `upsertStartedLiveSlot`:

```ts
const appendAgentMessageDeltaToLiveSlot = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  delta: string,
) => {
  const slot = state.liveSlotsByKey[liveSlotKey(turnId, itemId)];
  if (slot == null) {
    return;
  }

  slot.transientText += delta;
  slot.status = "streaming";
  slot.revision += 1;
};
```

- [ ] **Step 4: Consume `threadRuntimeDeltaAccepted`**

Add this extra reducer before `threadRuntimeManualReconnectRequired`:

```ts
.addCase(threadRuntimeDeltaAccepted, (state, action) => {
  const { notification } = action.payload;
  if (state.threadId !== notification.threadId) {
    return;
  }

  switch (notification.delta.type) {
    case "agentMessage": {
      const { turnId, itemId, delta } = notification.delta.notification;
      appendAgentMessageDeltaToLiveSlot(state, turnId, itemId, delta);
      return;
    }
  }
})
```

Do not call `recordAppliedEvent`, do not write `entriesById`, and do not update `committedScrollCommitKey`.

- [ ] **Step 5: Run the focused transcript tests and verify they pass**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```zsh
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git diff --cached
git commit -m "feat(gui): append projection deltas to live slots"
```

## Task 6: Wire accepted deltas through the GUI host bridge

**Files:**

- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`

- [ ] **Step 1: Wire imports**

Update imports in `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`:

```ts
import {
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
  type SnapshotReplayIndex,
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

- [ ] **Step 2: Dispatch accepted delta outcomes**

Add this case to `dispatchProjectionOutcome`:

```ts
case "deltaAccepted":
  dispatch(threadRuntimeDeltaAccepted({ notification: outcome.notification }));
  return;
```

- [ ] **Step 3: Route host projection deltas into ingress**

Add this option to `startGuiHostConnection`:

```ts
onProjectionDelta: (notification) => {
  if (projectionIngress == null) {
    return;
  }

  dispatchProjectionOutcome(projectionIngress.handleDelta(notification));
},
```

- [ ] **Step 4: Run type-check to verify bridge exhaustiveness and imports**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

Run:

```zsh
git add codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
git diff --cached
git commit -m "feat(gui): wire projection deltas through bridge"
```

## Task 7: Focused verification and formatting

**Files:**

- Modify only files changed by Tasks 1-6 if formatting changes them.

- [ ] **Step 1: Run formatter fix**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run format:oxfmt:fix
```

Expected: command exits successfully. If it changes files from earlier tasks, inspect the diff and include those formatting changes in this task commit.

- [ ] **Step 2: Run focused unit tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run test:unit -- src/features/projection/__tests__/projectionFixtures.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
command -v pnpm
pnpm --version
pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```zsh
git diff --stat
git diff
```

Expected: diff only includes the 02b projection delta ingress path and tests described in this plan.

- [ ] **Step 6: Commit verification or formatting changes**

If Step 1 changed files or verification required small fixes, run:

```zsh
git add codex-gui/src/features/projection/__tests__/projectionFixtures.ts codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts codex-gui/src/features/guiHost/guiHostProtocol.ts codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
git diff --cached
git commit -m "chore(gui): verify projection delta ingress"
```

If no files changed after Task 6, do not create an empty commit.

## Execution Notes

- Do not run `pnpm` before initializing fnm and checking `command -v pnpm` plus `pnpm --version`.
- If `command -v pnpm` points under `/Users/jiangsheng/.cache/codex-runtimes/`, stop before running any `pnpm run ...` command.
- Do not install dependencies.
- Do not operate git remotes.
- Keep `itemStarted` on the existing `threadRuntimeEventBuffered` path.
- Keep `thread/projection/delta` out of `entriesById`, `chunksById`, `entryChunkById`, `appliedEventIdsById`, `appliedEventOrder`, and `committedScrollCommitKey`.
- Missing live slots for accepted delta are ignored.
- `itemCompleted` settlement remains out of scope for this plan.
