import type { TranscriptState } from "./transcriptStateModel";
import { selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState } from "./transcriptStateSelectors";

const timeLabelsCache = new WeakMap<TranscriptState, Record<string, number>>();

const localTimeBucket = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return `${date.toDateString()}/${String(Math.floor(date.getHours() / 4))}`;
};

// Only metadata is visited. Entries stay behind their existing chunk boundaries.
export const selectTranscriptTimeLabelsFromTranscriptState = (
  state: TranscriptState,
): Record<string, number> => {
  const cached = timeLabelsCache.get(state);
  if (cached != null) return cached;
  const lastFragments = selectLastTranscriptFragmentIdsByTurnIdFromTranscriptState(state);
  const firstFragments = new Map<string, string>();
  for (const pageId of state.contextPageIds) {
    for (const fragmentId of state.contextPagesById[pageId]?.turnFragmentIds ?? []) {
      const fragment = state.turnFragmentsById[fragmentId];
      if (fragment == null || firstFragments.has(fragment.turnId)) continue;
      const turn = state.turnsById[fragment.turnId];
      if (
        fragment.leadingPromptEntryId != null ||
        fragment.middleEntryCount > 0 ||
        fragment.finalAssistantEntryIds.length > 0 ||
        (turn?.error != null && lastFragments[fragment.turnId] === fragmentId)
      )
        firstFragments.set(fragment.turnId, fragmentId);
    }
  }
  const result: Record<string, number> = {};
  let previousBucket: string | null = null;
  for (const turnId of state.turnIds) {
    const startedAt = state.turnsById[turnId]?.startedAt;
    const fragmentId = firstFragments.get(turnId);
    if (startedAt == null || fragmentId == null) continue;
    const bucket = localTimeBucket(startedAt);
    if (bucket !== previousBucket) result[fragmentId] = startedAt;
    previousBucket = bucket;
  }
  timeLabelsCache.set(state, result);
  return result;
};
