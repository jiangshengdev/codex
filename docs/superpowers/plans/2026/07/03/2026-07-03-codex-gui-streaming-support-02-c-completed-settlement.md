# GUI Completed Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `itemCompleted(agentMessage)` settle the existing transcript live slot while preserving completed transcript materialization as the authoritative history path.

**Architecture:** Keep ownership inside `transcriptStateSlice.ts`. `itemStarted` and delta continue to update transient live state; `itemCompleted` now first settles an existing `turnId + item.id` live slot, then uses the existing `materializeTranscriptItem()` and `upsertLiveCommittedEntry()` path for committed transcript state. Missing live slots still do not create `slotOrder` entries.

**Tech Stack:** React 19, Redux Toolkit, TypeScript, Vitest unit tests in `codex-gui`.

---

## Execution Preflight

Before running any `pnpm` command in `codex-gui`, initialize the user's fnm environment and confirm `pnpm` is not coming from the Codex runtime cache:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
which pnpm
pnpm --version
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- `pnpm --version` prints the project pnpm version available through the user's fnm environment.

The relevant verified scripts are in `codex-gui/package.json`:

- `pnpm run test:unit`
- `pnpm run type-check`
- `pnpm run ci`

## File Structure

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add a focused `settleLiveSlotIfPresent()` helper near the existing live slot helpers.
  - Call it in the existing `itemCompleted` reducer branch before committed materialization.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Add reducer tests for streaming-to-completed settlement, missing-slot behavior, and non-materialized completed agent messages.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
  - Add a selector cache regression proving completed settlement bumps the live slot revision and rebuilds the live item view.

No changes are expected in projection ingress, thread runtime, committed transcript surface, Markdown rendering, browser tests, app-server protocol, or Rust code.

### Task 1: Settle Live Slot In The Completed Reducer

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Add failing tests for completed settlement**

Add these tests inside the existing `describe("transcript state live events reducer", ...)` block in `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, near the current completed materialization tests:

```ts
  it("settles an existing streaming live slot from itemCompleted while preserving transient text", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-settled", "");
    const completedItem = agentMessage("agent-settled", "Completed answer", "final_answer");

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-settled-started",
          "turn-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-settled",
          "agent-settled",
          "Partial",
        ),
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-settled-completed",
          "turn-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(selectTranscriptLiveItem(store.getState(), "turn-settled", "agent-settled")).toStrictEqual({
      key: "turn-settled:agent-settled",
      turnId: "turn-settled",
      itemId: "agent-settled",
      status: "completed",
      initialItem,
      transientText: "Partial",
      completedItem,
      revision: 2,
    });
    expect(selectTranscriptEntry(store.getState(), "agent-settled")).toStrictEqual({
      type: "message",
      id: "agent-settled",
      turnId: "turn-settled",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("does not create a live slot when itemCompleted arrives without itemStarted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-missing-slot-completed",
          "turn-missing-slot-completed",
          agentMessage("agent-missing-slot-completed", "Committed without live slot"),
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItemsForTurn(store.getState(), "turn-missing-slot-completed"),
    ).toStrictEqual([]);
    expect(selectTranscriptEntry(store.getState(), "agent-missing-slot-completed")).toStrictEqual({
      type: "message",
      id: "agent-missing-slot-completed",
      turnId: "turn-missing-slot-completed",
      role: "assistant",
      source: "Committed without live slot",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
  });

  it("settles an existing live slot even when the completed agent message is not materialized", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-empty-settled", "");
    const completedItem = agentMessage("agent-empty-settled", "");
    const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-empty-settled-started",
          "turn-empty-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-empty-settled-completed",
          "turn-empty-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    expect(
      selectTranscriptLiveItem(store.getState(), "turn-empty-settled", "agent-empty-settled"),
    ).toStrictEqual({
      key: "turn-empty-settled:agent-empty-settled",
      turnId: "turn-empty-settled",
      itemId: "agent-empty-settled",
      status: "completed",
      initialItem,
      transientText: "",
      completedItem,
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), "agent-empty-settled")).toBeNull();
    expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
  });
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: FAIL. The new tests should show the selected live item still has `status: "streaming"` or `status: "started"` and `completedItem: null`.

- [ ] **Step 3: Add the live slot settlement helper**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, add this helper after `appendAgentMessageDeltaToLiveSlot(...)`:

```ts
const settleLiveSlotIfPresent = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const slot = state.liveSlotsByKey[liveSlotKey(turnId, item.id)];
  if (slot == null) {
    return;
  }

  slot.status = "completed";
  slot.completedItem = item;
  slot.revision += 1;
};
```

- [ ] **Step 4: Call settlement from the `itemCompleted` branch**

In the `case "itemCompleted"` branch in `transcriptStateSlice.ts`, update the branch to settle before materializing:

```ts
          case "itemCompleted": {
            const { item, turnId } = notification.event.notification;
            ensureTurnExists(state, turnId);
            settleLiveSlotIfPresent(state, turnId, item);
            const entry = materializeTranscriptItem(item, turnId);
            if (entry != null) {
              upsertLiveCommittedEntry(state, entry);
              state.committedScrollCommitKey = `event:${notification.commitId}`;
            }
            return;
          }
```

Do not create a live slot in this branch. Do not modify `slotOrder`. Do not clear `transientText`. Do not move committed transcript materialization into a different action.

- [ ] **Step 5: Run the targeted tests and verify they pass**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS for `transcriptStateLiveEvents.test.ts`.

- [ ] **Step 6: Commit Task 1**

Stage only the files for this task and inspect the staged diff:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git diff --cached --stat
git diff --cached -- codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git commit -m "feat(gui): settle completed live transcript slots"
```

Expected: one local commit containing only the reducer change and live-events tests.

### Task 2: Cover Completed Settlement Selector Cache

**Files:**

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

- [ ] **Step 1: Add the failing selector cache regression**

Add this test inside `describe("transcript state selector cache", ...)` in `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`, after the existing live item cache tests:

```ts
  it("returns a new live item view when itemCompleted settles an existing slot", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    const initialItem = agentMessage("agent-live-cache-settled", "");
    const completedItem = agentMessage(
      "agent-live-cache-settled",
      "Completed cache answer",
      "final_answer",
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          "commit-live-cache-settled-started",
          "turn-live-cache-settled",
          initialItem,
        ),
        replay: "live",
      }),
    );

    const beforeSettlement = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-settled",
    );

    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          "commit-live-cache-settled-completed",
          "turn-live-cache-settled",
          completedItem,
        ),
        replay: "live",
      }),
    );

    const afterSettlement = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-settled",
    );

    expect(afterSettlement).not.toBe(beforeSettlement);
    expect(afterSettlement).toStrictEqual([
      {
        key: "turn-live-cache-settled:agent-live-cache-settled",
        turnId: "turn-live-cache-settled",
        itemId: "agent-live-cache-settled",
        status: "completed",
        initialItem,
        transientText: "",
        completedItem,
        revision: 1,
      },
    ]);
  });
```

- [ ] **Step 2: Run the selector cache test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: PASS if Task 1 is already implemented. If run before Task 1, this test should fail because completed settlement does not update the live slot revision.

- [ ] **Step 3: Run both transcriptState focused test files together**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: PASS for both files.

- [ ] **Step 4: Run type-check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Stage only the selector cache test and inspect the staged diff:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
git diff --cached --stat
git diff --cached -- codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
git commit -m "test(gui): cover completed live slot selector cache"
```

Expected: one local commit containing only the selector cache regression test.

## Final Verification

After both tasks are committed, run the focused verification again:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
pnpm run type-check
```

Expected: both commands PASS.

Optional broader verification if the focused checks pass and runtime is available:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run ci
```

Expected: PASS. `pnpm run ci` is broader than the 02c data-layer change and may surface unrelated failures; do not expand the implementation scope without a separate diagnosis.

## Self-Review Checklist

- Spec coverage:
  - Existing slot is settled to `completed`: Task 1.
  - `completedItem` is authoritative while `transientText` is preserved: Task 1.
  - Missing slot does not create `slotOrder` but still writes committed transcript: Task 1.
  - Non-materialized completed item can still settle slot without scroll-key changes: Task 1.
  - Selector cache invalidates when slot revision changes: Task 2.
- Scope check:
  - No UI, Markdown renderer, projection ingress, thread runtime, app-server, or Rust changes.
  - Cleanup and reconnect behavior remain deferred to 02d.
- Command check:
  - Every project command in this plan maps to a script present in `codex-gui/package.json`.
