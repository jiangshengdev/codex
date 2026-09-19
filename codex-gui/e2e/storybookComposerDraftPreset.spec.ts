import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("saving failure opens with retained text and skill, recovers, and resets to failure", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send--saving-failed");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const failure = page.getByText("Changes could not be saved", { exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(failure).toBeVisible();
  await expect(editor).toContainText("Review this fictional change.");
  await expect(
    page.getByRole("group", { name: "preview-review skill details", exact: true }),
  ).toBeVisible();
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(failure).toBeVisible();
  await page.getByRole("button", { name: "Restore simulated storage", exact: true }).click();
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(failure).toHaveCount(0);
  await editor.pressSequentially(" Keep this edit.");
  await page.getByRole("button", { name: "Simulate leaving", exact: true }).click();
  await page.getByRole("button", { name: "Simulate returning", exact: true }).click();
  await expect(editor).toContainText("Keep this edit.");
  await expect(failure).toHaveCount(0);
  await send.click();
  await expect(editor).toBeEmpty();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(failure).toBeVisible();
  await expect(editor).not.toContainText("Keep this edit.");
  await expect(send).toBeDisabled();
});
