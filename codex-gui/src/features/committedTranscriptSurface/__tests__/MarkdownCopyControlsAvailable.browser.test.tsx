import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";

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
import {
  streamdownControlLocales,
  streamdownControlMarkdown,
} from "./streamdownControlTestSupport";

test.each(streamdownControlLocales)(
  "shows localized $locale controls when clipboard text writes are available",
  async ({ labels, locale, messages }) => {
    const committed = await renderWithProviders(
      <MarkdownText source={streamdownControlMarkdown} />,
      { locale, messages },
    );
    const live = await renderWithProviders(<LiveMarkdownText source={streamdownControlMarkdown} />, {
      locale,
      messages,
    });

    await expect
      .poll(
        () =>
          committed.container.querySelector('[data-streamdown="code-block-copy-button"]') !==
            null &&
          live.container.querySelector('[data-streamdown="code-block-copy-button"]') !== null,
      )
      .toBe(true);

    await expect
      .element(committed.locator.getByRole("button", { name: labels.copyCode, exact: true }))
      .toBeEnabled();
    await expect
      .element(live.locator.getByRole("button", { name: labels.copyCode, exact: true }))
      .toBeDisabled();

    for (const screen of [committed, live]) {
      await expect
        .element(screen.locator.getByRole("button", { name: labels.downloadFile, exact: true }))
        .toBeVisible();
      await expect
        .element(screen.locator.getByRole("button", { name: labels.copyTable, exact: true }))
        .toBeVisible();
      await expect
        .element(screen.locator.getByRole("button", { name: labels.downloadTable, exact: true }))
        .toBeVisible();
    }
  },
);
