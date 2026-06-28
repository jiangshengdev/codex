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

type GroupTranscriptEntriesForDisplayOptions = {
  hasFinalAnswerBeforeEntries?: boolean;
  hasFinalAnswerAfterEntries?: boolean;
};

const isAssistantMessage = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> =>
  entry.type === "message" && entry.role === "assistant";

const isFinalAnswer = (entry: TranscriptEntry): boolean =>
  isAssistantMessage(entry) && entry.phase === "final_answer";

const isTemporaryBeforeFinalAnswer = (entry: TranscriptEntry): boolean =>
  isAssistantMessage(entry) && entry.phase === "commentary";

const temporaryModuleId = (entries: TranscriptEntry[]): string =>
  `temporary:${entries.map((entry) => entry.id).join(":")}`;

export const groupTranscriptEntriesForDisplay = (
  entries: TranscriptEntry[],
  options: GroupTranscriptEntriesForDisplayOptions = {},
): TranscriptTurnDisplayItem[] => {
  const finalAnswerIndex = options.hasFinalAnswerBeforeEntries
    ? -1
    : entries.findIndex(isFinalAnswer);
  const hasFinalAnswer =
    options.hasFinalAnswerBeforeEntries === true ||
    finalAnswerIndex !== -1 ||
    options.hasFinalAnswerAfterEntries === true;
  const temporaryBoundary = options.hasFinalAnswerBeforeEntries
    ? 0
    : finalAnswerIndex !== -1
      ? finalAnswerIndex
      : entries.length;
  const temporaryEntries = entries.slice(0, temporaryBoundary).filter(isTemporaryBeforeFinalAnswer);

  const firstTemporaryIndex = entries.findIndex(
    (entry, index) => index < temporaryBoundary && isTemporaryBeforeFinalAnswer(entry),
  );

  return entries.flatMap((entry, index): TranscriptTurnDisplayItem[] => {
    if (index === firstTemporaryIndex && temporaryEntries.length > 0) {
      return [
        {
          type: "temporaryModule",
          id: temporaryModuleId(temporaryEntries),
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
