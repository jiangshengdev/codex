import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`long user text preserves literal syntax and remains reachable at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=transcript-long-user-message--long-user-message`,
    );
    const transcript = page.getByRole("region", { name: "Committed transcript" });
    await expect(transcript).toContainText("# A long user request");
    await expect(transcript).toContainText("**Keep this syntax literal.**");
    await expect(transcript).toContainText("[This is user text](https://example.com)");
    await expect(transcript.getByRole("heading")).toHaveCount(0);
    await expect(transcript.getByRole("link")).toHaveCount(0);
    expect((await transcript.innerText()).match(/Request paragraph \d+:/g)).toHaveLength(32);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBe(0);

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect
      .poll(() =>
        transcript.evaluate((element) => {
          const marker = "End of the long user request.";
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const index = node.textContent?.indexOf(marker) ?? -1;
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + marker.length);
            const bounds = range.getBoundingClientRect();
            return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
          }
          return false;
        }),
      )
      .toBe(true);
  });
}
