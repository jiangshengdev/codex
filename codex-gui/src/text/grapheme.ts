const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Preserve the original text unless it exceeds maxGraphemes, then keep truncatedGraphemes.
 * Budgets must be nonnegative integers with truncatedGraphemes <= maxGraphemes.
 * Stops after observing the first grapheme beyond the limit; adds no suffix or normalization.
 */
export const boundGraphemes = (
  value: string,
  {
    maxGraphemes,
    truncatedGraphemes,
  }: Readonly<{ maxGraphemes: number; truncatedGraphemes: number }>,
): Readonly<{ text: string; truncated: boolean }> => {
  let count = 0;
  let retainedEnd = 0;
  for (const segment of graphemeSegmenter.segment(value)) {
    count += 1;
    if (count > maxGraphemes) {
      return { text: value.slice(0, retainedEnd), truncated: true };
    }
    if (count <= truncatedGraphemes) {
      retainedEnd = segment.index + segment.segment.length;
    }
  }

  return { text: value, truncated: false };
};
