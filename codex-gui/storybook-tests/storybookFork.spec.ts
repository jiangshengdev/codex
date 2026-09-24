import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";

test.use({ locale: "en" });

test("fork creation failure provides keyboard diagnostics and can be dismissed on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=history-fork--creation-failure&viewMode=story");
  const notice = page.getByRole("alert");
  await expect(notice).toContainText("Unable to create fork");
  const diagnostic = notice.getByRole("button", {
    name: "View diagnostic information",
    exact: true,
  });
  await diagnostic.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("STORYBOOK_FORK_FAILED");
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(diagnostic).toBeFocused();
  await notice.getByRole("button", { name: "Dismiss", exact: true }).press("Enter");
  await expect(page.getByText("Unable to create fork", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("unknown fork result directs the user to history without offering an unconfirmed fork", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-fork--result-unknown&viewMode=story");
  await expect(page.getByRole("alert")).toContainText(
    "The result is unknown. Check history before forking again; another click may create an additional conversation.",
  );
  await expect(page.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});

test("opening a saved fork hides its notice while pending and never creates another fork", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-fork--created-unopened&viewMode=story");
  const open = page.getByRole("button", { name: "Open fork", exact: true });
  await expect(open).toBeEnabled();
  await installPausedClock(page);
  await open.press("Enter");
  await expect(open).toHaveCount(0);
  await expect(page.getByText("Fork created", { exact: true })).toHaveCount(0);
  await page.clock.runFor(1_000);
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  await expect(open).toHaveCount(0);
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});

test("failed saved-fork activation preserves recovery and can be retried without creation", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-fork--open-failed&viewMode=story");
  const open = page.getByRole("button", { name: "Open fork", exact: true });
  await expect(open).toBeEnabled();
  await page
    .getByRole("button", { name: "View diagnostic information", exact: true })
    .press("Enter");
  await expect(page.getByRole("dialog")).toContainText("STORYBOOK_FORK_FAILED");
  await page.keyboard.press("Escape");
  await installPausedClock(page);
  await open.press("Enter");
  await expect(open).toHaveCount(0);
  await page.clock.runFor(1_000);
  await expect(open).toBeEnabled();
  await expect(page.getByText("Fork created", { exact: true })).toBeVisible();
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toHaveCount(0);
  await open.press("Enter");
  await page.clock.runFor(1_000);
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(open).toHaveCount(0);
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});

test("saved-fork navigation retry reuses the activated task", async ({ page }) => {
  await page.goto("/iframe.html?id=history-fork--navigation-failed&viewMode=story");
  const open = page.getByRole("button", { name: "Open fork", exact: true });
  await expect(
    page.getByRole("button", { name: "View diagnostic information", exact: true }),
  ).toBeVisible();
  await expect(open).toBeEnabled();
  await expect(page.locator("[data-history-activations]")).toHaveAttribute(
    "data-history-activations",
    "1",
  );
  await open.press("Enter");
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(open).toHaveCount(0);
  await expect(page.locator("[data-history-activations]")).toHaveAttribute(
    "data-history-activations",
    "1",
  );
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});

test("pending fork hides notices and recovery actions", async ({ page }) => {
  await page.goto("/iframe.html?id=history-fork--pending&viewMode=story");
  await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Fork created", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Unable to create fork", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});

test("unavailable connection keeps the saved fork visible and disables opening", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-fork--unavailable&viewMode=story");
  await expect(page.getByText("Fork created", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open fork", exact: true })).toBeDisabled();
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});

test("completed saved-fork recovery leaves the current task without a stale notice", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=history-fork--completed&viewMode=story");
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  await expect(page.getByText("Fork created", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
});
