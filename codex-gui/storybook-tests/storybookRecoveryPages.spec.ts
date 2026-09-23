import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";
import { clickCenterWithPointer } from "./pointerClick";

test.use({ locale: "en" });

test("retained page reconnects after failure without losing its conversation or draft", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--retained-disconnection&viewMode=story`,
  );
  await expect(page.getByText("Connection closed", { exact: true })).toBeVisible();
  await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Retained draft one");
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await installPausedClock(page);
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  const pending = page.getByRole("button", { name: "Reconnecting…", exact: true });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  await clickCenterWithPointer(page, pending);
  await pending.press("Enter");
  await page.clock.runFor(2_000);
  await expect(
    page.getByText("The connection could not be restored. You can try again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(
    page.getByText("The connection could not be restored. You can try again."),
  ).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(page.getByText("Connection closed", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await expect(editor).toContainText("Retained draft one");
  await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
  await expect(page.locator("[data-recovery-send-count]")).toHaveAttribute(
    "data-recovery-send-count",
    "0",
  );
});

test("startup failure recovers into a usable task page", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--startup-failure&viewMode=story`,
  );
  await expect(page.getByText("Unable to start Codex GUI", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(0);
  await installPausedClock(page);
  await page.getByRole("button", { name: "Reconnect", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Reconnecting…", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.clock.runFor(2_000);
  await expect(page.getByText("Unable to start Codex GUI", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveAttribute(
    "contenteditable",
    "true",
  );
  await expect(page.locator("[data-recovery-send-count]")).toHaveAttribute(
    "data-recovery-send-count",
    "0",
  );
});

test("the fixed unavailable state does not offer a reconnect action", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-states--recovery-unavailable&viewMode=story`,
  );
  await expect(page.getByText("Connection closed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toHaveCount(0);
});

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(`connection page ${locale}`, () => {
    test.use({ locale });

    test("recovery actions and retained content remain reachable in both layouts", async ({
      page,
    }) => {
      await page.goto(
        `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-pages--retained-disconnection&viewMode=story`,
      );
      const reconnect = page.getByRole("button", {
        name: locale === "en" ? "Reconnect" : "重新连接",
        exact: true,
      });
      await reconnect.click();
      const trigger = page.getByRole("button", {
        name: locale === "en" ? "View diagnostic information" : "查看诊断信息",
        exact: true,
      });
      await expect(trigger).toBeVisible();
      for (const [width, colorScheme] of [
        [375, "dark"],
        [1280, "light"],
      ] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        await expect
          .poll(() =>
            reconnect.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.left >= 0 && bounds.right <= window.innerWidth;
            }),
          )
          .toBe(true);
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText("STORYBOOK_RECONNECT_FAILED");
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
        await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
      }
    });
  });
}
