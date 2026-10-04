import { agentMessage, baseTurn } from "@/features/projection/__tests__/projectionTestBuilders";

export const richContentSamples = {
  markdown: [
    "# Release review",
    "",
    "A **finished answer** with *emphasis*, ~~removed text~~ and `inlineCode()`.",
    "",
    "> Keep the reasoning readable beside the result.",
    "",
    "## Checklist",
    "",
    "- [x] Read the request",
    "- [ ] Review the result",
    "  - Check the desktop layout",
    "  - Check the narrow layout",
    "",
    "1. Inspect the sample",
    "2. Copy the result",
    "",
    "[Reference link](https://example.com/reference)",
    "",
    "中文段落与 English words 混合，检查自动换行与标点。",
    "",
    "```ts",
    'const result = { status: "ready", count: 3 };',
    "```",
    "",
    "| Item | Status |",
    "| --- | --- |",
    "| Rendering | Ready |",
    "| Review | Pending |",
  ].join("\n"),
  longCode: [
    "## Long code block",
    "",
    "```ts",
    'const requestDescription = "A deliberately long code line preserves its original spacing and lets the reader inspect every character without widening the surrounding conversation or shrinking the text to fit the viewport.";',
    ...Array.from(
      { length: 48 },
      (_, index) => `const result${String(index + 1)} = processItem(${String(index + 1)});`,
    ),
    "```",
    "",
    "End of the code sample.",
  ].join("\n"),
  wideTable: [
    "## Delivery matrix",
    "",
    "| Item | Desktop Chrome | Mobile Safari | Firefox | Keyboard | Screen reader | Owner | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...Array.from(
      { length: 36 },
      (_, index) =>
        `| Review ${String(index + 1)} | Passed | Pending | Passed | Supported | Checked | ${index === 0 ? "LongUnbrokenOwnerReference".repeat(10) : "Review team"} | Inspect cell ${String(index + 1)} before release |`,
    ),
    "",
    "End of the table sample.",
  ].join("\n"),
  longText: Array.from({ length: 32 }, (_, index) =>
    [
      `## Section ${String(index + 1)}`,
      "",
      "This paragraph keeps the reading surface busy with a reproducible long answer. Readers can scroll through the entire response, select text, and return to the surrounding conversation without losing the structure of the document.",
      "",
      "这是一段用于检查长内容阅读的固定示例。桌面和手机窄屏都应保留自然换行、段落间距和清晰的阅读顺序。",
    ].join("\n"),
  ).join("\n\n"),
  unclosedMarkdown: "## An answer in progress\n\nThe next step is **checking the unfinished",
  unclosedCode:
    "The code is still arriving.\n\n```ts\nexport async function loadResult() {\n  const response = await fetch(",
};

export type RichContentSample = keyof typeof richContentSamples;

export const richContentTurn = (sample: RichContentSample) =>
  baseTurn(`rich-${sample}`, [agentMessage(`rich-${sample}-answer`, richContentSamples[sample])]);
