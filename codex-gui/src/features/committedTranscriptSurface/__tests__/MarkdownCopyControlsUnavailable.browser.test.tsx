import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";

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
import {
  streamdownControlLocales,
  streamdownControlMarkdown,
} from "./streamdownControlTestSupport";

test.each(streamdownControlLocales)(
  "keeps copy controls unavailable with localized $locale downloads in an insecure context",
  async ({ labels, locale, messages }) => {
    const committed = await renderWithProviders(
      <MarkdownText source={streamdownControlMarkdown} />,
      { locale, messages },
    );

    await expect
      .element(
        committed.locator.getByRole("button", { name: labels.downloadFile, exact: true }),
      )
      .toBeVisible();
    await expect
      .element(
        committed.locator.getByRole("button", { name: labels.downloadTable, exact: true }),
      )
      .toBeVisible();

    await expect
      .element(committed.locator.getByRole("button", { name: labels.copyCode, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(committed.locator.getByRole("button", { name: labels.copyTable, exact: true }))
      .not.toBeInTheDocument();

    vi.stubGlobal("isSecureContext", true);
    const live = await renderWithProviders(<LiveMarkdownText source={streamdownControlMarkdown} />, {
      locale,
      messages,
    });

    await expect
      .element(live.locator.getByRole("button", { name: labels.downloadFile, exact: true }))
      .toBeVisible();
    await expect
      .element(live.locator.getByRole("button", { name: labels.downloadTable, exact: true }))
      .toBeVisible();

    await expect
      .element(live.locator.getByRole("button", { name: labels.copyCode, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(live.locator.getByRole("button", { name: labels.copyTable, exact: true }))
      .not.toBeInTheDocument();
  },
);
