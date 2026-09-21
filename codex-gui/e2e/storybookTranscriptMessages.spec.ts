import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`streaming message renders successive deltas at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-messages--streaming`);
    const transcript = page.getByRole("region", { name: "Committed transcript" });
    await expect(transcript).toContainText("Explain this fictional change.");
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(transcript).toContainText("The first part");
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(transcript).toContainText("The second part");
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(transcript).toContainText("Replay complete.");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}

test("message states preserve user syntax and assistant content", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=transcript-messages--first-delta`);
  const transcript = page.getByRole("region", { name: "Committed transcript" });
  await expect(transcript).toContainText("The first part");
  await expect(transcript).not.toContainText("The second part");
  await page.goto(`${storybookOrigin}/iframe.html?id=transcript-messages--user-message`);
  await expect(transcript).toContainText("# Keep user syntax literal.");
  await expect(transcript.getByRole("heading")).toHaveCount(0);
  await page.goto(`${storybookOrigin}/iframe.html?id=transcript-messages--assistant-text`);
  await expect(transcript).toContainText("A second paragraph");
});
