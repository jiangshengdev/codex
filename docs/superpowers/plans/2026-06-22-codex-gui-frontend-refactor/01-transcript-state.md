# Transcript State Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract transcript item materialization from `transcriptStateSlice.ts` into a focused same-feature module without changing transcript behavior.

**Architecture:** Keep `TranscriptEntry` and all transcript state types in `transcriptStateSlice.ts`. Create `transcriptEntryMaterialization.ts` beside the slice, move `textFromUserInput` and `materializeItem` behavior there, and have the slice call the exported `materializeTranscriptItem` helper.

**Tech Stack:** TypeScript, Redux Toolkit slice selectors, generated `@codex-protocol/v2` types, Vitest, pnpm.

---

## Source Design

Implement only this confirmed design:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/01-transcript-state-design.md
```

Use the overall constraints from:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/00-overall-design.md
```

Do not edit either design while executing this plan. If implementation exposes a design mismatch, stop and report the mismatch before changing design, tests, or source scope.

## Scope

This plan creates:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`

This plan modifies:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

This plan does not modify:

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/**`
- `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
- `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
- Any UI component, app-server protocol file, lockfile, or dependency file

This plan does not stage or commit implementation changes unless the user explicitly asks during execution.

## File Structure

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
  - Owns only protocol item/input to `TranscriptEntry` conversion.
  - Exports only `materializeTranscriptItem`.
  - Keeps `textFromUserInput` private.
  - Imports `TranscriptEntry` as a type from `./transcriptStateSlice`.

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Removes local `textFromUserInput` and `materializeItem`.
  - Removes unused `ThreadItem` and `UserInput` imports.
  - Imports `materializeTranscriptItem`.
  - Replaces existing `materializeItem(...)` call sites with `materializeTranscriptItem(...)`.
  - Leaves state shape, chunking, selectors, reducers, and exported transcript types unchanged.

## Behavior Contract

The extracted helper must preserve these exact rules:

- `userMessage` joins only `text` user inputs.
- `image`, `localImage`, `skill`, and `mention` user inputs contribute `""`.
- Empty user message content materializes to `null`.
- Empty agent message text materializes to `null`.
- Materialized user messages keep `role: "user"`, `sourceKind: "plainText"`, and `revision: 0`.
- Materialized agent messages keep `role: "assistant"`, `sourceKind: "plainText"`, and `revision: 0`.
- Non-chat `ThreadItem` variants materialize to `null`.
- `ThreadItem` and `UserInput` switches remain exhaustive.

---

### Task 1: Verify Current Reducer Behavior Baseline

**Files:**
- Read: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Read: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Run the target reducer test before editing**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: tests pass before refactor. If this fails before source edits, stop and report the pre-existing failure.

- [ ] **Step 2: Confirm the materialization source block**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`, confirm the implementation still has this local boundary:

```ts
const textFromUserInput = (input: UserInput): string => {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
    case "localImage":
    case "skill":
    case "mention":
      return "";
  }

  const exhaustiveInput: never = input;
  return exhaustiveInput;
};

const materializeItem = (item: ThreadItem, turnId: string): TranscriptEntry | null => {
  switch (item.type) {
    case "userMessage": {
      const source = item.content.map(textFromUserInput).join("");
      if (source.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        turnId,
        role: "user",
        source,
        sourceKind: "plainText",
        revision: 0,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        turnId,
        role: "assistant",
        source: item.text,
        sourceKind: "plainText",
        revision: 0,
      };
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "subAgentActivity":
    case "webSearch":
    case "imageView":
    case "sleep":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
      return null;
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};
```

Expected: the block matches current behavior. If protocol variants have changed, stop and report the mismatch before editing.

### Task 2: Create the Materialization Module

**Files:**
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`

- [ ] **Step 1: Create `transcriptEntryMaterialization.ts`**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts` with this content:

```ts
import type { ThreadItem, UserInput } from "@codex-protocol/v2";
import type { TranscriptEntry } from "./transcriptStateSlice";

const textFromUserInput = (input: UserInput): string => {
  switch (input.type) {
    case "text":
      return input.text;
    case "image":
    case "localImage":
    case "skill":
    case "mention":
      return "";
  }

  const exhaustiveInput: never = input;
  return exhaustiveInput;
};

export const materializeTranscriptItem = (
  item: ThreadItem,
  turnId: string,
): TranscriptEntry | null => {
  switch (item.type) {
    case "userMessage": {
      const source = item.content.map(textFromUserInput).join("");
      if (source.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        turnId,
        role: "user",
        source,
        sourceKind: "plainText",
        revision: 0,
      };
    }
    case "agentMessage":
      if (item.text.length === 0) {
        return null;
      }

      return {
        type: "message",
        id: item.id,
        turnId,
        role: "assistant",
        source: item.text,
        sourceKind: "plainText",
        revision: 0,
      };
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "subAgentActivity":
    case "webSearch":
    case "imageView":
    case "sleep":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
      return null;
  }

  const exhaustiveItem: never = item;
  return exhaustiveItem;
};
```

Expected: the new module has one exported function and no test-only exports.

### Task 3: Wire the Slice to the New Module

**Files:**
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Update imports**

Change the top of `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts` from:

```ts
import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn, TurnStatus, UserInput } from "@codex-protocol/v2";
```

to:

```ts
import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { Turn, TurnStatus } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
```

Expected: `ThreadItem` and `UserInput` are no longer imported by the slice.

- [ ] **Step 2: Remove local materialization helpers**

Remove the local `textFromUserInput` and `materializeItem` declarations from `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`.

The code should jump from:

```ts
const upsertTurnFromPayload = (state: TranscriptState, turn: Turn) => {
  const existingTurn = state.turnsById[turn.id];
  if (existingTurn == null) {
    state.turnsById[turn.id] = {
      id: turn.id,
      status: turn.status,
    };
    state.turnIds.push(turn.id);
    return;
  }

  existingTurn.status = turn.status;
};
```

directly to:

```ts
const getOrCreateAppendChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  const chunkIds = state.chunkIdsByTurnId[turnId] ?? [];
  const lastChunkId = chunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];
```

Expected: slice still owns turn, chunk, snapshot, reducer, and selector logic.

- [ ] **Step 3: Replace snapshot rebuild call site**

In `rebuildFromSnapshot`, change:

```ts
const entry = materializeItem(item, turn.id);
```

to:

```ts
const entry = materializeTranscriptItem(item, turn.id);
```

Expected: snapshot rebuild still appends only non-null baseline entries.

- [ ] **Step 4: Replace live itemCompleted call site**

In the `threadRuntimeEventBuffered` `itemCompleted` branch, change:

```ts
const entry = materializeItem(item, turnId);
```

to:

```ts
const entry = materializeTranscriptItem(item, turnId);
```

Expected: live committed entry upsert still happens only for non-null entries.

### Task 4: Verify and Review the Refactor

**Files:**
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Run the target reducer test**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected: all tests in `transcriptStateSlice.test.ts` pass.

- [ ] **Step 2: Run type-check**

Run:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: TypeScript passes with no import cycle, unused import, or exhaustive switch error.

- [ ] **Step 3: Inspect the source diff**

Run:

```bash
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts codex-gui/src/features/transcriptState/transcriptStateSlice.ts
```

Expected diff shape:

- `transcriptEntryMaterialization.ts` is a new same-feature production module.
- `transcriptStateSlice.ts` imports `materializeTranscriptItem`.
- `transcriptStateSlice.ts` no longer imports `ThreadItem` or `UserInput`.
- `transcriptStateSlice.ts` still defines transcript types, chunking helpers, selectors, and reducers.
- No test files, UI files, e2e files, protocol files, lockfiles, or dependency files are changed.

- [ ] **Step 4: Stop before staging or committing**

Do not run `git add` or `git commit` unless the user explicitly asks for that execution step.

Report:

```text
Implemented 01 transcript state materialization split.
Verified:
- pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
- pnpm run type-check
Changed:
- codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts
- codex-gui/src/features/transcriptState/transcriptStateSlice.ts
```

Expected: implementation is ready for review with unstaged working tree changes unless the user asked to stage or commit.
