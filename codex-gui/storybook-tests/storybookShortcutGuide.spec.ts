import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
});

test("empty input promotes the first ordinary queued message to Guide", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--promote-queued-message");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await editor.press("Meta+Enter");
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Guide 1", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("group", { name: "Promote this ordinary queued message.", exact: true }),
  ).toBeVisible();
});

test("empty input without queued messages does not guide", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--empty");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.press("Meta+Enter");
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
});

test("without an active turn Command+Enter preserves the draft rather than sending", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--no-active-turn");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.press("Meta+Enter");
  await expect(editor).toHaveText("Review this fictional running turn.");
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(
    page.getByRole("status", { name: "Current task is idle", exact: true }),
  ).toBeVisible();
});

test("unavailable input ignores Command+Enter", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--input-unavailable");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await editor.press("Meta+Enter");
  await expect(editor).toHaveText("Review this fictional running turn.");
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toHaveCount(0);
});

test("recovery blocks guidance and preserves the separate draft", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--recovery-blocked");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await editor.fill("Retained during recovery");
  await editor.press("Meta+Enter");
  await expect(editor).toHaveText("Retained during recovery");
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeDisabled();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
});

test("Guide Tooltip describes Command+Enter on hover and keyboard focus", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--guide");
  const guide = page.getByRole("button", { name: "Guide", exact: true });
  await expect(guide).toBeEnabled();
  await page.getByRole("combobox", { name: "Message Codex", exact: true }).click();
  await guide.hover();
  const tooltip = page.getByRole("tooltip", { name: "Command+Enter", exact: true });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/^⌘\s*↵$/);
  await expect(guide).toHaveAccessibleDescription("Command+Enter");
  await expect(guide).toHaveAttribute("aria-keyshortcuts", "Meta+Enter");
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await guide.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(guide).toBeFocused();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(/^⌘\s*↵$/);
  await expect(guide).toHaveAccessibleDescription("Command+Enter");
});

test("simulated composition suppresses guidance", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--composition-guard");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.click();
  await editor.dispatchEvent("compositionstart", { data: "" });
  await editor.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    metaKey: true,
    isComposing: true,
  });
  await expect(editor).toHaveText("Review this fictional running turn.");
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toHaveCount(0);
  // Immediate composition-end Enter consumption is covered by
  // ComposerEditorLifecycle.browser.test.tsx, including guide intent.
});

test("Command+Enter guides the running turn and preserves a separate later draft", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=composer-shortcuts-guide--guide");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveText("Review this fictional running turn.");
  await editor.press("Meta+Enter");
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toBeVisible();
  await editor.fill("Later draft");
  await page.getByRole("button", { name: "Simulate guide response", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Later draft");
});
