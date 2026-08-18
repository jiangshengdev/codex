const DOCUMENT_TITLE_SUFFIX = " · Codex";
const MAX_DOCUMENT_TITLE_CONTENT_GRAPHEMES = 52;
const TRUNCATED_DOCUMENT_TITLE_CONTENT_GRAPHEMES = 51;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const normalizeDocumentTitleContent = (value: string): string => value.trim().replace(/\s+/gu, " ");

export const formatDocumentTitle = (content: string): string => {
  const normalizedContent = normalizeDocumentTitleContent(content);
  const graphemes = Array.from(
    graphemeSegmenter.segment(normalizedContent),
    ({ segment }) => segment,
  );
  const boundedContent =
    graphemes.length <= MAX_DOCUMENT_TITLE_CONTENT_GRAPHEMES
      ? normalizedContent
      : `${graphemes.slice(0, TRUNCATED_DOCUMENT_TITLE_CONTENT_GRAPHEMES).join("")}…`;

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
