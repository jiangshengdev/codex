import { expect, test } from "@playwright/test";

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(locale, () => {
    test.use({ locale });

    test("loads product theme messages and demo controls together", async ({ page }) => {
      await page.goto(
        "http://localhost:6006/iframe.html?id=feedback-connection-recovery-interactions--success&viewMode=story",
      );
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(
        page.getByRole("radiogroup", { name: locale === "en" ? "Theme preference" : "主题偏好" }),
      ).toBeVisible();
      const reconnect = page.getByRole("button", {
        name: locale === "en" ? "Reconnect" : "重新连接",
        exact: true,
      });
      const restart = page.getByRole("button", {
        name: locale === "en" ? "Restart simulation" : "重新开始演示",
        exact: true,
      });
      await expect(reconnect).toBeVisible();
      await expect(restart).toBeVisible();
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      await reconnect.click();
      await page.clock.runFor(2_000);
      await expect(reconnect).toHaveCount(0);
      await restart.click();
      await expect(reconnect).toBeVisible();
    });
  });
}
