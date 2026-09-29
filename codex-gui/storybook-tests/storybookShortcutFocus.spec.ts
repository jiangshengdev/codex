import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
});

test("menu shortcut restores the real Composer focus", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-focus--toggle-menu");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Keep this draft");
  await editor.press("Meta+b");
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  const close = page.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS("outline-style", "none");
  await expect(close).not.toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText("Keep this draft");
});

test("pointer opening and repeated shortcut closing preserve page focus", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-focus--toggle-menu");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const close = page.getByRole("button", { name: "Close", exact: true });
  await menu.click();
  await expect(close).toBeFocused();
  await expect(close).toHaveCSS("outline-style", "none");
  await expect(close).toHaveCSS("box-shadow", "none");
  await close.click();
  await expect(menu).toBeFocused();
  await menu.press("Meta+b");
  await expect(close).toBeFocused();
  await page.keyboard.press("Meta+b");
  await expect(close).toBeHidden();
  await expect(menu).toBeFocused();
});

for (const story of ["focus-composer", "focus-new-draft"]) {
  test(`${story} focuses an editable input with a visible frame`, async ({ page }) => {
    await page.goto(`/iframe.html?id=app-shell-shortcuts-focus--${story}`);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toBeEditable();
    await menu.focus();
    await menu.press("Meta+Shift+e");
    await expect(editor).toBeFocused();
    await expect(page.locator(".composer-panel")).not.toHaveCSS("box-shadow", "none");
    await expect(page.locator(".composer-panel")).not.toHaveAttribute("title");
  });
}

for (const story of ["input-unavailable", "page-without-composer"]) {
  test(`${story} does not move focus into an unavailable input`, async ({ page }) => {
    await page.goto(`/iframe.html?id=app-shell-shortcuts-focus--${story}`);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await menu.focus();
    await menu.press("Meta+Shift+e");
    await expect(menu).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("menu Tooltip describes the same keyboard binding on hover and focus", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-focus--toggle-menu");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeEditable();
  await page.mouse.move(800, 600);
  await menu.hover();
  const tooltip = page.getByRole("tooltip", { name: "Command+B", exact: true });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("⌘B");
  await expect(menu).toHaveAccessibleDescription("Command+B");
  await expect(menu).toHaveAttribute("aria-keyshortcuts", "Meta+B");
  await expect(menu).not.toHaveAttribute("title");
  await page.mouse.move(800, 600);
  await expect(tooltip).toBeHidden();
  await menu.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(menu).toBeFocused();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("⌘B");
  await expect(menu).toHaveAccessibleDescription("Command+B");
});

test("application shortcuts ignore consumed, composing, repeated and AltGraph events", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-focus--toggle-menu");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Protected draft");
  for (const guard of ["repeat", "isComposing", "consumed", "AltGraph", "composition"]) {
    await editor.evaluate((element, guard) => {
      if (guard === "composition")
        element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      const event = new KeyboardEvent("keydown", {
        key: "b",
        metaKey: true,
        bubbles: true,
        cancelable: true,
        repeat: guard === "repeat",
        isComposing: guard === "isComposing",
      });
      if (guard === "consumed") event.preventDefault();
      if (guard === "AltGraph")
        Object.defineProperty(event, "getModifierState", {
          value: (key: string) => key === "AltGraph",
        });
      element.dispatchEvent(event);
      if (guard === "composition")
        element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    }, guard);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editor).toHaveText("Protected draft");
  }
  await editor.press("Meta+b");
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
});
