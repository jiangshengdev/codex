import { storybookOrigin } from "./servers";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          if (document.documentElement.dataset.rejectCopy === "true") {
            return Promise.reject(new Error("Simulated clipboard rejection"));
          }
          document.documentElement.dataset.copiedText = text;
          return Promise.resolve();
        },
        async write(items: ClipboardItem[]) {
          if (document.documentElement.dataset.rejectCopy === "true") {
            throw new Error("Simulated clipboard rejection");
          }
          const item = items[0];
          if (!item) throw new Error("Expected a table clipboard item");
          document.documentElement.dataset.copiedText = await (
            await item.getType("text/plain")
          ).text();
          document.documentElement.dataset.copiedHtml = await (
            await item.getType("text/html")
          ).text();
        },
      },
    });
  });
});

async function openStory(page: Page, story: string) {
  await page.goto(`${storybookOrigin}/iframe.html?id=transcript-rich-content--${story}`);
  await expect(page.getByRole("main")).toBeVisible();
}

async function expectPageFits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBe(0);
}

async function expectLocalHorizontalScroll(content: Locator) {
  await expect
    .poll(() =>
      content.evaluate((element) => {
        let ancestor: HTMLElement | null = element as HTMLElement;
        while (ancestor && ancestor !== document.body) {
          if (
            ["auto", "scroll"].includes(getComputedStyle(ancestor).overflowX) &&
            ancestor.scrollWidth > ancestor.clientWidth
          ) {
            ancestor.scrollLeft = ancestor.scrollWidth;
            return ancestor.scrollLeft;
          }
          ancestor = ancestor.parentElement;
        }
        return 0;
      }),
    )
    .toBeGreaterThan(0);
}

for (const width of [375, 1280]) {
  test.describe(`${String(width)}px rich content`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("Markdown preserves document structure and real code and table controls", async ({
      page,
    }) => {
      await openStory(page, "markdown");
      const transcript = page.getByRole("region", { name: "Committed transcript" });
      await expect(transcript.getByRole("heading", { name: "Release review" })).toBeVisible();
      await expect(transcript.locator("blockquote")).toContainText("Keep the reasoning readable");
      await expect(transcript.getByRole("link", { name: "Reference link" })).toHaveAttribute(
        "href",
        "https://example.com/reference",
      );
      await expect(transcript.getByRole("table")).toContainText("Rendering");
      await expect(
        transcript.getByRole("button", { name: "Copy code", exact: true }),
      ).toBeEnabled();
      await expect(
        transcript.getByRole("button", { name: "Copy table", exact: true }),
      ).toBeEnabled();
      await expectPageFits(page);
    });

    test("long code scrolls locally and keeps its last line", async ({ page }) => {
      await openStory(page, "long-code");
      const code = page.locator('[data-streamdown="code-block-body"]');
      await expect(code).toContainText("const result48 = processItem(48);");
      await expectLocalHorizontalScroll(code);
      await expectPageFits(page);
      await expect(page.getByText("End of the code sample.", { exact: true })).toBeVisible();
    });

    test("wide table scrolls locally in both directions", async ({ page }) => {
      await openStory(page, "wide-table");
      const table = page.getByRole("table");
      await expect(table.getByRole("row")).toHaveCount(37);
      await expectLocalHorizontalScroll(table);
      await expect
        .poll(() =>
          table.evaluate((element) => {
            const scroller = element.parentElement;
            if (!scroller) throw new Error("Expected the real table scroll container");
            scroller.scrollTop = scroller.scrollHeight;
            return scroller.scrollTop;
          }),
        )
        .toBeGreaterThan(0);
      await expect(
        table.getByRole("cell", { name: "Inspect cell 36 before release", exact: true }),
      ).toBeInViewport();
      await expectPageFits(page);
    });

    test("long text remains readable through its final section", async ({ page }) => {
      await openStory(page, "long-text");
      await expect(page.getByRole("heading", { name: /^Section / })).toHaveCount(32);
      const last = page.getByRole("heading", { name: "Section 32", exact: true });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expectPageFits(page);
    });

    test("unfinished emphasis remains readable", async ({ page }) => {
      await openStory(page, "unclosed-markdown");
      await expect(page.getByRole("heading", { name: "An answer in progress" })).toBeVisible();
      await expect(page.getByRole("main")).toContainText("checking the unfinished");
      await expectPageFits(page);
    });

    test("unfinished code remains visible with copying disabled", async ({ page }) => {
      await openStory(page, "unclosed-code");
      await expect(page.locator('[data-streamdown="code-block-body"]')).toContainText(
        "const response = await fetch(",
      );
      await expect(page.getByRole("button", { name: "Copy code", exact: true })).toBeDisabled();
      await expectPageFits(page);
    });

    test("real code and table copying reports failures and permits retry", async ({ page }) => {
      await openStory(page, "markdown");
      await page.evaluate(() => {
        document.documentElement.dataset.rejectCopy = "true";
      });
      await page.getByRole("button", { name: "Copy code", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Could not copy code. Try again.");
      await page.evaluate(() => {
        document.documentElement.dataset.rejectCopy = "false";
      });
      await page.getByRole("button", { name: "Copy code", exact: true }).click();
      await expect(page.getByRole("button", { name: "Code copied", exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "data-copied-text",
        /const result = \{ status: "ready", count: 3 \};/,
      );
      await expect(page.getByRole("alert")).toHaveCount(0);

      await page.evaluate(() => {
        document.documentElement.dataset.rejectCopy = "true";
      });
      await page.getByRole("button", { name: "Copy table", exact: true }).click();
      await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Could not copy table. Try again.");
      await page.evaluate(() => {
        document.documentElement.dataset.rejectCopy = "false";
      });
      await page.getByRole("button", { name: "Copy table", exact: true }).click();
      await page.getByRole("menuitem", { name: "Markdown", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Table copied");
      await expect(page.locator("html")).toHaveAttribute(
        "data-copied-text",
        /\| Rendering \| Ready \|/,
      );
      await expect(page.locator("html")).toHaveAttribute("data-copied-html", /<table/);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expectPageFits(page);
    });
  });
}
