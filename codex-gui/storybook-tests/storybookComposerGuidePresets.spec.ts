import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("unknown guide preset supports local removal without losing the draft", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--guide-unknown`);
  const preview = page;
  const unknown = preview.getByText("Guide status unknown", { exact: true });
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(unknown).toBeVisible();
  await expect(preview.getByText("Guide this fictional change.", { exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(
    0,
  );
  await editor.fill("Keep the current draft");
  await preview.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(unknown).toHaveCount(0);
  await expect(editor).toHaveText("Keep the current draft");
});

test("late runtime confirmation clears unknown guidance", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--guide-unknown`);
  const unknown = page.getByText("Guide status unknown", { exact: true });
  await expect(unknown).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(unknown).toHaveCount(0);
});

test("guide failure preset gates a separate draft until explicit recovery", async ({ page }) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--guide-failed`);
  const unsent = page.getByText("1 message has not been sent", { exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const response = page.getByRole("button", { name: "Simulate guide response", exact: true });
  await expect(unsent).toBeVisible();
  await expect(page.getByRole("button", { name: "Priority 1", exact: true })).toHaveCount(0);
  await editor.fill("Separate draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await response.click();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(unsent).toHaveCount(0);
  await expect(editor).toHaveText("Separate draft");
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
});

test("guide refusal preset is priority delivery rather than failure recovery", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--guide-unavailable`,
  );
  const priority = page.getByRole("button", { name: "Priority 1", exact: true });
  await priority.click();
  const dialog = page.getByRole("dialog", { name: "Pending details", exact: true });
  await expect(
    dialog.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Guide this fictional change.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Message Codex", exact: true })
    .fill("Send after priority");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Simulate current turn completed", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send response", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(priority).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
});

test("accepted guide preset stays pending until runtime confirmation", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--guide-runtime-pending`,
  );
  const pending = page.getByRole("button", { name: "Guide 1", exact: true });
  const runtime = page.getByRole("button", {
    name: "Simulate guide runtime confirmation",
    exact: true,
  });
  await expect(pending).toBeVisible();
  await runtime.click();
  await expect(pending).toHaveCount(0);
});

test("guide request preset waits for response and runtime without losing a new draft", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--guide-request-pending`,
  );
  const pending = page.getByRole("button", { name: "Guide 1", exact: true });
  const response = page.getByRole("button", { name: "Simulate guide response", exact: true });
  const runtime = page.getByRole("button", {
    name: "Simulate guide runtime confirmation",
    exact: true,
  });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(pending).toBeVisible();
  await expect(editor).toBeEmpty();
  await editor.fill("Keep the next draft");
  await response.click();
  await expect(pending).toBeVisible();
  await runtime.click();
  await expect(pending).toHaveCount(0);
  await expect(editor).toHaveText("Keep the next draft");
});

test("running text preset enables real Send and Guide while existing RunningGuide owns empty input", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--running-with-input`,
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const guide = page.getByRole("button", { name: "Guide", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(editor).toHaveText("Review this fictional running turn.");
  await expect(send).toBeEnabled();
  await expect(guide).toBeEnabled();
  await expect(stop).toBeEnabled();
  await guide.click();
  await expect(editor).toBeEmpty();
  await editor.fill("Review this fictional running turn.");
  await send.click();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-guide--running-guide`);
  await expect(editor).toBeEmpty();
  await expect(send).toBeDisabled();
  await expect(guide).toBeDisabled();
  await expect(stop).toBeEnabled();
});
