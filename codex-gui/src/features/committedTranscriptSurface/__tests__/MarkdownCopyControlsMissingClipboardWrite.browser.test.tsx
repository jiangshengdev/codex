import { render } from "vitest-browser-react";
import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {},
  });
});

import { MarkdownText } from "../MarkdownText";

test("hides code copy when clipboard text writes are unavailable", async () => {
  const screen = await render(
    <MarkdownText source={'```ts\nconst value: string = "download me";\n```'} />,
  );

  await expect
    .poll(
      () =>
        screen.container.querySelector('[data-streamdown="code-block-download-button"]') !== null,
    )
    .toBe(true);

  expect(screen.container.querySelector('[data-streamdown="code-block-copy-button"]')).toBeNull();
});
