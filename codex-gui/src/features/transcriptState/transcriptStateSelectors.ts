import { findLiveItem, liveItemsForTurn } from "./transcriptLiveProjection";
import type {
  TranscriptChunk,
  TranscriptChunkView,
  TranscriptEntry,
  TranscriptPresentationSlot,
  TranscriptRenderableLiveItem,
  TranscriptState,
} from "./transcriptStateModel";

type TranscriptChunkViewCacheEntry = {
  generation: number;
  revision: number;
  slotIds: readonly string[];
  slotRevisions: readonly number[];
  slotReferences: readonly TranscriptPresentationSlot[];
  view: TranscriptChunkView;
};

const transcriptChunkViewCache = new WeakMap<TranscriptChunk, TranscriptChunkViewCacheEntry>();
const transcriptEntryViewCache = new WeakMap<TranscriptPresentationSlot, TranscriptEntry>();

export const transcriptEntryView = (slot: TranscriptPresentationSlot): TranscriptEntry => {
  const cachedEntry = transcriptEntryViewCache.get(slot);
  if (cachedEntry != null) {
    return cachedEntry;
  }

  const entry: TranscriptEntry = {
    ...slot.content,
    id: slot.id,
    turnId: slot.turnId,
    revision: slot.revision,
  };
  transcriptEntryViewCache.set(slot, entry);
  return entry;
};

export const transcriptChunkView = (
  transcriptState: TranscriptState,
  chunkId: string,
): TranscriptChunkView | null => {
  const chunk = transcriptState.chunksById[chunkId];
  if (chunk == null) {
    return null;
  }

  const slots = chunk.slotIds.flatMap((slotId) => {
    const slot = transcriptState.slotsById[slotId];
    return slot == null ? [] : [slot];
  });
  const cachedEntry = transcriptChunkViewCache.get(chunk);
  if (
    cachedEntry?.generation === transcriptState.presentationGeneration &&
    cachedEntry.revision === chunk.revision &&
    cachedEntry.slotIds.length === chunk.slotIds.length &&
    cachedEntry.slotIds.every((slotId, index) => slotId === chunk.slotIds[index]) &&
    cachedEntry.slotRevisions.length === slots.length &&
    cachedEntry.slotRevisions.every((revision, index) => revision === slots[index]?.revision) &&
    cachedEntry.slotReferences.every((slot, index) => slot === slots[index])
  ) {
    return cachedEntry.view;
  }

  const view: TranscriptChunkView = {
    id: chunk.id,
    turnId: chunk.turnId,
    revision: chunk.revision,
    entries: slots.map(transcriptEntryView),
  };

  transcriptChunkViewCache.set(chunk, {
    generation: transcriptState.presentationGeneration,
    revision: chunk.revision,
    slotIds: [...chunk.slotIds],
    slotRevisions: slots.map((slot) => slot.revision),
    slotReferences: slots,
    view,
  });
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
