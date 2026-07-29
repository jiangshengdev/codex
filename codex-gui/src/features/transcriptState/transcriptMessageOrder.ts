import type { ThreadItem } from "@codex-protocol/v2";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  type TranscriptMessageOrderChunk,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

type TranscriptMessageItem = Extract<ThreadItem, { type: "userMessage" | "agentMessage" }>;

const messageOrderChunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:message-order:chunk:${String(index)}`;

const messageOrderMembershipKey = (turnId: string, itemId: string): string =>
  JSON.stringify([turnId, itemId]);

const isTranscriptMessageItem = (item: ThreadItem): item is TranscriptMessageItem =>
  item.type === "userMessage" || item.type === "agentMessage";

export const recordOriginalFirstTranscriptItem = (
  turn: TranscriptTurn,
  item: ThreadItem | undefined,
): void => {
  if (turn.originalFirstItemId == null && item != null) {
    turn.originalFirstItemId = item.id;
  }
};

const getOrCreateMessageOrderChunk = (
  state: TranscriptState,
  turn: TranscriptTurn,
): TranscriptMessageOrderChunk => {
  const lastChunkId = turn.messageOrderChunkIds.at(-1);
  const lastChunk =
    lastChunkId == null ? null : (state.messageOrderChunksById[lastChunkId] ?? null);
  if (lastChunk != null && lastChunk.itemIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = messageOrderChunkIdForIndex(turn.id, turn.messageOrderChunkIds.length);
  const chunk: TranscriptMessageOrderChunk = {
    id: chunkId,
    turnId: turn.id,
    itemIds: [],
    revision: 0,
  };
  state.messageOrderChunksById[chunkId] = chunk;
  turn.messageOrderChunkIds.push(chunkId);
  return chunk;
};

export const appendTranscriptMessageOrderItem = (
  state: TranscriptState,
  turn: TranscriptTurn,
  item: ThreadItem,
  options: { bumpChunkRevision: boolean },
): boolean => {
  if (!isTranscriptMessageItem(item)) {
    return false;
  }

  const membershipKey = messageOrderMembershipKey(turn.id, item.id);
  const existingMembership = state.messageOrderMembershipByKey[membershipKey];
  if (existingMembership?.turnId === turn.id && existingMembership.itemId === item.id) {
    return false;
  }

  const chunk = getOrCreateMessageOrderChunk(state, turn);
  const index = chunk.itemIds.length;
  chunk.itemIds.push(item.id);
  if (options.bumpChunkRevision) {
    chunk.revision += 1;
  }
  state.messageOrderMembershipByKey[membershipKey] = {
    turnId: turn.id,
    itemId: item.id,
    chunkId: chunk.id,
    index,
  };
  return true;
};
