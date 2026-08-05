import type { ThreadItem, ThreadProjectionDeltaNotification, Turn } from "@codex-protocol/v2";
import {
  projectCompletedTranscriptItem,
  projectStartedTranscriptItem,
  projectTranscriptDelta,
  type TranscriptAgentMessageDelta,
} from "./transcriptItemPolicy";
import {
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  createEmptyTranscriptState,
  resetTranscriptState,
  transcriptEntryIdFor,
  type TranscriptChunk,
  type TranscriptEntry,
  type TranscriptEntryId,
  type TranscriptRenderableLiveItem,
  type TranscriptState,
  type TranscriptTurn,
} from "./transcriptStateModel";

export const hasTranscriptEntry = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): boolean => state.entriesById[transcriptEntryIdFor(turnId, itemId)] != null;

export const appendStartedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
  commitId: string,
) => {
  recordOriginalFirstTranscriptItem(state, turnId, item);
  const projection = projectStartedTranscriptItem(item, turnId);
  switch (projection.kind) {
    case "ignore":
      return;
    case "reserve": {
      const { item: agentMessage } = projection;
      if (hasTranscriptEntry(state, turnId, agentMessage.id)) {
        return;
      }

      const entryId = transcriptEntryIdFor(turnId, agentMessage.id);
      state.entriesById[entryId] = {
        type: "live",
        id: agentMessage.id,
        key: entryId,
        turnId,
        itemId: agentMessage.id,
        status: "started",
        initialItem: agentMessage,
        transientText: "",
        revision: 0,
      };

      if (agentMessage.phase === "final_answer") {
        return;
      }

      const chunk = getOrCreateMiddleChunk(state, turnId);
      chunk.entryIds.push(entryId);
      chunk.revision += 1;
      state.entryChunkById[entryId] = chunk.id;
      return;
    }
    case "present":
      if (hasTranscriptEntry(state, turnId, projection.entry.id)) {
        return;
      }

      classifyNewEntry(state, projection.entry, { bumpChunkRevision: true });
      state.committedScrollCommitKey = `event:${commitId}`;
      return;
  }

  const exhaustiveProjection: never = projection;
  return exhaustiveProjection;
};

const chunkIdForIndex = (turnId: string, index: number): string =>
  `${turnId}:chunk:${String(index)}`;

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

const recordOriginalFirstTranscriptItem = (
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

const getOrCreateMiddleChunk = (state: TranscriptState, turnId: string): TranscriptChunk => {
  const turn = ensureTranscriptTurn(state, turnId);
  const chunkIds = turn.middleChunkIds;
  const lastChunkId = chunkIds.at(-1);
  const lastChunk = lastChunkId == null ? null : state.chunksById[lastChunkId];

  if (lastChunk != null && lastChunk.entryIds.length < TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT) {
    return lastChunk;
  }

  const chunkId = chunkIdForIndex(turnId, chunkIds.length);
  const chunk: TranscriptChunk = { id: chunkId, turnId, entryIds: [], revision: 0 };
  state.chunksById[chunkId] = chunk;
  turn.middleChunkIds.push(chunkId);
  return chunk;
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

const appendEntryToMiddleChunk = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  const turn = ensureTranscriptTurn(state, entry.turnId);
  const chunk = getOrCreateMiddleChunk(state, entry.turnId);
  const entryId = transcriptEntryIdFor(entry.turnId, entry.id);
  chunk.entryIds.push(entryId);
  turn.middleEntryCount += 1;
  if (options.bumpChunkRevision) {
    chunk.revision += 1;
  }
  state.entryChunkById[entryId] = chunk.id;
};

const removeEntryFromMiddleChunk = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
  hadVisibleContribution: boolean,
): boolean => {
  const turn = state.turnsById[turnId];
  const entryId = transcriptEntryIdFor(turnId, itemId);
  const chunkId = state.entryChunkById[entryId];
  const chunk = chunkId == null ? null : state.chunksById[chunkId];
  if (turn == null || chunk?.turnId !== turnId) {
    return false;
  }

  const entryIndex = chunk.entryIds.indexOf(entryId);
  if (entryIndex === -1) {
    return false;
  }

  chunk.entryIds.splice(entryIndex, 1);
  chunk.revision += 1;
  if (hadVisibleContribution) {
    turn.middleEntryCount -= 1;
  }
  Reflect.deleteProperty(state.entryChunkById, entryId);

  const hasRemainingMiddleEntries = turn.middleChunkIds.some(
    (middleChunkId) => (state.chunksById[middleChunkId]?.entryIds.length ?? 0) > 0,
  );
  if (!hasRemainingMiddleEntries) {
    for (const middleChunkId of turn.middleChunkIds) {
      Reflect.deleteProperty(state.chunksById, middleChunkId);
    }
    turn.middleChunkIds = [];
  }

  return true;
};

const appendEntryToFinal = (
  state: TranscriptState,
  turnId: string,
  entryId: ReturnType<typeof transcriptEntryIdFor>,
) => {
  const turn = ensureTranscriptTurn(state, turnId);
  if (!turn.finalAssistantEntryIds.includes(entryId)) {
    turn.finalAssistantEntryIds.push(entryId);
  }
};

const removeEntryFromFinal = (state: TranscriptState, turnId: string, itemId: string): boolean => {
  const turn = state.turnsById[turnId];
  if (turn == null) {
    return false;
  }

  const entryId = transcriptEntryIdFor(turnId, itemId);
  const entryIndex = turn.finalAssistantEntryIds.indexOf(entryId);
  if (entryIndex === -1) {
    return false;
  }

  turn.finalAssistantEntryIds.splice(entryIndex, 1);
  return true;
};

const bumpLiveScrollPulse = (state: TranscriptState) => {
  state.liveScrollPulse += 1;
};

type LiveItemPlacement =
  | {
      type: "middle";
      item: TranscriptRenderableLiveItem;
      chunk: TranscriptChunk;
    }
  | {
      type: "final";
      item: TranscriptRenderableLiveItem;
    };

const findLiveItemPlacement = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): LiveItemPlacement | null => {
  const entryId = transcriptEntryIdFor(turnId, itemId);
  const item = state.entriesById[entryId];
  if (item?.type !== "live" || item.turnId !== turnId || item.itemId !== itemId) {
    return null;
  }

  const chunkId = state.entryChunkById[entryId];
  const chunk = chunkId == null ? null : state.chunksById[chunkId];
  if (chunk?.turnId === turnId) {
    return { type: "middle", item, chunk };
  }

  if (state.turnsById[turnId] != null && item.initialItem.phase === "final_answer") {
    return { type: "final", item };
  }

  return null;
};

type AgentMessageDeltaBucket = {
  turnId: TranscriptAgentMessageDelta["turnId"];
  itemId: TranscriptAgentMessageDelta["itemId"];
  deltas: [TranscriptAgentMessageDelta["delta"], ...TranscriptAgentMessageDelta["delta"][]];
};

const appendDeltaToLiveItem = (
  state: TranscriptState,
  placement: LiveItemPlacement,
  delta: string,
) => {
  if (delta.length === 0) {
    return;
  }

  const { item } = placement;
  const hadVisibleContribution = item.transientText.length > 0;
  item.transientText += delta;
  item.status = "streaming";
  item.revision += 1;
  if (placement.type === "middle") {
    placement.chunk.revision += 1;
  }
  if (!hadVisibleContribution && placement.type === "middle") {
    const turn = state.turnsById[item.turnId];
    if (turn != null) {
      turn.middleEntryCount += 1;
    }
  }
  if (!hadVisibleContribution && placement.type === "final") {
    const turn = state.turnsById[item.turnId];
    if (turn != null && !turn.finalAssistantEntryIds.includes(item.key)) {
      turn.finalAssistantEntryIds.push(item.key);
    }
  }
  bumpLiveScrollPulse(state);
};

export const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: ThreadProjectionDeltaNotification[],
) => {
  const buckets: AgentMessageDeltaBucket[] = [];
  const bucketByKey: Record<TranscriptEntryId, AgentMessageDeltaBucket> = {};

  for (const notification of notifications) {
    if (state.threadId !== notification.threadId) {
      continue;
    }

    const projection = projectTranscriptDelta(notification.delta);
    switch (projection.kind) {
      case "ignore":
        continue;
      case "present": {
        const { turnId, itemId, delta } = projection.delta;
        const key = transcriptEntryIdFor(turnId, itemId);
        const bucket = bucketByKey[key];
        if (bucket == null) {
          const newBucket: AgentMessageDeltaBucket = { turnId, itemId, deltas: [delta] };
          bucketByKey[key] = newBucket;
          buckets.push(newBucket);
        } else {
          bucket.deltas.push(delta);
        }
        continue;
      }
    }

    projection satisfies never;
  }

  for (const { turnId, itemId, deltas } of buckets) {
    const placement = findLiveItemPlacement(state, turnId, itemId);
    if (placement == null) {
      continue;
    }

    const delta = deltas.length === 1 ? deltas[0] : deltas.join("");
    appendDeltaToLiveItem(state, placement, delta);
  }
};

const classifyNewEntry = (
  state: TranscriptState,
  entry: TranscriptEntry,
  options: { bumpChunkRevision: boolean },
) => {
  const turn = ensureTranscriptTurn(state, entry.turnId);
  const entryId = transcriptEntryIdFor(entry.turnId, entry.id);
  state.entriesById[entryId] = entry;

  if (isUserMessageEntry(entry) && entry.id === turn.originalFirstItemId) {
    turn.leadingPromptEntryId = entryId;
    return;
  }

  if (isFinalAssistantEntry(entry)) {
    appendEntryToFinal(state, entry.turnId, entryId);
    return;
  }

  appendEntryToMiddleChunk(state, entry, options);
};

const appendBaselineEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  classifyNewEntry(state, entry, { bumpChunkRevision: false });
};

const upsertLiveCommittedEntry = (state: TranscriptState, entry: TranscriptEntry) => {
  const entryId = transcriptEntryIdFor(entry.turnId, entry.id);
  const existingEntry = state.entriesById[entryId];
  if (existingEntry == null) {
    classifyNewEntry(state, entry, { bumpChunkRevision: true });
    return;
  }

  const hadVisibleMiddleContribution =
    existingEntry.type !== "live" || existingEntry.transientText.length > 0;

  state.entriesById[entryId] = {
    ...entry,
    revision: existingEntry.revision + 1,
  };
  const turn = ensureTranscriptTurn(state, entry.turnId);
  const chunkId = state.entryChunkById[entryId];
  if (chunkId == null) {
    if (isFinalAssistantEntry(entry)) {
      appendEntryToFinal(state, entry.turnId, entryId);
      return;
    }

    if (existingEntry.type === "live" && existingEntry.initialItem.phase === "final_answer") {
      removeEntryFromFinal(state, entry.turnId, entry.id);
      appendEntryToMiddleChunk(state, entry, { bumpChunkRevision: true });
    }
    return;
  }

  if (isFinalAssistantEntry(entry)) {
    removeEntryFromMiddleChunk(state, entry.turnId, entry.id, hadVisibleMiddleContribution);
    appendEntryToFinal(state, entry.turnId, entryId);
    return;
  }

  if (!hadVisibleMiddleContribution) {
    turn.middleEntryCount += 1;
  }

  const chunk = state.chunksById[chunkId];
  if (chunk != null) {
    chunk.revision += 1;
  }
};

export const applyCompletedTranscriptItem = (
  state: TranscriptState,
  turnId: string,
  item: ThreadItem,
  commitId: string,
): void => {
  recordOriginalFirstTranscriptItem(state, turnId, item);
  const projection = projectCompletedTranscriptItem(item, turnId);
  switch (projection.kind) {
    case "ignore":
    case "remove": {
      const entryId = transcriptEntryIdFor(turnId, item.id);
      const existingEntry = state.entriesById[entryId];
      let didChangeVisibleDom = false;
      if (existingEntry?.type === "live" && existingEntry.turnId === turnId) {
        const hadVisibleContribution = existingEntry.transientText.length > 0;
        const removedFromMiddle = removeEntryFromMiddleChunk(
          state,
          turnId,
          item.id,
          hadVisibleContribution,
        );
        const removedFromFinal = removeEntryFromFinal(state, turnId, item.id);
        Reflect.deleteProperty(state.entriesById, entryId);
        didChangeVisibleDom = hadVisibleContribution && (removedFromMiddle || removedFromFinal);
      } else if (
        existingEntry?.type === "collabAgent" &&
        existingEntry.turnId === turnId &&
        existingEntry.toolStatus === "inProgress"
      ) {
        didChangeVisibleDom = removeEntryFromMiddleChunk(state, turnId, item.id, true);
        Reflect.deleteProperty(state.entriesById, entryId);
      }

      if (didChangeVisibleDom) {
        state.committedScrollCommitKey = `event:${commitId}`;
      }
      return;
    }
    case "present":
      upsertLiveCommittedEntry(state, projection.entry);
      state.committedScrollCommitKey = `event:${commitId}`;
      return;
  }

  projection satisfies never;
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
      const projection = projectCompletedTranscriptItem(item, turn.id);
      switch (projection.kind) {
        case "ignore":
        case "remove":
          continue;
        case "present":
          appendBaselineEntry(nextState, projection.entry);
          continue;
      }

      projection satisfies never;
    }
  }

  resetTranscriptState(state, nextState);
};
