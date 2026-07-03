# GUI Live Item 02d Attach Snapshot Reconnect Replay Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused reducer regression coverage for the 02d live item data-layer rules around attach replacement, snapshot duplicate replay, reconnect, and missing transient delta convergence.

**Architecture:** The current production reducer shape already matches the 02d design: attach rebuilds `transcriptState` from an empty state, `snapshotDuplicate` projection events return before side effects, delta only appends to an existing live slot, and manual reconnect only sets global interrupted status. This plan locks those invariants with two narrow `transcriptState` reducer tests and keeps production changes limited to any minimal fix required by a failing test.

**Tech Stack:** Codex GUI, Redux Toolkit slice tests, Vitest, shared projection fixtures and builders from `src/features/projection/__tests__`.

---

## Context

Design spec:

- `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-d-attach-snapshot-reconnect-replay-convergence-design.md`

Relevant existing implementation:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - `rebuildFromSnapshot()` creates a fresh empty state, rebuilds committed transcript entries from snapshot items, then `resetState()` replaces all transcript state.
  - `threadRuntimeEventBuffered` returns immediately when `replay === "snapshotDuplicate"`.
  - `threadRuntimeDeltaAccepted` updates only an existing live slot.
  - `threadRuntimeManualReconnectRequired` writes `globalStatus` only.

Important repo rules for execution:

- Before running `pnpm` in `/Users/jiangsheng/cnb/codex/codex-gui`, initialize fnm with `/opt/homebrew/bin/fnm env --shell zsh`.
- After initialization, confirm `pnpm --version` and `which pnpm`; stop if `which pnpm` points under `/Users/jiangsheng/.cache/codex-runtimes/`.
- Use shared legal projection fixtures/builders from `src/features/projection/__tests__/projectionFixtures.ts` and `src/features/projection/__tests__/projectionTestBuilders.ts`.
- Commit at the end of each task after its focused verification passes.

## File Structure

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Responsibility: live projection event and delta behavior for `transcriptState`, including duplicate replay suppression.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
  - Responsibility: manual reconnect and attach replacement behavior for `transcriptState`.
- Modify only if a new test fails: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Responsibility: minimal reducer fix preserving 02d invariants.

No browser/UI test is required for this step because 02d is a data-layer convergence rule, not a visual rendering rule.

## Task 1: Cover Snapshot Duplicate Item Replay Suppression

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Add the failing test**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, add this test near the existing `snapshotDuplicate` test:

```ts
  it("ignores snapshot duplicate itemStarted and itemCompleted without touching live slots", () => {
    const store = makeStore();
    const snapshotItem = agentMessage("agent-snapshot-duplicate-live", "Already attached");
    const snapshotTurn = baseTurn("turn-snapshot-duplicate-live", [snapshotItem]);

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [snapshotTurn])));
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
    const beforeTurn = selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live");
    const beforeEntry = selectTranscriptEntry(
      store.getState(),
      "agent-snapshot-duplicate-live",
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-duplicate-started",
          "turn-snapshot-duplicate-live",
          snapshotItem,
        ),
        replay: "snapshotDuplicate",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-duplicate-completed",
          "turn-snapshot-duplicate-live",
          agentMessage("agent-snapshot-duplicate-live", "Replay ignored"),
        ),
        replay: "snapshotDuplicate",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-snapshot-duplicate-live"),
    ).toStrictEqual([]);
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot-duplicate-live")).toStrictEqual(
      beforeTurn,
    );
    expect(selectTranscriptEntry(store.getState(), "agent-snapshot-duplicate-live")).toStrictEqual(
      beforeEntry,
    );
  });
```

- [ ] **Step 2: Run the focused test file**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- The focused test file passes if production code already matches 02d.
- If it fails, the failure should show a live slot, committed entry, turn, or scroll key changed by a `snapshotDuplicate` item event.

- [ ] **Step 3: Apply the minimal reducer fix only if the test fails**

If the new test fails because `snapshotDuplicate` events mutate transcript state, keep this early return before thread, commit, or event-type side effects in `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`:

```ts
        if (replay === "snapshotDuplicate") {
          return;
        }
```

The return must remain before:

```ts
        if (state.threadId !== notification.threadId) {
          return;
        }

        if (hasAppliedEvent(state, notification.commitId)) {
          return;
        }

        recordAppliedEvent(state, notification.commitId);
```

Do not create a live slot from a snapshot duplicate `itemStarted`. Do not settle a live slot from a snapshot duplicate `itemCompleted`.

- [ ] **Step 4: Re-run the focused test file**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected:

- `src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts` passes.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git diff --cached --stat
git commit -m "test(gui): cover snapshot duplicate live slot suppression"
```

Expected:

- The staged diff contains the new duplicate item replay test.
- `transcriptStateSlice.ts` is staged only if Step 3 required a production fix.
- One local commit is created for Task 1.

## Task 2: Cover Manual Reconnect And Attach Replacement Live Slot Boundary

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Update imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`, update imports to include the additional fixtures, actions, selectors, and builders.

The projection fixtures import should include:

```ts
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

The runtime action import should include:

```ts
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

The transcript selector import should include:

```ts
import {
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";
```

The projection builder import should include:

```ts
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Add the failing test**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`, add this test in the existing `describe("transcript state reconnect reducer", ...)` block:

```ts
  it("preserves live slots during manual reconnect and clears them on replacement attach", () => {
    const store = makeStore();
    const initialItem = agentMessage("agent-reconnect-live", "");
    const completedItem = agentMessage("agent-reconnect-live", "Completed before reconnect");

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-reconnect-started",
          "turn-reconnect-live",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-reconnect-live",
          "agent-reconnect-live",
          "Partial",
        ),
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-reconnect-completed",
          "turn-reconnect-live",
          completedItem,
        ),
        replay: "live",
      }),
    );

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachBaseline.snapshot.thread.id,
        subscriptionId: attachBaseline.subscriptionId,
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-reconnect-live", "agent-reconnect-live"),
    ).toMatchObject({
      status: "completed",
      transientText: "Partial",
      completedItem,
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachBaseline.snapshot.thread.id}:${attachBaseline.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachBaseline.subscriptionId,
      },
    ]);

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-after-reconnect", [
            agentMessage("agent-after-reconnect", "After reconnect"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-reconnect-live")).toStrictEqual(
      [],
    );
    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-after-reconnect"),
    ).toStrictEqual([]);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), "agent-after-reconnect")).toStrictEqual({
      type: "message",
      id: "agent-after-reconnect",
      turnId: "turn-after-reconnect",
      role: "assistant",
      source: "After reconnect",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });
```

- [ ] **Step 3: Run the focused test file**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- The focused test file passes if production code already matches 02d.
- If it fails before replacement attach, manual reconnect is incorrectly clearing live slots.
- If it fails after replacement attach, attach rebuild is incorrectly retaining old live slots or creating snapshot live slots.

- [ ] **Step 4: Apply the minimal reducer fix only if the test fails**

If manual reconnect clears live slots, keep the `threadRuntimeManualReconnectRequired` reducer limited to `globalStatus`:

```ts
        state.globalStatus = [
          {
            id: `subscriptionInterrupted:${action.payload.threadId}:${action.payload.subscriptionId ?? "none"}:${action.payload.reason}`,
            status: "subscriptionInterrupted",
            reason: action.payload.reason,
            subscriptionId: action.payload.subscriptionId,
          },
        ];
```

Do not delete from `liveTurnsById` or `liveSlotsByKey` in the manual reconnect reducer.

If attach replacement retains old live slots or creates snapshot live slots, keep `rebuildFromSnapshot()` based on a fresh empty state:

```ts
  const nextState = createEmptyState();
```

Snapshot items should only flow through:

```ts
      const entry = materializeTranscriptItem(item, turn.id);
      if (entry != null) {
        appendBaselineEntry(nextState, entry);
      }
```

Do not call `upsertStartedLiveSlot()` or `settleLiveSlotIfPresent()` while rebuilding from snapshot.

- [ ] **Step 5: Re-run the focused test file**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected:

- `src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts` passes.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git diff --cached --stat
git commit -m "test(gui): cover reconnect live slot cleanup boundary"
```

Expected:

- The staged diff contains the new reconnect/attach replacement live slot boundary test.
- `transcriptStateSlice.ts` is staged only if Step 4 required a production fix.
- One local commit is created for Task 2.

## Final Verification

- [ ] **Step 1: Run both focused reducer test files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected:

- Both focused reducer test files pass.

- [ ] **Step 2: Run frontend formatting check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm run format:oxfmt
```

Expected:

- `format:oxfmt` passes.

- [ ] **Step 3: Run scoped ESLint on changed files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm run lint:eslint -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected:

- ESLint passes for the changed test files.

- [ ] **Step 4: Inspect final status**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git status --short
git log --oneline -2
```

Expected:

- Working tree is clean after the task commits.
- The two newest commits correspond to Task 1 and Task 2, unless one task required no changes and was intentionally skipped with an explanation in the final report.

## Self-Review

- Spec coverage:
  - Attach replacement clears live slots and global status: Task 2.
  - Snapshot duplicate item events have no live slot or committed transcript side effects: Task 1.
  - Reconnect does not recover transient delta and waits for completed/snapshot authority: existing missing-delta and missing-slot tests plus Task 2 boundary coverage.
  - Settled live slots remain until attach replacement: Task 2.
- Placeholder scan:
  - The plan contains concrete paths, commands, test bodies, expected outcomes, and commit boundaries.
- Type consistency:
  - Test snippets use existing builders: `agentMessage`, `agentMessageDelta`, `attachWithTurns`, `baseTurn`, `itemStarted`, and `itemCompleted`.
  - Test snippets use existing selectors and actions from `transcriptStateSlice` and `threadRuntimeSlice`.
