import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { basicMessageTurns, messageReplay } from "./messageReplay";
import { TranscriptReplayPreview } from "./TranscriptReplayPreview";

const basicStates = {
  user: buildTranscriptStateFromTurns(basicMessageTurns.user),
  assistant: buildTranscriptStateFromTurns(basicMessageTurns.assistant),
};

export function BasicMessagePreview({
  content = "replay",
  initialStep = 0,
}: {
  content?: "user" | "assistant" | "replay";
  initialStep?: number;
}) {
  if (content === "replay")
    return (
      <TranscriptReplayPreview key={initialStep} frames={messageReplay} initialStep={initialStep} />
    );
  return (
    <main className="app-shell-content-boundary py-4" data-app-shell-content-layout="reading">
      <ReadOnlyCommittedTranscriptSurface
        surfaceKey={content}
        transcriptState={basicStates[content]}
      />
    </main>
  );
}
