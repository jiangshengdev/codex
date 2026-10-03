import { expect, test } from "@playwright/test";

test.use({ locale: "en", viewport: { width: 480, height: 720 } });

test("unmatched page returns to the history placeholder without opening external support", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-not-found--unmatched&viewMode=story");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const support = page.getByRole("link", { name: "Contact support" });
  await expect(support).toHaveAttribute("href", /^mailto:/);
  await support.focus();
  await expect(support).toBeFocused();
  await page.getByRole("button", { name: "Go back home" }).press("Enter");
  await expect(page.getByRole("main")).toHaveText("/history");
});

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(`simulated phone ${locale}`, () => {
    test.use({ locale, viewport: { width: 375, height: 812 }, hasTouch: true });

    test("page and auxiliary entry remain reachable by touch and keyboard", async ({ page }) => {
      await page.goto("/iframe.html?id=app-shell-not-found--unmatched&viewMode=story");
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
      const back = main.getByRole("button");
      const support = main.getByRole("link");
      await expect(back).toBeInViewport();
      await expect(support).toBeInViewport();
      await expect(support).toHaveAttribute("href", /^mailto:/);
      await back.focus();
      await page.keyboard.press("Tab");
      await expect(support).toBeFocused();
      await expect
        .poll(() => main.evaluate((element) => element.scrollWidth <= innerWidth))
        .toBe(true);
      await back.tap();
      await expect(main).toHaveText("/history");
    });
  });
}
