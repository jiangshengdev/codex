import type { ThreadProjectionDeltaNotification } from "@codex-protocol/v2";
import {
  transcriptEntryIdFor,
  type TranscriptChunk,
  type TranscriptEntryId,
  type TranscriptRenderableLiveItem,
  type TranscriptState,
} from "./transcriptStateModel";

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

  if (
    state.turnsById[turnId] != null &&
    item.initialItem.type === "agentMessage" &&
    item.initialItem.phase === "final_answer"
  ) {
    return { type: "final", item };
  }

  return null;
};

type AgentMessageDeltaBucket = {
  turnId: string;
  itemId: string;
  deltas: [string, ...string[]];
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

    switch (notification.delta.type) {
      case "agentMessage": {
        const { turnId, itemId, delta } = notification.delta.notification;
        const key = transcriptEntryIdFor(turnId, itemId);
        let bucket = bucketByKey[key];
        if (bucket == null) {
          bucket = { turnId, itemId, deltas: [delta] };
          bucketByKey[key] = bucket;
          buckets.push(bucket);
        } else {
          bucket.deltas.push(delta);
        }
        break;
      }
    }
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
