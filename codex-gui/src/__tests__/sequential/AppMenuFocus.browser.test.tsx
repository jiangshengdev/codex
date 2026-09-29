import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "../appBrowserTestSupport";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));

beforeEach(() => {
  resetAppBrowserTestSupport(host.startGuiHostConnection);
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
});

test("a menu shortcut from pointer-focused input preserves the themed close-button focus ring", async () => {
  seedBrowserAuthorizationSession({ token: "menu-focus-test" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  await renderWithProviders(<RouterProvider router={router} />);
  initializeHost(getHostOptions(host.startGuiHostConnection), createGuiHostCommands());

  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const close = page.getByRole("button", { name: "Close", exact: true });
  await menu.click();
  await expect.element(close).toHaveFocus();
  await expect.element(close).toHaveStyle({ outlineStyle: "none", boxShadow: "none" });
  await close.click();

  // Meta shortcuts do not switch React Aria from pointer to keyboard modality.
  // Opening a menu with the keyboard must still reveal its initial focus target.
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.click();
  await expect.element(editor).toHaveFocus();
  await userEvent.keyboard("{Meta>}b{/Meta}");
  await expect.element(close).toHaveFocus();
  await expect.element(close).toHaveStyle({ outlineStyle: "none" });
  await expect.poll(() => getComputedStyle(close.element()).boxShadow).not.toBe("none");

  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(editor).toHaveFocus();

  await menu.click();
  await expect.element(close).toHaveFocus();
  await expect.element(close).toHaveStyle({ outlineStyle: "none", boxShadow: "none" });
  await close.click();
  menu.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(close).toHaveFocus();
  await expect.element(close).toHaveStyle({ outlineStyle: "none" });
  await expect.poll(() => getComputedStyle(close.element()).boxShadow).not.toBe("none");
  await userEvent.keyboard("{Meta>}b{/Meta}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(menu).toHaveFocus();
});
