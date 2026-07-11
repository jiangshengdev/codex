import { createAppSlice } from "@/app/createAppSlice";
import {
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { ThreadItem, Turn } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
import { hasAppliedTranscriptEvent, recordAppliedTranscriptEvent } from "./transcriptEventDedup";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  createEmptyTranscriptState,
  initialTranscriptState,
  resetTranscriptState,
  type TranscriptChunk,
  type TranscriptChunkView,
  type TranscriptEntry,
  type TranscriptGlobalStatus,
  type TranscriptRenderableLiveItem,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

export {
  MAX_APPLIED_EVENT_ID_WINDOW_LENGTH,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
} from "./transcriptStateModel";
export type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptEntry,
  TranscriptGlobalStatus,
  TranscriptLiveItemIndex,
  TranscriptLiveItemStatus,
  TranscriptMessagePhase,
  TranscriptRenderableLiveItem,
  TranscriptState,
  TranscriptTurn,
} from "./transcriptStateModel";

type TranscriptChunkViewCacheEntry = {
  revision: number;
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();

const chunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:chunk:${String(index)}`;

const EMPTY_LIVE_ITEMS: readonly TranscriptRenderableLiveItem[] = Object.freeze([]);

const liveItemKey = (turnId: string, itemId: string): string => `${turnId}:${itemId}`;

const bumpLiveScrollPulse = (state: TranscriptState) => {
  state.liveScrollPulse += 1;
};

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

const ensureLiveItemsForTurn = (
  state: TranscriptState,
  turnId: string,
): TranscriptRenderableLiveItem[] => {
  const existingItems = state.liveItemsByTurnId[turnId];
  if (existingItems != null) {
    return existingItems;
  }

  const items: TranscriptRenderableLiveItem[] = [];
  state.liveItemsByTurnId[turnId] = items;
  return items;
};

const hasLiveItem = (state: TranscriptState, turnId: string, itemId: string): boolean =>
  state.liveItemIndexByKey[liveItemKey(turnId, itemId)] != null;

const appendStartedLiveItem = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const key = liveItemKey(turnId, item.id);
  if (state.liveItemIndexByKey[key] != null) {
    return;
  }

  const items = ensureLiveItemsForTurn(state, turnId);
  state.liveItemIndexByKey[key] = { turnId, index: items.length };
  items.push({
    key,
    turnId,
    itemId: item.id,
    initialItem: item,
    status: "started",
    transientText: "",
    revision: 0,
  });
  if (item.type === "agentMessage") {
    bumpLiveScrollPulse(state);
  }
};

const liveItemForKey = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null => {
  const key = liveItemKey(turnId, itemId);
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex?.turnId !== turnId) {
    return null;
  }

  const item = state.liveItemsByTurnId[turnId]?.[itemIndex.index] ?? null;
  return item?.key === key ? item : null;
};

type AgentMessageDeltaBucket = {
  turnId: string;
  itemId: string;
  delta: string;
};

const appendDeltaToLiveItem = (
  state: TranscriptState,
  item: TranscriptRenderableLiveItem,
  delta: string,
) => {
  item.transientText += delta;
  item.status = "streaming";
  item.revision += 1;
  bumpLiveScrollPulse(state);
};

const appendAgentMessageDeltaToLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  delta: string,
) => {
  const item = liveItemForKey(state, turnId, itemId);
  if (item == null) {
    return;
  }

  appendDeltaToLiveItem(state, item, delta);
};

const applyAcceptedProjectionDelta = (
  state: TranscriptState,
  notification: Parameters<typeof threadRuntimeDeltaAccepted>[0]["notification"],
) => {
  if (state.threadId !== notification.threadId) {
    return;
  }

  switch (notification.delta.type) {
    case "agentMessage": {
      const { turnId, itemId, delta } = notification.delta.notification;
      appendAgentMessageDeltaToLiveItem(state, turnId, itemId, delta);
      return;
    }
  }
};

const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: Parameters<typeof threadRuntimeDeltasAccepted>[0]["notifications"],
) => {
  const buckets: AgentMessageDeltaBucket[] = [];
  const bucketByKey: Record<string, AgentMessageDeltaBucket> = {};

  for (const notification of notifications) {
    if (state.threadId !== notification.threadId) {
      continue;
    }

    switch (notification.delta.type) {
      case "agentMessage": {
        const { turnId, itemId, delta } = notification.delta.notification;
        const key = liveItemKey(turnId, itemId);
        let bucket = bucketByKey[key];
        if (bucket == null) {
          bucket = { turnId, itemId, delta: "" };
          bucketByKey[key] = bucket;
          buckets.push(bucket);
        }
        bucket.delta += delta;
        break;
      }
    }
  }

  for (const { turnId, itemId, delta } of buckets) {
    const item = liveItemForKey(state, turnId, itemId);
    if (item != null) {
      appendDeltaToLiveItem(state, item, delta);
    }
  }
};

const removeLiveItemIfPresent = (state: TranscriptState, turnId: string, itemId: string) => {
  const key = liveItemKey(turnId, itemId);
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex?.turnId !== turnId) {
    return;
  }

  const items = state.liveItemsByTurnId[turnId];
  if (items == null || itemIndex.index >= items.length) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return;
  }

  const removedItem = items[itemIndex.index];
  if (removedItem?.key !== key) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return;
  }

  items.splice(itemIndex.index, 1);
  Reflect.deleteProperty(state.liveItemIndexByKey, key);
  if (removedItem.initialItem.type === "agentMessage") {
    bumpLiveScrollPulse(state);
  }

  for (let index = itemIndex.index; index < items.length; index += 1) {
    const shiftedItem = items[index];
    if (shiftedItem != null) {
      state.liveItemIndexByKey[shiftedItem.key] = { turnId, index };
    }
  }

  if (items.length === 0) {
    Reflect.deleteProperty(state.liveItemsByTurnId, turnId);
  }
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
  const nextState = createEmptyTranscriptState();
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

  resetTranscriptState(state, nextState);
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

export const transcriptStateSlice = createAppSlice({
  name: "transcriptState",
  initialState: initialTranscriptState,
  reducers: () => ({}),
  selectors: {
    selectCommittedTranscriptScrollCommitKey: (transcriptState): string | null =>
      transcriptState.committedScrollCommitKey,
    selectTranscriptLiveScrollPulse: (transcriptState): number => transcriptState.liveScrollPulse,
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
    ): TranscriptRenderableLiveItem | null => liveItemForKey(transcriptState, turnId, itemId),
    selectTranscriptLiveItemsForTurn: (
      transcriptState,
      turnId: string,
    ): readonly TranscriptRenderableLiveItem[] =>
      transcriptState.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS,
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

        if (hasAppliedTranscriptEvent(state, notification.commitId)) {
          return;
        }

        if (notification.event.type === "itemStarted") {
          const { item, turnId } = notification.event.notification;
          if (hasLiveItem(state, turnId, item.id)) {
            return;
          }
        }

        recordAppliedTranscriptEvent(state, notification.commitId);

        switch (notification.event.type) {
          case "turnStarted":
          case "turnCompleted":
            upsertTurnFromPayload(state, notification.event.notification.turn);
            return;
          case "itemCompleted": {
            const { item, turnId } = notification.event.notification;
            ensureTurnExists(state, turnId);
            removeLiveItemIfPresent(state, turnId, item.id);
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
            appendStartedLiveItem(state, turnId, item);
            return;
          }
        }
      })
      .addCase(threadRuntimeDeltaAccepted, (state, action) => {
        applyAcceptedProjectionDelta(state, action.payload.notification);
      })
      .addCase(threadRuntimeDeltasAccepted, (state, action) => {
        applyAcceptedProjectionDeltaBatch(state, action.payload.notifications);
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
  selectTranscriptLiveScrollPulse,
  selectTranscriptTurnIds,
  selectTranscriptTurn,
  selectTranscriptChunk,
  selectTranscriptEntry,
  selectTranscriptLiveItem,
  selectTranscriptLiveItemsForTurn,
  selectTranscriptGlobalStatus,
} = transcriptStateSlice.selectors;

export default transcriptStateSlice;
