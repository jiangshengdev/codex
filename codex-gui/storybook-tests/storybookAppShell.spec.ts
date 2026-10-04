import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("shell navigation reaches the placeholder and restores drawer focus", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto("/iframe.html?id=app-shell-navigation--current-task&viewMode=story");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(page.getByRole("heading", { name: "Shell task one", exact: true })).toBeVisible();
  await menu.press("Enter");
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.press("Enter");
  await page.getByRole("button", { name: "History", exact: true }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("/history");
  await menu.press("Enter");
  await expect(page.getByRole("button", { name: "History", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("button", { name: "New session", exact: true }).press("Enter");
  await expect(page.getByRole("main")).toContainText("/new");
  await expect(page.getByRole("heading", { name: "New session", exact: true })).toBeVisible();
});

test("shell title presets preserve route titles and fallbacks", async ({ page }) => {
  const cases = [
    ["history-list", "History"],
    ["history-detail", "Shell task one"],
    ["new-session", "New session"],
    ["missing-title", "Current task"],
    ["preview-fallback", "Shell task preview fallback"],
    ["missing-history-title", "History detail"],
  ] as const;
  for (const [story, title] of cases) {
    await page.goto(`/iframe.html?id=app-shell-navigation--${story}&viewMode=story`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.getByRole("button", { name: "Menu", exact: true }).press("Enter");
    await expect(page.getByRole("navigation").locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test("empty collection and missing directory preserve disabled navigation", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-navigation--no-active-task&viewMode=story");
  await page.getByRole("button", { name: "Menu", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Current task", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeEnabled();
  await page.goto("/iframe.html?id=app-shell-navigation--missing-working-directory&viewMode=story");
  await page.getByRole("button", { name: "Menu", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "New session", exact: true }),
  ).toHaveAccessibleDescription("A working directory is required to start a session.");
});

test("task and connection errors remain indicated after closing navigation", async ({ page }) => {
  for (const story of ["task-error", "connection-error"]) {
    await page.goto(`/iframe.html?id=app-shell-navigation--${story}&viewMode=story`);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await expect(menu).toHaveAccessibleDescription(/Tasks or the connection need attention\./);
    await menu.press("Enter");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAccessibleDescription(/Tasks or the connection need attention\./);
  }
});

test.describe("simulated phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("long title leaves touch navigation reachable without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/iframe.html?id=app-shell-navigation--long-title&viewMode=story");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Long shell task title");
    await page.getByRole("button", { name: "Menu", exact: true }).tap();
    await page.getByRole("button", { name: "History", exact: true }).tap();
    await expect(page.getByRole("main")).toContainText("/history");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
});
