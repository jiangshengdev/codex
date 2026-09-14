import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("preserves JSX source line breaks and indentation", async ({ page }) => {
  await page.goto("http://localhost:6006/?path=/docs/feedback-connection-recovery-states--docs");
  const docs = page.frameLocator("#storybook-preview-iframe");
  await expect(
    docs
      .locator("#story--feedback-connection-recovery-states--playground--primary")
      .getByRole("status"),
  ).toContainText("Connection closed");
  await docs.getByRole("switch", { name: "Show code", exact: true }).first().click();
  const source = docs.locator(".prismjs").first();
  const component = source.getByText("ConnectionRecoveryNotice", { exact: true });
  const prop = source.getByText("hasRetainedSession", { exact: true });
  await expect(component).toBeVisible();
  await expect(prop).toBeVisible();
  await expect
    .poll(async () => {
      const componentBox = await component.boundingBox();
      const propBox = await prop.boundingBox();
      return componentBox != null && propBox != null && propBox.y > componentBox.y;
    })
    .toBe(true);
  await expect
    .poll(() =>
      source.evaluate((element) => {
        const indentation = [...element.querySelectorAll("span")].find(
          (span) => span.textContent === "  ",
        );
        if (indentation == null) return 0;
        const range = document.createRange();
        range.selectNodeContents(indentation);
        return range.getBoundingClientRect().width;
      }),
    )
    .toBeGreaterThan(0);
});

test("documents real props and renders recovery presets", async ({ page }) => {
  await page.goto("http://localhost:6006/?path=/docs/feedback-connection-recovery-states--docs");
  const docs = page.frameLocator("#storybook-preview-iframe");
  const preview = docs.locator("#story--feedback-connection-recovery-states--playground--primary");
  await expect(preview.getByRole("status")).toContainText("Connection closed");
  await expect(docs.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  await expect(docs.getByText("handleReconnect", { exact: false })).toBeVisible();
  await docs.locator('label[aria-label="hasRetainedSession"]').click();
  await expect(preview.getByRole("status")).toContainText("Unable to start Codex GUI");
  const recovery = docs.getByRole("combobox");
  await recovery.selectOption("Failed");
  await expect(preview.getByRole("alert")).toContainText("The connection could not be restored.");
  await preview.getByRole("button", { name: "View diagnostic information" }).click();
  await expect(docs.getByRole("dialog")).toContainText("Simulated reconnect failure");
  await page.keyboard.press("Escape");
  await recovery.selectOption("Pending");
  await expect(preview.getByRole("button", { name: "Reconnecting…", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await recovery.selectOption("Unavailable");
  await expect(preview.getByRole("button")).toHaveCount(0);
  await recovery.selectOption("Ready");
  await expect(preview.getByRole("button", { name: "Reconnect", exact: true })).toBeEnabled();
  await expect(docs.getByRole("link", { name: "Success", exact: true })).toHaveAttribute(
    "href",
    "/?path=/story/feedback-connection-recovery-interactions--success",
  );
  await expect(docs.getByRole("link", { name: "Failure", exact: true })).toHaveAttribute(
    "href",
    "/?path=/story/feedback-connection-recovery-interactions--failure",
  );
  await docs.getByRole("link", { name: "Success", exact: true }).click();
  await expect(page).toHaveURL(
    "http://localhost:6006/?path=/story/feedback-connection-recovery-interactions--success",
  );
  await expect(
    page
      .frameLocator("#storybook-preview-iframe")
      .getByRole("button", { name: "Restart simulation" }),
  ).toBeVisible();
});

test("records the real reconnect callback in Actions", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/?path=/story/feedback-connection-recovery-states--playground",
  );
  await page
    .frameLocator("#storybook-preview-iframe")
    .getByRole("button", { name: "Reconnect", exact: true })
    .click();
  await page.getByRole("tab", { name: "Actions 1", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Actions 1", exact: true })).toContainText(
    "reconnect",
  );
});

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
