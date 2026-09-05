import { boundGraphemes } from "@/text/grapheme";

const DOCUMENT_TITLE_SUFFIX = " · Codex";
const MAX_DOCUMENT_TITLE_CONTENT_GRAPHEMES = 52;
const TRUNCATED_DOCUMENT_TITLE_CONTENT_GRAPHEMES = 51;

const normalizeDocumentTitleContent = (value: string): string => value.trim().replace(/\s+/gu, " ");

export const formatDocumentTitle = (content: string): string => {
  const normalizedContent = normalizeDocumentTitleContent(content);
  const bounded = boundGraphemes(normalizedContent, {
    maxGraphemes: MAX_DOCUMENT_TITLE_CONTENT_GRAPHEMES,
    truncatedGraphemes: TRUNCATED_DOCUMENT_TITLE_CONTENT_GRAPHEMES,
  });
  const boundedContent = bounded.truncated ? `${bounded.text}…` : bounded.text;

  return `${boundedContent}${DOCUMENT_TITLE_SUFFIX}`;
};

export const formatTaskDocumentTitle = ({
  name,
  preview,
  fallback,
}: Readonly<{
  name: string | null;
  preview: string;
  fallback: string;
}>): string => {
  const normalizedName = name == null ? "" : normalizeDocumentTitleContent(name);
  const normalizedPreview = normalizeDocumentTitleContent(preview);
  const normalizedFallback = normalizeDocumentTitleContent(fallback);

  return formatDocumentTitle(normalizedName || normalizedPreview || normalizedFallback);
};
