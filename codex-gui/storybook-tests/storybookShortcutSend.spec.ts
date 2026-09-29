import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
});

test("Enter sends the prepared draft once through the real queue", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-send--send");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveText("Review this fictional change.");
  await editor.press("Enter");
  await expect(editor).toBeEmpty();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Current task is in progress", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
});

test("Shift+Enter inserts a newline inside the prepared paragraphs without sending", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=composer-shortcuts-send--newline");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveText("First paragraphSecond paragraph");
  await editor.click();
  await editor.evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    if (text == null) throw new Error("Prepared paragraph is missing");
    window.getSelection()?.setBaseAndExtent(text, 1, text, 1);
  });
  await expect.poll(() => editor.evaluate(() => window.getSelection()?.anchorOffset)).toBe(1);
  await page.keyboard.press("Shift+Enter");
  await expect.poll(() => editor.innerText()).toMatch(/^F\n+irst paragraph\n+Second paragraph$/);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(
    page.getByRole("status", { name: "Current task is idle", exact: true }),
  ).toBeVisible();
});

for (const story of ["empty", "whitespace"]) {
  test(`${story} cannot send`, async ({ page }) => {
    await page.goto(`/iframe.html?id=composer-shortcuts-send--${story}`);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    const before = await editor.textContent();
    await editor.press("Enter");
    await expect(editor).toHaveText(before ?? "");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("status", { name: "Current task is idle", exact: true }),
    ).toBeVisible();
  });
}

test("unavailable input retains its text and cannot send", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-send--input-unavailable");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await editor.press("Enter");
  await expect(editor).toHaveText("Review this fictional change.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("Enter during a running turn queues the ordinary message", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-send--running-queue");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.press("Enter");
  await expect(editor).toBeEmpty();
  await page.getByRole("button", { name: "Queued 1", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("group", { name: "Review this fictional change.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Guide 1", exact: true })).toHaveCount(0);
});

test("send Tooltip exposes Enter through hover and keyboard focus", async ({ page }) => {
  await page.goto("/iframe.html?id=composer-shortcuts-send--send");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeEnabled();
  await page.getByRole("combobox", { name: "Message Codex", exact: true }).click();
  await send.hover();
  const tooltip = page.getByRole("tooltip", { name: "Enter", exact: true });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("↵");
  await expect(send).toHaveAccessibleDescription("Enter");
  await expect(send).toHaveAttribute("aria-keyshortcuts", "Enter");
  await expect(send).not.toHaveAttribute("title");
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await send.focus();
  // Stay in the composer: tabbing forward into the story controls scrolls the
  // page, whose delayed scroll event can dismiss the tooltip after refocusing.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(send).toBeFocused();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("↵");
  await expect(send).toHaveAccessibleDescription("Enter");
});

test("simulated composing Enter preserves the draft", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "vendor", { get: () => "Apple Computer, Inc." });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });
  });
  await page.goto("/iframe.html?id=composer-shortcuts-send--composition-guard");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.click();
  await editor.dispatchEvent("compositionstart", { data: "" });
  await editor.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    isComposing: true,
  });
  await expect(editor).toHaveText("保留这段输入");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Current task is idle", exact: true }),
  ).toBeVisible();
  // Composition-end consumption is covered at the approved lower seam in
  // ComposerEditorLifecycle.browser.test.tsx. Synthetic DOM events alone leave
  // Lexical in its Safari ending-composition phase; they are not a native IME session.
});
