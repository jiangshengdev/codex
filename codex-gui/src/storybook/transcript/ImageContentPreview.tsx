import { useMemo } from "react";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { imageTurns, type ImageContentPreset } from "./imageSamples";
import { TranscriptImageEnvironment } from "./TranscriptImageEnvironment";

export function ImageContentPreview({ preset }: Readonly<{ preset: ImageContentPreset }>) {
  const transcriptState = useMemo(
    () => buildTranscriptStateFromTurns(imageTurns[preset]),
    [preset],
  );
  return (
    <TranscriptImageEnvironment>
      <main className="app-shell-content-boundary py-4" data-app-shell-content-layout="reading">
        <ReadOnlyCommittedTranscriptSurface surfaceKey={preset} transcriptState={transcriptState} />
      </main>
    </TranscriptImageEnvironment>
  );
}
