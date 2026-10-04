import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
});

test("new session shortcut opens the real draft and retains it on repeat", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-shortcuts-open--from-task");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shell task one");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Current task draft");
  await editor.press("Meta+Shift+o");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New session");
  await expect(editor).toBeEditable();
  await editor.fill("Unsent new draft");
  await editor.press("Meta+Shift+o");
  await expect(editor).toHaveText("Unsent new draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.keyboard.press("Meta+b");
  await page.getByRole("button", { name: "Current task", exact: true }).click();
  await expect(editor).toHaveText("Current task draft");
  await editor.press("Meta+Shift+o");
  await expect(editor).toHaveText("Unsent new draft");
});

for (const story of ["existing-draft", "already-on-draft", "existing-draft-without-directory"]) {
  test(`${story} reuses the unsent draft`, async ({ page }) => {
    await page.goto(`/iframe.html?id=new-session-shortcuts-open--${story}`);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await menu.press("Meta+Shift+o");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New session");
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveText(
      "Retained new-session draft",
    );
  });
}

test("without a current task the directory still permits a new draft", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-shortcuts-open--no-current-task");
  await page.getByRole("button", { name: "Menu", exact: true }).press("Meta+Shift+o");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New session");
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeEditable();
});

test("missing directory keeps the history page without creating input", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-shortcuts-open--missing-directory");
  await page.getByRole("button", { name: "Menu", exact: true }).press("Meta+Shift+o");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("History");
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(0);
});

test("repeated and composing events preserve the current task draft", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-shortcuts-open--from-task");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Do not navigate or send");
  for (const guard of ["repeat", "isComposing"]) {
    await editor.dispatchEvent("keydown", {
      key: "O",
      metaKey: true,
      shiftKey: true,
      [guard]: true,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shell task one");
    await expect(editor).toHaveText("Do not navigate or send");
  }
});
