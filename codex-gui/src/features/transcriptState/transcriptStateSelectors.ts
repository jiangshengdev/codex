import { findLiveItem, liveItemsForTurn } from "./transcriptLiveProjection";
import type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptRenderableLiveItem,
  TranscriptState,
} from "./transcriptStateModel";

type TranscriptChunkViewCacheEntry = {
  revision: number;
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();

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

export const transcriptLiveItem = (
  transcriptState: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null => findLiveItem(transcriptState, turnId, itemId);

export const transcriptLiveItemsForTurn = (
  transcriptState: TranscriptState,
  turnId: string,
): readonly TranscriptRenderableLiveItem[] => liveItemsForTurn(transcriptState, turnId);
