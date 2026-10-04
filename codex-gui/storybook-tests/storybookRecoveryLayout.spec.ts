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
  test(`task operation failures share the floating region and retain independent recovery at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-message-synchronization--task-operations&viewMode=story`,
    );
    const notices = page.getByRole("region", { name: "Page notices", exact: true });
    await expect(notices.getByRole("alert")).toHaveCount(3);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    const remove = notices.getByRole("button", { name: "Remove task", exact: true });
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((position) => {
        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * position);
      }, fraction);
      await notices.focus();
      await notices.press("End");
      await expect(remove).toBeInViewport({ ratio: 1 });
      await expect.poll(() => page.evaluate(() => window.scrollY > 800)).toBe(fraction > 0);
    }
    await notices.getByRole("button", { name: "Open task", exact: true }).click();
    await expect(notices.getByText("The task could not be opened.", { exact: true })).toHaveCount(
      0,
    );
    await expect(remove).toBeEnabled();
    const diagnostic = notices
      .getByRole("alert")
      .filter({ hasText: "The task could not be removed." })
      .getByRole("button", { name: "View diagnostic information", exact: true });
    await diagnostic.click();
    await expect(page.getByRole("dialog")).toContainText("STORYBOOK_REMOVE_TASK_FAILED");
    await page.keyboard.press("Escape");
    await expect(diagnostic).toBeFocused();
  });

  test(`synchronization recovery stays reachable with task recovery at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-message-synchronization--connection-unavailable&viewMode=story`,
    );
    const notices = page.getByRole("region", { name: "Page notices", exact: true });
    const sync = notices.getByRole("button", { name: "Restore sync", exact: true });
    await expect(sync).toBeDisabled();
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await notices.focus();
    await notices.press("End");
    await expect(sync).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => window.scrollY > 800)).toBe(true);
    const diagnostics = notices
      .getByRole("alert")
      .filter({ hasText: "Message synchronization paused" })
      .getByRole("button", { name: "View diagnostic information", exact: true });
    await diagnostics.focus();
    await diagnostics.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("backpressure");
    await page.keyboard.press("Escape");
    await expect(diagnostics).toBeFocused();
  });

  test(`retained page keeps both recovery notices reachable while reading at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--retained-disconnection&viewMode=story`,
    );
    const reconnect = page.getByRole("button", { name: "Reconnect", exact: true });
    const restore = page.getByRole("button", { name: "Restore task", exact: true });
    const notices = page.getByRole("region", { name: "Page notices", exact: true });
    await expect(restore).toBeVisible();
    await expect(notices.getByRole("status")).toHaveCount(2);
    const readBounds = (element: HTMLElement | SVGElement) => {
      const { x, width } = element.getBoundingClientRect();
      return { x, width };
    };
    const main = await page.getByRole("main").evaluate(readBounds);
    const noticeBounds = await notices.getByRole("status").first().evaluate(readBounds);
    expect(noticeBounds.x).toBeCloseTo(main.x, 0);
    expect(noticeBounds.width).toBeCloseTo(main.width, 0);
    for (const position of [0, 0.5, 1]) {
      await page.evaluate((fraction) => {
        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction);
      }, position);
      await expect(reconnect).toBeInViewport();
      await restore.scrollIntoViewIfNeeded();
      await expect(restore).toBeInViewport({ ratio: 1 });
      // Reaching a notice must scroll its region, not send the reader back to the page top.
      await expect.poll(() => page.evaluate(() => window.scrollY > 800)).toBe(position > 0);
    }
    await reconnect.click();
    const diagnostic = notices.getByRole("button", {
      name: "View diagnostic information",
      exact: true,
    });
    await expect(diagnostic).toBeVisible();
    await notices.focus();
    await notices.press("End");
    await expect(restore).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => window.scrollY > 800)).toBe(true);
    await expect
      .poll(() =>
        notices.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.bottom < innerHeight / 2 && document.documentElement.scrollWidth <= innerWidth
          );
        }),
      )
      .toBe(true);
    await diagnostic.focus();
    await diagnostic.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("STORYBOOK_RECONNECT_FAILED");
    await page.keyboard.press("Escape");
    await expect(diagnostic).toBeFocused();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

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
