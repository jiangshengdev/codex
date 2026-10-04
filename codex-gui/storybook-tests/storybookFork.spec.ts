import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";
import {
  DEV_VISIBILITY_CHANGED,
  type DevVisibility,
} from "../src/storybook/environment/devVisibility";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`fork and global notices stay reachable across long pages at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/iframe.html?id=history-fork--page-coexistence&viewMode=story");
    const notices = page.getByRole("region", { name: "Page notices", exact: true });
    await expect(notices.getByRole("alert")).toHaveCount(4);
    await page.evaluate(
      ({ event, visibility }) => {
        const preview = window as typeof window & {
          __STORYBOOK_ADDONS_CHANNEL__: { emit: (name: string, value: DevVisibility) => void };
        };
        preview.__STORYBOOK_ADDONS_CHANNEL__.emit(event, visibility);
      },
      { event: DEV_VISIBILITY_CHANGED, visibility: { visible: false } },
    );
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("main")).toContainText("Read-only history evidence");
    // Notices can be ready before the asynchronous history body creates the long page.
    await expect
      .poll(() => page.evaluate(() => (document.documentElement.scrollHeight - innerHeight) * 0.5))
      .toBeGreaterThan(800);
    const lastFork = notices
      .getByRole("alert")
      .filter({ hasText: "00000000-0000-0000-0000-000000000104" });
    const open = lastFork.getByRole("button", { name: "Open fork", exact: true });
    const bounds = (element: HTMLElement | SVGElement) => {
      const { x, width } = element.getBoundingClientRect();
      return { x, width };
    };
    const main = await page.getByRole("main").evaluate(bounds);
    const region = await notices.getByRole("alert").first().evaluate(bounds);
    expect(region.x).toBeCloseTo(main.x, 0);
    expect(region.width).toBeCloseTo(main.width, 0);
    const viewport = await notices.evaluate(bounds);
    const shadowSpace = Math.min(
      region.x - viewport.x,
      viewport.x + viewport.width - region.x - region.width,
    );
    expect(shadowSpace).toBeGreaterThanOrEqual(8);
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((position) => {
        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * position);
      }, fraction);
      await notices.focus();
      await notices.press("End");
      await expect(open).toBeInViewport({ ratio: 1 });
      await expect.poll(() => page.evaluate(() => window.scrollY > 800)).toBe(fraction > 0);
    }
    await expect
      .poll(() =>
        notices.evaluate(
          (element) =>
            element.scrollHeight > element.clientHeight &&
            element.getBoundingClientRect().bottom < innerHeight / 2 &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    const failed = notices.getByRole("alert").filter({ hasText: "Unable to create fork" });
    const diagnostic = failed.getByRole("button", {
      name: "View diagnostic information",
      exact: true,
    });
    await diagnostic.click();
    await expect(page.getByRole("dialog")).toContainText("STORYBOOK_FORK_FAILED");
    await page.keyboard.press("Escape");
    await expect(diagnostic).toBeFocused();
    await failed.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(notices.getByRole("alert")).toHaveCount(3);
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(notices.getByRole("alert")).toHaveCount(3);
    const list = await page.getByRole("main").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const left = parseFloat(style.paddingLeft);
      const right = parseFloat(style.paddingRight);
      return { x: rect.x + left, width: rect.width - left - right };
    });
    const listRegion = await notices.getByRole("alert").first().evaluate(bounds);
    expect(listRegion.x).toBeCloseTo(list.x, 0);
    expect(listRegion.width).toBeCloseTo(list.width, 0);
    await open.click();
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
    await expect(lastFork).toHaveCount(0);
    await expect(notices.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(1);
    await expect(page.locator("[data-history-forks]")).toHaveAttribute("data-history-forks", "0");
  });
}

test("native toast remains operable alongside unresolved fork notices after continuation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/iframe.html?id=history-fork--page-coexistence&viewMode=story");
  const notices = page.getByRole("region", { name: "Page notices", exact: true });
  await expect(notices.getByRole("alert")).toHaveCount(4);
  await installPausedClock(page);
  await page.getByRole("button", { name: "Continue this task", exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  const toast = page.getByRole("alertdialog").filter({ hasText: "Task opened" });
  await expect(toast).toContainText("The previous task connection could not be fully cleaned up.");
  await expect(notices.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(2);
  await toast.hover();
  await toast.getByRole("button", { name: "Close", exact: true }).click();
  await page.clock.runFor(500);
  await expect(toast).toHaveCount(0);
  await expect(notices.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(2);
});

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
