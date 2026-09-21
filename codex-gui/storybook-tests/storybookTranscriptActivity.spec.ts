import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`reasoning and tool updates collapse on completion at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-activity--reasoning-streaming`);
    const transcript = page.getByRole("region", { name: "Committed transcript" });
    await expect(transcript).toContainText("Inspecting the request");
    const next = page.getByRole("button", { name: "Next step", exact: true });
    await next.click();
    await expect(transcript).toContainText("Checking the visible states");
    await next.click();
    await expect(transcript).toContainText("Transcript reviewer");
    await next.click();
    await expect(transcript).toContainText("Review complete");
    await next.click();
    await expect(transcript).toContainText("The review is complete.");
    await expect(transcript).not.toContainText("Checking the visible states");
    const disclosure = transcript.getByRole("button", { name: /Intermediate updates/ });
    await disclosure.click();
    await expect(transcript).toContainText("Checking the visible states");
    await expect(transcript).toContainText("Review complete");
    await disclosure.click();
    await expect(transcript).not.toContainText("Checking the visible states");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}
