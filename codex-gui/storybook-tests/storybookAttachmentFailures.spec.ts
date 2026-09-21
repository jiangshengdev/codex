import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("upload failure waits for manual retry and can fail again before succeeding", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--interactive`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const retry = page.getByRole("button", { name: "Retry upload review-notes.txt", exact: true });
  const complete = page.getByRole("button", {
    name: "Complete upload review-notes.txt",
    exact: true,
  });
  await page.getByRole("button", { name: "Add sample file", exact: true }).click();
  await page.getByRole("button", { name: "Fail upload review-notes.txt", exact: true }).click();
  await expect(editor).toContainText("File upload failed.");
  await expect(retry).toBeEnabled();
  await expect(send).toBeDisabled();
  await editor.press("Enter");
  await expect(editor).toContainText("review-notes.txt");
  await retry.click();
  await expect(editor).toContainText("Uploading");
  await expect(retry).toBeDisabled();
  await expect(editor).not.toContainText("File upload failed.");
  await expect(send).toBeDisabled();
  await editor.press("Enter");
  await expect(editor).toContainText("review-notes.txt");
  await page.getByRole("button", { name: "Fail upload review-notes.txt", exact: true }).click();
  await expect(editor).toContainText("File upload failed.");
  await retry.click();
  await complete.click();
  await expect(editor).toContainText("Uploaded");
  await expect(send).toBeEnabled();
  await expect(retry).toHaveCount(0);
});

for (const { story, message, details, name, retryable } of [
  {
    story: "upload",
    message: "File upload failed.",
    details: "File upload failed. Retry the upload, or remove and add the file again.",
    name: "review-notes.txt",
    retryable: true,
  },
  {
    story: "size",
    message: "File too large",
    details: "The file exceeds the 50 MiB limit.",
    name: "review-notes.txt",
    retryable: false,
  },
  {
    story: "authorization",
    message: "Upload not authorized",
    details: "File upload is not authorized. Open the current GUI launch link.",
    name: "review-notes.txt",
    retryable: false,
  },
  {
    story: "interrupted",
    message: "Upload interrupted",
    details: "Upload interrupted. Remove and add the file again.",
    name: "review-notes.txt",
    retryable: false,
  },
]) {
  test(`${story} attachment preserves its recovery rules`, async ({ page }) => {
    await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-failures--${story}`);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toContainText(message);
    await expect(editor.getByRole("status")).toHaveText(message);
    const info = editor.getByRole("button", { name: `Failure details for ${name}`, exact: true });
    await info.click();
    const dialog = page.getByRole("dialog", { name: `Failure details for ${name}`, exact: true });
    await expect(dialog).toContainText(details);
    await page.keyboard.press("Escape");
    await expect(info).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close failure details", exact: true }).click();
    await expect(info).toBeFocused();
    await expect(
      page.getByRole("button", { name: `Retry upload ${name}`, exact: true }),
    ).toHaveCount(retryable ? 1 : 0);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await editor.press("Enter");
    await expect(editor).toContainText(message);
    await page.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
    await expect(editor).not.toContainText(name);
  });
}

test("removed attachment ignores a late upload failure", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--interactive`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await page.getByRole("button", { name: "Add sample file", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Fail upload review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
  await expect(editor).not.toContainText("File upload failed.");
});

test("interrupted attachment ignores its old response and recovers by adding the file again", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-failures--interrupted`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Upload interrupted");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).toContainText("Upload interrupted");
  await page.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Add sample file", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).toContainText("Uploaded");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
});

test("local HEIC selection uploads as an ordinary file", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--interactive`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "fictional.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("Fictional unsupported image"),
  });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor.getByRole("status")).toHaveText("Uploading");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry upload fictional.heic", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Complete upload fictional.heic", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("Uploaded");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(
    editor.getByRole("button", { name: "Preview fictional.heic", exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Failure details for fictional.heic", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Remove fictional.heic", exact: true }).click();
  await expect(editor).not.toContainText("fictional.heic");
});

test("unsupported image is shown as an uploaded ordinary file", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-attachments-files--image-as-file`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("sample.svg");
  await expect(editor.getByRole("status")).toHaveText("Uploaded");
  await expect(editor.getByRole("button", { name: "Preview sample.svg", exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
});
