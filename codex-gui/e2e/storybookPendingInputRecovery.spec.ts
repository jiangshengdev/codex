import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("keeps guide delivery unknown until reset without promoting it to priority", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guiding");
  await expect(
    page.getByRole("button", { name: "Simulate guide unknown", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Simulate guide unknown", exact: true }).click();
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect(page.getByText("Will send first", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate guide success", exact: true }),
  ).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByText("Guide status unknown", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate guide success", exact: true }),
  ).toBeEnabled();
});

test("recovers a definite send failure manually and can retry another failure", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--unsent");
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Simulate send failure", exact: true }),
  ).toBeDisabled();
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send failure", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
});

test("distinguishes accepted guidance from priority fallback and exposes recovery presets", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guiding");
  await page.getByRole("button", { name: "Simulate guide success", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pending: Guide 1, Queued 3", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Pending: Queued 3", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await page.getByRole("button", { name: "Simulate guide refusal", exact: true }).click();
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 1", { exact: true })).toBeVisible();
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--priority");
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guide-unknown",
  );
  await expect(page.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--guide-accepted",
  );
  await expect(
    page.getByRole("button", { name: "Simulate guide runtime confirmation", exact: true }),
  ).toBeEnabled();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--recovery-disabled",
  );
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeDisabled();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-recovery--recovering",
  );
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--combined");
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pending: Queued 3", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 3");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Guide message 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pending: Queued 3", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toBeEnabled();
});
