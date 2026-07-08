# Assistant Text Streaming Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render live `agentMessage` projection delta text in the Codex GUI transcript surface, then converge to committed final answer content on `itemCompleted`.

**Architecture:** Keep projection and transcript data semantics from 02e unchanged. Add a live assistant display path inside `CommittedTranscriptTurn`, share Streamdown safety configuration between committed and live Markdown renderers, and extend sticky-bottom behavior with a transient live scroll pulse that is separate from the committed scroll commit key.

**Tech Stack:** React 19, Redux Toolkit slice selectors, HeroUI v3 Card/Typography surface components, Streamdown streaming/static modes, Vitest Browser Mode, Vite, fnm-backed pnpm.

---

## File Structure

- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Add `LiveAssistantMessages` and `LiveAssistantMessageEntry`.
  - Render live assistant messages between `MiddleTranscriptModule` and `FinalAssistantMessages`.
  - Treat turns with live assistant content as transcript content so the empty state is hidden while streaming.
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - Move shared Streamdown configuration to `markdownRendering.tsx`.
  - Keep committed Markdown in `mode="static"`.
- Create: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - Render live assistant Markdown with `mode="streaming"`, `isAnimating`, and `caret="block"`.
- Create: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
  - Own shared Streamdown plugins, rehype hardening, element allowlist, inline code component, and class names.
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
  - Add a live scroll pulse dependency so live delta height changes participate in sticky-bottom without changing committed scroll keys.
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Export `selectTranscriptLiveScrollPulse`.
  - Keep `selectCommittedTranscriptScrollCommitKey` semantics unchanged.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Add browser tests for live streaming display, Markdown rendering, placement, and completed convergence.
  - Update the old started-item expectation so started live items can create an empty live position without showing `initialItem` text.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Add sticky-bottom tests for live delta updates.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Add selector coverage for live scroll pulse and confirm delta still does not update `committedScrollCommitKey`.

## Verification Commands

Run commands from `codex-gui/` with the user's fnm-managed runtime:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

`codex-gui/package.json` currently defines `type-check` and `test:unit`; the plan uses `pnpm exec vitest --run <path>` for targeted test files because there is no path-scoped package script.

---

### Task 1: Add Failing Browser Coverage For Live Assistant Display

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Add imports for live deltas and scroll key assertions**

Update the imports at the top of `CommittedTranscriptSurface.browser.test.tsx`:

```ts
import {
  selectCommittedTranscriptScrollCommitKey,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

Update the projection fixture import:

```ts
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Update the projection builder import:

```ts
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
```

- [ ] **Step 2: Replace the old started-item surface test with live streaming coverage**

Replace the existing test named `renders live completed items without rendering started items` with this test:

```ts
test("renders live assistant text between intermediate updates and final answers", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachScrollKey = selectCommittedTranscriptScrollCommitKey(store.getState());
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(eventTurnStarted, "commit-turn-live", inProgressTurn("turn-live")),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-started",
        "turn-live",
        agentMessage("agent-started", "Draft answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("article", { name: "Turn turn-live" })).toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).not.toBeNull();

  store.dispatch(
    threadRuntimeDeltaAccepted({
      notification: agentMessageDelta(
        eventAgentMessageDelta,
        "turn-live",
        "agent-started",
        "**Streaming** answer",
      ),
    }),
  );

  await expect.element(screen.getByText("Streaming")).toBeVisible();
  await expect.element(screen.getByText("answer")).toBeVisible();
  expect(
    document.querySelector(
      '.committed-transcript-live-assistant-message [data-streamdown="strong"]',
    ),
  ).not.toBeNull();
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachScrollKey);

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-completed",
        "turn-live",
        agentMessage("agent-started", "Final answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Streaming")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();
});
```

- [ ] **Step 3: Run the focused test and confirm it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because `CommittedTranscriptSurface` does not yet render live assistant items and still shows the empty state for live-only turns.

- [ ] **Step 4: Keep the failing test unstaged**

Do not commit this failing state. Continue directly to Task 2 and commit the test with the implementation after the focused surface test passes.

---

### Task 2: Render Live Assistant Markdown In The Transcript Surface

**Files:**
- Create: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Create: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Create shared Streamdown rendering configuration**

Create `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`:

```tsx
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { defaultRehypePlugins, type AllowElement, type Components } from "streamdown";

export const streamdownPlugins = { code, cjk };

export const streamdownRehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
].filter((plugin): plugin is NonNullable<typeof plugin> => plugin != null);

export const allowMarkdownElement: AllowElement = ({ tagName }) => tagName !== "img";

export const streamdownComponents: Components = {
  inlineCode: ({ children, className, node: _node, ...props }) => (
    <code
      className={[
        "rounded border border-border bg-default px-1 py-0.5 font-mono text-sm text-default-700 wrap-break-word",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </code>
  ),
};

export const markdownContainerClassName =
  "committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6";

export const markdownStreamdownClassName = "min-w-0 wrap-break-word";
```

- [ ] **Step 2: Update committed MarkdownText to use shared configuration**

Replace `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx` with:

```tsx
import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownPlugins,
  streamdownRehypePlugins,
} from "./markdownRendering";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className={markdownContainerClassName}>
    <Streamdown
      allowElement={allowMarkdownElement}
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="static"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 3: Add LiveMarkdownText**

Create `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`:

```tsx
import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownPlugins,
  streamdownRehypePlugins,
} from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown
      allowElement={allowMarkdownElement}
      caret="block"
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      isAnimating
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 4: Add live assistant rendering to CommittedTranscriptSurface**

Update imports in `CommittedTranscriptSurface.tsx`:

```tsx
import {
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  type TranscriptEntry,
  type TranscriptRenderableLiveItem,
} from "@/features/transcriptState/transcriptStateSlice";
import { LiveMarkdownText } from "./LiveMarkdownText";
```

Add these helpers below `CommittedTranscriptEntry`:

```tsx
const isLiveAgentMessage = (item: TranscriptRenderableLiveItem): boolean =>
  item.initialItem.type === "agentMessage";

const LiveAssistantMessageEntry = ({ item }: { item: TranscriptRenderableLiveItem }) => (
  <Card
    className="committed-transcript-live-entry committed-transcript-live-assistant-message min-w-0"
    role="article"
  >
    <Card.Content className="grid min-w-0 gap-2">
      <LiveMarkdownText source={item.transientText} />
    </Card.Content>
  </Card>
);

const LiveAssistantMessages = ({ items }: { items: readonly TranscriptRenderableLiveItem[] }) => {
  const agentItems = items.filter(isLiveAgentMessage);

  if (agentItems.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-live-assistant-list grid min-w-0 gap-3">
      {agentItems.map((item) => (
        <LiveAssistantMessageEntry item={item} key={item.key} />
      ))}
    </div>
  );
};
```

Update `CommittedTranscriptTurn` so it selects live items and renders live content:

```tsx
const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));
  const liveItems = useAppSelector((state) => selectTranscriptLiveItemsForTurn(state, turnId));

  if (turn == null) {
    return null;
  }

  const hasLiveAssistantMessages = liveItems.some(isLiveAgentMessage);
  const hasEntries =
    turn.leadingPromptEntryId != null ||
    turn.middleChunkIds.length > 0 ||
    turn.finalAssistantEntryIds.length > 0;

  if (!hasEntries && !hasLiveAssistantMessages) {
    return null;
  }

  return (
    <article
      aria-label={`Turn ${turn.id}`}
      className="committed-transcript-turn grid min-w-0 gap-3"
    >
      <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
        <Chip className="committed-transcript-turn-status" color="default" size="sm">
          {turn.status}
        </Chip>
      </div>
      <div className="committed-transcript-chunk grid min-w-0 gap-3">
        <LeadingPromptEntry entryId={turn.leadingPromptEntryId} />
        <MiddleTranscriptModule
          chunkIds={turn.middleChunkIds}
          hasFinalAnswer={turn.finalAssistantEntryIds.length > 0}
          middleEntryCount={turn.middleEntryCount}
        />
        <LiveAssistantMessages items={liveItems} />
        <FinalAssistantMessages entryIds={turn.finalAssistantEntryIds} />
      </div>
    </article>
  );
});
```

Update the surface content predicate:

```tsx
  const hasTranscriptContent = useAppSelector((state) =>
    selectTranscriptTurnIds(state).some((turnId) => {
      const turn = selectTranscriptTurn(state, turnId);
      const hasLiveAssistantMessages = selectTranscriptLiveItemsForTurn(state, turnId).some(
        (item) => item.initialItem.type === "agentMessage",
      );
      return (
        hasLiveAssistantMessages ||
        (turn != null &&
          (turn.leadingPromptEntryId != null ||
            turn.middleChunkIds.length > 0 ||
            turn.finalAssistantEntryIds.length > 0))
      );
    }),
  );
```

Then render the empty state from `!hasTranscriptContent` instead of `!hasCommittedEntries`.

- [ ] **Step 5: Run the focused surface test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the live display implementation and passing browser coverage**

```bash
git add codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git commit -m "feat(gui): render live assistant transcript text"
```

---

### Task 3: Add Failing Sticky-Bottom Coverage For Live Deltas

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add live delta sticky-bottom tests**

Append these tests after the existing committed sticky-bottom tests:

```tsx
test("App keeps the document pinned to the bottom after a live assistant delta", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta", [
        agentMessage("agent-scroll-live-delta-existing", longTranscriptText("Existing delta transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Existing delta transcript line 96")).toBeVisible();

  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-scroll-live-delta-turn",
    inProgressTurn("turn-scroll-live-delta"),
  );
  const itemStartedEvent = {
    ...itemStarted(
      eventItemStarted,
      "commit-scroll-live-delta-started",
      "turn-scroll-live-delta",
      agentMessage("agent-scroll-live-delta", ""),
    ),
    parentCommitId: turnStartedEvent.commitId,
  };

  emitProjectionEvent(options, {
    ...turnStartedEvent,
    parentCommitId: null,
  });
  emitProjectionEvent(options, itemStartedEvent);
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  emitProjectionDelta(
    options,
    agentMessageDelta(
      eventAgentMessageDelta,
      "turn-scroll-live-delta",
      "agent-scroll-live-delta",
      longTranscriptText("Streaming delta transcript"),
    ),
  );
  await waitForBrowserFrame();

  await expect.element(screen.getByText("Streaming delta transcript line 96")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});

test("App does not force the document to the bottom after a live assistant delta when the user scrolled up", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta-away", [
        agentMessage("agent-scroll-live-delta-away-existing", longTranscriptText("Readable delta transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Readable delta transcript line 96")).toBeVisible();

  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-scroll-live-delta-away-turn",
    inProgressTurn("turn-scroll-live-delta-away"),
  );
  const itemStartedEvent = {
    ...itemStarted(
      eventItemStarted,
      "commit-scroll-live-delta-away-started",
      "turn-scroll-live-delta-away",
      agentMessage("agent-scroll-live-delta-away", ""),
    ),
    parentCommitId: turnStartedEvent.commitId,
  };

  emitProjectionEvent(options, {
    ...turnStartedEvent,
    parentCommitId: null,
  });
  emitProjectionEvent(options, itemStartedEvent);
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scroller = documentScroller();
  scrollToDocumentTop();
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scrollTopBeforeDelta = scroller.scrollTop;
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

  emitProjectionDelta(
    options,
    agentMessageDelta(
      eventAgentMessageDelta,
      "turn-scroll-live-delta-away",
      "agent-scroll-live-delta-away",
      longTranscriptText("Streaming while reading history"),
    ),
  );
  await waitForBrowserFrame();

  await expect.element(screen.getByText("Streaming while reading history line 96")).toBeVisible();
  await expectDocumentScrollStaysAwayFromBottom(scrollTopBeforeDelta + 4);
});
```

- [ ] **Step 2: Run the App browser test and confirm the pinned-bottom live delta test fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
```

Expected: FAIL because `useCommittedTranscriptStickyBottom` only depends on `selectCommittedTranscriptScrollCommitKey`, and live delta does not update that key.

- [ ] **Step 3: Keep the failing sticky-bottom tests unstaged**

Do not commit this failing state. Continue directly to Task 4 and commit the tests with the implementation after the focused App browser test passes.

---

### Task 4: Add A Live Scroll Pulse Without Changing Committed Scroll Keys

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] **Step 1: Add selector tests for the live scroll pulse**

Update imports in `transcriptStateLiveEvents.test.ts` to include `selectTranscriptLiveScrollPulse`.

Add this test near the existing scroll key tests:

```ts
it("advances the live scroll pulse for live assistant item updates without changing the committed scroll key", () => {
  const store = setupStore();
  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachKey = selectCommittedTranscriptScrollCommitKey(store.getState());
  const initialPulse = selectTranscriptLiveScrollPulse(store.getState());

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(
        eventTurnStarted,
        "commit-live-scroll-pulse-turn",
        inProgressTurn("turn-live-scroll-pulse"),
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-live-scroll-pulse-started",
        "turn-live-scroll-pulse",
        agentMessage("agent-live-scroll-pulse", ""),
      ),
      replay: "live",
    }),
  );

  const startedPulse = selectTranscriptLiveScrollPulse(store.getState());
  expect(startedPulse).toBeGreaterThan(initialPulse);
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

  store.dispatch(
    threadRuntimeDeltaAccepted({
      notification: agentMessageDelta(
        eventAgentMessageDelta,
        "turn-live-scroll-pulse",
        "agent-live-scroll-pulse",
        "Live pulse delta",
      ),
    }),
  );

  const deltaPulse = selectTranscriptLiveScrollPulse(store.getState());
  expect(deltaPulse).toBeGreaterThan(startedPulse);
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachKey);

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-live-scroll-pulse-completed",
        "turn-live-scroll-pulse",
        agentMessage("agent-live-scroll-pulse", "Completed pulse answer"),
      ),
      replay: "live",
    }),
  );

  expect(selectTranscriptLiveScrollPulse(store.getState())).toBeGreaterThan(deltaPulse);
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(
    "event:commit-live-scroll-pulse-completed",
  );
});
```

- [ ] **Step 2: Add selectTranscriptLiveScrollPulse**

In `transcriptStateSlice.ts`, add this selector beside the other selectors:

```ts
    selectTranscriptLiveScrollPulse: (transcriptState): number =>
      Object.values(transcriptState.liveItemsByTurnId).reduce(
        (total, items) =>
          total +
          items.length +
          items.reduce((itemTotal, item) => itemTotal + item.revision + item.transientText.length, 0),
        0,
      ),
```

Export it with the existing selectors:

```ts
export const {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptLiveScrollPulse,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;
```

- [ ] **Step 3: Update sticky-bottom hook to depend on the live pulse**

Update `useCommittedTranscriptStickyBottom.ts` imports:

```ts
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptLiveScrollPulse,
} from "@/features/transcriptState/transcriptStateSlice";
```

Update the hook:

```ts
  const scrollCommitKey = useAppSelector(selectCommittedTranscriptScrollCommitKey);
  const liveScrollPulse = useAppSelector(selectTranscriptLiveScrollPulse);
```

Update the layout effect dependency:

```ts
  useLayoutEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollDocumentToBottom();
    }
  }, [liveScrollPulse, scrollCommitKey]);
```

- [ ] **Step 4: Run focused transcript state and App tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the sticky-bottom implementation and passing browser coverage**

```bash
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): keep sticky bottom during live assistant deltas"
```

---

### Task 5: Final Verification And Formatting

**Files:**
- Verify all files changed by Tasks 1-4.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run formatter check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: PASS. If it fails only because formatting is needed, run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

- [ ] **Step 4: Inspect diff**

Run:

```bash
git diff --stat
git diff -- codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts codex-gui/src/features/transcriptState
```

Expected:

- No Rust files changed.
- No protocol files changed.
- No package or lockfile changes.
- No committed transcript chunk flattening in render paths.
- No updates to `committedScrollCommitKey` from delta-only live updates.

- [ ] **Step 5: Commit final formatting adjustments if any**

If formatter changed files after Task 4, commit only those formatting changes:

```bash
git add codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts codex-gui/src/features/transcriptState
git commit -m "chore(gui): format live assistant streaming display"
```

If formatter made no changes, do not create a commit.

## Self-Review Checklist

- Spec coverage: The plan implements agentMessage-only live rendering, turn placement, streaming Streamdown mode, completed convergence, sticky-bottom behavior, and committed chunk performance boundaries from `03-assistant-text-streaming-display-design.md`.
- Gap scan: This plan contains no open-ended implementation gaps.
- Type consistency: The plan consistently uses `TranscriptRenderableLiveItem`, `selectTranscriptLiveItemsForTurn`, `selectTranscriptLiveScrollPulse`, `LiveMarkdownText`, and `LiveAssistantMessages`.
- Scope check: The plan does not implement thinking/reasoning, tool calls, exec output, protocol changes, Rust changes, package changes, or dependency installs.
