import { expect, test } from "@playwright/test";

declare global {
  function recordProductStorageAccess(operation: string): Promise<void>;
}

test.use({ locale: "en" });

test("preserves edits and order across priority delivery and ordinary recovery", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-recovery--combined");
  const openQueue = page
    .getByRole("group", { name: "Pending: Queued 3", exact: true })
    .getByRole("button", { name: "Queued 3", exact: true });
  await openQueue.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("group", { name: "Ordinary message 3", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Revised third message");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Revised third message",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move to first", exact: true }).click();
  await expect(dialog.getByRole("listitem").first()).toContainText("Revised third message");
  await page.keyboard.press("Escape");
  await expect(openQueue).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toHaveValue(
    "Separate main draft",
  );
  const complete = page.getByRole("button", {
    name: "Simulate current turn completed",
    exact: true,
  });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const confirm = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toBeVisible();
  await complete.click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await response.click();
  await expect(confirm).toBeEnabled();
  await expect(complete).toBeDisabled();
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await complete.click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 2");
  await expect(dialog).not.toContainText("Revised third message");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await expect(response).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await response.click();
  await confirm.click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await page
    .getByRole("group", { name: "Pending: Queued 2", exact: true })
    .getByRole("button", { name: "Queued 2", exact: true })
    .click();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 2");
  await expect(dialog.getByRole("listitem").nth(1)).toContainText("Revised third message");
  await expect(dialog).not.toContainText("Ordinary message 1");
});

test("same-page navigation and reset discard pending work without product connections or storage", async ({
  page,
}) => {
  const storageAccesses: string[] = [];
  const businessRequests: string[] = [];
  const businessSockets: string[] = [];
  await page.exposeFunction("recordProductStorageAccess", (operation: string) => {
    storageAccesses.push(operation);
  });
  await page.addInitScript(() => {
    // Observe keys only, never read an existing product record or capture its value.
    // This prefix belongs to BrowserPersistenceStore, the production persistence owner.
    const localGet = localStorage.getItem.bind(localStorage);
    const sessionGet = sessionStorage.getItem.bind(sessionStorage);
    const localSet = localStorage.setItem.bind(localStorage);
    const sessionSet = sessionStorage.setItem.bind(sessionStorage);
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("codex-gui.browserPersistence.")) {
        void window.recordProductStorageAccess("getItem");
        return null;
      }
      return this === localStorage ? localGet(key) : sessionGet(key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("codex-gui.browserPersistence.")) {
        void window.recordProductStorageAccess("setItem");
        return;
      }
      if (this === localStorage) localSet(key, value);
      else sessionSet(key, value);
    };
  });
  page.on("request", (request) => {
    if (!["fetch", "xhr"].includes(request.resourceType())) return;
    const url = new URL(request.url());
    const storybookAsset =
      request.method() === "GET" &&
      url.host === "localhost:6006" &&
      (url.pathname === "/index.json" ||
        url.pathname === "/project.json" ||
        url.pathname.startsWith("/node_modules/") ||
        url.pathname.startsWith("/@") ||
        url.pathname.startsWith("/src/") ||
        url.pathname.startsWith("/sb-"));
    if (!storybookAsset) businessRequests.push(`${request.method()} ${request.url()}`);
  });
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    const storybookSocket =
      url.host === "localhost:6006" &&
      (url.pathname === "/" || url.pathname === "/storybook-server-channel") &&
      url.searchParams.has("token");
    if (!storybookSocket) businessSockets.push(socket.url());
  });
  await page.goto("http://localhost:6006/?path=/story/composer-pending-input-recovery--unsent");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const resume = preview.getByRole("button", { name: "Continue sending", exact: true });
  const restarting = preview.getByRole("button", { name: "Restart simulation", exact: true });
  await resume.click();
  await expect(
    preview.getByRole("button", { name: "Resuming sending", exact: true }),
  ).toBeDisabled();
  await restarting.click();
  await expect(resume).toBeEnabled();
  await expect(
    preview.getByRole("button", { name: "Release recovery display", exact: true }),
  ).toHaveCount(0);
  await resume.click();
  await preview.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await preview.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: "Simulate runtime confirmation", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "Guiding", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: "Simulate guide success", exact: true }),
  ).toBeEnabled();
  await expect(
    preview.getByRole("button", { name: "Simulate runtime confirmation", exact: true }),
  ).toBeDisabled();
  await preview.getByRole("button", { name: "Simulate guide unknown", exact: true }).click();
  await expect(preview.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Unsent", exact: true }).click();
  await expect(resume).toBeEnabled();
  await expect(preview.getByText("Guide status unknown", { exact: true })).toHaveCount(0);
  await expect(preview.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Simulate runtime confirmation", exact: true }),
  ).toBeDisabled();
  await resume.click();
  await preview.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await preview.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await preview.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(preview.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  expect(storageAccesses).toEqual([]);
  expect(businessRequests).toEqual([]);
  expect(businessSockets).toEqual([]);
});

test.describe("Chinese narrow preview", () => {
  test.use({ locale: "zh-CN", viewport: { width: 390, height: 700 } });

  test("reads and scrolls long content in dark mode with keyboard focus restored", async ({
    page,
  }) => {
    await page.goto(
      "http://localhost:6006/iframe.html?id=composer-pending-input-browsing--both-lanes",
    );
    await page.getByRole("radio", { name: "深色主题", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const trigger = page
      .getByRole("group", { name: "待处理：引导 23，排队 23", exact: true })
      .getByRole("button", { name: "引导 23", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "待处理详情", exact: true })).toBeVisible();
    // The heading receives initial focus; the close control precedes it in tab order.
    await expect(dialog.getByRole("heading", { name: "待处理详情", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "引导中 23", exact: true })).toBeFocused();
    const viewFull = dialog
      .getByRole("group", { name: /^Ordinary message 1 / })
      .getByRole("button", { name: "查看全文", exact: true });
    await viewFull.focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: "待处理详情", exact: true }).last();
    const ending = detail.getByText(/END OF LONG MESSAGE/);
    await expect(ending).toBeVisible();
    await ending.scrollIntoViewIfNeeded();
    await expect(ending).toBeInViewport();
    expect(
      await detail.evaluate((element) => {
        return [element, ...element.querySelectorAll("*")].some((child) => child.scrollTop > 0);
      }),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const bounds = await detail.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(/END OF LONG MESSAGE/)).toBeHidden();
    await expect(viewFull).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
