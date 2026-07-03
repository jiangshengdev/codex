# Live Slot State Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `02a` GUI data-layer live slot boundary in `transcriptState`.

**Architecture:** `transcriptState` owns a transient live slot sub-state keyed by `turnId + itemId`. `itemStarted` creates a started slot and turn-local order, while selectors expose renderable live items without writing started/streaming content into committed transcript chunks.

**Tech Stack:** TypeScript, Redux Toolkit `createSlice`, Vitest unit tests, codex-gui projection test builders.

---

## Scope

This plan implements only `02a live slot state boundary`.

Implement:

- live slot state/types inside `transcriptStateSlice.ts`
- `itemStarted` creates a `started` live slot
- turn-local live slot order plus global slot map
- selectors that return renderable live items
- unit coverage for reducer and selector behavior

Do not implement:

- `thread/projection/delta` ingress
- stale subscription delta handling
- missing slot delta handling
- completed settlement or live slot cleanup
- UI rendering or `CommittedTranscriptSurface` changes
- Rust/app-server protocol changes

## Files

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

## Verification Environment

Before running any `pnpm` command in `codex-gui`, initialize the user fnm environment:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
```

Expected: `pnpm --version` must resolve to the user project pnpm, not a binary under `/Users/jiangsheng/.cache/codex-runtimes/`.

## Task 1: Add live slot state and selectors

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Write failing selector tests**

Append tests to `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`:

```ts
it("creates a started live slot from itemStarted without committing transcript entries", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

  const initialItem = agentMessage("agent-live-started", "Initial text should stay live only");
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-live-started-slot",
        "turn-live-started-slot",
        initialItem,
      ),
      replay: "live",
    }),
  );

  expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-started-slot")).toStrictEqual([
    {
      key: "turn-live-started-slot:agent-live-started",
      turnId: "turn-live-started-slot",
      itemId: "agent-live-started",
      status: "started",
      initialItem,
      transientText: "",
      completedItem: null,
      revision: 0,
    },
  ]);
  expect(selectTranscriptEntry(store.getState(), "agent-live-started")).toBeNull();
  expect(selectTranscriptChunk(store.getState(), "turn-live-started-slot:chunk:0")).toBeNull();
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);
});

it("keeps itemStarted slot order stable and ignores duplicate live slot insertion", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const firstItem = agentMessage("agent-slot-first", "First");
  const secondItem = agentMessage("agent-slot-second", "Second");

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(eventItemStarted, "commit-slot-first", "turn-slot-order", firstItem),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-slot-first-duplicate-id",
        "turn-slot-order",
        agentMessage("agent-slot-first", "Updated initial"),
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(eventItemStarted, "commit-slot-second", "turn-slot-order", secondItem),
      replay: "live",
    }),
  );

  expect(
    selectTranscriptLiveItemsForTurn(store.getState(), "turn-slot-order").map((item) => item.itemId),
  ).toStrictEqual(["agent-slot-first", "agent-slot-second"]);
  expect(selectTranscriptLiveItem(store.getState(), "turn-slot-order", "agent-slot-first")).toStrictEqual({
    key: "turn-slot-order:agent-slot-first",
    turnId: "turn-slot-order",
    itemId: "agent-slot-first",
    status: "started",
    initialItem: firstItem,
    transientText: "",
    completedItem: null,
    revision: 0,
  });
});
```

Update the import from `../transcriptStateSlice` in that file to include:

```ts
selectTranscriptLiveItem,
selectTranscriptLiveItemsForTurn,
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: test fails because `selectTranscriptLiveItem` and `selectTranscriptLiveItemsForTurn` are not exported.

- [ ] **Step 3: Add live slot types and state fields**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, add these exported types near the existing transcript types:

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

export type TranscriptRenderableLiveItem = {
  key: string;
  turnId: string;
  itemId: string;
  status: TranscriptLiveSlotStatus;
  initialItem: ThreadItem;
  transientText: string;
  completedItem: ThreadItem | null;
  revision: number;
};
```

Add fields to `TranscriptState`:

```ts
liveTurnsById: Record<string, TranscriptLiveTurn>;
liveSlotsByKey: Record<string, TranscriptLiveSlot>;
```

Add those fields to `initialState`, `createEmptyState`, and `resetState`:

```ts
liveTurnsById: {},
liveSlotsByKey: {},
```

```ts
state.liveTurnsById = nextState.liveTurnsById;
state.liveSlotsByKey = nextState.liveSlotsByKey;
```

- [ ] **Step 4: Add live slot helpers**

In `transcriptStateSlice.ts`, add helpers near the existing turn helpers:

```ts
const liveSlotKey = (turnId: string, itemId: string): string => `${turnId}:${itemId}`;

const ensureLiveTurnExists = (state: TranscriptState, turnId: string): TranscriptLiveTurn => {
  const existingTurn = state.liveTurnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const liveTurn: TranscriptLiveTurn = {
    id: turnId,
    slotOrder: [],
    revision: 0,
  };
  state.liveTurnsById[turnId] = liveTurn;
  return liveTurn;
};

const upsertStartedLiveSlot = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const key = liveSlotKey(turnId, item.id);
  if (state.liveSlotsByKey[key] != null) {
    return;
  }

  const liveTurn = ensureLiveTurnExists(state, turnId);
  liveTurn.slotOrder.push(item.id);
  liveTurn.revision += 1;
  state.liveSlotsByKey[key] = {
    key,
    turnId,
    itemId: item.id,
    initialItem: item,
    status: "started",
    transientText: "",
    completedItem: null,
    revision: 0,
  };
};
```

- [ ] **Step 5: Make itemStarted create a started live slot**

Replace the `itemStarted` no-op branch in `threadRuntimeEventBuffered` with:

```ts
case "itemStarted": {
  const { item, turnId } = notification.event.notification;
  ensureTurnExists(state, turnId);
  upsertStartedLiveSlot(state, turnId, item);
  return;
}
```

Do not update `committedScrollCommitKey` in this branch.

- [ ] **Step 6: Add live item selectors**

Add a cache near `transcriptChunkViewCache`:

```ts
type TranscriptLiveTurnViewCacheEntry = {
  revision: number;
  view: TranscriptRenderableLiveItem[];
};

const transcriptLiveTurnViewCache = new WeakMap<
  TranscriptLiveTurn,
  TranscriptLiveTurnViewCacheEntry
>();
```

Add helper:

```ts
const selectCachedLiveItemsForTurn = (
  transcriptState: TranscriptState,
  liveTurn: TranscriptLiveTurn,
): TranscriptRenderableLiveItem[] => {
  const cachedEntry = transcriptLiveTurnViewCache.get(liveTurn);
  if (cachedEntry?.revision === liveTurn.revision) {
    return cachedEntry.view;
  }

  const view = liveTurn.slotOrder.flatMap((itemId) => {
    const slot = transcriptState.liveSlotsByKey[liveSlotKey(liveTurn.id, itemId)];
    if (slot == null) {
      return [];
    }

    return [
      {
        key: slot.key,
        turnId: slot.turnId,
        itemId: slot.itemId,
        status: slot.status,
        initialItem: slot.initialItem,
        transientText: slot.transientText,
        completedItem: slot.completedItem,
        revision: slot.revision,
      },
    ];
  });

  transcriptLiveTurnViewCache.set(liveTurn, { revision: liveTurn.revision, view });
  return view;
};
```

Add selectors:

```ts
selectTranscriptLiveItem: (
  transcriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null => {
  const slot = transcriptState.liveSlotsByKey[liveSlotKey(turnId, itemId)];
  if (slot == null) {
    return null;
  }

  return {
    key: slot.key,
    turnId: slot.turnId,
    itemId: slot.itemId,
    status: slot.status,
    initialItem: slot.initialItem,
    transientText: slot.transientText,
    completedItem: slot.completedItem,
    revision: slot.revision,
  };
},
selectTranscriptLiveItemsForTurn: (
  transcriptState,
  turnId: string,
): TranscriptRenderableLiveItem[] => {
  const liveTurn = transcriptState.liveTurnsById[turnId];
  if (liveTurn == null) {
    return [];
  }

  return selectCachedLiveItemsForTurn(transcriptState, liveTurn);
},
```

Export both selectors from the destructuring export.

- [ ] **Step 7: Run the focused test and verify it passes**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: all tests in `transcriptStateLiveEvents.test.ts` pass.

- [ ] **Step 8: Commit Task 1**

Stage only Task 1 files:

```zsh
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git diff --cached --name-only
```

Expected staged files:

```text
codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
codex-gui/src/features/transcriptState/transcriptStateSlice.ts
```

Commit:

```zsh
git commit -m "feat(gui): add transcript live slots"
```

## Task 2: Add selector cache coverage

**Files:**

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

- [ ] **Step 1: Write failing selector cache tests**

Append tests to `transcriptStateSelectorCache.test.ts`:

```ts
it("returns a stable live item view while the live turn is unchanged", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-live-cache-started",
        "turn-live-cache",
        agentMessage("agent-live-cache", "Live cache"),
      ),
      replay: "live",
    }),
  );

  const firstLiveItems = selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache");
  expect(firstLiveItems).toHaveLength(1);
  expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache")).toBe(
    firstLiveItems,
  );

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-unrelated-committed",
        "turn-unrelated-committed",
        agentMessage("agent-unrelated-committed", "Unrelated committed"),
      ),
      replay: "live",
    }),
  );

  expect(selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache")).toBe(
    firstLiveItems,
  );
});

it("returns a new live item view when the live turn order changes", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-live-cache-first",
        "turn-live-cache-update",
        agentMessage("agent-live-cache-first", "First"),
      ),
      replay: "live",
    }),
  );
  const beforeUpdate = selectTranscriptLiveItemsForTurn(
    store.getState(),
    "turn-live-cache-update",
  );

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-live-cache-second",
        "turn-live-cache-update",
        agentMessage("agent-live-cache-second", "Second"),
      ),
      replay: "live",
    }),
  );

  const afterUpdate = selectTranscriptLiveItemsForTurn(store.getState(), "turn-live-cache-update");
  expect(afterUpdate).not.toBe(beforeUpdate);
  expect(afterUpdate.map((item) => item.itemId)).toStrictEqual([
    "agent-live-cache-first",
    "agent-live-cache-second",
  ]);
});
```

Update the imports in that file to include:

```ts
selectTranscriptLiveItemsForTurn,
```

- [ ] **Step 2: Run the focused cache test and verify it passes**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: all tests in `transcriptStateSelectorCache.test.ts` pass.

- [ ] **Step 3: Run both transcriptState focused tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: both focused test files pass.

- [ ] **Step 4: Commit Task 2**

Stage only Task 2 file:

```zsh
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
git diff --cached --name-only
```

Expected staged file:

```text
codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Commit:

```zsh
git commit -m "test(gui): cover transcript live slot selectors"
```

## Task 3: Run final codex-gui checks

**Files:**

- Verify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Verify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Verify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`

- [ ] **Step 1: Run focused tests**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
```

Expected: both focused test files pass.

- [ ] **Step 2: Run type-check**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run type-check
```

Expected: TypeScript passes.

- [ ] **Step 3: Run formatter check**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run format:oxfmt
```

Expected: formatter check passes. If it fails only because files need formatting, run:

```zsh
pnpm run format:oxfmt:fix
```

Then stage and commit only formatting changes for files already modified by Tasks 1 and 2:

```zsh
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
git diff --cached --name-only
git commit -m "style(gui): format transcript live slots"
```

- [ ] **Step 4: Run lint**

Run:

```zsh
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
pnpm run lint
```

Expected: lint passes.

- [ ] **Step 5: Report final status**

Run:

```zsh
git status --short
git log --oneline -3
```

Report:

- focused test result
- type-check result
- formatter result
- lint result
- commit hashes created for each task
