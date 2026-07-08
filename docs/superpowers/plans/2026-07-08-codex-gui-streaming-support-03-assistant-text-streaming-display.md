# Assistant Text Streaming Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render live `agentMessage` projection delta text in the Codex GUI transcript surface, then converge to committed final answer content on `itemCompleted`.

**Architecture:** Keep Rust projection and 02e transcript data semantics unchanged. Add a live assistant display branch inside `CommittedTranscriptTurn`, share Streamdown safety configuration between committed and live Markdown renderers, and add an O(1) live scroll pulse field that lets sticky-bottom react to transient live height changes without changing `committedScrollCommitKey`.

**Tech Stack:** React 19, Redux Toolkit slice selectors, HeroUI v3 Card compound API, Streamdown static/streaming modes, Vitest Browser Mode, Vite, fnm-backed pnpm.

---

## Reference Documents Checked

- Design: `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/03-assistant-text-streaming-display-design.md`
- GUI local rules: `codex-gui/AGENTS.md`
- HeroUI Card docs: `codex-gui/.heroui-docs/react/components/(layout)/card.mdx`
- Vitest Browser assertions: `../vitest/docs/api/browser/assertions.md`
- Vitest Browser locators: `../vitest/docs/api/browser/locators.md`
- GUI scripts: `codex-gui/package.json`

Key constraints from references:

- HeroUI Card uses dot-notation compound parts such as `Card.Content`; `role="article"` is valid semantic markup.
- Browser tests should use `expect.element(...)` for retriable assertions on locators.
- `codex-gui/package.json` has `type-check`, `format:oxfmt`, and `test:unit`; targeted file checks should use `pnpm exec vitest --run <path>`.
- No dependency install or lockfile change is needed.

## Design Status

The 03 design does not need to be rewritten.

Reason:

- The design already says live delta participates in sticky-bottom without updating `committedScrollCommitKey`.
- The design already requires preserving committed transcript chunk boundaries and avoiding read-time live materialization.
- The new reference docs affect implementation and testing details, not the design decisions.

The plan is rewritten to avoid the previous read-path `Object.values(...).reduce(...)` live scroll selector. The implementation must instead maintain `liveScrollPulse` in the reducer and expose it through an O(1) selector.

## File Structure

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add `liveScrollPulse: number` to `TranscriptState`.
  - Increment `liveScrollPulse` when live item display state is created, updated, or removed.
  - Export `selectTranscriptLiveScrollPulse` as an O(1) selector.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Add reducer-level coverage for `liveScrollPulse`.
  - Confirm live updates still do not update `committedScrollCommitKey`.
- Create: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
  - Own shared Streamdown plugins, hardening, allowlist, inline code component, and class names.
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - Use shared Streamdown config and keep `mode="static"`.
- Create: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - Use shared Streamdown config with `mode="streaming"`, `isAnimating`, and `caret="block"`.
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Render live assistant messages between `MiddleTranscriptModule` and `FinalAssistantMessages`.
  - Keep live items out of committed chunks.
  - Hide the empty state while a live assistant item is present.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Add browser coverage for live text, Markdown rendering, placement, and completed convergence.
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
  - Depend on `selectTranscriptLiveScrollPulse` in addition to `selectCommittedTranscriptScrollCommitKey`.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Add sticky-bottom browser coverage for live assistant deltas.

## Verification Commands

Run from `codex-gui/` using the user's fnm-managed runtime:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Do not run `pnpm install`, `pnpm add`, or any dependency-changing command.

---

### Task 1: Reducer-Owned Live Scroll Pulse

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`

- [ ] **Step 1: Write the failing reducer test**

In `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, add `selectTranscriptLiveScrollPulse` to the existing selector imports:

```ts
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptLiveScrollPulse,
  selectTranscriptTurn,
} from "../transcriptStateSlice";
```

Add this test near the existing scroll key tests:

```ts
it("advances a live scroll pulse for live assistant display changes without changing the committed scroll key", () => {
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

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: FAIL because `selectTranscriptLiveScrollPulse` does not exist.

- [ ] **Step 3: Add `liveScrollPulse` to transcript state**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, update `TranscriptState`:

```ts
  liveScrollPulse: number;
```

Add the field to `initialState`:

```ts
  liveScrollPulse: 0,
```

Add the field to `createEmptyState()`:

```ts
  liveScrollPulse: 0,
```

Update `resetState`:

```ts
  state.liveScrollPulse = nextState.liveScrollPulse;
```

Add a small reducer helper near the live item helpers:

```ts
const bumpLiveScrollPulse = (state: TranscriptState) => {
  state.liveScrollPulse += 1;
};
```

- [ ] **Step 4: Bump the pulse only when live display state changes**

In `appendStartedLiveItem`, after `items.push(...)`, add:

```ts
  bumpLiveScrollPulse(state);
```

In `appendAgentMessageDeltaToLiveItem`, after incrementing `item.revision`, add:

```ts
  bumpLiveScrollPulse(state);
```

In `removeLiveItemIfPresent`, add `bumpLiveScrollPulse(state);` only after a live item has actually been removed:

```ts
  items.splice(itemIndex.index, 1);
  Reflect.deleteProperty(state.liveItemIndexByKey, key);
  bumpLiveScrollPulse(state);
```

Do not bump the pulse for missing-slot deltas, snapshot duplicates, committed-only updates, manual reconnect status, or attach replacement.

- [ ] **Step 5: Export the O(1) selector**

Add this selector:

```ts
    selectTranscriptLiveScrollPulse: (transcriptState): number =>
      transcriptState.liveScrollPulse,
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

- [ ] **Step 6: Run the focused reducer test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
git commit -m "feat(gui): track live transcript scroll pulse"
```

---

### Task 2: Live Assistant Surface Coverage

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Update imports for live delta surface coverage**

In `CommittedTranscriptSurface.browser.test.tsx`, update the transcript selector import:

```ts
import { selectCommittedTranscriptScrollCommitKey } from "@/features/transcriptState/transcriptStateSlice";
```

Update the runtime action import:

```ts
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

Update the fixture import:

```ts
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Update the builder import:

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

- [ ] **Step 2: Replace the old started-item surface test**

Replace `renders live completed items without rendering started items` with:

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

Notes for the implementer:

- The `screen.getBy*` calls return locators in this project’s browser test wrapper; keep using `expect.element(...)` for retriable assertions.
- Direct `document.querySelector(...)` checks are acceptable here for class and data attribute assertions after a retriable visible assertion has synchronized the DOM.

- [ ] **Step 3: Run the focused test and confirm it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because the transcript surface does not yet render live assistant items.

- [ ] **Step 4: Keep the failing test unstaged**

Do not commit this failing state. Continue to Task 3 and commit the test together with the passing implementation.

---

### Task 3: Live Assistant Markdown Rendering

**Files:**
- Create: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Create: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Create shared Streamdown rendering configuration**

Create `markdownRendering.tsx`:

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

- [ ] **Step 2: Keep committed Markdown static**

Replace `MarkdownText.tsx` with:

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

- [ ] **Step 3: Add live Markdown renderer**

Create `LiveMarkdownText.tsx`:

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

- [ ] **Step 4: Render live assistant messages in the turn body**

Update `CommittedTranscriptSurface.tsx` imports:

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

Update `CommittedTranscriptTurn`:

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
        isLiveAgentMessage,
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

Use `!hasTranscriptContent` where the component previously used `!hasCommittedEntries`.

HeroUI note: This follows the local HeroUI v3 Card docs by using the compound `Card.Content` API and semantic `role="article"` markup. The live card uses the default card variant, matching committed assistant entries.

- [ ] **Step 5: Run the focused surface test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2 and Task 3 together**

```bash
git add codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx
git commit -m "feat(gui): render live assistant transcript text"
```

---

### Task 4: Sticky-Bottom Uses The Reducer-Owned Live Pulse

**Files:**
- Modify: `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts`
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add failing App browser coverage for live delta sticky-bottom**

In `App.browser.test.tsx`, append these tests after the existing committed sticky-bottom tests:

```tsx
test("App keeps the document pinned to the bottom after a live assistant delta", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta", [
        agentMessage(
          "agent-scroll-live-delta-existing",
          longTranscriptText("Existing delta transcript"),
        ),
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
        agentMessage(
          "agent-scroll-live-delta-away-existing",
          longTranscriptText("Readable delta transcript"),
        ),
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

- [ ] **Step 2: Run the App browser test and confirm it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
```

Expected: FAIL because sticky-bottom does not yet subscribe to `selectTranscriptLiveScrollPulse`.

- [ ] **Step 3: Wire sticky-bottom to the live pulse**

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

- [ ] **Step 4: Run the focused App browser test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "feat(gui): keep sticky bottom during live assistant deltas"
```

---

### Task 5: Final Verification

**Files:**
- Verify all files changed by Tasks 1-4.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/__tests__/App.browser.test.tsx
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

Expected: PASS. If formatting is needed, run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

- [ ] **Step 4: Inspect diff for scope**

Run:

```bash
git diff --stat
git diff -- codex-gui/src/features/transcriptState codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts codex-gui/src/__tests__/App.browser.test.tsx
```

Expected:

- No Rust files changed.
- No protocol files changed.
- No package or lockfile changes.
- `selectTranscriptLiveScrollPulse` is O(1); it returns `transcriptState.liveScrollPulse`.
- No live delta updates `committedScrollCommitKey`.
- No render path flattens committed transcript chunks.

- [ ] **Step 5: Commit formatting-only changes if any**

If formatter changed files after Task 4, commit only those formatting changes:

```bash
git add codex-gui/src/features/transcriptState codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts codex-gui/src/__tests__/App.browser.test.tsx
git commit -m "chore(gui): format live assistant streaming display"
```

If formatter made no changes, do not create a commit.

## Self-Review Checklist

- Spec coverage: Covers agentMessage-only live rendering, turn placement, Streamdown streaming mode, completed convergence, sticky-bottom behavior, and committed chunk performance boundaries.
- Gap scan: Contains no open-ended implementation gaps.
- Type consistency: Uses `TranscriptRenderableLiveItem`, `selectTranscriptLiveItemsForTurn`, `selectTranscriptLiveScrollPulse`, `LiveMarkdownText`, and `LiveAssistantMessages` consistently.
- Reference alignment: Uses HeroUI v3 `Card.Content` compound API and Vitest Browser `expect.element(...)` locator assertions where asynchronous DOM assertions are needed.
- Scope check: Does not implement thinking/reasoning, tool calls, exec output, protocol changes, Rust changes, package changes, dependency installs, or lockfile updates.
