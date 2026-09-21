import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("real Composer gates empty input and keeps send response separate from runtime events", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-input--empty`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const confirm = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  const complete = page.getByRole("button", {
    name: "Simulate current turn completed",
    exact: true,
  });
  await expect(send).toBeDisabled();
  await editor.fill("   ");
  await expect(send).toBeDisabled();
  await editor.fill("First paragraph");
  await editor.press("Shift+Enter");
  await editor.pressSequentially("Second paragraph");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(editor).toBeEmpty();
  await expect(response).toBeEnabled();
  await expect(confirm).toBeDisabled();
  await expect(complete).toBeDisabled();
  await response.click();
  await expect(response).toBeDisabled();
  await expect(confirm).toBeEnabled();
  await expect(complete).toBeDisabled();
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(page.getByText("Simulation is idle", { exact: true })).toBeVisible();
});

test("selected skills follow the real validation gate and remain removable", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-input--empty`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await editor.fill("$preview");
  await page.getByRole("option", { name: /preview-review/ }).click();
  await expect(send).toBeEnabled();
  await page.getByRole("button", { name: "Simulate skill unavailable", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "preview-review skill details, Invalid skill", exact: true }),
  ).toBeVisible();
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Restore simulated skill", exact: true }).click();
  await expect(send).toBeEnabled();
  await editor.focus();
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await expect(editor).toBeEmpty();
  await expect(send).toBeDisabled();
});
