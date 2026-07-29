import { findLiveItem, liveItemsForTurn } from "./transcriptLiveProjection";
import type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptMessageOrderChunk,
  TranscriptMessageOrderChunkView,
  TranscriptRenderableLiveItem,
  TranscriptState,
} from "./transcriptStateModel";

type TranscriptChunkViewCacheEntry = {
  revision: number;
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();

type TranscriptMessageOrderChunkViewCacheEntry = {
  revision: number;
  view: TranscriptMessageOrderChunkView;
};

const transcriptMessageOrderChunkViewCache = new WeakMap<
  TranscriptMessageOrderChunk,
  TranscriptMessageOrderChunkViewCacheEntry
>();

export const transcriptChunkView = (
  transcriptState: TranscriptState,
  chunkId: string,
): TranscriptChunkView | null => {
  const chunk = transcriptState.chunksById[chunkId];
  if (chunk == null) {
    return null;
  }

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

export const transcriptMessageOrderChunkView = (
  transcriptState: TranscriptState,
  chunkId: string,
): TranscriptMessageOrderChunkView | null => {
  const chunk = transcriptState.messageOrderChunksById[chunkId];
  if (chunk == null) {
    return null;
  }

  const cachedEntry = transcriptMessageOrderChunkViewCache.get(chunk);
  if (cachedEntry?.revision === chunk.revision) {
    return cachedEntry.view;
  }

  const view: TranscriptMessageOrderChunkView = {
    id: chunk.id,
    turnId: chunk.turnId,
    revision: chunk.revision,
    itemIds: chunk.itemIds,
  };
  transcriptMessageOrderChunkViewCache.set(chunk, { revision: chunk.revision, view });
  return view;
};

export const transcriptLiveItem = (
  transcriptState: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null => findLiveItem(transcriptState, turnId, itemId);

export const transcriptLiveItemsForTurn = (
  transcriptState: TranscriptState,
  turnId: string,
): readonly TranscriptRenderableLiveItem[] => liveItemsForTurn(transcriptState, turnId);
