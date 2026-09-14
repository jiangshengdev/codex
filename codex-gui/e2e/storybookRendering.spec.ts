import { expect, test } from "@playwright/test";

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(locale, () => {
    test.use({ locale });

    test("renders the real diagnostic component with application styles and language", async ({
      page,
    }) => {
      await page.goto("http://localhost:6006/iframe.html?id=environment-rendering--diagnostics");
      const trigger = page.getByRole("button", {
        name: locale === "en" ? "View diagnostic information" : "查看诊断信息",
      });
      await expect(trigger).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(trigger).toHaveCSS("display", "inline-flex");
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText("Storybook rendering environment");
    });
  });
}
