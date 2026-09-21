import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`message replay steps, pauses and resets at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-messages--streaming`);
    const transcript = page.getByRole("region", { name: "Committed transcript" });
    await expect(transcript).toContainText("Explain this fictional change.");
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(transcript).toContainText("The first part");
    await page.getByRole("button", { name: "Play replay", exact: true }).click();
    await page.clock.runFor(1200);
    await page.getByRole("button", { name: "Pause replay", exact: true }).click();
    await expect(transcript).toContainText("The second part");
    const pausedText = await transcript.innerText();
    await page.clock.runFor(5000);
    await expect(transcript).toHaveText(pausedText, { useInnerText: true });
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(transcript).toContainText("Replay complete.");
    await expect(page.getByRole("button", { name: "Next step", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Reset replay", exact: true }).click();
    await expect(transcript).not.toContainText("The first part");
    await expect(transcript).not.toContainText("Replay complete.");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}

test("direct states and story switching discard a running replay", async ({ page }) => {
  await page.goto(`${storybookOrigin}/?path=/story/transcript-messages--first-delta`);
  const preview = page.frameLocator("#storybook-preview-iframe");
  const transcript = preview.getByRole("region", { name: "Committed transcript" });
  await expect(transcript).toContainText("The first part");
  await expect(transcript).not.toContainText("The second part");
  await preview.getByRole("button", { name: "Play replay", exact: true }).click();
  await page.getByRole("link", { name: "User Message", exact: true }).click();
  await expect(transcript).toContainText("# Keep user syntax literal.");
  await expect(transcript.getByRole("heading")).toHaveCount(0);
  await page.getByRole("link", { name: "Assistant Text", exact: true }).click();
  await expect(transcript).toContainText("A second paragraph");
  await expect(transcript).not.toContainText("The first part");
  await page.getByRole("link", { name: "Completed", exact: true }).click();
  await expect(transcript).toContainText("Replay complete.");
  await page.getByRole("link", { name: "Streaming", exact: true }).click();
  await expect(transcript).not.toContainText("The first part");
  await expect(preview.getByRole("button", { name: "Play replay", exact: true })).toBeEnabled();
});
