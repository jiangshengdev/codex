import { renderWithProviders as render } from "@/utils/test-utils";
import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", false);
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
  'const value: string = "download me";',
  "```",
  "",
  "| Name | Value |",
  "| --- | --- |",
  "| Copy | Unavailable |",
].join("\n");

test("keeps copy controls unavailable when the module initializes in an insecure context", async () => {
  const committed = await render(<MarkdownText source={markdown} />);

  await expect
    .poll(
      () =>
        committed.container.querySelector('[data-streamdown="code-block-download-button"]') !==
          null && committed.container.querySelector("table") !== null,
    )
    .toBe(true);

  expect(
    committed.container.querySelector('[data-streamdown="code-block-copy-button"]'),
  ).toBeNull();
  await expect
    .element(committed.getByRole("button", { name: "Copy table" }))
    .not.toBeInTheDocument();
  await expect
    .element(committed.getByRole("button", { name: "Download table" }))
    .not.toBeInTheDocument();

  vi.stubGlobal("isSecureContext", true);
  const live = await render(<LiveMarkdownText source={markdown} />);

  await expect
    .poll(
      () => live.container.querySelector('[data-streamdown="code-block-download-button"]') !== null,
    )
    .toBe(true);

  expect(live.container.querySelector('[data-streamdown="code-block-copy-button"]')).toBeNull();
  await expect.element(live.getByRole("button", { name: "Copy table" })).not.toBeInTheDocument();
  await expect
    .element(live.getByRole("button", { name: "Download table" }))
    .not.toBeInTheDocument();
});
