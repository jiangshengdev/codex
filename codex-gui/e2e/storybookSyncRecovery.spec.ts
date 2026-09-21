import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";
import { composer } from "./persistenceHarness";

test.use({ locale: "en" });

test("sync retry preserves the paused conversation and other tasks", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-message-synchronization--backpressure&viewMode=story",
  );
  await expect(page.getByText("Message synchronization paused", { exact: true })).toBeVisible();
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  await installPausedClock(page);
  await page.getByRole("button", { name: "Restore sync", exact: true }).click();
  const pending = page.getByRole("button", { name: "Restoring sync…", exact: true });
  await expect(pending).toHaveAttribute("aria-disabled", "true");
  const pendingBounds = await pending.boundingBox();
  assert(pendingBounds);
  await page.mouse.click(
    pendingBounds.x + pendingBounds.width / 2,
    pendingBounds.y + pendingBounds.height / 2,
  );
  await pending.press("Enter");
  await page.clock.runFor(2_000);
  await expect(
    page.getByText("Synchronization could not be restored. You can try again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect(dialog).toContainText("reason: backpressure");
  await expect(dialog).toContainText("threadId: 00000000-0000-0000-0000-000000000001");
  await expect(dialog).toContainText("subscriptionId: storybook-recovery-subscription-");
  await expect(dialog).toContainText("STORYBOOK_TASK_RESTORE_FAILED");
  const failedDiagnosticText = await dialog.textContent();
  assert(failedDiagnosticText);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Recovery task two", exact: true }).click();
  await expect(composer(page)).toHaveText("Retained draft two");
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(page.getByText("Retained answer two", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Recovery task one", exact: true }).click();
  await page.getByRole("button", { name: "Restore sync", exact: true }).click();
  await expect(pending).toBeVisible();
  await page
    .getByRole("button", { name: "View diagnostic information", exact: true })
    .press("Enter");
  await expect(dialog).toHaveText(failedDiagnosticText);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.clock.runFor(2_000);
  await expect(page.getByText("Message synchronization paused", { exact: true })).toHaveCount(0);
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
  await expect(page.locator("[data-recovery-send-count]")).toHaveAttribute(
    "data-recovery-send-count",
    "0",
  );
});

for (const [story, reason, explanation] of [
  ["backpressure", "backpressure", "Message updates have piled up, so synchronization has paused."],
  [
    "commit-chain-mismatch",
    "commitChainMismatch",
    "Message updates arrived out of order, so the conversation may be incomplete.",
  ],
  [
    "missing-turn",
    "missingTurn",
    "A message update is missing its associated turn, so it cannot be fully displayed.",
  ],
] as const) {
  test(`${story} explains the pause and exposes its diagnostic reason`, async ({ page }) => {
    await page.goto(
      `http://localhost:6006/iframe.html?id=feedback-message-synchronization--${story}&viewMode=story`,
    );
    const notice = page.getByRole("alert").filter({ hasText: "Message synchronization paused" });
    await expect(notice).toContainText(explanation);
    await expect(notice.getByRole("button", { name: "Restore sync", exact: true })).toBeEnabled();
    await notice.getByRole("button", { name: "View diagnostic information", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
    await expect(dialog).toContainText(`reason: ${reason}`);
    await expect(dialog).toContainText("threadId: 00000000-0000-0000-0000-000000000001");
    await expect(dialog).toContainText("subscriptionId: storybook-recovery-subscription-");
  });
}

test("direct recovery states preserve the conversation and enforce availability", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-message-synchronization--restoring&viewMode=story",
  );
  await expect(page.getByRole("button", { name: "Restoring sync…", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByText("Retained answer one", { exact: true })).toBeVisible();
  await expect(composer(page)).toHaveText("Retained draft one");

  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-message-synchronization--connection-unavailable&viewMode=story",
  );
  const restore = page.getByRole("button", { name: "Restore sync", exact: true });
  await expect(restore).toBeDisabled();
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");

  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-message-synchronization--failed&viewMode=story",
  );
  await expect(
    page.getByText("Synchronization could not be restored. You can try again."),
  ).toBeVisible();
  await installPausedClock(page);
  await restore.press("Enter");
  await expect(page.getByRole("button", { name: "Restoring sync…", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.clock.runFor(2_000);
  await expect(page.getByText("Message synchronization paused", { exact: true })).toHaveCount(0);
  await expect(composer(page)).toHaveText("Retained draft one");
  await expect(page.locator("[data-recovery-send-count]")).toHaveAttribute(
    "data-recovery-send-count",
    "0",
  );
});

test("restart discards a pending synchronization result", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-message-synchronization--backpressure&viewMode=story",
  );
  const restore = page.getByRole("button", { name: "Restore sync", exact: true });
  await expect(restore).toBeVisible();
  await installPausedClock(page);
  await restore.click();
  await expect(page.getByRole("button", { name: "Restoring sync…", exact: true })).toBeVisible();
  const dev = page.getByRole("group", { name: "DEV", exact: true }).filter({
    has: page.getByRole("button", { name: "Restart simulation", exact: true }),
  });
  await expect(dev.getByRole("button", { name: "Restore sync", exact: true })).toHaveCount(0);
  await dev.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await page.clock.runFor(2_000);
  await expect(restore).toBeVisible();
  await expect(restore).toBeEnabled();
  await expect(
    page.getByText("Synchronization could not be restored. You can try again."),
  ).toHaveCount(0);
  await expect(composer(page)).toHaveText("Retained draft one");
  await restore.click();
  await page.clock.runFor(2_000);
  await expect(
    page.getByText("Synchronization could not be restored. You can try again."),
  ).toBeVisible();
});

test("switching synchronization stories discards pending results without business connections", async ({
  page,
}) => {
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
    "http://localhost:6006/?path=/story/feedback-message-synchronization--backpressure",
  );
  const preview = page.frameLocator("#storybook-preview-iframe");
  const restore = preview.getByRole("button", { name: "Restore sync", exact: true });
  await expect(restore).toBeVisible();
  await page.clock.install();
  await restore.click();
  await expect(preview.getByRole("button", { name: "Restoring sync…", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Missing Turn", exact: true }).click();
  await expect(
    preview.getByText(
      "A message update is missing its associated turn, so it cannot be fully displayed.",
    ),
  ).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(restore).toBeEnabled();
  await expect(
    preview.getByText("Synchronization could not be restored. You can try again."),
  ).toHaveCount(0);
  await preview.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  await expect(preview.getByRole("dialog")).toContainText("reason: missingTurn");
  expect(businessSockets).toEqual([]);
});

for (const locale of ["en", "zh-CN"] as const) {
  test.describe(`sync diagnostics ${locale}`, () => {
    test.use({ locale });

    test("long diagnostics retain keyboard access and fit narrow and wide themes", async ({
      page,
    }) => {
      await page.goto(
        "http://localhost:6006/iframe.html?id=feedback-message-synchronization--failed&viewMode=story",
      );
      const notice = page
        .getByRole("alert")
        .filter({ hasText: locale === "en" ? "Message synchronization paused" : "消息同步已暂停" });
      const trigger = notice.getByRole("button", {
        name: locale === "en" ? "View diagnostic information" : "查看诊断信息",
        exact: true,
      });
      for (const [width, colorScheme] of [
        [375, "dark"],
        [1280, "light"],
      ] as const) {
        await page.setViewportSize({ width, height: 667 });
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        await expect(notice).toBeVisible();
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
        const dialog = page.getByRole("dialog", {
          name: locale === "en" ? "Diagnostic information" : "诊断信息",
          exact: true,
        });
        await expect(dialog).toContainText("diagnostic-24:");
        await expect(dialog).toContainText("reason: backpressure");
        await expect
          .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
          .toBe(true);
        const body = dialog.getByText("STORYBOOK_TASK_RESTORE_FAILED", { exact: false });
        await expect
          .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
          .toBe(true);
        await body.hover();
        await page.mouse.wheel(0, 500);
        await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
      }
    });
  });
}
