import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("stop failure preset keeps the turn active and allows retry without clearing the draft", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send-stop--stop-failed");
  const failed = page.getByText("Stop failed", { exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(failed).toBeVisible();
  await expect(stop).toBeEnabled();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Keep this draft while stopping.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await expect(page.getByText("Current turn is running", { exact: true })).toBeVisible();
  await stop.click();
  await expect(failed).toHaveCount(0);
  await expect(stop).toHaveAttribute("data-pending", "true");
  await page.getByRole("button", { name: "Simulate stop response", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Keep this draft while stopping.");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(failed).toBeVisible();
  await expect(stop).toBeEnabled();
});

test("unknown stop preset does not retry and retains input with DEV hidden and across reset", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/?path=/story/composer-input-and-send-stop--stop-unknown");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const stop = preview.getByRole("button", { name: "Stop", exact: true });
  const response = preview.getByRole("button", { name: "Simulate stop response", exact: true });
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(response).toBeDisabled();
  await expect(preview.getByText("Stop failed", { exact: true })).toHaveCount(0);
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toHaveCount(0);
  await editor.fill("Editable while stop is unknown");
  await expect(preview.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(preview.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await expect(stop).toBeDisabled();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await preview
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Editable while stop is unknown");
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(editor).toHaveText("Keep this draft while stopping.");
  await page.getByRole("button", { name: "Input", exact: true }).click();
  await page.getByRole("link", { name: "Empty", exact: true }).click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toBeEmpty();
  await page.getByRole("link", { name: "Stop Unknown", exact: true }).click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(response).toBeDisabled();
});

test("accepted stop preset remains active and allows queueing until runtime termination", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-stop--stop-accepted",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const response = page.getByRole("button", { name: "Simulate stop response", exact: true });
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(response).toBeDisabled();
  await expect(page.getByText("Current turn is running", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await editor.fill("Separate draft after accepted stop");
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Separate draft after accepted stop");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(response).toBeDisabled();
});

test("stop request preset retains editable input and waits separately for response and termination", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-stop--stop-request-pending",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  const response = page.getByRole("button", { name: "Simulate stop response", exact: true });
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(stop).toBeDisabled();
  await expect(editor).toHaveText("Keep this draft while stopping.");
  await expect(send).toBeEnabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await editor.fill("Edited while waiting");
  await response.click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(page.getByText("Current turn is running", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate current turn interrupted", exact: true })
    .click();
  await expect(stop).not.toHaveAttribute("data-pending");
  await expect(editor).toHaveText("Edited while waiting");
  await expect(send).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(stop).toHaveAttribute("data-pending", "true");
  await expect(response).toBeEnabled();
  await expect(editor).toHaveText("Keep this draft while stopping.");
});
