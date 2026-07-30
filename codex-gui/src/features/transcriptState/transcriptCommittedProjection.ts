import type { ThreadItem, Turn } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  createEmptyTranscriptState,
  resetTranscriptState,
  transcriptEntryIdFor,
  type TranscriptChunk,
  type TranscriptEntry,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

export const hasStartedItemInMiddle = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): boolean => {
  const existingChunkId = state.entryChunkById[transcriptEntryIdFor(turnId, itemId)];
  return existingChunkId != null && state.chunksById[existingChunkId]?.turnId === turnId;
};

export const appendStartedItemToMiddle = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
) => {
  if (item.type !== "agentMessage") {
    return;
  }

  if (hasStartedItemInMiddle(state, turnId, item.id)) {
    return;
  }

  const turn = ensureTranscriptTurn(state, turnId);
  const chunk = getOrCreateMiddleChunk(state, turnId);
  const entryId = transcriptEntryIdFor(turnId, item.id);
  chunk.entryIds.push(entryId);
  turn.middleEntryCount += 1;
  chunk.revision += 1;
  state.entryChunkById[entryId] = chunk.id;
  state.entriesById[entryId] = {
    type: "live",
    id: item.id,
    key: entryId,
    turnId,
    itemId: item.id,
    status: "started",
    initialItem: item,
    transientText: "",
    revision: 0,
  };
  state.liveScrollPulse += 1;
};

const chunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:chunk:${String(index)}`;

const createTranscriptTurn = (id: string, status: TranscriptTurn["status"]): TranscriptTurn => ({
  id,
  status,
  originalFirstItemId: null,
  leadingPromptEntryId: null,
  middleChunkIds: [],
  middleEntryCount: 0,
  finalAssistantEntryIds: [],
});

export const ensureTranscriptTurn = (state: TranscriptState, turnId: string): TranscriptTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const turn = createTranscriptTurn(turnId, "inProgress");
  state.turnsById[turnId] = turn;
  state.turnIds.push(turnId);
  return turn;
};

export const recordOriginalFirstTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): TranscriptTurn => {
  const turn = ensureTranscriptTurn(state, turnId);
  turn.originalFirstItemId ??= item.id;
  return turn;
};

export const upsertTranscriptTurn = (state: TranscriptState, turn: Turn): void => {
  const transcriptTurn = ensureTranscriptTurn(state, turn.id);
  transcriptTurn.status = turn.status;
  const originalFirstItem = turn.items[0];
  if (originalFirstItem != null) {
    recordOriginalFirstTranscriptItem(state, turn.id, originalFirstItem);
  }
};

const getOrCreateMiddleChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  const turn = ensureTranscriptTurn(state, turnId);
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

const isUserMessageEntry = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> & { role: "user" } =>
  entry.type === "message" && entry.role === "user";

const isFinalAssistantEntry = (entry: TranscriptEntry): boolean =>
  isAssistantMessageEntry(entry) && entry.phase === "final_answer";

const appendEntryToMiddleChunk = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  const turn = ensureTranscriptTurn(state, entry.turnId);
  const chunk = getOrCreateMiddleChunk(state, entry.turnId);
  const entryId = transcriptEntryIdFor(entry.turnId, entry.id);
  chunk.entryIds.push(entryId);
  turn.middleEntryCount += 1;
  if (options.bumpChunkRevision) {
    chunk.revision += 1;
  }
  state.entryChunkById[entryId] = chunk.id;
};

const removeEntryFromMiddleChunk = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): boolean => {
  const turn = state.turnsById[turnId];
  const entryId = transcriptEntryIdFor(turnId, itemId);
  const chunkId = state.entryChunkById[entryId];
  const chunk = chunkId == null ? null : state.chunksById[chunkId];
  if (turn == null || chunk?.turnId !== turnId) {
    return false;
  }

  const entryIndex = chunk.entryIds.indexOf(entryId);
  if (entryIndex === -1) {
    return false;
  }

  chunk.entryIds.splice(entryIndex, 1);
  chunk.revision += 1;
  turn.middleEntryCount -= 1;
  Reflect.deleteProperty(state.entryChunkById, entryId);

  if (turn.middleEntryCount === 0) {
    turn.middleChunkIds = turn.middleChunkIds.filter((middleChunkId) => {
      const middleChunk = state.chunksById[middleChunkId];
      if (middleChunk?.entryIds.length === 0) {
        Reflect.deleteProperty(state.chunksById, middleChunkId);
        return false;
      }
      return true;
    });
  }

  return true;
};

const classifyNewEntry = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  const turn = ensureTranscriptTurn(state, entry.turnId);
  const entryId = transcriptEntryIdFor(entry.turnId, entry.id);
  state.entriesById[entryId] = entry;

  if (isUserMessageEntry(entry) && entry.id === turn.originalFirstItemId) {
    turn.leadingPromptEntryId = entryId;
    return;
  }

  if (isFinalAssistantEntry(entry)) {
    turn.finalAssistantEntryIds.push(entryId);
    return;
  }

  appendEntryToMiddleChunk(state, entry, options);
};

const appendBaselineEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  classifyNewEntry(state, entry, { bumpChunkRevision: false });
};

const upsertLiveCommittedEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  const entryId = transcriptEntryIdFor(entry.turnId, entry.id);
  const existingEntry = state.entriesById[entryId];
  if (existingEntry == null) {
    classifyNewEntry(state, entry, { bumpChunkRevision: true });
    return;
  }

  state.entriesById[entryId] = {
    ...entry,
    revision: existingEntry.revision + 1,
  };
  const turn = ensureTranscriptTurn(state, entry.turnId);
  const chunkId = state.entryChunkById[entryId];
  if (chunkId == null) {
    return;
  }

  if (isUserMessageEntry(entry) && entry.id === turn.originalFirstItemId) {
    removeEntryFromMiddleChunk(state, entry.turnId, entry.id);
    turn.leadingPromptEntryId = entryId;
    return;
  }

  if (isFinalAssistantEntry(entry)) {
    removeEntryFromMiddleChunk(state, entry.turnId, entry.id);
    turn.finalAssistantEntryIds.push(entryId);
    return;
  }

  const chunk = state.chunksById[chunkId];
  if (chunk != null) {
    chunk.revision += 1;
  }
};

export const applyCompletedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): boolean => {
  recordOriginalFirstTranscriptItem(state, turnId, item);
  const entry = materializeTranscriptItem(item, turnId);
  if (entry == null) {
    const entryId = transcriptEntryIdFor(turnId, item.id);
    const existingEntry = state.entriesById[entryId];
    if (
      existingEntry?.type === "live" &&
      existingEntry.turnId === turnId &&
      removeEntryFromMiddleChunk(state, turnId, item.id)
    ) {
      Reflect.deleteProperty(state.entriesById, entryId);
    }
    return false;
  }

  upsertLiveCommittedEntry(state, entry);
  return true;
};

export const rebuildTranscriptFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: Turn[],
): void => {
  const nextState = createEmptyTranscriptState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;
  nextState.committedScrollCommitKey = `attach:${threadId}:${subscriptionId}:${headCommitId ?? "none"}`;

  for (const turn of turns) {
    upsertTranscriptTurn(nextState, turn);
    for (const item of turn.items) {
      const entry = materializeTranscriptItem(item, turn.id);
      if (entry != null) {
        appendBaselineEntry(nextState, entry);
      }
    }
  }

  resetTranscriptState(state, nextState);
};
