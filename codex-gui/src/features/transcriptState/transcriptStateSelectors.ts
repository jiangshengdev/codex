import { findLiveItemByKey } from "./transcriptLiveProjection";
import type {
  TranscriptMessageChunk,
  TranscriptMessageKey,
  TranscriptMessagePresentation,
  TranscriptState,
} from "./transcriptStateModel";

export const transcriptMessageChunk = (
  state: TranscriptState,
  chunkId: string,
): TranscriptMessageChunk | null => state.chunksById[chunkId] ?? null;

export const transcriptMessagePresentation = (
  state: TranscriptState,
  key: TranscriptMessageKey,
): TranscriptMessagePresentation | null => {
  if (Object.prototype.hasOwnProperty.call(state.entriesByKey, key)) {
    return state.entriesByKey[key];
  }
  return findLiveItemByKey(state, key);
};

export const transcriptMiddleMessagePresentation = (
  state: TranscriptState,
  key: TranscriptMessageKey,
): TranscriptMessagePresentation | null =>
  state.messagePlacementByKey[key] === "middle"
    ? transcriptMessagePresentation(state, key)
    : null;
