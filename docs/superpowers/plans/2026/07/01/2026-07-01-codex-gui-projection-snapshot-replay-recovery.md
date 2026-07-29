# Codex GUI Projection Snapshot Replay Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex GUI recover when attach snapshot already contains a turn/item that later arrives again as a contiguous live projection event.

**Architecture:** Keep `ProjectionIngressAdapter` focused on commit-chain continuity. Add a frontend runtime replay classification to accepted projection events before Redux reducers consume them, then have runtime/transcript/timeline consumers skip UI side effects for `snapshotDuplicate` events. Do not modify app-server, cursor, projection cut, thread store, protocol, or core.

**Tech Stack:** React, Redux Toolkit, TypeScript, Vitest, codex-gui shared projection fixtures/builders.

---

## Preconditions

- Current branch must be `dev`.
- Read `codex-gui/AGENTS.md` before editing `codex-gui/**`.
- Do not stage or commit unless the user separately asks for it.
- Before every `pnpm` command in `codex-gui`, initialize the user's fnm environment per repo policy:
  - Run `/opt/homebrew/bin/fnm env --shell zsh`.
  - Apply the printed environment exports to the active shell.
  - Run `pnpm --version` and confirm it is not resolving from `/Users/jiangsheng/.cache/codex-runtimes/`.
- Existing package scripts verified in `codex-gui/package.json`: `test:unit`, `format:oxfmt`, `lint`, `type-check`, `ci`.

## Files

- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- Modify: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`

## Task 1: Lock In Ingress Continuity Behavior

**Files:**
- Modify: `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`

- [ ] **Step 1: Add a characterization test for snapshot-ahead, head-old replay**

Add this test after `ignores duplicate latest commit events`:

```ts
  it("accepts contiguous events already represented in the attach snapshot", () => {
    const adapter = new ProjectionIngressAdapter(projectionThreadId);
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const snapshotAheadWithOldHead = attachWithTurnsAndHead(
      [eventTurnStarted.event.notification.turn],
      eventTurnStarted.parentCommitId,
    );
    adapter.handleAttach(snapshotAheadWithOldHead);

    expect(adapter.handleEvent(eventTurnStarted)).toStrictEqual({
      type: "eventAccepted",
      notification: eventTurnStarted,
    });
  });
```

- [ ] **Step 2: Run the focused ingress test**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts
```

Expected: PASS. This test documents existing protocol behavior; no production change is expected in this task.

## Task 2: Add Runtime Replay Classification

**Files:**
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Update runtime tests for replay metadata**

In `threadRuntimeSlice.test.ts`, update existing event-buffer expectations to include `replay: "live"` for normal events.

For example, in `buffers turn lifecycle events and tracks the active turn`, expected buffer entries become:

```ts
    expect(completed.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
      { type: "projectionEvent", notification: eventTurnCompleted, replay: "live" },
    ]);
```

In `does not clear active turn when a different turn completes`, expected tail entry becomes:

```ts
    expect(state.current?.eventBuffer.at(-1)).toStrictEqual({
      type: "projectionEvent",
      notification: nonMatchingCompleted,
      replay: "live",
    });
```

In `buffers item events without upserting them into snapshot turns`, expected buffer entries become:

```ts
    expect(itemCompleted.current?.eventBuffer).toStrictEqual([
      { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
      { type: "projectionEvent", notification: eventItemStarted, replay: "live" },
      { type: "projectionEvent", notification: eventItemCompleted, replay: "live" },
    ]);
```

- [ ] **Step 2: Add runtime tests for snapshotDuplicate classification**

Add this import from projection test builders:

```ts
  itemCompleted,
  itemStarted,
  agentMessage,
```

Also import these helpers from `../threadRuntimeSlice`:

```ts
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
```

Then add these tests near the other buffer tests:

```ts
  it("marks live turn events already present in the attach snapshot as snapshot duplicates", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    const attached = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [eventTurnStarted.event.notification.turn]),
      ),
    );
    const replay = replayForProjectionEvent(
      snapshotReplayIndexFromTurns([eventTurnStarted.event.notification.turn]),
      eventTurnStarted,
    );

    const state = reduce(
      attached,
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay,
      }),
    );

    expect(replay).toBe("snapshotDuplicate");
    expect(state.current?.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
    expect(state.current?.eventBuffer).toStrictEqual([
      {
        type: "projectionEvent",
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      },
    ]);
  });

  it("marks live item events already present in the attach snapshot as snapshot duplicates", () => {
    const snapshotItem = agentMessage("agent-snapshot-duplicate", "Already in snapshot");
    const snapshotTurn = {
      ...eventTurnStarted.event.notification.turn,
      items: [snapshotItem],
    };
    const attached = reduce(
      undefined,
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [snapshotTurn]),
      ),
    );
    const duplicateStarted = itemStarted(
      eventItemStarted,
      "commit-started-snapshot-duplicate",
      eventTurnStarted.event.notification.turn.id,
      snapshotItem,
    );
    const duplicateCompleted = itemCompleted(
      eventItemCompleted,
      "commit-completed-snapshot-duplicate",
      eventTurnStarted.event.notification.turn.id,
      snapshotItem,
    );
    const snapshotReplayIndex = snapshotReplayIndexFromTurns([snapshotTurn]);

    const started = reduce(
      attached,
      threadRuntimeEventBuffered({
        notification: duplicateStarted,
        replay: replayForProjectionEvent(snapshotReplayIndex, duplicateStarted),
      }),
    );
    const completed = reduce(
      started,
      threadRuntimeEventBuffered({
        notification: duplicateCompleted,
        replay: replayForProjectionEvent(snapshotReplayIndex, duplicateCompleted),
      }),
    );

    expect(completed.current?.eventBuffer).toStrictEqual([
      {
        type: "projectionEvent",
        notification: duplicateStarted,
        replay: "snapshotDuplicate",
      },
      {
        type: "projectionEvent",
        notification: duplicateCompleted,
        replay: "snapshotDuplicate",
      },
    ]);
  });
```

The active-turn assertion intentionally expects the snapshot active turn to remain unchanged; `snapshotDuplicate` must not create a new active-turn transition.

- [ ] **Step 3: Run the focused runtime test and verify failure**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected before implementation: FAIL because `replay` does not exist and duplicate classification is not implemented.

- [ ] **Step 4: Implement runtime replay types and normalization**

In `threadRuntimeSlice.ts`, replace the current `ThreadRuntimeBufferedEvent` type with:

```ts
export type ThreadRuntimeEventReplay = "live" | "snapshotDuplicate";

export type ThreadRuntimeProjectionEventPayload = {
  notification: ThreadProjectionEventNotification;
  replay: ThreadRuntimeEventReplay;
};

export type ThreadRuntimeEventBufferedPayload =
  | ThreadProjectionEventNotification
  | ThreadRuntimeProjectionEventPayload;

export type ThreadRuntimeBufferedEvent = {
  type: "projectionEvent";
  notification: ThreadProjectionEventNotification;
  replay: ThreadRuntimeEventReplay;
};
```

Add these helpers near `activeTurnIdFromSnapshot`:

```ts
export type SnapshotReplayIndex = {
  turnIdsById: Record<string, true>;
  itemIdsById: Record<string, true>;
};

const idsById = (ids: string[]): Record<string, true> =>
  Object.fromEntries(ids.map((id) => [id, true])) as Record<string, true>;

export const snapshotReplayIndexFromTurns = (turns: Turn[]): SnapshotReplayIndex => ({
  turnIdsById: idsById(turns.map((turn) => turn.id)),
  itemIdsById: idsById(turns.flatMap((turn) => turn.items.map((item) => item.id))),
});

export const replayForProjectionEvent = (
  index: SnapshotReplayIndex,
  notification: ThreadProjectionEventNotification,
): ThreadRuntimeEventReplay => {
  switch (notification.event.type) {
    case "turnStarted":
    case "turnCompleted":
      return index.turnIdsById[notification.event.notification.turn.id] === true
        ? "snapshotDuplicate"
        : "live";
    case "itemStarted":
    case "itemCompleted":
      return index.itemIdsById[notification.event.notification.item.id] === true
        ? "snapshotDuplicate"
        : "live";
  }
};

export const normalizeThreadRuntimeEventPayload = (
  payload: ThreadRuntimeEventBufferedPayload,
): ThreadRuntimeProjectionEventPayload => {
  if ("notification" in payload) {
    return payload;
  }

  return {
    notification: payload,
    replay: "live",
  };
};
```

Add a private index to `ThreadRuntimeRecord`:

```ts
  snapshotReplayIndex: SnapshotReplayIndex;
```

When creating runtime state from attach, populate it:

```ts
          snapshotReplayIndex: snapshotReplayIndexFromTurns(snapshotTurns),
```

Update the existing runtime baseline test expected object to include:

```ts
      snapshotReplayIndex: snapshotReplayIndexFromTurns(snapshotTurns),
```

Change the event reducer payload type:

```ts
      (state, action: PayloadAction<ThreadRuntimeEventBufferedPayload>) => {
```

At the start of the event reducer, normalize the payload:

```ts
        const { notification, replay } = normalizeThreadRuntimeEventPayload(action.payload);
```

Push buffered entries with replay:

```ts
        runtime.eventBuffer.push({
          type: "projectionEvent",
          notification,
          replay,
        });
```

Skip active-turn side effects for duplicate replay events:

```ts
        if (replay === "snapshotDuplicate") {
          return;
        }
```

Then update the existing switch to read from `notification.event.type` instead of `action.payload.event.type`.

- [ ] **Step 5: Run the focused runtime test and verify pass**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected: PASS.

## Task 3: Dispatch Classified Events From The Bridge

**Files:**
- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Modify: `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- Modify: `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

- [ ] **Step 1: Classify accepted events before dispatch**

In `GuiHostConnectionBridge.tsx`, import the classifier helpers:

```ts
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
  type SnapshotReplayIndex,
```

from `@/features/threadRuntime/threadRuntimeSlice`.

Add a local variable inside `useEffect` alongside `projectionIngress`:

```ts
    let snapshotReplayIndex: SnapshotReplayIndex | null = null;
```

On launch params, reset it:

```ts
          snapshotReplayIndex = null;
```

On accepted attach, set it before dispatching the attach action:

```ts
          const outcome = projectionIngress.handleAttach(response);
          if (outcome.type === "attachAccepted") {
            snapshotReplayIndex = snapshotReplayIndexFromTurns(
              outcome.response.snapshot.thread.turns,
            );
          }

          dispatchProjectionOutcome(outcome);
```

Change the `eventAccepted` dispatch branch:

```ts
        case "eventAccepted":
          dispatch(
            threadRuntimeEventBuffered({
              notification: outcome.notification,
              replay:
                snapshotReplayIndex == null
                  ? "live"
                  : replayForProjectionEvent(snapshotReplayIndex, outcome.notification),
            }),
          );
          return;
```

This keeps replay classification in the frontend runtime path before parallel Redux reducers consume the action payload.

- [ ] **Step 2: Run TypeScript on the changed area**

Run from `codex-gui` after fnm setup:

```bash
pnpm run type-check
```

Expected: PASS.

## Task 4: Skip snapshotDuplicate In Transcript State

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Add transcript regression test**

In `transcriptStateLiveEvents.test.ts`, add a test near the scroll-key tests:

```ts
  it("ignores snapshot duplicate live items without changing transcript or scroll key", () => {
    const store = makeStore();
    const snapshotTurn = baseTurn("turn-snapshot-duplicate", [
      agentMessage("agent-snapshot-duplicate", "Already attached"),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate");
    const beforeEntry = selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-snapshot-duplicate",
          "turn-snapshot-duplicate",
          agentMessage("agent-snapshot-duplicate", "Live replay should be ignored"),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate")).toStrictEqual(
      beforeTurn,
    );
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate")).toStrictEqual(
      beforeEntry,
    );
  });
```

- [ ] **Step 2: Run focused transcript test and verify failure**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected before implementation: FAIL because `transcriptState` still processes the live event.

- [ ] **Step 3: Skip duplicate replay payloads in transcript reducer**

In `transcriptStateSlice.ts`, import the normalizer:

```ts
  normalizeThreadRuntimeEventPayload,
```

from `@/features/threadRuntime/threadRuntimeSlice`.

At the start of the `threadRuntimeEventBuffered` extra reducer, normalize and skip duplicates:

```ts
        const { notification, replay } = normalizeThreadRuntimeEventPayload(action.payload);
        if (replay === "snapshotDuplicate") {
          return;
        }

        if (state.threadId !== notification.threadId) {
          return;
        }

        if (hasAppliedEvent(state, notification.commitId)) {
          return;
        }

        recordAppliedEvent(state, notification.commitId);
```

Then replace the remaining `action.payload` reads in that reducer with `notification`.

- [ ] **Step 4: Run focused transcript test and verify pass**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

## Task 5: Skip snapshotDuplicate In Live Timeline Materials

**Files:**
- Modify: `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- Modify: `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`

- [ ] **Step 1: Update existing live material expected buffers**

Where tests assert raw `ThreadRuntimeBufferedEvent` arrays, include `replay: "live"` for normal events:

```ts
    const expectedBuffer = [
      { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
    ];
```

- [ ] **Step 2: Add live material duplicate-skip test**

Add this test near `derives live turn and item lifecycle material in event buffer order`:

```ts
  it("does not derive live material from snapshot duplicate events", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: eventTurnStarted,
        replay: "snapshotDuplicate",
      }),
    );

    expect(selectLiveEventMaterials(store.getState())).toStrictEqual([]);
    expect(selectThreadTimelineMaterials(store.getState())).toStrictEqual(
      selectSnapshotReplayMaterials(store.getState()),
    );
  });
```

- [ ] **Step 3: Run focused live material test and verify failure**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected before implementation: FAIL because duplicate replay events are still mapped to live materials.

- [ ] **Step 4: Filter duplicate replay events**

In `liveEventHandling.ts`, update `buildLiveEventMaterials`:

```ts
export const buildLiveEventMaterials = (
  runtime: ThreadRuntimeRecord | null,
): LiveEventMaterial[] => {
  if (runtime == null) {
    return [];
  }

  return runtime.eventBuffer
    .filter((bufferedEvent) => bufferedEvent.replay === "live")
    .map(liveMaterialFromBufferedEvent);
};
```

- [ ] **Step 5: Run focused live material test and verify pass**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected: PASS.

## Task 6: Final Frontend Verification

**Files:**
- Verify modified `codex-gui/**` files only.

- [ ] **Step 1: Run focused unit tests**

Run from `codex-gui` after fnm setup:

```bash
pnpm run test:unit -- src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/liveEventHandling/__tests__/liveEventHandling.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type-check**

Run from `codex-gui` after fnm setup:

```bash
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run formatter check**

Run from `codex-gui` after fnm setup:

```bash
pnpm run format:oxfmt
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run from `codex-gui` after fnm setup:

```bash
pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Check diff whitespace**

Run from repo root:

```bash
git diff --check
```

Expected: no output.

## Self-Review Checklist

- Spec coverage:
  - Ingress remains protocol-only: Task 1.
  - Attach snapshot initial semantic index: Task 2 and Task 3.
  - Runtime buffer replay classification: Task 2.
  - Consumers skip `snapshotDuplicate`: Task 4 and Task 5.
  - Frontend-only verification: Task 6.
- Scope guard:
  - No Rust, app-server, protocol, cursor, thread-store, or core changes.
  - No automatic reconnect.
  - No staging or committing without separate user approval.
