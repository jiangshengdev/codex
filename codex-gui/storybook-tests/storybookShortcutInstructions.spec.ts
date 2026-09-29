import { expect, test } from "@playwright/test";
import {
  DEV_VISIBILITY_CHANGED,
  type DevVisibility,
} from "../src/storybook/environment/devVisibility";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  for (const story of [
    "app-shell-shortcuts-focus--toggle-menu",
    "app-shell-shortcuts-tasks--previous-task",
    "new-session-shortcuts-open--from-task",
  ]) {
    test(`${story} keeps instructions below the header without DEV at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/iframe.html?id=${story}`);
      const header = page.getByRole("banner");
      await expect(header).toBeVisible();
      await page.evaluate(
        ({ event, visibility }) => {
          const preview = window as typeof window & {
            __STORYBOOK_ADDONS_CHANNEL__: { emit: (name: string, value: DevVisibility) => void };
          };
          preview.__STORYBOOK_ADDONS_CHANNEL__.emit(event, visibility);
        },
        { event: DEV_VISIBILITY_CHANGED, visibility: { visible: false } },
      );
      // Wait for the setup operation to finish before measuring the instructions.
      await page
        .getByRole("group", { name: "DEV", exact: true })
        .first()
        .waitFor({ state: "hidden" });
      const instructions = page.getByRole("region", { name: "Shortcut instructions" });
      await expect(instructions).toBeInViewport();
      const headerBottom = await header.evaluate(
        (element) => element.getBoundingClientRect().bottom,
      );
      const keys = instructions.locator("p").first();
      await expect
        .poll(() => keys.evaluate((element) => element.getBoundingClientRect().top))
        .toBeGreaterThanOrEqual(headerBottom);
      const bounds = await instructions.evaluate((element) => {
        const { left, right, bottom } = element.getBoundingClientRect();
        return { left, right, bottom };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.bottom).toBeLessThanOrEqual(800);
    });
  }
}
