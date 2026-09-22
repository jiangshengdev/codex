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
    await expect(canvas.getByRole("button", { name: "Restart simulation" })).toHaveCount(0);
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
    await dev.click();
    await canvas.getByRole("button", { name: "Restart simulation" }).click();
    await expect(canvas.getByText("Unable to start Codex GUI", { exact: true })).toBeVisible();
    await dev.click();
    await expect(canvas.getByRole("button", { name: "Restart simulation" })).toHaveCount(0);
  });

  test(`all standalone pages preserve viewport layout and DEV switching at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const id of fullPageStories) {
      await test.step(id, async () => {
        await page.goto(`${storybookOrigin}/iframe.html?id=${id}&viewMode=story`);
        const menu = page.getByRole("button", { name: "Menu", exact: true });
        await expect(menu).toBeVisible();
        for (const visible of [true, false, true, false]) {
          // Exercise the existing addon protocol in the standalone document,
          // which has no manager toolbar of its own.
          await page.evaluate(
            ({ event, visibility }) => {
              const previewWindow = window as typeof window & {
                __STORYBOOK_ADDONS_CHANNEL__: {
                  emit: (name: string, value: DevVisibility) => void;
                };
              };
              previewWindow.__STORYBOOK_ADDONS_CHANNEL__.emit(event, visibility);
            },
            { event: DEV_VISIBILITY_CHANGED, visibility: { visible } satisfies DevVisibility },
          );
          await expect(page.getByRole("button", { name: "Restart simulation" })).toHaveCount(
            visible ? 1 : 0,
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
        }
      });
    }
  });

  for (const id of fullPageStories) {
    test(`embedded ${id} keeps its menu usable when DEV toggles at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${storybookOrigin}/?path=/story/${id}`);
      const canvas = page.frameLocator("#storybook-preview-iframe");
      const menu = canvas.getByRole("button", { name: "Menu", exact: true });
      await expect(menu).toBeVisible();
      const toggle = page.getByRole("switch", { name: "Show DEV controls" });
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      for (const visible of [false, true, false, true]) {
        await toggle.click();
        await expect(canvas.getByRole("button", { name: "Restart simulation" })).toHaveCount(
          visible ? 1 : 0,
        );
        await menu.click();
        await expect(canvas.getByRole("dialog")).toBeVisible();
        await expect(
          canvas.getByRole("dialog").getByRole("button", { name: "Close", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(canvas.getByRole("dialog")).toBeHidden();
        await expect(menu).toBeFocused();
      }
    });
  }
}
