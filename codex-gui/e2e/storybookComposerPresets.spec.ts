import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("presets retain product interaction with DEV hidden and reset when switching stories", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/?path=/story/composer-input-and-send-draft--invalid-skill",
  );
  const preview = page.frameLocator("#storybook-preview-iframe");
  const editor = preview.getByRole("combobox", { name: "Message Codex", exact: true });
  const invalid = preview.getByRole("group", {
    name: "preview-review skill details, Invalid skill",
    exact: true,
  });
  const send = preview.getByRole("button", { name: "Send", exact: true });
  await expect(invalid).toBeVisible();
  await preview.getByRole("radio", { name: "Dark theme", exact: true }).click();
  await expect(preview.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: "Restart simulation", exact: true }),
  ).toHaveCount(0);
  await invalid.click();
  await editor.press("Backspace");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(editor).toBeEmpty();
  await page.getByRole("button", { name: "Input", exact: true }).click();
  await page.getByRole("link", { name: "Valid Text", exact: true }).click();
  await expect(editor).toHaveText("Review this fictional change.");
  await expect(send).toBeEnabled();
  await page.getByRole("link", { name: "Invalid Skill", exact: true }).click();
  await expect(invalid).toBeVisible();
  await expect(send).toBeDisabled();
  await page.getByRole("switch", { name: "Show DEV controls", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeDisabled();
});

test.describe("localized presets", () => {
  test.use({ locale: "zh-CN" });

  test("invalid skill keeps the existing Chinese product messages", async ({ page }) => {
    await page.goto(
      "http://localhost:6006/iframe.html?id=composer-input-and-send-draft--invalid-skill",
    );
    await expect(
      page.getByRole("combobox", { name: "向 Codex 发送消息", exact: true }),
    ).toContainText("Review this fictional change.");
    await expect(page.getByRole("group", { name: /preview-review.*无效技能/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "发送", exact: true })).toBeDisabled();
  });
});

test("invalid skill opens blocked and can be restored or removed without losing text", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-draft--invalid-skill",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const invalid = page.getByRole("group", {
    name: "preview-review skill details, Invalid skill",
    exact: true,
  });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(editor).toContainText("Review this fictional change.");
  await expect(invalid).toBeVisible();
  await expect(send).toBeDisabled();
  await editor.pressSequentially(" More context.");
  await expect(editor).toContainText("More context.");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Restore simulated skill", exact: true }).click();
  await expect(invalid).toHaveCount(0);
  await expect(send).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(invalid).toBeVisible();
  await expect(editor).not.toContainText("More context.");
  await expect(send).toBeDisabled();
  await invalid.click();
  await editor.press("Backspace");
  await expect(invalid).toHaveCount(0);
  await expect(editor).toContainText("Review this fictional change.");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(editor).toBeEmpty();
});

test("long content opens with bounded scrolling and reachable controls on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-input-and-send-input--long-content",
  );
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("Review section 1:");
  await expect(editor).toContainText("Review section 20:");
  await expect
    .poll(() => editor.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  const bounds = await editor.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.height).toBeLessThanOrEqual(208);
  await expect
    .poll(() => editor.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    .toBe(true);
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeInViewport();
  await expect(send).toBeEnabled();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeInViewport();
  await editor.hover();
  // Browsers can clamp a single wheel delta; keep scrolling until the first paragraph is reached.
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, -1000);
        return editor.evaluate((element) => element.scrollTop);
      },
      { intervals: [100] },
    )
    .toBe(0);
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await editor.focus();
  await editor.pressSequentially(" More context.");
  await expect(editor).toContainText("More context.");
  await send.click();
  await expect(editor).toBeEmpty();
});

test("valid text opens ready to send without inserting content first", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send-input--valid-text");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveText("Review this fictional change.");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(editor).toBeEmpty();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
});

test("whitespace opens directly with sending disabled and remains editable after reset", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=composer-input-and-send-input--whitespace");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(editor).toHaveText(/^ {3}$/);
  await expect(send).toBeDisabled();
  await editor.fill("Continue from the preset");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(editor).toHaveText(/^ {3}$/);
  await expect(send).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Simulate send response", exact: true }),
  ).toBeDisabled();
});
