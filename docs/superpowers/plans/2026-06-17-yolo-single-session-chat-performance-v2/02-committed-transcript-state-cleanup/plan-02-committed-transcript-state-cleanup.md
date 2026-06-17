# Committed Transcript State Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the obsolete `incrementalChatState` complete-tree owner with a new `transcriptState` committed transcript facts owner that exposes only chunk/id selectors.

**Architecture:** `transcriptState` consumes the existing shared `threadRuntimeAttached`, `threadRuntimeEventBuffered`, and `threadRuntimeManualReconnectRequired` actions via `extraReducers`. It owns committed turn, chunk, entry, global status, and applied-event facts; it never stores `turnViews`, `messagesByTurnId`, React-ready nodes, active tail, or a complete `turns -> messages[]` view.

**Tech Stack:** TypeScript, Redux Toolkit `createAppSlice`, Vitest, pnpm.

---

## Source Design

Implement exactly the confirmed small design:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/02-committed-transcript-state-cleanup-design.md`

Do not modify that design while executing this plan. If the design proves insufficient, stop implementation and report the mismatch before editing any design or plan content.

## Scope

This plan creates:

- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

This plan modifies:

- `codex-gui/src/app/store.ts`

This plan deletes:

- `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
- `codex-gui/src/features/incrementalChatState/` if the directory is empty after deleting the old files

This plan does not modify:

- `codex-gui/src/features/chatTextModel/**`
- `codex-gui/src/features/liveEventHandling/**`
- `codex-gui/src/features/snapshotReplay/**`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/App.tsx`
- Any active tail, streaming, windowing, Markdown rendering, or React chat surface code

## File Structure

- Create: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
  - Defines `TranscriptState`, `TranscriptTurn`, `TranscriptChunk`, `TranscriptEntry`, `TranscriptChunkView`, and `TranscriptGlobalStatus`.
  - Defines `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100` and `MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500`.
  - Handles attach baseline rebuild, live event apply, manual reconnect status, chunk writes, idempotency, and selectors.
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - Replaces old complete-tree tests with chunk/id selector tests.
  - Verifies no active tail or complete tree selector is required.
- Modify: `codex-gui/src/app/store.ts`
  - Registers `transcriptStateSlice` instead of `incrementalChatStateSlice`.
- Delete: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
  - Removes obsolete `turnViews`, `messagesByTurnId`, `selectIncrementalChatTurns`, and old owner name.
- Delete: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
  - Removes old complete-tree and identity assertions.

## Implementation Contracts

Use these exported names from `transcriptStateSlice.ts`:

```ts
export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;

export type TranscriptEntry =
  | {
      type: "message";
      id: string;
      turnId: string;
      role: "user" | "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      revision: number;
    }
  | {
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    };

export const {
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;
```

Do not export or create these obsolete names:

```ts
selectIncrementalChatTurns
IncrementalChatTurnView
turnViews
messagesByTurnId
messageViewIndexById
```

Do not add `selectActiveTailForTurn` in this plan.

---

### Task 1: Add Failing Transcript State Contract Tests

**Files:**
- Create: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Create the test file with shared fixtures**

Create `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts` with these imports and helpers:

```ts
import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventItemCompletedJson from "@/features/projection/__fixtures__/event-item-completed.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnCompletedJson from "@/features/projection/__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
  transcriptStateSlice,
} from "../transcriptStateSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

const imageInput = (url: string): UserInput => ({
  type: "image",
  url,
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

const planItem = (id: string): ThreadItem => ({
  type: "plan",
  id,
  text: "Hidden plan text",
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

const turnStarted = (commitId: string, turn: Turn): ThreadProjectionEventNotification => {
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  return {
    ...eventTurnStarted,
    commitId,
    event: {
      ...eventTurnStarted.event,
      notification: {
        ...eventTurnStarted.event.notification,
        turn,
      },
    },
  };
};

const turnCompleted = (commitId: string, turn: Turn): ThreadProjectionEventNotification => {
  if (eventTurnCompleted.event.type !== "turnCompleted") {
    throw new Error("fixture must contain a turnCompleted projection event");
  }

  return {
    ...eventTurnCompleted,
    commitId,
    event: {
      ...eventTurnCompleted.event,
      notification: {
        ...eventTurnCompleted.event.notification,
        turn,
      },
    },
  };
};
```

- [ ] **Step 2: Add initial state and attach rebuild tests**

Append these tests inside `describe("transcript state reducer", () => { ... })`:

```ts
describe("transcript state reducer", () => {
  it("registers transcript state in the app store", () => {
    const store = makeStore();

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual([]);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("rebuilds committed transcript chunks from an accepted attach snapshot", () => {
    const attachWithChat = attachWithTurns([
      baseTurn("turn-snapshot", [
        userMessage("user-snapshot", [
          textInput("Hello "),
          imageInput("https://example.invalid/a.png"),
          textInput("there"),
        ]),
        agentMessage("agent-snapshot", "**Plain** text"),
        planItem("plan-snapshot"),
      ]),
    ]);
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithChat));

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-snapshot"]);
    expect(selectTranscriptTurn(store.getState(), "turn-snapshot")).toStrictEqual({
      id: "turn-snapshot",
      status: "completed",
    });
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-snapshot")).toStrictEqual([
      "turn-snapshot:chunk:0",
    ]);
    expect(selectTranscriptChunk(store.getState(), "turn-snapshot:chunk:0")).toStrictEqual({
      id: "turn-snapshot:chunk:0",
      turnId: "turn-snapshot",
      revision: 0,
      entries: [
        {
          type: "message",
          id: "user-snapshot",
          turnId: "turn-snapshot",
          role: "user",
          source: "Hello there",
          sourceKind: "plainText",
          revision: 0,
        },
        {
          type: "message",
          id: "agent-snapshot",
          turnId: "turn-snapshot",
          role: "assistant",
          source: "**Plain** text",
          sourceKind: "plainText",
          revision: 0,
        },
      ],
    });
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });

  it("filters empty text, non-text user inputs, and non-chat snapshot items", () => {
    const store = makeStore();

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns([
          baseTurn("turn-filtered", [
            userMessage("image-only", [imageInput("https://example.invalid/image.png")]),
            userMessage("empty-user", [textInput("")]),
            agentMessage("empty-agent", ""),
            planItem("hidden-plan"),
          ]),
        ]),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-filtered"]);
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-filtered")).toStrictEqual([]);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm red**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected result: FAIL because `transcriptStateSlice.ts` and the new selectors do not exist yet.

---

### Task 2: Implement Transcript State Attach Rebuild

**Files:**
- Create: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- Modify: `codex-gui/src/app/store.ts`

- [ ] **Step 1: Create the transcript state slice with types and initial selectors**

Create `codex-gui/src/features/transcriptState/transcriptStateSlice.ts` with the initial owner shape:

```ts
import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn, TurnStatus, UserInput } from "@codex-protocol/v2";

export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
};

export type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: string[];
  revision: number;
};

export type TranscriptEntry =
  | {
      type: "message";
      id: string;
      turnId: string;
      role: "user" | "assistant";
      source: string;
      sourceKind: "plainText" | "markdown";
      revision: number;
    }
  | {
      type: "status";
      id: string;
      turnId: string;
      status: "interrupted" | "failed";
      revision: number;
    };

export type TranscriptGlobalStatus = {
  id: string;
  status: "subscriptionInterrupted";
  reason: ProjectionManualReconnectReason;
  subscriptionId: string | null;
};

export type TranscriptChunkView = {
  id: string;
  turnId: string;
  revision: number;
  entries: TranscriptEntry[];
};

export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunkIdsByTurnId: Record<string, string[]>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<string, TranscriptEntry>;
  entryChunkById: Record<string, string>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

const initialState: TranscriptState = {
  threadId: null,
  subscriptionId: null,
  turnIds: [],
  turnsById: {},
  chunkIdsByTurnId: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
};
```

- [ ] **Step 2: Add attach rebuild helpers**

Add these helpers below `initialState`:

```ts
const createEmptyState = (): TranscriptState => ({
  ...initialState,
  turnIds: [],
  turnsById: {},
  chunkIdsByTurnId: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});

const resetState = (state: TranscriptState, nextState: TranscriptState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.turnIds = nextState.turnIds;
  state.turnsById = nextState.turnsById;
  state.chunkIdsByTurnId = nextState.chunkIdsByTurnId;
  state.chunksById = nextState.chunksById;
  state.entriesById = nextState.entriesById;
  state.entryChunkById = nextState.entryChunkById;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
};

const chunkIdForIndex = (turnId: string, chunkIndex: number): string =>
  `${turnId}:chunk:${chunkIndex}`;

const ensureTurnExists = (state: TranscriptState, turnId: string): TranscriptTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const turn: TranscriptTurn = {
    id: turnId,
    status: "inProgress",
  };
  state.turnsById[turnId] = turn;
  state.turnIds.push(turnId);
  state.chunkIdsByTurnId[turnId] = [];
  return turn;
};

const upsertTurnFromPayload = (state: TranscriptState, turn: Turn) => {
  const existingTurn = state.turnsById[turn.id];
  if (existingTurn == null) {
    state.turnsById[turn.id] = {
      id: turn.id,
      status: turn.status,
    };
    state.turnIds.push(turn.id);
    state.chunkIdsByTurnId[turn.id] = [];
    return;
  }

  existingTurn.status = turn.status;
};

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

- [ ] **Step 3: Add chunk append and rebuild logic**

Add these helpers:

```ts
const getOrCreateAppendChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  const chunkIds = state.chunkIdsByTurnId[turnId] ?? [];
  const lastChunkId = chunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];

  if (lastChunk != null && lastChunk.entryIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = chunkIdForIndex(turnId, chunkIds.length);
  const chunk: TranscriptChunk = {
    id: chunkId,
    turnId,
    entryIds: [],
    revision: 0,
  };
  state.chunksById[chunkId] = chunk;
  state.chunkIdsByTurnId[turnId] = [...chunkIds, chunkId];
  return chunk;
};

const appendEntryToChunk = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  ensureTurnExists(state, entry.turnId);

  const chunk = getOrCreateAppendChunk(state, entry.turnId);
  state.entriesById[entry.id] = entry;
  chunk.entryIds.push(entry.id);
  if (options.bumpChunkRevision) {
    chunk.revision += 1;
  }
  state.entryChunkById[entry.id] = chunk.id;
};

const appendBaselineEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  appendEntryToChunk(state, entry, { bumpChunkRevision: false });
};

const upsertLiveCommittedEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  const existingEntry = state.entriesById[entry.id];
  if (existingEntry == null) {
    appendEntryToChunk(state, entry, { bumpChunkRevision: true });
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

const rebuildFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  turns: Turn[],
) => {
  const nextState = createEmptyState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;

  for (const turn of turns) {
    upsertTurnFromPayload(nextState, turn);
    for (const item of turn.items) {
      const entry = materializeItem(item, turn.id);
      if (entry != null) {
        appendBaselineEntry(nextState, entry);
      }
    }
  }

  resetState(state, nextState);
};
```

- [ ] **Step 4: Add slice, selectors, and attach reducer**

Add the slice export:

```ts
export const transcriptStateSlice = createAppSlice({
  name: "transcriptState",
  initialState,
  reducers: () => ({}),
  selectors: {
    selectTranscriptTurnIds: (transcriptState): string[] => transcriptState.turnIds,
    selectTranscriptTurn: (transcriptState, turnId: string): TranscriptTurn | null =>
      transcriptState.turnsById[turnId] ?? null,
    selectTranscriptChunkIdsForTurn: (transcriptState, turnId: string): string[] =>
      transcriptState.chunkIdsByTurnId[turnId] ?? [],
    selectTranscriptChunk: (transcriptState, chunkId: string): TranscriptChunkView | null => {
      const chunk = transcriptState.chunksById[chunkId];
      if (chunk == null) {
        return null;
      }

      return {
        id: chunk.id,
        turnId: chunk.turnId,
        revision: chunk.revision,
        entries: chunk.entryIds.flatMap((entryId) => {
          const entry = transcriptState.entriesById[entryId];
          return entry == null ? [] : [entry];
        }),
      };
    },
    selectTranscriptEntry: (transcriptState, entryId: string): TranscriptEntry | null =>
      transcriptState.entriesById[entryId] ?? null,
    selectTranscriptGlobalStatus: (transcriptState): TranscriptGlobalStatus[] =>
      transcriptState.globalStatus,
  },
  extraReducers: (builder) => {
    builder.addCase(threadRuntimeAttached, (state, action) => {
      rebuildFromSnapshot(
        state,
        action.payload.snapshot.thread.id,
        action.payload.subscriptionId,
        action.payload.snapshot.thread.turns,
      );
    });
  },
});

export const {
  selectTranscriptChunk,
  selectTranscriptChunkIdsForTurn,
  selectTranscriptEntry,
  selectTranscriptGlobalStatus,
  selectTranscriptTurn,
  selectTranscriptTurnIds,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
```

- [ ] **Step 5: Register the new slice in the app store**

In `codex-gui/src/app/store.ts`, replace the old import and `combineSlices` entry:

```ts
import transcriptStateSlice from "@/features/transcriptState/transcriptStateSlice";
```

The root reducer should become:

```ts
const rootReducer = combineSlices(threadIdentitySlice, threadRuntimeSlice, transcriptStateSlice);
```

- [ ] **Step 6: Run the focused test and confirm the attach tests pass**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected result: the tests from Task 1 pass.

- [ ] **Step 7: Commit the new attach owner**

Run:

```bash
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts codex-gui/src/app/store.ts
git commit -m "feat(gui): add committed transcript state owner"
```

---

### Task 3: Add Live Event Contract Tests

**Files:**
- Modify: `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`

- [ ] **Step 1: Add live append, status, and itemStarted tests**

Append these tests inside the existing `describe` block:

```ts
  it("applies live itemCompleted messages into committed transcript chunks", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        turnStarted("commit-live-turn", {
          ...baseTurn("turn-live", []),
          status: "inProgress",
        }),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemStarted(
          "commit-live-started",
          "turn-live",
          agentMessage("agent-started", "Started should be ignored"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-live-agent", "turn-live", agentMessage("agent-live", "Live answer")),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-live")).toStrictEqual({
      id: "turn-live",
      status: "inProgress",
    });
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-live")).toStrictEqual([
      "turn-live:chunk:0",
    ]);
    expect(selectTranscriptChunk(store.getState(), "turn-live:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-live",
        turnId: "turn-live",
        role: "assistant",
        source: "Live answer",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
  });

  it("updates turn terminal status from live turnCompleted", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        turnStarted("commit-start-done", {
          ...baseTurn("turn-done", []),
          status: "inProgress",
        }),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        turnCompleted("commit-complete-done", {
          ...baseTurn("turn-done", []),
          status: "completed",
        }),
      ),
    );

    expect(selectTranscriptTurn(store.getState(), "turn-done")).toStrictEqual({
      id: "turn-done",
      status: "completed",
    });
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-done")).toStrictEqual([]);
  });

  it("filters empty text and non-chat live item completions", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-empty-user",
          "turn-live-filtered",
          userMessage("empty-user", [textInput("")]),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-empty-agent", "turn-live-filtered", agentMessage("empty-agent", "")),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-plan", "turn-live-filtered", planItem("hidden-plan")),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-live-filtered"]);
    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-live-filtered")).toStrictEqual(
      [],
    );
  });
```

- [ ] **Step 2: Add dedupe, update, and chunk limit tests**

Append these tests:

```ts
  it("uses commitId to avoid applying the same live notification twice", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-duplicate", "turn-duplicate", agentMessage("agent-first", "First")),
      ),
    );
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-duplicate",
          "turn-duplicate",
          agentMessage("agent-second", "Second should be ignored"),
        ),
      ),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-duplicate:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-first",
        turnId: "turn-duplicate",
        role: "assistant",
        source: "First",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
  });

  it("updates an existing committed entry and bumps only its chunk revision", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-first", "turn-update", agentMessage("agent-update", "First")),
      ),
    );
    const beforeUpdateChunk = selectTranscriptChunk(store.getState(), "turn-update:chunk:0");

    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted("commit-second", "turn-update", agentMessage("agent-update", "Second")),
      ),
    );

    expect(selectTranscriptEntry(store.getState(), "agent-update")).toStrictEqual({
      type: "message",
      id: "agent-update",
      turnId: "turn-update",
      role: "assistant",
      source: "Second",
      sourceKind: "plainText",
      revision: 1,
    });
    expect(selectTranscriptChunk(store.getState(), "turn-update:chunk:0")).toStrictEqual({
      id: "turn-update:chunk:0",
      turnId: "turn-update",
      revision: (beforeUpdateChunk?.revision ?? 0) + 1,
      entries: [
        {
          type: "message",
          id: "agent-update",
          turnId: "turn-update",
          role: "assistant",
          source: "Second",
          sourceKind: "plainText",
          revision: 1,
        },
      ],
    });
  });

  it("creates a new chunk after the committed chunk entry limit", () => {
    const store = makeStore();

    store.dispatch(threadRuntimeAttached(attachWithTurns([])));
    for (let index = 0; index <= TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT; index += 1) {
      store.dispatch(
        threadRuntimeEventBuffered(
          itemCompleted(
            `commit-chunk-${index}`,
            "turn-chunked",
            agentMessage(`agent-chunk-${index}`, `Entry ${index}`),
          ),
        ),
      );
    }

    expect(selectTranscriptChunkIdsForTurn(store.getState(), "turn-chunked")).toStrictEqual([
      "turn-chunked:chunk:0",
      "turn-chunked:chunk:1",
    ]);
    expect(selectTranscriptChunk(store.getState(), "turn-chunked:chunk:0")?.entries).toHaveLength(
      TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
    );
    expect(selectTranscriptChunk(store.getState(), "turn-chunked:chunk:1")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-chunk-100",
        turnId: "turn-chunked",
        role: "assistant",
        source: "Entry 100",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
  });
```

- [ ] **Step 3: Add manual reconnect and attach reset tests**

Append these tests:

```ts
  it("preserves committed transcript and sets global status on manual reconnect", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-existing", [agentMessage("agent-existing", "Existing answer")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );

    expect(selectTranscriptChunk(store.getState(), "turn-existing:chunk:0")?.entries).toStrictEqual([
      {
        type: "message",
        id: "agent-existing",
        turnId: "turn-existing",
        role: "assistant",
        source: "Existing answer",
        sourceKind: "plainText",
        revision: 0,
      },
    ]);
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([
      {
        id: `subscriptionInterrupted:${attachWithChat.snapshot.thread.id}:${attachWithChat.subscriptionId}:backpressure`,
        status: "subscriptionInterrupted",
        reason: "backpressure",
        subscriptionId: attachWithChat.subscriptionId,
      },
    ]);
  });

  it("clears interrupted status and applied event ids on the next attach", () => {
    const store = makeStore();
    const attachWithChat = attachWithTurns([
      baseTurn("turn-before-reconnect", [agentMessage("agent-before", "Before reconnect")]),
    ]);
    const replacementAttach = attachWithTurns([
      baseTurn("turn-after-reconnect", [agentMessage("agent-after", "After reconnect")]),
    ]);

    store.dispatch(threadRuntimeAttached(attachWithChat));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-before",
          "turn-before-reconnect",
          agentMessage("agent-live-before", "Live before"),
        ),
      ),
    );
    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: attachWithChat.snapshot.thread.id,
        subscriptionId: attachWithChat.subscriptionId,
      }),
    );
    store.dispatch(threadRuntimeAttached(replacementAttach));
    store.dispatch(
      threadRuntimeEventBuffered(
        itemCompleted(
          "commit-before",
          "turn-after-reconnect",
          agentMessage("agent-live-after", "Live after reconnect"),
        ),
      ),
    );

    expect(selectTranscriptTurnIds(store.getState())).toStrictEqual(["turn-after-reconnect"]);
    expect(selectTranscriptChunk(store.getState(), "turn-after-reconnect:chunk:0")?.entries).toHaveLength(
      2,
    );
    expect(selectTranscriptGlobalStatus(store.getState())).toStrictEqual([]);
  });
```

- [ ] **Step 4: Run the focused test and confirm red**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected result: FAIL because live event and manual reconnect reducers are not implemented yet.

---

### Task 4: Implement Live Event Apply, Dedupe, And Global Status

**Files:**
- Modify: `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`

- [ ] **Step 1: Import the remaining runtime actions**

Update the runtime action import:

```ts
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
```

- [ ] **Step 2: Add applied event window helpers**

Add these helpers near the existing state helpers:

```ts
const hasAppliedEvent = (state: TranscriptState, commitId: string): boolean =>
  state.appliedEventIdsById[commitId] === true;

const recordAppliedEvent = (state: TranscriptState, commitId: string) => {
  state.appliedEventIdsById[commitId] = true;
  state.appliedEventOrder.push(commitId);

  if (state.appliedEventOrder.length <= MAX_APPLIED_EVENT_ID_WINDOW_LENGTH) {
    return;
  }

  const removedCommitId = state.appliedEventOrder.shift();
  if (removedCommitId != null) {
    Reflect.deleteProperty(state.appliedEventIdsById, removedCommitId);
  }
};
```

- [ ] **Step 3: Add live event reducers**

Replace the existing `extraReducers` block with this full block:

```ts
  extraReducers: (builder) => {
    builder
      .addCase(threadRuntimeAttached, (state, action) => {
        rebuildFromSnapshot(
          state,
          action.payload.snapshot.thread.id,
          action.payload.subscriptionId,
          action.payload.snapshot.thread.turns,
        );
      })
      .addCase(threadRuntimeEventBuffered, (state, action) => {
        if (state.threadId !== action.payload.threadId) {
          return;
        }

        if (hasAppliedEvent(state, action.payload.commitId)) {
          return;
        }

        recordAppliedEvent(state, action.payload.commitId);

        switch (action.payload.event.type) {
          case "turnStarted":
          case "turnCompleted":
            upsertTurnFromPayload(state, action.payload.event.notification.turn);
            return;
          case "itemCompleted": {
            const { item, turnId } = action.payload.event.notification;
            ensureTurnExists(state, turnId);
            const entry = materializeItem(item, turnId);
            if (entry != null) {
              upsertLiveCommittedEntry(state, entry);
            }
            return;
          }
          case "itemStarted":
            return;
        }
      })
      .addCase(threadRuntimeManualReconnectRequired, (state, action) => {
        if (state.threadId !== action.payload.threadId) {
          return;
        }

        state.globalStatus = [
          {
            id: `subscriptionInterrupted:${action.payload.threadId}:${action.payload.subscriptionId ?? "none"}:${action.payload.reason}`,
            status: "subscriptionInterrupted",
            reason: action.payload.reason,
            subscriptionId: action.payload.subscriptionId,
          },
        ];
      });
  },
```

- [ ] **Step 4: Run the focused test and confirm green**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Commit live apply support**

Run:

```bash
git add codex-gui/src/features/transcriptState/transcriptStateSlice.ts codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
git commit -m "feat(gui): apply committed transcript events"
```

---

### Task 5: Delete The Obsolete Incremental Chat Owner

**Files:**
- Delete: `codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts`
- Delete: `codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts`
- Modify: `codex-gui/src/app/store.ts`

- [ ] **Step 1: Delete the old owner and old tests**

Delete:

```text
codex-gui/src/features/incrementalChatState/incrementalChatStateSlice.ts
codex-gui/src/features/incrementalChatState/__tests__/incrementalChatStateSlice.test.ts
```

If `codex-gui/src/features/incrementalChatState/` and its `__tests__/` child are empty after deletion, remove the empty directories.

- [ ] **Step 2: Verify no old symbol references remain**

Run:

```bash
rg -n "incrementalChatState|selectIncrementalChatTurns|IncrementalChatTurnView|turnViews|messagesByTurnId|messageViewIndexById" codex-gui/src
```

Expected result: no output.

- [ ] **Step 3: Verify `chatTextModel` was not modified for compatibility**

Run:

```bash
git diff -- codex-gui/src/features/chatTextModel
```

Expected result: no output.

- [ ] **Step 4: Run the focused transcript test**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 5: Run a focused type check**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

Do not run `pnpm --dir codex-gui run test` or `pnpm --dir codex-gui run ci`; those are broader than this plan's focused verification boundary.

- [ ] **Step 6: Commit the old owner removal**

Run:

```bash
git add codex-gui/src/app/store.ts codex-gui/src/features/transcriptState codex-gui/src/features/incrementalChatState
git commit -m "refactor(gui): remove incremental chat state owner"
```

---

### Task 6: Focused Final Verification And Scope Guard

**Files:**
- Inspect only.

- [ ] **Step 1: Run focused unit coverage for the new owner**

Run:

```bash
pnpm --dir codex-gui exec vitest run src/features/transcriptState/__tests__/transcriptStateSlice.test.ts
```

Expected result: PASS.

- [ ] **Step 2: Run focused type checking**

Run:

```bash
pnpm --dir codex-gui run type-check
```

Expected result: PASS.

- [ ] **Step 3: Verify obsolete owner symbols are gone**

Run:

```bash
rg -n "incrementalChatState|selectIncrementalChatTurns|IncrementalChatTurnView|turnViews|messagesByTurnId|messageViewIndexById" codex-gui/src
```

Expected result: no output.

- [ ] **Step 4: Verify active tail was not added**

Run:

```bash
rg -n "selectActiveTailForTurn|activeTail|ActiveTail" codex-gui/src/features/transcriptState codex-gui/src/app/store.ts
```

Expected result: no output.

- [ ] **Step 5: Verify `chatTextModel` remained outside this change**

Run:

```bash
git diff --stat -- codex-gui/src/features/chatTextModel codex-gui/src/features/liveEventHandling codex-gui/src/features/snapshotReplay codex-gui/src/features/threadRuntime
```

Expected result: no output.

- [ ] **Step 6: Inspect changed files**

Run:

```bash
git diff --stat
git diff -- codex-gui/src/features/transcriptState codex-gui/src/app/store.ts
```

Expected result: diff is limited to the new `transcriptState` owner, its tests, `store.ts`, and deletion of old `incrementalChatState` files.

If any verification exposes a need to add active tail, change `chatTextModel`, or alter the design scope, stop and report the mismatch instead of modifying the design or expanding implementation.
