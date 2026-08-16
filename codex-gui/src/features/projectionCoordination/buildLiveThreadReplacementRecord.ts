import {
  snapshotReplayIndexFromTurns,
  type SnapshotReplayIndex,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import type { LiveThreadReplacementRecord } from "./liveThreadReplacement";

export function buildLiveThreadReplacementRecord(
  response: ThreadProjectionAttachResponse,
): LiveThreadReplacementRecord {
  const { headCommitId, thread } = response.snapshot;
  const transcriptState = buildTranscriptStateFromTurns(thread.turns);
  transcriptState.threadId = thread.id;
  transcriptState.subscriptionId = response.subscriptionId;
  transcriptState.committedScrollCommitKey = `attach:${thread.id}:${response.subscriptionId}:${headCommitId ?? "none"}`;
  const snapshotReplayIndex: SnapshotReplayIndex = snapshotReplayIndexFromTurns(thread.turns);

  return { response, snapshotReplayIndex, transcriptState };
}
