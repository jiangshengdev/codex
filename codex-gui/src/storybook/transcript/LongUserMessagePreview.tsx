import { ReadOnlyCommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import {
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";

const introduction = "# A long user request\n\n**Keep this syntax literal.**\n\n";
const paragraphs = Array.from(
  { length: 32 },
  (_, index) =>
    `Request paragraph ${String(index + 1)}: Please review the fictional message layout, preserve the original text, and check that every paragraph stays readable when the viewport becomes narrow. 中文与 English 混排也应保持原文。`,
).join("\n\n");
const ending = "\n\n[This is user text](https://example.com)\n\nEnd of the long user request.";
const transcriptState = buildTranscriptStateFromTurns([
  baseTurn("long-user-message", [
    userMessage("long-user-input", [
      textInput(introduction),
      textInput(paragraphs),
      textInput(ending),
    ]),
  ]),
]);

export function LongUserMessagePreview() {
  return (
    <main className="app-shell-content-boundary py-4" data-app-shell-content-layout="reading">
      <ReadOnlyCommittedTranscriptSurface
        surfaceKey="long-user-message"
        transcriptState={transcriptState}
      />
    </main>
  );
}
