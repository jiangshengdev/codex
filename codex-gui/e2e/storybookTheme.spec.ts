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

test("selects a temporary theme preference and resumes following the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("http://localhost:6006/iframe.html?id=environment-rendering--diagnostics");
  const system = page.getByRole("radio", { name: "System theme" });
  const light = page.getByRole("radio", { name: "Light theme" });
  const dark = page.getByRole("radio", { name: "Dark theme" });
  await expect(system).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await light.click();
  await expect(light).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await dark.click();
  await expect(dark).toBeChecked();
  await system.click();
  await expect(system).toBeChecked();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await system.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dark).toBeFocused();
  await page.keyboard.press("Space");
  await expect(dark).toBeChecked();
  await page.reload();
  await expect(system).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("a newly opened preview starts with the system preference", async ({ page, context }) => {
  await page.goto("http://localhost:6006/iframe.html?id=environment-rendering--diagnostics");
  await page.getByRole("radio", { name: "Dark theme" }).click();
  const reopened = await context.newPage();
  await reopened.emulateMedia({ colorScheme: "light" });
  await reopened.goto("http://localhost:6006/iframe.html?id=environment-rendering--diagnostics");
  await expect(reopened.getByRole("radio", { name: "System theme" })).toBeChecked();
  await expect(reopened.locator("html")).toHaveAttribute("data-theme", "light");
  await reopened.close();
});
