# Codex GUI Transcript Turn Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-turn display grouping with a Redux transcript turn structure that directly separates the leading prompt entry, middle chunked entries, and final assistant entries.

**Architecture:** Keep `entriesById`, `chunksById`, and `entryChunkById`, but change chunks to contain only middle entries. Store `leadingPromptEntryId`, `middleChunkIds`, and `finalAssistantEntryIds` on each `TranscriptTurn`, and update `CommittedTranscriptSurface` to render those three sections directly without flattening or grouping complete turn entries.

**Tech Stack:** React 19, Redux Toolkit slice reducers, TypeScript, HeroUI React v3 `Disclosure` and `Button`, Vitest unit tests, Vitest Browser tests, pnpm scripts from `codex-gui/package.json`.

---

## File Structure

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Extend `TranscriptTurn` with `leadingPromptEntryId`, `middleChunkIds`, and `finalAssistantEntryIds`.
  - Remove `chunkIdsByTurnId` from `TranscriptState`.
  - Route materialized entries into leading, middle, or final slots during snapshot rebuild and live item completion.
  - Keep `selectTranscriptChunk()` and `selectTranscriptEntry()`.
  - Remove `selectTranscriptChunkIdsForTurn()`.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Replace old whole-turn chunk expectations with leading/middle/final expectations.
  - Cover assistant-first, final-first, multiple final, middle chunking, and `entryChunkById` only for middle entries.
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Render `LeadingPromptEntry`, `MiddleTranscriptModule`, and `FinalAssistantMessages`.
  - Remove full-turn flattening and `groupTranscriptEntriesForDisplay()` usage.
  - Rename the visible disclosure label to `Intermediate updates · N items`.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Update browser expectations for the new middle label and three-section rendering.
  - Add coverage for a later user message inside the middle disclosure and multiple final messages.
- Delete with `git rm`: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`
  - The display grouping helper is no longer part of the render path.
- Delete with `git rm`: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`
  - Its behavior moves into Redux classification tests and browser rendering tests.

## Environment Setup For Verification

Run all `pnpm` commands from `codex-gui` with the user-managed fnm environment:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
which pnpm
pnpm --version
```

Expected:

- `which pnpm` does not print a path under `/Users/jiangsheng/.cache/codex-runtimes/`.
- `pnpm --version` prints the project pnpm version from the user environment.

The required scripts were checked in `codex-gui/package.json`:

- `format:prettier:fix`
- `format:prettier`
- `lint`
- `type-check`
- `test:unit`
- `test:browser`

Do not stage or commit unless the user explicitly asks for that after implementation.

## Task 1: Update Redux Turn Structure Tests

**Files:**

- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Replace the snapshot shape expectation**

In `rebuilds committed transcript chunks from an accepted attach snapshot`, replace the old turn and chunk assertions with this structure:

```ts
expect(selectTranscriptTurn(store.getState(), "turn-snapshot")).toStrictEqual({
  id: "turn-snapshot",
  status: "completed",
  leadingPromptEntryId: "user-snapshot",
  middleChunkIds: [],
  finalAssistantEntryIds: ["agent-snapshot"],
});

expect(selectTranscriptEntry(store.getState(), "user-snapshot")).toStrictEqual({
  type: "message",
  id: "user-snapshot",
  turnId: "turn-snapshot",
  role: "user",
  source: "Hello there",
  sourceKind: "plainText",
  phase: null,
  revision: 0,
});

expect(selectTranscriptEntry(store.getState(), "agent-snapshot")).toStrictEqual({
  type: "message",
  id: "agent-snapshot",
  turnId: "turn-snapshot",
  role: "assistant",
  source: "**Plain** text",
  sourceKind: "plainText",
  phase: "final_answer",
  revision: 0,
});
```

Remove the old `selectTranscriptChunkIdsForTurn()` expectation from this test.

- [ ] **Step 2: Add a middle classification snapshot test**

Add this test near the phase materialization tests:

```ts
it("classifies leading prompt, middle entries, and final answers from snapshot entries", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-layout", [
          userMessage("user-leading", [textInput("Initial prompt")]),
          agentMessage("agent-commentary", "Working", "commentary"),
          userMessage("user-follow-up", [textInput("Extra input")]),
          agentMessage("agent-legacy", "Legacy assistant", null),
          agentMessage("agent-final", "Final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  expect(selectTranscriptTurn(store.getState(), "turn-layout")).toStrictEqual({
    id: "turn-layout",
    status: "completed",
    leadingPromptEntryId: "user-leading",
    middleChunkIds: ["turn-layout:chunk:0"],
    finalAssistantEntryIds: ["agent-final"],
  });

  expect(selectTranscriptChunk(store.getState(), "turn-layout:chunk:0")?.entries).toStrictEqual([
    {
      type: "message",
      id: "agent-commentary",
      turnId: "turn-layout",
      role: "assistant",
      source: "Working",
      sourceKind: "plainText",
      phase: "commentary",
      revision: 0,
    },
    {
      type: "message",
      id: "user-follow-up",
      turnId: "turn-layout",
      role: "user",
      source: "Extra input",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
    {
      type: "message",
      id: "agent-legacy",
      turnId: "turn-layout",
      role: "assistant",
      source: "Legacy assistant",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
  ]);

  expect(selectTranscriptEntry(store.getState(), "agent-final")).toStrictEqual({
    type: "message",
    id: "agent-final",
    turnId: "turn-layout",
    role: "assistant",
    source: "Final answer",
    sourceKind: "plainText",
    phase: "final_answer",
    revision: 0,
  });
});
```

- [ ] **Step 3: Add assistant-first and final-first classification tests**

Add these tests:

```ts
it("leaves leading prompt empty when the first visible entry is assistant commentary", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-assistant-first", [
          agentMessage("agent-first-commentary", "Working first", "commentary"),
          agentMessage("agent-first-final", "Done", "final_answer"),
        ]),
      ]),
    ),
  );

  expect(selectTranscriptTurn(store.getState(), "turn-assistant-first")).toStrictEqual({
    id: "turn-assistant-first",
    status: "completed",
    leadingPromptEntryId: null,
    middleChunkIds: ["turn-assistant-first:chunk:0"],
    finalAssistantEntryIds: ["agent-first-final"],
  });
});

it("leaves leading prompt empty when the first visible entry is a final assistant answer", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-final-first", [
          agentMessage("agent-final-first", "Final first", "final_answer"),
          userMessage("user-after-final", [textInput("After final")]),
        ]),
      ]),
    ),
  );

  expect(selectTranscriptTurn(store.getState(), "turn-final-first")).toStrictEqual({
    id: "turn-final-first",
    status: "completed",
    leadingPromptEntryId: null,
    middleChunkIds: ["turn-final-first:chunk:0"],
    finalAssistantEntryIds: ["agent-final-first"],
  });
  expect(selectTranscriptChunk(store.getState(), "turn-final-first:chunk:0")?.entries).toStrictEqual([
    {
      type: "message",
      id: "user-after-final",
      turnId: "turn-final-first",
      role: "user",
      source: "After final",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
  ]);
});
```

- [ ] **Step 4: Add multiple-final and middle-only chunk tests**

Add these tests:

```ts
it("stores multiple final assistant answers outside middle chunks", () => {
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-multi-final", [
          userMessage("user-multi-final", [textInput("Prompt")]),
          agentMessage("agent-final-one", "First final", "final_answer"),
          agentMessage("agent-final-two", "Second final", "final_answer"),
        ]),
      ]),
    ),
  );

  expect(selectTranscriptTurn(store.getState(), "turn-multi-final")).toStrictEqual({
    id: "turn-multi-final",
    status: "completed",
    leadingPromptEntryId: "user-multi-final",
    middleChunkIds: [],
    finalAssistantEntryIds: ["agent-final-one", "agent-final-two"],
  });
});

it("chunks only middle entries after the committed chunk entry limit", () => {
  const store = makeStore();

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-leading",
        "turn-middle-chunked",
        userMessage("user-leading-live", [textInput("Prompt")]),
      ),
    ),
  );
  for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          `commit-middle-${String(index)}`,
          "turn-middle-chunked",
          agentMessage(`agent-middle-${String(index)}`, `Middle ${String(index)}`, "commentary"),
        ),
      ),
    );
  }
  store.dispatch(
    threadRuntimeEventBuffered(
      itemCompleted(
        eventItemCompleted,
        "commit-final",
        "turn-middle-chunked",
        agentMessage("agent-final-live", "Final", "final_answer"),
      ),
    ),
  );

  expect(selectTranscriptTurn(store.getState(), "turn-middle-chunked")).toMatchObject({
    leadingPromptEntryId: "user-leading-live",
    middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
    finalAssistantEntryIds: ["agent-final-live"],
  });
  expect(selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")?.entries).toHaveLength(
    TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  );
  expect(selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:1")?.entries).toHaveLength(1);
});
```

- [ ] **Step 5: Run the focused unit test and verify it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: FAIL because `TranscriptTurn` does not yet include the new fields and `selectTranscriptChunkIdsForTurn()` still exists in old tests/imports.

## Task 2: Implement Redux Turn Classification

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Update `TranscriptTurn` and `TranscriptState`**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, replace the turn and state shapes:

```ts
export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  finalAssistantEntryIds: string[];
};
```

Remove this field from `TranscriptState`, `initialState`, `createEmptyState()`, and `resetState()`:

```ts
chunkIdsByTurnId: Record<string, string[]>;
```

- [ ] **Step 2: Initialize new turn fields**

Update `upsertTurnFromPayload()` so new turns are initialized as:

```ts
state.turnsById[turn.id] = {
  id: turn.id,
  status: turn.status,
  leadingPromptEntryId: null,
  middleChunkIds: [],
  finalAssistantEntryIds: [],
};
```

Keep existing turns' structural fields intact when only status changes:

```ts
existingTurn.status = turn.status;
```

- [ ] **Step 3: Change chunk creation to use `turn.middleChunkIds`**

Replace `getOrCreateAppendChunk()` with middle-specific logic:

```ts
const getOrCreateMiddleChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  ensureTurnExists(state, turnId);
  const turn = state.turnsById[turnId];
  const chunkIds = turn?.middleChunkIds ?? [];
  const lastChunkId = chunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];

  if (lastChunk != null && lastChunk.entryIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = chunkIdForIndex(turnId, chunkIds.length);
  const chunk: TranscriptChunk = { id: chunkId, turnId, entryIds: [], revision: 0 };
  state.chunksById[chunkId] = chunk;
  if (turn != null) {
    turn.middleChunkIds.push(chunkId);
  }
  return chunk;
};
```

- [ ] **Step 4: Add classification helpers**

Add helpers near the existing chunk helpers:

```ts
const isAssistantMessageEntry = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message"; role: "assistant" }> =>
  entry.type === "message" && entry.role === "assistant";

const isFinalAssistantEntry = (entry: TranscriptEntry): boolean =>
  isAssistantMessageEntry(entry) && entry.phase === "final_answer";

const turnHasVisibleEntries = (turn: TranscriptTurn): boolean =>
  turn.leadingPromptEntryId != null ||
  turn.middleChunkIds.length > 0 ||
  turn.finalAssistantEntryIds.length > 0;
```

- [ ] **Step 5: Replace append-to-chunk with classify-and-append**

Replace `appendEntryToChunk()` and its wrappers with:

```ts
const appendEntryToMiddleChunk = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  const chunk = getOrCreateMiddleChunk(state, entry.turnId);
  chunk.entryIds.push(entry.id);
  if (options.bumpChunkRevision) {
    chunk.revision += 1;
  }
  state.entryChunkById[entry.id] = chunk.id;
};

const classifyNewEntry = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  ensureTurnExists(state, entry.turnId);
  const turn = state.turnsById[entry.turnId];
  if (turn == null) {
    return;
  }

  state.entriesById[entry.id] = entry;

  if (!turnHasVisibleEntries(turn) && !isAssistantMessageEntry(entry)) {
    turn.leadingPromptEntryId = entry.id;
    return;
  }

  if (isFinalAssistantEntry(entry)) {
    turn.finalAssistantEntryIds.push(entry.id);
    return;
  }

  appendEntryToMiddleChunk(state, entry, options);
};

const appendBaselineEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  classifyNewEntry(state, entry, { bumpChunkRevision: false });
};
```

- [ ] **Step 6: Update live upsert behavior**

Replace `upsertLiveCommittedEntry()` with logic that preserves existing slot membership and bumps only middle chunk revisions:

```ts
const upsertLiveCommittedEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  const existingEntry = state.entriesById[entry.id];
  if (existingEntry == null) {
    classifyNewEntry(state, entry, { bumpChunkRevision: true });
    return;
  }

  state.entriesById[entry.id] = {
    ...entry,
    revision: existingEntry.revision + 1,
  };

  const chunkId = state.entryChunkById[entry.id];
  if (chunkId == null) {
    return;
  }

  const chunk = state.chunksById[chunkId];
  if (chunk != null) {
    chunk.revision += 1;
  }
};
```

This preserves the current same-id update model. Existing leading and final entries update through `entriesById`; existing middle entries update through `entriesById` and bump their chunk revision.

- [ ] **Step 7: Update selectors and exports**

Remove the selector and export for:

```ts
selectTranscriptChunkIdsForTurn
```

Keep:

```ts
selectTranscriptTurn
selectTranscriptChunk
selectTranscriptEntry
```

- [ ] **Step 8: Update remaining unit test imports and expectations**

In `transcriptStateSlice.test.ts`, remove `selectTranscriptChunkIdsForTurn` from imports. Update tests that previously expected final-only messages in chunks:

```ts
expect(selectTranscriptTurn(store.getState(), "turn-live")).toStrictEqual({
  id: "turn-live",
  status: "inProgress",
  leadingPromptEntryId: null,
  middleChunkIds: [],
  finalAssistantEntryIds: ["agent-live"],
});
expect(selectTranscriptEntry(store.getState(), "agent-live")).toStrictEqual({
  type: "message",
  id: "agent-live",
  turnId: "turn-live",
  role: "assistant",
  source: "Live answer",
  sourceKind: "plainText",
  phase: "final_answer",
  revision: 0,
});
```

For filtered turns and terminal-only turns, expect an empty structural turn:

```ts
expect(selectTranscriptTurn(store.getState(), "turn-filtered")).toStrictEqual({
  id: "turn-filtered",
  status: "completed",
  leadingPromptEntryId: null,
  middleChunkIds: [],
  finalAssistantEntryIds: [],
});
```

- [ ] **Step 9: Run the focused unit test and verify it passes**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS for `transcriptStateSlice.test.ts`.

## Task 3: Update Committed Transcript Surface Rendering

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Update browser test labels and behavior expectations**

In `CommittedTranscriptSurface.browser.test.tsx`, replace `Temporary updates` with `Intermediate updates` in existing middle disclosure tests.

Change:

```ts
screen.getByRole("button", { name: "Temporary updates · 1 item" })
```

To:

```ts
screen.getByRole("button", { name: "Intermediate updates · 1 item" })
```

For the cross-chunk test, expect:

```ts
expect(triggers.map((trigger) => trigger.textContent)).toStrictEqual([
  "Intermediate updates · 101 items",
]);
```

- [ ] **Step 2: Add a browser test for later user messages inside middle**

Add this test:

```tsx
test("renders later user messages inside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-middle-user", [
          userMessage("user-leading-middle", [textInput("Initial prompt")]),
          agentMessage("agent-middle-user-note", "Working note", "commentary"),
          userMessage("user-middle-follow-up", [textInput("Follow-up input")]),
          agentMessage("agent-middle-user-final", "Final response", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Initial prompt")).toBeVisible();
  await expect.element(screen.getByText("Final response")).toBeVisible();
  await expect.element(screen.getByText("Working note")).not.toBeVisible();
  await expect.element(screen.getByText("Follow-up input")).not.toBeVisible();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 2 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Working note")).toBeVisible();
  await expect.element(screen.getByText("Follow-up input")).toBeVisible();
});
```

- [ ] **Step 3: Add a browser test for multiple final messages**

Add this test:

```tsx
test("renders multiple final assistant messages outside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-multi-final-surface", [
          userMessage("user-multi-final-surface", [textInput("Prompt")]),
          agentMessage("agent-final-surface-one", "First final", "final_answer"),
          agentMessage("agent-final-surface-two", "Second final", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Prompt")).toBeVisible();
  await expect.element(screen.getByText("First final")).toBeVisible();
  await expect.element(screen.getByText("Second final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the focused browser test and verify it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because `CommittedTranscriptSurface` still imports the removed old selector and still renders `Temporary updates`.

- [ ] **Step 5: Replace full-turn grouping imports**

In `CommittedTranscriptSurface.tsx`, remove:

```ts
import { memo, useMemo, useState } from "react";
```

Replace it with:

```ts
import { memo, useState } from "react";
```

Remove imports for:

```ts
selectTranscriptChunkIdsForTurn
type TranscriptChunkView
```

Remove:

```ts
import { areTranscriptChunkViewsEqual } from "./committedTranscriptChunkEquality";
import { groupTranscriptEntriesForDisplay } from "./committedTranscriptDisplayGroups";
```

- [ ] **Step 6: Rename the middle disclosure label and component**

Replace `temporaryUpdatesLabel()` with:

```ts
const intermediateUpdatesLabel = (count: number): string =>
  `Intermediate updates · ${String(count)} ${count === 1 ? "item" : "items"}`;
```

Rename `TemporaryTranscriptModule` to `MiddleTranscriptModule` and use:

```ts
const label = intermediateUpdatesLabel(entries.length);
```

Update CSS class names only if needed for clarity. To minimize styling churn, this plan keeps the existing classes unless tests require semantic class names.

- [ ] **Step 7: Add section components**

Add these components above `CommittedTranscriptTurn`:

```tsx
const LeadingPromptEntry = ({ entryId }: { entryId: string | null }) => {
  const entry = useAppSelector((state) =>
    entryId == null ? null : selectTranscriptEntry(state, entryId),
  );

  if (entry == null) {
    return null;
  }

  return <CommittedTranscriptEntry entry={entry} />;
};

const MiddleTranscriptModule = ({
  chunkIds,
  hasFinalAnswer,
}: {
  chunkIds: string[];
  hasFinalAnswer: boolean;
}) => {
  const chunks = useAppSelector(
    (state) => chunkIds.map((chunkId) => selectTranscriptChunk(state, chunkId)),
    areTranscriptChunkViewArraysEqual,
  );
  const entries = chunks.flatMap((chunk) => chunk?.entries ?? []);
  const [isExpanded, setIsExpanded] = useState(false);
  const label = intermediateUpdatesLabel(entries.length);
  const shouldShowEntries = !hasFinalAnswer || isExpanded;

  if (entries.length === 0) {
    return null;
  }

  return (
    <Disclosure
      className="committed-transcript-temporary-module grid min-w-0 gap-2"
      isDisabled={!hasFinalAnswer}
      isExpanded={!hasFinalAnswer || isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading>
        <Button
          className="committed-transcript-temporary-trigger justify-between"
          slot="trigger"
          variant="secondary"
        >
          {label}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-3">
          <div
            className="grid min-w-0 gap-3"
            style={{ display: shouldShowEntries ? undefined : "none" }}
          >
            {entries.map((entry) => (
              <CommittedTranscriptEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
};

const FinalAssistantMessages = ({ entryIds }: { entryIds: string[] }) => {
  const entries = useAppSelector((state) =>
    entryIds.flatMap((entryId) => {
      const entry = selectTranscriptEntry(state, entryId);
      return entry == null ? [] : [entry];
    }),
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <>
      {entries.map((entry) => (
        <CommittedTranscriptEntry key={entry.id} entry={entry} />
      ))}
    </>
  );
};
```

Keep `areTranscriptChunkViewArraysEqual()` if `MiddleTranscriptModule` uses it. Keep `areStringArraysEqual()` only if another selector still needs it; otherwise remove it.

- [ ] **Step 8: Render the three turn sections**

Replace the body of `CommittedTranscriptTurn` so it no longer reads chunk ids separately and no longer calls `groupTranscriptEntriesForDisplay()`:

```tsx
const CommittedTranscriptTurn = memo(({ turnId }: { turnId: string }) => {
  const turn = useAppSelector((state) => selectTranscriptTurn(state, turnId));

  if (turn == null) {
    return null;
  }

  const hasEntries =
    turn.leadingPromptEntryId != null ||
    turn.middleChunkIds.length > 0 ||
    turn.finalAssistantEntryIds.length > 0;

  if (!hasEntries) {
    return null;
  }

  return (
    <article
      aria-label={`Turn ${turn.id}`}
      className="committed-transcript-turn grid min-w-0 gap-3"
    >
      <div className="committed-transcript-turn-metadata flex min-w-0 flex-wrap items-center gap-2">
        <Typography
          className="committed-transcript-turn-id min-w-0 max-w-full wrap-break-word"
          color="muted"
          type="body-xs"
          weight="medium"
        >
          {turn.id}
        </Typography>
        <Chip className="committed-transcript-turn-status" color="default" size="sm">
          {turn.status}
        </Chip>
      </div>
      <div className="committed-transcript-chunk grid min-w-0 gap-3">
        <LeadingPromptEntry entryId={turn.leadingPromptEntryId} />
        <MiddleTranscriptModule
          chunkIds={turn.middleChunkIds}
          hasFinalAnswer={turn.finalAssistantEntryIds.length > 0}
        />
        <FinalAssistantMessages entryIds={turn.finalAssistantEntryIds} />
      </div>
    </article>
  );
});
```

- [ ] **Step 9: Update empty-state detection**

Replace `hasCommittedChunks` with a structural check:

```ts
const hasCommittedEntries = useAppSelector((state) =>
  selectTranscriptTurnIds(state).some((turnId) => {
    const turn = selectTranscriptTurn(state, turnId);
    return (
      turn != null &&
      (turn.leadingPromptEntryId != null ||
        turn.middleChunkIds.length > 0 ||
        turn.finalAssistantEntryIds.length > 0)
    );
  }),
);
```

Use `hasCommittedEntries` in the empty-state conditional.

- [ ] **Step 10: Run the focused browser test and verify it passes**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS for `CommittedTranscriptSurface.browser.test.tsx`.

## Task 4: Remove Old Display Grouping Files

**Files:**

- Delete: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`
- Delete: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Verify no source imports the display grouping helper**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
rg -n -e 'groupTranscriptEntriesForDisplay|TranscriptTurnDisplayItem|committedTranscriptDisplayGroups' codex-gui/src
```

Expected: no imports or references outside `committedTranscriptDisplayGroups.ts` and its test.

- [ ] **Step 2: Delete the old files using git**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git rm codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts
git rm codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: both files are staged for deletion by git. Do not commit unless the user asks.

- [ ] **Step 3: Run source search again**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
rg -n -e 'groupTranscriptEntriesForDisplay|TranscriptTurnDisplayItem|committedTranscriptDisplayGroups' codex-gui/src
```

Expected: no matches.

## Task 5: Validation

**Files:**

- Validate: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Validate: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- Validate: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Validate: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Format touched files**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run format:prettier:fix -- src/features/transcriptState/transcriptStateSlice.ts src/features/transcriptState/__tests__/transcriptStateSlice.test.ts src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: Prettier completes successfully and only formats the listed files.

- [ ] **Step 2: Run focused unit and browser tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: both focused test files pass.

- [ ] **Step 3: Run type-check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run type-check
```

Expected: TypeScript project references check successfully.

- [ ] **Step 4: Run lint**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run lint
```

Expected: oxlint and eslint pass.

- [ ] **Step 5: Run final format check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run format:prettier
```

Expected: Prettier check passes.

## Self-Review

- Spec coverage: Task 1 and Task 2 cover Redux `leadingPromptEntryId`, `middleChunkIds`, `finalAssistantEntryIds`, middle-only chunking, assistant-first, final-first, multiple finals, and no old selector compatibility. Task 3 covers the three-section React rendering and `Intermediate updates` label. Task 4 removes the obsolete display grouping helper. Task 5 covers focused and package-level validation.
- Scope control: the plan does not change app-server protocol, `ThreadItem` wire shape, user expansion persistence, virtualized rendering, or unrelated UI layout.
- Type consistency: `TranscriptTurn.middleChunkIds` feeds `selectTranscriptChunk()`, `leadingPromptEntryId` and `finalAssistantEntryIds` feed `selectTranscriptEntry()`, and `entryChunkById` remains only for middle entries.
- Command validation: `format:prettier:fix`, `format:prettier`, `lint`, `type-check`, `test:unit`, and `test:browser` exist in `codex-gui/package.json`.
