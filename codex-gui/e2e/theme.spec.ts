import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("the product keeps following the system without a theme control", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radiogroup", { name: "Theme preference" })).toHaveCount(0);
});
