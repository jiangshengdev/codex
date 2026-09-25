import { expect, test } from "@playwright/test";
import { storybookOrigin } from "./servers";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`global errors stay accessible throughout a long page at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--retained-disconnection`,
    );
    const issues = page.getByRole("region", { name: "Active issues", exact: true });
    await expect(issues).toContainText("Connection closed");
    await expect(issues.getByText("1 active issue", { exact: true })).toBeVisible();
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((value) => {
        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value);
      }, fraction);
      await expect(issues.getByRole("button", { name: "Reconnect", exact: true })).toBeInViewport();
    }
  });
}
