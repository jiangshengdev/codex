import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("unknown send preset never resends and removes only its local record", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-unknown",
  );
  const unknown = page.getByText("Sending result unknown", { exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(unknown).toBeVisible();
  await expect(page.getByText("Review this fictional send.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Removing a local record does not cancel or retract/)).toBeVisible();
  await expect(response).toBeDisabled();
  await editor.fill("Keep this separate draft");
  await page.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(unknown).toHaveCount(0);
  await expect(response).toBeDisabled();
  await expect(editor).toHaveText("Keep this separate draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(response).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unknown).toBeVisible();
  await expect(response).toBeDisabled();
});

test("multiple unknown sends can be removed independently without resending or losing the draft", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-unknown-multiple",
  );
  const remove = page.getByRole("button", { name: "Remove local record", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const messages = [
    "Review the fictional implementation.",
    "Check the fictional tests and edge cases.",
    "Summarize the fictional changes and remaining questions.",
  ] as const;
  await expect(remove).toHaveCount(3);
  for (const message of messages) {
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  }
  await expect(response).toBeDisabled();
  await editor.fill("Keep this separate draft");
  await remove.nth(1).click();
  await expect(remove).toHaveCount(2);
  await expect(page.getByText(messages[1], { exact: true })).toHaveCount(0);
  await expect(page.getByText(messages[0], { exact: true })).toBeVisible();
  await expect(page.getByText(messages[2], { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Keep this separate draft");
  await expect(response).toBeDisabled();
  await remove.first().click();
  await remove.first().click();
  await expect(page.getByText("Sending result unknown", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Keep this separate draft");
  await expect(response).toBeDisabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(remove).toHaveCount(3);
  await expect(editor).toBeEmpty();
  await expect(response).toBeDisabled();
});

for (const width of [375, 1280]) {
  test(`unknown send action matches recovery button sizing at ${String(width)}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-unknown",
    );
    const remove = page.getByRole("button", { name: "Remove local record", exact: true });
    await expect(remove).toBeVisible();
    const reference = await context.newPage();
    await reference.setViewportSize({ width, height: 900 });
    await reference.goto(
      "http://localhost:6006/iframe.html?id=feedback-connection-recovery-states--reconnect-failed",
    );
    const reconnect = reference.getByRole("button", { name: "Reconnect", exact: true });
    await expect(reconnect).toBeVisible();
    const measureButton = (element: HTMLElement | SVGElement) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        padding: style.padding,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    };
    expect(await remove.evaluate(measureButton)).toEqual(await reconnect.evaluate(measureButton));
    const panel = page.getByRole("status").filter({ has: remove });
    await expect(panel).toContainText("Sending result unknown");
    await expect(panel.getByRole("button")).toHaveCount(1);
    await expect
      .poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Simulate send response", exact: true }),
    ).toBeDisabled();
    await reference.close();
  });
}

test("send failure preset preserves unsent content and permits explicit recovery", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-failed");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const unsent = page.getByText("1 message has not been sent", { exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  await expect(unsent).toBeVisible();
  await expect(editor).toBeEmpty();
  await editor.fill("Separate draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(response).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(response).toBeEnabled();
  await page.getByRole("button", { name: "Simulate send unknown", exact: true }).click();
  await expect(page.getByText("Review this fictional send.", { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Separate draft");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(unsent).toBeVisible();
  await expect(editor).toBeEmpty();
});

test("send response preset opens before runtime acceptance and restarts at that boundary", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-runtime-pending",
  );
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const runtime = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(
    page.getByText("Response received; waiting for runtime confirmation", { exact: true }),
  ).toBeVisible();
  await expect(response).toBeDisabled();
  await expect(stop).toBeDisabled();
  await runtime.click();
  await expect(stop).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(runtime).toBeEnabled();
  await expect(stop).toBeDisabled();
});

test("send request preset waits for response and then for runtime confirmation", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-send--send-request-pending",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const runtime = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  await expect(page.getByText("Waiting for send response", { exact: true })).toBeVisible();
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(runtime).toBeDisabled();
  await editor.fill("Draft while waiting");
  await response.click();
  await expect(
    page.getByText("Response received; waiting for runtime confirmation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  await runtime.click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(editor).toHaveText("Draft while waiting");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(response).toBeEnabled();
  await expect(runtime).toBeDisabled();
  await expect(editor).toBeEmpty();
});
