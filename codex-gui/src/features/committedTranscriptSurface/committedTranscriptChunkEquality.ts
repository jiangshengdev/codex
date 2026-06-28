import type { TranscriptChunkView } from "@/features/transcriptState/transcriptStateSlice";

type TranscriptChunkEntry = TranscriptChunkView["entries"][number];

const areTranscriptChunkEntriesEqual = (
  previous: TranscriptChunkEntry,
  next: TranscriptChunkEntry | undefined,
): boolean => {
  if (
    next?.type !== previous.type ||
    next.id !== previous.id ||
    next.turnId !== previous.turnId ||
    previous.revision !== next.revision
  ) {
    return false;
  }

  if (previous.type === "message" && next.type === "message") {
    return (
      previous.role === next.role &&
      previous.source === next.source &&
      previous.sourceKind === next.sourceKind &&
      previous.phase === next.phase
    );
  }

  if (previous.type === "status" && next.type === "status") {
    return previous.status === next.status;
  }

  return true;
};

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
    return areTranscriptChunkEntriesEqual(entry, nextEntry);
  });
};
