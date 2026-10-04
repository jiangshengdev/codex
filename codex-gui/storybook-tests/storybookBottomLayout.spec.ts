import { expect, test } from "@playwright/test";
import { readTaskBottomRegionViewport } from "../src/features/taskLayout/taskBottomRegionLayout";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`history keeps its last turn readable after continuation failure grows the bottom panel at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      "/iframe.html?id=history-detail--long-content-continuation-failure&viewMode=story",
    );
    const action = page.getByRole("button", { name: "Continue this task", exact: true });
    await expect(action).toBeEnabled();
    const panel = page.getByRole("complementary");
    const initialHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);
    await action.click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect
      .poll(() => panel.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(initialHeight);
    // The fixed panel can grow before its measured document spacer is committed.
    await expect
      .poll(() =>
        page
          .getByRole("main")
          .evaluate<ReturnType<typeof readTaskBottomRegionViewport>, undefined, HTMLElement>(
            readTaskBottomRegionViewport,
          ),
      )
      .toMatchObject({ ready: true });
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect
      .poll(async () => {
        const end = await page
          .getByRole("article")
          .last()
          .evaluate((element) => element.getBoundingClientRect().bottom);
        const top = await panel.evaluate((element) => element.getBoundingClientRect().top);
        return end > 0 && end <= top;
      })
      .toBe(true);
    await expect(action).toBeInViewport();
  });

  test(`current task keeps its last turn readable when the composer grows at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/iframe.html?id=feedback-task-recovery--recovered&viewMode=story");
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toBeVisible();
    const panel = page.getByRole("region", { name: "Message composer", exact: true });
    const initialHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);
    await editor.fill("A longer draft line\n".repeat(16));
    await expect
      .poll(() => panel.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(initialHeight);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect
      .poll(async () => {
        const end = await page
          .getByRole("article")
          .last()
          .evaluate((element) => element.getBoundingClientRect().bottom);
        const top = await panel.evaluate((element) => element.getBoundingClientRect().top);
        return end > 0 && end <= top;
      })
      .toBe(true);
    await expect(editor).toHaveText("A longer draft line\n".repeat(16));
  });
}
