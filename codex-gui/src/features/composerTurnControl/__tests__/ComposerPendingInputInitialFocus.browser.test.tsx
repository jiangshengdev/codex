import { msg } from "@lingui/core/macro";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { loadCatalog } from "@/i18n";
import type * as AppI18n from "@/i18n";
import { enableMotionForTest } from "@/__tests__/browserMotion";

import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";
import {
  createQueueControllerHarness,
  pendingInputItem,
  queueSnapshot,
} from "./composerTurnControlPendingInputBrowserTestSupport";

vi.mock("@/i18n", { spy: true });

test.each([
  { width: 414, keyboardFirst: false, longLabels: false },
  { width: 414, keyboardFirst: true, longLabels: false },
  { width: 1280, keyboardFirst: false, longLabels: false },
  { width: 320, keyboardFirst: true, longLabels: true },
])(
  "restores nested menu focus without resize errors ($width px, keyboard first: $keyboardFirst, long labels: $longLabels)",
  async ({ width, keyboardFirst, longLabels }) => {
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };
    const firstLabel = longLabels
      ? "Move this pending message to the very beginning of the queue"
      : "Move to first";
    const lastLabel = longLabels
      ? "Move this pending message to the very end of the queue"
      : "Move to last";
    const resizeErrors: string[] = [];
    const recordError = (event: ErrorEvent) => {
      if (event.message.startsWith("ResizeObserver loop")) resizeErrors.push(event.message);
    };
    window.addEventListener("error", recordError);
    try {
      await page.viewport(width, 800);
      if (longLabels) {
        const original = await vi.importActual<typeof AppI18n>("@/i18n");
        vi.mocked(loadCatalog).mockImplementationOnce(async (locale, i18n) => {
          await original.loadCatalog(locale, i18n);
          i18n.load(locale, {
            [msg`Move to first`.id]: firstLabel,
            [msg`Move to last`.id]: lastLabel,
          });
        });
      }
      // Preserve the real Drawer/menu timing of the delayed-focus regression (CNB #17).
      enableMotionForTest();
      const ordinary = ["First", "Second"].map((text) =>
        pendingInputItem(text, "ordinary", { type: "text", text, truncated: false }),
      );
      const harness = createQueueControllerHarness(
        queueSnapshot({
          ordinaryQueuedCount: 2,
          guidingCount: 0,
          detailRevision: 1,
          canStop: true,
        }),
        { ordinary, steer: [] },
      );
      const screen = await renderComposerTurnControl({
        scenario: { type: "activeFixture" },
        queue: { type: "provided", controller: harness.controller },
      });
      const drawerTrigger = screen.getByRole("button", { name: "Queued 2", exact: true });
      const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

      for (const openMenuWithKeyboard of [keyboardFirst, !keyboardFirst]) {
        await drawerTrigger.click();
        // A deliberate initial focus target avoids the dialog's delayed fallback focus,
        // which can otherwise interrupt nested menu restoration (CNB #17).
        await expect
          .element(dialog.getByRole("button", { name: "Queued 2", exact: true }))
          .toHaveFocus();
        const menuTrigger = dialog.getByRole("button", {
          name: "More move options for pending message: First",
          exact: true,
        });
        if (openMenuWithKeyboard) {
          menuTrigger.element().focus();
          await screen.user.keyboard("{Enter}");
        } else {
          await menuTrigger.click();
        }
        await expect.element(screen.getByRole("menu")).toBeVisible();
        // Opening remains immediate; only geometry assertions wait for visible animation to settle.
        await expect
          .poll(() => {
            const menu = screen.getByRole("menu").element();
            const bounds = menu.getBoundingClientRect();
            return (
              bounds.left >= 0 && bounds.right <= width && menu.scrollWidth <= menu.clientWidth
            );
          })
          .toBe(true);
        await expect.element(screen.getByText(firstLabel, { exact: true })).toBeVisible();
        await expect.element(screen.getByText(lastLabel, { exact: true })).toBeVisible();
        await screen.user.keyboard("{Escape}");
        await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
        await expect.element(menuTrigger).toHaveFocus();
        await expect.element(dialog).toBeVisible();

        await screen.user.keyboard("{Escape}");
        await expect.element(dialog).not.toBeInTheDocument();
        await expect.element(drawerTrigger).toHaveFocus();
      }
      expect(resizeErrors).toEqual([]);
    } finally {
      window.removeEventListener("error", recordError);
      vi.mocked(loadCatalog).mockReset();
      await page.viewport(originalViewport.width, originalViewport.height);
    }
  },
);
