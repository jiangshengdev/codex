# Codex GUI Temporary Module Chunked Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore chunk-level performance boundaries inside the committed transcript temporary module while keeping final answers on the simple entry-id path.

**Architecture:** `TranscriptTurn` will own a `middleEntryCount` render fact so labels do not scan chunks. `MiddleTranscriptModule` will keep one turn-level HeroUI `Disclosure`, but its expanded content will render one memoized `MiddleTranscriptChunk` per `middleChunkId`; collapsed temporary modules will not render hidden entries.

**Tech Stack:** React 19, Redux Toolkit slice reducers, TypeScript, HeroUI React v3 `Disclosure` and `Button`, Vitest unit tests, Vitest Browser tests, pnpm scripts from `codex-gui/package.json`.

---

## File Structure

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add `middleEntryCount` to `TranscriptTurn`.
  - Initialize `middleEntryCount` for new turns and snapshot rebuild turns.
  - Increment `middleEntryCount` only when a new entry is appended to a middle chunk.
  - Keep existing final answer and leading prompt classification unchanged.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Update existing `TranscriptTurn` strict equality expectations to include `middleEntryCount`.
  - Add focused assertions for baseline rebuild count, live append count, chunk-boundary count, and existing-entry update count stability.
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Remove the turn-level `chunks.map(...selectTranscriptChunk)` selector and `chunks.flatMap(...)`.
  - Add a memoized `MiddleTranscriptChunk` component that selects and renders one chunk.
  - Pass `middleEntryCount` into `MiddleTranscriptModule` for the label.
  - Render `MiddleTranscriptChunk` children only when the disclosure should show entries.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Keep existing temporary/final behavior coverage.
  - Strengthen collapsed-state coverage so hidden temporary entry text is absent from the DOM until expansion.
  - Keep cross-chunk coverage proving one temporary module and `101 items`.
- Modify: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`
  - Update status after implementation to record that the full-turn flatten render path is fixed.
  - Preserve any residual risk as a future issue note instead of deleting history.

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

- `test:unit`
- `test:browser`
- `lint`
- `type-check`

Do not stage or commit unless the user explicitly asks for that after implementation.

## Task 1: Add `middleEntryCount` To Transcript State

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Write failing count expectations in existing transcript state tests**

In `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`, update the existing `selectTranscriptTurn(...).toStrictEqual(...)` expectations so every expected `TranscriptTurn` object includes `middleEntryCount`.

Use these concrete values for the key existing tests:

```ts
expect(selectTranscriptTurn(store.getState(), "turn-layout")).toStrictEqual({
  id: "turn-layout",
  status: "completed",
  leadingPromptEntryId: "user-leading",
  middleChunkIds: ["turn-layout:chunk:0"],
  middleEntryCount: 3,
  finalAssistantEntryIds: ["agent-final"],
});

expect(selectTranscriptTurn(store.getState(), "turn-assistant-first")).toStrictEqual({
  id: "turn-assistant-first",
  status: "completed",
  leadingPromptEntryId: null,
  middleChunkIds: ["turn-assistant-first:chunk:0"],
  middleEntryCount: 1,
  finalAssistantEntryIds: ["agent-first-final"],
});

expect(selectTranscriptTurn(store.getState(), "turn-final-update")).toStrictEqual({
  id: "turn-final-update",
  status: "inProgress",
  leadingPromptEntryId: null,
  middleChunkIds: [],
  middleEntryCount: 0,
  finalAssistantEntryIds: ["agent-final-update"],
});

expect(selectTranscriptTurn(store.getState(), "turn-middle-chunked")).toStrictEqual({
  id: "turn-middle-chunked",
  status: "inProgress",
  leadingPromptEntryId: "user-leading-live",
  middleChunkIds: ["turn-middle-chunked:chunk:0", "turn-middle-chunked:chunk:1"],
  middleEntryCount: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1,
  finalAssistantEntryIds: ["agent-final-live"],
});
```

For any other `TranscriptTurn` strict equality object in this test file, set:

- `middleEntryCount: 0` when `middleChunkIds: []`.
- `middleEntryCount` to the number of expected entries in the middle chunk assertions when `middleChunkIds` is non-empty.

- [ ] **Step 2: Add an explicit existing-entry update count assertion**

In the test named `updates an existing committed entry and bumps only its chunk revision`, add this assertion after the second `threadRuntimeEventBuffered(...)` dispatch:

```ts
expect(selectTranscriptTurn(store.getState(), "turn-update")).toStrictEqual({
  id: "turn-update",
  status: "inProgress",
  leadingPromptEntryId: null,
  middleChunkIds: ["turn-update:chunk:0"],
  middleEntryCount: 1,
  finalAssistantEntryIds: [],
});
```

This locks the requirement that updating an existing middle entry does not increment the count.

- [ ] **Step 3: Add a chunk-boundary stability assertion**

In the test named `chunks only middle entries after the committed chunk entry limit`, capture the first chunk view immediately after it fills:

```ts
let firstChunkAfterLimit: ReturnType<typeof selectTranscriptChunk> | null = null;

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

  if (index === TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 1) {
    firstChunkAfterLimit = selectTranscriptChunk(
      store.getState(),
      "turn-middle-chunked:chunk:0",
    );
  }
}
```

After the final answer dispatch and existing chunk length assertions, add:

```ts
expect(selectTranscriptChunk(store.getState(), "turn-middle-chunked:chunk:0")).toBe(
  firstChunkAfterLimit,
);
```

This locks the chunk-level invariant that appending to the next middle chunk and then appending a final answer do not rematerialize an unchanged old chunk view.

- [ ] **Step 4: Run the focused transcript state test and verify it fails**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: FAIL because `TranscriptTurn` does not yet include `middleEntryCount`.

- [ ] **Step 5: Implement `middleEntryCount`**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, add `middleEntryCount` to the type and all turn constructors:

```ts
export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: string[];
};
```

In `ensureTurnExists`, initialize the field:

```ts
const turn: TranscriptTurn = {
  id: turnId,
  status: "inProgress",
  leadingPromptEntryId: null,
  middleChunkIds: [],
  middleEntryCount: 0,
  finalAssistantEntryIds: [],
};
```

In `upsertTurnFromPayload`, initialize the field for newly created turns:

```ts
state.turnsById[turn.id] = {
  id: turn.id,
  status: turn.status,
  leadingPromptEntryId: null,
  middleChunkIds: [],
  middleEntryCount: 0,
  finalAssistantEntryIds: [],
};
```

In `appendEntryToMiddleChunk`, increment after the entry is appended:

```ts
const turn = ensureTurnExists(state, entry.turnId);
const chunk = getOrCreateMiddleChunk(state, entry.turnId);
chunk.entryIds.push(entry.id);
turn.middleEntryCount += 1;
if (options.bumpChunkRevision) {
  chunk.revision += 1;
}
state.entryChunkById[entry.id] = chunk.id;
```

Keep the existing-entry update path unchanged so it only updates `entriesById` and bumps the owning chunk revision.

- [ ] **Step 6: Run the focused transcript state test and verify it passes**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS.

## Task 2: Render Temporary Module Content By Chunk

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Strengthen collapsed DOM expectations**

In `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`, update the collapsed temporary tests so collapsed entries are absent from the DOM before expansion.

In `renders temporary content collapsed beside the final answer once final answer exists`, replace the hidden assertion with:

```ts
await expect.element(screen.getByText("Visible final answer")).toBeVisible();
await expect.element(screen.getByText("Hidden working note")).not.toBeInTheDocument();
```

In `renders one collapsed temporary module for a turn split across chunks`, replace the hidden assertion with:

```ts
await expect.element(screen.getByText("Visible final answer after chunk boundary")).toBeVisible();
await expect.element(screen.getByText("Cross chunk working note 0")).not.toBeInTheDocument();
```

In `renders later user messages inside the intermediate disclosure`, replace both hidden assertions with:

```ts
await expect.element(screen.getByText("Working note")).not.toBeInTheDocument();
await expect.element(screen.getByText("Follow-up input")).not.toBeInTheDocument();
```

In `renders legacy assistant messages inside the intermediate disclosure`, replace the hidden assertion with:

```ts
await expect.element(screen.getByText("Final after legacy")).toBeVisible();
await expect.element(screen.getByText("Legacy assistant text")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused browser test and verify it fails**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because collapsed temporary entries are still rendered under a `display: none` wrapper.

- [ ] **Step 3: Add a memoized `MiddleTranscriptChunk` component**

In `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`, remove `type TranscriptChunkView` from the import list and delete `areTranscriptChunkViewArraysEqual`.

Add this component after `LeadingPromptEntry`:

```tsx
const MiddleTranscriptChunk = memo(({ chunkId }: { chunkId: string }) => {
  const chunk = useAppSelector(
    (state) => selectTranscriptChunk(state, chunkId),
    areTranscriptChunkViewsEqual,
  );

  if (chunk == null || chunk.entries.length === 0) {
    return null;
  }

  return (
    <div className="committed-transcript-middle-chunk grid min-w-0 gap-3">
      {chunk.entries.map((entry) => (
        <CommittedTranscriptEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
});

MiddleTranscriptChunk.displayName = "MiddleTranscriptChunk";
```

- [ ] **Step 4: Change `MiddleTranscriptModule` props and body**

Replace `MiddleTranscriptModule` with this shape:

```tsx
const MiddleTranscriptModule = ({
  chunkIds,
  hasFinalAnswer,
  middleEntryCount,
}: {
  chunkIds: string[];
  hasFinalAnswer: boolean;
  middleEntryCount: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = intermediateUpdatesLabel(middleEntryCount);
  const shouldShowEntries = !hasFinalAnswer || isExpanded;

  if (middleEntryCount === 0) {
    return null;
  }

  return (
    <Disclosure
      className="committed-transcript-temporary-module grid min-w-0 gap-2"
      isDisabled={!hasFinalAnswer}
      isExpanded={shouldShowEntries}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading>
        <Button
          className="committed-transcript-temporary-trigger justify-between"
          slot="trigger"
          variant="outline"
        >
          {label}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-3">
          {shouldShowEntries ? (
            <div className="grid min-w-0 gap-3">
              {chunkIds.map((chunkId) => (
                <MiddleTranscriptChunk chunkId={chunkId} key={chunkId} />
              ))}
            </div>
          ) : null}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
};
```

This removes the turn-level selector over all chunks and the `chunks.flatMap(...)` render path.

- [ ] **Step 5: Pass `middleEntryCount` from `CommittedTranscriptTurn`**

Update the `MiddleTranscriptModule` call:

```tsx
<MiddleTranscriptModule
  chunkIds={turn.middleChunkIds}
  hasFinalAnswer={turn.finalAssistantEntryIds.length > 0}
  middleEntryCount={turn.middleEntryCount}
/>
```

Keep `FinalAssistantMessages` unchanged so final answers remain on the simple entry-id path.

- [ ] **Step 6: Run the focused browser test and verify it passes**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

## Task 3: Update The Issue Note And Run Verification

**Files:**

- Modify: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`

- [ ] **Step 1: Update the issue status**

Replace the header status with:

```md
状态:已修复
```

Append this section after the existing `## 建议方向` section:

```md
## 修复记录

2026-06-30:

- `committedTranscriptDisplayGroups.ts` 已在前序结构调整中移除，final answer boundary 不再由 render
  path 重新推导。
- `MiddleTranscriptModule` 保持 turn 级 disclosure 外观，但内部按 `middleChunkIds` 渲染
  `MiddleTranscriptChunk`，不再把所有 middle chunks flatten 成完整 entries 数组。
- `Intermediate updates` 数量来自 `TranscriptTurn.middleEntryCount`，label 不再扫描 chunks 或 entries。
- collapsed 状态下不再渲染 hidden temporary entries；展开后才挂载 chunk content。

剩余风险:

- 当前修复恢复 chunk-level render boundary；如果后续 temporary module 需要展示极长历史，虚拟化或分页应作为独立 issue 处理。
```

- [ ] **Step 2: Run focused verification commands**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
pnpm run lint
pnpm run type-check
```

Expected: all commands PASS.

- [ ] **Step 3: Inspect the final diff**

From the repository root, run:

```bash
git diff -- codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md
```

Expected:

- `TranscriptTurn` includes `middleEntryCount`.
- `appendEntryToMiddleChunk` increments `middleEntryCount` only for new middle entries.
- `MiddleTranscriptModule` no longer selects all chunks or calls `flatMap`.
- Collapsed temporary module content renders no hidden entry components.
- The issue note records the fix without deleting the original problem statement.
