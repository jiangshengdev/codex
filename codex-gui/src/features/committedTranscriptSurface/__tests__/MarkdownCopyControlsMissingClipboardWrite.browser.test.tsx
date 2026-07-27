import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {},
  });
});

import { LiveMarkdownText } from "../LiveMarkdownText";
import { MarkdownText } from "../MarkdownText";
import {
  streamdownControlLocales,
  streamdownControlMarkdown,
} from "./streamdownControlTestSupport";

test.each(streamdownControlLocales)(
  "hides localized $locale copy controls when clipboard text writes are unavailable",
  async ({ labels, locale }) => {
    const committed = await renderWithProviders(
      <MarkdownText source={streamdownControlMarkdown} />,
      { locale },
    );
    const live = await renderWithProviders(<LiveMarkdownText source={streamdownControlMarkdown} />, {
      locale,
    });

    for (const screen of [committed, live]) {
      await expect
        .element(screen.locator.getByRole("button", { name: labels.downloadFile, exact: true }))
        .toBeVisible();
      await expect
        .element(screen.locator.getByRole("button", { name: labels.downloadTable, exact: true }))
        .toBeVisible();

      await expect
        .element(screen.locator.getByRole("button", { name: labels.copyCode, exact: true }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.locator.getByRole("button", { name: labels.copyTable, exact: true }))
        .not.toBeInTheDocument();
    }
  },
);
