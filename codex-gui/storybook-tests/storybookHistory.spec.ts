import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("history opens the selected detail and continues into the authoritative task", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=history-flow--success&viewMode=story");
  const card = page.getByRole("link", { name: "Investigate history recovery", exact: true });
  await expect(card).toBeVisible();
  await card.press("Enter");
  await expect(page.locator("[data-history-route]")).toHaveAttribute(
    "data-history-route",
    "/history/00000000-0000-0000-0000-000000000102",
  );
  await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue this task", exact: true }).press("Enter");
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  await expect(page.locator("[data-history-route]")).toHaveAttribute(
    "data-history-route",
    "/task/00000000-0000-0000-0000-000000000103",
  );
  await expect(page.locator("[data-history-depth]")).toHaveAttribute("data-history-depth", "2");
  await expect(page.locator("[data-history-activations]")).toHaveAttribute(
    "data-history-activations",
    "1",
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
