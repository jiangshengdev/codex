import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("history initial failure exposes diagnostics and retries from the keyboard", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-list--initial-error&viewMode=story");
  const error = page.getByRole("main").getByRole("alert");
  await expect(
    page.getByRole("region", { name: "Page notices", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
  await expect(error).toContainText("Unable to load history");
  const diagnostic = error.getByRole("button", {
    name: "View diagnostic information",
    exact: true,
  });
  await diagnostic.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("STORYBOOK_");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(diagnostic).toBeFocused();
  await error.getByRole("button", { name: "Load history", exact: true }).press("Enter");
  await expect(
    page.getByRole("link", { name: "Investigate history recovery", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unable to load history", { exact: true })).toHaveCount(0);
});

test("history pagination failure retains cards and retries through the last page", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-list--pagination-error&viewMode=story");
  const firstCard = page.getByRole("link", { name: "Investigate history recovery", exact: true });
  const nextCard = page.getByRole("link", { name: "Earlier investigation", exact: true });
  await expect(firstCard).toBeVisible();
  await expect(nextCard).toHaveCount(0);
  await page.getByRole("button", { name: "Load more", exact: true }).press("Enter");
  const error = page.getByRole("alert");
  await expect(error).toContainText("Unable to load history");
  await expect(firstCard).toBeVisible();
  await expect(nextCard).toHaveCount(0);
  await error.getByRole("button", { name: "Load more", exact: true }).press("Enter");
  await expect(nextCard).toBeVisible();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toHaveCount(1);
  await expect(page.getByText("Unable to load history", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
});

test("history loading announces progress without reporting an empty result", async ({ page }) => {
  await page.goto("/iframe.html?id=history-list--loading&viewMode=story");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Loading history…");
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  await expect(page.getByText("No history for the current working directory.")).toHaveCount(0);
});

test("appending preview keeps the existing cards while the next page is pending", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-list--append-loading&viewMode=story");
  await expect(page.getByRole("button", { name: "Loading more…", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    page.getByRole("link", { name: "Investigate history recovery", exact: true }),
  ).toBeVisible();
});

test("an appended history card opens its own matching snapshot", async ({ page }) => {
  await page.goto("/iframe.html?id=history-list--pagination&viewMode=story");
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await page.getByRole("link", { name: "Earlier investigation", exact: true }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Earlier investigation", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Earlier history evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Current task context", { exact: true })).toHaveCount(0);
});

test("empty history explains the current directory scope without pagination", async ({ page }) => {
  await page.goto("/iframe.html?id=history-list--empty&viewMode=story");
  await expect(page.getByText("No history for the current working directory.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(0);
});

test("missing history context explains how to recover the directory scope", async ({ page }) => {
  await page.goto("/iframe.html?id=history-list--context-unavailable&viewMode=story");
  const error = page.getByRole("main").getByRole("alert");
  await expect(
    page.getByRole("region", { name: "Page notices", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
  await expect(error).toContainText("History context unavailable");
  await expect(error).toContainText(
    "Open an active task in this browser tab before viewing its history.",
  );
  await expect(page.getByText("No history for the current working directory.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load history", exact: true })).toHaveCount(0);
});

test("long history cards remain readable and keyboard reachable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=history-list--long-content&viewMode=story");
  const card = page.getByRole("main").getByRole("article").first().getByRole("link");
  await expect(card).toBeVisible();
  await card.focus();
  await expect(card).toBeFocused();
  await expect
    .poll(() =>
      card.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          element.scrollWidth <= element.clientWidth
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
