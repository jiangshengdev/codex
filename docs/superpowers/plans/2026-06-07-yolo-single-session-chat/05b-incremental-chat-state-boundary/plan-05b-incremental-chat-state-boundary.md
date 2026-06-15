# Incremental Chat State Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `incrementalChatStateSlice` GUI feature that materializes plain user/assistant chat state from attach snapshots and accepted live projection events.

**Architecture:** Keep `05 Live Event Handling` as replay/debug material only, and make the active chat path event-driven: `threadRuntimeAttached`, `threadRuntimeEventBuffered`, and `threadRuntimeManualReconnectRequired` are handled by both `threadRuntimeSlice` and `incrementalChatStateSlice`. The new slice owns serializable normalized chat state, uses `extraReducers`, applies each accepted live notification once by `commitId`, and exposes selectors that `06a` can consume without reading `snapshotTurns`, `eventBuffer`, or `TimelineMaterial`.

**Tech Stack:** TypeScript, Redux Toolkit `createSlice`/`extraReducers`, Vitest, pnpm.

---

## Scope

This plan implements only `05b Incremental Chat State Boundary`.

It creates:

- `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

It modifies:

- `codex-gui/src/app/store.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

It does not modify `chatTextModel`, `liveEventHandling`, `snapshotReplay`, `App.tsx`, React rendering, composer behavior, reconnect UI, Markdown rendering, streaming delta handling, or tool activity UI.

`06a Chat Text Model` remains a separate rework plan. This plan only provides the `05b` selectors that the future `06a` rework must consume.

## File Structure

- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - Adds a local cap for `threadRuntime.eventBuffer` so it is a bounded replay/reconnect/debug tail.
  - First version cap: `MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH = 500`.
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - Covers the event buffer cap and verifies the newest accepted events are retained.
- Create: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
  - Owns normalized chat state, apply helpers, item-to-message mapping, `extraReducers`, and selectors.
- Create: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
  - Covers baseline rebuild, live apply, idempotency, message de-duplication, ignored items, global interrupted status, and store registration.
- Modify: `codex-gui/src/app/store.ts`
  - Registers `incrementalChatStateSlice` with `combineSlices`.

## Implementation Decisions

- `eventBuffer` cap is handled in this plan, not deferred. The cap is intentionally local to `threadRuntimeSlice`; active chat rendering still must not read `eventBuffer`.
- Live apply key is `ThreadProjectionEventNotification.commitId`. It is stable across accepted projection events and already drives ingress cursor behavior.
- Snapshot baseline items do not have commit ids. Baseline rebuild is the only snapshot full-build path, and it clears `appliedEventIds`.
- Manual reconnect status id uses the existing status id shape: `subscriptionInterrupted:${threadId}:${subscriptionId ?? "none"}:${reason}`.
- `05b` does not add deterministic keys to `TimelineMaterial`; it computes keys from the `threadRuntime*` action payloads inside the slice.
- `05b` may import runtime action creators from `threadRuntimeSlice`, but it must not call `selectThreadTimelineMaterials` or read `threadRuntime.eventBuffer` from selectors.

---

### Task 1: Bound The Thread Runtime Event Buffer

**Files:**
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Write the failing event buffer cap test**

Append this test to `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`:

```ts
  it("caps the event buffer as a bounded replay tail", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const attached = reduce(undefined, threadRuntimeAttached(attachBaseline));

    let state = attached;
    for (let index = 0; index < 501; index += 1) {
      state = reduce(
        state,
        threadRuntimeEventBuffered({
          ...eventTurnStarted,
          commitId: `commit-buffer-${index}`,
          parentCommitId: index === 0 ? null : `commit-buffer-${index - 1}`,
          event: {
            ...eventTurnStarted.event,
            notification: {
              ...eventTurnStarted.event.notification,
              turn: {
                ...eventTurnStarted.event.notification.turn,
                id: `turn-buffer-${index}`,
              },
            },
          },
        }),
      );
    }

    expect(state.current?.eventBuffer).toHaveLength(500);
    expect(state.current?.eventBuffer[0]?.notification.commitId).toBe("commit-buffer-1");
    expect(state.current?.eventBuffer.at(-1)?.notification.commitId).toBe("commit-buffer-500");
    expect(state.current?.activeTurnId).toBe("turn-buffer-500");
  });
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: FAIL because `eventBuffer` is currently unbounded and has 501 entries.

- [ ] **Step 3: Implement the event buffer cap**

In `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`, add this constant near `EMPTY_EVENT_BUFFER`:

```ts
const MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH = 500;
```

Then update `threadRuntimeEventBuffered` after `runtime.eventBuffer.push(...)`:

```ts
        if (runtime.eventBuffer.length > MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH) {
          runtime.eventBuffer.splice(
            0,
            runtime.eventBuffer.length - MAX_THREAD_RUNTIME_EVENT_BUFFER_LENGTH,
          );
        }
```

Keep the active turn switch below the cap logic so the current notification still updates `activeTurnId`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Commit the bounded runtime tail**

Run:

```bash
git add codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
git commit -m "feat(gui): bound thread runtime event buffer"
```

---

### Task 2: Add The Incremental Chat State Slice Tests

**Files:**
- Create: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

- [ ] **Step 1: Write the failing incremental chat state tests**

Create `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";
import {
  incrementalChatStateSlice,
  selectIncrementalChatGlobalStatus,
  selectIncrementalChatIsInterrupted,
  selectIncrementalChatTurns,
  type IncrementalChatState,
  type IncrementalChatTurnView,
} from "../incrementalChatStateSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;

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

const incrementalChatRoot = (state: IncrementalChatState) => ({
  incrementalChatState: state,
});

describe("incremental chat state reducer", () => {
  it("registers incremental chat state in the app store", () => {
    const store = makeStore();

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectIncrementalChatIsInterrupted(store.getState())).toBe(false);
  });

  it("rebuilds a baseline from an accepted attach snapshot", () => {
    const attachWithChat = attachWithTurns([
      baseTurn("turn-snapshot", [
        userMessage("user-snapshot", [textInput("Hello "), imageInput("https://example.invalid/a.png"), textInput("there")]),
        agentMessage("agent-snapshot", "**Plain** text"),
        planItem("plan-snapshot"),
      ]),
    ]);
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithChat));

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-snapshot",
        status: "completed",
        messages: [
          {
            id: "user-snapshot",
            turnId: "turn-snapshot",
            role: "user",
            text: "Hello there",
          },
          {
            id: "agent-snapshot",
            turnId: "turn-snapshot",
            role: "assistant",
            text: "**Plain** text",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("applies live notifications incrementally and ignores itemStarted for chat messages", () => {
    if (eventItemStarted.event.type !== "itemStarted") {
      throw new Error("fixture must contain an itemStarted projection event");
    }
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(threadRuntimeEventBuffered(turnStarted("commit-live-turn", baseTurn("turn-live", []))));
    store.dispatch(threadRuntimeEventBuffered(eventItemStarted));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-live-agent", "turn-live", agentMessage("agent-live", "Live answer")),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-live",
        status: "inProgress",
        messages: [
          {
            id: "agent-live",
            turnId: "turn-live",
            role: "assistant",
            text: "Live answer",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("uses commitId to avoid applying the same live notification twice", () => {
    const store = makeStore();
    const completed = itemCompleted(
      "commit-duplicate",
      "turn-duplicate",
      agentMessage("agent-duplicate", "Only once"),
    );

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(threadRuntimeEventBuffered(completed));
    store.dispatch(threadRuntimeEventBuffered(completed));

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-duplicate",
        status: "inProgress",
        messages: [
          {
            id: "agent-duplicate",
            turnId: "turn-duplicate",
            role: "assistant",
            text: "Only once",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("updates an existing message id without duplicating turn order", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-first", "turn-update", agentMessage("agent-update", "First")),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-second", "turn-update", agentMessage("agent-update", "Second")),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-update",
        status: "inProgress",
        messages: [
          {
            id: "agent-update",
            turnId: "turn-update",
            role: "assistant",
            text: "Second",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();
    const completedTurn = {
      ...baseTurn("turn-done", []),
      status: "completed" as const,
    };

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(threadRuntimeEventBuffered(turnStarted("commit-start-done", baseTurn("turn-done", []))));
    store.dispatch(threadRuntimeEventBuffered(turnCompleted("commit-complete-done", completedTurn)));

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-done",
        status: "completed",
        messages: [],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("filters empty text and non-chat items", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-filtered", [
            userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
            userMessage("empty-user", [textInput("")]),
            agentMessage("empty-agent", ""),
            planItem("hidden-plan"),
          ]),
        ]),
      ),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-filtered",
        status: "completed",
        messages: [],
      },
    ] satisfies IncrementalChatTurnView[]);
  });

  it("preserves materialized content and sets global status on manual reconnect", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-existing", [agentMessage("agent-existing", "Existing answer")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-existing",
        status: "completed",
        messages: [
          {
            id: "agent-existing",
            turnId: "turn-existing",
            role: "assistant",
            text: "Existing answer",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
    expect(selectIncrementalChatIsInterrupted(store.getState())).toBe(true);
  });

  it("clears interrupted status and applied event ids on the next attach", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-before-reconnect", [agentMessage("agent-before", "Before reconnect")]),
    ]);
    const replacementAttach = attachWithTurns([
      baseTurn("turn-after-reconnect", [agentMessage("agent-after", "After reconnect")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(threadRuntimeEventBuffered(itemCompleted("commit-before", "turn-before-reconnect", agentMessage("agent-live-before", "Live before"))));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );
    store.dispatch(threadRuntimeAttached(replacementAttach));

    expect(selectIncrementalChatTurns(store.getState())).toStrictEqual([
      {
        id: "turn-after-reconnect",
        status: "completed",
        messages: [
          {
            id: "agent-after",
            turnId: "turn-after-reconnect",
            role: "assistant",
            text: "After reconnect",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectIncrementalChatIsInterrupted(store.getState())).toBe(false);
  });

  it("exposes selectors over normalized state without exposing internal maps", () => {
    const state = incrementalChatStateSlice.reducer(
      undefined,
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-selector", [
            userMessage("user-selector", [textInput("Selector user")]),
            agentMessage("agent-selector", "Selector assistant"),
          ]),
        ]),
      ),
    );

    expect(selectIncrementalChatTurns(incrementalChatRoot(state))).toStrictEqual([
      {
        id: "turn-selector",
        status: "completed",
        messages: [
          {
            id: "user-selector",
            turnId: "turn-selector",
            role: "user",
            text: "Selector user",
          },
          {
            id: "agent-selector",
            turnId: "turn-selector",
            role: "assistant",
            text: "Selector assistant",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });
});
```

- [ ] **Step 2: Run the new focused test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result: FAIL because `incrementalChatStateSlice.ts` does not exist and the store does not register it.

---

### Task 3: Implement And Register The Incremental Chat State Slice

**Files:**
- Create: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- Modify: `codex-gui/src/app/store.ts`

- [ ] **Step 1: Implement `incrementalChatStateSlice`**

Create `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`:

```ts
import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";
import type { RootState } from "@/app/store";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
  type ThreadRuntimeManualReconnectPayload,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

export type IncrementalChatTurnStatus = "inProgress" | "completed" | "interrupted" | "failed";

export type IncrementalChatTurn = {
  id: string;
  status: IncrementalChatTurnStatus;
};

export type IncrementalChatMessage = {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  text: string;
};

export type IncrementalChatGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type IncrementalChatTurnView = {
  id: string;
  status: IncrementalChatTurnStatus;
  messages: IncrementalChatMessage[];
};

export type IncrementalChatState = {
  turnsById: Record<string, IncrementalChatTurn>;
  turnOrder: string[];
  messagesById: Record<string, IncrementalChatMessage>;
  messagesByTurnId: Record<string, string[]>;
  globalStatus: IncrementalChatGlobalStatus[];
  appliedEventIds: Record<string, true>;
};

const initialState = (): IncrementalChatState => ({
  turnsById: {},
  turnOrder: [],
  messagesById: {},
  messagesByTurnId: {},
  globalStatus: [],
  appliedEventIds: {},
});

const normalizeTurnStatus = (status: Turn["status"]): IncrementalChatTurnStatus => {
  switch (status) {
    case "inProgress":
    case "completed":
    case "interrupted":
    case "failed":
      return status;
  }
};

const ensureTurn = (
  state: IncrementalChatState,
  id: string,
  status: IncrementalChatTurnStatus = "inProgress",
): IncrementalChatTurn => {
  const existingTurn = state.turnsById[id];
  if (existingTurn != null) {
    existingTurn.status = status;
    return existingTurn;
  }

  const turn = { id, status };
  state.turnsById[id] = turn;
  state.turnOrder.push(id);
  state.messagesByTurnId[id] = [];
  return turn;
};

const appendOrUpdateMessage = (
  state: IncrementalChatState,
  message: IncrementalChatMessage,
) => {
  state.messagesById[message.id] = message;

  const messageIds = state.messagesByTurnId[message.turnId] ?? [];
  state.messagesByTurnId[message.turnId] = messageIds;
  if (!messageIds.includes(message.id)) {
    messageIds.push(message.id);
  }
};

const messageFromThreadItem = (
  item: ThreadItem,
  turnId: string,
): IncrementalChatMessage | null => {
  switch (item.type) {
    case "userMessage": {
      const text = item.content.map(textFromUserInput).join("");
      if (text.length === 0) {
        return null;
      }

      return {
        id: item.id,
        turnId,
        role: "user",
        text,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        id: item.id,
        turnId,
        role: "assistant",
        text: item.text,
      };
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "webSearch":
    case "imageView":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
      return null;
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};

const textFromUserInput = (input: UserInput): string => {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
    case "localImage":
    case "skill":
    case "mention":
      return "";
  }

  const exhaustiveInput: never = input;
  return exhaustiveInput;
};

const applySnapshotTurn = (state: IncrementalChatState, turn: Turn) => {
  ensureTurn(state, turn.id, normalizeTurnStatus(turn.status));

  for (const item of turn.items) {
    const message = messageFromThreadItem(item, turn.id);
    if (message != null) {
      appendOrUpdateMessage(state, message);
    }
  }
};

const applyAttach = (
  _state: IncrementalChatState,
  action: PayloadAction<ThreadProjectionAttachResponse>,
): IncrementalChatState => {
  const nextState = initialState();

  for (const turn of action.payload.snapshot.thread.turns) {
    applySnapshotTurn(nextState, turn);
  }

  return nextState;
};

const applyLiveEvent = (
  state: IncrementalChatState,
  notification: ThreadProjectionEventNotification,
) => {
  if (state.appliedEventIds[notification.commitId]) {
    return;
  }

  state.appliedEventIds[notification.commitId] = true;

  switch (notification.event.type) {
    case "turnStarted":
      ensureTurn(
        state,
        notification.event.notification.turn.id,
        normalizeTurnStatus(notification.event.notification.turn.status),
      );
      return;
    case "itemStarted":
      return;
    case "itemCompleted": {
      const { item, turnId } = notification.event.notification;
      ensureTurn(state, turnId);
      const message = messageFromThreadItem(item, turnId);
      if (message != null) {
        appendOrUpdateMessage(state, message);
      }
      return;
    }
    case "turnCompleted":
      ensureTurn(
        state,
        notification.event.notification.turn.id,
        normalizeTurnStatus(notification.event.notification.turn.status),
      );
      return;
  }
};

const interruptedStatusId = ({
  reason,
  threadId,
  subscriptionId,
}: ThreadRuntimeManualReconnectPayload): string =>
  `subscriptionInterrupted:${threadId}:${subscriptionId ?? "none"}:${reason}`;

const applyManualReconnectRequired = (
  state: IncrementalChatState,
  action: PayloadAction<ThreadRuntimeManualReconnectPayload>,
) => {
  const status: IncrementalChatGlobalStatus = {
    id: interruptedStatusId(action.payload),
    status: "subscriptionInterrupted",
    reason: action.payload.reason,
    subscriptionId: action.payload.subscriptionId,
  };

  const existingIndex = state.globalStatus.findIndex(({ id }) => id === status.id);
  if (existingIndex === -1) {
    state.globalStatus.push(status);
    return;
  }

  state.globalStatus[existingIndex] = status;
};

export const incrementalChatStateSlice = createAppSlice({
  name: "incrementalChatState",
  initialState: initialState(),
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(threadRuntimeAttached, applyAttach)
      .addCase(threadRuntimeEventBuffered, (state, action) => {
        applyLiveEvent(state, action.payload);
      })
      .addCase(threadRuntimeManualReconnectRequired, applyManualReconnectRequired);
  },
  selectors: {
    selectIncrementalChatTurns: (incrementalChatState): IncrementalChatTurnView[] =>
      incrementalChatState.turnOrder.map((turnId) => ({
        ...incrementalChatState.turnsById[turnId],
        messages: (incrementalChatState.messagesByTurnId[turnId] ?? []).map(
          (messageId) => incrementalChatState.messagesById[messageId],
        ),
      })),
    selectIncrementalChatGlobalStatus: (incrementalChatState) =>
      incrementalChatState.globalStatus,
    selectIncrementalChatIsInterrupted: (incrementalChatState) =>
      incrementalChatState.globalStatus.some(
        (status) => status.status === "subscriptionInterrupted",
      ),
  },
});

export const {
  selectIncrementalChatGlobalStatus,
  selectIncrementalChatIsInterrupted,
  selectIncrementalChatTurns,
} = incrementalChatStateSlice.selectors;

export default incrementalChatStateSlice;
```

- [ ] **Step 2: Register the slice in the app store**

Modify `codex-gui/src/app/store.ts`:

```ts
import type { Action, ThunkAction } from "@reduxjs/toolkit";
import { combineSlices, configureStore } from "@reduxjs/toolkit";
import incrementalChatStateSlice from "@/features/incrementalChatState/incrementalChatStateSlice";
import threadIdentitySlice from "@/features/threadIdentity/threadIdentitySlice";
import threadRuntimeSlice from "@/features/threadRuntime/threadRuntimeSlice";

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(
  threadIdentitySlice,
  threadRuntimeSlice,
  incrementalChatStateSlice,
);
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>;
```

Keep the rest of `store.ts` unchanged.

- [ ] **Step 3: Run the incremental chat state focused test**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 4: Run the runtime focused test again**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Commit the incremental chat state boundary**

Run:

```bash
git add codex-gui/src/app/store.ts codex-gui/src/features/incrementalChatState codex-gui/src/features/threadRuntime
git commit -m "feat(gui): add incremental chat state boundary"
```

---

### Task 4: Focused Verification And Scope Check

**Files:**
- Verify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
- Verify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Verify: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- Verify: `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- Verify: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`

- [ ] **Step 1: Run focused tests for the touched and adjacent boundaries**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
pnpm --dir codex-gui run type-check
```

Expected result: all commands PASS.

- [ ] **Step 2: Run GUI package CI**

Because this plan changes `codex-gui` source, run:

```bash
pnpm --dir codex-gui run ci
```

Expected result: PASS.

- [ ] **Step 3: Confirm the implementation did not drift into `06a`**

Run:

```bash
git show --name-only --oneline HEAD
git show --name-only --oneline HEAD~1
git status --short
rg -n "selectThreadTimelineMaterials|TimelineMaterial" codex-gui/src/features/incrementalChatState codex-gui/src/features/chatTextModel codex-gui/src/features/liveEventHandling
```

Expected result:

- The two source commits created by this plan are limited to `threadRuntime`, `incrementalChatState`, and `store.ts`.
- `git status --short` is empty before any optional docs completion commit.
- `incrementalChatState` has no `selectThreadTimelineMaterials` or `TimelineMaterial` references.
- Existing `chatTextModel` and `liveEventHandling` references may still exist because their rework is explicitly out of scope for `05b`.

- [ ] **Step 4: Confirm normalized state remains serializable**

Run:

```bash
rg -n "new Map|new Set|class " codex-gui/src/features/incrementalChatState
```

Expected result: no matches. `incrementalChatState` must use plain objects and arrays in Redux state.

- [ ] **Step 5: Commit plan completion docs if this plan file is updated during execution**

If the executor updates this plan file to mark completed checkboxes or add execution notes, commit that docs-only update separately:

```bash
git add docs/superpowers/plans/2026-06-07-yolo-single-session-chat/05b-incremental-chat-state-boundary/plan-05b-incremental-chat-state-boundary.md
git commit -m "docs(gui): mark incremental chat state plan complete"
```

---

## Self-Review Checklist

- [ ] The plan adds `incrementalChatStateSlice` and registers it in the store.
- [ ] The plan uses `extraReducers` for `threadRuntimeAttached`, `threadRuntimeEventBuffered`, and `threadRuntimeManualReconnectRequired`.
- [ ] The plan bounds `threadRuntime.eventBuffer` in this stage.
- [ ] The plan uses `commitId` as the live notification apply key.
- [ ] The plan rebuilds baseline only on attach.
- [ ] The plan does not replay `eventBuffer` into `05b`.
- [ ] The plan keeps `05` timeline material out of the active chat path.
- [ ] The plan does not change React UI, composer, Markdown, streaming, reconnect button, or tool activity.
- [ ] The plan leaves `06a` rework to a later plan.
