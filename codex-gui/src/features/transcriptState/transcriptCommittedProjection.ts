import type { ThreadItem, Turn } from "@codex-protocol/v2";
import {
  areTranscriptPresentationsEqual,
  materializeAuthoritativeTranscriptItem,
} from "./transcriptEntryMaterialization";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  createEmptyTranscriptState,
  resetTranscriptState,
  type TranscriptChunk,
  type TranscriptPresentationCandidate,
  type TranscriptPresentationLocation,
  type TranscriptPresentationSlot,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

const chunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:chunk:${String(index)}`;

const createTranscriptTurn = (id: string, status: TranscriptTurn["status"]): TranscriptTurn => ({
  id,
  status,
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

export const upsertTranscriptTurn = (state: TranscriptState, turn: Turn): void => {
  const existingTurn = state.turnsById[turn.id];
  if (existingTurn == null) {
    state.turnsById[turn.id] = createTranscriptTurn(turn.id, turn.status);
    state.turnIds.push(turn.id);
    return;
  }

  existingTurn.status = turn.status;
};

const getOrCreateMiddleChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  const turn = ensureTranscriptTurn(state, turnId);
  const chunkIds = turn.middleChunkIds;
  const lastChunkId = chunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];

  if (lastChunk != null && lastChunk.slotIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = chunkIdForIndex(turnId, chunkIds.length);
  const chunk: TranscriptChunk = { id: chunkId, turnId, slotIds: [], revision: 0 };
  state.chunksById[chunkId] = chunk;
  turn.middleChunkIds.push(chunkId);
  return chunk;
};

const locationForNewPresentation = (
  turn: TranscriptTurn,
  candidate: TranscriptPresentationCandidate,
): TranscriptPresentationLocation => {
  switch (candidate.placementIntent) {
    case "leadingCandidate":
      return turn.leadingPromptEntryId == null ? "leading" : "intermediate";
    case "intermediate":
      return "intermediate";
    case "final":
      return "final";
  }

  const exhaustiveIntent: never = candidate.placementIntent;
  return exhaustiveIntent;
};

const locationForExistingPresentation = (
  slot: TranscriptPresentationSlot,
  candidate: TranscriptPresentationCandidate,
): TranscriptPresentationLocation => {
  if (candidate.placementIntent === "leadingCandidate") {
    return slot.location === "leading" ? "leading" : "intermediate";
  }
  return candidate.placementIntent;
};

const addSlotToLocation = (
  state: TranscriptState,
  slot: TranscriptPresentationSlot,
  bumpChunkRevision: boolean,
) => {
  const turn = ensureTranscriptTurn(state, slot.turnId);
  switch (slot.location) {
    case "leading":
      turn.leadingPromptEntryId = slot.id;
      return;
    case "final":
      turn.finalAssistantEntryIds.push(slot.id);
      return;
    case "intermediate": {
      const chunk = getOrCreateMiddleChunk(state, slot.turnId);
      chunk.slotIds.push(slot.id);
      turn.middleEntryCount += 1;
      if (bumpChunkRevision) {
        chunk.revision += 1;
      }
      state.slotChunkById[slot.id] = chunk.id;
      return;
    }
  }
};

const removeSlotFromLocation = (state: TranscriptState, slot: TranscriptPresentationSlot) => {
  const turn = ensureTranscriptTurn(state, slot.turnId);
  switch (slot.location) {
    case "leading":
      if (turn.leadingPromptEntryId === slot.id) {
        turn.leadingPromptEntryId = null;
      }
      return;
    case "final": {
      const index = turn.finalAssistantEntryIds.indexOf(slot.id);
      if (index >= 0) {
        turn.finalAssistantEntryIds.splice(index, 1);
      }
      return;
    }
    case "intermediate": {
      const chunkId = state.slotChunkById[slot.id];
      const chunk = chunkId == null ? null : state.chunksById[chunkId];
      const index = chunk?.slotIds.indexOf(slot.id) ?? -1;
      if (chunk != null && index >= 0) {
        chunk.slotIds.splice(index, 1);
        chunk.revision += 1;
        turn.middleEntryCount -= 1;
      }
      Reflect.deleteProperty(state.slotChunkById, slot.id);
      return;
    }
  }
};

const placeNewPresentationSlot = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  candidate: TranscriptPresentationCandidate,
  bumpChunkRevision: boolean,
) => {
  const turn = ensureTranscriptTurn(state, turnId);
  const slot: TranscriptPresentationSlot = {
    id: itemId,
    turnId,
    location: locationForNewPresentation(turn, candidate),
    authority: "authoritative",
    content: candidate.content,
    revision: 0,
  };
  state.slotsById[slot.id] = slot;
  addSlotToLocation(state, slot, bumpChunkRevision);
};

const upsertAuthoritativePresentationSlot = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  candidate: TranscriptPresentationCandidate,
  bumpChunkRevision: boolean,
): boolean => {
  const existingSlot = state.slotsById[itemId];
  if (existingSlot == null) {
    placeNewPresentationSlot(state, turnId, itemId, candidate, bumpChunkRevision);
    return true;
  }

  const nextLocation = locationForExistingPresentation(existingSlot, candidate);
  const locationChanged = existingSlot.location !== nextLocation;
  const contentChanged = !areTranscriptPresentationsEqual(existingSlot.content, candidate.content);
  const authorityChanged = existingSlot.authority !== "authoritative";
  if (!locationChanged && !contentChanged && !authorityChanged) {
    return false;
  }

  if (locationChanged) {
    removeSlotFromLocation(state, existingSlot);
  }
  existingSlot.location = nextLocation;
  existingSlot.authority = "authoritative";
  existingSlot.content = candidate.content;
  existingSlot.revision += 1;

  if (locationChanged) {
    addSlotToLocation(state, existingSlot, true);
  } else if (existingSlot.location === "intermediate") {
    const chunkId = state.slotChunkById[existingSlot.id];
    const chunk = chunkId == null ? null : state.chunksById[chunkId];
    if (chunk != null) {
      chunk.revision += 1;
    }
  }
  return true;
};

export const applyCompletedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
): boolean => {
  ensureTranscriptTurn(state, turnId);
  const candidate = materializeAuthoritativeTranscriptItem(item);
  if (candidate == null) {
    return false;
  }
  return upsertAuthoritativePresentationSlot(state, turnId, item.id, candidate, true);
};

const buildTranscriptStateFromSnapshot = (
  previousGeneration: number,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: readonly Turn[],
): TranscriptState => {
  const nextState = createEmptyTranscriptState();
  nextState.threadId = threadId;
  nextState.subscriptionId = subscriptionId;
  nextState.presentationGeneration = previousGeneration + 1;
  nextState.committedScrollCommitKey = `attach:${threadId}:${subscriptionId}:${headCommitId ?? "none"}`;

  for (const turn of turns) {
    upsertTranscriptTurn(nextState, turn);
    for (const item of turn.items) {
      const candidate = materializeAuthoritativeTranscriptItem(item);
      if (candidate != null) {
        upsertAuthoritativePresentationSlot(nextState, turn.id, item.id, candidate, false);
      }
    }
  }
  return nextState;
};

export const rebuildTranscriptFromSnapshot = (
  state: TranscriptState,
  threadId: string,
  subscriptionId: string,
  headCommitId: string | null,
  turns: Turn[],
): void => {
  resetTranscriptState(
    state,
    buildTranscriptStateFromSnapshot(
      state.presentationGeneration,
      threadId,
      subscriptionId,
      headCommitId,
      turns,
    ),
  );
};
