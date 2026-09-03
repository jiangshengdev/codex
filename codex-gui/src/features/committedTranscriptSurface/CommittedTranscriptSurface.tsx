import { useAppSelector } from "@/app/hooks";
import { selectThreadRuntimeThreadId } from "@/features/threadRuntime/threadRuntimeSlice";
import type { TranscriptState } from "@/features/transcriptState/transcriptStateSlice";
import { CommittedTranscriptTurnFragment } from "./CommittedTranscriptTurnFragment";
import { CommittedTranscriptSurfaceRenderer } from "./CommittedTranscriptSurfaceRenderer";
import { TranscriptReadProvider } from "./TranscriptReadProvider";

export const CommittedTranscriptSurface = () => {
  const threadId = useAppSelector(selectThreadRuntimeThreadId);
  const surfaceKey = threadId ?? "no-thread";
  return (
    <TranscriptReadProvider transcriptState={null}>
      <CommittedTranscriptSurfaceRenderer
        key={surfaceKey}
        turnFragmentRenderer={CommittedTranscriptTurnFragment}
      />
    </TranscriptReadProvider>
  );
};

export const ReadOnlyCommittedTranscriptSurface = ({
  surfaceKey,
  transcriptState,
}: Readonly<{ surfaceKey: string; transcriptState: TranscriptState }>) => (
  <TranscriptReadProvider transcriptState={transcriptState}>
    <CommittedTranscriptSurfaceRenderer
      key={surfaceKey}
      turnFragmentRenderer={CommittedTranscriptTurnFragment}
    />
  </TranscriptReadProvider>
);
