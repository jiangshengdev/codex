import { expect, test, type Locator, type Page } from "@playwright/test";

const firstId = "00000000-0000-0000-0000-000000000201";
const secondId = "00000000-0000-0000-0000-000000000202";
const menuButton = (page: Page) => page.getByRole("button", { name: "Menu", exact: true });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Navigation", exact: true });
const taskButton = (page: Page, name: string) =>
  page.getByRole("region", { name: "Active tasks" }).getByRole("button", { name, exact: true });
const moreButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `More options for ${name}`, exact: true });
const removeItem = (page: Page) =>
  page.getByRole("menuitem", { name: "Remove from list", exact: true });

test.use({ locale: "en", viewport: { width: 480, height: 720 } });

test("empty, multiple and unnamed tasks have usable current and fallback entries", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-active-tasks--empty&viewMode=story");
  await menuButton(page).press("Enter");
  await expect(
    page.getByRole("region", { name: "Active tasks" }).getByRole("listitem"),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Current task", exact: true })).toBeDisabled();

  await page.goto("/iframe.html?id=app-shell-active-tasks--multiple-tasks&viewMode=story");
  await menuButton(page).press("Enter");
  await expect(taskButton(page, "Shell task one")).toHaveAttribute("aria-current", "true");
  await taskButton(page, "Shell task 2").press("Enter");
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveText(`/task/${secondId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shell task 2");
  await menuButton(page).press("Enter");
  await expect(taskButton(page, "Shell task 2")).toHaveAttribute("aria-current", "true");
  await expect(taskButton(page, "Shell task one")).not.toHaveAttribute("aria-current", "true");

  await page.goto("/iframe.html?id=app-shell-active-tasks--missing-task-name&viewMode=story");
  await menuButton(page).press("Enter");
  await expect(taskButton(page, secondId)).toBeVisible();
  await moreButton(page, secondId).press("Enter");
  await expect(removeItem(page)).toBeEnabled();
});

test("Escape closes nested actions then the drawer and restores each focus target", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-active-tasks--multiple-tasks&viewMode=story");
  await menuButton(page).press("Enter");
  await moreButton(page, "Shell task 2").press("Enter");
  await expect(removeItem(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Task actions" })).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await expect(moreButton(page, "Shell task 2")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
});

test("removing another task preserves the current route; removing the current task reaches history", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-active-tasks--multiple-tasks&viewMode=story");
  await menuButton(page).click();
  await moreButton(page, "Shell task 2").click();
  await removeItem(page).click();
  await expect(taskButton(page, "Shell task 2")).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await expect(taskButton(page, "Shell task one")).toHaveAttribute("aria-current", "true");
  await moreButton(page, "Shell task one").click();
  await removeItem(page).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveText("/history");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("History");
  await menuButton(page).click();
  await expect(taskButton(page, "Shell task one")).toHaveCount(0);
  await expect(taskButton(page, "Shell task 3")).toBeVisible();
});

test("running task removal is disabled with a reason while title navigation remains available", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-active-tasks--removal-restricted&viewMode=story");
  await menuButton(page).press("Enter");
  await moreButton(page, "Shell task 2").press("Enter");
  await expect(removeItem(page)).toHaveAttribute("aria-disabled", "true");
  await expect(removeItem(page)).toHaveAccessibleDescription("This task is still running.");
  await page.keyboard.press("Escape");
  await taskButton(page, "Shell task 2").press("Enter");
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveText(`/task/${secondId}`);
});

test("navigation failure survives drawer dismissal and clears after retry", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-active-tasks--navigation-failure&viewMode=story");
  await menuButton(page).click();
  await taskButton(page, "Shell task 2").click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole("main")).toHaveText(`/task/${firstId}`);
  await expect(menuButton(page)).toHaveAccessibleDescription(
    /Tasks or the connection need attention\./,
  );
  await menuButton(page).click();
  await expect(taskButton(page, "Shell task 2")).toHaveAccessibleDescription(
    "This task needs attention.",
  );
  await page.keyboard.press("Escape");
  await expect(menuButton(page)).toHaveAccessibleDescription(
    /Tasks or the connection need attention\./,
  );
  await menuButton(page).click();
  await taskButton(page, "Shell task 2").click();
  await expect(page.getByRole("main")).toHaveText(`/task/${secondId}`);
  await expect(menuButton(page)).not.toHaveAccessibleDescription(
    /Tasks or the connection need attention\./,
  );
});

test("detach failure keeps the task and error until a second removal succeeds", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-active-tasks--removal-failure&viewMode=story");
  await menuButton(page).click();
  await moreButton(page, "Shell task 2").click();
  await removeItem(page).click();
  await expect(taskButton(page, "Shell task 2")).toHaveAccessibleDescription(
    "This task needs attention.",
  );
  await expect(removeItem(page)).toHaveCount(0);
  await expect(moreButton(page, "Shell task 2")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(menuButton(page)).toHaveAccessibleDescription(
    /Tasks or the connection need attention\./,
  );
  await expect(page.getByRole("main")).toHaveText(`/task/${firstId}`);
  await menuButton(page).click();
  await moreButton(page, "Shell task 2").click();
  await expect(removeItem(page)).toBeEnabled();
  await removeItem(page).click();
  await expect(taskButton(page, "Shell task 2")).toHaveCount(0);
  await expect(removeItem(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menuButton(page)).not.toHaveAccessibleDescription(
    /Tasks or the connection need attention\./,
  );
  await expect(page.getByRole("main")).toHaveText(`/task/${firstId}`);
});

for (const { name, touch, activate } of [
  { name: "narrow desktop", touch: false, activate: (target: Locator) => target.press("Enter") },
  { name: "simulated phone", touch: true, activate: (target: Locator) => target.tap() },
]) {
  test.describe(name, () => {
    test.use({
      viewport: { width: touch ? 375 : 480, height: touch ? 812 : 720 },
      hasTouch: touch,
    });

    test("long task list scrolls to reachable nested actions without clipping or overflow", async ({
      page,
    }) => {
      await page.goto("/iframe.html?id=app-shell-active-tasks--long-task-names&viewMode=story");
      await activate(menuButton(page));
      const lastName = `Shell task 24 ${"long task name ".repeat(20)}`.trim();
      const last = moreButton(page, lastName);
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      await expect(taskButton(page, lastName)).toBeInViewport();
      await activate(last);
      await expect(removeItem(page)).toBeInViewport();
      await expect
        .poll(() =>
          removeItem(page).evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              bounds.top >= 0 &&
              bounds.bottom <= innerHeight
            );
          }),
        )
        .toBe(true);
      await activate(removeItem(page));
      await expect(taskButton(page, lastName)).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    });
  });
}
