import type { UserInput } from "@codex-protocol/v2";
import { describe, expect, it } from "vitest";

import { projectComposerInputPreview } from "../composerInputPreview";

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

describe("composer input preview", () => {
  it.each([
    { length: 159, expected: "a".repeat(159) },
    { length: 160, expected: "a".repeat(160) },
    { length: 161, expected: `${"a".repeat(157)}...` },
  ])("bounds $length graphemes", ({ length, expected }) => {
    expect(projectComposerInputPreview([textInput("a".repeat(length))])).toEqual({
      type: "text",
      text: expected,
    });
  });

  it.each([
    { label: "ZWJ emoji", grapheme: "👩‍💻" },
    { label: "combining mark", grapheme: "e\u0301" },
  ])("does not split $label graphemes", ({ grapheme }) => {
    expect(projectComposerInputPreview([textInput(grapheme.repeat(161))])).toEqual({
      type: "text",
      text: `${grapheme.repeat(157)}...`,
    });
  });

  it("trims only the outside of concatenated text and preserves internal whitespace", () => {
    expect(
      projectComposerInputPreview([textInput("  first line\n"), textInput("\nsecond  line  ")]),
    ).toEqual({
      type: "text",
      text: "first line\n\nsecond  line",
    });
  });

  it("uses text without repeating structured skill metadata", () => {
    expect(
      projectComposerInputPreview([
        textInput("Use $review for this change"),
        { type: "skill", name: "review", path: "/private/skills/review/SKILL.md" },
      ]),
    ).toEqual({ type: "text", text: "Use $review for this change" });
  });

  it("projects every non-text variant to bounded counts without exposing identifiers", () => {
    const input: UserInput[] = [
      textInput(" \n\t "),
      { type: "image", url: "https://secret.example/remote-image.png" },
      { type: "localImage", path: "/private/local-image.png" },
      { type: "audio", url: "https://secret.example/remote-audio.wav" },
      { type: "localAudio", path: "/private/local-audio.wav" },
      { type: "skill", name: "private-skill", path: "/private/skills/SKILL.md" },
      { type: "mention", name: "private-mention", path: "/private/mentions/item" },
    ];

    const preview = projectComposerInputPreview(input);

    expect(preview).toEqual({
      type: "nonText",
      imageCount: 2,
      audioCount: 2,
      skillCount: 1,
      mentionCount: 1,
    });
    expect(JSON.stringify(preview)).not.toContain("secret");
    expect(JSON.stringify(preview)).not.toContain("private");
  });

  it("returns an empty non-text projection for empty input", () => {
    expect(projectComposerInputPreview([])).toEqual({
      type: "nonText",
      imageCount: 0,
      audioCount: 0,
      skillCount: 0,
      mentionCount: 0,
    });
  });

  it("does not mutate the authoritative input", () => {
    const input: UserInput[] = [
      textInput("  keep me  "),
      { type: "skill", name: "review", path: "/skills/review/SKILL.md" },
    ];
    const before = structuredClone(input);

    projectComposerInputPreview(input);

    expect(input).toEqual(before);
  });
});
