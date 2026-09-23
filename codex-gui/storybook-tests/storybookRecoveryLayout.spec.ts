import { expect, test } from "@playwright/test";
import { storybookOrigin } from "./servers";
import {
  DEV_VISIBILITY_CHANGED,
  type DevVisibility,
} from "../src/storybook/environment/devVisibility";

test.use({ locale: "en" });

const fullPageStories = [
  "feedback-connection-recovery-pages--retained-disconnection",
  "feedback-connection-recovery-pages--startup-failure",
  "feedback-task-recovery--partial-recovery",
  "feedback-task-recovery--recovered",
  "feedback-message-synchronization--backpressure",
  "feedback-message-synchronization--commit-chain-mismatch",
  "feedback-message-synchronization--missing-turn",
  "feedback-message-synchronization--restoring",
  "feedback-message-synchronization--failed",
  "feedback-message-synchronization--connection-unavailable",
];

for (const width of [375, 1280]) {
  test(`startup page has no preview-created scroll or inset at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/?path=/story/feedback-connection-recovery-pages--startup-failure`,
    );
    const canvas = page.frameLocator("#storybook-preview-iframe");
    await expect(canvas.getByText("Unable to start Codex GUI", { exact: true })).toBeVisible();
    const dev = page.getByRole("switch", { name: "Show DEV controls" });
    await dev.click();
    await expect
      .poll(() =>
        canvas.locator("body").evaluate((body) => {
          const bounds = body.getBoundingClientRect();
          return {
            fillsViewport: bounds.left === 0 && bounds.width === window.innerWidth,
            overflow: document.documentElement.scrollHeight > window.innerHeight,
            padding: getComputedStyle(body).padding,
          };
        }),
      )
      .toEqual({ fillsViewport: true, overflow: false, padding: "0px" });
    await canvas.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(canvas.getByRole("dialog")).toBeHidden();
  });

  test(`all standalone pages preserve viewport layout and menu interaction at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const id of fullPageStories) {
      await test.step(id, async () => {
        await page.goto(`${storybookOrigin}/iframe.html?id=${id}&viewMode=story`);
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        await expect(menu).toBeVisible();
        // Hide preview controls before checking the product layout.
        await page.evaluate(
          ({ event, visibility }) => {
            const previewWindow = window as typeof window & {
              __STORYBOOK_ADDONS_CHANNEL__: {
                emit: (name: string, value: DevVisibility) => void;
              };
            };
            previewWindow.__STORYBOOK_ADDONS_CHANNEL__.emit(event, visibility);
          },
          { event: DEV_VISIBILITY_CHANGED, visibility: { visible: false } satisfies DevVisibility },
        );
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await expect(menu).toBeInViewport();
        await expect
          .poll(() =>
            page.locator("body").evaluate((body) => ({
              padding: getComputedStyle(body).padding,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            })),
          )
          .toEqual({ padding: "0px", horizontalOverflow: false });
        await menu.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(menu).toBeFocused();
      });
    }
  });
}
