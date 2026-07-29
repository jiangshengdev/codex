import type { ThreadProjectionDeltaNotification } from "@codex-protocol/v2";
import type {
  TranscriptChunk,
  TranscriptRenderableLiveItem,
  TranscriptState,
} from "./transcriptStateModel";

const EMPTY_LIVE_ITEMS: readonly TranscriptRenderableLiveItem[] = Object.freeze([]);

const liveItemKey = (turnId: string, itemId: string): string => `${turnId}:${itemId}`;

const bumpLiveScrollPulse = (state: TranscriptState) => {
  state.liveScrollPulse += 1;
};

export const findLiveItem = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): TranscriptRenderableLiveItem | null => {
  const key = liveItemKey(turnId, itemId);
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex?.turnId !== turnId) {
    return null;
  }

  const item = state.liveItemsByTurnId[turnId]?.[itemIndex.index] ?? null;
  return item?.key === key ? item : null;
};

export const liveItemsForTurn = (
  state: TranscriptState,
  turnId: string,
): readonly TranscriptRenderableLiveItem[] => state.liveItemsByTurnId[turnId] ?? EMPTY_LIVE_ITEMS;

type MiddleLiveItemAndChunk = {
  item: TranscriptRenderableLiveItem;
  chunk: TranscriptChunk;
};

const findMiddleLiveItemAndChunk = (
  state: TranscriptState,
  turnId: string,
  itemId: string,
): MiddleLiveItemAndChunk | null => {
  const item = state.entriesById[itemId];
  if (item?.type !== "live" || item.turnId !== turnId || item.itemId !== itemId) {
    return null;
  }

  const chunkId = state.entryChunkById[itemId];
  const chunk = chunkId == null ? null : state.chunksById[chunkId];
  if (chunk?.turnId !== turnId) {
    return null;
  }

  return { item, chunk };
};

type AgentMessageDeltaBucket = {
  turnId: string;
  itemId: string;
  deltas: [string, ...string[]];
};

const appendDeltaToLiveItem = (
  state: TranscriptState,
  item: TranscriptRenderableLiveItem,
  chunk: TranscriptChunk,
  delta: string,
) => {
  item.transientText += delta;
  item.status = "streaming";
  item.revision += 1;
  chunk.revision += 1;
  bumpLiveScrollPulse(state);
};

export const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: ThreadProjectionDeltaNotification[],
) => {
  const buckets: AgentMessageDeltaBucket[] = [];
  const bucketByKey: Record<string, AgentMessageDeltaBucket> = {};

  for (const notification of notifications) {
    if (state.threadId !== notification.threadId) {
      continue;
    }

    switch (notification.delta.type) {
      case "agentMessage": {
        const { turnId, itemId, delta } = notification.delta.notification;
        const key = liveItemKey(turnId, itemId);
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
    const itemAndChunk = findMiddleLiveItemAndChunk(state, turnId, itemId);
    if (itemAndChunk == null) {
      continue;
    }

    const delta = deltas.length === 1 ? deltas[0] : deltas.join("");
    appendDeltaToLiveItem(state, itemAndChunk.item, itemAndChunk.chunk, delta);
  }
};
