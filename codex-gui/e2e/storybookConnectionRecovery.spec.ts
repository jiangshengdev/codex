import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("shows the retained-session connection failure with real diagnostics", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--reconnect-failed",
  );
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Connection closed");
  await expect(alert).toContainText("The connection could not be restored. You can try again.");
  await expect(alert.getByRole("button", { name: "Reconnect", exact: true })).toBeEnabled();
  await alert.getByRole("button", { name: "View diagnostic information" }).click();
  await expect(page.getByRole("dialog")).toContainText("Simulated reconnect failure");
});

test("opens each fixed recovery state directly", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--startup-failed",
  );
  await expect(page.getByRole("status")).toContainText("Unable to start Codex GUI");
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeEnabled();

  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--connection-closed",
  );
  await expect(page.getByRole("status")).toContainText(
    "Your conversations and input are still here.",
  );
  await expect(page.getByRole("button", { name: "View diagnostic information" })).toHaveCount(0);

  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--reconnecting",
  );
  await expect(page.getByRole("button", { name: "Reconnecting…", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(locale, () => {
    test.use({ locale, viewport: { width: 375, height: 667 } });

    test("keeps diagnostics readable and keyboard accessible in both themes", async ({ page }) => {
      const businessSockets: string[] = [];
      page.on("websocket", (socket) => {
        const url = new URL(socket.url());
        if (
          url.host !== "localhost:6006" ||
          !["/", "/storybook-server-channel"].includes(url.pathname) ||
          !url.searchParams.has("token")
        ) {
          businessSockets.push(socket.url());
        }
      });
      await page.goto(
        "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--reconnect-failed",
      );
      const alert = page.getByRole("alert");
      await expect(alert).toContainText(locale === "en" ? "Connection closed" : "连接已关闭");
      const trigger = alert.getByRole("button", {
        name: locale === "en" ? "View diagnostic information" : "查看诊断信息",
      });
      const backgrounds: string[] = [];
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        backgrounds.push(
          await alert.evaluate((element) => getComputedStyle(element).backgroundColor),
        );
        await expect
          .poll(() => alert.evaluate((element) => element.scrollWidth <= element.clientWidth))
          .toBe(true);
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("END OF SIMULATED DIAGNOSTICS");
        await expect
          .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
          .toBe(true);
        const diagnosticBody = dialog.getByText("Simulated reconnect failure", { exact: false });
        await expect
          .poll(() =>
            diagnosticBody.evaluate((element) => element.scrollHeight > element.clientHeight),
          )
          .toBe(true);
        await diagnosticBody.hover();
        await page.mouse.wheel(0, 500);
        await expect
          .poll(() => diagnosticBody.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
      expect(backgrounds[0]).not.toEqual(backgrounds[1]);
      expect(businessSockets).toEqual([]);
    });
  });
}
