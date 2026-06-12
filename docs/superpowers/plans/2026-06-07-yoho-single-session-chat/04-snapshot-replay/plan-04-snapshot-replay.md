# Snapshot Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `snapshotReplay` GUI feature module that derives ordered `source: "snapshotReplay"` replay material from `threadRuntimeSlice` snapshot turns.

**Architecture:** Implement snapshot replay as a pure TypeScript module with no React or App wiring. The module reads `ThreadRuntimeRecord` through `threadRuntimeSlice` selectors, emits replay material in turn/item order, and does not consume live `eventBuffer` or import the legacy `projectionSlice`.

**Tech Stack:** TypeScript, Redux Toolkit selectors, Vitest, pnpm.

---

## Scope

This plan implements only `04 Snapshot Replay`.

It does not delete `projectionSlice`, wire replay material into `App.tsx`, interpret live events, build a chat view model, add visible UI, implement streaming, add reconnect UI, or touch composer/tool activity behavior.

## File Structure

- Create: `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
  - Owns replay material types, terminal turn handling, pure material derivation, and selector.
- Create: `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
  - Covers empty runtime, turn/item order, terminal vs in-progress turns, source tagging, selector behavior, and event buffer isolation.

---

### Task 1: Add Snapshot Replay Materials

**Files:**
- Create: `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
- Create: `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`

- [ ] **Step 1: Write the failing snapshot replay tests**

Create `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import {
  buildSnapshotReplayMaterials,
  selectSnapshotReplayMaterials,
  type SnapshotReplayMaterial,
} from "../snapshotReplay";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;

const turnWithoutItems = ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
}: Turn): Omit<Turn, "items"> => ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
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

const runtimeFromAttach = (
  response: ThreadProjectionAttachResponse,
): ThreadRuntimeRecord => {
  const { turns: snapshotTurns, ...thread } = response.snapshot.thread;

  return {
    threadId: thread.id,
    sessionId: thread.sessionId,
    thread,
    snapshotTurns,
    eventBuffer: [],
    activeTurnId:
      snapshotTurns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null,
    subscription: { state: "active" },
  };
};

describe("snapshot replay", () => {
  it("returns no material when no runtime exists", () => {
    const store = makeStore();

    expect(buildSnapshotReplayMaterials(null)).toStrictEqual([]);
    expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual([]);
  });

  it("expands snapshot turns into ordered replay material", () => {
    const runtime = runtimeFromAttach(attachBaseline);
    const turn = attachBaseline.snapshot.thread.turns[0];
    const item = turn.items[0];

    expect(buildSnapshotReplayMaterials(runtime)).toStrictEqual([
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: turn.id,
        item,
      },
      {
        type: "turnCompleted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: turnWithoutItems(turn),
      },
    ] satisfies SnapshotReplayMaterial[]);
  });

  it("keeps in-progress turns open and preserves item order", () => {
    if (eventTurnStarted.event.type !== "turnStarted") {
      throw new Error("fixture must contain a turnStarted projection event");
    }
    if (eventItemStarted.event.type !== "itemStarted") {
      throw new Error("fixture must contain an itemStarted projection event");
    }

    const inProgressTurn: Turn = {
      ...eventTurnStarted.event.notification.turn,
      items: [
        { type: "plan", id: "first-plan", text: "First replayed item" },
        eventItemStarted.event.notification.item,
      ],
    };
    const runtime = runtimeFromAttach(attachWithTurns([inProgressTurn]));

    expect(buildSnapshotReplayMaterials(runtime)).toStrictEqual([
      {
        type: "turnStarted",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turn: inProgressTurn,
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: inProgressTurn.id,
        item: inProgressTurn.items[0],
      },
      {
        type: "itemReplayed",
        source: "snapshotReplay",
        threadId: attachBaseline.snapshot.thread.id,
        turnId: inProgressTurn.id,
        item: inProgressTurn.items[1],
      },
    ] satisfies SnapshotReplayMaterial[]);
  });

  it("selects replay material from thread runtime state without consuming event buffer", () => {
    const store = makeStore();
    store.dispatch(threadRuntimeAttached(attachBaseline));

    const beforeLiveEvent = selectSnapshotReplayMaterials(store.getState());

    store.dispatch(threadRuntimeEventBuffered(eventTurnStarted));

    expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(beforeLiveEvent);
  });
});
```

- [ ] **Step 2: Run the focused snapshot replay test and confirm it fails**

Run from the repo root:

```bash
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

Expected result: FAIL because `../snapshotReplay` does not exist yet.

- [ ] **Step 3: Add the snapshot replay implementation**

Create `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`:

```ts
import type { RootState } from "@/app/store";
import {
  selectThreadRuntimeRecord,
  type ThreadRuntimeRecord,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn } from "@codex-protocol/v2";

export type SnapshotReplaySource = "snapshotReplay";

export type SnapshotReplayMaterial =
  | {
      type: "turnStarted";
      source: SnapshotReplaySource;
      threadId: string;
      turn: Turn;
    }
  | {
      type: "itemReplayed";
      source: SnapshotReplaySource;
      threadId: string;
      turnId: string;
      item: ThreadItem;
    }
  | {
      type: "turnCompleted";
      source: SnapshotReplaySource;
      threadId: string;
      turn: Omit<Turn, "items">;
    };

const SNAPSHOT_REPLAY_SOURCE: SnapshotReplaySource = "snapshotReplay";

const isTerminalTurn = (turn: Turn): boolean =>
  turn.status === "completed" || turn.status === "interrupted" || turn.status === "failed";

const turnWithoutItems = ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
}: Turn): Omit<Turn, "items"> => ({
  id,
  itemsView,
  status,
  error,
  startedAt,
  completedAt,
  durationMs,
});

export const buildSnapshotReplayMaterials = (
  runtime: ThreadRuntimeRecord | null,
): SnapshotReplayMaterial[] => {
  if (runtime == null) {
    return [];
  }

  return runtime.snapshotTurns.flatMap((turn) => {
    const materials: SnapshotReplayMaterial[] = [
      {
        type: "turnStarted",
        source: SNAPSHOT_REPLAY_SOURCE,
        threadId: runtime.threadId,
        turn,
      },
    ];

    materials.push(
      ...turn.items.map(
        (item): SnapshotReplayMaterial => ({
          type: "itemReplayed",
          source: SNAPSHOT_REPLAY_SOURCE,
          threadId: runtime.threadId,
          turnId: turn.id,
          item,
        }),
      ),
    );

    if (isTerminalTurn(turn)) {
      materials.push({
        type: "turnCompleted",
        source: SNAPSHOT_REPLAY_SOURCE,
        threadId: runtime.threadId,
        turn: turnWithoutItems(turn),
      });
    }

    return materials;
  });
};

export const selectSnapshotReplayMaterials = (state: RootState): SnapshotReplayMaterial[] =>
  buildSnapshotReplayMaterials(selectThreadRuntimeRecord(state));
```

- [ ] **Step 4: Run the focused snapshot replay test and confirm it passes**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Run formatter before committing**

Run:

```bash
pnpm --dir codex-gui run format
```

Expected result: PASS and no unexpected non-`snapshotReplay` source changes.

- [ ] **Step 6: Commit snapshot replay materials**

Run:

```bash
git add codex-gui/src/features/snapshotReplay/snapshotReplay.ts \
  codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
git commit -m "feat(gui): add snapshot replay materials"
```

---

### Task 2: Final Verification And Scope Check

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused snapshot replay tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/snapshotReplay/__tests__/snapshotReplay.test.ts
```

Expected result: PASS.

- [ ] **Step 2: Run focused thread runtime tests**

Run:

```bash
pnpm --dir codex-gui exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

- [ ] **Step 4: Review the committed diff**

Run:

```bash
git log --oneline -1
git status --short
git diff HEAD~1..HEAD --stat
git diff HEAD~1..HEAD -- codex-gui/src/features/snapshotReplay
```

Expected result:

- The latest commit is `feat(gui): add snapshot replay materials`.
- `git status --short` is empty.
- The committed diff only touches:
  - `codex-gui/src/features/snapshotReplay/snapshotReplay.ts`
  - `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`

- [ ] **Step 5: Confirm non-goals stayed out of scope**

Check the diff manually and verify:

- No `projectionSlice` deletion.
- No import from `@/features/projection/projectionSlice` in new `snapshotReplay` code.
- No `App.tsx` changes.
- No store registration changes.
- No chat view model selectors.
- No live event handling.
- No visible UI.
- No composer or tool activity changes.

If any of those appear, revert that part before considering this plan complete.
