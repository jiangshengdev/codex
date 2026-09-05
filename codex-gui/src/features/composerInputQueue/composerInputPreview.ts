import type { ReadonlyComposerInputPayload } from "@/features/composerInput/composerInputPayload";
import { boundGraphemes } from "@/text/grapheme";

const MAX_PREVIEW_GRAPHEMES = 160;
const TRUNCATED_PREVIEW_GRAPHEMES = MAX_PREVIEW_GRAPHEMES - 3;

export type ComposerInputPreview =
  | Readonly<{ type: "text"; text: string; truncated: boolean }>
  | Readonly<{
      type: "nonText";
      imageCount: number;
      audioCount: number;
      skillCount: number;
      mentionCount: number;
    }>;

type ComposerInputSummary = Readonly<{
  text: string;
  imageCount: number;
  audioCount: number;
  skillCount: number;
  mentionCount: number;
}>;

const summarizeComposerInput = (input: ReadonlyComposerInputPayload): ComposerInputSummary => {
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

  return {
    text: textParts.join("").trim(),
    imageCount,
    audioCount,
    skillCount,
    mentionCount,
  };
};

export const projectComposerInputPreview = (
  input: ReadonlyComposerInputPayload,
): ComposerInputPreview => {
  const summary = summarizeComposerInput(input);
  if (summary.text.length > 0) {
    return { type: "text", ...truncatePreview(summary.text) };
  }

  return {
    type: "nonText",
    imageCount: summary.imageCount,
    audioCount: summary.audioCount,
    skillCount: summary.skillCount,
    mentionCount: summary.mentionCount,
  };
};

export const projectComposerInputTextDetail = (
  input: ReadonlyComposerInputPayload,
): string | null => {
  const text = summarizeComposerInput(input).text;
  return text.length === 0 ? null : text;
};

const truncatePreview = (text: string): Readonly<{ text: string; truncated: boolean }> => {
  const bounded = boundGraphemes(text, {
    maxGraphemes: MAX_PREVIEW_GRAPHEMES,
    truncatedGraphemes: TRUNCATED_PREVIEW_GRAPHEMES,
  });
  return {
    text: bounded.truncated ? `${bounded.text}...` : bounded.text,
    truncated: bounded.truncated,
  };
};
