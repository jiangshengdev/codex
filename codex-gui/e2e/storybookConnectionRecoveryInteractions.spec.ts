import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";

test.use({ locale: "en" });

test("successful reconnection waits before removing the recovery notice", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-interactions--success&viewMode=story`,
  );
  await expect(page.getByText("Connection closed", { exact: true })).toBeVisible();
  await installPausedClock(page);
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reconnecting…", exact: true })).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(page.getByText("Connection closed", { exact: true })).toHaveCount(0);
});

test("failed reconnection exposes diagnostics and can be retried", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-interactions--failure&viewMode=story`,
  );
  await expect(page.getByText("Connection closed", { exact: true })).toBeVisible();
  await installPausedClock(page);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    const pending = page.getByRole("button", { name: "Reconnecting…", exact: true });
    await expect(pending).toBeVisible();
    await expect(pending).toHaveAttribute("aria-disabled", "true");
    await pending.press("Enter");
    await page.clock.runFor(2_000);
    await expect(page.getByRole("alert")).toContainText(
      "The connection could not be restored. You can try again.",
    );
    await page.getByRole("button", { name: "View diagnostic information" }).click();
    const dialog = page.getByRole("dialog", { name: "Diagnostic information" });
    await expect(dialog).toContainText("STORYBOOK_RECONNECT_FAILED");
    await page.getByRole("button", { name: "Close diagnostics" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeEnabled();
  }
});
