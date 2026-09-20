import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  // No upload, preview read, or model request may escape the local simulation.
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (["fetch", "xhr"].includes(request.resourceType())) {
      const url = new URL(request.url());
      expect(request.method()).toBe("GET");
      expect(url.host).toBe("localhost:6006");
      expect(url.pathname).toMatch(/^\/(index\.json|project\.json|node_modules\/|@|src\/|sb-)/);
    }
    await route.continue();
  });
});

test("upload failure waits for manual retry and can fail again before succeeding", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-files--interactive");
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
  await expect(complete).toHaveCount(0);
  await expect(send).toBeDisabled();
  await editor.press("Enter");
  await expect(editor).toContainText("review-notes.txt");
  await retry.click();
  await expect(editor).toContainText("Uploading");
  await expect(retry).toHaveCount(0);
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

for (const { story, message, name, retryable } of [
  { story: "upload", message: "File upload failed.", name: "review-notes.txt", retryable: true },
  {
    story: "size",
    message: "The file exceeds the 50 MiB limit.",
    name: "review-notes.txt",
    retryable: false,
  },
  {
    story: "authorization",
    message: "File upload is not authorized. Open the current GUI launch link.",
    name: "review-notes.txt",
    retryable: false,
  },
  {
    story: "unsupported-image",
    message: "Unsupported image format. Use PNG, JPEG, GIF, or WebP.",
    name: "sample.svg",
    retryable: false,
  },
  {
    story: "interrupted",
    message: "Upload interrupted. Remove and add the file again.",
    name: "review-notes.txt",
    retryable: false,
  },
]) {
  test(`${story} preset preserves its recovery rules after reset`, async ({ page }) => {
    await page.goto(`http://localhost:6006/iframe.html?id=composer-attachments-failures--${story}`);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toContainText(message);
    await expect(
      page.getByRole("button", { name: `Retry upload ${name}`, exact: true }),
    ).toHaveCount(retryable ? 1 : 0);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await editor.press("Enter");
    await expect(editor).toContainText(message);
    await page.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
    await expect(editor).not.toContainText(name);
    await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
    await expect(editor).toContainText(message);
    await expect(page.getByRole("button", { name: `Remove ${name}`, exact: true })).toHaveCount(1);
  });
}

test("reset and story switching discard pending retries and failures", async ({ page }) => {
  await page.goto("http://localhost:6006/?path=/story/composer-attachments-failures--upload");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const retry = preview.getByRole("button", { name: "Retry upload review-notes.txt", exact: true });
  await retry.click();
  await expect(editor).toContainText("Uploading");
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toContainText("File upload failed.");
  await expect(
    preview.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }),
  ).toHaveCount(0);
  await retry.click();
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Expand all", exact: true }).first().click();
  await page.locator('a[href="/?path=/story/composer-attachments-files--interactive"]').click();
  await expect(editor).not.toContainText("review-notes.txt");
  await expect(retry).toHaveCount(0);
  await expect(
    preview.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }),
  ).toHaveCount(0);
  await preview.getByRole("button", { name: "Add sample file", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await preview.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await preview.getByRole("button", { name: "Fail upload review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
  await expect(editor).not.toContainText("File upload failed.");
});

test("interrupted attachment ignores its old response and recovers by adding the file again", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-attachments-failures--interrupted",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Upload interrupted.");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).toContainText("Upload interrupted.");
  await page.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Add sample file", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).toContainText("Uploaded");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
});

test("local unsupported image selection uses the actual format rejection", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-files--interactive");
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
  await expect(editor).toContainText("Unsupported image format. Use PNG, JPEG, GIF, or WebP.");
  await expect(
    page.getByRole("button", { name: "Retry upload fictional.heic", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Complete upload fictional.heic", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Remove fictional.heic", exact: true }).click();
  await expect(editor).not.toContainText("fictional.heic");
});
