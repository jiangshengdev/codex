import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus, observeKeyboardFocus } from "./focusObservation";

/** Initial open drawers also need their product closing/restoration boundary. */
export async function observePendingReturn(page: Page, testInfo: TestInfo, storyId: string) {
  if (
    ![
      "composer-pending-input-browsing--mixed-text",
      "composer-pending-input-reordering--refresh-failed",
    ].includes(storyId)
  )
    return;
  const drawer = page.getByRole("dialog", { name: "Pending details", exact: true });
  await expect(drawer).toHaveCount(1);
  if (storyId.endsWith("--refresh-failed")) {
    await expect(drawer.getByRole("alert")).toContainText(
      "Updated pending order could not be loaded",
    );
    await observeKeyboardFocus(page, testInfo, `${storyId}-refresh-error`);
  }
  await activateProductControl(page, drawer.getByRole("button", { name: "Close", exact: true }));
  await expect(drawer).toHaveCount(0);
  const summaries = page
    .getByRole("group", { name: /^Pending:/ })
    .getByRole("button", { name: /^(Queued|Guide|Priority) \d+$/ });
  await expect
    .poll(() =>
      summaries.evaluateAll((elements) =>
        elements.some((element) => document.hasFocus() && element === document.activeElement),
      ),
    )
    .toBe(true);
  await observeCurrentFocus(page, testInfo, `${storyId}-preset-drawer-restored`);
  if (storyId.endsWith("--refresh-failed")) {
    await activateProductControl(page, summaries.first());
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    await expect(drawer.getByRole("listitem")).toHaveCount(3);
    await observeKeyboardFocus(page, testInfo, `${storyId}-refresh-reopened`);
  }
}
