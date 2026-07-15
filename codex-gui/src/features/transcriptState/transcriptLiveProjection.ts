import type { ThreadItem, ThreadProjectionDeltaNotification } from "@codex-protocol/v2";
import type { TranscriptRenderableLiveItem, TranscriptState } from "./transcriptStateModel";

const EMPTY_LIVE_ITEMS: readonly TranscriptRenderableLiveItem[] = Object.freeze([]);

const liveItemKey = (turnId: string, itemId: string): string => `${turnId}:${itemId}`;

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

export const hasLiveItem = (state: TranscriptState, turnId: string, itemId: string): boolean =>
  state.liveItemIndexByKey[liveItemKey(turnId, itemId)] != null;

export const appendStartedLiveItem = (state: TranscriptState, turnId: string, item: ThreadItem) => {
  const key = liveItemKey(turnId, item.id);
  if (state.liveItemIndexByKey[key] != null) {
    return;
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
    const item = findLiveItem(state, turnId, itemId);
    if (item == null) {
      continue;
    }

    const delta = deltas.length === 1 ? deltas[0] : deltas.join("");
    appendDeltaToLiveItem(state, item, delta);
  }
};

export const removeLiveItemIfPresent = (state: TranscriptState, turnId: string, itemId: string) => {
  const key = liveItemKey(turnId, itemId);
  const itemIndex = state.liveItemIndexByKey[key];
  if (itemIndex?.turnId !== turnId) {
    return;
  }

  const items = state.liveItemsByTurnId[turnId];
  if (items == null || itemIndex.index >= items.length) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return;
  }

  const removedItem = items[itemIndex.index];
  if (removedItem?.key !== key) {
    Reflect.deleteProperty(state.liveItemIndexByKey, key);
    return;
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
};
