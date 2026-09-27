import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import { recordFocusStates } from "./focusStateRecorder";

export const appShellStateStoryIds = [
  "app-shell-active-tasks--navigation-failure",
  "app-shell-active-tasks--removal-failure",
] as const;

/** Consume each existing once-failing fixture once, then its single recovery. */
export async function observeAppShellStates(page: Page, testInfo: TestInfo, storyId: string) {
  if (!appShellStateStoryIds.some((id) => id === storyId)) return [];
  return recordFocusStates(
    page,
    testInfo,
    {
      artifactName: `${storyId}-app-shell-states`,
      initialPhase: "initial-shell",
      failureTrigger: "existing App shell failure/recovery fixture",
      observedStatus: "observed-awaiting-visual-and-state-review",
    },
    async (recorder) => {
      const record = (state: string, trigger: string, traverse = false) => {
        const prefix = `${storyId}-recovery-${state}`;
        // Preserve the product's actual transition landing, including no focus.
        // A later Tab traversal must not overwrite or stand in for this observation.
        return recorder.record(state, trigger, {
          current: `${prefix}-current`,
          ...(traverse ? { traversal: prefix } : {}),
        });
      };
      const menuTrigger = page.getByRole("button", { name: "Menu", exact: true });
      const drawer = page.getByRole("dialog", { name: "Navigation", exact: true });
      const secondTask = drawer.getByRole("button", { name: "Shell task 2", exact: true });
      const secondRow = drawer.getByRole("listitem").filter({
        has: page.getByRole("button", { name: "Shell task 2", exact: true }),
      });
      const rowError = secondRow.locator('[data-task-error-indicator="true"]');
      const shellError = page.locator('[data-menu-error-indicator="true"]');

      const removeSecondTask = async (attempt: string) => {
        recorder.phase(`${attempt}-remove-menu`);
        await activateProductControl(
          page,
          drawer.getByRole("button", { name: "More options for Shell task 2", exact: true }),
        );
        const menu = page.getByRole("menu", { name: "More options for Shell task 2", exact: true });
        const remove = menu.getByRole("menuitem", { name: "Remove from list", exact: true });
        await expect(menu).toBeVisible();
        await expect(remove).toBeEnabled();
        await page.keyboard.press("Home");
        await expect(remove).toBeFocused();
        await record(`${attempt}-remove-menu`, "More options for Shell task 2 → Home");
        recorder.phase(`${attempt}-remove-result`);
        await page.keyboard.press("Enter");
        await expect(menu).toBeHidden();
      };

      await expect(drawer).toHaveCount(0);
      await expect(menuTrigger).toBeVisible();
      await expect(shellError).toHaveCount(0);
      await activateProductControl(page, menuTrigger);
      await expect(drawer).toBeVisible();
      await expect(secondTask).toBeVisible();
      await expect(rowError).toHaveCount(0);

      if (storyId === "app-shell-active-tasks--navigation-failure") {
        recorder.phase("navigation-failure-result");
        await activateProductControl(page, secondTask);
        await expect(drawer).toBeHidden();
        await expect(shellError).toBeVisible();
        await record("navigation-failed-landing", "Shell task 2 → first navigation rejection");
        await focusProductControl(page, menuTrigger);
        await record("navigation-failed-menu-trigger", "Tab → Menu with error Badge");
        await activateProductControl(page, menuTrigger);
        await expect(drawer).toBeVisible();
        await expect(rowError).toBeVisible();
        await focusProductControl(page, secondTask);
        await record("navigation-failed-row", "Tab → Shell task 2 with error Badge");

        recorder.phase("navigation-retry-result");
        await activateProductControl(page, secondTask);
        await expect(drawer).toBeHidden();
        await expect(shellError).toHaveCount(0);
        await expect(
          page.getByRole("heading", { level: 1, name: "Shell task 2", exact: true }),
        ).toBeVisible();
        await record("navigation-recovered-landing", "Shell task 2 → retry navigation");
        await focusProductControl(page, menuTrigger);
        await record("navigation-recovered-menu-trigger", "Tab → Menu after error clears");
        await activateProductControl(page, menuTrigger);
        await expect(drawer).toBeVisible();
        await expect(rowError).toHaveCount(0);
        await expect(secondTask).toHaveAttribute("aria-current", "true");
        await focusProductControl(page, secondTask);
        await record("navigation-recovered-row", "Tab → current Shell task 2 after error clears");
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
        await expect(menuTrigger).toBeFocused();
        await record("navigation-drawer-restored", "Navigation → Escape");
      } else {
        await removeSecondTask("first");
        recorder.phase("removal-failure-result");
        await expect(drawer).toBeVisible();
        await expect(secondTask).toBeVisible();
        await expect(rowError).toBeVisible();
        await expect(shellError).toBeVisible();
        await record("removal-failed-landing", "Remove from list → first detach rejection");
        await focusProductControl(page, secondTask);
        await record("removal-failed-row", "Tab → retained Shell task 2 with error Badge");

        await removeSecondTask("retry");
        recorder.phase("removal-retry-result");
        await expect(secondTask).toHaveCount(0);
        await expect(shellError).toHaveCount(0);
        await expect(drawer).toBeVisible();
        await expect(
          drawer.getByRole("button", { name: "Shell task one", exact: true }),
        ).toBeVisible();
        await expect(
          drawer.getByRole("button", { name: "Shell task 3", exact: true }),
        ).toBeVisible();
        await record("removal-recovered-landing", "Remove from list → retry removes Shell task 2");
        await record("removal-recovered-neighbors", "Tab through remaining task controls", true);
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
        await expect(menuTrigger).toBeFocused();
        await record("removal-drawer-restored", "Navigation → Escape after removal");
      }
    },
  );
}
