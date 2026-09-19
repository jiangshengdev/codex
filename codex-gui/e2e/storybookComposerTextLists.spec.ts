import { expect, test, type Page } from "@playwright/test";
import { expectScrollableContent } from "./storybookTextAssertions";

test.use({ locale: "en" });

const pendingLists = [
  {
    lane: "queue",
    story: "running-queue-long-list",
    rows: /^Ordinary message /,
    first: /^Ordinary message 1 /,
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
    first: /^Guide message 1 /,
    short: "Guide message 2",
    last: "END OF Guide message 23",
    showMore: "Show more guiding messages",
    advance: async (page: Page) => {
      const confirmation = page.getByRole("button", {
        name: "Simulate guide runtime confirmation",
        exact: true,
      });
      await expect(confirmation).toBeDisabled();
      await page.getByRole("button", { name: "Simulate guide response", exact: true }).click();
      await expect(confirmation).toBeEnabled();
      await confirmation.click();
      await expect(
        page.getByRole("group", { name: "Pending: Guide 22", exact: true }),
      ).toBeVisible();
    },
  },
];

for (const width of [375, 1280]) {
  for (const { lane, ...scenario } of pendingLists) {
    test(`opens and resets the mixed ${lane} list at ${String(width)}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto(
        `http://localhost:6006/iframe.html?id=composer-input-and-send-${lane}--${scenario.story}`,
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
      await page.reload();
      await expect(rows).toHaveCount(20);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Simulate send response", exact: true }),
      ).toBeDisabled();
      await scenario.advance(page);
      await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
      await expect(rows).toHaveCount(20);
      await expect(rows.first()).toHaveAccessibleName(scenario.first);
    });
  }

  test(`historical unknown long list never resends at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(
      "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-unknown-long-list",
    );
    const remove = page.getByRole("button", { name: "Remove local record", exact: true });
    const panel = page.getByRole("status").filter({ has: remove });
    const rows = panel.getByRole("listitem");
    const response = page.getByRole("button", { name: "Simulate send response", exact: true });
    await expect(rows).toHaveCount(23);
    await expect(rows.first()).toContainText("END OF Historical guide 1");
    await expect(rows.nth(1)).toContainText("Historical guide 2");
    await expectScrollableContent(rows.first());
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeInViewport();
    await expect(rows.last()).toContainText("END OF Historical guide 23");
    await expect(response).toBeDisabled();
    await page
      .getByRole("combobox", { name: "Message Codex", exact: true })
      .fill("Separate long-list draft");
    await remove.nth(1).click();
    await expect(rows).toHaveCount(22);
    await expect(page.getByText("Historical guide 2", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveText(
      "Separate long-list draft",
    );
    await expect(response).toBeDisabled();
    await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
    await expect(rows).toHaveCount(23);
    await expect(response).toBeDisabled();
    await page.reload();
    await expect(rows).toHaveCount(23);
    await expect(response).toBeDisabled();
    await page.goto(
      "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-unknown-multiple-long-text",
    );
    await expect(remove).toHaveCount(3);
    await expect(page.getByText(/END OF Historical guide/)).toHaveCount(0);
  });
}
