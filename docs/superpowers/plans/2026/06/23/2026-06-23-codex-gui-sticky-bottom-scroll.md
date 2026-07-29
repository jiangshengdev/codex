# codex-gui Sticky Bottom Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the `codex-gui` chat page pinned to the bottom after attach snapshots and live committed messages, while replacing the current O(n) transcript scan with an O(1) projection commit key.

**Architecture:** `transcriptState` owns a `committedScrollCommitKey` that is updated on accepted attach snapshots and on live events that actually change committed transcript DOM. `useCommittedTranscriptStickyBottom` subscribes to that O(1) selector instead of deriving a string by walking all turns, chunks, and entries. The sticky-bottom DOM behavior stays in `AppShell` and the hook; projection ingress, materialization rules, and composer behavior stay unchanged.

**Tech Stack:** React 19, Redux Toolkit selectors, Vitest, Vitest Browser Mode, `vitest-browser-react`, existing projection fixtures/builders.

---

## File Structure

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Add reducer tests for `committedScrollCommitKey` attach/live/duplicate/non-DOM behavior.
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add `committedScrollCommitKey` state, selector, attach update, and live `itemCompleted` update.
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
  - Remove the O(n) selector and subscribe to `selectCommittedTranscriptScrollCommitKey`.
- Verify: `codex-gui/src/features/appShell/AppShell.tsx`
  - Keep the existing hook call and bottom sentinel wiring.
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Keep existing sticky-bottom browser coverage.
- Do not modify:
  - `codex-gui/src/features/projectionIngress/*`
  - `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
  - `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - `codex-gui/src/features/guiHost/*`

## Task 1: Confirm Existing Sticky-Bottom Browser Coverage

**Files:**
- Inspect: `codex-gui/src/__tests__/App.browser.test.tsx`
- Inspect: `codex-gui/src/features/appShell/AppShell.tsx`
- Inspect: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] **Step 1: Confirm the browser tests still cover the required behavior**

Inspect `codex-gui/src/__tests__/App.browser.test.tsx` and confirm these test names exist:

```text
App keeps the document pinned to the bottom after attaching a long transcript
App keeps the document pinned to the bottom after a live committed message
App does not force the document to the bottom after a live message when the user scrolled up
```

Expected: the tests are already present. Do not add duplicate browser tests unless one is missing.

- [ ] **Step 2: Confirm the sentinel wiring already exists**

Inspect `codex-gui/src/features/appShell/AppShell.tsx` and confirm it calls the hook and renders the sentinel after `CommittedTranscriptSurface`:

```tsx
export function AppShell({ status, commands }: AppShellProps) {
  const transcriptBottomRef = useCommittedTranscriptStickyBottom();

  return (
    <main
      className="min-h-svh w-full px-4 py-6 pb-44 sm:px-6 lg:px-8"
      data-gui-host-status={status.label}
    >
      <Toast.Provider placement="top" />
      <Surface className="mx-auto grid min-w-0 w-full max-w-6xl content-start" variant="default">
        <CommittedTranscriptSurface />
      </Surface>
      <div
        aria-hidden="true"
        className="committed-transcript-bottom-sentinel h-px w-full"
        ref={transcriptBottomRef}
      />
      <ComposerTurnControl commands={commands} guiHostStatus={status} />
    </main>
  );
}
```

Expected: the sentinel wiring is already present. Do not change `AppShell.tsx` if it matches this shape.

- [ ] **Step 3: Run the existing browser tests once before the repair**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: the sticky-bottom behavior tests pass or fail only for the current known implementation problem. Record the result in the implementation notes before changing code.

## Task 2: Add Failing Reducer Tests for the O(1) Commit Key

**Files:**
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Add fixture and selector imports**

Update the imports in `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`.

Change the projection fixture import to include `attachReplacement`:

```ts
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Change the transcript selector import to include `selectCommittedTranscriptScrollCommitKey`:

```ts
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} from "../transcriptStateSlice";
```

- [ ] **Step 2: Extend the registration test**

In `registers transcript state in the app store`, add the initial selector assertion:

```ts
expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBeNull();
```

- [ ] **Step 3: Add attach commit-key coverage**

Add this test after `rebuilds committed transcript chunks from an accepted attach snapshot`:

```ts
it("sets the committed scroll commit key from accepted attach snapshots", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));

  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
    `attach:${attachBaseline.snapshot.thread.id}:${attachBaseline.subscriptionId}:none`,
  );

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachReplacement, [])));

  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
    `attach:${attachReplacement.snapshot.thread.id}:${attachReplacement.subscriptionId}:${attachReplacement.snapshot.headCommitId}`,
  );
});
```

- [ ] **Step 4: Add live event commit-key coverage**

Add this test after `applies live itemCompleted messages into committed transcript chunks`:

```ts
it("advances the committed scroll commit key only when live events change committed transcript DOM", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());

  store.dispatch(
    threadRuntimeEventBuffered(
      itemStarted(
        eventItemStarted,
        "commit-started-no-dom",
        "turn-scroll-key",
        agentMessage("agent-started-no-dom", "Started should be ignored"),
      ),
    ),
  );

  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-filtered-no-dom",
        "turn-scroll-key",
        planItem("hidden-plan"),
      ),
    ),
  );

  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-visible-dom",
        "turn-scroll-key",
        agentMessage("agent-visible-dom", "Visible committed message"),
      ),
    ),
  );

  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
    "event:commit-visible-dom",
  );

  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-visible-dom",
        "turn-scroll-key",
        agentMessage("agent-duplicate-dom", "Duplicate should be ignored"),
      ),
    ),
  );

  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
    "event:commit-visible-dom",
  );
});
```

- [ ] **Step 5: Run the reducer tests and verify failure**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: FAIL because `selectCommittedTranscriptScrollCommitKey` does not exist yet.

## Task 3: Implement the O(1) Commit Key in Transcript State

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Add the state field**

Update `TranscriptState`, `initialState`, and `createEmptyState`:

```ts
export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunkIdsByTurnId: Record<string, string[]>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<string, TranscriptEntry>;
  entryChunkById: Record<string, string>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

const initialState: TranscriptState = {
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  turnIds: [],
  turnsById: {},
  chunkIdsByTurnId: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
};

const createEmptyState = (): TranscriptState => ({
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  turnIds: [],
  turnsById: {},
  chunkIdsByTurnId: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});
```

- [ ] **Step 2: Preserve the field during reset**

Update `resetState`:

```ts
const resetState = (state: TranscriptState, nextState: TranscriptState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.committedScrollCommitKey = nextState.committedScrollCommitKey;
  state.turnIds = nextState.turnIds;
  state.turnsById = nextState.turnsById;
  state.chunkIdsByTurnId = nextState.chunkIdsByTurnId;
  state.chunksById = nextState.chunksById;
  state.entriesById = nextState.entriesById;
  state.entryChunkById = nextState.entryChunkById;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
};
```

- [ ] **Step 3: Set the attach key after snapshot rebuild**

Update `rebuildFromSnapshot` to accept `headCommitId` and set the attach key:

```ts
const rebuildFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: Turn[],
) => {
  const nextState = createEmptyState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;
  nextState.committedScrollCommitKey = `attach:${threadId}:${subscriptionId}:${headCommitId ?? "none"}`;

  for (const turn of turns) {
    upsertTurnFromPayload(nextState, turn);
    for (const item of turn.items) {
      const entry = materializeTranscriptItem(item, turn.id);
      if (entry != null) {
        appendBaselineEntry(nextState, entry);
      }
    }
  }

  resetState(state, nextState);
};
```

Update the `threadRuntimeAttached` call site:

```ts
rebuildFromSnapshot(
  state,
  action.payload.snapshot.thread.id,
  action.payload.subscriptionId,
  action.payload.snapshot.headCommitId,
  action.payload.snapshot.thread.turns,
);
```

- [ ] **Step 4: Advance the live key only after committed DOM changes**

Update the `itemCompleted` arm in `threadRuntimeEventBuffered`:

```ts
case "itemCompleted": {
  const { item, turnId } = action.payload.event.notification;
  ensureTurnExists(state, turnId);
  const entry = materializeTranscriptItem(item, turnId);
  if (entry != null) {
    upsertLiveCommittedEntry(state, entry);
    state.committedScrollCommitKey = `event:${action.payload.commitId}`;
  }
  return;
}
```

Leave `turnStarted`, `turnCompleted`, and `itemStarted` without scroll key updates in this plan. `turnStarted` and `itemStarted` do not create committed transcript DOM, and `turnCompleted` is status-only metadata for this sticky-bottom scope.

- [ ] **Step 5: Add and export the selector**

Add the selector inside `selectors`:

```ts
selectCommittedTranscriptScrollCommitKey: (transcriptState): string | null =>
  transcriptState.committedScrollCommitKey,
```

Update the named export list:

```ts
export const {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;
```

- [ ] **Step 6: Run the reducer tests and verify pass**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS.

## Task 4: Replace the Hook's O(n) Selector with the Commit Key Selector

**Files:**
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] **Step 1: Replace transcript imports**

Replace the `RootState` and transcript selector imports:

```ts
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import { selectCommittedTranscriptScrollCommitKey } from "@/features/transcriptState/transcriptStateSlice";
```

- [ ] **Step 2: Remove the O(n) selector**

Delete this entire selector from `useCommittedTranscriptStickyBottom.ts`:

```ts
const selectCommittedTranscriptScrollRevision = (state: RootState): string =>
  selectTranscriptTurnIds(state)
    .map((turnId) => {
      const chunkRevisionKey = selectTranscriptChunkIdsForTurn(state, turnId)
        .map((chunkId) => {
          const chunk = selectTranscriptChunk(state, chunkId);
          return `${chunkId}:${String(chunk?.revision ?? "missing")}:${String(chunk?.entries.length ?? 0)}`;
        })
        .join(",");

      return `${turnId}[${chunkRevisionKey}]`;
    })
    .join("|");
```

- [ ] **Step 3: Subscribe to the O(1) key**

Update the hook variable and effect dependency:

```ts
export function useCommittedTranscriptStickyBottom(): RefObject<HTMLDivElement | null> {
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const scrollCommitKey = useAppSelector(selectCommittedTranscriptScrollCommitKey);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (sentinel == null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        pinnedToBottomRef.current = entry?.isIntersecting ?? false;
      },
      { root: null, threshold: 1 },
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollDocumentToBottom();
    }
  }, [scrollCommitKey]);

  return bottomSentinelRef;
}
```

- [ ] **Step 4: Search for leftover full-scan revision code**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
rg -n "selectCommittedTranscriptScrollRevision|selectTranscriptChunkIdsForTurn|selectTranscriptChunk\\(" codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
```

Expected: no matches.

## Task 5: Focused Verification

**Files:**
- Verify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- Verify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Verify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Run transcript reducer tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused browser tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Run formatting check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
```

Expected: PASS. If it fails only on changed files, run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec prettier --write src/features/transcriptState/__tests__/transcriptStateSlice.test.ts src/features/transcriptState/transcriptStateSlice.ts src/features/appShell/useCommittedTranscriptStickyBottom.ts
pnpm run format:prettier
```

- [ ] **Step 5: Inspect final local diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff --check
git diff --stat
```

Expected: no whitespace errors, and the implementation diff is limited to the transcript state test, transcript state slice, and sticky-bottom hook.

## Task 6: Commit the Repair

**Files:**
- Stage: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- Stage: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Stage: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] **Step 1: Stage only the implementation files**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
git diff --cached --name-only
```

Expected:

```text
codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
codex-gui/src/features/transcriptState/transcriptStateSlice.ts
```

- [ ] **Step 2: Inspect the staged diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff --cached --check
git diff --cached --stat
```

Expected: no whitespace errors, and the staged diff does not include docs or unrelated files.

- [ ] **Step 3: Create the local commit**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git commit -m "fix(gui): use commit key for sticky bottom scroll"
```

Expected: local commit succeeds. Do not run `git push`, `git pull`, `git fetch`, `git remote`, or any other git remote command.
