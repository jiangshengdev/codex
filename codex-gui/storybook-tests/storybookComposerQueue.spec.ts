import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";
import { closePendingInputDrawer } from "./pendingInputDrawer";

test.use({ locale: "en" });

test("ordinary rejection preserves unsent content and gates new input until recovery", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-input--empty`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  await editor.fill("Keep the rejected message");
  await send.click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await editor.fill("Separate current draft");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await response.click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Separate current draft");
  await expect(send).toBeEnabled();
});

test("queued edits and order survive restoration and unknown-record removal", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-queue--running-queue`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const restore = page.getByRole("button", { name: "Simulate saved queue restore", exact: true });
  await editor.fill("First queued message");
  await send.click();
  await editor.fill("Second queued message");
  await send.click();
  await editor.fill("Separate current draft");
  await page.getByRole("button", { name: "Queued 2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("group", { name: "Second queued message", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Revised second message");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Revised second message",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move to first", exact: true }).click();
  await expect(dialog.getByRole("listitem").first()).toContainText("Revised second message");
  await page.keyboard.press("Escape");
  await restore.click();
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Separate current draft");
  await page.getByRole("button", { name: "Queued 2", exact: true }).click();
  await expect(dialog.getByRole("listitem").first()).toContainText("Revised second message");
  await expect(dialog.getByRole("listitem").nth(1)).toContainText("First queued message");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send unknown", exact: true }).click();
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await expect(page.getByText("Revised second message", { exact: true })).toBeVisible();
  await restore.click();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await expect(page.getByText(/Removing a local record does not cancel or retract/)).toBeVisible();
  await page.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(page.getByText("Sending result unknown", { exact: true })).toHaveCount(0);
  await response.click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Separate current draft");
});

test("restored queue recovery and unknown-record removal preserve a separate draft", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-queue--running-queue`);
  const preview = page;
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = preview.getByRole("button", { name: "Send", exact: true });
  const restore = preview.getByRole("button", {
    name: "Simulate saved queue restore",
    exact: true,
  });
  await editor.fill("Local record to discard");
  await send.click();
  await restore.click();
  await preview.getByRole("button", { name: "Continue sending", exact: true }).click();
  await preview.getByRole("button", { name: "Queued 1", exact: true }).click();
  await expect(preview.getByRole("dialog")).toContainText("Local record to discard");
  await closePendingInputDrawer(
    page,
    preview.getByRole("button", { name: "Queued 1", exact: true }),
  );
  await editor.fill("Separate draft");
  await expect(editor).toHaveText("Separate draft");
  await expect(send).toBeEnabled();
  await preview
    .getByRole("button", { name: "Simulate current turn completed", exact: true })
    .click();
  await preview.getByRole("button", { name: "Simulate send unknown", exact: true }).click();
  await preview.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(preview.getByText("Sending result unknown", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Separate draft");
});
