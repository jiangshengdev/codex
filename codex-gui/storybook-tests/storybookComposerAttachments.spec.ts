import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("local file selection waits for manual completion and preserves the draft", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--interactive`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await editor.fill("Review this file: ");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Fictional notes") });
  await expect(editor).toContainText("notes.txt");
  await expect(editor).toContainText("Uploading");
  await expect(send).toBeDisabled();
  await editor.press("Enter");
  await expect(editor).toContainText("Review this file:");
  await page.getByRole("button", { name: "Complete upload notes.txt", exact: true }).click();
  await expect(editor).toContainText("Uploaded");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(editor).toContainText("notes.txt");
  await page.getByRole("button", { name: "Remove notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("notes.txt");
});

test("uploading attachment stays removed after late completion", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--uploading`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
});

test("ready preset and repeated sample selection use independent uploads", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--ready`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Uploaded");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Add sample file", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Remove review-notes.txt", exact: true }),
  ).toHaveCount(2);
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("Uploading");
});
