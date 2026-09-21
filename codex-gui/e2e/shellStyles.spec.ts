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
  });
}
