import type { ThreadItem } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
import { findLiveItem } from "./transcriptLiveProjection";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  type TranscriptChunk,
  type TranscriptEntry,
  type TranscriptRenderableLiveItem,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

const messageIdentityKey = (turnId: string, itemId: string): string =>
  `${turnId.length}:${turnId}${itemId}`;

const chunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:chunk:${String(index)}`;

const getOrCreateMessageChunk = (
  state: TranscriptState,
  turn: TranscriptTurn,
): TranscriptChunk => {
  const lastChunkId = turn.middleChunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];
  if (lastChunk != null && lastChunk.entryIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = chunkIdForIndex(turn.id, turn.middleChunkIds.length);
  const chunk: TranscriptChunk = { id: chunkId, turnId: turn.id, entryIds: [], revision: 0 };
  state.chunksById[chunkId] = chunk;
  turn.middleChunkIds.push(chunkId);
  return chunk;
};

const isMiddleMessageEntry = (turn: TranscriptTurn, entry: TranscriptEntry | null): boolean => {
  if (entry?.type !== "message") {
    return false;
  }
  if (entry.role === "user" && entry.id === turn.originalFirstItemId) {
    return false;
  }
  return entry.role !== "assistant" || entry.phase !== "final_answer";
};

const isLiveMiddleMessage = (
  turn: TranscriptTurn,
  item: TranscriptRenderableLiveItem,
): boolean => {
  const initialItem = item.initialItem;
  switch (initialItem.type) {
    case "userMessage":
      return (
        item.itemId !== turn.originalFirstItemId &&
        materializeTranscriptItem(initialItem, turn.id) != null
      );
    case "agentMessage":
      return (
        initialItem.phase !== "final_answer" &&
        (initialItem.text.length > 0 || item.transientText.length > 0)
      );
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
      return false;
  }

  initialItem satisfies never;
};

export const reconcileCompletedMessagePlacement = (
  state: TranscriptState,
  turn: TranscriptTurn,
  item: ThreadItem,
): void => {
  const existingEntry = state.entriesById[item.id];
  const existingLiveItem = findLiveItem(state, turn.id, item.id);
  const wasMiddle =
    existingEntry?.turnId === turn.id
      ? isMiddleMessageEntry(turn, existingEntry)
      : existingLiveItem != null && isLiveMiddleMessage(turn, existingLiveItem);
  const isMiddle = isMiddleMessageEntry(turn, materializeTranscriptItem(item, turn.id));

  if (wasMiddle === isMiddle) {
    return;
  }
  turn.middleEntryCount += isMiddle ? 1 : -1;
};

export const appendTranscriptMessageIdentity = (
  state: TranscriptState,
  turn: TranscriptTurn,
  item: ThreadItem,
  options: { bumpChunkRevision: boolean },
): boolean => {
  if (item.type !== "userMessage" && item.type !== "agentMessage") {
    return false;
  }

  const identityKey = messageIdentityKey(turn.id, item.id);
  if (state.entryChunkById[identityKey] != null) {
    return false;
  }

  const chunk = getOrCreateMessageChunk(state, turn);
  chunk.entryIds.push(item.id);
  state.entryChunkById[identityKey] = chunk.id;
  if (options.bumpChunkRevision) {
    chunk.revision += 1;
  }
  if (isMiddleMessageEntry(turn, materializeTranscriptItem(item, turn.id))) {
    turn.middleEntryCount += 1;
  }
  return true;
};
