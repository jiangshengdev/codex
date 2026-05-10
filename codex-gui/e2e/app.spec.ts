import { test, expect } from "@playwright/test";

test("renders the counter page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("Count")).toHaveText("0");
  await expect(page.getByRole("textbox", { name: /Set increment amount/ })).toHaveValue("2");
});

test("updates the counter value", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Increment value").click();
  await expect(page.getByLabel("Count")).toHaveText("1");

  await page.getByLabel("Decrement value").click();
  await expect(page.getByLabel("Count")).toHaveText("0");
});

test("renders the not found page for unmatched routes", async ({ page }) => {
  await page.goto("/missing");

  await expect(page.getByText("404")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
