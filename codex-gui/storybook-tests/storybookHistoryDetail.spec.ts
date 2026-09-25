import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("history detail loading withholds continuation until its snapshot is ready", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-detail--loading&viewMode=story");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Loading task history…");
  await expect(page.getByRole("button", { name: "Continue this task", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("This task has no messages.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Read-only history evidence", { exact: true })).toHaveCount(0);
});

test("history detail read failure exposes diagnostics and recovers with keyboard retry", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-detail--read-error&viewMode=story");
  const error = page.getByRole("main").getByRole("alert");
  await expect(
    page.getByRole("region", { name: "Page notices", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
  await expect(error).toContainText("Unable to load task history");
  await expect(page.getByRole("button", { name: "Continue this task", exact: true })).toHaveCount(
    0,
  );
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
  await error.getByRole("button", { name: "Load task history", exact: true }).press("Enter");
  await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue this task", exact: true })).toBeEnabled();
  await expect(page.getByText("Unable to load task history", { exact: true })).toHaveCount(0);
});

test("empty history detail remains a ready task that can be continued", async ({ page }) => {
  await page.goto("/iframe.html?id=history-detail--empty&viewMode=story");
  await expect(page.getByText("This task has no messages.", { exact: true })).toBeVisible();
  const continueTask = page.getByRole("button", { name: "Continue this task", exact: true });
  await expect(continueTask).toBeEnabled();
  await continueTask.press("Enter");
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  await expect(continueTask).toHaveCount(0);
});

test("independent detail stories do not retain previous content or continuation controls", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-detail--content&viewMode=story");
  await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue this task", exact: true })).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(0);
  await page.goto("/iframe.html?id=history-detail--empty&viewMode=story");
  await expect(page.getByText("This task has no messages.", { exact: true })).toBeVisible();
  await expect(page.getByText("Read-only history evidence", { exact: true })).toHaveCount(0);
  await page.goto("/iframe.html?id=history-detail--loading&viewMode=story");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Loading task history…");
  await expect(page.getByText("This task has no messages.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue this task", exact: true })).toHaveCount(
    0,
  );
});

test("long history detail fits a narrow viewport and keeps continuation reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=history-detail--long-content&viewMode=story");
  await expect(page.getByText(/^Read-only history evidence/).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  const continueTask = page.getByRole("button", { name: "Continue this task", exact: true });
  await continueTask.scrollIntoViewIfNeeded();
  await expect(continueTask).toBeInViewport();
  await expect(continueTask).toBeEnabled();
  await continueTask.press("Enter");
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
});
