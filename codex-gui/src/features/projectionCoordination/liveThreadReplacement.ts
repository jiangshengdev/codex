import { createAction } from "@reduxjs/toolkit";
import type { SnapshotReplayIndex } from "@/features/threadRuntime/threadRuntimeSlice";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";

export type LiveThreadReplacementRecord = Readonly<{
  response: ThreadProjectionAttachResponse;
  snapshotReplayIndex: SnapshotReplayIndex;
  transcriptState: TranscriptState;
}>;

export const liveThreadReplacementCommitted = createAction<LiveThreadReplacementRecord>(
  "projectionCoordination/liveThreadReplacementCommitted",
);
