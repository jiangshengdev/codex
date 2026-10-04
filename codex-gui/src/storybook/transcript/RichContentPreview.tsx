import { useMemo } from "react";
import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { LiveMarkdownText } from "@/features/committedTranscriptSurface/LiveMarkdownText";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { richContentSamples, richContentTurn, type RichContentSample } from "./richContentSamples";

export function RichContentPreview({ sample }: { sample: RichContentSample }) {
  const transcriptState = useMemo(
    () => buildTranscriptStateFromTurns([richContentTurn(sample)]),
    [sample],
  );
  const unfinished = sample === "unclosedMarkdown" || sample === "unclosedCode";

  return (
    <main className="app-shell-content-boundary py-4" data-app-shell-content-layout="reading">
      {unfinished ? (
        <LiveMarkdownText source={richContentSamples[sample]} enableMath />
      ) : (
        <ReadOnlyCommittedTranscriptSurface surfaceKey={sample} transcriptState={transcriptState} />
      )}
    </main>
  );
}
