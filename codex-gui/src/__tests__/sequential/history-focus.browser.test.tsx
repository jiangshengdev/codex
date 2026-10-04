import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  renderHistory,
  response,
  thread,
} from "@/features/threadHistory/__tests__/threadHistoryListPageBrowserTestSupport";

// Focus visuals require an active browser page throughout measurement.
test("has one keyboard stop per card with visible focus and Enter navigation", async () => {
  const threadId = "00000000-0000-0000-0000-000000000093";
  const listThreads = vi
    .fn<GuiHostCommands["listThreads"]>()
    .mockResolvedValue(
      response(
        [
          thread("first-focus", { name: "First focus task", preview: "First summary" }),
          thread(threadId, { name: "Second focus task", preview: "Second summary" }),
        ],
        null,
      ),
    );
  const { router, screen } = await renderHistory(listThreads);
  const firstLink = screen.getByRole("link", { name: "First focus task", exact: true });
  const secondLink = screen.getByRole("link", { name: "Second focus task", exact: true });
  await expect.element(firstLink).toBeVisible();
  await userEvent.tab();
  await expect.element(firstLink).toHaveFocus();
  await expect
    .poll(() => {
      const element = firstLink.element();
      const style = getComputedStyle(element);
      return (
        element.matches(":focus-visible") &&
        ((style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none")
      );
    })
    .toBe(true);
  await userEvent.tab();
  await expect.element(secondLink).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("main", { name: "History detail" })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${threadId}`);
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
});
