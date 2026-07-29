import { findLiveItem, liveItemsForTurn } from "./transcriptLiveProjection";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
import type {
  TranscriptChunkView,
  TranscriptEntry,
  TranscriptMiddlePresentation,
  TranscriptRenderableLiveItem,
  TranscriptState,
  TranscriptTurn,
} from "./transcriptStateModel";

const isCommittedMiddleEntry = (
  turn: TranscriptTurn,
  entry: TranscriptEntry,
): boolean => {
  if (entry.type !== "message") {
    return false;
  }
  if (entry.id === turn.leadingPromptEntryId) {
    return false;
  }
  return entry.role !== "assistant" || entry.phase !== "final_answer";
};

const isLiveMiddleItem = (turn: TranscriptTurn, item: TranscriptRenderableLiveItem): boolean => {
  const initialItem = item.initialItem;
  switch (initialItem.type) {
    case "userMessage":
      return (
        item.itemId !== turn.originalFirstItemId &&
        materializeTranscriptItem(initialItem, turn.id) != null
      );
    case "agentMessage":
      return (
        initialItem.phase !== "final_answer" &&
        (initialItem.text.length > 0 || item.transientText.length > 0)
      );
    case "hookPrompt":
    case "plan":
    case "reasoning":
    case "commandExecution":
    case "fileChange":
    case "mcpToolCall":
    case "dynamicToolCall":
    case "collabAgentToolCall":
    case "subAgentActivity":
    case "webSearch":
    case "imageView":
    case "sleep":
    case "imageGeneration":
    case "enteredReviewMode":
    case "exitedReviewMode":
    case "contextCompaction":
      return false;
  }

  initialItem satisfies never;
};

export const transcriptChunkView = (
  transcriptState: TranscriptState,
  chunkId: string,
): TranscriptChunkView | null => {
  const chunk = transcriptState.chunksById[chunkId];
  if (chunk == null) {
    return null;
  }
  return chunk;
};

export const transcriptMiddlePresentation = (
  transcriptState: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptMiddlePresentation | null => {
  const turn = transcriptState.turnsById[turnId];
  if (turn == null) {
    return null;
  }

  const entry = transcriptState.entriesById[itemId];
  if (entry?.turnId === turnId && isCommittedMiddleEntry(turn, entry)) {
    return { kind: "committed", entry };
  }

  const item = findLiveItem(transcriptState, turnId, itemId);
  if (item == null || !isLiveMiddleItem(turn, item)) {
    return null;
  }
  return { kind: "live", item };
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
