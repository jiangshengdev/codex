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

  switch (previous.type) {
    case "message":
      if (next.type !== "message") {
        return false;
      }
      return (
        previous.role === next.role &&
        previous.source === next.source &&
        previous.sourceKind === next.sourceKind &&
        previous.phase === next.phase
      );
    case "status":
      return next.type === "status" && previous.status === next.status;
    case "activity":
      return (
        next.type === "activity" &&
        previous.title === next.title &&
        previous.details.length === next.details.length &&
        previous.details.every((detail, index) => detail === next.details[index])
      );
  }

  previous satisfies never;
  return false;
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
