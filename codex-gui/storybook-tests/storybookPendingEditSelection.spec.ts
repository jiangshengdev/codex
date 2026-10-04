import { expect, test } from "@playwright/test";
import { storybookOrigin } from "./servers";

test.use({ locale: "en" });

test("clearing and undoing an invalid pending skill preserves validation and recovery", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-queue--running-queue`);
  await page.getByRole("combobox", { name: "Message Codex", exact: true }).fill("$preview");
  await page.getByRole("option", { name: /preview-review/ }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Simulate skill unavailable", exact: true }).click();
  await page.getByRole("button", { name: "Queued 1", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Remove or replace invalid skills before saving.",
  );
  const editor = page.getByRole("combobox", { name: "Edit pending message", exact: true });
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();

  // Exercise fill's native Delete path repeatedly, including the stale caret after undo.
  for (let iteration = 0; iteration < 150; iteration++) {
    await editor.press("ArrowRight");
    await editor.fill("");
    await expect(editor).toBeEmpty();
    await expect(save).toBeEnabled();
    await editor.press("ControlOrMeta+z");
    await expect(editor).toContainText("$preview-review");
    await expect(save).toBeDisabled();
  }
  await editor.fill("");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("Message cannot be empty");
  await editor.fill("Recovered pending message");
  await save.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Recovered pending message");
});
