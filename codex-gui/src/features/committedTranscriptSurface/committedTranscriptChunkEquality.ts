import type { TranscriptChunkView } from "@/features/transcriptState/transcriptStateSlice";

type TranscriptChunkEntry = TranscriptChunkView["entries"][number];
type TranscriptActivityEntry = Extract<TranscriptChunkEntry, { type: "activity" }>;
type TranscriptActivityCopy = TranscriptActivityEntry["copy"];
type TranscriptActivityDetail = TranscriptActivityEntry["details"][number];

const areTranscriptActivityCopiesEqual = (
  previous: TranscriptActivityCopy,
  next: TranscriptActivityCopy,
): boolean => {
  switch (previous.kind) {
    case "agentStarted":
    case "agentInteracted":
    case "agentInterrupted":
      return next.kind === previous.kind && previous.agentPath === next.agentPath;
    case "agentSpawnFailed":
    case "agentsFinishedWaiting":
    case "agentResumeFailed":
    case "noAgentsCompletedYet":
      return next.kind === previous.kind;
    case "agentSpawned":
      return (
        next.kind === "agentSpawned" &&
        previous.receiver === next.receiver &&
        previous.model === next.model &&
        previous.reasoningEffort === next.reasoningEffort
      );
    case "inputSent":
    case "agentResuming":
    case "agentResumed":
    case "agentClosed":
      return next.kind === previous.kind && previous.receiver === next.receiver;
    case "agentsWaiting":
      return (
        next.kind === "agentsWaiting" &&
        previous.receiver === next.receiver &&
        previous.receiverCount === next.receiverCount
      );
    case "agentStatus":
      return (
        next.kind === "agentStatus" &&
        previous.receiver === next.receiver &&
        previous.status === next.status &&
        previous.message === next.message
      );
  }

  previous satisfies never;
  return false;
};

const areTranscriptActivityDetailsEqual = (
  previous: TranscriptActivityDetail,
  next: TranscriptActivityDetail | undefined,
): boolean => {
  switch (previous.kind) {
    case "raw":
      return next?.kind === "raw" && previous.text === next.text;
    case "copy":
      return (
        next?.kind === "copy" && areTranscriptActivityCopiesEqual(previous.copy, next.copy)
      );
  }

  previous satisfies never;
  return false;
};

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
        areTranscriptActivityCopiesEqual(previous.copy, next.copy) &&
        previous.details.length === next.details.length &&
        previous.details.every((detail, index) =>
          areTranscriptActivityDetailsEqual(detail, next.details[index]),
        )
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
