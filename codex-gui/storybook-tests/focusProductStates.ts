import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  observeCurrentFocus,
  observeKeyboardFocus,
  observeScrollBoundaryFocus,
  isProductElement,
} from "./focusObservation";
import { observePendingStates } from "./focusPendingStates";
import { activateProductControl } from "./focusKeyboardActions";

/** Product overlay routes shared by the existing scenario tests. */
export async function observeProductOverlays(page: Page, testInfo: TestInfo, story: string) {
  const queueRoute = /^(Queued|Guide|Priority) \d+$/;
  const routes = [
    /^Menu$/,
    /^Scan with phone$/,
    /^View diagnostic information$/,
    /^Working directory:/,
    /^Failure details for /,
    queueRoute,
  ];
  const states: { state: string; trigger: string; observations: number }[] = [];
  // Preset dialogs already own focus. Their states are visited by the pending
  // and reading routes; pressing a background trigger cannot open a second one.
  if ((await page.getByRole("dialog").count()) > 0) return states;
  for (const [routeIndex, route] of routes.entries()) {
    const triggers =
      route === queueRoute
        ? page.getByRole("group", { name: /^Pending:/ }).getByRole("button", { name: route })
        : page.getByRole("button", { name: route });
    const count = await triggers.count();
    for (let index = 0; index < count; index += 1) {
      const trigger = triggers.nth(index);
      if (
        !(await trigger.isVisible()) ||
        !(await trigger.isEnabled()) ||
        !(await trigger.evaluate(isProductElement))
      )
        continue;
      const name = (await trigger.getAttribute("aria-label")) ?? (await trigger.innerText());
      const previousDialogs = await page.getByRole("dialog").count();
      const previousMenus = await page.getByRole("menu").count();
      await activateProductControl(page, trigger);
      await expect
        .poll(
          async () =>
            (await page.getByRole("dialog").count()) > previousDialogs ||
            (await page.getByRole("menu").count()) > previousMenus,
        )
        .toBe(true);
      const state = `${story}-overlay-${String(routeIndex)}-${String(index)}`;
      const observations = await observeKeyboardFocus(page, testInfo, state);
      states.push({ state, trigger: name, observations: observations.length });
      const bodies = page.getByRole("dialog").locator(".drawer__body");
      for (let body = 0; body < (await bodies.count()); body += 1) {
        await observeScrollBoundaryFocus(
          page,
          testInfo,
          `${state}-drawer-${String(body)}`,
          bodies.nth(body),
        );
      }
      states.push(...(await observePendingStates(page, testInfo, state)));
      const taskMenus = page.getByRole("button", { name: /^More options for / });
      const taskMenuCount = await taskMenus.count();
      for (let taskIndex = 0; taskIndex < taskMenuCount; taskIndex += 1) {
        const taskTrigger = taskMenus.nth(taskIndex);
        await activateProductControl(page, taskTrigger);
        const menu = page.getByRole("menu");
        await expect(menu).toHaveCount(1);
        await expect(menu).toBeVisible();
        await page.keyboard.press("Home");
        const menuItems = await menu.getByRole("menuitem").count();
        for (let item = 0; item < menuItems; item += 1) {
          const menuState = `${state}-task-${String(taskIndex)}-item-${String(item)}`;
          const result = await observeCurrentFocus(page, testInfo, menuState);
          states.push({ state: menuState, trigger: "Task actions", observations: result.length });
          await page.keyboard.press("ArrowDown");
        }
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(taskTrigger).toBeFocused();
      }
      await page.keyboard.press("Escape");
      await expect
        .poll(
          async () =>
            (await page.getByRole("dialog").count()) === previousDialogs &&
            (await page.getByRole("menu").count()) === previousMenus,
        )
        .toBe(true);
      await expect(trigger).toBeFocused();
      const restored = await observeCurrentFocus(page, testInfo, `${state}-restored`);
      states.push({ state: `${state}-restored`, trigger: name, observations: restored.length });
    }
  }
  return states;
}
