import type { ThreadItem, ThreadProjectionDeltaNotification, Turn } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
import {
  appendStartedLiveItem,
  applyAcceptedProjectionDeltaBatch,
  findLiveItemByKey,
  removeLiveItemIfPresent,
} from "./transcriptLiveProjection";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  createEmptyTranscriptState,
  resetTranscriptState,
  transcriptMessageKeyFor,
  type TranscriptEntry,
  type TranscriptMessageChunk,
  type TranscriptMessageKey,
  type TranscriptMessagePlacement,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const createTranscriptTurn = (id: string, status: TranscriptTurn["status"]): TranscriptTurn => ({
  id,
  status,
  originalFirstItemId: null,
  leadingPromptEntryKey: null,
  messageChunkIds: [],
  middleEntryCount: 0,
  liveFinalMessageKeys: [],
  committedFinalMessageKeys: [],
});

const ensureTranscriptTurn = (state: TranscriptState, turnId: string): TranscriptTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const turn = createTranscriptTurn(turnId, "inProgress");
  state.turnsById[turnId] = turn;
  state.turnIds.push(turnId);
  return turn;
};

const recordOriginalFirstTranscriptItem = (
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

const getOrCreateMessageChunk = (
  state: TranscriptState,
  turn: TranscriptTurn,
): TranscriptMessageChunk => {
  const lastChunkId = turn.messageChunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];
  if (lastChunk != null && lastChunk.messageKeys.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const id = `${turn.id}:chunk:${String(turn.messageChunkIds.length)}`;
  const chunk: TranscriptMessageChunk = { id, turnId: turn.id, messageKeys: [] };
  state.chunksById[id] = chunk;
  turn.messageChunkIds.push(id);
  return chunk;
};

const appendMessageIdentity = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): TranscriptMessageKey | null => {
  if (item.type !== "userMessage" && item.type !== "agentMessage") {
    return null;
  }

  const key = transcriptMessageKeyFor(turnId, item.id);
  if (state.messageChunkByKey[key] != null) {
    return key;
  }

  const chunk = getOrCreateMessageChunk(state, ensureTranscriptTurn(state, turnId));
  chunk.messageKeys.push(key);
  state.messageChunkByKey[key] = chunk.id;
  return key;
};

const sameEntry = (previous: TranscriptEntry | null | undefined, next: TranscriptEntry | null) =>
  previous === next ||
  (previous?.type === "message" &&
    next?.type === "message" &&
    previous.id === next.id &&
    previous.turnId === next.turnId &&
    previous.role === next.role &&
    previous.source === next.source &&
    previous.sourceKind === next.sourceKind &&
    previous.phase === next.phase);

const writeCommittedPayload = (
  state: TranscriptState,
  key: TranscriptMessageKey,
  turnId: string,
  item: ThreadItem,
): boolean => {
  const previous = state.entriesByKey[key];
  const next = materializeTranscriptItem(item, turnId);
  if (hasOwn(state.entriesByKey, key) && sameEntry(previous, next)) {
    return false;
  }
  state.entriesByKey[key] =
    next == null ? null : { ...next, revision: previous == null ? 0 : previous.revision + 1 };
  return true;
};

const removeKey = (keys: TranscriptMessageKey[], key: TranscriptMessageKey) => {
  const index = keys.indexOf(key);
  if (index >= 0) {
    keys.splice(index, 1);
  }
};

const resolvePlacement = (
  state: TranscriptState,
  turn: TranscriptTurn,
  key: TranscriptMessageKey,
): TranscriptMessagePlacement => {
  if (hasOwn(state.entriesByKey, key)) {
    const entry = state.entriesByKey[key];
    if (entry?.type !== "message") {
      return "hidden";
    }
    if (entry.role === "user" && entry.id === turn.originalFirstItemId) {
      return "leading";
    }
    return entry.role === "assistant" && entry.phase === "final_answer"
      ? "committedFinal"
      : "middle";
  }

  const liveItem = findLiveItemByKey(state, key);
  if (
    liveItem?.initialItem.type !== "agentMessage" ||
    liveItem.transientText.length === 0
  ) {
    return "hidden";
  }
  return liveItem.initialItem.phase === "final_answer" ? "liveFinal" : "middle";
};

const updateContribution = (
  turn: TranscriptTurn,
  key: TranscriptMessageKey,
  placement: TranscriptMessagePlacement,
  delta: -1 | 1,
) => {
  switch (placement) {
    case "hidden":
      return;
    case "leading":
      turn.leadingPromptEntryKey = delta === 1 ? key : null;
      return;
    case "middle":
      turn.middleEntryCount += delta;
      return;
    case "liveFinal":
      if (delta === 1) turn.liveFinalMessageKeys.push(key);
      else removeKey(turn.liveFinalMessageKeys, key);
      return;
    case "committedFinal":
      if (delta === 1) turn.committedFinalMessageKeys.push(key);
      else removeKey(turn.committedFinalMessageKeys, key);
      return;
  }
};

const reconcilePlacement = (state: TranscriptState, key: TranscriptMessageKey) => {
  const chunkId = state.messageChunkByKey[key];
  const turnId = chunkId == null ? null : state.chunksById[chunkId]?.turnId;
  const turn = turnId == null ? null : state.turnsById[turnId];
  if (turn == null) {
    return;
  }

  const previous = state.messagePlacementByKey[key] ?? "hidden";
  const next = resolvePlacement(state, turn, key);
  if (previous === next) {
    return;
  }
  updateContribution(turn, key, previous, -1);
  updateContribution(turn, key, next, 1);
  state.messagePlacementByKey[key] = next;
};

export const applyStartedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
) => {
  recordOriginalFirstTranscriptItem(state, turnId, item);
  const messageKey = appendMessageIdentity(state, turnId, item);
  const key = messageKey ?? transcriptMessageKeyFor(turnId, item.id);
  if (messageKey != null && hasOwn(state.entriesByKey, key)) {
    return;
  }
  if (appendStartedLiveItem(state, turnId, item) && messageKey != null) {
    reconcilePlacement(state, messageKey);
  }
};

export const applyCompletedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): boolean => {
  recordOriginalFirstTranscriptItem(state, turnId, item);
  const messageKey = appendMessageIdentity(state, turnId, item);
  const key = messageKey ?? transcriptMessageKeyFor(turnId, item.id);
  const changed = messageKey == null ? false : writeCommittedPayload(state, key, turnId, item);
  removeLiveItemIfPresent(state, key);
  if (messageKey != null) {
    reconcilePlacement(state, messageKey);
  }
  return changed && state.entriesByKey[key] != null;
};

export const applyTranscriptDeltaBatch = (
  state: TranscriptState,
  notifications: ThreadProjectionDeltaNotification[],
) => {
  for (const key of applyAcceptedProjectionDeltaBatch(state, notifications)) {
    reconcilePlacement(state, key);
  }
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
      const key = appendMessageIdentity(nextState, turn.id, item);
      if (key != null) {
        writeCommittedPayload(nextState, key, turn.id, item);
        reconcilePlacement(nextState, key);
      }
    }
  }
  resetTranscriptState(state, nextState);
};
