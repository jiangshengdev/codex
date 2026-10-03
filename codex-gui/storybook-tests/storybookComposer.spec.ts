import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("real Composer gates empty input and clears the submitted draft", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-input--empty`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await editor.fill("   ");
  await expect(send).toBeDisabled();
  await editor.fill("First paragraph");
  await editor.press("Shift+Enter");
  await editor.pressSequentially("Second paragraph");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(editor).toBeEmpty();
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
