import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
});

test("previous wraps at the first task and next wraps at the last", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-tasks--previous-task");
  const heading = page.getByRole("heading", { level: 1 });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(heading).toHaveText("Shell task one");
  await menu.press("Control+Meta+k");
  await expect(heading).toHaveText("Shell task 3");
  await menu.press("Control+Meta+j");
  await expect(heading).toHaveText("Shell task one");
  await menu.click();
  await expect(
    page.getByRole("region", { name: "Active tasks" }).getByRole("listitem"),
  ).toContainText(["Shell task one", "Shell task 2", "Shell task 3"]);
});

for (const [key, title] of [
  ["k", "Shell task 3"],
  ["j", "Shell task 2"],
] as const) {
  test(`cycling ${key} from History uses the last viewed task`, async ({ page }) => {
    await page.goto("/iframe.html?id=app-shell-shortcuts-tasks--from-history");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("History");
    await page.getByRole("button", { name: "Menu", exact: true }).press(`Control+Meta+${key}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeEditable();
  });
}

test("zero tasks leave History unchanged", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-tasks--no-tasks");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.press("Control+Meta+k");
  await menu.press("Control+Meta+j");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("History");
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(0);
});

test("one task preserves its draft and does not send on cycling", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-tasks--one-task");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Only task draft");
  await editor.press("Control+Meta+j");
  await editor.press("Control+Meta+k");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shell task one");
  await expect(editor).toHaveText("Only task draft");
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
});

test("task cycling ignores composing and repeated keydown", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-tasks--next-task");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Keep this draft");
  for (const key of ["j", "k"]) {
    for (const guard of ["repeat", "isComposing"]) {
      await editor.dispatchEvent("keydown", { key, ctrlKey: true, metaKey: true, [guard]: true });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shell task one");
      await expect(editor).toHaveText("Keep this draft");
    }
  }
});

test("next task shortcut changes the visible task and retains drafts", async ({ page }) => {
  await page.goto("/iframe.html?id=app-shell-shortcuts-tasks--next-task");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Shell task one");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Draft for task one");
  await editor.press("Control+Meta+j");
  await expect(heading).toHaveText("Shell task 2");
  await expect(editor).toBeEmpty();
  await editor.fill("Draft for task two");
  await editor.press("Control+Meta+k");
  await expect(heading).toHaveText("Shell task one");
  await expect(editor).toHaveText("Draft for task one");
});
