import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent, type Locator } from "vitest/browser";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { renderComposerTurnControl } from "@/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { createAppRouter } from "@/router";
import { disableMotionForTest, renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
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

let restoreMotion: (() => void) | undefined;
beforeEach(async () => {
  resetAppBrowserTestSupport(host.startGuiHostConnection);
  restoreMotion = disableMotionForTest();
  await userEvent.unhover(document.body);
});
afterEach(() => {
  restoreMotion?.();
});

async function mountNewSession() {
  seedBrowserAuthorizationSession({ token: "composer-field-test" });
  const authorization = consumeBrowserAuthorizationSession({
    location: new URL("https://codex.test/new"),
    replaceState: () => undefined,
    storage: window.sessionStorage,
  });
  authorization.commitActiveThread(launchThreadId, attachResponse.snapshot.thread.cwd);
  authorization.clearActiveThread();
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/new"] }));
  await renderWithProviders(<RouterProvider router={router} />);
  initializeHost(getHostOptions(host.startGuiHostConnection), createGuiHostCommands());
}

async function expectFieldFeedback(editor: Locator, blurTarget?: Locator) {
  await expect.element(editor).toBeVisible();
  const element = editor.element();
  if (!(element instanceof HTMLElement)) throw new Error("editor must be an HTML element");
  const field = element.closest('[data-slot="surface"]');
  if (!(field instanceof HTMLElement)) throw new Error("editor must have a field surface");
  const blurEditor = () => {
    if (blurTarget == null) {
      element.blur();
    } else {
      const target = blurTarget.element();
      if (!(target instanceof HTMLElement)) throw new Error("blur target must be an HTML element");
      target.focus();
    }
  };
  blurEditor();
  await expect.element(editor).not.toHaveFocus();
  await editor.hover();
  const hoveredBackground = getComputedStyle(field).backgroundColor;
  const restingShadow = getComputedStyle(field).boxShadow;
  expect(restingShadow).not.toBe("none");
  await editor.click();
  await expect.element(editor).toHaveFocus();
  await expect.poll(() => document.hasFocus() && element.matches(":focus")).toBe(true);
  await expect.poll(() => getComputedStyle(field).backgroundColor).not.toBe(hoveredBackground);
  await expect.poll(() => getComputedStyle(field).boxShadow).toContain("0px 0px 0px 2px");
  blurEditor();
  await expect.poll(() => getComputedStyle(field).boxShadow).toBe(restingShadow);
}

test("new-session field shows hover and focus feedback", async () => {
  await mountNewSession();
  await expectFieldFeedback(page.getByRole("combobox", { name: "Message Codex", exact: true }));
});

test("current-task field shows hover and focus feedback", async () => {
  const screen = await renderComposerTurnControl();
  await expectFieldFeedback(screen.composer());
});

test("pending-message field shows hover and focus feedback", async () => {
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture", captureEditReservations: true },
  });
  await screen.composer().fill("Queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen
    .getByRole("dialog", { name: "Pending details", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expectFieldFeedback(
    screen.getByRole("combobox", { name: "Edit pending message", exact: true }),
    screen.getByRole("button", { name: "Cancel", exact: true }),
  );
});
