import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("edits queued text without replacing the main draft", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--interactive",
  );
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("combobox", { name: "Edit pending message", exact: true });
  await editor.fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Message cannot be empty");
  await expect(editor).toBeVisible();
  await editor.fill("Revised queued message");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Revised queued message");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toHaveValue(
    "Separate main draft",
  );
});

test("retains failed edits, reports clipboard results, and confirms discard", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--interactive",
  );
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Preserve my revised text");
  await page.getByRole("button", { name: "Simulate editing session lost", exact: true }).click();
  const retained = page.getByRole("textbox", { name: "Unsaved pending message", exact: true });
  await expect(retained).toHaveValue("Preserve my revised text");
  await expect(page.getByRole("alert")).toContainText(
    "This editing session is no longer available.",
  );
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    let clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          clipboardText = text;
          return Promise.resolve();
        },
        readText: () => Promise.resolve(clipboardText),
      },
    });
  });
  await page.getByRole("button", { name: "Copy changes", exact: true }).click();
  await expect(page.getByText("Changes copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Preserve my revised text",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("Clipboard denied")),
      },
    });
  });
  await page.getByRole("button", { name: "Copy changes", exact: true }).click();
  await expect(
    page.getByText("Copy failed. Select the text and copy it manually.", { exact: true }),
  ).toBeVisible();
  await expect(retained).toHaveValue("Preserve my revised text");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Return to edit", exact: true }).click();
  await expect(retained).toBeFocused();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await confirmation.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toHaveValue(
    "Separate main draft",
  );
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 1");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeEnabled();
});

test("cancels edits and keeps or deletes the final queued message", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--interactive",
  );
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Cancelled changes");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Return to edit", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Edit pending message", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 1");
  await expect(page.getByText("Cancelled changes", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 1");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Delete", exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("No pending messages");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toBeFocused();
  await expect(page.getByRole("group", { name: /^Pending:/ })).toHaveCount(0);
});

test("preserves a guiding edit when its target turn closes", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--guiding-target",
  );
  await page
    .getByRole("group", { name: "Pending: Guide 2", exact: true })
    .getByRole("button", { name: "Guide 2", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Guide changes before completion");
  await page.getByRole("button", { name: "Simulate target turn closed", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The target turn closed before the edit was saved.",
  );
  await expect(
    page.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
  ).toHaveValue("Guide changes before completion");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await page
    .getByRole("group", { name: "Pending: Guide 2", exact: true })
    .getByRole("button", { name: "Guide 2", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Guide message 2");
  await expect(
    page.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
  ).toHaveCount(0);
});

test("shows the injected sending conflict without entering an editor", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--sending-conflict",
  );
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This message has entered the sending process and can no longer be managed.",
  );
  await expect(
    page.getByRole("combobox", { name: "Edit pending message", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Ordinary message 1");
});

test("opens editing, deletion confirmation, and retained content as independent states", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-editing--editing");
  await expect(
    page.getByRole("combobox", { name: "Edit pending message", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Edit pending message", exact: true }),
  ).toBeVisible();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--delete-confirmation",
  );
  await expect(page.getByText("Delete this pending message?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(page.getByText("Delete this pending message?", { exact: true })).toBeVisible();
  await page.goto("http://localhost:6006/iframe.html?id=composer-pending-input-editing--retained");
  await expect(
    page.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
  ).toHaveValue("Ordinary message 1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
  ).toHaveValue("Ordinary message 1");
});
