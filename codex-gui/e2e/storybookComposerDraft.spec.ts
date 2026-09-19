import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("restored multi-paragraph skill draft remains editable and sendable", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--restored-draft");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Review this fictional change.");
  await expect(editor).toContainText("Keep the draft paragraphs and selected skill.");
  await expect(
    page.getByRole("group", { name: "preview-review skill details", exact: true }),
  ).toBeVisible();
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially(" More context.");
  await expect(editor).toContainText("More context.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(editor).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
});

test("failed saving retains edits and real Retry saving restores sending and persistence", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--restored-draft");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const failure = page.getByText("Changes could not be saved", { exact: true });
  const retry = page.getByRole("button", { name: "Retry saving", exact: true });
  await expect(
    page.getByRole("button", { name: "Simulate saving failure", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Simulate saving failure", exact: true }).click();
  await expect(failure).toBeVisible();
  await expect(send).toBeDisabled();
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially(" Keep these unsaved edits.");
  await retry.click();
  await expect(failure).toBeVisible();
  await expect(editor).toContainText("Keep these unsaved edits.");
  await page.getByRole("button", { name: "Restore simulated storage", exact: true }).click();
  await expect(failure).toBeVisible();
  await expect(send).toBeDisabled();
  await retry.click();
  await expect(failure).toHaveCount(0);
  await expect(send).toBeEnabled();
  await page.getByRole("button", { name: "Simulate leaving", exact: true }).click();
  await page.getByRole("button", { name: "Simulate returning", exact: true }).click();
  await expect(editor).toContainText("Keep these unsaved edits.");
  await expect(
    page.getByRole("group", { name: "preview-review skill details", exact: true }),
  ).toBeVisible();
  await send.click();
  await expect(editor).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
});

test("leaving and returning restores live text and skills while reset discards them", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--restored-draft");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.focus();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await expect(editor).toBeEmpty();
  await editor.pressSequentially("New first paragraph");
  await editor.press("Shift+Enter");
  await editor.pressSequentially("New second paragraph $preview");
  await page.getByRole("option", { name: /preview-review/ }).click();
  await page.getByRole("button", { name: "Simulate leaving", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate returning", exact: true }).click();
  await expect(editor).toContainText("New first paragraph");
  await expect(editor).toContainText("New second paragraph");
  await expect(
    page.getByRole("group", { name: "preview-review skill details", exact: true }),
  ).toBeVisible();
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially(" After returning.");
  await expect(editor).toContainText("After returning.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(editor).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  const leave = page.getByRole("button", { name: "Simulate leaving", exact: true });
  await expect(leave).toBeDisabled();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await expect(leave).toBeDisabled();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(leave).toBeDisabled();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await leave.click();
  await page.getByRole("button", { name: "Simulate returning", exact: true }).click();
  await expect(editor).toBeEmpty();
  await editor.pressSequentially("Another visit and another send");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await expect(leave).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toContainText("Review this fictional change.");
  await expect(editor).not.toContainText("New first paragraph");
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeDisabled();
});

test("draft simulation keeps product actions without DEV and isolates story navigation", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/?path=/story/composer-input-and-send--restored-draft");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const failure = preview.getByText("Changes could not be saved", { exact: true });
  await preview.getByRole("button", { name: "Simulate saving failure", exact: true }).click();
  await preview.getByRole("button", { name: "Restore simulated storage", exact: true }).click();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Simulate leaving", exact: true })).toHaveCount(
    0,
  );
  await expect(preview.getByText(/^Local simulation\./)).toBeVisible();
  await preview.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(failure).toHaveCount(0);
  await editor.press("ControlOrMeta+End");
  await editor.pressSequentially(" Discard when switching stories.");
  await page.locator('a[href="/?path=/story/composer-input-and-send--empty"]').click();
  await expect(editor).toBeEmpty();
  await page.locator('a[href="/?path=/story/composer-input-and-send--restored-draft"]').click();
  await expect(editor).toContainText("Review this fictional change.");
  await expect(editor).not.toContainText("Discard when switching stories.");
  await expect(failure).toHaveCount(0);
});
