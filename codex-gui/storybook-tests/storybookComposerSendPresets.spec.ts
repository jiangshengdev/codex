import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("unknown send preset removes only its local record and preserves the separate draft", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-unknown`);
  const unknown = page.getByText("Sending result unknown", { exact: true });
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(unknown).toBeVisible();
  await expect(page.getByText("Review this fictional send.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Removing a local record does not cancel or retract/)).toBeVisible();
  await editor.fill("Keep this separate draft");
  await page.getByRole("button", { name: "Remove local record", exact: true }).click();
  await expect(unknown).toHaveCount(0);
  await expect(editor).toHaveText("Keep this separate draft");
});

test("multiple unknown sends can be removed independently without losing the draft", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-unknown-multiple`,
  );
  const remove = page.getByRole("button", { name: "Remove local record", exact: true });
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
  await editor.fill("Keep this separate draft");
  await remove.nth(1).click();
  await expect(remove).toHaveCount(2);
  await expect(page.getByText(messages[1], { exact: true })).toHaveCount(0);
  await expect(page.getByText(messages[0], { exact: true })).toBeVisible();
  await expect(page.getByText(messages[2], { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Keep this separate draft");
  await remove.first().click();
  await remove.first().click();
  await expect(page.getByText("Sending result unknown", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Keep this separate draft");
});

for (const width of [375, 1280]) {
  for (const preset of ["send-unknown-long-text", "send-unknown-multiple-long-text"]) {
    test(`${preset} keeps long content separated from the notice at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-send--${preset}`);
      const remove = page.getByRole("button", { name: "Remove local record", exact: true });
      const panel = page.getByRole("status").filter({ has: remove });
      const list = panel.getByRole("list");
      const description = panel.getByText(/These messages will not be sent again automatically/);
      await expect(remove).toHaveCount(preset.includes("multiple") ? 3 : 1);
      await expect(list).toContainText("End of the fictional long message.");
      await expect
        .poll(async () => {
          const notice = await description.boundingBox();
          const firstMessage = await list.getByRole("listitem").first().boundingBox();
          return notice != null && firstMessage != null
            ? firstMessage.y - notice.y - notice.height
            : 0;
        })
        .toBeGreaterThanOrEqual(16);
      await expect
        .poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth))
        .toBe(true);
      await remove.first().click();
      await expect(list.getByText(/End of the fictional long message/)).toHaveCount(0);
      await expect(remove).toHaveCount(preset.includes("multiple") ? 2 : 0);
    });
  }

  test(`unknown send action matches recovery button sizing at ${String(width)}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-unknown`);
    const remove = page.getByRole("button", { name: "Remove local record", exact: true });
    await expect(remove).toBeVisible();
    const reference = await context.newPage();
    await reference.setViewportSize({ width, height: 900 });
    await reference.goto(
      `${storybookOrigin}/iframe.html?id=feedback-connection-recovery-states--reconnect-failed`,
    );
    const reconnect = reference.getByRole("button", { name: "Reconnect", exact: true });
    await expect(reconnect).toBeVisible();
    const measureButton = (element: HTMLElement | SVGElement) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    };
    expect(await remove.evaluate(measureButton)).toEqual(await reconnect.evaluate(measureButton));
    for (const button of [remove, reconnect]) {
      await expect
        .poll(() =>
          button.evaluate(
            (element) =>
              element.scrollWidth <= element.clientWidth &&
              element.scrollHeight <= element.clientHeight,
          ),
        )
        .toBe(true);
    }
    const panel = page.getByRole("status").filter({ has: remove });
    await expect(panel).toContainText("Sending result unknown");
    await expect(panel.getByRole("button")).toHaveCount(1);
    await expect
      .poll(() => panel.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
    await reference.close();
  });
}

test("send failure preset preserves unsent content and permits explicit recovery", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-failed`);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const unsent = page.getByText("1 message has not been sent", { exact: true });
  await expect(unsent).toBeVisible();
  await expect(editor).toBeEmpty();
  await editor.fill("Separate draft");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await page.getByRole("button", { name: "Simulate send unknown", exact: true }).click();
  await expect(page.getByText("Review this fictional send.", { exact: true })).toBeVisible();
  await expect(editor).toHaveText("Separate draft");
});

test("send response preset waits for runtime acceptance before enabling Stop", async ({ page }) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-runtime-pending`,
  );
  const runtime = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeDisabled();
  await runtime.click();
  await expect(stop).toBeEnabled();
});

test("send request preset waits for response and then for runtime confirmation", async ({
  page,
}) => {
  await page.goto(
    `${storybookOrigin}/iframe.html?id=composer-input-and-send-send--send-request-pending`,
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const runtime = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await editor.fill("Draft while waiting");
  await response.click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  await runtime.click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(editor).toHaveText("Draft while waiting");
});
