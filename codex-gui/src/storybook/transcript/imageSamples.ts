import type { Turn, UserInput } from "@codex-protocol/v2";
import {
  agentMessage,
  baseTurn,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

export const transcriptImagePath = "/storybook/transcript/sample.png";

const beforeImage = "Inspect this local sample. 中文🙂 text before the attachment: ";
const afterImage = `\n\n${"Adjacent text should wrap while keeping the image preview reachable. ".repeat(24)}`;
const mixedInput: UserInput = {
  type: "text",
  text: `${beforeImage}${transcriptImagePath}${afterImage}`,
  text_elements: [
    {
      byteRange: {
        start: new TextEncoder().encode(beforeImage).length,
        end: new TextEncoder().encode(beforeImage + transcriptImagePath).length,
      },
      placeholder: "sample.png",
    },
  ],
};

export const imageTurns = {
  imageOnly: [
    baseTurn("image-only", [
      userMessage("image-only-user", [{ type: "localImage", path: transcriptImagePath }]),
    ]),
  ],
  mixedContent: [
    baseTurn("image-mixed", [
      userMessage("image-mixed-user", [
        mixedInput,
        { type: "localImage", path: transcriptImagePath },
      ]),
      agentMessage(
        "image-mixed-answer",
        "The local sample contains a blue rectangle and an orange circle.\n\n```text\nrectangle + circle\n```\n\n| Shape | Color |\n| --- | --- |\n| Rectangle | Blue |\n| Circle | Orange |",
      ),
    ]),
  ],
  markdownImageBoundary: [
    baseTurn("image-markdown-boundary", [
      userMessage("image-boundary-user", [{ type: "localImage", path: transcriptImagePath }]),
      agentMessage(
        "image-boundary-answer",
        "The user attachment above has a working preview. Markdown image syntax below remains disabled.\n\n![Disabled Markdown image](https://example.invalid/disabled-image.png)\n\nText after the disabled image remains readable.",
      ),
    ]),
  ],
} satisfies Record<string, Turn[]>;

export type ImageContentPreset = keyof typeof imageTurns;
