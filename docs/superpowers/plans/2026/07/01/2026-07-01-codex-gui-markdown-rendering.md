# Codex GUI Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render assistant committed transcript messages as a restricted Markdown subset while keeping user/status entries plain text and preserving chunk-level transcript performance boundaries.

**Architecture:** Keep transcript state as plain string data and use the existing `TranscriptEntry.sourceKind` field as the display contract. `transcriptEntryMaterialization.ts` marks assistant messages as Markdown, and `CommittedTranscriptEntry` branches to a new restricted `MarkdownText` component only for mounted assistant Markdown entries.

**Tech Stack:** React 19, TypeScript, Redux Toolkit transcript state, HeroUI React v3 `Typography`/`Card`, `react-markdown@10.1.0`, Vitest unit tests, Vitest Browser tests, pnpm scripts from `codex-gui/package.json`.

---

## File Structure

- Create: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - Own the restricted Markdown renderer.
  - Use `react-markdown` with `skipHtml`, `allowedElements`, and explicit component overrides.
  - Render links as non-clickable inline text and suppress images.
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - Change only `agentMessage` entries from `sourceKind: "plainText"` to `sourceKind: "markdown"`.
  - Keep `userMessage` entries as `sourceKind: "plainText"`.
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Import `MarkdownText`.
  - Replace the current one-size `Typography` body with a branch inside `CommittedTranscriptEntry`.
  - Leave `LeadingPromptEntry`, `MiddleTranscriptChunk`, `MiddleTranscriptModule`, and `FinalAssistantMessages` selector/mounting structure unchanged.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
  - Update assistant `TranscriptEntry` expectations to `sourceKind: "markdown"`.
  - Keep user `TranscriptEntry` expectations as `sourceKind: "plainText"`.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
  - Update live assistant `TranscriptEntry` expectations to `sourceKind: "markdown"`.
  - Keep user and status expectations unchanged.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
  - Update expected assistant chunk entries to `sourceKind: "markdown"` where the entry role is `assistant`.
  - Preserve existing selector reference-stability assertions.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
  - Update expected assistant entries to `sourceKind: "markdown"`.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`
  - Update the local `entry()` assistant fixture helper from `sourceKind: "plainText"` to `sourceKind: "markdown"`.
  - Keep the existing equality coverage unchanged.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Add browser coverage for assistant Markdown rendering.
  - Add browser coverage that user Markdown syntax stays literal.
  - Add browser coverage that raw HTML, images, and links do not create active DOM nodes.
  - Add browser coverage that collapsed middle Markdown content is not in the DOM before expansion.

## Do Not Modify

- Do not change `TranscriptEntry` type shape in `transcriptStateSlice.ts`.
- Do not change `selectTranscriptChunk`.
- Do not change chunk ids, turn slot classification, entry revisions, chunk revisions, or selector cache keys.
- Do not move Markdown parsing into reducers, selectors, or materialization.
- Do not add `rehypeRaw`, `remarkGfm`, syntax highlighting, Mermaid, math, or table support.
- Do not use `dangerouslySetInnerHTML`.

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
- `pnpm --version` prints the user-managed project pnpm version.

The required scripts were checked in `codex-gui/package.json`:

- `type-check`
- `test:unit`
- `test:browser`
- `ci`

## Task 1: Lock Assistant Markdown Source Kind In Transcript State

**Files:**

- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`

- [ ] **Step 1: Update failing snapshot expectations**

In `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`, change expected assistant entries to `sourceKind: "markdown"` and leave expected user entries as `sourceKind: "plainText"`.

The first snapshot reducer test should contain this exact assistant expectation:

```ts
expect(selectTranscriptEntry(store.getState(), "agent-snapshot")).toStrictEqual({
  type: "message",
  id: "agent-snapshot",
  turnId: "turn-snapshot",
  role: "assistant",
  source: "**Plain** text",
  sourceKind: "markdown",
  phase: "final_answer",
  revision: 0,
});
```

The same file's `selectTranscriptChunk(... "turn-layout:chunk:0")?.entries` assertion should keep the middle user entry plain text and mark assistant entries as Markdown:

```ts
expect(selectTranscriptChunk(store.getState(), "turn-layout:chunk:0")?.entries).toStrictEqual([
  {
    type: "message",
    id: "agent-commentary",
    turnId: "turn-layout",
    role: "assistant",
    source: "Working",
    sourceKind: "markdown",
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
    sourceKind: "markdown",
    phase: null,
    revision: 0,
  },
]);
```

- [ ] **Step 2: Update failing live-event expectations**

In `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts`, change expected assistant entries to `sourceKind: "markdown"`.

The first live-event reducer test should expect:

```ts
expect(
  selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entries,
).toStrictEqual([
  {
    type: "message",
    id: "agent-live-commentary",
    turnId: "turn-live-phase",
    role: "assistant",
    source: "Still working",
    sourceKind: "markdown",
    phase: "commentary",
    revision: 0,
  },
]);
```

The live final-answer entry assertion should expect:

```ts
expect(selectTranscriptEntry(store.getState(), "agent-live")).toStrictEqual({
  type: "message",
  id: "agent-live",
  turnId: "turn-live",
  role: "assistant",
  source: "Live answer",
  sourceKind: "markdown",
  phase: "final_answer",
  revision: 0,
});
```

- [ ] **Step 3: Update selector and reconnect expectations**

In these files, update expected assistant entries from `sourceKind: "plainText"` to `sourceKind: "markdown"`:

```bash
rg -n -e 'role: "assistant"|sourceKind: "plainText"' \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
```

For every expected object with `role: "assistant"`, use:

```ts
sourceKind: "markdown",
```

For every expected object with `role: "user"`, keep:

```ts
sourceKind: "plainText",
```

In `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts`, update the local assistant fixture helper to:

```ts
const entry = (id: string, revision: number): TranscriptMessageEntry => ({
  type: "message",
  id,
  turnId: "turn-1",
  role: "assistant",
  source: `source ${id} ${String(revision)}`,
  sourceKind: "markdown",
  phase: "final_answer",
  revision,
});
```

- [ ] **Step 4: Run focused unit tests and verify they fail**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:unit -- \
  src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
```

Expected: FAIL because `agentMessage` materialization still returns `sourceKind: "plainText"`.

- [ ] **Step 5: Implement the source kind change**

In `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`, change only the `agentMessage` return object:

```ts
return {
  type: "message",
  id: item.id,
  turnId,
  role: "assistant",
  source: item.text,
  sourceKind: "markdown",
  phase: item.phase,
  revision: 0,
};
```

Keep the `userMessage` return object unchanged:

```ts
return {
  type: "message",
  id: item.id,
  turnId,
  role: "user",
  source,
  sourceKind: "plainText",
  phase: null,
  revision: 0,
};
```

- [ ] **Step 6: Run focused unit tests and verify they pass**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:unit -- \
  src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Stage only the files touched in Task 1:

```bash
git add \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
git commit -m "feat(gui): mark assistant transcript entries as markdown"
```

## Task 2: Add Restricted Markdown Rendering Component

**Files:**

- Create: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Create `MarkdownText.tsx`**

Create `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx` with this component:

```tsx
import ReactMarkdown from "react-markdown";
import { Typography } from "@heroui/react";

const allowedMarkdownElements = [
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
] as const;

export const MarkdownText = ({ source }: { source: string }) => (
  <div className="committed-transcript-entry-markdown grid min-w-0 gap-2 wrap-break-word leading-6">
    <ReactMarkdown
      allowedElements={allowedMarkdownElements}
      components={{
        a: ({ children }) => <span>{children}</span>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-default-200 pl-3 text-foreground-500">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded-small bg-default-100 px-1 py-0.5 font-mono text-[0.875em]">
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <Typography className="font-semibold leading-7" type="body-lg">
            {children}
          </Typography>
        ),
        h2: ({ children }) => (
          <Typography className="font-semibold leading-7" type="body-md">
            {children}
          </Typography>
        ),
        h3: ({ children }) => (
          <Typography className="font-semibold leading-6" type="body-sm">
            {children}
          </Typography>
        ),
        h4: ({ children }) => (
          <Typography className="font-semibold leading-6" type="body-sm">
            {children}
          </Typography>
        ),
        h5: ({ children }) => (
          <Typography className="font-semibold leading-6" type="body-sm">
            {children}
          </Typography>
        ),
        h6: ({ children }) => (
          <Typography className="font-semibold leading-6" type="body-sm">
            {children}
          </Typography>
        ),
        img: () => null,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        ol: ({ children }) => (
          <ol className="grid list-decimal gap-1 pl-5 marker:text-foreground-400">{children}</ol>
        ),
        p: ({ children }) => (
          <Typography className="min-w-0 max-w-full wrap-break-word leading-6" type="body-sm">
            {children}
          </Typography>
        ),
        pre: ({ children }) => (
          <pre className="min-w-0 max-w-full overflow-x-auto rounded-small bg-default-100 p-3 font-mono text-sm leading-5">
            {children}
          </pre>
        ),
        ul: ({ children }) => (
          <ul className="grid list-disc gap-1 pl-5 marker:text-foreground-400">{children}</ul>
        ),
      }}
      skipHtml
      unwrapDisallowed
    >
      {source}
    </ReactMarkdown>
  </div>
);
```

- [ ] **Step 2: Wire `CommittedTranscriptEntry` to `MarkdownText`**

In `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`, add:

```ts
import { MarkdownText } from "./MarkdownText";
```

Replace the current `CommittedTranscriptEntry` body with this branch:

```tsx
const shouldRenderMarkdown =
  entry.type === "message" && entry.role === "assistant" && entry.sourceKind === "markdown";

return (
  <Card
    className={`committed-transcript-entry committed-transcript-entry-${entry.type} min-w-0`}
    role="article"
    variant={entry.type === "message" && entry.role === "user" ? "secondary" : "default"}
  >
    <Card.Content className="grid min-w-0 gap-2">
      {shouldRenderMarkdown ? (
        <MarkdownText source={entry.source} />
      ) : (
        <Typography
          className="committed-transcript-entry-source min-w-0 max-w-full whitespace-pre-wrap wrap-break-word leading-6"
          type="body-sm"
        >
          {entryText(entry)}
        </Typography>
      )}
    </Card.Content>
  </Card>
);
```

Keep `entryText(entry)` for all non-Markdown branches so status text and user text remain unchanged.

- [ ] **Step 3: Run type-check and verify component API compatibility**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run type-check
```

Expected: PASS. If HeroUI `Typography` does not accept the exact `type` values in the new file, adjust the new component to use the same `Typography` values already accepted in `CommittedTranscriptSurface.tsx`.

- [ ] **Step 4: Commit Task 2**

Stage only the files touched in Task 2:

```bash
git add \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx \
  /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
git commit -m "feat(gui): render assistant transcript markdown"
```

## Task 3: Add Browser Coverage For Markdown Rendering And Safety

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Add assistant Markdown rendering browser test**

Add this test after `renders committed user and assistant messages from an attached baseline`:

```tsx
test("renders assistant transcript markdown", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown", [
          agentMessage(
            "agent-markdown",
            [
              "# Heading",
              "",
              "> Quoted text",
              "",
              "- First item",
              "- Second item",
              "",
              "Use `inline code` here.",
              "",
              "```",
              "fenced code",
              "```",
            ].join("\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
  await expect.element(screen.getByText("Quoted text")).toBeVisible();
  await expect.element(screen.getByText("First item")).toBeVisible();
  await expect.element(screen.getByText("Second item")).toBeVisible();
  expect(document.querySelector("blockquote")?.textContent).toContain("Quoted text");
  expect(document.querySelector("code")?.textContent).toContain("inline code");
  expect(document.querySelector("pre")?.textContent).toContain("fenced code");
});
```

- [ ] **Step 2: Add user plain-text browser test**

Add this test after the assistant Markdown test:

```tsx
test("keeps user markdown syntax as plain text", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-user-markdown-literal", [
          userMessage("user-markdown-literal", [textInput("# User heading\n- User item")]),
          agentMessage("agent-user-markdown-literal", "Assistant response"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("# User heading\n- User item")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "User heading" }))
    .not.toBeInTheDocument();
});
```

- [ ] **Step 3: Add safety browser test for HTML, images, and links**

Add this test after the user plain-text test:

```tsx
test("does not render unsafe markdown nodes as active DOM", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown-safety", [
          agentMessage(
            "agent-markdown-safety",
            [
              "Before <strong>raw html</strong> after.",
              "",
              "![blocked image](https://example.invalid/image.png)",
              "",
              "[blocked link](https://example.invalid)",
            ].join("\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText(/Before/)).toBeVisible();
  expect(document.querySelector(".committed-transcript-entry-markdown strong")).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown img")).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown a")).toBeNull();
  await expect.element(screen.getByText("blocked link")).toBeVisible();
});
```

- [ ] **Step 4: Add collapsed middle Markdown mount boundary test**

Extend the existing collapsed temporary coverage or add this focused test:

```tsx
test("does not mount collapsed temporary markdown before expansion", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-collapsed-markdown", [
          agentMessage("agent-collapsed-markdown", "# Hidden markdown heading", "commentary"),
          agentMessage("agent-collapsed-markdown-final", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Hidden markdown heading" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("# Hidden markdown heading")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await trigger.click();

  await expect
    .element(screen.getByRole("heading", { name: "Hidden markdown heading" }))
    .toBeVisible();
});
```

- [ ] **Step 5: Run focused browser test and verify it passes**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Stage only the browser test file:

```bash
git add /Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git commit -m "test(gui): cover transcript markdown rendering"
```

## Task 4: Final Verification

**Files:**

- No planned source edits.

- [ ] **Step 1: Run type-check**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 2: Run unit tests**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:unit -- \
  src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts \
  src/features/transcriptState/__tests__/transcriptStateLiveEvents.test.ts \
  src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts \
  src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts \
  src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run browser tests**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run formatting and lint checks through CI**

From `codex-gui` after fnm initialization, run:

```bash
pnpm run ci
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

From the repository root, run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected:

- `git diff --check` exits successfully.
- The source diff is limited to Markdown rendering, source-kind expectations, and committed transcript browser coverage.
- No selector flattening, chunk model changes, or collapsed hidden-entry mounting changes appear in the diff.

## Implementation Stop Conditions

Stop and ask for review before continuing if any of these occur:

- `react-markdown` requires adding another runtime dependency.
- The implementation needs `rehypeRaw`, `remarkGfm`, `dangerouslySetInnerHTML`, or link-opening behavior.
- A browser test requires changing `MiddleTranscriptModule`, `MiddleTranscriptChunk`, `selectTranscriptChunk`, or chunk ids.
- The implementation changes user message rendering semantics.
- `pnpm run test:browser` cannot target the specified file with the current Vitest Browser CLI.
