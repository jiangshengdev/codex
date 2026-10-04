import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("initial input remains editable before the first send", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-flow--initial-input&viewMode=story");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toHaveText("Review the fictional project.");
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "0",
  );
  await editor.fill("Review the revised fictional project.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
    "data-new-session-input",
    JSON.stringify([
      { type: "text", text: "Review the revised fictional project.", text_elements: [] },
    ]),
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
});

test("missing directory prevents opening a new-session composer", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-flow--missing-directory&viewMode=story");
  await expect(
    page.getByText("A working directory is required to start a session.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "0",
  );
});

test("whitespace input cannot start a session with the button or Enter", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-flow--blank-input&viewMode=story");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await editor.press("Enter");
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "0",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "0",
  );
});

for (const phase of ["creating", "activating"]) {
  test(`${phase} retains the input and blocks duplicate submission`, async ({ page }) => {
    await page.goto(`/iframe.html?id=new-session-flow--${phase}&viewMode=story`);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    const sending = page.getByRole("button", { name: "Sending", exact: true });
    await expect(sending).toBeDisabled();
    await expect(editor).toHaveText("Review the fictional project.");
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await editor.press("Enter");
    await editor.press("Enter");
    await expect(sending).toBeDisabled();
    await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
      "data-new-session-starts",
      "1",
    );
    await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
      "data-new-session-sends",
      "0",
    );
  });
}

for (const failure of ["creation-failed", "creation-unknown"]) {
  test(`${failure} retains input and retries creation only on explicit Send`, async ({ page }) => {
    await page.goto(`/iframe.html?id=new-session-flow--${failure}&viewMode=story`);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText(
      failure === "creation-unknown"
        ? "The creation result is unknown. Retrying may leave an extra empty session."
        : "Your input is retained. Retry to continue.",
    );
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveText(
      "Review the fictional project.",
    );
    await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
      "data-new-session-starts",
      "1",
    );
    await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
      "data-new-session-sends",
      "0",
    );
    await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
    await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
      "data-new-session-route",
      "/task/00000000-0000-0000-0000-000000000138",
    );
    await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
      "data-new-session-starts",
      "2",
    );
    await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
      "data-new-session-sends",
      "1",
    );
    await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
      "data-new-session-input",
      JSON.stringify([{ type: "text", text: "Review the fictional project.", text_elements: [] }]),
    );
  });
}

test("new session sends the first input and opens the real task page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=new-session-flow--interactive&viewMode=story");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Working directory: example-project" }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Working directory", exact: true })).toContainText(
    "/storybook/workspaces/example-project",
  );
  await page.keyboard.press("Escape");
  await editor.fill("Review the fictional project.");
  await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
  await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
    "data-new-session-input",
    JSON.stringify([{ type: "text", text: "Review the fictional project.", text_elements: [] }]),
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("handoff rejection retains input until explicit simulation recovery and page retry", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=new-session-flow--handoff-rejected&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Your input is retained. Retry to continue.");
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "0",
  );
  await page.getByRole("button", { name: "View diagnostic information" }).press("Enter");
  await expect(page.getByRole("dialog")).toContainText("persistenceFailed");
  await page.getByRole("button", { name: "Close diagnostics" }).click();
  await page.getByRole("button", { name: "Simulate storage recovery", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
});

test("unknown handoff blocks resubmission and opens the existing task", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-flow--handoff-unknown&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Input handoff could not be confirmed.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Message Codex", exact: true }).press("Enter");
  await page.getByRole("button", { name: "View diagnostic information" }).press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Simulated unknown input handoff");
  await page.getByRole("button", { name: "Close diagnostics" }).click();
  await page.getByRole("button", { name: "Open session", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
});

test("activation failure retains the input and retries the existing session", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-flow--activation-failed&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Your input is retained. Retry to continue.");
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveText(
    "Review the fictional project.",
  );
  await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
});

test("fresh mounts isolate drafts and session requests from another preview", async ({
  page,
  context,
}) => {
  const url = "/iframe.html?id=new-session-flow--interactive&viewMode=story";
  await page.goto(url);
  await page
    .getByRole("combobox", { name: "Message Codex", exact: true })
    .fill("First preview draft");
  const independent = await context.newPage();
  await independent.goto(url);
  const independentEditor = independent.getByRole("combobox", {
    name: "Message Codex",
    exact: true,
  });
  await expect(independentEditor).toBeEmpty();
  await expect(independent.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
  await expect(independent.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "0",
  );
  await expect(independentEditor).toBeEmpty();

  // Remount is scenario preparation; the assertions cover the fresh product session.
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toBeEmpty();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await editor.fill("Fresh preview input");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
    "data-new-session-input",
    JSON.stringify([{ type: "text", text: "Fresh preview input", text_elements: [] }]),
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
  await expect(independent.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "0",
  );
  await independent.close();
});

test.describe("Chinese failure preview", () => {
  test.use({ locale: "zh-CN" });

  test("retained input and keyboard diagnostics fit narrow and desktop themes", async ({
    page,
  }) => {
    await page.goto("/iframe.html?id=new-session-flow--activation-failed&viewMode=story");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("无法开始对话");
    await expect(alert).toContainText("输入内容已保留。重试以继续。");
    const trigger = alert.getByRole("button", { name: "查看诊断信息" });
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        await expect(
          page.getByRole("combobox", { name: "向 Codex 发送消息", exact: true }),
        ).toHaveText("Review the fictional project.");
        await expect(page.getByRole("button", { name: "发送", exact: true })).toBeEnabled();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect
          .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
          .toBe(true);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
  });
});
