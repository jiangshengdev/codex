import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("local file selection waits for manual completion and preserves the draft", async ({
  page,
}) => {
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    if (!["fetch", "xhr"].includes(request.resourceType())) return;
    const url = new URL(request.url());
    if (
      request.method() !== "GET" ||
      url.host !== "localhost:6006" ||
      !/^\/(index\.json|project\.json|node_modules\/|@|src\/|sb-)/.test(url.pathname)
    ) {
      businessRequests.push(`${request.method()} ${url.pathname}`);
    }
  });
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-files--interactive");
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
  expect(businessRequests).toEqual([]);
});

test("DEV visibility and story switching preserve isolation while uploads are pending", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/?path=/story/composer-attachments-files--uploading");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Uploading");
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(preview.getByRole("button", { name: "Add sample file", exact: true })).toHaveCount(
    0,
  );
  await expect(editor).toContainText("Uploading");
  await expect(preview.getByText(/^Files stay in this browser\./)).toBeVisible();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await page.locator('a[href="/?path=/story/composer-attachments-files--interactive"]').click();
  await expect(editor).not.toContainText("review-notes.txt");
  await expect(
    preview.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }),
  ).toHaveCount(0);
  await preview.getByRole("button", { name: "Add sample file", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
  await expect(
    preview.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }),
  ).toHaveCount(0);
});

test("uploading preset survives late completion after removal and restarts independently", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-files--uploading");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Uploading");
  await page.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor).not.toContainText("review-notes.txt");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await expect(
    page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }),
  ).toHaveCount(1);
});

test("ready preset and repeated sample selection use independent uploads", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-files--ready");
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
