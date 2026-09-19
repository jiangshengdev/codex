import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("guide response leaves input pending until runtime acceptance", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--running-guide",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const guide = page.getByRole("button", { name: "Guide", exact: true });
  const response = page.getByRole("button", { name: "Simulate guide response", exact: true });
  const confirmation = page.getByRole("button", {
    name: "Simulate guide runtime confirmation",
    exact: true,
  });
  await expect(guide).toBeDisabled();
  await editor.fill("Guide the running turn");
  await guide.click();
  await expect(editor).toBeEmpty();
  await expect(response).toBeEnabled();
  await expect(confirmation).toBeDisabled();
  await editor.fill("Separate draft");
  await response.click();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toBeVisible();
  await expect(response).toBeDisabled();
  await confirmation.click();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Separate draft");
  await expect(guide).toBeEnabled();
});

test("guide rejection recovers separately from unsteerable priority delivery", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--running-guide",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const guide = page.getByRole("button", { name: "Guide", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const response = page.getByRole("button", { name: "Simulate guide response", exact: true });
  await editor.fill("Recover this guide");
  await guide.click();
  await page.getByRole("button", { name: "Simulate guide failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await editor.fill("Separate draft");
  await expect(guide).toBeDisabled();
  await expect(send).toBeDisabled();
  await expect(response).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await response.click();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Separate draft");
  await send.click();
  await editor.fill("Send this first");
  await guide.click();
  await page.getByRole("button", { name: "Simulate guide refusal", exact: true }).click();
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Send this first", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
});

test("unknown guidance keeps queue editing and hidden DEV recovery available without resending", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/?path=/story/composer-input-and-send-guide--running-guide",
  );
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = preview.getByRole("button", { name: "Send", exact: true });
  const guide = preview.getByRole("button", { name: "Guide", exact: true });
  const response = preview.getByRole("button", { name: "Simulate guide response", exact: true });
  const confirmation = preview.getByRole("button", {
    name: "Simulate guide runtime confirmation",
    exact: true,
  });
  await editor.fill("First ordinary message");
  await send.click();
  await editor.fill("Second ordinary message");
  await send.click();
  await editor.fill("Uncertain guidance");
  await guide.click();
  await preview.getByRole("button", { name: "Simulate guide unknown", exact: true }).click();
  await expect(preview.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect(response).toBeDisabled();
  await expect(preview.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(
    0,
  );
  await expect(
    preview.getByRole("button", { name: "Remove local record", exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByText(/Removing a local record does not cancel or retract/),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toHaveCount(0);
  await expect(preview.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await editor.fill("Separate draft");
  await preview.getByRole("button", { name: "Queued 2", exact: true }).click();
  const dialog = preview.getByRole("dialog");
  await dialog
    .getByRole("group", { name: "Second ordinary message", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await preview
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Edited ordinary message");
  await preview.getByRole("button", { name: "Save", exact: true }).click();
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Edited ordinary message",
      exact: true,
    })
    .click();
  await preview.getByRole("menuitem", { name: "Move to first", exact: true }).click();
  await expect(
    dialog.getByRole("group", { name: "Edited ordinary message", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toBeDisabled();
  await confirmation.click();
  await expect(preview.getByText("Guide status unknown", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Separate draft");
  await expect(preview.getByRole("button", { name: "Queued 2", exact: true })).toBeVisible();
  await guide.click();
  await preview.getByRole("button", { name: "Simulate guide failure", exact: true }).click();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await preview.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(preview.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toBeEnabled();
  await response.click();
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toBeEmpty();
  await expect(confirmation).toBeDisabled();
  await expect(preview.getByRole("button", { name: "Queued 2", exact: true })).toHaveCount(0);
  await editor.fill("Dispose unresolved guidance");
  await guide.click();
  await page.getByRole("button", { name: "Input", exact: true }).click();
  await page.locator('a[href="/?path=/story/composer-input-and-send-input--empty"]').click();
  await expect(editor).toBeEmpty();
  await page
    .locator('a[href="/?path=/story/composer-input-and-send-guide--running-guide"]')
    .click();
  await expect(editor).toBeEmpty();
  await expect(response).toBeDisabled();
  await expect(confirmation).toBeDisabled();
});
