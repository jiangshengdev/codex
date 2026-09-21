import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  for (const story of ["image-only", "mixed-content", "markdown-image-boundary"]) {
    test(`${story} previews the real attachment at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${storybookOrigin}/iframe.html?id=transcript-images--${story}`);
      const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
      const preview = transcript.getByRole("button", { name: "Preview sample.png", exact: true });
      await expect(preview).toHaveCount(1);
      await expect(preview).toBeVisible();
      await expect
        .poll(() =>
          preview.locator("img").evaluate((image: HTMLImageElement) => ({
            complete: image.complete,
            width: image.naturalWidth,
            height: image.naturalHeight,
          })),
        )
        .toEqual({ complete: true, width: 320, height: 180 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await preview.click();
      const dialog = page.getByRole("dialog", { name: "sample.png", exact: true });
      const image = dialog.getByRole("img", { name: "sample.png", exact: true });
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) => element.complete && element.naturalWidth === 320,
          ),
        )
        .toBe(true);
      const bounds = await dialog.evaluate((element) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }));
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      await page.getByRole("button", { name: "Close image preview", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(preview).toBeFocused();
    });
  }

  test(`mixed content order and Markdown image boundary at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-images--mixed-content`);
    const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
    const userText = transcript
      .locator(".committed-transcript-entry-source")
      .filter({ has: page.getByRole("button", { name: "Preview sample.png", exact: true }) });
    await expect(userText).toContainText("中文🙂 text before the attachment: sample.png");
    expect(await userText.innerText()).toMatch(
      /before the attachment:\s+sample\.png\s+Adjacent text/,
    );
    await expect(transcript.getByRole("table")).toContainText("Rectangle");
    await expect(transcript.locator("pre")).toContainText("rectangle + circle");
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-images--markdown-image-boundary`);
    await expect(transcript).toContainText("Text after the disabled image remains readable.");
    await expect(transcript.locator(".committed-transcript-entry-markdown img")).toHaveCount(0);
  });
}
