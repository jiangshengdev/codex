# Committed Transcript Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete `chatTextModel` complete-tree model with a committed-only React transcript surface that consumes bounded `transcriptState` selectors.

**Architecture:** Add `committedTranscriptSurface` as a UI consumer of `transcriptState`; it does not own facts, read runtime buffers, or fold timeline material. `App` continues to own GUI host wiring and renders the new committed transcript surface beside the existing host status panel. Delete `chatTextModel` and its tests once the new surface and app coverage prove the committed path works.

**Tech Stack:** TypeScript, React 19, Redux Toolkit selectors, React Redux typed hooks, Vitest Browser Mode, pnpm.

---

## Source Design

Implement exactly the confirmed small design:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/03-committed-transcript-surface-design.md`

Do not modify that design while executing this plan. If the design proves insufficient, stop implementation and report the mismatch before editing any design or plan content.

## Scope

This plan creates:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

This plan modifies:

- `codex-gui/src/App.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`

This plan deletes:

- `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`
- `codex-gui/src/features/chatTextModel/` if the directory is empty after deletion

This plan does not modify:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/03-committed-transcript-surface-design.md`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/features/projectionIngress/**`
- `codex-gui/src/features/liveEventHandling/**`
- `codex-gui/src/features/snapshotReplay/**`
- `codex-gui/src/features/guiHost/**`
- `codex-gui/src/app/store.ts`
- `codex-gui/src/main.tsx`
- `codex-gui/src/router.tsx`
- Any lockfile

## File Structure

- Create: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Exports `CommittedTranscriptSurface`.
  - Defines local memoized components for root, global status, turn, chunk, and entry rendering.
  - Consumes only `transcriptState` selectors through `useAppSelector`.
  - Does not build or export a complete transcript tree.
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Browser component coverage for empty, attach baseline, live committed update, and `itemStarted` ignored behavior.
- Modify: `codex-gui/src/App.tsx`
  - Imports and renders `CommittedTranscriptSurface`.
  - Keeps existing GUI host connection and status dispatch behavior unchanged.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Updates status panel expectations for the new layout.
  - Adds a focused app-level assertion that projection attach renders committed transcript content.
- Delete: `codex-gui/src/features/chatTextModel/**`
  - Removes the old complete grouped text model and its self-contained tests.

## Implementation Contracts

Use only these selectors and types from `transcriptStateSlice.ts`:

```ts
selectTranscriptTurnIds
selectTranscriptTurn
selectTranscriptChunkIdsForTurn
selectTranscriptChunk
selectTranscriptGlobalStatus
type TranscriptEntry
type TranscriptGlobalStatus
```

Do not import or consume:

```ts
selectThreadTimelineMaterials
buildChatTextModel
selectChatTextModel
ChatTextModel
ChatTextTurn
ChatTextMessageEntry
ChatTextGlobalStatus
```

Do not add active tail APIs in this plan:

```ts
selectActiveTailForTurn
activeTail
ActiveTail
```

Do not create this shape under a new name:

```ts
type CompleteTranscriptSurface = {
  turns: Array<{
    id: string;
    entries: TranscriptEntry[];
  }>;
  globalStatus: TranscriptGlobalStatus[];
};
```

---

### Task 1: Add Committed Transcript Surface Browser Tests

**Files:**
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Create the browser test file with focused fixtures**

Create `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`:

```tsx
import { expect, test } from "vitest";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
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
    threadId: attachBaseline.snapshot.thread.id,
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

const itemStarted = (
  commitId: string,
  turnId: string,
  item: ThreadItem,
): ThreadProjectionEventNotification => {
  if (eventItemStarted.event.type !== "itemStarted") {
    throw new Error("fixture must contain an itemStarted projection event");
  }

  return {
    ...eventItemStarted,
    threadId: attachBaseline.snapshot.thread.id,
    commitId,
    event: {
      ...eventItemStarted.event,
      notification: {
        ...eventItemStarted.event.notification,
        turnId,
        item,
      },
    },
  };
};
```

- [ ] **Step 2: Add an empty-state test**

Append this test:

```tsx
test("renders an empty committed transcript state", async () => {
  const screen = await renderWithProviders(<CommittedTranscriptSurface />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
```

- [ ] **Step 3: Add attach baseline rendering coverage**

Append this test:

```tsx
test("renders committed user and assistant messages from attach baseline", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const attach = attachWithTurns([
    baseTurn("turn-surface", [
      userMessage("user-surface", [textInput("Hello "), textInput("surface")]),
      agentMessage("agent-surface", "Committed response"),
    ]),
  ]);

  store.dispatch(threadRuntimeAttached(attach));

  await expect.element(screen.getByRole("article", { name: "Turn turn-surface" })).toBeVisible();
  await expect.element(screen.getByText("Hello surface")).toBeVisible();
  await expect.element(screen.getByText("Committed response")).toBeVisible();
});
```

- [ ] **Step 4: Add live committed update and `itemStarted` ignored coverage**

Append this test:

```tsx
test("renders live itemCompleted entries and ignores itemStarted entries", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  store.dispatch(threadRuntimeAttached(attachWithTurns([baseTurn("turn-live", [])])));

  store.dispatch(
    threadRuntimeEventBuffered(
      itemStarted("commit-started", "turn-live", agentMessage("agent-started", "Do not show")),
    ),
  );
  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        "commit-completed",
        "turn-live",
        agentMessage("agent-completed", "Show committed answer"),
      ),
    ),
  );

  await expect.element(screen.getByText("Show committed answer")).toBeVisible();
  await expect.element(screen.getByText("Do not show")).not.toBeInTheDocument();
});
```

- [ ] **Step 5: Add global status coverage**

Append this test:

```tsx
test("renders committed transcript global status", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const attach = attachWithTurns([]);
  store.dispatch(threadRuntimeAttached(attach));

  store.dispatch(
    threadRuntimeManualReconnectRequired({
      threadId: attach.snapshot.thread.id,
      subscriptionId: attach.subscriptionId,
      reason: "backpressure",
    }),
  );

  await expect
    .element(screen.getByText("Connection interrupted. Reconnect required."))
    .toBeVisible();
});
```

- [ ] **Step 6: Run the focused browser test and confirm it fails before implementation**

Run:

```bash
pnpm --dir /Users/jiangsheng/cnb/codex/codex-gui exec vitest --config=vitest.browser.config.ts run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because `@/features/committedTranscriptSurface/CommittedTranscriptSurface` does not exist.

---

### Task 2: Implement `CommittedTranscriptSurface`

**Files:**
- Create: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Create the component file**

Create `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`:

```tsx
import { memo } from "react";
import { useAppSelector } from "@/app/hooks";
import {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptEntry,
  type TranscriptGlobalStatus,
} from "@/features/transcriptState/transcriptStateSlice";

const SUBSCRIPTION_INTERRUPTED_TEXT = "Connection interrupted. Reconnect required.";

export const CommittedTranscriptSurface = () => {
  const turnIds = useAppSelector(selectTranscriptTurnIds);
  const globalStatus = useAppSelector(selectTranscriptGlobalStatus);
  const isEmpty = turnIds.length === 0 && globalStatus.length === 0;

  return (
    <section
      aria-label="Committed transcript"
      className="grid w-full gap-4 rounded-md border border-foreground/10 bg-background p-4"
    >
      <header className="grid gap-1">
        <h2 className="text-base font-semibold">Committed transcript</h2>
        <p className="text-sm text-foreground/60">Finalized messages only</p>
      </header>
      <CommittedTranscriptGlobalStatus statuses={globalStatus} />
      {isEmpty ? <p className="text-sm text-foreground/60">No committed messages yet.</p> : null}
      <div className="grid gap-4">
        {turnIds.map((turnId) => (
          <CommittedTranscriptTurn key={turnId} turnId={turnId} />
        ))}
      </div>
    </section>
  );
};

const CommittedTranscriptGlobalStatus = memo(
  ({ statuses }: { statuses: TranscriptGlobalStatus[] }) => {
    if (statuses.length === 0) {
      return null;
    }

    return (
      <div className="grid gap-2" role="status">
        {statuses.map((status) => (
          <p
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
            key={status.id}
          >
            {statusText(status)}
          </p>
        ))}
      </div>
    );
  },
);
CommittedTranscriptGlobalStatus.displayName = "CommittedTranscriptGlobalStatus";

const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));
  const chunkIds = useAppSelector((state) => selectTranscriptChunkIdsForTurn(state, turnId));

  if (turn == null) {
    return null;
  }

  return (
    <article aria-label={`Turn ${turn.id}`} className="grid gap-3">
      <div className="flex items-center gap-2 text-xs text-foreground/60">
        <span>turn</span>
        <code>{turn.id}</code>
        <span>{turn.status}</span>
      </div>
      <div className="grid gap-3">
        {chunkIds.map((chunkId) => (
          <CommittedTranscriptChunk chunkId={chunkId} key={chunkId} />
        ))}
      </div>
    </article>
  );
});
CommittedTranscriptTurn.displayName = "CommittedTranscriptTurn";

const CommittedTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useAppSelector((state) => selectTranscriptChunk(state, chunkId));

  if (chunk == null) {
    return null;
  }

  return (
    <div className="grid gap-2" data-chunk-id={chunk.id} data-chunk-revision={chunk.revision}>
      {chunk.entries.map((entry) => (
        <CommittedTranscriptEntry entry={entry} key={entry.id} />
      ))}
    </div>
  );
});
CommittedTranscriptChunk.displayName = "CommittedTranscriptChunk";

const CommittedTranscriptEntry = memo(({ entry }: { entry: TranscriptEntry }) => {
  switch (entry.type) {
    case "message":
      return (
        <div className="grid gap-1 rounded-md border border-foreground/10 px-3 py-2">
          <div className="text-xs font-medium text-foreground/60">{entry.role}</div>
          <p className="whitespace-pre-wrap text-sm">{entry.source}</p>
        </div>
      );
    case "status":
      return (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          Turn {entry.status}
        </p>
      );
  }
});
CommittedTranscriptEntry.displayName = "CommittedTranscriptEntry";

const statusText = (status: TranscriptGlobalStatus): string => {
  switch (status.status) {
    case "subscriptionInterrupted":
      return SUBSCRIPTION_INTERRUPTED_TEXT;
  }
};
```

- [ ] **Step 2: Run the focused browser test and confirm it passes**

Run:

```bash
pnpm --dir /Users/jiangsheng/cnb/codex/codex-gui exec vitest --config=vitest.browser.config.ts run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS for the new committed transcript surface tests.

- [ ] **Step 3: Commit the new surface**

Run:

```bash
git add codex-gui/src/features/committedTranscriptSurface
git commit -m "feat(gui): add committed transcript surface"
```

---

### Task 3: Mount the Surface in `App`

**Files:**
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Test: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Update the App layout**

Modify `codex-gui/src/App.tsx` to import and render `CommittedTranscriptSurface`.

At the top, add:

```tsx
import { CommittedTranscriptSurface } from "./features/committedTranscriptSurface/CommittedTranscriptSurface";
```

Replace the current `return` JSX with:

```tsx
  return (
    <main
      className="grid min-h-svh gap-6 bg-background px-6 py-10 text-foreground"
      data-gui-host-status={status.label}
    >
      <section className="grid w-full max-w-sm gap-3 text-sm">
        <h1 className="text-base font-semibold">GUI host</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-foreground/60">status</dt>
          <dd aria-live="polite">
            {status.label === "error" ? `error: ${status.message}` : status.label}
          </dd>
          <dt className="text-foreground/60">attached</dt>
          <dd>{isAttached ? "yes" : "no"}</dd>
          <dt className="text-foreground/60">events</dt>
          <dd>{status.eventCount}</dd>
          <dt className="text-foreground/60">last event</dt>
          <dd>{status.lastEventType ?? "none"}</dd>
        </dl>
      </section>
      <CommittedTranscriptSurface />
    </main>
  );
```

- [ ] **Step 2: Add App-level committed transcript test fixtures**

In `codex-gui/src/__tests__/App.browser.test.tsx`, add these helper functions after `const launchThreadId = attachResponse.snapshot.thread.id;`:

```tsx
const textInput = (text: string) => ({
  type: "text" as const,
  text,
  text_elements: [],
});

const userMessage = (id: string, text: string) => ({
  type: "userMessage" as const,
  id,
  clientId: null,
  content: [textInput(text)],
});

const agentMessage = (id: string, text: string) => ({
  type: "agentMessage" as const,
  id,
  text,
  phase: "final_answer" as const,
  memoryCitation: null,
});

const attachWithCommittedMessages = (): ThreadProjectionAttachResponse => ({
  ...attachResponse,
  snapshot: {
    ...attachResponse.snapshot,
    thread: {
      ...attachResponse.snapshot.thread,
      turns: [
        {
          id: "turn-app-surface",
          items: [
            userMessage("user-app-surface", "Hello from App"),
            agentMessage("agent-app-surface", "Committed App response"),
          ],
          itemsView: "full",
          status: "completed",
          error: null,
          startedAt: 1700000001,
          completedAt: 1700000005,
          durationMs: 4000,
        },
      ],
    },
  },
});
```

- [ ] **Step 3: Add App-level rendering coverage**

Append this test to `codex-gui/src/__tests__/App.browser.test.tsx`:

```tsx
test("App renders committed transcript content after projection attach", async () => {
  const screen = await renderWithProviders(<App />);
  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];

  options?.onProjectionAttached?.(attachWithCommittedMessages());

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("Hello from App")).toBeVisible();
  await expect.element(screen.getByText("Committed App response")).toBeVisible();
});
```

- [ ] **Step 4: Run the focused App browser test**

Run:

```bash
pnpm --dir /Users/jiangsheng/cnb/codex/codex-gui exec vitest --config=vitest.browser.config.ts run src/__tests__/App.browser.test.tsx
```

Expected: PASS. Existing GUI host status assertions should still pass, and the new committed transcript assertion should pass.

- [ ] **Step 5: Commit App mounting**

Run:

```bash
git add codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): render committed transcript surface"
```

---

### Task 4: Delete `chatTextModel`

**Files:**
- Delete: `codex-gui/src/features/chatTextModel/chatTextModel.ts`
- Delete: `codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts`
- Test: symbol search over `codex-gui/src`

- [ ] **Step 1: Delete the old model and tests**

Run:

```bash
git rm codex-gui/src/features/chatTextModel/chatTextModel.ts codex-gui/src/features/chatTextModel/__tests__/chatTextModel.test.ts
```

If both directories are empty after deletion, remove the empty directories:

```bash
rmdir codex-gui/src/features/chatTextModel/__tests__ codex-gui/src/features/chatTextModel
```

- [ ] **Step 2: Verify old symbols are gone**

Run:

```bash
rg -n "chatTextModel|buildChatTextModel|selectChatTextModel|ChatTextModel|ChatTextTurn|ChatTextMessageEntry|ChatTextGlobalStatus" /Users/jiangsheng/cnb/codex/codex-gui/src
```

Expected: no matches.

- [ ] **Step 3: Verify forbidden complete-tree replacement was not introduced**

Run:

```bash
rg -n "CompleteTranscriptSurface|turns:.*entries|selectThreadTimelineMaterials|snapshotTurns|eventBuffer|selectActiveTailForTurn|activeTail|ActiveTail" /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface /Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx
```

Expected: no matches.

- [ ] **Step 4: Re-run focused browser coverage**

Run:

```bash
pnpm --dir /Users/jiangsheng/cnb/codex/codex-gui exec vitest --config=vitest.browser.config.ts run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit old model deletion**

Run:

```bash
git add codex-gui/src/features/chatTextModel codex-gui/src/features/committedTranscriptSurface codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "refactor(gui): remove chat text model"
```

---

### Task 5: Focused Verification

**Files:**
- Inspect: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Inspect: `codex-gui/src/__tests__/App.browser.test.tsx`
- Inspect: `codex-gui/src/features/chatTextModel/**`
- Inspect: `git diff --stat`

- [ ] **Step 1: Run focused browser tests**

Run:

```bash
pnpm --dir /Users/jiangsheng/cnb/codex/codex-gui exec vitest --config=vitest.browser.config.ts run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run focused type checking**

Run:

```bash
pnpm --dir /Users/jiangsheng/cnb/codex/codex-gui run type-check
```

Expected: PASS.

- [ ] **Step 3: Verify old model symbols are absent**

Run:

```bash
rg -n "chatTextModel|buildChatTextModel|selectChatTextModel|ChatTextModel|ChatTextTurn|ChatTextMessageEntry|ChatTextGlobalStatus" /Users/jiangsheng/cnb/codex/codex-gui/src
```

Expected: no matches.

- [ ] **Step 4: Verify active tail was not added**

Run:

```bash
rg -n "selectActiveTailForTurn|activeTail|ActiveTail" /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface /Users/jiangsheng/cnb/codex/codex-gui/src/App.tsx
```

Expected: no matches.

- [ ] **Step 5: Verify runtime/timeline layers were not modified for compatibility**

Run:

```bash
git diff --stat -- codex-gui/src/features/transcriptState codex-gui/src/features/threadRuntime codex-gui/src/features/projectionIngress codex-gui/src/features/liveEventHandling codex-gui/src/features/snapshotReplay codex-gui/src/features/guiHost codex-gui/src/app/store.ts codex-gui/src/main.tsx codex-gui/src/router.tsx
```

Expected: no output, because this plan should not touch those files.

- [ ] **Step 6: Inspect changed files**

Run:

```bash
git diff --stat
git diff -- codex-gui/src/features/committedTranscriptSurface codex-gui/src/App.tsx codex-gui/src/__tests__/App.browser.test.tsx
```

Expected: diff is limited to the new committed transcript surface, App mounting, App browser coverage, and deletion of `chatTextModel`.

## Stop Conditions

Stop and report instead of widening the implementation if any of these happen:

- `transcriptState` selectors are insufficient for committed chunk rendering.
- The implementation needs active tail, streaming, running tool/hook/plan/reasoning, or `selectActiveTailForTurn`.
- The implementation needs real virtualization / windowing to delete `chatTextModel`.
- A test requires reading `snapshotTurns + eventBuffer` or `selectThreadTimelineMaterials` from the new production surface.
- A package manager command attempts to modify a lockfile.
- The design document appears wrong; implementation must not edit it.
