import { createAppSlice } from "@/app/createAppSlice";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn, TurnStatus } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";

export const TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT = 100;
export const MAX_APPLIED_EVENT_ID_WINDOW_LENGTH = 500;

export type TranscriptTurn = {
  id: string;
  status: TurnStatus;
  leadingPromptEntryId: string | null;
  middleChunkIds: string[];
  middleEntryCount: number;
  finalAssistantEntryIds: string[];
};

export type TranscriptChunk = {
  id: string;
  turnId: string;
  entryIds: string[];
  revision: number;
};

export type TranscriptLiveSlotStatus = "started" | "streaming" | "completed";

export type TranscriptLiveSlot = {
  key: string;
  turnId: string;
  itemId: string;
  initialItem: ThreadItem;
  status: TranscriptLiveSlotStatus;
  transientText: string;
  completedItem: ThreadItem | null;
  revision: number;
};

export type TranscriptLiveTurn = {
  id: string;
  slotOrder: string[];
  revision: number;
};

export type TranscriptMessagePhase = Extract<ThreadItem, { type: "agentMessage" }>["phase"];

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

export type TranscriptRenderableLiveItem = {
  key: string;
  turnId: string;
  itemId: string;
  status: TranscriptLiveSlotStatus;
  initialItem: ThreadItem;
  transientText: string;
  completedItem: ThreadItem | null;
  revision: number;
};

export type TranscriptState = {
  threadId: string | null;
  subscriptionId: string | null;
  committedScrollCommitKey: string | null;
  turnIds: string[];
  turnsById: Record<string, TranscriptTurn>;
  chunksById: Record<string, TranscriptChunk>;
  entriesById: Record<string, TranscriptEntry>;
  entryChunkById: Record<string, string>;
  liveTurnsById: Record<string, TranscriptLiveTurn>;
  liveSlotsByKey: Record<string, TranscriptLiveSlot>;
  globalStatus: TranscriptGlobalStatus[];
  appliedEventIdsById: Record<string, true>;
  appliedEventOrder: string[];
};

type TranscriptChunkViewCacheEntry = {
  revision: number;
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();

type TranscriptLiveTurnViewCacheEntry = {
  revision: number;
  slotKeys: string[];
  slotRevisions: number[];
  view: TranscriptRenderableLiveItem[];
};

const transcriptLiveTurnViewCache = new WeakMap<
  TranscriptLiveTurn,
  TranscriptLiveTurnViewCacheEntry
>();

const initialState: TranscriptState = {
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  turnIds: [],
  turnsById: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  liveTurnsById: {},
  liveSlotsByKey: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
};

const createEmptyState = (): TranscriptState => ({
  threadId: null,
  subscriptionId: null,
  committedScrollCommitKey: null,
  turnIds: [],
  turnsById: {},
  chunksById: {},
  entriesById: {},
  entryChunkById: {},
  liveTurnsById: {},
  liveSlotsByKey: {},
  globalStatus: [],
  appliedEventIdsById: {},
  appliedEventOrder: [],
});

const resetState = (state: TranscriptState, nextState: TranscriptState) => {
  state.threadId = nextState.threadId;
  state.subscriptionId = nextState.subscriptionId;
  state.committedScrollCommitKey = nextState.committedScrollCommitKey;
  state.turnIds = nextState.turnIds;
  state.turnsById = nextState.turnsById;
  state.chunksById = nextState.chunksById;
  state.entriesById = nextState.entriesById;
  state.entryChunkById = nextState.entryChunkById;
  state.liveTurnsById = nextState.liveTurnsById;
  state.liveSlotsByKey = nextState.liveSlotsByKey;
  state.globalStatus = nextState.globalStatus;
  state.appliedEventIdsById = nextState.appliedEventIdsById;
  state.appliedEventOrder = nextState.appliedEventOrder;
};

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

const chunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:chunk:${String(index)}`;

const liveSlotKey = (turnId: string, itemId: string): string => `${turnId}:${itemId}`;

const ensureTurnExists = (state: TranscriptState, turnId: string): TranscriptTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const turn: TranscriptTurn = {
    id: turnId,
    status: "inProgress",
    leadingPromptEntryId: null,
    middleChunkIds: [],
    middleEntryCount: 0,
    finalAssistantEntryIds: [],
  };
  state.turnsById[turnId] = turn;
  state.turnIds.push(turnId);
  return turn;
};

const ensureLiveTurnExists = (state: TranscriptState, turnId: string): TranscriptLiveTurn => {
  const existingTurn = state.liveTurnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const liveTurn: TranscriptLiveTurn = {
    id: turnId,
    slotOrder: [],
    revision: 0,
  };
  state.liveTurnsById[turnId] = liveTurn;
  return liveTurn;
};

const upsertStartedLiveSlot = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const key = liveSlotKey(turnId, item.id);
  if (state.liveSlotsByKey[key] != null) {
    return;
  }

  const liveTurn = ensureLiveTurnExists(state, turnId);
  liveTurn.slotOrder.push(item.id);
  liveTurn.revision += 1;
  state.liveSlotsByKey[key] = {
    key,
    turnId,
    itemId: item.id,
    initialItem: item,
    status: "started",
    transientText: "",
    completedItem: null,
    revision: 0,
  };
};

const upsertTurnFromPayload = (state: TranscriptState, turn: Turn) => {
  const existingTurn = state.turnsById[turn.id];
  if (existingTurn == null) {
    state.turnsById[turn.id] = {
      id: turn.id,
      status: turn.status,
      leadingPromptEntryId: null,
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    };
    state.turnIds.push(turn.id);
    return;
  }

  existingTurn.status = turn.status;
};

const getOrCreateMiddleChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  const turn = ensureTurnExists(state, turnId);
  const chunkIds = turn.middleChunkIds;
  const lastChunkId = chunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];

  if (lastChunk != null && lastChunk.entryIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = chunkIdForIndex(turnId, chunkIds.length);
  const chunk: TranscriptChunk = { id: chunkId, turnId, entryIds: [], revision: 0 };
  state.chunksById[chunkId] = chunk;
  turn.middleChunkIds.push(chunkId);
  return chunk;
};

const isAssistantMessageEntry = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> & { role: "assistant" } =>
  entry.type === "message" && entry.role === "assistant";

const isFinalAssistantEntry = (entry: TranscriptEntry): boolean =>
  isAssistantMessageEntry(entry) && entry.phase === "final_answer";

const turnHasVisibleEntries = (turn: TranscriptTurn): boolean =>
  turn.leadingPromptEntryId != null ||
  turn.middleChunkIds.length > 0 ||
  turn.finalAssistantEntryIds.length > 0;

const appendEntryToMiddleChunk = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  const turn = ensureTurnExists(state, entry.turnId);
  const chunk = getOrCreateMiddleChunk(state, entry.turnId);
  chunk.entryIds.push(entry.id);
  turn.middleEntryCount += 1;
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
  const turn = ensureTurnExists(state, entry.turnId);
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

const rebuildFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: Turn[],
) => {
  const nextState = createEmptyState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;
  nextState.committedScrollCommitKey = `attach:${threadId}:${subscriptionId}:${headCommitId ?? "none"}`;

  for (const turn of turns) {
    upsertTurnFromPayload(nextState, turn);
    for (const item of turn.items) {
      const entry = materializeTranscriptItem(item, turn.id);
      if (entry != null) {
        appendBaselineEntry(nextState, entry);
      }
    }
  }

  resetState(state, nextState);
};

const selectCachedTranscriptChunkView = (
  transcriptState: TranscriptState,
  chunk: TranscriptChunk,
): TranscriptChunkView => {
  const cachedEntry = transcriptChunkViewCache.get(chunk);
  if (cachedEntry?.revision === chunk.revision) {
    return cachedEntry.view;
  }

  const view: TranscriptChunkView = {
    id: chunk.id,
    turnId: chunk.turnId,
    revision: chunk.revision,
    entries: chunk.entryIds.flatMap((entryId) => {
      const entry = transcriptState.entriesById[entryId];
      return entry == null ? [] : [entry];
    }),
  };

  transcriptChunkViewCache.set(chunk, { revision: chunk.revision, view });
  return view;
};

const selectCachedLiveItemsForTurn = (
  transcriptState: TranscriptState,
  liveTurn: TranscriptLiveTurn,
): TranscriptRenderableLiveItem[] => {
  const slots = liveTurn.slotOrder.flatMap((itemId) => {
    const key = liveSlotKey(liveTurn.id, itemId);
    const slot = transcriptState.liveSlotsByKey[key];
    return slot == null ? [] : [{ key, slot }];
  });
  const slotKeys = slots.map(({ key }) => key);
  const slotRevisions = slots.map(({ slot }) => slot.revision);

  const cachedEntry = transcriptLiveTurnViewCache.get(liveTurn);
  if (
    cachedEntry?.revision === liveTurn.revision &&
    cachedEntry.slotKeys.length === slotKeys.length &&
    cachedEntry.slotKeys.every((slotKey, index) => slotKey === slotKeys[index]) &&
    cachedEntry.slotRevisions.length === slotRevisions.length &&
    cachedEntry.slotRevisions.every((slotRevision, index) => slotRevision === slotRevisions[index])
  ) {
    return cachedEntry.view;
  }

  const view = slots.map(({ slot }) => ({
    key: slot.key,
    turnId: slot.turnId,
    itemId: slot.itemId,
    status: slot.status,
    initialItem: slot.initialItem,
    transientText: slot.transientText,
    completedItem: slot.completedItem,
    revision: slot.revision,
  }));

  transcriptLiveTurnViewCache.set(liveTurn, {
    revision: liveTurn.revision,
    slotKeys,
    slotRevisions,
    view,
  });
  return view;
};

export const transcriptStateSlice = createAppSlice({
  name: "transcriptState",
  initialState,
  reducers: () => ({}),
  selectors: {
    selectCommittedTranscriptScrollCommitKey: (transcriptState): string | null =>
      transcriptState.committedScrollCommitKey,
    selectTranscriptTurnIds: (transcriptState): string[] => transcriptState.turnIds,
    selectTranscriptTurn: (transcriptState, turnId: string): TranscriptTurn | null =>
      transcriptState.turnsById[turnId] ?? null,
    selectTranscriptChunk: (transcriptState, chunkId: string): TranscriptChunkView | null => {
      const chunk = transcriptState.chunksById[chunkId];
      if (chunk == null) {
        return null;
      }

      return selectCachedTranscriptChunkView(transcriptState, chunk);
    },
    selectTranscriptEntry: (transcriptState, entryId: string): TranscriptEntry | null =>
      transcriptState.entriesById[entryId] ?? null,
    selectTranscriptLiveItem: (
      transcriptState,
      turnId: string,
      itemId: string,
    ): TranscriptRenderableLiveItem | null => {
      const slot = transcriptState.liveSlotsByKey[liveSlotKey(turnId, itemId)];
      if (slot == null) {
        return null;
      }

      return {
        key: slot.key,
        turnId: slot.turnId,
        itemId: slot.itemId,
        status: slot.status,
        initialItem: slot.initialItem,
        transientText: slot.transientText,
        completedItem: slot.completedItem,
        revision: slot.revision,
      };
    },
    selectTranscriptLiveItemsForTurn: (
      transcriptState,
      turnId: string,
    ): TranscriptRenderableLiveItem[] => {
      const liveTurn = transcriptState.liveTurnsById[turnId];
      if (liveTurn == null) {
        return [];
      }

      return selectCachedLiveItemsForTurn(transcriptState, liveTurn);
    },
    selectTranscriptGlobalStatus: (transcriptState): TranscriptGlobalStatus[] =>
      transcriptState.globalStatus,
  },
  extraReducers: (builder) => {
    builder
      .addCase(threadRuntimeAttached, (state, action) => {
        rebuildFromSnapshot(
          state,
          action.payload.snapshot.thread.id,
          action.payload.subscriptionId,
          action.payload.snapshot.headCommitId,
          action.payload.snapshot.thread.turns,
        );
      })
      .addCase(threadRuntimeEventBuffered, (state, action) => {
        const { notification, replay } = action.payload;
        if (replay === "snapshotDuplicate") {
          return;
        }

        if (state.threadId !== notification.threadId) {
          return;
        }

        if (hasAppliedEvent(state, notification.commitId)) {
          return;
        }

        recordAppliedEvent(state, notification.commitId);

        switch (notification.event.type) {
          case "turnStarted":
          case "turnCompleted":
            upsertTurnFromPayload(state, notification.event.notification.turn);
            return;
          case "itemCompleted": {
            const { item, turnId } = notification.event.notification;
            ensureTurnExists(state, turnId);
            const entry = materializeTranscriptItem(item, turnId);
            if (entry != null) {
              upsertLiveCommittedEntry(state, entry);
              state.committedScrollCommitKey = `event:${notification.commitId}`;
            }
            return;
          }
          case "itemStarted": {
            const { item, turnId } = notification.event.notification;
            ensureTurnExists(state, turnId);
            upsertStartedLiveSlot(state, turnId, item);
            return;
          }
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
});

export const {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
