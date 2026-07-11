# Codex GUI Transcript State Large File Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the largest `codex-gui` transcript state implementation and test files into focused modules without changing Redux state, public imports, transcript behavior, or rendering performance boundaries.

**Architecture:** Keep `transcriptStateSlice.ts` as the stable facade and Redux orchestration point. Move model initialization, bounded event deduplication, live projection, committed projection, and chunk-view selection into one-directional sibling modules, then mechanically redistribute the existing 30 live-event tests by behavior domain.

**Tech Stack:** TypeScript, Redux Toolkit, Vitest, pnpm through the user's fnm-managed Node runtime, oxfmt, oxlint, ESLint.

---

## Preconditions

- Work only on branch `dev`.
- Do not install or update dependencies.
- Do not use git remotes.
- Use the accepted design: `docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md`.
- Before every `pnpm` command, use `/opt/homebrew/bin/fnm exec --using-file pnpm ...` from `codex-gui`.
- Stop if `pnpm` resolves under `/Users/jiangsheng/.cache/codex-runtimes/`.
- Stop and return to design if implementation requires changes to `threadRuntimeSlice`, projection payloads, UI components, Redux state shape, or public selector behavior.

## Final File Structure

Create production modules:

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
  - Constants, transcript domain types, initial state creation, and whole-state reset.
- `codex-gui/src/features/transcriptState/transcriptEventDedup.ts`
  - Bounded applied-event lookup, insertion, and eviction.
- `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
  - Live slot indexing, lifecycle, streaming delta accumulation, batch coalescing, and live scroll pulse.
- `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
  - Turn, entry, chunk, snapshot, revision, and completed-item projection.
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
  - Chunk-view `WeakMap` cache and state-level selector helpers.

Modify production modules:

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Retain Redux action ordering, selectors, all current exports, named slice, and default slice.
- `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - Import `TranscriptEntry` from the model module instead of the slice facade.

Create test files:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`

Rename and reduce:

- `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  -> `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`

Do not create a new test-support module. The current tests already use shared projection fixtures and builders.

## Stable Public Facade

`transcriptStateSlice.ts` must continue exporting the same symbols after every task, including currently unused exports. Preserve:

```ts
export {
  MAX_APPLIED_EVENT_ID_WINDOW_LENGTH,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
} from "./transcriptStateModel";
export type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptEntry,
  TranscriptGlobalStatus,
  TranscriptLiveItemIndex,
  TranscriptLiveItemStatus,
  TranscriptMessagePhase,
  TranscriptRenderableLiveItem,
  TranscriptState,
  TranscriptTurn,
} from "./transcriptStateModel";

export const transcriptStateSlice = createAppSlice(/* one slice instance */);
export const {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveScrollPulse,
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
```

Do not create a second slice instance or move consumers to new import paths.

---

### Task 1: Preflight and Characterization Baseline

**Files:**

- Read: `codex-gui/AGENTS.md`
- Read: `docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md`
- Test: `codex-gui/src/features/transcriptState/__tests__/*.test.ts`

- [ ] **Step 1: Confirm branch and worktree scope**

Run from the repository root:

```bash
git branch --show-current
git status --short
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree
git worktree list --porcelain
```

Expected:

- Branch is `dev`.
- `git-dir` and `git-common-dir` identify whether the checkout is a linked worktree.
- An empty superproject path confirms the checkout is not a submodule.
- The worktree list is read-only; do not create another worktree for this task.
- Existing design and plan documents are understood.
- No unrelated dirty file is edited, staged, or committed.

- [ ] **Step 2: Verify the fnm-managed package manager**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file which pnpm
```

Expected:

- All commands exit 0.
- The `pnpm` path is not under `/Users/jiangsheng/.cache/codex-runtimes/`.

- [ ] **Step 3: Run the transcriptState characterization suite before moving code**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__
```

Expected: Vitest exits 0 with the existing transcriptState tests green. If the baseline is red, stop and report the first failing test without changing code.

- [ ] **Step 4: Record the existing 30 live-event test names**

Run from the repository root:

```bash
rg -n -e '^  it\(' codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: exactly 30 matches. Preserve this output as the migration checklist for Task 7.

- [ ] **Step 5: Confirm the read-only preflight did not change the workspace**

Run from the repository root:

```bash
git status --short
```

Expected: only the accepted design and implementation plan are untracked:

```text
?? docs/superpowers/plans/2026-07-11-codex-gui-transcript-state-split.md
?? docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md
```

No commit is created for a read-only preflight task.

---

### Task 2: Extract the Transcript State Model

**Files:**

- Create: `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:13-157`
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts:1-2`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`

- [ ] **Step 1: Create the model module by moving the existing definitions**

Move, without changing field names or values, the current constants, public types, initial state, empty-state factory, and reset logic from `transcriptStateSlice.ts` into `transcriptStateModel.ts`.

The module must expose this interface:

```ts
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { ThreadItem, TurnStatus } from "@codex-protocol/v2";

export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
export const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: string[];
};
export type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: string[];
  revision: number;
};
export type TranscriptLiveItemStatus = "started" | "streaming";
export type TranscriptLiveItemIndex = {
  turnId: string;
  index: number;
};
export type TranscriptMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>['phase'];
export type TranscriptEntry =
  | {
      type: "message";
      id: string;
      turnId: string;
      role: "user" | "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      phase: TranscriptMessagePhase;
      revision: number;
    }
  | {
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    };
export type TranscriptGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};
export type TranscriptChunkView = {
  id: string;
  turnId: string;
  revision: number;
  entries: TranscriptEntry[];
};
export type TranscriptRenderableLiveItem = {
  key: string;
  turnId: string;
  itemId: string;
  status: TranscriptLiveItemStatus;
  initialItem: ThreadItem;
  transientText: string;
  revision: number;
};
export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  liveScrollPulse: number;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<string, TranscriptEntry>;
  entryChunkById: Record<string, string>;
  liveItemsByTurnId: Record<string, TranscriptRenderableLiveItem[]>;
  liveItemIndexByKey: Record<string, TranscriptLiveItemIndex>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

export const initialTranscriptState: TranscriptState = {
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  liveScrollPulse: 0,
  turnIds: [],
  turnsById: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  liveItemsByTurnId: {},
  liveItemIndexByKey: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
};

export const createEmptyTranscriptState = (): TranscriptState => ({
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  liveScrollPulse: 0,
  turnIds: [],
  turnsById: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  liveItemsByTurnId: {},
  liveItemIndexByKey: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});

export const resetTranscriptState = (state: TranscriptState, nextState: TranscriptState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.committedScrollCommitKey = nextState.committedScrollCommitKey;
  state.liveScrollPulse = nextState.liveScrollPulse;
  state.turnIds = nextState.turnIds;
  state.turnsById = nextState.turnsById;
  state.chunksById = nextState.chunksById;
  state.entriesById = nextState.entriesById;
  state.entryChunkById = nextState.entryChunkById;
  state.liveItemsByTurnId = nextState.liveItemsByTurnId;
  state.liveItemIndexByKey = nextState.liveItemIndexByKey;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
};
```

- [ ] **Step 2: Keep the old module as the public facade**

Import `initialTranscriptState` and the state helpers needed internally. Re-export every current constant and type from `transcriptStateSlice.ts` using the stable-facade block in this plan.

Use the moved initial state in `createAppSlice`:

```ts
export const transcriptStateSlice = createAppSlice({
  name: "transcriptState",
  initialState: initialTranscriptState,
  reducers: () => ({}),
  // existing selectors and extraReducers remain unchanged in this task
});
```

- [ ] **Step 3: Break the materialization-to-slice type dependency**

Change only the type import in `transcriptEntryMaterialization.ts`:

```ts
import type { TranscriptEntry } from "./transcriptStateModel";
```

- [ ] **Step 4: Run focused validation**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: both commands exit 0. Existing imports from `transcriptStateSlice.ts` continue to compile.

- [ ] **Step 5: Commit the model extraction**

Run from the repository root after inspecting the staged diff:

```bash
git add codex-gui/src/features/transcriptState/transcriptStateModel.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts
git diff --cached --check
git diff --cached --stat
git commit -m "refactor(gui): extract transcript state model"
```

Expected: one local commit containing only the three listed files.

---

### Task 3: Extract Bounded Event Deduplication

**Files:**

- Create: `codex-gui/src/features/transcriptState/transcriptEventDedup.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:159-174,584-605`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Move the two dedup helpers into a pure state module**

Create this public module surface, preserving the existing bodies and the bounded FIFO eviction:

```ts
import { MAX_APPLIED_EVENT_ID_WINDOW_LENGTH, type TranscriptState } from "./transcriptStateModel";

export const hasAppliedTranscriptEvent = (state: TranscriptState, commitId: string): boolean =>
  state.appliedEventIdsById[commitId] === true;

export const recordAppliedTranscriptEvent = (state: TranscriptState, commitId: string) => {
  state.appliedEventIdsById[commitId] = true;
  state.appliedEventOrder.push(commitId);

  if (state.appliedEventOrder.length <= MAX_APPLIED_EVENT_ID_WINDOW_LENGTH) {
    return;
  }

  const removedCommitId = state.appliedEventOrder.shift();
  if (removedCommitId != null) {
    Reflect.deleteProperty(state.appliedEventIdsById, removedCommitId);
  }
};
```

- [ ] **Step 2: Replace slice-local calls without changing event order**

Import the two helpers into `transcriptStateSlice.ts`. Preserve this order inside `threadRuntimeEventBuffered`:

```ts
if (replay === "snapshotDuplicate") return;
if (state.threadId !== notification.threadId) return;
if (hasAppliedTranscriptEvent(state, notification.commitId)) return;
if (notification.event.type === "itemStarted") {
  const { item, turnId } = notification.event.notification;
  if (hasLiveItem(state, turnId, item.id)) return;
}
recordAppliedTranscriptEvent(state, notification.commitId);
```

- [ ] **Step 3: Verify replay and duplicate semantics**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: commands exit 0; duplicate live `itemStarted` remains a full state-identity no-op.

- [ ] **Step 4: Commit the dedup extraction**

```bash
git add codex-gui/src/features/transcriptState/transcriptEventDedup.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git commit -m "refactor(gui): extract transcript event dedup"
```

---

### Task 4: Extract Live Projection

**Files:**

- Create: `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:176-379,560-569,598-635`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Move the complete live-item implementation behind explicit functions**

Move `liveItemKey`, live item lookup/index maintenance, slot append/removal, pulse updates, single-delta handling, and batch coalescing into the new module. Expose exactly:

```ts
export const hasLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): boolean;

export const appendStartedLiveItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): void;

export const applyAcceptedProjectionDelta = (
  state: TranscriptState,
  notification: Parameters<typeof threadRuntimeDeltaAccepted>[0]["notification"],
): void;

export const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: Parameters<typeof threadRuntimeDeltasAccepted>[0]["notifications"],
): void;

export const removeLiveItemIfPresent = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): void;

export const findLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null;

export const liveItemsForTurn = (
  state: TranscriptState,
  turnId: string,
): readonly TranscriptRenderableLiveItem[];
```

Keep `EMPTY_LIVE_ITEMS`, `AgentMessageDeltaBucket`, `appendDeltaToLiveItem`, and index-repair details private. Batch handling must concatenate deltas per item in notification order and increment each affected live item revision/pulse only once per batch.

- [ ] **Step 2: Delegate slice event and delta routing to the module**

Keep action cases in `transcriptStateSlice.ts`, but replace local helper bodies with imports:

```ts
.addCase(threadRuntimeDeltaAccepted, (state, action) => {
  applyAcceptedProjectionDelta(state, action.payload.notification);
})
.addCase(threadRuntimeDeltasAccepted, (state, action) => {
  applyAcceptedProjectionDeltaBatch(state, action.payload.notifications);
})
```

The `itemStarted` and `itemCompleted` cases continue calling `appendStartedLiveItem` and `removeLiveItemIfPresent` in their existing order.

- [ ] **Step 3: Keep current slice selectors working**

For this intermediate task, implement the existing live selectors by delegating directly:

```ts
selectTranscriptLiveItem: (state, turnId, itemId) => findLiveItem(state, turnId, itemId),
selectTranscriptLiveItemsForTurn: (state, turnId) => liveItemsForTurn(state, turnId),
```

- [ ] **Step 4: Run live-event and type validation**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: commands exit 0; batch revision/pulse tests, stale-index tests, and slot-removal tests remain green.

- [ ] **Step 5: Commit the live projection extraction**

```bash
git add codex-gui/src/features/transcriptState/transcriptLiveProjection.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git commit -m "refactor(gui): extract transcript live projection"
```

---

### Task 5: Extract Committed Projection

**Files:**

- Create: `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:381-514,575-629`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Move turn, entry, chunk, and snapshot projection into one module**

Move the existing turn creation/update, chunk creation, entry classification, live committed upsert, and snapshot rebuild functions. Keep detailed helpers private and expose:

```ts
export const ensureTranscriptTurn = (state: TranscriptState, turnId: string): TranscriptTurn;

export const upsertTranscriptTurn = (state: TranscriptState, turn: Turn): void;

export const applyCompletedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): boolean;

export const rebuildTranscriptFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: Turn[],
): void;
```

`applyCompletedTranscriptItem` must:

```ts
ensureTranscriptTurn(state, turnId);
const entry = materializeTranscriptItem(item, turnId);
if (entry == null) return false;
upsertLiveCommittedEntry(state, entry);
return true;
```

It must not remove live slots or set the commit key; those ordering decisions remain in the slice.

- [ ] **Step 2: Preserve `itemCompleted` orchestration**

Replace the existing inline case with equivalent orchestration:

```ts
case "itemCompleted": {
  const { item, turnId } = notification.event.notification;
  removeLiveItemIfPresent(state, turnId, item.id);
  if (applyCompletedTranscriptItem(state, turnId, item)) {
    state.committedScrollCommitKey = `event:${notification.commitId}`;
  }
  return;
}
```

`turnStarted` and `turnCompleted` delegate to `upsertTranscriptTurn`. Attach delegates to `rebuildTranscriptFromSnapshot`.

Keep `itemStarted` turn creation explicit before live slot insertion:

```ts
case "itemStarted": {
  const { item, turnId } = notification.event.notification;
  ensureTranscriptTurn(state, turnId);
  appendStartedLiveItem(state, turnId, item);
  return;
}
```

- [ ] **Step 3: Run committed and snapshot characterization tests**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: commands exit 0; chunk limits, revision changes, filtering, final-answer placement, and attach rebuild behavior remain unchanged.

- [ ] **Step 4: Commit the committed projection extraction**

```bash
git add codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git commit -m "refactor(gui): extract committed transcript projection"
```

---

### Task 6: Extract Selector Helpers and Finish the Slice Facade

**Files:**

- Create: `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts:101-106,516-572,654-666`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Test: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`

- [ ] **Step 1: Move the chunk-view cache as one unit**

Move `TranscriptChunkViewCacheEntry`, the module-level `WeakMap`, and the chunk materialization logic into `transcriptStateSelectors.ts`. Expose state-level helpers:

```ts
export const transcriptChunkView = (
  state: TranscriptState,
  chunkId: string,
): TranscriptChunkView | null;

export const transcriptLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null;

export const transcriptLiveItemsForTurn = (
  state: TranscriptState,
  turnId: string,
): readonly TranscriptRenderableLiveItem[];
```

`transcriptChunkView` must keep one module-level `WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>`, compare `chunk.revision`, and materialize only the requested chunk's entries.

- [ ] **Step 2: Make slice selectors thin delegations**

Keep selector names and output types unchanged. The chunk/live selectors delegate to the new helper module; simple map lookups remain inline in the slice.

- [ ] **Step 3: Verify the final facade exports**

Compare the final export surface against the Stable Public Facade section. Confirm the default and named exports reference the same slice object, and retain every currently exported type and constant even if no in-repo consumer was found.

- [ ] **Step 4: Run selector cache and consumer type checks**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: stable chunk views retain object identity until revision changes, snapshot reattach invalidates old views, and all original import paths compile.

- [ ] **Step 5: Check production file sizes before committing**

```bash
wc -l src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptEventDedup.ts src/features/transcriptState/transcriptLiveProjection.ts src/features/transcriptState/transcriptCommittedProjection.ts src/features/transcriptState/transcriptStateSelectors.ts
```

Expected: every production file is below 500 lines; `transcriptStateSlice.ts` is orchestration-focused.

- [ ] **Step 6: Commit the selector and facade extraction**

```bash
git add codex-gui/src/features/transcriptState/transcriptStateSelectors.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
git diff --cached --check
git commit -m "refactor(gui): finish transcript state module split"
```

---

### Task 7: Split the 30 Live-Event Tests by Behavior Domain

**Files:**

- Rename: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  -> `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`

- [ ] **Step 1: Rename the original file with git before editing its contents**

Run from the repository root:

```bash
git mv codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts
```

- [ ] **Step 2: Move exactly these six tests to `transcriptStateLiveStreaming.test.ts`**

```text
creates a started live slot from itemStarted without committing transcript entries
appends accepted agent message deltas into an existing live slot
coalesces accepted agent message delta batches per live item in notification order
keeps batch delta coalescing isolated per live item
ignores accepted agent message deltas when the live slot is missing
ignores wrong-thread and unsupported delta notifications in accepted delta batches
```

Use the same `describe`, store setup, fixtures, action dispatches, and assertions from the renamed source file.

- [ ] **Step 3: Move exactly these five tests to `transcriptStateLiveItemLifecycle.test.ts`**

```text
keeps itemStarted slot order stable and ignores duplicate live slot insertion
removes the live item after committing the completed agent message
keeps the later live item addressable after removing an earlier live item
does not create a live slot when itemCompleted arrives without itemStarted
removes the live item after an empty completed agent message without committing an entry
```

- [ ] **Step 4: Move exactly these three white-box tests to `transcriptStateLiveItemIndex.test.ts`**

```text
returns null when a stale live item index points at a different key
returns the store-owned live item array when live item state changes
does not remove another live item or bump the pulse when a live item index is stale
```

Keep direct state construction and `transcriptStateSlice.reducer` calls. Do not add a production helper to make these tests more convenient.

- [ ] **Step 5: Move exactly these four tests to `transcriptStateScrollSignals.test.ts`**

```text
sets the committed scroll commit key from accepted attach snapshots
advances the committed scroll commit key only when live events change committed transcript DOM
advances a live scroll pulse for live assistant display changes without changing the committed scroll key
does not advance the live scroll pulse for non-visible live items
```

Keep each started/delta/completed action sequence intact.

- [ ] **Step 6: Move exactly these three tests to `transcriptStateReplayDedup.test.ts`**

```text
ignores snapshot duplicate live items without changing transcript or scroll key
ignores snapshot duplicate itemStarted and itemCompleted without touching live slots
uses commitId to avoid applying the same live notification twice
```

- [ ] **Step 7: Leave exactly these nine tests in `transcriptStateCommittedProjection.test.ts`**

```text
preserves assistant message phase in live completed transcript entries
applies live itemCompleted messages into committed transcript chunks
applies normalized live itemCompleted projection payloads into committed transcript chunks
updates turn terminal status from live turnCompleted
filters empty text and non-chat live item completions
updates an existing committed entry and bumps only its chunk revision
bumps entry and chunk revisions when an existing middle entry phase changes
updates an existing final assistant entry without creating a middle chunk
chunks only middle entries after the committed chunk entry limit
```

- [ ] **Step 8: Verify test count, uniqueness, and file size**

Run from the repository root:

```bash
rg -n -e '^  it\(' codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts
wc -l codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts
```

Expected:

- Exactly 30 `it(` matches across the six files.
- Each test name appears once.
- Every test file is at most 600 lines.

- [ ] **Step 9: Run the split test files**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts
```

Expected: Vitest exits 0 with 30 passing tests and no duplicate test execution.

- [ ] **Step 10: Commit the mechanical test split**

```bash
git add -A -- codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts
git diff --cached --check
git diff --cached --stat
git commit -m "test(gui): split transcript live event coverage"
```

Expected: a mechanical test-only commit with no production changes.

---

### Task 8: Final Formatting, Verification, and Large-File Check

**Files:**

- Verify: `codex-gui/src/features/transcriptState/**`
- Generated locally and ignored: `codex-gui/.reports/large-files.md`
- Generated locally and ignored: `codex-gui/.reports/large-files.json`

- [ ] **Step 1: Apply the project formatter**

Run from `codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Expected: command exits 0. Inspect changes and keep only formatting caused by the planned transcriptState files; stop if unrelated files are rewritten.

- [ ] **Step 2: Run the complete transcriptState unit-test directory**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__
```

Expected: all transcriptState unit tests exit 0.

- [ ] **Step 3: Run static verification**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Expected: all commands exit 0.

- [ ] **Step 4: Regenerate the ignored large-file report for observation**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run analyze:large-files
```

Expected:

- The command exits 0.
- The old 666-line slice and 1594-line test file no longer appear under their old paths.
- Every new production module is below 500 lines.
- Every new test file is at most 600 lines.
- `.reports/` remains ignored and is not staged.

- [ ] **Step 5: Inspect final repository scope**

Run from the repository root:

```bash
git status --short
git diff --check
git log --oneline -6
```

Expected: only planned transcriptState files and the explicitly requested design/plan documents are uncommitted or changed; no `.reports/` file is staged.

- [ ] **Step 6: Commit formatter-only changes if formatting changed tracked files**

If Step 1 changed planned tracked files after the previous task commits:

```bash
git add codex-gui/src/features/transcriptState
git diff --cached --check
git commit -m "chore(gui): format transcript state split"
```

If Step 1 produced no tracked diff, do not create an empty commit.

## Completion Report

Report:

- Production modules created and final line counts.
- Test files created and the 30-test distribution.
- Public facade compatibility confirmation.
- Exact verification commands and results.
- Local commit hashes, one per completed implementation task.
- Any remaining Top 10 large-file candidates as out-of-scope follow-up only.

Do not push, fetch, pull, create a PR, or update remote references.
