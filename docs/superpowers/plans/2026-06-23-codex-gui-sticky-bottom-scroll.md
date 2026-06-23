# codex-gui Sticky Bottom Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the `codex-gui` chat page pinned to the bottom after attach snapshots and live committed messages, but only while the user is already following the bottom of the page.

**Architecture:** Add a small AppShell-owned sticky-bottom hook that observes a bottom sentinel with `IntersectionObserver`, tracks whether the page is pinned, and scrolls the document to its bottom when transcript content revisions change. Keep transcript data state unchanged; the hook derives a UI-only revision key from existing transcript selectors.

**Tech Stack:** React 19, Redux Toolkit selectors, Vitest Browser Mode, `vitest-browser-react`, existing projection fixtures/builders.

---

## File Structure

- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Add App-level browser tests for attach snapshot sticky-bottom behavior, live message sticky-bottom behavior, and user-scrolled-up preservation.
- Create: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
  - Own page-level sticky-bottom behavior for the committed transcript.
  - Derive a transcript scroll revision key from existing selectors.
  - Observe the sentinel and scroll `document.scrollingElement` only when still pinned.
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
  - Call the hook and render the bottom sentinel after `CommittedTranscriptSurface`.
- Do not modify:
  - `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - `codex-gui/src/features/guiHost/*`

## Task 1: Add Failing App Browser Tests

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add test imports**

In `codex-gui/src/__tests__/App.browser.test.tsx`, update the existing imports.

Add `eventItemCompleted` to the projection fixture import:

```ts
import {
  closedBackpressure,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Add projection builder imports below the fixture import:

```ts
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Add scroll test helpers**

Add these helpers after `beforeEach(...)` in `codex-gui/src/__tests__/App.browser.test.tsx`:

```ts
const longTranscriptText = (label: string): string =>
  Array.from({ length: 96 }, (_, index) => `${label} line ${index + 1}`).join("\n");

const documentScroller = (): HTMLElement => {
  const scroller = document.scrollingElement;
  if (!(scroller instanceof HTMLElement)) {
    throw new Error("document.scrollingElement must be available");
  }

  return scroller;
};

const scrollToDocumentBottom = (): void => {
  const scroller = documentScroller();
  scroller.scrollTop = scroller.scrollHeight;
};

const distanceFromDocumentBottom = (): number => {
  const scroller = documentScroller();
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
};

const expectDocumentAtBottom = (): void => {
  expect(distanceFromDocumentBottom()).toBeLessThanOrEqual(4);
};

const waitForBrowserFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
```

- [ ] **Step 3: Add a failing test for attach snapshot sticky-bottom behavior**

Add this test near the existing transcript rendering tests:

```ts
test("App keeps the document pinned to the bottom after attaching a long transcript", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  scrollToDocumentBottom();
  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-attach", [
        agentMessage("agent-scroll-attach", longTranscriptText("Attached transcript")),
      ]),
    ]),
  );

  await expect.element(screen.getByText("Attached transcript line 96")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});
```

- [ ] **Step 4: Add a failing test for live new-message sticky-bottom behavior**

Add this test after the attach sticky-bottom test:

```ts
test("App keeps the document pinned to the bottom after a live committed message", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live", [
        agentMessage("agent-scroll-live-existing", longTranscriptText("Existing transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Existing transcript line 96")).toBeVisible();
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  emitProjectionEvent(
    options,
    itemCompleted(
      eventItemCompleted,
      "commit-scroll-live-new",
      "turn-scroll-live",
      agentMessage("agent-scroll-live-new", "Live sticky bottom message"),
    ),
  );

  await expect.element(screen.getByText("Live sticky bottom message")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});
```

- [ ] **Step 5: Add a failing test for preserving user scroll position**

Add this test after the live sticky-bottom test:

```ts
test("App does not force the document to the bottom after a live message when the user scrolled up", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-away", [
        agentMessage("agent-scroll-away-existing", longTranscriptText("Scrollable transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Scrollable transcript line 96")).toBeVisible();
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scroller = documentScroller();
  scroller.scrollTop = 0;
  document.dispatchEvent(new Event("scroll"));
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scrollTopBeforeMessage = scroller.scrollTop;

  emitProjectionEvent(
    options,
    itemCompleted(
      eventItemCompleted,
      "commit-scroll-away-new",
      "turn-scroll-away",
      agentMessage("agent-scroll-away-new", "Message while reading history"),
    ),
  );

  await expect.element(screen.getByText("Message while reading history")).toBeVisible();
  await waitForBrowserFrame();
  expect(scroller.scrollTop).toBeLessThanOrEqual(scrollTopBeforeMessage + 4);
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);
});
```

- [ ] **Step 6: Run the focused browser test and verify failure**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: at least the new sticky-bottom tests fail because no sentinel observer or sticky-bottom scroll hook exists yet.

## Task 2: Implement the Sticky-Bottom Hook

**Files:**
- Create: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] **Step 1: Create the hook file**

Create `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts` with this content:

```ts
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptTurnIds,
} from "@/features/transcriptState/transcriptStateSlice";

const selectCommittedTranscriptScrollRevision = (state: RootState): string =>
  selectTranscriptTurnIds(state)
    .map((turnId) => {
      const chunkRevisionKey = selectTranscriptChunkIdsForTurn(state, turnId)
        .map((chunkId) => {
          const chunk = selectTranscriptChunk(state, chunkId);
          return `${chunkId}:${chunk?.revision ?? "missing"}:${chunk?.entries.length ?? 0}`;
        })
        .join(",");

      return `${turnId}[${chunkRevisionKey}]`;
    })
    .join("|");

const documentScroller = (): Element | null => document.scrollingElement;

const scrollDocumentToBottom = (): void => {
  const scroller = documentScroller();
  if (scroller == null) {
    return;
  }

  scroller.scrollTo({ top: scroller.scrollHeight });
};

export const useCommittedTranscriptStickyBottom = (): RefObject<HTMLDivElement | null> => {
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const scrollRevision = useAppSelector(selectCommittedTranscriptScrollRevision);

  useEffect(() => {
    const bottomSentinel = bottomSentinelRef.current;
    if (bottomSentinel == null || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        pinnedToBottomRef.current = entry?.isIntersecting ?? false;
      },
      { root: null, threshold: 1 },
    );
    observer.observe(bottomSentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (!pinnedToBottomRef.current) {
      return;
    }

    scrollDocumentToBottom();
  }, [scrollRevision]);

  return bottomSentinelRef;
};
```

- [ ] **Step 2: Run type-check and capture implementation issues**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: either PASS, or a focused TypeScript error in the new hook. If TypeScript reports a DOM type mismatch for `scrollTo` or `scrollHeight`, adjust `documentScroller()` to return `HTMLElement | null` by checking `instanceof HTMLElement`.

## Task 3: Wire the Hook into AppShell

**Files:**
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`

- [ ] **Step 1: Import the hook**

Update `codex-gui/src/features/appShell/AppShell.tsx` imports:

```ts
import { Surface, Toast } from "@heroui/react";
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { useCommittedTranscriptStickyBottom } from "./useCommittedTranscriptStickyBottom";
```

- [ ] **Step 2: Render the bottom sentinel**

Update `AppShell` to call the hook and render a sentinel after the transcript surface:

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

- [ ] **Step 3: Run the focused browser test and verify sticky-bottom behavior**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: the new sticky-bottom tests pass, and existing App browser tests continue to pass.

- [ ] **Step 4: Commit the test and implementation changes**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/__tests__/App.browser.test.tsx codex-gui/src/features/appShell/AppShell.tsx codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
git commit -m "fix(gui): keep chat pinned to bottom"
```

Expected: local commit succeeds. Do not run `git push`, `git pull`, `git fetch`, or any other remote git command.

## Task 4: Final Verification

**Files:**
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `codex-gui/src/features/appShell/AppShell.tsx`
- Verify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] **Step 1: Run type-check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 2: Run focused browser tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run formatting check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
```

Expected: PASS. If it fails only on changed files, run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec prettier --write src/__tests__/App.browser.test.tsx src/features/appShell/AppShell.tsx src/features/appShell/useCommittedTranscriptStickyBottom.ts
```

Then rerun:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
```

- [ ] **Step 4: Inspect final local diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git status --short
git diff --check
```

Expected: no whitespace errors. If the implementation was already committed in Task 3, `git status --short` should only show unrelated pre-existing files or later plan/doc edits.

- [ ] **Step 5: Optional full frontend CI**

Run this only if the focused checks pass and the executor has enough time:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run ci
```

Expected: PASS. This is broader than the feature scope, so record any unrelated failure separately instead of widening the implementation.
