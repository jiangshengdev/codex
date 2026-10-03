import { storybookOrigin } from "./servers";
import { expect, test, type Page } from "@playwright/test";
import { expectScrollableContent } from "./storybookTextAssertions";

test.use({ locale: "en" });

const pendingLists = [
  {
    lane: "queue",
    story: "running-queue-long-list",
    rows: /^Ordinary message /,
    short: "Ordinary message 2",
    last: "END OF Ordinary message 23",
    showMore: "Show more queued messages",
    advance: async (page: Page) => {
      await page.getByRole("button", { name: "Simulate saved queue restore", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("group", { name: /^Ordinary message / })).toHaveCount(20);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
    },
  },
  {
    lane: "guide",
    story: "guide-queued-long-list",
    rows: /^Guide message /,
    short: "Guide message 2",
    last: "END OF Guide message 23",
    showMore: "Show more guiding messages",
    advance: async (page: Page) => {
      const confirmation = page.getByRole("button", {
        name: "Simulate guide runtime confirmation",
        exact: true,
      });
      await page.getByRole("button", { name: "Simulate guide response", exact: true }).click();
      await confirmation.click();
      await expect(
        page.getByRole("group", { name: "Pending: Guide 22", exact: true }),
      ).toBeVisible();
    },
  },
];

for (const width of [375, 1280]) {
  for (const { lane, ...scenario } of pendingLists) {
    test(`opens and advances the mixed ${lane} list at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto(
        `${storybookOrigin}/iframe.html?id=composer-input-and-send-${lane}--${scenario.story}`,
      );
      const dialog = page.getByRole("dialog");
      const rows = dialog.getByRole("group", { name: scenario.rows });
      await expect(rows).toHaveCount(20);
      await expect(rows.nth(1)).toHaveAccessibleName(scenario.short);
      await expectScrollableContent(rows.first());
      await dialog
        .getByRole("button", {
          name: scenario.showMore,
          exact: true,
        })
        .click();
      await expect(rows).toHaveCount(23);
      await rows.last().getByRole("button", { name: "View full message", exact: true }).click();
      const detail = page.getByRole("dialog").last();
      await expect(detail).toContainText(scenario.last);
      await expect(detail).toContainText("end-of-reference");
      await detail.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).toHaveCount(1);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await scenario.advance(page);
    });
  }

  test(`historical unknown long list preserves other records and the draft at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-unknown-long-list`,
    );
    const remove = page.getByRole("button", { name: "Remove local record", exact: true });
    const panel = page.getByRole("status").filter({ has: remove });
    const rows = panel.getByRole("listitem");
    await expect(rows).toHaveCount(23);
    await expect(rows.first()).toContainText("END OF Historical guide 1");
    await expect(rows.nth(1)).toContainText("Historical guide 2");
    await expectScrollableContent(rows.first());
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeInViewport();
    await expect(rows.last()).toContainText("END OF Historical guide 23");
    await page
      .getByRole("combobox", { name: "Message Codex", exact: true })
      .fill("Separate long-list draft");
    await remove.nth(1).click();
    await expect(rows).toHaveCount(22);
    await expect(page.getByText("Historical guide 2", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveText(
      "Separate long-list draft",
    );
  });
}
