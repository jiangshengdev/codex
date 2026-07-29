import type { ThreadItem, ThreadProjectionDeltaNotification } from "@codex-protocol/v2";
import {
  transcriptMessageKeyFor,
  type TranscriptMessageKey,
  type TranscriptRenderableLiveItem,
  type TranscriptState,
} from "./transcriptStateModel";

const bumpLiveScrollPulse = (state: TranscriptState) => {
  state.liveScrollPulse += 1;
};

const ensureLiveItemsForTurn = (
  state: TranscriptState,
  turnId: string,
): TranscriptRenderableLiveItem[] => {
  const existingItems = state.liveItemsByTurnId[turnId];
  if (existingItems != null) {
    return existingItems;
  }

  const items: TranscriptRenderableLiveItem[] = [];
  state.liveItemsByTurnId[turnId] = items;
  return items;
};

export const appendStartedLiveItem = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const key = transcriptMessageKeyFor(turnId, item.id);
  if (state.liveItemIndexByKey[key] != null) {
    return false;
  }

  const items = ensureLiveItemsForTurn(state, turnId);
  state.liveItemIndexByKey[key] = { turnId, index: items.length };
  items.push({
    key,
    turnId,
    itemId: item.id,
    initialItem: item,
    status: "started",
    transientText: "",
    revision: 0,
  });
  if (item.type === "agentMessage") {
    bumpLiveScrollPulse(state);
  }
  return true;
};

export const findLiveItemByKey = (
  state: TranscriptState,
  key: TranscriptMessageKey,
): TranscriptRenderableLiveItem | null => {
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex == null) {
    return null;
  }

  const item = state.liveItemsByTurnId[itemIndex.turnId]?.[itemIndex.index] ?? null;
  return item?.key === key ? item : null;
};

type AgentMessageDeltaBucket = {
  turnId: string;
  itemId: string;
  deltas: [string, ...string[]];
};

const appendDeltaToLiveItem = (
  state: TranscriptState,
  item: TranscriptRenderableLiveItem,
  delta: string,
) => {
  item.transientText += delta;
  item.status = "streaming";
  item.revision += 1;
  bumpLiveScrollPulse(state);
};

export const applyAcceptedProjectionDeltaBatch = (
  state: TranscriptState,
  notifications: ThreadProjectionDeltaNotification[],
): TranscriptMessageKey[] => {
  const buckets: AgentMessageDeltaBucket[] = [];
  const bucketByKey: Record<TranscriptMessageKey, AgentMessageDeltaBucket> = {};

  for (const notification of notifications) {
    if (state.threadId !== notification.threadId) {
      continue;
    }

    switch (notification.delta.type) {
      case "agentMessage": {
        const { turnId, itemId, delta } = notification.delta.notification;
        const key = transcriptMessageKeyFor(turnId, itemId);
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

  const changedKeys: TranscriptMessageKey[] = [];
  for (const { turnId, itemId, deltas } of buckets) {
    const key = transcriptMessageKeyFor(turnId, itemId);
    const item = findLiveItemByKey(state, key);
    if (item == null) {
      continue;
    }

    const delta = deltas.length === 1 ? deltas[0] : deltas.join("");
    appendDeltaToLiveItem(state, item, delta);
    changedKeys.push(key);
  }
  return changedKeys;
};

export const removeLiveItemIfPresent = (state: TranscriptState, key: TranscriptMessageKey) => {
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex == null) {
    return false;
  }

  const { turnId } = itemIndex;
  const items = state.liveItemsByTurnId[turnId];
  if (items == null || itemIndex.index >= items.length) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return false;
  }

  const removedItem = items[itemIndex.index];
  if (removedItem?.key !== key) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return false;
  }

  items.splice(itemIndex.index, 1);
  Reflect.deleteProperty(state.liveItemIndexByKey, key);
  if (removedItem.initialItem.type === "agentMessage") {
    bumpLiveScrollPulse(state);
  }

  for (let index = itemIndex.index; index < items.length; index += 1) {
    const shiftedItem = items[index];
    if (shiftedItem != null) {
      state.liveItemIndexByKey[shiftedItem.key] = { turnId, index };
    }
  }

  if (items.length === 0) {
    Reflect.deleteProperty(state.liveItemsByTurnId, turnId);
  }
  return true;
};
