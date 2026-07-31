import { MAX_APPLIED_EVENT_ID_WINDOW_LENGTH, type TranscriptState } from "./transcriptStateModel";

export const hasAppliedTranscriptEvent = (state: TranscriptState, commitId: string): boolean =>
  state.appliedEventIdsById[commitId] === true;

export const recordAppliedTranscriptEvent = (state: TranscriptState, commitId: string) => {
  state.appliedEventIdsById[commitId] = true;
  state.appliedEventOrder.push(commitId);

  if (state.appliedEventOrder.length <= MAX_APPLIED_EVENT_ID_WINDOW_LENGTH) {
    return;
  }

  const removedCommitId = state.appliedEventOrder.shift();
  if (removedCommitId != null) {
    Reflect.deleteProperty(state.appliedEventIdsById, removedCommitId);
  }
};
