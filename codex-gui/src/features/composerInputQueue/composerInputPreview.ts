import type { UserInput } from "@codex-protocol/v2";

const MAX_PREVIEW_GRAPHEMES = 160;
const TRUNCATED_PREVIEW_GRAPHEMES = MAX_PREVIEW_GRAPHEMES - 3;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type ComposerInputPreview =
  | Readonly<{ type: "text"; text: string }>
  | Readonly<{
      type: "nonText";
      imageCount: number;
      audioCount: number;
      skillCount: number;
      mentionCount: number;
    }>;

export const projectComposerInputPreview = (input: readonly UserInput[]): ComposerInputPreview => {
  const textParts: string[] = [];
  let imageCount = 0;
  let audioCount = 0;
  let skillCount = 0;
  let mentionCount = 0;

  for (const item of input) {
    switch (item.type) {
      case "text":
        textParts.push(item.text);
        break;
      case "image":
      case "localImage":
        imageCount += 1;
        break;
      case "audio":
      case "localAudio":
        audioCount += 1;
        break;
      case "skill":
        skillCount += 1;
        break;
      case "mention":
        mentionCount += 1;
        break;
      default: {
        const exhaustiveItem: never = item;
        return exhaustiveItem;
      }
    }
  }

  const normalizedText = textParts.join("").trim();
  if (normalizedText.length > 0) {
    return { type: "text", text: truncatePreview(normalizedText) };
  }

  return {
    type: "nonText",
    imageCount,
    audioCount,
    skillCount,
    mentionCount,
  };
};

const truncatePreview = (text: string): string => {
  const graphemes: string[] = [];
  for (const segment of graphemeSegmenter.segment(text)) {
    graphemes.push(segment.segment);
    if (graphemes.length > MAX_PREVIEW_GRAPHEMES) {
      return `${graphemes.slice(0, TRUNCATED_PREVIEW_GRAPHEMES).join("")}...`;
    }
  }

  return graphemes.join("");
};
