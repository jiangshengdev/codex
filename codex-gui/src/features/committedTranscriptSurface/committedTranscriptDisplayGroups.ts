import type { TranscriptEntry } from "@/features/transcriptState/transcriptStateSlice";

export type TranscriptTurnDisplayItem =
  | {
      type: "entry";
      entry: TranscriptEntry;
    }
  | {
      type: "temporaryModule";
      id: string;
      entries: TranscriptEntry[];
      hasFinalAnswer: boolean;
    }
  | {
      type: "finalAnswer";
      entry: TranscriptEntry;
    };

const isAssistantMessage = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> =>
  entry.type === "message" && entry.role === "assistant";

const isFinalAnswer = (entry: TranscriptEntry): boolean =>
  isAssistantMessage(entry) && entry.phase === "final_answer";

const isTemporaryBeforeFinalAnswer = (entry: TranscriptEntry): boolean =>
  isAssistantMessage(entry) && entry.phase === "commentary";

const temporaryModuleId = (entry: TranscriptEntry): string => `temporary:${entry.id}`;

export const groupTranscriptEntriesForDisplay = (
  entries: TranscriptEntry[],
): TranscriptTurnDisplayItem[] => {
  const finalAnswerIndex = entries.findIndex(isFinalAnswer);
  const hasFinalAnswer = finalAnswerIndex !== -1;
  const temporaryBoundary = hasFinalAnswer ? finalAnswerIndex : entries.length;
  const temporaryEntries = entries.slice(0, temporaryBoundary).filter(isTemporaryBeforeFinalAnswer);

  const firstTemporaryIndex = entries.findIndex(
    (entry, index) => index < temporaryBoundary && isTemporaryBeforeFinalAnswer(entry),
  );

  return entries.flatMap((entry, index): TranscriptTurnDisplayItem[] => {
    if (index === firstTemporaryIndex && temporaryEntries.length > 0) {
      const firstTemporaryEntry = temporaryEntries[0];
      if (firstTemporaryEntry === undefined) {
        return [];
      }

      return [
        {
          type: "temporaryModule",
          id: temporaryModuleId(firstTemporaryEntry),
          entries: temporaryEntries,
          hasFinalAnswer,
        },
      ];
    }

    if (index < temporaryBoundary && isTemporaryBeforeFinalAnswer(entry)) {
      return [];
    }

    if (isFinalAnswer(entry)) {
      return [{ type: "finalAnswer", entry }];
    }

    return [{ type: "entry", entry }];
  });
};
