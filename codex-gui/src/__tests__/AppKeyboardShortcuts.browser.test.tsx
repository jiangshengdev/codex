import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { assert, beforeEach, expect, onTestFinished, test, vi } from "vitest";
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
} from "./appBrowserTestSupport";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));

beforeEach(() => {
  resetAppBrowserTestSupport(host.startGuiHostConnection);
});

test("a queued focus shortcut cannot focus an input disabled before the next frame", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  seedBrowserAuthorizationSession({ token: "shortcut-lifecycle-test" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  const connection = getHostOptions(host.startGuiHostConnection);
  initializeHost(connection, commands);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("keep this draft");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  menu.element().focus();
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementationOnce((callback) => {
    frames.push(callback);
    return 0;
  });
  menu.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "e",
      ctrlKey: true,
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(frames).toHaveLength(1);
  connection.onCommandsUnavailable?.();
  connection.onStatus?.({ label: "closed" });
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  const deferredFocus = frames[0];
  assert.isDefined(deferredFocus);
  deferredFocus(0);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      resolve();
    }),
  );
  await expect.element(menu).toHaveFocus();
  await expect.element(editor).toHaveTextContent("keep this draft");
  expect(router.state.location.pathname).toBe("/new");
  expect(commands.startThread).not.toHaveBeenCalled();
});

test.each([
  {
    platform: "MacIntel",
    keys: ["⌘B", "⇧⌘O", "⌃⌘K", "⌃⌘J", "⇧⌘E", "↵", "⇧↵", "⌘↵"] as const,
    newAria: "Meta+Shift+O",
  },
  {
    platform: "Win32",
    keys: [
      "Ctrl+B",
      "Ctrl+Alt+N",
      "Ctrl+Alt+K",
      "Ctrl+Alt+J",
      "Ctrl+Alt+E",
      "Enter",
      "Shift+Enter",
      "Ctrl+Enter",
    ] as const,
    newAria: "Control+Alt+N",
  },
])(
  "opens a standalone shortcut page with current-platform keycaps on $platform",
  async ({ platform, keys, newAria }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    seedBrowserAuthorizationSession({ token: "shortcut-page-test" });
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
    );
    await renderWithProviders(<RouterProvider router={router} />);
    const commands = createGuiHostCommands();
    initializeHost(getHostOptions(host.startGuiHostConnection), commands);
    await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
    await page.getByRole("combobox", { name: "Message Codex" }).fill("Shortcut preview");
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect.element(send).toBeEnabled();
    await userEvent.unhover(document.body);
    await userEvent.hover(send);
    const tooltip = page.getByRole("tooltip");
    await expect.element(tooltip).toHaveTextContent(keys[5]);
    await expect
      .element(tooltip.element().querySelector("kbd"))
      .toHaveAttribute("aria-label", "Enter");
    await userEvent.unhover(send);
    await expect.element(tooltip).not.toBeInTheDocument();
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await userEvent.hover(menu);
    await expect.element(tooltip).toHaveTextContent(keys[0]);
    await expect
      .element(tooltip.element().querySelector("kbd"))
      .toHaveAttribute("aria-label", platform === "MacIntel" ? "Command+B" : "Ctrl+B");
    await userEvent.unhover(menu);
    await expect.element(tooltip).not.toBeInTheDocument();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    const destinations = navigation.getByRole("button");
    expect(destinations.elements()).toHaveLength(4);
    await expect.element(destinations.nth(0)).toHaveAccessibleName("New session");
    await expect.element(destinations.nth(1)).toHaveAccessibleName("Current task");
    await expect.element(destinations.nth(2)).toHaveAccessibleName("History");
    await expect.element(destinations.nth(3)).toHaveAccessibleName("Keyboard shortcuts");
    const newSession = navigation.getByRole("button", { name: "New session", exact: true });
    await expect.element(newSession).toHaveAttribute("aria-keyshortcuts", newAria);
    await expect.element(newSession.getByText(keys[1], { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Previous task", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Next task", exact: true }))
      .not.toBeInTheDocument();
    await navigation.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    await expect.poll(() => router.state.location.pathname).toBe("/shortcuts");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("heading", { name: "Keyboard shortcuts", exact: true }))
      .toBeVisible();
    const main = page.getByRole("main");
    await expect
      .element(main.getByRole("heading", { name: "Navigation", exact: true }))
      .toBeVisible();
    await expect
      .element(main.getByRole("heading", { name: "Message input", exact: true }))
      .toBeVisible();
    expect(Array.from(main.element().querySelectorAll("kbd"), (key) => key.textContent)).toEqual(
      keys,
    );
    expect(
      Array.from(main.element().querySelectorAll("kbd"), (key) =>
        key.getAttribute("aria-label"),
      ).slice(-3),
    ).toEqual(["Enter", "Shift+Enter", platform === "MacIntel" ? "Command+Enter" : "Ctrl+Enter"]);
    await expect.element(main.getByText("Stop", { exact: true })).not.toBeInTheDocument();
    await expect.element(main.getByRole("button")).not.toBeInTheDocument();
    expect(document.title).toContain("Keyboard shortcuts");
    const originalSize = { width: window.innerWidth, height: window.innerHeight };
    onTestFinished(() => page.viewport(originalSize.width, originalSize.height));
    await page.viewport(360, 720);
    const rows = main.element().querySelectorAll("dl > div");
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      const label = row.querySelector("dt");
      const key = row.querySelector("kbd");
      assert.isNotNull(label);
      assert.isNotNull(key);
      const labelRect = label.getBoundingClientRect();
      const keyRect = key.getBoundingClientRect();
      expect(labelRect.width).toBeGreaterThan(0);
      expect(labelRect.right).toBeLessThanOrEqual(keyRect.left);
      expect(keyRect.right).toBeLessThanOrEqual(window.innerWidth);
      expect(key.scrollWidth).toBeLessThanOrEqual(key.clientWidth);
      expect(key).toHaveAttribute("aria-label");
    }
    const menuButton = page.getByRole("button", { name: "Menu", exact: true });
    menuButton.element().focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(menuButton).toHaveFocus();
    router.history.back();
    await expect.poll(() => router.state.location.pathname).toBe(`/task/${launchThreadId}`);
    expect(commands.startThread).not.toHaveBeenCalled();
  },
);
