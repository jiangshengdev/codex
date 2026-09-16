import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";

test.use({ locale: "en" });

test("restart simulation has a DEV boundary separate from the product recovery notice", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-interactions--success&viewMode=story",
  );
  const simulation = page.getByRole("group", { name: "DEV", exact: true }).filter({
    has: page.getByRole("button", { name: "Restart simulation", exact: true }),
  });
  await expect(simulation).toBeVisible();
  await expect(simulation.getByText("DEV", { exact: true })).toHaveCount(1);
  await expect(simulation.getByText("Connection closed", { exact: true })).toHaveCount(0);
  await expect(simulation.getByRole("button", { name: "Reconnect", exact: true })).toHaveCount(0);
  for (const theme of ["Light theme", "Dark theme"]) {
    await page.getByRole("radio", { name: theme, exact: true }).click();
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 800 });
      const badge = simulation.getByText("DEV", { exact: true });
      await expect(badge).toBeVisible();
      await expect(simulation).toHaveCSS("border-top-left-radius", "0px");
      await expect(simulation).toHaveCSS("border-top-style", "solid");
      const frame = await simulation.boundingBox();
      const label = await badge.boundingBox();
      assert(frame && label, "DEV boundary and badge must have visible geometry");
      expect(label.x).toBeGreaterThan(frame.x);
      expect(label.x + label.width).toBeLessThan(frame.x + frame.width);
      expect(label.y).toBeLessThan(frame.y);
      expect(label.y + label.height).toBeGreaterThan(frame.y);
      expect(frame.x + frame.width).toBeLessThanOrEqual(width);
    }
  }
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reconnecting…", exact: true })).toBeVisible();
  await simulation.getByRole("button", { name: "Restart simulation", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toBeVisible();
});

test("successful reconnection waits before removing the recovery notice", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-interactions--success&viewMode=story",
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
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-interactions--failure&viewMode=story",
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

test("restart cancels pending recovery and restores the successful demo", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=feedback-connection-recovery-interactions--success&viewMode=story",
  );
  const reconnect = page.getByRole("button", { name: "Reconnect", exact: true });
  await expect(reconnect).toBeVisible();
  await installPausedClock(page);
  await reconnect.click();
  await expect(page.getByRole("button", { name: "Reconnecting…", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart simulation" }).click();
  await expect(reconnect).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(reconnect).toBeVisible();
  await reconnect.click();
  await page.clock.runFor(2_000);
  await expect(page.getByText("Connection closed", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restart simulation" }).click();
  await expect(reconnect).toBeVisible();
});

test("switching stories discards pending work and prior results without business connections", async ({
  page,
}) => {
  const businessSockets: string[] = [];
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    const isStorybookSocket =
      url.host === "localhost:6006" &&
      (url.pathname === "/" || url.pathname === "/storybook-server-channel") &&
      url.searchParams.has("token");
    if (!isStorybookSocket) businessSockets.push(socket.url());
  });
  await page.goto(
    "http://localhost:6006/?path=/story/feedback-connection-recovery-interactions--success",
  );
  const preview = page.frameLocator("#storybook-preview-iframe");
  const reconnect = preview.getByRole("button", { name: "Reconnect", exact: true });
  await expect(reconnect).toBeVisible();
  // Keep Storybook's teardown and render timers running across story navigation.
  await page.clock.install();
  await reconnect.click();
  await expect(preview.getByRole("button", { name: "Reconnecting…", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Failure", exact: true }).click();
  await expect(reconnect).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(reconnect).toBeVisible();
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await reconnect.click();
  await page.clock.runFor(2_000);
  await expect(preview.getByRole("alert")).toContainText(
    "The connection could not be restored. You can try again.",
  );
  await page.getByRole("link", { name: "Success", exact: true }).click();
  await expect(reconnect).toBeVisible();
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await reconnect.click();
  await page.clock.runFor(2_000);
  await expect(preview.getByText("Connection closed", { exact: true })).toHaveCount(0);
  expect(businessSockets).toEqual([]);
});
