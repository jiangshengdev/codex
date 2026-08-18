import { describe, expect, test } from "vitest";
import { formatDocumentTitle, formatTaskDocumentTitle } from "../documentTitle";

describe("document title", () => {
  test.each([
    {
      label: "name",
      input: { name: "Named task", preview: "Preview", fallback: "Untitled task" },
      expected: "Named task · Codex",
    },
    {
      label: "preview",
      input: { name: "  ", preview: "Preview", fallback: "Untitled task" },
      expected: "Preview · Codex",
    },
    {
      label: "fallback",
      input: { name: null, preview: "\n\t", fallback: "  Untitled\n task  " },
      expected: "Untitled task · Codex",
    },
  ])("uses the normalized $label", ({ input, expected }) => {
    expect(formatTaskDocumentTitle(input)).toBe(expected);
  });

  test("trims and collapses Unicode whitespace", () => {
    expect(
      formatTaskDocumentTitle({
        name: "  First\n\tsecond\u00a0\u2003third  ",
        preview: "unused",
        fallback: "unused",
      }),
    ).toBe("First second third · Codex");
  });

  test.each([
    {
      label: "below the 60-grapheme limit",
      content: "a".repeat(51),
      expected: `${"a".repeat(51)} · Codex`,
    },
    {
      label: "at the 60-grapheme limit",
      content: "a".repeat(52),
      expected: `${"a".repeat(52)} · Codex`,
    },
    {
      label: "above the 60-grapheme limit",
      content: "a".repeat(53),
      expected: `${"a".repeat(51)}… · Codex`,
    },
  ])("formats content $label", ({ content, expected }) => {
    expect(formatDocumentTitle(content)).toBe(expected);
  });

  test.each([
    {
      label: "Chinese",
      content: `${"界".repeat(51)}甲乙`,
      expected: `${"界".repeat(51)}… · Codex`,
    },
    {
      label: "an emoji ZWJ sequence",
      content: `${"a".repeat(50)}👩‍👩‍👧‍👧bc`,
      expected: `${"a".repeat(50)}👩‍👩‍👧‍👧… · Codex`,
    },
    {
      label: "a combining-mark sequence",
      content: `${"a".repeat(50)}e\u0301bc`,
      expected: `${"a".repeat(50)}e\u0301… · Codex`,
    },
    {
      label: "a long URL",
      content: `https://example.test/${"path".repeat(12)}`,
      expected: `https://example.test/${"path".repeat(7)}pa… · Codex`,
    },
    {
      label: "a continuous token",
      content: "token".repeat(12),
      expected: `${"token".repeat(10)}t… · Codex`,
    },
  ])("does not split $label", ({ content, expected }) => {
    expect(formatDocumentTitle(content)).toBe(expected);
  });

  test("preserves Markdown, paths, and punctuation as text", () => {
    expect(formatDocumentTitle("**bold** `/tmp/a.ts` -- [link](./docs)!?")).toBe(
      "**bold** `/tmp/a.ts` -- [link](./docs)!? · Codex",
    );
  });
});
