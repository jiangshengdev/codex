import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (["fetch", "xhr"].includes(request.resourceType())) {
      const url = new URL(request.url());
      expect(request.method()).toBe("GET");
      expect(url.origin).toBe("http://localhost:6006");
      // WebKit reports the real decoder's local blob reads as fetch requests.
      if (url.protocol !== "blob:") {
        expect(url.pathname).toMatch(/^\/(index\.json|project\.json|node_modules\/|@|src\/|sb-)/);
      }
    }
    await route.continue();
  });
});

for (const [story, message] of [
  ["loading", "Loading preview…"],
  ["read-failure", "Preview read failed"],
  ["decode-failure", "Cannot display preview"],
] as const) {
  test(`${story} preset keeps upload ready and can reset`, async ({ page }) => {
    await page.goto(`http://localhost:6006/iframe.html?id=composer-attachments-images--${story}`);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toContainText(message);
    await expect(editor).toContainText("Uploaded");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await expect(editor.getByRole("button", { name: /Retry upload/ })).toHaveCount(0);
    await editor.press("Enter");
    await expect(editor).toContainText(message);
    await page.getByRole("button", { name: "Remove sample.png", exact: true }).click();
    await expect(editor).not.toContainText("sample.png");
    await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
    await expect(editor).toContainText(message);
  });
}

test("sample image uploads before its independently controlled preview opens", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-images--interactive");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await page.getByRole("button", { name: "Add sample image", exact: true }).click();
  await expect(editor).toContainText("Uploading");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Complete upload sample.png", exact: true }).click();
  await expect(editor).toContainText("Loading preview…");
  await expect(editor).toContainText("Uploaded");
  await expect(send).toBeEnabled();
  await page.getByRole("button", { name: "Complete preview sample.png", exact: true }).click();
  const preview = editor.getByRole("button", { name: "Preview sample.png", exact: true });
  await preview.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("img", { name: "sample.png", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close image preview", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(preview).toBeFocused();
  const blobUrl = await preview.locator("img").evaluate((element: HTMLImageElement) => element.src);
  await page.getByRole("button", { name: "Remove sample.png", exact: true }).click();
  await expect(editor).not.toContainText("sample.png");
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return false;
      } catch {
        return true;
      }
    }, blobUrl),
  ).toBe(true);
});

test("local image bytes and filename survive upload and preview", async ({ page }) => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-images--interactive");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "fictional-local.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Uploading");
  await page
    .getByRole("button", { name: "Complete upload fictional-local.png", exact: true })
    .click();
  await expect(editor).toContainText("Loading preview…");
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
      return {
        width: element.naturalWidth,
        height: element.naturalHeight,
        data: btoa(String.fromCharCode(...bytes)),
      };
    }),
  ).toEqual({ width: 1, height: 1, data: png });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("pending reads cancel on removal and reset without affecting the next image", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-images--loading");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const complete = page.getByRole("button", { name: "Complete preview sample.png", exact: true });
  await expect(complete).toBeVisible();
  await page.getByRole("button", { name: "Remove sample.png", exact: true }).click();
  await expect(complete).toHaveCount(0);
  await expect(editor).not.toContainText("sample.png");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(complete).toHaveCount(1);
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(complete).toHaveCount(1);
  await complete.click();
  await expect(
    editor.getByRole("button", { name: "Preview sample.png", exact: true }),
  ).toBeVisible();
});

for (const [control, message] of [
  ["Fail preview read sample.png", "Preview read failed"],
  ["Fail preview decode sample.png", "Cannot display preview"],
] as const) {
  test(`${control} is independent of successful upload`, async ({ page }) => {
    await page.goto("http://localhost:6006/iframe.html?id=composer-attachments-images--loading");
    await page.getByRole("button", { name: control, exact: true }).click();
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toContainText(message);
    await expect(editor).toContainText("Uploaded");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  });
}

for (const { control, status, previews, retries } of [
  { control: "Complete preview sample.png", status: "Uploaded", previews: 1, retries: 0 },
  {
    control: "Fail preview read sample.png",
    status: "Preview read failed",
    previews: 0,
    retries: 1,
  },
  {
    control: "Fail preview decode sample.png",
    status: "Cannot display preview",
    previews: 0,
    retries: 0,
  },
]) {
  test(`read failure retry supports ${control}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(
      "http://localhost:6006/iframe.html?id=composer-attachments-images--read-failure",
    );
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    const retry = editor.getByRole("button", { name: "Retry preview sample.png", exact: true });
    await expect(retry).toBeVisible();
    await retry.focus();
    await expect(page.getByRole("tooltip")).toHaveText("Retry preview sample.png");
    await retry.press("Enter");
    await expect(retry).toBeDisabled();
    await retry.press("Enter");
    await expect(editor).toContainText("Preview read failed");
    await expect(editor).toContainText("Uploaded");
    await expect(page.getByRole("button", { name: /^Complete upload / })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Complete preview sample.png", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: control, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Complete preview sample.png", exact: true }),
    ).toHaveCount(0);
    await expect(editor).toContainText(status);
    await expect(
      editor.getByRole("button", { name: "Preview sample.png", exact: true }),
    ).toHaveCount(previews);
    await expect(retry).toHaveCount(retries);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  });
}

test("switching stories cancels a read and opens a fresh ready preview", async ({ page }) => {
  await page.goto("http://localhost:6006/?path=/story/composer-attachments-images--loading");
  const frame = page.frameLocator("#storybook-preview-iframe");
  await expect(frame.getByText("Loading preview…", { exact: false })).toBeVisible();
  await page.locator('a[href="/?path=/story/composer-attachments-images--ready"]').click();
  await expect(
    frame.getByRole("button", { name: "Complete preview sample.png", exact: true }),
  ).toHaveCount(0);
  await frame.getByRole("button", { name: "Preview sample.png", exact: true }).click();
  await expect(
    frame.getByRole("dialog").getByRole("img", { name: "sample.png", exact: true }),
  ).toBeVisible();
});
