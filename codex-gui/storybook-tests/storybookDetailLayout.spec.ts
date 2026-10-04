import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  for (const story of [
    "feedback-task-recovery--partial-recovery",
    "feedback-message-synchronization--backpressure",
    "history-fork--page-coexistence",
  ]) {
    test(`${story} covers transcript shadows while scrolling at ${String(width)}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/iframe.html?id=${story}&viewMode=story`);
      const notices = page.getByRole("region", { name: "Page notices", exact: true });
      await expect(notices).toBeVisible();
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight / 2);
      });
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
      const card = notices.locator('[role="alert"], [role="status"]').first();
      const bounds = await card.evaluate((element) => {
        const { x, y, width } = element.getBoundingClientRect();
        return { x, y, width };
      });
      // The opaque floating surface must cover the gutter beyond the card,
      // where the transcript's surface shadow extends during page scrolling.
      for (const x of [bounds.x - 4, bounds.x + bounds.width + 4]) {
        const covered = await page.evaluate(
          ({ x, y }) =>
            document.elementsFromPoint(x, y).some((element) => {
              const style = getComputedStyle(element);
              return style.position === "sticky" && style.backgroundColor !== "rgba(0, 0, 0, 0)";
            }),
          { x, y: bounds.y + 4 },
        );
        expect(covered).toBe(true);
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await testInfo.attach("scrolled-detail", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    });
  }
}
