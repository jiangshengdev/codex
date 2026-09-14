import { expect, test } from "@playwright/test";
import { createPersistenceHarness, persistenceThreadId } from "./persistenceHarness";

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(locale, () => {
    test.use({ locale });

    test("retains the product shell layout and theme colors", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await createPersistenceHarness(page);
      await page.goto(`/task/${persistenceThreadId}#token=e2e-secret-token`);
      await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "initialized");
      const shell = page.locator("[data-app-shell-content-layout]");
      await expect(shell).toBeVisible();
      await expect(shell).toHaveCSS("display", "flex");
      await expect(shell).toHaveCSS("flex-direction", "column");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const lightBackground = await shell.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(lightBackground).not.toBe("rgba(0, 0, 0, 0)");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect
        .poll(() => shell.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(lightBackground);
    });

    test("retains the demo container width and real theme control styles", async ({ page }) => {
      await page.goto(
        "http://localhost:6006/iframe.html?id=composer-pending-input-browsing--queued",
      );
      const draft = page.getByRole("textbox", {
        name: locale === "en" ? "Main draft" : "主输入草稿",
        exact: true,
      });
      const surface = page.locator(".surface").filter({ has: draft });
      await expect(surface).toBeVisible();
      await expect(surface).toHaveCSS("display", "grid");
      await expect(surface).toHaveCSS("max-width", "672px");
      const themes = page.getByRole("radiogroup", {
        name: locale === "en" ? "Theme preference" : "主题偏好",
      });
      await expect(themes).toBeVisible();
      await expect(themes).toHaveCSS("display", "flex");
      await expect(themes).toHaveCSS("align-items", "center");
      await expect(themes.getByRole("radio")).toHaveCount(3);
      const light = page.getByRole("radio", {
        name: locale === "en" ? "Light theme" : "浅色主题",
      });
      await light.click();
      await expect(light).toBeChecked();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      const dark = page.getByRole("radio", {
        name: locale === "en" ? "Dark theme" : "深色主题",
      });
      await dark.click();
      await expect(dark).toBeChecked();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.setViewportSize({ width: 375, height: 667 });
      await expect
        .poll(() => surface.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
    });
  });
}
