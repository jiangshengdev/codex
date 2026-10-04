import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(locale, () => {
    test.use({ locale });

    test("localizes the product reconnect action and completes recovery", async ({ page }) => {
      await page.goto(
        `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-interactions--success&viewMode=story`,
      );
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const reconnect = page.getByRole("button", {
        name: locale === "en" ? "Reconnect" : "重新连接",
        exact: true,
      });
      await expect(reconnect).toBeVisible();
      await installPausedClock(page);
      await reconnect.click();
      await page.clock.runFor(2_000);
      await expect(reconnect).toHaveCount(0);
    });
  });
}
