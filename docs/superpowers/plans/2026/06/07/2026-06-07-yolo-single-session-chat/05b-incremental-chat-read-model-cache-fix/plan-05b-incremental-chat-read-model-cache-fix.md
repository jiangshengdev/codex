# Incremental Chat Read Model Cache Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `incrementalChatStateSlice` so `selectIncrementalChatTurns` returns a reducer-maintained read model instead of rebuilding all turn views on every selector call.

**Architecture:** Keep the existing `05b` design boundary: `incrementalChatStateSlice` remains the active chat facts owner and still responds to the accepted runtime event actions through `extraReducers`. Add a serializable reducer-maintained read model cache inside the same slice, updated atomically with the normalized facts on attach and each accepted live notification. This avoids active UI selectors repeatedly traversing `turnOrder`, `messagesByTurnId`, and `messagesById`, while preserving replay/debug material outside the active path.

**Tech Stack:** TypeScript, Redux Toolkit `createSlice` / Immer reducers, Vitest, pnpm.

---

## Scope

This plan fixes the `05b` read path only.

It modifies:

- `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

It does not modify:

- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- `codex-gui/src/features/snapshotReplay`
- `codex-gui/src/features/chatTextModel`
- `codex-gui/src/App.tsx`
- React rendering, composer behavior, Markdown rendering, streaming delta handling, reconnect UI, or tool activity UI.

## Current Bug

`selectIncrementalChatTurns` currently rebuilds a full `IncrementalChatTurnView[]` on every read:

```ts
selectIncrementalChatTurns: (incrementalChatState): IncrementalChatTurnView[] =>
  incrementalChatState.turnOrder.flatMap((turnId) => {
    const turn = incrementalChatState.turnsById[turnId];
    if (turn == null) {
      return [];
    }

    const messageIds = incrementalChatState.messagesByTurnId[turnId] ?? [];
    const messages = messageIds.flatMap((messageId) => {
      const message = incrementalChatState.messagesById[messageId];
      return message == null ? [] : [message];
    });

    return [
      {
        id: turn.id,
        status: turn.status,
        messages,
      },
    ];
  }),
```

This is not the desired active path. Adding one chat event should update only the affected turn/message at reducer time. Reading should return the prepared read model.

## Design Basis

The `05b` design has already been updated before this plan. The implementation must follow these design points:

- `eventBuffer` / `snapshotTurns` are replay/debug inputs only.
- `05b` owns active chat facts and applies accepted notifications incrementally.
- `06a/06b/06c` must not rebuild from `snapshotReplay + eventBuffer`.
- A reducer-maintained `turnViews` array is allowed as a read model cache, not as a second canonical facts owner.
- The read model cache lives in the same slice, is serializable, and is updated atomically from the same reducer helpers that update normalized facts.

## File Structure

- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
  - Adds `turnViews`, `turnViewIndexById`, and `messageViewIndexById`.
  - Updates reset, attach rebuild, turn upsert, message upsert, and manual reconnect paths to keep the read model cache in sync.
  - Changes `selectIncrementalChatTurns` to return `incrementalChatState.turnViews`.
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
  - Adds regression tests that fail against the current read-time materializer.
  - Keeps existing behavior coverage.

## State Shape Decision

Add these fields to `IncrementalChatState`:

```ts
turnViews: IncrementalChatTurnView[];
turnViewIndexById: Record<string, number>;
messageViewIndexById: Record<string, { turnId: string; index: number }>;
```

Meanings:

- `turnViews` is the prepared read model returned by `selectIncrementalChatTurns`.
- `turnViewIndexById` lets reducers update a turn view in O(1) by turn id.
- `messageViewIndexById` lets reducers update or move an existing message view in O(1) for common repeated item ids.

The normalized maps remain for facts and future extension. The read model cache exists to remove repeated selector-time traversal, not to create an independent state owner.

---

### Task 1: Add Failing Selector Read Model Tests

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`

- [ ] **Step 1: Add a repeated selector identity regression test**

Append this test inside `describe("incremental chat state reducer", () => { ... })`:

```ts
  it("returns the prepared turn read model without rebuilding on repeated selector calls", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-read-model", [
            userMessage("user-read-model", [textInput("Read model user")]),
            agentMessage("agent-read-model", "Read model assistant"),
          ]),
        ]),
      ),
    );

    const firstSelectedTurns = selectIncrementalChatTurns(store.getState());
    const secondSelectedTurns = selectIncrementalChatTurns(store.getState());

    expect(secondSelectedTurns).toBe(firstSelectedTurns);
    expect(secondSelectedTurns).toStrictEqual([
      {
        id: "turn-read-model",
        status: "completed",
        messages: [
          {
            id: "user-read-model",
            turnId: "turn-read-model",
            role: "user",
            text: "Read model user",
          },
          {
            id: "agent-read-model",
            turnId: "turn-read-model",
            role: "assistant",
            text: "Read model assistant",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });
```

- [ ] **Step 2: Add an unrelated status update stability test**

Append this test:

```ts
  it("does not rebuild the turn read model for manual reconnect status updates", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-before-status", [agentMessage("agent-before-status", "Before status")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));

    const beforeStatusTurns = selectIncrementalChatTurns(store.getState());

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    const afterStatusTurns = selectIncrementalChatTurns(store.getState());

    expect(afterStatusTurns).toBe(beforeStatusTurns);
    expect(selectIncrementalChatGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
  });
```

- [ ] **Step 3: Add a local append stability test**

Append this test:

```ts
  it("preserves unaffected turn view objects when appending a message to another turn", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-stable", [agentMessage("agent-stable", "Stable")]),
          baseTurn("turn-target", [agentMessage("agent-target-before", "Before")]),
        ]),
      ),
    );

    const beforeAppendTurns = selectIncrementalChatTurns(store.getState());
    const stableTurnBeforeAppend = beforeAppendTurns[0];

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-target-append",
          "turn-target",
          agentMessage("agent-target-after", "After"),
        ),
      ),
    );

    const afterAppendTurns = selectIncrementalChatTurns(store.getState());

    expect(afterAppendTurns).not.toBe(beforeAppendTurns);
    expect(afterAppendTurns[0]).toBe(stableTurnBeforeAppend);
    expect(afterAppendTurns).toStrictEqual([
      {
        id: "turn-stable",
        status: "completed",
        messages: [
          {
            id: "agent-stable",
            turnId: "turn-stable",
            role: "assistant",
            text: "Stable",
          },
        ],
      },
      {
        id: "turn-target",
        status: "completed",
        messages: [
          {
            id: "agent-target-before",
            turnId: "turn-target",
            role: "assistant",
            text: "Before",
          },
          {
            id: "agent-target-after",
            turnId: "turn-target",
            role: "assistant",
            text: "After",
          },
        ],
      },
    ] satisfies IncrementalChatTurnView[]);
  });
```

- [ ] **Step 4: Run the focused test and confirm it fails**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result: FAIL. The first two new tests should fail because `selectIncrementalChatTurns` currently builds a new `IncrementalChatTurnView[]` on every call.

---

### Task 2: Add Reducer-Maintained Turn Read Model State

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`

- [ ] **Step 1: Add read model fields to `IncrementalChatState`**

Update `IncrementalChatState`:

```ts
export type IncrementalChatState = {
  threadId: string | null;
  subscriptionId: string | null;
  turnsById: Record<string, IncrementalChatTurn>;
  turnOrder: string[];
  messagesById: Record<string, IncrementalChatMessage>;
  messagesByTurnId: Record<string, string[]>;
  turnViews: IncrementalChatTurnView[];
  turnViewIndexById: Record<string, number>;
  messageViewIndexById: Record<string, { turnId: string; index: number }>;
  globalStatus: IncrementalChatGlobalStatus[];
  appliedEventIds: string[];
};
```

- [ ] **Step 2: Add fields to `initialState`**

Update `initialState`:

```ts
const initialState: IncrementalChatState = {
  threadId: null,
  subscriptionId: null,
  turnsById: {},
  turnOrder: [],
  messagesById: {},
  messagesByTurnId: {},
  turnViews: [],
  turnViewIndexById: {},
  messageViewIndexById: {},
  globalStatus: [],
  appliedEventIds: [],
};
```

- [ ] **Step 3: Add fields to `createEmptyState`**

Update `createEmptyState`:

```ts
const createEmptyState = (): IncrementalChatState => ({
  threadId: null,
  subscriptionId: null,
  turnsById: {},
  turnOrder: [],
  messagesById: {},
  messagesByTurnId: {},
  turnViews: [],
  turnViewIndexById: {},
  messageViewIndexById: {},
  globalStatus: [],
  appliedEventIds: [],
});
```

- [ ] **Step 4: Copy read model fields in `resetState`**

Update `resetState`:

```ts
const resetState = (state: IncrementalChatState, nextState: IncrementalChatState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.turnsById = nextState.turnsById;
  state.turnOrder = nextState.turnOrder;
  state.messagesById = nextState.messagesById;
  state.messagesByTurnId = nextState.messagesByTurnId;
  state.turnViews = nextState.turnViews;
  state.turnViewIndexById = nextState.turnViewIndexById;
  state.messageViewIndexById = nextState.messageViewIndexById;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIds = nextState.appliedEventIds;
};
```

---

### Task 3: Update Turn Helpers To Maintain The Read Model

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`

- [ ] **Step 1: Add `syncTurnView` helper**

Add this helper after `resetState`:

```ts
const syncTurnView = (state: IncrementalChatState, turn: IncrementalChatTurn) => {
  const existingIndex = state.turnViewIndexById[turn.id];
  if (existingIndex != null) {
    const existingView = state.turnViews[existingIndex];
    if (existingView != null && existingView.status !== turn.status) {
      state.turnViews[existingIndex] = {
        ...existingView,
        status: turn.status,
      };
    }
    return;
  }

  state.turnViewIndexById[turn.id] = state.turnViews.length;
  state.turnViews.push({
    id: turn.id,
    status: turn.status,
    messages: [],
  });
};
```

- [ ] **Step 2: Update `ensureTurnExists`**

Replace `ensureTurnExists` with:

```ts
const ensureTurnExists = (state: IncrementalChatState, turnId: string): IncrementalChatTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    syncTurnView(state, existingTurn);
    return existingTurn;
  }

  const turn: IncrementalChatTurn = {
    id: turnId,
    status: "inProgress",
  };
  state.turnsById[turnId] = turn;
  if (!state.turnOrder.includes(turnId)) {
    state.turnOrder.push(turnId);
  }
  syncTurnView(state, turn);
  return turn;
};
```

- [ ] **Step 3: Update `upsertTurnFromPayload`**

Replace `upsertTurnFromPayload` with:

```ts
const upsertTurnFromPayload = (state: IncrementalChatState, turn: Turn) => {
  const existingTurn = state.turnsById[turn.id];
  if (existingTurn == null) {
    const nextTurn: IncrementalChatTurn = {
      id: turn.id,
      status: turn.status,
    };
    state.turnsById[turn.id] = nextTurn;
    if (!state.turnOrder.includes(turn.id)) {
      state.turnOrder.push(turn.id);
    }
    syncTurnView(state, nextTurn);
    return;
  }

  existingTurn.status = turn.status;
  syncTurnView(state, existingTurn);
};
```

---

### Task 4: Update Message Helpers To Maintain The Read Model

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`

- [ ] **Step 1: Add `removeMessageFromTurnView` helper**

Add this helper before `upsertMessage`:

```ts
const removeMessageFromTurnView = (
  state: IncrementalChatState,
  messageId: string,
  turnId: string,
) => {
  const turnViewIndex = state.turnViewIndexById[turnId];
  if (turnViewIndex == null) {
    return;
  }

  const turnView = state.turnViews[turnViewIndex];
  if (turnView == null) {
    return;
  }

  const messageViewIndex = state.messageViewIndexById[messageId];
  if (messageViewIndex == null || messageViewIndex.turnId !== turnId) {
    return;
  }

  state.turnViews[turnViewIndex] = {
    ...turnView,
    messages: turnView.messages.filter((message) => message.id !== messageId),
  };

  delete state.messageViewIndexById[messageId];

  const updatedTurnView = state.turnViews[turnViewIndex];
  if (updatedTurnView == null) {
    return;
  }

  for (let index = 0; index < updatedTurnView.messages.length; index += 1) {
    state.messageViewIndexById[updatedTurnView.messages[index].id] = {
      turnId,
      index,
    };
  }
};
```

- [ ] **Step 2: Add `upsertMessageIntoTurnView` helper**

Add this helper after `removeMessageFromTurnView`:

```ts
const upsertMessageIntoTurnView = (
  state: IncrementalChatState,
  message: IncrementalChatMessage,
) => {
  ensureTurnExists(state, message.turnId);

  const turnViewIndex = state.turnViewIndexById[message.turnId];
  if (turnViewIndex == null) {
    return;
  }

  const turnView = state.turnViews[turnViewIndex];
  if (turnView == null) {
    return;
  }

  const existingMessageIndex = state.messageViewIndexById[message.id];
  if (existingMessageIndex != null && existingMessageIndex.turnId === message.turnId) {
    const messages = [...turnView.messages];
    messages[existingMessageIndex.index] = message;
    state.turnViews[turnViewIndex] = {
      ...turnView,
      messages,
    };
    return;
  }

  state.messageViewIndexById[message.id] = {
    turnId: message.turnId,
    index: turnView.messages.length,
  };
  state.turnViews[turnViewIndex] = {
    ...turnView,
    messages: [...turnView.messages, message],
  };
};
```

- [ ] **Step 3: Update `upsertMessage`**

Replace `upsertMessage` with:

```ts
const upsertMessage = (state: IncrementalChatState, message: IncrementalChatMessage) => {
  const existingMessage = state.messagesById[message.id];
  if (existingMessage != null && existingMessage.turnId !== message.turnId) {
    const previousTurnMessages = state.messagesByTurnId[existingMessage.turnId];
    if (previousTurnMessages != null) {
      state.messagesByTurnId[existingMessage.turnId] = previousTurnMessages.filter(
        (messageId) => messageId !== message.id,
      );
    }
    removeMessageFromTurnView(state, message.id, existingMessage.turnId);
  }

  state.messagesById[message.id] = message;

  const turnMessages = state.messagesByTurnId[message.turnId] ?? [];
  if (!turnMessages.includes(message.id)) {
    turnMessages.push(message.id);
  }
  state.messagesByTurnId[message.turnId] = turnMessages;

  upsertMessageIntoTurnView(state, message);
};
```

---

### Task 5: Change Selector To Return The Prepared Read Model

**Files:**
- Modify: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`

- [ ] **Step 1: Replace `selectIncrementalChatTurns`**

Replace the selector implementation with:

```ts
    selectIncrementalChatTurns: (incrementalChatState): IncrementalChatTurnView[] =>
      incrementalChatState.turnViews,
```

Do not keep the old `turnOrder.flatMap(...)` implementation anywhere in this selector.

- [ ] **Step 2: Run the focused test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

Expected result: PASS.

---

### Task 6: Regression Scans And Focused Verification

**Files:**
- No source edits expected if prior tasks are complete.

- [ ] **Step 1: Confirm the selector no longer materializes from normalized maps**

Run:

```bash
rg -n "selectIncrementalChatTurns:.*flatMap|turnOrder\\.flatMap|messagesByTurnId.*flatMap|messagesById.*flatMap" codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts
```

Expected result: no matches.

- [ ] **Step 2: Confirm active chat still does not read replay/debug sources**

Run:

```bash
rg -n "selectThreadTimelineMaterials|TimelineMaterial|snapshotTurns|eventBuffer" codex-gui/src/features/incrementalChatState codex-gui/src/features/chatTextModel
```

Expected result: no matches in `incrementalChatState`. Existing matches in `chatTextModel` indicate the known separate `06a` rewrite issue and must not be addressed in this `05b` plan.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS for both focused test files.

- [ ] **Step 4: Run type-check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

- [ ] **Step 5: Check formatting-sensitive whitespace**

Run:

```bash
git diff --check -- codex-gui/src/features/incrementalChatState
```

Expected result: no output.

---

## Final Verification

Run only these focused checks:

```bash
pnpm --dir codex-gui exec vitest --run src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
pnpm --dir codex-gui run type-check
rg -n "selectIncrementalChatTurns:.*flatMap|turnOrder\\.flatMap|messagesByTurnId.*flatMap|messagesById.*flatMap" codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts
git diff --check -- codex-gui/src/features/incrementalChatState
```

Expected:

- Both Vitest commands pass.
- Type-check passes.
- The selector materialization `rg` command returns no matches.
- `git diff --check` prints no output.

Do not run the full test suite.
