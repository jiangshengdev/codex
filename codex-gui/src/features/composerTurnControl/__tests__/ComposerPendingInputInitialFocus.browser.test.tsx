import { expect, test } from "vitest";

import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";
import {
  createQueueControllerHarness,
  pendingInputItem,
  queueSnapshot,
} from "./composerTurnControlPendingInputBrowserTestSupport";

test("focuses the heading on each pending Drawer mount and restores nested menu focus", async () => {
  const ordinary = ["First", "Second"].map((text) =>
    pendingInputItem(text, "ordinary", { type: "text", text, truncated: false }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, guidingCount: 0, detailRevision: 1, canStop: true }),
    { ordinary, steer: [] },
  );
  const screen = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "provided", controller: harness.controller },
  });
  const drawerTrigger = screen.getByRole("button", { name: "Queued 2", exact: true });
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

  for (const openMenuWithKeyboard of [false, true]) {
    await drawerTrigger.click();
    // A deliberate initial focus target avoids the dialog's delayed fallback focus,
    // which can otherwise interrupt nested menu restoration (CNB #17).
    await expect
      .element(dialog.getByRole("heading", { name: "Pending details", exact: true }))
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
    await screen.user.keyboard("{Escape}");
    await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
    await expect.element(menuTrigger).toHaveFocus();
    await expect.element(dialog).toBeVisible();

    await screen.user.keyboard("{Escape}");
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(drawerTrigger).toHaveFocus();
  }
});
