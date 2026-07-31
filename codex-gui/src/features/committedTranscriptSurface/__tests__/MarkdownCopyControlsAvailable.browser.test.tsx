import { render } from "vitest-browser-react";
import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  });
});

import { LiveMarkdownText } from "../LiveMarkdownText";
import { MarkdownText } from "../MarkdownText";

const markdown = [
  "```ts",
  'const value: string = "copy me";',
  "```",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| Copy | Enabled |",
].join("\n");

test("shows copy controls when clipboard text writes are available", async () => {
  const committed = await render(<MarkdownText source={markdown} />);
  const live = await render(<LiveMarkdownText source={markdown} />);

  await expect
    .poll(
      () =>
        committed.container.querySelector('[data-streamdown="code-block-copy-button"]') !== null &&
        live.container.querySelector('[data-streamdown="code-block-copy-button"]') !== null,
    )
    .toBe(true);

  const committedCopy = committed.container.querySelector<HTMLButtonElement>(
    '[data-streamdown="code-block-copy-button"]',
  );
  const liveCopy = live.container.querySelector<HTMLButtonElement>(
    '[data-streamdown="code-block-copy-button"]',
  );
  if (!(committedCopy && liveCopy)) {
    throw new Error("Expected committed and live code copy buttons to render");
  }

  expect(committedCopy.disabled).toBe(false);
  expect(liveCopy.disabled).toBe(true);
  expect(committed.container.querySelector('button[title="Copy table"]')).not.toBeNull();
});
