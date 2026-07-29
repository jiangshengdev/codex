import type { ThreadItem, Turn } from "@codex-protocol/v2";
import { materializeTranscriptItem } from "./transcriptEntryMaterialization";
import {
  appendTranscriptMessageIdentity,
  reconcileCompletedMessagePlacement,
} from "./transcriptMessageOrder";
import {
  createEmptyTranscriptState,
  resetTranscriptState,
  type TranscriptEntry,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

const createTranscriptTurn = (id: string, status: TranscriptTurn["status"]): TranscriptTurn => ({
  id,
  status,
  originalFirstItemId: null,
  leadingPromptEntryId: null,
  middleChunkIds: [],
  middleEntryCount: 0,
  finalAssistantEntryIds: [],
});

export const ensureTranscriptTurn = (state: TranscriptState, turnId: string): TranscriptTurn => {
  const existingTurn = state.turnsById[turnId];
  if (existingTurn != null) {
    return existingTurn;
  }

  const turn = createTranscriptTurn(turnId, "inProgress");
  state.turnsById[turnId] = turn;
  state.turnIds.push(turnId);
  return turn;
};

export const recordOriginalFirstTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): TranscriptTurn => {
  const turn = ensureTranscriptTurn(state, turnId);
  turn.originalFirstItemId ??= item.id;
  return turn;
};

export const upsertTranscriptTurn = (state: TranscriptState, turn: Turn): void => {
  const transcriptTurn = ensureTranscriptTurn(state, turn.id);
  transcriptTurn.status = turn.status;
  const originalFirstItem = turn.items[0];
  if (originalFirstItem != null) {
    recordOriginalFirstTranscriptItem(state, turn.id, originalFirstItem);
  }
};

const isAssistantMessageEntry = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> & { role: "assistant" } =>
  entry.type === "message" && entry.role === "assistant";

const isUserMessageEntry = (
  entry: TranscriptEntry,
): entry is Extract<TranscriptEntry, { type: "message" }> & { role: "user" } =>
  entry.type === "message" && entry.role === "user";

const isFinalAssistantEntry = (entry: TranscriptEntry): boolean =>
  isAssistantMessageEntry(entry) && entry.phase === "final_answer";

const classifyNewEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  const turn = ensureTranscriptTurn(state, entry.turnId);
  state.entriesById[entry.id] = entry;

  if (isUserMessageEntry(entry) && entry.id === turn.originalFirstItemId) {
    turn.leadingPromptEntryId = entry.id;
    return;
  }

  if (isFinalAssistantEntry(entry)) {
    turn.finalAssistantEntryIds.push(entry.id);
  }
};

const appendBaselineEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  classifyNewEntry(state, entry);
};

const upsertLiveCommittedEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  const existingEntry = state.entriesById[entry.id];
  if (existingEntry == null) {
    classifyNewEntry(state, entry);
    return;
  }

  state.entriesById[entry.id] = {
    ...entry,
    revision: existingEntry.revision + 1,
  };
};

export const applyCompletedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): boolean => {
  const turn = recordOriginalFirstTranscriptItem(state, turnId, item);
  const appendedIdentity = appendTranscriptMessageIdentity(state, turn, item, {
    bumpChunkRevision: true,
  });
  if (!appendedIdentity) {
    reconcileCompletedMessagePlacement(state, turn, item);
  }
  const entry = materializeTranscriptItem(item, turnId);
  if (entry == null) {
    return false;
  }

  upsertLiveCommittedEntry(state, entry);
  return true;
};

export const rebuildTranscriptFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: Turn[],
): void => {
  const nextState = createEmptyTranscriptState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;
  nextState.committedScrollCommitKey = `attach:${threadId}:${subscriptionId}:${headCommitId ?? "none"}`;

  for (const turn of turns) {
    upsertTranscriptTurn(nextState, turn);
    for (const item of turn.items) {
      const transcriptTurn = ensureTranscriptTurn(nextState, turn.id);
      appendTranscriptMessageIdentity(nextState, transcriptTurn, item, {
        bumpChunkRevision: false,
      });
      const entry = materializeTranscriptItem(item, turn.id);
      if (entry != null) {
        appendBaselineEntry(nextState, entry);
      }
    }
  }

  resetTranscriptState(state, nextState);
};
