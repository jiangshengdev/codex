import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";
import { clickCenterWithPointer } from "./pointerClick";

test.use({ locale: "en" });

test("failed navigation retries the route without repeating activation", async ({ page }) => {
  await page.goto("/iframe.html?id=history-continuation--navigation-failed&viewMode=story");
  await expect(page.getByRole("alert")).toContainText(
    "An unexpected error occurred while continuing the task.",
  );
  await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue this task", exact: true }).press("Enter");
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(page.locator("[data-history-activations]")).toHaveAttribute(
    "data-history-activations",
    "1",
  );
});

for (const [story, warning] of [
  ["synchronization-warning", "The task opened, but some state synchronization did not finish."],
  [
    "cleanup-warning",
    "The previous task connection could not be fully cleaned up. Later state may be affected.",
  ],
] as const) {
  test(`${story} remains visible after reaching the current task`, async ({ page }) => {
    await page.goto(`/iframe.html?id=history-continuation--${story}&viewMode=story`);
    await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
    await expect(page.getByText(warning, { exact: true })).toBeVisible();
  });
}

test("continuation pending prevents duplicate activation and clears on success", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-detail--content&viewMode=story");
  const action = page.getByRole("button", { name: "Continue this task", exact: true });
  await expect(action).toBeVisible();
  await installPausedClock(page);
  await action.press("Enter");
  const pending = page.getByRole("button", { name: "Continuing this task…", exact: true });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await clickCenterWithPointer(page, pending);
  await pending.press("Enter");
  await page.clock.runFor(1000);
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(page.locator("[data-history-activations]")).toHaveAttribute(
    "data-history-activations",
    "1",
  );
  await expect(page.getByText("Task opened", { exact: true })).toHaveCount(0);
});
