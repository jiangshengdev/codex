import { describe, expect, it } from "vitest";
import { boundGraphemes } from "../grapheme";

describe("boundGraphemes", () => {
  it.each([
    { value: "", text: "", truncated: false },
    { value: "ab", text: "ab", truncated: false },
    { value: "abc", text: "abc", truncated: false },
    { value: "abcd", text: "a", truncated: true },
  ])("bounds $value without adding a suffix", ({ value, text, truncated }) => {
    expect(boundGraphemes(value, { maxGraphemes: 3, truncatedGraphemes: 1 })).toEqual({
      text,
      truncated,
    });
  });

  it.each(["界", "👩‍👩‍👧‍👧", "e\u0301", "🇨🇳", "👍🏽"])(
    "preserves complete %s graphemes at the cut",
    (grapheme) => {
      expect(boundGraphemes(`a${grapheme}bc`, { maxGraphemes: 3, truncatedGraphemes: 2 })).toEqual({
        text: `a${grapheme}`,
        truncated: true,
      });
      expect(boundGraphemes(`a${grapheme}b`, { maxGraphemes: 3, truncatedGraphemes: 2 })).toEqual({
        text: `a${grapheme}b`,
        truncated: false,
      });
    },
  );

  it.each([
    { value: "", maxGraphemes: 0, truncatedGraphemes: 0, text: "", truncated: false },
    { value: "a", maxGraphemes: 0, truncatedGraphemes: 0, text: "", truncated: true },
    { value: "ab", maxGraphemes: 1, truncatedGraphemes: 0, text: "", truncated: true },
    { value: "ab", maxGraphemes: 1, truncatedGraphemes: 1, text: "a", truncated: true },
  ])(
    "supports zero and equal budgets: $value / $maxGraphemes / $truncatedGraphemes",
    ({ value, maxGraphemes, truncatedGraphemes, text, truncated }) => {
      expect(boundGraphemes(value, { maxGraphemes, truncatedGraphemes })).toEqual({
        text,
        truncated,
      });
    },
  );

  it("preserves whitespace and combining sequences without normalization", () => {
    const value = " \te\u0301\n ";
    expect(boundGraphemes(value, { maxGraphemes: 5, truncatedGraphemes: 3 })).toEqual({
      text: value,
      truncated: false,
    });
    expect(boundGraphemes(value, { maxGraphemes: 4, truncatedGraphemes: 3 })).toEqual({
      text: " \te\u0301",
      truncated: true,
    });
  });
});
