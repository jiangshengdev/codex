import { useMemo } from "react";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import { CommittedTranscriptTurnFragment } from "./CommittedTranscriptTurnFragment";
import { CommittedTranscriptSurfaceRenderer } from "./CommittedTranscriptSurfaceRenderer";
import { TranscriptReadProvider } from "./TranscriptReadProvider";
import type { TranscriptReadTarget } from "./TranscriptReadContext";
import type { TurnPositionRequest } from "@/features/browserLaunch/useTurnPositionRequest";
import { ThreadForkSourceContext } from "@/features/threadFork/ThreadForkContext";

export const CommittedTranscriptSurface = ({
  identity,
  turnPosition = null,
  positionCompleted = false,
  onPositionComplete,
}: Readonly<{
  identity: ActiveThreadSessionIdentity;
  turnPosition?: TurnPositionRequest | null;
  positionCompleted?: boolean;
  onPositionComplete?: (request: TurnPositionRequest) => void;
}>) => {
  const target = useMemo<TranscriptReadTarget>(() => ({ kind: "live", identity }), [identity]);
  return (
    <ThreadForkSourceContext value={identity.threadId}>
      <TranscriptReadProvider target={target}>
        <CommittedTranscriptSurfaceRenderer
          key={identity.instanceId}
          turnPosition={turnPosition}
          positionCompleted={positionCompleted}
          onPositionComplete={onPositionComplete}
          subscriptionInterruptionHandled
          turnFragmentRenderer={CommittedTranscriptTurnFragment}
        />
      </TranscriptReadProvider>
    </ThreadForkSourceContext>
  );
};

export const ReadOnlyCommittedTranscriptSurface = ({
  surfaceKey,
  transcriptState,
  turnPosition = null,
}: Readonly<{
  surfaceKey: string;
  transcriptState: TranscriptState;
  turnPosition?: TurnPositionRequest | null;
}>) => {
  const target = useMemo<TranscriptReadTarget>(
    () => ({ kind: "fixed", transcriptState }),
    [transcriptState],
  );
  return (
    <TranscriptReadProvider target={target}>
      <CommittedTranscriptSurfaceRenderer
        key={surfaceKey}
        turnPosition={turnPosition}
        subscriptionInterruptionHandled={false}
        turnFragmentRenderer={CommittedTranscriptTurnFragment}
      />
    </TranscriptReadProvider>
  );
};
