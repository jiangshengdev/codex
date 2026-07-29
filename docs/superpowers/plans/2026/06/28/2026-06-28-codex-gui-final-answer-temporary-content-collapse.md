# Codex GUI Final Answer Temporary Content Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a committed transcript display where temporary assistant content is always grouped in a HeroUI `Disclosure`, forced open until the turn has a final answer, then default-collapsed while the final answer remains a sibling module.

**Architecture:** Preserve protocol facts in transcript state by carrying `ThreadItem.agentMessage.phase` onto message entries. Add a focused display-grouping helper for turn-local module layout, then keep `CommittedTranscriptSurface` responsible only for rendering display items with HeroUI `Disclosure`, `Button`, and existing entry cards.

**Tech Stack:** React 19, Redux Toolkit selectors, Vitest Browser, HeroUI React v3 `Disclosure` and `Button`, generated app-server protocol TypeScript.

---

## File Structure

- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - Let test builders create `agentMessage` items with explicit `phase`, while preserving the current default `final_answer`.
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Add the message phase field to transcript message entries.
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - Copy `ThreadItem.agentMessage.phase` into assistant transcript entries and set user message phase to `null`.
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Cover phase materialization for snapshot and live completed items.
- Create: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`
  - Pure helper that turns chunk entries for one turn into display items: direct entries, one temporary content module, and final-answer modules.
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`
  - Unit coverage for grouping rules independent of React rendering.
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
  - Render grouped display items; introduce the HeroUI `Disclosure` temporary module.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Browser coverage for forced-open/no-final behavior, default-collapsed/final behavior, and legacy phase behavior.

## Environment Setup For Verification

Run all `pnpm` commands from `codex-gui` with the user-managed fnm environment:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm --version
```

Expected: `pnpm --version` prints the project pnpm version from the user environment, not a path under `/Users/jiangsheng/.cache/codex-runtimes/`.

## Task 1: Preserve Agent Message Phase In Transcript State

**Files:**
- Modify: `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Write the failing phase materialization tests**

Add a focused reducer test to `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts` near the existing snapshot rebuild tests:

```ts
  it("preserves assistant message phase in snapshot transcript entries", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn("turn-phase", [
            agentMessage("agent-commentary", "Working", "commentary"),
            agentMessage("agent-final", "Done", "final_answer"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-phase:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-commentary",
        turnId: "turn-phase",
        role: "assistant",
        source: "Working",
        sourceKind: "plainText",
        phase: "commentary",
        revision: 0,
      },
      {
        type: "message",
        id: "agent-final",
        turnId: "turn-phase",
        role: "assistant",
        source: "Done",
        sourceKind: "plainText",
        phase: "final_answer",
        revision: 0,
      },
    ]);
  });

  it("preserves assistant message phase in live completed transcript entries", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          eventItemCompleted,
          "commit-live-commentary",
          "turn-live-phase",
          agentMessage("agent-live-commentary", "Still working", "commentary"),
        ),
      ),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-live-phase:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-live-commentary",
        turnId: "turn-live-phase",
        role: "assistant",
        source: "Still working",
        sourceKind: "plainText",
        phase: "commentary",
        revision: 0,
      },
    ]);
  });
```

- [ ] **Step 2: Run the focused reducer test and verify it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: FAIL because `agentMessage()` does not yet accept a phase argument and transcript entries do not yet expose `phase`.

- [ ] **Step 3: Update the projection test builder**

Change `agentMessage` in `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts` to:

```ts
type AgentMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];

export const agentMessage = (
  id: string,
  text: string,
  phase: AgentMessagePhase = "final_answer",
): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase,
  memoryCitation: null,
});
```

- [ ] **Step 4: Add phase to transcript message entries**

In `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, update the protocol import and message entry type:

```ts
import type { ThreadItem, Turn, TurnStatus } from "@codex-protocol/v2";
```

```ts
export type TranscriptMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];
```

```ts
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
```

- [ ] **Step 5: Materialize phase from `ThreadItem`**

In `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`, add `phase` to returned message entries:

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

```ts
      return {
        type: "message",
        id: item.id,
        turnId,
        role: "assistant",
        source: item.text,
        sourceKind: "plainText",
        phase: item.phase,
        revision: 0,
      };
```

- [ ] **Step 6: Update existing reducer expectations**

Update existing `TranscriptEntry` object literals in `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts` so every expected `type: "message"` entry includes phase:

```ts
phase: null,
```

for user messages, and:

```ts
phase: "final_answer",
```

for existing `agentMessage(...)` calls that rely on the builder default.

- [ ] **Step 7: Run the focused reducer test and verify it passes**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit phase plumbing**

Run:

```bash
git add codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
git commit -m "feat(gui): preserve transcript message phase"
```

Expected: commit succeeds with only the listed files staged.

## Task 2: Add Turn Display Grouping For Temporary And Final Modules

**Files:**
- Create: `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`

- [ ] **Step 1: Write failing grouping tests**

Create `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";
import { groupTranscriptEntriesForDisplay } from "../committedTranscriptDisplayGroups";

const message = (
  id: string,
  role: "user" | "assistant",
  phase: Extract<TranscriptEntry, { type: "message" }>["phase"],
): TranscriptEntry => ({
  type: "message",
  id,
  turnId: "turn-display",
  role,
  source: id,
  sourceKind: "plainText",
  phase,
  revision: 0,
});

describe("groupTranscriptEntriesForDisplay", () => {
  it("groups commentary into a forced-open temporary module before final answer exists", () => {
    const commentary = message("commentary", "assistant", "commentary");

    expect(groupTranscriptEntriesForDisplay([commentary])).toStrictEqual([
      {
        type: "temporaryModule",
        id: "temporary:commentary",
        entries: [commentary],
        hasFinalAnswer: false,
      },
    ]);
  });

  it("keeps temporary and final answer modules as siblings once final answer exists", () => {
    const user = message("user", "user", null);
    const commentary = message("commentary", "assistant", "commentary");
    const finalAnswer = message("final", "assistant", "final_answer");

    expect(groupTranscriptEntriesForDisplay([user, commentary, finalAnswer])).toStrictEqual([
      { type: "entry", entry: user },
      {
        type: "temporaryModule",
        id: "temporary:commentary",
        entries: [commentary],
        hasFinalAnswer: true,
      },
      { type: "finalAnswer", entry: finalAnswer },
    ]);
  });

  it("does not fold legacy null phase assistant messages", () => {
    const legacy = message("legacy", "assistant", null);
    const finalAnswer = message("final", "assistant", "final_answer");

    expect(groupTranscriptEntriesForDisplay([legacy, finalAnswer])).toStrictEqual([
      { type: "entry", entry: legacy },
      { type: "finalAnswer", entry: finalAnswer },
    ]);
  });

  it("does not fold commentary after the first final answer", () => {
    const finalAnswer = message("final", "assistant", "final_answer");
    const lateCommentary = message("late-commentary", "assistant", "commentary");

    expect(groupTranscriptEntriesForDisplay([finalAnswer, lateCommentary])).toStrictEqual([
      { type: "finalAnswer", entry: finalAnswer },
      { type: "entry", entry: lateCommentary },
    ]);
  });
});
```

- [ ] **Step 2: Run the grouping test and verify it fails**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: FAIL because `committedTranscriptDisplayGroups.ts` does not exist.

- [ ] **Step 3: Implement the grouping helper**

Create `codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts`:

```ts
import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";

export type TranscriptTurnDisplayItem =
  | {
      type: "entry";
      entry: TranscriptEntry;
    }
  | {
      type: "temporaryModule";
      id: string;
      entries: TranscriptEntry[];
      hasFinalAnswer: boolean;
    }
  | {
      type: "finalAnswer";
      entry: TranscriptEntry;
    };

const isAssistantMessage = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> =>
  entry.type === "message" && entry.role === "assistant";

const isFinalAnswer = (entry: TranscriptEntry): boolean =>
  isAssistantMessage(entry) && entry.phase === "final_answer";

const isTemporaryBeforeFinalAnswer = (entry: TranscriptEntry): boolean =>
  isAssistantMessage(entry) && entry.phase === "commentary";

const temporaryModuleId = (entries: TranscriptEntry[]): string =>
  `temporary:${entries.map((entry) => entry.id).join(":")}`;

export const groupTranscriptEntriesForDisplay = (
  entries: TranscriptEntry[],
): TranscriptTurnDisplayItem[] => {
  const finalAnswerIndex = entries.findIndex(isFinalAnswer);
  const hasFinalAnswer = finalAnswerIndex !== -1;
  const temporaryBoundary = hasFinalAnswer ? finalAnswerIndex : entries.length;
  const temporaryEntries = entries
    .slice(0, temporaryBoundary)
    .filter(isTemporaryBeforeFinalAnswer);

  const firstTemporaryIndex = entries.findIndex(
    (entry, index) => index < temporaryBoundary && isTemporaryBeforeFinalAnswer(entry),
  );

  return entries.flatMap((entry, index): TranscriptTurnDisplayItem[] => {
    if (index === firstTemporaryIndex && temporaryEntries.length > 0) {
      return [
        {
          type: "temporaryModule",
          id: temporaryModuleId(temporaryEntries),
          entries: temporaryEntries,
          hasFinalAnswer,
        },
      ];
    }

    if (index < temporaryBoundary && isTemporaryBeforeFinalAnswer(entry)) {
      return [];
    }

    if (isFinalAnswer(entry)) {
      return [{ type: "finalAnswer", entry }];
    }

    return [{ type: "entry", entry }];
  });
};
```

- [ ] **Step 4: Run the grouping test and verify it passes**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit grouping helper**

Run:

```bash
git add codex-gui/src/features/committedTranscriptSurface/committedTranscriptDisplayGroups.ts codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
git commit -m "feat(gui): group transcript temporary content"
```

Expected: commit succeeds with only the listed files staged.

## Task 3: Render Temporary Content With HeroUI Disclosure

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: Write failing browser tests for the Disclosure behavior**

Add these tests to `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`:

```tsx
test("renders temporary content forced open until a final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-open", [
          agentMessage("agent-commentary-open", "Working before final", "commentary"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Working before final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Temporary updates · 1 item" }))
    .toBeDisabled();
});

test("renders temporary content collapsed beside the final answer once final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-collapsed", [
          agentMessage("agent-commentary-collapsed", "Hidden working note", "commentary"),
          agentMessage("agent-final-collapsed", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(screen.getByText("Hidden working note")).not.toBeVisible();

  const trigger = screen.getByRole("button", { name: "Temporary updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Hidden working note")).toBeVisible();
});

test("keeps legacy assistant messages outside the temporary disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-legacy-phase", [
          agentMessage("agent-legacy", "Legacy assistant text", null),
          agentMessage("agent-final-legacy", "Final after legacy", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Legacy assistant text")).toBeVisible();
  await expect.element(screen.getByText("Final after legacy")).toBeVisible();
  await expect
    .element(screen.queryByRole("button", { name: "Temporary updates · 1 item" }))
    .not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the browser tests and verify they fail**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because `CommittedTranscriptSurface` still renders chunks directly and has no temporary disclosure trigger.

- [ ] **Step 3: Update imports and add a temporary disclosure component**

In `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`, change imports:

```tsx
import { memo, useState } from "react";
import { Alert, Button, Card, Chip, Disclosure, Typography } from "@heroui/react";
import { groupTranscriptEntriesForDisplay } from "./committedTranscriptDisplayGroups";
```

Add this component below `CommittedTranscriptEntry`:

```tsx
const temporaryUpdatesLabel = (count: number): string =>
  `Temporary updates · ${String(count)} ${count === 1 ? "item" : "items"}`;

const TemporaryTranscriptModule = ({
  entries,
  hasFinalAnswer,
}: {
  entries: TranscriptEntry[];
  hasFinalAnswer: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = temporaryUpdatesLabel(entries.length);

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
        <Disclosure.Body className="grid min-w-0 gap-3 pt-3">
          {entries.map((entry) => (
            <CommittedTranscriptEntry key={entry.id} entry={entry} />
          ))}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
};
```

- [ ] **Step 4: Render grouped display items inside chunks**

Replace the direct entry map in `CommittedTranscriptChunk` with grouped display rendering:

```tsx
  const displayItems = groupTranscriptEntriesForDisplay(chunk.entries);

  return (
    <div className="committed-transcript-chunk grid min-w-0 gap-3">
      {displayItems.map((item) => {
        switch (item.type) {
          case "entry":
          case "finalAnswer":
            return <CommittedTranscriptEntry key={item.entry.id} entry={item.entry} />;
          case "temporaryModule":
            return (
              <TemporaryTranscriptModule
                entries={item.entries}
                hasFinalAnswer={item.hasFinalAnswer}
                key={item.id}
              />
            );
        }

        const exhaustiveItem: never = item;
        return exhaustiveItem;
      })}
    </div>
  );
```

- [ ] **Step 5: Run the browser tests and verify they pass**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit HeroUI disclosure rendering**

Run:

```bash
git add codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git commit -m "feat(gui): collapse temporary transcript updates"
```

Expected: commit succeeds with only the listed files staged.

## Task 4: Run Focused And Package Validation

**Files:**
- Verify only; no source files should be modified.

- [ ] **Step 1: Run focused transcript state tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused committed transcript unit tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:unit -- src/features/committedTranscriptSurface/__tests__/committedTranscriptDisplayGroups.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run focused committed transcript browser tests**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run package lint**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Run package type-check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
eval "$(/opt/homebrew/bin/fnm env --shell zsh)"
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit validation-only fixes when required**

When Steps 1-5 pass without additional edits, do not create a validation commit. When lint or type-check requires source changes, commit only those fixes:

```bash
git add codex-gui/src/features/committedTranscriptSurface codex-gui/src/features/transcriptState codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts
git commit -m "fix(gui): satisfy transcript collapse checks"
```

Expected: either no commit is needed, or the commit contains only validation-driven fixes for files touched by this plan.

## Self-Review Notes

- Spec coverage: phase preservation is covered by Task 1; temporary/final sibling grouping is covered by Task 2; HeroUI `Disclosure` forced-open/default-collapsed behavior is covered by Task 3; validation commands are covered by Task 4.
- Placeholder scan: no task depends on unspecified files or undefined helper names.
- Type consistency: `TranscriptMessagePhase`, `TranscriptTurnDisplayItem`, `temporaryModule`, and `finalAnswer` are introduced before any later task references them.
