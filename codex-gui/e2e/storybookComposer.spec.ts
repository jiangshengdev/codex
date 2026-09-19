import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("real Composer gates empty input and keeps send response separate from runtime events", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send-input--empty");
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
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send-input--empty");
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

test("DEV visibility preserves the Composer and reset and story switching release local work", async ({
  page,
}) => {
  const productAccesses: string[] = [];
  await page.exposeFunction("recordProductStorageAccess", (operation: string) => {
    productAccesses.push(operation);
  });
  await page.addInitScript(() => {
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
  page.on("websocket", (socket) => {
    const url = new URL(socket.url());
    if (
      url.host !== "localhost:6006" ||
      !["/", "/storybook-server-channel"].includes(url.pathname) ||
      !url.searchParams.has("token")
    ) {
      businessRequests.push(`WebSocket ${url.pathname}`);
    }
  });
  await page.goto("http://localhost:6006/?path=/story/composer-input-and-send-input--empty");
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = preview.getByRole("button", { name: "Send", exact: true });
  const response = preview.getByRole("button", { name: "Simulate send response", exact: true });
  await editor.fill("Still editable without DEV controls");
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toHaveCount(0);
  await expect(preview.getByText(/^Local simulation\./)).toBeVisible();
  await send.click();
  await expect(editor).toBeEmpty();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toBeEnabled();
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(response).toBeDisabled();
  await editor.fill("Discard on navigation");
  await send.click();
  await response.click();
  await expect(
    preview.getByRole("button", { name: "Simulate runtime confirmation", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Pending input", exact: true }).click();
  await page.getByRole("button", { name: "Browsing", exact: true }).click();
  await page.getByRole("link", { name: "Queued", exact: true }).click();
  await expect(preview.getByRole("textbox", { name: "Main draft", exact: true })).toBeVisible();
  await page.locator('a[href="/?path=/story/composer-input-and-send-input--empty"]').click();
  await expect(editor).toBeEmpty();
  await expect(response).toBeDisabled();
  await expect(
    preview.getByRole("button", { name: "Simulate runtime confirmation", exact: true }),
  ).toBeDisabled();
  expect(productAccesses).toEqual([]);
  expect(businessRequests).toEqual([]);
});
