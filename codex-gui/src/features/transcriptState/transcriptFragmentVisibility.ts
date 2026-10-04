import type { TranscriptTurn, TranscriptTurnFragment } from "./transcriptStateModel";

export const hasTranscriptFragmentContent = (
  fragment: TranscriptTurnFragment,
  turn: TranscriptTurn | null | undefined,
  isLastFragment: boolean,
): boolean =>
  fragment.leadingPromptEntryId != null ||
  fragment.middleEntryCount > 0 ||
  fragment.finalAssistantEntryIds.length > 0 ||
  (isLastFragment && turn?.error != null);
