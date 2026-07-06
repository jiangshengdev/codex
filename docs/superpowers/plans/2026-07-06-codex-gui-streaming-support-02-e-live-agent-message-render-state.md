# GUI Streaming Support 02e Live Agent Message Render State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live agent message data-layer read-time materialization with reducer-maintained render state and O(1) live item selectors.

**Architecture:** `transcriptState` will store live agent message render arrays directly by `turnId` and maintain an index map for `turnId:itemId` lookup. `itemStarted` appends a renderable live item, accepted agent message delta mutates that existing item, and `itemCompleted` writes the committed transcript entry then removes the live item from the live list.

**Tech Stack:** TypeScript, Redux Toolkit slice reducers, Vitest unit tests, codex-gui projection fixtures/builders.

---

## Context

Design spec:

- `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/02-e-live-agent-message-render-state-design.md`

This plan supersedes the conflicting implementation details from the earlier `02a` through `02d` plans:

- Do not keep `liveTurnsById + liveSlotsByKey` as the final live agent message store shape.
- Do not use `selectCachedLiveItemsForTurn()` to materialize renderable live items at read time.
- Do not keep completed live slots as a long-lived data state.
- Do not expand this work to command output, exec output, tool output, thinking, Streamdown, or visual transitions.

Important repo rules for execution:

- Before editing files under `codex-gui/**`, read `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`.
- Before running `pnpm` in `/Users/jiangsheng/cnb/codex/codex-gui`, initialize fnm with `/opt/homebrew/bin/fnm env --shell zsh`.
- After initialization, run `pnpm --version` and `which pnpm`; stop if `which pnpm` points under `/Users/jiangsheng/.cache/codex-runtimes/`.
- Use shared legal projection fixtures/builders from `src/features/projection/__tests__/projectionFixtures.ts` and `src/features/projection/__tests__/projectionTestBuilders.ts`.
- Commit at the end of each task after its focused verification passes.

## File Structure

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Owns the live agent message render state, reducers, and selectors.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Owns reducer behavior tests for started, streaming, completed, duplicate, and missing-slot cases.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
  - Owns selector reference behavior tests. The live-item tests should describe store-owned arrays, not a selector-side cache.
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
  - Owns attach/manual reconnect behavior. Completed live slots should no longer be expected after settlement.

No browser/UI test is required for this plan because 02e changes only the data layer contract. Rendering and transition behavior belongs to a later design.

## Task 1: Lock the 02e reducer semantics with failing tests

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`

- [ ] **Step 1: Read codex-gui local instructions**

Run:

```zsh
sed -n '1,240p' /Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md
```

Expected: instructions are read before touching `codex-gui/**` files.

- [ ] **Step 2: Change the completed-settlement live event expectation**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, find the test that currently asserts a completed live slot after `itemCompleted`. Replace its live-slot assertion with this 02e expectation:

```ts
    expect(selectTranscriptLiveItem(store.getState(), "turn-settled", "agent-settled")).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-settled")).toStrictEqual([]);
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
```

If the existing test name says the live slot is settled or completed, rename it to:

```ts
it("removes the live item after committing the completed agent message", () => {
```

- [ ] **Step 3: Change the empty completed-item live event expectation**

In the same file, find the test that completes an empty agent message and currently expects a completed live slot. Replace the live-slot assertion with:

```ts
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-empty-settled", "agent-empty-settled"),
    ).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-empty-settled")).toStrictEqual(
      [],
    );
    expect(selectTranscriptEntry(store.getState(), "agent-empty-settled")).toBeNull();
```

If the existing test name says empty completed items settle live slots, rename it to:

```ts
it("removes the live item after an empty completed agent message without committing an entry", () => {
```

- [ ] **Step 4: Change the reconnect test expectation**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`, update the test named:

```ts
it("preserves live slots during manual reconnect and clears them on replacement attach", () => {
```

Rename it to:

```ts
it("keeps committed transcript during manual reconnect after live item settlement", () => {
```

Replace the assertion that currently expects a completed live item with:

```ts
    expect(
      selectTranscriptLiveItem(store.getState(), "turn-reconnect-live", "agent-reconnect-live"),
    ).toBeNull();
    expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-reconnect-live")).toStrictEqual(
      [],
    );
    expect(selectTranscriptEntry(store.getState(), "agent-reconnect-live")).toStrictEqual({
      type: "message",
      id: "agent-reconnect-live",
      turnId: "turn-reconnect-live",
      role: "assistant",
      source: "Completed before reconnect",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 0,
    });
```

Keep the existing `selectTranscriptGlobalStatus(...)` assertion after manual reconnect.

- [ ] **Step 5: Run the focused tests and verify they fail**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected:

- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.
- Tests fail because current production code keeps completed live slots instead of removing live items after `itemCompleted`.

- [ ] **Step 6: Keep the failing-test diff uncommitted**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git status --short -- codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected: the two test files are modified and unstaged. Do not commit failing tests separately; Task 2 commits the failing tests together with the production fix once the focused tests pass.

## Task 2: Replace live slot state with reducer-maintained live render state

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Replace live store types**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, replace:

```ts
export type TranscriptLiveSlotStatus = "started" | "streaming" | "completed";

export type TranscriptLiveSlot = {
  key: string;
  turnId: string;
  itemId: string;
  initialItem: ThreadItem;
  status: TranscriptLiveSlotStatus;
  transientText: string;
  completedItem: ThreadItem | null;
  revision: number;
};

export type TranscriptLiveTurn = {
  id: string;
  slotOrder: string[];
  revision: number;
};
```

with:

```ts
export type TranscriptLiveItemStatus = "started" | "streaming";

export type TranscriptLiveItemIndex = {
  turnId: string;
  index: number;
};
```

Update `TranscriptRenderableLiveItem` so `status` uses `TranscriptLiveItemStatus` and remove `completedItem`:

```ts
export type TranscriptRenderableLiveItem = {
  key: string;
  turnId: string;
  itemId: string;
  status: TranscriptLiveItemStatus;
  initialItem: ThreadItem;
  transientText: string;
  revision: number;
};
```

- [ ] **Step 2: Replace state fields**

In `TranscriptState`, replace:

```ts
liveTurnsById: Record<string, TranscriptLiveTurn>;
liveSlotsByKey: Record<string, TranscriptLiveSlot>;
```

with:

```ts
liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>;
liveItemIndexByKey: Record<string, TranscriptLiveItemIndex>;
```

In `initialState` and `createEmptyState`, replace:

```ts
liveTurnsById: {},
liveSlotsByKey: {},
```

with:

```ts
liveItemsByTurnId: {},
liveItemIndexByKey: {},
```

In `resetState`, replace:

```ts
state.liveTurnsById = nextState.liveTurnsById;
state.liveSlotsByKey = nextState.liveSlotsByKey;
```

with:

```ts
state.liveItemsByTurnId = nextState.liveItemsByTurnId;
state.liveItemIndexByKey = nextState.liveItemIndexByKey;
```

- [ ] **Step 3: Remove selector-side live cache types**

Delete these declarations:

```ts
type TranscriptLiveTurnViewCacheEntry = {
  revision: number;
  slotKeys: string[];
  slotRevisions: number[];
  view: TranscriptRenderableLiveItem[];
};

const transcriptLiveTurnViewCache = new WeakMap<
  TranscriptLiveTurn,
  TranscriptLiveTurnViewCacheEntry
>();
```

Delete the entire `selectCachedLiveItemsForTurn(...)` helper. The live item list is now maintained by reducer writes, not selector reads.

- [ ] **Step 4: Add reducer-write helpers**

Replace `liveSlotKey`, `ensureLiveTurnExists`, `upsertStartedLiveSlot`, `appendAgentMessageDeltaToLiveSlot`, and `settleLiveSlotIfPresent` with these helpers:

```ts
const EMPTY_LIVE_ITEMS: TranscriptRenderableLiveItem[] = [];

const liveItemKey = (turnId: string, itemId: string): string => `${turnId}:${itemId}`;

const ensureLiveItemsForTurn = (
  state: TranscriptState,
  turnId: string,
): TranscriptRenderableLiveItem[] => {
  const existingItems = state.liveItemsByTurnId[turnId];
  if (existingItems != null) {
    return existingItems;
  }

  const items: TranscriptRenderableLiveItem[] = [];
  state.liveItemsByTurnId[turnId] = items;
  return items;
};

const appendStartedLiveItem = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const key = liveItemKey(turnId, item.id);
  if (state.liveItemIndexByKey[key] != null) {
    return;
  }

  const items = ensureLiveItemsForTurn(state, turnId);
  state.liveItemIndexByKey[key] = { turnId, index: items.length };
  items.push({
    key,
    turnId,
    itemId: item.id,
    initialItem: item,
    status: "started",
    transientText: "",
    revision: 0,
  });
};

const liveItemForKey = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null => {
  const key = liveItemKey(turnId, itemId);
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex == null || itemIndex.turnId !== turnId) {
    return null;
  }

  return state.liveItemsByTurnId[turnId]?.[itemIndex.index] ?? null;
};

const appendAgentMessageDeltaToLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  delta: string,
) => {
  const item = liveItemForKey(state, turnId, itemId);
  if (item == null) {
    return;
  }

  item.transientText += delta;
  item.status = "streaming";
  item.revision += 1;
};

const removeLiveItemIfPresent = (state: TranscriptState, turnId: string, itemId: string) => {
  const key = liveItemKey(turnId, itemId);
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex == null || itemIndex.turnId !== turnId) {
    return;
  }

  const items = state.liveItemsByTurnId[turnId];
  if (items == null || itemIndex.index >= items.length) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return;
  }

  items.splice(itemIndex.index, 1);
  Reflect.deleteProperty(state.liveItemIndexByKey, key);

  for (let index = itemIndex.index; index < items.length; index += 1) {
    const shiftedItem = items[index];
    if (shiftedItem != null) {
      state.liveItemIndexByKey[shiftedItem.key] = { turnId, index };
    }
  }

  if (items.length === 0) {
    Reflect.deleteProperty(state.liveItemsByTurnId, turnId);
  }
};
```

- [ ] **Step 5: Update reducer call sites**

In the `itemCompleted` branch, replace:

```ts
            settleLiveSlotIfPresent(state, turnId, item);
```

with:

```ts
            removeLiveItemIfPresent(state, turnId, item.id);
```

In the `itemStarted` branch, replace:

```ts
            upsertStartedLiveSlot(state, turnId, item);
```

with:

```ts
            appendStartedLiveItem(state, turnId, item);
```

In the delta branch, replace:

```ts
            appendAgentMessageDeltaToLiveSlot(state, turnId, itemId, delta);
```

with:

```ts
            appendAgentMessageDeltaToLiveItem(state, turnId, itemId, delta);
```

- [ ] **Step 6: Update selectors to O(1) read paths**

Replace `selectTranscriptLiveItem` with:

```ts
    selectTranscriptLiveItem: (
      transcriptState,
      turnId: string,
      itemId: string,
    ): TranscriptRenderableLiveItem | null =>
      liveItemForKey(transcriptState, turnId, itemId),
```

Replace `selectTranscriptLiveItemsForTurn` with:

```ts
    selectTranscriptLiveItemsForTurn: (
      transcriptState,
      turnId: string,
    ): TranscriptRenderableLiveItem[] => transcriptState.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS,
```

Do not reintroduce any selector-side map, flatMap, key array, revision array, or WeakMap cache for live items.

- [ ] **Step 7: Run focused tests and verify Task 1 now passes**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected:

- The Task 1 tests pass.
- Any remaining failures should be type/expectation drift from removed `completedItem`.

- [ ] **Step 8: Commit Task 2**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "feat(gui): maintain live agent message render state"
```

Expected: one local commit with the 02e reducer expectation tests and the `transcriptStateSlice.ts` state-shape migration.

## Task 3: Update live selector reference tests for store-owned arrays

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Rename the live selector cache describe intent in tests**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`, keep the transcript chunk cache tests unchanged.

For live item tests, update names so they no longer describe selector-side view rebuilding. Use these names:

```ts
it("returns the store-owned live item array while that turn is unchanged", () => {
```

```ts
it("returns a new store-owned live item array when the live turn changes", () => {
```

```ts
it("returns a new store-owned live item array when delta updates that live turn", () => {
```

```ts
it("removes the store-owned live item array when completed settlement empties the turn", () => {
```

- [ ] **Step 2: Update the delta selector expectation**

In the delta-related live selector test, keep this shape:

```ts
    const beforeUpdate = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-delta",
    );

    store.dispatch(
      threadRuntimeDeltaAccepted({
        notification: agentMessageDelta(
          eventAgentMessageDelta,
          "turn-live-cache-delta",
          "agent-live-cache-delta",
          "Streamed text",
        ),
      }),
    );

    const afterUpdate = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-delta",
    );

    expect(afterUpdate).not.toBe(beforeUpdate);
    expect(afterUpdate).toStrictEqual([
      {
        key: "turn-live-cache-delta:agent-live-cache-delta",
        turnId: "turn-live-cache-delta",
        itemId: "agent-live-cache-delta",
        status: "streaming",
        initialItem,
        transientText: "Streamed text",
        revision: 1,
      },
    ]);
```

The expected object must not include `completedItem`.

- [ ] **Step 3: Update the completed selector expectation**

In the completed-related live selector test, replace any completed-live-item expectation with:

```ts
    const afterSettlement = selectTranscriptLiveItemsForTurn(
      store.getState(),
      "turn-live-cache-settled",
    );

    expect(afterSettlement).toStrictEqual([]);
    expect(afterSettlement).not.toBe(beforeSettlement);
```

This documents that completed settlement removes the live turn list and future selectors return the stable empty array.

- [ ] **Step 4: Import runtime delta action and fixture if needed**

If the selector cache file does not already import them, add:

```ts
import { eventAgentMessageDelta } from "@/features/projection/__tests__/projectionFixtures";
import { threadRuntimeDeltaAccepted } from "@/features/threadRuntime/threadRuntimeSlice";
import { agentMessageDelta } from "@/features/projection/__tests__/projectionTestBuilders";
```

If those imports are already present, keep one import only and avoid duplicate import statements.

- [ ] **Step 5: Run selector tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: selector cache tests pass. The live item tests should describe store-owned array reference behavior, not `WeakMap` live view cache behavior.

- [ ] **Step 6: Commit Task 3**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git diff --cached --stat
git commit -m "test(gui): cover store-owned live item selectors"
```

Expected:

- The staged diff contains selector test updates.
- `transcriptStateSlice.ts` is staged only if Task 3 uncovered a small production correction.

## Task 4: Run focused GUI verification and cleanup old assumptions

**Files:**

- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- Modify only if needed: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Search for removed fields and helpers**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
rg -n 'completedItem|liveTurnsById|liveSlotsByKey|TranscriptLiveSlot|TranscriptLiveTurn|selectCachedLiveItemsForTurn|transcriptLiveTurnViewCache' codex-gui/src/features/transcriptState
```

Expected:

- No production references to `completedItem`, `liveTurnsById`, `liveSlotsByKey`, `TranscriptLiveSlot`, `TranscriptLiveTurn`, `selectCachedLiveItemsForTurn`, or `transcriptLiveTurnViewCache`.
- Test references to `completedItem` should be gone unless they are intentionally documenting old fixture payloads outside live item expectations.

- [ ] **Step 2: Run all transcriptState unit tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__
```

Expected: all transcriptState tests pass.

- [ ] **Step 3: Run type-check**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm run type-check
```

Expected: TypeScript type-check passes.

- [ ] **Step 4: Format changed GUI files**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec prettier --write src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
```

Expected: Prettier completes successfully.

- [ ] **Step 5: Run final focused tests after formatting**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__
```

Expected: all transcriptState tests still pass.

- [ ] **Step 6: Commit Task 4**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "chore(gui): verify live agent message render state"
```

Expected:

- One local commit is created only if formatting or cleanup changed files after Task 3.
- If Task 4 produced no diff, skip the commit and record that verification passed without additional changes.

## Final Verification

After all implementation tasks are complete, run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
which pnpm
pnpm exec vitest --run src/features/transcriptState/__tests__
pnpm run type-check
```

Expected:

- transcriptState tests pass.
- type-check passes.
- `which pnpm` does not point under `/Users/jiangsheng/.cache/codex-runtimes/`.

Then from repo root:

```zsh
cd /Users/jiangsheng/cnb/codex
git status --short
```

Expected: no unstaged or staged changes remain, except any intentionally uncommitted user-owned files that preexisted the plan execution.
