import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("unknown guide preset supports hidden DEV local removal, reset, late facts and story isolation", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/?path=/story/composer-input-and-send-guide--guide-unknown",
  );
  const preview = page.frameLocator("#storybook-preview-iframe");
  const unknown = preview.getByText("Guide status unknown", { exact: true });
  const response = preview.getByRole("button", { name: "Simulate guide response", exact: true });
  const runtime = preview.getByRole("button", {
    name: "Simulate guide runtime confirmation",
    exact: true,
  });
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(unknown).toBeVisible();
  await expect(preview.getByText("Guide this fictional change.", { exact: true })).toBeVisible();
  await expect(response).toBeDisabled();
  await expect(preview.getByRole("button", { name: "Continue sending", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toHaveCount(0);
  await editor.fill("Keep the current draft");
  await preview.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(unknown).toHaveCount(0);
  await expect(editor).toHaveText("Keep the current draft");
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(response).toBeDisabled();
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unknown).toBeVisible();
  await runtime.click();
  await expect(unknown).toHaveCount(0);
  await preview.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unknown).toBeVisible();
  await page.getByRole("button", { name: "Input", exact: true }).click();
  await page.getByRole("link", { name: "Empty", exact: true }).click();
  await expect(unknown).toHaveCount(0);
  await expect(editor).toBeEmpty();
  await page.getByRole("link", { name: "Guide Unknown", exact: true }).click();
  await expect(unknown).toBeVisible();
  await expect(response).toBeDisabled();
  await expect(runtime).toBeEnabled();
});

test("guide failure preset gates a separate draft until explicit recovery", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--guide-failed",
  );
  const unsent = page.getByText("1 message has not been sent", { exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const response = page.getByRole("button", { name: "Simulate guide response", exact: true });
  await expect(unsent).toBeVisible();
  await expect(page.getByRole("heading", { name: "Will send first", exact: true })).toHaveCount(0);
  await editor.fill("Separate draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeDisabled();
  await expect(response).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await response.click();
  await page
    .getByRole("button", { name: "Simulate guide runtime confirmation", exact: true })
    .click();
  await expect(unsent).toHaveCount(0);
  await expect(editor).toHaveText("Separate draft");
  await expect(page.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unsent).toBeVisible();
  await expect(editor).toBeEmpty();
});

test("guide refusal preset is priority delivery rather than failure recovery", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--guide-unavailable",
  );
  const priority = page.getByRole("heading", { name: "Will send first", exact: true });
  await expect(priority).toBeVisible();
  await expect(
    page.getByText("Currently unable to guide; added to queue", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Guide this fictional change.", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(priority).toBeVisible();
});

test("accepted guide preset opens pending runtime and retains manual confirmation after reset", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--guide-runtime-pending",
  );
  const pending = page.getByRole("button", { name: "Guide 1", exact: true });
  const response = page.getByRole("button", { name: "Simulate guide response", exact: true });
  const runtime = page.getByRole("button", {
    name: "Simulate guide runtime confirmation",
    exact: true,
  });
  await expect(pending).toBeVisible();
  await expect(response).toBeDisabled();
  await runtime.click();
  await expect(pending).toHaveCount(0);
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(pending).toBeVisible();
  await expect(response).toBeDisabled();
  await expect(runtime).toBeEnabled();
});

test("guide request preset waits for response and runtime without losing a new draft", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--guide-request-pending",
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
  await expect(response).toBeEnabled();
  await expect(runtime).toBeDisabled();
  await editor.fill("Keep the next draft");
  await response.click();
  await expect(pending).toBeVisible();
  await expect(response).toBeDisabled();
  await runtime.click();
  await expect(pending).toHaveCount(0);
  await expect(editor).toHaveText("Keep the next draft");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(pending).toBeVisible();
  await expect(response).toBeEnabled();
  await expect(runtime).toBeDisabled();
});

test("running text preset enables real Send and Guide while existing RunningGuide owns empty input", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--running-with-input",
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
  await expect(
    page.getByRole("button", { name: "Simulate guide response", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toHaveText("Review this fictional running turn.");
  await send.click();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-guide--running-guide",
  );
  await expect(editor).toBeEmpty();
  await expect(send).toBeDisabled();
  await expect(guide).toBeDisabled();
  await expect(stop).toBeEnabled();
});
