# Thread Runtime Store Decision Draft

> Draft only. This file records the current brainstorming decisions before writing the formal
> `03-thread-runtime-store/design.md`.

## Context

`03 Thread Runtime Store` sits after `02 Projection Ingress Adapter` and before `04 Snapshot Replay`
and `05 Live Event Handling`.

The store must not treat the temporary `projectionSlice` as the design source of truth. The design
must align with the TUI model, especially the split between:

- `ThreadEventStore`, which owns per-thread runtime material, buffered notifications, and
  `active_turn_id`.
- `ChatWidget`, which interprets replay/live notifications into rendered chat behavior.

## Confirmed Decisions

### 1. Runtime Store State Boundary

Decision: use a minimal runtime record.

The first runtime store should own the current single-session runtime facts, not a chat view model:

- current thread identity
- session/thread metadata
- snapshot turns
- active turn id
- subscription state
- material needed for replay/live phases

Rejected alternatives:

- Normalized maps in `03`: too much up-front structure for live handling.
- Pure input log only: too weak to serve as a runtime foundation for `04`.

### 2. Temporary `projectionSlice` Replacement Window

Decision: create a new `threadRuntimeSlice` in `03`, while allowing the existing `projectionSlice`
to remain temporarily for compatibility.

The formal design must state that `projectionSlice` is not the truth model and must be deleted
within this window:

- earliest: `04 Snapshot Replay`
- latest: `05 Live Event Handling`

It must not survive into chat surface work.

### 3. Attach Snapshot Baseline

Decision: `attachAccepted` establishes a runtime baseline.

On accepted attach, runtime should store the attached thread and snapshot turns, and derive
`activeTurnId` from the last turn whose status is `inProgress`.

This only establishes runtime state. It must not trigger replay side effects or derive a chat view
model in `03`.

### 5. Manual Reconnect State

Decision: use a discriminated union instead of separate state and reason fields.

```ts
type ThreadRuntimeSubscription =
  | { state: "active" }
  | {
      state: "manualReconnectRequired";
      reason: "commitChainMismatch" | "missingTurn" | "backpressure";
      subscriptionId: string | null;
    };
```

Entering `manualReconnectRequired` should block later accepted events from mutating runtime state.
A new accepted attach rebuilds the baseline and restores `{ state: "active" }`.

### 6. Test Boundary

Decision: use reducer tests plus an App browser wiring test.

Reducer tests should cover:

- attach baseline creation
- `activeTurnId` derived from snapshot turns
- accepted event buffering and active-turn updates
- manual reconnect subscription state
- event blocking after manual reconnect
- new attach resetting the subscription state

App browser wiring should prove that `02` outcomes are connected to the runtime store. It should not
add visible UI requirements.

## Decision 4 Needs Revision

Earlier tentative decision: apply accepted projection events by upserting turns and items directly
in `03`.

TUI alignment check found this is likely too close to the temporary `projectionSlice` model and not
close enough to real TUI behavior.

TUI reference:

- `ThreadEventStore::push_notification` stores notifications in a per-thread buffer and updates
  `active_turn_id`.
- `TurnStarted` sets `active_turn_id`.
- `TurnCompleted` clears `active_turn_id` only when it completes the currently active turn.
- `ItemStarted` and `ItemCompleted` are buffered as notifications; their rendering and semantic
  interpretation happen later through `ChatWidget::handle_server_notification`.

Recommended revised decision:

```ts
type ThreadRuntimeRecord = {
  threadId: string;
  sessionId: string;
  thread: Thread;
  snapshotTurns: Turn[];
  liveEvents: ThreadProjectionEventNotification[];
  activeTurnId: string | null;
  subscription: ThreadRuntimeSubscription;
};
```

Revised event handling proposal:

- `turnStarted`: append to `liveEvents`, set `activeTurnId`.
- `turnCompleted`: append to `liveEvents`, clear `activeTurnId` only if it matches the current active
  turn.
- `itemStarted`: append to `liveEvents`; do not upsert item into turns in `03`.
- `itemCompleted`: append to `liveEvents`; do not upsert item into turns in `03`.

This makes `03` closer to TUI `ThreadEventStore`. `04 Snapshot Replay` and `05 Live Event Handling`
then own interpretation of snapshot turns and live events, closer to the TUI `ChatWidget` boundary.

Pending confirmation: replace previous decision 4 with this TUI-aligned buffer model.

## Open Questions Before Formal Design

1. Confirm revised decision 4.
2. Decide whether `liveEvents` should be named `eventBuffer`, `liveEventBuffer`, or
   `projectionEventBuffer`.
3. Decide whether runtime stores a full `thread: Thread` plus `snapshotTurns`, or stores thread
   metadata without `turns` plus `snapshotTurns` separately to avoid duplicate turn ownership.
