import type { TranscriptChunkView } from "@/features/transcriptState/transcriptStateSlice";

export const areTranscriptChunkViewsEqual = (
  previous: TranscriptChunkView | null,
  next: TranscriptChunkView | null,
): boolean => {
  if (previous === next) {
    return true;
  }

  if (previous == null || next == null) {
    return false;
  }

  if (
    previous.id !== next.id ||
    previous.turnId !== next.turnId ||
    previous.revision !== next.revision ||
    previous.entries.length !== next.entries.length
  ) {
    return false;
  }

  return previous.entries.every((entry, index) => {
    const nextEntry = next.entries[index];
    return entry.id === nextEntry?.id && entry.revision === nextEntry.revision;
  });
};
