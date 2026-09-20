import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (["fetch", "xhr"].includes(request.resourceType())) {
      const url = new URL(request.url());
      expect(request.method()).toBe("GET");
      expect(url.origin).toBe("http://localhost:6006");
      if (url.protocol !== "blob:") {
        expect(url.pathname).toMatch(/^\/(index\.json|project\.json|node_modules\/|@|src\/|sb-)/);
      }
    }
    await route.continue();
  });
});

test("mixed results preset resets and removes each state without disturbing its neighbors", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-mixed--mixed-results");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const statuses = editor.getByRole("status");
  await expect(statuses).toHaveText(["File upload failed.", "Ready", "Uploading"]);
  const image = editor
    .getByRole("button", { name: "Preview sample.png", exact: true })
    .locator("img");
  await expect(image).toBeVisible();
  const url = await image.getAttribute("src");
  await page.getByRole("button", { name: "Remove checklist.txt", exact: true }).click();
  await page.getByRole("button", { name: "Complete upload checklist.txt", exact: true }).click();
  await expect(statuses).toHaveText(["File upload failed.", "Ready"]);
  await expect(editor).not.toContainText("checklist.txt");
  await page.getByRole("button", { name: "Remove review-notes.txt", exact: true }).click();
  await expect(statuses).toHaveText(["Ready"]);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Remove sample.png", exact: true }).click();
  await expect(statuses).toHaveCount(0);
  expect(
    await page.evaluate(async (src) => {
      try {
        await fetch(src ?? "");
        return false;
      } catch {
        return true;
      }
    }, url),
  ).toBe(true);
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(statuses).toHaveText(["File upload failed.", "Ready", "Uploading"]);
  await expect(image).toBeVisible();
});

test("mixed sample preserves input order through independent results and targeted retries", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-mixed--interactive");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await page.getByRole("button", { name: "Add mixed sample", exact: true }).click();
  const order = editor.getByRole("button", { name: /^Remove / });
  await expect(order).toHaveCount(3);
  expect(
    await order.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    ),
  ).toEqual(["Remove review-notes.txt", "Remove sample.png", "Remove checklist.txt"]);
  await page.getByRole("button", { name: "Complete upload sample.png", exact: true }).click();
  await page.getByRole("button", { name: "Complete preview sample.png", exact: true }).click();
  const preview = editor.getByRole("button", { name: "Preview sample.png", exact: true });
  await expect(preview).toBeVisible();
  const src = await preview.locator("img").getAttribute("src");
  await page.getByRole("button", { name: "Fail upload review-notes.txt", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText([
    "File upload failed.",
    "Ready",
    "Uploading",
  ]);
  await expect(send).toBeDisabled();
  await editor.press("Enter");
  await expect(editor).toContainText("Review this fictional attachment:");
  const retry = page.getByRole("button", { name: "Retry upload review-notes.txt", exact: true });
  await retry.click();
  await page.getByRole("button", { name: "Fail upload review-notes.txt", exact: true }).click();
  await retry.click();
  await page.getByRole("button", { name: "Complete upload checklist.txt", exact: true }).click();
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText(["Ready", "Ready", "Ready"]);
  expect(
    await order.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    ),
  ).toEqual(["Remove review-notes.txt", "Remove sample.png", "Remove checklist.txt"]);
  await expect(preview.locator("img")).toHaveAttribute("src", src ?? "");
  await expect(send).toBeEnabled();
  await send.click();
  await editor.press("Enter");
  await expect(order).toHaveCount(3);
});

test("one local selection keeps text, file and original image through out-of-order completion", async ({
  page,
}) => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-mixed--interactive");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles([
    { name: "fictional-local.txt", mimeType: "text/plain", buffer: Buffer.from("Fictional notes") },
    { name: "fictional-local.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
  ]);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor.getByRole("status")).toHaveText(["Uploading", "Uploading"]);
  await page
    .getByRole("button", { name: "Complete upload fictional-local.png", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete preview fictional-local.png", exact: true })
    .click();
  await page.getByRole("button", { name: "Preview fictional-local.png", exact: true }).click();
  const image = page
    .getByRole("dialog")
    .getByRole("img", { name: "fictional-local.png", exact: true });
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(async (element: HTMLImageElement) => {
      const bytes = new Uint8Array(await (await fetch(element.src)).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }),
  ).toBe(png);
  await page.getByRole("button", { name: "Close image preview", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete upload fictional-local.txt", exact: true })
    .click();
  await expect(editor.getByRole("status")).toHaveText(["Ready", "Ready"]);
  expect(
    await editor
      .getByRole("button", { name: /^Remove / })
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
  ).toEqual(["Remove fictional-local.txt", "Remove fictional-local.png"]);
  await expect(editor).toContainText("Review this fictional attachment:");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
});

test("reset and story switching release the mixed batch and hidden DEV keeps real controls", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/?path=/story/composer-attachments-mixed--mixed-results");
  const frame = page.frameLocator("#storybook-preview-iframe");
  const editor = frame.getByRole("combobox", { name: "Message Codex", exact: true });
  const preview = editor.getByRole("button", { name: "Preview sample.png", exact: true });
  await expect(preview).toBeVisible();
  const oldUrl = await preview.locator("img").getAttribute("src");
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(frame.getByRole("button", { name: "Add mixed sample", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("status")).toHaveText([
    "File upload failed.",
    "Ready",
    "Uploading",
  ]);
  await expect(editor).toContainText("Review this fictional attachment:");
  await preview.click();
  await expect(frame.getByRole("dialog")).toBeVisible();
  await frame.getByRole("button", { name: "Close image preview", exact: true }).click();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await frame.getByRole("button", { name: "Retry upload review-notes.txt", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText(["Uploading", "Ready", "Uploading"]);
  await frame.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText([
    "File upload failed.",
    "Ready",
    "Uploading",
  ]);
  await expect(preview).toBeVisible();
  expect(
    await editor.evaluate(async (_element, src) => {
      try {
        await fetch(src ?? "");
        return false;
      } catch {
        return true;
      }
    }, oldUrl),
  ).toBe(true);
  const resetUrl = await preview.locator("img").getAttribute("src");
  await frame.getByRole("button", { name: "Retry upload review-notes.txt", exact: true }).click();
  await page.locator('a[href="/?path=/story/composer-attachments-mixed--interactive"]').click();
  await expect(editor.getByRole("status")).toHaveCount(0);
  expect(
    await editor.evaluate(async (_element, src) => {
      try {
        await fetch(src ?? "");
        return false;
      } catch {
        return true;
      }
    }, resetUrl),
  ).toBe(true);
  await expect(frame.getByRole("button", { name: /^Complete upload / })).toHaveCount(0);
  await frame.getByRole("button", { name: "Add mixed sample", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText(["Uploading", "Uploading", "Uploading"]);
  await frame.getByRole("button", { name: "Remove sample.png", exact: true }).click();
  await frame.getByRole("button", { name: "Fail upload sample.png", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText(["Uploading", "Uploading"]);
  await expect(editor).not.toContainText("sample.png");
});
