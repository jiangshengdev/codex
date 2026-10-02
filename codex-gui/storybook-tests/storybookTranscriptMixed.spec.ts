import { storybookOrigin } from "./servers";
import { expect, test, type Locator } from "@playwright/test";

test.use({ locale: "en" });

// Scrolling activates deferred code-block layout, which can move the click target.
async function scrollIntoStableView(target: Locator) {
  let previousBounds: string | undefined;
  await expect
    .poll(
      async () => {
        await target.scrollIntoViewIfNeeded();
        const bounds = await target.boundingBox();
        const serializedBounds = JSON.stringify(bounds);
        const stable = bounds !== null && serializedBounds === previousBounds;
        previousBounds = serializedBounds;
        return stable;
      },
      { intervals: [300] },
    )
    .toBe(true);
}

for (const width of [375, 1280]) {
  test(`streaming long answer grows and remains readable at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-mixed--replay`);
    const transcript = page.getByRole("region", { name: "Committed transcript" });
    const lastHeading = transcript.getByRole("heading", { name: "Section 32", exact: true });
    await expect(transcript.getByRole("heading", { name: "Section 4", exact: true })).toBeVisible();
    await expect(lastHeading).toHaveCount(0);
    const height = await transcript.evaluate((element) => element.scrollHeight);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(
      transcript.getByRole("heading", { name: "Section 16", exact: true }),
    ).toBeAttached();
    expect(await transcript.evaluate((element) => element.scrollHeight)).toBeGreaterThan(height);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await lastHeading.scrollIntoViewIfNeeded();
    await expect(lastHeading).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });

  test(`mixed code and table scroll inside the reading surface at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-mixed--completed`);
    for (const [pageNumber, selector] of [
      [1, "pre"],
      [2, "table"],
    ] as const) {
      await page
        .getByRole("button", { name: `Context page ${String(pageNumber)}`, exact: true })
        .click();
      const content = page
        .getByRole("region", { name: "Committed transcript" })
        .locator(selector)
        .last();
      await expect(content).toBeVisible();
      const canScroll = await content.evaluate((element) => {
        for (
          let node: Element | null = element;
          node && node !== document.body;
          node = node.parentElement
        ) {
          if (
            ["auto", "scroll"].includes(getComputedStyle(node).overflowX) &&
            node.scrollWidth > node.clientWidth
          ) {
            node.scrollLeft = node.scrollWidth;
            return node.scrollLeft > 0;
          }
        }
        return false;
      });
      expect(canScroll).toBe(true);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    }
  });

  test(`locates an earlier code turn at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-mixed--locate-earlier-turn`);
    await page.getByRole("button", { name: "Locate code turn", exact: true }).click();
    await expect(page.getByRole("button", { name: "Context page 1", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const target = page.getByRole("article", { name: "Turn rich-longCode", exact: true });
    await expect(target).toContainText("End of the code sample.");
    await expect
      .poll(() =>
        target.evaluate((element) =>
          Math.abs(element.getBoundingClientRect().bottom - (innerHeight - 12)),
        ),
      )
      .toBeLessThan(2);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Context page 3", exact: true }).click();
    await page.getByRole("button", { name: "Locate code turn", exact: true }).click();
    await expect
      .poll(() =>
        target.evaluate((element) =>
          Math.abs(element.getBoundingClientRect().bottom - (innerHeight - 12)),
        ),
      )
      .toBeLessThan(2);
  });

  test(`mixed conversation preserves context pages at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=transcript-mixed--completed`);
    const transcript = page.getByRole("region", { name: "Committed transcript" });
    const pagination = page.getByRole("navigation", { name: "Transcript context pages" });
    await expect(pagination.getByRole("button", { name: "Context page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(transcript).toContainText("The review is complete.");
    await expect(
      transcript.getByRole("heading", { name: "Section 32", exact: true }),
    ).toBeAttached();
    const image = transcript.getByRole("button", { name: "Preview sample.png", exact: true });
    await expect(image).toBeVisible();
    await image.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    const disclosure = transcript.getByRole("button", { name: /Intermediate updates/ });
    await scrollIntoStableView(disclosure);
    await disclosure.click();
    await expect(transcript).toContainText("Review complete");
    await disclosure.click();
    await expect(transcript).not.toContainText("Checking the visible states");
    await pagination.getByRole("button", { name: "Previous context page" }).click();
    await expect(pagination.getByRole("button", { name: "Context page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(transcript).toContainText("Delivery matrix");
    await expect(transcript).not.toContainText("The review is complete.");
    await pagination.getByRole("button", { name: "Context page 1" }).click();
    await expect(transcript).toContainText("Release review");
    await expect(transcript).toContainText("End of the code sample.");
    await expect(pagination.getByRole("button", { name: "Previous context page" })).toBeDisabled();
    await expect(transcript.getByRole("separator", { name: "Context compressed" })).toHaveCount(0);
    const lastPageButton = pagination.getByRole("button", { name: "Context page 3" });
    await scrollIntoStableView(lastPageButton);
    await lastPageButton.click();
    await test.info().attach("page-after-return", {
      body: JSON.stringify(
        await pagination.getByRole("button").evaluateAll((buttons) =>
          buttons.map((button) => ({
            name: button.getAttribute("aria-label"),
            current: button.getAttribute("aria-current"),
            top: button.getBoundingClientRect().top,
            left: button.getBoundingClientRect().left,
          })),
        ),
      ),
      contentType: "application/json",
    });
    await expect(pagination.getByRole("button", { name: "Next context page" })).toBeDisabled();
    await expect(transcript.getByRole("separator", { name: "Context compressed" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}
