import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("accepted stop waits for termination and preserves queued input for explicit recovery", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-stop--running-stop",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const response = page.getByRole("button", { name: "Simulate stop response", exact: true });
  const sendResponse = page.getByRole("button", { name: "Simulate send response", exact: true });
  await expect(response).toBeDisabled();
  await editor.fill("First queued message");
  await send.click();
  await editor.fill("Second queued message");
  await send.click();
  await page.getByRole("button", { name: "Queued 2", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("listitem").first()).toContainText(
    "First queued message",
  );
  await expect(page.getByRole("dialog").getByRole("listitem").nth(1)).toContainText(
    "Second queued message",
  );
  await page.keyboard.press("Escape");
  await editor.fill("Separate draft");
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(send).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await response.click();
  await expect(response).toBeDisabled();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(page.getByText("Current turn is running", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Queued 2", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(page.getByText("2 messages have not been sent", { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(sendResponse).toBeDisabled();
  await expect(editor).toHaveText("Separate draft");
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(sendResponse).toBeEnabled();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await sendResponse.click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Queued 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Second queued message");
  await expect(page.getByRole("dialog")).not.toContainText("First queued message");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveText("Separate draft");
  await expect(send).toBeEnabled();
  await expect(stop).toBeEnabled();
});

test("definite stop failure retains the active turn and permits retry", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-stop--running-stop",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await editor.fill("Queued before stop failure");
  await send.click();
  await editor.fill("Draft retained after stop failure");
  await stop.click();
  await page.getByRole("button", { name: "Simulate stop failure", exact: true }).click();
  await expect(page.getByText("Stop failed", { exact: true })).toBeVisible();
  await expect(stop).toBeEnabled();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(send).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await expect(page.getByText("Current turn is running", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Draft retained after stop failure");
  await stop.click();
  await expect(page.getByText("Stop failed", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate stop response", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(editor).toHaveText("Draft retained after stop failure");
});

test("unknown stop waits without retry and hidden DEV recovery and lifecycle isolation remain usable", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/?path=/story/composer-input-and-send-stop--running-stop");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = preview.getByRole("button", { name: "Send", exact: true });
  const stop = preview.getByRole("button", { name: "Stop", exact: true });
  const response = preview.getByRole("button", { name: "Simulate stop response", exact: true });
  const unknown = preview.getByRole("button", { name: "Simulate stop unknown", exact: true });
  const sendResponse = preview.getByRole("button", { name: "Simulate send response", exact: true });
  const toggleDev = page.getByRole("switch", { name: "Show DEV controls", exact: true });
  await expect(unknown).toBeDisabled();
  await editor.fill("Retain this queued message");
  await send.click();
  await stop.click();
  await unknown.click();
  await expect(stop).toBeDisabled();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(response).toBeDisabled();
  await expect(unknown).toBeDisabled();
  await expect(preview.getByText("Stop failed", { exact: true })).toHaveCount(0);
  await expect(preview.getByText("Current turn is running", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(
    0,
  );
  await toggleDev.click();
  await expect(response).toHaveCount(0);
  await expect(stop).toHaveAttribute("data-pending", "true");
  await editor.fill("Draft edited while stopping");
  await expect(send).toBeEnabled();
  await expect(preview.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await toggleDev.click();
  await expect(response).toBeDisabled();
  await expect(sendResponse).toBeDisabled();
  await preview
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(preview.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  await toggleDev.click();
  await preview.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(preview.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Draft edited while stopping");
  await toggleDev.click();
  await expect(sendResponse).toBeEnabled();
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toBeEmpty();
  await expect(sendResponse).toBeDisabled();
  await expect(response).toBeDisabled();
  await expect(stop).toBeEnabled();
  await editor.fill("Clear this draft on reset");
  await stop.click();
  await expect(response).toBeEnabled();
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toBeEmpty();
  await expect(response).toBeDisabled();
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(response).toBeEnabled();
  await page.getByRole("button", { name: "Input", exact: true }).click();
  await page.locator('a[href="/?path=/story/composer-input-and-send-input--empty"]').click();
  await expect(editor).toBeEmpty();
  await expect(stop).toBeDisabled();
  await page.locator('a[href="/?path=/story/composer-input-and-send-stop--running-stop"]').click();
  await expect(editor).toBeEmpty();
  await expect(stop).toBeEnabled();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(response).toBeDisabled();
  await expect(preview.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
});

test("terminal before stop response defers recovery until the request settles", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-stop--running-stop",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const response = page.getByRole("button", { name: "Simulate stop response", exact: true });
  const sendResponse = page.getByRole("button", { name: "Simulate send response", exact: true });
  await stop.click();
  await editor.fill("Queued while stop is pending");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(response).toBeEnabled();
  await expect(sendResponse).toBeDisabled();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await response.click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(sendResponse).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await sendResponse.click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await stop.click();
  await response.click();
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
});
