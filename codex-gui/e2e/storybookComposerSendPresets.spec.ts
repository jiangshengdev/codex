import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("unknown send preset never resends and removes only its local record", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--send-unknown");
  const unknown = page.getByText("Sending result unknown", { exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(unknown).toBeVisible();
  await expect(page.getByText("Review this fictional send.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Removing a local record does not cancel or retract/)).toBeVisible();
  await expect(response).toBeDisabled();
  await editor.fill("Keep this separate draft");
  await page.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(unknown).toHaveCount(0);
  await expect(response).toBeDisabled();
  await expect(editor).toHaveText("Keep this separate draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(response).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unknown).toBeVisible();
  await expect(response).toBeDisabled();
});

test("send failure preset preserves unsent content and permits explicit recovery", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--send-failed");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const unsent = page.getByText("1 message has not been sent", { exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  await expect(unsent).toBeVisible();
  await expect(editor).toBeEmpty();
  await editor.fill("Separate draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(response).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(response).toBeEnabled();
  await page.getByRole("button", { name: "Simulate send unknown", exact: true }).click();
  await expect(page.getByText("Review this fictional send.", { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Separate draft");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unsent).toBeVisible();
  await expect(editor).toBeEmpty();
});

test("send response preset opens before runtime acceptance and restarts at that boundary", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send--send-runtime-pending",
  );
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const runtime = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(
    page.getByText("Response received; waiting for runtime confirmation", { exact: true }),
  ).toBeVisible();
  await expect(response).toBeDisabled();
  await expect(stop).toBeDisabled();
  await runtime.click();
  await expect(stop).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(runtime).toBeEnabled();
  await expect(stop).toBeDisabled();
});

test("send request preset waits for response and then for runtime confirmation", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send--send-request-pending",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const runtime = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  await expect(page.getByText("Waiting for send response", { exact: true })).toBeVisible();
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(runtime).toBeDisabled();
  await editor.fill("Draft while waiting");
  await response.click();
  await expect(
    page.getByText("Response received; waiting for runtime confirmation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  await runtime.click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(editor).toHaveText("Draft while waiting");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(response).toBeEnabled();
  await expect(runtime).toBeDisabled();
  await expect(editor).toBeEmpty();
});
