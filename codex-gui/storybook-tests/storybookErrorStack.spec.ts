import { expect, test } from "@playwright/test";
import { storybookOrigin } from "./servers";
import { installPausedClock } from "./pausedClock";

test.use({ locale: "en" });

for (const width of [375, 1280]) {
  test(`global errors stay accessible throughout a long page at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--retained-disconnection`,
    );
    const issues = page.getByRole("region", { name: "Active issues", exact: true });
    await expect(issues).toContainText("Connection closed");
    await expect(issues.getByText("2 active issues", { exact: true })).toBeVisible();
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((value) => {
        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value);
      }, fraction);
      await expect(issues.getByRole("button", { name: "Reconnect", exact: true })).toBeInViewport();
    }
  });
}

for (const width of [375, 1280]) {
  test(`combined issues expand without moving the reading position at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--stacked-issues`,
    );
    const issues = page.getByRole("region", { name: "Active issues", exact: true });
    await expect(issues.getByText("3 active issues", { exact: true })).toBeVisible();
    await expect(issues.getByText("Connection closed", { exact: true })).toBeVisible();
    await expect(issues.getByText("Task updates are paused", { exact: true })).toBeHidden();
    await expect(issues.getByText("Message synchronization paused", { exact: true })).toBeHidden();

    // DEV controls only prepare additional real collection failures.
    for (let index = 0; index < 5; index += 1) {
      await page.getByRole("button", { name: "Add simulated issue", exact: true }).click();
    }
    await expect(issues.getByText("8 active issues", { exact: true })).toBeVisible();
    await expect(
      issues.getByRole("button", { name: "Show all issues", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => {
      window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2);
    });
    const before = await page.getByRole("main").evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      scroll: window.scrollY,
    }));
    const toggle = issues.getByRole("button", { name: "Show all issues", exact: true });
    await toggle.focus();
    await toggle.press("Enter");
    await expect(
      issues.getByRole("button", { name: "Collapse issues", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(() =>
        page.getByRole("main").evaluate((element) => ({
          top: element.getBoundingClientRect().top,
          scroll: window.scrollY,
        })),
      )
      .toEqual(before);
    await expect(issues.getByRole("button", { name: "Restore task", exact: true })).toBeDisabled();
    await expect(issues.getByRole("button", { name: "Restore sync", exact: true })).toBeDisabled();
    const lastDiagnostic = issues
      .getByRole("button", { name: "View diagnostic information", exact: true })
      .last();
    await lastDiagnostic.focus();
    await expect(lastDiagnostic).toBeInViewport();
    await lastDiagnostic.press("Enter");
    await expect(page.getByRole("dialog")).toContainText("Simulated issue preview-5");
    await page.keyboard.press("Escape");
    await expect(lastDiagnostic).toBeFocused();
    await expect(lastDiagnostic).toBeInViewport();
    const collapse = issues.getByRole("button", { name: "Collapse issues", exact: true });
    await collapse.focus();
    await collapse.press("Enter");
    await expect(issues.getByText("Connection closed", { exact: true })).toBeInViewport();
    await expect(issues.getByText("Task updates are paused", { exact: true })).toBeHidden();
    await page.mouse.move(0, 0);
    await issues.getByText("Connection closed", { exact: true }).hover();
    await expect(issues.getByText("Task updates are paused", { exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.getByRole("button", { name: "Menu", exact: true }).focus();
    await expect(issues.getByText("Task updates are paused", { exact: true })).toBeHidden();
  });
}

test("connection recovery promotes remaining task issues and removes resolved notices", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--stacked-issues`,
  );
  const issues = page.getByRole("region", { name: "Active issues", exact: true });
  await expect(issues.getByText("3 active issues", { exact: true })).toBeVisible();
  await installPausedClock(page);
  await issues.getByRole("button", { name: "Reconnect", exact: true }).click();
  await page.clock.runFor(2_000);
  await expect(issues).toContainText("The connection could not be restored. You can try again.");
  await issues.getByRole("button", { name: "Reconnect", exact: true }).click();
  await page.clock.runFor(4_000);
  await expect(issues.getByText("Connection closed", { exact: true })).toHaveCount(0);
  await expect(issues.getByText("2 active issues", { exact: true })).toBeVisible();
  await expect(issues.getByText("Task updates are paused", { exact: true })).toBeVisible();
  await issues.getByRole("button", { name: "Restore task", exact: true }).click();
  await page.clock.runFor(2_000);
  await expect(issues).toHaveCount(0);
});

test("native Toast covers the stack, remains actionable and retains its default timeout", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--stacked-issues`,
  );
  const issues = page.getByRole("region", { name: "Active issues", exact: true });
  await expect(issues).toBeVisible();
  await installPausedClock(page);
  await page.getByRole("button", { name: "Show native toast", exact: true }).click();
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight / 2);
  });
  await page.clock.runFor(500);
  const feedback = page.locator('[data-slot="toast"]').filter({ hasText: "Temporary feedback" });
  await expect(feedback).toBeVisible();
  await expect
    .poll(() =>
      feedback.evaluate((element) => {
        const notice = document.querySelector("[data-app-shell-top-notices]");
        if (!notice) return false;
        const toastBounds = element.getBoundingClientRect();
        const noticeBounds = notice.getBoundingClientRect();
        const x =
          (Math.max(toastBounds.left, noticeBounds.left) +
            Math.min(toastBounds.right, noticeBounds.right)) /
          2;
        const top = Math.max(toastBounds.top, noticeBounds.top);
        const bottom = Math.min(toastBounds.bottom, noticeBounds.bottom);
        return bottom > top && element.contains(document.elementFromPoint(x, (top + bottom) / 2));
      }),
    )
    .toBe(true);
  await feedback.hover();
  await page.clock.runFor(500);
  await feedback.getByRole("button", { name: "Close", exact: true }).click();
  await page.clock.runFor(500);
  await expect(feedback).toHaveCount(0);
  await expect(issues.getByText("Connection closed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show native toast", exact: true }).click();
  await page.mouse.move(0, 0);
  await page.clock.runFor(5_000);
  await expect(feedback).toHaveCount(0);
  await expect(issues.getByText("3 active issues", { exact: true })).toBeVisible();
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 800 } });

  test("opens and collapses all issues without hover", async ({ page }) => {
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--stacked-issues`,
    );
    const issues = page.getByRole("region", { name: "Active issues", exact: true });
    await issues.getByRole("button", { name: "Show all issues", exact: true }).tap();
    await expect(issues.getByText("Message synchronization paused", { exact: true })).toBeVisible();
    await issues.getByRole("button", { name: "Collapse issues", exact: true }).tap();
    await expect(issues.getByText("Message synchronization paused", { exact: true })).toBeHidden();
    await expect(issues.getByText("Connection closed", { exact: true })).toBeVisible();
  });
});
