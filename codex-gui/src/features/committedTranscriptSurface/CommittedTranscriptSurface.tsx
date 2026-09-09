import { useMemo } from "react";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import { CommittedTranscriptTurnFragment } from "./CommittedTranscriptTurnFragment";
import { CommittedTranscriptSurfaceRenderer } from "./CommittedTranscriptSurfaceRenderer";
import { TranscriptReadProvider } from "./TranscriptReadProvider";
import type { TranscriptReadTarget } from "./TranscriptReadContext";

export const CommittedTranscriptSurface = ({
  identity,
}: Readonly<{ identity: ActiveThreadSessionIdentity }>) => {
  const target = useMemo<TranscriptReadTarget>(() => ({ kind: "live", identity }), [identity]);
  return (
    <TranscriptReadProvider target={target}>
      <CommittedTranscriptSurfaceRenderer
        key={identity.instanceId}
        subscriptionInterruptionHandled
        turnFragmentRenderer={CommittedTranscriptTurnFragment}
      />
    </TranscriptReadProvider>
  );
};

export const ReadOnlyCommittedTranscriptSurface = ({
  surfaceKey,
  transcriptState,
}: Readonly<{ surfaceKey: string; transcriptState: TranscriptState }>) => {
  const target = useMemo<TranscriptReadTarget>(
    () => ({ kind: "fixed", transcriptState }),
    [transcriptState],
  );
  return (
    <TranscriptReadProvider target={target}>
      <CommittedTranscriptSurfaceRenderer
        key={surfaceKey}
        subscriptionInterruptionHandled={false}
        turnFragmentRenderer={CommittedTranscriptTurnFragment}
      />
    </TranscriptReadProvider>
  );
};
