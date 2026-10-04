import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";
import { clickCenterWithPointer } from "./pointerClick";
import { composer } from "../e2e/persistenceHarness";

test.use({ locale: "en" });

test("partial recovery keeps task ownership while retrying the failed task", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-task-recovery--partial-recovery&viewMode=story`,
  );
  await expect(page.getByText("This task could not be restored. You can try again.")).toBeVisible();
  await expect(page.getByText("Connection closed", { exact: true })).toHaveCount(0);
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  await installPausedClock(page);
  await page.getByRole("button", { name: "Restore task", exact: true }).click();
  const pending = page.getByRole("button", { name: "Restoring task…", exact: true });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await clickCenterWithPointer(page, pending);
  await pending.press("Enter");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Recovery task two", exact: true }).click();
  await expect(composer(page)).toHaveText("Retained draft two");
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(page.getByText("Retained answer two", { exact: true })).toBeVisible();
  await page.clock.runFor(2_000);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Recovery task one", exact: true }).click();
  await expect(page.getByText("This task could not be restored. You can try again.")).toBeVisible();
  await page.getByRole("button", { name: "Restore task", exact: true }).click();
  await expect(pending).toBeVisible();
  await page
    .getByRole("button", { name: "View diagnostic information", exact: true })
    .press("Enter");
  const retryDiagnostics = page.getByRole("dialog");
  await expect(retryDiagnostics).toContainText("STORYBOOK_TASK_RESTORE_FAILED");
  await expect(retryDiagnostics).toContainText("threadId=00000000-0000-0000-0000-000000000001");
  await page.keyboard.press("Escape");
  await expect(retryDiagnostics).toBeHidden();
  await page.clock.runFor(2_000);
  await expect(page.getByText("Task updates are paused", { exact: true })).toHaveCount(0);
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
  await expect(page.locator("[data-recovery-send-count]")).toHaveAttribute(
    "data-recovery-send-count",
    "0",
  );
});

for (const [state, label, enabled, diagnostics] of [
  ["waiting", "Restore task", true, 0],
  ["restoring", "Restoring task…", false, 0],
  ["failed", "Restore task", true, 1],
  ["connection-unavailable", "Restore task", false, 0],
] as const) {
  test(`opens fixed ${state} task recovery directly`, async ({ page }) => {
    await page.goto(
      `${storybookOrigin}/iframe.html?id=feedback-task-recovery--${state}&viewMode=story`,
    );
    await expect(page.getByText("Task updates are paused", { exact: true })).toBeVisible();
    const restore = page.getByRole("button", {
      name: label,
      exact: true,
    });
    await expect(restore).toBeEnabled({ enabled });
    await expect(
      page.getByRole("button", { name: "View diagnostic information", exact: true }),
    ).toHaveCount(diagnostics);
  });
}

test("fixed failure provides diagnostics and recovered state keeps content editable", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-task-recovery--failed&viewMode=story`,
  );
  await expect(page.getByRole("alert")).toContainText(
    "This task could not be restored. You can try again.",
  );
  await page.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("STORYBOOK_TASK_RESTORE_FAILED");
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-task-recovery--recovered&viewMode=story`,
  );
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
  await expect(page.getByText("Task updates are paused", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore task", exact: true })).toHaveCount(0);
});

for (const { locale, width, colorScheme } of [
  { locale: "en", width: 1280, colorScheme: "light" },
  { locale: "zh-CN", width: 375, colorScheme: "dark" },
] as const) {
  const diagnosticLabel = locale === "en" ? "View diagnostic information" : "查看诊断信息";

  test.describe(`${locale} ${String(width)} ${colorScheme}`, () => {
    test.use({ locale, viewport: { width, height: 800 }, colorScheme });

    test("reads long task diagnostics with keyboard focus restored on close", async ({ page }) => {
      await page.goto(
        `${storybookOrigin}/iframe.html?id=feedback-task-recovery--partial-recovery&viewMode=story`,
      );
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      const trigger = page.getByRole("button", { name: diagnosticLabel, exact: true });
      await expect(trigger).toBeVisible();
      const notice = page.getByRole("alert").filter({ has: trigger });
      await expect
        .poll(() =>
          notice.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.left >= 0 &&
              bounds.right <= window.innerWidth &&
              element.scrollWidth <= element.clientWidth
            );
          }),
        )
        .toBe(true);
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("diagnostic-24:");
      await expect
        .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      const body = dialog.getByText("STORYBOOK_TASK_RESTORE_FAILED", { exact: false });
      await expect
        .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
        .toBe(true);
      await body.hover();
      await page.mouse.wheel(0, 600);
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
      await expect(page.locator("[data-recovery-send-count]")).toHaveAttribute(
        "data-recovery-send-count",
        "0",
      );
    });
  });
}
